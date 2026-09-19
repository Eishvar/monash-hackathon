"use client";

import { CATEGORY_LABEL, FIELD_LABEL, STATUS_LABEL, type Category, type FieldName, type Metrics, type Status } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import validation from "@/data/validation.json";
import { Bar, Card, ErrorBanner, KpiTile, PageHeader, Skeleton } from "@/components/ui";

const pct = (x: number | null | undefined) => (x == null ? "–" : `${Math.round(x * 100)}%`);

const REASON_SHORT: Record<string, string> = {
  missing_attachment: "Missing attachment",
  unreadable: "Unreadable document",
  wrong_doc_type: "Wrong document type",
  missing_value: "Missing value",
};

function Distribution({ data, labels, tone }: { data: Record<string, number>; labels?: Record<string, string>; tone?: "accent" | "bad" | "warn" | "ok" }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <p className="text-sm text-muted">No data yet.</p>;
  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => (
        <Bar key={k} label={labels?.[k] ?? k} value={v} max={max} tone={tone} />
      ))}
    </div>
  );
}

export default function MetricsPage() {
  const { data: m, error, loading, reload } = useApi<Metrics>("/metrics");
  const v = validation;

  return (
    <>
      <PageHeader title="Metrics" subtitle="How much the rules decide, what the AI costs, and how accurate the checker is." />
      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={reload} /></div>}
      {loading && !m && <Skeleton className="h-40 w-full" />}

      {m && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiTile label="Decided by rules" value={pct(m.rule_share)} hint={`${m.decided_by.llm ?? 0} needed AI`} tone="ok" />
            <KpiTile label="LLM calls (latest run)" value={m.llm_calls} hint={`${m.cache_hits} cache hits`} />
            <KpiTile label="Est. AI cost" value={`$${m.estimated_cost_usd.toFixed(4)}`} hint={`${(m.tokens.prompt + m.tokens.completion).toLocaleString()} tokens`} />
            <KpiTile label="Review queue" value={m.review_queue} tone={m.review_queue ? "warn" : undefined} hint={`${m.reviewed} reviewed by people`} />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Emails by category">
              <Distribution data={m.categories} labels={CATEGORY_LABEL as Record<Category, string>} />
            </Card>
            <Card title="BL comparisons by outcome">
              <Distribution data={m.bl_comparison_status} labels={STATUS_LABEL as Record<Status, string>} tone="accent" />
            </Card>
            <Card title="Fields with mismatches">
              <Distribution data={m.defect_fields} labels={FIELD_LABEL as Record<FieldName, string>} tone="bad" />
            </Card>
            <Card title="Why cases were escalated">
              <Distribution data={m.review_reasons} labels={REASON_SHORT} tone="warn" />
            </Card>
          </div>

          <Card title="Models and latest run">
            {m.latest_run ? (
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted">Run</dt>
                <dd className="font-mono">{m.latest_run.id}</dd>
                {Object.entries(m.latest_run.models ?? {}).map(([role, model]) => (
                  <div key={role} className="contents">
                    <dt className="text-muted">{role === "classify" ? "Text tasks" : "Vision (scans)"}</dt>
                    <dd className="font-mono">{model}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted">No run recorded yet.</p>
            )}
          </Card>
        </div>
      )}

      <h2 className="mb-3 mt-8 text-base font-semibold">Validation</h2>
      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Dataset (520 emails, scored by the organiser's scorer)">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="pb-2 font-medium">Configuration</th>
                <th className="pb-2 text-right font-medium">Final</th>
                <th className="pb-2 text-right font-medium">End-to-end</th>
                <th className="pb-2 text-right font-medium">Rules</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Rules only", v.bundle.rules_only],
                ["Rules + AI", v.bundle.rules_plus_llm],
              ].map(([name, s]) => {
                const row = s as typeof v.bundle.rules_only;
                return (
                  <tr key={name as string} className="border-t border-line">
                    <td className="py-2">{name as string}</td>
                    <td className="py-2 text-right tabular-nums">{row.final.toFixed(3)}</td>
                    <td className="py-2 text-right tabular-nums">{row.end_to_end}</td>
                    <td className="py-2 text-right tabular-nums">{pct(row.rule_share)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">
            The provided dataset is friendly to rules, so both score alike. That is why the second test exists.
          </p>
        </Card>
        <Card title={`Unseen phrasings (${v.paraphrases.n} hand-written emails)`}>
          <div className="space-y-2">
            <Bar label="Rules only" value={Math.round(v.paraphrases.accuracy_rules_only * 100)} max={100} tone="warn" />
            <Bar label="Rules + AI" value={Math.round(v.paraphrases.accuracy_rules_plus_llm * 100)} max={100} tone="ok" />
          </div>
          <p className="mt-3 text-xs text-muted">
            Classification accuracy (%) on emails worded differently from the dataset. The AI tier is what generalises;
            the rules never fire wrongly, they abstain. Generated {v.generated}.
          </p>
        </Card>
      </div>
    </>
  );
}
