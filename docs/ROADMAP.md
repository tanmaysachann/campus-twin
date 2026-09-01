# Roadmap

## Phase 1 — competition vertical slice (this repository)

- deterministic campus state;
- Delta/SQL repository;
- Genie Agent integration;
- five counterfactual action types;
- explicit decision score, cascades and uncertainty;
- prediction-vs-observed feedback;
- Databricks App deployment;
- anti-slop operational interface.

## Phase 2 — real ingestion

- timetable SIS connector;
- facility inventory connector;
- building meter ingestion;
- transport trip/stop feed;
- data quality expectations and quarantine tables;
- source/effective timestamps on all canonical facts.

## Phase 3 — optimization

- CP-SAT room/timetable solver;
- hard constraints for accessibility, room type and faculty availability;
- Pareto frontier for space/energy/travel trade-offs;
- scenario versioning and approvals.

## Phase 4 — calibrated predictive twin

- MLflow-governed forecasting models;
- learned energy response by building;
- calibrated transit demand response;
- event demand shocks;
- uncertainty learned from real residual history;
- champion/challenger model evaluation.

## Phase 5 — operational closed loop

- approved scenario → execution ticket/work order;
- observed post-change metrics automatically attached;
- audit trail for who proposed/approved/implemented a change;
- policy controls for high-impact actions;
- campus-specific model recalibration.

## Non-goal

Do not add a 3D campus merely because the phrase “digital twin” makes it visually tempting. Add 3D only when geometry itself changes a decision (evacuation, sunlight/HVAC, pedestrian flow, asset location). The current product is a decision twin, not a rendering demo.
