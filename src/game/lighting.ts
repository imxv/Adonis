import Phaser from 'phaser';
import { hexToNum } from '../core/math';
import { E, hexRgb } from '../pixel/palette';
import type { StyleKit } from '../styles/types';
import type { Dungeon } from './dungeon';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';

interface Light {
  x: number;
  y: number;
  r: number;
  color: number;
  flicker: number;
}

interface Flash {
  x: number;
  y: number;
  r: number;
  color: number;
  t: number;
  dur: number;
}

/** Margin around the screen so camera shake never shows an unlit edge. */
const M = 16;
const TEX = 128;

/**
 * Two falloffs. 'light' is banded, so small lights (torches, bullets) read as stepped pixel rings.
 * 'light-soft' is smooth, for the wide light that follows the player: no visible rim, no halo.
 */
function lightTexture(scene: Phaser.Scene) {
  if (scene.textures.exists('light')) return;
  for (const [key, banded] of [['light', true], ['light-soft', false]] as const) {
    const c = document.createElement('canvas');
    c.width = c.height = TEX;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(TEX, TEX);
    for (let y = 0; y < TEX; y++) {
      for (let x = 0; x < TEX; x++) {
        const d = Math.hypot(x + 0.5 - TEX / 2, y + 0.5 - TEX / 2) / (TEX / 2);
        let v = Math.max(0, 1 - d);
        v = v * v * (3 - 2 * v);
        if (banded) v = Math.round(v * 5) / 5;
        const i = (y * TEX + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(v * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    scene.textures.addCanvas(key, c);
  }
}

/**
 * Darkness with coloured light: the world is multiplied by an ambient tone, and every torch,
 * bullet and explosion adds light back. Effects drawn above this layer stay at full brightness.
 */
export class Lighting {
  private rt: Phaser.GameObjects.RenderTexture;
  private ambient = 0xffffff;
  private torches: Light[] = [];
  private statics: Light[] = [];
  private flashes: Flash[] = [];
  private t = 0;
  private enabled: boolean;

  constructor(scene: Phaser.Scene) {
    lightTexture(scene);
    this.enabled = new URLSearchParams(location.search).get('light') !== '0';
    const { width, height } = scene.scale;
    this.rt = scene.add
      .renderTexture(-M, -M, width + M * 2, height + M * 2)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(DEPTH.light)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setVisible(false);
  }

  setLevel(kit: StyleKit, d: Dungeon, seed: number) {
    // Darker biomes keep less ambient light; shadows lean cold so warm lights pop.
    // Kept fairly bright: the mood comes from torches and bullets, not from a spotlight on the player.
    const k = Math.max(0.6, 0.94 - kit.overlay.vignette * 0.6);
    const [r, g, b] = hexRgb(E.white);
    this.ambient = (Math.round(r * k * 0.9) << 16) | (Math.round(g * k * 0.9) << 8) | Math.min(255, Math.round(b * k * 1.08));
    this.torches = d.torches.map(([x, y], i) => ({ x, y, r: 56, color: hexToNum(E.orange), flicker: (seed + i * 37) % 100 }));
    this.rt.setVisible(this.enabled);
  }

  addStatic(x: number, y: number, r: number, color: string) {
    this.statics.push({ x, y, r, color: hexToNum(color), flicker: 0 });
  }

  clearStatic() {
    this.statics = [];
    this.flashes = [];
  }

  flash(x: number, y: number, r: number, color: string, dur = 0.18) {
    if (this.flashes.length > 40) this.flashes.shift();
    this.flashes.push({ x, y, r, color: hexToNum(color), t: 0, dur });
  }

  update(s: GameScene, dt: number) {
    if (!this.enabled || !s.kit) return;
    this.t += dt;
    const cam = s.cameras.main;
    const ox = cam.scrollX - M;
    const oy = cam.scrollY - M;
    const rt = this.rt;
    const W = rt.width;
    const H = rt.height;
    // Clear, then lay the ambient down as an opaque stamp inside the batch. fill() blends with whatever
    // mode the renderer was left in, which made the light map accumulate and lights punch dark squares.
    rt.clear();
    rt.beginDraw();
    const white = s.textures.get('__WHITE').getSourceImage() as HTMLCanvasElement;
    rt.stamp('__WHITE', undefined, 0, 0, { originX: 0, originY: 0, scaleX: W / white.width, scaleY: H / white.height, tint: this.ambient, alpha: 1, blendMode: Phaser.BlendModes.NORMAL, skipBatch: true });
    const add = (x: number, y: number, r: number, color: number, alpha = 1, key = 'light') => {
      const lx = x - ox;
      const ly = y - oy;
      if (lx < -r || ly < -r || lx > W + r || ly > H + r) return;
      rt.stamp(key, undefined, Math.round(lx), Math.round(ly), { scale: (r * 2) / TEX, tint: color, alpha, blendMode: Phaser.BlendModes.ADD, skipBatch: true });
    };
    const p = s.player;
    // A wide, faint, smooth lift around the player: enough to frame the action, too soft to read as a halo.
    if (p && p.sprite.visible) add(p.x, p.y - 6, 240, 0xffffff, 0.34, 'light-soft');
    for (const l of this.torches) {
      const f = 1 + Math.sin(this.t * 9 + l.flicker) * 0.06 + Math.sin(this.t * 23 + l.flicker * 2) * 0.03;
      add(l.x, l.y, l.r * f, l.color, 0.85);
    }
    for (const l of this.statics) add(l.x, l.y, l.r * (1 + Math.sin(this.t * 3 + l.x) * 0.05), l.color, 0.8);
    const danger = hexToNum(s.kit.palette.danger);
    let n = 0;
    for (const b of s.eproj) {
      if (b.dead || n++ > 70) continue;
      add(b.x, b.y, b.kind === 'ebig' ? 22 : 15, danger, 0.9);
    }
    n = 0;
    for (const b of s.pproj) {
      if (b.dead || n++ > 50) continue;
      if (b.kind === 'flame') add(b.x, b.y, 22, hexToNum(E.orange), 0.45);
      else if (b.kind === 'rocket') add(b.x, b.y, 34, hexToNum(E.amber), 0.8);
      else add(b.x, b.y, 14, hexToNum(E.yellow), 0.55);
    }
    for (const h of s.hazards) add(h.x, h.y, h.r * 1.6, hexToNum(E.orange), 0.5);
    for (const e of s.enemies) {
      if (e.dead) continue;
      if (e.boss) add(e.x, e.y - 12, 90, danger, 0.45);
      else if (e.elite) add(e.x, e.y - 4, 34, danger, 0.5);
    }
    for (const pk of s.pickups) if ((pk.kind === 'chest' || pk.kind === 'wchest') && !pk.dead) add(pk.x, pk.y - 4, 40, hexToNum(pk.kind === 'chest' ? E.yellow : E.cyan), 0.6);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const k = 1 - f.t / f.dur;
      if (k <= 0) {
        this.flashes.splice(i, 1);
        continue;
      }
      add(f.x, f.y, f.r, f.color, k);
    }
    rt.endDraw();
  }
}
