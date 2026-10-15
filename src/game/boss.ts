import { TAU, dist, segCircle } from '../core/math';
import { rand } from '../core/rng';
import { audio } from '../audio/audio';
import { K } from '../styles/textures';
import { ui } from '../ui/ui';
import { ARENA } from './arena';
import type { BossState, Enemy } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';
import { turnToward } from './enemyAI';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function spawnBoss(s: GameScene, kind: 'guardian' | 'boar'): Enemy {
  const kit = s.kit;
  const name = kit.bossNames[kind];
  const level = s.run.level;
  const hp = kind === 'boar' ? 5600 : 1500 * (1 + level * 0.75);
  const x = 640;
  const y = 230;
  const sprite = s.add.image(x, y, K(`boss-${kind}`, kit)).setDepth(DEPTH.enemy + 0.5).setScale(0.2);
  const shadow = s.add.image(x, y + 70, 'shadow').setDepth(DEPTH.shadow).setScale(2.6, 2.4);
  s.tweens.add({ targets: sprite, scale: 1, duration: 700, ease: 'Back.easeOut' });
  const boss: BossState = {
    phase: 1,
    queue: [],
    cooldown: 1.6,
    pattern: '',
    pt: 0,
    step: 0,
    angle: 0,
    arms: 4,
    armA: 0,
    armWarn: 0,
    armLive: 0,
    dirX: 0,
    dirY: 0,
    bounces: 0,
    tx: 0,
    ty: 0,
    air: 0,
    enraged: false,
    invuln: 1.2,
    name,
  };
  const e: Enemy = {
    id: s.nextId++,
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    kx: 0,
    ky: 0,
    r: kind === 'boar' ? 64 : 62,
    hp,
    maxHp: hp,
    speed: kind === 'boar' ? 70 : 120,
    contact: 1,
    xp: 0,
    elite: false,
    state: 'idle',
    t: 0,
    t2: 0,
    facing: Math.PI / 2,
    flash: 0,
    dead: false,
    scale: 1,
    status: { burn: 0, burnDps: 0, burnTick: 0, chill: 0, chillStacks: 0, frozen: 0, shock: 0 },
    sprite,
    shadow,
    boss,
  };
  s.enemies.push(e);
  ui.banner(kind === 'boar' ? '宿 敌' : '守 卫', name, kind === 'boar' ? 'THE BOAR' : 'THE GUARDIAN', kind === 'boar' ? '那头撞死阿多尼斯的野猪' : `${kit.name}的守门者`, 1800);
  audio.roar();
  s.fx.shake(0.6);
  s.fx.flash(s.kit.palette.light, 0.35, 400);
  return e;
}

export function bossDeath(s: GameScene, e: Enemy) {
  s.slow(0.22, 1.5);
  s.fx.flash('#ffffff', 0.75, 1000);
  s.fx.shake(1);
  audio.explode(true);
  s.eproj.forEach((p) => s.killProj(p, true));
  for (const m of s.enemies) if (m !== e && !m.dead) s.killEnemy(m, '余波');
  for (let i = 0; i < 7; i++) {
    s.time.delayedCall(i * 140, () => {
      const x = e.x + rand(-80, 80);
      const y = e.y + rand(-60, 60);
      s.fx.ring(x, y, 120, s.kit.palette.accent, 420);
      s.fx.burst(x, y, 20);
      s.fx.petals(x, y, 14);
      audio.explode(i % 2 === 0);
    });
  }
  for (let i = 0; i < 36; i++) s.dropPetal(e.x + rand(-40, 40), e.y + rand(-30, 30), 1);
  s.tweens.add({ targets: e.sprite, scale: 1.4, alpha: 0, angle: rand(-12, 12), duration: 1200, ease: 'Quad.easeIn', onComplete: () => e.sprite.destroy() });
  s.tweens.add({ targets: e.shadow, alpha: 0, duration: 800, onComplete: () => e.shadow.destroy() });
  s.fx.callout(e.x, e.y - 110, e.kind === 'boar' ? '这一次……' : '画破了', s.kit.palette.accent, 40);
  e.boss!.armLive = e.boss!.armWarn = 0;
  s.onRoomCleared(true);
}

export function updateBoss(s: GameScene, e: Enemy, dt: number, slow: number) {
  const b = e.boss!;
  b.invuln -= dt;
  e.t += dt;
  if (e.kind === 'guardian') guardian(s, e, b, dt * Math.max(0.35, slow));
  else boar(s, e, b, dt * Math.max(0.35, slow));
}

function bulletSpeed(s: GameScene, base: number) {
  return base * (1 + s.run.level * 0.12);
}

function phaseShift(s: GameScene, e: Enemy, b: BossState, text: string) {
  b.phase = 2;
  b.invuln = 1.2;
  b.queue = [];
  b.pattern = '';
  b.cooldown = 1.3;
  b.armLive = b.armWarn = 0;
  s.eproj.forEach((p) => s.killProj(p, true));
  s.fx.flash(s.dangerColor(), 0.45, 500);
  s.fx.shake(0.8);
  s.fx.ring(e.x, e.y, 420, s.dangerColor(), 600, 1);
  s.fx.callout(e.x, e.y - 120, text, s.kit.palette.accent, 44);
  audio.roar();
  s.stop(0.15);
  const p = s.player;
  const a = Math.atan2(p.y - e.y, p.x - e.x);
  p.vx += Math.cos(a) * 700;
  p.vy += Math.sin(a) * 700;
}

function guardian(s: GameScene, e: Enemy, b: BossState, dt: number) {
  const p = s.player;
  if (b.phase === 1 && e.hp < e.maxHp * 0.55) phaseShift(s, e, b, '第二幕');

  let tx: number;
  let ty: number;
  if (b.phase === 1) {
    tx = 640 + Math.sin(s.time0 * 0.45) * 260;
    ty = 210 + Math.sin(s.time0 * 0.9) * 40;
  } else {
    const a = Math.atan2(e.y - p.y, e.x - p.x);
    tx = p.x + Math.cos(a) * 260;
    ty = Math.min(ARENA.bottom - 120, p.y + Math.sin(a) * 260);
  }
  const k = b.phase === 1 ? 1.4 : 0.8;
  e.vx = Math.max(-170, Math.min(170, (tx - e.x) * k));
  e.vy = Math.max(-170, Math.min(170, (ty - e.y) * k));
  e.sprite.setRotation(Math.sin(s.time0 * 0.8) * 0.08);

  // Rotating arms: warn, then live.
  if (b.armWarn > 0) {
    b.armWarn -= dt;
    b.armA += dt * 0.2;
    if (b.armWarn <= 0) b.armLive = b.phase === 1 ? 2.6 : 3.2;
  } else if (b.armLive > 0) {
    b.armLive -= dt;
    b.armA += dt * (b.phase === 1 ? 0.8 : 1.15) * (b.step % 2 ? -1 : 1);
    for (let i = 0; i < b.arms; i++) {
      const a = b.armA + (i / b.arms) * TAU;
      if (segCircle(e.x, e.y, e.x + Math.cos(a) * 1500, e.y + Math.sin(a) * 1500, p.x, p.y, p.r + 4)) s.hurtPlayer(1, e.x, e.y);
    }
  }

  b.cooldown -= dt;
  if (!b.pattern && b.cooldown <= 0) {
    if (!b.queue.length) {
      b.queue = s.run.rng.shuffle(b.phase === 1 ? ['ring', 'fan', 'sweep', 'summon', 'ring', 'fan'] : ['spiral', 'fan', 'sweep', 'ring', 'summon', 'spiral']);
    }
    b.pattern = b.queue.shift()!;
    b.pt = 0;
    b.step = 0;
  }
  if (!b.pattern) return;
  b.pt += dt;
  const done = () => {
    b.pattern = '';
    b.cooldown = b.phase === 1 ? 1.1 : 0.7;
  };
  switch (b.pattern) {
    case 'ring': {
      if (b.pt >= b.step * 0.4) {
        const n = b.phase === 1 ? 18 : 24;
        b.angle += 0.17;
        for (let i = 0; i < n; i++) s.spawnEnemyBullet(e.x, e.y, b.angle + (i / n) * TAU, bulletSpeed(s, 185));
        s.fx.ring(e.x, e.y, 90, s.dangerColor(), 240);
        b.step++;
        if (b.step >= 3) done();
      }
      break;
    }
    case 'fan': {
      if (b.pt >= b.step * 0.28) {
        const n = b.phase === 1 ? 5 : 7;
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        for (let i = 0; i < n; i++) s.spawnEnemyBullet(e.x, e.y, a + (i - (n - 1) / 2) * 0.13, bulletSpeed(s, 290), i === (n - 1) / 2);
        b.step++;
        if (b.step >= 3) done();
      }
      break;
    }
    case 'summon': {
      const kinds = b.phase === 1 ? (['wanderer', 'wanderer', 'shooter'] as const) : (['wanderer', 'charger', 'charger', 'shooter'] as const);
      kinds.forEach((kind, i) => {
        const a = (i / kinds.length) * TAU;
        s.queueSpawn(kind, e.x + Math.cos(a) * 110, Math.min(ARENA.bottom - 40, e.y + Math.sin(a) * 110));
      });
      done();
      break;
    }
    case 'sweep': {
      b.arms = b.phase === 1 ? 4 : 6;
      b.armA = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI / b.arms;
      b.armWarn = 1.0;
      b.step = Math.floor(rand(0, 2));
      b.pattern = '';
      b.cooldown = (b.phase === 1 ? 2.6 : 3.2) + 1.2;
      break;
    }
    case 'spiral': {
      const every = 0.045;
      while (b.step * every <= b.pt && b.pt < 3.2) {
        b.angle += GOLDEN;
        s.spawnEnemyBullet(e.x, e.y, b.angle, bulletSpeed(s, 165));
        b.step++;
      }
      if (b.pt >= 3.2) done();
      break;
    }
  }
}

function boar(s: GameScene, e: Enemy, b: BossState, dt: number) {
  const p = s.player;
  const toP = Math.atan2(p.y - e.y, p.x - e.x);
  if (b.phase === 1 && e.hp < e.maxHp * 0.5) {
    phaseShift(s, e, b, '怒');
    b.enraged = true;
    e.state = 'idle';
    b.air = 0;
  }
  const rage = b.enraged ? 1.18 : 1;
  e.t2 += dt;

  switch (e.state) {
    case 'idle': {
      e.facing = toP;
      e.vx = Math.cos(toP) * e.speed * rage;
      e.vy = Math.sin(toP) * e.speed * rage;
      b.cooldown -= dt;
      if (b.cooldown <= 0) {
        const minions = s.enemies.filter((m) => !m.dead && !m.boss).length;
        const pick = s.run.rng.weighted(
          [
            ['charge', 46],
            ['stomp', 26],
            ['fan', 18],
            ['summon', minions < 3 ? 12 : 0],
          ] as [string, number][],
          (x) => x[1],
        )[0];
        e.state = pick === 'charge' ? 'windup' : pick === 'stomp' ? 'stomp-up' : pick;
        e.t2 = 0;
        if (e.state === 'windup') {
          b.dirX = Math.cos(toP);
          b.dirY = Math.sin(toP);
          s.telegraphs.push({ kind: 'line', x: e.x, y: e.y, x2: e.x + b.dirX * 1400, y2: e.y + b.dirY * 1400, t: 0, dur: b.enraged ? 0.55 : 0.75 });
        }
        if (e.state === 'stomp-up') {
          b.tx = p.x;
          b.ty = p.y;
          s.telegraphs.push({ kind: 'circle', x: p.x, y: p.y, r: 128, t: 0, dur: 0.9 });
        }
      }
      break;
    }
    case 'windup': {
      e.vx = e.vy = 0;
      e.facing = Math.atan2(b.dirY, b.dirX);
      e.sprite.setX(e.x + Math.sin(e.t2 * 80) * 3);
      if (Math.random() < 0.4) s.fx.dust(e.x - b.dirX * 40, e.y + 40, 1);
      if (e.t2 >= (b.enraged ? 0.55 : 0.75)) {
        e.state = 'charge';
        e.t2 = 0;
        b.bounces = b.enraged ? 2 : 0;
        audio.roar();
      }
      break;
    }
    case 'charge': {
      const sp = 780 * rage;
      e.vx = b.dirX * sp;
      e.vy = b.dirY * sp;
      s.fx.dust(e.x - b.dirX * 30, e.y + 44, 1);
      for (const o of s.obstacles) {
        if (!o.dead && o.kind === 'pillar' && dist(e.x, e.y, o.x, o.y) < e.r + o.r) {
          o.dead = true;
          s.fx.burst(o.x, o.y, 24);
          s.fx.shake(0.3);
          audio.explode(false);
          o.sprite.destroy();
        }
      }
      const hitX = e.x < ARENA.left + e.r + 4 || e.x > ARENA.right - e.r - 4;
      const hitY = e.y < ARENA.top + e.r + 4 || e.y > ARENA.bottom - e.r - 4;
      if (hitX || hitY || e.t2 > 2.2) {
        s.fx.shake(0.55);
        s.fx.dust(e.x, e.y, 18);
        audio.explode(true);
        if (b.enraged) {
          for (let i = 0; i < 12; i++) s.spawnEnemyBullet(e.x, e.y, (i / 12) * TAU, 210);
        }
        if (b.bounces > 0) {
          b.bounces--;
          if (hitX) b.dirX = -b.dirX;
          if (hitY) b.dirY = -b.dirY;
          const a = Math.atan2(b.dirY, b.dirX);
          const na = turnToward(a, Math.atan2(p.y - e.y, p.x - e.x), 0.7);
          b.dirX = Math.cos(na);
          b.dirY = Math.sin(na);
          e.x += b.dirX * 10;
          e.y += b.dirY * 10;
          e.t2 = 0;
        } else {
          e.state = 'stunned';
          e.t2 = 0;
          s.fx.callout(e.x, e.y - 90, '破绽', s.kit.palette.accent, 32);
        }
      }
      break;
    }
    case 'stunned': {
      e.vx = e.vy = 0;
      e.sprite.setAngle(Math.sin(e.t2 * 30) * 3);
      if (e.t2 > 1.15) {
        e.state = 'idle';
        e.sprite.setAngle(0);
        b.cooldown = b.enraged ? 0.6 : 1.0;
      }
      break;
    }
    case 'stomp-up': {
      e.vx = e.vy = 0;
      b.air = Math.min(160, b.air + dt * 400);
      e.sprite.setScale(1 + b.air / 600);
      if (e.t2 < 0.45) {
        b.tx = p.x;
        b.ty = p.y;
        const t = s.telegraphs[s.telegraphs.length - 1];
        if (t && t.kind === 'circle') {
          t.x = p.x;
          t.y = p.y;
        }
      }
      e.shadow.setPosition(e.x + (b.tx - e.x) * (e.t2 / 0.9), e.y + (b.ty - e.y) * (e.t2 / 0.9) + 60);
      if (e.t2 >= 0.9) {
        e.state = 'stomp-down';
        e.t2 = 0;
      }
      break;
    }
    case 'stomp-down': {
      const k = Math.min(1, e.t2 / 0.16);
      e.x += (b.tx - e.x) * k;
      e.y += (b.ty - e.y) * k;
      b.air = 160 * (1 - k);
      e.sprite.setScale(1 + b.air / 600);
      if (k >= 1) {
        b.air = 0;
        e.state = 'idle';
        b.cooldown = b.enraged ? 0.7 : 1.1;
        s.fx.ring(e.x, e.y, 150, s.dangerColor(), 380);
        s.fx.dust(e.x, e.y, 24);
        s.fx.shake(0.7);
        audio.explode(true);
        if (dist(p.x, p.y, e.x, e.y) < 132) s.hurtPlayer(2, e.x, e.y);
        if (b.enraged) for (let i = 0; i < 16; i++) s.spawnEnemyBullet(e.x, e.y, (i / 16) * TAU + 0.1, 230);
      }
      break;
    }
    case 'fan': {
      const n = b.enraged ? 11 : 7;
      for (let i = 0; i < n; i++) s.spawnEnemyBullet(e.x + Math.cos(toP) * 70, e.y + Math.sin(toP) * 50, toP + (i - (n - 1) / 2) * 0.14, 300, true);
      e.state = 'idle';
      b.cooldown = b.enraged ? 0.8 : 1.2;
      break;
    }
    case 'summon': {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        s.queueSpawn('charger', e.x + Math.cos(a) * 120, e.y + Math.sin(a) * 100, false, true);
      }
      s.fx.callout(e.x, e.y - 100, '小猪们！', s.kit.palette.accent, 26);
      e.state = 'idle';
      b.cooldown = 1.2;
      break;
    }
  }
}
