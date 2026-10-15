import { angleDiff, clamp } from '../core/math';
import { raycast } from './dungeon';
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
        if (d < 150 && e.t > 1.1) {
          e.state = 'windup';
          e.t = 0;
          e.facing = toP;
          const len = raycast(s.dungeon, e.x, e.y - 3, Math.cos(toP), Math.sin(toP), 210).len;
          s.telegraphs.push({ kind: 'line', x: e.x, y: e.y - 3, x2: e.x + Math.cos(toP) * len, y2: e.y - 3 + Math.sin(toP) * len, t: 0, dur: 0.65 });
        }
      } else if (e.state === 'windup') {
        e.vx = e.vy = 0;
        e.sprite.setX(Math.round(e.x + Math.sin(e.t * 70)));
        if (e.t >= 0.65) {
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
      e.facing = turnToward(e.facing, toP, 5 * dt);
      const want = d > 170 ? 1 : d < 105 ? -1 : 0;
      const strafe = e.id % 2 ? 1 : -1;
      e.vx = (Math.cos(toP) * want + Math.cos(toP + Math.PI / 2) * strafe * 0.5) * e.speed;
      e.vy = (Math.sin(toP) * want + Math.sin(toP + Math.PI / 2) * strafe * 0.5) * e.speed;
      if (e.state === 'idle' && e.t > 1.8 + (e.id % 5) * 0.2 && d < 260) {
        e.state = 'aim';
        e.t = 0;
      }
      if (e.state === 'aim') {
        e.vx *= 0.2;
        e.vy *= 0.2;
        e.flash = Math.floor(e.t * 16) % 2 ? 0.02 : 0;
        if (e.t > 0.4) {
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
  }
}
