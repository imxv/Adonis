export type Delivery = 'bolt' | 'spread' | 'beam' | 'mortar' | 'boomerang' | 'chain';

/** Guns the knight holds and aims with the mouse (Soul Knight style). World units are pixels at 640x360. */
export interface WeaponDef {
  id: Delivery;
  name: string;
  glyph: string;
  desc: string;
  damage: number;
  cooldown: number;
  count: number;
  speed: number;
  range: number;
  size: number;
  pierce: number;
  knockback: number;
  spreadDeg: number;
  grip: [number, number]; // texture origin of the hand
}

export const WEAPONS: Record<Delivery, WeaponDef> = {
  bolt: { id: 'bolt', name: '骑士手枪', glyph: '枪', desc: '稳定的单发，射速快', damage: 4, cooldown: 0.2, count: 1, speed: 330, range: 270, size: 3, pierce: 0, knockback: 50, spreadDeg: 6, grip: [0.25, 0.6] },
  spread: { id: 'spread', name: '双管霰弹', glyph: '霰', desc: '近距离锥形弹幕，击退强', damage: 2.6, cooldown: 0.62, count: 5, speed: 290, range: 150, size: 2.5, pierce: 0, knockback: 110, spreadDeg: 34, grip: [0.3, 0.55] },
  beam: { id: 'beam', name: '激光步枪', glyph: '光', desc: '瞬发直线，穿透所有敌人', damage: 8, cooldown: 0.72, count: 1, speed: 0, range: 330, size: 4, pierce: 0, knockback: 30, spreadDeg: 10, grip: [0.25, 0.55] },
  mortar: { id: 'mortar', name: '榴弹炮', glyph: '炮', desc: '抛向准星，落地范围爆炸', damage: 13, cooldown: 1.0, count: 1, speed: 1, range: 240, size: 34, pierce: 0, knockback: 120, spreadDeg: 0, grip: [0.3, 0.6] },
  boomerang: { id: 'boomerang', name: '回旋飞轮', glyph: '轮', desc: '飞出再折返，来回都能命中', damage: 5.5, cooldown: 0.8, count: 1, speed: 270, range: 170, size: 5, pierce: 0, knockback: 60, spreadDeg: 22, grip: [0.5, 0.5] },
  chain: { id: 'chain', name: '电磁枪', glyph: '雷', desc: '命中后在敌人之间跳跃', damage: 5, cooldown: 0.55, count: 3, speed: 0, range: 200, size: 72, pierce: 0, knockback: 14, spreadDeg: 0, grip: [0.25, 0.6] },
};

export const WEAPON_ORDER: Delivery[] = ['bolt', 'spread', 'beam', 'mortar', 'boomerang', 'chain'];
export const MAX_WEAPONS = 2;
export const MAX_WEAPON_LEVEL = 5;

export interface WeaponInstance {
  def: WeaponDef;
  level: number;
  cd: number;
}

export const weaponLevelDamage = (level: number) => 1 + 0.3 * (level - 1);
export const weaponLevelCount = (level: number) => (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0);

export const STAT_MEANING: Record<Delivery, { count: string; area: string; pierce: string }> = {
  bolt: { count: '多发', area: '弹体变大', pierce: '穿透敌人' },
  spread: { count: '弹丸 +2', area: '弹丸变大', pierce: '穿透敌人' },
  beam: { count: '多一道光束', area: '光束变宽', pierce: '撞墙反射' },
  mortar: { count: '多一枚炮弹', area: '爆炸半径', pierce: '落点留下余烬' },
  boomerang: { count: '多一枚飞轮', area: '飞轮变大', pierce: '更大更快' },
  chain: { count: '多跳一次', area: '跳跃距离', pierce: '分叉' },
};
