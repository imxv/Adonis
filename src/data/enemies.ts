export type EnemyKind = 'wanderer' | 'bat' | 'charger' | 'shooter' | 'bomber' | 'shield';
export type BossKind = 'guardian' | 'boar';

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
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  wanderer: { kind: 'wanderer', name: '史莱姆', hp: 12, speed: 34, r: 6, cost: 1, xp: 1, contact: 1, minLevel: 0, weight: 5 },
  bat: { kind: 'bat', name: '蝙蝠', hp: 6, speed: 62, r: 5, cost: 1, xp: 1, contact: 1, minLevel: 0, weight: 4 },
  charger: { kind: 'charger', name: '小野猪', hp: 16, speed: 30, r: 6, cost: 2, xp: 2, contact: 1, minLevel: 0, weight: 2 },
  shooter: { kind: 'shooter', name: '哥布林法师', hp: 14, speed: 30, r: 6, cost: 2, xp: 2, contact: 1, minLevel: 0, weight: 2 },
  bomber: { kind: 'bomber', name: '炸弹怪', hp: 9, speed: 52, r: 6, cost: 2, xp: 2, contact: 1, minLevel: 1, weight: 2 },
  shield: { kind: 'shield', name: '骷髅盾兵', hp: 26, speed: 22, r: 6, cost: 3, xp: 3, contact: 1, minLevel: 1, weight: 1.5 },
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
