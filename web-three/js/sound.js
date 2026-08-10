// Procedural surf audio: one noise voice per nearby crest, shaped by the same
// model the water is drawn from. No samples, no assets.
//
// Default is OFF and stays off until asked. This runs inside a public essay
// where the sim is embedded in iframes; sound that starts on the first stray
// click is a bug, not a feature.
//
// Audit 2026-08-10 fixed five things in the first pass:
//   1. all four voices shared one buffer and started together, so they were
//      phase-locked copies — four correlated sources comb-filter into a
//      mono-ish hiss instead of four wave voices. Each now starts at its own
//      random offset.
//   2. the brown-noise buffer was scaled x3.5 with no normalisation, so peaks
//      clipped. It is measured and normalised now.
//   3. distance ignored the along-shore axis entirely (only z and camera
//      height), so a crest 500 m up the point was as loud as one in front.
//   4. four voices near full gain summed past unity into the destination.
//      A limiter now sits before output.
//   5. the underwater test was `camera.y < 1.0`. main.js already computes the
//      real thing against the JS twin of the surface; it is passed in.
import { breakLine, reefWindow, coastCurve, rayS, swellPhi } from './model-js.js';

const LAM = 90.0;
const VOICE_COUNT = 4;
const BUFFER_SECONDS = 6;      // long enough that the loop is not audible
const TIME_CONST = 0.1;        // parameter smoothing; avoids zipper noise

let audioCtx = null;
let voices = [];
let masterGain = null;
let limiter = null;
let built = false;
let enabled = false;

function buildBrownNoise(ctx) {
  // Brown noise: integrated white, which is the spectral slope of distant surf.
  // Generated once, then normalised — the running sum wanders, so the peak is
  // not knowable in advance and a fixed gain either clips or is inaudible.
  const n = Math.floor(ctx.sampleRate * BUFFER_SECONDS);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last;
    const a = Math.abs(last);
    if (a > peak) peak = a;
  }
  const norm = peak > 1e-6 ? 0.9 / peak : 1;
  for (let i = 0; i < n; i++) d[i] *= norm;
  return buf;
}

function build() {
  if (built) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  audioCtx = new AC();

  // Limiter before the destination: four voices can each approach unity, and
  // their sum would otherwise clip on a loud set.
  limiter = audioCtx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0;            // faded in only when enabled
  masterGain.connect(limiter);
  limiter.connect(audioCtx.destination);

  const noise = buildBrownNoise(audioCtx);
  for (let i = 0; i < VOICE_COUNT; i++) {
    const source = audioCtx.createBufferSource();
    source.buffer = noise;
    source.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.7;

    const gain = audioCtx.createGain();
    gain.gain.value = 0;

    const panner = audioCtx.createStereoPanner
      ? audioCtx.createStereoPanner() : audioCtx.createGain();

    source.connect(filter); filter.connect(gain);
    gain.connect(panner); panner.connect(masterGain);

    // decorrelate: same buffer, independent phase, so the voices sum as four
    // sources rather than one loud one
    source.start(0, Math.random() * BUFFER_SECONDS);
    voices.push({ source, filter, gain, panner });
  }
  built = true;
  return true;
}

export function isAudioEnabled() { return enabled; }

// Must be called from a user gesture the first time: browsers suspend a
// context created without one, and a suspended context never produces sound.
export function setAudioEnabled(on) {
  if (on && !build()) return false;
  enabled = Boolean(on) && built;
  if (!built) return false;
  if (enabled && audioCtx.state === 'suspended') audioCtx.resume();
  masterGain.gain.setTargetAtTime(enabled ? 0.5 : 0.0, audioCtx.currentTime, 0.08);
  return enabled;
}

export function toggleAudio() { return setAudioEnabled(!enabled); }

const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export function updateAudio(camera, t, P, camUnder = false) {
  if (!enabled || !built || audioCtx.state !== 'running') return;

  const camX = camera.position.x, camZ = camera.position.z;
  const camY = Math.max(camera.position.y, 0);
  const w = 2 * Math.PI / P.T, k = 2 * Math.PI / LAM;
  const cc = coastCurve(camX, P);
  const phi = swellPhi(P);
  const sp = Math.max(Math.sin(phi), 0.05), cp = Math.max(Math.cos(phi), 0.05);
  const xfoldCam = P.aframe >= 0.5 ? Math.abs(camX) : camX;

  const nCam = Math.floor((w * t - k * rayS(camX, camZ, P)) / (2 * Math.PI));

  for (let i = 0; i < VOICE_COUNT; i++) {
    const n = nCam - 1 + i;
    const v = voices[i];

    // this crest's world z at the CAMERA's station, solved in the contour frame
    const sCrest = (w * t - 2 * Math.PI * n) / k;
    const zCrest = (sCrest - xfoldCam * sp) / cp - cc;
    // where this crest's zipper currently is along the shore (break line is
    // contourZ = 0, so rayS reduces to x*sin(phi) there)
    const xZip = sCrest / sp;

    // Breaking state is evaluated at the CREST's own station, not the
    // camera's: on a peeling wave the break position slides along x, and
    // reading it at camX made every voice report the same peel phase.
    const zb = breakLine(xZip, P);
    const brk = reefWindow(xZip, P) * smoothstep(-6, 14, zCrest - zb);

    const cg = 0.5 * LAM / P.T;
    // group envelope rides the RAY, same as setEnv() in the shared model
    const env = 0.5 + 0.5 * Math.cos(2 * Math.PI * P.dF * (t - sCrest / cg));

    // full 3-D distance: the along-shore term was missing, which made a crest
    // hundreds of metres up the point as loud as one directly in front
    const dx = xZip - camX, dz = camZ - zCrest;
    const dist = Math.sqrt(dx * dx + dz * dz + camY * camY);
    const distAtten = dist > 15 ? 15 / dist : 1;

    let gain = (brk * 0.85 + 0.02) * env * distAtten / VOICE_COUNT;
    let freq = 120 + brk * 1800;
    if (P.xi > 0.5) freq *= 0.6;          // plunging: heavier, lower crash
    if (camUnder) { freq = Math.min(freq, 300); gain *= 0.5; }

    v.gain.gain.setTargetAtTime(gain, audioCtx.currentTime, TIME_CONST);
    v.filter.frequency.setTargetAtTime(freq, audioCtx.currentTime, TIME_CONST);
    if (v.panner.pan) {
      const pan = Math.max(-1, Math.min(1, dx / 50)) * distAtten;
      v.panner.pan.setTargetAtTime(pan, audioCtx.currentTime, TIME_CONST);
    }
  }
}
