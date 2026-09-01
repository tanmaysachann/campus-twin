from __future__ import annotations

import json
from pathlib import Path


def test_generated_demo_contract():
    root = Path(__file__).resolve().parents[1]
    data = json.loads((root / "data" / "campus_snapshot.json").read_text())
    assert len(data["buildings"]) == 8
    assert len(data["rooms"]) == 58
    assert len(data["sections"]) == 47
    assert len(data["schedules"]) == 141
    assert len(data["energy"]) == 8 * 24 * 7
    room_ids = {r["id"] for r in data["rooms"]}
    section_ids = {s["id"] for s in data["sections"]}
    assert all(s["room_id"] in room_ids for s in data["schedules"])
    assert all(s["section_id"] in section_ids for s in data["schedules"])
