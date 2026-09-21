"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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
  gmail: icon(
    <>
      <path d="M4 6v12M20 6v12" />
      <path d="M4 6l8 6 8-6" />
      <path d="M4 6h0M20 6h0" />
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
      { href: "/gmail", label: "Gmail", icon: ICONS.gmail, active: (p: string) => p.startsWith("/gmail") },
      { href: "/", label: "Inbox", icon: ICONS.inbox, active: (p: string) => p === "/" || p.startsWith("/emails") || p.startsWith("/review") },
      { href: "/process", label: "Process", icon: ICONS.process, active: (p: string) => p.startsWith("/process") },
    ],
  },
  {
    label: "Analytics",
    links: [{ href: "/metrics", label: "Metrics", icon: ICONS.metrics, active: (p: string) => p.startsWith("/metrics") }],
  },
];

// Labels fade in with the width; the fade is pure CSS (group hover / keyboard focus), so there is no hover state to get stuck.
const REVEAL = "whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/sb:opacity-100 group-focus-within/sb:opacity-100";

export function AppSidebar() {
  const pathname = usePathname() ?? "/";

  return (
    // The wrapper reserves the collapsed rail; the aside grows over the page (Supabase-style) instead of pushing it.
    <div className="relative w-16 shrink-0">
      <aside
        aria-label="Sidebar"
        className="group/sb fixed inset-y-0 left-0 z-50 flex w-16 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,box-shadow] duration-200 ease-out hover:w-60 hover:shadow-2xl focus-within:w-60 focus-within:shadow-2xl"
      >
        <Link href="/" className="flex h-16 shrink-0 items-center gap-3 overflow-hidden border-b border-sidebar-border px-3.5" aria-label="Shippr home">
          <ShipprLogo className="h-6 w-auto shrink-0" />
          <span className={`text-base font-semibold tracking-tight ${REVEAL}`}>Shippr</span>
        </Link>

        <nav aria-label="Main" className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
          {SECTIONS.map((s) => (
            <div key={s.label}>
              <div className={`px-3 pb-1 pt-5 text-xs uppercase tracking-wider text-muted-foreground ${REVEAL}`}>{s.label}</div>
              <ul className="space-y-0.5">
                {s.links.map((l) => {
                  const active = l.active(pathname);
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        aria-current={active ? "page" : undefined}
                        title={l.label}
                        className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
                          active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground"
                        }`}
                      >
                        {l.icon}
                        <span className={REVEAL}>{l.label}</span>
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
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">OP</div>
            <span className={`flex-1 text-sm font-medium ${REVEAL}`}>Operator</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
