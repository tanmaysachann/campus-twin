from __future__ import annotations

from collections import Counter, defaultdict

from ..databricks.genie import GenieClient
from ..models import CampusSnapshot, GenieAnswer
from .metrics import building_pressure, compute_metrics, route_pressure


class IntelligenceService:
    def __init__(self, genie: GenieClient | None = None) -> None:
        self.genie = genie

    async def answer(
        self,
        snapshot: CampusSnapshot,
        question: str,
        *,
        genie_space_id: str | None = None,
        conversation_id: str | None = None,
    ) -> GenieAnswer:
        if self.genie and genie_space_id:
            result = await self.genie.ask(space_id=genie_space_id, question=question, conversation_id=conversation_id)
            return GenieAnswer(
                mode="genie",
                answer=result.get("answer") or "Genie completed the request.",
                conversation_id=result.get("conversation_id"),
                message_id=result.get("message_id"),
                sql=result.get("sql"),
                rows=result.get("rows") or [],
                suggested_questions=self._suggestions(),
                evidence=["Databricks Genie Agent over CampusTwin gold views"],
            )
        return self._local(snapshot, question)

    def _local(self, snapshot: CampusSnapshot, question: str) -> GenieAnswer:
        q = question.lower()
        metrics = compute_metrics(snapshot)
        room_hours = Counter()
        for s in snapshot.schedules:
            room_hours[s.room_id] += s.duration_hours
        room_by_id = {r.id: r for r in snapshot.rooms}
        section_by_id = {s.id: s for s in snapshot.sections}
        building_by_id = {b.id: b for b in snapshot.buildings}

        evidence: list[str] = []
        if any(k in q for k in ["underutil", "unused", "room", "classroom", "lab"]):
            ranked = sorted(snapshot.rooms, key=lambda r: (room_hours[r.id], r.id))[:6]
            lines = [f"{r.name} ({building_by_id[r.building_id].name}) — {room_hours[r.id]} scheduled hours / 60" for r in ranked]
            answer = "Lowest scheduled room utilization this week:\n" + "\n".join(f"• {x}" for x in lines)
            evidence.append("141 timetable sessions mapped to 58 rooms; utilization is scheduled-time, not live occupancy")
        elif any(k in q for k in ["energy", "power", "electric"]):
            latest = max(e.timestamp.date() for e in snapshot.energy)
            totals = defaultdict(float)
            for e in snapshot.energy:
                if e.timestamp.date() == latest:
                    totals[e.building_id] += e.kwh
            ranked = sorted(totals.items(), key=lambda x: -x[1])
            lines = [f"{building_by_id[bid].name}: {kwh:.1f} kWh" for bid, kwh in ranked[:5]]
            answer = f"Latest modeled energy day ({latest.isoformat()}):\n" + "\n".join(f"• {x}" for x in lines)
            evidence.append("Hourly building energy readings from the current twin snapshot")
        elif any(k in q for k in ["bus", "transport", "route", "shuttle"]):
            routes = route_pressure(snapshot)
            answer = "Peak transport pressure by route:\n" + "\n".join(f"• {r['name']}: {r['peak_load_pct']}% load, {r['active_buses']} buses, {r['headway_minutes']} min headway" for r in routes)
            evidence.append("Peak passenger demand divided by active-bus seat capacity")
        elif any(k in q for k in ["capacity", "overflow", "seat"]):
            bad = []
            for sess in snapshot.schedules:
                room = room_by_id[sess.room_id]
                sec = section_by_id[sess.section_id]
                if sec.enrollment > room.capacity:
                    bad.append((sec.enrollment - room.capacity, sec, room, sess))
            bad.sort(reverse=True, key=lambda x: x[0])
            if bad:
                answer = "Current capacity mismatches:\n" + "\n".join(
                    f"• {sec.id} {sec.course}: {sec.enrollment} students → {room.name} ({room.capacity} seats), +{delta} overflow"
                    for delta, sec, room, _ in bad[:8]
                )
            else:
                answer = "No scheduled session exceeds its assigned room capacity in the current snapshot."
            evidence.append("Section enrollment joined to assigned room capacity")
        elif any(k in q for k in ["health", "overview", "status", "campus"]):
            answer = (
                f"Campus operational snapshot: score {metrics.operational_score:.1f}/100; "
                f"scheduled room utilization {metrics.room_utilization_pct:.1f}%; capacity fit {metrics.capacity_fit_pct:.1f}%; "
                f"{metrics.schedule_conflicts} room-time conflict(s); peak transport load {metrics.peak_transport_load_pct:.1f}%; "
                f"latest-day energy {metrics.latest_day_energy_kwh:.1f} kWh."
            )
            evidence.append("Deterministic cross-domain metrics computed from the current snapshot")
        else:
            hottest = building_pressure(snapshot)[:3]
            answer = (
                "I am running in the deterministic local analyst because a Genie Agent is not configured. "
                "I can answer grounded questions about rooms, capacity, timetables, energy, buses, buildings, and the current operational overview. "
                "Highest scheduled-space pressure is currently " + ", ".join(f"{x['name']} ({x['utilization_pct']}%)" for x in hottest) + "."
            )
            evidence.append("Local fallback intentionally answers only supported campus domains")

        return GenieAnswer(
            mode="local",
            answer=answer,
            suggested_questions=self._suggestions(),
            evidence=evidence,
        )

    @staticmethod
    def _suggestions() -> list[str]:
        return [
            "Which rooms are underutilized this week?",
            "Where are the current capacity mismatches?",
            "Which bus route has the highest peak pressure?",
            "Which building used the most energy on the latest day?",
        ]
