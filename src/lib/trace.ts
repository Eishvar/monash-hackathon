import type { TraceStep } from "@/lib/api";

export const STAGE_LABEL: Record<string, string> = {
  classify: "Classify",
  parse: "Parse documents",
  extract_llm: "AI field extraction",
  vision: "Vision read (scans)",
  compare_decide: "Compare + decide",
  adjudicate: "Adjudicate mismatches",
  explain: "Explain",
};

export const METHOD_LABEL: Record<string, string> = { rule: "rule", llm: "AI", code: "code" };

export const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

/** One stepper chip: `Parse SI · rule · 7/7 fields`. */
export function traceChip(s: TraceStep): { label: string; parts: string[]; ai: boolean } {
  const label = s.stage === "parse" && s.role ? `Parse ${s.role}` : (STAGE_LABEL[s.stage] ?? s.stage);
  const parts = [METHOD_LABEL[s.method] ?? s.method];
  if (s.stage === "parse" && s.fields_found !== undefined) parts.push(s.unreadable ? "unreadable" : `${s.fields_found}/7 fields`);
  else if (s.method === "llm" && s.cache_hits && !s.llm_calls) parts.push("cached");
  else if (s.method !== "code") parts.push(fmtMs(s.ms));
  if (s.stage === "classify" && s.category) parts.push(s.category.replaceAll("_", " ").toLowerCase());
  if (s.stage === "adjudicate" && s.cleared !== undefined) parts.push(`${s.cleared} cleared`);
  return { label, parts, ai: s.method === "llm" };
}
