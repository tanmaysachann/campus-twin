# Architecture decision record

## ADR-001 - Keep the digital twin semantic, not 3D

**Decision:** represent campus entities, topology, constraints and state rather than building a decorative 3D model.

**Why:** the product question is decision impact. Geometry should only be added when geometry changes the answer (evacuation, sunlight/HVAC, pedestrian flow, asset location).

## ADR-002 - Separate observation from counterfactual mutation

**Decision:** Genie/SQL answer current-state questions. `simulate()` owns hypothetical changes.

**Why:** an LLM should not silently mutate factual state or invent causal consequences. Typed actions make scenario semantics auditable and testable.

## ADR-003 - One deployable process for Free Edition

**Decision:** serve the no-build SPA and FastAPI from one Databricks App process.

**Why:** it removes a second host, frontend build runtime, cross-origin boundary, Redis/Postgres dependency and additional always-on compute while preserving clean internal modules.

## ADR-004 - Repository protocol around the twin snapshot

**Decision:** the domain consumes `CampusRepository`, with demo JSON and Databricks SQL adapters.

**Why:** competition evaluation, local development and governed workspace execution use the same domain code. Infrastructure failure does not infect simulation logic.

## ADR-005 - Narrow gold views as the Genie contract

**Decision:** expose five decision-oriented views to Genie rather than every canonical table.

**Why:** fewer ambiguous joins, clearer semantic descriptions, lower prompt/schema noise and a stable interface if raw ingestion later changes.

## ADR-006 - Per-user short TTL cache

**Decision:** cache snapshots by source + request identity, not globally.

**Why:** repeated navigation should not waste a constrained SQL warehouse, while a global governed-data cache could cross user visibility boundaries.

## ADR-007 - Explicit bootstrap, never startup mutation

**Decision:** schema creation, seeding and Genie provisioning happen only through an explicit admin endpoint/action.

**Why:** app startup must be safe, repeatable and cheap. Infrastructure mutation should be visible and permission-governed.

## ADR-008 - Transparent score over fake optimization

**Decision:** use documented weights, threshold overrides, action logs and explicit assumptions.

**Why:** with synthetic starter data, a black-box "AI optimizer" would create false sophistication. The transparent layer can later be replaced by CP-SAT/MILP or learned models behind the same result contract.

## ADR-009 - Store feedback residuals before claiming learning

**Decision:** persist predicted and observed outcomes now; defer model retraining until real history exists.

**Why:** this makes the feedback loop structurally real without claiming that a synthetic prototype has already learned the campus.

## ADR-010 - Treat visual restraint as a product invariant

**Decision:** maintain `DESIGN.md` and a deterministic design audit; optionally run Impeccable's detector during human review.

**Why:** generated-dashboard conventions can make a serious operations tool look interchangeable. Visual elements must encode state, navigation, evidence or action.
