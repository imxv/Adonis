import { drawPixelPaintings } from './gallery-pixel-paintings';
import { drawPixelDecorBack, drawPixelDecorFront } from './gallery-pixel-decor';
import { drawPixelFloor } from './gallery-pixel-floor';

/** All dimensions below are source pixels. The public room remains 1672 × 941. */
const W = 836;
const H = 471;
const WORLD_W = 1672;
const WORLD_H = 941;
const TAU = Math.PI * 2;
const STONE = ['#393949', '#514a59', '#726878', '#8d8290', '#b3a599', '#d5c5aa'];
const GOLD = ['#392c2b', '#60442e', '#aa783d', '#d5a75c', '#eac77b', '#fff0b5'];
const LEAF = ['#102c2c', '#173d35', '#28523d', '#3b6846', '#7e9755'];
type Ctx = CanvasRenderingContext2D;

function box(c: Ctx, x: number, y: number, w: number, h: number, color: string) {
  c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function line(c: Ctx, ax: number, ay: number, bx: number, by: number, color: string, size = 1) {
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
  for (let i = 0; i <= n; i++) box(c, ax + (bx - ax) * i / n, ay + (by - ay) * i / n, size, size, color);
}
function oval(c: Ctx, x: number, y: number, rx: number, ry: number, color: string) {
  for (let v = -Math.ceil(ry); v <= ry; v++) {
    const dx = Math.floor(rx * Math.sqrt(Math.max(0, 1 - v * v / (ry * ry))));
    box(c, x - dx, y + v, dx * 2 + 1, 1, color);
  }
}
function ring(c: Ctx, x: number, y: number, rx: number, ry: number, color: string, thick = 1) {
  const steps = Math.ceil(Math.max(rx, ry) * 8);
  for (let i = 0; i <= steps; i++) box(c, x + Math.cos(i / steps * TAU) * rx, y + Math.sin(i / steps * TAU) * ry, thick, thick, color);
}
function poly(c: Ctx, pts: number[][], color: string) {
  const y0 = Math.ceil(Math.min(...pts.map(p => p[1]))), y1 = Math.floor(Math.max(...pts.map(p => p[1])));
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[j], b = pts[i];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) box(c, Math.ceil(xs[i]), y, Math.floor(xs[i + 1]) - Math.ceil(xs[i]) + 1, 1, color);
  }
}
const hash = (x: number, y: number) => {
  let h = Math.imul(x + 371, 1597334677) ^ Math.imul(y + 1117, 3812015801);
  h = Math.imul(h ^ h >>> 16, 2246822507);
  return (h ^ h >>> 13) >>> 0;
};
function arch(c: Ctx, x: number, y: number, w: number, h: number, color: string) {
  const rx = w / 2, crown = y + rx;
  for (let row = Math.max(0, Math.floor(y)); row < y + h; row++) {
    const half = row < crown ? rx * Math.sqrt(Math.max(0, 1 - ((row - crown) / rx) ** 2)) : rx;
    box(c, x + rx - half, row, Math.ceil(half * 2), 1, color);
  }
}
function cypress(c: Ctx, x: number, y: number, height: number, tint = '#101f2c') {
  line(c, x, y, x, y - height, '#182731', 2);
  for (let i = 0; i < height; i += 3) {
    const spread = Math.sin(i / height * Math.PI * 0.8) * height * 0.1 + 1;
    box(c, x - spread, y - height + i, spread * 2, 4, tint);
    if (i % 9 === 0) box(c, x - spread, y - height + i, 2, 3, '#263c48');
  }
}
function nightWindow(c: Ctx, x: number, y: number, w: number, h: number, moon: boolean) {
  arch(c, x - 8, y - 6, w + 16, h + 12, '#262b40');
  arch(c, x - 5, y - 3, w + 10, h + 6, '#8d8290');
  arch(c, x - 1, y, w + 2, h, '#3b4055');
  arch(c, x, y + 2, w, h - 4, '#101c35');
  // Everything in the opening is scanline-clipped to the arch, including stars.
  const sky = document.createElement('canvas'); sky.width = w; sky.height = h;
  const a = sky.getContext('2d')!;
  for (let v = 0; v < h; v += 8) box(a, 0, v, w, 8, ['#172747', '#1b3051', '#243858', '#2a4663'][Math.min(3, Math.floor(v / h * 4))]);
  for (let i = 0; i < 38; i++) {
    const sx = hash(i, 3) % w, sy = hash(i, 8) % Math.max(1, h - 28);
    box(a, sx, sy, 1, i % 11 ? 1 : 2, i % 3 ? '#8bafbf' : '#cfdae1');
  }
  if (moon) {
    oval(a, w * .34, 28, 10, 10, '#416181');
    oval(a, w * .34, 28, 8, 8, '#b6d4df');
    oval(a, w * .34 - 2, 25, 5, 5, '#e5e5cf');
    for (const [ox, oy, r] of [[2, 4, 2], [-3, 0, 2], [3, -3, 1]]) oval(a, w * .34 + ox, 28 + oy, r, r, '#94b8cc');
  }
  poly(a, [[0, h - 24], [w * .21, h - 55], [w * .36, h - 38], [w * .64, h - 78], [w * .8, h - 46], [w, h - 63], [w, h], [0, h]], '#1c3652');
  line(a, w * .36, h - 38, w * .64, h - 78, '#62829b');
  line(a, w * .64, h - 78, w * .7, h - 58, '#456985');
  poly(a, [[0, h - 17], [w * .2, h - 33], [w * .37, h - 25], [w * .67, h - 35], [w, h - 21], [w, h], [0, h]], '#132c40');
  box(a, 0, h - 18, w, 18, '#28475a');
  for (let v = h - 17; v < h; v += 3) for (let i = 0; i < 9; i++) {
    const sx = hash(i, v) % w;
    box(a, sx, v, 2 + hash(v, i) % 13, 1, i % 3 ? '#3c6373' : '#8cabb6');
  }
  cypress(a, w * .15, h, 45); cypress(a, w * .22, h, 30);
  // Copy only integer spans: no vector clip or antialiased arch boundary.
  for (let row = 0; row < h; row++) {
    const rx = w / 2, cy = rx;
    const half = row < cy ? Math.floor(rx * Math.sqrt(Math.max(0, 1 - ((row - cy) / rx) ** 2))) : rx;
    const left = Math.ceil(rx - half), span = Math.floor(half * 2);
    if (span > 0) c.drawImage(sky, left, row, span, 1, x + left, y + row, span, 1);
  }
  sky.width = sky.height = 1;
  box(c, x - 7, y + h - 3, w + 14, 4, '#b0a494'); box(c, x - 9, y + h + 1, w + 18, 3, '#5a5969');
  // Alternating voussoir blocks reveal the arch's thickness.
  for (let i = 0; i <= 14; i++) {
    const angle = Math.PI + i / 14 * Math.PI;
    const cx = x + w / 2, cy = y + w / 2;
    line(c, cx + Math.cos(angle) * (w / 2 + 1), cy + Math.sin(angle) * (w / 2 + 1), cx + Math.cos(angle) * (w / 2 + 8), cy + Math.sin(angle) * (w / 2 + 8), '#454352');
  }
}
function masonry(c: Ctx) {
  box(c, 0, 0, W, 269, '#403f50');
  for (let row = 0; row < 11; row++) {
    const yy = row * 24 - 4;
    for (let col = -1; col < 19; col++) {
      const xx = col * 49 + (row % 2) * 23;
      const tone = hash(col, row) % 4;
      box(c, xx, yy, 47, 22, ['#474654', '#4e4b59', '#58515f', '#514d5b'][tone]);
      box(c, xx + 1, yy + 1, 45, 1, '#726878');
      box(c, xx + 46, yy + 2, 1, 20, '#363547');
      box(c, xx + 2, yy + 20, 43, 1, '#363547');
      if (tone === 1) {
        line(c, xx + 9, yy + 5, xx + 13, yy + 9, '#605868');
        line(c, xx + 13, yy + 9, xx + 24, yy + 12, '#605868');
      }
    }
  }
  // A coherent repeating frieze, not random surface speckle.
  for (let x = 0; x < W; x += 18) {
    box(c, x, 237, 18, 13, '#353647');
    line(c, x + 2, 239, x + 14, 239, '#9d8b75');
    line(c, x + 14, 239, x + 14, 247, '#9d8b75');
    line(c, x + 14, 247, x + 7, 247, '#9d8b75');
    line(c, x + 7, 247, x + 7, 243, '#9d8b75');
  }
  box(c, 0, 251, W, 3, '#9b8d82'); box(c, 0, 254, W, 4, '#323344');
}
function column(c: Ctx, x: number, top: number, bottom: number, width: number, lightLeft: boolean) {
  const left = x - width / 2;
  // The wall-facing contact shadow stays consistently on one side.
  poly(c, [[left + width - 2, top + 14], [left + width + 11, top + 20], [left + width + 13, bottom + 5], [left + width - 2, bottom]], '#202638');
  box(c, left - 6, bottom + 3, width + 16, 7, '#292d3e');
  box(c, left - 7, bottom - 1, width + 14, 5, '#b4a38d');
  box(c, left - 5, bottom - 7, width + 10, 6, '#706575');
  box(c, left - 3, bottom - 10, width + 6, 4, '#d0bda0');
  box(c, left, top + 14, width, bottom - top - 24, '#817480');
  const bands = lightLeft ? ['#c8b8a0', '#a59794', '#8d8290', '#675e72', '#47465b'] : ['#5b5269', '#8d8290', '#baaa9a', '#a2928f', '#655a6e'];
  for (let i = 0; i < 5; i++) box(c, left + i * width / 5, top + 14, Math.ceil(width / 5), bottom - top - 24, bands[i]);
  for (let xx = left + 4; xx < left + width - 3; xx += 5) {
    box(c, xx, top + 19, 1, bottom - top - 34, '#514a61');
    box(c, xx + 1, top + 17, 1, bottom - top - 32, '#b9aa9e');
  }
  for (let yy = top + 42; yy < bottom - 17; yy += 41) {
    line(c, left + 2, yy, left + width - 2, yy - 2, '#625a6d');
    line(c, left + 3, yy + 1, left + width - 3, yy - 1, '#baaa9a');
    line(c, left + width * .65, yy + 3, left + width * .48, yy + 12, '#736a7b');
  }
  // Corinthian capital: stepped abacus, volutes and carved acanthus leaves.
  box(c, left - 7, top, width + 14, 4, '#d9c8a8');
  box(c, left - 5, top + 4, width + 10, 4, '#a8957e');
  box(c, left - 3, top + 8, width + 6, 5, '#8f6d4c');
  box(c, left, top + 13, width, 3, '#d5b06d');
  for (let xx = left - 2; xx < left + width + 3; xx += 6) {
    poly(c, [[xx, top + 6], [xx + 4, top + 4], [xx + 5, top + 10], [xx + 2, top + 14], [xx, top + 9]], GOLD[2]);
    line(c, xx + 1, top + 6, xx + 2, top + 11, GOLD[4]);
  }
  ring(c, left - 1, top + 6, 4, 3, GOLD[3]); ring(c, left + width, top + 6, 4, 3, GOLD[3]);
  box(c, left - 2, bottom - 12, width + 4, 2, '#e1c8a2');
}
function swag(c: Ctx, x: number, y: number, length: number, direction = 1) {
  for (let i = 0; i < length; i += 3) {
    const cx = x + Math.sin(i * .17) * 5 + i * .14 * direction, cy = y + i;
    line(c, cx, cy - 3, cx + direction, cy + 4, '#403b2c');
    const shade = hash(i, x) % 3;
    for (const side of [-1, 1]) {
      poly(c, [[cx, cy], [cx + side * (4 + shade), cy - 3], [cx + side * 5, cy + 2], [cx, cy + 4]], LEAF[shade + 1]);
      box(c, cx + side * 3, cy, 2, 1, LEAF[4]);
    }
    if (i % 15 === 0) {
      box(c, cx + 3, cy + 1, 3, 3, '#8a3446'); box(c, cx + 3, cy, 2, 1, '#c06560');
    }
  }
}
function banner(c: Ctx, x: number, y: number, w: number, h: number, flipped = false) {
  box(c, x - 3, y - 3, w + 6, 2, GOLD[3]);
  poly(c, [[x, y], [x + w, y], [x + w, y + h - 8], [x + w / 2, y + h], [x, y + h - 8]], '#522636');
  box(c, x + 3, y, w - 6, h - 9, '#6a2b3b');
  box(c, x + 5, y + 1, 2, h - 13, '#913747'); box(c, x + w - 7, y, 3, h - 14, '#3d2034');
  for (let yy = y + 8; yy < y + h - 10; yy += 10) {
    for (const side of [-1, 1]) poly(c, [[x + w / 2, yy + 4], [x + w / 2 + side * 5, yy], [x + w / 2 + side * 4, yy + 5], [x + w / 2, yy + 8]], GOLD[2]);
  }
  line(c, x + 2, y + h - 9, x + w / 2, y + h - 3, GOLD[3]);
  line(c, x + w / 2, y + h - 3, x + w - 2, y + h - 9, GOLD[3]);
  box(c, x + (flipped ? w - 1 : 0), y, 1, h - 9, GOLD[4]);
}
function statue(c: Ctx, x: number, y: number, mirror: number) {
  // Small winged stone attendants flank the recessed celestial instrument.
  poly(c, [[x, y + 12], [x - mirror * 19, y - 8], [x - mirror * 23, y + 2], [x - mirror * 18, y + 26], [x - mirror * 4, y + 36]], '#756b7b');
  for (let i = 0; i < 5; i++) line(c, x - mirror * 20, y + i * 4, x - mirror * (4 + i), y + 27 + i, i % 2 ? '#b8ad9c' : '#8a8090');
  oval(c, x, y, 6, 8, '#bcb09e');
  box(c, x - 5, y - 7, 10, 3, '#ddd0b2'); box(c, x + mirror * 3, y, 2, 5, '#7f7585');
  poly(c, [[x - 5, y + 10], [x + 7, y + 10], [x + 11, y + 48], [x - 10, y + 48]], '#a99c97');
  for (let i = -5; i <= 6; i += 3) line(c, x + i / 2, y + 17, x + i, y + 45, i % 2 ? '#dbccb0' : '#726c80');
  line(c, x + mirror * 5, y + 13, x + mirror * 11, y + 24, '#c4b6a0', 3);
  line(c, x + mirror * 11, y + 24, x + mirror * 20, y + 12, '#b2a595', 3);
  box(c, x - 12, y + 48, 26, 4, '#ddd0b3'); box(c, x - 10, y + 52, 23, 17, '#7f7582');
  box(c, x - 7, y + 54, 16, 12, '#a19390'); box(c, x - 14, y + 69, 30, 4, '#c7b6a0');
}
function sanctuary(c: Ctx) {
  arch(c, 359, 107, 118, 157, '#26283b');
  arch(c, 365, 111, 106, 151, '#8a7d80');
  arch(c, 369, 115, 98, 147, '#343346');
  arch(c, 374, 121, 88, 140, '#18253c');
  arch(c, 379, 126, 78, 135, '#1d2e45');
  for (let i = 0; i <= 11; i++) {
    const ang = Math.PI + i / 11 * Math.PI;
    line(c, 418 + Math.cos(ang) * 51, 163 + Math.sin(ang) * 51, 418 + Math.cos(ang) * 59, 163 + Math.sin(ang) * 59, '#494756');
    box(c, 418 + Math.cos(ang) * 56, 163 + Math.sin(ang) * 56, 2, 1, '#d1baa1');
  }
  // Static engraved celestial dial. Moving details are added separately.
  for (const r of [17, 28, 41]) ring(c, 418, 178, r, r, GOLD[r === 41 ? 2 : 3]);
  ring(c, 418, 178, 39, 39, GOLD[1]);
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU;
    line(c, 418 + Math.cos(a) * 36, 178 + Math.sin(a) * 36, 418 + Math.cos(a) * 40, 178 + Math.sin(a) * 40, GOLD[i % 3 ? 2 : 4]);
    if (i % 3 === 0) {
      box(c, 418 + Math.cos(a) * 45, 178 + Math.sin(a) * 45, 2, 2, GOLD[3]);
      line(c, 418 + Math.cos(a) * 43, 178 + Math.sin(a) * 43, 418 + Math.cos(a) * 47, 178 + Math.sin(a) * 47, GOLD[2]);
    }
  }
  line(c, 377, 178, 459, 178, GOLD[2]); line(c, 418, 137, 418, 219, GOLD[2]);
  ring(c, 418, 178, 34, 12, GOLD[3]);
  line(c, 397, 204, 440, 150, GOLD[3]);
  oval(c, 418, 178, 5, 5, GOLD[2]); oval(c, 416, 176, 3, 3, GOLD[4]); box(c, 415, 175, 2, 2, GOLD[5]);
  // Plinth, urn and decorative relief remain behind the player's repair stand.
  oval(c, 418, 260, 34, 5, '#171e30');
  box(c, 399, 242, 38, 19, '#8c7c80'); box(c, 395, 238, 46, 4, '#d5c3a4'); box(c, 396, 259, 44, 4, '#c5b194');
  box(c, 403, 245, 30, 12, '#454051');
  for (let i = 0; i < 3; i++) ring(c, 411 + i * 7, 251, 5, 5, GOLD[2]);
  box(c, 412, 221, 12, 16, GOLD[1]); box(c, 409, 233, 18, 3, GOLD[3]);
  poly(c, [[403, 215], [433, 215], [429, 225], [423, 228], [412, 228], [406, 225]], GOLD[2]);
  line(c, 403, 215, 433, 215, GOLD[4]); box(c, 415, 217, 4, 9, GOLD[3]);
  statue(c, 368, 151, -1); statue(c, 468, 151, 1);
}
function torch(c: Ctx, x: number, y: number) {
  oval(c, x, y + 23, 16, 3, '#232637');
  box(c, x - 3, y + 6, 6, 15, GOLD[1]); box(c, x - 1, y + 6, 2, 15, GOLD[3]);
  box(c, x - 9, y + 20, 18, 3, GOLD[2]); box(c, x - 11, y + 23, 22, 2, GOLD[3]);
  poly(c, [[x - 12, y], [x + 12, y], [x + 7, y + 8], [x - 6, y + 8]], GOLD[1]);
  line(c, x - 12, y, x + 12, y, GOLD[4]); box(c, x - 5, y + 2, 8, 2, GOLD[2]);
}
function architecture(c: Ctx) {
  masonry(c);
  nightWindow(c, 57, -16, 101, 154, false);
  nightWindow(c, 681, -16, 104, 154, false);
  nightWindow(c, 355, -20, 126, 123, true);
  sanctuary(c);
  for (const [x, y, w, h, f] of [[171, 88, 13, 143, 0], [327, 87, 12, 138, 1], [498, 85, 12, 141, 0], [654, 85, 13, 140, 1]]) banner(c, x, y, w, h, !!f);
  // Middle arcade columns separate each painting from the sanctuary.
  for (const [x, top, bottom, w, left] of [[150, 15, 278, 26, 1], [344, 12, 271, 23, 0], [492, 12, 271, 23, 1], [680, 15, 278, 26, 0]]) column(c, x, top, bottom, w, !!left);
  // Upper arch bands, built from stepped wedges, keep the vault legible.
  for (const [cx, radius] of [[246, 100], [418, 83], [586, 99]]) {
    for (let i = 0; i <= 62; i++) {
      const a = Math.PI + i / 62 * Math.PI;
      const x = cx + Math.cos(a) * radius, y = 103 + Math.sin(a) * radius;
      box(c, x, y, 4, 5, STONE[i % 7 ? 3 : 4]);
      box(c, cx + Math.cos(a) * (radius + 6), 103 + Math.sin(a) * (radius + 6), 4, 4, STONE[1]);
      if (i % 5 === 0) line(c, x, y, cx + Math.cos(a) * (radius + 10), 103 + Math.sin(a) * (radius + 10), '#292d40');
    }
  }
  for (const [x, y, len, side] of [[163, 0, 90, 1], [339, -12, 70, -1], [478, -15, 95, 1], [666, -10, 80, -1], [37, 20, 152, 1], [792, 15, 165, -1]]) swag(c, x, y, len, side);
  for (const [x, y] of [[174, 225], [325, 244], [510, 244], [663, 225], [418, 218]]) torch(c, x, y);
}
function frontArchitecture(c: Ctx) {
  // Near piers are genuinely in front of the visitor, not painted into the rear.
  column(c, 24, -10, 428, 45, true); column(c, 810, -10, 428, 45, false);
  box(c, 0, 421, 58, 10, '#b6a38b'); box(c, 0, 431, 64, 12, '#6e6373'); box(c, 0, 443, 73, 9, '#c9b697');
  box(c, 777, 421, 59, 10, '#b6a38b'); box(c, 770, 431, 66, 12, '#6e6373'); box(c, 761, 443, 75, 9, '#c9b697');
  swag(c, 12, 0, 208, 1); swag(c, 826, 10, 215, -1);
}
function architecturalLighting(c: Ctx) {
  // Finite, static light planes preserve the underlying pixel clusters. No blur,
  // gradient or full-scene colour wash is involved.
  for (const [x, y] of [[174, 225], [325, 244], [510, 244], [663, 225]]) {
    poly(c, [[x - 14, y - 5], [x - 10, y - 25], [x, y - 36], [x + 10, y - 24], [x + 15, y - 4], [x + 9, y + 17], [x - 8, y + 17]], '#e3a55b12');
    poly(c, [[x - 8, y - 3], [x - 5, y - 18], [x, y - 25], [x + 6, y - 17], [x + 9, y], [x + 4, y + 10], [x - 5, y + 10]], '#ffc77918');
  }
  for (const [faceX, y, dir] of [[157, 225, 1], [335, 244, -1], [500, 244, 1], [670, 225, -1]]) {
    poly(c, [[faceX, y - 29], [faceX + dir * 5, y - 16], [faceX + dir * 5, 257], [faceX, 262]], '#ab9083');
    box(c, faceX, y - 16, 2, 32, '#c8aa8f');
    box(c, faceX + dir * 2, y - 9, 1, 19, '#e7c89c');
    line(c, faceX - 2, 258, faceX + 4, 257, '#756473');
    line(c, faceX - 2, 259, faceX + 4, 258, '#d8b793');
  }
  // Warm catches sit on the actual capital/base edges beside each brazier.
  for (const [x, bottom] of [[150, 278], [344, 271], [492, 271], [680, 278]]) {
    box(c, x - 11, bottom - 7, 20, 1, '#d7b78f');
    box(c, x - 14, bottom - 1, 25, 1, '#e4c79a');
    box(c, x - 12, bottom + 4, 22, 1, '#877263');
  }
  for (const [x, y, direction] of [[188, 218, 1], [322, 241, -1], [512, 241, 1], [647, 218, -1]]) {
    line(c, x, y - 14, x, y + 18, '#f3cb79');
    box(c, x + direction, y - 2, 1, 13, '#ffe3a0');
    box(c, x + direction * 3, y + 10, 1, 5, '#d29d50');
  }
  // Moonlight catches the sill, central arch edge and attendant shoulders.
  box(c, 352, 102, 132, 1, '#9dbfc5');
  box(c, 365, 108, 104, 1, '#738f9e');
  for (let i = 0; i < 16; i++) {
    const a = Math.PI + i / 18 * Math.PI;
    box(c, 418 + Math.cos(a) * 52, 163 + Math.sin(a) * 52, 2, 1, '#a1b6ba');
  }
  box(c, 364, 149, 2, 9, '#c7d0c5'); box(c, 464, 149, 2, 9, '#b6c8c7');
  line(c, 362, 168, 359, 194, '#a4b8bc'); line(c, 463, 167, 467, 193, '#a4b8bc');
}
function makeCanvas() {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法生成像素回廊。');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** A state-selected exhibit; the caller alone owns the real saved completion flag. */
export function createPixelRepairDisplay(restored: boolean): HTMLCanvasElement {
  const source = document.createElement('canvas'); source.width = 72; source.height = 76;
  const c = source.getContext('2d')!; c.imageSmoothingEnabled = false;
  oval(c, 36, 72, 34, 3, '#111b2a99');
  for (const x of [10, 58]) {
    box(c, x, 48, 4, 24, restored ? GOLD[2] : '#514853');
    box(c, x + 1, 49, 1, 21, restored ? GOLD[4] : '#8b7880');
    box(c, x - 4, 71, 12, 2, GOLD[1]); box(c, x - 3, 70, 10, 1, GOLD[3]);
  }
  box(c, 0, 0, 72, 62, '#151c2b'); box(c, 2, 2, 68, 57, restored ? GOLD[2] : '#6d5c51');
  box(c, 4, 4, 64, 53, restored ? GOLD[4] : '#8a7760'); box(c, 6, 6, 60, 49, GOLD[1]);
  box(c, 8, 8, 56, 45, '#173544');
  if (restored) {
    // A miniature harbor mosaic: tesserae, sail and sun visibly replace the cloth.
    for (let y = 9; y < 52; y += 3) for (let x = 9; x < 63; x += 3) {
      const sea = y > 33;
      box(c, x, y, 2, 2, (sea ? ['#2f6671', '#3a8790', '#28616d', '#4b9090'] : ['#314c6a', '#395674', '#4b6a7d', '#28415c'])[hash(x, y) % 4]);
    }
    oval(c, 49, 19, 5, 5, GOLD[4]); box(c, 48, 16, 3, 3, GOLD[5]);
    poly(c, [[23, 37], [48, 37], [43, 43], [28, 43]], GOLD[2]);
    line(c, 35, 15, 35, 38, GOLD[4]); poly(c, [[33, 18], [23, 34], [33, 34]], '#ddd0aa');
    poly(c, [[37, 17], [48, 34], [37, 34]], '#a9c2ba');
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
      const x = 36 + side * (23 - Math.sin(i / 6 * Math.PI) * 3), y = 45 - i * 5;
      line(c, x, y, x + side * 3, y - 4, GOLD[3], 2);
    }
    for (const [x, y] of [[3, 3], [66, 3], [3, 54], [66, 54]]) box(c, x, y, 3, 3, GOLD[5]);
  } else {
    poly(c, [[6, 3], [66, 4], [64, 60], [57, 58], [49, 62], [35, 57], [25, 61], [9, 58]], '#686378');
    for (const [x, w] of [[10, 5], [28, 6], [48, 5], [60, 3]]) box(c, x, 5, w, 51, '#807489');
    line(c, 16, 7, 20, 53, '#494858', 2); line(c, 44, 9, 40, 53, '#494858', 2);
    box(c, 24, 27, 18, 13, '#9c8774'); box(c, 26, 29, 14, 9, '#726272');
    for (let i = 0; i < 5; i++) { box(c, 24 + i * 4, 26, 1, 3, '#c8b294'); box(c, 24 + i * 4, 39, 1, 3, '#c8b294'); }
    box(c, 5, 3, 62, 2, '#b49a77');
  }
  const result = document.createElement('canvas'); result.width = 144; result.height = 152;
  const out = result.getContext('2d')!; out.imageSmoothingEnabled = false; out.drawImage(source, 0, 0, 144, 152);
  source.width = source.height = 1;
  return result;
}

export interface GalleryPixelRenderer {
  readonly sourceSize: readonly [number, number];
  drawBackground(ctx: Ctx, clock: number, reducedMotion: boolean): void;
  drawForeground(ctx: Ctx): void;
  dispose(): void;
}

/** Pure room renderer: two static caches, no RAF, events, inventory or actions. */
export function createGalleryPixelRenderer(): GalleryPixelRenderer {
  const back = makeCanvas(), front = makeCanvas();
  box(back.ctx, 0, 0, W, H, '#101c35');
  drawPixelFloor(back.ctx);
  architecture(back.ctx);
  drawPixelPaintings(back.ctx);
  drawPixelDecorBack(back.ctx);
  architecturalLighting(back.ctx);
  frontArchitecture(front.ctx);
  drawPixelDecorFront(front.ctx);
  let disposed = false;
  return {
    sourceSize: [W, H],
    drawBackground(ctx, clock, reducedMotion) {
      if (disposed) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(back.canvas, 0, 0, WORLD_W, WORLD_H);
      ctx.save(); ctx.scale(WORLD_W / W, WORLD_H / H);
      // Only a few integer clusters animate; room structure is never regenerated.
      const phase = reducedMotion ? 0 : Math.floor(clock * 7);
      for (const [i, [x, y]] of [[174, 225], [325, 244], [510, 244], [663, 225], [418, 218], [720, 147], [777, 275], [151, 253]].entries()) {
        const flicker = hash(i, phase) % 3;
        box(ctx, x - 2, y - 7 - flicker, 4, 7 + flicker, '#b35b36');
        box(ctx, x - 1, y - 6, 3, 5, '#e4a44d');
        box(ctx, x, y - 4 - flicker, 1, 5 + flicker, '#ffe7a0');
        box(ctx, x - 3, y + 1, 6, 1, '#e4a44d');
      }
      for (const [i, [x, y]] of [[69, 304], [115, 311], [145, 304]].entries()) {
        const drift = reducedMotion ? 0 : Math.floor(clock * 3 + i * 2) % 5;
        box(ctx, x + drift, y, 5 + i % 3 * 2, 1, i % 2 ? '#7bbab7' : '#bed1bd');
      }
      const angle = reducedMotion ? .5 : clock * .13;
      const sx = 418 + Math.cos(angle) * 34, sy = 178 + Math.sin(angle) * 12;
      box(ctx, sx - 1, sy - 1, 3, 3, GOLD[3]); box(ctx, sx, sy - 1, 1, 1, GOLD[5]);
      for (let i = 0; i < 9; i++) {
        const x = 352 + (i * 43) % 132, y = 92 + (i * 47 + (reducedMotion ? 0 : Math.floor(clock * (1 + i % 2)))) % 146;
        if (reducedMotion || Math.sin(clock * .7 + i * 2) > .35) box(ctx, x, y, 1, 1, i % 2 ? '#b7ac84' : '#738d9b');
      }
      ctx.restore();
    },
    drawForeground(ctx) {
      if (!disposed) ctx.drawImage(front.canvas, 0, 0, WORLD_W, WORLD_H);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      back.canvas.width = back.canvas.height = front.canvas.width = front.canvas.height = 1;
    },
  };
}
