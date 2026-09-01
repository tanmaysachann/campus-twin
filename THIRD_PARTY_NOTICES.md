# Third-party notices

CampusTwin vendors the following browser runtimes so the Databricks App does not depend on a public CDN during a demonstration.

## Three.js

- Version: 0.185.1
- License: MIT
- Project: https://threejs.org/
- Local license: `app/campus_twin/static/vendor/three/LICENSE.txt`

The local `OrbitControls.js` import path was changed from the package alias to the bundled relative module path. Runtime behavior was not otherwise modified.

## CesiumJS

- Version: 1.144.0
- License: Apache License 2.0
- Project: https://cesium.com/platform/cesiumjs
- Local license: `app/campus_twin/static/vendor/cesium/LICENSE.md`

The Cesium credit display remains visible in the campus viewport.
