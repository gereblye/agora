import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rankBySimilarity } from "@/lib/similarity";

// GET /api/statements/search?q=...&exclude=ID
// Ranks live (non-merged) statements by similarity to the query — powers the
// search-before-create typeahead and the merge picker (docs/PLAN.md §3.1).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const exclude = searchParams.get("exclude");
  if (q.length < 3) return NextResponse.json({ results: [] });

  const candidates = await prisma.statement.findMany({
    where: { status: { not: "merged" }, ...(exclude ? { id: { not: exclude } } : {}) },
    select: { id: true, canonicalText: true, topics: { select: { name: true } } },
    take: 500,
  });

  const ranked = rankBySimilarity(q, candidates, { limit: 6, threshold: 0.2 });
  return NextResponse.json({
    results: ranked.map((r) => ({
      id: r.id,
      canonicalText: r.canonicalText,
      score: Number(r.score.toFixed(3)),
      topics: r.topics.map((t) => t.name),
    })),
  });
}
