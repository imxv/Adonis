/** Room geometry in world pixels. The view is 640x360; rooms are larger so hordes can come from off-screen. */
export const ARENA = {
  w: 1024,
  h: 640,
  left: 16,
  right: 1008,
  top: 56,
  bottom: 624,
  doorY: 34,
  doorXs: [400, 624],
  doorSingleX: 512,
};

export const VIEW = { w: 640, h: 360 };

export const clampToArena = (x: number, y: number, r: number): [number, number] => [
  Math.max(ARENA.left + r, Math.min(ARENA.right - r, x)),
  Math.max(ARENA.top + r, Math.min(ARENA.bottom - r, y)),
];
