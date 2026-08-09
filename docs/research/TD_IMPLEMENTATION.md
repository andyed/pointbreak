# TouchDesigner Implementation Recon — Point-Break Simulator

Date: 2026-08-09. Recon for building a surf point-break simulator in TouchDesigner on macOS, driven via the tdmcp MCP server.

## 1. tdmcp (MindDesigner) capabilities

Repo: `/Users/andyed/Documents/dev/tdmcp` (v0.13.1). Node MCP server + a Python **bridge** running inside TD (`/project1/tdmcp_bridge`, port 9980; health check `curl http://127.0.0.1:9980/api/info`). 508 tools in three layers (artist generators → building blocks → atomic node CRUD), backed by an embedded knowledge base of 629 operators + 68 Python classes. Docs: `docs/reference/tools.md` (7,418 lines), `architecture.md`, `bridge-api.md`.

Core loop (architecture.md): **create → verify (`get_td_node_errors`) → preview (`get_preview`)**, with auto left→right network layout.

### Node network building
- `create_td_node`, `create_node_chain`, `connect_nodes`, `create_container`, `delete_td_node`
- `set_parameters_batch`, `update_td_node_parameters`, `pulse_td_parameter`, `batch_operations`
- Inspection: `get_td_nodes`, `get_td_node_parameters`, `get_td_node_errors`, `get_td_topology`, `find_td_nodes`, `find_td_parameters`, `search_td_code`, `summarize_td_errors`, `snapshot_td_graph`, `get_td_performance`
- Escape hatch: `execute_python_script` (runs arbitrary Python in TD — destructive-tier), `exec_node_method`, `create_python_script` (stores code in a DAT)
- Knowledge: `search_operators`, `suggest_operator_chain`, `validate_operator_chain`, `get_operator_workflow_guide`, `get_td_docs`

### GLSL TOPs
- `create_glsl_shader` — GLSL TOP under a parent COMP; fragment (+optional vertex) source placed in companion Text DATs, numeric uniforms best-effort bound on the Vectors page, resolution `720p/1080p/4K/input`. Sampler uniforms need manual wiring (returned as warnings).
- `apply_glsl_top_mapping` — foundation primitive: full mapping (fragment + uniforms + channels + controls) → self-contained GLSL TOP network with control panel + preview. Used by `import_shadertoy` / `import_isf_shader`.
- Supporting: `create_audio_glsl_uniforms`, `create_glsl_material` (GLSL MAT), `create_shader_lib`, `create_raymarch_scene`, `create_sdf_field`.
- Multi-pass: chain multiple GLSL TOPs with `create_node_chain`/`connect_nodes`; feedback via Feedback TOP (see `create_feedback_network`). No dedicated "FFT ping-pong" tool — build passes explicitly.

### .tox import — yes, into /project1
- `manage_component` `action=load` reads a `file_path` .tox into `parent_path` (default `/project1`); `linked=true` gives a live externaltox instance that re-reads on file change. `action=save` exports a COMP to .tox (verified deferred write, refuses overwrite by default).
- `create_engine_comp` — loads an external .tox in a **separate TD subprocess** (Engine COMP): independent crash domain, its own cook; the .tox's out ops surface as connectors. Good for hosting a heavy FFT ocean sim.
- Export/packaging: `make_portable_tox`, asset-collecting portable bundle tool, vault tools (`save_component_to_vault`, revision trails).

### Preview mechanism
- `get_preview` — **static inline PNG** of any TOP (default 640×360, up to 4096); `sample_grid=N` returns an N×N RGBA sample grid + per-channel stats as JSON (10–50× cheaper "is it alive" check); `pre_pulses` (e.g. reset feedback before capture) and `delay_frames` (deferred job_id capture). No animated GIF/movie preview; for motion, capture via `setup_output output_type=record` (Movie File Out) or take multiple delayed frames.

Security note: the bridge executes arbitrary Python and listens on all interfaces — trusted network only (`TDMCP_BRIDGE_TOKEN`, `TDMCP_BRIDGE_ALLOW_EXEC=0` available).

## 2. House conventions — PSYCHODELI_NATIVE_V3_MATH

Not a standalone file: it is a COMP at `/project1/PSYCHODELI_NATIVE_V3_MATH` **inside**
`/Users/andyed/Documents/dev/psychodeli-audio-lab/output/touchdesigner/Psychodeli-Warehouse-Signal-TD-v1.30-Native-Shader-Studio.toe`
(same .toe also carries the earlier `PSYCHODELI_NATIVE_V2` with a 40_FINISH variant; v1.24/v1.27 siblings exist; preview PNG `Psychodeli-Native-Shader-Studio-preview.png` beside them). Inspect without opening TD via `/Applications/TouchDesigner.app/Contents/MacOS/toeexpand <file>.toe` (writes `<file>.toe.dir` + `.toc`).

Module structure — numbered stage COMPs, "truth flows left to right":

| Stage | Owns |
|---|---|
| `00_SIGNAL_MAP` | Signal ingest + contract. `MATH_CONTRACT` (Text DAT documenting the whole pipeline), `MATH_STATE` (canonical readable state table: math_profile, wave_shape, metric_mode, kaleidoscope_mode, node_count, angular/radial_frequency, spiral_pitch), `OUT_PATTERN` / `OUT_FEATURES` / `OUT_HOOK_VALUES`, `SIDECAR_HOOKS_README` |
| `10_NODE_SPACE` | Pseudo-Lorenz node motion, metric distance, N-body force superposition (GLSL) |
| `20_POLAR_WAVE` | Force vectors → r/θ, transcendental wave mode, interference, spiral pitch, optional kaleidoscope |
| `30_COLOR_GRADE` | Scalar field → section-stable cosine palettes |
| `40_FEEDBACK_MOTION` | Drift, decay, trails (`trail_feedback` Feedback TOP + `trail_decay`/`trail_drift`/`trail_mix`/`trail_target`) |
| `50_FINISH` | Dry/bloom A/B (`bloom`, `finish_variant`, `OUT_FINISH`) |

Conventions to copy for pointbreak:
- **NN_STAGE naming** with two-digit prefixes; each stage has `in_*` / `OUT_*` In/Out TOPs so stages wire like functions.
- **Per-stage GLSL TOP + Text DAT pairs**: `field_glsl` (GLSL TOP) + `field_pixel` (active pixel-shader DAT). `field_glsl_compute` / `field_glsl_pixel` DATs exist but hold the stock TD examples — the **pixel-shader path is the active one** (`pixeldat` param → `field_pixel`).
- **vec4-packed uniforms**: `uMathState`, `uFeatures`, `uRhythm`, `uBands`, `uStructure`, `uPattern` — GLSL TOP vector params use expressions reading the `MATH_STATE` DAT (e.g. `op('.../MATH_STATE')['metric_mode'].eval()`).
- **Written contract in-network**: `MATH_CONTRACT` Text DAT states stage ownership, state semantics, and policy (who owns what signal). Replicate as e.g. `SURF_CONTRACT`.
- **ANN_\*** annotation COMPs per stage (`ANN_SIGNAL`, `ANN_NODE`, `ANN_POLAR`, `ANN_COLOR`, `ANN_MOTION`, `ANN_FINISH`, `ANN_OUTPUT`) + `VIEW_SELECTOR` for switching honest diagnostic views vs the Beauty output; single terminal `OUT_NATIVE_PSYCHODELI_V3`.
- **Sidecar hooks**: `Sidecarweight` custom par blends 0..1 between package-driven automatic values and GUI/manual values (hooks: Nodecount, Angularfrequency, Radialfrequency, Spiralpitch, Traildrift, Trailzoom, Traildecay, Bloomenabled), published via an `OUT_HOOK_VALUES` Parameter DAT for external discovery.

## 3. TouchDesigner on macOS — platform notes

- Installed: `/Applications/TouchDesigner.app`, **build 2025.33070** (2025-series official).
- Renderer is **Vulkan**; on macOS via **MoltenVK over Metal** (since the 2022.24200-era switch). Main supported GLSL is **4.60** on all platforms — the GLSL TOP version menu runs glsl120→glsl460.
- **Compute shaders work on macOS** (require GLSL ≥4.30; enabled by the Vulkan/MoltenVK move — previously unavailable on Mac). TD's compute template uses `TDImageStoreOutput()` for sRGB-correct writes.
- **Geometry shaders are gone on macOS** (Metal has none) — avoid; use vertex displacement or instancing instead (`create_vertex_displacement_mat` exists in tdmcp).
- Multi-pass FFT rendering: no macOS-specific blocker — chained GLSL TOPs (pixel or compute) with 32-bit float pixel format is the standard butterfly-FFT pattern and GLSL 4.60 parity means Windows-authored shader stacks generally port. Caveats: MoltenVK adds a translation layer (profile with `get_td_performance`); some CUDA/NVIDIA-dependent community tools are Windows-only (TDDepthAnything, TDGS — irrelevant here but noted in tdmcp docs).
- Known-good local proof: the V3_MATH stack runs multi-stage GLSL + Feedback TOP chains on this Mac.

## 4. FFTOcean asset

- URL: <https://derivative.ca/community-post/asset/fft-ocean-simulation/65732> — **do not auto-download**.
- `FFTOcean_V1.0.tox`, 23.82 KB, author **devart.space**, v1.0. Real-time ocean waves via inverse FFT per **Tessendorf's "Simulating Ocean Water"**; credits the OREON ENGINE project. Exposed params: wind force, wave viscosity, field size. No TD version requirement or license stated on the page.
- Access: the page shows the download link directly; no login requirement is stated on-page, but derivative.ca community assets commonly gate downloads behind a free account — verify at download time. Companion forum thread: <https://forum.derivative.ca/t/fft-ocean-simulation-share-tox/233055>.
- At 24 KB the .tox is compact — likely GLSL DATs + a small network; once (manually) downloaded it can be inspected with `toeexpand` and loaded via `manage_component action=load` into `/project1`, or sandboxed in an Engine COMP.

## 5. Prior art worth studying

FFT / Tessendorf implementations (portable math, even where not TD-native):
- [godot4-oceanfft](https://github.com/tessarakkt/godot4-oceanfft) — compute-shader FFT displacement, closest analog to a TD compute-TOP port
- [achalpandeyy/OceanFFT](https://github.com/achalpandeyy/OceanFFT) — OpenGL compute-shader demo with good write-up
- [iamyoukou/fftWater](https://github.com/iamyoukou/fftWater), [Throbbing/FFT-Ocean](https://github.com/Throbbing/FFT-Ocean), [czartur/ocean_fft](https://github.com/czartur/ocean_fft), [deiss/fftocean](https://github.com/deiss/fftocean) — C++/OpenGL references
- [Ocean Simulation with FFT and WebGPU](https://barthpaleologue.github.io/Blog/posts/ocean-simulation-webgpu/) — modern pass-by-pass walkthrough (spectrum → butterfly → displacement/normals)

Point-break-relevant (FFT alone gives deep-water open ocean; a breaking point wave needs bathymetry):
- [GPU Gems ch. 1 — Effective Water Simulation from Physical Models](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models) — Gerstner waves; sharpening crests, shallow-water steepening
- [Heightfields + wave particles (Sánchez-Banderas)](https://www.thepenguincode.com/rosa/blog/work/ocean-surface-simulation-with-heightfields-and-wave-particles) — hybrid heightfield approach suited to localized breaking behavior
- [Trochoidal wave](https://en.wikipedia.org/wiki/Trochoidal_wave) / [Waves and shallow water](https://en.wikipedia.org/wiki/Waves_and_shallow_water) — shoaling/refraction background for driving the peel along the point
- TD docs: [Write a GLSL TOP](https://docs.derivative.ca/Write_a_GLSL_TOP), [Compute Shader](https://derivative.ca/UserGuide/Compute_Shader), [Vulkan](https://derivative.ca/UserGuide/Vulkan)

### Suggested shape of the build
V3_MATH's stage grammar maps cleanly: `00_SIGNAL_MAP` (swell/wind/tide state table + contract DAT) → `10_SPECTRUM` (Phillips/JONSWAP spectrum GLSL) → `20_FFT` (butterfly passes, compute or pixel ping-pong at rgba32) → `30_BATHYMETRY` (depth map, shoaling/refraction, peel logic — the point-break-specific stage FFTOcean won't provide) → `40_SURFACE` (displacement render or screen-space shading, no geometry shaders) → `50_FINISH` (foam, spray, grade, bloom). Drive it via tdmcp's node CRUD + `create_glsl_shader`, verify each stage with `get_td_node_errors` + `get_preview sample_grid`.
