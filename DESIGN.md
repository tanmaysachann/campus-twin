# CampusTwin interface contract

CampusTwin is an **operations instrument**, not a SaaS landing page. The interface should look like software a campus facilities or academic operations team could leave open all day.

This file is intentionally strict because the project is expected to resist generated-UI defaults. It is compatible with the idea behind `npx impeccable detect`: document the visual system, then treat drift as a defect.

## Product posture

- Dense enough to support decisions, but not cramped.
- Evidence first. Decoration never occupies more space than the information it explains.
- Current state, simulated state, assumptions, and uncertainty must remain visually distinguishable.
- No visual element should imply real-time sensing when the backing data is scheduled or modeled.
- The campus map is a measurement canvas; it may use topology lines because they encode walking relationships.

## Core decision journey

The main product path is `Campus pulse -> Ask Genie -> inspect evidence -> run counterfactual -> record outcome`.

- Genie is the entry point to analysis, not a detached chat page.
- Every answer must retain its governed evidence and generated SQL when available.
- A useful answer should hand the operator directly into a relevant scenario preset.
- A scenario must show before and after values, cascading effects, uncertainty, and assumptions.
- A completed scenario should lead into a predicted-versus-observed calibration record.
- The flagship simulation derives a five-action compound plan from the active snapshot. It must expose execution order, all five recomputed domains, the uncertainty draw count, and zero baseline writes.

## Palette

All UI color literals should come from this set unless a new semantic state is deliberately added.

| Token | Value | Use |
|---|---|---|
| ink | `#151816` | primary text, hard actions |
| ink-2 | `#303531` | secondary dark surface |
| muted | `#6d746f` | supporting text |
| line | `#d9ddda` | low emphasis dividers |
| line-strong | `#b9c0bb` | panel/input boundaries |
| paper | `#ffffff` | primary working surface |
| canvas | `#eef0ed` | application background |
| panel | `#f8f9f7` | subtle analytical surface |
| rail | `#181b19` | navigation rail |
| rail-2 | `#242825` | navigation hover/active field |
| accent | `#ef4b36` | one deliberate Databricks-aligned action accent |
| accent-dark | `#b93426` | accent text on light surfaces |
| signal | `#d9ff43` | small operational accent only |
| signal-ink | `#202600` | text/stroke paired with signal |
| watch | `#c77d00` | caution |
| critical | `#b33b2e` | constraint/failure |
| ok | `#26724a` | acceptable state |
| blueprint | `#244f6d` | analytical annotation |

No gradients. No purple/cyan default AI palette. No glow. No warm cream/beige aesthetic.

## Typography

- Body/UI: `Segoe UI Variable Text`, `Aptos`, `Segoe UI`, sans-serif.
- Display: `Aptos Display`, `Arial Narrow`, `Segoe UI`, sans-serif.
- IDs, measurements, timestamps and compact machine labels: `Cascadia Mono`, `SFMono-Regular`, `Consolas`, monospace.
- Minimum functional text: 11px. Body text defaults to 14px.
- Long sentence headlines top out around 38px. A short two-line product statement may reach 54px on a wide screen, but it must not consume the first viewport.
- Uppercase is allowed only for short machine/status labels, never paragraphs.
- Avoid decorative eyebrow copy above major page titles. Breadcrumbs already establish context.

## Shape and elevation

- Radius: 2 to 4px for controls and panels. Full pills are not a visual language.
- Panels use a defined border. They do not combine hairline borders with broad decorative shadows.
- Shadows exist only where physical layering is necessary, such as a modal over a page.
- Avoid card-inside-card compositions. Prefer dividers, rows and table structure.

## Motion

- No ambient animation, floating objects, bounce, shimmer or auto-scrolling content.
- State changes may use short opacity/transform transitions if later added.
- Never animate width/height for visual flourish.
- Spatial scenario playback may advance through explicit discrete stages after the user presses play.

## Spatial twin

- The official xeokit BIM Viewer owns the 3D/BIM workspace at every scale.
- CampusTwin may drive xeokit selection, X-ray, colorization, storey focus, and explorer tabs through the same-origin integration bridge.
- Engine controls must look like technical workspace controls, not game controls.
- Geometry must encode inventory, topology, or imported building data.
- The interface must state when geometry is generated and not surveyed.
- Room selection must expose governed facts and a direct path to Genie or Scenario Lab.
- Color, height, markers, and paths must have a data meaning that appears in the legend or inspector.
- The timeline uses five discrete scenario stages. It does not imply a continuous physical model.
- xeokit attribution and corresponding-source information remain available in the repository.
- A future IFC, glTF, or navigation mesh import must preserve canonical building and room identifiers.

## Iconography and imagery

- No rounded icon tiles.
- No decorative mascot/scene SVGs.
- The custom SVG campus topology is allowed because every node and edge corresponds to data.
- Tiny route/building codes can be used as navigation glyphs because they are labels, not fake icons.

## Anti-slop checklist

The implementation explicitly avoids the patterns highlighted by Impeccable's slop catalog (https://impeccable.style/slop/):

- gradients, neon glows and glass cards;
- oversized hero copy;
- repeated feature-card grids;
- excessive rounded corners and pills;
- cards nested inside cards;
- giant decorative icons;
- meaningless motion;
- decorative grid backgrounds;
- low-contrast gray-on-color text;
- modal-heavy navigation;
- one-font-everywhere typography;
- ungrounded KPI marketing copy.

Run locally when Node is available:

```bash
npx impeccable detect app/campus_twin/static DESIGN.md
```

Treat findings as review prompts, not as permission to distort the operational interface merely to satisfy a heuristic.
