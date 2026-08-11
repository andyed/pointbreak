// The rider (M3) — a procedural low-poly surfer + board on the ride line.
// The spec calls for a glTF body (Blender-authored or CC0); neither asset
// exists yet, so the silhouette is composed three.js primitives instead:
// dark near-black shapes, no face detail — it is read at 100+ m. Everything
// is built inside one makeSurferMesh() factory so the eventual glTF drops in
// as a one-function swap (same group origin, same local axes: +z forward
// along travel, +y up off the deck, origin at board center).
// TODO(gltf): replace the primitive body with a CC0 low-poly rider glTF —
// keep the factory signature and the 'rider' child name (lean is applied
// there); see TODO.md M3+.
//
// Placement math comes from model-js.js (the JS twin of the shader model):
// surferState() for where, surfaceAt() for the drawn water surface there
// (height + M2 choppy offset + FD normal). No lights in the scene — all
// water is ShaderMaterial — so the body uses MeshBasicMaterial flat colors;
// silhouette against foam/sky is the entire read, matching web/'s SDF rider.

import * as THREE from 'three';
import { surferState, surfaceAt, PUMP_PERIOD } from './model-js.js';

// wetsuit near-black + a clearly lighter deck so the board reads as a
// separate object at follow-cam range (~200 m). web/ used 0.06-0.08 greys;
// that killed the board at distance, so the deck is now a light slate that
// still sits below foam white — board/body separation is a value contrast,
// not a hue read.
const BODY_COL  = 0x101317;
const BOARD_COL = 0x4a5560;
const WAKE_COL  = 0xffffff;

// capsule limb from point a to b (radius r): the same primitive web/'s SDF
// rider is built from, so the silhouette language carries over
function limb(a, b, r, mat) {
  const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
  const dir = bv.clone().sub(av);
  const len = dir.length();
  const geo = new THREE.CapsuleGeometry(r, len, 3, 6);   // low-poly on purpose
  const mesh = new THREE.Mesh(geo, mat);
  // CapsuleGeometry is authored along +y; rotate onto the a->b axis
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.position.copy(av.clone().add(bv).multiplyScalar(0.5));
  return mesh;
}

export function makeSurferMesh() {
  const group = new THREE.Group();           // origin = board center, +z forward
  const bodyMat  = new THREE.MeshBasicMaterial({ color: BODY_COL });
  const boardMat = new THREE.MeshBasicMaterial({ color: BOARD_COL });

  // board: flattened lens along +z (a squashed capsule outlines nose + tail
  // rocker better than a box at this size). Rotate the GEOMETRY onto +z so
  // the mesh-space y scale flattens thickness, not length (scale applies in
  // local space before rotation — a rotated mesh would squash the wrong axis)
  // slightly longer/wider than the first pass — at 200 m the board IS the
  // "surfing" cue, the body alone reads as a swimmer
  const boardGeo = new THREE.CapsuleGeometry(0.34, 2.1, 3, 8);
  boardGeo.rotateX(Math.PI / 2);
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.scale.set(1.0, 0.18, 1.0);           // ~0.7 m wide, ~0.12 m thick
  group.add(board);

  // wake: one white quad trailing the tail, riding the water plane (~0.35
  // below board center, matching the float offset in updateSurfer). It is a
  // child of the GROUP, not the rider — the board basis follows the face, so
  // the quad stays on the water while the body leans. Semi-transparent, no
  // depth write: it tints the water white without stencil-cutting the mesh.
  const wakeGeo = new THREE.PlaneGeometry(0.6, 1.5);
  wakeGeo.rotateX(-Math.PI / 2);             // lie flat, normal up
  const wake = new THREE.Mesh(wakeGeo, new THREE.MeshBasicMaterial({
    color: WAKE_COL, transparent: true, opacity: 0.55,
    depthWrite: false, side: THREE.DoubleSide,
  }));
  wake.name = 'wake';
  wake.position.set(0, -0.30, -2.15);        // tail is at z ~ -1.4; trail behind
  group.add(wake);

  // rider sub-group: COMPRESSED surf stance — hips dropped to ~0.6 m, knees
  // clearly bent (knee forward of the foot-hip line), torso driving forward
  // over the front foot, arms LOW: lead hand reaching ahead of the knee,
  // trail hand near the back hip. The first pass stood ~1.55 m tall with
  // arms at shoulder height and read as a T-posed stick at distance.
  // Lean (pump phase + face lean) is applied to THIS group.
  const rider = new THREE.Group();
  rider.name = 'rider';
  const hip = [0, 0.60, 0.02];
  rider.add(limb([0.02, 0.07,  0.42], [0.14, 0.36,  0.34], 0.085, bodyMat)); // front shin
  rider.add(limb([0.14, 0.36,  0.34], hip, 0.10, bodyMat));                  // front thigh
  rider.add(limb([-0.02, 0.07, -0.40], [-0.06, 0.32, -0.22], 0.085, bodyMat)); // back shin
  rider.add(limb([-0.06, 0.32, -0.22], hip, 0.10, bodyMat));                 // back thigh
  const shoulder = [0.02, 1.00, 0.18];       // compressed torso, forward bias
  rider.add(limb(hip, shoulder, 0.16, bodyMat));
  rider.add(limb(shoulder, [0.30, 0.62,  0.60], 0.055, bodyMat));            // lead arm, low + forward
  rider.add(limb(shoulder, [-0.30, 0.58, -0.06], 0.055, bodyMat));           // trail arm, low
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), bodyMat);
  head.position.set(0.02, 1.16, 0.28);       // head over the front knee
  rider.add(head);
  group.add(rider);

  group.visible = false;                     // S toggles; default off like web/
  return group;
}

// scratch objects — updateSurfer runs every frame, keep it allocation-free
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _wUpLocal = new THREE.Vector3();
const _qInv = new THREE.Quaternion();
const _qUp = new THREE.Quaternion();
const _qId = new THREE.Quaternion();
const _qLean = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _qFace = new THREE.Quaternion();

// how far the rider counter-tilts back toward gravity-vertical (0 = glued to
// the board basis, 1 = always plumb). On steep plunging faces the raw surface
// basis laid the body nearly horizontal (Slot close-up, M3 verification) —
// a real surfer's board follows the face while the body stays mostly upright.
const UPRIGHT = 0.6;

// face lean: on top of the plumb counter-tilt, roll the body a little PAST
// vertical toward the wave face (the side world-up tilts toward in the board
// frame — _wUpLocal.x). tanh saturates the roll at FACE_LEAN on a steep face
// and fades it to zero on flat water, so the waiting rider stands neutral
// instead of flickering sign at wUpLocal.x ~ 0.
const FACE_LEAN = 0.22;   // rad (~13 deg) max angulation into the face

// Pose the rider for simulation time t and model params P. Returns the world
// position so the Follow camera can reuse it without recomputing the model.
export function updateSurfer(group, t, P) {
  const s = surferState(t, P);
  const surf = surfaceAt(s.x, s.z, t, P);

  // the drawn surface at model (x, z) sits at world (x+ox, h, z+oz) — ride
  // the water the renderer actually shows, not the undisplaced heightfield.
  // +0.35 board float matches web/'s SDF placement; the plunge term lifts
  // the board over the extra water the fold converges onto plunging crests
  // (see model-js surfaceAt — the standable twin can't see that convergence)
  const wx = s.x + surf.ox, wy = surf.h + 0.35 + 0.9 * surf.plunge, wz = s.z + surf.oz;
  if (Number.isFinite(wx) && Number.isFinite(wy) && Number.isFinite(wz)) {
    group.position.set(wx, wy, wz);
  }

  // board pitched by the local surface normal, nose along travel: build an
  // orthonormal basis (right, normal, forward-projected-onto-face)
  _up.set(surf.nx, surf.ny, surf.nz);
  _fwd.set(s.vx, 0, s.vz);
  _fwd.addScaledVector(_up, -_fwd.dot(_up));   // project travel onto the face
  if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, 1);   // degenerate: keep last heading shape
  _fwd.normalize();
  _right.crossVectors(_up, _fwd).normalize();
  _m.makeBasis(_right, _up, _fwd);
  group.quaternion.setFromRotationMatrix(_m);

  const rider = group.getObjectByName('rider');
  if (rider) {
    // counter-tilt: express world-up in the group's local frame and rotate the
    // rider partway toward it (board keeps the face, body keeps its feet)
    _qInv.copy(group.quaternion).invert();
    _wUpLocal.copy(_yAxis).applyQuaternion(_qInv);
    _qUp.setFromUnitVectors(_yAxis, _wUpLocal);
    _qId.identity();
    _qId.slerp(_qUp, UPRIGHT);
    // lean from pump phase: web/'s SDF displaces the body top by 0.55*sin(...)
    // at 1.55 m height — the same tilt as a rotation about the lateral axis
    _qLean.setFromAxisAngle(_xAxis, Math.atan2(0.55 * Math.sin(t * 2 * Math.PI / PUMP_PERIOD), 1.55));
    // roll about the board axis into the face: rotating +theta about +z takes
    // the body top toward -x, so the sign is negated to lean toward +x when
    // world-up (and the face) is on the +x side
    _qFace.setFromAxisAngle(_zAxis, -FACE_LEAN * Math.tanh(4 * _wUpLocal.x));
    rider.quaternion.copy(_qId).multiply(_qLean).multiply(_qFace);
  }

  return group.position;
}
