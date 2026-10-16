import Phaser from 'phaser';
import { TAU, dist2, hexToNum } from '../core/math';
import { rand } from '../core/rng';
import { audio } from '../audio/audio';
import { E } from '../pixel/palette';
import type { SpellInstance } from '../data/spells';
import type { Enemy, Img } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';

/** Sprite pools for things that orbit the player: books and swords. */
const pools: Record<string, Img[]> = { book: [], sword: [] };
const used: Record<string, number> = { book: 0, sword: 0 };

export function clearSpellVisuals(s: GameScene) {
  for (const k of Object.keys(pools)) {
    pools[k].forEach((b) => b.destroy());
    pools[k].length = 0;
  }
  s.spellGfx?.clear();
}

function orbiter(s: GameScene, kind: 'book' | 'sword'): Img {
  let img = pools[kind][used[kind]];
  if (!img) {
    img = s.add.image(0, 0, kind === 'book' ? 'b-book' : 'b-sword').setDepth(DEPTH.pet);
    pools[kind].push(img);
  }
  used[kind]++;
  return img.setVisible(true);
}

const lv = (cond: boolean) => (cond ? 1 : 0);

function inView(s: GameScene): Enemy[] {
  const v = s.cameras.main.worldView;
  return s.enemies.filter((e) => !e.dead && e.x > v.x && e.x < v.right && e.y > v.y && e.y < v.bottom);
}

function nearest(s: GameScene, x: number, y: number, range: number, n: number): Enemy[] {
  return s.enemies
    .filter((e) => !e.dead && dist2(e.x, e.y, x, y) < range * range)
    .sort((a, b) => dist2(a.x, a.y, x, y) - dist2(b.x, b.y, x, y))
    .slice(0, n);
}

/** The enemy with the most neighbours: where a vortex does the most work. */
function densest(s: GameScene, range: number): Enemy | undefined {
  const p = s.player;
  const cands = s.enemies.filter((e) => !e.dead && !e.boss && dist2(e.x, e.y, p.x, p.y) < range * range);
  let best: Enemy | undefined;
  let bn = -1;
  for (const e of cands) {
    const n = cands.filter((o) => dist2(o.x, o.y, e.x, e.y) < 60 * 60).length;
    if (n > bn) {
      bn = n;
      best = e;
    }
  }
  return best ?? s.enemies.find((e) => !e.dead && e.boss && dist2(e.x, e.y, p.x, p.y) < range * range);
}

/** A meteor: a warning circle, a fireball falling in, then a blast (and burning ground). */
function meteor(s: GameScene, x: number, y: number, r: number, dmg: number, src: string, fire: number, delay = 0) {
  const fall = 0.75;
  const rock = s.add.image(x + 70, y - 150, 'b-meteor').setDepth(DEPTH.particles).setVisible(false);
  s.time.delayedCall(delay * 1000, () => {
    if (!rock.active) return;
    rock.setVisible(true);
    s.tweens.add({ targets: rock, x, y: y - 4, duration: fall * 1000, ease: 'Quad.easeIn' });
    s.telegraphs.push({
      kind: 'circle',
      x,
      y,
      r,
      t: 0,
      dur: fall,
      onDone: () => {
        rock.destroy();
        s.explode(x, y, r, dmg, { src, knock: 110, element: 'fire' });
        if (fire > 0) s.hazards.push({ kind: 'ember', x, y, r: r * 0.8, t: fire, dur: fire, tick: 0.1, dmg: dmg * 0.12, src });
      },
    });
  });
}

/** A zap from (x, y) to an enemy, with the jagged bolt drawn. */
function zap(s: GameScene, x: number, y: number, e: Enemy, dmg: number, src: string) {
  s.visuals.push({ kind: 'chain', pts: s.jag(x, y, e.x, e.y - 4), width: 2, t: 0, dur: 0.12, color: hexToNum(E.yellow) });
  s.damageEnemy(e, dmg, { src, element: 'shock', ignoreShield: true, knock: 20, kx: e.x - x, ky: e.y - y });
}

/**
 * Vampire Survivors style auto-casting. Every spell reads the same global modifiers as the guns:
 * damage, attack rate (as cooldown), area and extra count.
 */
/**
 * Spells back the weapons up rather than replace them: they hit at a fixed fraction of their listed power and take
 * only half of what the shared damage and attack-rate upgrades give the weapons.
 */
const SPELL_POWER = 0.6;

export function updateSpells(s: GameScene, dt: number) {
  const run = s.run;
  const m = run.mods;
  const p = s.player;
  const dmgMul = SPELL_POWER * (1 + (s.damageMult() - 1) * 0.5);
  // Fusions already hit harder and wider than their two parts put together.
  const fuseMul = dmgMul * 0.8;
  const area = m.area;
  const cdMul = 1 / Math.max(0.3, 1 + (m.fireRate - 1) * 0.5);
  const extra = m.count;
  const g = s.spellGfx;
  g.clear();
  used.book = used.sword = 0;

  /** Orbiting swords that hurt on contact (sword ring and its fusion). */
  const swordRing = (sp: SpellInstance, n: number, radius: number, contact: number, src: string) => {
    const out: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = sp.angle + (i / n) * TAU;
      const bx = p.x + Math.cos(a) * radius;
      const by = p.y - 4 + Math.sin(a) * radius * 0.8;
      orbiter(s, 'sword').setPosition(Math.round(bx), Math.round(by)).setRotation(a + Math.PI / 2);
      out.push([bx, by]);
      for (const e of s.enemies) {
        if (e.dead || dist2(e.x, e.y - 4, bx, by) > (e.r + 5) ** 2 || (sp.hits.get(e.id) ?? 0) > s.time0) continue;
        sp.hits.set(e.id, s.time0 + 0.45);
        s.damageEnemy(e, contact, { src, kx: e.x - p.x, ky: e.y - p.y, knock: 50 });
      }
    }
    return out;
  };

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
          const a = sp.angle + (i / n) * TAU;
          const bx = p.x + Math.cos(a) * radius;
          const by = p.y - 4 + Math.sin(a) * radius * 0.8;
          orbiter(s, 'book').setPosition(Math.round(bx), Math.round(by));
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
          s.hurtProps(p.x, p.y, radius, dmg);
        }
        break;
      }
      case 'lightning': {
        if (sp.cd > 0) break;
        sp.cd = (L >= 5 ? 1.7 : 2.2) * cdMul;
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
            if (!e.dead && dist2(e.x, e.y, t.x, t.y) < (12 * area + e.r) ** 2) s.damageEnemy(e, dmg, { src: sp.evolved ? '雷霆万钧' : '天罚雷击', element: 'shock', ignoreShield: true });
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
        sp.cd = (sp.evolved ? 0.36 : 0.9) * cdMul;
        const best = nearest(s, p.x, p.y, 240, 1)[0];
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
            const pr = s.spawnProj('axe', p.x, p.y - 6, a, 150, 2.2, size * 1.4, dmg, 999, 60, '死神轮舞');
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
      case 'knife': {
        if (sp.cd > 0) break;
        sp.cd = (L >= 4 ? 0.36 : 0.45) * cdMul * (sp.evolved ? 0.5 : 1);
        const n = sp.evolved ? 5 + extra : 1 + lv(L >= 2) + lv(L >= 5) + extra;
        const step = sp.evolved ? 0.14 : 0.09;
        const dmg = 4 * (1 + 0.3 * lv(L >= 5)) * dmgMul;
        for (let i = 0; i < n; i++) {
          const a = p.aim + (i - (n - 1) / 2) * step + rand(-0.03, 0.03);
          s.spawnProj('bolt', p.x, p.y - 5, a, 330 * m.speed, 0.7 * m.range, 2.5 * area, dmg, 1 + lv(L >= 3) + m.pierce, 25, sp.evolved ? '刀光风暴' : '飞刀', 'b-knife');
        }
        break;
      }
      case 'meteor': {
        if (sp.cd > 0) break;
        sp.cd = (L >= 4 ? 2.8 : 3.5) * cdMul;
        const n = (sp.evolved ? 3 : 1 + lv(L >= 5)) + extra;
        const r = 28 * area * (1 + 0.2 * lv(L >= 2));
        const dmg = 16 * (1 + 0.4 * lv(L >= 3)) * dmgMul;
        const fire = sp.evolved ? 3 : L >= 5 ? 1.5 : 0;
        const targets = Phaser.Utils.Array.Shuffle(inView(s));
        for (let i = 0; i < n; i++) {
          const t = targets[i];
          const [x, y] = t ? [t.x, t.y] : [p.x + rand(-80, 80), p.y + rand(-60, 60)];
          meteor(s, x, y, r, dmg, sp.evolved ? '流星火雨' : '陨石', fire, i * 0.15);
        }
        break;
      }
      case 'poison': {
        if (sp.cd > 0) break;
        sp.cd = 2.4 * cdMul;
        const n = 1 + lv(L >= 3) + extra;
        const r = 22 * area * (1 + 0.2 * lv(L >= 2));
        const dur = 3 * (L >= 4 ? 1.5 : 1);
        const dmg = 2.2 * (1 + 0.4 * lv(L >= 5)) * dmgMul;
        const targets = nearest(s, p.x, p.y, 170, 12);
        Phaser.Utils.Array.Shuffle(targets);
        if (!targets.length) {
          sp.cd = 0.3;
          break;
        }
        for (const t of targets.slice(0, n)) s.hazards.push({ kind: 'poison', x: t.x, y: t.y, r, t: dur, dur, tick: 0.2, dmg, src: sp.evolved ? '瘟疫爆发' : '毒雾', spread: sp.evolved });
        break;
      }
      case 'arc': {
        if (sp.cd > 0) break;
        const targets = nearest(s, p.x, p.y, 110 * area * (L >= 5 ? 1.25 : 1), 1 + lv(L >= 2) + lv(L >= 5) + extra);
        if (!targets.length) {
          sp.cd = 0.2;
          break;
        }
        sp.cd = (L >= 4 ? 1.1 : 1.4) * cdMul;
        const dmg = 7 * (1 + 0.4 * lv(L >= 3)) * dmgMul;
        const src = sp.evolved ? '电网' : '电弧';
        const hit = new Set<Enemy>();
        for (const t of targets) {
          zap(s, p.x, p.y - 6, t, dmg, src);
          hit.add(t);
          // The evolved web jumps on twice from each target.
          let from = t;
          for (let j = 0; sp.evolved && j < 2; j++) {
            const next = nearest(s, from.x, from.y, 70, 6).find((e) => !hit.has(e));
            if (!next) break;
            zap(s, from.x, from.y - 4, next, dmg * 0.7, src);
            hit.add(next);
            from = next;
          }
        }
        audio.shoot('chain');
        break;
      }
      case 'swords': {
        const n = (2 + lv(L >= 2) + lv(L >= 4) + extra) * (sp.evolved ? 2 : 1);
        sp.angle += dt * 2.2;
        sp.t -= dt;
        if (sp.t > 0) break; // regrowing after a volley
        const pos = swordRing(sp, n, 40 * area, 3 * dmgMul, sp.evolved ? '剑冢' : '剑环');
        if (sp.cd > 0) break;
        const targets = nearest(s, p.x, p.y, 220, n);
        if (!targets.length) {
          sp.cd = 0.2;
          break;
        }
        sp.cd = (L >= 3 ? 2.4 : 3) * cdMul;
        sp.t = 0.9;
        const dmg = 8 * (1 + 0.3 * lv(L >= 5)) * dmgMul;
        pos.forEach(([x, y], i) => {
          const t = targets[i % targets.length];
          s.spawnProj('bolt', x, y, Math.atan2(t.y - 4 - y, t.x - x), 280 * m.speed, 1, 3, dmg, sp.evolved ? 99 : 2, 40, sp.evolved ? '剑冢' : '剑环', 'b-sword');
        });
        audio.shoot('slash');
        break;
      }
      case 'vortex': {
        if (sp.cd > 0) break;
        const at = densest(s, 260);
        if (!at) {
          sp.cd = 0.3;
          break;
        }
        sp.cd = (L >= 4 ? 4 : 5) * cdMul;
        const dur = 2.5 * (L >= 5 ? 1.4 : 1);
        s.hazards.push({
          kind: 'vortex',
          x: at.x,
          y: at.y,
          r: 50 * area * (1 + 0.2 * lv(L >= 2)) * (sp.evolved ? 1.3 : 1),
          t: dur,
          dur,
          tick: 0.3,
          dmg: 2 * (1 + 0.4 * lv(L >= 3)) * dmgMul,
          src: sp.evolved ? '天体引力' : '黑洞',
          pull: sp.evolved ? 70 : 45,
          burst: sp.evolved ? 20 * dmgMul : 0,
        });
        break;
      }

      // ---------------------------------------------------------------- fusions
      case 'storm': {
        if (sp.cd > 0) break;
        const radius = 95 * area;
        const inside = s.enemies.filter((e) => !e.dead && dist2(e.x, e.y, p.x, p.y) < radius * radius);
        if (!inside.length) {
          sp.cd = 0.25;
          break;
        }
        sp.cd = 2.6 * cdMul;
        s.fx.ring(p.x, p.y - 4, radius, E.cyan, 420, 3);
        s.fx.ring(p.x, p.y - 4, radius * 0.6, E.white, 320, 2);
        s.light.flash(p.x, p.y, radius * 1.6, E.cyan, 0.3);
        for (const e of inside) {
          s.damageEnemy(e, 12 * fuseMul, { src: '雷霜风暴', element: 'ice', ignoreShield: true, kx: e.x - p.x, ky: e.y - p.y, knock: 40 });
          if (!e.dead) e.status.frozen = e.boss ? 0.6 : 1.2;
        }
        // A beat later the bolts land on the frozen: shock on ice shatters it.
        s.time.delayedCall(250, () => {
          const alive = Phaser.Utils.Array.Shuffle(inside.filter((e) => !e.dead)).slice(0, 5 + extra);
          for (const t of alive) {
            const pts = [t.x + rand(-6, 6), t.y - 140];
            for (let k = 1; k < 6; k++) pts.push(t.x + rand(-7, 7), t.y - 140 + (k * 140) / 6);
            pts.push(t.x, t.y - 4);
            s.visuals.push({ kind: 'bolt', pts, width: 2, t: 0, dur: 0.18, color: hexToNum(E.cyan) });
            s.damageEnemy(t, 16 * fuseMul, { src: '雷霜风暴', element: 'shock', ignoreShield: true });
          }
          if (alive.length) {
            audio.shoot('chain');
            s.fx.shake(0.12);
          }
        });
        audio.shoot('beam');
        break;
      }
      case 'bladestorm': {
        sp.angle += dt * 3;
        const pos = swordRing(sp, 10 + extra * 2, 46 * area, 6 * fuseMul, '万剑归宗');
        if (sp.cd > 0) break;
        const targets = nearest(s, p.x, p.y, 240, 3);
        if (!targets.length) {
          sp.cd = 0.2;
          break;
        }
        sp.cd = 0.9 * cdMul;
        for (let i = 0; i < 2; i++) {
          const [x, y] = pos[Math.floor(Math.random() * pos.length)];
          const t = targets[i % targets.length];
          const pr = s.spawnProj('bolt', x, y, Math.atan2(t.y - 4 - y, t.x - x), 300 * m.speed, 1.2, 3, 12 * fuseMul, 3 + m.pierce, 40, '万剑归宗', 'b-sword');
          pr.homing = 5;
        }
        break;
      }
      case 'plague': {
        const radius = 62 * area;
        const pulse = 0.5 + 0.5 * Math.sin(s.time0 * 4);
        const col = hexToNum(E.green);
        g.fillStyle(col, 0.07 + pulse * 0.04);
        g.fillCircle(p.x, p.y - 2, radius);
        g.lineStyle(1, col, 0.35 + pulse * 0.25);
        g.strokeCircle(p.x, p.y - 2, radius);
        g.lineStyle(1, hexToNum(E.greenD), 0.4);
        g.strokeCircle(p.x, p.y - 2, radius * (0.55 + pulse * 0.1));
        if (sp.cd > 0) break;
        sp.cd = 0.4 * cdMul;
        for (const e of s.enemies) {
          if (e.dead || dist2(e.x, e.y, p.x, p.y) > (radius + e.r) ** 2) continue;
          s.damageEnemy(e, 3.5 * fuseMul, { src: '瘟疫领域', noCrit: true, quiet: true, element: 'grass' });
          if (!e.dead) e.status.chill = Math.max(e.status.chill, 0.6);
        }
        break;
      }
      case 'starfall': {
        if (sp.cd > 0) break;
        sp.cd = 2.6 * cdMul;
        const targets = Phaser.Utils.Array.Shuffle(inView(s));
        for (let i = 0; i < 4 + extra; i++) {
          const t = targets[i];
          const [x, y] = t ? [t.x, t.y] : [p.x + rand(-110, 110), p.y + rand(-80, 80)];
          meteor(s, x, y, 34 * area, 20 * fuseMul, '天陨', 2, i * 0.12);
        }
        break;
      }
      case 'seeker': {
        if (sp.cd > 0) break;
        const targets = nearest(s, p.x, p.y, 260, 4);
        if (!targets.length) {
          sp.cd = 0.2;
          break;
        }
        sp.cd = 0.16 * cdMul;
        sp.angle = (sp.angle + 1) % 1000;
        const t = targets[Math.floor(sp.angle) % targets.length];
        // Launched off-line, then they curve in: the homing is what draws the arc.
        const a = Math.atan2(t.y - p.y, t.x - p.x) + (Math.floor(sp.angle) % 2 ? 0.9 : -0.9);
        const pr = s.spawnProj('bolt', p.x, p.y - 5, a, 300 * m.speed, 1.4, 3, 6 * fuseMul, 2 + m.pierce, 20, '千刃追踪', 'b-knife');
        pr.homing = 9;
        break;
      }
      case 'singularity': {
        if (sp.cd > 0) break;
        const at = densest(s, 280);
        if (!at) {
          sp.cd = 0.3;
          break;
        }
        sp.cd = 4.2 * cdMul;
        s.hazards.push({ kind: 'vortex', x: at.x, y: at.y, r: 72 * area, t: 3.6, dur: 3.6, tick: 0.3, dmg: 3 * fuseMul, src: '雷暴奇点', pull: 80, arc: 9 * fuseMul, arcT: 0.35, burst: 26 * fuseMul });
        break;
      }
    }
  }
  for (const k of Object.keys(pools)) for (let i = used[k]; i < pools[k].length; i++) pools[k][i].setVisible(false);
}

export { zap };
