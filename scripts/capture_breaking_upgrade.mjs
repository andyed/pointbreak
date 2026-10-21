// Reproducible temporal stills, not an authored video. Frozen model clocks are
// sampled in order at 10 Hz; metadata checks camera, forcing, scale and errors.
// node scripts/capture_breaking_upgrade.mjs --arms=default
// node scripts/capture_breaking_upgrade.mjs --arms=breaking
// Optional --scenes=field,section,sharks --step=0.1 --base=http://127.0.0.1:8127
import { chromium } from '../../psychodeli-webgl-port/node_modules/playwright/index.mjs';
import pngjs from '../../psychodeli-webgl-port/node_modules/pngjs/lib/png.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
const { PNG } = pngjs;
const args = Object.fromEntries(process.argv.slice(2).map(a => { const i=a.indexOf('='); return [a.slice(2,i<0?undefined:i),i<0?'1':a.slice(i+1)]; }));
const root = resolve(new URL('..', import.meta.url).pathname);
const out = resolve(args.out || join(root,'qa/breaking-upgrade-2026-10-20/validation'));
const base = args.base || 'http://127.0.0.1:8127';
const step = Number(args.step || 0.1);
const sourceFiles=['shared/model-glsl.js','web-three/js/shaders.js','web-three/js/main.js','web-three/js/url-params.js','web-three/js/surface-query.js','web-three/js/whitewater-material.js','web-three/js/breaking-foam-volume.js','web-three/js/breaking-foam-material.js'];
const snapshotRoot=args['source-snapshot']?resolve(args['source-snapshot']):null;
const localFiles=args['local-files']==='1';
const gridMultiplier=Number(args['grid-multiplier']||1);
if(![1,2].includes(gridMultiplier))throw new Error('grid multiplier must be1 or2');
if (!(step > 0 && step <= 1)) throw new Error('step must be >0 and <=1 second');
const scenes = {
  field: { preset:'secondpeak', cam:'cliff', forcing:'day=overhead&h0=1.4&tide=0.500', start:52, end:56 },
  section: { preset:'secondpeak', cam:'free', forcing:'', start:49.2, end:50.6, eye:[79,11,-68], target:[15,4,-108] },
  detail: { preset:'secondpeak', cam:'free', forcing:'', start:49.2, end:50.6, eye:[37,4.8,-87], target:[15,1.3,-108] },
  medium: { preset:'secondpeak', cam:'free', forcing:'', start:49.2, end:50.6, eye:[59,8.3,-66], target:[15,1.3,-108], fov:40 },
  reference: { preset:'secondpeak', cam:'free', forcing:'', start:49.2, end:50.6, eye:[15,8,-48], target:[15,1.3,-108], fov:40 },
  mature: { preset:'secondpeak', cam:'free', forcing:'day=overhead&h0=1.4&tide=0.500', start:52, end:56, eye:[24,4.8,-71], target:[0,0.8,-96], fov:40 },
  sharks: { preset:'sharks', cam:'cliff', forcing:'', start:52, end:54 },
};
const arms = { previous:'breaking=1', default:'', breaking:'breaking=1', curtainoff:'breaking=1', volumeoff:'breaking=1', hollows:'breaking=1', legacy:'bore=1&sectioncurl=1&gapfix=1', bore:'bore=1', off:'breaking=0' };
const selectedScenes=(args.scenes || 'field,section,sharks').split(',');
const selectedArms=(args.arms || 'default,breaking').split(',');
for (const s of selectedScenes) if(!scenes[s]) throw new Error(`unknown scene ${s}`);
if(selectedArms.includes('previous')&&!snapshotRoot)throw new Error('previous arm requires --source-snapshot=path');
for (const a of selectedArms) if(!(a in arms)) throw new Error(`unknown arm ${a}`);
mkdirSync(join(out,'frames'),{recursive:true});
const manifestPath=join(out,'manifest.json');
const manifest=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):{description:'Deterministic render still sequences; per-frame sim values define sampling. Pixel differences establish motion/change, never fidelity.',viewport:{width:Number(args.width||1200),height:Number(args.height||750)},deviceScaleFactor:1,scenes:{}};
const sourceHashes=(dir=root)=>Object.fromEntries(sourceFiles.filter(p=>existsSync(join(dir,p))).map(p=>[p,createHash('sha256').update(readFileSync(join(dir,p))).digest('hex')]));
if((args.width&&manifest.viewport.width!==Number(args.width))||(args.height&&manifest.viewport.height!==Number(args.height)))throw new Error('Use a new output directory when changing viewport resolution');
const mime={'.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.wasm':'application/wasm'};
const touched = {};
const persist=()=>{const disk=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):manifest;for(const [scene,arms] of Object.entries(touched)){disk.scenes[scene]??={};Object.assign(disk.scenes[scene],arms);}writeFileSync(manifestPath,JSON.stringify(disk,null,2)+'\n');};
const pixelDifference=(a,b)=>{
 let abs=0,changed=0; for(let p=0;p<a.data.length;p+=4){ let d=0;for(let c=0;c<3;c++)d+=Math.abs(a.data[p+c]-b.data[p+c]);abs+=d;if(d>0)changed++; }
 return {meanAbsoluteRgbDifference:abs/(a.width*a.height*3),changedPixelFraction:changed/(a.width*a.height)};
};
const browser=await chromium.launch({args:['--use-angle=metal']});
try {
 for(const sceneName of selectedScenes) for(const arm of selectedArms){
  const scene={...scenes[sceneName],...(args.sim0?{start:Number(args.sim0)}:{}),...(args.sim1?{end:Number(args.sim1)}:{})}; const context=await browser.newContext({viewport:manifest.viewport,deviceScaleFactor:1});
  const page=await context.newPage(); const errors=[]; const requests=[];
  const servedRoot=arm==='previous'?snapshotRoot:root;
  const files=new Map(sourceFiles.filter(p=>existsSync(join(servedRoot,p))).map(p=>['/'+p,readFileSync(join(servedRoot,p))]));
  if(arm==='hollows'){
    const from='float shoulder = min(body.y*(0.10 + 0.20*body.z),\n                       0.72*max(fracB, 0.0));';
    const original=files.get('/shared/model-glsl.js').toString();if(!original.includes(from))throw new Error('Hollow diagnostic source contract changed');
    files.set('/shared/model-glsl.js',Buffer.from(original.replace(from,'float shoulder = -0.20*body.y*(1.0 - body.z);')));
    writeFileSync(join(out,'served-model-hollows.mjs'),files.get('/shared/model-glsl.js'));
  }
  if(gridMultiplier!==1){
    const injection=`\n// Validation-only density diagnostic; no production file changed.\n{const old=waterMesh.geometry;SEG_X*=${gridMultiplier};SEG_Z*=${gridMultiplier};waterMesh.geometry=makeWaterGeometry(SEG_X,SEG_Z);geo=waterMesh.geometry;uniforms.u_cell.value.divideScalar(${gridMultiplier});old.dispose();}\n`;
    files.set('/web-three/js/main.js',Buffer.from(files.get('/web-three/js/main.js').toString()+injection));
    writeFileSync(join(out,`served-main-${arm}-grid${gridMultiplier}.mjs`),files.get('/web-three/js/main.js'));
  }
  if(args['volume-state']==='1'){
    const probeCode=`
// Validation-only readback of the real MRT attachments; no model replica.
window.__pointbreak.__readFoamAtlas=()=>{
 const v=breakingFoamVolume;if(!v||!v.mesh.visible)return null;const rt=v.stateTarget,gl=renderer.getContext(),prev=renderer.getRenderTarget(),oldRead=gl.getParameter(gl.READ_BUFFER),buffers=[];
 try{renderer.setRenderTarget(rt);for(let i=0;i<3;i++){const b=new Float32Array(rt.width*4);gl.readBuffer(gl.COLOR_ATTACHMENT0+i);gl.readPixels(0,0,rt.width,1,gl.RGBA,gl.FLOAT,b);buffers.push(b);}gl.readBuffer(gl.COLOR_ATTACHMENT0);}finally{renderer.setRenderTarget(prev);gl.readBuffer(oldRead);}
 return buffers;
};
window.__pointbreak.__readFoamState=()=>{
 const buffers=window.__pointbreak.__readFoamAtlas();if(!buffers)return null;const rt=breakingFoamVolume.stateTarget,gl=renderer.getContext();
 let active=0,finite=true,minRadius=Infinity,maxRadius=0,maxNormalError=0,maxTangentError=0;const bounds=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
 for(let i=0;i<rt.width;i++){const k=4*i;for(const b of buffers)for(let c=0;c<4;c++)finite=finite&&Number.isFinite(b[k+c]);const C=buffers[0],N=buffers[1],F=buffers[2];if(C[k+3]<.005||N[k+3]<.002)continue;active++;minRadius=Math.min(minRadius,C[k+3]);maxRadius=Math.max(maxRadius,C[k+3]);for(let c=0;c<3;c++){bounds[0][c]=Math.min(bounds[0][c],C[k+c]);bounds[1][c]=Math.max(bounds[1][c],C[k+c]);}maxNormalError=Math.max(maxNormalError,Math.abs(Math.hypot(N[k],N[k+1],N[k+2])-1));maxTangentError=Math.max(maxTangentError,Math.abs(N[k]*F[k]+N[k+1]*F[k+1]+N[k+2]*F[k+2]));}
 return {activeInstances:active,totalInstances:rt.width,finite,radiusRange:active?[minRadius,maxRadius]:null,centreBounds:active?bounds:null,maxNormalError,maxTangentError,glError:gl.getError()};
};
`;
    files.set('/web-three/js/main.js',Buffer.from(files.get('/web-three/js/main.js').toString()+probeCode));
  }
  if(args['save-sources']==='1')for(const [p,b]of files){const dest=join(out,'sources',arm,p.slice(1));mkdirSync(resolve(dest,'..'),{recursive:true});writeFileSync(dest,b);}
  if(localFiles||arm==='previous'||arm==='hollows'||gridMultiplier!==1||args['volume-state']==='1')await context.route('**/*',async route=>{
    const u=new URL(route.request().url());if(u.origin!==new URL(base).origin)return route.continue();
    let pathname=decodeURIComponent(u.pathname);if(pathname.endsWith('/'))pathname+='index.html';
    const file=resolve(root,'.'+pathname);if(!file.startsWith(root+sep))return route.continue();
    if(!files.has(pathname)&&localFiles&&existsSync(file)&&statSync(file).isFile())files.set(pathname,readFileSync(file));
    if(!files.has(pathname))return route.continue();
    return route.fulfill({status:200,body:files.get(pathname),contentType:mime[extname(file)]||'application/octet-stream',headers:{'cache-control':'no-store, must-revalidate'}});
  });
  page.on('pageerror',e=>errors.push({type:'pageerror',message:String(e)}));
  page.on('console',m=>{if(m.type()==='error')errors.push({type:'console',message:m.text()});});
  page.on('requestfailed',r=>requests.push({url:r.url(),error:r.failure()?.errorText}));
  const hash=[`preset=${scene.preset}`,`cam=${scene.cam}`,scene.forcing,'surfer=0','hud=0','controls=0','q=high','speed=0',`sim=${scene.start}`,'vis=1',arms[arm]].filter(Boolean).join('&');
  const url=`${base}/web-three/#${hash}`;
  const record={url,scene:sceneName,arm,startedAt:new Date().toISOString(),sourceHashes:Object.fromEntries([...files.entries()].map(([p,b])=>[p.slice(1),createHash('sha256').update(b).digest('hex')])),sourceHashesOnDiskAtStart:sourceHashes(servedRoot),sourceSnapshot:arm==='previous'?snapshotRoot:null,gridMultiplier,volumeStateReadback:args['volume-state']==='1',localFiles,frames:[],errors,failedRequests:requests,navigationRetries:0};
  let ready=false;
  for(let attempt=0;attempt<4;attempt++){
   try{await page.goto('about:blank');await page.goto(url,{waitUntil:'load',timeout:30000});await page.waitForFunction(()=>window.__pointbreak?.uniforms && document.querySelector('canvas')?.width>0,null,{timeout:15000});ready=true;record.navigationRetries=attempt;break;}
   catch(e){if(attempt===3)throw e;}
  }
  if(!ready)throw new Error('renderer not ready');
  const navigationErrors=errors.splice(0);record.navigationErrors=navigationErrors;
  if(navigationErrors.some(e=>/shader|program|GL_INVALID|WebGL/i.test(e.message))) throw new Error(JSON.stringify(navigationErrors));
  if(arm==='volumeoff')await page.evaluate(()=>window.__pointbreak.setBreakingFoam(false));
  if(arm==='curtainoff')await page.evaluate(()=>window.__pointbreak.setCurtain(false));
  if(scene.eye)await page.evaluate(({eye,target,fov})=>{const p=window.__pointbreak;p.setView(eye,target);if(fov){p.camera.fov=fov;p.camera.updateProjectionMatrix();}},scene);
  let previous=null;
  for(let i=0;i<=Math.round((scene.end-scene.start)/step);i++){
   const sim=+(scene.start+i*step).toFixed(6);
   const probe=await page.evaluate(async sim=>{
    const pb=window.__pointbreak;pb.setSim(sim);for(let n=0;n<4;n++)await new Promise(requestAnimationFrame);
    const u=pb.uniforms;
    return {clock:pb.sim(),uniformClock:u.u_time.value,eye:pb.camera.position.toArray(),target:pb.controls.target.toArray(),fov:pb.camera.fov,forcing:{preset:pb.state.preset,H0:u.u_H0.value,T:u.u_T.value,tide:pb.state.tide},vis:u.u_vis.value,cell:u.u_cell.value.toArray(),bore:u.u_bore.value,sectionCurl:u.u_sectionCurl.value,gapFix:u.u_gapFix.value,breakingBody:pb.breakingBuild ?? null,breakingFoam:pb.breakingFoamVolume?.diagnostics?.()??null,breakingFoamState:pb.__readFoamState?.()??null};
   },sim);
   if(Math.abs(probe.clock-sim)>1e-6||Math.abs(probe.uniformClock-sim)>1e-5||probe.vis!==1||probe.forcing.preset!==scene.preset)throw new Error('time/scale/preset mismatch '+JSON.stringify(probe));
   if((arm==='breaking'||arm==='previous'||arm==='curtainoff'||arm==='hollows'||arm==='volumeoff') && (probe.bore<=0||probe.sectionCurl<=0||probe.gapFix<=0))throw new Error('breaking feature bundle not active '+JSON.stringify(probe));
   if(args['require-volume']==='1'){if(!probe.breakingFoam||probe.breakingFoam.disposed||probe.breakingFoam.visible!==(arm!=='volumeoff'))throw new Error('Attached volume state mismatch '+JSON.stringify(probe));if(probe.breakingFoam.visible&&Math.abs(probe.breakingFoam.lastTime-sim)>1e-5)throw new Error('Attached volume clock mismatch');}
   if(probe.breakingFoamState&&(!probe.breakingFoamState.finite||probe.breakingFoamState.glError!==0||probe.breakingFoamState.maxNormalError>0.001||probe.breakingFoamState.maxTangentError>0.001))throw new Error('Invalid volume MRT state '+JSON.stringify(probe.breakingFoamState));
   const pose={eye:probe.eye,target:probe.target,fov:probe.fov,forcing:probe.forcing,vis:probe.vis,cell:probe.cell};
   if(!record.pose)record.pose=pose;
   if(JSON.stringify(record.pose)!==JSON.stringify(pose))throw new Error('pose or forcing drift within '+sceneName+' '+arm);
   const referenceArm=manifest.scenes[sceneName]?.volumeoff?'volumeoff':manifest.scenes[sceneName]?.previous?'previous':manifest.scenes[sceneName]?.default?'default':'breaking';
   const sibling=manifest.scenes[sceneName]?.[referenceArm]?.pose;
   if(sibling && JSON.stringify(sibling)!==JSON.stringify(pose))throw new Error('matched baseline pose/forcing mismatch '+sceneName+' '+arm);
   const file=`frames/${sceneName}_${arm}_${sim.toFixed(2).replace('.','p')}.png`;
   const priorData=existsSync(join(out,file))?readFileSync(join(out,file)):null;
   const data=await page.screenshot({path:join(out,file)});
   const decoded=PNG.sync.read(data); const motion=previous?pixelDifference(previous,decoded):null;
   if(motion && motion.changedPixelFraction===0)throw new Error('frozen temporal sequence '+file);
   let baselineDifference=null;const baselineFrame=manifest.scenes[sceneName]?.[referenceArm]?.frames.find(f=>f.sim===sim);
   if(arm!==referenceArm && baselineFrame)baselineDifference=pixelDifference(PNG.sync.read(readFileSync(join(out,baselineFrame.file))),decoded);
   const priorCaptureDifference=priorData?pixelDifference(PNG.sync.read(priorData),decoded):null;
   record.frames.push({sim,file,sourceHashesOnDisk:sourceHashes(servedRoot),...probe,motion,baselineDifference,priorCaptureDifference});previous=decoded;
   if(i%10===0)console.log(`${sceneName}/${arm} ${sim}`);
  }
  if(args['seek-check']==='1'&&arm!=='volumeoff'){
   record.seekDeterminism=await page.evaluate(async({time,period})=>{
    const pb=window.__pointbreak;if(!pb.__readFoamAtlas)throw new Error('seek-check requires volume-state=1');
    const sample=async t=>{pb.setSim(t);for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);return pb.__readFoamAtlas();};
    const first=await sample(time);await sample(time+period+.125);const restored=await sample(time);
    let mismatches=0,maxAbsoluteDifference=0,values=0;for(let a=0;a<first.length;a++)for(let i=0;i<first[a].length;i++){values++;if(first[a][i]!==restored[a][i])mismatches++;maxAbsoluteDifference=Math.max(maxAbsoluteDifference,Math.abs(first[a][i]-restored[a][i]));}
    return{time,hopTime:time+period+.125,attachments:first.length,values,mismatches,maxAbsoluteDifference};
   },{time:record.frames[Math.floor(record.frames.length/2)].sim,period:record.frames[0].forcing.T});
   if(record.seekDeterminism.mismatches)throw new Error('Volume seek changed GPU state '+JSON.stringify(record.seekDeterminism));
  }
  record.sourceHashesAfter=sourceHashes(servedRoot);record.interceptedFileCount=files.size;record.sourceChangedDuringCapture=JSON.stringify(record.sourceHashesOnDiskAtStart)!==JSON.stringify(record.sourceHashesAfter);
  record.finishedAt=new Date().toISOString();
  manifest.scenes[sceneName]??={};manifest.scenes[sceneName][arm]=record;touched[sceneName]??={};touched[sceneName][arm]=record;persist();
  if(errors.length)throw new Error('render errors '+JSON.stringify(errors));
  await context.close(); console.log(`PASS ${sceneName}/${arm}: ${record.frames.length} frames, matched clock/pose/forcing, no render errors`);
 }
} finally{await browser.close();persist();}
