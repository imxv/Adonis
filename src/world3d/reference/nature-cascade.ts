import type { ReferenceVec3 } from './contracts';

/** Finished metre frame shared by the two scan LODs. No extra Z compression.
 * Width is the stable calibration basis. Height/depth are the conservative
 * common envelope, refreshed when a scan revision is frozen. */
export const CASCADE_REFERENCE_ENVELOPE: ReferenceVec3 = [13.956301212310791, 8.75, 7.761792540550232];

export const CASCADE_LOCAL_WATER = {
  upper: { start: [.35, 8.72, -1.12], end: [.7, 4.9, .25], width: 2.05 },
  lower: { start: [1.15, 4.85, .58], end: [1.25, .16, 1.69], width: 2.45 },
  ledge: [[.7, 4.9, .25], [.88, 4.88, .4], [1.15, 4.85, .58]],
} as const;

/** Layout can import this pure helper without loading Three.js or asset code. */
export function referenceCascadeScale(targetEnvelope: ReferenceVec3): number {
  return Math.min(...targetEnvelope.map((value, i) => value / CASCADE_REFERENCE_ENVELOPE[i]));
}
