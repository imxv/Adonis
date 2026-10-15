/** Auto-casting spells picked up on level-up (Vampire Survivors style). */
export type SpellId = 'orbit' | 'aura' | 'lightning' | 'missile' | 'axe' | 'nova';

export interface SpellDef {
  id: SpellId;
  name: string;
  desc: string;
  levels: string[]; // what each level-up adds (index 0 = level 2)
  evolveWith: string; // upgrade id that unlocks evolution at max level
  evolved: { name: string; desc: string };
}

export const MAX_SPELL_LEVEL = 5;
export const MAX_SPELLS = 4;

export const SPELLS: Record<SpellId, SpellDef> = {
  orbit: {
    id: 'orbit',
    name: '守护之书',
    desc: '书页绕身旋转，撞开靠近的敌人',
    levels: ['伤害 +30%', '书 +1', '转速 +30%', '书 +1，范围 +20%'],
    evolveWith: 'expand',
    evolved: { name: '天启圣典', desc: '书数量翻倍，命中点燃敌人' },
  },
  aura: {
    id: 'aura',
    name: '圣光领域',
    desc: '持续灼伤身边的敌人',
    levels: ['范围 +20%', '伤害 +40%', '范围 +20%', '伤害 +40%，击退'],
    evolveWith: 'vigor',
    evolved: { name: '灵魂吸取', desc: '领域内每击杀 12 个敌人回复 1 点生命' },
  },
  lightning: {
    id: 'lightning',
    name: '天罚雷击',
    desc: '随机劈中视野内的敌人',
    levels: ['目标 +1', '伤害 +40%', '目标 +1', '冷却 -25%'],
    evolveWith: 'shock',
    evolved: { name: '雷霆万钧', desc: '雷击数量翻倍，并在敌人之间连锁' },
  },
  missile: {
    id: 'missile',
    name: '魔导飞弹',
    desc: '自动射向最近的敌人',
    levels: ['飞弹 +1', '伤害 +30%', '穿透 +1', '飞弹 +1'],
    evolveWith: 'haste',
    evolved: { name: '千针', desc: '连射三轮，射速极快' },
  },
  axe: {
    id: 'axe',
    name: '回旋飞斧',
    desc: '向上抛出飞斧，落下时砸穿敌人',
    levels: ['飞斧 +1', '伤害 +40%', '飞斧 +1', '体积 +30%'],
    evolveWith: 'sharp',
    evolved: { name: '死神镰', desc: '镰刀螺旋扩散，贯穿一切' },
  },
  nova: {
    id: 'nova',
    name: '冰霜新星',
    desc: '以自身为中心释放寒冰冲击',
    levels: ['范围 +20%', '伤害 +40%', '冷却 -20%', '范围 +25%'],
    evolveWith: 'ice',
    evolved: { name: '永冬', desc: '冲击冻结所有被命中的敌人' },
  },
};

export const SPELL_ORDER: SpellId[] = ['orbit', 'aura', 'lightning', 'missile', 'axe', 'nova'];

export interface SpellInstance {
  id: SpellId;
  level: number;
  evolved: boolean;
  cd: number;
  angle: number;
  hits: Map<number, number>;
  kills: number;
}
