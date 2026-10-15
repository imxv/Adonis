export const ARENA = {
  w: 1280,
  h: 720,
  wall: 46,
  get left() {
    return this.wall;
  },
  get right() {
    return this.w - this.wall;
  },
  get top() {
    return this.wall + 18;
  },
  get bottom() {
    return this.h - this.wall;
  },
  doorY: 40,
  doorXs: [460, 820],
  doorSingleX: 640,
};

export const clampToArena = (x: number, y: number, r: number): [number, number] => [
  Math.max(ARENA.left + r, Math.min(ARENA.right - r, x)),
  Math.max(ARENA.top + r, Math.min(ARENA.bottom - r, y)),
];
