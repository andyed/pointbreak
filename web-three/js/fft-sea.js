// Two JONSWAP wind-sea cascades on the GPU (Tessendorf FFT), producing a
// slope texture and a height texture each, for the far-field ripple.
//
// WHY THIS EXISTS (2026-09-10). DETAIL_GLSL's ripple was four octaves of value
// noise at fixed wavelengths, scrolled at fixed velocities. That is one
// texture sliding over the surface: no dispersion (every scale moves at the
// same speed), no directional spread, no footprint filtering. A real sea
// decorrelates in time and distance because every wavenumber runs at its own
// phase speed omega = sqrt(g k), and a wind sea is streaky because its energy
// is spread as cos^n about the wind. Both fall out of a spectral (FFT) surface
// for free, and the slope render target can be mipmapped so distance averages
// the normal instead of the detailVis kill throwing it away.
//
// SCOPE. This is the "commodity substrate" CLAUDE.md permits: the zipper, the
// carrier, the shoaling, every foam clock and every consumer of rayPhase()
// are untouched. The swell is NOT here — that is this project's own model.
// Only the wind-sea band (2.5–30 m) and the capillary-ish band (0.25–3.8 m)
// come from the FFT, as texture, gated by u_chop exactly as the noise was.
//
// PROVENANCE. Port of the SpectralCascade class in iamtechartist/ocean-
// simulation (https://github.com/iamtechartist/ocean-simulation, MIT), with
// the swell cascade, foam/Jacobian and the per-frame foam decay removed, the
// evolve/transform/pack/derive passes kept, texelFetch replaced by nearest
// texture2D so the passes compile under three's ShaderMaterial prefix, and a
// seeded PRNG so a capture is reproducible. Their FFT is a radix-2 Stockham
// autosort with the Hermitian trick (spectrum stores h(k) and conj h(-k)
// side by side), unnormalized, which is why rms is set from the coefficient
// energy rather than from the Phillips/JONSWAP constant.
//
// RATE INDEPENDENCE. The spectrum evolves on the sim clock (u_time in
// seconds), not on a per-frame delta: the surface at t is a pure function of
// t, so #speed and pause behave and headless captures at a fixed #sim match.

const TAU = Math.PI * 2;

// mulberry32: small, seedable, good enough for a Gaussian spectrum seed
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussianFrom(rand) {
  // Box–Muller; the log argument is floored so a zero draw cannot produce -Infinity
  return () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(TAU * rand());
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const PASS_VERT = 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }';

// The three cascades' defaults are the source repo's wind-sea and short-sea
// bands; the swell band is deliberately absent (see SCOPE).
export const FFT_CASCADES = [
  { length: 211.0, minWave: 2.5,  maxWave: 30.0, rms: 0.16,  spreadExp: 3 },
  { length: 27.3,  minWave: 0.25, maxWave: 3.8,  rms: 0.017, spreadExp: 3 },
];

export function createFftSea(THREE, renderer, { size = 128, seed = 1337 } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  quad.frustumCulled = false;
  scene.add(quad);
  const runPass = (material, target) => {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  };
  const passMaterial = (uniforms, fragmentShader) => new THREE.ShaderMaterial({
    uniforms, vertexShader: PASS_VERT, fragmentShader, depthTest: false, depthWrite: false,
  });
  const scratchTarget = () => new THREE.WebGLRenderTarget(size, size, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
  });
  // the two textures the surface reads: tiled, mipmapped, linear. Mipmaps are
  // what let the far field average its slope toward the mean normal instead of
  // aliasing — the reason the FFT can survive past detailVis's ~300 m.
  const surfaceTarget = () => {
    const t = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, generateMipmaps: true,
    });
    return t;
  };

  const timeUniform = { value: 0 };
  const rand = prng(seed);
  const gaussian = gaussianFrom(rand);

  class Cascade {
    constructor({ length, minWave, maxWave, rms, spreadExp }) {
      this.length = length;
      this.ping = [scratchTarget(), scratchTarget()];
      this.displacement = surfaceTarget();   // (dx, h, dz, 0)
      this.slope = surfaceTarget();          // (slope.x, slope.z, h, 0)

      // ---- spectrum seed, CPU, once ----
      // JONSWAP with the source repo's 78 m peak (a ~7 s sea); inside the
      // 2.5–30 m band that is the omega^-5 tail, which is what a wind sea
      // shorter than the swell looks like. Direction is +x of the tile; the
      // surface shader rotates world xz into the wind frame.
      const coefficients = new Float32Array(size * size * 2);
      const initial = new Float32Array(size * size * 4);
      const deltaK = TAU / length, peakOmega = Math.sqrt(9.81 * TAU / 78);
      let energy = 0;
      for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
        const kx = (x < size / 2 ? x : x - size) * deltaK, kz = (z < size / 2 ? z : z - size) * deltaK;
        const k = Math.hypot(kx, kz), index = (z * size + x) * 2;
        if (k < 1e-5) continue;
        const wavelength = TAU / k;
        const band = smooth(minWave, minWave * 1.35, wavelength) * (1 - smooth(maxWave * 0.75, maxWave, wavelength));
        if (band === 0) continue;
        const omega = Math.sqrt(9.81 * k), sigma = omega <= peakOmega ? 0.07 : 0.09;
        const peak = Math.exp(-0.5 * ((omega - peakOmega) / (sigma * peakOmega)) ** 2);
        const jonswap = 0.0081 * 9.81 ** 2 / omega ** 5 * Math.exp(-1.25 * (peakOmega / omega) ** 4) * 3.3 ** peak;
        const alignment = kx / k;
        const spreading = 0.97 * Math.max(alignment, 0) ** spreadExp + 0.015;
        const density = jonswap * 0.5 * Math.sqrt(9.81 / k) / k * spreading * deltaK ** 2 * band;
        const amplitude = Math.sqrt(density * 0.5);
        coefficients[index] = gaussian() * amplitude;
        coefficients[index + 1] = gaussian() * amplitude;
        energy += coefficients[index] ** 2 + coefficients[index + 1] ** 2;
      }
      const scale = rms / Math.sqrt(Math.max(1e-15, energy * 2));
      for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
        const i = (z * size + x) * 4, k = i / 2;
        const opposite = (((size - z) % size) * size + (size - x) % size) * 2;
        initial[i] = coefficients[k] * scale; initial[i + 1] = coefficients[k + 1] * scale;
        initial[i + 2] = coefficients[opposite] * scale; initial[i + 3] = coefficients[opposite + 1] * scale;
      }
      const initialTexture = new THREE.DataTexture(initial, size, size, THREE.RGBAFormat, THREE.FloatType);
      initialTexture.minFilter = initialTexture.magFilter = THREE.NearestFilter;
      initialTexture.needsUpdate = true;

      const S = size.toFixed(1);
      // ---- evolve: h(k, t) = h0(k) e^{i w t} + conj(h0(-k)) e^{-i w t} ----
      this.evolve = passMaterial({ uInitial: { value: initialTexture }, uTime: timeUniform, uLength: { value: length } }, `
        uniform sampler2D uInitial;
        uniform float uTime, uLength;
        vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
        void main() {
          vec2 cell = floor(gl_FragCoord.xy);
          vec2 k = cell;
          if (cell.x >= ${S} * 0.5) k.x -= ${S};
          if (cell.y >= ${S} * 0.5) k.y -= ${S};
          k *= 6.283185307 / uLength;
          float magnitude = length(k);
          if (magnitude < 0.00001) { gl_FragColor = vec4(0.0); return; }
          // deep-water dispersion with a small capillary term for the short band
          float omega = sqrt(9.81 * magnitude * (1.0 + magnitude * magnitude * 0.000074));
          vec2 rotation = vec2(cos(omega * uTime), sin(omega * uTime));
          vec4 initial = texture2D(uInitial, (cell + 0.5) / ${S});
          vec2 h = cmul(initial.xy, vec2(rotation.x, -rotation.y)) + cmul(vec2(initial.z, -initial.w), rotation);
          vec2 d = k / magnitude;
          // horizontal (choppy) displacement packed beside the height
          vec2 packed = vec2(-h.y * d.x - h.x * d.y, h.x * d.x - h.y * d.y);
          gl_FragColor = vec4(h, packed);
        }
      `);
      // ---- transform: one radix-2 butterfly stage, horizontal or vertical ----
      this.transform = passMaterial({ uInput: { value: null }, uStep: { value: 2 }, uHorizontal: { value: 1 } }, `
        uniform sampler2D uInput;
        uniform float uStep, uHorizontal;
        vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
        vec4 fetch(vec2 cell) { return texture2D(uInput, (cell + 0.5) / ${S}); }
        void main() {
          vec2 cell = floor(gl_FragCoord.xy);
          float index = uHorizontal > 0.5 ? cell.x : cell.y;
          float evenIndex = floor(index / uStep) * uStep * 0.5 + mod(index, uStep * 0.5);
          vec2 evenCell = uHorizontal > 0.5 ? vec2(evenIndex, cell.y) : vec2(cell.x, evenIndex);
          vec2 oddCell = evenCell + (uHorizontal > 0.5 ? vec2(${S} * 0.5, 0.0) : vec2(0.0, ${S} * 0.5));
          vec4 evenValue = fetch(evenCell), oddValue = fetch(oddCell);
          float angle = 6.283185307 * index / uStep;
          vec2 twiddle = vec2(cos(angle), sin(angle));
          gl_FragColor = evenValue + vec4(cmul(twiddle, oddValue.xy), cmul(twiddle, oddValue.zw));
        }
      `);
      // ---- pack: (dx, h, dz) in metres ----
      this.pack = passMaterial({ uInput: { value: null } }, `
        uniform sampler2D uInput;
        void main() {
          vec4 field = texture2D(uInput, gl_FragCoord.xy / ${S});
          gl_FragColor = vec4(field.b, field.r, field.a, 1.0);
        }
      `);
      // ---- derive: slope of the displaced surface, plus height for the vertex bump ----
      this.derive = passMaterial({ uDisplacement: { value: this.displacement.texture }, uLength: { value: length } }, `
        uniform sampler2D uDisplacement;
        uniform float uLength;
        void main() {
          vec2 uv = gl_FragCoord.xy / ${S}, texel = vec2(1.0 / ${S}, 0.0);
          vec3 dx = (texture2D(uDisplacement, uv + texel.xy).xyz - texture2D(uDisplacement, uv - texel.xy).xyz) * ${S} / (2.0 * uLength);
          vec3 dz = (texture2D(uDisplacement, uv + texel.yx).xyz - texture2D(uDisplacement, uv - texel.yx).xyz) * ${S} / (2.0 * uLength);
          vec3 n = cross(vec3(dz.x, dz.y, 1.0 + dz.z), vec3(1.0 + dx.x, dx.y, dx.z));
          n *= inversesqrt(max(dot(n, n), 1e-12));
          vec2 slope = clamp(-n.xz / max(0.25, n.y), vec2(-4.0), vec2(4.0));
          float h = texture2D(uDisplacement, uv).g;
          gl_FragColor = vec4(slope, h, 1.0);
        }
      `);
    }
    update() {
      runPass(this.evolve, this.ping[0]);
      let index = 0;
      for (let axis = 0; axis < 2; axis++) {
        this.transform.uniforms.uHorizontal.value = axis === 0 ? 1 : 0;
        for (let step = 2; step <= size; step *= 2) {
          this.transform.uniforms.uInput.value = this.ping[index].texture;
          this.transform.uniforms.uStep.value = step;
          index = 1 - index;
          runPass(this.transform, this.ping[index]);
        }
      }
      this.pack.uniforms.uInput.value = this.ping[index].texture;
      runPass(this.pack, this.displacement);
      runPass(this.derive, this.slope);
    }
  }

  const cascades = FFT_CASCADES.map((c) => new Cascade(c));

  return {
    cascades,
    lengths: FFT_CASCADES.map((c) => c.length),
    slope: cascades.map((c) => c.slope.texture),
    // advance every cascade to sim time t (seconds); restores the null target
    update(t) {
      if (!Number.isFinite(t)) return;
      timeUniform.value = t;
      for (const c of cascades) c.update();
      renderer.setRenderTarget(null);
    },
  };
}
