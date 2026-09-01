from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))

from campus_twin.main import app


async def main() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        health = await client.get("/api/health")
        assert health.status_code == 200, health.text
        summary = await client.get("/api/twin/summary")
        assert summary.status_code == 200, summary.text
        body = summary.json()
        assert body["counts"]["rooms"] == 58
        assert body["counts"]["schedules"] == 141
        scenario = await client.post(
            "/api/scenarios/simulate",
            json={
                "name": "Smoke transport relief",
                "objective": "transport",
                "actions": [{"type": "adjust_bus_frequency", "params": {"route_id": "R2", "active_buses": 4, "headway_minutes": 18}}],
            },
        )
        assert scenario.status_code == 200, scenario.text
        assert scenario.json()["after"]["peak_transport_load_pct"] <= scenario.json()["before"]["peak_transport_load_pct"]
        answer = await client.post("/api/genie/chat", json={"question": "Which bus route has the highest peak pressure?"})
        assert answer.status_code == 200, answer.text
        assert answer.json()["mode"] == "local"
        index = await client.get("/")
        assert index.status_code == 200 and "CampusTwin" in index.text
        print("smoke ok", {"source": body["source"], "ops_score": body["metrics"]["operational_score"], "scenario": scenario.json()["verdict"]})


if __name__ == "__main__":
    asyncio.run(main())
