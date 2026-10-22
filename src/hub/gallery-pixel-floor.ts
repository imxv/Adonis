/**
 * The gallery's fixed, code-drawn 1254 × 471 floor layer.
 * All marks are integer pixel clusters; this module owns no state or clock.
 */
type FloorPoint = readonly [number, number];

const FLOOR_WIDTH = 1254;
const FLOOR_HEIGHT = 471;
const HORIZON: FloorPoint = [627, 190];
/** The tall left-hall window that carries the moon; its cool light falls on this axis. */
const MOON_AXIS = 285;

const STONE = ['#817d8b', '#938b94', '#aaa0a1', '#b9ada6', '#c8b8a0'];
const SEAM = '#514a59';
const GOLD = '#aa783d';
const GOLD_LIGHT = '#eac77b';
const GOLD_DARK = '#60442e';

/** Draw once into the renderer's static background cache. */
export function drawPixelFloor(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const rect = (x: number, y: number, w: number, h: number, color: string): void => {
    const left = Math.max(0, Math.round(x));
    const top = Math.max(269, Math.round(y));
    const right = Math.min(FLOOR_WIDTH, Math.round(x + w));
    const bottom = Math.min(FLOOR_HEIGHT, Math.round(y + h));
    if (right <= left || bottom <= top) return;
    ctx.fillStyle = color;
    ctx.fillRect(left, top, right - left, bottom - top);
  };

  const line = (a: FloorPoint, b: FloorPoint, color: string, width = 1): void => {
    let x = Math.round(a[0]);
    let y = Math.round(a[1]);
    const bx = Math.round(b[0]);
    const by = Math.round(b[1]);
    const dx = Math.abs(bx - x);
    const sx = x < bx ? 1 : -1;
    const dy = -Math.abs(by - y);
    const sy = y < by ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      rect(x, y, width, width, color);
      if (x === bx && y === by) break;
      const next = 2 * error;
      if (next >= dy) { error += dy; x += sx; }
      if (next <= dx) { error += dx; y += sy; }
    }
  };

  const polygon = (points: readonly FloorPoint[], color: string): void => {
    const low = Math.max(269, Math.ceil(Math.min(...points.map(point => point[1]))));
    const high = Math.min(FLOOR_HEIGHT - 1, Math.floor(Math.max(...points.map(point => point[1]))));
    ctx.fillStyle = color;
    for (let y = low; y <= high; y += 1) {
      const crossings: number[] = [];
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          crossings.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const left = Math.max(0, Math.ceil(crossings[i]));
        const right = Math.min(FLOOR_WIDTH - 1, Math.floor(crossings[i + 1]));
        if (right >= left) ctx.fillRect(left, y, right - left + 1, 1);
      }
    }
  };

  const ellipse = (cx: number, cy: number, rx: number, ry: number, color: string): void => {
    for (let y = -ry; y <= ry; y += 1) {
      const halfWidth = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      rect(cx - halfWidth, cy + y, halfWidth * 2 + 1, 1, color);
    }
  };

  const project = (floorX: number, y: number): FloorPoint => [
    Math.round(HORIZON[0] + (floorX - HORIZON[0]) * ((y - HORIZON[1]) / (470 - HORIZON[1]))),
    Math.round(y),
  ];

  // Broad stone colour planes are fixed bands, with a separate bevel on each tile.
  rect(0, 269, FLOOR_WIDTH, 202, '#8d8290');
  const tileRows = [298, 309, 324, 345, 373, 413, 471];
  for (let row = 0; row < tileRows.length - 1; row += 1) {
    const top = tileRows[row];
    const bottom = tileRows[row + 1];
    const stagger = row % 2 ? 52 : 0;
    for (let column = -11; column < 24; column += 1) {
      const left = column * 104 + stagger;
      const right = left + 104;
      const a = project(left, top);
      const b = project(right, top);
      const c = project(right, bottom);
      const d = project(left, bottom);
      const shade = ((column + row * 3) % STONE.length + STONE.length) % STONE.length;
      polygon([a, b, c, d], STONE[shade]);
      line(a, b, '#cbc0af');
      line(a, d, '#b7adb0');
      line(d, c, SEAM);
      line(b, c, '#625e71');

      // A few long, joint-following mineral veins; never a screen-wide noise pass.
      if ((column + row * 2 + 21) % 4 === 0 && row > 1) {
        const midY = top + Math.round((bottom - top) * 0.55);
        const p = project(left + 17, midY);
        const q = project(left + 44, midY + 2);
        const r = project(left + 60, midY + 1);
        line(p, q, '#85818f');
        line(q, r, '#85818f');
        line([q[0] + 1, q[1] + 1], [r[0] - 4, r[1] + 1], '#c0b4ac');
      }
      if ((column + row + 21) % 7 === 0 && row > 2) {
        const p = project(left + 68, top + 6);
        line(p, [p[0] + 7, p[1] + 3], '#746c7e');
        line([p[0] + 7, p[1] + 3], [p[0] + 13, p[1] + 3], '#746c7e');
      }
    }
  }

  // Recessed wing aisles and the two inlaid processional borders that converge on the nave.
  polygon([[0, 299], [206, 299], [93, 471], [0, 471]], '#6c6b80');
  polygon([[1048, 299], [1254, 299], [1254, 471], [1161, 471]], '#77717d');
  const borderLane = (left: number, right: number): void => {
    polygon([project(left - 5, 299), project(right + 5, 299), project(right + 5, 471), project(left - 5, 471)], GOLD_DARK);
    polygon([project(left, 299), project(right, 299), project(right, 471), project(left, 471)], '#c6a46b');
    polygon([project(left + 4, 299), project(right - 4, 299), project(right - 4, 471), project(left + 4, 471)], '#39485c');
    line(project(left + 1, 299), project(left + 1, 471), GOLD_LIGHT);
    line(project(right - 1, 299), project(right - 1, 471), GOLD_LIGHT);
    const ys = [301, 311, 324, 340, 360, 385, 416, 453, 478];
    for (let i = 0; i < ys.length - 1; i += 1) {
      const top = ys[i];
      const bottom = ys[i + 1] - 2;
      const span = right - left;
      const path: FloorPoint[] = [
        project(left + 6, top), project(right - 6, top),
        project(right - 6, bottom), project(left + 6, bottom),
        project(left + 6, top + (bottom - top) * 0.35),
        project(left + span * 0.57, top + (bottom - top) * 0.35),
        project(left + span * 0.57, top + (bottom - top) * 0.65),
        project(left + span * 0.37, top + (bottom - top) * 0.65),
      ];
      for (let n = 1; n < path.length; n += 1) line(path[n - 1], path[n], i < 3 ? GOLD : GOLD_LIGHT);
    }
  };
  borderLane(404, 436);
  borderLane(818, 850);

  // A transverse runner crosses the whole hall behind the central medallion.
  polygon([project(-560, 338), project(1814, 338), project(1814, 346), project(-560, 346)], GOLD_DARK);
  polygon([project(-553, 339), project(1807, 339), project(1807, 344), project(-553, 344)], '#b99967');
  line(project(-553, 340), project(1807, 340), '#e0c58e');
  for (let x = -540; x < 1800; x += 28) {
    line(project(x, 341), project(x + 16, 341), '#3f4f63');
    line(project(x + 16, 341), project(x + 16, 344), '#3f4f63');
  }

  // The floor is polished, not a mirror: short, three-tone reflection bands
  // widen towards the viewer, and break where a stone joint interrupts them.
  const warmReflection = (x: number, bias: number): void => {
    const marks: readonly [number, number, number][] = [
      [299, 8, 5], [306, 10, 7], [316, 12, 5],
      [324, 11, 6], [333, 15, 7], [343, 19, 7],
    ];
    for (let i = 0; i < marks.length; i += 1) {
      const [y, width, height] = marks[i];
      const offset = ((i + bias) % 3) - 1;
      const left = x + offset - Math.floor(width / 2);
      polygon([[left + 1, y], [left + width - 2, y], [left + width, y + height - 1], [left - 1, y + height - 1]], '#b69d7b');
      rect(left + 2, y + 1, width - 3, height - 2, '#c6aa78');
      rect(left + 3 + (i % 2), y + 1, Math.max(3, Math.floor(width * 0.43)), i < 3 ? 2 : 1, '#e0bf83');
    }
  };
  for (const [i, x] of [186, 384, 456, 798, 887, 1051].entries()) warmReflection(x, i + 1);
  // The moon window leaves a cool axis across the warm stone. It uses
  // individual, joint-separated planes, not a gradient.
  ctx.save();
  ctx.translate(MOON_AXIS - 418, 0);
  polygon([[409, 298], [425, 298], [428, 310], [406, 310]], '#91a6b5');
  polygon([[405, 312], [430, 312], [433, 323], [402, 323]], '#9aafbc');
  polygon([[401, 326], [433, 326], [437, 338], [398, 338]], '#8da5b8');
  polygon([[396, 341], [438, 341], [441, 353], [393, 353]], '#9bafbb');
  polygon([[392, 357], [443, 357], [446, 369], [390, 369]], '#8fa6b6');
  const moonMarks: readonly [number, number, number][] = [
    [300, 9, 2], [307, 12, 2], [314, 17, 2], [321, 13, 2],
    [330, 24, 2], [343, 19, 2], [351, 28, 2], [360, 27, 2], [367, 33, 2],
  ];
  for (let i = 0; i < moonMarks.length; i += 1) {
    const [y, width, height] = moonMarks[i];
    const offset = (i % 3 - 1) * 3;
    rect(418 - width / 2 + offset, y, width, height, i % 3 === 0 ? '#bdc8cb' : '#a5b5bf');
    rect(418 + width / 2 + offset + 4, y + 1, 4 + i % 4, 1, '#9eabb8');
  }
  ctx.restore();

  // Elliptical mosaic: tessellated border, a laurel wreath, and sixteen-point wind rose.
  const cx = 627;
  const cy = 399;
  const rx = 180;
  const ry = 52;
  const polar = (angle: number, radius: number): FloorPoint => [
    Math.round(cx + Math.cos(angle) * rx * radius),
    Math.round(cy + Math.sin(angle) * ry * radius),
  ];
  ellipse(cx, cy + 2, rx + 3, ry + 1, '#625a67');
  ellipse(cx, cy, rx + 1, ry + 1, GOLD_DARK);
  ellipse(cx, cy, rx, ry, GOLD_LIGHT);
  ellipse(cx, cy, rx - 2, ry - 1, '#26384e');
  for (let i = 0; i < 36; i += 1) {
    const start = i * Math.PI * 2 / 36;
    const end = (i + 1) * Math.PI * 2 / 36;
    polygon([polar(start, 0.985), polar(end, 0.985), polar(end, 0.90), polar(start, 0.90)], i % 2 ? '#2b4059' : '#4e5a69');
    const span = end - start;
    const path: FloorPoint[] = [
      polar(start + span * 0.12, 0.915), polar(start + span * 0.12, 0.97),
      polar(start + span * 0.80, 0.97), polar(start + span * 0.80, 0.925),
      polar(start + span * 0.39, 0.925), polar(start + span * 0.39, 0.95),
      polar(start + span * 0.60, 0.95),
    ];
    for (let p = 1; p < path.length; p += 1) line(path[p - 1], path[p], i % 3 === 0 ? GOLD_LIGHT : '#c29855');
  }
  ellipse(cx, cy, 161, 45, GOLD);
  ellipse(cx, cy, 158, 44, '#c4b59b');
  ellipse(cx, cy, 155, 43, '#aaa59c');
  for (let i = 0; i < 24; i += 1) {
    const a = i * Math.PI * 2 / 24;
    const b = (i + 1) * Math.PI * 2 / 24;
    polygon([polar(a, 0.86), polar(b, 0.86), polar(b, 0.61), polar(a, 0.61)], i % 3 === 0 ? '#bdb29f' : i % 3 === 1 ? '#9d9d9a' : '#b0aaa0');
    line(polar(a, 0.86), polar(a, 0.61), '#8c8b8d');
  }

  // Two sweeping laurel branches, each leaf built from a shaded four-pixel polygon.
  for (const side of [-1, 1]) {
    const branch: FloorPoint[] = [];
    for (let i = 0; i <= 12; i += 1) {
      const angle = side < 0 ? Math.PI * (0.52 + i * 0.077) : Math.PI * (0.48 - i * 0.077);
      branch.push(polar(angle, 0.73));
    }
    for (let i = 1; i < branch.length; i += 1) line(branch[i - 1], branch[i], GOLD_DARK);
    for (let i = 1; i < branch.length - 1; i += 1) {
      const p = branch[i];
      const previous = branch[i - 1];
      const next = branch[i + 1];
      const tx = next[0] - previous[0];
      const ty = next[1] - previous[1];
      const len = Math.max(1, Math.hypot(tx, ty));
      const tangentX = tx / len;
      const tangentY = ty / len;
      const normalX = -tangentY;
      const normalY = tangentX;
      for (const facing of [-1, 1]) {
        const length = 8 + (i % 3);
        const tip: FloorPoint = [p[0] + tangentX * 5 + normalX * length * facing, p[1] + tangentY * 3 + normalY * length * 0.55 * facing];
        polygon([p, [p[0] + tangentX * 8 + normalX * 3 * facing, p[1] + tangentY * 4 + normalY * 2 * facing], tip, [p[0] - tangentX * 2 + normalX * 4 * facing, p[1] - tangentY + normalY * 2 * facing]], facing < 0 ? '#6c754f' : '#8b8957');
        line(p, tip, facing < 0 ? '#b5a773' : '#c2b382');
      }
    }
  }

  ellipse(cx, cy, 109, 31, GOLD_DARK);
  ellipse(cx, cy, 106, 30, '#d5b773');
  ellipse(cx, cy, 103, 29, '#324a65');
  ellipse(cx, cy, 100, 28, '#2c405a');
  for (let i = 0; i < 16; i += 1) {
    const angle = i * Math.PI / 8 - Math.PI / 2;
    const length = i % 4 === 0 ? 0.55 : i % 2 === 0 ? 0.48 : 0.39;
    const tip = polar(angle, length);
    const rootLeft = polar(angle - 0.33, 0.13);
    const rootRight = polar(angle + 0.33, 0.13);
    const hub: FloorPoint = [cx, cy];
    polygon([tip, rootLeft, hub], i % 2 ? '#9e8e64' : '#e2c480');
    polygon([tip, hub, rootRight], i % 2 ? '#786747' : '#a98048');
    line(tip, hub, i % 4 === 0 ? '#f0d796' : '#bd9c5e');
  }
  for (let i = 0; i < 32; i += 1) {
    const a = i * Math.PI / 16;
    line(polar(a, 0.535), polar(a, i % 4 ? 0.55 : 0.57), '#c4a96e');
  }
  ellipse(cx, cy, 31, 9, GOLD_DARK);
  ellipse(cx, cy, 28, 8, '#dfc38b');
  ellipse(cx, cy, 23, 6, '#536f82');
  ellipse(cx - 3, cy - 1, 15, 4, '#8ba3b1');
  rect(cx - 1, cy - 2, 3, 4, '#e7d5a5');
  line([cx - 8, cy], [cx + 8, cy], '#d9c691');
  // The visible tessera joints curve with the design rather than covering it in speckles.
  for (let i = 0; i < 12; i += 1) {
    const a = i * Math.PI / 6 + 0.11;
    line(polar(a, 0.58), polar(a, 0.61), '#777e80');
    line(polar(a, 0.88), polar(a, 0.895), '#e0c894');
  }
  rect(cx - 24, 435, 17, 1, '#c7cbc7');
  rect(cx + 4, 440, 23, 1, '#b5c4ca');
  rect(cx - 9, 446, 13, 1, '#dbd6bf');

  // A crimson runner leads from the medallion straight up to the main painting.
  const runner = (half: number, top: number, bottom: number, color: string): void =>
    polygon([project(cx - half, top), project(cx + half, top), project(cx + half, bottom), project(cx - half, bottom)], color);
  runner(86, 299, 349, GOLD_DARK);
  runner(82, 299, 347, '#d5a75c');
  runner(78, 299, 346, '#5f1a2b');
  runner(74, 299, 345, '#8f2639');
  runner(54, 299, 345, '#7a2034');
  for (const y of [304, 316, 330]) {
    const [x] = project(cx, y);
    polygon([[x, y - 3], [x + 6, y], [x, y + 3], [x - 6, y]], '#c49343');
    polygon([[x, y - 1], [x + 3, y], [x, y + 1], [x - 3, y]], '#ffe6a2');
  }
  for (const side of [-1, 1]) line(project(cx + side * 79, 299), project(cx + side * 79, 346), '#ffe6a2');

  // Two broad, shallow stair flights. Upper tread, riser, lip, and contact shadow
  // remain distinct at one internal pixel and do not need an antialiased stroke.
  const stair = (left: number, right: number, y: number, height: number, offset: number): void => {
    polygon([[left, y], [right, y], [right + offset, y + 4], [left - offset, y + 4]], '#b5a99e');
    rect(left - offset, y + 4, right - left + offset * 2, height - 4, '#817988');
    rect(left - offset, y + 4, right - left + offset * 2, 1, '#d3c3a8');
    rect(left - offset, y + height - 2, right - left + offset * 2, 1, '#5b566a');
    rect(left - offset - 2, y + height - 1, right - left + offset * 2 + 4, 2, '#44495c');
    for (let x = left + 24; x < right - 12; x += 43) {
      rect(x, y + 5, 1, Math.max(1, height - 8), '#625c6e');
      rect(x + 1, y + 5, 1, Math.max(1, height - 9), '#aaa092');
      rect(x - 21, y + 1, 14, 1, '#c8bba7');
    }
  };
  rect(0, 269, 836, 3, '#514a59');
  stair(118, 1136, 269, 13, 6);
  stair(103, 1151, 282, 15, 9);
  // The nave stair takes one more, projecting step towards the visitor.
  stair(452, 802, 296, 12, 8);
  // Slightly taller side plinths support the columns and conceal their rear edge.
  polygon([[0, 270], [115, 270], [98, 297], [0, 303]], '#6f6879');
  polygon([[1139, 270], [1254, 270], [1254, 303], [1156, 297]], '#736b7a');
  line([0, 274], [112, 274], '#afa291');
  line([1142, 274], [1253, 274], '#b9aa94');
  line([98, 297], [0, 303], '#383d54', 2);
  line([1156, 297], [1253, 303], '#383d54', 2);
  // Each column presses a short, hard-edged contact shadow into both treads.
  for (const x of [150, 420, 834, 1104]) {
    polygon([[x - 13, 280], [x + 12, 280], [x + 17, 283], [x - 17, 283]], '#34394f');
    rect(x - 12, 283, 24, 3, '#48465a');
    polygon([[x - 12, 286], [x + 12, 286], [x + 17, 289], [x - 16, 289]], '#60596a');
  }
  rect(115, 281, 1024, 1, '#3c3e53');
  rect(94, 297, 358, 2, '#3c3e53');
  rect(802, 297, 358, 2, '#3c3e53');
  // Thin reflections in the treads line up with the flames and the moon.
  for (const x of [186, 384, 887, 1051]) {
    rect(x - 2, 271, 4, 1, '#ddbe87');
    rect(x - 3, 284, 7, 1, '#d0b485');
    rect(x - 4, 290, 8, 2, '#b69d7b');
    rect(x - 5, 293, 11, 3, '#c6aa78');
    rect(x - 2, 293, 4, 1, '#e0bf83');
  }
  rect(MOON_AXIS - 7, 271, 14, 1, '#d4cfc4');
  rect(MOON_AXIS - 11, 284, 22, 1, '#c1c2be');
  rect(MOON_AXIS - 17, 295, 34, 1, '#bdc1c1');
  // The runner continues up every tread and riser of the nave stair.
  for (const [y, height] of [[269, 13], [282, 15], [296, 12]]) {
    rect(cx - 31, y, 62, height - 1, '#5f1a2b');
    rect(cx - 29, y, 58, 4, '#a3304a');
    rect(cx - 29, y + 4, 58, height - 6, '#7a2034');
    rect(cx - 29, y + 4, 58, 1, '#c24a5a');
    rect(cx - 30, y, 1, height - 1, '#d5a75c');
    rect(cx + 29, y, 1, height - 1, '#d5a75c');
    rect(cx - 6, y + 1, 12, 1, '#ffe6a2');
  }

  ctx.restore();
}
