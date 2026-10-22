import { META_LIMITS, NO_SUPPLY_EFFECT, PLANTS, PLANT_IDS, SUPPLIES, SUPPLY_IDS } from './catalog';
import { createProfile, isPlant, isSupply, validId } from './rules';
import type { MetaProfile, PreparedRun } from './types';
import { COMMISSION_IDS, FISH_IDS, LIFE_LIMITS, RECIPE_IDS, RESTORATION_IDS, createFishingAttempt, createLifeProgress, fishForSeed, type LifeProgress } from './life-catalog';

export type DecodeResult = { profile: MetaProfile; status: 'ok' | 'migrated' | 'recovered' | 'unsupported' };
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const number = (v: unknown, cap: number, fallback = 0) => typeof v === 'number' && Number.isFinite(v) ? Math.min(cap, Math.max(0, Math.floor(v))) : fallback;
function ids(value: unknown, limit: number): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > limit || value.some((id) => !validId(id))) return null;
  return [...new Set(value)];
}

const integer = (value: unknown, cap: number, floor = 0): value is number => typeof value === 'number' && Number.isInteger(value) && value >= floor && value <= cap;
const keysExactly = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
function catalogIds<T extends string>(value: unknown, catalog: readonly T[]): T[] | null {
  if (!Array.isArray(value) || value.length > catalog.length || value.some((id) => !catalog.includes(id)) || new Set(value).size !== value.length) return null;
  return [...value];
}

/** Never truncate a life receipt ledger: discarded IDs could become payable again. */
function decodeLife(input: unknown): LifeProgress | null {
  if (!object(input) || !keysExactly(input, ['fish', 'fishing', 'cooked', 'completedCommissions', 'restored']) || !object(input.fish) || !keysExactly(input.fish, FISH_IDS)) return null;
  const life = createLifeProgress();
  for (const id of FISH_IDS) {
    if (!integer(input.fish[id], LIFE_LIMITS.fish)) return null;
    life.fish[id] = input.fish[id];
  }
  const completed = catalogIds(input.completedCommissions, COMMISSION_IDS);
  const restored = catalogIds(input.restored, RESTORATION_IDS);
  if (!completed || !restored) return null;
  life.completedCommissions = completed;
  life.restored = restored;
  if (!Array.isArray(input.cooked) || input.cooked.length > LIFE_LIMITS.cooks) return null;
  const cookedIds = new Set<string>();
  for (const value of input.cooked) {
    if (!object(value) || !keysExactly(value, ['actionId', 'recipeId']) || !validId(value.actionId) || cookedIds.has(value.actionId) || !RECIPE_IDS.includes(value.recipeId as typeof RECIPE_IDS[number])) return null;
    cookedIds.add(value.actionId);
    life.cooked.push({ actionId: value.actionId, recipeId: value.recipeId as typeof RECIPE_IDS[number] });
  }
  const fishing = input.fishing;
  if (!object(fishing) || !keysExactly(fishing, ['nextSequence', 'active', 'receipts']) || !Array.isArray(fishing.receipts) || fishing.receipts.length > LIFE_LIMITS.fishingAttempts) return null;
  const firstSequence = life.fishing.nextSequence;
  const count = fishing.receipts.length + (fishing.active === null ? 0 : 1);
  if (count > LIFE_LIMITS.fishingAttempts || fishing.nextSequence !== firstSequence + count) return null;
  life.fishing.nextSequence = firstSequence + count;
  for (const [index, value] of fishing.receipts.entries()) {
    if (!object(value)) return null;
    const attempt = createFishingAttempt(firstSequence + index);
    if (value.attemptId !== attempt.attemptId || value.sequence !== attempt.sequence || value.seed !== attempt.seed) return null;
    if (value.outcome !== 'caught' && value.outcome !== 'missed' && value.outcome !== 'cancelled') return null;
    // Award combinations are constrained further below; no receipt may carry extra state.
    const receiptKeys = ['attemptId', 'sequence', 'seed', 'outcome', 'fish', 'awarded', 'growth'];
    if (value.reason !== undefined) receiptKeys.push('reason');
    if (!keysExactly(value, receiptKeys) || (value.awarded !== 0 && value.awarded !== 1) || (value.growth !== 0 && value.growth !== 1) || (value.reason !== undefined && value.reason !== 'capacity')) return null;
    if (value.outcome === 'caught') {
      if (value.fish !== fishForSeed(attempt.seed) || (value.awarded === 0 ? value.growth !== 0 || value.reason !== 'capacity' : value.growth !== 1 || value.reason !== undefined)) return null;
    } else if (value.fish !== null || value.awarded !== 0 || value.growth !== 0 || value.reason !== undefined) return null;
    life.fishing.receipts.push({ ...attempt, outcome: value.outcome, fish: value.fish as LifeProgress['fishing']['receipts'][number]['fish'], awarded: value.awarded, growth: value.growth, ...(value.reason ? { reason: value.reason } : {}) });
  }
  if (fishing.active !== null) {
    const value = fishing.active;
    const attempt = createFishingAttempt(firstSequence + fishing.receipts.length);
    if (!object(value) || !keysExactly(value, ['attemptId', 'sequence', 'seed']) || value.attemptId !== attempt.attemptId || value.sequence !== attempt.sequence || value.seed !== attempt.seed) return null;
    life.fishing.active = attempt;
  }
  return life;
}

/** Persisted data cannot inject unknown effects, negative stock, or extra beds. */
export function decodeProfile(input: unknown): DecodeResult {
  if (!object(input) || (input.version !== 2 && input.version !== 1 && input.version !== 0)) return { profile: createProfile(), status: object(input) && typeof input.version === 'number' && input.version > 2 ? 'unsupported' : 'recovered' };
  const profile = createProfile();
  // Only the explicit v0 migration may lack receipt collections.
  if (input.version !== 0 && ['settledRuns', 'discoveries', 'preparedRuns'].some((key) => !Array.isArray(input[key]))) return { profile, status: 'unsupported' };
  const settled = ids(input.settledRuns, META_LIMITS.runs);
  const discoveries = ids(input.discoveries, META_LIMITS.discoveries);
  if (!settled || !discoveries || (input.preparedRuns !== undefined && (!Array.isArray(input.preparedRuns) || input.preparedRuns.length > META_LIMITS.runs))) return { profile, status: 'unsupported' };
  profile.settledRuns = settled; profile.discoveries = discoveries;
  profile.fragments = number(input.fragments, META_LIMITS.fragments);
  profile.growth = number(input.growth, META_LIMITS.growth);
  for (const field of ['seeds', 'produce', 'supplies'] as const) {
    const values = input[field];
    for (const id of field === 'supplies' ? SUPPLY_IDS : PLANT_IDS) {
      const fallback = input.version === 0 && field === 'seeds' && values === undefined ? profile.seeds[id as keyof typeof profile.seeds] : 0;
      (profile[field] as Record<string, number>)[id] = number(object(values) ? values[id] : undefined, META_LIMITS[field], fallback);
    }
  }
  profile.packedSupply = isSupply(input.packedSupply) && profile.supplies[input.packedSupply] > 0 ? input.packedSupply : null;
  const beds = Array.isArray(input.beds) ? input.beds : [];
  profile.beds = Array.from({ length: META_LIMITS.beds }, (_, index) => {
    const bed = beds[index];
    if (!object(bed) || !isPlant(bed.plant) || typeof bed.plantedAt !== 'number' || !Number.isFinite(bed.plantedAt)) return null;
    return { plant: bed.plant, plantedAt: Math.max(-PLANTS[bed.plant].growth, Math.min(profile.growth, Math.floor(bed.plantedAt))) };
  });
  const receipts = (input.preparedRuns ?? []) as unknown[];
  const seen = new Set<string>();
  for (const value of receipts) {
    if (!object(value) || !validId(value.runId) || (value.supply !== null && !isSupply(value.supply))) return { profile: createProfile(), status: 'unsupported' };
    if (seen.has(value.runId)) continue;
    seen.add(value.runId);
    const supply = value.supply as PreparedRun['supply'];
    profile.preparedRuns.push({ runId: value.runId, supply, assisted: supply !== null, effect: { ...(supply ? SUPPLIES[supply].effect : NO_SUPPLY_EFFECT) } });
  }
  if (input.version === 2) {
    const life = decodeLife(input.life);
    if (!life) return { profile: createProfile(), status: 'unsupported' };
    profile.life = life;
  }
  return { profile, status: input.version === 2 ? 'ok' : 'migrated' };
}
