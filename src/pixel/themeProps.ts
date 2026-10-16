import { Grid } from './draw';
import { E } from './palette';

/*
 * The breakable prop and the explosive one, dressed for each art style: a stump and a spore pod in the forest,
 * an ice block and an ice mine on the glacier, a porcelain vase and a gilded keg in the palace...
 */

export interface ThemeProps {
  crate: [Grid, Record<string, string>];
  keg: [Grid, Record<string, string>];
  names: [string, string];
  /** What the explosive goes off as. */
  boom: 'fire' | 'ice' | 'shock' | 'water' | 'grass';
}

const C = { w: E.white, g: E.grey, G: E.greyM, D: E.slate, d: E.slateD, n: E.navy, k: E.ink, y: E.amber, Y: E.yellow, O: E.orange, r: E.red, R: E.redD, p: E.pink, b: E.brownL, B: E.brown, x: E.brownD, t: E.tan, T: E.cream, c: E.cyan, K: E.blue, Q: E.blueD, l: E.green, L: E.greenD, M: E.greenDD, P: E.magenta, v: E.purple };

function stump(): Grid {
  const g = new Grid(17, 15);
  g.ellipse(8, 8, 5.5, 5, 'B').rect(3, 5, 10, 7, 'B').rect(3, 6, 2, 6, 'b').rect(11, 6, 2, 7, 'x');
  g.tri(4, 9, 0, 14, 7, 14, 'B').tri(11, 9, 16, 14, 9, 14, 'x');
  g.line(4, 11, 2, 14, 'b').line(8, 11, 7, 14, 'x').line(12, 12, 14, 14, 'B');
  // An uneven rim, a broken bark prong and a hollow knot replace the boxy edge.
  g.ellipse(8, 4, 5.5, 2.5, 'b').ellipse(8, 4, 4.5, 1.5, 't');
  g.ellipse(8, 4, 3, 1, 'b').ellipse(8, 4, 1.5, 0.5, 'T').set(8, 4, 'B');
  g.rect(3, 1, 2, 4, 'B').set(3, 0, 'b').set(4, 2, 't').set(12, 3, 'x');
  g.line(8, 5, 10, 6, 'B').line(5, 7, 6, 10, 'x').rect(9, 8, 2, 3, 'x').set(9, 8, 'b');
  g.rect(3, 11, 4, 2, 'M').rect(4, 10, 2, 1, 'L').set(4, 11, 'l');
  g.set(11, 13, 'L').set(12, 13, 'M').rect(13, 10, 3, 1, 't').rect(14, 9, 2, 1, 'T');
  return g;
}

function sporePod(): Grid {
  const g = new Grid(16, 17);
  g.rect(7, 9, 3, 7, 't').rect(9, 10, 1, 6, 'b').rect(7, 11, 1, 3, 'T');
  g.ellipse(8, 6, 6.5, 5, 'M').ellipse(7, 4.5, 5.5, 3.5, 'L').ellipse(6, 3, 2.5, 1.5, 'l');
  g.rect(3, 9, 10, 2, 'M').rect(4, 10, 8, 1, 't');
  for (const x of [4, 6, 10, 12]) g.line(x, 9, 8, 11, 'b');
  // Bright pustules and a split crown signal an explosive mushroom.
  g.rect(7, 0, 3, 1, 'M').set(8, 1, 'Y').set(8, 2, 'M');
  for (const [x, y] of [[4, 4], [10, 3], [7, 7], [12, 6]]) g.rect(x, y, 2, 1, 'Y').set(x, y + 1, 'l');
  g.set(4, 3, 'T').set(10, 2, 'T');
  g.rect(2, 14, 2, 2, 't').ellipse(3, 13, 2.5, 2, 'L').set(3, 12, 'Y');
  g.rect(12, 15, 2, 2, 'b').ellipse(13, 14, 2, 1.5, 'M').set(12, 13, 'l');
  g.rect(4, 16, 8, 1, 'M').set(5, 15, 'L').set(10, 15, 'L');
  return g;
}

function iceBlock(): Grid {
  const g = new Grid(14, 14);
  g.rect(0, 2, 14, 12, 'c').rect(0, 0, 14, 3, 'w').rect(13, 2, 1, 12, 'K').rect(0, 13, 14, 1, 'K');
  g.rect(1, 3, 2, 9, 'w').line(4, 5, 9, 11, 'K').line(9, 5, 7, 8, 'K').set(10, 4, 'w');
  return g;
}

function iceMine(): Grid {
  const g = new Grid(14, 14);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.line(7, 7, 7 + Math.round(Math.cos(a) * 6), 7 + Math.round(Math.sin(a) * 6), 'w');
  }
  g.ellipse(7, 7, 3.5, 3.5, 'c').ellipse(6, 6, 1.5, 1.5, 'w').set(7, 7, 'K').set(8, 8, 'K');
  return g;
}

function pot(): Grid {
  const g = new Grid(12, 13);
  g.rect(4, 0, 4, 2, 'x').rect(3, 2, 6, 1, 'b');
  g.ellipse(6, 7.5, 5.5, 5, 'O').ellipse(4, 6, 1.5, 2.5, 't').ellipse(8, 9.5, 2.5, 2, 'B');
  for (let x = 1; x <= 10; x++) g.set(x, 7, x % 2 ? 'x' : 'T');
  g.rect(4, 12, 4, 1, 'B');
  return g;
}

function oilJar(): Grid {
  const g = new Grid(12, 15);
  g.set(6, 0, 'Y').set(5, 1, 'O').set(6, 1, 'w').rect(5, 2, 2, 2, 'T');
  g.rect(4, 4, 4, 2, 'x').ellipse(6, 10, 5.5, 4.5, 'n').ellipse(4, 9, 1.5, 2, 'd');
  g.rect(3, 9, 6, 2, 'y').set(5, 9, 'r').set(6, 10, 'r');
  return g;
}

function obsidian(): Grid {
  const g = new Grid(14, 12);
  g.tri(2, 11, 6, 1, 10, 11, 'k').tri(6, 11, 10, 3, 13, 11, 'n').tri(0, 11, 3, 5, 6, 11, 'n');
  g.line(6, 1, 4, 8, 'v').line(10, 3, 9, 8, 'v').set(5, 3, 'P');
  return g;
}

function magmaBubble(): Grid {
  const g = new Grid(13, 13);
  g.ellipse(6, 6.5, 6, 5.5, 'R').ellipse(6, 6.5, 4.5, 4, 'O').ellipse(5, 5, 2, 1.5, 'Y').set(4, 4, 'w');
  g.line(2, 8, 5, 10, 'x').line(8, 3, 10, 6, 'x').rect(2, 12, 9, 1, 'x');
  return g;
}

function metalCrate(): Grid {
  const g = new Grid(14, 14);
  g.rect(0, 0, 14, 14, 'G').rect(0, 0, 14, 1, 'g').rect(0, 0, 1, 14, 'g').rect(13, 1, 1, 13, 'D').rect(1, 13, 13, 1, 'D');
  g.rect(2, 5, 10, 3, 'y');
  for (let x = 2; x < 12; x += 3) g.rect(x, 5, 1, 3, 'k');
  for (const [x, y] of [[1, 1], [12, 1], [1, 12], [12, 12]]) g.set(x, y, 'd');
  g.rect(3, 9, 8, 1, 'D').rect(3, 2, 8, 1, 'D');
  return g;
}

function oilDrum(): Grid {
  const g = new Grid(12, 15);
  g.rect(1, 1, 10, 14, 'r').rect(1, 1, 2, 14, 'p').rect(9, 1, 2, 14, 'R');
  g.ellipse(6, 1, 5, 1, 'R').set(4, 1, 'k');
  for (const y of [4, 11]) g.rect(1, y, 10, 1, 'R');
  g.rect(1, 6, 10, 3, 'Y').set(3, 6, 'k').set(5, 7, 'k').set(7, 6, 'k').set(9, 7, 'k');
  return g;
}

function coffin(): Grid {
  const g = new Grid(12, 16);
  g.tri(2, 0, 9, 0, 11, 5, 'B').tri(2, 0, 0, 5, 11, 5, 'B').tri(0, 5, 11, 5, 3, 15, 'B').tri(11, 5, 8, 15, 3, 15, 'B');
  g.line(2, 1, 1, 5, 'b').line(1, 5, 4, 14, 'b');
  g.rect(5, 3, 2, 8, 'y').rect(3, 5, 6, 2, 'y').set(5, 3, 'Y');
  return g;
}

function soulLamp(): Grid {
  const g = new Grid(11, 15);
  g.rect(4, 0, 3, 2, 'd').rect(2, 2, 7, 1, 'd');
  g.rect(2, 3, 7, 9, 'n').rect(3, 4, 5, 7, 'Q');
  g.ellipse(5.5, 8, 2, 3, 'c').ellipse(5.5, 9, 1, 1.5, 'w');
  g.rect(1, 12, 9, 2, 'd').rect(2, 14, 7, 1, 'k');
  return g;
}

function basket(): Grid {
  const g = new Grid(14, 12);
  g.rect(1, 2, 12, 10, 't').rect(0, 1, 14, 2, 'b');
  for (let y = 3; y < 12; y += 2) for (let x = 1 + (y % 4 === 1 ? 1 : 0); x < 13; x += 2) g.set(x, y, 'b');
  g.rect(12, 3, 1, 9, 'B').rect(1, 11, 12, 1, 'B');
  return g;
}

function firecracker(): Grid {
  const g = new Grid(13, 15);
  for (let i = 0; i < 4; i++) g.rect(1 + i * 3, 3, 2, 11, 'r').rect(1 + i * 3, 3, 1, 11, 'p');
  g.rect(0, 7, 13, 3, 'Y').rect(0, 8, 13, 1, 'y');
  g.set(6, 8, 'R').set(5, 8, 'R').set(7, 8, 'R');
  g.line(6, 3, 8, 0, 'T').set(9, 0, 'Y').set(8, 0, 'O');
  g.rect(0, 14, 13, 1, 'R');
  return g;
}

function vase(): Grid {
  const g = new Grid(12, 15);
  g.rect(4, 0, 4, 1, 'w').rect(5, 1, 2, 3, 'w');
  g.ellipse(6, 8, 5.5, 5.5, 'w').ellipse(8, 10, 2.5, 2.5, 'g');
  g.ellipse(6, 8, 3, 3, 'K').ellipse(6, 8, 2, 2, 'w').set(6, 8, 'K');
  g.line(1, 5, 3, 3, 'K').line(11, 5, 9, 3, 'K').rect(4, 13, 4, 2, 'K');
  return g;
}

function gildedKeg(): Grid {
  const g = new Grid(12, 15);
  g.set(7, 0, 'Y').set(8, 1, 'O').set(6, 1, 'w');
  g.rect(2, 2, 8, 13, 'B').rect(1, 4, 10, 9, 'B').rect(1, 4, 2, 9, 'b').rect(9, 4, 2, 9, 'x');
  for (const y of [4, 8, 12]) g.rect(1, y, 10, 1, 'Y').set(1, y, 'y');
  g.ellipse(6, 2, 4, 1, 'x');
  return g;
}

function shipCrate(): Grid {
  const g = new Grid(14, 14);
  g.rect(0, 0, 14, 14, 'D').rect(0, 0, 14, 2, 'G').rect(0, 0, 2, 14, 'G').rect(12, 0, 2, 14, 'd').rect(0, 12, 14, 2, 'd');
  g.line(2, 11, 11, 2, 'G').line(2, 12, 12, 2, 'd');
  for (const [x, y] of [[3, 3], [10, 9], [4, 10], [9, 4], [11, 11]]) g.set(x, y, 'T');
  g.set(2, 6, 'l').set(1, 7, 'l').set(12, 5, 'L');
  return g;
}

function seaMine(): Grid {
  const g = new Grid(14, 14);
  for (const [x, y] of [[7, 0], [7, 13], [0, 7], [13, 7], [2, 2], [11, 2], [2, 11], [11, 11]]) g.line(7, 7, x, y, 'G');
  g.ellipse(7, 7, 4.5, 4.5, 'n').ellipse(6, 6, 1.5, 1.5, 'd').set(7, 7, 'r').set(8, 7, 'r');
  return g;
}

function cardboard(): Grid {
  const g = new Grid(14, 12);
  g.rect(0, 2, 14, 10, 'b').rect(0, 0, 14, 3, 't').rect(13, 2, 1, 10, 'B').rect(0, 11, 14, 1, 'B');
  g.rect(6, 0, 2, 12, 'T').rect(2, 6, 3, 2, 'k').set(10, 5, 'k').set(11, 5, 'k');
  return g;
}

function battery(): Grid {
  const g = new Grid(12, 16);
  g.rect(4, 0, 4, 2, 'G').rect(1, 2, 10, 14, 'n').rect(1, 2, 10, 1, 'd');
  for (let y = 4; y < 14; y += 3) g.rect(3, y, 6, 2, 'c');
  g.line(7, 4, 5, 8, 'Y').line(5, 8, 7, 8, 'Y').line(7, 8, 5, 13, 'Y');
  return g;
}

export function themeProps(biome: string): ThemeProps {
  const make = (crate: () => Grid, keg: () => Grid, names: [string, string], boom: ThemeProps['boom']): ThemeProps => ({ crate: [crate(), C], keg: [keg(), C], names, boom });
  switch (biome) {
    case 'forest':
      return make(stump, sporePod, ['腐朽树桩', '孢子囊'], 'grass');
    case 'glacier':
      return make(iceBlock, iceMine, ['冰块', '冰晶雷'], 'ice');
    case 'desert':
      return make(pot, oilJar, ['陶罐', '火油罐'], 'fire');
    case 'volcano':
      return make(obsidian, magmaBubble, ['黑曜石块', '熔岩泡'], 'fire');
    case 'factory':
      return make(metalCrate, oilDrum, ['铁皮箱', '油桶'], 'fire');
    case 'castle':
      return make(coffin, soulLamp, ['小木棺', '魂灯'], 'ice');
    case 'garden':
      return make(basket, firecracker, ['竹篓', '爆竹'], 'fire');
    case 'reef':
      return make(shipCrate, seaMine, ['沉船木箱', '水雷'], 'water');
    case 'neon':
      return make(cardboard, battery, ['纸箱', '高能电池'], 'shock');
    default:
      return make(vase, gildedKeg, ['青花瓶', '镀金火药桶'], 'fire');
  }
}
