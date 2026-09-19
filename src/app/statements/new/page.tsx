import { prisma } from "@/lib/db";
import { Card } from "@/components/ui";
import { STATEMENT_LEVELS } from "@/lib/constants";
import { NewStatementForm } from "@/components/NewStatementForm";

export default async function NewStatementPage() {
  const topics = await prisma.topic.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="serif mb-1 text-2xl font-bold">New statement</h1>
      <p className="mb-6 text-sm text-muted">
        A statement is an atomic, truth-apt claim. Search first — the same claim should be one shared
        node (see PLAN §3.1). Formalization is optional and unlocks resolution proofs.
      </p>
      <Card>
        <NewStatementForm
          topics={topics.map((t) => ({ id: t.id, name: t.name }))}
          levels={Object.entries(STATEMENT_LEVELS)}
        />
      </Card>
    </div>
  );
}
