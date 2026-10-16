import { Grid } from './draw';
import { E } from './palette';

/*
 * Room props drawn pixel by pixel with fixed colours: chests, the powder keg, the crate and the bomb enemy.
 * Each takes a legend of its own, so the same shape can be repainted (the steel weapon chest).
 */

export interface ChestColours {
  /** Body: highlight, base, shade, deepest. */
  H: string;
  w: string;
  s: string;
  d: string;
  /** Trim: highlight, base, shade. */
  Y: string;
  y: string;
  O: string;
  /** What glints inside when it is open. */
  i: string;
  I: string;
}

export const WOOD_CHEST: ChestColours = { H: E.tan, w: E.brownL, s: E.brown, d: E.brownD, Y: E.yellow, y: E.amber, O: E.orange, i: E.amber, I: E.yellow };
export const STEEL_CHEST: ChestColours = { H: E.grey, w: E.greyM, s: E.slate, d: E.slateD, Y: E.white, y: E.cyan, O: E.blue, i: E.cyan, I: E.white };

/** The chest's front: planks, two straps and corner caps, from row y0 down to y0 + 7. */
function chestFront(g: Grid, y0: number, lock: boolean) {
  g.rect(1, y0, 14, 8, 'w');
  g.rect(1, y0, 1, 7, 'H');
  g.rect(14, y0, 1, 7, 's');
  g.rect(1, y0 + 3, 14, 1, 's');
  g.rect(1, y0 + 6, 14, 1, 's');
  g.rect(1, y0 + 7, 14, 1, 'd');
  for (const sx of [3, 11]) {
    g.rect(sx, y0, 1, 7, 'Y').rect(sx + 1, y0, 1, 7, 'y');
    g.set(sx, y0 + 6, 'O').set(sx + 1, y0 + 6, 'O').set(sx, y0 + 7, 'O').set(sx + 1, y0 + 7, 'O');
  }
  // Brass corner caps.
  g.set(1, y0 + 7, 'O').set(14, y0 + 7, 'O').set(1, y0 + 6, 'y').set(14, y0 + 6, 'O');
  if (lock) {
    g.rect(6, y0 - 1, 4, 3, 'y').set(7, y0 - 1, 'Y').set(8, y0 - 1, 'Y');
    g.set(7, y0, 'k').set(8, y0, 'k').set(7, y0 + 1, 'k');
    g.rect(6, y0 + 2, 4, 1, 'O');
  }
}

/** Closed chest, 16 x 14: a domed lid with a brass band, straps and a lock. */
export function chestClosed(): Grid {
  const g = new Grid(16, 14);
  // Lid.
  g.rect(2, 0, 12, 1, 'H').rect(1, 1, 14, 4, 'w');
  g.rect(1, 1, 14, 1, 'H').set(1, 2, 'H');
  g.rect(14, 2, 1, 3, 's');
  g.rect(1, 4, 14, 1, 's');
  for (const sx of [3, 11]) g.rect(sx, 0, 1, 5, 'Y').rect(sx + 1, 0, 1, 5, 'y');
  // Brass band where the lid meets the body.
  g.rect(1, 5, 14, 1, 'y').set(1, 5, 'O').set(14, 5, 'O').set(2, 5, 'Y');
  chestFront(g, 6, true);
  return g;
}

/** Open chest, 16 x 17: the lid thrown back and the inside heaped with glinting loot. */
export function chestOpen(): Grid {
  const g = new Grid(16, 17);
  // Lid, seen from inside.
  g.rect(2, 0, 12, 1, 'y').set(2, 0, 'Y').set(3, 0, 'Y');
  g.rect(1, 1, 14, 3, 's').rect(1, 1, 14, 1, 'w');
  for (const sx of [3, 11]) g.rect(sx, 1, 2, 3, 'O');
  g.rect(1, 4, 14, 1, 'd');
  // The loot.
  g.rect(2, 5, 12, 3, 'i');
  for (const [x, y] of [[4, 4], [5, 4], [7, 4], [10, 4], [11, 4]]) g.set(x, y, 'i');
  for (const [x, y] of [[5, 4], [10, 4], [3, 5], [8, 5], [12, 6], [5, 7], [9, 6]]) g.set(x, y, 'I');
  for (const [x, y] of [[4, 6], [7, 7], [11, 7], [6, 5]]) g.set(x, y, 'O');
  g.set(7, 5, 'W').set(11, 5, 'W').set(7, 4, 'W');
  g.set(9, 7, 'c').set(4, 7, 'r');
  // Rim.
  g.rect(1, 8, 14, 1, 'y').set(1, 8, 'O').set(14, 8, 'O').set(2, 8, 'Y');
  chestFront(g, 9, true);
  return g;
}

export function chestLegend(c: ChestColours): Record<string, string> {
  return { ...c, k: E.ink, W: E.white, c: E.cyan, r: E.red };
}

/** Powder keg, 12 x 16: red staves, iron hoops, a hazard diamond and a lit fuse. */
export function powderKeg(): Grid {
  const g = new Grid(12, 16);
  // Fuse and spark.
  g.set(8, 0, 'Y').set(9, 1, 'O').set(7, 1, 'O').set(8, 1, 'W');
  g.set(7, 2, 'f').set(6, 3, 'f');
  // Lid.
  g.rect(2, 3, 8, 2, 'b').rect(3, 3, 6, 1, 'B').set(5, 3, 'f');
  // Staves, bulging in the middle.
  g.rect(2, 5, 8, 11, 'r');
  g.rect(1, 6, 10, 9, 'r');
  g.rect(0, 8, 12, 5, 'r');
  // Light from the left, shade on the right.
  g.rect(1, 6, 1, 9, 'p').rect(0, 8, 1, 5, 'p').rect(3, 6, 1, 9, 'p');
  g.rect(10, 6, 1, 9, 'R').rect(11, 8, 1, 5, 'R').rect(8, 5, 1, 11, 'R');
  // Iron hoops.
  for (const hy of [6, 13]) {
    g.rect(1, hy, 10, 1, 'n');
    g.set(1, hy, 'D').set(2, hy, 'D');
  }
  g.rect(0, 9, 12, 1, 'n').set(0, 9, 'D').set(1, 9, 'D');
  // Hazard diamond.
  g.set(5, 9, 'Y').set(6, 9, 'Y');
  g.rect(4, 10, 4, 2, 'Y').set(5, 10, 'k').set(6, 10, 'k').set(5, 11, 'O').set(6, 11, 'O');
  g.set(5, 12, 'Y').set(6, 12, 'Y');
  g.rect(2, 15, 8, 1, 'R');
  return g;
}

export const KEG_LEGEND: Record<string, string> = { r: E.red, p: E.pink, R: E.redD, n: E.navy, D: E.slate, b: E.brownL, B: E.tan, f: E.cream, Y: E.yellow, O: E.orange, W: E.white, k: E.ink };

/** Wooden crate, 14 x 15: a lighter top, a framed front with a diagonal brace and nail heads. */
export function crate(): Grid {
  const g = new Grid(14, 15);
  // Top.
  g.rect(0, 0, 14, 3, 'T');
  g.rect(0, 2, 14, 1, 't');
  g.rect(4, 0, 1, 2, 't').rect(9, 0, 1, 2, 't');
  // Front.
  g.rect(0, 3, 14, 12, 't');
  g.rect(0, 3, 14, 2, 'b').rect(0, 13, 14, 2, 'b').rect(0, 3, 2, 12, 'b').rect(12, 3, 2, 12, 'b');
  g.rect(0, 3, 14, 1, 'T').rect(0, 3, 1, 12, 'T');
  g.rect(13, 4, 1, 11, 's').rect(1, 14, 13, 1, 's');
  // Planks behind the brace.
  g.rect(5, 5, 1, 8, 'b').rect(8, 5, 1, 8, 'b');
  g.rect(2, 5, 1, 8, 'T');
  // The brace, lit along its top edge.
  for (let i = 0; i < 10; i++) {
    const x = 2 + i;
    const y = 12 - Math.round(i * 0.78);
    if (y - 1 >= 5) g.set(x, y - 1, 'T');
    if (y + 1 <= 12) g.set(x, y + 1, 's');
    g.set(x, y, 'b');
  }
  // Nails.
  for (const [x, y] of [[1, 4], [12, 4], [1, 13], [12, 13]]) g.set(x, y, 'k');
  return g;
}

export const CRATE_LEGEND: Record<string, string> = { T: E.cream, t: E.tan, b: E.brownL, s: E.brown, k: E.brownD };

/** The bomb enemy, 14 x 15, two frames: a glossy iron ball with angry eyes and a fuse that crackles. */
export function bombBody(frame: 0 | 1): Grid {
  const g = new Grid(14, 15);
  const sq = frame; // the second frame squashes a little
  g.ellipse(6.5, 9 + sq * 0.5, 6, 5.5 - sq * 0.5, '3');
  // Brass cap and fuse.
  g.rect(5, 2 + sq, 4, 2, 'y').rect(5, 3 + sq, 4, 1, 'O').set(5, 2 + sq, 'Y');
  g.set(8, 1 + sq, 'f').set(9, 0 + sq, 'f');
  if (frame === 0) g.set(10, 0, 'Y').set(11, 0, 'O').set(10, 1, 'W');
  else g.set(10, 0, 'O').set(11, 1, 'Y').set(9, 0, 'W');
  // Gloss.
  g.set(3, 6 + sq, 'W').set(4, 6 + sq, 'w').set(3, 7 + sq, 'w');
  // Angry eyes.
  const ey = 9 + sq;
  g.rect(3, ey, 3, 2, 'W').rect(8, ey, 3, 2, 'W');
  g.set(5, ey + 1, 'k').set(8, ey + 1, 'k').set(5, ey, 'r').set(8, ey, 'r');
  g.line(2, ey - 2, 5, ey - 1, 'k').line(11, ey - 2, 8, ey - 1, 'k');
  // Feet.
  g.rect(3, 14, 3, 1, 'k').rect(8, 14, 3, 1, 'k');
  return g;
}

export const BOMB_LEGEND: Record<string, string> = { y: E.amber, Y: E.yellow, O: E.orange, f: E.cream, W: E.white, w: E.grey, k: E.ink, r: E.red };
