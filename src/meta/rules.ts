import { META_LIMITS, NO_SUPPLY_EFFECT, PLANTS, PLANT_IDS, SUPPLIES, SUPPLY_IDS } from './catalog';
import { createLifeProgress } from './life-catalog';
import type { MetaFailure, MetaProfile, PlantId, PreparedRun, RunSummary, SupplyId } from './types';

export interface RuleResult { applied: boolean; duplicate: boolean; reason?: MetaFailure }
export interface Reward { fragments: number; growth: number; seeds: number }
export const emptyReward = (): Reward => ({ fragments: 0, growth: 0, seeds: 0 });
export const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(id);
export const isPlant = (id: unknown): id is PlantId => PLANT_IDS.includes(id as PlantId);
export const isSupply = (id: unknown): id is SupplyId => SUPPLY_IDS.includes(id as SupplyId);
const result = (applied = false, reason?: MetaFailure, duplicate = false): RuleResult => ({ applied, duplicate, ...(reason ? { reason } : {}) });

export function createProfile(): MetaProfile {
  return { version: 2, fragments: 0, growth: 0, seeds: { olive: 2, laurel: 1, iris: 1 }, produce: { olive: 0, laurel: 0, iris: 0 }, supplies: { 'olive-draught': 0, 'laurel-thread': 0, 'iris-vial': 0 }, packedSupply: null, beds: [null, null, null], discoveries: [], settledRuns: [], preparedRuns: [], life: createLifeProgress() };
}

/** Advance existing crops without an ever-growing counter or wall-clock refresh. */
export function advanceGardenGrowth(profile: MetaProfile, amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0 || amount > META_LIMITS.growth) return;
  if (profile.growth > META_LIMITS.growth - amount) {
    profile.beds = profile.beds.map((bed) => bed ? { ...bed, plantedAt: -Math.min(PLANTS[bed.plant].growth, profile.growth - bed.plantedAt) } : null);
    profile.growth = 0;
  }
  profile.growth += amount;
}

export function settle(profile: MetaProfile, summary: RunSummary): RuleResult & { reward: Reward } {
  const reward = emptyReward();
  if (!summary || !validId(summary.runId) || typeof summary.victory !== 'boolean' || !Number.isInteger(summary.floor) || summary.floor < 1 || summary.floor > 100 || !Number.isInteger(summary.kills) || summary.kills < 0 || summary.kills > 1e7 || !Number.isFinite(summary.elapsedSeconds) || summary.elapsedSeconds < 0 || summary.elapsedSeconds > 1e8) return { ...result(false, 'invalid'), reward };
  if (profile.settledRuns.includes(summary.runId)) return { ...result(false, undefined, true), reward };
  if (profile.settledRuns.length >= META_LIMITS.runs) return { ...result(false, 'capacity'), reward };
  const eligible = summary.elapsedSeconds >= 30 && (summary.kills >= 8 || summary.floor >= 2 || summary.victory);
  profile.settledRuns.push(summary.runId);
  if (eligible) {
    reward.fragments = Math.min(META_LIMITS.fragments - profile.fragments, 1 + Math.min(4, summary.floor - 1) + (summary.victory ? 2 : 0));
    profile.fragments += reward.fragments;
    const growth = 1 + (summary.floor >= 3 ? 1 : 0) + (summary.victory ? 1 : 0);
    advanceGardenGrowth(profile, growth);
    reward.growth = growth;
    const seed = PLANT_IDS[(profile.settledRuns.length - 1) % PLANT_IDS.length];
    reward.seeds = profile.seeds[seed] < META_LIMITS.seeds ? 1 : 0;
    profile.seeds[seed] += reward.seeds;
  }
  return { ...result(true), reward };
}

export function discover(profile: MetaProfile, id: string): RuleResult {
  if (!validId(id)) return result(false, 'invalid');
  if (profile.discoveries.includes(id)) return result(false, undefined, true);
  if (profile.discoveries.length >= META_LIMITS.discoveries) return result(false, 'capacity');
  const seed = PLANT_IDS[profile.discoveries.length % PLANT_IDS.length];
  profile.discoveries.push(id);
  profile.fragments = Math.min(META_LIMITS.fragments, profile.fragments + 1);
  profile.seeds[seed] = Math.min(META_LIMITS.seeds, profile.seeds[seed] + 1);
  return result(true);
}

export function prepare(profile: MetaProfile, runId: string): RuleResult & { prepared: PreparedRun | null } {
  if (!validId(runId)) return { ...result(false, 'invalid'), prepared: null };
  // A completed run may never grant its historical effect to a new character.
  if (profile.settledRuns.includes(runId)) return { ...result(false, 'invalid'), prepared: null };
  const existing = profile.preparedRuns.find((run) => run.runId === runId);
  if (existing) return { ...result(false, undefined, true), prepared: structuredClone(existing) };
  if (profile.preparedRuns.length >= META_LIMITS.runs) return { ...result(false, 'capacity'), prepared: null };
  const supply = profile.packedSupply && profile.supplies[profile.packedSupply] > 0 ? profile.packedSupply : null;
  const prepared: PreparedRun = { runId, supply, effect: { ...(supply ? SUPPLIES[supply].effect : NO_SUPPLY_EFFECT) }, assisted: supply !== null };
  if (supply) { profile.supplies[supply]--; profile.packedSupply = null; }
  profile.preparedRuns.push(prepared);
  return { ...result(true), prepared: structuredClone(prepared) };
}

const validBed = (bed: number) => Number.isInteger(bed) && bed >= 0 && bed < META_LIMITS.beds;
export function plant(profile: MetaProfile, bed: number, id: PlantId): RuleResult {
  if (!validBed(bed) || !isPlant(id)) return result(false, 'invalid');
  if (profile.beds[bed]) return result(false, 'occupied');
  if (profile.seeds[id] < 1) return result(false, 'insufficient');
  profile.seeds[id]--; profile.beds[bed] = { plant: id, plantedAt: profile.growth };
  return result(true);
}
export function harvest(profile: MetaProfile, bed: number): RuleResult {
  if (!validBed(bed)) return result(false, 'invalid');
  const crop = profile.beds[bed];
  if (!crop) return result(false, 'empty');
  if (profile.growth - crop.plantedAt < PLANTS[crop.plant].growth) return result(false, 'not-ready');
  if (profile.produce[crop.plant] >= META_LIMITS.produce) return result(false, 'capacity');
  profile.produce[crop.plant]++; profile.beds[bed] = null;
  return result(true);
}
export function craft(profile: MetaProfile, id: SupplyId): RuleResult {
  if (!isSupply(id)) return result(false, 'invalid');
  const recipe = SUPPLIES[id];
  if (profile.supplies[id] >= META_LIMITS.supplies) return result(false, 'capacity');
  if (profile.produce[recipe.plant] < recipe.cost) return result(false, 'insufficient');
  profile.produce[recipe.plant] -= recipe.cost; profile.supplies[id]++;
  return result(true);
}
export function pack(profile: MetaProfile, id: SupplyId | null): RuleResult {
  if (id !== null && !isSupply(id)) return result(false, 'invalid');
  if (id !== null && profile.supplies[id] < 1) return result(false, 'insufficient');
  if (profile.packedSupply === id) return result(false, undefined, true);
  profile.packedSupply = id;
  return result(true);
}
