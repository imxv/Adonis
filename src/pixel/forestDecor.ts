import { Grid } from './draw';
import { E } from './palette';
import type { DecoArt, Paint } from './decor';
import type { Rng } from '../core/rng';

// Forest silhouettes have their roots at the bottom centre. Broad canopies sit above
// the existing one-tile collision footprint, like the other standing biome pieces.
const FOREST = {
  d: E.tealD, s: E.greenDD, l: E.greenD, L: E.green,
  b: E.brown, B: E.brownD, h: E.brownL, t: E.tan, T: E.cream,
  k: E.slateD, g: E.slate, G: E.greyM, w: E.grey,
  r: E.redD, R: E.red, p: E.pink, P: E.magenta, y: E.amber,
};

/** A stepped leaf cluster, with a dark underside and a broken top-left light. */
function foliage(g: Grid, x: number, y: number, w: number, h: number): void {
  g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 's');
  g.ellipse(x + w / 2 - 1, y + h / 2 - 1, w / 2 - 1, h / 2 - 1, 'l');
  g.rect(x + 2, y + 1, Math.max(2, w - 5), 1, 'L').set(x + 1, y + 2, 'L');
  g.rect(x + w - 3, y + h - 1, 2, 1, 'd').set(x + w - 1, y + h - 2, 'd');
  g.set(x + 3, y + h - 2, 's').set(x + w - 3, y + 3, 's');
}

function ancientTree(): DecoArt {
  const g = new Grid(28, 37);
  // An asymmetric fork, bark grooves and spreading buttress roots.
  g.rect(11, 16, 6, 19, 'b').rect(11, 20, 2, 14, 'h').rect(16, 19, 2, 15, 'B');
  g.tri(12, 25, 7, 35, 14, 35, 'b').tri(16, 27, 21, 35, 14, 35, 'B');
  g.line(12, 30, 8, 35, 'h').line(12, 35, 6, 36, 'b').line(17, 33, 22, 36, 'B');
  g.line(14, 20, 7, 15, 'b').line(13, 21, 7, 16, 'h');
  g.line(16, 23, 22, 17, 'B').line(16, 21, 21, 16, 'b');
  g.line(13, 25, 14, 28, 'B').line(14, 28, 13, 33, 'B');
  g.rect(14, 21, 2, 3, 'B').set(14, 21, 'h').set(15, 24, 'h').set(17, 30, 'h');
  // Five overlapping tiers leave the trunk visible and break up the crown edge.
  foliage(g, 2, 10, 12, 9);
  foliage(g, 14, 9, 12, 10);
  foliage(g, 7, 10, 12, 12);
  foliage(g, 2, 5, 12, 10);
  foliage(g, 13, 4, 12, 10);
  foliage(g, 8, 0, 12, 10);
  g.rect(9, 14, 4, 2, 'l').rect(17, 11, 3, 2, 'l').set(5, 10, 'L');
  g.rect(12, 8, 3, 1, 's').set(11, 9, 's').set(18, 7, 'L').set(22, 13, 'L');
  // Moss is concentrated around damp roots, with one tiny shelf fungus.
  g.rect(9, 34, 4, 1, 'l').rect(14, 35, 5, 1, 's').set(10, 33, 'L').set(18, 34, 'l');
  g.rect(16, 29, 4, 1, 'h').rect(17, 28, 3, 1, 't').set(19, 29, 'b');
  return { g, colors: FOREST };
}

function mossColumn(): DecoArt {
  const g = new Grid(18, 25);
  g.rect(2, 20, 14, 4, 'g').rect(1, 22, 16, 2, 'k').rect(2, 20, 13, 1, 'G');
  g.rect(4, 4, 10, 16, 'G').rect(4, 5, 2, 15, 'w').rect(12, 4, 2, 16, 'g');
  // A chipped capital and shallow flutes: this reads as masonry, not a crate.
  g.rect(3, 3, 10, 3, 'G').rect(3, 3, 4, 1, 'w').rect(5, 2, 3, 2, 'G');
  g.rect(9, 0, 3, 4, 'G').set(9, 0, 'w').set(11, 1, 'g').set(8, 2, 'w');
  g.rect(7, 7, 1, 12, 'g').rect(10, 6, 1, 13, 'g').rect(6, 8, 1, 9, 'w');
  g.line(12, 9, 9, 12, 'k').line(9, 12, 10, 15, 'k').set(11, 15, 'k');
  g.line(4, 16, 6, 18, 'g').set(5, 19, 'k').set(14, 22, 'G');
  // Moss drapes over broken edges; the stone's centre remains legible.
  g.rect(3, 4, 7, 2, 's').rect(4, 3, 4, 2, 'l').rect(5, 2, 2, 1, 'L');
  g.rect(4, 6, 2, 5, 'l').rect(5, 9, 1, 4, 's').set(4, 8, 'L');
  g.rect(11, 2, 2, 2, 'l').rect(12, 4, 2, 5, 's').set(12, 4, 'L');
  g.rect(2, 22, 5, 2, 's').rect(3, 21, 4, 1, 'l').set(5, 20, 'L');
  g.rect(11, 23, 5, 1, 'l').set(13, 22, 'L').set(9, 24, 's');
  return { g, colors: FOREST };
}

function mushroomCluster(): DecoArt {
  const g = new Grid(24, 25);
  g.rect(8, 10, 5, 13, 'T').rect(11, 11, 2, 12, 't').rect(12, 13, 1, 9, 'h');
  g.tri(9, 17, 6, 23, 11, 23, 'T').rect(8, 22, 7, 2, 't');
  g.ellipse(10, 7, 9, 6, 'r').ellipse(9, 5, 7, 4, 'R');
  g.rect(3, 11, 15, 2, 'h').rect(5, 13, 11, 1, 't');
  // Gills radiate beneath the cap, including the two extreme edges.
  for (const [x, end] of [[4, 8], [7, 9], [14, 12], [17, 13]]) g.line(x, 11, end, 13, 'T');
  g.rect(5, 3, 5, 1, 'p').set(4, 4, 'p').set(11, 2, 'p').set(15, 6, 'p');
  for (const [x, y] of [[6, 5], [12, 4], [3, 8], [10, 8], [15, 8]]) g.rect(x, y, 2, 1, 'T').set(x, y + 1, 't');
  // Two smaller, different-height caps make the silhouette a cluster.
  g.rect(18, 17, 2, 7, 't').set(18, 18, 'T');
  g.ellipse(18, 16, 5, 3, 'r').ellipse(17, 15, 4, 2, 'R');
  g.rect(15, 18, 7, 1, 't').set(16, 15, 'T').rect(19, 14, 2, 1, 'T');
  g.rect(3, 21, 2, 3, 'T').ellipse(4, 20, 3, 2, 'r').rect(2, 19, 4, 1, 'R').set(3, 19, 'T');
  g.rect(6, 24, 13, 1, 's').set(7, 23, 'l').set(14, 23, 'l').set(16, 22, 'L');
  return { g, colors: FOREST };
}

function birchTree(): DecoArt {
  const g = new Grid(25, 36);
  g.rect(10, 12, 4, 22, 'T').rect(13, 13, 2, 22, 'G').rect(10, 13, 1, 19, 'w');
  g.line(11, 19, 6, 13, 'T').line(13, 23, 19, 16, 'G');
  g.line(11, 31, 7, 35, 'G').line(13, 31, 18, 35, 'g').rect(9, 34, 7, 2, 'G');
  // Short, staggered scars preserve the unmistakable white birch bark.
  g.rect(10, 20, 2, 1, 'B').rect(12, 24, 3, 1, 'B').set(11, 27, 'b');
  g.rect(10, 29, 2, 1, 'g').rect(13, 31, 2, 1, 'B').set(12, 17, 'b');
  foliage(g, 2, 10, 10, 9);
  foliage(g, 13, 11, 10, 9);
  foliage(g, 7, 7, 12, 11);
  foliage(g, 1, 4, 11, 9);
  foliage(g, 12, 3, 10, 10);
  foliage(g, 7, 0, 10, 8);
  g.set(4, 9, 'L').rect(14, 8, 2, 1, 'L').rect(8, 15, 2, 1, 'L');
  g.rect(7, 35, 10, 1, 's').set(8, 34, 'l').set(16, 34, 'l').set(17, 33, 'L');
  return { g, colors: FOREST };
}

function floweringBush(): DecoArt {
  const g = new Grid(24, 18);
  g.line(12, 10, 9, 17, 'b').line(12, 11, 16, 17, 'B').rect(5, 17, 14, 1, 's');
  foliage(g, 1, 8, 10, 7);
  foliage(g, 13, 7, 10, 8);
  foliage(g, 6, 9, 12, 7);
  foliage(g, 4, 3, 10, 9);
  foliage(g, 12, 2, 9, 9);
  foliage(g, 7, 0, 9, 8);
  // Cream and lilac five-pixel blossoms stand out without a large bright blob.
  for (const [x, y, petals] of [[7, 6, 'T'], [16, 5, 'p'], [4, 11, 'p'], [12, 11, 'T'], [20, 11, 'T']] as const) {
    g.set(x, y - 1, petals).set(x - 1, y, petals).set(x + 1, y, petals).set(x, y + 1, petals).set(x, y, 'y');
    g.set(x + 1, y + 2, 's');
  }
  g.set(10, 3, 'p').set(17, 14, 'P').set(8, 15, 'L');
  return { g, colors: FOREST };
}

function fallenLog(): DecoArt {
  const g = new Grid(24, 17);
  // Bark follows a gentle diagonal, with the cut end facing the viewer.
  g.line(5, 7, 17, 3, 'b').line(4, 8, 20, 4, 'b');
  g.tri(4, 8, 21, 4, 19, 12, 'b').tri(4, 8, 19, 12, 5, 15, 'b');
  g.line(7, 15, 20, 12, 'B').line(20, 5, 21, 11, 'B');
  g.line(7, 8, 18, 5, 'h').line(9, 10, 16, 8, 'B').line(12, 12, 19, 10, 'h');
  g.rect(14, 2, 3, 4, 'b').set(15, 1, 't').set(16, 1, 'h').set(16, 3, 'B');
  g.ellipse(5, 11, 4, 5, 'B').ellipse(5, 10, 3, 4, 't').ellipse(5, 10, 2, 3, 'h');
  g.ellipse(5, 10, 1, 2, 'T').set(5, 10, 'b').set(3, 8, 'T').set(4, 13, 'b');
  g.line(6, 10, 8, 13, 'b').set(2, 11, 'T');
  // Moss blankets the upward face, with two small shelf fungi on its far end.
  g.rect(8, 5, 7, 2, 's').rect(10, 4, 6, 2, 'l').rect(12, 3, 3, 1, 'L');
  g.rect(9, 7, 2, 3, 's').set(10, 7, 'l').set(16, 5, 'L');
  g.rect(19, 7, 4, 1, 'h').rect(20, 6, 3, 1, 't').set(22, 7, 'b');
  g.rect(18, 10, 4, 1, 'h').rect(19, 9, 3, 1, 'T');
  g.rect(5, 16, 14, 1, 's').set(11, 15, 'l').set(18, 14, 'l').set(19, 15, 'L');
  return { g, colors: FOREST };
}

/** Stable order: the first three retain their original obstacle identities. */
export function forestDecor(): DecoArt[] {
  return [ancientTree(), mossColumn(), mushroomCluster(), birchTree(), floweringBush(), fallenLog()];
}

/** Small stone-face details, kept strictly inside their 16 x 16 tile. */
export function paintForestWall(P: Paint, x: number, y: number, k: number, rng: Rng): boolean {
  const dot = (dx: number, dy: number, color: string, w = 1, h = 1) => P(x + dx, y + dy, color, w, h);
  if (k % 3 === 0) {
    // One long hanging vine and a shorter companion, with paired leaves.
    for (const start of [3, 11]) {
      const len = rng.int(6, 13);
      for (let j = 0; j < len; j++) {
        const vx = start + (j >= 5 && j <= 9 ? 1 : 0);
        dot(vx, j, E.greenDD);
        if (j % 3 === 2) {
          dot(vx - 1, j - 1, E.greenD, 2, 1);
          dot(vx + 1, j, E.greenD, 2, 1);
          if (j < 5) dot(vx - 1, j - 1, E.green);
        }
      }
    }
  } else if (k % 3 === 1) {
    // Warm roots trail over the cold stone in a thin, branching silhouette.
    for (let j = 0; j < 13; j++) {
      const dx = 6 + Math.floor(j / 4);
      dot(dx, j, E.brown);
      if (j < 7) dot(dx - 1, j, E.brownL);
      if (j > 6 && j < 10) dot(dx - (j - 6), j, E.brown);
    }
    dot(4, 1, E.greenDD, 6, 2);
    dot(5, 0, E.greenD, 4, 2);
    dot(12, 13, E.greenDD, 3, 2);
    dot(13, 12, E.greenD, 2, 1);
  } else {
    // Sparse moss on horizontal shelves leaves large readable stone faces.
    dot(1, 1, E.greenDD, 7, 2);
    dot(2, 0, E.greenD, 4, 2);
    dot(3, 0, E.green, 2, 1);
    dot(2, 3, E.greenDD, 2, 3);
    dot(3, 3, E.greenD);
    dot(11, 9, E.greenDD, 4, 2);
    dot(12, 8, E.greenD, 3, 1);
    dot(13, 11, E.greenDD, 1, 3);
    dot(8, 5, E.tealD, 1, 3);
    dot(7, 8, E.tealD, 2, 1);
    dot(6, 9, E.tealD, 1, 2);
  }
  return true;
}
