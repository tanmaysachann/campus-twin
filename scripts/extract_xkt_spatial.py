from __future__ import annotations

import json
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "app" / "campus_twin" / "static" / "xeokit" / "app" / "data" / "projects" / "BMSCampus"
MODEL_IDS = {
    "architecture": "AR-Demo_Sample_Single_Building_01",
    "mep": "ME-Demo_Sample_Single_Building_01",
    "structure": "ST-Demo_Sample_Single_Building_01",
}


def read_xkt_metadata(model_id: str) -> dict:
    payload = (PROJECT / "models" / model_id / "geometry.xkt").read_bytes()
    version, element_count = struct.unpack_from("<II", payload)
    if version not in {9, 10, 12}:
        raise ValueError(f"Unsupported XKT version {version}")
    sizes = struct.unpack_from(f"<{element_count}I", payload, 8)
    first_element_offset = (element_count + 2) * 4
    return json.loads(zlib.decompress(payload[first_element_offset : first_element_offset + sizes[0]]))


def floor_index(name: str) -> int:
    normalized = name.lower()
    if "sub" in normalized:
        return -1
    if "entry" in normalized:
        return 0
    if "02" in normalized:
        return 1
    if "03" in normalized:
        return 2
    if "roof" in normalized:
        return 3
    raise ValueError(f"Cannot derive floor index from {name!r}")


def main() -> None:
    metadata = {key: read_xkt_metadata(model_id) for key, model_id in MODEL_IDS.items()}
    objects = {key: value.get("metaObjects", []) for key, value in metadata.items()}
    storeys_by_model = {
        key: {item["name"]: item["id"] for item in items if item.get("type") == "IfcBuildingStorey"}
        for key, items in objects.items()
    }

    architecture_storeys = sorted(
        (
            item for item in objects["architecture"]
            if item.get("type") == "IfcBuildingStorey"
        ),
        key=lambda item: floor_index(item["name"]),
    )
    bim_storeys = []
    for item in architecture_storeys:
        name = item["name"]
        bim_storeys.append({
            "id": f"BMS-DEMO-F{floor_index(name)}",
            "name": name,
            "floor_index": floor_index(name),
            "architecture_object_id": item["id"],
            "mep_object_id": storeys_by_model["mep"].get(name),
            "structure_object_id": storeys_by_model["structure"].get(name),
        })

    architecture_by_id = {item["id"]: item for item in objects["architecture"]}
    storey_floor = {item["architecture_object_id"]: item["floor_index"] for item in bim_storeys}
    storey_seed_id = {item["architecture_object_id"]: item["id"] for item in bim_storeys}
    root_spaces = sorted(
        (
            item for item in objects["architecture"]
            if item.get("type") == "IfcSpace" and item.get("parent") in storey_floor
        ),
        key=lambda item: (storey_floor[item["parent"]], str(item.get("name", "")), item["id"]),
    )

    snapshot_path = ROOT / "data" / "campus_snapshot.json"
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    rooms_by_floor: dict[int, list[dict]] = {}
    for room in sorted(snapshot["rooms"], key=lambda item: item["id"]):
        rooms_by_floor.setdefault(int(room["floor"]), []).append(room)
    spaces_by_floor: dict[int, list[dict]] = {}
    for space in root_spaces:
        spaces_by_floor.setdefault(storey_floor[space["parent"]], []).append(space)

    room_for_space: dict[str, str] = {}
    for floor, rooms in rooms_by_floor.items():
        spaces = spaces_by_floor.get(floor, [])
        if len(spaces) < len(rooms):
            raise ValueError(f"Floor {floor} has {len(rooms)} rooms but only {len(spaces)} IFC spaces")
        for room, space in zip(rooms, spaces):
            room_for_space[space["id"]] = room["id"]

    bim_spaces = []
    for space in root_spaces:
        render_child = next(
            (
                child for child in objects["architecture"]
                if child.get("parent") == space["id"] and child.get("type") == "IfcSpace"
            ),
            None,
        )
        bim_spaces.append({
            "id": space["id"],
            "name": str(space.get("name") or space["id"]),
            "storey_id": storey_seed_id[space["parent"]],
            "floor_index": storey_floor[space["parent"]],
            "room_id": room_for_space.get(space["id"]),
            "render_object_id": render_child["id"] if render_child else space["id"],
            "source_model_id": MODEL_IDS["architecture"],
        })

    snapshot["bim_storeys"] = bim_storeys
    snapshot["bim_spaces"] = bim_spaces
    serialized = json.dumps(snapshot, indent=2) + "\n"
    snapshot_path.write_text(serialized, encoding="utf-8")
    (ROOT / "app" / "data" / "campus_snapshot.json").write_text(serialized, encoding="utf-8")
    print(f"Seeded {len(bim_storeys)} IFC storeys and {len(bim_spaces)} IFC spaces; mapped {len(room_for_space)} rooms")


if __name__ == "__main__":
    main()
