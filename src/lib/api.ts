// Typed client for the FastAPI backend (`/api/py/*`, same origin; proxied to uvicorn in dev, rewritten by vercel.json in prod).

export const FIELDS = [
  "shipper",
  "consignee",
  "notify_party",
  "port_of_loading",
  "port_of_discharge",
  "container_count",
  "gross_weight_kg",
] as const;
export type FieldName = (typeof FIELDS)[number];

export const FIELD_LABEL: Record<FieldName, string> = {
  shipper: "Shipper",
  consignee: "Consignee",
  notify_party: "Notify party",
  port_of_loading: "Port of loading",
  port_of_discharge: "Port of discharge",
  container_count: "Container count",
  gross_weight_kg: "Gross weight (kg)",
};

export const CATEGORIES = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  BL_COMPARISON: "BL comparison",
  SI_REQUEST: "SI request",
  INVOICE_QUERY: "Invoice query",
  GENERAL: "General",
  SPAM: "Spam",
};

export const STATUSES = ["OK", "MISMATCH", "NEEDS_REVIEW", "ERROR"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = {
  OK: "OK",
  MISMATCH: "Mismatch",
  NEEDS_REVIEW: "Needs review",
  ERROR: "Error",
};

export const REASON_LABEL: Record<string, string> = {
  missing_attachment: "The SI or the draft BL is missing",
  unreadable: "A document is unreadable (corrupt file or scanned image)",
  wrong_doc_type: "An attachment is not the expected document type",
  missing_value: "A required value is blank in one of the documents",
};

export interface FieldRow {
  field: FieldName;
  si: string | null;
  bl: string | null;
  match: boolean;
  missing: boolean;
}

export interface ResultSummary {
  category: Category;
  status: Status;
  review_reason: string | null;
  has_defect: boolean;
  defect_fields: FieldName[];
  decided_by: "rule" | "llm";
  reviewed: boolean;
  processing_error: string | null;
}

export interface Result extends ResultSummary {
  email_id: string;
  fields: FieldRow[];
  provisional_fields: FieldRow[];
  explanation: string | null;
  notes: string[];
  run_id: string | null;
  updated_at: string;
}

export interface EmailRow {
  email_id: string;
  sender: string | null;
  subject: string | null;
  attachments: string[];
  result: ResultSummary | null;
}

export interface Email {
  email_id: string;
  sender: string | null;
  subject: string | null;
  body: string | null;
  attachments: string[];
}

export interface Review {
  id: number;
  action: "confirm" | "correct";
  note: string | null;
  created_at: string;
  before: { status: Status; review_reason: string | null } | null;
  after: { status: Status; review_reason: string | null } | null;
}

export interface EmailDetail {
  email: Email;
  result: Result | null;
  reviews: Review[];
}

export interface QueueItem {
  email_id: string;
  subject: string | null;
  sender: string | null;
  result: Result;
}

export interface Metrics {
  emails: number;
  categories: Record<string, number>;
  bl_comparison_status: Record<string, number>;
  review_reasons: Record<string, number>;
  defect_fields: Record<string, number>;
  decided_by: Record<string, number>;
  rule_share: number | null;
  llm_calls: number;
  llm_calls_by_task: Record<string, number>;
  cache_hits: number;
  tokens: { prompt: number; completion: number };
  estimated_cost_usd: number;
  total_emails: number;
  processed: number;
  unprocessed: number;
  errors: number;
  review_queue: number;
  reviewed: number;
  latest_run: { id: string; models: Record<string, string> | null; started_at: string } | null;
}

export interface BatchResponse {
  run_id: string;
  processed: string[];
  remaining: number;
  seconds: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/py${path}`, { ...init, headers: { "Content-Type": "application/json" } });
  } catch {
    throw new ApiError(0, "Cannot reach the backend. Check your connection and try again.");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, res.status === 503 ? `Backend is not configured: ${detail}` : detail);
  }
  return res.json() as Promise<T>;
}

export const apiGet = <T>(path: string) => request<T>(path);
export const apiPost = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export function describeReview(r: Pick<ResultSummary, "status" | "review_reason">): string {
  if (r.status === "ERROR") return "Processing failed — retry";
  if (r.status === "NEEDS_REVIEW" && r.review_reason) return REASON_LABEL[r.review_reason] ?? r.review_reason;
  return STATUS_LABEL[r.status];
}
