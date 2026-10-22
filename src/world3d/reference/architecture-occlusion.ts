import * as THREE from 'three';

type Occluder = { min: readonly [number, number, number]; max: readonly [number, number, number] };

const SAMPLE_COUNT = 32;
const MAX_DISTANCE = 15;
const NORMAL_OFFSET = .04;
const samples = Array.from({ length: SAMPLE_COUNT }, (_, i) => {
  const r = Math.sqrt((i + .5) / SAMPLE_COUNT), angle = i * Math.PI * (3 - Math.sqrt(5));
  return [r * Math.cos(angle), r * Math.sin(angle), Math.sqrt(1 - r * r)] as const;
});

/** Slab intersection in root-local metres. A containing solid is the surface's own proxy. */
function hitDistance(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, box: Occluder): number {
  const { min, max } = box;
  if (ox > min[0] - .001 && ox < max[0] + .001 && oy > min[1] - .001 && oy < max[1] + .001 && oz > min[2] - .001 && oz < max[2] + .001) return Infinity;
  let near = .005, far = MAX_DISTANCE;
  for (let axis = 0; axis < 3; axis++) {
    const direction = axis === 0 ? dx : axis === 1 ? dy : dz, origin = axis === 0 ? ox : axis === 1 ? oy : oz;
    if (Math.abs(direction) < 1e-8) {
      if (origin < min[axis] || origin > max[axis]) return Infinity;
    } else {
      const a = (min[axis] - origin) / direction, b = (max[axis] - origin) / direction;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (far < near) return Infinity;
    }
  }
  return near;
}

/** Two local Jacobi passes, preserving disconnected masonry, hard corners and long edges. */
function smoothOcclusion(index: THREE.BufferAttribute, positions: Float32Array, normals: Float32Array, values: Float32Array): void {
  const count = values.length, edges = new Float64Array(index.count);
  let edgeCount = 0;
  const addEdge = (a: number, b: number): void => {
    if (a === b) return;
    const ai = a * 3, bi = b * 3;
    const dx = positions[ai] - positions[bi], dy = positions[ai + 1] - positions[bi + 1], dz = positions[ai + 2] - positions[bi + 2];
    const dot = normals[ai] * normals[bi] + normals[ai + 1] * normals[bi + 1] + normals[ai + 2] * normals[bi + 2];
    if (dx * dx + dy * dy + dz * dz < .65 * .65 && dot > .75) edges[edgeCount++] = Math.min(a, b) * count + Math.max(a, b);
  };
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
  }
  // Compact unique undirected edges; shared triangle edges count only once in a neighbour mean.
  const sorted = edges.subarray(0, edgeCount).sort();
  let uniqueCount = 0, previous = -1;
  for (const edge of sorted) if (edge !== previous) { sorted[uniqueCount++] = edge; previous = edge; }
  const sums = new Float32Array(count), degrees = new Uint32Array(count), next = new Float32Array(count);
  for (let i = 0; i < uniqueCount; i++) {
    const a = Math.floor(sorted[i] / count), b = sorted[i] - a * count;
    degrees[a]++; degrees[b]++;
  }
  for (let round = 0; round < 2; round++) {
    sums.fill(0);
    for (let i = 0; i < uniqueCount; i++) {
      const a = Math.floor(sorted[i] / count), b = sorted[i] - a * count;
      sums[a] += values[b]; sums[b] += values[a];
    }
    for (let i = 0; i < count; i++) next[i] = degrees[i] ? values[i] / 3 + sums[i] / degrees[i] * (2 / 3) : values[i];
    values.set(next);
  }
}

/**
 * Bake static structural visibility, independent of sunlight and albedo.
 * Boxes describe actual wall/ceiling solids in root-local metres, never room envelopes.
 * Intended for ordinary static architecture meshes; instancing/skinning is not sampled.
 */
export function bakeArchitectureOcclusion(root: THREE.Group, boxes: readonly Occluder[]): void {
  const cache = new Map<string, number>();
  const position = new THREE.Vector3(), normal = new THREE.Vector3();
  const rootInverse = new THREE.Matrix4(), transform = new THREE.Matrix4(), normalTransform = new THREE.Matrix3();
  const usedGeometry = new Set<THREE.BufferGeometry>();
  root.updateWorldMatrix(true, true); rootInverse.copy(root.matrixWorld).invert();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || object instanceof THREE.SkinnedMesh) return;
    // Different mesh transforms need different visibility even when source geometry is shared.
    if (usedGeometry.has(object.geometry)) object.geometry = object.geometry.clone();
    const geometry = object.geometry; usedGeometry.add(geometry);
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    if (!positions) return;
    const values = new Float32Array(positions.count);
    if (normals && boxes.length) {
      transform.multiplyMatrices(rootInverse, object.matrixWorld); normalTransform.getNormalMatrix(transform);
      const smoothPositions = geometry.index ? new Float32Array(positions.count * 3) : null;
      const smoothNormals = geometry.index ? new Float32Array(positions.count * 3) : null;
      for (let i = 0; i < positions.count; i++) {
        position.fromBufferAttribute(positions, i).applyMatrix4(transform);
        normal.fromBufferAttribute(normals, i).applyMatrix3(normalTransform).normalize();
        if (smoothPositions && smoothNormals) {
          position.toArray(smoothPositions, i * 3); normal.toArray(smoothNormals, i * 3);
        }
        if (!Number.isFinite(position.x + position.y + position.z + normal.x + normal.y + normal.z) || normal.lengthSq() < .5) continue;
        // 5 cm / approximately 2 degree bins share repeated masonry vertices without large seams.
        const key = `${Math.round(position.x * 20)},${Math.round(position.y * 20)},${Math.round(position.z * 20)}:${Math.round(normal.x * 32)},${Math.round(normal.y * 32)},${Math.round(normal.z * 32)}`;
        let occlusion = cache.get(key);
        if (occlusion === undefined) {
          const nx = normal.x, ny = normal.y, nz = normal.z;
          // Frisvad's orthonormal basis keeps every sample in the outward normal hemisphere.
          const sign = nz >= 0 ? 1 : -1, a = -1 / (sign + nz), b = nx * ny * a;
          const tx = 1 + sign * nx * nx * a, ty = sign * b, tz = -sign * nx;
          const bx = b, by = sign + ny * ny * a, bz = -ny;
          const ox = position.x + nx * NORMAL_OFFSET, oy = position.y + ny * NORMAL_OFFSET, oz = position.z + nz * NORMAL_OFFSET;
          let blocked = 0;
          for (const [sx, sy, sz] of samples) {
            const dx = tx * sx + bx * sy + nx * sz, dy = ty * sx + by * sy + ny * sz, dz = tz * sx + bz * sy + nz * sz;
            let nearest = Infinity;
            for (const box of boxes) nearest = Math.min(nearest, hitDistance(ox, oy, oz, dx, dy, dz, box));
            // Fade only the final 3 metres, avoiding a hard cutoff through a large portico.
            if (nearest < MAX_DISTANCE) blocked += Math.min(1, (MAX_DISTANCE - nearest) / 3);
          }
          occlusion = .9 * blocked / SAMPLE_COUNT; cache.set(key, occlusion);
        }
        values[i] = occlusion;
      }
      if (geometry.index && smoothPositions && smoothNormals) smoothOcclusion(geometry.index, smoothPositions, smoothNormals, values);
    }
    const existing = geometry.getAttribute('architectureOcclusion');
    if (existing instanceof THREE.BufferAttribute && existing.itemSize === 1 && existing.count === values.length) {
      existing.array.set(values); existing.needsUpdate = true;
    } else geometry.setAttribute('architectureOcclusion', new THREE.BufferAttribute(values, 1));
  });
  cache.clear(); usedGeometry.clear();
}

const patchedMaterials = new WeakSet<THREE.MeshStandardMaterial>();

/** WebGLRenderer hook: only indirect light is attenuated, after the authored AO map. */
export function applyArchitectureOcclusion(material: THREE.MeshStandardMaterial): void {
  if (patchedMaterials.has(material)) return;
  patchedMaterials.add(material);
  const previousCompile = material.onBeforeCompile, previousCacheKey = material.customProgramCacheKey;
  // WebGLBindingStates reads these defaults for absent attributes, including Standard materials.
  // Setting an explicit generic vertex attribute prevents values leaking from a preceding draw.
  const withDefaults = material as THREE.MeshStandardMaterial & { defaultAttributeValues?: Record<string, number[]> };
  withDefaults.defaultAttributeValues = { ...withDefaults.defaultAttributeValues, architectureOcclusion: [0],architectureWear:[0] };
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float architectureOcclusion;\nattribute float architectureWear;\nvarying float vArchitectureOcclusion;\nvarying float vArchitectureWear;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvArchitectureOcclusion = architectureOcclusion;\nvArchitectureWear=architectureWear;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vArchitectureOcclusion;\nvarying float vArchitectureWear;')
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+vArchitectureWear,0.12,0.98);')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
float architectureVisibility = 1.0 - clamp(vArchitectureOcclusion, 0.0, 0.9);
reflectedLight.indirectDiffuse *= architectureVisibility;
reflectedLight.indirectSpecular *= architectureVisibility;
#ifdef USE_CLEARCOAT
  clearcoatSpecularIndirect *= architectureVisibility;
#endif
#ifdef USE_SHEEN
  sheenSpecularIndirect *= architectureVisibility;
#endif`);
  };
  material.customProgramCacheKey = function () {
    const prior = previousCacheKey === THREE.Material.prototype.customProgramCacheKey ? previousCompile.toString() : previousCacheKey.call(this);
    return `${prior}|architecture-occlusion-v2-surface-wear`;
  };
  material.needsUpdate = true;
}
