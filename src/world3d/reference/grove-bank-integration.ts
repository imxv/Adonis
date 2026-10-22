import type { Object3D } from 'three';
import type { ReferenceGroveBankPatch } from './contracts';
import { REFERENCE_GROVE_BANK_PATCH_CONTRACT_REVISION } from './grove-bank-patch';

/** C advertises support before D supplies a patch. An absent capability must
 * retain the entire legacy D/C pair, even when a candidate was requested.
 */
export interface ReferenceGroveBankFactoryCapability {
  readonly groveBankPatchContractRevision?: string;
}
/** Published on reference-grove-bank-landform.userData.groveBankPatch after
 * the candidate bank has finished its optional local postprocess. This is an
 * identity/processing acknowledgement, not art, route or closure acceptance.
 */
export interface ReferenceGroveBankPatchReady {
  readonly state: 'ready';
  readonly revision: string;
  readonly shapeRevision: string;
  readonly baselineRevision: string;
}
export function referenceGroveBankFactorySupports(
  factory: ReferenceGroveBankFactoryCapability,
  patch: ReferenceGroveBankPatch,
): boolean {
  return patch.revision === REFERENCE_GROVE_BANK_PATCH_CONTRACT_REVISION
    && factory.groveBankPatchContractRevision === patch.revision;
}
export function referenceGroveBankReady(root: Object3D, patch: ReferenceGroveBankPatch): boolean {
  const bank = root.getObjectByName('reference-grove-bank-landform');
  const ready = bank?.userData.groveBankPatch as Partial<ReferenceGroveBankPatchReady> | undefined;
  return ready?.state === 'ready' && ready.revision === patch.revision
    && ready.shapeRevision === patch.shapeRevision && ready.baselineRevision === patch.baselineRevision;
}
