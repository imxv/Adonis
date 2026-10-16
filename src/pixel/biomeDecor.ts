import { Grid } from './draw';
import { E } from './palette';
import type { DecoArt } from './decor';

// Extra standing pieces share the same bottom-centre tile anchor as existing art.
// Wide upper silhouettes keep a narrow foot so they still read as one obstacle.
const COLORS = {
  w: E.white, g: E.grey, G: E.greyM, D: E.slate, d: E.slateD, n: E.navy, k: E.ink,
  T: E.cream, t: E.tan, b: E.brownL, B: E.brown, x: E.brownD,
  c: E.cyan, C: E.blue, Q: E.blueD, l: E.green, L: E.greenD, M: E.greenDD,
  v: E.purple, P: E.magenta, p: E.pink, r: E.red, R: E.redD,
  O: E.orange, y: E.amber, Y: E.yellow, o: E.rust, h: E.clay,
};

function art(g: Grid, light?: DecoArt['light']): DecoArt {
  return light ? { g, colors: COLORS, light } : { g, colors: COLORS };
}

function pedestal(g: Grid, x: number, y: number, w: number, top: string, face: string): void {
  g.rect(x + 1, y, w - 2, 1, top).rect(x, y + 1, w, 2, face).rect(x + 1, y + 1, w - 3, 1, top);
}

// ---------------------------------------------------------------- glacier

function frozenGate(): DecoArt {
  const g = new Grid(22, 30);
  // A ruined arched gate frozen shut: blue ice fills the formerly open centre.
  g.rect(4, 11, 14, 16, 'Q').ellipse(11, 11, 7, 8, 'Q');
  g.rect(5, 11, 12, 15, 'C').ellipse(11, 11, 6, 7, 'C');
  g.tri(7, 10, 13, 6, 10, 24, 'c').line(14, 11, 11, 22, 'g');
  g.rect(2, 12, 4, 15, 'D').rect(2, 12, 1, 15, 'G').rect(16, 11, 4, 16, 'd');
  g.line(3, 11, 5, 6, 'G').line(4, 11, 6, 6, 'D').line(6, 5, 10, 3, 'G');
  g.rect(8, 2, 6, 4, 'G').rect(9, 2, 4, 1, 'g').line(14, 4, 18, 10, 'D');
  g.rect(3, 9, 4, 2, 'g').rect(16, 8, 3, 2, 'G');
  for (const y of [15, 21]) g.rect(2, y, 4, 1, 'd').rect(16, y + 1, 4, 1, 'n');
  g.rect(7, 1, 8, 2, 'w').rect(9, 0, 4, 1, 'w').rect(2, 10, 5, 2, 'w');
  g.rect(4, 12, 1, 5, 'c').rect(6, 12, 1, 3, 'w').rect(16, 10, 4, 2, 'w');
  g.line(12, 12, 10, 16, 'Q').line(10, 16, 12, 20, 'Q').set(9, 17, 'g');
  pedestal(g, 2, 27, 18, 'w', 'G');
  g.rect(5, 26, 4, 2, 'w').rect(14, 26, 3, 2, 'w');
  return art(g);
}

function supplySled(): DecoArt {
  const g = new Grid(25, 22);
  g.line(3, 17, 20, 17, 'B').line(4, 20, 21, 20, 'D').line(21, 20, 23, 18, 'G');
  g.line(3, 17, 1, 14, 'b').rect(5, 13, 2, 7, 'B').rect(17, 13, 2, 7, 'B');
  g.rect(3, 12, 18, 3, 'b').rect(3, 14, 18, 1, 'x');
  g.rect(6, 4, 11, 9, 'B').rect(6, 4, 11, 1, 't').rect(6, 4, 1, 9, 'b');
  g.line(8, 6, 15, 11, 'b').line(8, 11, 15, 6, 'b').rect(11, 4, 1, 9, 't');
  g.ellipse(18, 10, 4, 4, 'D').ellipse(17, 9, 3, 3, 'G').rect(16, 5, 3, 2, 'g');
  g.rect(6, 3, 11, 2, 'w').rect(7, 2, 7, 1, 'w').rect(15, 6, 5, 1, 'w');
  g.rect(3, 11, 3, 1, 'w').rect(8, 14, 2, 1, 'g');
  // A short blue pennant is distinct from the warm wood and snow.
  g.rect(3, 0, 1, 13, 'D').tri(4, 0, 10, 2, 4, 5, 'Q').rect(4, 1, 3, 1, 'c');
  g.rect(5, 21, 15, 1, 'g');
  return art(g);
}

function snowCairn(): DecoArt {
  const g = new Grid(23, 24);
  g.ellipse(11, 19, 9, 4, 'D').ellipse(7, 18, 6, 4, 'G').ellipse(16, 17, 5, 4, 'D');
  g.ellipse(10, 12, 7, 5, 'G').ellipse(14, 12, 4, 4, 'D');
  g.ellipse(11, 6, 4, 4, 'D').ellipse(10, 5, 3, 3, 'G');
  g.ellipse(11, 3, 4, 2, 'w').rect(8, 5, 2, 1, 'w').set(7, 4, 'w');
  g.ellipse(9, 9, 6, 2, 'w').rect(4, 10, 3, 2, 'w').set(6, 12, 'c');
  g.ellipse(7, 15, 6, 2, 'w').ellipse(17, 15, 4, 2, 'w').set(3, 18, 'g');
  g.line(10, 11, 12, 14, 'd').line(14, 18, 12, 20, 'd').set(17, 19, 'G');
  g.tri(19, 10, 18, 15, 21, 15, 'c').line(19, 10, 19, 14, 'w');
  g.rect(4, 22, 16, 2, 'g').rect(6, 22, 11, 1, 'w');
  return art(g);
}

// ---------------------------------------------------------------- desert

function buriedPharaoh(): DecoArt {
  const g = new Grid(22, 31);
  g.rect(7, 3, 8, 12, 't').rect(6, 5, 2, 10, 'b').rect(15, 5, 2, 10, 'b');
  g.tri(10, 0, 4, 7, 18, 7, 'b').rect(8, 2, 7, 2, 't');
  g.rect(4, 7, 3, 10, 'b').rect(16, 7, 3, 10, 'B');
  for (const y of [8, 11, 14]) g.rect(4, y, 3, 1, 'Q').rect(16, y, 3, 1, 'Q');
  g.rect(8, 7, 2, 1, 'B').rect(12, 7, 2, 1, 'B').set(10, 9, 'T');
  g.rect(9, 12, 4, 1, 'b').rect(10, 13, 2, 5, 'B').rect(10, 13, 1, 4, 't');
  g.tri(7, 16, 3, 26, 19, 26, 'b').rect(7, 16, 8, 11, 't').rect(14, 18, 3, 9, 'b');
  g.rect(6, 18, 11, 2, 'Q').rect(8, 20, 7, 1, 'Q').set(11, 19, 'Y');
  g.line(8, 23, 13, 26, 'B').line(14, 23, 9, 26, 'B');
  g.ellipse(11, 28, 9, 2, 'b').ellipse(9, 27, 8, 2, 't').rect(5, 29, 13, 2, 'b');
  g.set(4, 27, 'T').set(16, 28, 'T').line(13, 4, 14, 6, 'b');
  return art(g);
}

function dryPalm(): DecoArt {
  const g = new Grid(28, 35);
  for (let y = 9; y < 32; y++) {
    const x = 12 + Math.floor((y - 9) / 8);
    g.rect(x, y, 3, 1, 'b').set(x, y, 't').set(x + 2, y, 'B');
    if (y % 4 === 0) g.rect(x, y, 3, 1, 'B');
  }
  const fronds = [[13, 7, 4, 1, 0, 5], [13, 7, 22, 1, 27, 5], [13, 8, 4, 7, 0, 14], [14, 8, 23, 8, 27, 15], [13, 8, 11, 0, 16, 0]];
  for (const [x, y, mx, my, ex, ey] of fronds) {
    g.line(x, y, mx, my, 't').line(mx, my, ex, ey, 'b');
    g.line(x, y + 1, mx, my + 2, 'b').line(mx, my + 2, ex, ey, 'B');
  }
  g.ellipse(12, 9, 2, 2, 'B').ellipse(15, 10, 2, 2, 'B').set(11, 8, 'b');
  g.line(14, 30, 8, 34, 'B').line(16, 30, 21, 34, 'B').line(14, 31, 11, 33, 'b');
  g.rect(7, 34, 15, 1, 'b').set(19, 33, 't').set(8, 33, 't');
  return art(g);
}

function amphoraPile(): DecoArt {
  const g = new Grid(24, 25);
  g.ellipse(14, 14, 6, 9, 'o').ellipse(12, 12, 4, 7, 'h').rect(11, 2, 6, 3, 'b');
  g.rect(12, 5, 4, 5, 'h').rect(11, 2, 6, 1, 't').rect(12, 3, 4, 1, 'x');
  g.line(11, 5, 7, 9, 'b').line(7, 9, 8, 13, 'b').line(17, 5, 20, 9, 'B').line(20, 9, 19, 13, 'B');
  g.rect(9, 13, 10, 2, 't').rect(10, 16, 9, 1, 'B');
  for (let x = 10; x < 19; x += 3) g.set(x, 13, 'Q').set(x + 1, 14, 'Q');
  g.ellipse(6, 19, 5, 5, 'b').ellipse(5, 18, 3, 4, 'h').rect(4, 13, 4, 3, 'b');
  g.rect(4, 13, 4, 1, 't').rect(4, 15, 4, 1, 'B').rect(2, 20, 8, 1, 't');
  g.rect(3, 21, 7, 1, 'Q').set(4, 17, 't');
  g.ellipse(19, 21, 4, 3, 'o').rect(17, 18, 4, 2, 'B').set(17, 18, 't');
  g.rect(4, 24, 16, 1, 'b').set(13, 23, 't').set(20, 23, 't');
  return art(g);
}

// ---------------------------------------------------------------- volcano

function lavaPillar(): DecoArt {
  const g = new Grid(21, 33);
  g.tri(6, 3, 3, 28, 16, 28, 'd').tri(13, 1, 8, 28, 18, 28, 'n');
  g.rect(6, 3, 7, 25, 'd').rect(6, 4, 2, 22, 'v').rect(13, 6, 3, 22, 'n');
  g.tri(6, 3, 10, 0, 15, 4, 'G').rect(7, 3, 7, 2, 'D').set(9, 1, 'g');
  g.line(11, 5, 10, 11, 'O').line(10, 11, 13, 15, 'O').line(13, 15, 10, 20, 'O');
  g.line(10, 20, 12, 27, 'r').set(11, 7, 'Y').set(11, 12, 'Y').set(12, 16, 'y');
  g.line(11, 13, 6, 15, 'r').set(7, 15, 'O');
  g.tri(4, 21, 1, 30, 7, 30, 'n').tri(17, 20, 14, 30, 20, 30, 'n');
  pedestal(g, 2, 30, 17, 'd', 'n');
  g.set(6, 31, 'O');
  return art(g, { dx: 0, dy: -16, r: 23, color: E.orange });
}

function sulfurVent(): DecoArt {
  const g = new Grid(25, 25);
  g.ellipse(12, 19, 11, 5, 'n').ellipse(11, 17, 9, 5, 'd').ellipse(12, 15, 7, 4, 'v');
  g.ellipse(12, 14, 6, 3, 'B').ellipse(12, 14, 4, 2, 'o').ellipse(12, 14, 3, 1, 'O');
  g.set(11, 14, 'Y').set(14, 14, 'y').rect(5, 17, 2, 2, 'y').set(19, 18, 'y');
  g.tri(5, 10, 2, 19, 8, 19, 'D').line(5, 11, 3, 17, 'G');
  g.tri(20, 11, 17, 20, 23, 20, 'd').set(20, 13, 'v');
  // Broken sulphur crust and wisps have an open silhouette, not a solid flame.
  g.rect(7, 19, 3, 1, 'y').rect(8, 20, 2, 1, 'b').set(15, 19, 'Y');
  g.line(11, 10, 10, 7, 'G').line(10, 7, 12, 4, 'G').set(12, 2, 'D');
  g.line(15, 10, 16, 7, 'D').line(16, 7, 15, 5, 'D').set(16, 3, 'G');
  g.set(8, 5, 'G').set(13, 0, 'D').rect(5, 23, 16, 2, 'n');
  return art(g, { dx: 0, dy: -10, r: 18, color: E.amber });
}

function emberAltar(): DecoArt {
  const g = new Grid(24, 27);
  pedestal(g, 3, 24, 18, 'D', 'n');
  g.rect(5, 17, 14, 7, 'd').rect(5, 17, 2, 7, 'D').rect(17, 17, 2, 7, 'n');
  g.rect(3, 14, 18, 3, 'D').rect(3, 14, 18, 1, 'G').rect(4, 16, 16, 1, 'n');
  g.ellipse(12, 13, 7, 2, 'n').ellipse(12, 12, 5, 2, 'r').ellipse(12, 12, 3, 1, 'O');
  g.tri(11, 2, 7, 12, 15, 12, 'r').tri(15, 5, 11, 12, 18, 12, 'O');
  g.tri(11, 5, 9, 12, 14, 12, 'y').set(12, 9, 'Y').set(9, 0, 'O').set(16, 2, 'y');
  g.rect(10, 19, 4, 1, 'O').rect(11, 20, 2, 3, 'r').set(12, 21, 'y');
  g.line(7, 18, 8, 22, 'n').line(15, 20, 16, 23, 'n');
  g.set(4, 13, 'O').set(19, 13, 'r');
  return art(g, { dx: 0, dy: -17, r: 25, color: E.orange });
}

// ---------------------------------------------------------------- factory

function generator(): DecoArt {
  const g = new Grid(25, 27);
  pedestal(g, 3, 24, 19, 'G', 'n');
  g.rect(2, 11, 17, 12, 'D').rect(2, 11, 2, 12, 'G').rect(17, 11, 2, 12, 'd');
  g.ellipse(11, 15, 7, 7, 'd').ellipse(10, 14, 6, 6, 'G').ellipse(10, 14, 4, 4, 'n');
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    g.line(10, 14, 10 + Math.round(Math.cos(a) * 3), 14 + Math.round(Math.sin(a) * 3), 'D');
  }
  g.ellipse(10, 14, 1, 1, 'g');
  g.rect(19, 5, 4, 17, 'd').rect(19, 5, 1, 17, 'G').rect(18, 3, 6, 2, 'D');
  g.rect(4, 5, 9, 4, 'B').rect(4, 5, 9, 1, 'b').rect(6, 3, 5, 2, 'D');
  g.rect(3, 21, 14, 2, 'y');
  for (const x of [4, 8, 12]) g.line(x, 21, x + 1, 22, 'n');
  g.rect(14, 7, 3, 3, 'n').set(15, 8, 'l').set(3, 12, 'w').set(17, 22, 'g');
  g.rect(19, 0, 3, 1, 'G').set(22, 1, 'D');
  return art(g);
}

function pressureTank(): DecoArt {
  const g = new Grid(21, 33);
  g.rect(5, 8, 11, 21, 'D').ellipse(10, 8, 5, 4, 'G').ellipse(10, 27, 5, 3, 'D');
  g.rect(5, 9, 2, 17, 'G').rect(14, 9, 2, 17, 'd');
  g.rect(4, 11, 13, 2, 'd').rect(4, 23, 13, 2, 'd').rect(5, 11, 10, 1, 'G');
  g.rect(9, 2, 3, 4, 'G').rect(6, 1, 9, 1, 'r').rect(8, 0, 5, 1, 'p').set(10, 2, 'R');
  g.ellipse(10, 16, 3, 3, 'n').ellipse(10, 16, 2, 2, 'T').line(10, 16, 11, 14, 'r');
  g.rect(18, 14, 2, 13, 'B').rect(15, 14, 4, 2, 'b').rect(17, 25, 3, 2, 'b');
  g.rect(8, 21, 4, 1, 'y').set(9, 21, 'n');
  g.rect(5, 28, 3, 4, 'd').rect(13, 28, 3, 4, 'n');
  g.rect(3, 32, 15, 1, 'D').set(6, 30, 'G').set(14, 30, 'G');
  return art(g);
}

function toolRack(): DecoArt {
  const g = new Grid(25, 30);
  g.rect(3, 2, 19, 21, 'B').rect(3, 2, 19, 1, 'b').rect(21, 3, 1, 20, 'x');
  g.rect(5, 4, 15, 16, 'd');
  for (const y of [5, 9, 13, 17]) for (let x = 6; x < 20; x += 3) g.set(x, y, 'n');
  // Open jaw spanner, long screwdriver and a hammer hang at different heights.
  g.rect(7, 6, 1, 10, 'G').rect(6, 5, 3, 3, 'g').set(7, 5, 'd').set(7, 6, 'd').set(7, 16, 'g');
  g.rect(12, 6, 1, 8, 'g').rect(11, 14, 3, 4, 'r').rect(11, 14, 1, 3, 'p');
  g.rect(17, 9, 1, 10, 'b').rect(15, 7, 5, 3, 'G').rect(15, 7, 5, 1, 'g');
  g.rect(1, 22, 23, 3, 'D').rect(1, 22, 23, 1, 'G');
  g.rect(4, 25, 3, 4, 'd').rect(18, 25, 3, 4, 'd').rect(4, 29, 17, 1, 'n');
  g.rect(6, 20, 5, 2, 'y').rect(14, 20, 4, 2, 'B').set(15, 20, 't');
  g.set(4, 3, 'g').set(20, 3, 'g').set(3, 23, 'g').set(22, 23, 'g');
  return art(g);
}

// ---------------------------------------------------------------- castle

function forbiddenBooks(): DecoArt {
  const g = new Grid(25, 34);
  g.rect(3, 3, 19, 27, 'x').rect(3, 3, 2, 27, 'B').rect(20, 3, 2, 27, 'B');
  g.tri(4, 3, 12, 0, 21, 3, 'B').rect(5, 3, 15, 1, 'b');
  for (const y of [11, 21, 29]) g.rect(4, y, 17, 2, 'B').rect(4, y, 17, 1, 'b');
  for (const [x, top, color] of [[6, 5, 'R'], [9, 4, 'Q'], [12, 6, 'L'], [16, 5, 'v'], [6, 14, 'Q'], [10, 15, 'R'], [14, 14, 'B'], [17, 13, 'v']] as const) {
    const bottom = top < 12 ? 10 : 20;
    g.rect(x, top, 2, bottom - top + 1, color).set(x, top + 1, 't').set(x, bottom - 1, 't');
  }
  g.rect(6, 24, 8, 2, 't').rect(6, 23, 8, 1, 'R').rect(8, 26, 10, 2, 'T').rect(8, 28, 10, 1, 'Q');
  g.line(17, 3, 20, 7, 'G').line(19, 3, 20, 5, 'G').line(16, 3, 20, 4, 'G');
  g.rect(3, 31, 4, 3, 'B').rect(18, 31, 4, 3, 'x').rect(5, 33, 15, 1, 'x');
  return art(g);
}

function brokenBell(): DecoArt {
  const g = new Grid(24, 34);
  g.rect(3, 5, 2, 26, 'B').rect(19, 5, 2, 26, 'x').rect(2, 3, 20, 3, 'B').rect(2, 3, 20, 1, 'b');
  g.line(4, 6, 9, 2, 'b').line(19, 6, 15, 2, 'B').rect(9, 1, 6, 2, 'B');
  g.rect(11, 5, 2, 6, 'D').rect(9, 10, 6, 3, 'b');
  g.ellipse(12, 17, 6, 6, 'b').rect(6, 17, 12, 7, 'b').rect(7, 14, 2, 7, 't');
  g.tri(6, 20, 3, 25, 12, 25, 'b').tri(18, 20, 12, 25, 21, 25, 'B');
  g.rect(3, 25, 18, 2, 'B').rect(4, 25, 16, 1, 't').rect(11, 27, 2, 2, 'D');
  g.line(14, 14, 12, 19, 'x').line(12, 19, 15, 22, 'x').line(15, 22, 14, 26, 'x');
  g.set(10, 12, 't').rect(4, 31, 16, 3, 'd').rect(5, 31, 14, 1, 'G');
  g.set(6, 30, 'L').set(7, 31, 'M').set(18, 30, 'L');
  return art(g);
}

function alchemyStove(): DecoArt {
  const g = new Grid(25, 29);
  g.rect(4, 19, 17, 8, 'd').rect(4, 19, 2, 8, 'G').rect(19, 19, 2, 8, 'n');
  g.ellipse(12, 23, 5, 3, 'n').ellipse(12, 24, 3, 2, 'r').set(11, 23, 'O').set(13, 24, 'y');
  g.rect(3, 18, 19, 2, 'G').rect(4, 19, 17, 1, 'D');
  g.ellipse(12, 12, 7, 6, 'd').ellipse(10, 12, 5, 4, 'D');
  g.ellipse(12, 8, 7, 2, 'n').ellipse(12, 8, 5, 1, 'L').set(10, 7, 'l').set(14, 8, 'Y');
  g.line(5, 9, 2, 11, 'G').line(2, 11, 4, 14, 'D').line(19, 9, 22, 11, 'D').line(22, 11, 20, 14, 'D');
  g.rect(20, 2, 2, 10, 'B').line(20, 2, 17, 1, 'b').rect(16, 0, 3, 2, 'B');
  g.set(10, 4, 'l').set(12, 2, 'L').set(15, 5, 'c').set(9, 0, 'L');
  g.rect(5, 27, 15, 2, 'n').set(6, 27, 'G').set(18, 27, 'G');
  return art(g, { dx: 0, dy: -19, r: 18, color: E.green });
}

// ---------------------------------------------------------------- garden

function bambooGrove(): DecoArt {
  const g = new Grid(27, 36);
  for (const [x, top, bottom] of [[7, 4, 34], [12, 0, 34], [18, 6, 34]]) {
    g.rect(x, top, 2, bottom - top, 'L').rect(x, top, 1, bottom - top, 'l');
    for (let y = top + 5; y < bottom; y += 7) g.rect(x - 1, y, 4, 1, 'M').set(x, y, 't');
  }
  for (const [x, y, dir] of [[8, 10, -1], [13, 6, 1], [13, 17, -1], [19, 12, 1], [19, 24, 1], [8, 23, -1]]) {
    g.line(x, y, x + dir * 5, y - 3, 'M');
    g.line(x + dir * 2, y - 1, x + dir * 5, y - 6, 'L');
    g.line(x + dir * 3, y - 2, x + dir * 7, y - 2, 'L');
    g.line(x + dir * 4, y - 2, x + dir * 6, y + 1, 'M');
    g.set(x + dir * 4, y - 4, 'l');
  }
  g.rect(5, 34, 17, 2, 'M').set(8, 33, 'L').set(15, 33, 'l').set(20, 33, 'L');
  return art(g);
}

function stoneWaterBowl(): DecoArt {
  const g = new Grid(24, 25);
  g.rect(8, 13, 8, 9, 'D').rect(8, 13, 2, 9, 'G').rect(14, 14, 2, 8, 'd');
  g.ellipse(12, 11, 10, 5, 'D').ellipse(12, 8, 10, 4, 'G');
  g.ellipse(12, 8, 8, 3, 'd').ellipse(12, 8, 6, 2, 'Q').rect(7, 7, 6, 1, 'C').set(8, 7, 'c');
  g.line(3, 9, 6, 12, 'g').rect(7, 13, 8, 1, 'G');
  g.rect(18, 0, 2, 10, 'L').rect(18, 1, 1, 8, 'l').rect(12, 3, 7, 2, 'L').rect(12, 3, 6, 1, 't');
  g.rect(12, 5, 1, 2, 'C').set(12, 7, 'c').rect(17, 0, 4, 1, 'M');
  pedestal(g, 4, 22, 16, 'G', 'D');
  g.rect(5, 21, 3, 2, 'M').set(6, 21, 'L').set(16, 23, 'L');
  return art(g);
}

function wishRack(): DecoArt {
  const g = new Grid(27, 34);
  g.rect(5, 7, 2, 24, 'B').rect(20, 7, 2, 24, 'B').rect(5, 7, 1, 24, 'b');
  g.rect(4, 12, 19, 2, 'b').rect(4, 22, 19, 2, 'B');
  g.tri(13, 0, 0, 7, 26, 7, 'd').tri(13, 2, 3, 7, 23, 7, 'G');
  g.rect(1, 7, 25, 2, 'd').rect(3, 9, 21, 1, 'B').set(13, 0, 'g');
  for (const [x, y, color] of [[7, 15, 'T'], [12, 14, 't'], [17, 16, 'T'], [9, 25, 't'], [16, 25, 'T']] as const) {
    g.line(x + 1, y - 2, x + 1, y, 'r').rect(x, y, 4, 5, color).set(x + 1, y + 1, 'B').set(x + 2, y + 3, 'r');
  }
  g.rect(4, 31, 4, 3, 'D').rect(19, 31, 4, 3, 'D').rect(6, 33, 15, 1, 'D');
  g.set(9, 31, 'L').set(18, 32, 'M');
  return art(g);
}

// ---------------------------------------------------------------- palace

function smallFountain(): DecoArt {
  const g = new Grid(25, 34);
  pedestal(g, 4, 31, 17, 'g', 'G');
  g.rect(9, 22, 7, 9, 'g').rect(9, 22, 2, 8, 'w').rect(14, 23, 2, 8, 'G');
  g.ellipse(12, 22, 10, 5, 'G').ellipse(12, 19, 10, 3, 'w').ellipse(12, 19, 8, 2, 'C');
  g.rect(9, 19, 7, 1, 'c').rect(11, 9, 3, 10, 'g').rect(11, 9, 1, 9, 'w');
  g.ellipse(12, 10, 6, 2, 'g').ellipse(12, 9, 5, 1, 'C').rect(9, 9, 6, 1, 'c');
  g.rect(12, 3, 1, 6, 'c').set(12, 1, 'w').set(10, 3, 'c').set(14, 4, 'C');
  g.rect(7, 11, 1, 7, 'c').rect(17, 11, 1, 7, 'C').set(6, 19, 'c').set(18, 19, 'c');
  g.rect(8, 24, 9, 1, 'y').set(5, 22, 'w').set(19, 22, 'g');
  g.rect(10, 28, 4, 1, 'y');
  return art(g);
}

function royalHarp(): DecoArt {
  const g = new Grid(25, 33);
  pedestal(g, 4, 30, 18, 't', 'b');
  g.rect(6, 7, 3, 23, 'y').rect(6, 7, 1, 22, 'T').rect(8, 10, 1, 20, 'b');
  g.line(8, 6, 20, 2, 'y').line(8, 7, 20, 3, 't').line(21, 3, 21, 15, 'b');
  g.line(21, 15, 17, 26, 'y').line(17, 26, 10, 30, 'y');
  g.line(22, 4, 22, 15, 't').line(22, 15, 18, 27, 'b');
  for (let x = 10; x <= 19; x += 2) {
    const top = 7 - Math.floor((x - 10) / 3);
    const bottom = x < 16 ? 29 : 27 - (x - 16) * 2;
    g.rect(x, top, 1, bottom - top, 'T');
  }
  g.ellipse(7, 5, 3, 3, 'y').ellipse(7, 5, 1, 1, 'B').set(6, 3, 'Y');
  g.ellipse(21, 2, 2, 2, 'y').set(21, 1, 'T').set(20, 3, 'b');
  g.rect(7, 25, 3, 2, 'r').set(7, 26, 'p');
  return art(g);
}

function laurelUrn(): DecoArt {
  const g = new Grid(23, 32);
  pedestal(g, 3, 29, 17, 'T', 'b');
  g.rect(8, 23, 7, 6, 't').rect(8, 23, 1, 6, 'T').rect(13, 23, 2, 6, 'b');
  g.ellipse(11, 16, 7, 8, 't').ellipse(9, 14, 4, 6, 'T').ellipse(15, 19, 3, 4, 'b');
  g.rect(6, 8, 11, 2, 'y').rect(7, 10, 9, 2, 't').rect(6, 8, 11, 1, 'T');
  g.line(5, 11, 2, 12, 'y').line(2, 12, 3, 18, 'y').line(3, 18, 6, 19, 'b');
  g.line(17, 11, 20, 12, 'b').line(20, 12, 19, 18, 'b').line(19, 18, 17, 19, 'b');
  // A small clipped laurel crown makes this more than another empty vessel.
  g.line(11, 8, 8, 1, 'B').line(11, 8, 15, 1, 'B');
  for (const [x, y] of [[7, 1], [9, 3], [8, 5], [14, 1], [13, 4], [15, 5]]) {
    g.rect(x, y, 3, 1, 'L').set(x, y - 1, 'l');
  }
  g.rect(7, 17, 9, 1, 'y').set(10, 19, 'y').set(11, 20, 'y').set(12, 19, 'y');
  return art(g);
}

// ---------------------------------------------------------------- reef

function shipWheel(): DecoArt {
  const g = new Grid(27, 32);
  g.rect(11, 14, 4, 15, 'B').rect(11, 14, 1, 15, 'b');
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const x = 13 + Math.round(Math.cos(a) * 12);
    const y = 12 + Math.round(Math.sin(a) * 12);
    g.line(13, 12, x, y, 'B').set(x, y, 'b');
  }
  g.ellipse(13, 12, 9, 9, 'b').ellipse(13, 12, 7, 7, '.');
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    g.line(13, 12, 13 + Math.round(Math.cos(a) * 8), 12 + Math.round(Math.sin(a) * 8), 'B');
  }
  g.ellipse(13, 12, 3, 3, 'y').ellipse(13, 12, 1, 1, 'B');
  g.set(6, 6, 't').set(8, 4, 't').set(17, 20, 'B').set(21, 14, 'B');
  g.rect(6, 29, 16, 3, 'D').rect(7, 29, 14, 1, 'G');
  g.rect(9, 27, 2, 3, 'M').set(8, 26, 'L').set(10, 25, 'l');
  g.set(20, 18, 'T').set(19, 20, 'g').set(7, 17, 'T');
  return art(g);
}

function kelpGrove(): DecoArt {
  const g = new Grid(27, 35);
  // Curved blades are stepped strips, separated by transparent water gaps.
  for (const [base, top, phase, color] of [[7, 7, 0, 'L'], [12, 0, 2, 'M'], [18, 4, 4, 'L'], [22, 13, 1, 'M']] as const) {
    for (let y = top; y < 32; y++) {
      const dx = Math.round(Math.sin((y + phase) * 0.32) * 2);
      g.rect(base + dx, y, y < top + 2 ? 1 : 2, 1, color);
      if (y % 7 === 2 && y > top + 3) g.line(base + dx, y, base + dx - 3, y - 3, color);
      if (y % 8 === 0 && color === 'L') g.set(base + dx, y, 'l');
    }
  }
  g.ellipse(13, 32, 9, 2, 'D').ellipse(10, 31, 5, 2, 'G');
  g.set(8, 31, 'g').set(17, 33, 'd').set(20, 31, 'T');
  g.ellipse(5, 24, 2, 1, 'P').set(3, 23, 'p').ellipse(19, 27, 2, 1, 'P');
  g.rect(6, 34, 15, 1, 'D');
  return art(g);
}

function wreckMast(): DecoArt {
  const g = new Grid(28, 36);
  g.rect(13, 0, 3, 32, 'B').rect(13, 1, 1, 30, 'b').set(15, 0, '.').set(14, 0, 't');
  g.rect(2, 5, 24, 2, 'B').rect(2, 5, 24, 1, 'b');
  g.tri(4, 7, 12, 7, 12, 23, 'g').tri(4, 7, 3, 20, 12, 23, 'G');
  g.line(6, 9, 11, 20, 'D').rect(3, 17, 2, 3, '.').rect(9, 21, 2, 3, '.');
  g.tri(17, 7, 24, 7, 19, 18, 'G').rect(20, 13, 3, 2, '.').set(18, 17, 'g');
  g.line(3, 7, 8, 30, 'b').line(25, 7, 20, 29, 'B');
  g.rect(6, 30, 17, 4, 'B').rect(6, 30, 17, 1, 'b').rect(9, 34, 11, 2, 'x');
  g.line(8, 32, 20, 32, 'x').set(10, 31, 't').set(21, 31, 'D');
  g.rect(15, 24, 2, 5, 'M').set(16, 23, 'L').set(17, 26, 'L');
  g.set(7, 30, 'g').set(8, 29, 'T').set(20, 33, 'L');
  return art(g);
}

// ---------------------------------------------------------------- neon

function arcadeCabinet(): DecoArt {
  const g = new Grid(24, 33);
  g.rect(5, 1, 15, 6, 'P').rect(5, 1, 15, 1, 'p').rect(19, 2, 2, 5, 'v');
  g.rect(6, 3, 12, 2, 'n').rect(8, 3, 4, 1, 'c').rect(14, 4, 3, 1, 'p');
  g.rect(5, 7, 15, 14, 'v').rect(5, 7, 2, 13, 'P').rect(18, 7, 2, 14, 'n');
  g.rect(7, 8, 11, 10, 'n').rect(8, 9, 9, 8, 'Q');
  g.rect(10, 11, 3, 2, 'c').set(9, 13, 'c').set(13, 13, 'c').set(11, 14, 'Y');
  g.set(15, 10, 'w').set(9, 16, 'C').rect(13, 16, 3, 1, 'c');
  g.rect(3, 20, 19, 3, 'P').rect(3, 20, 19, 1, 'p').rect(4, 23, 17, 8, 'v');
  g.rect(4, 24, 2, 7, 'P').rect(19, 23, 2, 8, 'n');
  g.set(8, 19, 'r').rect(8, 20, 1, 2, 'D').set(15, 21, 'c').set(18, 21, 'Y');
  g.rect(10, 26, 6, 2, 'n').set(11, 26, 'y').rect(6, 31, 13, 2, 'n');
  return art(g, { dx: 0, dy: -20, r: 20, color: E.magenta });
}

function holoColumn(): DecoArt {
  const g = new Grid(24, 35);
  pedestal(g, 4, 32, 17, 'D', 'n');
  g.rect(8, 25, 9, 7, 'd').rect(8, 25, 2, 7, 'G').rect(10, 28, 5, 1, 'c');
  g.ellipse(12, 25, 7, 2, 'D').ellipse(12, 24, 5, 1, 'c');
  // A broken projected contour and scan rows keep the hologram airy.
  g.rect(5, 3, 14, 1, 'c').rect(4, 4, 1, 16, 'C').rect(19, 4, 1, 16, 'c');
  g.rect(5, 20, 14, 1, 'C').rect(5, 8, 14, 1, 'Q').rect(5, 14, 14, 1, 'Q');
  g.set(4, 10, '.').set(19, 16, '.').rect(10, 20, 4, 1, '.');
  g.tri(12, 5, 7, 11, 17, 11, 'P').tri(7, 11, 17, 11, 12, 17, 'v');
  g.line(12, 6, 9, 11, 'p').line(9, 11, 12, 15, 'P').set(12, 10, 'Y');
  g.set(9, 22, 'C').set(15, 22, 'C').rect(7, 0, 3, 1, 'P').set(18, 1, 'c');
  return art(g, { dx: 0, dy: -22, r: 20, color: E.cyan });
}

function signalBox(): DecoArt {
  const g = new Grid(23, 34);
  g.rect(10, 8, 3, 24, 'D').rect(10, 9, 1, 22, 'G');
  g.rect(4, 1, 13, 16, 'n').rect(4, 1, 13, 1, 'G').rect(4, 2, 1, 15, 'D');
  for (const [y, color] of [[4, 'R'], [9, 'y'], [14, 'l']] as const) {
    g.rect(6, y - 2, 9, 1, 'D').ellipse(10, y, 2, 2, color).set(9, y - 1, color === 'l' ? 'Y' : 'D');
  }
  g.rect(14, 19, 7, 9, 'D').rect(14, 19, 7, 1, 'G').rect(15, 21, 5, 4, 'n');
  g.set(17, 21, 'c').rect(16, 22, 3, 1, 'c').rect(17, 23, 1, 2, 'C');
  g.rect(15, 26, 4, 1, 'y').set(16, 26, 'n').rect(6, 26, 4, 2, 'P');
  g.line(7, 17, 7, 22, 'n').line(7, 22, 10, 24, 'n');
  pedestal(g, 5, 31, 14, 'G', 'd');
  return art(g, { dx: -1, dy: -20, r: 16, color: E.green });
}

export const EXTRA_DECO_NAMES: Record<string, string[]> = {
  glacier: ['冰封石门', '雪橇补给', '覆雪岩堆'],
  desert: ['半埋法老像', '枯棕榈', '陶罐堆'],
  volcano: ['熔脉岩柱', '硫磺喷口', '熔火祭坛'],
  factory: ['发电机', '压力罐', '工具架'],
  castle: ['禁书架', '破钟', '炼金炉'],
  garden: ['竹簇', '石水钵', '祈愿架'],
  palace: ['小喷泉', '竖琴台', '桂冠瓮'],
  reef: ['沉船舵', '海藻簇', '断帆桅杆'],
  neon: ['电玩街机', '全息广告柱', '信号灯箱'],
};

/** The caller appends these to each biome's three established standing pieces. */
export function extraBiomeDecor(biome: string): DecoArt[] {
  switch (biome) {
    case 'glacier': return [frozenGate(), supplySled(), snowCairn()];
    case 'desert': return [buriedPharaoh(), dryPalm(), amphoraPile()];
    case 'volcano': return [lavaPillar(), sulfurVent(), emberAltar()];
    case 'factory': return [generator(), pressureTank(), toolRack()];
    case 'castle': return [forbiddenBooks(), brokenBell(), alchemyStove()];
    case 'garden': return [bambooGrove(), stoneWaterBowl(), wishRack()];
    case 'palace': return [smallFountain(), royalHarp(), laurelUrn()];
    case 'reef': return [shipWheel(), kelpGrove(), wreckMast()];
    case 'neon': return [arcadeCabinet(), holoColumn(), signalBox()];
    default: return [];
  }
}
