"use client";

import { useEffect, useRef, useState } from "react";
import { createArgument } from "@/lib/actions";
import { Pill } from "@/components/ui";
import {
  recommendStatements,
  recommendPremises,
  suggestFormalization,
  type StatementSuggestion,
  type RecommendationSet,
} from "@/lib/recommend";
import { DUPLICATE_STRONG } from "@/lib/similarity";
import { PremiseSuggestions, type FilledPremise } from "@/components/PremiseSuggestions";

type Field = {
  key: string;
  text: string;
  formalization: string; // optional logical form (unlocks the resolution proof)
  linkedId: string | null; // set when the user picks an existing statement
};

let fieldSeq = 0;
const newField = (text = "", formalization = ""): Field => ({
  key: `f${fieldSeq++}`,
  text,
  formalization,
  linkedId: null,
});

export function ArgumentBuilder({
  initialConclusion,
}: {
  initialConclusion?: { id: string; text: string; formalization?: string | null };
}) {
  const [conclusion, setConclusion] = useState<Field>(() =>
    initialConclusion
      ? {
          key: `f${fieldSeq++}`,
          text: initialConclusion.text,
          formalization: initialConclusion.formalization ?? "",
          linkedId: initialConclusion.id,
        }
      : newField()
  );
  const [premises, setPremises] = useState<Field[]>(() => [newField()]);

  // Conclusion formalization drives the reverse-resolution premise recommender.
  // A conclusion arriving from an already-formalized statement seeds it.
  const [conclusionFormalization, setConclusionFormalization] = useState(
    () => initialConclusion?.formalization ?? ""
  );
  const [showFormalize, setShowFormalize] = useState(
    () => Boolean(initialConclusion?.formalization)
  );
  const [recSets, setRecSets] = useState<RecommendationSet[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  // NL→formula authoring aid: fills the formalization field from the conclusion's
  // plain-English text (Claude, or an offline heuristic), for the author to edit.
  const [suggesting, setSuggesting] = useState(false);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);

  const suggestForm = async () => {
    const text = conclusion.text.trim();
    if (!text || suggesting) return;
    setSuggesting(true);
    setSuggestNote(null);
    try {
      const s = await suggestFormalization(text);
      if (s) {
        setConclusionFormalization(s.formula);
        setShowFormalize(true);
        setSuggestNote(
          s.source === "llm"
            ? "Suggested by Claude — review and edit before it drives the proof."
            : "Suggested from sentence patterns — review and edit."
        );
      } else {
        setShowFormalize(true);
        setSuggestNote("Couldn't auto-formalize this one — write a formula below.");
      }
    } catch {
      setSuggestNote("Suggestion failed — write a formula below.");
    } finally {
      setSuggesting(false);
    }
  };

  // Debounced fetch of premise suggestions as the formalization is edited.
  useEffect(() => {
    const f = conclusionFormalization.trim();
    if (!f) {
      setRecSets([]);
      return;
    }
    const controller = new AbortController();
    setRecLoading(true);
    const t = setTimeout(async () => {
      try {
        const sets = await recommendPremises(f, conclusion.text, { signal: controller.signal });
        setRecSets(sets);
      } catch {
        /* aborted or failed — leave prior suggestions */
      } finally {
        setRecLoading(false);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [conclusionFormalization, conclusion.text]);

  const hasConclusion = conclusion.text.trim().length > 0;
  const filledPremises = premises.filter((p) => p.text.trim().length > 0);
  const canSubmit = hasConclusion && filledPremises.length > 0;

  const addPremise = () => setPremises((ps) => [...ps, newField()]);
  const removePremise = (key: string) =>
    setPremises((ps) => (ps.length > 1 ? ps.filter((p) => p.key !== key) : ps));
  const updatePremise = (key: string, next: Field) =>
    setPremises((ps) => ps.map((p) => (p.key === key ? next : p)));

  // Adopt a recommended set's premises (already resolved in the suggestion card:
  // placeholders named, formulas substituted, reuse applied) into the builder.
  const useFilled = (prems: FilledPremise[]) =>
    setPremises(
      prems.map((p) => ({
        key: `f${fieldSeq++}`,
        text: p.text,
        formalization: p.formalization,
        linkedId: p.linkedId,
      }))
    );

  return (
    <form action={createArgument} className="space-y-6">
      <section>
        <label className="mb-1 block text-sm font-medium">Conclusion</label>
        <FieldEditor
          field={conclusion}
          onChange={setConclusion}
          placeholder="e.g. The ground is wet."
          nameId="conclusionId"
          nameText="conclusionText"
        />

        {/* Formalize → drives the reverse-resolution premise recommender. The
            author can write a formula or have one suggested from the plain-
            English conclusion (docs/PLAN.md §9), then review/edit it. */}
        {showFormalize || conclusionFormalization ? (
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-xs font-medium text-muted">
                Conclusion formalization
              </label>
              <button
                type="button"
                onClick={suggestForm}
                disabled={!hasConclusion || suggesting}
                className="text-xs font-medium text-accent hover:underline disabled:opacity-40"
              >
                {suggesting ? "Suggesting…" : "✨ Suggest from sentence"}
              </button>
            </div>
            <input
              value={conclusionFormalization}
              onChange={(e) => {
                setConclusionFormalization(e.target.value);
                setSuggestNote(null);
              }}
              placeholder="e.g. Mortal(socrates)   or   rain -> wet"
              className="w-full rounded-md border border-line px-3 py-2 font-mono text-sm"
            />
            {suggestNote && <p className="mt-1 text-xs text-muted">{suggestNote}</p>}
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={suggestForm}
              disabled={!hasConclusion || suggesting}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium hover:border-accent disabled:opacity-40"
            >
              {suggesting ? "Suggesting…" : "✨ Suggest a formalization"}
            </button>
            <button
              type="button"
              onClick={() => setShowFormalize(true)}
              className="text-xs font-medium text-accent hover:underline"
            >
              + write one myself
            </button>
            {!hasConclusion && (
              <span className="text-xs text-muted">Write the conclusion first.</span>
            )}
            {suggestNote && <span className="text-xs text-muted">{suggestNote}</span>}
          </div>
        )}

        {/* Carried for the server action (Phase C persists it on the statement). */}
        <input type="hidden" name="conclusionFormalization" value={conclusionFormalization} />

        <PremiseSuggestions
          sets={recSets}
          loading={recLoading}
          formula={conclusionFormalization}
          onUse={useFilled}
        />
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-sm font-medium">Premises</label>
          <span className="text-xs text-muted">
            {filledPremises.length} premise{filledPremises.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="space-y-3">
          {premises.map((p, i) => (
            <div key={p.key} className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-right text-sm tabular-nums text-muted">
                {i + 1}.
              </span>
              <div className="flex-1">
                <FieldEditor
                  field={p}
                  onChange={(next) => updatePremise(p.key, next)}
                  placeholder="State a premise…"
                  nameId="premiseIds"
                  nameText="premiseTexts"
                  nameForm="premiseForms"
                />
              </div>
              <button
                type="button"
                onClick={() => removePremise(p.key)}
                disabled={premises.length === 1}
                aria-label="Remove premise"
                className="mt-1 rounded-md px-2 py-1 text-muted hover:text-[var(--against)] disabled:opacity-30"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addPremise}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:border-accent"
        >
          <span className="text-base leading-none">+</span> Add premise
        </button>
      </section>

      {/* Deductive-only builder: inference type and scheme are both fixed. */}
      <input type="hidden" name="inferenceType" value="deductive" />
      <input type="hidden" name="scheme" value="deductive" />

      <button
        disabled={!canSubmit}
        className="rounded-md bg-accent px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        Create argument
      </button>
    </form>
  );
}

// A single free-text claim field with search-before-create suggestions. Emits
// a hidden input carrying either the linked statement id or the raw text, so
// the createArgument server action can find-or-create behind the scenes.
function FieldEditor({
  field,
  onChange,
  placeholder,
  nameId,
  nameText,
  nameForm,
}: {
  field: Field;
  onChange: (next: Field) => void;
  placeholder: string;
  nameId: string;
  nameText: string;
  nameForm?: string; // when set, the field also carries an optional formalization
}) {
  const [suggestions, setSuggestions] = useState<StatementSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Once linked to an existing statement, stop suggesting.
    if (field.linkedId) {
      setSuggestions([]);
      return;
    }
    const q = field.text.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const results = await recommendStatements(q, { signal: controller.signal });
        setSuggestions(results);
        setOpen(true);
      } catch {
        /* aborted or failed — leave prior suggestions */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [field.text, field.linkedId]);

  const pick = (s: StatementSuggestion) => {
    onChange({ ...field, text: s.canonicalText, linkedId: s.id });
    setOpen(false);
  };

  return (
    <div className="relative">
      {/* Hidden inputs the server action reads (linked id wins over text). Both
          are always emitted so premise rows stay index-aligned on the server. */}
      <input type="hidden" name={nameId} value={field.linkedId ?? ""} />
      <input type="hidden" name={nameText} value={field.text} />

      <textarea
        rows={2}
        value={field.text}
        placeholder={placeholder}
        onChange={(e) =>
          // Editing after a link breaks the link — the text is authoritative again.
          onChange({ ...field, text: e.target.value, linkedId: null })
        }
        onFocus={() => setOpen(true)}
        className="w-full rounded-md border border-line px-3 py-2"
      />

      {nameForm && (
        <input
          name={nameForm}
          value={field.formalization}
          onChange={(e) => onChange({ ...field, formalization: e.target.value })}
          placeholder="formalization (optional) — e.g. Man(socrates)"
          className="mt-1 w-full rounded-md border border-line px-3 py-1.5 font-mono text-xs"
        />
      )}

      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
        {field.linkedId ? (
          <Pill tone="accent">linked to existing statement</Pill>
        ) : loading ? (
          <span>Searching existing statements…</span>
        ) : (
          <span>Type a claim — reuse an existing statement if one matches.</span>
        )}
      </div>

      <SuggestionSlot
        open={open && !field.linkedId && suggestions.length > 0}
        suggestions={suggestions}
        onPick={pick}
        onDismiss={() => setOpen(false)}
      />
    </div>
  );
}

// The per-field suggestion region. Today it renders similarity matches; this is
// the seam where LLM-driven ghost-text / Tab-accept completions will render
// later (docs/PLAN.md — LLM recommender), without changing the field layout.
function SuggestionSlot({
  open,
  suggestions,
  onPick,
  onDismiss,
}: {
  open: boolean;
  suggestions: StatementSuggestion[];
  onPick: (s: StatementSuggestion) => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onDismiss]);

  if (!open) return null;

  const strong = suggestions.some((s) => s.score >= DUPLICATE_STRONG);

  return (
    <div
      ref={ref}
      className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
    >
      <p className="border-b border-line px-3 py-1.5 text-xs text-muted">
        {strong ? "⚠ This may already exist — reuse one:" : "Existing statements:"}
      </p>
      <ul>
        {suggestions.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--accent-soft)]"
            >
              <span>{s.canonicalText}</span>
              <span className="shrink-0 tabular-nums text-xs text-muted">
                {Math.round(s.score * 100)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
