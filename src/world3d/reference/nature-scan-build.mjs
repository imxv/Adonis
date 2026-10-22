/** Reproducible offline geometry extraction. Run from repo root with Node.
 * Optional --download refreshes the two official glTF/bin sources, not textures.
 * Source meshes are CC0 by Poly Haven artists; this is NOT original scan geometry.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {MeshoptSimplifier} from 'meshoptimizer';

const root = path.resolve('public/world3d/reference/nature/scans');
const source = path.join(root, 'source');
await fs.mkdir(source, {recursive:true});
await MeshoptSimplifier.ready;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const assets = [];

for (const id of ['rock_face_01','rock_face_02']) {
  const api = `https://api.polyhaven.com/files/${id}`;
  const infoUrl = `https://api.polyhaven.com/info/${id}`;
  if (process.argv.includes('--download')) {
    const get = async (url, name) => {const response=await fetch(url);if(!response.ok)throw new Error(`${response.status} ${url}`);const bytes=Buffer.from(await response.arrayBuffer());await fs.writeFile(path.join(source,name),bytes);return bytes;};
    const files=JSON.parse(await get(api,`${id}-files.json`));
    await get(infoUrl,`${id}-info.json`);
    const model=files.gltf['1k'].gltf;
    await get(model.url,`${id}.gltf`);
    await get(model.include[`${id}.bin`].url,`${id}.bin`);
  }
  const files=JSON.parse(await fs.readFile(path.join(source,`${id}-files.json`),'utf8'));
  const info=JSON.parse(await fs.readFile(path.join(source,`${id}-info.json`),'utf8'));
  const gltfBytes=await fs.readFile(path.join(source,`${id}.gltf`));
  const binary=await fs.readFile(path.join(source,`${id}.bin`));
  const gltf=JSON.parse(gltfBytes);
  const md5=bytes=>crypto.createHash('md5').update(bytes).digest('hex');
  if(md5(gltfBytes)!==files.gltf['1k'].gltf.md5||md5(binary)!==files.gltf['1k'].gltf.include[`${id}.bin`].md5)throw new Error(`Official checksum mismatch: ${id}`);
  if(gltf.nodes.length!==1||gltf.nodes[0].matrix||gltf.nodes[0].rotation||gltf.nodes[0].scale||gltf.nodes[0].translation)throw new Error('Unexpected source transform');
  const primitive=gltf.meshes[0].primitives[0];
  const accessor=(index) => {
    const a=gltf.accessors[index], view=gltf.bufferViews[a.bufferView];
    const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
    const Type={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType];
    const step=Type.BYTES_PER_ELEMENT, stride=view.byteStride??components*step;
    const result=new Type(a.count*components), data=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
    const start=(view.byteOffset??0)+(a.byteOffset??0);
    for(let i=0;i<a.count;i++)for(let j=0;j<components;j++)result[i*components+j]=a.componentType===5126?data.getFloat32(start+i*stride+j*step,true):a.componentType===5123?data.getUint16(start+i*stride+j*step,true):data.getUint32(start+i*stride+j*step,true);
    return result;
  };
  const p=accessor(primitive.attributes.POSITION),n=accessor(primitive.attributes.NORMAL),uv=accessor(primitive.attributes.TEXCOORD_0),rawIndices=accessor(primitive.indices);
  const sourceBounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(let i=0;i<p.length;i++) {const axis=i%3;sourceBounds.min[axis]=Math.min(sourceBounds.min[axis],p[i]);sourceBounds.max[axis]=Math.max(sourceBounds.max[axis],p[i]);}
  sourceBounds.size=sourceBounds.min.map((value,axis)=>sourceBounds.max[axis]-value);
  // Weld UV seam positions for stable boundaries and simplification. Original UV
  // arrays remain preserved in the official source binary and source-UV.bin.
  const vertexMap=new Map(), remap=[],positions=[],normals=[],uvs=[],normalCounts=[];
  for(let i=0;i<p.length/3;i++){
    const key=[p[i*3],p[i*3+1],p[i*3+2]].map(v=>Math.round(v*1e5)).join(',');
    let target=vertexMap.get(key);
    if(target===undefined){target=positions.length/3;vertexMap.set(key,target);positions.push(p[i*3],p[i*3+1],p[i*3+2]);normals.push(0,0,0);uvs.push(uv[i*2],uv[i*2+1]);normalCounts.push(0);}
    remap[i]=target;normalCounts[target]++;
    for(let j=0;j<3;j++)normals[target*3+j]+=n[i*3+j];
  }
  for(let i=0;i<normals.length;i+=3){const length=Math.hypot(normals[i],normals[i+1],normals[i+2]);for(let j=0;j<3;j++)normals[i+j]/=length;}
  const clean=[], triangles=new Set();
  for(let i=0;i<rawIndices.length;i+=3){const a=remap[rawIndices[i]],b=remap[rawIndices[i+1]],c=remap[rawIndices[i+2]];if(a===b||b===c||c===a)continue;const key=[a,b,c].sort((x,y)=>x-y).join(',');if(triangles.has(key))continue;triangles.add(key);clean.push(a,b,c);}
  const positions32=new Float32Array(positions), indices32=new Uint32Array(clean);
  const qualityFiles={};
  for(const quality of ['high','low']){
    let indices=indices32,error=0;
    if(quality==='low') [indices,error]=MeshoptSimplifier.simplify(indices32,positions32,3,Math.floor(indices32.length*.22/3)*3,.008,['LockBorder']);
    const compact=new Map(), compactPositions=[], compactNormals=[],compactUV=[];
    const finalIndices=new Uint32Array(indices.length);
    for(let i=0;i<indices.length;i++){const original=indices[i];let mapped=compact.get(original);if(mapped===undefined){mapped=compact.size;compact.set(original,mapped);compactPositions.push(...positions.slice(original*3,original*3+3));compactNormals.push(...normals.slice(original*3,original*3+3));compactUV.push(...uvs.slice(original*2,original*2+2));}finalIndices[i]=mapped;}
    const vertexCount=compact.size;
    const floats=new Float32Array(vertexCount*8);
    for(let i=0;i<vertexCount;i++)floats.set([...compactPositions.slice(i*3,i*3+3),...compactNormals.slice(i*3,i*3+3),...compactUV.slice(i*2,i*2+2)],i*8);
    const bytes=Buffer.concat([Buffer.from(floats.buffer),Buffer.from(finalIndices.buffer)]);
    const filename=`${id}-${quality}.bin`;
    await fs.writeFile(path.join(root,filename),bytes);
    qualityFiles[quality]={url:filename,vertexCount,indexCount:finalIndices.length,strideFloats:8,indexByteOffset:floats.byteLength,bytes:bytes.length,sha256:digest(bytes),simplificationError:error};
  }
  await fs.writeFile(path.join(source,`${id}-source-UV.bin`),Buffer.from(uv.buffer,uv.byteOffset,uv.byteLength));
  const record={id,page:`https://polyhaven.com/a/${id}`,authors:info.authors,license:'CC0-1.0',licenseUrl:'https://polyhaven.com/license',api,
    gltf:{url:files.gltf['1k'].gltf.url,sha256:digest(gltfBytes),bytes:gltfBytes.length},
    sourceBin:{url:files.gltf['1k'].gltf.include[`${id}.bin`].url,sha256:digest(binary),bytes:binary.length},
    sourceUnits:'metres, glTF +Y up, no node transform; bbox differs from webpage advertised dimension',sourceBounds,
    sourceVertices:p.length/3,sourceTriangles:rawIndices.length/3,weldedVertices:positions.length/3,cleanTriangles:indices32.length/3,quality:qualityFiles};
  assets.push(record);
  console.log(id,JSON.stringify(record));
}
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify({version:1,generatedBy:'src/world3d/reference/nature-scan-build.mjs',geometryOnly:true,sourceGeometryCredit:'Poly Haven photogrammetry; not Adonis-original geometry',assets},null,2)+'\n');
