export type Delivery = 'bolt' | 'spread' | 'beam' | 'mortar' | 'boomerang' | 'chain';

export interface WeaponDef {
  id: Delivery;
  name: string;
  glyph: string;
  desc: string;
  damage: number;
  cooldown: number; // seconds between attacks
  count: number; // base projectiles / beams / shells / blades / jumps
  speed: number; // px/s (mortar: flight time multiplier)
  range: number; // px
  size: number; // base radius, width, blast radius or jump radius
  pierce: number;
  knockback: number;
  spreadDeg: number;
}

export const WEAPONS: Record<Delivery, WeaponDef> = {
  bolt: {
    id: 'bolt',
    name: '速射',
    glyph: '矢',
    desc: '高速单发，越多越密',
    damage: 10,
    cooldown: 0.17,
    count: 1,
    speed: 920,
    range: 640,
    size: 6,
    pierce: 0,
    knockback: 110,
    spreadDeg: 6,
  },
  spread: {
    id: 'spread',
    name: '散射',
    glyph: '霰',
    desc: '近距离锥形弹幕，击退强',
    damage: 6.5,
    cooldown: 0.6,
    count: 5,
    speed: 720,
    range: 340,
    size: 5,
    pierce: 0,
    knockback: 240,
    spreadDeg: 36,
  },
  beam: {
    id: 'beam',
    name: '光束',
    glyph: '光',
    desc: '瞬发直线，穿透所有敌人',
    damage: 20,
    cooldown: 0.8,
    count: 1,
    speed: 0,
    range: 780,
    size: 10,
    pierce: 0,
    knockback: 70,
    spreadDeg: 10,
  },
  mortar: {
    id: 'mortar',
    name: '迫击',
    glyph: '炮',
    desc: '抛向准星，落地范围爆炸',
    damage: 30,
    cooldown: 1.05,
    count: 1,
    speed: 1,
    range: 540,
    size: 78,
    pierce: 0,
    knockback: 280,
    spreadDeg: 0,
  },
  boomerang: {
    id: 'boomerang',
    name: '回旋刃',
    glyph: '刃',
    desc: '飞出再折返，来回都能命中',
    damage: 13,
    cooldown: 0.85,
    count: 1,
    speed: 660,
    range: 380,
    size: 15,
    pierce: 0,
    knockback: 150,
    spreadDeg: 22,
  },
  chain: {
    id: 'chain',
    name: '链电',
    glyph: '雷',
    desc: '命中后在敌人之间跳跃',
    damage: 12,
    cooldown: 0.62,
    count: 3,
    speed: 0,
    range: 440,
    size: 170,
    pierce: 0,
    knockback: 30,
    spreadDeg: 0,
  },
};

export const WEAPON_ORDER: Delivery[] = ['bolt', 'spread', 'beam', 'mortar', 'boomerang', 'chain'];
export const MAX_WEAPONS = 3;
export const MAX_WEAPON_LEVEL = 5;

export interface WeaponInstance {
  def: WeaponDef;
  level: number;
  cd: number;
}

export const weaponLevelDamage = (level: number) => 1 + 0.28 * (level - 1);
export const weaponLevelCount = (level: number) => (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0);

/** How each delivery reads the shared stats; shown on cards so players see the mapping. */
export const STAT_MEANING: Record<Delivery, { count: string; area: string; pierce: string }> = {
  bolt: { count: '多发', area: '弹体变大', pierce: '穿透敌人' },
  spread: { count: '弹丸 +2', area: '弹丸变大', pierce: '穿透敌人' },
  beam: { count: '多一道光束', area: '光束变宽', pierce: '撞墙反射' },
  mortar: { count: '多一枚炮弹', area: '爆炸半径', pierce: '落点留下余烬' },
  boomerang: { count: '多一把刃', area: '刃变大', pierce: '刃更大更快' },
  chain: { count: '多跳一次', area: '跳跃距离', pierce: '分叉' },
};
