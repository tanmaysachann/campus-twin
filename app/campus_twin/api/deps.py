from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request

from ..auth import RequestIdentity, get_request_identity
from ..cache import SnapshotCache
from ..config import settings
from ..databricks.genie import GenieClient
from ..databricks.rest import DatabricksREST
from ..databricks.sql import StatementExecutor
from ..repositories.databricks import DatabricksRepository
from ..repositories.demo import DemoRepository


@dataclass(slots=True)
class RuntimeContext:
    identity: RequestIdentity
    repository: object
    genie: GenieClient | None
    source: str


def _make_databricks(identity: RequestIdentity) -> tuple[DatabricksRepository, GenieClient] | None:
    if not (settings.databricks_host and settings.warehouse_id and identity.token):
        return None
    rest = DatabricksREST(settings.databricks_host, identity.token)
    executor = StatementExecutor(rest, settings.warehouse_id, wait_timeout=settings.sql_wait_timeout)
    return DatabricksRepository(executor, settings.namespace), GenieClient(rest)


async def get_runtime(
    request: Request,
    identity: RequestIdentity = Depends(get_request_identity),
) -> RuntimeContext:
    if settings.data_mode == "demo":
        return RuntimeContext(identity, request.app.state.demo_repository, None, "demo")
    db = _make_databricks(identity)
    if db:
        repo, genie = db
        return RuntimeContext(identity, repo, genie, "databricks")
    if settings.data_mode == "databricks":
        raise HTTPException(
            status_code=503,
            detail=(
                "Databricks mode is forced, but DATABRICKS_HOST, DATABRICKS_WAREHOUSE_ID, "
                "and an authorized request token are not all available."
            ),
        )
    return RuntimeContext(identity, request.app.state.demo_repository, None, "demo-fallback")


async def load_snapshot(request: Request, runtime: RuntimeContext) -> tuple[object, str]:
    cache: SnapshotCache = request.app.state.snapshot_cache
    key = f"{runtime.source}:{runtime.identity.user_key}"
    cached = await cache.get(key)
    if cached:
        snapshot, cached_source = cached
        return snapshot, f"{cached_source}-cache"
    try:
        snapshot = await runtime.repository.load_snapshot()
        await cache.put(key, snapshot, source=runtime.source)
        return snapshot, runtime.source
    except Exception:
        if settings.data_mode == "databricks":
            raise
        snapshot = await request.app.state.demo_repository.load_snapshot()
        await cache.put(key, snapshot, source="demo-fallback")
        return snapshot, "demo-fallback"
