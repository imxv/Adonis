/** Auto-casting spells picked up on level-up (Vampire Survivors style), and the fusions two of them make. */
export type BaseSpellId = 'orbit' | 'aura' | 'lightning' | 'missile' | 'axe' | 'nova' | 'knife' | 'meteor' | 'poison' | 'arc' | 'swords' | 'vortex';
export type FusionId = 'storm' | 'bladestorm' | 'plague' | 'starfall' | 'seeker' | 'singularity';
export type SpellId = BaseSpellId | FusionId;

export interface SpellDef {
  id: SpellId;
  name: string;
  desc: string;
  /** What each level-up adds (index 0 = level 2). Fusions do not level. */
  levels: string[];
  /** Upgrade id that unlocks evolution at max level (base spells only). */
  evolveWith?: string;
  evolved?: { name: string; desc: string };
  /** On a fusion: the two spells it is made from. */
  fusion?: [BaseSpellId, BaseSpellId];
}

export const MAX_SPELL_LEVEL = 5;
export const MAX_SPELLS = 4;
/** Both ingredients need this level before they fuse. */
export const FUSE_LEVEL = 3;

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
    evolved: { name: '死神轮舞', desc: '镰刀螺旋扩散，贯穿一切' },
  },
  nova: {
    id: 'nova',
    name: '冰霜新星',
    desc: '以自身为中心释放寒冰冲击',
    levels: ['范围 +20%', '伤害 +40%', '冷却 -20%', '范围 +25%'],
    evolveWith: 'ice',
    evolved: { name: '永冬', desc: '冲击冻结所有被命中的敌人' },
  },
  knife: {
    id: 'knife',
    name: '飞刀',
    desc: '朝瞄准方向连续掷出飞刀，穿透敌人',
    levels: ['飞刀 +1', '穿透 +1', '冷却 -20%', '飞刀 +1，伤害 +30%'],
    evolveWith: 'velocity',
    evolved: { name: '刀光风暴', desc: '扇形掷出五把飞刀，掷速翻倍' },
  },
  meteor: {
    id: 'meteor',
    name: '陨石',
    desc: '召唤陨石砸向敌人，落地范围爆炸',
    levels: ['范围 +20%', '伤害 +40%', '冷却 -20%', '陨石 +1，落点燃烧'],
    evolveWith: 'ember',
    evolved: { name: '流星火雨', desc: '每次召唤三颗陨石，落点留下火海' },
  },
  poison: {
    id: 'poison',
    name: '毒雾',
    desc: '在敌人脚下放出毒雾，持续伤害并减速',
    levels: ['范围 +20%', '毒雾 +1', '持续 +50%', '伤害 +40%'],
    evolveWith: 'chainboom',
    evolved: { name: '瘟疫爆发', desc: '死在毒雾里的敌人会炸出新的毒雾' },
  },
  arc: {
    id: 'arc',
    name: '电弧',
    desc: '从身上放出电弧，电击附近的敌人',
    levels: ['目标 +1', '伤害 +40%', '冷却 -20%', '目标 +1，范围 +25%'],
    evolveWith: 'multi',
    evolved: { name: '电网', desc: '每道电弧再向外跳两次' },
  },
  swords: {
    id: 'swords',
    name: '剑环',
    desc: '飞剑绕身旋转，定时齐射向敌人',
    levels: ['飞剑 +1', '齐射间隔 -20%', '飞剑 +1', '伤害 +30%'],
    evolveWith: 'lethal',
    evolved: { name: '剑冢', desc: '飞剑数量翻倍，射出的剑贯穿一切' },
  },
  vortex: {
    id: 'vortex',
    name: '黑洞',
    desc: '在敌群中心打开黑洞，吸住敌人持续伤害',
    levels: ['范围 +20%', '伤害 +40%', '冷却 -20%', '持续 +40%'],
    evolveWith: 'magnet',
    evolved: { name: '天体引力', desc: '吸力更强、范围更大，结束时引发爆裂' },
  },

  // Fusions: two spells at level 3 or higher merge into one of these, freeing a slot.
  storm: {
    id: 'storm',
    name: '雷霜风暴',
    desc: '冻结身边所有敌人，再降下雷击把冰块击碎',
    levels: [],
    fusion: ['nova', 'lightning'],
  },
  bladestorm: {
    id: 'bladestorm',
    name: '万剑归宗',
    desc: '十把飞剑护身，源源不断地追击敌人',
    levels: [],
    fusion: ['orbit', 'swords'],
  },
  plague: {
    id: 'plague',
    name: '瘟疫领域',
    desc: '大范围毒性领域，倒下的敌人会炸出毒雾',
    levels: [],
    fusion: ['aura', 'poison'],
  },
  starfall: {
    id: 'starfall',
    name: '天陨',
    desc: '一次召唤四颗陨石，砸出一片火海',
    levels: [],
    fusion: ['meteor', 'axe'],
  },
  seeker: {
    id: 'seeker',
    name: '千刃追踪',
    desc: '飞刀化作追踪刃，自动绕向敌人并贯穿',
    levels: [],
    fusion: ['missile', 'knife'],
  },
  singularity: {
    id: 'singularity',
    name: '雷暴奇点',
    desc: '巨大的黑洞吞噬敌群，核心不断放出电弧',
    levels: [],
    fusion: ['vortex', 'arc'],
  },
};

export const SPELL_ORDER: BaseSpellId[] = ['orbit', 'aura', 'lightning', 'missile', 'axe', 'nova', 'knife', 'meteor', 'poison', 'arc', 'swords', 'vortex'];
export const FUSION_ORDER: FusionId[] = ['storm', 'bladestorm', 'plague', 'starfall', 'seeker', 'singularity'];

/** The name to show: the evolved name once evolved. */
export const spellName = (s: { id: SpellId; evolved: boolean }) => (s.evolved && SPELLS[s.id].evolved ? SPELLS[s.id].evolved!.name : SPELLS[s.id].name);

/** The fusion a base spell takes part in, and its partner. */
export function fusionOf(id: SpellId): { fusion: FusionId; partner: BaseSpellId } | undefined {
  for (const f of FUSION_ORDER) {
    const [a, b] = SPELLS[f].fusion!;
    if (a === id) return { fusion: f, partner: b };
    if (b === id) return { fusion: f, partner: a };
  }
  return undefined;
}

export interface SpellInstance {
  id: SpellId;
  level: number;
  evolved: boolean;
  cd: number;
  angle: number;
  hits: Map<number, number>;
  kills: number;
  /** Free per-spell timer (sword regrowth and the like). */
  t: number;
}
