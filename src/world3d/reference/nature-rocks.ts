import * as THREE from 'three';
export {createScannedLimestoneFormation} from './nature-scan-formation';

/** Shared materials are owned and disposed by the caller. All dimensions are metres. */
export interface LimestoneMaterials {
  limestone: THREE.Material;
  wetLimestone: THREE.Material;
  moss: THREE.Material;
}

export interface LimestoneFormationOptions {
  quality: 'low' | 'high';
  seed?: number;
  materials: LimestoneMaterials;
}

type P3 = [number, number, number];
type P2 = [number, number];

interface RockPart {
  name: string;
  center: P3;
  size: P3;
  seed: number;
  lean?: P2;
  yaw?: number;
  topSlope?: P2;
  /** Hand-cut crown offsets, metres; a few broad broken planes, never random spikes. */
  crown?: number[];
  /** A deliberately different fracture outline, never an ellipsoid. */
  outline?: P2[];
  wet?: boolean;
  /** Deliberate broad fracture sections, interpolated without row-random radii. */
  sections?: {v: number; x: number; z: number; dx?: number; dz?: number}[];
  fractures?: {side: number; u: number; slope: number; depth: number; width: number}[];
}

const DEFAULT_OUTLINE: P2[] = [
  [-.74, -.94], [.28, -1], [.89, -.63], [1, .37],
  [.61, .93], [-.31, 1], [-.98, .46], [-.93, -.57],
];

const HEIGHTS = [0, .25, .55, .78, 1];
const DEFAULT_SECTIONS = [
  {v: 0, x: 1.02, z: 1, dx: 0, dz: 0},
  {v: .55, x: .98, z: .96, dx: -.025, dz: -.02},
  {v: 1, x: .91, z: .9, dx: .03, dz: -.05},
];

function hash(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.67) * 43758.5453;
  return n - Math.floor(n);
}

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), u),
    THREE.MathUtils.lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), u), v,
  );
}

class RockGeometryBuilder {
  private positions: number[][] = [[], [], []];
  private normals: number[][] = [[], [], []];
  private uvs: number[][] = [[], [], []];
  private colors: number[][] = [[], [], []];

  triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3,
    na: THREE.Vector3, nb: THREE.Vector3, nc: THREE.Vector3,
    part: RockPart, isCap = false, materialOverride?: number): void {
    const normal = na.clone().add(nb).add(nc).normalize();
    const faceNormal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    // A whole authored gully uses one material. Never threshold triangle centres:
    // that exposes the tessellation as a regular sawtooth wet/dry boundary.
    const material = materialOverride ?? (part.wet ? 1 : 0);
    const projection = Math.abs(normal.y) > .65 ? 'top' : Math.abs(normal.x) > .7 ? 'side' : 'front';
    for (const [p, n] of [[a, na], [b, nb], [c, nc]] as const) {
      this.positions[material].push(p.x, p.y, p.z);
      // A sharply broken flake must not inherit a tangent normal from the adjacent shelf.
      const actualNormal = n.dot(faceNormal) < .25 ? faceNormal : n;
      this.normals[material].push(actualNormal.x, actualNormal.y, actualNormal.z);
      // World-scaled UVs: 1 repeat = 3m. Data maps have an independent material role.
      this.uvs[material].push(...(projection === 'top' ? [p.x / 3, p.z / 3]
        : projection === 'side' ? [p.z / 3, p.y / 3] : [p.x / 3, p.y / 3]));
      const shade = .88 + noise(p.x * .9, p.y * 1.2 + p.z * .4, part.seed) * .12;
      const stratification = .97 + .025 * Math.sin(p.y * 8 + p.x * .24 + p.z * .4);
      const intensity = shade * stratification * (isCap ? 1.01 : 1);
      this.colors[material].push(intensity, intensity * .997, intensity * .98);
    }
  }

  geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    let vertexStart = 0;
    for (let i = 0; i < 3; i++) {
      geometry.addGroup(vertexStart, this.positions[i].length / 3, i);
      vertexStart += this.positions[i].length / 3;
    }
    const positions = this.positions.flat(), normals = this.normals.flat();
    const uvs = this.uvs.flat(), colors = this.colors.flat();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function ringCorner(part: RockPart, corner: number, v: number): P2 {
  const sections = part.sections ?? DEFAULT_SECTIONS;
  let row = 0;
  while (row < sections.length - 2 && v > sections[row + 1].v) row++;
  const a = sections[row], b = sections[row + 1];
  const t = (v - a.v) / (b.v - a.v);
  const original = (part.outline ?? DEFAULT_OUTLINE)[corner];
  return [original[0] * THREE.MathUtils.lerp(a.x, b.x, t) + THREE.MathUtils.lerp(a.dx ?? 0, b.dx ?? 0, t),
    original[1] * THREE.MathUtils.lerp(a.z, b.z, t) + THREE.MathUtils.lerp(a.dz ?? 0, b.dz ?? 0, t)];
}

function surfacePoint(part: RockPart, side: number, u: number, v: number): THREE.Vector3 {
  const outline = part.outline ?? DEFAULT_OUTLINE;
  const a = ringCorner(part, side, v), b = ringCorner(part, (side + 1) % outline.length, v);
  const px = THREE.MathUtils.lerp(a[0], b[0], u), pz = THREE.MathUtils.lerp(a[1], b[1], u);
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  const outwardX = dz / length, outwardZ = -dx / length;
  const topSlope = part.topSlope ?? [.06, -.04];
  const cy = part.center[1] + (v - .5) * part.size[1];
  const taper = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
  // Only selected planes contain an authored diagonal joint. Most broad faces
  // stay uncut; every side no longer repeats the same central vertical groove.
  const fracture = part.fractures?.find(f => f.side === side);
  const fissureU = fracture ? fracture.u + fracture.slope * (v - .5) : -1;
  const fissure = fracture ? Math.max(0, 1 - Math.abs(u - fissureU) / fracture.width)
    * Math.sin(Math.PI * v) * fracture.depth : 0;
  const flake = (noise(px * 8 + part.seed, cy * 6, part.seed) - .5) * .018;
  const erosion = (noise(u * 3, v * 4, part.seed + side) - .5) * .03;
  const depth = (flake + erosion - fissure) * taper;
  const localX = px * part.size[0] / 2 + outwardX * depth + (part.lean?.[0] ?? 0) * v;
  const localZ = pz * part.size[2] / 2 + outwardZ * depth + (part.lean?.[1] ?? 0) * v;
  const yaw = part.yaw ?? 0;
  const x = localX * Math.cos(yaw) - localZ * Math.sin(yaw) + part.center[0];
  const z = localX * Math.sin(yaw) + localZ * Math.cos(yaw) + part.center[2];
  const crown = THREE.MathUtils.lerp(part.crown?.[side] ?? 0, part.crown?.[(side + 1) % outline.length] ?? 0, u);
  const y = cy + (px * topSlope[0] + pz * topSlope[1] + crown) * v
    + Math.sin(px * 3 + pz * 2 + part.seed) * .012 * Math.sin(v * Math.PI);
  return new THREE.Vector3(x, y, z);
}

function addRock(builder: RockGeometryBuilder, part: RockPart, quality: 'low' | 'high'): void {
  const horizontal = quality === 'high' ? 8 : 4;
  const vertical: number[] = [];
  const levels = [...new Set([...HEIGHTS, ...(part.sections ?? DEFAULT_SECTIONS).map(s => s.v)])].sort((a,b) => a-b);
  for (let row = 0; row < levels.length - 1; row++) {
    const steps = quality === 'high' ? 3 : 1;
    for (let s = 0; s < steps; s++) vertical.push(THREE.MathUtils.lerp(levels[row], levels[row + 1], s / steps));
  }
  vertical.push(1);
  const count = (part.outline ?? DEFAULT_OUTLINE).length;
  for (let side = 0; side < count; side++) {
    const points: THREE.Vector3[] = [], normals: THREE.Vector3[] = [];
    const faces: [number, number, number][] = [];
    for (const v of vertical) for (let col = 0; col <= horizontal; col++) {
      const fracture = part.fractures?.find(f => f.side === side);
      const crack = fracture ? fracture.u + fracture.slope * (v - .5) : .5;
      const u = fracture ? (quality === 'high'
        ? [0, crack * .3, crack * .65, crack - fracture.width * .8, crack, crack + fracture.width * .8, crack + (1-crack) * .5, crack + (1-crack) * .8, 1][col]
        : [0, crack * .5, crack, (1 + crack) * .5, 1][col]) : col / horizontal;
      points.push(surfacePoint(part, side, u, v));
      normals.push(new THREE.Vector3());
    }
    for (let row = 0; row < vertical.length - 1; row++) {
      for (let col = 0; col < horizontal; col++) {
        const a = row * (horizontal + 1) + col, b = a + 1;
        const d = a + horizontal + 1, c = d + 1;
        faces.push([a, d, b], [b, d, c]);
      }
    }
    // Smooth erosion inside each macro fracture plane, retain hard joints at its borders.
    for (const [a, b, c] of faces) {
      const normal = points[b].clone().sub(points[a]).cross(points[c].clone().sub(points[a]));
      normals[a].add(normal); normals[b].add(normal); normals[c].add(normal);
    }
    normals.forEach(normal => normal.normalize());
    for (const [a, b, c] of faces) builder.triangle(points[a], points[b], points[c], normals[a], normals[b], normals[c], part);
  }
  for (const v of [0, 1]) {
    const ring = Array.from({length: count}, (_, i) => surfacePoint(part, i, 0, v));
    const center = ring.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / count);
    center.y += v === 1 ? -.028 : .005;
    const n = new THREE.Vector3(0, v === 1 ? 1 : -1, 0);
    for (let side = 0; side < count; side++) {
      const a = ring[side], b = ring[(side + 1) % count];
      if (v === 1) builder.triangle(center, b, a, n, n, n, part, true);
      else builder.triangle(center, a, b, n, n, n, part, true);
    }
  }
  const patchSeeds = part.wet ? [[3, .76, .76], [4, .16, .9], [5, .28, .56], [5, .58, .23]]
    : part.name.includes('shelf') ? [[4, .35, .78], [5, .65, .85]]
    : part.name.includes('waterline') ? [[4, .25, .2]] : [];
  for (let i = 0; i < patchSeeds.length; i++) {
    const [side, u, v] = patchSeeds[i];
    const du = surfacePoint(part, side, u + .001, v).sub(surfacePoint(part, side, u - .001, v));
    const dv = surfacePoint(part, side, u, v + .001).sub(surfacePoint(part, side, u, v - .001));
    const n = dv.cross(du).normalize();
    const center = surfacePoint(part, side, u, v).addScaledVector(n, .012);
    const radiusU = .09 + hash(i, 4, part.seed) * .07;
    const radiusV = Math.min(.12, .22 / part.size[1]);
    const ring: THREE.Vector3[] = [];
    for (let j = 0; j < 11; j++) {
      const angle = j / 11 * Math.PI * 2;
      const radius = .67 + hash(i, j, part.seed + 21) * .33;
      const pu = THREE.MathUtils.clamp(u + Math.cos(angle) * radiusU * radius, .005, .995);
      const pv = THREE.MathUtils.clamp(v + Math.sin(angle) * radiusV * radius, .005, .995);
      ring.push(surfacePoint(part, side, pu, pv).addScaledVector(n, .008));
    }
    for (let j = 0; j < ring.length; j++) {
      const a = center, b = ring[j], c = ring[(j + 1) % ring.length];
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (normal.dot(n) > 0) builder.triangle(a, b, c, normal, normal, normal, part, false, 2);
      else builder.triangle(a, c, b, normal.negate(), normal, normal, part, false, 2);
    }
  }
}

const FORMATION_PARTS: Omit<RockPart, 'seed'>[] = [
  // The foundation is a recessed continuous mountain, not an assembly of towers.
  {name: 'continuous-fractured-bedrock', center: [-.1, 2.4, -1.45], size: [13.2, 4.8, 4.3], lean: [.3, -.25], yaw: -.035, topSlope: [.18, -.12],
    outline: [[-.85,-.79],[-.25,-1],[.72,-.83],[1,-.1],[.72,.51],[.2,.68],[-.12,.94],[-.63,.62],[-1,.19]],
    sections: [{v:0,x:1,z:1},{v:.55,x:1.01,z:.96,dx:.025,dz:-.04},{v:1,x:.94,z:.9,dx:-.02,dz:-.08}]},
  // Width dominates height: broad bedding faces split by a few diagonal joints.
  {name: 'left-lower-thick-bed', center: [-4.48, 1.35, -.12], size: [5.8, 2.7, 4.1], lean: [.27, -.18], yaw: -.08, topSlope: [.22, -.1],
    outline: [[-.78,-.88],[.35,-1],[.98,-.38],[.94,.58],[.32,.9],[-.48,1],[-1,.34],[-.94,-.5]],
    crown: [.03,.1,-.08,.09,-.15,.08,-.02,.04],
    sections: [{v:0,x:1,z:.97},{v:.46,x:.98,z:1,dx:.025,dz:-.015},{v:1,x:.93,z:.88,dx:.06,dz:-.07}],
    fractures: [{side:4,u:.31,slope:.34,depth:.24,width:.035}]},
  {name: 'left-upper-faulted-bed', center: [-4.38, 4.3, -.26], size: [5.25, 2.84, 3.82], lean: [.31, -.26], yaw: -.15, topSlope: [.24, -.14],
    outline: [[-.82,-.77],[.26,-1],[.96,-.31],[1,.38],[.48,.92],[-.47,1],[-1,.32],[-.92,-.48]],
    crown: [-.08,.08,.14,-.12,.19,-.14,.12,-.05],
    sections: [{v:0,x:1.03,z:1},{v:.6,x:.98,z:.96,dx:.015,dz:-.025},{v:1,x:.94,z:.92,dx:.045,dz:-.07}]},
  {name: 'left-upper-dipping-bed', center: [-3.7, 6.85, -1.8], size: [4.9, 4.05, 3.0], lean: [.46, -.3], yaw: -.16, topSlope: [.38, -.15],
    outline: [[-.94,-.68],[-.24,-1],[.79,-.83],[1,.21],[.61,.82],[-.34,1],[-.9,.44]],
    crown: [-.2,.15,.28,-.08,.34,-.26,-.08],
    sections: [{v:0,x:1.04,z:1},{v:.64,x:1,z:.96,dx:-.035,dz:-.025},{v:1,x:.91,z:.92,dx:.035,dz:-.07}],
    fractures: [{side:3,u:.7,slope:-.27,depth:.18,width:.032}]},
  {name: 'right-upper-offset-bed', center: [3.72, 6.6, -2.01], size: [4.85, 4.6, 2.75], lean: [-.42, -.25], yaw: .08, topSlope: [-.48, .09],
    outline: [[-.93,-.56],[-.4,-1],[.63,-.93],[1,-.28],[.91,.67],[.21,1],[-.77,.78]],
    crown: [0,-.18,.12,.3,-.36,.1,-.15],
    sections: [{v:0,x:1,z:1},{v:.62,x:.95,z:.94,dx:.035,dz:-.04},{v:1,x:.93,z:.85,dx:-.045,dz:-.065}]},
  {name: 'right-broad-erosion-shoulder', center: [4.9, 2.5, -.03], size: [4.85, 5, 4.6], lean: [-.6, -.25], yaw: .17, topSlope: [-.3, -.22],
    outline: [[-.91,-.8],[.22,-1],[.88,-.64],[1,.49],[.61,.92],[-.35,1],[-1,.26]],
    crown: [.04,-.06,.19,-.04,.18,-.12,.05],
    sections: [{v:0,x:1.04,z:1},{v:.38,x:.98,z:.99,dx:-.015,dz:-.02},{v:1,x:.9,z:.87,dx:-.065,dz:-.04}],
    fractures: [{side:4,u:.64,slope:-.4,depth:.2,width:.04}]},
  {name: 'right-low-oblique-block', center: [4.02, 1.19, 1.12], size: [4.1, 2.38, 3.3], lean: [-.38, -.18], yaw: -.24, topSlope: [-.23, -.12],
    sections: [{v:0,x:1,z:1},{v:.7,x:.94,z:.98,dx:.025,dz:-.025},{v:1,x:.87,z:.91,dx:-.025,dz:-.05}]},
  // Entire channel blocks use wet PBR, including their side/back surfaces.
  {name: 'upper-wet-gully', center: [.35, 6.94, -2.45], size: [3.38, 4.16, 1.68], lean: [.13, -.12], yaw: -.025, topSlope: [.12, -.12], wet: true,
    sections: [{v:0,x:1,z:1},{v:.55,x:.98,z:.94,dx:.025,dz:-.015},{v:1,x:.93,z:.9,dx:-.025,dz:-.04}]},
  {name: 'lower-wet-gully', center: [1.1, 2.42, -.12], size: [4.55, 4.8, 2.17], lean: [-.15, -.28], yaw: .06, topSlope: [-.22, -.16], wet: true,
    sections: [{v:0,x:.98,z:1},{v:.55,x:1.04,z:.93,dx:.035,dz:-.02},{v:1,x:.94,z:.86,dx:-.035,dz:-.05}]},
  // Nonmatching layer thickness and a lower, right-hand spill, never one long thin plank.
  {name: 'left-eroded-shelf', center: [-.89, 4.5, -.4], size: [3.76, 1.18, 2.65], lean: [.18, -.12], yaw: -.13, topSlope: [-.18, -.12],
    outline: [[-.8,-.8],[.58,-1],[1,-.33],[.78,.35],[.89,.72],[.22,1],[-.43,.75],[-1,.54]],
    sections: [{v:0,x:.94,z:.92},{v:.45,x:1.03,z:1,dx:.015,dz:.025},{v:1,x:1,z:.97,dx:-.015,dz:-.02}]},
  {name: 'right-spill-shelf', center: [2.73, 4.22, .1], size: [2.69, 1.25, 2.6], lean: [-.3, -.22], yaw: .18, topSlope: [-.06, .08],
    outline: [[-1,-.62],[-.15,-1],[.82,-.62],[1,.15],[.39,.97],[-.19,.62],[-.68,.84]],
    sections: [{v:0,x:.9,z:.94},{v:.38,x:1,z:1,dx:.015,dz:.02},{v:1,x:.96,z:.91,dx:-.025,dz:-.025}]},
  {name: 'left-jointed-toe', center: [-3.15, .85, 2.0], size: [3.55, 1.7, 2.7], lean: [.26, -.18], yaw: -.29, topSlope: [.12, -.12]},
  {name: 'lower-water-breaker', center: [.1, .69, 1.53], size: [1.67, 1.38, 1.65], lean: [-.27, -.24], yaw: .42, topSlope: [.19, -.18], wet: true},
  {name: 'right-waterline-slab', center: [5.15, .65, 2.04], size: [3.1, 1.3, 2.61], lean: [-.17, -.22], yaw: .37, topSlope: [-.18, -.22]},
];

function makeMesh(builder: RockGeometryBuilder, materials: LimestoneMaterials, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(builder.geometry(), [materials.limestone, materials.wetLimestone, materials.moss]);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Reproject after baking scale, so standalone shore rocks keep the same texel density. */
function projectMeterUVs(geometry: THREE.BufferGeometry): void {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv'), uv1 = geometry.getAttribute('uv1');
  for (let i = 0; i < p.count; i += 3) {
    const normal = new THREE.Vector3();
    for (let j = 0; j < 3; j++) normal.add(new THREE.Vector3().fromBufferAttribute(n, i + j));
    normal.normalize();
    const top = Math.abs(normal.y) > .65, side = Math.abs(normal.x) > .7;
    for (let j = 0; j < 3; j++) {
      const vertex = i + j;
      const u = (top || !side ? p.getX(vertex) : p.getZ(vertex)) / 3;
      const v = (top ? p.getZ(vertex) : p.getY(vertex)) / 3;
      uv.setXY(vertex, u, v); uv1.setXY(vertex, u, v);
    }
  }
  uv.needsUpdate = uv1.needsUpdate = true;
}

/**
 * Placeable, closed limestone cliff sample, front toward +Z. No water or input/RAF.
 * Upper spill: (0.35,8.95,-1.32) -> (0.7,5.05,-.72).
 * Lower spill: (1.15,4.95,.72) -> (1.25,.12,2.08).
 * The two LODs share authored controls and silhouette; only internal tessellation changes.
 */
export function createLimestoneFormation(options: LimestoneFormationOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'reference-limestone-two-stage-formation';
  const builder = new RockGeometryBuilder();
  FORMATION_PARTS.forEach((part, i) => addRock(builder, {...part, seed: (options.seed ?? 381) + i * 37}, options.quality));
  const mesh = makeMesh(builder, options.materials, 'limestone-macro-fractures-and-wet-shelves');
  mesh.geometry.scale(1, 1, .8);
  projectMeterUVs(mesh.geometry);
  group.add(mesh);
  const box = new THREE.Box3().setFromObject(group);
  group.userData.natureAsset = {
    reference: 'world3d-v3/03-waterfall-pool.png',
    kind: 'limestone-formation',
    quality: options.quality,
    source: 'Original manually authored fractured cross-sections and procedural surface mesh; no external mesh. Shared PBR provenance belongs to material owner.',
    bounds: {min: box.min.toArray(), max: box.max.toArray()},
    triangles: mesh.geometry.getAttribute('position').count / 3,
    draws: mesh.geometry.groups.filter(g => g.count > 0).length,
    waterAnchors: {
      upper: {start: [.35, 8.95, -1.32], end: [.7, 5.05, -.72], width: 2.25},
      lower: {start: [1.15, 4.95, .72], end: [1.25, .12, 2.08], width: 3.15},
    },
    sharedMaterials: true,
  };
  return group;
}

/** Independent shore rock. Nonuniform scale is permitted; local bottom is y=0. */
export function createLimestoneBoulder(options: LimestoneFormationOptions & {scale?: number | P3}): THREE.Group {
  const group = new THREE.Group();
  group.name = 'reference-limestone-detached-shore-slab';
  const builder = new RockGeometryBuilder();
  const seed = options.seed ?? 137;
  addRock(builder, {name: 'detached-shore-slab', center: [0, .74, 0], size: [2.42, 1.48, 1.85], seed,
    lean: [.24, -.18], yaw: hash(1, 1, seed) * .75, topSlope: [.17, -.2]}, options.quality);
  const mesh = makeMesh(builder, options.materials, 'detached-weathered-limestone');
  group.add(mesh);
  const scale = options.scale ?? 1;
  if (typeof scale === 'number') mesh.geometry.scale(scale, scale, scale);
  else mesh.geometry.scale(...scale);
  projectMeterUVs(mesh.geometry);
  const box = new THREE.Box3().setFromObject(group);
  group.userData.natureAsset = {kind: 'limestone-boulder', quality: options.quality,
    triangles: mesh.geometry.getAttribute('position').count / 3,
    bounds: {min: box.min.toArray(), max: box.max.toArray()}, sharedMaterials: true};
  return group;
}
