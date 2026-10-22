import type { PlantId, SupplyId } from './types';

export const FISH_IDS = ['silver-sprat', 'reef-bream', 'golden-mullet'] as const;
export type FishId = typeof FISH_IDS[number];
export const RECIPE_IDS = ['olive-skewer', 'laurel-broth', 'iris-stew'] as const;
export type RecipeId = typeof RECIPE_IDS[number];
export const NPC_IDS = ['nereus', 'daphne'] as const;
export type NpcId = typeof NPC_IDS[number];
export const COMMISSION_IDS = ['first-catch', 'garden-table', 'blue-keepsake'] as const;
export type CommissionId = typeof COMMISSION_IDS[number];
export const RESTORATION_IDS = ['harbor-mosaic'] as const;
export type RestorationId = typeof RESTORATION_IDS[number];
export const LIFE_LIMITS = { fish: 9, fishingAttempts: 4096, cooks: 512 } as const;
export type FishingOutcome = 'caught' | 'missed' | 'cancelled';
export interface FishingAttempt { attemptId: string; sequence: number; seed: number }
export interface FishingReceipt extends FishingAttempt {
  outcome: FishingOutcome;
  fish: FishId | null;
  awarded: 0 | 1;
  growth: 0 | 1;
  reason?: 'capacity';
}
export interface LifeProgress {
  fish: Record<FishId, number>;
  fishing: { nextSequence: number; active: FishingAttempt | null; receipts: FishingReceipt[] };
  cooked: { actionId: string; recipeId: RecipeId }[];
  completedCommissions: CommissionId[];
  restored: RestorationId[];
}
export interface LifeCost {
  fish?: Partial<Record<FishId, number>>;
  produce?: Partial<Record<PlantId, number>>;
  fragments?: number;
}
export interface LifeReward {
  seeds?: Partial<Record<PlantId, number>>;
  supplies?: Partial<Record<SupplyId, number>>;
  fragments?: number;
  growth?: number;
}
export interface RecipeDefinition { id: RecipeId; name: string; description: string; ingredients: LifeCost; reward: LifeReward }
export interface CommissionDefinition { id: CommissionId; npc: NpcId; title: string; request: string; cost: LifeCost; reward: LifeReward }
export interface RestorationDefinition { id: RestorationId; name: string; description: string; cost: LifeCost }
export const FISH: Record<FishId, { id: FishId; name: string; description: string; color: string }> = {
  'silver-sprat': { id: 'silver-sprat', name: '银鳞沙丁', description: '适合橄榄烤串，也是涅柔斯最熟悉的海味。', color: '#a9cad8' },
  'reef-bream': { id: 'reef-bream', name: '珊纹鲷', description: '配一片月桂，便是一碗归航热汤。', color: '#dcaa91' },
  'golden-mullet': { id: 'golden-mullet', name: '金尾鲻', description: '与星蓝鸢尾一起慢煮，留下淡淡花香。', color: '#d5be78' },
};
export const RECIPES: Record<RecipeId, RecipeDefinition> = {
  'olive-skewer': { id: 'olive-skewer', name: '海风橄榄串', description: '做成一份橄榄露，留下果核再播种。', ingredients: { fish: { 'silver-sprat': 1 }, produce: { olive: 1 } }, reward: { supplies: { 'olive-draught': 1 }, seeds: { olive: 1 } } },
  'laurel-broth': { id: 'laurel-broth', name: '月桂归航汤', description: '做成一份月桂结，并留下一枚月桂种子。', ingredients: { fish: { 'reef-bream': 1 }, produce: { laurel: 1 } }, reward: { supplies: { 'laurel-thread': 1 }, seeds: { laurel: 1 } } },
  'iris-stew': { id: 'iris-stew', name: '星蓝花香煮', description: '做成一份鸢尾香，并留下一枚鸢尾种子。', ingredients: { fish: { 'golden-mullet': 1 }, produce: { iris: 1 } }, reward: { supplies: { 'iris-vial': 1 }, seeds: { iris: 1 } } },
};
export const NPCS: Record<NpcId, { id: NpcId; name: string; role: string; greeting: string }> = {
  nereus: { id: 'nereus', name: '涅柔斯', role: '港边渔夫', greeting: '海风带来的收获，总要分一点给归来的人。' },
  daphne: { id: 'daphne', name: '达芙妮', role: '花园照料者', greeting: '把今日的海味和花园收获，变成明日的种子吧。' },
};
export const COMMISSIONS: Record<CommissionId, CommissionDefinition> = {
  'first-catch': { id: 'first-catch', npc: 'nereus', title: '第一份海味', request: '给归港的船员留一尾银鳞沙丁。', cost: { fish: { 'silver-sprat': 1 } }, reward: { fragments: 3, seeds: { olive: 2 }, growth: 1 } },
  'garden-table': { id: 'garden-table', npc: 'daphne', title: '花园午餐', request: '一尾珊纹鲷、一片月桂，足够招待来访的朋友。', cost: { fish: { 'reef-bream': 1 }, produce: { laurel: 1 } }, reward: { fragments: 4, seeds: { laurel: 2 }, growth: 1 } },
  'blue-keepsake': { id: 'blue-keepsake', npc: 'daphne', title: '蓝色的纪念', request: '带一尾金尾鲻和一朵鸢尾，纪念第一次远航。', cost: { fish: { 'golden-mullet': 1 }, produce: { iris: 1 } }, reward: { fragments: 5, seeds: { iris: 2 }, growth: 1 } },
};
export const RESTORATIONS: Record<RestorationId, RestorationDefinition> = {
  'harbor-mosaic': { id: 'harbor-mosaic', name: '归航镶嵌画', description: '用修复碎片拼回海港，用橄榄为画面添上一点新绿。', cost: { fragments: 6, produce: { olive: 1 } } },
};
export function createLifeProgress(): LifeProgress {
  return { fish: { 'silver-sprat': 0, 'reef-bream': 0, 'golden-mullet': 0 }, fishing: { nextSequence: 1, active: null, receipts: [] }, cooked: [], completedCommissions: [], restored: [] };
}
/** Stable sequence identity; never based on system clock or page load. */
export function createFishingAttempt(sequence: number): FishingAttempt {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > LIFE_LIMITS.fishingAttempts) throw new RangeError('Invalid fishing sequence');
  let seed = Math.imul(sequence ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0xc2b2ae35) >>> 0;
  seed = (seed ^ (seed >>> 16)) >>> 0;
  return { attemptId: `fishing.${sequence}`, sequence, seed };
}
export function fishForSeed(seed: number): FishId { return FISH_IDS[(seed >>> 0) % FISH_IDS.length]; }
