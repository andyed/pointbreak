// Classic-wave experiment instrument. See docs/research/CLASSIC_WAVE_PROGRESS_2026-09-15.md.
// Usage: node scripts/capture_classic_field_context.mjs [outdir]; BASE_URL defaults to http://127.0.0.1:8127.
const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname,
].filter(Boolean);
let chromium;
for (const candidate of PW_CANDIDATES) {
  try { ({ chromium } = await import(candidate)); break; } catch { /* next */ }
}
if (!chromium) {
  console.error('playwright not found. Set PLAYWRIGHT_DIR=/path/to/playwright/index.mjs');
  process.exit(1);
}
import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { resolve, sep } from 'node:path';
const out=resolve(process.argv[2] || 'qa/classic-motion-2026-09-15') + sep;
mkdirSync(out,{recursive:true});
const base=process.env.BASE_URL || 'http://127.0.0.1:8127';
const browser=await chromium.launch({args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const hash='preset=secondpeak&cam=cliff&day=big&h0=1.4&tide=0.732&controls=0&q=high&speed=0&classic=1&sim=48';
await page.goto(base+'/web-three/#'+hash);
await page.waitForFunction(()=>window.__pointbreak?.uniforms?.u_time?.value===48);
await page.waitForTimeout(1400);
const frames=[];
for(const t of [42,48,54,58]){
 for(const flag of [0,1]){
  const state=await page.evaluate(async ({t,flag})=>{
   const p=window.__pointbreak;p.uniforms.u_classicWave.value=flag;p.setSim(t);
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   return {state:p.state,sim:p.sim(),camera:p.camera.position.toArray(),target:p.controls.target.toArray(),flag:p.uniforms.u_classicWave.value};
  },{t,flag});
  assert.equal(state.state.T,17);assert.equal(state.state.H0,1.4);assert.equal(state.state.tide,.732);assert.equal(state.flag,flag);
  const path=`field-context-${flag}-${t}.jpg`;
  await page.screenshot({path:out+path,type:'jpeg',quality:90});frames.push({path,...state});
 }
}
await browser.close();writeFileSync(out+'field-context.json',JSON.stringify({hash,frames,errors},null,2));assert.equal(errors.length,0);
console.log('8 field-context frames, exact 17 s / H0 1.4 / tide .732 forcing verified.');
