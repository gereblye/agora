# Agora — Application Plan

*A platform for building, sharing, and evaluating logically formalizable arguments across philosophy, science, and politics.*

---

## 1. Vision & Scope

Agora is a collaborative, wiki-like knowledge graph where the nodes are **statements** (truth-apt claims) and the edges are **arguments** (inferences from premises to a conclusion). Unlike a debate forum, Agora treats the argument corpus as a *structured, computable object*: every claim carries an explicit epistemic basis, every argument has a formalizable inference structure, and the platform continuously computes metrics (how believable, how contested, how central, how well-grounded a statement is) from the graph as a whole.

The goal is not to "win debates" but to make the *structure of reasoning* on a topic legible: what depends on what, where the load-bearing assumptions are, what the evidence actually is, and where reasonable people diverge and why.

### Design principles
- **Statements are shared nodes.** The same claim used in ten arguments is one object. This is what makes the corpus a graph and not a pile of essays. Statement identity is therefore the single most important (and hardest) problem — see §3.1.
- **Every claim shows its warrant.** Nothing is asserted without a visible epistemic basis (citation, vote, experience, or supporting argument).
- **Reasoning is formalizable, not necessarily formal.** We support a spectrum from natural-language claims to fully formalized propositional/predicate structures. Formalization is progressive enrichment, never a barrier to contributing.
- **Metrics are transparent and explainable.** A credence score is worthless if a user can't see how it was derived. Every metric must be able to "show its work."
- **Deductive arguments carry machine-checkable proofs.** A formalized argument's validity is established by **resolution refutation** (§6), and the proof is shown to the user step by step — not asserted.
- **Disagreement is first-class.** Counterarguments, rebuttals, and contradiction are modeled, not hidden; whether a claim survives its attacks is the **defensibility** metric (§5).

---

## 2. Core Concepts & Domain Model

### 2.1 Statement
An atomic, truth-apt proposition — e.g. *"Increasing atmospheric CO₂ raises global mean temperature."*

- **Natural-language text** (required, the canonical human-readable form).
- **Formalization** (optional, progressive): a propositional atom, or a predicate-logic form with typed entities/relations.
- **Negation link**: an explicit pointer to the statement's negation (see §3.2). This is what turns "support" into a full argumentation framework.
- **Epistemic bases** (§2.3): the heterogeneous sources of warrant.
- **Metrics** (§5): computed, cached, and recomputed as the graph changes.
- **Topic(s)/tags** and provenance (author, version history).

### 2.2 Argument
A set of **premise** statements plus one **conclusion** statement, together with an **inference structure**.

- **Identified by its conclusion** (per the brief): an argument's page is organized around what it concludes, and a statement page lists "arguments for" (where it is the conclusion) and "arguments used in" (where it is a premise). Note that *many* arguments can share a conclusion — these are independent lines of support — so an argument still needs its own stable ID; "identified by conclusion" governs presentation and naming, not uniqueness.
- **Inference type**: `deductive` (truth-preserving if valid), or `defeasible` (inductive/abductive/presumptive — the premises *raise* the credence of the conclusion but don't guarantee it).
- **Argumentation scheme** (§2.4): the named pattern the argument instantiates, which drives validity checking and generates the standard counterarguments.
- **Validity status**: for deductive arguments, whether the form is valid (checkable, see §9); for defeasible ones, which critical questions have been raised/answered.

### 2.3 Epistemological bases (the warrant for a statement)
A statement draws warrant from four heterogeneous source types. The key insight of this plan is that **all four are unifiable as argument types** (see §2.4), which lets a single metrics engine handle them:

| Basis | Nature | Underlying scheme |
|---|---|---|
| **Citations** from scientific literature | External references (DOI, URL, metadata), each with a *stance* (supports / refutes) and a *strength* (venue, replication, methodology) | Argument from expert opinion / authority |
| **User voting** | Aggregate crowd credence with polarization data | Argument from popular opinion / consensus |
| **Empirical experience** | User-reported first-person observations / anecdata (explicitly lower-weight, flagged as such) | Argument from perception / example |
| **Other arguments** | The statement is the conclusion of one or more on-platform arguments | Deductive / defeasible inference |

### 2.4 The unifying theory: argumentation schemes
Rather than four ad-hoc "basis" mechanisms, model everything as **Waltonian argumentation schemes** — named inference patterns, each with a set of **critical questions** whose unanswered instances *become* counterarguments. This is the conceptual spine of the whole system:

- Argument from expert opinion → CQ: *Is the source an expert in this field? Is the field reliable? Do other experts disagree?*
- Argument from popular opinion → CQ: *Is the majority actually informed? Is popularity evidence here?*
- Argument from perception → CQ: *Were the conditions reliable? Is the report corroborated?*
- Deductive schemes (modus ponens, syllogism, …) → CQ: *Are the premises true? Is the form valid?*

This gives us, for free: (a) a taxonomy for classifying every basis and argument, (b) an automatic generator of the "attack surface" of any claim, and (c) a principled way to weight heterogeneous evidence in the metrics engine.

---

## 3. Key Design Decisions & Hard Problems

These are the decisions that determine whether Agora is a coherent system or a bag of features. Each lists a recommendation.

### 3.1 Statement identity & canonicalization *(the central problem)*
Because statements are shared nodes, two users writing *"Vaccines are safe"* and *"Vaccines do not cause harm"* must be able to converge on one node — otherwise the graph fragments into disconnected near-duplicates and every metric is meaningless. Strategies, layered:
1. **Search-before-create**: aggressive typeahead search when authoring a new statement, surfacing existing similar claims.
2. **Semantic similarity**: embed statement text (vector search) and warn on near-duplicates at creation time.
3. **Merge / alias mechanism**: community-driven merging of duplicates, with a redirect/alias so old references stay valid.
4. **Canonical vs. surface forms**: allow multiple phrasings ("surface forms") to attach to one canonical statement.
**Recommendation:** ship (1) from day one; add (2) in Phase 1; treat (3)/(4) as core Phase 5 collaboration work. Under-investing here is the primary failure mode for the project.

### 3.2 Negation, contradiction & counterarguments
Support alone can't express disagreement. Model an explicit **negation** relation between a statement and its negation, plus a general **contradiction** relation for mutually-exclusive claims. Then:
- "Arguments against S" = "arguments for ¬S."
- Two arguments **attack** each other when their conclusions contradict, or when one argument's conclusion negates a premise of another (rebuttal vs. undercut).
This turns the corpus into a **bipolar argumentation framework** (support + attack), which is what makes "resolution" meaningful.
**Recommendation:** include negation/attack in the core model from Phase 1. Retrofitting it later would require reworking the metrics engine and the diagrams.

### 3.3 How formal is "formalizable"?
Full first-order logic is too heavy a bar for contributors and too hard to check at scale. **Recommendation:** support a *spectrum*:
- **Level 0** — natural language only (always allowed).
- **Level 1** — propositional structure: statements as atoms, arguments tagged with a scheme; propositional validity is checkable (§9).
- **Level 2** — light predicate structure: typed entities/relations for syllogistic and quantified forms, checkable for a bounded fragment.
Formalization is opt-in enrichment that *raises* a statement's metrics (it's more rigorous), never a gate to participation.

### 3.4 Credence & metrics model
Options, in increasing sophistication: (a) transparent weighted aggregation of bases → [0,1]; (b) full Bayesian network over the statement graph; (c) probabilistic / weighted bipolar argumentation; (d) Dung-style qualitative extensions (accepted/rejected/undecided) with a numeric layer on top.
**Recommendation:** start with **(a) explainable weighted aggregation + attack-discounting**, designed so it can evolve toward **(c)**. Never ship a black-box score. Every credence must expand into the exact contributions that produced it. Full Bayesian nets (b) are seductive but require priors and conditional tables the crowd can't realistically supply.

### 3.5 Cycles & circular support
Users *will* create cycles (A supports B supports A). Options: forbid cycles (reject the edge), or tolerate them and compute metrics via an iterative fixpoint (as PageRank and argumentation semantics do). **Recommendation:** allow cycles but detect and *flag* them (circularity is a quality signal, and flagging it is itself valuable), and compute credence via damped iteration to a fixpoint so cycles converge instead of exploding.

---

## 4. Data Model (initial schema)

Relational (Postgres). Graph traversal via recursive CTEs; revisit a graph DB only if traversal becomes the bottleneck.

```
users(id, handle, email, reputation, created_at, roles)

topics(id, slug, name, parent_id)                      -- philosophy/science/politics + subtopics

statements(id, canonical_text, formalization_json, level,
           negation_of_id NULL, created_by, created_at, status)
statement_topics(statement_id, topic_id)
statement_surface_forms(id, statement_id, text)        -- alternate phrasings
statement_versions(id, statement_id, text, editor_id, edited_at, diff)
statement_aliases(from_id, to_id)                      -- merge redirects

arguments(id, conclusion_id, scheme, inference_type,   -- deductive|defeasible
          validity_status, created_by, created_at, status)
argument_premises(argument_id, statement_id, position)

-- attacks are largely DERIVED from contradicting conclusions/premises,
-- but an explicit table lets users assert undercuts/rebuttals directly:
attacks(id, from_argument_id, target_kind, target_id,  -- target: argument|premise
        attack_kind)                                   -- rebut|undercut|undermine
contradictions(statement_a_id, statement_b_id)

-- Epistemic bases:
citations(id, statement_id, doi, url, title, venue, year,
          stance, strength, added_by)                  -- stance: support|refute
votes(user_id, statement_id, value, weight, created_at)
empirical_reports(id, statement_id, author_id, description,
                  conditions, corroborations, created_at)

metrics(statement_id, credence, controversy, centrality,
        groundedness, defensibility, robustness, computed_at)  -- cache
```

Notes:
- `status` fields carry the moderation/quality lifecycle (draft → published → flagged → merged/deprecated).
- `metrics` is a materialized cache, recomputed incrementally on change (§5.4).

---

## 5. Metrics (precise definitions)

Every metric must be **explainable** (drillable into its inputs) and **incrementally recomputable**.

- **Credence** `∈ [0,1]` — aggregate probability-of-truth. Weighted combination of: net supporting-argument strength (recursively, from premise credences × inference strength), citation support minus refutation, vote consensus, and (down-weighted) empirical reports. Discounted by successful attacks (§3.2). Computed via damped fixpoint iteration over the graph to handle cycles (§3.5).
- **Controversy / polarization** — dispersion of the *distribution* of belief (vote variance/bimodality + presence of strong arguments on both sides). High controversy ≠ low credence; a claim can be 50/50 *or* firmly settled-but-noisy.
- **Centrality / influence** — how much of the graph depends on this statement (PageRank-style over the "used as premise" edges). Identifies load-bearing assumptions.
- **Groundedness** — fraction of the statement's support tree that bottoms out in external evidence (citations/experience) vs. floating on other unproven claims. Detects castles-in-the-air.
- **Defensibility** — does the statement survive its attacks under an argumentation semantics (grounded/preferred extension)? A qualitative accepted / rejected / undecided label complementing the numeric credence.
- **Robustness** — sensitivity of credence to removing any single premise or basis. Low robustness = one weak link holds it up.
- **Contestation / activity** — recent editing, voting, and argument churn (for surfacing "hot" claims).

### 5.4 Computation strategy
- Store a cached `metrics` row per statement.
- On any change (new vote, citation, argument, edit), enqueue recomputation of the affected statement and propagate to its **dependents** (statements that use it as a premise), transitively, with a damped fixpoint and a convergence threshold.
- Batch/debounce hot statements; expose "last computed at" for transparency.

---

## 6. The Resolution Proof (the argument diagram)

The brief's "diagram showing the resolution process of the argument" is a **resolution refutation proof** — the classical automated-theorem-proving method — rendered step by step. This is the literal, machine-checkable proof that the premises entail the conclusion.

### 6.1 The procedure
For a formalized (Level 1/2) argument with premises `P₁…Pₙ` and conclusion `C`:
1. **Negate the conclusion** and add it to the premise set: `{P₁, …, Pₙ, ¬C}`.
2. **Convert to CNF** (clause form). Level 2 (predicate) additionally requires prenex normal form, **Skolemization** of existentials, and dropping universal quantifiers.
3. **Resolve**: repeatedly pick two clauses containing complementary literals and produce their **resolvent** (the union of the remaining literals), using **unification** in the first-order case.
4. **Terminate** when the **empty clause `□`** is derived — this shows `{P₁…Pₙ, ¬C}` is unsatisfiable, i.e. `P₁ ∧ … ∧ Pₙ ⊨ C`. The argument is **deductively valid**.

### 6.2 The diagram
Visualize the refutation as a DAG:
- **Leaf nodes** = the input clauses (CNF of the premises, plus the negated conclusion, visually distinguished).
- **Internal nodes** = resolvents; each has exactly two parents (the clauses resolved) and is annotated with the **complementary literal pair eliminated** (and the unifying substitution in the FOL case).
- **Root** = the empty clause `□`.
Reading the DAG top-down shows exactly how the contradiction (and hence the entailment) is built, one resolution step at a time. This *is* "the resolution process of the argument."

### 6.3 When there is no proof
If the argument is **invalid**, no refutation exists — the search terminates without `□` (or saturates). In that case show a **countermodel**: a satisfying assignment (propositional) or a Herbrand model fragment (FOL) of `{P₁…Pₙ, ¬C}`, which concretely demonstrates *why* the premises don't entail the conclusion. This is far more instructive to a contributor than a bare "invalid."

### 6.4 Scope & the non-deductive case
Resolution is a **classical, deductive** method — it applies only to formalized deductive arguments. It does **not** apply to defeasible arguments (expert opinion, popular opinion, perception, induction): classical entailment isn't the right notion for them. Those instead carry their **argumentation scheme + critical questions** (§2.4, §9) and, for navigation, a **support/derivation tree** — the recursive DAG expanding each premise into the argument(s) that conclude it, down to evidential leaves. So an argument page shows:
- a **resolution proof DAG** when the argument is formalized & deductive, and
- a **scheme + critical-questions** panel (plus the support tree) otherwise.

The graph-level "how do competing arguments net out" question is handled separately by the **acceptance/defensibility** metric (§5, argumentation semantics) — kept distinct so the word *resolution* means only the proof method.

**Rendering:** the resolution DAG and support trees use **React Flow** + **dagre/ELK** for layout (**Cytoscape.js** if large-graph rendering dominates); nodes badge-coded by role (input clause / negated goal / resolvent / `□`).

---

## 7. Pages & UX

- **Home / topic browse** — enter via philosophy / science / politics; drill into subtopics; surface high-centrality and high-controversy statements.
- **Statement page** — the hub. Shows: the claim (+ formalization), its metrics with drill-downs, the four epistemic bases in tabs/sections, **arguments where it is the conclusion** (support & rebuttal), **arguments where it is a premise**, its negation/contradictions, version history.
- **Argument page** — premises, conclusion, scheme, inference type, validity status, critical questions (answered/open), and the **derivation + resolution diagrams** (§6).
- **Authoring flows** — create/edit statement (with search-before-create dedup, §3.1), build an argument (pick/create premises + conclusion, choose scheme, optional formalization with validity feedback), add a citation, cast a vote, file an empirical report.
- **Search** — full-text + semantic search over statements, filterable by topic and metric ranges.
- **User profile** — contributions, reputation, voting history.
- **Moderation dashboard** — flags, merges, review queue.

---

## 8. System Architecture & Tech Stack

Recommended (TypeScript end-to-end for simplicity; carve out a service only where it pays off):

- **Frontend**: Next.js + React + TypeScript. SSR/SSG matters — a public knowledge base lives or dies by SEO and shareable, crawlable pages. Diagrams via React Flow + dagre/ELK (§6).
- **API**: tRPC (or GraphQL if third-party API access is a near-term goal) over a Node/TS backend.
- **Database**: Postgres (schema §4), recursive CTEs for graph traversal, `pgvector` for statement embeddings (dedup + semantic search).
- **Search**: Postgres FTS to start; graduate to Meilisearch/Typesense if search UX demands it.
- **Metrics/logic worker**: a background job service (queue + workers) for fixpoint recomputation and validity checking; can be TS, with an optional **Python microservice** later for heavier logic/NLP (formalization assistance, embeddings, scheme classification).
- **Auth**: standard email/OAuth; roles for moderation.
- **Caching**: metrics materialized in Postgres; hot pages/diagrams cached at the edge.

Why not a graph DB now: the core queries (arguments-for / arguments-using / dependent propagation) are well-served by Postgres, and one datastore is far simpler operationally. Revisit Neo4j only if traversal profiling demands it.

---

## 9. Formalization & the Resolution Engine

The logic engine's job is to take a formalized deductive argument and produce the **resolution refutation** that drives §6's diagram and the argument's validity verdict.

- **Level 1 (propositional)**: statements are atoms combined with connectives. Pipeline: CNF conversion → propositional resolution (with clause-selection heuristics — unit-preference, set-of-support — to keep the search tractable) → derive `□` or saturate. Verdict: valid / invalid / (resource-bounded) unknown. Propositional resolution is decidable, so this is reliable.
- **Level 2 (light predicate)**: typed entities/relations for syllogistic and quantified forms. Pipeline adds prenex + Skolemization + first-order **unification** in the resolution loop. First-order validity is only *semi*-decidable, so run under strict **step/time budgets**; on timeout, report `unknown` (never a false verdict) and offer the partial proof so far. Keep Level 2 to a bounded, well-behaved fragment initially.
- **Countermodels**: when no refutation is found within budget for a propositional argument, extract a satisfying assignment as the countermodel (§6.3).
- **Proof object**: the engine emits a structured proof — the ordered list of resolution steps `(clauseA, clauseB, eliminated-literal, substitution) → resolvent` — which is both stored (for caching/audit) and fed directly to the diagram renderer.
- **Build vs. buy**: a compact in-house propositional resolver is very feasible for Level 1 and gives full control over the proof object for visualization. For Level 2, evaluate embedding/porting an established prover (e.g. a lightweight table/resolution prover) vs. extending the in-house one; the proof-object format is the integration contract either way. This is a natural place for the optional **Python microservice** (§8).
- **Defeasible arguments** get **no** resolution proof (§6.4); they track **critical questions** — each open CQ is a potential attack, each answered CQ strengthens the argument.
- **Authoring assistance**: an aid that suggests a scheme and a candidate formalization (the atoms, connectives, and CNF) from natural-language text (LLM-assisted, human-confirmed) — enrichment that unlocks the proof view, never mandatory.

---

## 10. Moderation, Quality & Anti-Abuse

This is a wiki-like, vote-bearing system on contentious topics — quality control is not optional.
- **Versioning & provenance** on statements and arguments; full edit history; revert.
- **Merge/alias governance** (§3.1) with audit trail.
- **Vote integrity**: sockpuppet/brigading resistance (rate limits, reputation-weighted votes, anomaly detection); votes are one *basis*, deliberately bounded in weight so popularity can't overwhelm evidence.
- **Empirical reports** are explicitly the weakest basis and labeled as anecdotal.
- **Flag & review queue**; roles (contributor / trusted / moderator).
- **Neutrality of framing**: because statements are shared, phrasing is contested; the surface-form mechanism (§4) and merge process are the pressure valve.

---

## 11. Non-Functional Requirements

- **Explainability** of every metric (hard requirement, §5).
- **Performance**: incremental metric propagation; bounded fixpoint iterations; cached diagrams.
- **SEO & shareability** of statement/argument pages.
- **Accessibility**: diagrams need non-visual equivalents (structured text views of derivation/resolution).
- **API/export**: let researchers export the argument graph (the corpus is the point).
- **Observability**: track convergence failures, cycle counts, dedup rates.

---

## 12. Phased Roadmap

- **Phase 0 — Foundations.** Schema, auth, topic taxonomy, CRUD for statements & arguments, basic statement/argument pages, search-before-create. *(No metrics yet.)*
- **Phase 1 — Epistemic bases + negation.** Citations, voting, empirical reports, argument-links; negation/contradiction & attacks in the model; a first **explainable weighted credence** + controversy.
- **Phase 2 — Navigation diagrams.** Support/derivation trees and the acceptance/defensibility graph; drill-down metric explanations. *(Not the resolution proof yet — that needs formalization.)*
- **Phase 3 — Formalization & the resolution engine.** Level 1 propositional CNF + resolution prover emitting proof objects; the **resolution-proof diagram** (§6) and countermodels; argumentation schemes + critical questions; scheme-driven attack generation. *(Level 2/FOL resolution deferred to Phase 6.)*
- **Phase 4 — Full metrics engine.** Centrality, groundedness, defensibility (argumentation semantics), robustness; incremental fixpoint propagation with cycle handling.
- **Phase 5 — Collaboration & quality.** Versioning, merge/alias, reputation, moderation dashboard, vote-integrity defenses.
- **Phase 6 — Scale & openness.** Semantic dedup at scale, Level 2 formalization, public API/export, performance hardening.

---

## 13. Open Questions

1. **Attacks in scope for v1?** Recommendation: yes (§3.2) — but confirm, since it's the biggest lever on complexity.
2. **How opinionated should the credence model be** vs. just displaying raw bases and letting readers judge? (§3.4)
3. **Governance model** for merges and framing disputes — benevolent moderators, or community consensus mechanisms?
4. **Anonymous reading + gated contribution**, or accounts required throughout?
5. **Tech-stack confirmation** — is TypeScript-everywhere acceptable, or is there a preference (e.g. Python backend for the logic/NLP work)?
```
