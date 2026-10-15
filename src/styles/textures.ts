import Phaser from 'phaser';
import { Rng } from '../core/rng';
import { TAU, mixHex, withAlpha } from '../core/math';
import { ARENA } from '../game/arena';
import type { StyleKit } from './types';
import {
  type Ctx,
  blobPath,
  circlePath,
  gearPath,
  paintBody,
  paintEyes,
  polyPath,
  silhouette,
  starPath,
  strokeOutline,
} from './paint';
import { paintBackground, paintVignette } from './backgrounds';

export function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx, w: number, h: number) => void) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  if (!t) return;
  const ctx = t.getContext();
  draw(ctx, w, h);
  t.refresh();
}

export const K = (name: string, kit: StyleKit) => `${name}@${kit.id}`;

/** Textures that do not depend on the art style. */
export function buildCommonTextures(scene: Phaser.Scene) {
  tex(scene, 'glow', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  tex(scene, 'ring', 128, 128, (ctx) => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, TAU);
    ctx.stroke();
  });
  tex(scene, 'disc', 64, 64, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, TAU);
    ctx.fill();
  });
  tex(scene, 'spark', 16, 4, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 16, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 4);
  });
  tex(scene, 'shadow', 64, 24, (ctx) => {
    const g = ctx.createRadialGradient(32, 12, 0, 32, 12, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.scale(1, 0.375);
    ctx.fillRect(0, 0, 64, 64);
  });
  tex(scene, 'grain', 256, 256, (ctx) => {
    const img = ctx.createImageData(256, 256);
    const rng = new Rng(99);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(rng.range(0, 255));
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = Math.floor(rng.range(30, 120));
    }
    ctx.putImageData(img, 0, 0);
  });
}

/** Everything a level needs, painted from one style kit. Cached per kit. */
export function buildKitTextures(scene: Phaser.Scene, kit: StyleKit) {
  const pal = kit.palette;

  tex(scene, K('bg', kit), ARENA.w, ARENA.h, (ctx) => paintBackground(ctx, kit));
  tex(scene, K('vignette', kit), ARENA.w, ARENA.h, (ctx) => paintVignette(ctx, kit));

  // Player: a red anemone with a dark heart.
  tex(scene, K('player', kit), 56, 56, (ctx) => {
    const c = 28;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const p = new Path2D();
      p.ellipse(c + Math.cos(a) * 11, c + Math.sin(a) * 11, 11, 8, a, 0, TAU);
      const g = ctx.createRadialGradient(c, c, 2, c, c, 24);
      g.addColorStop(0, pal.accentDark);
      g.addColorStop(0.45, pal.accent);
      g.addColorStop(1, mixHex(pal.accent, '#ffffff', 0.25));
      ctx.fillStyle = g;
      ctx.fill(p);
      if (kit.outline.mode !== 'none') {
        ctx.strokeStyle = withAlpha(pal.ink, 0.85);
        ctx.lineWidth = kit.outline.mode === 'thick' ? 2.5 : 1.2;
        ctx.stroke(p);
      }
    }
    ctx.fillStyle = '#16121A';
    ctx.beginPath();
    ctx.arc(c, c, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = withAlpha('#ffffff', 0.8);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * 9, c + Math.sin(a) * 9, 1, 0, TAU);
      ctx.fill();
    }
  });

  // Player projectiles.
  tex(scene, K('bolt', kit), 30, 12, (ctx) => {
    const p = new Path2D();
    p.roundRect(1, 1, 28, 10, 5);
    ctx.fillStyle = pal.accent;
    ctx.fill(p);
    ctx.fillStyle = mixHex(pal.accent, '#ffffff', 0.75);
    ctx.beginPath();
    ctx.roundRect(10, 3.5, 17, 5, 2.5);
    ctx.fill();
    if (kit.outline.mode === 'thick') {
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 2;
      ctx.stroke(p);
    }
  });
  tex(scene, K('pellet', kit), 16, 16, (ctx) => {
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.arc(8, 8, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = mixHex(pal.accent, '#ffffff', 0.7);
    ctx.beginPath();
    ctx.arc(7, 7, 3, 0, TAU);
    ctx.fill();
  });
  tex(scene, K('blade', kit), 40, 40, (ctx) => {
    const p = new Path2D();
    p.arc(20, 20, 17, -2.4, 2.4);
    p.arc(26, 20, 11, 2.2, -2.2, true);
    p.closePath();
    ctx.fillStyle = pal.accent;
    ctx.fill(p);
    ctx.strokeStyle = mixHex(pal.accent, '#ffffff', 0.6);
    ctx.lineWidth = 2;
    ctx.stroke(p);
  });
  tex(scene, K('shell', kit), 22, 22, (ctx) => {
    paintBody(ctx, kit, circlePath(11, 11, 8), pal.accent, { cx: 11, cy: 11, r: 8 });
  });
  tex(scene, K('shard', kit), 14, 8, (ctx) => {
    ctx.fillStyle = mixHex(pal.accent, '#ffffff', 0.4);
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(10, 0);
    ctx.lineTo(14, 4);
    ctx.lineTo(10, 8);
    ctx.closePath();
    ctx.fill();
  });

  // Enemy bullets: danger colour with a contrasting rim so they read on any floor.
  tex(scene, K('ebullet', kit), 20, 20, (ctx) => {
    ctx.fillStyle = pal.dangerRim;
    ctx.beginPath();
    ctx.arc(10, 10, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = pal.danger;
    ctx.beginPath();
    ctx.arc(10, 10, 6.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = withAlpha(pal.dangerRim, 0.7);
    ctx.beginPath();
    ctx.arc(8, 8, 2, 0, TAU);
    ctx.fill();
  });
  tex(scene, K('ebullet-big', kit), 34, 34, (ctx) => {
    ctx.fillStyle = pal.dangerRim;
    ctx.beginPath();
    ctx.arc(17, 17, 16, 0, TAU);
    ctx.fill();
    ctx.fillStyle = pal.danger;
    ctx.beginPath();
    ctx.arc(17, 17, 12, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = withAlpha(pal.dangerRim, 0.6);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(17, 17, 7, 0, TAU);
    ctx.stroke();
  });

  // XP: an anemone petal.
  tex(scene, K('petal', kit), 16, 12, (ctx) => {
    const p = new Path2D();
    p.ellipse(8, 6, 7, 4.5, 0.3, 0, TAU);
    ctx.fillStyle = pal.accent;
    ctx.fill(p);
    ctx.fillStyle = withAlpha('#ffffff', 0.5);
    ctx.beginPath();
    ctx.ellipse(6, 5, 3, 1.5, 0.3, 0, TAU);
    ctx.fill();
  });
  tex(scene, K('heart', kit), 20, 18, (ctx) => {
    const p = new Path2D();
    p.moveTo(10, 17);
    p.bezierCurveTo(-2, 8, 3, -1, 10, 5);
    p.bezierCurveTo(17, -1, 22, 8, 10, 17);
    ctx.fillStyle = pal.accent;
    ctx.fill(p);
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1.5;
    ctx.stroke(p);
  });

  // Style particle.
  tex(scene, K('pt', kit), 16, 16, (ctx) => paintParticle(ctx, kit));

  // Enemies, drawn facing +x so sprites can rotate toward their heading.
  const E = 64;
  const c = E / 2;
  tex(scene, K('en-wanderer', kit), E, E, (ctx) => {
    const p = silhouette(kit, c, c, 20, 11);
    paintBody(ctx, kit, p, pal.mid, { cx: c, cy: c, r: 20 });
    paintEyes(ctx, kit, c, c, 20);
  });
  tex(scene, K('en-charger', kit), E, E, (ctx) => {
    let p: Path2D;
    if (kit.shape === 'geometric' || kit.shape === 'angular') {
      p = polyPath([
        [c + 24, c],
        [c - 18, c - 18],
        [c - 10, c],
        [c - 18, c + 18],
      ]);
    } else {
      p = new Path2D();
      p.moveTo(c + 25, c);
      p.bezierCurveTo(c + 8, c - 20, c - 22, c - 22, c - 20, c);
      p.bezierCurveTo(c - 22, c + 22, c + 8, c + 20, c + 25, c);
      p.closePath();
    }
    paintBody(ctx, kit, p, mixHex(pal.mid, pal.accentDark, 0.25), { cx: c, cy: c, r: 20 });
    paintEyes(ctx, kit, c - 2, c, 16);
  });
  tex(scene, K('en-shooter', kit), E, E, (ctx) => {
    ctx.fillStyle = pal.ink;
    ctx.fillRect(c + 6, c - 4, 22, 8);
    const p = polyPath([
      [c + 18, c],
      [c, c - 20],
      [c - 18, c],
      [c, c + 20],
    ]);
    paintBody(ctx, kit, p, mixHex(pal.mid, pal.light, 0.15), { cx: c, cy: c, r: 19 });
    ctx.fillStyle = pal.danger;
    ctx.beginPath();
    ctx.arc(c, c, 5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = pal.dangerRim;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  tex(scene, K('en-bomber', kit), E, E, (ctx) => {
    const p = starPath(c, c, 22, 16, 10, 0);
    paintBody(ctx, kit, p, mixHex(pal.mid, pal.danger, 0.35), { cx: c, cy: c, r: 19 });
    ctx.fillStyle = pal.danger;
    ctx.beginPath();
    ctx.arc(c, c, 7, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = pal.dangerRim;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  tex(scene, K('en-shield', kit), E, E, (ctx) => {
    const p = silhouette(kit, c - 3, c, 18, 23);
    paintBody(ctx, kit, p, mixHex(pal.mid, pal.ink, 0.2), { cx: c - 3, cy: c, r: 18 });
    paintEyes(ctx, kit, c - 6, c, 15);
    const s = new Path2D();
    s.arc(c - 4, c, 26, -1.05, 1.05);
    s.arc(c - 4, c, 19, 1.05, -1.05, true);
    s.closePath();
    paintBody(ctx, kit, s, pal.light, { cx: c + 16, cy: c, r: 14 }, { dark: mixHex(pal.light, pal.ink, 0.4) });
  });

  // Obstacles.
  tex(scene, K('pillar', kit), 76, 76, (ctx) => paintPillar(ctx, kit));
  tex(scene, K('barrel', kit), 52, 52, (ctx) => {
    const p = kit.shape === 'geometric' ? polyPath([[6, 6], [46, 6], [46, 46], [6, 46]]) : circlePath(26, 26, 21);
    paintBody(ctx, kit, p, mixHex(pal.danger, pal.ink, 0.15), { cx: 26, cy: 26, r: 21 });
    ctx.strokeStyle = pal.dangerRim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(26, 13);
    ctx.lineTo(18, 28);
    ctx.lineTo(28, 28);
    ctx.lineTo(24, 40);
    ctx.stroke();
  });

  // Door: an arch in the wall.
  tex(scene, K('door', kit), 112, 84, (ctx) => paintDoor(ctx, kit));

  // Pets.
  tex(scene, K('pet-hound', kit), 48, 48, (ctx) => {
    const b = { cx: 24, cy: 26, r: 15 };
    const ears = polyPath([[14, 16], [10, 4], [20, 12]]);
    const ears2 = polyPath([[34, 16], [38, 4], [28, 12]]);
    paintBody(ctx, kit, ears, mixHex(pal.ally, pal.ink, 0.3), b);
    paintBody(ctx, kit, ears2, mixHex(pal.ally, pal.ink, 0.3), b);
    paintBody(ctx, kit, circlePath(24, 26, 15), pal.ally, b);
    ctx.fillStyle = pal.ink;
    ctx.beginPath();
    ctx.ellipse(24, 32, 5, 3.5, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(18, 23, 2.2, 0, TAU);
    ctx.arc(30, 23, 2.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(24, 26, 15, 0.6, 2.5);
    ctx.stroke();
  });
  tex(scene, K('pet-dove', kit), 48, 48, (ctx) => {
    const wing = new Path2D();
    wing.moveTo(24, 26);
    wing.quadraticCurveTo(6, 6, 2, 20);
    wing.quadraticCurveTo(12, 24, 24, 28);
    wing.quadraticCurveTo(36, 24, 46, 20);
    wing.quadraticCurveTo(42, 6, 24, 26);
    wing.closePath();
    paintBody(ctx, kit, wing, pal.ally, { cx: 24, cy: 22, r: 18 });
    paintBody(ctx, kit, circlePath(24, 30, 9), pal.ally, { cx: 24, cy: 30, r: 9 });
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.moveTo(24, 38);
    ctx.lineTo(21, 34);
    ctx.lineTo(27, 34);
    ctx.closePath();
    ctx.fill();
  });
  tex(scene, K('pet-swan', kit), 48, 48, (ctx) => {
    paintBody(ctx, kit, blobPath(22, 30, 14, 4, 0.08, 8), pal.ally, { cx: 22, cy: 30, r: 14 });
    const neck = new Path2D();
    neck.moveTo(30, 26);
    neck.bezierCurveTo(42, 18, 26, 8, 34, 6);
    ctx.strokeStyle = pal.ally;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke(neck);
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1.2;
    ctx.stroke(neck);
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.moveTo(35, 5);
    ctx.lineTo(43, 7);
    ctx.lineTo(35, 9);
    ctx.closePath();
    ctx.fill();
  });

  // Bosses.
  tex(scene, K('boss-guardian', kit), 220, 220, (ctx) => paintGuardian(ctx, kit));
  tex(scene, K('boss-boar', kit), 240, 170, (ctx) => paintBoar(ctx, kit));
}

function paintParticle(ctx: Ctx, kit: StyleKit) {
  const pal = kit.palette;
  switch (kit.particle) {
    case 'flakes':
      ctx.fillStyle = pal.extra[0];
      ctx.fillRect(3, 4, 10, 8);
      ctx.fillStyle = withAlpha('#ffffff', 0.6);
      ctx.fillRect(4, 5, 4, 2);
      break;
    case 'stars':
      ctx.fillStyle = '#ffffff';
      ctx.fill(starPath(8, 8, 7.5, 3, 4));
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 1;
      ctx.stroke(starPath(8, 8, 7.5, 3, 4));
      break;
    case 'gears':
      ctx.fillStyle = pal.mid;
      ctx.fill(gearPath(8, 8, 7, 6, 0.3));
      ctx.fillStyle = pal.ink;
      ctx.beginPath();
      ctx.arc(8, 8, 2, 0, TAU);
      ctx.fill();
      break;
    case 'ink':
      ctx.fillStyle = withAlpha(pal.ink, 0.9);
      ctx.fill(blobPath(8, 8, 6, 5, 0.3, 7));
      break;
    case 'foam':
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(8, 10, 5, Math.PI, TAU);
      ctx.stroke();
      break;
    case 'shards':
      ctx.fillStyle = pal.light;
      ctx.fill(polyPath([[2, 12], [8, 2], [14, 10]]));
      break;
    case 'glass': {
      const col = pal.extra[Math.floor(Math.random() * pal.extra.length)];
      ctx.fillStyle = col;
      ctx.fill(polyPath([[2, 10], [7, 2], [14, 6], [11, 14]]));
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 1.5;
      ctx.stroke(polyPath([[2, 10], [7, 2], [14, 6], [11, 14]]));
      break;
    }
    default:
      ctx.fillStyle = pal.light;
      ctx.beginPath();
      ctx.arc(8, 8, 5, 0, TAU);
      ctx.fill();
  }
}

function paintPillar(ctx: Ctx, kit: StyleKit) {
  const pal = kit.palette;
  const c = 38;
  ctx.save();
  ctx.fillStyle = withAlpha('#000000', 0.18);
  ctx.beginPath();
  ctx.ellipse(c + 4, c + 6, 30, 26, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  switch (kit.pattern) {
    case 'marble': {
      paintBody(ctx, kit, polyPath([[8, 8], [68, 8], [68, 68], [8, 68]]), pal.bg2, { cx: c, cy: c, r: 30 });
      paintBody(ctx, kit, circlePath(c, c, 24), pal.light, { cx: c, cy: c, r: 24 });
      ctx.strokeStyle = withAlpha(pal.ink, 0.35);
      ctx.lineWidth = 1;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * 8, c + Math.sin(a) * 8);
        ctx.lineTo(c + Math.cos(a) * 22, c + Math.sin(a) * 22);
        ctx.stroke();
      }
      break;
    }
    case 'gears':
    case 'blueprint': {
      paintBody(ctx, kit, circlePath(c, c, 28), pal.mid, { cx: c, cy: c, r: 28 });
      ctx.fillStyle = pal.ink;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * 22, c + Math.sin(a) * 22, 2, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c, c, 10, 0, TAU);
      ctx.moveTo(c - 14, c);
      ctx.lineTo(c + 14, c);
      ctx.moveTo(c, c - 14);
      ctx.lineTo(c, c + 14);
      ctx.stroke();
      break;
    }
    case 'ink':
    case 'impression': {
      paintBody(ctx, kit, blobPath(c, c, 27, 17, 0.22, 9), kit.pattern === 'ink' ? pal.mid : pal.extra[2], { cx: c, cy: c, r: 27 });
      paintBody(ctx, kit, blobPath(c - 6, c - 6, 12, 5, 0.25, 7), mixHex(pal.mid, pal.light, 0.4), { cx: c - 6, cy: c - 6, r: 12 });
      break;
    }
    case 'seigaiha': {
      paintBody(ctx, kit, polyPath([[12, 12], [64, 12], [64, 64], [12, 64]]), pal.mid, { cx: c, cy: c, r: 28 });
      paintBody(ctx, kit, polyPath([[4, 22], [c, 4], [72, 22], [c, 30]]), pal.ink, { cx: c, cy: 18, r: 18 });
      ctx.fillStyle = pal.extra[1];
      ctx.fillRect(c - 7, c + 4, 14, 14);
      break;
    }
    case 'meander':
    case 'nouveau': {
      paintBody(ctx, kit, circlePath(c, c, 26), pal.mid, { cx: c, cy: c, r: 26 });
      ctx.strokeStyle = pal.light;
      ctx.lineWidth = 2;
      for (const r of [8, 15, 21]) {
        ctx.beginPath();
        ctx.arc(c, c, r, 0, TAU);
        ctx.stroke();
      }
      break;
    }
    case 'bauhaus': {
      paintBody(ctx, kit, polyPath([[10, 10], [66, 10], [66, 66], [10, 66]]), pal.extra[0], { cx: c, cy: c, r: 28 });
      paintBody(ctx, kit, circlePath(c, c, 15), pal.extra[1], { cx: c, cy: c, r: 15 });
      break;
    }
    case 'stainedglass': {
      paintBody(ctx, kit, circlePath(c, c, 28), pal.extra[0], { cx: c, cy: c, r: 28 });
      break;
    }
    default: {
      const p = polyPath([[10, 10], [66, 10], [66, 66], [10, 66]]);
      paintBody(ctx, kit, p, pal.light, { cx: c, cy: c, r: 28 });
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = kit.outline.width;
      ctx.beginPath();
      ctx.moveTo(10, 10);
      ctx.lineTo(66, 66);
      ctx.moveTo(66, 10);
      ctx.lineTo(10, 66);
      ctx.stroke();
    }
  }
}

function paintDoor(ctx: Ctx, kit: StyleKit) {
  const pal = kit.palette;
  const w = 112;
  const h = 84;
  const arch = new Path2D();
  const round = kit.pattern === 'ink';
  if (round) {
    arch.arc(w / 2, h / 2 + 4, 38, 0, TAU);
  } else if (kit.shape === 'geometric' || kit.pattern === 'blueprint') {
    arch.rect(14, 6, w - 28, h - 6);
  } else {
    arch.moveTo(14, h);
    arch.lineTo(14, 36);
    arch.arc(w / 2, 36, w / 2 - 14, Math.PI, 0);
    arch.lineTo(w - 14, h);
    arch.closePath();
  }
  ctx.save();
  ctx.fillStyle = mixHex(pal.wall, pal.light, 0.35);
  ctx.translate(0, 0);
  ctx.lineWidth = 10;
  ctx.strokeStyle = mixHex(pal.wall, pal.light, 0.35);
  ctx.stroke(arch);
  ctx.restore();
  ctx.fillStyle = pal.ink;
  ctx.fill(arch);
  strokeOutline(ctx, kit, arch);
}

function paintGuardian(ctx: Ctx, kit: StyleKit) {
  const pal = kit.palette;
  const c = 110;
  const ornament = kit.bossOrnament;
  ctx.lineJoin = 'round';

  if (ornament === 'vitruvian') {
    ctx.strokeStyle = pal.extra[0];
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(c, c, 96, 0, TAU);
    ctx.stroke();
    ctx.strokeRect(c - 76, c - 76, 152, 152);
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    for (const a of [0.35, Math.PI - 0.35, Math.PI + 0.35, -0.35]) {
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 40, c + Math.sin(a) * 40);
      ctx.lineTo(c + Math.cos(a) * 92, c + Math.sin(a) * 92);
      ctx.stroke();
    }
  } else if (ornament === 'clock') {
    paintBody(ctx, kit, circlePath(c, c, 98), pal.light, { cx: c, cy: c, r: 98 });
    ctx.strokeStyle = pal.ink;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      ctx.lineWidth = i % 3 === 0 ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 80, c + Math.sin(a) * 80);
      ctx.lineTo(c + Math.cos(a) * 92, c + Math.sin(a) * 92);
      ctx.stroke();
    }
  } else if (ornament === 'rose') {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const p = new Path2D();
      p.ellipse(c + Math.cos(a) * 66, c + Math.sin(a) * 66, 30, 16, a, 0, TAU);
      paintBody(ctx, kit, p, pal.extra[i % pal.extra.length], { cx: c + Math.cos(a) * 66, cy: c + Math.sin(a) * 66, r: 30 });
    }
  } else if (ornament === 'shapes') {
    paintBody(ctx, kit, polyPath([[14, 150], [110, 6], [206, 150]]), pal.extra[1], { cx: c, cy: 100, r: 90 });
    paintBody(ctx, kit, polyPath([[30, 120], [120, 120], [120, 210], [30, 210]]), pal.extra[2], { cx: 75, cy: 165, r: 45 });
  } else if (ornament === 'dragon') {
    ctx.strokeStyle = withAlpha(pal.ink, 0.8);
    for (let i = 0; i < 3; i++) {
      ctx.lineWidth = 16 - i * 5;
      ctx.beginPath();
      for (let t = 0; t < 1; t += 0.01) {
        const a = t * TAU * 1.6 + i;
        const r = 50 + t * 52;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (ornament === 'oni' || ornament === 'horns') {
    const hornCol = ornament === 'oni' ? pal.light : pal.light;
    for (const s of [-1, 1]) {
      const p = new Path2D();
      p.moveTo(c + s * 34, c - 40);
      p.quadraticCurveTo(c + s * 96, c - 70, c + s * 84, c - 108);
      p.quadraticCurveTo(c + s * 70, c - 64, c + s * 18, c - 52);
      p.closePath();
      paintBody(ctx, kit, p, hornCol, { cx: c + s * 60, cy: c - 70, r: 30 });
    }
  } else if (ornament === 'mecha') {
    for (const s of [-1, 1]) {
      const p = new Path2D();
      p.roundRect(c + s * 58 - 26, c - 46, 52, 92, 10);
      paintBody(ctx, kit, p, pal.extra[0], { cx: c + s * 58, cy: c, r: 40 });
    }
  }

  const core = kit.shape === 'geometric' ? polyPath([[c - 52, c - 52], [c + 52, c - 52], [c + 52, c + 52], [c - 52, c + 52]]) : circlePath(c, c, 54);
  paintBody(ctx, kit, core, pal.mid, { cx: c, cy: c, r: 54 });

  if (ornament === 'mecha') {
    ctx.fillStyle = pal.ink;
    ctx.fillRect(c - 44, c - 12, 88, 22);
    ctx.fillStyle = pal.danger;
    ctx.fillRect(c - 36, c - 6, 72, 10);
  } else {
    for (const s of [-1, 1]) {
      ctx.fillStyle = pal.ink;
      ctx.beginPath();
      ctx.ellipse(c + s * 20, c - 6, 12, 9, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = pal.danger;
      ctx.beginPath();
      ctx.arc(c + s * 20, c - 6, 5.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = pal.dangerRim;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (ornament === 'oni') {
      ctx.fillStyle = pal.light;
      for (let i = -2; i <= 2; i++) ctx.fill(polyPath([[c + i * 9 - 4, c + 22], [c + i * 9 + 4, c + 22], [c + i * 9, c + 32]]));
    }
  }
  if (ornament === 'clock') {
    ctx.strokeStyle = pal.ink;
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(c, c + 24);
    ctx.lineTo(c, c + 46);
    ctx.stroke();
  }
}

function paintBoar(ctx: Ctx, kit: StyleKit) {
  const pal = kit.palette;
  const body = mixHex(pal.mid, pal.ink, kit.id === 'greek' ? 0 : 0.35);
  // Bristles on the back.
  const bristle = new Path2D();
  for (let i = 0; i < 9; i++) {
    const x = 50 + i * 14;
    bristle.moveTo(x, 52 - Math.sin(i / 8 * Math.PI) * 6);
    bristle.lineTo(x + 8, 22 - Math.sin(i / 8 * Math.PI) * 16);
    bristle.lineTo(x + 14, 52 - Math.sin(i / 8 * Math.PI) * 6);
  }
  ctx.fillStyle = mixHex(body, pal.ink, 0.4);
  ctx.fill(bristle);
  // Legs.
  for (const x of [60, 92, 140, 172]) {
    const leg = new Path2D();
    leg.roundRect(x, 110, 18, 46, 6);
    paintBody(ctx, kit, leg, mixHex(body, pal.ink, 0.25), { cx: x + 9, cy: 132, r: 20 });
  }
  // Body.
  const torso = new Path2D();
  torso.ellipse(112, 92, 84, 50, 0, 0, TAU);
  paintBody(ctx, kit, torso, body, { cx: 112, cy: 92, r: 84 });
  // Head and snout.
  const head = new Path2D();
  head.moveTo(168, 58);
  head.quadraticCurveTo(222, 66, 232, 104);
  head.lineTo(226, 124);
  head.quadraticCurveTo(196, 132, 162, 118);
  head.closePath();
  paintBody(ctx, kit, head, mixHex(body, pal.light, 0.08), { cx: 196, cy: 96, r: 40 });
  ctx.fillStyle = mixHex(body, pal.ink, 0.5);
  ctx.beginPath();
  ctx.ellipse(229, 112, 7, 12, 0, 0, TAU);
  ctx.fill();
  // Tusk.
  const tusk = new Path2D();
  tusk.moveTo(214, 118);
  tusk.quadraticCurveTo(236, 120, 238, 92);
  tusk.quadraticCurveTo(226, 112, 206, 112);
  tusk.closePath();
  ctx.fillStyle = pal.light;
  ctx.fill(tusk);
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke(tusk);
  // Ear.
  const ear = polyPath([[176, 60], [170, 30], [192, 56]]);
  paintBody(ctx, kit, ear, mixHex(body, pal.ink, 0.2), { cx: 180, cy: 48, r: 14 });
  // Eye, in the danger colour.
  ctx.fillStyle = pal.danger;
  ctx.beginPath();
  ctx.arc(196, 78, 6, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = pal.dangerRim;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (kit.outline.mode === 'incised') {
    ctx.strokeStyle = pal.light;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(112, 92, 56, 2.6, 4.2);
    ctx.moveTo(150, 70);
    ctx.quadraticCurveTo(170, 92, 150, 120);
    ctx.stroke();
  }
}
