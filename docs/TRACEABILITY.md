# Base-design traceability

The supplied CampusTwin brief is preserved at `docs/source/Campus_Twin_Base_Design.pdf`. This document shows exactly where each core idea became executable software and where the implementation deliberately goes beyond the brief.

| Base concept | Executable implementation | Evidence surface |
|---|---|---|
| Fragmented campus data becomes one model | Canonical `buildings`, `rooms`, `sections`, `schedules`, `energy`, `bus_routes`, `bus_demand`, `events`, `walk_edges` tables plus `CampusSnapshot` | `sql/ddl.sql`, `models.py`, Explore |
| Data Foundation | Repository boundary, Delta tables, gold views, deterministic demo adapter | `repositories/`, `sql/`, Overview |
| Genie Intelligence | Governed five-view semantic surface and stateful Genie conversation adapter | `databricks/genie.py`, `genie/campus_twin_space.json`, Ask Genie |
| Digital Simulation | Deep-cloned snapshot plus typed intervention reducers and recomputed metrics | `services/simulation.py`, Simulate |
| Decision Layer | Before/after deltas, objective-aware score, hard rejection signals, cascades, action log, uncertainty | `services/simulation.py`, scenario result UI |
| Real-World Feedback | Predicted-vs-observed residual persistence | `feedback` Delta table, `/api/feedback`, Feedback view |
| Test before real-world change | Scenario mutations never write to baseline state | simulation tests + model contract in UI |

## Deliberate additions beyond the base design

The brief is a product concept, so this repository adds the engineering needed to make it credible as a working competition system:

1. **A strict current-state / counterfactual-state boundary.** Genie reads governed facts; deterministic code owns scenario mutation.
2. **Epistemic labels.** Scheduled utilization is not called live occupancy; demo coefficients are not called learned causal effects; Monte Carlo bands are not called empirical confidence intervals.
3. **Databricks user authorization.** Hosted requests use the forwarded user token rather than embedding a long-lived credential.
4. **Per-user caching.** Short-lived snapshots reduce SQL calls without mixing users' governed visibility.
5. **Explicit bootstrap.** Opening the app never creates schemas or seeds data as a side effect.
6. **Failure-safe demo mode.** Judges can exercise the complete interaction even when a workspace quota, Genie setup, or network is unavailable.
7. **Inspectable Genie surface.** Genie receives narrow gold views instead of raw-table sprawl.
8. **Anti-AI-slop interface contract.** The UI is built as an operational instrument, not a generic gradient/card SaaS dashboard.
9. **Deployment-copy contract tests.** The files actually uploaded by the Databricks App bundle are tested to stay in sync with development assets.
10. **Upgrade seams.** Real feeds, CP-SAT optimization, MLflow models, streaming ingestion, and approval workflows can replace individual adapters without rewriting the product boundary.

## What the prototype does not pretend to have

The supplied brief does not provide real campus sensor feeds, real personally identifying student records, learned energy elasticities, transport microsimulation parameters, or historical intervention outcomes. The implementation therefore uses aggregate deterministic demo data and labels its scenario coefficients as assumptions. Those gaps are extension points, not hidden claims.
