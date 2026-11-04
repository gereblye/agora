// Shared parsing + verification surface over the two resolution engines.
//
// The propositional (resolution.ts) and first-order (resolutionFol.ts) provers
// each own a parser and a CNF pipeline. This module re-exports the pieces the
// reverse-resolution recommender needs and adds a single `verifyEntails` entry
// point that picks the right engine — the same dispatch argumentProof.ts uses,
// but over raw formula strings instead of a stored Argument. Every synthesized
// premise set is run back through `verifyEntails`, so the recommender only ever
// surfaces sets the real prover confirms (docs/PLAN.md §6, §9).

import { proveArgument, parseFormula, type ProofNode } from "./resolution";
import {
  proveArgumentFol,
  parseFol,
  type Formula as FolFormula,
  type Term as FolTerm,
} from "./resolutionFol";

export { parseFormula, parseFol };
export type { FolFormula, FolTerm, ProofNode };

// A formula is first-order if it uses quantifiers or predicate application (an
// identifier immediately followed by "(" — propositional grouping never is).
// Mirrors the detector in argumentProof.ts.
export function isFirstOrder(src: string): boolean {
  return /\b(all|exists)\b/.test(src) || /[A-Za-z_]\w*\(/.test(src);
}

// Formalization level a formula sits at: 1 = propositional, 2 = predicate.
export function detectLevel(src: string): 1 | 2 {
  return isFirstOrder(src) ? 2 : 1;
}

export type EntailResult =
  | { valid: true; nodes: ProofNode[] }
  | { valid: false };

// Forward-checks `premises ⊨ conclusion` with the appropriate engine. A parse
// error, a countermodel, saturation, or a resource-bound `unknown` all collapse
// to `{ valid: false }` — the recommender treats anything short of a confirmed
// refutation as "do not recommend", never a false positive.
export function verifyEntails(premises: string[], conclusion: string): EntailResult {
  const firstOrder = [...premises, conclusion].some(isFirstOrder);
  try {
    if (firstOrder) {
      const r = proveArgumentFol(premises, conclusion);
      return r.valid ? { valid: true, nodes: r.nodes } : { valid: false };
    }
    const r = proveArgument(premises, conclusion);
    return r.valid ? { valid: true, nodes: r.nodes } : { valid: false };
  } catch {
    return { valid: false };
  }
}
