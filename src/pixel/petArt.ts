import { Grid } from './draw';

/** The same Endesga 32 palette and one-pixel ink outline as the dungeon cast. */
export const PET_ART_KINDS = ['hound', 'dove', 'swan', 'pig', 'cow', 'sheep', 'chicken', 'rabbit', 'fox'] as const;
export type PetArtKind = (typeof PET_ART_KINDS)[number];
export type PetAction = 'idle' | 'walk' | 'attack';

interface Pose {
  action: PetAction;
  frame: number;
  bob: number;
  rear: number;
  front: number;
  lift: number;
  strike: boolean;
  windup: boolean;
}

const pose = (action: PetAction, frame: number): Pose => ({
  action,
  frame,
  bob: action === 'walk' ? [0, -1, 0, 1][frame % 4] : action === 'attack' && frame === 0 ? 1 : 0,
  rear: action === 'walk' ? [-2, 0, 2, 0][frame % 4] : action === 'attack' ? [-1, -2, 0][frame % 3] : 0,
  front: action === 'walk' ? [2, 0, -2, 0][frame % 4] : action === 'attack' ? [-1, 2, 0][frame % 3] : 0,
  lift: action === 'walk' && frame % 2 === 1 ? 1 : 0,
  strike: action === 'attack' && frame === 1,
  windup: action === 'attack' && frame === 0,
});

function legs(g: Grid, p: Pose, rear: number, front: number, top: number, coat: string, hoof: string) {
  // The far pair is one pixel shorter and shaded. Opposed near legs describe a full four-frame gait.
  g.line(rear + 2, top, rear + 2 - p.rear, 16 - p.lift, hoof);
  g.line(front - 2, top, front - 2 - p.front, 16 - p.lift, hoof);
  g.line(rear, top, rear + p.rear, 17 - p.lift, coat).rect(rear + p.rear, 17 - p.lift, 2, 2, hoof);
  g.line(front, top, front + p.front, 17, coat).rect(front + p.front, 17, 2, 2, hoof);
}

function hound(g: Grid, p: Pose) {
  const b = p.bob;
  const hx = p.strike ? 19 : p.windup ? 16 : 18;
  const hy = p.strike ? 10 : 8 + b;
  legs(g, p, 6, 15, 13 + b, 't', 'B');
  g.line(4, 12 + b, 2, p.frame % 2 ? 7 : 8, 't').set(2, p.frame % 2 ? 6 : 7, 'T');
  g.ellipse(10, 12 + b, 6, 3, 't').rect(6, 14 + b, 9, 1, 'b');
  g.ellipse(14, 10 + b, 3, 4, 't').rect(12, 12 + b, 4, 2, 'T');
  g.ellipse(hx, hy, 3, 3, 't').rect(hx - 2, hy - 3, 2, 4, 'B');
  g.set(hx - 2, hy - 3, 'b').set(hx + 1, hy - 1, 'e');
  g.rect(hx, hy + 1, 4, 2, 'T').set(hx + 3, hy + 1, 'e');
  if (p.strike) {
    g.rect(hx, hy + 3, 4, 2, 'B').set(hx + 2, hy + 3, 'w').rect(hx, hy + 5, 3, 1, 't');
  } else if (p.action === 'idle' && p.frame === 1) {
    g.set(hx + 2, hy + 3, 'p');
  }
  g.line(14, hy + 3, 17, hy + 4, 'r').set(16, hy + 5, 'Y');
}

function pig(g: Grid, p: Pose) {
  const b = p.bob;
  const hx = p.strike ? 19 : 17;
  const hy = p.strike ? 12 : 10 + b;
  legs(g, p, 6, 15, 13 + b, 'p', 'B');
  // A readable little curl rather than a straight mammal tail.
  g.line(5, 11 + b, 2, 10 + b, 'p').set(1, 9 + b, 'p').rect(1, 7 + b, 3, 1, 'p');
  g.set(3, 8 + b, 'p').set(2, p.frame % 2 ? 8 + b : 9 + b, 'P');
  g.ellipse(10, 12 + b, 6, 4, 'p').rect(6, 14 + b, 9, 2, 'P');
  g.line(7, 9 + b, 11, 8 + b, 's').set(6, 10 + b, 's');
  g.ellipse(hx, hy, 4, 4, 'p');
  g.tri(hx - 3, hy - 2, hx - 3, hy - 6 + (p.frame % 2), hx, hy - 3, 'p');
  g.set(hx - 2, hy - 4 + (p.frame % 2), 'P');
  g.set(hx + 1, hy - 1, 'e').rect(hx + 1, hy + 1, 4, 3, 's');
  g.set(hx + 2, hy + 2, 'P').set(hx + 4, hy + 2, 'P');
  if (p.strike) g.line(hx, hy + 4, hx + 2, hy + 4, 'P');
}

function cow(g: Grid, p: Pose) {
  const b = p.bob;
  const hx = p.strike ? 19 : 17;
  const hy = p.strike ? 11 : 8 + b;
  legs(g, p, 6, 15, 13 + b, 'w', 'B');
  g.line(4, 9 + b, 2, 14 + b, 'g').rect(1, p.frame % 2 ? 13 + b : 14 + b, 2, 2, 'B');
  g.ellipse(10, 11 + b, 6, 4, 'w').rect(6, 14 + b, 9, 1, 'g');
  g.ellipse(7, 10 + b, 2, 2, 'n').rect(12, 8 + b, 2, 3, 'n').set(13, 11 + b, 'n');
  g.rect(9, 15 + b, 3, 1, 'p');
  g.ellipse(hx, hy + 1, 3, 4, 'w').rect(hx - 2, hy - 1, 2, 3, 'n');
  g.line(hx - 2, hy - 2, hx - 3, hy - 4, 'T').set(hx - 3, hy - 5, 'w');
  g.line(hx + 1, hy - 2, hx + 2, hy - 4, 'T').set(hx + 3, hy - 4, 'w');
  g.line(hx - 3, hy, hx - 5, hy - 1 + (p.frame % 2), 'g').set(hx - 4, hy, 'p');
  g.set(hx + 1, hy, 'e').rect(hx, hy + 3, 5, 2, 'p');
  g.set(hx + 1, hy + 4, 'P').set(hx + 3, hy + 4, 'P');
  g.line(hx - 2, hy + 4, hx, hy + 5, 'r').rect(hx - 2, hy + 6, 2, 2, 'Y').set(hx - 1, hy + 8, 'y');
}

function sheep(g: Grid, p: Pose) {
  const b = p.bob;
  const hx = p.strike ? 20 : 18;
  const hy = p.strike ? 12 : 10 + b;
  legs(g, p, 7, 15, 13 + b, 'b', 'B');
  g.ellipse(3, 11 + b + (p.frame % 2), 2, 2, 'T');
  g.ellipse(10, 12 + b, 6, 4, 'T');
  // Separate lobes retain the wool silhouette even at native pixel scale.
  for (const [x, y, r] of [[5, 10, 2], [7, 7, 2], [11, 7, 3], [15, 8, 2], [16, 12, 2], [7, 14, 2], [11, 15, 2]]) {
    g.ellipse(x, y + b, r, 2, 'w');
  }
  g.set(6, 12 + b, 'T').line(10, 10 + b, 12, 10 + b, 'T').set(14, 12 + b, 'T');
  g.ellipse(hx, hy + 1, 3, 3, 'b').rect(hx - 1, hy + 2, 4, 2, 't');
  g.line(hx - 2, hy, hx - 4, hy - 1 + (p.frame % 2), 't');
  g.ellipse(hx - 1, hy - 2, 3, 2, 'w').set(hx - 2, hy - 1, 'T');
  g.set(hx + 1, hy, 'e').set(hx + 3, hy + 2, 'B');
  if (p.strike) g.rect(hx, hy + 4, 3, 1, 'B');
}

function rabbit(g: Grid, p: Pose) {
  const airborne = p.action === 'walk' && p.frame === 1;
  const b = airborne ? -2 : p.bob;
  const hx = p.strike ? 19 : 17;
  const hy = p.windup ? 12 : 10 + b;
  g.ellipse(4, 13 + b, 2, 2, 'w');
  g.ellipse(10, 13 + b, 5, 4, 'g').ellipse(8, 14 + b, 3, 3, 'w');
  g.ellipse(12, 12 + b, 4, 3, 'w').rect(10, 15 + b, 4, 1, 'G');
  if (airborne || p.strike) {
    g.line(7, 15 + b, 4, 17 + b, 'g').rect(3, 17 + b, 3, 1, 'w');
    g.line(15, 13 + b, 18, 15 + b, 'g').rect(18, 15 + b, 3, 1, 'w');
  } else {
    g.ellipse(9 + p.rear, 17, 3, 1, 'w').rect(14 + p.front, 15, 2, 3, 'g').rect(14 + p.front, 18, 3, 1, 'w');
  }
  // The rear ear folds on the pause; the leading ear stretches into the hop.
  g.line(hx - 3, hy - 2, hx - 5 - (p.frame % 2), hy - 8 + (p.windup ? 2 : 0), 'g');
  g.line(hx - 2, hy - 2, hx - 4 - (p.frame % 2), hy - 8 + (p.windup ? 2 : 0), 'g');
  g.line(hx - 1, hy - 2, hx + (p.strike ? 1 : -1), hy - 8, 'w');
  g.line(hx, hy - 2, hx + (p.strike ? 2 : 0), hy - 7, 'w');
  g.line(hx, hy - 3, hx + (p.strike ? 1 : -1), hy - 6, 'p');
  g.ellipse(hx, hy, 3, 3, 'w').rect(hx - 2, hy + 2, 3, 1, 'g');
  g.set(hx + 1, hy - 1, 'e').set(hx + 3, hy + 1, 'p').set(hx + 2, hy + 2, 'g');
}

function fox(g: Grid, p: Pose) {
  const b = p.bob;
  const hx = p.strike ? 19 : p.windup ? 16 : 18;
  const hy = p.strike ? 9 : 8 + b;
  legs(g, p, 8, 16, 13 + b, 'O', 'B');
  // A thick, cream-tipped tail swings around a bent joint, never as a translated cutout.
  const tailY = p.frame % 2 ? 7 : 10;
  g.line(7, 13 + b, 3, 12, 'b').ellipse(3, tailY + 2, 2, 4, 'O');
  g.tri(1, tailY + 1, 4, tailY + 1, 1, tailY - 3, 'T').set(2, tailY - 2, 'w');
  g.ellipse(11, 12 + b, 5, 3, 'O').line(8, 14 + b, 15, 14 + b, 'b');
  g.ellipse(15, 10 + b, 3, 3, 'O').rect(14, 11 + b, 3, 3, 'T');
  g.ellipse(hx, hy, 3, 3, 'O');
  g.tri(hx - 3, hy - 2, hx - 3, hy - 6, hx, hy - 3, 'O').set(hx - 2, hy - 3, 'B');
  g.tri(hx, hy - 2, hx + 1, hy - 5, hx + 2, hy - 2, 'O').set(hx + 1, hy - 3, 'B');
  g.tri(hx - 1, hy + 1, hx + 4, hy + 1, hx + 1, hy + 3, 'T').set(hx + 4, hy + 1, 'e');
  g.set(hx + 1, hy - 1, 'e').set(hx - 1, hy - 2, 't');
  if (p.strike) g.rect(hx + 1, hy + 3, 3, 1, 'r').set(hx + 2, hy + 4, 'Y');
}

function dove(g: Grid, p: Pose) {
  const b = p.bob;
  const wing = p.action === 'walk' ? [3, 8, 16, 9][p.frame % 4] : p.action === 'attack' ? [5, 1, 11][p.frame % 3] : [6, 9][p.frame % 2];
  g.tri(9, 13 + b, 2, 10 + b, 4, 15 + b, 'g').line(3, 11 + b, 6, 12 + b, 'w');
  g.tri(11, 12 + b, 7, wing + 1, 14, 10 + b, 'G');
  g.ellipse(12, 12 + b, 5, 3, 'g').ellipse(14, 11 + b, 3, 3, 'w');
  g.ellipse(17, 8 + b + (p.strike ? -1 : 0), 3, 3, 'w');
  g.set(18, 7 + b + (p.strike ? -1 : 0), 'e').line(20, 9 + b, 22, 9 + b, 'y');
  g.tri(10, 12 + b, 6, wing, 16, 11 + b, 'w');
  g.line(7, wing + (wing < 12 ? 1 : -1), 10, 12 + b, 'g');
  g.line(11, 15 + b, 10 + p.rear, 16 + b, 'y').line(14, 15 + b, 14 + p.front, 16 + b, 'y');
  if (p.strike) g.set(21, 8 + b, 'Y');
}

function swan(g: Grid, p: Pose) {
  const b = p.bob;
  const wing = p.action === 'walk' ? [8, 4, 10, 13][p.frame % 4] : p.action === 'attack' ? [8, 2, 5][p.frame % 3] : [10, 9][p.frame % 2];
  g.tri(7, 15 + b, 1, 11 + b, 3, 15 + b, 'w');
  g.ellipse(10, 14 + b, 7, 3, 'w').line(5, 17 + b, 14, 17 + b, 'g');
  g.tri(7, 14 + b, 8, wing, 15, 13 + b, 'g');
  g.tri(6, 13 + b, 7, wing - 1, 14, 12 + b, 'w');
  g.line(8, wing + 1, 10, 13 + b, 'g');
  // A curved long neck remains recognizable through the guarding wing strike.
  const lean = p.strike ? 2 : p.windup ? -1 : 0;
  g.line(15, 14 + b, 17, 10 + b, 'g').line(16, 14 + b, 18, 10 + b, 'w');
  g.line(17, 10 + b, 17 + lean, 6 + b, 'w').line(18, 10 + b, 18 + lean, 6 + b, 'w');
  g.ellipse(18 + lean, 5 + b, 2, 2, 'w').set(19 + lean, 5 + b, 'e');
  g.line(20 + lean, 6 + b, 22 + (p.strike ? 1 : 0), 6 + b, 'O');
  g.set(20 + lean, 5 + b, 'B');
  if (p.action === 'walk') g.line(11, 18, 11 + p.front, 18, 'y');
}

function chicken(g: Grid, p: Pose) {
  const b = p.bob;
  const hx = p.strike ? 20 : p.windup ? 16 : 17;
  const hy = p.strike ? 10 : 7 + b;
  g.line(10, 13 + b, 9 + p.rear, 18 - p.lift, 'y').line(14, 13 + b, 15 + p.front, 18, 'y');
  g.line(8 + p.rear, 18 - p.lift, 11 + p.rear, 18 - p.lift, 'y').line(14 + p.front, 18, 17 + p.front, 18, 'y');
  g.tri(9, 12 + b, 3, 5 + (p.frame % 2), 4, 13 + b, 'b');
  g.line(4, 7 + (p.frame % 2), 7, 13 + b, 'O').line(6, 7, 8, 12 + b, 'y');
  g.ellipse(12, 12 + b, 5, 4, 'T').line(9, 15 + b, 14, 15 + b, 't');
  g.ellipse(15, 9 + b, 3, 4, 'T').ellipse(hx, hy, 3, 3, 'T');
  g.line(hx - 2, hy - 3, hx + 1, hy - 3, 'r').set(hx - 2, hy - 5, 'r').set(hx, hy - 5, 'r').set(hx + 1, hy - 4, 'r');
  g.set(hx + 1, hy - 1, 'e').line(hx + 3, hy + 1, hx + 4, hy + 1, 'y');
  g.line(hx + 1, hy + 3, hx + 1, hy + 4, 'r');
  if (p.strike || (p.action === 'walk' && p.frame % 2 === 1)) {
    g.tri(10, 12 + b, 7, 6 + b, 15, 10 + b, 't').line(8, 7 + b, 11, 11 + b, 'T');
  } else {
    g.ellipse(10, 12 + b, 3, 2, 't').line(8, 11 + b, 11, 11 + b, 'T').set(9, 13 + b, 'b');
  }
}

const painters: Record<PetArtKind, (g: Grid, p: Pose) => void> = { hound, dove, swan, pig, cow, sheep, chicken, rabbit, fox };

/** Stable 24 × 20 frame bounds keep feet and sprite anchors from jittering between poses. */
export function petArt(kind: PetArtKind, action: PetAction, frame: number): Grid {
  const g = new Grid(24, 20);
  painters[kind](g, pose(action, frame));
  return g;
}

/** Exported for the game texture registry and an offline contact-sheet preview. */
export function petTextureFrames(kind: PetArtKind): Record<string, HTMLCanvasElement> {
  const frames: Record<string, HTMLCanvasElement> = {};
  for (const [action, count] of [['idle', 2], ['walk', 4], ['attack', 3]] as const) {
    for (let i = 0; i < count; i++) frames[`pet-${kind}-${action}-${i}`] = petArt(kind, action, i).render();
  }
  frames[`pet-${kind}`] = frames[`pet-${kind}-idle-0`];
  return frames;
}

export function petProjectileArt(kind: 'egg' | 'ember'): Grid {
  return kind === 'egg'
    ? Grid.ascii(['..ww..', '.wTTw.', 'wwTTww', 'wTTTTg', '.gggg.'])
    : Grid.ascii(['....Y..', '..YYO..', '.YwwYO.', 'YwwYYOr', '.YYOOr.', '..rr...']);
}
