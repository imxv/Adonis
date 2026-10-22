import { Grid, pxText } from '../../pixel/draw';
import { ADONIS_A, ADONIS_B } from '../../pixel/sprites';
import { GARDEN_BEDS, GARDEN_STATIONS, GARDEN_WORLD } from './pixel-contract';
import type { GardenPixelRenderer, GardenSceneState } from './pixel-contract';
import { PixelPainter, gardenHash } from './pixel-art-primitives';
import { drawGardenLandscapeBack, drawGardenLandscapeFront } from './pixel-art-landscape';
import { drawGardenBeds, drawGardenPlants } from './pixel-art-plants';
import { drawGardenStation, drawGardenBag } from './pixel-art-stations';

const W = GARDEN_WORLD.width / 2, H = GARDEN_WORLD.height / 2;
const ALL_TARGETS = [...GARDEN_BEDS, ...GARDEN_STATIONS];

function surface() {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法绘制像素花园。');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function courtyard(ctx: CanvasRenderingContext2D) {
  const p = new PixelPainter(ctx);
  p.rect(0, 0, W, H, '#80a46a');
  // Ground cover follows patches and edges rather than a uniform noise field.
  for (let y = 92; y < H; y += 14) for (let x = 0; x < W; x += 18) {
    const h = gardenHash(x, y);
    const tone = ['#84a96d', '#88ad71', '#799e65', '#8cb174'][h % 4];
    p.poly([[x, y + 3], [x + 12, y], [x + 19, y + 8], [x + 14, y + 14], [x + 2, y + 12]], tone);
    if (h % 4 === 0) {
      p.line(x + 5, y + 10, x + 4, y + 7, '#5e8a57');
      p.line(x + 6, y + 10, x + 8, y + 6, '#a6c381');
      p.rect(x + 9, y + 11, 2, 1, '#6b925c');
    }
  }
  p.rect(82, 98, 316, 71, '#a7a474');
  p.rect(85, 99, 310, 68, '#b4aa7d');
  for (let y = 103; y < 168; y += 10) {
    p.line(85, y, 395, y, '#a29c6e');
    for (const x of [180, 286]) { p.rect(x, y - 1, 12, 1, '#c7b78a'); p.rect(x + 3, y + 2, 6, 1, '#8b9265'); }
  }
  const path = (x: number, y: number, w: number, h: number) => {
    p.rect(x - 2, y - 2, w + 4, h + 5, '#607f57');
    p.rect(x - 1, y - 1, w + 2, h + 2, '#b6aa83');
    p.rect(x, y, w, h, '#d5c39c');
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for (let yy = y; yy < y + h; yy += 10) for (let xx = x - 8 + (Math.floor(yy / 10) % 2) * 7; xx < x + w; xx += 17) {
      const tone = gardenHash(xx, yy) % 4;
      p.rect(xx + 1, yy + 1, 15, 8, ['#ded0ad', '#cabb9c', '#d6c5a2', '#c4b79b'][tone]);
      p.rect(xx + 1, yy + 1, 14, 1, '#eee0b9');
      p.rect(xx + 15, yy + 3, 1, 6, '#a39d86');
      if (tone === 2) p.line(xx + 4, yy + 5, xx + 10, yy + 6, '#b8af95');
    }
    ctx.restore();
  };
  path(48, 172, 384, 25);
  for (const bed of GARDEN_BEDS) path(bed.approach.x / 2 - 9, 163, 18, 16);
  path(225, 194, 30, 105);
  path(98, 231, 128, 19); path(254, 231, 129, 19);
  // A small stone gathering circle leaves room for the real player and objects.
  p.oval(240, 274, 42, 20, '#607f57'); p.oval(240, 271, 42, 20, '#b8aa87');
  p.oval(240, 270, 40, 19, '#e3d3aa'); p.ring(240, 270, 38, 17, '#9f946f');
  p.ring(240, 270, 32, 14, '#c3b080'); p.oval(240, 270, 24, 11, '#b1b59b');
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    p.poly([[240, 270], [240 + Math.cos(a - .13) * 12, 270 + Math.sin(a - .13) * 6], [240 + Math.cos(a) * 23, 270 + Math.sin(a) * 10], [240 + Math.cos(a + .13) * 12, 270 + Math.sin(a + .13) * 6]], i % 2 ? '#587c75' : '#d6ba76');
  }
  p.oval(240, 270, 4, 2, '#e6d2a0');
  for (const [x, y] of [[79, 198], [155, 200], [311, 202], [408, 202], [86, 264], [392, 271]]) {
    p.oval(x + 2, y + 2, 8, 2, '#658254');
    for (let i = 0; i < 3; i++) {
      p.line(x - 5 + i * 5, y, x - 4 + i * 5, y - 4, '#426c48');
      p.rect(x - 5 + i * 5, y - 5, 3, 2, i % 2 ? '#ebc274' : '#a45e66');
      p.rect(x - 4 + i * 5, y - 5, 1, 1, '#f4df9c');
    }
  }
}

/** The caller owns all scheduling, input, camera transforms and authoritative state. */
export function createGardenPixelRenderer(): GardenPixelRenderer {
  const background = surface(), foreground = surface(), plantLayer = surface();
  courtyard(background.ctx);
  drawGardenLandscapeBack(background.ctx);
  drawGardenBeds(background.ctx);
  drawGardenLandscapeFront(foreground.ctx);
  const heroFrames = [ADONIS_A, ADONIS_B].map(frame => Grid.ascii(frame.rows, frame.mirror).render());
  const stationLayers = GARDEN_STATIONS.map(station => {
    const layer = surface();
    drawGardenStation(layer.ctx, station.id);
    return { ...layer, station };
  });
  const bagLayer = surface();
  const labels = new Map(ALL_TARGETS.map(target => [target.id, pxText(target.name, { color: '#fff0c9', outline: '#243f3e' })]));
  let lastPacked: GardenSceneState['packedSupply'] | undefined;
  let plantSignature = '';
  let disposed = false;

  return {
    draw(ctx, state) {
      if (disposed) return;
      const phase = state.reducedMotion ? 0 : Math.floor(state.elapsed * 2) % 4;
      const signature = state.beds.map(b => `${b.plant}/${b.progress}/${b.required}`).join('|') + `:${phase}:${state.reducedMotion}`;
      if (signature !== plantSignature) {
        plantLayer.ctx.clearRect(0, 0, W, H);
        drawGardenPlants(plantLayer.ctx, state.beds, state.reducedMotion ? 0 : state.elapsed, state.reducedMotion);
        plantSignature = signature;
      }
      if (lastPacked !== state.packedSupply) {
        bagLayer.ctx.clearRect(0, 0, W, H);
        drawGardenBag(bagLayer.ctx, state.packedSupply);
        lastPacked = state.packedSupply;
      }
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.scale(2, 2);
      ctx.drawImage(background.canvas, 0, 0);
      ctx.drawImage(plantLayer.canvas, 0, 0);
      const sourcePlayer = { x: Math.round(state.player.x / 2), y: Math.round(state.player.y / 2) };
      const drawStation = (layer: typeof stationLayers[number]) => {
        ctx.drawImage(layer.canvas, 0, 0);
        if (layer.station.id === 'bag') ctx.drawImage(bagLayer.canvas, 0, 0);
      };
      for (const layer of stationLayers) if ((layer.station.y + layer.station.height) / 2 <= sourcePlayer.y) drawStation(layer);
      // Native game artwork, never baked into scenery. Source pixels scale by two.
      const frame = state.player.walking && !state.reducedMotion ? Math.floor(state.elapsed * 8) % 2 : 0;
      const hero = heroFrames[frame], heroW = hero.width * 2, heroH = hero.height * 2;
      const paint = new PixelPainter(ctx);
      paint.oval(sourcePlayer.x + 2, sourcePlayer.y + 1, 13, 4, '#365f4b65');
      paint.oval(sourcePlayer.x, sourcePlayer.y, 9, 2, '#264c466c');
      const bounce = state.player.walking && !state.reducedMotion ? frame : 0;
      ctx.save(); ctx.translate(sourcePlayer.x, sourcePlayer.y - bounce); ctx.scale(state.player.facing === 'left' ? -1 : 1, 1);
      ctx.drawImage(hero, -Math.round(heroW / 2), -heroH, heroW, heroH);
      ctx.restore();
      for (const layer of stationLayers) if ((layer.station.y + layer.station.height) / 2 > sourcePlayer.y) drawStation(layer);
      ctx.drawImage(foreground.canvas, 0, 0);
      // Water is a few local integer ripples, not a re-rendered environment.
      const drift = state.reducedMotion ? 0 : Math.floor(state.elapsed * 3) % 5;
      for (const [x, y, w] of [[26, 148, 8], [43, 151, 8], [60, 148, 5]]) paint.rect(x + drift, y, w, 1, '#c0e0ca');
      if (state.target) {
        const target = ALL_TARGETS.find(item => item.id === state.target);
        if (target) {
          const x = Math.round(target.x / 2), y = Math.round(target.y / 2), w = target.width / 2, h = target.height / 2;
          const color = '#f7df91';
          for (const [cx, cy, dx, dy] of [[x - 2, y - 2, 1, 1], [x + w + 1, y - 2, -1, 1], [x - 2, y + h + 1, 1, -1], [x + w + 1, y + h + 1, -1, -1]]) {
            paint.line(cx, cy, cx + dx * 6, cy, '#385b49', 2); paint.line(cx, cy, cx, cy + dy * 5, '#385b49', 2);
            paint.line(cx, cy, cx + dx * 5, cy, color); paint.line(cx, cy, cx, cy + dy * 4, color);
          }
          const label = labels.get(target.id)!;
          let lx = Math.round(x + w / 2 - label.width / 2);
          let ly = Math.max(91, y - label.height - 7);
          // In particular, the spawn is just north of the exit. Its name must
          // sit beside the visitor instead of covering the actual hero sprite.
          const overlapsPlayer = (candidateX: number) => candidateX - 3 < sourcePlayer.x + heroW / 2
            && candidateX + label.width + 3 > sourcePlayer.x - heroW / 2
            && ly - 2 < sourcePlayer.y && ly + label.height + 2 > sourcePlayer.y - heroH;
          if (overlapsPlayer(lx)) {
            const beside = sourcePlayer.x <= x + w / 2 ? x + w + 8 : x - label.width - 8;
            const safeX = [beside, x - label.width - 8, x + w + 8]
              .map(candidate => Math.max(4, Math.min(W - label.width - 4, candidate)))
              .find(candidate => !overlapsPlayer(candidate));
            if (safeX !== undefined) lx = safeX;
            else ly = Math.max(4, sourcePlayer.y - heroH - label.height - 6);
          }
          paint.rect(lx - 3, ly - 2, label.width + 6, label.height + 4, '#294c43ec');
          paint.rect(lx - 3, ly - 2, label.width + 6, 1, '#d9c795');
          ctx.drawImage(label, lx, ly);
          paint.ring(target.approach.x / 2, target.approach.y / 2 + 1, 7, 3, '#e8d49a');
        }
      }
      ctx.restore();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const canvas of [background.canvas, foreground.canvas, plantLayer.canvas, bagLayer.canvas, ...stationLayers.map(layer => layer.canvas), ...heroFrames]) canvas.width = canvas.height = 1;
      labels.clear();
    },
  };
}
