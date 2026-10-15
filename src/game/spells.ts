import Phaser from 'phaser';
import { TAU, dist2, hexToNum } from '../core/math';
import { rand } from '../core/rng';
import { audio } from '../audio/audio';
import { E } from '../pixel/palette';
import type { Enemy, Img } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';

const books: Img[] = [];

export function clearSpellVisuals(s: GameScene) {
  books.forEach((b) => b.destroy());
  books.length = 0;
  s.spellGfx?.clear();
}

const lv = (cond: boolean) => (cond ? 1 : 0);

function inView(s: GameScene): Enemy[] {
  const v = s.cameras.main.worldView;
  return s.enemies.filter((e) => !e.dead && e.x > v.x && e.x < v.right && e.y > v.y && e.y < v.bottom);
}

/** Vampire Survivors style auto-casting. Every spell reads the same global modifiers as the guns. */
export function updateSpells(s: GameScene, dt: number) {
  const run = s.run;
  const m = run.mods;
  const p = s.player;
  const dmgMul = s.damageMult();
  const area = m.area;
  const cdMul = 1 / Math.max(0.3, m.fireRate);
  const extra = m.count;
  const g = s.spellGfx;
  g.clear();
  let bookCount = 0;

  for (const sp of run.spells) {
    const L = sp.level;
    sp.cd -= dt;
    switch (sp.id) {
      case 'orbit': {
        const n = (1 + lv(L >= 3) + lv(L >= 5) + extra) * (sp.evolved ? 2 : 1);
        const radius = 30 * area * (L >= 5 ? 1.2 : 1);
        sp.angle += dt * 3.2 * (L >= 4 ? 1.3 : 1);
        const dmg = 5 * (1 + 0.3 * lv(L >= 2)) * dmgMul;
        for (let i = 0; i < n; i++) {
          let b = books[bookCount];
          if (!b) {
            b = s.add.image(0, 0, 'b-book').setDepth(DEPTH.pet);
            books.push(b);
          }
          bookCount++;
          const a = sp.angle + (i / n) * TAU;
          const bx = p.x + Math.cos(a) * radius;
          const by = p.y - 4 + Math.sin(a) * radius * 0.8;
          b.setPosition(Math.round(bx), Math.round(by)).setVisible(true);
          for (const e of s.enemies) {
            if (e.dead || dist2(e.x, e.y - 4, bx, by) > (e.r + 5) ** 2) continue;
            if ((sp.hits.get(e.id) ?? 0) > s.time0) continue;
            sp.hits.set(e.id, s.time0 + 0.45);
            s.damageEnemy(e, dmg, { src: sp.evolved ? '天启圣典' : '守护之书', kx: e.x - p.x, ky: e.y - p.y, knock: 70, element: sp.evolved ? 'fire' : undefined });
          }
        }
        break;
      }
      case 'aura': {
        const radius = 24 * area * (1 + 0.2 * lv(L >= 2) + 0.2 * lv(L >= 4));
        const pulse = 0.5 + 0.5 * Math.sin(s.time0 * 5);
        const col = hexToNum(sp.evolved ? E.magenta : E.yellow);
        g.fillStyle(col, 0.05 + pulse * 0.03);
        g.fillCircle(p.x, p.y - 2, radius);
        g.lineStyle(1, col, 0.25 + pulse * 0.2);
        g.strokeCircle(p.x, p.y - 2, radius);
        if (sp.cd <= 0) {
          sp.cd = 0.5 * cdMul;
          const dmg = 3 * (1 + 0.4 * lv(L >= 3) + 0.4 * lv(L >= 5)) * dmgMul;
          for (const e of s.enemies) {
            if (!e.dead && dist2(e.x, e.y, p.x, p.y) < (radius + e.r) ** 2) {
              s.damageEnemy(e, dmg, { src: sp.evolved ? '灵魂吸取' : '圣光领域', kx: e.x - p.x, ky: e.y - p.y, knock: L >= 5 ? 50 : 10, noCrit: true });
            }
          }
        }
        break;
      }
      case 'lightning': {
        if (sp.cd > 0) break;
        sp.cd = (L >= 5 ? 1.35 : 1.8) * cdMul;
        const targets = Phaser.Utils.Array.Shuffle(inView(s)).slice(0, (1 + lv(L >= 2) + lv(L >= 4) + extra) * (sp.evolved ? 2 : 1));
        const dmg = 11 * (1 + 0.4 * lv(L >= 3)) * dmgMul;
        for (const t of targets) {
          const pts = [t.x + rand(-6, 6), t.y - 140];
          for (let k = 1; k < 6; k++) pts.push(t.x + rand(-7, 7), t.y - 140 + (k * 140) / 6);
          pts.push(t.x, t.y - 4);
          s.visuals.push({ kind: 'bolt', pts, width: 2, t: 0, dur: 0.16, color: hexToNum(E.yellow) });
          s.fx.sparks(t.x, t.y - 4, 6, 'shock');
          s.fx.glowPop(t.x, t.y - 4, 18, E.yellow, 140);
          for (const e of s.enemies) {
            if (!e.dead && dist2(e.x, e.y, t.x, t.y) < (12 * area + e.r) ** 2) s.damageEnemy(e, dmg, { src: sp.evolved ? '雷霆万钧' : '天罚雷击', element: sp.evolved ? 'shock' : undefined, ignoreShield: true });
          }
        }
        if (targets.length) {
          audio.shoot('chain');
          s.fx.shake(0.05);
        }
        break;
      }
      case 'missile': {
        if (sp.cd > 0) break;
        sp.cd = (sp.evolved ? 0.28 : 0.9) * cdMul;
        let best: Enemy | undefined;
        let bd = 240 * 240;
        for (const e of s.enemies) {
          if (e.dead) continue;
          const d = dist2(e.x, e.y, p.x, p.y);
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        if (!best) {
          sp.cd = 0.2;
          break;
        }
        const n = 1 + lv(L >= 2) + lv(L >= 5) + extra;
        const a = Math.atan2(best.y - p.y, best.x - p.x);
        for (let i = 0; i < n; i++) {
          const pr = s.spawnProj('orb', p.x, p.y - 6, a + (i - (n - 1) / 2) * 0.25, 210 * m.speed, 1.6, 3 * area, 6 * (1 + 0.3 * lv(L >= 3)) * dmgMul, lv(L >= 4), 30, sp.evolved ? '千针' : '魔导飞弹');
          pr.homing = 6;
        }
        break;
      }
      case 'axe': {
        if (sp.cd > 0) break;
        sp.cd = 1.4 * cdMul;
        const n = (1 + lv(L >= 2) + lv(L >= 4) + extra) * (sp.evolved ? 2 : 1);
        const dmg = 9 * (1 + 0.4 * lv(L >= 3)) * dmgMul;
        const size = 4 * area * (L >= 5 ? 1.3 : 1);
        for (let i = 0; i < n; i++) {
          if (sp.evolved) {
            const a = (i / n) * TAU + s.time0;
            const pr = s.spawnProj('axe', p.x, p.y - 6, a, 150, 2.2, size * 1.4, dmg, 999, 60, '死神镰');
            pr.spin = 20;
          } else {
            const pr = s.spawnProj('axe', p.x, p.y - 6, -Math.PI / 2, 0, 2.4, size, dmg, 999, 60, '回旋飞斧');
            pr.vx = rand(-70, 70) + (i - (n - 1) / 2) * 30;
            pr.vy = -240;
            pr.gravity = 430;
          }
        }
        audio.shoot('boomerang');
        break;
      }
      case 'nova': {
        if (sp.cd > 0) break;
        sp.cd = (L >= 4 ? 2.6 : 3.2) * cdMul;
        const radius = 64 * area * (1 + 0.2 * lv(L >= 2) + 0.25 * lv(L >= 5));
        const dmg = 7 * (1 + 0.4 * lv(L >= 3)) * dmgMul;
        s.fx.ring(p.x, p.y - 4, radius, E.cyan, 360, 3);
        s.fx.ring(p.x, p.y - 4, radius * 0.7, E.white, 300, 1);
        for (const e of s.enemies) {
          if (e.dead || dist2(e.x, e.y, p.x, p.y) > (radius + e.r) ** 2) continue;
          s.damageEnemy(e, dmg, { src: sp.evolved ? '永冬' : '冰霜新星', kx: e.x - p.x, ky: e.y - p.y, knock: 60, element: 'ice', ignoreShield: true });
          if (sp.evolved && !e.dead) e.status.frozen = e.boss ? 0.6 : 1.4;
        }
        audio.shoot('beam');
        break;
      }
    }
  }
  for (let i = bookCount; i < books.length; i++) books[i].setVisible(false);
}
