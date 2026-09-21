"use client";

import Link from "next/link";
import { REASON_LABEL, type QueueItem, type ReviewStats } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { ReviewStatsTiles } from "@/components/ReviewStatsTiles";
import { Card, ErrorBanner, PageHeader, Skeleton, StatusPill, buttonSecondary } from "@/components/ui";
import { Separator } from "@/components/ui/separator";

const ORDER = ["processing_error", "missing_attachment", "unreadable", "wrong_doc_type", "missing_value"];
const REASON_BADGE: Record<string, string> = {
  processing_error: "bg-err-bg text-err",
  missing_attachment: "bg-warn-bg text-warn",
  unreadable: "bg-ai-bg text-ai",
  wrong_doc_type: "bg-warn-bg text-warn",
  missing_value: "bg-err-bg text-err",
};
const TITLE: Record<string, string> = { processing_error: "Processing failed — retry", ...REASON_LABEL };

export default function ReviewQueue() {
  const { data, error, loading, reload } = useApi<QueueItem[]>("/review-queue");
  const stats = useApi<ReviewStats>("/metrics/reviews");

  const groups = new Map<string, QueueItem[]>();
  for (const q of data ?? []) {
    const key = q.result.status === "ERROR" ? "processing_error" : (q.result.review_reason ?? "other");
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  const keys = [...groups.keys()].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

  return (
    <>
      <PageHeader
        title="Review queue"
        subtitle="Cases the system would not guess on. Open one, check the source values, confirm or correct."
        actions={<button className={buttonSecondary} onClick={() => { reload(); stats.reload(); }}>Refresh</button>}
      />
      {stats.data && <div className="mb-6"><ReviewStatsTiles stats={stats.data} /></div>}
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-40 w-full" />}
      {data && data.length === 0 && (
        <Card>
          <p className="text-sm text-muted-foreground">The queue is empty. Every escalated case has been reviewed.</p>
        </Card>
      )}
      <div className="space-y-8">
        {keys.map((k) => (
          <section key={k} aria-labelledby={`g-${k}`}>
            <div className="mb-3">
              <div className="mb-2 flex items-center gap-2">
                <h2 id={`g-${k}`} className="text-sm font-semibold text-foreground">{TITLE[k] ?? k}</h2>
                <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">{groups.get(k)!.length}</span>
              </div>
              <Separator />
            </div>
            <ul className="space-y-3">
              {groups.get(k)!.map((q) => (
                <li key={q.email_id}>
                  <Link href={`/emails/${q.email_id}`} className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{q.email_id}</span>
                          <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${REASON_BADGE[k] ?? "bg-muted text-muted-foreground"}`}>{TITLE[k] ?? k}</span>
                        </div>
                        <p className="truncate text-sm font-medium">{q.subject || "(no subject)"}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{q.sender}</p>
                        {q.result.explanation && <p className="mt-2 line-clamp-2 text-sm italic text-muted-foreground">{q.result.explanation}</p>}
                        {q.result.provisional_fields.length > 0 && <p className="mt-2 text-xs font-medium text-ai">AI vision values ready to confirm</p>}
                      </div>
                      <span className="shrink-0 text-sm font-medium text-foreground">Review →</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {stats.data && stats.data.recent.length > 0 && (
        <section className="mt-10" aria-labelledby="recent-reviews">
          <h2 id="recent-reviews" className="mb-3 text-sm font-semibold">Recently reviewed</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {stats.data.recent.map((r, i) => (
              <li key={`${r.email_id}-${i}`}>
                <Link href={`/emails/${r.email_id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors hover:bg-muted/40">
                  <span className="font-mono text-xs text-muted-foreground">{r.email_id}</span>
                  <span className="min-w-0 flex-1 truncate">{r.subject || "(no subject)"}</span>
                  <span className="text-xs text-muted-foreground">{r.action === "correct" ? "Corrected" : "Confirmed"}</span>
                  {r.before_status && r.after_status && (
                    <span className="inline-flex items-center gap-1.5">
                      <StatusPill status={r.before_status} />
                      <span aria-label="became" className="text-muted-foreground">→</span>
                      <StatusPill status={r.after_status} />
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
