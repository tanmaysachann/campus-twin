# Spatial twin

CampusTwin uses xeokit BIM Viewer as its sole browser-based 3D engine.

## Engine decision

### xeokit BIM Viewer

The production spatial workspace embeds the official `xeokit-bim-viewer` 2.7.1 application. It loads an approximate multi-discipline XKT demonstration project and provides model, object, class, and storey trees, BIM properties, measurements, sections, X-ray modes, viewpoints, and native xeokit navigation.

CampusTwin sends schedule, capacity, energy, building, floor, and scenario state to xeokit through a same-origin message bridge. The bridge changes xeokit object visibility, selection, X-ray, and colorization without creating a second simulation truth.

The bundled geometry is an official detailed demonstration model relabeled for the approximate BMSCE demo. It is not surveyed BMSCE geometry. A future real IFC delivery must preserve canonical `building_id`, floor, and `room_id` mappings during conversion to XKT.

Primary references:

- [xeokit-bim-viewer source](https://github.com/xeokit/xeokit-bim-viewer)
- [xeokit SDK](https://xeokit.io/)

### Retired procedural renderers

The previous custom Three.js room renderer and CesiumJS campus renderer were removed when xeokit became the sole 3D/BIM engine.

## Licensing

xeokit BIM Viewer and xeokit SDK are licensed under AGPL-3.0. The exact upstream commit, corresponding-source link, and license are shipped alongside the viewer assets. A commercial xeokit license is required if this application must remain proprietary.

Autodesk Platform Services Viewer is a strong path for existing Autodesk assets. It also adds a cloud model translation and authorization workflow. That workflow is not required for the current generated campus model.

Primary references:

- [xeokit BIM viewer](https://xeokit.github.io/xeokit-bim-viewer/docs/)
- [That Open web-ifc](https://thatopen.github.io/engine_web-ifc/docs/)
- [Autodesk Platform Services Viewer](https://aps.autodesk.com/en/docs/viewer/v6/reference/Viewing/Viewer3D/)

## Open-source extension review

| Framework | Best use in CampusTwin | License | Decision |
| --- | --- | --- | --- |
| That Open Components | Load IFC, inspect BIM properties, navigate storeys, cut sections, measure, and create floor plans | MIT | Best next BIM adapter when an IFC file exists |
| web-ifc | Read and write IFC data in JavaScript and WebAssembly | MPL 2.0 | Use through a controlled import pipeline when IFC arrives |
| Recast Navigation JS | Build navigation meshes, calculate paths, model temporary obstacles, and simulate crowds | MIT | Best next movement engine after walkable geometry exists |
| SimPy | Discrete-event models for bus queues, room turnover, event ingress, and resource contention | MIT | Strong backend option for a validated queue or transport model |
| Mesa | Agent-based models for emergent student and staff behavior | Apache 2.0 | Do not add now. Current releases require Python 3.12 and would expand the runtime boundary |
| deck.gl | High-volume GPU data layers and geospatial views | MIT | Do not add now. xeokit is the sole production 3D workspace |
| Speckle Viewer | Stream and inspect large AEC models from the Speckle object model | Apache 2.0 | Use only if the campus adopts a Speckle model workflow |

Primary references:

- [That Open Components](https://github.com/ThatOpen/engine_components)
- [That Open web-ifc](https://github.com/ThatOpen/engine_web-ifc)
- [Recast Navigation JS](https://github.com/isaac-mason/recast-navigation-js)
- [SimPy](https://simpy.readthedocs.io/en/stable/index.html)
- [Mesa](https://github.com/mesa/mesa)
- [deck.gl](https://deck.gl/docs)
- [Speckle Viewer](https://docs.speckle.systems/developers/viewer/introduction)

## Source inspection record

Shallow source copies are kept under `references/frameworks/` for engineering review. The directory is ignored by Git and is not shipped with the application.

| Source | Inspected revision | Finding applied to CampusTwin |
| --- | --- | --- |
| That Open Components | `5c2dd9d` | `IfcLoader` converts IFC into the Fragments format and its own example recommends doing this conversion once, then loading the reusable Fragment asset. A Fragments worker and camera update loop are also required. CampusTwin should not parse large IFC files in a live request. |
| web-ifc | `a0f59a3` | Version 0.0.78 exposes an explicit WebAssembly setup, model open and close lifecycle, coordinate-to-origin handling, type queries, and streamed mesh access. The import adapter must own memory cleanup and preserve the source coordinate reference system. |
| Recast Navigation JS | `8769e8b` | Version 0.43.1 can generate a navmesh from approved exported triangle meshes. Its crowd API uses agent targets, speed and acceleration parameters, and a caller-supplied time step. Its worker example confirms that navmesh generation can stay off the render thread. |
| SimPy | `f438164` | Version 4.1.2 advances an event priority heap rather than a frame loop. `Resource`, `PriorityResource`, and `PreemptiveResource` map well to buses, doors, lifts, rooms, and other capacity-limited campus resources. |

These findings set three implementation boundaries:

1. Convert and validate IFC outside the live application path.
2. Run crowd movement only after walkable geometry and agent assumptions have been approved.
3. Return deterministic event results as a compact time series that the browser replays.

### Next extension: movement simulation

Recast Navigation JS is the strongest addition for a future crowd, accessibility, or evacuation mode. The correct sequence is:

1. Import surveyed glTF or IFC floor geometry.
2. Mark doors, stairs, lifts, and accessible paths.
3. Generate and validate a navigation mesh outside the live request path.
4. Map timetable demand or an explicit scenario population to agents.
5. Run fixed time steps for repeatable results.
6. Send aggregate flow, travel time, queue, and blockage results back to governed tables.
7. Render approved agent and path overlays through the xeokit integration boundary.

CampusTwin must not show a crowd simulation as observed occupancy. It must identify the population, walking speed, route choice, accessibility, and obstacle rules as scenario assumptions.

### Next extension: discrete-event operations

SimPy is the strongest addition for bus queues, event ingress, lab resource contention, and room turnover. A SimPy model should run in the backend and return a compact time series. The xeokit workspace can then replay approved visual states without owning the simulation logic.

## Runtime model

The spatial twin consumes the same application snapshot as the rest of CampusTwin:

1. `buildings`, including topology coordinates and area
2. `rooms`, including building, floor, capacity, type, and AC flag
3. `schedule`, including room, day, start time, duration, section, and enrollment
4. building energy totals
5. building pressure and route pressure
6. walking edges and campus events
7. the compound scenario action contract

The renderers do not calculate a second source of truth. They convert governed values and modeled scenario effects into geometry, color, height, labels, and paths.

## Five-stage scenario

The user controls a discrete scenario timeline:

1. Baseline campus state
2. Demand shock
3. Room outage
4. Space and time response
5. Mobility response

The floor model shows room-level demand, closure, release, receiving state, and relocation paths. The campus model shows building-level propagation, events, walking links, route pressure, and the mobility response.

There is no ambient animation. The renderer updates only after a data, view, filter, or scenario change. Scenario playback is an explicit user action.

## Geometry and evidence contract

- Room, timetable, energy, event, and mobility semantics are governed data.
- Current floor geometry is inventory-derived and deterministic.
- Current campus coordinates are a generated projection of local topology values.
- The interface must state that the geometry is not surveyed CAD or GIS.
- Scheduled activity is not live occupancy.
- Imported glTF or IFC geometry must use stable IDs that map to canonical records.
- Genie explains the governed data. It does not invent spatial facts that are absent from the model.

## Production import path

The next geometry adapter should accept:

```text
glTF node name or IFC GlobalId
            |
            v
canonical building_id / floor / room_id
            |
            v
governed Delta overlays and Genie evidence
```

For a real BIM delivery, use an IFC processing pipeline to validate storeys, spaces, and identifiers. Convert the approved visual geometry to glTF for the floor renderer, or add an IFC-specific viewer mode when BIM object inspection is a product requirement.
