"use client";

import { useEffect, useState } from "react";
import { mergeStatementAction } from "@/lib/actions";

type Match = { id: string; canonicalText: string; score: number; topics: string[] };

export function MergePicker({ dupId, dupText }: { dupId: string; dupText: string }) {
  // Seed the search with the duplicate's own text so likely canonicals appear immediately.
  const [query, setQuery] = useState(dupText);
  const [matches, setMatches] = useState<Match[]>([]);
  const [chosen, setChosen] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setMatches([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/statements/search?q=${encodeURIComponent(q)}&exclude=${dupId}`);
        const data = await r.json();
        setMatches(data.results ?? []);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, dupId]);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Search for the canonical statement</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-line px-3 py-2"
          placeholder="Type to find the statement to keep…"
        />
        <p className="mt-1 text-xs text-muted">{loading ? "Searching…" : `${matches.length} candidate(s)`}</p>
      </div>

      <ul className="space-y-2">
        {matches.map((m) => (
          <li key={m.id}>
            <label
              className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-lg border p-3 text-sm ${
                chosen === m.id ? "border-accent bg-[var(--accent-soft)]" : "border-line"
              }`}
            >
              <span className="flex items-baseline gap-2">
                <input
                  type="radio"
                  name="pick"
                  checked={chosen === m.id}
                  onChange={() => setChosen(m.id)}
                />
                {m.canonicalText}
              </span>
              <span className="shrink-0 tabular-nums text-xs text-muted">
                {Math.round(m.score * 100)}% match
              </span>
            </label>
          </li>
        ))}
        {query.trim().length >= 3 && !loading && matches.length === 0 && (
          <li className="text-sm text-muted">No candidates — refine the search.</li>
        )}
      </ul>

      <form action={mergeStatementAction}>
        <input type="hidden" name="dupId" value={dupId} />
        <input type="hidden" name="canonicalId" value={chosen} />
        <button
          disabled={!chosen}
          className="rounded-md bg-accent px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          Merge this statement into the selected one
        </button>
      </form>
      <p className="text-xs text-muted">
        All arguments, citations, votes, and experience reports will move to the canonical statement.
        This phrasing is kept as an alternate surface form. The action cannot be undone in this
        prototype.
      </p>
    </div>
  );
}
