import * as THREE from 'three';
import type { ArchitecturePlacement, ReferenceLayout, ReferenceVec3 } from './contracts';
import type { ArchitectureMaterials, ArchitectureMaterialQuality } from './architecture-materials';
import { buildReferenceSpringShrine, type ReferenceSpringShrineOptions } from './architecture-spring-shrine';
import { REFERENCE_SPRING_SHRINE } from './landform-layout';

/** Design dimensions live here; carrier, source, allowed region and frame come only from D. */
export function referenceSpringShrineSpecification(): Omit<ReferenceSpringShrineOptions, 'quality' | 'materials'> {
  const { frame, spout, access, placement } = REFERENCE_SPRING_SHRINE;
  const c = Math.cos(frame.yaw), s = Math.sin(frame.yaw);
  const supportPolygon = frame.supportPolygon.map(([x, y, z]) => {
    if (Math.abs(y - frame.origin[1]) > 1e-7) throw new Error('Spring shrine requires a level authoritative support polygon');
    const dx = x - frame.origin[0], dz = z - frame.origin[2];
    return [c * dx - s * dz, s * dx + c * dz] as const;
  });
  const [left, right] = frame.localRange.x, [rear, front] = access.facadeLocalZRange;
  return {
    supportPolygon,
    occupiablePolygon: [[left, rear], [right, rear], [right, front], [left, front]],
    body: { centerX: (left + right) / 2, width: frame.width - .08, height: placement.size[1], rearZ: spout.local[2] - .65, frontZ: spout.local[2] - .22 },
    spout: { position: spout.local, direction: spout.localDirection, width: spout.mouthWidth, length: .15, wallThickness: .022 },
  };
}

export function buildAuthoritativeSpringShrine(placement: ArchitecturePlacement, layout: ReferenceLayout, materials: ArchitectureMaterials, quality: ArchitectureMaterialQuality): { root: THREE.Group; worldSpout: ReferenceVec3 } | undefined {
  const a = REFERENCE_SPRING_SHRINE, expected = a.placement;
  const equal = (x: readonly number[], y: readonly number[]) => x.length === y.length && x.every((v, i) => Number.isFinite(v) && Math.abs(v - y[i]) < 1e-7);
  if (placement.id !== expected.id || placement.kind !== 'spring-shrine' || !equal(placement.position, expected.position) || !equal(placement.size, expected.size) || !Number.isFinite(placement.yaw) || !(Math.abs(placement.yaw - expected.yaw) < 1e-7)) return undefined;
  const source = layout.water.find(w => w.id === 'water.sacred-spring');
  if (source?.kind !== 'stream' || !source.points[0] || !equal(source.points[0], a.spout.world)) return undefined;
  const root = buildReferenceSpringShrine({ ...referenceSpringShrineSpecification(), quality, materials });
  root.position.fromArray(a.frame.origin); root.rotation.y = a.frame.yaw;
  root.userData = { ...root.userData, assemblyAuthority: 'landform-layout.ts/REFERENCE_SPRING_SHRINE', worldTransformApplied: 1, frameOrigin: [...a.frame.origin], frameYaw: a.frame.yaw, worldSpout: [...a.spout.world], worldDirection: [...a.spout.worldDirection], rearClearLength: a.access.rearClearLength };
  // Return the exact water source tuple; geometry transforms to this point to numerical tolerance.
  return { root, worldSpout: source.points[0] };
}
