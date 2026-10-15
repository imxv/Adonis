/** One room fills the 640x360 screen, Binding of Isaac style. */
export const ARENA = {
  w: 640,
  h: 360,
  left: 24,
  right: 616,
  top: 52,
  bottom: 334,
  cx: 320,
  cy: 193,
};

export const VIEW = { w: 640, h: 360 };

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
export const DIR_VEC: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** Door centres on the wall line, and where the player appears when entering through them. */
export const DOOR = {
  half: 15,
  pos: { up: [320, 40], down: [320, 344], left: [12, 193], right: [628, 193] } as Record<Dir, [number, number]>,
  entry: { up: [320, 74], down: [320, 312], left: [48, 193], right: [592, 193] } as Record<Dir, [number, number]>,
};

export const clampToArena = (x: number, y: number, r: number): [number, number] => [
  Math.max(ARENA.left + r, Math.min(ARENA.right - r, x)),
  Math.max(ARENA.top + r, Math.min(ARENA.bottom - r, y)),
];
