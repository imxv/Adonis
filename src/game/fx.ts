import Phaser from 'phaser';
import { hexToNum } from '../core/math';
import { K, textTexture } from '../styles/textures';
import type { StyleKit } from '../styles/types';
import { ELEMENT_COLOR } from './entities';
import type { Element } from '../core/stats';
import { E } from '../pixel/palette';
import { settings } from '../settings';

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
  doors: 10.5,
  // Everything above the light layer glows: effects, numbers and the cursor are never darkened.
  light: 10.8,
  gfx: 11,
  particles: 12,
  numbers: 13,
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
  /** Closing in: speeds up and brightens as it shrinks. */
  inward?: boolean;
}

interface Boom {
  img: Phaser.GameObjects.Image;
  t: number;
}

/** A mote of energy spiralling in to a moving target, arriving exactly when its stream ends. */
interface Mote {
  a0: number;
  r0: number;
  spin: number;
  delay: number;
  color: number;
}

interface Stream {
  target: () => { x: number; y: number };
  t: number;
  dur: number;
  motes: Mote[];
}

/** Light rays turning slowly behind something important. */
interface Rays {
  x: number;
  y: number;
  r: number;
  t: number;
  dur: number;
  color: number;
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
  private dimRect: Phaser.GameObjects.Rectangle;
  private streams: Stream[] = [];
  private streamGfx: Phaser.GameObjects.Graphics;
  private rays: Rays[] = [];
  private rayGfx: Phaser.GameObjects.Graphics;
  private shakeUntil = 0;
  private shakeAmt = 0;

  constructor(private scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    this.flashRect = scene.add.rectangle(-16, -16, width + 32, height + 32, 0xffffff, 1).setOrigin(0).setAlpha(0).setDepth(DEPTH.flash).setScrollFactor(0);
    this.ringGfx = scene.add.graphics().setDepth(DEPTH.particles);
    // Just above the light layer: darkens the world but not the effects drawn over it.
    this.dimRect = scene.add.rectangle(-16, -16, width + 32, height + 32, 0x07060b, 1).setOrigin(0).setAlpha(0).setDepth(DEPTH.light + 0.05).setScrollFactor(0);
    this.streamGfx = scene.add.graphics().setDepth(DEPTH.particles + 0.4).setBlendMode(Phaser.BlendModes.ADD);
    this.rayGfx = scene.add.graphics().setDepth(DEPTH.numbers + 0.8).setBlendMode(Phaser.BlendModes.ADD);
  }

  /** Darken the world (not the effects) toward `alpha` over `dur` ms. */
  dim(alpha: number, dur: number) {
    this.scene.tweens.killTweensOf(this.dimRect);
    this.scene.tweens.add({ targets: this.dimRect, alpha, duration: dur, ease: 'Quad.easeOut' });
  }

  /**
   * Streams of energy pulled in from all around to a (moving) target. Every mote lands at `dur` seconds,
   * whenever it set off, so the whole stream arrives on one beat.
   */
  converge(target: () => { x: number; y: number }, dur: number, colors: string[], n = 60) {
    const cols = colors.map(hexToNum);
    const motes: Mote[] = [];
    for (let i = 0; i < n; i++) {
      motes.push({
        a0: Math.random() * Math.PI * 2,
        r0: 90 + Math.random() * 170,
        spin: (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.6),
        delay: Math.random() * dur * 0.55,
        color: cols[i % cols.length],
      });
    }
    this.streams.push({ target, t: 0, dur, motes });
  }

  /** Light rays fanning out from (x, y) and turning, for `dur` ms. */
  burstRays(x: number, y: number, r: number, color: string, dur: number) {
    this.rays.push({ x, y, r, t: 0, dur: dur / 1000, color: hexToNum(color) });
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
    if (!settings.get().shake) return;
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

  /** A ring that closes in on a point instead of spreading out. */
  implode(x: number, y: number, radius: number, color: string, dur = 300, width = 1) {
    this.rings.push({ x, y, r0: radius, r1: 2, t: 0, dur: dur / 1000, color: hexToNum(color), width, inward: true });
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
    // Heal text still shows when damage numbers are switched off.
    if (!settings.get().numbers && !opts.text) return;
    if (this.nums.length > 90) this.recycle(this.nums[0]);
    const text = opts.text ?? String(Math.max(1, Math.round(value)));
    const color = opts.color ?? (opts.crit ? E.yellow : E.white);
    // Plain hits use the 8px numeral font; crits use the 12px font, so they read bigger at a whole-pixel scale.
    const key = textTexture(this.scene, text, { color, outline: E.ink, small: !opts.crit });
    const img = (this.free.pop() ?? this.scene.add.image(0, 0, key)).setTexture(key).setDepth(DEPTH.numbers).setVisible(true).setAlpha(1).setScale(1);
    img.setPosition(Math.round(x + Phaser.Math.Between(-4, 4)), Math.round(y));
    const life = opts.crit ? 0.7 : opts.small ? 0.4 : 0.5;
    this.nums.push({ img, y, vy: opts.crit ? -46 : -32, life, max: life });
  }

  /** A word that pops up in the world, in the pixel font. */
  callout(x: number, y: number, text: string, color: string = E.white, big = false) {
    const img = this.scene.add.image(Math.round(x), Math.round(y), textTexture(this.scene, text, { color, outline: E.ink, size: big ? 24 : 12 })).setDepth(DEPTH.numbers + 0.5);
    img.setScale(0.5);
    this.scene.tweens.add({ targets: img, scale: 1, duration: 90, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: img, y: y - 14, alpha: 0, delay: 520, duration: 360, ease: 'Quad.easeIn', onComplete: () => img.destroy() });
  }

  private drawStreams(dt: number) {
    const g = this.streamGfx;
    g.clear();
    for (let i = this.streams.length - 1; i >= 0; i--) {
      const s = this.streams[i];
      s.t += dt;
      if (s.t >= s.dur) {
        this.streams.splice(i, 1);
        continue;
      }
      const c = s.target();
      for (const m of s.motes) {
        if (s.t < m.delay) continue;
        const k = (s.t - m.delay) / (s.dur - m.delay);
        // Slow at first, then rushing in: a short tail early on, a long streak at the end.
        const at = (q: number) => {
          const e = q * q * q;
          const r = m.r0 * (1 - e);
          const a = m.a0 + m.spin * e;
          return [c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.8];
        };
        const [hx, hy] = at(k);
        const [tx, ty] = at(Math.max(0, k - 0.05 - k * 0.1));
        g.lineStyle(1, m.color, 0.35 + k * 0.5);
        g.lineBetween(tx, ty, hx, hy);
        g.fillStyle(0xffffff, 0.6 + k * 0.4);
        g.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 2, 2);
      }
    }
  }

  private drawRays(dt: number) {
    const g = this.rayGfx;
    g.clear();
    for (let i = this.rays.length - 1; i >= 0; i--) {
      const r = this.rays[i];
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        this.rays.splice(i, 1);
        continue;
      }
      // Grow in fast, hold, fade out over the last third.
      const len = r.r * Math.min(1, k * 6);
      const alpha = 0.5 * (k < 0.66 ? 1 : (1 - k) / 0.34);
      const n = 12;
      for (let j = 0; j < n; j++) {
        const a = r.t * 0.9 + (j / n) * Math.PI * 2;
        const w = j % 2 ? 0.07 : 0.12;
        g.fillStyle(r.color, alpha * (j % 2 ? 0.6 : 1));
        g.fillTriangle(r.x, r.y, r.x + Math.cos(a - w) * len, r.y + Math.sin(a - w) * len, r.x + Math.cos(a + w) * len, r.y + Math.sin(a + w) * len);
      }
    }
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
      g.lineStyle(r.width, r.color, r.inward ? 0.25 + 0.75 * k : 1 - k);
      g.strokeCircle(r.x, r.y, r.r0 + (r.r1 - r.r0) * (r.inward ? k * k : 1 - Math.pow(1 - k, 3)));
    }
    this.drawStreams(dt);
    this.drawRays(dt);
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
