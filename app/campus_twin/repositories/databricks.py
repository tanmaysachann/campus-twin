from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from ..databricks.sql import StatementExecutor
from ..models import CampusSnapshot, FeedbackRecord, ScenarioResult


TABLE_FIELDS = {
    "buildings": ["id", "name", "kind", "x", "y", "area_m2"],
    "rooms": ["id", "building_id", "name", "kind", "capacity", "floor", "has_ac"],
    "sections": ["id", "course", "department", "year", "enrollment"],
    "schedules": ["id", "section_id", "room_id", "day", "start_hour", "duration_hours", "session_type"],
    "energy": ["building_id", "timestamp", "kwh", "temperature_c"],
    "bus_routes": ["id", "name", "capacity_per_bus", "active_buses", "headway_minutes", "origin", "destination"],
    "bus_demand": ["route_id", "timestamp", "passengers"],
    "events": ["id", "name", "building_id", "day", "start_hour", "expected_attendance"],
    "walk_edges": ["from_building_id", "to_building_id", "minutes"],
}


class DatabricksRepository:
    def __init__(self, sql: StatementExecutor, namespace: str) -> None:
        self.sql = sql
        self.namespace = namespace

    async def load_snapshot(self) -> CampusSnapshot:
        payload: dict[str, Any] = {
            "version": "delta-current",
            "generated_at": datetime.utcnow().isoformat() + "Z",
        }
        for table, fields in TABLE_FIELDS.items():
            rows = await self.sql.rows(f"SELECT {', '.join(fields)} FROM {self.namespace}.{table}", row_limit=10000)
            payload[table] = rows
        return CampusSnapshot.model_validate(payload)

    async def save_scenario(self, scenario: ScenarioResult) -> None:
        await self.sql.execute(
            f"INSERT INTO {self.namespace}.scenario_runs VALUES (:id, :name, :objective, :verdict, :score, :payload, current_timestamp())",
            parameters=[
                {"name": "id", "value": scenario.scenario_id},
                {"name": "name", "value": scenario.name},
                {"name": "objective", "value": scenario.objective},
                {"name": "verdict", "value": scenario.verdict},
                {"name": "score", "value": str(scenario.score), "type": "DOUBLE"},
                {"name": "payload", "value": scenario.model_dump_json()},
            ],
        )

    async def list_scenarios(self, limit: int = 20) -> list[ScenarioResult]:
        bounded_limit = max(1, min(limit, 100))
        rows = await self.sql.rows(
            f"SELECT payload_json FROM {self.namespace}.scenario_runs ORDER BY created_at DESC LIMIT {bounded_limit}",
            row_limit=bounded_limit,
        )
        scenarios: list[ScenarioResult] = []
        for row in rows:
            try:
                scenarios.append(ScenarioResult.model_validate_json(str(row["payload_json"])))
            except Exception:
                continue
        return scenarios

    async def save_feedback(self, feedback: FeedbackRecord) -> None:
        await self.sql.execute(
            f"INSERT INTO {self.namespace}.feedback VALUES (:id, :scenario_id, :metric, :predicted, :observed, :error, :notes, current_timestamp())",
            parameters=[
                {"name": "id", "value": feedback.id},
                {"name": "scenario_id", "value": feedback.scenario_id},
                {"name": "metric", "value": feedback.metric},
                {"name": "predicted", "value": str(feedback.predicted), "type": "DOUBLE"},
                {"name": "observed", "value": str(feedback.observed), "type": "DOUBLE"},
                {"name": "error", "value": str(feedback.relative_error_pct), "type": "DOUBLE"},
                {"name": "notes", "value": feedback.notes},
            ],
        )

    async def list_feedback(self, limit: int = 20) -> list[FeedbackRecord]:
        bounded_limit = max(1, min(limit, 100))
        rows = await self.sql.rows(
            f"""
            SELECT id, scenario_id, metric, predicted, observed, relative_error_pct, notes, created_at
            FROM {self.namespace}.feedback
            ORDER BY created_at DESC
            LIMIT {bounded_limit}
            """,
            row_limit=bounded_limit,
        )
        records: list[FeedbackRecord] = []
        for row in rows:
            try:
                records.append(FeedbackRecord.model_validate(row))
            except Exception:
                continue
        return records

    async def get_config(self, key: str) -> str | None:
        rows = await self.sql.rows(
            f"SELECT value FROM {self.namespace}.app_config WHERE key = :key LIMIT 1",
            parameters=[{"name": "key", "value": key}],
            row_limit=1,
        )
        return str(rows[0]["value"]) if rows else None

    async def set_config(self, key: str, value: str) -> None:
        await self.sql.execute(
            f"MERGE INTO {self.namespace}.app_config t USING (SELECT :key AS key, :value AS value) s ON t.key=s.key "
            "WHEN MATCHED THEN UPDATE SET value=s.value, updated_at=current_timestamp() "
            "WHEN NOT MATCHED THEN INSERT (key,value,updated_at) VALUES (s.key,s.value,current_timestamp())",
            parameters=[{"name": "key", "value": key}, {"name": "value", "value": value}],
        )
