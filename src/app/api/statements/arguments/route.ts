import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/statements/arguments?id=STATEMENT_ID
// Lists the (live) arguments linked to a statement, split by how they touch it:
//   - `concludes`:  arguments whose conclusion IS this statement
//   - `premiseIn`:  arguments that use this statement as a premise
// Powers the merge "arena" (src/components/MergePicker.tsx), where a contributor
// decides, per argument, whether to keep or discard it before folding two
// statements together. Already-deprecated arguments are omitted.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ concludes: [], premiseIn: [] });

  const include = {
    conclusion: { select: { canonicalText: true } },
    premises: {
      orderBy: { position: "asc" as const },
      include: { statement: { select: { canonicalText: true } } },
    },
  };

  const [concludes, premiseLinks] = await Promise.all([
    prisma.argument.findMany({
      where: { conclusionId: id, status: { not: "deprecated" } },
      include,
      orderBy: { createdAt: "asc" },
    }),
    prisma.argumentPremise.findMany({
      where: { statementId: id, argument: { status: { not: "deprecated" } } },
      include: { argument: { include } },
      orderBy: { argument: { createdAt: "asc" } },
    }),
  ]);

  const shape = (a: {
    id: string;
    scheme: string;
    inferenceType: string;
    conclusion: { canonicalText: string };
    premises: { statement: { canonicalText: string } }[];
  }) => ({
    id: a.id,
    scheme: a.scheme,
    inferenceType: a.inferenceType,
    conclusionText: a.conclusion.canonicalText,
    premiseTexts: a.premises.map((p) => p.statement.canonicalText),
  });

  return NextResponse.json({
    concludes: concludes.map(shape),
    premiseIn: premiseLinks.map((p) => shape(p.argument)),
  });
}
