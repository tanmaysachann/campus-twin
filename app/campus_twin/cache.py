from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from .models import CampusSnapshot


@dataclass(slots=True)
class CacheEntry:
    expires_at: float
    snapshot: CampusSnapshot
    source: str


class SnapshotCache:
    """Small per-user cache to reduce Free Edition SQL calls without crossing identities.

    The effective source is cached alongside the snapshot. This matters in ``auto`` mode:
    a temporary Databricks failure can legitimately cache the bundled fallback, and the
    next request must still be labelled ``demo-fallback-cache`` rather than pretending
    that the cached rows came from Databricks.
    """

    def __init__(self, ttl_seconds: int = 45, max_entries: int = 64) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._entries: dict[str, CacheEntry] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> tuple[CampusSnapshot, str] | None:
        now = time.monotonic()
        async with self._lock:
            entry = self._entries.get(key)
            if not entry or entry.expires_at <= now:
                self._entries.pop(key, None)
                return None
            return entry.snapshot.model_copy(deep=True), entry.source

    async def put(self, key: str, snapshot: CampusSnapshot, *, source: str) -> None:
        async with self._lock:
            if len(self._entries) >= self.max_entries and key not in self._entries:
                oldest = min(self._entries.items(), key=lambda x: x[1].expires_at)[0]
                self._entries.pop(oldest, None)
            self._entries[key] = CacheEntry(
                expires_at=time.monotonic() + self.ttl_seconds,
                snapshot=snapshot.model_copy(deep=True),
                source=source,
            )

    async def clear(self) -> None:
        async with self._lock:
            self._entries.clear()
