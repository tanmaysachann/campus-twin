from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .genie import GenieClient
from .sql import StatementExecutor


DDL_ORDER = [
    "buildings", "rooms", "sections", "schedules", "energy", "bus_routes",
    "bus_demand", "events", "walk_edges",
]


class DatabricksBootstrapper:
    def __init__(self, sql: StatementExecutor, genie: GenieClient, namespace: str, warehouse_id: str) -> None:
        self.sql = sql
        self.genie = genie
        self.namespace = namespace
        self.warehouse_id = warehouse_id
        root = Path(__file__).resolve().parents[2]
        self.root = root

    async def run(
        self,
        *,
        create_genie: bool = True,
        force_reseed: bool = False,
        genie_parent_path: str | None = None,
    ) -> tuple[list[str], str | None]:
        steps: list[str] = []
        catalog, schema = self.namespace.split(".", 1)
        await self.sql.execute(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
        steps.append(f"Schema ready: {self.namespace}")

        await self._run_script(self.root / "sql" / "ddl.sql")
        steps.append("Canonical Delta + operational tables ready")

        data = json.loads((self.root / "data" / "campus_snapshot.json").read_text(encoding="utf-8"))
        seeded: list[str] = []
        for table in DDL_ORDER:
            count_rows = await self.sql.rows(f"SELECT COUNT(*) AS n FROM {self.namespace}.{table}", row_limit=1)
            count = int(count_rows[0]["n"]) if count_rows else 0
            if force_reseed and count:
                await self.sql.execute(f"TRUNCATE TABLE {self.namespace}.{table}")
                count = 0
            if count == 0:
                await self._seed_table(table, data[table])
                seeded.append(table)
        steps.append("Seeded: " + (", ".join(seeded) if seeded else "no tables (existing data retained)"))

        await self._run_script(self.root / "sql" / "gold_views.sql")
        steps.append("Five decision-ready gold views refreshed")

        genie_space_id: str | None = None
        rows = await self.sql.rows(f"SELECT value FROM {self.namespace}.app_config WHERE key='genie_space_id' LIMIT 1", row_limit=1)
        if rows:
            genie_space_id = str(rows[0]["value"])
            steps.append("Existing Genie Agent retained")
        elif create_genie:
            if not genie_parent_path:
                raise ValueError("A Genie parent_path is required when creating a new Genie Agent")
            genie_space_id = await self.genie.create_space(
                warehouse_id=self.warehouse_id,
                namespace=self.namespace,
                parent_path=genie_parent_path,
            )
            await self.sql.execute(
                f"INSERT INTO {self.namespace}.app_config VALUES ('genie_space_id', :space_id, current_timestamp())",
                parameters=[{"name": "space_id", "value": genie_space_id}],
            )
            steps.append("Genie Agent created and linked")
        else:
            steps.append("Genie provisioning skipped")
        return steps, genie_space_id

    async def _run_script(self, path: Path) -> None:
        sql = path.read_text(encoding="utf-8").format(namespace=self.namespace)
        for statement in [part.strip() for part in sql.split(";") if part.strip()]:
            await self.sql.execute(statement)

    async def _seed_table(self, table: str, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        columns = list(rows[0].keys())
        # Chunk inserts to stay well below Statement Execution request limits.
        chunk_size = 120 if table == "energy" else 200
        for start in range(0, len(rows), chunk_size):
            chunk = rows[start : start + chunk_size]
            values = []
            for row in chunk:
                values.append("(" + ",".join(self._literal(row[c], c) for c in columns) + ")")
            statement = f"INSERT INTO {self.namespace}.{table} ({', '.join(columns)}) VALUES " + ",".join(values)
            await self.sql.execute(statement)

    @staticmethod
    def _literal(value: Any, column: str) -> str:
        if value is None:
            return "NULL"
        if isinstance(value, bool):
            return "TRUE" if value else "FALSE"
        if isinstance(value, (int, float)):
            return str(value)
        text = str(value).replace("'", "''")
        if column == "timestamp":
            return f"TIMESTAMP '{text.replace('T', ' ').replace('+00:00', '')}'"
        return f"'{text}'"
