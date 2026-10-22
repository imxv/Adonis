import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/** All six images are painted locally. No fonts, photographs, or model assets are fetched. */
export interface PainterlyTextures {
  stone: CanvasTexture;
  sand: CanvasTexture;
  water: CanvasTexture;
  foliage: CanvasTexture;
  mural: CanvasTexture;
  inscription: CanvasTexture;
  dispose(): void;
}

type Paint = CanvasRenderingContext2D;
type Random = () => number;

function seeded(seed: number): Random {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed);
    n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function canvas(size: number): Paint {
  const surface = document.createElement('canvas');
  surface.width = size;
  surface.height = size;
  const context = surface.getContext('2d', { alpha: false });
  if (!context) throw new Error('无法创建希腊世界的绘画材质。');
  return context;
}

function fill(ctx: Paint, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/** Repeat marks across the edges so a repeated material has no painted seam. */
function tiled(ctx: Paint, x: number, y: number, radius: number, draw: () => void): void {
  const size = ctx.canvas.width;
  const xs = [0];
  const ys = [0];
  if (x < radius) xs.push(size);
  if (x > size - radius) xs.push(-size);
  if (y < radius) ys.push(size);
  if (y > size - radius) ys.push(-size);
  for (const ox of xs) for (const oy of ys) {
    ctx.save();
    ctx.translate(x + ox, y + oy);
    draw();
    ctx.restore();
  }
}

function stroke(ctx: Paint, color: string, width: number, points: number[]): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.stroke();
}

function paintStone(ctx: Paint): void {
  fill(ctx, '#e2e1d9');
  const random = seeded(0x91aeb);
  const colors = ['#f1f0e9', '#cbcfc8', '#e7e7df', '#d3d7d0', '#f6f5ee'];
  for (let i = 0; i < 190; i++) {
    const x = random() * 256, y = random() * 256;
    const w = 9 + random() * 39, h = 2 + random() * 9;
    const angle = (random() - 0.5) * 0.25;
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = 0.16 + random() * 0.18;
    tiled(ctx, x, y, w, () => {
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(-w, -h);
      ctx.lineTo(w * 0.86, -h * 0.7);
      ctx.lineTo(w, h * 0.35);
      ctx.lineTo(-w * 0.73, h);
      ctx.closePath();
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 16; i++) {
    const x = random() * 256, y = random() * 256;
    const bend = random() * 24 - 12;
    tiled(ctx, x, y, 45, () => stroke(ctx, '#aeb5ae70', 0.7, [-33, -13, -8, bend, 19, bend + 8, 35, 21]));
  }
  for (let i = 0; i < 55; i++) {
    ctx.fillStyle = i % 2 ? '#fffdf43d' : '#989f9932';
    ctx.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1);
  }
}

function paintSand(ctx: Paint): void {
  fill(ctx, '#deded5');
  const random = seeded(0xae916);
  const colors = ['#eeeee5', '#c4c5be', '#d5d7ce', '#f5f3e9'];
  for (let i = 0; i < 140; i++) {
    const x = random() * 256, y = random() * 256, length = 8 + random() * 28;
    const width = 2 + random() * 6;
    ctx.globalAlpha = 0.25;
    tiled(ctx, x, y, length, () => {
      stroke(ctx, colors[i % 4], width, [-length, -1, 0, 2, length, 0]);
    });
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 220; i++) {
    const x = random() * 256, y = random() * 256;
    const size = 0.6 + random() * 2;
    ctx.fillStyle = colors[i % 4];
    tiled(ctx, x, y, size, () => ctx.fillRect(-size / 2, -size / 2, size, size * 0.6));
  }
}

function paintWater(ctx: Paint): void {
  fill(ctx, '#287e94');
  const random = seeded(0xa1cea);
  const shades = ['#1c697f', '#3c99a5', '#58afae', '#24718c', '#80c6bb'];
  for (let i = 0; i < 100; i++) {
    const x = random() * 256, y = random() * 256;
    const length = 12 + random() * 36;
    const thickness = 2 + random() * 8;
    const rise = random() * 4 - 2;
    ctx.globalAlpha = 0.38;
    tiled(ctx, x, y, length, () => stroke(ctx, shades[i % 5], thickness, [-length, rise, -length / 3, -2, length / 3, 2, length, rise]));
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 28; i++) {
    const x = random() * 256, y = random() * 256, length = 6 + random() * 21;
    tiled(ctx, x, y, length, () => stroke(ctx, '#c5e3c975', 1.1, [-length, 1, -3, -1, length, 1]));
  }
}

function leaf(ctx: Paint, x: number, y: number, angle: number, length: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-length / 2, 0);
  ctx.quadraticCurveTo(0, -length * 0.31, length / 2, 0);
  ctx.quadraticCurveTo(0, length * 0.22, -length / 2, 0);
  ctx.fill();
  stroke(ctx, '#c5c9a366', 0.7, [-length * 0.36, 0, length * 0.35, 0]);
  ctx.restore();
}

function paintFoliage(ctx: Paint): void {
  fill(ctx, '#59745b');
  const random = seeded(0x01eaf);
  const colors = ['#8b9e7b', '#a1ad8b', '#758d6b', '#486951', '#b2b99a'];
  for (let i = 0; i < 84; i++) {
    const x = random() * 256, y = random() * 256;
    const length = 12 + random() * 24, angle = random() * Math.PI;
    tiled(ctx, x, y, length, () => leaf(ctx, 0, 0, angle, length, colors[i % 5]));
  }
  for (let i = 0; i < 18; i++) {
    const x = random() * 256, y = random() * 256;
    tiled(ctx, x, y, 20, () => stroke(ctx, '#9a9b6d5c', 1, [-14, 10, 1, -1, 15, -11]));
  }
}

function weather(ctx: Paint, seed: number): void {
  const random = seeded(seed);
  ctx.save();
  for (let i = 0; i < 105; i++) {
    ctx.globalAlpha = 0.02 + random() * 0.08;
    ctx.fillStyle = i % 3 ? '#ecd6a2' : '#6b715f';
    ctx.fillRect(random() * 512, random() * 512, 4 + random() * 25, 1 + random() * 4);
  }
  ctx.restore();
}

function border(ctx: Paint): void {
  ctx.strokeStyle = '#a88d52';
  ctx.lineWidth = 3;
  ctx.strokeRect(17, 17, 478, 478);
  ctx.strokeStyle = '#b6a475';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(29, 29, 454, 454);
  for (let i = 0; i < 14; i++) {
    const p = 40 + i * 31;
    stroke(ctx, '#426e78', 3, [p, 43, p + 19, 43, p + 19, 57, p + 8, 57, p + 8, 50]);
    stroke(ctx, '#426e78', 3, [p, 469, p + 19, 469, p + 19, 455, p + 8, 455, p + 8, 462]);
  }
}

/** Vector-built letters keep the clue independent of local font availability. */
function direction(ctx: Paint, letter: 'N' | 'W' | 'S', x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  if (letter === 'N') stroke(ctx, '#355c69', 4, [-9, 11, -9, -11, 9, 11, 9, -11]);
  if (letter === 'W') stroke(ctx, '#355c69', 4, [-13, -11, -7, 11, 0, -4, 7, 11, 13, -11]);
  if (letter === 'S') stroke(ctx, '#355c69', 4, [9, -10, 1, -12, -9, -7, -7, -1, 8, 3, 9, 9, 1, 12, -9, 10]);
  ctx.restore();
}

function sun(ctx: Paint, x: number, y: number): void {
  ctx.fillStyle = '#c79b4e';
  ctx.beginPath();
  ctx.arc(x, y, 25, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    stroke(ctx, '#b68a41', 4, [x + Math.cos(angle) * 34, y + Math.sin(angle) * 34, x + Math.cos(angle) * 45, y + Math.sin(angle) * 45]);
  }
  stroke(ctx, '#ead1a0', 2, [x - 12, y - 9, x - 3, y - 15, x + 11, y - 12]);
}

function oliveBranch(ctx: Paint, x: number, y: number): void {
  stroke(ctx, '#8b8056', 4, [x - 26, y + 38, x - 8, y + 13, x + 8, y - 14, x + 24, y - 43]);
  for (let i = 0; i < 5; i++) {
    const px = x - 21 + i * 10, py = y + 27 - i * 15;
    leaf(ctx, px - 9, py - 8, 0.65, 30, i % 2 ? '#8d9a72' : '#718969');
    leaf(ctx, px + 15, py, -0.13, 30, i % 2 ? '#a4ad86' : '#84966e');
  }
  ctx.fillStyle = '#4b6861';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(x - 6 + i * 11, y + 9 - i * 16, 4, 6, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function shell(ctx: Paint, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#c08765';
  ctx.beginPath();
  ctx.moveTo(-35, 25);
  ctx.bezierCurveTo(-68, -13, -25, -57, 16, -42);
  ctx.bezierCurveTo(62, -26, 57, 23, 24, 34);
  ctx.lineTo(4, 44);
  ctx.lineTo(-8, 30);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ead2a4';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const t = i / 60 * Math.PI * 3.7;
    const radius = 3 + t * 3.2;
    const px = Math.cos(t) * radius, py = Math.sin(t) * radius - 5;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  stroke(ctx, '#8c6656', 2, [-31, 23, -10, 21, 5, 36, 23, 28]);
  ctx.restore();
}

function paintMural(ctx: Paint): void {
  fill(ctx, '#d9cba9');
  border(ctx);
  ctx.fillStyle = '#5c8c9233';
  ctx.beginPath();
  ctx.arc(256, 265, 151, 0, Math.PI * 2);
  ctx.fill();
  ctx.setLineDash([3, 9]);
  stroke(ctx, '#af955e', 1.5, [256, 177, 256, 308]);
  stroke(ctx, '#af955e', 1.5, [193, 264, 322, 264]);
  ctx.setLineDash([]);
  shell(ctx, 256, 126);
  direction(ctx, 'N', 256, 198);
  sun(ctx, 141, 266);
  direction(ctx, 'W', 141, 335);
  oliveBranch(ctx, 302, 365);
  direction(ctx, 'S', 301, 428);
  for (let i = 0; i < 3; i++) {
    stroke(ctx, '#3d7b8790', 3, [352, 236 + i * 14, 365, 230 + i * 14, 383, 237 + i * 14, 400, 231 + i * 14]);
  }
  ctx.fillStyle = '#a58a51';
  ctx.beginPath();
  ctx.moveTo(248, 264);
  ctx.lineTo(256, 252);
  ctx.lineTo(264, 264);
  ctx.lineTo(256, 276);
  ctx.closePath();
  ctx.fill();
  weather(ctx, 0x709b1);
}

function paintInscription(ctx: Paint): void {
  fill(ctx, '#cfc2a3');
  border(ctx);
  ctx.fillStyle = '#427181';
  ctx.fillRect(92, 90, 328, 330);
  ctx.strokeStyle = '#bba064';
  ctx.lineWidth = 4;
  ctx.strokeRect(105, 103, 302, 304);
  // An invented, deliberately abstract votive script, never presented as real Greek.
  const random = seeded(0x5c71be);
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 8; col++) {
      const x = 126 + col * 34, y = 182 + row * 32;
      const variant = Math.floor(random() * 5);
      const glyphs = [
        [-8, 9, 0, -9, 8, 9, 0, 4, -8, 9],
        [-7, -9, 7, -9, 0, 0, 7, 9, -7, 9],
        [-7, 8, -7, -8, 7, -8, 7, 2, -2, 2],
        [-8, -8, 0, 0, 8, -8, 0, 0, 0, 9],
        [-8, 0, 0, -9, 8, 0, 0, 9, -8, 0],
      ];
      ctx.save();
      ctx.translate(x, y);
      stroke(ctx, row % 2 ? '#c9b37b' : '#e0cca0', 2.1, glyphs[variant]);
      ctx.restore();
    }
  }
  sun(ctx, 256, 134);
  stroke(ctx, '#c6ac70', 2, [166, 376, 205, 376, 221, 384, 239, 376, 273, 376, 290, 384, 307, 376, 346, 376]);
  weather(ctx, 0xc01ab);
}

export function createPainterlyTextures(): PainterlyTextures {
  const allocated: CanvasTexture[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const texture of allocated) {
      texture.dispose();
      // CanvasTexture.dispose releases GPU storage; shrinking also releases the CPU backing store.
      const surface = texture.image as HTMLCanvasElement;
      surface.width = 1;
      surface.height = 1;
    }
    allocated.length = 0;
  };
  const make = (name: string, size: number, paint: (ctx: Paint) => void, repeat = false): CanvasTexture => {
    const ctx = canvas(size);
    paint(ctx);
    const texture = new CanvasTexture(ctx.canvas);
    allocated.push(texture);
    texture.name = `greek-painterly-${name}`;
    texture.colorSpace = SRGBColorSpace;
    if (repeat) texture.wrapS = texture.wrapT = RepeatWrapping;
    return texture;
  };
  try {
    return {
      stone: make('stone', 256, paintStone, true),
      sand: make('sand', 256, paintSand, true),
      water: make('water', 256, paintWater, true),
      foliage: make('foliage', 256, paintFoliage, true),
      mural: make('mural', 512, paintMural),
      inscription: make('inscription', 512, paintInscription),
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
