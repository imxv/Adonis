import { Grid } from './draw';
import { E, mix } from './palette';
import type { Rng } from '../core/rng';
import { forestDecor, paintForestWall } from './forestDecor';
import { extraBiomeDecor, EXTRA_DECO_NAMES } from './biomeDecor';

/*
 * Biome dressing. Standing pieces (statues, trees, lanterns...) that block like a wall tile
 * and do nothing else, plus painters for wall decorations (murals, chains, vines...) and floor clutter,
 * which are baked straight into the level image.
 */

export interface DecoArt {
  g: Grid;
  colors: Record<string, string>;
  /** A light it gives off, from the bottom centre of its tile. */
  light?: { dx: number; dy: number; r: number; color: string };
}

const STONE = { S: E.white, s: E.grey, D: E.greyM, d: E.slate };
const LEAF = { L: E.green, l: E.greenD, d: E.greenDD };
const BARK = { h: E.brownL, b: E.brown, B: E.brownD };

// ---------------------------------------------------------------- glacier

function pine(): DecoArt {
  const g = new Grid(17, 27);
  g.rect(7, 22, 3, 5, 'b').rect(7, 22, 1, 5, 'h');
  const tiers: [number, number, number][] = [[1, 10, 4], [6, 16, 6], [11, 23, 8]];
  for (const [top, bottom, half] of tiers) {
    g.tri(8, top, 8 - half, bottom, 8 + half, bottom, 'l');
    g.tri(9, top + 2, 8 + half, bottom, 9, bottom, 'd');
    // Snow on each tier: a cap and a lip.
    g.line(8, top, 8 - half + 1, bottom - 1, 'W').line(8, top, 8 + half - 1, bottom - 1, 'W');
    g.rect(8 - half, bottom, half * 2 + 1, 1, 'W');
    g.set(8, top, 'W').set(8, top + 1, 'W').set(7, top + 1, 'W');
  }
  g.rect(3, 26, 11, 1, 'W');
  return { g, colors: { l: E.greenDD, d: E.tealD, W: E.white, b: E.brown, h: E.brownL } };
}

function iceShards(): DecoArt {
  const g = new Grid(16, 19);
  g.rect(1, 15, 14, 4, 'i').rect(1, 15, 14, 1, 'W').rect(14, 15, 1, 4, 'k');
  g.tri(8, 0, 4, 15, 12, 15, 'c').tri(8, 0, 4, 15, 7, 15, 'W').line(8, 1, 10, 15, 'k');
  g.tri(3, 5, 0, 15, 6, 15, 'c').line(3, 5, 1, 14, 'W');
  g.tri(13, 4, 10, 15, 16, 15, 'c').line(13, 4, 15, 14, 'k').line(13, 5, 11, 14, 'W');
  g.set(8, 6, 'S').set(7, 9, 'S').set(13, 9, 'S');
  return { g, colors: { c: E.cyan, W: E.white, k: E.blue, i: E.grey, S: E.white } };
}

function snowman(): DecoArt {
  const g = new Grid(16, 22);
  g.ellipse(8, 16, 6, 5, 'w').ellipse(8, 9.5, 4.5, 3.5, 'w').ellipse(8, 3.5, 3.5, 3, 'w');
  g.ellipse(10, 18, 3.5, 2.5, 'g').ellipse(10, 11, 2.5, 1.5, 'g').ellipse(10, 5, 1.5, 1.2, 'g');
  g.set(7, 3, 'k').set(9, 3, 'k').set(8, 4, 'O').set(9, 4, 'O').set(10, 4, 'r');
  g.rect(4, 6, 8, 2, 'r').rect(9, 8, 2, 3, 'r').set(10, 10, 'R').set(5, 7, 'R');
  for (const y of [10, 13, 16]) g.set(8, y, 'k');
  g.line(4, 9, 0, 6, 'b').set(0, 5, 'b').line(12, 9, 15, 6, 'b').set(15, 5, 'b').set(14, 6, 'b');
  g.rect(3, 21, 11, 1, 'g');
  return { g, colors: { w: E.white, g: E.grey, k: E.ink, O: E.orange, r: E.red, R: E.redD, b: E.brown } };
}

// ---------------------------------------------------------------- desert

function cactus(): DecoArt {
  const g = new Grid(16, 25);
  g.rect(6, 2, 4, 21, 'g').rect(7, 1, 2, 1, 'g').rect(6, 2, 1, 21, 'G').rect(9, 2, 1, 21, 'd');
  g.rect(2, 8, 3, 6, 'g').rect(2, 8, 1, 6, 'G').rect(2, 13, 5, 2, 'g').rect(4, 14, 2, 1, 'd');
  g.rect(12, 5, 3, 7, 'g').rect(14, 5, 1, 7, 'd').rect(10, 10, 4, 2, 'g').rect(10, 11, 3, 1, 'd');
  for (const [x, y] of [[5, 5], [10, 7], [5, 12], [10, 16], [5, 19], [1, 10], [15, 8], [8, 4], [7, 9], [8, 14]]) g.set(x, y, 'T');
  g.set(7, 0, 'p').set(8, 0, 'P').set(8, 1, 'p').set(13, 4, 'p');
  g.ellipse(8, 23.5, 7, 1.5, 's').rect(2, 24, 12, 1, 'S');
  return { g, colors: { g: E.greenD, G: E.green, d: E.greenDD, T: E.cream, p: E.pink, P: E.magenta, s: E.tan, S: E.brownL } };
}

function obelisk(): DecoArt {
  const g = new Grid(12, 27);
  g.tri(6, 0, 3, 4, 9, 4, 'Y').line(6, 0, 3, 4, 'y');
  for (let y = 4; y < 23; y++) {
    const half = 3 + Math.floor((y - 4) / 8);
    g.rect(6 - half, y, half * 2, 1, 'a');
    g.set(6 - half, y, 'A').set(5 + half, y, 'c');
  }
  // Glyphs: an eye, an ankh, a bird, a reed.
  g.rect(5, 6, 3, 1, 'h').set(6, 7, 'h').set(4, 7, 'h');
  g.set(6, 10, 'h').set(5, 11, 'h').set(7, 11, 'h').set(6, 12, 'h').rect(5, 13, 3, 1, 'h').rect(6, 14, 1, 2, 'h');
  g.rect(5, 17, 2, 1, 'h').set(7, 18, 'h').set(5, 18, 'h').set(4, 19, 'h');
  g.rect(0, 23, 12, 2, 'c').rect(0, 23, 12, 1, 'A').rect(1, 25, 10, 2, 'c').rect(1, 25, 10, 1, 'a');
  return { g, colors: { Y: E.yellow, y: E.amber, a: E.tan, A: E.cream, c: E.brownL, h: E.brown } };
}

function urn(): DecoArt {
  const g = new Grid(14, 17);
  g.rect(4, 0, 6, 1, 'O').rect(5, 1, 4, 4, 'o').rect(5, 1, 1, 4, 'O');
  g.ellipse(7, 9.5, 6, 5.5, 'o');
  g.ellipse(4.5, 7, 1.5, 2.5, 'O').ellipse(10, 12, 2.5, 2.5, 'r');
  g.line(4, 2, 2, 5, 'r').line(2, 5, 3, 7, 'r').line(9, 2, 11, 5, 'r').line(11, 5, 10, 7, 'r');
  for (let x = 2; x <= 11; x++) g.set(x, 9, x % 2 ? 'k' : 'T');
  g.rect(2, 10, 10, 1, 'k');
  g.rect(5, 15, 4, 2, 'r');
  return { g, colors: { o: E.clay, O: E.tan, r: E.rust, k: E.brownD, T: E.cream } };
}

// ---------------------------------------------------------------- volcano

function spire(): DecoArt {
  const g = new Grid(15, 25);
  g.tri(6, 0, 1, 22, 11, 22, 'n').tri(6, 0, 1, 22, 5, 22, 'v');
  g.tri(11, 8, 8, 22, 14, 22, 'n').line(11, 8, 9, 21, 'v');
  g.line(6, 4, 7, 9, 'O').line(7, 9, 5, 14, 'O').line(5, 14, 7, 19, 'Y').set(6, 6, 'Y').set(11, 14, 'O').set(12, 17, 'Y');
  g.rect(0, 22, 15, 3, 'k').rect(1, 22, 13, 1, 'n').set(3, 23, 'O').set(10, 23, 'O');
  return { g, colors: { n: E.navy, v: E.purple, k: E.ink, O: E.orange, Y: E.amber }, light: { dx: 0, dy: -10, r: 34, color: E.orange } };
}

function magmaRock(): DecoArt {
  const g = new Grid(17, 14);
  g.ellipse(8, 8, 8, 5.5, 'b').ellipse(6, 6, 5, 3, 'h').ellipse(11, 10, 5, 3, 'B');
  g.ellipse(13, 5, 3, 2.5, 'b').set(12, 4, 'h');
  g.line(3, 8, 7, 11, 'O').line(7, 11, 12, 8, 'O').line(12, 8, 14, 9, 'Y').line(8, 4, 9, 7, 'O').set(7, 11, 'Y').set(9, 6, 'Y');
  g.set(5, 2, 'O').set(10, 1, 'Y');
  return { g, colors: { b: E.brownD, h: E.brown, B: E.ink, O: E.orange, Y: E.amber }, light: { dx: 0, dy: -6, r: 30, color: E.orange } };
}

function deadTree(): DecoArt {
  const g = new Grid(17, 25);
  g.rect(7, 9, 3, 16, 'n').rect(7, 9, 1, 16, 'D');
  g.line(8, 12, 2, 5, 'n').line(2, 5, 1, 1, 'n').line(4, 8, 4, 4, 'n');
  g.line(9, 10, 14, 4, 'n').line(14, 4, 16, 2, 'n').line(12, 7, 13, 1, 'n');
  g.line(8, 9, 8, 2, 'n').line(8, 2, 6, 0, 'n');
  g.set(1, 0, 'O').set(16, 1, 'Y').set(13, 0, 'O').set(6, 0, 'Y').set(4, 3, 'O');
  g.line(8, 15, 9, 20, 'O').set(8, 17, 'Y');
  g.rect(4, 24, 9, 1, 'k').set(5, 23, 'n').set(11, 23, 'n');
  return { g, colors: { n: E.navy, D: E.slateD, k: E.ink, O: E.orange, Y: E.amber } };
}

// ---------------------------------------------------------------- factory

function boiler(): DecoArt {
  const g = new Grid(16, 23);
  g.rect(7, 0, 2, 4, 'g').rect(7, 0, 1, 4, 'G').rect(5, 1, 6, 1, 'r').set(5, 1, 'R');
  g.ellipse(8, 5, 6, 3, 'c').rect(2, 5, 12, 15, 'c');
  g.rect(2, 5, 2, 15, 'C').rect(13, 5, 1, 15, 'x').ellipse(6, 4, 2.5, 1, 'C');
  for (const y of [7, 17]) {
    g.rect(2, y, 12, 1, 'x');
    for (let x = 3; x <= 12; x += 3) g.set(x, y - 1, 'Y');
  }
  g.ellipse(8, 12, 2.5, 2.5, 'k').ellipse(8, 12, 1.8, 1.8, 'W').line(8, 12, 9, 10, 'r').set(8, 12, 'k');
  g.rect(3, 20, 2, 3, 'k').rect(11, 20, 2, 3, 'k').rect(2, 20, 12, 1, 'x');
  return { g, colors: { c: E.brownL, C: E.tan, x: E.brown, Y: E.amber, k: E.navy, W: E.grey, r: E.red, R: E.redD, g: E.greyM, G: E.grey } };
}

function gear(): DecoArt {
  const g = new Grid(17, 21);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.rect(Math.round(8 + Math.cos(a) * 7) - 1, Math.round(8 + Math.sin(a) * 7) - 1, 3, 3, 'g');
  }
  g.ellipse(8, 8, 6, 6, 'g').ellipse(7, 7, 4, 4, 'G').ellipse(9, 9, 4, 4, 'g');
  g.ellipse(8, 8, 3.5, 3.5, 'D').ellipse(8, 8, 1.5, 1.5, 'g').set(8, 8, 'k');
  g.line(8, 3, 8, 5, 'D').line(8, 11, 8, 13, 'D').line(3, 8, 5, 8, 'D').line(11, 8, 13, 8, 'D');
  g.rect(7, 15, 3, 4, 'D').rect(3, 19, 11, 2, 'D').rect(3, 19, 11, 1, 'g');
  g.set(4, 20, 'Y').set(12, 20, 'Y');
  return { g, colors: { g: E.greyM, G: E.grey, D: E.slateD, k: E.ink, Y: E.amber } };
}

function valve(): DecoArt {
  const g = new Grid(14, 25);
  g.rect(5, 0, 4, 22, 'g').rect(5, 0, 1, 22, 'G').rect(8, 0, 1, 22, 'D');
  for (const y of [3, 17]) g.rect(4, y, 6, 2, 'D').rect(4, y, 6, 1, 'g');
  g.ellipse(7, 10, 5, 5, 'r').ellipse(7, 10, 3.5, 3.5, '.');
  g.line(2, 10, 12, 10, 'r').line(7, 5, 7, 15, 'r').ellipse(7, 10, 1, 1, 'R');
  g.set(3, 7, 'p').set(4, 6, 'p');
  g.rect(3, 22, 8, 3, 'D').rect(3, 22, 8, 1, 'g');
  for (let x = 3; x < 11; x += 2) g.set(x, 24, 'Y');
  return { g, colors: { g: E.greyM, G: E.grey, D: E.slate, r: E.red, R: E.redD, p: E.pink, Y: E.yellow } };
}

// ---------------------------------------------------------------- castle

function tomb(): DecoArt {
  const g = new Grid(14, 19);
  g.ellipse(7, 5, 5, 4, 's').rect(2, 5, 10, 12, 's');
  g.rect(2, 4, 2, 13, 'S').set(4, 2, 'S').set(5, 1, 'S').rect(11, 5, 1, 12, 'D');
  g.rect(6, 4, 2, 9, 'D').rect(4, 6, 6, 2, 'D');
  g.line(9, 10, 10, 13, 'd').set(3, 13, 'd');
  g.set(3, 15, 'l').set(10, 14, 'l').set(11, 15, 'l');
  g.rect(0, 17, 14, 2, 'B').rect(1, 17, 12, 1, 'b');
  g.set(9, 16, 'v').set(10, 16, 'P').set(9, 15, 'l');
  return { g, colors: { S: E.greyM, s: E.slate, D: E.slateD, d: E.navy, l: E.greenD, B: E.brownD, b: E.brown, v: E.purple, P: E.magenta } };
}

function armor(): DecoArt {
  const g = new Grid(14, 27);
  // Plume, helm with a lit visor.
  g.rect(6, 0, 2, 2, 'r').set(8, 1, 'R');
  g.rect(4, 2, 6, 6, 'm').rect(4, 2, 1, 6, 'M').rect(9, 2, 1, 6, 'n').rect(5, 2, 4, 1, 'M');
  g.rect(5, 4, 4, 1, 'k').set(5, 4, 'c').set(8, 4, 'c');
  g.rect(5, 6, 4, 1, 'n');
  // Pauldrons, breastplate, belt, tassets.
  g.ellipse(3, 9, 2.5, 1.5, 'm').ellipse(10, 9, 2.5, 1.5, 'm').set(2, 8, 'M').set(9, 8, 'M');
  g.rect(4, 8, 6, 7, 'm').rect(4, 8, 1, 7, 'M').rect(9, 8, 1, 7, 'n').rect(6, 9, 1, 4, 'M');
  g.rect(1, 10, 2, 6, 'm').rect(11, 10, 2, 6, 'n').rect(1, 16, 2, 1, 'k').rect(11, 16, 2, 1, 'k');
  g.rect(4, 15, 6, 1, 'b').set(7, 15, 'Y');
  g.rect(4, 16, 6, 2, 'm').rect(4, 16, 1, 2, 'M');
  // Legs and the stand.
  g.rect(4, 18, 2, 6, 'm').rect(8, 18, 2, 6, 'n').rect(4, 18, 1, 6, 'M');
  g.rect(1, 24, 12, 3, 'B').rect(1, 24, 12, 1, 'b');
  return { g, colors: { m: E.greyM, M: E.grey, n: E.slate, k: E.ink, c: E.cyan, r: E.red, R: E.redD, b: E.brown, B: E.brownD, Y: E.amber }, light: { dx: 0, dy: -22, r: 14, color: E.cyan } };
}

function candelabra(): DecoArt {
  const g = new Grid(15, 27);
  for (const x of [1, 6, 11]) {
    const top = x === 6 ? 2 : 4;
    g.set(x + 1, top - 2, 'Y').rect(x, top - 1, 2, 1, 'O').set(x + 1, top - 1, 'Y');
    g.rect(x, top, 2, 4, 'w').set(x, top, 'W').set(x + 1, top + 1, 'T');
    g.rect(x - 1, top + 4, 4, 1, 'n');
  }
  g.rect(2, 9, 2, 3, 'n').rect(11, 9, 2, 3, 'n').rect(3, 11, 9, 2, 'n').rect(3, 11, 9, 1, 'D');
  g.rect(6, 7, 3, 16, 'n').rect(6, 7, 1, 16, 'D');
  g.ellipse(7, 17, 2, 1, 'n');
  g.tri(7, 21, 2, 26, 12, 26, 'n').line(7, 21, 2, 26, 'D').rect(2, 26, 11, 1, 'k');
  return { g, colors: { n: E.navy, D: E.slate, k: E.ink, w: E.cream, W: E.white, T: E.tan, O: E.orange, Y: E.yellow }, light: { dx: 0, dy: -24, r: 46, color: E.amber } };
}

// ---------------------------------------------------------------- garden

function stoneLantern(): DecoArt {
  const g = new Grid(15, 25);
  g.ellipse(7, 1, 1.5, 1.5, 's');
  g.tri(7, 2, 0, 7, 14, 7, 'D').rect(1, 6, 13, 2, 'D').set(0, 5, 'D').set(14, 5, 'D').line(7, 2, 1, 6, 's');
  g.rect(3, 8, 9, 6, 's').rect(3, 8, 1, 6, 'S').rect(11, 8, 1, 6, 'D');
  g.rect(5, 9, 5, 4, 'Y').rect(6, 10, 3, 2, 'O').rect(7, 9, 1, 4, 's');
  g.rect(2, 14, 11, 1, 'D').rect(6, 15, 3, 6, 's').rect(6, 15, 1, 6, 'S');
  g.rect(3, 21, 9, 2, 's').rect(3, 21, 9, 1, 'S').rect(2, 23, 11, 2, 'D');
  g.set(4, 22, 'l').set(10, 24, 'l').set(3, 24, 'L');
  return { g, colors: { S: E.grey, s: E.greyM, D: E.slate, Y: E.yellow, O: E.amber, l: E.greenD, L: E.green }, light: { dx: 0, dy: -14, r: 40, color: E.amber } };
}

function bonsai(): DecoArt {
  const g = new Grid(17, 19);
  g.rect(2, 14, 13, 4, 'k').rect(1, 13, 15, 2, 'K').rect(1, 13, 15, 1, 'c').rect(3, 18, 11, 1, 'n');
  g.rect(4, 15, 9, 1, 'c');
  g.line(8, 13, 7, 10, 'b').line(7, 10, 9, 7, 'b').line(9, 7, 8, 4, 'b').line(8, 10, 12, 8, 'b').line(7, 9, 4, 7, 'h');
  g.ellipse(4, 6, 3.5, 2, 'l').ellipse(12.5, 6.5, 3.5, 2, 'l').ellipse(8, 2.5, 3.5, 2, 'l');
  g.rect(2, 5, 4, 1, 'L').rect(11, 5, 4, 1, 'L').rect(6, 1, 4, 1, 'L');
  g.set(6, 7, 'd').set(14, 8, 'd').set(10, 4, 'd');
  g.set(13, 12, 'g').set(4, 12, 'g');
  return { g, colors: { k: E.blueD, K: E.blue, c: E.cyan, n: E.navy, b: E.brown, h: E.brownL, ...LEAF, g: E.greyM } };
}

function scholarRock(): DecoArt {
  const g = new Grid(15, 23);
  g.ellipse(7, 6, 5, 5.5, 's').ellipse(6, 13, 5.5, 4.5, 's').ellipse(9, 17, 4.5, 3, 's');
  g.ellipse(4, 5, 2, 3, 'S').ellipse(3, 12, 2, 3, 'S').ellipse(10, 9, 2.5, 2, 'D').ellipse(11, 16, 2, 2, 'D');
  g.ellipse(6, 7, 1.5, 2, 'k').ellipse(8, 13, 1.2, 1.5, 'k').set(5, 16, 'k').set(10, 4, 'k').set(4, 10, 'D');
  g.set(9, 1, 'S').set(10, 2, 'l').set(3, 18, 'l');
  g.rect(2, 20, 11, 3, 'b').rect(2, 20, 11, 1, 'h').set(2, 22, 'B').set(12, 22, 'B');
  return { g, colors: { S: E.grey, s: E.greyM, D: E.slate, k: E.slateD, l: E.greenD, b: E.brown, h: E.brownL, B: E.brownD } };
}

// ---------------------------------------------------------------- palace

function statue(): DecoArt {
  const g = new Grid(14, 29);
  // A marble figure in contrapposto.
  g.ellipse(7, 2, 2, 2, 's').set(6, 1, 'S').set(5, 2, 'S').rect(6, 0, 3, 1, 'D');
  g.rect(4, 5, 6, 1, 's').rect(5, 6, 4, 6, 's').rect(5, 6, 1, 6, 'S').rect(8, 6, 1, 6, 'D');
  g.line(4, 5, 3, 10, 's').line(3, 10, 4, 12, 's').line(9, 5, 11, 7, 's').line(11, 7, 9, 4, 'S');
  g.rect(4, 11, 6, 3, 'c').rect(4, 11, 6, 1, 'C').set(9, 13, 'D');
  g.line(5, 14, 5, 20, 's').line(6, 14, 6, 20, 'S').line(8, 14, 9, 20, 's').line(9, 14, 10, 20, 'D');
  // Pedestal with a brass plaque.
  g.rect(2, 21, 10, 1, 'S').rect(1, 22, 12, 7, 's').rect(1, 22, 1, 7, 'S').rect(12, 22, 1, 7, 'D');
  g.rect(1, 22, 12, 1, 'S').rect(1, 27, 12, 1, 'D').rect(0, 28, 14, 1, 'D');
  g.rect(5, 24, 4, 2, 'Y').set(5, 24, 'y').set(8, 25, 'y');
  return { g, colors: { ...STONE, C: E.white, c: E.cream, Y: E.yellow, y: E.amber } };
}

function column(): DecoArt {
  const g = new Grid(14, 27);
  g.rect(0, 0, 14, 1, 'S').rect(1, 1, 12, 2, 's').rect(1, 2, 12, 1, 'D');
  g.ellipse(1.5, 2, 1.5, 1.5, 's').ellipse(12.5, 2, 1.5, 1.5, 's').set(1, 2, 'd').set(12, 2, 'd');
  g.rect(3, 3, 8, 19, 's');
  for (const x of [4, 6, 8]) g.rect(x, 4, 1, 17, 'D');
  g.rect(3, 3, 1, 19, 'S').rect(10, 3, 1, 19, 'd').rect(5, 4, 1, 17, 'S');
  g.rect(2, 22, 10, 2, 's').rect(2, 22, 10, 1, 'S').rect(1, 24, 12, 3, 'D').rect(1, 24, 12, 1, 's');
  g.set(5, 10, 'd').set(6, 11, 'd').set(8, 16, 'd');
  return { g, colors: STONE };
}

function orangeTree(): DecoArt {
  const g = new Grid(17, 25);
  g.rect(3, 18, 11, 6, 'o').rect(2, 17, 13, 2, 'O').rect(13, 19, 1, 5, 'r').rect(3, 19, 1, 5, 'O').rect(4, 24, 9, 1, 'r');
  g.rect(5, 21, 7, 1, 'r').set(8, 21, 'Y');
  g.rect(7, 11, 3, 6, 'b').rect(7, 11, 1, 6, 'h');
  g.ellipse(8.5, 6.5, 7.5, 6, 'l').ellipse(6, 4, 3.5, 2.5, 'L').ellipse(12, 9, 3.5, 2.5, 'd');
  for (const [x, y] of [[4, 7], [10, 3], [13, 6], [7, 10], [11, 11], [5, 10], [9, 6]]) g.set(x, y, 'a').set(x, y + 1, 'A');
  return { g, colors: { o: E.clay, O: E.tan, r: E.rust, Y: E.amber, b: E.brown, h: E.brownL, ...LEAF, a: E.amber, A: E.orange } };
}

// ---------------------------------------------------------------- reef

function coral(): DecoArt {
  const g = new Grid(16, 22);
  g.rect(7, 12, 3, 8, 'r').rect(7, 12, 1, 8, 'p');
  g.line(8, 13, 3, 6, 'r').line(3, 6, 2, 1, 'r').line(4, 8, 5, 3, 'r');
  g.line(9, 12, 13, 5, 'r').line(13, 5, 14, 1, 'r').line(12, 7, 11, 2, 'r');
  g.line(8, 12, 8, 3, 'r').line(8, 3, 7, 0, 'r');
  for (const [x, y] of [[2, 1], [14, 1], [7, 0], [5, 3], [11, 2], [3, 6], [13, 5]]) g.set(x, y, 'p');
  g.line(9, 10, 10, 6, 'R').line(6, 11, 5, 9, 'R');
  g.ellipse(8, 20, 7, 1.5, 's').rect(2, 21, 12, 1, 'S');
  g.set(4, 19, 'O').set(12, 19, 'y');
  return { g, colors: { r: E.red, p: E.pink, R: E.redD, s: E.tan, S: E.brownL, O: E.orange, y: E.yellow } };
}

function clam(): DecoArt {
  const g = new Grid(17, 14);
  g.ellipse(8, 4, 7.5, 4, 'k').ellipse(8, 3, 6.5, 2.5, 'c');
  for (let x = 2; x <= 14; x += 3) g.line(8, 7, x, 1, 'k');
  g.ellipse(8, 7.5, 3, 1.5, 'n').ellipse(8, 7, 1.5, 1.2, 'W').set(7, 6, 'w');
  g.ellipse(8, 10, 7.5, 3, 'k').ellipse(8, 9.5, 6.5, 2, 'K');
  for (let x = 3; x <= 13; x += 3) g.set(x, 10, 'c');
  g.rect(2, 13, 13, 1, 's');
  return { g, colors: { k: E.blue, K: E.blueD, c: E.cyan, n: E.navy, W: E.white, w: E.grey, s: E.tan }, light: { dx: 0, dy: -7, r: 30, color: E.cyan } };
}

function anchor(): DecoArt {
  const g = new Grid(15, 23);
  g.ellipse(7, 2, 2, 2, 'D').set(7, 2, '.');
  g.rect(6, 4, 3, 15, 'G').rect(6, 4, 1, 15, 'g').rect(3, 6, 9, 2, 'G').rect(3, 6, 9, 1, 'g');
  g.line(1, 15, 6, 19, 'G').line(13, 15, 8, 19, 'G').line(1, 15, 1, 13, 'G').line(13, 15, 13, 13, 'G');
  g.set(0, 13, 'g').set(14, 13, 'g');
  g.set(4, 10, 'l').set(9, 13, 'l').set(5, 16, 'L').set(10, 9, 'L');
  g.set(8, 18, 'O').set(3, 16, 'O');
  g.ellipse(7, 21, 6, 1.5, 's');
  return { g, colors: { G: E.slate, g: E.greyM, D: E.slateD, l: E.green, L: E.greenD, O: E.rust, s: E.tan } };
}

// ---------------------------------------------------------------- neon

function neonSign(): DecoArt {
  const g = new Grid(14, 27);
  g.rect(6, 15, 2, 10, 'D').rect(3, 25, 8, 2, 'n');
  g.rect(1, 0, 12, 15, 'n').rect(1, 0, 12, 1, 'D');
  g.rect(2, 1, 10, 13, 'k');
  // A glowing glyph and a frame of light.
  g.rect(3, 2, 8, 1, 'P').rect(3, 12, 8, 1, 'P').rect(3, 2, 1, 11, 'P').rect(10, 2, 1, 11, 'P');
  g.rect(5, 4, 4, 1, 'c').rect(6, 5, 2, 5, 'c').rect(5, 7, 4, 1, 'c').rect(5, 10, 4, 1, 'w');
  return { g, colors: { D: E.slate, n: E.navy, k: E.ink, P: E.magenta, c: E.cyan, w: E.white }, light: { dx: 0, dy: -20, r: 44, color: E.magenta } };
}

function vending(): DecoArt {
  const g = new Grid(14, 24);
  g.rect(0, 0, 14, 23, 'r').rect(0, 0, 14, 1, 'p').rect(13, 1, 1, 22, 'R');
  g.rect(2, 2, 7, 13, 'k');
  for (let y = 3; y < 14; y += 3) for (let x = 3; x < 9; x += 2) g.set(x, y, ['c', 'y', 'l', 'p'][(x + y) % 4]);
  g.rect(10, 3, 2, 3, 'c').rect(10, 7, 2, 1, 'w').rect(10, 9, 2, 1, 'w');
  g.rect(2, 17, 7, 3, 'n').rect(3, 18, 5, 1, 'D');
  g.rect(1, 23, 12, 1, 'n');
  return { g, colors: { r: E.redD, p: E.red, R: E.brownD, k: E.navy, c: E.cyan, y: E.yellow, l: E.green, w: E.white, n: E.ink, D: E.slate }, light: { dx: 0, dy: -16, r: 36, color: E.cyan } };
}

function hydrant(): DecoArt {
  const g = new Grid(12, 15);
  g.ellipse(6, 2, 3, 2, 'r').rect(3, 3, 6, 10, 'r').rect(3, 3, 1, 10, 'p').rect(8, 3, 1, 10, 'R');
  g.rect(1, 6, 10, 3, 'r').rect(1, 6, 10, 1, 'p').set(0, 7, 'D').set(11, 7, 'D');
  g.rect(2, 12, 8, 2, 'R').rect(5, 1, 2, 1, 'y');
  g.ellipse(6, 14, 5, 1, 'c');
  return { g, colors: { r: E.red, p: E.pink, R: E.redD, D: E.slate, y: E.yellow, c: E.blueD } };
}

/** Standing pieces of each biome; index 0 is its signature piece. */
export function decoArt(biome: string): DecoArt[] {
  switch (biome) {
    case 'forest':
      return forestDecor();
    case 'glacier':
      return [pine(), iceShards(), snowman(), ...extraBiomeDecor(biome)];
    case 'desert':
      return [cactus(), obelisk(), urn(), ...extraBiomeDecor(biome)];
    case 'volcano':
      return [spire(), magmaRock(), deadTree(), ...extraBiomeDecor(biome)];
    case 'factory':
      return [boiler(), gear(), valve(), ...extraBiomeDecor(biome)];
    case 'castle':
      return [armor(), tomb(), candelabra(), ...extraBiomeDecor(biome)];
    case 'garden':
      return [stoneLantern(), bonsai(), scholarRock(), ...extraBiomeDecor(biome)];
    case 'reef':
      return [coral(), clam(), anchor(), ...extraBiomeDecor(biome)];
    case 'neon':
      return [neonSign(), vending(), hydrant(), ...extraBiomeDecor(biome)];
    default:
      return [statue(), column(), orangeTree(), ...extraBiomeDecor(biome)];
  }
}

export const DECO_NAMES: Record<string, string[]> = {
  forest: ['古树', '长苔的断柱', '巨菇簇', '白桦树', '开花灌木', '倒木'],
  glacier: ['雪松', '冰晶簇', '雪人', ...EXTRA_DECO_NAMES.glacier],
  desert: ['仙人掌', '方尖碑', '陶罐', ...EXTRA_DECO_NAMES.desert],
  volcano: ['黑曜石尖塔', '熔岩石', '焦木', ...EXTRA_DECO_NAMES.volcano],
  factory: ['锅炉', '齿轮架', '蒸汽阀', ...EXTRA_DECO_NAMES.factory],
  castle: ['盔甲', '墓碑', '烛台', ...EXTRA_DECO_NAMES.castle],
  garden: ['石灯笼', '盆景', '太湖石', ...EXTRA_DECO_NAMES.garden],
  palace: ['大理石像', '石柱', '橘树盆栽', ...EXTRA_DECO_NAMES.palace],
  reef: ['珊瑚', '巨蚌', '沉船铁锚', ...EXTRA_DECO_NAMES.reef],
  neon: ['霓虹招牌', '自动售货机', '消防栓', ...EXTRA_DECO_NAMES.neon],
};


// ---------------------------------------------------------------- painted onto the level

export type Paint = (x: number, y: number, col: string, w?: number, h?: number) => void;

/**
 * Decorate one wall face (16 x 16 at x, y). `k` picks between the biome's pieces, so a wall gets a mix.
 * Returns false when this biome draws nothing on this face.
 */
export function paintWall(P: Paint, biome: string, x: number, y: number, k: number, rng: Rng, face: string): boolean {
  switch (biome) {
    case 'forest': {
      paintForestWall(P, x, y, k, rng);
      return true;
    }
    case 'glacier': {
      // Icicles under the top edge, frost on the bricks.
      for (let ix = 1; ix < 15; ix += 3) {
        const len = rng.int(2, 6);
        for (let j = 0; j < len; j++) P(x + ix, y + j, j < len - 1 ? E.white : E.cyan, j < len - 2 ? 2 : 1, 1);
      }
      P(x + 3, y + 10, E.white, 3, 1);
      P(x + 10, y + 12, E.grey, 2, 1);
      return true;
    }
    case 'desert': {
      // A recessed panel of glyphs.
      P(x + 2, y + 2, mix(face, E.ink, 0.25), 12, 12);
      P(x + 2, y + 2, mix(face, E.white, 0.2), 12, 1);
      const ink = E.brownD;
      if (k % 2 === 0) {
        // An eye.
        P(x + 5, y + 5, ink, 6, 1);
        P(x + 4, y + 6, ink, 1, 1);
        P(x + 11, y + 6, ink, 1, 1);
        P(x + 5, y + 7, ink, 6, 1);
        P(x + 7, y + 6, E.cyan, 2, 1);
        P(x + 6, y + 8, ink, 1, 3);
        P(x + 9, y + 9, ink, 3, 1);
      } else {
        // An ankh.
        P(x + 7, y + 4, ink, 2, 1);
        P(x + 6, y + 5, ink, 1, 2);
        P(x + 9, y + 5, ink, 1, 2);
        P(x + 7, y + 7, ink, 2, 1);
        P(x + 5, y + 8, ink, 6, 1);
        P(x + 7, y + 9, ink, 2, 4);
      }
      return true;
    }
    case 'volcano': {
      // A glowing seam running down the rock.
      let vx = x + rng.int(4, 11);
      for (let j = 1; j < 15; j++) {
        P(vx, y + j, j % 4 === 0 ? E.yellow : E.orange);
        if (j % 3 === 0) vx += rng.int(-1, 1);
      }
      P(vx - 1, y + 14, E.amber, 3, 1);
      return true;
    }
    case 'factory': {
      // A pipe along the wall with a gauge or a valve.
      P(x, y + 3, E.greyM, 16, 3);
      P(x, y + 3, E.grey, 16, 1);
      P(x, y + 5, E.slate, 16, 1);
      if (k % 2 === 0) {
        P(x + 5, y + 7, E.slateD, 6, 6);
        P(x + 6, y + 8, E.grey, 4, 4);
        P(x + 7, y + 9, E.red, 1, 2);
        P(x + 8, y + 9, E.ink, 1, 1);
      } else {
        P(x + 6, y + 2, E.slate, 4, 5);
        P(x + 5, y + 8, E.yellow, 6, 2);
        for (let i = 0; i < 6; i += 2) P(x + 5 + i, y + 8, E.ink, 1, 2);
      }
      return true;
    }
    case 'castle': {
      if (k % 2 === 0) {
        // Chains with shackles.
        for (const cx of [4, 11]) {
          const len = rng.int(7, 11);
          for (let j = 0; j < len; j++) P(x + cx + (j % 2), y + j, j % 2 ? E.greyM : E.slate);
          P(x + cx - 1, y + len, E.greyM, 4, 1);
          P(x + cx - 1, y + len + 1, E.slate, 1, 2);
          P(x + cx + 2, y + len + 1, E.slate, 1, 2);
        }
      } else {
        // A portrait whose eyes follow you.
        P(x + 2, y + 1, E.amber, 12, 13);
        P(x + 2, y + 1, E.yellow, 12, 1);
        P(x + 3, y + 2, E.brownD, 10, 11);
        P(x + 6, y + 4, E.skinD, 4, 5);
        P(x + 5, y + 9, E.purple, 6, 4);
        P(x + 6, y + 6, E.cyan, 1, 1);
        P(x + 9, y + 6, E.cyan, 1, 1);
        P(x + 6, y + 3, E.ink, 4, 1);
      }
      return true;
    }
    case 'garden': {
      if (k % 2 === 0) {
        // A hanging scroll.
        P(x + 4, y + 1, E.brownD, 8, 1);
        P(x + 5, y + 2, E.cream, 6, 11);
        P(x + 7, y + 3, E.ink, 2, 1);
        P(x + 8, y + 4, E.ink, 1, 3);
        P(x + 6, y + 7, E.ink, 3, 1);
        P(x + 7, y + 9, E.ink, 1, 2);
        P(x + 9, y + 10, E.red, 1, 1);
        P(x + 4, y + 13, E.brownD, 8, 1);
      } else {
        // A round lattice window.
        P(x + 4, y + 2, E.brownD, 8, 12);
        P(x + 2, y + 4, E.brownD, 12, 8);
        P(x + 5, y + 3, E.tan, 6, 10);
        P(x + 3, y + 5, E.tan, 10, 6);
        P(x + 3, y + 7, E.brownD, 10, 1);
        P(x + 7, y + 3, E.brownD, 1, 10);
        P(x + 5, y + 5, E.brownD, 1, 1);
        P(x + 10, y + 10, E.brownD, 1, 1);
      }
      return true;
    }
    case 'reef': {
      if (k % 2 === 0) {
        // Kelp swaying up from the floor.
        for (const sx of [3, 8, 12]) {
          const len = rng.int(6, 13);
          for (let j = 0; j < len; j++) P(x + sx + (j % 4 < 2 ? 0 : 1), y + 15 - j, j % 3 ? E.greenD : E.green);
        }
      } else {
        // A brass porthole onto dark water.
        P(x + 4, y + 2, E.amber, 8, 11);
        P(x + 3, y + 4, E.amber, 10, 7);
        P(x + 5, y + 3, E.blueD, 6, 9);
        P(x + 4, y + 5, E.blueD, 8, 5);
        P(x + 5, y + 4, E.cyan, 2, 1);
        P(x + 3, y + 7, E.brown, 1, 1);
        P(x + 12, y + 7, E.brown, 1, 1);
      }
      return true;
    }
    case 'neon': {
      if (k % 2 === 0) {
        // A neon tube sign.
        const col = rng.pick([E.magenta, E.cyan, E.hot, E.yellow]);
        P(x + 2, y + 3, E.ink, 12, 9);
        P(x + 3, y + 4, col, 10, 1);
        P(x + 3, y + 10, col, 10, 1);
        P(x + 3, y + 4, col, 1, 7);
        P(x + 12, y + 4, col, 1, 7);
        P(x + 6, y + 6, E.white, 4, 1);
        P(x + 7, y + 7, E.white, 2, 2);
      } else {
        // Cables slung along the wall.
        for (let i = 0; i < 16; i++) P(x + i, y + 4 + Math.round(Math.sin((i / 15) * Math.PI) * 3), E.ink);
        for (let i = 0; i < 16; i++) P(x + i, y + 8 + Math.round(Math.sin((i / 15) * Math.PI) * 2), E.slateD);
        P(x + 7, y + 7, E.hot, 1, 1);
      }
      return true;
    }
    default: {
      // Palace: gilt-framed paintings.
      P(x + 1, y + 1, E.amber, 14, 12);
      P(x + 1, y + 1, E.yellow, 14, 1);
      P(x + 1, y + 12, E.orange, 14, 1);
      const scene = k % 3;
      if (scene === 0) {
        // A landscape.
        P(x + 3, y + 3, E.blue, 10, 5);
        P(x + 3, y + 3, E.cyan, 10, 1);
        P(x + 3, y + 8, E.green, 10, 3);
        P(x + 5, y + 7, E.greenD, 4, 2);
        P(x + 10, y + 4, E.yellow, 2, 2);
      } else if (scene === 1) {
        // A portrait.
        P(x + 3, y + 3, E.brownD, 10, 8);
        P(x + 7, y + 4, E.skin, 3, 3);
        P(x + 6, y + 7, E.redD, 5, 4);
        P(x + 7, y + 3, E.brown, 3, 1);
      } else {
        // The sea and a ship.
        P(x + 3, y + 3, E.cream, 10, 4);
        P(x + 3, y + 7, E.blueD, 10, 4);
        P(x + 3, y + 7, E.blue, 10, 1);
        P(x + 7, y + 4, E.white, 2, 3);
        P(x + 6, y + 7, E.brown, 4, 1);
      }
      return true;
    }
  }
}

/** Clutter on one floor tile at (x, y); most tiles get nothing. */
export function paintFloor(P: Paint, biome: string, x: number, y: number, rng: Rng) {
  const r = rng.next();
  if (r > 0.14) return;
  const ox = x + rng.int(2, 10);
  const oy = y + rng.int(3, 11);
  switch (biome) {
    case 'forest':
      if (r < 0.03) {
        // A toadstool.
        P(ox, oy, E.red, 3, 1);
        P(ox + 1, oy, E.white, 1, 1);
        P(ox + 1, oy + 1, E.cream, 1, 2);
      } else if (r < 0.06) {
        // Fallen leaves.
        P(ox, oy, E.amber, 2, 1);
        P(ox + 4, oy + 2, E.orange, 2, 1);
        P(ox + 1, oy + 3, E.clay, 1, 1);
      } else {
        // A fern.
        P(ox + 2, oy, E.green, 1, 4);
        P(ox, oy + 1, E.greenD, 2, 1);
        P(ox + 3, oy + 1, E.greenD, 2, 1);
        P(ox + 1, oy + 3, E.green, 1, 1);
        P(ox + 3, oy + 3, E.green, 1, 1);
      }
      break;
    case 'glacier':
      if (r < 0.05) {
        P(ox, oy + 1, E.white, 6, 2);
        P(ox + 1, oy, E.white, 4, 1);
        P(ox + 1, oy + 3, E.grey, 5, 1);
      } else {
        P(ox, oy, E.white, 1, 1);
        P(ox + 1, oy + 1, E.white, 2, 1);
        P(ox + 3, oy + 2, E.cyan, 2, 1);
      }
      break;
    case 'desert':
      if (r < 0.03) {
        // A bone.
        P(ox, oy, E.cream, 1, 2);
        P(ox + 1, oy + 1, E.cream, 4, 1);
        P(ox + 5, oy, E.cream, 1, 2);
      } else if (r < 0.05) {
        // A small skull.
        P(ox, oy, E.cream, 4, 3);
        P(ox + 1, oy + 3, E.cream, 2, 1);
        P(ox + 1, oy + 1, E.brownD, 1, 1);
        P(ox + 3, oy + 1, E.brownD, 1, 1);
      } else {
        P(ox, oy, E.brownL, 2, 1);
        P(ox + 3, oy + 2, E.brown, 1, 1);
        P(ox + 5, oy + 1, E.brownL, 1, 1);
      }
      break;
    case 'volcano':
      if (r < 0.05) {
        P(ox, oy, E.orange, 1, 1);
        P(ox + 3, oy + 2, E.amber, 1, 1);
        P(ox + 6, oy, E.yellow, 1, 1);
      } else {
        P(ox, oy, E.slateD, 4, 2);
        P(ox + 1, oy, E.slate, 2, 1);
      }
      break;
    case 'factory':
      if (r < 0.04) {
        // An oil stain.
        P(ox, oy, E.navy, 6, 3);
        P(ox + 1, oy - 1, E.navy, 3, 1);
        P(ox + 2, oy + 3, E.navy, 3, 1);
        P(ox + 1, oy, E.slateD, 1, 1);
      } else {
        // A loose bolt.
        P(ox, oy, E.grey, 2, 2);
        P(ox + 1, oy + 1, E.slate, 1, 1);
      }
      break;
    case 'castle':
      if (r < 0.03) {
        P(ox, oy, E.grey, 1, 2);
        P(ox + 1, oy + 1, E.grey, 4, 1);
        P(ox + 5, oy, E.grey, 1, 2);
      } else if (r < 0.06) {
        // A candle stub.
        P(ox, oy, E.cream, 2, 3);
        P(ox, oy - 1, E.amber, 1, 1);
        P(ox - 1, oy + 3, E.cream, 4, 1);
      } else {
        // A crack.
        P(ox, oy, E.ink, 3, 1);
        P(ox + 3, oy + 1, E.ink, 2, 1);
        P(ox + 5, oy + 2, E.ink, 1, 1);
      }
      break;
    case 'garden':
      if (r < 0.05) {
        P(ox, oy, E.pink, 1, 1);
        P(ox + 3, oy + 2, E.pink, 1, 1);
        P(ox + 5, oy, E.white, 1, 1);
        P(ox + 1, oy + 3, E.pink, 1, 1);
      } else {
        // A stepping stone.
        P(ox, oy, E.greyM, 6, 3);
        P(ox + 1, oy - 1, E.greyM, 4, 1);
        P(ox + 1, oy, E.grey, 3, 1);
      }
      break;
    case 'reef':
      if (r < 0.03) {
        // A starfish.
        P(ox + 2, oy, E.orange, 1, 2);
        P(ox, oy + 2, E.orange, 5, 1);
        P(ox + 1, oy + 3, E.orange, 1, 1);
        P(ox + 3, oy + 3, E.orange, 1, 1);
      } else if (r < 0.06) {
        // A shell.
        P(ox, oy, E.cream, 3, 2);
        P(ox + 1, oy - 1, E.cream, 1, 1);
        P(ox + 1, oy, E.tan, 1, 2);
      } else {
        P(ox, oy, E.cyan, 1, 1);
        P(ox + 3, oy - 2, E.white, 1, 1);
      }
      break;
    case 'neon':
      if (r < 0.05) {
        // A puddle holding a sign's reflection.
        P(ox, oy, E.navy, 7, 3);
        P(ox + 1, oy - 1, E.navy, 5, 1);
        P(ox + 2, oy + 1, rng.pick([E.magenta, E.cyan]), 3, 1);
      } else {
        P(ox, oy, E.slate, 2, 1);
        P(ox + 4, oy + 1, E.hot, 1, 1);
      }
      break;
    default:
      // Palace: the odd fallen petal from the orange trees.
      if (r < 0.03) {
        P(ox, oy, E.white, 1, 1);
        P(ox + 2, oy + 1, E.amber, 1, 1);
      }
  }
}
