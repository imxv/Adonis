import { angleDiff, clamp } from '../core/math';
import { ARENA } from './arena';
import type { Enemy } from './entities';
import type { GameScene } from './GameScene';

export const turnToward = (a: number, target: number, maxStep: number) => a + clamp(angleDiff(a, target), -maxStep, maxStep);

export function updateEnemyAI(s: GameScene, e: Enemy, dt: number, slow: number) {
  const p = s.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const toP = Math.atan2(dy, dx);
  e.t += dt * (slow || 0);
  if (slow === 0) {
    e.vx = e.vy = 0;
    return;
  }
  switch (e.kind) {
    case 'wanderer': {
      const a = toP + Math.sin(e.t * 2.2 + e.id) * 0.55;
      e.facing = a;
      e.vx = Math.cos(a) * e.speed;
      e.vy = Math.sin(a) * e.speed;
      e.sprite.setScale(e.scale * (1 + Math.sin(e.t * 9) * 0.04), e.scale * (1 - Math.sin(e.t * 9) * 0.04));
      break;
    }
    case 'charger': {
      if (e.state === 'idle' || e.state === 'approach') {
        e.state = 'approach';
        e.facing = turnToward(e.facing, toP, 4 * dt);
        e.vx = Math.cos(e.facing) * e.speed;
        e.vy = Math.sin(e.facing) * e.speed;
        if (d < 400 && e.t > 1.1) {
          e.state = 'windup';
          e.t = 0;
          e.facing = toP;
          const len = 560;
          s.telegraphs.push({ kind: 'line', x: e.x, y: e.y, x2: e.x + Math.cos(toP) * len, y2: e.y + Math.sin(toP) * len, t: 0, dur: 0.7 });
        }
      } else if (e.state === 'windup') {
        e.vx = e.vy = 0;
        e.sprite.setX(e.x + Math.sin(e.t * 70) * 2);
        if (e.t >= 0.7) {
          e.state = 'charge';
          e.t = 0;
          s.fx.dust(e.x, e.y, 6);
        }
      } else if (e.state === 'charge') {
        const sp = e.mini ? 460 : 560;
        e.vx = Math.cos(e.facing) * sp;
        e.vy = Math.sin(e.facing) * sp;
        if (Math.random() < 0.5) s.fx.dust(e.x, e.y + e.r * 0.6, 1);
        const atWall = e.x < ARENA.left + e.r + 2 || e.x > ARENA.right - e.r - 2 || e.y < ARENA.top + e.r + 2 || e.y > ARENA.bottom - e.r - 2;
        if (e.t > 0.48 || atWall) {
          e.state = 'recover';
          e.t = 0;
          if (atWall) s.fx.shake(0.06);
        }
      } else {
        e.vx *= 0.88;
        e.vy *= 0.88;
        if (e.t > 0.8) {
          e.state = 'approach';
          e.t = 0;
        }
      }
      break;
    }
    case 'shooter': {
      e.facing = turnToward(e.facing, toP, 5 * dt);
      const want = d > 380 ? 1 : d < 250 ? -1 : 0;
      const strafe = e.id % 2 ? 1 : -1;
      const mx = Math.cos(toP) * want + Math.cos(toP + Math.PI / 2) * strafe * 0.55;
      const my = Math.sin(toP) * want + Math.sin(toP + Math.PI / 2) * strafe * 0.55;
      e.vx = mx * e.speed;
      e.vy = my * e.speed;
      if (e.state === 'idle' && e.t > 1.6 + (e.id % 5) * 0.17) {
        e.state = 'aim';
        e.t = 0;
      }
      if (e.state === 'aim') {
        e.vx *= 0.25;
        e.vy *= 0.25;
        e.sprite.setScale(e.scale * (1 + e.t * 0.35));
        if (e.t > 0.42) {
          const speed = 250 + s.run.level * 25;
          const n = e.elite ? 3 : 1;
          for (let i = 0; i < n; i++) s.spawnEnemyBullet(e.x + Math.cos(e.facing) * e.r, e.y + Math.sin(e.facing) * e.r, e.facing + (i - (n - 1) / 2) * 0.22, speed);
          e.state = 'idle';
          e.t = 0;
          e.sprite.setScale(e.scale);
        }
      }
      break;
    }
    case 'bomber': {
      if (e.state === 'fuse') {
        e.vx = e.vy = 0;
        const k = 1 + Math.sin(e.t * 40) * 0.12 + e.t * 0.5;
        e.sprite.setScale(e.scale * k);
        e.flash = Math.sin(e.t * 40) > 0 ? 0.02 : 0;
        if (e.t > 0.6) s.killEnemy(e, '自爆兵');
        break;
      }
      e.facing = toP;
      e.vx = Math.cos(toP) * e.speed;
      e.vy = Math.sin(toP) * e.speed;
      e.sprite.rotation += dt * 4;
      if (d < 82) {
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
  }
}
