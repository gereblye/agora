import { prisma } from "./db";

// Phase 0 has no auth (docs/PLAN.md §12 defers it to Phase 5). For now every
// action runs as a single demo user so votes/contributions have an author.
export async function getCurrentUser() {
  const handle = "you";
  return prisma.user.upsert({
    where: { handle },
    update: {},
    create: { handle, email: null },
  });
}
