from __future__ import annotations

from typing import Any

import httpx


class DatabricksAPIError(RuntimeError):
    pass


class DatabricksREST:
    def __init__(self, host: str, token: str, timeout: float = 45.0) -> None:
        normalized_host = host.strip().rstrip("/")
        if not normalized_host.startswith(("http://", "https://")):
            normalized_host = f"https://{normalized_host}"
        self.host = normalized_host
        self.token = token
        self.timeout = timeout

    async def request(self, method: str, path: str, *, json: Any = None, params: dict[str, Any] | None = None) -> Any:
        headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.request(method, f"{self.host}{path}", headers=headers, json=json, params=params)
        if response.status_code >= 400:
            detail = response.text[:2000]
            raise DatabricksAPIError(f"Databricks {method} {path} failed ({response.status_code}): {detail}")
        if not response.content:
            return {}
        return response.json()
