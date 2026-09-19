import Link from "next/link";
import type { StatementMetrics } from "@/lib/metrics";

const pct = (x: number) => `${Math.round(x * 100)}%`;

// Credence bar: 0 (false) → 1 (true), colored red→amber→green.
export function CredenceBar({ value, showLabel = true }: { value: number; showLabel?: boolean }) {
  const hue = Math.round(value * 130); // 0=red, 130=green
  return (
    <div className="w-full">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: pct(value), background: `hsl(${hue} 55% 42%)` }}
        />
      </div>
      {showLabel && (
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>credence</span>
          <span className="tabular-nums font-medium text-ink">{pct(value)}</span>
        </div>
      )}
    </div>
  );
}

export function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="tabular-nums">{pct(value)}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent" style={{ width: pct(value) }} />
      </div>
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "for" | "against" | "accent";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-line text-muted",
    for: "bg-[var(--accent-soft)] text-[var(--for)]",
    against: "bg-[var(--accent-soft)] text-[var(--against)]",
    accent: "bg-[var(--accent-soft)] text-accent",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-5 ${className}`}>{children}</div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="serif mb-3 text-lg font-bold">{children}</h2>;
}

// A compact statement row with its credence — used in lists.
export function StatementRow({
  id,
  text,
  metrics,
}: {
  id: string;
  text: string;
  metrics: StatementMetrics;
}) {
  return (
    <Link
      href={`/statements/${id}`}
      className="block rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent"
    >
      <p className="mb-3 leading-snug">{text}</p>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <CredenceBar value={metrics.credence} showLabel={false} />
        </div>
        <span className="tabular-nums text-sm font-medium">{pct(metrics.credence)}</span>
        {metrics.controversy > 0.4 && <Pill tone="against">contested</Pill>}
        {metrics.grounded && <Pill tone="for">grounded</Pill>}
      </div>
    </Link>
  );
}
