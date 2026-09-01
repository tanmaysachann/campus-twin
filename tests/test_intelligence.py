from __future__ import annotations

import asyncio

from campus_twin.repositories.demo import DemoRepository
from campus_twin.services.intelligence import IntelligenceService


def test_local_analyst_is_grounded_and_labeled():
    async def run():
        twin = await DemoRepository().load_snapshot()
        answer = await IntelligenceService(None).answer(twin, "Which bus route has the highest peak pressure?")
        assert answer.mode == "local"
        assert "Peak transport pressure" in answer.answer
        assert answer.evidence
    asyncio.run(run())
