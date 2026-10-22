import type { ReferenceGroveBankPatch } from './contracts';

/** Shape-independent capability gate; candidate shape/baseline IDs stay separate. */
export const REFERENCE_GROVE_BANK_PATCH_CONTRACT_REVISION = 'r5-grove-bank-patch-contract-1' as const;

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

/** One displacement for an ORIGINAL same-XZ C column. Apply the returned delta
 * once to its original top, bottom and side/shared-edge vertices. T0 must come
 * from the undeformed top envelope, never from already-patched positions.
 *
 * The patch sample owns every protection/domain weight. Do not multiply a
 * second fade or replace C's original MVC/foundation callback with its target.
 * At full weight newTop=min(T0, terrainY-inset); at partial weight the old top
 * remains in that interpolation. Undefined preserves all old behavior without
 * sampling any callback. This helper has no C runtime or shape dependencies.
 */
export function groveBankColumnDelta(
  patch: ReferenceGroveBankPatch | undefined,
  x: number,
  z: number,
  oldColumnTopY: number,
): number {
  if (patch === undefined) return 0;
  finite(x, 'column x');
  finite(z, 'column z');
  const { terrainY, weight } = patch.sample(x, z);
  finite(terrainY, 'sample terrain Y');
  finite(weight, 'sample rock weight');
  if (weight < 0 || weight > 1) throw new RangeError('sample rock weight outside [0,1]');
  if (weight === 0) return 0;
  finite(oldColumnTopY, 'original C column top Y');
  const inset = finite(patch.rockInsetM, 'rock inset');
  if (inset < 0) throw new RangeError('rock inset must be non-negative');
  return Math.min(0, terrainY - inset - oldColumnTopY) * weight;
}
