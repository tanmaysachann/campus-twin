from __future__ import annotations

import json
import urllib.request


BASE_URL = "http://127.0.0.1:8000"


def get(path: str) -> dict:
    with urllib.request.urlopen(f"{BASE_URL}{path}", timeout=90) as response:
        return json.loads(response.read())


def post(path: str, payload: dict) -> dict:
    request = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read())


def feasible_room(session: dict, rooms: list[dict], schedule: list[dict], excluded: set[str], day: str | None = None, start: int | None = None) -> dict:
    candidates = [
        room
        for room in rooms
        if room["id"] not in excluded and room["capacity"] >= session["enrollment"]
    ]
    if day is not None and start is not None:
        candidates = [
            room
            for room in candidates
            if not any(
                row["room_id"] == room["id"]
                and row["day"] == day
                and start < row["start_hour"] + row["duration_hours"]
                and row["start_hour"] < start + session["duration_hours"]
                for row in schedule
            )
        ]
    if not candidates:
        raise RuntimeError(f"No feasible room for {session['section_id']}")
    return sorted(candidates, key=lambda room: (room["scheduled_hours"], room["capacity"] - session["enrollment"]))[0]


def build_payload() -> tuple[dict, list[str]]:
    summary = get("/api/twin/summary")
    topology = get("/api/twin/topology")
    rooms = get("/api/twin/rooms")["rooms"]
    schedule = get("/api/twin/schedule")["schedule"]

    route = summary["route_pressure"][0]
    event = sorted(topology["events"], key=lambda item: item["expected_attendance"], reverse=True)[0]
    excluded: set[str] = set()
    actions = []
    notes = []

    overlaps = [
        row
        for row in schedule
        if row["building_id"] == event["building_id"]
        and row["day"] == event["day"]
        and row["start_hour"] <= event["start_hour"] < row["start_hour"] + row["duration_hours"]
    ]
    if overlaps:
        session = sorted(overlaps, key=lambda row: row["enrollment"], reverse=True)[0]
        target = feasible_room(session, rooms, schedule, excluded, "Sat", 18)
        excluded.add(target["id"])
        actions.append({
            "type": "reschedule_section",
            "params": {
                "section_id": session["section_id"],
                "day": "Sat",
                "start_hour": 18,
                "target_room_id": target["id"],
            },
        })
        notes.append(f"reschedule {session['section_id']} to {target['id']}")

    mismatch = sorted(
        [row for row in schedule if row["over_capacity"]],
        key=lambda row: row["enrollment"] - row["capacity"],
        reverse=True,
    )[0]
    current_rooms = {row["room_id"] for row in schedule if row["section_id"] == mismatch["section_id"]}
    target = feasible_room(mismatch, rooms, schedule, excluded | current_rooms)
    actions.append({
        "type": "relocate_section",
        "params": {"section_id": mismatch["section_id"], "target_room_id": target["id"]},
    })
    notes.append(f"relocate {mismatch['section_id']} to {target['id']}")

    actions.append({
        "type": "adjust_bus_frequency",
        "params": {
            "route_id": route["route_id"],
            "active_buses": min(20, route["active_buses"] + 2),
            "headway_minutes": max(5, route["headway_minutes"] - 10),
        },
    })
    notes.append(f"reinforce {route['route_id']}")

    return {
        "name": "Judge demo: Open Day resilience response",
        "objective": "resilience",
        "persist": summary["source"].startswith("databricks"),
        "uncertainty_samples": 650,
        "actions": actions,
    }, notes


def main() -> None:
    health = get("/api/health")
    payload, notes = build_payload()
    result = post("/api/scenarios/simulate", payload)
    history = get("/api/scenarios/history")
    print({
        "source": health["data_mode"],
        "actions": notes,
        "verdict": result["verdict"],
        "score": result["score"],
        "after_peak_transport_load_pct": result["after"]["peak_transport_load_pct"],
        "after_capacity_fit_pct": result["after"]["capacity_fit_pct"],
        "persisted": any(item["scenario_id"] == result["scenario_id"] for item in history["scenarios"]),
    })


if __name__ == "__main__":
    main()
