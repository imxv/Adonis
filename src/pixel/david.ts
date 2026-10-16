import { Grid } from './draw';
import { E } from './palette';

/*
 * The title painting's centrepiece: a marble David in the classical manner, standing in contrapposto on a plinth,
 * weight on his right leg, the sling over his left shoulder, a stone in the hanging hand, curls and a turned head.
 * The silhouette is built from tapered limbs, then lit like stone under the anemone moon: cool white from the left,
 * falling into blue-grey shadow, with a thin red rim where the moon catches the right-hand edge.
 */

export const DAVID_COLORS: Record<string, string> = {
  w: E.white,
  g: E.grey,
  G: E.greyM,
  D: E.slate,
  d: E.slateD,
  n: E.navy,
  p: E.pink,
  r: E.red,
  B: E.brown,
  b: E.brownL,
  y: E.amber,
};

/** A tapered limb: circles swept from (x0, y0) radius r0 to (x1, y1) radius r1. */
function limb(g: Grid, x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, ch = 'm') {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = r0 + (r1 - r0) * t;
    g.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, r, ch);
  }
}

/** Light every marble pixel by where it sits across its row: lit on the left, shadowed to the right, red rim. */
function lightMarble(g: Grid) {
  for (let y = 0; y < g.h; y++) {
    let x = 0;
    while (x < g.w) {
      if (g.get(x, y) !== 'm') {
        x++;
        continue;
      }
      let end = x;
      while (end + 1 < g.w && g.get(end + 1, y) === 'm') end++;
      const w = end - x + 1;
      for (let i = x; i <= end; i++) {
        const u = w === 1 ? 0.5 : (i - x) / (w - 1);
        let c = u < 0.2 ? 'w' : u < 0.55 ? 'g' : u < 0.86 ? 'G' : 'D';
        // Surfaces facing up catch the light.
        if (g.get(i, y - 1) === '.' && u < 0.7) c = 'w';
        if (i === end && w >= 4) c = 'p';
        g.set(i, y, c);
      }
      x = end + 1;
    }
  }
}

/** David on his plinth: 52 x 100, feet at the plinth top (y = 88). */
export function david(): Grid {
  const g = new Grid(52, 100);
  const ox = 4;
  const L = (x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => limb(g, x0 + ox, y0, r0, x1 + ox, y1, r1);

  // The tree stump that holds him up, behind the right leg.
  g.rect(ox + 5, 62, 7, 25, 'm');
  // Legs: the right (weight) leg straight, the left relaxed, knee forward, foot turned out.
  L(17, 50, 5.5, 16, 66, 3.6);
  L(16, 66, 3.6, 16, 83, 2.6);
  L(29, 50, 5.5, 31, 66, 3.6);
  L(31, 66, 3.6, 34, 82, 2.6);
  g.ellipse(ox + 15, 86, 4, 2, 'm').ellipse(ox + 35, 85, 4.5, 2, 'm');
  // Hips tilted by the contrapposto, a narrow waist, the abdomen and chest, shoulders tilted the other way.
  g.ellipse(ox + 23, 47, 9, 6, 'm');
  g.ellipse(ox + 23, 38, 7, 7, 'm');
  g.ellipse(ox + 23, 28, 9, 5, 'm');
  // Sloping shoulders, the right one (his weight side) a little lower.
  L(23, 19, 3.4, 13, 24, 3.2);
  L(23, 19, 3.4, 34, 22, 3.2);
  // The right arm hangs, away from the body, the stone in its hand.
  L(11, 24, 3, 5, 38, 2.5);
  L(5, 38, 2.5, 6, 52, 2.1);
  g.ellipse(ox + 6, 54, 2.6, 3, 'm');
  // The left arm bends up: the hand at the shoulder holds the sling.
  L(35, 23, 3.2, 39, 34, 2.6);
  L(39, 34, 2.6, 32, 21, 2.1);
  // Neck and head, turned to his left.
  L(23, 19, 3.2, 24, 14, 3);
  g.ellipse(ox + 25, 9, 5.6, 6.4, 'm');
  g.ellipse(ox + 30, 10, 2, 2, 'm');

  lightMarble(g);


  // The raised forearm crosses in front of the shoulder.
  g.line(ox + 33, 22, ox + 38, 32, 'd');
  // Curls: a cap of hair over the crown and the back of the head.
  for (const [x, y, c] of [[20, 4, 'G'], [22, 2, 'g'], [25, 1, 'g'], [28, 2, 'G'], [21, 7, 'D'], [23, 5, 'w'], [26, 4, 'G'], [29, 5, 'D'], [20, 10, 'D'], [21, 12, 'G'], [24, 3, 'D'], [27, 6, 'D']] as [number, number, string][]) {
    g.set(ox + x, y, c);
  }
  for (const [x, y] of [[21, 3], [23, 1], [26, 1], [29, 3], [19, 6], [19, 9]] as [number, number][]) g.set(ox + x, y, 'g');
  // More curls: little dark hooks in rows over the crown.
  for (const [x, y] of [[20, 5], [22, 4], [25, 3], [27, 4], [30, 6], [21, 9], [23, 7], [26, 6], [20, 8], [24, 5]] as [number, number][]) g.set(ox + x, y, (x + y) % 2 ? 'D' : 'G');
  // Face in three-quarter: a shadowed brow, the eye, the line of the nose and the set mouth.
  g.set(ox + 28, 8, 'D').set(ox + 29, 8, 'D').set(ox + 28, 9, 'd');
  g.set(ox + 31, 10, 'g').set(ox + 30, 11, 'G').set(ox + 29, 13, 'D').set(ox + 30, 13, 'G');
  // Collarbones, chest and the abdomen, cut in shadow.
  g.line(ox + 16, 21, ox + 21, 22, 'G').line(ox + 26, 22, ox + 31, 21, 'G');
  g.line(ox + 15, 30, ox + 21, 31, 'G').line(ox + 25, 31, ox + 30, 30, 'D');
  g.line(ox + 23, 32, ox + 23, 42, 'G');
  for (const y of [35, 38, 41]) g.set(ox + 20, y, 'G').set(ox + 26, y, 'D');
  g.line(ox + 15, 45, ox + 20, 51, 'G').line(ox + 31, 45, ox + 26, 51, 'D');
  // Knees.
  g.set(ox + 15, 66, 'G').set(ox + 17, 66, 'D').set(ox + 30, 66, 'G').set(ox + 32, 66, 'D');
  // The sling: over the left shoulder from the raised hand, and its end trailing from the stone hand.
  g.line(ox + 31, 20, ox + 27, 16, 'B').line(ox + 27, 16, ox + 22, 18, 'b');
  g.line(ox + 6, 56, ox + 8, 62, 'B').line(ox + 8, 62, ox + 7, 66, 'b');
  g.set(ox + 6, 54, 'D').set(ox + 5, 55, 'd');
  // Bark lines on the stump.
  g.line(ox + 7, 66, ox + 7, 84, 'G').line(ox + 9, 70, ox + 9, 80, 'D');

  // The plinth: a slab, a moulded body with an inscription line, a wide base.
  g.rect(1, 88, 50, 3, 'g').rect(1, 88, 50, 1, 'w');
  g.rect(4, 91, 44, 6, 'G').rect(4, 91, 2, 6, 'g').rect(46, 91, 2, 6, 'D');
  g.rect(12, 93, 28, 1, 'D').set(16, 93, 'y').set(26, 93, 'y').set(36, 93, 'y');
  g.rect(0, 97, 52, 3, 'D').rect(0, 97, 52, 1, 'g');
  return g;
}

/** Temple ruins on the skyline: a broken colonnade with part of its entablature and pediment. 150 x 74. */
export function temple(): Grid {
  const g = new Grid(150, 74);
  // Hills behind.
  for (let x = 0; x < 150; x++) {
    const h = 52 + Math.round(Math.sin(x * 0.05) * 4 + Math.sin(x * 0.17) * 2);
    g.rect(x, h, 1, 74 - h, 'h');
  }
  // Steps of the stylobate.
  g.rect(6, 66, 120, 3, 'k').rect(2, 69, 128, 5, 'k').rect(6, 66, 120, 1, 'e').rect(2, 69, 128, 1, 'e');
  // Columns: fluted shafts with capitals; some stand to full height, some are broken off.
  const cols: [number, number][] = [[12, 18], [32, 18], [52, 18], [72, 30], [92, 44], [112, 22]];
  for (const [x, top] of cols) {
    g.rect(x, top, 8, 66 - top, 'k');
    g.rect(x + 1, top, 1, 66 - top, 'e');
    for (let f = x + 3; f < x + 8; f += 2) g.rect(f, top + 2, 1, 64 - top, 'h');
    if (top === 18) g.rect(x - 2, top - 3, 12, 3, 'k').rect(x - 2, top - 3, 12, 1, 'e');
    else {
      // A broken top, jagged.
      g.set(x, top - 1, 'k').set(x + 2, top - 2, 'k').set(x + 3, top - 1, 'k').set(x + 6, top - 1, 'k');
    }
  }
  // What is left of the entablature and the pediment over the first three columns.
  g.rect(8, 9, 56, 6, 'k').rect(8, 9, 56, 1, 'e');
  for (let x = 10; x < 62; x += 4) g.rect(x, 11, 2, 3, 'h');
  g.tri(8, 9, 50, 9, 30, 0, 'k').line(8, 9, 30, 0, 'e');
  // Its broken end, and a fallen drum at the foot of the colonnade.
  g.tri(50, 9, 64, 9, 64, 4, '.');
  g.ellipse(134, 66, 7, 4, 'k').ellipse(134, 66, 7, 1, 'e');
  return g;
}

/** The terrace the statue stands on: worn marble slabs, a fallen capital, a laurel sprig. 220 x 22. */
export function terrace(): Grid {
  const g = new Grid(220, 22);
  g.rect(0, 6, 220, 16, 'k');
  g.rect(0, 6, 220, 1, 'e');
  for (let x = 0; x < 220; x += 26) g.rect(x, 7, 1, 15, 'h');
  for (let x = 13; x < 220; x += 26) g.rect(x, 14, 1, 8, 'h');
  g.rect(0, 13, 220, 1, 'h');
  // A fallen Ionic capital with its scrolls.
  g.rect(36, 0, 20, 6, 'k').rect(36, 0, 20, 1, 'e').ellipse(36, 3, 3, 3, 'k').ellipse(56, 3, 3, 3, 'k').set(36, 3, 'e').set(56, 3, 'e');
  // A laurel sprig.
  g.line(84, 6, 98, 2, 'l');
  for (const [x, y] of [[87, 4], [90, 3], [93, 2], [96, 1], [88, 6], [92, 5], [95, 4]] as [number, number][]) g.set(x, y, 'L');
  return g;
}
