/** Geometry/provenance/water-space checks only. No UI tests. */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';

const base='public/world3d/reference/nature/scans/';
const manifest=JSON.parse(await fs.readFile(base+'manifest.json','utf8'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
for(const record of manifest.assets){
  assert.equal(record.license,'CC0-1.0');
  for(const [filename,expected] of [[`source/${record.id}.gltf`,record.gltf.sha256],[`source/${record.id}.bin`,record.sourceBin.sha256],...Object.values(record.quality).map(q=>[q.url,q.sha256])])assert.equal(sha(await fs.readFile(base+filename)),expected,filename);
}
const sourceOverride=process.argv.find(argument=>argument.startsWith('--source='))?.slice('--source='.length);
assert(!(sourceOverride&&process.argv.includes('--record')),'Do not record frozen metadata from an overridden source');
const source=await fs.readFile(sourceOverride??'src/world3d/reference/nature-scan-formation.ts','utf8');
if(!sourceOverride&&!process.argv.includes('--record')&&manifest.sampleExperiment?.factorySha256){
  assert.equal(sha(Buffer.from(source)),manifest.sampleExperiment.factorySha256,'frozen factory hash differs; regenerate validated metadata with --record');
  const reports=new Map(Object.values(manifest.sampleExperiment.samples).map(sample=>{const report=sample.denseWaterRouteProof?.report;return report?[report.url,report.sha256]:[];}).filter(entry=>entry.length));
  for(const [url,hash] of reports)assert.equal(sha(await fs.readFile(base+url)),hash,'frozen dense proof hash differs');
}
let js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
for(const name of ['three','three/examples/jsm/utils/BufferGeometryUtils.js','three/examples/jsm/geometries/ConvexGeometry.js']){
  const file=name==='three'?'three/build/three.module.js':name;
  js=js.replace(`from '${name}'`,`from '${pathToFileURL(process.cwd()+'/node_modules/'+file).href}'`);
}
const cascadeJS=ts.transpileModule(await fs.readFile('src/world3d/reference/nature-cascade.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const cascadeURL='data:text/javascript;base64,'+Buffer.from(cascadeJS).toString('base64');
const cascadeData=await import(cascadeURL);
js=js.replace("from './nature-cascade'",`from '${cascadeURL}'`);
js=js.replace('import.meta.env.BASE_URL',"'/'");
const module=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const originalFetch=globalThis.fetch;
let mode='normal',calls=0,activeController=null,materialDisposals=0,textureDisposals=0;
const ownedMaterials=[];
const cloneOriginal=THREE.MeshStandardMaterial.prototype.clone;
THREE.MeshStandardMaterial.prototype.clone=function(){const material=cloneOriginal.call(this);const record={material,disposals:0};material.addEventListener('dispose',()=>record.disposals++);ownedMaterials.push(record);if(mode==='late-abort')activeController.abort();return material;};
globalThis.fetch=async(url,options)=>{
  calls++;
  if(options?.signal?.aborted)throw new DOMException('Aborted','AbortError');
  if(mode==='missing'&&url.endsWith('.bin'))return new Response(null,{status:404});
  if(mode==='abort'&&url.endsWith('.bin')){activeController.abort();throw new DOMException('Aborted','AbortError');}
  let bytes=await fs.readFile('public'+url);
  if(mode==='truncated'&&url.endsWith('.bin'))bytes=bytes.subarray(0,64);
  return new Response(bytes);
};
const materials={limestone:new THREE.MeshStandardMaterial(),wetLimestone:new THREE.MeshStandardMaterial(),moss:new THREE.MeshStandardMaterial()};
const textures=[new THREE.Texture(),new THREE.Texture()];materials.limestone.map=textures[0];materials.wetLimestone.map=textures[1];
textures.forEach(texture=>texture.addEventListener('dispose',()=>textureDisposals++));
Object.values(materials).forEach(material=>material.addEventListener('dispose',()=>materialDisposals++));
const denseReportPath=process.argv.find(argument=>argument.startsWith('--dense-report='))?.slice('--dense-report='.length);
/** Fixed metre spacing, independent of waterfall length and local placement scale.
 * Whole route <=8cm, first metre <=2.5cm; nine width lanes include both full edges.
 * A miss remains explicit open air and never becomes an invented positive gap. */
const waterEnvelopePath=process.argv.find(argument=>argument.startsWith('--water-envelope='))?.slice('--water-envelope='.length);
const externalWaterEnvelope=waterEnvelopePath?JSON.parse(await fs.readFile(waterEnvelopePath,'utf8')):null;
const placementEvidence=externalWaterEnvelope?JSON.parse(await fs.readFile('src/world3d/evidence/reference-v3/r4/cascade-cap-audit-results.json','utf8')):null;
function compareConservativeWaterEnvelope(group){
  const input=externalWaterEnvelope,scale=placementEvidence.scale,translation=placementEvidence.placement.position,rows=[];
  const expected=point=>point.map((value,i)=>translation[i]+value*scale);
  assert(expected(cascadeData.CASCADE_LOCAL_WATER.lower.start).every((v,i)=>Math.abs(v-input.top[i])<1e-7),'B report top does not share C local frame');
  assert(expected(cascadeData.CASCADE_LOCAL_WATER.lower.end).every((v,i)=>Math.abs(v-input.bottom[i])<1e-7),'B report end does not share C local frame');
  for(const row of input.rows)for(const lobe of row.lobes){
    const worldY=input.top[1]-row.centerDescent,halfWidth=lobe.rx+lobe.maxRadialDynamic,samples=[];
    for(let lane=0;lane<=8;lane++){
      const worldX=lobe.centerX+(lane/8*2-1)*halfWidth;
      const local=new THREE.Vector3((worldX-translation[0])/scale,(worldY-translation[1])/scale,0);
      const hit=new THREE.Raycaster(new THREE.Vector3(local.x,local.y,12),new THREE.Vector3(0,0,-1),0,40).intersectObject(group,true)[0];
      const rockZ=hit?translation[2]+hit.point.z*scale:null,rearGap=hit?lobe.zEnvelopeConservative[0]-rockZ:null;
      samples.push({worldX,worldY,localXY:[local.x,local.y],actualRockSurfaceWorldZ:rockZ,conservativeRearWorldZ:lobe.zEnvelopeConservative[0],rearGapWorld:rearGap,state:rearGap===null?'no-rock-at-slice':rearGap<0?'potential-overlap-of-conservative-bound':'bound-in-front-at-slice'});
    }
    rows.push({centreDescentWorld:row.centerDescent,lobe:lobe.lobe,approximateXRange:[lobe.centerX-halfWidth,lobe.centerX+halfWidth],conservativeZRange:lobe.zEnvelopeConservative,reportedDynamicVerticalExtra:lobe.maxVerticalExtra,samples});
  }
  const all=rows.flatMap(row=>row.samples),finite=all.filter(s=>s.rearGapWorld!==null);
  return {scope:'Lower tier frozen B r3 conservative bounds only, compared with actual C rock at ring-centre horizontal Y slices. X uses reported nominal rx plus radial dynamic bound. Z extrema and X extrema need not occur at the same ring angle/phase; tilted ring vertical span is not reconstructed. Negative gap is potential bound overlap, not certified actual water-mesh penetration; positive slices do not certify complete dynamics.',transform:{scale,translation,yaw:placementEvidence.placement.yaw},sampleCount:all.length,potentialOverlapSamples:finite.filter(s=>s.rearGapWorld<0).length,noRockAtSliceSamples:all.length-finite.length,minimumRearGapWorld:Math.min(...finite.map(s=>s.rearGapWorld)),rows};
}

/** Inspect actual lowest mesh triangles independently of factory metadata. */
function auditLowestCap(group){
  const minimumY=new THREE.Box3().setFromObject(group).min.y,capEdges=new Map(),sideEdges=new Set(),points=new Map();
  let capTriangles=0,upwardTriangles=0,triangleArea=0,minNormalY=1,maxNormalY=-1;
  const key=p=>p.toArray().map(v=>v.toFixed(6)).join(',');
  const edgeKey=(a,b)=>a<b?`${a}|${b}`:`${b}|${a}`;
  group.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const positions=object.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i+=3){
      const p=[0,1,2].map(offset=>new THREE.Vector3().fromBufferAttribute(positions,i+offset).applyMatrix4(object.matrixWorld));
      const atBottom=p.map(v=>Math.abs(v.y-minimumY)<1e-6),isCap=atBottom.every(Boolean);
      if(isCap){
        const face=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])),normalY=face.y/face.length();
        capTriangles++;triangleArea+=face.length()*.5;minNormalY=Math.min(minNormalY,normalY);maxNormalY=Math.max(maxNormalY,normalY);if(normalY>-.99999)upwardTriangles++;
        for(let j=0;j<3;j++){const a=key(p[j]),b=key(p[(j+1)%3]);points.set(a,p[j]);points.set(b,p[(j+1)%3]);const edge=edgeKey(a,b),record=capEdges.get(edge);if(record)record.count++;else capEdges.set(edge,{a,b,count:1});}
      }else for(let j=0;j<3;j++)if(atBottom[j]&&atBottom[(j+1)%3])sideEdges.add(edgeKey(key(p[j]),key(p[(j+1)%3])));
    }
  });
  const boundary=[...capEdges.entries()].filter(([,e])=>e.count===1),adjacency=new Map();
  for(const [,edge] of boundary){adjacency.set(edge.a,[...(adjacency.get(edge.a)??[]),edge.b]);adjacency.set(edge.b,[...(adjacency.get(edge.b)??[]),edge.a]);}
  const degreeTwo=[...adjacency.values()].every(neighbours=>neighbours.length===2),loops=[],visited=new Set();
  if(degreeTwo)for(const start of adjacency.keys())if(!visited.has(start)){const loop=[];let previous=null,current=start;do{visited.add(current);loop.push(points.get(current));const neighbours=adjacency.get(current),next=neighbours.find(key=>key!==previous);previous=current;current=next;}while(current!==start&&!visited.has(current));loops.push(loop);}
  const orient=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  let outlineArea=0,selfIntersections=0;
  for(const loop of loops){outlineArea+=Math.abs(loop.reduce((sum,a,i)=>{const b=loop[(i+1)%loop.length];return sum+a.x*b.z-b.x*a.z;},0)*.5);
    for(let i=0;i<loop.length;i++)for(let j=i+1;j<loop.length;j++){if(j===i+1||(i===0&&j===loop.length-1))continue;const a=loop[i],b=loop[(i+1)%loop.length],c=loop[j],d=loop[(j+1)%loop.length];if(orient(a,b,c)*orient(a,b,d)<-1e-14&&orient(c,d,a)*orient(c,d,b)<-1e-14)selfIntersections++;}}
  const boundaryMatchesSidewall=boundary.length===sideEdges.size&&boundary.every(([key])=>sideEdges.has(key));
  const areaError=Math.abs(triangleArea-outlineArea),nonmanifoldEdges=[...capEdges.values()].filter(e=>e.count>2).length;
  return {method:'Actual lowest horizontal triangles: geometric face winding, boundary-versus-sidewall edge equality, reconstructed boundary loops, self-intersections and triangle/outline area comparison.',minimumY,capTriangles,upwardTriangles,faceNormalYRange:[minNormalY,maxNormalY],boundaryEdges:boundary.length,sidewallBottomEdges:sideEdges.size,boundaryMatchesSidewall,boundaryDegreeTwo:degreeTwo,boundaryLoops:loops.length,selfIntersections,nonmanifoldEdges,triangleArea,outlineArea,areaError,valid:capTriangles>0&&upwardTriangles===0&&boundaryMatchesSidewall&&degreeTwo&&loops.length===1&&selfIntersections===0&&nonmanifoldEdges===0&&areaError<1e-6};
}

/** Exact planar baseline check complements stations: clip each actual triangle
 * to the complete XY water ribbon, then minimize the affine waterZ(y)-rockZ.
 * This covers gaps between longitudinal stations and transverse lanes. */
function continuousWaterRibbon(group,anchors){
  const tiers={};
  for(const [name,tier] of Object.entries(anchors)){
    const [sx,sy,sz]=tier.start,[ex,ey,ez]=tier.end,dy=sy-ey;
    const centreX=y=>ex+(sx-ex)*(y-ey)/dy,waterZ=y=>ez+(sz-ez)*(y-ey)/dy;
    const planes=[p=>p.y-ey,p=>sy-p.y,p=>p.x-centreX(p.y)+tier.width/2,p=>centreX(p.y)+tier.width/2-p.x];
    let minimumClearance=Infinity,worst=null,testedTriangles=0,insufficientClearanceTriangles=0;
    group.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      const positions=object.geometry.getAttribute('position');
      for(let i=0;i<positions.count;i+=3){
        let polygon=[0,1,2].map(offset=>new THREE.Vector3().fromBufferAttribute(positions,i+offset).applyMatrix4(object.matrixWorld));
        for(const plane of planes){
          const output=[];
          for(let j=0;j<polygon.length;j++){
            const a=polygon[j],b=polygon[(j+1)%polygon.length],da=plane(a),db=plane(b),aInside=da>=-1e-10,bInside=db>=-1e-10;
            if(aInside)output.push(a);
            if(aInside!==bInside)output.push(a.clone().lerp(b,da/(da-db)));
          }
          polygon=output;if(!polygon.length)break;
        }
        if(!polygon.length)continue;testedTriangles++;
        const localMinimum=Math.min(...polygon.map(p=>waterZ(p.y)-p.z));if(localMinimum<=.035)insufficientClearanceTriangles++;
        for(const p of polygon){const clearance=waterZ(p.y)-p.z;if(clearance<minimumClearance){minimumClearance=clearance;worst={rockPoint:p.toArray(),waterPoint:[p.x,p.y,waterZ(p.y)],clearance,distance:new THREE.Vector3(...tier.start).distanceTo(new THREE.Vector3(centreX(p.y),p.y,waterZ(p.y))),widthFraction:(p.x-centreX(p.y))/tier.width};}}
      }
    });
    tiers[name]={minimumClearance,worst,testedTriangles,insufficientClearanceTriangles,allProjectedTrianglesBehindRibbon:minimumClearance>.035};
  }
  return {method:'Clip all actual finished rock triangles against each complete XY water ribbon, minimize affine waterZ(y)-rockZ on every resulting polygon vertex. Covers the continuous planar baseline including spaces between dense ray stations and lanes.',minimumRequiredClearance:.035,allRibbonsClear:Object.values(tiers).every(t=>t.allProjectedTrianglesBehindRibbon),tiers};
}
function denseWaterRoute(group,anchors){
  const probes=[],tiers={};
  for(const [name,tier] of Object.entries(anchors)){
    const start=new THREE.Vector3(...tier.start),end=new THREE.Vector3(...tier.end),length=start.distanceTo(end),distances=new Set([0,length]);
    const wholeSteps=Math.ceil(length/.08),lipLength=Math.min(1,length),lipSteps=Math.ceil(lipLength/.025);
    for(let i=0;i<=wholeSteps;i++)distances.add(i/wholeSteps*length);
    for(let i=0;i<=lipSteps;i++)distances.add(i/lipSteps*lipLength);
    const stations=[...distances].sort((a,b)=>a-b);
    tiers[name]={length,stations:stations.length,fullRouteMaximumStepMetres:.08,firstMetreMaximumStepMetres:.025,widthFractions:[-.5,-.375,-.25,-.125,0,.125,.25,.375,.5]};
    for(const distance of stations){
      const t=distance/length,centre=start.clone().lerp(end,t);
      for(const fraction of tiers[name].widthFractions){
        const point=centre.clone();point.x+=tier.width*fraction;
        const hit=new THREE.Raycaster(point.clone().add(new THREE.Vector3(0,0,12)),new THREE.Vector3(0,0,-1),0,40).intersectObject(group,true)[0];
        const clearance=hit?point.z-hit.point.z:null;
        probes.push({tier:name,distance,t,widthFraction:fraction,point:point.toArray(),surfaceZ:hit?.point.z??null,clearance,state:clearance===null?'no-rock-behind':clearance>.035?'front-clear':'occluded-or-too-close'});
      }
    }
  }
  const finite=probes.filter(p=>p.clearance!==null),blocked=finite.filter(p=>p.clearance<=.035);
  return {method:'Actual finished meshes, horizontal -Z rays from +12m Z. Arc-length metre spacing and full-width lanes. No-hit is explicit open air, not a positive clearance or a source-support claim.',minimumRequiredClearance:.035,tiers,totalProbes:probes.length,finiteSurfaceProbes:finite.length,noRockBehindProbes:probes.length-finite.length,blockedProbes:blocked.length,minimumFiniteClearance:Math.min(...finite.map(p=>p.clearance)),worstProbe:finite.reduce((a,b)=>a.clearance<b.clearance?a:b),allSampledRoutesClear:blocked.length===0,probes};
}
const samples={};
try{
  for(const quality of ['low','high']){
    const group=await module.createScannedLimestoneFormation({quality,materials});
    const dense=denseWaterRoute(group,group.userData.natureAsset.waterAnchors);
    const continuous=continuousWaterRibbon(group,group.userData.natureAsset.waterAnchors);
    const cap=auditLowestCap(group);
    const externalEnvelopeComparison=externalWaterEnvelope?compareConservativeWaterEnvelope(group):null;
    let triangles=0;
    group.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      const p=object.geometry.getAttribute('position'),n=object.geometry.getAttribute('normal');
      for(const attribute of Object.values(object.geometry.attributes))assert(attribute.array.every(Number.isFinite));
      for(let i=0;i<p.count;i+=3){
        const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);
        const face=b.sub(a).cross(c.sub(a));
        assert(face.lengthSq()>1e-15,`${quality}: degenerate face`);
        for(let j=0;j<3;j++)assert(face.dot(new THREE.Vector3().fromBufferAttribute(n,i+j))>-1e-9,`${quality}: reversed normal`);
      }
      triangles+=p.count/3;
      assert(!Object.values(materials).includes(object.material),'returned mesh must own a clone');
      const owned=ownedMaterials.find(record=>record.material===object.material);assert(owned);assert.equal(owned.disposals,0,'merge-input disposal released returned material');
      object.geometry.dispose();object.geometry.dispose();assert.equal(owned.disposals,1,'final geometry must release owned material exactly once');
    });
    const result=group.userData.natureAsset;
    assert.equal(result.draws,1);assert.equal(result.materialOwnership.ownedMaterials,1);assert.equal(triangles,result.triangles);
    assert(result.waterClearanceProof.allCentrelinesClear,`${quality}: water centre is buried`);
    assert(result.waterClearanceProof.allSampledWidthClear,`${quality}: water width is buried`);
    assert(result.ledgeGroundProof.every(p=>p.floorY!==null&&p.waterAboveFloor>=.015&&p.waterAboveFloor<.24),`${quality}: ledge flow lacks physical support`);
    assert(result.waterAttachments.filter(p=>p.id!=='lower.end').every(p=>p.physicallySupported&&p.floorY!==null),`${quality}: source or spill lip lacks physical support`);
    assert.equal(result.waterAttachments.find(p=>p.id==='lower.end').targetPoolY,.16);
    assert(result.solidJoins.upperSource.builtIntoMainBody&&result.solidJoins.lowerSpill.attachmentVerticesInsideBody>0,`${quality}: source or lip floats outside main volume`);
    const body=result.parts.find(p=>p.placement==='continuous-scan-derived-closed-volume');assert(body.topology.boundaryEdges===0&&body.topology.nonManifoldEdges===0&&body.topology.signedVolume>0,'closed derived topology or outward winding failed');
    assert(result.parts.every(p=>p.position&&Number.isFinite(p.yaw)&&Number.isFinite(p.uniformScale)&&Number.isFinite(p.depthScale)));
    result.denseWaterRouteProof=dense;result.continuousWaterRibbonProof=continuous;result.bottomCapProof=cap;if(externalEnvelopeComparison)result.externalWaterEnvelopeComparison=externalEnvelopeComparison;
    samples[quality]=result;
    if(!denseReportPath)assert(cap.valid,`${quality}: invalid actual bottom cap: ${JSON.stringify(cap)}`);
    if(!denseReportPath)assert(continuous.allRibbonsClear,`${quality}: continuous water ribbon blocked: ${JSON.stringify(continuous.tiers)}`);
    if(!denseReportPath)assert(dense.allSampledRoutesClear,`${quality}: dense water route blocked: ${JSON.stringify(dense.worstProbe)}`);
  }
  for(const axis of [0,1,2])for(const side of ['min','max'])assert(Math.abs(samples.low.bounds[side][axis]-samples.high.bounds[side][axis])<.15,'LOD envelope divergence');
  activeController=new AbortController();activeController.abort();const before=calls;
  await assert.rejects(module.createScannedLimestoneFormation({quality:'low',materials,signal:activeController.signal}));assert.equal(calls,before);
  for(const failure of ['missing','truncated','abort','late-abort']){mode=failure;activeController=new AbortController();await assert.rejects(module.createScannedLimestoneFormation({quality:'low',materials,signal:activeController.signal}));}
  assert.equal(materialDisposals,0,'borrowed materials were disposed');assert.equal(textureDisposals,0,'borrowed maps were disposed');
  assert(ownedMaterials.length===3&&ownedMaterials.every(record=>record.disposals===1),'owned clone leaked on success or partial failure');
  if(denseReportPath)await fs.writeFile(denseReportPath,JSON.stringify({factorySha256:sha(Buffer.from(source)),phase:'dense route diagnostic',samples:Object.fromEntries(Object.entries(samples).map(([quality,result])=>[quality,{bounds:result.bounds,denseWaterRouteProof:result.denseWaterRouteProof,continuousWaterRibbonProof:result.continuousWaterRibbonProof,bottomCapProof:result.bottomCapProof,waterAttachments:result.waterAttachments}]))},null,2)+'\n');
  if(externalWaterEnvelope){
    const currentInputHashes=Object.fromEntries(await Promise.all(Object.keys(externalWaterEnvelope.sha256).map(async path=>[path,sha(await fs.readFile(path))])));
    await fs.mkdir(base+'validation',{recursive:true});
    const shaderSource=await fs.readFile('src/world3d/reference/water-falls-shaders.ts','utf8');
    const knownCurrentVertexBound=shaderSource.includes('float radial = clamp(swell + flutter * edge, -aForm.x, aForm.x);')&&shaderSource.includes('p += normal * radial * envelope;')&&shaderSource.includes('p.y += sin(phase * 1.17 + aForm.y) * aForm.x * .34 * envelope;');
    const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
    const currentClosedLobeBounds=externalWaterEnvelope.rows.flatMap(row=>row.lobes.map(lobe=>{const form=Math.min(.17,lobe.rx*.22,lobe.rz*.22),envelope=smooth(.015,.12,row.v)*(1-smooth(.94,1,row.v)),radial=form*envelope,vertical=form*.34*envelope;return {centreDescentWorld:row.centerDescent,lobe:lobe.lobe,currentMaximumRadial:radial,reportedRadial:lobe.maxRadialDynamic,currentMaximumExtraVertical:vertical,reportedExtraVertical:lobe.maxVerticalExtra,reportedBoundsRemainConservativeAtStation:radial<=lobe.maxRadialDynamic+.0001&&vertical<=lobe.maxVerticalExtra+.0001};}));
    const sameStaticGeometry=currentInputHashes['src/world3d/reference/water-falls.ts']===externalWaterEnvelope.sha256['src/world3d/reference/water-falls.ts'];
    await fs.copyFile(waterEnvelopePath,base+'validation/b-r3-lip-envelope-input.json');
    await fs.writeFile(base+'validation/b-r3-conservative-envelope-comparison.json',JSON.stringify({cFactorySha256:sha(Buffer.from(source)),bEnvelopeReportSha256:sha(await fs.readFile(waterEnvelopePath)),providedBAndLayoutHashes:externalWaterEnvelope.sha256,currentInputHashes,providedHashesMatchCurrent:Object.entries(externalWaterEnvelope.sha256).every(([path,hash])=>currentInputHashes[path]===hash),currentClosedLobeBoundReview:{scope:'Current three primary closed lobes at the reported stations only. Static constructor hash unchanged, unit radial normals, aForm=min(.17,rx*.22,rz*.22), total radial shader clamp and unchanged extra vertical formula. Rounding tolerance 0.1mm. Does not cover veil/droplet/fragments, unreported stations, actual ring-angle contact or visual continuity; this is a bound check, not a literal diff against unavailable r3 shader source.',knownCurrentVertexBound,sameStaticGeometry,reportedBoundsRemainConservativeAtStations:knownCurrentVertexBound&&sameStaticGeometry&&currentClosedLobeBounds.every(row=>row.reportedBoundsRemainConservativeAtStation),stations:currentClosedLobeBounds},samples:Object.fromEntries(Object.entries(samples).map(([quality,result])=>[quality,result.externalWaterEnvelopeComparison]))},null,2)+'\n');
  }
  if(process.argv.includes('--record')){
    const reportURL='validation/dense-water-route-final.json';
    const reportBytes=Buffer.from(JSON.stringify({factorySha256:sha(Buffer.from(source)),sharedWaterDataSha256:sha(Buffer.from(JSON.stringify(cascadeData.CASCADE_LOCAL_WATER))),samples:Object.fromEntries(Object.entries(samples).map(([quality,result])=>[quality,{denseWaterRouteProof:result.denseWaterRouteProof,continuousWaterRibbonProof:result.continuousWaterRibbonProof,bottomCapProof:result.bottomCapProof,waterAttachments:result.waterAttachments}]))},null,2)+'\n');
    await fs.mkdir(base+'validation',{recursive:true});await fs.writeFile(base+reportURL,reportBytes);
    const recordedSamples=Object.fromEntries(Object.entries(samples).map(([quality,result])=>{const {probes,...summary}=result.denseWaterRouteProof;return [quality,{...result,denseWaterRouteProof:{...summary,report:{url:reportURL,sha256:sha(reportBytes)}}}];}));
    manifest.sampleExperiment={factory:'createScannedLimestoneFormation',factorySha256:sha(Buffer.from(source)),sharedWaterDataSha256:sha(Buffer.from(JSON.stringify(cascadeData.CASCADE_LOCAL_WATER))),sharedWaterHashBasis:'JSON.stringify(CASCADE_LOCAL_WATER)',source:'src/world3d/reference/nature-scan-formation.ts',samples:recordedSamples};
    await fs.writeFile(base+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
    await fs.writeFile(base+'sample-layout.json',JSON.stringify(recordedSamples.high,null,2)+'\n');
  }
  console.log(JSON.stringify({status:denseReportPath?(Object.values(samples).every(s=>s.denseWaterRouteProof.allSampledRoutesClear&&s.continuousWaterRibbonProof.allRibbonsClear&&s.bottomCapProof.valid)?'DENSE_DIAGNOSTIC_CLEAR':'DENSE_DIAGNOSTIC_BLOCKED'):'PASS',checks:['official-source-and-derived-hashes','finite-and-nondegenerate-geometry','source-normal-local-repair','LOD-envelope','water-centres-and-sampled-width','dense-full-width-route-and-first-metre','continuous-planar-ribbon-vs-all-triangles','physical-source-spill-and-midledge','attachment-volume-overlap','closed-derived-topology-and-outward-volume','lowest-cap-winding-boundary-and-area','owned-material-success-partial-failure-repeat-dispose','borrowed-material-and-map-ownership','preabort-no-fetch','missing-payload','truncated-payload','abort-during-fetch'],samples:Object.fromEntries(Object.entries(samples).map(([quality,result])=>[quality,{triangles:result.triangles,draws:result.draws,bounds:result.bounds,minimumWaterClearance:Math.min(...result.waterClearanceProof.probes.filter(p=>p.clearance!==null).map(p=>p.clearance)),ledge:result.ledgeGroundProof,denseWaterRoute:{total:result.denseWaterRouteProof.totalProbes,blocked:result.denseWaterRouteProof.blockedProbes,noRockBehind:result.denseWaterRouteProof.noRockBehindProbes,minimumFiniteClearance:result.denseWaterRouteProof.minimumFiniteClearance,worst:result.denseWaterRouteProof.worstProbe}}]))},null,2));
}finally{globalThis.fetch=originalFetch;THREE.MeshStandardMaterial.prototype.clone=cloneOriginal;Object.values(materials).forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());}
