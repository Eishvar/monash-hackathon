"use client";

import { useEffect, useState } from "react";
import { STATUS_LABEL, type Metrics } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Skeleton } from "@/components/ui";

const CARD = "flex h-full min-h-[230px] flex-col rounded-xl border border-border bg-card p-4";
const CARD_LABEL = "text-xs font-medium uppercase tracking-wider text-muted-foreground";

const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const niceMax = (n: number) => {
  const pow = 10 ** Math.floor(Math.log10(Math.max(n, 1)));
  return ([1, 2, 5, 10].find((s) => s * pow >= n) ?? 10) * pow;
};

interface Day {
  date: string;
  count: number;
}

const W = 420;
const H = 190;
const LEFT = 42;
const BOTTOM = 22;

export function ProcessedBarCard({ total }: { total: number | null }) {
  const { data, error, reload } = useApi<Day[]>("/metrics/daily?days=14");
  useEffect(() => {
    const t = setInterval(reload, 20000);
    return () => clearInterval(t);
  }, [reload]);
  const [hover, setHover] = useState<number | null>(null);
  const days = data ?? [];
  const yMax = niceMax(Math.max(...days.map((d) => d.count), 1));
  const plotH = H - BOTTOM;
  const slot = (W - LEFT) / Math.max(days.length, 1);
  const shown = hover !== null ? days[hover] : null;

  return (
    <div className={CARD}>
      <div className="flex items-start justify-between">
        <div>
          <div className={CARD_LABEL}>Emails processed</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold tabular-nums">{shown ? shown.count : (total ?? "–")}</span>
            <span className="text-xs text-muted-foreground">{shown ? shortDay(shown.date) : "Total"}</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">Last 14 days</span>
      </div>
      <div className="mt-2 min-h-0 flex-1">
        {error ? (
          <p className="pt-8 text-center text-xs text-muted-foreground">Daily counts are unavailable right now.</p>
        ) : !data ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Emails processed per day, last 14 days" onMouseLeave={() => setHover(null)}>
            {[0, 0.5, 1].map((f) => {
              const y = plotH - f * plotH + 4;
              return (
                <g key={f}>
                  <line x1={LEFT} x2={W} y1={y} y2={y} className="stroke-border" strokeWidth="1" strokeDasharray={f === 0 ? undefined : "3 3"} />
                  <text x={LEFT - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[12px]">
                    {Math.round(yMax * f)}
                  </text>
                </g>
              );
            })}
            {days.map((d, i) => {
              const h = (d.count / yMax) * plotH;
              const x = LEFT + i * slot + slot * 0.2;
              return (
                <g key={d.date} onMouseEnter={() => setHover(i)}>
                  <rect x={LEFT + i * slot} y={0} width={slot} height={H} fill="transparent" />
                  <rect x={x} y={plotH - h + 4} width={slot * 0.6} height={Math.max(h, d.count ? 2 : 0)} rx="2" className={`transition-colors ${hover === i ? "fill-foreground" : "fill-foreground/70"}`} />
                  {i % 3 === 0 && (
                    <text x={x + slot * 0.3} y={H - 4} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                      {shortDay(d.date)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

const SEGMENTS = [
  { key: "OK", stroke: "stroke-ok", dot: "bg-ok" },
  { key: "MISMATCH", stroke: "stroke-bad", dot: "bg-bad" },
  { key: "NEEDS_REVIEW", stroke: "stroke-warn", dot: "bg-warn" },
  { key: "ERROR", stroke: "stroke-err", dot: "bg-err" },
] as const;

const R = 42;
const CIRC = 2 * Math.PI * R;

export function OutcomeDonutCard({ metrics }: { metrics: Metrics | null }) {
  const [hover, setHover] = useState<string | null>(null);
  const counts = metrics?.bl_comparison_status ?? {};
  const present = SEGMENTS.map((s) => ({ ...s, n: counts[s.key] ?? 0 })).filter((s) => s.n > 0);
  const total = present.reduce((a, s) => a + s.n, 0);
  const segs = present.map((s, i) => ({ ...s, start: present.slice(0, i).reduce((a, p) => a + p.n, 0) }));
  const active = segs.find((s) => s.key === hover);

  return (
    <div className={CARD}>
      <div className={CARD_LABEL}>BL comparisons by outcome</div>
      {!metrics ? (
        <Skeleton className="mt-3 h-full w-full" />
      ) : total === 0 ? (
        <p className="pt-10 text-center text-sm text-muted-foreground">No comparisons yet.</p>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-6" onMouseLeave={() => setHover(null)}>
          <div className="relative h-[150px] w-[150px] shrink-0">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label="BL comparisons by outcome">
              <circle cx="60" cy="60" r={R} className="fill-none stroke-muted" strokeWidth="14" />
              {segs.map((s) => {
                const len = (s.n / total) * CIRC;
                return (
                  <circle
                    key={s.key}
                    cx="60"
                    cy="60"
                    r={R}
                    className={`fill-none ${s.stroke} cursor-pointer transition-opacity ${hover && hover !== s.key ? "opacity-30" : ""}`}
                    strokeWidth="14"
                    strokeDasharray={`${Math.max(len - 1.5, 0)} ${CIRC}`}
                    strokeDashoffset={-(s.start / total) * CIRC}
                    onMouseEnter={() => setHover(s.key)}
                  />
                );
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular-nums">{active ? active.n : total}</span>
              <span className="text-[11px] text-muted-foreground">{active ? STATUS_LABEL[active.key] : "Comparisons"}</span>
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            {segs.map((s) => (
              <li key={s.key} onMouseEnter={() => setHover(s.key)} className={`flex items-center gap-2 transition-opacity ${hover && hover !== s.key ? "opacity-40" : ""}`}>
                <span className={`h-2.5 w-2.5 rounded-sm ${s.dot}`} />
                <span className="text-muted-foreground">{STATUS_LABEL[s.key]}</span>
                <span className="ml-auto pl-4 font-medium tabular-nums">{s.n}</span>
                <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{Math.round((s.n / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
