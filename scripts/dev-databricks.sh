#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

missing=()
for name in DATABRICKS_HOST DATABRICKS_TOKEN DATABRICKS_WAREHOUSE_ID; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done

if (( ${#missing[@]} > 0 )); then
  printf 'Real Databricks mode needs these environment variables: %s. See .env.databricks.example.\n' "${missing[*]}" >&2
  exit 1
fi

export PYTHONPATH="$PWD/app${PYTHONPATH:+:$PYTHONPATH}"
export CAMPUS_TWIN_DATA_MODE=databricks
export CAMPUS_TWIN_CATALOG="${CAMPUS_TWIN_CATALOG:-workspace}"
export CAMPUS_TWIN_SCHEMA="${CAMPUS_TWIN_SCHEMA:-campus_twin}"

exec uvicorn campus_twin.main:app --host 127.0.0.1 --port "${PORT:-8000}" --reload
