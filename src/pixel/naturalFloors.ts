import { FLOOR, T } from '../game/dungeon';
import type { Paint } from './decor';
import { terrainPatch, pixelLine, type TerrainContext } from './terrainPaint';

/** A shallow chipped slab, drawn as floor material rather than a raised obstacle. */
function slab(P: Paint, x: number, y: number, w: number, h: number, fill: string, rim: string, seam: string) {
  P(x + 2, y, fill, w - 4, h);
  P(x, y + 2, fill, w, h - 4);
  P(x + 3, y, rim, w - 6, 1);
  P(x, y + 3, rim, 1, h - 6);
  P(x + 2, y + h - 1, seam, w - 4, 1);
  P(x + w - 1, y + 2, seam, 1, h - 4);
}

/** Thin contours in one direction give wind, ice and currents their own rhythm. */
function ripple(P: Paint, x: number, y: number, length: number, height: number, color: string, phase: number) {
  for (let s = 0; s < length; s += 3) {
    const t = s / length;
    const dy = Math.round(Math.sin(t * Math.PI + phase) * height);
    P(x + s, y + dy, color, Math.min(3, length - s), 1);
  }
}

function glacier(ctx: TerrainContext) {
  const { paint: P, detail: D, rng, d, tiles } = ctx;
  for (const r of d.rooms) {
    const area = (r.x1 - r.x0) * (r.y1 - r.y0) * T * T;
    for (let n = 0; n < area / 3100; n++) {
      const x = rng.int(r.x0 * T, r.x1 * T);
      const y = rng.int(r.y0 * T, r.y1 * T);
      const w = rng.int(24, 48);
      const h = rng.int(13, 27);
      // Wide translucent blue plates have straight facets beneath rounded snow shelves.
      slab(P, x, y, w, h, rng.pick(['#aec2cf', '#b3c6d1', '#a6bdcd']), '#cbd9df', '#9bb3c4');
      P(x + 5, y + 4, '#bdcfd8', Math.round(w * 0.55), 1);
      P(x + 9, y + 6, '#bdcfd8', Math.round(w * 0.35), 1);
      if (rng.chance(0.55)) {
        const sx = x + rng.int(5, w - 8);
        const sy = y + rng.int(4, h - 5);
        pixelLine(D, sx, sy, sx + 5, sy + 3, '#90aabc');
        pixelLine(D, sx + 5, sy + 3, sx + 3, sy + 8, '#90aabc');
        pixelLine(D, sx + 5, sy + 3, sx + 11, sy + 4, '#9bb3c4');
      }
      if (rng.chance(0.6)) terrainPatch(P, x + w / 2, y + h, w * 0.55, 5, '#d3dee2', rng.range(0, 6));
    }
    for (let n = 0; n < area / 7500; n++) {
      const x = rng.int(r.x0 * T, r.x1 * T);
      const y = rng.int(r.y0 * T, r.y1 * T);
      ripple(P, x, y, rng.int(25, 48), 3, '#d1dce1', rng.range(0, 3));
      ripple(P, x + 4, y + 4, rng.int(18, 35), 3, '#c8d5dd', rng.range(0, 3));
    }
  }
  for (const tile of tiles) {
    if (tile.type !== FLOOR) continue;
    const { x, y, edge, nearEdge } = tile;
    if (edge && rng.chance(0.55)) {
      const ox = x + rng.int(2, 13);
      const oy = y + rng.int(4, 12);
      terrainPatch(D, ox, oy + 2, rng.int(10, 17), 5, '#abbecb', 1);
      terrainPatch(D, ox - 2, oy, rng.int(9, 15), 4, '#dde6e8', 2);
      D(ox - 6, oy - 2, '#e6eceb', 8, 1);
    }
    if (!rng.chance(edge ? 0.44 : nearEdge ? 0.22 : 0.025)) continue;
    const ox = x + rng.int(3, 12);
    const oy = y + rng.int(5, 12);
    if (rng.chance(0.55)) {
      // Frozen rounded stones with a small powder cap.
      D(ox - 3, oy + 1, '#899fab', 7, 3);
      D(ox - 2, oy, '#a6b8c0', 5, 3);
      D(ox - 2, oy - 1, '#dde5e6', 4, 1);
      D(ox + 5, oy + 3, '#9cafba', 2, 1);
    } else {
      // Snow-covered pine needles: deliberately grey-green, away from cyan loot colours.
      pixelLine(D, ox - 4, oy + 2, ox + 4, oy, '#7e9b96');
      D(ox - 2, oy - 1, '#8ba89e', 1, 2);
      D(ox + 1, oy - 2, '#8ba89e', 1, 3);
      D(ox + 3, oy + 1, '#8ba89e', 1, 2);
      D(ox - 3, oy + 3, '#d7e1e3', 4, 1);
    }
  }
}

function desert(ctx: TerrainContext) {
  const { paint: P, detail: D, rng, d, tiles } = ctx;
  for (const r of d.rooms) {
    const area = (r.x1 - r.x0) * (r.y1 - r.y0) * T * T;
    for (let n = 0; n < area / 4500; n++) {
      const x = rng.int(r.x0 * T, r.x1 * T);
      const y = rng.int(r.y0 * T, r.y1 * T);
      const w = rng.int(34, 69);
      const h = rng.int(7, 15);
      // Long crescent dunes: broad smooth sand, then two parallel wind-carved ridges.
      terrainPatch(P, x + w / 2, y + h / 2, w / 2, h, '#e8ad71', rng.range(0, 2));
      ripple(P, x, y, w, h * 0.65, '#cf9562', 0.4);
      ripple(P, x + 4, y - 2, w - 9, h * 0.65, '#efbb80', 0.4);
      ripple(P, x + 8, y + 5, w - 16, h * 0.6, '#daa069', 0.4);
    }
    // Fragments of the old temple's paving remain beside the room boundary.
    for (let n = 0; n < Math.max(2, area / 17000); n++) {
      const side = rng.int(0, 3);
      const x = side === 0 ? r.x0 * T + 5 : side === 1 ? r.x1 * T - 37 : rng.int(r.x0 * T + 8, r.x1 * T - 39);
      const y = side === 2 ? r.y0 * T + 5 : side === 3 ? r.y1 * T - 26 : rng.int(r.y0 * T + 5, r.y1 * T - 28);
      for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
        if (rng.chance(0.23)) continue;
        const sx = x + col * 11 + (row % 2 ? 4 : 0);
        const sy = y + row * 10;
        slab(D, sx, sy, 10, 9, '#c79b6c', '#dbb383', '#b88c5f');
        if (rng.chance(0.4)) D(sx + 6, sy + 5, '#dba46d', 4, 4);
      }
    }
  }
  for (const { x, y, edge, nearEdge, type } of tiles) {
    if (type !== FLOOR || !rng.chance(edge ? 0.57 : nearEdge ? 0.27 : 0.035)) continue;
    const ox = x + rng.int(3, 12);
    const oy = y + rng.int(5, 12);
    const kind = rng.next();
    if (kind < 0.4) {
      // Tough dry tufts bend with the same prevailing wind as the dunes.
      D(ox - 3, oy + 2, '#c08d5a', 7, 1);
      pixelLine(D, ox - 2, oy + 1, ox - 4, oy - 2, '#a78a56');
      pixelLine(D, ox, oy + 1, ox - 1, oy - 5, '#b29961');
      pixelLine(D, ox + 2, oy + 1, ox + 3, oy - 3, '#a78a56');
      D(ox - 2, oy - 4, '#c3a86f', 2, 1);
    } else if (kind < 0.68) {
      // Partially buried pottery, muted terracotta instead of item-like highlights.
      D(ox - 3, oy - 1, '#b58058', 5, 3);
      D(ox - 2, oy - 2, '#cb956a', 3, 1);
      D(ox + 1, oy, '#996d4d', 2, 2);
      D(ox - 4, oy + 2, '#d8a16a', 7, 1);
      D(ox + 4, oy + 3, '#ba875f', 2, 2);
    } else if (kind < 0.83 && nearEdge) {
      // A half-buried rib segment, not a pickup-shaped skull.
      D(ox - 3, oy, '#c9ae7e', 8, 1);
      for (let k = 0; k < 3; k++) {
        D(ox - 3 + k * 3, oy - 2, '#d8c192', 1, 3);
        D(ox - 2 + k * 3, oy - 3, '#d8c192', 2, 1);
      }
      D(ox - 1, oy + 1, '#e1ab73', 5, 1);
    } else {
      D(ox - 2, oy, '#c18f60', 4, 2);
      D(ox - 1, oy - 1, '#d6a474', 2, 1);
      D(ox + 4, oy + 3, '#ca9664', 3, 1);
    }
  }
}

function volcano(ctx: TerrainContext) {
  const { paint: P, detail: D, rng, d, tiles } = ctx;
  for (const r of d.rooms) {
    const area = (r.x1 - r.x0) * (r.y1 - r.y0) * T * T;
    for (let n = 0; n < area / 2100; n++) {
      const x = rng.int(r.x0 * T - 9, r.x1 * T);
      const y = rng.int(r.y0 * T - 6, r.y1 * T);
      const w = rng.int(22, 43);
      const h = rng.int(16, 30);
      slab(P, x, y, w, h, rng.pick(['#382b36', '#41313c', '#49343d']), '#53404a', '#302731');
      // Fractures fork across cooled plates; their warm tone stays below warning brightness.
      const sx = x + rng.int(4, w - 8);
      const sy = y + rng.int(3, h - 8);
      pixelLine(P, sx, sy, sx + 5, sy + 4, '#594044');
      pixelLine(P, sx + 5, sy + 4, sx + 4, sy + 9, '#594044');
      if (rng.chance(0.4)) {
        pixelLine(D, sx + 5, sy + 5, sx + 10, sy + 6, '#765044');
        D(sx + 8, sy + 6, '#8b5847', 2, 1);
      }
    }
    for (let n = 0; n < area / 8500; n++) {
      const x = rng.int(r.x0 * T, r.x1 * T);
      const y = rng.int(r.y0 * T, r.y1 * T);
      terrainPatch(P, x, y, rng.int(13, 28), rng.int(5, 9), '#4a3b43', rng.range(0, 6));
      ripple(P, x - 10, y - 2, rng.int(14, 25), 2, '#58464c', 0.2);
    }
  }
  for (const { x, y, edge, nearEdge, type } of tiles) {
    if (type !== FLOOR || !rng.chance(edge ? 0.63 : nearEdge ? 0.32 : 0.045)) continue;
    const ox = x + rng.int(3, 11);
    const oy = y + rng.int(4, 12);
    if (edge && rng.chance(0.38)) {
      terrainPatch(D, ox, oy + 2, rng.int(8, 14), 4, '#514049', 0.8);
      D(ox - 4, oy, '#69524f', 8, 1);
      D(ox + 2, oy + 3, '#634b4b', 4, 1);
    }
    // Angular slag chunks with short dull-red seams, never glowing lava pools.
    D(ox - 3, oy + 1, '#2d2730', 7, 3);
    D(ox - 2, oy - 1, '#59444b', 4, 4);
    D(ox - 1, oy - 2, '#6d5354', 2, 1);
    D(ox + 1, oy, '#45343e', 2, 3);
    if (rng.chance(0.3)) D(ox - 1, oy + 2, '#965c48', 2, 1);
    D(ox + 5, oy + 4, '#5a4349', 2, 2);
  }
}

function reef(ctx: TerrainContext) {
  const { paint: P, detail: D, rng, d, tiles } = ctx;
  for (const r of d.rooms) {
    const area = (r.x1 - r.x0) * (r.y1 - r.y0) * T * T;
    for (let n = 0; n < area / 3500; n++) {
      const x = rng.int(r.x0 * T, r.x1 * T);
      const y = rng.int(r.y0 * T, r.y1 * T);
      const rx = rng.int(19, 36);
      // Silt islands and parallel current marks are broader and softer than the ice facets.
      terrainPatch(P, x, y, rx, rng.int(8, 15), rng.pick(['#22494b', '#284e50', '#204347']), rng.range(0, 6));
      ripple(P, x - rx, y - 3, rx * 2, 3, '#31595a', 0.5);
      ripple(P, x - rx + 4, y + 2, rx * 2 - 12, 3, '#2b5154', 0.5);
    }
    for (let n = 0; n < area / 10000; n++) {
      const x = rng.int(r.x0 * T, r.x1 * T);
      const y = rng.int(r.y0 * T, r.y1 * T);
      ripple(P, x - 24, y, rng.int(40, 70), 7, '#17383f', 0.1);
      ripple(P, x - 20, y + 3, rng.int(35, 60), 7, '#1c4147', 0.1);
    }
  }
  for (const { x, y, edge, nearEdge, type } of tiles) {
    if (type !== FLOOR) continue;
    if (edge && rng.chance(0.055)) {
      // Worn, incomplete mosaic bands have tiny tesserae, flat and grown over by silt.
      for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
        if (rng.chance(0.35)) continue;
        const color = (row + col) % 3 === 0 ? '#6c8175' : (row + col) % 3 === 1 ? '#426765' : '#526f70';
        D(x + col * 5, y + row * 5, color, 4, 4);
        D(x + col * 5, y + row * 5 + 3, '#335454', 4, 1);
      }
    }
    if (!rng.chance(edge ? 0.68 : nearEdge ? 0.36 : 0.065)) continue;
    const ox = x + rng.int(3, 12);
    const oy = y + rng.int(6, 13);
    const kind = rng.next();
    if (kind < 0.5) {
      D(ox - 3, oy + 2, '#224d48', 7, 2);
      for (let k = -1; k <= 1; k++) {
        const h = rng.int(4, edge ? 9 : 6);
        const middle = oy - Math.floor(h / 2);
        pixelLine(D, ox + k * 2, oy + 1, ox + k * 2 - 1, middle, '#477969');
        pixelLine(D, ox + k * 2 - 1, middle, ox + k * 2 + 1, oy - h, '#5b8d78');
      }
    } else if (kind < 0.69) {
      // A scalloped shell lying on the sediment, with visibly curved ribs.
      D(ox - 3, oy, '#546e6c', 7, 3);
      D(ox - 2, oy - 2, '#799488', 5, 3);
      D(ox - 1, oy - 3, '#88a092', 3, 1);
      D(ox, oy - 2, '#597970', 1, 3);
      D(ox - 2, oy + 1, '#8a9c8d', 5, 1);
    } else if (kind < 0.82 && nearEdge) {
      // Flat five-armed sea stars use dusty coral instead of pickup-pink highlights.
      pixelLine(D, ox, oy, ox - 4, oy - 2, '#9a7e70');
      pixelLine(D, ox, oy, ox + 4, oy - 1, '#9a7e70');
      pixelLine(D, ox, oy, ox + 1, oy - 4, '#aa8b78');
      pixelLine(D, ox, oy, ox - 2, oy + 3, '#9a7e70');
      pixelLine(D, ox, oy, ox + 3, oy + 3, '#9a7e70');
      D(ox, oy, '#b0967d', 2, 1);
    } else {
      pixelLine(D, ox - 3, oy + 2, ox + 3, oy, '#746d7b', 2);
      pixelLine(D, ox, oy + 1, ox - 1, oy - 3, '#8a7d88');
      pixelLine(D, ox + 2, oy, ox + 2, oy - 2, '#8a7d88');
      D(ox - 4, oy + 3, '#3c5b5c', 8, 1);
    }
  }
}

/** Natural biomes share clipping, but each has a distinct ground silhouette and material. */
export function paintNaturalFloor(biome: string, ctx: TerrainContext): boolean {
  switch (biome) {
    case 'glacier': glacier(ctx); return true;
    case 'desert': desert(ctx); return true;
    case 'volcano': volcano(ctx); return true;
    case 'reef': reef(ctx); return true;
    default: return false;
  }
}
