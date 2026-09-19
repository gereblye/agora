import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { schemeLabel } from "@/lib/constants";
import { runArgumentProof } from "@/lib/argumentProof";
import { Card, Pill, SectionTitle } from "@/components/ui";
import { ResolutionDiagram } from "@/components/ResolutionDiagram";

export default async function ArgumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const argument = await prisma.argument.findUnique({
    where: { id },
    include: {
      conclusion: true,
      createdBy: true,
      premises: { include: { statement: true }, orderBy: { position: "asc" } },
    },
  });
  if (!argument) notFound();

  const outcome = runArgumentProof(argument);
  const verdict = outcome.status === "proved" ? outcome.verdict : null;
  const logic = outcome.status === "proved" ? outcome.logic : null;
  // Bind narrowed consts so discriminated-union narrowing survives inside JSX closures.
  const validProof = verdict && verdict.valid ? verdict : null;
  const countermodel = verdict && !verdict.valid && verdict.kind === "countermodel" ? verdict : null;
  const inconclusive =
    verdict && !verdict.valid && (verdict.kind === "saturated" || verdict.kind === "unknown")
      ? verdict
      : null;

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <Pill tone="neutral">{argument.inferenceType}</Pill>
          <span className="text-muted">{schemeLabel(argument.scheme)}</span>
        </div>
        <p className="text-sm text-muted">Argument for</p>
        <h1 className="serif text-2xl font-bold leading-tight">
          <Link href={`/statements/${argument.conclusion.id}`} className="hover:underline">
            {argument.conclusion.canonicalText}
          </Link>
        </h1>
      </div>

      {/* Premises → conclusion */}
      <Card>
        <ul className="space-y-2">
          {argument.premises.map((p, i) => (
            <li key={p.statementId} className="flex gap-3">
              <span className="text-accent">P{i + 1}</span>
              <Link href={`/statements/${p.statement.id}`} className="hover:underline">
                {p.statement.canonicalText}
                {p.statement.formalization && (
                  <span className="ml-2 font-mono text-xs text-muted">{p.statement.formalization}</span>
                )}
              </Link>
            </li>
          ))}
          <li className="flex gap-3 border-t border-line pt-2 font-medium">
            <span className="text-accent">∴</span>
            <span>
              {argument.conclusion.canonicalText}
              {argument.conclusion.formalization && (
                <span className="ml-2 font-mono text-xs text-muted">{argument.conclusion.formalization}</span>
              )}
            </span>
          </li>
        </ul>
      </Card>

      {/* Resolution proof / verdict */}
      <section>
        <SectionTitle>Resolution proof</SectionTitle>

        {outcome.status === "not-deductive" && (
          <Card>
            <p className="text-sm text-muted">
              This is a <strong className="text-ink">defeasible</strong> argument
              ({schemeLabel(argument.scheme)}), so classical resolution does not apply. Its strength
              is assessed by the scheme&apos;s <em>critical questions</em> — each unanswered one
              becomes a potential counter-argument (planned for Phase 3).
            </p>
          </Card>
        )}

        {outcome.status === "not-formalized" && (
          <Card>
            <p className="text-sm text-muted">
              A resolution proof needs every premise and the conclusion formalized (Level 1+).
              {" "}
              <strong className="text-ink">{outcome.missing}</strong> statement(s) here still lack a
              propositional form. Add one on each statement page to unlock the proof.
            </p>
          </Card>
        )}

        {outcome.status === "error" && (
          <Card>
            <p className="text-sm text-[var(--against)]">Could not parse the formalization: {outcome.message}</p>
          </Card>
        )}

        {validProof && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Pill tone="for">valid ✓</Pill>
              <Pill tone="neutral">{logic === "first-order" ? "first-order" : "propositional"}</Pill>
              <span className="text-sm text-muted">
                The premises entail the conclusion — negating it and resolving derives the empty
                clause □{logic === "first-order" ? " (unifying variables at each step)" : ""}.
              </span>
            </div>
            <ResolutionDiagram proof={validProof.nodes} />
            <Card>
              <h3 className="mb-2 text-sm font-semibold">Refutation steps</h3>
              <ol className="space-y-1 font-mono text-xs">
                {validProof.nodes
                  .filter((n) => n.source === "resolvent")
                  .map((n) => (
                    <li key={n.id}>
                      {n.clause.length === 0 ? "□" : n.label}
                      <span className="text-muted">
                        {"  "}from [{n.parents.join(", ")}]{n.on ? ` on ${n.on}` : ""}
                      </span>
                    </li>
                  ))}
              </ol>
            </Card>
          </div>
        )}

        {countermodel && (
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Pill tone="against">invalid ✗</Pill>
              <span className="text-sm text-muted">
                No refutation exists. The assignment below satisfies every premise but makes the
                conclusion false — a countermodel.
              </span>
            </div>
            <table className="text-sm">
              <tbody>
                {countermodel.atoms.map((a) => (
                  <tr key={a}>
                    <td className="pr-4 font-mono">{a}</td>
                    <td className={countermodel.countermodel[a] ? "text-[var(--for)]" : "text-[var(--against)]"}>
                      {countermodel.countermodel[a] ? "true" : "false"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {inconclusive && (
          <Card>
            {inconclusive.kind === "saturated" ? (
              <div className="flex items-center gap-2">
                <Pill tone="against">invalid ✗</Pill>
                <span className="text-sm text-muted">
                  Resolution ran to completion without deriving □ — the first-order premises do not
                  entail the conclusion.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Pill tone="accent">inconclusive</Pill>
                <span className="text-sm text-muted">
                  The proof search hit its resource bound before terminating. First-order validity is
                  only semi-decidable, so no verdict is reported rather than a false one (PLAN §9).
                </span>
              </div>
            )}
          </Card>
        )}
      </section>
    </div>
  );
}
