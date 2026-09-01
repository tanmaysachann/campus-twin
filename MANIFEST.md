# Delivery Manifest

CampusTwin 1.0 is a self-contained competition-ready vertical slice.

## Runtime

- `app/app.yaml` — Databricks App process/env definition
- `app/requirements.txt` — runtime dependencies
- `databricks.yml` — Declarative Automation Bundle
- `app/campus_twin/main.py` — FastAPI composition + static SPA host

## Backend architecture

- `api/deps.py` — source resolution and safe fallback
- `api/routes.py` — typed HTTP boundary
- `auth.py` — per-request Databricks user token extraction
- `cache.py` — per-user bounded TTL snapshot cache
- `models.py` — complete Pydantic domain/API contracts
- `repositories/base.py` — persistence protocol
- `repositories/demo.py` — zero-infrastructure deterministic source
- `repositories/databricks.py` — Delta repository via SQL Statement API
- `databricks/rest.py` — Databricks REST transport
- `databricks/sql.py` — statement execution + polling/chunk handling
- `databricks/genie.py` — Genie Space conversation client
- `databricks/bootstrap.py` — schema, seeding, gold views, Genie provisioning
- `services/metrics.py` — campus metrics
- `services/simulation.py` — counterfactual state transition / uncertainty / scoring
- `services/intelligence.py` — Genie adapter + deterministic fallback analyst

## Frontend

- `static/index.html`
- `static/styles.css`
- `static/api.js`
- `static/app.js`
- `static/favicon.svg`

No Node/npm build step is required.

## Data

Generated from fixed seed `20260830`:

- 8 buildings
- 58 rooms
- 47 sections
- 141 weekly schedule rows
- 4 routes / 120 peak-period route demand rows
- 1,344 hourly energy rows
- 5 events
- campus walking graph

`python scripts/generate_demo_data.py` reproduces the JSON snapshot.

## Databricks assets

- canonical DDL
- five gold views
- validation/demo SQL
- Databricks notebook source
- exportable Genie Space v2 JSON design

## Original design brief

- `docs/source/Campus_Twin_Base_Design.pdf` — supplied base concept preserved inside the delivery.

## Documentation

- `README.md` / `START_HERE.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/ARCHITECTURE_DECISIONS.md`
- `docs/TRACEABILITY.md`
- `docs/DECISION_MODEL.md`
- `docs/DATA_MODEL.md`
- `docs/INTEGRATION_CONTRACTS.md`
- `docs/API.md`
- `docs/SECURITY.md`
- `docs/FREE_EDITION.md`
- `docs/DEPLOYMENT.md`
- `docs/DEMO_SCRIPT.md`
- `docs/ROADMAP.md`
- `docs/WEB_REFERENCES.md`
- `VERIFICATION.md`

## Verification commands

```bash
PYTHONPATH=app python -m compileall -q app/campus_twin
PYTHONPATH=app pytest -q
PYTHONPATH=app python scripts/smoke.py
python scripts/design_audit.py
```
