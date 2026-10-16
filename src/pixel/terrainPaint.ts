import { Rng } from '../core/rng';
import { FLOOR, PROP, T, type Dungeon, type DRoom } from '../game/dungeon';
import type { Paint } from './decor';

export interface TerrainTile {
  tx: number; ty: number; x: number; y: number;
  edge: boolean; nearEdge: boolean; quiet: boolean;
  room?: DRoom;
  type: number;
}

export interface TerrainContext {
  paint: Paint;
  detail: Paint;
  rng: Rng;
  d: Dungeon;
  tiles: TerrainTile[];
}

/** Visual-only masks: floor art cannot spill onto walls or cover trap tracks. */
export function createTerrain(P: Paint, d: Dungeon, seed: number, salt: number): TerrainContext {
  const reserved = new Uint8Array(d.tiles.length);
  const quiet = new Uint8Array(d.tiles.length);
  const rooms = new Map<number, DRoom>();
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < d.w && y < d.h ? d.tiles[y * d.w + x] : 0;
  const floor = (x: number, y: number) => at(x, y) === FLOOR || at(x, y) === PROP;
  const mark = (mask: Uint8Array, x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < d.w && y < d.h) mask[y * d.w + x] = 1;
  };
  for (const room of d.rooms) {
    const cx = Math.floor((room.x0 + room.x1) / 2);
    const cy = Math.floor((room.y0 + room.y1) / 2);
    for (let y = room.y0; y < room.y1; y++) for (let x = room.x0; x < room.x1; x++) {
      rooms.set(y * d.w + x, room);
      if (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1) mark(quiet, x, y);
    }
    for (const gate of room.gates) for (const [gx, gy] of gate.tiles) {
      for (let y = gy - 2; y <= gy + 2; y++) for (let x = gx - 2; x <= gx + 2; x++) mark(quiet, x, y);
    }
    for (const trap of room.traps) {
      if (trap.kind === 'spikes') for (const [x, y] of trap.tiles) mark(reserved, x, y);
      else {
        const [[ax, ay], [bx, by]] = trap.tiles;
        for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
          for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) mark(reserved, x, y);
        }
      }
    }
  }
  const clipped = (detail: boolean): Paint => (x, y, color, w = 1, h = 1) => {
    const left = Math.max(0, Math.round(x));
    const top = Math.max(0, Math.round(y));
    const right = Math.min(d.w * T, Math.round(x + w));
    const bottom = Math.min(d.h * T, Math.round(y + h));
    for (let ty = Math.floor(top / T); ty < Math.ceil(bottom / T); ty++) {
      for (let tx = Math.floor(left / T); tx < Math.ceil(right / T); tx++) {
        const i = ty * d.w + tx;
        if (!floor(tx, ty) || reserved[i] || (detail && quiet[i])) continue;
        const x0 = Math.max(left, tx * T), y0 = Math.max(top, ty * T);
        const x1 = Math.min(right, (tx + 1) * T), y1 = Math.min(bottom, (ty + 1) * T);
        if (x1 > x0 && y1 > y0) P(x0, y0, color, x1 - x0, y1 - y0);
      }
    }
  };
  const tiles: TerrainTile[] = [];
  for (let ty = 0; ty < d.h; ty++) for (let tx = 0; tx < d.w; tx++) {
    const i = ty * d.w + tx;
    if (!floor(tx, ty) || reserved[i]) continue;
    const edge = !floor(tx - 1, ty) || !floor(tx + 1, ty) || !floor(tx, ty - 1) || !floor(tx, ty + 1);
    const room = rooms.get(i);
    // The narrow connectors remain free from small clutter as well.
    if (!room) quiet[i] = 1;
    tiles.push({ tx, ty, x: tx * T, y: ty * T, edge,
      nearEdge: edge || !floor(tx - 2, ty) || !floor(tx + 2, ty) || !floor(tx, ty - 2) || !floor(tx, ty + 2),
      quiet: !!quiet[i], room, type: d.tiles[i] });
  }
  return { paint: clipped(false), detail: clipped(true), rng: new Rng(seed ^ salt), d, tiles };
}

/** Broad stepped silhouettes span tiles instead of repeating tile-sized noise. */
export function terrainPatch(P: Paint, cx: number, cy: number, rx: number, ry: number, color: string, phase = 0): void {
  if (rx <= 0 || ry <= 0) return;
  for (let dy = -ry; dy <= ry; dy += 2) {
    const round = Math.sqrt(Math.max(0, 1 - dy * dy / (ry * ry)));
    const edge = Math.round((Math.sin(dy * .41 + phase) + Math.sin(dy * .17 - phase)) * 2);
    const half = Math.max(1, Math.round(rx * round) + edge);
    P(cx - half, cy + dy, color, half * 2, 2);
  }
}

export function pixelLine(P: Paint, x1: number, y1: number, x2: number, y2: number, color: string, width = 1): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))));
  for (let i = 0; i <= steps; i++) P(Math.round(x1 + (x2 - x1) * i / steps), Math.round(y1 + (y2 - y1) * i / steps), color, width, width);
}
