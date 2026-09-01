import { api } from "./api.js";
import { createTwinStudio } from "./twin-studio.js?v=xeokit-2";

const state = {
  summary: null,
  topology: null,
  rooms: [],
  spatial: { storeys: [], spaces: [] },
  schedule: [],
  energy: [],
  dataQuality: null,
  priorities: [],
  interactions: [],
  scenarioHistory: [],
  scenarioComparison: null,
  feedbackHistory: [],
  exploreTab: "rooms",
  genieConversationId: null,
  lastScenario: null,
  lastScenarioMeta: null,
  flagshipPlan: null,
  judgeDemoPlan: null,
  lastGenieQuestion: "",
  priorityQuestion: "Give me a cross-domain brief of the campus right now.",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const withoutEmoji = (value) => String(value ?? "").replace(/\p{Extended_Pictographic}/gu, "");
const esc = (value) => withoutEmoji(value).replace(/[&<>'"]/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#039;",
  '"': "&quot;",
}[character]));
const num = (value, digits = 1) => Number(value ?? 0).toLocaleString(undefined, {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits,
});

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = withoutEmoji(message);
  $("#toastRegion").appendChild(node);
  setTimeout(() => node.remove(), 3600);
}

function setLoading(element, loading) {
  if (!element) return;
  element.classList.toggle("loading", loading);
  if ("disabled" in element) element.disabled = loading;
}

function signal(load) {
  if (load >= 110) return ["critical", "critical"];
  if (load >= 85) return ["watch", "watch"];
  return ["ok", "stable"];
}

const viewLabels = {
  overview: "Campus pulse",
  genie: "Ask Genie",
  studio: "Twin Studio",
  simulate: "Scenario lab",
  explore: "Data atlas",
  feedback: "Outcome loop",
};

const twinStudio = createTwinStudio({
  root: "#view-studio",
  notify: toast,
  onAskGenie: question => askGenie(question),
  onOpenScenario: () => navigate("simulate"),
});

function navigate(view) {
  $$(".view").forEach(node => node.classList.toggle("is-visible", node.id === `view-${view}`));
  $$(".nav-item").forEach(node => node.classList.toggle("is-active", node.dataset.view === view));
  $("#viewCrumb").textContent = viewLabels[view] || view;
  history.replaceState(null, "", `#${view}`);
  window.scrollTo(0, 0);
}

function bindNavigation() {
  $$("[data-view]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.view)));
  $$("[data-nav]").forEach(link => link.addEventListener("click", event => {
    event.preventDefault();
    navigate(link.dataset.nav);
  }));
  const initial = location.hash.replace("#", "");
  if (Object.hasOwn(viewLabels, initial)) navigate(initial);
}

function renderSource() {
  const source = state.summary?.source || "unknown";
  const live = source.startsWith("databricks");
  $("#sourceDot").classList.toggle("is-live", live);
  $("#sourceLabel").textContent = live ? "Databricks twin" : "Generated twin";
  $("#sourceMeta").textContent = source.replaceAll("-", " ");
  $("#generatedAt").textContent = state.summary?.generated_at
    ? `Snapshot ${new Date(state.summary.generated_at).toLocaleString()}`
    : "Snapshot unavailable";
  const liveChip = $(".live-chip");
  liveChip.innerHTML = `<i></i> ${live ? "DATABRICKS BACKED" : "LOCAL MODE"}`;
  $("#atlasSource").textContent = live ? "DATABRICKS" : "LOCAL";
}

function metricTone(key, value) {
  if (key === "capacity" && value < 95) return "critical";
  if (key === "conflicts" && value > 0) return "critical";
  if (key === "transport" && value > 100) return "critical";
  if (key === "transport" && value >= 85) return "watch";
  if (key === "utilization" && value < 20) return "watch";
  return "good";
}

function renderMetrics() {
  const metrics = state.summary.metrics;
  const items = [
    ["utilization", "Scheduled room use", metrics.room_utilization_pct, "%", "scheduled / 60 h per room"],
    ["capacity", "Capacity fit", metrics.capacity_fit_pct, "%", `${metrics.rooms_over_capacity} over-capacity sessions`],
    ["conflicts", "Schedule conflicts", metrics.schedule_conflicts, "", "room-time overlaps"],
    ["transport", "Peak transport load", metrics.peak_transport_load_pct, "%", "demand / active vehicle capacity"],
    ["energy", "Latest-day energy", metrics.latest_day_energy_kwh, " kWh", "modeled building total"],
  ];
  $("#metricStrip").innerHTML = items.map(([key, label, value, unit, foot]) => `
    <div class="metric" data-tone="${metricTone(key, value)}">
      <span class="metric-label">${esc(label)}</span>
      <span class="metric-value">${num(value)}<small class="metric-unit">${esc(unit)}</small></span>
      <span class="metric-foot">${esc(foot)}</span>
    </div>`).join("");

  const score = metrics.operational_score;
  const scoreLabel = score >= 80 ? "strong operating state" : score >= 65 ? "decision attention required" : "material pressure detected";
  $("#healthStamp").innerHTML = `<span>OPS SCORE / 100</span><strong>${num(score)}</strong><small>${esc(scoreLabel)}</small>`;
}

function renderDecisionProof() {
  const counts = state.summary.counts;
  const governedRecords = counts.rooms + counts.sections + counts.schedules + counts.energy_readings + counts.bus_routes + counts.events + counts.buildings;
  $("#decisionProof").innerHTML = `
    <div><span>GOVERNED RECORDS</span><strong>${governedRecords.toLocaleString()}</strong></div>
    <div><span>GOLD VIEWS</span><strong>5</strong></div>
    <div><span>INTERVENTIONS</span><strong>5</strong></div>
    <div><span>GENIE AGENT</span><strong>${state.summary.source.startsWith("databricks") ? "LINKED" : "LOCAL"}</strong></div>`;
  $("#atlasRoomCount").textContent = counts.rooms.toLocaleString();
  $("#atlasSessionCount").textContent = counts.schedules.toLocaleString();
  $("#atlasBuildingCount").textContent = counts.buildings.toLocaleString();
}

function renderBriefing() {
  const metrics = state.summary.metrics;
  const building = state.summary.building_pressure[0];
  const route = state.summary.route_pressure[0];
  const items = [];

  if (metrics.rooms_over_capacity > 0) {
    items.push({
      domain: "SPACE",
      severity: "CRITICAL",
      title: "Capacity mismatch",
      copy: `${metrics.rooms_over_capacity} scheduled sessions exceed room capacity.`,
      question: "Where are the current capacity mismatches?",
    });
  }
  items.push({
    domain: "MOBILITY",
    severity: metrics.peak_transport_load_pct > 100 ? "CRITICAL" : "WATCH",
    title: metrics.peak_transport_load_pct > 100 ? "Transport capacity exceeded" : "Transport pressure",
    copy: `${route?.name || "Peak route"} reaches ${num(route?.peak_load_pct || metrics.peak_transport_load_pct)}% of modeled active capacity.`,
    question: "Which bus route has the highest peak pressure?",
  });
  if (building) {
    items.push({
      domain: "SPACE",
      severity: "WATCH",
      title: "Space concentration",
      copy: `${building.name} carries the highest scheduled room load at ${num(building.utilization_pct)}%.`,
      question: "Which rooms are underutilized this week?",
    });
  }
  items.push({
    domain: "SCHEDULE",
    severity: metrics.schedule_conflicts > 0 ? "CRITICAL" : "STABLE",
    title: metrics.schedule_conflicts > 0 ? "Timetable collision" : "Conflict-clean timetable",
    copy: metrics.schedule_conflicts > 0
      ? `${metrics.schedule_conflicts} room-time overlaps are present.`
      : "No room-time overlaps are present in the current snapshot.",
    question: "Give me a cross-domain brief of the campus right now.",
  });

  state.priorityQuestion = items[0]?.question || state.priorityQuestion;
  $("#briefing").innerHTML = items.slice(0, 4).map(item => `
    <div class="brief-row">
      <span class="brief-index">${esc(item.domain)} / ${esc(item.severity)}</span>
      <strong>${esc(item.title)}</strong>
      <p>${esc(item.copy)}</p>
    </div>`).join("");
}

function renderPriorityQueue() {
  const priorities = state.priorities || [];
  $("#priorityQueue").innerHTML = priorities.length ? priorities.map(item => `
    <article class="priority-row">
      <div class="priority-rank">${String(item.rank).padStart(2, "0")}</div>
      <div>
        <div class="priority-meta"><span>${esc(item.domain)}</span><span class="${esc(item.severity)}">${esc(item.severity)}</span></div>
        <strong>${esc(item.title)}</strong>
        <p>${esc(item.finding)}</p>
        <small>${esc(item.action)}</small>
      </div>
      <details>
        <summary>EVIDENCE</summary>
        ${(item.evidence || []).map(line => `<code>${esc(line)}</code>`).join("")}
      </details>
    </article>`).join("") : `
    <div class="empty-list">
      <strong>No priority queue available.</strong>
      <p>Load a governed snapshot to generate operational priorities.</p>
    </div>`;
}

function renderInteractions() {
  const interactions = state.interactions || [];
  $("#interactionRisks").innerHTML = interactions.length ? interactions.map(item => `
    <article class="interaction-row" data-severity="${esc(item.severity)}">
      <div class="interaction-rank">${String(item.rank).padStart(2, "0")}</div>
      <div>
        <div class="priority-meta"><span>${esc((item.domains || []).join(" + "))}</span><span class="${esc(item.severity)}">${esc(item.severity)}</span></div>
        <strong>${esc(item.title)}</strong>
        <p>${esc(item.finding)}</p>
        <small>${esc(item.action)}</small>
        ${(item.missing_data || []).length ? `<div class="missing-fields">Missing field: ${(item.missing_data || []).map(esc).join(", ")}</div>` : ""}
      </div>
      <details>
        <summary>EVIDENCE</summary>
        ${(item.evidence || []).map(line => `<code>${esc(line)}</code>`).join("")}
      </details>
    </article>`).join("") : `
    <div class="empty-list">
      <strong>No cross-domain interaction risks available.</strong>
      <p>Load events, schedules, energy and bus pressure to generate interaction analysis.</p>
    </div>`;
}

function renderDataQuality() {
  const report = state.dataQuality;
  if (!report) {
    $("#dataQuality").innerHTML = `
      <div class="empty-list">
        <strong>No readiness report available.</strong>
        <p>Load the active twin to validate governed joins and domain coverage.</p>
      </div>`;
    return;
  }
  const counts = report.counts || {};
  const countItems = [
    ["ROOMS", counts.rooms],
    ["SCHEDULES", counts.schedules],
    ["ENERGY", counts.energy_readings],
    ["BUS DEMAND", counts.bus_demand],
  ];
  $("#dataQuality").innerHTML = `
    <div class="quality-summary">
      <div class="quality-score" data-status="${esc(report.status)}">
        <span>READINESS SCORE</span>
        <strong>${num(report.score, 0)}</strong>
        <small>${esc(report.status)}</small>
      </div>
      <div class="quality-counts">
        ${countItems.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${Number(value || 0).toLocaleString()}</strong></div>`).join("")}
      </div>
    </div>
    <div class="quality-list">
      ${(report.checks || []).map(check => `
        <article class="quality-row" data-status="${esc(check.status)}">
          <div>
            <span class="history-kicker">${esc(check.domain)} / ${esc(check.status)}</span>
            <strong>${esc(check.name)}</strong>
            <p>${esc(check.finding)}</p>
          </div>
          <details>
            <summary>EVIDENCE</summary>
            ${(check.evidence || []).map(line => `<code>${esc(line)}</code>`).join("")}
          </details>
        </article>`).join("")}
    </div>`;
}

function renderBuildingTable() {
  $("#buildingTable tbody").innerHTML = state.summary.building_pressure.map(building => {
    const [klass, label] = signal(building.utilization_pct > 75 || building.over_capacity
      ? Math.max(90, building.utilization_pct)
      : building.utilization_pct);
    return `<tr>
      <td><strong>${esc(building.name)}</strong><div class="value-mono">${esc(building.building_id)}</div></td>
      <td class="value-mono">${num(building.utilization_pct)}%</td>
      <td class="value-mono">${esc(building.sessions)}</td>
      <td class="value-mono">${esc(building.over_capacity)}</td>
      <td><div class="signal-cell"><span class="signal-bar"><i style="width:${Math.min(100, building.utilization_pct)}%"></i></span><span class="signal-chip ${klass}">${label}</span></div></td>
    </tr>`;
  }).join("");
}

function renderRouteTable() {
  $("#routeTable tbody").innerHTML = state.summary.route_pressure.map(route => {
    const [klass, label] = signal(route.peak_load_pct);
    return `<tr>
      <td><strong>${esc(route.name)}</strong><div class="value-mono">${esc(route.route_id)}</div></td>
      <td class="value-mono">${num(route.peak_load_pct)}%</td>
      <td class="value-mono">${esc(route.active_buses)}</td>
      <td class="value-mono">${esc(route.headway_minutes)} min</td>
      <td><div class="signal-cell"><span class="signal-bar"><i style="width:${Math.min(100, route.peak_load_pct)}%"></i></span><span class="signal-chip ${klass}">${label}</span></div></td>
    </tr>`;
  }).join("");
}

function renderMap() {
  const svg = $("#campusMap");
  const buildings = state.topology.buildings;
  const pressure = Object.fromEntries(state.topology.building_pressure.map(item => [item.building_id, item]));
  const byId = Object.fromEntries(buildings.map(building => [building.id, building]));
  const scaleX = x => 40 + x * 6.7;
  const scaleY = y => 20 + y * 3.7;
  const edgeMarkup = state.topology.walk_edges.map(edge => {
    const start = byId[edge.from_building_id];
    const end = byId[edge.to_building_id];
    if (!start || !end) return "";
    return `<line class="map-edge" x1="${scaleX(start.x)}" y1="${scaleY(start.y)}" x2="${scaleX(end.x)}" y2="${scaleY(end.y)}"><title>${esc(edge.minutes)} min walk</title></line>`;
  }).join("");
  const nodeMarkup = buildings.map(building => {
    const item = pressure[building.id] || { utilization_pct: 0, over_capacity: 0 };
    const severity = item.over_capacity > 0 ? "critical" : item.utilization_pct > 65 ? "watch" : "";
    const width = 112;
    const height = 58;
    const x = scaleX(building.x) - width / 2;
    const y = scaleY(building.y) - height / 2;
    const hasEvent = state.topology.events.some(event => event.building_id === building.id);
    const label = building.name.length > 17 ? `${building.name.slice(0, 16)}...` : building.name;
    return `<g>
      <rect class="map-node ${severity}" x="${x}" y="${y}" width="${width}" height="${height}" />
      <text class="map-node-label" x="${x + 10}" y="${y + 21}">${esc(label)}</text>
      <text class="map-node-sub" x="${x + 10}" y="${y + 40}">${esc(building.id)} / ${num(item.utilization_pct)}%</text>
      ${hasEvent ? `<circle class="map-event" cx="${x + width - 10}" cy="${y + 11}" r="5"><title>Upcoming event</title></circle>` : ""}
    </g>`;
  }).join("");
  svg.innerHTML = `
    <rect x="0" y="0" width="760" height="430" fill="#edf2f0" />
    <circle class="map-ring" cx="380" cy="215" r="190" />
    <circle class="map-ring" cx="380" cy="215" r="125" />
    <text x="18" y="408" class="map-node-sub">RELATIONSHIP MAP / WALK EDGES / EVENT MARKERS</text>
    ${edgeMarkup}${nodeMarkup}`;
}

function renderExplore() {
  const query = $("#exploreSearch").value.trim().toLowerCase();
  let rows;
  if (state.exploreTab === "rooms") {
    rows = state.rooms.filter(room => !query || [room.id, room.name, room.building_id, room.kind].some(value => String(value).toLowerCase().includes(query)));
    $("#exploreCount").textContent = `${rows.length} / ${state.rooms.length} rooms`;
    $("#exploreTableWrap").innerHTML = `<table class="data-table"><thead><tr><th>Room</th><th>Building</th><th>Type</th><th>Floor</th><th>Capacity</th><th>Scheduled h</th><th>Util.</th><th>BIM</th></tr></thead><tbody>${rows.map(room => `<tr><td><strong>${esc(room.name)}</strong><div class="value-mono">${esc(room.id)}</div></td><td>${esc(room.building_id)}</td><td>${esc(room.kind)}</td><td class="value-mono">${esc(room.floor)}</td><td class="value-mono">${esc(room.capacity)}</td><td class="value-mono">${esc(room.scheduled_hours)}</td><td class="value-mono">${num(room.scheduled_utilization_pct)}%</td><td><button class="table-bim-link" type="button" data-bim-room="${esc(room.id)}" ${room.bim_object_id ? "" : "disabled"}>VIEW SPACE</button></td></tr>`).join("")}</tbody></table>`;
  } else {
    rows = state.schedule.filter(session => !query || [session.section_id, session.course, session.department, session.room_name, session.building_id, session.day].some(value => String(value).toLowerCase().includes(query)));
    $("#exploreCount").textContent = `${rows.length} / ${state.schedule.length} sessions`;
    $("#exploreTableWrap").innerHTML = `<table class="data-table"><thead><tr><th>Section</th><th>Course</th><th>When</th><th>Room</th><th>Enroll.</th><th>Seats</th><th>Fit</th><th>BIM</th></tr></thead><tbody>${rows.map(session => `<tr><td class="value-mono">${esc(session.section_id)}</td><td><strong>${esc(session.course)}</strong><div class="value-mono">${esc(session.department)}</div></td><td class="value-mono">${esc(session.day)} ${String(session.start_hour).padStart(2, "0")}:00</td><td>${esc(session.room_name)} <span class="value-mono">${esc(session.building_id)}</span></td><td class="value-mono">${esc(session.enrollment)}</td><td class="value-mono">${esc(session.capacity)}</td><td><span class="signal-chip ${session.over_capacity ? "critical" : "ok"}">${session.over_capacity ? "overflow" : "fit"}</span></td><td><button class="table-bim-link" type="button" data-bim-room="${esc(session.room_id)}" ${session.bim_object_id ? "" : "disabled"}>VIEW CLASS</button></td></tr>`).join("")}</tbody></table>`;
  }
}

function optionList(rows, getValue, getLabel) {
  return rows.map(row => `<option value="${esc(getValue(row))}">${esc(getLabel(row))}</option>`).join("");
}

function uniqueSections() {
  return [...new Map(state.schedule.map(session => [session.section_id, session])).values()];
}

function renderActionFields() {
  const type = $("#actionType").value;
  const node = $("#actionFields");
  if (type === "close_room") {
    node.innerHTML = `<label class="field"><span>Room</span><select id="paramRoom">${optionList(state.rooms, room => room.id, room => `${room.id} / ${room.name} / ${room.capacity} seats`)}</select></label>`;
  } else if (type === "relocate_section") {
    node.innerHTML = `<label class="field"><span>Section</span><select id="paramSection">${optionList(uniqueSections(), session => session.section_id, session => `${session.section_id} / ${session.course} / ${session.enrollment} students`)}</select></label><label class="field"><span>Target room</span><select id="paramTargetRoom">${optionList(state.rooms, room => room.id, room => `${room.id} / ${room.name} / ${room.capacity} seats`)}</select></label>`;
  } else if (type === "reschedule_section") {
    node.innerHTML = `<label class="field"><span>Section</span><select id="paramSection">${optionList(uniqueSections(), session => session.section_id, session => `${session.section_id} / ${session.course}`)}</select></label><label class="field"><span>Day</span><select id="paramDay">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => `<option>${day}</option>`).join("")}</select></label><label class="field"><span>Start hour</span><input id="paramStartHour" type="number" min="7" max="20" value="14" /></label><label class="field"><span>Target room (optional)</span><select id="paramTargetRoom"><option value="">Keep current room</option>${optionList(state.rooms, room => room.id, room => `${room.id} / ${room.name}`)}</select></label>`;
  } else if (type === "change_intake") {
    node.innerHTML = `<label class="field"><span>Section</span><select id="paramSection">${optionList(uniqueSections(), session => session.section_id, session => `${session.section_id} / ${session.course} / current ${session.enrollment}`)}</select></label><label class="field"><span>New enrollment</span><input id="paramEnrollment" type="number" min="1" max="500" value="80" /></label>`;
  } else {
    node.innerHTML = `<label class="field"><span>Route</span><select id="paramRoute">${optionList(state.summary?.route_pressure || [], route => route.route_id, route => `${route.route_id} / ${route.name}`)}</select></label><label class="field"><span>Active buses</span><input id="paramBuses" type="number" min="1" max="20" value="4" /></label><label class="field"><span>Headway minutes</span><input id="paramHeadway" type="number" min="5" max="90" value="18" /></label>`;
  }
}

function buildAction() {
  const type = $("#actionType").value;
  if (type === "close_room") return { type, params: { room_id: $("#paramRoom").value } };
  if (type === "relocate_section") return { type, params: { section_id: $("#paramSection").value, target_room_id: $("#paramTargetRoom").value } };
  if (type === "reschedule_section") {
    const params = { section_id: $("#paramSection").value, day: $("#paramDay").value, start_hour: Number($("#paramStartHour").value) };
    if ($("#paramTargetRoom").value) params.target_room_id = $("#paramTargetRoom").value;
    return { type, params };
  }
  if (type === "change_intake") return { type, params: { section_id: $("#paramSection").value, enrollment: Number($("#paramEnrollment").value) } };
  return { type, params: { route_id: $("#paramRoute").value, active_buses: Number($("#paramBuses").value), headway_minutes: Number($("#paramHeadway").value) } };
}

function buildFlagshipPlan() {
  if (!state.summary || !state.rooms.length || !state.schedule.length) return null;

  const sections = uniqueSections();
  const mismatch = [...state.schedule]
    .filter(session => session.over_capacity)
    .sort((a, b) => (b.enrollment - b.capacity) - (a.enrollment - a.capacity))[0];
  const route = state.summary.route_pressure?.[0];
  if (!mismatch || !route) return null;

  const relocationTarget = [...state.rooms]
    .filter(room => room.id !== mismatch.room_id && room.capacity >= mismatch.enrollment)
    .sort((a, b) => (a.capacity - mismatch.enrollment) - (b.capacity - mismatch.enrollment) || a.scheduled_hours - b.scheduled_hours)[0];
  if (!relocationTarget) return null;

  const growthSection = [...sections]
    .filter(section => section.section_id !== mismatch.section_id)
    .sort((a, b) => b.enrollment - a.enrollment)[0];
  if (!growthSection) return null;
  const grownEnrollment = Math.min(500, Math.ceil(growthSection.enrollment * 1.25));

  let responseSection = null;
  let responseTarget = null;
  for (const section of [...sections]
    .filter(item => ![mismatch.section_id, growthSection.section_id].includes(item.section_id))
    .sort((a, b) => b.enrollment - a.enrollment)) {
    const session = state.schedule.find(item => item.section_id === section.section_id);
    if (!session) continue;
    const currentRooms = new Set(state.schedule.filter(item => item.section_id === section.section_id).map(item => item.room_id));
    const target = [...state.rooms]
      .filter(room => room.id !== relocationTarget.id && !currentRooms.has(room.id) && room.capacity >= section.enrollment)
      .filter(room => !state.schedule.some(item => item.room_id === room.id && item.day === "Sat" && 18 < item.start_hour + item.duration_hours && item.start_hour < 18 + session.duration_hours))
      .sort((a, b) => a.scheduled_hours - b.scheduled_hours || (a.capacity - section.enrollment) - (b.capacity - section.enrollment))[0];
    if (target) {
      responseSection = section;
      responseTarget = target;
      break;
    }
  }
  if (!responseSection || !responseTarget) return null;

  const protectedRooms = new Set([
    relocationTarget.id,
    responseTarget.id,
    ...state.schedule
      .filter(session => [mismatch.section_id, growthSection.section_id, responseSection.section_id].includes(session.section_id))
      .map(session => session.room_id),
  ]);
  const outageRoom = [...state.rooms]
    .filter(room => room.scheduled_hours > 0 && !protectedRooms.has(room.id))
    .sort((a, b) => b.scheduled_hours - a.scheduled_hours || b.capacity - a.capacity)[0];
  if (!outageRoom) return null;

  const actions = [
    { type: "change_intake", params: { section_id: growthSection.section_id, enrollment: grownEnrollment } },
    { type: "close_room", params: { room_id: outageRoom.id } },
    { type: "relocate_section", params: { section_id: mismatch.section_id, target_room_id: relocationTarget.id } },
    { type: "reschedule_section", params: { section_id: responseSection.section_id, day: "Sat", start_hour: 18, target_room_id: responseTarget.id } },
    { type: "adjust_bus_frequency", params: { route_id: route.route_id, active_buses: Math.min(20, route.active_buses + 2), headway_minutes: Math.max(5, route.headway_minutes - 8) } },
  ];

  return {
    name: "Campus 2030 compound resilience drill",
    objective: "resilience",
    uncertainty_samples: 800,
    actions,
    manifest: [
      { domain: "DEMAND", title: `Grow ${growthSection.section_id} to ${grownEnrollment} students`, detail: "A 25 percent intake shock propagates into room capacity, energy, and mobility demand." },
      { domain: "OUTAGE", title: `Remove ${outageRoom.name} from service`, detail: `${outageRoom.scheduled_hours} scheduled hours must be reassigned through deterministic feasibility rules.` },
      { domain: "SPACE", title: `Move ${mismatch.section_id} to ${relocationTarget.name}`, detail: `${mismatch.enrollment} students move into ${relocationTarget.capacity} seats to resolve the largest current mismatch.` },
      { domain: "SCHEDULE", title: `Shift ${responseSection.section_id} to Sat 18:00`, detail: `The session moves to ${responseTarget.name}; the full timetable is checked again for collisions.` },
      { domain: "MOBILITY", title: `Reinforce ${route.name}`, detail: `Active buses rise from ${route.active_buses} to ${Math.min(20, route.active_buses + 2)} and modeled headway falls to ${Math.max(5, route.headway_minutes - 8)} minutes.` },
    ],
  };
}

function findFeasibleRoomForSession(session, excludedRoomIds = new Set(), preferredDay = null, preferredStart = null) {
  return [...state.rooms]
    .filter(room => !excludedRoomIds.has(room.id) && room.capacity >= session.enrollment)
    .filter(room => {
      if (!preferredDay || preferredStart === null) return true;
      return !state.schedule.some(item =>
        item.room_id === room.id
        && item.day === preferredDay
        && preferredStart < item.start_hour + item.duration_hours
        && item.start_hour < preferredStart + session.duration_hours
      );
    })
    .sort((a, b) => a.scheduled_hours - b.scheduled_hours || (a.capacity - session.enrollment) - (b.capacity - session.enrollment))[0] || null;
}

function buildJudgeDemoPlan() {
  if (!state.summary || !state.topology || !state.rooms.length || !state.schedule.length) return null;
  const route = state.summary.route_pressure?.[0];
  const largestEvent = [...(state.topology.events || [])].sort((a, b) => b.expected_attendance - a.expected_attendance)[0];
  const excluded = new Set();
  const actions = [];
  const manifest = [];

  if (largestEvent) {
    const eventOverlap = [...state.schedule]
      .filter(session => session.building_id === largestEvent.building_id && session.day === largestEvent.day)
      .filter(session => session.start_hour <= largestEvent.start_hour && largestEvent.start_hour < session.start_hour + session.duration_hours)
      .sort((a, b) => b.enrollment - a.enrollment)[0];
    if (eventOverlap) {
      const target = findFeasibleRoomForSession(eventOverlap, excluded, "Sat", 18);
      if (target) {
        excluded.add(target.id);
        actions.push({ type: "reschedule_section", params: { section_id: eventOverlap.section_id, day: "Sat", start_hour: 18, target_room_id: target.id } });
        manifest.push({
          domain: "EVENT + SCHEDULE",
          title: `Clear ${eventOverlap.section_id} from ${largestEvent.name}`,
          detail: `${eventOverlap.course} moves from the ${largestEvent.day} ${largestEvent.start_hour}:00 event window into ${target.name}.`,
        });
      }
    }
  }

  const mismatch = [...state.schedule]
    .filter(session => session.over_capacity)
    .sort((a, b) => (b.enrollment - b.capacity) - (a.enrollment - a.capacity))[0];
  if (mismatch) {
    const currentRooms = new Set(state.schedule.filter(item => item.section_id === mismatch.section_id).map(item => item.room_id));
    const target = findFeasibleRoomForSession(mismatch, new Set([...excluded, ...currentRooms]));
    if (target) {
      excluded.add(target.id);
      actions.push({ type: "relocate_section", params: { section_id: mismatch.section_id, target_room_id: target.id } });
      manifest.push({
        domain: "SPACE",
        title: `Resolve ${mismatch.section_id} capacity overflow`,
        detail: `${mismatch.course} moves from ${mismatch.capacity} seats to ${target.capacity} seats.`,
      });
    }
  }

  if (route) {
    const activeBuses = Math.min(20, route.active_buses + 2);
    const headway = Math.max(5, route.headway_minutes - 10);
    actions.push({ type: "adjust_bus_frequency", params: { route_id: route.route_id, active_buses: activeBuses, headway_minutes: headway } });
    manifest.push({
      domain: "MOBILITY",
      title: `Reinforce ${route.name}`,
      detail: `Active buses rise from ${route.active_buses} to ${activeBuses}; modeled headway falls to ${headway} minutes.`,
    });
  }

  if (actions.length < 2) return null;
  return {
    name: "Judge demo: Open Day resilience response",
    objective: "resilience",
    uncertainty_samples: 650,
    actions,
    manifest,
    question: "What should campus operations investigate first, and what intervention should we test?",
  };
}

function renderFlagshipPlan() {
  const plan = buildFlagshipPlan();
  state.flagshipPlan = plan;
  const button = $("#runFlagshipSimulation");
  if (!plan) {
    button.disabled = true;
    $("#flagshipPlanStatus").textContent = "Current snapshot cannot satisfy all five action contracts";
    $("#flagshipManifest").innerHTML = `<li><span>--</span><strong>PLAN BLOCKED</strong><p>A capacity mismatch, a feasible target, an active route, and a schedulable response are required.</p></li>`;
    return;
  }

  button.disabled = false;
  $("#flagshipPlanStatus").textContent = `${plan.actions.length} interventions derived from the current twin`;
  $("#flagshipManifest").innerHTML = plan.manifest.map((item, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><strong>${esc(item.domain)} / ${esc(item.title)}</strong><p>${esc(item.detail)}</p></li>`).join("");
}

function renderJudgeDemoPlan() {
  const plan = buildJudgeDemoPlan();
  state.judgeDemoPlan = plan;
  const button = $("#runJudgeDemo");
  if (!button) return;
  button.disabled = !plan;
  $("#judgeDemoStatus").textContent = plan
    ? `${plan.actions.length} linked actions ready`
    : "Waiting for a complete campus snapshot";
  $("#judgeDemoManifest").innerHTML = plan
    ? plan.manifest.map((item, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><strong>${esc(item.domain)}</strong><p>${esc(item.title)}. ${esc(item.detail)}</p></li>`).join("")
    : `<li><span>--</span><strong>BUILDING FLOW</strong><p>Load schedules, rooms, events and bus pressure to build the judge path.</p></li>`;
}

function applyPreset(preset, shouldNavigate = true) {
  if (!state.summary || !state.rooms.length || !state.schedule.length) {
    toast("The twin is still loading. Try the preset again in a moment.");
    return;
  }

  $$("[data-preset]").forEach(button => button.classList.toggle("is-selected", button.dataset.preset === preset));
  $(".flagship-scenario").classList.remove("is-selected");
  if (preset === "capacity") {
    const mismatch = [...state.schedule].filter(session => session.over_capacity).sort((a, b) => (b.enrollment - b.capacity) - (a.enrollment - a.capacity))[0];
    if (!mismatch) {
      toast("No capacity mismatch is available in the current snapshot.");
      return;
    }
    const target = [...state.rooms]
      .filter(room => room.id !== mismatch.room_id && room.capacity >= mismatch.enrollment)
      .sort((a, b) => (a.capacity - mismatch.enrollment) - (b.capacity - mismatch.enrollment) || a.scheduled_hours - b.scheduled_hours)[0];
    if (!target) {
      toast("No feasible target room is available for the highest mismatch.");
      return;
    }
    $("#actionType").value = "relocate_section";
    renderActionFields();
    $("#paramSection").value = mismatch.section_id;
    $("#paramTargetRoom").value = target.id;
    $("#scenarioName").value = `Resolve ${mismatch.section_id} capacity mismatch`;
    $("#scenarioObjective").value = "space";
  } else if (preset === "transport") {
    const route = state.summary.route_pressure[0];
    $("#actionType").value = "adjust_bus_frequency";
    renderActionFields();
    $("#paramRoute").value = route.route_id;
    $("#paramBuses").value = Math.min(20, route.active_buses + 1);
    $("#paramHeadway").value = Math.max(5, route.headway_minutes - 5);
    $("#scenarioName").value = `Relieve ${route.name} peak pressure`;
    $("#scenarioObjective").value = "transport";
  } else if (preset === "growth") {
    const section = [...uniqueSections()].sort((a, b) => b.enrollment - a.enrollment)[0];
    $("#actionType").value = "change_intake";
    renderActionFields();
    $("#paramSection").value = section.section_id;
    $("#paramEnrollment").value = Math.min(500, Math.ceil(section.enrollment * 1.2));
    $("#scenarioName").value = `Stress-test 20 percent growth in ${section.section_id}`;
    $("#scenarioObjective").value = "resilience";
  } else if (preset === "energy") {
    const room = [...state.rooms].sort((a, b) => a.scheduled_hours - b.scheduled_hours || a.id.localeCompare(b.id))[0];
    $("#actionType").value = "close_room";
    renderActionFields();
    $("#paramRoom").value = room.id;
    $("#scenarioName").value = `Test consolidation after closing ${room.name}`;
    $("#scenarioObjective").value = "energy";
  }

  if (shouldNavigate) navigate("simulate");
  toast("Scenario preset loaded. Review the intervention before running it.");
}

function deltaClass(delta) {
  if (Math.abs(delta.delta) < 0.001) return "neutral";
  if (delta.direction === "lower-is-better") return delta.delta < 0 ? "good" : "bad";
  if (delta.direction === "higher-is-better") return delta.delta > 0 ? "good" : "bad";
  return "neutral";
}

function renderScenario(result) {
  state.lastScenario = result;
  const maxBand = Math.max(...result.confidence.map(item => item.p90), 1);
  const meta = state.lastScenarioMeta || { kind: "single", actionCount: result.action_log.length, samples: 220, manifest: [] };
  const compound = meta.kind === "compound";
  const verdictCopy = {
    recommended: "The modeled benefits outweigh the identified trade-offs under the selected objective.",
    review: "The scenario is plausible, but one or more trade-offs need an operator decision.",
    reject: "The scenario introduces material operational risk and should not proceed as modeled.",
  }[result.verdict];
  const executionChain = compound ? `<section class="execution-chain"><header><span>COMPOUND EXECUTION ORDER</span><strong>${meta.actionCount} linked interventions</strong></header><ol>${meta.manifest.map((item, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${esc(item.domain)}</strong><p>${esc(item.title)}</p></div></li>`).join("")}</ol></section>` : "";

  $("#simulationOutput").innerHTML = `<article class="panel">
    <div class="result-head">
      <div><div class="result-verdict"><span class="verdict-box ${esc(result.verdict)}">${esc(result.verdict)}</span><strong>${esc(result.name)}</strong></div><div class="value-mono" style="margin-top:7px;color:var(--muted)">${esc(result.scenario_id)} / objective ${esc(result.objective)}</div></div>
      <div class="score-box"><span>DECISION SCORE</span><strong>${num(result.score)}</strong></div>
    </div>
    <div class="decision-summary"><div><h3>${result.verdict === "recommended" ? "A defensible move" : result.verdict === "review" ? "Operator review required" : "Do not implement as modeled"}</h3><p>${esc(verdictCopy)}</p></div><button class="primary-button" id="recordScenarioOutcome" type="button">RECORD FUTURE OUTCOME</button></div>
    <div class="complexity-strip">
      <div><span>BRANCH TYPE</span><strong>${compound ? "COMPOUND" : "SINGLE"}</strong></div>
      <div><span>LINKED ACTIONS</span><strong>${meta.actionCount}</strong></div>
      <div><span>RECOMPUTED DOMAINS</span><strong>5</strong></div>
      <div><span>UNCERTAINTY DRAWS</span><strong>${meta.samples}</strong></div>
      <div><span>BASELINE WRITES</span><strong>0</strong></div>
    </div>
    ${executionChain}
    <div class="delta-grid">${result.deltas.map(delta => `<div class="delta-cell"><span>${esc(delta.label)}</span><div class="delta-values"><s>${num(delta.before)}${esc(delta.unit)}</s><b>to</b><strong>${num(delta.after)}${esc(delta.unit)}</strong></div><div class="delta-change ${deltaClass(delta)}">${delta.delta >= 0 ? "+" : ""}${num(delta.delta, 2)} ${esc(delta.unit)}</div></div>`).join("")}</div>
    <div class="result-columns">
      <section class="result-section"><h3>Cascading effects</h3>${result.cascade_effects.length ? result.cascade_effects.map(effect => `<div class="effect"><div class="effect-meta"><span>${esc(effect.domain)}</span><span class="${esc(effect.severity)}">${esc(effect.severity)}</span></div><strong>${esc(effect.title)}</strong><p>${esc(effect.explanation)}</p></div>`).join("") : `<p class="microcopy">No material secondary effect crossed the explanation thresholds.</p>`}</section>
      <section class="result-section"><h3>Uncertainty bands</h3>${result.confidence.map(band => {
        const left = Math.max(0, 100 * band.p10 / maxBand);
        const width = Math.max(2, 100 * (band.p90 - band.p10) / maxBand);
        const midpoint = 100 * band.median / maxBand;
        return `<div class="band-row"><span>${esc(band.metric)}</span><div class="band-track"><i class="band-range" style="left:${left}%;width:${width}%"></i><i class="band-mid" style="left:${midpoint}%"></i></div><strong class="value-mono">${num(band.median)}</strong></div>`;
      }).join("")}<div class="effect"><div class="effect-meta"><span>ACTION LOG</span></div>${result.action_log.map(item => `<p>${esc(item)}</p>`).join("")}</div></section>
      <details class="assumptions"><summary>MODEL CONTRACT / ${result.assumptions.length} EXPLICIT ASSUMPTIONS</summary><ul>${result.assumptions.map(assumption => `<li>${esc(assumption)}</li>`).join("")}</ul></details>
    </div>
  </article>`;
  $("#feedbackPredicted").value = result.after.room_utilization_pct;
  $("#feedbackMetric").value = "room_utilization_pct";
  $("#recordScenarioOutcome").addEventListener("click", () => navigate("feedback"));
}

function renderScenarioHistory() {
  const scenarios = state.scenarioHistory || [];
  $("#scenarioHistory").innerHTML = scenarios.length ? scenarios.map(item => `
    <article class="history-row">
      <div>
        <span class="history-kicker">${esc(item.objective)} / ${esc(item.verdict)}</span>
        <strong>${esc(item.name)}</strong>
        <p>${esc(new Date(item.created_at).toLocaleString())}</p>
      </div>
      <div class="history-score"><span>SCORE</span><strong>${num(item.score)}</strong></div>
    </article>`).join("") : `
    <div class="empty-list">
      <strong>No saved scenarios yet.</strong>
      <p>Run a Scenario Lab intervention while Databricks is active to persist the decision record.</p>
    </div>`;
}

function renderScenarioComparison() {
  const comparison = state.scenarioComparison;
  const best = comparison?.best;
  $("#scenarioComparison").innerHTML = best ? `
    <div class="comparison-lead">
      <div>
        <span class="history-kicker">BEST SAVED OPTION</span>
        <strong>${esc(best.name)}</strong>
        <p>${esc(comparison.recommendation)}</p>
      </div>
      <div class="history-score"><span>SCORE</span><strong>${num(best.score)}</strong></div>
    </div>
    <div class="comparison-grid">
      <div><span>SCORE DELTA</span><strong>${best.score_delta >= 0 ? "+" : ""}${num(best.score_delta)}</strong></div>
      <div><span>CAPACITY FIT</span><strong>${best.capacity_fit_delta >= 0 ? "+" : ""}${num(best.capacity_fit_delta)}%</strong></div>
      <div><span>TRANSPORT LOAD</span><strong>${best.transport_load_delta >= 0 ? "+" : ""}${num(best.transport_load_delta)}%</strong></div>
      <div><span>ENERGY</span><strong>${best.energy_delta_kwh >= 0 ? "+" : ""}${num(best.energy_delta_kwh)} kWh</strong></div>
    </div>
    <div class="comparison-table-wrap">
      <table class="data-table">
        <thead><tr><th>Scenario</th><th>Verdict</th><th>Score</th><th>Transport</th><th>Capacity</th><th>Critical effects</th></tr></thead>
        <tbody>${(comparison.scenarios || []).slice(0, 6).map(item => `
          <tr>
            <td><strong>${esc(item.name)}</strong><div class="value-mono">${esc(item.objective)}</div></td>
            <td><span class="signal-chip ${item.verdict === "recommended" ? "ok" : item.verdict === "review" ? "watch" : "critical"}">${esc(item.verdict)}</span></td>
            <td class="value-mono">${num(item.score)}</td>
            <td class="value-mono">${item.transport_load_delta >= 0 ? "+" : ""}${num(item.transport_load_delta)}%</td>
            <td class="value-mono">${item.capacity_fit_delta >= 0 ? "+" : ""}${num(item.capacity_fit_delta)}%</td>
            <td class="value-mono">${esc(item.critical_effects)}</td>
          </tr>`).join("")}</tbody>
      </table>
    </div>` : `
    <div class="empty-list">
      <strong>No comparison yet.</strong>
      <p>Run and persist at least one scenario to rank saved options.</p>
    </div>`;
}

function inlineFormat(value) {
  return value
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function formatAnswer(content) {
  const lines = esc(content).split(/\r?\n/);
  const output = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      output.push("</ul>");
      listOpen = false;
    }
  };
  for (const line of lines) {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^(?:[-*]|&bull;|•)\s+(.+)$/);
    if (bullet) {
      if (!listOpen) {
        output.push("<ul>");
        listOpen = true;
      }
      output.push(`<li>${inlineFormat(bullet[1])}</li>`);
    } else if (!trimmed) {
      closeList();
    } else {
      closeList();
      output.push(`<p>${inlineFormat(trimmed)}</p>`);
    }
  }
  closeList();
  return output.join("");
}

function renderRows(rows) {
  if (!rows?.length) return "";
  const columns = Object.keys(rows[0]).slice(0, 7);
  return `<div class="result-table-wrap"><table class="result-table"><thead><tr>${columns.map(column => `<th>${esc(column)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, 8).map(row => `<tr>${columns.map(column => `<td>${esc(row[column])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderFeedbackHistory() {
  const history = state.feedbackHistory || { count: 0, avg_relative_error_pct: 0, records: [] };
  $("#feedbackStats").innerHTML = `
    <div><span>RECORDS</span><strong>${history.count || 0}</strong></div>
    <div><span>AVG ERROR</span><strong>${num(history.avg_relative_error_pct || 0, 2)}%</strong></div>
    <div><span>SOURCE</span><strong>${esc(history.source || "unknown")}</strong></div>`;
  $("#feedbackHistory").innerHTML = history.records?.length ? history.records.map(record => `
    <article class="feedback-row">
      <div>
        <span class="history-kicker">${esc(record.metric)}</span>
        <strong>${num(record.predicted, 2)} predicted / ${num(record.observed, 2)} observed</strong>
        <p>${esc(record.notes || "No operator note.")}</p>
      </div>
      <div class="history-score"><span>ERROR</span><strong>${num(record.relative_error_pct, 2)}%</strong></div>
    </article>`).join("") : `
    <div class="empty-list">
      <strong>No calibration records yet.</strong>
      <p>Store an observed result to make the feedback loop visible.</p>
    </div>`;
}

async function refreshOperationalMemory() {
  try {
    const [scenarioHistory, scenarioComparison, feedbackHistory] = await Promise.all([
      api.scenarioHistory(),
      api.scenarioCompare(),
      api.feedbackHistory(),
    ]);
    state.scenarioHistory = scenarioHistory.scenarios || [];
    state.scenarioComparison = scenarioComparison;
    state.feedbackHistory = feedbackHistory;
    renderScenarioHistory();
    renderScenarioComparison();
    renderFeedbackHistory();
  } catch (error) {
    toast(`Could not refresh operational memory: ${error.message}`);
  }
}

function addMessage(role, content, extra = {}) {
  const node = document.createElement("div");
  node.className = `message ${role}`;
  const label = role === "user" ? "YOU" : extra.mode === "genie" ? "DATABRICKS GENIE" : "LOCAL CAMPUS ANALYST";
  const evidence = extra.evidence?.length
    ? `<div class="message-evidence">Evidence: ${extra.evidence.map(esc).join(" / ")}</div>`
    : "";
  const inspectable = extra.sql || extra.rows?.length
    ? `<details class="evidence-drawer" ${extra.rows?.length ? "open" : ""}><summary>INSPECT GENERATED SQL AND RETURNED DATA</summary>${extra.sql ? `<pre class="message-sql">${esc(extra.sql)}</pre>` : ""}${renderRows(extra.rows)}</details>`
    : "";
  node.innerHTML = `<div class="message-meta">${esc(label)}</div><div class="formatted-answer">${formatAnswer(content)}</div>${evidence}${inspectable}`;
  $("#conversation").appendChild(node);
  $("#conversation").scrollTop = $("#conversation").scrollHeight;
  return node;
}

function renderPromptList(questions) {
  $("#promptList").innerHTML = questions.map(question => `<button class="prompt-button" type="button" data-question="${esc(question)}">${esc(question)}</button>`).join("");
  $$(".prompt-button", $("#promptList")).forEach(button => button.addEventListener("click", () => askGenie(button.dataset.question)));
}

function scenarioForQuestion(question) {
  const normalized = question.toLowerCase();
  if (/(bus|route|transport|shuttle|mobility)/.test(normalized)) {
    return { preset: "transport", title: "Test added shuttle capacity", copy: "Load a transport intervention for the highest-pressure route." };
  }
  if (/(energy|power|electric|consolidat)/.test(normalized)) {
    return { preset: "energy", title: "Test room consolidation", copy: "Close the lowest-use room in the twin and inspect the modeled trade-offs." };
  }
  if (/(intake|growth|enrollment|student)/.test(normalized)) {
    return { preset: "growth", title: "Stress-test enrollment growth", copy: "Increase the largest section by 20 percent and propagate the effects." };
  }
  return { preset: "capacity", title: "Resolve a capacity mismatch", copy: "Move the highest-overflow section into a feasible room and compare the outcome." };
}

function showDecisionBridge(question) {
  const recommendation = scenarioForQuestion(question);
  const bridge = $("#decisionBridge");
  bridge.hidden = false;
  bridge.dataset.preset = recommendation.preset;
  $("#decisionBridgeTitle").textContent = recommendation.title;
  $("#decisionBridgeCopy").textContent = recommendation.copy;
}

async function askGenie(question) {
  const cleanQuestion = withoutEmoji(question).trim();
  if (!cleanQuestion) return;
  navigate("genie");
  state.lastGenieQuestion = cleanQuestion;
  addMessage("user", cleanQuestion);
  $("#genieQuestion").value = "";
  const button = $("#genieForm button");
  setLoading(button, true);
  const working = addMessage("assistant", "Running a grounded query against the active CampusTwin views.", { mode: "genie" });
  working.classList.add("working-message");
  try {
    const answer = await api.genie({ question: cleanQuestion, conversation_id: state.genieConversationId });
    working.remove();
    if (answer.conversation_id) {
      state.genieConversationId = answer.conversation_id;
      $("#conversationIdLabel").textContent = `CONVERSATION ${answer.conversation_id.slice(0, 12).toUpperCase()}`;
    }
    addMessage("assistant", answer.answer, answer);
    $("#genieMode").textContent = answer.mode === "genie" ? "Databricks Genie" : "Local constrained analyst";
    $("#genieModeNote").textContent = answer.mode === "genie"
      ? "Stateful analysis over governed CampusTwin gold views."
      : "Deterministic fallback over the active snapshot.";
    if (answer.suggested_questions?.length) renderPromptList(answer.suggested_questions);
    showDecisionBridge(cleanQuestion);
  } catch (error) {
    working.remove();
    addMessage("assistant", `Request failed: ${error.message}`, { mode: "local" });
  } finally {
    setLoading(button, false);
  }
}

async function runJudgeDemo() {
  const button = $("#runJudgeDemo");
  const plan = state.judgeDemoPlan || buildJudgeDemoPlan();
  if (!plan) {
    toast("Judge demo cannot run until the current snapshot has events, schedules, rooms and route pressure.");
    return;
  }
  setLoading(button, true);
  try {
    navigate("genie");
    addMessage("user", plan.question);
    const genieAnswer = await api.genie({ question: plan.question, conversation_id: state.genieConversationId });
    if (genieAnswer.conversation_id) {
      state.genieConversationId = genieAnswer.conversation_id;
      $("#conversationIdLabel").textContent = `CONVERSATION ${genieAnswer.conversation_id.slice(0, 12).toUpperCase()}`;
    }
    addMessage("assistant", genieAnswer.answer, genieAnswer);
    navigate("simulate");
    state.lastScenarioMeta = { kind: "judge-demo", actionCount: plan.actions.length, samples: plan.uncertainty_samples, manifest: plan.manifest };
    const result = await api.simulate({
      name: plan.name,
      objective: plan.objective,
      persist: state.summary?.source.startsWith("databricks") || false,
      uncertainty_samples: plan.uncertainty_samples,
      actions: plan.actions,
    });
    renderScenario(result);
    await refreshOperationalMemory();
    $("#simulationOutput").scrollIntoView({ block: "start" });
    toast(`Judge demo complete. Verdict: ${result.verdict}. Score: ${result.score}.`);
  } catch (error) {
    toast(`Judge demo failed: ${error.message}`);
  } finally {
    setLoading(button, false);
  }
}

async function loadAll() {
  const refresh = $("#refreshButton");
  setLoading(refresh, true);
  try {
    const [summary, topology, rooms, spatial, schedule, energy, quality, priorities, interactions, scenarioHistory, scenarioComparison, feedbackHistory] = await Promise.all([
      api.summary(),
      api.topology(),
      api.rooms(),
      api.spatial(),
      api.schedule(),
      api.energy(),
      api.quality(),
      api.priorities(),
      api.interactions(),
      api.scenarioHistory(),
      api.scenarioCompare(),
      api.feedbackHistory(),
    ]);
    state.summary = summary;
    state.topology = topology;
    state.rooms = rooms.rooms;
    state.spatial = spatial;
    state.schedule = schedule.schedule;
    state.energy = energy.by_building;
    state.dataQuality = quality;
    state.priorities = priorities.priorities || [];
    state.interactions = interactions.interactions || [];
    state.scenarioHistory = scenarioHistory.scenarios || [];
    state.scenarioComparison = scenarioComparison;
    state.feedbackHistory = feedbackHistory;
    renderSource();
    renderMetrics();
    renderDecisionProof();
    renderDataQuality();
    renderBriefing();
    renderPriorityQueue();
    renderInteractions();
    renderBuildingTable();
    renderRouteTable();
    renderMap();
    renderExplore();
    renderScenarioHistory();
    renderScenarioComparison();
    renderFeedbackHistory();
    renderActionFields();
    renderFlagshipPlan();
    renderJudgeDemoPlan();
    twinStudio.setData({
      rooms: state.rooms,
      schedule: state.schedule,
      buildings: state.topology.buildings,
      events: state.topology.events,
      energy: state.energy,
      summary: state.summary,
      plan: state.flagshipPlan,
      buildingPressure: state.topology.building_pressure,
      walkEdges: state.topology.walk_edges,
      routePressure: state.summary.route_pressure,
      bimStoreys: state.spatial.storeys,
      bimSpaces: state.spatial.spaces,
    });
    const databricks = summary.source.startsWith("databricks");
    $("#genieMode").textContent = databricks ? "Databricks Genie" : "Local constrained analyst";
    $("#genieModeNote").textContent = databricks
      ? "Stateful analysis over governed CampusTwin gold views."
      : "No Genie claim is made in local fallback mode.";
  } catch (error) {
    toast(`Could not load twin: ${error.message}`);
  } finally {
    setLoading(refresh, false);
  }
}

function bindHero() {
  $("#overviewGenieForm").addEventListener("submit", event => {
    event.preventDefault();
    askGenie($("#overviewGenieQuestion").value);
  });
  $$("[data-hero-question]").forEach(button => button.addEventListener("click", () => askGenie(button.dataset.heroQuestion)));
  $("#investigatePriority").addEventListener("click", () => askGenie(state.priorityQuestion));
  $("#runJudgeDemo").addEventListener("click", runJudgeDemo);
}

function bindExplore() {
  $$("[data-explore-tab]").forEach(button => button.addEventListener("click", () => {
    state.exploreTab = button.dataset.exploreTab;
    $$("[data-explore-tab]").forEach(item => item.classList.toggle("is-active", item === button));
    renderExplore();
  }));
  $("#exploreSearch").addEventListener("input", renderExplore);
  $("#exploreTableWrap").addEventListener("click", event => {
    const trigger = event.target.closest("[data-bim-room]");
    if (!trigger) return;
    const room = state.rooms.find(item => item.id === trigger.dataset.bimRoom);
    if (!room || !twinStudio.focusRoom(room.id)) {
      toast("This room has no IFC space mapping in the current model.");
      return;
    }
    navigate("studio");
    toast(`${room.name} highlighted from its governed IFC space mapping.`);
  });
}

function bindSimulation() {
  $("#actionType").addEventListener("change", renderActionFields);
  $$("[data-preset]").forEach(button => button.addEventListener("click", () => applyPreset(button.dataset.preset)));
  $("#runFlagshipSimulation").addEventListener("click", async () => {
    const button = $("#runFlagshipSimulation");
    const plan = state.flagshipPlan;
    if (!plan) {
      toast("The compound plan is unavailable for the current snapshot.");
      return;
    }
    setLoading(button, true);
    $(".flagship-scenario").classList.add("is-selected");
    $$("[data-preset]").forEach(item => item.classList.remove("is-selected"));
    state.lastScenarioMeta = { kind: "compound", actionCount: plan.actions.length, samples: plan.uncertainty_samples, manifest: plan.manifest };
    try {
      const result = await api.simulate({
        name: plan.name,
        objective: plan.objective,
        persist: state.summary?.source.startsWith("databricks") || false,
        uncertainty_samples: plan.uncertainty_samples,
        actions: plan.actions,
      });
      renderScenario(result);
      await refreshOperationalMemory();
      $("#simulationOutput").scrollIntoView({ block: "start" });
      toast(`Compound simulation complete. Verdict: ${result.verdict}. Score: ${result.score}.`);
    } catch (error) {
      toast(`Compound simulation failed: ${error.message}`);
    } finally {
      setLoading(button, false);
    }
  });
  $("#runSimulation").addEventListener("click", async () => {
    const button = $("#runSimulation");
    setLoading(button, true);
    $(".flagship-scenario").classList.remove("is-selected");
    state.lastScenarioMeta = { kind: "single", actionCount: 1, samples: 220, manifest: [] };
    try {
      const result = await api.simulate({
        name: $("#scenarioName").value || "Operational what-if",
        objective: $("#scenarioObjective").value,
        persist: state.summary?.source.startsWith("databricks") || false,
        actions: [buildAction()],
      });
      renderScenario(result);
      await refreshOperationalMemory();
      toast(`Scenario complete. Verdict: ${result.verdict}. Score: ${result.score}.`);
    } catch (error) {
      toast(`Simulation failed: ${error.message}`);
    } finally {
      setLoading(button, false);
    }
  });
}

function bindGenie() {
  const starters = [
    "Give me a cross-domain brief of the campus right now.",
    "Where are the current capacity mismatches?",
    "Which bus route has the highest peak pressure?",
    "Which building used the most energy on the latest day?",
  ];
  renderPromptList(starters);
  $("#genieForm").addEventListener("submit", event => {
    event.preventDefault();
    askGenie($("#genieQuestion").value);
  });
  $("#openScenarioFromGenie").addEventListener("click", () => applyPreset($("#decisionBridge").dataset.preset || "capacity"));
}

function bindFeedback() {
  $("#feedbackForm").addEventListener("submit", async event => {
    event.preventDefault();
    const payload = {
      scenario_id: state.lastScenario?.scenario_id || null,
      metric: $("#feedbackMetric").value.trim(),
      predicted: Number($("#feedbackPredicted").value),
      observed: Number($("#feedbackObserved").value),
      notes: $("#feedbackNotes").value.trim(),
    };
    const button = $("#feedbackForm button");
    setLoading(button, true);
    try {
      const record = await api.feedback(payload);
      $("#feedbackResult").innerHTML = `<strong>Calibration record stored.</strong><br>${esc(record.metric)} / relative error <span class="value-mono">${num(record.relative_error_pct, 2)}%</span><br><span class="value-mono">${esc(record.id)}</span>`;
      await refreshOperationalMemory();
      toast("Outcome stored in the active repository.");
    } catch (error) {
      toast(`Feedback failed: ${error.message}`);
    } finally {
      setLoading(button, false);
    }
  });
}

function bindSetup() {
  const dialog = $("#setupDialog");
  $("#openSetup").addEventListener("click", () => dialog.showModal());
  $("#bootstrapButton").addEventListener("click", async () => {
    const button = $("#bootstrapButton");
    setLoading(button, true);
    $("#setupLog").textContent = "Starting explicit bootstrap.";
    try {
      const result = await api.bootstrap({ create_genie: $("#createGenie").checked, force_reseed: $("#forceReseed").checked });
      $("#setupLog").textContent = [
        `Namespace: ${result.namespace}`,
        ...result.steps.map((step, index) => `${String(index + 1).padStart(2, "0")}. ${step}`),
        result.genie_space_id ? `Genie Agent: ${result.genie_space_id}` : "",
      ].filter(Boolean).join("\n");
      toast("Databricks initialization completed.");
      await loadAll();
    } catch (error) {
      $("#setupLog").textContent = `Bootstrap failed\n${error.message}`;
    } finally {
      setLoading(button, false);
    }
  });
}

bindNavigation();
bindHero();
bindExplore();
bindSimulation();
bindGenie();
bindFeedback();
bindSetup();
$("#refreshButton").addEventListener("click", loadAll);
window.addEventListener("keydown", event => {
  if ((event.key === "r" || event.key === "R") && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) loadAll();
});
loadAll();
