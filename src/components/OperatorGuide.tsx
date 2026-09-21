"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";

interface ChecklistItem {
  id: string;
  label: string;
  href: string;
  visited: (pathname: string) => boolean;
}

const ITEMS: ChecklistItem[] = [
  { id: "triage", label: "Triage the inbox emails", href: "/", visited: (p) => p === "/" },
  { id: "mismatch", label: "Inspect the discrepancy on email_004 (SI ≠ BL)", href: "/emails/email_004", visited: (p) => p === "/emails/email_004" },
  { id: "review", label: "Verify an AI scan in the Review Queue", href: "/review", visited: (p) => p.startsWith("/review") },
  { id: "map", label: "Explore the shipping lanes on the Metrics map", href: "/metrics", visited: (p) => p.startsWith("/metrics") },
  { id: "process", label: "Reprocess an email and watch it update", href: "/process", visited: (p) => p.startsWith("/process") },
];

// localStorage-backed store read through useSyncExternalStore (no setState in effects, no hydration mismatch).
const PROGRESS_KEY = "shippr_guide_progress";
const COLLAPSED_KEY = "shippr_guide_collapsed";
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the guide just does not persist */
  }
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function parseProgress(raw: string | null): Record<string, boolean> {
  try {
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function OperatorGuide() {
  const pathname = usePathname() ?? "/";
  const progressRaw = useSyncExternalStore(subscribe, () => read(PROGRESS_KEY), () => null);
  const collapsedRaw = useSyncExternalStore(subscribe, () => read(COLLAPSED_KEY), () => "true");
  const completed = useMemo(() => parseProgress(progressRaw), [progressRaw]);
  const collapsed = collapsedRaw !== "false"; // collapsed by default so it never covers the page on first visit

  // Visiting a step's page ticks it off (writes to the store; no local state involved).
  useEffect(() => {
    const hit = ITEMS.filter((i) => i.visited(pathname) && !parseProgress(read(PROGRESS_KEY))[i.id]);
    if (hit.length) write(PROGRESS_KEY, JSON.stringify({ ...parseProgress(read(PROGRESS_KEY)), ...Object.fromEntries(hit.map((i) => [i.id, true])) }));
  }, [pathname]);

  const toggle = (id: string) => write(PROGRESS_KEY, JSON.stringify({ ...completed, [id]: !completed[id] }));
  const setCollapsed = (v: boolean) => write(COLLAPSED_KEY, String(v));

  const count = ITEMS.filter((i) => completed[i.id]).length;
  const pct = Math.round((count / ITEMS.length) * 100);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        aria-expanded={false}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground shadow-xl transition-colors hover:bg-muted"
      >
        <span>Operator guide</span>
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-primary">
          {count}/{ITEMS.length}
        </span>
      </button>
    );
  }

  return (
    <aside aria-label="Operator Quickstart Guide" className="fixed bottom-6 right-6 z-40 max-h-[70vh] w-80 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl">
      <header className="flex items-start justify-between gap-2 border-b border-border pb-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Getting started checklist</h2>
          <p className="text-xs text-muted-foreground">Averis verification workflow guide</p>
        </div>
        <button onClick={() => setCollapsed(true)} aria-label="Collapse checklist" aria-expanded className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </header>

      <ul className="mt-3 space-y-1 text-xs">
        {ITEMS.map((item) => {
          const done = !!completed[item.id];
          return (
            <li key={item.id} className="flex items-center gap-2 rounded-lg p-2 transition-colors hover:bg-muted/50">
              <button
                type="button"
                onClick={() => toggle(item.id)}
                aria-pressed={done}
                aria-label={`Mark "${item.label}" ${done ? "not done" : "done"}`}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                {done ? (
                  <svg className="h-4 w-4 text-ok" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span className="block h-4 w-4 rounded-full border border-dashed border-muted-foreground" />
                )}
              </button>
              <Link href={item.href} className={`flex min-w-0 flex-1 items-center justify-between gap-2 ${done ? "text-muted-foreground line-through" : "font-medium text-foreground"}`}>
                <span className="truncate">{item.label}</span>
                <span className="text-muted-foreground no-underline">→</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <footer className="mt-4 border-t border-border pt-3">
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {count} of {ITEMS.length} complete
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </footer>
    </aside>
  );
}
