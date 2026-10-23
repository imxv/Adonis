import { outlineCanvas, pxText } from '../pixel/draw';

/**
 * Name plates that belong to the hall's furniture: a crimson sash across the main painting,
 * brass plaques on frames and plinths, and wooden signs for the courtyard-side activities.
 * Each is painted at the hall's source resolution and drawn at the same 2× as the room.
 */
export type SignStyle = 'ribbon' | 'brass' | 'post' | 'board' | 'hanging';
export type SignIcon = 'fish' | 'leaf' | 'pot' | 'sword';

export interface SignArt {
  /** Resting art, and highlighted art that carries a one-pixel halo on every side. */
  frames: [HTMLCanvasElement, HTMLCanvasElement];
  /** Source pixel that sits on the sign's world anchor. */
  ax: number;
  ay: number;
  /** Source-pixel centre and top edge of the plate, where the highlight chevron hovers. */
  cx: number;
  top: number;
}

type Ctx = CanvasRenderingContext2D;

const INK = '#2b170c';
const PARCHMENT = '#f6e7c8';
const ICONS: Record<SignIcon, string[]> = {
  fish: [
    '..###...',
    '.#####.#',
    '#.######',
    '.#####.#',
    '..###...',
  ],
  leaf: [
    '....###',
    '..#####',
    '.####.#',
    '.###.##',
    '.#.###.',
    '#......',
  ],
  pot: [
    '.#..#..',
    '..#..#.',
    '#######',
    '.#####.',
    '..###..',
  ],
  sword: [
    '..#..',
    '..#..',
    '..#..',
    '..#..',
    '#####',
    '..#..',
    '.###.',
  ],
};

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function box(c: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}

function icon(c: Ctx, name: SignIcon, x: number, y: number): void {
  ICONS[name].forEach((row, j) => [...row].forEach((cell, i) => {
    if (cell !== '#') return;
    box(c, x + i + 1, y + j + 1, 1, 1, INK);
    box(c, x + i, y + j, 1, 1, PARCHMENT);
  }));
}

/** A plank with chamfered corners, end-grain shading and two nails. */
function plank(c: Ctx, x: number, y: number, w: number, h: number, lit: boolean): void {
  box(c, x + 1, y, w - 2, h, lit ? '#e7bf76' : INK);
  box(c, x, y + 1, w, h - 2, lit ? '#e7bf76' : INK);
  box(c, x + 1, y + 1, w - 2, h - 2, lit ? '#b0733f' : '#9c6337');
  box(c, x + 1, y + 1, w - 2, 1, lit ? '#e0a066' : '#c48650');
  box(c, x + 1, y + 2, w - 2, 1, lit ? '#c4884f' : '#b07445');
  box(c, x + 1, y + h - 2, w - 2, 1, '#6e4222');
  for (let i = 0; i < Math.floor(w / 9); i++) {
    const gx = x + 4 + ((i * 13 + 5) % (w - 10));
    box(c, gx, y + 4 + (i % 3) * 3 % (h - 6), 5 + i % 3, 1, '#87532d');
  }
  for (const nx of [x + 3, x + w - 4]) {
    box(c, nx, y + 3, 1, 1, '#3a2a22');
    box(c, nx, y + 4, 1, 1, '#d8c8b0');
  }
}

function ribbon(title: string, lit: boolean): SignArt {
  const text = pxText(title, { size: 24, color: lit ? '#fff4c8' : '#ffe6a2', shadow: '#4a0f1e' });
  const bw = text.width + 30, bh = text.height + 10;
  const tail = 24, drop = 7, tuck = 10;
  const bx = tail - tuck, W = bw + 2 * bx, H = bh + drop + 1;
  const [out, c] = canvas(W, H);
  const half = (bh - 1) / 2;
  // Swallowtail ends hang behind the sash and slightly lower, folded under it.
  for (let y = 0; y < bh; y++) {
    const notch = Math.round(8 * (1 - Math.abs(y - half) / half));
    const color = y === 0 || y === bh - 1 ? '#8a5a26' : y < 3 ? '#8f2639' : '#6e1c2e';
    box(c, notch, drop + y, tail - notch, 1, color);
    box(c, W - tail, drop + y, tail - notch, 1, color);
  }
  box(c, bx, bh, tuck, drop, '#3a0d18');
  box(c, W - bx - tuck, bh, tuck, drop, '#3a0d18');
  box(c, bx, 0, bw, bh, '#8f2639');
  box(c, bx, 0, bw, 1, '#5a3a18');
  box(c, bx, 1, bw, 1, lit ? '#ffe6a2' : '#c49343');
  box(c, bx, 2, bw, 1, lit ? '#d24a5e' : '#b8384c');
  box(c, bx, bh - 3, bw, 1, '#6e1c2e');
  box(c, bx, bh - 2, bw, 1, lit ? '#ffe6a2' : '#c49343');
  box(c, bx, bh - 1, bw, 1, '#5a3a18');
  // Gold diamonds pin the sash at both ends.
  for (const x of [bx + 7, W - bx - 8]) {
    const y = Math.floor(bh / 2);
    box(c, x - 1, y - 2, 3, 5, '#5a3a18');
    box(c, x - 2, y - 1, 5, 3, '#5a3a18');
    box(c, x, y - 1, 1, 3, lit ? '#fff4c8' : '#ffe6a2');
    box(c, x - 1, y, 3, 1, lit ? '#fff4c8' : '#ffe6a2');
  }
  c.drawImage(text, bx + Math.floor((bw - text.width) / 2), Math.floor((bh - text.height) / 2) + 1);
  return { frames: [out, out], ax: Math.floor(W / 2), ay: Math.floor(bh / 2), cx: Math.floor(W / 2), top: 0 };
}

function brass(title: string, lit: boolean): SignArt {
  const text = pxText(title, { color: '#3b2414', shadow: lit ? '#fff8d8' : '#f6dc98' });
  const w = text.width + 18, h = text.height + 8;
  const [out, c] = canvas(w + 2, h + 3);
  box(c, 2, h + 1, w - 2, 2, '#14101c99');
  box(c, 1, 0, w, h + 2, '#2a1a10');
  box(c, 0, 1, w + 2, h, '#2a1a10');
  box(c, 1, 1, w, h, lit ? '#ecc066' : '#d9a84e');
  box(c, 1, 1, w, 1, '#fff0b8');
  box(c, 1, 1, 1, h, '#f6dc98');
  box(c, 1, h, w, 1, '#8a5a26');
  box(c, w, 1, 1, h, '#a5762f');
  for (const [x, y] of [[3, 3], [w - 3, 3], [3, h - 2], [w - 3, h - 2]]) {
    box(c, x, y, 1, 1, '#7a5222');
    box(c, x - 1, y - 1, 1, 1, '#fff0b8');
  }
  c.drawImage(text, 10, 4);
  return { frames: [out, out], ax: Math.floor((w + 2) / 2), ay: Math.floor((h + 2) / 2), cx: Math.floor((w + 2) / 2), top: 0 };
}

function post(title: string, lit: boolean, mark?: SignIcon): SignArt {
  const text = pxText(title, { color: PARCHMENT, outline: INK });
  const iw = mark ? 11 : 0;
  const w = text.width + iw + 14, h = text.height + 6, stake = 22;
  const W = w, H = h + stake;
  const [out, c] = canvas(W, H);
  const px = Math.floor(W / 2) - 2;
  box(c, px - 1, h - 1, 6, stake + 1, INK);
  box(c, px, h - 1, 4, stake, '#6b4224');
  box(c, px, h - 1, 1, stake, '#8a5a32');
  box(c, px + 3, h - 1, 1, stake, '#4a2c16');
  box(c, px - 3, H - 2, 10, 2, '#3a2414');
  plank(c, 0, 0, w, h, lit);
  if (mark) icon(c, mark, 6, Math.floor((h - ICONS[mark].length) / 2));
  c.drawImage(text, 7 + iw, Math.floor((h - text.height) / 2) + 1);
  return { frames: [out, out], ax: px + 2, ay: H - 1, cx: Math.floor(W / 2), top: 0 };
}

function board(title: string, lit: boolean): SignArt {
  const text = pxText(title, { color: PARCHMENT, outline: INK });
  const w = Math.max(text.width + 16, 66), header = text.height + 6, face = 22, legs = 20;
  const H = header + face + legs;
  const [out, c] = canvas(w, H);
  for (const lx of [5, w - 9]) {
    box(c, lx - 1, header, 6, face + legs, INK);
    box(c, lx, header, 4, face + legs - 1, '#6b4224');
    box(c, lx, header, 1, face + legs - 1, '#8a5a32');
    box(c, lx - 2, H - 2, 8, 2, '#3a2414');
  }
  // Cork face with pinned requests from the residents.
  box(c, 1, header - 1, w - 2, face + 2, INK);
  box(c, 2, header, w - 4, face, '#5c3a1e');
  box(c, 4, header + 1, w - 8, face - 3, '#b5875a');
  for (let i = 0; i < 18; i++) box(c, 5 + (i * 17) % (w - 11), header + 2 + (i * 7) % (face - 5), 1, 1, '#9a6e46');
  const notes: [number, number, string][] = [[9, 3, '#c84848'], [Math.floor(w / 2) - 5, 2, '#4a7ab8'], [w - 20, 4, '#5c9a4a']];
  for (const [nx, ny, pin] of notes) {
    box(c, nx + 1, header + ny + 1, 10, 12, '#5c3a1e88');
    box(c, nx, header + ny, 10, 12, '#ead4aa');
    for (let r = 4; r < 11; r += 2) box(c, nx + 2, header + ny + r, 6 - (r % 4), 1, '#a08a6a');
    box(c, nx + 4, header + ny, 2, 2, pin);
  }
  plank(c, 0, 0, w, header, lit);
  c.drawImage(text, Math.floor((w - text.width) / 2), Math.floor((header - text.height) / 2) + 1);
  return { frames: [out, out], ax: Math.floor(w / 2), ay: H - 1, cx: Math.floor(w / 2), top: 0 };
}

/** A plank hung on two chains from a wrought-iron arm fixed to the column on its right. */
function hanging(title: string, lit: boolean, mark?: SignIcon): SignArt {
  const text = pxText(title, { color: PARCHMENT, outline: INK });
  const iw = mark ? 11 : 0;
  const w = text.width + iw + 14, h = text.height + 6, reach = 14, drop = 7;
  const W = w + reach, H = drop + h;
  const [out, c] = canvas(W, H);
  box(c, 2, 1, W - 2, 2, '#2e2a36');
  box(c, 2, 1, W - 2, 1, '#5d5a6e');
  box(c, 0, 0, 3, 3, '#2e2a36');
  box(c, 1, 1, 1, 1, '#8a879a');
  box(c, W - 3, 0, 3, 8, '#2e2a36');
  box(c, W - 2, 1, 1, 6, '#5d5a6e');
  // A diagonal strut braces the arm against the wall plate.
  for (let i = 0; i < 6; i++) box(c, W - 4 - i * 2, 7 - i, 2, 1, '#2e2a36');
  for (const x of [5, w - 6]) for (let y = 3; y < drop; y++) box(c, x, y, 1, 1, y % 2 ? '#8a879a' : '#2e2a36');
  plank(c, 0, drop, w, h, lit);
  if (mark) icon(c, mark, 6, drop + Math.floor((h - ICONS[mark].length) / 2));
  c.drawImage(text, 7 + iw, drop + Math.floor((h - text.height) / 2) + 1);
  return { frames: [out, out], ax: W - 1, ay: 1, cx: Math.floor(w / 2), top: drop };
}

const PAINTERS: Record<SignStyle, (title: string, lit: boolean, mark?: SignIcon) => SignArt> = { ribbon, brass, post, board, hanging };

export function createSign(style: SignStyle, title: string, mark?: SignIcon): SignArt {
  const rest = PAINTERS[style](title, false, mark);
  const lit = PAINTERS[style](title, true, mark).frames[0];
  // The highlighted sign gains a gold halo so it reads as selected from across the hall.
  const [halo, c] = canvas(lit.width + 2, lit.height + 2);
  c.drawImage(lit, 1, 1);
  outlineCanvas(halo, '#ffe6a2');
  lit.width = lit.height = 1;
  return { ...rest, frames: [rest.frames[0], halo] };
}

/** A gold chevron that bobs above a highlighted sign, its tip at (x, y). */
export function drawSignChevron(c: Ctx, x: number, y: number, unit: number): void {
  const widths = [11, 9, 7, 5, 3, 1];
  const top = y - widths.length * unit;
  widths.forEach((width, row) => box(c, x - (width + 2) * unit / 2, top + (row - 1) * unit, (width + 2) * unit, unit * 2, INK));
  widths.forEach((width, row) => box(c, x - width * unit / 2, top + row * unit, width * unit, unit, row === 0 ? '#fff4c8' : row < 3 ? '#e7bf76' : '#c49343'));
}
