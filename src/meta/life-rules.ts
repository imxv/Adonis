import { META_LIMITS } from './catalog';
import { advanceGardenGrowth, validId, type RuleResult } from './rules';
import { COMMISSIONS, COMMISSION_IDS, createFishingAttempt, fishForSeed, LIFE_LIMITS, RECIPES, RECIPE_IDS, RESTORATIONS, RESTORATION_IDS } from './life-catalog';
import type { CommissionId, FishingAttempt, FishingOutcome, FishingReceipt, LifeCost, LifeReward, RecipeId, RestorationId } from './life-catalog';
import type { MetaFailure, MetaProfile, PlantId, SupplyId } from './types';
const result = (applied = false, reason?: MetaFailure, duplicate = false): RuleResult => ({ applied, duplicate, ...(reason ? { reason } : {}) });
export function costFailure(profile: MetaProfile, cost: LifeCost): MetaFailure | undefined {
  if ((cost.fragments ?? 0) > profile.fragments) return 'insufficient';
  for (const [id, amount] of Object.entries(cost.fish ?? {})) if (profile.life.fish[id as keyof typeof profile.life.fish] < amount) return 'insufficient';
  for (const [id, amount] of Object.entries(cost.produce ?? {})) if (profile.produce[id as PlantId] < amount) return 'insufficient';
}
export function rewardFailure(profile: MetaProfile, reward: LifeReward): MetaFailure | undefined {
  if (profile.fragments + (reward.fragments ?? 0) > META_LIMITS.fragments) return 'capacity';
  for (const [id, amount] of Object.entries(reward.seeds ?? {})) if (profile.seeds[id as PlantId] + amount > META_LIMITS.seeds) return 'capacity';
  for (const [id, amount] of Object.entries(reward.supplies ?? {})) if (profile.supplies[id as SupplyId] + amount > META_LIMITS.supplies) return 'capacity';
}
function consume(profile: MetaProfile, cost: LifeCost): void {
  profile.fragments -= cost.fragments ?? 0;
  for (const [id, amount] of Object.entries(cost.fish ?? {})) profile.life.fish[id as keyof typeof profile.life.fish] -= amount;
  for (const [id, amount] of Object.entries(cost.produce ?? {})) profile.produce[id as PlantId] -= amount;
}
function grant(profile: MetaProfile, reward: LifeReward): void {
  profile.fragments += reward.fragments ?? 0;
  for (const [id, amount] of Object.entries(reward.seeds ?? {})) profile.seeds[id as PlantId] += amount;
  for (const [id, amount] of Object.entries(reward.supplies ?? {})) profile.supplies[id as SupplyId] += amount;
  if (reward.growth) advanceGardenGrowth(profile, reward.growth);
}
export function beginFishingRule(profile: MetaProfile): RuleResult & { attempt: FishingAttempt | null } {
  const active = profile.life.fishing.active;
  if (active) return { ...result(false, undefined, true), attempt: structuredClone(active) };
  if (profile.life.fishing.nextSequence > LIFE_LIMITS.fishingAttempts) return { ...result(false, 'capacity'), attempt: null };
  const attempt = createFishingAttempt(profile.life.fishing.nextSequence);
  profile.life.fishing.nextSequence++;
  profile.life.fishing.active = attempt;
  return { ...result(true), attempt: structuredClone(attempt) };
}
export function finishFishingRule(profile: MetaProfile, attemptId: string, outcome: FishingOutcome): RuleResult & { receipt: FishingReceipt | null } {
  if (!validId(attemptId) || !['caught', 'missed', 'cancelled'].includes(outcome)) return { ...result(false, 'invalid'), receipt: null };
  const old = profile.life.fishing.receipts.find(receipt => receipt.attemptId === attemptId);
  if (old) return { ...result(false, undefined, true), receipt: structuredClone(old) };
  const active = profile.life.fishing.active;
  if (!active || active.attemptId !== attemptId) return { ...result(false, 'invalid'), receipt: null };
  const fish = outcome === 'caught' ? fishForSeed(active.seed) : null;
  const capacity = fish !== null && profile.life.fish[fish] >= LIFE_LIMITS.fish;
  const receipt: FishingReceipt = { ...active, outcome, fish, awarded: fish !== null && !capacity ? 1 : 0, growth: fish !== null && !capacity ? 1 : 0, ...(capacity ? { reason: 'capacity' as const } : {}) };
  if (receipt.awarded && fish) { profile.life.fish[fish]++; advanceGardenGrowth(profile, 1); }
  profile.life.fishing.active = null;
  profile.life.fishing.receipts.push(receipt);
  return { ...result(true, capacity ? 'capacity' : undefined), receipt: structuredClone(receipt) };
}
export function cookFailure(profile: MetaProfile, recipeId: RecipeId): MetaFailure | undefined {
  if (!RECIPE_IDS.includes(recipeId)) return 'invalid';
  if (profile.life.cooked.length >= LIFE_LIMITS.cooks) return 'capacity';
  const recipe = RECIPES[recipeId];
  return costFailure(profile, recipe.ingredients) ?? rewardFailure(profile, recipe.reward);
}
export function cookRule(profile: MetaProfile, recipeId: RecipeId, actionId: string): RuleResult & { recipeId: RecipeId | null; actionId: string | null; reward: LifeReward | null } {
  const empty = { recipeId: null, actionId: null, reward: null };
  if (!RECIPE_IDS.includes(recipeId) || !validId(actionId)) return { ...result(false, 'invalid'), ...empty };
  const old = profile.life.cooked.find(receipt => receipt.actionId === actionId);
  if (old) return old.recipeId === recipeId ? { ...result(false, undefined, true), recipeId, actionId, reward: null } : { ...result(false, 'invalid'), ...empty };
  const reason = cookFailure(profile, recipeId);
  if (reason) return { ...result(false, reason), ...empty };
  const recipe = RECIPES[recipeId]; consume(profile, recipe.ingredients); grant(profile, recipe.reward);
  profile.life.cooked.push({ recipeId, actionId });
  return { ...result(true), recipeId, actionId, reward: structuredClone(recipe.reward) };
}
export function commissionFailure(profile: MetaProfile, id: CommissionId): MetaFailure | undefined {
  if (!COMMISSION_IDS.includes(id)) return 'invalid';
  if (profile.life.completedCommissions.includes(id)) return undefined;
  const commission = COMMISSIONS[id];
  return costFailure(profile, commission.cost) ?? rewardFailure(profile, commission.reward);
}
export function deliverRule(profile: MetaProfile, id: CommissionId): RuleResult & { commissionId: CommissionId | null; reward: LifeReward | null } {
  if (!COMMISSION_IDS.includes(id)) return { ...result(false, 'invalid'), commissionId: null, reward: null };
  if (profile.life.completedCommissions.includes(id)) return { ...result(false, undefined, true), commissionId: id, reward: null };
  const reason = commissionFailure(profile, id);
  if (reason) return { ...result(false, reason), commissionId: null, reward: null };
  const commission = COMMISSIONS[id]; consume(profile, commission.cost); grant(profile, commission.reward); profile.life.completedCommissions.push(id);
  return { ...result(true), commissionId: id, reward: structuredClone(commission.reward) };
}
export function restorationFailure(profile: MetaProfile, id: RestorationId): MetaFailure | undefined {
  if (!RESTORATION_IDS.includes(id)) return 'invalid';
  return profile.life.restored.includes(id) ? undefined : costFailure(profile, RESTORATIONS[id].cost);
}
export function restoreRule(profile: MetaProfile, id: RestorationId): RuleResult & { restorationId: RestorationId | null } {
  if (!RESTORATION_IDS.includes(id)) return { ...result(false, 'invalid'), restorationId: null };
  if (profile.life.restored.includes(id)) return { ...result(false, undefined, true), restorationId: id };
  const reason = restorationFailure(profile, id);
  if (reason) return { ...result(false, reason), restorationId: null };
  consume(profile, RESTORATIONS[id].cost); profile.life.restored.push(id);
  return { ...result(true), restorationId: id };
}
