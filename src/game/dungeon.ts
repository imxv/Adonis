import { Rng } from '../core/rng';
import { DIRS, DIR_VEC, type Dir } from './dirs';
import { generateFloor, type Room } from './floor';

export const T = 16;
export const CELL_W = 30;
export const CELL_H = 22;

export const VOID = 0;
export const FLOOR = 1;
export const WALL = 2;

export type Shape = 'rect' | 'cut' | 'cross' | 'L' | 'pillars' | 'ring';

/** A room carved into the tile map. Bounds are in tiles, [x0, x1) × [y0, y1). */
export interface DRoom extends Room {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  shape: Shape;
  /** Tiles just outside the room edge where a corridor joins: closed gates go here. */
  gates: { dir: Dir; tiles: [number, number][] }[];
}

export interface Dungeon {
  w: number;
  h: number;
  tiles: Uint8Array;
  blocked: Set<number>;
  rooms: DRoom[];
  byId: Map<string, DRoom>;
  start: DRoom;
  boss: DRoom;
  /** World positions of wall torches, for drawing and lighting. */
  torches: [number, number][];
}

const SIZES: Record<Room['type'], [number, number, number, number]> = {
  start: [13, 13, 11, 11],
  treasure: [13, 15, 11, 11],
  combat: [15, 23, 11, 15],
  horde: [21, 23, 15, 17],
  boss: [25, 25, 17, 17],
};

/**
 * Soul Knight style dungeon: rooms of varied shapes laid out on the Isaac room graph,
 * joined by three-tile corridors and surrounded by walls and void.
 */
export function generateDungeon(rng: Rng, level: number): Dungeon {
  const floor = generateFloor(rng, level);
  const cells = [...floor.rooms.values()];
  const minX = Math.min(...cells.map((r) => r.gx));
  const minY = Math.min(...cells.map((r) => r.gy));
  const maxX = Math.max(...cells.map((r) => r.gx));
  const maxY = Math.max(...cells.map((r) => r.gy));
  const w = (maxX - minX + 1) * CELL_W;
  const h = (maxY - minY + 1) * CELL_H;
  const tiles = new Uint8Array(w * h);
  const set = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < w && y < h) tiles[y * w + x] = v;
  };
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? VOID : tiles[y * w + x]);

  const rooms: DRoom[] = [];
  const byId = new Map<string, DRoom>();
  for (const r of cells) {
    const [wMin, wMax, hMin, hMax] = SIZES[r.type];
    let rw = rng.int(wMin, wMax);
    let rh = rng.int(hMin, hMax);
    if (rw % 2 === 0) rw++;
    if (rh % 2 === 0) rh++;
    const cx = (r.gx - minX) * CELL_W + Math.floor(CELL_W / 2);
    const cy = (r.gy - minY) * CELL_H + Math.floor(CELL_H / 2);
    const x0 = cx - Math.floor(rw / 2);
    const y0 = cy - Math.floor(rh / 2);
    const shape: Shape = r.type === 'combat' ? rng.pick(['rect', 'cut', 'cross', 'L', 'pillars', 'ring'] as Shape[]) : r.type === 'horde' ? rng.pick(['rect', 'cut', 'pillars'] as Shape[]) : r.type === 'boss' ? 'cut' : 'rect';
    const room: DRoom = { ...r, x0, y0, x1: x0 + rw, y1: y0 + rh, shape, gates: [] };
    carve(room, set, rng);
    rooms.push(room);
    byId.set(r.id, room);
  }

  // Corridors along the shared cell centre lines.
  for (const a of rooms) {
    for (const d of ['right', 'down'] as Dir[]) {
      if (!a.doors[d]) continue;
      const b = byId.get(`${a.gx + DIR_VEC[d][0]},${a.gy + DIR_VEC[d][1]}`);
      if (!b) continue;
      const acx = Math.floor((a.x0 + a.x1) / 2);
      const acy = Math.floor((a.y0 + a.y1) / 2);
      if (d === 'right') {
        for (let x = a.x1; x < b.x0; x++) for (let k = -1; k <= 1; k++) set(x, acy + k, FLOOR);
        a.gates.push({ dir: 'right', tiles: [-1, 0, 1].map((k) => [a.x1, acy + k]) });
        b.gates.push({ dir: 'left', tiles: [-1, 0, 1].map((k) => [b.x0 - 1, acy + k]) });
      } else {
        for (let y = a.y1; y < b.y0; y++) for (let k = -1; k <= 1; k++) set(acx + k, y, FLOOR);
        a.gates.push({ dir: 'down', tiles: [-1, 0, 1].map((k) => [acx + k, a.y1]) });
        b.gates.push({ dir: 'up', tiles: [-1, 0, 1].map((k) => [acx + k, b.y0 - 1]) });
      }
    }
  }

  // North faces are two tiles tall; everything else gets a one-tile wall rim.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (get(x, y) !== FLOOR) continue;
      if (get(x, y - 1) === VOID) {
        set(x, y - 1, WALL);
        if (get(x, y - 2) === VOID) set(x, y - 2, WALL);
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (get(x, y) !== VOID) continue;
      for (let dy = -1; dy <= 1 && get(x, y) === VOID; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (get(x + dx, y + dy) === FLOOR) {
            set(x, y, WALL);
            break;
          }
        }
      }
    }
  }

  // Torches on wall faces, spaced out so every room gets a few pools of light.
  const torches: [number, number][] = [];
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (get(x, y) !== WALL || get(x, y + 1) !== FLOOR || get(x - 1, y) !== WALL || get(x + 1, y) !== WALL) continue;
      if (!rng.chance(0.16)) continue;
      if (torches.some(([tx, ty]) => Math.abs(tx - (x * T + 8)) < T * 5 && Math.abs(ty - (y * T + 4)) < T * 3)) continue;
      torches.push([x * T + 8, y * T + 4]);
    }
  }

  const start = byId.get(floor.start.id)!;
  const boss = byId.get(floor.boss.id)!;
  return { w, h, tiles, blocked: new Set(), rooms, byId, start, boss, torches };
}

function carve(r: DRoom, set: (x: number, y: number, v: number) => void, rng: Rng) {
  const rw = r.x1 - r.x0;
  const rh = r.y1 - r.y0;
  const midX = Math.floor(rw / 2);
  const midY = Math.floor(rh / 2);
  const inside = (lx: number, ly: number): boolean => {
    const onMid = Math.abs(lx - midX) <= 1 || Math.abs(ly - midY) <= 1;
    switch (r.shape) {
      case 'cut': {
        const c = Math.min(4, Math.floor(Math.min(rw, rh) / 4));
        const dx = Math.min(lx, rw - 1 - lx);
        const dy = Math.min(ly, rh - 1 - ly);
        return dx + dy >= c;
      }
      case 'cross': {
        const cw = Math.floor(rw * 0.28);
        const ch = Math.floor(rh * 0.28);
        const inCorner = (lx < cw || lx >= rw - cw) && (ly < ch || ly >= rh - ch);
        return !inCorner;
      }
      case 'L': {
        const qx = Math.floor(rw * 0.42);
        const qy = Math.floor(rh * 0.42);
        return onMid || !(lx >= rw - qx && ly < qy);
      }
      default:
        return true;
    }
  };
  for (let ly = 0; ly < rh; ly++) for (let lx = 0; lx < rw; lx++) if (inside(lx, ly)) set(r.x0 + lx, r.y0 + ly, FLOOR);
  // Inner walls: pillars or a central block to fight around.
  if (r.shape === 'pillars') {
    for (const [fx, fy] of [
      [0.28, 0.3],
      [0.72, 0.3],
      [0.28, 0.7],
      [0.72, 0.7],
    ]) {
      const px = r.x0 + Math.floor(rw * fx);
      const py = r.y0 + Math.floor(rh * fy);
      set(px, py, WALL);
      set(px + 1, py, WALL);
      set(px, py - 1, WALL);
      set(px + 1, py - 1, WALL);
    }
  } else if (r.shape === 'ring') {
    const bw = Math.max(3, Math.floor(rw * 0.24));
    const bh = Math.max(2, Math.floor(rh * 0.2));
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) set(r.x0 + midX - Math.floor(bw / 2) + x, r.y0 + midY - Math.floor(bh / 2) + y, WALL);
  }
  void rng;
}

// ---------------------------------------------------------------- queries

export function tileAt(d: Dungeon, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= d.w || ty >= d.h) return VOID;
  return d.tiles[ty * d.w + tx];
}

export function solidTile(d: Dungeon, tx: number, ty: number): boolean {
  return tileAt(d, tx, ty) !== FLOOR || d.blocked.has(ty * d.w + tx);
}

export function solidAt(d: Dungeon, x: number, y: number): boolean {
  return solidTile(d, Math.floor(x / T), Math.floor(y / T));
}

/** Push a circle out of solid tiles. */
export function collide(d: Dungeon, x: number, y: number, r: number): [number, number] {
  for (let pass = 0; pass < 2; pass++) {
    const tx0 = Math.floor((x - r) / T);
    const tx1 = Math.floor((x + r) / T);
    const ty0 = Math.floor((y - r) / T);
    const ty1 = Math.floor((y + r) / T);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!solidTile(d, tx, ty)) continue;
        const nx = Math.max(tx * T, Math.min(x, tx * T + T));
        const ny = Math.max(ty * T, Math.min(y, ty * T + T));
        const dx = x - nx;
        const dy = y - ny;
        const dd = dx * dx + dy * dy;
        if (dd >= r * r) continue;
        if (dd > 0.0001) {
          const dist = Math.sqrt(dd);
          x += (dx / dist) * (r - dist);
          y += (dy / dist) * (r - dist);
        } else {
          // Centre inside the tile: leave along the shallowest axis.
          const left = x - tx * T;
          const right = tx * T + T - x;
          const up = y - ty * T;
          const down = ty * T + T - y;
          const m = Math.min(left, right, up, down);
          if (m === left) x = tx * T - r;
          else if (m === right) x = tx * T + T + r;
          else if (m === up) y = ty * T - r;
          else y = ty * T + T + r;
        }
      }
    }
  }
  return [x, y];
}

/** March a ray until it hits a solid tile. Returns the travelled length and which axis it hit. */
export function raycast(d: Dungeon, x: number, y: number, dx: number, dy: number, maxLen: number): { len: number; axis: 'x' | 'y' | null } {
  const step = 3;
  let px = x;
  let py = y;
  for (let len = 0; len < maxLen; len += step) {
    const nx = px + dx * step;
    const ny = py + dy * step;
    if (solidAt(d, nx, ny)) {
      const hx = solidAt(d, nx, py);
      const hy = solidAt(d, px, ny);
      return { len, axis: hx && !hy ? 'x' : !hx && hy ? 'y' : 'x' };
    }
    px = nx;
    py = ny;
  }
  return { len: maxLen, axis: null };
}

export function roomAt(d: Dungeon, x: number, y: number, inset = 1): DRoom | undefined {
  const tx = x / T;
  const ty = y / T;
  return d.rooms.find((r) => tx >= r.x0 + inset && tx < r.x1 - inset && ty >= r.y0 + inset && ty < r.y1 - inset);
}

export function roomCenter(r: DRoom): [number, number] {
  return [((r.x0 + r.x1) / 2) * T, ((r.y0 + r.y1) / 2) * T];
}

export function randomFloorIn(d: Dungeon, r: DRoom, rng: Rng, awayX: number, awayY: number, minDist: number): [number, number] {
  for (let i = 0; i < 120; i++) {
    // Relax the distance rule halfway through, rather than fall back to the centre (a wall in ring rooms).
    if (i === 60) minDist *= 0.5;
    const tx = rng.int(r.x0 + 1, r.x1 - 2);
    const ty = rng.int(r.y0 + 1, r.y1 - 2);
    if (solidTile(d, tx, ty) || solidTile(d, tx - 1, ty) || solidTile(d, tx + 1, ty) || solidTile(d, tx, ty - 1) || solidTile(d, tx, ty + 1)) continue;
    const x = tx * T + T / 2;
    const y = ty * T + T / 2;
    if ((x - awayX) ** 2 + (y - awayY) ** 2 < minDist * minDist) continue;
    return [x, y];
  }
  return roomCenter(r);
}

export { DIRS };
