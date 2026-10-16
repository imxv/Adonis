export type EnemyKind = 'wanderer' | 'bat' | 'charger' | 'shooter' | 'bomber' | 'shield' | 'brute' | 'ghost' | 'angel' | 'turret' | 'ninja' | 'jelly' | 'drone' | 'yeti' | 'scorpion' | 'magma' | 'sporeling';
export type BossKind = 'guardian' | 'boar';

/** How a monster arrives: what shows on the floor first, how it enters and what it sounds like. */
export type SpawnStyle = 'ooze' | 'swoop' | 'burrow' | 'portal' | 'smoke' | 'bones' | 'mist' | 'slam' | 'beam' | 'bubble' | 'roll';

export const SPAWN_STYLE: Record<EnemyKind, SpawnStyle> = {
  wanderer: 'ooze',
  magma: 'ooze',
  bat: 'swoop',
  drone: 'swoop',
  charger: 'burrow',
  scorpion: 'burrow',
  sporeling: 'burrow',
  shooter: 'portal',
  ninja: 'smoke',
  shield: 'bones',
  ghost: 'mist',
  turret: 'slam',
  brute: 'slam',
  yeti: 'slam',
  angel: 'beam',
  jelly: 'bubble',
  bomber: 'roll',
};

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  r: number;
  cost: number;
  xp: number;
  contact: number;
  minLevel: number;
  weight: number;
  /** Only shows up in this art style: the local monster. */
  biome?: string;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  wanderer: { kind: 'wanderer', name: '史莱姆', hp: 12, speed: 34, r: 6, cost: 1, xp: 1, contact: 1, minLevel: 0, weight: 5 },
  bat: { kind: 'bat', name: '蝙蝠', hp: 6, speed: 62, r: 5, cost: 1, xp: 1, contact: 1, minLevel: 0, weight: 4 },
  charger: { kind: 'charger', name: '小野猪', hp: 16, speed: 30, r: 6, cost: 2, xp: 2, contact: 1, minLevel: 0, weight: 2 },
  shooter: { kind: 'shooter', name: '哥布林法师', hp: 14, speed: 30, r: 6, cost: 2, xp: 2, contact: 1, minLevel: 0, weight: 2 },
  bomber: { kind: 'bomber', name: '炸弹怪', hp: 9, speed: 52, r: 6, cost: 2, xp: 2, contact: 1, minLevel: 1, weight: 2 },
  shield: { kind: 'shield', name: '骷髅盾兵', hp: 26, speed: 22, r: 6, cost: 3, xp: 3, contact: 1, minLevel: 1, weight: 1.5 },
  brute: { kind: 'brute', name: '巨魔', hp: 60, speed: 20, r: 9, cost: 5, xp: 5, contact: 1, minLevel: 2, weight: 1.2 },
  // One local monster per art style.
  sporeling: { kind: 'sporeling', name: '孢子菇', hp: 14, speed: 28, r: 6, cost: 2, xp: 2, contact: 1, minLevel: 0, weight: 3, biome: 'forest' },
  yeti: { kind: 'yeti', name: '雪怪', hp: 40, speed: 24, r: 8, cost: 3, xp: 3, contact: 1, minLevel: 0, weight: 2, biome: 'glacier' },
  scorpion: { kind: 'scorpion', name: '沙蝎', hp: 16, speed: 56, r: 6, cost: 2, xp: 2, contact: 1, minLevel: 0, weight: 3, biome: 'desert' },
  magma: { kind: 'magma', name: '熔岩史莱姆', hp: 20, speed: 30, r: 7, cost: 2, xp: 2, contact: 1, minLevel: 0, weight: 3, biome: 'volcano' },
  turret: { kind: 'turret', name: '蒸汽炮台', hp: 30, speed: 0, r: 7, cost: 3, xp: 3, contact: 1, minLevel: 0, weight: 2, biome: 'factory' },
  ghost: { kind: 'ghost', name: '幽灵', hp: 16, speed: 34, r: 6, cost: 2, xp: 2, contact: 1, minLevel: 0, weight: 3, biome: 'castle' },
  ninja: { kind: 'ninja', name: '忍者', hp: 14, speed: 44, r: 5, cost: 2, xp: 2, contact: 1, minLevel: 0, weight: 3, biome: 'garden' },
  angel: { kind: 'angel', name: '天使石像', hp: 30, speed: 76, r: 6, cost: 3, xp: 3, contact: 1, minLevel: 0, weight: 2.5, biome: 'palace' },
  jelly: { kind: 'jelly', name: '电水母', hp: 18, speed: 22, r: 6, cost: 2, xp: 2, contact: 1, minLevel: 0, weight: 3, biome: 'reef' },
  drone: { kind: 'drone', name: '霓虹无人机', hp: 12, speed: 50, r: 5, cost: 2, xp: 2, contact: 1, minLevel: 0, weight: 3, biome: 'neon' },
};

export type Affix = 'swift' | 'tough' | 'split' | 'burst';

export const AFFIXES: Record<Affix, string> = {
  swift: '迅捷',
  tough: '坚韧',
  split: '分裂',
  burst: '弹幕',
};

export type Pets = 'hound' | 'dove' | 'swan';

export const PETS: Record<Pets, { name: string; glyph: string; desc: string }> = {
  hound: { name: '猎犬', glyph: '犬', desc: '冲向最近的敌人撕咬，继承你的元素' },
  dove: { name: '白鸽', glyph: '鸽', desc: '大范围吸取宝石，每清一个房间回复 1 点生命' },
  swan: { name: '天鹅', glyph: '鹅', desc: '贴身环绕，挡掉敌方子弹并撞伤敌人' },
};
