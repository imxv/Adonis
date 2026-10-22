import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { referenceFlightFloor, referenceFlightStepCenter, REFERENCE_STAIR_GROUND_CLEARANCE as TREAD_CLEARANCE } from './landform-layout';
import type { LandformContour, LandformFlight, LandformLanding, LandformXZ, SanctuaryLandformOptions } from './nature-landform-types';

type Point = [number, number, number];
type LocalPoint = { u: number; v: number; y: number };
type Corridor = { id: string; x: number; z: number; ux: number; uz: number; half: number; length: number; startY: number; rise: number; levels: number; stepHeights?: readonly number[]; support?: { u0: number; y0: number; slope: number; lastCeiling: number; halfRise: number }; polygon?: LandformXZ[]; polygonMargin?: number };
const TILE_METRES = 3;
const BODY_MARGIN = .28;
const EPSILON = 1e-7;

function abort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Sanctuary rock generation aborted', 'AbortError');
}
function clamp(v: number, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, v)); }
function mix(a: number, b: number, t: number) { return a + (b - a) * t; }
function smooth(t: number) { t = clamp(t); return t * t * (3 - 2 * t); }
function finite(values: readonly number[]) { return values.every(Number.isFinite); }
function inside(x: number, z: number, ring: readonly LandformXZ[]): boolean {
  let contained = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) contained = !contained;
  }
  return contained;
}

/** A shared interior origin is construction data, never a placement transform. */
function commonOrigin(contours: readonly LandformContour[]): LandformXZ {
  const top = contours[0].outlineXZ;
  const average: LandformXZ = [top.reduce((n, p) => n + p[0], 0) / top.length, top.reduce((n, p) => n + p[1], 0) / top.length];
  if (contours.every(c => inside(average[0], average[1], c.outlineXZ))) return average;
  const xs = top.map(p => p[0]), zs = top.map(p => p[1]);
  for (let z = Math.min(...zs); z <= Math.max(...zs); z += .5) {
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += .5) {
      if (contours.every(c => inside(x, z, c.outlineXZ))) return [x, z];
    }
  }
  throw new Error('Sanctuary contours must share an interior region');
}

function radialExtent(origin: LandformXZ, ux: number, uz: number, ring: readonly LandformXZ[]): number {
  let radius = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ex = b[0] - a[0], ez = b[1] - a[1], ax = a[0] - origin[0], az = a[1] - origin[1];
    const cross = ux * ez - uz * ex;
    if (Math.abs(cross) < 1e-10) continue;
    const t = (ax * ez - az * ex) / cross;
    const edge = (ax * uz - az * ux) / cross;
    if (t > 0 && edge >= -EPSILON && edge <= 1 + EPSILON) radius = Math.max(radius, t);
  }
  if (!Number.isFinite(radius) || radius <= 0) throw new Error('Sanctuary contour is not radially visible from its common interior');
  return radius;
}

function corridors(flights: readonly LandformFlight[], landing: LandformLanding): Corridor[] {
  const result: Corridor[] = flights.map(flight => {
    const dx = flight.end[0] - flight.position[0], dz = flight.end[2] - flight.position[2];
    const length = Math.hypot(dx, dz);
    if (!finite([...flight.position, ...flight.end, ...flight.size, flight.levels]) || length <= 0 || flight.size[0] <= 0 || flight.levels < 1 || !Number.isInteger(flight.levels)) throw new Error('Invalid sanctuary stair flight');
    if (Math.abs(length - flight.size[2]) > 1e-4 || Math.abs(flight.end[1] - flight.position[1] - flight.size[1]) > 1e-4) throw new Error('Sanctuary stair end/size disagree');
    if (flight.yaw !== undefined && (!Number.isFinite(flight.yaw) || Math.abs(-Math.sin(flight.yaw) * length - dx) > 1e-4 || Math.abs(-Math.cos(flight.yaw) * length - dz) > 1e-4)) throw new Error('Sanctuary stair yaw/end disagree');
    const stepCentres: number[] = [];
    const stepHeights = Array.from({ length: flight.levels }, (_, step) => {
      const center = referenceFlightStepCenter(flight as Parameters<typeof referenceFlightStepCenter>[0], step);
      const height = referenceFlightFloor(flight as Parameters<typeof referenceFlightFloor>[0], center[0], center[2]);
      if (height === undefined || !Number.isFinite(height)) throw new Error('D stair helper returned no floor at its own step centre');
      stepCentres.push(((center[0] - flight.position[0]) * dx + (center[2] - flight.position[2]) * dz) / length);
      return height;
    });
    const last = stepHeights.length - 1;
    const slope = last ? (stepHeights[last] - stepHeights[0]) / (stepCentres[last] - stepCentres[0]) : 0;
    const halfRise = Math.max(0, ...stepHeights.slice(1).map((height, i) => Math.abs(height - stepHeights[i]))) / 2;
    const residual = Math.min(...stepHeights.map((height, i) => height - (stepHeights[0] + slope * (stepCentres[i] - stepCentres[0]))));
    const support = { u0: stepCentres[0], y0: stepHeights[0] + residual - halfRise - TREAD_CLEARANCE, slope, lastCeiling: stepHeights[last] - TREAD_CLEARANCE, halfRise };
    return { id: flight.id, x: flight.position[0], z: flight.position[2], ux: dx / length, uz: dz / length,
      length, half: flight.size[0] / 2 + BODY_MARGIN, startY: flight.position[1], rise: flight.end[1] - flight.position[1], levels: Math.floor(flight.levels), stepHeights, support };
  });
  const dx = landing.to[0] - landing.from[0], dz = landing.to[2] - landing.from[2], length = Math.hypot(dx, dz);
  if (!finite([...landing.from, ...landing.to, landing.width]) || length <= 0) throw new Error('Invalid sanctuary landing');
  const platform: Corridor = { id: 'sanctuary.stair-landing', x: landing.from[0], z: landing.from[2], ux: dx / length, uz: dz / length,
    length, half: landing.width / 2 + BODY_MARGIN, startY: landing.level ?? Math.min(landing.from[1], landing.to[1]), rise: 0, levels: 1 };
  if (landing.outlineXZ?.length) {
    platform.polygon = landing.outlineXZ.map(p => { const projected = local([p[0], platform.startY, p[1]], platform); return [projected.u, projected.v]; });
    platform.polygonMargin = Math.max(BODY_MARGIN, landing.minimumBodyRadius ?? BODY_MARGIN);
    if (platform.polygon.length < 3 || platform.polygon.some(p => !finite(p))) throw new Error('Invalid sanctuary landing outline');
    let orientation = 0;
    for (let i = 0; i < platform.polygon.length; i++) {
      const a = platform.polygon[i], b = platform.polygon[(i + 1) % platform.polygon.length], c = platform.polygon[(i + 2) % platform.polygon.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) < EPSILON) continue;
      if (orientation && orientation * cross < 0) throw new Error('Sanctuary landing outline must be convex for exact expanded clipping');
      orientation = Math.sign(cross);
    }
    if (!orientation) throw new Error('Sanctuary landing outline has no area');
  }
  result.push(platform);
  return result;
}
function local(p: Point, corridor: Corridor): LocalPoint {
  const x = p[0] - corridor.x, z = p[2] - corridor.z;
  return { u: x * corridor.ux + z * corridor.uz, v: -x * corridor.uz + z * corridor.ux, y: p[1] };
}
function clip(input: readonly LocalPoint[], key: 'u' | 'v', bound: number, lower: boolean): LocalPoint[] {
  if (!input.length) return [];
  const result: LocalPoint[] = [];
  let a = input[input.length - 1];
  let da = lower ? a[key] - bound : bound - a[key];
  for (const b of input) {
    const db = lower ? b[key] - bound : bound - b[key];
    if ((da >= -EPSILON) !== (db >= -EPSILON)) {
      const t = da / (da - db);
      result.push({ u: mix(a.u, b.u, t), v: mix(a.v, b.v, t), y: mix(a.y, b.y, t) });
    }
    if (db >= -EPSILON) result.push(b);
    a = b; da = db;
  }
  return result;
}
function rectangleIntersection(triangle: readonly LocalPoint[], u0: number, u1: number, half: number): LocalPoint[] {
  let result = clip(triangle, 'u', u0, true);
  result = clip(result, 'u', u1, false);
  result = clip(result, 'v', -half, true);
  return clip(result, 'v', half, false);
}
function projectedArea(points: readonly LocalPoint[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; area += a.u * b.v - a.v * b.u; }
  return Math.abs(area) * .5;
}
function corridorBounds(c: Corridor): [number, number, number, number] {
  if (!c.polygon) return [-BODY_MARGIN, c.length + BODY_MARGIN, -c.half, c.half];
  const margin = c.polygonMargin ?? BODY_MARGIN;
  return [Math.min(...c.polygon.map(p => p[0])) - margin, Math.max(...c.polygon.map(p => p[0])) + margin,
    Math.min(...c.polygon.map(p => p[1])) - margin, Math.max(...c.polygon.map(p => p[1])) + margin];
}
function landingIntersection(input: readonly LocalPoint[], route: Corridor): LocalPoint[] {
  if (!route.polygon) return rectangleIntersection(input, -BODY_MARGIN, route.length + BODY_MARGIN, route.half);
  const outline = route.polygon;
  let signedArea = 0;
  for (let i = 0; i < outline.length; i++) { const a = outline[i], b = outline[(i + 1) % outline.length]; signedArea += a[0] * b[1] - a[1] * b[0]; }
  const sign = Math.sign(signedArea), margin = route.polygonMargin ?? BODY_MARGIN;
  let result = [...input];
  for (let i = 0; i < outline.length && result.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    const distance = (p: LocalPoint) => sign * (dx * (p.v - a[1]) - dz * (p.u - a[0])) + margin * length;
    const next: LocalPoint[] = [];
    let p = result[result.length - 1], dp = distance(p);
    for (const q of result) {
      const dq = distance(q);
      if ((dp >= -EPSILON) !== (dq >= -EPSILON)) { const t = dp / (dp - dq); next.push({ u: mix(p.u, q.u, t), v: mix(p.v, q.v, t), y: mix(p.y, q.y, t) }); }
      if (dq >= -EPSILON) next.push(q);
      p = q; dp = dq;
    }
    result = next;
  }
  return result;
}
function overlap(triangle: readonly LocalPoint[], c: Corridor): boolean {
  if (Math.max(...triangle.map(p => p.y)) <= c.startY - TREAD_CLEARANCE) return false;
  const [u0, u1, v0, v1] = corridorBounds(c);
  if (Math.max(...triangle.map(p => p.u)) < u0 || Math.min(...triangle.map(p => p.u)) > u1 || Math.max(...triangle.map(p => p.v)) < v0 || Math.min(...triangle.map(p => p.v)) > v1) return false;
  return projectedArea(c.polygon ? landingIntersection(triangle, c) : rectangleIntersection(triangle, u0, u1, c.half)) > 1e-9;
}
function supportHeight(p: LocalPoint, route: Corridor): number {
  if (!route.support) return route.startY - TREAD_CLEARANCE;
  return Math.min(route.support.y0 + route.support.slope * (p.u - route.support.u0), route.support.lastCeiling);
}
function distanceToCorridor(p: LocalPoint, route: Corridor): number {
  if (!route.polygon) {
    const [u0, u1] = corridorBounds(route);
    return Math.hypot(Math.max(u0 - p.u, 0, p.u - u1), Math.max(Math.abs(p.v) - route.half, 0));
  }
  let signedArea = 0;
  for (let i = 0; i < route.polygon.length; i++) { const a = route.polygon[i], b = route.polygon[(i + 1) % route.polygon.length]; signedArea += a[0] * b[1] - a[1] * b[0]; }
  const sign = Math.sign(signedArea), margin = route.polygonMargin ?? BODY_MARGIN;
  let distance = 0;
  for (let i = 0; i < route.polygon.length; i++) {
    const a = route.polygon[i], b = route.polygon[(i + 1) % route.polygon.length], dx = b[0] - a[0], dz = b[1] - a[1];
    distance = Math.max(distance, -sign * (dx * (p.v - a[1]) - dz * (p.u - a[0])) / Math.hypot(dx, dz) - margin);
  }
  return distance;
}

/** Red/green refinement shares every split edge with its neighbour, including
 * the side/cap. It does not introduce open T junctions at the stair corridor. */
function refineRouteTriangles(points: Point[], initial: number[], routes: readonly Corridor[], signal?: AbortSignal) {
  let indices = initial;
  let refinementRounds = 0;
  const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  for (let round = 0; round < 8; round++) {
    abort(signal);
    const edges = new Set<string>();
    for (let i = 0; i < indices.length; i += 3) {
      const ids = [indices[i], indices[i + 1], indices[i + 2]];
      for (const route of routes) {
        const tri = ids.map(index => local(points[index], route));
        if (!overlap(tri, route)) continue;
        const maximumDepth = route.rise ? route.length / route.levels * .85 : .65;
        for (let edge = 0; edge < 3; edge++) {
          const next = (edge + 1) % 3;
          if (Math.abs(tri[edge].u - tri[next].u) > maximumDepth || Math.abs(tri[edge].v - tri[next].v) > .8) edges.add(key(ids[edge], ids[next]));
        }
      }
    }
    if (!edges.size) break;
    const middle = new Map<string, number>();
    for (const edge of edges) {
      const [a, b] = edge.split(':').map(Number), p = points[a], q = points[b];
      middle.set(edge, points.push([mix(p[0], q[0], .5), mix(p[1], q[1], .5), mix(p[2], q[2], .5)]) - 1);
    }
    const next: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const ids = [indices[i], indices[i + 1], indices[i + 2]];
      const boundary: number[] = [];
      for (let edge = 0; edge < 3; edge++) {
        boundary.push(ids[edge]);
        const split = middle.get(key(ids[edge], ids[(edge + 1) % 3]));
        if (split !== undefined) boundary.push(split);
      }
      if (boundary.length === 3) { next.push(...ids); continue; }
      const a = points[ids[0]], b = points[ids[1]], c = points[ids[2]];
      const center = points.push([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]) - 1;
      for (let edge = 0; edge < boundary.length; edge++) next.push(center, boundary[edge], boundary[(edge + 1) % boundary.length]);
    }
    indices = next; refinementRounds++;
  }
  return { indices, refinementRounds };
}

function carveAndAuditRoutes(points: Point[], indices: readonly number[], routes: readonly Corridor[]) {
  const ceilings = new Float64Array(points.length); ceilings.fill(Infinity);
  let clippedTriangleStepPairs = 0;
  let maximumStairTriangleDepth = 0;
  const bevelWidth = 1.4;
  let bevelledVertices = 0;
  // This broad cut precedes the proof pass. Its centre is one continuous
  // affine under-envelope, rather than a different flat floor per triangle.
  for (const point of points) for (const route of routes) {
    const p = local(point, route), distance = distanceToCorridor(p, route);
    if (distance >= bevelWidth) continue;
    const y = supportHeight(p, route);
    if (point[1] <= y) continue;
    point[1] = mix(point[1], y, 1 - smooth(distance / bevelWidth)); bevelledVertices++;
  }
  function forEachPiece(callback: (ids: number[], polygon: LocalPoint[], ceiling: number, route: Corridor) => void) {
    for (let i = 0; i < indices.length; i += 3) {
      const ids = [indices[i], indices[i + 1], indices[i + 2]];
      for (const route of routes) {
        const triangle = ids.map(index => local(points[index], route));
        const uMin = Math.min(...triangle.map(p => p.u)), uMax = Math.max(...triangle.map(p => p.u));
        const [u0, u1, v0, v1] = corridorBounds(route);
        if (uMax < u0 || uMin > u1 || Math.max(...triangle.map(p => p.v)) < v0 || Math.min(...triangle.map(p => p.v)) > v1) continue;
        if (route.polygon) {
          const polygon = landingIntersection(triangle, route);
          if (polygon.length) callback(ids, polygon, route.startY - TREAD_CLEARANCE, route);
          continue;
        }
        const run = route.length / route.levels;
        const start = Math.max(0, Math.floor(clamp(uMin, 0, route.length - EPSILON) / run));
        const end = Math.min(route.levels - 1, Math.floor(clamp(uMax, 0, route.length - EPSILON) / run));
        for (let step = start; step <= end; step++) {
          const polygon = rectangleIntersection(triangle, step === 0 ? -BODY_MARGIN : step * run, step === route.levels - 1 ? route.length + BODY_MARGIN : (step + 1) * run, route.half);
          if (!polygon.length) continue;
          const ceiling = (route.stepHeights?.[step] ?? route.startY) - TREAD_CLEARANCE;
          callback(ids, polygon, ceiling, route);
        }
      }
    }
  }
  forEachPiece((ids, polygon, ceiling, route) => {
    clippedTriangleStepPairs++;
    let changesTriangle = false;
    for (const id of ids) {
      const support = supportHeight(local(points[id], route), route);
      if (points[id][1] > support + 1e-9) changesTriangle = true;
      ceilings[id] = Math.min(ceilings[id], support);
    }
    if (route.rise && changesTriangle) {
      const depth = ids.map(id => local(points[id], route).u);
      maximumStairTriangleDepth = Math.max(maximumStairTriangleDepth, Math.max(...depth) - Math.min(...depth));
    }
  });
  let loweredVertices = 0, maximumLowering = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i][1] > ceilings[i]) { maximumLowering = Math.max(maximumLowering, points[i][1] - ceilings[i]); points[i][1] = ceilings[i]; loweredVertices++; }
  }
  let worstViolation = -Infinity, minimumClearance = Infinity, auditedPieces = 0;
  forEachPiece((_ids, polygon, ceiling) => {
    const high = Math.max(...polygon.map(p => p.y));
    worstViolation = Math.max(worstViolation, high - ceiling);
    minimumClearance = Math.min(minimumClearance, ceiling + TREAD_CLEARANCE - high);
    auditedPieces++;
  });
  if (worstViolation > 2e-6) throw new Error(`Sanctuary rock crosses a tread clearance by ${worstViolation}m`);
  return { clippedTriangleStepPairs, auditedPieces, loweredVertices, maximumLowering, maximumStairTriangleDepth, bevelledVertices, bevelWidthM: bevelWidth,
    minimumClearanceM: Number.isFinite(minimumClearance) ? minimumClearance : null, worstViolationM: Number.isFinite(worstViolation) ? worstViolation : null,
    clearanceM: TREAD_CLEARANCE, bodyMarginEachSideM: BODY_MARGIN, convention: 'D first/last referenceFlightFloor at referenceFlightStepCenter gives affine under-envelope minus measured half-rise; all actual triangle/step pieces audited, including vertical projections',
    supportPlanes: routes.map(route => ({ id: route.id, support: route.support, landingLevel: route.support ? undefined : route.startY })) };
}

function angular(a: number) { const tau = Math.PI * 2; return (a % tau + tau) % tau; }
function angleDistance(a: number, b: number) { return Math.abs(angular(a - b + Math.PI) - Math.PI); }
function controlValue(index: number, channel: number) { const v = Math.sin((index + 1) * 127.1 + channel * 311.7) * 43758.5453; return v - Math.floor(v); }
type MacroProfile = { angle: number; upper: number; middle: number; middleY: number; lower: number; lowerY: number; foot: number; footY: number };

/** Only the opt-in branch uses this local mesh subtraction. Original faces
 * outside the finite cutters retain their exact planes; new open edges are
 * connected to a real floor with vertical sides, rather than lowering whole
 * incident triangles or applying the stair bevel outside the requested area. */
function cutSpringBranch(points: Point[], input: number[], branch: NonNullable<SanctuaryLandformOptions['springBranch']>, signal?: AbortSignal) {
  const constructionStarted = performance.now();
  const sourceActive = [...new Set(input)];
  const centerHalfWidth = branch.centerHalfWidth ?? 0;
  const additionalSupportClearance = branch.additionalSupportClearance ?? 0;
  if (branch.points.length < 2 || branch.points.some(p => !finite(p)) || !Number.isFinite(branch.bodyRadius) || branch.bodyRadius <= 0 || !Number.isFinite(branch.supportClearance) || branch.supportClearance <= 0 || !Number.isFinite(centerHalfWidth) || centerHalfWidth < 0 || !Number.isFinite(additionalSupportClearance) || additionalSupportClearance < 0) throw new Error('Invalid finite spring-branch contacts/radius/clearance');
  const radius = branch.bodyRadius + centerHalfWidth;
  const effectiveSupportClearance = branch.supportClearance + additionalSupportClearance;
  const quantizationPadding = .00005, verticalPadding = .0001, vertexSnap = 1e-12, circleSegments = 256, cutterRadius = radius + quantizationPadding;
  const outerRadius = cutterRadius / Math.cos(Math.PI / circleSegments);
  if (!Number.isFinite(radius) || !Number.isFinite(outerRadius) || !Number.isFinite(effectiveSupportClearance)) throw new Error('Spring branch effective radius/clearance overflows finite world metres');
  const known = new Map<string, number[]>();
  const remember = (p: Point, id: number) => { const key = p.map(v => Math.floor(v / vertexSnap)).join(':'), bucket = known.get(key); if (bucket) bucket.push(id); else known.set(key, [id]); };
  points.forEach(remember);
  const add = (p: Point) => {
    const cell = p.map(v => Math.floor(v / vertexSnap));
    if (!finite(p) || cell.some(v => !Number.isSafeInteger(v))) throw new Error('Spring cut exceeds finite world-coordinate precision');
    for (let x = cell[0] - 1; x <= cell[0] + 1; x++) for (let y = cell[1] - 1; y <= cell[1] + 1; y++) for (let z = cell[2] - 1; z <= cell[2] + 1; z++) for (const id of known.get(`${x}:${y}:${z}`) ?? []) {
      const q = points[id]; if ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2 <= vertexSnap ** 2) return id;
    }
    const id = points.push(p) - 1; remember(p, id); return id;
  };
  const area3 = (a: number, b: number, c: number) => {
    const p = points[a], q = points[b], r = points[c], ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  };
  const emit = (out: number[], a: number, b: number, c: number) => { if (a !== b && b !== c && c !== a && area3(a, b, c) > 1e-11) out.push(a, b, c); };
  const clean = (poly: number[]) => poly.filter((id, i) => id !== poly[(i + poly.length - 1) % poly.length]);
  let cutEdgePoints = new Set<number>();
  function split(poly: number[], distance: (p: Point) => number): [number[], number[]] {
    const inside: number[] = [], outside: number[] = [];
    if (!poly.length) return [inside, outside];
    const signed = poly.map(id => distance(points[id]));
    if (signed.every(d => d >= -1e-10)) return [poly, []];
    if (signed.every(d => d <= 1e-10)) return [[], poly];
    let a = poly[poly.length - 1], da = signed[signed.length - 1];
    for (const b of poly) {
      const db = distance(points[b]);
      if ((da > 1e-10 && db < -1e-10) || (da < -1e-10 && db > 1e-10)) {
        const t = da / (da - db), p = points[a], q = points[b];
        const id = add([mix(p[0], q[0], t), mix(p[1], q[1], t), mix(p[2], q[2], t)]);
        cutEdgePoints.add(id);
        inside.push(id); outside.push(id);
      }
      if (db >= -1e-10) inside.push(b);
      if (db <= 1e-10) outside.push(b);
      a = b; da = db;
    }
    return [clean(inside), clean(outside)];
  }
  // Propagate all new edge points to both incident faces. This also propagates
  // points where later clipping planes meet an earlier outside fragment.
  function conform(polygons: number[][], explicit: ReadonlySet<number> = new Set()): number[] {
    const cellSize = .25, buckets = new Map<string, number[]>(), activeIds = new Set(polygons.flat().filter(id => cutEdgePoints.has(id) || explicit.has(id)));
    const candidateMin = [Infinity, Infinity, Infinity], candidateMax = [-Infinity, -Infinity, -Infinity];
    for (const id of activeIds) {
      const p = points[id], key = p.map(v => Math.floor(v / cellSize)).join(':');
      const bucket = buckets.get(key); if (bucket) bucket.push(id); else buckets.set(key, [id]);
      for (let k = 0; k < 3; k++) { candidateMin[k] = Math.min(candidateMin[k], p[k]); candidateMax[k] = Math.max(candidateMax[k], p[k]); }
    }
    const result: number[] = [];
    for (const polygon of polygons) {
      if (polygon.length < 3) continue;
      const boundary: number[] = [], ownVertices = new Set(polygon);
      for (let edge = 0; edge < polygon.length; edge++) {
        const a = polygon[edge], b = polygon[(edge + 1) % polygon.length], p = points[a], q = points[b];
        boundary.push(a);
        const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], length2 = d.reduce((n, v) => n + v * v, 0);
        if (length2 < 1e-18) continue;
        const edgeTolerance = 1e-11;
        if (!activeIds.size || p.some((v, k) => Math.max(v, q[k]) < candidateMin[k] - edgeTolerance || Math.min(v, q[k]) > candidateMax[k] + edgeTolerance)) continue;
        const lo = p.map((v, k) => Math.floor((Math.max(Math.min(v, q[k]), candidateMin[k]) - edgeTolerance) / cellSize)), hi = p.map((v, k) => Math.floor((Math.min(Math.max(v, q[k]), candidateMax[k]) + edgeTolerance) / cellSize));
        const candidates: { id: number; t: number }[] = [];
        for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
          for (const id of buckets.get(`${x}:${y}:${z}`) ?? []) {
            if (ownVertices.has(id)) continue;
            const r = points[id], t = ((r[0] - p[0]) * d[0] + (r[1] - p[1]) * d[1] + (r[2] - p[2]) * d[2]) / length2;
            if (t <= 1e-8 || t >= 1 - 1e-8) continue;
            if ((r[0] - p[0] - t * d[0]) ** 2 + (r[1] - p[1] - t * d[1]) ** 2 + (r[2] - p[2] - t * d[2]) ** 2 < edgeTolerance ** 2) candidates.push({ id, t });
          }
        }
        candidates.sort((a, b) => a.t - b.t);
        for (const candidate of candidates) if (boundary[boundary.length - 1] !== candidate.id) boundary.push(candidate.id);
      }
      if (boundary.length === 3) { emit(result, boundary[0], boundary[1], boundary[2]); continue; }
      const center: Point = [0, 0, 0];
      for (const id of boundary) for (let k = 0; k < 3; k++) center[k] += points[id][k] / boundary.length;
      const id = add(center);
      for (let i = 0; i < boundary.length; i++) emit(result, id, boundary[i], boundary[(i + 1) % boundary.length]);
    }
    return result;
  }
  const boundsOf = (poly: readonly LandformXZ[]) => [Math.min(...poly.map(p => p[0])), Math.max(...poly.map(p => p[0])), Math.min(...poly.map(p => p[1])), Math.max(...poly.map(p => p[1]))];
  let indices = input, removedPieces = 0, wallTriangles = 0, capTriangles = 0;
  const affected = new THREE.Box3(), operations: object[] = [];
  function subtract(polygon: LandformXZ[], ceiling: (x: number, z: number) => number, label: string, deferCap = false, forceClose = false) {
    if (polygon.length < 3) return;
    abort(signal);
    const bounds = boundsOf(polygon), pieces: number[][] = [];
    cutEdgePoints = new Set();
    let removed = 0;
    for (let i = 0; i < indices.length; i += 3) {
      if ((i & 2047) === 0) abort(signal);
      const ids = [indices[i], indices[i + 1], indices[i + 2]], tri = ids.map(id => points[id]);
      if (Math.max(...tri.map(p => p[0])) < bounds[0] || Math.min(...tri.map(p => p[0])) > bounds[1] || Math.max(...tri.map(p => p[2])) < bounds[2] || Math.min(...tri.map(p => p[2])) > bounds[3] || tri.every(p => p[1] <= ceiling(p[0], p[2]) + 1e-9)) { pieces.push(ids); continue; }
      const firstFragment = pieces.length;
      let remaining = ids;
      for (let edge = 0; edge < polygon.length && remaining.length; edge++) {
        const a = polygon[edge], b = polygon[(edge + 1) % polygon.length], dx = b[0] - a[0], dz = b[1] - a[1], edgeLength = Math.hypot(dx, dz);
        if (edgeLength < 1e-12) continue;
        const [inside, outside] = split(remaining, p => (dx * (p[2] - a[1]) - dz * (p[0] - a[0])) / edgeLength);
        if (outside.length >= 3) pieces.push(outside);
        remaining = inside;
      }
      if (!remaining.length) { pieces.length = firstFragment; pieces.push(ids); continue; }
      const [below, above] = split(remaining, p => ceiling(p[0], p[2]) - p[1]);
      if (above.length >= 3 && above.some(id => points[id][1] > ceiling(points[id][0], points[id][2]) + 1e-8)) {
        if (below.length >= 3) pieces.push(below);
        removed++;
        for (const id of above) affected.expandByPoint(new THREE.Vector3(...points[id]));
      } else { pieces.length = firstFragment; pieces.push(ids); }
    }
    if (!removed && !forceClose) return;
    let kept = removed ? conform(pieces) : indices;
    if (deferCap) { indices = kept; removedPieces += removed; operations.push({ label, originalFacePiecesRemoved: removed, sharedPlaneClosureDeferred: true }); return; }
    const edges = new Map<string, { a: number; b: number; count: number }>();
    for (let i = 0; i < kept.length; i += 3) for (let k = 0; k < 3; k++) {
      const a = kept[i + k], b = kept[i + (k + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`, edge = edges.get(key);
      if (edge) edge.count++; else edges.set(key, { a, b, count: 1 });
    }
    if ([...edges.values()].some(e => e.count > 2)) throw new Error(`Spring cut produced a non-manifold original patch (${label}): ${JSON.stringify([...edges.values()].filter(e => e.count > 2).slice(0, 3).map(e => ({ ...e, from: points[e.a], to: points[e.b] })))}`);
    const outgoing = new Map<number, number>(), open = [...edges.values()].filter(e => e.count === 1);
    if (!open.length && !removed) return;
    for (const edge of open) { if (outgoing.has(edge.a)) throw new Error(`Spring cut boundary branches (${label})`); outgoing.set(edge.a, edge.b); }
    const loops: number[][] = [];
    while (outgoing.size) {
      const first = outgoing.keys().next().value!, loop: number[] = []; let cursor = first;
      do { const next = outgoing.get(cursor); if (next === undefined) throw new Error(`Spring cut has an unclosed boundary (${label})`); loop.push(cursor); outgoing.delete(cursor); cursor = next; } while (cursor !== first && loop.length <= open.length);
      if (cursor !== first) throw new Error(`Spring cut boundary did not close (${label})`);
      loops.push(loop);
    }
    // A folded rock section may traverse a cutter side forwards and then
    // backwards. Union its oriented wall bands in that side's own (u,y)
    // plane before triangulating; projecting each edge independently would
    // leave coincident opposite curtains with different diagonals.
    type WallSegment = { a: number; b: number; u0: number; u1: number; sign: number };
    const wallGroups = new Map<string, { origin: Point; ux: number; uz: number; segments: WallSegment[] }>();
    for (const loop of loops) for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length], p = points[a], q = points[b], dx = q[0] - p[0], dz = q[2] - p[2], length = Math.hypot(dx, dz);
      if (length < 1e-10 || Math.max(p[1] - ceiling(p[0], p[2]), q[1] - ceiling(q[0], q[2])) < 1e-9) continue;
      const orientation = dx < -1e-12 || (Math.abs(dx) <= 1e-12 && dz < 0) ? -1 : 1, ux = dx / length * orientation, uz = dz / length * orientation;
      const key = [Math.round(ux * 1e8), Math.round(uz * 1e8), Math.round((-uz * p[0] + ux * p[2]) * 1e7)].join(':');
      let group = wallGroups.get(key); if (!group) { group = { origin: p, ux, uz, segments: [] }; wallGroups.set(key, group); }
      const u0 = (p[0] - group.origin[0]) * group.ux + (p[2] - group.origin[2]) * group.uz, u1 = (q[0] - group.origin[0]) * group.ux + (q[2] - group.origin[2]) * group.uz;
      group.segments.push({ a, b, u0, u1, sign: Math.sign(u1 - u0) });
    }
    const wallEdgePoints = new Set<number>();
    for (const group of wallGroups.values()) {
      const value = (segment: WallSegment, u: number) => mix(points[segment.a][1], points[segment.b][1], (u - segment.u0) / (segment.u1 - segment.u0));
      const breaks = group.segments.flatMap(segment => [segment.u0, segment.u1]);
      for (let a = 0; a < group.segments.length; a++) for (let b = a + 1; b < group.segments.length; b++) {
        const p = group.segments[a], q = group.segments[b], lo = Math.max(Math.min(p.u0, p.u1), Math.min(q.u0, q.u1)), hi = Math.min(Math.max(p.u0, p.u1), Math.max(q.u0, q.u1));
        if (hi - lo <= 1e-12) continue;
        const d0 = value(p, lo) - value(q, lo), d1 = value(p, hi) - value(q, hi);
        if (d0 * d1 < 0) breaks.push(mix(lo, hi, d0 / (d0 - d1)));
      }
      breaks.sort((a, b) => a - b);
      const levels = breaks.filter((u, i) => !i || u - breaks[i - 1] > 1e-10);
      const vertex = (segment: WallSegment | undefined, u: number) => {
        let p: Point;
        if (segment) {
          if (Math.abs(u - segment.u0) < 1e-10) { wallEdgePoints.add(segment.a); return segment.a; }
          if (Math.abs(u - segment.u1) < 1e-10) { wallEdgePoints.add(segment.b); return segment.b; }
          const a = points[segment.a], b = points[segment.b], t = (u - segment.u0) / (segment.u1 - segment.u0);
          p = [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
        } else { const x = group.origin[0] + group.ux * u, z = group.origin[2] + group.uz * u; p = [x, ceiling(x, z), z]; }
        const id = add(p); wallEdgePoints.add(id); return id;
      };
      for (let i = 0; i < levels.length - 1; i++) {
        const lo = levels[i], hi = levels[i + 1], mid = (lo + hi) / 2;
        const active = group.segments.filter(segment => mid > Math.min(segment.u0, segment.u1) && mid < Math.max(segment.u0, segment.u1)).sort((a, b) => value(a, mid) - value(b, mid));
        let winding = active.reduce((n, segment) => n + segment.sign, 0), lower: WallSegment | undefined;
        for (const upper of active) {
          if (winding) {
            const a = vertex(lower, lo), b = vertex(lower, hi), c = vertex(upper, hi), d = vertex(upper, lo), before = kept.length;
            if (winding > 0) { emit(kept, c, d, a); emit(kept, c, a, b); } else { emit(kept, c, a, d); emit(kept, c, b, a); }
            wallTriangles += (kept.length - before) / 3;
          }
          winding -= upper.sign; lower = upper;
        }
      }
    }
    kept = conform(Array.from({ length: kept.length / 3 }, (_, i) => kept.slice(i * 3, i * 3 + 3)), wallEdgePoints);
    const floorEdges = new Map<string, { a: number; b: number; count: number }>();
    for (let i = 0; i < kept.length; i += 3) for (let k = 0; k < 3; k++) { const a = kept[i + k], b = kept[i + (k + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`, edge = floorEdges.get(key); if (edge) edge.count++; else floorEdges.set(key, { a, b, count: 1 }); }
    const floorOutgoing = new Map<number, number>();
    for (const edge of floorEdges.values()) if (edge.count === 1) { if (floorOutgoing.has(edge.a)) throw new Error(`Spring wall union boundary branches (${label})`); floorOutgoing.set(edge.a, edge.b); }
    const floorLoops: number[][] = [];
    while (floorOutgoing.size) {
      const first = floorOutgoing.keys().next().value!, loop: number[] = []; let cursor = first;
      do { const next = floorOutgoing.get(cursor); if (next === undefined) throw new Error(`Spring wall union boundary is open (${label})`); loop.push(cursor); floorOutgoing.delete(cursor); cursor = next; } while (cursor !== first && loop.length <= floorEdges.size);
      if (cursor !== first) throw new Error(`Spring wall union boundary did not close (${label})`);
      floorLoops.push(loop);
    }
    const projected: { ids: number[]; area: number }[] = [], capBoundary = new Set<number>();
    for (const loop of floorLoops) {
      const ids = clean(loop); ids.forEach(id => capBoundary.add(id));
      const area = THREE.ShapeUtils.area(ids.map(id => new THREE.Vector2(points[id][0], points[id][2])));
      if (Math.abs(area) > 1e-10) projected.push({ ids, area });
    }
    const outers = projected.filter(loop => loop.area > 0), holes = projected.filter(loop => loop.area < 0);
    for (const outer of outers) {
      const ownedHoles = holes.filter(hole => inside(points[hole.ids[0]][0], points[hole.ids[0]][2], outer.ids.map(id => [points[id][0], points[id][2]])));
      const contour = outer.ids.map(id => new THREE.Vector2(points[id][0], points[id][2]));
      const holeContours = ownedHoles.map(hole => hole.ids.map(id => new THREE.Vector2(points[id][0], points[id][2]))), ids = [...outer.ids, ...ownedHoles.flatMap(hole => hole.ids)];
      for (const face of THREE.ShapeUtils.triangulateShape(contour, holeContours)) {
        const [a, b, c] = face.map(i => ids[i]), p = points[a], q = points[b], r = points[c];
        const normalY = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]), before = kept.length;
        if (normalY >= 0) emit(kept, a, b, c); else emit(kept, a, c, b);
        capTriangles += (kept.length - before) / 3;
      }
    }
    if (!outers.length || holes.some(hole => !outers.some(outer => inside(points[hole.ids[0]][0], points[hole.ids[0]][2], outer.ids.map(id => [points[id][0], points[id][2]]))))) throw new Error(`Spring cut cannot project its boundary to a closed floor (${label})`);
    kept = conform(Array.from({ length: kept.length / 3 }, (_, i) => kept.slice(i * 3, i * 3 + 3)), capBoundary);
    const finalEdges = new Map<string, number>();
    for (let i = 0; i < kept.length; i += 3) for (let k = 0; k < 3; k++) { const a = kept[i + k], b = kept[i + (k + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`; finalEdges.set(key, (finalEdges.get(key) ?? 0) + 1); }
    const bad = [...finalEdges].filter(([, count]) => count !== 2);
    if (bad.some(([, count]) => count > 2)) {
      const error = new Error(`Spring final cap topology (${label}): ${JSON.stringify({ open: bad.filter(([, n]) => n === 1).length, nonManifold: bad.filter(([, n]) => n > 2).length, loops: projected.map(loop => ({ count: loop.ids.length, area: loop.area })), examples: bad.slice(0, 3).map(([key, count]) => ({ count, points: key.split(':').map(id => points[Number(id)]) })) })}`);
      throw error;
    }
    indices = kept; removedPieces += removed;
    operations.push({ label, originalFacePiecesRemoved: removed, boundaryLoops: loops.length, subFloatBoundaryEdgesForQuantization: bad.length });
  }
  function clipPlanar(poly: LandformXZ[], bound: number, lower: boolean): LandformXZ[] {
    const result: LandformXZ[] = []; if (!poly.length) return result;
    let a = poly[poly.length - 1], da = lower ? a[0] - bound : bound - a[0];
    for (const b of poly) { const db = lower ? b[0] - bound : bound - b[0]; if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); result.push([mix(a[0], b[0], t), mix(a[1], b[1], t)]); } if (db >= 0) result.push(b); a = b; da = db; }
    return result;
  }
  let maximumConservativeExtraLowering = 0;
  const affineCuts: { polygon: LandformXZ[]; ceiling: (x: number, z: number) => number; label: string }[] = [];
  const constantCuts = new Map<number, { polygon: LandformXZ[]; ceiling: (x: number, z: number) => number; label: string }[]>();
  const enqueueConstant = (polygon: LandformXZ[], floor: number, label: string) => {
    if (polygon.length < 3) return;
    const cut = { polygon, ceiling: () => floor, label }, group = constantCuts.get(floor);
    if (group) group.push(cut); else constantCuts.set(floor, [cut]);
  };
  for (let segment = 0; segment < branch.points.length - 1; segment++) {
    abort(signal);
    const a = branch.points[segment], b = branch.points[segment + 1], dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
    if (!Number.isFinite(length) || length <= 1e-8) throw new Error('Spring branch has a non-finite or zero-length XZ segment');
    const ux = dx / length, uz = dz / length, slope = (b[1] - a[1]) / length;
    if (!Number.isFinite(slope) || !Number.isFinite(Math.abs(slope) * radius) || !Number.isFinite(Math.min(a[1], b[1]) - effectiveSupportClearance - verticalPadding)) throw new Error('Spring branch support envelope overflows finite world metres');
    // The circle's angular phase is world-aligned for every segment. Rotating
    // a separate circumscribed polygon per segment creates micron-sized teeth
    // at a shared end disc, even when both segments have exactly the same floor.
    const endDiscs: LandformXZ[] = [];
    for (let i = 0; i < circleSegments; i++) {
      const angle = (i + .5) / circleSegments * Math.PI * 2, x = outerRadius * Math.cos(angle), z = outerRadius * Math.sin(angle);
      endDiscs.push([a[0] + x, a[2] + z], [b[0] + x, b[2] + z]);
    }
    if (endDiscs.some(p => !finite(p))) throw new Error('Spring branch capsule overflows finite world metres');
    endDiscs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const turn = (a: LandformXZ, b: LandformXZ, c: LandformXZ) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const lower: LandformXZ[] = [], upper: LandformXZ[] = [];
    for (const p of endDiscs) { while (lower.length > 1 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (let i = endDiscs.length - 1; i >= 0; i--) { const p = endDiscs[i]; while (upper.length > 1 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    // Convex hull of these two end discs is exactly the sampled single-segment
    // Minkowski capsule. Each disc's support vertex must occur at BOTH ends of
    // a straight side; selecting vertices by their own dot sign omits one and
    // introduces a microscopic skewed strip. No hull is taken across turns.
    const polygon: LandformXZ[] = [...lower.slice(0, -1), ...upper.slice(0, -1)].map(([x, z]) => [(x - a[0]) * ux + (z - a[2]) * uz, -(x - a[0]) * uz + (z - a[2]) * ux]);
    const world = (poly: LandformXZ[]) => poly.map(([u, v]) => [a[0] + ux * u - uz * v, a[2] + uz * u + ux * v] as LandformXZ);
    const depth = (x: number, z: number) => (x - a[0]) * ux + (z - a[2]) * uz;
    const plane = (x: number, z: number) => a[1] + slope * depth(x, z) - Math.abs(slope) * radius - effectiveSupportClearance - verticalPadding;
    const endFloor = Math.min(a[1], b[1]) - effectiveSupportClearance - verticalPadding;
    maximumConservativeExtraLowering = Math.max(maximumConservativeExtraLowering, Math.abs(slope) * radius);
    if (Math.abs(slope) < 1e-12) enqueueConstant(world(polygon), endFloor, `${segment}:level`);
    else {
      const splitU = slope < 0 ? length - radius : radius;
      affineCuts.push({ polygon: world(clipPlanar(polygon, splitU, slope > 0)), ceiling: plane, label: `${segment}:affine-under-envelope` });
      enqueueConstant(world(clipPlanar(polygon, splitU, slope < 0)), endFloor, `${segment}:finite-end-floor`);
    }
  }
  // Same-floor overlapping discs are one subtraction, capped only after all
  // their original faces have been clipped. Recutting a freshly triangulated
  // coplanar cap needlessly produces thin planar slivers at a shared turn.
  for (const group of constantCuts.values()) for (let i = 0; i < group.length; i++) {
    const cut = group[i]; subtract(cut.polygon, cut.ceiling, cut.label, i < group.length - 1, i === group.length - 1);
  }
  for (const cut of affineCuts) subtract(cut.polygon, cut.ceiling, cut.label);
  // BufferGeometry will store Float32 positions. Canonicalise this opt-in
  // patch at that actual resolution before emitting it, rather than keeping
  // sub-ULP faces which look closed in Float64 but collapse in the renderer.
  const weldGrid = .00001, collapseLimit = .000025;
  const active = [...new Set(indices)].sort((a, b) => a - b), canonical = new Map<string, number>(), nearby = new Map<string, number[]>(), parent = new Map<number, number>();
  const f32 = new Map<number, Point>(), cluster = new Map<number, { min: Point; max: Point }>();
  let maximumQuantizedDisplacement = 0, weldedVertices = 0, collapsedTriangles = 0, coincidentTriangles = 0, shortEdgeCollapses = 0;
  const actual = (id: number) => f32.get(id)!;
  for (const id of active) {
    const p = points[id].map(Math.fround) as Point, key = p.map(v => Math.round(v / weldGrid)).join(':'); f32.set(id, p);
    let previous = canonical.get(key);
    if (previous !== undefined) { const box = cluster.get(previous)!; if (Math.hypot(...p.map((v, k) => Math.max(v, box.max[k]) - Math.min(v, box.min[k]))) > collapseLimit) previous = undefined; }
    const cell = p.map(v => Math.floor(v / weldGrid));
    if (previous === undefined) for (let x = cell[0] - 1; x <= cell[0] + 1 && previous === undefined; x++) for (let y = cell[1] - 1; y <= cell[1] + 1 && previous === undefined; y++) for (let z = cell[2] - 1; z <= cell[2] + 1 && previous === undefined; z++) for (const candidate of nearby.get(`${x}:${y}:${z}`) ?? []) {
      const q = actual(candidate), box = cluster.get(candidate)!;
      if (Math.hypot(...p.map((v, k) => v - q[k])) <= weldGrid && Math.hypot(...p.map((v, k) => Math.max(v, box.max[k]) - Math.min(v, box.min[k]))) <= collapseLimit) { previous = candidate; break; }
    }
    if (previous !== undefined) {
      parent.set(id, previous); weldedVertices++; maximumQuantizedDisplacement = Math.max(maximumQuantizedDisplacement, Math.hypot(...p.map((v, k) => v - actual(previous)[k])));
      const box = cluster.get(previous)!; for (let k = 0; k < 3; k++) { box.min[k] = Math.min(box.min[k], p[k]); box.max[k] = Math.max(box.max[k], p[k]); }
    }
    else { canonical.set(key, id); parent.set(id, id); cluster.set(id, { min: [...p], max: [...p] }); const bucketKey = cell.join(':'), bucket = nearby.get(bucketKey); if (bucket) bucket.push(id); else nearby.set(bucketKey, [id]); }
  }
  const root = (id: number): number => { let cursor = id; while (parent.get(cursor)! !== cursor) cursor = parent.get(cursor)!; while (id !== cursor) { const next = parent.get(id)!; parent.set(id, cursor); id = next; } return cursor; };
  const crossSquared = (a: number, b: number, c: number) => {
    const p = actual(a), q = actual(b), r = actual(c), ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    return (uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2;
  };
  function remap() {
    const result: number[] = [], faces = new Map<string, { face: number[]; orientation: number; cancelled: boolean }>();
    for (let i = 0; i < indices.length; i += 3) {
      const face = [root(indices[i]), root(indices[i + 1]), root(indices[i + 2])];
      if (new Set(face).size < 3) { collapsedTriangles++; continue; }
      const ordered = [...face].sort((a, b) => a - b), key = ordered.join(':'), first = face.indexOf(ordered[0]);
      const orientation = face[(first + 1) % 3] === ordered[1] ? 1 : -1, previous = faces.get(key);
      if (previous) { coincidentTriangles++; if (previous.orientation !== orientation) previous.cancelled = true; continue; }
      faces.set(key, { face, orientation, cancelled: false });
    }
    for (const face of faces.values()) if (!face.cancelled) result.push(...face.face);
    indices = result;
  }
  remap();
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let i = 0; i < indices.length; i += 3) {
      const ids = [root(indices[i]), root(indices[i + 1]), root(indices[i + 2])];
      if (new Set(ids).size < 3 || crossSquared(ids[0], ids[1], ids[2]) >= 1e-18) continue;
      const edges = [[ids[0], ids[1]], [ids[1], ids[2]], [ids[2], ids[0]]].map(([a, b]) => ({ a, b, length: Math.hypot(...actual(a).map((v, k) => v - actual(b)[k])) })).sort((a, b) => a.length - b.length);
      const edge = edges[0], a = cluster.get(edge.a)!, b = cluster.get(edge.b)!;
      const min = a.min.map((v, k) => Math.min(v, b.min[k])) as Point, max = a.max.map((v, k) => Math.max(v, b.max[k])) as Point;
      if (Math.hypot(...max.map((v, k) => v - min[k])) > collapseLimit) continue;
      const keep = Math.min(edge.a, edge.b), remove = Math.max(edge.a, edge.b);
      parent.set(remove, keep); cluster.set(keep, { min, max }); cluster.delete(remove); shortEdgeCollapses++; changed = true;
      maximumQuantizedDisplacement = Math.max(maximumQuantizedDisplacement, Math.hypot(...max.map((v, k) => v - min[k])));
    }
    remap(); if (!changed) break;
  }
  let quantizedFlatFaces = 0, repairedTJunctions = 0, maximumEdgeRepairDistance = 0, cancelledDoubleSheets = 0;
  // A micro-width cut can quantize two opposing curtain quads onto the same
  // four corners. Their diagonals differ, so triangle-key cancellation alone
  // cannot remove the closed, zero-thickness double sheet. Cancel only a full
  // oriented four-face shell whose fourth point is within ten nanometres of
  // the largest face's plane. Its six directed edge pairs cancel exactly.
  for (let pass = 0; pass < 32; pass++) {
    const faces = new Map<string, number>(), incident = new Map<string, number[]>();
    for (let i = 0; i < indices.length; i += 3) {
      const f = indices.slice(i, i + 3); faces.set([...f].sort((a, b) => a - b).join(':'), i);
      for (let k = 0; k < 3; k++) { const a = f[k], b = f[(k + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`, list = incident.get(key); if (list) list.push(i); else incident.set(key, [i]); }
    }
    let cancellation: number[] | undefined;
    outer: for (const [edge, list] of incident) {
      if (list.length <= 2) continue;
      const [a, b] = edge.split(':').map(Number);
      for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
        const c = indices.slice(list[x], list[x] + 3).find(id => id !== a && id !== b)!, d = indices.slice(list[y], list[y] + 3).find(id => id !== a && id !== b)!;
        if (c === d) continue;
        const acd = faces.get([a, c, d].sort((a, b) => a - b).join(':')), bcd = faces.get([b, c, d].sort((a, b) => a - b).join(':'));
        if (acd === undefined || bcd === undefined) continue;
        const shell = [list[x], list[y], acd, bcd], oriented = new Map<string, number>();
        for (const i of shell) for (let k = 0; k < 3; k++) { const p = indices[i + k], q = indices[i + (k + 1) % 3], key = p < q ? `${p}:${q}` : `${q}:${p}`; oriented.set(key, (oriented.get(key) ?? 0) + (p < q ? 1 : -1)); }
        if (oriented.size !== 6 || [...oriented.values()].some(n => n !== 0)) continue;
        const p = actual(a), u = actual(b).map((v, k) => v - p[k]), v = actual(c).map((value, k) => value - p[k]), w = actual(d).map((value, k) => value - p[k]);
        const volume6 = Math.abs((u[1] * v[2] - u[2] * v[1]) * w[0] + (u[2] * v[0] - u[0] * v[2]) * w[1] + (u[0] * v[1] - u[1] * v[0]) * w[2]);
        const largestArea = Math.sqrt(Math.max(...shell.map(i => crossSquared(indices[i], indices[i + 1], indices[i + 2]))));
        if (largestArea > 0 && volume6 / largestArea <= 1e-8) { cancellation = shell; break outer; }
      }
    }
    if (!cancellation) break;
    const remove = new Set(cancellation); indices = indices.filter((_, i) => !remove.has(i - i % 3)); cancelledDoubleSheets++;
  }
  const visible: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    if (crossSquared(indices[i], indices[i + 1], indices[i + 2]) < 1e-18) { quantizedFlatFaces++; continue; }
    visible.push(indices[i], indices[i + 1], indices[i + 2]);
  }
  indices = visible;
  // When a zero-width face collapses, its opposite edge can span two shorter
  // neighbour edges. Split that one existing face at their shared vertex: no
  // fan centre, no new position, and no unfilled deletion of a flat face.
  function repairSharedEdges() { for (let pass = 0; pass < 1024; pass++) {
    const edges = new Map<string, { a: number; b: number; face: number; count: number }>(), neighbours = new Map<number, Set<number>>();
    const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
    for (let i = 0; i < indices.length; i += 3) for (let k = 0; k < 3; k++) {
      const a = indices[i + k], b = indices[i + (k + 1) % 3], id = key(a, b), old = edges.get(id);
      if (old) old.count++; else edges.set(id, { a, b, face: i, count: 1 });
    }
    for (const edge of edges.values()) if (edge.count === 1) {
      if (!neighbours.has(edge.a)) neighbours.set(edge.a, new Set()); if (!neighbours.has(edge.b)) neighbours.set(edge.b, new Set());
      neighbours.get(edge.a)!.add(edge.b); neighbours.get(edge.b)!.add(edge.a);
    }
    let repaired = false;
    for (const edge of edges.values()) {
      if (edge.count !== 1) continue;
      const a = actual(edge.a), b = actual(edge.b), d = b.map((v, k) => v - a[k]), length2 = d.reduce((n, v) => n + v * v, 0);
      const third = indices.slice(edge.face, edge.face + 3).find(id => id !== edge.a && id !== edge.b)!;
      for (const middle of neighbours.get(edge.a) ?? []) {
        if (middle === third || middle === edge.b || !neighbours.get(edge.b)?.has(middle)) continue;
        const p = actual(middle), t = p.reduce((n, v, k) => n + (v - a[k]) * d[k], 0) / length2;
        if (t <= 0 || t >= 1) continue;
        const distance = Math.hypot(...p.map((v, k) => v - a[k] - d[k] * t));
        if (distance > collapseLimit || crossSquared(edge.a, middle, third) < 1e-18 || crossSquared(middle, edge.b, third) < 1e-18) continue;
        indices.splice(edge.face, 3, edge.a, middle, third, middle, edge.b, third);
        repairedTJunctions++; maximumEdgeRepairDistance = Math.max(maximumEdgeRepairDistance, distance); repaired = true; break;
      }
      if (repaired) break;
    }
    if (!repaired) break;
  } }
  repairSharedEdges();
  remap();
  let boundaryVertexWelds = 0;
  // Resolve only quantized shared-boundary vertices. The displacement of
  // EVERY member of the merged cluster must remain within 25 micrometres of
  // the retained position; the oldest source vertex remains the representative.
  // Accept a merge only if its actual non-degenerate triangles reduce open
  // incidences without introducing a non-manifold edge.
  const incidence = (source: number[], keep = -1, remove = -1) => {
    const faces: number[] = [], edges = new Map<string, number>();
    for (let i = 0; i < source.length; i += 3) {
      const face = source.slice(i, i + 3).map(id => id === remove ? keep : id);
      if (new Set(face).size < 3 || crossSquared(face[0], face[1], face[2]) < 1e-18) continue;
      faces.push(...face);
      for (let k = 0; k < 3; k++) { const a = face[k], b = face[(k + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`; edges.set(key, (edges.get(key) ?? 0) + 1); }
    }
    return { faces, edges, open: [...edges.values()].filter(n => n === 1).length, nonManifold: [...edges.values()].filter(n => n > 2).length };
  };
  for (let pass = 0; pass < 32; pass++) {
    const before = incidence(indices), boundary = [...new Set([...before.edges].filter(([, n]) => n === 1).flatMap(([key]) => key.split(':').map(Number)))];
    const pairs: { keep: number; remove: number; distance: number }[] = [];
    for (let a = 0; a < boundary.length; a++) for (let b = a + 1; b < boundary.length; b++) { const keep = Math.min(boundary[a], boundary[b]), remove = Math.max(boundary[a], boundary[b]), distance = Math.hypot(...actual(keep).map((v, k) => v - actual(remove)[k])); if (distance <= collapseLimit) pairs.push({ keep, remove, distance }); }
    pairs.sort((a, b) => a.distance - b.distance);
    let changed = false;
    for (const pair of pairs) {
      if (active.some(id => (root(id) === pair.keep || root(id) === pair.remove) && Math.hypot(...actual(id).map((v, k) => v - actual(pair.keep)[k])) > collapseLimit)) continue;
      const after = incidence(indices, pair.keep, pair.remove);
      if (after.nonManifold > before.nonManifold || after.open >= before.open) continue;
      const a = cluster.get(pair.keep)!, b = cluster.get(pair.remove)!;
      parent.set(pair.remove, pair.keep); cluster.set(pair.keep, { min: a.min.map((v, k) => Math.min(v, b.min[k])) as Point, max: a.max.map((v, k) => Math.max(v, b.max[k])) as Point }); cluster.delete(pair.remove);
      indices = after.faces; remap(); boundaryVertexWelds++; changed = true; break;
    }
    if (!changed) break;
  }
  if (boundaryVertexWelds) { repairSharedEdges(); remap(); }
  const quantizedEdges = new Map<string, number>(), quantizedDirections = new Map<string, number>(); let degenerates = 0;
  for (let i = 0; i < indices.length; i += 3) {
    if (crossSquared(indices[i], indices[i + 1], indices[i + 2]) < 1e-18) degenerates++;
    for (let k = 0; k < 3; k++) { const a = indices[i + k], b = indices[i + (k + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`; quantizedEdges.set(key, (quantizedEdges.get(key) ?? 0) + 1); quantizedDirections.set(key, (quantizedDirections.get(key) ?? 0) + (a < b ? 1 : -1)); }
  }
  const finalBad = [...quantizedEdges.values()].filter(count => count !== 2);
  const inconsistentWindingEdges = [...quantizedDirections.values()].filter(n => n !== 0).length;
  if (degenerates || finalBad.length || inconsistentWindingEdges) {
    const error = new Error(`Spring Float32 topology unresolved: ${JSON.stringify({ degenerates, open: finalBad.filter(n => n === 1).length, nonManifold: finalBad.filter(n => n > 2).length, inconsistentWindingEdges })}`);
    throw error;
  }
  const finalActive = new Set(indices), finalPositions = new Set([...finalActive].map(id => actual(id).join(':')));
  let maximumFloat32QuantizationError = 0, maximumUpwardDisplacement = 0, maximumClusterBoundsDiagonal = 0;
  maximumQuantizedDisplacement = 0;
  for (const id of active) {
    const retained = root(id); if (!finalActive.has(retained)) continue;
    const p = actual(id), q = actual(retained);
    maximumQuantizedDisplacement = Math.max(maximumQuantizedDisplacement, Math.hypot(...p.map((v, k) => v - q[k])));
    maximumFloat32QuantizationError = Math.max(maximumFloat32QuantizationError, Math.hypot(...points[id].map((v, k) => v - p[k])));
    maximumUpwardDisplacement = Math.max(maximumUpwardDisplacement, q[1] - points[id][1]);
  }
  for (const box of cluster.values()) maximumClusterBoundsDiagonal = Math.max(maximumClusterBoundsDiagonal, Math.hypot(...box.max.map((v, k) => v - box.min[k])));
  if (maximumQuantizedDisplacement > collapseLimit + 1e-12 || maximumUpwardDisplacement >= verticalPadding) throw new Error('Spring Float32 repair exceeds its bounded support safety padding');
  const routeDistance = (p: Point) => {
    let minimum = Infinity;
    for (let i = 0; i < branch.points.length - 1; i++) { const a = branch.points[i], b = branch.points[i + 1], dx = b[0] - a[0], dz = b[2] - a[2], t = clamp(((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / (dx * dx + dz * dz)); minimum = Math.min(minimum, Math.hypot(p[0] - a[0] - t * dx, p[2] - a[2] - t * dz)); }
    return minimum;
  };
  let missingOriginalPositions = 0, maximumMissingOriginalDistance = 0, movedOriginalVertices = 0, maximumOriginalDisplacement = 0, maximumMovedOriginalDistance = 0;
  const movedOriginalBounds = new THREE.Box3(), missingOriginalBounds = new THREE.Box3();
  for (const id of sourceActive) {
    const p = points[id].map(Math.fround) as Point;
    if (!finalPositions.has(p.join(':'))) { missingOriginalPositions++; maximumMissingOriginalDistance = Math.max(maximumMissingOriginalDistance, routeDistance(p)); missingOriginalBounds.expandByPoint(new THREE.Vector3(...p)); }
    if (!parent.has(id) || !finalActive.has(root(id))) continue;
    const q = actual(root(id)), distance = Math.hypot(...p.map((v, k) => v - q[k]));
    if (distance) { movedOriginalVertices++; maximumOriginalDisplacement = Math.max(maximumOriginalDisplacement, distance); maximumMovedOriginalDistance = Math.max(maximumMovedOriginalDistance, routeDistance(p)); movedOriginalBounds.expandByPoint(new THREE.Vector3(...p)); }
  }
  const maximumDomainSafetyExcess = outerRadius - radius + maximumQuantizedDisplacement + maximumFloat32QuantizationError + maximumEdgeRepairDistance;
  if (maximumMissingOriginalDistance > radius + maximumDomainSafetyExcess + 1e-7 || maximumMovedOriginalDistance > radius + maximumDomainSafetyExcess + 1e-7) throw new Error('Spring Float32 repair changed an original vertex outside its finite capsule safety band');
  const boxData = (box: THREE.Box3) => box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() };
  const originalVertexScope = { sourceActiveVertices: sourceActive.length, missingOriginalPositions, missingOriginalBounds: boxData(missingOriginalBounds), maximumMissingOriginalDistanceToFiniteRouteM: maximumMissingOriginalDistance, movedOriginalVertices, movedOriginalBounds: boxData(movedOriginalBounds), maximumOriginalVertexDisplacementM: maximumOriginalDisplacement, maximumMovedOriginalDistanceToFiniteRouteM: maximumMovedOriginalDistance };
  const float32Topology = { weldGridM: weldGrid, initialClusterBoundsLimitM: collapseLimit, maximumDisplacementLimitM: collapseLimit, maximumClusterBoundsDiagonalM: maximumClusterBoundsDiagonal, maximumDisplacementM: maximumQuantizedDisplacement, maximumFloat32QuantizationErrorM: maximumFloat32QuantizationError, maximumUpwardDisplacementM: maximumUpwardDisplacement, weldedVertices, boundaryVertexWelds, collapsedTriangles, coincidentTriangles, cancelledDoubleSheets, shortEdgeCollapses, quantizedFlatFaces, repairedTJunctions, maximumEdgeRepairDistanceM: maximumEdgeRepairDistance, degenerateTriangles: degenerates, openEdges: 0, nonManifoldEdges: 0, inconsistentWindingEdges };
  return { indices, metadata: {
    revision: 'spring-branch-local-cut-1', points: branch.points.map(p => [...p]), bodyRadiusM: branch.bodyRadius, centerHalfWidthM: centerHalfWidth, effectiveRadiusM: radius,
    supportClearanceM: branch.supportClearance, additionalSupportClearanceM: additionalSupportClearance, effectiveSupportClearanceM: effectiveSupportClearance, endpointSemantics: 'finite segments with circular end caps; adjacent segment cuts combine by lower support envelope',
    sweptDiscEnvelope: 'within each finite capsule, affine floor minus abs(slope)*effectiveRadius; clamp below by minimum endpoint floor; conservative for every reachable centre disc',
    maximumConservativeExtraLoweringM: maximumConservativeExtraLowering, circleSegments, quantizationSafetyPaddingM: quantizationPadding, verticalSafetyPaddingM: verticalPadding, maximumNewVertexSnapM: vertexSnap,
    maximumRadialTessellationExcessM: outerRadius - cutterRadius, maximumDomainSafetyExcessM: maximumDomainSafetyExcess, originalVertexScope, float32Topology,
    affectedOriginalSurfaceBounds: affected.isEmpty() ? null : { min: affected.min.toArray(), max: affected.max.toArray() },
    originalFacePiecesRemoved: removedPieces, sideTrianglesBeforeConformance: wallTriangles, floorTrianglesBeforeConformance: capTriangles, operations,
    inputTriangles: input.length / 3, finalTriangles: indices.length / 3, constructionMs: performance.now() - constructionStarted,
    scope: centerHalfWidth ? 'parameterized allowed-centre band plus body discs; final route/render acceptance is separate' : 'centreline plus body discs only; no claim for a wider allowed player-centre band',
    ownership: 'same one owned final geometry; no extra material or borrowed map ownership',
  } };
}

/** Conforming visible-front refinement of the final engineering surface.
 * Shared midpoint edges split both incident faces. Child-to-original parent
 * indices remain local trace data for a read-only checker, not product metadata. */
function refineVisibleSanctuaryFront(points: Point[], input: readonly number[], origin: LandformXZ, branch: SanctuaryLandformOptions['springBranch'],
  sourceRows: readonly number[], segments: number, bottomStart: number, sourcePointCount: number, signal?: AbortSignal) {
  const started = performance.now(), targetEdgeM = .65, triangleBudget = 2000;
  const originalTriangles = input.length / 3, originalPointCount = points.length;
  const sourceContactVertices = new Set<number>([0]);
  for (let row = 0; row < sourceRows.length; row++) if (sourceRows[row] <= .4 || sourceRows[row] >= .81) {
    for (let angle = 0; angle < segments; angle++) sourceContactVertices.add(1 + row * segments + angle);
  }
  for (let id = bottomStart; id < sourcePointCount; id++) sourceContactVertices.add(id);
  const branchRadius = branch ? branch.bodyRadius + (branch.centerHalfWidth ?? 0) + .0002 : 0;
  const routeBoxes = branch?.points.slice(1).map((b, i) => {
    const a = branch.points[i];
    return { minX: Math.min(a[0], b[0]) - branchRadius, maxX: Math.max(a[0], b[0]) + branchRadius,
      minZ: Math.min(a[2], b[2]) - branchRadius, maxZ: Math.max(a[2], b[2]) + branchRadius };
  }) ?? [];
  const rear = branch?.points.at(-1);
  if (rear) routeBoxes.push({ minX: rear[0] - 1.6, maxX: rear[0] + 1.6, minZ: rear[2] - 1.6, maxZ: rear[2] + 1.6 });
  const protectedParents = new Set<number>(), safetyVertices = new Set<number>();
  const reasons = { sourceTopAndFoot: 0, springAndRearBounds: 0, nonRadialSource: 0 };
  const sourceRadial = (tri: Point[]) => {
    const [a, b, c] = tri, u = b.map((v, k) => v - a[k]), v = c.map((value, k) => value - a[k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], length = Math.hypot(...n);
    if (length * length < 1e-18) return false;
    return tri.every(p => {
      const x = p[0] - origin[0], z = p[2] - origin[1], r = Math.hypot(x, z);
      return r > .01 && (n[0] * x + n[2] * z) / (length * r) > 1e-6;
    });
  };
  for (let face = 0; face < originalTriangles; face++) {
    const ids = input.slice(face * 3, face * 3 + 3), tri = ids.map(id => points[id].map(Math.fround) as Point);
    const minX = Math.min(...tri.map(p => p[0])), maxX = Math.max(...tri.map(p => p[0])), minZ = Math.min(...tri.map(p => p[2])), maxZ = Math.max(...tri.map(p => p[2]));
    let protect = false;
    if (ids.some(id => sourceContactVertices.has(id))) { reasons.sourceTopAndFoot++; protect = true; }
    // Conservative boxes are intentional here: this construction pass does
    // not need to use any part of the remote branch/rear surface.
    if (routeBoxes.some(b => minX <= b.maxX && maxX >= b.minX && minZ <= b.maxZ && maxZ >= b.minZ)) { reasons.springAndRearBounds++; protect = true; }
    if (!sourceRadial(tri)) { reasons.nonRadialSource++; protect = true; }
    if (protect) { protectedParents.add(face); for (const id of ids) safetyVertices.add(id); }
  }
  for (let face = 0; face < originalTriangles; face++) {
    const ids = input.slice(face * 3, face * 3 + 3);
    if (ids.some(id => safetyVertices.has(id))) protectedParents.add(face);
  }
  const withinWindow = (p: Point) => p[0] >= 4 && p[0] <= 15 && p[1] >= 14.6 && p[1] <= 20.5 && p[2] >= -26.5 && p[2] <= -18.5;
  const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  let indices = [...input], parents = Array.from({ length: originalTriangles }, (_, i) => i), rounds = 0, splitEdges = 0, maximumMidpointQuantizationM = 0;
  for (let round = 0; round < 8; round++) {
    abort(signal);
    const capacity = Math.floor((triangleBudget - (indices.length / 3 - originalTriangles)) / 2);
    if (capacity <= 0) break;
    const edges = new Map<string, { a: number; b: number; faces: number[] }>();
    for (let face = 0; face < parents.length; face++) for (let edge = 0; edge < 3; edge++) {
      const a = indices[face * 3 + edge], b = indices[face * 3 + (edge + 1) % 3], key = edgeKey(a, b), old = edges.get(key);
      if (old) old.faces.push(face); else edges.set(key, { a, b, faces: [face] });
    }
    const candidates: { key: string; a: number; b: number; midpoint: Point; length: number }[] = [];
    for (const [key, edge] of edges) {
      if (edge.faces.length !== 2 || edge.faces.some(face => protectedParents.has(parents[face]))) continue;
      const a = points[edge.a].map(Math.fround), b = points[edge.b].map(Math.fround), midpoint = a.map((v, k) => (v + b[k]) / 2) as Point;
      const length = Math.hypot(...a.map((v, k) => v - b[k]));
      if (length > targetEdgeM && withinWindow(midpoint)) candidates.push({ key, a: edge.a, b: edge.b, midpoint, length });
    }
    candidates.sort((a, b) => b.length - a.length || a.a - b.a || a.b - b.b);
    const marked = new Map<string, number>();
    for (const edge of candidates.slice(0, capacity)) {
      maximumMidpointQuantizationM = Math.max(maximumMidpointQuantizationM, Math.hypot(...edge.midpoint.map(v => v - Math.fround(v))));
      marked.set(edge.key, points.push(edge.midpoint) - 1);
    }
    if (!marked.size) break;
    splitEdges += marked.size; rounds++;
    const next: number[] = [], nextParents: number[] = [];
    for (let face = 0; face < parents.length; face++) {
      const ids = indices.slice(face * 3, face * 3 + 3), mid = ids.map((a, k) => marked.get(edgeKey(a, ids[(k + 1) % 3]))), count = mid.filter(id => id !== undefined).length;
      const push = (...triangle: number[]) => { next.push(...triangle); nextParents.push(parents[face]); };
      if (!count) { push(...ids); continue; }
      if (count === 1) {
        const e = mid.findIndex(id => id !== undefined), a = ids[e], b = ids[(e + 1) % 3], c = ids[(e + 2) % 3], m = mid[e]!;
        push(a, m, c); push(m, b, c);
      } else if (count === 2) {
        const e = mid.findIndex(id => id === undefined), a = ids[e], b = ids[(e + 1) % 3], c = ids[(e + 2) % 3], m = mid[(e + 1) % 3]!, n = mid[(e + 2) % 3]!;
        push(c, n, m);
        const am = Math.hypot(...points[a].map((v, k) => v - points[m][k])), bn = Math.hypot(...points[b].map((v, k) => v - points[n][k]));
        if (am <= bn) { push(a, b, m); push(a, m, n); } else { push(a, b, n); push(b, m, n); }
      } else {
        const [a, b, c] = ids, [ab, bc, ca] = mid as number[];
        push(a, ab, ca); push(ab, b, bc); push(ca, bc, c); push(ab, bc, ca);
      }
    }
    indices = next; parents = nextParents;
  }
  if (indices.length / 3 - originalTriangles > triangleBudget) throw new Error('Visible sanctuary refinement exceeds its triangle budget');
  return { indices, parents, protectedParents, metadata: { revision: 'visible-front-conforming-1', sourceEngineeringHelper: '6f7f5fec2b7ecfbef19fcc7604151931e97b7979b586d228122f8186d82b681d',
    originalTriangles, finalTriangles: indices.length / 3, addedTriangles: indices.length / 3 - originalTriangles, triangleBudget, targetEdgeM, rounds, splitEdges,
    addedVertices: points.length - originalPointCount, originalProtectedParents: protectedParents.size, originalProtectionReasons: reasons,
    midpointWindow: { x: [4, 15], y: [14.6, 20.5], z: [-26.5, -18.5] }, maximumMidpointFloat32QuantizationM: maximumMidpointQuantizationM,
    surfaceBoundary: 'iterated child-edge midpoint subdivision inherits original parent planes in exact arithmetic; repeated Float32 quantization is nonzero and requires parent-trace verification; hard protected original faces and their shared edges are not split',
    trace: 'child-to-original triangle parents and protected original face IDs are factory-local checker trace, omitted from product metadata', constructionMs: performance.now() - started } };
}

/** A radial art pass, applied only after the frozen route construction.
 * Contact core faces retain positions; only safety cores retain a neighbour ring.
 * This changes the broad free rock faces, never the D contact specification. */
function refineSanctuaryArt(points: Point[], indices: readonly number[], contours: readonly LandformContour[], routes: readonly Corridor[], origin: LandformXZ,
  branch: SanctuaryLandformOptions['springBranch'], sourceRows: readonly number[], segments: number, bottomStart: number, sourcePointCount: number, engineeringPointCount: number, quality: SanctuaryLandformOptions['quality']) {
  const original = points.map(p => [...p] as Point), active = new Set(indices), protectedVertices = new Set<number>();
  const safetyRingSeeds = new Set<number>();
  const inwardOnlyVertices = new Set<number>();
  const reasons = { topAndFoot: 0, contourContacts: 0, stairsAndLanding: 0, springBranch: 0, rearAccess: 0, nonRadialSourceFace: 0 };
  const sourceProtected = new Set<number>([0]);
  for (let row = 0; row < sourceRows.length; row++) if (sourceRows[row] <= .4 || sourceRows[row] >= .81) {
    for (let angle = 0; angle < segments; angle++) sourceProtected.add(1 + row * segments + angle);
  }
  for (let id = bottomStart; id < sourcePointCount; id++) sourceProtected.add(id);
  const segmentDistance = (p: Point, a: readonly number[], b: readonly number[]) => {
    const dx = b[0] - a[0], dz = b[2] - a[2], length2 = dx * dx + dz * dz;
    const t = length2 ? clamp(((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / length2) : 0;
    return Math.hypot(p[0] - a[0] - dx * t, p[2] - a[2] - dz * t);
  };
  const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
  const projectedInside = (p: Point, tri: Point[]) => {
    const signs = tri.map((a, i) => cross(a, tri[(i + 1) % 3], p));
    return signs.every(s => s >= -1e-10) || signs.every(s => s <= 1e-10);
  };
  const segmentMeetsTriangle = (a: Point, b: Point, tri: Point[], radius: number) => {
    if (Math.abs(cross(tri[0], tri[1], tri[2])) > 1e-10 && (projectedInside(a, tri) || projectedInside(b, tri))) return true;
    for (let edge = 0; edge < 3; edge++) {
      const p = tri[edge], q = tri[(edge + 1) % 3];
      if (Math.min(segmentDistance(p, a, b), segmentDistance(q, a, b), segmentDistance(a, p, q), segmentDistance(b, p, q)) <= radius) return true;
      const abp = cross(a, b, p), abq = cross(a, b, q), pqa = cross(p, q, a), pqb = cross(p, q, b);
      if (abp * abq < 0 && pqa * pqb < 0) return true;
    }
    return false;
  };
  const contourPadding = .16, branchPadding = .0002, rearRadius = 1.6, bevelWidth = 1.4;
  const supportContactDepth = .45;
  const contourSegments = contours.flatMap(c => c.outlineXZ.map((p, i) => {
    const q = c.outlineXZ[(i + 1) % c.outlineXZ.length];
    return { a: [p[0], c.y, p[1]] as Point, b: [q[0], c.y, q[1]] as Point,
      min: [Math.min(p[0], q[0]) - contourPadding, c.y - contourPadding, Math.min(p[1], q[1]) - contourPadding],
      max: [Math.max(p[0], q[0]) + contourPadding, c.y + contourPadding, Math.max(p[1], q[1]) + contourPadding] };
  }));
  const pointSegment3 = (p: Point, a: Point, b: Point) => {
    const d = b.map((v, axis) => v - a[axis]), length2 = d.reduce((n, v) => n + v * v, 0);
    const t = length2 ? clamp(d.reduce((n, v, axis) => n + v * (p[axis] - a[axis]), 0) / length2) : 0;
    return Math.hypot(...p.map((v, axis) => v - a[axis] - d[axis] * t));
  };
  const segmentsDistance3 = (a: Point, b: Point, c: Point, d: Point) => {
    let distance = Math.min(pointSegment3(a, c, d), pointSegment3(b, c, d), pointSegment3(c, a, b), pointSegment3(d, a, b));
    const u = b.map((v, k) => v - a[k]), v = d.map((value, k) => value - c[k]), w = a.map((value, k) => value - c[k]);
    const dot = (p: number[], q: number[]) => p.reduce((n, value, k) => n + value * q[k], 0);
    const aa = dot(u, u), bb = dot(u, v), cc = dot(v, v), dd = dot(u, w), ee = dot(v, w), denominator = aa * cc - bb * bb;
    if (denominator > 1e-14) {
      const s = (bb * ee - cc * dd) / denominator, t = (aa * ee - bb * dd) / denominator;
      if (s >= 0 && s <= 1 && t >= 0 && t <= 1) distance = Math.min(distance, Math.hypot(...w.map((value, k) => value + u[k] * s - v[k] * t)));
    }
    return distance;
  };
  const segmentMeetsContactBand = (a: Point, b: Point, tri: Point[]) => {
    const triangle = new THREE.Triangle(...tri.map(p => new THREE.Vector3(...p)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), closest = new THREE.Vector3();
    if (triangle.closestPointToPoint(from, closest).distanceTo(from) <= contourPadding || triangle.closestPointToPoint(to, closest).distanceTo(to) <= contourPadding) return true;
    const length = from.distanceTo(to), direction = to.clone().sub(from).normalize();
    const hit = new THREE.Ray(from, direction).intersectTriangle(triangle.a, triangle.b, triangle.c, false, closest);
    if (hit && hit.distanceTo(from) <= length) return true;
    return tri.some((p, i) => segmentsDistance3(a, b, p, tri[(i + 1) % 3]) <= contourPadding);
  };
  const radius = branch ? branch.bodyRadius + (branch.centerHalfWidth ?? 0) + branchPadding : 0;
  const branchPoints = branch?.points.map(p => [...p] as Point) ?? [];
  const rear = branchPoints.at(-1);
  const mark = (ids: number[], reason: keyof typeof reasons) => { reasons[reason]++;
    for (const id of ids) {
      protectedVertices.add(id);
      if (reason === 'topAndFoot' || reason === 'springBranch' || reason === 'rearAccess' || reason === 'nonRadialSourceFace') safetyRingSeeds.add(id);
    }
  };
  for (let i = 0; i < indices.length; i += 3) {
    const ids = indices.slice(i, i + 3), tri = ids.map(id => original[id]);
    const min = [0, 1, 2].map(axis => Math.min(...tri.map(p => p[axis]))), max = [0, 1, 2].map(axis => Math.max(...tri.map(p => p[axis])));
    if (!radiallyRegular(ids, original)) mark(ids, 'nonRadialSourceFace');
    if (ids.some(id => sourceProtected.has(id))) mark(ids, 'topAndFoot');
    if (contourSegments.some(s => min.every((v, axis) => v <= s.max[axis] && max[axis] >= s.min[axis]) && segmentMeetsContactBand(s.a, s.b, tri))) mark(ids, 'contourContacts');
    if (routes.some(route => {
      const localTriangle = tri.map(p => local(p, route)), [u0, u1, v0, v1] = corridorBounds(route);
      // Preserve the actual body/foot contact region. The body does not extend
      // down to the rock bottom: deep bedrock may only retreat, never rise.
      const body = route.polygon ? landingIntersection(localTriangle, route) : rectangleIntersection(localTriangle, u0, u1, route.half);
      if (body.length) {
        if (body.some(p => p.y >= supportHeight(p, route) - supportContactDepth)) return true;
        for (const id of ids) inwardOnlyVertices.add(id);
      }
      let polygon = clip(localTriangle, 'u', u0 - bevelWidth, true);
      polygon = clip(polygon, 'u', u1 + bevelWidth, false);
      polygon = clip(polygon, 'v', v0 - bevelWidth, true);
      polygon = clip(polygon, 'v', v1 + bevelWidth, false);
      if (!polygon.length) return false;
      // Only the real near-support band of the outer bevel is a contact.
      // Split at the affine/last-tread support clamp so extrema are exact.
      const support = route.support;
      const clampU = support?.slope ? support.u0 + (support.lastCeiling - support.y0) / support.slope : NaN;
      const pieces = Number.isFinite(clampU) ? [clip(polygon, 'u', clampU, false), clip(polygon, 'u', clampU, true)] : [polygon];
      return pieces.some(piece => {
        if (!piece.length) return false;
        const relativeHeight = piece.map(p => p.y - supportHeight(p, route));
        return Math.min(...relativeHeight) <= supportContactDepth && Math.max(...relativeHeight) >= -supportContactDepth;
      });
    })) mark(ids, 'stairsAndLanding');
    if (branchPoints.some((p, j) => j > 0 && segmentMeetsTriangle(branchPoints[j - 1], p, tri, radius))) mark(ids, 'springBranch');
    if (rear && segmentMeetsTriangle(rear, rear, tri, rearRadius)) mark(ids, 'rearAccess');
  }
  const initiallyProtectedVertices = protectedVertices.size;
  // Safety cores retain one face ring. D contour and stair contact triangles
  // preserve exact positions, while their surrounding corner normals may
  // respond to the art surface; normal equality is not a geometry constraint.
  const seeds = new Set(protectedVertices);
  for (let i = 0; i < indices.length; i += 3) {
    const ids = indices.slice(i, i + 3);
    if (ids.some(id => safetyRingSeeds.has(id))) for (const id of ids) protectedVertices.add(id);
  }
  const neighbours = new Map<number, Map<number, number>>();
  for (let i = 0; i < indices.length; i += 3) for (let edge = 0; edge < 3; edge++) {
    const a = indices[i + edge], b = indices[i + (edge + 1) % 3], distance = Math.hypot(...original[a].map((v, axis) => v - original[b][axis]));
    if (!neighbours.has(a)) neighbours.set(a, new Map()); if (!neighbours.has(b)) neighbours.set(b, new Map());
    neighbours.get(a)!.set(b, distance); neighbours.get(b)!.set(a, distance);
  }
  // Multi-source shortest paths provide a physical fade at the frozen seam;
  // no independent face displacement or additional tessellation is introduced.
  const distances = new Float64Array(points.length); distances.fill(Infinity);
  const heap: [number, number][] = [];
  const push = (id: number, distance: number) => {
    let at = heap.length; heap.push([id, distance]);
    while (at) { const parent = (at - 1) >> 1; if (heap[parent][1] <= distance) break; heap[at] = heap[parent]; at = parent; } heap[at] = [id, distance];
  };
  const pop = () => {
    const first = heap[0], last = heap.pop()!;
    if (heap.length) { let at = 0; while (true) { let child = at * 2 + 1; if (child >= heap.length) break; if (child + 1 < heap.length && heap[child + 1][1] < heap[child][1]) child++; if (heap[child][1] >= last[1]) break; heap[at] = heap[child]; at = child; } heap[at] = last; }
    return first;
  };
  for (const id of protectedVertices) { distances[id] = 0; push(id, 0); }
  const seamFade = .4;
  while (heap.length) {
    const [id, distance] = pop(); if (distance !== distances[id] || distance >= seamFade) continue;
    for (const [next, length] of neighbours.get(id) ?? []) if (distance + length < distances[next]) { distances[next] = distance + length; push(next, distance + length); }
  }
  const tent = (value: number, centre: number, core: number, width: number) => clamp((width - Math.abs(value - centre)) / (width - core));
  const bounds = new THREE.Box3(), freeBounds = new THREE.Box3(), movedOriginalBounds = new THREE.Box3(), movedAddedBounds = new THREE.Box3();
  let movedVertices = 0, maximumDisplacement = 0;
  const featureVertices = { centralFace: 0, westFace: 0, obliqueGroove: 0, easternShoulder: 0, upperMainFace: 0 };
  for (const id of active) {
    if (protectedVertices.has(id)) continue;
    const p = original[id], [x, y, z] = p; freeBounds.expandByPoint(new THREE.Vector3(...p));
    // The art window gates individual free vertices, never locks a whole face
    // or propagates across a contact edge into the visible rock body.
    const window = clamp((x - 2.5) / .8) * clamp((27 - x) / .8) * clamp((z + 34) / .8) * clamp((-18 - z) / .8)
      * clamp((y - 14) / .5) * clamp((20.75 - y) / .5);
    const fade = smooth(distances[id] / seamFade) * window, dx = x - origin[0], dz = z - origin[1], r = Math.hypot(dx, dz);
    if (!r || !fade) continue;
    // The visible continuous free block was located by actual near/grove rays.
    // Intersect each original radial ray with z+s*x=C exactly; evaluating a
    // target Z at the old X would not put the moved point on the target plane.
    const ux = dx / r, uz = dz / r;
    const height = clamp((y - 15) / .3) * clamp((17.5 - y) / .3);
    const domain = clamp((x - 4.7) / .4) * clamp((12.1 - x) / .4) * height * tent(z, -22.3, 3, 3.5);
    // One upper face continues the thick body; its top fades at a staggered
    // height while the original temple/source-top contact remains frozen.
    const upperTop = 20.05 + .35 * smooth((x - 9) / 6);
    const upperHeight = clamp((y - 18.15) / .35) * clamp((upperTop - y) / .35);
    const upperDomain = clamp((x - 9) / .45) * clamp((15 - x) / .45) * upperHeight * tent(z, -25.6, 2.8, 4);
    if (!domain && !upperDomain) continue;
    const mainSlope = .18, mainConstant = -21.1 + mainSlope * 9.6;
    const westSlope = -.4, westConstant = -22.1 + westSlope * 6.3;
    const mainDenominator = uz + mainSlope * ux, westDenominator = uz + westSlope * ux;
    if (mainDenominator <= .1 || westDenominator <= .1) continue;
    const mainRadius = (mainConstant - origin[1] - mainSlope * origin[0]) / mainDenominator;
    const westRadius = (westConstant - origin[1] - westSlope * origin[0]) / westDenominator;
    const referenceX = origin[0] + ux * mainRadius;
    const grooveCentre = 8.8;
    const mainMix = smooth((referenceX - grooveCentre + .7) / 1.4);
    const central = domain * mainMix, west = domain * (1 - mainMix), eastern = 0;
    const targetRadius = mix(westRadius, mainRadius, mainMix);
    const groove = tent(referenceX, grooveCentre, .3, .9) * domain;
    // Moving to the plane also fills existing free notches. Frozen notch and
    // contact faces deliberately retain the engineering geometry.
    const legacyFaultFill = Math.max(0, targetRadius - r), fillWeight = domain;
    let radialMove = clamp((targetRadius - r) * domain - groove * .8, -2.5, 2) * fade;
    if (upperDomain) {
      // z+.2*(x-12.5)+.2*(y-19.3)=-26: the positive Y coefficient
      // gives the core a slightly upward normal, without another trench.
      const upperDenominator = uz + .2 * ux;
      if (upperDenominator <= .1) continue;
      const upperConstant = -26 + .2 * 12.5 - .2 * (y - 19.3);
      const upperRadius = (upperConstant - origin[1] - .2 * origin[0]) / upperDenominator;
      radialMove = clamp((upperRadius - r) * upperDomain, -3, .8) * fade;
    }
    if (inwardOnlyVertices.has(id)) radialMove = Math.min(0, radialMove);
    radialMove = Math.max(radialMove, .05 - r);
    const displacement = Math.abs(radialMove);
    if (displacement <= 1e-9) continue;
    points[id] = [x + dx / r * radialMove, y, z + dz / r * radialMove];
    movedVertices++; maximumDisplacement = Math.max(maximumDisplacement, displacement); bounds.expandByPoint(new THREE.Vector3(...p));
    if (central > 0) featureVertices.centralFace++; if (west > 0) featureVertices.westFace++;
    if (groove > 0) featureVertices.obliqueGroove++; if (eastern > 0) featureVertices.easternShoulder++;
    if (upperDomain > 0) featureVertices.upperMainFace++;
  }
  // A radial graph may legitimately rotate its normal through more than 90
  // degrees while a notch is filled. Preserve the actual radial parameter
  // orientation, rather than requiring agreement with the obsolete normal.
  // For a planar triangle N dot (x-origin.x,0,z-origin.z) is affine; positivity
  // at every corner proves positivity throughout that face, hence a regular
  // outward (theta,Y) projection. Non-radial source faces were frozen above.
  const proposed = points.map(p => [...p] as Point);
  function faceNormal(ids: readonly number[], positions: Point[]) {
    const [a, b, c] = ids.map(id => positions[id].map(Math.fround)), u = b.map((v, k) => v - a[k]), v = c.map((value, k) => value - a[k]);
    return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  }
  function radialCosine(ids: readonly number[], positions: Point[], normal = faceNormal(ids, positions)) {
    const length = Math.hypot(...normal);
    if (length * length < 1e-18) return -Infinity;
    let minimum = Infinity;
    for (const id of ids) {
      const x = Math.fround(positions[id][0]) - origin[0], z = Math.fround(positions[id][2]) - origin[1], radius = Math.hypot(x, z);
      if (radius <= .01) return -Infinity;
      minimum = Math.min(minimum, (normal[0] * x + normal[2] * z) / (length * radius));
    }
    return minimum;
  }
  function radiallyRegular(ids: readonly number[], positions: Point[], normal = faceNormal(ids, positions)) {
    return radialCosine(ids, positions, normal) > 1e-6;
  }
  const changedFaces: number[][] = [], originalNormals: number[][] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const ids = indices.slice(i, i + 3);
    if (ids.some(id => proposed[id].some((v, k) => v !== original[id][k]))) { changedFaces.push(ids); originalNormals.push(faceNormal(ids, original)); }
  }
  const localScales = new Float64Array(points.length); localScales.fill(1);
  let orientationGuardRounds = 0;
  const lowNyGuardFaces = new Set<number>();
  for (let attempt = 0; attempt < 64; attempt++) {
    const constrained = new Set<number>();
    changedFaces.forEach((ids, i) => {
      const normal = faceNormal(ids, points);
      // Low-quality coarse rows can produce a newly downward transition even
      // when the radial projection stays regular. Keep the C9/C10 target fields,
      // and only soften their transition until its source-relative Y normal is
      // no worse than the original downward allowance. High is unchanged.
      const sourceNy = originalNormals[i][1] / Math.hypot(...originalNormals[i]);
      const nyValid = quality !== 'low' || normal[1] / Math.hypot(...normal) >= Math.min(0, sourceNy) - 1e-6;
      if (!nyValid) lowNyGuardFaces.add(i);
      const valid = radiallyRegular(ids, points, normal) && nyValid;
      if (!valid) for (const id of ids) if (!protectedVertices.has(id) && proposed[id].some((v, k) => v !== original[id][k])) constrained.add(id);
    });
    if (!constrained.size) break;
    orientationGuardRounds++;
    const queue = [...constrained];
    for (const id of queue) localScales[id] *= .75;
    // A 75cm surface transition prevents a single constrained fine triangle
    // from introducing a new sharp end into an otherwise broad plane.
    for (let at = 0; at < queue.length; at++) {
      const id = queue[at];
      for (const [next, length] of neighbours.get(id) ?? []) {
        if (protectedVertices.has(next)) continue;
        const limit = localScales[id] + length / .75;
        if (limit < localScales[next] - 1e-10) { localScales[next] = limit; queue.push(next); }
      }
    }
    for (const id of active) if (!protectedVertices.has(id)) points[id] = original[id].map((v, k) => mix(v, proposed[id][k], localScales[id])) as Point;
    if (attempt === 63) throw new Error('Sanctuary art deformation cannot preserve an outward regular radial surface');
  }
  maximumDisplacement = 0;
  movedVertices = 0; bounds.makeEmpty();
  let movedOriginalVertices = 0, movedAddedVertices = 0;
  let limitedVertices = 0, minimumLocalScale = 1, maximumVerticalDisplacement = 0;
  let maximumAngularChange = 0, minimumChangedRadius = Infinity;
  for (const id of active) if (!protectedVertices.has(id)) {
    if (points[id].some((v, k) => Math.fround(v) !== Math.fround(original[id][k]))) {
      movedVertices++; bounds.expandByPoint(new THREE.Vector3(...original[id]));
      if (id < engineeringPointCount) { movedOriginalVertices++; movedOriginalBounds.expandByPoint(new THREE.Vector3(...original[id])); }
      else { movedAddedVertices++; movedAddedBounds.expandByPoint(new THREE.Vector3(...original[id])); }
    }
    maximumDisplacement = Math.max(maximumDisplacement, Math.hypot(...points[id].map((v, k) => v - original[id][k])));
    maximumVerticalDisplacement = Math.max(maximumVerticalDisplacement, Math.abs(points[id][1] - original[id][1]));
    const beforeAngle = Math.atan2(Math.fround(original[id][2]) - origin[1], Math.fround(original[id][0]) - origin[0]);
    const afterAngle = Math.atan2(Math.fround(points[id][2]) - origin[1], Math.fround(points[id][0]) - origin[0]);
    maximumAngularChange = Math.max(maximumAngularChange, angleDistance(beforeAngle, afterAngle));
    minimumChangedRadius = Math.min(minimumChangedRadius, Math.hypot(Math.fround(points[id][0]) - origin[0], Math.fround(points[id][2]) - origin[1]));
    if (localScales[id] < 1) { limitedVertices++; minimumLocalScale = Math.min(minimumLocalScale, localScales[id]); }
  }
  let normalReorientationFaces = 0, minimumChangedRadialCosine = Infinity;
  changedFaces.forEach((ids, i) => {
    const normal = faceNormal(ids, points);
    if (normal.reduce((n, v, k) => n + v * originalNormals[i][k], 0) <= 0) normalReorientationFaces++;
    minimumChangedRadialCosine = Math.min(minimumChangedRadialCosine, radialCosine(ids, points, normal));
  });
  const boxData = (box: THREE.Box3) => box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() };
  return { revision: 'sanctuary-front-broad-faces-11', scope: 'parent-traced lower theta-controlled double face and one upper main face; original frozen contact fissures remain',
    sourceEngineeringHelper: '6f7f5fec2b7ecfbef19fcc7604151931e97b7979b586d228122f8186d82b681d',
    placementAndTopology: 'unchanged D inputs, materials and texture ownership; bounded shared-edge refinement precedes art; all per-point Y and protected pre-art positions unchanged',
    activeVertices: active.size, initiallyProtectedVertices, protectedVerticesWithSafetyRing: protectedVertices.size, eligibleVertices: active.size - protectedVertices.size,
    contactNormalBoundary: 'D contour/stair core triangle positions remain exact; their normals may change. Extra safety rings apply only to top/outer foot, spring/rear and original non-radial cores.',
    deepStairBedrockInwardOnlyVertices: inwardOnlyVertices.size,
    protectedFaceCounts: reasons, movedVertices, movedOriginalVertices, movedAddedVertices, movedBounds: boxData(bounds),
    movedOriginalBounds: boxData(movedOriginalBounds), movedAddedBounds: boxData(movedAddedBounds), eligiblePreArtBounds: boxData(freeBounds), maximumDisplacementM: maximumDisplacement,
    featureVertices, orientationGuardRounds, limitedVertices, minimumLocalScale, localOrientationGuardTransitionM: .75, changedFaces: changedFaces.length,
    radialSurfaceGuard: { condition: 'final Float32 area nonzero and radial outward cosine > 1e-6 at all three corners; original non-radial faces and their neighbour ring are frozen',
      normalReorientationFaces, minimumChangedRadialCosine, maximumFloat32AngularChangeRad: maximumAngularChange, minimumChangedRadiusM: minimumChangedRadius,
      globalBoundary: 'art retains its refined shared indices and fixed protected boundaries; this local radial-parameter regularity check is not a full-scene or Boolean self-intersection certification' },
    lowQualityNyGuard: { enabled: quality === 'low', condition: 'normalized final Ny >= min(0, normalized pre-art source Ny)-1e-6 on changed art faces only; retain existing source downward allowance',
      triggeredFaces: lowNyGuardFaces.size, lowerTriggeredFaces: [...lowNyGuardFaces].filter(i => changedFaces[i].some(id => original[id][1] < 17.7)).length,
      upperTriggeredFaces: [...lowNyGuardFaces].filter(i => changedFaces[i].some(id => original[id][1] > 18.15)).length,
      transitionMethod: 'reuse the existing local radial-safety scale propagation; no protected point moves and no target-field change' },
    contourContactBandM: contourPadding, contourContactMethod: 'exact 3D segment/triangle distance band; complete core faces retain positions; adjacent normals may change',
    stairAndLandingExtraBevelProtectionM: bevelWidth, stairAndLandingSupportContactDepthM: supportContactDepth,
    stairProtection: 'body-expanded footprint frozen from supportHeight-.45m upwards; deeper bedrock may only retreat with Y fixed; exterior bevel frozen only where its full triangle piece intersects support-relative [-.45,+.45]m band',
    springEffectiveRadiusWithPaddingM: radius, springNumericalProtectionPaddingM: branchPadding,
    rearAccessProtectionRadiusM: rearRadius, physicalSeamFadeM: seamFade, maximumVerticalDisplacementM: maximumVerticalDisplacement,
    broadPlanes: { lowerFieldX: [4.7, 12.1], lowerFieldY: [15, 17.5], lowerPlaneSelection: 'referenceX=origin.x+ux*mainRadius depends only on radial theta; central/west blend and groove use this referenceX',
      mainEquation: 'z+.18*(x-9.6)=-21.1', westEquation: 'z-.4*(x-6.3)=-22.1', intersection: 'r=(C-origin.z-s*origin.x)/(uz+s*ux)',
      valleyReferenceCentreX: 8.8, mainMixTransitionWidthM: 1.4, valleyFlatCoreWidthM: .6, valleyOuterWidthM: 1.8, valleyDepthM: .8,
      lowerMaximumInwardMoveM: 2.5, lowerMaximumFreeNotchFillM: 2,
      upperFieldX: [9, 15], upperFieldY: [18.15, 20.4], upperEquation: 'z+.2*(x-12.5)+.2*(y-19.3)=-26',
      upperTopEquation: '20.05+.35*smooth((originalX-9)/6)', upperHeightFadeM: .35, upperMaximumInwardMoveM: 3, upperMaximumFreeFillM: .8,
      retainedFrozenFissures: 'original frozen contact/non-radial fissure faces remain unchanged; no additional upper groove' },
    springProofBoundary: 'springCut metadata describes the unchanged 6f construction before this art pass; only preserved protected faces inherit its geometric boundary, and this candidate needs its own targeted contact checks',
  };
}

/** Closed non-nested loft: the input outlines describe distinct outcrops at
 * different elevations, with local overhangs and interrupted oblique breaks.
 * This is intentionally not a radial height field or a scaled old cliff. */
export function createSanctuaryFrontLandform(options: SanctuaryLandformOptions): THREE.Group {
  abort(options.signal);
  const contours = [...options.contours].sort((a, b) => b.y - a.y);
  if (contours.length !== 3 || contours.some(c => !Number.isFinite(c.y) || c.outlineXZ.length < 3 || c.outlineXZ.some(p => !finite(p)))) throw new Error('Sanctuary rock needs three finite ordered XZ contours');
  if (!(contours[0].y > contours[1].y && contours[1].y > contours[2].y)) throw new Error('Sanctuary contour heights must descend');
  const origin = commonOrigin(contours), baseSegments = options.quality === 'high' ? 176 : 104, baseRows = options.quality === 'high' ? 44 : 30;
  const rowFractions = [...new Set([.4, .61, .81, ...Array.from({ length: baseRows }, (_, i) => (i + 1) / baseRows)])].sort((a, b) => a - b);
  const radialRows = rowFractions.length;
  const points: Point[] = [], indices: number[] = [];
  const topY = contours[0].y;
  const sourceAngles = contours.flatMap(c => c.outlineXZ.map(p => angular(Math.atan2(p[1] - origin[1], p[0] - origin[0]))));
  const controls = contours[0].outlineXZ.map((p, index) => ({ angle: angular(Math.atan2(p[1] - origin[1], p[0] - origin[0])), index })).sort((a, b) => a.angle - b.angle);
  const sampleControl = (a: number, channel: number) => {
    let right = controls.findIndex(p => p.angle > a);
    if (right < 0) right = 0;
    const left = (right + controls.length - 1) % controls.length;
    const start = controls[left].angle, span = angular(controls[right].angle - start), t = angular(a - start) / span;
    return mix(controlValue(controls[left].index, channel), controlValue(controls[right].index, channel), t);
  };
  // Every supplied polygon corner participates, with extra columns only to
  // resolve the same broad planes. Linear XZ interpolation keeps their facets
  // planar instead of turning polygon corners into a smoothed circular skirt.
  const macroAngles = [...new Set([0, ...sourceAngles].map(a => Math.round(a * 1e7) / 1e7))].sort((a, b) => a - b);
  for (let i = 0; i < macroAngles.length; i++) {
    const next = macroAngles[(i + 1) % macroAngles.length] + (i === macroAngles.length - 1 ? Math.PI * 2 : 0);
    if (next - macroAngles[i] > .52) { macroAngles.splice(i + 1, 0, angular((next + macroAngles[i]) / 2)); macroAngles.sort((a, b) => a - b); i--; }
  }
  const angles = [...new Set([...macroAngles, ...Array.from({ length: baseSegments }, (_, i) => i / baseSegments * Math.PI * 2)].map(a => Math.round(a * 1e7) / 1e7))].sort((a, b) => a - b);
  const segments = angles.length;
  const buttressAngles = [controls[0].angle, controls[Math.floor(controls.length * .3)].angle, controls[Math.floor(controls.length * .72)].angle];
  let maximumLocalOverhang = 0, maximumLocalFootExtension = 0, buttressColumns = 0;
  const profiles: MacroProfile[] = macroAngles.map(a => {
    const ux = Math.cos(a), uz = Math.sin(a), radii = contours.map(c => radialExtent(origin, ux, uz, c.outlineXZ));
    const middleY = contours[1].y + (sampleControl(a, 3) - .5) * 2.4;
    const lowerY = contours[2].y + (sampleControl(a, 7) - .5) * 1.6;
    const upper = radii[0], lower = radii[2] - sampleControl(a, 13) * .65;
    const rawMiddle = radii[1] - sampleControl(a, 11) * 1.15;
    const baselineMiddle = mix(upper, lower, (topY - middleY) / (topY - lowerY));
    const breakPresence = clamp((sampleControl(a, 17) - .24) / .52);
    const middle = mix(baselineMiddle, rawMiddle, breakPresence);
    const buttress = Math.max(...buttressAngles.map(b => clamp(1 - angleDistance(a, b) / .3)));
    const extension = .12 + buttress * Math.max(.55, (middle - lower) * .5);
    if (buttress > .01) buttressColumns++;
    const foot = radii[2] + extension;
    const terrain = options.terrainHeight(origin[0] + ux * foot, origin[1] + uz * foot);
    if (!Number.isFinite(terrain)) throw new Error('Sanctuary terrainHeight must return finite world metres');
    maximumLocalOverhang = Math.max(maximumLocalOverhang, middle - lower, upper - lower);
    maximumLocalFootExtension = Math.max(maximumLocalFootExtension, extension);
    return { angle: a, upper, middle, middleY, lower, lowerY, foot, footY: Math.min(terrain - .38, lowerY - .45) };
  });
  function columnPoint(profile: MacroProfile, t: number): Point {
    let radius: number, y: number;
    if (t <= .4) { const s = t / .4; radius = profile.upper * s; y = topY - .045 - .025 * s; }
    else if (t <= .61) { const s = (t - .4) / .21; radius = mix(profile.upper, profile.middle, s); y = mix(topY - .07, profile.middleY, s); }
    else if (t <= .81) { const s = (t - .61) / .2; radius = mix(profile.middle, profile.lower, s); y = mix(profile.middleY, profile.lowerY, s); }
    else { const s = (t - .81) / .19; radius = mix(profile.lower, profile.foot, s); y = mix(profile.lowerY, profile.footY, s); }
    return [origin[0] + Math.cos(profile.angle) * radius, y, origin[1] + Math.sin(profile.angle) * radius];
  }
  const faults = [
    { angle: controls.find(c => c.index === 2 % controls.length)!.angle, width: 1.25, depth: 2.2, low: contours[2].y + .25, high: topY - .8, tilt: .045 },
    { angle: controls.find(c => c.index === 5 % controls.length)!.angle, width: 1.6, depth: 2.65, low: contours[2].y - .45, high: contours[1].y + 1.15, tilt: -.055 },
    { angle: controls.find(c => c.index === 8 % controls.length)!.angle, width: .9, depth: 1.3, low: contours[1].y - .2, high: topY - .55, tilt: .035 },
  ];
  points.push([origin[0], topY - .045, origin[1]]);
  for (let row = 1; row <= radialRows; row++) {
    abort(options.signal);
    const t = rowFractions[row - 1];
    for (let angle = 0; angle < segments; angle++) {
      const a = angles[angle];
      let right = profiles.findIndex(p => p.angle > a);
      if (right < 0) right = 0;
      const left = (right + profiles.length - 1) % profiles.length;
      const span = angular(profiles[right].angle - profiles[left].angle), f = angular(a - profiles[left].angle) / span;
      const p = columnPoint(profiles[left], t), q = columnPoint(profiles[right], t);
      let x = mix(p[0], q[0], f), y = mix(p[1], q[1], f), z = mix(p[2], q[2], f);
      const dx = x - origin[0], dz = z - origin[1], radius = Math.hypot(dx, dz), pointAngle = Math.atan2(dz, dx);
      let retreat = 0;
      for (const fault of faults) {
        const along = clamp(1 - angleDistance(pointAngle, fault.angle + (y - contours[1].y) * fault.tilt) * radius / fault.width);
        const height = Math.min(clamp((y - fault.low) / .7), clamp((fault.high - y) / .7));
        retreat = Math.max(retreat, along * height * fault.depth);
      }
      retreat = Math.min(retreat, radius * .45);
      if (radius > 0) { x -= dx / radius * retreat; z -= dz / radius * retreat; }
      points.push([x, y, z]);
    }
  }
  const ring = (row: number, angle: number) => 1 + (row - 1) * segments + (angle + segments) % segments;
  for (let angle = 0; angle < segments; angle++) indices.push(0, ring(1, angle + 1), ring(1, angle));
  for (let row = 1; row < radialRows; row++) for (let angle = 0; angle < segments; angle++) {
    const a = ring(row, angle), b = ring(row, angle + 1), c = ring(row + 1, angle + 1), d = ring(row + 1, angle);
    // Alternate diagonals prevent long radial spokes from becoming a repeated
    // visible zigzag on the broad slanted faces.
    if ((row + angle) % 2) indices.push(a, b, d, b, c, d); else indices.push(a, b, c, a, c, d);
  }
  const bottomY = Math.min(...profiles.map(p => p.footY)) - .8;
  const bottomCenter = points.push([origin[0], bottomY, origin[1]]) - 1;
  const bottomStart = points.length;
  for (let angle = 0; angle < segments; angle++) {
    const upper = points[ring(radialRows, angle)]; points.push([upper[0], bottomY, upper[2]]);
  }
  for (let angle = 0; angle < segments; angle++) {
    const next = (angle + 1) % segments, a = ring(radialRows, angle), b = ring(radialRows, next), c = bottomStart + next, d = bottomStart + angle;
    indices.push(a, b, c, a, c, d, bottomCenter, d, c);
  }
  const routes = corridors(options.flights, options.landing);
  const artSourcePointCount = points.length;
  const refined = refineRouteTriangles(points, indices, routes, options.signal);
  const stairClearance = carveAndAuditRoutes(points, refined.indices, routes);
  // Preserve every legacy attribute/order when this optional contact is absent.
  const springCut = options.springBranch ? cutSpringBranch(points, refined.indices, options.springBranch, options.signal) : undefined;
  const engineeringPointCount = points.length;
  const visibleRefinement = refineVisibleSanctuaryFront(points, springCut?.indices ?? refined.indices, origin, options.springBranch, rowFractions, segments, bottomStart, artSourcePointCount, options.signal);
  const finalIndices = visibleRefinement.indices;
  const artRefinement = refineSanctuaryArt(points, finalIndices, contours, routes, origin, options.springBranch, rowFractions, segments, bottomStart, artSourcePointCount, engineeringPointCount, options.quality);
  const visibleRefinementMetadata = visibleRefinement.metadata;
  abort(options.signal);
  const position = new Float32Array(points.flat()), colors = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    const [x, y, z] = points[i];
    const mineral = .925 + .035 * Math.sin(x * .69 + z * .29) + .023 * Math.sin(z * 1.61 - y * .41);
    colors.set([mineral, mineral * .976, mineral * .925], i * 3);
  }
  let geometry: THREE.BufferGeometry | undefined;
  try {
    const indexed = new THREE.BufferGeometry();
    indexed.setAttribute('position', new THREE.BufferAttribute(position, 3));
    indexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    indexed.setIndex(finalIndices); indexed.computeVertexNormals();
    try { geometry = toCreasedNormals(indexed, Math.PI * .16); } finally { indexed.dispose(); }
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const uv = new Float32Array(positions.count * 2);
    // Dominant physical-plane projection is per face, retaining 3m texture
    // scale on vertical sides as well as the broad top. No shared map mutation.
    for (let i = 0; i < positions.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(positions, i), b = new THREE.Vector3().fromBufferAttribute(positions, i + 1), c = new THREE.Vector3().fromBufferAttribute(positions, i + 2);
      const face = b.sub(a).cross(c.sub(a));
      const ax = Math.abs(face.x), ay = Math.abs(face.y), az = Math.abs(face.z);
      for (let j = i; j < i + 3; j++) {
        const x = positions.getX(j), y = positions.getY(j), z = positions.getZ(j);
        uv[j * 2] = (ax > ay && ax > az ? z : x) / TILE_METRES;
        uv[j * 2 + 1] = (ay >= ax && ay >= az ? z : y) / TILE_METRES;
        if (!finite([x, y, z, normals.getX(j), normals.getY(j), normals.getZ(j)])) throw new Error('Nonfinite sanctuary rock geometry');
      }
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    abort(options.signal);
    const mesh = new THREE.Mesh(geometry, options.materials.limestone);
    mesh.name = 'sanctuary-front / continuous oblique-jointed rock'; mesh.castShadow = true; mesh.receiveShadow = true;
    const group = new THREE.Group(); group.name = 'nature.sanctuary-front-landform'; group.add(mesh);
    group.userData = {
      revision: 'sanctuary-front-r5-candidate-2', scope: 'C visible rock body only; D owns soil caps, walk floor, placements and final ground contact; not art accepted',
      coordinates: 'world metres / identity root transform', quality: options.quality, metersPerTile: TILE_METRES,
      bounds: { min: geometry.boundingBox!.min.toArray(), max: geometry.boundingBox!.max.toArray() },
      triangles: positions.count / 3, draws: 1,
      geometryOwnership: 'one owned geometry; borrowed limestone material and maps; dispose traversed geometry only',
      grid: { angularSegments: segments, radialRows, refinementRounds: refined.refinementRounds, indexedVertices: points.length, closedTopSideBottom: true,
        profile: 'non-nested supplied contours; metre-scale linear oblique facets; interrupted middle break; three isolated diagonal physical notches; continuous stair cut',
        macroPlaneColumns: profiles.length, forcedNestedContourExpansionM: 0, maximumLocalOverhangM: maximumLocalOverhang,
        maximumLocalFootExtensionM: maximumLocalFootExtension, buttressColumns, lowerAdjustmentScope: 'original lower contour is not uniformly expanded; three local foot ridges support selected sides while other sides can undercut' },
      contacts: { contours: options.contours.map(c => ({ y: c.y, outlineXZ: c.outlineXZ.map(p => [...p]) })), flights: options.flights.map(f => ({ id: f.id, position: [...f.position], end: [...f.end], size: [...f.size], levels: f.levels })), landing: { from: [...options.landing.from], to: [...options.landing.to], width: options.landing.width, level: options.landing.level, outlineXZ: options.landing.outlineXZ?.map(p => [...p]), minimumBodyRadius: options.landing.minimumBodyRadius } },
      stairClearance, limitations: ['Local overhangs follow differences between supplied contours; this is a closed visible body, not a structural-engineering support claim.', 'Foot samples the supplied terrainHeight at the outer ring; D must visually verify intermediate soil/rock coverage.', 'No collision AABB is authored; expanded stair prism remains below actual treads.'],
      artRefinement,
      visibleRefinement: visibleRefinementMetadata,
    };
    if (springCut) group.userData.springBranch = springCut.metadata;
    return group;
  } catch (error) { geometry?.dispose(); throw error; }
}
