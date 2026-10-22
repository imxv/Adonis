import { GARDEN_BEDS, GARDEN_WALK_BOUNDS, GARDEN_WORLD } from './pixel-contract';

type Ctx = CanvasRenderingContext2D;
const WIDTH = GARDEN_WORLD.width / 2;
const HEIGHT = GARDEN_WORLD.height / 2;
const LEAVES = ['#173e36', '#285940', '#3e7849', '#609254', '#91ae63', '#c1ca82'];
const STONE = ['#6f756c', '#989786', '#b7b49a', '#d4cfb0', '#ece1bd'];
const TERRA = ['#713f39', '#94533e', '#b86d48', '#d99360', '#eab584'];
const TAU = Math.PI * 2;

function rect(c: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  const width = Math.round(w), height = Math.round(h);
  if (width <= 0 || height <= 0) return;
  c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), width, height);
}
function line(c: Ctx, ax: number, ay: number, bx: number, by: number, color: string, size = 1): void {
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
  for (let i = 0; i <= n; i++) rect(c, ax + (bx - ax) * i / n, ay + (by - ay) * i / n, size, size, color);
}
function poly(c: Ctx, points: readonly number[][], color: string): void {
  const lo = Math.ceil(Math.min(...points.map(p => p[1]))), hi = Math.floor(Math.max(...points.map(p => p[1])));
  for (let y = lo; y <= hi; y++) {
    const crossings: number[] = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j], b = points[i];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) crossings.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) rect(c, Math.ceil(crossings[i]), y, Math.floor(crossings[i + 1]) - Math.ceil(crossings[i]) + 1, 1, color);
  }
}
function oval(c: Ctx, x: number, y: number, rx: number, ry: number, color: string): void {
  for (let v = -Math.ceil(ry); v <= ry; v++) {
    const dx = Math.floor(rx * Math.sqrt(Math.max(0, 1 - v * v / (ry * ry))));
    rect(c, x - dx, y + v, dx * 2 + 1, 1, color);
  }
}
function ring(c: Ctx, x: number, y: number, rx: number, ry: number, color: string): void {
  const steps = Math.ceil(Math.max(rx, ry) * 8);
  for (let i = 0; i <= steps; i++) rect(c, x + Math.cos(i / steps * TAU) * rx, y + Math.sin(i / steps * TAU) * ry, 1, 1, color);
}
function hash(x: number, y: number): number {
  let n = Math.imul(x + 131, 1597334677) ^ Math.imul(y + 967, 3812015801);
  n = Math.imul(n ^ n >>> 16, 2246822507);
  return (n ^ n >>> 13) >>> 0;
}

function cloud(c: Ctx, x: number, y: number, w: number): void {
  rect(c, x + 3, y + 5, w - 6, 5, '#d8e7d8');
  rect(c, x + 8, y + 1, w * .33, 7, '#eef0d8');
  rect(c, x + w * .42, y - 2, w * .31, 10, '#fff7dc');
  rect(c, x, y + 8, w, 3, '#e6ecd6');
  rect(c, x + w - 10, y + 5, 8, 4, '#fff7dc');
}
function seaView(c: Ctx): void {
  rect(c, 0, 0, WIDTH, 23, '#81b8cb');
  rect(c, 0, 23, WIDTH, 23, '#9ecbce');
  rect(c, 0, 46, WIDTH, 37, '#b2d3cd');
  cloud(c, 80, 12, 48); cloud(c, 211, 3, 69); cloud(c, 354, 17, 43);
  // Three coherent mountain silhouettes form a receding bay rather than noise.
  poly(c, [[0, 54], [42, 36], [73, 44], [107, 25], [151, 50], [185, 42], [228, 64], [0, 70]], '#7faeb3');
  poly(c, [[0, 61], [58, 43], [92, 56], [126, 38], [175, 61], [221, 55], [260, 73], [0, 76]], '#5d99a2');
  poly(c, [[270, 65], [312, 42], [343, 52], [384, 30], [416, 49], [480, 40], [480, 83], [270, 83]], '#70a4a7');
  line(c, 97, 39, 107, 25, '#c5d8cc'); line(c, 107, 25, 124, 38, '#a9c8c6');
  line(c, 376, 39, 384, 30, '#c4d8c9'); line(c, 384, 30, 394, 41, '#a9c8c6');
  rect(c, 0, 66, WIDTH, 27, '#388fa5');
  rect(c, 0, 73, WIDTH, 20, '#2a889c');
  rect(c, 0, 83, WIDTH, 10, '#3a9ba7');
  for (let row = 0; row < 6; row++) {
    const yy = 68 + row * 4;
    for (let i = 0; i < 13; i++) {
      const xx = (i * 43 + row * 17) % WIDTH;
      rect(c, xx, yy, 4 + (hash(i, row) % 12), 1, row % 2 ? '#77bdba' : '#a4cebf');
      if (i % 4 === 0) rect(c, xx + 5, yy + 1, 4, 1, '#459fa9');
    }
  }
  // A tiny whitewashed headland makes this recognisably a Greek coastal garden.
  poly(c, [[282, 64], [298, 58], [321, 61], [339, 55], [360, 67], [352, 77], [318, 75], [301, 71]], '#8faaa0');
  poly(c, [[290, 64], [305, 61], [322, 64], [337, 59], [353, 67], [342, 71], [309, 69]], '#c5c4a7');
  for (const [x, y, w, h] of [[306, 53, 12, 9], [319, 49, 10, 13], [332, 54, 14, 8]]) {
    rect(c, x + 2, y + h, w, 2, '#719e9d'); rect(c, x, y, w, h, '#f2e8c7');
    rect(c, x, y + 1, 2, h - 1, '#fff5d8'); rect(c, x + w - 3, y + 2, 3, h - 2, '#b2b6a1');
    rect(c, x - 1, y, w + 2, 2, '#d7b18a'); rect(c, x + 4, y + h - 4, 2, 4, '#3c7186');
  }
  oval(c, 324, 47, 5, 4, '#477f9c'); rect(c, 320, 47, 9, 3, '#5594ad');
  line(c, 324, 39, 324, 43, '#efe7c8'); line(c, 322, 41, 326, 41, '#efe7c8');
  // Small sail: an explicit cluster, not an external sprite.
  poly(c, [[231, 73], [230, 61], [222, 72]], '#fff0cc');
  poly(c, [[233, 63], [240, 72], [233, 72]], '#cbdcc8');
  line(c, 232, 60, 232, 75, '#6e877f'); line(c, 223, 75, 239, 75, '#355d6b');
}

function balustrade(c: Ctx): void {
  rect(c, 0, 83, WIDTH, 23, '#8f9a88');
  rect(c, 0, 85, WIDTH, 19, '#9fb0a2');
  for (let x = 5; x < WIDTH; x += 23) {
    rect(c, x + 2, 88, 7, 13, '#6b8d85');
    rect(c, x + 10, 88, 7, 13, '#d7cfac');
    rect(c, x + 11, 89, 2, 11, '#f0e3bc');
    rect(c, x + 16, 89, 1, 12, '#919b87');
    rect(c, x + 8, 88, 11, 2, '#e4d8b3');
    rect(c, x + 8, 99, 11, 2, '#b5b59a');
  }
  rect(c, 0, 81, WIDTH, 3, '#efe3bc'); rect(c, 0, 84, WIDTH, 2, '#b7b496');
  rect(c, 0, 103, WIDTH, 3, '#ded0a8'); rect(c, 0, 106, WIDTH, 2, '#798a78');
  for (let x = 0; x < WIDTH; x += 46) {
    rect(c, x + 1, 82, 1, 3, '#bcb79c'); rect(c, x + 17, 104, 1, 2, '#b3ac91');
  }
}

function leafCluster(c: Ctx, cx: number, cy: number, rx: number, ry: number, seed: number, flowers = false): void {
  oval(c, cx, cy + 2, rx + 1, ry, LEAVES[0]);
  // Deliberate overlapping leaf masses create crown structure and lit ridges.
  for (let i = 0; i < 10; i++) {
    const a = i * 2.399, radial = .25 + hash(i, seed) % 55 / 100;
    const x = cx + Math.cos(a) * rx * radial, y = cy + Math.sin(a) * ry * radial;
    const w = 3 + hash(seed, i) % Math.max(3, Math.round(rx * .45));
    const h = 2 + hash(i + 14, seed) % Math.max(2, Math.round(ry * .5));
    oval(c, x, y, w, h, LEAVES[i % 3 + 1]);
    rect(c, x - w / 2, y - h, Math.max(2, w), 1, LEAVES[i % 3 + 2]);
    if (i % 3 === 0) { rect(c, x - 2, y - h - 1, 3, 1, LEAVES[4]); rect(c, x + 3, y, 2, 1, LEAVES[4]); }
    if (flowers && i % 2 === 0) {
      const fx = Math.round(x), fy = Math.round(y - h);
      const petal = i % 4 ? '#dca270' : '#c46768';
      rect(c, fx - 1, fy, 3, 1, petal); rect(c, fx, fy - 1, 1, 3, petal); rect(c, fx, fy, 1, 1, '#f4d4a0');
    }
  }
}
function cypress(c: Ctx, x: number, bottom: number, h: number, seed: number): void {
  oval(c, x + 3, bottom + 2, h * .18, 4, '#284e423b');
  rect(c, x - 2, bottom - 13, 4, 14, '#6b6550'); rect(c, x - 1, bottom - 13, 1, 13, '#9a8560');
  poly(c, [[x, bottom - h], [x + 5, bottom - h + 16], [x + 9, bottom - h + 43], [x + 11, bottom - 15], [x + 6, bottom - 6], [x - 7, bottom - 6], [x - 11, bottom - 17], [x - 8, bottom - h + 35], [x - 4, bottom - h + 13]], LEAVES[0]);
  for (let y = bottom - h + 10; y < bottom - 9; y += 6) {
    const width = Math.min(9, (y - (bottom - h)) * .18 + 1);
    rect(c, x - width, y, width + 3, 4, LEAVES[1]);
    rect(c, x - width + 1, y, Math.max(2, width - 1), 2, LEAVES[2]);
    rect(c, x - width + 2, y - 1, Math.max(1, width - 3), 1, LEAVES[(hash(seed, y) % 4 === 0) ? 4 : 3]);
    rect(c, x + 3, y + 2, width - 2, 2, '#244d3c');
  }
}
function terracotta(c: Ctx, x: number, y: number, rx: number, height: number, leafy: boolean, seed: number): void {
  oval(c, x + 2, y + height + 2, rx + 3, 3, '#34524544');
  poly(c, [[x - rx, y], [x + rx, y], [x + rx - 2, y + height - 4], [x + rx - 6, y + height], [x - rx + 6, y + height], [x - rx + 2, y + height - 4]], TERRA[1]);
  poly(c, [[x - rx + 1, y + 1], [x - 1, y + 2], [x - 2, y + height], [x - rx + 6, y + height], [x - rx + 3, y + height - 5]], TERRA[2]);
  rect(c, x - rx + 3, y + 4, 2, height - 8, TERRA[3]);
  oval(c, x, y, rx + 1, 3, TERRA[3]); oval(c, x, y, rx - 2, 2, '#5b4a38');
  line(c, x - rx + 2, y + height - 5, x + rx - 2, y + height - 5, TERRA[0]);
  if (height > 15) for (let xx = x - rx + 4; xx < x + rx - 4; xx += 4) {
    line(c, xx, y + 7, xx + 2, y + 10, '#d8a06b'); line(c, xx + 2, y + 10, xx + 4, y + 7, '#d8a06b');
  }
  if (leafy) leafCluster(c, x, y - 7, rx + 3, 8, seed, true);
}
function pergola(c: Ctx): void {
  // Posts flank the shared plots; no independent interaction coordinates exist here.
  const left = GARDEN_BEDS[0].x / 2 - 25;
  const rightBed = GARDEN_BEDS[GARDEN_BEDS.length - 1];
  const right = (rightBed.x + rightBed.width) / 2 + 25;
  for (const x of [left, right]) {
    oval(c, x + 5, 105, 13, 3, '#365e453c');
    rect(c, x - 4, 22, 8, 82, '#b3b697'); rect(c, x - 3, 23, 3, 79, '#e8dfbb');
    rect(c, x + 2, 24, 2, 79, '#87977e'); rect(c, x - 7, 20, 14, 4, '#e8dfbb');
    rect(c, x - 7, 101, 14, 4, '#ded1a8'); rect(c, x - 5, 97, 10, 4, '#a5ab8b');
    line(c, x - 4, 31, x - 4, 94, '#f2e8c4');
    for (let y = 39; y < 92; y += 16) rect(c, x - 3, y, 6, 1, '#c3bf9e');
  }
  rect(c, left - 9, 17, right - left + 18, 6, '#a09a77');
  rect(c, left - 10, 15, right - left + 20, 3, '#e5d5a7');
  rect(c, left - 6, 22, right - left + 12, 2, '#667f65');
  for (let x = left - 6; x <= right + 6; x += 16) {
    poly(c, [[x, 16], [x + 3, 5], [x + 7, 5], [x + 5, 17]], '#a7a17d');
    line(c, x + 3, 5, x + 6, 5, '#e5d7ae');
    rect(c, x, 18, 2, 3, '#71876a');
  }
  for (let i = 0; i < 17; i++) {
    const x = left - 7 + i * (right - left + 14) / 16;
    leafCluster(c, x, 13 + Math.sin(i * .65) * 4, 13, 7, i * 19 + 8, i % 5 === 0);
  }
  for (const [x, direction] of [[left - 2, 1], [right + 1, -1]]) {
    for (let i = 0; i < 8; i++) {
      const y = 23 + i * 8, vx = x + Math.sin(i * 1.4) * 4;
      line(c, vx, y - 5, vx + direction * 2, y + 6, '#547145');
      poly(c, [[vx, y], [vx + 6 * direction, y - 3], [vx + 7 * direction, y + 1], [vx, y + 4]], LEAVES[i % 3 + 2]);
      rect(c, vx + direction * 3, y - 1, 2, 1, LEAVES[4]);
      if (i % 4 === 0) { oval(c, vx - direction * 4, y + 2, 2, 3, '#72617e'); rect(c, vx - direction * 4, y, 1, 1, '#a49bb0'); }
    }
  }
}

function fountain(c: Ctx): void {
  // Physical basin lies entirely north of the walk bounds, left of the plots.
  const x = 43, y = 147;
  oval(c, x + 3, 163, 32, 3, '#3d604a35');
  oval(c, x, y + 7, 31, 10, STONE[0]); rect(c, x - 30, y - 1, 61, 8, STONE[1]);
  oval(c, x, y, 31, 10, STONE[3]); oval(c, x, y - 1, 27, 7, '#527c7a');
  oval(c, x, y, 25, 6, '#4d9a9e'); oval(c, x, y + 2, 21, 3, '#3f8994');
  ring(c, x, y, 29, 8, STONE[4]);
  for (let i = 0; i < 5; i++) { rect(c, 23 + i * 9, y + i % 2 * 2, 5, 1, '#a5d0c4'); rect(c, 24 + i * 9, y + 3 + i % 2, 3, 1, '#6ab7b4'); }
  for (const xx of [19, 31, 55, 67]) { line(c, xx, y + 5, xx + 1, y + 12, '#7d8478'); rect(c, xx + 2, y + 6, 1, 5, '#c9c6a6'); }
  rect(c, x - 5, 119, 10, 23, STONE[1]); rect(c, x - 4, 121, 3, 21, STONE[3]);
  oval(c, x, 119, 13, 4, STONE[3]); oval(c, x, 119, 10, 2, '#618b87');
  poly(c, [[x - 12, 120], [x + 12, 120], [x + 8, 127], [x - 8, 127]], STONE[2]);
  rect(c, x - 3, 112, 6, 7, STONE[2]); oval(c, x, 111, 5, 4, STONE[3]);
  rect(c, x - 1, 109, 2, 3, STONE[4]);
  for (const xx of [x - 8, x + 8]) { rect(c, xx, 124, 2, 19, '#5b9ca4'); rect(c, xx, 124, 1, 18, '#b5dcd0'); rect(c, xx - 2, 143, 6, 1, '#8fcfc2'); }
  oval(c, x, 143, 9, 2, '#7fc0b8');
}

function sideBorders(c: Ctx): void {
  cypress(c, 25, 104, 91, 1); cypress(c, 48, 104, 73, 2);
  cypress(c, WIDTH - 28, 103, 94, 3); cypress(c, WIDTH - 50, 103, 72, 4);
  // The side low walls tuck beneath the garden edge, not into player space.
  for (const x of [0, WIDTH - 35]) {
    rect(c, x, 98, 35, HEIGHT - 98, '#81967b');
    rect(c, x + 2, 99, 31, HEIGHT - 99, '#98a087');
    for (let y = 105; y < HEIGHT; y += 18) {
      rect(c, x + 2, y, 31, 1, '#708572'); rect(c, x + 2, y + 1, 31, 1, '#b8b99a');
      rect(c, x + (y % 36 === 33 ? 12 : 23), y + 2, 1, 16, '#7f8f76');
    }
    rect(c, x, 97, 35, 3, '#d1c9a4'); rect(c, x + 1, 100, 33, 2, '#728c74');
  }
  leafCluster(c, 18, 102, 18, 10, 10, true); leafCluster(c, 62, 107, 11, 7, 11);
  leafCluster(c, 459, 105, 18, 10, 12, true);
  fountain(c);
  terracotta(c, 456, 130, 10, 22, true, 22);
  terracotta(c, 436, 149, 7, 15, true, 23);
  // Marble mounting plinth on the right, decorated with a shallow leaf relief.
  rect(c, 450, 164, 25, 20, STONE[1]); rect(c, 448, 161, 29, 4, STONE[3]);
  rect(c, 453, 168, 18, 12, STONE[2]); rect(c, 448, 184, 29, 3, STONE[3]);
  for (let i = 0; i < 4; i++) { line(c, 457 + i * 3, 176, 459 + i * 3, 171, '#7d937c'); rect(c, 456 + i * 3, 171, 2, 2, '#b9c09a'); }
}

/** Back layer, generated once on a 480×320 source canvas. No runtime ownership. */
export function drawGardenLandscapeBack(ctx: Ctx): void {
  ctx.save(); ctx.imageSmoothingEnabled = false;
  seaView(ctx); balustrade(ctx); sideBorders(ctx); pergola(ctx);
  ctx.restore();
}

/** Edge occluders remain outside the shared player walk bounds. */
export function drawGardenLandscapeFront(ctx: Ctx): void {
  ctx.save(); ctx.imageSmoothingEnabled = false;
  const leftLimit = GARDEN_WALK_BOUNDS.minX / 2 - 5;
  const rightStart = GARDEN_WALK_BOUNDS.maxX / 2 + 4;
  // Each source-pixel column is drawn on the nonwalkable side of the bounds.
  for (const side of [-1, 1]) {
    const edgeX = side < 0 ? leftLimit - 16 : rightStart + 17;
    terracotta(ctx, edgeX, 286, 12, 31, false, 50 + side);
    for (const [offset, y, rx, ry, seed] of [[0, 275, 14, 15, 1], [-3, 255, 13, 10, 2], [3, 293, 15, 11, 3]]) {
      leafCluster(ctx, edgeX + offset, y, rx, ry, seed + side * 7, seed === 3);
    }
    terracotta(ctx, edgeX + side * 4, 224, 9, 21, true, 60 + side);
    for (let i = 0; i < 5; i++) {
      const x = side < 0 ? 7 + i * 5 : WIDTH - 8 - i * 5;
      line(ctx, x, 209 + i % 2 * 5, x + side * 3, 185 + i * 2, LEAVES[2]);
      poly(ctx, [[x, 201], [x + side * 5, 190], [x + side * 7, 194], [x + side * 2, 205]], LEAVES[3]);
      rect(ctx, x + side * 3, 192, 1, 4, LEAVES[4]);
    }
  }
  ctx.restore();
}
