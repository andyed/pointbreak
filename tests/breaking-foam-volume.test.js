import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../web-three/vendor/three.module.js';
import {createBreakingFoamVolume,BREAKING_FOAM_STATE_FRAG,BREAKING_FOAM_SHAPE_GLSL,BREAKING_FOAM_VOLUME_VERT} from '../web-three/js/breaking-foam-volume.js';

const fract=x=>x-Math.floor(x);
const smoothstep=(a,b,v)=>{const u=Math.max(0,Math.min(1,(v-a)/(b-a)));return u*u*(3-2*u)};
function shapeHelper(name,args){
 const body=BREAKING_FOAM_SHAPE_GLSL.match(new RegExp(`(?:float|vec3) ${name}\\([^)]*\\)\\{([^]*?)\\n}`))[1].replace(/\bfloat\s+/g,'let ');
 const fn=new Function(...args,'fract','sin','floor','mod','foamHash','smoothstep','vec3',body);
 return (...values)=>fn(...values,fract,Math.sin,Math.floor,(a,b)=>a-b*Math.floor(a/b),hash,smoothstep,(...v)=>v);
}
const hash=(id,salt)=>hashImpl(id,salt);
const hashImpl=shapeHelper('foamHash',['id','salt']);
const sourceX=shapeHelper('foamSourceX',['id']);
const arcAt=shapeHelper('foamArc',['cycle','id']);
const turn=shapeHelper('foamTurn',['arc']);
const axesAt=shapeHelper('foamAxes',['id']);

test('stable independent cohort identities vary spacing, front phase and aspect within physical bounds',()=>{
 const spacings=[],arcs=[],axisX=[];
 for(let id=0;id<1536;id++){
  const x=sourceX(id),axes=axesAt(id);
  assert.ok(x>-285&&x<285);
  if(id>=2){const gap=x-sourceX(id-2);assert.ok(gap>=(1-.64)*570/768-1e-10);spacings.push(gap)}
  assert.ok(axes[0]>=1.25&&axes[0]<=2.1&&axes[1]>=.68&&axes[1]<=1.03&&axes[2]>=.75&&axes[2]<=1.2);
  const a=arcAt(52.31,id);assert.ok(a>=0&&a<1);arcs.push(a);axisX.push(axes[0]);
  assert.equal(sourceX(id),x,'identity does not change with evaluation order');
  assert.equal(arcAt(52.31,id),a,'phase is repeatable after arbitrary seeks');
 }
 assert.ok(Math.max(...spacings)-Math.min(...spacings)>.5,'spacing variation is visible');
 assert.ok(Math.max(...arcs)-Math.min(...arcs)>.95,'cohorts fill the whole front');
 assert.ok(Math.max(...axisX)-Math.min(...axisX)>.8,'aspect variation is substantial');
 assert.ok(Math.abs(arcAt(52.31,0)-arcAt(52.31,1))>.01,'paired slots do not trace two locked rows');
});

test('every independent cohort becomes invisible on both sides of its own wrap',()=>{
 for(let id=0;id<1536;id++){
  const boundary=1.75*(1-hash(id,2));
  const before=arcAt(boundary-1e-6,id),after=arcAt(boundary+1e-6,id);
  assert.ok(before>.99999&&after<.00001);
  assert.ok(turn(before)<1e-8&&turn(after)<1e-8,'no identity swap with visible radius');
  // Away from wrap, shared-clock progression preserves its original speed.
  const a=arcAt(boundary+.2,id),b=arcAt(boundary+.2001,id);
  assert.ok(Math.abs((b-a)/.0001-1/1.75)<1e-8);
 }
 assert.ok(BREAKING_FOAM_STATE_FRAG.includes(BREAKING_FOAM_SHAPE_GLSL));
 assert.ok(BREAKING_FOAM_VOLUME_VERT.includes(BREAKING_FOAM_SHAPE_GLSL),'cap and mesh use identical varied basis/aspects');
 assert.match(BREAKING_FOAM_VOLUME_VERT,/normal\.x\/axes\.x/);
});

test('attached foam volume has bounded GPU resources and no implicit default activation',()=>{
 assert.throws(()=>createBreakingFoamVolume(THREE,{}),/BREAKING_BODY/);
 const v=createBreakingFoamVolume(THREE,{u_time:{value:0},u_vis:{value:1}},{BORE:1,BREAKING_BODY:1});
 assert.equal(v.mesh.geometry.instanceCount,1536);
 assert.equal(v.stateTarget.textures.length,3);
 assert.equal(v.stateTarget.width,1536);
 assert.equal(v.mesh.material.transparent,false);
 assert.equal(v.mesh.material.depthWrite,true);
 assert.equal(v.diagnostics().updates,0);
 assert.equal(v.diagnostics().verticesPerInstance,117);
 assert.equal(v.diagnostics().trianglesPerInstance,168);
 v.dispose();v.dispose();assert.equal(v.diagnostics().disposed,true);
});

test('carrier bank replacement has zero outgoing and newborn volume, preserving observed peel',()=>{
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const smoothstep=(a,b,v)=>{const u=clamp((v-a)/(b-a),0,1);return u*u*(3-2*u)};
 // Execute the production retirement expression and canonical bore birth
 // expression, rather than maintaining a second set of envelope constants.
 const body=BREAKING_FOAM_STATE_FRAG.match(/float breakingFoamRetirement\([^)]*\)\{([^]*?)\n}/)[1];
 const retire=new Function('age','period','smoothstep','max',body);
 const model=readFileSync(new URL('../shared/model-glsl.js',import.meta.url),'utf8');
 const birthEnd=Number(model.match(/const float BORE_BIRTH_S\s*=\s*([\d.]+)/)[1]);
 const birthExpr=model.match(/float birth\s*=\s*([^;]+);/)[1];
 const birth=new Function('ageB','BORE_BIRTH_S','smoothstep',`return ${birthExpr}`);
 for(const period of [8,14,16,22]){
  const at=age=>retire(age,period,smoothstep,Math.max);
  assert.equal(at(period),0,'outgoing bank is gone at replacement');
  assert.equal(birth(0,birthEnd,smoothstep)*at(0),0,'newborn bank starts invisible');
  assert.equal(at(.98*period),0,'retirement precedes bank replacement');
  assert.ok(at(.98*period-1e-5)<1e-8,'outgoing envelope approaches zero smoothly');
  for(let age=0;age<period;age+=.01)assert.ok(at(age+.01)<=at(age)+1e-12);
 }
 for(const period of [14,16])assert.equal(retire(7.5,period,smoothstep,Math.max),1,'observed peel is preserved');
 assert.match(BREAKING_FOAM_STATE_FRAG,/farFadeAt\(source\)\*breakingFoamRetirement\(age,u_T\)/);
});

test('volume remains a canonical attached bore consumer with a full-extent crest cap',()=>{
 assert.match(BREAKING_FOAM_STATE_FRAG,/boreWedgeAt\(source,u_time,breakPermissionAt\(source,u_time\)/);
 assert.match(BREAKING_FOAM_STATE_FRAG,/breakingRollCycleAt\(x\*3\.0,u_time\)/);
 assert.match(BREAKING_FOAM_STATE_FRAG,/farFadeAt\(source\)/);
 assert.match(BREAKING_FOAM_STATE_FRAG,/1\.0-smoothstep\(0\.10,0\.30,curl\)/);
 assert.match(BREAKING_FOAM_STATE_FRAG,/ceiling-centre\.y/);
 assert.match(BREAKING_FOAM_STATE_FRAG,/max\(extentY,0\.001\)/);
 assert.doesNotMatch(BREAKING_FOAM_STATE_FRAG,/plumeEnvelope\(/);
});
