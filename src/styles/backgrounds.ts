import { Rng } from '../core/rng';
import { TAU, mixHex, withAlpha } from '../core/math';
import { ARENA } from '../game/arena';
import type { StyleKit } from './types';
import { type Ctx, blobPath, gearPath, polyPath, starPath } from './paint';

export function paintBackground(ctx: Ctx, kit: StyleKit) {
  const { w, h } = ARENA;
  const pal = kit.palette;
  const rng = new Rng(kit.id.length * 977 + kit.id.charCodeAt(0));

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);

  const floor = { x: ARENA.left, y: ARENA.top, w: ARENA.right - ARENA.left, h: ARENA.bottom - ARENA.top };
  ctx.save();
  ctx.beginPath();
  ctx.rect(floor.x, floor.y, floor.w, floor.h);
  ctx.clip();
  PATTERNS[kit.pattern](ctx, kit, rng, floor);
  ctx.restore();

  paintWalls(ctx, kit, rng);
}

type Rect = { x: number; y: number; w: number; h: number };
type PatternFn = (ctx: Ctx, kit: StyleKit, rng: Rng, f: Rect) => void;

const PATTERNS: Record<StyleKit['pattern'], PatternFn> = {
  marble(ctx, kit, rng, f) {
    const pal = kit.palette;
    const s = 148;
    for (let y = f.y - 20; y < f.y + f.h; y += s) {
      for (let x = f.x - 30; x < f.x + f.w; x += s) {
        const odd = (Math.round((x - f.x) / s) + Math.round((y - f.y) / s)) % 2;
        ctx.fillStyle = odd ? pal.bg2 : pal.bg;
        ctx.fillRect(x, y, s, s);
        ctx.strokeStyle = withAlpha(pal.ink, 0.12);
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, s, s);
      }
    }
    ctx.strokeStyle = withAlpha(pal.ink, 0.08);
    for (let i = 0; i < 40; i++) {
      ctx.lineWidth = rng.range(0.6, 1.6);
      ctx.beginPath();
      let x = rng.range(f.x, f.x + f.w);
      let y = rng.range(f.y, f.y + f.h);
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        const nx = x + rng.range(-90, 90);
        const ny = y + rng.range(-60, 60);
        ctx.quadraticCurveTo(x + rng.range(-40, 40), y + rng.range(-40, 40), nx, ny);
        x = nx;
        y = ny;
      }
      ctx.stroke();
    }
    // A faint sinopia sketch: the Vitruvian circle and square under the paint.
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    ctx.strokeStyle = withAlpha('#9E3B22', 0.14);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 250, 0, TAU);
    ctx.stroke();
    ctx.strokeRect(cx - 222, cy - 222, 444, 444);
    ctx.beginPath();
    ctx.moveTo(cx - 300, cy);
    ctx.lineTo(cx + 300, cy);
    ctx.moveTo(cx, cy - 280);
    ctx.lineTo(cx, cy + 280);
    ctx.stroke();
  },

  halftone(ctx, kit, rng, f) {
    const pal = kit.palette;
    const g = ctx.createLinearGradient(f.x, f.y, f.x + f.w, f.y + f.h);
    g.addColorStop(0, pal.bg2);
    g.addColorStop(1, pal.bg);
    ctx.fillStyle = g;
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.fillStyle = withAlpha('#ffffff', 0.55);
    const step = 18;
    for (let y = f.y; y < f.y + f.h + step; y += step) {
      for (let x = f.x + ((y / step) % 2) * (step / 2); x < f.x + f.w + step; x += step) {
        const t = 1 - (x - f.x + (y - f.y)) / (f.w + f.h);
        const r = Math.max(0, t * 6 - 1.2);
        if (r <= 0) continue;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    }
    // Speed lines from the corners.
    ctx.strokeStyle = withAlpha('#ffffff', 0.75);
    for (const [cx, cy] of [
      [f.x + f.w + 80, f.y + f.h + 80],
      [f.x - 80, f.y + f.h + 60],
    ]) {
      for (let i = 0; i < 26; i++) {
        const a = rng.range(0, TAU);
        const r0 = rng.range(150, 260);
        ctx.lineWidth = rng.range(1, 3);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * (r0 + rng.range(80, 220)), cy + Math.sin(a) * (r0 + rng.range(80, 220)));
        ctx.stroke();
      }
    }
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 4;
    ctx.strokeRect(f.x + 10, f.y + 10, f.w - 20, f.h - 20);
  },

  gears(ctx, kit, rng, f) {
    const pal = kit.palette;
    const g = ctx.createRadialGradient(f.x + f.w / 2, f.y + f.h / 2, 50, f.x + f.w / 2, f.y + f.h / 2, f.w * 0.7);
    g.addColorStop(0, pal.bg2);
    g.addColorStop(1, pal.bg);
    ctx.fillStyle = g;
    ctx.fillRect(f.x, f.y, f.w, f.h);
    // Deck plates.
    ctx.strokeStyle = withAlpha('#000000', 0.35);
    ctx.lineWidth = 2;
    for (let x = f.x; x < f.x + f.w; x += 120) {
      for (let y = f.y; y < f.y + f.h; y += 90) {
        ctx.strokeRect(x + 1, y + 1, 120, 90);
        ctx.fillStyle = withAlpha(pal.mid, 0.25);
        for (const [dx, dy] of [[8, 8], [112, 8], [8, 82], [112, 82]]) {
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, 2.2, 0, TAU);
          ctx.fill();
        }
      }
    }
    for (let i = 0; i < 7; i++) {
      const r = rng.range(50, 150);
      const x = rng.pick([f.x - r * 0.3, f.x + f.w + r * 0.3, rng.range(f.x, f.x + f.w)]);
      const y = rng.pick([f.y - r * 0.3, f.y + f.h + r * 0.3, rng.range(f.y, f.y + f.h)]);
      ctx.strokeStyle = withAlpha(pal.mid, 0.22);
      ctx.lineWidth = 6;
      ctx.stroke(gearPath(x, y, r, Math.round(r / 12), 0.12));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.35, 0, TAU);
      ctx.stroke();
    }
    ctx.strokeStyle = withAlpha(pal.extra[0], 0.5);
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y + f.h - 60);
    ctx.lineTo(f.x + 260, f.y + f.h - 60);
    ctx.lineTo(f.x + 260, f.y + f.h);
    ctx.moveTo(f.x + f.w, f.y + 70);
    ctx.lineTo(f.x + f.w - 200, f.y + 70);
    ctx.lineTo(f.x + f.w - 200, f.y);
    ctx.stroke();
    for (let i = 0; i < 18; i++) {
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 60);
      gr.addColorStop(0, withAlpha(pal.extra[1], 0.05));
      gr.addColorStop(1, withAlpha(pal.extra[1], 0));
      ctx.save();
      ctx.translate(rng.range(f.x, f.x + f.w), rng.range(f.y, f.y + f.h));
      ctx.fillStyle = gr;
      ctx.fillRect(-60, -60, 120, 120);
      ctx.restore();
    }
  },

  ink(ctx, kit, rng, f) {
    const pal = kit.palette;
    ctx.strokeStyle = withAlpha(pal.ink, 0.05);
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 900; i++) {
      const x = rng.range(f.x, f.x + f.w);
      const y = rng.range(f.y, f.y + f.h);
      const a = rng.range(0, TAU);
      const l = rng.range(3, 12);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    for (let i = 0; i < 22; i++) {
      const x = rng.pick([rng.range(f.x, f.x + 220), rng.range(f.x + f.w - 220, f.x + f.w), rng.range(f.x, f.x + f.w)]);
      const y = rng.pick([rng.range(f.y, f.y + 140), rng.range(f.y + f.h - 140, f.y + f.h)]);
      const r = rng.range(40, 140);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, withAlpha(pal.ink, rng.range(0.05, 0.14)));
      g.addColorStop(1, withAlpha(pal.ink, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Distant mountains, brushed along the bottom edge.
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = withAlpha(pal.ink, layer ? 0.16 : 0.08);
      ctx.beginPath();
      let x = f.x;
      ctx.moveTo(x, f.y + f.h);
      while (x < f.x + f.w) {
        const peak = rng.range(40, 130) * (layer ? 0.7 : 1);
        const wd = rng.range(80, 200);
        ctx.quadraticCurveTo(x + wd * 0.5, f.y + f.h - peak * 2, x + wd, f.y + f.h - rng.range(0, 20));
        x += wd;
      }
      ctx.lineTo(f.x + f.w, f.y + f.h);
      ctx.closePath();
      ctx.fill();
    }
    // Seal stamp.
    const sx = f.x + f.w - 70;
    const sy = f.y + 24;
    ctx.fillStyle = withAlpha(pal.extra[2], 0.85);
    ctx.fillRect(sx, sy, 44, 44);
    ctx.strokeStyle = pal.bg;
    ctx.lineWidth = 3;
    ctx.strokeRect(sx + 6, sy + 6, 32, 32);
    ctx.beginPath();
    ctx.moveTo(sx + 22, sy + 8);
    ctx.lineTo(sx + 22, sy + 36);
    ctx.moveTo(sx + 10, sy + 22);
    ctx.lineTo(sx + 34, sy + 22);
    ctx.stroke();
  },

  seigaiha(ctx, kit, rng, f) {
    const pal = kit.palette;
    const R = 34;
    const rowH = R * 0.5;
    let row = 0;
    for (let y = f.y - R; y < f.y + f.h + R; y += rowH, row++) {
      const off = (row % 2) * R;
      for (let x = f.x - R * 2 + off; x < f.x + f.w + R * 2; x += R * 2) {
        for (let k = 0; k < 4; k++) {
          const r = R * (1 - k * 0.24);
          ctx.beginPath();
          ctx.arc(x, y, r, Math.PI, TAU);
          ctx.closePath();
          ctx.fillStyle = k % 2 ? pal.bg2 : pal.bg;
          ctx.fill();
          ctx.strokeStyle = withAlpha(pal.mid, 0.22);
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }
    }
    // A big bokashi wash across the top, like a print's sky.
    const g = ctx.createLinearGradient(0, f.y, 0, f.y + 200);
    g.addColorStop(0, withAlpha(pal.mid, 0.28));
    g.addColorStop(1, withAlpha(pal.mid, 0));
    ctx.fillStyle = g;
    ctx.fillRect(f.x, f.y, f.w, 200);
  },

  meander(ctx, kit, rng, f) {
    const pal = kit.palette;
    const g = ctx.createRadialGradient(f.x + f.w / 2, f.y + f.h / 2, 80, f.x + f.w / 2, f.y + f.h / 2, f.w * 0.65);
    g.addColorStop(0, mixHex(pal.bg, pal.light, 0.18));
    g.addColorStop(1, pal.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(f.x, f.y, f.w, f.h);
    // Tondo border in the middle of the floor, like the inside of a kylix.
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    ctx.strokeStyle = withAlpha(pal.ink, 0.5);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 236, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 222, 0, TAU);
    ctx.stroke();
    // Rays at the floor edges.
    ctx.fillStyle = withAlpha(pal.ink, 0.22);
    for (let x = f.x; x < f.x + f.w; x += 36) {
      ctx.fill(polyPath([[x, f.y + f.h], [x + 18, f.y + f.h - 44], [x + 36, f.y + f.h]]));
    }
  },

  bauhaus(ctx, kit, rng, f) {
    const pal = kit.palette;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(f.x, f.y, f.w, f.h);
    const [red, yellow, blue] = pal.extra;
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.arc(f.x + f.w * 0.78, f.y + f.h * 0.3, 190, 0, TAU);
    ctx.fill();
    ctx.fillStyle = yellow;
    ctx.fill(polyPath([[f.x + 80, f.y + f.h], [f.x + 330, f.y + 180], [f.x + 580, f.y + f.h]]));
    ctx.fillStyle = blue;
    ctx.fillRect(f.x + f.w * 0.55, f.y + f.h * 0.58, 260, 260);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = withAlpha(pal.ink, 0.6);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(f.x + f.w * 0.32, f.y);
    ctx.lineTo(f.x + f.w * 0.32, f.y + f.h);
    ctx.moveTo(f.x, f.y + f.h * 0.62);
    ctx.lineTo(f.x + f.w, f.y + f.h * 0.62);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(f.x + f.w * 0.7, f.y);
    ctx.lineTo(f.x + f.w * 0.7, f.y + f.h);
    ctx.stroke();
  },

  stainedglass(ctx, kit, rng, f) {
    const pal = kit.palette;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(f.x, f.y, f.w, f.h);
    const cols = 11;
    const rows = 7;
    const cw = f.w / cols;
    const ch = f.h / rows;
    const pts: [number, number][][] = [];
    for (let j = 0; j <= rows; j++) {
      pts.push([]);
      for (let i = 0; i <= cols; i++) {
        const edge = i === 0 || j === 0 || i === cols || j === rows;
        pts[j].push([f.x + i * cw + (edge ? 0 : rng.range(-cw * 0.3, cw * 0.3)), f.y + j * ch + (edge ? 0 : rng.range(-ch * 0.3, ch * 0.3))]);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const quad = polyPath([pts[j][i], pts[j][i + 1], pts[j + 1][i + 1], pts[j + 1][i]]);
        ctx.fillStyle = withAlpha(rng.pick(pal.extra), rng.range(0.1, 0.2));
        ctx.fill(quad);
        ctx.strokeStyle = withAlpha(pal.ink, 0.85);
        ctx.lineWidth = 4;
        ctx.stroke(quad);
      }
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = f.x + rng.range(0, f.w);
      ctx.fillStyle = withAlpha(pal.light, 0.05);
      ctx.fill(polyPath([[x, f.y], [x + 120, f.y], [x + 420, f.y + f.h], [x + 260, f.y + f.h]]));
    }
    ctx.restore();
  },

  blueprint(ctx, kit, rng, f) {
    const pal = kit.palette;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(f.x, f.y, f.w, f.h);
    for (let x = f.x; x < f.x + f.w; x += 20) {
      ctx.strokeStyle = withAlpha('#ffffff', (x - f.x) % 100 === 0 ? 0.22 : 0.08);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, f.y);
      ctx.lineTo(x + 0.5, f.y + f.h);
      ctx.stroke();
    }
    for (let y = f.y; y < f.y + f.h; y += 20) {
      ctx.strokeStyle = withAlpha('#ffffff', (y - f.y) % 100 === 0 ? 0.22 : 0.08);
      ctx.beginPath();
      ctx.moveTo(f.x, y + 0.5);
      ctx.lineTo(f.x + f.w, y + 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = withAlpha('#ffffff', 0.4);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(f.x + f.w / 2, f.y + f.h / 2, 200, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.moveTo(f.x + 40, f.y + f.h / 2);
    ctx.lineTo(f.x + f.w - 40, f.y + f.h / 2);
    ctx.moveTo(f.x + f.w / 2, f.y + 30);
    ctx.lineTo(f.x + f.w / 2, f.y + f.h - 30);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeRect(f.x + f.w - 230, f.y + f.h - 80, 210, 62);
    ctx.fillStyle = withAlpha('#ffffff', 0.55);
    ctx.font = '14px "Share Tech Mono", monospace';
    ctx.fillText('ADONIS · SHEET 03', f.x + f.w - 218, f.y + f.h - 54);
    ctx.fillText('SCALE 1:1  REV. B', f.x + f.w - 218, f.y + f.h - 32);
  },

  impression(ctx, kit, rng, f) {
    const pal = kit.palette;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(f.x, f.y, f.w, f.h);
    const colors = [pal.bg2, ...pal.extra, pal.light];
    for (let i = 0; i < 2600; i++) {
      const x = rng.range(f.x, f.x + f.w);
      const y = rng.range(f.y, f.y + f.h);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng.range(-0.5, 0.5));
      ctx.fillStyle = withAlpha(rng.pick(colors), rng.range(0.18, 0.45));
      ctx.beginPath();
      ctx.ellipse(0, 0, rng.range(5, 13), rng.range(1.5, 3.5), 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < 10; i++) {
      const x = rng.pick([rng.range(f.x, f.x + 200), rng.range(f.x + f.w - 200, f.x + f.w)]);
      const y = rng.range(f.y, f.y + f.h);
      ctx.fillStyle = withAlpha(mixHex(pal.extra[2], pal.ink, 0.2), 0.55);
      ctx.beginPath();
      ctx.ellipse(x, y, rng.range(18, 34), rng.range(10, 18), rng.range(0, 3), 0.3, TAU);
      ctx.lineTo(x, y);
      ctx.fill();
      ctx.fillStyle = withAlpha(pal.extra[0], 0.9);
      ctx.beginPath();
      ctx.arc(x + 4, y - 2, 5, 0, TAU);
      ctx.fill();
    }
  },

  popdots(ctx, kit, rng, f) {
    const pal = kit.palette;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.fillStyle = withAlpha(pal.extra[1], 0.35);
    const step = 16;
    for (let y = f.y; y < f.y + f.h + step; y += step) {
      for (let x = f.x + ((y / step) % 2) * (step / 2); x < f.x + f.w + step; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, 4.2, 0, TAU);
        ctx.fill();
      }
    }
    for (const [x, y, r] of [
      [f.x + 90, f.y + 80, 90],
      [f.x + f.w - 110, f.y + f.h - 90, 110],
    ]) {
      const burst = starPath(x, y, r, r * 0.6, 12);
      ctx.fillStyle = withAlpha('#ffffff', 0.85);
      ctx.fill(burst);
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 4;
      ctx.stroke(burst);
    }
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 5;
    ctx.strokeRect(f.x + 8, f.y + 8, f.w - 16, f.h - 16);
  },

  nouveau(ctx, kit, rng, f) {
    const pal = kit.palette;
    const g = ctx.createLinearGradient(f.x, f.y, f.x, f.y + f.h);
    g.addColorStop(0, pal.bg);
    g.addColorStop(1, pal.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = withAlpha(i % 3 ? pal.mid : pal.extra[0], 0.3);
      ctx.lineWidth = rng.range(2, 5);
      const side = rng.chance(0.5);
      const x0 = side ? f.x : f.x + f.w;
      const y0 = rng.range(f.y, f.y + f.h);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(
        x0 + (side ? 1 : -1) * rng.range(80, 200), y0 + rng.range(-160, 160),
        x0 + (side ? 1 : -1) * rng.range(40, 140), y0 + rng.range(-200, 200),
        x0 + (side ? 1 : -1) * rng.range(140, 260), y0 + rng.range(-120, 120),
      );
      ctx.stroke();
    }
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    ctx.strokeStyle = withAlpha(pal.extra[0], 0.35);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 230, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      ctx.fillStyle = withAlpha(pal.extra[0], 0.3);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 230, cy + Math.sin(a) * 230, 6, 0, TAU);
      ctx.fill();
    }
  },
};

function paintWalls(ctx: Ctx, kit: StyleKit, rng: Rng) {
  const { w, h } = ARENA;
  const pal = kit.palette;
  const t = ARENA.wall;
  const top = ARENA.top;

  const wallPath = new Path2D();
  wallPath.rect(0, 0, w, top);
  wallPath.rect(0, h - t, w, t);
  wallPath.rect(0, top, t, h - top - t);
  wallPath.rect(w - t, top, t, h - top - t);
  ctx.fillStyle = pal.wall;
  ctx.fill(wallPath);

  const inner = { x: t, y: top, w: w - t * 2, h: h - top - t };
  ctx.lineJoin = 'round';

  switch (kit.pattern) {
    case 'marble':
    case 'nouveau': {
      ctx.strokeStyle = pal.extra[0];
      ctx.lineWidth = 4;
      ctx.strokeRect(inner.x - 6, inner.y - 6, inner.w + 12, inner.h + 12);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(inner.x - 14, inner.y - 14, inner.w + 28, inner.h + 28);
      break;
    }
    case 'gears': {
      ctx.fillStyle = pal.mid;
      for (let x = 12; x < w; x += 38) {
        for (const y of [12, top - 14, h - t + 12, h - 14]) {
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, TAU);
          ctx.fill();
        }
      }
      ctx.strokeStyle = pal.mid;
      ctx.lineWidth = 3;
      ctx.strokeRect(inner.x - 3, inner.y - 3, inner.w + 6, inner.h + 6);
      break;
    }
    case 'meander': {
      const band = 18;
      ctx.strokeStyle = pal.light;
      ctx.lineWidth = 2.5;
      const drawKey = (x: number, y: number, s: number) => {
        ctx.beginPath();
        ctx.moveTo(x, y + s);
        ctx.lineTo(x, y);
        ctx.lineTo(x + s, y);
        ctx.lineTo(x + s, y + s * 0.7);
        ctx.lineTo(x + s * 0.35, y + s * 0.7);
        ctx.lineTo(x + s * 0.35, y + s * 0.35);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y + s);
        ctx.lineTo(x + s * 1.3, y + s);
        ctx.stroke();
      };
      for (let x = 10; x < w - 20; x += band * 1.3) {
        drawKey(x, (top - band) / 2, band);
        drawKey(x, h - t + (t - band) / 2, band);
      }
      break;
    }
    case 'seigaiha': {
      ctx.strokeStyle = withAlpha('#ffffff', 0.85);
      ctx.lineWidth = 2;
      for (let x = 0; x < w; x += 28) {
        ctx.beginPath();
        ctx.arc(x, top - 6, 14, Math.PI, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + 14, h - 8, 14, Math.PI, TAU);
        ctx.stroke();
      }
      break;
    }
    case 'ink': {
      ctx.strokeStyle = withAlpha(pal.bg, 0.5);
      for (let i = 0; i < 60; i++) {
        ctx.lineWidth = rng.range(1, 3);
        const y = rng.pick([rng.range(4, top - 4), rng.range(h - t + 4, h - 4)]);
        const x = rng.range(0, w);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + rng.range(30, 160), y + rng.range(-2, 2));
        ctx.stroke();
      }
      break;
    }
    case 'halftone':
    case 'popdots':
    case 'bauhaus': {
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 6;
      ctx.strokeRect(inner.x - 3, inner.y - 3, inner.w + 6, inner.h + 6);
      if (kit.pattern === 'halftone') {
        ctx.fillStyle = withAlpha(pal.ink, 0.12);
        for (let x = 0; x < w; x += 10) {
          for (let y = 0; y < top; y += 10) {
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, TAU);
            ctx.fill();
          }
        }
      }
      break;
    }
    case 'stainedglass': {
      ctx.strokeStyle = pal.extra[0];
      ctx.lineWidth = 2;
      for (let x = 0; x < w; x += 46) {
        ctx.fillStyle = withAlpha(rng.pick(pal.extra), 0.4);
        ctx.fillRect(x + 6, 8, 34, top - 20);
        ctx.strokeRect(x + 6, 8, 34, top - 20);
      }
      break;
    }
    case 'blueprint': {
      ctx.strokeStyle = withAlpha('#ffffff', 0.7);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(inner.x - 6, inner.y - 6, inner.w + 12, inner.h + 12);
      ctx.strokeRect(6, 6, w - 12, h - 12);
      break;
    }
    case 'impression': {
      for (let i = 0; i < 500; i++) {
        const x = rng.range(0, w);
        const y = rng.pick([rng.range(0, top), rng.range(h - t, h)]);
        ctx.fillStyle = withAlpha(rng.pick(pal.extra), 0.4);
        ctx.beginPath();
        ctx.ellipse(x, y, rng.range(4, 10), 2, rng.range(0, 3), 0, TAU);
        ctx.fill();
      }
      break;
    }
  }

  ctx.fillStyle = withAlpha('#000000', 0.18);
  ctx.fillRect(inner.x, inner.y, inner.w, 10);
}

export function paintVignette(ctx: Ctx, kit: StyleKit) {
  const { w, h } = ARENA;
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.72);
  g.addColorStop(0, withAlpha(kit.palette.ink, 0));
  g.addColorStop(1, withAlpha(kit.palette.ink, kit.overlay.vignette));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export { blobPath };
