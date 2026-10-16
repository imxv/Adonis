import type { Element } from '../core/stats';

/** How a weapon delivers damage. Several weapons share a delivery with different numbers. */
export type Delivery = 'bolt' | 'spread' | 'beam' | 'mortar' | 'boomerang' | 'chain' | 'rocket' | 'flame' | 'slash';

/** The moves a melee combo is made of. */
export type MoveKind = 'arc' | 'thrust' | 'smash' | 'spin' | 'slam' | 'lunge' | 'cross' | 'whirl';

export interface MeleeMove {
  move: MoveKind;
  /** Width of an arc or smash, in degrees. */
  arc?: number;
  /** Reach and damage relative to the weapon's own. */
  reach: number;
  dmg: number;
  /** Which way an arc sweeps: 1 forehand, -1 backhand. */
  dir?: 1 | -1;
  /** What the finisher is called when it lands. */
  name?: string;
}

export interface WeaponDef {
  id: string;
  kind: Delivery;
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
  grip: [number, number];
  jitter?: number; // random aim error, radians
  element?: Element;
  proj?: string; // projectile texture for bolt-type weapons
  tracer?: boolean;
  shake?: number; // camera kick per shot
  /** Magazine size and reload seconds. Energy and melee weapons have neither and never reload. */
  mag?: number;
  reload?: number;
  /** Melee: the combo, one move per swing; the last move is the finisher. */
  combo?: MeleeMove[];
  /** Shots bounce off walls this many times. */
  bounce?: number;
  /** Shots shatter into this many shards when they stop. */
  split?: number;
  /** The fire rate climbs while the trigger is held, down to this cooldown. */
  spinTo?: number;
  /** What flies out of the gun on each shot. */
  casing?: 'brass' | 'shell';
}

export const WEAPONS: Record<string, WeaponDef> = {
  pistol: { id: 'pistol', kind: 'bolt', name: '骑士手枪', glyph: '枪', desc: '稳定的单发，射速快', damage: 4, cooldown: 0.2, count: 1, speed: 300, range: 230, size: 3, pierce: 0, knockback: 50, spreadDeg: 6, grip: [0.25, 0.6], shake: 0.012, mag: 12, reload: 0.9, casing: 'brass' },
  smg: { id: 'smg', kind: 'bolt', name: '冲锋枪', glyph: '冲', desc: '射速极快，散布较大', damage: 2.2, cooldown: 0.075, count: 1, speed: 290, range: 190, size: 2.5, pierce: 0, knockback: 25, spreadDeg: 5, grip: [0.3, 0.55], jitter: 0.13, shake: 0.008, mag: 32, reload: 1.3, casing: 'brass' },
  crossbow: { id: 'crossbow', kind: 'bolt', name: '连弩', glyph: '弩', desc: '弩箭穿透两个敌人', damage: 7, cooldown: 0.42, count: 1, speed: 360, range: 260, size: 3, pierce: 2, knockback: 60, spreadDeg: 6, grip: [0.35, 0.5], proj: 'b-arrow', shake: 0.015, mag: 5, reload: 1.2 },
  sniper: { id: 'sniper', kind: 'bolt', name: '狙击枪', glyph: '狙', desc: '高伤害，贯穿一整排', damage: 24, cooldown: 0.95, count: 1, speed: 640, range: 400, size: 3, pierce: 4, knockback: 140, spreadDeg: 4, grip: [0.22, 0.55], proj: 'b-snipe', tracer: true, shake: 0.12, mag: 4, reload: 1.6, casing: 'brass' },
  shotgun: { id: 'shotgun', kind: 'spread', name: '双管霰弹', glyph: '霰', desc: '近距离锥形弹幕，击退强', damage: 2.6, cooldown: 0.62, count: 5, speed: 280, range: 140, size: 2.5, pierce: 0, knockback: 110, spreadDeg: 34, grip: [0.3, 0.55], shake: 0.07, mag: 2, reload: 0.85, casing: 'shell' },
  laser: { id: 'laser', kind: 'beam', name: '激光步枪', glyph: '光', desc: '瞬发直线，穿透所有敌人', damage: 8, cooldown: 0.72, count: 1, speed: 0, range: 300, size: 4, pierce: 0, knockback: 30, spreadDeg: 10, grip: [0.25, 0.55], shake: 0.05 },
  grenade: { id: 'grenade', kind: 'mortar', name: '榴弹炮', glyph: '炮', desc: '抛向准星，落地范围爆炸', damage: 13, cooldown: 1.0, count: 1, speed: 1, range: 220, size: 32, pierce: 0, knockback: 120, spreadDeg: 0, grip: [0.3, 0.6], shake: 0.04, mag: 4, reload: 1.5 },
  rocket: { id: 'rocket', kind: 'rocket', name: '火箭筒', glyph: '火', desc: '直线飞行，命中后爆炸', damage: 16, cooldown: 1.1, count: 1, speed: 220, range: 280, size: 30, pierce: 0, knockback: 140, spreadDeg: 8, grip: [0.4, 0.55], proj: 'b-rocket', shake: 0.14, mag: 2, reload: 1.6 },
  chakram: { id: 'chakram', kind: 'boomerang', name: '回旋飞轮', glyph: '轮', desc: '飞出再折返，来回都能命中', damage: 5.5, cooldown: 0.8, count: 1, speed: 260, range: 160, size: 5, pierce: 0, knockback: 60, spreadDeg: 22, grip: [0.5, 0.5], shake: 0.02 },
  tesla: { id: 'tesla', kind: 'chain', name: '电磁枪', glyph: '雷', desc: '命中后在敌人之间跳跃', damage: 5, cooldown: 0.55, count: 3, speed: 0, range: 190, size: 70, pierce: 0, knockback: 14, spreadDeg: 0, grip: [0.25, 0.6], shake: 0.02 },
  flamer: { id: 'flamer', kind: 'flame', name: '喷火器', glyph: '焰', desc: '近距离持续喷火，点燃敌人', damage: 1.0, cooldown: 0.05, count: 2, speed: 150, range: 85, size: 4, pierce: 99, knockback: 8, spreadDeg: 26, grip: [0.3, 0.55], element: 'fire', shake: 0.004, mag: 60, reload: 1.6 },
  sword: { id: 'sword', kind: 'slash', name: '骑士剑', glyph: '剑', desc: '近身横斩，能砍掉敌方子弹。三段连斩，第三刀回旋斩', damage: 9, cooldown: 0.36, count: 1, speed: 0, range: 28, size: 1, pierce: 0, knockback: 150, spreadDeg: 110, grip: [0.15, 0.5], shake: 0.05, combo: [{ move: 'arc', arc: 110, reach: 1, dmg: 1, dir: 1 }, { move: 'arc', arc: 110, reach: 1, dmg: 1.1, dir: -1 }, { move: 'spin', reach: 1.25, dmg: 1.9, name: '回旋斩' }] },
  spear: { id: 'spear', kind: 'slash', name: '长枪', glyph: '枪', desc: '直线突刺，够得远。两次突刺后向前冲锋长刺，一路贯穿', damage: 8, cooldown: 0.34, count: 1, speed: 0, range: 46, size: 1, pierce: 0, knockback: 120, spreadDeg: 26, grip: [0.3, 0.5], shake: 0.04, combo: [{ move: 'thrust', reach: 1, dmg: 1 }, { move: 'thrust', reach: 1.05, dmg: 1.1 }, { move: 'lunge', reach: 1.5, dmg: 2.2, name: '冲锋突刺' }] },
  hammer: { id: 'hammer', kind: 'slash', name: '战锤', glyph: '锤', desc: '又慢又重，击退极强。横扫、下砸，第三下砸地震出冲击波', damage: 16, cooldown: 0.62, count: 1, speed: 0, range: 30, size: 1, pierce: 0, knockback: 260, spreadDeg: 140, grip: [0.2, 0.5], shake: 0.08, combo: [{ move: 'arc', arc: 140, reach: 1, dmg: 1, dir: 1 }, { move: 'smash', arc: 90, reach: 1.1, dmg: 1.4 }, { move: 'slam', reach: 1.9, dmg: 2.2, name: '震地' }] },
  daggers: { id: 'daggers', kind: 'slash', name: '双匕', glyph: '匕', desc: '双手快刺，出手极快但很短。三连刺接一记十字斩', damage: 4.5, cooldown: 0.13, count: 1, speed: 0, range: 22, size: 1, pierce: 0, knockback: 40, spreadDeg: 70, grip: [0.2, 0.5], shake: 0.02, combo: [{ move: 'thrust', reach: 0.95, dmg: 1 }, { move: 'thrust', reach: 0.95, dmg: 1 }, { move: 'arc', arc: 90, reach: 1, dmg: 1.2, dir: 1 }, { move: 'cross', reach: 1.35, dmg: 2.6, name: '十字斩' }] },
  scythe: { id: 'scythe', kind: 'slash', name: '死神镰', glyph: '镰', desc: '大半圈的横扫，正反两刀后原地旋风，连砍四次', damage: 10, cooldown: 0.48, count: 1, speed: 0, range: 38, size: 1, pierce: 0, knockback: 140, spreadDeg: 200, grip: [0.25, 0.6], shake: 0.05, combo: [{ move: 'arc', arc: 200, reach: 1, dmg: 1, dir: 1 }, { move: 'arc', arc: 200, reach: 1, dmg: 1.1, dir: -1 }, { move: 'whirl', reach: 1.15, dmg: 1.3, name: '死亡旋风' }] },
  bow: { id: 'bow', kind: 'bolt', name: '长弓', glyph: '弓', desc: '一次射出三支箭，各穿透一个敌人', damage: 8, cooldown: 0.55, count: 3, speed: 330, range: 270, size: 3, pierce: 1, knockback: 70, spreadDeg: 0, grip: [0.4, 0.5], proj: 'b-arrow', shake: 0.02, mag: 6, reload: 1.0 },
  shuriken: { id: 'shuriken', kind: 'bolt', name: '手里剑', glyph: '镖', desc: '旋转飞镖，撞墙会反弹三次', damage: 4, cooldown: 0.22, count: 1, speed: 270, range: 420, size: 3, pierce: 0, knockback: 30, spreadDeg: 0, grip: [0.5, 0.5], proj: 'b-shuriken', bounce: 3, shake: 0.008, mag: 12, reload: 1.0 },
  gatling: { id: 'gatling', kind: 'bolt', name: '加特林', glyph: '转', desc: '按住越打越快，弹匣很大，换弹很慢', damage: 2.3, cooldown: 0.17, count: 1, speed: 320, range: 220, size: 2.5, pierce: 0, knockback: 18, spreadDeg: 0, grip: [0.3, 0.55], jitter: 0.1, shake: 0.006, mag: 120, reload: 2.2, spinTo: 0.045, casing: 'brass' },
  frostlance: { id: 'frostlance', kind: 'bolt', name: '冰锥枪', glyph: '冰', desc: '射出冰锥，命中或撞墙后碎成五片冰晶，冻住敌人', damage: 10, cooldown: 0.6, count: 1, speed: 260, range: 240, size: 4, pierce: 0, knockback: 60, spreadDeg: 0, grip: [0.3, 0.5], proj: 'b-icicle', element: 'ice', split: 5, shake: 0.03, mag: 6, reload: 1.3 },
};

export const WEAPON_ORDER = Object.keys(WEAPONS);
export const MAX_WEAPONS = 2;
export const MAX_WEAPON_LEVEL = 5;

export interface WeaponInstance {
  def: WeaponDef;
  level: number;
  cd: number;
  /** Rounds left; undefined for weapons without a magazine. */
  ammo?: number;
  /** Seconds of reload left, 0 when not reloading. */
  reloadT?: number;
  /** How far a spinning-barrel gun has wound up, 0-1. */
  spin?: number;
}

export const magSize = (w: WeaponInstance, magMul: number) => (w.def.mag ? Math.max(1, Math.round(w.def.mag * magMul)) : 0);
export const reloadTime = (w: WeaponInstance, reloadMul: number) => (w.def.reload ?? 0) * reloadMul;

export const weaponLevelDamage = (level: number) => 1 + 0.3 * (level - 1);
export const weaponLevelCount = (level: number) => (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0);

export const STAT_MEANING: Record<Delivery, { count: string; area: string; pierce: string }> = {
  bolt: { count: '多发', area: '弹体变大', pierce: '穿透敌人' },
  spread: { count: '弹丸 +2', area: '弹丸变大', pierce: '穿透敌人' },
  beam: { count: '多一道光束', area: '光束变宽', pierce: '撞墙反射' },
  mortar: { count: '多一枚炮弹', area: '爆炸半径', pierce: '落点留下余烬' },
  rocket: { count: '多一枚火箭', area: '爆炸半径', pierce: '穿透后再爆' },
  boomerang: { count: '多一枚飞轮', area: '飞轮变大', pierce: '更大更快' },
  chain: { count: '多跳一次', area: '跳跃距离', pierce: '分叉' },
  flame: { count: '火焰更密', area: '火焰更大', pierce: '已全穿透' },
  slash: { count: '多斩一刀', area: '斩击范围', pierce: '剑气飞出' },
};
