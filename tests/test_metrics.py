from __future__ import annotations

import asyncio

from campus_twin.repositories.demo import DemoRepository
from campus_twin.services.metrics import building_pressure, compute_metrics, route_pressure


def snapshot():
    return asyncio.run(DemoRepository().load_snapshot())


def test_demo_shape_and_metrics_are_sane():
    twin = snapshot()
    assert len(twin.buildings) == 8
    assert len(twin.rooms) == 58
    assert len(twin.sections) == 47
    assert len(twin.schedules) == 141
    assert len(twin.energy) == 1344
    assert len(twin.bus_demand) == 120
    m = compute_metrics(twin)
    assert 0 <= m.room_utilization_pct <= 100
    assert 0 <= m.capacity_fit_pct <= 100
    assert m.latest_day_energy_kwh > 0
    assert m.peak_transport_load_pct > 0
    assert 0 <= m.operational_score <= 100


def test_pressure_summaries_cover_expected_domains():
    twin = snapshot()
    buildings = building_pressure(twin)
    routes = route_pressure(twin)
    assert len(buildings) == 8
    assert len(routes) == 4
    assert routes[0]["peak_load_pct"] >= routes[-1]["peak_load_pct"]
