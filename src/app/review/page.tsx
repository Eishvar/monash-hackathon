"use client";

import Link from "next/link";
import { REASON_LABEL, type QueueItem } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card, ErrorBanner, PageHeader, Skeleton, buttonSecondary } from "@/components/ui";

const ORDER = ["processing_error", "missing_attachment", "unreadable", "wrong_doc_type", "missing_value"];
const TITLE: Record<string, string> = { processing_error: "Processing failed — retry", ...REASON_LABEL };

export default function ReviewQueue() {
  const { data, error, loading, reload } = useApi<QueueItem[]>("/review-queue");

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
        actions={<button className={buttonSecondary} onClick={reload}>Refresh</button>}
      />
      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-40 w-full" />}
      {data && data.length === 0 && (
        <Card>
          <p className="text-sm text-muted">The queue is empty. Every escalated case has been reviewed.</p>
        </Card>
      )}
      <div className="space-y-5">
        {keys.map((k) => (
          <section key={k} aria-labelledby={`g-${k}`}>
            <h2 id={`g-${k}`} className="mb-2 flex items-center gap-2 text-sm font-semibold">
              {TITLE[k] ?? k}
              <span className="rounded-full bg-warn-bg px-2 text-xs font-semibold text-warn">{groups.get(k)!.length}</span>
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {groups.get(k)!.map((q) => (
                <li key={q.email_id}>
                  <Link href={`/emails/${q.email_id}`} className="block h-full rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-surface-2">
                    <div className="truncate text-sm font-medium">{q.subject || "(no subject)"}</div>
                    <div className="mt-0.5 flex gap-3 text-xs text-muted">
                      <span className="font-mono">{q.email_id}</span>
                      <span className="truncate">{q.sender}</span>
                    </div>
                    {q.result.explanation && <p className="mt-2 line-clamp-3 text-sm text-muted">{q.result.explanation}</p>}
                    {q.result.provisional_fields.length > 0 && (
                      <p className="mt-2 text-xs font-medium text-ai">AI-read values from the scan are ready to confirm</p>
                    )}
                    <span className="mt-3 inline-block text-sm font-medium text-accent">Review →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
