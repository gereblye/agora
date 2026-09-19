"use client";

import { useEffect, useRef, useState } from "react";
import { createArgument } from "@/lib/actions";
import { Pill } from "@/components/ui";
import { recommendStatements, type StatementSuggestion } from "@/lib/recommend";
import { DUPLICATE_STRONG } from "@/lib/similarity";

type Field = {
  key: string;
  text: string;
  linkedId: string | null; // set when the user picks an existing statement
};

let fieldSeq = 0;
const newField = (text = ""): Field => ({ key: `f${fieldSeq++}`, text, linkedId: null });

export function ArgumentBuilder({
  initialConclusion,
}: {
  initialConclusion?: { id: string; text: string };
}) {
  const [conclusion, setConclusion] = useState<Field>(() =>
    initialConclusion
      ? { key: `f${fieldSeq++}`, text: initialConclusion.text, linkedId: initialConclusion.id }
      : newField()
  );
  const [premises, setPremises] = useState<Field[]>(() => [newField()]);

  const hasConclusion = conclusion.text.trim().length > 0;
  const filledPremises = premises.filter((p) => p.text.trim().length > 0);
  const canSubmit = hasConclusion && filledPremises.length > 0;

  const addPremise = () => setPremises((ps) => [...ps, newField()]);
  const removePremise = (key: string) =>
    setPremises((ps) => (ps.length > 1 ? ps.filter((p) => p.key !== key) : ps));
  const updatePremise = (key: string, next: Field) =>
    setPremises((ps) => ps.map((p) => (p.key === key ? next : p)));

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
}: {
  field: Field;
  onChange: (next: Field) => void;
  placeholder: string;
  nameId: string;
  nameText: string;
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
      {/* Hidden inputs the server action reads (linked id wins over text). */}
      {field.linkedId ? (
        <input type="hidden" name={nameId} value={field.linkedId} />
      ) : (
        <input type="hidden" name={nameText} value={field.text} />
      )}

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
