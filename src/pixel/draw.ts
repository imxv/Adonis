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

export const CJK_FONT = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans SC',sans-serif";
export const PIXEL_FONT = "'Press Start 2P'";

const textCache = new Map<string, HTMLCanvasElement>();

/**
 * Crisp pixel text from any font: rasterise at 1x, drop anti-aliasing with an alpha threshold, then outline.
 * This is how Chinese text gets a true pixel look without a Chinese pixel font.
 */
export function pxText(
  text: string,
  o: { size: number; color: string; outline?: string; shadow?: string; font?: string; bold?: boolean; threshold?: number },
): HTMLCanvasElement {
  const key = JSON.stringify([text, o]);
  const hit = textCache.get(key);
  if (hit) return hit;
  const ascii = /^[\x20-\x7e×♥]*$/.test(text);
  const fam = o.font ?? (ascii ? PIXEL_FONT : CJK_FONT);
  const size = ascii && !o.font ? Math.max(8, Math.round(o.size / 8) * 8) : o.size;
  const font = `${o.bold === false ? '' : ascii ? '' : '600 '}${size}px ${fam}`;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const tw = Math.ceil(probe.measureText(text).width);
  const pad = 2;
  const c = document.createElement('canvas');
  c.width = Math.max(1, tw + pad * 2);
  c.height = size + pad * 2 + 2;
  const ctx = c.getContext('2d')!;
  ctx.font = font;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, pad, pad + (ascii ? 0 : 1));
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const th = o.threshold ?? (ascii ? 90 : 120);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(o.color.slice(i, i + 2), 16));
  for (let i = 0; i < img.data.length; i += 4) {
    const on = img.data[i + 3] > th;
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = on ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
  let out = c;
  if (o.shadow || o.outline) {
    const big = document.createElement('canvas');
    big.width = c.width + 2;
    big.height = c.height + 2;
    const bctx = big.getContext('2d')!;
    if (o.shadow) {
      const sh = tint(c, o.shadow);
      bctx.drawImage(sh, 1, 2);
    }
    bctx.drawImage(c, 1, 1);
    if (o.outline) {
      const tmp = document.createElement('canvas');
      tmp.width = big.width;
      tmp.height = big.height;
      tmp.getContext('2d')!.drawImage(c, 1, 1);
      outlineCanvas(tmp, o.outline);
      // Keep only the outline ring, then paint the text back on top.
      const tctx = tmp.getContext('2d')!;
      tctx.globalCompositeOperation = 'destination-out';
      tctx.drawImage(c, 1, 1);
      bctx.drawImage(tmp, 0, 0);
    }
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
