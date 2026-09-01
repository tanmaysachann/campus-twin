from __future__ import annotations

import asyncio
from pathlib import Path

from campus_twin.cache import SnapshotCache
from campus_twin.repositories.demo import DemoRepository


def test_cache_preserves_effective_source_and_deep_copies():
    async def run():
        snapshot = await DemoRepository(Path(__file__).resolve().parents[1] / "data" / "campus_snapshot.json").load_snapshot()
        cache = SnapshotCache(ttl_seconds=30)

        await cache.put("databricks:user@example.com", snapshot, source="demo-fallback")
        cached = await cache.get("databricks:user@example.com")

        assert cached is not None
        cached_snapshot, source = cached
        assert source == "demo-fallback"
        assert cached_snapshot is not snapshot

        original_name = snapshot.buildings[0].name
        cached_snapshot.buildings[0].name = "mutated only in caller"
        cached_again = await cache.get("databricks:user@example.com")
        assert cached_again is not None
        assert cached_again[0].buildings[0].name == original_name

    asyncio.run(run())
