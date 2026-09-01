# Data model

## Canonical entities

### `buildings`
`id`, `name`, `kind`, map coordinates, floor-area proxy.

### `rooms`
Room identity, building FK by convention, kind, capacity, floor and AC flag.

### `sections`
Academic section identity, course, department, year and enrollment.

### `schedules`
One weekly timetable session: section, room, day, start hour, duration, session type.

### `energy`
Hourly building energy and ambient temperature.

### `bus_routes`
Route capacity configuration: vehicle capacity, active buses and headway.

### `bus_demand`
Timestamped route passenger demand samples.

### `events`
Campus event, building, time and expected attendance.

### `walk_edges`
Undirected campus topology edge represented as one stored pair with walking minutes.

## Operational memory

### `scenario_runs`
Stores the full serialized `ScenarioResult` plus searchable name/objective/verdict/score fields.

### `feedback`
Stores predicted value, observed value, relative error, notes and optional originating scenario.

### `app_config`
Small key/value table for workspace-local configuration such as the provisioned Genie Agent ID.

## Gold semantic views

`gold_room_utilization` joins rooms to scheduled hours and section capacity fit.

`gold_building_energy_daily` aggregates hourly energy by building/date.

`gold_bus_pressure` joins demand with active route capacity.

`gold_schedule_pressure` creates a section-room capacity record per scheduled session.

`gold_campus_overview` provides compact campus KPIs from the other views.

## Demo data contract

The deterministic seed (`20260830`) generates:

- 8 buildings;
- 58 rooms;
- 47 sections;
- 141 weekly sessions;
- 1,344 hourly energy readings (8 × 24 × 7);
- 4 bus routes;
- 120 peak-period bus demand rows;
- 5 events;
- a 15-edge walking topology.

Run `python scripts/generate_demo_data.py` to reproduce the snapshot byte-for-byte for a given Python implementation and seed logic.

## What is deliberately absent

The base concept mentions student data broadly, but this prototype does **not** include names, IDs, attendance histories or other personal student records. Academic demand is represented at section aggregate level. This keeps the competition dataset useful without inventing or exposing personal data.
