import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Camera,
  CameraOff,
  Eye,
  Gauge,
  Loader2,
  Mic,
  MicOff,
  Sparkles,
  StopCircle,
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

  // Media
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Live metrics
  const startTsRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const speech = useSpeechRecognition();
  const face = useFaceMesh(videoRef, camOn);

  // Acquire camera/mic when leaving setup
  useEffect(() => {
    if (phase === "setup") return;
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
          err instanceof Error
            ? err.message
            : "Camera/microphone access was denied.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // we intentionally re-acquire only on first move out of setup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase !== "setup"]);

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

  const liveClean = useMemo(() => dedupeTranscript(speech.transcript), [speech.transcript]);
  const liveWords = useMemo(() => countWords(liveClean), [liveClean]);
  const liveFillers = useMemo(() => countFillers(liveClean), [liveClean]);
  const liveWpm = useMemo(() => wpm(liveWords, elapsed), [liveWords, elapsed]);

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
    const transcript = speech.transcript;
    const words = countWords(transcript);
    const fillers = countFillers(transcript);
    const record: AnswerRecord = {
      question: questions[qIndex],
      transcript,
      durationSec: duration,
      wordCount: words,
      fillerCount: fillers,
      wordsPerMinute: wpm(words, duration),
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
      } catch {
        /* ignore storage errors */
      }
      // stop stream
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

  // ---------- UI ----------

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

  return (
    <div className="min-h-screen bg-background bg-hero">
      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[1.4fr_1fr]">
        {/* Video */}
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-card aspect-video">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover [transform:scaleX(-1)]"
            />
            {mediaError && (
              <div className="absolute inset-0 grid place-items-center bg-background/80 p-6 text-center">
                <div>
                  <p className="text-sm font-medium text-destructive">Camera / microphone unavailable</p>
                  <p className="mt-1 text-xs text-muted-foreground">{mediaError}</p>
                </div>
              </div>
            )}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2 rounded-full border border-border/60 bg-background/70 p-1 backdrop-blur-md">
              <Button size="sm" variant="ghost" onClick={toggleCam} disabled={!streamRef.current}>
                {camOn ? <Camera className="size-4" /> : <CameraOff className="size-4 text-destructive" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={toggleMic} disabled={!streamRef.current}>
                {micOn ? <Mic className="size-4" /> : <MicOff className="size-4 text-destructive" />}
              </Button>
            </div>
            {phase === "answering" && (
              <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-destructive/90 px-3 py-1 text-xs font-semibold text-destructive-foreground">
                <span className="size-2 rounded-full bg-white animate-pulse" /> REC {elapsed.toFixed(0)}s
              </div>
            )}
          </div>

          {/* Transcript */}
          <div className="glass rounded-2xl p-5 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Live transcript</h3>
              {!speech.supported && (
                <span className="text-xs text-warning">Web Speech API not available — Feature Not Available in this browser</span>
              )}
            </div>
            <div className="min-h-24 text-sm leading-relaxed">
              {speech.transcript || <span className="text-muted-foreground">Your speech will appear here as you talk…</span>}
              {speech.interim && <span className="text-muted-foreground"> {speech.interim}</span>}
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          <div className="glass rounded-2xl p-6 shadow-card">
            <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
              <span>Question {qIndex + 1} / {questions.length}</span>
              <span>{category.toUpperCase()}</span>
            </div>
            <p className="text-lg font-medium leading-snug">{currentQuestion}</p>

            <div className="mt-6 flex gap-2">
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
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={finishAnswer}
                >
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

          <div className="glass rounded-2xl p-6 shadow-card">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Live metrics
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Metric icon={<Gauge className="size-4" />} label="Speaking pace" value={`${liveWpm.toFixed(0)} wpm`} />
              <Metric icon={<Sparkles className="size-4" />} label="Words" value={String(liveWords)} />
              <Metric icon={<Mic className="size-4" />} label="Filler words" value={String(liveFillers)} />
              <Metric
                icon={<Eye className="size-4" />}
                label="Eye contact"
                value={
                  face.supported === false
                    ? "Feature Not Available"
                    : face.eyeContactPct == null
                      ? "Calibrating…"
                      : `${face.eyeContactPct.toFixed(0)}%`
                }
                muted={face.supported === false || face.eyeContactPct == null}
              />
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              Confidence indicators are derived from pace stability, filler ratio, and eye contact during scoring.
            </div>
          </div>

          {answers.length > 0 && (
            <div className="glass rounded-2xl p-6 shadow-card">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Completed
              </h3>
              <ul className="space-y-2 text-sm">
                {answers.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
                    <span className="truncate">{i + 1}. {a.question}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {a.wordCount}w · {a.fillerCount} fillers
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
      <div className={`text-lg font-semibold tabular-nums ${muted ? "text-muted-foreground" : ""}`}>
        {value}
      </div>
    </div>
  );
}
