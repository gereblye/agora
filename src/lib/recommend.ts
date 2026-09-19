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
