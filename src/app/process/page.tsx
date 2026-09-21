"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { ArrowRight, Download, FileText, Inbox, UploadCloud, X } from "lucide-react";
import { apiGet, apiPost, apiUpload, type BatchResponse, type EmailRow, type Metrics, type UploadResponse } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { friendlySubject } from "@/lib/subject";
import { FieldTable } from "@/components/FieldTable";
import { Section, VerdictCard } from "@/components/ResultPanel";
import { ErrorBanner, StatusPill, buttonPrimary, buttonSecondary } from "@/components/ui";

const MAX_FILES = 4;
const MAX_BYTES = 4_000_000; // the hosting platform rejects larger request bodies

type Role = "auto" | "email" | "SI" | "BL";
const ROLE_LABEL: Record<Role, string> = { auto: "Auto-detect", email: "Email", SI: "Shipping instruction", BL: "Draft BL" };
const ROLE_SHORT: Record<string, string> = { email: "Email", SI: "SI", BL: "Draft BL" };

interface Picked {
  id: string;
  file: File;
  role: Role;
}

const SAMPLES = [
  { kind: "email", label: "Email" },
  { kind: "si", label: "Shipping instruction" },
  { kind: "bl", label: "Draft BL (mismatch)" },
  { kind: "bl-clean", label: "Draft BL (clean)" },
];

const kb = (n: number) => (n < 1_000_000 ? `${Math.max(1, Math.round(n / 1000))} KB` : `${(n / 1_000_000).toFixed(1)} MB`);

const STAGES = [
  { upTo: 18, label: "Uploading files" },
  { upTo: 45, label: "Reading the documents" },
  { upTo: 80, label: "Comparing the seven fields" },
  { upTo: 99, label: "Writing the summary" },
  { upTo: 101, label: "Done" },
];

function RadialProgress({ pct }: { pct: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-36 w-36" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} className="fill-none stroke-muted" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={r}
          className="fill-none stroke-foreground transition-[stroke-dashoffset] duration-300 ease-out"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-3xl font-semibold tabular-nums">{Math.round(pct)}%</div>
    </div>
  );
}

function ResultView({ run, onAgain }: { run: UploadResponse; onAgain: () => void }) {
  const { email, result, detected } = run;
  const { title, detail } = friendlySubject(email.subject, result.category);
  const rows = result.fields.length ? result.fields : result.provisional_fields;
  const suggested = result.fields.length === 0 && result.provisional_fields.length > 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail ? `${detail} · ` : ""}from {email.sender ?? "unknown sender"}
          </p>
        </div>
        {result.category === "BL_COMPARISON" && <StatusPill status={result.status} />}
      </div>

      <div className="flex flex-wrap gap-2">
        {detected.map((d) => (
          <span key={d.filename} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {d.filename}
            <span className="text-muted-foreground">· {ROLE_SHORT[d.role] ?? d.role}</span>
          </span>
        ))}
      </div>

      <VerdictCard result={result} />

      {result.category === "BL_COMPARISON" && rows.length > 0 && (
        <Section
          title={suggested ? "Values suggested from the scan" : "Field comparison"}
          description={suggested ? "Read from the scanned pages by an AI model" : "Shipping instruction (reference) against the draft bill of lading"}
        >
          <FieldTable rows={rows} suggested={suggested} />
        </Section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-5 py-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Inbox className="h-4 w-4" aria-hidden="true" />
          Added to your Inbox and counted in the metrics.
        </p>
        <div className="flex gap-2">
          <Link href={`/emails/${email.email_id}`} className={buttonSecondary}>
            Open full report <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <button className={buttonPrimary} onClick={onAgain}>
            Upload another
          </button>
        </div>
      </div>
    </div>
  );
}

function BatchRunner() {
  const { data: m, reload } = useApi<Metrics>("/metrics");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  async function allIds(): Promise<string[]> {
    const ids: string[] = [];
    for (let offset = 0; ; offset += 200) {
      const rows = await apiGet<EmailRow[]>(`/emails?limit=200&offset=${offset}`);
      ids.push(...rows.map((r) => r.email_id));
      if (rows.length < 200) return ids;
    }
  }

  async function run(mode: "remaining" | "all") {
    setRunning(true);
    setError(null);
    setDone(0);
    stop.current = false;
    const runId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    try {
      let ids: string[] | null = mode === "all" ? await allIds() : null;
      let n = 0;
      while (!stop.current) {
        const body = ids ? { run_id: runId, ids: ids.slice(0, 8) } : { run_id: runId, limit: 8 };
        const res = await apiPost<BatchResponse>("/process-batch", body);
        n += res.processed.length;
        setDone(n);
        if (ids) ids = ids.filter((i) => !res.processed.includes(i));
        if (res.processed.length === 0 || (ids ? ids.length === 0 : res.remaining === 0)) break;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      reload();
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Re-runs the pipeline on the emails already in the inbox ({m ? `${m.unprocessed} waiting` : "…"}). Results are cached, so re-runs are cheap. Reviewed results are reset when an email is reprocessed.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button className={buttonSecondary} disabled={running || !m || m.unprocessed === 0} onClick={() => run("remaining")}>
          {m && m.unprocessed === 0 ? "Nothing waiting" : "Process remaining"}
        </button>
        <button className={buttonSecondary} disabled={running || !m} onClick={() => run("all")}>
          Reprocess everything
        </button>
        {running && (
          <button className={buttonSecondary} onClick={() => (stop.current = true)}>
            Stop after this batch
          </button>
        )}
        {done !== null && <span className="text-sm text-muted-foreground" aria-live="polite">{done} processed{running ? "…" : ""}</span>}
      </div>
      {error && <ErrorBanner message={error} />}
    </div>
  );
}

export default function ProcessPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [drag, setDrag] = useState(false);
  const [phase, setPhase] = useState<"idle" | "processing" | "finishing" | "done" | "error">("idle");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<UploadResponse | null>(null);
  const [history, setHistory] = useState<UploadResponse[]>([]);

  // Ease towards 90 % while the request is in flight; the response snaps it to 100 %. Quick jobs therefore animate quickly.
  useEffect(() => {
    if (phase !== "processing") return;
    const t = setInterval(() => setPct((p) => p + (90 - p) * 0.06), 150);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function add(list: FileList | File[]) {
    const incoming = [...list];
    const pdfs = incoming.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    setError(pdfs.length < incoming.length ? "Only PDF files are accepted." : null);
    setPicked((cur) => [...cur, ...pdfs.map((file) => ({ id: crypto.randomUUID(), file, role: "auto" as Role }))].slice(0, MAX_FILES));
    if (phase === "error") setPhase("idle");
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    add(e.dataTransfer.files);
  }

  async function submit() {
    if (picked.reduce((a, p) => a + p.file.size, 0) > MAX_BYTES) {
      setError("The files are too large (limit 4 MB in total).");
      return;
    }
    setError(null);
    setPct(3);
    setPhase("processing");
    const form = new FormData();
    picked.forEach((p) => {
      form.append("files", p.file);
      form.append("roles", p.role);
    });
    try {
      const res = await apiUpload<UploadResponse>("/upload", form);
      setPct(100);
      setPhase("finishing");
      timers.current.push(
        setTimeout(() => {
          setRun(res);
          setHistory((h) => [res, ...h]);
          setPhase("done");
        }, 700),
      );
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  function again() {
    setPicked([]);
    setRun(null);
    setError(null);
    setPhase("idle");
  }

  const busy = phase === "processing" || phase === "finishing";
  const stage = STAGES.find((s) => pct < s.upTo)?.label ?? "Done";
  const total = picked.reduce((a, p) => a + p.file.size, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Process</h1>
        <p className="mt-1 text-sm text-muted-foreground">Upload an email or shipping documents as PDF. Shippr reads them, checks the shipping instruction against the draft bill of lading, and shows the result here.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => !busy && inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && inputRef.current?.click()}
              aria-label="Choose PDF files to upload"
              className={`flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${drag ? "border-foreground bg-muted/60" : "border-border hover:bg-muted/30"} ${busy ? "pointer-events-none opacity-50" : ""}`}
            >
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                <UploadCloud className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium">Drop PDFs here, or click to browse</p>
              <p className="mt-1 text-xs text-muted-foreground">An exported email, a shipping instruction or a draft BL. Up to {MAX_FILES} files, 4 MB in total.</p>
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => e.target.files && add(e.target.files)} />
            </div>

            {picked.length > 0 && (
              <ul className="mt-4 space-y-2">
                {picked.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm" title={p.file.name}>{p.file.name}</div>
                      <div className="text-xs text-muted-foreground">{kb(p.file.size)}</div>
                    </div>
                    <select
                      value={p.role}
                      disabled={busy}
                      aria-label={`Type of ${p.file.name}`}
                      onChange={(e) => setPicked((cur) => cur.map((x) => (x.id === p.id ? { ...x, role: e.target.value as Role } : x)))}
                      className="rounded-md border border-border bg-card px-2 py-1 text-xs"
                    >
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                    <button onClick={() => setPicked((cur) => cur.filter((x) => x.id !== p.id))} disabled={busy} aria-label={`Remove ${p.file.name}`} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error && phase !== "error" && <p className="mt-3 text-sm text-bad">{error}</p>}

            <div className="mt-4 flex items-center gap-3">
              <button className={`${buttonPrimary} flex-1`} disabled={picked.length === 0 || busy} onClick={submit}>
                {busy ? "Processing…" : picked.length > 1 ? `Process ${picked.length} files` : "Process"}
              </button>
              {picked.length > 0 && !busy && (
                <button className={buttonSecondary} onClick={again}>
                  Clear
                </button>
              )}
            </div>
            {picked.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{kb(total)} selected</p>}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">No PDFs at hand?</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Download a sample set, then drop the files above. The draft BL sample has a different consignee, so it will be flagged.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SAMPLES.map((s) => (
                <a key={s.kind} href={`/api/py/samples/${s.kind}`} download className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-muted">
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  {s.label}
                </a>
              ))}
            </div>
          </section>
        </div>

        <div className="min-w-0">
          {phase === "idle" && (
            <div className="flex min-h-[26rem] flex-col items-center justify-center rounded-xl border border-dashed border-border px-8 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium">Your result will appear here</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">Add one or more PDFs and press Process. When it finishes you will see the verdict, the field-by-field comparison and an AI summary. The email is also added to your Inbox and the metrics.</p>
            </div>
          )}

          {busy && (
            <div className="flex min-h-[26rem] flex-col items-center justify-center rounded-xl border border-border bg-card px-8 text-center" aria-live="polite">
              <RadialProgress pct={pct} />
              <p className="mt-5 text-sm font-medium">{stage}</p>
              <p className="mt-1 text-xs text-muted-foreground">{picked.map((p) => p.file.name).join(", ")}</p>
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-4">
              <ErrorBanner message={error ?? "Something went wrong."} />
              <p className="text-sm text-muted-foreground">Nothing was added. If a file&apos;s type could not be detected, pick it from the list on the left and try again.</p>
            </div>
          )}

          {phase === "done" && run && <ResultView run={run} onAgain={again} />}

          {history.length > 1 && (
            <section className="mt-8">
              <h2 className="mb-2 text-sm font-semibold">This session</h2>
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {history.map((h) => {
                  const { title } = friendlySubject(h.email.subject, h.result.category);
                  return (
                    <li key={h.email.email_id}>
                      <button onClick={() => { setRun(h); setPhase("done"); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/40">
                        <span className="min-w-0 flex-1 truncate">{title} <span className="text-muted-foreground">· {h.email.sender}</span></span>
                        {h.result.category === "BL_COMPARISON" && <StatusPill status={h.result.status} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>

      <details className="mt-10 rounded-xl border border-border bg-card">
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium">Advanced: reprocess the inbox</summary>
        <div className="border-t border-border p-5">
          <BatchRunner />
        </div>
      </details>
    </div>
  );
}
