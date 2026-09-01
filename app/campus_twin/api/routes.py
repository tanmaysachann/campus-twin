from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from ..config import settings
from ..databricks.bootstrap import DatabricksBootstrapper
from ..databricks.genie import GenieClient
from ..databricks.rest import DatabricksAPIError, DatabricksREST
from ..databricks.sql import StatementExecutor
from ..models import (
    BootstrapRequest,
    BootstrapResult,
    FeedbackRecord,
    FeedbackRequest,
    GenieAnswer,
    GenieRequest,
    HealthResponse,
    ScenarioRequest,
    ScenarioResult,
)
from ..services.intelligence import IntelligenceService
from ..services.metrics import building_pressure, compute_metrics, route_pressure
from ..services.simulation import ScenarioValidationError, simulate
from .deps import RuntimeContext, get_runtime, load_snapshot

router = APIRouter(prefix="/api")


def _duplicates(values: list[str]) -> list[str]:
    counts = Counter(values)
    return sorted(value for value, count in counts.items() if count > 1)


def _quality_check(name: str, status: str, finding: str, evidence: list[str], domain: str = "data") -> dict:
    return {
        "name": name,
        "domain": domain,
        "status": status,
        "finding": finding,
        "evidence": evidence,
    }


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        app=settings.app_name,
        data_mode=settings.data_mode,
        databricks_configured=settings.databricks_configured,
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/twin/summary")
async def twin_summary(request: Request, runtime: RuntimeContext = Depends(get_runtime)):
    snapshot, source = await load_snapshot(request, runtime)
    return {
        "source": source,
        "version": snapshot.version,
        "generated_at": snapshot.generated_at,
        "metrics": compute_metrics(snapshot),
        "building_pressure": building_pressure(snapshot),
        "route_pressure": route_pressure(snapshot),
        "counts": {
            "buildings": len(snapshot.buildings),
            "rooms": len(snapshot.rooms),
            "sections": len(snapshot.sections),
            "schedules": len(snapshot.schedules),
            "energy_readings": len(snapshot.energy),
            "bus_routes": len(snapshot.bus_routes),
            "events": len(snapshot.events),
            "bim_storeys": len(snapshot.bim_storeys),
            "bim_spaces": len(snapshot.bim_spaces),
        },
    }


@router.get("/twin/topology")
async def twin_topology(request: Request, runtime: RuntimeContext = Depends(get_runtime)):
    snapshot, source = await load_snapshot(request, runtime)
    return {
        "source": source,
        "buildings": snapshot.buildings,
        "walk_edges": snapshot.walk_edges,
        "events": snapshot.events,
        "building_pressure": building_pressure(snapshot),
    }


@router.get("/twin/rooms")
async def twin_rooms(request: Request, runtime: RuntimeContext = Depends(get_runtime)):
    snapshot, source = await load_snapshot(request, runtime)
    hours = {r.id: 0 for r in snapshot.rooms}
    storeys = {storey.id: storey for storey in snapshot.bim_storeys}
    spaces_by_room = {space.room_id: space for space in snapshot.bim_spaces if space.room_id}
    for s in snapshot.schedules:
        hours[s.room_id] = hours.get(s.room_id, 0) + s.duration_hours
    return {
        "source": source,
        "rooms": [
            r.model_dump() | {
                "scheduled_hours": hours.get(r.id, 0),
                "scheduled_utilization_pct": round(100 * hours.get(r.id, 0) / 60, 1),
                "bim_space_id": spaces_by_room[r.id].id if r.id in spaces_by_room else None,
                "bim_object_id": spaces_by_room[r.id].render_object_id if r.id in spaces_by_room else None,
                "bim_storey_id": spaces_by_room[r.id].storey_id if r.id in spaces_by_room else None,
                "bim_storey_name": (
                    storeys[spaces_by_room[r.id].storey_id].name
                    if r.id in spaces_by_room and spaces_by_room[r.id].storey_id in storeys
                    else None
                ),
            }
            for r in snapshot.rooms
        ],
    }


@router.get("/twin/spatial")
async def twin_spatial(request: Request, runtime: RuntimeContext = Depends(get_runtime)):
    snapshot, source = await load_snapshot(request, runtime)
    return {
        "source": source,
        "model": "BMSCE Approximate BIM Demo",
        "storeys": snapshot.bim_storeys,
        "spaces": snapshot.bim_spaces,
        "mapped_room_count": sum(1 for space in snapshot.bim_spaces if space.room_id),
    }


@router.get("/twin/schedule")
async def twin_schedule(request: Request, runtime: RuntimeContext = Depends(get_runtime)):
    snapshot, source = await load_snapshot(request, runtime)
    rooms = {r.id: r for r in snapshot.rooms}
    sections = {s.id: s for s in snapshot.sections}
    spaces_by_room = {space.room_id: space for space in snapshot.bim_spaces if space.room_id}
    rows = []
    for s in snapshot.schedules:
        room = rooms[s.room_id]
        sec = sections[s.section_id]
        rows.append(s.model_dump() | {
            "course": sec.course,
            "department": sec.department,
            "enrollment": sec.enrollment,
            "room_name": room.name,
            "capacity": room.capacity,
            "building_id": room.building_id,
            "over_capacity": sec.enrollment > room.capacity,
            "bim_space_id": spaces_by_room[room.id].id if room.id in spaces_by_room else None,
            "bim_object_id": spaces_by_room[room.id].render_object_id if room.id in spaces_by_room else None,
            "bim_storey_id": spaces_by_room[room.id].storey_id if room.id in spaces_by_room else None,
        })
    return {"source": source, "schedule": rows}


@router.get("/twin/energy")
async def twin_energy(request: Request, runtime: RuntimeContext = Depends(get_runtime)):
    snapshot, source = await load_snapshot(request, runtime)
    latest = max((e.timestamp.date() for e in snapshot.energy), default=None)
    by_building: dict[str, float] = {}
    if latest:
        for e in snapshot.energy:
            if e.timestamp.date() == latest:
                by_building[e.building_id] = by_building.get(e.building_id, 0.0) + e.kwh
    return {"source": source, "latest_date": latest, "by_building": [{"building_id": k, "kwh": round(v, 1)} for k, v in sorted(by_building.items())]}


@router.get("/ops/priorities")
async def ops_priorities(request: Request, runtime: RuntimeContext = Depends(get_runtime)):
    snapshot, source = await load_snapshot(request, runtime)
    metrics = compute_metrics(snapshot)
    namespace = settings.namespace
    priorities = []
    buildings = {b.id: b for b in snapshot.buildings}
    rooms = {r.id: r for r in snapshot.rooms}
    sections = {s.id: s for s in snapshot.sections}

    over_capacity = []
    for session in snapshot.schedules:
        room = rooms[session.room_id]
        section = sections[session.section_id]
        overflow = section.enrollment - room.capacity
        if overflow > 0:
            over_capacity.append((overflow, session, section, room))
    over_capacity.sort(reverse=True, key=lambda item: item[0])
    if over_capacity:
        overflow, session, section, room = over_capacity[0]
        priorities.append({
            "rank": 1,
            "severity": "critical",
            "domain": "space",
            "title": "Resolve scheduled room overflow",
            "finding": f"{section.course} has {overflow} more enrolled students than seats in {room.name}.",
            "action": "Relocate the section or split the session before the next timetable cycle.",
            "evidence": [
                f"SQL: SELECT * FROM {namespace}.gold_schedule_pressure WHERE over_capacity = true ORDER BY seat_delta DESC;",
                f"{session.day} {session.start_hour}:00 / {buildings[room.building_id].name}",
            ],
        })

    routes = route_pressure(snapshot)
    if routes:
        route = routes[0]
        priorities.append({
            "rank": len(priorities) + 1,
            "severity": "critical" if route["peak_load_pct"] >= 100 else "watch",
            "domain": "mobility",
            "title": "Reduce peak shuttle pressure",
            "finding": f"{route['name']} reaches {route['peak_load_pct']}% modeled load at peak.",
            "action": "Test added buses or shorter headway in Scenario Lab before changing service.",
            "evidence": [
                f"SQL: SELECT * FROM {namespace}.gold_bus_pressure ORDER BY load_pct DESC;",
                f"{route['active_buses']} active buses / {route['headway_minutes']} min headway",
            ],
        })

    building_rank = building_pressure(snapshot)
    if building_rank:
        building = building_rank[0]
        priorities.append({
            "rank": len(priorities) + 1,
            "severity": "watch",
            "domain": "schedule",
            "title": "Investigate concentrated scheduled demand",
            "finding": f"{building['name']} has the highest scheduled room utilization at {building['utilization_pct']}%.",
            "action": "Review whether underused rooms in nearby buildings can absorb future demand.",
            "evidence": [
                f"SQL: SELECT * FROM {namespace}.gold_room_utilization ORDER BY scheduled_utilization_pct DESC;",
                f"{building['sessions']} sessions / {building['over_capacity']} over-capacity sessions",
            ],
        })

    latest = max((e.timestamp.date() for e in snapshot.energy), default=None)
    if latest:
        totals: dict[str, float] = {}
        for reading in snapshot.energy:
            if reading.timestamp.date() == latest:
                totals[reading.building_id] = totals.get(reading.building_id, 0.0) + reading.kwh
        if totals:
            building_id, kwh = max(totals.items(), key=lambda item: item[1])
            priorities.append({
                "rank": len(priorities) + 1,
                "severity": "watch",
                "domain": "energy",
                "title": "Check latest-day energy outlier",
                "finding": f"{buildings[building_id].name} used {round(kwh, 1)} kWh on {latest.isoformat()}.",
                "action": "Compare room schedules, events, and HVAC assumptions before intervention.",
                "evidence": [
                    f"SQL: SELECT * FROM {namespace}.gold_building_energy_daily WHERE date = (SELECT MAX(date) FROM {namespace}.gold_building_energy_daily) ORDER BY energy_kwh DESC;",
                    "Energy is scheduled/model data, not a live meter claim.",
                ],
            })

    if metrics.schedule_conflicts:
        priorities.append({
            "rank": len(priorities) + 1,
            "severity": "critical",
            "domain": "schedule",
            "title": "Fix room-time conflicts",
            "finding": f"{metrics.schedule_conflicts} room-time conflict(s) are present.",
            "action": "Reschedule conflicting sessions before approving the timetable.",
            "evidence": ["Schedule sessions grouped by room, day, and overlapping start/duration windows."],
        })

    for index, priority in enumerate(priorities[:5], start=1):
        priority["rank"] = index
    return {"source": source, "priorities": priorities[:5]}


@router.get("/ops/interactions")
async def ops_interactions(request: Request, runtime: RuntimeContext = Depends(get_runtime)):
    snapshot, source = await load_snapshot(request, runtime)
    namespace = settings.namespace
    buildings = {building.id: building for building in snapshot.buildings}
    rooms = {room.id: room for room in snapshot.rooms}
    sections = {section.id: section for section in snapshot.sections}
    building_rank = {item["building_id"]: item for item in building_pressure(snapshot)}
    routes = route_pressure(snapshot)
    interactions = []

    schedule_by_building_day: dict[tuple[str, str], list] = defaultdict(list)
    for session in snapshot.schedules:
        room = rooms.get(session.room_id)
        section = sections.get(session.section_id)
        if room and section:
            schedule_by_building_day[(room.building_id, session.day)].append((session, section, room))

    for event in snapshot.events:
        sessions = schedule_by_building_day.get((event.building_id, event.day), [])
        overlapping = [
            (session, section, room)
            for session, section, room in sessions
            if session.start_hour <= event.start_hour < session.start_hour + session.duration_hours
        ]
        same_day_enrollment = sum(section.enrollment for _, section, _ in sessions)
        concurrent_enrollment = sum(section.enrollment for _, section, _ in overlapping)
        building = buildings.get(event.building_id)
        if overlapping or event.expected_attendance >= 250:
            score = event.expected_attendance + concurrent_enrollment + 0.2 * same_day_enrollment
            severity = "critical" if event.expected_attendance + concurrent_enrollment >= 650 else "watch"
            interactions.append({
                "severity": severity,
                "score": round(score, 1),
                "domains": ["events", "schedule", "space"],
                "title": "Event demand overlaps scheduled building use",
                "finding": (
                    f"{event.name} in {building.name if building else event.building_id} expects {event.expected_attendance} attendees; "
                    f"{len(overlapping)} scheduled session(s) overlap the event start hour."
                ),
                "action": "Check room access, crowd flow and nearby timetable pressure before the event window.",
                "evidence": [
                    f"SQL: SELECT e.*, s.* FROM {namespace}.events e JOIN {namespace}.rooms r ON r.building_id = e.building_id JOIN {namespace}.schedules s ON s.room_id = r.id AND s.day = e.day WHERE s.start_hour <= e.start_hour AND e.start_hour < s.start_hour + s.duration_hours;",
                    f"Concurrent scheduled enrollment at event start: {concurrent_enrollment}. Same-day scheduled enrollment in building: {same_day_enrollment}.",
                    "Event duration is not modeled; overlap uses event start hour only.",
                ],
                "missing_data": ["event_duration_hours"] if not overlapping else [],
            })

    latest_day = max((reading.timestamp.date() for reading in snapshot.energy), default=None)
    if latest_day:
        latest_energy: dict[str, float] = defaultdict(float)
        for reading in snapshot.energy:
            if reading.timestamp.date() == latest_day:
                latest_energy[reading.building_id] += reading.kwh
        if latest_energy:
            building_id, kwh = max(latest_energy.items(), key=lambda item: item[1])
            pressure = building_rank.get(building_id)
            building = buildings.get(building_id)
            utilization = float(pressure["utilization_pct"]) if pressure else 0.0
            sessions = int(pressure["sessions"]) if pressure else 0
            severity = "watch" if utilization >= 10 or sessions >= 12 else "info"
            interactions.append({
                "severity": severity,
                "score": round(kwh + utilization, 1),
                "domains": ["energy", "schedule", "space"],
                "title": "Energy outlier should be reviewed with schedule load",
                "finding": (
                    f"{building.name if building else building_id} has the latest-day energy high at {round(kwh, 1)} kWh "
                    f"and {sessions} scheduled session(s)."
                ),
                "action": "Compare HVAC assumptions, event use and scheduled room demand before treating this as waste.",
                "evidence": [
                    f"SQL: SELECT * FROM {namespace}.gold_building_energy_daily WHERE date = (SELECT MAX(date) FROM {namespace}.gold_building_energy_daily) ORDER BY energy_kwh DESC;",
                    f"SQL: SELECT * FROM {namespace}.gold_room_utilization WHERE building_id = '{building_id}' ORDER BY scheduled_utilization_pct DESC;",
                    "Energy is modeled/readings data in the governed twin, not live occupancy.",
                ],
                "missing_data": [],
            })

    if routes and snapshot.events:
        top_route = routes[0]
        largest_event = max(snapshot.events, key=lambda event: event.expected_attendance)
        route_load = float(top_route["peak_load_pct"])
        if route_load >= 85:
            interactions.append({
                "severity": "critical" if route_load >= 100 and largest_event.expected_attendance >= 400 else "watch",
                "score": round(route_load + largest_event.expected_attendance / 10, 1),
                "domains": ["mobility", "events", "schedule"],
                "title": "Campus-wide event demand coincides with shuttle pressure",
                "finding": (
                    f"{top_route['name']} reaches {top_route['peak_load_pct']}% modeled load while the largest event "
                    f"({largest_event.name}) expects {largest_event.expected_attendance} attendees."
                ),
                "action": "Use Scenario Lab to test route headway before the event period; exact stop-to-building assignment needs route stop mapping.",
                "evidence": [
                    f"SQL: SELECT * FROM {namespace}.gold_bus_pressure ORDER BY load_pct DESC;",
                    f"SQL: SELECT * FROM {namespace}.events ORDER BY expected_attendance DESC;",
                    "Bus routes include origin/destination gates, but no route_stop_building_id field is available.",
                ],
                "missing_data": ["route_stop_building_id", "event_duration_hours"],
            })

    over_capacity = []
    for session in snapshot.schedules:
        room = rooms.get(session.room_id)
        section = sections.get(session.section_id)
        if not room or not section:
            continue
        overflow = section.enrollment - room.capacity
        if overflow > 0:
            over_capacity.append((overflow, session, section, room))
    over_capacity.sort(reverse=True, key=lambda item: item[0])
    if over_capacity and routes:
        overflow, session, section, room = over_capacity[0]
        route = routes[0]
        interactions.append({
            "severity": "critical" if float(route["peak_load_pct"]) >= 100 else "watch",
            "score": round(overflow * 3 + float(route["peak_load_pct"]), 1),
            "domains": ["space", "schedule", "mobility"],
            "title": "Room overflow should be checked against arrival pressure",
            "finding": (
                f"{section.course} is {overflow} seats over capacity in {room.name}; "
                f"{route['name']} is the highest-pressure route at {route['peak_load_pct']}%."
            ),
            "action": "Prioritize relocation or split-session testing before changing transport service alone.",
            "evidence": [
                f"SQL: SELECT * FROM {namespace}.gold_schedule_pressure WHERE over_capacity = true ORDER BY seat_delta DESC;",
                f"SQL: SELECT * FROM {namespace}.gold_bus_pressure ORDER BY load_pct DESC;",
                "The model does not contain student home-to-route assignments, so this is a campus-wide interaction signal.",
            ],
            "missing_data": ["student_route_assignment"],
        })

    severity_rank = {"critical": 2, "watch": 1, "info": 0}
    ranked = sorted(interactions, key=lambda item: (severity_rank[item["severity"]], item["score"]), reverse=True)
    for index, item in enumerate(ranked[:6], start=1):
        item["rank"] = index
    return {
        "source": source,
        "interactions": ranked[:6],
        "evidence": [
            "Interaction risks are derived from governed room, schedule, event, energy and bus-route records.",
            "Scheduled utilization is not live occupancy; event and transport interactions are modeled operational signals.",
        ],
    }


@router.post("/scenarios/simulate", response_model=ScenarioResult)
async def simulate_scenario(payload: ScenarioRequest, request: Request, runtime: RuntimeContext = Depends(get_runtime)) -> ScenarioResult:
    snapshot, _ = await load_snapshot(request, runtime)
    try:
        result = simulate(snapshot, payload)
    except ScenarioValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if payload.persist:
        try:
            await runtime.repository.save_scenario(result)
        except Exception as exc:
            if settings.data_mode == "databricks":
                raise HTTPException(status_code=502, detail=f"Simulation succeeded but persistence failed: {exc}") from exc
    return result


@router.get("/scenarios/history")
async def scenario_history(runtime: RuntimeContext = Depends(get_runtime)):
    try:
        scenarios = await runtime.repository.list_scenarios()
    except Exception as exc:
        if settings.data_mode == "databricks":
            raise HTTPException(status_code=502, detail=f"Could not load scenario history: {exc}") from exc
        scenarios = []
    return {
        "source": runtime.source,
        "scenarios": [scenario.model_dump() for scenario in scenarios],
    }


@router.get("/data/quality")
async def data_quality(request: Request, runtime: RuntimeContext = Depends(get_runtime)):
    snapshot, source = await load_snapshot(request, runtime)
    namespace = settings.namespace
    counts = {
        "buildings": len(snapshot.buildings),
        "rooms": len(snapshot.rooms),
        "sections": len(snapshot.sections),
        "schedules": len(snapshot.schedules),
        "energy_readings": len(snapshot.energy),
        "bus_routes": len(snapshot.bus_routes),
        "bus_demand": len(snapshot.bus_demand),
        "events": len(snapshot.events),
        "walk_edges": len(snapshot.walk_edges),
        "bim_storeys": len(snapshot.bim_storeys),
        "bim_spaces": len(snapshot.bim_spaces),
    }
    required_tables = [
        "buildings",
        "rooms",
        "sections",
        "schedules",
        "energy",
        "bus_routes",
        "bus_demand",
        "events",
        "walk_edges",
        "bim_storeys",
        "bim_spaces",
        "scenario_runs",
        "feedback",
    ]
    gold_views = [
        "gold_room_utilization",
        "gold_building_energy_daily",
        "gold_bus_pressure",
        "gold_schedule_pressure",
        "gold_campus_overview",
    ]

    building_ids = {building.id for building in snapshot.buildings}
    room_ids = {room.id for room in snapshot.rooms}
    section_ids = {section.id for section in snapshot.sections}
    route_ids = {route.id for route in snapshot.bus_routes}
    checks = []

    empty_core = [name for name, count in counts.items() if count == 0 and name not in {"events"}]
    checks.append(_quality_check(
        "Canonical domain coverage",
        "fail" if empty_core else "pass",
        f"{len(empty_core)} required domain(s) have no records." if empty_core else "All core governed domains contain records.",
        [
            f"SQL: SELECT 'buildings' AS table_name, COUNT(*) AS rows FROM {namespace}.buildings UNION ALL SELECT 'rooms', COUNT(*) FROM {namespace}.rooms UNION ALL SELECT 'sections', COUNT(*) FROM {namespace}.sections;",
            f"Required tables: {', '.join(required_tables)}.",
        ],
    ))

    room_building_gaps = sorted({room.building_id for room in snapshot.rooms if room.building_id not in building_ids})
    checks.append(_quality_check(
        "Room to building references",
        "fail" if room_building_gaps else "pass",
        f"{len(room_building_gaps)} room building_id value(s) do not resolve." if room_building_gaps else "Every room resolves to a governed building.",
        [
            f"SQL: SELECT r.* FROM {namespace}.rooms r LEFT ANTI JOIN {namespace}.buildings b ON b.id = r.building_id;",
            f"Missing building_id values: {', '.join(room_building_gaps[:8]) if room_building_gaps else 'none'}.",
        ],
        "space",
    ))

    schedule_room_gaps = sorted({session.room_id for session in snapshot.schedules if session.room_id not in room_ids})
    checks.append(_quality_check(
        "Schedule to room references",
        "fail" if schedule_room_gaps else "pass",
        f"{len(schedule_room_gaps)} scheduled room_id value(s) do not resolve." if schedule_room_gaps else "Every schedule row resolves to a governed room.",
        [
            f"SQL: SELECT s.* FROM {namespace}.schedules s LEFT ANTI JOIN {namespace}.rooms r ON r.id = s.room_id;",
            f"Missing room_id values: {', '.join(schedule_room_gaps[:8]) if schedule_room_gaps else 'none'}.",
        ],
        "schedule",
    ))

    schedule_section_gaps = sorted({session.section_id for session in snapshot.schedules if session.section_id not in section_ids})
    checks.append(_quality_check(
        "Schedule to section references",
        "fail" if schedule_section_gaps else "pass",
        f"{len(schedule_section_gaps)} scheduled section_id value(s) do not resolve." if schedule_section_gaps else "Every schedule row resolves to a governed section.",
        [
            f"SQL: SELECT s.* FROM {namespace}.schedules s LEFT ANTI JOIN {namespace}.sections sec ON sec.id = s.section_id;",
            f"Missing section_id values: {', '.join(schedule_section_gaps[:8]) if schedule_section_gaps else 'none'}.",
        ],
        "schedule",
    ))

    bim_storey_ids = {storey.id for storey in snapshot.bim_storeys}
    bim_space_room_ids = {space.room_id for space in snapshot.bim_spaces if space.room_id}
    bim_storey_gaps = sorted({space.storey_id for space in snapshot.bim_spaces if space.storey_id not in bim_storey_ids})
    unmapped_rooms = sorted(room_ids - bim_space_room_ids)
    checks.append(_quality_check(
        "Operational room to IFC space mapping",
        "fail" if bim_storey_gaps or unmapped_rooms else "pass",
        (
            f"{len(unmapped_rooms)} room(s) lack an IFC space and {len(bim_storey_gaps)} storey reference(s) do not resolve."
            if bim_storey_gaps or unmapped_rooms
            else "Every governed room resolves to an IFC-derived space and storey."
        ),
        [
            f"SQL: SELECT r.id FROM {namespace}.rooms r LEFT ANTI JOIN {namespace}.bim_spaces s ON s.room_id = r.id;",
            f"Mapped rooms: {len(bim_space_room_ids)} / {len(room_ids)}; IFC spaces: {len(snapshot.bim_spaces)}.",
        ],
        "space",
    ))

    energy_building_gaps = sorted({reading.building_id for reading in snapshot.energy if reading.building_id not in building_ids})
    checks.append(_quality_check(
        "Energy to building references",
        "fail" if energy_building_gaps else "pass",
        f"{len(energy_building_gaps)} energy building_id value(s) do not resolve." if energy_building_gaps else "Every energy reading resolves to a governed building.",
        [
            f"SQL: SELECT e.* FROM {namespace}.energy e LEFT ANTI JOIN {namespace}.buildings b ON b.id = e.building_id;",
            f"Missing building_id values: {', '.join(energy_building_gaps[:8]) if energy_building_gaps else 'none'}.",
        ],
        "energy",
    ))

    demand_route_gaps = sorted({demand.route_id for demand in snapshot.bus_demand if demand.route_id not in route_ids})
    checks.append(_quality_check(
        "Bus demand to route references",
        "fail" if demand_route_gaps else "pass",
        f"{len(demand_route_gaps)} bus demand route_id value(s) do not resolve." if demand_route_gaps else "Every bus demand row resolves to a governed route.",
        [
            f"SQL: SELECT d.* FROM {namespace}.bus_demand d LEFT ANTI JOIN {namespace}.bus_routes r ON r.id = d.route_id;",
            f"Missing route_id values: {', '.join(demand_route_gaps[:8]) if demand_route_gaps else 'none'}.",
        ],
        "mobility",
    ))

    event_building_gaps = sorted({event.building_id for event in snapshot.events if event.building_id not in building_ids})
    edge_building_gaps = sorted({
        building_id
        for edge in snapshot.walk_edges
        for building_id in (edge.from_building_id, edge.to_building_id)
        if building_id not in building_ids
    })
    topology_gaps = sorted(set(event_building_gaps + edge_building_gaps))
    checks.append(_quality_check(
        "Event and topology references",
        "fail" if topology_gaps else "pass",
        f"{len(topology_gaps)} event/walk-edge building reference(s) do not resolve." if topology_gaps else "Events and walk edges resolve to governed buildings.",
        [
            f"SQL: SELECT e.* FROM {namespace}.events e LEFT ANTI JOIN {namespace}.buildings b ON b.id = e.building_id;",
            f"SQL: SELECT w.* FROM {namespace}.walk_edges w WHERE w.from_building_id NOT IN (SELECT id FROM {namespace}.buildings) OR w.to_building_id NOT IN (SELECT id FROM {namespace}.buildings);",
            f"Missing building_id values: {', '.join(topology_gaps[:8]) if topology_gaps else 'none'}.",
        ],
        "events",
    ))

    duplicate_groups = {
        "buildings": _duplicates([item.id for item in snapshot.buildings]),
        "rooms": _duplicates([item.id for item in snapshot.rooms]),
        "sections": _duplicates([item.id for item in snapshot.sections]),
        "schedules": _duplicates([item.id for item in snapshot.schedules]),
        "bus_routes": _duplicates([item.id for item in snapshot.bus_routes]),
        "events": _duplicates([item.id for item in snapshot.events]),
        "bim_storeys": _duplicates([item.id for item in snapshot.bim_storeys]),
        "bim_spaces": _duplicates([item.id for item in snapshot.bim_spaces]),
    }
    duplicate_total = sum(len(items) for items in duplicate_groups.values())
    duplicate_summary = "; ".join(f"{table}: {', '.join(values[:5])}" for table, values in duplicate_groups.items() if values)
    checks.append(_quality_check(
        "Primary key uniqueness",
        "fail" if duplicate_total else "pass",
        f"{duplicate_total} duplicate primary key value(s) found." if duplicate_total else "No duplicate IDs were found in governed entity tables.",
        [
            f"SQL: SELECT id, COUNT(*) FROM {namespace}.rooms GROUP BY id HAVING COUNT(*) > 1;",
            duplicate_summary or "Duplicate groups: none.",
        ],
    ))

    latest_energy_date = max((reading.timestamp.date() for reading in snapshot.energy), default=None)
    checks.append(_quality_check(
        "Energy time coverage",
        "warn" if latest_energy_date is None else "pass",
        f"No energy readings are available." if latest_energy_date is None else f"Latest energy date available: {latest_energy_date.isoformat()}.",
        [
            f"SQL: SELECT MAX(DATE(timestamp)) AS latest_energy_date, COUNT(*) AS readings FROM {namespace}.energy;",
            "Energy values are model/readings data in the governed twin, not live occupancy.",
        ],
        "energy",
    ))

    metrics = compute_metrics(snapshot)
    checks.append(_quality_check(
        "Operational pressure surfaced",
        "warn" if metrics.rooms_over_capacity or metrics.peak_transport_load_pct >= 85 else "pass",
        (
            f"{metrics.rooms_over_capacity} over-capacity session(s); peak transport load {metrics.peak_transport_load_pct}%."
            if metrics.rooms_over_capacity or metrics.peak_transport_load_pct >= 85
            else "No major capacity or mobility pressure thresholds are crossed."
        ),
        [
            f"SQL: SELECT * FROM {namespace}.gold_schedule_pressure WHERE over_capacity = true;",
            f"SQL: SELECT * FROM {namespace}.gold_bus_pressure ORDER BY load_pct DESC;",
        ],
        "operations",
    ))

    checks.append(_quality_check(
        "Gold view contract",
        "pass",
        "The governed analysis surface is defined through the five CampusTwin gold views.",
        [
            f"Gold views: {', '.join(f'{namespace}.{view}' for view in gold_views)}.",
            "Genie answers should prefer these views for operational questions.",
        ],
    ))

    score = 100
    for check in checks:
        if check["status"] == "fail":
            score -= 18
        elif check["status"] == "warn":
            score -= 6
    status = "ready" if score >= 90 else "investigate" if score >= 70 else "blocked"
    return {
        "source": source,
        "status": status,
        "score": max(0, score),
        "counts": counts,
        "checks": checks,
        "required_tables": [f"{namespace}.{table}" for table in required_tables],
        "gold_views": [f"{namespace}.{view}" for view in gold_views],
        "evidence": [
            "Readiness is computed from the active CampusTwin snapshot and governed schema contract.",
            "Scheduled utilization is not live occupancy.",
        ],
    }


@router.get("/scenarios/compare")
async def scenario_compare(runtime: RuntimeContext = Depends(get_runtime)):
    try:
        scenarios = await runtime.repository.list_scenarios()
    except Exception as exc:
        if settings.data_mode == "databricks":
            raise HTTPException(status_code=502, detail=f"Could not compare scenarios: {exc}") from exc
        scenarios = []

    rows = []
    for scenario in scenarios:
        critical_effects = sum(1 for effect in scenario.cascade_effects if effect.severity == "critical")
        score_delta = round(scenario.score - scenario.before.operational_score, 1)
        rows.append({
            "scenario_id": scenario.scenario_id,
            "name": scenario.name,
            "objective": scenario.objective,
            "verdict": scenario.verdict,
            "score": scenario.score,
            "score_delta": score_delta,
            "capacity_fit_delta": round(scenario.after.capacity_fit_pct - scenario.before.capacity_fit_pct, 1),
            "transport_load_delta": round(scenario.after.peak_transport_load_pct - scenario.before.peak_transport_load_pct, 1),
            "energy_delta_kwh": round(scenario.after.latest_day_energy_kwh - scenario.before.latest_day_energy_kwh, 1),
            "conflict_delta": scenario.after.schedule_conflicts - scenario.before.schedule_conflicts,
            "critical_effects": critical_effects,
            "created_at": scenario.created_at,
        })

    verdict_rank = {"recommended": 2, "review": 1, "reject": 0}
    ranked = sorted(rows, key=lambda item: (verdict_rank[item["verdict"]], item["score"], -item["critical_effects"]), reverse=True)
    best = ranked[0] if ranked else None
    recommendation = "No saved scenarios are available for comparison."
    if best:
        if best["verdict"] == "recommended":
            recommendation = f"Lead with {best['name']}: it has the strongest saved verdict and a {best['score']} decision score."
        elif best["verdict"] == "review":
            recommendation = f"Review {best['name']} first: it is the strongest saved option, but still needs operator judgment."
        else:
            recommendation = "All saved scenarios are rejected; investigate constraints before implementation."

    return {
        "source": runtime.source,
        "count": len(rows),
        "best": best,
        "scenarios": ranked,
        "recommendation": recommendation,
        "evidence": [
            "Compared saved scenario_runs by verdict, decision score, score delta, critical effects, and primary metric deltas.",
            "Scenario comparison is based on modeled counterfactual results, not direct changes to governed facts.",
        ],
    }


@router.post("/genie/chat", response_model=GenieAnswer)
async def genie_chat(payload: GenieRequest, request: Request, runtime: RuntimeContext = Depends(get_runtime)) -> GenieAnswer:
    snapshot, _ = await load_snapshot(request, runtime)
    space_id = settings.genie_space_id
    if not space_id:
        try:
            space_id = await runtime.repository.get_config("genie_space_id")
        except Exception:
            space_id = None
    service = IntelligenceService(runtime.genie)
    try:
        return await service.answer(snapshot, payload.question, genie_space_id=space_id, conversation_id=payload.conversation_id)
    except Exception as exc:
        if settings.data_mode == "databricks":
            raise HTTPException(status_code=502, detail=f"Genie request failed: {exc}") from exc
        return await IntelligenceService(None).answer(snapshot, payload.question)


@router.post("/feedback", response_model=FeedbackRecord)
async def submit_feedback(payload: FeedbackRequest, runtime: RuntimeContext = Depends(get_runtime)) -> FeedbackRecord:
    error = 100 * abs(payload.observed - payload.predicted) / max(abs(payload.predicted), 1e-9)
    record = FeedbackRecord(
        **payload.model_dump(),
        id=str(uuid.uuid4()),
        relative_error_pct=round(error, 2),
        created_at=datetime.now(timezone.utc),
    )
    try:
        await runtime.repository.save_feedback(record)
    except Exception as exc:
        if settings.data_mode == "databricks":
            raise HTTPException(status_code=502, detail=f"Could not save feedback: {exc}") from exc
    return record


@router.get("/feedback/history")
async def feedback_history(runtime: RuntimeContext = Depends(get_runtime)):
    try:
        records = await runtime.repository.list_feedback()
    except Exception as exc:
        if settings.data_mode == "databricks":
            raise HTTPException(status_code=502, detail=f"Could not load feedback history: {exc}") from exc
        records = []
    avg_error = round(sum(item.relative_error_pct for item in records) / len(records), 2) if records else 0.0
    return {
        "source": runtime.source,
        "count": len(records),
        "avg_relative_error_pct": avg_error,
        "records": [record.model_dump() for record in records],
    }


@router.post("/admin/bootstrap", response_model=BootstrapResult)
async def bootstrap(payload: BootstrapRequest, request: Request, runtime: RuntimeContext = Depends(get_runtime)) -> BootstrapResult:
    if not settings.allow_bootstrap:
        raise HTTPException(status_code=403, detail="Bootstrap is disabled by configuration")
    if not (settings.databricks_host and settings.warehouse_id and runtime.identity.token):
        raise HTTPException(status_code=409, detail="Databricks host, SQL warehouse and authorized user token are required")
    rest = DatabricksREST(settings.databricks_host, runtime.identity.token)
    executor = StatementExecutor(rest, settings.warehouse_id, wait_timeout=settings.sql_wait_timeout)
    bootstrapper = DatabricksBootstrapper(executor, runtime.genie or GenieClient(rest), settings.namespace, settings.warehouse_id)
    parent_path = settings.genie_parent_path
    if not parent_path and "@" in runtime.identity.user_key:
        parent_path = f"/Workspace/Users/{runtime.identity.user_key}"
    if payload.create_genie and not parent_path:
        raise HTTPException(
            status_code=409,
            detail=(
                "Creating a Genie Agent requires a parent workspace folder. Set "
                "CAMPUS_TWIN_GENIE_PARENT_PATH (for example /Workspace/Users/you@example.com) "
                "when running outside Databricks Apps."
            ),
        )
    try:
        steps, space_id = await bootstrapper.run(
            create_genie=payload.create_genie,
            force_reseed=payload.force_reseed,
            genie_parent_path=parent_path,
        )
    except (DatabricksAPIError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    await request.app.state.snapshot_cache.clear()
    return BootstrapResult(ok=True, steps=steps, namespace=settings.namespace, genie_space_id=space_id)
