import type { Mods } from '../core/stats';

/** The heroes a run can start with. Adonis is the default; the knight is the original hero, still there to pick. */
export type HeroId = 'adonis' | 'knight' | 'deepseek' | 'coder';

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
    perk: '移速 +10%，暴击率 +8%',
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
    perk: '护甲上限 +1',
    apply: (m) => {
      m.maxArmor += 1;
    },
    tex: 'knight',
  },
  deepseek: {
    id: 'deepseek',
    name: '鲸鱼娘',
    title: 'DeepSeek 海中来客',
    desc: '摇着鲸尾走进画里的深海来客。打完这场，再去吃饭！',
    weapon: 'tide',
    perk: '弹匣 +20%，换弹 -10%',
    apply: (m) => {
      m.mag *= 1.2;
      m.reload *= 0.9;
    },
    tex: 'deepseek',
  },
  coder: {
    id: 'coder',
    name: '程序员',
    title: '在工位睡着的码农',
    desc: '趴在键盘上睡着，醒来已在画里。满地会动的 bug，修完再下班。',
    weapon: 'keyboard',
    perk: '攻击频率 +10%，暴击伤害 +30%',
    apply: (m) => {
      m.fireRate += 0.1;
      m.critMult += 0.3;
    },
    tex: 'coder',
  },
};

export const HERO_ORDER: HeroId[] = ['adonis', 'knight', 'deepseek', 'coder'];
