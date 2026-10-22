import { drawPixelPaintings } from './gallery-pixel-paintings';
import { drawPixelDecorBack, drawPixelDecorFront } from './gallery-pixel-decor';
import { drawPixelFloor } from './gallery-pixel-floor';

/** All dimensions below are source pixels; the walkable room is drawn at exactly twice that size. */
const W = 1254;
const H = 471;
const WORLD_W = W * 2;
const WORLD_H = H * 2;
/** The size of the hall the visitor walks through, in world units. */
export const GALLERY_WORLD = { width: WORLD_W, height: WORLD_H } as const;
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
    for (let col = -1; col * 49 < W; col++) {
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
/** The nave's deep recess. Its fluted conch radiates from the painting so every line leads to it. */
const APSE = { x: 462, y: -2, w: 330, h: 272 };
function apse(c: Ctx) {
  const { x, y, w, h } = APSE;
  arch(c, x - 5, y - 4, w + 10, h + 4, '#262b40');
  arch(c, x, y, w, h, '#8d8290');
  arch(c, x + 4, y + 4, w - 8, h - 4, '#3b3a4f');
  // Scanline spans of alternating flutes, centred on the painting's crest.
  const inner = { x: x + 9, y: y + 9, w: w - 18, h: h - 9 };
  const rx = inner.w / 2, crown = inner.y + rx, cx = inner.x + rx, cy = 150;
  for (let row = Math.max(0, inner.y); row < inner.y + inner.h; row++) {
    const half = row < crown ? Math.floor(rx * Math.sqrt(Math.max(0, 1 - ((row - crown) / rx) ** 2))) : rx;
    let start = Math.ceil(cx - half), band = -1;
    for (let col = start; col <= cx + half; col++) {
      const angle = Math.atan2(row - cy, col - cx);
      const next = row > cy + 70 ? 2 : Math.floor((angle + Math.PI) / (Math.PI / 14)) % 2;
      if (next !== band) {
        if (band >= 0) box(c, start, row, col - start, 1, ['#1c2238', '#242a43', '#2a2236'][band]);
        start = col; band = next;
      }
    }
    box(c, start, row, cx + half - start + 1, 1, ['#1c2238', '#242a43', '#2a2236'][band]);
  }
  // Voussoirs and a carved rim keep the vault's thickness legible.
  for (let i = 0; i <= 26; i++) {
    const a = Math.PI + i / 26 * Math.PI;
    const ox = x + w / 2, oy = y + w / 2;
    line(c, ox + Math.cos(a) * (w / 2 - 9), oy + Math.sin(a) * (w / 2 - 9), ox + Math.cos(a) * (w / 2 + 1), oy + Math.sin(a) * (w / 2 + 1), '#454352');
    box(c, ox + Math.cos(a) * (w / 2 - 3), oy + Math.sin(a) * (w / 2 - 3), 2, 1, '#d1baa1');
  }
  for (const side of [x + 4, x + w - 8]) {
    box(c, side, y + w / 2, 4, h - w / 2 - 4, '#a59794');
    box(c, side + (side < x + w / 2 ? 0 : 3), y + w / 2, 1, h - w / 2 - 4, '#d5c5aa');
  }
  // Crimson curtains are tied back on both sides, opening the stage.
  for (const dir of [-1, 1]) {
    const edge = dir < 0 ? inner.x + 2 : inner.x + inner.w - 2;
    const drape: number[][] = [[edge, 40], [edge - dir * 34, 44], [edge - dir * 21, 120], [edge - dir * 10, 168], [edge - dir * 16, 214], [edge - dir * 22, 262], [edge, 262]];
    poly(c, drape, '#4d1a2c');
    poly(c, [[edge, 44], [edge - dir * 26, 46], [edge - dir * 15, 122], [edge - dir * 6, 166], [edge, 168]], '#7a2438');
    for (let i = 0; i < 4; i++) line(c, edge - dir * (6 + i * 6), 48, edge - dir * (3 + i * 2), 160, i % 2 ? '#9a3346' : '#5f1d31');
    box(c, Math.min(edge, edge - dir * 18), 164, 18, 4, GOLD[2]);
    box(c, Math.min(edge, edge - dir * 18), 164, 18, 1, GOLD[4]);
    line(c, edge - dir * 9, 168, edge - dir * 11, 182, GOLD[3], 2);
    box(c, edge - dir * 11 - 2, 182, 5, 4, GOLD[2]);
    box(c, Math.min(edge, edge - dir * 40) - 2, 36, 44, 5, '#3d2034');
    box(c, Math.min(edge, edge - dir * 40) - 2, 36, 44, 1, GOLD[3]);
  }
}
/** A standing bronze fire basket; its flame is animated separately. */
function brazier(c: Ctx, x: number, base: number) {
  oval(c, x, base + 1, 15, 3, '#1a1d2c');
  line(c, x - 10, base, x - 3, base - 30, GOLD[1], 2);
  line(c, x + 10, base, x + 3, base - 30, GOLD[1], 2);
  line(c, x - 9, base - 1, x - 3, base - 28, GOLD[3]);
  box(c, x - 1, base - 30, 3, 30, GOLD[2]); box(c, x, base - 30, 1, 30, GOLD[4]);
  box(c, x - 13, base - 1, 7, 2, GOLD[2]); box(c, x + 7, base - 1, 7, 2, GOLD[2]);
  box(c, x - 5, base - 34, 11, 4, GOLD[3]); box(c, x - 5, base - 34, 11, 1, GOLD[5]);
  poly(c, [[x - 16, base - 48], [x + 16, base - 48], [x + 11, base - 36], [x - 10, base - 36]], GOLD[1]);
  box(c, x - 14, base - 46, 28, 3, GOLD[2]); box(c, x - 12, base - 43, 23, 2, GOLD[3]);
  line(c, x - 16, base - 48, x + 16, base - 48, GOLD[4]);
  for (let i = -12; i <= 10; i += 6) box(c, x + i, base - 46, 2, 2, GOLD[5]);
  box(c, x - 12, base - 51, 24, 3, '#3a1c1c'); box(c, x - 9, base - 52, 6, 2, '#a3382c'); box(c, x + 2, base - 52, 7, 2, '#c4532f');
}
function torch(c: Ctx, x: number, y: number) {
  oval(c, x, y + 23, 16, 3, '#232637');
  box(c, x - 3, y + 6, 6, 15, GOLD[1]); box(c, x - 1, y + 6, 2, 15, GOLD[3]);
  box(c, x - 9, y + 20, 18, 3, GOLD[2]); box(c, x - 11, y + 23, 22, 2, GOLD[3]);
  poly(c, [[x - 12, y], [x + 12, y], [x + 7, y + 8], [x - 6, y + 8]], GOLD[1]);
  line(c, x - 12, y, x + 12, y, GOLD[4]); box(c, x - 5, y + 2, 8, 2, GOLD[2]);
}
/** Wall sconces flank the side exhibits; the two braziers stand on the nave's top stair. */
const TORCHES = [[186, 228], [384, 228], [887, 236], [1051, 236]] as const;
const BRAZIERS = [[456, 284], [798, 284]] as const;
/** Column centres: they divide the wings, the two side halls and the nave. */
const COLUMNS = [150, 420, 834, 1104] as const;
function architecture(c: Ctx) {
  masonry(c);
  // Both wings and the left hall open onto the night garden, so the room reads as part of a larger place.
  nightWindow(c, 57, -16, 101, 154, false);
  nightWindow(c, 1099, -16, 104, 154, false);
  nightWindow(c, 205, -18, 160, 206, true);
  apse(c);
  for (const [x, y, w, h, f] of [[439, 58, 12, 164, 0], [803, 58, 12, 164, 1], [881, 85, 13, 143, 0], [1045, 85, 13, 143, 1]]) banner(c, x, y, w, h, !!f);
  for (const [i, x] of COLUMNS.entries()) column(c, x, 12, 278, 26, i % 2 === 0);
  // Tall vault bands run off the top of the view: the ceiling continues above the visitor.
  for (const [cx, rx, ry] of [[285, 135, 100], [627, 207, 108], [969, 135, 100]]) {
    const steps = Math.round(rx * .6);
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI + i / steps * Math.PI;
      const x = cx + Math.cos(a) * rx, y = 103 + Math.sin(a) * ry;
      box(c, x, y, 4, 5, STONE[i % 7 ? 3 : 4]);
      box(c, cx + Math.cos(a) * (rx + 6), 103 + Math.sin(a) * (ry + 6), 4, 4, STONE[1]);
      if (i % 5 === 0) line(c, x, y, cx + Math.cos(a) * (rx + 10), 103 + Math.sin(a) * (ry + 10), '#292d40');
    }
  }
  for (const [x, y, len, side] of [[163, 0, 90, 1], [407, -12, 74, -1], [847, -12, 74, 1], [1091, -10, 90, -1], [37, 20, 152, 1], [1210, 15, 165, -1]]) swag(c, x, y, len, side);
  for (const [x, y] of TORCHES) torch(c, x, y);
  for (const [x, base] of BRAZIERS) brazier(c, x, base);
}
/** Drawn under the main painting so only its surround catches the warm red light. */
function portalGlow(c: Ctx) {
  arch(c, 492, 18, 270, 254, '#c8404812');
  arch(c, 504, 28, 246, 240, '#ff6a5412');
}
function frontArchitecture(c: Ctx) {
  // Near piers are genuinely in front of the visitor, not painted into the rear.
  column(c, 24, -10, 428, 45, true); column(c, W - 24, -10, 428, 45, false);
  box(c, 0, 421, 58, 10, '#b6a38b'); box(c, 0, 431, 64, 12, '#6e6373'); box(c, 0, 443, 73, 9, '#c9b697');
  box(c, W - 59, 421, 59, 10, '#b6a38b'); box(c, W - 66, 431, 66, 12, '#6e6373'); box(c, W - 75, 443, 75, 9, '#c9b697');
  swag(c, 12, 0, 208, 1); swag(c, W - 10, 10, 215, -1);
}
function architecturalLighting(c: Ctx) {
  // Finite, static light planes preserve the underlying pixel clusters. No blur,
  // gradient or full-scene colour wash is involved.
  for (const [x, y] of TORCHES) {
    poly(c, [[x - 14, y - 5], [x - 10, y - 25], [x, y - 36], [x + 10, y - 24], [x + 15, y - 4], [x + 9, y + 17], [x - 8, y + 17]], '#e3a55b12');
    poly(c, [[x - 8, y - 3], [x - 5, y - 18], [x, y - 25], [x + 6, y - 17], [x + 9, y], [x + 4, y + 10], [x - 5, y + 10]], '#ffc77918');
  }
  for (const [x, base] of BRAZIERS) {
    const y = base - 52;
    poly(c, [[x - 24, y + 4], [x - 17, y - 26], [x, y - 44], [x + 17, y - 26], [x + 24, y + 4], [x + 14, y + 30], [x - 14, y + 30]], '#e3a55b12');
    poly(c, [[x - 13, y + 2], [x - 9, y - 20], [x, y - 30], [x + 9, y - 20], [x + 13, y + 2], [x + 7, y + 16], [x - 7, y + 16]], '#ffc77918');
  }
  // Each column face turned towards a flame is lit, along with its base mouldings.
  for (const [faceX, y, dir] of [[157, 228, 1], [413, 228, -1], [427, 232, 1], [827, 232, -1], [841, 236, 1], [1097, 236, -1]]) {
    poly(c, [[faceX, y - 29], [faceX + dir * 5, y - 16], [faceX + dir * 5, 257], [faceX, 262]], '#ab9083');
    box(c, faceX, y - 16, 2, 32, '#c8aa8f');
    box(c, faceX + dir * 2, y - 9, 1, 19, '#e7c89c');
    line(c, faceX - 2, 258, faceX + 4, 257, '#756473');
    line(c, faceX - 2, 259, faceX + 4, 258, '#d8b793');
  }
  for (const x of COLUMNS) {
    box(c, x - 11, 271, 20, 1, '#d7b78f');
    box(c, x - 14, 277, 25, 1, '#e4c79a');
    box(c, x - 12, 282, 22, 1, '#877263');
  }
  // Flame light catches the nearest gilt edges of each frame.
  for (const [x, y, direction] of [[902, 222, 1], [1035, 222, -1], [521, 226, 1], [733, 226, -1]]) {
    line(c, x, y - 14, x, y + 18, '#f3cb79');
    box(c, x + direction, y - 2, 1, 13, '#ffe3a0');
    box(c, x + direction * 3, y + 10, 1, 5, '#d29d50');
  }
  // Moonlight from the tall window catches its sill and the stone below it.
  box(c, 199, 191, 172, 1, '#9dbfc5');
  box(c, 205, 196, 160, 1, '#738f9e');
  // The painting's red light spills down the stair it stands on.
  poly(c, [[548, 266], [706, 266], [736, 312], [518, 312]], '#ff604012');
  poly(c, [[576, 266], [678, 266], [694, 312], [560, 312]], '#ff7a5a12');
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
  portalGlow(back.ctx);
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
      for (const [i, [x, y]] of [...TORCHES, [1138, 147], [1195, 275], [151, 253]].entries()) {
        const flicker = hash(i, phase) % 3;
        box(ctx, x - 2, y - 7 - flicker, 4, 7 + flicker, '#b35b36');
        box(ctx, x - 1, y - 6, 3, 5, '#e4a44d');
        box(ctx, x, y - 4 - flicker, 1, 5 + flicker, '#ffe7a0');
        box(ctx, x - 3, y + 1, 6, 1, '#e4a44d');
      }
      for (const [i, [x, base]] of BRAZIERS.entries()) {
        const y = base - 51, flicker = hash(i + 9, phase) % 4, sway = hash(i + 3, phase) % 3 - 1;
        box(ctx, x - 10, y - 9, 20, 9, '#b35b36');
        box(ctx, x - 7 + sway, y - 17 - flicker, 14, 10 + flicker, '#b35b36');
        box(ctx, x - 3 + sway, y - 24 - flicker, 6, 8, '#b35b36');
        box(ctx, x - 7, y - 8, 14, 8, '#e4a44d');
        box(ctx, x - 4 + sway, y - 15 - flicker, 8, 8 + flicker, '#e4a44d');
        box(ctx, x - 2, y - 8, 4, 7, '#ffe7a0');
        box(ctx, x - 1 + sway, y - 13 - flicker, 2, 6, '#ffe7a0');
      }
      for (const [i, [x, y]] of [[69, 304], [115, 311], [145, 304]].entries()) {
        const drift = reducedMotion ? 0 : Math.floor(clock * 3 + i * 2) % 5;
        box(ctx, x + drift, y, 5 + i % 3 * 2, 1, i % 2 ? '#7bbab7' : '#bed1bd');
      }
      // Embers rise out of the main painting and drift up the recess around it.
      const time = reducedMotion ? 0 : clock;
      for (let i = 0; i < 18; i++) {
        const inside = i < 11;
        const x = inside ? 548 + (i * 53) % 158 : 486 + (i * 71) % 282;
        const y = 256 - (time * (5 + i % 4 * 3) + i * 37) % (inside ? 186 : 220);
        if (inside && y < 147 && Math.abs(x - 627) > 95 * Math.sqrt(Math.max(0, 1 - ((y - 147) / 95) ** 2)) - 4) continue;
        if (!inside && x > 512 && x < 742) continue;
        box(ctx, x, y, i % 3 ? 1 : 2, 1, ['#ffb070', '#ff6a54', '#ffe6a2'][i % 3]);
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
