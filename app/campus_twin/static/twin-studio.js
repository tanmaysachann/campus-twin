import * as THREE from "./vendor/three/three.module.min.js?v=0.185.1";
import { OrbitControls } from "./vendor/three/addons/controls/OrbitControls.js?v=0.185.1-local";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STAGES = [
  "00 / BASELINE",
  "01 / DEMAND SHOCK",
  "02 / ROOM OUTAGE",
  "03 / SPACE + TIME RESPONSE",
  "04 / MOBILITY RESPONSE",
];
const CAMPUS_ANCHOR = { longitude: 77.5946, latitude: 12.9716 };
const PALETTE = {
  accent: "#ef4b36",
  signal: "#d7ff3f",
  normal: "#26724a",
  watch: "#b26d00",
  critical: "#b33b2e",
  released: "#244f6d",
  neutral: "#aebbb6",
  used: "#71877f",
  floor: "#202b28",
  corridor: "#2c3a36",
  line: "#60736d",
  background: "#121a18",
};

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const esc = value => String(value ?? "").replace(/[&<>'"]/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#039;",
  '"': "&quot;",
}[character]));
const format = (value, digits = 1) => Number(value ?? 0).toLocaleString(undefined, {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});
const easeInOutCubic = value => (
  value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2
);
const easeOutCubic = value => 1 - Math.pow(1 - value, 3);

function stageAction(plan, type) {
  return plan?.actions?.find(action => action.type === type) || null;
}

function disposeObject(object) {
  object.traverse(child => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach(material => {
      material.map?.dispose?.();
      material.dispose?.();
    });
  });
}

function labelSprite(primary, secondary) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 112;
  const context = canvas.getContext("2d");
  context.fillStyle = "rgba(18, 26, 24, 0.94)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#71877f";
  context.lineWidth = 3;
  context.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
  context.textAlign = "center";
  context.fillStyle = "#ffffff";
  context.font = "700 30px monospace";
  context.fillText(String(primary).slice(0, 25), 256, 45);
  context.fillStyle = "#b6c4bf";
  context.font = "22px monospace";
  context.fillText(String(secondary).slice(0, 34), 256, 82);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4.8, 1.05, 1);
  sprite.renderOrder = 20;
  return sprite;
}

export function createTwinStudio({ root, notify, onAskGenie, onOpenScenario }) {
  const host = typeof root === "string" ? document.querySelector(root) : root;
  if (!host) return { setData() {}, render() {} };

  const elements = {
    building: host.querySelector("#studioBuilding"),
    floor: host.querySelector("#studioFloor"),
    day: host.querySelector("#studioDay"),
    hour: host.querySelector("#studioHour"),
    hourLabel: host.querySelector("#studioHourLabel"),
    zoom: host.querySelector("#studioZoom"),
    canvas: host.querySelector("#studioCanvas"),
    campus: host.querySelector("#studioCampus"),
    canvasWrap: host.querySelector(".studio-canvas-wrap"),
    floorViewport: host.querySelector("#studioFloorViewport"),
    campusViewport: host.querySelector("#studioCampusViewport"),
    engineBadge: host.querySelector("#studioEngineBadge"),
    controlHint: host.querySelector("#studioControlHint"),
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
    floor: null,
    day: "Mon",
    hour: 10,
    layer: "scenario",
    stage: 0,
    mode: "floor",
    selectedRoomId: null,
  };
  let data = {
    rooms: [], schedule: [], buildings: [], events: [], energy: [],
    buildingPressure: [], walkEdges: [], routePressure: [], summary: null, plan: null,
  };
  let playback = null;

  let threeRenderer = null;
  let threeScene = null;
  let threeCamera = null;
  let threeControls = null;
  let threeModel = null;
  let threeRoomMeshes = [];
  let threeRoomPositions = new Map();
  let threeFitSize = 24;
  let pointerStart = null;
  let lastModelSignature = "";
  let roomAnimations = [];
  let pulseArtifacts = [];
  let motionArtifacts = [];
  let scanArtifact = null;
  let cameraFlight = null;
  let animationFrame = null;

  let cesiumViewer = null;
  let cesiumHandler = null;
  let cesiumHeading = -0.45;
  let cesiumRange = 520;
  let cesiumMotionPoints = [];

  function buildingById(id) {
    return data.buildings.find(building => building.id === id) || null;
  }

  function roomById(id) {
    return data.rooms.find(room => room.id === id) || null;
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

  function sectionRoomIds(sectionId) {
    return [...new Set(data.schedule
      .filter(session => session.section_id === sectionId)
      .map(session => session.room_id))];
  }

  function roomTarget(label, roomId) {
    const room = roomById(roomId);
    return room ? { label, roomId: room.id, mode: "floor" } : null;
  }

  function stageTargets(stage = view.stage) {
    if (!data.plan) return [];
    const demand = stageAction(data.plan, "change_intake");
    const outage = stageAction(data.plan, "close_room");
    const relocation = stageAction(data.plan, "relocate_section");
    const reschedule = stageAction(data.plan, "reschedule_section");
    const mobility = stageAction(data.plan, "adjust_bus_frequency");

    if (stage === 0) return [roomTarget("BASELINE TARGET", outage?.params.room_id)].filter(Boolean);
    if (stage === 1) {
      return sectionRoomIds(demand?.params.section_id)
        .map((roomId, index) => roomTarget(`DEMAND ROOM ${index + 1}`, roomId))
        .filter(Boolean);
    }
    if (stage === 2) return [roomTarget("OUTAGE ROOM", outage?.params.room_id)].filter(Boolean);
    if (stage === 3) {
      const relocationSource = sectionRoomIds(relocation?.params.section_id)[0];
      const rescheduleSource = sectionRoomIds(reschedule?.params.section_id)[0];
      return [
        roomTarget("SPACE TO", relocation?.params.target_room_id),
        roomTarget("TIME TO", reschedule?.params.target_room_id),
        roomTarget("SPACE FROM", relocationSource),
        roomTarget("TIME FROM", rescheduleSource),
      ].filter(Boolean);
    }
    if (stage === 4 && mobility) {
      const route = data.routePressure.find(item => item.route_id === mobility.params.route_id);
      return [{ label: "MOBILITY", routeId: mobility.params.route_id, routeName: route?.name || mobility.params.route_id, mode: "campus" }];
    }
    return [];
  }

  function stageBriefing(stage = view.stage) {
    const manifest = data.plan?.manifest || [];
    if (stage === 0) return {
      kicker: "00 / GOVERNED BASELINE",
      title: "Current campus state",
      detail: "No intervention is applied. The camera is positioned on the room that will be removed so its before state remains visible.",
    };
    if (stage === 1) return {
      kicker: STAGES[1],
      title: manifest[0]?.title || "Enrollment demand enters the twin",
      detail: manifest[0]?.detail || "The affected section and every room that hosts it are recalculated.",
    };
    if (stage === 2) return {
      kicker: STAGES[2],
      title: manifest[1]?.title || "A scheduled room is removed",
      detail: manifest[1]?.detail || "The selected room is taken out of service before recovery actions are applied.",
    };
    if (stage === 3) return {
      kicker: STAGES[3],
      title: "Coordinate space and timetable recovery",
      detail: [manifest[2]?.title, manifest[3]?.title].filter(Boolean).join(". ") || "A section is relocated and another session is moved to a feasible time and room.",
    };
    const mobility = stageAction(data.plan, "adjust_bus_frequency");
    const route = data.routePressure.find(item => item.route_id === mobility?.params.route_id);
    const response = mobility && route
      ? `${route.active_buses} to ${mobility.params.active_buses} active buses. Headway changes from ${route.headway_minutes} to ${mobility.params.headway_minutes} minutes.`
      : "The highest-pressure mobility route receives additional service.";
    return {
      kicker: STAGES[4],
      title: manifest[4]?.title || "Reinforce the constrained campus route",
      detail: `${manifest[4]?.detail || "Transport capacity is increased after the space response."} ${response}`,
    };
  }

  function roomRiskCount(room) {
    return roomSessions(room.id).filter(session => session.enrollment > room.capacity).length;
  }

  function scenarioFlags(room) {
    const flags = {
      demand: false, closed: false, released: false, receiving: false,
      rescheduled: false, descriptions: [],
    };
    if (!data.plan || view.stage === 0) return flags;

    const demand = stageAction(data.plan, "change_intake");
    if (view.stage >= 1 && demand) {
      const hostsDemand = data.schedule.some(session => (
        session.room_id === room.id && session.section_id === demand.params.section_id
      ));
      if (hostsDemand) {
        flags.demand = true;
        flags.descriptions.push(`${demand.params.section_id} grows to ${demand.params.enrollment} students.`);
      }
    }

    const outage = stageAction(data.plan, "close_room");
    if (view.stage >= 2 && outage?.params.room_id === room.id) {
      flags.closed = true;
      flags.descriptions.push("This room is removed from service and its sessions are reassigned.");
    }

    if (view.stage >= 3) {
      const relocation = stageAction(data.plan, "relocate_section");
      if (relocation) {
        if (relocation.params.target_room_id === room.id) {
          flags.receiving = true;
          flags.descriptions.push(`${relocation.params.section_id} is relocated into this room.`);
        }
        if (data.schedule.some(session => session.room_id === room.id && session.section_id === relocation.params.section_id)) {
          flags.released = true;
          flags.descriptions.push(`${relocation.params.section_id} leaves this room.`);
        }
      }
      const reschedule = stageAction(data.plan, "reschedule_section");
      if (reschedule) {
        if (reschedule.params.target_room_id === room.id) {
          flags.rescheduled = true;
          flags.descriptions.push(`${reschedule.params.section_id} moves here on ${reschedule.params.day} at ${reschedule.params.start_hour}:00.`);
        }
        if (data.schedule.some(session => session.room_id === room.id && session.section_id === reschedule.params.section_id)) {
          flags.released = true;
          flags.descriptions.push(`One ${reschedule.params.section_id} session leaves this room.`);
        }
      }
    }
    return flags;
  }

  function roomState(room, flags) {
    if (flags.closed) return "OUTAGE";
    if (flags.receiving || flags.rescheduled) return "RECEIVING";
    if (flags.demand) return "DEMAND RISK";
    if (roomRiskCount(room) > 0) return "CAPACITY RISK";
    if (slotSessions(room.id).length) return "SCHEDULED";
    return "AVAILABLE";
  }

  function roomColor(room, flags) {
    const utilization = Number(room.scheduled_utilization_pct || 0);
    if (view.layer === "scenario") {
      if (flags.closed) return PALETTE.critical;
      if (flags.receiving || flags.rescheduled) return PALETTE.normal;
      if (flags.demand) return PALETTE.watch;
      if (flags.released) return PALETTE.released;
      return utilization > 10 ? PALETTE.used : PALETTE.neutral;
    }
    if (view.layer === "capacity") {
      if (roomRiskCount(room) > 0) return PALETTE.critical;
      return room.capacity >= 70 ? PALETTE.normal : room.capacity >= 45 ? PALETTE.used : PALETTE.watch;
    }
    if (view.layer === "energy") {
      if (!room.has_ac) return "#9eaaa5";
      return room.capacity >= 70 ? PALETTE.released : "#52758d";
    }
    return slotSessions(room.id).length ? PALETTE.accent : utilization > 10 ? PALETTE.used : "#c5ceca";
  }

  function roomHeight(room, flags) {
    const utilization = Number(room.scheduled_utilization_pct || 0);
    if (flags.closed) return 0.38;
    if (view.layer === "schedule") return 0.75 + (slotSessions(room.id).length ? 2.8 : utilization * 0.028);
    if (view.layer === "capacity") {
      const worstRatio = Math.max(0.65, ...roomSessions(room.id).map(session => session.enrollment / Math.max(1, room.capacity)));
      return clamp(0.75 + (worstRatio - 0.65) * 3.3, 0.75, 4.6);
    }
    if (view.layer === "energy") return 0.8 + (room.has_ac ? 1.25 : 0.3) + Math.min(1.2, room.capacity * 0.012);
    let height = 0.75 + utilization * 0.035;
    if (flags.demand) height += 1.35;
    if (flags.receiving || flags.rescheduled) height += 1.1;
    if (flags.released) height = Math.max(0.55, height - 0.75);
    return Math.min(4.9, height);
  }

  function layoutRooms(rooms) {
    const split = Math.ceil(rooms.length / 2);
    const rows = [rooms.slice(0, split), rooms.slice(split)];
    const placed = [];
    rows.forEach((row, rowIndex) => {
      const widths = row.map(room => 3.3 + Math.min(2.6, room.capacity * 0.025));
      const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, row.length - 1) * 0.7;
      let cursor = -total / 2;
      row.forEach((room, index) => {
        const width = widths[index];
        placed.push({ room, x: cursor + width / 2, z: rowIndex === 0 ? -3.25 : 3.25, width, depth: 4.55 });
        cursor += width + 0.7;
      });
    });
    return placed;
  }

  function drawThree() {
    if (threeRenderer && threeScene && threeCamera) threeRenderer.render(threeScene, threeCamera);
  }

  function animateCameraToRoom(roomId) {
    const targetPosition = threeRoomPositions.get(roomId);
    if (!targetPosition || !threeCamera || !threeControls) return;
    const target = new THREE.Vector3(targetPosition.x, 0.7, targetPosition.z);
    const distance = Math.max(10, threeFitSize * 0.62);
    const destination = target.clone().add(new THREE.Vector3(distance * 0.76, distance * 0.68, distance * 0.88));
    cameraFlight = {
      startedAt: performance.now(),
      duration: 1050,
      fromPosition: threeCamera.position.clone(),
      toPosition: destination,
      fromTarget: threeControls.target.clone(),
      toTarget: target,
      fromZoom: threeCamera.zoom,
      toZoom: 1.28,
    };
  }

  function animateFrame(timestamp) {
    if (host.offsetParent === null) {
      animationFrame = window.requestAnimationFrame(animateFrame);
      return;
    }
    let changed = false;
    roomAnimations = roomAnimations.filter(animation => {
      const progress = clamp((timestamp - animation.startedAt) / animation.duration, 0, 1);
      const eased = easeOutCubic(progress);
      const scale = animation.fromScale + (1 - animation.fromScale) * eased;
      animation.mesh.scale.y = scale;
      animation.mesh.position.y = 0.03 + animation.height * scale / 2;
      animation.label.material.opacity = eased;
      changed = true;
      return progress < 1;
    });

    pulseArtifacts.forEach((artifact, index) => {
      const wave = (Math.sin(timestamp * artifact.speed + index * 0.9) + 1) / 2;
      const scale = artifact.baseScale + wave * artifact.amplitude;
      artifact.object.scale.set(scale, scale, scale);
      if (artifact.material) artifact.material.opacity = artifact.minimumOpacity + wave * artifact.opacityRange;
      changed = true;
    });

    motionArtifacts.forEach((artifact, index) => {
      const progress = ((timestamp * artifact.speed + artifact.offset + index * 0.17) % 1 + 1) % 1;
      artifact.object.position.copy(artifact.curve.getPointAt(progress));
      changed = true;
    });

    if (scanArtifact) {
      const progress = (timestamp % scanArtifact.duration) / scanArtifact.duration;
      scanArtifact.object.position.x = scanArtifact.minimum + (scanArtifact.maximum - scanArtifact.minimum) * progress;
      scanArtifact.object.material.opacity = 0.07 + Math.sin(progress * Math.PI) * 0.12;
      changed = true;
    }

    if (cameraFlight && threeCamera && threeControls) {
      const progress = clamp((timestamp - cameraFlight.startedAt) / cameraFlight.duration, 0, 1);
      const eased = easeInOutCubic(progress);
      threeCamera.position.lerpVectors(cameraFlight.fromPosition, cameraFlight.toPosition, eased);
      threeControls.target.lerpVectors(cameraFlight.fromTarget, cameraFlight.toTarget, eased);
      threeCamera.zoom = cameraFlight.fromZoom + (cameraFlight.toZoom - cameraFlight.fromZoom) * eased;
      threeCamera.updateProjectionMatrix();
      threeControls.update();
      if (progress >= 1) cameraFlight = null;
      changed = true;
    }

    if (cesiumViewer && view.mode === "campus" && cesiumMotionPoints.length && window.Cesium) {
      const Cesium = window.Cesium;
      cesiumMotionPoints.forEach((motion, index) => {
        const progress = ((timestamp * 0.00016 + index * 0.31) % 1 + 1) % 1;
        motion.entity.position = Cesium.Cartesian3.lerp(motion.start, motion.end, progress, new Cesium.Cartesian3());
      });
      cesiumViewer.scene.requestRender();
    }

    if (changed && view.mode === "floor" && host.offsetParent !== null) drawThree();
    animationFrame = window.requestAnimationFrame(animateFrame);
  }

  function startAnimationLoop() {
    if (!animationFrame) animationFrame = window.requestAnimationFrame(animateFrame);
  }

  function resizeThree() {
    if (!threeRenderer || !threeCamera) return;
    const width = Math.max(1, elements.canvas.clientWidth);
    const height = Math.max(1, elements.canvas.clientHeight);
    const aspect = width / height;
    threeCamera.left = -threeFitSize * aspect / 2;
    threeCamera.right = threeFitSize * aspect / 2;
    threeCamera.top = threeFitSize / 2;
    threeCamera.bottom = -threeFitSize / 2;
    threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(width, height, false);
    drawThree();
  }

  function initializeThree() {
    try {
      threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      threeRenderer.setClearColor(PALETTE.background, 1);
      threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
      threeRenderer.shadowMap.enabled = true;
      threeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      elements.canvas.append(threeRenderer.domElement);

      threeScene = new THREE.Scene();
      threeScene.background = new THREE.Color(PALETTE.background);
      threeScene.fog = new THREE.Fog(PALETTE.background, 28, 68);
      threeCamera = new THREE.OrthographicCamera(-16, 16, 10, -10, 0.1, 200);
      threeCamera.position.set(18, 16, 20);

      threeScene.add(new THREE.HemisphereLight("#dce7e2", "#101715", 2.1));
      const sun = new THREE.DirectionalLight("#ffffff", 2.5);
      sun.position.set(-10, 22, 14);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -25;
      sun.shadow.camera.right = 25;
      sun.shadow.camera.top = 25;
      sun.shadow.camera.bottom = -25;
      threeScene.add(sun);

      threeControls = new OrbitControls(threeCamera, threeRenderer.domElement);
      threeControls.enableDamping = false;
      threeControls.enablePan = true;
      threeControls.enableRotate = true;
      threeControls.enableZoom = true;
      threeControls.screenSpacePanning = true;
      threeControls.minPolarAngle = 0.2;
      threeControls.maxPolarAngle = Math.PI * 0.47;
      threeControls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      threeControls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      threeControls.addEventListener("change", drawThree);

      new ResizeObserver(resizeThree).observe(elements.canvas);
      threeRenderer.domElement.addEventListener("pointerdown", event => {
        if (event.button === 0) pointerStart = { x: event.clientX, y: event.clientY };
      });
      threeRenderer.domElement.addEventListener("pointerup", event => {
        if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) {
          pointerStart = null;
          return;
        }
        pointerStart = null;
        const bounds = threeRenderer.domElement.getBoundingClientRect();
        const pointer = new THREE.Vector2(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, threeCamera);
        const hit = raycaster.intersectObjects(threeRoomMeshes, false)[0];
        if (!hit?.object?.userData?.roomId) return;
        view.selectedRoomId = hit.object.userData.roomId;
        render();
      });
      elements.canvas.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        const rooms = visibleRooms();
        if (!rooms.length) return;
        event.preventDefault();
        const current = rooms.findIndex(room => room.id === view.selectedRoomId);
        const direction = event.key === "ArrowRight" ? 1 : -1;
        view.selectedRoomId = rooms[(current + direction + rooms.length) % rooms.length].id;
        render();
      });
      resizeThree();
      startAnimationLoop();
    } catch (error) {
      elements.canvas.innerHTML = `<div class="studio-engine-error"><strong>Three.js could not start.</strong><span>${esc(error.message)}</span></div>`;
    }
  }

  function addFloorOutline(group, width, depth) {
    const points = [
      new THREE.Vector3(-width / 2, 0.03, -depth / 2),
      new THREE.Vector3(width / 2, 0.03, -depth / 2),
      new THREE.Vector3(width / 2, 0.03, depth / 2),
      new THREE.Vector3(-width / 2, 0.03, depth / 2),
      new THREE.Vector3(-width / 2, 0.03, -depth / 2),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: PALETTE.line })));
  }

  function addScenarioConnector(group, source, target, color, lift = 2.4) {
    if (!source || !target || source.distanceTo(target) < 0.2) return;
    const midpoint = source.clone().lerp(target, 0.5);
    midpoint.y += lift;
    const curve = new THREE.CatmullRomCurve3([
      source.clone().setY(source.y + 0.4),
      midpoint,
      target.clone().setY(target.y + 0.65),
    ]);
    group.add(new THREE.Mesh(
      new THREE.TubeGeometry(curve, 32, 0.075, 7, false),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.34, roughness: 0.7, metalness: 0 }),
    ));
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 14, 10),
      new THREE.MeshStandardMaterial({ color, roughness: 0.55 }),
    );
    marker.position.copy(target).setY(target.y + 0.65);
    group.add(marker);
    for (let index = 0; index < 3; index += 1) {
      const traveler = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 8),
        new THREE.MeshBasicMaterial({ color }),
      );
      group.add(traveler);
      motionArtifacts.push({ object: traveler, curve, speed: 0.00011, offset: index / 3 });
    }
  }

  function addDraftingScan(group, width, depth) {
    const material = new THREE.MeshBasicMaterial({
      color: PALETTE.signal,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.1, depth - 0.6), material);
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(-width / 2, 0.11, 0);
    beam.renderOrder = 4;
    group.add(beam);
    scanArtifact = { object: beam, minimum: -width / 2, maximum: width / 2, duration: 5200 };
  }

  function addThreeScenarioOverlays(group) {
    if (view.stage < 3) return;
    const relocation = stageAction(data.plan, "relocate_section");
    if (relocation) {
      const source = data.schedule.find(session => session.section_id === relocation.params.section_id);
      addScenarioConnector(group, threeRoomPositions.get(source?.room_id), threeRoomPositions.get(relocation.params.target_room_id), PALETTE.normal, 2.8);
    }
    const reschedule = stageAction(data.plan, "reschedule_section");
    if (reschedule) {
      const source = data.schedule.find(session => session.section_id === reschedule.params.section_id);
      addScenarioConnector(group, threeRoomPositions.get(source?.room_id), threeRoomPositions.get(reschedule.params.target_room_id), PALETTE.released, 2.2);
    }
    if (view.stage >= 4 && threeRoomPositions.size) {
      const positions = [...threeRoomPositions.values()];
      const minX = Math.min(...positions.map(position => position.x)) - 2;
      const maxX = Math.max(...positions.map(position => position.x)) + 2;
      const route = new THREE.CatmullRomCurve3([
        new THREE.Vector3(minX, 0.15, -6.1),
        new THREE.Vector3(0, 0.7, -7.1),
        new THREE.Vector3(maxX, 0.15, -6.1),
      ]);
      group.add(new THREE.Mesh(
        new THREE.TubeGeometry(route, 28, 0.09, 7, false),
        new THREE.MeshStandardMaterial({ color: PALETTE.signal, emissive: PALETTE.signal, emissiveIntensity: 0.45, roughness: 0.75 }),
      ));
      for (let index = 0; index < 4; index += 1) {
        const traveler = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 12, 8),
          new THREE.MeshBasicMaterial({ color: PALETTE.signal }),
        );
        group.add(traveler);
        motionArtifacts.push({ object: traveler, curve: route, speed: 0.00009, offset: index / 4 });
      }
    }
  }

  function buildThreeModel() {
    if (!threeScene) return;
    if (threeModel) {
      threeScene.remove(threeModel);
      disposeObject(threeModel);
    }
    threeModel = new THREE.Group();
    threeScene.add(threeModel);
    threeRoomMeshes = [];
    threeRoomPositions = new Map();
    roomAnimations = [];
    pulseArtifacts = [];
    motionArtifacts = [];
    scanArtifact = null;

    const placed = layoutRooms(visibleRooms());
    const modelWidth = Math.max(18, ...placed.map(item => Math.abs(item.x) * 2 + item.width + 2));
    const modelDepth = 12.4;
    threeFitSize = Math.max(16, modelWidth * 0.72, modelDepth * 1.2);
    const modelSignature = `${view.buildingId}:${view.floor}:${view.layer}:${view.stage}`;
    const animateEntry = modelSignature !== lastModelSignature;
    lastModelSignature = modelSignature;

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(modelWidth, 0.22, modelDepth),
      new THREE.MeshStandardMaterial({ color: PALETTE.floor, roughness: 1, metalness: 0 }),
    );
    slab.position.y = -0.13;
    slab.receiveShadow = true;
    threeModel.add(slab);
    addFloorOutline(threeModel, modelWidth, modelDepth);

    const grid = new THREE.GridHelper(Math.max(modelWidth, modelDepth), Math.max(12, Math.ceil(modelWidth)), "#4b5d57", "#33433e");
    grid.position.y = 0.01;
    threeModel.add(grid);
    const corridor = new THREE.Mesh(
      new THREE.BoxGeometry(modelWidth - 1, 0.08, 1.6),
      new THREE.MeshStandardMaterial({ color: PALETTE.corridor, roughness: 1 }),
    );
    corridor.position.y = 0.05;
    corridor.receiveShadow = true;
    threeModel.add(corridor);
    addDraftingScan(threeModel, modelWidth, modelDepth);

    placed.forEach(item => {
      const flags = scenarioFlags(item.room);
      const height = roomHeight(item.room, flags);
      const geometry = new THREE.BoxGeometry(item.width, height, item.depth);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: roomColor(item.room, flags), roughness: 0.88, metalness: 0,
      }));
      mesh.position.set(item.x, height / 2 + 0.03, item.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.roomId = item.room.id;
      const selected = item.room.id === view.selectedRoomId;
      if (animateEntry) {
        mesh.scale.y = 0.06;
        mesh.position.y = 0.03 + height * 0.03;
      }
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: selected ? PALETTE.signal : "#101715" }),
      );
      outline.scale.setScalar(selected ? 1.012 : 1.003);
      mesh.add(outline);

      const state = roomState(item.room, flags);
      const label = labelSprite(item.room.name, `${state} / ${format(item.room.scheduled_utilization_pct)}%`);
      label.position.set(item.x, height + 0.72, item.z);
      if (animateEntry) label.material.opacity = 0;
      threeModel.add(mesh, label);
      threeRoomMeshes.push(mesh);
      threeRoomPositions.set(item.room.id, new THREE.Vector3(item.x, height, item.z));
      if (animateEntry) {
        roomAnimations.push({
          mesh,
          label,
          height,
          fromScale: 0.06,
          startedAt: performance.now() + placed.indexOf(item) * 65,
          duration: 680,
        });
      }
      if (selected) {
        pulseArtifacts.push({
          object: outline,
          material: outline.material,
          baseScale: 1.008,
          amplitude: 0.012,
          speed: 0.0045,
          minimumOpacity: 0.58,
          opacityRange: 0.42,
        });
        outline.material.transparent = true;
      }

      if (flags.closed) {
        [-0.62, 0.62].forEach(rotation => {
          const material = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.92 });
          const bar = new THREE.Mesh(
            new THREE.BoxGeometry(item.width * 0.9, 0.12, 0.16),
            material,
          );
          bar.position.set(item.x, height + 0.14, item.z);
          bar.rotation.y = rotation;
          threeModel.add(bar);
          pulseArtifacts.push({
            object: bar,
            material,
            baseScale: 0.96,
            amplitude: 0.08,
            speed: 0.004,
            minimumOpacity: 0.48,
            opacityRange: 0.5,
          });
        });
      }
      if (flags.demand) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(Math.min(item.width, item.depth) * 0.32, 0.08, 8, 28),
          new THREE.MeshStandardMaterial({ color: PALETTE.watch, emissive: PALETTE.watch, emissiveIntensity: 0.65, transparent: true, opacity: 0.76, roughness: 0.65 }),
        );
        ring.position.set(item.x, height + 0.22, item.z);
        ring.rotation.x = Math.PI / 2;
        threeModel.add(ring);
        pulseArtifacts.push({
          object: ring,
          material: ring.material,
          baseScale: 0.92,
          amplitude: 0.24,
          speed: 0.0032,
          minimumOpacity: 0.42,
          opacityRange: 0.5,
        });
      }
    });
    addThreeScenarioOverlays(threeModel);
    drawThree();
  }

  function fitThree() {
    if (!threeCamera || !threeControls) return;
    threeCamera.position.set(threeFitSize * 0.8, threeFitSize * 0.72, threeFitSize * 0.92);
    threeControls.target.set(0, 0.7, 0);
    threeCamera.zoom = 1;
    elements.zoom.value = "100";
    threeCamera.updateProjectionMatrix();
    threeControls.update();
    resizeThree();
  }

  function buildingPosition(building, height = 0) {
    const Cesium = window.Cesium;
    const longitude = CAMPUS_ANCHOR.longitude + (Number(building.x) - 50) * 0.000046;
    const latitude = CAMPUS_ANCHOR.latitude + (Number(building.y) - 50) * 0.000046;
    return Cesium.Cartesian3.fromDegrees(longitude, latitude, height);
  }

  function buildingVisual(building) {
    const rooms = data.rooms.filter(room => room.building_id === building.id);
    const flags = rooms.map(scenarioFlags);
    const pressure = data.buildingPressure.find(item => item.building_id === building.id);
    const energy = data.energy.find(item => item.building_id === building.id)?.kwh || 0;
    let color = PALETTE.used;
    if (view.layer === "scenario") {
      if (flags.some(flag => flag.closed)) color = PALETTE.critical;
      else if (flags.some(flag => flag.receiving || flag.rescheduled)) color = PALETTE.normal;
      else if (flags.some(flag => flag.demand)) color = PALETTE.watch;
      else if (flags.some(flag => flag.released)) color = PALETTE.released;
    } else if (view.layer === "capacity") {
      color = Number(pressure?.over_capacity_sessions || 0) > 0
        ? PALETTE.critical
        : Number(pressure?.utilization_pct || 0) > 10 ? PALETTE.normal : PALETTE.watch;
    } else if (view.layer === "energy") {
      const maximum = Math.max(1, ...data.energy.map(item => Number(item.kwh || 0)));
      color = Number(energy) / maximum > 0.72
        ? PALETTE.released
        : Number(energy) / maximum > 0.42 ? "#52758d" : "#9eaaa5";
    } else {
      const scheduled = rooms.filter(room => slotSessions(room.id).length).length;
      color = scheduled
        ? PALETTE.accent
        : rooms.some(room => Number(room.scheduled_utilization_pct || 0) > 10) ? PALETTE.used : PALETTE.neutral;
    }
    const height = 18 + rooms.length * 2.5 + Number(pressure?.utilization_pct || 0) * 0.35;
    return { color, height, rooms, pressure, energy };
  }

  function initializeCesium() {
    if (cesiumViewer) return true;
    const Cesium = window.Cesium;
    if (!Cesium) {
      elements.campus.innerHTML = "<div class=\"studio-engine-error\"><strong>CesiumJS could not start.</strong><span>The bundled engine did not load.</span></div>";
      return false;
    }
    try {
      cesiumViewer = new Cesium.Viewer(elements.campus, {
        animation: false,
        baseLayer: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        terrainProvider: new Cesium.EllipsoidTerrainProvider(),
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
        useBrowserRecommendedResolution: true,
      });
      const scene = cesiumViewer.scene;
      scene.backgroundColor = Cesium.Color.fromCssColorString(PALETTE.background);
      scene.globe.baseColor = Cesium.Color.fromCssColorString("#17221f");
      scene.globe.enableLighting = false;
      scene.globe.showGroundAtmosphere = false;
      scene.fog.enabled = false;
      scene.skyAtmosphere.show = false;
      scene.sun.show = false;
      scene.moon.show = false;
      scene.screenSpaceCameraController.minimumZoomDistance = 90;
      scene.screenSpaceCameraController.maximumZoomDistance = 5000;
      cesiumHandler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
      cesiumHandler.setInputAction(movement => {
        const picked = scene.pick(movement.position);
        const buildingId = picked?.id?._campusBuildingId;
        if (!buildingId) return;
        view.buildingId = buildingId;
        elements.building.value = buildingId;
        updateFloors();
        view.selectedRoomId = visibleRooms()[0]?.id || null;
        render();
        notify?.(`${buildingById(buildingId)?.name || buildingId} selected. Switch to the Three.js floor view for room detail.`);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      return true;
    } catch (error) {
      elements.campus.innerHTML = `<div class="studio-engine-error"><strong>CesiumJS could not start.</strong><span>${esc(error.message)}</span></div>`;
      return false;
    }
  }

  function addCampusRoute(route, index) {
    const Cesium = window.Cesium;
    const load = Number(route.peak_load_pct || 0);
    const color = load > 100 ? PALETTE.critical : load > 82 ? PALETTE.watch : PALETTE.normal;
    const target = data.buildings[index % Math.max(1, data.buildings.length)];
    if (!target) return;
    const side = index % 2 === 0 ? -1 : 1;
    const gateway = Cesium.Cartesian3.fromDegrees(
      CAMPUS_ANCHOR.longitude + side * (0.0022 + index * 0.00008),
      CAMPUS_ANCHOR.latitude - 0.00185 + index * 0.00118,
      5,
    );
    const adjusted = stageAction(data.plan, "adjust_bus_frequency");
    const responding = view.stage >= 4 && adjusted?.params.route_id === route.route_id;
    const routeStart = gateway;
    const routeEnd = buildingPosition(target, 5);
    cesiumViewer.entities.add({
      polyline: {
        positions: [routeStart, routeEnd],
        width: responding ? 8 : clamp(2 + load / 35, 3, 6),
        material: responding
          ? new Cesium.PolylineGlowMaterialProperty({
            color: Cesium.Color.fromCssColorString(PALETTE.signal),
            glowPower: 0.2,
            taperPower: 0.65,
          })
          : Cesium.Color.fromCssColorString(color),
        clampToGround: false,
      },
    });
    cesiumViewer.entities.add({
      position: gateway,
      point: {
        pixelSize: responding ? 13 : 9,
        color: Cesium.Color.fromCssColorString(responding ? PALETTE.signal : color),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
      },
      label: {
        text: `${route.name} / ${format(load)}%`,
        font: "10px monospace",
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString("#15201d").withAlpha(0.9),
        pixelOffset: new Cesium.Cartesian2(0, -22 - index * 3),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    if (responding) {
      for (let index = 0; index < 4; index += 1) {
        const movingPoint = cesiumViewer.entities.add({
          position: routeStart,
          point: {
            pixelSize: 7,
            color: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString(PALETTE.signal),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        cesiumMotionPoints.push({ entity: movingPoint, start: routeStart, end: routeEnd, offset: index / 4 });
      }
    }
  }

  function buildCesiumModel() {
    if (!cesiumViewer || !window.Cesium) return;
    const Cesium = window.Cesium;
    cesiumViewer.entities.removeAll();
    cesiumMotionPoints = [];
    const halfSpan = 0.00255;
    cesiumViewer.entities.add({
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(
          CAMPUS_ANCHOR.longitude - halfSpan,
          CAMPUS_ANCHOR.latitude - halfSpan,
          CAMPUS_ANCHOR.longitude + halfSpan,
          CAMPUS_ANCHOR.latitude + halfSpan,
        ),
        material: Cesium.Color.fromCssColorString(PALETTE.floor),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString(PALETTE.line),
        height: 0.5,
      },
    });

    const byId = new Map(data.buildings.map(building => [building.id, building]));
    data.walkEdges.forEach(edge => {
      const from = byId.get(edge.from_building_id);
      const to = byId.get(edge.to_building_id);
      if (!from || !to) return;
      cesiumViewer.entities.add({
        polyline: {
          positions: [buildingPosition(from, 2), buildingPosition(to, 2)],
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString("#82958f"), dashLength: 12,
          }),
        },
      });
    });

    data.buildings.forEach(building => {
      const visual = buildingVisual(building);
      const area = Math.max(600, Number(building.area_m2 || 900));
      const width = clamp(Math.sqrt(area) * 1.25, 34, 86);
      const depth = clamp(area / Math.max(1, width), 30, 72);
      const entity = cesiumViewer.entities.add({
        position: buildingPosition(building, visual.height / 2 + 1),
        box: {
          dimensions: new Cesium.Cartesian3(width, depth, visual.height),
          material: Cesium.Color.fromCssColorString(visual.color).withAlpha(0.93),
          outline: true,
          outlineColor: building.id === view.buildingId
            ? Cesium.Color.fromCssColorString(PALETTE.signal)
            : Cesium.Color.fromCssColorString("#101715"),
        },
        label: {
          text: `${building.name}\n${building.id}`,
          font: "11px monospace",
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString("#15201d").withAlpha(0.88),
          pixelOffset: new Cesium.Cartesian2(0, -34),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      entity._campusBuildingId = building.id;
    });

    data.events.filter(event => event.day === view.day).forEach(event => {
      const building = byId.get(event.building_id);
      if (!building) return;
      cesiumViewer.entities.add({
        position: buildingPosition(building, 18),
        cylinder: {
          length: 30,
          topRadius: 2.5,
          bottomRadius: 8,
          material: Cesium.Color.fromCssColorString(PALETTE.accent).withAlpha(0.72),
        },
        label: {
          text: `${event.name}\n${event.expected_attendance} EXPECTED`,
          font: "11px monospace",
          fillColor: Cesium.Color.WHITE,
          pixelOffset: new Cesium.Cartesian2(0, -42),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    });
    data.routePressure.forEach(addCampusRoute);
    cesiumViewer.scene.requestRender();
  }

  function fitCesium() {
    if (!cesiumViewer || !window.Cesium) return;
    const Cesium = window.Cesium;
    cesiumHeading = -0.45;
    cesiumRange = 520;
    cesiumViewer.camera.lookAt(
      Cesium.Cartesian3.fromDegrees(CAMPUS_ANCHOR.longitude, CAMPUS_ANCHOR.latitude, 0),
      new Cesium.HeadingPitchRange(cesiumHeading, -0.72, cesiumRange),
    );
    elements.zoom.value = "100";
    cesiumViewer.scene.requestRender();
  }

  function updateCesiumCamera() {
    if (!cesiumViewer || !window.Cesium) return;
    const Cesium = window.Cesium;
    cesiumViewer.camera.lookAt(
      Cesium.Cartesian3.fromDegrees(CAMPUS_ANCHOR.longitude, CAMPUS_ANCHOR.latitude, 0),
      new Cesium.HeadingPitchRange(cesiumHeading, -0.72, cesiumRange),
    );
    cesiumViewer.scene.requestRender();
  }

  function renderInspector() {
    const room = roomById(view.selectedRoomId);
    if (!room) {
      elements.roomState.textContent = "READY";
      elements.roomCode.textContent = "NO ROOM";
      elements.roomName.textContent = "Select a room in the model";
      elements.roomType.textContent = "Room facts will appear here.";
      elements.roomFacts.innerHTML = "";
      elements.roomSchedule.textContent = "No room selected.";
      elements.roomScenario.textContent = "Move the scenario stage to inspect modeled effects.";
      return;
    }

    const flags = scenarioFlags(room);
    const sessions = roomSessions(room.id);
    const active = slotSessions(room.id);
    const building = buildingById(room.building_id);
    elements.roomState.textContent = roomState(room, flags);
    elements.roomCode.textContent = `${room.id} / FLOOR ${room.floor}`;
    elements.roomName.textContent = room.name;
    elements.roomType.textContent = `${room.kind} in ${building?.name || room.building_id}`;
    elements.roomFacts.innerHTML = `
      <div><span>CAPACITY</span><strong>${room.capacity}</strong></div>
      <div><span>SCHEDULED HOURS</span><strong>${format(room.scheduled_hours)}</strong></div>
      <div><span>UTILIZATION</span><strong>${format(room.scheduled_utilization_pct)}%</strong></div>
      <div><span>CAPACITY RISKS</span><strong>${roomRiskCount(room)}</strong></div>`;
    elements.roomSchedule.innerHTML = active.length
      ? active.map(session => `<div class="studio-session"><strong>${esc(session.course)}</strong><span>${esc(session.section_id)} / ${session.enrollment} students / ${session.start_hour}:00-${session.start_hour + session.duration_hours}:00</span></div>`).join("")
      : `<p>No session is scheduled here on ${esc(view.day)} at ${String(view.hour).padStart(2, "0")}:00. ${sessions.length} weekly session${sessions.length === 1 ? "" : "s"} remain in the room contract.</p>`;
    elements.roomScenario.innerHTML = flags.descriptions.length
      ? flags.descriptions.map(description => `<p>${esc(description)}</p>`).join("")
      : `<p>${view.stage === 0 ? "Baseline geometry with no scenario action applied." : "No direct action targets this room at the selected stage. Indirect floor metrics are still recomputed."}</p>`;
  }

  function renderFloorReadout(rooms) {
    const occupied = rooms.filter(room => slotSessions(room.id).length > 0).length;
    const riskCount = rooms.reduce((sum, room) => sum + roomRiskCount(room), 0);
    const directlyAffected = view.stage > 0
      ? rooms.filter(room => scenarioFlags(room).descriptions.length > 0).length
      : 0;
    const utilization = rooms.length
      ? rooms.reduce((sum, room) => sum + Number(room.scheduled_utilization_pct || 0), 0) / rooms.length
      : 0;
    const energy = data.energy.find(item => item.building_id === view.buildingId)?.kwh || 0;
    elements.floorState.textContent = STAGES[view.stage].replace(/^\d+ \/ /, "");
    elements.floorFacts.innerHTML = `
      <div><span>VISIBLE ROOMS</span><strong>${rooms.length}</strong></div>
      <div><span>SCHEDULED AT FILTER</span><strong>${occupied}</strong></div>
      <div><span>DIRECTLY AFFECTED</span><strong>${directlyAffected}</strong></div>
      <div><span>CAPACITY RISKS</span><strong>${riskCount}</strong></div>
      <div><span>MEAN ROOM UTIL.</span><strong>${format(utilization)}%</strong></div>
      <div><span>BUILDING ENERGY</span><strong>${format(energy)} kWh</strong></div>`;
    const legends = {
      schedule: [[PALETTE.accent, "Scheduled at filter"], [PALETTE.used, "Used this week"], ["#c5ceca", "No session at filter"]],
      capacity: [[PALETTE.critical, "Capacity mismatch"], [PALETTE.watch, "Low seat count"], [PALETTE.normal, "High seat capacity"]],
      energy: [[PALETTE.released, "Conditioned high-capacity room"], ["#52758d", "Conditioned room"], ["#9eaaa5", "No AC flag"]],
      scenario: [[PALETTE.critical, "Outage"], [PALETTE.watch, "Demand pressure"], [PALETTE.normal, "Receiving response"], [PALETTE.signal, "Mobility response"]],
    }[view.layer];
    elements.legend.innerHTML = legends.map(([color, label]) => `<span><i style="background:${color}"></i>${esc(label)}</span>`).join("");
  }

  function renderStageBriefing() {
    const briefing = stageBriefing();
    const targets = stageTargets();
    elements.stageKicker.textContent = briefing.kicker;
    elements.stageTitle.textContent = briefing.title;
    elements.stageDetail.textContent = briefing.detail;
    elements.stageTargets.innerHTML = targets.map((target, index) => {
      const room = roomById(target.roomId);
      const active = target.mode === "campus"
        ? view.mode === "campus"
        : view.mode === "floor" && target.roomId === view.selectedRoomId;
      const subject = room ? `${room.name} / ${room.id}` : target.routeName || target.routeId || "CAMPUS";
      return `<button type="button" class="${active ? "is-active" : ""}" data-stage-target="${index}">${esc(target.label)} / ${esc(subject)}</button>`;
    }).join("");
  }

  function renderHeader() {
    const building = buildingById(view.buildingId);
    if (view.mode === "campus") {
      elements.modelTitle.textContent = "Campus operations field";
      elements.modelContext.textContent = `${data.buildings.length} BUILDINGS / ${data.walkEdges.length} WALK LINKS / ${data.routePressure.length} MOBILITY ROUTES / ${STAGES[view.stage]}`;
    } else {
      elements.modelTitle.textContent = building ? `${building.name} / Floor ${view.floor}` : "Spatial model";
      elements.modelContext.textContent = `${visibleRooms().length} ROOMS / ${view.layer.toUpperCase()} LAYER / ${STAGES[view.stage]}`;
    }
    elements.stageLabel.textContent = STAGES[view.stage];
    elements.stage.value = String(view.stage);
    elements.hourLabel.textContent = `${String(view.hour).padStart(2, "0")}:00`;
    elements.hour.value = String(view.hour);
  }

  function render() {
    renderHeader();
    buildThreeModel();
    buildCesiumModel();
    renderInspector();
    renderFloorReadout(visibleRooms());
    renderStageBriefing();
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

  function focusStageTarget(stage = view.stage, targetIndex = 0) {
    const target = stageTargets(stage)[targetIndex] || stageTargets(stage)[0];
    if (!target) return null;
    if (target.mode === "campus") {
      switchMode("campus");
      return target;
    }
    const room = roomById(target.roomId);
    if (!room) return null;
    view.buildingId = room.building_id;
    elements.building.value = room.building_id;
    updateFloors(room.floor);
    view.selectedRoomId = room.id;
    switchMode("floor");
    return target;
  }

  function setScenarioStage(stage, { follow = true, targetIndex = 0 } = {}) {
    view.stage = clamp(Number(stage), 0, 4);
    view.layer = "scenario";
    host.querySelectorAll("[data-studio-layer]").forEach(button => {
      button.classList.toggle("is-active", button.dataset.studioLayer === "scenario");
    });
    const target = follow ? focusStageTarget(view.stage, targetIndex) : null;
    render();
    if (target?.mode === "floor") {
      window.setTimeout(() => animateCameraToRoom(target.roomId), 25);
    } else if (target?.mode === "campus") {
      window.setTimeout(fitCesium, 25);
    }
  }

  function switchMode(mode) {
    view.mode = mode === "campus" ? "campus" : "floor";
    host.querySelectorAll("[data-studio-mode]").forEach(button => {
      const active = button.dataset.studioMode === view.mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    const campus = view.mode === "campus";
    elements.floorViewport.classList.toggle("is-active", !campus);
    elements.floorViewport.setAttribute("aria-hidden", String(campus));
    elements.campusViewport.classList.toggle("is-active", campus);
    elements.campusViewport.setAttribute("aria-hidden", String(!campus));
    elements.canvasWrap.classList.toggle("is-campus", campus);
    elements.engineBadge.textContent = campus ? "CESIUMJS / CAMPUS-SCALE GEOSPATIAL" : "THREE.JS / ROOM-SCALE WEBGL";
    elements.controlHint.textContent = campus ? "LEFT DRAG TO ORBIT / RIGHT DRAG TO ZOOM" : "LEFT DRAG TO ORBIT / RIGHT DRAG TO PAN";
    renderHeader();
    if (campus) {
      if (initializeCesium()) {
        buildCesiumModel();
        window.setTimeout(() => {
          cesiumViewer.resize();
          fitCesium();
        }, 0);
      }
    } else {
      window.setTimeout(() => {
        resizeThree();
        fitThree();
      }, 0);
    }
  }

  function stopPlayback(label = "PLAY SCENARIO") {
    if (playback) window.clearInterval(playback);
    playback = null;
    elements.play.textContent = label;
  }

  function playScenario() {
    if (playback) {
      stopPlayback();
      return;
    }
    setScenarioStage(0);
    elements.play.textContent = "STOP PLAYBACK";
    playback = window.setInterval(() => {
      if (view.stage >= 4) {
        stopPlayback("PLAY AGAIN");
        return;
      }
      setScenarioStage(view.stage + 1);
    }, 3000);
  }

  function bind() {
    elements.building.addEventListener("change", () => {
      view.buildingId = elements.building.value;
      updateFloors();
      render();
      window.setTimeout(fitThree, 0);
    });
    elements.floor.addEventListener("change", () => {
      view.floor = Number(elements.floor.value);
      view.selectedRoomId = visibleRooms()[0]?.id || null;
      render();
      window.setTimeout(fitThree, 0);
    });
    elements.day.addEventListener("change", () => {
      view.day = elements.day.value;
      render();
    });
    elements.hour.addEventListener("input", () => {
      view.hour = Number(elements.hour.value);
      render();
    });
    elements.zoom.addEventListener("input", () => {
      const zoom = Number(elements.zoom.value) / 100;
      if (view.mode === "campus") {
        cesiumRange = 520 / zoom;
        updateCesiumCamera();
      } else if (threeCamera) {
        threeCamera.zoom = zoom;
        threeCamera.updateProjectionMatrix();
        drawThree();
      }
    });
    elements.stage.addEventListener("input", () => {
      stopPlayback();
      setScenarioStage(Number(elements.stage.value));
    });
    elements.play.addEventListener("click", playScenario);
    elements.stageTargets.addEventListener("click", event => {
      const button = event.target.closest("[data-stage-target]");
      if (!button) return;
      stopPlayback();
      setScenarioStage(view.stage, { targetIndex: Number(button.dataset.stageTarget) });
    });

    host.querySelectorAll("[data-studio-mode]").forEach(button => {
      button.addEventListener("click", () => switchMode(button.dataset.studioMode));
    });
    host.querySelectorAll("[data-studio-layer]").forEach(button => {
      button.addEventListener("click", () => {
        view.layer = button.dataset.studioLayer;
        host.querySelectorAll("[data-studio-layer]").forEach(item => item.classList.toggle("is-active", item === button));
        render();
      });
    });
    host.querySelectorAll("[data-studio-control]").forEach(button => {
      button.addEventListener("click", () => {
        const control = button.dataset.studioControl;
        if (control === "fit") {
          if (view.mode === "campus") fitCesium();
          else fitThree();
          return;
        }
        const direction = control === "rotate-left" ? -1 : 1;
        if (view.mode === "campus") {
          cesiumHeading += direction * 0.28;
          updateCesiumCamera();
        } else if (threeCamera && threeControls) {
          const offset = threeCamera.position.clone().sub(threeControls.target);
          offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), direction * 0.28);
          threeCamera.position.copy(threeControls.target).add(offset);
          threeCamera.lookAt(threeControls.target);
          threeControls.update();
        }
      });
    });

    elements.askGenie.addEventListener("click", () => {
      const building = buildingById(view.buildingId);
      const room = roomById(view.selectedRoomId);
      const target = room ? `${room.name} (${room.id})` : `floor ${view.floor}`;
      onAskGenie?.(`For ${building?.name || view.buildingId}, floor ${view.floor}, what capacity, timetable, energy, and mobility risks should operations investigate around ${target}?`);
    });
    elements.openScenario.addEventListener("click", () => onOpenScenario?.());
  }

  initializeThree();
  bind();

  return {
    setData(next) {
      stopPlayback();
      data = {
        rooms: next.rooms || [],
        schedule: next.schedule || [],
        buildings: next.buildings || [],
        events: next.events || [],
        energy: next.energy || [],
        buildingPressure: next.buildingPressure || [],
        walkEdges: next.walkEdges || [],
        routePressure: next.routePressure || [],
        summary: next.summary || null,
        plan: next.plan || null,
      };
      elements.building.innerHTML = data.buildings
        .map(building => `<option value="${esc(building.id)}">${esc(building.name)} / ${esc(building.id)}</option>`)
        .join("");
      const outage = stageAction(data.plan, "close_room");
      const outageRoom = roomById(outage?.params.room_id);
      view.buildingId = outageRoom?.building_id || data.buildings[0]?.id || null;
      elements.building.value = view.buildingId || "";
      updateFloors(outageRoom?.floor);
      view.selectedRoomId = outageRoom?.id || visibleRooms()[0]?.id || null;
      view.day = DAYS.includes(elements.day.value) ? elements.day.value : "Mon";
      setScenarioStage(0);
    },
    render,
  };
}
