import { TAU, clamp, dist, segCircle } from '../core/math';
import { rand } from '../core/rng';
import { audio } from '../audio/audio';
import { K } from '../styles/textures';
import { E } from '../pixel/palette';
import { raycast } from './dungeon';
import { freshStatus, type BossState, type Enemy } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';
import { turnToward } from './enemyAI';
import { GUARDIAN_SKILLS, SELF_MOVING, runSkill } from './bossSkills';
import { WINDUP, actTwo, beginWindup, initLook, release, shatterBoss } from './bossAnim';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function spawnBoss(s: GameScene, kind: 'guardian' | 'boar'): Enemy {
  const kit = s.kit;
  const name = kit.bossNames[kind];
  const level = s.run.level;
  // The boar waits on the fifth floor, where the knight is at its strongest.
  const hp = (kind === 'boar' ? 5200 : 760 * (1 + level * 0.8)) * s.run.diff.hp;
  const R = s.roomRect();
  const x = R.cx;
  const y = R.y0 + 92;
  const key = kind === 'boar' ? 'boss-boar' : K('boss-guardian', kit);
  const sprite = s.add.image(x, y, key).setDepth(DEPTH.enemy + 0.5).setOrigin(0.5, 0.85).setScale(2);
  const shadow = s.add.image(x, y, 'shadow').setDepth(DEPTH.shadow).setScale(4, 3);
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
    // Until it has landed and roared (bossAnim ends this early when the roar is over).
    intro: 4,
    bar: 0,
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
    r: kind === 'boar' ? 22 : 20,
    hp,
    maxHp: hp,
    speed: kind === 'boar' ? 32 : 60,
    contact: 1,
    xp: 0,
    elite: false,
    state: 'idle',
    t: 0,
    t2: 0,
    anim: 0,
    facing: Math.PI / 2,
    flash: 0,
    dead: false,
    scale: 2,
    status: freshStatus(),
    sprite,
    shadow,
    boss,
  };
  s.enemies.push(e);
  // It breaks out of its summon just above the floor, drops (or floats down), lands and roars (see bossAnim).
  boss.look = initLook(s, e);
  const accent = boss.look.accent;
  s.fx.flash(E.white, 0.55, 360);
  s.fx.ring(x, y - 30, 120, accent, 420, 3);
  s.fx.burst(x, y - 30, 24);
  s.fx.sparks(x, y - 30, 20, 'white');
  s.light.flash(x, y - 30, 160, accent, 0.4);
  audio.bossBreak();
  return e;
}

export function bossDeath(s: GameScene, e: Enemy) {
  // The camera drifts over to the fallen guardian while time hangs (the bullet time comes with the room clear).
  s.camFocus = { x: e.x, y: e.y - 16, t: 2.4 };
  s.light.darkT = 0;
  s.fx.flash('#ffffff', 0.75, 1000);
  s.fx.shake(1);
  audio.explode(true);
  s.eproj.forEach((p) => s.killProj(p, true));
  for (const m of s.enemies) if (m !== e && !m.dead) s.killEnemy(m, '余波');
  for (let i = 0; i < 7; i++) {
    s.time.delayedCall(i * 140, () => {
      const x = e.x + rand(-30, 30);
      const y = e.y - 10 + rand(-24, 24);
      s.fx.boom(x, y, 40);
      s.fx.ring(x, y, 60, E.yellow, 420);
      s.fx.burst(x, y, 20);
      s.fx.petals(x, y, 14);
      audio.explode(i % 2 === 0);
    });
  }
  for (let i = 0; i < 24; i++) s.dropGem(e.x + rand(-30, 30), e.y + rand(-20, 20), 5);
  s.dropChest(e.x - 14, e.y + 10);
  if (e.kind !== 'boar') s.dropChest(e.x + 14, e.y + 10, true);
  shatterBoss(s, e);
  s.tweens.add({ targets: e.shadow, alpha: 0, duration: 800, onComplete: () => e.shadow.destroy() });
  s.fx.callout(e.x, e.y - 60, e.kind === 'boar' ? '这一次……' : '守卫倒下了', E.yellow, true);
  e.boss!.armLive = e.boss!.armWarn = 0;
  s.onRoomCleared(true);
}

export function updateBoss(s: GameScene, e: Enemy, dt: number, slow: number) {
  const b = e.boss!;
  b.bar = Math.min(1, (b.bar ?? 1) + dt / 1.6);
  if ((b.intro ?? 0) > 0) {
    // Still arriving: it holds its ground and nothing hurts it.
    b.intro! -= dt;
    b.invuln = Math.max(b.invuln, 0.25);
    e.vx = e.vy = 0;
    return;
  }
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
  s.fx.flash(s.kit.palette.danger, 0.4, 500);
  s.fx.shake(0.8);
  s.fx.ring(e.x, e.y, 200, s.kit.palette.danger, 600, 3);
  s.fx.callout(e.x, e.y - 60, text, E.red, true);
  audio.roar();
  s.stop(0.15);
  b.windup = 0;
  actTwo(s, e);
  const p = s.player;
  const a = Math.atan2(p.y - e.y, p.x - e.x);
  p.vx += Math.cos(a) * 300;
  p.vy += Math.sin(a) * 300;
}

function guardian(s: GameScene, e: Enemy, b: BossState, dt: number) {
  const p = s.player;
  if (b.phase === 1 && e.hp < e.maxHp * 0.55) phaseShift(s, e, b, '第二幕');

  const R = s.roomRect();
  let tx: number;
  let ty: number;
  if (b.phase === 1) {
    tx = R.cx + Math.sin(s.time0 * 0.45) * (R.x1 - R.x0) * 0.32;
    ty = R.y0 + 84 + Math.sin(s.time0 * 0.9) * 20;
  } else {
    const a = Math.atan2(e.y - p.y, e.x - p.x);
    tx = clamp(p.x + Math.cos(a) * 110, R.x0 + 48, R.x1 - 48);
    ty = clamp(p.y + Math.sin(a) * 90, R.y0 + 56, R.y1 - 48);
  }
  const k = b.phase === 1 ? 1.4 : 0.8;
  if (SELF_MOVING.has(b.pattern) && !b.windup) e.vx = e.vy = 0;
  else {
    // Gathering a move roots it in place.
    const hold = b.windup ? 0.2 : 1;
    e.vx = Math.max(-80, Math.min(80, (tx - e.x) * k)) * hold;
    e.vy = Math.max(-80, Math.min(80, (ty - e.y) * k)) * hold;
  }

  // Between moves it changes ground: a leap with a slam (a glide for the floating ones) instead of a slow drift.
  if (b.leap) {
    leapStep(s, e, b, dt);
    return;
  }
  b.leapT = (b.leapT ?? 2.5) - dt;
  if (b.leapT <= 0 && !b.pattern && b.armLive <= 0 && b.armWarn <= 0 && b.cooldown > 0.3 && b.invuln <= 0) {
    startLeap(s, e, b);
    return;
  }

  // Rotating arms: warn, then live.
  if (b.armWarn > 0) {
    b.armWarn -= dt;
    b.armA += dt * 0.2;
    if (b.armWarn <= 0) b.armLive = b.phase === 1 ? 2.6 : 3.2;
  } else if (b.armLive > 0) {
    b.armLive -= dt;
    b.armA += dt * (b.phase === 1 ? 0.8 : 1.15) * (b.step % 2 ? -1 : 1);
    // The arms stop at walls and pillars, so cover is a real answer to them.
    for (let i = 0; i < b.arms; i++) {
      const a = b.armA + (i / b.arms) * TAU;
      const len = raycast(s.dungeon, e.x, e.y - 10, Math.cos(a), Math.sin(a), 600, true).len;
      if (segCircle(e.x, e.y - 10, e.x + Math.cos(a) * len, e.y - 10 + Math.sin(a) * len, p.x, p.y - 4, p.r + 2)) s.hurtPlayer(1, e.x, e.y);
    }
  }

  b.cooldown -= dt;
  if (!b.pattern && b.cooldown <= 0) {
    if (!b.queue.length) {
      // Each style's guardian has its own moves, drawn from its subtitle.
      const own = GUARDIAN_SKILLS[s.kit.id];
      b.queue = s.run.rng.shuffle(own ? [...own[b.phase - 1]] : b.phase === 1 ? ['ring', 'fan', 'sweep', 'summon', 'ring', 'fan'] : ['spiral', 'fan', 'sweep', 'ring', 'summon', 'spiral']);
    }
    b.pattern = b.queue.shift()!;
    b.pt = 0;
    b.step = 0;
    // Every move is gathered first: its name, its pose, the light drawn in. Then it is let go.
    b.windup = WINDUP[b.phase - 1];
    beginWindup(s, e, b, b.windup);
  }
  if (!b.pattern) return;
  if (b.windup && b.windup > 0) {
    b.windup -= dt;
    if (b.windup > 0) return;
    b.windup = 0;
    release(s, e, b);
  }
  b.pt += dt;
  const done = () => {
    b.pattern = '';
    b.cooldown = b.phase === 1 ? 1.1 : 0.7;
  };
  if (runSkill(s, e, b, dt, b.pattern, done)) return;
  switch (b.pattern) {
    case 'ring': {
      if (b.pt >= b.step * 0.4) {
        const n = b.phase === 1 ? 18 : 24;
        b.angle += 0.17;
        for (let i = 0; i < n; i++) s.spawnEnemyBullet(e.x, e.y - 12, b.angle + (i / n) * TAU, bulletSpeed(s, 78));
        s.fx.ring(e.x, e.y - 12, 36, s.kit.palette.danger, 240);
        b.step++;
        if (b.step >= 3) done();
      }
      break;
    }
    case 'fan': {
      if (b.pt >= b.step * 0.28) {
        const n = b.phase === 1 ? 5 : 7;
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        for (let i = 0; i < n; i++) s.spawnEnemyBullet(e.x, e.y - 12, a + (i - (n - 1) / 2) * 0.13, bulletSpeed(s, 120), i === (n - 1) / 2);
        b.step++;
        if (b.step >= 3) done();
      }
      break;
    }
    case 'summon': {
      const kinds = b.phase === 1 ? (['wanderer', 'wanderer', 'shooter'] as const) : (['wanderer', 'charger', 'charger', 'shooter'] as const);
      kinds.forEach((kind, i) => {
        const a = (i / kinds.length) * TAU;
        s.queueSpawn(kind, e.x + Math.cos(a) * 46, Math.min(R.y1 - 24, e.y + Math.sin(a) * 40));
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
        s.spawnEnemyBullet(e.x, e.y - 12, b.angle, bulletSpeed(s, 68));
        b.step++;
      }
      if (b.pt >= 3.2) done();
      break;
    }
  }
}

function startLeap(s: GameScene, e: Enemy, b: BossState) {
  const p = s.player;
  const R = s.roomRect();
  const glide = !!b.look?.float;
  // Somewhere near the knight, but not on top of it, and inside the room.
  const a = Math.atan2(e.y - p.y, e.x - p.x) + rand(-1.2, 1.2);
  const d = glide ? rand(80, 120) : rand(30, 70);
  const x1 = clamp(p.x + Math.cos(a) * d, R.x0 + 40, R.x1 - 40);
  const y1 = clamp(p.y + Math.sin(a) * d * 0.8, R.y0 + 50, R.y1 - 36);
  const dur = glide ? 0.45 : b.phase === 2 ? 0.6 : 0.75;
  b.leap = { x0: e.x, y0: e.y, x1, y1, t: 0, dur, glide };
  b.leapT = b.phase === 2 ? rand(2.2, 3.2) : rand(3, 4.5);
  e.vx = e.vy = 0;
  if (glide) {
    audio.dash();
  } else {
    // The shadow of where it will come down, so standing there is a choice.
    s.telegraphs.push({ kind: 'circle', x: x1, y: y1, r: 28, t: 0, dur });
    s.fx.dust(e.x, e.y, 8);
    if (b.look) b.look.sq = 0.3;
  }
}

function leapStep(s: GameScene, e: Enemy, b: BossState, dt: number) {
  const L = b.leap!;
  L.t += dt;
  const k = Math.min(1, L.t / L.dur);
  const ease = L.glide ? k * k * (3 - 2 * k) : k;
  e.x = L.x0 + (L.x1 - L.x0) * ease;
  e.y = L.y0 + (L.y1 - L.y0) * ease;
  e.vx = e.vy = 0;
  b.air = L.glide ? 0 : Math.sin(Math.PI * k) * 48;
  if (k < 1) return;
  b.leap = undefined;
  b.air = 0;
  if (L.glide) return;
  // The landing.
  const p = s.player;
  if (b.look) b.look.sq = 0.36;
  s.fx.ring(e.x, e.y, 46, b.look?.accent ?? E.white, 340, 3);
  s.fx.dust(e.x, e.y, 16);
  s.fx.shake(0.4);
  s.light.flash(e.x, e.y - 10, 80, b.look?.accent ?? E.white, 0.2);
  audio.explode(false);
  if (s.mode === 'play' && dist(p.x, p.y, e.x, e.y) < 28 + p.r) s.hurtPlayer(1, e.x, e.y);
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
          const len = raycast(s.dungeon, e.x, e.y - 8, b.dirX, b.dirY, 700).len;
          s.telegraphs.push({ kind: 'line', x: e.x, y: e.y - 8, x2: e.x + b.dirX * len, y2: e.y - 8 + b.dirY * len, t: 0, dur: b.enraged ? 0.55 : 0.75 });
        }
        if (e.state === 'stomp-up') {
          b.tx = p.x;
          b.ty = p.y;
          s.telegraphs.push({ kind: 'circle', x: p.x, y: p.y, r: 52, t: 0, dur: 0.9 });
        }
      }
      break;
    }
    case 'windup': {
      e.vx = e.vy = 0;
      e.facing = Math.atan2(b.dirY, b.dirX);
      if (Math.random() < 0.4) s.fx.dust(e.x - b.dirX * 16, e.y, 1);
      if (e.t2 >= (b.enraged ? 0.55 : 0.75)) {
        e.state = 'charge';
        e.t2 = 0;
        b.bounces = b.enraged ? 2 : 0;
        audio.roar();
        release(s, e, b);
      }
      break;
    }
    case 'charge': {
      const sp = 300 * rage;
      e.vx = b.dirX * sp;
      e.vy = b.dirY * sp;
      s.fx.dust(e.x - b.dirX * 14, e.y, 1);
      for (const o of s.obstacles) {
        if (!o.dead && o.kind === 'pillar' && dist(e.x, e.y, o.x, o.y) < e.r + o.r) {
          o.dead = true;
          s.fx.burst(o.x, o.y, 14);
          s.fx.dust(o.x, o.y, 8);
          s.fx.shake(0.3);
          audio.explode(false);
          o.sprite.destroy();
        }
      }
      // Feel ahead for a wall; corners of the room are cut, so a diagonal hit flips both axes.
      const ahead = e.r * 0.8 + 3;
      let hitX = false;
      let hitY = false;
      if (s.blocked(e.x + b.dirX * ahead, e.y + b.dirY * ahead)) {
        hitX = s.blocked(e.x + b.dirX * ahead, e.y);
        hitY = s.blocked(e.x, e.y + b.dirY * ahead);
        if (!hitX && !hitY) hitX = hitY = true;
      }
      if (hitX || hitY || e.t2 > 2.2) {
        s.fx.shake(0.55);
        s.fx.dust(e.x, e.y, 18);
        audio.explode(true);
        if (b.enraged) {
          for (let i = 0; i < 12; i++) s.spawnEnemyBullet(e.x, e.y - 8, (i / 12) * TAU, 85);
        }
        if (b.bounces > 0) {
          b.bounces--;
          if (hitX) b.dirX = -b.dirX;
          if (hitY) b.dirY = -b.dirY;
          const a = Math.atan2(b.dirY, b.dirX);
          const na = turnToward(a, Math.atan2(p.y - e.y, p.x - e.x), 0.7);
          b.dirX = Math.cos(na);
          b.dirY = Math.sin(na);
          e.x += b.dirX * 4;
          e.y += b.dirY * 4;
          e.t2 = 0;
        } else {
          e.state = 'stunned';
          e.t2 = 0;
          s.fx.callout(e.x, e.y - 50, '破绽', E.yellow, true);
        }
      }
      break;
    }
    case 'stunned': {
      e.vx = e.vy = 0;
      if (e.t2 > 1.15) {
        e.state = 'idle';
        b.cooldown = b.enraged ? 0.6 : 1.0;
      }
      break;
    }
    case 'stomp-up': {
      e.vx = e.vy = 0;
      b.air = Math.min(70, b.air + dt * 180);
      if (e.t2 < 0.45) {
        b.tx = p.x;
        b.ty = p.y;
        const t = s.telegraphs[s.telegraphs.length - 1];
        if (t && t.kind === 'circle') {
          t.x = p.x;
          t.y = p.y;
        }
      }
      e.shadow.setPosition(e.x + (b.tx - e.x) * (e.t2 / 0.9), e.y + (b.ty - e.y) * (e.t2 / 0.9));
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
      b.air = 70 * (1 - k);
      if (k >= 1) {
        b.air = 0;
        if (b.look) b.look.sq = 0.4;
        e.state = 'idle';
        b.cooldown = b.enraged ? 0.7 : 1.1;
        s.fx.ring(e.x, e.y, 60, s.kit.palette.danger, 380, 3);
        s.fx.dust(e.x, e.y, 16);
        s.fx.shake(0.7);
        audio.explode(true);
        if (dist(p.x, p.y, e.x, e.y) < 54) s.hurtPlayer(2, e.x, e.y);
        if (b.enraged) for (let i = 0; i < 16; i++) s.spawnEnemyBullet(e.x, e.y - 8, (i / 16) * TAU + 0.1, 90);
      }
      break;
    }
    case 'fan': {
      const n = b.enraged ? 11 : 7;
      for (let i = 0; i < n; i++) s.spawnEnemyBullet(e.x + Math.cos(toP) * 24, e.y - 10 + Math.sin(toP) * 16, toP + (i - (n - 1) / 2) * 0.14, 120, true);
      e.state = 'idle';
      b.cooldown = b.enraged ? 0.8 : 1.2;
      break;
    }
    case 'summon': {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        s.queueSpawn('charger', e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 40, false, true);
      }
      s.fx.callout(e.x, e.y - 56, '小猪们！', E.yellow);
      e.state = 'idle';
      b.cooldown = 1.2;
      break;
    }
  }
}
