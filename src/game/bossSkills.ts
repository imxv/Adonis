import { TAU, clamp, segCircle, hexToNum } from '../core/math';
import { rand } from '../core/rng';
import { audio } from '../audio/audio';
import { E } from '../pixel/palette';
import { ENEMIES, type EnemyKind } from '../data/enemies';
import { raycast } from './dungeon';
import type { BossState, Enemy } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';

/*
 * Each style's guardian fights the way its subtitle reads: vines in the forest ruins, icicles and bones on the
 * glacier, the jackal dashing through the tomb, meteors and lava in the depths, saws and steam in the works,
 * the count snuffing the candles, the sword saint's iaido, the angel's rain of swords, the drowned bell's rings,
 * the mecha's laser grid. Moves are short state machines over the boss's pattern clock (b.pt) and step counter.
 */

/** Phase one and phase two moves for each style's guardian. */
export const GUARDIAN_SKILLS: Record<string, [string[], string[]]> = {
  forest: [['vines', 'roots', 'summon', 'ring', 'vines'], ['vines', 'roots', 'spiral', 'summon', 'vines', 'roots']],
  glacier: [['icicles', 'blizzard', 'boneSpears', 'summon'], ['icicles', 'boneSpears', 'blizzard', 'spiral', 'icicles']],
  desert: [['sandVortex', 'jackalDash', 'curseCross', 'summon'], ['jackalDash', 'curseCross', 'sandVortex', 'jackalDash', 'fan']],
  volcano: [['meteors', 'lavaPools', 'ring', 'flameBreath'], ['meteors', 'lavaPools', 'flameBreath', 'spiral', 'meteors']],
  factory: [['gearSaws', 'steamVents', 'missiles', 'sweep'], ['gearSaws', 'steamVents', 'missiles', 'sweep', 'spiral']],
  castle: [['lightsOut', 'batSwarm', 'blink', 'ring'], ['lightsOut', 'blink', 'batSwarm', 'blink', 'spiral']],
  garden: [['iaido', 'swordQi', 'petalStorm', 'iaido'], ['iaido', 'swordQi', 'iaido', 'petalStorm', 'iaido']],
  palace: [['swordRain', 'judgment', 'featherFan', 'summon'], ['swordRain', 'judgment', 'featherFan', 'swordRain', 'spiral']],
  reef: [['bellRings', 'tentacles', 'bubbles', 'whirlpool'], ['bellRings', 'tentacles', 'bubbles', 'whirlpool', 'tentacles']],
  neon: [['laserGrid', 'drones', 'missiles', 'sweep'], ['laserGrid', 'missiles', 'laserGrid', 'drones', 'sweep']],
};

/** Moves that carry the boss themselves, so its usual drifting stops while they run. */
export const SELF_MOVING = new Set(['jackalDash', 'iaido', 'blink']);

const toward = (e: Enemy, x: number, y: number) => Math.atan2(y - e.y, x - e.x);

/** Styles whose strikes burst out of the floor as spikes of their own material (the rest strike with light). */
const SPIKY: Record<string, string> = { forest: E.greenD, glacier: '#9fe6f5', desert: E.tan, volcano: E.orange, factory: E.greyM, garden: E.pink, reef: E.magenta };

/** What a landed strike leaves for a moment: a row of spikes bursting up and sinking back, or sparks of light. */
function erupt(s: GameScene, pts: [number, number][], color: string) {
  const tint = SPIKY[s.kit.id];
  pts.forEach(([x, y], i) => {
    if (!tint) {
      s.fx.sparks(x, y - 4, 2, 'gold');
      return;
    }
    const sp = s.add
      .image(x + rand(-2, 2), y + 3, 'spike')
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.enemy - 0.2)
      .setTint(hexToNum(i % 3 === 1 ? color : tint))
      .setScale(rand(0.8, 1.25), 0);
    s.tweens.add({ targets: sp, scaleY: rand(0.9, 1.4), duration: 90, delay: i * 14, ease: 'Back.easeOut' });
    s.tweens.add({ targets: sp, alpha: 0, scaleY: 0.2, delay: 360 + i * 14, duration: 240, onComplete: () => sp.destroy() });
  });
}

/** Points every ~11 px along a segment. */
function along(x1: number, y1: number, x2: number, y2: number): [number, number][] {
  const n = Math.max(1, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 11));
  return Array.from({ length: n + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n] as [number, number]);
}

/** A line strike: a warning that fills out, then whatever stands on it is hit. */
function strikeLine(s: GameScene, x1: number, y1: number, x2: number, y2: number, w: number, delay: number, color: string, after?: () => void) {
  s.telegraphs.push({
    kind: 'line',
    x: x1,
    y: y1,
    x2,
    y2,
    w,
    t: 0,
    dur: delay,
    onDone: () => {
      const p = s.player;
      if (s.mode === 'play' && segCircle(x1, y1, x2, y2, p.x, p.y - 4, p.r + w / 2)) s.hurtPlayer(1, (x1 + x2) / 2, (y1 + y2) / 2);
      s.visuals.push({ kind: 'beam', pts: [x1, y1, x2, y2], width: Math.max(2, Math.round(w * 0.6)), t: 0, dur: 0.2, color: hexToNum(color) });
      erupt(s, along(x1, y1, x2, y2), color);
      after?.();
    },
  });
}

/** A circle strike, with something falling into it if `fall` names a picture. */
function strikeCircle(s: GameScene, x: number, y: number, r: number, delay: number, color: string, fall?: string, after?: () => void) {
  s.telegraphs.push({
    kind: 'circle',
    x,
    y,
    r,
    t: 0,
    dur: delay,
    onDone: () => {
      const p = s.player;
      if (s.mode === 'play' && Math.hypot(p.x - x, p.y - y) < r + p.r) s.hurtPlayer(1, x, y);
      s.fx.ring(x, y, r, color, 260, 2);
      s.fx.dust(x, y, 6);
      const pts: [number, number][] = [[x, y]];
      for (let i = 0; i < 6; i++) pts.push([x + Math.cos((i / 6) * TAU) * r * 0.6, y + Math.sin((i / 6) * TAU) * r * 0.45]);
      erupt(s, pts, color);
      after?.();
    },
  });
  if (fall) {
    const img = s.add.image(x, y - 150, fall).setDepth(DEPTH.proj + 1).setRotation(Math.PI / 2);
    s.tweens.add({ targets: img, y, duration: delay * 1000, ease: 'Quad.easeIn', onComplete: () => img.destroy() });
  }
}

/** The stretch of floor along angle a through (x, y), wall to wall. */
function span(s: GameScene, x: number, y: number, a: number): [number, number, number, number] {
  const c = Math.cos(a);
  const n = Math.sin(a);
  const back = raycast(s.dungeon, x, y, -c, -n, 640, true).len;
  const fwd = raycast(s.dungeon, x, y, c, n, 640, true).len;
  return [x - c * back, y - n * back, x + c * fwd, y + n * fwd];
}

/** Run one step of a style move. Returns false for a move this module does not know. */
export function runSkill(s: GameScene, e: Enemy, b: BossState, dt: number, name: string, done: () => void): boolean {
  const p = s.player;
  const R = s.roomRect();
  const two = b.phase === 2;
  const speed = (base: number) => base * (1 + s.run.level * 0.12);
  switch (name) {
    // ---- forest: the vine king
    case 'vines': {
      if (b.step === 0) {
        const a = toward(e, p.x, p.y);
        const n = two ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const aa = a + (i - (n - 1) / 2) * 0.32;
          const len = raycast(s.dungeon, e.x, e.y - 4, Math.cos(aa), Math.sin(aa), 420, true).len;
          strikeLine(s, e.x, e.y - 4, e.x + Math.cos(aa) * len, e.y - 4 + Math.sin(aa) * len, 10, 0.85, E.green, () => s.fx.sparks(e.x + Math.cos(aa) * len * 0.5, e.y + Math.sin(aa) * len * 0.5, 6, 'grass'));
        }
        b.step = 1;
      }
      if (b.pt > 1.1) done();
      return true;
    }
    case 'roots': {
      while (b.step < (two ? 6 : 4) && b.pt >= b.step * 0.25) {
        const [x, y] = b.step === 0 ? [p.x, p.y] : [p.x + rand(-36, 36), p.y + rand(-26, 26)];
        strikeCircle(s, x, y, 14, 0.8, E.greenD, undefined, () => s.fx.sparks(x, y, 6, 'grass'));
        b.step++;
      }
      if (b.pt > 2.2) done();
      return true;
    }
    // ---- glacier: the frost-bone giant
    case 'icicles': {
      while (b.step < (two ? 10 : 7) && b.pt >= b.step * 0.12) {
        const [x, y] = b.step === 0 ? [p.x, p.y] : [p.x + rand(-50, 50), p.y + rand(-36, 36)];
        strikeCircle(s, x, y, 12, 0.95, E.cyan, 'b-icicle', () => s.fx.sparks(x, y, 6, 'ice'));
        b.step++;
      }
      if (b.pt > 2.2) done();
      return true;
    }
    case 'blizzard':
    case 'flameBreath': {
      // A sweeping cone: snow on the glacier, fire in the depths.
      if (b.step === 0) {
        b.angle = toward(e, p.x, p.y) - 0.9;
        b.step = 1;
      }
      const every = name === 'blizzard' ? 0.08 : 0.06;
      while ((b.step - 1) * every <= b.pt && b.pt < 2) {
        const a = b.angle + 1.8 * ((b.step - 1) * every) / 2;
        s.spawnEnemyBullet(e.x, e.y - 12, a + rand(-0.06, 0.06), speed(name === 'blizzard' ? 95 : 130));
        b.step++;
      }
      if (b.pt >= 2) done();
      return true;
    }
    case 'boneSpears': {
      if (b.step === 0) {
        const angles = two ? [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4] : [0, Math.PI / 2];
        for (const a of angles) strikeLine(s, ...span(s, p.x, p.y, a), 9, 0.9, E.white);
        b.step = 1;
      }
      if (b.pt > 1.1) done();
      return true;
    }
    // ---- desert: the jackal at the empty tomb
    case 'sandVortex':
    case 'whirlpool': {
      // Everything is pulled toward the guardian while a slow spiral turns around it.
      const a = toward(p as unknown as Enemy, e.x, e.y);
      p.vx += Math.cos(a) * 150 * dt;
      p.vy += Math.sin(a) * 150 * dt;
      if (Math.random() < 0.6) {
        const r = 40 + Math.random() * 40;
        const q = s.time0 * 4 + Math.random() * TAU;
        if (name === 'sandVortex') s.fx.dust(e.x + Math.cos(q) * r, e.y + Math.sin(q) * r * 0.6, 1);
        else s.fx.sparks(e.x + Math.cos(q) * r, e.y + Math.sin(q) * r * 0.6, 1, 'water');
      }
      while (b.step * 0.14 <= b.pt && b.pt < 3) {
        b.angle += 0.55;
        s.spawnEnemyBullet(e.x, e.y - 10, b.angle, speed(65));
        b.step++;
      }
      if (b.pt >= 3) done();
      return true;
    }
    case 'jackalDash':
    case 'iaido': {
      // Dash after dash along warned lines; the sword saint's cuts leave sword qi that strikes again.
      const n = name === 'iaido' ? (two ? 5 : 3) : 3;
      const each = name === 'iaido' ? 0.75 : 0.9;
      const i = Math.floor(b.pt / each);
      const lt = b.pt - i * each;
      if (i >= n) {
        done();
        return true;
      }
      if (b.step <= i) {
        // Aim past the knight, stopping at walls.
        const a = toward(e, p.x, p.y);
        const len = Math.min(raycast(s.dungeon, e.x, e.y, Math.cos(a), Math.sin(a), 600, true).len - 12, Math.hypot(p.x - e.x, p.y - e.y) + 50);
        b.dirX = e.x;
        b.dirY = e.y;
        b.tx = e.x + Math.cos(a) * Math.max(20, len);
        b.ty = e.y + Math.sin(a) * Math.max(20, len);
        s.telegraphs.push({ kind: 'line', x: b.dirX, y: b.dirY, x2: b.tx, y2: b.ty, w: 14, t: 0, dur: 0.45 });
        b.step = i + 1;
        b.bounces = 0;
      }
      if (lt >= 0.45 && lt < 0.6) {
        const k = (lt - 0.45) / 0.15;
        e.x = b.dirX + (b.tx - b.dirX) * k;
        e.y = b.dirY + (b.ty - b.dirY) * k;
        if (Math.random() < 0.6) s.fx.dust(e.x, e.y, 1);
      } else if (lt >= 0.6 && b.bounces === 0) {
        b.bounces = 1;
        e.x = b.tx;
        e.y = b.ty;
        s.visuals.push({ kind: 'slash', pts: [e.x, e.y - 8, toward(e, b.dirX, b.dirY) + Math.PI, 22, 1.2, 1], width: 3, t: 0, dur: 0.18, color: hexToNum(name === 'iaido' ? E.pink : E.yellow) });
        audio.shoot('slash');
        if (name === 'iaido') {
          const [x1, y1, x2, y2] = [b.dirX, b.dirY, b.tx, b.ty];
          strikeLine(s, x1, y1, x2, y2, 8, 0.3, E.pink, () => s.fx.sparks((x1 + x2) / 2, (y1 + y2) / 2, 8, 'white'));
        }
      }
      return true;
    }
    case 'curseCross': {
      if (b.step === 0) {
        for (const a of [0, Math.PI / 2]) strikeLine(s, ...span(s, e.x, e.y - 6, a), 10, 0.85, E.yellow);
        b.step = 1;
      }
      if (b.step === 1 && b.pt > 1.0) {
        for (const a of [Math.PI / 4, -Math.PI / 4]) strikeLine(s, ...span(s, e.x, e.y - 6, a), 10, 0.85, E.magenta);
        b.step = 2;
      }
      if (b.pt > 2.1) done();
      return true;
    }
    // ---- volcano: the magma core
    case 'meteors': {
      while (b.step < (two ? 8 : 6) && b.pt >= b.step * 0.15) {
        const [x, y] = b.step === 0 ? [p.x, p.y] : [p.x + rand(-60, 60), p.y + rand(-44, 44)];
        strikeCircle(s, x, y, 18, 1.1, E.orange, 'b-meteor', () => {
          s.fx.boom(x, y, 24);
          s.light.flash(x, y, 50, E.orange, 0.2);
        });
        b.step++;
      }
      if (b.pt > 2.4) done();
      return true;
    }
    case 'lavaPools': {
      while (b.step < 3 && b.pt >= b.step * 0.7) {
        const [x, y] = [p.x, p.y];
        strikeCircle(s, x, y, 16, 0.7, E.orange, undefined, () => s.ehazards.push({ x, y, r: 16, t: 5, color: hexToNum(E.orange) }));
        b.step++;
      }
      if (b.pt > 2.4) done();
      return true;
    }
    // ---- factory: the steam colossus
    case 'gearSaws': {
      if (b.step === 0) {
        b.saws = [0, 1, 2].map(() => s.spawnEnemyBullet(e.x, e.y - 10, 0, 0, true));
        b.saws.forEach((q) => (q.life = 8));
        b.step = 1;
      }
      const saws = b.saws ?? [];
      if (b.pt < 3.5) {
        b.angle += dt * 2.6;
        const r = 20 + 70 * (b.pt / 3.5);
        saws.forEach((q, k) => {
          if (q.dead) return;
          q.vx = q.vy = 0;
          q.x = e.x + Math.cos(b.angle + (k / saws.length) * TAU) * r;
          q.y = e.y - 10 + Math.sin(b.angle + (k / saws.length) * TAU) * r * 0.75;
          q.sprite.rotation += dt * 12;
        });
      } else {
        saws.forEach((q, k) => {
          const a = b.angle + (k / saws.length) * TAU;
          q.vx = Math.cos(a) * speed(120);
          q.vy = Math.sin(a) * speed(120);
        });
        b.saws = undefined;
        done();
      }
      return true;
    }
    case 'steamVents':
    case 'swordRain': {
      // Columns across the room: every other one, then the rest.
      const color = name === 'steamVents' ? E.white : E.yellow;
      const cols: number[] = [];
      for (let x = R.x0 + 18; x < R.x1 - 10; x += 34) cols.push(x);
      const wave = (odd: number) => cols.forEach((x, k) => k % 2 === odd && strikeLine(s, ...span(s, x, (R.y0 + R.y1) / 2, Math.PI / 2), 12, 0.9, color, () => (name === 'steamVents' ? s.fx.dust(x, p.y, 3) : s.fx.sparks(x, p.y, 3, 'gold'))));
      if (b.step === 0) {
        wave(0);
        b.step = 1;
      }
      if (b.step === 1 && b.pt > 1.0) {
        wave(1);
        b.step = 2;
      }
      if (b.pt > 2.1) done();
      return true;
    }
    case 'missiles': {
      if (b.step === 0) {
        const a = toward(e, p.x, p.y);
        const n = two ? 6 : 4;
        for (let i = 0; i < n; i++) {
          const q = s.spawnEnemyBullet(e.x, e.y - 12, a + Math.PI + (i - (n - 1) / 2) * 0.5, speed(85), true);
          q.homing = 1.7;
          q.life = 4;
        }
        audio.shoot('rocket');
        b.step = 1;
      }
      if (b.pt > 0.8) done();
      return true;
    }
    // ---- castle: the count in the portrait
    case 'lightsOut': {
      if (b.step === 0) {
        s.light.darkT = 6;
        s.fx.callout(e.x, e.y - 50, '烛火熄灭', E.magenta, true);
        audio.roar();
        b.step = 1;
      }
      // The portraits' eyes open along the walls and stare across the room.
      const times = [0.8, 2.2, 3.6];
      while (b.step - 1 < times.length && b.pt >= times[b.step - 1]) {
        strikeLine(s, R.x0 + 4, p.y - 4, R.x1 - 4, p.y - 4, 8, 1.0, E.red);
        strikeLine(s, p.x, R.y0 + 4, p.x, R.y1 - 4, 8, 1.0, E.red);
        s.fx.sparks(R.x0 + 6, p.y - 4, 4, 'accent');
        s.fx.sparks(R.x1 - 6, p.y - 4, 4, 'accent');
        b.step++;
      }
      if (b.pt > 5) done();
      return true;
    }
    case 'batSwarm': {
      const n = two ? 8 : 6;
      for (let i = 0; i < n; i++) {
        const x = i % 2 ? R.x0 + 20 : R.x1 - 20;
        const y = R.y0 + 30 + ((R.y1 - R.y0 - 60) * i) / n;
        s.queueSpawn('bat', x, y, false, true, 0.6);
      }
      done();
      return true;
    }
    case 'blink': {
      if (b.step === 0) {
        s.fx.dust(e.x, e.y - 6, 10);
        s.tweens.add({ targets: e.sprite, alpha: 0, duration: 200 });
        b.step = 1;
      }
      if (b.step === 1 && b.pt > 0.5) {
        const a = rand(0, TAU);
        e.x = clamp(p.x + Math.cos(a) * 70, R.x0 + 30, R.x1 - 30);
        e.y = clamp(p.y + Math.sin(a) * 55, R.y0 + 40, R.y1 - 30);
        s.tweens.add({ targets: e.sprite, alpha: 1, duration: 160 });
        s.fx.dust(e.x, e.y - 6, 10);
        const aim = toward(e, p.x, p.y);
        for (let i = 0; i < 9; i++) s.spawnEnemyBullet(e.x, e.y - 12, aim + (i - 4) * 0.16, speed(115));
        b.step = 2;
      }
      if (b.pt > 1) done();
      return true;
    }
    // ---- garden: the sword saint
    case 'swordQi': {
      while (b.step < 3 && b.pt >= b.step * 0.45) {
        const a = toward(e, p.x, p.y);
        for (let i = -1; i <= 1; i++) s.spawnEnemyBullet(e.x, e.y - 12, a + i * 0.3, speed(105), true);
        audio.shoot('slash');
        b.step++;
      }
      if (b.pt > 1.4) done();
      return true;
    }
    case 'petalStorm': {
      while (b.step * 0.05 <= b.pt && b.pt < 3) {
        b.angle += 0.27;
        for (const off of [0, Math.PI]) s.spawnEnemyBullet(e.x, e.y - 12, b.angle + off, speed(70));
        b.step++;
      }
      if (Math.random() < 0.3) s.fx.petals(e.x + rand(-30, 30), e.y - 20, 1);
      if (b.pt >= 3) done();
      return true;
    }
    // ---- palace: the marble angel
    case 'judgment': {
      while (b.step < 3 && b.pt >= b.step * 0.6) {
        const [x, y] = [p.x, p.y];
        strikeCircle(s, x, y, 22, 0.9, E.yellow, undefined, () => {
          s.visuals.push({ kind: 'beam', pts: [x, y - 160, x, y], width: 8, t: 0, dur: 0.25, color: hexToNum(E.yellow) });
          s.light.flash(x, y, 70, E.yellow, 0.25);
        });
        b.step++;
      }
      if (b.pt > 2.4) done();
      return true;
    }
    case 'featherFan': {
      while (b.step < 2 && b.pt >= b.step * 0.5) {
        const a = toward(e, p.x, p.y);
        for (let i = 0; i < 9; i++) s.spawnEnemyBullet(e.x, e.y - 14, a + (i - 4) * 0.14 + (b.step % 2) * 0.07, speed(110));
        b.step++;
      }
      if (b.pt > 1.2) done();
      return true;
    }
    // ---- reef: the drowned bell
    case 'bellRings': {
      // The bell tolls on the beat: a ring with a gap to slip through.
      if (b.step < (two ? 4 : 3) && s.rhythm.onBeat && b.pt > 0.1) {
        const n = 24;
        const gap = Math.floor(rand(0, n));
        for (let i = 0; i < n; i++) if (Math.abs(i - gap) > 1) s.spawnEnemyBullet(e.x, e.y - 12, (i / n) * TAU, speed(80));
        s.fx.ring(e.x, e.y - 12, 30, E.yellow, 240, 2);
        audio.spawn('beam');
        b.step++;
      }
      if (b.step >= (two ? 4 : 3) || b.pt > 4) done();
      return true;
    }
    case 'tentacles': {
      while (b.step < (two ? 2 : 1) && b.pt >= b.step * 1.0) {
        const fromLeft = (b.step + Math.floor(s.time0)) % 2 === 0;
        for (const dy of [-30, 0, 30]) {
          const y = p.y + dy;
          strikeLine(s, fromLeft ? R.x0 + 4 : R.x1 - 4, y, fromLeft ? p.x + 60 : p.x - 60, y, 12, 0.9, E.magenta);
        }
        b.step++;
      }
      if (b.pt > (two ? 2.1 : 1.1)) done();
      return true;
    }
    case 'bubbles': {
      if (b.step === 0) {
        const a = toward(e, p.x, p.y);
        for (let i = -2; i <= 2; i++) {
          const q = s.spawnEnemyBullet(e.x, e.y - 12, a + i * 0.28, speed(60), true);
          q.life = 1.6 + Math.abs(i) * 0.15;
          q.split = 8;
        }
        b.step = 1;
      }
      if (b.pt > 1) done();
      return true;
    }
    // ---- neon: the mecha
    case 'laserGrid': {
      const wave = (off: number) => {
        for (let k = 1; k <= 3; k++) {
          const y = R.y0 + ((R.y1 - R.y0) * (k - 0.5 + off)) / 3.5;
          const x = R.x0 + ((R.x1 - R.x0) * (k - 0.5 + off)) / 3.5;
          strikeLine(s, R.x0 + 4, y, R.x1 - 4, y, 8, 1.0, k % 2 ? E.magenta : E.cyan);
          strikeLine(s, x, R.y0 + 4, x, R.y1 - 4, 8, 1.0, k % 2 ? E.cyan : E.magenta);
        }
      };
      if (b.step === 0) {
        wave(0);
        b.step = 1;
      }
      if (two && b.step === 1 && b.pt > 1.2) {
        wave(0.5);
        b.step = 2;
      }
      if (b.pt > (two ? 2.4 : 1.3)) done();
      return true;
    }
    case 'drones': {
      for (let i = 0; i < (two ? 4 : 3); i++) s.queueSpawn('drone', e.x + Math.cos((i / 3) * TAU) * 40, e.y + Math.sin((i / 3) * TAU) * 30);
      done();
      return true;
    }
    case 'summon': {
      // The guardian calls its style's own monsters.
      const local = (Object.keys(ENEMIES) as EnemyKind[]).find((k) => ENEMIES[k].biome === s.kit.id) ?? 'wanderer';
      const kinds: EnemyKind[] = two ? [local, local, 'charger', 'shooter'] : [local, local, 'wanderer'];
      kinds.forEach((kind, i) => {
        const a = (i / kinds.length) * TAU;
        s.queueSpawn(kind, e.x + Math.cos(a) * 46, Math.min(R.y1 - 24, e.y + Math.sin(a) * 40));
      });
      done();
      return true;
    }
  }
  return false;
}
