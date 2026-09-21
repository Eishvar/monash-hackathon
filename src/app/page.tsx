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
  type Category,
  type EmailRow,
  type Metrics,
} from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { DecidedBy, ErrorBanner, FieldChip, Skeleton, StatusPill, buttonSecondary } from "@/components/ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
    // Functional updates guarded by the key: if the filter changed while this request was in flight, drop the result
    // instead of overwriting the newer query's rows with stale state (which left the list stuck on the skeleton).
    try {
      const more = await apiGet<EmailRow[]>(`/emails?${query}&limit=${PAGE}&offset=${current.rows.length}`);
      setState((s) => (s && s.key === query ? { ...s, rows: [...s.rows, ...more], done: more.length < PAGE } : s));
    } catch (e) {
      setState((s) => (s && s.key === query ? { ...s, error: (e as Error).message } : s));
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
      className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${
        active ? "border-foreground bg-foreground text-background" : "border-border bg-transparent text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

const CATEGORY_DOT: Record<Category, string> = {
  BL_COMPARISON: "bg-foreground",
  SI_REQUEST: "bg-ok",
  INVOICE_QUERY: "bg-warn",
  GENERAL: "bg-muted-foreground",
  SPAM: "bg-bad",
};

function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "bad" | "warn" | "ok" }) {
  const color = tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

const HEADS = ["Email ID", "Subject", "Sender", "Attachments", "Category", "Status", "By"];

function InboxContent() {
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
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">SI vs draft BL verification — every email is triaged and checked field by field.</p>
        </div>
        <button className={buttonSecondary} disabled title="Export arrives with the backend export step">
          Export ▾
        </button>
      </div>
      {(error || metricsError) && <div className="mb-4"><ErrorBanner message={error ?? metricsError ?? ""} /></div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Processed" value={m ? `${m.processed}/${m.total_emails}` : "–"} hint={m && m.unprocessed ? `${m.unprocessed} waiting` : "inbox up to date"} />
        <Kpi label="Mismatches" value={m ? mismatches : "–"} tone={mismatches ? "bad" : undefined} hint="BL ≠ SI" />
        <Kpi label="Needs Review" value={m ? needsReview : "–"} tone={needsReview ? "warn" : undefined} hint={m ? `${m.review_queue} in queue` : undefined} />
        <Kpi label="AI-Assisted" value={m?.rule_share != null ? `${Math.round((1 - m.rule_share) * 100)}%` : "–"} hint="semantic extraction & classification" />
      </div>

      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by category">
          <span className="w-20 shrink-0 text-xs uppercase tracking-wider text-muted-foreground">Category</span>
          {CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setFilter("category", c)}>
              {CATEGORY_LABEL[c]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
          <span className="w-20 shrink-0 text-xs uppercase tracking-wider text-muted-foreground">Status</span>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setFilter("status", s)}>
              {STATUS_LABEL[s]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-10 px-4 py-3">
                <input type="checkbox" aria-hidden="true" tabIndex={-1} readOnly className="cursor-default opacity-50" />
              </TableHead>
              {HEADS.map((h) => (
                <TableHead key={h} className="px-3 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {h}
                </TableHead>
              ))}
              <TableHead className="w-8 px-4 py-3" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={9} className="px-4 py-2">
                    <Skeleton className="h-12 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="p-8 text-center text-sm text-muted-foreground">
                  {category || status ? "No emails match these filters." : "Nothing here yet. Open Process to run the inbox."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((e) => (
                <TableRow key={e.email_id} onClick={() => router.push(`/emails/${e.email_id}`)} className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                  <TableCell className="px-3 py-3" onClick={(ev) => ev.stopPropagation()}>
                    <input type="checkbox" aria-hidden="true" tabIndex={-1} readOnly className="cursor-default opacity-50" />
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <span className="font-mono text-xs text-muted-foreground">{e.email_id}</span>
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <Link href={`/emails/${e.email_id}`} onClick={(ev) => ev.stopPropagation()} className="block max-w-[260px] truncate text-sm font-medium hover:underline">
                      {e.subject || "(no subject)"}
                    </Link>
                    {e.result && e.result.defect_fields.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {e.result.defect_fields.map((f) => (
                          <FieldChip key={f} field={f} />
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <span className="block max-w-[150px] truncate text-sm text-muted-foreground">{e.sender ?? "—"}</span>
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <span className="text-xs text-muted-foreground">{e.attachments.length > 0 ? `${e.attachments.length} files` : "—"}</span>
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    {e.result?.category ? (
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${CATEGORY_DOT[e.result.category]}`} />
                        <span className="text-sm text-muted-foreground">{CATEGORY_LABEL[e.result.category]}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unclassified</span>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    {!e.result ? (
                      <span className="text-xs text-muted-foreground">Not processed</span>
                    ) : e.result.category === "BL_COMPARISON" ? (
                      <>
                        <StatusPill status={e.result.status} />
                        {e.result.status !== "OK" && e.result.status !== "MISMATCH" && <div className="mt-1 max-w-[200px] text-xs text-warn">{describeReview(e.result)}</div>}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-3">{e.result && <DecidedBy result={e.result} />}</TableCell>
                  <TableCell className="px-3 py-3">
                    <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!loading && !done && (
        <div className="mt-4 text-center">
          <button onClick={loadMore} disabled={busy} className={buttonSecondary}>
            {busy ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
      {!loading && rows.length > 0 && <p className="mt-3 text-center text-xs text-muted-foreground">{rows.length} shown</p>}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <InboxContent />
    </Suspense>
  );
}
