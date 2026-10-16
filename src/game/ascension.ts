import { PET_ORDER } from '../data/enemies';
import type { RunState } from './run';

export const ASCENSION_NAME = '耶稣';

export const ASCENSION_BONUS_LINES = [
  '伤害 +60% · 攻速 +25% · 移速 +20%',
  '范围 +20% · 暴击率 +15% · 拾取范围 +25%',
  '生命 / 护甲上限 +3 · 立即回满',
  '换弹时间 -20% · 闪避冷却 -25%',
  '宠物伤害 +50% · 宠物攻速 +25%',
] as const;

/** Activate once per run, including old saves that collected the complete roster before this feature existed. */
export function tryAscend(run: RunState): boolean {
  if (run.ascended || !PET_ORDER.every((kind) => run.pets.includes(kind))) return false;

  run.ascended = true;
  const m = run.mods;
  m.damage *= 1.6;
  m.fireRate *= 1.25;
  m.moveSpeed *= 1.2;
  m.area *= 1.2;
  m.critChance = Math.min(1, m.critChance + 0.15);
  m.maxHp += 3;
  m.maxArmor += 3;
  m.reload *= 0.8;
  m.dashCooldown *= 0.75;
  m.petDamage *= 1.5;
  m.petRate *= 1.25;
  m.pickupRadius *= 1.25;
  run.hp = m.maxHp;
  run.armor = m.maxArmor;
  return true;
}
