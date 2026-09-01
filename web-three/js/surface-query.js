// Narrow authoritative surface query for runtime consumers.
//
// The water mesh is displaced by SURFACE_GLSL on the GPU. CPU replicas have
// repeatedly drifted from that path as measured depth, shoaling, refraction
// and breaker anatomy evolved. A rider-mounted camera cannot tolerate that
// drift: a metre of error puts the eye inside the wave.
//
// This query compiles the SAME SURFACE_PRELUDE + SURFACE_GLSL text as the water
// vertex shader into a three-pixel fragment pass. One batched read returns the
// source point plus the exact two forward-difference taps GRID_VERT uses for
// its structural normal. No foam/material clone, no second height model.

import * as THREE from 'three';
import { SURFACE_PRELUDE, SURFACE_GLSL } from './shaders.js';

const QUERY_W = 3;

// `defines` mirrors the water material's compile-time flags (main.js passes its
// ROLLER_BUILD define): the query must compile the SAME text as the mesh it
// stands in for, or a flag-gated displacement (the #roller mound) would move
// the drawn water and not the rider on it.
export function makeSurfaceQuery(renderer, sharedUniforms, defines = {}) {
  const queryUniform = { value: new THREE.Vector4() }; // source x, z, dx, dz
  const target = new THREE.WebGLRenderTarget(QUERY_W, 1, {
    type: THREE.FloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
  });
  const material = new THREE.ShaderMaterial({
    uniforms: Object.assign({ u_query: queryUniform }, sharedUniforms),
    defines,
    vertexShader: 'void main(){ gl_Position = vec4(position.xy*2.0, 0.0, 1.0); }',
    fragmentShader: `${SURFACE_PRELUDE}\n${SURFACE_GLSL}\n` +
      'uniform vec4 u_query; // source x, z, dx, dz\n' +
      'void main(){\n' +
      '  float i = floor(gl_FragCoord.x);\n' +
      '  vec2 xz = u_query.xy;\n' +
      '  if (i > 0.5 && i < 1.5) xz.x += u_query.z;\n' +
      '  else if (i >= 1.5) xz.y += u_query.w;\n' +
      '  float f, p, b, c, l, a, k;\n' +
      '  vec3 P = surfacePos(xz, u_time, f, p, b, c, l, a, k);\n' +
      '  gl_FragColor = vec4(P, l);\n' +
      '}',
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.Camera();
  const pixels = new Float32Array(QUERY_W * 4);

  // One stable result object: the frame consumes it immediately, so runtime
  // sampling stays allocation-free. Callers that retain it must copy values.
  const result = {
    position: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 1, 0),
    land: false,
    valid: false,
    elapsedMs: 0,
  };
  const px = new THREE.Vector3();
  const pz = new THREE.Vector3();
  const dx = new THREE.Vector3();
  const dz = new THREE.Vector3();
  const timings = [];
  const latencies = [];
  let calls = 0;
  let failures = 0;
  let pending = false;

  function decode(meta, started) {
    result.position.fromArray(pixels, 0);
    px.fromArray(pixels, 4);
    pz.fromArray(pixels, 8);
    result.land = pixels[3] > 0.5;
    result.valid = [result.position.x, result.position.y, result.position.z,
                    px.x, px.y, px.z, pz.x, pz.y, pz.z].every(Number.isFinite);
    result.meta = meta;
    result.latencyMs = performance.now() - started;
    latencies.push(result.latencyMs);
    if (latencies.length > 240) latencies.shift();
    if (!result.valid) { failures++; return; }

    // Bit-identical construction to GRID_VERT: cross(Pz-P, Px-P). The query
    // intentionally stops before fragment-only detail normals; a board rides
    // the displaced structural surface, not glitter/ripple shading.
    dx.subVectors(px, result.position);
    dz.subVectors(pz, result.position);
    result.normal.crossVectors(dz, dx);
    if (!(result.normal.lengthSq() > 1e-12)) result.normal.set(0, 1, 0);
    else result.normal.normalize();
  }

  function sample(x, z, meta = null) {
    const cell = sharedUniforms.u_cell?.value;
    const cellX = Number.isFinite(cell?.x) && cell.x > 0 ? cell.x : 2;
    const cellZ = Number.isFinite(cell?.y) && cell.y > 0 ? cell.y : 2;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      failures++;
      result.valid = false;
      return result.valid ? result : null;
    }

    // Never wait for the GPU on the animation thread. Three's async read uses
    // a PIXEL_PACK_BUFFER + fence; while it is pending the caller consumes the
    // last completed result (and its matching ride-state metadata).
    if (!pending) {
      queryUniform.value.set(x, z, cellX, cellZ);
      const started = performance.now();
      const previousTarget = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        renderer.setRenderTarget(previousTarget);
        const issueMs = performance.now() - started;
        result.elapsedMs = issueMs;
        calls++;
        timings.push(issueMs);
        if (timings.length > 240) timings.shift();
        pending = true;
        renderer.readRenderTargetPixelsAsync(target, 0, 0, QUERY_W, 1, pixels)
          .then(() => { decode(meta, started); pending = false; })
          .catch(() => { failures++; pending = false; });
      } catch {
        renderer.setRenderTarget(previousTarget);
        failures++;
        pending = false;
      }
    }

    if (!result.valid) {
      return null;
    }
    return result;
  }

  function stats() {
    const sorted = [...timings].sort((a, b) => a - b);
    const sortedLatency = [...latencies].sort((a, b) => a - b);
    const medianMs = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    const p95Ms = sorted.length ? sorted[Math.floor((sorted.length - 1) * 0.95)] : null;
    const latencyMedianMs = sortedLatency.length
      ? sortedLatency[Math.floor(sortedLatency.length / 2)] : null;
    const latencyP95Ms = sortedLatency.length
      ? sortedLatency[Math.floor((sortedLatency.length - 1) * 0.95)] : null;
    return { calls, failures, pending, medianMs, p95Ms, latencyMedianMs,
             latencyP95Ms, samples: sorted.length };
  }

  function dispose() {
    target.dispose();
    material.dispose();
    quad.geometry.dispose();
  }

  return { sample, stats, dispose };
}
