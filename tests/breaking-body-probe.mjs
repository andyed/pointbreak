// Manual GPU integration probe; run with node tests/breaking-body-probe.mjs.
// Requires the local renderer server and sibling Playwright installation.
import { chromium } from '../../psychodeli-webgl-port/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const BASE=process.env.BASE_URL||'http://127.0.0.1:8127';
const OUT=process.env.OUT||'/tmp/breaking-body-verification';mkdirSync(OUT,{recursive:true});
const b=await chromium.launch({args:['--use-angle=metal']}),page=await b.newPage({viewport:{width:1440,height:900}});page.on('console',m=>{if(m.type()==='error')console.log(m.text())});
const main=await(await fetch(BASE+'/web-three/js/main.js')).text();await page.route('**/web-three/js/main.js',r=>r.fulfill({body:main.replace('camera, controls, state, surferGroup, sprayPoints, uniforms,','camera, controls, state, surferGroup, sprayPoints, uniforms, renderer,'),contentType:'application/javascript'}));
await page.goto(BASE+'/web-three/#preset=secondpeak&cam=cliff&day=overhead&h0=1.4&tide=.500&controls=0&q=high&speed=0&sim=54&vis=1&breaking=1');for(let i=0;i<4;i++){try{await page.waitForFunction(()=>window.__pointbreak?.uniforms,null,{timeout:15000});break}catch(e){if(i===3)throw e;await page.reload()}}
const rows=await page.evaluate(async()=>{
const THREE=await import('/web-three/vendor/three.module.js'),{SURFACE_PRELUDE,SURFACE_GLSL}=await import('/web-three/js/shaders.js'),p=__pointbreak;
const mat=new THREE.ShaderMaterial({defines:{BORE:1,BREAKING_BODY:1,GAP_FIX:1,SECTION_CURL:1},uniforms:{...p.uniforms,u_x:{value:0}},vertexShader:'void main(){gl_Position=vec4(position.xy*2.,0.,1.);}',fragmentShader:SURFACE_PRELUDE+SURFACE_GLSL+`\nuniform float u_x;void main(){float z=breakLine(u_x)-10.+100.*(gl_FragCoord.x-.5)/511.;vec2 q=vec2(u_x,z);float f,pk,br,c,l,a,cu,amp;vec3 P=surfacePos(q,u_time,f,pk,br,c,l,a,cu);float h=ocean(q,u_time,f,pk,br,c,amp);float age,frac;float g=boreWedgeAt(q,u_time,breakPermissionAt(q,u_time),age,frac);if(gl_FragCoord.y<1.)gl_FragColor=vec4(P.y,P.z,h,f);else if(gl_FragCoord.y<2.)gl_FragColor=vec4(age,frac,g,amp);else gl_FragColor=vec4(z,pk,cu,crestCeilM(q));}`});
const scene=new THREE.Scene().add(new THREE.Mesh(new THREE.PlaneGeometry(1,1),mat)),cam=new THREE.Camera(),rt=new THREE.WebGLRenderTarget(512,3,{type:THREE.FloatType,depthBuffer:false}),out=[];
for(const [arm,vals]of Object.entries({normal:{},sapp0:{u_sApp:0},earn0:{u_earn:0},body0:{u_bore:0}})){const save={};for(const[k,v]of Object.entries(vals)){save[k]=p.uniforms[k].value;p.uniforms[k].value=v}for(const x of [-90,-60,-30,0,30,60,90]){mat.uniforms.u_x.value=x;p.renderer.setRenderTarget(rt);p.renderer.render(scene,cam);const f=new Float32Array(512*3*4);p.renderer.readRenderTargetPixels(rt,0,0,512,3,f);out.push({arm,x,data:Array.from(f)})}for(const[k,v]of Object.entries(save))p.uniforms[k].value=v}p.renderer.setRenderTarget(null);return out});writeFileSync(OUT+'/transects.json',JSON.stringify(rows));
const checks=[];
for(const row of rows.filter(r=>r.arm==='normal')){
 const a=row.data;let lowerJoinReversals=0,minStep=Infinity;
 for(let i=0;i<511;i++){
  const step=a[(i+1)*4+1]-a[i*4+1];
  const frac=a[512*4+i*4+1],gain=a[512*4+i*4+2];
  minStep=Math.min(minStep,step);
  if(gain>.1&&frac>.65&&step<-.002)lowerJoinReversals++;
 }
 assert.ok(a.every(Number.isFinite),'finite GPU output');
 assert.equal(lowerJoinReversals,0,'lower join may not reactivate and reverse the mesh');
 checks.push({x:row.x,minStep,lowerJoinReversals});
}
const hashes={};for(const path of ['shared/model-glsl.js','web-three/js/shaders.js','web-three/js/main.js'])hashes[path]=createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex');
writeFileSync(OUT+'/checks.json',JSON.stringify({checks,hashes,rig:{preset:'secondpeak',sim:54,H0:1.4,T:16,tide:.5,vis:1}},null,2));console.log(JSON.stringify(checks));
for(const sapp of [.42,.22,0]){await page.evaluate(async s=>{__pointbreak.uniforms.u_sApp.value=s;for(let i=0;i<4;i++)await new Promise(requestAnimationFrame)},sapp);await page.screenshot({path:OUT+'/sapp-'+sapp+'.png'})}await b.close();console.log('done');
