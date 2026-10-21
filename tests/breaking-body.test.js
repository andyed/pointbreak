import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const model = readFileSync(new URL('../shared/model-glsl.js', import.meta.url), 'utf8');
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const smoothstep = (a,b,v) => { const u=clamp((v-a)/(b-a),0,1); return u*u*(3-2*u); };
const mix = (a,b,t) => a*(1-t)+b*t;
// Execute the actual scalar helper bodies, with a bounded continuous noise
// substitute. These tests assert envelopes, not a second rendering model.
function scalarHelper(name, args) {
 const body=model.match(new RegExp(`(?:float|vec4) ${name}\\([^)]*\\)\\{([\\s\\S]*?)\\n\\}`))[1]
  .replace(/\b(?:float|int)\s+/g,'let ').replace(/\bfloat\(/g,'Number(').replace(/body\.([xyzw])/g,(_,c)=>`body[${'xyzw'.indexOf(c)}]`);
 return new Function(...args,'smoothstep','clamp','mix','min','max','abs','vec2','vec4','vnoise2','sqrt','breakingRollAt','floor','sin','cos','PI','breakingRollCycleAt',body);
}
const noise=([x,y])=>0.5+0.5*Math.sin(x*.731+Math.sin(y)*1.21);
const vec=(...v)=>Object.assign(v,{x:v[0],y:v[1],z:v[2],w:v[3]});
const helpers=[smoothstep,clamp,mix,Math.min,Math.max,Math.abs,vec,vec,noise,Math.sqrt,(...a)=>rollAt(...a),Math.floor,Math.sin,Math.cos,Math.PI,(x,t)=>cycleAt(x,t)];
const cycleFn=scalarHelper('breakingRollCycleAt',['sourceX','t']);
const cycleAt=(x,t)=>cycleFn(x,t,...helpers);
const rollFn=scalarHelper('breakingRollAt',['sourceX','arc','t']);
const rollAt=(x,a,t)=>rollFn(x,a,t,...helpers);
const bodyFn=scalarHelper('breakingBodyAt',['sourceX','fracB','ageB','t']);
const liftFn=scalarHelper('breakingBodyLift',['fracB','ageB','body']);
const bodyAt=(x,f,a,t)=>bodyFn(x,f,a,t,...helpers);
const liftAt=(f,a,b)=>liftFn(f,a,b,...helpers);

test('rounded body never raises its original crest or creates an isolated mound below the toe',()=>{
 for(let x=-200;x<=200;x+=11.7) for(const age of [-4,0,.55,1,2,7.5,16,30,80]) {
  for(let f=-1;f<=1;f+=.013) {
   const b=bodyAt(x,f,age,52.3);
   assert.ok(b.every(Number.isFinite));
   assert.ok(b.every(v=>v>=-1e-12&&v<=1+1e-12));
   const lift=liftAt(f,age,b);
   assert.ok(Number.isFinite(lift));
   assert.ok(lift<=Math.max(f,0)+1e-12,`crest clearance at ${f}`);
   if(f>=.65||f<=-.085) assert.ok(Math.abs(lift)<1e-12,'no detached toe/back mound');
  }
  assert.ok(liftAt(0,age,bodyAt(x,0,age,52.3))<=0,'crest never inflated');
 }
});

test('body stays substantial through observed peel and subordinates older crest rows smoothly',()=>{
 const first=bodyAt(12,.25,7.5,52)[3];
 const old=bodyAt(12,.25,23.5,52)[3];
 assert.equal(first,1);
 assert.ok(old<first*.35);
 for(let age=0;age<60;age+=.1) assert.ok(bodyAt(12,.25,age+.1,52)[3]<=bodyAt(12,.25,age,52)[3]+1e-12);
 // No wrap or step at arbitrary carrier-period boundaries.
 for(const t of [0,14,16,28,32,1000]) {
  const a=bodyAt(12,.25,6,t),b=bodyAt(12,.25,6,t+1e-4);
  assert.ok(a.every((v,i)=>Math.abs(v-b[i])<.002));
 }
});

test('body remains downstream of existing crest clock, permission and physical amplitude',()=>{
 const helper=model.match(/vec4 breakingBodyAt\([^]*?\n}\n/)[0];
 assert.doesNotMatch(helper,/breakLine\(|rayPhase\(|mod\(|VIS|u_H0/);
 assert.match(model,/#ifdef BREAKING_BODY[^]*?0\.5\*xiAt\(xz\.x\)/);
 assert.match(model,/h \+= \(2\.0\*amp\) \* breakingBodyLift\(fracB, ageB, bodyB\) \* gB \* min\(u_bore, 1\.0\);/);
 assert.match(model,/boreFoamB = gB \* bodyB\.x \* bodyB\.w/);
});

const shaders=readFileSync(new URL('../web-three/js/shaders.js',import.meta.url),'utf8');
const warpBody=shaders.match(/vec2 breakingSampleXZ\([^)]*\)\{([^]*?)\n}/)[1]
 .replace(/\b(?:float|vec2|int)\s+(?=[a-zA-Z_])/g,'let ');
const warpFn=new Function('source','t','u_refrZ','u_T','coastCurve','farFadeAt','rayPhase',
 'smoothstep','min','max','sin','floor','mix','clamp','PI','vec2',warpBody);
function phaseHarness(slopes){
 const lo=-180,hi=220,step=(hi-lo)/255,phase=[0];
 for(let i=1;i<256;i++)phase.push(phase[i-1]+slopes(i)*step);
 const ray=({x,y})=>{const f=clamp((y+0.2*x-lo)/step,0,255),i=Math.min(254,Math.floor(f));return .013*x+mix(phase[i],phase[i+1],f-i)};
 const warp=(x,z,t)=>warpFn({x,y:z},t,{x:lo,y:hi},16,x=>.2*x,()=>1,ray,
 smoothstep,Math.min,Math.max,Math.sin,Math.floor,mix,clamp,Math.PI,(x,y)=>({x,y}));
 return {warp,ray};
}

test('crest sampling is monotone across varying Psi slopes, edges and every clock phase',()=>{
 for(const slopes of [()=>.075,i=>.04+.20*(i/255)**2,i=>.06+.03*Math.sin(i*.21)]) {
  const {warp}=phaseHarness(slopes);
  for(const t of [0,1.4,4,8,15.99,16]) for(const x of [-180,0,180]) {
   let prev=-Infinity;
   for(let z=-225;z<265;z+=.113) {
    const p=warp(x,z,t);
    assert.ok(Number.isFinite(p.y)&&p.y>prev,'adaptive mesh must not invert');
    assert.equal(p.x,x,'sampling retains source station');prev=p.y;
   }
   for(const z of [-180-.2*x,220-.2*x]) assert.equal(warp(x,z,t).y,z,'Psi edge identity');
  }
 }
 const {warp}=phaseHarness(()=>.075);
 // At t=0 the phase-zero edge is faded; choose an interior crest phase 4pi.
 const crest=-180+4*Math.PI/.075;
 const spacing=warp(0,crest+.01,0).y-warp(0,crest-.01,0).y;
 assert.ok(spacing>.0059&&spacing<.0061,'crest sampling increases density by 3.33x');
});

test('adaptive source reaches geometry, material and both finite-difference tangents together',()=>{
 const vert=shaders.split('export const GRID_VERT = `')[1].split('export const GRID_FRAG')[0];
 assert.match(vert,/xz = breakingSampleXZ\(xz, u_time\);/);
 assert.match(vert,/vSourceXZ = xz;/);
 assert.match(vert,/sampleX = breakingSampleXZ\(position.xz \+ vec2\(u_cell.x, 0.0\), u_time\)/);
 assert.match(vert,/sampleZ = breakingSampleXZ\(position.xz \+ vec2\(0.0, u_cell.y\), u_time\)/);
 assert.match(vert,/surfacePos\(sampleX/);assert.match(vert,/surfacePos\(sampleZ/);
});

const crestCode=model.match(/float breakingBodyCrestZ\([^)]*\)\{([^]*?)\n}/)[1]
 .replace(/\b(?:float|int)\s+(?=[a-zA-Z_])/g,'let ');
const crestFn=new Function('source','t','u_T','PI','rayPhase','mod','max','clamp','vec2',crestCode);
test('compact body source crest solves the same phase across changing depth',()=>{
 for(const slopes of [()=>.075,i=>.04+.20*(i/255)**2,i=>.06+.03*Math.sin(i*.21)]){
  const {ray}=phaseHarness(slopes);
  for(let z=-120;z<=150;z+=7.3) for(const delta of [-.8,-.4,0,.4,.8]){
   const source={x:0,y:z},p=ray(source),t=(p+delta)*16/(2*Math.PI);
   const c=crestFn(source,t,16,Math.PI,ray,(a,b)=>((a%b)+b)%b,Math.max,clamp,(x,y)=>({x,y}));
   assert.ok(Number.isFinite(c));
   // Three local Newton taps are a coordinate approximation, unlike the
   // exact phase-table inversion used for sampling. Require source error
   // below 0.10 m, well below the 0.49 m high-tier crest cell.
   let lo=-180,hi=220;for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(ray({x:0,y:mid})<p+delta)lo=mid;else hi=mid;}
   assert.ok(Math.abs(c-(lo+hi)/2)<.10,'crest solve stays within 0.10 m');
  }
 }
});

test('compact body joins on monotone phase and leaves a turning lip to the existing bend',()=>{
 const compact=shaders.slice(shaders.indexOf('// GPU transects at the field-day crest'),shaders.indexOf('foam   *= fade;'));
 assert.match(compact,/smoothstep\(1\.05, 1\.80, bodyPhase\)/);
 assert.doesNotMatch(compact,/smoothstep\(depth, 0\.98, bodyFrac\)/);
 assert.match(compact,/compact \*= 1\.0 - smoothstep\(0\.10, 0\.30, curl\)/);
 assert.match(compact,/carrierAmp\)\/max\(VIS, 1e-3\)/);
 assert.doesNotMatch(compact,/\bh\s*[+*\-/]?=/,'horizontal shaping cannot raise the crest');
});


test('rolling relief is bounded and its analytic lighting gradients match the actual moving surface',()=>{
 for(const t of [0,.1,1,4,52,1000])for(let x=-21;x<=21;x+=.31)for(let a=0;a<=1;a+=.073){
  const r=rollAt(x,a,t),e=1e-4;
  assert.ok(r.every(Number.isFinite));assert.ok(r[0]>=0&&r[0]<=1.000001);
  const dx=(rollAt(x+e,a,t)[0]-rollAt(x-e,a,t)[0])/(2*e);
  const da=(rollAt(x,a+e,t)[0]-rollAt(x,a-e,t)[0])/(2*e);
  assert.ok(Math.abs(dx-r[1])<.001,'alongshore gradient');
  assert.ok(Math.abs(da-r[2])<.001,'front gradient');
 }
 // No station seam when the selected set of overlapping lobes changes.
 for(let c=-5;c<5;c++)for(const a of [.1,.4,.8]){
  const l=rollAt(c*4.2-1e-6,a,52),r=rollAt(c*4.2+1e-6,a,52);
  assert.ok(l.every((v,i)=>Math.abs(v-r[i])<.0001));
 }
 let excursion=0;for(let t=0;t<3;t+=.05)excursion=Math.max(excursion,Math.abs(rollAt(2,.35,t)[0]-rollAt(2,.35,0)[0]));
 assert.ok(excursion>.4,'geometry must turn over visibly, not just relight a static cap');
});

test('crest-owned radius keeps the rolling front coordinate monotone through its toe',()=>{
 const compact=shaders.slice(shaders.indexOf('// GPU transects at the field-day crest'),shaders.indexOf('foam   *= fade;'));
 assert.match(compact,/float crestRelief = breakingRollAt\(xz0\.x, 0\.0, t\)\.x;/);
 assert.match(compact,/0\.82 \+ 0\.36\*crestRelief/);
 const depthFn=scalarHelper('breakingBodyDepth',['sourceX','relief','t']);
 for(const x of [-90,-30,0,14.9,60,90])for(const t of [0,.2,1.3,49.4,50.3,54]){
  let previous=0;
  // Unit crest radius isolates the coordinate mapping. The actual radius
  // follows local carrier amplitude too; only its rolling modulation is
  // held constant down this front. Full amplitude/joins use the GPU audit.
  for(let f=0;f<.8;f+=.0005){
   const relief=rollAt(x,f/.565,t)[0];
   const depth=depthFn(x,relief,t,...helpers);
   const q=clamp(f/depth,0,1),z=Math.sqrt(q*(2-q));
   assert.ok(z>=previous-1e-12,'rolling radius may not fold the attached front');
   previous=z;
  }
 }
});

test('rear compaction ends with the aerated rear support, before the dark choppy back join',()=>{
 const compact=shaders.slice(shaders.indexOf('// GPU transects at the field-day crest'),shaders.indexOf('foam   *= fade;'));
 assert.match(compact,/: 1\.0 - smoothstep\(0\.025, 0\.085, -bodyFrac\);/);
 assert.match(model,/1\.0 - smoothstep\(0\.025, 0\.085, -fracB\)/);
 for(const f of [-.5,-.38,-.24,-.085])assert.equal(1-smoothstep(.025,.085,-f),0);
 for(const f of [-.025,-.01,0])assert.equal(1-smoothstep(.025,.085,-f),1);
});

test('attached compaction shares one permission in both horizontal axes and retains toe slope',()=>{
 const compact=shaders.slice(shaders.indexOf('// GPU transects at the field-day crest'),shaders.indexOf('foam   *= fade;'));
 assert.match(compact,/off\.x = mix\(off\.x, 0\.0, compact\);/);
 assert.match(compact,/off\.y = mix\(off\.y, targetZ - xz0\.y, compact\);/);
 assert.match(compact,/0\.04\*\(xz0\.y - crestZ\)/);
 assert.ok(compact.indexOf('compact *= 1.0 - smoothstep(0.10, 0.30, curl)')<compact.indexOf('off.x = mix'));
 // Full numerical two-axis orientation is covered by the actual GPU audit;
 // this pins ownership so the two coordinates cannot silently diverge.
 assert.doesNotMatch(compact,/\bh\s*[+*\-/]?=/);
});
