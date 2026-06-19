import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Copy, Download, Lightbulb, ListChecks, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

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
import { generateQuestions } from "@/lib/interview.functions";

export const Route = createFileRoute("/practice")({
  head: () => ({
    meta: [
      { title: "Practice Questions — InterviewMirror AI" },
      {
        name: "description",
        content:
          "Generate AI interview practice questions by category and role. No webcam or microphone required.",
      },
    ],
  }),
  component: PracticePage,
});

type Category = "hr" | "technical" | "behavioral" | "communication" | "mixed";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "hr", label: "HR" },
  { value: "technical", label: "Technical" },
  { value: "behavioral", label: "Behavioral" },
  { value: "communication", label: "Communication" },
  { value: "mixed", label: "Mixed" },
];

function sampleHint(category: Category, question: string): string {
  const base = `Structure your answer with: (1) brief context, (2) the specific action you took, (3) the measurable result.`;
  switch (category) {
    case "hr":
      return `${base} For "${question.slice(0, 60)}…", tie your motivation to the role and company values.`;
    case "technical":
      return `${base} Walk through your reasoning, trade-offs, and complexity. Mention tools or patterns you used.`;
    case "behavioral":
      return `${base} Use the STAR method (Situation, Task, Action, Result) and keep it under 2 minutes.`;
    case "communication":
      return `${base} Demonstrate empathy, clarity, and how you adapted your message to the audience.`;
    default:
      return base;
  }
}

function PracticePage() {
  const [category, setCategory] = useState<Category>("behavioral");
  const [role, setRole] = useState("");
  const [count, setCount] = useState(5);
  const [questions, setQuestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  async function handleGenerate() {
    setLoading(true);
    setRevealed({});
    try {
      const res = await generateQuestions({
        data: { category, count, role: role.trim() || undefined },
      });
      setQuestions(res.questions);
      if (!res.questions.length) toast.error("No questions returned. Try again.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate questions. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function copyAll() {
    if (!questions.length) return;
    const txt = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
    navigator.clipboard.writeText(txt);
    toast.success("Questions copied to clipboard");
  }

  function downloadTxt() {
    if (!questions.length) return;
    const txt = [
      `Practice Questions — ${CATEGORIES.find((c) => c.value === category)?.label}${role ? ` (${role})` : ""}`,
      "",
      ...questions.map((q, i) => `${i + 1}. ${q}`),
    ].join("\n");
    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `practice-${category}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
            <Link to="/dashboard"><Button variant="ghost" size="sm">Dashboard</Button></Link>
            <Link to="/interview"><Button variant="ghost" size="sm">Start Interview</Button></Link>
            <Link to="/history"><Button variant="ghost" size="sm">History</Button></Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <ListChecks className="size-3.5" /> Practice mode — no camera or mic
            </div>
            <h1 className="text-4xl font-semibold tracking-tight">Practice Questions</h1>
            <p className="mt-2 text-muted-foreground">
              Generate fresh AI-curated interview questions. Read at your own pace, reveal hints, and export to prep offline.
            </p>
          </div>
        </div>

        <section className="glass rounded-2xl p-6 shadow-card">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto_auto]">
            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger id="category" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="role">Role / Job Title</Label>
              <Input
                id="role"
                placeholder="e.g. Frontend Engineer"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="count">Count</Label>
              <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
                <SelectTrigger id="count" className="mt-1.5 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 5, 7, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleGenerate} disabled={loading} className="w-full md:w-auto">
                {loading ? (
                  <><Loader2 className="mr-2 size-4 animate-spin" /> Generating…</>
                ) : questions.length ? (
                  <><RefreshCw className="mr-2 size-4" /> New set</>
                ) : (
                  <><Sparkles className="mr-2 size-4" /> Generate</>
                )}
              </Button>
            </div>
          </div>
        </section>

        {questions.length > 0 && (
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {questions.length} question{questions.length === 1 ? "" : "s"}
              </h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyAll}>
                  <Copy className="mr-2 size-4" /> Copy all
                </Button>
                <Button size="sm" variant="outline" onClick={downloadTxt}>
                  <Download className="mr-2 size-4" /> Export .txt
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={i} className="glass rounded-xl p-5 shadow-card">
                  <div className="flex items-start gap-4">
                    <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-sm font-semibold text-primary">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-base leading-relaxed">{q}</p>
                      {revealed[i] && (
                        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
                            <Lightbulb className="size-3.5" /> Hint
                          </div>
                          {sampleHint(category, q)}
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRevealed((r) => ({ ...r, [i]: !r[i] }))}
                        >
                          <Lightbulb className="mr-2 size-3.5" />
                          {revealed[i] ? "Hide hint" : "Show hint"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(q);
                            toast.success("Question copied");
                          }}
                        >
                          <Copy className="mr-2 size-3.5" /> Copy
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && questions.length === 0 && (
          <div className="mt-10 rounded-2xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
            Pick a category and role, then click Generate to get practice questions.
          </div>
        )}
      </main>
    </div>
  );
}
