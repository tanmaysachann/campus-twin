from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Settings:
    app_name: str = os.getenv("CAMPUS_TWIN_APP_NAME", "CampusTwin")
    data_mode: str = os.getenv("CAMPUS_TWIN_DATA_MODE", "auto").lower()
    catalog: str = os.getenv("CAMPUS_TWIN_CATALOG", "workspace")
    schema: str = os.getenv("CAMPUS_TWIN_SCHEMA", "campus_twin")
    warehouse_id: str | None = os.getenv("DATABRICKS_WAREHOUSE_ID")
    genie_space_id: str | None = os.getenv("DATABRICKS_GENIE_SPACE_ID")
    genie_parent_path: str | None = os.getenv("CAMPUS_TWIN_GENIE_PARENT_PATH")
    databricks_host: str | None = os.getenv("DATABRICKS_HOST")
    databricks_token: str | None = os.getenv("DATABRICKS_TOKEN")
    cache_ttl_seconds: int = int(os.getenv("CAMPUS_TWIN_CACHE_TTL_SECONDS", "45"))
    sql_wait_timeout: str = os.getenv("CAMPUS_TWIN_SQL_WAIT_TIMEOUT", "30s")
    allow_bootstrap: bool = os.getenv("CAMPUS_TWIN_ALLOW_BOOTSTRAP", "true").lower() in {"1", "true", "yes"}

    @property
    def namespace(self) -> str:
        return f"{self.catalog}.{self.schema}"

    @property
    def databricks_configured(self) -> bool:
        return bool(self.warehouse_id and self.databricks_host)


settings = Settings()
