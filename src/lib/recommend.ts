// Statement recommendation seam for the argument builder.
//
// This is the single entry point the argument builder uses to get suggestions
// for a premise/conclusion field. Today it wraps the local similarity search
// (same source as the search-before-create typeahead). Later, an LLM-driven
// recommender (Cursor-tab style) slots in behind this same interface — the UI
// never calls the search endpoint directly, so swapping the source needs no
// UI rework.

export type StatementSuggestion = {
  id: string;
  canonicalText: string;
  score: number;
  topics: string[];
};

import type { RecommendationSet } from "./logic/reverseResolution";
export type { RecommendationSet };

import type { FormalizationSuggestion } from "./logic/formalize";
export type { FormalizationSuggestion };

export type RecommendOptions = {
  signal?: AbortSignal;
  exclude?: string; // statement id to omit from results
};

// Fetches ranked existing statements similar to `query`. Returns [] for short
// queries (mirrors the API's own 3-char floor).
export async function recommendStatements(
  query: string,
  opts: RecommendOptions = {}
): Promise<StatementSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const params = new URLSearchParams({ q });
  if (opts.exclude) params.set("exclude", opts.exclude);

  const res = await fetch(`/api/statements/search?${params.toString()}`, {
    signal: opts.signal,
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results ?? []) as StatementSuggestion[];
}

// Reverse-resolution premise recommender: given a conclusion's formalization
// (and optional natural-language text), returns verified premise sets that
// deductively entail it. Like recommendStatements, the UI goes through this
// seam rather than hitting the route directly — the engine stays server-side
// (src/app/api/arguments/premises). Returns [] for an empty/unparseable formula.
export async function recommendPremises(
  formula: string,
  text?: string,
  opts: { signal?: AbortSignal } = {}
): Promise<RecommendationSet[]> {
  const f = formula.trim();
  if (!f) return [];

  const params = new URLSearchParams({ formula: f });
  if (text?.trim()) params.set("text", text.trim());

  const res = await fetch(`/api/arguments/premises?${params.toString()}`, {
    signal: opts.signal,
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.sets ?? []) as RecommendationSet[];
}

// Natural-language → candidate formula authoring aid (docs/PLAN.md §9). Posts the
// conclusion's plain-English text and gets back a parseable formula (from Claude,
// or an offline heuristic) to seed the formalization field — always reviewed and
// editable by the author. Returns null when nothing parseable could be produced.
// POST keeps the claim text out of the URL and the engine/key server-side.
export async function suggestFormalization(
  text: string,
  opts: { signal?: AbortSignal } = {}
): Promise<FormalizationSuggestion | null> {
  const t = text.trim();
  if (!t) return null;

  const res = await fetch("/api/formalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: t }),
    signal: opts.signal,
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.suggestion ?? null) as FormalizationSuggestion | null;
}
