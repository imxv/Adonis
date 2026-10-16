import Phaser from 'phaser';
import { TAU, hexToNum } from '../core/math';
import { rand } from '../core/rng';
import { audio } from '../audio/audio';
import { E } from '../pixel/palette';
import { textTexture } from '../styles/textures';
import { openSpot, solidAt } from './dungeon';
import type { Img } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';

/*
 * A level-up does not stop the fight. It springs out of the knight as a gold crystal that lands nearby and waits,
 * spinning over a turning rune ring under a beam of light with 升级 written over it. Pressing F nearby is what opens
 * the three cards, so the player picks the moment. Crystals left behind go down the trapdoor with the knight and land
 * beside it on the next floor.
 */

/** Seconds a crystal spends in the air on its way out of the knight. */
const FLIGHT = 0.45;
const GOLD = hexToNum(E.yellow);

export interface LevelToken {
  x: number;
  y: number;
  x0: number;
  y0: number;
  t: number;
  /** The level this crystal stands for, shown on the cards. */
  level: number;
  landed: boolean;
  dead: boolean;
  crystal: Img;
  glow: Img;
  shadow: Img;
  label: Img;
  beam: Phaser.GameObjects.Rectangle;
  ring: Phaser.GameObjects.Graphics;
  light?: object;
  sparkT: number;
}

/** Throw one crystal out of the knight; `i` of `n` fans several out so they don't land on each other. */
export function dropLevelToken(s: GameScene, level: number, i = 0, n = 1) {
  const p = s.player;
  const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.8 + rand(-0.15, 0.15);
  let x = p.x + Math.cos(a) * 30;
  let y = p.y + Math.sin(a) * 24;
  if (solidAt(s.dungeon, x, y)) [x, y] = openSpot(s.dungeon, x, y);
  const crystal = s.add.image(p.x, p.y - 10, 'lvl-token').setDepth(DEPTH.pickup + 0.6);
  const glow = s.add.image(p.x, p.y - 10, 'glow').setDepth(DEPTH.pickup + 0.5).setTint(GOLD).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7).setScale(0.9);
  const shadow = s.add.image(x, y + 1, 'shadow').setDepth(DEPTH.shadow).setAlpha(0);
  const label = s.add.image(x, y - 42, textTexture(s, '升级', { color: E.yellow, outline: E.ink })).setDepth(DEPTH.numbers - 0.5).setAlpha(0);
  const beam = s.add.rectangle(x, y - 70, 8, 130, GOLD, 0).setDepth(DEPTH.pickup + 0.4).setBlendMode(Phaser.BlendModes.ADD);
  const ring = s.add.graphics().setDepth(DEPTH.decal + 0.8);
  s.levelTokens.push({ x, y, x0: p.x, y0: p.y - 10, t: 0, level, landed: false, dead: false, crystal, glow, shadow, label, beam, ring, sparkT: 0 });
  s.fx.sparks(p.x, p.y - 10, 10, 'gold');
  s.fx.ring(p.x, p.y - 6, 40, E.yellow, 300, 2);
  if (i === 0) audio.levelUp();
}

export function updateLevelTokens(s: GameScene, dt: number) {
  for (const k of s.levelTokens) {
    if (k.dead) continue;
    k.t += dt;
    if (!k.landed) {
      const q = Math.min(1, k.t / FLIGHT);
      const x = k.x0 + (k.x - k.x0) * q;
      const y = k.y0 + (k.y - 18 - k.y0) * q - Math.sin(Math.PI * q) * 26;
      k.crystal.setPosition(Math.round(x), Math.round(y)).setRotation(q * TAU * 1.5);
      k.glow.setPosition(x, y);
      if (q >= 1) land(s, k);
      continue;
    }
    const bob = Math.sin(k.t * 3) * 2;
    // Turning on its long axis: squeeze it to an edge and open it again, flipping as it passes.
    const spin = Math.cos(k.t * 2.4);
    k.crystal.setPosition(k.x, Math.round(k.y - 18 + bob)).setRotation(0).setScale(Math.max(0.3, Math.abs(spin)), 1).setFlipX(spin < 0);
    k.glow.setPosition(k.x, k.y - 18 + bob).setScale(1.1 + Math.sin(k.t * 4) * 0.14);
    k.beam.setFillStyle(GOLD, 0.1 + 0.06 * Math.sin(k.t * 2.5));
    k.label.setY(Math.round(k.y - 42 + bob * 0.5));
    drawRing(k);
    k.sparkT -= dt;
    if (k.sparkT <= 0) {
      k.sparkT = 0.22;
      s.fx.sparks(k.x + rand(-6, 6), k.y - 8, 1, 'gold');
    }
  }
  s.levelTokens = s.levelTokens.filter((k) => !k.dead);
}

function land(s: GameScene, k: LevelToken) {
  k.landed = true;
  k.t = 0;
  k.shadow.setAlpha(0.6);
  k.label.setAlpha(1);
  k.light = s.light.addStatic(k.x, k.y - 12, 46, E.yellow);
  s.fx.ring(k.x, k.y, 22, E.yellow, 260, 2);
  s.fx.dust(k.x, k.y, 4);
  s.fx.sparks(k.x, k.y - 10, 6, 'gold');
}

/** A gold rune ring under the crystal: dashes turning one way, a fainter ring the other. */
function drawRing(k: LevelToken) {
  const g = k.ring;
  g.clear();
  const pulse = 0.55 + 0.25 * Math.sin(k.t * 4);
  const seg = (r: number, a0: number, n: number, alpha: number) => {
    g.lineStyle(1, GOLD, alpha);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      g.beginPath();
      for (let j = 0; j <= 4; j++) {
        const q = a + ((TAU / n) * 0.6 * j) / 4;
        const x = k.x + Math.cos(q) * r;
        const y = k.y + 1 + Math.sin(q) * r * 0.4;
        if (j === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
  };
  seg(14, k.t * 1.4, 6, pulse);
  seg(9, -k.t * 2, 4, pulse * 0.7);
}

function destroyToken(s: GameScene, k: LevelToken) {
  k.dead = true;
  [k.crystal, k.glow, k.shadow, k.label, k.beam, k.ring].forEach((o) => o.destroy());
  if (k.light) s.light.removeStatic(k.light);
}

/** Explicit interaction: the crystal bursts and the cards are dealt. */
export function collectLevelToken(s: GameScene, k: LevelToken) {
  if (s.mode !== 'play' || s.fusing || !k.landed || k.dead) return;
  destroyToken(s, k);
  s.fx.ring(k.x, k.y - 10, 64, E.yellow, 420, 3);
  s.fx.implode(k.x, k.y - 10, 50, E.white, 260, 1);
  s.fx.sparks(k.x, k.y - 12, 18, 'gold');
  s.fx.burstRays(k.x, k.y - 12, 50, E.yellow, 500);
  s.light.flash(k.x, k.y - 12, 120, E.yellow, 0.3);
  s.fx.flash(E.white, 0.15, 200);
  s.openLevelUp(k.level);
}

/** Leaving the floor: the crystals still waiting go along, to land beside the knight downstairs. */
export function packLevelTokens(s: GameScene): number[] {
  const levels = s.levelTokens.filter((k) => !k.dead).map((k) => k.level);
  s.levelTokens.forEach((k) => !k.dead && destroyToken(s, k));
  s.levelTokens = [];
  return levels;
}
