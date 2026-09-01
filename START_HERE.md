# Start here

You can evaluate CampusTwin without a Databricks account, then connect it to Databricks Free Edition when ready.

## Fastest local run

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
export CAMPUS_TWIN_DATA_MODE=demo   # PowerShell: $env:CAMPUS_TWIN_DATA_MODE="demo"
./scripts/dev.sh
```

Windows PowerShell can instead run:

```powershell
.\scripts\dev.ps1
```

Open `http://127.0.0.1:8000`.

## What to click first

1. **Overview** — current cross-domain state and campus topology.
2. **Explore** — filter rooms/timetable and find capacity pressure.
3. **Simulate** — change a room, section, time, intake or bus service without mutating the baseline.
4. **Ask Genie** — real Genie when linked; explicitly labeled deterministic fallback otherwise.
5. **Feedback** — store predicted-versus-observed residuals.

## Verify before presenting

```bash
./scripts/verify.sh
```

The project should pass Python compilation, 12 tests, an end-to-end ASGI smoke check and JavaScript syntax validation when Node is installed.

## Deploy to Databricks Free Edition

```bash
databricks bundle validate --var warehouse_id=<YOUR_EXISTING_WAREHOUSE_ID>
databricks bundle deploy   --var warehouse_id=<YOUR_EXISTING_WAREHOUSE_ID>
databricks bundle run campus_twin --var warehouse_id=<YOUR_EXISTING_WAREHOUSE_ID>
```

Then use **Databricks setup** inside the app to create the schema/tables/views and optionally a Genie Agent.

## Present it

Use `docs/DEMO_SCRIPT.md` for a five-minute judge flow. Use `docs/ARCHITECTURE.md` if someone challenges the distinction between analytics, simulation and GenAI.
