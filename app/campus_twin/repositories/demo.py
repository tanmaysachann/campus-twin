from __future__ import annotations

import json
from pathlib import Path

from ..models import CampusSnapshot, FeedbackRecord, ScenarioResult


class DemoRepository:
    def __init__(self, path: Path | None = None) -> None:
        root = Path(__file__).resolve().parents[2]
        self.path = path or root / "data" / "campus_snapshot.json"
        self._scenarios: list[ScenarioResult] = []
        self._feedback: list[FeedbackRecord] = []
        self._config: dict[str, str] = {}

    async def load_snapshot(self) -> CampusSnapshot:
        return CampusSnapshot.model_validate_json(self.path.read_text(encoding="utf-8"))

    async def save_scenario(self, scenario: ScenarioResult) -> None:
        self._scenarios.append(scenario)

    async def list_scenarios(self, limit: int = 20) -> list[ScenarioResult]:
        return sorted(self._scenarios, key=lambda item: item.created_at, reverse=True)[:limit]

    async def save_feedback(self, feedback: FeedbackRecord) -> None:
        self._feedback.append(feedback)

    async def list_feedback(self, limit: int = 20) -> list[FeedbackRecord]:
        return sorted(self._feedback, key=lambda item: item.created_at, reverse=True)[:limit]

    async def get_config(self, key: str) -> str | None:
        return self._config.get(key)

    async def set_config(self, key: str, value: str) -> None:
        self._config[key] = value
