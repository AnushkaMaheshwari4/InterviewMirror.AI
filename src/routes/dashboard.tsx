import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, History, ListChecks, PlayCircle, Rocket, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — InterviewMirror AI" },
      { name: "description", content: "Start a new interview, review past sessions, or practice questions." },
    ],
  }),
  component: Dashboard,
});

const ACTIONS = [
  {
    title: "Start Interview",
    body: "Live webcam + mic session with AI questions and real-time metrics.",
    icon: PlayCircle,
    to: "/interview" as const,
    primary: true,
  },
  {
    title: "View Reports",
    body: "See your most recent AI-graded interview report.",
    icon: FileText,
    to: "/report" as const,
  },
  {
    title: "Practice Questions",
    body: "Generate fresh interview questions by category and role. No camera or mic.",
    icon: ListChecks,
    to: "/practice" as const,
  },
  {
    title: "SkillUp AI",
    body: "Upload your resume for a strength score and a skill-gap roadmap toward your target role.",
    icon: Rocket,
    to: "/skillup" as const,
  },
  {
    title: "History",
    body: "Browse previous interview sessions stored on this device.",
    icon: History,
    to: "/history" as const,
  },
];


function Dashboard() {
  return (
    <div className="min-h-screen bg-background bg-hero">
      <header className="border-b border-border/50">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-primary shadow-glow">
              <Sparkles className="size-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-semibold">InterviewMirror</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/report"><Button variant="ghost" size="sm">Last report</Button></Link>
            <Link to="/history"><Button variant="ghost" size="sm">History</Button></Link>
            <Link to="/settings"><Button variant="ghost" size="sm">Settings</Button></Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10">
          <h1 className="text-4xl font-semibold tracking-tight">Welcome back.</h1>
          <p className="mt-2 text-muted-foreground">Pick what you want to work on.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {ACTIONS.map((a) => (
            <Link key={a.title} to={a.to} className="block">
              <div
                className={`glass group h-full rounded-2xl p-7 shadow-card transition hover:border-primary/50 ${
                  a.primary ? "ring-1 ring-primary/40" : ""
                }`}
              >
                <div className="mb-5 flex items-center justify-between">
                  <div className="grid size-12 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
                    <a.icon className="size-6" />
                  </div>
                  {a.primary && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                      Recommended
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-semibold">{a.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{a.body}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
