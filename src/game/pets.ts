import { ELEMENTS } from './elements';
import { TAU, clamp, dist, dist2, easeOutBack, segCircle } from '../core/math';
import type { Element } from '../core/stats';
import { PETS, type Pets } from '../data/enemies';
import { audio } from '../audio/audio';
import type { Enemy, Img, Pet } from './entities';
import { collide, raycast, type DRoom } from './dungeon';
import { lineClear } from './flow';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';

/** Companions stay smaller than the hero; the full-size art is retained for HUD and codex icons. */
export const PET_WORLD_SCALE = 0.6;
const PET_SHADOW_SCALE = 0.6 * PET_WORLD_SCALE;

interface PetShot {
  kind: 'egg' | 'ember';
  pet: Pet;
  x: number;
  y: number;
  x0: number;
  y0: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  t: number;
  dur: number;
  sprite: Img;
  shadow: Img;
}
interface PetRuntime {
  room?: DRoom;
  shots: PetShot[];
  soundAt: number;
}
const runtimes = new WeakMap<GameScene, PetRuntime>();
const COOLDOWN: Record<Pets, number> = { hound: 1.3, dove: 3.4, swan: 0.4, pig: 3.1, cow: 3.7, sheep: 7, chicken: 2.7, rabbit: 1.8, fox: 2.4 };
const WINDUP: Record<Pets, number> = { hound: 0.12, dove: 0.25, swan: 0, pig: 0.28, cow: 0.45, sheep: 0.36, chicken: 0.24, rabbit: 0.1, fox: 0.3 };

function runtime(s: GameScene): PetRuntime {
  let r = runtimes.get(s);
  if (!r) {
    r = { shots: [], soundAt: -1 };
    runtimes.set(s, r);
  }
  return r;
}

function clearShots(r: PetRuntime) {
  for (const shot of r.shots) {
    shot.sprite.destroy();
    shot.shadow.destroy();
  }
  r.shots.length = 0;
}

function action(p: Pet, state: Pet['state']) {
  p.state = state;
  p.stateT = 0;
}

/** Call when unloading a floor or teleporting. Every delayed attack is driven by updatePets, never a scene timer. */
export function resetPets(s: GameScene, reposition = false) {
  const r = runtime(s);
  clearShots(r);
  r.room = undefined;
  for (const p of s.pets) {
    action(p, 'follow');
    p.target = undefined;
    p.leap = undefined;
    p.combo = 0;
    p.vx = p.vy = 0;
    p.hitCd.clear();
    if (reposition) {
      p.x = s.player.x;
      p.y = s.player.y;
    }
    p.sprite.setPosition(Math.round(p.x), Math.round(p.y)).setRotation(0).setScale(PET_WORLD_SCALE);
    p.shadow.setPosition(Math.round(p.x), Math.round(p.y) + 1).setScale(PET_SHADOW_SCALE);
  }
}

/** Destroys both the companions and their transient sprites, including on scene shutdown. */
export function destroyPets(s: GameScene) {
  resetPets(s);
  for (const p of s.pets) {
    p.sprite.destroy();
    p.shadow.destroy();
  }
  s.pets.length = 0;
  runtimes.delete(s);
}

export function syncPets(s: GameScene) {
  for (const kind of s.run.pets) {
    if (s.pets.some((p) => p.kind === kind)) continue;
    const sprite = s.add.image(s.player.x, s.player.y, `pet-${kind}-idle-0`).setDepth(DEPTH.pet).setOrigin(0.5, 19 / 22).setScale(PET_WORLD_SCALE);
    const shadow = s.add.image(s.player.x, s.player.y, 'shadow').setDepth(DEPTH.shadow).setScale(PET_SHADOW_SCALE).setAlpha(0.5);
    s.fx.petals(s.player.x, s.player.y, 8);
    s.fx.ring(s.player.x, s.player.y, 24, '#ffffff', 260);
    s.pets.push({ kind, x: s.player.x, y: s.player.y, vx: 0, vy: 0, t: Math.random() * 4, stateT: 0, cd: kind === 'sheep' ? 6 : 0.5 + s.pets.length * 0.17, state: 'follow', angle: Math.random() * TAU, sprite, shadow, joinT: 0.42, combo: 0, hitCd: new Map() });
  }
}

/** Use an explicit crit roll: damageEnemy would otherwise add the player's full crit chance a second time. */
function petHit(s: GameScene, p: Pet, e: Enemy, base: number, element?: Element, knock = 55, heavy = false) {
  if (e.dead || s.mode !== 'play' || !s.active) return;
  const m = s.run.mods;
  const damage = base * m.petDamage * (1 + (s.damageMult() - 1) * m.petInherit) * (1 + m.petTeamwork * s.run.pets.length);
  const crit = Math.random() < clamp(m.petCrit + m.critChance * m.petInherit, 0, 1);
  const el = element ?? ELEMENTS.find((k) => m.elements[k] > 0 && Math.random() < m.elements[k] * m.petInherit);
  const opts = { src: PETS[p.kind].name, kx: e.x - p.x, ky: e.y - p.y, knock, noCrit: true, crit, noElement: true, element: el, quiet: true, heavy };
  s.damageEnemy(e, damage, opts);
  s.fx.sparks(e.x, e.y - 4, crit ? 5 : 2, el ?? 'white');
  if (!e.dead && Math.random() < m.petEcho) {
    // An echo can carry its element, but never roll another echo or trigger player on-hit upgrades.
    s.damageEnemy(e, damage * 0.5, { ...opts, knock: knock * 0.5 });
    s.fx.sparks(e.x, e.y - 6, 3, 'gold');
  }
}

function clearPath(s: GameScene, x: number, y: number, tx: number, ty: number, radius = 2) {
  return lineClear(s.dungeon, x, y, Math.atan2(ty - y, tx - x), dist(x, y, tx, ty), radius);
}

function targetFor(s: GameScene, p: Pet, range: number): Enemy | undefined {
  let best: Enemy | undefined;
  let bd = (range * s.run.mods.petArea) ** 2;
  for (const e of s.enemies) {
    if (e.dead || e.enter || (e.kind === 'ghost' && e.state === 'fade')) continue;
    const d = dist2(p.x, p.y, e.x, e.y);
    if (d >= bd || !clearPath(s, p.x, p.y, e.x, e.y)) continue;
    bd = d;
    best = e;
  }
  return best;
}

/** Swept motion stops small pets at closed gates and cover even during a fast charge. */
function move(s: GameScene, p: Pet, dx: number, dy: number): boolean {
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return false;
  const ray = raycast(s.dungeon, p.x, p.y, dx / len, dy / len, len + 4);
  const travel = Math.min(len, Math.max(0, ray.len - 4));
  [p.x, p.y] = collide(s.dungeon, p.x + dx / len * travel, p.y + dy / len * travel, 4);
  return travel < len - 0.1;
}

function follow(s: GameScene, p: Pet, i: number, dt: number) {
  const pl = s.player;
  let tx: number;
  let ty: number;
  if (p.kind === 'dove') {
    p.angle += dt * 1.3;
    tx = pl.x + Math.cos(p.angle) * 29;
    ty = pl.y + Math.sin(p.angle) * 17;
  } else {
    const a = i * 2.4 + Math.PI * 0.7;
    const radius = 22 + Math.floor(i / 5) * 11;
    tx = pl.x + Math.cos(a) * radius;
    ty = pl.y + Math.sin(a) * radius * 0.7;
  }
  const d = dist(p.x, p.y, pl.x, pl.y);
  // A closed room gate can separate a follower from the hero. Recall it instead of leaving it stuck forever.
  if (d > 260 || (d > 55 && s.flow.heading(p.x, p.y) === undefined && !clearPath(s, p.x, p.y, pl.x, pl.y, 4))) {
    p.x = pl.x;
    p.y = pl.y;
    p.joinT = 0.25;
    return;
  }
  if (!clearPath(s, p.x, p.y, tx, ty, 4)) {
    const a = s.flow.heading(p.x, p.y);
    if (a !== undefined && d > 15) {
      move(s, p, Math.cos(a) * 120 * dt, Math.sin(a) * 120 * dt);
      return;
    }
    tx = pl.x;
    ty = pl.y;
  }
  const dx = tx - p.x;
  const dy = ty - p.y;
  const len = Math.hypot(dx, dy);
  const step = Math.min(len, len * dt * 6, 155 * dt);
  if (len > 0.1) move(s, p, dx / len * step, dy / len * step);
}

function softImpact(s: GameScene) {
  const r = runtime(s);
  if (s.time0 < r.soundAt) return;
  r.soundAt = s.time0 + 0.2;
  audio.explode(false, 0.16);
}

function burst(s: GameScene, p: Pet, x: number, y: number, radius: number, damage: number, color: string, knock = 90, heavy = false) {
  radius *= s.run.mods.petArea;
  s.fx.ring(x, y, radius, color, 260);
  s.fx.dust(x, y, 5);
  let hits = 0;
  for (const e of s.enemies) {
    if (!e.dead && dist2(x, y, e.x, e.y) < (radius + e.r) ** 2 && clearPath(s, x, y, e.x, e.y, 0)) {
      petHit(s, p, e, damage, undefined, knock, heavy);
      hits++;
    }
  }
  if (hits) softImpact(s);
}

function beginLeap(s: GameScene, p: Pet, target: Enemy, dur: number, maxRange: number) {
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const reach = Math.min(len, maxRange * s.run.mods.petArea);
  const safe = Math.max(0, raycast(s.dungeon, p.x, p.y, dx / len, dy / len, reach + 4).len - 4);
  const [x1, y1] = collide(s.dungeon, p.x + dx / len * safe, p.y + dy / len * safe, 4);
  p.leap = { x0: p.x, y0: p.y, x1, y1, dur };
  action(p, 'leap');
}

function launchShot(s: GameScene, p: Pet, target: Enemy, kind: PetShot['kind']) {
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const sprite = s.add.image(p.x, p.y - 6, kind === 'egg' ? 'pet-egg' : 'pet-ember').setDepth(DEPTH.proj);
  const shadow = s.add.image(p.x, p.y, 'shadow').setDepth(DEPTH.shadow).setScale(0.25).setAlpha(0.35);
  runtime(s).shots.push({ kind, pet: p, x: p.x, y: p.y, x0: p.x, y0: p.y, tx: target.x, ty: target.y, vx: dx / len * 190, vy: dy / len * 190, t: 0, dur: kind === 'egg' ? clamp(len / 210, 0.25, 0.65) : Math.max(1.5, len / 190 + 0.15), sprite, shadow });
}

function release(s: GameScene, p: Pet) {
  const target = p.target;
  if (!target || target.dead || !s.enemies.includes(target)) {
    action(p, 'return');
    return;
  }
  p.cd = COOLDOWN[p.kind];
  switch (p.kind) {
    case 'hound':
      action(p, 'dash');
      break;
    case 'cow': {
      const a = Math.atan2(target.y - p.y, target.x - p.x);
      p.vx = Math.cos(a) * 250;
      p.vy = Math.sin(a) * 250;
      p.hitCd.clear();
      action(p, 'dash');
      s.fx.dust(p.x, p.y, 4);
      break;
    }
    case 'pig':
      beginLeap(s, p, target, 0.5, 145);
      break;
    case 'rabbit':
      p.combo = 1;
      beginLeap(s, p, target, 0.26, 155);
      break;
    case 'chicken':
      launchShot(s, p, target, 'egg');
      action(p, 'recover');
      break;
    case 'fox':
      launchShot(s, p, target, 'ember');
      action(p, 'recover');
      break;
    case 'dove': {
      const a = Math.atan2(target.y - p.y, target.x - p.x);
      const reach = 155 * s.run.mods.petArea;
      const end = raycast(s.dungeon, p.x, p.y, Math.cos(a), Math.sin(a), reach).len;
      const x2 = p.x + Math.cos(a) * end;
      const y2 = p.y + Math.sin(a) * end;
      s.visuals.push({ kind: 'beam', pts: [p.x, p.y - 4, x2, y2 - 4], color: 0xa4f5cf, width: 3, t: 0.22, dur: 0.22 });
      for (const e of s.enemies) {
        if (!e.dead && segCircle(p.x, p.y, x2, y2, e.x, e.y, e.r + 10 * s.run.mods.petArea) && clearPath(s, p.x, p.y, e.x, e.y, 0)) petHit(s, p, e, 4, 'wind', 100);
      }
      action(p, 'recover');
      break;
    }
    case 'sheep':
      burst(s, p, p.x, p.y, 70, 3, '#d9e6ff', 200);
      if (s.run.armor < s.run.mods.maxArmor) {
        s.run.armor = Math.min(s.run.mods.maxArmor, s.run.armor + 1);
        s.fx.number(s.player.x, s.player.y - 20, 1, { text: '+1 护甲', color: '#a9dcff', small: true });
        s.fx.ring(s.player.x, s.player.y - 4, 24, '#a9dcff', 350);
      }
      action(p, 'recover');
      break;
  }
}

function updateShots(s: GameScene, dt: number) {
  const shots = runtime(s).shots;
  for (let i = shots.length - 1; i >= 0; i--) {
    const shot = shots[i];
    shot.t += dt;
    const oldX = shot.x;
    const oldY = shot.y;
    const u = Math.min(1, shot.t / shot.dur);
    const nx = shot.kind === 'egg' ? shot.x0 + (shot.tx - shot.x0) * u : shot.x + shot.vx * dt;
    const ny = shot.kind === 'egg' ? shot.y0 + (shot.ty - shot.y0) * u : shot.y + shot.vy * dt;
    const len = dist(oldX, oldY, nx, ny);
    const ray = len ? raycast(s.dungeon, oldX, oldY, (nx - oldX) / len, (ny - oldY) / len, len + 2) : { len: 2 };
    const wall = ray.len < len + 1;
    const step = len ? Math.min(1, Math.max(0, ray.len - 2) / len) : 1;
    shot.x = oldX + (nx - oldX) * step;
    shot.y = oldY + (ny - oldY) * step;
    let done = wall || shot.t >= shot.dur;
    if (shot.kind === 'ember') {
      // Segment hits prevent fast foxfire from tunnelling through small monsters.
      let hit: Enemy | undefined;
      let nearest = Infinity;
      for (const e of s.enemies) {
        if (e.dead || !segCircle(oldX, oldY, shot.x, shot.y, e.x, e.y, e.r + 4) || !clearPath(s, shot.x, shot.y, e.x, e.y, 0)) continue;
        const d = dist2(oldX, oldY, e.x, e.y);
        if (d < nearest) { nearest = d; hit = e; }
      }
      if (hit) {
        petHit(s, shot.pet, hit, 7, 'fire', 35);
        s.fx.sparks(hit.x, hit.y - 4, 5, 'fire');
        done = true;
      }
    }
    const lift = shot.kind === 'egg' ? 5 + Math.sin(u * Math.PI) * 24 : 6 + Math.sin(shot.t * 16) * 2;
    shot.sprite.setPosition(Math.round(shot.x), Math.round(shot.y - lift)).setRotation(shot.kind === 'egg' ? shot.t * 8 : Math.atan2(shot.vy, shot.vx));
    shot.shadow.setPosition(Math.round(shot.x), Math.round(shot.y));
    if (!done) continue;
    if (shot.kind === 'egg') burst(s, shot.pet, shot.x, shot.y, 27, 7, '#ffe6a3', 75);
    shot.sprite.destroy();
    shot.shadow.destroy();
    shots.splice(i, 1);
  }
}

function updateSwan(s: GameScene, p: Pet, dt: number, combat: boolean) {
  p.angle += dt * 2.9 * s.run.mods.petRate;
  const radius = 23 * Math.min(1.5, s.run.mods.petArea);
  const tx = s.player.x + Math.cos(p.angle) * radius;
  const ty = s.player.y + Math.sin(p.angle) * radius * 0.7;
  if (!clearPath(s, p.x, p.y, tx, ty, 4)) {
    const heading = s.flow.heading(p.x, p.y);
    if (heading !== undefined) move(s, p, Math.cos(heading) * 120 * dt, Math.sin(heading) * 120 * dt);
    else if (dist(p.x, p.y, s.player.x, s.player.y) > 55) {
      p.x = s.player.x;
      p.y = s.player.y;
      p.joinT = 0.25;
    }
  } else move(s, p, (tx - p.x) * Math.min(1, dt * 15), (ty - p.y) * Math.min(1, dt * 15));
  if (!combat) return;
  // Raise the wing as a threat approaches; blocking itself stays immediate.
  if (p.state === 'windup' && p.stateT > 0.16) action(p, 'follow');
  if (p.state === 'follow' && (
    s.eproj.some((b) => !b.dead && dist2(b.x, b.y, p.x, p.y - 4) < (b.r + 22) ** 2) ||
    s.enemies.some((e) => !e.dead && (p.hitCd.get(e) ?? 0) <= p.t && dist2(e.x, e.y, p.x, p.y) < (e.r + 18 * s.run.mods.petArea) ** 2)
  )) action(p, 'windup');
  for (const b of s.eproj) {
    if (b.dead || dist2(b.x, b.y, p.x, p.y - 4) >= (b.r + 8) ** 2) continue;
    s.killProj(b, true);
    s.fx.sparks(b.x, b.y, 4, 'white');
    action(p, 'recover');
    audio.block();
  }
  for (const e of s.enemies) {
    if (e.dead || (p.hitCd.get(e) ?? 0) > p.t) continue;
    if (dist2(e.x, e.y, p.x, p.y) < (e.r + 8 * s.run.mods.petArea) ** 2 && clearPath(s, p.x, p.y, e.x, e.y, 0)) {
      petHit(s, p, e, 3.5);
      p.hitCd.set(e, p.t + 0.65 / s.run.mods.petRate);
      action(p, 'recover');
    }
  }
}

function animate(p: Pet, dt: number, speed: number) {
  const flying = p.kind === 'dove';
  let pose = 'idle';
  let frame = Math.floor(p.t * 2.5) % 2;
  let lift = flying ? 13 + Math.sin(p.t * 5) * 2 : 0;
  let sx = 1;
  let sy = 1 + Math.sin(p.t * 4) * 0.025;
  let tilt = 0;
  if (p.state === 'windup') {
    pose = 'attack'; frame = 0; sx = 1.07; sy = 0.9;
  } else if (p.state === 'dash' || p.state === 'leap') {
    pose = 'attack'; frame = 1; sx = 1.08; sy = 0.94;
    tilt = (p.sprite.flipX ? -1 : 1) * 0.08;
    if (p.leap) lift += Math.sin(Math.min(1, p.stateT / p.leap.dur) * Math.PI) * (p.kind === 'pig' ? 28 : 17);
  } else if (p.state === 'recover') {
    // Ranged/support actions release on entry here: show the active pose before their follow-through.
    pose = 'attack'; frame = p.stateT < 0.08 ? 1 : 2;
    const recoil = Math.max(0, 1 - p.stateT / 0.22);
    sx = 1 + recoil * 0.12; sy = 1 - recoil * 0.12;
  } else if (speed > 9 || flying) {
    pose = 'walk'; frame = Math.floor(p.t * (flying ? 11 : 10)) % 4;
    lift += flying ? 0 : Math.abs(Math.sin(p.t * 15)) * (p.kind === 'rabbit' ? 3 : 1);
    tilt = Math.sin(p.t * 15) * 0.025;
  }
  p.joinT = Math.max(0, p.joinT - dt);
  const join = p.joinT ? easeOutBack(1 - p.joinT / 0.42) : 1;
  p.sprite.setTexture(`pet-${p.kind}-${pose}-${frame}`).setPosition(Math.round(p.x), Math.round(p.y - lift)).setScale(PET_WORLD_SCALE * sx * join, PET_WORLD_SCALE * sy * join).setRotation(tilt);
  p.shadow.setPosition(Math.round(p.x), Math.round(p.y) + 1).setScale(PET_SHADOW_SCALE * Math.max(0.3, 1 - lift / 60) * join).setAlpha(flying ? 0.25 : 0.45);
}

export function updatePets(s: GameScene, dt: number) {
  // Pause menus freeze the exact pose and cooldown along with the rest of the world.
  if (s.mode === 'pause' || s.mode === 'choose' || s.mode === 'title' || s.mode === 'end') return;
  const r = runtime(s);
  if (r.room !== s.active) {
    resetPets(s);
    r.room = s.active;
  }
  let combat = s.mode === 'play' && !!s.active && s.enemies.some((e) => !e.dead);
  if (!combat && r.shots.length) clearShots(r);
  const rate = clamp(s.run.mods.petRate, 0.25, 5);
  for (let i = 0; i < s.pets.length; i++) {
    const p = s.pets[i];
    // An earlier companion may have finished the room in this very frame.
    combat = combat && s.enemies.some((e) => !e.dead);
    const oldX = p.x;
    const oldY = p.y;
    p.t += dt;
    p.stateT += dt;
    for (const [enemy, expires] of p.hitCd) if (enemy.dead || expires <= p.t || !s.enemies.includes(enemy)) p.hitCd.delete(enemy);
    if (!combat && p.state !== 'follow') {
      action(p, 'follow');
      p.target = undefined;
      p.leap = undefined;
      p.combo = 0;
    }
    if (p.kind === 'swan') {
      if (p.state === 'recover' && p.stateT > 0.24) action(p, 'follow');
      updateSwan(s, p, dt, combat);
    } else {
      if (combat) p.cd -= dt * rate;
      if (p.state === 'follow' || p.state === 'return') {
        follow(s, p, i, dt);
        if (p.state === 'return' && dist(p.x, p.y, s.player.x, s.player.y) < 46) action(p, 'follow');
        if (combat && p.state === 'follow' && p.cd <= 0) {
          const target = p.kind === 'sheep' ? s.enemies.find((e) => !e.dead && !e.enter) : targetFor(s, p, p.kind === 'fox' || p.kind === 'chicken' ? 210 : 170);
          if (target) {
            p.target = target;
            p.sprite.setFlipX(target.x < p.x);
            action(p, 'windup');
          }
        }
      } else if (p.state === 'windup') {
        if (!p.target || p.target.dead) action(p, 'follow');
        else if (p.stateT >= WINDUP[p.kind] / Math.sqrt(rate)) release(s, p);
      } else if (p.state === 'dash') {
        const target = p.target;
        if (p.kind === 'hound') {
          if (!target || target.dead || p.stateT > 1.1) action(p, 'return');
          else {
            const a = Math.atan2(target.y - p.y, target.x - p.x);
            const blocked = move(s, p, Math.cos(a) * 245 * dt, Math.sin(a) * 245 * dt);
            if (segCircle(oldX, oldY, p.x, p.y, target.x, target.y, target.r + 6) && clearPath(s, p.x, p.y, target.x, target.y, 0)) {
              petHit(s, p, target, 7);
              action(p, 'recover');
            } else if (blocked) action(p, 'return');
          }
        } else {
          const blocked = move(s, p, p.vx * dt, p.vy * dt);
          for (const e of s.enemies) {
            if (e.dead || p.hitCd.has(e)) continue;
            if (segCircle(oldX, oldY, p.x, p.y, e.x, e.y, e.r + 9 * s.run.mods.petArea) && clearPath(s, p.x, p.y, e.x, e.y, 0)) {
              petHit(s, p, e, 11, undefined, 155, true);
              p.hitCd.set(e, p.t + 2);
              s.fx.dust(e.x, e.y, 3);
            }
          }
          if (blocked || p.stateT >= 0.68) action(p, 'recover');
        }
      } else if (p.state === 'leap' && p.leap) {
        const leap = p.leap;
        const u = Math.min(1, p.stateT / leap.dur);
        move(s, p, leap.x0 + (leap.x1 - leap.x0) * u - p.x, leap.y0 + (leap.y1 - leap.y0) * u - p.y);
        if (u >= 1) {
          if (p.kind === 'pig') burst(s, p, p.x, p.y, 34, 9, '#f5b4be', 120, true);
          else burst(s, p, p.x, p.y, 14, 4, '#ffffff', 35);
          p.leap = undefined;
          action(p, 'recover');
        }
      } else if (p.state === 'recover' && p.stateT > (p.kind === 'rabbit' ? 0.12 : 0.24)) {
        if (p.kind === 'rabbit' && p.combo > 0) {
          const next = targetFor(s, p, 85);
          p.combo--;
          if (next) {
            p.target = next;
            beginLeap(s, p, next, 0.22, 85);
          } else action(p, 'return');
        } else action(p, 'return');
      }
    }
    const dx = p.x - oldX;
    const dy = p.y - oldY;
    if (Math.abs(dx) > 0.15 && p.state !== 'windup' && p.state !== 'recover') p.sprite.setFlipX(dx < 0);
    animate(p, dt, Math.hypot(dx, dy) / Math.max(dt, 0.001));
  }
  if (combat && s.enemies.some((e) => !e.dead)) updateShots(s, dt);
  else if (r.shots.length) clearShots(r);
}
