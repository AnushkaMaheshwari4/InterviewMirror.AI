import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — InterviewMirror AI" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="min-h-screen bg-background bg-hero">
      <header className="border-b border-border/50">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
          <Link to="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <div className="mt-8 space-y-4">
          <Card title="Theme">
            <p className="text-sm text-muted-foreground">
              InterviewMirror uses a dark theme by default. Theme switching is not available in this version.
            </p>
          </Card>
          <Card title="Voice settings">
            <p className="text-sm text-muted-foreground">
              Speech recognition uses your browser&apos;s built-in Web Speech API (en-US). Microphone selection
              is controlled by your browser&apos;s site permissions.
            </p>
          </Card>
          <Card title="Notifications">
            <p className="text-sm text-muted-foreground">
              Push notifications are not configured for this device. Feature Not Available.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-6 shadow-card">
      <h3 className="mb-2 font-semibold">{title}</h3>
      {children}
    </div>
  );
}
