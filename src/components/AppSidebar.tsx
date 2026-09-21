"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useApi } from "@/lib/useApi";
import type { Metrics } from "@/lib/api";
import { ShipprLogo } from "@/components/ShipprLogo";

const icon = (d: ReactNode) => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const ICONS = {
  inbox: icon(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>,
  ),
  review: icon(
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4h6v2H9zM9 13l2 2 4-4" />
    </>,
  ),
  process: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8.5 5 3.5-5 3.5z" />
    </>,
  ),
  metrics: icon(<path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />),
};

const SECTIONS = [
  {
    label: "Platform",
    links: [
      { href: "/", label: "Inbox", icon: ICONS.inbox, active: (p: string) => p === "/" || p.startsWith("/emails") },
      { href: "/review", label: "Review Queue", icon: ICONS.review, active: (p: string) => p.startsWith("/review") },
      { href: "/process", label: "Process", icon: ICONS.process, active: (p: string) => p.startsWith("/process") },
    ],
  },
  {
    label: "Analytics",
    links: [{ href: "/metrics", label: "Metrics", icon: ICONS.metrics, active: (p: string) => p.startsWith("/metrics") }],
  },
];

export function AppSidebar() {
  const pathname = usePathname() ?? "/";
  const { data } = useApi<Metrics>("/metrics");

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <Link href="/" className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4">
        <ShipprLogo />
        <span className="text-base font-semibold tracking-tight">Shippr</span>
      </Link>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-3">
        {SECTIONS.map((s) => (
          <div key={s.label}>
            <div className="px-3 pb-1 pt-5 text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <ul className="space-y-0.5">
              {s.links.map((l) => {
                const active = l.active(pathname);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
                        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground"
                      }`}
                    >
                      {l.icon}
                      {l.label}
                      {l.href === "/review" && data && data.review_queue > 0 && (
                        <span className="ml-auto rounded-full bg-warn-bg px-1.5 text-xs font-semibold text-warn" aria-label={`${data.review_queue} waiting`}>
                          {data.review_queue}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2 text-sm text-sidebar-foreground">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">OP</div>
          <span className="flex-1 text-sm font-medium">Operator</span>
          <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </aside>
  );
}
