from __future__ import annotations

import asyncio

import pytest

from campus_twin.models import ScenarioRequest
from campus_twin.repositories.demo import DemoRepository
from campus_twin.services.metrics import compute_metrics
from campus_twin.services.simulation import ScenarioValidationError, apply_actions, simulate


def snapshot():
    return asyncio.run(DemoRepository().load_snapshot())


def test_transport_action_reduces_peak_pressure_without_mutating_baseline():
    twin = snapshot()
    before_json = twin.model_dump_json()
    request = ScenarioRequest.model_validate({
        "name": "Transit relief",
        "objective": "transport",
        "actions": [{"type": "adjust_bus_frequency", "params": {"route_id": "R2", "active_buses": 6, "headway_minutes": 12}}],
    })
    result = simulate(twin, request)
    assert result.after.peak_transport_load_pct <= result.before.peak_transport_load_pct
    assert twin.model_dump_json() == before_json
    assert result.confidence
    assert result.assumptions


def test_intake_change_propagates_to_capacity_and_transport():
    twin = snapshot()
    request = ScenarioRequest.model_validate({
        "name": "Intake pressure",
        "objective": "balanced",
        "actions": [{"type": "change_intake", "params": {"section_id": "SEC-001", "enrollment": 140}}],
    })
    result = simulate(twin, request)
    assert result.after.capacity_fit_pct <= result.before.capacity_fit_pct
    assert result.after.peak_transport_load_pct >= result.before.peak_transport_load_pct
    assert any(e.domain == "risk" for e in result.cascade_effects)


def test_bad_room_is_rejected():
    twin = snapshot()
    request = ScenarioRequest.model_validate({
        "name": "Bad close",
        "actions": [{"type": "close_room", "params": {"room_id": "NOPE"}}],
    })
    with pytest.raises(ScenarioValidationError):
        simulate(twin, request)
