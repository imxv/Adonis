/** Integer-only drawing helpers in the garden's 480 × 320 logical pixels. */
export class PixelPainter {
  constructor(readonly ctx: CanvasRenderingContext2D) {}
  rect(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }
  line(ax: number, ay: number, bx: number, by: number, color: string, size = 1) {
    ax = Math.round(ax); ay = Math.round(ay); bx = Math.round(bx); by = Math.round(by);
    const dx = Math.abs(bx - ax), sx = ax < bx ? 1 : -1;
    const dy = -Math.abs(by - ay), sy = ay < by ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      this.rect(ax, ay, size, size, color);
      if (ax === bx && ay === by) break;
      const e = error * 2;
      if (e >= dy) { error += dy; ax += sx; }
      if (e <= dx) { error += dx; ay += sy; }
    }
  }
  poly(points: readonly (readonly number[])[], color: string) {
    const minY = Math.ceil(Math.min(...points.map(p => p[1]))), maxY = Math.floor(Math.max(...points.map(p => p[1])));
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[j], b = points[i];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) this.rect(Math.ceil(xs[i]), y, Math.floor(xs[i + 1]) - Math.ceil(xs[i]) + 1, 1, color);
    }
  }
  oval(cx: number, cy: number, rx: number, ry: number, color: string) {
    if (rx <= 0 || ry <= 0) return;
    for (let y = -Math.ceil(ry); y <= ry; y++) {
      const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - y * y / (ry * ry))));
      this.rect(cx - half, cy + y, half * 2 + 1, 1, color);
    }
  }
  ring(cx: number, cy: number, rx: number, ry: number, color: string) {
    const n = Math.ceil(Math.max(rx, ry) * 8);
    for (let i = 0; i <= n; i++) this.rect(cx + Math.cos(i / n * Math.PI * 2) * rx, cy + Math.sin(i / n * Math.PI * 2) * ry, 1, 1, color);
  }
}

/** Fixed spatial seed: detail is stable across frames and remounts. */
export function commissionHash(x: number, y: number): number {
  let h = Math.imul(x + 719, 1597334677) ^ Math.imul(y + 271, 3812015801);
  h = Math.imul(h ^ h >>> 16, 2246822507);
  return (h ^ h >>> 13) >>> 0;
}
