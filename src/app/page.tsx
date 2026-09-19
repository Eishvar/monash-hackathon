"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  apiGet,
  CATEGORIES,
  CATEGORY_LABEL,
  describeReview,
  STATUSES,
  STATUS_LABEL,
  type EmailRow,
  type Metrics,
} from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { CategoryBadge, DecidedBy, ErrorBanner, FieldChip, KpiTile, PageHeader, Skeleton, StatusPill, buttonSecondary } from "@/components/ui";

const PAGE = 50;

interface Paged {
  key: string;
  rows: EmailRow[];
  done: boolean;
  error: string | null;
}

function useEmails(query: string) {
  const [state, setState] = useState<Paged | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<EmailRow[]>(`/emails?${query}&limit=${PAGE}&offset=0`)
      .then((rows) => !cancelled && setState({ key: query, rows, done: rows.length < PAGE, error: null }))
      .catch((e: Error) => !cancelled && setState({ key: query, rows: [], done: true, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [query]);

  const current = state && state.key === query ? state : null;
  const loadMore = useCallback(async () => {
    if (!current) return;
    setBusy(true);
    try {
      const more = await apiGet<EmailRow[]>(`/emails?${query}&limit=${PAGE}&offset=${current.rows.length}`);
      setState({ ...current, rows: [...current.rows, ...more], done: more.length < PAGE });
    } catch (e) {
      setState({ ...current, error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }, [current, query]);

  return { rows: current?.rows ?? [], loading: current === null, done: current?.done ?? true, error: current?.error ?? null, busy, loadMore };
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
        active ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface text-muted hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Inbox() {
  const router = useRouter();
  const params = useSearchParams();
  const category = params.get("category") ?? "";
  const status = params.get("status") ?? "";
  const query = new URLSearchParams({ ...(category && { category }), ...(status && { status }) }).toString();
  const { rows, loading, done, error, busy, loadMore } = useEmails(query);
  const { data: m, error: metricsError } = useApi<Metrics>("/metrics");

  const setFilter = (key: "category" | "status", value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value && next.get(key) !== value) next.set(key, value);
    else next.delete(key);
    router.replace(next.size ? `/?${next}` : "/");
  };

  const mismatches = m?.bl_comparison_status?.MISMATCH ?? 0;
  const needsReview = m?.bl_comparison_status?.NEEDS_REVIEW ?? 0;

  return (
    <>
      <PageHeader title="Inbox" subtitle="Every email is triaged; BL comparisons are checked field by field." />
      {(error || metricsError) && <div className="mb-4"><ErrorBanner message={error ?? metricsError ?? ""} /></div>}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Processed" value={m ? `${m.processed}/${m.total_emails}` : "–"} hint={m && m.unprocessed ? `${m.unprocessed} waiting` : "inbox up to date"} />
        <KpiTile label="Mismatches" value={m ? mismatches : "–"} tone={mismatches ? "bad" : undefined} hint="BL ≠ SI" />
        <KpiTile label="Needs review" value={m ? needsReview : "–"} tone={needsReview ? "warn" : undefined} hint={m ? `${m.review_queue} in queue` : undefined} />
        <KpiTile label="Decided by rules" value={m?.rule_share != null ? `${Math.round(m.rule_share * 100)}%` : "–"} hint="the rest needed AI" />
      </div>

      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by category">
          <span className="w-16 text-xs font-medium uppercase tracking-wide text-muted">Category</span>
          {CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setFilter("category", c)}>
              {CATEGORY_LABEL[c]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
          <span className="w-16 text-xs font-medium uppercase tracking-wide text-muted">Status</span>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setFilter("status", s)}>
              {STATUS_LABEL[s]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {loading ? (
          <div className="space-y-4 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">
            {category || status ? "No emails match these filters." : "Nothing here yet. Open Process to run the inbox."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((e) => (
              <li key={e.email_id}>
                <Link href={`/emails/${e.email_id}`} className="grid gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-surface-2 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{e.subject || "(no subject)"}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="font-mono">{e.email_id}</span>
                      <span className="truncate">{e.sender}</span>
                      {e.attachments.length > 0 && <span>{e.attachments.length} attachments</span>}
                    </div>
                    {e.result && e.result.defect_fields.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {e.result.defect_fields.map((f) => (
                          <FieldChip key={f} field={f} />
                        ))}
                      </div>
                    )}
                    {e.result && e.result.status !== "OK" && e.result.status !== "MISMATCH" && (
                      <div className="mt-1 text-xs text-warn">{describeReview(e.result)}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {e.result ? (
                      <>
                        <CategoryBadge category={e.result.category} />
                        {e.result.category === "BL_COMPARISON" && <StatusPill status={e.result.status} />}
                        <DecidedBy result={e.result} />
                      </>
                    ) : (
                      <span className="text-xs text-muted">not processed</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!loading && !done && (
        <div className="mt-4 text-center">
          <button onClick={loadMore} disabled={busy} className={buttonSecondary}>
            {busy ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
      {!loading && rows.length > 0 && <p className="mt-3 text-center text-xs text-muted">{rows.length} shown</p>}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Inbox />
    </Suspense>
  );
}
