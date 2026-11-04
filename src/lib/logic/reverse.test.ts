// Phase A tests for the reverse-resolution recommender.
//
// Self-contained; run with `npm run test:logic` (tsx, no test framework).
// The central invariant: every set `synthesizePremiseSets` returns must pass the
// real prover — generation is heuristic, soundness is not. These also pin the
// named schemes each conclusion shape should offer.

import { synthesizePremiseSets } from "./reverseResolution";
import { verifyEntails } from "./formula";

let passed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++;
  else failures.push(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---- 1. Round-trip soundness: every returned set re-verifies as valid. ----
const corpus = [
  "wet",
  "Mortal(socrates)",
  "p -> r",
  "a & b",
  "~p",
  "Loves(alice, bob)",
  "rain -> wet",
  "p | q",
];
for (const concl of corpus) {
  const sets = synthesizePremiseSets(concl);
  check(`[${concl}] yields recommendations`, sets.length > 0, `got ${sets.length}`);
  for (const s of sets) {
    const formulas = s.premises.map((p) => p.formula);
    const v = verifyEntails(formulas, concl);
    check(
      `[${concl}] set "${s.schemeId}" re-verifies`,
      v.valid,
      `premises: ${formulas.join("  ;  ")}`
    );
    check(
      `[${concl}] set "${s.schemeId}" carries a proof DAG`,
      s.proofNodes.length > 0
    );
  }
}

// ---- 2. Golden: each conclusion shape offers its characteristic scheme. ----
const golden: [string, string][] = [
  ["Mortal(socrates)", "syllogism"],
  ["wet", "modus_ponens"],
  ["p -> r", "hypothetical_syllogism"],
  ["a & b", "conjunction_intro"],
  ["~p", "modus_tollens"],
];
for (const [concl, scheme] of golden) {
  const ids = synthesizePremiseSets(concl).map((s) => s.schemeId);
  check(`[${concl}] offers ${scheme}`, ids.includes(scheme), `got [${ids.join(", ")}]`);
}

// ---- 3. Begging-the-question guard: conclusion never recommended verbatim. ----
for (const concl of ["wet", "Mortal(socrates)"]) {
  const anyEqual = synthesizePremiseSets(concl).some((s) =>
    s.premises.some((p) => p.formula.trim() === concl.trim())
  );
  check(`[${concl}] no premise equals the conclusion`, !anyEqual);
}

// ---- 4. Unparseable conclusion → no recommendations (graceful). ----
check(`unparseable → []`, synthesizePremiseSets("(((").length === 0);
check(`empty → []`, synthesizePremiseSets("").length === 0);

// ---- 5. Hole-fill: naming a placeholder still yields a valid argument. ----
{
  const concl = "Mortal(socrates)";
  const syl = synthesizePremiseSets(concl).find((s) => s.schemeId === "syllogism");
  check(`syllogism present for hole-fill test`, Boolean(syl));
  if (syl) {
    const holeIds = [...new Set(syl.premises.flatMap((p) => p.holes.map((h) => h.id)))];
    check(`syllogism introduces exactly one hole`, holeIds.length === 1, `got ${holeIds.length}`);
    const id = holeIds[0];
    const filled = syl.premises.map((p) =>
      p.formula.replace(new RegExp(`\\b${id}\\b`, "g"), "Man")
    );
    const v = verifyEntails(filled, concl);
    check(`filled syllogism ("${filled.join("  ;  ")}") is valid`, v.valid);
  }
}

// ---- report ----
console.log(`\n${passed} checks passed, ${failures.length} failed.`);
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("All reverse-resolution Phase A checks passed. ✓");
