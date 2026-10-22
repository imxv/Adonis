import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

export interface OliveMaterials { bark: THREE.Material; barkDark: THREE.Material; foliage: THREE.Material }
export interface OliveOptions { quality: 'low' | 'high'; seed?: number; variant?: number; materials: OliveMaterials }
type Point = [number, number, number];
interface Limb { points: Point[]; radii: number[]; twist: number; lobes?: number; hollow?: boolean; rootCollar?: boolean; rootProfile?:'elder-directed'; rootFlow?:boolean }
const TAU = Math.PI * 2;

/** A deliberately authored elder, not the old equal-angle seven-arm tree grammar. */
const WOOD: Limb[] = [
  { points: [[0,-.12,0],[-.28,.55,.06],[-.63,1.25,.13],[-.68,2.05,.04],[-.27,2.95,-.12],[.44,3.85,-.04],[.76,4.7,.12],[.49,5.6,.17]], radii: [1.05,.97,.83,.72,.66,.56,.43,.17], twist: 1.62, lobes: 6, hollow: true },
  { points: [[-.68,1.98,.04],[-.5,2.73,-.04],[-1.12,3.55,.13],[-1.9,4.18,.25],[-3.05,4.68,.17],[-4.24,5.36,.22],[-5.3,6.18,-.1]], radii: [.42,.61,.54,.4,.29,.18,.035], twist: 1.15 },
  { points: [[-.29,2.94,-.12],[.27,3.57,-.04],[1.33,4.02,-.03],[2.62,4.46,-.14],[3.83,5.17,-.34],[5.15,6.11,-.22]], radii: [.37,.52,.44,.32,.2,.032], twist: -1.2 },
  { points: [[.52,4.15,-.09],[.46,5.09,-1.05],[-.1,5.98,-2.09],[.12,6.82,-3.2]], radii: [.43,.31,.18,.03], twist: 1.03 },
  { points: [[-.69,1.94,.03],[-.68,2.56,.27],[-.9,3.25,.89],[-.12,4.17,1.66],[1.2,5.06,2.45],[2.16,6.3,3.26]], radii: [.32,.42,.36,.27,.16,.035], twist: -.86 },
  { points: [[.71,4.6,.12],[.7,5.65,.33],[1.22,6.51,.51],[2.13,7.23,.39]], radii: [.34,.26,.13,.025], twist: 1.2 },
  { points: [[-1.34,3.78,.13],[-2.15,4.91,-1.04],[-3.12,5.78,-2.15],[-3.8,6.68,-2.54]], radii: [.32,.24,.14,.023], twist: .8 },
  { points: [[-3,4.7,.17],[-3.14,5.47,1.14],[-4.12,6.31,1.94],[-4.22,7.04,2.32]], radii: [.26,.18,.09,.021], twist: -.9 },
  { points: [[2.64,4.48,-.14],[3.24,5.13,1.01],[4.18,5.9,1.8],[4.83,6.82,2.23]], radii: [.27,.18,.09,.022], twist: 1.08 },
  { points: [[-.1,4.18,1.66],[-1.1,5.2,2.35],[-1.58,6.21,3.1],[-2.07,6.89,3.4]], radii: [.26,.19,.1,.02], twist: -.6 },
  { points: [[.5,5.17,-1.15],[1.72,5.83,-2.16],[3.15,6.48,-2.8],[3.8,7.1,-2.62]], radii: [.24,.16,.085,.018], twist: 1.1 },
];

// Elder branch groups climb from the low left arm into a taller inner crown;
// the front lobe drops below the right group instead of forming a level brim.
const CROWNS: { center: Point; size: Point; branch: Point }[] = [
  {center:[-5.25,6.10,-.30],size:[1.90,1.25,1.55],branch:[-4.6,5.8,.05]},
  {center:[-4.20,7.45,-2.65],size:[1.65,1.65,1.40],branch:[-3,5.9,-2]},
  {center:[-3.25,7.05,0],size:[1.45,1.35,1.45],branch:[-3,5.5,.6]},
  {center:[-4.45,6.65,2.55],size:[1.65,1.05,1.25],branch:[-4.2,6.45,2]},
  {center:[-.85,7.90,-3.0],size:[1.45,1.75,1.50],branch:[-.1,6.2,-2.5]},
  {center:[1.45,8.70,-.80],size:[1.50,1.65,1.35],branch:[1.2,6.5,.5]},
  {center:[4.0,7.30,-2.65],size:[1.70,1.20,1.45],branch:[3.2,6.5,-2.8]},
  {center:[5.10,6.70,.15],size:[2.0,1.10,1.35],branch:[4.5,5.8,-.2]},
  {center:[4.90,7.65,2.50],size:[1.40,1.50,1.35],branch:[4.1,6.0,1.8]},
  {center:[2.35,6.25,3.85],size:[1.55,.95,1.30],branch:[1.9,6.0,3]},
  {center:[-1.40,7.75,3.40],size:[1.45,1.45,1.20],branch:[-1.2,5.9,2.9]},
  {center:[.70,8.65,.15],size:[1.15,1.30,1.10],branch:[.5,5.6,.2]},
];

// These are separately drawn woody centre-lines and crown layouts, rather than
// clones of the elder rotated/scaled around the same ring. All share bark/atlas.
const SENTINEL_WOOD:Limb[]=[
  {points:[[0,-.12,0],[.25,.7,.05],[.8,1.7,.1],[1.13,2.7,0],[.82,3.8,.2],[.2,5,.4],[-.2,5.8,.5]],radii:[.86,.8,.7,.56,.47,.29,.09],twist:-1.2},
  {points:[[1.1,2.65,0],[.1,3.5,.2],[-1.3,4.3,.6],[-3,4.6,.5],[-4.55,5.35,.2]],radii:[.52,.4,.3,.18,.025],twist:.9},
  {points:[[.8,3.8,.2],[2,4.3,.2],[3.1,5,-.3],[3.6,6.4,-.4]],radii:[.39,.3,.18,.023],twist:-.7},
  {points:[[.2,4.95,.4],[-1,5.7,-.8],[-2.2,6.5,-1.8],[-3.1,7.05,-2.2]],radii:[.28,.21,.13,.021],twist:1.1},
  {points:[[.6,4.25,.3],[1.5,5.3,1.2],[2.9,6.2,2.5],[3.25,7.4,2.8]],radii:[.31,.22,.12,.025],twist:.8},
  {points:[[-1.2,4.25,.55],[-2,5.4,1.7],[-3.3,6.05,2.1],[-4.3,6.3,2.7]],radii:[.27,.19,.1,.018],twist:-.8},
  {points:[[.1,5.1,.45],[.4,6.2,-.8],[1.3,7.15,-1.9],[1.8,7.65,-2.5]],radii:[.27,.19,.1,.018],twist:.5},
];
const SENTINEL_CROWNS:typeof CROWNS=[
  {center:[-4.6,5.75,.1],size:[1.9,1.2,1.8],branch:[-3.5,4.9,.4]},
  {center:[-4.1,6.75,2.6],size:[2.1,1.2,1.7],branch:[-3.3,6,2.1]},
  {center:[-2,7.2,-1.8],size:[2.3,1.4,1.9],branch:[-2.2,6.5,-1.8]},
  {center:[.5,7.5,.4],size:[2.1,1.6,2.1],branch:[-.2,5.8,.5]},
  {center:[1.9,8.1,-2.35],size:[2.0,1.3,1.7],branch:[1.3,7.15,-1.9]},
  {center:[3.65,7.1,-.25],size:[1.8,1.4,1.9],branch:[3.6,6.4,-.4]},
  {center:[3.2,7.85,2.9],size:[1.7,1.25,1.65],branch:[3.25,7.4,2.8]},
  {center:[-1.45,6.75,2.6],size:[2.0,1.2,1.65],branch:[-2,5.4,1.7]},
];
const SPRING_WOOD:Limb[]=[
  {points:[[0,-.1,0],[-.35,.6,.2],[-.83,1.4,.35],[-1.15,2.25,.4],[-.65,3.2,.6],[.4,3.9,.7],[1.45,4.4,.5]],radii:[1.02,.87,.73,.63,.52,.35,.13],twist:1.8},
  {points:[[-1,2,.4],[-2.1,2.75,.5],[-3.2,3.6,.2],[-4.3,4.35,-.3],[-5.2,4.9,-.4]],radii:[.5,.39,.28,.17,.025],twist:-.7},
  {points:[[-.7,3.2,.6],[-1.6,4.2,-.3],[-2.2,5.25,-1.3],[-3.1,5.8,-2.1]],radii:[.37,.27,.15,.021],twist:.9},
  {points:[[.1,3.7,.7],[1.65,4.2,1.3],[3.15,4.7,1.5],[4.8,5.2,1.2]],radii:[.33,.25,.14,.02],twist:-.4},
  {points:[[1.15,4.25,.6],[1.65,5.3,-.4],[2.65,6.1,-1.5],[3.65,6.3,-2.2]],radii:[.27,.2,.11,.018],twist:.8},
  {points:[[-1.1,2.5,.4],[-1.1,3.6,1.8],[-.1,4.65,3.2],[1.1,5.45,3.65]],radii:[.37,.26,.14,.019],twist:-1.1},
  {points:[[-2.4,3.05,.45],[-3.2,4.1,1.5],[-4.2,4.9,2.8]],radii:[.25,.15,.018],twist:.7},
];
const SPRING_CROWNS:typeof CROWNS=[
  {center:[-5.1,5.3,-.3],size:[2.1,1.1,1.9],branch:[-4.3,4.35,-.3]},
  {center:[-3.7,5.6,2.7],size:[2.15,1.1,1.8],branch:[-3.2,4.1,1.5]},
  {center:[-3,6.5,-2],size:[2.0,1.35,2.0],branch:[-2.2,5.25,-1.3]},
  {center:[-.5,6.2,.2],size:[2.1,1.4,2.0],branch:[.4,3.9,.7]},
  {center:[2.9,6.8,-1.8],size:[2.0,1.2,1.9],branch:[2.65,6.1,-1.5]},
  {center:[4.7,5.8,1.4],size:[2.4,1.1,1.8],branch:[3.15,4.7,1.5]},
  {center:[1.4,6.1,3.7],size:[2.2,1.35,1.7],branch:[1.1,5.45,3.65]},
  {center:[-1.4,5.9,2.9],size:[2.0,1.1,1.8],branch:[-.1,4.65,3.2]},
];

function random(seed: number) { let s=seed>>>0; return () => { s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; }; }
const vector = (p: Point) => new THREE.Vector3(...p);
const mixRadius = (radii: number[], t: number) => { const f=t*(radii.length-1),i=Math.min(radii.length-2,Math.floor(f)); return THREE.MathUtils.lerp(radii[i],radii[i+1],f-i); };

// The root collar and coarse boughs share one surface. Intersecting capped
// cylinders cannot make a graft: their bark and shading end on a visible seam.
interface WoodNode { limb:Limb; points:THREE.Vector3[]; normals:THREE.Vector3[]; binormals:THREE.Vector3[]; length:number; repeats:number; u:number; v:number }
interface WoodSegment { node:number; index:number; a:THREE.Vector3; delta:THREE.Vector3; length2:number }
interface WoodSample { distance:number; angle:number; t:number; radius:number; axialT?:number }
const smoothMin=(a:number,b:number,k:number)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;};
const angularBump=(a:number,b:number,width:number)=>Math.pow(Math.max(0,(Math.cos(a-b)-Math.cos(width*1.8))/(1-Math.cos(width*1.8))),2);
// CPU-only templates are never attached or uploaded. Callers always receive
// independent geometry, including after another caller has disposed its tree.
const woodTemplates=new Map<string,THREE.BufferGeometry>();
export function getOliveTemplateCacheInfo() {
  const entries=[...woodTemplates].map(([key,geometry])=>({key,bytes:Object.values(geometry.attributes).reduce((bytes,a)=>bytes+a.array.byteLength,geometry.index?.array.byteLength??0),buildProfileMs:geometry.userData.buildProfileMs}));
  return {maxEntries:6,entries,bytes:entries.reduce((sum,e)=>sum+e.bytes,0),storage:'CPU arrays only; never rendered or uploaded; retained until module unload; every tree owns a clone'};
}

function sampleWood(node:WoodNode,segment:WoodSegment,x:number,y:number,z:number):WoodSample {
  const dx=x-segment.a.x,dy=y-segment.a.y,dz=z-segment.a.z;
  const projection=(dx*segment.delta.x+dy*segment.delta.y+dz*segment.delta.z)/segment.length2;
  const f=THREE.MathUtils.clamp(projection,0,1);
  const vx=dx-segment.delta.x*f,vy=dy-segment.delta.y*f,vz=dz-segment.delta.z*f;
  const index=segment.index,t=(index+f)/(node.points.length-1);
  const n=node.normals[index],b=node.binormals[index];
  const angle=Math.atan2(vx*b.x+vy*b.y+vz*b.z,vx*n.x+vy*n.y+vz*n.z);
  const twist=angle+t*node.limb.twist;
  let radius=mixRadius(node.limb.radii,t)*(1+.14*Math.cos(twist*(node.limb.lobes??5))+.045*Math.sin(twist*11+t*8));
  if(node.limb.rootCollar) {
    const collar=Math.pow(Math.max(0,1-(segment.a.y+segment.delta.y*f)/1.35),2);
    const theta=Math.atan2(vz,vx);
    // Three unequal shoulders form the foot of the trunk, rather than seven
    // equally spaced spikes lying on the ground. Expansion is mainly lateral.
    const spread=.16+.47*angularBump(theta,2.5,.63)+.29*angularBump(theta,.3,.43)+.20*angularBump(theta,-1.13,.56);
    if(node.limb.rootProfile==='elder-directed') {
      const shoulder=1-THREE.MathUtils.smoothstep(segment.a.y+segment.delta.y*f,.05,1.05);
      const directions=.30*angularBump(theta,2.56,.38)+.18*angularBump(theta,.74,.31)+.11*angularBump(theta,-2.12,.36);
      radius*=1+shoulder*(-.24+directions*(vx*vx+vz*vz)/(vx*vx+vy*vy+vz*vz+1e-8));
    } else radius*=1+collar*spread*(vx*vx+vz*vz)/(vx*vx+vy*vy+vz*vz+1e-8);
  }
  // Geometry uses a closed end. UV flow may continue beyond that endpoint;
  // clamping both collapses an entire root shoulder onto one texture V row.
  const axialT=(index+((index===0&&projection<0)||(index===node.points.length-2&&projection>1)?projection:f))/(node.points.length-1);
  return {distance:Math.sqrt(vx*vx+vy*vy+vz*vz)-radius,angle,t,radius,axialT};
}

function mergedWood(limbs:Limb[],quality:OliveOptions['quality'],material:THREE.Material,hollow:boolean):THREE.BufferGeometry {
  const started=performance.now();
  const nodes:WoodNode[]=[],segments:WoodSegment[]=[];
  const nearest=(nodeIndex:number,x:number,y:number,z:number)=>{
    let best:WoodSample={distance:Infinity,angle:0,t:0,radius:0};
    for(const segment of segments) if(segment.node===nodeIndex) {const sample=sampleWood(nodes[nodeIndex],segment,x,y,z);if(sample.distance<best.distance)best=sample;}
    return best;
  };
  for(const limb of limbs) {
    const curve=new THREE.CatmullRomCurve3(limb.points.map(vector),false,'catmullrom',.42),length=curve.getLength();
    const steps=Math.max(8,Math.ceil(length*11)),frames=curve.computeFrenetFrames(steps,false);
    const node:WoodNode={limb,points:curve.getSpacedPoints(steps),normals:frames.normals,binormals:frames.binormals,length,repeats:Math.max(1,Math.round(TAU*limb.radii[0]/2.8)),u:0,v:0};
    const index=nodes.length;
    if(index) {
      const start=node.points[0],front=new THREE.Vector3(0,0,1).projectOnPlane(frames.tangents[0]).normalize();
      let parent=0,best=Infinity,parentSample:WoodSample={distance:0,angle:0,t:0,radius:0};
      for(let p=0;p<nodes.length;p++){const sample=nearest(p,start.x,start.y,start.z);if(Math.abs(sample.distance)<best){best=Math.abs(sample.distance);parent=p;parentSample=sample;}}
      const probe=start.clone().addScaledVector(front,limb.radii[0]),atFront=nearest(parent,probe.x,probe.y,probe.z);
      const childAngle=Math.atan2(front.dot(frames.binormals[0]),front.dot(frames.normals[0]));
      node.u=nodes[parent].u+atFront.angle/TAU*nodes[parent].repeats-childAngle/TAU*node.repeats;
      node.v=nodes[parent].v+parentSample.t*nodes[parent].length/2.8;
    }
    nodes.push(node);
    for(let i=0;i<steps;i++){const delta=node.points[i+1].clone().sub(node.points[i]);segments.push({node:index,index:i,a:node.points[i],delta,length2:delta.lengthSq()});}
  }
  const box=new THREE.Box3();
  nodes.forEach(node=>{const radius=Math.max(...node.limb.radii)*(node.limb.rootCollar?1.95:1.3)+.22;node.points.forEach(p=>{box.expandByPoint(p.clone().addScalar(radius));box.expandByPoint(p.clone().addScalar(-radius));});});
  const center=box.getCenter(new THREE.Vector3()),half=box.getSize(new THREE.Vector3()).multiplyScalar(.5);
  const resolution=quality==='high'?96:72;
  // Bucket only the compact influence region. Field evaluation stays local to
  // a few nearby segments instead of testing every branch at every grid point.
  const buckets=new Map<number,WoodSegment[]>(),bucketSize=1.15;
  // Authored trees occupy <20 m. This lossless integer bucket address covers
  // +/-147 m in each axis and avoids allocating a string for every field cell.
  const key=(x:number,y:number,z:number)=>(x+128)+(y+128)*256+(z+128)*65536;
  for(const segment of segments) {
    const node=nodes[segment.node],t=segment.index/(node.points.length-1),r=Math.max(mixRadius(node.limb.radii,t),mixRadius(node.limb.radii,t+1/(node.points.length-1)))*(node.limb.rootCollar?1.95:1.3)+.24;
    const end=segment.a.clone().add(segment.delta);
    for(let z=Math.floor((Math.min(segment.a.z,end.z)-r)/bucketSize);z<=Math.floor((Math.max(segment.a.z,end.z)+r)/bucketSize);z++)
      for(let y=Math.floor((Math.min(segment.a.y,end.y)-r)/bucketSize);y<=Math.floor((Math.max(segment.a.y,end.y)+r)/bucketSize);y++)
        for(let x=Math.floor((Math.min(segment.a.x,end.x)-r)/bucketSize);x<=Math.floor((Math.max(segment.a.x,end.x)+r)/bucketSize);x++){const k=key(x,y,z),bucket=buckets.get(k);if(bucket)bucket.push(segment);else buckets.set(k,[segment]);}
  }
  const cavityDistance=(x:number,y:number,z:number)=>{
    const a=Math.atan2((y-1.55)/.65,(x+.63)/.34),edge=1+.045*Math.sin(a*7)+.06*Math.cos(a*3+.3);
    return (Math.sqrt(Math.pow((x+.63)/(.34*edge),2)+Math.pow((y-1.55)/(.65*edge),2)+Math.pow((z-.88)/.75,2))-1)*.34;
  };
  const best=new Float64Array(nodes.length),chosen:(WoodSegment|undefined)[]=new Array(nodes.length);
  const closestSegments=(nearby:WoodSegment[],x:number,y:number,z:number)=>{
    best.fill(Infinity);chosen.fill(undefined);
    for(const segment of nearby){const dx=x-segment.a.x,dy=y-segment.a.y,dz=z-segment.a.z,f=THREE.MathUtils.clamp((dx*segment.delta.x+dy*segment.delta.y+dz*segment.delta.z)/segment.length2,0,1),node=nodes[segment.node];const vx=dx-segment.delta.x*f,vy=dy-segment.delta.y*f,vz=dz-segment.delta.z*f;const d=Math.sqrt(vx*vx+vy*vy+vz*vz)-mixRadius(node.limb.radii,(segment.index+f)/(node.points.length-1));if(d<best[segment.node]){best[segment.node]=d;chosen[segment.node]=segment;}}
    return chosen;
  };
  const field=new MarchingCubes(resolution,material,false,false,100000);field.isolation=0;
  const distances=new Float64Array(nodes.length);
  for(let iz=0;iz<resolution;iz++)for(let iy=0;iy<resolution;iy++)for(let ix=0;ix<resolution;ix++) {
    const x=center.x+(ix/resolution*2-1)*half.x,y=center.y+(iy/resolution*2-1)*half.y,z=center.z+(iz/resolution*2-1)*half.z;
    const nearby=buckets.get(key(Math.floor(x/bucketSize),Math.floor(y/bucketSize),Math.floor(z/bucketSize)));
    let distance=1;distances.fill(Infinity);
    if(nearby) {
      for(const segment of closestSegments(nearby,x,y,z))if(segment)distances[segment.node]=sampleWood(nodes[segment.node],segment,x,y,z).distance;
      for(let n=0;n<distances.length;n++)if(Number.isFinite(distances[n]))distance=smoothMin(distance,distances[n],Math.min(.20,nodes[n].limb.radii[0]*.42));
      if(hollow)distance=-smoothMin(-distance,cavityDistance(x,y,z),.035);
      distance=Math.max(distance,-.60-y);
    }
    field.field[iz*resolution*resolution+iy*resolution+ix]=-distance;
  }
  const evaluated=performance.now();field.update();const extracted=performance.now();
  const count=field.count,pos=new Float32Array(count*3),normal=new Float32Array(count*3),uv=new Float32Array(count*2),color=new Float32Array(count*3);
  const n=new THREE.Vector3();
  for(let i=0;i<count;i++) {
    const x=center.x+field.positionArray[i*3]*half.x,y=center.y+field.positionArray[i*3+1]*half.y,z=center.z+field.positionArray[i*3+2]*half.z;
    pos.set([x,y,z],i*3);n.set(field.normalArray[i*3]/half.x,field.normalArray[i*3+1]/half.y,field.normalArray[i*3+2]/half.z).normalize();normal.set(n.toArray(),i*3);
    const nearby=buckets.get(key(Math.floor(x/bucketSize),Math.floor(y/bucketSize),Math.floor(z/bucketSize)))??[];
    const samples=closestSegments(nearby,x,y,z).map((segment,index)=>segment?sampleWood(nodes[index],segment,x,y,z):{distance:Infinity,angle:0,t:0,radius:0}),minimum=Math.min(...samples.map(s=>s.distance));
    let phaseX=0,phaseY=0,v=0,total=0;
    samples.forEach((s,index)=>{const weight=Math.exp(-Math.max(0,s.distance-minimum)*18);if(weight<.003)return;const node=nodes[index],u=node.u+s.angle/TAU*node.repeats;phaseX+=Math.cos(u*TAU)*weight;phaseY+=Math.sin(u*TAU)*weight;v+=(node.v+s.t*node.length/2.8)*weight;total+=weight;});
    let mappedV=v/total;
    if(y<1.4) {
      // One trunk chart carries the whole lower collar. Blending phases from
      // several buried root endpoints can cancel and leave checker/strip seams.
      const trunk=nodes[0],sample=Number.isFinite(samples[0].distance)?samples[0]:nearest(0,x,y,z);
      const rootU=trunk.u+sample.angle/TAU*trunk.repeats;
      const radial=Math.hypot(x-trunk.points[0].x,z-trunk.points[0].z)-.72;
      const rootRun=.5*(radial+Math.sqrt(radial*radial+.08*.08));
      const rootV=trunk.v+(sample.axialT??sample.t)*trunk.length/2.8-.7*rootRun/2.8;
      const rootWeight=1-THREE.MathUtils.smoothstep(y,.85,1.4);
      phaseX=THREE.MathUtils.lerp(phaseX/total,Math.cos(rootU*TAU),rootWeight);
      phaseY=THREE.MathUtils.lerp(phaseY/total,Math.sin(rootU*TAU),rootWeight);
      mappedV=THREE.MathUtils.lerp(mappedV,rootV,rootWeight);
      if(trunk.limb.rootProfile==='elder-directed') {
        let rootIndex=-1,rootDistance=Infinity;
        samples.forEach((s,index)=>{if(nodes[index].limb.rootFlow&&s.distance<rootDistance){rootDistance=s.distance;rootIndex=index;}});
        if(rootIndex>=0) {
          const root=nodes[rootIndex],s=samples[rootIndex];
          const rootFlow=(1-THREE.MathUtils.smoothstep(y,.7,1.1))*THREE.MathUtils.smoothstep(radial+.72,.90,1.40)*(1-THREE.MathUtils.smoothstep(rootDistance,.03,.25));
          if(rootFlow>0) {
            // Outside the collar, both axes belong to the one selected root:
            // circumferential U and arc-length V. Mixing only V against the
            // trunk's global U wrapped the left root in transverse bands.
            const collarU=Math.atan2(phaseY,phaseX)/TAU;
            const selectedU=root.u+s.angle/TAU*root.repeats;
            const difference=Math.atan2(Math.sin((selectedU-collarU)*TAU),Math.cos((selectedU-collarU)*TAU))/TAU;
            const mappedU=collarU+difference*rootFlow;
            // Interpolate the unwrapped angle of one chart, never a sum of
            // opposing root phasors that can cancel to an undefined phase.
            phaseX=Math.cos(mappedU*TAU);phaseY=Math.sin(mappedU*TAU);
            mappedV=THREE.MathUtils.lerp(mappedV,root.v-(s.axialT??s.t)*root.length/2.8,rootFlow);
          }
        }
      }
    }
    uv.set([Math.atan2(phaseY,phaseX)/TAU,mappedV],i*2);
    // Conservative occlusion tint follows the carved surface and its actual
    // depth. A broad continuous falloff avoids bright missed vertices at the
    // old narrow isosurface threshold; the rim keeps the outer bark palette.
    const cavityBlend=hollow?(1-THREE.MathUtils.smoothstep(Math.abs(cavityDistance(x,y,z)),.035,.18))*THREE.MathUtils.smoothstep(.93-z,.06,.68):0;
    const shade=(.9+.045*Math.sin(y*5+x*2))*(1-.4*cavityBlend);
    color.set([shade,shade*(.985-.085*cavityBlend),shade*(.95-.15*cavityBlend)],i*3);
  }
  // Each triangle uses a locally unwrapped phase, so the periodic U seam does
  // not interpolate through the whole atlas. No duplicated half-wrap UV seam.
  for(let i=0;i<count;i+=3)for(let j=1;j<3;j++)uv[(i+j)*2]+=Math.round(uv[i*2]-uv[(i+j)*2]);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(pos,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normal,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.BufferAttribute(color,3));field.geometry.dispose();
  // At a thin concave fold, an isosurface gradient can average across both sides
  // of a cell. That is a real crease: use the local triangle's outward normal.
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),face=new THREE.Vector3(),average=new THREE.Vector3();
  for(let i=0;i<count;i+=3){a.fromArray(pos,i*3);b.fromArray(pos,(i+1)*3);c.fromArray(pos,(i+2)*3);face.copy(b).sub(a).cross(c.sub(a)).normalize();average.set(0,0,0);for(let j=0;j<3;j++)average.add(n.fromArray(normal,(i+j)*3));if(face.dot(average.normalize())<.12)for(let j=0;j<3;j++)normal.set(face.toArray(),(i+j)*3);}
  geometry.userData.buildProfileMs={field:evaluated-started,extract:extracted-evaluated,surface:performance.now()-extracted};
  return geometry;
}

function sweep(limb: Limb, quality: OliveOptions['quality']): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(limb.points.map(vector),false,'catmullrom',.42);
  const steps = Math.ceil(curve.getLength()*(quality==='high'?(limb.hollow?12:8):4));
  const radial = quality==='high' ? limb.hollow?56:limb.radii[0]>.5?30:18 : limb.hollow?26:limb.radii[0]>.5?18:10;
  const frames = curve.computeFrenetFrames(steps,false);
  const pos:number[]=[],uv:number[]=[],colors:number[]=[],indices:number[]=[];
  const length=curve.getLength();
  const positions:THREE.Vector3[][]=[];
  for(let i=0;i<=steps;i++) {
    const t=i/steps,center=curve.getPointAt(t),r=mixRadius(limb.radii,t);
    const ring:THREE.Vector3[]=[];
    for(let j=0;j<=radial;j++) {
      const a=j/radial*TAU;
      const twist=a+t*limb.twist;
      const fluting=1+.16*Math.cos(twist*(limb.lobes??5))+.065*Math.sin(twist*11+t*8)+.028*Math.sin(a*19-t*23);
      const radius=r*fluting;
      const p=center.clone().addScaledVector(frames.normals[i],Math.cos(a)*radius).addScaledVector(frames.binormals[i],Math.sin(a)*radius*(1+.06*Math.sin(t*9)));
      ring.push(p); pos.push(p.x,p.y,p.z);
      uv.push(j/radial*Math.max(1,Math.round(TAU*limb.radii[0]/2.8)),t*length/2.8);
      const dark=.82+.15*Math.max(0,Math.cos(twist*(limb.lobes??5)))+.035*Math.sin(a*3+t*13);
      colors.push(dark,dark*.985,dark*.95);
    }
    positions.push(ring);
  }
  for(let i=0;i<steps;i++) for(let j=0;j<radial;j++) {
    const p=positions[i][j].clone().add(positions[i+1][j+1]).multiplyScalar(.5);
    const opening=limb.hollow && p.z>.45 && Math.pow((p.x+.63)/.34,2)+Math.pow((p.y-1.55)/.65,2)<1;
    if(opening) continue;
    const a=i*(radial+1)+j,b=a+radial+1;
    indices.push(a,a+1,b,a+1,b+1,b);
  }
  // Ends are capped; underground roots and branch forks remain complete from behind.
  // A fork starts inside its parent. Capping that intersecting disk creates a
  // visible flat cut through the parent's outer bark, so only underground ends
  // and branch tips are capped; the overlapping fork volume hides the join.
  for (const i of limb.points[0][1]<0 ? [0,steps] : [steps]) {
    const center=curve.getPointAt(i/steps),idx=pos.length/3;
    pos.push(center.x,center.y,center.z);uv.push(.5,i/steps*length/2.8);colors.push(.7,.68,.65);
    for(let j=0;j<radial;j++) {const a=i*(radial+1)+j;indices.push(...(i===0?[idx,a+1,a]:[idx,a,a+1]));}
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setIndex(indices);g.computeVertexNormals();
  // Deep bark folds and end caps are creases, not a smooth surface across an
  // obtuse angle. Split only their shading normals instead of lighting them
  // with a vertex average pointing through the wood.
  const out=g.toNonIndexed();g.dispose();
  const p=out.getAttribute('position'),n=out.getAttribute('normal');
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),face=new THREE.Vector3(),average=new THREE.Vector3();
  for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);face.copy(b).sub(a).cross(c.sub(a)).normalize();average.set(0,0,0);for(let j=0;j<3;j++)average.add(new THREE.Vector3().fromBufferAttribute(n,i+j));average.normalize();if(face.dot(average)<.12)for(let j=0;j<3;j++)n.setXYZ(i+j,face.x,face.y,face.z);}
  return out;
}

function leafCard(tile:number,folded:boolean): THREE.BufferGeometry {
  const pos=folded ? [-.5,-.5,0, 0,-.5,.025, .5,-.5,0, -.5,.5,0, 0,.5,.025, .5,.5,0] : [-.5,-.5,0,.5,-.5,0,-.5,.5,0,.5,.5,0];
  const uv=folded ? [0,0,.5,0,1,0,0,1,.5,1,1,1] : [0,0,1,0,0,1,1,1];
  for(let i=0;i<uv.length;i+=2) uv[i]=(uv[i]+tile)/4;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(folded?[0,1,3,1,4,3,1,2,4,2,5,4]:[0,1,2,1,3,2]);g.computeVertexNormals();return g;
}

/** Local origin at the root collar. Meshes use shared materials; owner disposes materials. */
export function createAncientOlive(options: OliveOptions): THREE.Group {
  const root=new THREE.Group();root.name='reference/olive-sanctuary-elder';
  const high=options.quality==='high',rnd=random(options.seed??7331);
  const variant=((options.variant??0)%3+3)%3;
  const scaffold=variant===1?SENTINEL_WOOD:variant===2?SPRING_WOOD:WOOD;
  const crowns=variant===1?SENTINEL_CROWNS:variant===2?SPRING_CROWNS:CROWNS;
  const roots:Limb[][]=[
    [
      {points:[[-.42,.66,.16],[-1.08,.38,.55],[-1.85,.14,.95],[-2.70,-.20,1.30],[-3.05,-.42,1.58]],radii:[.36,.32,.23,.12,.025],twist:.6,rootFlow:true},
      {points:[[.10,.58,.08],[.77,.35,.43],[1.25,.14,.86],[1.48,.03,1.28],[1.65,-.11,1.61],[1.78,-.34,1.82],[1.83,-.68,1.94]],radii:[.29,.26,.19,.145,.14,.10,.025],twist:-.9,rootFlow:true},
      {points:[[-.18,.44,-.20],[-.46,.20,-.87],[-.90,-.05,-1.41],[-1.35,-.40,-1.77]],radii:[.23,.19,.12,.025],twist:.7,rootFlow:true},
    ],
    [
      {points:[[.12,.65,.06],[.75,.28,.7],[1.24,.01,1.09],[1.8,-.4,1.35]],radii:[.35,.3,.19,.035],twist:-.8},
      {points:[[-.23,.48,-.12],[-.89,.19,-.44],[-1.51,-.05,-.4],[-1.93,-.4,-.68]],radii:[.3,.25,.14,.03],twist:.5},
      {points:[[.15,.38,-.18],[.52,.08,-.89],[.38,-.4,-1.4]],radii:[.21,.17,.03],twist:1.2},
    ],
    [
      {points:[[-.46,.7,.22],[-1.1,.32,.8],[-1.67,.04,.94],[-2.18,-.4,.79]],radii:[.39,.32,.21,.035],twist:1.1},
      {points:[[.15,.48,-.2],[.72,.18,-.64],[1.05,-.05,-1.22],[1.02,-.4,-1.7]],radii:[.34,.27,.16,.03],twist:-.4},
      {points:[[-.12,.4,.24],[.42,.15,.94],[.96,-.4,1.4]],radii:[.25,.2,.03],twist:.5},
    ],
  ];
  const templateKey=`${variant}/${options.quality}`;
  let template=woodTemplates.get(templateKey);
  if(!template) {
    const coarseCount=variant===1?5:6;
    const coarse=scaffold.slice(0,coarseCount).map((limb,index)=>({...limb,rootCollar:index===0,rootProfile:index===0&&variant===0?'elder-directed' as const:undefined}));
    const wood=[mergedWood([...coarse,...roots[variant]],options.quality,options.materials.bark,variant===0),...scaffold.slice(coarseCount).map(limb=>sweep(limb,options.quality))];
  // Authored secondary boughs carry the crown, including its underside and back.
    crowns.forEach((c,index)=>{
    const center=vector(c.center),base=vector(c.branch);
    const side=(index%2?1:-1)*.7;
    for(let j=0;j<3;j++){
      const end=center.clone().add(new THREE.Vector3((j-1)*c.size[0]*.56, .05+(j%2)*.38, side+(j-1)*.48));
      const middle=base.clone().lerp(end,.58);middle.y-=.18;middle.z+=.18*(j-1);
      wood.push(sweep({points:[[base.x,base.y,base.z],[middle.x,middle.y,middle.z],[end.x,end.y,end.z]],radii:[.105+(index%3)*.014,.057,.008],twist:.8},options.quality));
    }
    });
    const profile=wood[0].userData.buildProfileMs;
    template=mergeGeometries(wood,false)!;wood.forEach(g=>g.dispose());
    // Signed normalized normals and byte vertex tints preserve their useful
    // precision without retaining float32 copies in every CPU template/clone.
    const sourceNormal=template.getAttribute('normal'),sourceColor=template.getAttribute('color');
    template.setAttribute('normal',new THREE.Int16BufferAttribute(Int16Array.from(sourceNormal.array,value=>Math.round(THREE.MathUtils.clamp(value,-1,1)*32767)),3,true));
    template.setAttribute('color',new THREE.Uint8BufferAttribute(Uint8Array.from(sourceColor.array,value=>Math.round(THREE.MathUtils.clamp(value,0,1)*255)),3,true));
    template.userData.buildProfileMs=profile;woodTemplates.set(templateKey,template);
  }
  const trunkGeometry=template.clone();
  const trunk=new THREE.Mesh(trunkGeometry,options.materials.bark);trunk.name='elder / fluted trunk, forks, roots and secondary wood';trunk.castShadow=true;trunk.receiveShadow=true;root.add(trunk);
  const perCrown=variant===0?(high?72:45):(high?76:48);
  const transforms:{tile:number;matrix:THREE.Matrix4;color:THREE.Color;normal:THREE.Vector3;center:THREE.Vector3;inverseRadius:THREE.Vector3}[]=[];
  crowns.forEach((c,cluster)=>{
    const center=vector(c.center);
    for(let i=0;i<perCrown;i++) {
      // Stratified solid ellipsoids, not isolated leaves or a green opaque ball.
      const y=1-2*(i+.5)/perCrown,a=i*2.399963229728653+cluster*1.7;
      const rr=Math.sqrt(Math.max(0,1-y*y)),interior=i%4===0?.25+.6*rnd():.72+.28*rnd();
      const warp=1+.17*Math.sin(a*3+cluster*1.7)+.1*Math.cos(a*5-y*4);
      const p=new THREE.Vector3(Math.cos(a)*rr*c.size[0]*interior*warp,y*c.size[1]*interior+.16*Math.sin(a*4+cluster),Math.sin(a)*rr*c.size[2]*interior*warp).add(center);
      // Card direction is independent of the Fibonacci position angle. The old
      // correlation formed repeated sloping sheets across the whole canopy.
      const azimuth=rnd()*TAU,lean=.6+rnd()*.4;
      const outward=new THREE.Vector3(Math.cos(azimuth)*(.6+rnd()*.4),-.18+rnd()*.9,Math.sin(azimuth)*lean*(.6+rnd()*.4)).normalize();
      const quaternion=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),outward);
      quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),rnd()*TAU));
      const normal=p.clone().sub(center).divide(new THREE.Vector3(c.size[0]**2,c.size[1]**2,c.size[2]**2));
      normal.y+=.35;normal.normalize().applyQuaternion(quaternion.clone().invert());
      // Keeping the outer contour in low uses wider clusters, not missing crown lobes.
      const width=(high?1.0:1.22)*(.78+rnd()*.48),height=width*(1.55+rnd()*.2);
      const matrix=new THREE.Matrix4().compose(p,quaternion,new THREE.Vector3(width,height,width));
      const shade=.83+rnd()*.3;
      // A few authored openings run through several overlapping crown masses;
      // removing cards leaves real sky gaps instead of adding small dark noise.
      const holes=variant===1?[[-.95,6.30,.72,.62],[2.25,7.35,.55,.53]]:[[-2.15,5.45,.70,.48],[1.30,6.50,.62,.55]];
      const frontX=.85065*p.x-.52573*p.z,frontY=-.05715*p.x+.99408*p.y-.09232*p.z;
      const open=variant===0?
        [[-1.45,7.50,.92,.90],[2.90,7.45,.75,.92]].some(([x,y,rx,ry])=>Math.pow((frontX-x)/rx,2)+Math.pow((frontY-y)/ry,2)<1+.08*Math.sin(p.z*1.4+cluster)):
        holes.some(([x,y,rx,ry])=>Math.pow((p.x-x)/rx,2)+Math.pow((p.y-y)/ry,2)<.75+.14*Math.sin(p.z*2.3+cluster));
      if(open)continue;
      transforms.push({tile:(i+cluster)%4,matrix,color:new THREE.Color(shade,shade,shade*.97),normal,center,inverseRadius:new THREE.Vector3(1/c.size[0]**2,1/c.size[1]**2,1/c.size[2]**2)});
    }
  });
  for(let tile=0;tile<4;tile++) {
    const values=transforms.filter(v=>v.tile===tile),geometry=leafCard(tile,high);
    geometry.setAttribute('instanceCrownNormal',new THREE.InstancedBufferAttribute(new Float32Array(values.flatMap(v=>v.normal.toArray())),3));
    geometry.setAttribute('instanceCrownCenter',new THREE.InstancedBufferAttribute(new Float32Array(values.flatMap(v=>v.center.toArray())),3));
    geometry.setAttribute('instanceCrownInvRadius2',new THREE.InstancedBufferAttribute(new Float32Array(values.flatMap(v=>v.inverseRadius.toArray())),3));
    const mesh=new THREE.InstancedMesh(geometry,options.materials.foliage,values.length);mesh.name=`elder / connected silver olive crown / atlas ${tile}`;
    values.forEach((v,i)=>{mesh.setMatrixAt(i,v.matrix);mesh.setColorAt(i,v.color);});mesh.instanceMatrix.needsUpdate=true;
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();root.add(mesh);
  }
  const bounds=new THREE.Box3().setFromObject(root);
  root.userData={reference:'02-sacred-grove',asset:['olive-sanctuary-elder','olive-cliff-sentinel','olive-spring-arch'][variant],variant,quality:options.quality,units:'meters',front:'+z',bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},collision:{kind:'cylinder',radius:1.12,height:3.0},crownMasses:crowns.length,leafClusterCards:transforms.length,cpuWoodTemplateCache:getOliveTemplateCacheInfo(),notes:'Distinct authored woody centre-lines; coarse trunk/forks/roots use one smooth-union surface with a carved irregular elder cavity. Thin secondary boughs remain swept. CPU-only wood templates are cloned per owner. Crown cards have independent orientations and authored openings.'};
  return root;
}
