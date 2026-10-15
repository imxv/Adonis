import type { Mods, Tag } from '../core/stats';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export const RARITY_INFO: Record<Rarity, { name: string; weight: number; color: string }> = {
  common: { name: '普通', weight: 62, color: '#B9B4A8' },
  rare: { name: '稀有', weight: 27, color: '#3D8BFF' },
  epic: { name: '史诗', weight: 9, color: '#B05CFF' },
  legendary: { name: '传说', weight: 2, color: '#FFB020' },
};

export interface UpgradeDef {
  id: string;
  name: string;
  glyph: string;
  rarity: Rarity;
  tags: Tag[];
  max: number;
  desc: string;
  apply: (m: Mods) => void;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'sharp', name: '锋锐', glyph: '锋', rarity: 'common', tags: ['power'], max: 6, desc: '所有攻击伤害 +15%', apply: (m) => (m.damage += 0.15) },
  { id: 'haste', name: '急速', glyph: '疾', rarity: 'common', tags: ['barrage'], max: 6, desc: '所有攻击频率 +12%', apply: (m) => (m.fireRate += 0.12) },
  { id: 'expand', name: '扩张', glyph: '广', rarity: 'common', tags: ['barrage'], max: 5, desc: '范围 +20%：弹体、光束宽度、爆炸半径、跳跃距离', apply: (m) => (m.area += 0.2) },
  { id: 'velocity', name: '疾驰', glyph: '驰', rarity: 'common', tags: ['agile'], max: 4, desc: '弹速 +20%，射程 +10%', apply: (m) => ((m.speed += 0.2), (m.range += 0.1)) },
  { id: 'precise', name: '精准', glyph: '准', rarity: 'common', tags: ['crit'], max: 5, desc: '暴击率 +8%', apply: (m) => (m.critChance += 0.08) },
  { id: 'lethal', name: '致命', glyph: '命', rarity: 'common', tags: ['crit'], max: 5, desc: '暴击伤害 +40%', apply: (m) => (m.critMult += 0.4) },
  { id: 'impact', name: '冲击', glyph: '震', rarity: 'common', tags: ['power'], max: 3, desc: '击退 +40%，伤害 +6%', apply: (m) => ((m.knockback += 0.4), (m.damage += 0.06)) },
  { id: 'light', name: '轻盈', glyph: '轻', rarity: 'common', tags: ['agile'], max: 4, desc: '移动速度 +10%', apply: (m) => (m.moveSpeed += 0.1) },
  { id: 'vigor', name: '生机', glyph: '生', rarity: 'common', tags: ['vital'], max: 4, desc: '生命上限 +1，护甲上限 +1', apply: (m) => ((m.maxHp += 1), (m.maxArmor += 1)) },
  { id: 'magnet', name: '磁石', glyph: '引', rarity: 'common', tags: ['vital'], max: 3, desc: '宝石拾取范围 +50%', apply: (m) => (m.pickupRadius += 0.5) },
  { id: 'dashmaster', name: '掠影', glyph: '影', rarity: 'common', tags: ['agile'], max: 3, desc: '冲刺冷却 -25%', apply: (m) => (m.dashCooldown *= 0.75) },
  { id: 'quickload', name: '快手', glyph: '换', rarity: 'common', tags: ['barrage'], max: 3, desc: '换弹速度 +25%', apply: (m) => (m.reload *= 0.8) },
  { id: 'bigmag', name: '扩容弹匣', glyph: '匣', rarity: 'rare', tags: ['barrage'], max: 2, desc: '弹匣容量 +50%', apply: (m) => (m.mag += 0.5) },

  { id: 'multi', name: '多重', glyph: '多', rarity: 'rare', tags: ['barrage'], max: 3, desc: '数量 +1：子弹、光束、炮弹、飞轮、法术全部 +1', apply: (m) => (m.count += 1) },
  { id: 'pierce', name: '贯穿', glyph: '穿', rarity: 'rare', tags: ['barrage'], max: 3, desc: '穿透 +1：子弹穿透、光束反射、爆炸留余烬、链电分叉', apply: (m) => (m.pierce += 1) },
  { id: 'fire', name: '火种', glyph: '火', rarity: 'rare', tags: ['element'], max: 3, desc: '命中有 25% 概率点燃，持续灼烧', apply: (m) => (m.elements.fire += 0.25) },
  { id: 'ice', name: '霜结', glyph: '霜', rarity: 'rare', tags: ['element'], max: 3, desc: '命中有 25% 概率冰寒，叠满三层冻结', apply: (m) => (m.elements.ice += 0.25) },
  { id: 'shock', name: '雷鸣', glyph: '雷', rarity: 'rare', tags: ['element'], max: 3, desc: '命中有 25% 概率感电，电流传给附近敌人', apply: (m) => (m.elements.shock += 0.25) },
  { id: 'bloom', name: '吸血花', glyph: '吸', rarity: 'rare', tags: ['vital'], max: 3, desc: '击杀时 2% 概率回复 1 点生命', apply: (m) => (m.healOnKill += 0.02) },
  { id: 'desperate', name: '背水', glyph: '背', rarity: 'rare', tags: ['power'], max: 2, desc: '生命低于一半时，伤害 +35%', apply: (m) => (m.desperate += 0.35) },
  { id: 'twin', name: '双生', glyph: '双', rarity: 'rare', tags: ['barrage'], max: 2, desc: '数量 +1，伤害 -8%', apply: (m) => ((m.count += 1), (m.damage -= 0.08)) },
  { id: 'sniper', name: '狙心', glyph: '狙', rarity: 'rare', tags: ['crit', 'power'], max: 2, desc: '伤害 +35%，弹速 +30%，攻击频率 -10%', apply: (m) => ((m.damage += 0.35), (m.speed += 0.3), (m.fireRate -= 0.1)) },
  { id: 'bond', name: '羁绊', glyph: '绊', rarity: 'rare', tags: ['pet'], max: 2, desc: '宠物继承你的加成 +25%', apply: (m) => (m.petInherit += 0.25) },
  { id: 'pack', name: '群猎', glyph: '猎', rarity: 'rare', tags: ['pet'], max: 3, desc: '宠物攻击频率 +30%', apply: (m) => (m.petRate += 0.3) },

  { id: 'ember', name: '余烬爆裂', glyph: '爆', rarity: 'epic', tags: ['power', 'element'], max: 2, desc: '命中有 10% 概率引发小爆炸', apply: (m) => (m.explodeOnHit += 0.1) },
  { id: 'fission', name: '裂变', glyph: '裂', rarity: 'epic', tags: ['crit', 'barrage'], max: 2, desc: '暴击时裂出 2 枚碎片弹', apply: (m) => (m.splitOnCrit += 2) },
  { id: 'chainboom', name: '连锁殉爆', glyph: '殉', rarity: 'epic', tags: ['power'], max: 2, desc: '敌人死亡时爆炸，造成其最大生命 35% 的伤害', apply: (m) => (m.explodeOnKill += 0.35) },
  { id: 'frenzy', name: '狂热', glyph: '狂', rarity: 'epic', tags: ['barrage'], max: 2, desc: '每次击杀攻击频率 +4%，最多 +40%，2 秒不杀逐渐消退', apply: (m) => (m.frenzy += 0.04) },
  { id: 'resonance', name: '共鸣', glyph: '鸣', rarity: 'epic', tags: ['element'], max: 2, desc: '元素效果强度 +50%，元素触发率 +10%', apply: (m) => ((m.elementPower += 0.5), (m.elements.fire += 0.1 * Math.sign(m.elements.fire)), (m.elements.ice += 0.1 * Math.sign(m.elements.ice)), (m.elements.shock += 0.1 * Math.sign(m.elements.shock))) },

  { id: 'anemone', name: '银莲之血', glyph: '莲', rarity: 'legendary', tags: ['power', 'vital'], max: 1, desc: '伤害 +40%，生命上限 +2，暴击率 +10%', apply: (m) => ((m.damage += 0.4), (m.maxHp += 2), (m.critChance += 0.1)) },
  { id: 'aphrodite', name: '爱神之吻', glyph: '爱', rarity: 'legendary', tags: ['barrage', 'crit'], max: 1, desc: '数量 +2，暴击伤害 +60%', apply: (m) => ((m.count += 2), (m.critMult += 0.6)) },
];

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
