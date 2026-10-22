import * as THREE from 'three';
import type { ReferenceGroveBankPatch } from './contracts';
import { groveBankColumnDelta } from './grove-bank-patch';

type Point = [number, number, number];
type Triangle = [number, number, number];
interface Face { ids: Triangle; parent: number; shell: number; inside: boolean }
export interface GroveBankPatchTrace {
  readonly original: Float32Array;
  readonly originalShells: readonly number[];
  readonly parents: readonly number[];
  readonly originalNodes: readonly Point[];
  readonly nodes: readonly Point[];
  readonly faces: readonly Triangle[];
  readonly columns: readonly { x: number; z: number; topY: number; deltaY: number }[];
}
const EPS = 1e-8;
const MAX_ADDED_TRIANGLES = 20_000;
const MAX_EDGE_M = .28;
const key = (p: Point): string => p.map(v => v.toFixed(8)).join(',');
const edgeKey = (shell: number, a: number, b: number): string => `${shell}:${Math.min(a, b)}:${Math.max(a, b)}`;
const cross = (a: Point, b: Point, c: Point): Point => {
  const u = b.map((v, i) => v - a[i]), v = c.map((v, i) => v - a[i]);
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
};
const area2 = (a: Point, b: Point, c: Point): number => Math.hypot(...cross(a, b, c));
const signedLine = (x: number, z: number, a: readonly number[], b: readonly number[]): number =>
  ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
function inside(x: number, z: number, ring: readonly (readonly number[])[]): boolean {
  let odd = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (Math.abs(signedLine(x, z, a, b)) < EPS && x >= Math.min(a[0], b[0]) - EPS
      && x <= Math.max(a[0], b[0]) + EPS && z >= Math.min(a[1], b[1]) - EPS && z <= Math.max(a[1], b[1]) + EPS) return true;
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) odd = !odd;
  }
  return odd;
}
function checkPatch(patch: ReferenceGroveBankPatch): void {
  if (![patch.revision, patch.shapeRevision, patch.baselineRevision].every(v => typeof v === 'string' && v.length)
    || typeof patch.sample !== 'function' || typeof patch.baselineTerrainHeight !== 'function') throw new TypeError('Invalid grove bank patch contract');
  const ring = patch.domainXZ;
  if (ring.length < 3 || ring.length > 24 || ring.some(p => p.length !== 2 || !p.every(Number.isFinite))
    || !Number.isFinite(patch.rockInsetM) || patch.rockInsetM < 0) throw new TypeError('Invalid grove bank patch domain/inset');
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < EPS) throw new RangeError('Repeated grove bank patch domain corner');
    area += a[0] * b[1] - b[0] * a[1];
    for (let j = i + 2; j < ring.length; j++) {
      if ((j + 1) % ring.length === i) continue;
      const c = ring[j], d = ring[(j + 1) % ring.length];
      if (signedLine(c[0], c[1], a, b) * signedLine(d[0], d[1], a, b) < 0
        && signedLine(a[0], a[1], c, d) * signedLine(b[0], b[1], c, d) < 0) throw new RangeError('Self-intersecting grove bank patch domain');
    }
  }
  if (Math.abs(area) < EPS) throw new RangeError('Empty grove bank patch domain');
}

/** Local closed-shell refinement. All positions and top queries below refer to
 * the immutable original rendered Float32 surface. Separate authored shells
 * have separate edge/node registries, even where their positions coincide.
 * No terrain/profile, protection polygon or second blend is authored here. */
export function applyGroveBankPatch(source: THREE.BufferGeometry, patch: ReferenceGroveBankPatch,
  shellByFace: readonly number[], signal?: AbortSignal): {
    geometry: THREE.BufferGeometry; audit: Record<string, unknown>; trace: GroveBankPatchTrace;
  } {
  checkPatch(patch); signal?.throwIfAborted();
  const position = source.getAttribute('position');
  if (source.index || position.count % 3 || shellByFace.length !== position.count / 3) throw new TypeError('Expected original nonindexed bank shells');
  const original = new Float32Array(position.array);
  if (original.some(value => !Number.isFinite(value))) throw new RangeError('Non-finite original grove bank surface');
  const originalCount = position.count / 3, nodes: Point[] = [], registry = new Map<string, number>();
  const node = (p: Point, shell: number): number => {
    const id = `${shell}:${key(p)}`, old = registry.get(id);
    if (old !== undefined) return old;
    registry.set(id, nodes.length); nodes.push(p); return nodes.length - 1;
  };
  const originals: Face[] = [];
  for (let i = 0; i < originalCount; i++) {
    const shell = shellByFace[i];
    const ids = [0, 1, 2].map(k => node(Array.from(original.slice(i * 9 + k * 3, i * 9 + k * 3 + 3)) as Point, shell)) as Triangle;
    originals.push({ ids, parent: i, shell, inside: false });
  }
  const initialNodeCount = nodes.length;
  const ring = patch.domainXZ, loX = Math.min(...ring.map(p => p[0])), hiX = Math.max(...ring.map(p => p[0]));
  const loZ = Math.min(...ring.map(p => p[1])), hiZ = Math.max(...ring.map(p => p[1]));
  const edgeCuts = new Map<string, number[]>();
  const cells: { polygon: number[]; parent: number; shell: number }[] = [];
  let intersectedParents = 0;
  const pointOnEdge = (p: Point, a: Point, b: Point): number | undefined => {
    const v = b.map((n, i) => n - a[i]), lengthSq = v.reduce((s, n) => s + n * n, 0);
    const t = v.reduce((s, n, i) => s + n * (p[i] - a[i]), 0) / lengthSq;
    if (t <= 1e-7 || t >= 1 - 1e-7 || Math.hypot(...v.map((n, i) => a[i] + t * n - p[i])) > 2e-6) return undefined;
    return t;
  };
  for (const face of originals) {
    signal?.throwIfAborted();
    const points = face.ids.map(id => nodes[id]);
    if (Math.max(...points.map(p => p[0])) < loX || Math.min(...points.map(p => p[0])) > hiX
      || Math.max(...points.map(p => p[2])) < loZ || Math.min(...points.map(p => p[2])) > hiZ) {
      cells.push({ polygon: [...face.ids], parent: face.parent, shell: face.shell }); continue;
    }
    // A vertical-plane arrangement partitions this one original face. Cells
    // outside the actual polygon retain its plane and original attributes.
    let polygons: number[][] = [[...face.ids]];
    for (let line = 0; line < ring.length; line++) {
      const a = ring[line], b = ring[(line + 1) % ring.length], next: number[][] = [];
      for (const polygon of polygons) {
        const distances = polygon.map(id => signedLine(nodes[id][0], nodes[id][2], a, b));
        if (!distances.some(d => d > EPS) || !distances.some(d => d < -EPS)) { next.push(polygon); continue; }
        const positive: number[] = [], negative: number[] = [];
        for (let i = 0; i < polygon.length; i++) {
          const p = polygon[i], q = polygon[(i + 1) % polygon.length], dp = distances[i], dq = distances[(i + 1) % polygon.length];
          if (dp >= -EPS) positive.push(p); if (dp <= EPS) negative.push(p);
          if ((dp > EPS && dq < -EPS) || (dp < -EPS && dq > EPS)) {
            const t = dp / (dp - dq);
            const id = node(nodes[p].map((v, k) => v + t * (nodes[q][k] - v)) as Point, face.shell);
            positive.push(id); negative.push(id);
          }
        }
        if (positive.length >= 3) next.push(positive); if (negative.length >= 3) next.push(negative);
      }
      polygons = next;
    }
    const hits = polygons.some(p => inside(p.reduce((s, id) => s + nodes[id][0], 0) / p.length,
      p.reduce((s, id) => s + nodes[id][2], 0) / p.length, ring));
    if (!hits) { cells.push({ polygon: [...face.ids], parent: face.parent, shell: face.shell }); continue; }
    intersectedParents++;
    for (const polygon of polygons) {
      cells.push({ polygon, parent: face.parent, shell: face.shell });
      for (const id of polygon) for (let edge = 0; edge < 3; edge++) {
        const a = face.ids[edge], b = face.ids[(edge + 1) % 3];
        if (pointOnEdge(nodes[id], nodes[a], nodes[b]) !== undefined) {
          const ek = edgeKey(face.shell, a, b), list = edgeCuts.get(ek) ?? [];
          if (!list.includes(id)) list.push(id); edgeCuts.set(ek, list);
        }
      }
    }
  }
  let faces: Face[] = [];
  for (const cell of cells) {
    const originalFace = originals[cell.parent], polygon: number[] = [];
    for (let edge = 0; edge < cell.polygon.length; edge++) {
      const a = cell.polygon[edge], b = cell.polygon[(edge + 1) % cell.polygon.length]; polygon.push(a);
      // Original edge intersections must also split the untouched neighbour.
      const additions: { id: number; t: number }[] = [];
      for (let k = 0; k < 3; k++) {
        const oa = originalFace.ids[k], ob = originalFace.ids[(k + 1) % 3];
        for (const id of edgeCuts.get(edgeKey(cell.shell, oa, ob)) ?? []) {
          const t = pointOnEdge(nodes[id], nodes[a], nodes[b]);
          if (t !== undefined && !additions.some(v => v.id === id)) additions.push({ id, t });
        }
      }
      additions.sort((p, q) => p.t - q.t); polygon.push(...additions.map(v => v.id));
    }
    const center = polygon.reduce((sum, id) => sum.map((v, i) => v + nodes[id][i] / polygon.length) as Point, [0, 0, 0] as Point);
    const isInside = inside(center[0], center[2], ring);
    if (polygon.length === 3) faces.push({ ids: polygon as Triangle, parent: cell.parent, shell: cell.shell, inside: isInside });
    else {
      const c = node(center, cell.shell);
      for (let i = 0; i < polygon.length; i++) if (area2(nodes[c], nodes[polygon[i]], nodes[polygon[(i + 1) % polygon.length]]) > 1e-11)
        faces.push({ ids: [c, polygon[i], polygon[(i + 1) % polygon.length]], parent: cell.parent, shell: cell.shell, inside: isInside });
    }
  }
  // Highest ORIGINAL triangle intersection at XZ. Both upper and lower faces
  // may be indexed; the maximum is the unchanged top envelope, including any
  // overlapping independent shoulder. Vertical walls do not define a top.
  const grid = new Map<string, number[]>(), cellSize = 1;
  for (let i = 0; i < originalCount; i++) {
    const points = originals[i].ids.map(id => nodes[id]);
    if (Math.abs(cross(...points as [Point, Point, Point])[1]) < 1e-11) continue;
    for (let x = Math.floor(Math.min(...points.map(p => p[0])) / cellSize); x <= Math.floor(Math.max(...points.map(p => p[0])) / cellSize); x++)
      for (let z = Math.floor(Math.min(...points.map(p => p[2])) / cellSize); z <= Math.floor(Math.max(...points.map(p => p[2])) / cellSize); z++) {
        const id = `${x},${z}`, list = grid.get(id) ?? []; list.push(i); grid.set(id, list);
      }
  }
  const top = (x: number, z: number): number => {
    let highest = -Infinity;
    for (const index of grid.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) ?? []) {
      const [a, b, c] = originals[index].ids.map(id => nodes[id]);
      const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / denominator;
      const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / denominator;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) highest = Math.max(highest, a[1] * u + b[1] * v + c[1] * (1 - u - v));
    }
    if (!Number.isFinite(highest)) throw new RangeError(`No original C top envelope at ${x},${z}`);
    return highest;
  };
  const columnCache = new Map<string, { x: number; z: number; topY: number; deltaY: number }>();
  const sampleCache = new Map<string, ReturnType<ReferenceGroveBankPatch['sample']>>();
  const columnKey = (x: number, z: number): string => `${x.toFixed(8)},${z.toFixed(8)}`;
  const cachedPatch: ReferenceGroveBankPatch = { ...patch, sample: (x, z) => {
    const id = columnKey(x, z), old = sampleCache.get(id);
    if (old) return old;
    const value = patch.sample(x, z); sampleCache.set(id, value); return value;
  } };
  const columnAt = (x: number, z: number) => {
    const id = columnKey(x, z), old = columnCache.get(id);
    if (old) return old;
    const topY = top(x, z), value = { x, z, topY, deltaY: groveBankColumnDelta(cachedPatch, x, z, topY) };
    columnCache.set(id, value); return value;
  };

  const splitFaces = (split: Map<string, number>): void => {
    const next: Face[] = [];
    for (const face of faces) {
      const [a, b, c] = face.ids, ab = split.get(edgeKey(face.shell, a, b)), bc = split.get(edgeKey(face.shell, b, c)), ca = split.get(edgeKey(face.shell, c, a));
      let children: Triangle[];
      if (ab !== undefined && bc !== undefined && ca !== undefined) children = [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]];
      else if (ab !== undefined && bc !== undefined) children = [[b, bc, ab], [a, ab, c], [ab, bc, c]];
      else if (bc !== undefined && ca !== undefined) children = [[c, ca, bc], [b, bc, a], [bc, ca, a]];
      else if (ca !== undefined && ab !== undefined) children = [[a, ab, ca], [c, ca, b], [ca, ab, b]];
      else if (ab !== undefined) children = [[a, ab, c], [ab, b, c]];
      else if (bc !== undefined) children = [[b, bc, a], [bc, c, a]];
      else if (ca !== undefined) children = [[c, ca, b], [ca, a, b]];
      else children = [face.ids];
      next.push(...children.map(ids => ({ ...face, ids })));
    }
    faces = next;
    if (faces.length - originalCount > MAX_ADDED_TRIANGLES) throw new RangeError('Local grove bank patch triangle budget exceeded');
  };
  let refinementPasses = 0, splitEdges = 0;
  for (let pass = 0; pass < 5; pass++) {
    signal?.throwIfAborted();
    const split = new Map<string, number>();
    for (const face of faces) if (face.inside) for (let e = 0; e < 3; e++) {
      const a = face.ids[e], b = face.ids[(e + 1) % 3], p = nodes[a], q = nodes[b], ek = edgeKey(face.shell, a, b);
      if (Math.hypot(p[0] - q[0], p[2] - q[2]) > MAX_EDGE_M && !split.has(ek))
        split.set(ek, node(p.map((v, i) => (v + q[i]) / 2) as Point, face.shell));
    }
    if (!split.size) break;
    splitEdges += split.size; refinementPasses++;
    splitFaces(split);
  }
  if (faces.length - originalCount > MAX_ADDED_TRIANGLES) throw new RangeError('Local grove bank patch triangle budget exceeded');

  const projectedEdgeKey = (shell: number, a: number, b: number): string => {
    const p = columnKey(nodes[a][0], nodes[a][2]), q = columnKey(nodes[b][0], nodes[b][2]);
    return `${shell}:${p < q ? `${p}:${q}` : `${q}:${p}`}`;
  };
  const clearanceToleranceM = .00001;
  // A local affine test recognizes broad target faces without importing any
  // D shape/core coordinates. Non-affine and partial bands keep D's exact
  // sampled displacement; they receive no hard-cap acceptance claim.
  interface ContactProbeResult {
    selected: string[]; maximumResidualM: number; nonAffineMaximumResidualM: number;
    partialMaximumTopAboveTerrainM: number; affineProbes: number; nonAffineProbes: number; partialProbes: number;
  }
  const faceProbeCache = new Map<string, ContactProbeResult>();
  const clearanceEdges = () => {
    const selected = new Set<string>();
    let maximumResidualM = 0, nonAffineMaximumResidualM = 0, partialMaximumTopAboveTerrainM = 0;
    let affineProbes = 0, nonAffineProbes = 0, partialProbes = 0;
    for (const face of faces) {
      if (!face.inside || cross(...face.ids.map(id => nodes[id]) as [Point, Point, Point])[1] <= 1e-11) continue;
      const id = `${face.shell}:${face.ids.join(',')}`;
      let row = faceProbeCache.get(id);
      if (!row) {
        row = { selected: [], maximumResidualM: 0, nonAffineMaximumResidualM: 0,
          partialMaximumTopAboveTerrainM: 0, affineProbes: 0, nonAffineProbes: 0, partialProbes: 0 };
        const points = face.ids.map(id => nodes[id]);
        const cornerY = points.map(p => p[1] + columnAt(p[0], p[2]).deltaY);
        for (const weights of [[.5, .5, 0], [0, .5, .5], [.5, 0, .5], [1 / 3, 1 / 3, 1 / 3]]) {
          const x = points.reduce((sum, p, i) => sum + p[0] * weights[i], 0), z = points.reduce((sum, p, i) => sum + p[2] * weights[i], 0);
          const target = cachedPatch.sample(x, z), predictedY = cornerY.reduce((sum, y, i) => sum + y * weights[i], 0);
          // .18 is a full-weight contact condition only. Partial interpolation
          // remains exactly D's rule, and receives no hard-cap acceptance.
          if (target.weight !== 1) {
            if (target.weight > 0) { row.partialProbes++; row.partialMaximumTopAboveTerrainM = Math.max(row.partialMaximumTopAboveTerrainM, predictedY - target.terrainY); }
            continue;
          }
          const residual = predictedY - (target.terrainY - patch.rockInsetM), h = .01;
          const nx = cachedPatch.sample(x - h, z), px = cachedPatch.sample(x + h, z);
          const nz = cachedPatch.sample(x, z - h), pz = cachedPatch.sample(x, z + h);
          const diagonal = cachedPatch.sample(x + h, z + h);
          if ([nx, px, nz, pz, diagonal].some(sample => sample.weight !== 1)
            || Math.abs(nx.terrainY + px.terrainY - 2 * target.terrainY) > 1e-8
            || Math.abs(nz.terrainY + pz.terrainY - 2 * target.terrainY) > 1e-8
            || Math.abs(diagonal.terrainY - px.terrainY - pz.terrainY + target.terrainY) > 1e-8) {
            row.nonAffineProbes++; row.nonAffineMaximumResidualM = Math.max(row.nonAffineMaximumResidualM, residual); continue;
          }
          row.affineProbes++; row.maximumResidualM = Math.max(row.maximumResidualM, residual);
          if (residual > clearanceToleranceM) for (let edge = 0; edge < 3; edge++)
            row.selected.push(projectedEdgeKey(face.shell, face.ids[edge], face.ids[(edge + 1) % 3]));
        }
        faceProbeCache.set(id, row);
      }
      row.selected.forEach(edge => selected.add(edge));
      maximumResidualM = Math.max(maximumResidualM, row.maximumResidualM);
      nonAffineMaximumResidualM = Math.max(nonAffineMaximumResidualM, row.nonAffineMaximumResidualM);
      partialMaximumTopAboveTerrainM = Math.max(partialMaximumTopAboveTerrainM, row.partialMaximumTopAboveTerrainM);
      affineProbes += row.affineProbes; nonAffineProbes += row.nonAffineProbes; partialProbes += row.partialProbes;
    }
    return { selected, maximumResidualM, nonAffineMaximumResidualM, partialMaximumTopAboveTerrainM, affineProbes, nonAffineProbes, partialProbes };
  };
  let contactRefinementPasses = 0;
  for (let pass = 0; pass < 12; pass++) {
    signal?.throwIfAborted();
    const { selected } = clearanceEdges(); if (!selected.size) break;
    const split = new Map<string, number>();
    // Match projected edges on the original shell's top, bottom and side.
    // Distinct shells are never welded by proximity or this projected key.
    for (const face of faces) for (let edge = 0; edge < 3; edge++) {
      const a = face.ids[edge], b = face.ids[(edge + 1) % 3], ek = edgeKey(face.shell, a, b);
      if (!selected.has(projectedEdgeKey(face.shell, a, b)) || split.has(ek)) continue;
      split.set(ek, node(nodes[a].map((v, i) => (v + nodes[b][i]) / 2) as Point, face.shell));
    }
    splitEdges += split.size; contactRefinementPasses++; splitFaces(split);
  }
  const finalClearance = clearanceEdges();
  if (finalClearance.selected.size) throw new RangeError('Local grove bank affine-contact refinement did not converge');
  const actualMaximumLocalXZEdgeM = Math.max(0, ...faces.filter(face => face.inside).flatMap(face => face.ids.map((id, i) => {
    const a = nodes[id], b = nodes[face.ids[(i + 1) % 3]];
    return Math.hypot(a[0] - b[0], a[2] - b[2]);
  })));
  if (actualMaximumLocalXZEdgeM > MAX_EDGE_M + 1e-6) throw new RangeError('Local grove bank refinement did not converge within five passes');

  const used = new Set(faces.flatMap(face => face.ids)), moved = nodes.map(p => [...p] as Point);
  for (const id of used) {
    signal?.throwIfAborted();
    const p = nodes[id];
    if (!inside(p[0], p[2], ring)) continue;
    const column = columnAt(p[0], p[2]);
    moved[id][1] += column.deltaY;
  }
  signal?.throwIfAborted();
  const attributes = ['position', 'normal', 'uv', 'color'] as const;
  const output = Object.fromEntries(attributes.map(name => [name, [] as number[]])) as Record<typeof attributes[number], number[]>;
  const material = originals.map(face => source.groups.find(g => face.parent * 3 >= g.start && face.parent * 3 < g.start + g.count)?.materialIndex ?? 0);
  const ordered = [...faces.filter(face => material[face.parent] === 0), ...faces.filter(face => material[face.parent] !== 0)];
  const barycentric = (p: Point, parent: number): Point => {
    const [a, b, c] = originals[parent].ids.map(id => nodes[id]);
    const v0 = b.map((v, i) => v - a[i]), v1 = c.map((v, i) => v - a[i]), v2 = p.map((v, i) => v - a[i]);
    const dot = (u: number[], v: number[]) => u.reduce((s, n, i) => s + n * v[i], 0);
    const d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1), d20 = dot(v2, v0), d21 = dot(v2, v1);
    const v = (d11 * d20 - d01 * d21) / (d00 * d11 - d01 * d01), w = (d00 * d21 - d01 * d20) / (d00 * d11 - d01 * d01);
    return [1 - v - w, v, w];
  };
  let movedNodes = 0, untouchedTriangles = 0, maximumDeltaM = 0;
  for (const id of used) if (moved[id][1] !== nodes[id][1]) { movedNodes++; maximumDeltaM = Math.max(maximumDeltaM, nodes[id][1] - moved[id][1]); }
  for (const face of ordered) {
    const changed = face.ids.some(id => moved[id][1] !== nodes[id][1]);
    const exact = face.ids.every((id, k) => id === originals[face.parent].ids[k]) && !changed;
    if (exact) untouchedTriangles++;
    const normal = cross(...face.ids.map(id => moved[id]) as [Point, Point, Point]), length = Math.hypot(...normal);
    if (!Number.isFinite(length) || length < 1e-11) throw new RangeError('Degenerate deformed grove bank face');
    for (let k = 0; k < 3; k++) {
      const id = face.ids[k], p = moved[id], weights = barycentric(nodes[id], face.parent);
      output.position.push(...p);
      for (const name of ['normal', 'uv', 'color'] as const) {
        const attribute = source.getAttribute(name);
        for (let j = 0; j < attribute.itemSize; j++) output[name].push(exact ? attribute.array[(face.parent * 3 + k) * attribute.itemSize + j]
          : weights.reduce((sum, weight, corner) => sum + weight * attribute.array[(face.parent * 3 + corner) * attribute.itemSize + j], 0));
      }
      if (changed) {
        output.normal.splice(output.normal.length - 3, 3, ...normal.map(v => v / length));
        // Metre-based local projection avoids stretching the lowered wall UVs.
        const abs = normal.map(Math.abs);
        const uv = abs[1] >= Math.max(abs[0], abs[2]) ? [p[0] / 3, p[2] / 3]
          : abs[0] > abs[2] ? [p[2] / 3, p[1] / 3] : [p[0] / 3, p[1] / 3];
        output.uv.splice(output.uv.length - 2, 2, ...uv);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  try {
    for (const name of attributes) geometry.setAttribute(name, new THREE.Float32BufferAttribute(output[name], source.getAttribute(name).itemSize));
    const dry = ordered.filter(face => material[face.parent] === 0).length * 3;
    if (dry) geometry.addGroup(0, dry, 0); if (dry < position.count + (faces.length - originalCount) * 3) geometry.addGroup(dry, faces.length * 3 - dry, 1);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const audit = { state: 'ready', acknowledgement: 'same-version local postprocess completed; not art, route or whole-surface clearance acceptance', revision: patch.revision, shapeRevision: patch.shapeRevision, baselineRevision: patch.baselineRevision,
      originalTriangles: originalCount, triangles: faces.length, addedTriangles: faces.length - originalCount, intersectedParents,
      originalNodes: initialNodeCount, refinedNodes: used.size, movedNodes, sampledColumns: columnCache.size, maximumDeltaM,
      refinementPasses, contactRefinementPasses, recognizedAffineProbeMaximumResidualM: finalClearance.maximumResidualM,
      nonAffineFullWeightProbeMaximumTargetExcessM: finalClearance.nonAffineMaximumResidualM,
      partialProbeMaximumTopAboveTerrainM: finalClearance.partialMaximumTopAboveTerrainM,
      contactProbeCounts: { affine: finalClearance.affineProbes, nonAffine: finalClearance.nonAffineProbes, partial: finalClearance.partialProbes },
      clearanceToleranceM, splitEdges, maximumLocalXZEdgeM: actualMaximumLocalXZEdgeM, targetMaximumLocalXZEdgeM: MAX_EDGE_M, maximumAddedTriangles: MAX_ADDED_TRIANGLES,
      untouchedOriginalTriangles: untouchedTriangles, topology: 'independent shell keys; original-face domain partition and conforming local edges',
      topEnvelope: 'highest intersection with immutable original Float32 C triangles',
      normals: 'original normals outside changed faces; deformed local faces use geometric normals',
      uv: 'original/barycentric outside; deformed local faces use world-metre dominant-axis projection at 3m/tile' };
    return { geometry, audit, trace: { original, originalShells: shellByFace, parents: ordered.map(face => face.parent),
      originalNodes: nodes, nodes: moved, faces: ordered.map(face => face.ids), columns: [...columnCache.values()] } };
  } catch (error) { geometry.dispose(); throw error; }
}

/** Read back the actual final Float32 triangles, rather than relabelling the
 * original MVC/outer-foot construction inputs as deformed contact values. */
export function readGroveBankColumn(geometry: THREE.BufferGeometry, x: number, z: number): {
  readonly topY: number; readonly bottomY: number; readonly topFace: number;
} | undefined {
  const positions = geometry.getAttribute('position');
  let topY = -Infinity, bottomY = Infinity, topFace = -1;
  for (let i = 0; i < positions.count; i += 3) {
    const ax = positions.getX(i), ay = positions.getY(i), az = positions.getZ(i);
    const bx = positions.getX(i + 1), by = positions.getY(i + 1), bz = positions.getZ(i + 1);
    const cx = positions.getX(i + 2), cy = positions.getY(i + 2), cz = positions.getZ(i + 2);
    const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(denominator) < 1e-11) continue;
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
    const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
    const y = u * ay + v * by + (1 - u - v) * cy;
    if (y > topY) { topY = y; topFace = i / 3; }
    bottomY = Math.min(bottomY, y);
  }
  return topFace < 0 ? undefined : { topY, bottomY, topFace };
}
