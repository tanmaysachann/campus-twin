CREATE OR REPLACE VIEW {namespace}.gold_room_utilization AS
WITH usage AS (
  SELECT room_id, SUM(duration_hours) AS scheduled_hours
  FROM {namespace}.schedules
  GROUP BY room_id
), capacity AS (
  SELECT s.room_id,
         SUM(CASE WHEN sec.enrollment <= r.capacity THEN 1 ELSE 0 END) AS fit_sessions,
         COUNT(*) AS total_sessions
  FROM {namespace}.schedules s
  JOIN {namespace}.sections sec ON sec.id = s.section_id
  JOIN {namespace}.rooms r ON r.id = s.room_id
  GROUP BY s.room_id
)
SELECT r.id AS room_id,
       r.name AS room_name,
       r.building_id,
       r.kind,
       r.capacity,
       COALESCE(u.scheduled_hours, 0) AS scheduled_hours,
       ROUND(100 * COALESCE(u.scheduled_hours, 0) / 60.0, 1) AS scheduled_utilization_pct,
       ROUND(100 * COALESCE(c.fit_sessions, 0) / GREATEST(COALESCE(c.total_sessions, 0), 1), 1) AS capacity_fit_pct
FROM {namespace}.rooms r
LEFT JOIN usage u ON u.room_id = r.id
LEFT JOIN capacity c ON c.room_id = r.id;

CREATE OR REPLACE VIEW {namespace}.gold_building_energy_daily AS
SELECT building_id,
       DATE(timestamp) AS date,
       ROUND(SUM(kwh), 2) AS energy_kwh,
       ROUND(AVG(temperature_c), 2) AS avg_temperature_c
FROM {namespace}.energy
GROUP BY building_id, DATE(timestamp);

CREATE OR REPLACE VIEW {namespace}.gold_bus_pressure AS
SELECT d.route_id,
       r.name AS route_name,
       d.timestamp,
       d.passengers,
       r.active_buses,
       r.capacity_per_bus,
       r.headway_minutes,
       ROUND(100 * d.passengers / GREATEST(r.active_buses * r.capacity_per_bus, 1), 1) AS load_pct
FROM {namespace}.bus_demand d
JOIN {namespace}.bus_routes r ON r.id = d.route_id;

CREATE OR REPLACE VIEW {namespace}.gold_schedule_pressure AS
SELECT s.id AS schedule_id,
       s.day,
       s.start_hour,
       sec.id AS section_id,
       sec.course,
       sec.department,
       sec.enrollment,
       r.id AS room_id,
       r.name AS room_name,
       r.building_id,
       r.capacity,
       sec.enrollment - r.capacity AS seat_delta,
       CASE WHEN sec.enrollment > r.capacity THEN true ELSE false END AS over_capacity
FROM {namespace}.schedules s
JOIN {namespace}.sections sec ON sec.id = s.section_id
JOIN {namespace}.rooms r ON r.id = s.room_id;

CREATE OR REPLACE VIEW {namespace}.gold_campus_overview AS
WITH room_stats AS (
  SELECT AVG(scheduled_utilization_pct) AS avg_room_utilization_pct,
         AVG(capacity_fit_pct) AS avg_capacity_fit_pct
  FROM {namespace}.gold_room_utilization
), bus_stats AS (
  SELECT MAX(load_pct) AS peak_transport_load_pct
  FROM {namespace}.gold_bus_pressure
), latest_energy AS (
  SELECT SUM(energy_kwh) AS latest_day_energy_kwh
  FROM {namespace}.gold_building_energy_daily
  WHERE date = (SELECT MAX(date) FROM {namespace}.gold_building_energy_daily)
)
SELECT ROUND(room_stats.avg_room_utilization_pct, 1) AS avg_room_utilization_pct,
       ROUND(room_stats.avg_capacity_fit_pct, 1) AS avg_capacity_fit_pct,
       ROUND(bus_stats.peak_transport_load_pct, 1) AS peak_transport_load_pct,
       ROUND(latest_energy.latest_day_energy_kwh, 1) AS latest_day_energy_kwh
FROM room_stats CROSS JOIN bus_stats CROSS JOIN latest_energy;
