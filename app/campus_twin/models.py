from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class Building(BaseModel):
    id: str
    name: str
    kind: str
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    area_m2: float = Field(gt=0)


class Room(BaseModel):
    id: str
    building_id: str
    name: str
    kind: str
    capacity: int = Field(gt=0)
    floor: int = Field(ge=0)
    has_ac: bool = True


class Section(BaseModel):
    id: str
    course: str
    department: str
    year: int = Field(ge=1, le=6)
    enrollment: int = Field(gt=0)


class ScheduleSession(BaseModel):
    id: str
    section_id: str
    room_id: str
    day: Literal["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    start_hour: int = Field(ge=7, le=20)
    duration_hours: int = Field(ge=1, le=4)
    session_type: str


class EnergyReading(BaseModel):
    building_id: str
    timestamp: datetime
    kwh: float = Field(ge=0)
    temperature_c: float


class BusRoute(BaseModel):
    id: str
    name: str
    capacity_per_bus: int = Field(gt=0)
    active_buses: int = Field(gt=0)
    headway_minutes: int = Field(gt=0)
    origin: str
    destination: str


class BusDemand(BaseModel):
    route_id: str
    timestamp: datetime
    passengers: int = Field(ge=0)


class CampusEvent(BaseModel):
    id: str
    name: str
    building_id: str
    day: str
    start_hour: int
    expected_attendance: int = Field(ge=0)


class WalkEdge(BaseModel):
    from_building_id: str
    to_building_id: str
    minutes: int = Field(gt=0)


class CampusSnapshot(BaseModel):
    version: str
    generated_at: datetime
    buildings: list[Building]
    rooms: list[Room]
    sections: list[Section]
    schedules: list[ScheduleSession]
    energy: list[EnergyReading]
    bus_routes: list[BusRoute]
    bus_demand: list[BusDemand]
    events: list[CampusEvent]
    walk_edges: list[WalkEdge]


class MetricDelta(BaseModel):
    key: str
    label: str
    before: float
    after: float
    delta: float
    unit: str
    direction: Literal["higher-is-better", "lower-is-better", "contextual"]


class CampusMetrics(BaseModel):
    room_utilization_pct: float
    capacity_fit_pct: float
    schedule_conflicts: int
    latest_day_energy_kwh: float
    peak_transport_load_pct: float
    rooms_over_capacity: int
    average_walk_minutes: float
    active_events: int
    operational_score: float


class CascadeEffect(BaseModel):
    domain: Literal["space", "schedule", "energy", "transport", "experience", "risk"]
    severity: Literal["info", "watch", "critical"]
    title: str
    explanation: str


class ConfidenceBand(BaseModel):
    metric: str
    p10: float
    median: float
    p90: float


class ActionType(StrEnum):
    CLOSE_ROOM = "close_room"
    RELOCATE_SECTION = "relocate_section"
    RESCHEDULE_SECTION = "reschedule_section"
    CHANGE_INTAKE = "change_intake"
    ADJUST_BUS_FREQUENCY = "adjust_bus_frequency"


class ScenarioAction(BaseModel):
    type: ActionType
    params: dict[str, Any]


class ScenarioRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    objective: Literal["balanced", "space", "energy", "transport", "resilience"] = "balanced"
    actions: list[ScenarioAction] = Field(min_length=1, max_length=8)
    persist: bool = False
    uncertainty_samples: int = Field(default=220, ge=40, le=1200)


class ScenarioResult(BaseModel):
    scenario_id: str
    name: str
    objective: str
    verdict: Literal["recommended", "review", "reject"]
    score: float
    before: CampusMetrics
    after: CampusMetrics
    deltas: list[MetricDelta]
    cascade_effects: list[CascadeEffect]
    confidence: list[ConfidenceBand]
    assumptions: list[str]
    action_log: list[str]
    created_at: datetime


class GenieRequest(BaseModel):
    question: str = Field(min_length=2, max_length=4000)
    conversation_id: str | None = None


class GenieAnswer(BaseModel):
    mode: Literal["genie", "local"]
    answer: str
    conversation_id: str | None = None
    message_id: str | None = None
    sql: str | None = None
    rows: list[dict[str, Any]] = Field(default_factory=list)
    suggested_questions: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)


class FeedbackRequest(BaseModel):
    scenario_id: str | None = None
    metric: str
    predicted: float
    observed: float
    notes: str = Field(default="", max_length=1000)


class FeedbackRecord(FeedbackRequest):
    id: str
    relative_error_pct: float
    created_at: datetime


class BootstrapRequest(BaseModel):
    create_genie: bool = True
    force_reseed: bool = False


class BootstrapResult(BaseModel):
    ok: bool
    steps: list[str]
    namespace: str
    genie_space_id: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    app: str
    data_mode: str
    databricks_configured: bool
    timestamp: datetime
