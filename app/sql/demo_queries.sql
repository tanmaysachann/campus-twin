-- Useful judge/demo queries after bootstrap.
SELECT * FROM {namespace}.gold_campus_overview;

SELECT room_name, building_id, scheduled_utilization_pct, capacity_fit_pct
FROM {namespace}.gold_room_utilization
ORDER BY scheduled_utilization_pct ASC
LIMIT 10;

SELECT route_name, timestamp, load_pct
FROM {namespace}.gold_bus_pressure
ORDER BY load_pct DESC
LIMIT 10;

SELECT building_id, date, energy_kwh
FROM {namespace}.gold_building_energy_daily
ORDER BY date DESC, energy_kwh DESC;
