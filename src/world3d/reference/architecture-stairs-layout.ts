import type { ArchitecturePlacement, ReferenceLayout } from './contracts';
import type { ArchitectureMaterials, ArchitectureMaterialQuality } from './architecture-materials';
import { buildReferenceStairFlight, buildReferenceStairLanding, type StairLowWall, type StairSideExit } from './architecture-stairs';
import { REFERENCE_LANDFORM_REVISION, REFERENCE_STAIR_FLIGHTS, REFERENCE_STAIR_LANDING, REFERENCE_SPRING_BRANCH, REFERENCE_WALK_SURFACE_OFFSET, referenceFlightStepCenter } from './landform-layout';

/** This adapter consumes D's metric authority; it never copies a flight or landing contour. */
export function referenceStairSpecification(placement: ArchitecturePlacement) {
  const flight = REFERENCE_STAIR_FLIGHTS.find(f => f.id === placement.id);
  if (!flight || placement.kind !== 'stairs') return undefined;
  const equal = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-7);
  if (!equal(flight.position, placement.position) || !equal(flight.size, placement.size) || !Number.isFinite(placement.yaw) || !(Math.abs(flight.yaw - placement.yaw) < 1e-7)) return undefined;
  const treadTopY = Array.from({ length: flight.levels }, (_, i) => referenceFlightStepCenter(flight, i)[1] - flight.position[1]);
  const branch = REFERENCE_SPRING_BRANCH.sameStepLocalSideExit;
  // The exit index/depth comes from the published same-step centre, rather than an independent step-eight formula.
  const dx = branch[0][0] - flight.position[0], dz = branch[0][2] - flight.position[2];
  const c = Math.cos(flight.yaw), s = Math.sin(flight.yaw), branchDepth = -(s * dx + c * dz);
  const branchStep = Math.round(branchDepth / flight.runPerStep - .5);
  const sideExit: StairSideExit | undefined = branchStep >= 0 && branchStep < flight.levels
    && Math.abs(referenceFlightStepCenter(flight, branchStep)[1] - branch[0][1]) < 1e-6
    && Math.abs(c * dx - s * dz) < .05
    ? { stepIndex: branchStep, side: 1, openingAlongDepth: 2 * (REFERENCE_STAIR_LANDING.minimumBodyRadius + .10) } : undefined;
  const lowWalls: StairLowWall[] = sideExit
    ? [{ side: 1, fromStep: Math.max(0, branchStep - 2), toStep: Math.min(flight.levels - 1, branchStep + 3), height: .30 },
      { side: -1, fromStep: flight.levels - 7, toStep: flight.levels - 4, height: .34 }]
    : [{ side: -1, fromStep: 3, toStep: Math.min(6, flight.levels - 1), height: .32 }];
  return { flight, treadTopY, sideExit, lowWalls, surfaceOffset: REFERENCE_WALK_SURFACE_OFFSET };
}

export function buildAuthoritativeStairFlight(placement: ArchitecturePlacement, materials: ArchitectureMaterials, quality: ArchitectureMaterialQuality) {
  const spec = referenceStairSpecification(placement);
  if (!spec) return undefined;
  const root = buildReferenceStairFlight({ size: placement.size, treadTopY: spec.treadTopY, surfaceOffset: spec.surfaceOffset, sideExit: spec.sideExit, lowWalls: spec.lowWalls, quality, materials });
  root.userData = { ...root.userData, authority: 'landform-layout.ts', revision: REFERENCE_LANDFORM_REVISION, flightId: placement.id };
  return root;
}

export function buildAuthoritativeStairLanding(layout: ReferenceLayout, materials: ArchitectureMaterials, quality: ArchitectureMaterialQuality) {
  if (!REFERENCE_STAIR_FLIGHTS.every(f => layout.architecture.some(p => p.id === f.id && referenceStairSpecification(p)))) return undefined;
  const root = buildReferenceStairLanding({ polygon: REFERENCE_STAIR_LANDING.outlineXZ, topY: REFERENCE_STAIR_LANDING.level, surfaceOffset: REFERENCE_WALK_SURFACE_OFFSET, thickness: .18, materials, quality });
  root.name = 'sanctuary.steps.landing';
  root.userData = { ...root.userData, authority: 'landform-layout.ts', revision: REFERENCE_LANDFORM_REVISION };
  return root;
}
