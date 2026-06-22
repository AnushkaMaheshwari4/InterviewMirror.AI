import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
  Target,
  Upload,
  XCircle,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";

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
import {
  analyzeResume,
  analyzeSkillGap,
  type ResumeAnalysis,
  type SkillGap,
} from "@/lib/skillup.functions";

export const Route = createFileRoute("/skillup")({
  head: () => ({
    meta: [
      { title: "SkillUp AI — Resume & Skill Gap Analyzer" },
      {
        name: "description",
        content:
          "Upload your resume to get a strength score, gap analysis, and a personalized learning roadmap.",
      },
    ],
  }),
  component: SkillUpPage,
});

const ROLES = [
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "Java Developer",
  "Python Developer",
  "Data Analyst",
  "Data Scientist",
  "Mobile Developer",
  "DevOps Engineer",
  "ML Engineer",
];

async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    // Lazy load pdfjs in the browser only
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }
    return text.trim();
  }
  if (name.endsWith(".docx")) {
    // @ts-expect-error - mammoth browser entry has no type declarations
    const mammoth = await import("mammoth/mammoth.browser");

    const buf = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    return value.trim();
  }
  if (name.endsWith(".txt")) {
    return (await file.text()).trim();
  }
  throw new Error("Unsupported file type. Upload a PDF, DOCX, or TXT file.");
}

function SkillUpPage() {
  const analyzeFn = useServerFn(analyzeResume);
  const gapFn = useServerFn(analyzeSkillGap);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [gap, setGap] = useState<SkillGap | null>(null);
  const [role, setRole] = useState<string>("Frontend Developer");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setAnalysis(null);
    setGap(null);
    setFileName(file.name);
    setLoading("Reading resume…");
    try {
      const text = await extractText(file);
      if (text.length < 50) throw new Error("Couldn't extract enough text from this file.");
      setResumeText(text);
      setLoading("Analyzing resume…");
      const res = await analyzeFn({ data: { text } });
      setAnalysis(res.analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyze resume");
    } finally {
      setLoading(null);
    }
  }, [analyzeFn]);

  const runGap = useCallback(async () => {
    if (!analysis) return;
    setError(null);
    setLoading("Comparing skills…");
    setGap(null);
    try {
      const res = await gapFn({
        data: { role, detectedSkills: analysis.detectedSkills },
      });
      setGap(res.gap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to analyze skill gap");
    } finally {
      setLoading(null);
    }
  }, [analysis, gapFn, role]);

  const reset = () => {
    setFileName(null);
    setResumeText("");
    setAnalysis(null);
    setGap(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-background bg-hero pb-24">
      <header className="border-b border-border/50">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link to="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-primary shadow-glow">
              <Sparkles className="size-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-semibold">SkillUp AI</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Resume & Skill Gap Analyzer</h1>
          <p className="mt-2 text-muted-foreground">
            Upload your resume (PDF or DOCX). We&apos;ll score it, then compare your skills to a target role.
          </p>
        </div>

        {/* Step 1: Upload */}
        {!analysis && (
          <div className="glass rounded-2xl p-8 shadow-card">
            <label
              htmlFor="resume-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/60 bg-background/40 px-6 py-12 text-center hover:border-primary/50"
            >
              <div className="grid size-12 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
                <Upload className="size-5" />
              </div>
              <div>
                <div className="font-medium">
                  {fileName ?? "Click to upload your resume"}
                </div>
                <div className="text-xs text-muted-foreground">PDF, DOCX, or TXT · up to ~5MB</div>
              </div>
              <Input
                id="resume-file"
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </label>
            {loading && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {loading}
              </div>
            )}
            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          </div>
        )}

        {/* Step 2: Resume analysis */}
        {analysis && (
          <div className="space-y-6">
            <div className="glass rounded-2xl p-6 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <FileText className="size-5 text-primary" />
                  <div>
                    <div className="text-sm text-muted-foreground">Resume</div>
                    <div className="font-medium">{fileName}</div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={reset}>Upload another</Button>
              </div>

              <div className="mt-6 grid items-center gap-6 sm:grid-cols-[auto_1fr]">
                <ScoreRing value={analysis.score} />
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Resume Strength Score
                  </div>
                  <div className="text-3xl font-semibold">{analysis.score}/100</div>
                  <p className="mt-2 text-sm text-muted-foreground">{analysis.summary}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Panel title="Strengths" tone="good">
                {analysis.strengths.map((s, i) => (
                  <Bullet key={i} good>{s}</Bullet>
                ))}
              </Panel>
              <Panel title="Weaknesses" tone="bad">
                {analysis.weaknesses.map((s, i) => (
                  <Bullet key={i}>{s}</Bullet>
                ))}
              </Panel>
              <Panel title="Missing Resume Elements" tone="bad">
                {analysis.missingElements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing major missing — nice work.</p>
                ) : (
                  analysis.missingElements.map((s, i) => <Bullet key={i}>{s}</Bullet>)
                )}
              </Panel>
              <Panel title="Improvement Suggestions" tone="neutral">
                {analysis.improvementSuggestions.map((s, i) => (
                  <Bullet key={i}>{s}</Bullet>
                ))}
              </Panel>
            </div>

            <div className="glass rounded-2xl p-6 shadow-card">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Detected sections
              </h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Chips title="Technical skills" items={analysis.sections.technicalSkills} />
                <Chips title="Projects" items={analysis.sections.projects} />
                <Chips title="Internships" items={analysis.sections.internships} />
                <Chips title="Education" items={analysis.sections.education} />
                <Chips title="Certifications" items={analysis.sections.certifications} />
              </div>
            </div>

            {/* Step 3: Skill gap */}
            <div className="glass rounded-2xl p-6 shadow-card">
              <div className="flex items-center gap-2">
                <Target className="size-5 text-primary" />
                <h3 className="text-lg font-semibold">Skill Gap Analyzer</h3>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick a target role to see how your skills stack up.
              </p>

              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] flex-1">
                  <Label>Target role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
                  onClick={runGap}
                  disabled={!!loading}
                >
                  {loading ? <><Loader2 className="mr-2 size-4 animate-spin" /> {loading}</> : "Analyze gap"}
                </Button>
              </div>

              {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

              {gap && (
                <div className="mt-6 space-y-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium">{gap.role} readiness</span>
                      <span className="tabular-nums font-semibold">{gap.matchPct}%</span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-background/60">
                      <div
                        className="h-full bg-gradient-primary transition-all"
                        style={{ width: `${gap.matchPct}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      You are {Math.max(0, 100 - gap.matchPct)}% behind the recommended skill profile for this role.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Panel title="Skills you have" tone="good">
                      {gap.matchedSkills.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No overlap detected yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {gap.matchedSkills.map((s) => (
                            <span key={s} className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </Panel>
                    <Panel title="Missing skills" tone="bad">
                      {gap.missingSkills.length === 0 ? (
                        <p className="text-sm text-muted-foreground">You&apos;re covered — nothing missing.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {gap.missingSkills.map((s) => (
                            <span key={s} className="rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-xs">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </Panel>
                  </div>

                  {gap.prioritySkills.length > 0 && (
                    <Panel title="Priority skills to learn next" tone="neutral">
                      <ol className="space-y-2 text-sm">
                        {gap.prioritySkills.map((s, i) => (
                          <li key={s} className="flex items-start gap-2">
                            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                              {i + 1}
                            </span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ol>
                    </Panel>
                  )}

                  {gap.learningPlan?.length > 0 && (
                    <Panel title="Learning plan" tone="neutral">
                      <ul className="space-y-3 text-sm">
                        {gap.learningPlan.map((p) => (
                          <li key={p.skill} className="rounded-lg border border-border/40 bg-background/40 p-3">
                            <div className="font-medium">{p.skill}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">{p.why}</div>
                            <div className="mt-1 text-xs"><span className="text-muted-foreground">Try:</span> {p.resource}</div>
                          </li>
                        ))}
                      </ul>
                    </Panel>
                  )}
                </div>
              )}
            </div>

            {resumeText && (
              <details className="glass rounded-2xl p-4 text-sm shadow-card">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Extracted resume text (debug)
                </summary>
                <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                  {resumeText}
                </pre>
              </details>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color = value >= 75 ? "stroke-success" : value >= 50 ? "stroke-warning" : "stroke-destructive";
  return (
    <svg width="96" height="96" viewBox="0 0 96 96" className="shrink-0">
      <circle cx="48" cy="48" r={r} className="fill-none stroke-border/40" strokeWidth="8" />
      <circle
        cx="48"
        cy="48"
        r={r}
        className={`fill-none ${color} transition-all`}
        strokeWidth="8"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
      />
      <text x="48" y="54" textAnchor="middle" className="fill-foreground text-lg font-semibold">
        {value}
      </text>
    </svg>
  );
}

function Panel({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "good" | "bad" | "neutral";
  children: React.ReactNode;
}) {
  const accent =
    tone === "good"
      ? "border-success/30"
      : tone === "bad"
        ? "border-destructive/30"
        : "border-border/50";
  return (
    <div className={`glass rounded-2xl border ${accent} p-5 shadow-card`}>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  );
}

function Bullet({ children, good }: { children: React.ReactNode; good?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      {good ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive/80" />
      )}
      <span>{children}</span>
    </div>
  );
}

function Chips({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs italic text-muted-foreground">Not detected</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((s, i) => (
            <span key={i} className="rounded-md border border-border/50 bg-background/40 px-2 py-1 text-xs">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
