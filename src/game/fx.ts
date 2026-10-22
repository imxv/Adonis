import Phaser from 'phaser';
import { hexToNum } from '../core/math';
import { K, textTexture } from '../styles/textures';
import type { StyleKit } from '../styles/types';
import { ELEMENT_COLOR, type Proj } from './entities';
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
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  /** Seconds left at double size: a crit lands big, then snaps down. */
  pop: number;
}

/** The star where a hit lands, two frames long. */
interface Hit {
  img: Phaser.GameObjects.Image;
  t: number;
  dur: number;
}

/** A chunk knocked off something: it flies, falls, bounces once and fades on the floor. */
interface Gib {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  /** Height above the floor. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  life: number;
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
  private trailGfx: Phaser.GameObjects.Graphics;
  private hits: Hit[] = [];
  private freeHits: Phaser.GameObjects.Image[] = [];
  private gibs: Gib[] = [];
  /** Camera shake as trauma: hits add to it, it drains away, and the view shakes in proportion. */
  private trauma = 0;
  private shakeT = 0;

  constructor(private scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    this.flashRect = scene.add.rectangle(-16, -16, width + 32, height + 32, 0xffffff, 1).setOrigin(0).setAlpha(0).setDepth(DEPTH.flash).setScrollFactor(0);
    this.ringGfx = scene.add.graphics().setDepth(DEPTH.particles);
    // Just above the light layer: darkens the world but not the effects drawn over it.
    this.dimRect = scene.add.rectangle(-16, -16, width + 32, height + 32, 0x07060b, 1).setOrigin(0).setAlpha(0).setDepth(DEPTH.light + 0.05).setScrollFactor(0);
    this.streamGfx = scene.add.graphics().setDepth(DEPTH.particles + 0.4).setBlendMode(Phaser.BlendModes.ADD);
    this.rayGfx = scene.add.graphics().setDepth(DEPTH.numbers + 0.8).setBlendMode(Phaser.BlendModes.ADD);
    this.trailGfx = scene.add.graphics().setDepth(DEPTH.proj - 0.1);
  }

  /** A short streak behind each fast shot, so bullets read as speed rather than dots. */
  trails(shots: Proj[]) {
    const g = this.trailGfx;
    g.clear();
    for (const p of shots) {
      if (p.dead || (p.kind !== 'bolt' && p.kind !== 'pellet' && p.kind !== 'shard')) continue;
      // Never longer than the way it has come, so a fresh shot doesn't trail back into the gun.
      const k = Math.min(0.022, (p.life0 ?? 0) - p.life);
      if (k <= 0) continue;
      g.lineStyle(1, p.element ? hexToNum(ELEMENT_COLOR[p.element]) : 0xfee761, 0.55);
      g.lineBetween(Math.round(p.x - p.vx * k), Math.round(p.y - p.vy * k), Math.round(p.x), Math.round(p.y));
    }
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

  /** Bullet time reaches the particles too. */
  setTimeScale(k: number) {
    for (const em of [this.emStyle, this.emPetal, this.emDust, ...Object.values(this.emSpark)]) if (em) em.timeScale = k;
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

  /** Shake the view. Shakes stack a little rather than replacing each other, and always ease out smoothly. */
  shake(amount: number) {
    if (!settings.get().shake) return;
    this.trauma = Math.min(1, Math.max(this.trauma, amount) + Math.min(this.trauma, amount) * 0.4);
  }

  /** Where the shake puts the camera this frame, in pixels: smooth wobble, not random jitter. */
  shakeOffset(): [number, number] {
    if (this.trauma <= 0) return [0, 0];
    const t = this.shakeT;
    const a = 9 * this.trauma;
    return [a * (Math.sin(t * 61) * 0.6 + Math.sin(t * 97 + 1.3) * 0.4), a * 0.8 * (Math.sin(t * 53 + 2.1) * 0.6 + Math.sin(t * 89 + 0.7) * 0.4)];
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

  /** The flash at the muzzle: a star for light guns, a cone of fire that flickers down for heavy ones. */
  muzzle(x: number, y: number, a: number, heavy = 0) {
    const s = this.scene;
    if (heavy < 0.04) {
      const img = s.add.image(x, y, 'muzzle').setDepth(DEPTH.proj).setRotation(a);
      s.time.delayedCall(45, () => img.destroy());
      return;
    }
    const big = Math.min(2, 1 + heavy * 6);
    const img = s.add.image(x, y, 'muzzle-big').setOrigin(0.12, 0.5).setDepth(DEPTH.proj).setRotation(a).setScale(big, Math.random() < 0.5 ? 1 : -1);
    s.time.delayedCall(40, () => img.setTexture('muzzle').setOrigin(0.5).setScale(1));
    s.time.delayedCall(80, () => img.destroy());
    this.dust(x + Math.cos(a) * 4, y + Math.sin(a) * 4, heavy >= 0.1 ? 4 : 2);
  }

  /** A star where a hit lands, white unless tinted; big ones are for crits and heavy blows. */
  impact(x: number, y: number, color: string = E.white, big = false) {
    const img = (this.freeHits.pop() ?? this.scene.add.image(0, 0, 'hit-0')).setTexture('hit-0').setVisible(true);
    img.setPosition(Math.round(x), Math.round(y)).setDepth(DEPTH.particles + 0.2).setScale(big ? 2 : 1).setTint(hexToNum(color)).setAlpha(1);
    this.hits.push({ img, t: 0, dur: big ? 0.11 : 0.075 });
    if (this.hits.length > 40) this.dropHit(this.hits[0]);
  }

  private dropHit(h: Hit) {
    h.img.setVisible(false);
    this.freeHits.push(h.img);
    this.hits.splice(this.hits.indexOf(h), 1);
  }

  /**
   * Chunks thrown off a kill, mostly the way the blow was going: they arc up, land, skip once and fade where they
   * lie. `force` scales how far they fly.
   */
  gib(x: number, y: number, dx: number, dy: number, n: number, colors: string[], force = 1) {
    const l = Math.hypot(dx, dy);
    const base = l > 0.01 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
    const spread = l > 0.01 ? 1.1 : Math.PI;
    for (let i = 0; i < n; i++) {
      if (this.gibs.length > 140) this.gibs.shift()!.img.destroy();
      const a = base + (Math.random() * 2 - 1) * spread;
      const sp = (40 + Math.random() * 90) * force;
      const big = Math.random() < 0.45;
      const img = this.scene.add.image(x, y, 'dot').setDepth(DEPTH.enemy + 0.3).setTint(hexToNum(colors[i % colors.length])).setScale(big ? 1 : 0.5);
      this.gibs.push({ img, x, y, z: 4 + Math.random() * 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: 50 + Math.random() * 70 * force, t: 0, life: 0.6 + Math.random() * 0.5 });
    }
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
    const nx = x + Phaser.Math.Between(-4, 4);
    img.setPosition(Math.round(nx), Math.round(y));
    const life = opts.crit ? 0.7 : opts.small ? 0.4 : 0.5;
    // Numbers fan out a little sideways, so a stream of hits stays readable; a crit lands at double size.
    const pop = opts.crit ? 0.08 : 0;
    if (pop) img.setScale(2);
    this.nums.push({ img, x: nx, y, vx: Phaser.Math.Between(-18, 18), vy: opts.crit ? -52 : -36, life, max: life, pop });
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

  private updateGibs(dt: number) {
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const g = this.gibs[i];
      g.t += dt;
      if (g.t >= g.life) {
        g.img.destroy();
        this.gibs.splice(i, 1);
        continue;
      }
      if (g.z > 0 || g.vz > 0) {
        g.vz -= 420 * dt;
        g.z += g.vz * dt;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        if (g.z <= 0) {
          g.z = 0;
          // One skip off the floor, then it lies still.
          if (g.vz < -60) {
            g.vz = -g.vz * 0.3;
            g.vx *= 0.45;
            g.vy *= 0.45;
          } else g.vz = 0;
        }
      }
      g.img.setPosition(Math.round(g.x), Math.round(g.y - g.z)).setAlpha(Math.min(1, (g.life - g.t) / 0.2));
    }
  }

  private recycle(n: Num) {
    n.img.setVisible(false);
    this.free.push(n.img);
    this.nums.splice(this.nums.indexOf(n), 1);
  }

  update(dt: number) {
    this.shakeT += dt;
    this.trauma = Math.max(0, this.trauma - dt * (1.4 + this.trauma * 2.6));
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      h.t += dt;
      if (h.t >= h.dur) this.dropHit(h);
      else if (h.t >= h.dur * 0.45) h.img.setTexture('hit-1');
    }
    this.updateGibs(dt);
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.life -= dt;
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.vx *= 0.9;
      n.vy *= 0.88;
      if (n.pop > 0 && (n.pop -= dt) <= 0) n.img.setScale(1);
      n.img.setPosition(Math.round(n.x), Math.round(n.y)).setAlpha(n.life < 0.15 ? n.life / 0.15 : 1);
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
