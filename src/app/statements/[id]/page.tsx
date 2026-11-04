import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics";
import { schemeLabel, STATEMENT_LEVELS } from "@/lib/constants";
import { addCitation } from "@/lib/actions";
import { CredenceBar, Meter, Pill, Card, SectionTitle } from "@/components/ui";
import { VoteButtons } from "@/components/VoteButtons";

type ArgWithConclusion = {
  id: string;
  scheme: string;
  inferenceType: string;
  validityStatus: string;
  premises: { statement: { id: string; canonicalText: string } }[];
  conclusion: { canonicalText: string };
};

function ValidityPill({ status }: { status: string }) {
  if (status === "valid") return <Pill tone="for">valid ✓</Pill>;
  if (status === "invalid") return <Pill tone="against">invalid ✗</Pill>;
  if (status === "unchecked") return <Pill tone="accent">not checked</Pill>;
  return null;
}

function ArgumentCard({ arg }: { arg: ArgWithConclusion }) {
  return (
    <Link
      href={`/arguments/${arg.id}`}
      className="block rounded-lg border border-line bg-surface p-4 hover:border-accent"
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-muted">
        <Pill tone="neutral">{arg.inferenceType}</Pill>
        <span>{schemeLabel(arg.scheme)}</span>
        <ValidityPill status={arg.validityStatus} />
      </div>
      <ul className="space-y-1 text-sm">
        {arg.premises.map((p) => (
          <li key={p.statement.id} className="text-muted">
            <span className="text-accent">P</span> {p.statement.canonicalText}
          </li>
        ))}
        <li className="border-t border-line pt-1 font-medium">
          <span className="text-accent">∴</span> {arg.conclusion.canonicalText}
        </li>
      </ul>
    </Link>
  );
}

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const statement = await prisma.statement.findUnique({
    where: { id },
    include: {
      topics: true,
      createdBy: true,
      negationOf: true,
      negatedBy: true,
      surfaceForms: true,
      citations: { orderBy: { strength: "desc" } },
      empiricalReports: { include: { author: true } },
      // Arguments discarded during a merge are soft-deleted (status "deprecated")
      // and must not appear here or in the premise-usage list.
      concludes: {
        where: { status: { not: "deprecated" } },
        include: { premises: { include: { statement: true } }, conclusion: true },
      },
      premiseIn: {
        where: { argument: { status: { not: "deprecated" } } },
        include: { argument: { include: { conclusion: true, premises: { include: { statement: true } } } } },
      },
    },
  });
  if (!statement) notFound();
  // A merged duplicate redirects to its canonical statement (PLAN §3.1).
  if (statement.status === "merged" && statement.mergedIntoId) {
    redirect(`/statements/${statement.mergedIntoId}`);
  }

  const metrics = await computeMetrics(id);
  const negationPartner = statement.negationOf ?? statement.negatedBy ?? null;
  const opposing = negationPartner
    ? await prisma.argument.findMany({
        where: { conclusionId: negationPartner.id, status: { not: "deprecated" } },
        include: { premises: { include: { statement: true } }, conclusion: true },
      })
    : [];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      {/* Main column */}
      <div className="space-y-8">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            {statement.topics.map((t) => (
              <Link key={t.id} href={`/topics/${t.slug}`}>
                <Pill tone="accent">{t.name}</Pill>
              </Link>
            ))}
            <Pill tone="neutral">{STATEMENT_LEVELS[statement.level]}</Pill>
          </div>
          <h1 className="serif text-3xl font-bold leading-tight">{statement.canonicalText}</h1>
          {statement.formalization && (
            <p className="mt-3 font-mono text-sm text-accent">{statement.formalization}</p>
          )}
          {statement.surfaceForms.length > 0 && (
            <p className="mt-2 text-sm text-muted">
              Also phrased as:{" "}
              {statement.surfaceForms.map((sf, i) => (
                <span key={sf.id}>
                  {i > 0 && "; "}
                  <span className="italic">“{sf.text}”</span>
                </span>
              ))}
            </p>
          )}
          {negationPartner && (
            <p className="mt-3 text-sm text-muted">
              Negation:{" "}
              <Link href={`/statements/${negationPartner.id}`} className="underline hover:text-ink">
                {negationPartner.canonicalText}
              </Link>
            </p>
          )}
        </div>

        {/* Arguments FOR */}
        <section>
          <SectionTitle>Arguments for this statement ({statement.concludes.length})</SectionTitle>
          <div className="space-y-3">
            {statement.concludes.map((a) => (
              <ArgumentCard key={a.id} arg={a} />
            ))}
            {statement.concludes.length === 0 && (
              <p className="text-sm text-muted">No arguments conclude this statement yet.</p>
            )}
          </div>
        </section>

        {/* Arguments AGAINST */}
        {opposing.length > 0 && (
          <section>
            <SectionTitle>Arguments against ({opposing.length})</SectionTitle>
            <div className="space-y-3">
              {opposing.map((a) => (
                <ArgumentCard key={a.id} arg={a} />
              ))}
            </div>
          </section>
        )}

        {/* Used as premise */}
        <section>
          <SectionTitle>Used as a premise in ({statement.premiseIn.length})</SectionTitle>
          <div className="space-y-3">
            {statement.premiseIn.map(({ argument }) => (
              <ArgumentCard key={argument.id} arg={argument} />
            ))}
            {statement.premiseIn.length === 0 && (
              <p className="text-sm text-muted">Not yet used as a premise in any argument.</p>
            )}
          </div>
        </section>

        {/* Epistemic bases */}
        <section>
          <SectionTitle>Epistemic bases</SectionTitle>
          <div className="space-y-4">
            <Card>
              <h3 className="mb-2 text-sm font-semibold">Citations ({statement.citations.length})</h3>
              {statement.citations.length === 0 && <p className="text-sm text-muted">None yet.</p>}
              <ul className="space-y-2">
                {statement.citations.map((c) => (
                  <li key={c.id} className="text-sm">
                    <span className="mr-2">
                      {c.stance === "support" ? (
                        <Pill tone="for">supports</Pill>
                      ) : (
                        <Pill tone="against">refutes</Pill>
                      )}
                    </span>
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noreferrer" className="underline">
                        {c.title}
                      </a>
                    ) : (
                      c.title
                    )}
                    {c.venue && <span className="text-muted"> — {c.venue}{c.year ? `, ${c.year}` : ""}</span>}
                  </li>
                ))}
              </ul>
              <form action={addCitation} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
                <input type="hidden" name="statementId" value={statement.id} />
                <input name="title" placeholder="Citation title" required className="flex-1 rounded-md border border-line px-2 py-1 text-sm" />
                <input name="url" placeholder="URL (optional)" className="w-40 rounded-md border border-line px-2 py-1 text-sm" />
                <select name="stance" className="rounded-md border border-line px-2 py-1 text-sm">
                  <option value="support">supports</option>
                  <option value="refute">refutes</option>
                </select>
                <button className="rounded-md bg-accent px-3 py-1 text-sm text-white">Add</button>
              </form>
            </Card>

            <Card>
              <h3 className="mb-2 text-sm font-semibold">
                Empirical experience ({statement.empiricalReports.length})
              </h3>
              {statement.empiricalReports.length === 0 && <p className="text-sm text-muted">None yet.</p>}
              <ul className="space-y-2">
                {statement.empiricalReports.map((r) => (
                  <li key={r.id} className="text-sm">
                    <span className="text-muted">@{r.author?.handle ?? "anon"}:</span> {r.description}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </section>
      </div>

      {/* Sidebar: metrics */}
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <div className="mb-4">
            <CredenceBar value={metrics.credence} />
          </div>
          <div className="space-y-3">
            <Meter label="controversy" value={metrics.controversy} />
            <div className="flex gap-2 pt-1">
              {metrics.grounded ? <Pill tone="for">grounded in evidence</Pill> : <Pill tone="neutral">ungrounded</Pill>}
            </div>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <VoteButtons
              statementId={statement.id}
              votesFor={metrics.votesFor}
              votesAgainst={metrics.votesAgainst}
            />
          </div>
        </Card>

        {/* Show its work */}
        <Card>
          <h3 className="mb-2 text-sm font-semibold">How this credence is derived</h3>
          {metrics.signals.length === 0 ? (
            <p className="text-sm text-muted">No signals yet — showing the neutral prior (50%).</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {metrics.signals.map((s) => (
                <li key={s.kind} className="flex items-baseline justify-between gap-2">
                  <span>
                    <span className="font-medium capitalize">{s.kind}</span>
                    <span className="text-muted"> — {s.note}</span>
                  </span>
                  <span className="tabular-nums text-muted">
                    {Math.round(s.score * 100)}% · w{s.weight.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Link
          href={`/arguments/new?conclusion=${statement.id}`}
          className="block rounded-lg border border-line bg-surface p-3 text-center text-sm hover:border-accent"
        >
          + Build an argument for this
        </Link>
        <Link
          href={`/statements/${statement.id}/merge`}
          className="block rounded-lg border border-line bg-surface p-3 text-center text-sm text-muted hover:border-accent"
        >
          ⇉ This is a duplicate — merge it
        </Link>
      </aside>
    </div>
  );
}
