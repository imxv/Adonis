import Phaser from 'phaser';
import { hexToNum } from '../core/math';
import { K, textTexture } from '../styles/textures';
import type { StyleKit } from '../styles/types';
import { ELEMENT_COLOR } from './entities';
import type { Element } from '../core/stats';
import { E } from '../pixel/palette';

export const DEPTH = {
  bg: 0,
  decal: 1,
  hazard: 2,
  shadow: 3,
  pickup: 4,
  obstacle: 5,
  enemy: 6,
  pet: 7,
  player: 8,
  gun: 8.5,
  proj: 9,
  ebullet: 10,
  gfx: 11,
  particles: 12,
  numbers: 13,
  doors: 14,
  vignette: 20,
  flash: 22,
  cursor: 30,
};

interface Num {
  img: Phaser.GameObjects.Image;
  y: number;
  vy: number;
  life: number;
  max: number;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  t: number;
  dur: number;
  color: number;
  width: number;
}

interface Boom {
  img: Phaser.GameObjects.Image;
  t: number;
}

const SPARK_COLORS: Record<string, string> = { white: E.white, accent: E.red, gold: E.yellow, ...ELEMENT_COLOR };

export class Fx {
  private nums: Num[] = [];
  private free: Phaser.GameObjects.Image[] = [];
  private rings: Ring[] = [];
  private booms: Boom[] = [];
  private ringGfx: Phaser.GameObjects.Graphics;
  private kit!: StyleKit;
  private emStyle?: Phaser.GameObjects.Particles.ParticleEmitter;
  private emPetal?: Phaser.GameObjects.Particles.ParticleEmitter;
  private emDust?: Phaser.GameObjects.Particles.ParticleEmitter;
  private emSpark: Record<string, Phaser.GameObjects.Particles.ParticleEmitter> = {};
  private flashRect: Phaser.GameObjects.Rectangle;
  private shakeUntil = 0;
  private shakeAmt = 0;

  constructor(private scene: Phaser.Scene) {
    this.flashRect = scene.add.rectangle(0, 0, 640, 360, 0xffffff, 1).setOrigin(0).setAlpha(0).setDepth(DEPTH.flash).setScrollFactor(0);
    this.ringGfx = scene.add.graphics().setDepth(DEPTH.particles);
  }

  setKit(kit: StyleKit) {
    this.kit = kit;
    this.emStyle?.destroy();
    this.emPetal?.destroy();
    this.emDust?.destroy();
    Object.values(this.emSpark).forEach((e) => e.destroy());
    this.emSpark = {};
    const s = this.scene;
    this.emStyle = s.add
      .particles(0, 0, K('pt', kit), {
        lifespan: { min: 300, max: 700 },
        speed: { min: 30, max: 120 },
        angle: { min: 0, max: 360 },
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(DEPTH.particles);
    this.emPetal = s.add
      .particles(0, 0, 'petal', {
        lifespan: { min: 350, max: 800 },
        speed: { min: 20, max: 90 },
        angle: { min: 0, max: 360 },
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(DEPTH.particles);
    this.emDust = s.add
      .particles(0, 0, 'smoke', {
        lifespan: { min: 250, max: 520 },
        speed: { min: 8, max: 40 },
        angle: { min: 180, max: 360 },
        scale: { start: 1, end: 0.3 },
        alpha: { start: 0.7, end: 0 },
        emitting: false,
      })
      .setDepth(DEPTH.particles - 1);
    for (const [k, col] of Object.entries(SPARK_COLORS)) {
      this.emSpark[k] = s.add
        .particles(0, 0, 'dot', {
          lifespan: { min: 120, max: 300 },
          speed: { min: 60, max: 210 },
          angle: { min: 0, max: 360 },
          scale: { start: 1, end: 0.5 },
          alpha: { start: 1, end: 0 },
          tint: hexToNum(col),
          emitting: false,
        })
        .setDepth(DEPTH.particles);
    }
  }

  shake(amount: number) {
    const cam = this.scene.cameras.main;
    const now = performance.now();
    if (now < this.shakeUntil && amount <= this.shakeAmt) return;
    this.shakeAmt = amount;
    const dur = 70 + amount * 260;
    this.shakeUntil = now + dur;
    cam.shake(dur, 0.002 + amount * 0.009, true);
  }

  flash(color: string, alpha = 0.35, dur = 180) {
    this.flashRect.setFillStyle(hexToNum(color), 1).setAlpha(alpha);
    this.scene.tweens.add({ targets: this.flashRect, alpha: 0, duration: dur, ease: 'Quad.easeOut' });
  }

  burst(x: number, y: number, n: number) {
    this.emStyle?.explode(n, x, y);
  }

  petals(x: number, y: number, n: number) {
    this.emPetal?.explode(n, x, y);
  }

  sparks(x: number, y: number, n: number, kind: 'white' | 'accent' | 'gold' | Element = 'white') {
    this.emSpark[kind]?.explode(n, x, y);
  }

  dust(x: number, y: number, n: number) {
    this.emDust?.explode(n, x, y);
  }

  ring(x: number, y: number, radius: number, color: string, dur = 300, width = 2) {
    this.rings.push({ x, y, r0: radius * 0.15, r1: radius, t: 0, dur: dur / 1000, color: hexToNum(color), width });
  }

  boom(x: number, y: number, size: number) {
    const img = this.scene.add.image(x, y, 'boom-0').setDepth(DEPTH.particles + 0.5).setScale(Math.max(0.6, size / 22));
    this.booms.push({ img, t: 0 });
  }

  glowPop(x: number, y: number, size: number, color: string, dur = 120) {
    const img = this.scene.add.image(x, y, 'glow').setDepth(DEPTH.particles).setTint(hexToNum(color)).setScale(size / 16);
    img.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8);
    this.scene.tweens.add({ targets: img, alpha: 0, duration: dur, onComplete: () => img.destroy() });
  }

  muzzle(x: number, y: number, a: number) {
    const img = this.scene.add.image(x, y, 'muzzle').setDepth(DEPTH.proj).setRotation(a);
    this.scene.time.delayedCall(45, () => img.destroy());
  }

  number(x: number, y: number, value: number, opts: { crit?: boolean; color?: string; small?: boolean; text?: string } = {}) {
    if (this.nums.length > 90) this.recycle(this.nums[0]);
    const text = opts.text ?? String(Math.max(1, Math.round(value)));
    const color = opts.color ?? (opts.crit ? E.yellow : E.white);
    const key = textTexture(this.scene, text, { size: 8, color, outline: E.ink });
    const img = (this.free.pop() ?? this.scene.add.image(0, 0, key)).setTexture(key).setDepth(DEPTH.numbers).setVisible(true).setAlpha(1);
    img.setScale(opts.crit ? 1.5 : opts.small ? 0.75 : 1);
    img.setPosition(Math.round(x + Phaser.Math.Between(-4, 4)), Math.round(y));
    this.nums.push({ img, y, vy: opts.crit ? -46 : -32, life: opts.crit ? 0.7 : 0.5, max: opts.crit ? 0.7 : 0.5 });
  }

  callout(x: number, y: number, text: string, color?: string, size = 12) {
    const key = textTexture(this.scene, text, { size, color: color ?? E.white, outline: E.ink });
    const img = this.scene.add.image(Math.round(x), Math.round(y), key).setDepth(DEPTH.numbers + 1).setScale(0.3);
    this.scene.tweens.add({ targets: img, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: img, alpha: 0, y: y - 14, delay: 520, duration: 260, onComplete: () => img.destroy() });
  }

  private recycle(n: Num) {
    n.img.setVisible(false);
    this.free.push(n.img);
    this.nums.splice(this.nums.indexOf(n), 1);
  }

  update(dt: number) {
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.life -= dt;
      n.y += n.vy * dt;
      n.vy *= 0.88;
      n.img.setY(Math.round(n.y)).setAlpha(n.life < 0.15 ? n.life / 0.15 : 1);
      if (n.life <= 0) this.recycle(n);
    }
    const g = this.ringGfx;
    g.clear();
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      g.lineStyle(r.width, r.color, 1 - k);
      g.strokeCircle(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 3)));
    }
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t += dt;
      const f = Math.floor(b.t / 0.055);
      if (f > 4) {
        b.img.destroy();
        this.booms.splice(i, 1);
      } else b.img.setTexture(`boom-${f}`);
    }
  }
}
