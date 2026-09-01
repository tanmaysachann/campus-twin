const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STAGES = [
  "00 / BASELINE",
  "01 / DEMAND SHOCK",
  "02 / ROOM OUTAGE",
  "03 / SPACE + TIME RESPONSE",
  "04 / MOBILITY RESPONSE",
];
const PALETTE = {
  accent: "#ef4b36",
  signal: "#d7ff3f",
  normal: "#26724a",
  watch: "#b26d00",
  critical: "#b33b2e",
  released: "#244f6d",
  used: "#71877f",
};

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const esc = value => String(value ?? "").replace(/[&<>'"]/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;",
}[character]));
const format = (value, digits = 1) => Number(value ?? 0).toLocaleString(undefined, {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});

function stageAction(plan, type) {
  return plan?.actions?.find(action => action.type === type) || null;
}

export function createTwinStudio({ root, notify, onAskGenie, onOpenScenario, onSelectionChange }) {
  const host = typeof root === "string" ? document.querySelector(root) : root;
  if (!host) return { setData() {}, setScenarioContext() {}, render() {}, focusRoom() {}, focusFloor() {} };

  const elements = {
    building: host.querySelector("#studioBuilding"),
    floor: host.querySelector("#studioFloor"),
    day: host.querySelector("#studioDay"),
    hour: host.querySelector("#studioHour"),
    hourLabel: host.querySelector("#studioHourLabel"),
    iframe: host.querySelector("#xeokitViewer"),
    loading: host.querySelector("#xeokitLoading"),
    modelTitle: host.querySelector("#studioModelTitle"),
    modelContext: host.querySelector("#studioModelContext"),
    stage: host.querySelector("#studioStage"),
    stageLabel: host.querySelector("#studioStageLabel"),
    stageKicker: host.querySelector("#studioStageKicker"),
    stageTitle: host.querySelector("#studioStageTitle"),
    stageDetail: host.querySelector("#studioStageDetail"),
    stageTargets: host.querySelector("#studioStageTargets"),
    play: host.querySelector("#studioPlay"),
    roomState: host.querySelector("#studioRoomState"),
    roomCode: host.querySelector("#studioRoomCode"),
    roomName: host.querySelector("#studioRoomName"),
    roomType: host.querySelector("#studioRoomType"),
    roomFacts: host.querySelector("#studioRoomFacts"),
    roomSchedule: host.querySelector("#studioRoomSchedule"),
    roomScenario: host.querySelector("#studioRoomScenario"),
    floorState: host.querySelector("#studioFloorState"),
    floorFacts: host.querySelector("#studioFloorFacts"),
    legend: host.querySelector("#studioLegend"),
    askGenie: host.querySelector("#studioAskGenie"),
    openScenario: host.querySelector("#studioOpenScenario"),
  };

  const view = {
    buildingId: null,
    floor: 0,
    day: "Mon",
    hour: 10,
    layer: "scenario",
    stage: 0,
    selectedRoomId: null,
    focusKind: null,
  };
  let data = {
    rooms: [], schedule: [], buildings: [], energy: [], buildingPressure: [],
    routePressure: [], summary: null, plan: null, bimStoreys: [], bimSpaces: [],
  };
  let viewerReady = false;
  let xeokitStats = { objectCount: 0, storeyCount: 0, modelCount: 0 };
  let playback = null;
  let scenarioContext = { affected_bim_objects: [], scenario_result: null };

  function buildingById(id) {
    return data.buildings.find(building => building.id === id) || null;
  }

  function roomById(id) {
    return data.rooms.find(room => room.id === id) || null;
  }

  function storeyForFloor(floor) {
    return data.bimStoreys.find(storey => Number(storey.floor_index) === Number(floor)) || null;
  }

  function spaceForRoom(roomId) {
    return data.bimSpaces.find(space => space.room_id === roomId) || null;
  }

  function activeScenarioImpacts() {
    const resultImpacts = scenarioContext?.scenario_result?.affected_bim_objects || [];
    return resultImpacts.length ? resultImpacts : (scenarioContext?.affected_bim_objects || []);
  }

  function scenarioHighlights() {
    return activeScenarioImpacts().filter(impact => {
      const room = roomById(impact.room_id);
      if (!room || room.building_id !== view.buildingId) return false;
      if (view.focusKind === "floor" || view.focusKind === "room") {
        return Number(room.floor) === Number(view.floor);
      }
      return true;
    }).map(impact => ({
      roomId: impact.room_id,
      role: impact.role,
      rootObjectIds: [impact.bim_space_id].filter(Boolean),
      objectIds: [impact.bim_space_id, impact.render_object_id].filter(Boolean),
    }));
  }

  function selectedEntityForObject(objectId) {
    const space = data.bimSpaces.find(item => item.id === objectId || item.render_object_id === objectId);
    if (!space?.room_id) {
      return { entity_type: "bim_object", entity_id: objectId, render_object_id: objectId };
    }
    const room = roomById(space.room_id);
    return {
      entity_type: "room",
      entity_id: room?.id || space.room_id,
      name: room?.name || space.name,
      room_id: space.room_id,
      building_id: room?.building_id || null,
      floor: room ? Number(room.floor) : Number(space.floor_index),
      bim_space_id: space.id,
      render_object_id: space.render_object_id,
    };
  }

  function publishViewSelection(kind = view.focusKind) {
    if (kind === "room" && view.selectedRoomId) {
      const space = spaceForRoom(view.selectedRoomId);
      onSelectionChange?.(selectedEntityForObject(space?.render_object_id || space?.id || view.selectedRoomId));
      return;
    }
    if (kind === "floor") {
      const building = buildingById(view.buildingId);
      onSelectionChange?.({
        entity_type: "floor",
        entity_id: `${view.buildingId}:floor:${view.floor}`,
        name: `${building?.name || view.buildingId} floor ${view.floor}`,
        building_id: view.buildingId,
        floor: view.floor,
      });
      return;
    }
    const building = buildingById(view.buildingId);
    if (building) {
      onSelectionChange?.({ entity_type: "building", entity_id: building.id, name: building.name, building_id: building.id });
    }
  }

  function selectionForView() {
    if (view.focusKind === "room" && view.selectedRoomId) {
      const space = spaceForRoom(view.selectedRoomId);
      if (space) {
        return {
          kind: "room",
          label: `${roomById(view.selectedRoomId)?.name || view.selectedRoomId} / IFC SPACE ${space.name}`,
          rootObjectIds: [space.id],
          objectIds: [space.id, space.render_object_id].filter(Boolean),
        };
      }
    }
    if (view.focusKind === "floor") {
      const storey = storeyForFloor(view.floor);
      if (storey) {
        return {
          kind: "floor",
          label: storey.name,
          rootObjectIds: [
            storey.architecture_object_id,
            storey.mep_object_id,
            storey.structure_object_id,
          ].filter(Boolean),
        };
      }
    }
    if (view.focusKind === "building" && view.buildingId) {
      const building = buildingById(view.buildingId);
      return {
        kind: "building",
        label: building?.name || view.buildingId,
        buildingId: view.buildingId,
        buildingIndex: Math.max(0, data.buildings.findIndex(item => item.id === view.buildingId)),
        buildingCount: data.buildings.length,
      };
    }
    return null;
  }

  function visibleRooms() {
    return data.rooms
      .filter(room => room.building_id === view.buildingId && Number(room.floor) === Number(view.floor))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  function roomSessions(roomId) {
    return data.schedule.filter(session => session.room_id === roomId);
  }

  function slotSessions(roomId) {
    return roomSessions(roomId).filter(session => (
      session.day === view.day
      && view.hour >= session.start_hour
      && view.hour < session.start_hour + session.duration_hours
    ));
  }

  function roomRiskCount(room) {
    return roomSessions(room.id).filter(session => session.enrollment > room.capacity).length;
  }

  function scenarioFlags(room) {
    const flags = { demand: false, source: false, closed: false, released: false, receiving: false, rescheduled: false, descriptions: [] };
    for (const impact of activeScenarioImpacts().filter(item => item.room_id === room.id)) {
      if (impact.role === "source") {
        flags.source = true;
        flags.descriptions.push("This is a source space in the active Scenario Lab intervention.");
      } else if (impact.role === "destination") {
        flags.receiving = true;
        flags.descriptions.push("This is a destination space in the active Scenario Lab intervention.");
      } else {
        flags.demand = true;
        flags.descriptions.push("This BIM space is affected by the active Scenario Lab intervention.");
      }
    }
    if (!data.plan || view.stage === 0) return flags;
    const demand = stageAction(data.plan, "change_intake");
    if (view.stage >= 1 && demand && roomSessions(room.id).some(session => session.section_id === demand.params.section_id)) {
      flags.demand = true;
      flags.descriptions.push(`${demand.params.section_id} grows to ${demand.params.enrollment} students.`);
    }
    const outage = stageAction(data.plan, "close_room");
    if (view.stage >= 2 && outage?.params.room_id === room.id) {
      flags.closed = true;
      flags.descriptions.push("This room is removed from service and highlighted as the outage zone in xeokit.");
    }
    if (view.stage >= 3) {
      const relocation = stageAction(data.plan, "relocate_section");
      const reschedule = stageAction(data.plan, "reschedule_section");
      if (relocation?.params.target_room_id === room.id) {
        flags.receiving = true;
        flags.descriptions.push(`${relocation.params.section_id} is relocated into this room.`);
      }
      if (reschedule?.params.target_room_id === room.id) {
        flags.rescheduled = true;
        flags.descriptions.push(`${reschedule.params.section_id} moves here on ${reschedule.params.day} at ${reschedule.params.start_hour}:00.`);
      }
    }
    return flags;
  }

  function roomState(room, flags) {
    if (flags.closed) return "OUTAGE";
    if (flags.receiving || flags.rescheduled) return "RECEIVING";
    if (flags.source) return "SOURCE";
    if (flags.demand) return "DEMAND RISK";
    if (roomRiskCount(room) > 0) return "CAPACITY RISK";
    if (slotSessions(room.id).length) return "SCHEDULED";
    return "AVAILABLE";
  }

  function stageBriefing() {
    const manifest = data.plan?.manifest || [];
    const impacts = activeScenarioImpacts();
    if (impacts.length) {
      const hasResult = Boolean(scenarioContext?.scenario_result);
      return {
        kicker: hasResult ? "SCENARIO RESULT / SPATIAL IMPACT" : "SCENARIO LAB / ACTIVE CONTEXT",
        title: hasResult ? "Affected BIM spaces from the latest result" : "Source and destination BIM spaces",
        detail: hasResult
          ? `${impacts.length} governed BIM/XKT space mappings are linked to the generated counterfactual.`
          : `${impacts.length} governed BIM/XKT space mappings update as the intervention changes.`,
      };
    }
    if (view.stage === 0) return {
      kicker: "00 / GOVERNED BASELINE",
      title: "Current BIM baseline",
      detail: "All XKT architecture, building-services, and structural objects are visible with their native materials.",
    };
    if (view.stage === 1) return {
      kicker: STAGES[1],
      title: manifest[0]?.title || "Enrollment demand enters the BIM view",
      detail: manifest[0]?.detail || "Affected space classes are selected and colorized amber in xeokit.",
    };
    if (view.stage === 2) return {
      kicker: STAGES[2],
      title: manifest[1]?.title || "A room zone is taken out of service",
      detail: manifest[1]?.detail || "The affected architectural objects are selected and colorized red.",
    };
    if (view.stage === 3) return {
      kicker: STAGES[3],
      title: "Coordinate space and timetable recovery",
      detail: "Walls are X-rayed while receiving spaces, doors, and slabs are highlighted green for inspection.",
    };
    return {
      kicker: STAGES[4],
      title: manifest[4]?.title || "Reinforce the constrained mobility response",
      detail: "Architectural objects are X-rayed while building-services systems are highlighted in the response color.",
    };
  }

  function sendToViewer(message) {
    if (!elements.iframe?.contentWindow) return;
    elements.iframe.contentWindow.postMessage(message, window.location.origin);
  }

  function sendViewerState({ focus = false } = {}) {
    if (!viewerReady) return;
    sendToViewer({
      type: "campus-twin-xeokit-state",
      state: {
        stage: view.stage,
        layer: view.layer,
        buildingIndex: Math.max(0, data.buildings.findIndex(building => building.id === view.buildingId)),
        floor: view.floor,
        day: view.day,
        hour: view.hour,
        focus,
        selection: selectionForView(),
        scenarioHighlights: scenarioHighlights(),
      },
    });
  }

  function updateFloors(preferredFloor = null) {
    const floors = [...new Set(data.rooms
      .filter(room => room.building_id === view.buildingId)
      .map(room => Number(room.floor)))]
      .sort((a, b) => a - b);
    view.floor = floors.includes(Number(preferredFloor)) ? Number(preferredFloor) : floors[0] ?? 0;
    elements.floor.innerHTML = floors.map(floor => `<option value="${floor}">Floor ${floor}</option>`).join("");
    elements.floor.value = String(view.floor);
    const rooms = visibleRooms();
    if (!rooms.some(room => room.id === view.selectedRoomId)) view.selectedRoomId = rooms[0]?.id || null;
  }

  function renderInspector() {
    const room = roomById(view.selectedRoomId) || visibleRooms()[0];
    if (!room) return;
    view.selectedRoomId = room.id;
    const flags = scenarioFlags(room);
    const active = slotSessions(room.id);
    const building = buildingById(room.building_id);
    elements.roomState.textContent = roomState(room, flags);
    elements.roomCode.textContent = `${room.id} / FLOOR ${room.floor}`;
    elements.roomName.textContent = room.name;
    elements.roomType.textContent = `${room.kind} in ${building?.name || room.building_id}; mapped approximately to the selected xeokit storey.`;
    elements.roomFacts.innerHTML = `
      <div><span>CAPACITY</span><strong>${room.capacity}</strong></div>
      <div><span>SCHEDULED HOURS</span><strong>${format(room.scheduled_hours)}</strong></div>
      <div><span>UTILIZATION</span><strong>${format(room.scheduled_utilization_pct)}%</strong></div>
      <div><span>CAPACITY RISKS</span><strong>${roomRiskCount(room)}</strong></div>`;
    elements.roomSchedule.innerHTML = active.length
      ? active.map(session => `<div class="studio-session"><strong>${esc(session.course)}</strong><span>${esc(session.section_id)} / ${session.enrollment} students / ${session.start_hour}:00-${session.start_hour + session.duration_hours}:00</span></div>`).join("")
      : `<p>No session is scheduled here on ${esc(view.day)} at ${String(view.hour).padStart(2, "0")}:00.</p>`;
    elements.roomScenario.innerHTML = flags.descriptions.length
      ? flags.descriptions.map(description => `<p>${esc(description)}</p>`).join("")
      : `<p>${view.stage === 0 ? "Native xeokit BIM baseline with no scenario styling." : "No direct governed action targets this room at the selected stage."}</p>`;
  }

  function renderReadout() {
    const rooms = visibleRooms();
    const occupied = rooms.filter(room => slotSessions(room.id).length).length;
    const affected = rooms.filter(room => scenarioFlags(room).descriptions.length).length;
    const risks = rooms.reduce((sum, room) => sum + roomRiskCount(room), 0);
    elements.floorState.textContent = viewerReady ? STAGES[view.stage].replace(/^\d+ \/ /, "") : "LOADING";
    elements.floorFacts.innerHTML = `
      <div><span>XKT MODELS</span><strong>${xeokitStats.modelCount || 3}</strong></div>
      <div><span>BIM OBJECTS</span><strong>${xeokitStats.objectCount || "--"}</strong></div>
      <div><span>BIM STOREYS</span><strong>${xeokitStats.storeyCount || "--"}</strong></div>
      <div><span>GOVERNED ROOMS</span><strong>${rooms.length}</strong></div>
      <div><span>SCHEDULED NOW</span><strong>${occupied}</strong></div>
      <div><span>AFFECTED / RISKS</span><strong>${affected} / ${risks}</strong></div>`;
    let legends = {
      schedule: [[PALETTE.accent, "Timetable-linked openings"], [PALETTE.used, "Native BIM context"]],
      capacity: [[PALETTE.normal, "Capacity-linked spaces"], [PALETTE.used, "Native BIM context"]],
      energy: [["#3aabe8", "Building-services systems"], [PALETTE.used, "X-rayed architecture"]],
      scenario: [[PALETTE.accent, "Scenario source"], [PALETTE.normal, "Scenario destination"], [PALETTE.watch, "Other affected space"], [PALETTE.signal, "Services response"]],
    }[view.layer];
    if (view.focusKind === "building") {
      legends = [[PALETTE.signal, "Selected building block"], [PALETTE.used, "Full-model context"]];
    }
    elements.legend.innerHTML = legends.map(([color, label]) => `<span><i style="background:${color}"></i>${esc(label)}</span>`).join("");
  }

  function renderStage() {
    const briefing = stageBriefing();
    const room = roomById(view.selectedRoomId) || visibleRooms()[0];
    const impacts = activeScenarioImpacts();
    elements.stageKicker.textContent = briefing.kicker;
    elements.stageTitle.textContent = briefing.title;
    elements.stageDetail.textContent = briefing.detail;
    elements.stageLabel.textContent = STAGES[view.stage];
    elements.stage.value = String(view.stage);
    elements.stageTargets.innerHTML = impacts.length
      ? impacts.map((impact, index) => {
        const targetRoom = roomById(impact.room_id);
        return `<button type="button" class="${impact.role === "destination" ? "is-active" : ""}" data-stage-target="${index}">${esc(impact.role.toUpperCase())} / ${esc(targetRoom?.name || impact.room_id)} / ${esc(impact.room_id)}</button>`;
      }).join("")
      : room
        ? `<button type="button" class="is-active" data-stage-target="room">BIM STOREY / ${esc(room.name)} / ${esc(room.id)}</button>`
        : "";
  }

  function render() {
    const building = buildingById(view.buildingId);
    elements.modelTitle.textContent = building ? `${building.name} / xeokit BIM view` : "BMSCE approximate BIM demo";
    elements.modelContext.textContent = viewerReady
      ? `${xeokitStats.objectCount} OBJECTS / ${xeokitStats.storeyCount} STOREYS / ${view.layer.toUpperCase()} / ${STAGES[view.stage]}`
      : "LOADING OFFICIAL XEOKIT VIEWER AND XKT MODELS";
    elements.hourLabel.textContent = `${String(view.hour).padStart(2, "0")}:00`;
    renderInspector();
    renderReadout();
    renderStage();
    sendViewerState();
  }

  function setScenarioStage(stage, { focus = true } = {}) {
    view.stage = clamp(Number(stage), 0, 4);
    view.layer = "scenario";
    host.querySelectorAll("[data-studio-layer]").forEach(button => {
      button.classList.toggle("is-active", button.dataset.studioLayer === "scenario");
    });
    render();
    sendViewerState({ focus });
  }

  function stopPlayback(label = "PLAY SCENARIO") {
    if (playback) window.clearInterval(playback);
    playback = null;
    elements.play.textContent = label;
  }

  function playScenario() {
    if (playback) return stopPlayback();
    setScenarioStage(0);
    elements.play.textContent = "STOP PLAYBACK";
    playback = window.setInterval(() => {
      if (view.stage >= 4) return stopPlayback("PLAY AGAIN");
      setScenarioStage(view.stage + 1);
    }, 3200);
  }

  function bind() {
    elements.building.addEventListener("change", () => {
      view.buildingId = elements.building.value;
      view.focusKind = "building";
      updateFloors();
      render();
      sendViewerState({ focus: true });
      publishViewSelection("building");
    });
    elements.floor.addEventListener("change", () => {
      view.floor = Number(elements.floor.value);
      view.selectedRoomId = visibleRooms()[0]?.id || null;
      view.focusKind = "floor";
      render();
      sendViewerState({ focus: true });
      publishViewSelection("floor");
    });
    elements.day.addEventListener("change", () => { view.day = elements.day.value; render(); });
    elements.hour.addEventListener("input", () => { view.hour = Number(elements.hour.value); render(); });
    elements.stage.addEventListener("input", () => setScenarioStage(elements.stage.value));
    elements.play.addEventListener("click", playScenario);
    host.querySelectorAll("[data-studio-layer]").forEach(button => button.addEventListener("click", () => {
      view.layer = button.dataset.studioLayer;
      view.focusKind = null;
      host.querySelectorAll("[data-studio-layer]").forEach(item => item.classList.toggle("is-active", item === button));
      render();
      sendViewerState({ focus: true });
    }));
    host.querySelectorAll("[data-xeokit-tab]").forEach(button => button.addEventListener("click", () => {
      sendToViewer({ type: "campus-twin-xeokit-tab", tab: button.dataset.xeokitTab });
    }));
    host.querySelector("[data-xeokit-action='fit']")?.addEventListener("click", () => sendToViewer({ type: "campus-twin-xeokit-fit" }));
    elements.stageTargets.addEventListener("click", event => {
      const target = event.target.closest("[data-stage-target]");
      if (!target) return;
      const impact = activeScenarioImpacts()[Number(target.dataset.stageTarget)];
      if (impact) {
        const room = roomById(impact.room_id);
        if (room) {
          view.buildingId = room.building_id;
          view.floor = Number(room.floor);
          view.selectedRoomId = room.id;
          view.focusKind = "room";
          elements.building.value = view.buildingId;
          updateFloors(view.floor);
          elements.floor.value = String(view.floor);
          render();
          publishViewSelection("room");
        }
      }
      sendViewerState({ focus: true });
    });
    elements.askGenie.addEventListener("click", () => {
      const building = buildingById(view.buildingId);
      onAskGenie?.(`What should operations know about ${building?.name || view.buildingId}, floor ${view.floor}, at ${view.day} ${view.hour}:00? Use the governed campus data; the xeokit model is illustrative.`);
    });
    elements.openScenario.addEventListener("click", () => onOpenScenario?.());
    window.addEventListener("message", event => {
      if (event.origin !== window.location.origin || event.source !== elements.iframe?.contentWindow) return;
      if (event.data?.type === "campus-twin-xeokit-ready") {
        viewerReady = true;
        xeokitStats = {
          objectCount: Number(event.data.objectCount || 0),
          storeyCount: Number(event.data.storeyCount || 0),
          modelCount: Number(event.data.modelCount || 0),
        };
        elements.loading.classList.add("is-hidden");
        elements.roomState.textContent = "READY";
        render();
        sendViewerState({ focus: false });
        notify?.(`xeokit BIM Viewer ready with ${xeokitStats.objectCount.toLocaleString()} objects.`);
      }
      if (event.data?.type === "campus-twin-xeokit-error") {
        elements.loading.innerHTML = `<strong>XEOKIT MODEL ERROR</strong><span>${esc(event.data.message || "The BIM model could not be loaded.")}</span>`;
        elements.roomState.textContent = "ERROR";
      }
      if (event.data?.type === "campus-twin-xeokit-selection" && event.data.objectId) {
        const selection = selectedEntityForObject(event.data.objectId);
        if (selection.entity_type === "room") {
          const room = roomById(selection.room_id);
          if (room) {
            view.buildingId = room.building_id;
            view.floor = Number(room.floor);
            view.selectedRoomId = room.id;
            view.focusKind = "room";
            elements.building.value = view.buildingId;
            updateFloors(view.floor);
            elements.floor.value = String(view.floor);
            renderInspector();
          }
        }
        onSelectionChange?.(selection);
      }
    });
  }

  bind();

  return {
    setData(nextData) {
      data = { ...data, ...nextData };
      const previousBuilding = view.buildingId;
      view.buildingId = data.buildings.some(building => building.id === previousBuilding)
        ? previousBuilding
        : data.buildings[0]?.id || null;
      elements.building.innerHTML = data.buildings.map(building => `<option value="${esc(building.id)}">${esc(building.name)}</option>`).join("");
      elements.building.value = view.buildingId || "";
      elements.day.value = DAYS.includes(view.day) ? view.day : DAYS[0];
      updateFloors(view.floor);
      if (!previousBuilding && view.buildingId) view.focusKind = "building";
      render();
    },
    setScenarioContext(nextContext) {
      scenarioContext = nextContext || { affected_bim_objects: [], scenario_result: null };
      const firstImpact = activeScenarioImpacts()[0];
      const room = firstImpact ? roomById(firstImpact.room_id) : null;
      if (room) {
        view.buildingId = room.building_id;
        view.floor = Number(room.floor);
        view.selectedRoomId = room.id;
        view.focusKind = "room";
        elements.building.value = view.buildingId;
        updateFloors(view.floor);
        elements.floor.value = String(view.floor);
      }
      view.layer = "scenario";
      host.querySelectorAll("[data-studio-layer]").forEach(button => {
        button.classList.toggle("is-active", button.dataset.studioLayer === "scenario");
      });
      render();
      sendViewerState({ focus: false });
    },
    focusRoom(roomId) {
      const room = roomById(roomId);
      if (!room) return false;
      view.buildingId = room.building_id;
      view.floor = Number(room.floor);
      view.selectedRoomId = room.id;
      view.focusKind = "room";
      elements.building.value = view.buildingId;
      updateFloors(view.floor);
      elements.floor.value = String(view.floor);
      render();
      sendViewerState({ focus: true });
      publishViewSelection("room");
      return true;
    },
    focusFloor(buildingId, floor) {
      if (data.buildings.some(building => building.id === buildingId)) view.buildingId = buildingId;
      view.floor = Number(floor);
      view.focusKind = "floor";
      elements.building.value = view.buildingId || "";
      updateFloors(view.floor);
      render();
      sendViewerState({ focus: true });
      publishViewSelection("floor");
    },
    render,
  };
}
