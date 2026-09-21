"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown } from "lucide-react";
import type { Metrics } from "@/lib/api";
import validation from "@/data/validation.json";

const pct = (x: number) => Math.round(x * 1000) / 10;
const s = validation.bundle.scores;

const VIEWS = {
  dataset: {
    label: "Organizer dataset",
    bars: [
      { label: "Email classification", value: pct(s.classification_f1) },
      { label: "Mismatch detection", value: pct(s.defect_f1) },
      { label: "Review escalation", value: pct(s.escalation_recall) },
    ],
  },
  unseen: {
    label: "Unseen data and edge cases",
    bars: [
      { label: "Rules only", value: pct(validation.paraphrases.accuracy_rules_only) },
      { label: "Rules + AI", value: pct(validation.paraphrases.accuracy_rules_plus_llm) },
    ],
  },
} as const;
type ViewKey = keyof typeof VIEWS;

const TICKS = [0, 25, 50, 75, 100];
const PROVIDER: Record<string, string> = { openrouter: "OpenRouter" };

/** `openrouter/google/gemini-2.5-flash` → { name: "Gemini 2.5 Flash", maker: "Google", provider: "OpenRouter" } */
function prettyModel(spec: string) {
  const [provider, ...path] = spec.split("/");
  const raw = path[path.length - 1] ?? spec;
  const name = raw.split("-").map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
  const maker = path.length > 1 ? path[0].charAt(0).toUpperCase() + path[0].slice(1) : null;
  return { name, maker, provider: PROVIDER[provider] ?? provider };
}

function ModelPanel({ models }: { models: Record<string, string> | null | undefined }) {
  const m = prettyModel(models?.classify ?? "openrouter/google/gemini-2.5-flash");
  return (
    <div className="mt-auto flex items-center justify-between gap-3 border-t border-border px-5 py-4">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">AI model</span>
      <span className="text-base font-semibold">{m.name}</span>
    </div>
  );
}

export function AccuracyCard({ metrics: m }: { metrics: Metrics | null }) {
  const [view, setView] = useState<ViewKey>("dataset");
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const v = VIEWS[view];
  const bars = [...v.bars].sort((a, b) => (desc ? b.value - a.value : a.value - b.value));
  const SortIcon = desc ? ArrowDownWideNarrow : ArrowUpNarrowWide;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-1 flex-col">
        <div className="p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <div className="relative inline-block" ref={ref}>
                <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="-ml-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium transition-colors hover:bg-muted">
                  Accuracy · {v.label}
                  <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </button>
                {open && (
                  <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-border bg-card p-1 shadow-xl">
                    {(Object.keys(VIEWS) as ViewKey[]).map((k) => (
                      <button key={k} role="menuitemradio" aria-checked={k === view} onClick={() => { setView(k); setOpen(false); }} className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 ${k === view ? "font-medium" : "text-muted-foreground"}`}>
                        {VIEWS[k].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => setDesc((d) => !d)} aria-label={desc ? "Sorted high to low: reverse" : "Sorted low to high: reverse"} title="Reverse the sort order" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors hover:text-foreground">
              <SortIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Horizontal bars: labels on the left, gridlines behind, value at the end of each bar */}
          <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] gap-x-3">
            <div className="flex flex-col gap-3">
              {bars.map((b) => (
                <div key={b.label} className="flex h-8 items-center justify-end text-right text-xs leading-tight text-muted-foreground">{b.label}</div>
              ))}
            </div>
            <div className="pr-11">
              <div className="relative">
                {TICKS.map((t) => (
                  <div key={t} className="absolute inset-y-0 border-l border-foreground/30" style={{ left: `${t}%` }} aria-hidden="true" />
                ))}
                <div className="relative flex flex-col gap-3">
                  {bars.map((b) => (
                    <div key={b.label} className="relative h-8">
                      <div className="h-full rounded-md transition-[width] duration-500" style={{ width: `${b.value}%`, backgroundColor: `color-mix(in oklab, var(--foreground) ${Math.round(70 + b.value * 0.3)}%, var(--card))` }} />
                      <span className="absolute top-1/2 ml-2 -translate-y-1/2 text-sm tabular-nums text-muted-foreground" style={{ left: `${b.value}%` }}>{b.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative mt-2 h-4">
                {TICKS.map((t) => (
                  <span key={t} className="absolute -translate-x-1/2 text-xs tabular-nums text-muted-foreground" style={{ left: `${t}%` }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <ModelPanel models={m?.latest_run?.models} />
      </div>

    </section>
  );
}
