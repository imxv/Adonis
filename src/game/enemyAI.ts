import { audio } from '../audio/audio';
import { angleDiff, clamp } from '../core/math';
import { raycast } from './dungeon';
import type { Enemy } from './entities';
import { lineClear } from './flow';
import type { GameScene } from './GameScene';

export const turnToward = (a: number, target: number, maxStep: number) => a + clamp(angleDiff(a, target), -maxStep, maxStep);

/** Enemies attack on the beat, but take turns: half of them on even beats, half on odd ones. */
const myBeat = (s: GameScene, e: Enemy) => s.rhythm.onBeat && (s.rhythm.beat + e.id) % 2 === 0;

export function updateEnemyAI(s: GameScene, e: Enemy, dt: number, slow: number) {
  const p = s.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  // Straight at the player when nothing is in the way, otherwise around the cover.
  const direct = Math.atan2(dy, dx);
  const los = lineClear(s.dungeon, e.x, e.y, direct, d, e.r);
  const toP = los ? direct : (s.flow.heading(e.x, e.y) ?? direct);
  e.t += dt * (slow || 0);
  if (slow === 0) {
    e.vx = e.vy = 0;
    return;
  }
  switch (e.kind) {
    case 'wanderer': {
      const a = toP + Math.sin(e.t * 2 + e.id) * 0.5;
      e.facing = a;
      e.vx = Math.cos(a) * e.speed;
      e.vy = Math.sin(a) * e.speed;
      break;
    }
    case 'bat': {
      if (e.state === 'swarm') {
        e.vx = Math.cos(e.facing) * 95;
        e.vy = Math.sin(e.t * 7 + e.id) * 40 + clamp(dy, -30, 30);
        if (e.t > 7) e.state = 'idle';
        break;
      }
      const a = toP + Math.sin(e.t * 5 + e.id * 1.7) * 0.9;
      e.facing = a;
      e.vx = Math.cos(a) * e.speed;
      e.vy = Math.sin(a) * e.speed;
      break;
    }
    case 'charger': {
      if (e.state === 'idle' || e.state === 'approach') {
        e.state = 'approach';
        e.facing = turnToward(e.facing, toP, 4 * dt);
        e.vx = Math.cos(e.facing) * e.speed;
        e.vy = Math.sin(e.facing) * e.speed;
        // Wind up on a beat and charge on the next one, so the charge lands in time with the music.
        if (d < 150 && e.t > 1.1 && myBeat(s, e)) {
          e.state = 'windup';
          e.t = 0;
          e.facing = toP;
          const len = raycast(s.dungeon, e.x, e.y - 3, Math.cos(toP), Math.sin(toP), 210).len;
          s.telegraphs.push({ kind: 'line', x: e.x, y: e.y - 3, x2: e.x + Math.cos(toP) * len, y2: e.y - 3 + Math.sin(toP) * len, t: 0, dur: 60 / s.rhythm.bpm });
          audio.windup();
        }
      } else if (e.state === 'windup') {
        e.vx = e.vy = 0;
        e.sprite.setX(Math.round(e.x + Math.sin(e.t * 70)));
        if ((s.rhythm.onBeat && e.t > 0.2) || e.t >= 1.2) {
          e.state = 'charge';
          e.t = 0;
          s.fx.dust(e.x, e.y, 4);
        }
      } else if (e.state === 'charge') {
        const sp = e.mini ? 190 : 230;
        e.vx = Math.cos(e.facing) * sp;
        e.vy = Math.sin(e.facing) * sp;
        if (Math.random() < 0.4) s.fx.dust(e.x, e.y, 1);
        const atWall = s.blocked(e.x + Math.cos(e.facing) * (e.r + 3), e.y + Math.sin(e.facing) * (e.r + 3));
        if (e.t > 0.5 || atWall) {
          e.state = 'recover';
          e.t = 0;
        }
      } else {
        e.vx *= 0.85;
        e.vy *= 0.85;
        if (e.t > 0.7) {
          e.state = 'approach';
          e.t = 0;
        }
      }
      break;
    }
    case 'shooter': {
      // The aim locks when the shooter raises its gun: it fires on the next beat where you were, so moving on the beat dodges it.
      if (e.state !== 'aim') e.facing = turnToward(e.facing, toP, 5 * dt);
      const want = !los || d > 170 ? 1 : d < 105 ? -1 : 0;
      const strafe = los ? (e.id % 2 ? 1 : -1) : 0;
      e.vx = (Math.cos(toP) * want + Math.cos(toP + Math.PI / 2) * strafe * 0.5) * e.speed;
      e.vy = (Math.sin(toP) * want + Math.sin(toP + Math.PI / 2) * strafe * 0.5) * e.speed;
      if (e.state === 'idle' && e.t > 1.8 + (e.id % 5) * 0.2 && d < 260 && los && myBeat(s, e)) {
        e.state = 'aim';
        e.t = 0;
        // A short line shows where the shot will go on the next beat.
        const len = Math.min(44, raycast(s.dungeon, e.x, e.y - 6, Math.cos(e.facing), Math.sin(e.facing), 44).len);
        s.telegraphs.push({ kind: 'line', x: e.x, y: e.y - 6, x2: e.x + Math.cos(e.facing) * len, y2: e.y - 6 + Math.sin(e.facing) * len, t: 0, dur: 60 / s.rhythm.bpm });
        audio.windup();
      }
      if (e.state === 'aim') {
        e.vx *= 0.2;
        e.vy *= 0.2;
        e.flash = Math.floor(e.t * 16) % 2 ? 0.02 : 0;
        if ((s.rhythm.onBeat && e.t > 0.2) || e.t > 1.2) {
          const speed = 95 + s.run.level * 12;
          const n = e.elite ? 5 : 1;
          for (let i = 0; i < n; i++) s.spawnEnemyBullet(e.x, e.y - 6, e.facing + (i - (n - 1) / 2) * 0.24, speed);
          e.state = 'idle';
          e.t = 0;
        }
      }
      break;
    }
    case 'bomber': {
      if (e.state === 'fuse') {
        e.vx = e.vy = 0;
        e.sprite.setScale(e.scale * (1 + Math.sin(e.t * 40) * 0.1 + e.t * 0.4));
        e.flash = Math.sin(e.t * 40) > 0 ? 0.02 : 0;
        if (e.t > 0.6) s.killEnemy(e, '炸弹怪');
        break;
      }
      e.facing = toP;
      e.vx = Math.cos(toP) * e.speed;
      e.vy = Math.sin(toP) * e.speed;
      if (d < 26) {
        e.state = 'fuse';
        e.t = 0;
      }
      break;
    }
    case 'shield': {
      e.facing = turnToward(e.facing, toP, 1.5 * dt);
      e.vx = Math.cos(e.facing) * e.speed;
      e.vy = Math.sin(e.facing) * e.speed;
      break;
    }
    case 'sporeling':
    case 'magma': {
      const a = toP + Math.sin(e.t * 1.6 + e.id) * 0.35;
      e.facing = a;
      e.vx = Math.cos(a) * e.speed;
      e.vy = Math.sin(a) * e.speed;
      break;
    }
    case 'brute': {
      // Plods in; next to the knight it raises its club on a beat, and slams on the next one.
      if (e.state === 'raise') {
        e.vx = e.vy = 0;
        break;
      }
      e.facing = turnToward(e.facing, toP, 3 * dt);
      e.vx = Math.cos(e.facing) * e.speed;
      e.vy = Math.sin(e.facing) * e.speed;
      if (d < 44 && e.t > 1.4 && myBeat(s, e)) {
        e.state = 'raise';
        e.t = 0;
        const [x, y] = [e.x, e.y];
        s.telegraphs.push({
          kind: 'circle',
          x,
          y,
          r: 34,
          t: 0,
          dur: 60 / s.rhythm.bpm,
          onDone: () => {
            if (e.dead) return;
            e.state = 'idle';
            e.t = 0;
            s.fx.ring(x, y, 34, s.kit.palette.danger, 260, 2);
            s.fx.dust(x, y, 10);
            s.fx.shake(0.12);
            if (Math.hypot(s.player.x - x, s.player.y - y) < 34 + s.player.r) s.hurtPlayer(1, x, y);
          },
        });
      }
      break;
    }
    case 'yeti': {
      e.facing = turnToward(e.facing, toP, 2.5 * dt);
      const want = !los || d > 120 ? 1 : d < 60 ? -0.5 : 0.2;
      e.vx = Math.cos(toP) * e.speed * want;
      e.vy = Math.sin(toP) * e.speed * want;
      if (e.t > 2.6 && d < 220 && los && myBeat(s, e)) {
        e.t = 0;
        s.spawnEnemyBullet(e.x, e.y - 8, direct, 80 + s.run.level * 8, true);
        s.fx.dust(e.x, e.y - 6, 4);
      }
      break;
    }
    case 'scorpion': {
      // Scuttles in fast; close up it lunges on its beat, then spits three barbs.
      if (e.state === 'lunge') {
        if (e.t > 0.24) {
          e.state = 'recover';
          e.t = 0;
          for (const k of [-1, 0, 1]) s.spawnEnemyBullet(e.x, e.y - 4, e.facing + k * 0.3, 110 + s.run.level * 10);
        }
        break;
      }
      if (e.state === 'recover') {
        e.vx *= 0.85;
        e.vy *= 0.85;
        if (e.t > 0.7) {
          e.state = 'idle';
          e.t = 0;
        }
        break;
      }
      const a = toP + Math.sin(e.t * 9 + e.id) * 0.5;
      e.vx = Math.cos(a) * e.speed;
      e.vy = Math.sin(a) * e.speed;
      if (d < 70 && e.t > 1 && los && myBeat(s, e)) {
        e.state = 'lunge';
        e.t = 0;
        e.facing = direct;
        e.vx = Math.cos(direct) * 170;
        e.vy = Math.sin(direct) * 170;
      }
      break;
    }
    case 'turret': {
      // Bolted down: every other beat of its own, a ring of bullets, turning a little each time.
      e.vx = e.vy = e.kx = e.ky = 0;
      if (e.t > 2 && myBeat(s, e)) {
        e.t = 0;
        e.facing += 0.35;
        const n = 8 + Math.min(4, s.run.level);
        for (let i = 0; i < n; i++) s.spawnEnemyBullet(e.x, e.y - 6, e.facing + (i / n) * Math.PI * 2, 70 + s.run.level * 8);
        s.fx.ring(e.x, e.y - 6, 14, s.kit.palette.danger, 160, 1);
      }
      break;
    }
    case 'ghost': {
      // Drifts straight through walls; every few seconds it fades out of reach for a while.
      e.t2 += dt;
      e.state = e.t2 % 5 > 3.6 ? 'fade' : 'idle';
      const a = direct + Math.sin(e.t * 2 + e.id) * 0.6;
      e.vx = Math.cos(a) * e.speed;
      e.vy = Math.sin(a) * e.speed;
      break;
    }
    case 'ninja': {
      // Blinks next to the knight on its beat, throws three stars on the next one.
      if (e.state === 'aim') {
        e.vx = e.vy = 0;
        if ((s.rhythm.onBeat && e.t > 0.2) || e.t > 1.2) {
          for (const k of [-1, 0, 1]) s.spawnEnemyBullet(e.x, e.y - 5, direct + k * 0.22, 130 + s.run.level * 10);
          e.state = 'idle';
          e.t = 0;
        }
        break;
      }
      const a = toP + Math.PI / 2 * (e.id % 2 ? 1 : -1) * 0.6;
      e.vx = Math.cos(a) * e.speed;
      e.vy = Math.sin(a) * e.speed;
      if (e.t > 2.2 && d < 240 && myBeat(s, e)) {
        const spot = s.blinkSpot(e);
        if (spot) {
          s.fx.dust(e.x, e.y, 6);
          [e.x, e.y] = spot;
          s.fx.dust(e.x, e.y, 6);
          e.state = 'aim';
          e.t = 0;
        }
      }
      break;
    }
    case 'angel': {
      // Moves only while the knight looks away; frozen in stone while watched.
      const watched = Math.abs(angleDiff(s.player.aim, Math.atan2(e.y - p.y, e.x - p.x))) < 0.75;
      e.state = watched ? 'stone' : 'idle';
      if (watched) e.vx = e.vy = 0;
      else {
        e.vx = Math.cos(toP) * e.speed;
        e.vy = Math.sin(toP) * e.speed;
      }
      break;
    }
    case 'jelly': {
      // Bobs toward the knight; close up it charges on its beat and pulses on the next.
      if (e.state === 'pulse') {
        e.vx = e.vy = 0;
        break;
      }
      const a = toP + Math.sin(e.t * 1.3 + e.id) * 0.5;
      const bob = 0.6 + Math.max(0, Math.sin(e.t * 3)) * 0.8;
      e.vx = Math.cos(a) * e.speed * bob;
      e.vy = Math.sin(a) * e.speed * bob;
      if (d < 60 && e.t > 2 && myBeat(s, e)) {
        e.state = 'pulse';
        e.t = 0;
        const [x, y] = [e.x, e.y - 4];
        s.telegraphs.push({
          kind: 'circle',
          x,
          y,
          r: 40,
          t: 0,
          dur: 60 / s.rhythm.bpm,
          onDone: () => {
            if (e.dead) return;
            e.state = 'idle';
            e.t = 0;
            s.fx.ring(x, y, 40, '#2ce8f5', 220, 2);
            s.fx.sparks(x, y, 8, 'shock');
            if (Math.hypot(s.player.x - x, s.player.y - y) < 40 + s.player.r) s.hurtPlayer(1, x, y);
          },
        });
      }
      break;
    }
    case 'drone': {
      // Flies over everything, keeps its distance, circles, and fires a two-shot burst on its beat.
      const want = d > 150 ? 1 : d < 90 ? -1 : 0;
      const strafe = e.id % 2 ? 1 : -1;
      e.vx = (Math.cos(direct) * want + Math.cos(direct + Math.PI / 2) * strafe * 0.7) * e.speed;
      e.vy = (Math.sin(direct) * want + Math.sin(direct + Math.PI / 2) * strafe * 0.7) * e.speed;
      if (e.t > 1.6 && d < 260 && myBeat(s, e)) {
        e.t = 0;
        const sp = 120 + s.run.level * 10;
        s.spawnEnemyBullet(e.x, e.y - 4, direct, sp);
        s.time.delayedCall(110, () => !e.dead && s.spawnEnemyBullet(e.x, e.y - 4, Math.atan2(s.player.y - e.y, s.player.x - e.x), sp));
      }
      break;
    }
  }
}
