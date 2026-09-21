"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <aside
      className="relative z-20 w-[4.5rem] shrink-0 text-sidebar-foreground"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className={`sticky top-0 flex h-screen flex-col overflow-hidden border-r border-sidebar-border bg-sidebar shadow-2xl transition-[width] duration-200 ${isExpanded ? "w-60" : "w-[4.5rem]"}`}>
        <div className="flex min-h-[4.5rem] items-center gap-3 border-b border-sidebar-border px-3">
          <Link href="/" aria-label="Shippr home" className="shrink-0">
            <ShipprLogo />
          </Link>
          <span className="whitespace-nowrap text-base font-semibold tracking-tight opacity-0 transition-opacity duration-150 group-hover:opacity-100">Shippr</span>
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 pb-3">
          {SECTIONS.map((s) => (
            <div key={s.label}>
              <div className="whitespace-nowrap px-3 pb-1 pt-5 text-xs uppercase tracking-wider text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100">{s.label}</div>
              <ul className="space-y-0.5">
                {s.links.map((l) => {
                  const active = l.active(pathname);
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        aria-current={active ? "page" : undefined}
                        aria-label={l.label}
                        title={l.label}
                        className={`relative flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground"}`}
                      >
                        {l.icon}
                        <span className="ml-3 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100">{l.label}</span>
                        {l.href === "/review" && data && data.review_queue > 0 && (
                          <span className="absolute left-8 top-0 rounded-full bg-warn-bg px-1.5 text-xs font-semibold text-warn group-hover:static group-hover:ml-auto" aria-label={`${data.review_queue} waiting`}>
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
          <div className="flex items-center rounded-md px-1 py-2 text-sm text-sidebar-foreground" title="Operator">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">OP</div>
            <span className="ml-3 flex-1 whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-150 group-hover:opacity-100">Operator</span>
            <svg className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </aside>
  );
}
