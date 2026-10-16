import type { DifficultyId } from '../data/difficulty';

/** Small, deliberately rasterised paintings for the three mythological trials. */
const WIDTH = 192;
const HEIGHT = 82;
const paintings = new Map<DifficultyId, { src: string; width: number; height: number }>();

type Point = readonly [number, number];

class Pixels {
  constructor(readonly ctx: CanvasRenderingContext2D) {}

  rect(x: number, y: number, width: number, height: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, width, height);
  }

  /** Scanline fill avoids the antialiased seams of Canvas paths at this scale. */
  poly(points: readonly Point[], color: string) {
    const minY = Math.min(...points.map((p) => p[1]));
    const maxY = Math.max(...points.map((p) => p[1]));
    for (let y = minY; y < maxY; y++) {
      const intersections: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          intersections.push(a[0] + ((y + 0.5 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        const start = Math.ceil(intersections[i] - 0.5);
        const end = Math.ceil(intersections[i + 1] - 0.5);
        this.rect(start, y, end - start, 1, color);
      }
    }
  }

  disc(x: number, y: number, radius: number, color: string) {
    for (let dy = -radius; dy <= radius; dy++) {
      const halfWidth = Math.floor(Math.sqrt(radius * radius - dy * dy));
      this.rect(x - halfWidth, y + dy, halfWidth * 2 + 1, 1, color);
    }
  }

  cloud(x: number, y: number, width: number, light: string, shade: string) {
    this.rect(x, y + 4, width, 3, shade);
    this.rect(x + 3, y + 2, width - 8, 4, light);
    this.rect(x + 7, y, Math.max(5, width - 20), 3, light);
    this.rect(x + width - 12, y + 3, 9, 2, light);
  }

  column(x: number, y: number, height: number, light: string, mid: string, dark: string) {
    this.rect(x - 2, y, 10, 2, light);
    this.rect(x - 1, y + 2, 8, 2, mid);
    this.rect(x, y + 4, 6, height - 6, light);
    this.rect(x + 2, y + 4, 1, height - 6, mid);
    this.rect(x + 4, y + 4, 2, height - 6, dark);
    this.rect(x - 1, y + height - 2, 8, 2, mid);
    this.rect(x - 2, y + height, 10, 2, light);
  }

  cypress(x: number, y: number, height: number, light: string, dark: string) {
    this.rect(x - 1, y + height - 4, 2, 8, dark);
    this.poly([[x, y], [x + 3, y + 8], [x + 4, y + height - 6], [x + 2, y + height], [x - 3, y + height], [x - 4, y + height - 5], [x - 2, y + 9]], dark);
    this.poly([[x, y + 2], [x + 1, y + height - 5], [x - 3, y + height - 6], [x - 2, y + 10]], light);
  }
}

function elysium(p: Pixels) {
  p.rect(0, 0, WIDTH, HEIGHT, '#cda375');
  p.rect(0, 10, WIDTH, 15, '#deb786');
  p.rect(0, 25, WIDTH, 23, '#eccb94');
  p.disc(101, 27, 20, '#e9c38b');
  p.disc(101, 27, 16, '#f9dfa5');
  p.disc(101, 27, 11, '#fff0bb');
  p.cloud(13, 12, 39, '#f8e3ba', '#e5c79e');
  p.cloud(139, 7, 42, '#f8e3ba', '#e5c79e');
  p.cloud(48, 30, 23, '#f3d9aa', '#e6c18e');
  p.rect(0, 43, WIDTH, 14, '#b1b58c');
  p.poly([[0, 43], [14, 38], [32, 39], [48, 43], [68, 40], [83, 43], [113, 42], [133, 37], [153, 36], [176, 42], [192, 40], [192, 57], [0, 57]], '#9fa87a');
  p.poly([[0, 53], [23, 48], [40, 51], [64, 46], [90, 48], [117, 55], [151, 48], [174, 50], [192, 47], [192, 82], [0, 82]], '#7f9060');
  p.poly([[0, 65], [28, 57], [54, 60], [77, 56], [105, 61], [134, 56], [157, 60], [192, 55], [192, 82], [0, 82]], '#536e50');
  // A winding ribbon of water catches the same gold as the sun.
  p.poly([[92, 48], [99, 48], [109, 54], [89, 61], [85, 66], [117, 75], [132, 82], [91, 82], [67, 72], [64, 66], [75, 60], [100, 53]], '#b7ba8b');
  p.poly([[94, 49], [98, 49], [104, 53], [83, 61], [78, 66], [101, 76], [112, 82], [104, 82], [72, 68], [74, 63], [80, 59], [100, 53]], '#e4d49b');
  p.rect(75, 64, 14, 1, '#f3e2a8');
  p.rect(90, 76, 16, 1, '#f3e2a8');
  p.cypress(17, 30, 30, '#596b44', '#3f563f');
  p.cypress(31, 38, 22, '#667b4e', '#415d45');
  p.cypress(165, 26, 34, '#5d7149', '#3f563f');
  p.cypress(176, 35, 27, '#6f8050', '#405b41');
  // A marble arch, framed by a living laurel wreath.
  p.rect(108, 57, 44, 3, '#c6b781');
  p.rect(111, 54, 38, 3, '#f4dfae');
  p.column(115, 33, 20, '#f9e6b6', '#c8b783', '#a7976d');
  p.column(139, 33, 20, '#f9e6b6', '#c8b783', '#a7976d');
  p.poly([[112, 34], [112, 28], [117, 21], [123, 18], [137, 18], [144, 22], [148, 29], [148, 34], [140, 34], [139, 28], [136, 25], [124, 25], [121, 28], [120, 34]], '#d1bd87');
  p.poly([[112, 30], [114, 25], [120, 19], [126, 17], [135, 17], [142, 20], [147, 26], [148, 30], [144, 30], [141, 24], [136, 21], [125, 21], [119, 24], [116, 30]], '#f8e5b5');
  p.rect(127, 17, 5, 7, '#fff0cb');
  for (let i = 0; i < 5; i++) {
    const x = 109 + i * 3;
    const y = 32 - i * 3;
    p.poly([[x, y + 3], [x - 3, y], [x - 3, y - 3], [x + 1, y], [x + 2, y + 3]], '#7b8549');
    p.poly([[150 - i * 3, y + 3], [153 - i * 3, y], [153 - i * 3, y - 3], [149 - i * 3, y], [148 - i * 3, y + 3]], '#7b8549');
    p.rect(x - 1, y - 1, 1, 2, '#c1b765');
    p.rect(151 - i * 3, y - 1, 1, 2, '#c1b765');
  }
  for (let i = 0; i < 47; i++) {
    const x = (i * 37 + 11) % WIDTH;
    const y = 60 + ((i * 13) % 22);
    if (x > 63 && x < 132) continue;
    p.rect(x, y, 1, 2, '#8c9d64');
    if (i % 3 === 0) p.rect(x, y - 1, 2, 1, '#efcd87');
    if (i % 7 === 0) p.rect(x + 2, y + 1, 1, 1, '#f1dcc0');
  }
  p.poly([[0, 75], [23, 72], [45, 78], [65, 80], [65, 82], [0, 82]], '#3d5945');
  p.poly([[145, 82], [163, 75], [181, 73], [192, 75], [192, 82]], '#3d5945');
  p.rect(10, 22, 3, 1, '#9f8b68');
  p.rect(13, 23, 2, 1, '#9f8b68');
  p.rect(15, 22, 3, 1, '#9f8b68');
}

function olympus(p: Pixels) {
  p.rect(0, 0, WIDTH, HEIGHT, '#252b4b');
  p.rect(0, 18, WIDTH, 20, '#343b5a');
  p.rect(0, 38, WIDTH, 22, '#4b5270');
  p.rect(0, 60, WIDTH, 22, '#76768b');
  for (let i = 0; i < 31; i++) {
    const x = (i * 43 + 7) % WIDTH;
    const y = (i * 17 + 3) % 37;
    p.rect(x, y, 1, 1, i % 4 === 0 ? '#eddaa3' : '#6d7898');
  }
  p.disc(96, 22, 21, '#3d4464');
  p.disc(96, 22, 17, '#505571');
  p.disc(96, 22, 14, '#68708a');
  p.poly([[12, 70], [38, 35], [45, 43], [58, 31], [85, 65]], '#49516b');
  p.poly([[127, 65], [150, 26], [162, 42], [169, 36], [192, 65]], '#434b65');
  p.poly([[139, 43], [150, 26], [156, 36], [151, 34], [147, 40], [144, 37]], '#8b94a8');
  p.poly([[29, 47], [38, 35], [45, 43], [51, 38], [44, 49], [39, 43], [35, 48]], '#858da1');
  p.cloud(-4, 50, 51, '#9294a9', '#70758f');
  p.cloud(146, 47, 49, '#8d93aa', '#68708d');
  // A sharp Olympian peak supports the ivory temple above the cloud line.
  p.poly([[51, 82], [63, 66], [70, 60], [73, 49], [122, 49], [126, 62], [147, 82]], '#3b425d');
  p.poly([[73, 54], [95, 54], [81, 63], [77, 73], [62, 82], [53, 82]], '#9299a6');
  p.poly([[95, 54], [113, 54], [109, 65], [116, 77], [106, 82], [77, 82], [85, 73], [84, 66]], '#626d84');
  p.poly([[111, 58], [121, 55], [125, 66], [137, 79], [124, 74], [117, 66]], '#505c75');
  p.rect(65, 52, 65, 3, '#7a7e91');
  p.rect(68, 49, 59, 3, '#ddd8bd');
  p.rect(71, 46, 53, 3, '#f7edcf');
  p.rect(76, 27, 42, 20, '#525974');
  p.rect(82, 29, 31, 18, '#3b425a');
  for (const x of [75, 87, 99, 111]) p.column(x, 27, 18, '#f5ebcc', '#c2bea9', '#9a9fac');
  p.rect(69, 24, 56, 3, '#eee4c6');
  p.rect(72, 27, 50, 1, '#ae9b66');
  p.poly([[67, 24], [97, 9], [128, 24]], '#c4b47f');
  p.poly([[73, 23], [97, 12], [121, 23]], '#f4e5b6');
  p.poly([[81, 22], [97, 15], [113, 22]], '#71768a');
  p.rect(95, 17, 4, 3, '#e4c572');
  p.rect(94, 20, 6, 1, '#e4c572');
  p.rect(67, 24, 61, 1, '#fff1c8');
  // Zeus's lightning stays clearly readable against the dark left sky.
  p.poly([[55, 3], [47, 16], [54, 16], [43, 34], [63, 12], [56, 12], [64, 3]], '#b8a66c');
  p.poly([[57, 3], [50, 15], [57, 15], [46, 31], [60, 14], [54, 14], [61, 3]], '#fff0b3');
  p.cloud(-8, 66, 66, '#c1c0c8', '#979bac');
  p.cloud(23, 71, 58, '#d7d3cf', '#a9a9b7');
  p.cloud(127, 66, 68, '#babdcb', '#939aae');
  p.cloud(153, 73, 48, '#d8d5d4', '#a9aebc');
  p.rect(2, 79, 54, 3, '#dcd8d1');
  p.rect(141, 79, 51, 3, '#d2d2d4');
  p.rect(93, 60, 2, 4, '#8e97a9');
  p.rect(88, 65, 2, 5, '#8e97a9');
  p.rect(107, 69, 1, 5, '#78859b');
}

function tartarus(p: Pixels) {
  p.rect(0, 0, WIDTH, HEIGHT, '#211d2c');
  p.rect(0, 17, WIDTH, 22, '#34222f');
  p.rect(0, 39, WIDTH, 23, '#4e2832');
  p.rect(0, 62, WIDTH, 20, '#301f2b');
  p.disc(100, 28, 24, '#5b2d35');
  p.disc(100, 28, 18, '#923b3e');
  p.disc(100, 25, 15, '#36232f');
  p.poly([[0, 39], [11, 33], [15, 41], [28, 35], [40, 45], [51, 37], [62, 50], [0, 58]], '#35232f');
  p.poly([[131, 45], [143, 31], [155, 38], [166, 27], [178, 36], [192, 28], [192, 60]], '#30212d');
  // Chains lead the eye down from the cave roof toward the underworld gate.
  for (const [originX, slope] of [[23, 1], [169, -1]] as const) {
    for (let i = 0; i < 9; i++) {
      const x = originX + Math.floor(i / 2) * slope;
      const y = i * 5 - 2;
      p.rect(x, y, 4, 5, '#73616a');
      p.rect(x + 1, y + 1, 2, 3, '#261f2b');
      p.rect(x + 3, y + 1, 1, 3, '#453740');
    }
  }
  p.poly([[0, 64], [21, 54], [41, 61], [60, 55], [78, 59], [103, 51], [129, 58], [151, 51], [172, 58], [192, 53], [192, 82], [0, 82]], '#201d2a');
  p.poly([[91, 53], [109, 53], [110, 61], [125, 65], [117, 73], [138, 82], [76, 82], [87, 74], [79, 68], [97, 60]], '#94353b');
  p.poly([[95, 54], [105, 54], [103, 62], [116, 67], [107, 73], [123, 82], [88, 82], [98, 74], [88, 68], [102, 60]], '#de6247');
  p.poly([[99, 54], [103, 54], [100, 63], [110, 68], [103, 73], [112, 82], [103, 82], [107, 78], [98, 73], [104, 67], [96, 64]], '#ffae5e');
  p.rect(94, 78, 8, 1, '#f5ca7b');
  p.rect(105, 68, 6, 1, '#f5ca7b');
  // Basalt columns and an iron portcullis, with a small infernal light beyond.
  p.rect(70, 53, 62, 4, '#5e3b44');
  p.rect(74, 50, 54, 3, '#836052');
  p.rect(81, 25, 38, 26, '#130f1e');
  p.poly([[80, 25], [86, 17], [94, 13], [107, 13], [115, 18], [121, 25]], '#6d4248');
  p.poly([[85, 26], [90, 20], [96, 17], [104, 17], [111, 20], [115, 26]], '#251b29');
  p.rect(80, 24, 40, 2, '#956458');
  p.rect(95, 18, 10, 6, '#9a6c58');
  p.rect(97, 20, 2, 1, '#211b27');
  p.rect(102, 20, 2, 1, '#211b27');
  p.rect(99, 23, 3, 3, '#9a6c58');
  p.column(77, 25, 23, '#806254', '#5b4149', '#382b3a');
  p.column(118, 25, 23, '#806254', '#5b4149', '#382b3a');
  p.rect(88, 27, 2, 23, '#66505a');
  p.rect(95, 27, 2, 22, '#66505a');
  p.rect(103, 27, 2, 22, '#66505a');
  p.rect(111, 27, 2, 23, '#66505a');
  p.rect(86, 33, 29, 2, '#57414e');
  p.rect(86, 43, 29, 2, '#57414e');
  p.rect(99, 37, 2, 3, '#e47750');
  p.rect(98, 39, 4, 2, '#faaf61');
  p.column(42, 44, 20, '#705b54', '#4e3e48', '#302735');
  p.poly([[40, 44], [40, 38], [43, 40], [46, 35], [48, 42], [50, 44]], '#705b54');
  p.column(147, 40, 23, '#705b54', '#4e3e48', '#302735');
  p.poly([[145, 40], [146, 34], [150, 36], [152, 33], [155, 40]], '#705b54');
  for (const x of [67, 133]) {
    p.rect(x, 46, 3, 14, '#574049');
    p.rect(x - 2, 44, 7, 3, '#947058');
    p.poly([[x - 2, 43], [x - 1, 39], [x + 1, 34], [x + 2, 39], [x + 4, 41], [x + 3, 44]], '#cc5345');
    p.poly([[x, 43], [x + 1, 39], [x + 3, 43]], '#ffd184');
  }
  p.poly([[0, 77], [22, 69], [36, 72], [40, 68], [56, 73], [69, 82], [0, 82]], '#15151f');
  p.poly([[133, 82], [145, 72], [159, 75], [174, 68], [192, 71], [192, 82]], '#15151f');
  for (let i = 0; i < 30; i++) {
    const x = (i * 43 + 13) % WIDTH;
    const y = 30 + ((i * 17) % 46);
    if (x > 72 && x < 126) continue;
    p.rect(x, y, 1, i % 4 === 0 ? 2 : 1, i % 3 === 0 ? '#e49a63' : '#984b45');
  }
  p.poly([[0, 0], [29, 0], [24, 4], [18, 3], [13, 8], [9, 4], [0, 5]], '#15151f');
  p.poly([[148, 0], [192, 0], [192, 7], [181, 4], [175, 10], [170, 4], [159, 7]], '#15151f');
}

/** Cached at native resolution so CSS can scale the paintings with crisp pixels. */
export function difficultyArt(id: DifficultyId): { src: string; width: number; height: number } {
  const cached = paintings.get(id);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Difficulty paintings require a 2D canvas context.');
  ctx.imageSmoothingEnabled = false;
  const pixels = new Pixels(ctx);
  ({ easy: elysium, normal: olympus, hard: tartarus })[id](pixels);
  const painting = { src: canvas.toDataURL('image/png'), width: WIDTH, height: HEIGHT };
  paintings.set(id, painting);
  return painting;
}
