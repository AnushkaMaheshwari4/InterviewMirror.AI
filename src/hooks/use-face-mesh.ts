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
        // Iris landmarks: left iris center 468, right iris center 473.
        // Eye corners: left eye outer 33, inner 133; right outer 263, inner 362.
        const li = face[468];
        const ri = face[473];
        const leftOuter = face[33];
        const leftInner = face[133];
        const rightOuter = face[263];
        const rightInner = face[362];

        // Horizontal ratio (0 = far left in eye, 1 = far right)
        const lr = (li.x - leftOuter.x) / (leftInner.x - leftOuter.x + 1e-6);
        const rr = (ri.x - rightInner.x) / (rightOuter.x - rightInner.x + 1e-6);
        const horiz = (lr + rr) / 2; // ~0.5 means centered

        // Head yaw proxy: midpoint of eyes vs nose tip (1)
        const nose = face[1];
        const eyeMidX = (leftOuter.x + rightOuter.x) / 2;
        const yawOffset = Math.abs(nose.x - eyeMidX); // ~0 when facing camera

        const horizOk = Math.abs(horiz - 0.5) < 0.18;
        const yawOk = yawOffset < 0.04;
        const engaged = horizOk && yawOk;

        samplesRef.current.total += 1;
        if (engaged) samplesRef.current.engaged += 1;
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
