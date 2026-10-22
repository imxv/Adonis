import * as THREE from 'three';

type Point = { x: number; z: number };
type CapTriangle = readonly [number, number, number];
export interface CascadeGroundSupportDetails {
  status: 'created' | 'no-mesh' | 'unsupported-mesh' | 'no-horizontal-bottom-cap' |
    'invalid-bottom-cap-winding' | 'invalid-cap-topology' | 'cap-above-water';
  model: string;
  worldMinY: number | null;
  topY: number | null;
  horizontalTolerance: number;
  sourceTriangles: number;
  capTriangles: number;
  upwardBottomTriangles: number;
  duplicateCapTriangles: number;
  capVertices: number;
  boundaryEdges: number;
  interiorEdges: number;
  nonManifoldEdges: number;
  invalidBoundaryVertices: number;
  footprintArea: number;
  terrainSamples: number;
  bottomRange: readonly [number, number] | null;
  outputTriangles: number;
  mainDraws: number;
  bottomMethod: string;
  reason?: string;
}

/** Hidden support under the supplied model's actual bottom cap. Coordinates in
 * the returned, detached root are WORLD coordinates; attach it to an identity
 * scene/group. Material/maps and every source mesh are borrowed unchanged.
 * Only downward geometric faces at the true world minimum qualify. An invalid
 * or absent cap returns an empty root plus a diagnostic, never a bbox slab.
 */
export function createCascadeGroundSupport(
  model: THREE.Object3D,
  terrainHeight: (x: number, z: number) => number,
  material: THREE.MeshStandardMaterial,
): { root: THREE.Group; geometries: Set<THREE.BufferGeometry>; details: CascadeGroundSupportDetails } {
  const root = new THREE.Group(); root.name = 'D / submerged cascade ground support';
  const geometries = new Set<THREE.BufferGeometry>();
  const details: CascadeGroundSupportDetails = {
    status: 'no-mesh', model: model.name, worldMinY: null, topY: null, horizontalTolerance: .00001,
    sourceTriangles: 0, capTriangles: 0, upwardBottomTriangles: 0, duplicateCapTriangles: 0, capVertices: 0,
    boundaryEdges: 0, interiorEdges: 0, nonManifoldEdges: 0, invalidBoundaryVertices: 0, footprintArea: 0,
    terrainSamples: 0, bottomRange: null, outputTriangles: 0, mainDraws: 0,
    bottomMethod: 'Each original cap triangle samples its actual terrain at <=.35m strips. Its three shared bottom vertices are lowered to the sampled minimum minus .15m and at least .11m below the source cap; adjacent triangles share the lower value. This includes .03m reserve for the rendered terrain mesh. Only original boundary edges receive walls.',
  };
  const result = () => { root.userData.cascadeGroundSupport = details; return { root, geometries, details }; };
  type Record = { mesh: THREE.Mesh; start: number; end: number; orientation: number };
  const records: Record[] = [];
  const vertices: Point[] = [], triangles: CapTriangle[] = [], vertexIds = new Map<string, number>(), triangleIds = new Set<string>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), edge = new THREE.Vector3(), normal = new THREE.Vector3();
  function read(record: Record, index: number, target: THREE.Vector3) {
    const g = record.mesh.geometry, p = g.getAttribute('position');
    target.fromBufferAttribute(p, g.index ? g.index.getX(index) : index).applyMatrix4(record.mesh.matrixWorld);
    if (![target.x, target.y, target.z].every(Number.isFinite)) throw new Error('Cascade support source has a non-finite world vertex');
    return target;
  }
  function vertex(p: THREE.Vector3) {
    // C's merged/non-indexed cap repeats vertices. Micrometre welding only
    // identifies shared edges; the first real coordinate is retained verbatim.
    const key = `${Math.round(p.x * 1e6)},${Math.round(p.z * 1e6)}`;
    let id = vertexIds.get(key);
    if (id === undefined) { id = vertices.length; vertices.push({ x: p.x, z: p.z }); vertexIds.set(key, id); }
    return id;
  }
  const ground = (x: number, z: number) => {
    const y = terrainHeight(Math.fround(x), Math.fround(z)); details.terrainSamples++;
    if (!Number.isFinite(y)) throw new Error(`Cascade support has a non-finite terrain floor at ${x},${z}`);
    return y;
  };
  try {
    model.updateWorldMatrix(true, true);
    let unsupported = false, minY = Infinity, maxY = -Infinity;
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object instanceof THREE.InstancedMesh || object instanceof THREE.SkinnedMesh) { unsupported = true; return; }
      const geometry = object.geometry, p = geometry.getAttribute('position'); if (!p) return;
      const available = geometry.index?.count ?? p.count;
      const start = Math.max(0, Math.ceil(geometry.drawRange.start / 3) * 3);
      const end = Math.min(available, Math.floor((geometry.drawRange.start + geometry.drawRange.count) / 3) * 3);
      const determinant = object.matrixWorld.determinant();
      if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) throw new Error('Cascade support source has a singular world transform');
      const record = { mesh: object, start, end, orientation: Math.sign(determinant) };
      records.push(record); details.sourceTriangles += Math.max(0, end - start) / 3;
      for (let i = start; i < end; i++) { read(record, i, a); minY = Math.min(minY, a.y); maxY = Math.max(maxY, a.y); }
    });
    if (unsupported) { details.status = 'unsupported-mesh'; details.reason = 'Animated/instanced source geometry requires its actual deformed world vertices; no approximate support was created.'; return result(); }
    if (!Number.isFinite(minY)) return result();
    details.worldMinY = minY; details.topY = minY + .01;
    const tolerance = details.horizontalTolerance = Math.max(.00001, (maxY - minY) * 1e-6);
    for (const record of records) for (let i = record.start; i < record.end; i += 3) {
      read(record, i, a); read(record, i + 1, b); read(record, i + 2, c);
      if ([a, b, c].some(p => Math.abs(p.y - minY) > tolerance)) continue;
      edge.subVectors(b, a); normal.subVectors(c, a).crossVectors(edge, normal);
      if (normal.lengthSq() < 1e-16) continue;
      const outwardY = normal.y / normal.length() * record.orientation;
      if (outwardY > .999) { details.upwardBottomTriangles++; continue; }
      if (outwardY > -.999) continue;
      // A reflected source still produces a consistently downward output cap.
      const ids: CapTriangle = normal.y < 0 ? [vertex(a), vertex(b), vertex(c)] : [vertex(a), vertex(c), vertex(b)];
      if (new Set(ids).size < 3) continue;
      const key = [...ids].sort((x, y) => x - y).join(',');
      if (triangleIds.has(key)) { details.duplicateCapTriangles++; continue; }
      triangleIds.add(key); triangles.push(ids);
      details.footprintArea += Math.abs(normal.y) / 2;
    }
    details.capTriangles = triangles.length; details.capVertices = vertices.length;
    if (details.upwardBottomTriangles) {
      details.status = 'invalid-bottom-cap-winding'; details.reason = 'Lowest horizontal source faces include upward triangles. Filtering them would create false radial boundary walls; repair the source cap first.'; return result();
    }
    if (!triangles.length) { details.status = 'no-horizontal-bottom-cap'; details.reason = 'No downward horizontal triangles at the actual world minimum.'; return result(); }
    if (details.topY >= .18) { details.status = 'cap-above-water'; details.reason = 'A cap embedded .01m into this model would reach the main pool surface at .18m.'; return result(); }
    const edges = new Map<string, { a: number; b: number; count: number }>();
    for (const tri of triangles) for (let j = 0; j < 3; j++) {
      const from = tri[j], to = tri[(j + 1) % 3], key = from < to ? `${from},${to}` : `${to},${from}`;
      const known = edges.get(key); if (known) known.count++; else edges.set(key, { a: from, b: to, count: 1 });
    }
    const boundary = [...edges.values()].filter(e => e.count === 1), degrees = new Map<number, number>();
    for (const e of boundary) for (const id of [e.a, e.b]) degrees.set(id, (degrees.get(id) ?? 0) + 1);
    details.boundaryEdges = boundary.length; details.interiorEdges = [...edges.values()].filter(e => e.count === 2).length;
    details.nonManifoldEdges = [...edges.values()].filter(e => e.count > 2).length;
    details.invalidBoundaryVertices = [...degrees.values()].filter(degree => degree !== 2).length;
    if (!boundary.length || details.nonManifoldEdges || details.invalidBoundaryVertices) {
      details.status = 'invalid-cap-topology'; details.reason = 'The extracted cap does not have closed, manifold boundary loops.'; return result();
    }
    const top = details.topY, bottom = vertices.map(v => Math.min(ground(v.x, v.z) - .15, minY - .11));
    for (const tri of triangles) {
      let [p, q, r] = tri.map(id => vertices[id]);
      const distance = (u: Point, v: Point) => Math.hypot(u.x - v.x, u.z - v.z);
      if (distance(p, r) > distance(p, q)) [q, r] = [r, q];
      if (distance(q, r) > distance(p, q)) [p, r] = [r, p];
      const length = distance(p, q), altitude = Math.abs((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)) / length;
      const strips = Math.max(2, Math.ceil(altitude / .35));
      let terrainMin = Infinity;
      for (let row = 0; row <= strips; row++) {
        const t = row / strips, from = { x: THREE.MathUtils.lerp(p.x, r.x, t), z: THREE.MathUtils.lerp(p.z, r.z, t) };
        const to = { x: THREE.MathUtils.lerp(q.x, r.x, t), z: THREE.MathUtils.lerp(q.z, r.z, t) };
        const samples = Math.max(1, Math.ceil(distance(from, to) / .35));
        for (let sample = 0; sample <= samples; sample++) terrainMin = Math.min(terrainMin, ground(THREE.MathUtils.lerp(from.x, to.x, sample / samples), THREE.MathUtils.lerp(from.z, to.z, sample / samples)));
      }
      const floor = Math.min(terrainMin - .15, minY - .11);
      for (const id of tri) bottom[id] = Math.min(bottom[id], floor);
    }
    details.bottomRange = [Math.min(...bottom), Math.max(...bottom)];
    const positions: number[] = [], uv: number[] = [], colors: number[] = [];
    const emit = (ids: readonly number[], heights: readonly number[], coordinates?: readonly number[]) => {
      for (let i = 0; i < 3; i++) {
        const p = vertices[ids[i]]; positions.push(p.x, heights[i], p.z);
        uv.push(coordinates ? coordinates[i * 2] : p.x, coordinates ? coordinates[i * 2 + 1] : p.z);
        colors.push(.82, .80, .745);
      }
    };
    for (const [x, y, z] of triangles) { emit([x, z, y], [top, top, top]); emit([x, y, z], [bottom[x], bottom[y], bottom[z]]); }
    for (const e of boundary) {
      const length = Math.hypot(vertices[e.b].x - vertices[e.a].x, vertices[e.b].z - vertices[e.a].z);
      emit([e.a, e.a, e.b], [bottom[e.a], top, top], [0, bottom[e.a], 0, top, length, top]);
      emit([e.a, e.b, e.b], [bottom[e.a], top, bottom[e.b]], [0, bottom[e.a], length, top, length, bottom[e.b]]);
    }
    const geometry = new THREE.BufferGeometry(); geometries.add(geometry);
    geometry.name = 'D / actual-cap cascade foundation';
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = geometry.name; mesh.receiveShadow = true; mesh.castShadow = false; root.add(mesh);
    details.status = 'created'; details.outputTriangles = positions.length / 9; details.mainDraws = 1;
    return result();
  } catch (error) {
    geometries.forEach(geometry => geometry.dispose()); geometries.clear(); root.clear(); throw error;
  }
}
