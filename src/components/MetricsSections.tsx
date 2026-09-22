"use client";

import Link from "next/link";
import { FIELD_LABEL, REASON_LABEL, STATUS_LABEL, type FieldName, type Metrics, type PipelineStats, type ReviewStats } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Bar, Card, KpiTile, Skeleton } from "@/components/ui";
import { fmtMs, STAGE_LABEL } from "@/lib/trace";
import { ReviewStatsTiles } from "@/components/ReviewStatsTiles";
import validation from "@/data/validation.json";
import benchmark from "@/data/benchmark.json";

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace(/\.0+$/, "")}%`;
const s = validation.bundle.scores;

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

/** Three independent pieces of accuracy evidence side by side, plus per-field precision / recall on the held-out benchmark. */
export function AccuracySection() {
  const b = benchmark;
  const fields = Object.entries(b.per_field) as [FieldName, (typeof b.per_field)[FieldName]][];
  return (
    <section aria-labelledby="acc-h">
      <div id="acc-h"><Heading title="Accuracy — measured, not claimed" sub="Three independent tests. False alarms (flagging a mismatch that is not there) are the number we watch most." /></div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="Organiser scorer">
          <div className="text-3xl font-semibold tabular-nums">{s.final.toFixed(3)}</div>
          <div className="mt-2 divide-y divide-border">
            <Stat label="Classification macro-F1" value={s.classification_f1.toFixed(3)} />
            <Stat label="Defect F1" value={s.defect_f1.toFixed(3)} />
            <Stat label="End-to-end" value={s.end_to_end} />
            <Stat label="Escalations" value={s.escalated} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Official scorer, 520 emails.</p>
        </Card>
        <Card title="Held-out benchmark">
          <div className="flex items-end gap-6">
            <div>
              <div className="text-3xl font-semibold tabular-nums text-ok">{pct(b.false_alarm_rate)}</div>
              <div className="text-xs text-muted-foreground">false-alarm rate</div>
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums">{pct(b.exact_match_rate)}</div>
              <div className="text-xs text-muted-foreground">exact match</div>
            </div>
          </div>
          <div className="mt-2 divide-y divide-border">
            <Stat label="Defect precision" value={pct(b.defect.precision)} />
            <Stat label="Defect recall" value={pct(b.defect.recall)} />
            <Stat label="Cases" value={String(b.n)} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Synthetic SI/BL pairs with known answers, never seen in tuning: 4 formats, 3 label vocabularies, planted defects.</p>
        </Card>
        <Card title="Unseen email wording">
          <div className="text-3xl font-semibold tabular-nums">{pct(validation.paraphrases.accuracy_rules_plus_llm, 0)}</div>
          <div className="mt-2 divide-y divide-border">
            <Stat label="Rules only" value={pct(validation.paraphrases.accuracy_rules_only, 0)} />
            <Stat label="Rules + AI" value={pct(validation.paraphrases.accuracy_rules_plus_llm, 0)} tone="text-ok" />
            <Stat label="Phrasings" value={String(validation.paraphrases.n)} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Paraphrased requests the rules have never seen: the AI fallback closes the gap.</p>
        </Card>
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[30rem] text-sm">
          <caption className="border-b border-line px-4 py-3 text-left text-sm font-semibold">Held-out benchmark, per field</caption>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium">Field</th>
              <th className="px-4 py-2 text-right font-medium">Precision</th>
              <th className="px-4 py-2 text-right font-medium">Recall</th>
              <th className="px-4 py-2 text-right font-medium">Planted defects</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {fields.map(([f, v]) => (
              <tr key={f}>
                <td className="px-4 py-2">{FIELD_LABEL[f]}</td>
                <td className="px-4 py-2 text-right tabular-nums">{pct(v.precision)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{pct(v.recall)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{v.support}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Which fields differ most often and why cases were escalated, from the live database. */
export function DiscrepancySection({ metrics: m }: { metrics: Metrics | null }) {
  if (!m) return <Skeleton className="h-48 w-full" />;
  const fields = Object.entries(m.defect_fields).sort((a, b) => b[1] - a[1]);
  const reasons = Object.entries(m.review_reasons).sort((a, b) => b[1] - a[1]);
  const flagged = fields.reduce((n, [, c]) => n + c, 0);
  const fmax = Math.max(1, ...fields.map(([, c]) => c));
  const rmax = Math.max(1, ...reasons.map(([, c]) => c));
  return (
    <section aria-labelledby="disc-h">
      <div id="disc-h"><Heading title="Discrepancies found" sub="What the checker caught across all BL comparisons." /></div>
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiTile label="Emails with a mismatch" value={m.bl_comparison_status.MISMATCH ?? 0} tone="bad" />
        <KpiTile label="Fields flagged in total" value={flagged} tone="bad" />
        <KpiTile label="Escalated to a person" value={m.bl_comparison_status.NEEDS_REVIEW ?? 0} tone="warn" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Mismatches by field">
          <div className="space-y-3">
            {fields.length === 0 && <p className="text-sm text-muted-foreground">No mismatches yet.</p>}
            {fields.map(([f, c]) => <Bar key={f} label={FIELD_LABEL[f as FieldName] ?? f} value={c} max={fmax} tone="bad" />)}
          </div>
        </Card>
        <Card title="Why cases need a person">
          <div className="space-y-3">
            {reasons.length === 0 && <p className="text-sm text-muted-foreground">No escalations yet.</p>}
            {reasons.map(([r, c]) => <Bar key={r} label={REASON_LABEL[r] ?? r} value={c} max={rmax} tone="warn" />)}
          </div>
        </Card>
      </div>
    </section>
  );
}

function Step({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <li className="flex-1 rounded-xl border border-line bg-surface p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </li>
  );
}

/** The cascade as a stepper: rules first, AI where rules abstain, code decides, a person resolves the rest. */
export function PipelineSection() {
  const { data } = useApi<PipelineStats>("/metrics/pipeline");
  if (!data) return <Skeleton className="h-48 w-full" />;
  const f = data.funnel;
  const share = f.emails ? Math.round((f.decided_by_rules / f.emails) * 100) : 0;
  const stages = Object.entries(data.stages);
  return (
    <section aria-labelledby="pipe-h">
      <div id="pipe-h"><Heading title="How every email was decided" sub="Rules first, AI where rules abstain, code makes every final decision, a person resolves what the system will not guess." /></div>
      <ol className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        <Step label="Emails" value={f.emails} />
        <Step label="Rules decided" value={`${share}%`} sub={`${f.decided_by_rules} emails`} />
        <Step label="AI needed" value={f.needed_ai} sub="rules abstained" />
        <Step label="BL comparisons" value={f.bl_comparisons} sub={`${f.ok} ${STATUS_LABEL.OK} · ${f.mismatch} ${STATUS_LABEL.MISMATCH} · ${f.needs_review} ${STATUS_LABEL.NEEDS_REVIEW}`} />
        <Step label="Vision-read scans" value={f.vision_used} />
        <Step label="Human reviewed" value={f.human_reviewed} />
      </ol>
      {stages.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[28rem] text-sm">
            <caption className="border-b border-line px-4 py-3 text-left text-sm font-semibold">
              Stage latency and method mix{data.traced ? ` (${data.traced} traced emails)` : ""}
            </caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Method mix</th>
                <th className="px-4 py-2 text-right font-medium">p50</th>
                <th className="px-4 py-2 text-right font-medium">p95</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stages.map(([name, v]) => (
                <tr key={name}>
                  <td className="px-4 py-2">{STAGE_LABEL[name] ?? name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{Object.entries(v.by_method).map(([m, c]) => `${m} ${c}`).join(" · ")}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMs(v.p50_ms)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMs(v.p95_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Human-in-the-loop numbers: same tiles as the review queue, plus how often a person changed the verdict. */
export function HumanSection() {
  const { data } = useApi<ReviewStats>("/metrics/reviews");
  if (!data) return <Skeleton className="h-32 w-full" />;
  const transitions = Object.entries(data.transitions);
  return (
    <section aria-labelledby="human-h">
      <div id="human-h"><Heading title="Human in the loop" sub="Every escalation ends with a person, and every decision is audited." /></div>
      <ReviewStatsTiles stats={data} />
      <div className="mt-3 rounded-xl border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold">Verdicts changed by humans</h3>
        {transitions.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No verdict has been changed by a review yet. <Link href="/review" className="underline">Open the review queue</Link>.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {transitions.map(([k, n]) => {
              const [from, to] = k.split("→");
              return (
                <li key={k} className="flex justify-between gap-3">
                  <span>{STATUS_LABEL[from as keyof typeof STATUS_LABEL] ?? from} → {STATUS_LABEL[to as keyof typeof STATUS_LABEL] ?? to}</span>
                  <span className="font-medium tabular-nums">{n}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

