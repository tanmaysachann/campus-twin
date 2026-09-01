from __future__ import annotations

import asyncio
import os

import httpx

# Settings are imported at module load. CI/local verification is intentionally demo-first.
os.environ.setdefault("CAMPUS_TWIN_DATA_MODE", "demo")

from campus_twin.main import app


def test_api_vertical_slice():
    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            health = await client.get("/api/health")
            assert health.status_code == 200
            summary = await client.get("/api/twin/summary")
            assert summary.status_code == 200
            assert summary.json()["counts"]["rooms"] == 58
            rooms = await client.get("/api/twin/rooms")
            assert len(rooms.json()["rooms"]) == 58
            schedule = await client.get("/api/twin/schedule")
            assert len(schedule.json()["schedule"]) == 141
            quality = await client.get("/api/data/quality")
            assert quality.status_code == 200
            quality_body = quality.json()
            assert quality_body["score"] > 0
            assert quality_body["checks"]
            assert quality_body["counts"]["rooms"] == 58
            priorities = await client.get("/api/ops/priorities")
            assert priorities.status_code == 200
            assert priorities.json()["priorities"]
            interactions = await client.get("/api/ops/interactions")
            assert interactions.status_code == 200
            interaction_body = interactions.json()
            assert interaction_body["interactions"]
            assert interaction_body["interactions"][0]["evidence"]
            sim = await client.post("/api/scenarios/simulate", json={
                "name": "API scenario",
                "objective": "transport",
                "persist": True,
                "actions": [{"type": "adjust_bus_frequency", "params": {"route_id": "R4", "active_buses": 5, "headway_minutes": 14}}],
            })
            assert sim.status_code == 200
            assert "deltas" in sim.json()
            scenario_history = await client.get("/api/scenarios/history")
            assert scenario_history.status_code == 200
            assert scenario_history.json()["scenarios"][0]["name"] == "API scenario"
            scenario_compare = await client.get("/api/scenarios/compare")
            assert scenario_compare.status_code == 200
            assert scenario_compare.json()["best"]["name"] == "API scenario"
            chat = await client.post("/api/genie/chat", json={"question": "Where are capacity mismatches?"})
            assert chat.status_code == 200
            assert chat.json()["mode"] == "local"
            feedback = await client.post("/api/feedback", json={"metric": "room_utilization_pct", "predicted": 70, "observed": 67, "notes": "demo"})
            assert feedback.status_code == 200
            assert feedback.json()["relative_error_pct"] > 0
            feedback_history = await client.get("/api/feedback/history")
            assert feedback_history.status_code == 200
            assert feedback_history.json()["count"] == 1
    asyncio.run(run())
