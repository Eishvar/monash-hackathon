import type { ReviewStats } from "@/lib/api";

/** Human-in-the-loop numbers as one compact strip (review queue header and metrics page). */
export function ReviewStatsTiles({ stats }: { stats: ReviewStats }) {
  const items = [
    { label: "waiting for a person", value: stats.queue_open, warn: stats.queue_open > 0 },
    { label: "reviewed", value: stats.total },
    { label: "corrected", value: stats.corrected },
    { label: "verdicts changed", value: stats.verdict_changed },
  ];
  return (
    <dl className="flex flex-wrap divide-x divide-border rounded-xl border border-border bg-card">
      {items.map((i) => (
        <div key={i.label} className="flex min-w-[8.5rem] flex-1 items-baseline gap-2 px-4 py-3">
          <dd className={`text-xl font-semibold tabular-nums ${i.warn ? "text-warn" : ""}`}>{i.value}</dd>
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
        </div>
      ))}
    </dl>
  );
}
