import { E, FIXED, ramp } from './palette';

export type Ramp = [string, string, string];

export interface RenderOpts {
  roles?: Record<string, Ramp>; // auto-shaded role colours
  colors?: Record<string, string>; // extra fixed colours
  outline?: string | false; // outline colour, default ink
  margin?: number; // transparent border, default 1 (room for the outline)
}

/** A character grid that sprites are painted into, then rendered with auto-shading and an outline. */
export class Grid {
  cells: string[];

  constructor(public w: number, public h: number) {
    this.cells = new Array(w * h).fill('.');
  }

  static ascii(rows: string[], mirror = false): Grid {
    const full = mirror ? rows.map((r) => r + [...r].reverse().join('')) : rows;
    const w = Math.max(...full.map((r) => r.length));
    const g = new Grid(w, full.length);
    full.forEach((row, y) => [...row].forEach((ch, x) => g.set(x, y, ch)));
    return g;
  }

  get(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '.';
    return this.cells[y * this.w + x];
  }

  set(x: number, y: number, ch: string) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y * this.w + x] = ch;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, ch: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, ch);
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, ch: string) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx + 0.5);
        const dy = (y - cy) / (ry + 0.5);
        if (dx * dx + dy * dy <= 1) this.set(x, y, ch);
      }
    }
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, ch: string) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, ch);
    return this;
  }

  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, ch: string) {
    const minX = Math.floor(Math.min(ax, bx, cx));
    const maxX = Math.ceil(Math.max(ax, bx, cx));
    const minY = Math.floor(Math.min(ay, by, cy));
    const maxY = Math.ceil(Math.max(ay, by, cy));
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / area;
        const w1 = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 >= -0.05 && w1 >= -0.05 && w2 >= -0.05) this.set(x, y, ch);
      }
    }
    return this;
  }

  blit(src: Grid, ox: number, oy: number) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const ch = src.get(x, y);
      if (ch !== '.') this.set(ox + x, oy + y, ch);
    }
    return this;
  }

  /** Render to a canvas: role pixels get light on top/left edges and shade on bottom/right edges. */
  render(opts: RenderOpts = {}): HTMLCanvasElement {
    const m = opts.margin ?? 1;
    const c = document.createElement('canvas');
    c.width = this.w + m * 2;
    c.height = this.h + m * 2;
    const ctx = c.getContext('2d')!;
    const roles = opts.roles ?? {};
    const colors = { ...FIXED, ...(opts.colors ?? {}) };
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const ch = this.get(x, y);
        if (ch === '.') continue;
        let col: string | undefined;
        const r = roles[ch];
        if (r) {
          const up = this.get(x, y - 1) === '.';
          const left = this.get(x - 1, y) === '.';
          const down = this.get(x, y + 1) === '.';
          const right = this.get(x + 1, y) === '.';
          col = up || (left && !down) ? r[0] : down || right ? r[2] : r[1];
        } else col = colors[ch];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x + m, y + m, 1, 1);
      }
    }
    if (opts.outline !== false) outlineCanvas(c, opts.outline ?? E.ink);
    return c;
  }
}

/** Adds a 1px outline around every opaque pixel (4-neighbourhood). */
export function outlineCanvas(c: HTMLCanvasElement, color: string) {
  const ctx = c.getContext('2d')!;
  const { width: w, height: h } = c;
  const img = ctx.getImageData(0, 0, w, h);
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img.data[(y * w + x) * 4 + 3]);
  ctx.fillStyle = color;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a(x, y) > 0) continue;
      if (a(x - 1, y) > 0 || a(x + 1, y) > 0 || a(x, y - 1) > 0 || a(x, y + 1) > 0) ctx.fillRect(x, y, 1, 1);
    }
  }
}

export function flipCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

export const CJK_FONT = "'FusionPixel','PingFang SC','Microsoft YaHei',sans-serif";
export const PIXEL_FONT = "'Press Start 2P'";

const textCache = new Map<string, HTMLCanvasElement>();
const measureCtx = document.createElement('canvas').getContext('2d')!;

/** Width of a string in the 12px pixel font, for wrapping. */
export function pxMeasure(text: string): number {
  measureCtx.font = `12px ${CJK_FONT}`;
  return Math.ceil(measureCtx.measureText(text).width);
}

/**
 * Crisp pixel text. Chinese and Latin use Fusion Pixel at its native 12px (bitmap-designed glyphs),
 * tiny numerals can use Press Start 2P at 8px. Anti-aliasing is thresholded away, then the result is
 * outlined and scaled up by whole pixels, so it stays a true pixel image at any size.
 * The canvas is cropped to the font's line box plus one pixel for the outline, so text lines stack tightly.
 */
export function pxText(text: string, o: { size?: number; color: string; outline?: string; shadow?: string; small?: boolean; font?: string }): HTMLCanvasElement {
  const key = JSON.stringify([text, o]);
  const hit = textCache.get(key);
  if (hit) return hit;
  const base = o.small ? 8 : 12;
  const fam = o.font ?? (o.small ? PIXEL_FONT : CJK_FONT);
  const scale = Math.max(1, Math.round((o.size ?? base) / base));
  const font = `${base}px ${fam}`;
  measureCtx.font = font;
  const m = measureCtx.measureText(text);
  const asc = Math.round(m.fontBoundingBoxAscent ?? base * 0.85);
  const desc = Math.round(m.fontBoundingBoxDescent ?? base * 0.15);
  const edge = o.outline ? 1 : 0;
  const sh = o.shadow ? 1 : 0;
  const w = Math.max(1, Math.ceil(m.width) + edge * 2 + sh);
  const h = asc + desc + edge * 2 + sh;
  const glyph = document.createElement('canvas');
  glyph.width = w;
  glyph.height = h;
  const ctx = glyph.getContext('2d')!;
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, edge, edge + asc);
  const img = ctx.getImageData(0, 0, w, h);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(o.color.slice(i, i + 2), 16));
  for (let i = 0; i < img.data.length; i += 4) {
    const on = img.data[i + 3] > 100;
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = on ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
  let out = glyph;
  if (o.shadow || o.outline) {
    out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const octx = out.getContext('2d')!;
    if (o.shadow) octx.drawImage(tint(glyph, o.shadow), 1, 1);
    if (o.outline) {
      const ring = document.createElement('canvas');
      ring.width = w;
      ring.height = h;
      const rctx = ring.getContext('2d')!;
      rctx.drawImage(glyph, 0, 0);
      outlineCanvas(ring, o.outline);
      rctx.globalCompositeOperation = 'destination-out';
      rctx.drawImage(glyph, 0, 0);
      octx.drawImage(ring, 0, 0);
    }
    octx.drawImage(glyph, 0, 0);
  }
  if (scale > 1) {
    const big = document.createElement('canvas');
    big.width = out.width * scale;
    big.height = out.height * scale;
    const bctx = big.getContext('2d')!;
    bctx.imageSmoothingEnabled = false;
    bctx.drawImage(out, 0, 0, big.width, big.height);
    out = big;
  }
  textCache.set(key, out);
  return out;
}

export function tint(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

export { ramp };
