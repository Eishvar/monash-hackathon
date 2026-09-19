"use client";

import { useState } from "react";
import { apiPost, FIELDS, FIELD_LABEL, type FieldName, type FieldRow, type Result } from "@/lib/api";
import { ErrorBanner, buttonPrimary, buttonSecondary } from "@/components/ui";

type Values = Record<FieldName, { si: string; bl: string }>;

const LONG = new Set<FieldName>(["shipper", "consignee", "notify_party"]);
const inputCls = "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-[13px] focus:border-accent";

function initialValues(rows: FieldRow[]): Values {
  const byField = new Map(rows.map((r) => [r.field, r]));
  return Object.fromEntries(
    FIELDS.map((f) => [f, { si: byField.get(f)?.si ?? "", bl: byField.get(f)?.bl ?? "" }]),
  ) as Values;
}

/** Human review: confirm what the system read, or correct values; the backend recomputes the status and writes an audit row. */
export function ReviewPanel({ emailId, result, onDone }: { emailId: string; result: Result; onDone: () => void }) {
  const rows = result.fields.length ? result.fields : result.provisional_fields;
  const [initial] = useState(() => initialValues(rows));
  const [values, setValues] = useState<Values>(initial);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const corrections: Record<string, { si?: string; bl?: string }> = {};
  for (const f of FIELDS) {
    for (const side of ["si", "bl"] as const) {
      if (values[f][side] !== initial[f][side]) (corrections[f] ??= {})[side] = values[f][side];
    }
  }
  const changed = Object.keys(corrections).length;
  const canConfirm = rows.length > 0 && changed === 0;

  async function submit(action: "confirm" | "correct") {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/reviews/${emailId}`, { action, corrections: action === "correct" ? corrections : {}, note: note.trim() || null });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {rows.length
          ? "Check each value against the source documents. Edit anything that is wrong, then save; the status is recomputed and your change is logged."
          : "No values could be read automatically. Enter the SI and BL values from the source documents; the status is recomputed once all seven fields are filled."}
      </p>
      <div className="space-y-3">
        {FIELDS.map((f) => (
          <fieldset key={f} className="grid gap-2 md:grid-cols-[11rem_1fr_1fr] md:gap-4">
            <legend className="sr-only">{FIELD_LABEL[f]}</legend>
            <span className="pt-1.5 text-sm font-medium" aria-hidden="true">{FIELD_LABEL[f]}</span>
            {(["si", "bl"] as const).map((side) => {
              const id = `${f}-${side}`;
              const common = {
                id,
                value: values[f][side],
                onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  setValues((v) => ({ ...v, [f]: { ...v[f], [side]: e.target.value } })),
                className: inputCls,
              };
              return (
                <label key={side} htmlFor={id} className="block">
                  <span className="mb-1 block text-xs font-medium uppercase text-muted">{side === "si" ? "SI" : "Draft BL"}</span>
                  {LONG.has(f) ? <textarea rows={2} {...common} /> : <input type="text" {...common} />}
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase text-muted">Note (optional)</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. checked against the original PDF" className={inputCls} />
      </label>
      {error && <ErrorBanner message={error} />}
      <div className="flex flex-wrap gap-3">
        <button className={buttonPrimary} disabled={busy || changed === 0} onClick={() => submit("correct")}>
          {busy ? "Saving…" : `Save corrections${changed ? ` (${changed} field${changed > 1 ? "s" : ""})` : ""}`}
        </button>
        <button className={buttonSecondary} disabled={busy || !canConfirm} onClick={() => submit("confirm")}>
          Confirm values as shown
        </button>
      </div>
    </div>
  );
}
