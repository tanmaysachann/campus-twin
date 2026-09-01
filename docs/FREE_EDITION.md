# Databricks Free Edition strategy

CampusTwin is designed around Free Edition constraints rather than assuming an unlimited workspace.

## Compute discipline

- Reuse the account's existing SQL warehouse instead of creating another one.
- Cache the loaded snapshot for 45 seconds per user.
- Keep the demo dataset compact enough to load with small SQL statements.
- Keep expensive counterfactual logic in-process for the prototype rather than starting a Databricks job per click.
- Bootstrap is manual so simply viewing the app cannot burn SQL calls creating resources.
- Genie is optional. The product remains demonstrable without it.

## App lifetime

Free Edition Databricks Apps may stop after the platform's allowed runtime window. The repo therefore has a deterministic local path and simple bundle redeploy/run commands instead of depending on always-on infrastructure.

## Why no streaming pipeline in v1

The source idea describes a living twin, but a competition prototype does not need to fake continuous ingestion. The architecture leaves ingestion outside the application boundary and uses a current snapshot contract. Real feeds can later write Delta tables through Lakeflow or source-specific jobs.

## Why not build a second warehouse

Free Edition exposes a constrained warehouse entitlement. `databricks.yml` takes `warehouse_id` as a variable and binds that existing resource to the app instead of provisioning a new warehouse.
