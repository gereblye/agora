import { NextResponse } from "next/server";
import { suggestFormalization } from "@/lib/logic/formalize";

// POST /api/formalize   { text: string }  ->  { suggestion: FormalizationSuggestion | null }
//
// Natural-language → candidate formula for the argument builder (docs/PLAN.md §9).
// POST (not GET) so the claim text stays out of the URL/query string, and so the
// Anthropic key and SDK never cross into the client bundle — the engine runs only
// here. A null suggestion means neither Claude nor the heuristic produced a
// formula the parser accepts; the UI then asks the author to write one.
export async function POST(req: Request) {
  let text = "";
  try {
    const body = await req.json();
    text = String(body?.text ?? "");
  } catch {
    // malformed body — treated as empty text below
  }
  text = text.slice(0, 1000);

  const suggestion = await suggestFormalization(text);
  return NextResponse.json({ suggestion });
}
