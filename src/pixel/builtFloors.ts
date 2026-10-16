import { T, type DRoom } from '../game/dungeon';
import type { Paint } from './decor';
import { pixelLine, terrainPatch, type TerrainContext } from './terrainPaint';

function bounds(r: DRoom) {
  return { x: r.x0 * T, y: r.y0 * T, w: (r.x1 - r.x0) * T, h: (r.y1 - r.y0) * T };
}

function frame(P: Paint, x: number, y: number, w: number, h: number, color: string, thickness = 1) {
  P(x, y, color, w, thickness);
  P(x, y + h - thickness, color, w, thickness);
  P(x, y, color, thickness, h);
  P(x + w - thickness, y, color, thickness, h);
}

function diamond(P: Paint, x: number, y: number, radius: number, color: string) {
  for (let dy = -radius; dy <= radius; dy++) {
    const half = radius - Math.abs(dy);
    P(x - half, y + dy, color, half * 2 + 1, 1);
  }
}

function factory(ctx: TerrainContext) {
  const { paint: P, detail: Q, rng, tiles, d } = ctx;
  // Thirty-two pixel sheet panels have seams and paired fasteners, unlike neon asphalt.
  for (const t of tiles) {
    const panel = (Math.floor(t.tx / 2) + Math.floor(t.ty / 2)) % 3;
    P(t.x, t.y, ['#535e72', '#566175', '#4f5b6f'][panel], T, T);
    if (t.tx % 2 === 0) P(t.x, t.y, '#434e60', 1, T);
    if (t.ty % 2 === 0) {
      P(t.x, t.y, '#414d60', T, 1);
      P(t.x, t.y + 1, '#616c7e', T, 1);
    }
    if (t.tx % 2 === 0 && t.ty % 2 === 0) {
      Q(t.x + 3, t.y + 3, '#79818b', 2, 1);
      Q(t.x + 3, t.y + 4, '#394757', 2, 1);
    }
  }
  for (const r of d.rooms) {
    const { x, y, w, h } = bounds(r);
    // An inset service walk and narrow expansion joints wrap each machine room.
    frame(P, x + 5, y + 5, w - 10, h - 10, '#465164', 11);
    frame(P, x + 16, y + 16, w - 32, h - 32, '#6c7072');
    for (let px = x + 20; px < x + w - 20; px += 13) {
      Q(px, y + 7, '#687077', 1, 7);
      Q(px, y + h - 14, '#687077', 1, 7);
    }
    // Short diagonal warnings mark maintenance corners; they never resemble trap plates.
    for (const sx of [x + 20, x + w - 49]) {
      Q(sx, y + 19, '#3e4856', 29, 5);
      for (let i = 0; i < 25; i += 7) pixelLine(Q, sx + i, y + 23, sx + i + 4, y + 19, '#9c8960', 2);
    }
    for (const p of r.decor) {
      const px = p.x * T + 8, py = p.y * T + 11;
      terrainPatch(Q, px + 7, py + 5, 18, 7, '#3d4859', rng.range(0, 6));
      terrainPatch(Q, px + 9, py + 4, 10, 4, '#354451', rng.range(0, 6));
      Q(px + 6, py + 3, '#526166', 9, 1);
    }
  }
  for (const t of tiles) {
    if (t.nearEdge && !t.quiet && rng.chance(0.055)) {
      const x = t.x + 2, y = t.y + 4;
      Q(x, y, '#303d4d', 12, 8);
      Q(x, y, '#6b737d', 12, 1);
      for (let i = 2; i < 11; i += 3) Q(x + i, y + 2, '#5a6675', 1, 5);
      Q(x, y + 7, '#263845', 12, 1);
    } else if (!t.quiet && rng.chance(t.edge ? 0.11 : 0.015)) {
      Q(t.x + 5, t.y + 7, '#7d7770', 4, 1);
      Q(t.x + 6, t.y + 6, '#7d7770', 2, 3);
      Q(t.x + 10, t.y + 11, '#354353', 3, 1);
    }
  }
}

function castle(ctx: TerrainContext) {
  const { paint: P, detail: Q, rng, tiles, d } = ctx;
  for (const t of tiles) {
    const shift = t.ty % 2 ? 1 : 0;
    const col = (Math.floor((t.tx + shift) / 2) + t.ty * 3) % 4;
    P(t.x, t.y, ['#363c52', '#3b4156', '#383e53', '#333b50'][col], T, T);
    P(t.x, t.y + 15, '#2c3248', T, 1);
    if ((t.tx + shift) % 2 === 0) {
      P(t.x, t.y, '#2c3248', 1, T);
      P(t.x + 1, t.y + 1, '#42475b', 1, 13);
    }
    if (t.nearEdge && rng.chance(0.18)) terrainPatch(Q, t.x + 8, t.y + 12, 13, 5, '#484958', rng.range(0, 6));
    if (!t.quiet && rng.chance(0.065)) {
      const x = t.x + 3, y = t.y + 4;
      pixelLine(Q, x, y, x + 5, y + 3, '#272f44');
      pixelLine(Q, x + 5, y + 3, x + 3, y + 7, '#272f44');
      pixelLine(Q, x + 5, y + 3, x + 10, y + 2, '#30374c');
    }
  }
  for (const r of d.rooms) {
    const { x, y, w, h } = bounds(r);
    // Fragments remain near the walls, with stone exposed through the worn purple pile.
    const rw = Math.min(67, Math.floor(w / 3)), rh = 30;
    const rx = rng.chance(0.5) ? x + 19 : x + w - rw - 19;
    const ry = rng.chance(0.5) ? y + 22 : y + h - rh - 22;
    Q(rx, ry, '#4b3e52', rw, rh);
    frame(Q, rx + 2, ry + 2, rw - 4, rh - 4, '#74616b');
    frame(Q, rx + 5, ry + 5, rw - 10, rh - 10, '#5a4a5f');
    for (let k = 10; k < rw - 8; k += 12) diamond(Q, rx + k, ry + 14, 3, '#675367');
    for (let k = 0; k < rw; k += rng.int(4, 9)) {
      Q(rx + k, ry + rh - rng.int(1, 5), '#3b4156', rng.int(2, 5), 5);
      Q(rx + k, ry - 1, '#69606a', 1, 2);
    }
    for (let k = 0; k < 4; k++) terrainPatch(Q, rx + rng.int(0, rw), ry + rng.int(0, rh), 5, 3, '#3b4156', k);
    // Small radial cobwebs tucked into opposed corners.
    for (const [cx, cy, dx, dy] of [[x + 3, y + 3, 1, 1], [x + w - 4, y + h - 4, -1, -1]]) {
      pixelLine(Q, cx, cy, cx + dx * 19, cy + dy * 2, '#626171');
      pixelLine(Q, cx, cy, cx + dx * 15, cy + dy * 14, '#626171');
      pixelLine(Q, cx, cy, cx + dx * 2, cy + dy * 19, '#626171');
      for (const n of [7, 13, 18]) {
        pixelLine(Q, cx + dx * n, cy + dy * 2, cx + dx * Math.round(n * 0.65), cy + dy * Math.round(n * 0.65), '#535568');
        pixelLine(Q, cx + dx * Math.round(n * 0.65), cy + dy * Math.round(n * 0.65), cx + dx * 2, cy + dy * n, '#535568');
      }
    }
  }
  for (const t of tiles) if (!t.quiet && rng.chance(t.edge ? 0.24 : 0.012)) {
    const x = t.x + rng.int(3, 10), y = t.y + rng.int(4, 11);
    Q(x - 1, y + 2, '#272e42', 8, 2);
    Q(x, y, '#666274', 4, 3);
    Q(x + 1, y, '#83808b', 3, 1);
    Q(x + 6, y + 3, '#565367', 3, 2);
  }
}

function gardenStone(P: Paint, x: number, y: number, wide: boolean) {
  const rx = wide ? 9 : 7;
  P(x - rx + 2, y - 4, '#8b9387', rx * 2 - 4, 9);
  P(x - rx, y - 2, '#777f76', rx * 2, 6);
  P(x - rx + 1, y - 3, '#9da396', rx * 2 - 3, 6);
  P(x - rx + 3, y - 4, '#b2b5a4', rx * 2 - 7, 1);
  P(x + rx - 4, y + 2, '#6b8061', 4, 2);
}

function garden(ctx: TerrainContext) {
  const { paint: P, detail: Q, rng, tiles, d } = ctx;
  for (const t of tiles) P(t.x, t.y, '#d2c4a2', T, T);
  for (const r of d.rooms) {
    const { x, y, w, h } = bounds(r);
    const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
    // Wide, shallow rake waves read as sand, while the center stays nearly flat.
    for (let py = y + 8; py < y + h; py += 6) {
      for (let px = x; px < x + w; px += 4) {
        const wave = Math.round(Math.sin((px - x) * 0.038 + r.gx) * 2);
        Q(px, py + wave, '#c4b794', 4, 1);
      }
    }
    for (const p of r.decor) {
      const px = p.x * T + 8, py = p.y * T + 12;
      terrainPatch(Q, px, py, 21, 11, '#969d78', rng.range(0, 6));
      terrainPatch(Q, px - 4, py + 1, 14, 7, '#85936b', rng.range(0, 6));
      // Parallel arcs around the moss island evoke a hand-raked dry garden.
      for (const radius of [26, 31, 36]) {
        for (let angle = 0; angle < Math.PI * 2; angle += 0.09) {
          Q(Math.round(px + Math.cos(angle) * radius), Math.round(py + Math.sin(angle) * radius * 0.6), '#beb28f', 2, 1);
        }
      }
    }
    for (const gate of r.gates) {
      const gx = gate.tiles.reduce((sum, [tx]) => sum + tx, 0) / gate.tiles.length * T + T / 2;
      const gy = gate.tiles.reduce((sum, [, ty]) => sum + ty, 0) / gate.tiles.length * T + T / 2;
      const dx = cx - gx, dy = cy - gy, len = Math.hypot(dx, dy);
      if (!len) continue;
      for (let dist = 12; dist < len - 26; dist += 20) {
        const bend = Math.sin(dist / len * Math.PI) * 5;
        const sx = Math.round(gx + dx * dist / len - dy / len * bend);
        const sy = Math.round(gy + dy * dist / len + dx / len * bend);
        gardenStone(P, sx, sy, rng.chance(0.45));
      }
    }
    // Thin edging gives the gravel bed a designed border rather than a tiled floor.
    frame(Q, x + 3, y + 3, w - 6, h - 6, '#a7a58a', 3);
  }
  for (const t of tiles) {
    if (t.quiet || !rng.chance(t.nearEdge ? 0.28 : 0.025)) continue;
    const x = t.x + rng.int(3, 11), y = t.y + rng.int(3, 11);
    if (rng.chance(0.6)) {
      pixelLine(Q, x - 4, y + 2, x + 5, y, '#8b9471');
      Q(x - 2, y - 1, '#718a62', 3, 1);
      Q(x + 2, y + 1, '#81966d', 3, 1);
      Q(x + 3, y - 2, '#718a62', 2, 1);
    } else {
      Q(x - 2, y, '#c08f91', 3, 1);
      Q(x - 1, y - 1, '#dfafaa', 2, 1);
      Q(x + 4, y + 3, '#d4a19c', 2, 1);
      Q(x + 5, y + 2, '#dfafaa');
    }
  }
}

function palace(ctx: TerrainContext) {
  const { paint: P, detail: Q, rng, tiles, d } = ctx;
  for (const t of tiles) {
    const light = (Math.floor(t.tx / 2) + Math.floor(t.ty / 2)) % 2 === 0;
    P(t.x, t.y, light ? '#d4cbb5' : '#b4bdbb', T, T);
    if (t.tx % 2 === 0) P(t.x, t.y, light ? '#c2bba7' : '#a4b0ae', 1, T);
    if (t.ty % 2 === 0) P(t.x, t.y, light ? '#e0d7c2' : '#c6ceca', T, 1);
    if (!t.quiet && rng.chance(0.15)) {
      const x = t.x + rng.int(2, 8), y = t.y + rng.int(2, 7);
      pixelLine(Q, x, y, x + 4, y + 4, light ? '#bcb9ad' : '#9daeb1');
      pixelLine(Q, x + 4, y + 4, x + 2, y + 7, light ? '#c6c0ae' : '#a6b5b5');
    }
  }
  for (const r of d.rooms) {
    const { x, y, w, h } = bounds(r);
    // A continuous inlay border and small blue-and-gold tesserae frame the marble hall.
    frame(P, x + 10, y + 10, w - 20, h - 20, '#8d968e', 5);
    frame(P, x + 11, y + 11, w - 22, h - 22, '#bbb08d');
    frame(P, x + 16, y + 16, w - 32, h - 32, '#b1a98f');
    for (let px = x + 26; px < x + w - 24; px += 24) {
      for (const py of [y + 12, y + h - 13]) {
        diamond(Q, px, py, 3, '#798f9b');
        Q(px, py, '#cebf8f');
      }
    }
    for (let py = y + 32; py < y + h - 24; py += 24) {
      for (const px of [x + 12, x + w - 13]) diamond(Q, px, py, 3, '#798f9b');
    }
    const vertical = r.gates.filter((g) => g.dir === 'up' || g.dir === 'down').length >= 2;
    const rx = vertical ? x + Math.floor(w / 2) - 15 : x + 28;
    const ry = vertical ? y + 24 : y + Math.floor(h / 2) - 15;
    const rw = vertical ? 30 : w - 56, rh = vertical ? h - 48 : 30;
    P(rx, ry + 1, '#8d555a', rw, rh - 2);
    frame(P, rx, ry, rw, rh, '#a89470', 2);
    frame(P, rx + 3, ry + 3, rw - 6, rh - 6, '#a26c68');
    // Deliberately plain carpet center keeps altar, player and loot silhouettes legible.
    if (vertical) {
      for (let py = ry + 12; py < ry + rh - 8; py += 18) {
        diamond(Q, rx + 5, py, 2, '#b39176');
        diamond(Q, rx + rw - 6, py, 2, '#b39176');
      }
    } else {
      for (let px = rx + 12; px < rx + rw - 8; px += 18) {
        diamond(Q, px, ry + 5, 2, '#b39176');
        diamond(Q, px, ry + rh - 6, 2, '#b39176');
      }
    }
    for (const [px, py] of [[x + 25, y + 25], [x + w - 26, y + h - 26]]) {
      diamond(Q, px, py, 9, '#a0aca7');
      diamond(Q, px, py, 6, '#d3c5a1');
      diamond(Q, px, py, 3, '#8299a1');
    }
  }
  for (const t of tiles) if (t.edge && !t.quiet && rng.chance(0.12)) {
    Q(t.x + 5, t.y + 8, '#9ba49a', 5, 2);
    Q(t.x + 6, t.y + 7, '#d1cdb5', 4, 1);
    Q(t.x + 11, t.y + 11, '#aab3a5', 2, 1);
  }
}

function neon(ctx: TerrainContext) {
  const { paint: P, detail: Q, rng, tiles, d } = ctx;
  for (const t of tiles) {
    P(t.x, t.y, '#282d42', T, T);
    if (rng.chance(0.26)) P(t.x + rng.int(1, 12), t.y + rng.int(1, 13), '#30364b', 3, 1);
  }
  for (const r of d.rooms) {
    const { x, y, w, h } = bounds(r);
    // Raised-looking paving at the margins, asphalt in the center. All remains walkable.
    frame(P, x + 2, y + 2, w - 4, h - 4, '#383d51', 11);
    frame(P, x + 13, y + 13, w - 26, h - 26, '#485061');
    for (let px = x + 18; px < x + w - 10; px += 22) {
      Q(px, y + 3, '#282f45', 1, 10);
      Q(px, y + h - 13, '#282f45', 1, 10);
    }
    for (let py = y + 18; py < y + h - 10; py += 22) {
      Q(x + 3, py, '#282f45', 10, 1);
      Q(x + w - 13, py, '#282f45', 10, 1);
    }
    // Broken lane paint is faded blue-gray, not bright combat yellow.
    const roadY = y + Math.floor(h * 0.65);
    for (let px = x + 32; px < x + w - 35; px += 36) {
      Q(px, roadY, '#74756f', 17, 2);
      Q(px + 4, roadY, '#343b4d', 2, 1);
    }
    for (const gate of r.gates) {
      if (gate.dir !== 'left' && gate.dir !== 'right') continue;
      const gx = gate.tiles[0][0] * T + (gate.dir === 'left' ? 21 : -21);
      const gy = gate.tiles.reduce((sum, [, ty]) => sum + ty, 0) / gate.tiles.length * T + 8;
      for (let stripe = -2; stripe <= 2; stripe++) P(gx, gy + stripe * 7, '#5c6570', 13, 3);
    }
    for (const p of r.decor) {
      const px = p.x * T + 8, py = p.y * T + 12;
      const magenta = rng.chance(0.5);
      terrainPatch(Q, px + 8, py + 13, 24, 10, '#202c40', rng.range(0, 6));
      terrainPatch(Q, px + 7, py + 14, 16, 6, magenta ? '#423249' : '#29424e', rng.range(0, 6));
      for (let k = 0; k < 5; k++) {
        const dy = k * 3;
        Q(px + rng.int(-7, 2), py + 7 + dy, magenta ? '#70405d' : '#386676', rng.int(5, 17), 1);
      }
    }
    // Cable routes hug the service pavement, with small clips at regular intervals.
    const cableX = x + (rng.chance(0.5) ? 7 : w - 8);
    Q(cableX, y + 25, '#21283a', 2, h - 50);
    for (let py = y + 30; py < y + h - 24; py += 17) Q(cableX - 1, py, '#69707b', 4, 1);
  }
  for (const t of tiles) {
    if (t.quiet) continue;
    if (t.nearEdge && rng.chance(0.045)) {
      const x = t.x + 2, y = t.y + 4;
      Q(x + 2, y, '#1c2639', 9, 9);
      Q(x, y + 2, '#1c2639', 13, 5);
      Q(x + 2, y + 1, '#515c6e', 9, 1);
      for (let i = 3; i < 11; i += 3) Q(x + i, y + 3, '#3f4c60', 1, 4);
    } else if (rng.chance(t.edge ? 0.15 : 0.008)) {
      Q(t.x + 5, t.y + 6, '#777b83', 4, 3);
      Q(t.x + 5, t.y + 6, '#95918d', 2, 1);
      Q(t.x + 10, t.y + 11, '#56495b', 3, 1);
    }
  }
}

/** Theme-specific architecture and wear, baked once without touching dungeon or gameplay state. */
export function paintBuiltFloor(biome: string, ctx: TerrainContext): boolean {
  switch (biome) {
    case 'factory': factory(ctx); return true;
    case 'castle': castle(ctx); return true;
    case 'garden': garden(ctx); return true;
    case 'palace': palace(ctx); return true;
    case 'neon': neon(ctx); return true;
    default: return false;
  }
}
