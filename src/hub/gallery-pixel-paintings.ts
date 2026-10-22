/**
 * The two gallery thresholds, painted at the hall's native 836 × 471 resolution.
 * All marks are integer pixel clusters; no source image is loaded at runtime.
 * Draw once into the static rear layer, before furniture and the live character.
 */

type PixelPoint = readonly [number, number];

const GOLD = {
  dark: '#483124', shade: '#755027', bronze: '#9d6b2d', mid: '#c49343',
  light: '#e8bf6a', shine: '#ffe6a2', inset: '#291e24',
};

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  ctx.fillStyle = color;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
}

/** Scanline polygons keep diagonals visibly stepped even at integer enlargement. */
function poly(ctx: CanvasRenderingContext2D, points: readonly PixelPoint[], color: string): void {
  const minY = Math.ceil(Math.min(...points.map(point => point[1])));
  const maxY = Math.floor(Math.max(...points.map(point => point[1])));
  for (let y = minY; y <= maxY; y++) {
    const intersections: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        intersections.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      rect(ctx, Math.ceil(intersections[i]), y, Math.floor(intersections[i + 1]) - Math.ceil(intersections[i]) + 1, 1, color);
    }
  }
}

function oval(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string): void {
  for (let y = -ry; y <= ry; y++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    rect(ctx, cx - half, cy + y, half * 2 + 1, 1, color);
  }
}

function hash(n: number): number {
  let value = Math.imul(n ^ 0x56f3ab1d, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

function cypress(ctx: CanvasRenderingContext2D, x: number, bottom: number, height: number, tint = '#121d29'): void {
  const width = Math.max(3, Math.round(height / 9));
  rect(ctx, x, bottom - height + 4, 1, height - 4, '#373b32');
  poly(ctx, [[x, bottom - height], [x + width, bottom - height / 3], [x + width - 1, bottom - 3],
    [x - width, bottom - 2], [x - width + 1, bottom - height / 2]], tint);
  for (let y = bottom - height + 7; y < bottom - 4; y += 5) {
    rect(ctx, x - 1, y, 2, 2, tint === '#121d29' ? '#25313a' : '#304943');
  }
}

function shrub(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, sunny: boolean, flowers = false): void {
  const shades = sunny ? ['#283f3c', '#3e5f43', '#66804e', '#8c9859'] : ['#101c29', '#1e2a32', '#2c3939', '#3d4540'];
  oval(ctx, x, y, radius, Math.max(2, Math.round(radius * .65)), shades[0]);
  for (let i = 0; i < radius + 3; i++) {
    const angle = (i / (radius + 3)) * Math.PI * 2;
    const px = Math.round(x + Math.cos(angle) * radius * .7);
    const py = Math.round(y + Math.sin(angle) * radius * .45);
    oval(ctx, px, py, 2 + (i % 3), 2, shades[1 + (i % 3)]);
  }
  if (flowers) {
    for (let i = 0; i < radius; i += 2) {
      const px = x - radius + hash(i + x * 13) % (radius * 2 + 1);
      const py = y - 4 + hash(i + y * 9) % 7;
      rect(ctx, px, py, 2, 2, i % 4 === 0 ? '#a32740' : '#e05152');
      rect(ctx, px, py, 1, 1, '#f37a67');
    }
  }
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, color: string): void {
  rect(ctx, x, y + 4, width, 4, color);
  rect(ctx, x + 3, y + 1, width - 6, 6, color);
  rect(ctx, x + Math.round(width * .3), y - 2, Math.round(width * .3), 8, color);
  rect(ctx, x + 1, y + 7, width - 2, 2, '#d2e1da');
}

/** Local coordinates are constrained to the 112 × 175 opening by a rectangle clip. */
function redMoonLandscape(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
  const local = (px: number, py: number, w: number, h: number, color: string): void => rect(ctx, x + px, y + py, w, h, color);
  const shape = (points: readonly PixelPoint[], color: string): void => poly(ctx, points.map(p => [p[0] + x, p[1] + y]), color);
  local(0, 0, width, height, '#271b36');
  local(0, 20, width, 28, '#45213e');
  local(0, 48, width, 25, '#67263f');
  local(0, 73, width, 25, '#4c2940');
  local(0, 98, width, height - 98, '#242534');
  oval(ctx, x + 52, y + 35, 24, 24, '#763044');
  oval(ctx, x + 52, y + 35, 21, 21, '#b63647');
  oval(ctx, x + 52, y + 35, 18, 19, '#db424c');
  oval(ctx, x + 49, y + 30, 15, 15, '#e94e51');
  const craters: readonly [number, number, number, number][] = [[45, 25, 4, 3], [58, 21, 2, 3], [57, 39, 5, 4], [42, 41, 3, 5], [49, 48, 3, 2], [64, 31, 3, 4], [49, 34, 2, 2]];
  for (const [cx, cy, rx, ry] of craters) oval(ctx, x + cx, y + cy, rx, ry, '#b93446');
  for (let i = 0; i < 13; i++) {
    const px = 9 + hash(i * 9 + 1) % 94, py = 5 + hash(i * 9 + 7) % 63;
    if (Math.hypot(px - 52, py - 35) > 27) local(px, py, i % 4 === 0 ? 2 : 1, 1, '#aa5c68');
  }
  shape([[0, 88], [18, 66], [31, 75], [48, 64], [73, 81], [94, 67], [112, 82], [112, 117], [0, 117]], '#382a3d');
  shape([[35, 107], [48, 88], [68, 94], [83, 84], [112, 104], [112, 136], [34, 136]], '#33323f');
  // A ruined hilltop temple: deep cella, individually lit columns, broken pediment.
  shape([[61, 67], [82, 57], [104, 66], [104, 70], [60, 71]], '#181e30');
  line(ctx, x + 61, y + 66, x + 82, y + 57, '#80525b');
  line(ctx, x + 82, y + 57, x + 103, y + 66, '#925e62');
  local(62, 69, 41, 3, '#71515b');
  local(66, 73, 34, 22, '#202335');
  for (const px of [64, 73, 83, 94, 100]) {
    const top = px === 83 ? 78 : 72;
    local(px, top, 4, 24 - (top - 72), '#55424e');
    local(px, top, 1, 24 - (top - 72), '#986064');
    local(px + 3, top, 1, 24 - (top - 72), '#302e3f');
    local(px - 1, top, 6, 2, '#85606a');
    local(px - 1, 94, 6, 2, '#76616c');
  }
  local(61, 97, 47, 3, '#6f5760'); local(58, 100, 52, 3, '#3d3646');
  shape([[53, 104], [72, 103], [67, 110], [90, 110], [96, 122], [112, 126], [112, 143], [51, 140]], '#41404a');
  for (let row = 0; row < 5; row++) {
    const py = 106 + row * 7;
    for (let col = 0; col < 5; col++) {
      const px = 56 + col * 11 + (row % 2) * 4;
      local(px, py, 6 + hash(px + py) % 4, 2, row % 2 ? '#56505a' : '#696069');
    }
  }
  // Lower ruined aqueduct, with open dark arches rather than a flat block.
  shape([[7, 105], [17, 91], [22, 94], [25, 111], [65, 129], [65, 146], [4, 125]], '#51444f');
  line(ctx, x + 14, y + 106, x + 66, y + 129, '#8a6870');
  for (let i = 0; i < 5; i++) {
    const px = 16 + i * 9, py = 109 + i * 4;
    local(px, py + 4, 5, 18, '#161f2c');
    oval(ctx, x + px + 2, y + py + 4, 2, 3, '#161f2c');
    local(px - 2, py + 2, 2, 19, '#76616a');
    local(px - 3, py + 1, 3, 2, '#a47a7d');
  }
  // Winding stone steps widen toward the threshold.
  shape([[63, 128], [70, 128], [62, 137], [66, 145], [56, 154], [62, 165], [82, height], [23, height], [42, 160], [40, 151], [52, 140]], '#7b6468');
  for (let row = 0; row < 10; row++) {
    const py = 130 + row * 5, center = 65 - Math.sin(row * .7) * 10;
    const half = 4 + row * 2;
    line(ctx, x + center - half, y + py, x + center + half, y + py, '#b08a82');
    line(ctx, x + center - half, y + py + 2, x + center + half, y + py + 2, '#3b3440');
    line(ctx, x + center + (row % 2 ? 2 : -3), y + py, x + center + (row % 2 ? 2 : -3), y + py + 3, '#574650');
  }
  cypress(ctx, x + 10, y + 140, 100, '#0e1a28');
  cypress(ctx, x + 20, y + 111, 66, '#182333');
  cypress(ctx, x + 103, y + 151, 105, '#101b28');
  cypress(ctx, x + 94, y + 143, 56, '#1e2833');
  for (const [px, py, radius] of [[8, 150, 13], [15, 166, 16], [100, 152, 13], [95, 173, 17], [29, 150, 7], [82, 144, 8]] as const) {
    shrub(ctx, x + px, y + py, radius, false, true);
  }
  // Two tiny amber votives make the stair's depth readable against cool stone.
  local(27, 128, 3, 4, '#6e3734'); local(28, 125, 1, 4, '#ffc47c');
  local(44, 136, 2, 3, '#f6a365'); local(44, 139, 3, 1, '#5f4147');
  ctx.restore();
}

function aegeanLandscape(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
  const local = (px: number, py: number, w: number, h: number, color: string): void => rect(ctx, x + px, y + py, w, h, color);
  const shape = (points: readonly PixelPoint[], color: string): void => poly(ctx, points.map(p => [p[0] + x, p[1] + y]), color);
  local(0, 0, width, height, '#68b7d7'); local(0, 36, width, 34, '#92cadc');
  cloud(ctx, x + 3, y + 12, 24, '#fff2d2'); cloud(ctx, x + 18, y + 27, 31, '#f2edda');
  cloud(ctx, x + 73, y + 9, 34, '#e8ecdf'); cloud(ctx, x + 48, y + 33, 21, '#fff3d4');
  shape([[0, 77], [13, 58], [21, 64], [36, 44], [46, 61], [53, 54], [72, 76], [112, 76], [112, 100], [0, 100]], '#71a4be');
  shape([[8, 75], [35, 47], [30, 63], [37, 60], [45, 75], [50, 64], [59, 78]], '#aecbd2');
  shape([[0, 87], [25, 72], [42, 80], [61, 68], [81, 84], [112, 80], [112, 103], [0, 103]], '#739b9b');
  local(0, 91, width, height - 91, '#258da6'); local(0, 116, width, 34, '#20809a');
  local(0, 147, width, height - 147, '#317b83');
  // Raking sun on a faceted limestone headland; selected seams follow its shape.
  shape([[72, 76], [101, 71], [112, 83], [112, 141], [86, 142], [65, 135], [48, 129], [54, 116], [60, 110], [61, 92]], '#c9be99');
  shape([[79, 82], [94, 79], [87, 100], [90, 112], [82, 131], [70, 135], [62, 127], [69, 109]], '#eee0b6');
  shape([[96, 79], [107, 77], [112, 86], [109, 115], [112, 133], [96, 139], [99, 120], [92, 107]], '#a7a68e');
  shape([[62, 96], [72, 86], [67, 109], [59, 122], [61, 133], [48, 129], [54, 116]], '#ebe0c3');
  for (const [x0, y0, x1, y1] of [[80, 93, 75, 111], [75, 115, 71, 127], [93, 93, 91, 101], [100, 114, 96, 129], [62, 116, 57, 125], [105, 89, 103, 105]] as const) {
    line(ctx, x + x0, y + y0, x + x1, y + y1, '#949e92');
    line(ctx, x + x0 + 2, y + y0, x + x1 + 2, y + y1 - 2, '#fff0ca');
  }
  // The sunlit temple keeps separate roof, entablature, column light and cast shade.
  shape([[61, 48], [84, 38], [108, 46], [105, 51], [61, 53]], '#e6cfa0');
  line(ctx, x + 61, y + 47, x + 84, y + 38, '#fff4ce');
  line(ctx, x + 84, y + 38, x + 108, y + 46, '#fff4ce');
  shape([[66, 47], [84, 41], [101, 47]], '#b8ad91');
  local(62, 51, 44, 3, '#fff0c5'); local(63, 54, 42, 3, '#bbab87');
  local(67, 58, 35, 20, '#719191');
  for (const px of [64, 72, 80, 88, 97, 103]) {
    local(px, 57, 4, 24, '#fff0cc'); local(px + 3, 58, 1, 22, '#b5ad8e');
    local(px + 1, 60, 1, 18, '#e5d7b2');
    local(px - 1, 56, 6, 2, '#fff3cf'); local(px - 1, 80, 6, 2, '#d7c8a2');
  }
  local(60, 83, 49, 3, '#f6e5bc'); local(57, 86, 54, 2, '#c4b895');
  local(55, 89, 57, 2, '#f3e5c4');
  for (const [px, py, radius] of [[58, 92, 7], [105, 88, 9], [91, 95, 5], [110, 110, 6], [65, 110, 4]] as const) shrub(ctx, x + px, y + py, radius, true);
  cypress(ctx, x + 103, y + 85, 54, '#294d43');
  cypress(ctx, x + 54, y + 95, 31, '#365c49');
  // Horizontal wave clusters thin out toward the horizon; no uniform noise field.
  for (let row = 0; row < 11; row++) {
    const py = 96 + row * 6;
    for (let i = 0; i < 3; i++) {
      const px = 3 + hash(row * 19 + i * 11) % (row < 6 ? 43 : 70);
      const length = 2 + row % 4;
      local(px, py + i % 2, length, 1, row % 3 === 0 ? '#b7e4d5' : '#5dbdbf');
    }
  }
  shape([[0, 148], [22, 140], [33, 145], [23, 153], [36, 157], [51, 149], [69, 147], [82, 156], [112, 151], [112, height], [0, height]], '#a6b08a');
  shape([[0, 153], [25, 146], [18, 154], [32, 161], [52, 154], [63, 154], [48, 162], [32, height], [19, height], [32, 164], [12, 159], [0, 162]], '#eed9a6');
  line(ctx, x + 1, y + 146, x + 19, y + 141, '#d5ebd7');
  line(ctx, x + 19, y + 141, x + 29, y + 145, '#d5ebd7');
  for (const [px, py, radius] of [[4, 168, 15], [17, 171, 10], [90, 158, 14], [105, 174, 16], [70, 169, 9]] as const) shrub(ctx, x + px, y + py, radius, true, py === 174);
  // An olive tree with distinct trunk, forks and lit leaf clusters.
  line(ctx, x + 82, y + 161, x + 83, y + 137, '#645647');
  line(ctx, x + 83, y + 146, x + 73, y + 135, '#645647');
  line(ctx, x + 83, y + 144, x + 94, y + 131, '#645647');
  shrub(ctx, x + 74, y + 132, 9, true); shrub(ctx, x + 88, y + 127, 12, true); shrub(ctx, x + 98, y + 133, 8, true);
  cypress(ctx, x + 6, y + 164, 52, '#244f43');
  ctx.restore();
}

function laurel(ctx: CanvasRenderingContext2D, cx: number, cy: number, direction: -1 | 1): void {
  line(ctx, cx, cy + 11, cx + direction * 24, cy - 12, GOLD.bronze);
  for (let i = 0; i < 7; i++) {
    const px = cx + direction * (4 + i * 3), py = cy + 8 - i * 3;
    const side = i % 2 === 0 ? -1 : 1;
    poly(ctx, [[px, py], [px + direction * 4, py - 1 + side * 4], [px + direction * 5, py - 4 + side * 2], [px + direction, py - 3]], i % 2 ? GOLD.mid : GOLD.light);
    rect(ctx, px + direction * 2, py - 2, 1, 2, GOLD.shine);
  }
}

function crown(ctx: CanvasRenderingContext2D, center: number, top: number, sunny: boolean): void {
  // The upper silhouette starts at y=35; the lower jewel joins the frame bevel.
  poly(ctx, [[center - 47, top + 26], [center - 38, top + 20], [center - 25, top + 18], [center - 17, top + 7],
    [center, top + 1], [center + 18, top + 7], [center + 26, top + 18], [center + 40, top + 21], [center + 48, top + 26]], GOLD.dark);
  laurel(ctx, center - 18, top + 16, -1); laurel(ctx, center + 18, top + 16, 1);
  oval(ctx, center, top + 15, 17, 16, GOLD.shade);
  oval(ctx, center, top + 14, 15, 14, GOLD.light);
  oval(ctx, center, top + 14, 13, 12, '#26324b');
  oval(ctx, center, top + 14, 11, 10, '#1a2941');
  if (sunny) {
    oval(ctx, center, top + 14, 4, 4, GOLD.light);
    rect(ctx, center - 1, top + 12, 3, 3, GOLD.shine);
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      line(ctx, center + Math.cos(angle) * 6, top + 14 + Math.sin(angle) * 6,
        center + Math.cos(angle) * 10, top + 14 + Math.sin(angle) * 10, GOLD.mid);
    }
  } else {
    oval(ctx, center, top + 14, 8, 9, GOLD.light);
    oval(ctx, center + 4, top + 11, 7, 9, '#1a2941');
    rect(ctx, center - 7, top + 10, 1, 5, GOLD.shine);
    rect(ctx, center + 6, top + 19, 1, 1, GOLD.light);
  }
  rect(ctx, center - 3, top + 30, 7, 2, GOLD.bronze);
  poly(ctx, [[center - 3, top + 29], [center, top + 33], [center + 3, top + 29]], GOLD.light);
}

function goldFrame(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, sunny: boolean): void {
  // A black contact shadow, bronze side thickness and stepped bevel enclose the art.
  rect(ctx, x + 3, y + 3, width - 3, height - 3, '#171a28');
  rect(ctx, x, y, width - 3, height - 3, GOLD.dark);
  rect(ctx, x + 1, y, width - 5, 2, GOLD.shine);
  rect(ctx, x + 1, y + 2, 3, height - 6, GOLD.mid);
  rect(ctx, x + width - 7, y + 2, 4, height - 5, GOLD.shade);
  rect(ctx, x + 4, y + 3, width - 11, 3, GOLD.bronze);
  rect(ctx, x + 4, y + 3, 2, height - 10, GOLD.light);
  rect(ctx, x + 6, y + 6, width - 15, 2, GOLD.shine);
  rect(ctx, x + 6, y + 6, 2, height - 15, GOLD.bronze);
  rect(ctx, x + width - 11, y + 6, 2, height - 15, GOLD.light);
  rect(ctx, x + 7, y + height - 10, width - 16, 3, GOLD.light);
  rect(ctx, x + 1, y + height - 6, width - 5, 2, GOLD.bronze);
  rect(ctx, x + 2, y + height - 4, width - 5, 1, GOLD.light);
  rect(ctx, x + 11, y + 9, width - 26, 2, GOLD.inset);
  rect(ctx, x + 9, y + 9, 3, height - 21, GOLD.inset);
  rect(ctx, x + width - 15, y + 9, 2, height - 21, GOLD.inset);
  rect(ctx, x + 11, y + height - 14, width - 24, 3, GOLD.inset);
  // Repeated acanthus twists follow the frame; highlight is consistently upper-left.
  for (let py = y + 14; py < y + height - 15; py += 12) {
    for (const px of [x + 4, x + width - 9]) {
      line(ctx, px, py + 8, px + 2, py + 4, GOLD.dark);
      poly(ctx, [[px, py + 6], [px - 1, py + 2], [px + 2, py], [px + 3, py + 3]], GOLD.mid);
      rect(ctx, px, py + 1, 1, 3, GOLD.shine);
      poly(ctx, [[px + 1, py + 8], [px + 4, py + 5], [px + 4, py + 9], [px + 2, py + 10]], GOLD.light);
    }
  }
  for (let px = x + 15; px < x + width - 17; px += 10) {
    line(ctx, px, y + 4, px + 3, y + 2, GOLD.light);
    line(ctx, px + 3, y + 2, px + 6, y + 5, GOLD.dark);
    line(ctx, px, y + height - 8, px + 3, y + height - 11, GOLD.dark);
    line(ctx, px + 3, y + height - 11, px + 7, y + height - 8, GOLD.shine);
    rect(ctx, px + 3, y + height - 9, 2, 1, GOLD.bronze);
  }
  for (const px of [x + 2, x + width - 10]) {
    for (const py of [y + 2, y + height - 12]) {
      poly(ctx, [[px, py], [px + 7, py + 1], [px + 8, py + 8], [px + 4, py + 6], [px + 1, py + 8]], GOLD.mid);
      line(ctx, px + 1, py + 1, px + 5, py + 3, GOLD.shine);
      rect(ctx, px + 3, py + 4, 2, 2, GOLD.dark);
    }
  }
  crown(ctx, x + Math.floor((width - 3) / 2), Math.max(36, y - 28), sunny);
}

/** Static art only: no timers, inputs, profile access, images or lifecycle ownership. */
export function drawPixelPaintings(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // The bevel's solid backing is behind the clipped openings, never over the art.
  goldFrame(ctx, 188, 62, 137, 207, false);
  goldFrame(ctx, 512, 58, 139, 211, true);
  redMoonLandscape(ctx, 200, 74, 110, 180);
  aegeanLandscape(ctx, 524, 70, 112, 184);
  ctx.restore();
}
