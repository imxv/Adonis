/**
 * Small hall stations for the life games. Each frame is drawn in source pixels and
 * placed at 2× in the 1672 × 941 world, the same density as the hall artwork.
 */
type Ctx = CanvasRenderingContext2D;

export interface StationSprite {
  /** Animation frames that share one size and anchor. */
  frames: HTMLCanvasElement[];
  /** World position of the canvas' top-left corner. */
  x: number;
  y: number;
  /** World y used to sort the prop against walking characters. */
  baseY: number;
}

const SCALE = 2;
/** The training rack's top-left corner: on the open paving right of the mosaic, in front of the repair easel. */
export const TRAINING_AT = { x: 1846, y: 704 } as const;

function rect(c: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function line(c: Ctx, color: string, x0: number, y0: number, x1: number, y1: number, width = 1): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) rect(c, color, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, width, width);
}

function ellipse(c: Ctx, color: string, x: number, y: number, rx: number, ry: number): void {
  for (let yy = -Math.ceil(ry); yy <= Math.ceil(ry); yy++) {
    const t = yy / ry;
    if (Math.abs(t) > 1) continue;
    const xx = Math.floor(rx * Math.sqrt(1 - t * t));
    rect(c, color, x - xx, y + yy, xx * 2 + 1, 1);
  }
}

function frame(w: number, h: number, paint: (c: Ctx) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  paint(c);
  return canvas;
}

/** A rod propped over the fountain's lower basin, its float bobbing, and a creel on the paving. */
function fishingFrame(bob: number): HTMLCanvasElement {
  return frame(72, 80, (c) => {
    // Float and ripples sit on the basin water, below the rod tip.
    const floatY = 29 + bob;
    line(c, '#9fb3b2', 6, 10, 6, floatY - 2);
    if (bob) {
      rect(c, '#add8ce', 0, 34, 4, 1);
      rect(c, '#add8ce', 9, 34, 4, 1);
      rect(c, '#64adaf', 2, 35, 9, 1);
    } else rect(c, '#64adaf', 3, 34, 7, 1);
    rect(c, '#101c35', 4, floatY - 1, 5, 5);
    rect(c, '#e8d8b7', 5, floatY, 3, 2);
    rect(c, '#ce554b', 5, floatY + 2, 3, 1);
    // Forked stick, then the rod resting across it.
    line(c, '#2b2532', 40, 78, 40, 58, 2);
    line(c, '#795340', 40, 77, 40, 59);
    line(c, '#2b2532', 41, 59, 37, 54, 2);
    line(c, '#2b2532', 41, 59, 45, 54, 2);
    line(c, '#795340', 40, 58, 37, 55);
    line(c, '#795340', 42, 58, 44, 55);
    line(c, '#2b2532', 53, 78, 6, 8, 2);
    line(c, '#2b2532', 54, 78, 44, 63, 3);
    line(c, '#aa783d', 52, 77, 21, 30);
    line(c, '#d5a75c', 21, 30, 7, 9);
    // Cork grip below the reel.
    line(c, '#b8935a', 53, 77, 47, 68, 2);
    line(c, '#795340', 54, 77, 48, 68);
    rect(c, '#eac77b', 6, 8, 2, 2);
    // Reel.
    rect(c, '#2b2532', 45, 64, 6, 6);
    rect(c, '#8d8290', 46, 65, 4, 4);
    rect(c, '#d5c5aa', 46, 65, 2, 1);
    rect(c, '#514a59', 48, 67, 1, 1);
    // Wicker creel with a fish tail under the lid.
    ellipse(c, '#101c35', 62, 78, 10, 2);
    rect(c, '#2b2532', 53, 63, 18, 15);
    rect(c, '#8a6a3c', 54, 64, 16, 13);
    for (let y = 66; y < 77; y += 2) rect(c, '#5c4428', 54, y, 16, 1);
    for (let x = 56; x < 70; x += 4) for (let y = 65; y < 77; y += 4) rect(c, '#b8935a', x + ((y >> 2) & 1) * 2, y, 2, 1);
    rect(c, '#2b2532', 52, 60, 20, 5);
    rect(c, '#6b4f2e', 53, 61, 18, 3);
    rect(c, '#a07a46', 53, 61, 18, 1);
    rect(c, '#3a2a22', 61, 60, 2, 18);
    // A tail fin pokes out from under the lid.
    const tail = ['o.....o', 'oso.oso', '.osoqo.', '..oqo..', '..oso..', '..oso..'];
    tail.forEach((row, y) => [...row].forEach((cell, x) => {
      if (cell !== '.') rect(c, cell === 'o' ? '#2b2532' : cell === 'q' ? '#d7e3dc' : '#9fb5b8', 61 + x, 54 + y, 1, 1);
    }));
  });
}

/** A bronze tripod holding a copper pot over embers, with steam and a little woodpile. */
function kitchenFrame(phase: number): HTMLCanvasElement {
  return frame(56, 72, (c) => {
    ellipse(c, '#101c35', 28, 69, 22, 3);
    // Firewood.
    for (const [x, y] of [[2, 64], [6, 61], [11, 65]] as const) {
      rect(c, '#2b2532', x, y, 11, 4);
      rect(c, '#795340', x + 1, y + 1, 9, 2);
      rect(c, '#b8935a', x + 1, y + 1, 2, 2);
    }
    // Embers and flames between the legs.
    rect(c, '#2b2532', 19, 62, 18, 4);
    rect(c, '#60442e', 20, 62, 16, 2);
    rect(c, '#ce554b', 22 + phase % 2 * 3, 62, 3, 1);
    rect(c, '#edac50', 29 - phase % 2 * 2, 62, 2, 1);
    const flames = [[22, 7], [27, 10], [32, 6]] as const;
    flames.forEach(([x, h], i) => {
      const height = h - ((phase + i) % 3 === 0 ? 2 : 0);
      rect(c, '#a85f34', x - 1, 62 - height, 4, height);
      rect(c, '#edac50', x, 62 - height + 2, 2, height - 2);
      rect(c, '#ffe3a0', x, 62 - Math.ceil(height / 2), 1, Math.ceil(height / 2) - 1);
    });
    // Tripod legs end in small paws.
    line(c, '#2b2532', 15, 44, 8, 66, 2);
    line(c, '#2b2532', 41, 44, 48, 66, 2);
    line(c, '#2b2532', 28, 46, 28, 67, 2);
    line(c, '#aa783d', 15, 45, 9, 65);
    line(c, '#aa783d', 41, 45, 47, 65);
    line(c, '#d5a75c', 28, 47, 28, 66);
    for (const x of [6, 26, 46]) { rect(c, '#2b2532', x, 66, 5, 3); rect(c, '#d5a75c', x + 1, 66, 3, 1); }
    // Copper pot.
    ellipse(c, '#2b2532', 28, 37, 17, 11);
    ellipse(c, '#7a3a28', 28, 37, 16, 10);
    ellipse(c, '#b05a36', 27, 36, 14, 8);
    ellipse(c, '#d9844a', 24, 34, 8, 4);
    rect(c, '#f0b77a', 19, 33, 4, 1);
    rect(c, '#f0b77a', 18, 35, 2, 2);
    rect(c, '#60442e', 13, 42, 30, 1);
    for (const x of [9, 44]) {
      rect(c, '#2b2532', x, 30, 4, 6);
      rect(c, '#d5a75c', x + 1, 31, 2, 4);
      rect(c, '#2b2532', x + 1, 32, 1, 2);
    }
    ellipse(c, '#2b2532', 28, 28, 17, 3);
    ellipse(c, '#d9844a', 28, 28, 16, 2);
    ellipse(c, '#5e7c46', 28, 28, 13, 1);
    rect(c, '#a5b877', 22, 28, 3, 1);
    rect(c, '#eac77b', 31, 28, 2, 1);
    // Ladle.
    line(c, '#2b2532', 33, 28, 41, 13, 2);
    line(c, '#b8935a', 33, 27, 40, 14);
    // Steam rises in three staggered puffs.
    for (let i = 0; i < 3; i++) {
      const t = ((phase + i * 1.33) % 4) / 4;
      const y = Math.round(24 - t * 22);
      const x = Math.round(22 + i * 6 + Math.sin((t + i) * Math.PI * 2) * 2);
      const size = t < 0.25 || t >= 0.75 ? 2 : 3;
      c.globalAlpha = 0.75 - t * 0.55;
      rect(c, '#e8e2d3', x, y, size, size);
      rect(c, '#e8e2d3', x + 1, y - 1, Math.max(1, size - 1), 1);
    }
    c.globalAlpha = 1;
  });
}

/** A weapon rack with a sword, a spear and a bow, and a straw dummy rocking on its post beside it. */
function trainingFrame(phase: number): HTMLCanvasElement {
  return frame(84, 62, (c) => {
    const OUT = '#2b2532';
    ellipse(c, '#101c35', 26, 59, 24, 3);
    ellipse(c, '#101c35', 67, 59, 13, 2);
    // Rack: two posts and two rails.
    for (const x of [3, 45]) {
      rect(c, OUT, x - 1, 12, 5, 48);
      rect(c, '#795340', x, 13, 3, 46);
      rect(c, '#aa783d', x, 13, 1, 46);
    }
    for (const y of [14, 44]) {
      rect(c, OUT, 1, y - 1, 49, 5);
      rect(c, '#795340', 2, y, 47, 3);
      rect(c, '#d5a75c', 2, y, 47, 1);
    }
    // Sword: blade up, guard and grip resting on the lower rail.
    rect(c, OUT, 11, 2, 5, 43);
    rect(c, '#b3a599', 12, 3, 3, 41);
    rect(c, '#d5c5aa', 12, 3, 1, 41);
    rect(c, OUT, 8, 43, 11, 4);
    rect(c, '#d5a75c', 9, 44, 9, 2);
    rect(c, OUT, 12, 46, 3, 8);
    rect(c, '#795340', 13, 47, 1, 6);
    // Spear: a long shaft and a leaf blade.
    line(c, OUT, 25, 0, 25, 58, 3);
    line(c, '#aa783d', 26, 6, 26, 57);
    rect(c, OUT, 23, 0, 7, 9);
    rect(c, '#d5c5aa', 25, 1, 3, 7);
    rect(c, '#ce554b', 24, 9, 5, 2);
    // Bow: the stave curves away from its string.
    for (let y = 6; y <= 44; y++) {
      const bend = Math.round(Math.sin(((y - 6) / 38) * Math.PI) * 6);
      rect(c, OUT, 33 + bend, y, 3, 1);
      rect(c, '#aa783d', 34 + bend, y, 1, 1);
    }
    line(c, '#e8d8b7', 34, 6, 34, 44);
    // Dummy: post and base, then the straw body, arms, burlap head and target.
    const sway = phase % 2;
    rect(c, OUT, 58, 56, 19, 4);
    rect(c, '#60442e', 59, 57, 17, 2);
    rect(c, OUT, 65, 34, 5, 23);
    rect(c, '#795340', 66, 35, 3, 22);
    const bx = 67 + sway;
    rect(c, OUT, bx - 15, 21, 31, 5);
    rect(c, '#d5a75c', bx - 14, 22, 29, 3);
    rect(c, '#eac77b', bx - 14, 22, 29, 1);
    ellipse(c, OUT, bx, 31, 9, 12);
    ellipse(c, '#d5a75c', bx, 31, 8, 11);
    for (let y = 22; y < 42; y += 3) rect(c, '#aa783d', bx - 6, y, 12, 1);
    ellipse(c, '#ce554b', bx, 30, 5, 5);
    ellipse(c, '#e8d8b7', bx, 30, 3, 3);
    ellipse(c, '#ce554b', bx, 30, 1, 1);
    ellipse(c, OUT, bx, 12, 7, 7);
    ellipse(c, '#b8935a', bx, 12, 6, 6);
    rect(c, OUT, bx - 3, 10, 2, 2);
    rect(c, OUT, bx + 2, 10, 2, 2);
    rect(c, '#795340', bx - 2, 15, 5, 1);
    rect(c, OUT, bx - 2, 19, 5, 3);
    rect(c, '#795340', bx - 1, 20, 3, 1);
  });
}

export function createGalleryStations(): { fishing: StationSprite; kitchen: StationSprite; training: StationSprite; dispose(): void } {
  const fishing: StationSprite = { frames: [fishingFrame(0), fishingFrame(1)], x: 284, y: 544, baseY: 700 };
  const kitchen: StationSprite = { frames: [0, 1, 2, 3].map(kitchenFrame), x: 660, y: 528, baseY: 666 };
  const training: StationSprite = { frames: [trainingFrame(0), trainingFrame(1)], x: TRAINING_AT.x, y: TRAINING_AT.y, baseY: TRAINING_AT.y + 118 };
  return {
    fishing,
    kitchen,
    training,
    dispose() {
      for (const station of [fishing, kitchen, training]) station.frames.forEach((canvas) => { canvas.width = canvas.height = 1; });
    },
  };
}

export function drawStation(c: Ctx, station: StationSprite, index: number): void {
  const canvas = station.frames[index % station.frames.length];
  c.drawImage(canvas, station.x, station.y, canvas.width * SCALE, canvas.height * SCALE);
}
