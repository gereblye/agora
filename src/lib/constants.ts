// Enum-like domain constants (SQLite stores these as plain strings).

export const INFERENCE_TYPES = ["deductive", "defeasible"] as const;
export type InferenceType = (typeof INFERENCE_TYPES)[number];

export const VALIDITY = ["unchecked", "valid", "invalid", "unknown", "na"] as const;
export type Validity = (typeof VALIDITY)[number];

export const CITATION_STANCES = ["support", "refute"] as const;
export type CitationStance = (typeof CITATION_STANCES)[number];

// Waltonian argumentation schemes — each epistemic basis maps to one (PLAN §2.4).
export const SCHEMES = [
  { id: "deductive", label: "Deductive inference", defeasible: false },
  { id: "expert_opinion", label: "Argument from expert opinion", defeasible: true },
  { id: "popular_opinion", label: "Argument from popular opinion", defeasible: true },
  { id: "perception", label: "Argument from perception", defeasible: true },
  { id: "cause_to_effect", label: "Argument from cause to effect", defeasible: true },
  { id: "analogy", label: "Argument from analogy", defeasible: true },
  { id: "sign", label: "Argument from sign", defeasible: true },
] as const;

export type SchemeId = (typeof SCHEMES)[number]["id"];

export function schemeLabel(id: string): string {
  return SCHEMES.find((s) => s.id === id)?.label ?? id;
}

export const STATEMENT_LEVELS: Record<number, string> = {
  0: "Natural language",
  1: "Propositional",
  2: "Predicate",
};
