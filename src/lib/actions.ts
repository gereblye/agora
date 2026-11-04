"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getCurrentUser } from "./currentUser";
import { mergeStatements } from "./merge";
import { detectLevel } from "./logic/formula";

export async function castVote(statementId: string, value: number) {
  const user = await getCurrentUser();
  const v = value > 0 ? 1 : -1;
  const existing = await prisma.vote.findUnique({
    where: { userId_statementId: { userId: user.id, statementId } },
  });
  if (existing && existing.value === v) {
    // Toggling the same vote clears it.
    await prisma.vote.delete({ where: { id: existing.id } });
  } else {
    await prisma.vote.upsert({
      where: { userId_statementId: { userId: user.id, statementId } },
      update: { value: v },
      create: { userId: user.id, statementId, value: v },
    });
  }
  revalidatePath(`/statements/${statementId}`);
}

export async function createStatement(formData: FormData) {
  const user = await getCurrentUser();
  const canonicalText = String(formData.get("canonicalText") ?? "").trim();
  const formalization = String(formData.get("formalization") ?? "").trim() || null;
  const level = Number(formData.get("level") ?? 0);
  const topicId = String(formData.get("topicId") ?? "") || null;
  if (!canonicalText) throw new Error("Statement text is required");

  const statement = await prisma.statement.create({
    data: {
      canonicalText,
      formalization,
      level: Number.isFinite(level) ? level : 0,
      createdById: user.id,
      topics: topicId ? { connect: { id: topicId } } : undefined,
    },
  });
  redirect(`/statements/${statement.id}`);
}

// Resolves a free-text claim to a shared Statement node: reuse an exact
// (non-merged) text match if one exists, otherwise create a new natural-
// language statement. This is what lets the argument builder accept free text
// while preserving "statements are shared nodes" (docs/PLAN.md §3.1). Near-
// duplicate consolidation is a separate flow (the merge picker); here we only
// avoid creating a byte-for-byte duplicate.
async function resolveStatement(
  text: string,
  userId: string,
  formalization?: string | null
): Promise<string | null> {
  const canonicalText = text.trim();
  if (!canonicalText) return null;
  const form = formalization?.trim() || null;

  const existing = await prisma.statement.findFirst({
    where: {
      status: { not: "merged" },
      canonicalText: { equals: canonicalText },
    },
  });
  if (existing) {
    // Backfill a formalization only when the shared node has none — additive, so
    // accepting a recommendation can unlock the proof without overwriting an
    // existing formal form chosen by someone else.
    if (form && !existing.formalization) {
      await prisma.statement.update({
        where: { id: existing.id },
        data: { formalization: form, level: detectLevel(form) },
      });
    }
    return existing.id;
  }

  const created = await prisma.statement.create({
    data: {
      canonicalText,
      formalization: form,
      level: form ? detectLevel(form) : 0,
      createdById: userId,
    },
  });
  return created.id;
}

export async function createArgument(formData: FormData) {
  const user = await getCurrentUser();
  const scheme = String(formData.get("scheme") ?? "deductive");
  const inferenceType = String(formData.get("inferenceType") ?? "deductive");

  // The builder submits, per field, a linked statement id (possibly empty), the
  // free text, and an optional formalization. A linked id wins; otherwise the
  // text is resolved (find-or-create), carrying the formalization onto the node.
  const conclusionFormalization =
    String(formData.get("conclusionFormalization") ?? "").trim() || null;
  const conclusionId =
    String(formData.get("conclusionId") ?? "").trim() ||
    (await resolveStatement(
      String(formData.get("conclusionText") ?? ""),
      user.id,
      conclusionFormalization
    ));
  if (!conclusionId) throw new Error("A conclusion is required");

  // Each premise row emits all three fields (empty where absent), so the arrays
  // stay index-aligned even when some rows are linked and others are free text.
  const linkedPremiseIds = formData.getAll("premiseIds").map(String).map((s) => s.trim());
  const premiseTexts = formData.getAll("premiseTexts").map(String);
  const premiseForms = formData.getAll("premiseForms").map(String);

  const rowCount = Math.max(linkedPremiseIds.length, premiseTexts.length, premiseForms.length);
  const resolved = await Promise.all(
    Array.from({ length: rowCount }, async (_, i) => {
      const id = linkedPremiseIds[i];
      if (id) return id;
      return resolveStatement(premiseTexts[i] ?? "", user.id, premiseForms[i] ?? null);
    })
  );
  const premiseIds = [...new Set(resolved.filter((id): id is string => Boolean(id)))].filter(
    (id) => id !== conclusionId
  );
  if (premiseIds.length === 0) throw new Error("At least one premise is required");

  const argument = await prisma.argument.create({
    data: {
      conclusionId,
      scheme,
      inferenceType,
      validityStatus: inferenceType === "deductive" ? "unchecked" : "na",
      createdById: user.id,
      premises: {
        create: premiseIds.map((statementId, position) => ({ statementId, position })),
      },
    },
  });
  redirect(`/arguments/${argument.id}`);
}

export async function addCitation(formData: FormData) {
  const user = await getCurrentUser();
  const statementId = String(formData.get("statementId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim() || null;
  const doi = String(formData.get("doi") ?? "").trim() || null;
  const stance = String(formData.get("stance") ?? "support");
  const strength = Math.max(0, Math.min(1, Number(formData.get("strength") ?? 0.5)));
  if (!statementId || !title) throw new Error("Citation needs a statement and a title");

  await prisma.citation.create({
    data: { statementId, title, url, doi, stance, strength, addedById: user.id },
  });
  revalidatePath(`/statements/${statementId}`);
}

export async function mergeStatementAction(formData: FormData) {
  const dupId = String(formData.get("dupId") ?? "");
  const canonicalId = String(formData.get("canonicalId") ?? "");
  if (!dupId || !canonicalId) throw new Error("Both statements are required to merge");
  const discardArgumentIds = formData.getAll("discardArgumentIds").map(String).filter(Boolean);
  const survivor = await mergeStatements(dupId, canonicalId, { discardArgumentIds });
  revalidatePath(`/statements/${survivor}`);
  redirect(`/statements/${survivor}`);
}
