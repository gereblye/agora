// Reverse-resolution premise recommender (docs/PLAN.md — argument builder).
//
// Forward, the prover shows `P₁…Pₙ ⊨ C` by negating C, converting to CNF, and
// resolving to the empty clause □. This module runs that backwards: starting
// from a conclusion's formula, it synthesizes parent clauses whose *forward*
// resolution reproduces the conclusion, and surfaces each as a candidate
// premise. The canonical case is the FOL syllogism — a conclusion literal
// `Mortal(socrates)` divides into a unit literal `Man(socrates)` and a
// universal clause `all x (Man(x) -> Mortal(x))`, introducing one fresh
// predicate (`Man`) the author then names.
//
// Generation is heuristic and infinitely branching, so it is bounded to a small
// library of named inference-scheme templates plus the generic literal split.
// Correctness is not heuristic: every synthesized set is run back through the
// real prover (`verifyEntails`) and only confirmed-valid sets are returned.

import {
  parseFol,
  verifyEntails,
  type FolFormula,
  type FolTerm,
  type ProofNode,
} from "./formula";

// A placeholder symbol in a synthesized premise that the author must replace
// with a real claim. `id` is the exact identifier used in the formula string,
// so the accept-flow can find-and-replace it (word-boundary) across the set.
export type Hole = {
  id: string;
  role: "atom" | "pred";
  placeholder: string;
};

export type PremiseRec = {
  formula: string; // formalization, e.g. "all x (P(x) -> Mortal(x))"
  nlTemplate: string; // readable scaffold with {hole} blanks, e.g. "All {P} are mortal."
  holes: Hole[];
};

export type RecommendationSet = {
  schemeId: string; // "syllogism" | "modus_ponens" | "hypothetical_syllogism" | ...
  label: string;
  premises: PremiseRec[];
  proofNodes: ProofNode[]; // the verified refutation DAG (for a proof preview)
  score: number;
};

// A candidate before verification/scoring.
type Raw = {
  schemeId: string;
  label: string;
  base: number; // base score for the scheme (quality/legibility)
  premises: PremiseRec[];
};

// ---------- name hygiene ----------

function collectTermNames(t: FolTerm, out: Set<string>) {
  if (t.kind === "var") out.add(t.name);
  else {
    out.add(t.name);
    t.args.forEach((a) => collectTermNames(a, out));
  }
}
function collectNames(f: FolFormula, out: Set<string>) {
  switch (f.t) {
    case "pred":
      out.add(f.pred);
      f.args.forEach((t) => collectTermNames(t, out));
      return;
    case "not":
      collectNames(f.f, out);
      return;
    case "and":
    case "or":
    case "imp":
    case "iff":
      collectNames(f.l, out);
      collectNames(f.r, out);
      return;
    case "all":
    case "exists":
      out.add(f.v);
      collectNames(f.f, out);
      return;
  }
}

const ATOM_POOL = ["A", "B", "C", "D", "E", "F", "G", "H"];
const PRED_POOL = ["P", "Q", "R", "S", "T", "U"];
const VAR_POOL = ["x", "y", "z", "w", "u", "v"];

// A fresh-name picker over a pool that never collides with names already in use
// (the conclusion's own symbols, and anything handed out earlier in this call).
function makeFresh(used: Set<string>) {
  return (pool: string[]): string => {
    for (const base of pool) {
      if (!used.has(base)) {
        used.add(base);
        return base;
      }
    }
    for (let i = 1; ; i++) {
      for (const base of pool) {
        const n = `${base}${i}`;
        if (!used.has(n)) {
          used.add(n);
          return n;
        }
      }
    }
  };
}

// ---------- rendering ----------

function termStr(t: FolTerm): string {
  if (t.kind === "var") return t.name;
  return t.args.length ? `${t.name}(${t.args.map(termStr).join(", ")})` : t.name;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Precedence for parenthesizing when re-rendering conclusion subformulas.
const PREC = { iff: 1, imp: 2, or: 3, and: 4, not: 5, atom: 6 } as const;

function wrap(s: string, prec: number, parent: number): string {
  return prec < parent ? `(${s})` : s;
}

// Render a formula AST back to the engines' concrete syntax. Quantifier bodies
// are always parenthesized because `all x` binds only the following unary in the
// grammar (so `all x (P(x) -> Q(x))` must keep its parens).
function fstr(f: FolFormula, parent = 0): string {
  switch (f.t) {
    case "pred":
      return f.args.length ? `${f.pred}(${f.args.map(termStr).join(", ")})` : f.pred;
    case "not":
      return `~${fstr(f.f, PREC.not)}`;
    case "and":
      return wrap(`${fstr(f.l, PREC.and)} & ${fstr(f.r, PREC.and)}`, PREC.and, parent);
    case "or":
      return wrap(`${fstr(f.l, PREC.or)} | ${fstr(f.r, PREC.or)}`, PREC.or, parent);
    case "imp":
      return wrap(`${fstr(f.l, PREC.imp + 1)} -> ${fstr(f.r, PREC.imp)}`, PREC.imp, parent);
    case "iff":
      return wrap(`${fstr(f.l, PREC.iff + 1)} <-> ${fstr(f.r, PREC.iff)}`, PREC.iff, parent);
    case "all":
      return `all ${f.v} (${fstr(f.f, 0)})`;
    case "exists":
      return `exists ${f.v} (${fstr(f.f, 0)})`;
  }
}

// ---------- templates (reverse-resolution rules) ----------
//
// Each template takes the conclusion AST, its rendered form `C`, a readable
// conclusion phrase, and a fresh-name picker, and returns zero or more raw
// candidate sets whose forward resolvent is the conclusion.

type Ctx = {
  ast: FolFormula;
  C: string; // normalized conclusion formula
  phrase: string; // natural-language conclusion (falls back to C)
  fresh: (pool: string[]) => string;
};

// Parenthesize a rendered subformula before splicing it into a larger one, so
// operator precedence can't re-bracket it (e.g. `A | (p -> r)`, not `A | p -> r`
// which would parse as `(A | p) -> r`). A bare literal/negation never needs it;
// over-parenthesizing a compound is always safe and parses identically.
function paren(f: FolFormula, s: string): string {
  return f.t === "and" || f.t === "or" || f.t === "imp" || f.t === "iff" ? `(${s})` : s;
}

// Modus ponens: `A`, `A -> C ⊢ C`. Valid for ANY conclusion — the universal
// fallback that guarantees at least one recommendation.
function tplModusPonens({ ast, C, phrase, fresh }: Ctx): Raw[] {
  const a = fresh(ATOM_POOL);
  const hole: Hole = { id: a, role: "atom", placeholder: a };
  return [
    {
      schemeId: "modus_ponens",
      label: "Modus ponens",
      base: 0.7,
      premises: [
        { formula: a, nlTemplate: `{${a}}`, holes: [hole] },
        {
          formula: `${a} -> ${paren(ast, C)}`,
          nlTemplate: `If {${a}}, then ${phrase}.`,
          holes: [hole],
        },
      ],
    },
  ];
}

// Disjunctive syllogism: `A | C`, `~A ⊢ C`. Also universally applicable.
function tplDisjunctiveSyllogism({ ast, C, phrase, fresh }: Ctx): Raw[] {
  const a = fresh(ATOM_POOL);
  const hole: Hole = { id: a, role: "atom", placeholder: a };
  return [
    {
      schemeId: "disjunctive_syllogism",
      label: "Disjunctive syllogism",
      base: 0.6,
      premises: [
        {
          formula: `${a} | ${paren(ast, C)}`,
          nlTemplate: `Either {${a}}, or ${phrase}.`,
          holes: [hole],
        },
        { formula: `~${a}`, nlTemplate: `It is not the case that {${a}}.`, holes: [hole] },
      ],
    },
  ];
}

// Hypothetical syllogism: conclusion `X -> Z` ⟵ `X -> Y`, `Y -> Z`.
function tplHypotheticalSyllogism({ ast, fresh }: Ctx): Raw[] {
  if (ast.t !== "imp") return [];
  const x = paren(ast.l, fstr(ast.l));
  const z = paren(ast.r, fstr(ast.r));
  const y = fresh(ATOM_POOL);
  const hole: Hole = { id: y, role: "atom", placeholder: y };
  return [
    {
      schemeId: "hypothetical_syllogism",
      label: "Hypothetical syllogism (chaining)",
      base: 0.95,
      premises: [
        { formula: `${x} -> ${y}`, nlTemplate: `If ${x}, then {${y}}.`, holes: [hole] },
        { formula: `${y} -> ${z}`, nlTemplate: `If {${y}}, then ${z}.`, holes: [hole] },
      ],
    },
  ];
}

// Conjunction introduction: conclusion `A & B` ⟵ premises `A`, `B` (no holes).
function tplConjunction({ ast }: Ctx): Raw[] {
  if (ast.t !== "and") return [];
  const left = fstr(ast.l);
  const right = fstr(ast.r);
  return [
    {
      schemeId: "conjunction_intro",
      label: "Conjunction",
      base: 0.95,
      premises: [
        { formula: left, nlTemplate: left, holes: [] },
        { formula: right, nlTemplate: right, holes: [] },
      ],
    },
  ];
}

// Modus tollens: conclusion `~A` ⟵ `A -> B`, `~B`.
function tplModusTollens({ ast, fresh }: Ctx): Raw[] {
  if (ast.t !== "not") return [];
  const a = paren(ast.f, fstr(ast.f));
  const b = fresh(ATOM_POOL);
  const hole: Hole = { id: b, role: "atom", placeholder: b };
  return [
    {
      schemeId: "modus_tollens",
      label: "Modus tollens",
      base: 0.9,
      premises: [
        { formula: `${a} -> ${b}`, nlTemplate: `If ${a}, then {${b}}.`, holes: [hole] },
        { formula: `~${b}`, nlTemplate: `It is not the case that {${b}}.`, holes: [hole] },
      ],
    },
  ];
}

// Syllogism / universal instantiation (the headline case): a ground literal
// `Q(t₁…tₙ)` divides into the unit `P(t₁…tₙ)` and the universal rule
// `all v₁…vₙ (P(v₁…vₙ) -> Q(v₁…vₙ))`, introducing one fresh predicate P.
function tplSyllogism({ ast, fresh }: Ctx): Raw[] {
  if (ast.t !== "pred" || ast.args.length === 0) return [];
  const q = ast.pred;
  const argStr = ast.args.map(termStr).join(", ");
  const n = ast.args.length;
  const p = fresh(PRED_POOL);
  const vars = Array.from({ length: n }, () => fresh(VAR_POOL));
  const varArgs = vars.join(", ");
  const prefix = vars.map((v) => `all ${v} `).join("");
  const hole: Hole = { id: p, role: "pred", placeholder: p };

  const subject = n === 1 ? termStr(ast.args[0]) : `(${argStr})`;
  const unitNl = n === 1 ? `${cap(subject)} is a {${p}}.` : `{${p}} holds of ${subject}.`;
  const ruleNl =
    n === 1 ? `Every {${p}} is ${q.toLowerCase()}.` : `Whenever {${p}} holds, so does ${q}.`;

  return [
    {
      schemeId: "syllogism",
      label: "Syllogism (universal instantiation)",
      base: 1.0,
      premises: [
        { formula: `${p}(${argStr})`, nlTemplate: unitNl, holes: [hole] },
        {
          formula: `${prefix}(${p}(${varArgs}) -> ${q}(${varArgs}))`,
          nlTemplate: ruleNl,
          holes: [hole],
        },
      ],
    },
  ];
}

const TEMPLATES = [
  tplSyllogism,
  tplHypotheticalSyllogism,
  tplConjunction,
  tplModusTollens,
  tplModusPonens,
  tplDisjunctiveSyllogism,
];

// ---------- dedupe ----------

// A structural key that ignores the particular fresh names chosen, so two
// templates that synthesize the same set collapse. Hole ids are replaced by
// positional markers (#0, #1 …) in first-appearance order.
function normKey(set: Raw): string {
  const order: string[] = [];
  for (const p of set.premises)
    for (const h of p.holes) if (!order.includes(h.id)) order.push(h.id);
  const sub = (s: string) => {
    let out = s;
    order.forEach((id, i) => {
      out = out.replace(new RegExp(`\\b${id}\\b`, "g"), `#${i}`);
    });
    return out;
  };
  return set.premises
    .map((p) => sub(p.formula))
    .sort()
    .join(" || ");
}

// ---------- entry point ----------

export type SynthesizeOptions = { maxSets?: number };

// Synthesize verified premise sets that deductively entail `conclusionFormula`.
// Returns [] for an unparseable conclusion. `conclusionText` (the natural-
// language claim) is woven into the readable premise scaffolds when given.
export function synthesizePremiseSets(
  conclusionFormula: string,
  conclusionText?: string,
  opts: SynthesizeOptions = {}
): RecommendationSet[] {
  const maxSets = opts.maxSets ?? 6;

  let ast: FolFormula;
  try {
    ast = parseFol(conclusionFormula);
  } catch {
    return [];
  }

  const used = new Set<string>();
  collectNames(ast, used);
  const C = fstr(ast);
  const phrase = conclusionText?.trim() || C;

  // Run every template. Each gets its own fresh picker sharing the conclusion's
  // reserved names, so names stay distinct within a set but may repeat across
  // independent sets (which is fine — they are separate recommendations).
  const raws: Raw[] = [];
  for (const tpl of TEMPLATES) {
    const fresh = makeFresh(new Set(used));
    raws.push(...tpl({ ast, C, phrase, fresh }));
  }

  // Verify, score, dedupe, rank.
  const seen = new Map<string, RecommendationSet>();
  for (const raw of raws) {
    const formulas = raw.premises.map((p) => p.formula);

    // Begging-the-question guard: never recommend the conclusion as a premise.
    if (formulas.some((f) => f === C)) continue;

    const check = verifyEntails(formulas, conclusionFormula);
    if (!check.valid) continue;

    const holeCount = new Set(raw.premises.flatMap((p) => p.holes.map((h) => h.id))).size;
    const score = raw.base - 0.05 * holeCount - 0.02 * Math.max(0, raw.premises.length - 2);

    const rec: RecommendationSet = {
      schemeId: raw.schemeId,
      label: raw.label,
      premises: raw.premises,
      proofNodes: check.nodes,
      score,
    };

    const key = normKey(raw);
    const prev = seen.get(key);
    if (!prev || rec.score > prev.score) seen.set(key, rec);
  }

  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, maxSets);
}
