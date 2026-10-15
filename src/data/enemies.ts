export type EnemyKind = 'wanderer' | 'charger' | 'shooter' | 'bomber' | 'shield';
export type BossKind = 'guardian' | 'boar';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  r: number;
  cost: number;
  xp: number;
  contact: number; // half hearts
  minLevel: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  wanderer: { kind: 'wanderer', name: '游荡者', hp: 26, speed: 84, r: 19, cost: 1, xp: 1, contact: 1, minLevel: 0 },
  charger: { kind: 'charger', name: '冲锋兵', hp: 34, speed: 70, r: 19, cost: 2, xp: 2, contact: 1, minLevel: 0 },
  shooter: { kind: 'shooter', name: '射手', hp: 30, speed: 76, r: 19, cost: 2, xp: 2, contact: 1, minLevel: 0 },
  bomber: { kind: 'bomber', name: '自爆兵', hp: 18, speed: 128, r: 18, cost: 2, xp: 2, contact: 1, minLevel: 1 },
  shield: { kind: 'shield', name: '盾兵', hp: 60, speed: 52, r: 21, cost: 3, xp: 3, contact: 1, minLevel: 1 },
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
  dove: { name: '白鸽', glyph: '鸽', desc: '远距离吸取花瓣，每清一个房间回复半颗心' },
  swan: { name: '天鹅', glyph: '鹅', desc: '贴身环绕，挡掉敌方子弹并撞伤敌人' },
};
