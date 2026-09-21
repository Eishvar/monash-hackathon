"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock,
  EllipsisVertical,
  File,
  FileText,
  Forward,
  Inbox,
  LayoutGrid,
  Menu,
  Paperclip,
  Pencil,
  Printer,
  RefreshCw,
  Reply,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Star,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { apiDelete, apiGet, apiPost, CATEGORY_LABEL, type Category, type EmailDetail, type EmailRow } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { ErrorBanner, Skeleton, StatusPill } from "@/components/ui";

const SIM_PREFIX = "000_sim_";
const PAGE_SIZE = 50;
const CHUNK = 200; // API maximum per request

/** Every email, loaded in chunks (the first chunk renders immediately). */
function useAllEmails() {
  const [state, setState] = useState<{ rows: EmailRow[]; loading: boolean; error: string | null }>({ rows: [], loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let acc: EmailRow[] = [];
      for (let offset = 0; ; offset += CHUNK) {
        const chunk = await apiGet<EmailRow[]>(`/emails?limit=${CHUNK}&offset=${offset}&preview=true`);
        if (cancelled) return;
        acc = [...acc, ...chunk];
        setState({ rows: acc, loading: chunk.length === CHUNK, error: null });
        if (chunk.length < CHUNK) return;
      }
    })().catch((e: Error) => !cancelled && setState((s) => ({ ...s, loading: false, error: e.message })));
    return () => {
      cancelled = true;
    };
  }, [tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data: state.rows, loading: state.loading, error: state.error, reload };
}

const SCENARIOS = [
  { id: "mismatch", title: "Meridian Line – Consignee mismatch", desc: "Draft BL differs from the SI" },
  { id: "clean", title: "Evertide Marine – Clean draft B/L", desc: "All seven fields match" },
  { id: "scanned", title: "Corvus Lines – Scanned documents", desc: "Image-only PDFs read by the vision model" },
  { id: "invoice", title: "Baltic Hanse – Storage invoice", desc: "Routed as an invoice query" },
  { id: "si_request", title: "Southern Cross – SI reminder", desc: "Routed as an SI request" },
];

// Gmail (dark theme) palette
const G = {
  bg: "bg-[#1f1f1f]",
  panel: "bg-[#2b2b2b]",
  hover: "hover:bg-white/[0.06]",
  line: "border-white/10",
  text: "text-[#e3e3e3]",
  dim: "text-[#9aa0a6]",
};

type Folder = "inbox" | "starred" | "sent" | "drafts" | "spam" | Category;
const LABELS: { id: Category; dot: string }[] = [
  { id: "BL_COMPARISON", dot: "bg-[#4285f4]" },
  { id: "SI_REQUEST", dot: "bg-[#34a853]" },
  { id: "INVOICE_QUERY", dot: "bg-[#fa7b17]" },
  { id: "GENERAL", dot: "bg-[#9aa0a6]" },
];

const initials = (sender: string | null) => (sender ?? "?").replace(/[^a-zA-Z]/g, "").slice(0, 1).toUpperCase() || "?";
const senderName = (sender: string | null) => (sender ?? "Unknown sender").split("@")[0].replace(/[._-]+/g, " ");
const AVATAR = ["bg-[#8ab4f8]", "bg-[#81c995]", "bg-[#f28b82]", "bg-[#fdd663]", "bg-[#c58af9]", "bg-[#78d9ec]"];
const avatarColor = (s: string | null) => AVATAR[[...(s ?? "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length];

/** Simulated ids embed the arrival time (10^13 - t_ms, 14 digits after the prefix); other emails carry no date. */
function arrivedAt(id: string): Date | null {
  if (!id.startsWith(SIM_PREFIX)) return null;
  const ms = 10_000_000_000_000 - Number(id.slice(SIM_PREFIX.length, SIM_PREFIX.length + 14));
  return Number.isFinite(ms) ? new Date(ms) : null;
}
const shortTime = (d: Date | null) => (d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

function GmailLogo() {
  return (
    <svg viewBox="0 0 24 18" className="h-6 w-auto" aria-hidden="true">
      <path fill="#4285f4" d="M2 18h4V8.7L0 4.2V16a2 2 0 0 0 2 2Z" />
      <path fill="#34a853" d="M18 18h4a2 2 0 0 0 2-2V4.2l-6 4.5V18Z" />
      <path fill="#fbbc04" d="M18 2.7v6l6-4.5V3a2 2 0 0 0-3.2-1.6L18 2.7Z" />
      <path fill="#ea4335" d="M6 8.7V2.7l6 4.5 6-4.5v6L12 13.2 6 8.7Z" />
      <path fill="#c5221f" d="M0 3v1.2l6 4.5v-6L3.2 1.4A2 2 0 0 0 0 3Z" />
    </svg>
  );
}

function IconBtn({ icon: Icon, label, onClick, className = "", disabled = false }: { icon: LucideIcon; label: string; onClick?: () => void; className?: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${G.dim} transition-colors enabled:hover:bg-white/10 enabled:hover:text-[#e3e3e3] disabled:cursor-default disabled:opacity-30 ${className}`}>
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

function Box({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`block h-[18px] w-[18px] shrink-0 rounded-[3px] border-2 border-[#9aa0a6]/70 ${className}`} />;
}

function Reader({ id, onBack, onStar, starred }: { id: string; onBack: () => void; onStar: () => void; starred: boolean }) {
  const { data, error, loading, reload } = useApi<EmailDetail>(`/emails/${id}`);
  if (error && !data) return <div className="p-6"><ErrorBanner message={error} onRetry={reload} /></div>;
  if (!data || loading) return <div className="space-y-3 p-6"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-40 w-full" /></div>;
  const { email, result } = data;
  const when = arrivedAt(email.email_id);
  return (
    <article className="flex h-full min-h-0 flex-col">
      <div className={`flex items-center gap-1 border-b ${G.line} px-3 py-1.5`}>
        <IconBtn icon={ArrowLeft} label="Back to Inbox" onClick={onBack} />
        <IconBtn icon={Printer} label="Print" />
        <IconBtn icon={EllipsisVertical} label="More" />
        {result && (
          <Link href={`/emails/${email.email_id}`} className="ml-auto flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-[#e3e3e3] transition-colors hover:bg-white/10">
            {result.category === "BL_COMPARISON" ? <StatusPill status={result.status} /> : CATEGORY_LABEL[result.category]}
            <span>Verification report</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-6">
          <div className="flex items-start gap-3">
            <h2 className="flex-1 text-[22px] leading-8 text-[#e3e3e3]">{email.subject || "(no subject)"}</h2>
            <span className="mt-1.5 rounded bg-white/10 px-2 py-0.5 text-xs text-[#c4c7c5]">Inbox</span>
            {result && <span className="mt-1.5 rounded bg-white/10 px-2 py-0.5 text-xs text-[#c4c7c5]">{CATEGORY_LABEL[result.category]}</span>}
          </div>
          <div className="mt-6 flex items-start gap-4">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-medium text-[#202124] ${avatarColor(email.sender)}`}>{initials(email.sender)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold capitalize text-[#e3e3e3]">{senderName(email.sender)}</span>
                <span className={`text-xs ${G.dim}`}>&lt;{email.sender}&gt;</span>
              </div>
              <div className={`text-xs ${G.dim}`}>to me</div>
            </div>
            <div className={`flex items-center gap-1 text-xs ${G.dim}`}>
              {when && <span className="mr-2">{when.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
              <button onClick={onStar} aria-label={starred ? "Unstar" : "Star"} aria-pressed={starred} className="rounded-full p-2 hover:bg-white/10">
                <Star className={`h-[18px] w-[18px] ${starred ? "fill-[#fdd663] text-[#fdd663]" : ""}`} />
              </button>
              <IconBtn icon={Reply} label="Reply" className="!h-9 !w-9" />
            </div>
          </div>
          <pre className="mt-5 whitespace-pre-wrap break-words pl-14 font-sans text-sm leading-6 text-[#e3e3e3]">{email.body}</pre>

          {email.attachments.length > 0 && (
            <div className={`mt-8 border-t ${G.line} pl-14 pt-4`}>
              <div className={`mb-3 text-sm ${G.dim}`}>
                {email.attachments.length} attachment{email.attachments.length === 1 ? "" : "s"}
              </div>
              <ul className="flex flex-wrap gap-3">
                {email.attachments.map((a) => {
                  const name = a.split("/").pop() ?? a;
                  return (
                    <li key={a} className={`w-44 overflow-hidden rounded-lg border ${G.line}`}>
                      <div className="flex h-24 items-center justify-center bg-white/[0.04]">
                        <FileText className="h-9 w-9 text-[#9aa0a6]" />
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2">
                        <File className="h-4 w-4 shrink-0 text-[#f28b82]" />
                        <span className="truncate text-xs text-[#e3e3e3]" title={name}>{name}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-8 flex gap-3 pl-14">
            <button className="flex items-center gap-2 rounded-full border border-white/25 px-5 py-2 text-sm text-[#e3e3e3] hover:bg-white/10">
              <Reply className="h-4 w-4" /> Reply
            </button>
            <button className="flex items-center gap-2 rounded-full border border-white/25 px-5 py-2 text-sm text-[#e3e3e3] hover:bg-white/10">
              <Forward className="h-4 w-4" /> Forward
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function NavItem({ icon: Icon, label, count, active, onClick, dot }: { icon?: LucideIcon; label: string; count?: number; active: boolean; onClick: () => void; dot?: string }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex h-8 w-full items-center gap-4 rounded-r-full pl-6 pr-4 text-sm transition-colors ${active ? "bg-[#004a77] font-semibold text-[#c2e7ff]" : `${G.text} hover:bg-white/[0.08]`}`}
    >
      {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" /> : <span className={`ml-0.5 h-3 w-3 shrink-0 rounded-[3px] ${dot}`} />}
      <span className="flex-1 truncate text-left">{label}</span>
      {!!count && <span className="text-xs font-medium">{count}</span>}
    </button>
  );
}

export default function GmailPage() {
  const { data, error, loading, reload } = useAllEmails();
  const [page, setPage] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [folder, setFolder] = useState<Folder>("inbox");
  const [selected, setSelected] = useState<string | null>(null);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [read, setRead] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState<"simulating" | "clearing" | null>(null);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      clearTimeout(timer.current);
    };
  }, []);

  const notify = (text: string, bad = false) => {
    setToast({ text, bad });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4000);
  };

  async function simulate(scenario: string) {
    setMenuOpen(false);
    setBusy("simulating");
    try {
      const res = await apiPost<{ email: { email_id: string; sender: string } }>("/gmail/simulate", { scenario });
      setFolder("inbox");
      setQ("");
      reload();
      setSelected(res.email.email_id);
      notify(`New email from ${senderName(res.email.sender)}`);
    } catch (e) {
      notify(`Could not deliver the email: ${(e as Error).message}`, true);
    } finally {
      setBusy(null);
    }
  }

  async function clearSimulated() {
    setMenuOpen(false);
    setBusy("clearing");
    try {
      const res = await apiDelete<{ deleted: number }>("/gmail/simulated");
      setSelected((s) => (s && s.startsWith(SIM_PREFIX) ? null : s));
      reload();
      notify(`Removed ${res.deleted} simulated email${res.deleted === 1 ? "" : "s"}`);
    } catch (e) {
      notify(`Could not clear: ${(e as Error).message}`, true);
    } finally {
      setBusy(null);
    }
  }

  const all = data;
  const inFolder = (e: EmailRow) => {
    const c = e.result?.category;
    if (folder === "inbox") return c !== "SPAM";
    if (folder === "starred") return starred.has(e.email_id);
    if (folder === "spam") return c === "SPAM";
    if (folder === "sent" || folder === "drafts") return false;
    return c === folder;
  };
  const rows = all.filter((e) => {
    if (!inFolder(e)) return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${e.subject ?? ""} ${e.sender ?? ""} ${e.snippet ?? ""}`.toLowerCase().includes(needle);
  });
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);
  const turn = (to: number) => {
    setPage(to);
    listRef.current?.scrollTo({ top: 0 });
  };
  const unread = all.filter((e) => e.result?.category !== "SPAM" && !read.has(e.email_id)).length;
  const countOf = (c: Category) => all.filter((e) => e.result?.category === c && !read.has(e.email_id)).length;
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  };
  const open = (id: string) => {
    setSelected(id);
    setRead((r) => new Set(r).add(id));
  };
  const go = (f: Folder) => {
    setFolder(f);
    setSelected(null);
    setPage(0);
  };
  const emptyText = folder === "sent" ? "No sent messages. Messages you send will appear here." : folder === "drafts" ? "You don't have any saved drafts." : folder === "starred" ? "No starred messages. Stars let you give messages a special status to make them easier to find." : "No messages match.";

  return (
    <div className={`relative flex h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-xl border ${G.line} ${G.bg} ${G.text}`}>
      {toast && (
        <div role="status" className={`absolute bottom-6 left-6 z-50 rounded-md px-5 py-3 text-sm shadow-xl ${toast.bad ? "bg-[#601410] text-[#f9dedc]" : "bg-[#e3e3e3] text-[#1f1f1f]"}`}>
          {toast.text}
        </div>
      )}

      {/* Top bar */}
      <header className="flex h-16 shrink-0 items-center gap-2 px-3">
        <IconBtn icon={Menu} label="Main menu" />
        <div className="mr-8 flex items-center gap-2 pr-2">
          <GmailLogo />
          <span className="text-[22px] text-[#e3e3e3]" style={{ fontFamily: "'Product Sans', 'Google Sans', Arial, sans-serif" }}>Gmail</span>
        </div>
        <div className={`flex h-12 max-w-3xl flex-1 items-center gap-1 rounded-full ${G.panel} px-2 focus-within:bg-[#3c3c3c]`}>
          <IconBtn icon={Search} label="Search" className="!h-9 !w-9" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search mail" aria-label="Search mail" className="h-full flex-1 bg-transparent text-base text-[#e3e3e3] outline-none placeholder:text-[#9aa0a6]" />
          <IconBtn icon={SlidersHorizontal} label="Show search options" className="!h-9 !w-9" />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <IconBtn icon={CircleHelp} label="Support" />
          <IconBtn icon={Settings} label="Settings" />
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              disabled={busy !== null}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="Deliver a sample email"
              className="mx-1 rounded-full border border-white/20 px-4 py-1.5 text-xs font-medium text-[#c2e7ff] transition-colors hover:bg-[#c2e7ff]/10 disabled:opacity-50"
            >
              {busy === "simulating" ? "Receiving email…" : busy === "clearing" ? "Clearing…" : "Simulate inbound email"}
            </button>
            {menuOpen && (
              <div role="menu" className={`absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border ${G.line} bg-[#2b2b2b] p-1.5 shadow-2xl`}>
                <div className={`px-3 py-2 text-xs uppercase tracking-wider ${G.dim}`}>Deliver a sample email</div>
                {SCENARIOS.map((s) => (
                  <button key={s.id} role="menuitem" onClick={() => simulate(s.id)} className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-white/10">
                    <span className="text-sm text-[#e3e3e3]">{s.title}</span>
                    <span className={`text-xs ${G.dim}`}>{s.desc}</span>
                  </button>
                ))}
                <div className={`mt-1 border-t ${G.line} pt-1`}>
                  <button role="menuitem" onClick={clearSimulated} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${G.dim} hover:bg-white/10 hover:text-[#e3e3e3]`}>
                    Clear simulated emails
                  </button>
                </div>
              </div>
            )}
          </div>
          <IconBtn icon={LayoutGrid} label="Google apps" />
          <span className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#0b57d0] text-sm font-medium text-white" aria-label="Account">A</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <nav aria-label="Mail folders" className="w-64 shrink-0 overflow-y-auto pb-4 pr-3">
          <button disabled title="Sending mail is not part of the checker" className="mb-4 ml-2 mt-1 flex h-14 items-center gap-4 rounded-2xl bg-[#c2e7ff] pl-4 pr-6 text-sm font-medium text-[#001d35] shadow-md">
            <Pencil className="h-5 w-5" />
            Compose
          </button>
          <NavItem icon={Inbox} label="Inbox" count={unread} active={folder === "inbox"} onClick={() => go("inbox")} />
          <NavItem icon={Star} label="Starred" active={folder === "starred"} onClick={() => go("starred")} />
          <NavItem icon={Clock} label="Snoozed" active={false} onClick={() => go("inbox")} />
          <NavItem icon={Send} label="Sent" active={folder === "sent"} onClick={() => go("sent")} />
          <NavItem icon={File} label="Drafts" active={folder === "drafts"} onClick={() => go("drafts")} />
          <NavItem icon={TriangleAlert} label="Spam" count={all.filter((e) => e.result?.category === "SPAM" && !read.has(e.email_id)).length} active={folder === "spam"} onClick={() => go("spam")} />
          <div className="mb-1 mt-5 flex items-center justify-between pl-6 pr-4 text-sm font-medium">Labels</div>
          {LABELS.map((l) => (
            <NavItem key={l.id} dot={l.dot} label={CATEGORY_LABEL[l.id]} count={countOf(l.id)} active={folder === l.id} onClick={() => go(l.id)} />
          ))}
        </nav>

        {/* Main pane */}
        <main className={`m-0 mb-3 mr-3 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-[#191919]`}>
          {selected ? (
            <Reader key={selected} id={selected} onBack={() => setSelected(null)} onStar={() => setStarred((s) => toggle(s, selected))} starred={starred.has(selected)} />
          ) : (
            <>
              <div className={`flex h-12 shrink-0 items-center gap-1 border-b ${G.line} px-3 text-sm`}>
                <div className="flex items-center gap-1 pl-1 pr-3">
                  <Box />
                </div>
                <IconBtn icon={RefreshCw} label="Refresh" onClick={reload} />
                <IconBtn icon={EllipsisVertical} label="More" />
                <div className={`ml-auto flex items-center gap-1 text-xs ${G.dim}`}>
                  <span className="mr-2" aria-live="polite">{rows.length ? `${start + 1}–${start + visible.length} of ${rows.length}${loading ? "+" : ""}` : "0 of 0"}</span>
                  <IconBtn icon={ChevronLeft} label="Newer" disabled={safePage === 0} onClick={() => turn(safePage - 1)} />
                  <IconBtn icon={ChevronRight} label="Older" disabled={safePage >= pageCount - 1} onClick={() => turn(safePage + 1)} />
                </div>
              </div>

              <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
                {error && <div className="p-4"><ErrorBanner message={error} onRetry={reload} /></div>}
                {loading && all.length === 0 && (
                  <div className="space-y-1 p-2">
                    {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                )}
                {!loading && rows.length === 0 && <p className={`p-12 text-center text-sm ${G.dim}`}>{emptyText}</p>}
                <ul>
                  {visible.map((e) => {
                    const isRead = read.has(e.email_id);
                    const t = shortTime(arrivedAt(e.email_id));
                    return (
                      <li key={e.email_id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => open(e.email_id)}
                          onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && open(e.email_id)}
                          className={`group flex h-10 cursor-pointer items-center gap-1 border-b ${G.line} pl-3 pr-4 text-sm transition-shadow hover:z-10 hover:shadow-[0_1px_3px_rgba(0,0,0,0.6)] ${isRead ? "bg-[#191919] text-[#c4c7c5]" : "bg-[#1f1f1f] font-semibold text-[#e3e3e3]"}`}
                        >
                          <span className="flex w-9 items-center justify-center">
                            <Box className="opacity-70" />
                          </span>
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setStarred((s) => toggle(s, e.email_id));
                            }}
                            aria-label={starred.has(e.email_id) ? "Unstar" : "Star"}
                            aria-pressed={starred.has(e.email_id)}
                            className="flex w-9 items-center justify-center text-[#9aa0a6] hover:text-[#e3e3e3]"
                          >
                            <Star className={`h-[18px] w-[18px] ${starred.has(e.email_id) ? "fill-[#fdd663] text-[#fdd663]" : ""}`} />
                          </button>
                          <span className="w-52 shrink-0 truncate pr-4 capitalize">{senderName(e.sender)}</span>
                          <span className="min-w-0 flex-1 truncate">
                            <span>{e.subject || "(no subject)"}</span>
                            {e.snippet && <span className={`font-normal ${G.dim}`}> – {e.snippet}</span>}
                          </span>
                          {e.attachments.length > 0 && <Paperclip className={`mx-2 h-4 w-4 shrink-0 ${G.dim}`} aria-label="Has attachment" />}
                          <span className="w-16 shrink-0 text-right text-xs">{t}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

