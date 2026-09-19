import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics";
import { StatementRow } from "@/components/ui";

export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const topic = await prisma.topic.findUnique({
    where: { slug },
    include: { statements: { where: { status: { not: "merged" } } } },
  });
  if (!topic) notFound();

  const rows = await Promise.all(
    topic.statements.map(async (s) => ({ s, m: await computeMetrics(s.id) }))
  );
  rows.sort((a, b) => b.m.credence - a.m.credence);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="serif text-3xl font-bold">{topic.name}</h1>
        {topic.blurb && <p className="mt-1 text-muted">{topic.blurb}</p>}
      </div>
      <div className="space-y-3">
        {rows.map(({ s, m }) => (
          <StatementRow key={s.id} id={s.id} text={s.canonicalText} metrics={m} />
        ))}
        {rows.length === 0 && <p className="text-muted">No statements in this topic yet.</p>}
      </div>
    </div>
  );
}
