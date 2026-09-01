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
    assert len(data["bim_storeys"]) == 4
    assert len(data["bim_spaces"]) == 113
    assert len(data["energy"]) == 8 * 24 * 7
    room_ids = {r["id"] for r in data["rooms"]}
    section_ids = {s["id"] for s in data["sections"]}
    assert all(s["room_id"] in room_ids for s in data["schedules"])
    assert all(s["section_id"] in section_ids for s in data["schedules"])
    mapped_spaces = [space for space in data["bim_spaces"] if space["room_id"]]
    assert len(mapped_spaces) == len(data["rooms"])
    assert {space["room_id"] for space in mapped_spaces} == room_ids
    assert all(space["render_object_id"] for space in mapped_spaces)
    storey_ids = {storey["id"] for storey in data["bim_storeys"]}
    assert all(space["storey_id"] in storey_ids for space in data["bim_spaces"])
