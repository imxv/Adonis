import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {ConvexGeometry} from 'three/examples/jsm/geometries/ConvexGeometry.js';
import {CASCADE_LOCAL_WATER} from './nature-cascade';
import type {LimestoneFormationOptions} from './nature-rocks';

type V3 = [number,number,number];
interface Scan {id:string;positions:Float32Array;normals:Float32Array;indices:Uint32Array;sourceUV:Float32Array}
interface ManifestFile {url:string;vertexCount:number;indexCount:number;strideFloats:number;indexByteOffset:number;bytes:number;sha256:string}
interface Manifest {version:number;assets:{id:string;page:string;authors:Record<string,string>;license:string;sourceBounds:{min:V3;max:V3;size:V3};quality:Record<'low'|'high',ManifestFile>}[]}

function aborted(signal?:AbortSignal):void {if(signal?.aborted)throw signal.reason??new DOMException('Aborted','AbortError');}

async function loadScan(base:string,record:Manifest['assets'][number],quality:'low'|'high',signal?:AbortSignal):Promise<Scan>{
  const file=record.quality[quality];
  const response=await fetch(base+file.url,{signal});
  if(!response.ok)throw new Error(`Scan geometry failed: ${record.id} (${response.status})`);
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength!==file.bytes||file.strideFloats!==8||file.indexByteOffset!==file.vertexCount*32||file.indexByteOffset+file.indexCount*4!==bytes.byteLength)throw new Error(`Invalid scan payload: ${record.id}`);
  const floats=new Float32Array(bytes,0,file.vertexCount*8),indices=new Uint32Array(bytes,file.indexByteOffset,file.indexCount);
  const positions=new Float32Array(file.vertexCount*3),normals=new Float32Array(file.vertexCount*3),sourceUV=new Float32Array(file.vertexCount*2);
  for(let i=0;i<file.vertexCount;i++){
    for(let j=0;j<3;j++){positions[i*3+j]=floats[i*8+j];normals[i*3+j]=floats[i*8+3+j];}
    sourceUV[i*2]=floats[i*8+6];sourceUV[i*2+1]=floats[i*8+7];
  }
  if(!positions.every(Number.isFinite)||!normals.every(Number.isFinite)||!indices.every(i=>i<file.vertexCount))throw new Error(`Invalid scan attributes: ${record.id}`);
  aborted(signal);
  return {id:record.id,positions,normals,indices,sourceUV};
}

/** This local authoring deformation recesses a broad continuous face around the
 * fixed water line. It does not add a separate channel mesh or change anchors. */
function channelAt(y:number):{x:number;z:number;width:number}{
  if(y>=4.9){const t=THREE.MathUtils.clamp((y-4.9)/3.82,0,1);return {x:THREE.MathUtils.lerp(.7,.35,t),z:THREE.MathUtils.lerp(.25,-1.12,t),width:1.03};}
  const t=THREE.MathUtils.clamp((y-.16)/4.69,0,1);return {x:THREE.MathUtils.lerp(1.25,1.15,t),z:Math.min(THREE.MathUtils.lerp(1.69,.58,t),.25+1.4*THREE.MathUtils.smoothstep(4.9-y,0,1.2)),width:1.23};
}
function addWetness(geometry:THREE.BufferGeometry):void {
  const p=geometry.getAttribute('position'),mask=new Float32Array(p.count);
  for(let i=0;i<p.count;i++){
    const y=p.getY(i),{x,width}=channelAt(y);
    const offset=.14*Math.sin(y*1.7)+.08*Math.sin(p.getX(i)*2.1+y*.6);
    const across=1-THREE.MathUtils.smoothstep(Math.abs(p.getX(i)-x+offset),width*.55,width+1.0);
    mask[i]=across*THREE.MathUtils.smoothstep(p.getZ(i),-4.4,-2.2)*THREE.MathUtils.smoothstep(y,-.1,.4);
  }
  geometry.setAttribute('scanWetness',new THREE.Float32BufferAttribute(mask,1));
}
function continuousWetMaterial(materials:LimestoneFormationOptions['materials']):THREE.MeshStandardMaterial {
  const dry=materials.limestone as THREE.MeshStandardMaterial,wet=materials.wetLimestone as THREE.MeshStandardMaterial;
  if(!dry.isMeshStandardMaterial||!wet.isMeshStandardMaterial)throw new Error('Scanned cliff requires MeshStandardMaterial dry/wet inputs');
  const material=dry.clone();material.name='Scan-owned continuous damp transition';material.vertexColors=true;
  material.onBeforeCompile=shader=>{
    shader.uniforms.scanWetColor={value:wet.color.clone()};shader.uniforms.scanWetRoughness={value:wet.roughness};
    if(wet.map)shader.uniforms.scanWetMap={value:wet.map};
    if(wet.roughnessMap)shader.uniforms.scanWetRoughnessMap={value:wet.roughnessMap};
    shader.vertexShader='attribute float scanWetness; varying float vScanWetness; varying vec2 vScanBlendUv;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvScanWetness=scanWetness; vScanBlendUv=uv;');
    shader.fragmentShader='varying float vScanWetness; varying vec2 vScanBlendUv; uniform vec3 scanWetColor; uniform float scanWetRoughness;\n'+
      (wet.map?'uniform sampler2D scanWetMap;\n':'')+(wet.roughnessMap?'uniform sampler2D scanWetRoughnessMap;\n':'')+shader.fragmentShader;
    const wetColor=wet.map?'texture2D(scanWetMap,vScanBlendUv).rgb':'vec3(1.0)';
    const wetRough=wet.roughnessMap?'texture2D(scanWetRoughnessMap,vScanBlendUv).g':'1.0';
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,scanWetColor*${wetColor},clamp(vScanWetness,0.0,1.0));`)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,scanWetRoughness*${wetRough},clamp(vScanWetness,0.0,1.0));`);
  };
  material.customProgramCacheKey=()=>`scan-continuous-damp-v1-${Boolean(wet.map)}-${Boolean(wet.roughnessMap)}`;
  return material;
}

/** Rasterise the actual scan triangles into an XY relief field. Missing pixels
 * are extended from measured neighbours. The resulting continuous volume is a
 * new scan-derived retopology, not the original open triangle connectivity. */
type ReliefField=((u:number,v:number)=>number)&{outline:(v:number)=>[number,number];coverage:{measuredPixels:number;extendedPixels:number;totalPixels:number}};
function scanRelief(source:Scan):ReliefField {
  const size=160,grid=new Float32Array(size*size);grid.fill(-Infinity);
  const box=new THREE.Box3();
  for(let i=0;i<source.positions.length;i+=3)box.expandByPoint(new THREE.Vector3().fromArray(source.positions,i));
  const extent=box.getSize(new THREE.Vector3()),vertices:V3[]=[];
  for(let i=0;i<source.positions.length;i+=3)vertices.push([(source.positions[i]-box.min.x)/extent.x*(size-1),(source.positions[i+1]-box.min.y)/extent.y*(size-1),(source.positions[i+2]-box.min.z)/extent.z-.5]);
  for(let i=0;i<source.indices.length;i+=3){
    const a=vertices[source.indices[i]],b=vertices[source.indices[i+1]],c=vertices[source.indices[i+2]];
    const area=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(area)<1e-8)continue;
    for(let y=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1])));y<=Math.min(size-1,Math.ceil(Math.max(a[1],b[1],c[1])));y++)
      for(let x=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0])));x<=Math.min(size-1,Math.ceil(Math.max(a[0],b[0],c[0])));x++){
        const wa=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/area,wb=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/area,wc=1-wa-wb;
        if(wa>=-.001&&wb>=-.001&&wc>=-.001)grid[y*size+x]=Math.max(grid[y*size+x],wa*a[2]+wb*b[2]+wc*c[2]);
      }
  }
  const outline:[number,number][]=[];
  for(let y=0;y<size;y++){let left=size,right=-1;for(let x=0;x<size;x++)if(Number.isFinite(grid[y*size+x])){left=Math.min(left,x);right=Math.max(right,x);}outline.push([left/(size-1),right/(size-1)]);}
  for(let y=0;y<size;y++)if(outline[y][0]>outline[y][1]){let distance=1;while(distance<size){const near=[y-distance,y+distance].find(row=>row>=0&&row<size&&outline[row][0]<=outline[row][1]);if(near!==undefined){outline[y]=outline[near];break;}distance++;}}
  // Breadth-first nearest measured neighbour fills only missing projections.
  const queue:number[]=[];for(let i=0;i<grid.length;i++)if(Number.isFinite(grid[i]))queue.push(i);
  const measuredPixels=queue.length;
  for(let head=0;head<queue.length;head++){const i=queue[head],x=i%size,y=Math.floor(i/size);for(const j of [x>0?i-1:-1,x<size-1?i+1:-1,y>0?i-size:-1,y<size-1?i+size:-1])if(j>=0&&!Number.isFinite(grid[j])){grid[j]=grid[i];queue.push(j);}}
  const sample=((u:number,v:number)=>{const x=THREE.MathUtils.clamp(u,0,1)*(size-1),y=THREE.MathUtils.clamp(v,0,1)*(size-1),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,size-1),y1=Math.min(y0+1,size-1);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(grid[y0*size+x0],grid[y0*size+x1],x-x0),THREE.MathUtils.lerp(grid[y1*size+x0],grid[y1*size+x1],x-x0),y-y0);}) as ReliefField;
  sample.outline=(v:number)=>{const y=THREE.MathUtils.clamp(v,0,1)*(size-1),a=Math.floor(y),b=Math.min(a+1,size-1);return [THREE.MathUtils.lerp(outline[a][0],outline[b][0],y-a),THREE.MathUtils.lerp(outline[a][1],outline[b][1],y-a)];};
  sample.coverage={measuredPixels,extendedPixels:size*size-measuredPixels,totalPixels:size*size};
  return sample;
}
function continuousScannedVolume(one:Scan,two:Scan,quality:'low'|'high'):THREE.BufferGeometry {
  const front=scanRelief(one),side=scanRelief(two),around=quality==='high'?256:96,rows=quality==='high'?144:72;
  const positions:number[]=[],indices:number[]=[],uv:number[]=[],colors:number[]=[];
  const width=13.956301212,cx=(6.6-7.356301212)/2,height=8.68;
  for(let row=0;row<rows;row++){
    const t=row/rows;
    const measuredOutline=front.outline(t);
    const left=measuredOutline[0]-.10,right=measuredOutline[1]+.10;
    // The broad middle establishes the shared LOD envelope; scan relief changes
    // the visible side contour and joins around the entire circumference.
    const rowWidth=right-left;
    for(let column=0;column<around;column++){
      const theta=column/around*Math.PI*2,sin=Math.sin(theta),cos=Math.cos(theta),u=(Math.sign(sin)*Math.pow(Math.abs(sin),.78)+1)/2;
      const measure=front(u,t),flank=side((cos+1)/2,t);
      const outline=(flank-side(.5,.5))*2.1*Math.pow(Math.abs(sin),5);
      let x=cx+(left+u*rowWidth-.5)*width+outline*Math.sign(sin);
      let y=t*height+.12*Math.sin(theta*3+.6)*Math.pow(t,5);
      const depth=(2.4+.3*Math.sin(t*3.8));
      const cross=Math.sign(cos)*Math.pow(Math.abs(cos),.24);
      let z=-2.5+depth*cross;
      const frontFactor=THREE.MathUtils.smoothstep(cos,-.1,.65),backFactor=THREE.MathUtils.smoothstep(-cos,-.1,.65);
      z+=measure*4.05*frontFactor+side(1-u,t)*2.3*backFactor+flank*1.3*(1-Math.abs(cos));
      const channel=channelAt(y),influence=1-THREE.MathUtils.smoothstep(Math.abs(x-channel.x),channel.width+.12,channel.width+1.4);
      z-=frontFactor*influence*(1.25+.7*THREE.MathUtils.smoothstep(y,4.4,8.7));
      const ledgeAcross=1-THREE.MathUtils.smoothstep(Math.abs(x-.85),.8,2.0);
      const ledgeRise=THREE.MathUtils.smoothstep(y,3.9,4.6)*(1-THREE.MathUtils.smoothstep(y,4.72,5.18));
      z=THREE.MathUtils.lerp(z,Math.max(z,.54),frontFactor*ledgeAcross*ledgeRise);
      // A broad oblique rear shoulder break uses the second measured field,
      // preventing the upper rear corner from remaining one long straight edge.
      const fracture=THREE.MathUtils.smoothstep(-cos,.2,.9)*THREE.MathUtils.smoothstep(t,.55,.92)*(.4+.9*THREE.MathUtils.smoothstep(-sin,.1,.9))*(.75+.5*flank);
      x-=Math.sign(sin)*fracture*.8;z+=fracture*.9;y-=fracture*.35;
      const crestMix=THREE.MathUtils.smoothstep(t,.88,.98),crestT=THREE.MathUtils.clamp((t-.88)/.12,0,1);
      x=THREE.MathUtils.lerp(x,.35+sin*1.6,crestMix);
      z=THREE.MathUtils.lerp(z,-1.85+.732*cos,crestMix);
      y=THREE.MathUtils.lerp(y,8.75-.25*(1-crestT)-.14*Math.max(cos,0),crestMix);
      positions.push(x,y,z);uv.push(x/3,y/3);colors.push(.98,.978,.966);
    }
  }
  for(let row=0;row<rows-1;row++)for(let column=0;column<around;column++){
    const a=row*around+column,b=row*around+(column+1)%around,c=(row+1)*around+column,d=(row+1)*around+(column+1)%around;
    indices.push(a,b,c,b,d,c);
  }
  const top=positions.length/3;positions.push(.35,8.75,-1.85);uv.push(0,8.75/3);colors.push(.98,.978,.966);
  // The source-derived bottom outline is concave. A centre fan crossed its
  // reentrant water-groove corners and produced upward/overlapping triangles.
  // Earcut uses the real ordered ring, keeping every sidewall boundary vertex.
  const bottomOutline=Array.from({length:around},(_,i)=>new THREE.Vector2(positions[i*3],positions[i*3+2]));
  const orient=(a:THREE.Vector2,b:THREE.Vector2,c:THREE.Vector2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  let selfIntersections=0;
  for(let i=0;i<around;i++)for(let j=i+1;j<around;j++){
    if(j===i+1||(i===0&&j===around-1))continue;
    const a=bottomOutline[i],b=bottomOutline[(i+1)%around],c=bottomOutline[j],d=bottomOutline[(j+1)%around];
    if(orient(a,b,c)*orient(a,b,d)<-1e-14&&orient(c,d,a)*orient(c,d,b)<-1e-14)selfIntersections++;
  }
  if(selfIntersections)throw new Error('Self-intersecting scan-derived bottom outline');
  const bottomFaces=THREE.ShapeUtils.triangulateShape(bottomOutline,[]),bottomEdges=new Map<string,number>();
  let bottomArea=0;
  for(const [a,b,c] of bottomFaces){
    const area=orient(bottomOutline[a],bottomOutline[b],bottomOutline[c])*.5;
    if(area<=1e-12)throw new Error('Invalid bottom Earcut winding or degenerate face');
    bottomArea+=area;indices.push(a,b,c);
    for(const [v,w] of [[a,b],[b,c],[c,a]]){const key=v<w?`${v},${w}`:`${w},${v}`;bottomEdges.set(key,(bottomEdges.get(key)??0)+1);}
  }
  const expectedBoundary=new Set(Array.from({length:around},(_,i)=>{const j=(i+1)%around;return i<j?`${i},${j}`:`${j},${i}`;}));
  const actualBoundary=[...bottomEdges].filter(([,count])=>count===1).map(([key])=>key);
  const boundaryMatchesSidewall=actualBoundary.length===around&&actualBoundary.every(key=>expectedBoundary.has(key));
  const outlineArea=Math.abs(bottomOutline.reduce((sum,a,i)=>{const b=bottomOutline[(i+1)%around];return sum+a.x*b.y-b.x*a.y;},0)*.5);
  if(!boundaryMatchesSidewall||Math.abs(bottomArea-outlineArea)>1e-7*Math.max(1,outlineArea))throw new Error('Bottom triangulation did not preserve the true sidewall footprint');
  const bottomCap={method:'Earcut of true ordered concave XZ bottom ring, no centre fan',triangles:bottomFaces.length,outerRingVertices:around,boundaryMatchesSidewall,selfIntersections,triangleArea:bottomArea,outlineArea,allGeometricFacesTowardNegativeY:true};
  for(let column=0;column<around;column++){const next=(column+1)%around;indices.push(top,(rows-1)*around+column,(rows-1)*around+next);}
  let minX=Infinity,maxX=-Infinity;for(let i=0;i<positions.length;i+=3){minX=Math.min(minX,positions[i]);maxX=Math.max(maxX,positions[i]);}
  const normalizedCrestX=-7.356301212+(.35-minX)/(maxX-minX)*width;
  for(let i=0;i<positions.length;i+=3){positions[i]=-7.356301212+(positions[i]-minX)/(maxX-minX)*width;positions[i]+=(.35-normalizedCrestX)*THREE.MathUtils.smoothstep(positions[i+1],8.05,8.35);}
  const edgeCounts=new Map<string,number>();let signedVolume=0;
  for(let i=0;i<indices.length;i+=3){const a=new THREE.Vector3().fromArray(positions,indices[i]*3),b=new THREE.Vector3().fromArray(positions,indices[i+1]*3),c=new THREE.Vector3().fromArray(positions,indices[i+2]*3);signedVolume+=a.dot(b.cross(c))/6;for(let j=0;j<3;j++){const v=indices[i+j],w=indices[i+(j+1)%3],key=v<w?`${v},${w}`:`${w},${v}`;edgeCounts.set(key,(edgeCounts.get(key)??0)+1);}}
  const topology={vertices:positions.length/3,triangles:indices.length/3,boundaryEdges:[...edgeCounts.values()].filter(n=>n===1).length,nonManifoldEdges:[...edgeCounts.values()].filter(n=>n!==2).length,signedVolume};
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('uv1',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const result=geometry.toNonIndexed();geometry.dispose();
  const rp=result.getAttribute('position'),rn=result.getAttribute('normal');let normalRepairs=0;
  for(let i=0;i<rp.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(rp,i),b=new THREE.Vector3().fromBufferAttribute(rp,i+1),c=new THREE.Vector3().fromBufferAttribute(rp,i+2),face=b.sub(a).cross(c.sub(a)).normalize();for(let j=0;j<3;j++)if(face.dot(new THREE.Vector3().fromBufferAttribute(rn,i+j))<.05){rn.setXYZ(i+j,face.x,face.y,face.z);normalRepairs++;}}
  const projected:number[]=[];
  for(let i=0;i<rp.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(rp,i),b=new THREE.Vector3().fromBufferAttribute(rp,i+1),c=new THREE.Vector3().fromBufferAttribute(rp,i+2),face=b.sub(a).cross(c.sub(a)).normalize(),top=Math.abs(face.y)>.65,sideFace=Math.abs(face.x)>.7;for(let j=0;j<3;j++)projected.push((top||!sideFace?rp.getX(i+j):rp.getZ(i+j))/3,(top?rp.getZ(i+j):rp.getY(i+j))/3);}
  result.setAttribute('uv',new THREE.Float32BufferAttribute(projected,2));result.setAttribute('uv1',new THREE.Float32BufferAttribute(projected,2));
  result.computeBoundingBox();result.computeBoundingSphere();
  result.userData={source:'rock_face_01 + rock_face_02',placement:'continuous-scan-derived-closed-volume',position:[0,0,0],yaw:0,uniformScale:1,depthScale:1,
    crop:'Full source projection; triangle XY maximum-depth rasterisation, no rectangular cropped scan panels',
    retopology:'Closed continuous circumferential surface, original scan relief resampled from actual triangle positions; original source connectivity/undercuts are not retained.',
    authoring:'Art-directed circumference, depth, lateral envelope normalization and broad water recess. Source01 carries front relief; source02 carries flanks/rear. Not original scanned solid dimensions.',
    topology,bottomCap,authoringParameters:{targetXRange:[-7.356301212,6.6],height:8.68,integratedSourceCrest:{top:[.35,8.75,-1.85],frontZ:-1.118,frontLoweringFromRear:.14,centredAfterEnvelopeNormalization:true,startBlend:.88,endBlend:.98},baseCentreZ:-2.5,circumferenceSamples:around,heightRows:rows,source01DepthGain:4.05,source02RearDepthGain:2.3,source02FlankDepthGain:1.3,lateralSource02Gain:2.1,source01OutlineMargin:.1,rearUpperObliqueBreakXYZ:[.8,.35,.9],measuredOutputXBeforeEnvelopeNormalization:[minX,maxX]},
    sourceSampling:{fieldResolution:160,frontCoverage:front.coverage,sideRearCoverage:side.coverage,missingProjection:'Nearest measured neighbour extension',front:'rock_face_01',flanksAndRear:'rock_face_02'},
    closure:'Single closed indexed surface before nonindexed merge; no independent convex plates or long scan boundary collars',
    scanFrontTriangles:one.indices.length/3+two.indices.length/3,normalRepairs};
  return result;
}

function joinsBody(body:THREE.BufferGeometry,attachment:THREE.BufferGeometry):{attachmentVerticesInsideBody:number;sampleInsidePoints:V3[]}{
  const p=body.getAttribute('position'),q=attachment.getAttribute('position');
  const direction=new THREE.Vector3(.937,.171,.305).normalize(),insidePoints:V3[]=[],unique=new Set<string>();
  for(let i=0;i<q.count;i++){
    const point=new THREE.Vector3().fromBufferAttribute(q,i),key=point.toArray().map(v=>v.toFixed(5)).join(',');if(unique.has(key))continue;unique.add(key);
    const ray=new THREE.Ray(point,direction),distances:number[]=[];
    for(let j=0;j<p.count;j+=3){const hit=ray.intersectTriangle(new THREE.Vector3().fromBufferAttribute(p,j),new THREE.Vector3().fromBufferAttribute(p,j+1),new THREE.Vector3().fromBufferAttribute(p,j+2),false,new THREE.Vector3());if(hit)distances.push(hit.distanceTo(point));}
    distances.sort((a,b)=>a-b);const crossings=distances.filter((d,j)=>d>1e-6&&(j===0||d-distances[j-1]>1e-5));
    if(crossings.length%2===1)insidePoints.push(point.toArray() as V3);
  }
  return {attachmentVerticesInsideBody:insidePoints.length,sampleInsidePoints:insidePoints.slice(0,5)};
}

function authoredSupport(points:V3[],metadata:Record<string,unknown>,shade:number):THREE.BufferGeometry {
  const geometry=new ConvexGeometry(points.map(p=>new THREE.Vector3(...p))),p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
  const uv:number[]=[],color:number[]=[];
  for(let i=0;i<p.count;i++){const top=Math.abs(n.getY(i))>.65,side=Math.abs(n.getX(i))>.7;uv.push((top||!side?p.getX(i):p.getZ(i))/3,(top?p.getZ(i):p.getY(i))/3);color.push(shade,shade*.998,shade*.986);}
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('uv1',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(color,3));
  geometry.userData={source:'Original manually authored support volume, not scanned surface',position:[0,0,0],yaw:0,uniformScale:1,depthScale:1,...metadata};
  return geometry;
}

function lowerSpillLip():THREE.BufferGeometry {
  return authoredSupport([[.25,4.76,-.7],[.91,4.8,-.65],[1.42,4.75,.18],[1.9,4.68,.42],[.58,4.65,.565],[1.13,4.69,.581],[1.75,4.64,.56],
    [.28,4.46,-1.1],[1.85,4.43,.20],[.68,4.40,.23],[1.7,4.39,.20]],
    {placement:'lower-spill-integrated-lip',departureCut:{maximumForwardZ:.581,noseTopY:4.69,lowerNoseZ:.23,reason:'35mm clearance from fixed straight departing water ribbon; vertical anchor-to-floor gap is reported separately and does not claim visual water contact.'},purpose:'Small irregular solid lip integrated into the full-width scanned midledge; physical lower water start support; forward nose tapers back below the crest so the departing straight water route clears the solid.'},.95);
}

/** Separate async experiment; it does not replace the synchronous prototype. */
export async function createScannedLimestoneFormation(options:LimestoneFormationOptions & {signal?:AbortSignal}):Promise<THREE.Group>{
  const base=`${import.meta.env.BASE_URL}world3d/reference/nature/scans/`;
  aborted(options.signal);
  const response=await fetch(base+'manifest.json',{signal:options.signal});
  if(!response.ok)throw new Error(`Scan manifest failed: ${response.status}`);
  const manifest=await response.json() as Manifest;
  if(manifest.version!==1||manifest.assets.length!==2)throw new Error('Invalid scan manifest');
  const [one,two]=await Promise.all(manifest.assets.map(record=>loadScan(base,record,options.quality,options.signal)));
  aborted(options.signal);
  const group=new THREE.Group();group.name='reference-photogrammetry-limestone-experiment';
  const pieces:THREE.BufferGeometry[]=[],created=new Set<THREE.BufferGeometry>();
  const partStats:unknown[]=[];
  let ownedMaterial:THREE.MeshStandardMaterial|undefined,materialLinked=false;
  try{
    const body=continuousScannedVolume(one,two,options.quality);created.add(body);pieces.push(body);partStats.push(body.userData);
    const spill=lowerSpillLip();created.add(spill);pieces.push(spill);partStats.push(spill.userData);
    const solidJoins={method:'Odd/even ray crossings from unique attachment vertices against the closed main body; positive inside count proves volume overlap, not just a touching silhouette.',upperSource:{builtIntoMainBody:true,method:'The main closed body itself narrows into the source crest; no separate upper plate geometry'},lowerSpill:joinsBody(body,spill)};
    pieces.forEach(addWetness);
    const merged=mergeGeometries(pieces,false);if(!merged)throw new Error('Could not merge scanned geometry');created.add(merged);
    ownedMaterial=continuousWetMaterial(options.materials);
    const material=ownedMaterial;let released=false;
    // Only the final returned geometry owns this hook. Input pieces are freed
    // after merge and cannot release the material. dispose never owns textures.
    merged.addEventListener('dispose',()=>{if(!released){released=true;material.dispose();}});materialLinked=true;
    const mesh=new THREE.Mesh(merged,material);mesh.name='continuous-scanned-cliff-with-damp-surface';mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
    for(const geometry of pieces){geometry.dispose();created.delete(geometry);}
    const box=new THREE.Box3().setFromObject(group);
    group.userData.natureAsset={kind:'limestone-scan-experiment',quality:options.quality,source:'Poly Haven CC0 photogrammetry-derived closed retopology; not Adonis-original scans or unchanged source triangle meshes',
      sources:manifest.assets.map(a=>({id:a.id,page:a.page,authors:a.authors,license:a.license,originalMetreBounds:a.sourceBounds})),bounds:{min:box.min.toArray(),max:box.max.toArray()},
      triangles:group.children.reduce((sum,child)=>sum+(child as THREE.Mesh).geometry.getAttribute('position').count/3,0),draws:group.children.length,
      parts:partStats,solidJoins,sharedMaterials:false,materialOwnership:{ownedMaterials:1,release:'Final returned geometry dispose event, idempotent; merge-input disposal does not release the material.',borrowedMaps:'All maps remain caller-owned; material disposal never disposes textures or input materials.',wetness:'Continuous interpolated per-vertex mask on the same wide scanned surface; no separate wet column mesh.'},visibleFaces:{front:'Continuous full-height scan01-derived relief surface',sides:'Continuous closed scan-derived surface; no exposed scan boundary panels',rear:'Continuous scan02-derived relief; same closed body',bottom:'Below-ground cut and support must be embedded at local y=0'},waterAnchors:{upper:{...CASCADE_LOCAL_WATER.upper,start:[...CASCADE_LOCAL_WATER.upper.start],end:[...CASCADE_LOCAL_WATER.upper.end]},lower:{...CASCADE_LOCAL_WATER.lower,start:[...CASCADE_LOCAL_WATER.lower.start],end:[...CASCADE_LOCAL_WATER.lower.end]}},
      ledgeFlow:CASCADE_LOCAL_WATER.ledge.map(point=>[...point]),
      mapping:'Local finished geometry, no extra Z compression. Do not fit this sample to the 33m cascade envelope; integrator must map these actual attachment points and keep bridge/path space outside the body.',
      limits:'Scan-derived continuous closed retopology, not the original scan triangle connectivity or a manifold repair. Projection discards undercuts and missing projected samples are extended. The enclosing macro form and water recess are authored; measured scan relief is resampled. Bottom ground cap must be embedded at y=0. Original mineral type is not verified as limestone.'};
    group.updateMatrixWorld(true);
    const anchors=group.userData.natureAsset.waterAnchors;
    const probes:{id:string;point:V3;surfaceZ:number|null;clearance:number|null}[]=[];
    const sample=(id:string,point:V3)=>{
      const hit=new THREE.Raycaster(new THREE.Vector3(point[0],point[1],point[2]+12),new THREE.Vector3(0,0,-1),0,40).intersectObject(group,true)[0];
      probes.push({id,point,surfaceZ:hit?hit.point.z:null,clearance:hit?point[2]-hit.point.z:null});
    };
    for(const [name,tier] of Object.entries(anchors) as [string,{start:V3;end:V3;width:number}][]){
      for(const t of [0,.5,1]){
        const p=tier.start.map((value,i)=>THREE.MathUtils.lerp(value,tier.end[i],t)) as V3;
        for(const fraction of [-.45,0,.45])sample(`${name}.${t}.${fraction}`,[p[0]+tier.width*fraction,p[1],p[2]]);
      }
    }
    group.userData.natureAsset.ledgeFlow.forEach((p:V3,i:number)=>sample(`ledge.${i}`,p));
    group.userData.natureAsset.waterClearanceProof={coverage:'Sparse runtime smoke check only: three longitudinal stations and three width lanes. Frozen dense first-metre/full-route and continuous triangle-ribbon checks are recorded separately in scans/validation and manifest sampleExperiment.',method:'Ray from water point +12m Z toward -Z against the actual finished rock meshes; positive clearance means water is in front.',probes,
      allCentrelinesClear:probes.filter(p=>p.id.endsWith('.0')||p.id.startsWith('ledge')).every(p=>p.clearance===null||p.clearance>.035),
      allSampledWidthClear:probes.every(p=>p.clearance===null||p.clearance>.035)};
    group.userData.natureAsset.ledgeGroundProof=group.userData.natureAsset.ledgeFlow.map((point:V3)=>{
      const hit=new THREE.Raycaster(new THREE.Vector3(point[0],point[1]+.3,point[2]),new THREE.Vector3(0,-1,0),0,2).intersectObject(group,true)[0];
      return {point,floorY:hit?.point.y??null,waterAboveFloor:hit?point[1]-hit.point.y:null};
    });
    group.userData.natureAsset.waterAttachments=[
      {id:'upper.start',point:anchors.upper.start,expected:'Solid source crest integrated into the same closed scan-derived body'},
      {id:'upper.end',point:anchors.upper.end,expected:'Supported landing on the scanned midledge'},
      {id:'lower.start',point:anchors.lower.start,expected:'Solid irregular authored lip integrated into the scanned midledge'},
    ].map(({id,point,expected})=>{
      const hit=new THREE.Raycaster(new THREE.Vector3(point[0],point[1]+.25,point[2]),new THREE.Vector3(0,-1,0),0,2).intersectObject(group,true)[0];
      const gap=hit?point[1]-hit.point.y:null;
      return {id,point,expected,floorY:hit?.point.y??null,waterAboveFloor:gap,physicallySupported:gap!==null&&gap>=.015&&gap<.17};
    });
    group.userData.natureAsset.waterAttachments.push({id:'lower.end',point:anchors.lower.end,expected:'Intentional freefall into the integrator-owned pool at y=0.16; no rock platform is claimed at this point.',physicallySupported:false,targetPoolY:.16});
    aborted(options.signal);
    return group;
  }catch(error){created.forEach(geometry=>geometry.dispose());if(ownedMaterial&&!materialLinked)ownedMaterial.dispose();group.clear();throw error;}
}
