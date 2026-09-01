from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date

from ..models import CampusMetrics, CampusSnapshot


DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
AVAILABLE_HOURS_PER_ROOM = 10 * 6


def _overlap(a_start: int, a_duration: int, b_start: int, b_duration: int) -> bool:
    return a_start < b_start + b_duration and b_start < a_start + a_duration


def schedule_conflicts(snapshot: CampusSnapshot) -> int:
    by_room_day: dict[tuple[str, str], list] = defaultdict(list)
    for session in snapshot.schedules:
        by_room_day[(session.room_id, session.day)].append(session)
    conflicts = 0
    for sessions in by_room_day.values():
        sessions = sorted(sessions, key=lambda s: s.start_hour)
        for i, a in enumerate(sessions):
            for b in sessions[i + 1 :]:
                if b.start_hour >= a.start_hour + a.duration_hours:
                    break
                if _overlap(a.start_hour, a.duration_hours, b.start_hour, b.duration_hours):
                    conflicts += 1
    return conflicts


def compute_metrics(snapshot: CampusSnapshot) -> CampusMetrics:
    room_by_id = {r.id: r for r in snapshot.rooms}
    section_by_id = {s.id: s for s in snapshot.sections}

    room_hours = Counter()
    capacity_ok = 0
    over_capacity = 0
    for session in snapshot.schedules:
        room_hours[session.room_id] += session.duration_hours
        room = room_by_id.get(session.room_id)
        section = section_by_id.get(session.section_id)
        if room and section:
            if section.enrollment <= room.capacity:
                capacity_ok += 1
            else:
                over_capacity += 1

    room_util = 0.0
    if snapshot.rooms:
        room_util = 100.0 * sum(room_hours.values()) / (len(snapshot.rooms) * AVAILABLE_HOURS_PER_ROOM)
    capacity_fit = 100.0 * capacity_ok / max(1, len(snapshot.schedules))

    if snapshot.energy:
        latest_day = max(e.timestamp.date() for e in snapshot.energy)
        energy = sum(e.kwh for e in snapshot.energy if e.timestamp.date() == latest_day)
    else:
        energy = 0.0

    route_by_id = {r.id: r for r in snapshot.bus_routes}
    peak_load = 0.0
    for demand in snapshot.bus_demand:
        route = route_by_id.get(demand.route_id)
        if route:
            capacity = route.capacity_per_bus * route.active_buses
            peak_load = max(peak_load, 100.0 * demand.passengers / max(1, capacity))

    avg_walk = sum(e.minutes for e in snapshot.walk_edges) / max(1, len(snapshot.walk_edges))
    conflicts = schedule_conflicts(snapshot)

    # Operational score is a compact current-state quality signal, not a claim of ground truth.
    util_target_score = max(0.0, 100.0 - abs(room_util - 65.0) * 1.2)
    transport_score = max(0.0, 100.0 - max(0.0, peak_load - 82.0) * 1.6)
    conflict_score = max(0.0, 100.0 - conflicts * 12.0)
    operational_score = (
        0.25 * util_target_score
        + 0.30 * capacity_fit
        + 0.25 * transport_score
        + 0.20 * conflict_score
    )

    return CampusMetrics(
        room_utilization_pct=round(room_util, 1),
        capacity_fit_pct=round(capacity_fit, 1),
        schedule_conflicts=conflicts,
        latest_day_energy_kwh=round(energy, 1),
        peak_transport_load_pct=round(peak_load, 1),
        rooms_over_capacity=over_capacity,
        average_walk_minutes=round(avg_walk, 1),
        active_events=len(snapshot.events),
        operational_score=round(max(0.0, min(100.0, operational_score)), 1),
    )


def building_pressure(snapshot: CampusSnapshot) -> list[dict[str, float | str | int]]:
    room_by_id = {r.id: r for r in snapshot.rooms}
    section_by_id = {s.id: s for s in snapshot.sections}
    agg: dict[str, dict[str, float]] = defaultdict(lambda: {"hours": 0.0, "sessions": 0.0, "overflow": 0.0})
    for session in snapshot.schedules:
        room = room_by_id.get(session.room_id)
        sec = section_by_id.get(session.section_id)
        if not room or not sec:
            continue
        a = agg[room.building_id]
        a["hours"] += session.duration_hours
        a["sessions"] += 1
        if sec.enrollment > room.capacity:
            a["overflow"] += 1
    building_by_id = {b.id: b for b in snapshot.buildings}
    result = []
    for bid, a in agg.items():
        room_count = sum(1 for r in snapshot.rooms if r.building_id == bid)
        util = 100 * a["hours"] / max(1, room_count * AVAILABLE_HOURS_PER_ROOM)
        result.append({
            "building_id": bid,
            "name": building_by_id[bid].name,
            "utilization_pct": round(util, 1),
            "sessions": int(a["sessions"]),
            "over_capacity": int(a["overflow"]),
        })
    return sorted(result, key=lambda x: (-float(x["utilization_pct"]), str(x["building_id"])))


def route_pressure(snapshot: CampusSnapshot) -> list[dict[str, float | str | int]]:
    route_by_id = {r.id: r for r in snapshot.bus_routes}
    peaks: dict[str, tuple[float, object]] = {}
    for d in snapshot.bus_demand:
        route = route_by_id.get(d.route_id)
        if not route:
            continue
        load = 100 * d.passengers / max(1, route.capacity_per_bus * route.active_buses)
        if d.route_id not in peaks or load > peaks[d.route_id][0]:
            peaks[d.route_id] = (load, d)
    out = []
    for rid, route in route_by_id.items():
        load, demand = peaks.get(rid, (0.0, None))
        out.append({
            "route_id": rid,
            "name": route.name,
            "peak_load_pct": round(load, 1),
            "active_buses": route.active_buses,
            "headway_minutes": route.headway_minutes,
            "peak_timestamp": demand.timestamp.isoformat() if demand else None,
        })
    return sorted(out, key=lambda x: -float(x["peak_load_pct"]))
