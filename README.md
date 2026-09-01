# CampusTwin

A campus decision tool for Databricks Free Edition. CampusTwin puts academic, space, energy, transport, event, and resource data into one operational model. You can inspect the current state, ask questions in plain language, run "what if" changes on a copy of the campus, and compare the effects before changing anything real.

The project separates five concerns so each can change on its own: facts, simulation, decision scoring, natural-language analysis, and real-world feedback.

## What works now

- A single-page app with no frontend build step.
- A FastAPI backend with typed contracts and OpenAPI docs.
- A bundled demo dataset: 8 buildings, 58 rooms, 47 sections, 141 weekly sessions, 4 bus routes, 7 days of hourly energy, events, and a walking graph.
- A Delta-backed repository over the Databricks SQL Statement Execution API.
- One-click bootstrap from the app: schema, Delta tables, gold views, demo seed data.
- A what-if engine for room closure, class relocation, rescheduling, intake change, and bus service change.
- Decision metrics, cascade explanations, score/verdict, and Monte Carlo confidence bands.
- Feedback capture for predicted-versus-observed calibration.
- Shared scenario context: Scenario Lab, Twin Studio, and Genie work on one application context. Scenario runs highlight affected rooms in the 3D viewer, and Genie answers with the active change in mind.
- A per-user snapshot cache so Free Edition does not waste SQL calls.
- Safe demo mode: the whole product runs before Databricks is configured.
- Automated tests and smoke checks.

## Run locally

Python 3.11+ is recommended.

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
export CAMPUS_TWIN_DATA_MODE=demo   # PowerShell: $env:CAMPUS_TWIN_DATA_MODE="demo"
./scripts/dev.sh
```

Windows PowerShell can run `.\scripts\dev.ps1` instead.

Open `http://127.0.0.1:8000`.

## What to click first

1. **Overview** — current cross-domain state and campus topology.
2. **Explore** — filter rooms and the timetable, find capacity pressure.
3. **Simulate** — change a room, section, time, intake, or bus service without changing the baseline.
4. **Ask Genie** — real Genie when linked; a clearly labeled deterministic fallback otherwise.
5. **Feedback** — store predicted-versus-observed residuals.

## Deploy to Databricks Free Edition

You need a Free Edition workspace with a SQL warehouse, and a Databricks CLI logged in to that workspace.

```bash
databricks bundle validate --var warehouse_id=<YOUR_WAREHOUSE_ID>
databricks bundle deploy   --var warehouse_id=<YOUR_WAREHOUSE_ID>
databricks bundle run campus_twin --var warehouse_id=<YOUR_WAREHOUSE_ID>
```

Then open the app and use **Databricks setup** to create the schema, tables, gold views, and optionally a Genie Agent. The bundle asks only for `sql` and `genie` user scopes.

## Data modes

`CAMPUS_TWIN_DATA_MODE` controls failure behavior:

- `demo` — always use bundled data.
- `auto` — use Databricks when configured; fall back to bundled data.
- `databricks` — surface Databricks errors instead of silently switching sources.

The UI always shows the active source, so a fallback can never look like live data.

## Verify

```bash
./scripts/verify.sh
```

This compiles the backend, runs the pytest suite, runs an in-process smoke check, audits the design contract, checks Markdown links, and validates JavaScript syntax when Node is installed. See [`VERIFICATION.md`](VERIFICATION.md) for the exact boundary.

## Architecture

The key decision: **Genie does not own simulation logic.** Genie answers questions over governed data. Scenario changes run in a deterministic domain service, so a language model can never silently invent campus state. Each simulation deep-copies the current snapshot and changes only the copy.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full reasoning, [`DESIGN.md`](DESIGN.md) for the visual contract, and [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) for the data model.

## Repository layout

```text
app/                  Databricks App runtime + backend + frontend
data/                 Deterministic demo snapshot
sql/                  DDL, gold views, demo queries
genie/                Inspectable Genie Space design
notebooks/            Databricks validation notebook
tests/                Unit and API tests
scripts/              Dev, verify, generate, and smoke scripts
docs/                 Architecture, security, deployment, and more
databricks.yml        Databricks Automation Bundle
pyproject.toml        Test and lint configuration
```

## Team

**Team Paanch Dost:** Tanmay Sachan, Utkarsh Maheshwari, Aditya Kumar Singh, Jawin Roys Fernandes, Saksham Pandey.

## License

GNU Affero General Public License v3.0. See [`LICENSE`](LICENSE).
