import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const shaders=readFileSync(new URL('../web-three/js/shaders.js',import.meta.url),'utf8');
const helper=shaders.match(/vec3 breakerSurfaceContactAt\([^]*?\n}\n/)[0];
// Execute the shipped scalar search and branching against controlled displaced
// surfaces. Surface evaluation is a fixture; the resolver is not reimplemented.
const body=helper.slice(helper.indexOf('{')+1,helper.lastIndexOf('}'))
 .replace(/\b(?:float|int|vec3)\s+/g,'let ')
 .replace(/\bfloat\(/g,'Number(')
 .replace(/surfacePos\((vec2\([^)]*\)), t, f,p,b,c,l,a,k\)/g,'sample($1,t)')
 .replace('return contact;','return {contact,sourceZ,valid};');
const fn=new Function('x','t','tip','frame','surface','VIS','CURT_REACH','kLocalAt','swellPhi','max','min','cos','PI','vec2','dot',
 'let sourceZ,valid; function sample(p,t){const r=surface(p,t);l=r.land;return r.point;}'+body);
const point=(x,y,z)=>({x,y,z});
const resolve=(surface,tip=point(0,2,0),frame={x:1.8,y:2,z:0,w:0})=>
 fn(0,50,tip,frame,surface,1,.9,()=>.08,()=>0,Math.max,Math.min,Math.cos,Math.PI,
 (x,y)=>({x,y}),(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z);

test('landing resolver rejects the folded source branch and returns actual lower forward water',()=>{
 const surface=({y:z})=>({point:point(.07*z,z<3?2.1:2.3-.2*z,z<3?-z:z-3),land:0});
 const old=surface({y:1.8}).point;
 assert.ok(old.y>2&&old.z<0,'fixture recreates nominal foot above and behind lip');
 const r=resolve(surface);
 assert.equal(r.valid,1);
 assert.ok(r.contact.z>=1.8&&r.contact.y<=1.3);
 assert.deepEqual(r.contact,surface({y:r.sourceZ}).point,'no endpoint height or position clamp');
 assert.ok(r.sourceZ>=5&&r.sourceZ<5.07,'five refinements resolve first qualifying receiver');
});

test('landing search never invents contact when the available front stays high or dry',()=>{
 for(const surface of [({y:z})=>({point:point(0,2,z),land:0}),({y:z})=>({point:point(0,0,z),land:1})]) {
  const r=resolve(surface);assert.equal(r.valid,0);
 }
});

test('resolved receiving point moves continuously across coarse scan cells',()=>{
 let last;
 for(let shift=0;shift<2;shift+=.01){
  const r=resolve(({y:z})=>({point:point(0,2.3-.2*(z-shift),z-3-shift),land:0}));
  assert.equal(r.valid,1);
  if(last!==undefined)assert.ok(Math.abs(r.sourceZ-last)<.07);
  last=r.sourceZ;
 }
});

test('contact search uses the shared event frame and remains downstream of actual lip curl',()=>{
 assert.doesNotMatch(helper,/breakLine\(|mod\(|u_H0|CRASH_PEAK_S|u_time/);
 assert.match(shaders,/#ifdef BREAKING_BODY\n      float receiverSource, receiverValid;[^]*?if \(curlT > 0\.30\) \{[^]*?breakerSurfaceContactAt\(x0, u_time, Ptip, landing/);
 assert.match(shaders,/float sourceTime = u_time - max\(landing\.z, 0\.0\);/);
 assert.match(shaders,/vG = mix\(tail, head, v\);/);
 assert.match(shaders,/vCurtA = sqrt\(gate\)\*contact\*\(1\.0-smoothstep\(0\.5, 1\.0, tail\)\);/);
});
