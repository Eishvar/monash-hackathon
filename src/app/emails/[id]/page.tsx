"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronRight, FileText, RefreshCw } from "lucide-react";
import { apiPost, CATEGORY_LABEL, describeReview, type EmailDetail } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { displayId, friendlySubject } from "@/lib/subject";
import { FieldTable } from "@/components/FieldTable";
import { Modal } from "@/components/Modal";
import { ReviewPanel } from "@/components/ReviewPanel";
import { Collapsible, Section, VerdictCard } from "@/components/ResultPanel";
import { DecidedBy, ErrorBanner, Skeleton, StatusPill, buttonSecondary } from "@/components/ui";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
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
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { email, result } = data;
  const needsReview = !!result && (result.status === "NEEDS_REVIEW" || result.status === "ERROR") && !result.reviewed;
  const rows = result ? (result.fields.length ? result.fields : result.provisional_fields) : [];
  const suggested = !!result && result.fields.length === 0 && result.provisional_fields.length > 0;
  const { title, detail } = friendlySubject(email.subject, result?.category);
  
  return (
    <div className="mx-auto max-w-6xl">
      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/" className="transition-colors hover:text-foreground">Inbox</Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium text-foreground">{displayId(email.email_id)}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail ? `${detail} · ` : ""}from {email.sender ?? "unknown sender"}
          </p>
        </div>
        {result?.category === "BL_COMPARISON" && <StatusPill status={result.status} />}
      </header>

      {(actionError || (error && data)) && <div className="mb-4"><ErrorBanner message={(actionError ?? error) as string} /></div>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {!result ? (
            <Section title="Not processed yet" description="This email has not been checked.">
              <button className={buttonSecondary} onClick={reprocess} disabled={busy}>
                {busy ? "Processing…" : "Process now"}
              </button>
            </Section>
          ) : (
            <>
              <VerdictCard result={result} />

              {result.category === "BL_COMPARISON" && (rows.length > 0 || result.status !== "OK") && (
                <Section
                  title={needsReview ? "Review" : suggested ? "Values suggested from the scan" : "Field comparison"}
                  description={needsReview ? "Check the values, then confirm or correct them" : suggested ? "Read from the scanned pages by an AI model" : "Shipping instruction (reference) against the draft bill of lading"}
                  action={
                    <button className={buttonSecondary} onClick={() => setShowPanel(true)} aria-haspopup="dialog">
                      {needsReview ? "Review values" : "Edit values"}
                    </button>
                  }
                >
                  {rows.length > 0 ? <FieldTable rows={rows} suggested={suggested} /> : <p className="text-sm text-muted-foreground">No field values are available for this email ({describeReview(result)}).</p>}
                  {showPanel && (
                    <Modal
                      title={needsReview ? "Review values" : "Edit values"}
                      description="Shipping instruction against the draft bill of lading"
                      onClose={() => setShowPanel(false)}
                    >
                      <ReviewPanel
                        key={result.updated_at}
                        emailId={email.email_id}
                        result={result}
                        onDone={() => {
                          setShowPanel(false);
                          reload();
                        }}
                      />
                    </Modal>
                  )}
                </Section>
              )}
            </>
          )}
          {loading && data && <p className="text-xs text-muted-foreground">Refreshing…</p>}
        </div>

        <aside className="space-y-4">
          <Collapsible title="Original message">
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-sans text-sm leading-6">{email.body}</pre>
            {result && result.notes.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium">Processing notes ({result.notes.length})</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {result.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </details>
            )}
          </Collapsible>

          <Collapsible title="Details">
            <dl className="-my-2.5 divide-y divide-border">
              <Detail label="Subject">{email.subject || "(no subject)"}</Detail>
              <Detail label="From">{email.sender ?? "—"}</Detail>
              {result && <Detail label="Category">{CATEGORY_LABEL[result.category]}</Detail>}
              {result && (
                <Detail label="Decided by">
                  <DecidedBy result={result} />
                </Detail>
              )}
              <Detail label="Email ID">{displayId(email.email_id)}</Detail>
            </dl>
          </Collapsible>

          {email.attachments.length > 0 && (
            <Collapsible title="Attachments" count={email.attachments.length}>
              <ul className="space-y-2">
                {email.attachments.map((a) => (
                  <li key={a} className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate" title={a.split("/").pop()}>{a.split("/").pop()}</span>
                  </li>
                ))}
              </ul>
            </Collapsible>
          )}

          {result && (
            <button className={`${buttonSecondary} w-full`} onClick={reprocess} disabled={busy}>
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
              {busy ? "Processing…" : result.status === "ERROR" ? "Retry processing" : "Reprocess email"}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
