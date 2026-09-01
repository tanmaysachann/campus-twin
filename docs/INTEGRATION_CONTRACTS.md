# Integration contracts

CampusTwin is intentionally schema-first. Real campus systems can replace demo feeds one domain at a time as long as they produce the canonical tables.

## Timetable / academic system

Required minimum:

```text
sections: section_id, course, department, year, enrollment
schedules: session_id, section_id, room_id, weekday, start_time, duration
```

Recommended ingestion behavior:

- preserve source system IDs in a mapping table;
- reject orphan room/section references into a quarantine table;
- record source extraction time and effective date;
- do not infer enrollment from attendance counts.

## Space inventory

Required minimum:

```text
buildings: building_id, name, kind
rooms: room_id, building_id, name, kind, capacity
```

Map coordinates are optional for the data model but required for the current topology UI.

## Energy / BMS

Required minimum:

```text
building_id, timestamp, kwh
```

The demo assumes hourly readings. A production system should define meter boundaries, missing-reading policy, timezone and whether values are interval consumption or cumulative meter readings.

## Transport

Required minimum:

```text
routes: route_id, active_buses, capacity_per_bus, headway_minutes
bus_demand: route_id, timestamp, passengers
```

The current pressure metric assumes `passengers` corresponds to a comparable route time sample. A production feed should add stop, direction, trip ID and boarding/alighting semantics.

## Events

Required minimum:

```text
event_id, building_id, day/time, expected_attendance
```

The current engine exposes events in topology but does not yet model their demand shocks. That is a deliberate roadmap item rather than an undocumented hidden coefficient.

## Feedback

Any implemented intervention can report:

```json
{
  "scenario_id": "optional UUID",
  "metric": "room_utilization_pct",
  "predicted": 72.4,
  "observed": 69.8,
  "notes": "Exam week changed room demand"
}
```

This is the stable hook for future calibration.
