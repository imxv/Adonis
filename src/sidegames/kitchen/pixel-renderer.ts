import { Grid } from '../../pixel/draw';
import { ADONIS_A, ADONIS_B } from '../../pixel/sprites';
import { KITCHEN_STATIONS, KITCHEN_WORLD } from './pixel-contract';
import type { KitchenPixelRenderer, KitchenSceneState, KitchenTargetId } from './pixel-contract';

type Ctx = CanvasRenderingContext2D;
const W = KITCHEN_WORLD.width / 2, H = KITCHEN_WORLD.height / 2;
const STONE = ['#777e72', '#a6a58a', '#c6bea0', '#ded1aa', '#f4e5bd'];
const WOOD = ['#4d483a', '#74604a', '#a07e52', '#c39b62', '#e0bc7b'];
const COPPER = ['#593f35', '#8e593c', '#bc7d49', '#dfa868', '#f3d091'];
const GREEN = ['#234b3c', '#3f6c47', '#62874e', '#91aa66'];
const SOUP = {
  'olive-skewer': { dark: '#727b43', mid: '#a6ac61', bright: '#d9d18a', garnish: '#46633e' },
  'laurel-broth': { dark: '#796632', mid: '#b49b4f', bright: '#ead391', garnish: '#78934d' },
  'iris-stew': { dark: '#67658e', mid: '#9299ba', bright: '#ced2df', garnish: '#6878a5' },
} as const;

class Pixels {
  constructor(readonly c: Ctx) {}
  rect(x: number, y: number, w: number, h: number, color: string) {
    this.c.fillStyle = color; this.c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }
  line(x0: number, y0: number, x1: number, y1: number, color: string, width = 1) {
    const count = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1));
    for (let i = 0; i <= count; i++) this.rect(x0 + (x1 - x0) * i / count, y0 + (y1 - y0) * i / count, width, width, color);
  }
  oval(x: number, y: number, rx: number, ry: number, color: string) {
    for (let row = -Math.ceil(ry); row <= ry; row++) {
      const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (row / ry) ** 2)));
      this.rect(x - half, y + row, half * 2 + 1, 1, color);
    }
  }
  ring(x: number, y: number, rx: number, ry: number, color: string) {
    const n = Math.ceil(Math.max(rx, ry) * 8);
    for (let i = 0; i <= n; i++) this.rect(x + Math.cos(i / n * Math.PI * 2) * rx, y + Math.sin(i / n * Math.PI * 2) * ry, 1, 1, color);
  }
  poly(points: readonly (readonly number[])[], color: string) {
    const y0 = Math.ceil(Math.min(...points.map(p => p[1]))), y1 = Math.floor(Math.max(...points.map(p => p[1])));
    for (let y = y0; y <= y1; y++) {
      const xs: number[] = [];
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[j], b = points[i];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) this.rect(Math.ceil(xs[i]), y, Math.floor(xs[i + 1]) - Math.ceil(xs[i]) + 1, 1, color);
    }
  }
}
function hash(x: number, y: number) {
  let h = Math.imul(x + 197, 1597334677) ^ Math.imul(y + 641, 3812015801);
  h = Math.imul(h ^ h >>> 16, 2246822507); return (h ^ h >>> 13) >>> 0;
}
function station(id: KitchenTargetId) {
  const s = KITCHEN_STATIONS.find(value => value.id === id)!;
  return { x: s.x / 2, y: s.y / 2, w: s.width / 2, h: s.height / 2, cx: (s.x + s.width / 2) / 2 };
}
function surface() {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法绘制像素厨房。');
  ctx.imageSmoothingEnabled = false; return { canvas, ctx };
}
function leafCluster(p: Pixels, x: number, y: number, rx: number, ry: number, flowers = false) {
  p.oval(x + 1, y + 2, rx + 1, ry, GREEN[0]);
  for (let i = 0; i < 7; i++) {
    const a = i * 2.399, xx = x + Math.cos(a) * rx * .5, yy = y + Math.sin(a) * ry * .5;
    p.oval(xx, yy, 3 + i % 3, 2 + i % 2, GREEN[i % 3 + 1]);
    p.rect(xx - 2, yy - 2, 3, 1, GREEN[3]);
    if (flowers && i % 3 === 0) { p.rect(xx, yy - 3, 3, 2, '#c77969'); p.rect(xx + 1, yy - 4, 1, 1, '#edc68d'); }
  }
}
function pot(p: Pixels, x: number, y: number, width: number, height: number, color = '#b97e55') {
  p.oval(x + 2, y + height + 1, width + 2, 2, '#48544750');
  p.poly([[x - width, y], [x + width, y], [x + width - 2, y + height - 2], [x + width - 5, y + height], [x - width + 5, y + height], [x - width + 2, y + height - 2]], color);
  p.rect(x - width + 3, y + 3, 2, Math.max(2, height - 5), '#d7a474');
  p.line(x + width - 2, y + 2, x + width - 4, y + height - 2, '#815e46', 2);
  p.oval(x, y, width + 1, 3, '#d8ab7a'); p.oval(x, y, width - 2, 2, '#69503d');
}
function archWindow(c: Ctx) {
  const p = new Pixels(c), x = 174, y = 9, width = 132, height = 86, rx = width / 2;
  for (let row = 0; row < height + 8; row++) {
    const half = row < rx ? Math.floor(rx * Math.sqrt(Math.max(0, 1 - ((row - rx) / rx) ** 2))) : rx;
    p.rect(x + rx - half - 5, y + row - 4, half * 2 + 11, 1, STONE[0]);
    p.rect(x + rx - half - 3, y + row - 2, half * 2 + 7, 1, STONE[3]);
  }
  const sky = surface(), a = new Pixels(sky.ctx);
  a.rect(0, 0, width, height, '#9cc6cb'); a.rect(0, 39, width, 25, '#b1d4d1');
  a.poly([[0, 58], [23, 36], [37, 49], [59, 29], [78, 53], [95, 42], [width, 61], [width, 75], [0, 75]], '#77a4af');
  a.line(42, 44, 59, 29, '#c4d4cb'); a.line(59, 29, 70, 45, '#adc5c3');
  a.rect(0, 64, width, 22, '#4b909b');
  for (let row = 68; row < height; row += 4) for (let i = 0; i < 8; i++) {
    const sx = hash(i, row) % width;
    a.rect(sx, row, 3 + hash(row, i) % 11, 1, i % 3 ? '#8cbdba' : '#d1dbbf');
  }
  a.poly([[87, 65], [98, 56], [119, 59], [132, 66], [132, 73], [91, 70]], '#b6bda3');
  a.rect(104, 48, 18, 12, '#f0e4bd'); a.rect(110, 44, 7, 4, '#ecdfb6'); a.oval(113, 44, 4, 2, '#709ba3');
  a.rect(108, 53, 3, 7, '#71969b'); a.rect(117, 52, 3, 8, '#71969b');
  a.line(32, 66, 32, 78, '#647c76'); a.poly([[30, 66], [22, 75], [30, 75]], '#f5e5bb'); a.poly([[34, 67], [40, 75], [34, 75]], '#d5d7bb'); a.line(24, 78, 40, 78, '#e2d3a9');
  for (let row = 0; row < height; row++) {
    const half = row < rx ? Math.floor((rx - 2) * Math.sqrt(Math.max(0, 1 - ((row - rx) / rx) ** 2))) : rx - 2;
    const left = Math.ceil(rx - half), span = Math.floor(half * 2);
    if (span > 0) c.drawImage(sky.canvas, left, row, span, 1, x + left, y + row, span, 1);
  }
  for (let i = 0; i <= 12; i++) {
    const angle = Math.PI + i / 12 * Math.PI;
    p.line(x + rx + Math.cos(angle) * (rx + 1), y + rx + Math.sin(angle) * (rx + 1), x + rx + Math.cos(angle) * (rx + 6), y + rx + Math.sin(angle) * (rx + 6), '#9a9f8d');
  }
  p.rect(x - 7, y + height + 1, width + 14, 3, STONE[4]); p.rect(x - 4, y + height + 4, width + 8, 3, STONE[1]);
  sky.canvas.width = sky.canvas.height = 1;
}
function drawRoom(c: Ctx) {
  const p = new Pixels(c);
  p.rect(0, 0, W, H, '#d7cbaa');
  for (let row = 0; row < 10; row++) for (let col = -1; col < 17; col++) {
    const x = col * 31 + row % 2 * 15, y = row * 17;
    p.rect(x, y, 29, 15, ['#d1c6a9', '#c7bda1', '#d8cdb0'][hash(col, row) % 3]);
    p.rect(x + 1, y + 1, 27, 1, '#e7dbb7'); p.rect(x + 28, y + 3, 1, 11, '#b6ad95');
    if (hash(row, col) % 7 === 0) p.line(x + 5, y + 7, x + 13, y + 10, '#bbb39c');
  }
  for (let y = 170; y < H; y += 15) for (let x = -17 + (Math.floor(y / 15) % 2) * 17; x < W; x += 35) {
    const tint = hash(x, y) % 4;
    p.rect(x, y, 34, 14, ['#bfb89e', '#c9c2a5', '#d5c8a6', '#c6bea4'][tint]);
    p.rect(x + 1, y + 1, 32, 1, '#e6d9b5'); p.rect(x + 33, y + 2, 1, 12, '#aaa88f'); p.rect(x + 2, y + 13, 31, 1, '#a8a58d');
    if (tint === 2) { p.line(x + 8, y + 8, x + 13, y + 10, '#bbb59c'); p.line(x + 13, y + 10, x + 22, y + 8, '#bbb59c'); }
  }
  p.rect(18, 165, W - 36, 6, '#8c947b'); p.rect(18, 164, W - 36, 2, '#eee0b6');
  for (let x = 21; x < W - 19; x += 14) {
    p.line(x, 158, x + 10, 158, '#8c947b'); p.line(x + 10, 158, x + 10, 163, '#8c947b'); p.line(x + 10, 163, x + 5, 163, '#8c947b'); p.line(x + 5, 163, x + 5, 160, '#8c947b');
  }
  archWindow(c);
  // Open timber beams and herb vines frame the room without hiding its floor.
  p.rect(0, 0, W, 9, '#796b50'); p.rect(0, 1, W, 3, '#b4a278'); p.rect(0, 8, W, 2, '#bca982');
  for (const x of [18, W - 25]) {
    p.rect(x, 8, 7, 155, '#9d9474'); p.rect(x, 9, 2, 153, '#ddd0a5'); p.rect(x + 5, 12, 2, 150, '#777b63');
    for (let y = 29; y < 150; y += 32) p.rect(x, y, 7, 1, '#c2b58c');
  }
  for (const side of [-1, 1]) for (let i = 0; i < 10; i++) {
    const x = side < 0 ? 31 + i * 13 : 449 - i * 13, y = 13 + Math.sin(i * .7) * 4;
    leafCluster(p, x, y, 10, 5, i % 5 === 0);
    if (i < 3) { p.line(x, y + 4, x + side * 3, y + 19, '#70814e'); leafCluster(p, x + side * 3, y + 17, 4, 3); }
  }
  // Shallow alcove on the right: copper pans, stacked plates and spice jars.
  p.rect(334, 87, 98, 66, '#a9a78c'); p.rect(337, 90, 92, 58, '#bdb799');
  p.rect(334, 86, 99, 3, STONE[4]); p.rect(339, 139, 89, 4, WOOD[2]); p.rect(337, 142, 93, 3, WOOD[0]);
  for (let i = 0; i < 4; i++) {
    const x = 347 + i * 22;
    p.rect(x, 96, 2, 10, COPPER[0]); p.ring(x + 1, 115, 8 - i % 2, 9, COPPER[0]);
    p.oval(x + 1, 115, 6 - i % 2, 7, COPPER[2]); p.oval(x - 1, 113, 3, 4, COPPER[3]); p.line(x + 3, 111, x + 4, 119, COPPER[1]);
  }
  for (let i = 0; i < 6; i++) {
    const x = 343 + i * 14;
    p.rect(x, 132 - i % 2 * 3, 7, 7 + i % 2 * 3, ['#64857a', '#9d7854', '#c0a66a'][i % 3]);
    p.rect(x + 1, 130 - i % 2 * 3, 5, 2, '#e1c799'); p.rect(x + 2, 134, 2, 3, '#d8d5ab');
  }
  // A warm circular floor inlay remains open for the moving character.
  p.oval(240, 251, 53, 24, '#a59d7d'); p.oval(240, 249, 52, 24, '#e0d2ad');
  p.ring(240, 249, 48, 21, '#9d9f7e'); p.oval(240, 249, 40, 17, '#c6c4a5'); p.ring(240, 249, 38, 15, '#a3ad8f');
  for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
    const x = 240 + side * (21 + Math.sin(i / 7 * Math.PI) * 15), y = 260 - i * 4;
    p.line(x, y + 2, x + side * 3, y - 2, '#728668'); p.poly([[x, y], [x + side * 5, y - 2], [x + side * 6, y + 1], [x + side, y + 2]], '#92a17a');
  }
  p.poly([[240, 237], [246, 249], [240, 261], [234, 249]], '#dfc887'); p.oval(240, 249, 3, 2, '#f4e5bb');
  // Nearby hearth light is a few static, discrete reflected planes.
  for (let i = 0; i < 4; i++) {
    p.rect(232 - i * 2, 176 + i * 7, 30 + i * 4, 2, ['#dbc08a', '#d5c396', '#d4c6a1', '#d8cdad'][i]);
    p.rect(241 - i, 179 + i * 7, 12 + i * 2, 1, '#ead8ad');
  }
}
function table(p: Pixels, x: number, y: number, w: number, h: number) {
  p.oval(x + w / 2 + 3, y + h + 2, w / 2 + 3, 4, '#4b584d52');
  for (const xx of [x + 5, x + w - 10]) { p.rect(xx, y + 13, 5, h - 14, WOOD[0]); p.rect(xx, y + 14, 2, h - 16, WOOD[2]); p.rect(xx - 2, y + h - 2, 9, 2, WOOD[1]); }
  p.rect(x + 7, y + h - 10, w - 15, 3, WOOD[1]); p.rect(x + 9, y + h - 10, w - 19, 1, WOOD[3]);
  p.rect(x, y + 5, w, 8, WOOD[1]); p.rect(x - 2, y + 2, w + 4, 6, WOOD[3]); p.rect(x, y, w, 3, '#d9c49a');
  p.rect(x + 1, y + 8, w - 2, 2, WOOD[0]);
  for (let xx = x + 10; xx < x + w - 7; xx += 16) p.rect(xx, y + 3, 1, 3, '#b79a6b');
}
function drawShelf(c: Ctx) {
  const p = new Pixels(c), { x, y, w, h } = station('shelf');
  p.oval(x + w / 2 + 3, y + h + 2, w / 2 + 4, 4, '#48574650');
  p.rect(x, y, w, h, WOOD[0]); p.rect(x + 4, y + 4, w - 8, h - 7, '#6c624b');
  for (const xx of [x + 2, x + w - 6]) { p.rect(xx, y + 1, 4, h - 1, WOOD[2]); p.rect(xx, y + 1, 1, h - 2, WOOD[4]); }
  for (const yy of [y + 3, y + 27, y + 51, y + h - 5]) {
    p.rect(x - 2, yy, w + 4, 4, WOOD[3]); p.rect(x, yy + 4, w, 2, WOOD[0]); p.rect(x + 2, yy, w - 4, 1, WOOD[4]);
  }
  // Three planted herb bunches above baskets and a clear fish tray.
  for (let i = 0; i < 3; i++) {
    const xx = x + 16 + i * 25;
    pot(p, xx, y + 18, 8, 7, ['#b77852', '#a58154', '#8a9b77'][i]);
    leafCluster(p, xx, y + 13, 8, 5, i === 2);
    p.rect(xx - 2, y + 21, 4, 2, '#e0c593');
  }
  for (let i = 0; i < 2; i++) {
    const xx = x + 10 + i * 36, yy = y + 39;
    p.poly([[xx, yy], [xx + 27, yy], [xx + 24, yy + 10], [xx + 3, yy + 10]], '#b3935e');
    p.line(xx, yy, xx + 27, yy, '#e0bf7c');
    for (let j = 3; j < 25; j += 4) { p.line(xx + j, yy + 2, xx + j + 1, yy + 8, '#79684a'); p.line(xx + 2, yy + 4 + j % 3, xx + 24, yy + 4 + j % 3, '#d1ad6c'); }
    if (i === 0) for (const [ox, oy] of [[7, -3], [15, -5], [22, -2]]) { p.oval(xx + ox, yy + oy, 4, 3, '#809354'); p.rect(xx + ox - 1, yy + oy - 2, 2, 1, '#b5bb75'); }
    else for (let j = 0; j < 4; j++) p.line(xx + 6 + j * 4, yy - 1, xx + 10 + j * 3, yy - 9, '#6c8c50', 2);
  }
  p.rect(x + 9, y + h - 21, w - 18, 12, '#b0b5a2'); p.rect(x + 10, y + h - 21, w - 20, 2, '#e2ddbd');
  for (let i = 0; i < 3; i++) {
    const xx = x + 21 + i * 19, yy = y + h - 15;
    p.oval(xx, yy, 7, 3, '#72999b'); p.rect(xx - 4, yy - 2, 7, 1, '#c7d3bf'); p.poly([[xx + 5, yy], [xx + 10, yy - 3], [xx + 10, yy + 3]], '#87abaa'); p.rect(xx - 5, yy - 1, 1, 1, '#2f514f');
  }
}
function drawStove(c: Ctx) {
  const p = new Pixels(c), { x, y, w, h, cx } = station('stove');
  p.oval(cx + 3, y + h + 2, w / 2 + 7, 5, '#6c665553');
  // Copper smoke hood and stepped chimney reveal depth above the stone hearth.
  p.rect(cx - 10, y - 45, 20, 26, COPPER[1]); p.rect(cx - 8, y - 44, 5, 24, COPPER[3]); p.rect(cx + 7, y - 43, 2, 23, COPPER[0]);
  p.poly([[cx - 10, y - 22], [cx + 10, y - 22], [cx + 34, y + 4], [cx - 34, y + 4]], COPPER[1]);
  p.poly([[cx - 9, y - 21], [cx - 1, y - 21], [cx - 6, y + 2], [cx - 31, y + 2]], COPPER[3]);
  p.poly([[cx + 5, y - 21], [cx + 9, y - 21], [cx + 30, y + 2], [cx + 17, y + 2]], COPPER[2]);
  p.rect(cx - 36, y + 3, 72, 4, COPPER[0]); p.rect(cx - 34, y + 3, 68, 1, COPPER[4]);
  p.rect(x + 4, y + 26, w - 8, h - 28, STONE[1]);
  for (let yy = y + 31; yy < y + h - 3; yy += 12) for (let xx = x + 6 + (Math.floor(yy / 12) % 2) * 6; xx < x + w - 7; xx += 20) {
    p.rect(xx, yy, 18, 10, STONE[2]); p.rect(xx + 1, yy, 16, 1, STONE[3]);
  }
  p.rect(x, y + 22, w, 5, STONE[0]); p.rect(x - 3, y + 18, w + 6, 5, STONE[4]); p.rect(x - 2, y + 23, w + 4, 2, '#b6ad8f');
  p.poly([[cx - 25, y + h - 4], [cx - 25, y + 43], [cx - 18, y + 36], [cx + 18, y + 36], [cx + 25, y + 43], [cx + 25, y + h - 4]], '#57483c');
  p.poly([[cx - 20, y + h - 5], [cx - 20, y + 44], [cx - 15, y + 40], [cx + 15, y + 40], [cx + 20, y + 44], [cx + 20, y + h - 5]], '#302f2c');
  p.rect(cx - 20, y + h - 7, 40, 3, '#a25132'); p.rect(cx - 17, y + h - 7, 34, 1, '#da8646');
  for (const ox of [-13, -3, 8]) { p.line(cx + ox, y + h - 5, cx + ox + 9, y + h - 11, '#4b3b2e', 3); p.line(cx + ox, y + h - 5, cx + ox + 8, y + h - 10, '#bd7840'); }
  p.rect(x - 3, y + h - 3, w + 6, 4, STONE[0]); p.rect(x - 2, y + h - 4, w + 4, 2, STONE[3]);
  // Kettle, salt pot and folded cloth surround the main cooking vessel.
  p.oval(x + 12, y + 15, 7, 6, COPPER[2]); p.oval(x + 10, y + 13, 3, 4, COPPER[3]); p.rect(x + 9, y + 8, 6, 2, COPPER[0]); p.ring(x + 12, y + 7, 6, 5, COPPER[0]);
  p.rect(x + w - 16, y + 13, 10, 7, '#b3bcad'); p.oval(x + w - 11, y + 13, 5, 2, '#d9ddbc'); p.rect(x + w - 14, y + 12, 6, 1, '#f1e5bf');
  p.rect(x + w - 31, y + 17, 12, 3, '#b4bda3'); p.rect(x + w - 30, y + 18, 2, 2, '#688d82');
}
function drawRecipes(c: Ctx) {
  const p = new Pixels(c), { x, y, w, h } = station('recipes');
  table(p, x, y + 6, w, h - 5);
  p.poly([[x + 20, y + 5], [x + 18, y - 4], [x + 37, y - 6], [x + 40, y - 3], [x + 44, y - 6], [x + 63, y - 3], [x + 62, y + 13], [x + 42, y + 10], [x + 39, y + 12], [x + 20, y + 13]], '#79684a');
  p.poly([[x + 21, y - 2], [x + 37, y - 4], [x + 40, y - 1], [x + 40, y + 9], [x + 21, y + 10]], '#f1dfb2');
  p.poly([[x + 42, y - 1], [x + 45, y - 4], [x + 61, y - 1], [x + 60, y + 10], [x + 42, y + 8]], '#dccb9d');
  p.line(x + 41, y - 1, x + 41, y + 10, '#a18b60');
  for (let i = 0; i < 4; i++) { p.line(x + 25, y + i * 3, x + 35, y + i * 3 - 1, '#ae9a6b'); p.line(x + 46, y + i * 3 - 1, x + 56, y + i * 3, '#ab9667'); }
  p.rect(x + 10, y + 4, 5, 8, '#466f65'); p.rect(x + 11, y + 3, 3, 2, '#b8c5a3');
  p.line(x + 12, y + 5, x + 14, y - 6, '#bfa875'); p.poly([[x + 14, y - 6], [x + 19, y - 10], [x + 17, y - 3]], '#e7ddba');
  p.oval(x + w - 10, y + 9, 4, 2, '#d2cdb1'); p.rect(x + w - 12, y + 2, 4, 7, '#b5a77a');
}
function drawBagTable(c: Ctx) {
  const p = new Pixels(c), { x, y, w, h } = station('bag');
  table(p, x, y + 10, w, h - 9);
  p.rect(x + 6, y + 12, w - 12, 9, '#8ca391'); p.rect(x + 8, y + 13, w - 16, 1, '#c5d3ae');
  for (let i = 0; i < 4; i++) p.rect(x + 9 + i * 16, y + 13, 1, 7, '#6a8a7d');
  p.rect(x + 8, y + h - 17, w - 16, 8, WOOD[2]); p.rect(x + 10, y + h - 16, w - 20, 1, WOOD[4]); p.rect(x + w / 2 - 2, y + h - 14, 4, 2, COPPER[3]);
  p.oval(x + 13, y + 5, 6, 4, '#c6b38e'); p.rect(x + 7, y + 5, 12, 8, '#d9c7a1'); p.oval(x + 13, y + 4, 6, 3, '#e9d8ae');
  p.line(x + 7, y + 8, x + 18, y + 8, '#a9a081');
  p.rect(x + w - 16, y + 2, 9, 12, '#9c9b78'); p.rect(x + w - 15, y + 3, 7, 9, '#d5cc9c');
  leafCluster(p, x + w - 12, y - 2, 6, 4);
}
function drawExit(c: Ctx) {
  const p = new Pixels(c), { x, y, w, h } = station('exit');
  p.rect(x - 7, y, w + 14, h, '#7a8474');
  for (let i = 0; i < 3; i++) {
    p.rect(x - 4 + i, y + i * 10, w + 8 - i * 2, 8, [STONE[4], STONE[3], STONE[2]][i]);
    p.rect(x - 3 + i, y + i * 10 + 7, w + 6 - i * 2, 2, '#a6a58a');
  }
  p.rect(x, y - 3, w, 3, '#8f9576'); p.rect(x + 1, y - 2, w - 2, 1, '#e9d8a9');
  for (let i = 0; i < 8; i++) {
    const xx = x + 4 + i * 8;
    p.line(xx, y + 3, xx + 5, y + 3, '#a8996b'); p.line(xx + 5, y + 3, xx + 5, y + 6, '#a8996b'); p.line(xx + 5, y + 6, xx + 2, y + 6, '#a8996b');
  }
  p.oval(x + w / 2, y + 15, 14, 4, '#8e9f83'); p.ring(x + w / 2, y + 15, 15, 5, '#c7b57b');
  p.poly([[x + w / 2, y + 11], [x + w / 2 + 4, y + 15], [x + w / 2, y + 18], [x + w / 2 - 4, y + 15]], '#dcca91');
}
function drawFront(c: Ctx) {
  const p = new Pixels(c);
  for (const side of [-1, 1]) {
    const x = side < 0 ? 0 : W - 19;
    p.rect(x, 170, 19, H - 170, '#8b977e'); p.rect(x + (side < 0 ? 1 : 2), 171, 16, H - 171, '#b7b89a');
    p.rect(x + (side < 0 ? 15 : 1), 170, 3, H - 170, '#d8cda8');
    for (let y = 186; y < H; y += 21) { p.rect(x + 1, y, 17, 1, '#818f77'); p.rect(x + 1, y + 1, 17, 1, '#d1c8a3'); }
    const px = side < 0 ? 12 : W - 12;
    pot(p, px, 271, 12, 26); leafCluster(p, px, 261, 13, 11, true);
    pot(p, px + side * 2, 203, 9, 18, '#a57c54'); leafCluster(p, px + side * 2, 197, 9, 7);
  }
}
function drawPot(p: Pixels, selected: KitchenSceneState['selectedRecipe']) {
  const { cx, y } = station('stove'), soup = SOUP[selected];
  p.oval(cx, y + 18, 24, 5, '#4a45395f');
  p.poly([[cx - 19, y + 7], [cx + 19, y + 7], [cx + 16, y + 18], [cx + 10, y + 21], [cx - 10, y + 21], [cx - 16, y + 18]], COPPER[1]);
  p.rect(cx - 15, y + 9, 4, 6, COPPER[3]); p.line(cx + 15, y + 9, cx + 12, y + 18, COPPER[0], 2);
  p.oval(cx, y + 6, 20, 6, COPPER[4]); p.oval(cx, y + 6, 17, 4, soup.dark); p.oval(cx - 1, y + 5, 14, 3, soup.mid);
  p.line(cx - 11, y + 3, cx + 8, y + 4, soup.bright);
  for (const [ox, oy] of [[-7, 5], [5, 5], [0, 8]]) p.rect(cx + ox, y + oy, 3, 1, soup.garnish);
  p.ring(cx - 23, y + 8, 4, 3, COPPER[1]); p.ring(cx + 23, y + 8, 4, 3, COPPER[1]);
  p.line(cx + 7, y + 4, cx + 21, y - 5, '#b79b65', 2); p.line(cx + 9, y + 3, cx + 21, y - 5, '#f1d69a');
}
function drawPacked(c: Ctx, packed: KitchenSceneState['packedSupply']) {
  const p = new Pixels(c), { cx, y } = station('bag');
  p.oval(cx + 2, y + 19, 17, 3, '#4f53435f');
  p.rect(cx - 14, y - 3, 28, 22, '#806447'); p.rect(cx - 13, y - 3, 25, 18, '#b4935c');
  p.rect(cx - 12, y - 1, 4, 17, '#d0ad6d'); p.rect(cx + 10, y - 1, 3, 18, '#69523e');
  p.poly([[cx - 14, y - 3], [cx - 10, y - 9], [cx + 10, y - 9], [cx + 14, y - 3], [cx + 8, y + 4], [cx - 8, y + 4]], '#bd9b61');
  p.line(cx - 6, y - 9, cx - 6, y - 13, '#746044', 2); p.line(cx - 6, y - 13, cx + 6, y - 13, '#746044', 2); p.line(cx + 6, y - 13, cx + 6, y - 9, '#746044', 2);
  p.rect(cx - 2, y + 2, 4, 13, '#6c593d'); p.rect(cx - 3, y + 6, 6, 5, '#e2c580'); p.rect(cx - 1, y + 7, 2, 3, '#816940');
  if (packed) {
    const color = packed === 'olive-draught' ? '#85a56b' : packed === 'laurel-thread' ? '#d2b864' : '#9aa9d2';
    p.rect(cx + 17, y + 3, 8, 14, color); p.rect(cx + 18, y + 4, 2, 11, '#dfe3b6'); p.rect(cx + 18, y, 6, 3, '#866743'); p.rect(cx + 17, y + 9, 8, 2, '#d9c38d');
  } else { p.rect(cx + 17, y + 12, 9, 4, '#b5bc9f'); p.rect(cx + 18, y + 12, 7, 1, '#e1dbb5'); }
}

/** Owns only pixel caches. Input, scheduling and all inventory transactions belong to the caller. */
export function createKitchenPixelRenderer(): KitchenPixelRenderer {
  const back = surface(), front = surface(), bag = surface();
  drawRoom(back.ctx); drawFront(front.ctx);
  const objects = KITCHEN_STATIONS.map(item => {
    const layer = surface();
    if (item.id === 'shelf') drawShelf(layer.ctx);
    else if (item.id === 'stove') drawStove(layer.ctx);
    else if (item.id === 'recipes') drawRecipes(layer.ctx);
    else if (item.id === 'bag') drawBagTable(layer.ctx);
    else drawExit(layer.ctx);
    return { ...layer, station: item };
  });
  const heroes = [ADONIS_A, ADONIS_B].map(frame => Grid.ascii(frame.rows, frame.mirror).render());
  let packed: KitchenSceneState['packedSupply'] | undefined;
  let disposed = false;
  return {
    draw(ctx, state) {
      if (disposed) return;
      if (packed !== state.packedSupply) { bag.ctx.clearRect(0, 0, W, H); drawPacked(bag.ctx, state.packedSupply); packed = state.packedSupply; }
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.scale(2, 2); ctx.drawImage(back.canvas, 0, 0);
      const p = new Pixels(ctx), px = Math.round(state.player.x / 2), py = Math.round(state.player.y / 2);
      if (state.destination) p.ring(state.destination.x / 2, state.destination.y / 2, 6, 2, '#f2de9b');
      const drawObject = (object: typeof objects[number]) => {
        ctx.drawImage(object.canvas, 0, 0);
        if (object.station.id === 'bag') ctx.drawImage(bag.canvas, 0, 0);
        if (object.station.id === 'stove') {
          const { cx, y, h } = station('stove');
          const phase = state.reducedMotion ? 0 : Math.floor(state.elapsed * 7);
          for (let i = 0; i < 6; i++) {
            const xx = cx - 17 + i * 6, height = 6 + hash(i, phase) % 7;
            p.poly([[xx, y + h - 8], [xx - 2, y + h - 11], [xx + 1, y + h - 8 - height], [xx + 4, y + h - 10], [xx + 4, y + h - 8]], '#ca713e');
            p.rect(xx + 1, y + h - 10, 2, 3, '#efba65'); p.rect(xx + 2, y + h - 10 - Math.floor(height / 2), 1, Math.floor(height / 2) + 2, '#f8dc8b');
          }
          drawPot(p, state.selectedRecipe);
          const celebration = state.celebration;
          if (celebration && celebration.elapsed >= 0 && celebration.elapsed < 2.4) {
            const food = SOUP[celebration.recipe], plateX = cx + 38, plateY = y + 13;
            p.oval(plateX + 1, plateY + 4, 13, 3, '#625c485f'); p.oval(plateX, plateY, 13, 5, '#f3e5bf'); p.oval(plateX, plateY, 10, 3, '#b8b89b'); p.oval(plateX, plateY - 1, 8, 3, food.mid);
            p.rect(plateX - 5, plateY - 2, 6, 1, food.bright); p.rect(plateX + 2, plateY - 2, 3, 2, food.garnish);
            for (let i = 0; i < 3; i++) {
              const rise = state.reducedMotion ? i * 4 : (celebration.elapsed * 14 + i * 6) % 19;
              const xx = cx - 9 + i * 9 + (state.reducedMotion ? 0 : Math.floor(Math.sin(celebration.elapsed * 4 + i) * 2));
              p.line(xx, y - 4 - rise, xx + 2, y - 9 - rise, '#dce3cb'); p.line(xx + 2, y - 9 - rise, xx, y - 12 - rise, '#eef0d6');
            }
            for (const [ox, oy] of [[-17, -18], [19, -23], [47, -12]]) { p.rect(cx + ox, y + oy, 1, 5, '#f5e0a3'); p.rect(cx + ox - 2, y + oy + 2, 5, 1, '#f5e0a3'); }
          }
        }
      };
      for (const object of objects) if ((object.station.y + object.station.height) / 2 <= py) drawObject(object);
      const frame = state.player.walking && !state.reducedMotion ? Math.floor(state.elapsed * 8) % 2 : 0;
      const hero = heroes[frame], hw = hero.width * 2, hh = hero.height * 2;
      p.oval(px + 2, py + 1, 13, 4, '#465a4a65'); p.oval(px, py, 9, 2, '#3d51436e');
      ctx.save(); ctx.translate(px, py - (state.player.walking && !state.reducedMotion ? frame : 0)); ctx.scale(state.player.facing === 'left' ? -1 : 1, 1); ctx.drawImage(hero, -Math.round(hw / 2), -hh, hw, hh); ctx.restore();
      for (const object of objects) if ((object.station.y + object.station.height) / 2 > py) drawObject(object);
      ctx.drawImage(front.canvas, 0, 0);
      if (state.target) {
        const target = KITCHEN_STATIONS.find(item => item.id === state.target);
        if (target) {
          const x = target.x / 2, y = target.y / 2, w = target.width / 2, h = target.height / 2;
          for (const [cx, cy, dx, dy] of [[x - 2, y - 2, 1, 1], [x + w + 1, y - 2, -1, 1], [x - 2, y + h + 1, 1, -1], [x + w + 1, y + h + 1, -1, -1]]) {
            p.line(cx, cy, cx + dx * 5, cy, '#f2db94'); p.line(cx, cy, cx, cy + dy * 4, '#f2db94');
          }
          p.ring(target.approach.x / 2, target.approach.y / 2 + 1, 7, 2, '#e7d197');
        }
      }
      ctx.restore();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const canvas of [back.canvas, front.canvas, bag.canvas, ...objects.map(o => o.canvas), ...heroes]) canvas.width = canvas.height = 1;
    },
  };
}
