# HTTP API

Interactive OpenAPI is available at `/api/docs`.

## Health

`GET /api/health`

Returns app mode and whether Databricks environment configuration is present.

## Current twin

- `GET /api/twin/summary` — operational metrics, building pressure, route pressure and domain counts.
- `GET /api/twin/topology` — buildings, walking edges, events and space pressure.
- `GET /api/twin/rooms` — room inventory plus derived scheduled utilization.
- `GET /api/twin/schedule` — timetable rows joined to section/room capacity context.
- `GET /api/twin/energy` — latest-day energy by building.

- `GET /api/data/quality` - readiness checks for governed table coverage, join integrity, duplicate IDs, energy coverage, operational pressure surfacing and the gold-view contract.

Every response that represents loaded twin data includes a `source` signal such as `demo`, `databricks` or `databricks-cache`.

## Simulation

`POST /api/scenarios/simulate`

Example:

```json
{
  "name": "East Express relief",
  "objective": "transport",
  "persist": true,
  "actions": [
    {
      "type": "adjust_bus_frequency",
      "params": {
        "route_id": "R2",
        "active_buses": 5,
        "headway_minutes": 15
      }
    }
  ]
}
```

Response contains before/after metrics, deltas, verdict, score, action log, cascade effects, assumptions and uncertainty bands.

The first-screen Judge Demo uses this same endpoint with a generated multi-action resilience plan over the active governed snapshot. It asks Genie first, then persists the scenario only when the active source is Databricks.

`GET /api/scenarios/history`

Returns saved scenario runs from the active repository.

`GET /api/scenarios/compare`

Ranks saved scenario runs by verdict, decision score, score delta, critical effects, and primary metric deltas. This compares modeled counterfactual outputs; it does not mutate governed facts.

## Operations

`GET /api/ops/priorities`

Returns a ranked operational investigation queue with concise findings, recommended next actions, and SQL/evidence pointers over the governed CampusTwin schema.

`GET /api/ops/interactions`

Returns cross-domain interaction risks where schedules, rooms, events, energy and mobility signals overlap. Missing fields such as route-stop-to-building mapping are reported instead of inferred.

## Natural-language analysis

`POST /api/genie/chat`

```json
{
  "question": "Which rooms are underutilized this week?",
  "conversation_id": null
}
```

`mode` is always explicit:

- `genie` means a Databricks Genie Agent answered;
- `local` means the constrained deterministic analyst answered.

The local fallback never labels itself as Genie.

## Feedback

`POST /api/feedback`

Stores the predicted-vs-observed error in the active repository.

`GET /api/feedback/history`

Returns recent feedback records and average relative error for the active repository.

## Bootstrap

`POST /api/admin/bootstrap`

```json
{
  "create_genie": true,
  "force_reseed": false
}
```

Requires Databricks host, SQL warehouse and an authorized request token. It is deliberately not executed on application startup.
