import { FORK_DAMAGE, magSize, reloadTime, type MeleeMove, type MoveKind, type WeaponInstance } from '../data/weapons';
import type { RunState } from './run';

/** Shared with combat so the inspection panel includes the weapon-wide damage tuning. */
export const WEAPON_POWER = 1.15;

export interface MeleeMoveMetrics {
  move: MoveKind;
  name: string;
  /** Damage of each contact, before critical hits, elemental reactions or rhythm bonuses. */
  damage: number;
  /** Maximum contacts against one target; overlapping arcs/crosses still depend on aim. */
  hits: number;
  range: number;
  finisher: boolean;
}

export interface WeaponMetrics {
  damage: number;
  damageLabel: string;
  /** Attacks per second before magazine downtime; Gatling starts at attackRate. */
  attackRate: number;
  maxAttackRate: number;
  /** World pixels: first melee move's reach, otherwise the nominal maximum firing range. */
  range: number;
  maxRange: number;
  rangeLabel: string;
  /** Projectiles per attack, targets per chain, or contacts of the first melee move. */
  projectileCount: number;
  /** Zero denotes a weapon that never reloads. */
  magazine: number;
  reloadSeconds: number;
  explosionRadius: number;
  jumpRange: number;
  /** Additional targets passed through; beam/flame/boomerang have unrestricted enemy piercing. */
  pierce: number;
  projectileSpeed: number;
  knockback: number;
  traits: string[];
  usage: string;
  note: string;
  meleeCombo: MeleeMoveMetrics[];
}

const MOVE_NAMES: Record<MoveKind, string> = {
  arc: '横斩', thrust: '突刺', smash: '下砸', spin: '回旋斩', slam: '震地', lunge: '冲锋突刺', cross: '十字斩', whirl: '死亡旋风',
};

const USAGE: Record<string, string> = {
  pistol: '瞄准并按住攻击，稳定连续射击',
  smg: '按住攻击，近中距离密集压制',
  crossbow: '瞄准一列敌人，让弩箭连续贯穿',
  sniper: '拉开距离，瞄准一列敌人射击',
  shotgun: '贴近敌人开火，让更多弹丸命中',
  laser: '瞄准一列敌人，瞬发光束贯穿',
  grenade: '将准星放在敌群脚下，抛射爆炸',
  rocket: '瞄准敌群，火箭碰撞后范围爆炸',
  chakram: '对准敌群，利用飞出和折返命中',
  tesla: '对准前方敌人，电流自动跳向邻敌',
  flamer: '靠近并持续喷射，给敌人附着火',
  sword: '连续挥砍三次，第三刀回旋斩',
  spear: '连续突刺三次，第三击冲锋贯穿',
  hammer: '横扫接下砸，第三击震地打周围',
  daggers: '贴近连续出手，第四击十字斩',
  scythe: '连续横扫，第三击旋风连砍四次',
  bow: '对准敌群，一次射出多支穿透箭',
  shuriken: '利用墙面反弹，从侧面再次命中',
  gatling: '按住攻击约1.4秒，转速逐渐提高',
  frostlance: '冰锥命中碎裂，配合水元素冻结',
  tide: '持续附水，为冻结或感电做准备',
  gale: '近身吹退，扩散已有火水雷冰',
  quake: '瞄准地面抛射，击碎冻结或结晶',
  bramble: '贯穿附草，配合水火雷触发反应',
  keyboard: '射进敌群，代码块命中后向两侧分叉',
};

const number = (n: number) => Number(n.toFixed(1)).toString();

/**
 * Read-only inspection values, using the same formulas as GameScene.fireShot/updateWeapons.
 * Temporary dual-wield skill and rhythm state live on the scene, not RunState, and are excluded.
 * We deliberately do not publish a single DPS: pellets, chains and combo contacts hit differently.
 */
export function weaponMetrics(w: WeaponInstance, run: RunState): WeaponMetrics {
  const def = w.def;
  const m = run.mods;
  const extra = m.count;
  const count = def.count + extra;
  const lowHealth = run.hp <= m.maxHp / 2 ? 1 + m.desperate : 1;
  const damage = def.damage * WEAPON_POWER * m.damage * lowHealth;
  const rate = Math.max(0.2, m.fireRate * (1 + Math.min(0.4, run.frenzyStacks * m.frenzy)));
  const attackRate = rate / def.cooldown;
  const maxAttackRate = rate / (def.spinTo ?? def.cooldown);
  const pierceUpgrade = def.pierce + m.pierce;
  const moves: MeleeMove[] = def.kind === 'slash'
    ? def.combo ?? [{ move: 'arc', arc: def.spreadDeg, reach: 1, dmg: 1, dir: 1 }]
    : [];
  const meleeCombo = moves.map((move, i): MeleeMoveMetrics => ({
    move: move.move,
    name: move.name ?? (move.move === 'arc' && move.dir === -1 ? '反手斩' : MOVE_NAMES[move.move]),
    damage: damage * move.dmg * (move.move === 'cross' ? 0.6 : 1),
    hits: move.move === 'whirl' ? 4 : move.move === 'cross' ? 2 : move.move === 'arc' ? Math.min(3, count) : 1,
    range: def.range * m.area * move.reach + (move.move === 'lunge' ? 30 : 0),
    finisher: moves.length > 1 && i === moves.length - 1,
  }));
  const range = meleeCombo[0]?.range ?? def.range * m.range;
  const maxRange = meleeCombo.length ? Math.max(...meleeCombo.map((move) => move.range)) : range;
  const projectileCount = def.kind === 'slash'
    ? meleeCombo[0].hits
    : def.kind === 'spread' || def.kind === 'flame' ? def.count + extra * 2 : count;
  const explosionRadius = def.kind === 'mortar' || def.kind === 'rocket' ? def.size * m.area : 0;
  const jumpRange = def.kind === 'chain' ? def.size * m.area : 0;
  const projectileSpeed = def.speed * m.speed * (def.kind === 'boomerang' ? 1 + 0.15 * pierceUpgrade : 1);
  const magazine = magSize(w, m.mag);
  const traits: string[] = [];

  switch (def.kind) {
    case 'bolt':
      traits.push(`${projectileCount}枚／次`);
      if (pierceUpgrade > 0) traits.push(`每枚最多命中${pierceUpgrade + 1}个目标`);
      if (def.bounce) traits.push(`撞墙反弹${def.bounce}次`);
      if (def.split) traits.push(`碎成${def.split}片冰晶，每片${number(damage * 0.35)}伤害`);
      if (def.fork) traits.push(`命中或撞墙分叉${def.fork.length}层，每层一分二`, `分叉伤害${def.fork.map((_, i) => number(damage * FORK_DAMAGE ** (i + 1))).join('／')}`);
      if (def.spinTo) traits.push(`1.4秒升至${number(maxAttackRate)}次／秒`);
      break;
    case 'spread':
      traits.push(`${projectileCount}颗弹丸／次`, `近距离全中${number(damage * projectileCount)}伤害`);
      if (pierceUpgrade > 0) traits.push(`每颗最多命中${pierceUpgrade + 1}个目标`);
      break;
    case 'beam':
      traits.push(`${projectileCount}道瞬发光束`, '贯穿沿线全部敌人');
      if (pierceUpgrade > 0) traits.push(`撞墙反射${pierceUpgrade}次`);
      break;
    case 'mortar':
      traits.push(`${projectileCount}枚／次`, `爆炸半径${number(explosionRadius)}`, `飞行${number(Math.max(0.28, 0.5 / m.speed))}秒`);
      if (pierceUpgrade > 0) traits.push(`落点余烬持续${number(1.2 + pierceUpgrade * 0.7)}秒`);
      break;
    case 'rocket':
      traits.push(`${projectileCount}枚／次`, `爆炸半径${number(explosionRadius)}`, '命中或撞墙时引爆');
      break;
    case 'boomerang':
      traits.push(`${projectileCount}枚飞轮／次`, '去程回程各可命中一次', '穿过沿途全部敌人');
      break;
    case 'chain':
      traits.push(`最多连锁${projectileCount}个目标`, `跳跃距离${number(jumpRange)}`, '每跳保留92%伤害');
      if (pierceUpgrade > 0) traits.push(`分叉概率${number(Math.min(1, 0.3 * pierceUpgrade) * 100)}%`);
      break;
    case 'flame':
      traits.push(`${projectileCount}束／次`, '贯穿沿途全部敌人');
      break;
    case 'slash':
      traits.push(`${meleeCombo.length}段连击`, '挥击可斩掉敌方子弹');
      if (meleeCombo.length > 1) {
        const last = meleeCombo[meleeCombo.length - 1];
        traits.push(`${last.name} ${number(last.damage)}${last.hits > 1 ? `×${last.hits}` : ''}伤害`);
      }
      // Only arc/thrust moves launch blade waves in the actual melee switch.
      if (pierceUpgrade > 0 && moves.some((move) => move.move === 'arc' || move.move === 'thrust')) traits.push(`横斩／突刺附${number(damage * 0.6)}基础剑气`);
      break;
  }

  if (def.id === 'flamer') traits.push('附火；遇草触发燃烧');
  if (def.id === 'frostlance') traits.push('附冰；遇水触发冻结');
  if (def.id === 'tide') traits.push('附水：蒸发／感电／冻结／绽放');
  if (def.id === 'tesla') traits.push('附雷：感电／超载／超导／激化');
  if (def.id === 'gale') traits.push('强击退；扩散火水雷冰');
  if (def.id === 'quake') traits.push('遇元素结晶；可击碎冻结');
  if (def.id === 'bramble') traits.push('附草：燃烧／绽放／激化');

  return {
    damage,
    damageLabel: def.kind === 'slash' ? '首击伤害' : def.kind === 'chain' ? '首跳伤害' : def.kind === 'mortar' || def.kind === 'rocket' ? '爆炸伤害' : def.kind === 'spread' ? '每颗伤害' : '单次命中',
    attackRate,
    maxAttackRate,
    range,
    maxRange,
    rangeLabel: def.kind === 'slash' ? '首击距离' : def.kind === 'mortar' ? '投掷距离' : def.kind === 'chain' ? '锁定距离' : '最大射程',
    projectileCount,
    magazine,
    reloadSeconds: reloadTime(w, m.reload),
    explosionRadius,
    jumpRange,
    pierce: def.kind === 'beam' || def.kind === 'flame' || def.kind === 'boomerang' ? Infinity : def.kind === 'bolt' || def.kind === 'spread' ? pierceUpgrade : 0,
    projectileSpeed,
    knockback: def.kind === 'chain' ? 14 : def.knockback * m.knockback,
    traits,
    usage: USAGE[def.id] ?? def.desc,
    note: '已计入当前增益；不含暴击、元素反应、节拍及双持技能。',
    meleeCombo,
  };
}
