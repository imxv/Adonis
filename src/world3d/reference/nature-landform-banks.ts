import * as THREE from 'three';
import { applyGroveBankPatch, readGroveBankColumn } from './nature-landform-bank-patch';
import { REFERENCE_STAIR_GROUND_CLEARANCE, referenceFlightStepCenter } from './landform-layout';
import type {
  GroveBankLandformOptions, LandformFlight, LandformPoint, LandformXZ,
} from './nature-landform-types';

type Point = [number, number, number];
type XZ = [number, number];
interface Section { top: Point[]; bottom: Point[] }
interface Faces { dry: number[]; wet: number[]; dryShells?: number[]; wetShells?: number[] }

const clamp = (v: number, a = 0, b = 1): number => Math.max(a, Math.min(b, v));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (v: number): number => { const t = clamp(v); return t * t * (3 - 2 * t); };
const noise = (x: number, z: number): number =>
  .53 * Math.sin(x * 1.83 + z * .74) + .28 * Math.sin(x * .57 - z * 1.61 + 1.3)
  + .19 * Math.cos(x * 2.91 + z * 2.12);

function abort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Grove bank generation aborted', 'AbortError');
}

/** The bridge is aligned with world X in the contact contract. This rectangle
 * is a void through the entire rock body, not a collider around the bridge. */
function bridgeRect(options: GroveBankLandformOptions): [number, number, number, number] {
  const b = options.causeway.excludeBridgeSpan;
  return [b.center[0] - b.localAbsXBelow, b.center[0] + b.localAbsXBelow,
    b.center[2] - b.halfWidth, b.center[2] + b.halfWidth];
}

/** Same local frame as a straight flight. The cap covers its full run plus a
 * little end overlap; it is deliberately broader than the 3.2 m stone treads. */
function belowTreads(x: number, z: number, y: number, flights: readonly LandformFlight[]): number {
  let capped = y;
  for (const f of flights) {
    const dx = f.end[0] - f.position[0], dz = f.end[2] - f.position[2];
    const run = Math.hypot(dx, dz);
    if (run < .001 || f.levels < 1) continue;
    const along = ((x - f.position[0]) * dx + (z - f.position[2]) * dz) / run;
    const side = Math.abs(((x - f.position[0]) * -dz + (z - f.position[2]) * dx) / run);
    if (along < -.4 || along > run + .4 || side > f.size[0] / 2 + .28) continue;
    const step = Math.min(f.levels - 1, Math.max(0, Math.floor(clamp(along / run) * f.levels)));
    const tread = referenceFlightStepCenter(f as Parameters<typeof referenceFlightStepCenter>[0], step)[1];
    capped = Math.min(capped, tread - REFERENCE_STAIR_GROUND_CLEARANCE);
  }
  return capped;
}

function clipAxis(polygon: XZ[], axis: 0 | 1, boundary: number, keepAbove: boolean): XZ[] {
  const result: XZ[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = (a[axis] - boundary) * (keepAbove ? 1 : -1);
    const db = (b[axis] - boundary) * (keepAbove ? 1 : -1);
    if (da >= 0) result.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      result.push([mix(a[0], b[0], t), mix(a[1], b[1], t)]);
    }
  }
  return result;
}

/** A triangle may cross several tread boundaries even if each of its three
 * corners was safe. Clip its XZ footprint in the flight frame, take the lowest
 * intersected tread, and lower all incident copies of its corners to that cap.
 * This preserves closed shared edges and conservatively clears the full face. */
function clearFlightFaces(faces: Faces, flights: readonly LandformFlight[], contacts: readonly Point[][],
  verticalPairs: readonly (readonly [Point, Point])[]): number {
  const caps = new Map<string, number>();
  const key = (p: number[], i: number): string => p.slice(i, i + 3).map(v => v.toFixed(7)).join(',');
  let affected = 0;
  for (const positions of [faces.dry, faces.wet]) {
    for (let i = 0; i < positions.length; i += 9) {
      let ceiling = Infinity;
      for (const f of flights) {
        const dx = f.end[0] - f.position[0], dz = f.end[2] - f.position[2];
        const run = Math.hypot(dx, dz);
        if (run < .001 || f.levels < 1) continue;
        let polygon: XZ[] = [0, 3, 6].map(k => {
          const x = positions[i + k] - f.position[0], z = positions[i + k + 2] - f.position[2];
          return [(x * dx + z * dz) / run, (x * -dz + z * dx) / run];
        });
        polygon = clipAxis(polygon, 0, -.4, true);
        polygon = clipAxis(polygon, 0, run + .4, false);
        polygon = clipAxis(polygon, 1, -f.size[0] / 2 - .28, true);
        polygon = clipAxis(polygon, 1, f.size[0] / 2 + .28, false);
        if (polygon.length < 3) continue;
        const along = Math.min(...polygon.map(p => p[0]));
        const index = Math.min(f.levels - 1, Math.max(0, Math.floor(clamp(along / run) * f.levels)));
        const tread = referenceFlightStepCenter(f as Parameters<typeof referenceFlightStepCenter>[0], index)[1];
        ceiling = Math.min(ceiling, tread - REFERENCE_STAIR_GROUND_CLEARANCE);
      }
      if (!Number.isFinite(ceiling)) continue;
      let changed = false;
      for (const k of [0, 3, 6]) {
        if (positions[i + k + 1] <= ceiling) continue;
        const id = key(positions, i + k);
        caps.set(id, Math.min(caps.get(id) ?? Infinity, ceiling));
        changed = true;
      }
      if (changed) affected++;
    }
  }
  // A conservative roof cut can go beneath an initially buried underside.
  // Move that underside with it to retain thickness instead of collapsing or
  // turning over the solid under a stair boundary.
  for (const [top, bottom] of verticalPairs) {
    const topCap = caps.get(top.map(v => v.toFixed(7)).join(','));
    if (topCap === undefined) continue;
    const bottomCap = Math.min(top[1], topCap) - .08;
    if (bottom[1] > bottomCap) {
      const id = bottom.map(v => v.toFixed(7)).join(',');
      caps.set(id, Math.min(caps.get(id) ?? Infinity, bottomCap));
    }
  }
  for (const positions of [faces.dry, faces.wet]) {
    for (let i = 0; i < positions.length; i += 3) {
      const ceiling = caps.get(key(positions, i));
      if (ceiling !== undefined) positions[i + 1] = Math.min(positions[i + 1], ceiling);
    }
  }
  for (const list of contacts) for (const point of list) {
    const ceiling = caps.get(point.map(v => v.toFixed(7)).join(','));
    if (ceiling !== undefined) point[1] = Math.min(point[1], ceiling);
  }
  return affected;
}

/** Oblique, metre-scale grooves cut the upper rock rather than forming rings
 * at a common height. Their amplitude fades into the submerged and buried toe. */
function fracture(x: number, z: number): number {
  const a = Math.abs(Math.sin((x * .81 + z * .37 + .6) * Math.PI / 3.7));
  const b = Math.abs(Math.sin((x * -.29 + z * .93 - .3) * Math.PI / 5.2));
  return .34 * Math.exp(-a * a / .024) + .21 * Math.exp(-b * b / .018);
}

function addTriangle(faces: Faces, a: Point, b: Point, c: Point, wet: boolean, reverse = false): void {
  const ab = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a));
  const ac = new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a));
  if (ab.cross(ac).lengthSq() < 1e-15) return;
  const out = wet ? faces.wet : faces.dry;
  out.push(...a, ...(reverse ? c : b), ...(reverse ? b : c));
}

function addQuad(faces: Faces, a: Point, b: Point, c: Point, d: Point, wet: boolean, reverse = false): void {
  addTriangle(faces, a, b, d, wet, reverse);
  addTriangle(faces, b, c, d, wet, reverse);
}

function capSection(faces: Faces, section: Section, expectedNormal: XZ, level: number): void {
  const ring = [...section.top, ...section.bottom.slice().reverse()];
  const origin = ring[0];
  const end = section.top[section.top.length - 1];
  const dx = end[0] - origin[0], dz = end[2] - origin[2], length = Math.hypot(dx, dz);
  const contour = ring.map(p => new THREE.Vector2(
    ((p[0] - origin[0]) * dx + (p[2] - origin[2]) * dz) / Math.max(.001, length), p[1]));
  for (const tri of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const [a, b, c] = tri.map(i => ring[i]);
    const normal = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a)));
    addTriangle(faces, a, b, c, (a[1] + b[1] + c[1]) / 3 <= level,
      normal.x * expectedNormal[0] + normal.z * expectedNormal[1] < 0);
  }
}

function addSolidRun(faces: Faces, sections: readonly Section[], level: number): void {
  if (sections.length < 2) return;
  const first = sections[0].top, next = sections[1].top;
  const tangent: XZ = [next[0][0] - first[0][0], next[0][2] - first[0][2]];
  const across: XZ = [first[first.length - 1][0] - first[0][0], first[first.length - 1][2] - first[0][2]];
  const reverse = tangent[1] * across[0] - tangent[0] * across[1] < 0;
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], b = sections[i + 1];
    for (let k = 0; k < a.top.length - 1; k++) {
      const wet = (a.top[k][1] + b.top[k][1] + a.top[k + 1][1] + b.top[k + 1][1]) / 4 <= level;
      addQuad(faces, a.top[k], b.top[k], b.top[k + 1], a.top[k + 1], wet, reverse);
      addQuad(faces, a.bottom[k], b.bottom[k], b.bottom[k + 1], a.bottom[k + 1], true, !reverse);
    }
    addQuad(faces, a.top[0], a.bottom[0], b.bottom[0], b.top[0], true, reverse);
    const last = a.top.length - 1;
    addQuad(faces, a.top[last], b.top[last], b.bottom[last], a.bottom[last], false, reverse);
  }
  capSection(faces, sections[0], [-tangent[0], -tangent[1]], level);
  capSection(faces, sections[sections.length - 1], tangent, level);
}

function classifyShoreMaterials(faces: Faces, options: GroveBankLandformOptions): Faces {
  const classified: Faces = { dry: [], wet: [] };
  if (faces.dryShells) { classified.dryShells = []; classified.wetShells = []; }
  for (const positions of [faces.dry, faces.wet]) for (let i = 0; i < positions.length; i += 9) {
    const triangle = positions.slice(i, i + 9);
    const centerX = (triangle[0] + triangle[3] + triangle[6]) / 3;
    const centerZ = (triangle[2] + triangle[5] + triangle[8]) / 3;
    const meanY = (triangle[1] + triangle[4] + triangle[7]) / 3;
    const wet = meanY <= options.pool.level + .08
      && Math.max(triangle[1], triangle[4], triangle[7]) <= options.pool.level + .3
      && nearestBoundary(centerX, centerZ, options.pool.outlineXZ).distance <= .8
      && [0, 3, 6].every(k => nearestBoundary(triangle[k], triangle[k + 2], options.pool.outlineXZ).distance <= 1.2);
    (wet ? classified.wet : classified.dry).push(...triangle);
    if (classified.dryShells) (wet ? classified.wetShells! : classified.dryShells).push(
      (positions === faces.dry ? faces.dryShells! : faces.wetShells!)[i / 9]);
  }
  return classified;
}

/** Weld normal fans only across a shared edge with a shallow dihedral. This
 * smooths one continuous broad slope, while separate bodies, sharp fractures,
 * pool/outer walls and the underside retain their actual crease normals. */
function setCreaseNormals(geometry: THREE.BufferGeometry): { smoothEdges: number; sharpEdges: number } {
  const position = geometry.getAttribute('position');
  const count = position.count, parents = new Int32Array(count);
  const find = (id: number): number => {
    while (parents[id] !== id) { parents[id] = parents[parents[id]]; id = parents[id]; }
    return id;
  };
  const join = (a: number, b: number): void => { const rootA = find(a), rootB = find(b); if (rootA !== rootB) parents[rootB] = rootA; };
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    parents[i] = i;
    keys.push(`${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`);
  }
  const normals: THREE.Vector3[] = [];
  const edges = new Map<string, { a: number; b: number; face: number }[]>();
  for (let i = 0; i < count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(position, i);
    const b = new THREE.Vector3().fromBufferAttribute(position, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(position, i + 2);
    normals.push(b.sub(a).cross(c.sub(a)).normalize());
    for (let k = 0; k < 3; k++) {
      const p = i + k, q = i + (k + 1) % 3;
      const id = keys[p] < keys[q] ? `${keys[p]}|${keys[q]}` : `${keys[q]}|${keys[p]}`;
      const adjacent = edges.get(id) ?? [];
      adjacent.push({ a: p, b: q, face: i / 3 });
      edges.set(id, adjacent);
    }
  }
  let smoothEdges = 0, sharpEdges = 0;
  const cosineCrease = Math.cos(Math.PI / 3);
  for (const adjacent of edges.values()) {
    if (adjacent.length !== 2) continue;
    const [a, b] = adjacent;
    if (normals[a.face].dot(normals[b.face]) < cosineCrease) { sharpEdges++; continue; }
    join(a.a, keys[a.a] === keys[b.a] ? b.a : b.b);
    join(a.b, keys[a.b] === keys[b.a] ? b.a : b.b);
    smoothEdges++;
  }
  const sums = new Map<number, THREE.Vector3>();
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i / 3) * 3, corner = i % 3;
    const p = new THREE.Vector3().fromBufferAttribute(position, i);
    const a = new THREE.Vector3().fromBufferAttribute(position, start + (corner + 1) % 3).sub(p).normalize();
    const b = new THREE.Vector3().fromBufferAttribute(position, start + (corner + 2) % 3).sub(p).normalize();
    const angle = Math.acos(clamp(a.dot(b), -1, 1));
    const root = find(i), sum = sums.get(root) ?? new THREE.Vector3();
    sum.addScaledVector(normals[Math.floor(i / 3)], angle);
    sums.set(root, sum);
  }
  for (const normal of sums.values()) normal.normalize();
  const attribute = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) sums.get(find(i))!.toArray(attribute, i * 3);
  geometry.setAttribute('normal', new THREE.BufferAttribute(attribute, 3));
  return { smoothEdges, sharpEdges };
}

function assemble(sourceFaces: Faces, options: GroveBankLandformOptions, shellOrder?: number[]): THREE.Mesh {
  const faces = classifyShoreMaterials(sourceFaces, options);
  const positions = [...faces.dry, ...faces.wet];
  if (shellOrder) shellOrder.push(...faces.dryShells!, ...faces.wetShells!);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uvs: number[] = [], colors: number[] = [];
  const color = new THREE.Color();
  for (let i = 0; i < positions.length; i += 9) {
    const a = new THREE.Vector3(...positions.slice(i, i + 3));
    const b = new THREE.Vector3(...positions.slice(i + 3, i + 6));
    const c = new THREE.Vector3(...positions.slice(i + 6, i + 9));
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    for (const p of [a, b, c]) {
      if (Math.abs(normal.y) >= Math.max(Math.abs(normal.x), Math.abs(normal.z))) uvs.push(p.x / 3, p.z / 3);
      else if (Math.abs(normal.x) > Math.abs(normal.z)) uvs.push(p.z / 3, p.y / 3);
      else uvs.push(p.x / 3, p.y / 3);
      const tint = .91 + .045 * noise(p.x * .37, p.z * .37);
      color.setRGB(tint, tint * .995, tint * .976);
      colors.push(color.r, color.g, color.b);
    }
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const normalEdges = setCreaseNormals(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  if (faces.dry.length) geometry.addGroup(0, faces.dry.length / 3, 0);
  if (faces.wet.length) geometry.addGroup(faces.dry.length / 3, faces.wet.length / 3, 1);
  const mesh = new THREE.Mesh(geometry, [options.materials.limestone, options.materials.wetLimestone]);
  mesh.name = 'grove-bank-fractured-rock-solids';
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.materialOwnership = 'borrowed; caller owns materials and maps';
  mesh.userData.metersPerTile = 3;
  mesh.userData.normalSmoothing = { method: 'shared-edge corner-angle fans', creaseAngleDegrees: 60, ...normalEdges };
  mesh.userData.wetRockClassification = { centroidDistanceToPoolM: .8, maximumVertexDistanceToPoolM: 1.2,
    meanHeightAbovePoolMaxM: .08, maximumVertexHeightAbovePoolM: .3,
    dryTriangles: faces.dry.length / 9, wetTriangles: faces.wet.length / 9 };
  return mesh;
}

interface PlanarMesh { points: XZ[]; triangles: [number, number, number][] }

/** Conforming edge refinement: every neighbour uses the same midpoint. This
 * retains a watertight mass after clipping, without long thin shore ribbons. */
function refinePlanar(mesh: PlanarMesh, maximumEdge: number): PlanarMesh {
  const points = mesh.points.slice();
  let triangles = mesh.triangles;
  for (let pass = 0; pass < 9; pass++) {
    const split = new Map<string, number>();
    const edgeKey = (a: number, b: number): string => a < b ? `${a}:${b}` : `${b}:${a}`;
    for (const tri of triangles) for (let i = 0; i < 3; i++) {
      const a = tri[i], b = tri[(i + 1) % 3], p = points[a], q = points[b];
      const key = edgeKey(a, b);
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= maximumEdge || split.has(key)) continue;
      split.set(key, points.length);
      points.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
    }
    if (!split.size) break;
    const next: [number, number, number][] = [];
    for (const [a, b, c] of triangles) {
      const ab = split.get(edgeKey(a, b)), bc = split.get(edgeKey(b, c)), ca = split.get(edgeKey(c, a));
      if (ab !== undefined && bc !== undefined && ca !== undefined) {
        next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      } else if (ab !== undefined && bc !== undefined) {
        next.push([b, bc, ab], [a, ab, c], [ab, bc, c]);
      } else if (bc !== undefined && ca !== undefined) {
        next.push([c, ca, bc], [b, bc, a], [bc, ca, a]);
      } else if (ca !== undefined && ab !== undefined) {
        next.push([a, ab, ca], [c, ca, b], [ca, ab, b]);
      } else if (ab !== undefined) next.push([a, ab, c], [ab, b, c]);
      else if (bc !== undefined) next.push([b, bc, a], [bc, c, a]);
      else if (ca !== undefined) next.push([c, ca, b], [ca, a, b]);
      else next.push([a, b, c]);
    }
    triangles = next;
  }
  return { points, triangles };
}

function nearestBoundary(x: number, z: number, outline: readonly LandformXZ[]): { x: number; z: number; distance: number } {
  let nearest = { x: outline[0][0], z: outline[0][1], distance: Infinity };
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / Math.max(.0001, dx * dx + dz * dz));
    const px = a[0] + dx * t, pz = a[1] + dz * t, distance = Math.hypot(x - px, z - pz);
    if (distance < nearest.distance) nearest = { x: px, z: pz, distance };
  }
  return nearest;
}

/** Mean-value coordinates extend one ordered boundary height continuously
 * through the polygon. The former nearest-edge projection jumped between
 * unrelated ground heights at the polygon's medial axis. Dense boundary
 * samples retain D's actual buried-foot values without exporting that jump
 * into the visible interior. Geometry tessellation is unchanged. */
function createBoundaryHeightField(outline: readonly LandformXZ[], terrainHeight: (x: number, z: number) => number): {
  samples: Point[]; height: (x: number, z: number) => number;
} {
  const samples: Point[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .6));
    for (let k = 0; k < count; k++) {
      const x = mix(a[0], b[0], k / count), z = mix(a[1], b[1], k / count);
      samples.push([x, terrainHeight(x, z) - .24, z]);
    }
  }
  const height = (x: number, z: number): number => {
    const radii = samples.map(p => Math.hypot(p[0] - x, p[2] - z));
    const nearVertex = radii.findIndex(r => r < 1e-8);
    if (nearVertex >= 0) return samples[nearVertex][1];
    const halfTangents: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      const next = (i + 1) % samples.length;
      const a = samples[i], b = samples[next];
      const ax = a[0] - x, az = a[2] - z, bx = b[0] - x, bz = b[2] - z;
      const cross = ax * bz - az * bx, dot = ax * bx + az * bz;
      // Exact edge interpolation also handles the limiting 180-degree angle.
      if (Math.abs(cross) < 1e-8 && dot <= 0) return mix(a[1], b[1], radii[i] / (radii[i] + radii[next]));
      halfTangents.push(cross / Math.max(1e-14, radii[i] * radii[next] + dot));
    }
    let sum = 0, weightedY = 0;
    for (let i = 0; i < samples.length; i++) {
      const weight = (halfTangents[(i + samples.length - 1) % samples.length] + halfTangents[i]) / radii[i];
      sum += weight;
      weightedY += weight * samples[i][1];
    }
    return weightedY / sum;
  };
  return { samples, height };
}

/** Return disjoint parts outside the open bridge rectangle. All parts retain
 * matching clipped vertices, so its boundary can be sealed as a real wall. */
function outsideBridge(polygon: XZ[], rect: readonly number[]): XZ[][] {
  const result: XZ[][] = [];
  const take = (axis: 0 | 1, boundary: number, outsideAbove: boolean): void => {
    const outside = clipAxis(polygon, axis, boundary, outsideAbove);
    if (outside.length >= 3) result.push(outside);
    polygon = clipAxis(polygon, axis, boundary, !outsideAbove);
  };
  take(0, rect[0], false);
  take(0, rect[1], true);
  take(1, rect[2], false);
  take(1, rect[3], true);
  return result;
}

function addMass(faces: Faces, mesh: PlanarMesh, height: (x: number, z: number) => number,
  bottomY: number, poolLevel: number, rect: readonly number[], verticalPairs: [Point, Point][],
  closureAudit: { boundarySegments: number; unexpectedInternalBoundaries: number },
  expectedBoundary: (a: Point, b: Point) => boolean): number {
  const boundary = new Map<string, { a: Point; b: Point; count: number }>();
  const key = (p: Point): string => `${p[0].toFixed(6)},${p[2].toFixed(6)}`;
  const parts: XZ[][] = [];
  for (const tri of mesh.triangles) parts.push(...outsideBridge(tri.map(i => mesh.points[i]), rect));
  // The four disjoint clipping regions can meet halfway along a former edge.
  // Share every cut-line point before lifting to 3D. Otherwise a T junction
  // could be mistaken for an exposed boundary and grow an internal wall.
  const cutLines = [
    { axis: 0 as const, value: rect[0], other: 1 as const, points: [] as number[] },
    { axis: 0 as const, value: rect[1], other: 1 as const, points: [] as number[] },
    { axis: 1 as const, value: rect[2], other: 0 as const, points: [] as number[] },
    { axis: 1 as const, value: rect[3], other: 0 as const, points: [] as number[] },
  ];
  for (const polygon of parts) for (const p of polygon) for (const line of cutLines) {
    if (Math.abs(p[line.axis] - line.value) < 1e-7) line.points.push(p[line.other]);
  }
  for (const line of cutLines) line.points = [...new Set(line.points.map(v => +v.toFixed(7)))].sort((a, b) => a - b);
  let topTriangles = 0;
  for (const polygon of parts) {
    const stitched: XZ[] = [];
    for (let edge = 0; edge < polygon.length; edge++) {
      const a = polygon[edge], b = polygon[(edge + 1) % polygon.length];
      stitched.push(a);
      for (const line of cutLines) {
        if (Math.abs(a[line.axis] - line.value) > 1e-7 || Math.abs(b[line.axis] - line.value) > 1e-7) continue;
        const lo = Math.min(a[line.other], b[line.other]), hi = Math.max(a[line.other], b[line.other]);
        const values = line.points.filter(v => v > lo + 1e-6 && v < hi - 1e-6);
        if (a[line.other] > b[line.other]) values.reverse();
        for (const value of values) {
          const p: XZ = [0, 0];
          p[line.axis] = line.value; p[line.other] = value;
          stitched.push(p);
        }
      }
    }
    const planarTriangles: XZ[][] = [];
    if (stitched.length > polygon.length) {
      const center: XZ = [stitched.reduce((sum, p) => sum + p[0], 0) / stitched.length,
        stitched.reduce((sum, p) => sum + p[1], 0) / stitched.length];
      for (let i = 0; i < stitched.length; i++) planarTriangles.push([center, stitched[i], stitched[(i + 1) % stitched.length]]);
    } else for (let k = 1; k < polygon.length - 1; k++) planarTriangles.push([polygon[0], polygon[k], polygon[k + 1]]);
    for (const planarTriangle of planarTriangles) {
        let points: Point[] = planarTriangle.map(([x, z]) => [x, height(x, z), z]);
        const normalY = (points[1][2] - points[0][2]) * (points[2][0] - points[0][0])
          - (points[1][0] - points[0][0]) * (points[2][2] - points[0][2]);
        if (Math.abs(normalY) < 1e-10) continue;
        if (normalY < 0) points = [points[0], points[2], points[1]];
        const [a, b, c] = points;
        addTriangle(faces, a, b, c, (a[1] + b[1] + c[1]) / 3 <= poolLevel);
        const underside = points.map(p => [p[0], bottomY, p[2]] as Point);
        addTriangle(faces, underside[0], underside[1], underside[2], true, true);
        points.forEach((p, i) => verticalPairs.push([p, underside[i]]));
        for (let edge = 0; edge < 3; edge++) {
          const p = points[edge], q = points[(edge + 1) % 3], pKey = key(p), qKey = key(q);
          const id = pKey < qKey ? `${pKey}|${qKey}` : `${qKey}|${pKey}`;
          const saved = boundary.get(id);
          if (saved) saved.count++;
          else boundary.set(id, { a: p, b: q, count: 1 });
        }
        topTriangles++;
    }
  }
  for (const edge of boundary.values()) {
    if (edge.count !== 1) continue;
    const a = edge.a, b = edge.b;
    closureAudit.boundarySegments++;
    if (!expectedBoundary(a, b)) closureAudit.unexpectedInternalBoundaries++;
    addQuad(faces, a, [a[0], bottomY, a[2]], [b[0], bottomY, b[2]], b,
      (a[1] + b[1]) / 2 <= poolLevel);
  }
  return topTriangles;
}

/** Thick independent shore rock with a pool hollow and a true bridge opening.
 * D owns the cap/bed/walk surface; terrain is read only along the outer buried
 * foot. No second terrain sampler is published, and no shell follows it. */
export function createGroveBankLandform(options: GroveBankLandformOptions): THREE.Group {
  abort(options.signal);
  if (options.pool.outlineXZ.length < 3 || options.causeway.axis.length < 2) {
    throw new Error('Grove banks require a pool ring and causeway axis');
  }
  const group = new THREE.Group();
  group.name = 'reference-grove-bank-landform';
  const pool = options.pool, rect = bridgeRect(options);
  const terrainHeight = options.groveBankPatch?.baselineTerrainHeight ?? options.terrainHeight;
  const faces: Faces = { dry: [], wet: [] }, verticalPairs: [Point, Point][] = [];
  if (options.groveBankPatch) { faces.dryShells = []; faces.wetShells = []; }
  let shellId = 0;
  const recordShell = (dryStart: number, wetStart: number): void => {
    if (!faces.dryShells) return;
    for (let i = dryStart / 9; i < faces.dry.length / 9; i++) faces.dryShells[i] = shellId;
    for (let i = wetStart / 9; i < faces.wet.length / 9; i++) faces.wetShells![i] = shellId;
    shellId++;
  };
  const x0 = pool.outerFootTargetXZ.x[0], x1 = pool.outerFootTargetXZ.x[1];
  const z0 = pool.outerFootTargetXZ.z[0], z1 = pool.outerFootTargetXZ.z[1];
  const width = x1 - x0, depth = z1 - z0;
  // A broad irregular footprint surrounds the whole concave basin. Its south
  // shoulder uses the full proposed 8–14 m slope distance, not one narrow
  // extrusion per original outline edge.
  const outer: XZ[] = [[x0 + width * .07, z0 + depth * .18], [x0 + width * .22, z0 + depth * .02],
    [x0 + width * .65, z0], [x1 - width * .04, z0 + depth * .16], [x1, z0 + depth * .48],
    [x1 - width * .03, z0 + depth * .78], [x1 - width * .2, z1],
    [x0 + width * .4, z1 - depth * .02], [x0 + width * .1, z1 - depth * .14],
    [x0, z0 + depth * .5]];
  const hole = pool.outlineXZ.map(p => new THREE.Vector2(p[0], p[1]));
  const contour = outer.map(p => new THREE.Vector2(...p));
  const basePoints: XZ[] = [...outer, ...pool.outlineXZ.map(p => [p[0], p[1]] as XZ)];
  const baseTriangles = THREE.ShapeUtils.triangulateShape(contour, [hole]) as [number, number, number][];
  const planar = refinePlanar({ points: basePoints, triangles: baseTriangles }, options.quality === 'high' ? .82 : 1.65);
  abort(options.signal);
  const outerFoot = outer.map(([x, z]) => [x, terrainHeight(x, z) - .24, z] as Point);
  const boundaryHeight = createBoundaryHeightField(outer, terrainHeight);
  const foundationY = Math.min(...outerFoot.map(p => p[1]), pool.bedYRange[0] - 1.4) - .75;
  const heightCache = new Map<string, number>();
  const shoreHeight = (x: number, z: number): number => {
    const cacheKey = `${x.toFixed(7)},${z.toFixed(7)}`;
    const cached = heightCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const inner = nearestBoundary(x, z, pool.outlineXZ), foot = nearestBoundary(x, z, outer);
    const radial = inner.distance / Math.max(.0001, inner.distance + foot.distance);
    const footY = boundaryHeight.height(x, z);
    const crest = pool.level + .52 + .17 * noise(x * .55, z * .55);
    let y = mix(crest, footY + .06, Math.pow(radial, 1.12));
    // A submerged, thick inner shoulder; the banks rise behind it and descend
    // through broad fracture faces rather than fanning separate slabs outward.
    y -= .91 * Math.exp(-inner.distance * inner.distance / .64);
    const relief = Math.sin(Math.PI * radial) * smooth(inner.distance / .7);
    y += relief * (.62 * noise(x * .61, z * .61) - fracture(x, z));
    const result = Math.max(foundationY + 1, y);
    heightCache.set(cacheKey, result);
    return result;
  };
  const closureAudit = { boundarySegments: 0, unexpectedInternalBoundaries: 0 };
  const expectedBoundary = (a: Point, b: Point): boolean => {
    const points: XZ[] = [[a[0], a[2]], [b[0], b[2]], [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2]];
    if ([outer, pool.outlineXZ].some(ring => points.every(([x, z]) => nearestBoundary(x, z, ring).distance < 1e-4))) return true;
    return points.every(([x, z]) => ((Math.abs(x - rect[0]) < 1e-4 || Math.abs(x - rect[1]) < 1e-4)
      && z >= rect[2] - 1e-4 && z <= rect[3] + 1e-4)
      || ((Math.abs(z - rect[2]) < 1e-4 || Math.abs(z - rect[3]) < 1e-4)
        && x >= rect[0] - 1e-4 && x <= rect[1] + 1e-4));
  };
  const basinTopTriangles = addMass(faces, planar, shoreHeight, foundationY, pool.level, rect, verticalPairs,
    closureAudit, expectedBoundary);
  recordShell(0, 0);
  const shoreRockEdge: Point[] = pool.outlineXZ.map(([x, z]) => [x, shoreHeight(x, z), z]);
  const causewayContacts: Point[] = [];
  const shoulderFootContacts: Point[] = [];
  let shoulderSolids = 0;
  const addShoulder = (a: LandformPoint, b: LandformPoint, east: boolean): void => {
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (length < .01) return;
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const normalZ = Math.abs(dx / length);
    const count = Math.max(3, Math.ceil(length / (options.quality === 'high' ? .6 : 1.05)));
    const sections: Section[] = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count, cx = mix(a[0], b[0], t), cz = mix(a[2], b[2], t);
      const halfCrest = options.causeway.crestWidth / 2;
      const halfFoot = options.causeway.footWidthMax / 2 * (.88 + .08 * Math.sin(t * 3.1 + .5));
      const distances = [-halfFoot, -halfFoot * .66, -halfCrest, 0, halfCrest, halfFoot * .71, halfFoot];
      const top: Point[] = [], bottom: Point[] = [];
      for (const d of distances) {
        const px = east ? Math.max(cx, rect[1]) : Math.min(cx, rect[0]);
        const pz = cz + d / Math.max(.5, normalZ);
        const shoulder = smooth((Math.abs(d) - halfCrest) / Math.max(.2, halfFoot - halfCrest));
        const toeY = Math.min(terrainHeight(px, pz) - .24, pool.bedYRange[1] + .05);
        let py = mix(options.causeway.groundCrestY, toeY + .07, shoulder);
        py += shoulder * (1 - shoulder) * (.42 * noise(px, pz) - fracture(px, pz));
        py = belowTreads(px, pz, py, options.flights);
        top.push([px, Math.max(foundationY + 1, py), pz]);
        bottom.push([px, foundationY, pz]);
      }
      causewayContacts.push([...top[3]]);
      shoulderFootContacts.push([...top[0]], [...top[top.length - 1]]);
      top.forEach((p, k) => verticalPairs.push([p, bottom[k]]));
      sections.push({ top, bottom });
    }
    // addSolidRun resolves the opposite east/west section winding.
    const dryStart = faces.dry.length, wetStart = faces.wet.length;
    addSolidRun(faces, sections, pool.level);
    recordShell(dryStart, wetStart);
    shoulderSolids++;
  };
  for (let i = 0; i < options.causeway.axis.length - 1; i++) {
    addShoulder(options.causeway.axis[i], options.causeway.axis[i + 1], true);
  }
  // West shoulder derives only from the bridge's supplied centre/span. A
  // landward short abutment closes into D's west bank while the entire span
  // rectangle remains empty below the actual arch.
  const bridge = options.causeway.excludeBridgeSpan;
  const westEnd: Point = [bridge.center[0] - bridge.localAbsXBelow, options.causeway.groundCrestY, bridge.center[2]];
  const westLandward: Point = [westEnd[0] - options.causeway.crestWidth * 1.12,
    options.causeway.groundCrestY, westEnd[2] - options.causeway.crestWidth * .13];
  addShoulder(westEnd, westLandward, false);
  abort(options.signal);
  const conservativelyLoweredFlightTriangles = clearFlightFaces(faces, options.flights,
    [shoreRockEdge, outerFoot, causewayContacts, shoulderFootContacts], verticalPairs);
  const shellOrder = options.groveBankPatch ? [] as number[] : undefined;
  const mesh = assemble(faces, options, shellOrder);
  let patchAudit: Record<string, unknown> | undefined;
  if (options.groveBankPatch) {
    const original = mesh.geometry;
    try {
      const patched = applyGroveBankPatch(original, options.groveBankPatch, shellOrder!, options.signal);
      mesh.geometry = patched.geometry; patchAudit = patched.audit;
      mesh.userData.normalSmoothing = { method: patched.audit.normals };
      mesh.userData.wetRockClassification = { method: 'original material identity retained per parent triangle' };
    } catch (error) { original.dispose(); throw error; }
    original.dispose();
  }
  group.add(mesh);
  const bounds = mesh.geometry.boundingBox!;
  group.userData = {
    revision: 'grove-bank-rock-3', coordinateSpace: 'world metres; identity transform',
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    triangles: mesh.geometry.getAttribute('position').count / 3,
    drawCalls: mesh.geometry.groups.length, geometryOwnership: 'one owned geometry; materials/maps borrowed',
    metersPerTile: 3, macroSolids: 1 + shoulderSolids, basinTopTriangles,
    surfaceNormals: mesh.userData.normalSmoothing,
    wetRockClassification: mesh.userData.wetRockClassification,
    outerFootInterpolation: { method: 'mean-value coordinates of ordered D-sampled boundary',
      sampleCount: boundaryHeight.samples.length, maximumBoundarySampleSpacingM: .6,
      interiorNearestEdgeHeightProjection: false },
    closureAudit,
    foundationY, minimumMacroBodyDepthM: 1,
    contacts: { poolOutlineRockEdge: shoreRockEdge, buriedOuterFoot: outerFoot,
      bridgeAndCausewayCrest: causewayContacts, shoulderFeet: shoulderFootContacts },
    slopeTransitionTargetM: [...pool.downhillBlendWidthM],
    bridgeVoid: { x: [rect[0], rect[1]], z: [rect[2], rect[3]], allY: true },
    flightClearance: { treadInsetM: REFERENCE_STAIR_GROUND_CLEARANCE, bodyMarginPerSideM: .28,
      source: 'D StepCenter.Y; input flight local-axis triangle clips to lowest intersected tread',
      conservativelyLoweredFlightTriangles },
    limitations: [
      'One thick basin rock mass plus east/west shoulders; overlaps are not a Boolean union.',
      'D supplies soil cap, actual bed, all walk/collision surfaces and final buried-foot contact.',
      'Outer foot follows supplied terrain only at the outer boundary; underbody retains independent full volume.',
      'Outer boundary linearly interpolates D foot samples at at most .6m spacing; final buried contact needs the same D callback.',
      'No reference-level visual acceptance; inspect nearby slopes and bridge undercroft in the same-version composition.',
    ],
  };
  if (patchAudit) {
    group.userData.revision = 'grove-bank-rock-4-local-patch-1';
    group.userData.groveBankPatch = patchAudit;
    group.userData.constructionBaselineContacts = group.userData.contacts;
    group.userData.contacts = {
      source: 'highest/lowest hits on actual final Float32 C triangles at original contact XZ; not D ground or minus-.24 targets',
      samples: Object.entries(group.userData.constructionBaselineContacts as Record<string, Point[]>).map(([name, queries]) => ({
        name, columns: queries.map(([x, , z]) => ({ x, z, ...readGroveBankColumn(mesh.geometry, x, z) })),
      })),
    };
  }
  return group;
}
