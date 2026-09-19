import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui";
import { MergePicker } from "@/components/MergePicker";

export default async function MergeStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const statement = await prisma.statement.findUnique({ where: { id } });
  if (!statement) notFound();
  if (statement.status === "merged" && statement.mergedIntoId) {
    redirect(`/statements/${statement.mergedIntoId}`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="serif mb-1 text-2xl font-bold">Merge duplicate</h1>
        <p className="text-sm text-muted">
          Fold this statement into an existing canonical one so the graph shares a single node
          (PLAN §3.1).
        </p>
      </div>

      <Card>
        <p className="text-xs uppercase tracking-wide text-muted">Duplicate to fold in</p>
        <p className="mt-1 font-medium">{statement.canonicalText}</p>
        <Link href={`/statements/${id}`} className="mt-2 inline-block text-xs underline text-muted">
          ← back to statement
        </Link>
      </Card>

      <Card>
        <MergePicker dupId={id} dupText={statement.canonicalText} />
      </Card>
    </div>
  );
}
