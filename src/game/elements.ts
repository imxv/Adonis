import Phaser from 'phaser';
import { audio } from '../audio/audio';
import type { Element } from '../core/stats';
import { dist2, hexToNum } from '../core/math';
import { rand } from '../core/rng';
import { DEPTH } from './fx';
import { ELEMENT_COLOR, type Enemy, type Img } from './entities';
import type { GameScene } from './GameScene';

/*
 * Genshin's elemental rules. A hit carrying an element leaves an aura on the enemy (Anemo and Geo never stay);
 * the next element to land reacts with it:
 *   Vaporize (Hydro/Pyro) and Melt (Pyro/Cryo) multiply the hit, x2 one way and x1.5 the other;
 *   Overloaded (Pyro/Electro) explodes; Superconduct (Cryo/Electro) bursts and lowers resistance;
 *   Electro-Charged (Hydro/Electro) keeps zapping and jumps to wet neighbours; Frozen (Hydro/Cryo) locks the enemy
 *   until it thaws or a heavy blow shatters it; Swirl (Anemo) spreads the aura's element around; Crystallize (Geo)
 *   drops a shard that shields whoever picks it up; Burning (Dendro/Pyro) burns the area; Bloom (Dendro/Hydro)
 *   grows a Dendro Core that bursts, or turns into homing seeds on Electro (Hyperbloom) and a big blast on Pyro
 *   (Burgeon); Quicken (Dendro/Electro) makes later Electro (Aggravate) and Dendro (Spread) hits land harder.
 */

export const ELEMENTS: Element[] = ['fire', 'water', 'shock', 'ice', 'wind', 'rock', 'grass'];

/** How long an aura lasts on an enemy, in seconds. */
const AURA = 4;

/** Each art style's element: its local monsters carry it. The haunted keep is plain. */
export const STYLE_ELEMENT: Record<string, Element | undefined> = {
  forest: 'grass',
  glacier: 'ice',
  desert: 'rock',
  volcano: 'fire',
  factory: 'fire',
  castle: undefined,
  garden: 'wind',
  palace: 'rock',
  reef: 'water',
  neon: 'shock',
};

/** Elemental shields and the element that breaks them, after Genshin's Abyss Mages and their kin. */
export const SHIELD_COUNTER: Partial<Record<Element, Element>> = { fire: 'water', water: 'ice', ice: 'fire', shock: 'ice', rock: 'rock', grass: 'fire' };

export interface Core {
  x: number;
  y: number;
  t: number;
  dmg: number;
  img: Img;
}

const col = (el: Element) => ELEMENT_COLOR[el];

/** A reaction's name over the enemy, in the colour of the element that set it off. */
function say(s: GameScene, e: Enemy, name: string, el: Element) {
  s.fx.callout(e.x, e.y - e.r * 2 - 14, name, col(el));
}

/**
 * `el` lands on `e` with a hit of `hit` damage. Returns the multiplier for that hit (Vaporize and Melt) and
 * plays out everything else the reaction does.
 */
export function react(s: GameScene, e: Enemy, el: Element, hit: number): number {
  const st = e.status;
  const pow = s.run.mods.elementPower;
  const aura = st.auraT > 0 ? st.aura : undefined;
  let mult = 1;

  // Quicken: Electro and Dendro land harder on a quickened enemy.
  if (st.quicken > 0 && el === 'shock') {
    mult += 0.8 * pow;
    say(s, e, '超激化', el);
  } else if (st.quicken > 0 && el === 'grass') {
    mult += 1.0 * pow;
    say(s, e, '蔓激化', el);
  }
  // Dendro Cores nearby answer Electro (Hyperbloom) and Pyro (Burgeon).
  if (el === 'shock' || el === 'fire') wakeCores(s, e.x, e.y, el);

  const settle = () => {
    if (el !== 'wind' && el !== 'rock') {
      st.aura = el;
      st.auraT = AURA;
    }
  };
  const consume = () => {
    st.aura = undefined;
    st.auraT = 0;
    st.regrow = 1.2;
  };
  if (!aura || aura === el) {
    settle();
    return mult;
  }

  const pair = (a: Element, b: Element) => (el === a && aura === b) || (el === b && aura === a);
  if (el === 'water' && aura === 'fire') {
    consume();
    say(s, e, '蒸发', el);
    return mult + 1 * pow;
  }
  if (el === 'fire' && aura === 'water') {
    consume();
    say(s, e, '蒸发', el);
    return mult + 0.5 * pow;
  }
  if (el === 'fire' && aura === 'ice') {
    consume();
    say(s, e, '融化', el);
    return mult + 1 * pow;
  }
  if (el === 'ice' && aura === 'fire') {
    consume();
    say(s, e, '融化', el);
    return mult + 0.5 * pow;
  }
  if (pair('fire', 'shock')) {
    consume();
    say(s, e, '超载', 'fire');
    s.explode(e.x, e.y, 34, hit * 0.9 * pow, { src: '超载', knock: 240, small: true, element: 'fire', noReact: true, volume: 0.45 });
    return mult;
  }
  if (pair('ice', 'shock')) {
    consume();
    say(s, e, '超导', 'ice');
    s.fx.ring(e.x, e.y - 4, 40, col('ice'), 300, 2);
    s.fx.sparks(e.x, e.y - 4, 10, 'ice');
    for (const o of s.enemies) {
      if (o.dead || dist2(o.x, o.y, e.x, e.y) > 40 * 40) continue;
      o.status.shred = 8;
      if (o !== e) s.damageEnemy(o, hit * 0.5 * pow, { src: '超导', noCrit: true, noReact: true, color: col('ice') });
    }
    st.shred = 8;
    return mult + 0.5 * pow;
  }
  if (pair('water', 'shock')) {
    // Both stay: the Hydro keeps the enemy wet while the current runs.
    st.aura = 'water';
    st.auraT = AURA;
    st.ec = 4;
    st.ecTick = 0.5;
    st.ecDmg = Math.max(st.ecDmg, hit * 0.45 * pow);
    say(s, e, '感电', 'shock');
    return mult;
  }
  if (pair('water', 'ice')) {
    consume();
    st.frozen = e.boss ? 0.7 : 2.4;
    say(s, e, '冻结', 'ice');
    s.fx.sparks(e.x, e.y - 4, 8, 'ice');
    return mult;
  }
  if (el === 'wind' && (aura === 'fire' || aura === 'water' || aura === 'shock' || aura === 'ice')) {
    // Swirl: the aura's element is blown onto everything around, which can set off more reactions.
    consume();
    say(s, e, '扩散', 'wind');
    s.fx.ring(e.x, e.y - 4, 46, col(aura), 320, 2);
    s.fx.ring(e.x, e.y - 4, 30, col('wind'), 260, 1);
    for (const o of s.enemies) {
      if (o === e || o.dead || dist2(o.x, o.y, e.x, e.y) > 46 * 46) continue;
      s.damageEnemy(o, hit * 0.6 * pow, { src: '扩散', noCrit: true, element: aura, color: col(aura) });
    }
    return mult + 0.6 * pow;
  }
  if (el === 'rock' && (aura === 'fire' || aura === 'water' || aura === 'shock' || aura === 'ice')) {
    consume();
    say(s, e, '结晶', 'rock');
    s.dropCrystal(e.x + rand(-8, 8), e.y + rand(-6, 6), aura);
    return mult;
  }
  if (pair('grass', 'fire')) {
    st.aura = 'fire';
    st.auraT = AURA;
    st.burnT = 4;
    st.burnTick = 0.25;
    st.burnDmg = Math.max(st.burnDmg, hit * 0.3 * pow);
    say(s, e, '燃烧', 'fire');
    return mult;
  }
  if (pair('grass', 'water')) {
    consume();
    say(s, e, '绽放', 'grass');
    growCore(s, e.x + rand(-10, 10), e.y + rand(-8, 8), hit * 1.1 * pow);
    return mult;
  }
  if (pair('grass', 'shock')) {
    consume();
    st.quicken = 8;
    say(s, e, '原激化', 'grass');
    return mult;
  }
  // Anemo and Geo do nothing to Dendro; the aura simply stays.
  return mult;
}

/** A heavy blow on a frozen enemy shatters the ice. Returns the extra damage. */
export function shatter(s: GameScene, e: Enemy, hit: number): number {
  if (e.status.frozen <= 0) return 0;
  e.status.frozen = 0;
  say(s, e, '碎冰', 'ice');
  for (let i = 0; i < 6; i++) s.spawnProj('shard', e.x, e.y - 4, (i / 6) * Math.PI * 2, 200, 0.3, 2, 0, 0, 10, '碎冰').hit.add(e);
  s.fx.sparks(e.x, e.y - 4, 12, 'ice');
  audio.glass();
  return hit * 1.5 * s.run.mods.elementPower + 6;
}

// ---------------------------------------------------------------- Dendro Cores (Bloom)

function growCore(s: GameScene, x: number, y: number, dmg: number) {
  // At most five on the floor: a sixth makes the oldest burst at once.
  if (s.cores.length >= 5) burstCore(s, s.cores[0]);
  const img = s.add.image(Math.round(x), Math.round(y), 'dendro-core').setDepth(DEPTH.pickup + 0.2);
  s.tweens.add({ targets: img, scale: { from: 0.2, to: 1 }, duration: 200, ease: 'Back.easeOut' });
  s.cores.push({ x, y, t: 0, dmg, img });
}

function burstCore(s: GameScene, c: Core) {
  removeCore(s, c);
  s.fx.ring(c.x, c.y, 32, col('grass'), 260, 2);
  s.fx.sparks(c.x, c.y, 10, 'grass');
  for (const e of s.enemies) if (!e.dead && dist2(e.x, e.y, c.x, c.y) < 32 * 32) s.damageEnemy(e, c.dmg, { src: '绽放', noCrit: true, element: 'grass', noReact: true, color: col('grass') });
}

function removeCore(s: GameScene, c: Core) {
  c.img.destroy();
  s.cores.splice(s.cores.indexOf(c), 1);
}

/** Electro near a core sends it out as homing seeds (Hyperbloom); Pyro blows it up (Burgeon). */
function wakeCores(s: GameScene, x: number, y: number, el: Element) {
  for (const c of [...s.cores]) {
    if (dist2(c.x, c.y, x, y) > 48 * 48) continue;
    removeCore(s, c);
    if (el === 'shock') {
      s.fx.callout(c.x, c.y - 14, '超绽放', col('shock'));
      for (let i = 0; i < 2; i++) {
        const p = s.spawnProj('orb', c.x, c.y, rand(0, Math.PI * 2), 150, 2.2, 3, c.dmg * 1.4, 0, 30, '超绽放');
        p.homing = 9;
        p.element = 'grass';
        p.sprite.setTint(hexToNum(col('grass')));
      }
    } else {
      s.fx.callout(c.x, c.y - 14, '烈绽放', col('fire'));
      s.explode(c.x, c.y, 52, c.dmg * 1.5, { src: '烈绽放', knock: 160, element: 'fire', noReact: true, volume: 0.4 });
    }
  }
}

/** Cores ripen and burst on their own after a few seconds. */
export function updateCores(s: GameScene, dt: number) {
  for (const c of [...s.cores]) {
    c.t += dt;
    c.img.setScale(1 + Math.sin(c.t * 10) * 0.08 * Math.min(1, c.t));
    if (c.t > 3) burstCore(s, c);
  }
}

export function clearCores(s: GameScene) {
  for (const c of [...s.cores]) removeCore(s, c);
}

// ---------------------------------------------------------------- marks over enemies

/** Keep the little element mark over an enemy's head in step with its aura. */
export function markAura(s: GameScene, e: Enemy) {
  const st = e.status;
  const el = st.auraT > 0 ? st.aura : undefined;
  if (!el) {
    e.auraImg?.setVisible(false);
    return;
  }
  e.auraImg ??= s.add.image(0, 0, `el-${el}`).setDepth(DEPTH.numbers - 0.3);
  e.auraImg.setTexture(`el-${el}`).setVisible(true).setAlpha(st.auraT < 1 ? (Math.floor(s.time0 * 8) % 2 ? 0.4 : 1) : 1);
  e.auraImg.setPosition(Math.round(e.x), Math.round(e.y - e.r * 2 - 8));
}

/** The elite's shield ring takes its element's colour; a broken shield leaves the plain elite glow. */
export function tintShield(e: Enemy, danger: string) {
  if (!e.ring) return;
  e.ring.setTint(hexToNum(e.eshield ? col(e.eshield.el) : danger)).setBlendMode(Phaser.BlendModes.ADD);
}
