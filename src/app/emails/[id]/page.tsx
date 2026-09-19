"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { apiPost, describeReview, FIELD_LABEL, type EmailDetail, type Result } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { FieldTable } from "@/components/FieldTable";
import { ReviewPanel } from "@/components/ReviewPanel";
import {
  Card,
  CategoryBadge,
  DecidedBy,
  ErrorBanner,
  Skeleton,
  StatusPill,
  buttonSecondary,
} from "@/components/ui";

function Verdict({ result }: { result: Result }) {
  const n = result.defect_fields.length;
  const base = "rounded-xl border px-4 py-3";
  if (result.status === "ERROR")
    return (
      <div className={`${base} border-err/30 bg-err-bg text-err`}>
        <div className="font-semibold">Processing failed</div>
        <div className="mt-0.5 text-sm">{result.processing_error}</div>
      </div>
    );
  if (result.category !== "BL_COMPARISON")
    return (
      <div className={`${base} border-line bg-surface`}>
        <div className="font-semibold">Not a document comparison</div>
        <div className="mt-0.5 text-sm text-muted">This email was triaged as “{result.category.replace("_", " ").toLowerCase()}”; there is nothing to compare.</div>
      </div>
    );
  if (result.status === "MISMATCH")
    return (
      <div className={`${base} border-bad/30 bg-bad-bg text-bad`}>
        <div className="font-semibold">
          {n} field{n > 1 ? "s" : ""} need attention
        </div>
        <div className="mt-0.5 text-sm">{result.defect_fields.map((f) => FIELD_LABEL[f]).join(", ")}</div>
      </div>
    );
  if (result.status === "NEEDS_REVIEW")
    return (
      <div className={`${base} border-warn/30 bg-warn-bg text-warn`}>
        <div className="font-semibold">Needs human review</div>
        <div className="mt-0.5 text-sm">{describeReview(result)}</div>
      </div>
    );
  return (
    <div className={`${base} border-ok/30 bg-ok-bg text-ok`}>
      <div className="font-semibold">No mismatch detected.</div>
      <div className="mt-0.5 text-sm">All seven fields match between the SI and the draft BL.</div>
    </div>
  );
}

export default function EmailReport() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useApi<EmailDetail>(`/emails/${id}`);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  async function reprocess() {
    setBusy(true);
    setActionError(null);
    try {
      await apiPost(`/process/${id}`);
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { email, result, reviews } = data;
  const needsReview = !!result && (result.status === "NEEDS_REVIEW" || result.status === "ERROR") && !result.reviewed;
  const rows = result ? (result.fields.length ? result.fields : result.provisional_fields) : [];
  const suggested = !!result && result.fields.length === 0 && result.provisional_fields.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Inbox
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{email.subject || "(no subject)"}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted">
          <span className="font-mono">{email.email_id}</span>
          <span>{email.sender}</span>
          {result && (
            <>
              <CategoryBadge category={result.category} />
              {result.category === "BL_COMPARISON" && <StatusPill status={result.status} />}
              <DecidedBy result={result} />
            </>
          )}
        </div>
      </div>

      {(actionError || (error && data)) && <ErrorBanner message={(actionError ?? error) as string} />}

      {!result ? (
        <Card>
          <p className="text-sm text-muted">This email has not been processed yet.</p>
          <button className={`${buttonSecondary} mt-3`} onClick={reprocess} disabled={busy}>
            {busy ? "Processing…" : "Process now"}
          </button>
        </Card>
      ) : (
        <>
          <Verdict result={result} />

          {result.explanation && (
            <Card title={result.reviewed ? "Original explanation (before review)" : "Explanation"}>
              <p className={`text-sm leading-6 ${result.reviewed ? "text-muted" : ""}`}>{result.explanation}</p>
              <p className="mt-2 text-xs text-muted">
                Written by an AI model for the reviewer. It never changes the status
                {result.reviewed ? ", and it is not updated after a review; see the audit trail." : "."}
              </p>
            </Card>
          )}

          {result.category === "BL_COMPARISON" && (rows.length > 0 || result.status !== "OK") && (
            <Card title={suggested ? "Values suggested from the scan" : "SI vs draft BL"}>
              {rows.length > 0 ? (
                <FieldTable rows={rows} suggested={suggested} />
              ) : (
                <p className="text-sm text-muted">No field values are available for this email ({describeReview(result)}).</p>
              )}
            </Card>
          )}

          {result.category === "BL_COMPARISON" && (
            <Card
              title={needsReview ? "Review" : "Correct values"}
              action={
                !needsReview && (
                  <button className={buttonSecondary} onClick={() => setShowPanel((s) => !s)} aria-expanded={showPanel}>
                    {showPanel ? "Hide" : "Edit values"}
                  </button>
                )
              }
            >
              {needsReview || showPanel ? (
                <ReviewPanel
                  key={result.updated_at}
                  emailId={email.email_id}
                  result={result}
                  onDone={() => {
                    setShowPanel(false);
                    reload();
                  }}
                />
              ) : (
                <p className="text-sm text-muted">
                  {result.reviewed ? "This result was confirmed by a reviewer." : "Open the editor to correct a value; the status is recomputed and logged."}
                </p>
              )}
            </Card>
          )}

          {reviews.length > 0 && (
            <Card title="Audit trail">
              <ol className="space-y-2 text-sm">
                {reviews.map((r) => (
                  <li key={r.id} className="flex flex-wrap gap-x-3">
                    <span className="font-mono text-xs text-muted">{new Date(r.created_at).toLocaleString()}</span>
                    <span className="font-medium">{r.action === "correct" ? "Corrected" : "Confirmed"}</span>
                    {r.before && r.after && (
                      <span className="text-muted">
                        {r.before.status} → {r.after.status}
                      </span>
                    )}
                    {r.note && <span>“{r.note}”</span>}
                  </li>
                ))}
              </ol>
            </Card>
          )}

          <Card
            title="Email"
            action={
              <button className={buttonSecondary} onClick={reprocess} disabled={busy}>
                {busy ? "Processing…" : result.status === "ERROR" ? "Retry processing" : "Reprocess"}
              </button>
            }
          >
            {email.attachments.length > 0 && (
              <ul className="mb-3 flex flex-wrap gap-2">
                {email.attachments.map((a) => (
                  <li key={a} className="rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-xs">
                    {a.split("/").pop()}
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary className="cursor-pointer text-sm font-medium">Show message body</summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-mono text-xs leading-5">{email.body}</pre>
            </details>
            {result.notes.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium">Processing notes ({result.notes.length})</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
                  {result.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        </>
      )}
      {loading && data && <p className="text-xs text-muted">Refreshing…</p>}
    </div>
  );
}
