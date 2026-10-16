import { Grid } from './draw';
import { E } from './palette';

/*
 * A small picture for every upgrade, 13 x 13, so the level-up cards, the pause page, the codex and the treasure
 * pedestals show what an upgrade does instead of a single character.
 */

type Art = [Grid, Record<string, string>];

const G = () => new Grid(13, 13);
const C = { w: E.white, g: E.grey, G: E.greyM, D: E.slate, y: E.amber, Y: E.yellow, O: E.orange, r: E.red, R: E.redD, p: E.pink, b: E.brown, B: E.brownD, c: E.cyan, k: E.blue, K: E.blueD, l: E.green, L: E.greenD, P: E.magenta, v: E.purple, n: E.navy, t: E.tan, T: E.cream };

function sword(): Art {
  const g = G();
  g.line(3, 9, 11, 1, 'g').line(4, 9, 11, 2, 'w').line(3, 8, 10, 1, 'G');
  g.line(1, 7, 5, 11, 'y').line(2, 7, 5, 10, 'Y');
  g.line(1, 11, 3, 9, 'b').set(0, 12, 'B');
  return [g, C];
}

function haste(): Art {
  const g = G();
  for (const ox of [0, 5]) {
    g.line(1 + ox, 2, 5 + ox, 6, 'Y').line(5 + ox, 6, 1 + ox, 10, 'Y');
    g.line(2 + ox, 2, 6 + ox, 6, 'y').line(6 + ox, 6, 2 + ox, 10, 'y');
  }
  g.set(12, 6, 'w');
  return [g, C];
}

function expand(): Art {
  const g = G();
  g.ellipse(6, 6, 2.5, 2.5, 'c').set(5, 5, 'w');
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const x = 6 + dx * 5;
    const y = 6 + dy * 5;
    g.set(x, y, 'w');
    g.line(6 + dx * 3, 6 + dy * 3, x, y, 'c');
    if (dx) g.set(x - dx, y - 1, 'c').set(x - dx, y + 1, 'c');
    else g.set(x - 1, y - dy, 'c').set(x + 1, y - dy, 'c');
  }
  return [g, C];
}

function velocity(): Art {
  const g = G();
  g.rect(6, 4, 4, 5, 'y').rect(10, 5, 1, 3, 'Y').set(11, 6, 'Y').rect(6, 4, 4, 1, 'Y').rect(5, 4, 1, 5, 'O');
  for (const [y, len] of [[3, 3], [6, 4], [9, 3]]) g.rect(4 - len, y, len, 1, 'w');
  return [g, C];
}

function crosshair(): Art {
  const g = G();
  g.ellipse(6, 6, 5, 5, 'r').ellipse(6, 6, 3.6, 3.6, '.');
  g.rect(6, 0, 1, 4, 'r').rect(6, 9, 1, 4, 'r').rect(0, 6, 4, 1, 'r').rect(9, 6, 4, 1, 'r');
  g.set(6, 6, 'w');
  return [g, C];
}

function skull(): Art {
  const g = G();
  g.ellipse(6, 5, 5, 4.5, 'w').rect(3, 8, 7, 3, 'w');
  g.ellipse(4, 5, 1.2, 1.2, 'r').ellipse(8, 5, 1.2, 1.2, 'r').set(6, 7, 'n');
  g.set(4, 10, 'n').set(6, 10, 'n').set(8, 10, 'n').rect(3, 11, 7, 1, 'g');
  return [g, C];
}

function impact(): Art {
  const g = G();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 ? 4 : 6;
    g.line(6, 6, 6 + Math.round(Math.cos(a) * r), 6 + Math.round(Math.sin(a) * r), 'O');
  }
  g.ellipse(6, 6, 2.5, 2.5, 'Y').set(6, 6, 'w');
  return [g, C];
}

function feather(): Art {
  const g = G();
  g.line(2, 11, 10, 2, 'T');
  for (let i = 0; i < 6; i++) {
    const x = 4 + i;
    const y = 9 - i;
    g.line(x, y, x - 2, y - 2, 'w').line(x, y, x + 2, y + 1, 'c');
  }
  g.set(1, 12, 'b');
  return [g, C];
}

function heartPlus(): Art {
  const g = G();
  g.ellipse(4, 4, 2.5, 2.5, 'r').ellipse(8, 4, 2.5, 2.5, 'r').tri(1, 5, 11, 5, 6, 11, 'r');
  g.set(3, 3, 'p').set(4, 3, 'p');
  g.rect(8, 7, 5, 1, 'l').rect(10, 5, 1, 5, 'l');
  return [g, C];
}

function magnet(): Art {
  const g = G();
  g.ellipse(6, 7, 5, 5, 'r').ellipse(6, 7, 2.6, 2.6, '.').rect(1, 0, 11, 7, '.');
  g.rect(1, 3, 3, 4, 'r').rect(9, 3, 3, 4, 'r').rect(1, 1, 3, 2, 'g').rect(9, 1, 3, 2, 'g');
  g.set(6, 0, 'c').set(5, 1, 'c').set(7, 1, 'c');
  return [g, C];
}

function dash(): Art {
  const g = G();
  for (const [ox, col] of [[0, 'K'], [3, 'k'], [6, 'c']] as [number, string][]) {
    g.line(ox, 2, ox + 4, 6, col).line(ox + 4, 6, ox, 10, col);
  }
  g.set(11, 6, 'w').set(10, 6, 'w');
  return [g, C];
}

function reload(): Art {
  const g = G();
  g.ellipse(6, 6, 5, 5, 'l').ellipse(6, 6, 3.6, 3.6, '.');
  g.rect(9, 0, 4, 4, '.').tri(8, 0, 12, 2, 9, 4, 'l');
  g.rect(5, 4, 3, 5, 'y').rect(5, 4, 3, 1, 'Y');
  return [g, C];
}

function magazine(): Art {
  const g = G();
  g.rect(3, 1, 7, 11, 'D').rect(4, 2, 5, 9, 'n');
  for (let y = 2; y < 11; y += 2) g.rect(4, y, 5, 1, 'y').set(4, y, 'Y');
  g.rect(3, 11, 7, 1, 'G');
  return [g, C];
}

function multi(): Art {
  const g = G();
  for (const [x, y] of [[1, 8], [5, 5], [9, 2]]) g.rect(x, y, 3, 3, 'y').set(x + 3, y + 1, 'Y').set(x, y, 'Y');
  g.line(0, 12, 3, 9, 'w').line(4, 9, 6, 7, 'w').line(8, 6, 10, 4, 'w');
  return [g, C];
}

function pierce(): Art {
  const g = G();
  g.ellipse(6, 6, 4, 4, 'r').ellipse(6, 6, 2.5, 2.5, 'w').ellipse(6, 6, 1.2, 1.2, 'r');
  g.line(0, 6, 12, 6, 'b').set(12, 6, 'g').set(11, 5, 'g').set(11, 7, 'g');
  g.set(0, 5, 'w').set(0, 7, 'w');
  return [g, C];
}

function flame(): Art {
  const g = G();
  g.ellipse(6, 8, 4, 4, 'r').tri(2, 8, 10, 8, 6, 0, 'r').tri(7, 6, 11, 7, 10, 2, 'r');
  g.ellipse(6, 9, 2.6, 2.6, 'O').tri(4, 9, 8, 9, 6, 3, 'O');
  g.ellipse(6, 10, 1.4, 1.6, 'Y');
  return [g, C];
}

function snowflake(): Art {
  const g = G();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = 6 + Math.round(Math.cos(a) * 5);
    const y = 6 + Math.round(Math.sin(a) * 5);
    g.line(6, 6, x, y, 'c');
    const mx = 6 + Math.cos(a) * 3;
    const my = 6 + Math.sin(a) * 3;
    g.set(Math.round(mx + Math.cos(a + 1) * 1.5), Math.round(my + Math.sin(a + 1) * 1.5), 'w');
    g.set(Math.round(mx + Math.cos(a - 1) * 1.5), Math.round(my + Math.sin(a - 1) * 1.5), 'w');
  }
  g.set(6, 6, 'w');
  return [g, C];
}

function bolt(): Art {
  const g = G();
  g.tri(7, 0, 2, 7, 6, 7, 'Y').tri(6, 5, 10, 5, 4, 12, 'Y').line(7, 0, 3, 7, 'w');
  g.set(4, 12, 'w');
  return [g, C];
}

function fang(): Art {
  const g = G();
  g.tri(2, 1, 10, 1, 6, 8, 'w').line(2, 1, 6, 8, 'g');
  g.ellipse(6, 10, 1.5, 2, 'r').set(6, 8, 'r').set(6, 12, 'R');
  return [g, C];
}

function desperate(): Art {
  const g = G();
  g.ellipse(4, 5, 2.5, 2.5, 'R').ellipse(8, 5, 2.5, 2.5, 'R').tri(1, 6, 11, 6, 6, 12, 'R');
  g.line(6, 3, 5, 6, 'n').line(5, 6, 7, 8, 'n').line(7, 8, 6, 11, 'n');
  g.rect(9, 0, 1, 4, 'O').set(10, 1, 'Y').set(8, 1, 'O');
  return [g, C];
}

function twin(): Art {
  const g = G();
  g.ellipse(4, 6, 3.5, 3.5, 'c').ellipse(8, 6, 3.5, 3.5, 'P');
  g.ellipse(6, 6, 1.4, 2.5, 'w');
  return [g, C];
}

function scope(): Art {
  const g = G();
  g.ellipse(6, 6, 5.5, 3.5, 'w').ellipse(6, 6, 2.5, 2.5, 'k').ellipse(6, 6, 1, 1, 'n');
  g.rect(6, 0, 1, 3, 'r').rect(6, 10, 1, 3, 'r').rect(0, 6, 2, 1, 'r').rect(11, 6, 2, 1, 'r');
  return [g, C];
}

function paw(x: number, y: number, g: Grid, col: string) {
  g.ellipse(x, y + 2, 2, 1.6, col);
  for (const [dx, dy] of [[-2, -1], [0, -2], [2, -1]]) g.set(x + dx, y + dy, col);
}

function bond(): Art {
  const g = G();
  paw(4, 7, g, 't');
  g.ellipse(9, 4, 1.4, 1.4, 'r').ellipse(11, 4, 1.4, 1.4, 'r').tri(8, 5, 12, 5, 10, 8, 'r');
  return [g, C];
}

function pack(): Art {
  const g = G();
  paw(3, 8, g, 't');
  paw(9, 4, g, 'T');
  return [g, C];
}

function tamer(): Art {
  const g = G();
  paw(4, 7, g, 't');
  g.line(8, 10, 10, 2, 'b').line(9, 10, 11, 2, 'y');
  g.rect(9, 1, 3, 2, 'Y').set(10, 0, 'w').set(12, 3, 'Y');
  return [g, C];
}

function petfield(): Art {
  const g = G();
  g.ellipse(6, 6, 6, 5.5, 'c').ellipse(6, 6, 4.6, 4.1, '.');
  paw(6, 6, g, 'T');
  g.set(0, 6, 'w').set(12, 6, 'w').set(6, 0, 'w').set(6, 12, 'w');
  return [g, C];
}

function wildinstinct(): Art {
  const g = G();
  for (let i = 0; i < 3; i++) {
    const x = 1 + i * 4;
    g.line(x + 2, 1, x, 8, 'r').line(x + 3, 1, x + 1, 8, 'T').set(x, 9, 'w');
  }
  g.line(3, 11, 8, 11, 'O').set(9, 10, 'Y');
  return [g, C];
}

function petecho(): Art {
  const g = G();
  paw(3, 8, g, 'v');
  paw(8, 4, g, 'P');
  g.line(7, 11, 11, 7, 'c').set(11, 8, 'w').set(10, 7, 'w');
  return [g, C];
}

function teamwork(): Art {
  const g = G();
  g.line(3, 9, 9, 3, 'y').line(3, 3, 9, 9, 'y');
  paw(3, 3, g, 'T');
  paw(9, 7, g, 't');
  g.set(6, 6, 'w').set(5, 6, 'Y').set(6, 5, 'Y');
  return [g, C];
}

function packguard(): Art {
  const g = G();
  g.rect(1, 1, 11, 6, 'c').tri(1, 6, 11, 6, 6, 12, 'c');
  g.rect(2, 2, 9, 4, 'k').tri(2, 6, 10, 6, 6, 10, 'k');
  paw(6, 5, g, 'w');
  g.set(2, 1, 'w').set(1, 2, 'w');
  return [g, C];
}

function beastmaster(): Art {
  const g = G();
  g.tri(1, 0, 1, 5, 5, 5, 'y').tri(6, 0, 3, 5, 9, 5, 'Y').tri(11, 0, 7, 5, 11, 5, 'y');
  g.rect(2, 4, 9, 2, 'y').set(6, 4, 'r').set(1, 0, 'w').set(6, 0, 'w').set(11, 0, 'w');
  paw(6, 9, g, 'T');
  return [g, C];
}

function ember(): Art {
  const g = G();
  g.ellipse(6, 7, 4.5, 4, 'O').ellipse(6, 7, 2.5, 2.2, 'Y').set(6, 7, 'w');
  for (const [x, y] of [[1, 1], [11, 2], [0, 10], [12, 11], [6, 0]]) g.set(x, y, 'r');
  g.set(2, 3, 'O').set(10, 4, 'O');
  return [g, C];
}

function fission(): Art {
  const g = G();
  g.rect(5, 8, 3, 4, 'y').set(5, 8, 'Y');
  g.line(6, 7, 2, 2, 'w').line(6, 7, 10, 2, 'w');
  g.rect(1, 1, 2, 2, 'Y').rect(10, 1, 2, 2, 'Y');
  return [g, C];
}

function chainboom(): Art {
  const g = G();
  g.ellipse(5, 7, 4, 4, 'n').set(3, 5, 'D').set(4, 4, 'D');
  g.rect(8, 2, 2, 2, 'G').line(9, 1, 11, 0, 'T').set(12, 0, 'Y');
  g.ellipse(10, 10, 2, 1.5, 'g').ellipse(10, 10, 0.8, 0.5, '.');
  return [g, C];
}

function frenzy(): Art {
  const g = G();
  for (const ox of [0, 5]) g.tri(1 + ox, 7, 5 + ox, 7, 3 + ox, 1, 'r').rect(2 + ox, 7, 3, 5, 'r');
  g.set(3, 3, 'Y').set(8, 3, 'Y').rect(0, 12, 13, 1, 'O');
  return [g, C];
}

function resonance(): Art {
  const g = G();
  g.ellipse(6, 6, 5.5, 5.5, 'O').ellipse(6, 6, 4.5, 4.5, '.');
  g.ellipse(6, 6, 3.5, 3.5, 'c').ellipse(6, 6, 2.5, 2.5, '.');
  g.ellipse(6, 6, 1.5, 1.5, 'Y');
  return [g, C];
}

function anemone(): Art {
  const g = G();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    g.ellipse(6 + Math.cos(a) * 3.2, 6 + Math.sin(a) * 3.2, 2.2, 2.2, 'r');
  }
  g.ellipse(6, 6, 2, 2, 'w').ellipse(6, 6, 1.2, 1.2, 'n');
  return [g, C];
}

function cupid(): Art {
  const g = G();
  g.ellipse(4, 5, 2.5, 2.5, 'p').ellipse(8, 5, 2.5, 2.5, 'p').tri(1, 6, 11, 6, 6, 11, 'p');
  g.set(3, 4, 'w');
  g.line(0, 11, 12, 1, 'y').set(12, 1, 'w').set(11, 1, 'w').set(12, 2, 'w').set(0, 12, 'r').set(1, 12, 'r');
  return [g, C];
}

function drop(): Art {
  const g = G();
  g.tri(6, 0, 2, 7, 10, 7, 'k').ellipse(6, 8, 4, 3.6, 'k').ellipse(5, 7, 1.5, 2, 'c').set(4, 6, 'w');
  return [g, C];
}

function swirl(): Art {
  const g = G();
  g.ellipse(6, 6, 5, 5, 'c').ellipse(6, 6, 3.6, 3.6, '.').rect(6, 1, 7, 5, '.');
  g.ellipse(6, 6, 2.5, 2.5, 'l').ellipse(6, 6, 1.2, 1.2, '.').set(6, 6, 'w');
  g.line(11, 3, 12, 1, 'c').set(10, 4, 'w');
  return [g, { ...C, c: '#5fd6b8', l: '#9feadb' }];
}

function geo(): Art {
  const g = G();
  g.tri(6, 0, 1, 6, 11, 6, 'Y').tri(1, 6, 11, 6, 6, 12, 'y').line(6, 0, 6, 12, 'O').line(1, 6, 11, 6, 'O');
  g.set(4, 3, 'w').set(5, 2, 'w');
  return [g, C];
}

function leaf(): Art {
  const g = G();
  g.ellipse(7, 5, 5, 3.2, 'l').ellipse(5, 4, 2, 1.2, 'L').line(1, 11, 9, 3, 'L').line(3, 9, 2, 12, 'L');
  g.set(6, 3, 'w');
  return [g, { ...C, l: '#8fd14f' }];
}

export const UPGRADE_ICONS: Record<string, () => Art> = {
  water: drop,
  wind: swirl,
  rock: geo,
  grass: leaf,
  sharp: sword,
  haste,
  expand,
  velocity,
  precise: crosshair,
  lethal: skull,
  impact,
  light: feather,
  vigor: heartPlus,
  magnet,
  dashmaster: dash,
  quickload: reload,
  bigmag: magazine,
  multi,
  pierce,
  fire: flame,
  ice: snowflake,
  shock: bolt,
  bloom: fang,
  desperate,
  twin,
  sniper: scope,
  bond,
  pack,
  tamer,
  petfield,
  wildinstinct,
  petecho,
  teamwork,
  packguard,
  beastmaster,
  ember,
  fission,
  chainboom,
  frenzy,
  resonance,
  anemone,
  aphrodite: cupid,
};
