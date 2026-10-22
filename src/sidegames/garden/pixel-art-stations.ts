import { GARDEN_STATIONS } from './pixel-contract';
import type { SupplyId } from '../../meta/types';

type Ctx = CanvasRenderingContext2D;
type StationId = typeof GARDEN_STATIONS[number]['id'];
const STONE = { shade: '#746d68', edge: '#a99c81', mid: '#c7b99b', light: '#e6d8b7', shine: '#f4e8c9' };
const WOOD = { dark: '#4a342e', shade: '#684436', mid: '#966444', light: '#b98451', edge: '#d3a36b' };
const GOLD = { dark: '#675439', mid: '#ab873f', light: '#d8b965', shine: '#f1d98c' };

function rect(c: Ctx, x: number, y: number, w: number, h: number, color: string) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}
function line(c: Ctx, ax: number, ay: number, bx: number, by: number, color: string, width = 1) {
  const count = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
  for (let i = 0; i <= count; i++) rect(c, ax + (bx - ax) * i / count, ay + (by - ay) * i / count, width, width, color);
}
function poly(c: Ctx, points: readonly (readonly [number, number])[], color: string) {
  const top = Math.ceil(Math.min(...points.map(p => p[1])));
  const bottom = Math.floor(Math.max(...points.map(p => p[1])));
  for (let y = top; y <= bottom; y++) {
    const xs: number[] = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j], b = points[i];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) rect(c, Math.ceil(xs[i]), y, Math.floor(xs[i + 1]) - Math.ceil(xs[i]) + 1, 1, color);
  }
}
function oval(c: Ctx, x: number, y: number, rx: number, ry: number, color: string) {
  for (let row = -Math.ceil(ry); row <= ry; row++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - row * row / (ry * ry))));
    rect(c, x - half, y + row, half * 2 + 1, 1, color);
  }
}
function station(id: StationId) {
  const value = GARDEN_STATIONS.find(item => item.id === id)!;
  return { x: Math.round(value.x / 2), y: Math.round(value.y / 2), w: Math.round(value.width / 2), h: Math.round(value.height / 2) };
}
function leaf(c: Ctx, x: number, y: number, direction: number, color: string) {
  poly(c, [[x, y], [x + direction * 4, y - 3], [x + direction * 5, y], [x + direction, y + 2]], color);
}

function journal(c: Ctx) {
  const { x, y, w, h } = station('journal');
  oval(c, x + w / 2, y + h - 2, w / 2 - 1, 3, '#4f5e444d');
  // A broad limestone writing slab rests on two carved supports.
  rect(c, x + 7, y + 13, 7, h - 17, STONE.shade);
  rect(c, x + 8, y + 15, 4, h - 19, STONE.mid);
  rect(c, x + w - 14, y + 13, 7, h - 17, STONE.shade);
  rect(c, x + w - 13, y + 15, 4, h - 19, STONE.mid);
  rect(c, x + 5, y + h - 5, 12, 3, STONE.edge);
  rect(c, x + w - 17, y + h - 5, 12, 3, STONE.edge);
  rect(c, x + 6, y + h - 5, 10, 1, STONE.light);
  rect(c, x + w - 16, y + h - 5, 10, 1, STONE.light);
  poly(c, [[x + 3, y + 6], [x + w - 5, y + 6], [x + w - 1, y + 14], [x, y + 14]], STONE.light);
  rect(c, x, y + 14, w, 4, STONE.shade);
  rect(c, x + 1, y + 14, w - 3, 1, STONE.shine);
  rect(c, x + 3, y + 18, w - 7, 2, STONE.edge);
  for (const sx of [x + 8, x + w - 12]) {
    rect(c, sx, y + 20, 3, 4, '#8b8170');
    rect(c, sx + 1, y + 21, 1, 2, STONE.light);
  }
  // Leather cover and individual page planes make the open book readable.
  poly(c, [[x + 14, y + 2], [x + 25, y + 4], [x + 36, y + 2], [x + 38, y + 13], [x + 25, y + 15], [x + 12, y + 13]], WOOD.dark);
  poly(c, [[x + 15, y + 1], [x + 25, y + 4], [x + 25, y + 13], [x + 14, y + 11]], '#e6d7ac');
  poly(c, [[x + 25, y + 4], [x + 35, y + 1], [x + 36, y + 11], [x + 25, y + 13]], '#f8edcd');
  line(c, x + 25, y + 4, x + 25, y + 13, '#b0956a');
  for (let i = 0; i < 3; i++) {
    line(c, x + 17, y + 5 + i * 2, x + 22, y + 6 + i * 2, '#9f9272');
    line(c, x + 28, y + 6 + i * 2, x + 33, y + 5 + i * 2, '#a99c77');
  }
  rect(c, x + 23, y + 12, 2, 4, '#8e4a43');
  // Ink well, folded scroll and a single pale quill.
  rect(c, x + 4, y + 9, 5, 4, '#304c53');
  rect(c, x + 5, y + 8, 3, 2, '#1d3440');
  rect(c, x + 5, y + 10, 1, 2, '#63918f');
  line(c, x + 7, y + 9, x + 11, y + 2, '#665847');
  poly(c, [[x + 9, y + 5], [x + 9, y + 1], [x + 12, y], [x + 12, y + 3]], '#e9e9cc');
  rect(c, x + 39, y + 8, 7, 4, '#d6c49c');
  rect(c, x + 39, y + 7, 2, 5, '#f0deb8');
  rect(c, x + 45, y + 8, 1, 4, '#af946d');
}

function bottle(c: Ctx, x: number, y: number, color: string, light: string) {
  rect(c, x + 1, y, 3, 2, '#9b7852');
  rect(c, x + 1, y + 2, 3, 2, light);
  rect(c, x, y + 4, 5, 7, '#3c514d');
  rect(c, x + 1, y + 4, 3, 6, color);
  rect(c, x + 1, y + 5, 1, 3, light);
  rect(c, x + 2, y + 8, 2, 1, '#d5ce9d');
}

function craft(c: Ctx) {
  const { x, y, w, h } = station('craft');
  oval(c, x + w / 2, y + h - 2, w / 2 - 1, 3, '#4f5e444d');
  // Terracotta and oak workbench: legs, apron, drawer and substantial stone top.
  for (const sx of [x + 5, x + w - 10]) {
    rect(c, sx, y + 18, 6, h - 21, WOOD.dark);
    rect(c, sx + 1, y + 19, 3, h - 23, WOOD.light);
    rect(c, sx - 1, y + h - 4, 8, 2, WOOD.shade);
  }
  rect(c, x + 7, y + 29, w - 14, 3, WOOD.shade);
  rect(c, x + 7, y + 29, w - 14, 1, WOOD.light);
  rect(c, x + 3, y + 18, w - 6, 9, '#a56a4b');
  rect(c, x + 5, y + 20, w - 10, 5, '#c18b60');
  rect(c, x + 7, y + 21, 17, 3, '#8d624c');
  rect(c, x + 10, y + 21, 12, 1, '#d9a778');
  rect(c, x + 26, y + 20, 2, 6, '#936246');
  rect(c, x + 13, y + 23, 3, 1, GOLD.light);
  rect(c, x + 33, y + 23, 3, 1, GOLD.light);
  poly(c, [[x + 3, y + 10], [x + w - 4, y + 10], [x + w - 1, y + 16], [x, y + 16]], STONE.light);
  rect(c, x, y + 16, w, 3, STONE.shade);
  rect(c, x + 1, y + 16, w - 3, 1, STONE.shine);
  line(c, x + 5, y + 13, x + 20, y + 12, STONE.mid);
  line(c, x + 29, y + 12, x + 42, y + 14, STONE.mid);
  // Left mortar: a dark hollow, glazed lip and diagonally rested pestle.
  oval(c, x + 11, y + 12, 7, 3, '#747966');
  rect(c, x + 6, y + 12, 10, 4, '#9b9b7d');
  oval(c, x + 11, y + 11, 7, 3, '#c1c3a0');
  oval(c, x + 11, y + 11, 5, 2, '#5a6c58');
  rect(c, x + 6, y + 13, 2, 2, '#dcddba');
  line(c, x + 12, y + 10, x + 18, y + 3, '#69705d', 2);
  line(c, x + 13, y + 9, x + 18, y + 3, '#d1cfac');
  bottle(c, x + 25, y + 3, '#789b64', '#c2d099');
  bottle(c, x + 33, y + 1, '#be963f', '#e8cf7d');
  bottle(c, x + 42, y + 3, '#6487b3', '#b8d2dd');
  // Tied herbs drape over the far-left side without extending the hit region.
  for (let i = 0; i < 4; i++) {
    const sx = x + 2 + i * 2;
    line(c, sx, y + 6, sx + 1, y + 16, '#4b6b43');
    leaf(c, sx + 1, y + 8 + i % 2, 1, i % 2 ? '#7b9959' : '#517b4a');
  }
  rect(c, x + 1, y + 13, 7, 1, '#c5ad6b');
}

function bagBench(c: Ctx) {
  const { x, y, w, h } = station('bag');
  oval(c, x + w / 2, y + h - 2, w / 2 - 2, 3, '#4f5e444d');
  for (const sx of [x + 6, x + w - 11]) {
    rect(c, sx, y + 18, 5, 8, WOOD.dark);
    rect(c, sx + 1, y + 19, 2, 6, WOOD.light);
  }
  rect(c, x + 3, y + 17, w - 6, 5, WOOD.dark);
  rect(c, x + 2, y + 15, w - 4, 3, WOOD.light);
  rect(c, x + 3, y + 15, w - 6, 1, WOOD.edge);
  for (let i = 0; i < 3; i++) rect(c, x + 6, y + 17 + i, w - 12, 1, i % 2 ? WOOD.shade : WOOD.mid);
  // Tiny copper travel cup and neatly folded cloth stay on the bench.
  rect(c, x + 5, y + 10, 6, 5, '#a56b49');
  rect(c, x + 6, y + 10, 4, 1, '#dfb383');
  rect(c, x + 10, y + 11, 2, 3, '#805238');
  rect(c, x + w - 12, y + 11, 7, 4, '#96acaa');
  rect(c, x + w - 12, y + 11, 7, 1, '#c5d3b9');
  rect(c, x + w - 11, y + 13, 6, 1, '#6c8e8d');
}

/** Draw the entire small satchel footprint from the current read-only slot value. */
export function drawGardenBag(ctx: Ctx, packedSupply: SupplyId | null): void {
  const { x, y, w } = station('bag');
  const left = x + Math.floor(w / 2) - 11;
  const top = y + 1;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  // Shoulder strap, layered leather body, folded flap and metal clasp.
  line(ctx, left + 4, top + 5, left + 5, top, WOOD.dark, 2);
  line(ctx, left + 5, top, left + 17, top, WOOD.dark, 2);
  line(ctx, left + 17, top, left + 19, top + 5, WOOD.dark, 2);
  rect(ctx, left + 1, top + 5, 23, 12, '#63462f');
  rect(ctx, left + 2, top + 5, 20, 11, '#b2844d');
  rect(ctx, left + 3, top + 6, 17, 8, '#c69a5a');
  rect(ctx, left + 21, top + 7, 2, 8, '#8e633c');
  poly(ctx, [[left + 2, top + 4], [left + 21, top + 4], [left + 20, top + 10], [left + 12, top + 12], [left + 3, top + 10]], '#a57443');
  line(ctx, left + 3, top + 5, left + 20, top + 5, '#dbb477');
  rect(ctx, left + 11, top + 9, 3, 6, WOOD.dark);
  rect(ctx, left + 11, top + 10, 3, 3, GOLD.light);
  rect(ctx, left + 12, top + 11, 1, 1, WOOD.shade);
  rect(ctx, left, top + 9, 3, 7, '#956b42');
  rect(ctx, left + 1, top + 10, 1, 4, '#d0a46a');
  // Exactly one supply token is visible; there is no UI-owned stock count.
  if (packedSupply === 'olive-draught') {
    bottle(ctx, left + 18, top - 1, '#7f9a59', '#c6d68c');
    leaf(ctx, left + 20, top + 4, 1, '#e8deae');
  } else if (packedSupply === 'laurel-thread') {
    rect(ctx, left + 18, top, 4, 8, '#85743d');
    for (let i = 0; i < 3; i++) {
      leaf(ctx, left + 20, top + 2 + i * 2, i % 2 ? -1 : 1, '#d8c77a');
    }
    rect(ctx, left + 19, top + 7, 3, 1, '#f0dfa2');
  } else if (packedSupply === 'iris-vial') {
    bottle(ctx, left + 18, top - 1, '#7083b1', '#bbd2e2');
    rect(ctx, left + 21, top + 4, 2, 2, '#c8b7dc');
  }
  ctx.restore();
}

function exit(c: Ctx) {
  const { x, y, w, h } = station('exit');
  // A floor-level stone threshold leads back to the gallery, leaving spawn clear.
  rect(c, x + 2, y + 1, w - 4, h - 2, '#8c8a78');
  poly(c, [[x + 4, y], [x + w - 5, y], [x + w - 1, y + 10], [x, y + 10]], STONE.light);
  rect(c, x + 2, y + 10, w - 4, 3, STONE.shade);
  rect(c, x + 1, y + 13, w - 2, 7, STONE.mid);
  rect(c, x + 1, y + 13, w - 2, 1, STONE.shine);
  rect(c, x, y + 20, w, 3, STONE.shade);
  rect(c, x, y + 23, w, h - 23, '#d8c9a8');
  rect(c, x + 1, y + 23, w - 2, 1, STONE.shine);
  // Fine inlaid borders and a blue/gold laurel medallion identify the doorway.
  rect(c, x + 5, y + 3, w - 10, 1, GOLD.mid);
  rect(c, x + 7, y + 8, w - 14, 1, GOLD.light);
  for (let sx = x + 7; sx < x + w - 8; sx += 7) {
    line(c, sx, y + 4, sx + 4, y + 4, GOLD.dark);
    line(c, sx + 4, y + 4, sx + 4, y + 7, GOLD.dark);
    line(c, sx + 4, y + 7, sx + 1, y + 7, GOLD.dark);
  }
  oval(c, x + w / 2, y + 17, 13, 4, '#46757e');
  oval(c, x + w / 2, y + 17, 10, 3, '#365d6b');
  rect(c, x + w / 2 - 1, y + 14, 3, 5, GOLD.light);
  rect(c, x + w / 2 - 3, y + 16, 7, 1, GOLD.shine);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const sx = x + w / 2 + side * (8 - i), sy = y + 19 - i;
      line(c, sx, sy, sx + side * 3, sy - 1, '#c9be74');
    }
  }
  // Discrete masonry joints maintain scale instead of using a large flat slab.
  for (const [sx, yy] of [[x + 19, y + 14], [x + w - 20, y + 14], [x + 23, y + 24], [x + w - 24, y + 24]]) {
    line(c, sx, yy, sx - 1, yy + 6, '#a79980');
    rect(c, sx + 1, yy, 1, 4, '#ecdcbb');
  }
}

/** Static station furniture. Called once when the garden's rear cache is made. */
export function drawGardenStations(ctx: Ctx): void {
  for (const { id } of GARDEN_STATIONS) drawGardenStation(ctx, id);
}

/** The caller may cache each object separately and depth-sort it against the hero. */
export function drawGardenStation(ctx: Ctx, id: StationId): void {
  ctx.save(); ctx.imageSmoothingEnabled = false;
  if (id === 'journal') journal(ctx);
  else if (id === 'craft') craft(ctx);
  else if (id === 'bag') bagBench(ctx);
  else if (id === 'exit') exit(ctx);
  ctx.restore();
}
