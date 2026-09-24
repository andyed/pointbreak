// Classic-wave experiment instrument. See docs/research/CLASSIC_WAVE_PROGRESS_2026-09-15.md.
// Usage: node scripts/measure_classic_wave.mjs [outdir]; BASE_URL defaults to http://127.0.0.1:8127.
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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

import { resolve, sep } from 'node:path';
const out = resolve(process.argv[2] || 'qa/classic-motion-2026-09-15') + sep;
const base = process.env.BASE_URL || 'http://127.0.0.1:8127';
const source = readFileSync(new URL('../web-three/js/shaders.js', import.meta.url), 'utf8');
const start = source.indexOf('  // The classic bend needs a coherent shoulder');
const end = source.indexOf('  // Structural face anatomy.', start);
assert(start > 0 && end > start);
const first = source.slice(0, start) + source.slice(end);
const arms = [
  { name: 'default', flag: 0, source },
  { name: 'first-classic', flag: 1, source: first },
  { name: 'revised-classic', flag: 1, source },
];
const xs = [-84, -68, -52, -36, -20, -4, 12];
const times = Array.from({ length: 65 }, (_, i) => 40 + i * 0.25);
const rows = [], frames = [], traces = {}, errors = [];
const hash = 'preset=sewers&cam=cliff&month=card&h0=2.20&speed=0&sim=40&q=high&controls=0';
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 625 }, deviceScaleFactor: 1 });
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

for (const arm of arms) {
  mkdirSync(out + arm.name, { recursive: true });
  await page.unrouteAll();
  await page.route('**/web-three/js/shaders.js', r => r.fulfill({ body: arm.source, contentType: 'application/javascript' }));
  await page.goto('about:blank');
  await page.goto(`${base}/web-three/#${hash}&classic=${arm.flag}`);
  await page.waitForFunction(() => window.__pointbreak?.uniforms?.u_time?.value === 40);
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const p = window.__pointbreak;
    p.controls.dispatchEvent({ type: 'start' });
    p.setView([12, 11, -190], [-52, 4, -229]);
  });
  for (const t of times) {
    await page.evaluate(async t => {
      window.__pointbreak.setSim(t);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, t);
    const data = await page.evaluate(({ t, xs }) => {
      const p = window.__pointbreak;
      if (Math.abs(p.uniforms.u_time.value - t) > 1e-5) throw new Error('clock mismatch');
      const line = p.lineProbe(1);
      const rows = [], traces = [];
      for (const x of xs) {
        const near = line.reduce((a, b) => Math.abs(a.x-x) < Math.abs(b.x-x) ? a : b);
        const s = p.curlProbe(x, near.z - 55, near.z + 45, 512);
        const wet = s.filter(a => a.land < .5);
        if (!wet.length) continue;
        const pock = wet.reduce((a,b) => a.pocket > b.pocket ? a : b);
        const active = pock.pocket >= .5 && pock.breakMask >= .5;
        const crown = wet.filter(a => Math.abs(a.z0 - pock.z0) <= 25);
        const apex = crown.reduce((a,b) => a.y > b.y ? a : b);
        let fold = 0, stray = 0, upperFold = 0, flatFold = 0, runs = [], run = null;
        for (let i=1; i<s.length; i++) {
          const a=s[i-1],b=s[i],dz=b.z-a.z,dy=b.y-a.y;
          if (a.land<.5 && b.land<.5 && dz < -1e-5) {
            fold += -dz;
            const inCrown = Math.abs(b.z0 - pock.z0) <= 25;
            if (!inCrown || Math.max(a.curl,b.curl)<.1) stray += -dz;
            if (inCrown && Math.max(a.y,b.y) > .35*b.ceil) {
              upperFold += -dz;
              if (Math.abs(dy) < .15*Math.abs(dz)) flatFold += -dz;
              run ??= { reach:0, drop:0, ylo:a.y, yhi:a.y, curl:0, z0:a.z0 };
              run.reach += -dz;
              run.drop += Math.max(-dy,0);
              run.ylo=Math.min(run.ylo,b.y);run.yhi=Math.max(run.yhi,b.y);
              run.curl=Math.max(run.curl,a.curl,b.curl);
            } else if (run) { runs.push(run); run=null; }
          } else if (run) { runs.push(run); run=null; }
        }
        if (run) runs.push(run);
        runs = runs.filter(r => r.reach>.02);
        const best = runs.reduce((a,b) => b.reach>a.reach?b:a, {reach:0,drop:0,ylo:0,yhi:0,curl:0});
        rows.push({ t,x,active,pocket:pock.pocket,curl:Math.max(...wet.map(a=>a.curl))*180,
          crest:apex.y,fold,stray,upperFold,flatFold,runs:runs.length,
          reach:best.reach,drop:best.drop,extent:best.yhi-best.ylo,
          dropReach:best.reach>.05?best.drop/best.reach:null,
          // Projected reach/cell spacing is NOT the number of source-grid intervals.
          projectedReachPerCell:best.reach/p.uniforms.u_cell.value.y });
        if (x===-52 && (t===48 || t===48.5 || t===49)) traces.push({t,x,s:s.map(a=>({z0:a.z0,z:a.z,y:a.y,curl:a.curl,pocket:a.pocket,ceil:a.ceil,land:a.land}))});
      }
      return {rows,traces,sim:p.sim(),flag:p.uniforms.u_classicWave.value,cell:p.uniforms.u_cell.value.toArray(),camera:p.camera.position.toArray(),target:p.controls.target.toArray(),state:p.state};
    }, {t,xs});
    assert.equal(data.flag,arm.flag);
    rows.push(...data.rows.map(r=>({arm:arm.name,...r})));
    traces[arm.name] ??=[];traces[arm.name].push(...data.traces);
    if (Number.isInteger(t)) {
      const path = `${arm.name}/t${t}.jpg`;
      await page.screenshot({path:out+path,type:'jpeg',quality:88});
      frames.push({arm:arm.name,t,path,sim:data.sim,camera:data.camera,target:data.target,cell:data.cell,state:data.state});
    }
    if (t%4===0) console.log(arm.name,t);
  }
}
await browser.close();
writeFileSync(out+'motion.json',JSON.stringify({
  protocol:{hash,times,xs,n:512,viewport:[1000,625],notes:'GPU surface transects; reverse z travel is a projected fold measure, not proof of 3D self-intersection. Active rows use pocket>=0.5 and section breakMask>=0.5. 16 seconds, about one carrier; no set-cadence inference.'},
  sources:arms.map(a=>({arm:a.name,classic:a.flag,sha256:createHash('sha256').update(a.source).digest('hex')})),rows,frames,traces,errors
},null,2));
assert.equal(errors.length,0);
console.log('Complete',rows.length,'transects',frames.length,'frames');
