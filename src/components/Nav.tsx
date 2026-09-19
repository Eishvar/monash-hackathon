"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApi } from "@/lib/useApi";
import type { Metrics } from "@/lib/api";

const LINKS = [
  { href: "/", label: "Inbox" },
  { href: "/review", label: "Review queue" },
  { href: "/process", label: "Process" },
  { href: "/metrics", label: "Metrics" },
];

export function Nav() {
  const pathname = usePathname();
  const { data } = useApi<Metrics>("/metrics");
  const active = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/emails") : pathname.startsWith(href));

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight">SDOC Verifier</span>
          <span className="hidden text-xs text-muted sm:inline">SI vs draft BL checker</span>
        </Link>
        <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active(l.href) ? "page" : undefined}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active(l.href) ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {l.label}
              {l.href === "/review" && data && data.review_queue > 0 && (
                <span className="rounded-full bg-warn-bg px-1.5 text-xs font-semibold text-warn" aria-label={`${data.review_queue} waiting`}>
                  {data.review_queue}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
