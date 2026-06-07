import { useCallback, useEffect, useRef, useState } from "react";

// Lightweight wrapper around MediaPipe FaceLandmarker for live eye-contact
// estimation. Eye contact is approximated by checking the iris center
// position vs the eye corners (gaze roughly forward) AND head pose roughly
// forward. Returns a 0-100 rolling percentage.

type Landmarker = {
  detectForVideo: (video: HTMLVideoElement, ts: number) => {
    faceLandmarks: Array<Array<{ x: number; y: number; z: number }>>;
    facialTransformationMatrixes?: Array<{ data: number[] }>;
  };
  close: () => void;
};

export function useFaceMesh(videoRef: React.RefObject<HTMLVideoElement | null>, active: boolean) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [eyeContactPct, setEyeContactPct] = useState<number | null>(null);
  const landmarkerRef = useRef<Landmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const samplesRef = useRef<{ total: number; engaged: number }>({ total: 0, engaged: 0 });

  // Initialize landmarker
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
        );
        const lm = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
        if (cancelled) {
          lm.close();
          return;
        }
        landmarkerRef.current = lm as unknown as Landmarker;
        setSupported(true);
      } catch (err) {
        console.error("FaceMesh init failed", err);
        setSupported(false);
      }
    })();
    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [active]);

  // Detection loop
  const tick = useCallback(() => {
    const video = videoRef.current;
    const lm = landmarkerRef.current;
    if (!video || !lm || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    try {
      const result = lm.detectForVideo(video, performance.now());
      const face = result.faceLandmarks?.[0];
      if (face && face.length > 470) {
        // MediaPipe FaceLandmarker iris/eye landmarks (468-pt mesh + iris):
        //   468 = left iris center,  473 = right iris center
        //    33 = left eye outer corner,  133 = left eye inner corner
        //   263 = right eye outer corner, 362 = right eye inner corner
        //   159/145 = left eye upper/lower lid, 386/374 = right upper/lower lid
        //     1 = nose tip
        //
        // Eye contact = iris centered horizontally AND vertically within the
        // eye opening AND head facing the camera (low yaw). All thresholds
        // are normalized to landmark units (0..1 of frame). A frame counts
        // as "engaged" only when ALL three conditions hold; the displayed
        // percentage is engaged_frames / total_frames over the question.
        const li = face[468];
        const ri = face[473];
        const lOut = face[33], lIn = face[133];
        const rOut = face[263], rIn = face[362];
        const lUp = face[159], lLo = face[145];
        const rUp = face[386], rLo = face[374];

        // Horizontal iris position inside each eye (0=outer corner, 1=inner)
        const lh = (li.x - lOut.x) / (lIn.x - lOut.x + 1e-6);
        const rh = (ri.x - rIn.x) / (rOut.x - rIn.x + 1e-6);
        const horiz = (lh + rh) / 2; // ~0.5 = looking straight ahead

        // Vertical iris position inside each eye (0=upper lid, 1=lower lid)
        const lv = (li.y - lUp.y) / (lLo.y - lUp.y + 1e-6);
        const rv = (ri.y - rUp.y) / (rLo.y - rUp.y + 1e-6);
        const vert = (lv + rv) / 2; // ~0.5 = centered; >0.6 = looking down

        // Head yaw proxy: nose tip offset from eye midpoint
        const nose = face[1];
        const eyeMidX = (lOut.x + rOut.x) / 2;
        const yawOffset = Math.abs(nose.x - eyeMidX);

        const horizOk = Math.abs(horiz - 0.5) < 0.15;
        const vertOk = vert > 0.25 && vert < 0.7; // not looking down/up
        const yawOk = yawOffset < 0.03;
        const engaged = horizOk && vertOk && yawOk;

        samplesRef.current.total += 1;
        if (engaged) samplesRef.current.engaged += 1;
        const pct = (samplesRef.current.engaged / samplesRef.current.total) * 100;
        setEyeContactPct(pct);
      } else {
        // No face detected this frame — count as not engaged.
        samplesRef.current.total += 1;
        const pct = (samplesRef.current.engaged / samplesRef.current.total) * 100;
        setEyeContactPct(pct);
      }
    } catch {
      /* ignore per-frame errors */
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [videoRef]);

  useEffect(() => {
    if (!active || supported !== true) return;
    samplesRef.current = { total: 0, engaged: 0 };
    setEyeContactPct(null);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active, supported, tick]);

  const reset = useCallback(() => {
    samplesRef.current = { total: 0, engaged: 0 };
    setEyeContactPct(null);
  }, []);

  return { supported, eyeContactPct, reset };
}
