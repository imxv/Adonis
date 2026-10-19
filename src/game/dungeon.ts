import { Rng } from '../core/rng';
import { DIRS, DIR_VEC, type Dir } from './dirs';
import { generateFloor, type Room } from './floor';

export const T = 16;
export const CELL_W = 30;
export const CELL_H = 22;

export const VOID = 0;
export const FLOOR = 1;
export const WALL = 2;
/** A standing biome piece (statue, tree, lantern): solid like a wall, but drawn as a sprite on the floor. */
export const PROP = 3;

export type Shape = 'rect' | 'cut' | 'cross' | 'L' | 'pillars' | 'ring';

export type TrapKind = 'spikes' | 'saw' | 'arrows' | 'vent' | 'falling' | 'beam';

/** Spikes/falling use individual tiles; saws and directed traps use two track endpoints. */
export interface TrapPlan {
  kind: TrapKind;
  tiles: [number, number][];
  period: number;
  phase: number;
  direction?: [number, number];
}

export interface CurrentPlan {
  kind: 'wind' | 'water' | 'conveyor';
  tiles: [number, number][];
  direction: [number, number];
}

export interface PropPlan {
  kind: 'barrel' | 'crate' | 'pillar';
  x: number;
  y: number;
}

/** A biome piece standing on tile (x, y); v picks which of the biome's three pieces. */
export interface DecorPlan {
  x: number;
  y: number;
  v: number;
}

/** A room carved into the tile map. Bounds are in tiles, [x0, x1) × [y0, y1). */
export interface DRoom extends Room {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  shape: Shape;
  /** Tiles just outside the room edge where a corridor joins: closed gates go here. */
  gates: { dir: Dir; tiles: [number, number][] }[];
  props: PropPlan[];
  traps: TrapPlan[];
  decor: DecorPlan[];
  currents?: CurrentPlan[];
  /** Safe, spread-out tile centres for the optional room's timed route. */
  challengeTargets?: [number, number][];
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
  challenge: [15, 23, 11, 15],
  horde: [21, 23, 15, 17],
  boss: [25, 25, 17, 17],
};

/**
 * Soul Knight style dungeon: rooms of varied shapes laid out on the Isaac room graph,
 * joined by three-tile corridors and surrounded by walls and void.
 */
export function generateDungeon(rng: Rng, level: number, trapMul = 1): Dungeon {
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
    const room: DRoom = { ...r, x0, y0, x1: x0 + rw, y1: y0 + rh, shape, gates: [], props: [], traps: [], decor: [] };
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

  // Room interiors: cover to fight around, props, and traps (more of them on deeper floors).
  for (const r of rooms) decorate(r, rng, level, trapMul, get, set);

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

// ---------------------------------------------------------------- room interiors

type Cell = [number, number];

const block = (bw: number, bh: number): Cell[] => {
  const out: Cell[] = [];
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) out.push([i, j]);
  return out;
};

/** Cover pieces, drawn for the lower-right quadrant (i grows outward to the right, j outward downward). */
const PIECES: Record<string, Cell[]> = {
  pillar: block(2, 2),
  bar: block(3, 2),
  column: block(2, 3),
  // An L whose arms wrap the centre: cover facing inward on two sides.
  corner: [...block(4, 2), [0, 2], [1, 2], [0, 3], [1, 3]],
};

function decorate(r: DRoom, rng: Rng, level: number, trapMul: number, get: (x: number, y: number) => number, set: (x: number, y: number, v: number) => void) {
  const midX = Math.floor((r.x0 + r.x1) / 2);
  const midY = Math.floor((r.y0 + r.y1) / 2);
  const halfW = Math.floor((r.x1 - r.x0) / 2);
  const halfH = Math.floor((r.y1 - r.y0) / 2);
  const key = (x: number, y: number) => `${x},${y}`;
  // The centre cross is where every corridor enters: it always stays open.
  const inCross = (x: number, y: number) => Math.abs(x - midX) <= 1 || Math.abs(y - midY) <= 1;
  const mouths = r.gates.map((g) => g.tiles[1]);
  const nearMouth = (x: number, y: number, d: number) => mouths.some(([mx, my]) => Math.abs(mx - x) <= d && Math.abs(my - y) <= d);
  const taken = new Set<string>();

  const mirror = (dx: number, dy: number, piece: Cell[], ways: 2 | 4 = 4, sy0 = 1): Cell[] => {
    const out: Cell[] = [];
    for (const sx of [-1, 1]) for (const sy of ways === 4 ? [-1, 1] : [sy0]) for (const [i, j] of piece) out.push([midX + sx * (dx + i), midY + sy * (dy + j)]);
    return out;
  };

  // A wall piece needs two tiles of open floor all around, so nothing gets sealed off or pinched.
  const fits = (cells: Cell[]) => {
    const own = new Set(cells.map(([x, y]) => key(x, y)));
    for (const [x, y] of cells) {
      if (inCross(x, y)) return false;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) if (!own.has(key(x + ox, y + oy)) && get(x + ox, y + oy) !== FLOOR) return false;
    }
    return true;
  };

  // Every floor tile and every gate must stay reachable.
  const connected = () => {
    const inBox = (x: number, y: number) => x >= r.x0 - 1 && x <= r.x1 && y >= r.y0 - 1 && y <= r.y1;
    const startCell = r.gates[0]?.tiles[1];
    if (!startCell) return true;
    const seen = new Set([key(...startCell)]);
    const q: Cell[] = [startCell];
    while (q.length) {
      const [x, y] = q.pop()!;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Cell[]) {
        if (!inBox(nx, ny) || seen.has(key(nx, ny)) || get(nx, ny) !== FLOOR) continue;
        seen.add(key(nx, ny));
        q.push([nx, ny]);
      }
    }
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) if (get(x, y) === FLOOR && !seen.has(key(x, y))) return false;
    return r.gates.every((g) => seen.has(key(...g.tiles[1])));
  };

  const place = (cells: Cell[]) => {
    for (const [x, y] of cells) set(x, y, WALL);
    if (connected()) return true;
    for (const [x, y] of cells) set(x, y, FLOOR);
    return false;
  };

  /**
   * Biome pieces in mirrored pairs against the walls, the north wall first: statues flanking the room,
   * trees in its corners. Like cover, they may never cut anything off.
   */
  const dress = (pairs: number, signature: boolean) => {
    // The room's own walls are only laid after decorating, so "against a wall" means next to anything but floor.
    const hugs = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => get(x + ox, y + oy) !== FLOOR);
    const open = (x: number, y: number) => get(x, y) === FLOOR && !taken.has(key(x, y)) && !inCross(x, y) && !nearMouth(x, y, 2) && hugs(x, y);
    const north: Cell[] = [];
    const rest: Cell[] = [];
    for (let y = r.y0; y < r.y1; y++) {
      for (let x = r.x0; x < r.x1; x++) {
        const mx = r.x0 + r.x1 - 1 - x;
        if (x >= mx || !open(x, y) || !open(mx, y)) continue;
        (get(x, y - 1) !== FLOOR ? north : rest).push([x, y]);
      }
    }
    let placed = 0;
    for (const [x, y] of [...rng.shuffle(north), ...rng.shuffle(rest)]) {
      if (placed >= pairs) break;
      const mx = r.x0 + r.x1 - 1 - x;
      if (r.decor.some((d) => Math.abs(d.x - x) + Math.abs(d.y - y) < 4)) continue;
      set(x, y, PROP);
      set(mx, y, PROP);
      if (!connected()) {
        set(x, y, FLOOR);
        set(mx, y, FLOOR);
        continue;
      }
      taken.add(key(x, y));
      taken.add(key(mx, y));
      const v = signature && placed === 0 ? 0 : rng.int(0, 2);
      r.decor.push({ x, y, v }, { x: mx, y, v });
      placed++;
    }
  };

  if (r.type === 'start' || r.type === 'treasure') {
    dress(r.type === 'start' ? 3 : 2, true);
    return;
  }

  /** Try a piece at a few spacings, four-way symmetric first, then as a mirrored pair. */
  const tryPiece = (name: string) => {
    const piece = PIECES[name];
    const pw = Math.max(...piece.map(([i]) => i)) + 1;
    const ph = Math.max(...piece.map(([, j]) => j)) + 1;
    const dxs = rng.shuffle([2, 3, 4, 5, 6].filter((d) => d + pw <= halfW - 1));
    const dys = rng.shuffle([2, 3, 4].filter((d) => d + ph <= halfH - 1));
    for (const dx of dxs) {
      for (const dy of dys) {
        for (const cells of [mirror(dx, dy, piece), mirror(dx, dy, piece, 2, 1), mirror(dx, dy, piece, 2, -1)]) {
          if (fits(cells) && place(cells)) return true;
        }
      }
    }
    return false;
  };

  // ---- structure
  if (r.type === 'boss') {
    // Four pillars: cover from bullet patterns, and the boar stuns itself charging into them.
    const cells = mirror(6, 3, PIECES.pillar);
    if (!(fits(cells) && place(cells))) tryPiece('pillar');
  } else if (r.shape !== 'ring' && r.shape !== 'pillars') {
    const big = halfW >= 9 && halfH >= 6;
    const pool = r.type === 'horde' ? ['pillar', 'pillar', 'column'] : big ? ['corner', 'bar', 'column', 'pillar'] : ['pillar', 'bar', 'column'];
    if (r.type !== 'horde' || rng.chance(0.6)) {
      for (const name of rng.shuffle([...pool])) if (tryPiece(name)) break;
    }
    if (big && r.type === 'combat' && rng.chance(0.45)) tryPiece('pillar');
  }
  if (r.type === 'boss') {
    dress(2, true);
    return;
  }

  const free = (x: number, y: number, margin = 1) => {
    if (taken.has(key(x, y)) || inCross(x, y) || nearMouth(x, y, 3)) return false;
    for (let oy = -margin; oy <= margin; oy++) for (let ox = -margin; ox <= margin; ox++) if (get(x + ox, y + oy) !== FLOOR) return false;
    return true;
  };
  const randomTile = (margin = 1): Cell | undefined => {
    for (let i = 0; i < 40; i++) {
      const x = rng.int(r.x0 + 1, r.x1 - 2);
      const y = rng.int(r.y0 + 1, r.y1 - 2);
      if (free(x, y, margin)) return [x, y];
    }
    return undefined;
  };

  // ---- traps
  const trapChance = Math.min(0.95, (0.25 + level * 0.2) * trapMul);
  const trapCount = r.type === 'horde' ? (rng.chance(0.5 * trapMul) ? 1 : 0) : rng.chance(trapChance) ? (halfW >= 9 && rng.chance(trapChance * 0.4) ? 2 : 1) : 0;
  for (let n = 0; n < trapCount; n++) {
    const kind: TrapKind = r.type === 'horde' || rng.chance(0.4) ? 'saw' : 'spikes';
    if (kind === 'saw') {
      // A pair of saws on mirrored tracks, running in opposite directions.
      const horizontal = halfW >= halfH ? rng.chance(0.75) : rng.chance(0.25);
      for (const k of rng.shuffle([2, 3, 4, 5].filter((k) => k <= (horizontal ? halfH : halfW) - 2))) {
        const tracks: Cell[][] = [-1, 1].map((sg) => {
          const cells: Cell[] = [];
          if (horizontal) for (let x = r.x0 + 2; x <= r.x1 - 3; x++) cells.push([x, midY + sg * k]);
          else for (let y = r.y0 + 2; y <= r.y1 - 3; y++) cells.push([midX + sg * k, y]);
          return cells;
        });
        // Clip each track to its longest run of open floor.
        const runs = tracks.map((cells) => {
          let best: Cell[] = [];
          let cur: Cell[] = [];
          for (const c of cells) {
            if (get(c[0], c[1]) === FLOOR && !taken.has(key(c[0], c[1])) && !nearMouth(c[0], c[1], 2)) cur.push(c);
            else cur = [];
            if (cur.length > best.length) best = [...cur];
          }
          return best;
        });
        if (runs.some((run) => run.length < 6)) continue;
        runs.forEach((run, i) => {
          run.forEach(([x, y]) => taken.add(key(x, y)));
          r.traps.push({ kind: 'saw', tiles: [run[0], run[run.length - 1]], period: 0, phase: i === 0 ? 0 : 0.5 });
        });
        break;
      }
    } else {
      // Spike patches in mirrored quadrants, or strips across the centre paths that pulse out of step.
      const strips = rng.chance(0.4);
      if (strips) {
        for (const k of rng.shuffle([3, 4, 5].filter((k) => k <= Math.min(halfW, halfH) - 2))) {
          const a: Cell[] = [-1, 0, 1].map((j) => [midX - k, midY + j]);
          const b: Cell[] = [-1, 0, 1].map((j) => [midX + k, midY + j]);
          const c: Cell[] = [-1, 0, 1].map((i) => [midX + i, midY - k]);
          const d: Cell[] = [-1, 0, 1].map((i) => [midX + i, midY + k]);
          const groups = [a, b, c, d].filter((g) => g.every(([x, y]) => get(x, y) === FLOOR && !taken.has(key(x, y)) && !nearMouth(x, y, 2)));
          if (groups.length < 2) continue;
          groups.forEach((g, i) => {
            g.forEach(([x, y]) => taken.add(key(x, y)));
            r.traps.push({ kind: 'spikes', tiles: g, period: 3, phase: i % 2 ? 0.5 : 0 });
          });
          break;
        }
      } else {
        for (const dx of rng.shuffle([3, 4, 5, 6].filter((d) => d + 2 <= halfW - 1))) {
          const dy = rng.int(2, Math.max(2, halfH - 3));
          const cells = mirror(dx, dy, block(2, 2));
          if (!cells.every(([x, y]) => get(x, y) === FLOOR && !taken.has(key(x, y)) && !nearMouth(x, y, 2))) continue;
          for (let q = 0; q < 4; q++) {
            const g = cells.slice(q * 4, q * 4 + 4);
            g.forEach(([x, y]) => taken.add(key(x, y)));
            r.traps.push({ kind: 'spikes', tiles: g, period: 3.2, phase: q === 0 || q === 3 ? 0 : 0.5 });
          }
          break;
        }
      }
    }
  }

  // ---- props: crates in small clusters, a barrel or two, the odd biome prop
  const props = r.type === 'horde' ? rng.int(2, 4) : rng.int(4, 7);
  for (let n = 0; n < props; n++) {
    const at = randomTile(1);
    if (!at) break;
    const kind = rng.weighted(['crate', 'barrel'] as PropPlan['kind'][], (k) => (k === 'crate' ? 3 : 1.5));
    const cluster: Cell[] = [at];
    if (kind === 'crate') {
      for (const [ox, oy] of rng.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]] as Cell[]).slice(0, rng.int(0, 2))) {
        if (free(at[0] + ox, at[1] + oy)) cluster.push([at[0] + ox, at[1] + oy]);
      }
    }
    for (const [x, y] of cluster) {
      taken.add(key(x, y));
      r.props.push({ kind, x: x * T + T / 2, y: y * T + T / 2 });
    }
  }

  dress(r.type === 'horde' ? 2 : rng.int(2, 3), false);
}

// ---------------------------------------------------------------- optional new-run features

/**
 * New-run-only post-processing. It never changes the floor graph, tiles or the caller's RNG:
 * old saves can reconstruct their exact rooms by using generateDungeon without this step.
 */
export function enhanceDungeon(d: Dungeon, seed: number, level: number, biomeId: string): void {
  const rng = new Rng((seed ^ Math.imul(level + 1, 0x45d9f3b) ^ 0x63a9d731) >>> 0);
  const preferred: Record<string, TrapKind> = {
    forest: 'falling', glacier: 'falling', desert: 'arrows', volcano: 'vent', factory: 'vent',
    castle: 'arrows', garden: 'falling', palace: 'arrows', reef: 'beam', neon: 'beam',
  };
  const special = preferred[biomeId] ?? 'falling';
  for (const r of d.rooms) {
    if (r.type !== 'combat' && r.type !== 'horde') continue;
    const groups = trapTemplates(r);
    const result: TrapPlan[] = [];
    for (const group of groups) {
      // A mirrored pair/patch is one existing template, not two/four new trap budgets.
      const kind = rng.pick([group[0].kind, special, special]);
      if (kind === group[0].kind) {
        result.push(...group);
        continue;
      }
      const others = [...result, ...groups.filter((g) => g !== group).flat()];
      const replacement = directedTemplate(d, r, group.flatMap(trapCells), kind, rng, others, group.length);
      result.push(...(replacement.length ? replacement : group));
    }
    r.traps = result;
  }

  // A combat leaf is never on the route to the boss or treasure. Keep every id/seed/edge intact.
  const candidates = rng.shuffle(d.rooms.filter((r) => r.type === 'combat' && r.gates.length === 1 && r.depth >= 2));
  for (const r of candidates) {
    const oldTraps = r.traps;
    if (!r.traps.length) {
      const anchors = floorCells(d, r).filter(([x, y]) => safeFeatureTile(d, r, x, y));
      r.traps = directedTemplate(d, r, rng.shuffle(anchors), special, rng, [], 2);
      // Some small/irregular rooms cannot fit a wall emitter; isolated falling markers can still fit.
      if (!r.traps.length) r.traps = directedTemplate(d, r, anchors, 'falling', rng, [], 2);
    }
    const targets = challengeRoute(d, r, rng);
    if (r.traps.length && targets.length === 3) {
      r.type = 'challenge';
      r.challengeTargets = targets;
      break;
    }
    r.traps = oldTraps;
  }

  // Two small flank patches per floor at most. No currents in doors, loot rooms or central routes.
  const currentKind: CurrentPlan['kind'] = biomeId === 'factory' || biomeId === 'neon' ? 'conveyor'
    : biomeId === 'reef' || biomeId === 'garden' ? 'water' : 'wind';
  let patches = 0;
  for (const r of rng.shuffle(d.rooms.filter((r) => r.type === 'combat' || r.type === 'challenge'))) {
    if (patches >= 2) break;
    const danger = new Set(r.traps.flatMap(trapCells).map(cellKey));
    const targets = new Set((r.challengeTargets ?? []).map(cellKey));
    for (const [x, y] of rng.shuffle(floorCells(d, r))) {
      const direction = rng.pick<Cell>([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      const [dx, dy] = direction;
      const cells: Cell[] = [[x, y], [x + dx, y + dy], [x + 2 * dx, y + 2 * dy]];
      const safe = (cx: number, cy: number) => safeFeatureTile(d, r, cx, cy)
        && !danger.has(cellKey([cx, cy])) && !targets.has(cellKey([cx, cy]));
      // Open lateral exits and two clear tiles beyond the flow prevent unavoidable pushes into danger.
      const clearance = [...cells, [x + 3 * dx, y + 3 * dy], [x + 4 * dx, y + 4 * dy],
        ...cells.flatMap(([cx, cy]) => [[cx - dy, cy + dx], [cx + dy, cy - dx]])] as Cell[];
      if (!clearance.every(([cx, cy]) => safe(cx, cy))) continue;
      if (!roomPathsOpen(d, r, new Set(cells.map(cellKey)))) continue;
      r.currents = [{ kind: currentKind, tiles: cells, direction }];
      patches++;
      break;
    }
  }
}

const cellKey = ([x, y]: Cell) => `${x},${y}`;

function trapCells(t: TrapPlan): Cell[] {
  if (t.kind === 'spikes' || t.kind === 'falling') return t.tiles;
  const [a, b] = t.tiles;
  if (!a || !b) return [];
  const dx = Math.sign(b[0] - a[0]);
  const dy = Math.sign(b[1] - a[1]);
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + dx * i, a[1] + dy * i] as Cell);
}

/** Recover the original decorator's two-saw/four-patch/2–4-strip template boundaries. */
function trapTemplates(r: DRoom): TrapPlan[][] {
  const groups: TrapPlan[][] = [];
  const mx = Math.floor((r.x0 + r.x1) / 2);
  const my = Math.floor((r.y0 + r.y1) / 2);
  const radius = (t: TrapPlan) => Math.max(...t.tiles.map(([x, y]) => Math.max(Math.abs(x - mx), Math.abs(y - my))));
  for (let i = 0; i < r.traps.length;) {
    const t = r.traps[i];
    let n = t.kind === 'saw' ? 2 : t.period === 3.2 ? 4 : 1;
    if (t.kind === 'spikes' && t.period === 3) {
      while (i + n < r.traps.length && n < 4 && r.traps[i + n].kind === 'spikes'
        && r.traps[i + n].period === 3 && radius(r.traps[i + n]) === radius(t)) n++;
    }
    groups.push(r.traps.slice(i, i + n));
    i += n;
  }
  return groups;
}

function floorCells(d: Dungeon, r: DRoom): Cell[] {
  const out: Cell[] = [];
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
    if (tileAt(d, x, y) === FLOOR) out.push([x, y]);
  }
  return out;
}

function hasProp(r: DRoom, x: number, y: number): boolean {
  return r.props.some((p) => Math.floor(p.x / T) === x && Math.floor(p.y / T) === y);
}

function safeFeatureTile(d: Dungeon, r: DRoom, x: number, y: number): boolean {
  const mx = Math.floor((r.x0 + r.x1) / 2);
  const my = Math.floor((r.y0 + r.y1) / 2);
  return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1 && tileAt(d, x, y) === FLOOR
    && !hasProp(r, x, y) && Math.abs(x - mx) > 1 && Math.abs(y - my) > 1
    && !r.gates.some((g) => g.tiles.some(([gx, gy]) => Math.abs(x - gx) <= 2 && Math.abs(y - gy) <= 2));
}

/** All gate mouths and most of the safe room remain connected even with these cells active. */
function roomPathsOpen(d: Dungeon, r: DRoom, hazard: Set<string>): boolean {
  const reachable = reachableRoomTiles(d, r, hazard);
  const safe = floorCells(d, r).filter(([x, y]) => !hazard.has(cellKey([x, y])) && !hasProp(r, x, y));
  return r.gates.every((g) => g.tiles.every((c) => reachable.has(cellKey(c))))
    && safe.filter((c) => reachable.has(cellKey(c))).length >= safe.length * 0.95;
}

function reachableRoomTiles(d: Dungeon, r: DRoom, hazard: Set<string>): Set<string> {
  const start = r.gates[0]?.tiles[1];
  if (!start) return new Set();
  const reachable = new Set([cellKey(start)]);
  const queue: Cell[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const key = cellKey([nx, ny]);
      if (nx < r.x0 - 1 || nx > r.x1 || ny < r.y0 - 1 || ny > r.y1
        || reachable.has(key) || hazard.has(key) || hasProp(r, nx, ny) || tileAt(d, nx, ny) !== FLOOR) continue;
      reachable.add(key);
      queue.push([nx, ny]);
    }
  }
  return reachable;
}

function directedTemplate(d: Dungeon, r: DRoom, anchors: Cell[], kind: TrapKind, rng: Rng, others: TrapPlan[], maxParts: number): TrapPlan[] {
  const occupied = new Set(others.flatMap(trapCells).map(cellKey));
  const safe = (x: number, y: number) => safeFeatureTile(d, r, x, y) && !occupied.has(cellKey([x, y]));
  const plans: TrapPlan[] = [];
  const period = kind === 'vent' ? 4.8 : kind === 'beam' ? 5.2 : kind === 'falling' ? 4.4 : 4;
  for (const [x, y] of rng.shuffle([...anchors])) {
    if (plans.length >= Math.min(2, maxParts)) break;
    if (!safe(x, y)) continue;
    let tiles: Cell[] = [];
    let direction: Cell | undefined;
    if (kind === 'falling') {
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => tileAt(d, x + dx, y + dy) === FLOOR && !hasProp(r, x + dx, y + dy))) continue;
      if (plans.some((p) => p.tiles.some(([px, py]) => Math.abs(px - x) + Math.abs(py - y) < 3))) continue;
      tiles = [[x, y]];
    } else {
      for (const [dx, dy] of rng.shuffle<Cell>([[1, 0], [-1, 0], [0, 1], [0, -1]])) {
        let ax = x, ay = y;
        while (safe(ax - dx, ay - dy)) { ax -= dx; ay -= dy; }
        // Wall holes / vents really sit beside a wall. Beam projectors can stand at the flank's edge.
        if (kind !== 'beam' && tileAt(d, ax - dx, ay - dy) === FLOOR) continue;
        const run: Cell[] = [];
        const cap = kind === 'vent' ? 4 : 6;
        for (let n = 0; n < cap && safe(ax + n * dx, ay + n * dy); n++) run.push([ax + n * dx, ay + n * dy]);
        if (run.length < 3 || !run.some(([rx, ry]) => rx === x && ry === y)) continue;
        tiles = [run[0], run[run.length - 1]];
        direction = [dx, dy];
        break;
      }
      if (!tiles.length) continue;
    }
    const plan: TrapPlan = { kind, tiles, period, phase: plans.length ? 0.5 : 0, ...(direction ? { direction } : {}) };
    const cells = trapCells(plan);
    const hazards = new Set([...others.flatMap(trapCells), ...plans.flatMap(trapCells), ...cells].map(cellKey));
    if (!roomPathsOpen(d, r, hazards)) continue;
    plans.push(plan);
    cells.forEach((c) => occupied.add(cellKey(c)));
  }
  return plans;
}

function challengeRoute(d: Dungeon, r: DRoom, rng: Rng): Cell[] {
  const hazard = new Set(r.traps.flatMap(trapCells).map(cellKey));
  const reachable = reachableRoomTiles(d, r, hazard);
  const targets: Cell[] = [];
  const candidates = rng.shuffle(floorCells(d, r).filter(([x, y]) => {
    if (!reachable.has(cellKey([x, y]))) return false;
    if (r.gates.some((g) => g.tiles.some(([gx, gy]) => Math.abs(x - gx) <= 3 && Math.abs(y - gy) <= 3))) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (tileAt(d, x + dx, y + dy) !== FLOOR || hasProp(r, x + dx, y + dy) || hazard.has(cellKey([x + dx, y + dy]))) return false;
    }
    return true;
  }));
  // Greedy farthest-point sampling makes the task a route rather than three adjacent pickups.
  const entrance = r.gates[0].tiles[1];
  const distance = ([x, y]: Cell, [a, b]: Cell) => Math.hypot(x - a, y - b);
  for (let i = 0; i < 3; i++) {
    const refs = targets.length ? targets : [entrance];
    candidates.sort((a, b) => Math.min(...refs.map((p) => distance(b, p))) - Math.min(...refs.map((p) => distance(a, p))));
    const next = candidates.find((c) => targets.every((p) => distance(c, p) >= 4));
    if (!next) return [];
    targets.push(next);
    candidates.splice(candidates.indexOf(next), 1);
  }
  return targets;
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

/**
 * March a ray until it hits a solid tile. Returns the travelled length and which axis it hit.
 * With `fromInside`, a ray that starts inside a wall (a boss hovering over a pillar) first walks out of it.
 */
export function raycast(d: Dungeon, x: number, y: number, dx: number, dy: number, maxLen: number, fromInside = false): { len: number; axis: 'x' | 'y' | null } {
  const step = 3;
  let px = x;
  let py = y;
  let inside = fromInside && solidAt(d, x, y);
  for (let len = 0; len < maxLen; len += step) {
    const nx = px + dx * step;
    const ny = py + dy * step;
    if (inside) {
      inside = solidAt(d, nx, ny);
      px = nx;
      py = ny;
      continue;
    }
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

/** The nearest tile centre around (x, y) with floor on all four sides, so drops never sit in or against a wall. */
export function openSpot(d: Dungeon, x: number, y: number, maxR = 8): [number, number] {
  const tx0 = Math.floor(x / T);
  const ty0 = Math.floor(y / T);
  const open = (tx: number, ty: number) => !solidTile(d, tx, ty) && !solidTile(d, tx - 1, ty) && !solidTile(d, tx + 1, ty) && !solidTile(d, tx, ty - 1) && !solidTile(d, tx, ty + 1);
  if (open(tx0, ty0)) return [x, y];
  for (let r = 1; r <= maxR; r++) {
    let best: [number, number] | undefined;
    let bd = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !open(tx0 + dx, ty0 + dy)) continue;
        const cx = (tx0 + dx) * T + T / 2;
        const cy = (ty0 + dy) * T + T / 2;
        const dd = (cx - x) ** 2 + (cy - y) ** 2;
        if (dd < bd) {
          bd = dd;
          best = [cx, cy];
        }
      }
    }
    if (best) return best;
  }
  return [x, y];
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
