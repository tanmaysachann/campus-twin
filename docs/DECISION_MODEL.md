# Decision and simulation model

## What the engine currently simulates

The bundled engine supports five intervention families:

| Action | Primary mutation | Cascades recomputed |
|---|---|---|
| `close_room` | reassign sessions out of a room | capacity, conflicts, small building-energy assumption |
| `relocate_section` | move all sessions for one section | capacity, building load, energy shift |
| `reschedule_section` | move one section session in time/optionally room | room-time conflicts, capacity |
| `change_intake` | change section enrollment | capacity, transport-demand assumption, small energy assumption |
| `adjust_bus_frequency` | active buses/headway | peak route pressure |

A scenario can carry up to eight actions so interventions can be composed.

## Metrics

### Scheduled room utilization

```text
sum(session duration hours)
-------------------------------- × 100
room count × 60 available hours/week
```

It is **not live occupancy**. The UI repeats this distinction because the source concept talks about utilization broadly, but the supplied project does not include real sensor telemetry.

### Capacity fit

Percentage of scheduled sessions where section enrollment does not exceed assigned room capacity.

### Schedule conflicts

Count of overlapping sessions sharing the same room and day.

### Latest-day energy

Sum of all building energy readings on the latest date present in the snapshot.

### Peak transport load

```text
passengers at route sample
---------------------------------- × 100
active buses × capacity per bus
```

This is a pressure indicator rather than a transport microsimulation.

## Objective-aware score

The engine starts from the after-state operational score and applies transparent improvement/penalty terms. Objective selection changes weights for:

- capacity-fit change;
- conflict change;
- transport-pressure change;
- energy percentage change;
- distance from a 65% scheduled-room-utilization target.

Hard signals can override the score and reject a scenario, for example a large increase in scheduling conflicts or extreme transport overload.

The project intentionally favors legibility over false optimization sophistication. All scoring code lives in `services/simulation.py` and can be audited line-by-line.

## Uncertainty bands

Each result includes P10 / median / P90 bands produced by deterministic-seeded Monte Carlo perturbations around four after-state metrics. These bands are useful for visualizing model sensitivity, but they are **not empirical confidence intervals**.

The explicit assumptions shipped in each result say so.

## How to upgrade the model

A serious campus deployment should replace assumptions incrementally:

1. Fit occupancy-linked energy coefficients from actual building telemetry.
2. Estimate transit demand elasticity from historical route changes.
3. Add walking-cost and accessibility constraints to relocation.
4. Use CP-SAT / MILP for timetable and room-allocation feasibility.
5. Store scenario features and observed residuals.
6. Calibrate uncertainty from historical prediction error.
7. Version every model and policy used for a decision.

The current architecture already isolates the domain layer so those upgrades do not require rewriting the app or Genie integration.
