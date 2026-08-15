# Vendored dependencies

Pinned; do not upgrade casually — OrbitControls must come from the SAME release
as three.module.js (its bare `three` import resolves via the import map in
`../index.html`).

| file | version | source |
|---|---|---|
| `three.module.js` | three.js r170 (npm `three@0.170.0`) | https://unpkg.com/three@0.170.0/build/three.module.js |
| `OrbitControls.js` | three.js r170 (npm `three@0.170.0`) | https://unpkg.com/three@0.170.0/examples/jsm/controls/OrbitControls.js |

Fetched 2026-08-09. License: MIT (Three.js Authors).

| file | version | source |
|---|---|---|
| `fisheye/fisheye-core.js` | fisheye-menu 0.1.0 @ 899379e | `~/Documents/dev/fisheye-menu` (andyed/fisheye-menu) |
| `fisheye/fisheye-menu.js` | fisheye-menu 0.1.0 @ 899379e | same |
| `fisheye/fisheye-menu.css` | fisheye-menu 0.1.0 @ 899379e | same |

Vendored 2026-08-14. License: MIT (Andy Edmonds). LOCAL DIVERGENCE from
upstream (candidates to port back): per-item base weights (`item.weight` →
`panel._weights` → `baseWeights` param in fisheye-core height functions) and
`fontMin`/`fontMax` clamps on the height-scaled font, and a horizontal
viewport clamp on top-level panel position (right-edge bar items on narrow
viewports). If re-vendoring, carry these or land them upstream first.
