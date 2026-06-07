import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [{ title: "History — InterviewMirror AI" }],
  }),
  component: HistoryPage,
});

type Session = {
  id: string;
  createdAt: number;
  role: string;
  category: string;
  report: { overall: number };
};

function HistoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("im_sessions");
      if (raw) setSessions(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const open = (s: Session) => {
    localStorage.setItem("im_last_session", JSON.stringify(s));
    window.location.href = "/report";
  };

  const clear = () => {
    localStorage.removeItem("im_sessions");
    localStorage.removeItem("im_last_session");
    setSessions([]);
  };

  return (
    <div className="min-h-screen bg-background bg-hero">
      <header className="border-b border-border/50">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link to="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
          {sessions.length > 0 && (
            <Button size="sm" variant="ghost" onClick={clear}>Clear history</Button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Session history</h1>
        <p className="mt-1 text-sm text-muted-foreground">Stored locally on this device.</p>

        {sessions.length === 0 ? (
          <div className="glass mt-8 rounded-2xl p-10 text-center shadow-card">
            <p className="text-muted-foreground">No interviews yet.</p>
            <Link to="/interview" className="mt-4 inline-block">
              <Button className="bg-gradient-primary text-primary-foreground shadow-glow">Start one</Button>
            </Link>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => open(s)}
                  className="glass flex w-full items-center justify-between gap-4 rounded-2xl p-5 text-left shadow-card transition hover:border-primary/40"
                >
                  <div>
                    <div className="font-medium">{s.role}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString()} · {s.category}
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-gradient tabular-nums">{s.report.overall}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
