from __future__ import annotations

import random
import uuid
from collections import Counter
from datetime import datetime, timezone
from statistics import median

from ..models import (
    ActionType,
    CampusMetrics,
    CampusSnapshot,
    CascadeEffect,
    ConfidenceBand,
    MetricDelta,
    ScenarioBIMImpact,
    ScenarioRequest,
    ScenarioResult,
)
from .metrics import compute_metrics


class ScenarioValidationError(ValueError):
    pass


DIRECTIONS = {
    "room_utilization_pct": "contextual",
    "capacity_fit_pct": "higher-is-better",
    "schedule_conflicts": "lower-is-better",
    "latest_day_energy_kwh": "lower-is-better",
    "peak_transport_load_pct": "lower-is-better",
}
LABELS = {
    "room_utilization_pct": ("Room utilization", "%"),
    "capacity_fit_pct": ("Capacity fit", "%"),
    "schedule_conflicts": ("Schedule conflicts", ""),
    "latest_day_energy_kwh": ("Latest-day energy", "kWh"),
    "peak_transport_load_pct": ("Peak transport load", "%"),
}


def _pick_room(snapshot: CampusSnapshot, *, section_id: str, exclude: set[str] | None = None) -> str | None:
    exclude = exclude or set()
    sec = next((s for s in snapshot.sections if s.id == section_id), None)
    if not sec:
        return None
    hours = Counter()
    for sch in snapshot.schedules:
        hours[sch.room_id] += sch.duration_hours
    candidates = [r for r in snapshot.rooms if r.id not in exclude and r.capacity >= sec.enrollment]
    candidates.sort(key=lambda r: (hours[r.id], r.capacity - sec.enrollment, r.id))
    return candidates[0].id if candidates else None


def _energy_scale_for_building(snapshot: CampusSnapshot, building_id: str, scale: float) -> None:
    for reading in snapshot.energy:
        if reading.building_id == building_id:
            reading.kwh = max(0.0, reading.kwh * scale)


def apply_actions(snapshot: CampusSnapshot, request: ScenarioRequest) -> tuple[CampusSnapshot, list[str], list[CascadeEffect]]:
    twin = snapshot.model_copy(deep=True)
    log: list[str] = []
    effects: list[CascadeEffect] = []
    room_by_id = {r.id: r for r in twin.rooms}
    section_by_id = {s.id: s for s in twin.sections}
    route_by_id = {r.id: r for r in twin.bus_routes}

    for action in request.actions:
        p = action.params
        if action.type == ActionType.CLOSE_ROOM:
            room_id = str(p.get("room_id", ""))
            room = room_by_id.get(room_id)
            if not room:
                raise ScenarioValidationError(f"Unknown room_id: {room_id}")
            impacted = [s for s in twin.schedules if s.room_id == room_id]
            moved = 0
            unplaced = 0
            for session in impacted:
                target = _pick_room(twin, section_id=session.section_id, exclude={room_id})
                if target:
                    session.room_id = target
                    moved += 1
                else:
                    unplaced += 1
            _energy_scale_for_building(twin, room.building_id, 0.985)
            log.append(f"Closed {room.name}: reassigned {moved}/{len(impacted)} scheduled sessions")
            effects.append(CascadeEffect(
                domain="space", severity="watch" if unplaced == 0 else "critical",
                title=f"{room.name} closure redistributes teaching load",
                explanation=f"{moved} sessions were moved to feasible rooms; {unplaced} could not be placed by the deterministic feasibility rule. Building energy is modeled 1.5% lower as an indicative operational effect.",
            ))

        elif action.type == ActionType.RELOCATE_SECTION:
            section_id = str(p.get("section_id", ""))
            target_room_id = str(p.get("target_room_id", ""))
            sec = section_by_id.get(section_id)
            room = room_by_id.get(target_room_id)
            if not sec or not room:
                raise ScenarioValidationError("relocate_section requires valid section_id and target_room_id")
            changed = 0
            old_buildings: set[str] = set()
            for session in twin.schedules:
                if session.section_id == section_id:
                    old = room_by_id.get(session.room_id)
                    if old:
                        old_buildings.add(old.building_id)
                    session.room_id = target_room_id
                    changed += 1
            if changed == 0:
                raise ScenarioValidationError(f"Section {section_id} has no scheduled sessions")
            for bid in old_buildings:
                _energy_scale_for_building(twin, bid, 0.992)
            _energy_scale_for_building(twin, room.building_id, 1.012)
            severity = "critical" if sec.enrollment > room.capacity else "info"
            log.append(f"Relocated all {changed} sessions of {section_id} to {room.name}")
            effects.append(CascadeEffect(
                domain="experience", severity=severity,
                title="Section relocation changes capacity and travel patterns",
                explanation=f"{section_id} ({sec.enrollment} students) now uses {room.name} ({room.capacity} seats). The energy model shifts load from the previous buildings to {room.building_id}.",
            ))

        elif action.type == ActionType.RESCHEDULE_SECTION:
            section_id = str(p.get("section_id", ""))
            day = str(p.get("day", ""))
            start_hour = int(p.get("start_hour", -1))
            target_room_id = p.get("target_room_id")
            if section_id not in section_by_id or day not in {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat"} or not (7 <= start_hour <= 20):
                raise ScenarioValidationError("reschedule_section requires a valid section_id, day and start_hour")
            sessions = [s for s in twin.schedules if s.section_id == section_id]
            if not sessions:
                raise ScenarioValidationError(f"Section {section_id} has no scheduled sessions")
            session = sessions[0]
            session.day = day
            session.start_hour = start_hour
            if target_room_id:
                if str(target_room_id) not in room_by_id:
                    raise ScenarioValidationError(f"Unknown target_room_id: {target_room_id}")
                session.room_id = str(target_room_id)
            log.append(f"Rescheduled {section_id} session {session.id} to {day} {start_hour}:00")
            effects.append(CascadeEffect(
                domain="schedule", severity="watch",
                title="Timetable topology changed",
                explanation="The selected section was moved to a new time. Conflict and room-capacity metrics were recomputed across the full timetable.",
            ))

        elif action.type == ActionType.CHANGE_INTAKE:
            section_id = str(p.get("section_id", ""))
            enrollment = int(p.get("enrollment", 0))
            sec = section_by_id.get(section_id)
            if not sec or enrollment < 1 or enrollment > 500:
                raise ScenarioValidationError("change_intake requires a valid section_id and enrollment between 1 and 500")
            before = sec.enrollment
            sec.enrollment = enrollment
            ratio = enrollment / max(1, before)
            # Approximate associated daytime energy and mobility demand; this is intentionally explicit.
            for e in twin.energy:
                e.kwh *= 1 + (ratio - 1) * 0.025
            for d in twin.bus_demand:
                d.passengers = max(0, round(d.passengers * (1 + (ratio - 1) * 0.06)))
            log.append(f"Changed {section_id} enrollment from {before} to {enrollment}")
            effects.append(CascadeEffect(
                domain="risk", severity="watch" if ratio < 1.2 else "critical",
                title="Intake change propagates beyond classroom capacity",
                explanation="Capacity fit, modeled transport demand and a small occupancy-linked energy factor are recomputed. The transport/energy multipliers are scenario assumptions, not measured causal coefficients.",
            ))

        elif action.type == ActionType.ADJUST_BUS_FREQUENCY:
            route_id = str(p.get("route_id", ""))
            route = route_by_id.get(route_id)
            if not route:
                raise ScenarioValidationError(f"Unknown route_id: {route_id}")
            old_buses, old_headway = route.active_buses, route.headway_minutes
            if "active_buses" in p:
                route.active_buses = max(1, min(20, int(p["active_buses"])))
            if "headway_minutes" in p:
                route.headway_minutes = max(5, min(90, int(p["headway_minutes"])))
            log.append(f"Adjusted {route.name}: buses {old_buses}→{route.active_buses}, headway {old_headway}→{route.headway_minutes} min")
            effects.append(CascadeEffect(
                domain="transport", severity="info",
                title=f"{route.name} service capacity changed",
                explanation="Peak load is recomputed against active vehicle capacity. Headway is retained as an operational trade-off even though the bundled demand model does not synthesize new passenger arrivals.",
            ))

    return twin, log, effects


def _metric_deltas(before: CampusMetrics, after: CampusMetrics) -> list[MetricDelta]:
    out: list[MetricDelta] = []
    for key, direction in DIRECTIONS.items():
        b = float(getattr(before, key))
        a = float(getattr(after, key))
        label, unit = LABELS[key]
        out.append(MetricDelta(key=key, label=label, before=b, after=a, delta=round(a - b, 2), unit=unit, direction=direction))
    return out


def _score(before: CampusMetrics, after: CampusMetrics, objective: str) -> float:
    # Improvements are measured relative to the current state; balanced starts from the new operational score.
    cap_gain = after.capacity_fit_pct - before.capacity_fit_pct
    conflict_gain = before.schedule_conflicts - after.schedule_conflicts
    transport_gain = before.peak_transport_load_pct - after.peak_transport_load_pct
    energy_pct_gain = 100 * (before.latest_day_energy_kwh - after.latest_day_energy_kwh) / max(1.0, before.latest_day_energy_kwh)
    util_penalty = abs(after.room_utilization_pct - 65.0) - abs(before.room_utilization_pct - 65.0)
    weights = {
        "balanced": (0.24, 2.8, 0.18, 0.28, 0.22),
        "space": (0.48, 3.4, 0.08, 0.16, 0.28),
        "energy": (0.18, 2.2, 0.08, 0.52, 0.12),
        "transport": (0.16, 2.0, 0.50, 0.12, 0.20),
        "resilience": (0.26, 4.0, 0.18, 0.16, 0.20),
    }[objective]
    w_cap, w_conf, w_trans, w_energy, w_util = weights
    adjustment = w_cap * cap_gain + w_conf * conflict_gain + w_trans * transport_gain + w_energy * energy_pct_gain - w_util * util_penalty
    return round(max(0.0, min(100.0, after.operational_score + adjustment)), 1)


def _confidence(before: CampusMetrics, after: CampusMetrics, samples: int, seed: int) -> list[ConfidenceBand]:
    rng = random.Random(seed)
    configs = [
        ("Capacity fit", after.capacity_fit_pct, 1.4),
        ("Energy kWh", after.latest_day_energy_kwh, max(2.0, after.latest_day_energy_kwh * 0.025)),
        ("Peak transport load", after.peak_transport_load_pct, 3.2),
        ("Operational score", after.operational_score, 2.0),
    ]
    result = []
    for metric, center, sigma in configs:
        values = sorted(max(0.0, rng.gauss(center, sigma)) for _ in range(samples))
        p10 = values[int(0.10 * (samples - 1))]
        p90 = values[int(0.90 * (samples - 1))]
        result.append(ConfidenceBand(metric=metric, p10=round(p10, 1), median=round(median(values), 1), p90=round(p90, 1)))
    return result


def _spatial_impact(snapshot: CampusSnapshot, twin: CampusSnapshot, request: ScenarioRequest) -> list[ScenarioBIMImpact]:
    before_sessions = {session.id: session for session in snapshot.schedules}
    after_sessions = {session.id: session for session in twin.schedules}
    impacted_rooms: list[tuple[str, str]] = []

    for action in request.actions:
        params = action.params
        if action.type == ActionType.CLOSE_ROOM:
            closed_room_id = str(params.get("room_id", ""))
            impacted_rooms.append((closed_room_id, "source"))
            for session_id, before_session in before_sessions.items():
                if before_session.room_id == closed_room_id:
                    destination = after_sessions.get(session_id)
                    if destination and destination.room_id != closed_room_id:
                        impacted_rooms.append((destination.room_id, "destination"))
        elif action.type == ActionType.RELOCATE_SECTION:
            section_id = str(params.get("section_id", ""))
            for session in snapshot.schedules:
                if session.section_id == section_id:
                    impacted_rooms.append((session.room_id, "source"))
            for session in twin.schedules:
                if session.section_id == section_id:
                    impacted_rooms.append((session.room_id, "destination"))
        elif action.type == ActionType.RESCHEDULE_SECTION:
            section_id = str(params.get("section_id", ""))
            before_session = next((session for session in snapshot.schedules if session.section_id == section_id), None)
            if before_session:
                impacted_rooms.append((before_session.room_id, "source"))
                after_session = after_sessions.get(before_session.id)
                if after_session:
                    impacted_rooms.append((after_session.room_id, "destination"))
        elif action.type == ActionType.CHANGE_INTAKE:
            section_id = str(params.get("section_id", ""))
            for session in twin.schedules:
                if session.section_id == section_id:
                    impacted_rooms.append((session.room_id, "affected"))

    space_by_room = {space.room_id: space for space in twin.bim_spaces if space.room_id}
    result: list[ScenarioBIMImpact] = []
    seen: set[tuple[str, str]] = set()
    for room_id, role in impacted_rooms:
        key = (room_id, role)
        space = space_by_room.get(room_id)
        if not space or key in seen:
            continue
        seen.add(key)
        result.append(ScenarioBIMImpact(
            room_id=room_id,
            bim_space_id=space.id,
            render_object_id=space.render_object_id,
            source_model_id=space.source_model_id,
            role=role,
        ))
    return result


def simulate(snapshot: CampusSnapshot, request: ScenarioRequest) -> ScenarioResult:
    before = compute_metrics(snapshot)
    twin, log, effects = apply_actions(snapshot, request)
    after = compute_metrics(twin)
    deltas = _metric_deltas(before, after)
    score = _score(before, after, request.objective)

    if after.schedule_conflicts > before.schedule_conflicts + 2 or after.capacity_fit_pct < 85 or after.peak_transport_load_pct > 135:
        verdict = "reject"
    elif score >= 70 and after.schedule_conflicts <= before.schedule_conflicts + 1:
        verdict = "recommended"
    else:
        verdict = "review"

    # Add derived effects only when meaningful.
    if after.peak_transport_load_pct > 100:
        effects.append(CascadeEffect(domain="transport", severity="critical", title="Peak transport capacity is exceeded", explanation=f"Modeled peak route load reaches {after.peak_transport_load_pct:.1f}% of active vehicle capacity."))
    if after.capacity_fit_pct < before.capacity_fit_pct:
        effects.append(CascadeEffect(domain="space", severity="watch", title="Room capacity fit deteriorates", explanation=f"Capacity fit changes by {after.capacity_fit_pct - before.capacity_fit_pct:+.1f} percentage points."))
    if after.schedule_conflicts > before.schedule_conflicts:
        effects.append(CascadeEffect(domain="schedule", severity="critical", title="New timetable conflicts introduced", explanation=f"The scenario adds {after.schedule_conflicts - before.schedule_conflicts} overlapping room booking(s)."))

    scenario_id = str(uuid.uuid4())
    assumptions = [
        "Room utilization means scheduled-time utilization, not live physical occupancy.",
        "Energy effects are deterministic scenario coefficients over the provided baseline, not a trained causal model.",
        "Transport pressure uses observed/demo passenger demand divided by modeled active vehicle capacity.",
        "Monte Carlo bands express input-model uncertainty around the simulated result; they are not statistical confidence intervals from field trials.",
        "The current twin is deep-cloned. Scenario actions never mutate the baseline snapshot.",
    ]
    seed = int(uuid.UUID(scenario_id)) & 0xFFFFFFFF
    return ScenarioResult(
        scenario_id=scenario_id,
        name=request.name,
        objective=request.objective,
        verdict=verdict,
        score=score,
        before=before,
        after=after,
        deltas=deltas,
        cascade_effects=effects,
        confidence=_confidence(before, after, request.uncertainty_samples, seed),
        assumptions=assumptions,
        action_log=log,
        affected_bim_objects=_spatial_impact(snapshot, twin, request),
        created_at=datetime.now(timezone.utc),
    )
