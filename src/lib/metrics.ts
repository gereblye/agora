import { prisma } from "./db";

// Explainable credence + controversy for a statement (docs/PLAN.md §5).
//
// Design goals for this first implementation:
//  - Transparent: credence is a weighted blend of the *available* signals only,
//    and every contributing signal is returned so the UI can "show its work".
//  - Cycle-safe: circular support is broken by a path set and a depth bound; a
//    cycle contributes the neutral prior rather than exploding.
//  - Evolvable: this is the (a) "weighted aggregation + attack-discounting" model
//    from PLAN §3.4, shaped so it can grow toward probabilistic argumentation.

const NEUTRAL = 0.5;
const MAX_DEPTH = 8;

// Base weight of each signal kind in the blend.
const W = { votes: 0.35, citations: 0.4, argument: 0.6, experience: 0.15 };
// How much a deductive vs. defeasible inference passes through from its premises.
const INFERENCE_WEIGHT = { deductive: 1.0, defeasible: 0.85 } as const;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type Signal = { kind: string; score: number; weight: number; note: string };

export type StatementMetrics = {
  credence: number;
  controversy: number;
  grounded: boolean;
  votesFor: number;
  votesAgainst: number;
  citationSupport: number;
  citationRefute: number;
  supportingArguments: number;
  opposingArguments: number;
  signals: Signal[]; // the exact contributions that produced `credence`
};

type NodeResult = { credence: number; grounded: boolean };

// Recursive core: returns the blended credence for a statement and whether its
// support ultimately bottoms out in external evidence.
async function computeNode(
  statementId: string,
  path: Set<string>,
  depth: number
): Promise<NodeResult> {
  if (depth > MAX_DEPTH || path.has(statementId)) {
    return { credence: NEUTRAL, grounded: false }; // cycle / too deep → prior
  }
  const nextPath = new Set(path).add(statementId);
  const full = await gather(statementId, nextPath, depth);
  return { credence: full.credence, grounded: full.grounded };
}

async function gather(
  statementId: string,
  path: Set<string>,
  depth: number
): Promise<StatementMetrics> {
  const statement = await prisma.statement.findUnique({
    where: { id: statementId },
    include: {
      votes: true,
      citations: true,
      empiricalReports: true,
      negationOf: true,
      negatedBy: true,
      concludes: { include: { premises: true } },
    },
  });

  if (!statement) {
    return emptyMetrics();
  }

  const signals: Signal[] = [];

  // 1. User voting → argument from popular opinion.
  const votesFor = statement.votes.filter((v) => v.value > 0).length;
  const votesAgainst = statement.votes.filter((v) => v.value < 0).length;
  const totalVotes = votesFor + votesAgainst;
  if (totalVotes > 0) {
    const score = votesFor / totalVotes;
    const confidence = Math.min(1, totalVotes / 5); // more votes → more weight
    signals.push({
      kind: "votes",
      score,
      weight: W.votes * confidence,
      note: `${votesFor} for / ${votesAgainst} against`,
    });
  }

  // 2. Citations → argument from expert opinion.
  const citationSupport = statement.citations
    .filter((c) => c.stance === "support")
    .reduce((s, c) => s + c.strength, 0);
  const citationRefute = statement.citations
    .filter((c) => c.stance === "refute")
    .reduce((s, c) => s + c.strength, 0);
  const citationMass = citationSupport + citationRefute;
  if (citationMass > 0) {
    signals.push({
      kind: "citations",
      score: citationSupport / citationMass,
      weight: W.citations * Math.min(1, citationMass / 1.5),
      note: `${statement.citations.length} citation(s)`,
    });
  }

  // 3. Empirical experience → argument from perception (deliberately weak).
  if (statement.empiricalReports.length > 0) {
    signals.push({
      kind: "experience",
      score: 0.6,
      weight: W.experience * Math.min(1, statement.empiricalReports.length / 3),
      note: `${statement.empiricalReports.length} report(s)`,
    });
  }

  // 4. Supporting arguments (inference) minus attacking arguments.
  const supportStrengths = await argumentStrengths(statement.concludes, path, depth);
  const negationId = statement.negationOf?.id ?? statement.negatedBy?.id ?? null;
  const opposing = negationId
    ? await prisma.argument.findMany({
        where: { conclusionId: negationId },
        include: { premises: true },
      })
    : [];
  const attackStrengths = await argumentStrengths(opposing, path, depth);

  const bestSupport = supportStrengths.length ? Math.max(...supportStrengths) : 0;
  const bestAttack = attackStrengths.length ? Math.max(...attackStrengths) : 0;
  if (supportStrengths.length || attackStrengths.length) {
    // Centered at the prior; net argument strength moves it up or down.
    const score = clamp01(NEUTRAL + 0.5 * (bestSupport - bestAttack));
    signals.push({
      kind: "argument",
      score,
      weight: W.argument,
      note: `${supportStrengths.length} for / ${attackStrengths.length} against`,
    });
  }

  // Blend available signals (weighted average); prior if we have nothing.
  const totalWeight = signals.reduce((s, x) => s + x.weight, 0);
  const credence =
    totalWeight > 0
      ? signals.reduce((s, x) => s + x.score * x.weight, 0) / totalWeight
      : NEUTRAL;

  // Controversy: split votes and/or arguments on both sides.
  const voteControversy = totalVotes > 0 ? 1 - Math.abs(votesFor - votesAgainst) / totalVotes : 0;
  const bothSides = supportStrengths.length > 0 && attackStrengths.length > 0 ? 1 : 0;
  const controversy = clamp01(0.6 * voteControversy + 0.4 * bothSides);

  // Grounded: own external evidence, or a supporting argument whose premises are grounded.
  const hasOwnEvidence = statement.citations.length > 0 || statement.empiricalReports.length > 0;
  let grounded = hasOwnEvidence;
  if (!grounded) {
    for (const arg of statement.concludes) {
      if (arg.premises.length === 0) continue;
      const results = await Promise.all(
        arg.premises.map((p) => computeNode(p.statementId, path, depth + 1))
      );
      if (results.every((r) => r.grounded)) {
        grounded = true;
        break;
      }
    }
  }

  return {
    credence,
    controversy,
    grounded,
    votesFor,
    votesAgainst,
    citationSupport,
    citationRefute,
    supportingArguments: supportStrengths.length,
    opposingArguments: attackStrengths.length,
    signals,
  };
}

// Strength of each argument = how strongly its premises carry to the conclusion.
async function argumentStrengths(
  args: { inferenceType: string; premises: { statementId: string }[] }[],
  path: Set<string>,
  depth: number
): Promise<number[]> {
  const out: number[] = [];
  for (const arg of args) {
    if (arg.premises.length === 0) continue;
    const premiseCreds = await Promise.all(
      arg.premises.map((p) => computeNode(p.statementId, path, depth + 1).then((r) => r.credence))
    );
    const pass =
      arg.inferenceType === "deductive"
        ? INFERENCE_WEIGHT.deductive
        : INFERENCE_WEIGHT.defeasible;
    // Deductive: as strong as the weakest premise. Defeasible: average, discounted.
    const aggregate =
      arg.inferenceType === "deductive"
        ? Math.min(...premiseCreds)
        : premiseCreds.reduce((s, c) => s + c, 0) / premiseCreds.length;
    out.push(clamp01(aggregate * pass));
  }
  return out;
}

function emptyMetrics(): StatementMetrics {
  return {
    credence: NEUTRAL,
    controversy: 0,
    grounded: false,
    votesFor: 0,
    votesAgainst: 0,
    citationSupport: 0,
    citationRefute: 0,
    supportingArguments: 0,
    opposingArguments: 0,
    signals: [],
  };
}

/** Public entry point: full, explainable metrics for one statement. */
export function computeMetrics(statementId: string): Promise<StatementMetrics> {
  return gather(statementId, new Set(), 0);
}
