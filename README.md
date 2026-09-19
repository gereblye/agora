# Agora

A platform for building, sharing, and evaluating **logically formalizable arguments** across
philosophy, science, and politics. Statements are shared nodes in a knowledge graph; arguments are
inferences between them; every claim shows its epistemic basis; and every formalized deductive
argument carries a machine-checked **resolution proof**.

See [`docs/PLAN.md`](docs/PLAN.md) for the full design.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **Prisma 6** — SQLite for local dev (zero setup), portable to Postgres for production
- **@xyflow/react** (React Flow) for the resolution-proof diagram
- An in-house **propositional resolution prover** (`src/lib/logic/resolution.ts`) — no deps

## Getting started

```bash
npm install
npm run db:reset   # creates the SQLite db and loads seed data
npm run dev        # http://localhost:3000
```

Other scripts: `npm run db:seed`, `npm run db:studio`, `npm run build`.

## What's implemented (Phase 0 + parts of Phase 1 & 3)

- **Data model** (`prisma/schema.prisma`) — statements, arguments, premises, negation/attacks, and
  the four epistemic bases (citations, votes, empirical reports, inference).
- **Statement page** — metrics with an explainable credence breakdown, voting, arguments for /
  against / using-as-premise, and the epistemic bases.
- **Argument page** — premises → conclusion, plus the **resolution graph**:
  - **propositional** (Level 1) refutation — CNF → resolve → □ — with a React Flow diagram and step
    list, and a **countermodel** for invalid arguments;
  - **first-order** (Level 2) refutation — unification (MGU + occurs-check) and Skolemization — so
    predicate arguments like the Socrates syllogism get a real proof graph; invalid arguments report
    "invalid" (search saturated) or "inconclusive" (hit the resource bound), since FOL validity is
    only semi-decidable;
  - graceful states for defeasible or not-yet-formalized arguments.
- **Metrics engine** (`src/lib/metrics.ts`) — weighted, cycle-safe, explainable credence +
  controversy + groundedness.
- **Authoring** — create statements (with optional formalization) and arguments; cast votes; add
  citations.
- **De-duplication / merge** (PLAN §3.1) — a dependency-free similarity engine
  (`src/lib/similarity.ts`) powers search-before-create typeahead and duplicate warnings on the new
  statement form, plus a merge tool that folds a duplicate into a canonical statement — repointing
  every argument, citation, vote, and experience report, resolving unique-constraint conflicts, and
  keeping the old phrasing as a surface form. Merged statements redirect to their canonical.

## Key source files

| Path | Purpose |
|---|---|
| `src/lib/logic/resolution.ts` | Propositional CNF + resolution prover, emits the proof object |
| `src/lib/logic/resolutionFol.ts` | First-order resolution: unification, Skolemization, CNF |
| `src/lib/metrics.ts` | Explainable credence / controversy / groundedness |
| `src/lib/argumentProof.ts` | Runs the prover for a stored argument |
| `src/lib/similarity.ts` | Dependency-free near-duplicate detection (cosine + trigram) |
| `src/lib/merge.ts` | Merge a duplicate into a canonical, repointing all references |
| `src/lib/actions.ts` | Server actions (vote, create statement/argument, add citation, merge) |
| `src/components/ResolutionDiagram.tsx` | React Flow rendering of the refutation DAG |

## Not yet built (see roadmap in PLAN §12)

Auth, argumentation-scheme critical questions, centrality/defensibility/robustness metrics,
moderation, and embedding-based semantic search
(the current similarity engine is lexical; `src/lib/similarity.ts` is the seam where pgvector +
sentence embeddings would slot in).

## Notes

- Dev uses SQLite. For Postgres, change the `datasource` provider in `prisma/schema.prisma` to
  `postgresql` and point `DATABASE_URL` at a Postgres instance.
- There is no auth yet; all contributions run as a single demo user (`src/lib/currentUser.ts`).
