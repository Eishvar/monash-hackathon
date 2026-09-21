import type { Category } from "@/lib/api";
import { resolvePort } from "@/lib/ports";

// Shipping-line subjects are full of booking numbers, company names and codes. In lists we show a plain-English title
// (from the category the system decided, else from keywords) plus the destination when one can be read. The original
// subject is shown on the email's own page.
const TITLE: Record<Category, string> = {
  BL_COMPARISON: "Draft bill of lading check",
  SI_REQUEST: "Shipping instruction request",
  INVOICE_QUERY: "Invoice or charges question",
  GENERAL: "General message",
  SPAM: "Unwanted mail",
};

const KEYWORDS: [RegExp, string][] = [
  [/CONFIRM DOCS|DRAFT B\/?L|BL DRAFT|AMEND/, TITLE.BL_COMPARISON],
  [/\bSI\b|SHIPPING INSTRUCTION/, TITLE.SI_REQUEST],
  [/INVOICE|CHARGES|FREIGHT|PAYMENT/, TITLE.INVOICE_QUERY],
];

export function friendlySubject(subject: string | null | undefined, category?: Category | null): { title: string; detail: string | null } {
  const upper = (subject ?? "").toUpperCase();
  const title = (category ? TITLE[category] : KEYWORDS.find(([re]) => re.test(upper))?.[1]) ?? "Email";
  const port = resolvePort(subject);
  return { title, detail: port && category !== "SPAM" ? `To ${port.name}` : null };
}

/** `email_004` → `EML-004`; demo mail arrives as `New`, uploads as `Upload`. */
export function displayId(id: string): string {
  if (id.startsWith("000_sim_")) return "New";
  if (id.startsWith("000_up_")) return "Upload";
  const m = /^email_(\d+)$/.exec(id);
  return m ? `EML-${m[1]}` : id;
}
