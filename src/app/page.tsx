import Link from "next/link";
import { prisma } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics";
import { StatementRow, Card } from "@/components/ui";

export default async function HomePage() {
  const topics = await prisma.topic.findMany({
    where: { parentId: null },
    include: { _count: { select: { statements: true } } },
    orderBy: { name: "asc" },
  });

  const statements = await prisma.statement.findMany({
    where: { status: { not: "merged" } },
    include: { _count: { select: { concludes: true, premiseIn: true } } },
  });
  const withMetrics = await Promise.all(
    statements.map(async (s) => ({ s, m: await computeMetrics(s.id) }))
  );
  // "Notable" = most connected, then most confident.
  const featured = withMetrics
    .sort(
      (a, b) =>
        b.s._count.concludes + b.s._count.premiseIn - (a.s._count.concludes + a.s._count.premiseIn) ||
        b.m.credence - a.m.credence
    )
    .slice(0, 6);

  return (
    <div className="space-y-10">
      <section className="max-w-2xl">
        <h1 className="serif text-4xl font-bold leading-tight">
          Reasoning, made into a structure you can inspect.
        </h1>
        <p className="mt-4 text-lg text-muted">
          Agora is a knowledge graph of <strong className="text-ink">statements</strong> and the{" "}
          <strong className="text-ink">arguments</strong> that connect them. Every claim shows its
          epistemic basis — citations, votes, experience, and inference — and every formalized
          deductive argument carries a machine-checked resolution proof.
        </p>
      </section>

      <section>
        <div className="grid gap-4 sm:grid-cols-3">
          {topics.map((t) => (
            <Link key={t.id} href={`/topics/${t.slug}`}>
              <Card className="h-full transition-colors hover:border-accent">
                <h2 className="serif text-xl font-bold">{t.name}</h2>
                <p className="mt-1 text-sm text-muted">{t.blurb}</p>
                <p className="mt-4 text-xs text-muted">{t._count.statements} statements</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="serif mb-4 text-lg font-bold">Notable statements</h2>
        <div className="space-y-3">
          {featured.map(({ s, m }) => (
            <StatementRow key={s.id} id={s.id} text={s.canonicalText} metrics={m} />
          ))}
        </div>
      </section>
    </div>
  );
}
