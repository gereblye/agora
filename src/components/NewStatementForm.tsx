"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createStatement } from "@/lib/actions";
import { DUPLICATE_STRONG } from "@/lib/similarity";

type Match = { id: string; canonicalText: string; score: number; topics: string[] };

export function NewStatementForm({
  topics,
  levels,
}: {
  topics: { id: string; name: string }[];
  levels: [string, string][];
}) {
  const [text, setText] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 3) {
      setMatches([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/statements/search?q=${encodeURIComponent(q)}`);
        const data = await r.json();
        setMatches(data.results ?? []);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [text]);

  const strong = matches.filter((m) => m.score >= DUPLICATE_STRONG);

  return (
    <form action={createStatement} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Statement</label>
        <textarea
          name="canonicalText"
          required
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. The ground is wet."
          className="w-full rounded-md border border-line px-3 py-2"
        />
        <p className="mt-1 text-xs text-muted">
          {loading ? "Searching for existing statements…" : "Search first — the same claim should be one shared node."}
        </p>
      </div>

      {matches.length > 0 && (
        <div
          className={`rounded-lg border p-3 ${
            strong.length
              ? "border-[var(--against)] bg-[var(--accent-soft)]"
              : "border-line bg-[var(--bg)]"
          }`}
        >
          <p className="mb-2 text-sm font-medium">
            {strong.length
              ? "⚠ This may already exist — consider using one of these instead:"
              : "Related statements that already exist:"}
          </p>
          <ul className="space-y-1.5">
            {matches.map((m) => (
              <li key={m.id} className="flex items-baseline justify-between gap-3 text-sm">
                <Link href={`/statements/${m.id}`} className="underline hover:text-accent" target="_blank">
                  {m.canonicalText}
                </Link>
                <span className="shrink-0 tabular-nums text-xs text-muted">
                  {Math.round(m.score * 100)}% match
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Topic</label>
          <select name="topicId" className="w-full rounded-md border border-line px-3 py-2">
            <option value="">— none —</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Level</label>
          <select name="level" className="w-full rounded-md border border-line px-3 py-2">
            {levels.map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Formalization <span className="text-muted">(optional, propositional)</span>
        </label>
        <input
          name="formalization"
          placeholder="e.g. rain -> wet   (operators: ~ & | -> <->)"
          className="w-full rounded-md border border-line px-3 py-2 font-mono text-sm"
        />
      </div>

      <button className="rounded-md bg-accent px-4 py-2 font-medium text-white">
        Create statement anyway
      </button>
    </form>
  );
}
