import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Award, Download, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Report — InterviewMirror AI" },
      { name: "description", content: "Your most recent AI-graded interview report." },
    ],
  }),
  component: ReportPage,
});

type AnswerRecord = {
  question: string;
  transcript: string;
  durationSec: number;
  wordCount: number;
  fillerCount: number;
  wordsPerMinute: number;
  eyeContactPct: number | null;
};

type Report = {
  communication: number;
  confidence: number;
  technicalClarity: number;
  overall: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  perAnswer: { question: string; feedback: string; score: number }[];
};

type Session = {
  id: string;
  createdAt: number;
  role: string;
  category: string;
  answers: AnswerRecord[];
  report: Report;
};

function ReportPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("im_last_session");
      if (raw) setSession(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  if (!loaded) return null;

  if (!session) {
    return (
      <div className="min-h-screen bg-background bg-hero">
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <h1 className="text-3xl font-semibold">No report yet</h1>
          <p className="mt-2 text-muted-foreground">Run a live interview to see your AI-graded report here.</p>
          <Link to="/interview" className="mt-6 inline-block">
            <Button className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
              Start interview
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const { report } = session;

  const download = () => {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-report-${session.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => window.print();

  return (
    <div className="min-h-screen bg-background bg-hero">
      <header className="border-b border-border/50 print:hidden">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link to="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={download}>
              <Download className="mr-2 size-4" /> Export JSON
            </Button>
            <Button size="sm" className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90" onClick={printReport}>
              Save as PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" /> AI Interview Report
        </div>
        <h1 className="text-4xl font-semibold tracking-tight">{session.role}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(session.createdAt).toLocaleString()} · {session.category} · {session.answers.length} questions
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <ScoreCard label="Overall" score={report.overall} highlight />
          <ScoreCard label="Communication" score={report.communication} />
          <ScoreCard label="Confidence" score={report.confidence} />
          <ScoreCard label="Technical clarity" score={report.technicalClarity} />
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <ListCard title="Strengths" items={report.strengths} tone="success" />
          <ListCard title="Weaknesses" items={report.weaknesses} tone="warning" />
          <ListCard title="Recommendations" items={report.recommendations} tone="primary" />
        </div>

        <h2 className="mt-12 mb-4 text-2xl font-semibold">Per-question feedback</h2>
        <div className="space-y-4">
          {report.perAnswer.map((p, i) => {
            const ans = session.answers[i];
            return (
              <div key={i} className="glass rounded-2xl p-6 shadow-card">
                <div className="mb-2 flex items-center justify-between gap-4">
                  <p className="font-medium">{i + 1}. {p.question}</p>
                  <div className="flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">
                    <Award className="size-3.5" /> {p.score}
                  </div>
                </div>
                {ans && (
                  <div className="mb-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground md:grid-cols-4">
                    <div>{ans.wordCount} words</div>
                    <div>{ans.wordsPerMinute.toFixed(0)} wpm</div>
                    <div>{ans.fillerCount} fillers</div>
                    <div>
                      {ans.eyeContactPct == null
                        ? "eye contact n/a"
                        : `${ans.eyeContactPct.toFixed(0)}% eye contact`}
                    </div>
                  </div>
                )}
                {ans?.transcript && (
                  <p className="mb-3 rounded-lg border border-border/50 bg-background/40 p-3 text-sm italic text-muted-foreground">
                    “{ans.transcript}”
                  </p>
                )}
                <p className="text-sm leading-relaxed">{p.feedback}</p>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function ScoreCard({ label, score, highlight }: { label: string; score: number; highlight?: boolean }) {
  return (
    <div className={`glass rounded-2xl p-5 shadow-card ${highlight ? "ring-1 ring-primary/40" : ""}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-2 text-4xl font-bold tabular-nums ${highlight ? "text-gradient" : ""}`}>
        {score}
        <span className="text-base text-muted-foreground font-normal">/100</span>
      </div>
    </div>
  );
}

function ListCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "success" | "warning" | "primary";
}) {
  const dot = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-primary";
  return (
    <div className="glass rounded-2xl p-5 shadow-card">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <ul className="space-y-2 text-sm">
        {items?.length ? (
          items.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${dot}`} />
              <span>{s}</span>
            </li>
          ))
        ) : (
          <li className="text-muted-foreground">None recorded.</li>
        )}
      </ul>
    </div>
  );
}
