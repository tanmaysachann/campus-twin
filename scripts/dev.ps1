$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root
$env:PYTHONPATH = Join-Path $root "app"
if (-not $env:CAMPUS_TWIN_DATA_MODE) { $env:CAMPUS_TWIN_DATA_MODE = "demo" }
python -m uvicorn campus_twin.main:app --host 127.0.0.1 --port 8000 --reload
