import { prisma } from "./db";

// Merge a duplicate statement into a canonical one (docs/PLAN.md §3.1).
//
// Every reference to the duplicate — as a conclusion, a premise, a citation/vote/
// experience target, a topic membership, or a negation partner — is repointed
// onto the canonical statement, resolving the unique-constraint conflicts that
// arise (an argument that already has the canonical as a premise; a user who
// already voted on both). The duplicate's phrasing is preserved as a surface
// form, and the duplicate row is kept but marked "merged" so old URLs redirect.
//
// Arguments can be kept or discarded in the merge "arena": a discarded argument
// is soft-deleted (status → "deprecated") rather than deleted, so it drops out
// of every view and metric but stays recoverable. `discardArgumentIds` is
// intersected with the arguments actually linked to the two statements, so a
// stale or hostile id can never deprecate an unrelated argument.
const DEPRECATED = "deprecated";

export type MergeOptions = {
  discardArgumentIds?: string[];
};

// Returns the id of the surviving canonical statement.
export async function mergeStatements(
  dupId: string,
  canonicalRawId: string,
  options: MergeOptions = {}
): Promise<string> {
  if (dupId === canonicalRawId) throw new Error("Cannot merge a statement into itself");

  // Follow any existing merge chain so we always target a live canonical.
  let canonicalId = canonicalRawId;
  for (let i = 0; i < 25; i++) {
    const c = await prisma.statement.findUnique({
      where: { id: canonicalId },
      select: { mergedIntoId: true },
    });
    if (!c) throw new Error("Canonical statement not found");
    if (!c.mergedIntoId) break;
    canonicalId = c.mergedIntoId;
  }
  if (canonicalId === dupId) throw new Error("Merge would create a cycle");

  const dup = await prisma.statement.findUnique({
    where: { id: dupId },
    include: { topics: true, votes: true, premiseIn: true },
  });
  if (!dup) throw new Error("Duplicate statement not found");
  if (dup.status === "merged") throw new Error("Statement is already merged");

  // Resolve the discard request to the arguments genuinely linked to either
  // statement (as a conclusion or as a premise) — anything else is ignored.
  const requestedDiscards = new Set(options.discardArgumentIds ?? []);
  let discardIds: string[] = [];
  if (requestedDiscards.size) {
    const linked = await prisma.argument.findMany({
      where: {
        OR: [
          { conclusionId: { in: [dupId, canonicalId] } },
          { premises: { some: { statementId: { in: [dupId, canonicalId] } } } },
        ],
      },
      select: { id: true },
    });
    discardIds = linked.map((a) => a.id).filter((id) => requestedDiscards.has(id));
  }

  await prisma.$transaction(async (tx) => {
    // 1. Arguments concluding the duplicate now conclude the canonical.
    await tx.argument.updateMany({
      where: { conclusionId: dupId },
      data: { conclusionId: canonicalId },
    });

    // 2. Premise memberships (composite PK argumentId+statementId).
    const canonPremises = await tx.argumentPremise.findMany({
      where: { statementId: canonicalId },
      select: { argumentId: true },
    });
    const canonArgs = new Set(canonPremises.map((p) => p.argumentId));
    for (const p of dup.premiseIn) {
      const key = { argumentId_statementId: { argumentId: p.argumentId, statementId: dupId } };
      if (canonArgs.has(p.argumentId)) {
        await tx.argumentPremise.delete({ where: key }); // canonical already a premise there
      } else {
        await tx.argumentPremise.update({ where: key, data: { statementId: canonicalId } });
      }
    }

    // 3. Citations and empirical reports.
    await tx.citation.updateMany({ where: { statementId: dupId }, data: { statementId: canonicalId } });
    await tx.empiricalReport.updateMany({ where: { statementId: dupId }, data: { statementId: canonicalId } });

    // 4. Votes (unique userId+statementId): keep the canonical's on collision.
    const canonVotes = await tx.vote.findMany({
      where: { statementId: canonicalId },
      select: { userId: true },
    });
    const canonVoters = new Set(canonVotes.map((v) => v.userId));
    for (const v of dup.votes) {
      if (canonVoters.has(v.userId)) await tx.vote.delete({ where: { id: v.id } });
      else await tx.vote.update({ where: { id: v.id }, data: { statementId: canonicalId } });
    }

    // 5. Topic memberships (m2m union).
    if (dup.topics.length) {
      await tx.statement.update({
        where: { id: canonicalId },
        data: { topics: { connect: dup.topics.map((t) => ({ id: t.id })) } },
      });
    }

    // 6. Negation links (negationOfId is @unique → at most one pointer per target).
    const dupNeg = await tx.statement.findUnique({
      where: { id: dupId },
      select: { negationOfId: true },
    });
    const canon = await tx.statement.findUnique({
      where: { id: canonicalId },
      select: { negationOfId: true },
    });
    await tx.statement.update({ where: { id: dupId }, data: { negationOfId: null } }); // free the slot
    if (dupNeg?.negationOfId && !canon?.negationOfId && dupNeg.negationOfId !== canonicalId) {
      await tx.statement.update({
        where: { id: canonicalId },
        data: { negationOfId: dupNeg.negationOfId },
      });
    }
    // Statements that negated the duplicate should negate the canonical (if free).
    const pointers = await tx.statement.findMany({
      where: { negationOfId: dupId },
      select: { id: true },
    });
    for (const s of pointers) {
      const taken = await tx.statement.findFirst({
        where: { negationOfId: canonicalId },
        select: { id: true },
      });
      await tx.statement.update({
        where: { id: s.id },
        data: { negationOfId: !taken && s.id !== canonicalId ? canonicalId : null },
      });
    }

    // 7. Surface forms: carry over the duplicate's, and record its phrasing.
    await tx.statementSurfaceForm.updateMany({
      where: { statementId: dupId },
      data: { statementId: canonicalId },
    });
    await tx.statementSurfaceForm.create({
      data: { statementId: canonicalId, text: dup.canonicalText },
    });

    // 8. Discarded arguments: soft-delete after repointing, so the surviving
    //    canonical never holds dangling references and the rows stay recoverable.
    if (discardIds.length) {
      await tx.argument.updateMany({
        where: { id: { in: discardIds } },
        data: { status: DEPRECATED },
      });
    }

    // 9. Tombstone the duplicate.
    await tx.statement.update({
      where: { id: dupId },
      data: { status: "merged", mergedIntoId: canonicalId },
    });
  });

  return canonicalId;
}
