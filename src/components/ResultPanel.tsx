import { useState, type ReactNode } from "react";
import { ChevronDown, CircleAlert, CircleCheck, Info, OctagonX, Sparkles, TriangleAlert, UserCheck, type LucideIcon } from "lucide-react";
import { CATEGORY_LABEL, describeReview, FIELD_LABEL, FIELDS, STATUS_LABEL, type FieldRow, type Result, type Review, type TraceStep } from "@/lib/api";
import { traceChip } from "@/lib/trace";
import { StatusPill } from "@/components/ui";

/** Titled card used across the report layouts. */
export function Section({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Card whose body is hidden until its header button is pressed. */
export function Collapsible({ title, count, defaultOpen = false, children }: { title: string; count?: number; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-border bg-card">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {title}
          {count !== undefined && <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <div className="border-t border-border px-5 py-4">{children}</div>}
    </section>
  );
}

const TONE = {
  ok: "bg-ok-bg text-ok",
  bad: "bg-bad-bg text-bad",
  warn: "bg-warn-bg text-warn",
  err: "bg-err-bg text-err",
  neutral: "bg-muted text-muted-foreground",
} as const;

function verdict(result: Result): { Icon: LucideIcon; tone: keyof typeof TONE; title: string; text: string } {
  const n = result.defect_fields.length;
  if (result.status === "ERROR") return { Icon: CircleAlert, tone: "err", title: "Processing failed", text: result.processing_error ?? "The email could not be processed. Try again." };
  if (result.category !== "BL_COMPARISON")
    return { Icon: Info, tone: "neutral", title: "Nothing to compare", text: `This email was triaged as “${CATEGORY_LABEL[result.category].toLowerCase()}”, so there are no documents to check.` };
  if (result.status === "MISMATCH")
    return { Icon: OctagonX, tone: "bad", title: `${n} field${n > 1 ? "s" : ""} need attention`, text: `${result.defect_fields.map((f) => FIELD_LABEL[f]).join(", ")} ${n > 1 ? "differ" : "differs"} between the shipping instruction and the draft bill of lading.` };
  if (result.status === "NEEDS_REVIEW") return { Icon: TriangleAlert, tone: "warn", title: "Needs human review", text: describeReview(result) };
  return { Icon: CircleCheck, tone: "ok", title: "No mismatch detected.", text: "All seven fields match between the SI and the draft BL." };
}

/** The verdict headline plus the AI summary. */
export function VerdictCard({ result, reviews = [] }: { result: Result; reviews?: Review[] }) {
  const v = verdict(result);
  const latest = reviews.length ? reviews[reviews.length - 1] : null;
  const from = latest?.before?.status;
  const to = latest?.after?.status;
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${TONE[v.tone]}`}>
          <v.Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{v.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{v.text}</p>
          {result.reviewed && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-md bg-ok-bg px-2 py-0.5 font-medium text-ok">
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Verified by a human reviewer
              </span>
              {from && to && from !== to && (
                <span className="text-muted-foreground">Status changed from {STATUS_LABEL[from]} to {STATUS_LABEL[to]} by review</span>
              )}
            </div>
          )}
        </div>
      </div>
      {result.explanation && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {result.reviewed ? "AI summary (before review)" : "AI summary"}
          </div>
          <p className={`text-sm leading-6 ${result.reviewed ? "text-muted-foreground" : ""}`}>{result.explanation}</p>
        </div>
      )}
    </section>
  );
}

/** Field-level diff between two review snapshots: `Consignee (BL): "old" → "new"`. */
export function reviewDiff(before: FieldRow[] = [], after: FieldRow[] = []): string[] {
  const was = new Map(before.map((r) => [r.field, r]));
  const out: string[] = [];
  const q = (v: string | null | undefined) => (v ? `“${v.replace(/\s*\n\s*/g, ", ")}”` : "(blank)");
  for (const f of FIELDS) {
    const a = after.find((r) => r.field === f);
    if (!a) continue;
    const b = was.get(f);
    for (const side of ["si", "bl"] as const) {
      if ((b?.[side] ?? null) !== (a[side] ?? null) && (b || a[side])) out.push(`${FIELD_LABEL[f]} (${side.toUpperCase()}): ${q(b?.[side])} → ${q(a[side])}`);
    }
  }
  return out;
}

/** Audit trail of human reviews, newest first. */
export function ReviewHistory({ reviews }: { reviews: Review[] }) {
  const fmt = (s: string) => new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <ul className="divide-y divide-border">
      {[...reviews].reverse().map((r) => {
        const diff = r.action === "correct" ? reviewDiff(r.before?.fields, r.after?.fields) : [];
        return (
          <li key={r.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${r.action === "correct" ? "bg-ai-bg text-ai" : "bg-ok-bg text-ok"}`}>
                {r.action === "correct" ? "Corrected" : "Confirmed"}
              </span>
              <time className="text-xs text-muted-foreground" dateTime={r.created_at}>{fmt(r.created_at)}</time>
              {r.before && r.after && (
                <span className="ml-auto inline-flex items-center gap-1.5">
                  <StatusPill status={r.before.status} />
                  <span aria-label="became" className="text-muted-foreground">→</span>
                  <StatusPill status={r.after.status} />
                </span>
              )}
            </div>
            {r.note && <p className="text-sm">{r.note}</p>}
            {diff.length > 0 && (
              <ul className="space-y-0.5 font-mono text-xs text-muted-foreground">
                {diff.map((d) => <li key={d} className="break-words">{d}</li>)}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The cascade for this email, one chip per stage that actually ran. */
export function DecisionTrace({ steps, reviewed }: { steps: TraceStep[]; reviewed: boolean }) {
  const chips = steps.map(traceChip);
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="Pipeline stages">
      {chips.map((c, i) => (
        <li key={i} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden="true" className="text-muted-foreground">→</span>}
          <span className={`rounded-md px-2 py-1 text-xs font-medium ${c.ai ? "bg-ai-bg text-ai" : "bg-surface-2 text-muted-foreground"}`}>
            <span className={c.ai ? "" : "text-foreground"}>{c.label}</span> · {c.parts.join(" · ")}
          </span>
        </li>
      ))}
      {reviewed && (
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="text-muted-foreground">→</span>
          <span className="rounded-md bg-ok-bg px-2 py-1 text-xs font-medium text-ok">Human review</span>
        </li>
      )}
    </ol>
  );
}
