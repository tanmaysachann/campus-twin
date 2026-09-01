#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH="$PWD/app${PYTHONPATH:+:$PYTHONPATH}"
python -m compileall -q app/campus_twin
pytest -q
python scripts/smoke.py
python scripts/design_audit.py
python scripts/check_links.py
if command -v node >/dev/null 2>&1; then
  node --check app/campus_twin/static/app.js
  node --check app/campus_twin/static/api.js
fi
printf '\nVerification complete.\n'
