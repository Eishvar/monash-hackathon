"use client";

import { useRef, useState } from "react";
import { apiGet, apiPost, type BatchResponse, type EmailRow, type Metrics } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Card, ErrorBanner, KpiTile, PageHeader, buttonPrimary, buttonSecondary } from "@/components/ui";

const BATCH = 8; // keeps one request well under the 60 s serverless limit even when the LLM is needed

interface Progress {
  done: number;
  total: number;
  log: { n: number; seconds: number }[];
  runId: string;
}

export default function ProcessPage() {
  const { data: m, reload } = useApi<Metrics>("/metrics");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
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
    stop.current = false;
    const runId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    try {
      let ids: string[] | null = mode === "all" ? await allIds() : null;
      const p: Progress = { done: 0, total: ids ? ids.length : (m?.unprocessed ?? 0), log: [], runId };
      setProgress({ ...p });
      while (!stop.current) {
        const body = ids ? { run_id: runId, ids: ids.slice(0, BATCH) } : { run_id: runId, limit: BATCH };
        const res = await apiPost<BatchResponse>("/process-batch", body);
        p.done += res.processed.length;
        p.log = [...p.log, { n: res.processed.length, seconds: res.seconds }];
        if (ids) ids = ids.filter((i) => !res.processed.includes(i));
        else p.total = Math.max(p.total, p.done + res.remaining);
        setProgress({ ...p });
        if (res.processed.length === 0 || (ids ? ids.length === 0 : res.remaining === 0)) break;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      reload();
    }
  }

  const pct = progress && progress.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <>
      <PageHeader title="Process inbox" subtitle="Runs the pipeline in the cloud: rules first, AI only where rules cannot decide." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Emails" value={m?.total_emails ?? "–"} />
        <KpiTile label="Processed" value={m?.processed ?? "–"} tone="ok" />
        <KpiTile label="Waiting" value={m?.unprocessed ?? "–"} tone={m?.unprocessed ? "warn" : undefined} />
        <KpiTile label="Failed" value={m?.errors ?? "–"} tone={m?.errors ? "bad" : undefined} hint={m?.errors ? "retry from the review queue" : undefined} />
      </div>

      <Card title="Run">
        <div className="flex flex-wrap items-center gap-3">
          <button className={buttonPrimary} disabled={running || !m || m.unprocessed === 0} onClick={() => run("remaining")}>
            {running ? "Processing…" : m && m.unprocessed === 0 ? "Nothing waiting" : "Process remaining"}
          </button>
          <button className={buttonSecondary} disabled={running || !m} onClick={() => run("all")}>
            Reprocess everything
          </button>
          {running && (
            <button className={buttonSecondary} onClick={() => (stop.current = true)}>
              Stop after this batch
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Batches of {BATCH}. Results are already cached where the same input was seen before, so re-runs cost nothing; only new
          inputs reach the AI models. Human-reviewed results are reset when an email is reprocessed.
        </p>

        {error && <div className="mt-4"><ErrorBanner message={error} /></div>}

        {progress && (
          <div className="mt-5" aria-live="polite">
            <div className="mb-1 flex justify-between text-sm">
              <span>
                {progress.done} of {progress.total} processed
              </span>
              <span className="tabular-nums text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Run <span className="font-mono">{progress.runId}</span> · {progress.log.length} batches
              {progress.log.length > 0 && ` · last batch ${progress.log[progress.log.length - 1].seconds}s`}
              {!running && progress.done >= progress.total && " · finished"}
            </p>
          </div>
        )}
      </Card>
    </>
  );
}
