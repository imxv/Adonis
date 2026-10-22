import { PixelPainter, commissionHash } from './pixel-art-primitives';

type Ctx = CanvasRenderingContext2D;
const W = 480, H = 320;
const LEAF = ['#264b3f', '#3b6a48', '#578452', '#7f9c61', '#b0bc79'];

function foliage(p: PixelPainter, x: number, y: number, rx: number, ry: number, seed: number, flowers = false) {
  p.oval(x + 2, y + 3, rx + 2, ry + 1, LEAF[0]);
  for (let i = 0; i < 13; i++) {
    const h = commissionHash(seed, i), a = i * 2.399;
    const xx = Math.round(x + Math.cos(a) * rx * ((h % 65 + 15) / 100));
    const yy = Math.round(y + Math.sin(a) * ry * ((h % 70 + 10) / 100));
    const ww = 3 + h % Math.max(4, Math.round(rx / 2)), hh = 2 + h % Math.max(3, Math.round(ry / 2));
    p.oval(xx, yy, ww, hh, LEAF[1 + i % 3]);
    p.rect(xx - Math.floor(ww / 2), yy - hh, Math.max(2, ww), 1, i % 2 ? LEAF[3] : LEAF[4]);
    if (flowers && i % 3 === 0) {
      p.rect(xx - 1, yy - 2, 3, 1, '#d6a0a0'); p.rect(xx, yy - 3, 1, 3, '#dcad9b'); p.rect(xx, yy - 2, 1, 1, '#f0db95');
    }
  }
}
function pot(p: PixelPainter, x: number, y: number, r: number, h: number, seed: number, flowers = false) {
  p.oval(x + 2, y + h + 1, r + 3, 2, '#50684e68');
  p.poly([[x - r, y], [x + r, y], [x + r - 2, y + h - 3], [x + r - 5, y + h], [x - r + 5, y + h], [x - r + 2, y + h - 3]], '#975b43');
  p.poly([[x - r + 1, y + 1], [x - 2, y + 1], [x - 2, y + h], [x - r + 5, y + h], [x - r + 2, y + h - 3]], '#bf8256');
  p.rect(x - r + 3, y + 4, 2, h - 8, '#dfa875');
  p.line(x - r + 3, y + h - 4, x + r - 3, y + h - 4, '#754735');
  p.oval(x, y, r + 1, 3, '#daaa77'); p.oval(x, y, r - 2, 2, '#63563c');
  foliage(p, x, y - 7, r + 4, 8, seed, flowers);
}
function paving(ctx: Ctx, x: number, y: number, w: number, h: number, edge = true) {
  const p = new PixelPainter(ctx);
  if (edge) { p.rect(x - 3, y - 3, w + 6, h + 6, '#788265'); p.rect(x - 2, y - 2, w + 4, h + 4, '#b6ab89'); }
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  p.rect(x, y, w, h, '#a89f82');
  for (let yy = y; yy < y + h; yy += 10) for (let xx = x - 10 + (Math.floor((yy - y) / 10) % 2) * 10; xx < x + w; xx += 21) {
    const tone = commissionHash(xx, yy) % 4;
    p.rect(xx + 1, yy + 1, 19, 8, ['#cabb96', '#d9c8a1', '#c2b795', '#e1cfaa'][tone]);
    p.rect(xx + 2, yy + 1, 17, 1, '#eee0bb'); p.rect(xx + 19, yy + 3, 1, 5, '#9e9b80');
    if (tone === 1) p.line(xx + 4, yy + 5, xx + 10, yy + 6, '#b6ab8b');
  }
  ctx.restore();
}
function window(p: PixelPainter, x: number, y: number, right = false) {
  p.rect(x - 2, y - 3, 29, 31, '#bfb38d'); p.rect(x, y, 25, 25, '#435d59');
  p.rect(x + 2, y + 2, 21, 22, '#284951'); p.rect(x + 11, y + 1, 2, 23, '#a1b1a1'); p.rect(x + 1, y + 11, 23, 2, '#a1b1a1');
  for (const xx of [x - 8, x + 26]) {
    p.rect(xx, y - 1, 7, 28, right ? '#789274' : '#557f87'); p.rect(xx + 1, y, 2, 25, right ? '#a4ad80' : '#81a5a7');
    for (let yy = y + 4; yy < y + 25; yy += 5) p.line(xx + 1, yy, xx + 5, yy, right ? '#4c7258' : '#3d6671');
  }
  p.rect(x - 5, y + 26, 35, 3, '#e9d7ad'); p.rect(x - 3, y + 29, 31, 2, '#a59f81');
}
function building(p: PixelPainter, x: number, y: number, w: number, right: boolean) {
  p.rect(x + 6, y + 16, w, 117, '#698c78');
  p.rect(x, y + 11, w, 117, right ? '#d5c6a2' : '#dcd0ac');
  p.rect(x + 3, y + 12, 7, 113, '#eee0b9'); p.rect(x + w - 8, y + 17, 8, 110, '#b4b391');
  p.rect(x, y + 21, w, 4, '#eadeba');
  p.poly([[x - 5, y + 14], [x + 1, y], [x + w - 9, y - 2], [x + w + 5, y + 13]], '#9c5d44');
  p.poly([[x - 3, y + 11], [x + 3, y + 2], [x + w - 10, y], [x + w + 2, y + 11]], '#c1855b');
  for (let xx = x; xx < x + w; xx += 8) { p.line(xx, y + 4, xx - 3, y + 11, '#dfab76'); p.rect(xx - 2, y + 11, 7, 2, '#8b5c46'); }
  p.rect(x - 4, y + 13, w + 9, 3, '#6b6751');
  window(p, x + 19, y + 38, right); window(p, x + w - 45, y + 38, right);
  const dx = x + Math.floor(w / 2) - 12;
  p.oval(dx + 12, y + 99, 14, 18, '#a69c7b'); p.rect(dx - 2, y + 99, 29, 28, '#a69c7b');
  p.oval(dx + 12, y + 99, 10, 14, '#477264'); p.rect(dx + 2, y + 99, 21, 28, right ? '#4a6d50' : '#436b70');
  p.line(dx + 12, y + 89, dx + 12, y + 126, '#234d46'); p.rect(dx + 14, y + 109, 2, 2, '#d4bc7b');
  p.rect(x - 2, y + 127, w + 4, 5, '#8f997f'); p.rect(x - 3, y + 125, w + 6, 3, '#e0d0a7');
  for (let i = 0; i < 5; i++) { const xx = x + 13 + i * 22; p.rect(xx, y + 87 + i % 2 * 7, 6, 2, '#b6b490'); p.rect(xx + 5, y + 88 + i % 2 * 7, 3, 1, '#ece0b9'); }
}

/** Coastal homes and a paved gathering place, wholly local to this scene. */
export function drawCommissionGround(ctx: Ctx) {
  const p = new PixelPainter(ctx);
  p.rect(0, 0, W, H, '#8da873');
  p.rect(0, 0, W, 47, '#9cc5c5'); p.rect(0, 47, W, 31, '#428fa0'); p.rect(0, 71, W, 26, '#65abae');
  p.poly([[0, 42], [44, 22], [82, 36], [129, 17], [178, 47], [201, 38], [243, 64], [0, 66]], '#78a5a9');
  p.poly([[278, 49], [318, 29], [355, 42], [398, 21], [437, 43], [480, 35], [480, 63]], '#76a2a0');
  p.line(126, 21, 129, 17, '#c8d7c6'); p.line(129, 17, 143, 27, '#bbd0c4');
  for (let y = 52; y < 93; y += 6) for (let x = 8; x < W; x += 40) {
    const h = commissionHash(x, y); p.rect(x + h % 12, y, 6 + h % 12, 1, '#acccbe');
  }
  p.poly([[215, 71], [228, 59], [255, 64], [273, 58], [287, 71], [280, 84], [240, 82]], '#a4b8a4');
  p.rect(237, 55, 13, 11, '#ede3bd'); p.rect(251, 51, 12, 15, '#eee8c9'); p.rect(265, 55, 13, 11, '#ead7b0');
  p.oval(257, 49, 6, 4, '#56869b'); p.rect(252, 49, 11, 3, '#729fac'); p.rect(257, 61, 2, 5, '#4c7480');
  p.line(257, 42, 257, 45, '#eee3be'); p.line(255, 43, 259, 43, '#eee3be');
  p.poly([[188, 72], [189, 59], [180, 71]], '#eee2ba'); p.line(189, 59, 189, 76, '#5f807f'); p.line(180, 75, 197, 75, '#3b6a79');
  p.rect(151, 94, 179, 32, '#b9b797');
  for (let x = 155; x < 328; x += 19) {
    p.rect(x, 97, 8, 24, '#e0d5af'); p.rect(x + 2, 98, 2, 22, '#f0e4bd'); p.rect(x + 7, 98, 2, 22, '#8f9b86');
  }
  p.rect(150, 91, 182, 5, '#e9dbb5'); p.rect(150, 96, 182, 2, '#9f9e81'); p.rect(150, 121, 182, 5, '#d8cda8');
  // Grass is formed by larger fixed patches, with a few chosen flowers.
  for (let y = 140; y < H; y += 14) for (let x = 0; x < W; x += 20) {
    const h = commissionHash(x, y); p.poly([[x, y + 2], [x + 11, y], [x + 21, y + 7], [x + 15, y + 15], [x + 1, y + 12]], ['#91ad76', '#85a270', '#9ab47d', '#88a771'][h % 4]);
    if (h % 5 === 0) { p.line(x + 5, y + 10, x + 4, y + 7, '#6b8f5b'); p.line(x + 5, y + 10, x + 8, y + 6, '#b0c184'); }
  }
  building(p, 14, 44, 137, false); building(p, 330, 44, 136, true);
  paving(ctx, 45, 190, 390, 104);
  paving(ctx, 119, 165, 43, 51); paving(ctx, 318, 165, 43, 51);
  paving(ctx, 217, 124, 46, 86);
  // The meeting circle anchors the visitor; two distinct work corners flank it.
  p.oval(241, 271, 39, 19, '#a7a083'); p.oval(240, 268, 39, 19, '#e6d6af');
  p.ring(240, 268, 36, 16, '#ad9c75'); p.ring(240, 268, 30, 13, '#d1bd8e');
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    p.poly([[240, 268], [240 + Math.cos(a - .14) * 13, 268 + Math.sin(a - .14) * 6], [240 + Math.cos(a) * 24, 268 + Math.sin(a) * 11], [240 + Math.cos(a + .14) * 13, 268 + Math.sin(a + .14) * 6]], i % 2 ? '#6c8c80' : '#b99e66');
  }
  p.oval(240, 268, 4, 2, '#ead5a1');
  // Exit steps match the shared target, below the walkable approach point.
  for (let i = 0; i < 4; i++) {
    p.rect(207 - i * 2, 287 + i * 7, 66 + i * 4, 8, '#988e73');
    p.rect(207 - i * 2, 286 + i * 7, 66 + i * 4, 4, '#ded0a8'); p.rect(208 - i * 2, 286 + i * 7, 64 + i * 4, 1, '#f1e4bd');
  }
  p.rect(216, 287, 48, 4, '#65847a');
  p.line(219, 288, 223, 290, '#d4bf87'); p.line(223, 290, 227, 288, '#d4bf87');
  p.line(233, 288, 237, 290, '#d4bf87'); p.line(237, 290, 241, 288, '#d4bf87');
  p.line(247, 288, 251, 290, '#d4bf87'); p.line(251, 290, 255, 288, '#d4bf87');
  for (const [x, y, seed] of [[25, 180, 1], [455, 180, 2], [21, 267, 3], [461, 266, 4]]) pot(p, x, y, 11, 20, seed, seed > 2);
  // The porch is above the walk bounds; tree crowns shape, rather than cover, the path.
  for (const [x, y, seed] of [[28, 116, 8], [450, 116, 13]]) {
    p.rect(x - 3, y - 28, 6, 51, '#7b6c4e'); p.rect(x - 2, y - 28, 2, 49, '#a38b59');
    foliage(p, x, y - 42, 30, 21, seed, true); foliage(p, x - 5, y - 25, 23, 13, seed + 20, true);
    p.oval(x + 3, y + 22, 19, 3, '#55734b66');
  }
  // Fishing floats and a spare rod belong to the left resident, herbs to the right.
  p.line(102, 185, 117, 137, '#6d6348'); p.line(103, 184, 116, 137, '#bfaa70');
  p.line(117, 137, 122, 169, '#b0b69a'); p.rect(121, 169, 3, 5, '#cf805d'); p.rect(121, 174, 3, 3, '#ede0af');
  p.rect(82, 155, 23, 4, '#a89162'); p.rect(84, 159, 20, 21, '#7f8b75');
  for (let i = 0; i < 4; i++) { p.line(84 + i * 5, 158, 88 + i * 5, 178, '#c2bc92'); p.line(84, 162 + i * 5, 104, 165 + i * 4, '#b1ad86'); }
  for (let i = 0; i < 4; i++) pot(p, 374 + i * 13, 177 + i % 2 * 3, 5, 10, 30 + i, i % 2 === 0);
}

/** Fountain is a depth-sorted static object; only its small ripples animate later. */
export function drawCommissionFountain(ctx: Ctx) {
  const p = new PixelPainter(ctx);
  p.oval(242, 207, 32, 7, '#71816579'); p.oval(240, 200, 30, 12, '#8c967c');
  p.rect(211, 195, 58, 9, '#a6aa8a'); p.oval(240, 195, 30, 11, '#e0d4ae');
  p.oval(240, 193, 26, 8, '#6f968b'); p.oval(240, 192, 24, 6, '#79ada4');
  p.oval(240, 191, 23, 5, '#8bbcb0'); p.ring(240, 195, 30, 11, '#ede0b7');
  p.line(215, 200, 220, 203, '#b8b794'); p.line(225, 204, 237, 206, '#a5ad8a');
  p.rect(236, 166, 8, 26, '#a8b593'); p.rect(236, 164, 3, 26, '#d4d8ae'); p.rect(243, 169, 2, 21, '#7d987e');
  p.oval(240, 167, 17, 6, '#7e967d'); p.rect(224, 163, 32, 4, '#9fae8b');
  p.oval(240, 162, 18, 6, '#e3d7ae'); p.oval(240, 161, 15, 4, '#74a59a');
  p.oval(240, 160, 13, 3, '#96c3af'); p.rect(237, 145, 6, 14, '#b0c2a0'); p.rect(237, 144, 2, 14, '#e7dfba');
  p.oval(240, 145, 5, 3, '#e9dfb7'); p.oval(240, 143, 4, 2, '#b1d3ba');
  for (const x of [228, 250]) { p.line(x, 166, x, 184, '#bfdfc1'); p.line(x + 1, 169, x + 1, 184, '#8cc2ad'); p.oval(x, 188, 3, 1, '#c4ddbf'); }
}
export function drawCommissionWorktable(ctx: Ctx, gardener: boolean) {
  const p = new PixelPainter(ctx); const x = gardener ? 374 : 58, y = 204, w = gardener ? 48 : 54;
  p.oval(x + w / 2 + 3, 238, w / 2 + 4, 4, '#5c6d5266');
  for (const xx of [x + 3, x + w - 8]) { p.rect(xx, y + 9, 5, 24, '#706849'); p.rect(xx + 1, y + 10, 2, 22, '#b2a071'); }
  p.rect(x + 4, y + 25, w - 8, 3, '#8b7851'); p.rect(x + 4, y + 25, w - 8, 1, '#c7b180');
  p.rect(x - 2, y, w + 4, 7, '#7a6b49'); p.rect(x - 1, y - 1, w + 2, 4, '#d2b27b');
  p.rect(x + 2, y, w - 3, 1, '#e9cb92'); p.line(x + 2, y + 3, x + w - 1, y + 3, '#9d8359');
  if (gardener) {
    pot(p, x + 10, y - 10, 5, 9, 62, true); pot(p, x + 28, y - 8, 6, 8, 63);
    p.rect(x + 36, y - 1, 9, 3, '#647c4d'); p.line(x + 34, y - 3, x + 44, y - 1, '#ced295');
    p.rect(x + 32, y - 5, 3, 2, '#acb66f'); p.rect(x + 38, y - 6, 3, 2, '#729c61');
    p.rect(x + 12, y + 14, 17, 10, '#6a734d'); p.rect(x + 14, y + 16, 13, 6, '#9aaf68');
    p.rect(x + 17, y + 17, 3, 3, '#b7c078'); p.rect(x + 22, y + 18, 3, 2, '#d1be80');
  } else {
    p.oval(x + 13, y - 3, 12, 5, '#8d7955'); p.rect(x + 2, y - 5, 22, 4, '#bc9b65');
    p.oval(x + 13, y - 5, 11, 3, '#665e48');
    for (const xx of [x + 7, x + 13, x + 19]) { p.poly([[xx - 3, y - 7], [xx, y - 10], [xx + 4, y - 8], [xx + 1, y - 5]], '#a8c4be'); p.rect(xx + 2, y - 8, 1, 1, '#405f63'); }
    p.rect(x + 31, y - 8, 14, 8, '#c9b47d'); p.oval(x + 38, y - 8, 7, 2, '#685f43');
    p.line(x + 33, y - 11, x + 42, y - 11, '#b49e65'); p.line(x + 32, y - 10, x + 32, y - 5, '#b49e65'); p.line(x + 43, y - 10, x + 43, y - 5, '#b49e65');
    for (let yy = y + 13; yy < y + 26; yy += 4) { p.line(x + 5, yy, x + 25, yy + 3, '#baaf81'); p.line(x + 8, yy + 2, x + 27, yy - 2, '#8c9370'); }
  }
}
