#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH="$PWD/app${PYTHONPATH:+:$PYTHONPATH}"
exec uvicorn campus_twin.main:app --host 127.0.0.1 --port "${PORT:-8000}" --reload
