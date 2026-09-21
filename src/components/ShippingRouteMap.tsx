"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, FIELD_LABEL, type EmailRow, type FieldName } from "@/lib/api";
import { PORT_COORDINATES, project, resolvePort, type PortLocation } from "@/lib/ports";
import { ErrorBanner, Skeleton } from "@/components/ui";

const PAGE = 200; // API maximum per request
const VIEWBOX = "97.32 0.84 826.85 503.39";
const HUB = PORT_COORDINATES.SINGAPORE; // the API list omits the loading port, so the origin hub is an assumption (labelled as such)

interface Lane {
  port: PortLocation;
  total: number;
  ok: number;
  mismatch: number;
  review: number;
  fields: Partial<Record<FieldName, number>>;
}

function useBlEmails() {
  const [state, setState] = useState<{ rows: EmailRow[] | null; error: string | null }>({ rows: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all: EmailRow[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const page = await apiGet<EmailRow[]>(`/emails?category=BL_COMPARISON&limit=${PAGE}&offset=${offset}`);
        all.push(...page);
        if (page.length < PAGE) break;
      }
      return all;
    })()
      .then((rows) => !cancelled && setState({ rows, error: null }))
      .catch((e: Error) => !cancelled && setState({ rows: null, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

function buildLanes(rows: EmailRow[]) {
  const lanes = new Map<string, Lane>();
  let unmapped = 0;
  for (const e of rows) {
    const port = resolvePort(e.subject);
    if (!port) {
      unmapped++;
      continue;
    }
    const lane = lanes.get(port.name) ?? { port, total: 0, ok: 0, mismatch: 0, review: 0, fields: {} };
    lane.total++;
    const s = e.result?.status;
    if (s === "MISMATCH") lane.mismatch++;
    else if (s === "NEEDS_REVIEW" || s === "ERROR") lane.review++;
    else if (s === "OK") lane.ok++;
    for (const f of e.result?.defect_fields ?? []) lane.fields[f] = (lane.fields[f] ?? 0) + 1;
    lanes.set(port.name, lane);
  }
  return { lanes: [...lanes.values()].sort((a, b) => b.mismatch - a.mismatch || b.total - a.total), unmapped };
}

const tone = (l: Lane) => (l.mismatch > 0 ? "bad" : l.review > 0 ? "warn" : "ok");
const STROKE = { bad: "stroke-bad", warn: "stroke-warn", ok: "stroke-ok" } as const;
const DOT = { bad: "bg-bad", warn: "bg-warn", ok: "bg-ok" } as const;
const RING = { bad: "stroke-bad", warn: "stroke-warn", ok: "stroke-ok" } as const;

export function ProgressRing({ value, max, color }: { value: number; max: number; color: string }) {
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const pct = max > 0 ? (value / max) * circ : 0;
  return (
    <svg className="h-10 w-10 -rotate-90" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={radius} className="fill-none stroke-muted" strokeWidth="3" />
      <circle cx="20" cy="20" r={radius} className={`fill-none ${color} transition-all duration-500`} strokeWidth="3" strokeDasharray={circ} strokeDashoffset={circ - pct} strokeLinecap="round" />
    </svg>
  );
}

function describe(l: Lane) {
  const top = Object.entries(l.fields)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([f, n]) => `${FIELD_LABEL[f as FieldName]} (${n})`)
    .join(", ");
  return `${l.total} shipment${l.total === 1 ? "" : "s"} · ${l.mismatch} mismatch${l.mismatch === 1 ? "" : "es"} · ${l.review} in review${top ? ` · ${top}` : ""}`;
}

export function ShippingRouteMap() {
  const { rows, error, reload } = useBlEmails();
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const { lanes, unmapped } = useMemo(() => (rows ? buildLanes(rows) : { lanes: [], unmapped: 0 }), [rows]);
  const active = selected ?? hovered;
  const activeLane = lanes.find((l) => l.port.name === active) ?? null;
  const shown = lanes.filter((l) => l.port.name.toLowerCase().includes(q.trim().toLowerCase()));
  const [hx, hy] = project(...HUB.coordinates);

  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!rows) return <Skeleton className="h-[420px] w-full" />;

  const toggle = (name: string) => setSelected((s) => (s === name ? null : name));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="relative w-full overflow-hidden rounded-xl border border-border bg-black" style={{ aspectRatio: "826.85 / 503.39" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/worldLow-pixels.svg" alt="" className="absolute inset-0 h-full w-full opacity-30" />
        <svg viewBox={VIEWBOX} className="absolute inset-0 h-full w-full" role="group" aria-label="Shipping lanes map">
          {lanes.map((l) => {
            const [x, y] = project(...l.port.coordinates);
            const t = tone(l);
            const dim = active !== null && active !== l.port.name;
            const isHub = l.port.name === HUB.name;
            const d = `M ${hx} ${hy} Q ${(hx + x) / 2} ${Math.min(hy, y) - Math.abs(x - hx) * 0.15} ${x} ${y}`;
            return (
              <g key={l.port.name} className={`transition-opacity duration-300 ${dim ? "opacity-25" : ""}`}>
                {!isHub && (
                  <>
                    <path d={d} className={`fill-none ${STROKE[t]} transition-all duration-300`} strokeWidth={active === l.port.name ? 3.5 : 2} strokeLinecap="round" />
                    <path
                      d={d}
                      className="cursor-pointer fill-none stroke-transparent"
                      strokeWidth="14"
                      role="button"
                      tabIndex={0}
                      aria-label={`${l.port.name}: ${describe(l)}`}
                      onClick={() => toggle(l.port.name)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(l.port.name)}
                      onMouseEnter={() => setHovered(l.port.name)}
                      onMouseLeave={() => setHovered(null)}
                    />
                  </>
                )}
                <circle cx={x} cy={y} r="3.5" className="pointer-events-none fill-white drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
                <circle
                  cx={x}
                  cy={y}
                  r="10"
                  className="cursor-pointer fill-transparent"
                  onClick={() => toggle(l.port.name)}
                  onMouseEnter={() => setHovered(l.port.name)}
                  onMouseLeave={() => setHovered(null)}
                />
              </g>
            );
          })}
          <circle cx={hx} cy={hy} r="5" className="pointer-events-none fill-white drop-shadow-[0_0_8px_rgba(255,255,255,1)]" />
        </svg>

        <div className="pointer-events-none absolute left-3 top-3 space-y-1 rounded-md border border-border bg-black/70 px-3 py-2 text-xs text-white/80">
          <div className="font-medium text-white">Route intelligence</div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-ok" />OK</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-bad" />Mismatch</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warn" />Review</span>
          </div>
          <div className="text-white/50">Origin hub (assumed): {HUB.name}</div>
        </div>

        {activeLane && (
          <div className="pointer-events-none absolute bottom-3 left-3 max-w-sm rounded-md border border-border bg-black/80 px-3 py-2 text-xs text-white">
            <div className="font-semibold">{activeLane.port.name}</div>
            <div className="mt-0.5 text-white/70">{describe(activeLane)}</div>
          </div>
        )}
      </div>

      <div className="flex max-h-[520px] flex-col rounded-xl border border-border bg-card">
        <div className="border-b border-border p-3">
          <h2 className="text-sm font-semibold">Route lanes</h2>
          <p className="mb-2 text-xs text-muted-foreground">Destinations read from email subjects, from {HUB.name} (assumed hub).</p>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search lane (port)"
            aria-label="Search lanes by port"
            className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-ring"
          />
        </div>
        <ul className="flex-1 divide-y divide-border overflow-y-auto">
          {shown.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">No lanes match.</li>}
          {shown.map((l) => {
            const t = tone(l);
            return (
              <li key={l.port.name}>
                <button
                  onClick={() => toggle(l.port.name)}
                  aria-pressed={selected === l.port.name}
                  onMouseEnter={() => setHovered(l.port.name)}
                  onMouseLeave={() => setHovered(null)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 ${selected === l.port.name ? "bg-muted/60" : ""}`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[t]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">→ {l.port.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {l.total} shipments · {l.mismatch} mismatches{l.review ? ` · ${l.review} review` : ""}
                    </span>
                  </span>
                  <ProgressRing value={l.ok} max={l.total} color={RING[t]} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {rows.length} BL comparisons · {lanes.length} lanes{unmapped ? ` · ${unmapped} with no recognised port` : ""}
        </div>
      </div>
    </div>
  );
}
