$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$required = @("DATABRICKS_HOST", "DATABRICKS_TOKEN", "DATABRICKS_WAREHOUSE_ID")
$missing = @()
foreach ($name in $required) {
    if (-not [Environment]::GetEnvironmentVariable($name)) {
        $missing += $name
    }
}

if ($missing.Count -gt 0) {
    $list = [string]::Join(", ", $missing)
    throw "Real Databricks mode needs these environment variables: $list. See .env.databricks.example."
}

$env:PYTHONPATH = Join-Path $root "app"
$env:CAMPUS_TWIN_DATA_MODE = "databricks"
if (-not $env:CAMPUS_TWIN_CATALOG) { $env:CAMPUS_TWIN_CATALOG = "workspace" }
if (-not $env:CAMPUS_TWIN_SCHEMA) { $env:CAMPUS_TWIN_SCHEMA = "campus_twin" }

python -m uvicorn campus_twin.main:app --host 127.0.0.1 --port 8000 --reload
