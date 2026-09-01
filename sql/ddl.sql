CREATE TABLE IF NOT EXISTS {namespace}.buildings (
  id STRING NOT NULL,
  name STRING NOT NULL,
  kind STRING NOT NULL,
  x DOUBLE NOT NULL,
  y DOUBLE NOT NULL,
  area_m2 DOUBLE NOT NULL
) USING DELTA;

CREATE TABLE IF NOT EXISTS {namespace}.rooms (
  id STRING NOT NULL,
  building_id STRING NOT NULL,
  name STRING NOT NULL,
  kind STRING NOT NULL,
  capacity INT NOT NULL,
  floor INT NOT NULL,
  has_ac BOOLEAN NOT NULL
) USING DELTA;

CREATE TABLE IF NOT EXISTS {namespace}.sections (
  id STRING NOT NULL,
  course STRING NOT NULL,
  department STRING NOT NULL,
  year INT NOT NULL,
  enrollment INT NOT NULL
) USING DELTA;

CREATE TABLE IF NOT EXISTS {namespace}.schedules (
  id STRING NOT NULL,
  section_id STRING NOT NULL,
  room_id STRING NOT NULL,
  day STRING NOT NULL,
  start_hour INT NOT NULL,
  duration_hours INT NOT NULL,
  session_type STRING NOT NULL
) USING DELTA;

CREATE TABLE IF NOT EXISTS {namespace}.energy (
  building_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  kwh DOUBLE NOT NULL,
  temperature_c DOUBLE NOT NULL
) USING DELTA;

CREATE TABLE IF NOT EXISTS {namespace}.bus_routes (
  id STRING NOT NULL,
  name STRING NOT NULL,
  capacity_per_bus INT NOT NULL,
  active_buses INT NOT NULL,
  headway_minutes INT NOT NULL,
  origin STRING NOT NULL,
  destination STRING NOT NULL
) USING DELTA;

CREATE TABLE IF NOT EXISTS {namespace}.bus_demand (
  route_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  passengers INT NOT NULL
) USING DELTA;

CREATE TABLE IF NOT EXISTS {namespace}.events (
  id STRING NOT NULL,
  name STRING NOT NULL,
  building_id STRING NOT NULL,
  day STRING NOT NULL,
  start_hour INT NOT NULL,
  expected_attendance INT NOT NULL
) USING DELTA;

CREATE TABLE IF NOT EXISTS {namespace}.walk_edges (
  from_building_id STRING NOT NULL,
  to_building_id STRING NOT NULL,
  minutes INT NOT NULL
) USING DELTA;

CREATE TABLE IF NOT EXISTS {namespace}.scenario_runs (
  scenario_id STRING NOT NULL,
  name STRING NOT NULL,
  objective STRING NOT NULL,
  verdict STRING NOT NULL,
  score DOUBLE NOT NULL,
  payload_json STRING NOT NULL,
  created_at TIMESTAMP NOT NULL
) USING DELTA;

CREATE TABLE IF NOT EXISTS {namespace}.feedback (
  id STRING NOT NULL,
  scenario_id STRING,
  metric STRING NOT NULL,
  predicted DOUBLE NOT NULL,
  observed DOUBLE NOT NULL,
  relative_error_pct DOUBLE NOT NULL,
  notes STRING NOT NULL,
  created_at TIMESTAMP NOT NULL
) USING DELTA;

CREATE TABLE IF NOT EXISTS {namespace}.app_config (
  key STRING NOT NULL,
  value STRING NOT NULL,
  updated_at TIMESTAMP NOT NULL
) USING DELTA;
