"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, FileJson, FileSpreadsheet } from "lucide-react";
import { apiGet, CATEGORY_LABEL, type Category, type EmailRow, type Metrics, type Status } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { displayId, friendlySubject } from "@/lib/subject";
import { ErrorBanner, FieldChip, Skeleton, StatusPill, buttonSecondary } from "@/components/ui";
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
    try {
      const more = await apiGet<EmailRow[]>(`/emails?${query}&limit=${PAGE}&offset=${current.rows.length}`);
      // guarded by the key: a result for a filter the user has already left is dropped
      setState((s) => (s && s.key === query ? { ...s, rows: [...s.rows, ...more], done: more.length < PAGE } : s));
    } catch (e) {
      setState((s) => (s && s.key === query ? { ...s, error: (e as Error).message } : s));
    } finally {
      setBusy(false);
    }
  }, [current, query]);

  return { rows: current?.rows ?? [], loading: current === null, done: current?.done ?? true, error: current?.error ?? null, busy, loadMore };
}

const CATEGORY_DOT: Record<Category, string> = {
  BL_COMPARISON: "bg-foreground",
  SI_REQUEST: "bg-ok",
  INVOICE_QUERY: "bg-warn",
  GENERAL: "bg-muted-foreground",
  SPAM: "bg-bad",
};

const EXPORTS = [
  { href: "/api/py/export/csv", download: "shippr-discrepancies.csv", title: "Discrepancy report (CSV)", desc: "Mismatched emails, the fields that differ, and the AI explanation", Icon: FileSpreadsheet },
  { href: "/api/py/export/submission?include_extra=true", download: "submission.json", title: "All results (JSON)", desc: "Every email in the organiser's submission format", Icon: FileJson },
];

function ExportMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button className={buttonSecondary} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        Export
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-80 rounded-xl border border-border bg-card p-1 shadow-xl">
          {EXPORTS.map(({ href, download, title, desc, Icon }) => (
            <a key={href} href={href} download={download} role="menuitem" onClick={() => setOpen(false)} className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-muted-foreground">{desc}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS: { value: Status | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "OK", label: "OK" },
  { value: "MISMATCH", label: "Mismatch" },
  { value: "NEEDS_REVIEW", label: "Needs review" },
  { value: "ERROR", label: "Error" },
];

/** Segmented status filter. Only BL comparisons carry a verdict, so a status filter also limits to BL comparisons. */
function StatusTabs({ value, onChange, counts, total }: { value: Status | ""; onChange: (v: Status | "") => void; counts: Record<string, number> | null; total: number | null }) {
  return (
    <div role="tablist" aria-label="Filter by status" className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-1">
      {TABS.filter((t) => t.value !== "ERROR" || value === "ERROR" || (counts?.ERROR ?? 0) > 0).map((t) => {
        const active = value === t.value;
        const n = t.value === "" ? total : (counts?.[t.value] ?? 0);
        return (
          <button
            key={t.label}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors ${
              active ? "border border-border bg-card font-medium text-foreground shadow-sm" : "border border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {n !== null && <span className="text-xs tabular-nums text-muted-foreground">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

const HEAD = "px-3 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground";

export default function Page() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | "">("");
  const query = status ? `category=BL_COMPARISON&status=${status}` : "";
  const { rows, loading, done, error, busy, loadMore } = useEmails(query);
  const { data: m, error: metricsError } = useApi<Metrics>("/metrics");

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">SI vs draft BL verification — every email is triaged and checked field by field.</p>
        </div>
        <ExportMenu />
      </div>
      {(error || metricsError) && <div className="mb-4"><ErrorBanner message={error ?? metricsError ?? ""} /></div>}

      <div className="mb-3">
        <StatusTabs value={status} onChange={setStatus} counts={m?.bl_comparison_status ?? null} total={m ? m.total_emails : null} />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/30 hover:bg-muted/30">
              <TableHead className={`${HEAD} w-[11%]`}>Email</TableHead>
              <TableHead className={`${HEAD} w-[29%]`}>Subject</TableHead>
              <TableHead className={`${HEAD} w-[17%]`}>Sender</TableHead>
              <TableHead className={`${HEAD} w-[18%]`}>Category</TableHead>
              <TableHead className={`${HEAD} w-[19%]`}>Status</TableHead>
              <TableHead className={`${HEAD} w-[6%]`} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6} className="px-3 py-2">
                    <Skeleton className="h-12 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  {status ? "No emails with this status." : "Nothing here yet. Open Process to run the inbox."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((e) => {
                const { title, detail } = friendlySubject(e.subject, e.result?.category);
                return (
                  <TableRow key={e.email_id} onClick={() => router.push(`/emails/${e.email_id}`)} className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                    <TableCell className="px-3 py-3 text-sm tabular-nums text-muted-foreground">{displayId(e.email_id)}</TableCell>
                    <TableCell className="px-3 py-3">
                      <Link href={`/emails/${e.email_id}`} onClick={(ev) => ev.stopPropagation()} className="block truncate text-sm font-medium hover:underline">
                        {title}
                      </Link>
                      {detail && <div className="truncate text-xs text-muted-foreground">{detail}</div>}
                      {e.result && e.result.defect_fields.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {e.result.defect_fields.map((f) => (
                            <FieldChip key={f} field={f} />
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <span className="block truncate text-sm text-muted-foreground">{e.sender ?? "—"}</span>
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      {e.result ? (
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${CATEGORY_DOT[e.result.category]}`} />
                          <span className="truncate text-sm text-muted-foreground">{CATEGORY_LABEL[e.result.category]}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not processed</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      {e.result?.category === "BL_COMPARISON" ? <StatusPill status={e.result.status} /> : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </TableCell>
                  </TableRow>
                );
              })
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
