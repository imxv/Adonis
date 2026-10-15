import type { Rng } from '../core/rng';
import { DIRS, DIR_VEC, type Dir } from './arena';
import type { Choice } from './run';

export type RoomType = 'start' | 'combat' | 'horde' | 'treasure' | 'boss';

export interface Room {
  id: string;
  gx: number;
  gy: number;
  depth: number;
  type: RoomType;
  doors: Record<Dir, boolean>;
  cleared: boolean;
  visited: boolean;
  seen: boolean;
  seed: number;
  items?: Choice[];
  itemTaken?: boolean;
}

export interface Floor {
  rooms: Map<string, Room>;
  start: Room;
  boss: Room;
}

const key = (x: number, y: number) => `${x},${y}`;

/** Binding of Isaac style floor: grow rooms outward from the start, then put the boss at the farthest dead end. */
export function generateFloor(rng: Rng, level: number): Floor {
  const target = 8 + level * 2;
  for (let attempt = 0; attempt < 200; attempt++) {
    const cells = new Map<string, { x: number; y: number; depth: number }>();
    const start = { x: 4, y: 4, depth: 0 };
    cells.set(key(4, 4), start);
    const queue = [start];
    while (queue.length && cells.size < target) {
      const cur = queue.shift()!;
      for (const d of rng.shuffle([...DIRS])) {
        if (cells.size >= target) break;
        const [dx, dy] = DIR_VEC[d];
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx > 8 || ny > 8 || cells.has(key(nx, ny))) continue;
        const neighbours = DIRS.filter((q) => cells.has(key(nx + DIR_VEC[q][0], ny + DIR_VEC[q][1]))).length;
        if (neighbours > 1) continue;
        if (rng.chance(0.5)) continue;
        const cell = { x: nx, y: ny, depth: cur.depth + 1 };
        cells.set(key(nx, ny), cell);
        queue.push(cell);
      }
      if (!queue.length && cells.size < target) queue.push(...rng.shuffle([...cells.values()]).slice(0, 3));
    }
    if (cells.size < target) continue;
    const deadEnds = [...cells.values()].filter((c) => c !== start && DIRS.filter((q) => cells.has(key(c.x + DIR_VEC[q][0], c.y + DIR_VEC[q][1]))).length === 1);
    if (deadEnds.length < 3) continue;
    deadEnds.sort((a, b) => b.depth - a.depth);
    const bossCell = deadEnds[0];
    if (bossCell.depth < 3) continue;

    const rooms = new Map<string, Room>();
    for (const c of cells.values()) {
      const doors = Object.fromEntries(DIRS.map((q) => [q, cells.has(key(c.x + DIR_VEC[q][0], c.y + DIR_VEC[q][1]))])) as Record<Dir, boolean>;
      rooms.set(key(c.x, c.y), { id: key(c.x, c.y), gx: c.x, gy: c.y, depth: c.depth, type: 'combat', doors, cleared: false, visited: false, seen: false, seed: rng.int(1, 1e9) });
    }
    const startRoom = rooms.get(key(start.x, start.y))!;
    startRoom.type = 'start';
    startRoom.cleared = true;
    const bossRoom = rooms.get(key(bossCell.x, bossCell.y))!;
    bossRoom.type = 'boss';
    rooms.get(key(deadEnds[1].x, deadEnds[1].y))!.type = 'treasure';
    rooms.get(key(deadEnds[1].x, deadEnds[1].y))!.cleared = true;
    // One survival-horde room per floor, Vampire Survivors style.
    const hordeCandidates = [...rooms.values()].filter((r) => r.type === 'combat' && r.depth >= 2);
    if (hordeCandidates.length) rng.pick(hordeCandidates).type = 'horde';
    return { rooms, start: startRoom, boss: bossRoom };
  }
  throw new Error('floor generation failed');
}

export function neighbour(floor: Floor, room: Room, d: Dir): Room | undefined {
  const [dx, dy] = DIR_VEC[d];
  return floor.rooms.get(key(room.gx + dx, room.gy + dy));
}
