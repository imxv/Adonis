import { Rng } from '../core/rng';
import { TAU, mixHex, withAlpha } from '../core/math';
import type { StyleKit } from './types';

export type Ctx = CanvasRenderingContext2D;

export interface Bounds {
  cx: number;
  cy: number;
  r: number;
}

/** Fill a shape using the kit's shading language, then outline it. */
export function paintBody(
  ctx: Ctx,
  kit: StyleKit,
  path: Path2D,
  fill: string,
  b: Bounds,
  opts: { outline?: boolean; seed?: number; light?: string; dark?: string } = {},
) {
  const pal = kit.palette;
  const light = opts.light ?? mixHex(fill, '#ffffff', 0.45);
  const dark = opts.dark ?? mixHex(fill, pal.ink, 0.55);
  const rng = new Rng(opts.seed ?? 7);

  ctx.save();
  switch (kit.shading) {
    case 'gradient': {
      const g = ctx.createRadialGradient(b.cx - b.r * 0.35, b.cy - b.r * 0.4, b.r * 0.05, b.cx, b.cy, b.r * 1.15);
      g.addColorStop(0, light);
      g.addColorStop(0.45, fill);
      g.addColorStop(1, dark);
      ctx.fillStyle = g;
      ctx.fill(path);
      break;
    }
    case 'bokashi': {
      const g = ctx.createLinearGradient(0, b.cy - b.r, 0, b.cy + b.r);
      g.addColorStop(0, dark);
      g.addColorStop(0.55, fill);
      g.addColorStop(1, light);
      ctx.fillStyle = g;
      ctx.fill(path);
      break;
    }
    case 'wash': {
      ctx.fillStyle = withAlpha(fill, 0.85);
      ctx.fill(path);
      ctx.clip(path);
      const g = ctx.createRadialGradient(b.cx - b.r * 0.2, b.cy - b.r * 0.2, b.r * 0.1, b.cx, b.cy, b.r * 1.05);
      g.addColorStop(0, withAlpha(light, 0.55));
      g.addColorStop(0.6, withAlpha(fill, 0));
      g.addColorStop(1, withAlpha(pal.ink, 0.55));
      ctx.fillStyle = g;
      ctx.fillRect(b.cx - b.r * 1.5, b.cy - b.r * 1.5, b.r * 3, b.r * 3);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = withAlpha(pal.ink, rng.range(0.04, 0.12));
        ctx.beginPath();
        ctx.arc(b.cx + rng.range(-b.r, b.r) * 0.7, b.cy + rng.range(-b.r, b.r) * 0.7, rng.range(b.r * 0.2, b.r * 0.5), 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'facets': {
      ctx.fillStyle = fill;
      ctx.fill(path);
      ctx.clip(path);
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU + rng.range(-0.2, 0.2);
        const a1 = ((i + 1) / n) * TAU;
        ctx.beginPath();
        ctx.moveTo(b.cx + rng.range(-3, 3), b.cy + rng.range(-3, 3));
        ctx.lineTo(b.cx + Math.cos(a0) * b.r * 1.6, b.cy + Math.sin(a0) * b.r * 1.6);
        ctx.lineTo(b.cx + Math.cos(a1) * b.r * 1.6, b.cy + Math.sin(a1) * b.r * 1.6);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? withAlpha(light, 0.35) : withAlpha(dark, 0.3);
        ctx.fill();
        ctx.strokeStyle = withAlpha(pal.ink, 0.85);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      break;
    }
    default: {
      ctx.fillStyle = fill;
      ctx.fill(path);
    }
  }
  ctx.restore();

  if (kit.shading === 'hatching' || kit.shading === 'halftone') {
    ctx.save();
    ctx.clip(path);
    if (kit.shading === 'hatching') {
      ctx.strokeStyle = withAlpha(pal.ink, 0.45);
      ctx.lineWidth = 1;
      for (let x = -b.r * 2; x < b.r * 2; x += 3.5) {
        ctx.beginPath();
        ctx.moveTo(b.cx + x, b.cy + b.r * 1.2);
        ctx.lineTo(b.cx + x + b.r * 1.2, b.cy);
        ctx.stroke();
      }
      ctx.fillStyle = withAlpha(light, 0.5);
      ctx.beginPath();
      ctx.ellipse(b.cx - b.r * 0.3, b.cy - b.r * 0.35, b.r * 0.45, b.r * 0.3, -0.6, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = withAlpha(dark, 0.7);
      const step = Math.max(4, b.r / 5);
      for (let y = b.cy - b.r; y < b.cy + b.r + step; y += step) {
        for (let x = b.cx - b.r; x < b.cx + b.r + step; x += step) {
          const t = (x - b.cx + (y - b.cy)) / (b.r * 2);
          if (t < 0) continue;
          ctx.beginPath();
          ctx.arc(x, y, Math.min(step * 0.48, t * step * 0.6), 0, TAU);
          ctx.fill();
        }
      }
      ctx.fillStyle = withAlpha('#ffffff', 0.85);
      ctx.beginPath();
      ctx.ellipse(b.cx - b.r * 0.35, b.cy - b.r * 0.4, b.r * 0.2, b.r * 0.12, -0.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  if (opts.outline !== false) strokeOutline(ctx, kit, path, rng);
}

export function strokeOutline(ctx: Ctx, kit: StyleKit, path: Path2D, rng = new Rng(3)) {
  const { mode, width } = kit.outline;
  const ink = kit.palette.ink;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (mode) {
    case 'none':
      break;
    case 'thin':
    case 'thick':
      ctx.strokeStyle = ink;
      ctx.lineWidth = width;
      ctx.stroke(path);
      break;
    case 'incised':
      ctx.strokeStyle = ink;
      ctx.lineWidth = width;
      ctx.stroke(path);
      break;
    case 'double':
      ctx.strokeStyle = ink;
      ctx.lineWidth = width + 2;
      ctx.stroke(path);
      ctx.strokeStyle = kit.palette.light;
      ctx.lineWidth = 1;
      ctx.stroke(path);
      break;
    case 'ink':
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(rng.range(-0.8, 0.8), rng.range(-0.8, 0.8));
        ctx.strokeStyle = withAlpha(ink, i === 0 ? 0.9 : 0.35);
        ctx.lineWidth = width * (i === 0 ? 1 : rng.range(0.5, 1.6));
        ctx.setLineDash(i === 2 ? [rng.range(6, 14), rng.range(2, 5)] : []);
        ctx.stroke(path);
        ctx.restore();
      }
      break;
  }
  ctx.restore();
}

export function circlePath(cx: number, cy: number, r: number): Path2D {
  const p = new Path2D();
  p.arc(cx, cy, r, 0, TAU);
  return p;
}

export function polyPath(pts: [number, number][]): Path2D {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}

export function blobPath(cx: number, cy: number, r: number, seed: number, wobble = 0.16, n = 10): Path2D {
  const rng = new Rng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (1 + rng.range(-wobble, wobble));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  const p = new Path2D();
  for (let i = 0; i <= n; i++) {
    const [x0, y0] = pts[i % n];
    const [x1, y1] = pts[(i + 1) % n];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    if (i === 0) p.moveTo(mx, my);
    else p.quadraticCurveTo(x0, y0, mx, my);
  }
  p.closePath();
  return p;
}

export function gearPath(cx: number, cy: number, r: number, teeth = 8, depth = 0.18): Path2D {
  const p = new Path2D();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = i % 4;
    const rr = k === 1 || k === 2 ? r : r * (1 - depth);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

export function starPath(cx: number, cy: number, r: number, inner: number, points: number, rot = -Math.PI / 2): Path2D {
  const p = new Path2D();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i / (points * 2)) * TAU;
    const rr = i % 2 ? inner : r;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

/** Base silhouette for the standard enemy, following the kit's shape language. */
export function silhouette(kit: StyleKit, cx: number, cy: number, r: number, seed: number): Path2D {
  switch (kit.shape) {
    case 'angular': {
      const pts: [number, number][] = [];
      const rng = new Rng(seed);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        const rr = r * rng.range(0.85, 1.08);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      return polyPath(pts);
    }
    case 'mechanical':
      return gearPath(cx, cy, r, 9, 0.16);
    case 'organic':
      return blobPath(cx, cy, r, seed, 0.18, 9);
    case 'geometric': {
      const s = r * 0.88;
      return polyPath([
        [cx - s, cy - s],
        [cx + s, cy - s],
        [cx + s, cy + s],
        [cx - s, cy + s],
      ]);
    }
    default:
      return circlePath(cx, cy, r);
  }
}

/** Eyes or lenses, drawn facing +x. */
export function paintEyes(ctx: Ctx, kit: StyleKit, cx: number, cy: number, r: number) {
  const pal = kit.palette;
  ctx.save();
  switch (kit.shape) {
    case 'mechanical': {
      ctx.fillStyle = pal.ink;
      ctx.beginPath();
      ctx.arc(cx + r * 0.35, cy, r * 0.32, 0, TAU);
      ctx.fill();
      ctx.fillStyle = pal.danger;
      ctx.beginPath();
      ctx.arc(cx + r * 0.38, cy, r * 0.18, 0, TAU);
      ctx.fill();
      break;
    }
    case 'angular': {
      ctx.fillStyle = pal.light;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + r * 0.1, cy + s * r * 0.12);
        ctx.lineTo(cx + r * 0.62, cy + s * r * 0.42);
        ctx.lineTo(cx + r * 0.55, cy + s * r * 0.12);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'organic': {
      ctx.fillStyle = pal.ink;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + r * 0.38, cy + s * r * 0.28, r * 0.12, r * 0.16, 0, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'geometric': {
      ctx.strokeStyle = kit.outline.mode === 'incised' ? pal.light : pal.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + r * 0.35, cy - r * 0.05, r * 0.22, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(cx + r * 0.38, cy - r * 0.05, r * 0.08, 0, TAU);
      ctx.fill();
      break;
    }
    default: {
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(cx + r * 0.35, cy + s * r * 0.3, r * 0.2, r * 0.24, 0, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = pal.ink;
        ctx.stroke();
        ctx.fillStyle = pal.ink;
        ctx.beginPath();
        ctx.arc(cx + r * 0.42, cy + s * r * 0.3, r * 0.1, 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}
