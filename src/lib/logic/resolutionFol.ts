// First-order resolution refutation (docs/PLAN.md §9, Level 2).
//
// Extends the propositional prover to predicate logic: clauses carry literals
// with term arguments, and resolution unifies complementary literals via a
// most-general unifier (with occurs-check). The CNF pipeline additionally
// standardizes variables apart and Skolemizes existentials. First-order validity
// is only semi-decidable, so the search runs under hard bounds and reports
// "unknown" on exhaustion rather than a false verdict.
//
// Syntax: quantifiers `all x` / `exists x`; predicates `Man(x)`, `Loves(x, y)`;
// terms are variables (quantifier-bound identifiers), constants, or f(...).
// Connectives ~ & | -> <-> as in the propositional module.

import type { ProofNode } from "./resolution";

// ---------- Terms & literals ----------
export type Term = { kind: "var"; name: string } | { kind: "fun"; name: string; args: Term[] };
export type Literal = { neg: boolean; pred: string; args: Term[] };
type Clause = Literal[];

// ---------- FOL formula AST ----------
export type Formula =
  | { t: "pred"; neg?: never; pred: string; args: Term[] }
  | { t: "not"; f: Formula }
  | { t: "and"; l: Formula; r: Formula }
  | { t: "or"; l: Formula; r: Formula }
  | { t: "imp"; l: Formula; r: Formula }
  | { t: "iff"; l: Formula; r: Formula }
  | { t: "all"; v: string; f: Formula }
  | { t: "exists"; v: string; f: Formula };

// ---------- Parser ----------
class FolParser {
  private i = 0;
  private toks: string[];
  private scope: string[] = []; // bound variable names in scope
  constructor(src: string) {
    this.toks = src.match(/->|<->|[&|~(),]|[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  }
  private peek() {
    return this.toks[this.i];
  }
  private next() {
    return this.toks[this.i++];
  }
  private expect(t: string) {
    if (this.next() !== t) throw new Error(`expected '${t}'`);
  }
  parse(): Formula {
    const f = this.iff();
    if (this.i < this.toks.length) throw new Error("trailing input");
    return f;
  }
  private iff(): Formula {
    let l = this.imp();
    while (this.peek() === "<->") {
      this.next();
      l = { t: "iff", l, r: this.imp() };
    }
    return l;
  }
  private imp(): Formula {
    const l = this.or();
    if (this.peek() === "->") {
      this.next();
      return { t: "imp", l, r: this.imp() };
    }
    return l;
  }
  private or(): Formula {
    let l = this.and();
    while (this.peek() === "|") {
      this.next();
      l = { t: "or", l, r: this.and() };
    }
    return l;
  }
  private and(): Formula {
    let l = this.unary();
    while (this.peek() === "&") {
      this.next();
      l = { t: "and", l, r: this.unary() };
    }
    return l;
  }
  private unary(): Formula {
    const tok = this.peek();
    if (tok === "~") {
      this.next();
      return { t: "not", f: this.unary() };
    }
    if (tok === "all" || tok === "exists") {
      this.next();
      const v = this.next();
      if (!v || !/^[A-Za-z_]/.test(v)) throw new Error("expected variable after quantifier");
      this.scope.push(v);
      const f = this.unary();
      this.scope.pop();
      return { t: tok === "all" ? "all" : "exists", v, f };
    }
    if (tok === "(") {
      this.next();
      const f = this.iff();
      this.expect(")");
      return f;
    }
    // predicate
    const pred = this.next();
    if (!pred || !/^[A-Za-z_]/.test(pred)) throw new Error("expected predicate");
    const args: Term[] = [];
    if (this.peek() === "(") {
      this.next();
      if (this.peek() !== ")") {
        args.push(this.term());
        while (this.peek() === ",") {
          this.next();
          args.push(this.term());
        }
      }
      this.expect(")");
    }
    return { t: "pred", pred, args };
  }
  private term(): Term {
    const name = this.next();
    if (!name || !/^[A-Za-z_]/.test(name)) throw new Error("expected term");
    if (this.peek() === "(") {
      this.next();
      const args: Term[] = [];
      if (this.peek() !== ")") {
        args.push(this.term());
        while (this.peek() === ",") {
          this.next();
          args.push(this.term());
        }
      }
      this.expect(")");
      return { kind: "fun", name, args };
    }
    // bare identifier: variable if bound, else constant (0-ary function)
    return this.scope.includes(name) ? { kind: "var", name } : { kind: "fun", name, args: [] };
  }
}

// Parse a first-order formula into its AST. Exposed so the reverse-resolution
// recommender can inspect a conclusion's structure (src/lib/logic/formula.ts).
export function parseFol(src: string): Formula {
  return new FolParser(src).parse();
}

// ---------- CNF pipeline ----------
function elimImp(f: Formula): Formula {
  switch (f.t) {
    case "pred":
      return f;
    case "not":
      return { t: "not", f: elimImp(f.f) };
    case "and":
    case "or":
      return { t: f.t, l: elimImp(f.l), r: elimImp(f.r) };
    case "imp":
      return { t: "or", l: { t: "not", f: elimImp(f.l) }, r: elimImp(f.r) };
    case "iff": {
      const l = elimImp(f.l);
      const r = elimImp(f.r);
      return {
        t: "and",
        l: { t: "or", l: { t: "not", f: l }, r },
        r: { t: "or", l: { t: "not", f: r }, r: l },
      };
    }
    case "all":
    case "exists":
      return { t: f.t, v: f.v, f: elimImp(f.f) };
  }
}

function toNNF(f: Formula): Formula {
  if (f.t === "not") {
    const g = f.f;
    switch (g.t) {
      case "pred":
        return f;
      case "not":
        return toNNF(g.f);
      case "and":
        return { t: "or", l: toNNF({ t: "not", f: g.l }), r: toNNF({ t: "not", f: g.r }) };
      case "or":
        return { t: "and", l: toNNF({ t: "not", f: g.l }), r: toNNF({ t: "not", f: g.r }) };
      case "all":
        return { t: "exists", v: g.v, f: toNNF({ t: "not", f: g.f }) };
      case "exists":
        return { t: "all", v: g.v, f: toNNF({ t: "not", f: g.f }) };
      default:
        return toNNF({ t: "not", f: elimImp(g) });
    }
  }
  if (f.t === "and" || f.t === "or") return { t: f.t, l: toNNF(f.l), r: toNNF(f.r) };
  if (f.t === "all" || f.t === "exists") return { t: f.t, v: f.v, f: toNNF(f.f) };
  return f;
}

let counter = 0;
const fresh = (base: string) => `${base}_${counter++}`;

function substVarInTerm(t: Term, from: string, to: Term): Term {
  if (t.kind === "var") return t.name === from ? to : t;
  return { kind: "fun", name: t.name, args: t.args.map((a) => substVarInTerm(a, from, to)) };
}
function substVarInFormula(f: Formula, from: string, to: Term): Formula {
  switch (f.t) {
    case "pred":
      return { t: "pred", pred: f.pred, args: f.args.map((a) => substVarInTerm(a, from, to)) };
    case "not":
      return { t: "not", f: substVarInFormula(f.f, from, to) };
    case "and":
    case "or":
    case "imp":
    case "iff":
      return { t: f.t, l: substVarInFormula(f.l, from, to), r: substVarInFormula(f.r, from, to) };
    case "all":
    case "exists":
      return { t: f.t, v: f.v, f: substVarInFormula(f.f, from, to) };
  }
}

// Rename every quantified variable to a fresh name (standardize apart).
function standardize(f: Formula): Formula {
  if (f.t === "all" || f.t === "exists") {
    const nv = fresh(f.v);
    const body = standardize(substVarInFormula(f.f, f.v, { kind: "var", name: nv }));
    return { t: f.t, v: nv, f: body };
  }
  if (f.t === "and" || f.t === "or" || f.t === "imp" || f.t === "iff")
    return { t: f.t, l: standardize(f.l), r: standardize(f.r) } as Formula;
  if (f.t === "not") return { t: "not", f: standardize(f.f) };
  return f;
}

// Replace existentials by Skolem constants/functions over the enclosing universals.
function skolemize(f: Formula, universals: string[]): Formula {
  switch (f.t) {
    case "exists": {
      const sk: Term =
        universals.length === 0
          ? { kind: "fun", name: fresh("sk"), args: [] }
          : { kind: "fun", name: fresh("sk"), args: universals.map((u) => ({ kind: "var", name: u })) };
      return skolemize(substVarInFormula(f.f, f.v, sk), universals);
    }
    case "all":
      return { t: "all", v: f.v, f: skolemize(f.f, [...universals, f.v]) };
    case "and":
    case "or":
      return { t: f.t, l: skolemize(f.l, universals), r: skolemize(f.r, universals) };
    case "not":
      return { t: "not", f: skolemize(f.f, universals) };
    default:
      return f;
  }
}

function dropUniversals(f: Formula): Formula {
  if (f.t === "all") return dropUniversals(f.f);
  if (f.t === "and" || f.t === "or") return { t: f.t, l: dropUniversals(f.l), r: dropUniversals(f.r) };
  if (f.t === "not") return { t: "not", f: dropUniversals(f.f) };
  return f;
}

function distribute(f: Formula): Formula {
  if (f.t === "and") return { t: "and", l: distribute(f.l), r: distribute(f.r) };
  if (f.t === "or") {
    const l = distribute(f.l);
    const r = distribute(f.r);
    if (l.t === "and") return { t: "and", l: distribute({ t: "or", l: l.l, r }), r: distribute({ t: "or", l: l.r, r }) };
    if (r.t === "and") return { t: "and", l: distribute({ t: "or", l, r: r.l }), r: distribute({ t: "or", l, r: r.r }) };
    return { t: "or", l, r };
  }
  return f;
}

function collect(f: Formula, acc: Clause[]) {
  if (f.t === "and") {
    collect(f.l, acc);
    collect(f.r, acc);
    return;
  }
  const lits: Literal[] = [];
  const walk = (g: Formula) => {
    if (g.t === "or") {
      walk(g.l);
      walk(g.r);
    } else if (g.t === "pred") {
      lits.push({ neg: false, pred: g.pred, args: g.args });
    } else if (g.t === "not" && g.f.t === "pred") {
      lits.push({ neg: true, pred: g.f.pred, args: g.f.args });
    } else {
      throw new Error("not in CNF");
    }
  };
  walk(f);
  acc.push(lits);
}

function formulaToClauses(f: Formula): Clause[] {
  counter++; // keep skolem/standardize names distinct across formulas
  const pipeline = distribute(dropUniversals(skolemize(standardize(toNNF(elimImp(f))), [])));
  const acc: Clause[] = [];
  collect(pipeline, acc);
  return acc;
}

// ---------- Unification ----------
type Subst = Map<string, Term>;

function walkTerm(t: Term, s: Subst): Term {
  if (t.kind === "var") {
    const b = s.get(t.name);
    return b ? walkTerm(b, s) : t;
  }
  return t;
}
function occurs(v: string, t: Term, s: Subst): boolean {
  const w = walkTerm(t, s);
  if (w.kind === "var") return w.name === v;
  return w.args.some((a) => occurs(v, a, s));
}
function unifyTerm(a: Term, b: Term, s: Subst): Subst | null {
  const x = walkTerm(a, s);
  const y = walkTerm(b, s);
  if (x.kind === "var") {
    if (y.kind === "var" && y.name === x.name) return s;
    if (occurs(x.name, y, s)) return null;
    const ns = new Map(s);
    ns.set(x.name, y);
    return ns;
  }
  if (y.kind === "var") return unifyTerm(y, x, s);
  if (x.name !== y.name || x.args.length !== y.args.length) return null;
  let cur: Subst | null = s;
  for (let i = 0; i < x.args.length; i++) {
    cur = unifyTerm(x.args[i], y.args[i], cur!);
    if (!cur) return null;
  }
  return cur;
}
function unifyLits(a: Literal, b: Literal): Subst | null {
  if (a.pred !== b.pred || a.args.length !== b.args.length) return null;
  let s: Subst | null = new Map();
  for (let i = 0; i < a.args.length; i++) {
    s = unifyTerm(a.args[i], b.args[i], s!);
    if (!s) return null;
  }
  return s;
}

function applyTerm(t: Term, s: Subst): Term {
  const w = walkTerm(t, s);
  if (w.kind === "var") return w;
  return { kind: "fun", name: w.name, args: w.args.map((a) => applyTerm(a, s)) };
}
const applyLit = (l: Literal, s: Subst): Literal => ({
  neg: l.neg,
  pred: l.pred,
  args: l.args.map((a) => applyTerm(a, s)),
});

// Rename all variables in a clause with a fresh suffix (standardize apart before resolving).
function rename(c: Clause): Clause {
  const map = new Map<string, string>();
  const rt = (t: Term): Term => {
    if (t.kind === "var") {
      if (!map.has(t.name)) map.set(t.name, fresh(t.name));
      return { kind: "var", name: map.get(t.name)! };
    }
    return { kind: "fun", name: t.name, args: t.args.map(rt) };
  };
  return c.map((l) => ({ neg: l.neg, pred: l.pred, args: l.args.map(rt) }));
}

// ---------- Rendering & canonicalization ----------
function termStr(t: Term): string {
  if (t.kind === "var") return t.name.replace(/_\d+$/, "");
  return t.args.length ? `${t.name}(${t.args.map(termStr).join(",")})` : t.name;
}
const litStr = (l: Literal) => `${l.neg ? "~" : ""}${l.pred}(${l.args.map(termStr).join(",")})`;
function clauseLabel(c: Clause): string {
  return c.length ? c.map(litStr).join(" ∨ ") : "□";
}
// Canonical key: rename variables in appearance order so variants collapse.
function canonKey(c: Clause): string {
  const map = new Map<string, string>();
  const tk = (t: Term): string => {
    if (t.kind === "var") {
      if (!map.has(t.name)) map.set(t.name, `?${map.size}`);
      return map.get(t.name)!;
    }
    return t.args.length ? `${t.name}(${t.args.map(tk).join(",")})` : t.name;
  };
  return c
    .map((l) => `${l.neg ? "~" : ""}${l.pred}(${l.args.map(tk).join(",")})`)
    .sort()
    .join("|");
}
const dedupeLits = (c: Clause): Clause => {
  const seen = new Set<string>();
  return c.filter((l) => {
    const k = `${l.neg ? "~" : ""}${litStr({ ...l, neg: false })}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const isTautology = (c: Clause) =>
  c.some((a) => c.some((b) => a.pred === b.pred && a.neg !== b.neg && litStr({ ...a, neg: false }) === litStr({ ...b, neg: false })));

// ---------- Result ----------
export type FolResult =
  | { valid: true; nodes: ProofNode[] }
  | { valid: false; kind: "saturated" | "unknown" };

const MAX_CLAUSES = 400;
const MAX_STEPS = 4000;

export function proveArgumentFol(premises: string[], conclusion: string): FolResult {
  const clauseFor = (src: string): Clause[] => formulaToClauses(new FolParser(src).parse());

  type Entry = { id: number; clause: Clause; source: ProofNode["source"]; parents: number[]; on?: string };
  const entries: Entry[] = [];
  const keys = new Set<string>();
  let nextId = 0;

  const add = (clause: Clause, source: Entry["source"], parents: number[], on?: string): Entry | null => {
    const dq = dedupeLits(clause);
    if (isTautology(dq)) return null;
    const key = canonKey(dq);
    if (keys.has(key)) return null;
    keys.add(key);
    const e: Entry = { id: nextId++, clause: dq, source, parents, on };
    entries.push(e);
    return e;
  };

  for (const p of premises) for (const c of clauseFor(p)) add(c, "premise", []);
  for (const c of clauseFor(`~(${conclusion})`)) add(c, "negated-goal", []);

  let empty: Entry | null = null;
  let steps = 0;
  let changed = true;
  while (changed && !empty) {
    changed = false;
    const snapshot = [...entries];
    for (let i = 0; i < snapshot.length && !empty; i++) {
      for (let j = i + 1; j < snapshot.length && !empty; j++) {
        if (++steps > MAX_STEPS || entries.length > MAX_CLAUSES) return { valid: false, kind: "unknown" };
        const a = rename(snapshot[i].clause);
        const b = rename(snapshot[j].clause);
        for (let x = 0; x < a.length && !empty; x++) {
          for (let y = 0; y < b.length; y++) {
            if (a[x].pred !== b[y].pred || a[x].neg === b[y].neg) continue;
            const s = unifyLits({ ...a[x], neg: false }, { ...b[y], neg: false });
            if (!s) continue;
            const resolvent = [
              ...a.filter((_, k) => k !== x).map((l) => applyLit(l, s)),
              ...b.filter((_, k) => k !== y).map((l) => applyLit(l, s)),
            ];
            const on = `${a[x].pred}, mgu {${[...s.keys()].map((k) => `${k.replace(/_\d+$/, "")}=${termStr(walkTerm({ kind: "var", name: k }, s))}`).join(", ")}}`;
            const node = add(resolvent, "resolvent", [snapshot[i].id, snapshot[j].id], on);
            if (node) {
              changed = true;
              if (node.clause.length === 0) {
                empty = node;
                break;
              }
            }
          }
        }
      }
    }
  }

  if (!empty) return { valid: false, kind: "saturated" };

  // Backtrack from □ to the used clauses.
  const keep = new Set<number>();
  const stack = [empty.id];
  while (stack.length) {
    const id = stack.pop()!;
    if (keep.has(id)) continue;
    keep.add(id);
    entries.find((e) => e.id === id)?.parents.forEach((p) => stack.push(p));
  }
  const nodes: ProofNode[] = entries
    .filter((e) => keep.has(e.id))
    .map((e) => ({
      id: e.id,
      clause: e.clause.map(litStr),
      source: e.source,
      parents: e.parents,
      on: e.on,
      label: clauseLabel(e.clause),
    }));
  return { valid: true, nodes };
}
