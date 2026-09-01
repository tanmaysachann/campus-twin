from __future__ import annotations

import asyncio
from typing import Any

from .rest import DatabricksREST, DatabricksAPIError


TERMINAL = {"SUCCEEDED", "FAILED", "CANCELED", "CLOSED"}


class StatementExecutor:
    def __init__(self, rest: DatabricksREST, warehouse_id: str, wait_timeout: str = "30s") -> None:
        self.rest = rest
        self.warehouse_id = warehouse_id
        self.wait_timeout = wait_timeout

    async def execute(self, statement: str, *, parameters: list[dict[str, Any]] | None = None, row_limit: int = 10000) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "warehouse_id": self.warehouse_id,
            "statement": statement,
            "wait_timeout": self.wait_timeout,
            "on_wait_timeout": "CONTINUE",
            "format": "JSON_ARRAY",
            "disposition": "INLINE",
            "row_limit": row_limit,
            "query_tags": [{"key": "application", "value": "campus-twin"}],
        }
        if parameters:
            payload["parameters"] = parameters
        result = await self.rest.request("POST", "/api/2.0/sql/statements", json=payload)
        state = ((result.get("status") or {}).get("state") or "").upper()
        statement_id = result.get("statement_id")
        while statement_id and state not in TERMINAL:
            await asyncio.sleep(0.6)
            result = await self.rest.request("GET", f"/api/2.0/sql/statements/{statement_id}")
            state = ((result.get("status") or {}).get("state") or "").upper()
        if state != "SUCCEEDED":
            error = (result.get("status") or {}).get("error") or {}
            raise DatabricksAPIError(f"SQL statement ended in {state}: {error}")
        return result

    async def rows(self, statement: str, *, parameters: list[dict[str, Any]] | None = None, row_limit: int = 10000) -> list[dict[str, Any]]:
        result = await self.execute(statement, parameters=parameters, row_limit=row_limit)
        manifest = result.get("manifest") or {}
        columns = [c.get("name") for c in (((manifest.get("schema") or {}).get("columns")) or [])]
        data = ((result.get("result") or {}).get("data_array")) or []
        rows = [dict(zip(columns, values)) for values in data]

        # Follow inline chunks if present. Free Edition datasets here are small, but this
        # makes the adapter correct for larger snapshots too.
        next_link = (result.get("result") or {}).get("next_chunk_internal_link")
        while next_link:
            chunk = await self.rest.request("GET", next_link)
            rows.extend(dict(zip(columns, values)) for values in (chunk.get("data_array") or []))
            next_link = chunk.get("next_chunk_internal_link")
        return rows
