import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Camera,
  CameraOff,
  Eye,
  Gauge,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  PictureInPicture2,
  RotateCcw,
  Sparkles,
  StopCircle,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFaceMesh } from "@/hooks/use-face-mesh";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { generateQuestions, scoreInterview } from "@/lib/interview.functions";
import { countFillers, countWords, dedupeTranscript, wpm } from "@/lib/interview-utils";

export const Route = createFileRoute("/interview")({
  head: () => ({
    meta: [
      { title: "Live Interview — InterviewMirror AI" },
      { name: "description", content: "Run a live AI-coached interview session." },
    ],
  }),
  component: InterviewPage,
});

type Category = "hr" | "technical" | "behavioral" | "communication" | "mixed";

type AnswerRecord = {
  question: string;
  transcript: string;
  durationSec: number;
  wordCount: number;
  fillerCount: number;
  wordsPerMinute: number;
  eyeContactPct: number | null;
};

type Phase = "setup" | "ready" | "answering" | "review" | "scoring";

type PersistedSession = {
  role: string;
  category: Category;
  count: number;
  phase: Phase;
  questions: string[];
  qIndex: number;
  answers: AnswerRecord[];
};

type CamMode = "docked" | "minimized" | "pip" | "expanded";

const ACTIVE_KEY = "im_active_session";

function loadActiveSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PersistedSession;
    if (!p || !p.phase || p.phase === "setup" || p.phase === "scoring") return null;
    if (!Array.isArray(p.questions) || p.questions.length === 0) return null;
    return p;
  } catch {
    return null;
  }
}

function InterviewPage() {
  const navigate = useNavigate();
  const genFn = useServerFn(generateQuestions);
  const scoreFn = useServerFn(scoreInterview);

  // Setup form
  const [role, setRole] = useState("Software Engineer");
  const [category, setCategory] = useState<Category>("mixed");
  const [count, setCount] = useState(5);

  // Session
  const [phase, setPhase] = useState<Phase>("setup");
  const [questions, setQuestions] = useState<string[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restorePrompt, setRestorePrompt] = useState<PersistedSession | null>(null);

  // Media
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [camMode, setCamMode] = useState<CamMode>("docked");

  // Live metrics
  const startTsRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const speech = useSpeechRecognition();
  const face = useFaceMesh(videoRef, camOn);

  // Detect a restorable session once on mount
  useEffect(() => {
    const saved = loadActiveSession();
    if (saved) setRestorePrompt(saved);
  }, []);

  // Persist active session so a refresh doesn't lose progress
  useEffect(() => {
    if (phase === "setup" || phase === "scoring") return;
    try {
      const data: PersistedSession = { role, category, count, phase, questions, qIndex, answers };
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, [role, category, count, phase, questions, qIndex, answers]);

  // Acquire camera/mic when leaving setup. Stable dep: a boolean derived inline
  // would still work, but using `phase` directly is clearer and avoids the
  // appearance of an unstable dep array.
  const inSession = phase !== "setup";
  useEffect(() => {
    if (!inSession) return;
    if (streamRef.current) return; // already acquired
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCamOn(stream.getVideoTracks().some((t) => t.enabled));
        setMicOn(stream.getAudioTracks().some((t) => t.enabled));
        setMediaError(null);
      } catch (err) {
        console.error(err);
        setMediaError(
          err instanceof Error ? err.message : "Camera/microphone access was denied.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inSession]);

  // Re-attach stream to <video> when the element re-mounts (e.g. mode change)
  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    }
  }, [camMode, phase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Timer
  useEffect(() => {
    if (phase !== "answering") return;
    const id = window.setInterval(() => {
      if (startTsRef.current != null) {
        setElapsed((performance.now() - startTsRef.current) / 1000);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  // Combine finalized + interim transcript for live metrics
  const liveClean = useMemo(
    () => dedupeTranscript([speech.transcript, speech.interim].filter(Boolean).join(" ").trim()),
    [speech.transcript, speech.interim],
  );
  const liveWords = useMemo(() => countWords(liveClean), [liveClean]);
  const liveFillers = useMemo(() => countFillers(liveClean), [liveClean]);
  const liveWpm = useMemo(() => wpm(liveWords, elapsed), [liveWords, elapsed]);

  const restoreSession = useCallback(() => {
    if (!restorePrompt) return;
    setRole(restorePrompt.role);
    setCategory(restorePrompt.category);
    setCount(restorePrompt.count);
    setQuestions(restorePrompt.questions);
    setQIndex(restorePrompt.qIndex);
    setAnswers(restorePrompt.answers);
    setPhase(restorePrompt.phase === "answering" ? "ready" : restorePrompt.phase);
    setRestorePrompt(null);
  }, [restorePrompt]);

  const discardSession = useCallback(() => {
    try { localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
    setRestorePrompt(null);
  }, []);

  const begin = useCallback(async () => {
    setError(null);
    setLoadingMsg("Generating questions…");
    try {
      const res = await genFn({ data: { category, count, role } });
      if (!res.questions.length) throw new Error("No questions returned");
      setQuestions(res.questions);
      setQIndex(0);
      setAnswers([]);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate questions");
    } finally {
      setLoadingMsg(null);
    }
  }, [category, count, role, genFn]);

  const startAnswering = useCallback(() => {
    speech.reset();
    face.reset();
    setElapsed(0);
    startTsRef.current = performance.now();
    if (speech.supported) speech.start();
    setPhase("answering");
  }, [speech, face]);

  const finishAnswer = useCallback(() => {
    const duration = startTsRef.current ? (performance.now() - startTsRef.current) / 1000 : 0;
    speech.stop();
    const transcript = dedupeTranscript(speech.transcript);
    const words = countWords(transcript);
    const fillers = countFillers(transcript);
    const computedWpm = wpm(words, duration);
    const record: AnswerRecord = {
      question: questions[qIndex],
      transcript,
      durationSec: duration,
      wordCount: words,
      fillerCount: fillers,
      wordsPerMinute: Math.min(computedWpm, 300),
      eyeContactPct: face.eyeContactPct,
    };
    const next = [...answers, record];
    setAnswers(next);
    startTsRef.current = null;
    setElapsed(0);

    if (qIndex + 1 < questions.length) {
      setQIndex(qIndex + 1);
      setPhase("ready");
    } else {
      void submitForScoring(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, qIndex, questions, speech, face]);

  async function submitForScoring(records: AnswerRecord[]) {
    setPhase("scoring");
    setLoadingMsg("Scoring your interview…");
    setError(null);
    try {
      const res = await scoreFn({ data: { role, answers: records } });
      const session = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        role,
        category,
        answers: records,
        report: res.report,
      };
      try {
        const prev = JSON.parse(localStorage.getItem("im_sessions") ?? "[]");
        localStorage.setItem("im_sessions", JSON.stringify([session, ...prev].slice(0, 50)));
        localStorage.setItem("im_last_session", JSON.stringify(session));
        localStorage.removeItem(ACTIVE_KEY);
      } catch {
        /* ignore storage errors */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      navigate({ to: "/report" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scoring failed");
      setPhase("review");
    } finally {
      setLoadingMsg(null);
    }
  }

  const toggleCam = () => {
    const t = streamRef.current?.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setCamOn(t.enabled);
  };
  const toggleMic = () => {
    const t = streamRef.current?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMicOn(t.enabled);
  };

  const enterNativePip = useCallback(async () => {
    const v = videoRef.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }) | null;
    if (!v?.requestPictureInPicture) {
      setCamMode("pip");
      return;
    }
    try {
      await v.requestPictureInPicture();
    } catch {
      setCamMode("pip");
    }
  }, []);

  // ---------- Setup screen ----------

  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-background bg-hero">
        <div className="mx-auto max-w-xl px-6 py-20">
          <div className="mb-8 flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-lg bg-gradient-primary shadow-glow">
              <Sparkles className="size-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-semibold">New interview</span>
          </div>

          {restorePrompt && (
            <div className="glass mb-4 flex items-center justify-between gap-4 rounded-2xl p-4 shadow-card">
              <div className="text-sm">
                <div className="font-medium">Resume previous session?</div>
                <div className="text-xs text-muted-foreground">
                  {restorePrompt.role} · {restorePrompt.answers.length}/{restorePrompt.questions.length} answered
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={discardSession}>Discard</Button>
                <Button size="sm" onClick={restoreSession}>
                  <RotateCcw className="mr-2 size-3.5" /> Resume
                </Button>
              </div>
            </div>
          )}

          <div className="glass rounded-2xl p-8 shadow-card">
            <h1 className="text-2xl font-semibold">Configure your session</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ll generate questions tailored to the role and category you pick.
            </p>

            <div className="mt-6 space-y-5">
              <div>
                <Label htmlFor="role">Target role</Label>
                <Input
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="mt-2"
                  placeholder="e.g. Senior Frontend Engineer"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mixed">Mixed</SelectItem>
                      <SelectItem value="hr">HR</SelectItem>
                      <SelectItem value="technical">Technical</SelectItem>
                      <SelectItem value="behavioral">Behavioral</SelectItem>
                      <SelectItem value="communication">Communication</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Questions</Label>
                  <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[3, 5, 7, 10].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

            <Button
              size="lg"
              className="mt-8 w-full bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
              onClick={begin}
              disabled={!!loadingMsg || !role.trim()}
            >
              {loadingMsg ? (
                <><Loader2 className="mr-2 size-4 animate-spin" /> {loadingMsg}</>
              ) : (
                <>Begin interview <ArrowRight className="ml-2 size-4" /></>
              )}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              The next screen will ask for camera and microphone access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[qIndex];

  // Shared <video> element rendering helper
  const videoEl = (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="h-full w-full object-cover [transform:scaleX(-1)]"
    />
  );

  const camControls = (
    <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-border/60 bg-background/70 p-1 backdrop-blur-md">
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={toggleCam} disabled={!streamRef.current} title="Toggle camera">
        {camOn ? <Camera className="size-3.5" /> : <CameraOff className="size-3.5 text-destructive" />}
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={toggleMic} disabled={!streamRef.current} title="Toggle mic">
        {micOn ? <Mic className="size-3.5" /> : <MicOff className="size-3.5 text-destructive" />}
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={enterNativePip} title="Picture-in-picture">
        <PictureInPicture2 className="size-3.5" />
      </Button>
      {camMode === "expanded" ? (
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setCamMode("docked")} title="Collapse">
          <Minimize2 className="size-3.5" />
        </Button>
      ) : (
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setCamMode("expanded")} title="Expand">
          <Maximize2 className="size-3.5" />
        </Button>
      )}
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setCamMode("minimized")} title="Minimize">
        <X className="size-3.5" />
      </Button>
    </div>
  );

  const recBadge = phase === "answering" && (
    <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-destructive/90 px-2.5 py-1 text-[10px] font-semibold text-destructive-foreground">
      <span className="size-1.5 rounded-full bg-white animate-pulse" /> REC {elapsed.toFixed(0)}s
    </div>
  );

  return (
    <div className="min-h-screen bg-background bg-hero pb-24">
      {/* Expanded modal-style camera */}
      {camMode === "expanded" && (
        <div className="fixed inset-0 z-50 bg-background/95 p-6 backdrop-blur-md">
          <div className="relative mx-auto h-full max-w-5xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-card">
            {videoEl}
            {recBadge}
            {camControls}
          </div>
        </div>
      )}

      {/* Floating PiP / minimized chip */}
      {(camMode === "pip" || camMode === "minimized") && (
        <div
          className={`fixed bottom-4 right-4 z-40 overflow-hidden rounded-xl border border-border/60 bg-card shadow-card ${
            camMode === "minimized" ? "h-12 w-12" : "h-40 w-64"
          }`}
        >
          {camMode === "pip" ? videoEl : (
            <button
              className="grid h-full w-full place-items-center text-muted-foreground hover:text-foreground"
              onClick={() => setCamMode("docked")}
              title="Restore camera"
            >
              <Camera className="size-5" />
            </button>
          )}
          {camMode === "pip" && (
            <div className="absolute top-1 right-1 flex gap-1">
              <button
                className="grid size-6 place-items-center rounded-md bg-background/80 text-foreground hover:bg-background"
                onClick={() => setCamMode("docked")}
                title="Dock"
              >
                <Maximize2 className="size-3" />
              </button>
              <button
                className="grid size-6 place-items-center rounded-md bg-background/80 text-foreground hover:bg-background"
                onClick={() => setCamMode("minimized")}
                title="Minimize"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 lg:grid-cols-[1.3fr_1fr] lg:px-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Docked camera — sticky so it stays visible while scrolling */}
          {camMode === "docked" && (
            <div className="sticky top-4 z-10">
              <div className="relative aspect-video overflow-hidden rounded-2xl border border-border/60 bg-card shadow-card">
                {videoEl}
                {mediaError && (
                  <div className="absolute inset-0 grid place-items-center bg-background/80 p-6 text-center">
                    <div>
                      <p className="text-sm font-medium text-destructive">Camera / microphone unavailable</p>
                      <p className="mt-1 text-xs text-muted-foreground">{mediaError}</p>
                    </div>
                  </div>
                )}
                {camControls}
                {recBadge}
              </div>
            </div>
          )}

          {camMode !== "docked" && (
            <div className="rounded-2xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
              Camera is {camMode}.{" "}
              <button className="underline" onClick={() => setCamMode("docked")}>Dock it back</button>
            </div>
          )}

          {/* Transcript */}
          <div className="glass rounded-2xl p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live transcript</h3>
              {!speech.supported && (
                <span className="text-xs text-warning">Web Speech API not available in this browser</span>
              )}
            </div>
            <div className="min-h-20 text-sm leading-relaxed">
              {speech.transcript || <span className="text-muted-foreground">Your speech will appear here as you talk…</span>}
              {speech.interim && <span className="text-muted-foreground"> {speech.interim}</span>}
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <div className="glass rounded-2xl p-5 shadow-card">
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
              <span>Question {qIndex + 1} / {questions.length}</span>
              <span>{category.toUpperCase()}</span>
            </div>
            <p className="text-base font-medium leading-snug">{currentQuestion}</p>

            <div className="mt-5 flex gap-2">
              {phase === "ready" && (
                <Button
                  className="flex-1 bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
                  onClick={startAnswering}
                  disabled={!!mediaError}
                >
                  <Mic className="mr-2 size-4" /> Start answering
                </Button>
              )}
              {phase === "answering" && (
                <Button variant="destructive" className="flex-1" onClick={finishAnswer}>
                  <StopCircle className="mr-2 size-4" />
                  {qIndex + 1 < questions.length ? "Next question" : "Finish & score"}
                </Button>
              )}
              {phase === "scoring" && (
                <Button disabled className="flex-1">
                  <Loader2 className="mr-2 size-4 animate-spin" /> {loadingMsg ?? "Scoring…"}
                </Button>
              )}
            </div>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </div>

          <div className="glass rounded-2xl p-5 shadow-card">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Live metrics
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Metric icon={<Gauge className="size-4" />} label="Pace" value={`${liveWpm.toFixed(0)} wpm`} />
              <Metric icon={<Sparkles className="size-4" />} label="Words" value={String(liveWords)} />
              <Metric icon={<Mic className="size-4" />} label="Fillers" value={String(liveFillers)} />
              <Metric
                icon={<Eye className="size-4" />}
                label="Eye contact"
                value={
                  face.supported === false
                    ? "n/a"
                    : face.eyeContactPct == null
                      ? "…"
                      : `${face.eyeContactPct.toFixed(0)}%`
                }
                muted={face.supported === false || face.eyeContactPct == null}
              />
            </div>
          </div>

          {answers.length > 0 && (
            <div className="glass rounded-2xl p-5 shadow-card">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Completed
              </h3>
              <ul className="space-y-2 text-sm">
                {answers.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
                    <span className="truncate">{i + 1}. {a.question}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {a.wordCount}w · {a.fillerCount}f
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-background/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`text-base font-semibold tabular-nums ${muted ? "text-muted-foreground" : ""}`}>
        {value}
      </div>
    </div>
  );
}
