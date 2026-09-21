import type { ReviewStats } from "@/lib/api";
import { KpiTile } from "@/components/ui";

/** The four human-in-the-loop numbers, shared by the review queue and the metrics page. */
export function ReviewStatsTiles({ stats }: { stats: ReviewStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile label="Waiting for a person" value={stats.queue_open} tone={stats.queue_open ? "warn" : "ok"} hint="escalated, not yet reviewed" />
      <KpiTile label="Reviewed" value={stats.total} hint={`${stats.confirmed} confirmed`} />
      <KpiTile label="Corrections made" value={stats.corrected} hint="values changed by a person" />
      <KpiTile label="Verdicts changed by humans" value={stats.verdict_changed} hint="status differs after review" />
    </div>
  );
}
