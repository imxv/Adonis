export type Element = 'fire' | 'ice' | 'shock';

/**
 * Player-wide modifiers. Every weapon (and, partially, every pet) reads from
 * this block; upgrades only ever touch these fields, never a single weapon.
 */
export interface Mods {
  damage: number; // multiplier
  fireRate: number; // multiplier on attacks per second
  count: number; // extra projectiles / beams / shells / blades / chain jumps
  area: number; // multiplier on size / width / radius / jump distance
  speed: number; // multiplier on projectile speed
  pierce: number; // extra pierce (meaning differs per delivery)
  range: number; // multiplier
  critChance: number; // 0..1
  critMult: number; // total crit multiplier
  knockback: number; // multiplier
  elements: Record<Element, number>; // chance to apply each element on hit
  elementPower: number; // multiplier on burn / chill / shock strength
  explodeOnHit: number; // chance a hit causes a small explosion
  splitOnCrit: number; // number of shards spawned when a crit lands
  healOnKill: number; // chance to heal half a heart on kill
  explodeOnKill: number; // 0 = off, otherwise damage fraction of the explosion
  frenzy: number; // fire-rate bonus per recent kill (stacks, decays)
  desperate: number; // damage bonus while under half health
  moveSpeed: number; // multiplier
  maxHp: number; // hit points
  maxArmor: number; // regenerating shield points (Soul Knight style)
  pickupRadius: number; // multiplier
  dashCooldown: number; // multiplier
  reload: number; // multiplier on reload time (lower is faster)
  mag: number; // multiplier on magazine size
  petInherit: number; // fraction of player damage bonuses pets inherit
  petRate: number; // multiplier on pet attack rate
}

export function baseMods(): Mods {
  return {
    damage: 1,
    fireRate: 1,
    count: 0,
    area: 1,
    speed: 1,
    pierce: 0,
    range: 1,
    critChance: 0.05,
    critMult: 2,
    knockback: 1,
    elements: { fire: 0, ice: 0, shock: 0 },
    elementPower: 1,
    explodeOnHit: 0,
    splitOnCrit: 0,
    healOnKill: 0,
    explodeOnKill: 0,
    frenzy: 0,
    desperate: 0,
    moveSpeed: 1,
    maxHp: 5,
    maxArmor: 4,
    pickupRadius: 1,
    dashCooldown: 1,
    reload: 1,
    mag: 1,
    petInherit: 0.5,
    petRate: 1,
  };
}

export type Tag = 'barrage' | 'crit' | 'element' | 'pet' | 'agile' | 'vital' | 'power';

export const TAG_NAMES: Record<Tag, string> = {
  barrage: '弹幕',
  crit: '暴击',
  element: '元素',
  pet: '宠物',
  agile: '身法',
  vital: '生命',
  power: '力量',
};
