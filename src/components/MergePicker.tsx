"use client";

import { useEffect, useState } from "react";
import { mergeStatementAction } from "@/lib/actions";
import { schemeLabel } from "@/lib/constants";

type Match = { id: string; canonicalText: string; score: number; topics: string[] };

type LinkedArg = {
  id: string;
  scheme: string;
  inferenceType: string;
  conclusionText: string;
  premiseTexts: string[];
};

type ArgBundle = { concludes: LinkedArg[]; premiseIn: LinkedArg[] };

const EMPTY_BUNDLE: ArgBundle = { concludes: [], premiseIn: [] };

async function fetchLinkedArgs(id: string): Promise<ArgBundle> {
  const r = await fetch(`/api/statements/arguments?id=${encodeURIComponent(id)}`);
  if (!r.ok) return EMPTY_BUNDLE;
  const data = await r.json();
  return { concludes: data.concludes ?? [], premiseIn: data.premiseIn ?? [] };
}

export function MergePicker({ dupId, dupText }: { dupId: string; dupText: string }) {
  // Seed the search with the duplicate's own text so likely canonicals appear immediately.
  const [query, setQuery] = useState(dupText);
  const [matches, setMatches] = useState<Match[]>([]);
  const [chosen, setChosen] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // The "arena": arguments on each side, and the set the user has marked to discard.
  const [dupArgs, setDupArgs] = useState<ArgBundle>(EMPTY_BUNDLE);
  const [canonArgs, setCanonArgs] = useState<ArgBundle>(EMPTY_BUNDLE);
  const [argsLoading, setArgsLoading] = useState(false);
  const [discarded, setDiscarded] = useState<Set<string>>(new Set());

  const chosenMatch = matches.find((m) => m.id === chosen) ?? null;

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

  // Load both sides' arguments once a canonical is chosen. The duplicate's side
  // is fetched here too (rather than passed from the server) so a re-pick always
  // reflects the live graph.
  useEffect(() => {
    if (!chosen) {
      setDupArgs(EMPTY_BUNDLE);
      setCanonArgs(EMPTY_BUNDLE);
      setDiscarded(new Set());
      return;
    }
    let cancelled = false;
    setArgsLoading(true);
    Promise.all([fetchLinkedArgs(dupId), fetchLinkedArgs(chosen)])
      .then(([dup, canon]) => {
        if (cancelled) return;
        setDupArgs(dup);
        setCanonArgs(canon);
        setDiscarded(new Set()); // every argument starts as "keep"
      })
      .finally(() => {
        if (!cancelled) setArgsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chosen, dupId]);

  const toggle = (argId: string) =>
    setDiscarded((prev) => {
      const next = new Set(prev);
      if (next.has(argId)) next.delete(argId);
      else next.add(argId);
      return next;
    });

  const totalArgs =
    dupArgs.concludes.length +
    dupArgs.premiseIn.length +
    canonArgs.concludes.length +
    canonArgs.premiseIn.length;

  return (
    <div className="space-y-5">
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

      {/* Arena: the two statements face off, each with its linked arguments. */}
      {chosen && (
        <div className="space-y-3 rounded-xl border border-line bg-[var(--bg)] p-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Arena — keep or discard each argument</h3>
            {totalArgs > 0 && (
              <span className="text-xs text-muted">
                {discarded.size} of {totalArgs} marked to discard
              </span>
            )}
          </div>

          {argsLoading ? (
            <p className="text-sm text-muted">Loading arguments…</p>
          ) : totalArgs === 0 ? (
            <p className="text-sm text-muted">
              Neither statement has any linked arguments — nothing to keep or discard.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <ArgColumn
                heading="Duplicate (folded in)"
                statementText={dupText}
                bundle={dupArgs}
                discarded={discarded}
                onToggle={toggle}
              />
              <ArgColumn
                heading="Canonical (kept)"
                statementText={chosenMatch?.canonicalText ?? ""}
                bundle={canonArgs}
                discarded={discarded}
                onToggle={toggle}
              />
            </div>
          )}
        </div>
      )}

      <form action={mergeStatementAction}>
        <input type="hidden" name="dupId" value={dupId} />
        <input type="hidden" name="canonicalId" value={chosen} />
        {[...discarded].map((argId) => (
          <input key={argId} type="hidden" name="discardArgumentIds" value={argId} />
        ))}
        <button
          disabled={!chosen}
          className="rounded-md bg-accent px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          Merge this statement into the selected one
          {discarded.size > 0 ? ` · discard ${discarded.size} argument(s)` : ""}
        </button>
      </form>
      <p className="text-xs text-muted">
        All citations, votes, and experience reports move to the canonical statement, and this
        phrasing is kept as an alternate surface form. Arguments you keep move too; arguments you
        discard are deprecated (hidden from the graph, but recoverable). This cannot be undone in
        this prototype.
      </p>
    </div>
  );
}

function ArgColumn({
  heading,
  statementText,
  bundle,
  discarded,
  onToggle,
}: {
  heading: string;
  statementText: string;
  bundle: ArgBundle;
  discarded: Set<string>;
  onToggle: (argId: string) => void;
}) {
  const rows: { role: "concludes" | "premise"; arg: LinkedArg }[] = [
    ...bundle.concludes.map((arg) => ({ role: "concludes" as const, arg })),
    ...bundle.premiseIn.map((arg) => ({ role: "premise" as const, arg })),
  ];

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{heading}</p>
      <p className="mt-0.5 mb-3 text-sm font-medium leading-snug">{statementText}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">No linked arguments.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ role, arg }) => {
            const isDiscarded = discarded.has(arg.id);
            return (
              <li key={`${role}-${arg.id}`}>
                <label
                  className={`flex cursor-pointer gap-2 rounded-md border p-2 text-xs transition-colors ${
                    isDiscarded
                      ? "border-dashed border-line bg-transparent opacity-55"
                      : "border-line bg-[var(--bg)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={!isDiscarded}
                    onChange={() => onToggle(arg.id)}
                  />
                  <span className={isDiscarded ? "line-through" : ""}>
                    <span className="mr-1 font-semibold text-accent">
                      {role === "concludes" ? "∴" : "premise →"}
                    </span>
                    {role === "concludes" ? (
                      <span>
                        {arg.premiseTexts.length > 0 && (
                          <span className="text-muted">{arg.premiseTexts.join("; ")} ⇒ </span>
                        )}
                        {arg.conclusionText}
                      </span>
                    ) : (
                      <span>
                        used to conclude <span className="text-muted">{arg.conclusionText}</span>
                      </span>
                    )}
                    <span className="ml-1 text-[10px] text-muted">({schemeLabel(arg.scheme)})</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
