// Attached aerated volumes. The canonical wave owns every station, surface,
// permission and age; this pass only gives its rolling front curved depth.
import { SURFACE_PRELUDE, SURFACE_GLSL } from './shaders.js';
import { BREAKING_FOAM_VOLUME_FRAG } from './breaking-foam-material.js';

export const BREAKING_FOAM_STATIONS = 768;
export const BREAKING_FOAM_COHORTS = 2;
const COUNT = BREAKING_FOAM_STATIONS * BREAKING_FOAM_COHORTS;

// Stable instance identity is shared by atlas and mesh. Both cohorts now
// traverse the full front independently; each vanishes before its own wrap.
export const BREAKING_FOAM_SHAPE_GLSL = `
float foamHash(float id,float salt){
  return fract(sin((id+0.5)*12.9898+salt*78.233)*43758.5453);
}
float foamSourceX(float id){
  float station=floor(id/2.0),cohort=mod(id,2.0);
  return -285.0+(station+0.5+(cohort-0.5)*0.30+(foamHash(id,1.0)-0.5)*0.64)*(570.0/768.0);
}
float foamArc(float cycle,float id){
  return fract(cycle/1.75+foamHash(id,2.0));
}
float foamTurn(float arc){
  return smoothstep(0.0,0.12,arc)*(1.0-smoothstep(0.82,1.0,arc));
}
vec3 foamAxes(float id){
  return vec3(1.25+0.85*foamHash(id,3.0),0.68+0.35*foamHash(id,4.0),0.75+0.45*foamHash(id,5.0));
}
void foamBasis(vec3 N,vec3 F,float id,float arc,out vec3 T,out vec3 Rn,out vec3 Rf){
  vec3 along=normalize(cross(N,F));
  float yaw=(foamHash(id,6.0)-0.5)*0.9;
  vec3 forward=F*cos(yaw)+along*sin(yaw);
  T=normalize(cross(N,forward));
  float rotation=arc*6.28318530718+foamHash(id,7.0)*6.28318530718;
  Rn=N*cos(rotation)+forward*sin(rotation);
  Rf=forward*cos(rotation)-N*sin(rotation);
}
`;

export const BREAKING_FOAM_STATE_FRAG = `${SURFACE_PRELUDE}
${SURFACE_GLSL}
${BREAKING_FOAM_SHAPE_GLSL}
layout(location=0) out vec4 foamCentre;
layout(location=1) out vec4 foamNormal;
layout(location=2) out vec4 foamFront;
float breakingFoamRetirement(float age,float period){
  return 1.0-smoothstep(0.75*period,0.98*period,max(age,0.0));
}
void main(){
  foamCentre=vec4(0.0);foamNormal=vec4(0.0,1.0,0.0,0.0);foamFront=vec4(0.0,0.0,1.0,0.0);
#ifdef BREAKING_BODY
  float id=floor(gl_FragCoord.x);
  float x=foamSourceX(id);
  // Stable spatial phase decorrelates the two rows without another clock.
  // Dividing by1.75 retains the former speed along the physical front.
  float arc=foamArc(breakingRollCycleAt(x*3.0,u_time),id);
  float turn=foamTurn(arc);
  if(turn<0.001||arc>=1.0)return;
  float zb=breakLine(x);
  float theta=2.0*PI*u_time/max(u_T,0.001)-rayPhase(vec2(x,zb));
  float targetPhase=rayPhase(vec2(x,zb))+mod(theta,2.0*PI);
  float crestLo=zb,crestHi=min(u_refrZ.y-coastCurve(x),zb+2.0*PI/max(kLocalAt(vec2(x,zb))*cos(swellPhi()),0.01));
  if(crestHi<=crestLo||targetPhase>rayPhase(vec2(x,crestHi)))return;
  for(int i=0;i<10;i++){
    float m=0.5*(crestLo+crestHi);
    if(rayPhase(vec2(x,m))<targetPhase)crestLo=m;else crestHi=m;
  }
  float crestZ=0.5*(crestLo+crestHi);
  float kz=max(kLocalAt(vec2(x,crestZ))*cos(swellPhi()),0.01);
  float lo=crestZ,hi=crestZ+1.2/kz;
  float wanted=0.04+0.49*arc;
  float age,frac,gain;
  // Invert the canonical front coordinate rather than cloning its pitch,
  // skew or section character. The bounded first quadrant is monotone.
  for(int i=0;i<8;i++){
    float mid=0.5*(lo+hi);vec2 q=vec2(x,mid);
    gain=boreWedgeAt(q,u_time,breakPermissionAt(q,u_time),age,frac);
    if(frac<wanted)lo=mid;else hi=mid;
  }
  vec2 source=vec2(x,0.5*(lo+hi));
  gain=boreWedgeAt(source,u_time,breakPermissionAt(source,u_time),age,frac);
  vec4 body=breakingBodyAt(x,frac,age,u_time);
  // Retire this bank before its next canonical crest replaces it. The next
  // bank starts with boreWedgeAt's zero birth gain; no old row pops away.
  float gate=breakingBodyEstablished(gain)*body.w*body.x*turn*min(u_bore,1.0)*farFadeAt(source)*breakingFoamRetirement(age,u_T);
  if(gate<0.002)return;
  float f,p,b,c,land,a,curl;
  vec3 P=surfacePos(source,u_time,f,p,b,c,land,a,curl);
  gate*=1.0-smoothstep(0.10,0.30,curl);
  if(land>0.5||gate<0.002)return;
  vec3 Px=surfacePos(source+vec2(0.12,0.0),u_time,f,p,b,c,land,a,curl);
  vec3 Pz=surfacePos(source+vec2(0.0,0.12),u_time,f,p,b,c,land,a,curl);
  float cf,cp,cb,cc,cl,ca,ck;
  vec3 Pc=surfacePos(vec2(x,crestZ),u_time,cf,cp,cb,cc,cl,ca,ck);
  float amp;float ignored=ocean(source,u_time,f,p,b,c,amp);
  float vis=max(VIS,0.001),range=2.0*amp/vis;
  vec3 tx=Px-P,tz=Pz-P;tx.y/=vis;tz.y/=vis;
  vec3 N=cross(tz,tx);N=length(N)>0.00001?normalize(N):vec3(0.0,1.0,0.0);
  if(N.y<0.0)N=-N;
  vec3 F=tz-N*dot(tz,N);F=length(F)>0.00001?normalize(F):vec3(0.0,0.0,1.0);
  if(F.z<0.0)F=-F;
  vec3 T,Rn,Rf;foamBasis(N,F,id,arc,T,Rn,Rf);
  vec3 axes=foamAxes(id);
  // Overlapping alongshore ellipsoids; curved front caps remain half buried.
  float radius=0.20*range*(0.65+0.65*foamHash(id,8.0))*gate;
  vec3 centre=P-N*(0.60*radius)*vec3(1.0,vis,1.0);
  // Exact maximum y of the rotated ellipsoid, not merely its centre.
  float extentY=sqrt(pow(axes.x*T.y,2.0)+pow(axes.y*Rn.y,2.0)+pow(axes.z*Rf.y,2.0));
  float ceiling=Pc.y;
  float ceilingBound=crestCeilM(vec2(x,crestZ));
  if(ceilingBound>=0.0)ceiling=min(ceiling,ceilingBound);
  radius=min(radius,max((ceiling-centre.y)/vis,0.0)/max(extentY,0.001));
  if(radius<0.005)return;
  if(!(dot(centre,centre)==dot(centre,centre)))return;
  foamCentre=vec4(centre,radius);
  foamNormal=vec4(N,gate);
  foamFront=vec4(F,arc);
#endif
}
`;

export const BREAKING_FOAM_VOLUME_VERT = `
uniform sampler2D u_foamCentre;
uniform sampler2D u_foamNormal;
uniform sampler2D u_foamFront;
uniform float u_vis;
attribute float aFoamInstance;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vFoam;
${BREAKING_FOAM_SHAPE_GLSL}
void main(){
  vec2 uv=vec2((aFoamInstance+0.5)/1536.0,0.5);
  vec4 C=texture2D(u_foamCentre,uv),N=texture2D(u_foamNormal,uv),F=texture2D(u_foamFront,uv);
  vLocal=position;vFoam=vec3(foamHash(aFoamInstance,0.0),F.w,N.w);
  vWorldPos=C.xyz;vNormal=vec3(0.0,1.0,0.0);
  if(C.w<0.005||N.w<0.002){gl_Position=vec4(0.0,0.0,2.0,1.0);return;}
  vec3 T,Rn,Rf;foamBasis(N.xyz,F.xyz,aFoamInstance,F.w,T,Rn,Rf);
  vec3 axes=foamAxes(aFoamInstance);
  vec3 offset=C.w*(T*(position.x*axes.x)+Rn*(position.y*axes.y)+Rf*(position.z*axes.z));
  offset.y*=u_vis;
  vec3 P=C.xyz+offset;
  vec3 normalP=T*(normal.x/axes.x)+Rn*(normal.y/axes.y)+Rf*(normal.z/axes.z);
  normalP.y/=max(u_vis,0.001);
  vNormal=normalize(normalP);vWorldPos=P;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(P,1.0);
}
`;

export function createBreakingFoamVolume(THREE, uniforms, defines = {}) {
  if (!defines.BREAKING_BODY) throw new Error('Attached foam volume requires BREAKING_BODY');
  const stateTarget = new THREE.WebGLRenderTarget(COUNT, 1, {
    count:3,type:THREE.FloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,
    depthBuffer:false,stencilBuffer:false,generateMipmaps:false,
  });
  const stateMaterial = new THREE.ShaderMaterial({
    glslVersion:THREE.GLSL3,defines:{...defines},uniforms,
    vertexShader:'void main(){gl_Position=vec4(position.xy*2.0,0.0,1.0);}',
    fragmentShader:BREAKING_FOAM_STATE_FRAG,depthTest:false,depthWrite:false,
  });
  const quadGeometry=new THREE.PlaneGeometry(1,1);
  const stateScene=new THREE.Scene();stateScene.add(new THREE.Mesh(quadGeometry,stateMaterial));
  const stateCamera=new THREE.Camera();
  const sphere=new THREE.SphereGeometry(1,12,8),geometry=new THREE.InstancedBufferGeometry();
  geometry.index=sphere.index;
  for(const name of ['position','normal'])geometry.setAttribute(name,sphere.getAttribute(name));
  const ids=Float32Array.from({length:COUNT},(_,i)=>i);
  geometry.setAttribute('aFoamInstance',new THREE.InstancedBufferAttribute(ids,1));
  geometry.instanceCount=COUNT;
  const material=new THREE.ShaderMaterial({
    uniforms:{...uniforms,u_foamCentre:{value:stateTarget.textures[0]},u_foamNormal:{value:stateTarget.textures[1]},u_foamFront:{value:stateTarget.textures[2]}},
    vertexShader:BREAKING_FOAM_VOLUME_VERT,fragmentShader:BREAKING_FOAM_VOLUME_FRAG,
    transparent:false,depthWrite:true,depthTest:true,side:THREE.FrontSide,
  });
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.name='attached-breaking-foam';
  const viewport=new THREE.Vector4(),scissor=new THREE.Vector4();
  let updates=0,disposed=false,lastTime=null;
  function update(renderer){
    if(disposed||!mesh.visible)return;
    const previousTarget=renderer.getRenderTarget(),previousViewport=renderer.getViewport(viewport).clone();
    const previousScissor=renderer.getScissor(scissor).clone(),previousScissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear;
    try{
      renderer.setRenderTarget(stateTarget);renderer.setViewport(0,0,COUNT,1);renderer.setScissorTest(false);renderer.autoClear=true;
      renderer.render(stateScene,stateCamera);updates++;lastTime=uniforms.u_time.value;
    }finally{
      renderer.setRenderTarget(previousTarget);renderer.setViewport(previousViewport);renderer.setScissor(previousScissor);renderer.setScissorTest(previousScissorTest);renderer.autoClear=autoClear;
    }
  }
  function dispose(){if(disposed)return;disposed=true;stateTarget.dispose();stateMaterial.dispose();quadGeometry.dispose();geometry.dispose();sphere.dispose();material.dispose();}
  return {mesh,update,dispose,stateTarget,diagnostics:()=>({instances:COUNT,stations:BREAKING_FOAM_STATIONS,cohorts:BREAKING_FOAM_COHORTS,verticesPerInstance:sphere.getAttribute('position').count,trianglesPerInstance:sphere.index.count/3,updates,lastTime,visible:mesh.visible,disposed,clock:'canonical bore + shared breakingRollCycleAt',attachment:'canonical surfacePos; centre embedded0.60radius; full ellipsoid crest cap'})};
}
