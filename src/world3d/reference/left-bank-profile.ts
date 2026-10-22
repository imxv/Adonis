import type { ReferenceLayout, ReferenceVec3 } from './contracts';

type XZ = readonly [number, number];
interface Bench {
  readonly y: number;
  readonly tilt: XZ;
  readonly center: XZ;
  readonly outline: readonly XZ[];
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function segment(x: number, z: number, a: XZ, b: XZ) {
  const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
  const t = length2 ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / length2, 0, 1) : 0;
  return { distance: Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t), t };
}
/** Positive outside, including the Euclidean distance around polygon corners. */
function signedDistance(x: number, z: number, polygon: readonly XZ[]) {
  let inside = false, distance = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    distance = Math.min(distance, segment(x, z, a, b).distance);
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside ? -distance : distance;
}

export const REFERENCE_LEFT_BANK_DOMAIN = { x: [13, 23], z: [-6, 10] } as const;
const domain = REFERENCE_LEFT_BANK_DOMAIN;
// Only the C outer-ring intersection with this patch, agreed against banks
// SHA 325267b5db00b569dcb1384e514208f923974d008f66c8051a2cb5dea6ca8076.
// This is a contact guard, not C's shape generator. C must refresh the guard
// before changing this footprint; interior and outer callback heights stay exact.
const cProtection: readonly XZ[] = [[13, -6], [18.67211111111111, -6], [18.415, -2.44], [15.1, 3.5], [13, 3.3546153846153848]];
const shoulder: readonly ReferenceVec3[] = [[16.6, 1.55, 3.3], [17.6, 3.15, .3], [18.7, 3.8, -2.1], [20, 4.3, -4.6]];
const benches: readonly Bench[] = [
  { y: .55, tilt: [.025, -.018], center: [21.1, -3.8],
    outline: [[19.8, -5], [22.1, -5], [22.5, -3.3], [21.4, -2.2], [19.6, -2.6], [19, -3.8]] },
  { y: 1.15, tilt: [-.02, .015], center: [16.4, 7.9],
    outline: [[15.8, 6.3], [17.5, 6.2], [17.8, 8.1], [17.3, 9.3], [15, 9.2], [14.7, 8.1]] },
];

/** Replaces only the dry exterior soil profile of the waterfall's left bank.
 * The caller applies the unchanged cascade, bridge, stair and path caps after
 * this function. The closed water/route/C guards return the old value exactly.
 */
export function createReferenceLeftBankProfile(layout: ReferenceLayout) {
  const waters = layout.water.flatMap(w => 'outline' in w && (w.kind === 'pool' || w.kind === 'sea')
    ? [{ id: w.id, level: w.outline[0][1], outline: w.outline.map(p => [p[0], p[2]] as const) }] : []);
  const pool = waters.find(w => w.id === 'water.pool');
  if (!pool) throw new Error('Left-bank profile requires the main-pool contact');
  const routes = layout.paths.flatMap(path => path.points.slice(1).map((b, i) => ({
    a: [path.points[i][0], path.points[i][2]] as const, b: [b[0], b[2]] as const,
    // .65m includes the existing narrow bearing fade beyond the nominal road.
    keepRadius: path.id === 'walk.mural' ? 1.7 : path.width / 2 + .65,
  })));
  function mask(x: number, z: number, inwardMargin = 0) {
    const west = x - domain.x[0] - inwardMargin, east = domain.x[1] - x - inwardMargin;
    const north = z - domain.z[0] - inwardMargin, southEdge = domain.z[1] - z - inwardMargin;
    const edge = Math.min(west, east, north, southEdge);
    if (edge <= 0) return 0;
    const cDistance = signedDistance(x, z, cProtection);
    if (cDistance <= .2 + inwardMargin + 1e-8) return 0;
    const south = smooth(0, 3, z);
    const routeFade = mix(3.5, 2, south), cFadeEnd = mix(3, 1.7, south);
    let routeWeight = 1;
    for (const route of routes) {
      const d = segment(x, z, route.a, route.b).distance;
      const keepRadius = route.keepRadius + inwardMargin;
      if (d <= keepRadius + 1e-8) return 0;
      // The northern join keeps the broad first-pass feathers. Only the
      // southern shoulder/bench meets the unchanged mural wing across 2m.
      routeWeight = Math.min(routeWeight, smooth(keepRadius, keepRadius + routeFade, d));
    }
    let waterWeight = 1;
    for (const water of waters) {
      const d = signedDistance(x, z, water.outline);
      if (d <= inwardMargin + 1e-8) return 0;
      waterWeight = Math.min(waterWeight, smooth(inwardMargin, inwardMargin + .5, d));
    }
    // North/west/east remain broad; a separate southern return leaves room
    // for one low bench before the unchanged z=10 soil. Visible mesh may use
    // an inward margin without changing the public terrain callback's mask.
    const patchWeight = smooth(0, 3, Math.min(west, east, north)) * smooth(0, 1.5, southEdge);
    return patchWeight * smooth(.2 + inwardMargin, cFadeEnd + inwardMargin, cDistance) * routeWeight * waterWeight;
  }
  function localAbsoluteProfile(x: number, z: number) {
    let distance = Infinity, crest = 0;
    for (let i = 1; i < shoulder.length; i++) {
      const a = shoulder[i - 1], b = shoulder[i];
      const at = segment(x, z, [a[0], a[2]], [b[0], b[2]]);
      if (at.distance < distance) { distance = at.distance; crest = mix(a[1], b[1], at.t); }
    }
    // One 2m-wide crest, a 2m face and exactly two staggered planar bites.
    let target = mix(.28, crest, 1 - smooth(1, 3, distance));
    for (const bench of benches) {
      const d = signedDistance(x, z, bench.outline), weight = 1 - smooth(0, 1.5, Math.max(0, d));
      const planeY = bench.y + (x - bench.center[0]) * bench.tilt[0] + (z - bench.center[1]) * bench.tilt[1];
      target = mix(target, planeY, weight);
    }
    // Keep the existing main-pool shore grade through .9m, releasing by 2.4m.
    const d = signedDistance(x, z, pool!.outline), gradeWeight = 1 - smooth(.9, 2.4, d);
    const gradeCeiling = pool!.level - .45 + Math.max(0, d) * 1.2;
    return mix(target, Math.min(target, gradeCeiling), gradeWeight);
  }
  return {
    apply(x: number, z: number, oldPhysicalBaseY: number, inwardMargin = 0) {
      const weight = mask(x, z, inwardMargin);
      return weight === 0 ? oldPhysicalBaseY : mix(oldPhysicalBaseY, localAbsoluteProfile(x, z), weight);
    },
    mask,
  };
}
