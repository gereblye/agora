import { NextResponse } from "next/server";
import { synthesizePremiseSets } from "@/lib/logic/reverseResolution";

// GET /api/arguments/premises?formula=...&text=...
// Reverse-resolution premise recommender for the argument builder: given a
// conclusion's formula (and optionally its natural-language text, woven into the
// readable scaffolds), returns verified premise sets that deductively entail it
// (docs/PLAN.md §6, §9). The heavy proving stays server-side; the builder calls
// this through src/lib/recommend.ts. Returns `{ sets: [] }` for an unparseable
// or empty formula rather than an error.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const formula = (searchParams.get("formula") ?? "").trim();
  const text = (searchParams.get("text") ?? "").trim() || undefined;

  // Guard against pathological inputs before the bounded synthesizer runs.
  if (!formula || formula.length > 500) return NextResponse.json({ sets: [] });

  const sets = synthesizePremiseSets(formula, text);
  return NextResponse.json({ sets });
}
