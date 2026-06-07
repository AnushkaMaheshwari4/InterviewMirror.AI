import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Brain, Camera, LineChart, Mic, Sparkles, Target } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "InterviewMirror AI — Practice interviews with real-time AI coaching" },
      {
        name: "description",
        content:
          "Live AI interview coaching with webcam, microphone, speech analysis, and instant feedback on communication, confidence, and clarity.",
      },
      { property: "og:title", content: "InterviewMirror AI" },
      {
        property: "og:description",
        content: "Practice interviews with real-time AI coaching.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Camera,
    title: "Live webcam analysis",
    body: "Real eye-contact tracking with on-device face detection. No fake numbers — if your camera isn't ready, the metric simply isn't shown.",
  },
  {
    icon: Mic,
    title: "Speech transcription",
    body: "Browser-native Web Speech API transcribes you live and counts filler words, words-per-minute, and answer length in real time.",
  },
  {
    icon: Brain,
    title: "AI interview coach",
    body: "Gemini scores your transcripts against the role, generates strengths, weaknesses, and concrete recommendations.",
  },
  {
    icon: Target,
    title: "Question categories",
    body: "Switch between HR, Technical, Behavioral, Communication, or a mixed set tailored to the role you choose.",
  },
  {
    icon: LineChart,
    title: "Real metrics, not vanity",
    body: "Every score is derived from your actual speech and video. Unavailable signals are labeled, never invented.",
  },
  {
    icon: Sparkles,
    title: "Instant report",
    body: "Get a per-question breakdown plus overall scores for communication, confidence, and technical clarity.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-primary shadow-glow">
              <Sparkles className="size-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">
              InterviewMirror<span className="text-gradient">.AI</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#demo" className="hover:text-foreground">Demo</a>
            <a href="#about" className="hover:text-foreground">About</a>
          </nav>
          <Link to="/dashboard">
            <Button size="sm" className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
              Open app <ArrowRight className="ml-1 size-4" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-hero">
        <div className="mx-auto max-w-7xl px-6 pt-24 pb-32 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success animate-pulse" /> Live AI coaching · Powered by Gemini
          </div>
          <h1 className="mx-auto max-w-4xl text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
            Practice interviews with a{" "}
            <span className="text-gradient">mirror that actually listens.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            InterviewMirror watches your camera, transcribes your answers, measures pace and fillers,
            and gives you a real Gemini-powered breakdown — no canned scores.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link to="/interview">
              <Button size="lg" className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
                Start a live interview <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button size="lg" variant="outline" className="border-border/80 bg-card/40 hover:bg-card">
                Open dashboard
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-14 max-w-2xl">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">Features</p>
          <h2 className="text-4xl font-semibold tracking-tight">
            Every metric comes from your actual interview.
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass rounded-2xl p-6 shadow-card transition hover:border-primary/40">
              <div className="mb-4 grid size-10 place-items-center rounded-lg bg-gradient-primary text-primary-foreground">
                <f.icon className="size-5" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="mx-auto max-w-7xl px-6 py-24">
        <div className="glass rounded-3xl p-10 shadow-card">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <p className="mb-3 text-sm font-medium uppercase tracking-widest text-accent">Demo</p>
              <h2 className="text-4xl font-semibold tracking-tight">Try a 5-question session in your browser.</h2>
              <p className="mt-4 text-muted-foreground">
                Grant camera and microphone access, pick a role and category, and the app runs the entire
                session locally — only your final transcripts are sent to the model for scoring.
              </p>
              <div className="mt-6">
                <Link to="/interview">
                  <Button size="lg" className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
                    Launch interview <ArrowRight className="ml-2 size-4" />
                  </Button>
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card/60 p-6 font-mono text-sm">
              <div className="mb-2 text-muted-foreground"># live metrics</div>
              <div className="space-y-1">
                <div><span className="text-primary">words</span>: 142</div>
                <div><span className="text-primary">wpm</span>: 138</div>
                <div><span className="text-primary">fillers</span>: 4</div>
                <div><span className="text-primary">eye_contact</span>: 71%</div>
                <div className="text-muted-foreground">// every value computed from your input</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="mx-auto max-w-4xl px-6 py-24 text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">About</p>
        <h2 className="text-4xl font-semibold tracking-tight">Built for honest practice.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          Most interview prep tools show you a number and a smile. InterviewMirror is different: every score
          you see is derived from real audio, real video, and a real AI evaluation of your transcripts.
          If a signal isn&apos;t available, we label it instead of faking it.
        </p>
      </section>

      <footer className="border-t border-border/50 py-10 text-center text-sm text-muted-foreground">
        InterviewMirror AI · Practice interviews honestly.
      </footer>
    </div>
  );
}
