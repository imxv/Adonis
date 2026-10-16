import { Grid } from './draw';
import { E } from './palette';

/*
 * A guardian for every art style, each drawn to its style's subtitle: the vine king of the forest ruins,
 * the frost-bone giant, the jackal at the empty tomb, the sword saint of the garden...
 */

type Art = [Grid, Record<string, string>];

const C = { w: E.white, g: E.grey, G: E.greyM, D: E.slate, d: E.slateD, n: E.navy, k: E.ink, y: E.amber, Y: E.yellow, O: E.orange, r: E.red, R: E.redD, p: E.pink, P: E.magenta, v: E.purple, b: E.brownL, B: E.brown, x: E.brownD, t: E.tan, T: E.cream, c: E.cyan, K: E.blue, Q: E.blueD, l: E.green, L: E.greenD, M: E.greenDD, s: E.skin };

/** Forest: an old king grown into a tree, moss for a beard, a wooden crown. */
function vineKing(): Art {
  const g = new Grid(32, 34);
  g.rect(9, 10, 14, 20, 'B').rect(9, 10, 3, 20, 'b').rect(20, 10, 3, 20, 'x');
  g.ellipse(16, 9, 9, 7, 'L').ellipse(12, 6, 4, 3, 'l').ellipse(21, 7, 4, 3, 'M');
  g.rect(11, 1, 10, 3, 'y').set(11, 0, 'Y').set(14, 0, 'Y').set(17, 0, 'Y').set(20, 0, 'Y').set(15, 2, 'r');
  g.rect(12, 10, 3, 2, 'Y').rect(18, 10, 3, 2, 'Y');
  g.ellipse(16, 16, 5, 4, 'l').ellipse(16, 18, 3, 3, 'M');
  g.line(9, 13, 2, 20, 'B').line(2, 20, 1, 26, 'l').line(23, 13, 30, 20, 'B').line(30, 20, 31, 26, 'l');
  g.line(4, 17, 6, 22, 'l').line(28, 17, 26, 22, 'l');
  g.rect(8, 30, 6, 4, 'x').rect(18, 30, 6, 4, 'x').set(7, 33, 'B').set(25, 33, 'B');
  g.set(12, 24, 'l').set(20, 22, 'l').set(14, 27, 'M');
  return [g, C];
}

/** Glacier: a giant of old bones, packed in ice, eyes burning blue. */
function frostBone(): Art {
  const g = new Grid(32, 34);
  g.ellipse(16, 7, 6, 6, 'w').rect(12, 10, 8, 3, 'w').ellipse(13, 7, 1.5, 1.5, 'K').ellipse(19, 7, 1.5, 1.5, 'K').set(13, 7, 'c').set(19, 7, 'c');
  g.rect(13, 12, 1, 1, 'k').rect(15, 12, 1, 1, 'k').rect(17, 12, 1, 1, 'k');
  g.rect(15, 14, 2, 14, 'g');
  for (let y = 15; y < 25; y += 3) g.line(10, y, 22, y, 'w').set(10, y + 1, 'g').set(22, y + 1, 'g');
  g.tri(4, 12, 9, 12, 6, 2, 'c').tri(23, 12, 28, 12, 26, 2, 'c').line(6, 3, 6, 11, 'w').line(26, 3, 26, 11, 'w');
  g.line(9, 14, 3, 26, 'w').line(23, 14, 29, 26, 'w').rect(1, 26, 4, 3, 'c').rect(27, 26, 4, 3, 'c');
  g.rect(11, 27, 10, 2, 'g').line(12, 29, 10, 33, 'w').line(20, 29, 22, 33, 'w');
  return [g, C];
}

/** Desert: the jackal-headed keeper of the empty tomb, gold collar and striped headdress. */
function jackal(): Art {
  const g = new Grid(30, 34);
  g.tri(9, 0, 7, 9, 12, 8, 'k').tri(21, 0, 18, 8, 23, 9, 'k').set(9, 3, 'y').set(21, 3, 'y');
  g.ellipse(15, 9, 7, 5, 'k').tri(11, 10, 19, 10, 15, 17, 'k').set(12, 8, 'Y').set(18, 8, 'Y');
  g.rect(7, 9, 2, 8, 'y').rect(21, 9, 2, 8, 'y').rect(7, 11, 2, 1, 'K').rect(21, 11, 2, 1, 'K').rect(7, 14, 2, 1, 'K').rect(21, 14, 2, 1, 'K');
  g.ellipse(15, 18, 8, 2.5, 'y').rect(8, 18, 14, 1, 'K').set(15, 19, 'c');
  g.rect(10, 20, 10, 9, 'n').rect(10, 20, 2, 9, 'd').rect(12, 22, 6, 1, 'y');
  g.rect(9, 29, 12, 2, 'T').rect(10, 31, 3, 3, 'k').rect(17, 31, 3, 3, 'k');
  g.line(25, 4, 25, 33, 'y').ellipse(25, 4, 2, 2, 'Y').set(25, 4, 'c');
  g.line(9, 21, 4, 27, 'k').line(21, 21, 25, 20, 'k');
  return [g, C];
}

/** Magma depths: a golem of black rock with the fire showing through its cracks. */
function magmaCore(): Art {
  const g = new Grid(32, 32);
  g.ellipse(16, 18, 10, 9, 'n').rect(11, 3, 10, 9, 'n').rect(11, 3, 3, 9, 'd');
  g.ellipse(5, 13, 4, 4, 'k').ellipse(27, 13, 4, 4, 'k').rect(2, 15, 5, 10, 'k').rect(25, 15, 5, 10, 'k');
  g.ellipse(4, 26, 3, 3, 'n').ellipse(28, 26, 3, 3, 'n').rect(10, 25, 5, 7, 'k').rect(17, 25, 5, 7, 'k');
  g.rect(13, 7, 2, 2, 'Y').rect(17, 7, 2, 2, 'Y');
  g.ellipse(16, 18, 3, 3, 'O').ellipse(16, 18, 1.5, 1.5, 'Y');
  g.line(13, 13, 10, 17, 'O').line(20, 21, 23, 24, 'O').line(8, 19, 10, 22, 'r').line(3, 16, 4, 21, 'O').line(28, 17, 27, 21, 'O');
  return [g, C];
}

/** Steam works: a riveted boiler colossus, a stack on its back and a gauge for an eye. */
function steamColossus(): Art {
  const g = new Grid(32, 34);
  g.rect(20, 0, 4, 8, 'D').rect(19, 0, 6, 1, 'G');
  g.rect(8, 6, 16, 18, 'b').rect(8, 6, 3, 18, 't').rect(21, 6, 3, 18, 'B');
  for (const y of [8, 22]) for (let x = 9; x < 24; x += 3) g.set(x, y, 'y');
  g.ellipse(16, 13, 4, 4, 'k').ellipse(16, 13, 3, 3, 'g').line(16, 13, 18, 11, 'r').set(16, 13, 'k');
  g.rect(11, 18, 10, 2, 'k').rect(12, 18, 1, 2, 'O').rect(15, 18, 1, 2, 'O').rect(18, 18, 1, 2, 'O');
  g.rect(2, 9, 6, 4, 'G').rect(24, 9, 6, 4, 'G').rect(1, 13, 4, 10, 'D').rect(27, 13, 4, 10, 'D');
  g.ellipse(3, 24, 3, 3, 'G').ellipse(29, 24, 3, 3, 'G').set(3, 24, 'k').set(29, 24, 'k');
  g.rect(10, 24, 4, 9, 'D').rect(18, 24, 4, 9, 'D').rect(9, 32, 6, 2, 'k').rect(17, 32, 6, 2, 'k');
  return [g, C];
}

/** Haunted keep: the count who lives in the portrait, cape spread, eyes red. */
function portraitCount(): Art {
  const g = new Grid(32, 34);
  g.rect(3, 0, 26, 26, 'y').rect(3, 0, 26, 1, 'Y').rect(5, 2, 22, 22, 'x');
  g.ellipse(16, 9, 4.5, 5.5, 'T').rect(11, 3, 10, 3, 'k').set(14, 9, 'r').set(18, 9, 'r').rect(15, 12, 2, 1, 'R');
  g.tri(16, 15, 6, 33, 26, 33, 'R').tri(16, 15, 6, 33, 16, 33, 'r');
  g.tri(5, 14, 11, 16, 6, 30, 'v').tri(27, 14, 21, 16, 26, 30, 'v');
  g.rect(13, 15, 6, 2, 'w').set(16, 17, 'r');
  g.rect(12, 18, 8, 12, 'k').rect(15, 18, 2, 10, 'n');
  return [g, C];
}

/** Garden: the sword saint under a wide straw hat, robe flowing, blade drawn. */
function swordSaint(): Art {
  const g = new Grid(32, 34);
  g.tri(16, 0, 3, 8, 29, 8, 't').rect(4, 7, 24, 2, 'b').line(16, 0, 5, 7, 'T');
  g.ellipse(16, 11, 4, 3.5, 's').rect(13, 10, 6, 1, 'k').set(14, 11, 'k').set(18, 11, 'k');
  g.tri(16, 13, 6, 31, 26, 31, 'w').tri(16, 13, 6, 31, 13, 31, 'g').rect(11, 16, 10, 2, 'r').set(16, 17, 'y');
  g.tri(9, 20, 3, 32, 9, 31, 'R').tri(23, 20, 29, 32, 23, 31, 'R');
  g.rect(12, 31, 3, 3, 'k').rect(17, 31, 3, 3, 'k');
  g.line(22, 18, 31, 4, 'g').line(23, 18, 31, 5, 'w').rect(21, 17, 3, 3, 'y').set(31, 3, 'w');
  for (const [x, y] of [[4, 14], [27, 25], [6, 24], [2, 20]]) g.set(x, y, 'p');
  return [g, C];
}

/** Palace: the marble angel out of the mural, wings open, sword raised, a halo of gold. */
function marbleAngel(): Art {
  const g = new Grid(34, 34);
  g.ellipse(17, 3, 5, 1.5, 'Y').ellipse(17, 3, 3, 0.6, '.');
  g.ellipse(17, 8, 3.5, 3.5, 'w').set(16, 8, 'G').set(18, 8, 'G');
  g.tri(14, 11, 2, 4, 6, 24, 'w').tri(20, 11, 32, 4, 28, 24, 'w').line(14, 11, 4, 8, 'g').line(20, 11, 30, 8, 'g');
  for (let i = 0; i < 4; i++) g.line(5 + i * 2, 10 + i * 3, 12, 14 + i * 2, 'g').line(29 - i * 2, 10 + i * 3, 22, 14 + i * 2, 'g');
  g.tri(17, 11, 11, 32, 23, 32, 'g').tri(17, 11, 11, 32, 17, 32, 'w').rect(13, 18, 8, 1, 'y');
  g.line(24, 14, 29, 0, 'w').line(25, 14, 30, 1, 'g').rect(22, 13, 4, 2, 'y');
  g.rect(12, 32, 10, 2, 'G');
  return [g, C];
}

/** Sunken ruins: a sea witch of tentacles with the drowned ship's bronze bell on her head. */
function bellKraken(): Art {
  const g = new Grid(32, 34);
  g.tri(16, 0, 9, 10, 23, 10, 'y').rect(8, 9, 16, 2, 'y').set(16, 0, 'Y').line(16, 1, 11, 9, 'Y').ellipse(16, 11, 1.5, 1, 'B');
  g.ellipse(16, 17, 9, 7, 'P').ellipse(13, 15, 3, 2, 'p').set(12, 17, 'Y').set(20, 17, 'Y').set(12, 18, 'k').set(20, 18, 'k');
  for (let i = 0; i < 6; i++) {
    const x = 6 + i * 4;
    g.line(x, 22, x + (i % 2 ? 2 : -2), 28, 'P').line(x + (i % 2 ? 2 : -2), 28, x, 33, 'P');
    g.set(x, 30, 'p');
  }
  g.line(7, 18, 1, 12, 'P').line(25, 18, 31, 12, 'P').set(1, 11, 'p').set(31, 11, 'p');
  return [g, C];
}

/** Neon city: a battle mecha in dark plating, edged in neon, a visor for a face. */
function neonMecha(): Art {
  const g = new Grid(32, 34);
  g.rect(11, 2, 10, 8, 'd').rect(12, 5, 8, 2, 'c').rect(11, 2, 10, 1, 'D');
  g.rect(7, 10, 18, 13, 'n').rect(7, 10, 18, 1, 'P').rect(7, 22, 18, 1, 'P').rect(7, 10, 1, 13, 'P').rect(24, 10, 1, 13, 'P');
  g.ellipse(16, 16, 3, 3, 'c').ellipse(16, 16, 1.5, 1.5, 'w');
  g.rect(1, 10, 6, 5, 'd').rect(25, 10, 6, 5, 'd').rect(2, 15, 4, 9, 'n').rect(26, 15, 4, 9, 'n');
  g.rect(1, 24, 6, 3, 'c').rect(25, 24, 6, 3, 'P');
  g.rect(9, 23, 5, 9, 'd').rect(18, 23, 5, 9, 'd').rect(8, 32, 7, 2, 'P').rect(17, 32, 7, 2, 'c');
  return [g, C];
}

export function guardianArt(biome: string): Art {
  switch (biome) {
    case 'forest':
      return vineKing();
    case 'glacier':
      return frostBone();
    case 'desert':
      return jackal();
    case 'volcano':
      return magmaCore();
    case 'factory':
      return steamColossus();
    case 'castle':
      return portraitCount();
    case 'garden':
      return swordSaint();
    case 'reef':
      return bellKraken();
    case 'neon':
      return neonMecha();
    default:
      return marbleAngel();
  }
}
