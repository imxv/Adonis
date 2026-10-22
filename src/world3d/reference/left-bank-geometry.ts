import * as THREE from 'three';

type Domain = { readonly x: readonly [number, number]; readonly z: readonly [number, number] };
type Triangle = readonly [number, number, number];

// Larger than every refined triangle's XZ diameter. A displacement sampler
// inset by this distance cannot move a face covering a protected contact.
export const REFERENCE_LEFT_BANK_MESH_GUARD = .25;
const maximumEdge = .18;

/** Refines the existing coarse surface, rather than resampling its height.
 * Only original triangles touching the patch and their edge neighbours change
 * topology. The neighbours remain on their original planes, closing the edge
 * splits without a T junction. No geometries or GPU resources are allocated.
 */
export function refineReferenceLeftBankGeometry(
  geometry: THREE.BufferGeometry,
  domain: Domain,
  displacement: (x: number, z: number) => number,
) {
  const position = geometry.getAttribute('position'), index = geometry.getIndex();
  if (!index) throw new Error('Left-bank refinement requires indexed ground');
  const attributes = Object.entries(geometry.attributes);
  const values = new Map(attributes.map(([name, attribute]) => [name, Array.from(attribute.array)]));
  const positions = values.get('position')!;
  const triangles: Triangle[] = [], selected: boolean[] = [], splitEdges = new Set<string>();
  const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  let longestEdge = 0;
  for (let i = 0; i < index.count; i += 3) {
    const triangle: Triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const xs = triangle.map(v => position.getX(v)), zs = triangle.map(v => position.getZ(v));
    const touches = Math.max(...xs) >= domain.x[0] && Math.min(...xs) <= domain.x[1]
      && Math.max(...zs) >= domain.z[0] && Math.min(...zs) <= domain.z[1];
    triangles.push(triangle); selected.push(touches);
    if (touches) for (let k = 0; k < 3; k++) {
      const a = triangle[k], b = triangle[(k + 1) % 3];
      splitEdges.add(edgeKey(a, b));
      longestEdge = Math.max(longestEdge, Math.hypot(position.getX(a) - position.getX(b), position.getZ(a) - position.getZ(b)));
    }
  }
  const divisions = Math.max(1, Math.ceil(longestEdge / maximumEdge));
  const edgeVertices = new Map<string, number>(), moved = new Set<number>(), output: number[] = [];
  const sampleDisplacement = (x: number, z: number) => x > domain.x[0] && x < domain.x[1] && z > domain.z[0] && z < domain.z[1]
    ? displacement(x, z) : 0;
  // Original vertices stay byte-identical outside the inset displacement mask.
  for (let i = 0; i < position.count; i++) {
    const delta = sampleDisplacement(position.getX(i), position.getZ(i));
    if (delta !== 0) { positions[i * 3 + 1] += delta; moved.add(i); }
  }
  function vertex(triangle: Triangle, weights: readonly [number, number, number], move = true) {
    const result = positions.length / 3;
    for (const [name, attribute] of attributes) {
      const target = values.get(name)!;
      for (let component = 0; component < attribute.itemSize; component++) {
        let value = 0;
        for (let k = 0; k < 3; k++) value += Number(attribute.array[triangle[k] * attribute.itemSize + component]) * weights[k];
        target.push(value);
      }
    }
    // The old Float32 triangle is the baseline; never call the old analytic
    // height at new vertices (that would silently change protected surfaces).
    const x = Math.fround(positions[result * 3]), z = Math.fround(positions[result * 3 + 2]);
    const delta = move ? sampleDisplacement(x, z) : 0;
    positions[result * 3] = x; positions[result * 3 + 2] = z;
    if (delta !== 0) { positions[result * 3 + 1] += delta; moved.add(result); }
    return result;
  }
  function edge(a: number, b: number, step: number) {
    if (step === 0) return a;
    if (step === divisions) return b;
    if (a > b) { [a, b] = [b, a]; step = divisions - step; }
    const key = `${a}:${b}:${step}`;
    let result = edgeVertices.get(key);
    if (result === undefined) {
      result = vertex([a, b, b], [1 - step / divisions, step / divisions, 0]);
      edgeVertices.set(key, result);
    }
    return result;
  }
  function face(a: number, b: number, c: number) {
    output.push(a, b, c);
  }
  let refinedTriangles = 0, transitionTriangles = 0;
  triangles.forEach(([a, b, c], ordinal) => {
    if (selected[ordinal]) {
      refinedTriangles++;
      const vertices = new Map<string, number>();
      function at(i: number, j: number) {
        if (j === 0) return edge(a, b, i);
        if (i === 0) return edge(a, c, j);
        if (i + j === divisions) return edge(b, c, j);
        const key = `${i}:${j}`;
        let result = vertices.get(key);
        if (result === undefined) { result = vertex([a, b, c], [1 - (i + j) / divisions, i / divisions, j / divisions]); vertices.set(key, result); }
        return result;
      }
      for (let i = 0; i < divisions; i++) for (let j = 0; j < divisions - i; j++) {
        face(at(i, j), at(i + 1, j), at(i, j + 1));
        if (i + j < divisions - 1) face(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
      }
    } else if ([edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)].some(key => splitEdges.has(key))) {
      transitionTriangles++;
      const boundary: number[] = [];
      for (const [start, end] of [[a, b], [b, c], [c, a]]) {
        boundary.push(start);
        if (splitEdges.has(edgeKey(start, end))) for (let k = 1; k < divisions; k++) boundary.push(edge(start, end, k));
      }
      const centre = vertex([a, b, c], [1 / 3, 1 / 3, 1 / 3], false);
      for (let k = 0; k < boundary.length; k++) face(centre, boundary[k], boundary[(k + 1) % boundary.length]);
    } else face(a, b, c);
  });
  const baselineNormals = values.get('normal');
  for (const [name, attribute] of attributes) geometry.setAttribute(name, new THREE.Float32BufferAttribute(values.get(name)!, attribute.itemSize, attribute.normalized));
  geometry.setIndex(output); geometry.computeVertexNormals();
  // Keep normal changes inside the same inset as position changes. Updating
  // an unmoved neighbour would spread its interpolated lighting past the guard.
  if (baselineNormals) {
    const normals = geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) if (!moved.has(i)) normals.setXYZ(i, baselineNormals[i * 3], baselineNormals[i * 3 + 1], baselineNormals[i * 3 + 2]);
  }
  geometry.userData.leftBankRefinement = {
    originalTriangles: triangles.length, refinedTriangles, transitionTriangles, divisions,
    maximumRefinedXZDiameter: longestEdge / divisions,
    triangles: output.length / 3, vertices: positions.length / 3, displacedVertices: moved.size,
    inwardGuard: REFERENCE_LEFT_BANK_MESH_GUARD,
  };
  return geometry;
}

/** Refines only local long XZ edges, synchronising each split with every
 * indexed neighbour. New attributes/Y stay on the original triangle surface
 * throughout refinement. The absolute-height callback runs once per final
 * interior vertex, after all splits; protected points return originalSurfaceY.
 * No analytic resampling, second weight or global divisions factor is used.
 */
export function refineReferenceGroveBankGeometry(
  geometry: THREE.BufferGeometry,
  domain: Domain,
  transformHeight: (x: number, z: number, originalSurfaceY: number) => number,
) {
  const position = geometry.getAttribute('position'), index = geometry.getIndex();
  if (!index || !position || position.itemSize !== 3 || position.normalized
    || !(position.array instanceof Float32Array || position.array instanceof Float64Array)) {
    throw new Error('Grove-bank refinement requires indexed floating-point ground positions');
  }
  if (index.count % 3 || !position.array.every(Number.isFinite)
    || !index.array.every(value => Number.isInteger(value) && value >= 0 && value < position.count)) {
    throw new Error('Grove-bank refinement requires finite positions and valid triangle indices');
  }
  if (![...domain.x, ...domain.z].every(Number.isFinite)
    || domain.x[0] >= domain.x[1] || domain.z[0] >= domain.z[1]) {
    throw new Error('Grove-bank refinement requires finite increasing domain bounds');
  }
  if (geometry.groups.length || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity
    || Object.keys(geometry.morphAttributes).length) {
    throw new Error('Grove-bank refinement requires the complete ungrouped ground surface');
  }
  const attributes = Object.entries(geometry.attributes).map(([name, attribute]) => {
    if (!(attribute instanceof THREE.BufferAttribute) || attribute.count !== position.count) {
      throw new Error(`Grove-bank refinement requires a non-interleaved per-vertex ${name} attribute`);
    }
    return [name, attribute] as const;
  });
  const values = new Map(attributes.map(([name, attribute]) => [name, Array.from(attribute.array)]));
  const positions = values.get('position')!;
  const roundPosition = position.array instanceof Float32Array ? Math.fround : (value: number) => value;
  const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const maximumXZEdge = .10;
  let triangles: Triangle[] = [];
  for (let i = 0; i < index.count; i += 3) triangles.push([index.getX(i), index.getX(i + 1), index.getX(i + 2)]);
  const originalTriangles = triangles.length;
  const touches = ([a, b, c]: Triangle) => {
    const ax = positions[a * 3], bx = positions[b * 3], cx = positions[c * 3];
    const az = positions[a * 3 + 2], bz = positions[b * 3 + 2], cz = positions[c * 3 + 2];
    return Math.max(ax, bx, cx) >= domain.x[0] && Math.min(ax, bx, cx) <= domain.x[1]
      && Math.max(az, bz, cz) >= domain.z[0] && Math.min(az, bz, cz) <= domain.z[1];
  };
  const edgeLength = (a: number, b: number) => Math.hypot(positions[a * 3] - positions[b * 3], positions[a * 3 + 2] - positions[b * 3 + 2]);
  let splitRounds = 0, splitEdgeCount = 0, transitionTriangles = 0, maximumRefinedXZEdge = 0;
  for (;;) {
    const splitEdges = new Map<string, readonly [number, number]>();
    maximumRefinedXZEdge = 0;
    for (const triangle of triangles) if (touches(triangle)) {
      for (let k = 0; k < 3; k++) {
        const a = triangle[k], b = triangle[(k + 1) % 3], length = edgeLength(a, b);
        maximumRefinedXZEdge = Math.max(maximumRefinedXZEdge, length);
        if (length > maximumXZEdge + 1e-8) splitEdges.set(edgeKey(a, b), [a, b]);
      }
    }
    if (!splitEdges.size) break;
    // A malformed/pathological input fails before mutating the caller's buffers.
    if (splitRounds >= 24 || triangles.length + splitEdges.size * 2 > 1_000_000) {
      throw new Error('Grove-bank local refinement exceeded its safety budget');
    }
    const midpoints = new Map<string, number>();
    for (const [key, [a, b]] of splitEdges) {
      const vertex = positions.length / 3;
      for (const [name, attribute] of attributes) {
        const target = values.get(name)!;
        for (let component = 0; component < attribute.itemSize; component++) {
          const value = (target[a * attribute.itemSize + component] + target[b * attribute.itemSize + component]) * .5;
          target.push(name === 'position' ? roundPosition(value) : value);
        }
      }
      midpoints.set(key, vertex);
    }
    const next: Triangle[] = [];
    for (const triangle of triangles) {
      const [a, b, c] = triangle;
      const ab = midpoints.get(edgeKey(a, b)), bc = midpoints.get(edgeKey(b, c)), ca = midpoints.get(edgeKey(c, a));
      const count = Number(ab !== undefined) + Number(bc !== undefined) + Number(ca !== undefined);
      if (count && !touches(triangle)) transitionTriangles++;
      if (count === 3) {
        next.push([a, ab!, ca!], [ab!, b, bc!], [ca!, bc!, c], [ab!, bc!, ca!]);
      } else if (count === 2) {
        // Rotate so the two marked edges meet at v. The other edge remains
        // intact; no centre fan or new boundary vertex can create a T junction.
        const [u, v, w, uv, vw] = ab !== undefined && bc !== undefined ? [a, b, c, ab, bc]
          : bc !== undefined && ca !== undefined ? [b, c, a, bc, ca] : [c, a, b, ca!, ab!];
        next.push([v, vw, uv], [u, uv, w], [uv, vw, w]);
      } else if (count === 1) {
        const [u, v, w, uv] = ab !== undefined ? [a, b, c, ab]
          : bc !== undefined ? [b, c, a, bc] : [c, a, b, ca!];
        next.push([u, uv, w], [uv, v, w]);
      } else next.push(triangle);
    }
    triangles = next; splitRounds++; splitEdgeCount += splitEdges.size;
  }
  const moved = new Set<number>();
  for (let i = 0; i < positions.length / 3; i++) {
    const offset = i * 3, x = positions[offset], z = positions[offset + 2], originalY = positions[offset + 1];
    if (x <= domain.x[0] || x >= domain.x[1] || z <= domain.z[0] || z >= domain.z[1]) continue;
    const targetY = transformHeight(x, z, originalY);
    if (!Number.isFinite(targetY)) throw new Error('Grove-bank transform returned non-finite terrain Y');
    const y = roundPosition(targetY);
    if (!Number.isFinite(y)) throw new Error('Grove-bank transform exceeded position precision');
    if (y !== originalY) { positions[offset + 1] = y; moved.add(i); }
  }
  const baselineNormals = values.get('normal');
  for (const [name, attribute] of attributes) {
    const ArrayType = attribute.array.constructor as THREE.TypedArrayConstructor;
    const replacement = new THREE.BufferAttribute(new ArrayType(values.get(name)!), attribute.itemSize, attribute.normalized);
    replacement.name = attribute.name; replacement.setUsage(attribute.usage); replacement.gpuType = attribute.gpuType;
    geometry.setAttribute(name, replacement);
  }
  geometry.setIndex(triangles.flatMap(triangle => [...triangle]));
  geometry.computeVertexNormals();
  if (baselineNormals) {
    const normals = geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) if (!moved.has(i)) {
      for (let k = 0; k < 3; k++) normals.array[i * 3 + k] = baselineNormals[i * 3 + k];
    }
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData.groveBankRefinement = {
    originalTriangles, triangles: triangles.length, vertices: positions.length / 3,
    splitRounds, splitEdges: splitEdgeCount, transitionTriangles,
    maximumRefinedXZEdge, targetMaximumXZEdge: maximumXZEdge, displacedVertices: moved.size,
  };
  return geometry;
}
