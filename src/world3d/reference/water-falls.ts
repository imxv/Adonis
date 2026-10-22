import * as THREE from 'three';
import {
  fallFragment, fallVertex, impactFragment, impactVertex, sprayFragment, sprayVertex,
} from './water-falls-shaders';

export type WaterfallQuality = 'low' | 'medium' | 'high';

/** Coordinates are in the returned group's local space; one segment per drop. */
export interface WaterfallSegment {
  top: THREE.Vector3;
  bottom: THREE.Vector3;
  width: number;
  /**
   * Nominal body-depth scale in metres, relative to .16 (default). A positive
   * finite value scales mature lobe half-depth by depth/.16. Near-vertical
   * crests separately cap full depth at .09m, unfolding over the first 1.35m.
   */
  depth?: number;
  /** Width of the crest. Default X; automatically made horizontal. */
  widthDirection?: THREE.Vector3;
  /** Direction away from the cliff, default widthDirection cross world up. */
  forward?: THREE.Vector3;
  /** Travel speed multiplier; also controls white-water intensity. Default 1. */
  flow?: number;
  seed?: number;
  /** False suppresses the pool impact on a drop that ends on another slope. */
  foam?: boolean;
  /** Impact patch radius multiplier. Default 1. */
  impactScale?: number;
}

export interface WaterfallImpact {
  position: THREE.Vector3;
  radius: number;
  strength: number;
}

export interface WaterfallsOptions {
  /** If supplied, a new owned child is added; existing children are untouched. */
  group?: THREE.Group;
  quality: WaterfallQuality;
  /** World direction towards the sun (not the incident ray direction). */
  sunDirection: THREE.Vector3;
  segments: WaterfallSegment[];
}

export interface Waterfalls {
  group: THREE.Group;
  /** Local positions for the enclosing water shader's radial disturbance. */
  impacts: WaterfallImpact[];
  stats: { triangles: number; sprayParticles: number; mistParticles: number; drawCalls: number };
  /** Absolute elapsed seconds; delta is accepted for the common environment hook. */
  update(time: number, delta?: number): void;
  setQuality(quality: WaterfallQuality): void;
  dispose(): void;
}

type SurfaceBuffers = {
  position: number[]; normal: number[]; uv: number[]; data: number[]; form: number[]; motion: number[]; lip: number[]; index: number[];
};
type ParticleBuffers = { origin: number[]; velocity: number[]; params: number[] };
type FoamBuffers = { origin: number[]; axis: number[]; front: number[]; params: number[]; shape: number[] };
type FlowLobe = { lane: number; endLane: number; width: number; depth: number; seed: number; split: boolean };
type Reach = WaterfallSegment & {
  axis: THREE.Vector3; front: THREE.Vector3; height: number; flow: number; seed: number; lipEnabled: boolean; frontTravel: number;
};

const UP = new THREE.Vector3(0, 1, 0);
const BUDGETS = {
  low: { columns: 4, rows: 24, sides: 8, veils: 1, foamFamilies: 3, crowns: 3, foamColumns: 2, foamRows: 3, fragments: 16, fragmentColumns: 1, fragmentRows: 2, spray: 100, mist: 9 },
  medium: { columns: 7, rows: 36, sides: 12, veils: 2, foamFamilies: 6, crowns: 5, foamColumns: 3, foamRows: 4, fragments: 30, fragmentColumns: 2, fragmentRows: 3, spray: 260, mist: 19 },
  high: { columns: 10, rows: 48, sides: 16, veils: 3, foamFamilies: 9, crowns: 6, foamColumns: 4, foamRows: 6, fragments: 48, fragmentColumns: 3, fragmentRows: 4, spray: 460, mist: 28 },
} as const;

function makeRandom(seed: number): () => number {
  let s = (Math.floor(seed * 100003) ^ 0x85ebca6b) >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let n = Math.imul(s ^ s >>> 15, 1 | s);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function emptySurface(): SurfaceBuffers {
  return { position: [], normal: [], uv: [], data: [], form: [], motion: [], lip: [], index: [] };
}

function surfaceGeometry(b: SurfaceBuffers): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(b.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  geometry.setAttribute('aData', new THREE.Float32BufferAttribute(b.data, 4));
  geometry.setAttribute('aForm', new THREE.Float32BufferAttribute(b.form, 2));
  geometry.setAttribute('aMotion', new THREE.Float32BufferAttribute(b.motion, 4));
  geometry.setAttribute('aLip', new THREE.Float32BufferAttribute(b.lip, 4));
  geometry.setIndex(b.index);
  geometry.computeBoundingSphere();
  return geometry;
}

function appendVertex(
  b: SurfaceBuffers, p: THREE.Vector3, n: THREE.Vector3, u: number, v: number,
  seed: number, flow: number, thin: number, strength = 1, formSize = .025, motion?: THREE.Vector3, life = 0, phase?: number, lip?: readonly number[],
): void {
  b.position.push(p.x, p.y, p.z);
  b.normal.push(n.x, n.y, n.z);
  b.uv.push(u, v);
  b.data.push(seed, flow, thin, strength);
  b.form.push(formSize, phase ?? seed * .71);
  b.motion.push(motion?.x ?? 0, motion?.y ?? 0, motion?.z ?? 0, life);
  b.lip.push(lip?.[0] ?? 0, lip?.[1] ?? 0, lip?.[2] ?? 0, lip?.[3] ?? 0);
}

function smooth(a: number, b: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Local gravity-time lead; endpoints and all positions after 1.8m are unchanged. */
function lipLead(reach: Reach, v: number): number {
  if (!reach.lipEnabled || reach.frontTravel <= 0) return 0;
  v = THREE.MathUtils.clamp(v, 0, 1);
  const d = v * reach.height;
  if (d >= 1.8) return 0;
  const q = (Math.sqrt(v + .001) - Math.sqrt(.001)) / (Math.sqrt(1.001) - Math.sqrt(.001));
  const raw = Math.max(0, (q - v) * reach.frontTravel);
  return .5 * Math.tanh(raw / .5) * (1 - smooth(.75, 1.8, d));
}

/** .09m full depth at the lip, smoothly restored without moving the crest. */
function lipDepth(reach: Reach, v: number, raw: number): number {
  if (!reach.lipEnabled) return raw;
  const end = Math.min(1.35, reach.height * .85);
  const weight = smooth(Math.min(.05, end * .1), end, v * reach.height);
  return THREE.MathUtils.lerp(Math.min(raw, .045), raw, weight);
}

/** Unequal gathering lanes, shared by every quality level and by impact births. */
function flowLobes(reach: Reach): FlowLobe[] {
  const w = reach.width;
  const depthScale = typeof reach.depth === 'number' && Number.isFinite(reach.depth) && reach.depth > 0
    ? reach.depth / .16 : 1;
  const specs = w > 2.3
    ? [[-.31, -.32, .21, .145], [-.025, .025, .32, .205], [.32, .35, .155, .11]]
    : [[-.21, -.27, .37, .20], [.24, .29, .25, .16]];
  return specs.map(([lane, endLane, width, depth], i) => ({
    lane: lane * w, endLane: endLane * w, width: width * w,
    depth: Math.min(.68, Math.max(.08, depth * w)) * depthScale,
    seed: reach.seed + i * 2.317, split: w > 2.3 && i === 1,
  }));
}

/** Broad, correlated bends instead of many parallel lines with tiny jitter. */
function lobeCenter(reach: Reach, lobe: FlowLobe, v: number, branch = 0): THREE.Vector3 {
  const p = new THREE.Vector3().lerpVectors(reach.top, reach.bottom, v);
  const lane = THREE.MathUtils.lerp(lobe.lane, lobe.endLane, smooth(.05, .93, v));
  const lateralFold = Math.sin(v * 5.3 + lobe.seed) * reach.width * .038 * Math.sin(v * Math.PI);
  const fork = branch * lobe.width * .43 * smooth(.43, .93, v);
  const outward = Math.sin(v * Math.PI) * Math.min(.78, reach.height * .10);
  const depthFold = Math.sin(v * 7.2 + lobe.seed * 1.7) * lobe.depth * .32 * Math.sin(v * Math.PI);
  p.addScaledVector(reach.axis, lane + lateralFold + fork);
  p.addScaledVector(reach.front, outward + depthFold + lipLead(reach, v) + branch * lobe.depth * .28 * smooth(.43, .9, v));
  return p;
}

/** The droplet envelope follows the same lobe paths as the visible water. */
function pathAt(reach: Reach, v: number, lane: number, seed: number): THREE.Vector3 {
  return lobeCenter(reach, { lane, endLane: lane, width: reach.width * .2,
    depth: reach.width * .08, seed, split: false }, v);
}

/** A closed, deeply folded cross section: this remains a volume from the side. */
function addWaterLobe(
  b: SurfaceBuffers, reach: Reach, lobe: FlowLobe, sides: number, rows: number,
  start = 0, end = .98, branch = 0,
): void {
  const base = b.position.length / 3;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  const tangent = new THREE.Vector3(), ringAxis = new THREE.Vector3(), ringFront = new THREE.Vector3();
  const child = branch !== 0;
  const branchScale = branch < 0 ? .64 : .48;
  const rowCount = Math.max(5, Math.ceil(rows * (end - start)));
  for (let y = 0; y <= rowCount; y++) {
    const v = THREE.MathUtils.lerp(start, end, y / rowCount);
    const center = lobeCenter(reach, lobe, v, branch);
    tangent.copy(lobeCenter(reach, lobe, Math.min(1, v + .004), branch))
      .sub(lobeCenter(reach, lobe, Math.max(0, v - .004), branch)).normalize();
    ringAxis.copy(reach.axis).addScaledVector(tangent, -reach.axis.dot(tangent)).normalize();
    ringFront.crossVectors(tangent, ringAxis).normalize();
    if (ringFront.dot(reach.front) < 0) ringFront.negate();
    const neck = .98 - Math.sin(v * Math.PI) * .30 + Math.sin(v * 8.7 + lobe.seed) * .12;
    const release = child ? THREE.MathUtils.lerp(.84, branchScale, smooth(start, start + .15, v)) : 1;
    const rx = lobe.width * .5 * neck * release;
    const rz = lipDepth(reach, v, lobe.depth * (.75 + .25 * Math.sin(v * 6.1 + lobe.seed)) * (child ? .72 : 1));
    for (let x = 0; x <= sides; x++) {
      const u = x / sides, angle = u * Math.PI * 2;
      // Broad lobes fold inward; a ring is deliberately neither round nor smooth.
      const lobing = 1 + Math.cos(angle * 3 + v * 7.1 + lobe.seed) * .19
        + Math.sin(angle * 5 - v * 4.3 + lobe.seed * .7) * .10;
      const ax = Math.cos(angle), az = Math.sin(angle);
      p.copy(center).addScaledVector(ringAxis, ax * rx * lobing);
      p.addScaledVector(ringFront, az * rz * lobing);
      n.copy(ringAxis).multiplyScalar(ax / Math.max(rx, .01));
      n.addScaledVector(ringFront, az / Math.max(rz, .01)).normalize();
      appendVertex(b, p, n, u, v, lobe.seed + branch * .713, reach.flow, .35, .62, Math.min(.17, rx * .22, rz * .22));
    }
  }
  for (let y = 0; y < rowCount; y++) for (let x = 0; x < sides; x++) {
    const a = base + y * (sides + 1) + x;
    b.index.push(a, a + 1, a + sides + 1, a + 1, a + sides + 2, a + sides + 1);
  }
}

/** Sparse open tongues wrap the front of the gathered water and peel away. */
function addVeil(b: SurfaceBuffers, reach: Reach, lobe: FlowLobe, columns: number, rows: number): void {
  const base = b.position.length / 3;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let y = 0; y <= rows; y++) {
    const v = y / rows * .94;
    const center = lobeCenter(reach, lobe, v);
    for (let x = 0; x <= columns; x++) {
      const u = x / columns;
      const r = (u - .5) * lobe.width * (1.05 + Math.sin(v * 7.8 + lobe.seed) * .24);
      const depth = lipDepth(reach, v, lobe.depth);
      const fold = Math.cos(u * Math.PI * 2 + v * 5.1) * depth * .75;
      p.copy(center).addScaledVector(reach.axis, r);
      p.addScaledVector(reach.front, depth * .72 + fold);
      n.copy(reach.front).addScaledVector(reach.axis, Math.sin(u * Math.PI * 2 + v * 5.1) * .8).normalize();
      appendVertex(b, p, n, u, v, lobe.seed + 3.41, reach.flow, -.5, .44, Math.min(.13, lobe.width * .09));
    }
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const a = base + y * (columns + 1) + x;
    b.index.push(a, a + columns + 1, a + 1, a + 1, a + columns + 1, a + columns + 2);
  }
}

/** Short aerated fragments are actual curled surfaces, transported through the drop. */
function addWhitewaterFragments(
  b: SurfaceBuffers, reach: Reach, lobes: FlowLobe[], count: number,
  columns: number, rows: number, random: () => number,
): void {
  const motion = reach.bottom.clone().sub(reach.top);
  const down = motion.clone().normalize();
  const p = new THREE.Vector3(), n = new THREE.Vector3(), tangent = new THREE.Vector3();
  const life = Math.sqrt(2 * reach.height / 9.81) * 1.35;
  for (let i = 0; i < count; i++) {
    const lobe = lobes[i % lobes.length];
    const phase = random(), v = phase * phase;
    const angle = Math.PI * (.12 + random() * .76);
    n.copy(reach.axis).multiplyScalar(Math.cos(angle)).addScaledVector(reach.front, Math.sin(angle)).normalize();
    tangent.copy(reach.axis).multiplyScalar(-Math.sin(angle)).addScaledVector(reach.front, Math.cos(angle)).normalize();
    // A fixed gathering lane retains a continuous route when its skin breaks.
    const center = reach.top.clone().lerp(reach.bottom, v).addScaledVector(reach.axis, lobe.endLane);
    center.addScaledVector(n, Math.min(lobe.width * .28, lobe.depth * .83) + .035);
    const width = Math.max(.06, Math.min(.43, lobe.width * (.10 + random() * .16)));
    const length = Math.max(.16, Math.min(1.12, reach.height * (.045 + random() * .065)));
    const seed = reach.seed + i * .913;
    const base = b.position.length / 3;
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
      const u = x / columns, t = y / rows;
      const tornWidth = width * (.58 + Math.sin(t * Math.PI) * .52);
      const curl = Math.sin(u * Math.PI * 1.7 + t * 3.5 + seed) * width * .43;
      p.copy(center).addScaledVector(tangent, (u - .5) * tornWidth);
      p.addScaledVector(down, (t - .5) * length).addScaledVector(n, curl);
      const actualV = (reach.top.y - p.y) / reach.height;
      p.addScaledVector(reach.front, lipLead(reach, actualV));
      appendVertex(b, p, n, u, t, seed, reach.flow, 2, .94, v, motion, life, phase,
        [reach.top.y, reach.lipEnabled ? reach.frontTravel : 0, reach.front.x, reach.front.z]);
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const a = base + y * (columns + 1) + x;
      b.index.push(a, a + 1, a + columns + 1, a + 1, a + columns + 2, a + columns + 1);
    }
  }
}

function appendFoam(
  b: FoamBuffers, reach: Reach, position: THREE.Vector3, life: number, phase: number,
  size: number, seed: number, kind: number, branch: number, height: number, speed: number,
): void {
  const twist = Math.sin(seed * 2.9) * .37;
  const axis = reach.axis.clone().applyAxisAngle(UP, twist);
  const front = reach.front.clone().applyAxisAngle(UP, twist);
  b.origin.push(position.x, position.y, position.z);
  b.axis.push(axis.x, axis.y, axis.z); b.front.push(front.x, front.y, front.z);
  b.params.push(life, phase, size, seed); b.shape.push(kind, branch, height, speed);
}

/** Families have one birth and two delayed children; all use the same birth clock. */
function addFoamFamilies(b: FoamBuffers, reach: Reach, lobes: FlowLobe[], families: number, crowns: number, random: () => number): void {
  for (let i = 0; i < families; i++) {
    const lobe = lobes[i % lobes.length];
    const p = reach.bottom.clone().addScaledVector(reach.axis, lobe.endLane + (random() - .5) * lobe.width * .45);
    p.addScaledVector(reach.front, .08 + random() * .18); p.y += .035;
    const life = 3.2 + random() * 1.8, phase = random();
    const size = Math.max(.22, Math.min(.82, lobe.width * (.36 + random() * .27)));
    const seed = reach.seed + i * 1.713, speed = .38 + random() * .42;
    for (const branch of [0, -1, 1]) appendFoam(b, reach, p, life, phase, size,
      seed, 1, branch, .10 + random() * .06, speed);
  }
  for (let i = 0; i < crowns; i++) {
    const lobe = lobes[i % lobes.length];
    const p = reach.bottom.clone().addScaledVector(reach.axis, lobe.endLane + (random() - .5) * lobe.width * .70);
    p.addScaledVector(reach.front, (random() - .1) * .28); p.y += .04;
    const size = Math.max(.24, Math.min(1.22, lobe.width * (.64 + random() * .22)));
    appendFoam(b, reach, p, .86 + random() * .40, i / crowns + random() * .075, size,
      reach.seed + i * .873, 0, 0, .40 + random() * .45, .25 + random() * .38);
  }
}

/** Three torn, directional folds, not a sphere/ellipsoid or one horizontal disk. */
function foamGeometry(b: FoamBuffers, columns: number, rows: number): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  const p: number[] = [], uv: number[] = [], index: number[] = [];
  const tongues = [{ x: -.58, width: .57, length: 1.34, phase: 1.7 },
    { x: -.015, width: 1.12, length: 1.8, phase: .2 },
    { x: .62, width: .48, length: 1.07, phase: 3.8 }];
  for (const tongue of tongues) {
    const base = p.length / 3;
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
      const u = x / columns, v = y / rows;
      const edge = Math.sin(v * Math.PI);
      const px = tongue.x + (u - .5) * tongue.width * (.64 + edge * .45);
      const pz = (v - .43) * tongue.length + Math.sin(u * 3.1 + tongue.phase) * .12;
      const py = (.16 + Math.sin(u * 4.8 + tongue.phase) * .10) * edge
        + Math.sin(v * 5.4 + u * 2.8 + tongue.phase) * .13 * edge;
      p.push(px, py, pz); uv.push(u, v);
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const a = base + y * (columns + 1) + x;
      index.push(a, a + columns + 1, a + 1, a + 1, a + columns + 1, a + columns + 2);
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(new Float32Array(b.origin), 3));
  geometry.setAttribute('aFlowAxis', new THREE.InstancedBufferAttribute(new Float32Array(b.axis), 3));
  geometry.setAttribute('aFlowFront', new THREE.InstancedBufferAttribute(new Float32Array(b.front), 3));
  geometry.setAttribute('aParams', new THREE.InstancedBufferAttribute(new Float32Array(b.params), 4));
  geometry.setAttribute('aShape', new THREE.InstancedBufferAttribute(new Float32Array(b.shape), 4));
  geometry.instanceCount = b.origin.length / 3;
  return geometry;
}

function addParticles(
  b: ParticleBuffers, reach: Reach, count: number, mist: boolean, random: () => number,
): void {
  const p = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    p.copy(reach.bottom).addScaledVector(reach.axis, (random() - .5) * reach.width * .94);
    p.addScaledVector(reach.front,
      (random() - .25) * reach.width * .16 + Math.min(.45, reach.width * .08));
    p.y += .045;
    const angle = random() * Math.PI * 2.;
    const speed = mist ? .07 + random() * .12 : .22 + random() * .95;
    velocity.copy(reach.axis).multiplyScalar(Math.cos(angle) * speed);
    velocity.addScaledVector(reach.front, Math.sin(angle) * speed + (mist ? .06 : .26));
    velocity.y = mist ? .18 + random() * .25 : 1.3 + random() * Math.min(2.2, reach.height * .6);
    const life = mist ? 1.3 + random() * 1.6 : velocity.y / 4.905;
    const size = mist ? .35 + random() * .75 : .023 + random() * .049;
    b.origin.push(p.x, p.y, p.z);
    b.velocity.push(velocity.x, velocity.y, velocity.z);
    b.params.push(life, random(), size, random());
  }
}

/** Fast droplets bridge the ragged sheet ends; these fall, rather than hover. */
function addFallingDrops(b: ParticleBuffers, reach: Reach, count: number, random: () => number): void {
  const velocity = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const release = .54 + random() * .22;
    const lane = (random() - .5) * reach.width * 1.02;
    const p = pathAt(reach, release, lane, reach.seed + i * .617);
    const speed = Math.sqrt(2 * 9.81 * reach.height * release) * .66;
    const remaining = reach.height * (1 - release);
    const life = (Math.sqrt(speed * speed + 19.62 * remaining) - speed) / 9.81;
    velocity.copy(reach.bottom).sub(reach.top).multiplyScalar(1 / Math.max(reach.height, .1));
    velocity.multiplyScalar(speed);
    velocity.y = -speed;
    velocity.addScaledVector(reach.axis, (random() - .5) * .48);
    b.origin.push(p.x, p.y, p.z);
    b.velocity.push(velocity.x, velocity.y, velocity.z);
    b.params.push(life, random(), .045 + random() * .075, -(.01 + random()));
  }
}

function particleGeometry(b: ParticleBuffers): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5, -.5, 0, .5, -.5, 0, -.5, .5, 0, .5, .5, 0,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(new Float32Array(b.origin), 3));
  geometry.setAttribute('aVelocity', new THREE.InstancedBufferAttribute(new Float32Array(b.velocity), 3));
  geometry.setAttribute('aParams', new THREE.InstancedBufferAttribute(new Float32Array(b.params), 4));
  geometry.instanceCount = b.origin.length / 3;
  return geometry;
}

/**
 * Four draw calls across any number of reaches: sheets/strands, pool patches,
 * spray, and local low-opacity mist. No render targets, assets, timers or DOM.
 * All animation is driven by update, all owned GPU resources by dispose.
 */
export function createWaterfalls(options: WaterfallsOptions): Waterfalls {
  const group = new THREE.Group();
  group.name = 'reference-waterfalls';
  options.group?.add(group);
  const impacts: WaterfallImpact[] = [];
  const stats = { triangles: 0, sprayParticles: 0, mistParticles: 0, drawCalls: 0 };
  const materials: THREE.ShaderMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const timeUniform = { value: 0 };
  const sunUniform = { value: options.sunDirection.clone().normalize() };
  const foamUniform = { value: new THREE.Color('#f4f6e8') };
  let quality = options.quality;
  let disposed = false;

  const reaches: Reach[] = options.segments.filter(s => s.width > 0 && s.top.y > s.bottom.y + .02).map((s, i) => {
    const axis = s.widthDirection?.clone() ?? new THREE.Vector3(1, 0, 0);
    axis.y = 0;
    if (axis.lengthSq() < .001) axis.set(1, 0, 0);
    axis.normalize();
    const front = s.forward?.clone() ?? new THREE.Vector3().crossVectors(axis, UP);
    front.y = 0;
    if (front.lengthSq() < .001) front.crossVectors(axis, UP);
    front.normalize();
    const fall = s.bottom.clone().sub(s.top);
    const height = s.top.y - s.bottom.y;
    const lipEnabled = Math.hypot(fall.x, fall.z) <= height * .5;
    const frontTravel = Math.max(0, fall.dot(front));
    return {
      ...s, top: s.top.clone(), bottom: s.bottom.clone(), axis, front,
      flow: Math.max(.25, Math.min(s.flow ?? 1, 2)),
      seed: s.seed ?? (i + 1) * 1.731,
      height, lipEnabled, frontTravel,
    };
  });

  function ownMaterial(parameters: THREE.ShaderMaterialParameters): THREE.ShaderMaterial {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.NormalBlending, toneMapped: true, ...parameters,
    });
    materials.push(m);
    return m;
  }
  function addMesh(geometry: THREE.BufferGeometry, material: THREE.ShaderMaterial, name: string): void {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.frustumCulled = false; // GPU particle positions are not the base quad bounds.
    mesh.renderOrder = name === 'impact-froth' ? 3 : name === 'local-impact-mist' ? 5 : 4;
    group.add(mesh);
    stats.drawCalls++;
  }
  function release(): void {
    group.clear();
    geometries.splice(0).forEach(g => g.dispose());
    materials.splice(0).forEach(m => m.dispose());
    impacts.splice(0);
    Object.assign(stats, { triangles: 0, sprayParticles: 0, mistParticles: 0, drawCalls: 0 });
  }
  function build(): void {
    const budget = BUDGETS[quality];
    const surface = emptySurface();
    const foam: FoamBuffers = { origin: [], axis: [], front: [], params: [], shape: [] };
    const spray: ParticleBuffers = { origin: [], velocity: [], params: [] };
    const mist: ParticleBuffers = { origin: [], velocity: [], params: [] };
    for (const reach of reaches) {
      const random = makeRandom(reach.seed);
      const lobes = flowLobes(reach);
      for (const lobe of lobes) {
        if (lobe.split) {
          addWaterLobe(surface, reach, lobe, budget.sides, budget.rows, 0, .53);
          addWaterLobe(surface, reach, lobe, budget.sides, budget.rows, .435, .985, -1);
          addWaterLobe(surface, reach, lobe, budget.sides, budget.rows, .45, .95, 1);
        } else addWaterLobe(surface, reach, lobe, budget.sides, budget.rows, 0, .94 + random() * .055);
      }
      for (let i = 0; i < Math.min(budget.veils, lobes.length); i++) {
        addVeil(surface, reach, lobes[i], budget.columns, budget.rows);
      }
      addWhitewaterFragments(surface, reach, lobes, budget.fragments,
        budget.fragmentColumns, budget.fragmentRows, random);
      const widthMultiplier = Math.min(1.4, Math.max(.35, reach.width / 2.5));
      addFallingDrops(spray, reach, Math.round(budget.spray * widthMultiplier * .35), random);
      if (reach.foam === false) continue;
      const impact: WaterfallImpact = {
        position: reach.bottom.clone(),
        radius: Math.max(.35, reach.width * .78) * (reach.impactScale ?? 1),
        strength: Math.min(reach.height / 5, 1) * reach.flow,
      };
      impacts.push(impact);
      addFoamFamilies(foam, reach, lobes, budget.foamFamilies, budget.crowns, random);
      addParticles(spray, reach, Math.round(budget.spray * widthMultiplier * .75), false, random);
      addParticles(mist, reach, Math.round(budget.mist * widthMultiplier), true, random);
    }
    if (surface.index.length) addMesh(surfaceGeometry(surface), ownMaterial({
      vertexShader: fallVertex, fragmentShader: fallFragment,
      uniforms: {
        uTime: timeUniform, uSunDirection: sunUniform,
        uWaterShadow: { value: new THREE.Color('#3b666d') },
        uWaterLight: { value: new THREE.Color('#b4d0cd') }, uFoamColor: foamUniform,
      },
    }), 'falling-water-sheets-and-runnels');
    let foamTriangles = 0;
    if (foam.origin.length) {
      const geometry = foamGeometry(foam, budget.foamColumns, budget.foamRows);
      foamTriangles = (geometry.index!.count / 3) * geometry.instanceCount;
      addMesh(geometry, ownMaterial({
        vertexShader: impactVertex, fragmentShader: impactFragment,
        uniforms: { uTime: timeUniform, uFoamColor: foamUniform, uSunDirection: sunUniform },
      }), 'impact-froth');
    }
    for (const [particles, isMist] of [[spray, false], [mist, true]] as const) {
      if (!particles.origin.length) continue;
      addMesh(particleGeometry(particles), ownMaterial({
        vertexShader: sprayVertex, fragmentShader: sprayFragment,
        uniforms: { uTime: timeUniform, uMist: { value: isMist ? 1 : 0 }, uFoamColor: foamUniform },
      }), isMist ? 'local-impact-mist' : 'impact-spray-droplets');
    }
    stats.sprayParticles = spray.origin.length / 3;
    stats.mistParticles = mist.origin.length / 3;
    stats.triangles = surface.index.length / 3 + foamTriangles
      + (stats.sprayParticles + stats.mistParticles) * 2;
    group.userData.waterfallBudget = stats;
  }

  try { build(); } catch (error) { release(); group.removeFromParent(); throw error; }
  return {
    group, impacts, stats,
    update(time: number) {
      if (disposed || !Number.isFinite(time)) return;
      timeUniform.value = time;
      sunUniform.value.copy(options.sunDirection).normalize();
    },
    setQuality(next: WaterfallQuality) {
      if (disposed || quality === next) return;
      quality = next;
      release();
      build();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      release();
      group.removeFromParent();
    },
  };
}
