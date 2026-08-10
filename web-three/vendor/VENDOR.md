# Vendored dependencies

Pinned; do not upgrade casually — OrbitControls must come from the SAME release
as three.module.js (its bare `three` import resolves via the import map in
`../index.html`).

| file | version | source |
|---|---|---|
| `three.module.js` | three.js r170 (npm `three@0.170.0`) | https://unpkg.com/three@0.170.0/build/three.module.js |
| `OrbitControls.js` | three.js r170 (npm `three@0.170.0`) | https://unpkg.com/three@0.170.0/examples/jsm/controls/OrbitControls.js |

Fetched 2026-08-09. License: MIT (Three.js Authors).
