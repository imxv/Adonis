import type { Mods } from '../core/stats';

/** The heroes a run can start with. Adonis is the default; the knight is the original hero, still there to pick. */
export type HeroId = 'adonis' | 'knight';

export interface HeroDef {
  id: HeroId;
  name: string;
  /** A few words under the name. */
  title: string;
  desc: string;
  /** Starting weapon id. */
  weapon: string;
  /** The perk, as the player reads it, and what it does to the stat block. */
  perk: string;
  apply: (m: Mods) => void;
  /** Sprite key prefix: `${tex}-a` standing, `${tex}-b` mid-stride; the same name is its UI icon. */
  tex: string;
}

export const HEROES: Record<HeroId, HeroDef> = {
  adonis: {
    id: 'adonis',
    name: '阿多尼斯',
    title: '爱神所爱的猎人',
    desc: '死在野猪獠牙下的美少年，血落处开出银莲花。他一次次醒来。',
    weapon: 'bow',
    perk: '猎人的脚步：移动速度 +10%，暴击率 +8%',
    apply: (m) => {
      m.moveSpeed += 0.1;
      m.critChance += 0.08;
    },
    tex: 'adonis',
  },
  knight: {
    id: 'knight',
    name: '骑士',
    title: '误入画中的旅人',
    desc: '一身铁甲闯进了这幅画，也想去看看那头野猪。',
    weapon: 'pistol',
    perk: '重甲：护甲上限 +1',
    apply: (m) => {
      m.maxArmor += 1;
    },
    tex: 'knight',
  },
};

export const HERO_ORDER: HeroId[] = ['adonis', 'knight'];
