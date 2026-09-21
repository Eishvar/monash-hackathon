import { Check, CircleAlert, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  CATEGORY_LABEL,
  FIELD_LABEL,
  STATUS_LABEL,
  type Category,
  type FieldName,
  type ResultSummary,
  type Status,
} from "@/lib/api";

const STATUS_STYLE: Record<Status, { cls: string; Icon: LucideIcon }> = {
  OK: { cls: "border-ok/25 bg-ok-bg text-ok", Icon: Check },
  MISMATCH: { cls: "border-bad/25 bg-bad-bg text-bad", Icon: X },
  NEEDS_REVIEW: { cls: "border-warn/25 bg-warn-bg text-warn", Icon: TriangleAlert },
  ERROR: { cls: "border-err/25 bg-err-bg text-err", Icon: CircleAlert },
};

export function StatusPill({ status }: { status: Status }) {
  const { cls, Icon } = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className="inline-flex items-center rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {CATEGORY_LABEL[category]}
    </span>
  );
}

export function DecidedBy({ result }: { result: Pick<ResultSummary, "decided_by" | "reviewed"> }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {result.decided_by === "llm" ? (
        <span className="rounded bg-ai-bg px-1.5 py-0.5 font-semibold text-ai" title="An AI model was needed for this decision">
          AI
        </span>
      ) : (
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-semibold" title="Decided by deterministic rules">
          Rules
        </span>
      )}
      {result.reviewed && <span className="font-semibold text-ok">✓ Reviewed</span>}
    </span>
  );
}

export function FieldChip({ field }: { field: FieldName }) {
  return (
    <span className="inline-flex rounded bg-bad-bg px-1.5 py-0.5 text-xs font-medium text-bad">{FIELD_LABEL[field]}</span>
  );
}

export function KpiTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "bad" | "warn" | "ok" }) {
  const color = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Bar({ label, value, max, tone = "accent" }: { label: string; value: number; max: number; tone?: "accent" | "bad" | "warn" | "ok" }) {
  const fill = { accent: "bg-foreground", bad: "bg-bad", warn: "bg-warn", ok: "bg-ok" }[tone];
  return (
    <div className="grid grid-cols-[minmax(7rem,11rem)_1fr_3rem] items-center gap-3 text-sm">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-surface-2" role="presentation">
        <span className={`block h-full rounded-full ${fill}`} style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} />
      </span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bad/40 bg-bad-bg px-4 py-3 text-sm text-bad">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="rounded-lg border border-bad/40 px-3 py-1 font-medium hover:bg-bad/10">
          Retry
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-[pulse-soft_1.4s_ease-in-out_infinite] rounded bg-surface-2 ${className}`} />;
}

export const buttonPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
export const buttonSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";
