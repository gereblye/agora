import { prisma } from "@/lib/db";
import { Card } from "@/components/ui";
import { ArgumentBuilder } from "@/components/ArgumentBuilder";

export default async function NewArgumentPage({
  searchParams,
}: {
  searchParams: Promise<{ conclusion?: string }>;
}) {
  const { conclusion } = await searchParams;

  // Arriving from a statement's "argue for this" link prefills (and links) the
  // conclusion to that existing statement.
  const initialConclusion = conclusion
    ? await prisma.statement.findUnique({
        where: { id: conclusion },
        select: { id: true, canonicalText: true },
      })
    : null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="serif mb-1 text-2xl font-bold">New argument</h1>
      <p className="mb-6 text-sm text-muted">
        Write a conclusion and its premises. Each claim becomes a shared statement — reuse an
        existing one when it matches. Deductive, fully formalized arguments get a resolution proof
        automatically.
      </p>
      <Card>
        <ArgumentBuilder
          initialConclusion={
            initialConclusion
              ? { id: initialConclusion.id, text: initialConclusion.canonicalText }
              : undefined
          }
        />
      </Card>
    </div>
  );
}
