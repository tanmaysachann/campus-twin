from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api.routes import router
from .cache import SnapshotCache
from .config import settings
from .repositories.demo import DemoRepository


PACKAGE = Path(__file__).resolve().parent
STATIC = PACKAGE / "static"

app = FastAPI(
    title="CampusTwin API",
    version="1.0.0",
    description="Counterfactual campus decision intelligence for Databricks.",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)
app.state.demo_repository = DemoRepository()
app.state.snapshot_cache = SnapshotCache(settings.cache_ttl_seconds)
app.include_router(router)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse(STATIC / "index.html")


@app.get("/{path:path}", include_in_schema=False)
async def spa_fallback(path: str):
    # Client-side SPA fallback. API and static routes are resolved before this.
    return FileResponse(STATIC / "index.html")
