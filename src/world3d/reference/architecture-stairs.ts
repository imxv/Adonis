import * as THREE from 'three';
import type { ArchitectureMaterialQuality, ArchitectureMaterials } from './architecture-materials';
import { ArchitectureBatch, stableNoise, stoneBlock } from './architecture-geometry';

type StairMaterials = Pick<ArchitectureMaterials, 'limestone' | 'marble' | 'mortar'>;
type XZ = readonly [number, number];

export interface StairSideExit {
  /** Zero based index into the externally supplied treadTopY array. */
  stepIndex: number;
  side: -1 | 1;
  /** Full opening along local Z. A body may be deeper than one short tread. */
  openingAlongDepth: number;
}

export interface StairLowWall {
  side: -1 | 1;
  fromStep: number;
  toStep: number;
  /** Top above the corresponding tread, at most .45 m. */
  height?: number;
}

export interface ReferenceStairFlightOptions {
  /** Metres: width, total rise, total run. The foot is z=0, ascent is local -Z. */
  size: readonly [number, number, number];
  /** Local walk heights, supplied by the authoritative route data. No half-step convention is inferred. */
  treadTopY: readonly number[];
  /** Explicit difference between the walk height and the visible stone top. */
  surfaceOffset: number;
  quality: ArchitectureMaterialQuality;
  materials: StairMaterials;
  sideExit?: StairSideExit;
  /** Optional isolated fragments; omitted by default, never an enclosing retaining wall. */
  lowWalls?: readonly StairLowWall[];
}

export interface ReferenceStairLandingOptions {
  /** The actual local XZ contour. The builder does not create or widen the route polygon. */
  polygon: readonly XZ[];
  topY: number;
  surfaceOffset: number;
  thickness?: number;
  quality: ArchitectureMaterialQuality;
  materials: StairMaterials;
}

function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new Error(`Invalid stair ${name}`);
}

function positive(value: number, name: string): void {
  finite(value, name);
  if (value <= 0) throw new Error(`Stair ${name} must be positive`);
}

/** Cut and rounded stone, with downward loss restricted to the exposed side band. */
function treadStone(width: number, height: number, depth: number, seed: number, centerX: number, flightWidth: number, high: boolean): THREE.BufferGeometry {
  // Round only the exposed upper nosing. Square rear and lower edges meet the
  // adjacent course exactly, so equal rise/thickness cannot open a bevel gap.
  const safeHalfWidth = Math.max(.1, flightWidth / 2 - .34);
  const outerSide = Math.sign(centerX), cornerX = outerSide * width / 2;
  const chipped = Math.abs(cornerX + centerX) > safeHalfWidth && stableNoise(seed + 52) > .87;
  // Fewer arc sections pay for one extra ring only at the handful of worn outer corners.
  const radius = Math.min(.017, height * .13, depth * .09), segments = high ? 3 : 1;
  const profile: [number, number][] = [[-depth / 2, -height / 2], [depth / 2, -height / 2], [depth / 2, height / 2 - radius]];
  for (let i = 1; i <= segments; i++) {
    const angle = i / segments * Math.PI / 2;
    profile.push([depth / 2 - radius + radius * Math.cos(angle), height / 2 - radius + radius * Math.sin(angle)]);
  }
  profile.push([-depth / 2, height / 2]);
  const positions: number[] = [], normals: number[] = [];
  const face = (vertices: number[][], outward: [number, number, number]): void => {
    const a = new THREE.Vector3(...vertices[0] as [number, number, number]);
    const normal = new THREE.Vector3(...vertices[1] as [number, number, number]).sub(a)
      .cross(new THREE.Vector3(...vertices[2] as [number, number, number]).sub(a)).normalize();
    if (normal.dot(new THREE.Vector3(...outward)) < 0) { vertices = [...vertices].reverse(); normal.negate(); }
    for (let i = 1; i < vertices.length - 1; i++) for (const point of [vertices[0], vertices[i], vertices[i + 1]]) {
      positions.push(...point); normals.push(normal.x, normal.y, normal.z);
    }
  };
  for (const side of [-1, 1]) face(profile.map(([z, y]) => [side * width / 2, y, z]), [side, 0, 0]);
  const xRings = [-width / 2, width / 2];
  const safeX = outerSide * safeHalfWidth - centerX;
  if (chipped && safeX > -width / 2 + 1e-5 && safeX < width / 2 - 1e-5) xRings.splice(1, 0, safeX);
  for (let ring = 0; ring < xRings.length - 1; ring++) for (let i = 0; i < profile.length; i++) {
    const a = profile[i], b = profile[(i + 1) % profile.length], left = xRings[ring], right = xRings[ring + 1];
    face([[left, a[1], a[0]], [right, a[1], a[0]], [right, b[1], b[0]], [left, b[1], b[0]]], [0, a[0] - b[0], b[1] - a[1]]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    if (Math.abs(x + centerX) <= safeHalfWidth || !chipped) continue;
    const along = Math.max(0, 1 - Math.abs(x - cornerX) / .24);
    const front = Math.max(0, 1 - Math.abs(z - depth / 2) / .12);
    const upper = Math.max(0, 1 - Math.abs(y - height / 2) / .08);
    // The chipped corner retreats into the existing envelope; it never adds a trip projection.
    position.setXYZ(i, x - Math.sign(x + centerX) * along * front * .027,
      y - along * front * upper * .034, z - along * front * .038);
  }
  geometry.userData.edgeWear = chipped ? { side: outerSide, maxRetreatX: .027, maxLossY: .034, maxRetreatZ: .038, safeHalfWidth } : null;
  geometry.computeVertexNormals();
  return geometry;
}

function finishFlightSurface(root: THREE.Group, width: number, run: number, tops: readonly number[], offset: number): void {
  const depth = run / tops.length;
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const p = object.geometry.getAttribute('position'), n = object.geometry.getAttribute('normal');
    const color = object.geometry.getAttribute('color'), wear = object.geometry.getAttribute('architectureWear');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const step = THREE.MathUtils.clamp(Math.floor(-z / depth), 0, tops.length - 1);
      const top = tops[step] + offset;
      const edge = THREE.MathUtils.smoothstep(Math.abs(x), width / 2 - .42, width / 2 - .04);
      const tread = n.getY(i) > .7 && Math.abs(y - top) < .025;
      const riser = n.getZ(i) > .7 && y < top - .035;
      // Use and runoff differ: the centre is rubbed smoother, runoff gathers at the side seams.
      const footPolish = tread ? Math.exp(-Math.pow(x / (width * .28), 4)) * .055 : 0;
      const deposit = edge * (riser ? .095 : .035) * (.6 + .4 * Math.sin(z * 2.7 + 1.2) ** 2);
      color.setXYZ(i, color.getX(i) * (1 - deposit * .5) + footPolish * .11,
        color.getY(i) * (1 - deposit * .72) + footPolish * .085,
        color.getZ(i) * (1 - deposit) + footPolish * .055);
      wear.setX(i, wear.getX(i) + deposit * .52 - footPolish);
    }
  });
}

/**
 * Real independent horizontal treads and risers, not a textured inclined plane.
 * Owns geometry only; all three materials and their texture maps remain borrowed.
 */
export function buildReferenceStairFlight(options: ReferenceStairFlightOptions): THREE.Group {
  const { size: [width, rise, run], treadTopY: tops, surfaceOffset, quality, materials: m, sideExit } = options;
  positive(width, 'width'); positive(rise, 'rise'); positive(run, 'run'); finite(surfaceOffset, 'surfaceOffset');
  if (tops.length < 1 || !tops.every(Number.isFinite)) throw new Error('Stairs require explicit finite treadTopY values');
  for (let i = 1; i < tops.length; i++) if (tops[i] <= tops[i - 1]) throw new Error('Stair treadTopY must ascend');
  if (sideExit) {
    if (!Number.isInteger(sideExit.stepIndex) || sideExit.stepIndex < 0 || sideExit.stepIndex >= tops.length) throw new Error('Invalid stair side exit stepIndex');
    if (sideExit.side !== 1 && sideExit.side !== -1) throw new Error('Invalid stair side exit side');
    if (!Number.isFinite(sideExit.openingAlongDepth) || sideExit.openingAlongDepth < .76) throw new Error('Stair side exit needs at least .76 m along-depth clearance');
  }
  const walls = options.lowWalls ?? [];
  if (walls.length > 3) throw new Error('Only three isolated low wall fragments are supported');
  for (const wall of walls) {
    if ((wall.side !== -1 && wall.side !== 1) || !Number.isInteger(wall.fromStep) || !Number.isInteger(wall.toStep)
      || wall.fromStep < 0 || wall.toStep < wall.fromStep || wall.toStep >= tops.length) throw new Error('Invalid stair low wall range');
    positive(wall.height ?? .36, 'low wall height');
    if ((wall.height ?? .36) > .45) throw new Error('Stair low walls may not exceed .45 m above their tread');
    if (wall.toStep - wall.fromStep + 1 > Math.max(3, Math.ceil(tops.length * .3))) throw new Error('A low wall fragment may not enclose the flight');
  }
  const batch = new ArchitectureBatch(), high = quality === 'high', depth = run / tops.length;
  const thicknesses: number[] = [], edgeWear: Record<string, number>[] = [];
  for (let step = 0; step < tops.length; step++) {
    const previousRise = step ? tops[step] - tops[step - 1] : rise / tops.length;
    const nextRise = step + 1 < tops.length ? tops[step + 1] - tops[step] : previousRise;
    // At r5's .176/.178 m risers and +.018 visible offset, this enters
    // analytic-floor-.14 m support by .018/.020 m without a floating skin.
    const thickness = Math.max(.17, previousRise, nextRise);
    thicknesses.push(thickness);
    const top = tops[step] + surfaceOffset, z = -(step + .5) * depth, seed = 1801 + step * 47;
    const seam = .005;
    // Keep the core behind the rounded nose and entirely inside the unchipped
    // body lane. A box just 4mm behind a 17mm arc protrudes through its surface.
    const coreWidth = Math.max(.02, width - .70), coreFrontRecess = .022, coreRearRecess = .004;
    batch.add(new THREE.BoxGeometry(coreWidth, thickness - .008, depth - coreFrontRecess - coreRearRecess), m.mortar,
      [0, top - thickness / 2, z + (coreRearRecess - coreFrontRecess) / 2], [0, 0, 0], seed + 3);
    const splits = [-width / 2,
      -width / 2 + width * (.29 + stableNoise(seed + 4) * .08),
      -width / 2 + width * (.64 + stableNoise(seed + 5) * .07), width / 2];
    for (let stone = 0; stone < splits.length - 1; stone++) {
      const left = splits[stone] + (stone ? seam / 2 : 0), right = splits[stone + 1] - (stone < splits.length - 2 ? seam / 2 : 0);
      const center = (left + right) / 2;
      const geometry = treadStone(right - left, thickness, depth, seed + stone * 113, center, width, high);
      if (geometry.userData.edgeWear) edgeWear.push({ step, stone, ...geometry.userData.edgeWear });
      batch.add(geometry, m.limestone, [center, top - thickness / 2, z], [0, 0, 0], seed + stone * 113);
    }
    // Short, shallow side cuts read as bedding strata and remain outside the body lane.
    if (high && step % 3 === 1) for (const side of [-1, 1]) {
      const cutDepth = Math.min(depth * .58, .24), cutHeight = .004;
      batch.add(new THREE.BoxGeometry(.002, cutHeight, cutDepth), m.mortar,
        [side * (width / 2 - .001), top - .075, z + depth * .04], [0, 0, 0], seed + side);
    }
  }
  const wallInnerX = width / 2 + .28, wallWidth = .24;
  let wallPieces = 0;
  for (const wall of walls) for (let step = wall.fromStep; step <= wall.toStep; step++) {
    const front = -step * depth, rear = -(step + 1) * depth;
    let intervals: [number, number][] = [[rear, front]];
    if (sideExit?.side === wall.side) {
      const exitZ = -(sideExit.stepIndex + .5) * depth, half = sideExit.openingAlongDepth / 2;
      intervals = intervals.flatMap(([a, b]) => b <= exitZ - half || a >= exitZ + half ? [[a, b] as [number, number]]
        : [[a, Math.min(b, exitZ - half)], [Math.max(a, exitZ + half), b]].filter(([a, b]) => b - a > .06) as [number, number][]);
    }
    for (const [a, b] of intervals) {
      const height = wall.height ?? .36, top = tops[step] + surfaceOffset;
      const seed = 7201 + step * 29 + wall.side * 5;
      batch.add(stoneBlock(wallWidth, height + .15, b - a - .006, seed, 0, .016), m.limestone,
        [wall.side * (wallInnerX + wallWidth / 2), top + (height - .15) / 2, (a + b) / 2], [0, 0, 0], seed);
      wallPieces++;
    }
  }
  const root = batch.finish('reference-stair-flight');
  finishFlightSurface(root, width, run, tops, surfaceOffset);
  root.userData = {
    kind: 'reference-stair-flight', quality, geometryOnly: true, ascentAxis: '-Z',
    width, rise, run, levels: tops.length, treadTopY: [...tops], surfaceOffset,
    visibleTreadTopY: tops.map(y => y + surfaceOffset), thicknesses,
    edgeWear, coreFrontRecess: .022, coreSideRecess: .35,
    supportTopOffset: -.14, supportRelativeTo: 'analytic-foot-floor', supportPenetration: thicknesses.map(t => t - .14 - surfaceOffset),
    safeHalfWidth: width / 2 - .34, lowWallInnerAbsX: wallInnerX, lowWallPieces: wallPieces,
    sideExit: sideExit ? { ...sideExit, localZ: -(sideExit.stepIndex + .5) * depth } : null,
    materialOwnership: 'borrowed', stage: 'independent-asset-proof',
  };
  return root;
}

interface Point { x: number; z: number }

function clipPolygon(points: readonly Point[], axis: 'x' | 'z', bound: number, keepGreater: boolean): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const insideA = keepGreater ? a[axis] >= bound : a[axis] <= bound;
    const insideB = keepGreater ? b[axis] >= bound : b[axis] <= bound;
    if (insideA) out.push(a);
    if (insideA !== insideB) {
      const t = (bound - a[axis]) / (b[axis] - a[axis]);
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

function polygonArea(points: readonly Point[]): number {
  return points.reduce((area, p, i) => {
    const q = points[(i + 1) % points.length]; return area + p.x * q.z - q.x * p.z;
  }, 0) / 2;
}

/** Recess the mortar core a few millimetres so its side faces never fight the cut stone. */
function insetPolygon(points: readonly XZ[], distance: number): THREE.Vector2[] {
  const signedArea = polygonArea(points.map(([x, z]) => ({ x, z })));
  const sign = signedArea < 0 ? 1 : -1;
  return points.map(([x, z], i) => {
    const previous = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
    const before = new THREE.Vector2(x - previous[0], z - previous[1]).normalize();
    const after = new THREE.Vector2(next[0] - x, next[1] - z).normalize();
    const n1 = new THREE.Vector2(before.y * sign, -before.x * sign);
    const n2 = new THREE.Vector2(after.y * sign, -after.x * sign);
    const bisector = n1.clone().add(n2).normalize(), denominator = bisector.dot(n2);
    const length = Math.abs(denominator) > .25 ? distance / denominator : distance;
    return new THREE.Vector2(x, z).addScaledVector(bisector, length);
  });
}

/** A closed solid assembled from clipped triangle pieces; interior tessellation edges cancel. */
function polygonSolid(pieces: readonly Point[][], bottom: number, top: number): THREE.BufferGeometry {
  const positions: number[] = [], normals: number[] = [];
  const edges = new Map<string, { a: Point; b: Point; count: number }>();
  const key = (p: Point): string => `${p.x.toFixed(7)},${p.z.toFixed(7)}`;
  const triangle = (a: number[], b: number[], c: number[]): void => {
    const normal = new THREE.Vector3(...b as [number, number, number]).sub(new THREE.Vector3(...a as [number, number, number]))
      .cross(new THREE.Vector3(...c as [number, number, number]).sub(new THREE.Vector3(...a as [number, number, number]))).normalize();
    for (const point of [a, b, c]) { positions.push(...point); normals.push(normal.x, normal.y, normal.z); }
  };
  for (const original of pieces) {
    const points = polygonArea(original) > 0 ? [...original].reverse() : original;
    for (let i = 1; i < points.length - 1; i++) {
      triangle([points[0].x, top, points[0].z], [points[i].x, top, points[i].z], [points[i + 1].x, top, points[i + 1].z]);
      triangle([points[0].x, bottom, points[0].z], [points[i + 1].x, bottom, points[i + 1].z], [points[i].x, bottom, points[i].z]);
    }
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length], ak = key(a), bk = key(b);
      const edgeKey = ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
      const edge = edges.get(edgeKey);
      if (edge) edge.count++; else edges.set(edgeKey, { a, b, count: 1 });
    }
  }
  for (const { a, b, count } of edges.values()) if (count === 1) {
    triangle([a.x, top, a.z], [a.x, bottom, a.z], [b.x, bottom, b.z]);
    triangle([a.x, top, a.z], [b.x, bottom, b.z], [b.x, top, b.z]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

/** Exact external polygon with a closed .18 m body and staggered flush paving. */
export function buildReferenceStairLanding(options: ReferenceStairLandingOptions): THREE.Group {
  const { polygon, topY, surfaceOffset, materials: m, quality } = options;
  finite(topY, 'landing topY'); finite(surfaceOffset, 'landing surfaceOffset');
  const thickness = options.thickness ?? .18;
  positive(thickness, 'landing thickness');
  if (thickness < .16) throw new Error('A stair landing requires at least .16 m solid thickness');
  if (polygon.length < 3 || !polygon.every(p => p.length === 2 && p.every(Number.isFinite))) throw new Error('A stair landing requires an external finite polygon');
  const contour = polygon.map(([x, z]) => new THREE.Vector2(x, z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const triangles = faces.map(face => face.map(i => ({ x: polygon[i][0], z: polygon[i][1] })));
  if (Math.abs(polygonArea(polygon.map(([x, z]) => ({ x, z })))) < .01 || !triangles.length) throw new Error('Stair landing polygon is degenerate');
  const xMin = Math.min(...polygon.map(p => p[0])), xMax = Math.max(...polygon.map(p => p[0]));
  const zMin = Math.min(...polygon.map(p => p[1])), zMax = Math.max(...polygon.map(p => p[1]));
  const top = topY + surfaceOffset, bottom = top - thickness, batch = new ArchitectureBatch();
  const coreContour = insetPolygon(polygon, .006);
  const coreTriangles = THREE.ShapeUtils.triangulateShape(coreContour, []).map(face => face.map(i => ({ x: coreContour[i].x, z: coreContour[i].y })));
  batch.add(polygonSolid(coreTriangles, bottom + .002, top - .003), m.mortar, [0, 0, 0], [0, 0, 0], 8801);
  const rowDepth = quality === 'high' ? .52 : .7, cellWidth = .91, seam = .005;
  let pavingStones = 0;
  for (let row = 0, z = zMin; z < zMax - 1e-8; row++, z += rowDepth) {
    const stagger = row % 2 ? cellWidth * .42 : 0;
    for (let column = 0, x = xMin - stagger; x < xMax - 1e-8; column++, x += cellWidth) {
      const left = x <= xMin ? xMin : x + seam / 2;
      const right = Math.min(xMax, x + cellWidth - seam / 2);
      const rear = z <= zMin ? zMin : z + seam / 2;
      const front = Math.min(zMax, z + rowDepth - seam / 2);
      const pieces: Point[][] = [];
      for (const triangle of triangles) {
        let clipped = clipPolygon(triangle, 'x', left, true);
        clipped = clipPolygon(clipped, 'x', right, false);
        clipped = clipPolygon(clipped, 'z', rear, true);
        clipped = clipPolygon(clipped, 'z', front, false);
        if (clipped.length >= 3 && Math.abs(polygonArea(clipped)) > 1e-9) pieces.push(clipped);
      }
      if (!pieces.length) continue;
      batch.add(polygonSolid(pieces, bottom, top), m.limestone, [0, 0, 0], [0, 0, 0], 9101 + row * 83 + column * 19);
      pavingStones++;
    }
  }
  const root = batch.finish('reference-stair-landing');
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position'), normals = object.geometry.getAttribute('normal');
    const wear = object.geometry.getAttribute('architectureWear');
    for (let i = 0; i < positions.count; i++) if (normals.getY(i) > .8 && Math.abs(positions.getY(i) - top) < .001) wear.setX(i, wear.getX(i) - .045);
  });
  root.userData = {
    kind: 'reference-stair-landing', quality, geometryOnly: true, polygon: polygon.map(p => [...p]),
    topY, surfaceOffset, visibleTopY: top, thickness, pavingStones,
    supportTopOffset: -.14, supportRelativeTo: 'analytic-foot-floor', supportPenetration: thickness - .14 - surfaceOffset,
    materialOwnership: 'borrowed', stage: 'independent-asset-proof',
  };
  return root;
}
