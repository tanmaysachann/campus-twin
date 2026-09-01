from __future__ import annotations

import json
from pathlib import Path


def test_deployment_payload_is_self_contained_and_in_sync():
    root = Path(__file__).resolve().parents[1]

    assert (root / "app" / "app.yaml").is_file()
    assert (root / "app" / "requirements.txt").is_file()
    assert (root / "app" / "data" / "campus_snapshot.json").read_bytes() == (
        root / "data" / "campus_snapshot.json"
    ).read_bytes()

    for name in ("ddl.sql", "gold_views.sql", "demo_queries.sql"):
        assert (root / "app" / "sql" / name).read_bytes() == (root / "sql" / name).read_bytes()

    bundle = (root / "databricks.yml").read_text(encoding="utf-8")
    app_yaml = (root / "app" / "app.yaml").read_text(encoding="utf-8")
    assert "source_code_path: ./app" in bundle
    assert "user_api_scopes:" in bundle
    assert "- sql" in bundle and "- genie" in bundle
    assert "valueFrom: sql-warehouse" in app_yaml


def test_genie_design_is_grounded_in_gold_views():
    root = Path(__file__).resolve().parents[1]
    serialized = json.loads((root / "genie" / "campus_twin_space.json").read_text(encoding="utf-8"))
    assert serialized["version"] == 2
    identifiers = {item["identifier"] for item in serialized["data_sources"]["tables"]}
    assert identifiers == {
        "workspace.campus_twin.gold_room_utilization",
        "workspace.campus_twin.gold_building_energy_daily",
        "workspace.campus_twin.gold_bus_pressure",
        "workspace.campus_twin.gold_schedule_pressure",
        "workspace.campus_twin.gold_campus_overview",
    }


def test_genie_create_includes_required_parent_path():
    import asyncio

    from campus_twin.databricks.genie import GenieClient, SPACE_DESCRIPTION, SPACE_TITLE

    class FakeREST:
        def __init__(self):
            self.body = None

        async def request(self, method, path, *, json=None, params=None):
            assert method == "POST"
            assert path == "/api/2.0/genie/spaces"
            self.body = json
            return {"space_id": "space-123"}

    async def run():
        rest = FakeREST()
        client = GenieClient(rest)
        space_id = await client.create_space(
            warehouse_id="warehouse-1",
            namespace="workspace.campus_twin",
            parent_path="/Workspace/Users/test@example.com",
        )
        assert space_id == "space-123"
        assert rest.body["parent_path"] == "/Workspace/Users/test@example.com"
        assert rest.body["warehouse_id"] == "warehouse-1"
        assert rest.body["title"] == SPACE_TITLE
        assert rest.body["description"] == SPACE_DESCRIPTION
        serialized = json.loads(rest.body["serialized_space"])
        instructions = serialized["instructions"]["text_instructions"][0]["content"][0]
        assert "Use only the governed CampusTwin tables and gold views in the workspace.campus_twin schema" in instructions
        assert "Scheduled utilization is not live occupancy" in instructions

    asyncio.run(run())
