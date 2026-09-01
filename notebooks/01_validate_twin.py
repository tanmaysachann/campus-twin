# Databricks notebook source
# MAGIC %md
# MAGIC # CampusTwin validation
# MAGIC Use this notebook after the app bootstrap to inspect the governed gold layer.

# COMMAND ----------

CATALOG = "workspace"
SCHEMA = "campus_twin"
ns = f"{CATALOG}.{SCHEMA}"

# COMMAND ----------

spark.sql(f"SELECT * FROM {ns}.gold_campus_overview").display()

# COMMAND ----------

spark.sql(f"""
SELECT room_name, building_id, scheduled_utilization_pct, capacity_fit_pct
FROM {ns}.gold_room_utilization
ORDER BY scheduled_utilization_pct ASC
LIMIT 15
""").display()

# COMMAND ----------

spark.sql(f"""
SELECT route_name, timestamp, load_pct
FROM {ns}.gold_bus_pressure
ORDER BY load_pct DESC
LIMIT 20
""").display()
