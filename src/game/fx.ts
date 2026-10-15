import Phaser from 'phaser';
import { hexToNum } from '../core/math';
import { K } from '../styles/textures';
import type { StyleKit } from '../styles/types';
import { ELEMENT_COLOR } from './entities';
import type { Element } from '../core/stats';

interface Num {
  text: Phaser.GameObjects.Text;
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  base: number;
}

export const DEPTH = {
  bg: 0,
  hazard: 2,
  shadow: 3,
  pickup: 4,
  obstacle: 5,
  enemy: 6,
  pet: 7,
  player: 8,
  proj: 9,
  ebullet: 10,
  gfx: 11,
  particles: 12,
  numbers: 13,
  doors: 14,
  vignette: 20,
  grain: 21,
  flash: 22,
  cursor: 30,
};

export class Fx {
  trauma = 0;
  private nums: Num[] = [];
  private free: Phaser.GameObjects.Text[] = [];
  private kit!: StyleKit;
  private emStyle?: Phaser.GameObjects.Particles.ParticleEmitter;
  private emPetal?: Phaser.GameObjects.Particles.ParticleEmitter;
  private emSpark: Record<string, Phaser.GameObjects.Particles.ParticleEmitter> = {};
  private emDust?: Phaser.GameObjects.Particles.ParticleEmitter;
  private flashRect: Phaser.GameObjects.Rectangle;
  private dark = false;

  constructor(private scene: Phaser.Scene) {
    this.flashRect = scene.add.rectangle(640, 360, 1280, 720, 0xffffff, 1).setAlpha(0).setDepth(DEPTH.flash);
  }

  setKit(kit: StyleKit, dark: boolean) {
    this.kit = kit;
    this.dark = dark;
    this.emStyle?.destroy();
    this.emPetal?.destroy();
    this.emDust?.destroy();
    Object.values(this.emSpark).forEach((e) => e.destroy());
    this.emSpark = {};
    const s = this.scene;
    this.emStyle = s.add
      .particles(0, 0, K('pt', kit), {
        lifespan: { min: 350, max: 900 },
        speed: { min: 80, max: 360 },
        angle: { min: 0, max: 360 },
        scale: { start: 1.1, end: 0.2 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        emitting: false,
      })
      .setDepth(DEPTH.particles);
    this.emPetal = s.add
      .particles(0, 0, K('petal', kit), {
        lifespan: { min: 400, max: 1000 },
        speed: { min: 40, max: 240 },
        angle: { min: 0, max: 360 },
        scale: { start: 1, end: 0.3 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        emitting: false,
      })
      .setDepth(DEPTH.particles);
    const sparkColors: Record<string, string> = { white: dark ? '#ffffff' : kit.palette.ink, accent: kit.palette.accent, ...ELEMENT_COLOR };
    for (const [k, col] of Object.entries(sparkColors)) {
      this.emSpark[k] = s.add
        .particles(0, 0, 'spark', {
          lifespan: { min: 120, max: 320 },
          speed: { min: 200, max: 620 },
          angle: { min: 0, max: 360 },
          scale: { start: 1.2, end: 0.2 },
          alpha: { start: 1, end: 0 },
          rotate: { min: 0, max: 360 },
          emitting: false,
          tint: hexToNum(col),
          blendMode: dark ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
        })
        .setDepth(DEPTH.particles);
    }
    this.emDust = s.add
      .particles(0, 0, 'disc', {
        lifespan: { min: 300, max: 700 },
        speed: { min: 30, max: 140 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.35, end: 0.05 },
        alpha: { start: 0.35, end: 0 },
        tint: hexToNum(dark ? kit.palette.light : kit.palette.ink),
        emitting: false,
      })
      .setDepth(DEPTH.particles - 1);
    for (const n of this.nums) n.text.setVisible(false);
    this.free.push(...this.nums.map((n) => n.text));
    this.nums = [];
    this.free.forEach((t) => t.setFontFamily(kit.fonts.display));
  }

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
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

  sparks(x: number, y: number, n: number, kind: 'white' | 'accent' | Element = 'white') {
    this.emSpark[kind]?.explode(n, x, y);
  }

  dust(x: number, y: number, n: number) {
    this.emDust?.explode(n, x, y);
  }

  ring(x: number, y: number, radius: number, color: string, dur = 320, width = 1) {
    const img = this.scene.add.image(x, y, 'ring').setDepth(DEPTH.particles).setTint(hexToNum(color)).setScale(0.05);
    if (this.dark) img.setBlendMode(Phaser.BlendModes.ADD);
    img.setAlpha(0.9);
    this.scene.tweens.add({
      targets: img,
      scale: (radius / 58) * width,
      alpha: 0,
      duration: dur,
      ease: 'Cubic.easeOut',
      onComplete: () => img.destroy(),
    });
  }

  glowPop(x: number, y: number, size: number, color: string, dur = 120) {
    const img = this.scene.add.image(x, y, 'glow').setDepth(DEPTH.particles).setTint(hexToNum(color)).setScale(size / 32);
    img.setBlendMode(this.dark ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    img.setAlpha(this.dark ? 1 : 0.7);
    this.scene.tweens.add({ targets: img, alpha: 0, scale: (size / 32) * 1.4, duration: dur, onComplete: () => img.destroy() });
  }

  number(x: number, y: number, value: number, opts: { crit?: boolean; color?: string; small?: boolean; text?: string } = {}) {
    if (this.nums.length > 70) this.recycle(this.nums[0]);
    const t = this.free.pop() ?? this.scene.add.text(0, 0, '', { fontFamily: this.kit.fonts.display }).setOrigin(0.5).setDepth(DEPTH.numbers);
    const pal = this.kit.palette;
    const size = opts.crit ? 30 : opts.small ? 15 : 20;
    t.setText(opts.text ?? String(Math.max(1, Math.round(value))))
      .setFontSize(size)
      .setFontFamily(this.kit.fonts.display)
      .setColor(opts.color ?? (opts.crit ? pal.accent : '#ffffff'))
      .setStroke(opts.crit ? '#ffffff' : pal.ink, opts.crit ? 6 : 4)
      .setVisible(true)
      .setAlpha(1)
      .setScale(opts.crit ? 1.6 : 1.15)
      .setAngle(opts.crit ? Phaser.Math.Between(-8, 8) : 0)
      .setPosition(x, y);
    this.nums.push({ text: t, x: x + Phaser.Math.Between(-10, 10), y: y - 10, vy: opts.crit ? -120 : -80, life: opts.crit ? 0.8 : 0.55, max: opts.crit ? 0.8 : 0.55, base: 1 });
  }

  callout(x: number, y: number, text: string, color?: string, size = 34) {
    const pal = this.kit.palette;
    const t = this.scene.add
      .text(x, y, text, { fontFamily: this.kit.fonts.display, fontSize: `${size}px`, color: color ?? pal.light, stroke: pal.ink, strokeThickness: 7 })
      .setOrigin(0.5)
      .setDepth(DEPTH.numbers + 1)
      .setAngle(Phaser.Math.Between(-12, 12))
      .setScale(0.2);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, alpha: 0, y: y - 30, delay: 480, duration: 300, onComplete: () => t.destroy() });
  }

  private recycle(n: Num) {
    n.text.setVisible(false);
    this.free.push(n.text);
    this.nums.splice(this.nums.indexOf(n), 1);
  }

  /** Real-time update: shakes keep going during hit-stop, which is what sells the impact. */
  update(dt: number) {
    const cam = this.scene.cameras.main;
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const t = performance.now() / 1000;
      cam.setScroll(Math.sin(t * 61.3) * 14 * s + Math.sin(t * 23.1) * 6 * s, Math.cos(t * 57.7) * 12 * s + Math.sin(t * 31.9) * 5 * s);
      this.trauma = Math.max(0, this.trauma - dt * 1.9);
    } else if (cam.scrollX !== 0 || cam.scrollY !== 0) {
      cam.setScroll(0, 0);
    }
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.life -= dt;
      n.y += n.vy * dt;
      n.vy *= 0.9;
      const k = n.life / n.max;
      const sc = n.text.scale;
      n.text.setPosition(n.x, n.y).setAlpha(Math.min(1, k * 2.2)).setScale(Math.max(1, sc - dt * 5));
      if (n.life <= 0) this.recycle(n);
    }
  }
}
