import { COMMISSIONS, COMMISSION_IDS, FISH_IDS, RECIPE_IDS } from './life-catalog';
import { commissionFailure, cookFailure } from './life-rules';
import type { MetaProfile } from './types';

/** The hall's next step, in the only order a new save can walk. Derived from the save; nothing is stored. */
export const LIFE_STEP_IDS = ['plant', 'fish', 'share', 'pack', 'adventure', 'return'] as const;
export type LifeStepId = typeof LIFE_STEP_IDS[number];
export type LifeDestination = 'garden' | 'fishing' | 'kitchen' | 'commissions' | 'adventure';

export const LIFE_STEPS: readonly { id: LifeStepId; label: string; hint: string }[] = [
  { id: 'plant', label: '播种', hint: '去月桂花园播下一颗种子。' },
  { id: 'fish', label: '钓鱼', hint: '去苇影湖钓上第一条鱼。' },
  { id: 'share', label: '下厨', hint: '去厨房做菜，或完成一项居民委托。' },
  { id: 'pack', label: '补给', hint: '装一份补给。行囊空着也能出发。' },
  { id: 'adventure', label: '主线', hint: '走进画中轮回，开始一段冒险。' },
  { id: 'return', label: '回流', hint: '把这一局的收获用回花园。' },
];

export const LIFE_PLACES: Record<LifeDestination, string> = {
  garden: '月桂花园',
  fishing: '湖畔钓鱼',
  kitchen: '归途厨房',
  commissions: '居民委托',
  adventure: '画中轮回',
};

const stocked = (values: Record<string, number>) => Object.values(values).some((amount) => amount > 0);

/** Sowing counts once a crop, its produce, or anything made from that produce is on the save. */
function hasSown(profile: MetaProfile): boolean {
  if (profile.beds.some((bed) => bed !== null)) return true;
  if (stocked(profile.produce) || stocked(profile.supplies) || profile.packedSupply !== null) return true;
  if (profile.life.cooked.length > 0 || profile.life.restored.length > 0) return true;
  if (profile.preparedRuns.some((run) => run.supply !== null)) return true;
  return profile.life.completedCommissions.some((id) => stocked(COMMISSIONS[id].cost.produce ?? {}));
}

function hasKeptFish(profile: MetaProfile): boolean {
  return FISH_IDS.some((id) => profile.life.fish[id] > 0)
    || profile.life.fishing.receipts.some((receipt) => receipt.outcome === 'caught' && receipt.awarded === 1);
}

/** Cooking or a delivered commission. A garden craft alone does not finish this step. */
function hasShared(profile: MetaProfile): boolean {
  return profile.life.cooked.length > 0 || profile.life.completedCommissions.length > 0;
}

/** The lit step. An empty supply slot stops the guide on packing, and does not skip earlier steps. */
export function nextLifeStep(profile: MetaProfile): LifeStepId {
  if (!hasSown(profile)) return 'plant';
  if (!hasKeptFish(profile)) return 'fish';
  if (!hasShared(profile)) return 'share';
  if (profile.packedSupply === null) return 'pack';
  if (profile.settledRuns.length === 0) return 'adventure';
  return 'return';
}

/** Where the lit step's button goes. Kitchen wins when a dish can be cooked; otherwise a commission that can be delivered. */
export function lifeStepDestination(profile: MetaProfile, step: LifeStepId): LifeDestination {
  if (step === 'fish') return 'fishing';
  if (step === 'adventure') return 'adventure';
  if (step !== 'share') return 'garden';
  if (RECIPE_IDS.some((id) => cookFailure(profile, id) === undefined)) return 'kitchen';
  if (COMMISSION_IDS.some((id) => !profile.life.completedCommissions.includes(id) && commissionFailure(profile, id) === undefined)) return 'commissions';
  if (profile.life.fish['silver-sprat'] > 0) return 'commissions';
  return 'kitchen';
}
