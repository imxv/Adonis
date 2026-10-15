import { T, raycast, solidTile, type Dungeon } from './dungeon';

/** How far from the player, in tiles, the field reaches. Locked rooms are smaller than this. */
const REACH = 48;
/** Straight neighbours first: the field is built over these, the diagonals are only for walking. */
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Walking distance from every floor tile to the player's tile, so enemies walk around cover
 * instead of pressing into it. Rebuilt only when the player steps onto another tile or a gate opens or closes.
 */
export class FlowField {
  private dist: Int16Array;
  private queue: Int32Array;
  private at = -1;
  private gates = -1;

  constructor(private d: Dungeon) {
    this.dist = new Int16Array(d.w * d.h);
    this.queue = new Int32Array(d.w * d.h);
  }

  update(x: number, y: number) {
    const d = this.d;
    const at = Math.floor(y / T) * d.w + Math.floor(x / T);
    if (at === this.at && d.blocked.size === this.gates) return;
    this.at = at;
    this.gates = d.blocked.size;
    const { dist, queue } = this;
    dist.fill(-1);
    dist[at] = 0;
    queue[0] = at;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const c = queue[head++];
      if (dist[c] >= REACH) continue;
      const cx = c % d.w;
      const cy = (c - cx) / d.w;
      for (let i = 0; i < 4; i++) {
        const nx = cx + DIRS[i][0];
        const ny = cy + DIRS[i][1];
        const n = ny * d.w + nx;
        if (solidTile(d, nx, ny) || dist[n] !== -1) continue;
        dist[n] = dist[c] + 1;
        queue[tail++] = n;
      }
    }
  }

  /** Heading from (x, y) toward the next tile on the way to the player; undefined when there is no better tile. */
  heading(x: number, y: number): number | undefined {
    const d = this.d;
    const tx = Math.floor(x / T);
    const ty = Math.floor(y / T);
    const here = this.dist[ty * d.w + tx];
    let best = here < 0 ? Infinity : here;
    let bx = -1;
    let by = -1;
    for (const [ox, oy] of DIRS) {
      const nx = tx + ox;
      const ny = ty + oy;
      if (solidTile(d, nx, ny)) continue;
      // No cutting corners: a diagonal step needs both straight neighbours free.
      if (ox && oy && (solidTile(d, tx + ox, ty) || solidTile(d, tx, ty + oy))) continue;
      const v = this.dist[ny * d.w + nx];
      if (v < 0 || v >= best) continue;
      best = v;
      bx = nx;
      by = ny;
    }
    if (bx < 0) return undefined;
    return Math.atan2((by + 0.5) * T - y, (bx + 0.5) * T - x);
  }
}

/** Whether a body of radius r can walk straight from (x, y) for len pixels along angle a. */
export function lineClear(d: Dungeon, x: number, y: number, a: number, len: number, r: number): boolean {
  const c = Math.cos(a);
  const s = Math.sin(a);
  for (const o of [0, -r, r]) {
    if (raycast(d, x - s * o, y + c * o, c, s, len).len < len - 1) return false;
  }
  return true;
}
