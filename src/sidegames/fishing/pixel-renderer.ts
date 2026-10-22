import { Grid } from '../../pixel/draw';
import { ADONIS_A, ADONIS_B } from '../../pixel/sprites';

/** Presentation only: none of these values can advance or settle an attempt. */
export interface FishingPixelState {
  readonly phase: string;
  readonly bobberCue?: 'quiet' | 'nibble' | 'bite';
  readonly fishCue?: string;
  readonly castPower?: number;
  readonly tension?: number;
  readonly progress?: number;
  readonly elapsed?: number;
  readonly animationTime?: number;
  readonly held?: boolean;
  readonly fishId?: string;
  readonly fishColor?: string;
  readonly reducedMotion?: boolean;
}

export interface FishingPixelRenderer {
  readonly sourceSize: readonly [480, 320];
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, state: FishingPixelState): void;
  dispose(): void;
}

type Ctx = CanvasRenderingContext2D;
type Point = readonly [number, number];
const W = 480, H = 320;
const TAU = Math.PI * 2;
const clamp = (value: number | undefined, fallback = 0) => Number.isFinite(value) ? Math.max(0, Math.min(1, value!)) : fallback;
const hash = (x: number, y: number) => {
  let h = Math.imul(x + 821, 1597334677) ^ Math.imul(y + 419, 3812015801);
  h = Math.imul(h ^ h >>> 16, 2246822507);
  return (h ^ h >>> 13) >>> 0;
};

function rect(c: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  w = Math.round(w); h = Math.round(h);
  if (w < 1 || h < 1) return;
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}
function line(c: Ctx, ax: number, ay: number, bx: number, by: number, color: string, size = 1): void {
  ax = Math.round(ax); ay = Math.round(ay); bx = Math.round(bx); by = Math.round(by);
  const dx = Math.abs(bx - ax), sx = ax < bx ? 1 : -1;
  const dy = -Math.abs(by - ay), sy = ay < by ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    rect(c, ax, ay, size, size, color);
    if (ax === bx && ay === by) return;
    const twice = error * 2;
    if (twice >= dy) { error += dy; ax += sx; }
    if (twice <= dx) { error += dx; ay += sy; }
  }
}
function poly(c: Ctx, points: readonly Point[], color: string): void {
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
  if (rx <= 0 || ry <= 0) return;
  for (let row = -Math.ceil(ry); row <= ry; row++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - row * row / (ry * ry))));
    rect(c, x - half, y + row, half * 2 + 1, 1, color);
  }
}
function ring(c: Ctx, x: number, y: number, rx: number, ry: number, color: string): void {
  const n = Math.ceil(Math.max(rx, ry) * 8);
  for (let i = 0; i <= n; i++) rect(c, x + Math.cos(i / n * TAU) * rx, y + Math.sin(i / n * TAU) * ry, 1, 1, color);
}
function surface() {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法绘制像素钓点。');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function cloud(c: Ctx, x: number, y: number, w: number): void {
  rect(c, x + 4, y + 5, w - 8, 5, '#c7d3be');
  rect(c, x + 9, y, Math.floor(w * .35), 8, '#e3dfbd');
  rect(c, x + Math.floor(w * .42), y - 2, Math.floor(w * .32), 10, '#f0e5c1');
  rect(c, x, y + 8, w, 3, '#d6dbc1');
}
function pine(c: Ctx, x: number, y: number, height: number, far = false): void {
  const leaf = far ? ['#356963', '#477c6b', '#6d9578'] : ['#183c36', '#28533f', '#456b48', '#738753'];
  rect(c, x - 1, y - height + 8, 3, height - 7, far ? '#506c56' : '#6d6246');
  for (let row = 4; row < height - 2; row += 4) {
    const spread = Math.min(height * .20, 1 + row * .22);
    poly(c, [[x, y - height + row - 5], [x + spread, y - height + row + 7], [x - spread, y - height + row + 7]], leaf[0]);
    rect(c, x - spread + 2, y - height + row + 3, spread - 1, 2, leaf[1]);
    if (row % 12 === 4) rect(c, x - spread + 3, y - height + row + 1, spread - 3, 1, leaf[2]);
  }
}
function reeds(c: Ctx, x: number, y: number, height: number, seed: number): void {
  const tone = hash(x, seed) % 2;
  oval(c, x + 1, y + 1, 8, 2, '#244f44');
  for (let i = 0; i < 5; i++) {
    const dx = (i - 2) * 3, h = height - hash(i, seed) % 8;
    line(c, x + dx, y, x + dx + (i % 2 ? 3 : -2), y - h, tone ? '#718352' : '#5b794c');
    line(c, x + dx, y - h * .3, x + dx + (i % 2 ? 7 : -6), y - h * .7, '#365e41');
    if (i % 2) { rect(c, x + dx + 2, y - h - 4, 2, 7, '#a58d53'); rect(c, x + dx + 2, y - h - 4, 1, 4, '#d2af69'); }
  }
}
function stone(c: Ctx, x: number, y: number, w: number, h: number, seed: number): void {
  oval(c, x + 1, y + h - 1, w * .65, 3, '#2c4d43');
  poly(c, [[x - w / 2, y + 2], [x - w / 2 + 3, y - h / 2], [x + w / 4, y - h / 2 - 2], [x + w / 2, y + 1], [x + w / 2 - 2, y + h / 2], [x - w / 2 + 1, y + h / 2]], '#737d6a');
  poly(c, [[x - w / 2 + 2, y + 1], [x - w / 2 + 4, y - h / 2 + 1], [x + w / 4 - 1, y - h / 2], [x + w / 2 - 2, y + 1], [x - 1, y + 3]], '#b9b48e');
  line(c, x - w / 2 + 5, y - h / 2, x + w / 4 - 2, y - h / 2 - 1, '#d6c89c');
  if (seed % 2) line(c, x, y - h / 2 + 2, x - 3, y + 3, '#8a9276');
}
function bush(c: Ctx, x: number, y: number, seed: number, flowers = false): void {
  oval(c, x, y + 3, 17, 6, '#244e3d');
  for (let i = 0; i < 9; i++) {
    const dx = hash(i, seed) % 27 - 13, dy = hash(seed, i) % 8 - 4;
    oval(c, x + dx, y + dy, 5 + i % 3, 4 + i % 2, ['#345f40', '#4b7849', '#759454'][i % 3]);
    rect(c, x + dx - 2, y + dy - 4, 4, 1, '#a5b46c');
    if (flowers && i % 3 === 0) { rect(c, x + dx, y + dy - 3, 3, 2, '#cb8165'); rect(c, x + dx + 1, y + dy - 4, 1, 4, '#e5ae76'); }
  }
}
function backdrop(c: Ctx): void {
  // Banded colour fields and deliberately shaped clusters, never a gradient.
  rect(c, 0, 0, W, H, '#244f59');
  rect(c, 0, 0, W, 22, '#6e9eaa'); rect(c, 0, 22, W, 28, '#96b7b2'); rect(c, 0, 50, W, 34, '#bdc9ad');
  cloud(c, 56, 12, 46); cloud(c, 188, 4, 63); cloud(c, 348, 20, 40);
  poly(c, [[0, 68], [33, 42], [72, 53], [112, 31], [151, 61], [181, 43], [224, 69], [260, 51], [308, 65], [346, 37], [390, 56], [431, 43], [480, 61], [480, 98], [0, 98]], '#688f88');
  poly(c, [[0, 82], [42, 60], [74, 76], [126, 52], [174, 83], [203, 64], [250, 85], [296, 67], [329, 81], [371, 57], [416, 73], [480, 57], [480, 102], [0, 102]], '#456f64');
  line(c, 105, 38, 112, 31, '#c3cfb1'); line(c, 112, 31, 129, 47, '#8fac9c');
  rect(c, 0, 88, W, 24, '#477c70'); rect(c, 0, 111, W, 34, '#356d6b'); rect(c, 0, 145, W, 42, '#2b6569'); rect(c, 0, 187, W, 61, '#275c63'); rect(c, 0, 248, W, 72, '#234e59');
  // Low far bank and a white stone remnant tie the lake back to the gallery.
  poly(c, [[0, 80], [67, 76], [131, 88], [197, 81], [258, 89], [324, 77], [393, 84], [450, 73], [480, 79], [480, 101], [414, 97], [353, 94], [292, 101], [213, 97], [147, 102], [69, 95], [0, 100]], '#75916b');
  line(c, 0, 99, 69, 94, '#b3bc83'); line(c, 69, 94, 147, 101, '#8ea776'); line(c, 292, 100, 353, 93, '#9cb27e');
  for (const [x, y, h] of [[22, 92, 33], [53, 90, 39], [91, 93, 27], [165, 94, 25], [341, 91, 31], [386, 91, 37], [463, 88, 42]]) pine(c, x, y, h, true);
  rect(c, 405, 65, 29, 23, '#969d83'); rect(c, 408, 62, 23, 26, '#d8ccb0'); rect(c, 406, 61, 28, 4, '#ede0bb');
  rect(c, 408, 67, 4, 18, '#f0e1bb'); rect(c, 426, 67, 5, 18, '#afb198'); rect(c, 416, 73, 7, 13, '#426969');
  rect(c, 402, 87, 36, 3, '#ada48a'); rect(c, 400, 90, 40, 3, '#687c69');
  for (let i = 0; i < 9; i++) reeds(c, 13 + i * 58, 99 + (i % 3) * 2, 10 + i % 4, i);
  // Fixed ripple rows wrap around the shoreline, avoiding screen-wide noise.
  for (let row = 0; row < 30; row++) {
    const y = 106 + row * 7;
    for (let i = 0; i < 8; i++) {
      const x = 12 + (i * 61 + row * 19) % 465;
      const h = hash(i, row);
      rect(c, x, y, 3 + h % 11, 1, ['#498779', '#3a7773', '#427c76', '#376c6c'][h % 4]);
      if (h % 5 === 0) rect(c, x + 4, y + 1, 3, 1, '#255b60');
    }
  }
  // Left grassy bank, its pale contact edge, and a worn route onto the pier.
  const bank: Point[] = [[0, 80], [74, 85], [109, 99], [128, 127], [137, 160], [159, 183], [167, 208], [183, 237], [182, 266], [161, 293], [163, 320], [0, 320]];
  poly(c, bank.map(([x, y]) => [x + 4, y + 4] as Point), '#214c47');
  poly(c, bank.map(([x, y]) => [x + 1, y + 1] as Point), '#a4aa78');
  poly(c, bank, '#6d8b55');
  for (let y = 106; y < 317; y += 12) for (let x = 2; x < 162; x += 17) {
    const edge = y < 160 ? 95 + (y - 106) * .65 : y < 235 ? 130 + (y - 160) * .5 : 160;
    if (x > edge) continue;
    const tone = hash(x, y) % 4;
    poly(c, [[x, y + 2], [x + 8, y], [x + 15, y + 5], [x + 10, y + 9], [x + 1, y + 8]], ['#77985a', '#769058', '#7e9d5b', '#67874f'][tone]);
    if (tone === 1) { line(c, x + 5, y + 7, x + 4, y + 4, '#486f44'); line(c, x + 6, y + 7, x + 8, y + 3, '#a3b86a'); }
  }
  poly(c, [[0, 211], [32, 203], [67, 210], [100, 210], [145, 206], [149, 230], [101, 237], [61, 233], [23, 239], [0, 237]], '#8d8d64');
  poly(c, [[0, 214], [32, 207], [68, 214], [102, 214], [145, 210], [145, 226], [102, 232], [62, 229], [24, 235], [0, 233]], '#c0b58b');
  for (let i = 0; i < 14; i++) {
    const x = i * 12 - 7, y = 216 + hash(i, 8) % 10;
    rect(c, x, y, 10, 5, i % 3 ? '#d3c399' : '#b1aa83'); rect(c, x + 1, y, 8, 1, '#e7d4a6');
  }
  // Opposite reed peninsula encloses the water without encroaching on the cast.
  poly(c, [[480, 161], [455, 167], [435, 180], [431, 206], [440, 229], [458, 245], [480, 250]], '#b3b183');
  poly(c, [[480, 164], [457, 171], [439, 183], [435, 206], [445, 226], [459, 240], [480, 245]], '#6f8b55');
  for (const [x, y, h] of [[443, 188, 22], [450, 209, 29], [466, 233, 24], [475, 183, 35], [170, 269, 24], [150, 181, 19], [134, 143, 21], [105, 103, 18]]) reeds(c, x, y, h, x + y);
  for (const [x, y, w, h] of [[170, 254, 13, 9], [150, 291, 16, 11], [129, 174, 15, 8], [54, 250, 23, 13], [469, 245, 21, 11], [433, 186, 12, 8]]) stone(c, x, y, w, h, x);
  for (const [x, y, seed] of [[35, 181, 2], [100, 275, 3], [49, 294, 7], [120, 123, 9], [470, 220, 13]]) bush(c, x, y, seed, seed % 2 === 0);
  // A few lily clusters make the shallows legible, leaving the gameplay clear.
  for (const [x, y] of [[195, 128], [212, 143], [401, 253], [376, 272], [206, 284]]) {
    oval(c, x, y + 1, 6, 2, '#204d4d'); oval(c, x - 2, y, 5, 2, '#638b5a');
    line(c, x - 5, y - 1, x - 1, y - 1, '#a4b975'); rect(c, x + 5, y + 2, 6, 2, '#538355');
    if (x % 2) { rect(c, x - 1, y - 4, 3, 3, '#d4ae82'); rect(c, x, y - 5, 1, 4, '#e8d5a4'); }
  }
  // Dock support shadow follows its volume; every plank is a deliberate cluster.
  poly(c, [[143, 207], [258, 207], [264, 242], [152, 246]], '#173e48');
  rect(c, 148, 205, 111, 33, '#4c4936'); rect(c, 148, 200, 111, 31, '#7c6343');
  for (let i = 0; i < 11; i++) {
    const x = 149 + i * 10;
    rect(c, x, 201, 9, 28, ['#9b7d50', '#a88958', '#94794f'][i % 3]);
    rect(c, x, 201, 8, 1, '#cfb27a'); rect(c, x + 8, 203, 1, 26, '#665638');
    if (i % 3 === 0) line(c, x + 3, 205, x + 4, 222, '#b99b66');
    rect(c, x + 2, 204, 1, 1, '#4a4a3b'); rect(c, x + 2, 226, 1, 1, '#4a4a3b');
  }
  rect(c, 146, 229, 115, 3, '#cfad70'); rect(c, 147, 232, 113, 4, '#5f5138'); rect(c, 150, 236, 108, 3, '#3b4739');
  for (const x of [153, 205, 253]) {
    rect(c, x, 197, 4, 42, '#5d543b'); rect(c, x, 197, 2, 40, '#b49762'); rect(c, x - 1, 196, 6, 3, '#d3bb82');
    oval(c, x + 2, 244, 5, 2, '#386b66');
  }
  // Woven creel and bait tin sit within reach of the real character.
  rect(c, 213, 217, 13, 11, '#675337'); rect(c, 214, 216, 11, 10, '#b49154');
  ring(c, 219, 215, 5, 3, '#e0c288'); rect(c, 214, 217, 11, 2, '#d6b97b');
  for (let y = 220; y <= 225; y += 3) line(c, 214, y, 224, y, '#79633e');
  for (let x = 216; x <= 224; x += 3) line(c, x, 219, x, 226, '#d0ad6a');
  rect(c, 187, 216, 8, 5, '#536663'); rect(c, 187, 215, 8, 2, '#b4b49a'); rect(c, 188, 216, 6, 1, '#d8cfac');
}

function foreground(c: Ctx): void {
  // Foreground tree frames the scene; it never covers the central action group.
  poly(c, [[0, 111], [17, 110], [29, 159], [23, 209], [14, 260], [0, 264]], '#4b523a');
  line(c, 10, 116, 19, 188, '#8b7950', 3); line(c, 18, 152, 61, 127, '#635c3c', 4);
  for (const [x, y, seed] of [[4, 118, 2], [24, 105, 7], [49, 107, 4], [64, 119, 9], [15, 87, 17], [43, 87, 14]]) bush(c, x, y, seed);
  reeds(c, 41, 318, 37, 16); reeds(c, 104, 321, 25, 12); reeds(c, 463, 320, 37, 9);
  bush(c, 20, 315, 21, true); bush(c, 128, 325, 8);
}

function drawFish(c: Ctx, x: number, y: number, color: string, shadow = false, facing = -1): void {
  c.save(); c.translate(Math.round(x), Math.round(y)); c.scale(facing, 1);
  const dark = shadow ? '#173f49' : '#526963';
  poly(c, [[-10, 0], [-16, -5], [-15, 5]], dark);
  oval(c, -1, 0, 10, 4, dark);
  oval(c, 0, -1, 9, 3, shadow ? '#1e4852' : color);
  poly(c, [[-3, -4], [1, -8], [4, -4]], shadow ? '#173f49' : '#b0a26f');
  if (!shadow) {
    line(c, -6, -3, 4, -3, '#e5d3a1'); line(c, 2, -2, 2, 3, '#7d8b78');
    rect(c, 6, -1, 1, 1, '#183e44'); rect(c, 7, -2, 1, 1, '#f3e0ae');
  }
  c.restore();
}
function splash(c: Ctx, x: number, y: number, pulse: number, large = false): void {
  ring(c, x, y + 3, large ? 12 + pulse * 2 : 7 + pulse, large ? 4 : 2, '#91b7a0');
  for (const [dx, dy, w, h] of [[-10, -5, 2, 3], [-5, -9, 2, 4], [5, -7, 2, 3], [12, -3, 3, 2]]) {
    rect(c, x + dx + (dx < 0 ? -pulse : pulse), y + dy - pulse, w, h, '#d0dbc0');
    rect(c, x + dx, y + dy + 1, 1, 2, '#5e9b91');
  }
}

/** Owns only pixel surfaces. Host supplies its existing RAF clock and state. */
export function createFishingPixelRenderer(): FishingPixelRenderer {
  const back = surface(), front = surface(), frame = surface();
  backdrop(back.ctx); foreground(front.ctx);
  let heroFrames = [ADONIS_A, ADONIS_B].map(def => Grid.ascii(def.rows, def.mirror).render());
  let disposed = false;
  let previousPhase = '';
  let phaseStartedAt = 0;
  return {
    sourceSize: [W, H],
    draw(ctx, width, height, state) {
      if (disposed || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return;
      const now = Number.isFinite(state.animationTime) ? state.animationTime! : Number.isFinite(state.elapsed) ? state.elapsed! : 0;
      if (state.phase !== previousPhase || now < phaseStartedAt) { previousPhase = state.phase; phaseStartedAt = now; }
      const time = state.reducedMotion ? 0 : now;
      const phaseTime = state.reducedMotion ? 2 : Math.max(0, now - phaseStartedAt);
      const phase = state.phase;
      const failed = phase === 'failure' || phase === 'failed';
      const success = phase === 'success';
      const active = phase === 'waiting' || phase === 'bite' || phase === 'reeling';
      const tension = clamp(state.tension), progress = clamp(state.progress), castPower = clamp(state.castPower);
      const surge = state.fishCue === 'surge' || state.fishCue === 'surge-warning';
      const c = frame.ctx;
      c.clearRect(0, 0, W, H); c.drawImage(back.canvas, 0, 0);
      // Sparse, spatially fixed water movement: the lake stays coherent.
      const drift = Math.floor(time * 2) % 4;
      for (const [x, y, w] of [[273, 129, 9], [346, 150, 12], [293, 253, 9], [358, 224, 6], [222, 276, 7], [411, 137, 8], [185, 167, 6]]) {
        rect(c, x + drift, y, w, 1, '#609687'); rect(c, x + drift + 3, y + 2, Math.max(2, w - 4), 1, '#315f63');
      }
      const bob = active && !state.reducedMotion ? Math.floor(time * (state.bobberCue === 'nibble' ? 10 : 2)) % 2 : 0;
      const struggle = phase === 'reeling' && surge && !state.reducedMotion ? Math.round(Math.sin(time * 13) * 3) : 0;
      let floatX = Math.round(310 - (phase === 'reeling' ? progress * 38 : 0) + struggle);
      let floatY = Math.round(202 + (phase === 'reeling' ? progress * 12 : 0) + bob);
      const heroX = 236 + (phase === 'casting' ? -Math.round(castPower * 2) : phase === 'reeling' && state.held ? -1 : 0);
      const heroY = 221 + (phase === 'reeling' && state.held && !state.reducedMotion ? Math.floor(time * 5) % 2 : 0);
      const pose = phase === 'reeling' && state.held && !state.reducedMotion ? Math.floor(time * 5) % 2 : phase === 'casting' && castPower > .45 ? 1 : 0;
      const hero = heroFrames[pose];
      const handX = heroX + 9, handY = heroY - 18;
      let tipX = 278, tipY = 177;
      if (phase === 'casting') { tipX = Math.round(278 - castPower * 18); tipY = Math.round(185 - castPower * 23); }
      else if (phase === 'reeling') { tipX = 278 - Math.round(tension * 8); tipY = 176 + Math.round(tension * 8); }
      else if (!active && !success) { tipX = 277; tipY = 194; }
      if (phase === 'waiting' && phaseTime < .45) {
        const flight = Math.min(1, phaseTime / .45);
        floatX = Math.round(tipX + (floatX - tipX) * flight);
        floatY = Math.round(tipY + (floatY - tipY) * flight - Math.sin(flight * Math.PI) * 15);
      }
      if (active) {
        const shadowX = floatX + 8 + (surge ? struggle * 2 : Math.round(Math.sin(time * 1.2) * 3));
        drawFish(c, shadowX, floatY + 13, '#345e63', true);
        ring(c, floatX, floatY + 3, 9 + bob * 2, 3, '#558e81');
        if (phase === 'reeling') {
          ring(c, shadowX, floatY + 9, 11, 3, '#3d7970');
          if (surge) splash(c, floatX, floatY, Math.floor(time * 6) % 2, true);
        }
      } else if (failed && phaseTime < 1.4) {
        drawFish(c, 310 + Math.min(38, Math.round(phaseTime * 24)), 211, '#345e63', true);
        ring(c, 310, 205, 8 + Math.round(phaseTime * 8), 3, '#5d8e80');
      }
      // Real game sprite, rendered unchanged; arm extension and rod show the pose.
      oval(c, heroX + 1, heroY + 1, 12, 3, '#4c543b');
      c.drawImage(hero, heroX - hero.width, heroY - hero.height * 2, hero.width * 2, hero.height * 2);
      rect(c, handX - 2, handY - 1, 5, 3, '#d0a37b'); rect(c, handX, handY - 1, 2, 1, '#f0c79c');
      line(c, handX - 3, handY + 4, handX + 4, handY - 3, '#655338', 2);
      const bendX = Math.round((handX + tipX) / 2) - (phase === 'reeling' ? Math.round(tension * 3) : 0);
      const bendY = Math.round((handY + tipY) / 2) - 5;
      line(c, handX, handY, bendX, bendY, '#5a4e38', 2); line(c, bendX, bendY, tipX, tipY, '#6f603d', 2);
      line(c, handX, handY - 1, bendX, bendY - 1, '#d5bb7d'); line(c, bendX, bendY - 1, tipX, tipY - 1, '#e2cc91');
      rect(c, handX + 3, handY - 3, 3, 4, '#8b8152'); rect(c, handX + 3, handY - 3, 2, 1, '#ead59a');
      if (active) {
        const lineColor = phase === 'reeling' && tension > .75 ? '#e8b76a' : '#c6d2ae';
        const sagX = Math.round((tipX + floatX) / 2), sagY = Math.round((tipY + floatY) / 2) + (state.held ? 0 : 4);
        line(c, tipX + 1, tipY, sagX, sagY, lineColor); line(c, sagX, sagY, floatX, floatY - 3, lineColor);
        const submerged = phase === 'bite' ? 5 : state.bobberCue === 'nibble' ? bob + 1 : 0;
        line(c, floatX, floatY - 8 + submerged, floatX, floatY + 2, '#f0dfb0');
        rect(c, floatX - 2, floatY - 5 + submerged, 5, 5 - Math.min(3, submerged), '#a74d3f');
        rect(c, floatX - 1, floatY - 5 + submerged, 2, 3 - Math.min(2, submerged), '#e6925d');
        rect(c, floatX - 2, floatY + submerged, 5, 2, '#e5d5ac');
        ring(c, floatX, floatY + 4, 6 + bob, 2, '#97baa1');
        if (phase === 'bite') {
          splash(c, floatX, floatY, Math.floor(time * 5) % 2);
          // Pixel exclamation is a scene cue; all semantic instructions stay DOM.
          rect(c, floatX - 3, floatY - 29, 7, 14, '#233f3d');
          rect(c, floatX - 1, floatY - 28, 3, 7, '#f2d17d'); rect(c, floatX - 1, floatY - 18, 3, 2, '#f2d17d');
        }
      } else if (success) {
        const landing = Math.max(0, 1 - phaseTime / 1.1);
        const fishX = Math.round(269 - (1 - landing) * 46), fishY = Math.round(211 - Math.sin(landing * Math.PI) * 18);
        const color = state.fishColor && /^#[a-f\d]{3,8}$/i.test(state.fishColor) ? state.fishColor : '#c4bc8b';
        if (landing > 0) { line(c, tipX, tipY, fishX, fishY - 3, '#d9d6ad'); drawFish(c, fishX, fishY, color); }
        else { drawFish(c, 220, 211, color); rect(c, 212, 215, 14, 3, '#d6b97b'); }
        if (phaseTime < 1.6) {
          const rise = Math.floor(phaseTime * 6);
          for (const [dx, dy] of [[-12, -3], [5, -9], [15, 1]]) { rect(c, heroX + dx, heroY - 42 + dy - rise, 1, 3, '#f0cd76'); rect(c, heroX + dx - 1, heroY - 41 + dy - rise, 3, 1, '#f0cd76'); }
        }
      } else {
        // A cancelled/failed attempt visibly has its line out of the water.
        line(c, tipX, tipY, tipX + 2, tipY + 10, '#c8cfaa');
        line(c, tipX + 2, tipY + 10, tipX + 5, tipY + 10, '#aeb89d');
        if (failed) { rect(c, tipX + 7, tipY + 13, 1, 3, '#d6b47c'); rect(c, tipX + 6, tipY + 18, 2, 1, '#d6b47c'); }
      }
      c.drawImage(front.canvas, 0, 0);
      // Aspect-cover camera: only scenery is cropped. The action group around
      // (270,198) is safe in 390x600 portrait and 844x200 short landscape stages.
      const targetW = Math.max(1, Math.round(width)), targetH = Math.max(1, Math.round(height));
      const scale = Math.max(targetW / W, targetH / H);
      const sourceW = Math.min(W, Math.max(1, Math.round(targetW / scale)));
      const sourceH = Math.min(H, Math.max(1, Math.round(targetH / scale)));
      const sourceX = Math.max(0, Math.min(W - sourceW, Math.round(270 - sourceW / 2)));
      const sourceY = Math.max(0, Math.min(H - sourceH, Math.round(198 - sourceH / 2)));
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(frame.canvas, sourceX, sourceY, sourceW, sourceH, 0, 0, targetW, targetH);
      ctx.restore();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const canvas of [back.canvas, front.canvas, frame.canvas, ...heroFrames]) canvas.width = canvas.height = 1;
      heroFrames = [];
    },
  };
}
