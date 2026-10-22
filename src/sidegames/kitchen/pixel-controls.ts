import { KITCHEN_SPAWN, KITCHEN_STATIONS, KITCHEN_WALK_BOUNDS } from './pixel-contract';
import type { KitchenPoint, KitchenTargetId } from './pixel-contract';

export interface KitchenWalker {
  readonly player: KitchenPoint & { facing: 'left' | 'right'; walking: boolean };
  readonly destination: KitchenPoint | null;
  readonly pending: KitchenTargetId | null;
  walkTo(point: KitchenPoint): void;
  walkToTarget(id: KitchenTargetId): void;
  /** Returns an explicitly requested station once, only after reaching its approach. */
  tick(dt: number, keys: ReadonlySet<string>): KitchenTargetId | null;
  clear(): void;
}

const BOUNDS = KITCHEN_WALK_BOUNDS;
const SPEED = 210;
const GRID = 20;
const EPSILON = 0.001;
const COLS = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / GRID) + 1;
const ROWS = Math.ceil((BOUNDS.maxY - BOUNDS.minY) / GRID) + 1;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const gap = (a: KitchenPoint, b: KitchenPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const held = (keys: ReadonlySet<string>, letter: string, arrow: string) => keys.has(letter)
  || keys.has(letter.toUpperCase()) || keys.has(arrow) || keys.has(arrow.toLowerCase());

// Foot clearance belongs to navigation, not sprite dimensions. The northern
// shelf/stove end above the walk bounds; the southern exit remains traversable.
const OBSTACLES = KITCHEN_STATIONS.filter(station => station.id !== 'exit'
  && station.y + station.height >= BOUNDS.minY && station.y <= BOUNDS.maxY)
  .map(station => ({ left: station.x - 10, right: station.x + station.width + 10,
    top: station.y - 8, bottom: station.y + station.height + 10 }));

function bounded(point: KitchenPoint, fallback: KitchenPoint): KitchenPoint {
  return {
    x: clamp(Number.isFinite(point.x) ? point.x : fallback.x, BOUNDS.minX, BOUNDS.maxX),
    y: clamp(Number.isFinite(point.y) ? point.y : fallback.y, BOUNDS.minY, BOUNDS.maxY),
  };
}

function free(point: KitchenPoint): boolean {
  return point.x >= BOUNDS.minX && point.x <= BOUNDS.maxX
    && point.y >= BOUNDS.minY && point.y <= BOUNDS.maxY
    && OBSTACLES.every(rect => point.x <= rect.left || point.x >= rect.right
      || point.y <= rect.top || point.y >= rect.bottom);
}

/** Slab intersection rejects a segment through an object, including diagonals. */
function clearSegment(a: KitchenPoint, b: KitchenPoint): boolean {
  if (!free(a) || !free(b)) return false;
  return OBSTACLES.every(rect => {
    let enter = 0, leave = 1;
    for (const [origin, delta, low, high] of [
      [a.x, b.x - a.x, rect.left + EPSILON, rect.right - EPSILON],
      [a.y, b.y - a.y, rect.top + EPSILON, rect.bottom - EPSILON],
    ]) {
      if (Math.abs(delta) < EPSILON) {
        if (origin <= low || origin >= high) return true;
      } else {
        const t1 = (low - origin) / delta, t2 = (high - origin) / delta;
        enter = Math.max(enter, Math.min(t1, t2));
        leave = Math.min(leave, Math.max(t1, t2));
        if (enter >= leave) return true;
      }
    }
    return leave <= 0 || enter >= 1 || enter >= leave;
  });
}

const NODES: KitchenPoint[] = Array.from({ length: COLS * ROWS }, (_, index) => ({
  x: Math.min(BOUNDS.maxX, BOUNDS.minX + index % COLS * GRID),
  y: Math.min(BOUNDS.maxY, BOUNDS.minY + Math.floor(index / COLS) * GRID),
}));

function nearestVisibleNode(point: KitchenPoint): number {
  let nearest = -1, shortest = Infinity;
  for (let index = 0; index < NODES.length; index++) {
    const distance = gap(point, NODES[index]);
    if (distance < shortest && clearSegment(point, NODES[index])) {
      nearest = index; shortest = distance;
    }
  }
  return nearest;
}

function safeGoal(point: KitchenPoint, fallback: KitchenPoint): KitchenPoint {
  const goal = bounded(point, fallback);
  if (free(goal)) return goal;
  const candidates: KitchenPoint[] = [];
  for (const rect of OBSTACLES) {
    candidates.push(
      bounded({ x: rect.left - 0.1, y: goal.y }, fallback),
      bounded({ x: rect.right + 0.1, y: goal.y }, fallback),
      bounded({ x: goal.x, y: rect.top - 0.1 }, fallback),
      bounded({ x: goal.x, y: rect.bottom + 0.1 }, fallback),
    );
  }
  return candidates.filter(free).sort((a, b) => gap(a, goal) - gap(b, goal))[0] ?? { ...fallback };
}

function route(start: KitchenPoint, goal: KitchenPoint): KitchenPoint[] {
  if (clearSegment(start, goal)) return [{ ...goal }];
  const first = nearestVisibleNode(start), last = nearestVisibleNode(goal);
  if (first < 0 || last < 0) return [];
  const open = new Set([first]);
  const closed = new Set<number>();
  const previous = new Map<number, number>();
  const scores = new Map([[first, 0]]);
  let found = false;
  while (open.size) {
    let current = -1, best = Infinity;
    for (const index of open) {
      const score = (scores.get(index) ?? Infinity) + gap(NODES[index], NODES[last]);
      if (score < best) { current = index; best = score; }
    }
    if (current === last) { found = true; break; }
    open.delete(current); closed.add(current);
    const column = current % COLS, row = Math.floor(current / COLS);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = column + dx, ny = row + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const next = ny * COLS + nx;
      if (closed.has(next) || !clearSegment(NODES[current], NODES[next])) continue;
      const score = (scores.get(current) ?? Infinity) + gap(NODES[current], NODES[next]);
      if (score >= (scores.get(next) ?? Infinity)) continue;
      previous.set(next, current); scores.set(next, score); open.add(next);
    }
  }
  if (!found) return [];
  const indices = [last];
  while (indices[indices.length - 1] !== first) {
    const prior = previous.get(indices[indices.length - 1]);
    if (prior === undefined) return [];
    indices.push(prior);
  }
  const raw = indices.reverse().map(index => NODES[index]).concat([{ ...goal }]);
  const result: KitchenPoint[] = [];
  let origin = start, cursor = 0;
  while (cursor < raw.length) {
    let end = raw.length - 1;
    while (end > cursor && !clearSegment(origin, raw[end])) end--;
    if (!clearSegment(origin, raw[end])) return [];
    if (gap(origin, raw[end]) > EPSILON) result.push({ ...raw[end] });
    origin = raw[end]; cursor = end + 1;
  }
  return result;
}

/** Pure local movement. The caller supplies input and scheduling; no side effects. */
export function createKitchenWalker(): KitchenWalker {
  const player: KitchenWalker['player'] = { ...KITCHEN_SPAWN, facing: 'right', walking: false };
  let destination: KitchenPoint | null = null;
  let pending: KitchenTargetId | null = null;
  let path: KitchenPoint[] = [];
  const clear = () => { path = []; destination = null; pending = null; player.walking = false; };
  const navigate = (goal: KitchenPoint) => {
    path = route(player, goal);
    destination = path.length ? { ...goal } : null;
    player.walking = false;
    return path.length > 0;
  };
  const move = (dx: number, dy: number) => {
    const next = bounded({ x: player.x + dx, y: player.y + dy }, player);
    if (clearSegment(player, next)) { player.x = next.x; player.y = next.y; return; }
    const horizontal = { x: next.x, y: player.y };
    if (clearSegment(player, horizontal)) player.x = horizontal.x;
    const vertical = { x: player.x, y: next.y };
    if (clearSegment(player, vertical)) player.y = vertical.y;
  };
  return {
    player,
    get destination() { return destination; },
    get pending() { return pending; },
    walkTo(point) {
      pending = null;
      navigate(safeGoal(point, player));
    },
    walkToTarget(id) {
      const station = KITCHEN_STATIONS.find(item => item.id === id);
      clear();
      if (station && free(station.approach) && navigate(station.approach)) pending = id;
    },
    tick(dt, keys) {
      const seconds = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : 0;
      const dx = Number(held(keys, 'd', 'ArrowRight')) - Number(held(keys, 'a', 'ArrowLeft'));
      const dy = Number(held(keys, 's', 'ArrowDown')) - Number(held(keys, 'w', 'ArrowUp'));
      const before = { x: player.x, y: player.y };
      if (dx || dy) {
        clear();
        const length = Math.hypot(dx, dy);
        if (dx) player.facing = dx < 0 ? 'left' : 'right';
        move(dx / length * SPEED * seconds, dy / length * SPEED * seconds);
      } else {
        let remaining = SPEED * seconds;
        while (path.length && remaining > EPSILON) {
          const next = path[0], distance = gap(player, next);
          if (distance <= EPSILON) { path.shift(); continue; }
          const amount = Math.min(remaining, distance);
          const stepX = (next.x - player.x) / distance * amount;
          const stepY = (next.y - player.y) / distance * amount;
          if (Math.abs(stepX) > EPSILON) player.facing = stepX < 0 ? 'left' : 'right';
          const candidate = { x: player.x + stepX, y: player.y + stepY };
          if (!clearSegment(player, candidate)) { clear(); break; }
          player.x = candidate.x; player.y = candidate.y;
          remaining -= amount;
          if (amount >= distance - EPSILON) path.shift();
        }
      }
      player.walking = gap(before, player) > EPSILON;
      if (!path.length && !dx && !dy) {
        destination = null;
        const station = pending ? KITCHEN_STATIONS.find(item => item.id === pending) : undefined;
        const arrived = station && gap(player, station.approach) < 10 ? station.id : null;
        pending = null;
        return arrived;
      }
      return null;
    },
    clear,
  };
}
