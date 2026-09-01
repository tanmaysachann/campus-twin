# Architecture

## 1. Product boundary

The source concept defines five layers: a unified campus data foundation, Databricks Genie for natural-language exploration, digital simulation, a decision layer, and real-world feedback. CampusTwin preserves that structure but makes the boundaries executable.

The important architectural decision is that **Genie does not own simulation logic**. Genie answers questions over governed data. Counterfactual state transitions run in a deterministic domain service. This keeps a natural-language model from silently inventing a campus state.

```text
Browser
  │
  ▼
Databricks App / FastAPI
  ├── /api/twin/*          current governed state
  ├── /api/scenarios/*     counterfactual engine
  ├── /api/genie/*         NL analysis adapter
  ├── /api/feedback        predicted-vs-observed residuals
  └── /api/admin/bootstrap explicit infrastructure bootstrap
       │
       ├── per-user TTL snapshot cache
       │
       ├── repository boundary
       │    ├── Databricks SQL Statement Execution API → Delta / views
       │    └── bundled deterministic demo snapshot
       │
       └── Genie API → governed gold views
```

## 2. Why a repository boundary

The competition demo must survive three environments:

1. **Zero-setup local evaluation.** The bundled JSON snapshot gives judges an immediate working product.
2. **Databricks-connected local development.** A developer can point the same application at a workspace using a local token.
3. **Databricks Apps.** User authorization is forwarded by the platform and every SQL/Genie request is made with that user context.

`CampusRepository` defines only the persistence contract the domain needs. The simulation and UI never care whether rows came from JSON or Delta.

## 3. Identity-aware cache

Free Edition has constrained compute. Re-reading nine tables on every navigation action would waste warehouse cycles, but caching one global snapshot could mix Unity Catalog visibility between users.

The cache key is therefore:

```text
<source mode>:<request user key>
```

Cached snapshots are deep-copied on read/write. TTL defaults to 45 seconds. An explicit Databricks bootstrap clears the cache.

This is intentionally a small in-process cache. It is appropriate for a single Databricks App instance and a hackathon/college deployment. At larger scale, replace it with a distributed cache only after measuring the need.

## 4. Current state versus scenario state

`simulate()` receives an immutable conceptual baseline and immediately deep-clones it. Scenario actions mutate only that clone.

```text
current snapshot
     │ deep copy
     ▼
scenario twin
     │ action reducers
     ▼
recomputed metrics
     │
     ├── direct deltas
     ├── cascading-effect explanations
     ├── decision score/verdict
     └── uncertainty bands
```

This separation is the central safety property of the project. A judge can run destructive-looking experiments without changing the source campus data.

## 5. Decision layer

The decision layer is transparent rather than pretending to be a sophisticated black-box optimizer. It exposes:

- before/after values;
- objective-specific scoring weights;
- rejection thresholds;
- generated action log;
- named cascade effects;
- explicit assumptions;
- Monte Carlo perturbation bands.

The coefficients are scenario-model assumptions. They are not represented as learned causal effects.

## 6. Databricks data plane

Canonical Delta tables hold entity/state data. Gold views are intentionally narrow and semantically labeled for Genie:

- `gold_room_utilization`
- `gold_building_energy_daily`
- `gold_bus_pressure`
- `gold_schedule_pressure`
- `gold_campus_overview`

Genie receives those views rather than every raw table. This reduces schema ambiguity and gives the natural-language layer a decision-oriented semantic surface.

## 7. Bootstrap is a command, not startup side effect

The app never creates schemas or seeds rows merely because someone opened it. `/api/admin/bootstrap` is an explicit action. It performs:

1. `CREATE SCHEMA IF NOT EXISTS`;
2. canonical/operational table DDL;
3. seed only empty canonical tables unless force-reseed is explicitly selected;
4. refresh gold views;
5. optionally create and link a Genie Agent in an explicit workspace parent folder;
6. clear the app snapshot cache.

This avoids surprise data mutation and unnecessary SQL warehouse use.

## 8. Failure behavior

`CAMPUS_TWIN_DATA_MODE` controls failure semantics:

- `demo`: always use bundled data.
- `auto`: use Databricks when configured; fall back to bundled data if the snapshot cannot be loaded.
- `databricks`: Databricks errors surface instead of silently changing data sources.

The UI always displays the active source so a fallback cannot masquerade as live governed data.

## 9. Future production split

If the prototype grows, keep the domain boundary and split execution by workload:

- ingestion → Lakeflow/Auto Loader;
- large simulation batches → Databricks Jobs;
- optimization → dedicated solver service or job;
- calibrated forecasting → MLflow-governed models;
- live IoT → event ingestion and streaming tables;
- app → orchestration, review and explanation only.

The current vertical slice deliberately keeps those concerns local because the supplied project is a decision prototype, not yet a campus-wide operational deployment.
