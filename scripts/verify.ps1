$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root
$env:PYTHONPATH = Join-Path $root "app"
python -m compileall -q app/campus_twin
python -m pytest -q
python scripts/smoke.py
python scripts/design_audit.py
python scripts/check_links.py
if (Get-Command node -ErrorAction SilentlyContinue) {
  node --check app/campus_twin/static/app.js
  node --check app/campus_twin/static/api.js
}
Write-Host "Verification complete."
