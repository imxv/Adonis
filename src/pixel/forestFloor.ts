import { Rng } from '../core/rng';
import { FLOOR, PROP, T, type Dungeon, type DRoom } from '../game/dungeon';
import type { Paint } from './decor';

// A subdued undergrowth ramp: enemies, loot and trap warnings keep the brightest colours.
const C = {
  grass: '#43854a', moss: '#397b46', shade: '#367345', deep: '#306841',
  leaf: '#568e4e', leafLight: '#6c9d57', leafDark: '#2c623e',
  earthEdge: '#566d49', earth: '#687653', earthLight: '#74805e',
  stoneDark: '#536e60', stone: '#748b79', stoneLight: '#8b9d87',
  leafLitter: '#8b8457', leafRust: '#947655', flower: '#b9a295', pollen: '#b5ad7b',
};

/** Paint only the walkable footprint, including beneath standing biome props. */
function clippedPaint(P: Paint, d: Dungeon, reserved: Uint8Array): Paint {
  return (x, y, color, w = 1, h = 1) => {
    const left = Math.max(0, Math.round(x));
    const top = Math.max(0, Math.round(y));
    const right = Math.min(d.w * T, Math.round(x + w));
    const bottom = Math.min(d.h * T, Math.round(y + h));
    for (let ty = Math.floor(top / T); ty < Math.ceil(bottom / T); ty++) {
      for (let tx = Math.floor(left / T); tx < Math.ceil(right / T); tx++) {
        const i = ty * d.w + tx;
        if ((d.tiles[i] !== FLOOR && d.tiles[i] !== PROP) || reserved[i]) continue;
        const x0 = Math.max(left, tx * T);
        const y0 = Math.max(top, ty * T);
        const x1 = Math.min(right, (tx + 1) * T);
        const y1 = Math.min(bottom, (ty + 1) * T);
        if (x1 > x0 && y1 > y0) P(x0, y0, color, x1 - x0, y1 - y0);
      }
    }
  };
}

/** Broad, irregular pixel silhouettes rather than noise or tile-sized checker patches. */
function patch(P: Paint, x: number, y: number, rx: number, ry: number, color: string, phase: number) {
  for (let dy = -ry; dy <= ry; dy += 2) {
    const round = Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry)));
    const edge = Math.round((Math.sin(dy * 0.41 + phase) + Math.sin(dy * 0.17 - phase)) * 2);
    const half = Math.max(2, Math.round(rx * round) + edge);
    P(x - half, y + dy, color, half * 2, 2);
  }
}

function fern(P: Paint, x: number, y: number, lush: boolean) {
  P(x - 3, y + 2, C.leafDark, 7, 2);
  P(x, y - 4, C.leaf, 1, 7);
  P(x - 2, y - 3, C.leaf, 2, 1);
  P(x + 1, y - 2, C.leafLight, 2, 1);
  P(x - 4, y - 1, C.leaf, 3, 1);
  P(x + 2, y, C.leaf, 3, 1);
  P(x - 2, y, C.leafLight, 2, 1);
  P(x + 1, y + 1, C.leafLight, 2, 1);
  if (lush) {
    P(x - 5, y, C.leafDark, 2, 2);
    P(x + 3, y - 2, C.leaf, 2, 1);
    P(x + 2, y - 3, C.leafLight);
  }
}

function grass(P: Paint, x: number, y: number, tall: boolean) {
  const h = tall ? 5 : 3;
  P(x - 3, y + 1, C.leafDark, 7, 1);
  P(x - 2, y - h + 2, C.leaf, 1, h);
  P(x, y - h, C.leafLight, 1, h + 2);
  P(x + 2, y - h + 1, C.leaf, 1, h + 1);
  P(x - 3, y - h + 1, C.leaf);
  P(x + 3, y - h, C.leaf);
}

function flowers(P: Paint, x: number, y: number, warm: boolean) {
  grass(P, x, y + 2, false);
  const color = warm ? C.pollen : C.flower;
  P(x - 3, y - 2, color, 3, 1);
  P(x - 2, y - 3, color, 1, 3);
  P(x + 2, y, color, 2, 1);
  P(x + 3, y - 1, color, 1, 2);
  P(x - 2, y - 2, C.leafLitter);
}

function litter(P: Paint, x: number, y: number, stone: boolean) {
  if (stone) {
    P(x - 3, y + 1, C.stoneDark, 6, 2);
    P(x - 2, y, C.stone, 4, 2);
    P(x - 1, y, C.stoneLight, 2, 1);
    P(x + 4, y + 3, C.stoneDark, 2, 1);
  } else {
    P(x - 2, y, C.leafLitter, 3, 1);
    P(x - 1, y - 1, C.leafLitter, 2, 1);
    P(x + 3, y + 3, C.leafRust, 3, 1);
    P(x + 4, y + 2, C.leafRust);
    P(x - 3, y + 4, C.leafDark, 2, 1);
  }
}

function steppingStone(P: Paint, x: number, y: number, rng: Rng) {
  const w = rng.int(7, 12);
  const h = rng.int(4, 7);
  const left = Math.round(x - w / 2);
  const top = Math.round(y - h / 2);
  P(left + 1, top, C.stoneDark, w - 2, h + 1);
  P(left, top + 1, C.stoneDark, w, h - 1);
  P(left + 1, top, C.stone, w - 3, h - 1);
  P(left + 2, top, C.stoneLight, w - 5, 1);
  P(left + w - 3, top + h - 2, C.moss, 2, 2);
  if (rng.chance(0.4)) P(left + Math.floor(w / 2), top + 2, C.stoneDark, 1, 2);
}

function roomCentre(r: DRoom): [number, number] {
  return [Math.floor((r.x0 + r.x1) / 2) * T + T / 2, Math.floor((r.y0 + r.y1) / 2) * T + T / 2];
}

/**
 * Baked once into the forest background. No dungeon state or gameplay RNG is touched.
 * Gate paths tie rooms together; detail concentrates on their perimeter, leaving fights readable.
 */
export function paintForestFloor(P: Paint, d: Dungeon, seed: number): void {
  const rng = new Rng(seed ^ 0x5f3759df);
  const reserved = new Uint8Array(d.tiles.length);
  const paths = new Uint8Array(d.tiles.length);
  const roomTiles = new Uint8Array(d.tiles.length);
  const at = (x: number, y: number) => x < 0 || y < 0 || x >= d.w || y >= d.h ? 0 : d.tiles[y * d.w + x];
  const floorish = (x: number, y: number) => at(x, y) === FLOOR || at(x, y) === PROP;
  const mark = (mask: Uint8Array, x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < d.w && y < d.h) mask[y * d.w + x] = 1;
  };

  for (const r of d.rooms) {
    for (const trap of r.traps) {
      // Falling traps may have only one landing tile; only directed traps have a track.
      const directed = trap.kind === 'saw' || trap.kind === 'arrows' || trap.kind === 'vent' || trap.kind === 'beam';
      if (!directed || trap.tiles.length < 2) {
        for (const [x, y] of trap.tiles) mark(reserved, x, y);
      } else {
        const [[ax, ay], [bx, by]] = trap.tiles;
        for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) {
          for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) mark(reserved, x, y);
        }
      }
    }
  }
  const Q = clippedPaint(P, d, reserved);

  for (const r of d.rooms) {
    const [cx, cy] = roomCentre(r);
    const area = (r.x1 - r.x0) * (r.y1 - r.y0) * T * T;
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) mark(roomTiles, x, y);

    // Grass islands overlap across tile boundaries, with a quieter sunlit middle.
    for (let k = 0; k < area / 1650; k++) {
      const x = rng.int(r.x0 * T, r.x1 * T);
      const y = rng.int(r.y0 * T, r.y1 * T);
      const color = rng.pick([C.grass, C.moss, C.moss, C.shade]);
      patch(Q, x, y, rng.int(13, 30), rng.int(7, 17), color, rng.range(0, 6));
    }

    // Fallen canopy shadows sit under the existing trees and ruins, never over actors.
    for (const prop of r.decor) {
      const x = prop.x * T + T / 2;
      const y = prop.y * T + T / 2;
      patch(Q, x + 8, y + 5, 21, 10, C.shade, rng.range(0, 6));
      patch(Q, x + 16, y + 10, 13, 6, C.deep, rng.range(0, 6));
      patch(Q, x + 24, y + 3, 9, 5, C.shade, rng.range(0, 6));
    }

    // Each entrance wears a meandering route into the same central clearing.
    for (const gate of r.gates) {
      const ax = gate.tiles.reduce((sum, [x]) => sum + x, 0) / gate.tiles.length * T + T / 2;
      const ay = gate.tiles.reduce((sum, [, y]) => sum + y, 0) / gate.tiles.length * T + T / 2;
      const dx = cx - ax;
      const dy = cy - ay;
      const len = Math.hypot(dx, dy);
      const width = rng.int(7, 9);
      const bend = rng.range(-8, 8);
      const points: [number, number, number][] = [];
      for (let s = 0; s <= len; s += 4) {
        const t = s / len;
        const wobble = Math.sin(t * Math.PI) * bend;
        const x = Math.round(ax + dx * t - dy / len * wobble);
        const y = Math.round(ay + dy * t + dx / len * wobble);
        const half = width + Math.round(Math.sin(s * 0.17) * 2);
        points.push([x, y, half]);
        mark(paths, Math.floor(x / T), Math.floor(y / T));
        patch(Q, x, y, half + 3, half, C.earthEdge, 0.2);
      }
      for (const [x, y, half] of points) patch(Q, x, y, half, half - 2, C.earth, 0.6);
      for (let i = 3; i < points.length - 3; i += rng.int(5, 8)) {
        const [x, y] = points[i];
        if (rng.chance(0.65)) steppingStone(Q, x + rng.int(-2, 2), y + rng.int(-2, 2), rng);
        else Q(x - 2, y, C.earthLight, 4, 1);
      }
    }
    // The altar, treasure choices and spawn point retain a quiet footprint.
    for (let ty = Math.floor((cy - 23) / T); ty <= Math.floor((cy + 23) / T); ty++) {
      for (let tx = Math.floor((cx - 23) / T); tx <= Math.floor((cx + 23) / T); tx++) mark(paths, tx, ty);
    }
  }

  for (let ty = 0; ty < d.h; ty++) {
    for (let tx = 0; tx < d.w; tx++) {
      const i = ty * d.w + tx;
      if (d.tiles[i] !== FLOOR || reserved[i]) continue;
      const x = tx * T;
      const y = ty * T;
      const north = !floorish(tx, ty - 1);
      const south = !floorish(tx, ty + 1);
      const west = !floorish(tx - 1, ty);
      const east = !floorish(tx + 1, ty);
      const edge = north || south || west || east;
      const nearEdge = edge || !floorish(tx - 2, ty) || !floorish(tx + 2, ty) || !floorish(tx, ty - 2) || !floorish(tx, ty + 2);

      // Corridors carry the same worn centre strip between the rooms' gate paths.
      if (!roomTiles[i]) {
        const horizontal = floorish(tx - 1, ty) && floorish(tx + 1, ty) && !floorish(tx, ty - 2) && !floorish(tx, ty + 2);
        const vertical = floorish(tx, ty - 1) && floorish(tx, ty + 1) && !floorish(tx - 2, ty) && !floorish(tx + 2, ty);
        if (horizontal || vertical) {
          Q(x + (vertical ? 1 : 0), y + (horizontal ? 1 : 0), C.earthEdge, vertical ? 14 : T, horizontal ? 14 : T);
          Q(x + (vertical ? 3 : 0), y + (horizontal ? 3 : 0), C.earth, vertical ? 10 : T, horizontal ? 10 : T);
          if ((horizontal ? tx : ty) % 3 === 0) steppingStone(Q, x + T / 2, y + T / 2, rng);
          mark(paths, tx, ty);
        }
      }

      // A thin moss skirt embeds the walls in the terrain without raising the floor.
      if (north) Q(x, y, C.deep, T, 2);
      if (south) Q(x, y + T - 2, C.shade, T, 2);
      if (west) Q(x, y, C.shade, 2, T);
      if (east) Q(x + T - 2, y, C.shade, 2, T);
      if (paths[i]) continue;

      const density = edge ? 0.88 : nearEdge ? 0.58 : 0.16;
      const count = edge && roomTiles[i] ? 2 : 1;
      for (let n = 0; n < count; n++) {
        if (!rng.chance(density)) continue;
        const ox = x + rng.int(3, 13);
        const oy = y + rng.int(4, 13);
        const kind = rng.next();
        if (kind < 0.4) grass(Q, ox, oy, edge);
        else if (kind < 0.67) fern(Q, ox, oy, edge);
        else if (kind < 0.8 && nearEdge) flowers(Q, ox, oy, rng.chance(0.5));
        else litter(Q, ox, oy, kind > 0.92);
      }
    }
  }
}
