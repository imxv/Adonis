import type { PlantId, SupplyEffect, SupplyId } from './types';

export const META_LIMITS = { fragments: 99, seeds: 9, produce: 9, supplies: 3, beds: 3, growth: 1000000, runs: 4096, discoveries: 1024 } as const;
export const PLANT_IDS: PlantId[] = ['olive', 'laurel', 'iris'];
export const SUPPLY_IDS: SupplyId[] = ['olive-draught', 'laurel-thread', 'iris-vial'];
export const PLANTS: Record<PlantId, { name: string; subtitle: string; description: string; growth: number; color: string; supply: SupplyId }> = {
  olive: { name: '银叶橄榄', subtitle: '海风里的第一株新绿', description: '1点生长后成熟。钓鱼、委托或有效冒险推进生长，果实可调制补给或配鱼料理。', growth: 1, color: '#7caa8b', supply: 'olive-draught' },
  laurel: { name: '金缘月桂', subtitle: '献给归来的旅人', description: '2点生长后成熟。叶片可编为月桂结，也可配鱼料理或交付委托。', growth: 2, color: '#c9b264', supply: 'laurel-thread' },
  iris: { name: '星蓝鸢尾', subtitle: '在夜色中留住一线海蓝', description: '3点生长后成熟。花瓣可调为鸢尾香，也可配鱼料理或交付委托。', growth: 3, color: '#9d9bd2', supply: 'iris-vial' },
};
export const NO_SUPPLY_EFFECT: SupplyEffect = { maxHpBonus: 0, pickupRadiusMultiplier: 1, dashCooldownMultiplier: 1 };
export const SUPPLIES: Record<SupplyId, { name: string; plant: PlantId; description: string; cost: number; effect: SupplyEffect }> = {
  'olive-draught': { name: '橄榄露', plant: 'olive', description: '下一次冒险生命上限 +1，并补足这 1 点生命。', cost: 1, effect: { ...NO_SUPPLY_EFFECT, maxHpBonus: 1 } },
  'laurel-thread': { name: '月桂结', plant: 'laurel', description: '下一次冒险拾取范围增加 12%。', cost: 1, effect: { ...NO_SUPPLY_EFFECT, pickupRadiusMultiplier: 1.12 } },
  'iris-vial': { name: '鸢尾香', plant: 'iris', description: '下一次冒险冲刺冷却缩短 8%。', cost: 1, effect: { ...NO_SUPPLY_EFFECT, dashCooldownMultiplier: 0.92 } },
};
