"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { FIELD_LABEL, REASON_LABEL, STATUS_LABEL, type FieldName, type Metrics, type PipelineStats, type ReviewStats } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtMs, STAGE_LABEL } from "@/lib/trace";
import { Bar, Skeleton } from "@/components/ui";
import { ReviewStatsTiles } from "@/components/ReviewStatsTiles";
import validation from "@/data/validation.json";
import benchmark from "@/data/benchmark.json";

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace(/\.0+$/, "")}%`;
const s = validation.bundle.scores;

/** A titled block: heading + one-line purpose on the left, content on the right (stacks on phones). */
function Block({ id, title, sub, children }: { id: string; title: string; sub: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 border-t border-border pt-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
      <div>
        <h2 id={id} className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{sub}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-card ${className}`}>{children}</div>;
}

function Figure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="px-5 py-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</div>
      {note && <div className="mt-1 text-xs leading-snug text-muted-foreground">{note}</div>}
    </div>
  );
}

/** Three independent tests in one panel, then per-field precision / recall on the held-out benchmark. */
export function AccuracySection() {
  const b = benchmark;
  const fields = Object.entries(b.per_field) as [FieldName, (typeof b.per_field)[FieldName]][];
  return (
    <Block id="acc-h" title="Accuracy" sub="Measured on three independent tests. A false alarm, flagging a mismatch that is not there, is the number we watch most.">
      <Panel>
        <div className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
          <Figure label="Organiser scorer" value={s.final.toFixed(3)} note={`Official scorer, 520 emails. Classification ${s.classification_f1.toFixed(3)}, defect F1 ${s.defect_f1.toFixed(3)}, end-to-end ${s.end_to_end}.`} />
          <Figure label="Held-out benchmark: false alarms" value={pct(b.false_alarm_rate)} tone="text-ok" note={`${pct(b.exact_match_rate)} exact match over ${b.n} synthetic SI/BL pairs with known answers (4 formats, 3 label vocabularies).`} />
          <Figure label="Unseen email wording" value={`${pct(validation.paraphrases.accuracy_rules_only, 0)} → ${pct(validation.paraphrases.accuracy_rules_plus_llm, 0)}`} note={`Rules only → rules + AI, on ${validation.paraphrases.n} rephrased requests.`} />
        </div>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Field (held-out benchmark)</th>
                <th className="px-5 py-2.5 text-right font-medium">Precision</th>
                <th className="px-5 py-2.5 text-right font-medium">Recall</th>
                <th className="px-5 py-2.5 text-right font-medium">Planted defects</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fields.map(([f, v]) => (
                <tr key={f}>
                  <td className="px-5 py-2">{FIELD_LABEL[f]}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{pct(v.precision)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{pct(v.recall)}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-muted-foreground">{v.support}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Block>
  );
}

function BarList({ title, rows, tone, empty }: { title: string; rows: [string, number][]; tone: "bad" | "warn" | "accent"; empty: string }) {
  const max = Math.max(1, ...rows.map(([, c]) => c));
  return (
    <div className="p-5">
      <h3 className="mb-3 text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="space-y-2.5">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
        {rows.map(([label, c]) => <Bar key={label} label={label} value={c} max={max} tone={tone} />)}
      </div>
    </div>
  );
}

/** Which fields differ most often and why cases were escalated, from the live database. */
export function DiscrepancySection({ metrics: m }: { metrics: Metrics | null }) {
  if (!m) return <Skeleton className="h-48 w-full" />;
  const fields = Object.entries(m.defect_fields).sort((a, b) => b[1] - a[1]).map(([f, c]): [string, number] => [FIELD_LABEL[f as FieldName] ?? f, c]);
  const reasons = Object.entries(m.review_reasons).sort((a, b) => b[1] - a[1]).map(([r, c]): [string, number] => [REASON_LABEL[r] ?? r, c]);
  return (
    <Block id="disc-h" title="Discrepancies" sub="Which fields break most often, and why the checker sent cases to a person instead of guessing.">
      <Panel className="grid divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <BarList title="Mismatches by field" rows={fields} tone="bad" empty="No mismatches yet." />
        <BarList title="Reasons for escalation" rows={reasons} tone="warn" empty="No escalations yet." />
      </Panel>
    </Block>
  );
}

/** The cascade: rules first, AI where rules abstain, code decides, a person resolves the rest. */
export function PipelineSection() {
  const { data } = useApi<PipelineStats>("/metrics/pipeline");
  if (!data) return <Skeleton className="h-48 w-full" />;
  const f = data.funnel;
  const stages = Object.entries(data.stages);
  const steps: [string, number, "accent" | "warn" | "ok" | "bad"][] = [
    ["All emails", f.emails, "accent"],
    ["Decided by rules", f.decided_by_rules, "accent"],
    ["Needed the AI", f.needed_ai, "accent"],
    ["BL comparisons", f.bl_comparisons, "accent"],
    [STATUS_LABEL.OK, f.ok, "ok"],
    [STATUS_LABEL.MISMATCH, f.mismatch, "bad"],
    [STATUS_LABEL.NEEDS_REVIEW, f.needs_review, "warn"],
    ["Scans read by vision AI", f.vision_used, "accent"],
    ["Reviewed by a person", f.human_reviewed, "accent"],
  ];
  return (
    <Block id="pipe-h" title="How emails are decided" sub="Rules first, AI where rules abstain, code makes every final decision, a person resolves what the system will not guess.">
      <Panel>
        <div className="space-y-2.5 p-5">
          {steps.map(([label, v, tone]) => <Bar key={label} label={label} value={v} max={f.emails} tone={tone} />)}
        </div>
        {stages.length > 0 && (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Stage{data.traced ? ` (${data.traced} traced emails)` : ""}</th>
                  <th className="px-5 py-2.5 font-medium">Method</th>
                  <th className="px-5 py-2.5 text-right font-medium">p50</th>
                  <th className="px-5 py-2.5 text-right font-medium">p95</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stages.map(([name, v]) => (
                  <tr key={name}>
                    <td className="px-5 py-2">{STAGE_LABEL[name] ?? name}</td>
                    <td className="px-5 py-2 text-muted-foreground">{Object.entries(v.by_method).map(([mth, c]) => `${mth} ${c}`).join(" · ")}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{fmtMs(v.p50_ms)}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{fmtMs(v.p95_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Block>
  );
}

/** Human-in-the-loop: the strip shared with the review queue, plus how verdicts moved. */
export function HumanSection() {
  const { data } = useApi<ReviewStats>("/metrics/reviews");
  if (!data) return <Skeleton className="h-32 w-full" />;
  const transitions = Object.entries(data.transitions);
  return (
    <Block id="human-h" title="Human in the loop" sub="Every escalation ends with a person, and every decision is audited.">
      <div className="space-y-3">
        <ReviewStatsTiles stats={data} />
        <p className="text-sm text-muted-foreground">
          {transitions.length === 0 ? (
            <>No verdict has been changed by a review yet. <Link href="/review" className="underline underline-offset-2">Open the review queue</Link>.</>
          ) : (
            transitions.map(([k, n], i) => {
              const [from, to] = k.split("→");
              return <span key={k}>{i > 0 && " · "}{STATUS_LABEL[from as keyof typeof STATUS_LABEL] ?? from} → {STATUS_LABEL[to as keyof typeof STATUS_LABEL] ?? to}: {n}</span>;
            })
          )}
        </p>
      </div>
    </Block>
  );
}
