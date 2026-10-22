import type { ReferenceGroveBankPatch, ReferenceLayout } from './contracts';
import { REFERENCE_GROVE_BANK_PATCH_CONTRACT_REVISION } from './grove-bank-patch';

/** Frozen shape-05 math port. Source SHA256:
 * 6461b726dc7624a1190b5e2ca5c42c46f4d2c18bb712189503d46045fea16134.
 * This module owns D's protected final target and the single C rock weight.
 * It does not install callbacks or import C, planning files or a preview.
 */
type XZ = readonly [number, number];
interface Bench {
  readonly id: string;
  readonly y: number;
  readonly center: XZ;
  readonly tilt: XZ;
  readonly outline: readonly XZ[];
  readonly scarpRun: number;
  readonly returnRun: number;
  readonly backRise: number;
  readonly frontDrop: number;
}
interface Feature {
  readonly weight: number;
  readonly y: number;
  readonly planeY: number;
  readonly distance: number;
  readonly role?: string;
}
interface Detail {
  readonly height: number;
  readonly weight: number;
  readonly guard: number;
  readonly feature: string | null;
  readonly supports?: readonly { readonly id: string; readonly weight: number }[];
  readonly facetWeight?: number;
}
export interface ReferenceGroveBankTarget {
  readonly patch: ReferenceGroveBankPatch;
  readonly domain: { readonly x: readonly [min: number, max: number]; readonly z: readonly [min: number, max: number] };
  /** Final analytic D target. Weight is D's protected feature weight only;
   * the C-domain edge fade belongs exclusively to patch.sample.
   */
  sampleTerrain(x: number, z: number): { terrainY: number; weight: number };
}

const JOINT_BANK_SHAPE = {
  revision: 'r5-joint-bank-shape-05',
  shapeRevision: 'r5-joint-bank-shape-05',
  meshProtectionMarginM:.12,
  basedOnSha256:'6ec8ca0c16fe81cc120ed44b24f4733c820574d57f902e6ba643c00ece1ecb95',
  sourceSnapshot: '/private/tmp/adonis-r5-leftbank-final-preview-20261021',
  domain: {x:[13.55,20.75],z:[-5.6,13.15]},
  mainShoulder: {
    crestY:4.3,
    actualOriginalContourXZ:[[16.7,-1.5773162841796875],[17.7,-2.8685760498046875],[18.2,-3.6369781494140625]],
    backScarpNewXZ:[[16.1,-1.6025604248046875],[16.7,-2.3773162841796873],[17.7,-3.6685760498046873],[18.2,-4.436978149414063],[18.75,-4.75],[19.1,-3.1]],
    retreatNorthM:.8,
    northFootGuideXZ:[[16.05,-.2],[16.7,-1.645468139648437],[18.2,-3.7051300048828124],[18.75,-3.65],[19.2,-1.2]],
    roofY:4.3, northReturnM:.85,
    note:'The three scoped actual original high-C Y4.3 contours move north .8m. Named endpoints only return locally; no buried-foot line is called a crest. Upper floor edge is convexified south of roof+.65 by at most .08185m at the three scoped X sections.'
  },
  platforms:[
    {id:'upper-east-bench', y:2.1, center:[17.7,-.4], tilt:[.005,-.01],
      outline:[[16.7,-1.645468139648437],[18.2,-3.7051300048828124],[18.75,-3.65],[18.86,-3.05],[18.15,-2.35],[19.11,-1.65],[19.2,-1.2],[19.05,.9],[16.65,1.15],[16.05,-.2]],
      guaranteedCore:[[16.7,-1.4],[18.7,-1.4],[18.7,.6],[16.7,.6]],
      backScarp:[[16.1,-1.6025604248046875],[16.7,-2.3773162841796873],[17.7,-3.6685760498046873],[18.2,-4.436978149414063],[18.75,-4.75],[19.1,-3.1]],
      frontScarp:[[18.86,-3.05],[18.15,-2.35],[19.11,-1.65],[19.2,-1.2],[19.05,.9],[16.65,1.15]],
      backRise:2.2, frontDrop:1.2, scarpRun:.65, returnRun:.9, frontDirection:[.78,.62]},
    {id:'lower-south-bench', y:1.05, center:[17,4.5], tilt:[-.015,.012],
      outline:[[15.65,3.1],[17.75,2.95],[18.5,3.5],[18.3,5.75],[17.55,6.45],[16.1,6.15],[15.5,4.7]],
      guaranteedCore:[[16,3.5],[18,3.5],[18,5.5],[16,5.5]],
      backScarp:[[19.2,-1.2],[19.05,.9],[16.65,1.15]],
      frontScarp:[[18.5,3.5],[18.3,5.75],[17.55,6.45],[16.1,6.15]],
      backRise:.1, frontDrop:.8, scarpRun:.65, returnRun:.9, frontDirection:[.78,.62]},
  ],
  outerFacet:{id:'wall-foot-diagonal-plane',
    outline:[[14.7,1.3],[15.25,.95],[16.2,1.65],[16.1,2.5],[15.1,3.4],[14.55,2.6]],
    center:[15.2,2],y:2.65,tilt:[-.7,-.45],returnRun:.45,
    headingChangeDegrees:32.7352262721076,
    note:'One broad southeast-facing plane turns the north/east exterior foot of the high mural road. Closed route/body/water guards override it; no core or new path.'},
  perimeterStudy:{
    notch:{id:'upper-east-retreat-mouth',entryNorth:[18.86,-3.05],tip:[18.15,-2.35],entrySouth:[19.11,-1.65]},
    directionField:'Upper east perimeter only: smoothly blend original edge direction to a continuous centre direction over X18.05..18.15; the entire non-convex mouth medial axis is beyondX18.15. Lower and western perimeter retain04b edge direction.',
    northFoot:'Frozen monotone northern foot guide, decoupled from non-convex vertical interval switches. North profile ends at the CURRENT generic surface, so mouth crossings do not create a foot-height step.',
    photoPolicy:'05 is a separate shape revision.04b photographs are not evidence for05.'},
  lowerToe:{outline:[[14.4,7],[16.6,6.1],[17.65,7.5],[16.9,11.3],[15.2,12.4],[14.3,10.5]],returnRun:.75,
    plane:{center:[16,6],y:1.05,tilt:[-.06,-.07]},
    note:'Only lower the non-walking mural/approach earth wing. The sloping toe removes the z9.7 foreground hump; it is not a third level or navigation surface.'},
  lowerConnector:{outline:[[16.4,1],[18.85,1],[18.7,3.25],[15.75,3.4]],y:1.05,returnRun:.65,
    note:'The lower bench returns north under the upper front scarp. This is the same lower plane, preventing an old hill or third ridge in the 1.8m gap.'},
  routeProtection:{actualSlabExtraM:0, bodyRadiusM:.28, extraSafetyM:.12, outerTransitionM:.3, meshProtectionMarginM:.12,
    muralHardKeepRadiusM:1.62, prior04bHardKeepRadiusM:1.5, oldMuralHardKeepRadiusM:1.7,
    note:'All path widths plus .28m body+.12m reserve+.12m mesh collar return exact old height. All fade endpoints shift outward by the same mesh collar. No route or collider changes.'},
  waterProtection:{closedWetAndBoundaryCollarM:.4, prior04bClosedCollarM:.28, transitionM:.3, streamRibbonExtraM:.52, meshProtectionMarginM:.12},
  cProposal:{groupName:'reference-grove-bank-landform',meshName:'grove-bank-fractured-rock-solids',revision:'grove-bank-rock-3',
    banksSha:'325267b5db00b569dcb1384e514208f923974d008f66c8051a2cb5dea6ca8076',
    localSurrogateDomain:[[14.5,-5.6],[19.7,-5.6],[20.75,-1.2],[19.8,3.5],[16,5.65],[13.95,3]],
    keepGlobalFoundationY:2.139612851,
    required:'C must isolate southeast outer sector from global MVC propagation and retain all other boundary samples and global foundation. Local top+bottom translate together to keep thickness; local side/underside closure must be rebuilt by C. Preview is a surrogate only.'},
  cameras:{waterfall:{position:[24,3.22,20],yaw:-.27,pitch:.09,fov:60},bridgeNear:{position:[13.05,3.92,14.38],target:[18,2,1]},
    side:{position:[22,4.7,7.5],target:[17.4,1.8,1.5],fov:58}}
} as const;
const clamp=(v: number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a: number,b: number,t: number)=>a+(b-a)*t;
const smooth=(a: number,b: number,v: number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
function nearestSegment(x: number,z: number,a: XZ,b: XZ){const dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz,t=l2?clamp(((x-a[0])*dx+(z-a[1])*dz)/l2):0;const qx=a[0]+t*dx,qz=a[1]+t*dz;return{distance:Math.hypot(x-qx,z-qz),t,x:qx,z:qz};}
function polygonDistance(x: number,z: number,polygon: readonly XZ[]){let inside=false,nearest={distance:Infinity,x:NaN,z:NaN,edge:-1};for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[j],b=polygon[i],q=nearestSegment(x,z,a,b);if(q.distance<nearest.distance)nearest={...q,edge:j};if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return{...nearest,signed:inside?-nearest.distance:nearest.distance,inside};}
function createJointBankProfile(layout: ReferenceLayout){
 const waters=layout.water.filter(w=>'outline'in w).map(w=>({id:w.id,outline:w.outline.map(p=>[p[0],p[2]] as const)}));
 const routes=layout.paths.flatMap(p=>p.points.slice(1).map((b,i)=>({id:p.id,a:[p.points[i][0],p.points[i][2]] as const,b:[b[0],b[2]] as const,keep:p.width/2+.4+JOINT_BANK_SHAPE.meshProtectionMarginM})));
 const ribbons=layout.water.filter(w=>w.kind==='stream').flatMap(w=>w.points.slice(1).map((b,i)=>({id:w.id,a:[w.points[i][0],w.points[i][2]] as const,b:[b[0],b[2]] as const,keep:w.width/2+.4+JOINT_BANK_SHAPE.meshProtectionMarginM})));
 function guard(x: number,z: number){let weight=1;for(const w of waters){const d=polygonDistance(x,z,w.outline).signed;if(d<=.28+JOINT_BANK_SHAPE.meshProtectionMarginM+1e-9)return 0;weight=Math.min(weight,smooth(.28+JOINT_BANK_SHAPE.meshProtectionMarginM,.58+JOINT_BANK_SHAPE.meshProtectionMarginM,d));}for(const r of [...routes,...ribbons]){const d=nearestSegment(x,z,r.a,r.b).distance;if(d<=r.keep+1e-9)return 0;weight=Math.min(weight,smooth(r.keep,r.keep+.3,d));}return weight;}
 function lineZ(points: readonly XZ[],x: number){for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(x>=a[0]-1e-10&&x<=b[0]+1e-10)return mix(a[1],b[1],clamp((x-a[0])/(b[0]-a[0])));}return undefined;}
 function genericFeature(bench: Bench,x: number,z: number,oldY: number): Feature{
   const p=polygonDistance(x,z,bench.outline),planeY=bench.y+(x-bench.center[0])*bench.tilt[0]+(z-bench.center[1])*bench.tilt[1];
   if(p.signed<=0)return{weight:1,y:planeY,planeY,distance:p.signed};
   const maxRun=bench.scarpRun+bench.returnRun;
   if(p.signed>=maxRun)return{weight:0,y:oldY,planeY,distance:p.signed};
   const radialX=x-bench.center[0],radialZ=z-bench.center[1],radialLength=Math.hypot(radialX,radialZ),notchBlend=bench.id==='upper-east-bench'?smooth(18.05,18.15,x):0,nx=mix((x-p.x)/p.distance,radialLength?radialX/radialLength:0,notchBlend),nz=mix((z-p.z)/p.distance,radialLength?radialZ/radialLength:0,notchBlend),northness=1-smooth(-.9,-.2,nz),frontness=Math.max(smooth(.15,.7,nz),smooth(.15,.7,nx));
   const edgeDelta=(bench.id==='upper-east-bench'?0:bench.backRise)*northness-bench.frontDrop*frontness;
   const faceY=planeY+edgeDelta*smooth(0,bench.scarpRun,p.signed),weight=1-smooth(bench.scarpRun,maxRun,p.signed);
   return{weight,y:mix(oldY,faceY,weight),planeY,distance:p.signed};
 }
 function feature(bench: Bench,x: number,z: number,oldY: number): Feature{
   const generic=genericFeature(bench,x,z,oldY);
   if(bench.id!=='upper-east-bench')return generic;
   const roofZ=lineZ(JOINT_BANK_SHAPE.mainShoulder.backScarpNewXZ,x),footZ=lineZ(JOINT_BANK_SHAPE.mainShoulder.northFootGuideXZ,x);
   if(roofZ===undefined||footZ===undefined||z>=footZ)return generic;
   // Endpoint return is an explicit C1 partition of the north profile and the
   // side return. Its weight is ZERO at both graph endpoints, so graph entry,
   // graph exit and the shared foot plane agree without an X-edge switch.
   const endWeight=smooth(16.1,16.5,x)*(1-smooth(18.75,19.1,x));
   let explicit: { weight: number; y: number };
   if(z>=roofZ){
     const t=clamp((z-roofZ)/(footZ-roofZ));
     explicit={weight:1,y:mix(JOINT_BANK_SHAPE.mainShoulder.roofY,generic.y,smooth(0,1,t))};
   }else{
     const weight=1-smooth(0,JOINT_BANK_SHAPE.mainShoulder.northReturnM,roofZ-z);
     // Always return this branch, including {weight:0,y:oldY}; the closed
     // northern return must never re-enter the polygon-distance feature.
     explicit={weight,y:weight===0?oldY:mix(oldY,JOINT_BANK_SHAPE.mainShoulder.roofY,weight)};
   }
   if(endWeight===1)return{...generic,...explicit,role:'explicit-north-profile'};
   if(endWeight===0)return generic;
   return{...generic,weight:mix(generic.weight,explicit.weight,endWeight),y:mix(generic.y,explicit.y,endWeight),role:'explicit-north-end-return'};
 }
 function detail(x: number,z: number,oldY: number): Detail{
   const g=guard(x,z);
   if(g===0)return{height:oldY,weight:0,guard:0,feature:null};
   const toe=JOINT_BANK_SHAPE.lowerToe,td=polygonDistance(x,z,toe.outline).signed,tw=1-smooth(0,toe.returnRun,Math.max(0,td));
   const toeY=toe.plane.y+(x-toe.plane.center[0])*toe.plane.tilt[0]+(z-toe.plane.center[1])*toe.plane.tilt[1];
   const toeBase=mix(oldY,Math.min(oldY,toeY),tw),connector=JOINT_BANK_SHAPE.lowerConnector,cd=polygonDistance(x,z,connector.outline).signed;
   const cw=1-smooth(0,connector.returnRun,Math.max(0,cd)),baseY=mix(toeBase,connector.y,cw);
   const features=JOINT_BANK_SHAPE.platforms.map(b=>({...feature(b,x,z,baseY),id:b.id})).filter(f=>f.weight>0);
   let mixedY=baseY,featureWeight=0,featureId=cw>0?'lower-south-bench-return':tw>0?'lower-graded-toe':null;
   if(features.length){
     const sum=features.reduce((s,f)=>s+f.weight,0);
     mixedY=features.reduce((s,f)=>s+f.y*f.weight,0)/sum;
     featureWeight=Math.max(...features.map(f=>f.weight));
     featureId=features.length>1?'upper-lower-continuous-join':features[0].id;
   }
   const facet=JOINT_BANK_SHAPE.outerFacet,facetDistance=polygonDistance(x,z,facet.outline).signed;
   const facetWeight=1-smooth(0,facet.returnRun,Math.max(0,facetDistance));
   const facetY=facet.y+(x-facet.center[0])*facet.tilt[0]+(z-facet.center[1])*facet.tilt[1];
   const target=facetWeight===0?mixedY:mix(mixedY,facetY,facetWeight);
   return{height:mix(oldY,target,g),weight:Math.max(featureWeight,cw,tw,facetWeight)*g,guard:g,feature:facetWeight>0?'wall-foot-diagonal-plane':featureId,supports:features.map(f=>({id:f.id,weight:f.weight})),facetWeight};
 }
 return { detail };
}

const BASELINE_REVISION = 'r5-leftbank-final-873c-a1e7-20ad-C325';
const finite = (value: number, name: string) => {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
};

/** D supplies the exact frozen pre-patch final analytic callback. Its original
 * function reference is retained for the composition/C baseline identity gate.
 * The caller must not supply already-patched terrain or a mesh-ray sampler.
 */
export function createReferenceGroveBankTarget(
  layout: ReferenceLayout,
  baselineTerrainHeight: (x: number, z: number) => number,
): ReferenceGroveBankTarget {
  if (typeof baselineTerrainHeight !== 'function') throw new TypeError('baselineTerrainHeight is required');
  const profile = createJointBankProfile(layout);
  const domain = Object.freeze({
    x: Object.freeze([...JOINT_BANK_SHAPE.domain.x]) as readonly [number, number],
    z: Object.freeze([...JOINT_BANK_SHAPE.domain.z]) as readonly [number, number],
  });
  const domainXZ = Object.freeze(JOINT_BANK_SHAPE.cProposal.localSurrogateDomain.map(point => Object.freeze([...point]) as XZ));
  function sampleTerrain(x: number, z: number) {
    finite(x, 'target x'); finite(z, 'target z');
    const oldY = finite(baselineTerrainHeight(x, z), 'baseline terrain Y');
    const detail = profile.detail(x, z, oldY);
    const terrainY = finite(detail.height, 'final terrain Y'), weight = finite(detail.weight, 'D feature weight');
    if (weight < 0 || weight > 1) throw new RangeError('D feature weight outside [0,1]');
    return { terrainY, weight };
  }
  const patch: ReferenceGroveBankPatch = Object.freeze({
    revision: REFERENCE_GROVE_BANK_PATCH_CONTRACT_REVISION,
    shapeRevision: JOINT_BANK_SHAPE.revision,
    baselineRevision: BASELINE_REVISION,
    domainXZ,
    rockInsetM: .18,
    baselineTerrainHeight,
    sample(x: number, z: number) {
      const target = sampleTerrain(x, z);
      const region = polygonDistance(x, z, domainXZ).signed;
      // One closed C partition fade, with the frozen shape-05 arithmetic.
      // D's target height remains analytic, with no mesh-error correction here.
      const edge = region >= 0 ? 0 : 1 - smooth(-.35, 0, region);
      return { terrainY: target.terrainY, weight: target.weight <= 0 ? 0 : edge * target.weight };
    },
  });
  return Object.freeze({ patch, domain, sampleTerrain });
}
