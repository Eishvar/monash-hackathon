"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { useApi } from "@/lib/useApi";
import type { Status } from "@/lib/api";
import { project, resolvePort, type PortLocation } from "@/lib/ports";
import { friendlySubject } from "@/lib/subject";
import { ErrorBanner, Skeleton, StatusPill } from "@/components/ui";

const VIEWBOX = "97.32 0.84 826.85 503.39";
const NO_RING = "outline-none focus:outline-none focus-visible:outline-none";

interface RouteRow {
  email_id: string;
  status: string;
  subject: string | null;
  sender?: string | null;
  pol: string | null;
  pod: string | null;
}

interface Lane {
  key: string;
  label: string;
  note: string | null;
  from: PortLocation | null;
  to: PortLocation | null;
  total: number;
  mismatch: number;
  review: number;
  emails: RouteRow[];
}

const city = (s: string) => s.split(",")[0].trim();
const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Lanes come from the ports written in each SI / draft BL (port of loading → port of discharge).
 * Emails without document values fall back to the destination named in the subject. A lane with only one known port is
 * still listed and shown as a highlighted point on the map; emails with no port at all are grouped as "Ports not stated".
 */
function buildLanes(rows: RouteRow[]): Lane[] {
  const lanes = new Map<string, Lane>();
  for (const r of rows) {
    const from = resolvePort(r.pol);
    const to = resolvePort(r.pod) ?? (r.pod ? null : resolvePort(r.subject));
    const fromName = from ? city(from.name) : r.pol ? title(city(r.pol)) : null;
    const toName = to ? city(to.name) : r.pod ? title(city(r.pod)) : null;
    let key: string, label: string, note: string | null;
    if (fromName && toName) [key, label, note] = [`${fromName}>${toName}`, `${fromName} → ${toName}`, null];
    else if (toName) [key, label, note] = [`>${toName}`, toName, "Departure port not stated"];
    else if (fromName) [key, label, note] = [`${fromName}>`, fromName, "Arrival port not stated"];
    else [key, label, note] = ["none", "Ports not stated", "No port found in the documents"];
    const lane = lanes.get(key) ?? { key, label, note, from, to, total: 0, mismatch: 0, review: 0, emails: [] };
    lane.total++;
    lane.emails.push(r);
    if (r.status === "MISMATCH") lane.mismatch++;
    else if (r.status === "NEEDS_REVIEW" || r.status === "ERROR") lane.review++;
    lanes.set(key, lane);
  }
  return [...lanes.values()].sort((a, b) => b.mismatch - a.mismatch || b.total - a.total);
}

const tone = (l: Lane) => (l.mismatch > 0 ? "bad" : l.review > 0 ? "warn" : "ok");
const STROKE = { bad: "stroke-bad", warn: "stroke-warn", ok: "stroke-ok" } as const;
const DOT = { bad: "bg-bad", warn: "bg-warn", ok: "bg-ok" } as const;

const summary = (l: Lane) => `${l.total} shipment${l.total === 1 ? "" : "s"} · ${l.mismatch} mismatch${l.mismatch === 1 ? "" : "es"}${l.review ? ` · ${l.review} in review` : ""}`;

export function ShippingRouteMap() {
  const { data: rows, error, reload } = useApi<RouteRow[]>("/metrics/routes");
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [q, setQ] = useState("");

  // Keep the map in step with new / removed emails while the page stays open.
  useEffect(() => {
    const t = setInterval(reload, 20000);
    return () => clearInterval(t);
  }, [reload]);

  const lanes = useMemo(() => (rows ? buildLanes(rows) : []), [rows]);
  const selectedLane = lanes.find((l) => l.key === selected) ?? null;
  const active = selected ?? hovered;
  const activeLane = lanes.find((l) => l.key === active) ?? null;
  const shown = lanes.filter((l) => l.label.toLowerCase().includes(q.trim().toLowerCase()));

  if (error && !rows) return <ErrorBanner message={error} onRetry={reload} />;
  if (!rows) return <Skeleton className="h-[420px] w-full" />;

  const select = (key: string) => {
    setSelected((s) => (s === key ? null : key));
    setExpanded(true);
  };
  const clear = () => {
    setSelected(null);
    setHovered(null);
  };
  const hit = (key: string) => ({
    onClick: () => select(key),
    onMouseEnter: () => setHovered(key),
    onMouseLeave: () => setHovered(null),
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="relative w-full overflow-hidden rounded-xl border border-border bg-black" style={{ aspectRatio: "826.85 / 503.39" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/worldLow-pixels.svg" alt="" className="absolute inset-0 h-full w-full opacity-30" />
        <svg viewBox={VIEWBOX} className="absolute inset-0 h-full w-full" role="group" aria-label="Shipping lanes map">
          {lanes.map((l) => {
            const t = tone(l);
            const dim = active !== null && active !== l.key;
            const isActive = active === l.key;
            const a = l.from ? project(...l.from.coordinates) : null;
            const b = l.to ? project(...l.to.coordinates) : null;
            const arc = a && b && (a[0] !== b[0] || a[1] !== b[1]) ? `M ${a[0]} ${a[1]} Q ${(a[0] + b[0]) / 2} ${Math.min(a[1], b[1]) - Math.abs(b[0] - a[0]) * 0.15} ${b[0]} ${b[1]}` : null;
            const points = [a, b].filter((p): p is [number, number] => !!p);
            const single = points.length === 1;
            return (
              <g key={l.key} className={`transition-opacity duration-300 ${dim ? "opacity-25" : ""}`}>
                {arc && (
                  <>
                    <path d={arc} className={`fill-none ${STROKE[t]} transition-all duration-300`} strokeWidth={isActive ? 3.5 : 2} strokeLinecap="round" />
                    <path
                      d={arc}
                      className={`cursor-pointer fill-none stroke-transparent ${NO_RING}`}
                      strokeWidth="14"
                      role="button"
                      tabIndex={0}
                      aria-label={`${l.label}: ${summary(l)}`}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && select(l.key)}
                      {...hit(l.key)}
                    />
                  </>
                )}
                {points.map(([x, y], i) => (
                  <g key={i}>
                    {single && <circle cx={x} cy={y} r="8" className={`pointer-events-none fill-none ${STROKE[t]}`} strokeWidth="2" />}
                    <circle cx={x} cy={y} r={single ? 4.5 : 3.5} className="pointer-events-none fill-white drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
                    <circle cx={x} cy={y} r="10" className={`cursor-pointer fill-transparent ${NO_RING}`} {...hit(l.key)} />
                  </g>
                ))}
              </g>
            );
          })}
        </svg>

        {activeLane && (
          <div className={`absolute right-3 top-3 max-w-xs rounded-md border border-border bg-black/85 py-2 pl-3 text-xs text-white ${selected ? "pr-8" : "pointer-events-none pr-3"}`}>
            {selected && (
              <button onClick={clear} aria-label="Close route details" className="absolute right-1.5 top-1.5 rounded p-0.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <div className="text-sm font-semibold">{activeLane.label}</div>
            <div className="mt-0.5 text-white/70">{summary(activeLane)}</div>
            {activeLane.note && <div className="mt-0.5 text-white/50">{activeLane.note}</div>}
          </div>
        )}
      </div>

      <div className="flex max-h-[520px] flex-col rounded-xl border border-border bg-card">
        <div className="border-b border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Route lanes</h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ok" />OK</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-bad" />Mismatch</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warn" />Review</span>
            </div>
          </div>
          {!selectedLane && (
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search lane (port)"
              aria-label="Search lanes by port"
              className="mt-3 w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-ring"
            />
          )}
        </div>

        {selectedLane ? (
          <div className="flex-1 overflow-y-auto">
            <button onClick={() => setExpanded((e) => !e)} aria-expanded={expanded} className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40">
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[tone(selectedLane)]}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{selectedLane.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{summary(selectedLane)}{selectedLane.note ? ` · ${selectedLane.note}` : ""}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {expanded && (
              <ul className="divide-y divide-border border-t border-border">
                {selectedLane.emails.map((e) => (
                  <li key={e.email_id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/emails/${e.email_id}`} className="block truncate text-sm font-medium hover:underline">
                        {friendlySubject(e.subject, "BL_COMPARISON").title}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">{e.sender ?? "Unknown sender"}</div>
                    </div>
                    <StatusPill status={e.status as Status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <ul className="flex-1 divide-y divide-border overflow-y-auto">
            {shown.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">No lanes match.</li>}
            {shown.map((l) => (
              <li key={l.key}>
                <button
                  onClick={() => select(l.key)}
                  onMouseEnter={() => setHovered(l.key)}
                  onMouseLeave={() => setHovered(null)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[tone(l)]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{l.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{summary(l)}{l.note ? ` · ${l.note}` : ""}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
