import * as THREE from 'three';
import type { GreekWorldQuality } from '../types';
import type { ArchitecturePlacement, ReferenceLayout } from './contracts';
import { REFERENCE_STAIR_LANDING, REFERENCE_WALK_SURFACE_OFFSET } from './landform-layout';

type Point = { x: number; z: number };
type HalfPlane = (p: Point) => number;
type Rect = { x: number; z: number; rx: number; rz: number; halfWidth: number; from: number; to: number };
type Batch = { position: number[]; uv: number[]; color: number[]; stones: number; refinedTriangles: number; omittedHardSeams: number; omittedArea: number };
const TOP_OFFSET = REFERENCE_WALK_SURFACE_OFFSET;
const GAP = .025;
const hash = (seed: number) => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); };
const signedArea = (p: readonly Point[]) => p.reduce((sum, a, i) => {
  const b = p[(i + 1) % p.length]; return sum + a.x * b.z - b.x * a.z;
}, 0) / 2;
const area = (p: readonly Point[]) => Math.abs(signedArea(p));
const withoutDuplicateEdges = (polygon: readonly Point[]) => polygon.filter((p, i) => {
  const previous = polygon[(i + polygon.length - 1) % polygon.length];
  return Math.hypot(p.x - previous.x, p.z - previous.z) > 1e-6;
});
const local = (p: Point, r: Rect) => ({ x: (p.x - r.x) * r.rx + (p.z - r.z) * r.rz, z: -(p.x - r.x) * r.rz + (p.z - r.z) * r.rx });
const world = (x: number, z: number, r: Rect): Point => ({ x: r.x + x * r.rx - z * r.rz, z: r.z + x * r.rz + z * r.rx });
const insidePlanes = (r: Rect) => [
  (p: Point) => local(p, r).x + r.halfWidth,
  (p: Point) => r.halfWidth - local(p, r).x,
  (p: Point) => local(p, r).z - r.from,
  (p: Point) => r.to - local(p, r).z,
];

/** Convex half-plane clipping also keeps cuts at rotated bridge/temple edges exact. */
function clip(polygon: readonly Point[], distance: (p: Point) => number): Point[] {
  if (!polygon.length) return [];
  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = distance(a), db = distance(b), aIn = da >= 0, bIn = db >= 0;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return withoutDuplicateEdges(out);
}
/** Each plane is positive inside the convex cut; both polygon windings work. */
function convexInsidePlanes(polygon: readonly Point[]): HalfPlane[] {
  const vertices = withoutDuplicateEdges(polygon), winding = Math.sign(signedArea(vertices));
  if (vertices.length < 3 || !winding || vertices.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z))) {
    throw new Error('Invalid convex route exclusion');
  }
  return vertices.map((a, i) => {
    const b = vertices[(i + 1) % vertices.length];
    return p => winding * ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x));
  });
}
function subtractConvexHalfPlanes(polygon: Point[], planes: readonly HalfPlane[]): Point[][] {
  const outside: Point[][] = [];
  let remaining = polygon;
  for (const plane of planes) {
    const piece = clip(remaining, p => -plane(p));
    if (piece.length >= 3 && area(piece) > .002) outside.push(piece);
    remaining = clip(remaining, plane);
    if (remaining.length < 3) break;
  }
  return outside;
}
function subtractRect(polygon: Point[], rect: Rect): Point[][] {
  return subtractConvexHalfPlanes(polygon, insidePlanes(rect));
}
function removeRects(polygon: Point[], rects: readonly Rect[]): Point[][] {
  let pieces = [polygon];
  for (const rect of rects) pieces = pieces.flatMap(piece => subtractRect(piece, rect));
  return pieces;
}
function placementRect(p: ArchitecturePlacement, halfWidth: number, from: number, to: number): Rect {
  return { x: p.position[0], z: p.position[2], rx: Math.cos(p.yaw), rz: -Math.sin(p.yaw), halfWidth, from, to };
}

/** Batched, deterministic route structure. The caller owns/disposes the returned
 * geometries and MUST supply a vertexColors-enabled material; that material is
 * borrowed unchanged. No textures, timers, renderer services, or colliders here.
 * Stair tread centres sample walkHeight; D should quantize its stair walk floor
 * to the same ceil(rise/.18) levels. Continuous ramp floors differ by half a step.
 */
export function createReferenceRouteSurfaces(
  layout: ReferenceLayout,
  material: THREE.MeshStandardMaterial,
  walkHeight: (x: number, z: number) => number,
  quality: GreekWorldQuality,
): { root: THREE.Group; geometries: Set<THREE.BufferGeometry> } {
  const root = new THREE.Group(); root.name = 'D / route stone surfaces and temporary stairs';
  const geometries = new Set<THREE.BufferGeometry>();
  const paths: Batch = { position: [], uv: [], color: [], stones: 0, refinedTriangles: 0, omittedHardSeams: 0, omittedArea: 0 };
  const steps: Batch = { position: [], uv: [], color: [], stones: 0, refinedTriangles: 0, omittedHardSeams: 0, omittedArea: 0 };
  const exclusions: Rect[] = [], stairRects: Rect[] = [], laidCorridors: Rect[] = [];
  const stairInfo: { id: string; levels: number; designRise: number; maxSampledRise: number; minSampledRise: number }[] = [];
  // Creation-local, bounded cache: repeated shared-edge samples are common,
  // and D's physical floor calculation traverses all route/water segments.
  const floorCache = new Map<number, Map<number, number>>();
  let cachedFloors = 0;
  const floor = (p: Point) => {
    // Match the emitted Float32 X/Z. Sampling the double-precision side of a
    // hard callback boundary can otherwise put a vertex metres above its floor.
    const x = Math.fround(p.x), z = Math.fround(p.z);
    if (cachedFloors >= 32768) { floorCache.clear(); cachedFloors = 0; }
    let row = floorCache.get(x);
    if (!row) { row = new Map(); floorCache.set(x, row); }
    const cached = row.get(z); if (cached !== undefined) return cached;
    const value = walkHeight(x, z);
    if (!Number.isFinite(value)) throw new Error(`Non-finite route walk floor at ${p.x},${p.z}`);
    const top = value + TOP_OFFSET; row.set(z, top); cachedFloors++; return top;
  };
  function stone(batch: Batch, polygon: Point[], seed: number, flatHeight?: number, thickness = .12, closedPrism = false) {
    if (polygon.length < 3 || area(polygon) < .008) return;
    const centre = polygon.reduce((p, v) => ({ x: p.x + v.x / polygon.length, z: p.z + v.z / polygon.length }), { x: 0, z: 0 });
    const radius = Math.min(...polygon.map(p => Math.hypot(p.x - centre.x, p.z - centre.z)));
    // The inset follows the clipped polygon; no bevel extends back into an excluded footprint.
    const inset = closedPrism ? 0 : Math.min(.085, .025 / Math.max(.05, radius));
    const inner = polygon.map(p => ({ x: THREE.MathUtils.lerp(p.x, centre.x, inset), z: THREE.MathUtils.lerp(p.z, centre.z, inset) }));
    const innerY = inner.map(p => flatHeight ?? floor(p));
    const outerY = polygon.map(p => (flatHeight ?? floor(p)) - (closedPrism ? 0 : .025));
    const bottomY = polygon.map(p => (flatHeight ?? floor(p)) - thickness);
    const centreY = flatHeight ?? floor(centre);
    const warmth = hash(seed + 7), brightness = .94 + hash(seed + 3) * .06;
    const colour = [brightness, brightness * (.963 + warmth * .025), brightness * (.885 + warmth * .045)];
    type Vertex = readonly [number, number, number];
    const vertex = (p: Point, y: number): Vertex => [p.x, y, p.z];
    const emit = (a: Vertex, b: Vertex, c: Vertex, uv?: readonly number[]) => {
      batch.position.push(...a, ...b, ...c);
      batch.uv.push(...(uv ?? [a[0], a[2], b[0], b[2], c[0], c[2]]));
      batch.color.push(...colour, ...colour, ...colour);
    };
    function surface(a: Vertex, b: Vertex, c: Vertex, da = 0, db = 0, dc = 0, depth = 0) {
      if (flatHeight !== undefined) { emit(a, b, c); return; }
      const point = (x: number, z: number, offset: number): Vertex => [x, floor({ x, z }) + offset, z];
      const ab = point((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, (da + db) / 2);
      const bc = point((b[0] + c[0]) / 2, (b[2] + c[2]) / 2, (db + dc) / 2);
      const ca = point((c[0] + a[0]) / 2, (c[2] + a[2]) / 2, (dc + da) / 2);
      const middle = point((a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3, (da + db + dc) / 3);
      const biasedError = (u: Vertex, v: Vertex, w: Vertex, du: number, dv: number, dw: number, weight: number) => {
        const rest = (1 - weight) / 2;
        const p = point(u[0] * weight + (v[0] + w[0]) * rest, u[2] * weight + (v[2] + w[2]) * rest, du * weight + (dv + dw) * rest);
        return Math.abs(p[1] - (u[1] * weight + (v[1] + w[1]) * rest));
      };
      const error = Math.max(Math.abs(ab[1] - (a[1] + b[1]) / 2), Math.abs(bc[1] - (b[1] + c[1]) / 2),
        Math.abs(ca[1] - (c[1] + a[1]) / 2), Math.abs(middle[1] - (a[1] + b[1] + c[1]) / 3),
        biasedError(a, b, c, da, db, dc, .5), biasedError(b, c, a, db, dc, da, .5), biasedError(c, a, b, dc, da, db, .5),
        biasedError(a, b, c, da, db, dc, .6), biasedError(b, c, a, db, dc, da, .6), biasedError(c, a, b, dc, da, db, .6));
      if (error <= .008) { emit(a, b, c); return; }
      // A callback may contain a hard branch between path floors. Tiny open
      // seams expose D's terrain rather than stretching one stone across it.
      if (depth >= 5) {
        batch.omittedHardSeams++;
        batch.omittedArea += Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) / 2;
        return;
      }
      batch.refinedTriangles++;
      surface(a, ab, ca, da, (da + db) / 2, (dc + da) / 2, depth + 1);
      surface(ab, b, bc, (da + db) / 2, db, (db + dc) / 2, depth + 1);
      surface(ca, bc, c, (dc + da) / 2, (db + dc) / 2, dc, depth + 1);
      surface(ab, bc, ca, (da + db) / 2, (db + dc) / 2, (dc + da) / 2, depth + 1);
    }
    let perimeter = 0;
    for (let i = 0; i < polygon.length; i++) {
      const j = (i + 1) % polygon.length;
      const oi = vertex(polygon[i], outerY[i]), oj = vertex(polygon[j], outerY[j]);
      const ii = vertex(inner[i], innerY[i]), ij = vertex(inner[j], innerY[j]);
      surface(vertex(centre, centreY), ij, ii); // +Y top, irrespective of route yaw.
      if (!closedPrism) {
        surface(oi, ii, ij, -.025, 0, 0); surface(oi, ij, oj, -.025, 0, -.025);
      }
      const bi = vertex(polygon[i], bottomY[i]), bj = vertex(polygon[j], bottomY[j]);
      if (closedPrism) emit(vertex(centre, centreY - thickness), bi, bj);
      const end = perimeter + Math.hypot(polygon[j].x - polygon[i].x, polygon[j].z - polygon[i].z);
      emit(bi, oi, oj, [perimeter, bottomY[i], perimeter, outerY[i], end, outerY[j]]);
      emit(bi, oj, bj, [perimeter, bottomY[i], end, outerY[j], end, bottomY[j]]);
      perimeter = end;
    }
    batch.stones++;
  }
  // Four/five sided slabs alternate their clipped corner and vary in length/width.
  function slab(rect: Rect, x0: number, x1: number, z0: number, z1: number, seed: number): Point[] {
    const cut = hash(seed + 9) < .55 ? Math.min(x1 - x0, z1 - z0) * (.14 + hash(seed + 4) * .2) : 0;
    const points: [number, number][] = cut
      ? [[x0, z0], [x1 - cut, z0], [x1, z0 + cut], [x1, z1], [x0, z1]]
      : [[x0, z0], [x1, z0 + (z1 - z0) * .04 * hash(seed)], [x1, z1], [x0, z1 - (z1 - z0) * .04 * hash(seed + 1)]];
    if (cut && hash(seed + 12) > .5) points.forEach(p => { p[0] = x0 + x1 - p[0]; });
    // A mirrored pentagon needs its winding corrected for the shared face builder.
    if (cut && hash(seed + 12) > .5) points.reverse();
    return points.map(([x, z]) => world(x, z, rect));
  }
  function finish(batch: Batch, name: string) {
    if (!batch.position.length) return;
    const geometry = new THREE.BufferGeometry(); geometries.add(geometry);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.position, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uv, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(batch.color, 3));
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.name = name;
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.receiveShadow = true; mesh.castShadow = true;
    mesh.userData.stoneCount = batch.stones; root.add(mesh);
  }
  try {
    const landing = withoutDuplicateEdges(REFERENCE_STAIR_LANDING.outlineXZ.map(([x, z]) => ({ x, z })));
    const landingPlanes = convexInsidePlanes(landing);
    // The shared face builder expects counterclockwise X/Z outlines (+Y top).
    if (signedArea(landing) < 0) landing.reverse();
    for (const p of layout.architecture) {
      if (p.kind === 'bridge') {
        // A's frozen 7.2m span and layout-owned deck width; do not pave over it.
        const halfWidth = p.size[2] / 2;
        exclusions.push(placementRect(p, 3.6, -halfWidth, halfWidth));
      } else if (p.kind === 'temple') {
        exclusions.push(placementRect(p, p.size[0] / 2, -p.size[2] / 2, p.size[2] / 2));
      } else if (p.kind === 'stairs') {
        // Leave a 1cm junction rather than sampling the discontinuous stair
        // boundary as part of an ordinary slab's bevel.
        stairRects.push(placementRect(p, p.size[0] / 2 + .01, -p.size[2] - .01, .01));
      }
    }
    const pathArea = layout.paths.reduce((sum, p) => sum + p.points.slice(1).reduce((length, b, i) => length + Math.hypot(b[0] - p.points[i][0], b[2] - p.points[i][2]), 0) * p.width, 0);
    const densityScale = Math.max(1, Math.sqrt(pathArea / 900));
    const pitch = (quality === 'low' ? 1.45 : quality === 'high' ? .88 : 1.08) * densityScale;
    let serial = 1;
    for (const path of layout.paths) for (let segment = 1; segment < path.points.length; segment++) {
      const a = path.points[segment - 1], b = path.points[segment];
      const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
      if (length < .01 || path.width <= 0) continue;
      const rect: Rect = { x: a[0], z: a[2], rx: dz / length, rz: -dx / length, halfWidth: path.width / 2, from: 0, to: length };
      const columns = Math.max(2, Math.ceil(path.width / (quality === 'low' ? 1.2 : .94) / densityScale));
      const cellWidth = path.width / columns;
      let z = 0, row = 0;
      while (z < length) {
        const rowLength = pitch * (.78 + hash(serial + row * 13) * .44);
        const end = Math.min(length, z + rowLength);
        if (end - z <= GAP + .01) { z = end; row++; continue; }
        const shift = row % 2 ? .43 : 0;
        for (let column = -1; column < columns; column++) {
          const seed = serial++;
          const x0 = -path.width / 2 + (column + shift) * cellWidth + GAP / 2;
          const x1 = x0 + cellWidth - GAP;
          let polygon = slab(rect, x0, x1, z + GAP / 2, end - GAP / 2, seed);
          for (const plane of insidePlanes(rect)) polygon = clip(polygon, plane);
          const pieces = removeRects(polygon, [...exclusions, ...stairRects, ...laidCorridors])
            .flatMap(piece => subtractConvexHalfPlanes(piece, landingPlanes));
          for (const piece of pieces) stone(paths, piece, seed);
        }
        z = end; row++;
      }
      laidCorridors.push(rect);
    }
    finish(paths, 'D / merged route slabs');
    for (const p of layout.architecture.filter(p => p.kind === 'stairs')) {
      if (p.size[0] <= 0 || p.size[1] <= 0 || p.size[2] <= 0) continue;
      const rect = placementRect(p, p.size[0] / 2, -p.size[2], 0);
      const levels = Math.ceil(p.size[1] / .18), run = p.size[2] / levels;
      const columns = Math.max(2, Math.ceil(p.size[0] / (quality === 'low' ? 1.3 : quality === 'high' ? .8 : 1.05)));
      const cellWidth = p.size[0] / columns;
      const heights: number[] = [];
      for (let step = 0; step < levels; step++) {
        const z0 = -(step + 1) * run, z1 = -step * run;
        const height = floor(world(0, (z0 + z1) / 2, rect)); heights.push(height);
        for (let column = 0; column < columns; column++) {
          const seed = serial++;
          const x0 = -p.size[0] / 2 + column * cellWidth + GAP / 2;
          const x1 = x0 + cellWidth - GAP;
          const polygon = slab(rect, x0, x1, z0 + .004, z1 - .004, seed);
          for (const piece of removeRects(polygon, exclusions)) stone(steps, piece, seed, height, Math.max(.12, p.size[1] / levels + .035));
        }
      }
      const rises = heights.slice(1).map((h, i) => h - heights[i]);
      stairInfo.push({ id: p.id, levels, designRise: p.size[1] / levels, maxSampledRise: rises.length ? Math.max(...rises) : 0, minSampledRise: rises.length ? Math.min(...rises) : 0 });
    }
    // A takes over both flights and this landing together. Keep the closed,
    // square-edged fallback cap in the same batch so one visibility switch works.
    const landingTop = REFERENCE_STAIR_LANDING.level + TOP_OFFSET;
    for (const piece of removeRects(landing, exclusions)) stone(steps, piece, serial++, landingTop, .18, true);
    finish(steps, 'D / merged temporary stone treads');
    root.userData.routeSurfaces = { quality, topOffset: TOP_OFFSET, pathStones: paths.stones, stepStones: steps.stones, stairs: stairInfo,
      landing: { level: REFERENCE_STAIR_LANDING.level, top: landingTop, thickness: .18 },
      triangles: (paths.position.length + steps.position.length) / 9, mainDraws: root.children.length, borrowedMaterial: true, needsVertexColors: true,
      refinedSurfaceTriangles: paths.refinedTriangles, omittedHardSeamTriangles: paths.omittedHardSeams, omittedHardSeamAreaM2: paths.omittedArea };
    return { root, geometries };
  } catch (error) {
    geometries.forEach(geometry => geometry.dispose()); geometries.clear(); root.clear(); throw error;
  }
}
