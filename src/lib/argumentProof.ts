import { proveArgument, type ProofNode } from "./logic/resolution";
import { proveArgumentFol } from "./logic/resolutionFol";

// Runs the resolution engine for a stored argument, choosing the propositional
// or first-order prover from the shape of the formalizations (§6.4, §9). Only
// deductive, fully-formalized arguments get a proof.

type ProofInput = {
  inferenceType: string;
  conclusion: { formalization: string | null };
  premises: { statement: { formalization: string | null } }[];
};

export type Verdict =
  | { valid: true; nodes: ProofNode[] }
  | { valid: false; kind: "countermodel"; atoms: string[]; countermodel: Record<string, boolean> }
  | { valid: false; kind: "saturated" } // FOL: search complete, genuinely invalid
  | { valid: false; kind: "unknown" }; // FOL: hit the resource bound

export type ArgProofOutcome =
  | { status: "proved"; logic: "propositional" | "first-order"; verdict: Verdict }
  | { status: "not-deductive" }
  | { status: "not-formalized"; missing: number }
  | { status: "error"; message: string };

// A formula is first-order if it uses quantifiers or predicate application
// (an identifier immediately followed by "(" — propositional grouping never is).
function isFirstOrder(src: string): boolean {
  return /\b(all|exists)\b/.test(src) || /[A-Za-z_]\w*\(/.test(src);
}

export function runArgumentProof(arg: ProofInput): ArgProofOutcome {
  if (arg.inferenceType !== "deductive") return { status: "not-deductive" };

  const premiseForms = arg.premises.map((p) => p.statement.formalization);
  const conclusionForm = arg.conclusion.formalization;
  const missing = premiseForms.filter((f) => !f).length + (conclusionForm ? 0 : 1);
  if (missing > 0 || !conclusionForm) return { status: "not-formalized", missing };

  const forms = premiseForms as string[];
  const firstOrder = [...forms, conclusionForm].some(isFirstOrder);

  try {
    if (firstOrder) {
      const r = proveArgumentFol(forms, conclusionForm);
      const verdict: Verdict = r.valid ? { valid: true, nodes: r.nodes } : { valid: false, kind: r.kind };
      return { status: "proved", logic: "first-order", verdict };
    }
    const r = proveArgument(forms, conclusionForm);
    const verdict: Verdict = r.valid
      ? { valid: true, nodes: r.nodes }
      : { valid: false, kind: "countermodel", atoms: r.atoms, countermodel: r.countermodel };
    return { status: "proved", logic: "propositional", verdict };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
