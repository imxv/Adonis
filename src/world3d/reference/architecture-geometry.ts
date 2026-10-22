import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export function stableNoise(seed: number): number {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

/** Rounded external envelope, with local chips in a few corners rather than random vertex fuzz. */
export function stoneBlock(w: number, h: number, d: number, seed = 0, wear = .025, bevel = .045): THREE.BufferGeometry {
  const radius = Math.min(bevel, w * .09, h * .11, d * .09);
  const p: number[] = [], normals: number[] = [];
  const hx=w/2,hy=h/2,hz=d/2,b=radius;
  const face=(vertices:number[][],outward:number[])=>{
    const a=new THREE.Vector3(...vertices[0] as [number,number,number]),u=new THREE.Vector3(...vertices[1] as [number,number,number]).sub(a),v=new THREE.Vector3(...vertices[2] as [number,number,number]).sub(a);
    const n=u.cross(v).normalize();if(n.dot(new THREE.Vector3(...outward as [number,number,number]))<0){vertices=vertices.slice().reverse();n.negate();}
    for(let i=1;i<vertices.length-1;i++)for(const point of [vertices[0],vertices[i],vertices[i+1]]){p.push(...point);normals.push(n.x,n.y,n.z);}
  };
  for(const s of [-1,1]){
    face([[s*hx,-hy+b,-hz+b],[s*hx,hy-b,-hz+b],[s*hx,hy-b,hz-b],[s*hx,-hy+b,hz-b]],[s,0,0]);
    face([[-hx+b,s*hy,-hz+b],[hx-b,s*hy,-hz+b],[hx-b,s*hy,hz-b],[-hx+b,s*hy,hz-b]],[0,s,0]);
    face([[-hx+b,-hy+b,s*hz],[hx-b,-hy+b,s*hz],[hx-b,hy-b,s*hz],[-hx+b,hy-b,s*hz]],[0,0,s]);
  }
  for(const sy of [-1,1])for(const sz of [-1,1])face([[-hx+b,sy*hy,sz*(hz-b)],[hx-b,sy*hy,sz*(hz-b)],[hx-b,sy*(hy-b),sz*hz],[-hx+b,sy*(hy-b),sz*hz]],[0,sy,sz]);
  for(const sx of [-1,1])for(const sz of [-1,1])face([[sx*hx,-hy+b,sz*(hz-b)],[sx*hx,hy-b,sz*(hz-b)],[sx*(hx-b),hy-b,sz*hz],[sx*(hx-b),-hy+b,sz*hz]],[sx,0,sz]);
  for(const sx of [-1,1])for(const sy of [-1,1])face([[sx*hx,sy*(hy-b),-hz+b],[sx*hx,sy*(hy-b),hz-b],[sx*(hx-b),sy*hy,hz-b],[sx*(hx-b),sy*hy,-hz+b]],[sx,sy,0]);
  for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1])face([[sx*hx,sy*(hy-b),sz*(hz-b)],[sx*(hx-b),sy*hy,sz*(hz-b)],[sx*(hx-b),sy*(hy-b),sz*hz]],[sx,sy,sz]);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  if (stableNoise(seed + 2) > .64 && wear > 0) {
    const p = g.getAttribute('position');
    const cx = (stableNoise(seed + 3) > .5 ? 1 : -1) * w / 2;
    const cy = (stableNoise(seed + 5) > .5 ? 1 : -1) * h / 2;
    const cz = (stableNoise(seed + 7) > .5 ? 1 : -1) * d / 2;
    for (let i = 0; i < p.count; i++) {
      const dx = p.getX(i) - cx, dy = p.getY(i) - cy, dz = p.getZ(i) - cz;
      const falloff = Math.exp(-(dx * dx + dy * dy + dz * dz) / Math.max(.008, wear * 7));
      p.setXYZ(i, p.getX(i) - Math.sign(cx) * wear * falloff, p.getY(i) - Math.sign(cy) * wear * falloff, p.getZ(i) - Math.sign(cz) * wear * falloff);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** Small spatial batches preserve actual stone joints without a draw call per stone. */
export class ArchitectureBatch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(g: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number] = [0, 0, 0], rotation: [number, number, number] = [0, 0, 0], seed = 0, authoredUV = false): void {
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1)));
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    const p = flat.getAttribute('position'), n = flat.getAttribute('normal');
    const uv = new Float32Array(p.count * 2), colors = new Float32Array(p.count * 3),surfaceWear=new Float32Array(p.count);
    const existing = flat.getAttribute('uv');
    const tint = .89 + stableNoise(seed + 93) * .13;
    const stone=material instanceof THREE.MeshStandardMaterial&&material.metalness<.5;
    const tile=Math.max(.01,Number(material.userData.metersPerTile)||1);
    const angle=Math.floor(stableNoise(seed+711)*4)*Math.PI/2,cos=Math.cos(angle),sin=Math.sin(angle);
    const offsetU=stableNoise(seed+127)*tile*9,offsetV=stableNoise(seed+319)*tile*9;
    for (let i = 0; i < p.count; i += 3) {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
      for (let j = i; j < i + 3; j++) {
        const u=authoredUV&&existing?existing.getX(j):ny>=nx&&ny>=nz?p.getX(j):nx>=nz?p.getZ(j):p.getX(j);
        const v=authoredUV&&existing?existing.getY(j):ny>=nx&&ny>=nz?p.getZ(j):p.getY(j);
        uv[j*2]=(u*cos-v*sin+offsetU)/tile;uv[j*2+1]=(u*sin+v*cos+offsetV)/tile;
        const groundDeposit=stone?Math.exp(-Math.max(0,p.getY(j))/.18)*(.06+stableNoise(seed+53)*.065):0;
        const tread=stone&&ny>.8&&Math.abs(p.getY(j))<.1?Math.exp(-(p.getX(j)**2)/4)*(.55+.45*Math.cos(p.getZ(j)*.31)**2):0;
        const grain=stableNoise(seed+43)-.5;
        colors[j*3]=tint*(1-groundDeposit*.72)*(1+(stone?grain*.025:0))+tread*.015;
        colors[j*3+1]=tint*(1-groundDeposit*.90)+tread*.014;
        colors[j*3+2]=tint*(1-groundDeposit*1.06)*(1-(stone?grain*.02:0))+tread*.012;
        surfaceWear[j]=stone?(stableNoise(seed+113)-.5)*.06+groundDeposit*.3-tread*.075:0;
      }
    }
    flat.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    flat.setAttribute('uv1', new THREE.BufferAttribute(uv.slice(), 2));
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    flat.setAttribute('architectureWear',new THREE.BufferAttribute(surfaceWear,1));
    for (const key of Object.keys(flat.attributes)) if (!['position', 'normal', 'uv', 'uv1', 'color','architectureWear'].includes(key)) flat.deleteAttribute(key);
    flat.clearGroups();
    const parts = this.parts.get(material) ?? [];
    parts.push(flat); this.parts.set(material, parts);
  }

  finish(name: string): THREE.Group {
    const root = new THREE.Group(); root.name = name;
    for (const [material, parts] of this.parts) {
      const g = mergeGeometries(parts, false);
      parts.forEach(part => part.dispose());
      if (!g) throw new Error(`Cannot merge architecture ${name}`);
      const indexed=mergeVertices(g,1e-5);g.dispose();
      const positions=indexed.getAttribute('position'),source=indexed.index!,clean:number[]=[];
      const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
      for(let i=0;i<source.count;i+=3){const ia=source.getX(i),ib=source.getX(i+1),ic=source.getX(i+2);a.fromBufferAttribute(positions,ia);b.fromBufferAttribute(positions,ib).sub(a);c.fromBufferAttribute(positions,ic).sub(a);if(b.cross(c).lengthSq()>1e-18)clean.push(ia,ib,ic);}
      indexed.setIndex(clean);indexed.computeBoundingBox(); indexed.computeBoundingSphere();
      const mesh = new THREE.Mesh(indexed, material); mesh.name = `${name}/${material.name}`;
      mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
    }
    this.parts.clear(); return root;
  }
}

export function moulding(profile: readonly [number, number][], segments: number): THREE.LatheGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/** A surface of revolution with 24 concave flutes, slight entasis and a true tapered silhouette. */
export function flutedShaft(radius: number, height: number, high: boolean): THREE.BufferGeometry {
  const radial = high ? 144 : 96, rings = high ? 12 : 8;
  const p: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let y = 0; y <= rings; y++) {
    const t = y === 0 ? 0 : y === rings ? 1 : y === 1 ? .02 : y === rings - 1 ? .98 : .04 + (y - 2) / (rings - 4) * .92;
    const taper = 1 - .15 * t + .022 * Math.sin(Math.PI * t);
    const ends = Math.min(1, t * 24, (1 - t) * 24);
    for (let x = 0; x <= radial; x++) {
      const a = x / radial * Math.PI * 2;
      const groove = Math.pow(.5 + .5 * Math.cos(24 * a), .65);
      const r = radius * taper * (1 - .095 * groove * ends);
      p.push(Math.cos(a) * r, t * height, Math.sin(a) * r);
      uv.push(x / radial * radius * Math.PI * 2, t * height);
      if (y < rings && x < radial) {
        const i = y * (radial + 1) + x;
        indices.push(i, i + radial + 1, i + 1, i + 1, i + radial + 1, i + radial + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices); g.computeVertexNormals(); return g;
}
