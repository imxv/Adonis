import { Grid, pxText } from '../../pixel/draw';
import { ADONIS_A, ADONIS_B } from '../../pixel/sprites';
import { COMMISSION_TARGETS, COMMISSION_WORLD } from './pixel-contract';
import type { CommissionPixelRenderer, CommissionSceneState } from './pixel-contract';
import { PixelPainter } from './pixel-art-primitives';
import { drawCommissionFountain, drawCommissionGround, drawCommissionWorktable } from './pixel-art-landscape';
import { createCommissionNpcFrames } from './pixel-art-npcs';

const W = COMMISSION_WORLD.width / 2, H = COMMISSION_WORLD.height / 2;
function surface() {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法绘制居民庭院。');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}
/** Clone shared text artwork, so this renderer can dispose only its own canvases. */
function label(text: string) {
  const glyph = pxText(text, { font: "'ag-fusion-pixel', monospace", color: '#f7e7b5', outline: '#2a453b' });
  const canvas = document.createElement('canvas'); canvas.width = glyph.width; canvas.height = glyph.height;
  canvas.getContext('2d')!.drawImage(glyph, 0, 0);
  return canvas;
}
function heart(p: PixelPainter, x: number, y: number) {
  p.rect(x - 4, y, 3, 2, '#f3c1a0'); p.rect(x + 1, y, 3, 2, '#f3c1a0');
  p.rect(x - 5, y + 2, 10, 3, '#db8679'); p.rect(x - 3, y + 5, 6, 2, '#db8679');
  p.rect(x - 1, y + 7, 2, 2, '#a65f63'); p.rect(x - 3, y + 2, 2, 1, '#ffe0b1');
}

/** No input, storage, animation loop or gameplay side effects live in this renderer. */
export function createCommissionPixelRenderer(): CommissionPixelRenderer {
  const background = surface(); drawCommissionGround(background.ctx);
  const fountain = surface(); drawCommissionFountain(fountain.ctx);
  const leftTable = surface(), rightTable = surface();
  drawCommissionWorktable(leftTable.ctx, false); drawCommissionWorktable(rightTable.ctx, true);
  const heroFrames = [ADONIS_A, ADONIS_B].map(frame => Grid.ascii(frame.rows, frame.mirror).render());
  const npcFrames = createCommissionNpcFrames();
  const labels = new Map(COMMISSION_TARGETS.map(target => [target.id, label(target.name)]));
  const thanks = label('谢谢你！');
  const props = [{ canvas: fountain.canvas, foot: 208 }, { canvas: leftTable.canvas, foot: 237 }, { canvas: rightTable.canvas, foot: 237 }];
  let disposed = false;

  return {
    draw(ctx, state) {
      if (disposed) return;
      const elapsed = state.reducedMotion ? 0 : state.elapsed;
      const playerX = Math.round(state.player.x / 2), playerY = Math.round(state.player.y / 2);
      const frame = state.player.walking && !state.reducedMotion ? Math.floor(elapsed * 8) % 2 : 0;
      const hero = heroFrames[frame], heroW = hero.width * 2, heroH = hero.height * 2;
      ctx.save(); ctx.imageSmoothingEnabled = false; ctx.scale(2, 2);
      ctx.drawImage(background.canvas, 0, 0);
      const p = new PixelPainter(ctx);
      // Small local ripples retain the cached static architecture and ground.
      const wave = Math.floor(elapsed * 3) % 5;
      const paintFountain = () => {
        ctx.drawImage(fountain.canvas, 0, 0);
        for (const [x, y, w] of [[221, 191, 7], [244, 194, 9], [233, 159, 6]]) p.rect(x + wave, y, w, 1, '#d1e2bc');
        p.oval(240, 143 + (Math.floor(elapsed * 4) % 2), 2, 1, '#e2e7c7');
      };
      const actors: { foot: number; draw(): void }[] = props.map(prop => ({
        foot: prop.foot, draw: prop.canvas === fountain.canvas ? paintFountain : () => ctx.drawImage(prop.canvas, 0, 0),
      }));
      for (const npc of COMMISSION_TARGETS) {
        if (npc.id === 'exit') continue;
        const npcId = npc.id;
        actors.push({ foot: npc.foot.y / 2, draw() {
          const talking = state.conversation === npcId;
          const idle = state.reducedMotion ? 0 : Math.floor(elapsed * (talking ? 2.5 : 0.6) + (npcId === 'nereus' ? 0 : 1)) % 2;
          const image = npcFrames[npcId][idle], width = image.width * 2, height = image.height * 2;
          const x = npc.foot.x / 2, y = npc.foot.y / 2;
          p.oval(x + 1, y + 1, 13, 3, '#536b4a70'); p.oval(x, y, 9, 2, '#3b5a485e');
          const left = talking ? state.player.x < npc.foot.x : npcId === 'daphne';
          ctx.save(); ctx.translate(x, y); ctx.scale(left ? -1 : 1, 1);
          ctx.drawImage(image, -Math.round(width / 2), -height, width, height); ctx.restore();
        } });
      }
      actors.push({ foot: playerY, draw() {
        p.oval(playerX + 2, playerY + 1, 12, 3, '#3a5d4d66'); p.oval(playerX, playerY, 8, 2, '#2e4d4266');
        const bounce = state.player.walking && !state.reducedMotion ? frame : 0;
        ctx.save(); ctx.translate(playerX, playerY - bounce); ctx.scale(state.player.facing === 'left' ? -1 : 1, 1);
        ctx.drawImage(hero, -Math.round(heroW / 2), -heroH, heroW, heroH); ctx.restore();
      } });
      actors.sort((a, b) => a.foot - b.foot).forEach(actor => actor.draw());
      for (const npc of COMMISSION_TARGETS) {
        if (npc.id === 'exit') continue;
        const progress = state.npcs.find(person => person.id === npc.id);
        const x = npc.foot.x / 2, y = npc.foot.y / 2;
        const text = labels.get(npc.id)!;
        let lx = Math.round(x - text.width / 2), ly = y - 44 - text.height - 6;
        const overlapsHero = (xx: number, yy: number) => xx - 3 < playerX + heroW / 2
          && xx + text.width + 3 > playerX - heroW / 2 && yy - 2 < playerY && yy + text.height + 2 > playerY - heroH;
        if (overlapsHero(lx, ly)) {
          const beside = [x + 24, x - text.width - 24].map(xx => Math.max(4, Math.min(W - text.width - 4, Math.round(xx))))
            .find(xx => !overlapsHero(xx, ly));
          if (beside !== undefined) lx = beside;
          else ly = playerY - heroH - text.height - 7;
        }
        p.rect(lx - 3, ly - 2, text.width + 6, text.height + 4, state.target === npc.id || state.conversation === npc.id ? '#3d5b43ef' : '#3a5145d9');
        p.rect(lx - 3, ly - 2, text.width + 6, 1, '#c8b984'); ctx.drawImage(text, lx, ly);
        const complete = Boolean(progress && progress.completed === progress.total);
        const markerY = ly - 12 - (progress?.ready && !state.reducedMotion ? Math.floor(elapsed * 2) % 2 : 0);
        if (state.feedbackNpc === npc.id) {
          const rise = state.reducedMotion ? 0 : Math.floor(elapsed * 4) % 5;
          heart(p, x, markerY - 5 - rise);
          p.rect(Math.round(x - thanks.width / 2) - 2, markerY - 25 - rise, thanks.width + 4, thanks.height + 3, '#31533fef');
          ctx.drawImage(thanks, Math.round(x - thanks.width / 2), markerY - 24 - rise);
        } else {
          p.rect(x - 6, markerY - 2, 13, 11, complete ? '#4e7758' : progress?.ready ? '#d9ba75' : '#e3d4aa');
          p.rect(x - 5, markerY - 3, 11, 1, '#f0deb0'); p.rect(x - 4, markerY + 9, 4, 2, complete ? '#4e7758' : progress?.ready ? '#d9ba75' : '#e3d4aa');
          if (complete) { p.line(x - 3, markerY + 2, x - 1, markerY + 5, '#e6e0ad'); p.line(x - 1, markerY + 5, x + 4, markerY, '#e6e0ad'); }
          else if (progress?.ready) { p.rect(x - 1, markerY - 1, 2, 5, '#5c583a'); p.rect(x - 1, markerY + 6, 2, 2, '#5c583a'); }
          else if (state.conversation === npc.id) { for (const offset of [-3, 0, 3]) p.rect(x + offset, markerY + 2, 1, 2, '#766e4c'); }
          else { p.rect(x - 3, markerY, 6, 1, '#8c8261'); p.rect(x - 3, markerY + 3, 5, 1, '#8c8261'); p.rect(x - 3, markerY + 6, 4, 1, '#8c8261'); }
        }
      }
      if (state.target) {
        const target = COMMISSION_TARGETS.find(item => item.id === state.target)!;
        const tx = target.x / 2, ty = target.y / 2, tw = target.width / 2, th = target.height / 2;
        const color = '#ead598';
        for (const [x, y, dx, dy] of [[tx - 3, ty - 2, 1, 1], [tx + tw + 2, ty - 2, -1, 1], [tx - 3, ty + th + 2, 1, -1], [tx + tw + 2, ty + th + 2, -1, -1]]) {
          p.line(x, y, x + dx * 5, y, '#466c4b', 2); p.line(x, y, x, y + dy * 4, '#466c4b', 2);
          p.line(x, y, x + dx * 4, y, color); p.line(x, y, x, y + dy * 3, color);
        }
        p.ring(target.approach.x / 2, target.approach.y / 2 + 1, 7, 3, '#dfc58a');
        if (target.id === 'exit') {
          const text = labels.get('exit')!;
          let lx = Math.round(tx + tw + 8), ly = Math.round(ty - text.height - 6);
          const overlap = (x: number, y: number) => x - 3 < playerX + heroW / 2 && x + text.width + 3 > playerX - heroW / 2 && y - 2 < playerY && y + text.height + 2 > playerY - heroH;
          if (overlap(lx, ly)) lx = Math.round(tx - text.width - 8);
          if (overlap(lx, ly)) ly = playerY - heroH - text.height - 7;
          lx = Math.max(4, Math.min(W - text.width - 4, lx));
          p.rect(lx - 3, ly - 2, text.width + 6, text.height + 4, '#355443ed'); p.rect(lx - 3, ly - 2, text.width + 6, 1, '#c8b984'); ctx.drawImage(text, lx, ly);
        }
      }
      ctx.restore();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const canvas of [background.canvas, fountain.canvas, leftTable.canvas, rightTable.canvas, ...heroFrames, ...npcFrames.nereus, ...npcFrames.daphne, ...labels.values(), thanks]) canvas.width = canvas.height = 1;
      labels.clear();
    },
  };
}
