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

type CamMode = "mini" | "expanded" | "hidden";

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
  const [confirmEnd, setConfirmEnd] = useState(false);

  // Media
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [camMode, setCamMode] = useState<CamMode>("mini");


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

  const inSession = phase !== "setup";
  useEffect(() => {
    if (!inSession) return;
    if (streamRef.current) return;
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

  // Re-attach stream to <video> when the element re-mounts (mode change)
  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    }
  }, [camMode, phase]);

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

  const buildRecord = useCallback((): AnswerRecord => {
    const duration = startTsRef.current ? (performance.now() - startTsRef.current) / 1000 : 0;
    const transcript = dedupeTranscript(speech.transcript);
    const words = countWords(transcript);
    const fillers = countFillers(transcript);
    return {
      question: questions[qIndex],
      transcript,
      durationSec: duration,
      wordCount: words,
      fillerCount: fillers,
      wordsPerMinute: Math.min(wpm(words, duration), 300),
      eyeContactPct: face.eyeContactPct,
    };
  }, [questions, qIndex, speech.transcript, face.eyeContactPct]);

  const finishAnswer = useCallback(() => {
    speech.stop();
    const record = buildRecord();
    const next = [...answers, record];
    setAnswers(next);
    startTsRef.current = null;
    setElapsed(0);

    if (qIndex + 1 < questions.length) {
      setQIndex(qIndex + 1);
      setPhase("ready");
    } else {
      void submitForScoring(next, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, qIndex, questions, speech, buildRecord]);

  const endInterviewEarly = useCallback(() => {
    setConfirmEnd(false);
    let finalAnswers = answers;
    if (phase === "answering") {
      speech.stop();
      const record = buildRecord();
      finalAnswers = [...answers, record];
      setAnswers(finalAnswers);
      startTsRef.current = null;
      setElapsed(0);
    }
    if (finalAnswers.length === 0) {
      // Nothing to score — clean up and bail to dashboard
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      try { localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
      navigate({ to: "/dashboard" });
      return;
    }
    void submitForScoring(finalAnswers, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, phase, speech, buildRecord, navigate]);

  async function submitForScoring(records: AnswerRecord[], completedEarly: boolean) {
    setPhase("scoring");
    setLoadingMsg(completedEarly ? "Scoring completed answers…" : "Scoring your interview…");
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
        completedEarly,
        totalQuestions: questions.length,
        answeredQuestions: records.length,
      };
      try {
        const prev = JSON.parse(localStorage.getItem("im_sessions") ?? "[]");
        localStorage.setItem("im_sessions", JSON.stringify([session, ...prev].slice(0, 50)));
        localStorage.setItem("im_last_session", JSON.stringify(session));
        localStorage.removeItem(ACTIVE_KEY);
      } catch {
        /* ignore */
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

  const videoEl = (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className="h-full w-full object-cover [transform:scaleX(-1)]"
    />
  );

  const recBadge = phase === "answering" && (
    <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-destructive/90 px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground">
      <span className="size-1.5 rounded-full bg-white animate-pulse" /> REC {elapsed.toFixed(0)}s
    </div>
  );

  return (
    <div className="min-h-screen bg-background bg-hero pb-24">
      {/* Expanded modal camera */}
      {camMode === "expanded" && (
        <div className="fixed inset-0 z-50 bg-background/95 p-6 backdrop-blur-md">
          <div className="relative mx-auto h-full max-w-5xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-card">
            {videoEl}
            {recBadge}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-border/60 bg-background/70 p-1 backdrop-blur-md">
              <CamBtn onClick={toggleCam} title="Toggle camera">
                {camOn ? <Camera className="size-3.5" /> : <CameraOff className="size-3.5 text-destructive" />}
              </CamBtn>
              <CamBtn onClick={toggleMic} title="Toggle mic">
                {micOn ? <Mic className="size-3.5" /> : <MicOff className="size-3.5 text-destructive" />}
              </CamBtn>
              <CamBtn onClick={() => setCamMode("mini")} title="Collapse">
                <Minimize2 className="size-3.5" />
              </CamBtn>
              <CamBtn onClick={() => setCamMode("hidden")} title="Hide">
                <X className="size-3.5" />
              </CamBtn>
            </div>
          </div>
        </div>
      )}


      {/* End interview confirmation */}
      {confirmEnd && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="glass w-full max-w-md rounded-2xl p-6 shadow-card">
            <h3 className="text-lg font-semibold">End interview?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to end the interview? Completed questions
              ({answers.length + (phase === "answering" ? 1 : 0)}/{questions.length}) will still be analyzed and scored.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmEnd(false)}>Continue interview</Button>
              <Button variant="destructive" onClick={endInterviewEarly}>
                <StopCircle className="mr-2 size-4" /> End interview
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-5xl gap-4 px-4 py-6 lg:grid-cols-[1.4fr_1fr] lg:px-6">
        {/* Left column — Question + Transcript */}
        <div className="space-y-4">
          <div className="glass rounded-2xl p-5 shadow-card">
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
              <span>Question {qIndex + 1} / {questions.length}</span>
              <span>{category.toUpperCase()}</span>
            </div>
            <p className="text-lg font-medium leading-snug">{currentQuestion}</p>

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

          <div className="glass rounded-2xl p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live transcript</h3>
              {!speech.supported && (
                <span className="text-xs text-warning">Web Speech API not available</span>
              )}
            </div>
            <div className="min-h-24 text-sm leading-relaxed">
              {speech.transcript || <span className="text-muted-foreground">Your speech will appear here as you talk…</span>}
              {speech.interim && <span className="text-muted-foreground"> {speech.interim}</span>}
            </div>
          </div>
        </div>

        {/* Right panel — Metrics + Controls */}
        <div className="space-y-4">
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

          <Button
            variant="outline"
            className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmEnd(true)}
            disabled={phase === "scoring"}
          >
            <StopCircle className="mr-2 size-4" /> End interview
          </Button>

          {answers.length > 0 && (
            <div className="glass rounded-2xl p-5 shadow-card">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Completed ({answers.length}/{questions.length})
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

function CamBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      data-no-drag
      onClick={onClick}
      title={title}
      className="grid h-6 w-6 place-items-center rounded-full text-foreground hover:bg-background"
    >
      {children}
    </button>
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
