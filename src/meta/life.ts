/** Public life-game contract. All mutations share the existing profile store,
 * writer lock, versioned decoder, atomic draft and observer lifecycle. */
import { applyProfileRule } from './service';
import { beginFishingRule, commissionFailure, cookFailure, cookRule, deliverRule, finishFishingRule, restorationFailure, restoreRule } from './life-rules';
import type { CommissionId, FishingAttempt, FishingOutcome, FishingReceipt, LifeReward, RecipeId, RestorationId } from './life-catalog';
import type { MetaResult, MetaProfile } from './types';
export * from './life-catalog';
export type { MetaProfile, MetaResult, MetaFailure, ProfileState, StorageState } from './types';
export { loadProfile, subscribeProfile } from './service';
export type FishingStartResult = MetaResult & { attempt: FishingAttempt | null };
export type FishingFinishResult = MetaResult & { receipt: FishingReceipt | null };
export type CookResult = MetaResult & { recipeId: RecipeId | null; actionId: string | null; reward: LifeReward | null };
export type CommissionResult = MetaResult & { commissionId: CommissionId | null; reward: LifeReward | null };
export type RestorationResult = MetaResult & { restorationId: RestorationId | null };
const unavailable = () => ({ applied: false, duplicate: false, reason: 'unavailable' as const });
export const beginFishing = (): FishingStartResult => applyProfileRule(beginFishingRule, () => ({ ...unavailable(), attempt: null }));
export const finishFishing = (attemptId: string, outcome: FishingOutcome): FishingFinishResult => applyProfileRule(profile => finishFishingRule(profile, attemptId, outcome), () => ({ ...unavailable(), receipt: null }));
export const cancelFishing = (attemptId: string): FishingFinishResult => finishFishing(attemptId, 'cancelled');
export const cookRecipe = (recipeId: RecipeId, actionId: string): CookResult => applyProfileRule(profile => cookRule(profile, recipeId, actionId), () => ({ ...unavailable(), recipeId: null, actionId: null, reward: null }));
export const deliverCommission = (id: CommissionId): CommissionResult => applyProfileRule(profile => deliverRule(profile, id), () => ({ ...unavailable(), commissionId: null, reward: null }));
export const restoreGallery = (id: RestorationId): RestorationResult => applyProfileRule(profile => restoreRule(profile, id), () => ({ ...unavailable(), restorationId: null }));
export const getRecipeFailure = (profile: MetaProfile, id: RecipeId) => cookFailure(profile, id);
export const getCommissionFailure = (profile: MetaProfile, id: CommissionId) => commissionFailure(profile, id);
export const getRestorationFailure = (profile: MetaProfile, id: RestorationId) => restorationFailure(profile, id);
let localActionSequence = 0;
/** Create once per deliberate cooking click; reuse that ID for the same action.
 * It is an idempotency token, never a reward seed or a system-time refresh. */
export function createLifeActionId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `life.${uuid}` : `life.${Math.random().toString(36).slice(2)}.${++localActionSequence}`;
}
