// Local statement-similarity for de-duplication (docs/PLAN.md §3.1).
//
// This is a dependency-free, deterministic near-duplicate detector suited to the
// short texts that statements are: a blend of token-set cosine (captures shared
// vocabulary) and character-trigram Jaccard (captures morphological variants like
// "reduces" vs "reducing"). In production this is the seam where pgvector +
// sentence embeddings would slot in (same interface: score two texts in [0,1]).

const STOPWORDS = new Set(
  "a an the is are was were be been being of to in on at for and or not no as by with that this these those it its do does did will would can could should".split(
    " "
  )
);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !STOPWORDS.has(t));
}

function tf(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  for (const [k, v] of a) dot += v * (b.get(k) ?? 0);
  const norm = (m: Map<string, number>) => Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0));
  return dot / (norm(a) * norm(b));
}

function trigrams(text: string): Set<string> {
  const s = " " + (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).join(" ") + " ";
  const out = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Similarity of two statement texts in [0,1]. */
export function similarity(x: string, y: string): number {
  const cos = cosine(tf(tokenize(x)), tf(tokenize(y)));
  const jac = jaccard(trigrams(x), trigrams(y));
  return 0.6 * cos + 0.4 * jac;
}

export type Ranked<T> = T & { score: number };

/** Rank candidates by similarity to `query`, keeping those above `threshold`. */
export function rankBySimilarity<T extends { canonicalText: string }>(
  query: string,
  candidates: T[],
  { limit = 6, threshold = 0.15 }: { limit?: number; threshold?: number } = {}
): Ranked<T>[] {
  return candidates
    .map((c) => ({ ...c, score: similarity(query, c.canonicalText) }))
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Bands used by the UI to decide how loudly to warn.
export const DUPLICATE_STRONG = 0.6; // likely the same claim
export const DUPLICATE_WEAK = 0.3; // related, worth a look
