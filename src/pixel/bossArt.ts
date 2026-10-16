import { Grid, type Ramp } from './draw';
import { E, ramp } from './palette';

/*
 * A guardian for every art style, each drawn to its style's subtitle: the vine king of the forest ruins,
 * the frost-bone giant, the jackal at the empty tomb, the sword saint of the garden...
 *
 * Every guardian comes in four poses, so it acts rather than slides: standing, breathing out, gathering a move
 * (arms raised, cape spread, blade sheathed) and letting it go (arms flung out, blade through). The second act
 * redraws it hotter: the eyes change, cracks glow, colours turn.
 */

export type Pose = 'idle' | 'breath' | 'cast' | 'strike';
export const POSES: Pose[] = ['idle', 'breath', 'cast', 'strike'];

export interface Art {
  g: Grid;
  colors: Record<string, string>;
  roles: Record<string, Ramp>;
}

const C = { w: E.white, g: E.grey, G: E.greyM, D: E.slate, d: E.slateD, n: E.navy, k: E.ink, y: E.amber, Y: E.yellow, O: E.orange, r: E.red, R: E.redD, p: E.pink, P: E.magenta, v: E.purple, b: E.brownL, B: E.brown, x: E.brownD, t: E.tan, T: E.cream, c: E.cyan, K: E.blue, Q: E.blueD, l: E.green, L: E.greenD, M: E.greenDD, s: E.skin, h: E.hot };

const W = 36;
const H = 38;

/** Forest: an old king grown into a tree, moss for a beard, a wooden crown, branches for arms. */
function vineKing(pose: Pose, p2: boolean): Art {
  const g = new Grid(W, H);
  const sway = pose === 'breath' ? 1 : 0;
  // Arms first, so the canopy and trunk sit over the shoulders.
  if (pose === 'cast') {
    g.line(12, 16, 6, 8, '1').line(11, 16, 5, 8, '1').line(6, 8, 3, 2, '2').line(24, 16, 30, 8, '1').line(25, 16, 31, 8, '1').line(30, 8, 33, 2, '2');
    g.ellipse(3, 2, 2, 2, 'l').set(3, 2, 'w').ellipse(33, 2, 2, 2, 'l').set(33, 2, 'w');
  } else if (pose === 'strike') {
    g.line(12, 17, 2, 19, '1').line(12, 18, 2, 20, '1').line(2, 19, 0, 15, '2').line(2, 20, 0, 26, 'l');
    g.line(24, 17, 34, 19, '1').line(24, 18, 34, 20, '1').line(34, 19, 35, 15, '2').line(34, 20, 35, 26, 'l');
  } else {
    g.line(12, 16, 5, 23 + sway, '1').line(11, 16, 4, 23 + sway, '1').line(5, 23 + sway, 4, 29 + sway, '2').line(4, 25, 2, 28, 'l');
    g.line(24, 16, 31, 23 + sway, '1').line(25, 16, 32, 23 + sway, '1').line(31, 23 + sway, 32, 29 + sway, '2').line(32, 25, 34, 28, 'l');
  }
  g.rect(12, 12, 12, 21, '1');
  g.line(14, 24, 14, 31, 'x').line(21, 23, 21, 31, 'x').line(17, 27, 18, 32, 'x');
  g.ellipse(18, 10, 10, 7, '2').ellipse(9, 8 + sway, 4, 3, '2').ellipse(27, 9 + sway, 4, 3, '2').ellipse(14, 6, 4, 2, '3');
  g.rect(13, 1, 10, 3, 'y').set(13, 0, 'Y').set(16, 0, 'Y').set(19, 0, 'Y').set(22, 0, 'Y').rect(17, 2, 2, 1, p2 ? 'h' : 'r');
  const eye = p2 ? 'O' : pose === 'cast' ? 'w' : 'Y';
  g.rect(14, 13, 3, 2, eye).rect(19, 13, 3, 2, eye);
  g.ellipse(18, 19, 5, 4, '3').ellipse(18, 22, 3, 3, '3').set(16, 24, '3').set(20, 25, '3');
  g.rect(11, 32, 6, 4, 'x').rect(19, 32, 6, 4, 'x').set(10, 35, 'B').set(26, 35, 'B').set(9, 36, 'B').set(27, 36, 'B');
  if (p2) g.line(15, 26, 13, 30, 'O').line(20, 22, 22, 27, 'O').line(18, 29, 19, 31, 'Y');
  return { g, colors: C, roles: { 1: ramp(E.brown, E.brownL, E.brownD), 2: p2 ? ramp(E.orange, E.amber, E.rust) : ramp(E.greenD, E.green, E.greenDD), 3: ramp(E.greenDD, E.greenD, E.tealD) } };
}

/** Glacier: a giant of old bones, packed in ice, eyes burning blue. */
function frostBone(pose: Pose, p2: boolean): Art {
  const g = new Grid(W, H);
  const lo = pose === 'breath' ? 1 : 0;
  if (pose === 'cast') {
    g.line(10, 15, 6, 5, '1').line(9, 15, 5, 5, '1').line(26, 15, 30, 5, '1').line(27, 15, 31, 5, '1');
    g.ellipse(5, 3, 3, 3, '3').set(5, 3, 'w').ellipse(31, 3, 3, 3, '3').set(31, 3, 'w');
  } else if (pose === 'strike') {
    g.line(10, 15, 3, 22, '1').line(10, 16, 3, 23, '1').rect(0, 22, 5, 5, '3');
    g.line(26, 15, 33, 22, '1').line(26, 16, 33, 23, '1').rect(31, 22, 5, 5, '3');
  } else {
    g.line(10, 15, 5, 27 + lo, '1').line(9, 15, 4, 27 + lo, '1').rect(2, 27 + lo, 5, 4, '3');
    g.line(26, 15, 31, 27 + lo, '1').line(27, 15, 32, 27 + lo, '1').rect(29, 27 + lo, 5, 4, '3');
  }
  g.ellipse(9, 14, 3, 2, '3').ellipse(27, 14, 3, 2, '3');
  g.rect(17, 14, 2, 15, '2');
  for (let y = 15 + lo; y < 27; y += 3) g.line(12, y, 24, y, '1').set(12, y + 1, '2').set(24, y + 1, '2');
  g.rect(13, 28, 10, 2, '2').line(14, 30, 12, 36, '1').line(22, 30, 24, 36, '1').rect(10, 36, 4, 1, '1').rect(23, 36, 4, 1, '1');
  g.tri(9, 8, 13, 8, 11, 0, '3').tri(23, 8, 27, 8, 25, 0, '3').tri(16, 2, 20, 2, 18, 0, '3');
  g.ellipse(18, 7, 6, 6, '1').rect(14, 11, 8, 3, '1');
  const eye = p2 ? 'r' : 'c';
  g.ellipse(15, 7, 1.5, 1.5, 'k').ellipse(21, 7, 1.5, 1.5, 'k').set(15, 7, eye).set(21, 7, eye);
  if (pose === 'cast' || p2) g.set(15, 6, 'w').set(21, 6, 'w');
  g.set(15, 12, 'k').set(17, 12, 'k').set(19, 12, 'k').set(21, 12, 'k');
  if (p2) g.line(16, 2, 14, 5, 'c').line(23, 16, 21, 22, 'c').line(12, 18, 14, 24, 'c');
  return { g, colors: C, roles: { 1: ramp(E.white, E.white, E.grey), 2: ramp(E.grey, E.white, E.greyM), 3: p2 ? ramp(E.cyan, E.white, E.blue) : ramp('#9fe6f5', E.white, E.cyan) } };
}

/** Desert: the jackal-headed keeper of the empty tomb, gold collar and striped headdress, a staff with a sun. */
function jackal(pose: Pose, p2: boolean): Art {
  const g = new Grid(W, H);
  const orb = p2 ? 'P' : 'c';
  if (pose === 'cast') {
    g.line(23, 22, 28, 14, '1').line(28, 0, 28, 30, 'y').ellipse(28, 2, 2.5, 2.5, 'Y').set(28, 2, 'w');
    g.line(13, 22, 7, 15, '1').set(7, 14, orb).set(6, 13, orb).set(8, 13, orb);
  } else if (pose === 'strike') {
    g.line(23, 23, 29, 19, '1').line(18, 27, 34, 11, 'y').ellipse(34, 11, 2, 2, 'Y').set(34, 11, orb);
    g.line(13, 23, 6, 25, '1');
  } else {
    const lo = pose === 'breath' ? 1 : 0;
    g.line(23, 23, 29, 22 + lo, '1').line(29, 4, 29, 36, 'y').ellipse(29, 4, 2, 2, 'Y').set(29, 4, pose === 'breath' ? 'w' : orb);
    g.line(13, 23, 8, 29 + lo, '1');
  }
  g.tri(11, 0, 9, 9, 14, 8, '1').tri(25, 0, 22, 8, 27, 9, '1').set(11, 4, 'y').set(25, 4, 'y');
  g.rect(9, 10, 2, 9, 'y').rect(25, 10, 2, 9, 'y');
  for (const y of [12, 15, 18]) g.rect(9, y, 2, 1, 'K').rect(25, y, 2, 1, 'K');
  g.ellipse(18, 10, 7, 5, '1').tri(14, 11, 22, 11, 18, 18, '1').set(18, 17, 'k');
  const eye = p2 ? 'r' : 'Y';
  g.set(15, 9, eye).set(21, 9, eye).set(14, 9, eye).set(22, 9, eye);
  g.ellipse(18, 20, 9, 2.5, 'y').rect(10, 20, 16, 1, 'K').set(18, 21, p2 ? 'r' : 'c');
  g.rect(13, 22, 10, 9, '2').rect(13, 27, 10, 1, 'y');
  g.rect(12, 30, 12, 3, 'T').line(14, 30, 14, 32, 'y').line(18, 30, 18, 32, 'y').line(22, 30, 22, 32, 'y');
  g.rect(13, 33, 3, 4, '1').rect(20, 33, 3, 4, '1');
  return { g, colors: C, roles: { 1: ramp(E.navy, E.slateD, E.ink), 2: p2 ? ramp(E.purple, E.magenta, E.brownD) : ramp(E.blueD, E.blue, E.navy) } };
}

/** Magma depths: a golem of black rock with the fire showing through its cracks. */
function magmaCore(pose: Pose, p2: boolean): Art {
  const g = new Grid(W, H);
  const fire = p2 ? 'Y' : 'O';
  if (pose === 'cast') {
    g.rect(4, 5, 5, 11, '2').rect(27, 5, 5, 11, '2').ellipse(6, 3, 3, 3, '1').ellipse(30, 3, 3, 3, '1').set(6, 3, 'Y').set(30, 3, 'Y').set(5, 2, 'O').set(31, 2, 'O');
  } else if (pose === 'strike') {
    g.rect(9, 20, 5, 9, '2').rect(22, 20, 5, 9, '2').ellipse(13, 30, 3.5, 3, '1').ellipse(23, 30, 3.5, 3, '1');
    g.set(18, 33, 'Y').set(17, 34, 'O').set(19, 34, 'O').set(15, 34, 'Y').set(21, 34, 'Y');
  } else {
    const lo = pose === 'breath' ? 1 : 0;
    g.rect(4, 16, 5, 10 + lo, '2').rect(27, 16, 5, 10 + lo, '2').ellipse(6, 27 + lo, 3, 3, '1').ellipse(30, 27 + lo, 3, 3, '1').set(6, 27 + lo, fire).set(30, 27 + lo, fire);
  }
  g.ellipse(7, 14, 4, 4, '2').ellipse(29, 14, 4, 4, '2');
  g.rect(12, 27, 5, 9, '2').rect(19, 27, 5, 9, '2').rect(11, 35, 7, 2, '1').rect(18, 35, 7, 2, '1');
  g.ellipse(18, 19, 10, 9, '1');
  g.rect(13, 4, 10, 8, '1').rect(13, 4, 3, 8, '2');
  g.rect(15, 7, 2, 2, p2 ? 'w' : 'Y').rect(19, 7, 2, 2, p2 ? 'w' : 'Y');
  const big = pose === 'breath' || pose === 'cast' ? 3.6 : 3;
  g.ellipse(18, 19, big, big, 'O').ellipse(18, 19, 1.5, 1.5, pose === 'cast' ? 'w' : 'Y');
  g.line(15, 14, 12, 18, fire).line(21, 22, 24, 25, fire).line(10, 20, 12, 23, 'r').line(5, 16, 6, 21, fire).line(30, 17, 29, 21, fire);
  if (p2) g.line(23, 13, 26, 17, 'Y').line(14, 24, 12, 27, 'Y').line(17, 28, 17, 34, 'O').line(20, 28, 21, 33, 'O');
  return { g, colors: C, roles: { 1: p2 ? ramp('#3a1f2a', E.brownD, E.ink) : ramp(E.navy, E.slateD, E.ink), 2: ramp(E.ink, E.navy, E.ink) } };
}

/** Steam works: a riveted boiler colossus, a stack on its back and a gauge for an eye. */
function steamColossus(pose: Pose, p2: boolean): Art {
  const g = new Grid(W, H);
  if (pose === 'cast') {
    g.rect(3, 3, 4, 11, '2').rect(29, 3, 4, 11, '2').ellipse(5, 2, 3, 2, 'G').ellipse(31, 2, 3, 2, 'G').set(5, 2, 'k').set(31, 2, 'k');
  } else if (pose === 'strike') {
    g.rect(5, 13, 4, 9, '2').rect(27, 13, 4, 9, '2').ellipse(8, 24, 4, 3.5, 'G').ellipse(28, 24, 4, 3.5, 'G').set(8, 24, 'k').set(28, 24, 'k');
  } else {
    const lo = pose === 'breath' ? 1 : 0;
    g.rect(3, 13, 4, 10 + lo, '2').rect(29, 13, 4, 10 + lo, '2').ellipse(5, 24 + lo, 3, 3, 'G').ellipse(31, 24 + lo, 3, 3, 'G').set(5, 24 + lo, 'k').set(31, 24 + lo, 'k');
  }
  g.rect(4, 9, 6, 4, 'G').rect(26, 9, 6, 4, 'G');
  g.rect(23, 0, 4, 8, '2').rect(22, 0, 6, 1, pose === 'breath' || p2 ? 'O' : 'G');
  g.rect(12, 24, 4, 10, '2').rect(20, 24, 4, 10, '2').rect(11, 34, 6, 2, 'k').rect(19, 34, 6, 2, 'k');
  g.rect(10, 6, 16, 18, '1');
  for (const y of [8, 22]) for (let x = 11; x < 26; x += 3) g.set(x, y, p2 ? 'r' : 'y');
  g.ellipse(18, 13, 4, 4, 'k').ellipse(18, 13, 3, 3, p2 ? 'T' : 'g');
  // The needle climbs into the red as the colossus winds up.
  const needle: Record<Pose, [number, number]> = { idle: [16, 11], breath: [18, 10], cast: [21, 13], strike: [21, 14] };
  g.line(18, 13, needle[pose][0], needle[pose][1], 'r').set(18, 13, 'k');
  const glow = pose === 'cast' || pose === 'strike' || p2 ? 'Y' : 'O';
  g.rect(13, 18, 10, 2, 'k').rect(14, 18, 1, 2, glow).rect(17, 18, 2, 2, glow).rect(21, 18, 1, 2, glow);
  if (pose === 'strike') g.rect(13, 18, 10, 3, 'k').rect(14, 19, 8, 1, 'Y');
  return { g, colors: C, roles: { 1: p2 ? ramp(E.rust, E.clay, E.brownD) : ramp(E.brownL, E.tan, E.brown), 2: ramp(E.slate, E.greyM, E.slateD) } };
}

/** Haunted keep: the count who steps out of his portrait, cape spread, eyes red. */
function portraitCount(pose: Pose, p2: boolean): Art {
  const g = new Grid(W, H);
  g.rect(4, 0, 28, 26, 'y').rect(4, 0, 28, 1, 'Y').rect(6, 2, 24, 22, 'x');
  if (p2) g.line(8, 0, 12, 7, 'k').line(12, 7, 10, 12, 'k').line(30, 4, 26, 10, 'k').line(6, 20, 9, 25, 'k');
  if (pose === 'cast') {
    g.tri(14, 15, 0, 9, 2, 35, '1').tri(22, 15, 36, 9, 34, 35, '1').tri(14, 16, 3, 13, 4, 32, '2').tri(22, 16, 33, 13, 32, 32, '2');
    g.set(0, 9, 'T').set(35, 9, 'T');
  } else {
    const hem = pose === 'breath' ? 1 : 0;
    g.tri(18, 15, 7 + hem, 37, 29 - hem, 37, '1').tri(18, 15, 10 + hem, 37, 18, 37, '2');
  }
  g.rect(14, 16, 8, 15, 'k').rect(15, 30, 2, 7, 'k').rect(19, 30, 2, 7, 'k');
  if (pose === 'strike') g.line(21, 18, 33, 13, 'k').line(21, 19, 33, 14, 'k').set(34, 12, 'T').set(35, 11, 'T').set(34, 14, 'T').set(35, 15, 'T');
  g.tri(12, 13, 16, 15, 12, 19, 'R').tri(24, 13, 20, 15, 24, 19, 'R');
  g.ellipse(18, 9, 4.5, 5.5, 'T').rect(13, 3, 10, 3, 'k').set(18, 6, 'k').set(14, 6, 'k').set(22, 6, 'k');
  const eye = p2 || pose === 'cast' ? 'Y' : 'r';
  g.set(16, 9, eye).set(20, 9, eye).rect(17, 12, 2, 1, 'R').set(17, 13, 'w').set(18, 13, 'w');
  g.rect(15, 15, 6, 2, 'w').set(18, 17, 'r');
  return { g, colors: C, roles: { 1: p2 ? ramp(E.redD, E.red, '#4a0f1a') : ramp(E.redD, E.red, E.brownD), 2: ramp(E.purple, E.magenta, E.navy) } };
}

/** Garden: the sword saint under a wide straw hat, robe flowing, blade drawn, or sheathed for the cut. */
function swordSaint(pose: Pose, p2: boolean): Art {
  const g = new Grid(W, H);
  // Iaido: the saint sinks into the stance before the cut.
  const dy = pose === 'cast' ? 2 : 0;
  if (pose === 'idle' || pose === 'breath') {
    const k = pose === 'breath' ? 1 : 0;
    g.line(24, 20, 34, 6 + k, 'g').line(25, 20, 35, 7 + k, 'w').rect(23, 19, 3, 3, 'y').set(35, 5 + k, 'w');
  }
  g.tri(11, 21 + dy, 5, 33, 11, 32, 'R').tri(25, 21 + dy, 31, 33, 25, 32, 'R');
  g.tri(18, 14 + dy, 8, 34, 28, 34, '3').tri(18, 14 + dy, 8, 34, 15, 34, 'g');
  g.rect(13, 18 + dy, 10, 2, p2 ? 'k' : 'r').set(18, 19 + dy, 'y');
  g.rect(14, 34, 3, 3, 'k').rect(19, 34, 3, 3, 'k');
  if (p2) g.set(12, 26, 'r').set(13, 27, 'r').set(22, 24, 'r').set(24, 29, 'r').set(16, 30, 'R');
  g.ellipse(18, 12 + dy, 4, 3, 's').rect(15, 11 + dy, 6, 1, 'k');
  g.set(16, 11 + dy, p2 ? 'r' : 'w').set(20, 11 + dy, p2 ? 'r' : 'w');
  g.tri(18, 1 + dy, 4, 9 + dy, 32, 9 + dy, '1').rect(5, 8 + dy, 26, 2, '2').line(18, 1 + dy, 6, 8 + dy, 'T');
  if (pose === 'cast') {
    g.line(9, 25, 31, 22, 'k').line(9, 26, 31, 23, 'R').rect(30, 21, 4, 2, 'y').set(27, 22, 's').set(28, 22, 's');
  } else if (pose === 'strike') {
    g.line(21, 20, 36, 20, 'g').line(21, 19, 36, 19, 'w').rect(20, 19, 2, 2, 'y');
    for (const [x, y] of [[30, 16], [33, 23], [26, 15], [35, 17]] as [number, number][]) g.set(x, y, 'p');
  }
  const petals: [number, number][] = pose === 'breath' ? [[3, 15], [28, 26], [7, 25], [1, 21]] : [[4, 14], [27, 25], [6, 24], [2, 20]];
  for (const [x, y] of petals) g.set(x, y, 'p');
  return { g, colors: C, roles: { 1: ramp(E.tan, E.cream, E.brownL), 2: ramp(E.brownL, E.tan, E.brown), 3: p2 ? ramp(E.grey, E.white, E.greyM) : ramp(E.white, E.white, E.grey) } };
}

/** Palace: the marble angel out of the mural, wings open, sword raised, a halo of gold. */
function marbleAngel(pose: Pose, p2: boolean): Art {
  const g = new Grid(W, H);
  const wings: Record<Pose, number[][]> = {
    idle: [[15, 11, 2, 4, 6, 27], [21, 11, 34, 4, 30, 27]],
    breath: [[15, 12, 1, 11, 5, 31], [21, 12, 35, 11, 31, 31]],
    cast: [[15, 11, 4, 0, 2, 19], [21, 11, 32, 0, 34, 19]],
    strike: [[15, 11, 0, 8, 4, 23], [21, 11, 36, 8, 32, 23]],
  };
  for (const [ax, ay, bx, by, cx, cy] of wings[pose]) {
    g.tri(ax, ay, bx, by, cx, cy, '2');
    for (let i = 1; i < 4; i++) g.line(ax, ay + i, bx + (cx - bx) * (i / 4), by + (cy - by) * (i / 4), p2 ? 'y' : 'g');
  }
  if (pose === 'cast') g.line(24, 14, 32, 1, 'w').line(25, 14, 33, 2, 'g').set(32, 0, 'Y').set(33, 1, 'Y');
  else if (pose === 'strike') g.line(22, 17, 33, 28, 'w').line(22, 18, 32, 29, 'g');
  else g.line(24, 15, 29, 1, 'w').line(25, 15, 30, 2, 'g');
  g.tri(18, 11, 12, 34, 24, 34, '1').tri(18, 12, 12, 34, 17, 34, 'g').rect(14, 19, 8, 1, 'y');
  g.rect(22, 14, 4, 2, 'y');
  g.rect(13, 34, 10, 3, '3');
  g.ellipse(18, 7, 3.5, 3.5, '1');
  const eye = p2 ? 'Y' : 'G';
  g.set(17, 7, eye).set(19, 7, eye);
  g.ellipse(18, 2, 5, 1.5, 'Y').ellipse(18, 2, 3, 0.6, '.');
  if (p2) g.line(16, 5, 15, 9, 'D').line(15, 22, 17, 27, 'D').line(20, 25, 19, 31, 'D').set(18, 2, 'O');
  return { g, colors: C, roles: { 1: ramp(E.white, E.white, E.grey), 2: p2 ? ramp(E.yellow, E.white, E.amber) : ramp(E.white, E.white, E.grey), 3: ramp(E.greyM, E.grey, E.slate) } };
}

/** Sunken ruins: a sea witch of tentacles with the drowned ship's bronze bell on her head. */
function bellKraken(pose: Pose, p2: boolean): Art {
  const g = new Grid(W, H);
  for (let i = 0; i < 6; i++) {
    const x = 8 + i * 4;
    let a = i % 2 ? 2 : -2;
    if (pose === 'breath') a = -a;
    if (pose === 'strike') {
      const out = (i - 2.5) * 2.4;
      g.line(x, 22, x + out, 30, '1').line(x + out, 30, x + out * 1.4, 36, '1').set(Math.round(x + out * 1.4), 36, 'p');
    } else if (pose === 'cast') {
      g.line(x, 22, x + a, 28, '1').line(x + a, 28, x - a, 31, '1').set(x - a, 31, 'p');
    } else {
      g.line(x, 22, x + a, 29, '1').line(x + a, 29, x, 36, '1').set(x, 32, 'p');
    }
  }
  if (pose === 'cast') g.line(10, 18, 3, 6, '1').line(9, 18, 2, 6, '1').line(26, 18, 33, 6, '1').line(27, 18, 34, 6, '1').set(2, 5, 'p').set(34, 5, 'p');
  else if (pose === 'strike') g.line(10, 19, 0, 22, '1').line(10, 20, 0, 23, '1').line(26, 19, 36, 22, '1').line(26, 20, 36, 23, '1');
  else g.line(9, 18, 3, 12 + (pose === 'breath' ? 2 : 0), '1').line(27, 18, 33, 12 + (pose === 'breath' ? 2 : 0), '1');
  g.ellipse(18, 17, 9, 7, '1').ellipse(14, 15, 3, 2, 'p');
  const eye = p2 ? 'r' : 'Y';
  g.set(14, 17, eye).set(22, 17, eye).set(14, 18, 'k').set(22, 18, 'k');
  g.tri(18, 0, 11, 10, 25, 10, '2').rect(10, 9, 16, 2, '2').line(18, 1, 13, 9, 'Y').ellipse(18, 11, 1.5, 1, 'B');
  if (pose === 'cast') g.set(18, 12, 'B').set(18, 13, 'Y');
  if (p2) g.line(20, 2, 22, 6, 'k').line(22, 6, 21, 9, 'k').set(12, 21, 'c').set(24, 20, 'c');
  return { g, colors: C, roles: { 1: p2 ? ramp(E.purple, E.magenta, E.navy) : ramp(E.magenta, E.pink, E.purple), 2: ramp(E.amber, E.yellow, E.brownL) } };
}

/** Neon city: a battle mecha in dark plating, edged in neon, a visor for a face. */
function neonMecha(pose: Pose, p2: boolean): Art {
  const g = new Grid(W, H);
  const n1 = p2 ? 'h' : 'P';
  const n2 = p2 ? 'O' : 'c';
  if (pose === 'cast') {
    g.rect(4, 3, 4, 9, '2').rect(28, 3, 4, 9, '2').rect(3, 1, 6, 2, n2).rect(27, 1, 6, 2, n1).set(5, 0, 'w').set(30, 0, 'w');
  } else if (pose === 'strike') {
    g.rect(4, 13, 4, 6, '2').rect(28, 13, 4, 6, '2').ellipse(6, 21, 3, 3, '1').ellipse(30, 21, 3, 3, '1').ellipse(6, 21, 1.5, 1.5, 'w').ellipse(30, 21, 1.5, 1.5, 'w');
  } else {
    const lo = pose === 'breath' ? 1 : 0;
    g.rect(4, 15, 4, 9 + lo, '2').rect(28, 15, 4, 9 + lo, '2').rect(3, 24 + lo, 6, 3, n2).rect(27, 24 + lo, 6, 3, n1);
  }
  g.rect(3, 10, 6, 5, '1').rect(27, 10, 6, 5, '1');
  g.rect(11, 23, 5, 10, '1').rect(20, 23, 5, 10, '1').rect(10, 33, 7, 2, n1).rect(19, 33, 7, 2, n2);
  g.rect(9, 10, 18, 13, '2').rect(9, 10, 18, 1, n1).rect(9, 22, 18, 1, n1).rect(9, 10, 1, 13, n1).rect(26, 10, 1, 13, n1);
  const core = pose === 'breath' || pose === 'cast' ? 3.6 : 3;
  g.ellipse(18, 16, core, core, n2).ellipse(18, 16, 1.5, 1.5, 'w');
  g.rect(13, 2, 10, 8, '1').rect(13, 2, 10, 1, 'D');
  if (pose === 'breath') g.rect(14, 5, 8, 2, 'k').rect(14, 5, 4, 2, n2);
  else g.rect(14, 5, 8, 2, pose === 'cast' ? 'w' : n2);
  return { g, colors: C, roles: { 1: ramp(E.slateD, E.slate, E.navy), 2: p2 ? ramp('#3a1f2a', E.purple, E.ink) : ramp(E.navy, E.slateD, E.ink) } };
}

export function guardianArt(biome: string, pose: Pose = 'idle', p2 = false): Art {
  switch (biome) {
    case 'forest':
      return vineKing(pose, p2);
    case 'glacier':
      return frostBone(pose, p2);
    case 'desert':
      return jackal(pose, p2);
    case 'volcano':
      return magmaCore(pose, p2);
    case 'factory':
      return steamColossus(pose, p2);
    case 'castle':
      return portraitCount(pose, p2);
    case 'garden':
      return swordSaint(pose, p2);
    case 'reef':
      return bellKraken(pose, p2);
    case 'neon':
      return neonMecha(pose, p2);
    default:
      return marbleAngel(pose, p2);
  }
}

/** Guardians that float instead of walk: they bob in the air and leave no footfalls. */
export const FLOATING = new Set(['castle', 'palace', 'reef', 'neon']);
/** Guardians heavy enough that every step shakes the floor. */
export const HEAVY = new Set(['glacier', 'volcano', 'factory']);
