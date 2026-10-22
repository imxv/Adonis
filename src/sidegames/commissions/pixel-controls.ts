import {
  COMMISSION_TARGETS,
  COMMISSION_OBSTACLES,
  COMMISSION_WALK_BOUNDS,
  COMMISSION_WORLD,
  type CommissionTargetId,
} from './pixel-contract';

export interface CommissionPoint { x: number; y: number }
export interface CommissionViewport {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

type CommissionTarget = typeof COMMISSION_TARGETS[number];
type Obstacle = { left: number; top: number; right: number; bottom: number };

const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
const distance = (a: CommissionPoint, b: CommissionPoint): number => Math.hypot(a.x - b.x, a.y - b.y);
// Obstacles are already expressed as foot collision rectangles in the shared contract.
const obstacles: readonly Obstacle[] = COMMISSION_OBSTACLES;

/** The caller supplies only the scene area, excluding its HUD, toolbar and safe areas. */
export function createCommissionViewport(width: number, height: number, player: CommissionPoint): CommissionViewport {
  width = Math.max(1, width);
  height = Math.max(1, height);
  const fit = Math.min(width / COMMISSION_WORLD.width, height / COMMISSION_WORLD.height);
  // A portrait phone crops horizontally instead of shrinking the entire courtyard.
  const scale = width < 720 ? Math.max(0.85, height / COMMISSION_WORLD.height) : Math.max(0.85, fit);
  const cameraOffset = (size: number, worldSize: number, position: number, anchor: number): number => {
    const extent = worldSize * scale;
    return extent <= size ? (size - extent) / 2 : clamp(size * anchor - position * scale, size - extent, 0);
  };
  return {
    width, height, scale,
    offsetX: cameraOffset(width, COMMISSION_WORLD.width, player.x, 0.5),
    offsetY: cameraOffset(height, COMMISSION_WORLD.height, player.y, 0.7),
  };
}

export function screenToCommission(view: CommissionViewport, x: number, y: number): CommissionPoint {
  return { x: (x - view.offsetX) / view.scale, y: (y - view.offsetY) / view.scale };
}

export function getCommissionTarget(id: CommissionTargetId): CommissionTarget | undefined {
  return COMMISSION_TARGETS.find(target => target.id === id);
}

export function hitCommissionTarget(point: CommissionPoint): CommissionTargetId | null {
  return COMMISSION_TARGETS.find(target => point.x >= target.x && point.x <= target.x + target.width
    && point.y >= target.y && point.y <= target.y + target.height)?.id ?? null;
}

export function nearestCommissionTarget(point: CommissionPoint, maxDistance = 78): CommissionTargetId | null {
  let nearest: CommissionTargetId | null = null;
  let closest = maxDistance;
  for (const target of COMMISSION_TARGETS) {
    const length = distance(point, target.approach);
    if (length <= closest) { nearest = target.id; closest = length; }
  }
  return nearest;
}

function constrain(point: CommissionPoint): CommissionPoint {
  return {
    x: clamp(point.x, COMMISSION_WALK_BOUNDS.minX, COMMISSION_WALK_BOUNDS.maxX),
    y: clamp(point.y, COMMISSION_WALK_BOUNDS.minY, COMMISSION_WALK_BOUNDS.maxY),
  };
}

function inside(point: CommissionPoint, obstacle: Obstacle): boolean {
  return point.x > obstacle.left && point.x < obstacle.right
    && point.y > obstacle.top && point.y < obstacle.bottom;
}

function walkable(point: CommissionPoint): boolean {
  return !obstacles.some(obstacle => inside(point, obstacle));
}

function nearestWalkable(point: CommissionPoint): CommissionPoint {
  const bounded = constrain(point);
  if (walkable(bounded)) return bounded;
  const candidates = obstacles.flatMap(obstacle => [
    { x: obstacle.left - 1, y: bounded.y },
    { x: obstacle.right + 1, y: bounded.y },
    { x: bounded.x, y: obstacle.top - 1 },
    { x: bounded.x, y: obstacle.bottom + 1 },
  ]).map(constrain).filter(walkable);
  return candidates.sort((a, b) => distance(a, bounded) - distance(b, bounded))[0] ?? bounded;
}

/** Exact segment/rectangle slab test, allowing travel along an obstacle's outer edge. */
function clearSegment(a: CommissionPoint, b: CommissionPoint): boolean {
  return !obstacles.some(obstacle => {
    let enter = 0;
    let leave = 1;
    for (const [start, delta, min, max] of [
      [a.x, b.x - a.x, obstacle.left + 0.001, obstacle.right - 0.001],
      [a.y, b.y - a.y, obstacle.top + 0.001, obstacle.bottom - 0.001],
    ]) {
      if (Math.abs(delta) < 0.000001) {
        if (start < min || start > max) return false;
      } else {
        const first = (min - start) / delta;
        const second = (max - start) / delta;
        enter = Math.max(enter, Math.min(first, second));
        leave = Math.min(leave, Math.max(first, second));
        if (enter > leave) return false;
      }
    }
    return enter <= leave;
  });
}

/** A bounded visibility graph routes around the fixed NPCs, fountain and tables, with no per-frame search. */
export function createCommissionPath(from: CommissionPoint, to: CommissionPoint): CommissionPoint[] {
  const start = nearestWalkable(from);
  const end = nearestWalkable(to);
  if (distance(start, end) < 0.5) return [];
  if (clearSegment(start, end)) return [end];
  const corners = obstacles.flatMap(obstacle => [
    { x: obstacle.left - 1, y: obstacle.top - 1 },
    { x: obstacle.right + 1, y: obstacle.top - 1 },
    { x: obstacle.left - 1, y: obstacle.bottom + 1 },
    { x: obstacle.right + 1, y: obstacle.bottom + 1 },
  ]).filter(point => point.x >= COMMISSION_WALK_BOUNDS.minX && point.x <= COMMISSION_WALK_BOUNDS.maxX
    && point.y >= COMMISSION_WALK_BOUNDS.minY && point.y <= COMMISSION_WALK_BOUNDS.maxY && walkable(point));
  const nodes = [start, end, ...corners];
  const lengths = nodes.map(() => Infinity);
  const previous = nodes.map(() => -1);
  const visited = new Set<number>();
  lengths[0] = 0;
  for (let iteration = 0; iteration < nodes.length; iteration++) {
    let current = -1;
    for (let index = 0; index < nodes.length; index++) {
      if (!visited.has(index) && (current < 0 || lengths[index] < lengths[current])) current = index;
    }
    if (current < 0 || !Number.isFinite(lengths[current])) break;
    if (current === 1) {
      const path: CommissionPoint[] = [];
      for (let index = 1; index !== 0; index = previous[index]) path.unshift(nodes[index]);
      return path;
    }
    visited.add(current);
    for (let next = 0; next < nodes.length; next++) {
      if (visited.has(next) || next === current || !clearSegment(nodes[current], nodes[next])) continue;
      const length = lengths[current] + distance(nodes[current], nodes[next]);
      if (length < lengths[next]) { lengths[next] = length; previous[next] = current; }
    }
  }
  return [];
}

/** Swept axis movement permits sliding without tunnelling through a table after a long frame. */
export function moveCommissionPlayer(from: CommissionPoint, dx: number, dy: number): CommissionPoint {
  const point = nearestWalkable(from);
  let nextX = constrain({ x: point.x + dx, y: point.y }).x;
  for (const obstacle of obstacles) {
    if (point.y <= obstacle.top || point.y >= obstacle.bottom) continue;
    if (dx > 0 && point.x <= obstacle.left && nextX > obstacle.left) nextX = obstacle.left;
    if (dx < 0 && point.x >= obstacle.right && nextX < obstacle.right) nextX = obstacle.right;
  }
  let nextY = constrain({ x: nextX, y: point.y + dy }).y;
  for (const obstacle of obstacles) {
    if (nextX <= obstacle.left || nextX >= obstacle.right) continue;
    if (dy > 0 && point.y <= obstacle.top && nextY > obstacle.top) nextY = obstacle.top;
    if (dy < 0 && point.y >= obstacle.bottom && nextY < obstacle.bottom) nextY = obstacle.bottom;
  }
  return { x: nextX, y: nextY };
}
