# Shippr — UI Implementation Gameplan

> **Instructions for Claude Code**: Read this entire document before writing a single line of code.
> Implement all sections in the order listed. Do not skip steps or reorder them.
> After each section is complete, verify the app builds (`npm run build`) before moving to the next section.
> Do NOT touch any files in `api/`, `sdoc/`, `scripts/`, `tests/`, or `supabase/` — backend is off-limits.
> Do NOT install any new npm packages. The entire implementation uses native React 19, Next.js 16, pure SVG, and existing installed packages.

---

## Project Context

This is **Shippr** — an AI-powered shipping documentation verification tool for Averis Shipping Documentation Services (RGE Group). It checks Shipping Instructions (SI) against draft Bills of Lading (BL) for field discrepancies. The app processes 520+ emails, classifies them, extracts document fields using AI, and surfaces mismatches for human review.

**Tech stack**: Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui (already installed), Geist font (already installed).

**Theme**: Already configured in `src/app/globals.css` with tweakcn Vercel-style tokens. Dark mode uses the `.dark` class. The palette is deliberately monochromatic (black/white/gray) — the ONLY colors that appear are the semantic status tokens (`ok`, `bad`, `warn`, `ai`) which must only be used when they carry meaning (e.g. a Mismatch badge is always `bad`, an OK badge is always `ok`).

**Available shadcn components** (already installed, import from `@/components/ui/[name]`):
- `button`, `card`, `badge`, `table`, `tabs`, `avatar`, `separator`, `tooltip`

**Existing custom components** (in `src/components/ui.tsx` — do NOT delete these, they are used across multiple pages):
- `StatusPill`, `CategoryBadge`, `DecidedBy`, `FieldChip`, `KpiTile`, `Bar`, `Card`, `PageHeader`, `ErrorBanner`, `Skeleton`, `buttonPrimary`, `buttonSecondary`

---

## Section 0 — Prerequisite repairs (do these FIRST; they are pre-existing bugs the new theme exposed)

The tweakcn theme in `globals.css` replaced the old design tokens, so parts of the *existing* UI are currently broken. Fix these before building anything on top.

### 0.1 `text-muted` is now a background colour, not a text colour
The old theme defined `--color-muted` as the muted **text** colour. shadcn's `--muted` is a **background** (dark: `oklch(0.269 0 0)` on a `0.145` page), so all ~48 uses of `text-muted` in the old code render as near-invisible text.
**Fix**: in `src/components/ui.tsx`, `FieldTable.tsx`, `ReviewPanel.tsx`, `Nav.tsx`, `src/app/page.tsx`, `src/app/metrics/page.tsx`, `src/app/process/page.tsx`, `src/app/emails/[id]/page.tsx`, `src/app/review/page.tsx` replace the class `text-muted` (and `hover:text-muted`) with `text-muted-foreground`. Do **not** touch `text-muted-foreground`, `bg-muted`, `bg-muted/…`. (Sections 4–6 rewrite most of those pages anyway; this matters for `ui.tsx`, `FieldTable`, `ReviewPanel`, `process/`, and `metrics`.)

### 0.2 `bg-accent` / `text-accent-fg` / `text-accent` are broken
The old `--accent` was a blue and `--accent-fg` its contrast text. Now `--accent` is a near-background grey (identical to `surface-2` in dark mode, so `Bar` fills are invisible) and `--accent-fg` no longer exists (so `buttonPrimary` has no text colour, and is near-white-on-white in light mode).
**Fix** (this is the one allowed edit to `ui.tsx`, plus one line in `process/page.tsx` and `ReviewPanel.tsx`):
- `ui.tsx` `Bar`: `accent: "bg-accent"` → `accent: "bg-foreground"`
- `ui.tsx` `buttonPrimary`: `bg-accent … text-accent-fg` → `bg-primary … text-primary-foreground`
- `process/page.tsx:102` progress fill `bg-accent` → `bg-foreground`
- `ReviewPanel.tsx:10` `focus:border-accent` → `focus:border-ring`

### 0.3 `Skeleton` never animates
`ui.tsx` uses `animate-[pulse-soft_…]` but the `@keyframes pulse-soft` (and the `prefers-reduced-motion` rule) were deleted from `globals.css` in the theme swap. Append to the end of `src/app/globals.css` (additive only — do not change any existing rule):
```css
@keyframes pulse-soft { 50% { opacity: 0.45; } }
@media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation: none !important; transition: none !important; } }
:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
```

### 0.4 Lint rules that the snippets below must satisfy
`npm run lint` (eslint-config-next, React 19 rules) currently passes and must keep passing: no `setState` synchronously inside `useEffect` (use `useSyncExternalStore` or lazy `useState` instead), no unescaped `"` / `'` in JSX text (use `&ldquo;` `&rdquo;` `&apos;`), no `<a>` for internal links (use `next/link`).

---

## Design References

The UI is inspired by five visual references combined into a cohesive, professional enterprise system:

1. **Shell & Sidebar**: Inspired by LinkGuard Home — dark left sidebar (~240px), grouped nav sections (PLATFORM / ANALYTICS), user account pinned to bottom-left, clean icon + label nav links.
2. **Inbox Table**: Inspired by the Employment Table screenshot — clean tabular layout with sort icons, color-dot category indicators, green/red status badges with checkmark/X icons, subtle row hover.
3. **Email Detail + Review Drawer**: Inspired by the Proposal Activity Drawer screenshot — right-side pinned activity panel with timeline events, timestamps, contributor metadata, and action links.
4. **Shipping Route Intelligence Map**: Inspired by Flexport (Image 3) dotted-matrix world map + Logistics Tracking (Image 1) arc routes and flight/sea tracking side panel.
5. **Operational Metrics Breakdown**: Inspired by Incident Tracking (Image 4) bar charts + LinkGuard (Image 5) circular completion rings.

---

## Section 1 — Dark Mode Default & Global Layout Restructure

### 1.1 Enable Dark Mode by Default

**File**: `src/app/layout.tsx`

Add `dark` class to the `<html>` element so dark mode is always active regardless of OS settings. Also wrap children in `TooltipProvider` (required by shadcn tooltip).

```tsx
// Import TooltipProvider
import { TooltipProvider } from "@/components/ui/tooltip";

// Change the html element to:
<html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}>
```

### 1.2 Update App Metadata (Rebrand to Shippr)

**File**: `src/app/layout.tsx`

```tsx
export const metadata: Metadata = {
  title: { default: "Shippr", template: "%s · Shippr" },
  description: "AI-powered shipping document verification. Checks Shipping Instructions against draft Bills of Lading.",
};
```

### 1.3 Restructure Root Layout to Sidebar + Content

**File**: `src/app/layout.tsx`

Replace the current top-nav + main layout with a sidebar + content split. Remove the import of the old `Nav` component.

**Scrolling rule (bug fix)**: do NOT make `<main>` an inner `overflow-y-auto` scroller with `overflow-hidden` on the body. Next.js resets *window* scroll on navigation, not an inner container's, so opening an email from a scrolled inbox would land mid-page. Let the **document** scroll and make the sidebar `sticky top-0 h-screen` instead.

```tsx
// Remove: import { Nav } from "@/components/Nav";
// Add:    import { AppSidebar } from "@/components/AppSidebar";
// Add:    import { OperatorGuide } from "@/components/OperatorGuide";

export default function RootLayout({ children }: LayoutProps<"/">) {   // keep the existing LayoutProps typing
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <TooltipProvider>
          <div className="flex min-h-screen w-full">
            <AppSidebar />
            <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
          </div>
          <OperatorGuide />
        </TooltipProvider>
      </body>
    </html>
  );
}
```

---

## Section 2 — Shippr Logo SVG Component

### 2.1 Create Logo Component

**File**: `src/components/ShipprLogo.tsx` [NEW]

The logo is a cargo ship silhouette facing right with 5 ascending bar-chart-style containers/masts rising from the deck. Adapt it for dark mode: the ship hull and bars should be **white** (`currentColor`), with the tallest bar using a **muted gray** (`oklch(0.56 0 0)`) to suggest depth.

Create the logo as an inline SVG so its colors respond to the theme via `currentColor`.

```tsx
export function ShipprLogo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Shippr logo"
    >
      {/* Ship hull */}
      <path
        d="M5 58 L20 72 L80 72 L95 58 L85 45 Q50 30 15 45 Z"
        fill="currentColor"
      />
      {/* Bar 1 (shortest, leftmost) */}
      <rect x="22" y="38" width="8" height="18" rx="1" fill="currentColor" />
      {/* Bar 2 */}
      <rect x="33" y="28" width="8" height="28" rx="1" fill="currentColor" />
      {/* Bar 3 */}
      <rect x="44" y="20" width="8" height="36" rx="1" fill="currentColor" />
      {/* Bar 4 */}
      <rect x="55" y="14" width="8" height="42" rx="1" fill="currentColor" />
      {/* Bar 5 (tallest, rightmost — muted to suggest depth) */}
      <rect x="66" y="8" width="8" height="48" rx="1" fill="oklch(0.56 0 0)" />
      {/* Bridge protrusion on bar 5 */}
      <rect x="63" y="24" width="14" height="8" rx="1" fill="oklch(0.45 0 0)" />
    </svg>
  );
}
```

> **Note**: Adjust the SVG path coordinates to faithfully reproduce the uploaded ship logo shape. The key visual elements are: a streamlined hull angled upward to the right, and 5 ascending vertical rectangles rising from the deck like shipping containers or a bar chart signal meter.

---

## Section 3 — App Sidebar

### 3.1 Create the AppSidebar Component

**File**: `src/components/AppSidebar.tsx` [NEW]

The sidebar is a fixed-width (~240px), full-height, dark panel. It never scrolls — only the main content scrolls.

**Visual spec**:
- Background: `bg-sidebar`
- Border: `border-r border-sidebar-border`
- Width: `w-60` (240px)
- Full height + stays in view while the page scrolls: `sticky top-0 h-screen shrink-0 flex flex-col`

**Structure** (top to bottom):

```
┌─────────────────────────────┐
│  [ShipprLogo]  Shippr       │  ← Brand header, py-4 px-4, border-b border-sidebar-border
├─────────────────────────────┤
│  PLATFORM                   │  ← Section label: text-xs uppercase tracking-wider text-muted-foreground px-3 pt-5 pb-1
│  ◉ Inbox           [badge]  │  ← Nav link
│  ○ Review Queue    [badge]  │  ← Badge shows review_queue count
│  ○ Process                  │
├─────────────────────────────┤
│  ANALYTICS                  │  ← Second section label
│  ○ Metrics                  │
├─────────────────────────────┤
│  (flex-1 spacer)            │
├─────────────────────────────┤
│  [Avatar] Operator      >   │  ← Bottom user row, border-t border-sidebar-border py-3 px-3
└─────────────────────────────┘
```

**Nav link style**:
- Base: `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors`
- Hover: `hover:bg-sidebar-accent hover:text-sidebar-accent-foreground`
- Active (current route): `bg-sidebar-accent text-sidebar-accent-foreground`
- Use `usePathname()` to determine active state (mark the component `"use client"`)
- Active rule for Inbox: `pathname === "/" || pathname?.startsWith("/emails")`
- Active rule for Review Queue: `pathname?.startsWith("/review")`
- Active rule for Process: `pathname?.startsWith("/process")`
- Active rule for Metrics: `pathname?.startsWith("/metrics")`

**Icons**: Use simple inline SVG icons (16x16, stroke-based, strokeWidth 1.5). Do NOT install any icon library.
- Inbox: envelope icon
- Review Queue: clipboard-check icon
- Process: play-circle icon
- Metrics: bar-chart-2 icon

**Review Queue badge**: Call `useApi<Metrics>("/metrics")` to get `data.review_queue`. Display as a small badge with `ml-auto rounded-full bg-warn-bg px-1.5 text-xs font-semibold text-warn` if count > 0.

**Bottom user row**:
```tsx
<div className="border-t border-sidebar-border p-3">
  <div className="flex items-center gap-3 rounded-md px-2 py-2 text-sm text-sidebar-foreground">
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
      OP
    </div>
    <span className="flex-1 text-sm font-medium">Operator</span>
    <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  </div>
</div>
```

---

## Section 4 — Inbox Page Redesign (`src/app/page.tsx`)

### 4.1 KPI Cards

Keep the 4 KPI tiles but restyle them to match the monochromatic Vercel aesthetic:
- Card: `bg-card border border-border rounded-xl p-4`
- Label: `text-xs font-medium uppercase tracking-wider text-muted-foreground`
- Value: `text-3xl font-semibold tabular-nums text-foreground mt-1`
- Hint: `text-xs text-muted-foreground mt-0.5`
- Tone colors (`bad`, `warn`, `ok`) only apply to the value text color, NOT the card background

**Updated KPI labels**:
| Old Label | New Label | Value | Hint |
|---|---|---|---|
| Processed | Processed | `m ? `${m.processed}/${m.total_emails}` : "–"` | `m && m.unprocessed ? `${m.unprocessed} waiting` : "inbox up to date"` (keep the existing conditional; a hard-coded "up to date" is wrong mid-run) |
| Mismatches | Mismatches | `m ? mismatches : "–"` | "BL ≠ SI" |
| Needs Review | Needs Review | `m ? needsReview : "–"` | `m ? `${m.review_queue} in queue` : undefined` |
| Decided by rules | AI-Assisted | `m?.rule_share != null ? `${Math.round((1 - m.rule_share) * 100)}%` : "–"` | "semantic extraction & classification" |

### 4.2 Filter Section

Restyle filter chips using shadcn `Badge`:
- Base chip: `border border-border bg-transparent text-muted-foreground hover:bg-muted text-xs px-3 py-1 rounded-full cursor-pointer transition-colors`
- Active chip: `border-foreground bg-foreground text-background`
- Group label: `text-xs uppercase tracking-wider text-muted-foreground w-20 shrink-0`
- Keep all existing filter logic (useSearchParams, useRouter, setFilter) completely unchanged

### 4.3 Email Table

Replace the current `<ul>` email list with a proper `<Table>` using the shadcn table components.

**Table wrapper**: `<div className="rounded-xl border border-border overflow-hidden bg-card">`

**Column headers** (`<TableHeader>`):
```
☐ | Email ID | Subject | Sender | Attachments | Category | Status | By | →
```
- Header row: `bg-muted/30 border-b border-border`
- Header cell text: `text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 py-3`
- Checkbox column header: has a static decorative checkbox (unchecked, `cursor-default`)

**Table rows** (`<TableBody>`):
- Each `<TableRow>`: `border-b border-border hover:bg-muted/40 cursor-pointer transition-colors last:border-0`
- Cell padding: `px-4 py-3`
- Clicking the row navigates to `/emails/[email_id]` — use `useRouter().push()` **and** render the Subject text as a `next/link` `<Link href=...>` (with `onClick={(e) => e.stopPropagation()}`) so the row stays keyboard-accessible, middle-clickable and prefetched, as the current list is. The decorative checkbox cell must also stop propagation and be `tabIndex={-1} aria-hidden`.

**Column content**:
| Column | Content |
|---|---|
| ☐ | `<input type="checkbox" className="cursor-default opacity-50" readOnly />` |
| Email ID | `<span className="font-mono text-xs text-muted-foreground">{email.email_id}</span>` |
| Subject | `<span className="font-medium text-sm truncate max-w-xs block">{email.subject ?? "(no subject)"}</span>` |
| Sender | `<span className="text-sm text-muted-foreground truncate max-w-[180px] block">{email.sender ?? "—"}</span>` |
| Attachments | `<span className="text-xs text-muted-foreground">{email.attachments.length > 0 ? email.attachments.length + " files" : "—"}</span>` |
| Category | Category dot + label (null-safe, see below) |
| Status | **Only BL comparisons have a verdict.** If `result.category === "BL_COMPARISON"` show `StatusPill`; if the result exists but is another category show `<span className="text-xs text-muted-foreground">—</span>`; if there is no result show `Not processed`. (Bug fix: showing a green "OK" pill on spam/general emails is misleading and differs from the current behaviour.) Below the pill, when `status` is not `OK`/`MISMATCH`, keep the existing reason line: `<div className="mt-1 text-xs text-warn">{describeReview(result)}</div>` (import `describeReview` from `@/lib/api`; this also surfaces `ERROR` rows). |
| By | `DecidedBy` component if result exists |
| → | `<svg chevron-right 16x16 text-muted-foreground />` |

**Category color dot (Defensive null-safe check)**:
```tsx
const CATEGORY_DOT: Record<Category, string> = {
  BL_COMPARISON: "bg-foreground",
  SI_REQUEST: "bg-ok",
  INVOICE_QUERY: "bg-warn",
  GENERAL: "bg-muted-foreground",
  SPAM: "bg-bad",
};

// Render as (guards against null result):
{email.result?.category ? (
  <div className="flex items-center gap-2">
    <span className={`h-2 w-2 rounded-full shrink-0 ${CATEGORY_DOT[email.result.category]}`} />
    <span className="text-sm text-muted-foreground">{CATEGORY_LABEL[email.result.category]}</span>
  </div>
) : (
  <span className="text-xs text-muted-foreground">Unclassified</span>
)}
```

**Defect field chips**: If an email has defect_fields (`email.result?.defect_fields?.length > 0`), show them below the subject in the Subject cell as small `FieldChip` components:
```tsx
{email.result?.defect_fields && email.result.defect_fields.length > 0 && (
  <div className="flex flex-wrap gap-1 mt-1">
    {email.result.defect_fields.map((f) => (
      <FieldChip key={f} field={f} />
    ))}
  </div>
)}
```

**Empty state**: A `<TableRow>` with a single `<TableCell colSpan={9}>` containing a centered muted message.

**Loading state**: Show `<Skeleton>` rows (6 rows of height h-12) inside the table body instead of the real rows.

### 4.4 Page Header

Replace the `<PageHeader>` with an inline header section:
```tsx
<div className="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
    <p className="mt-1 text-sm text-muted-foreground">
      SI vs draft BL verification — every email is triaged and checked field by field.
    </p>
  </div>
  <button className={buttonSecondary} disabled>
    Export ▾ {/* TODO: wire up export — placeholder only */}
  </button>
</div>
```

### 4.5 CRITICAL Next.js 16 Rule: Suspense Boundary Wrapper

Because `src/app/page.tsx` uses `useSearchParams()`, Next.js App Router **strictly requires** an enclosing `<Suspense>` boundary.
Claude Code MUST preserve the two-component architecture:
```tsx
function InboxContent() {
  // All hooks (useRouter, useSearchParams, useEmails, useApi) and JSX live here
  ...
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <InboxContent />
    </Suspense>
  );
}
```
Do NOT flatten this into a single component without `<Suspense>`, otherwise `npm run build` will fail with: `useSearchParams() should be wrapped in a suspense boundary`.

---

## Section 5 — Email Detail Page Redesign (`src/app/emails/[id]/page.tsx`)

### 5.1 Split Panel Layout

Change the current single-column `<div className="space-y-5">` to a horizontal split:

```tsx
<div className="flex gap-6 min-h-0">
  {/* Left: main content */}
  <div className="flex-1 min-w-0 space-y-5">
    {/* all existing content cards go here, EXCEPT the old Audit trail card */}
  </div>
  {/* Right: review activity drawer */}
  <div className="w-80 shrink-0">
    <ReviewActivityDrawer result={result} reviews={reviews} />
  </div>
</div>
```

**Remove Duplicate Audit Trail**: Remove the old `{reviews.length > 0 && <Card title="Audit trail">...</Card>}` from the left panel. The audit trail timeline is now exclusively and prominently showcased in the right-side `ReviewActivityDrawer`.
Keep all other card content (Verdict, explanation, FieldTable, ReviewPanel, email body) inside the left panel. Do NOT change any review/submit logic.

### 5.2 ReviewActivityDrawer Component

**File**: `src/components/ReviewActivityDrawer.tsx` [NEW]

```tsx
"use client";

import type { Result, Review } from "@/lib/api";
import { StatusPill } from "@/components/ui";

interface Props {
  result: Result | null;
  reviews: Review[];
}

export function ReviewActivityDrawer({ result, reviews }: Props) {
  return (
    <div className="sticky top-0 rounded-xl border border-border bg-card p-4 space-y-4">
      <h2 className="text-sm font-semibold text-foreground">Review Activity</h2>

      {/* Pending review banner — same condition as the page's `needsReview` (ERROR also needs a human) */}
      {result && (result.status === "NEEDS_REVIEW" || result.status === "ERROR") && !result.reviewed && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          This document is pending human review. Actions taken in the Review card are recorded here.
        </div>
      )}

      {/* Timeline */}
      {reviews.length === 0 ? (
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <span className="mt-1.5 h-2 w-2 rounded-full border border-muted-foreground shrink-0" />
          <div>
            <p className="font-medium">No review activity yet.</p>
            <p className="text-xs mt-0.5">Operator actions will appear here.</p>
          </div>
        </div>
      ) : (
        <ol className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="flex items-start gap-3">
              <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${r.action === "confirm" ? "bg-ok" : "bg-warn"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium capitalize">{r.action === "confirm" ? "Confirmed" : "Corrected"}</p>
                <p className="text-xs text-muted-foreground font-mono">{new Date(r.created_at).toLocaleString()}</p>
                {r.before && r.after && (
                  <div className="mt-2 grid grid-cols-[4rem_1fr] gap-x-2 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Before</span>
                    <StatusPill status={r.before.status} />
                    <span className="text-muted-foreground">After</span>
                    <StatusPill status={r.after.status} />
                  </div>
                )}
                {r.note && (
                  <p className="mt-1 text-xs text-muted-foreground italic">&ldquo;{r.note}&rdquo;</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {!result && (
        <p className="text-xs text-muted-foreground">Process this email first to enable review.</p>
      )}
    </div>
  );
}
```

### 5.3 Back Navigation

Replace the existing `← Inbox` link with a more refined breadcrumb:
```tsx
<nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
  <Link href="/" className="hover:text-foreground transition-colors">Inbox</Link>
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
  <span className="text-foreground font-medium truncate max-w-xs">{email.subject ?? email.email_id}</span>
</nav>
```

---

## Section 6 — Review Queue Page Redesign (`src/app/review/page.tsx`)

### 6.1 Group Headers

Replace the existing `<h2>` with (keep `id={`g-${k}`}` on the `<h2>` — the enclosing `<section aria-labelledby>` needs it):
```tsx
<div className="mb-3">
  <div className="flex items-center gap-2 mb-2">
    <h2 id={`g-${k}`} className="text-sm font-semibold text-foreground">{TITLE[k] ?? k}</h2>
    <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">
      {groups.get(k)!.length}
    </span>
  </div>
  <Separator />
</div>
```

Import `Separator` from `@/components/ui/separator`.

### 6.2 Queue Cards

Switch from 2-column grid to a single-column list: keep the `<ul className="space-y-3">` / `<li key={q.email_id}>` wrappers (list semantics) around each `<Link>`. Restyle each card:

```tsx
<Link
  href={`/emails/${q.email_id}`}
  className="block rounded-xl border border-border bg-card p-4 hover:bg-muted/40 transition-colors"
>
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono text-xs text-muted-foreground">{q.email_id}</span>
        <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${REASON_BADGE[k] ?? "bg-muted text-muted-foreground"}`}>
          {TITLE[k] ?? k}
        </span>
      </div>
      <p className="font-medium text-sm truncate">{q.subject ?? "(no subject)"}</p>
      <p className="text-xs text-muted-foreground mt-0.5 truncate">{q.sender}</p>
      {q.result.explanation && (
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2 italic">
          {q.result.explanation}
        </p>
      )}
      {q.result.provisional_fields.length > 0 && (
        <p className="mt-2 text-xs font-medium text-ai">
          AI vision values ready to confirm
        </p>
      )}
    </div>
    <span className="text-sm font-medium text-foreground shrink-0">Review →</span>
  </div>
</Link>
```

**Reason badge color map** (add this constant to the file):
```tsx
const REASON_BADGE: Record<string, string> = {
  processing_error: "bg-err-bg text-err",
  missing_attachment: "bg-warn-bg text-warn",
  unreadable: "bg-ai-bg text-ai",
  wrong_doc_type: "bg-warn-bg text-warn",
  missing_value: "bg-err-bg text-err",
};
```

Keep all existing data logic completely unchanged.

---

## Section 10 — Metrics Page Redesign: Shipping Route Intelligence Console (`src/app/metrics/page.tsx`)

### 10.1 Concept & Purpose
Transform `/metrics` into a high-level **Operations & Route Intelligence Console** that looks like an elite Palantir/Flexport logistics terminal (inspired by Images 1, 3, 4, 5):
1. **Interactive Global Shipping Map**: Dark dotted/vector world map with glowing port nodes and curved shipping lanes.
2. **Lane Health Status**: Arcs colored by verification outcome:
   - Green arc: 100% matched shipments along this corridor.
   - Red arc: Discrepancies/mismatches detected (e.g. consignee/weight errors common on this carrier lane).
   - Amber arc: Documents pending human review / OCR scan verification.
3. **Route Intelligence Side Panel**: Ranked list of origin → destination shipping lanes with volume, error rate, and filter interaction.
4. **Operations Breakdown & Model Validation**: Clear bar charts and circular completion rings below the map.

### 10.2 Zero-Package SVG Map Architecture (Safe for React 19 & Vercel)
- **Do NOT install `react-simple-maps` or `d3-geo`** (they conflict with React 19 peer dependencies and fail on Vercel deployments).
- **Architecture**: A pure, native React/SVG component with zero external packages.
- **Map Vector Asset**: Loads the authentic pixel-dot world map generated by the user at `/worldLow-pixels.svg` (`public/worldLow-pixels.svg`).
- **Container (bug fixes)**: `bg-black border border-border rounded-xl relative overflow-hidden` with `style={{ aspectRatio: "826.85 / 503.39" }}` — NOT a fixed `h-[420px]`. The map and the overlay must share one aspect ratio or every port drifts off its country when the width changes.
- Render the map as `<img src="/worldLow-pixels.svg" alt="" className="absolute inset-0 h-full w-full opacity-30" />` (the land dots are pure `#fff`; at full opacity they hide the white port nodes and the coloured arcs — dim them). Use a plain `<img>` (an SVG asset; `next/image` adds nothing and can trip the lint rule only if omitted `alt`).
- On top, an overlay `<svg viewBox="97.32 0.84 826.85 503.39" className="absolute inset-0 h-full w-full">` (same viewBox as the asset, default `preserveAspectRatio`) plots the seaport nodes and shipping arcs:
  - **Coordinate projection (bug fix — the original formula is wrong)**. The asset is NOT a plain linear 360°×145° box: checked against the country dot groups in the file (Australia, South Africa, Iceland, Norway, Chile, NZ, India, Brazil) the original formulas put ports up to **~76 px too low and ~35 px off in x** (e.g. Callao would land in the Pacific south of Peru, Rotterdam in the Baltic). Do not use them. Instead, in `src/lib/ports.ts`, export `project(lon, lat): [x, y]` and **calibrate it against the map**:
    1. Write a throw-away script (in the scratchpad, not the repo) that parses `public/worldLow-pixels.svg` (`<g id="XX">` country groups → `<circle cx cy>`), takes the dot bounding box of ~10 countries with well-known lon/lat extents, and least-squares fits `x = ax + kx·lon` and `y = ay + ky·f(lat)` for both `f(lat)=lat` and the Miller `f(lat)=1.25·ln(tan(π/4 + 0.4·lat_rad))`; keep whichever has the lower error and hard-code the fitted constants in `project()`.
    2. **Visually verify** in the browser: render the markers for Singapore, Rotterdam, Callao, Houston, Busan, Fremantle and confirm each sits on/next to the right coastline. (A first rough fit from Claude's check: `y ≈ 254.6 − 156.0·miller(lat)`, `x ≈ 478.8 + 2.51·lon`; mean error 4–7 px — refine it, do not trust it blindly.)
  - Quadratic Bezier curve between `(x1, y1)` and `(x2, y2)`:
    `midX = (x1 + x2) / 2`
    `midY = Math.min(y1, y2) - Math.abs(x2 - x1) * 0.15`
    `<path d={`M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`} className="fill-none stroke-2 transition-all duration-300" />`
  - Port markers: `<circle cx={x} cy={y} r="3.5" className="fill-white drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]" />` plus a slightly larger transparent `r="10"` circle as the hover/click target. Add `role="button" tabIndex={0}` + Enter/Space handling to arcs and nodes, and `pointer-events-none` on the decorative glow. Skip any lane whose origin and destination resolve to the same port (zero-length arc).
- This approach burns virtually **zero AI tokens**, has **zero deployment risk**, and looks identical to Flexport's real pixel-dot world console.

### 10.3 Port Coordinate Normalization Table
**File**: `src/lib/ports.ts` [NEW]
Create a robust coordinate lookup table for the ports found in the dataset, handling raw string variations (e.g. `"CALLAO_PERU"`, `"JEBEL ALI_UAE"`, `"HOCHIMINH CITY_VIETNAM"`).

**Bugs fixed in the original spec below**:
- **Coverage**: the dataset's BL-comparison subjects (`… _ 5RSG-00133 _ CALLAO_PERU _ CONSIGNEE _ REF`) name ~26 destination ports; the original table covered only 3 of them (Callao, Aqaba, Busan). Add every one of: `CALLAO`, `FREMANTLE`, `SAVANNAH`, `HOUSTON`, `KOPER`, `MERSIN`, `JEBEL ALI`, `YANGON`, `NEW YORK`, `BUSAN`, `GDANSK`, `AQABA`, `BRISBANE`, `APAPA`, `BALTIMORE`, `CONAKRY`, `ASHDOD`, `KARACHI`, `CEBU`, `KLAIPEDA`, `PYEONGTAEK`, `HOCHIMINH CITY`, `MOMBASA`, `TUTICORIN`, `VALPARAISO`, `LONG BEACH` (plus `SINGAPORE`, `NHAVA SHEVA`, `LE HAVRE`, which appear in other subject styles). Keep the extra ports below only if useful.
- **Key format**: keys must be matched on a normalised string (`raw.toUpperCase().replace(/[_,]+/g, " ")`), because `"JEBEL ALI_UAE"` never contains the key `JEBEL_ALI`.
- **No 3-letter code matching**: the original `upper.includes(loc.code)` matches `"SIN525534192"` (a BL ref in an Aqaba subject) as Singapore, `"SHA"` inside other words, etc. Match on the port *name* only, on word boundaries, and resolve the **longest** matching name.
- **Parse the right token**: for subjects shaped `A _ B _ PORT_COUNTRY _ …` take segment index 2; otherwise fall back to scanning the whole subject for a known port name. Do not scan a segment that contains a reference/BL number.
- Type the table as `Record<string, PortLocation>` keyed by normalised uppercase name, and expose `resolvePort(subject)` returning `PortLocation | null`; unresolved subjects are counted as "unmapped" and shown in the lane panel footer, never dropped silently.

Original spec (extend it as above):

```ts
export interface PortLocation {
  name: string;
  code: string;
  coordinates: [number, number]; // [longitude, latitude]
}

export const PORT_COORDINATES: Record<string, PortLocation> = {
  CALLAO: { name: "Callao, Peru", code: "CLL", coordinates: [-77.15, -12.06] },
  SINGAPORE: { name: "Singapore", code: "SIN", coordinates: [103.85, 1.29] },
  ROTTERDAM: { name: "Rotterdam, Netherlands", code: "RTM", coordinates: [4.48, 51.92] },
  DUBAI: { name: "Jebel Ali, UAE", code: "DXB", coordinates: [55.03, 25.01] },
  JEBEL_ALI: { name: "Jebel Ali, UAE", code: "JEA", coordinates: [55.03, 25.01] },
  SHANGHAI: { name: "Shanghai, China", code: "SHA", coordinates: [121.47, 31.23] },
  QINGDAO: { name: "Qingdao, China", code: "TAO", coordinates: [120.38, 36.07] },
  NINGBO: { name: "Ningbo, China", code: "NGB", coordinates: [121.55, 29.87] },
  NANTONG: { name: "Nantong, China", code: "NTG", coordinates: [120.89, 32.01] },
  BUSAN: { name: "Busan, South Korea", code: "PUS", coordinates: [129.08, 35.18] },
  LOS_ANGELES: { name: "Los Angeles, USA", code: "LAX", coordinates: [-118.24, 33.74] },
  SANTOS: { name: "Santos, Brazil", code: "SSZ", coordinates: [-46.33, -23.96] },
  VALENCIA: { name: "Valencia, Spain", code: "VLC", coordinates: [-0.38, 39.47] },
  HAMBURG: { name: "Hamburg, Germany", code: "HAM", coordinates: [9.99, 53.55] },
  ANTWERP: { name: "Antwerp, Belgium", code: "ANR", coordinates: [4.40, 51.22] },
  TANJUNG_PELEPAS: { name: "Tanjung Pelepas, Malaysia", code: "TPP", coordinates: [103.55, 1.36] },
  PORT_KLANG: { name: "Port Klang, Malaysia", code: "PKG", coordinates: [101.40, 2.99] },
  JAKARTA: { name: "Jakarta, Indonesia", code: "JKT", coordinates: [106.88, -6.10] },
  COLOMBO: { name: "Colombo, Sri Lanka", code: "CMB", coordinates: [79.86, 6.93] },
  CHITTAGONG: { name: "Chittagong, Bangladesh", code: "CGP", coordinates: [91.83, 22.34] },
  AQABA: { name: "Aqaba, Jordan", code: "AQB", coordinates: [35.01, 29.53] },
};

export function resolvePort(raw: string | null | undefined): PortLocation | null {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  for (const [key, loc] of Object.entries(PORT_COORDINATES)) {
    if (upper.includes(key) || upper.includes(loc.name.toUpperCase()) || upper.includes(loc.code)) {
      return loc;
    }
  }
  return null;
}
```

### 10.4 Shipping Route Map & Lane Intelligence Component
**File**: `src/components/ShippingRouteMap.tsx` [NEW]
- Fetches **all** BL comparisons with `apiGet` from `@/lib/api` (not raw `fetch`), paging `?category=BL_COMPARISON&limit=200&offset=N` until a page returns < 200 rows. (Bug fix: the API returns at most 200 rows and there are ~220 BL emails, so a single `limit=100` call silently shows under half the lanes and wrong counts.) Show loading and error states (`Skeleton`, `ErrorBanner`).
- **Honest labelling (bug fix)**: the API list omits the loading port, so pairing every destination with Singapore is an *assumption*, not data. Label the origin as "Origin hub (assumed): Singapore" in the panel header and tooltips, and never claim a lane's origin is verified. Do not present the assumed origin in the lane-name text as fact — use "→ CALLAO, PERU" style for the destination and show the hub once in the header.
- **CRITICAL DATA RULE**: In `/api/py/emails`, `email.result.fields` is omitted for speed. Therefore, extract the destination port from `email.subject` via `resolvePort(email.subject)`! Every email subject in the Averis dataset has the destination (e.g. `TO CONFIRM DOCS _ 5RSG-00133 _ CALLAO_PERU _ ...`).
- Pair each detected destination port with the default Averis loading hub (`PORT_COORDINATES.SINGAPORE`).
- Aggregate lane stats across matching emails: Total shipments, Mismatches (`email.result?.status === 'MISMATCH'`), Reviews (`email.result?.status === 'NEEDS_REVIEW'`), and `defect_fields`.
- Lane styling:
  - Mismatch > 0: `stroke-bad` with glowing hover state.
  - Needs Review > 0: `stroke-warn`.
  - All matched: `stroke-ok` or `stroke-primary/40`.
- Interactive tooltip & Lane Linking: Shows lane name, volume, defect rate, and top differing fields.
- Clicking an arc or seaport node on the map highlights that shipping corridor in the right-side Route Lanes Panel; clicking a corridor in the list highlights its corresponding arc on the map.

### 10.5 Layout of `src/app/metrics/page.tsx`
Structure the page in 4 distinct rows:

```
┌────────────────────────────────────────────────────────────────────────┐
│ ROW 1: KPI SUMMARY CARDS                                               │
│ [ Processed ]  [ Mismatches ]  [ In Review ]  [ Est. AI cost ]         │
│ (live values from /metrics — the numbers in this mock are examples)    │
├─────────────────────────────────────┬──────────────────────────────────┤
│ ROW 2: GLOBAL ROUTE INTELLIGENCE    │ ROUTE LANES PANEL (Scrollable)   │
│                                     │                                  │
│ [ Dotted World Map with Arcs ]      │ 🔍 Search lane (port)            │
│ - Green: OK                         │ ───────────────────────────────  │
│ - Red: Mismatch detected            │ ● CALLAO → DUBAI                 │
│ - Amber: Needs review               │   14 shipments · 3 mismatches    │
│ - White: Active seaport nodes       │                                  │
│                                     │ ● SINGAPORE → ROTTERDAM          │
│                                     │   28 shipments · 0 mismatches    │
├─────────────────────────────────────┴──────────────────────────────────┤
│ ROW 3: OPERATIONAL BREAKDOWN (3 Columns)                               │
│ ┌──────────────────┐ ┌────────────────────┐ ┌────────────────────────┐ │
│ │ Mismatches/Field │ │ Review Escalations │ │ Triage Distribution    │ │
│ │ (Consignee: 24)  │ │ (Unreadable: 8)    │ │ (BL Comparison: 220)   │ │
│ └──────────────────┘ └────────────────────┘ └────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│ ROW 4: MODEL VALIDATION & RUN BENCHMARKS                               │
│ [ Organiser Dataset: 1.000 ]   [ Unseen Phrasings: 67% Rules → 100% AI]│
└────────────────────────────────────────────────────────────────────────┘
```

**Circular Progress Rings** (Image 5 style):
In the KPI or Lane panel, render circular SVG stroke rings:
```tsx
function ProgressRing({ value, max, color }: { value: number; max: number; color: string }) {
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const pct = max > 0 ? (value / max) * circ : 0;
  return (
    <svg className="h-10 w-10 -rotate-90">
      <circle cx="20" cy="20" r={radius} className="stroke-muted/30 fill-none" strokeWidth="3" />
      <circle
        cx="20" cy="20" r={radius}
        className={`fill-none ${color} transition-all duration-500`}
        strokeWidth="3"
        strokeDasharray={circ}
        strokeDashoffset={circ - pct}
        strokeLinecap="round"
      />
    </svg>
  );
}
```

---

## Section 11 — Floating Operator Guide / Quickstart Checklist (`src/components/OperatorGuide.tsx`)

### 11.1 Purpose & Design Reference
Inspired directly by the **Onboarding Checklist (Image 1)**:
A non-intrusive, floating widget anchored to the bottom-right corner (`fixed bottom-6 right-6 z-40`). It functions as an **"Operator Quickstart & Evaluator Guide"** that walks Averis managers and hackathon judges through testing the core workflow of Shippr.

**Key Design Decisions**:
- **Zero Layout Interference**: Floats above content without pushing or distorting existing tables or sidebars.
- **Collapsible to a Pill**: Can be collapsed down into a compact pill button (`[📋 Quickstart Guide (3/5) ▾]`) so it never obstructs the demo.
- **Direct Navigation**: Clicking any checklist step navigates directly to that page/email, letting judges effortlessly test the prototype.
- **Local Persistence**: Stores progress and collapsed state in `localStorage` (`shippr_guide_progress`, `shippr_guide_collapsed`).

### 11.2 Component Specification
**File**: `src/components/OperatorGuide.tsx` [NEW]

**Bugs fixed in the original code below — apply all of these when implementing**:
1. **Lint failure**: `setMounted(true)` / `setCompleted(...)` / `setCollapsed(...)` called synchronously in `useEffect` violate `react-hooks/set-state-in-effect` and fail `npm run lint`. Read `localStorage` through `useSyncExternalStore` (server snapshot = defaults, client snapshot = parsed storage, `subscribe` to the `storage` event plus a small in-module listener set that your setters notify), and drop the `mounted` state. This also avoids a hydration mismatch.
2. **Fake progress**: it pre-ticked "Triage" and "Inspect discrepancy" (`{ triage: true, mismatch: true }`) so judges see 2/5 done before doing anything. Default to `{}`; additionally mark a step done automatically when the user visits its route (use `usePathname()`; match `/`, `/emails/email_004`, `/review`, `/metrics`), keeping the manual toggle.
3. **Dead step**: "Download discrepancy audit report (CSV)" points at a feature that does not exist (CSV export is out of scope, Section 9). Replace it with `{ id: "process", label: "Reprocess an email and watch it update", href: "/process" }`.
4. **Accessibility**: a `<li onClick>` containing a nested `<button>` is not keyboard reachable. Render each row as a `next/link` `<Link href>` with the check toggle as a sibling `<button type="button" aria-pressed>`, not nested inside the link. Add `aria-expanded` to the collapse control.
5. **Overlap**: the 320 px card sits over the bottom-right of every page (including the email-detail drawer). Default `collapsed` to `true` on first visit (pill only); the expanded card must have `max-h-[70vh] overflow-y-auto`.
6. `email_004` is a real, deterministic mismatch in our output (consignee + notify party), so the deep link is valid — keep it.

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ChecklistItem {
  id: string;
  label: string;
  href: string;
}

const ITEMS: ChecklistItem[] = [
  { id: "triage", label: "Triage 520 inbox emails", href: "/" },
  { id: "mismatch", label: "Inspect discrepancy on email_004 (SI ≠ BL)", href: "/emails/email_004" },
  { id: "review", label: "Verify AI vision scan in Review Queue", href: "/review" },
  { id: "map", label: "Inspect global shipping lanes on Metrics Map", href: "/metrics" },
  { id: "export", label: "Download discrepancy audit report (CSV)", href: "/" },
];

export function OperatorGuide() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [completed, setCompleted] = useState<Record<string, boolean>>({ triage: true, mismatch: true });

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("shippr_guide_progress");
      if (saved) setCompleted(JSON.parse(saved));
      const isCol = localStorage.getItem("shippr_guide_collapsed");
      if (isCol) setCollapsed(JSON.parse(isCol));
    } catch {
      /* ignore storage error */
    }
  }, []);

  if (!mounted) return null;

  const toggle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = { ...completed, [id]: !completed[id] };
    setCompleted(next);
    try {
      localStorage.setItem("shippr_guide_progress", JSON.stringify(next));
    } catch {}
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("shippr_guide_collapsed", JSON.stringify(next));
    } catch {}
  };

  const count = Object.values(completed).filter(Boolean).length;
  const pct = Math.round((count / ITEMS.length) * 100);

  if (collapsed) {
    return (
      <button
        onClick={toggleCollapsed}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground shadow-xl hover:bg-muted transition-all"
      >
        <span>📋 Operator Guide</span>
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-primary">{count}/{ITEMS.length}</span>
      </button>
    );
  }

  return (
    <aside
      aria-label="Operator Quickstart Guide"
      className="fixed bottom-6 right-6 z-40 w-80 rounded-2xl border border-border bg-card p-4 shadow-2xl transition-all"
    >
      <header className="flex items-start justify-between gap-2 border-b border-border pb-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Getting started checklist</h2>
          <p className="text-xs text-muted-foreground">Averis verification workflow guide</p>
        </div>
        <button
          onClick={toggleCollapsed}
          aria-label="Collapse checklist"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </header>

      <ul className="mt-3 space-y-2 text-xs">
        {ITEMS.map((item) => {
          const done = !!completed[item.id];
          return (
            <li
              key={item.id}
              onClick={() => router.push(item.href)}
              className="flex items-center justify-between gap-2 rounded-lg p-2 hover:bg-muted/50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={(e) => toggle(item.id, e)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  {done ? (
                    <svg className="h-4 w-4 text-ok fill-ok/20" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <span className="block h-4 w-4 rounded-full border border-dashed border-muted-foreground" />
                  )}
                </button>
                <span className={`truncate ${done ? "line-through text-muted-foreground" : "text-foreground font-medium"}`}>
                  {item.label}
                </span>
              </div>
              <span className="text-muted-foreground">→</span>
            </li>
          );
        })}
      </ul>

      <footer className="mt-4 border-t border-border pt-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>{count} of {ITEMS.length} complete</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </footer>
    </aside>
  );
}
```

---

## Section 7 — File-by-File Change Summary

### Files to MODIFY:
- Section 0 repairs: `src/components/ui.tsx` (colour tokens only), `FieldTable.tsx` / `ReviewPanel.tsx` / `Nav.tsx` / `src/app/process/page.tsx` (`text-muted` → `text-muted-foreground`, accent fixes), `src/app/globals.css` (append-only: keyframes, reduced-motion, focus ring)
- `src/app/layout.tsx` — dark class, metadata, sidebar layout, TooltipProvider, mount OperatorGuide
- `src/app/page.tsx` — full inbox redesign (table + KPI cards + filters)
- `src/app/emails/[id]/page.tsx` — split panel layout + ReviewActivityDrawer
- `src/app/review/page.tsx` — queue card restyle + group header restyle
- `src/app/metrics/page.tsx` — full route intelligence & map console redesign

### Files to CREATE:
- `src/components/AppSidebar.tsx` — the new left sidebar
- `src/components/ShipprLogo.tsx` — the SVG ship logo
- `src/components/ReviewActivityDrawer.tsx` — right drawer for email detail
- `src/lib/ports.ts` — coordinate normalization lookup table for ports
- `src/components/ShippingRouteMap.tsx` — interactive dotted world map + arc visualizer
- `src/components/OperatorGuide.tsx` — floating quickstart guide for judges & operators

### Files to LEAVE COMPLETELY UNCHANGED:
- `src/app/globals.css` — theme already applied; only the append-only additions from Section 0.3
- `src/components/ui.tsx` — keep all existing custom components (only the Section 0 token fixes)
- `src/components/FieldTable.tsx`, `src/components/ReviewPanel.tsx` — logic and layout unchanged (only the Section 0 class swaps)
- `src/components/Nav.tsx` — leave in place, just unused (apply the `text-muted` swap only so it is not stale)
- `src/lib/api.ts` — unchanged
- `src/lib/useApi.ts` — unchanged
- `src/app/process/` — unchanged
- All backend files (`api/`, `sdoc/`, `scripts/`, `tests/`, `supabase/`)

---

## Section 8 — Quality Checks

After all sections are implemented:

1. `npm run build` — must pass with zero errors; `npm run lint` must also pass (CI runs it), and `pytest -q` must be untouched
2. `npx tsc --noEmit` — must pass with zero type errors
2a. Body text, `text-muted-foreground` labels, chart bars and `buttonPrimary` are all clearly visible in dark mode (Section 0 regression check); navigating from a scrolled inbox to an email opens at the top
2b. `/metrics` map: Singapore, Rotterdam, Callao, Houston sit on the correct coastlines, and stay aligned when the window is resized
3. `/` — sidebar visible, dark theme, KPI tiles, email table with proper columns
4. `/emails/email_001` — split panel, right drawer shows "No review activity" or existing reviews
5. `/emails/email_004` — mismatch rows highlighted in the SI vs BL field table
6. `/review` — cards in single column, reason badges, group dividers with Separator
7. `/metrics` — route intelligence map renders with glowing port nodes and colored arcs, lane list on the right, validation cards below
8. Floating Operator Guide appears at bottom-right, collapses into a pill button, expands cleanly, and clicking items navigates to the target page
9. No horizontal scrollbar at 1440px viewport width
10. Breadcrumb navigation on email detail page works correctly

---

## Section 9 — Out of Scope (Do NOT implement)

- Gmail / IMAP email ingestion (to be implemented in a dedicated backend step)
- Manual file upload from the frontend (to be implemented in a dedicated step)
- CSV or JSON export functionality (to be implemented in a dedicated step)
- Dark/light mode toggle UI
- Mobile responsive sidebar collapse
- Animations beyond CSS `transition-colors`
- Any new API endpoints or backend changes
