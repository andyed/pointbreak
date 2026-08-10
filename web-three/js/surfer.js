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

// wetsuit near-black + a slightly lighter deck so the board reads as a
// separate object when the sun is behind the wave (web/ used 0.06-0.08 greys)
const BODY_COL  = 0x101317;
const BOARD_COL = 0x272e35;

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
  const boardGeo = new THREE.CapsuleGeometry(0.30, 1.9, 3, 8);
  boardGeo.rotateX(Math.PI / 2);
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.scale.set(1.0, 0.18, 1.0);           // 0.6 m wide, ~0.1 m thick
  group.add(board);

  // rider sub-group: surf stance, feet spread along the board axis, knees
  // bent, arms out for balance. Lean (pump phase) is applied to THIS group.
  const rider = new THREE.Group();
  rider.name = 'rider';
  const hip = [0, 0.78, 0.02];
  rider.add(limb([0, 0.06,  0.38], [0.02, 0.45,  0.24], 0.085, bodyMat));  // front shin
  rider.add(limb([0.02, 0.45, 0.24], hip, 0.095, bodyMat));                // front thigh
  rider.add(limb([0, 0.06, -0.36], [-0.02, 0.42, -0.30], 0.085, bodyMat)); // back shin
  rider.add(limb([-0.02, 0.42, -0.30], hip, 0.095, bodyMat));              // back thigh
  const shoulder = [0, 1.24, 0.10];                                        // crouched torso
  rider.add(limb(hip, shoulder, 0.15, bodyMat));
  rider.add(limb(shoulder, [0.34, 1.02,  0.42], 0.055, bodyMat));          // lead arm
  rider.add(limb(shoulder, [-0.30, 1.00, -0.34], 0.055, bodyMat));         // trail arm
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), bodyMat);
  head.position.set(0, 1.44, 0.14);
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

// how far the rider counter-tilts back toward gravity-vertical (0 = glued to
// the board basis, 1 = always plumb). On steep plunging faces the raw surface
// basis laid the body nearly horizontal (Slot close-up, M3 verification) —
// a real surfer's board follows the face while the body stays mostly upright.
const UPRIGHT = 0.6;

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
    rider.quaternion.copy(_qId).multiply(_qLean);
  }

  return group.position;
}
