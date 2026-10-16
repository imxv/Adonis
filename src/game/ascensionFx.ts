import Phaser from 'phaser';
import { PET_ART_KINDS } from '../pixel/petArt';
import type { GameScene } from './GameScene';
import { DEPTH } from './fx';

const GOLD = 0xfee761;
const IVORY = 0xfff4dc;
const BRONZE = 0xfeae34;
const TAU = Math.PI * 2;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

/** Integer points keep the new sacred geometry on the game's one-pixel grid. */
function pixelLine(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, width = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    g.fillRect(Math.round(x0 + (x1 - x0) * i / steps), Math.round(y0 + (y1 - y0) * i / steps), width, width);
  }
}

function ring(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, squash = 1, phase = 0, dashed = false) {
  const steps = Math.max(24, Math.ceil(radius * TAU));
  for (let i = 0; i < steps; i++) {
    if (dashed && Math.floor(i / 5) % 2) continue;
    const a = phase + i / steps * TAU;
    g.fillRect(Math.round(x + Math.cos(a) * radius), Math.round(y + Math.sin(a) * radius * squash), 1, 1);
  }
}

function star(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number) {
  x = Math.round(x); y = Math.round(y);
  g.fillRect(x - size, y, size * 2 + 1, 1);
  g.fillRect(x, y - size, 1, size * 2 + 1);
}

/**
 * Driven only by the caller's real delta: safe while gameplay clocks are paused.
 * Neither the actual player nor pets, camera, input, or game state is modified.
 */
export class AscensionFx {
  private t = 0;
  private duration = 2.6;
  private running = false;
  private reduced = false;
  private readonly reducedMotion = typeof window === 'undefined' ? undefined : window.matchMedia('(prefers-reduced-motion: reduce)');
  private x = 0;
  private y = 0;
  private veil?: Phaser.GameObjects.Graphics;
  private light?: Phaser.GameObjects.Graphics;
  private hero?: Phaser.GameObjects.Image;
  private companions: Phaser.GameObjects.Image[] = [];
  private aura?: Phaser.GameObjects.Graphics;
  private auraTop?: Phaser.GameObjects.Graphics;
  private auraActive = false;
  private auraT = 0;
  private disposed = false;

  constructor(private readonly scene: GameScene) {
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  get revealed(): boolean { return this.t >= this.duration * 0.5; }

  start() {
    if (this.disposed) return;
    this.reset();
    this.reduced = this.reducedMotion?.matches ?? false;
    this.duration = this.reduced ? 0.7 : 2.6;
    this.t = 0;
    this.running = true;
    this.x = Math.round(this.scene.player.x);
    this.y = Math.round(this.scene.player.y);
    this.veil = this.scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.flash + 0.1);
    this.light = this.scene.add.graphics().setDepth(DEPTH.flash + 0.2);
    const player = this.scene.player.sprite;
    this.hero = this.scene.add.image(this.x, this.y, player.texture.key)
      .setOrigin(player.originX, player.originY).setFlipX(player.flipX).setDepth(DEPTH.flash + 0.4);
    if (!this.reduced) {
      for (const kind of PET_ART_KINDS) {
        const key = `pet-${kind}-idle-0`;
        if (this.scene.textures.exists(key)) {
          this.companions.push(this.scene.add.image(this.x, this.y, key)
            .setScale(0.6).setAlpha(0).setDepth(DEPTH.flash + 0.3));
        }
      }
    }
    this.paint();
  }

  /** Returns true after completion (and when inactive). Delta is in seconds. */
  update(realDt: number): boolean {
    if (!this.running) return true;
    // A background tab must not accumulate multiple seconds of unseen choreography.
    this.t += Math.max(0, Math.min(realDt, 0.1));
    this.paint();
    if (this.t < this.duration) return false;
    this.clearCinematic();
    return true;
  }

  private paint() {
    if (!this.light || !this.veil || !this.hero) return;
    const p = clamp(this.t / this.duration);
    const enter = ease(p / 0.18);
    const exit = 1 - ease((p - 0.78) / 0.22);
    const visibility = enter * exit;
    const g = this.light;
    const x = this.x;
    const y = this.y;
    g.clear();
    this.veil.clear();
    const camera = this.scene.cameras.main;
    this.veil.fillStyle(0x07060b, visibility * (this.reduced ? 0.22 : 0.66));
    this.veil.fillRect(-2, -2, camera.width + 4, camera.height + 4);
    if (this.revealed) this.hero.setTexture('jesus-a');
    this.hero.setAlpha(exit);

    if (this.reduced) {
      // No zoom, motion, rotation, or flash: a brief, softly appearing golden seal.
      g.fillStyle(GOLD, visibility * 0.65);
      ring(g, x, y + 2, 25, 0.4);
      ring(g, x, y - 10, 23);
      g.fillStyle(IVORY, visibility * 0.75);
      star(g, x, y - 39, 4);
      return;
    }

    const gather = ease(p / 0.46);
    const reveal = ease((p - 0.48) / 0.18);
    const floatY = Math.round(Math.sin(Math.PI * ease(p)) * 5);
    this.hero.setPosition(x, y - floatY);

    // A gold nave of light rises from the ground without a full-screen white flash.
    const pillar = ease((p - 0.24) / 0.28) * exit;
    for (let i = 0; i < 7; i++) {
      const width = 9 + i * 9;
      g.fillStyle(i % 2 ? IVORY : GOLD, pillar * (0.075 - i * 0.008));
      g.fillRect(x - Math.floor(width / 2), y - 170, width, 171);
    }

    // Two counter-rotating pixel seals and nine small devotional nodes.
    g.fillStyle(GOLD, visibility * 0.8);
    ring(g, x, y + 2, 21 + gather * 20, 0.38);
    ring(g, x, y + 2, 28 + gather * 25, 0.38, this.t * 0.2, true);
    for (let i = 0; i < 9; i++) {
      const a = i * TAU / 9 + this.t * 0.3;
      star(g, x + Math.cos(a) * 42, y + 2 + Math.sin(a) * 16, 1);
    }

    // Pets orbit as copies: never teleport or hide the real combat companions.
    const orbitRadius = 66 - gather * 21 + reveal * 8;
    const petOpacity = enter * (1 - ease((p - 0.56) / 0.2));
    this.companions.forEach((pet, i) => {
      const a = i * TAU / this.companions.length - Math.PI / 2 + this.t * 0.85;
      const px = x + Math.cos(a) * orbitRadius;
      const py = y - 21 + Math.sin(a) * orbitRadius * 0.63 - gather * 5;
      pet.setPosition(Math.round(px), Math.round(py)).setAlpha(petOpacity * 0.92);
      g.fillStyle(BRONZE, petOpacity * 0.25);
      pixelLine(g, px, py, x, y - 13);
      g.fillStyle(IVORY, petOpacity * 0.85);
      star(g, px, py + 12, 1);
    });

    // A halo-and-cross mandorla appears at the reveal beat behind the new hero.
    const seal = ease((p - 0.35) / 0.18) * exit;
    g.fillStyle(GOLD, seal * 0.82);
    ring(g, x, y - 14, 25 + reveal * 5);
    ring(g, x, y - 14, 29 + reveal * 6, 1, -this.t * 0.15, true);
    g.fillStyle(IVORY, seal * 0.48);
    g.fillRect(x - 1, y - 52, 3, 59);
    g.fillRect(x - 18, y - 37, 37, 3);

    // A single expanding sunburst. Every ray and mote is snapped to the pixel grid.
    const burst = clamp((p - 0.48) / 0.4);
    if (burst > 0) {
      const radius = 32 + ease(burst) * 88;
      const alpha = Math.sin(Math.PI * burst) * exit;
      g.fillStyle(GOLD, alpha * 0.8);
      ring(g, x, y - 13, radius, 0.78, 0, true);
      for (let i = 0; i < 18; i++) {
        const a = i * TAU / 18;
        const inner = 35 + burst * 23;
        const outer = inner + Math.sin(Math.PI * burst) * (i % 2 ? 13 : 29);
        g.fillStyle(i % 2 ? GOLD : IVORY, alpha * (i % 2 ? 0.5 : 0.8));
        pixelLine(g, x + Math.cos(a) * inner, y - 13 + Math.sin(a) * inner,
          x + Math.cos(a) * outer, y - 13 + Math.sin(a) * outer);
      }
    }

    // Calm ascending embers give the resolution a lingering finish.
    for (let i = 0; i < 32; i++) {
      const progress = (this.t * (0.35 + (i % 4) * 0.07) + i * 0.618) % 1;
      const sx = x + Math.sin(i * 8.73) * (20 + (i % 5) * 7);
      const sy = y + 8 - progress * 98;
      const alpha = Math.sin(progress * Math.PI) * visibility;
      g.fillStyle(i % 3 ? GOLD : IVORY, alpha * 0.75);
      if (i % 6 === 0) star(g, sx, sy, 1);
      else g.fillRect(Math.round(sx), Math.round(sy), 1, 2);
    }
  }

  syncAura(active: boolean) {
    if (this.disposed) return;
    this.auraActive = active;
    if (active) this.reduced = this.reducedMotion?.matches ?? false;
    if (active && !this.aura) {
      this.aura = this.scene.add.graphics().setDepth(DEPTH.shadow + 0.1);
      this.auraTop = this.scene.add.graphics().setDepth(DEPTH.gfx - 0.1);
    }
    if (!active) { this.aura?.clear(); this.auraTop?.clear(); }
  }

  updateAura(dt: number) {
    if (!this.auraActive || !this.aura || !this.auraTop || !this.scene.player) return;
    this.auraT += Math.max(0, Math.min(dt, 0.1));
    const { x, y, sprite } = this.scene.player;
    this.aura.clear(); this.auraTop.clear();
    if (!sprite.visible) return;
    // Persistent form stays readable in combat: a small floor sigil and three motes.
    const pulse = this.reduced ? 0.45 : 0.4 + Math.sin(this.auraT * 1.7) * 0.08;
    this.aura.fillStyle(GOLD, pulse);
    ring(this.aura, Math.round(x), Math.round(y + 2), 10, 0.38);
    this.aura.fillStyle(IVORY, pulse * 0.7);
    star(this.aura, x - 11, y + 2, 1);
    star(this.aura, x + 11, y + 2, 1);
    if (!this.reduced) for (let i = 0; i < 3; i++) {
      const progress = (this.auraT * 0.38 + i / 3) % 1;
      this.auraTop.fillStyle(i % 2 ? IVORY : GOLD, Math.sin(progress * Math.PI) * 0.6);
      this.auraTop.fillRect(Math.round(x + Math.sin(i * 2.7) * 10), Math.round(y - progress * 24), 1, 1);
    }
  }

  private clearCinematic() {
    this.running = false;
    this.veil?.destroy(); this.veil = undefined;
    this.light?.destroy(); this.light = undefined;
    this.hero?.destroy(); this.hero = undefined;
    for (const pet of this.companions) pet.destroy();
    this.companions.length = 0;
  }

  reset() {
    this.clearCinematic();
    this.t = 0;
    this.auraT = 0;
    this.syncAura(false);
  }

  destroy() {
    if (this.disposed) return;
    this.reset();
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.aura?.destroy(); this.aura = undefined;
    this.auraTop?.destroy(); this.auraTop = undefined;
    this.disposed = true;
  }
}
