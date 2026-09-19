import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function wipe() {
  await prisma.vote.deleteMany();
  await prisma.empiricalReport.deleteMany();
  await prisma.citation.deleteMany();
  await prisma.attack.deleteMany();
  await prisma.argumentPremise.deleteMany();
  await prisma.argument.deleteMany();
  await prisma.statement.updateMany({ data: { negationOfId: null } });
  await prisma.statement.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await wipe();

  // --- Users ---
  const you = await prisma.user.create({ data: { handle: "you" } });
  const voters = await Promise.all(
    ["alice", "bob", "carol", "dave", "erin", "frank", "grace"].map((handle) =>
      prisma.user.create({ data: { handle } })
    )
  );

  // --- Topics ---
  const philosophy = await prisma.topic.create({
    data: { slug: "philosophy", name: "Philosophy", blurb: "Metaphysics, ethics, logic, and mind." },
  });
  const science = await prisma.topic.create({
    data: { slug: "science", name: "Science", blurb: "Empirical claims and the evidence behind them." },
  });
  const politics = await prisma.topic.create({
    data: { slug: "politics", name: "Politics", blurb: "Policy, institutions, and value trade-offs." },
  });

  const mk = (
    canonicalText: string,
    topicId: string,
    opts: { formalization?: string; level?: number } = {}
  ) =>
    prisma.statement.create({
      data: {
        canonicalText,
        topics: { connect: { id: topicId } },
        formalization: opts.formalization ?? null,
        level: opts.level ?? 0,
        createdById: you.id,
      },
    });

  // === PHILOSOPHY: the classic syllogism (deductive but not propositionally formalizable → "needs formalization") ===
  const allMen = await mk("All men are mortal.", philosophy.id, {
    formalization: "all x (Man(x) -> Mortal(x))",
    level: 2,
  });
  const socMan = await mk("Socrates is a man.", philosophy.id, {
    formalization: "Man(socrates)",
    level: 2,
  });
  const socMortal = await mk("Socrates is mortal.", philosophy.id, {
    formalization: "Mortal(socrates)",
    level: 2,
  });
  await prisma.argument.create({
    data: {
      conclusionId: socMortal.id,
      scheme: "deductive",
      inferenceType: "deductive",
      validityStatus: "valid",
      createdById: you.id,
      premises: {
        create: [
          { statementId: allMen.id, position: 0 },
          { statementId: socMan.id, position: 1 },
        ],
      },
    },
  });

  // === SCIENCE: propositional resolution showcase (VALID) ===
  const rained = await mk("It rained last night.", science.id, { formalization: "rain", level: 1 });
  const rainImpliesWet = await mk("If it rained last night, the ground is wet.", science.id, {
    formalization: "rain -> wet",
    level: 1,
  });
  const wet = await mk("The ground is wet.", science.id, { formalization: "wet", level: 1 });
  await prisma.argument.create({
    data: {
      conclusionId: wet.id,
      scheme: "deductive",
      inferenceType: "deductive",
      validityStatus: "valid",
      createdById: you.id,
      premises: {
        create: [
          { statementId: rainImpliesWet.id, position: 0 },
          { statementId: rained.id, position: 1 },
        ],
      },
    },
  });
  // Same premises pool, INVALID inference (affirming the consequent) → countermodel.
  await prisma.argument.create({
    data: {
      conclusionId: rained.id,
      scheme: "deductive",
      inferenceType: "deductive",
      validityStatus: "invalid",
      createdById: you.id,
      premises: {
        create: [
          { statementId: rainImpliesWet.id, position: 0 },
          { statementId: wet.id, position: 1 },
        ],
      },
    },
  });
  await prisma.empiricalReport.create({
    data: {
      statementId: wet.id,
      authorId: voters[0].id,
      description: "Walked out this morning and the pavement and grass were clearly wet.",
      conditions: "Direct observation, ~7am local time.",
    },
  });

  // === SCIENCE: climate (defeasible, citation-backed, with a modeled negation) ===
  const co2Rising = await mk("Atmospheric CO₂ concentration is rising.", science.id);
  const co2Ghg = await mk("CO₂ is a greenhouse gas that traps outgoing infrared radiation.", science.id);
  const warming = await mk("Rising atmospheric CO₂ raises global mean surface temperature.", science.id);
  const notWarming = await prisma.statement.create({
    data: {
      canonicalText: "Rising atmospheric CO₂ does not raise global mean surface temperature.",
      topics: { connect: { id: science.id } },
      createdById: you.id,
      negationOfId: warming.id, // negation partner of `warming`
    },
  });
  await prisma.argument.create({
    data: {
      conclusionId: warming.id,
      scheme: "cause_to_effect",
      inferenceType: "defeasible",
      validityStatus: "na",
      createdById: you.id,
      premises: {
        create: [
          { statementId: co2Rising.id, position: 0 },
          { statementId: co2Ghg.id, position: 1 },
        ],
      },
    },
  });
  // A weak counter-argument for the negation (so `warming` shows an opposing line).
  const naturalCycles = await mk("Recent warming is explained by natural solar/ocean cycles alone.", science.id);
  await prisma.argument.create({
    data: {
      conclusionId: notWarming.id,
      scheme: "cause_to_effect",
      inferenceType: "defeasible",
      validityStatus: "na",
      createdById: you.id,
      premises: { create: [{ statementId: naturalCycles.id, position: 0 }] },
    },
  });

  // === POLITICS: controversial, split votes ===
  const carbonTax = await mk("A carbon tax reduces carbon emissions.", politics.id);
  const priceElastic = await mk("Demand for carbon-intensive goods is price-elastic.", politics.id);
  await prisma.argument.create({
    data: {
      conclusionId: carbonTax.id,
      scheme: "cause_to_effect",
      inferenceType: "defeasible",
      validityStatus: "na",
      createdById: you.id,
      premises: { create: [{ statementId: priceElastic.id, position: 0 }] },
    },
  });
  const regressive = await mk("A carbon tax is regressive, burdening low-income households most.", politics.id);
  await mk("Carbon tax revenue can be rebated as a per-capita dividend.", politics.id);
  // A deliberate near-duplicate of `carbonTax`, to demonstrate de-duplication/merge (PLAN §3.1).
  await mk("A carbon tax lowers carbon emissions.", politics.id);

  // --- Citations ---
  await prisma.citation.createMany({
    data: [
      { statementId: co2Rising.id, title: "Keeling Curve — Scripps CO₂ Program", url: "https://keelingcurve.ucsd.edu", venue: "Scripps Institution of Oceanography", year: 2024, stance: "support", strength: 0.95, addedById: you.id },
      { statementId: co2Ghg.id, title: "Radiative forcing of CO₂ (spectroscopic measurement)", venue: "Nature", year: 2015, stance: "support", strength: 0.9, addedById: you.id },
      { statementId: warming.id, title: "IPCC AR6, WG1, Summary for Policymakers", venue: "IPCC", year: 2021, stance: "support", strength: 0.9, addedById: you.id },
      { statementId: carbonTax.id, title: "Ex-post analysis of carbon pricing schemes", venue: "Journal of Environmental Economics", year: 2020, stance: "support", strength: 0.55, addedById: you.id },
    ],
  });

  // --- Votes ---
  const vote = (statementId: string, agree: number, disagree: number) => {
    const rows: { userId: string; statementId: string; value: number }[] = [];
    for (let i = 0; i < agree; i++) rows.push({ userId: voters[i % voters.length].id, statementId, value: 1 });
    for (let i = 0; i < disagree; i++) rows.push({ userId: voters[(voters.length - 1 - i) % voters.length].id, statementId, value: -1 });
    // avoid unique-collision by keeping agree+disagree <= voters.length
    return prisma.vote.createMany({ data: rows });
  };
  await vote(warming.id, 6, 1);
  await vote(carbonTax.id, 3, 4); // controversial
  await vote(regressive.id, 4, 3);
  await vote(socMortal.id, 5, 0);
  await vote(wet.id, 4, 0);

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
