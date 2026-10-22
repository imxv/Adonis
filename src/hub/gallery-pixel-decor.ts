/** Static side-room furnishings. All coordinates belong to the 836 × 471 pixel scene. */
const P = {
  ink: '#101c35', midnight: '#17263d', blue: '#243858',
  stoneDark: '#514a59', stone: '#8d8290', stoneLight: '#c8b8a0', ivory: '#e8d8b7',
  goldDark: '#60442e', gold: '#aa783d', goldLight: '#eac77b', goldWhite: '#f4dc9b',
  leafDark: '#173d35', leaf: '#3b6846', leafLight: '#7e9755', leafBlue: '#28524e',
  wine: '#551f38', red: '#9f3041', coral: '#ce554b',
  waterDark: '#183c55', water: '#286d7b', waterLight: '#64adaf', waterWhite: '#add8ce',
  woodDark: '#2b2532', wood: '#493331', woodLight: '#795340',
} as const;

type Point = readonly [number, number];

function rect(c: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function line(c: CanvasRenderingContext2D, color: string, x0: number, y0: number, x1: number, y1: number, width = 1): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    rect(c, color, x0, y0, width, width);
    if (x0 === x1 && y0 === y1) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
}

function ellipse(c: CanvasRenderingContext2D, color: string, x: number, y: number, rx: number, ry: number): void {
  for (let yy = -Math.ceil(ry); yy <= Math.ceil(ry); yy++) {
    const t = yy / ry;
    if (Math.abs(t) > 1) continue;
    const xx = Math.floor(rx * Math.sqrt(1 - t * t));
    rect(c, color, x - xx, y + yy, xx * 2 + 1, 1);
  }
}

function polygon(c: CanvasRenderingContext2D, color: string, points: readonly Point[]): void {
  const top = Math.ceil(Math.min(...points.map(p => p[1])));
  const bottom = Math.floor(Math.max(...points.map(p => p[1])));
  for (let y = top; y <= bottom; y++) {
    const intersections: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        intersections.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = Math.ceil(intersections[i]), right = Math.floor(intersections[i + 1]);
      rect(c, color, left, y, right - left + 1, 1);
    }
  }
}

function stoneBlock(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, warm = false): void {
  rect(c, P.ink, x - 1, y - 1, w + 2, h + 3);
  rect(c, P.stoneDark, x, y, w, h);
  rect(c, warm ? '#aaa08b' : P.stone, x + 1, y + 1, w - 3, h - 3);
  rect(c, warm ? P.ivory : P.stoneLight, x + 1, y, w - 2, 2);
  rect(c, '#a99da3', x + 1, y + 2, 2, h - 4);
  rect(c, '#68606f', x + w - 4, y + 3, 3, h - 5);
  line(c, '#77717f', x + w * .43, y + 4, x + w * .46, y + h * .53);
  line(c, '#77717f', x + w * .46, y + h * .53, x + w * .62, y + h * .68);
  line(c, '#c1b5ac', x + w * .46 - 1, y + 5, x + w * .49 - 1, y + h * .53);
}

function greekBand(c: CanvasRenderingContext2D, x: number, y: number, width: number, color: string, scale = 1): void {
  for (let xx = x; xx < x + width - 5 * scale; xx += 8 * scale) {
    rect(c, color, xx, y, 6 * scale, scale);
    rect(c, color, xx + 5 * scale, y, scale, 5 * scale);
    rect(c, color, xx + 2 * scale, y + 4 * scale, 4 * scale, scale);
    rect(c, color, xx + 2 * scale, y + 2 * scale, scale, 3 * scale);
  }
}

function leaf(c: CanvasRenderingContext2D, x: number, y: number, side: number, size: number, cool = false): void {
  polygon(c, P.leafDark, [[x, y + 2], [x + side * size, y - 3], [x + side * (size + 2), y], [x + side * 3, y + 5]]);
  polygon(c, cool ? P.leafBlue : P.leaf, [[x, y + 1], [x + side * size, y - 3], [x + side * (size + 1), y - 1], [x + side * 3, y + 2]]);
  line(c, cool ? '#608e76' : P.leafLight, x + side * 2, y, x + side * (size - 1), y - 2);
}

function flower(c: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
  rect(c, P.wine, x - 4 * scale, y, 9 * scale, 3 * scale);
  rect(c, P.wine, x - 2 * scale, y - 3 * scale, 5 * scale, 8 * scale);
  rect(c, P.red, x - 4 * scale, y - scale, 4 * scale, 3 * scale);
  rect(c, P.red, x + scale, y - 2 * scale, 3 * scale, 4 * scale);
  rect(c, P.coral, x - 2 * scale, y - 3 * scale, 3 * scale, 2 * scale);
  rect(c, '#ba3a46', x - scale, y + 2 * scale, 3 * scale, 2 * scale);
  rect(c, P.goldLight, x, y, scale, scale);
}

/** Branches establish a canopy; fixed offsets add small, clustered leaf variation. */
function shrub(c: CanvasRenderingContext2D, x: number, y: number, radius: number, height: number, variant: number, roses = false): void {
  ellipse(c, P.ink, x, y + 2, radius + 3, Math.max(4, radius / 4));
  const stems = [-.88, -.57, -.26, .05, .34, .64, .9];
  stems.forEach((spread, index) => {
    const tipX = Math.round(x + spread * radius);
    const tipY = Math.round(y - height * (.65 + .35 * Math.cos(spread * 1.3)) + (index + variant) % 3);
    line(c, '#243c34', x, y, tipX, tipY, 2);
    line(c, '#827653', x, y - 1, tipX, tipY);
    for (let j = 1; j <= 5; j++) {
      const t = j / 6;
      const xx = Math.round(x + (tipX - x) * t);
      const yy = Math.round(y + (tipY - y) * t);
      const s = 4 + ((index * 3 + j + variant) % 4);
      leaf(c, xx, yy, -1, s, index % 2 === 0);
      leaf(c, xx + 1, yy - 2, 1, Math.max(3, s - 1), index % 3 === 0);
    }
    leaf(c, tipX, tipY + 1, index % 2 ? -1 : 1, 5, index % 2 === 0);
    if (roses && (index + variant) % 2 === 0) flower(c, tipX, tipY + 2);
  });
}

function terracotta(c: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, decorated = false): void {
  const half = width / 2;
  ellipse(c, P.ink, x, y + 1, half + 5, 4);
  polygon(c, '#251e2d', [[x - half * .66, y - height], [x + half * .66, y - height], [x + half * .5, y - height * .73], [x + half, y - height * .52], [x + half * .89, y - 12], [x + half * .48, y - 4], [x + half * .6, y], [x - half * .6, y], [x - half * .48, y - 4], [x - half * .9, y - 12], [x - half, y - height * .52], [x - half * .5, y - height * .73]]);
  polygon(c, decorated ? '#594031' : '#925c42', [[x - half * .54, y - height + 3], [x + half * .47, y - height + 3], [x + half * .4, y - height * .72], [x + half * .86, y - height * .49], [x + half * .77, y - 13], [x + half * .39, y - 5], [x - half * .37, y - 5], [x - half * .79, y - 14], [x - half * .86, y - height * .49], [x - half * .38, y - height * .72]]);
  polygon(c, decorated ? '#92693d' : '#bc8257', [[x - half * .55, y - height * .64], [x - half * .32, y - height * .72], [x - half * .29, y - height + 4], [x - half * .1, y - height + 4], [x - half * .12, y - height * .67], [x - half * .53, y - height * .44], [x - half * .53, y - 16], [x - half * .7, y - 20], [x - half * .72, y - height * .48]]);
  line(c, '#cc9a66', x - half * .57, y - height * .52, x - half * .57, y - height * .26);
  rect(c, P.goldDark, x - half * .7, y - height - 1, width * .7, 4);
  rect(c, P.gold, x - half * .65, y - height - 1, width * .65, 1);
  ellipse(c, '#211f2c', x, y - height + 1, half * .44, 1);
  for (const side of [-1, 1]) {
    line(c, P.goldDark, x + side * half * .43, y - height * .81, x + side * half * .89, y - height * .77, 3);
    line(c, P.goldDark, x + side * half * .89, y - height * .77, x + side * (half + 2), y - height * .57, 3);
    line(c, '#aa7c4b', x + side * (half + 2), y - height * .57, x + side * half * .86, y - height * .46, 2);
  }
  rect(c, P.goldDark, x - half * .6, y - 3, width * .6, 3);
  rect(c, P.gold, x - half * .55, y - 3, width * .55, 1);
  if (decorated) {
    greekBand(c, x - half * .68, y - height * .29, width * .68, '#c59352');
    line(c, '#c59352', x - half * .72, y - height * .61, x + half * .72, y - height * .61);
    const figureY = y - height * .53;
    ellipse(c, '#c59352', x - 2, figureY, 2, 2);
    line(c, '#c59352', x - 2, figureY + 3, x + 1, figureY + 12, 2);
    line(c, '#c59352', x - 1, figureY + 5, x - 8, figureY + 8, 2);
    line(c, '#c59352', x + 1, figureY + 6, x + 7, figureY + 2, 2);
    line(c, '#c59352', x + 1, figureY + 12, x - 6, figureY + 21, 2);
    line(c, '#c59352', x + 1, figureY + 12, x + 7, figureY + 19, 2);
  }
}

function candle(c: CanvasRenderingContext2D, x: number, y: number, height: number): void {
  ellipse(c, '#362b32', x, y + 2, 9, 2);
  rect(c, P.goldDark, x - 7, y - 1, 15, 2);
  rect(c, P.gold, x - 5, y - 2, 11, 1);
  rect(c, P.goldDark, x - 2, y - height + 9, 5, height - 10);
  rect(c, P.goldLight, x - 1, y - height + 10, 1, height - 11);
  rect(c, P.gold, x - 5, y - height + 7, 11, 3);
  rect(c, '#b5a47b', x - 2, y - height - 1, 5, 8);
  rect(c, '#ecd6a2', x - 2, y - height - 1, 2, 7);
  // The flame is static here. The caller can overdraw a two-frame local flicker.
  polygon(c, '#a85f34', [[x - 2, y - height - 1], [x - 3, y - height - 6], [x, y - height - 12], [x + 3, y - height - 5], [x + 2, y - height - 1]]);
  rect(c, '#edac50', x - 1, y - height - 8, 3, 7);
  rect(c, '#ffe3a0', x, y - height - 5, 1, 4);
}

function pool(c: CanvasRenderingContext2D): void {
  // Three stone terraces and a scalloped basin, with warm torch reflections.
  polygon(c, '#101b2d', [[0, 283], [122, 275], [181, 293], [182, 339], [125, 361], [0, 356]]);
  polygon(c, '#514d5c', [[0, 302], [121, 291], [179, 303], [177, 341], [126, 359], [0, 355]]);
  polygon(c, '#8f8790', [[0, 298], [120, 287], [180, 300], [174, 309], [124, 324], [0, 321]]);
  polygon(c, '#c2b8ae', [[0, 296], [120, 285], [180, 298], [178, 301], [121, 291], [0, 302]]);
  polygon(c, '#282e43', [[0, 302], [118, 292], [169, 300], [164, 305], [117, 317], [0, 315]]);
  polygon(c, P.waterDark, [[0, 304], [117, 295], [163, 301], [159, 305], [116, 315], [0, 313]]);
  for (let row = 0; row < 5; row++) {
    const yy = 302 + row * 3;
    for (let k = 0; k < 8; k++) {
      const xx = 5 + k * 20 + (row % 2) * 7;
      if (xx < 156 && !(row > 2 && xx > 130)) rect(c, row % 2 ? P.water : P.waterLight, xx, yy, 5 + (k % 3) * 2, 1);
    }
  }
  // Facing stones are separate blocks, rather than one flat pool outline.
  for (let k = 0; k < 5; k++) {
    const x = 3 + k * 24;
    polygon(c, k % 2 ? '#8b8290' : '#9b9196', [[x, 322], [x + 23, 323], [x + 23, 350 + k], [x, 350 + k]]);
    line(c, '#c5b5a5', x + 1, 323, x + 22, 324);
    line(c, '#5c586b', x + 23, 326, x + 23, 352 + k);
    line(c, '#6d6674', x + 8, 328, x + 10, 339);
    line(c, '#b8aa9d', x + 9, 328, x + 11, 339);
  }
  for (let k = 0; k < 3; k++) {
    const x = 125 + k * 16, yy = 323 - k * 5;
    polygon(c, '#777380', [[x, yy], [x + 15, yy - 5], [x + 15, yy + 26], [x, yy + 32]]);
    line(c, '#b6b0a9', x + 1, yy, x + 15, yy - 4);
    line(c, '#4a4b60', x + 15, yy - 2, x + 15, yy + 25);
  }
  // Upper spring: two channels spill over the lip into the lower basin.
  stoneBlock(c, 0, 264, 81, 20);
  stoneBlock(c, 8, 246, 58, 18, true);
  ellipse(c, P.stoneLight, 36, 247, 33, 6);
  ellipse(c, '#454b5b', 36, 247, 27, 4);
  ellipse(c, P.water, 36, 247, 25, 3);
  rect(c, P.waterDark, 64, 265, 13, 38);
  rect(c, P.water, 65, 265, 8, 37);
  rect(c, P.waterLight, 66, 267, 2, 33);
  rect(c, P.waterWhite, 69, 268, 1, 28);
  rect(c, P.waterLight, 73, 277, 1, 19);
  rect(c, P.waterDark, 109, 285, 12, 24);
  rect(c, P.water, 110, 285, 8, 24);
  rect(c, P.waterLight, 112, 286, 2, 21);
  rect(c, P.waterWhite, 115, 287, 1, 17);
  ellipse(c, P.waterLight, 69, 305, 12, 2);
  ellipse(c, P.waterWhite, 69, 304, 7, 1);
  ellipse(c, P.waterLight, 115, 311, 10, 2);
  rect(c, '#ba9767', 145, 304, 9, 1);
  rect(c, '#8a795f', 141, 308, 8, 1);
  // Lower ledges carry carved foliate medallions and shaded seams.
  for (const x of [15, 65, 112]) {
    ellipse(c, '#686374', x, 337, 7, 8);
    ellipse(c, '#b4a89f', x - 1, 336, 5, 6);
    line(c, '#7d7480', x - 1, 331, x - 1, 342);
    leaf(c, x - 1, 335, -1, 3);
    leaf(c, x, 338, 1, 3);
  }
  polygon(c, '#4d4e64', [[0, 356], [123, 360], [180, 340], [181, 348], [124, 370], [0, 365]]);
  line(c, '#a79a93', 0, 356, 123, 360, 2);
  line(c, '#9d9291', 124, 360, 180, 341, 2);
}

function littleStatue(c: CanvasRenderingContext2D, x: number, y: number): void {
  ellipse(c, '#1b2438', x, y + 2, 16, 4);
  stoneBlock(c, x - 12, y - 9, 25, 10, true);
  rect(c, '#837b81', x - 8, y - 13, 17, 4);
  rect(c, '#c5b9a3', x - 9, y - 15, 18, 3);
  polygon(c, '#988d8b', [[x - 5, y - 61], [x + 6, y - 61], [x + 9, y - 48], [x + 6, y - 38], [x + 10, y - 16], [x - 10, y - 16], [x - 6, y - 38], [x - 8, y - 47]]);
  polygon(c, P.stoneLight, [[x - 5, y - 60], [x + 1, y - 60], [x + 3, y - 48], [x, y - 37], [x + 3, y - 18], [x - 7, y - 18], [x - 4, y - 38], [x - 6, y - 48]]);
  line(c, P.ivory, x - 5, y - 57, x - 3, y - 46);
  for (const [dx, lean] of [[-4, -2], [0, 1], [4, 3]]) line(c, '#6e6874', x + dx, y - 39, x + dx + lean, y - 19);
  polygon(c, '#a99c93', [[x - 7, y - 57], [x - 12, y - 48], [x - 12, y - 36], [x - 9, y - 35], [x - 8, y - 47], [x - 3, y - 54]]);
  polygon(c, P.stoneLight, [[x + 6, y - 57], [x + 12, y - 49], [x + 16, y - 52], [x + 17, y - 50], [x + 12, y - 45], [x + 8, y - 47]]);
  line(c, '#d9c7a9', x + 17, y - 65, x + 17, y - 21);
  rect(c, P.gold, x + 16, y - 68, 3, 5);
  rect(c, '#7d7380', x - 2, y - 66, 6, 6);
  ellipse(c, '#716574', x, y - 70, 7, 8);
  ellipse(c, P.stoneLight, x + 1, y - 71, 5, 6);
  rect(c, P.ivory, x - 1, y - 75, 3, 4);
  rect(c, '#605868', x + 3, y - 71, 2, 1);
  rect(c, '#aa9d92', x + 4, y - 69, 2, 3);
  rect(c, '#ded0ae', x - 6, y - 78, 12, 2);
  rect(c, P.gold, x - 5, y - 80, 10, 2);
}

function shelfBooks(c: CanvasRenderingContext2D, x: number, y: number, count: number): void {
  const colors = ['#65434b', '#3b5d65', '#8e7352', '#405449', '#7c4f42', '#5c5772'];
  let xx = x;
  for (let k = 0; k < count; k++) {
    const width = 3 + k % 3, height = 13 + (k * 7) % 11;
    rect(c, '#191e2c', xx - 1, y - height - 1, width + 2, height + 2);
    rect(c, colors[k % colors.length], xx, y - height, width, height);
    rect(c, '#b39a70', xx, y - height + 2, width, 1);
    rect(c, '#ac9269', xx, y - 4, width, 1);
    rect(c, '#c1af84', xx, y - height + 4, 1, Math.max(2, height - 10));
    xx += width + 1;
  }
}

function scrolls(c: CanvasRenderingContext2D, x: number, y: number): void {
  for (let k = 0; k < 3; k++) {
    const yy = y - k * 4;
    rect(c, '#4f4036', x - k, yy - 2, 23 + k * 2, 4);
    rect(c, '#b5a079', x - k + 1, yy - 2, 22 + k * 2, 2);
    rect(c, '#ddc89b', x - k + 2, yy - 2, 19 + k * 2, 1);
    rect(c, '#69553d', x + 8, yy - 2, 2, 3);
    ellipse(c, '#a58a64', x - k, yy, 2, 2);
    rect(c, '#4d3b31', x - k, yy, 1, 1);
  }
}

function bust(c: CanvasRenderingContext2D, x: number, y: number, bronze = false): void {
  const dark = bronze ? '#5b402c' : '#77717d', mid = bronze ? '#b4864b' : '#b8aaa0', light = bronze ? '#e2b86b' : '#e2cdb0';
  rect(c, dark, x - 10, y - 4, 21, 4);
  rect(c, light, x - 11, y - 5, 22, 1);
  polygon(c, dark, [[x - 10, y - 7], [x - 8, y - 15], [x - 3, y - 18], [x - 3, y - 23], [x + 4, y - 23], [x + 4, y - 18], [x + 9, y - 15], [x + 11, y - 7]]);
  polygon(c, mid, [[x - 8, y - 8], [x - 6, y - 14], [x - 1, y - 18], [x + 2, y - 20], [x + 3, y - 16], [x + 7, y - 13], [x + 7, y - 8]]);
  ellipse(c, dark, x, y - 30, 8, 10);
  ellipse(c, mid, x + 1, y - 29, 5, 7);
  rect(c, light, x - 2, y - 33, 3, 5);
  rect(c, dark, x + 4, y - 30, 2, 1);
  rect(c, mid, x + 5, y - 28, 2, 3);
  rect(c, dark, x + 2, y - 24, 3, 1);
  for (let k = 0; k < 5; k++) rect(c, k % 2 ? mid : light, x - 7 + k * 3, y - 37 + (k % 2), 2, 3);
  line(c, light, x - 5, y - 14, x, y - 10);
  line(c, dark, x + 1, y - 16, x + 2, y - 9);
}

function armillary(c: CanvasRenderingContext2D, x: number, y: number): void {
  ellipse(c, '#1d2432', x, y + 2, 21, 5);
  rect(c, P.goldDark, x - 15, y - 3, 31, 4);
  rect(c, P.gold, x - 12, y - 4, 25, 2);
  rect(c, P.goldDark, x - 3, y - 18, 7, 14);
  rect(c, P.goldLight, x - 2, y - 18, 2, 13);
  const cx = x, cy = y - 39;
  ellipse(c, P.goldDark, cx, cy, 24, 24);
  ellipse(c, '#1d2737', cx, cy, 21, 21);
  // Ring segments are made of individual pixel lines, preserving crisp diagonals.
  for (let i = 0; i < 48; i++) {
    const a = i * Math.PI * 2 / 48, b = (i + 1) * Math.PI * 2 / 48;
    line(c, i < 24 ? P.goldLight : P.gold, cx + Math.cos(a) * 22, cy + Math.sin(a) * 22, cx + Math.cos(b) * 22, cy + Math.sin(b) * 22);
    const yy = Math.sin(a) * 9, yy2 = Math.sin(b) * 9;
    line(c, i < 24 ? P.gold : P.goldLight, cx + Math.cos(a) * 22, cy + yy, cx + Math.cos(b) * 22, cy + yy2);
    line(c, P.gold, cx + Math.cos(a) * 9 + Math.sin(a) * 10, cy + Math.sin(a) * 21, cx + Math.cos(b) * 9 + Math.sin(b) * 10, cy + Math.sin(b) * 21);
  }
  line(c, P.goldWhite, cx - 17, cy + 18, cx + 18, cy - 18);
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6;
    rect(c, '#f0ce7c', cx + Math.cos(a) * 25, cy + Math.sin(a) * 25, 1, 2);
  }
  ellipse(c, '#7b512e', cx, cy, 5, 5);
  ellipse(c, P.gold, cx - 1, cy - 1, 4, 4);
  rect(c, P.goldWhite, cx - 2, cy - 3, 2, 2);
}

function cabinet(c: CanvasRenderingContext2D): void {
  // Dark side face and projecting cornice supply actual depth to the right cabinet.
  polygon(c, '#171d2d', [[717, 186], [828, 173], [836, 183], [836, 366], [723, 365]]);
  polygon(c, '#392b31', [[824, 183], [836, 179], [836, 367], [824, 360]]);
  rect(c, P.woodDark, 716, 187, 110, 172);
  rect(c, '#6c4937', 721, 193, 100, 162);
  rect(c, '#31272e', 727, 202, 87, 144);
  for (const x of [722, 766, 813]) {
    rect(c, '#322731', x - 2, 195, 9, 157);
    rect(c, '#7e573b', x, 195, 5, 157);
    rect(c, '#bd8a4e', x, 198, 1, 148);
    rect(c, '#a77940', x - 2, 207, 9, 3);
    rect(c, '#a77940', x - 2, 338, 9, 3);
    rect(c, '#be9458', x - 1, 205, 7, 1);
    for (let k = 0; k < 7; k++) {
      const yy = 218 + k * 16;
      rect(c, '#49342e', x + 1, yy, 3, 10);
      rect(c, '#b98a4e', x + 1, yy + 1, 1, 7);
    }
  }
  for (const yy of [201, 246, 293, 346]) {
    rect(c, '#201f2a', 727, yy, 87, 5);
    rect(c, '#97683f', 726, yy, 90, 2);
    rect(c, '#c59b5e', 726, yy, 90, 1);
    rect(c, '#3b2d30', 730, yy + 4, 82, 3);
  }
  // Carved entablature: alternating dentils, rosettes, double gold lip.
  rect(c, '#241f2b', 710, 187, 119, 9);
  rect(c, '#6f4a32', 711, 184, 120, 7);
  rect(c, '#ba8849', 711, 184, 120, 2);
  rect(c, '#e0b66d', 714, 183, 117, 1);
  for (let x = 718; x < 827; x += 8) {
    rect(c, '#b48347', x, 191, 4, 5);
    rect(c, '#e1b66d', x, 191, 1, 4);
  }
  for (const x of [736, 772, 807]) {
    ellipse(c, '#3c2c2a', x, 188, 4, 3);
    rect(c, P.gold, x - 2, 187, 5, 2);
    rect(c, P.goldLight, x, 186, 1, 4);
  }
  shelfBooks(c, 732, 244, 5);
  scrolls(c, 779, 244);
  bust(c, 747, 292);
  terracotta(c, 791, 292, 16, 29);
  rect(c, P.gold, 787, 274, 8, 1);
  scrolls(c, 733, 344);
  shelfBooks(c, 778, 344, 6);
  // Lower relief panels and squat claw-like feet.
  rect(c, '#322832', 715, 351, 112, 28);
  rect(c, '#8c603a', 718, 352, 107, 2);
  for (const x of [723, 771]) {
    rect(c, '#725037', x, 357, 45, 16);
    rect(c, '#30252c', x + 2, 359, 41, 12);
    rect(c, '#a77944', x + 3, 360, 39, 1);
    greekBand(c, x + 5, 364, 35, '#956b3d');
  }
  for (const x of [719, 810]) {
    rect(c, '#29232d', x, 375, 10, 10);
    rect(c, '#805a38', x + 1, 375, 7, 8);
    rect(c, '#b0874e', x + 1, 376, 2, 6);
  }
  rect(c, '#352b30', 709, 177, 124, 7);
  rect(c, '#b08046', 711, 177, 121, 2);
  line(c, '#dfb46a', 713, 176, 832, 176);
  bust(c, 746, 176, true);
  armillary(c, 800, 176);
  candle(c, 720, 177, 22);
  // A waist-high side table supports a second, readable astronomical instrument.
  rect(c, '#201d2a', 779, 315, 57, 10);
  rect(c, '#79513a', 782, 315, 54, 5);
  rect(c, '#bf8b4e', 782, 315, 54, 1);
  rect(c, '#49312d', 787, 325, 8, 40);
  rect(c, '#ae7946', 788, 325, 2, 36);
  armillary(c, 810, 315);
  candle(c, 777, 315, 32);
  // A red velvet cloth falls over the cupboard's outer edge.
  polygon(c, '#3e1e35', [[822, 169], [836, 169], [836, 264], [827, 253], [823, 216]]);
  polygon(c, '#70273b', [[823, 170], [829, 170], [832, 240], [828, 231]]);
  line(c, '#a24847', 825, 171, 831, 244);
  line(c, '#bf864a', 833, 173, 835, 251);
}

/** Side furnishings behind the actor, to be built once into the static back cache. */
export function drawPixelDecorBack(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // Left garden wall, pots, and climbing vegetation frame the descending water.
  stoneBlock(ctx, 0, 227, 40, 54);
  stoneBlock(ctx, 36, 254, 38, 31, true);
  shrub(ctx, 16, 254, 26, 53, 2, true);
  terracotta(ctx, 134, 285, 19, 27);
  shrub(ctx, 134, 264, 18, 29, 3, true);
  terracotta(ctx, 166, 303, 15, 22);
  shrub(ctx, 166, 284, 15, 26, 4);
  pool(ctx);
  littleStatue(ctx, 32, 246);
  // Small companion urn and a tangle of roses soften the spring's upper ledge.
  terracotta(ctx, 96, 286, 19, 29);
  shrub(ctx, 96, 260, 20, 29, 1, true);
  candle(ctx, 151, 286, 25);
  shrub(ctx, 10, 322, 22, 47, 0);
  shrub(ctx, 173, 340, 14, 23, 5, true);
  cabinet(ctx);
  terracotta(ctx, 709, 350, 14, 23);
  shrub(ctx, 707, 330, 17, 31, 4, true);
  // A small stone pedestal and oil vessel separate shelf and floor.
  stoneBlock(ctx, 701, 362, 26, 36);
  stoneBlock(ctx, 698, 357, 32, 6, true);
  terracotta(ctx, 713, 356, 14, 20, true);
  ctx.restore();
}

/** Edge-only foreground, composited after the hero so foliage overlaps naturally. */
export function drawPixelDecorFront(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // Left low balustrade recedes toward the pool. Its top is an irregular stone run.
  polygon(ctx, '#1b2436', [[0, 362], [39, 356], [77, 374], [119, 391], [165, 405], [180, 420], [179, 471], [0, 471]]);
  polygon(ctx, '#625d6d', [[0, 365], [38, 360], [78, 380], [119, 397], [169, 413], [177, 426], [178, 471], [0, 471]]);
  const tops: readonly [number, number, number, number][] = [[0, 357, 39, 12], [36, 367, 40, 14], [73, 384, 42, 14], [111, 399, 42, 14], [150, 411, 30, 14]];
  for (const [x, y, w, h] of tops) {
    stoneBlock(ctx, x, y, w, h);
    rect(ctx, '#c6baa8', x + 2, y + 1, w - 4, 2);
    line(ctx, '#574f63', x + w - 3, y + h, x + w - 3, 470);
    line(ctx, '#8f8390', x + w - 2, y + h, x + w - 2, 470);
  }
  // Nearest pier is thick and fluted, with a cool side and an ivory top edge.
  stoneBlock(ctx, 0, 391, 27, 80);
  rect(ctx, '#494758', 1, 403, 8, 68);
  rect(ctx, '#a29394', 10, 403, 3, 68);
  rect(ctx, '#625c6e', 16, 403, 4, 68);
  stoneBlock(ctx, 0, 384, 33, 10, true);
  shrub(ctx, 48, 393, 39, 54, 3);
  terracotta(ctx, 54, 455, 43, 78, true);
  shrub(ctx, 55, 385, 25, 28, 0, true);
  terracotta(ctx, 9, 420, 38, 77, true);
  shrub(ctx, 4, 375, 29, 35, 1);
  // Planted pockets form a stepped foreground silhouette, leaving the centre clear.
  shrub(ctx, 93, 417, 24, 40, 1, true);
  shrub(ctx, 129, 438, 29, 45, 2, true);
  shrub(ctx, 151, 462, 20, 44, 5, true);
  shrub(ctx, 22, 472, 39, 39, 4);
  shrub(ctx, 73, 480, 35, 32, 2);
  for (const [x, y] of [[95, 399], [116, 420], [148, 426], [171, 448], [36, 457]]) flower(ctx, x, y);
  // Right foreground pier mirrors the visual weight without covering the walkway.
  polygon(ctx, '#192237', [[836, 355], [812, 360], [787, 380], [753, 394], [722, 416], [704, 447], [700, 471], [836, 471]]);
  polygon(ctx, '#65616f', [[836, 365], [812, 368], [786, 389], [751, 404], [720, 426], [711, 471], [836, 471]]);
  const rightTops: readonly [number, number, number, number][] = [[809, 359, 27, 13], [781, 377, 32, 13], [748, 392, 36, 14], [717, 412, 35, 14], [702, 438, 23, 14]];
  for (const [x, y, w, h] of rightTops) {
    stoneBlock(ctx, x, y, w, h);
    rect(ctx, '#c3b49f', x + 1, y + 1, w - 2, 2);
    line(ctx, '#403f53', x + 4, y + h + 2, x + 4, 471);
    line(ctx, '#99909a', x + 5, y + h + 2, x + 5, 471);
  }
  stoneBlock(ctx, 816, 401, 20, 70);
  stoneBlock(ctx, 810, 392, 26, 11, true);
  shrub(ctx, 821, 397, 25, 52, 2, true);
  shrub(ctx, 793, 422, 25, 43, 3, true);
  shrub(ctx, 754, 450, 30, 47, 0, true);
  shrub(ctx, 733, 474, 20, 35, 1, true);
  terracotta(ctx, 824, 461, 31, 49, true);
  ellipse(ctx, '#211e2b', 824, 412, 17, 5);
  ellipse(ctx, P.gold, 824, 411, 17, 4);
  ellipse(ctx, '#2c2932', 824, 411, 14, 2);
  rect(ctx, P.goldLight, 811, 409, 21, 1);
  shrub(ctx, 802, 484, 33, 35, 4);
  for (const [x, y] of [[736, 440], [764, 417], [789, 399], [813, 382], [715, 460]]) flower(ctx, x, y);
  ctx.restore();
}
