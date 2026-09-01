from __future__ import annotations

import json
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

SEED = 20260830
random.seed(SEED)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "campus_snapshot.json"
DEPLOY_OUT = ROOT / "app" / "data" / "campus_snapshot.json"

BUILDINGS = [
    ("B01", "Main Block", "academic", 20, 22, 10600),
    ("B02", "CSE Block", "academic", 48, 20, 7800),
    ("B03", "ECE Block", "academic", 68, 28, 7200),
    ("B04", "Central Library", "learning", 43, 48, 5900),
    ("B05", "Innovation Lab", "laboratory", 66, 53, 4200),
    ("B06", "Student Centre", "amenity", 28, 62, 5100),
    ("B07", "Sports Complex", "sports", 15, 78, 9600),
    ("B08", "Admin & Auditorium", "administration", 58, 78, 6800),
]

ROOM_COUNTS = [9, 9, 8, 6, 8, 6, 5, 7]  # 58 total
ROOM_KIND_CYCLE = ["classroom", "classroom", "classroom", "lab", "seminar", "project"]
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
DEPTS = ["CSE", "ISE", "ECE", "EEE", "ME", "CV"]
COURSES = [
    "Distributed Systems", "Operating Systems", "Computer Networks", "DBMS",
    "Machine Learning", "Cloud Computing", "Embedded Systems", "VLSI",
    "Control Systems", "Thermodynamics", "Data Structures", "Algorithms",
    "Software Engineering", "Cyber Security", "IoT Systems", "Compiler Design",
]


def generate() -> dict:
    generated_at = datetime(2026, 8, 30, 18, 0, tzinfo=timezone.utc)
    buildings = [
        {"id": bid, "name": name, "kind": kind, "x": x, "y": y, "area_m2": area}
        for bid, name, kind, x, y, area in BUILDINGS
    ]

    rooms = []
    for b_idx, (bid, _, _, _, _, _) in enumerate(BUILDINGS):
        for i in range(ROOM_COUNTS[b_idx]):
            kind = ROOM_KIND_CYCLE[(i + b_idx) % len(ROOM_KIND_CYCLE)]
            base = {"lab": 34, "seminar": 52, "project": 28, "classroom": 64}[kind]
            cap = max(18, base + random.choice([-12, -6, 0, 8, 16, 24]))
            rooms.append({
                "id": f"{bid}-R{i+1:02d}",
                "building_id": bid,
                "name": f"{bid[-2:]}-{100 + i + 1}",
                "kind": kind,
                "capacity": cap,
                "floor": i // 3,
                "has_ac": kind != "project" or i % 2 == 0,
            })

    sections = []
    for i in range(47):
        dept = DEPTS[i % len(DEPTS)]
        course = COURSES[(i * 3 + i // 5) % len(COURSES)]
        sections.append({
            "id": f"SEC-{i+1:03d}",
            "course": course,
            "department": dept,
            "year": 1 + (i % 4),
            "enrollment": random.randint(28, 76),
        })

    # 3 weekly sessions per section => 141 sessions.
    schedules = []
    slots = [(d, h) for d in DAYS[:5] for h in [8, 10, 12, 14, 16]] + [("Sat", 9), ("Sat", 11)]
    occupancy = set()
    for s_idx, section in enumerate(sections):
        for n in range(3):
            sid = f"SCH-{s_idx*3+n+1:04d}"
            # Prefer room types and capacities that usually fit, leaving a few intentional pressure points.
            preferred = [r for r in rooms if r["capacity"] >= max(22, section["enrollment"] - (8 if s_idx % 13 == 0 else 0))]
            if not preferred:
                preferred = rooms[:]
            random.shuffle(preferred)
            placed = False
            for room in preferred:
                for _ in range(40):
                    day, hour = random.choice(slots)
                    key = (room["id"], day, hour)
                    if key not in occupancy:
                        occupancy.add(key)
                        schedules.append({
                            "id": sid,
                            "section_id": section["id"],
                            "room_id": room["id"],
                            "day": day,
                            "start_hour": hour,
                            "duration_hours": 2,
                            "session_type": "lab" if "lab" in room["kind"] else "lecture",
                        })
                        placed = True
                        break
                if placed:
                    break
            if not placed:
                room = random.choice(rooms)
                day, hour = random.choice(slots)
                schedules.append({
                    "id": sid, "section_id": section["id"], "room_id": room["id"],
                    "day": day, "start_hour": hour, "duration_hours": 2, "session_type": "lecture"
                })

    # Deliberately create three realistic capacity mismatches for the decision layer to surface.
    for idx in [7, 48, 103]:
        sec = next(s for s in sections if s["id"] == schedules[idx]["section_id"])
        small = min(rooms, key=lambda r: abs(r["capacity"] - max(18, sec["enrollment"] - 14)))
        schedules[idx]["room_id"] = small["id"]

    energy = []
    start = datetime(2026, 8, 24, tzinfo=timezone.utc)
    building_factor = {b[0]: 0.58 + idx * 0.08 for idx, b in enumerate(BUILDINGS)}
    for day in range(7):
        for hour in range(24):
            ts = start + timedelta(days=day, hours=hour)
            temp = 22.5 + 4.8 * math.sin((hour - 9) / 24 * math.tau) + random.uniform(-0.8, 0.8)
            work = 1.0 if 7 <= hour <= 19 and day < 6 else 0.38
            peak = 1.22 if hour in (10, 11, 14, 15) else 1.0
            for bid, _, kind, _, _, area in BUILDINGS:
                base = area / 1000 * building_factor[bid]
                type_factor = 1.24 if kind == "laboratory" else (1.12 if kind == "sports" else 1.0)
                kwh = base * work * peak * type_factor * (1 + max(0, temp - 25) * 0.03)
                kwh *= random.uniform(0.92, 1.08)
                energy.append({
                    "building_id": bid,
                    "timestamp": ts.isoformat(),
                    "kwh": round(kwh, 3),
                    "temperature_c": round(temp, 2),
                })

    bus_routes = [
        {"id": "R1", "name": "North Loop", "capacity_per_bus": 44, "active_buses": 3, "headway_minutes": 20, "origin": "Yeshwanthpur", "destination": "Campus Gate A"},
        {"id": "R2", "name": "East Express", "capacity_per_bus": 44, "active_buses": 3, "headway_minutes": 24, "origin": "Indiranagar", "destination": "Campus Gate B"},
        {"id": "R3", "name": "South Connector", "capacity_per_bus": 50, "active_buses": 4, "headway_minutes": 18, "origin": "Jayanagar", "destination": "Campus Gate A"},
        {"id": "R4", "name": "West Shuttle", "capacity_per_bus": 40, "active_buses": 2, "headway_minutes": 30, "origin": "Nagarbhavi", "destination": "Campus Gate C"},
    ]

    bus_demand = []
    # 5 days * 6 peak samples * 4 routes = 120 demand rows.
    for day in range(5):
        for h in [7, 8, 9, 16, 17, 18]:
            for r_idx, route in enumerate(bus_routes):
                rush = 1.42 if h in (8, 17) else 1.0
                route_factor = [0.82, 1.08, 0.9, 1.15][r_idx]
                passengers = int((route["capacity_per_bus"] * route["active_buses"] * 0.55) * rush * route_factor * random.uniform(0.88, 1.12))
                bus_demand.append({
                    "route_id": route["id"],
                    "timestamp": (start + timedelta(days=day, hours=h)).isoformat(),
                    "passengers": passengers,
                })

    events = [
        {"id": "EV-01", "name": "Placement Pre-Talk", "building_id": "B08", "day": "Mon", "start_hour": 16, "expected_attendance": 420},
        {"id": "EV-02", "name": "Robotics Workshop", "building_id": "B05", "day": "Tue", "start_hour": 14, "expected_attendance": 96},
        {"id": "EV-03", "name": "Hackathon Final", "building_id": "B02", "day": "Thu", "start_hour": 10, "expected_attendance": 180},
        {"id": "EV-04", "name": "Cultural Rehearsal", "building_id": "B06", "day": "Fri", "start_hour": 17, "expected_attendance": 260},
        {"id": "EV-05", "name": "Open Day", "building_id": "B01", "day": "Sat", "start_hour": 10, "expected_attendance": 680},
    ]

    edges = []
    for i, a in enumerate(BUILDINGS):
        distances = []
        for j, b in enumerate(BUILDINGS):
            if i == j:
                continue
            dx, dy = a[3] - b[3], a[4] - b[4]
            distances.append((math.hypot(dx, dy), b))
        for dist, b in sorted(distances)[:3]:
            if not any(e["from_building_id"] == b[0] and e["to_building_id"] == a[0] for e in edges):
                edges.append({"from_building_id": a[0], "to_building_id": b[0], "minutes": max(2, round(dist / 8))})

    return {
        "version": "demo-2026.08.30",
        "generated_at": generated_at.isoformat(),
        "buildings": buildings,
        "rooms": rooms,
        "sections": sections,
        "schedules": schedules,
        "energy": energy,
        "bus_routes": bus_routes,
        "bus_demand": bus_demand,
        "events": events,
        "walk_edges": edges,
    }


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = generate()
    payload = json.dumps(data, indent=2)
    OUT.write_text(payload, encoding="utf-8")
    DEPLOY_OUT.parent.mkdir(parents=True, exist_ok=True)
    DEPLOY_OUT.write_text(payload, encoding="utf-8")
    from extract_xkt_spatial import main as extract_xkt_spatial
    extract_xkt_spatial()
    print(f"Wrote {OUT} and {DEPLOY_OUT}")
    print({k: len(v) for k, v in data.items() if isinstance(v, list)})
