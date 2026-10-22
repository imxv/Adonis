import { GARDEN_BEDS } from './pixel-contract';
import type { GardenBedVisual } from './pixel-contract';

type Context = CanvasRenderingContext2D;
type Point = readonly [number, number];
const SOIL = { deep: '#493b30', dark: '#614533', earth: '#80563c', light: '#a36b46', edge: '#c08b57' };
const STONE = { shadow: '#5e6558', side: '#a28d6c', joint: '#83745e', face: '#c7b68e', sun: '#e2d0a5', light: '#f0dfb5' };
const OLIVE = ['#203f35', '#315a3d', '#4d7848', '#7b9a58', '#b0bb6c'];
const LAUREL = ['#294534', '#3d633b', '#67864a', '#a1a356', '#d4bc67'];
const IRIS = ['#264b3b', '#3c704b', '#6a955b', '#8db274'];

function rect(c: Context, x: number, y: number, w: number, h: number, color: string) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}
function line(c: Context, ax: number, ay: number, bx: number, by: number, color: string, thickness = 1) {
  const count = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
  for (let i = 0; i <= count; i++) rect(c, ax + (bx - ax) * i / count, ay + (by - ay) * i / count, thickness, thickness, color);
}
function oval(c: Context, cx: number, cy: number, rx: number, ry: number, color: string) {
  for (let v = -Math.ceil(ry); v <= ry; v++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - v * v / (ry * ry))));
    rect(c, cx - half, cy + v, half * 2 + 1, 1, color);
  }
}
function poly(c: Context, points: readonly Point[], color: string) {
  const top = Math.ceil(Math.min(...points.map(p => p[1])));
  const bottom = Math.floor(Math.max(...points.map(p => p[1])));
  for (let y = top; y <= bottom; y++) {
    const crossings: number[] = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j], b = points[i];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) crossings.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const start = Math.ceil(crossings[i]);
      rect(c, start, y, Math.floor(crossings[i + 1]) - start + 1, 1, color);
    }
  }
}

/** Immutable soil/stone artwork in 480 × 320 logical pixels. */
export function drawGardenBeds(ctx: Context): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const bed of GARDEN_BEDS) {
    const x = bed.x / 2, y = bed.y / 2, w = bed.width / 2, h = bed.height / 2;
    // The southern side and its contact shadow make the raised bed readable.
    rect(ctx, x + 2, y + h - 1, w, 3, '#596650');
    rect(ctx, x + 1, y + 3, w - 2, h - 4, STONE.side);
    rect(ctx, x, y, w, h - 4, STONE.face);
    rect(ctx, x + 1, y, w - 2, 2, STONE.light);
    rect(ctx, x, y + 1, 2, h - 6, STONE.sun);
    rect(ctx, x + w - 3, y + 2, 3, h - 5, STONE.joint);
    rect(ctx, x + 3, y + 4, w - 7, h - 10, SOIL.deep);
    rect(ctx, x + 5, y + 6, w - 11, h - 14, SOIL.earth);
    rect(ctx, x + 5, y + 6, w - 11, 2, SOIL.dark);
    // Furrows form three deliberate planting rows with damp, shaded sides.
    for (let row = 0; row < 3; row++) {
      const yy = y + 15 + row * 12;
      line(ctx, x + 8, yy, x + w - 11, yy - 1, SOIL.dark, 2);
      line(ctx, x + 9, yy + 2, x + w - 12, yy + 1, SOIL.light);
      for (let clod = 0; clod < 4; clod++) {
        const xx = x + 11 + clod * 15 + row % 2 * 3;
        rect(ctx, xx, yy - 3, 4, 2, SOIL.dark);
        rect(ctx, xx, yy - 3, 3, 1, SOIL.edge);
        rect(ctx, xx + 7, yy + 4, 3, 1, SOIL.light);
      }
    }
    // Uneven joined limestone blocks stay on the border rather than in the crop.
    for (let i = 0; i < 5; i++) {
      const bx = x + 4 + i * 15;
      line(ctx, bx, y, bx - 1, y + 4, STONE.joint);
      line(ctx, bx + 5, y + h - 6, bx + 5, y + h - 1, STONE.joint);
      rect(ctx, bx + 6, y + h - 5, 7, 1, STONE.sun);
    }
    rect(ctx, x + 2, y + h - 7, w - 5, 2, STONE.sun);
    rect(ctx, x + 3, y + h - 3, w - 6, 2, STONE.side);
    rect(ctx, x + 4, y + h - 2, w - 8, 1, '#8c795d');
    // Two carved corner rosettes add a small Greek garden motif.
    for (const xx of [x + 2, x + w - 6]) {
      rect(ctx, xx, y + h - 6, 4, 3, STONE.joint);
      rect(ctx, xx + 1, y + h - 6, 2, 2, STONE.light);
    }
  }
  ctx.restore();
}

function seedling(c: Context, x: number, y: number, kind: GardenBedVisual['plant'], sway: number) {
  oval(c, x + 1, y + 1, 5, 2, '#513d30');
  line(c, x, y, x + sway, y - 7, '#5f7c46');
  if (kind === 'iris') {
    poly(c, [[x, y - 1], [x - 4, y - 10], [x - 2, y - 9], [x + 1, y - 2]], IRIS[2]);
    poly(c, [[x, y - 1], [x + 3 + sway, y - 12], [x + 4 + sway, y - 9], [x + 1, y]], IRIS[1]);
    line(c, x + 1, y - 2, x + 3 + sway, y - 10, IRIS[3]);
  } else {
    const palette = kind === 'laurel' ? LAUREL : OLIVE;
    poly(c, [[x, y - 5], [x - 5, y - 9], [x - 5, y - 6], [x, y - 3]], palette[2]);
    poly(c, [[x, y - 6], [x + 5 + sway, y - 11], [x + 6 + sway, y - 7], [x, y - 4]], palette[3]);
    rect(c, x - 4, y - 8, 2, 1, palette[4]);
    rect(c, x + 3 + sway, y - 9, 2, 1, palette[4]);
  }
}
function olive(c: Context, x: number, y: number, mature: boolean, sway: number) {
  const tall = mature ? 26 : 18;
  oval(c, x + 2, y + 1, mature ? 12 : 8, 3, '#493b30');
  line(c, x, y, x + sway, y - tall + 3, '#795e3f', 2);
  line(c, x + 1, y - 1, x + sway + 1, y - tall + 5, '#b18b55');
  const lobes: readonly Point[] = mature ? [[-7, -15], [0, -23], [7, -16], [-3, -12], [3, -17]] : [[-4, -11], [1, -17], [6, -10]];
  for (const [lx, ly] of lobes) {
    const xx = x + lx + sway, yy = y + ly;
    oval(c, xx + 1, yy + 2, mature ? 7 : 5, 5, OLIVE[0]);
    oval(c, xx, yy, mature ? 7 : 5, 4, OLIVE[1]);
    oval(c, xx - 1, yy - 1, mature ? 5 : 4, 3, OLIVE[2]);
    rect(c, xx - 3, yy - 3, 3, 1, OLIVE[3]);
    rect(c, xx + 1, yy - 2, 2, 1, OLIVE[4]);
    rect(c, xx + 4, yy + 1, 2, 1, OLIVE[2]);
  }
  if (mature) for (const [fx, fy] of [[-8, -13], [-3, -21], [3, -17], [7, -12], [0, -11]]) {
    rect(c, x + fx + sway, y + fy, 2, 3, '#273a39');
    rect(c, x + fx + sway, y + fy, 1, 1, '#a8b981');
    rect(c, x + fx + sway + 1, y + fy + 2, 1, 1, '#58664b');
  }
}
function laurel(c: Context, x: number, y: number, mature: boolean, sway: number) {
  const height = mature ? 28 : 19;
  oval(c, x + 1, y + 1, mature ? 11 : 8, 3, '#493b30');
  line(c, x, y, x + sway, y - height, '#765c38', 2);
  for (let row = 0; row < (mature ? 5 : 3); row++) {
    const yy = y - 5 - row * 5;
    const length = row === 0 ? 8 : row === 4 ? 5 : 10;
    for (const side of [-1, 1]) {
      const xx = x + sway * (row > 2 ? 1 : 0);
      poly(c, [[xx, yy], [xx + side * length, yy - 7], [xx + side * (length + 1), yy - 3], [xx + side * 6, yy + 1]], LAUREL[1]);
      poly(c, [[xx + side, yy - 1], [xx + side * length, yy - 7], [xx + side * (length - 1), yy - 4], [xx + side * 4, yy]], mature ? LAUREL[3] : LAUREL[2]);
      line(c, xx + side * 3, yy - 1, xx + side * (length - 1), yy - 5, mature ? LAUREL[4] : LAUREL[3]);
    }
  }
  rect(c, x + sway, y - height - 1, 2, 4, mature ? '#d8c370' : '#7f9d53');
}
function irisFlower(c: Context, x: number, y: number, warm: boolean) {
  const blue = warm ? '#8494cd' : '#667ebf';
  const light = warm ? '#c7c8e6' : '#aab8e3';
  poly(c, [[x, y + 2], [x - 5, y - 2], [x - 5, y - 5], [x - 2, y - 4], [x, y - 1]], '#535c9b');
  poly(c, [[x, y], [x - 1, y - 6], [x + 1, y - 9], [x + 3, y - 6], [x + 2, y]], blue);
  poly(c, [[x + 1, y], [x + 5, y - 5], [x + 7, y - 4], [x + 5, y + 1], [x + 2, y + 3]], '#7f8dcc');
  rect(c, x, y - 6, 1, 3, light);
  rect(c, x - 4, y - 4, 2, 1, '#9cabdc');
  rect(c, x + 4, y - 4, 2, 1, light);
  rect(c, x, y, 2, 3, '#e7c16c');
}
function iris(c: Context, x: number, y: number, mature: boolean, sway: number) {
  oval(c, x + 1, y + 1, 10, 3, '#493b30');
  for (const [side, rise] of [[-1, 17], [1, 23], [-1, 10], [1, 13]]) {
    const reach = side * (rise === 10 || rise === 13 ? 9 : 5);
    poly(c, [[x, y], [x + reach + sway, y - rise], [x + reach + 2, y - rise + 2], [x + 2, y]], IRIS[1]);
    line(c, x + 1, y - 1, x + reach + sway, y - rise + 1, IRIS[2]);
  }
  if (mature) {
    line(c, x, y - 1, x + sway, y - 22, IRIS[2]);
    line(c, x + 1, y - 1, x + 7 + sway, y - 17, IRIS[1]);
    irisFlower(c, x + sway, y - 22, false);
    irisFlower(c, x + 7 + sway, y - 17, true);
  } else {
    // Tight green buds are visibly distinct from a harvestable blue bloom.
    line(c, x, y, x + sway, y - 18, IRIS[2]);
    poly(c, [[x + sway - 1, y - 17], [x + sway, y - 22], [x + sway + 2, y - 19], [x + sway + 1, y - 16]], IRIS[3]);
  }
}

/** Read-only crop states. The controller/meta service alone decide progress. */
export function drawGardenPlants(ctx: Context, beds: readonly GardenBedVisual[], elapsed: number, reducedMotion: boolean): void {
  const clock = Number.isFinite(elapsed) ? elapsed : 0;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const bed of GARDEN_BEDS) {
    const visual = beds[bed.index];
    if (!visual?.plant) continue;
    const x = bed.x / 2, y = bed.y / 2, width = bed.width / 2, height = bed.height / 2;
    const progress = Number.isFinite(visual.progress) ? Math.max(0, visual.progress) : 0;
    const required = Number.isFinite(visual.required) ? Math.max(1, visual.required) : 1;
    const mature = progress >= required;
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 3, y + 2, width - 7, height - 8); ctx.clip();
    for (const [index, [offsetX, offsetY]] of [[18, 37], [39, 43], [59, 36]].entries()) {
      const px = x + offsetX, py = y + offsetY;
      const sway = reducedMotion ? 0 : Math.sin(clock * 1.4 + bed.index * 2 + index * 1.7) > .72 ? 1 : 0;
      if (progress <= 0) seedling(ctx, px, py, visual.plant, sway);
      else if (visual.plant === 'olive') olive(ctx, px, py, mature, sway);
      else if (visual.plant === 'laurel') laurel(ctx, px, py, mature, sway);
      else if (visual.plant === 'iris') iris(ctx, px, py, mature, sway);
    }
    ctx.restore();
  }
  ctx.restore();
}
