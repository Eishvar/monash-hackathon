"use client";

import type { Result, Review } from "@/lib/api";
import { StatusPill } from "@/components/ui";

interface Props {
  result: Result | null;
  reviews: Review[];
}

export function ReviewActivityDrawer({ result, reviews }: Props) {
  return (
    <div className="sticky top-6 space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Review Activity</h2>

      {/* Same condition as the page's `needsReview`: ERROR also needs a human */}
      {result && (result.status === "NEEDS_REVIEW" || result.status === "ERROR") && !result.reviewed && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          This document is pending human review. Actions taken in the Review card are recorded here.
        </div>
      )}

      {reviews.length === 0 ? (
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border border-muted-foreground" />
          <div>
            <p className="font-medium">No review activity yet.</p>
            <p className="mt-0.5 text-xs">Operator actions will appear here.</p>
          </div>
        </div>
      ) : (
        <ol className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="flex items-start gap-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.action === "confirm" ? "bg-ok" : "bg-warn"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.action === "confirm" ? "Confirmed" : "Corrected"}</p>
                <p className="font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
                {r.before && r.after && (
                  <div className="mt-2 grid grid-cols-[4rem_1fr] items-center gap-x-2 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Before</span>
                    <span>
                      <StatusPill status={r.before.status} />
                    </span>
                    <span className="text-muted-foreground">After</span>
                    <span>
                      <StatusPill status={r.after.status} />
                    </span>
                  </div>
                )}
                {r.note && <p className="mt-1 text-xs italic text-muted-foreground">&ldquo;{r.note}&rdquo;</p>}
              </div>
            </li>
          ))}
        </ol>
      )}

      {!result && <p className="text-xs text-muted-foreground">Process this email first to enable review.</p>}
    </div>
  );
}
