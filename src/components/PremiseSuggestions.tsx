"use client";

import { useEffect, useMemo, useState } from "react";
import { Pill } from "@/components/ui";
import { ResolutionDiagram } from "@/components/ResolutionDiagram";
import {
  recommendStatements,
  type RecommendationSet,
  type StatementSuggestion,
} from "@/lib/recommend";
import type { Hole } from "@/lib/logic/reverseResolution";

// A premise ready to drop into the builder: the resolved text + formula, with no
// placeholders left unless the author chose to leave them.
export type FilledPremise = { text: string; formalization: string; linkedId: string | null };

// The reverse-resolution premise recommender's panel. Given the conclusion's
// formula, it lists verified premise sets that entail it. Each card can be
// expanded to name its placeholder(s) once — the name flows into every premise's
// text and formula at once — with reuse hints for existing statements and a
// preview of the resolution proof the set unlocks.
export function PremiseSuggestions({
  sets,
  loading,
  formula,
  onUse,
}: {
  sets: RecommendationSet[];
  loading: boolean;
  formula: string;
  onUse: (premises: FilledPremise[]) => void;
}) {
  if (!formula.trim()) return null;

  return (
    <div className="mt-3 rounded-lg border border-line bg-[var(--bg)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">Suggested premises</span>
        {loading && <span className="text-xs text-muted">Deriving…</span>}
      </div>

      {!loading && sets.length === 0 ? (
        <p className="text-xs text-muted">
          No premise patterns matched. Check the conclusion parses as a formula
          (operators <code className="font-mono">~ &amp; | -&gt; &lt;-&gt;</code>; predicates like{" "}
          <code className="font-mono">Mortal(x)</code>).
        </p>
      ) : (
        <ul className="space-y-2">
          {sets.map((s, i) => (
            <SuggestionCard key={`${s.schemeId}-${i}`} set={s} onUse={onUse} />
          ))}
        </ul>
      )}
    </div>
  );
}

// Turn a free-text placeholder name into a formula identifier: "a man" → "AMan".
function toIdentifier(name: string): string | null {
  const parts = name.trim().split(/[^A-Za-z0-9_]+/).filter(Boolean);
  if (!parts.length) return null;
  let id = parts.map((p) => p[0].toUpperCase() + p.slice(1)).join("");
  if (/^[0-9]/.test(id)) id = `_${id}`;
  return id;
}

// Distinct holes across a set's premises (each usually appears in two premises).
function setHoles(set: RecommendationSet): Hole[] {
  const seen = new Map<string, Hole>();
  for (const p of set.premises) for (const h of p.holes) if (!seen.has(h.id)) seen.set(h.id, h);
  return [...seen.values()];
}

function SuggestionCard({
  set,
  onUse,
}: {
  set: RecommendationSet;
  onUse: (premises: FilledPremise[]) => void;
}) {
  const holes = useMemo(() => setHoles(set), [set]);
  const [filling, setFilling] = useState(false);
  const [showProof, setShowProof] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [reuse, setReuse] = useState<Record<number, StatementSuggestion[]>>({});

  // Substitute the named holes into a formula (word-boundary symbol swap) and
  // into an NL template ({hole} → the typed name). Unnamed holes stay schematic.
  const symbolFor = (h: Hole) => toIdentifier(names[h.id] ?? "") ?? h.id;
  const wordFor = (h: Hole) => names[h.id]?.trim() || `{${h.placeholder}}`;

  const subFormula = (f: string) =>
    holes.reduce((acc, h) => acc.replace(new RegExp(`\\b${h.id}\\b`, "g"), symbolFor(h)), f);
  const subText = (t: string) =>
    holes.reduce((acc, h) => acc.replaceAll(`{${h.id}}`, wordFor(h)), t);

  // The premises as they stand (with any reuse override applied to the text).
  const preview: FilledPremise[] = set.premises.map((p, i) => ({
    text: overrides[i] ?? subText(p.nlTemplate),
    formalization: subFormula(p.formula),
    linkedId: null,
  }));

  // Reuse hints: once the holes are named, look for existing statements matching
  // each premise so the author can snap to a shared node instead of a new one.
  const allNamed = holes.every((h) => (names[h.id] ?? "").trim().length > 0);
  const previewKey = preview.map((p) => p.text).join("||");
  useEffect(() => {
    if (!filling || holes.length === 0 || !allNamed) {
      setReuse({});
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      const entries = await Promise.all(
        set.premises.map(async (p, i) => {
          if (p.holes.length === 0) return [i, []] as const;
          const text = overrides[i] ?? subText(p.nlTemplate);
          try {
            const r = await recommendStatements(text, { signal: controller.signal });
            // Only offer a different phrasing that isn't already what we have.
            return [i, r.filter((m) => m.canonicalText !== text).slice(0, 2)] as const;
          } catch {
            return [i, []] as const;
          }
        })
      );
      setReuse(Object.fromEntries(entries));
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
    // previewKey captures name/override edits that change the predicted text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filling, allNamed, previewKey]);

  const commit = () => onUse(preview);

  return (
    <li className="rounded-md border border-line bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium">{set.label}</span>
        <Pill tone="for">valid ✓</Pill>
        <button
          type="button"
          onClick={() => setShowProof((v) => !v)}
          className="text-xs text-accent hover:underline"
        >
          {showProof ? "hide proof" : "preview proof"}
        </button>
        {holes.length === 0 ? (
          <button
            type="button"
            onClick={commit}
            className="ml-auto rounded-md border border-line px-2 py-0.5 text-xs font-medium hover:border-accent"
          >
            Use these premises
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setFilling((v) => !v)}
            className="ml-auto rounded-md border border-line px-2 py-0.5 text-xs font-medium hover:border-accent"
          >
            {filling ? "Cancel" : "Use these premises"}
          </button>
        )}
      </div>

      {/* Premise list — live preview reflecting the current hole names. */}
      <ol className="space-y-1.5">
        {preview.map((p, j) => (
          <li key={j} className="flex gap-2">
            <span className="mt-0.5 text-xs text-muted">P{j + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm leading-snug">{p.text}</div>
              <div className="font-mono text-xs text-muted">{p.formalization}</div>
              {filling &&
                (reuse[j] ?? []).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setOverrides((o) => ({ ...o, [j]: m.canonicalText }))}
                    className="mt-0.5 block text-left text-xs text-accent hover:underline"
                  >
                    ↩ reuse “{m.canonicalText}” ({Math.round(m.score * 100)}%)
                  </button>
                ))}
            </div>
          </li>
        ))}
      </ol>

      {/* Fill step: name each placeholder once; it flows everywhere above. */}
      {filling && holes.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {holes.map((h) => (
            <div key={h.id} className="flex items-center gap-2">
              <label className="w-28 shrink-0 text-xs text-muted">
                Name <span className="font-mono">{`{${h.placeholder}}`}</span>
              </label>
              <input
                value={names[h.id] ?? ""}
                onChange={(e) => setNames((n) => ({ ...n, [h.id]: e.target.value }))}
                placeholder={h.role === "pred" ? "e.g. man" : "e.g. it rained"}
                className="flex-1 rounded-md border border-line px-2 py-1 text-sm"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={commit}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white"
          >
            Add to argument
          </button>
        </div>
      )}

      {showProof && (
        <div className="mt-3">
          <ResolutionDiagram proof={set.proofNodes} />
        </div>
      )}
    </li>
  );
}
