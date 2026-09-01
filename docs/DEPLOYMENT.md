# Deployment

## Local demo

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
export CAMPUS_TWIN_DATA_MODE=demo
./scripts/dev.sh
```

Open `http://127.0.0.1:8000`.

## Local against Databricks

Copy `.env.databricks.example` values into your shell environment. Use `databricks` mode when you want connection failures to surface instead of falling back to bundled demo data.

PowerShell:

```powershell
$env:DATABRICKS_HOST = "https://<workspace-host>"
$env:DATABRICKS_TOKEN = "<development-token>"
$env:DATABRICKS_WAREHOUSE_ID = "<warehouse-id>"
$env:CAMPUS_TWIN_GENIE_PARENT_PATH = "/Workspace/Users/<your-email>"
.\scripts\dev-databricks.ps1
```

Bash:

```bash
export DATABRICKS_HOST=https://<workspace-host>
export DATABRICKS_TOKEN=<development-token>
export DATABRICKS_WAREHOUSE_ID=<warehouse-id>
export CAMPUS_TWIN_GENIE_PARENT_PATH=/Workspace/Users/<your-email>  # only if creating Genie locally
./scripts/dev-databricks.sh
```

The local token is only a developer convenience. Do not put it in source control.

## Databricks App

Authenticate the Databricks CLI to the target Free Edition workspace and supply the existing warehouse ID:

```bash
databricks bundle validate --var warehouse_id=<WAREHOUSE_ID>
databricks bundle deploy --var warehouse_id=<WAREHOUSE_ID>
databricks bundle run campus_twin --var warehouse_id=<WAREHOUSE_ID>
```

The bundle uploads `./app`, binds the existing SQL warehouse as `sql-warehouse`, asks for `sql` and `genie` user API scopes, and runs Uvicorn using `app/app.yaml`.

## First launch

1. Open the Databricks App.
2. Select **Databricks setup** at the bottom of the navigation rail.
3. Leave **Create/link Genie Agent** enabled if you want the natural-language layer. This creates the **CampusTwin Operations Analyst** Genie Space over `workspace.campus_twin` gold views. In Databricks Apps the parent folder defaults to the signed-in user's `/Workspace/Users/<email>` folder; local connected development can set `CAMPUS_TWIN_GENIE_PARENT_PATH`.
4. Select **Initialize Databricks**.
5. Inspect the log in the setup dialog.
6. Refresh Overview. The source label should change to the Databricks-backed mode after successful table loading.

## Troubleshooting

### `409 Databricks ... required`
The app is missing the warehouse binding, host environment or a user authorization token.

### SQL permission failure
The active user/app authorization does not have the required catalog/schema/table privileges. The app intentionally does not bypass Unity Catalog.

### Genie provisioning failure
Uncheck Genie creation and bootstrap the data plane first. You can point the app to an existing Agent later with `DATABRICKS_GENIE_SPACE_ID` or write its ID to `app_config`.

### Free Edition compute unavailable
The workspace may have hit a Free Edition quota. The bundled demo remains available by setting `CAMPUS_TWIN_DATA_MODE=demo` for local evaluation.
