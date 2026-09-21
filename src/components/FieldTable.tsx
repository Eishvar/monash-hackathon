import { FIELDS, FIELD_LABEL, type FieldRow } from "@/lib/api";

function Value({ v }: { v: string | null | undefined }) {
  if (v == null || v === "") return <span className="text-muted-foreground">—</span>;
  return <span className="whitespace-pre-wrap break-words font-mono text-[13px] leading-5">{v.replace(/\s*\n\s*/g, "\n")}</span>;
}

/** The 7 fields, SI (reference) beside the draft BL. Differences are highlighted and never rely on colour alone. */
export function FieldTable({ rows, suggested = false }: { rows: FieldRow[]; suggested?: boolean }) {
  const byField = new Map(rows.map((r) => [r.field, r]));
  return (
    <div className="overflow-hidden rounded-lg border border-line" role="table" aria-label="SI versus BL field comparison">
      <div role="row" className="hidden grid-cols-[11rem_1fr_1fr_10rem] gap-4 border-b border-line bg-surface-2 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
        <span role="columnheader">Field</span>
        <span role="columnheader">Shipping instruction (reference)</span>
        <span role="columnheader">Draft bill of lading</span>
        <span role="columnheader">Result</span>
      </div>
      {FIELDS.map((f) => {
        const r = byField.get(f);
        const differs = !!r && !r.match && !r.missing;
        const short = r && (r.si ?? "").length <= 16 && (r.bl ?? "").length <= 16;
        return (
          <div
            key={f}
            role="row"
            className={`grid gap-x-4 gap-y-1 border-b border-line px-4 py-3 last:border-b-0 md:grid-cols-[11rem_1fr_1fr_10rem] ${
              differs ? "bg-bad-bg/60" : r?.missing ? "bg-warn-bg/60" : ""
            }`}
          >
            <span role="rowheader" className="text-sm font-medium">
              {FIELD_LABEL[f]}
            </span>
            <div role="cell">
              <span className="mr-2 text-xs font-medium uppercase text-muted-foreground md:hidden">SI</span>
              <Value v={r?.si} />
            </div>
            <div role="cell">
              <span className="mr-2 text-xs font-medium uppercase text-muted-foreground md:hidden">BL</span>
              <Value v={r?.bl} />
            </div>
            <div role="cell" className="text-sm">
              {!r ? (
                <span className="text-muted-foreground">—</span>
              ) : r.missing ? (
                <span className="font-semibold text-warn">! Missing value</span>
              ) : r.match ? (
                <span className="font-medium text-ok">✓ Match</span>
              ) : (
                <span className="font-semibold text-bad">
                  ≠ Differs
                  {short && (
                    <span className="mt-0.5 block font-mono text-xs font-normal">
                      SI: {r.si} / BL: {r.bl}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {suggested && (
        <p className="border-t border-line bg-ai-bg px-4 py-2 text-xs text-ai">
          These values were read from the scanned pages by an AI model and may contain OCR errors. Confirm or correct them below.
        </p>
      )}
    </div>
  );
}
