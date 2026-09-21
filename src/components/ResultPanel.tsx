import { useState, type ReactNode } from "react";
import { ChevronDown, CircleAlert, CircleCheck, Info, OctagonX, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react";
import { CATEGORY_LABEL, describeReview, FIELD_LABEL, type Result } from "@/lib/api";

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
export function VerdictCard({ result }: { result: Result }) {
  const v = verdict(result);
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${TONE[v.tone]}`}>
          <v.Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{v.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{v.text}</p>
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
