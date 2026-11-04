import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { parseFol, parseFormula, isFirstOrder, detectLevel } from "./formula";

// Natural-language → formula authoring assistance (docs/PLAN.md §9).
//
// Given a conclusion written in plain English, propose a *candidate* logical
// formula in the grammar the resolution engines parse (operators ~ & | -> <->,
// quantifiers `all x` / `exists x`, predicates `Mortal(x)`, constants like
// `socrates`). The candidate is enrichment, never authoritative: it is always
// validated by the real parser here and re-confirmed (and editable) by the
// author in the builder before it drives anything.
//
// Two sources, in order: Claude when ANTHROPIC_API_KEY is set, else a small
// deterministic pattern parser so the aid still does something offline / in a
// dev environment without a key. Whichever produced it, an unparseable result
// is discarded — we never hand the builder a formula the engine would reject.

export type FormalizationSuggestion = {
  formula: string;
  level: 1 | 2; // 1 = propositional, 2 = predicate
  source: "llm" | "heuristic";
};

// A candidate only counts if it parses in the engine that would run it.
function parses(formula: string): boolean {
  const f = formula.trim();
  if (!f) return false;
  try {
    if (isFirstOrder(f)) parseFol(f);
    else parseFormula(f);
    return true;
  } catch {
    return false;
  }
}

export async function suggestFormalization(
  text: string
): Promise<FormalizationSuggestion | null> {
  const nl = text.trim();
  if (!nl) return null;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const formula = await llmFormalize(nl);
      if (formula && parses(formula)) {
        return { formula, level: detectLevel(formula), source: "llm" };
      }
    } catch {
      // Network/quota/parse failure — fall through to the offline heuristic.
    }
  }

  const h = heuristicFormalize(nl);
  if (h && parses(h)) {
    return { formula: h, level: detectLevel(h), source: "heuristic" };
  }
  return null;
}

// ---------- Claude path ----------

const MODEL = process.env.FORMALIZE_MODEL || "claude-haiku-5-5";

const SYSTEM = `You convert ONE natural-language claim into a single formula of first-order (or propositional) logic for an argument-mapping tool.

Respond with ONLY the formula — no prose, no backticks, no explanation.

Grammar:
- Connectives: ~ (not), & (and), | (or), -> (implies), <-> (iff).
- Quantifiers: "all x (...)" and "exists x (...)". Variables are single lowercase letters (x, y, z).
- Predicates are CamelCase applied to terms: Mortal(x), Loves(john, mary). A bare propositional atom (0-ary predicate) is just a CamelCase name: Raining.
- Individual constants (proper names / specific things) are lowercase identifiers; join multiple words with underscores: socrates, the_ground.

Conventions:
- A claim about a specific named individual uses a constant: "Socrates is mortal" -> Mortal(socrates); "Socrates is a man" -> Man(socrates).
- A universal claim uses all ... ->: "All men are mortal" -> all x (Man(x) -> Mortal(x)).
- An existential claim uses exists ... &: "Some politicians are honest" -> exists x (Politician(x) & Honest(x)).
- A negative universal: "No cats are dogs" -> all x (Cat(x) -> ~Dog(x)).
- A conditional between whole clauses with no shared individual uses propositional atoms: "If it rains, the ground is wet" -> Raining -> GroundWet.
- Prefer predicates + quantifiers when the sentence is about a kind or relates individuals; use plain atoms only for whole-clause combinations.
- Keep predicate and constant names short and canonical; reuse the same name for the same concept.

Examples:
Socrates is mortal -> Mortal(socrates)
All humans are mortal -> all x (Human(x) -> Mortal(x))
If Socrates is a man then Socrates is mortal -> Man(socrates) -> Mortal(socrates)
Some men are honest -> exists x (Man(x) & Honest(x))
No cats are dogs -> all x (Cat(x) -> ~Dog(x))
It is raining and it is cold -> Raining & Cold
The ground is not wet -> ~Wet(the_ground)`;

async function llmFormalize(nl: string): Promise<string | null> {
  const client = new Anthropic({ maxRetries: 1 });
  const msg = await client.messages.create(
    {
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: "user", content: nl }],
    },
    { timeout: 12_000 }
  );
  const raw = msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  return cleanFormula(raw);
}

// Pull a single formula line out of the model's reply, tolerating stray fences
// or a leading "->" echo even though the prompt asks for none.
function cleanFormula(raw: string): string | null {
  const body = raw
    .replace(/```[a-zA-Z]*/g, "")
    .replace(/```/g, "")
    .trim();
  if (!body) return null;
  const lines = body
    .split("\n")
    .map((l) => l.replace(/^\s*->\s*/, "").trim())
    .filter(Boolean);
  if (!lines.length) return null;
  // Prefer a line that looks like a formula; else the first non-empty line.
  const looksLogical = (l: string) => /~|&|\||->|<->|\b(all|exists)\b|[A-Za-z_]\w*\(/.test(l);
  return lines.find(looksLogical) ?? lines[0];
}

// ---------- Deterministic fallback ----------

const ARTICLE = /^(?:an?|the)\s+/i;

function cleanNl(s: string): string {
  return s.trim().replace(/\.+$/, "").replace(/\s+/g, " ");
}

function tokens(s: string): string[] {
  return s
    .replace(/[^A-Za-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// A naive singularizer so "all men are mortal" keys off Man, not Mens.
const IRREGULAR: Record<string, string> = {
  men: "man",
  women: "woman",
  people: "person",
  children: "child",
  feet: "foot",
  teeth: "tooth",
  mice: "mouse",
};
function singular(word: string): string {
  const w = word.toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (/ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/(ses|xes|zes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w) && w.length > 3) return w.slice(0, -1);
  return w;
}

// CamelCase predicate name from a phrase: "a man" -> Man, "is wet" -> Wet.
function toPred(s: string, opts: { singular?: boolean } = {}): string | null {
  const ts = tokens(s.replace(ARTICLE, ""));
  if (!ts.length) return null;
  const parts = opts.singular ? ts.map((t, i) => (i === ts.length - 1 ? singular(t) : t)) : ts;
  const id = parts
    .map((t) => t.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean)
    .map((t) => t[0].toUpperCase() + t.slice(1).toLowerCase())
    .join("");
  return /^[A-Za-z_]/.test(id) ? id : null;
}

// snake_case constant from a phrase: "the ground" -> the_ground.
function toConst(s: string): string | null {
  const ts = tokens(s.replace(ARTICLE, ""));
  if (!ts.length) return null;
  const id = ts
    .map((t) => t.replace(/[^A-Za-z0-9]/g, "").toLowerCase())
    .filter(Boolean)
    .join("_");
  return /^[A-Za-z_]/.test(id) ? id : null;
}

// Propositional atom for a whole clause: "it is raining" -> ItIsRaining.
function toAtom(s: string): string | null {
  return toPred(s);
}

function wrap(f: string): string {
  return /\s(?:->|<->|&|\|)\s/.test(f) ? `(${f})` : f;
}

// Formalize one simple clause (no top-level if/and/or — those are peeled off by
// heuristicFormalize first).
function clause(s: string): string | null {
  const c = cleanNl(s);
  let m: RegExpMatchArray | null;

  if ((m = c.match(/^(?:all|every|each)\s+(.+?)\s+(?:is|are)\s+(?:an?\s+)?(.+)$/i))) {
    const subj = toPred(m[1], { singular: true });
    const pred = toPred(m[2], { singular: true });
    if (subj && pred) return `all x (${subj}(x) -> ${pred}(x))`;
  }
  if ((m = c.match(/^no\s+(.+?)\s+(?:is|are)\s+(?:an?\s+)?(.+)$/i))) {
    const subj = toPred(m[1], { singular: true });
    const pred = toPred(m[2], { singular: true });
    if (subj && pred) return `all x (${subj}(x) -> ~${pred}(x))`;
  }
  if (
    (m = c.match(
      /^(?:some|there\s+(?:is|are|exists?))\s+(.+?)\s+(?:is|are|who\s+(?:is|are))\s+(?:an?\s+)?(.+)$/i
    ))
  ) {
    const subj = toPred(m[1], { singular: true });
    const pred = toPred(m[2], { singular: true });
    if (subj && pred) return `exists x (${subj}(x) & ${pred}(x))`;
  }
  // Singular predication about a named subject: "<subject> is [not] [a] <pred>".
  // A dummy/expletive subject ("it is raining", "there is a storm") has no real
  // individual to predicate of, so fall through to a whole-clause atom instead.
  if ((m = c.match(/^(.+?)\s+(?:is|are|was|were)\s+(not\s+)?(?:an?\s+)?(.+)$/i))) {
    const subject = m[1].trim();
    const neg = m[2] ? "~" : "";
    const pred = toPred(m[3], { singular: true });
    if (!/^(?:it|there|this|that|these|those)$/i.test(subject)) {
      const cst = toConst(subject);
      if (cst && pred) return `${neg}${pred}(${cst})`;
    } else if (pred) {
      // "it is [not] raining" -> [~]Raining
      return `${neg}${pred}`;
    }
  }
  const atom = toAtom(c);
  return atom ? atom : null;
}

function heuristicFormalize(nl: string): string | null {
  const c = cleanNl(nl);
  let m: RegExpMatchArray | null;

  if (
    (m = c.match(/^if\s+(.+?)\s*,?\s*then\s+(.+)$/i)) ||
    (m = c.match(/^if\s+(.+?),\s*(.+)$/i))
  ) {
    const p = clause(m[1]);
    const q = clause(m[2]);
    if (p && q) return `${wrap(p)} -> ${wrap(q)}`;
  }

  if ((m = c.match(/^(?:it is not the case that|it's not the case that)\s+(.+)$/i))) {
    const inner = clause(m[1]);
    if (inner) return `~${wrap(inner)}`;
  }

  // Top-level conjunction / disjunction between two clause-like halves.
  for (const [re, op] of [
    [/\s+and\s+/i, "&"],
    [/\s+or\s+/i, "|"],
  ] as const) {
    const parts = c.split(re);
    if (
      parts.length === 2 &&
      parts.every((p) => /\s(?:is|are|was|were)\s|\b(?:all|every|some|no)\b/i.test(p))
    ) {
      const l = clause(parts[0]);
      const r = clause(parts[1]);
      if (l && r) return `${wrap(l)} ${op} ${wrap(r)}`;
    }
  }

  return clause(c);
}
