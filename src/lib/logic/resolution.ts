// Propositional resolution refutation (docs/PLAN.md §6, §9).
//
// Given formalized premises P1..Pn and a conclusion C (as propositional formulas
// over a shared atom vocabulary), we prove P1 ∧ … ∧ Pn ⊨ C by:
//   1. negating the conclusion and adding it to the premises,
//   2. converting everything to CNF (clause form),
//   3. resolving complementary literals until the empty clause □ appears.
// Deriving □ shows the set is unsatisfiable, i.e. the argument is valid.
// If resolution saturates without □, the argument is invalid and we return a
// countermodel — an assignment satisfying the premises but not the conclusion.
//
// Mini-syntax: atoms are identifiers; operators ~ (not) & (and) | (or)
// -> (implies) <-> (iff); parentheses group. Example: "rain -> wet".

// ---------- AST ----------
type Formula =
  | { t: "atom"; name: string }
  | { t: "not"; f: Formula }
  | { t: "and"; l: Formula; r: Formula }
  | { t: "or"; l: Formula; r: Formula }
  | { t: "imp"; l: Formula; r: Formula }
  | { t: "iff"; l: Formula; r: Formula };

// ---------- Parser (recursive descent, precedence: ~ > & > | > -> > <->) ----------
class Parser {
  private i = 0;
  private toks: string[];
  constructor(src: string) {
    this.toks =
      src.match(/->|<->|[&|~()]|[A-Za-z_][A-Za-z0-9_]*/g)?.map((t) => t) ?? [];
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
      return { t: "imp", l, r: this.imp() }; // right-associative
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
    if (this.peek() === "~") {
      this.next();
      return { t: "not", f: this.unary() };
    }
    if (this.peek() === "(") {
      this.next();
      const f = this.iff();
      this.expect(")");
      return f;
    }
    const name = this.next();
    if (!name || !/^[A-Za-z_]/.test(name)) throw new Error("expected atom");
    return { t: "atom", name };
  }
}

export function parseFormula(src: string): Formula {
  return new Parser(src).parse();
}

// ---------- CNF conversion ----------
function elimImplications(f: Formula): Formula {
  switch (f.t) {
    case "atom":
      return f;
    case "not":
      return { t: "not", f: elimImplications(f.f) };
    case "and":
      return { t: "and", l: elimImplications(f.l), r: elimImplications(f.r) };
    case "or":
      return { t: "or", l: elimImplications(f.l), r: elimImplications(f.r) };
    case "imp":
      return { t: "or", l: { t: "not", f: elimImplications(f.l) }, r: elimImplications(f.r) };
    case "iff": {
      const l = elimImplications(f.l);
      const r = elimImplications(f.r);
      return {
        t: "and",
        l: { t: "or", l: { t: "not", f: l }, r },
        r: { t: "or", l: { t: "not", f: r }, r: l },
      };
    }
  }
}

function pushNeg(f: Formula): Formula {
  if (f.t === "not") {
    const g = f.f;
    switch (g.t) {
      case "atom":
        return f;
      case "not":
        return pushNeg(g.f);
      case "and":
        return { t: "or", l: pushNeg({ t: "not", f: g.l }), r: pushNeg({ t: "not", f: g.r }) };
      case "or":
        return { t: "and", l: pushNeg({ t: "not", f: g.l }), r: pushNeg({ t: "not", f: g.r }) };
      default:
        return pushNeg({ t: "not", f: elimImplications(g) });
    }
  }
  if (f.t === "and") return { t: "and", l: pushNeg(f.l), r: pushNeg(f.r) };
  if (f.t === "or") return { t: "or", l: pushNeg(f.l), r: pushNeg(f.r) };
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

// Literal: e.g. "p" or "~p". A clause is a set of literals.
export type Clause = string[];

function collectClauses(f: Formula, acc: Clause[]) {
  if (f.t === "and") {
    collectClauses(f.l, acc);
    collectClauses(f.r, acc);
    return;
  }
  const lits: string[] = [];
  const collectLits = (g: Formula) => {
    if (g.t === "or") {
      collectLits(g.l);
      collectLits(g.r);
    } else if (g.t === "atom") {
      lits.push(g.name);
    } else if (g.t === "not" && g.f.t === "atom") {
      lits.push("~" + g.f.name);
    } else {
      throw new Error("formula not in CNF");
    }
  };
  collectLits(f);
  acc.push(dedupeClause(lits));
}

function dedupeClause(lits: string[]): Clause {
  return [...new Set(lits)].sort();
}

export function toCNF(src: string): Clause[] {
  const ast = distribute(pushNeg(elimImplications(parseFormula(src))));
  const clauses: Clause[] = [];
  collectClauses(ast, clauses);
  return clauses.filter((c) => !isTautology(c));
}

const negate = (lit: string) => (lit.startsWith("~") ? lit.slice(1) : "~" + lit);
const isTautology = (c: Clause) => c.some((l) => c.includes(negate(l)));

// ---------- Resolution ----------
export type ProofNode = {
  id: number;
  clause: Clause; // [] means the empty clause □
  source: "premise" | "negated-goal" | "resolvent";
  parents: number[];
  on?: string; // atom resolved on (for resolvents)
  label: string; // clause text or "□"
};

export type ResolutionResult =
  | { valid: true; nodes: ProofNode[] } // nodes = the sub-DAG that derives □
  | { valid: false; countermodel: Record<string, boolean>; atoms: string[] };

const clauseKey = (c: Clause) => (c.length ? c.join(" ∨ ") : "□");

export function proveArgument(premises: string[], conclusion: string): ResolutionResult {
  const nodes: ProofNode[] = [];
  const byKey = new Map<string, ProofNode>();
  let nextId = 0;

  const add = (
    clause: Clause,
    source: ProofNode["source"],
    parents: number[],
    on?: string
  ): ProofNode => {
    const key = clauseKey(clause);
    const existing = byKey.get(key);
    if (existing) return existing;
    const node: ProofNode = { id: nextId++, clause, source, parents, on, label: key };
    nodes.push(node);
    byKey.set(key, node);
    return node;
  };

  // Input clauses: premises + negated conclusion.
  for (const p of premises) for (const c of toCNF(p)) add(c, "premise", []);
  for (const c of toCNF(`~(${conclusion})`)) add(c, "negated-goal", []);

  // Saturate.
  let empty: ProofNode | null = null;
  let changed = true;
  let guard = 0;
  while (changed && !empty && guard++ < 5000) {
    changed = false;
    const current = [...nodes];
    for (let i = 0; i < current.length && !empty; i++) {
      for (let j = i + 1; j < current.length && !empty; j++) {
        const a = current[i];
        const b = current[j];
        for (const lit of a.clause) {
          if (!b.clause.includes(negate(lit))) continue;
          const atom = lit.replace("~", "");
          const resolvent = dedupeClause([
            ...a.clause.filter((l) => l !== lit),
            ...b.clause.filter((l) => l !== negate(lit)),
          ]);
          if (isTautology(resolvent)) continue;
          const key = clauseKey(resolvent);
          if (byKey.has(key)) continue;
          const node = add(resolvent, "resolvent", [a.id, b.id], atom);
          changed = true;
          if (resolvent.length === 0) {
            empty = node;
            break;
          }
        }
      }
    }
  }

  if (empty) {
    // Backtrack from □ to keep only the clauses actually used in the proof.
    const keep = new Set<number>();
    const stack = [empty.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (keep.has(id)) continue;
      keep.add(id);
      nodes.find((n) => n.id === id)?.parents.forEach((p) => stack.push(p));
    }
    return { valid: true, nodes: nodes.filter((n) => keep.has(n.id)) };
  }

  // Invalid → find a countermodel (satisfies premises ∧ ¬conclusion).
  const atoms = [...new Set(nodes.flatMap((n) => n.clause.map((l) => l.replace("~", ""))))].sort();
  const inputClauses = nodes.filter((n) => n.source !== "resolvent").map((n) => n.clause);
  const model = findModel(atoms, inputClauses);
  return { valid: false, countermodel: model ?? {}, atoms };
}

// Brute-force satisfiability over the (small) atom set.
function findModel(atoms: string[], clauses: Clause[]): Record<string, boolean> | null {
  const n = atoms.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const assign: Record<string, boolean> = {};
    atoms.forEach((a, k) => (assign[a] = Boolean(mask & (1 << k))));
    const ok = clauses.every((c) =>
      c.some((lit) => (lit.startsWith("~") ? !assign[lit.slice(1)] : assign[lit]))
    );
    if (ok) return assign;
  }
  return null;
}
