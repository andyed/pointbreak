import * as THREE from 'three';
import { surferState, surfaceAt } from './model-js.js';

const COUNT = 1500;
let sprayGeo;
let sprayPos;
let sprayLife;
let sprayVel;
let sprayIdx = 0;

function createCircleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(16, 16, 15, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

export function makeSprayMesh() {
  sprayGeo = new THREE.BufferGeometry();
  sprayPos = new Float32Array(COUNT * 3);
  sprayLife = new Float32Array(COUNT);
  sprayVel = new Float32Array(COUNT * 3);
  
  for(let i = 0; i < COUNT; i++) {
    sprayPos[i*3+1] = -999;
    sprayLife[i] = -1;
  }
  
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  sprayGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  
  const mat = new THREE.PointsMaterial({ 
    size: 0.8, 
    map: createCircleTexture(),
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  
  const points = new THREE.Points(sprayGeo, mat);
  // Keep particles active regardless of camera angle (bounding box issues when spread out)
  points.frustumCulled = false;
  return points;
}

export function updateSpray(mesh, t, dt, P) {
  if (dt <= 0) return; // paused
  
  const sWorld = surferState(t, P);
  const surf = surfaceAt(sWorld.x, sWorld.z, t, P);
  
  // Plunging wave crest
  if (P.xi > 0.4 && surf.plunge > 0.05) {
    const spawns = 8;
    for(let i = 0; i < spawns; i++) {
      sprayIdx = (sprayIdx + 1) % COUNT;
      
      // Calculate zipper/crest location (approximate by pulling back from surfer)
      const crestX = sWorld.x - 2 + (Math.random() - 0.5) * 6;
      const crestZ = sWorld.z + 14 + (Math.random() - 0.5) * 4;
      const cSurf = surfaceAt(crestX, crestZ, t, P);
      
      const px = crestX + cSurf.ox;
      // Add extra height for the lip throw
      const py = cSurf.h + cSurf.plunge * 1.5 + Math.random() * 2;
      const pz = crestZ + cSurf.oz;
      
      sprayPos[sprayIdx*3] = px;
      sprayPos[sprayIdx*3+1] = py;
      sprayPos[sprayIdx*3+2] = pz;
      
      sprayLife[sprayIdx] = 1.0 + Math.random() * 0.8; // 1-1.8s life
      
      sprayVel[sprayIdx*3] = (Math.random() - 0.5) * 6;
      sprayVel[sprayIdx*3+1] = (Math.random() - 0.2) * 5;
      sprayVel[sprayIdx*3+2] = 8 + Math.random() * 8; // throw shoreward
    }
  }
  
  const colors = sprayGeo.attributes.color.array;
  
  for(let i = 0; i < COUNT; i++) {
    if (sprayLife[i] > 0) {
      sprayLife[i] -= dt;
      
      sprayPos[i*3] += sprayVel[i*3] * dt;
      sprayPos[i*3+1] += sprayVel[i*3+1] * dt;
      sprayPos[i*3+2] += sprayVel[i*3+2] * dt;
      
      sprayVel[i*3+1] -= 12.0 * dt; // gravity
      
      // Fade out
      const lifePct = Math.min(sprayLife[i], 1.0);
      const intensity = lifePct * 0.9;
      colors[i*3] = intensity;
      colors[i*3+1] = intensity * 1.05; // slightly blue-white
      colors[i*3+2] = intensity * 1.1;
    } else if (sprayLife[i] > -1) {
      sprayLife[i] = -1;
      sprayPos[i*3+1] = -999;
      colors[i*3] = 0;
      colors[i*3+1] = 0;
      colors[i*3+2] = 0;
    }
  }
  
  sprayGeo.attributes.position.needsUpdate = true;
  sprayGeo.attributes.color.needsUpdate = true;
}
