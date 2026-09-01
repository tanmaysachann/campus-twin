from __future__ import annotations

import asyncio
import json
from typing import Any

from .rest import DatabricksREST


SPACE_TITLE = "CampusTwin Operations Analyst"
SPACE_DESCRIPTION = (
    "Answers operational questions over the CampusTwin governed schema, including room utilization, "
    "schedule pressure, energy, mobility, events, scenarios, and feedback."
)
SPACE_INSTRUCTIONS = (
    "You are CampusTwin Genie, an operational analyst for a university campus digital twin. "
    "Use only the governed CampusTwin tables and gold views in the workspace.campus_twin schema. "
    "Answer questions about campus operations using evidence from rooms, buildings, schedules, sections, "
    "energy, bus routes, events, scenarios, and feedback. Prefer these gold views when useful: "
    "gold_room_utilization, gold_building_energy_daily, gold_bus_pressure, gold_schedule_pressure, "
    "and gold_campus_overview. Do not invent live occupancy. Scheduled utilization is not live occupancy. "
    "If a question asks what if, explain that counterfactual simulation is handled by the CampusTwin "
    "Scenario Lab, not by directly changing facts. Show the SQL or evidence behind important conclusions. "
    "Keep answers concise, operational, and decision-focused. If data is missing, say what table or field is missing. "
    "Help administrators understand where the campus is under pressure, which rooms or buildings have capacity "
    "issues, which bus routes are overloaded, which buildings consume the most energy, how schedules, rooms, "
    "events, and transport interact, and what operational risks should be investigated first."
)


class GenieClient:
    def __init__(self, rest: DatabricksREST) -> None:
        self.rest = rest

    async def create_space(self, *, warehouse_id: str, namespace: str, parent_path: str) -> str:
        serialized = {
            "version": 2,
            "config": {
                "sample_questions": [
                    {"id": "01f0c100000000000000000000000001", "question": ["Where is the campus under the most pressure right now?"]},
                    {"id": "01f0c100000000000000000000000002", "question": ["Which bus route has the highest peak pressure?"]},
                    {"id": "01f0c100000000000000000000000003", "question": ["Which building used the most energy on the latest day?"]},
                    {"id": "01f0c100000000000000000000000004", "question": ["Which rooms are over capacity?"]},
                    {"id": "01f0c100000000000000000000000005", "question": ["What should campus operations investigate first?"]},
                ]
            },
            "data_sources": {
                "tables": sorted([
                    {"identifier": f"{namespace}.gold_building_energy_daily", "description": ["Daily building energy consumption."]},
                    {"identifier": f"{namespace}.gold_bus_pressure", "description": ["Observed route demand and modeled capacity pressure."]},
                    {"identifier": f"{namespace}.gold_campus_overview", "description": ["Campus-level operational KPI snapshot."]},
                    {"identifier": f"{namespace}.gold_room_utilization", "description": ["Room schedule utilization and capacity fit."]},
                    {"identifier": f"{namespace}.gold_schedule_pressure", "description": ["Section-to-room capacity pressure and scheduling context."]},
                ], key=lambda table: table["identifier"]),
            },
            "instructions": {
                "text_instructions": [
                    {
                        "id": "01f0c200000000000000000000000001",
                        "content": [SPACE_INSTRUCTIONS],
                    }
                ]
            },
        }
        body = {
            "warehouse_id": warehouse_id,
            "parent_path": parent_path,
            "title": SPACE_TITLE,
            "description": SPACE_DESCRIPTION,
            "serialized_space": json.dumps(serialized, separators=(",", ":")),
        }
        result = await self.rest.request("POST", "/api/2.0/genie/spaces", json=body)
        return str(result["space_id"])

    async def ask(self, *, space_id: str, question: str, conversation_id: str | None = None) -> dict[str, Any]:
        if conversation_id:
            response = await self.rest.request(
                "POST",
                f"/api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}/messages",
                json={"content": question},
            )
        else:
            response = await self.rest.request(
                "POST",
                f"/api/2.0/genie/spaces/{space_id}/start-conversation",
                json={"content": question, "enable_visualization": True},
            )
            conversation_id = response.get("conversation_id")

        message_id = response.get("message_id") or response.get("id")
        if not conversation_id:
            conversation_id = response.get("conversation", {}).get("conversation_id")
        if not message_id:
            message_id = response.get("message", {}).get("message_id") or response.get("message", {}).get("id")
        if not (conversation_id and message_id):
            return {"conversation_id": conversation_id, "message_id": message_id, "raw": response}

        message: dict[str, Any] = response
        for _ in range(80):
            status = str(message.get("status") or "").upper()
            if status in {"COMPLETED", "FAILED", "CANCELLED", "QUERY_RESULT_EXPIRED"}:
                break
            await asyncio.sleep(0.75)
            message = await self.rest.request(
                "GET",
                f"/api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}",
            )

        text_parts: list[str] = []
        sql: str | None = None
        rows: list[dict[str, Any]] = []
        for attachment in message.get("attachments") or []:
            text = attachment.get("text") or {}
            if text.get("content"):
                text_parts.append(str(text["content"]))
            query = attachment.get("query") or {}
            if query.get("query"):
                sql = query["query"]
            attachment_id = attachment.get("attachment_id") or attachment.get("id")
            if query and attachment_id and message.get("status") == "COMPLETED":
                try:
                    qres = await self.rest.request(
                        "GET",
                        f"/api/2.0/genie/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}/attachments/{attachment_id}/query-result",
                    )
                    statement = qres.get("statement_response") or {}
                    manifest = statement.get("manifest") or {}
                    cols = [c.get("name") for c in (((manifest.get("schema") or {}).get("columns")) or [])]
                    data = ((statement.get("result") or {}).get("data_array")) or []
                    rows.extend(dict(zip(cols, values)) for values in data[:100])
                except Exception:
                    pass
        return {
            "conversation_id": conversation_id,
            "message_id": message_id,
            "answer": "\n\n".join(text_parts).strip() or "Genie completed the request without a text attachment.",
            "sql": sql,
            "rows": rows,
            "raw": message,
        }
