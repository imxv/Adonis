import type Phaser from 'phaser';
import { audio } from '../audio/audio';
import { dist2, hexToNum, segCircle } from '../core/math';
import { E } from '../pixel/palette';
import { K } from '../styles/textures';
import { T, raycast, type DRoom, type TrapPlan } from './dungeon';
import type { Enemy, Img } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';

const WARNING = 1;
const NAMES = { spikes: '地刺', saw: '锯片', arrows: '箭阵', vent: '喷口', falling: '落物', beam: '光栅' } as const;
interface TrapArrow { x: number; y: number; dx: number; dy: number; left: number; sprite: Img }
/** Frame-owned dangers: no callback can outlive their cleared room. */
export interface Trap {
  kind: TrapPlan['kind']; room: DRoom; plan: TrapPlan;
  x: number; y: number; ax: number; ay: number; bx: number; by: number;
  t: number; cycle: number; volley: number; state: 'down' | 'warn' | 'up'; armed: boolean;
  sprites: Img[]; debris?: Img; gfx: Phaser.GameObjects.Graphics; arrows: TrapArrow[]; hit: Map<Enemy, number>;
}

export function grounded(e: Enemy) {
  return !e.dead && !e.enter && !['bat', 'ghost', 'angel', 'jelly', 'drone', 'guardian'].includes(e.kind) && (e.boss?.air ?? 0) <= 0;
}

export function populateTraps(s: GameScene, room: DRoom) {
  for (const plan of room.traps) {
    if (!plan.tiles.length) continue;
    const [[ax, ay], [bx, by] = plan.tiles[0]] = plan.tiles;
    const tr: Trap = {
      kind: plan.kind, room, plan, ax: ax * T + T / 2, ay: ay * T + T / 2,
      bx: bx * T + T / 2, by: by * T + T / 2, x: ax * T + T / 2, y: ay * T + T / 2,
      t: 0, cycle: -1, volley: 0, state: 'down', armed: false, sprites: [], arrows: [], hit: new Map(),
      gfx: s.add.graphics().setDepth(DEPTH.shadow + 0.6),
    };
    if (tr.kind === 'spikes') {
      tr.sprites = plan.tiles.map(([x, y]) => s.add.image(x * T + T / 2, y * T + T / 2, 'spikes-up').setDepth(DEPTH.shadow + 0.7).setVisible(false));
    } else if (tr.kind === 'saw') {
      tr.x += (tr.bx - tr.ax) * plan.phase;
      tr.y += (tr.by - tr.ay) * plan.phase;
      tr.sprites = [s.add.image(tr.x, tr.y, 'saw').setDepth(DEPTH.obstacle).setAlpha(0.4)];
    } else {
      const key = K(`trap-${tr.kind}`, s.kit);
      if (s.textures.exists(key)) tr.sprites = [s.add.image(tr.ax, tr.ay, key).setDepth(DEPTH.shadow + 0.7).setRotation(tr.kind === 'falling' ? 0 : Math.atan2(tr.by - tr.ay, tr.bx - tr.ax))];
    }
    if (tr.kind === 'falling') {
      const debris = K('trap-debris', s.kit);
      if (s.textures.exists(debris)) tr.debris = s.add.image(tr.ax, tr.ay, debris).setDepth(DEPTH.obstacle).setVisible(false);
    }
    s.traps.push(tr);
  }
}

export function settleTraps(s: GameScene, room?: DRoom) {
  for (const tr of s.traps) {
    if (room && tr.room !== room) continue;
    tr.arrows.forEach((a) => a.sprite.destroy());
    tr.arrows = []; tr.gfx.clear(); tr.debris?.setVisible(false); tr.armed = false; tr.t = 0; tr.cycle = -1; tr.volley = 0; tr.state = 'down'; tr.hit.clear();
    for (const sprite of tr.sprites) {
      if (tr.kind === 'saw') sprite.setAlpha(0.4);
      else if (tr.kind === 'spikes') sprite.setVisible(false);
      else sprite.setTexture(K(`trap-${tr.kind}`, s.kit)).setAlpha(0.6);
    }
  }
}

export function destroyTraps(s: GameScene) {
  settleTraps(s);
  for (const tr of s.traps) { tr.sprites.forEach((sp) => sp.destroy()); tr.debris?.destroy(); tr.gfx.destroy(); }
  s.traps = [];
}

/** Tile walls and living props both block arrows and rays, including destructible cover. */
export function trapRay(s: GameScene, x: number, y: number, dx: number, dy: number, length: number) {
  let end = raycast(s.dungeon, x, y, dx, dy, length).len;
  for (const o of s.obstacles) {
    if (o.dead) continue;
    const ox = o.x - x, oy = o.y - y, along = ox * dx + oy * dy;
    const across2 = ox * ox + oy * oy - along * along, radius = o.r + 1;
    if (across2 > radius * radius || along + radius < 0) continue;
    const enter = along - Math.sqrt(Math.max(0, radius * radius - across2));
    if (enter <= end) end = Math.max(0, enter);
  }
  return end;
}

function hitEnemy(s: GameScene, tr: Trap, e: Enemy, x: number, y: number) {
  if ((tr.hit.get(e) ?? 0) > s.time0) return;
  tr.hit.set(e, s.time0 + 0.65);
  s.damageEnemy(e, (tr.kind === 'saw' ? 10 : 8) * (1 + s.run.level * 0.5), {
    src: NAMES[tr.kind], kx: e.x - x, ky: e.y - y, knock: 35,
    noCrit: true, noElement: true, noReact: true, environmental: true,
  });
}

function hitArea(s: GameScene, tr: Trap, contains: (x: number, y: number, r: number) => boolean, x: number, y: number) {
  if (s.mode !== 'play' || s.fusing || s.active !== tr.room || tr.room.cleared) return;
  const p = s.player;
  if (contains(p.x, p.y, p.r)) s.hurtPlayer(1, x, y);
  // A hit can finish a challenge or kill the hero: re-check before touching another actor.
  if (s.mode !== 'play' || s.active !== tr.room || tr.room.cleared) return;
  for (const e of s.enemies) if (grounded(e) && contains(e.x, e.y, e.r)) hitEnemy(s, tr, e, x, y);
}

function dashed(tr: Trap, ax: number, ay: number, bx: number, by: number, color: number) {
  const len = Math.hypot(bx - ax, by - ay) || 1, dx = (bx - ax) / len, dy = (by - ay) / len;
  tr.gfx.lineStyle(2, color, 0.8);
  for (let d = 0; d < len; d += 10) tr.gfx.lineBetween(ax + dx * d, ay + dy * d, ax + dx * Math.min(len, d + 5), ay + dy * Math.min(len, d + 5));
}

function emitArrow(s: GameScene, tr: Trap) {
  const len = Math.hypot(tr.bx - tr.ax, tr.by - tr.ay) || 1, dx = (tr.bx - tr.ax) / len, dy = (tr.by - tr.ay) / len;
  const tex = K('trap-arrow', s.kit);
  tr.arrows.push({ x: tr.ax, y: tr.ay, dx, dy, left: len,
    sprite: s.add.image(tr.ax, tr.ay, s.textures.exists(tex) ? tex : 'b-bolt').setRotation(Math.atan2(dy, dx)).setDepth(DEPTH.ebullet),
  });
}

function updateArrows(s: GameScene, tr: Trap, dt: number) {
  const p = s.player, remaining: TrapArrow[] = [];
  for (const a of tr.arrows) {
    if (s.active !== tr.room || s.mode !== 'play' || tr.room.cleared) { a.sprite.destroy(); continue; }
    const step = Math.min(a.left, dt * 150), travel = trapRay(s, a.x, a.y, a.dx, a.dy, step);
    const x = a.x + a.dx * travel, y = a.y + a.dy * travel;
    let stopped = travel < step || a.left <= step;
    const hits = s.enemies.filter((e) => grounded(e) && segCircle(a.x, a.y, x, y, e.x, e.y, e.r + 2))
      .sort((e, f) => dist2(e.x, e.y, a.x, a.y) - dist2(f.x, f.y, a.x, a.y));
    const playerHit = segCircle(a.x, a.y, x, y, p.x, p.y, p.r + 2), first = hits[0];
    if (playerHit && (!first || dist2(p.x, p.y, a.x, a.y) < dist2(first.x, first.y, a.x, a.y))) {
      s.hurtPlayer(1, a.x, a.y); stopped = true;
    } else if (first) { hitEnemy(s, tr, first, a.x, a.y); stopped = true; }
    a.left -= travel; a.x = x; a.y = y;
    if (stopped || s.active !== tr.room) a.sprite.destroy();
    else { a.sprite.setPosition(Math.round(x), Math.round(y)); remaining.push(a); }
  }
  tr.arrows = remaining;
}

/** Warnings freeze with gameplay and disappear synchronously when a room becomes safe. */
export function updateTraps(s: GameScene, dt: number) {
  // Menus and fusion freeze the owned state; resuming never skips a warning or resets a cycle.
  if (s.mode === 'pause' || s.mode === 'choose' || s.mode === 'ascend' || s.fusing) return;
  for (const tr of s.traps) {
    const armed = s.mode === 'play' && !s.fusing && s.active === tr.room && !tr.room.cleared;
    if (!armed) { if (tr.armed) settleTraps(s, tr.room); continue; }
    if (!tr.armed) { tr.armed = true; tr.t = 0; tr.cycle = -1; }
    tr.t += dt; tr.gfx.clear();
    const g = tr.gfx, warningColor = hexToNum(E.yellow), liveColor = hexToNum(tr.kind === 'beam' ? E.cyan : E.orange);
    if (tr.kind === 'saw') {
      if (tr.t < WARNING) {
        dashed(tr, tr.ax, tr.ay, tr.bx, tr.by, warningColor);
        if (tr.state !== 'warn') { tr.state = 'warn'; audio.block(); }
        continue;
      }
      tr.state = 'up';
      const len = Math.max(1, Math.hypot(tr.bx - tr.ax, tr.by - tr.ay));
      const u = ((tr.t - WARNING) * 62 / len + tr.plan.phase) % 2, f = u <= 1 ? u : 2 - u;
      tr.x = tr.ax + (tr.bx - tr.ax) * f; tr.y = tr.ay + (tr.by - tr.ay) * f;
      const frame = Math.floor(tr.t * 24) % 4;
      tr.sprites[0].setPosition(Math.round(tr.x), Math.round(tr.y)).setFlip(frame === 1 || frame === 2, frame >= 2).setAlpha(1);
      hitArea(s, tr, (x, y, r) => dist2(x, y - 3, tr.x, tr.y) < (7 + r * 0.7) ** 2, tr.x, tr.y);
      continue;
    }
    const live = tr.kind === 'arrows' ? 0.5 : tr.kind === 'falling' ? 0.35 : tr.kind === 'beam' ? 1 : 0.85;
    const period = Math.max(WARNING + live + 0.8, tr.plan.period || 3.5);
    // Phase delays the first complete warning instead of starting halfway through a live pulse.
    const clock = tr.t - Math.max(0, Math.min(1, tr.plan.phase)) * period, cycle = Math.floor(clock / period);
    const elapsed = clock < 0 ? -1 : clock - cycle * period;
    const state = elapsed < 0 || elapsed >= WARNING + live ? 'down' : elapsed < WARNING ? 'warn' : 'up';
    const entered = state !== tr.state || cycle !== tr.cycle;
    if (cycle !== tr.cycle) tr.volley = 0;
    tr.cycle = cycle; tr.state = state;
    if (entered && state === 'warn' && dist2(s.player.x, s.player.y, tr.ax, tr.ay) < 260 ** 2) audio.block();
    if (entered && state === 'up') {
      if (tr.kind !== 'arrows' && dist2(s.player.x, s.player.y, tr.ax, tr.ay) < 260 ** 2) audio.block();
    }
    if (tr.kind !== 'spikes') {
      const key = K(`trap-${tr.kind}${state === 'down' ? '' : state === 'warn' ? '-warn' : '-active'}`, s.kit);
      for (const sprite of tr.sprites) if (s.textures.exists(key)) sprite.setTexture(key).setAlpha(state === 'down' ? 0.6 : 1);
    }
    if (tr.kind === 'spikes') {
      for (const sprite of tr.sprites) sprite.setVisible(state !== 'down').setTexture(state === 'up' ? 'spikes-up' : 'spikes-warn');
      if (state === 'up') for (const [tx, ty] of tr.plan.tiles) {
        const x = tx * T + T / 2, y = ty * T + T / 2;
        hitArea(s, tr, (px, py, r) => Math.abs(px - x) < 7 + r * 0.4 && Math.abs(py - y) < 7 + r * 0.4, x, y - 6);
      }
    } else if (tr.kind === 'falling') {
      const [tx, ty] = tr.plan.tiles[Math.max(0, cycle) % tr.plan.tiles.length], x = tx * T + T / 2, y = ty * T + T / 2;
      tr.debris?.setVisible(state === 'warn').setPosition(x, y - 32 + Math.max(0, elapsed) / WARNING * 24);
      if (state !== 'down') {
        g.lineStyle(2, state === 'warn' ? warningColor : liveColor, 1).strokeCircle(x, y, 11);
        g.lineBetween(x - 5, y, x + 5, y).lineBetween(x, y - 5, x, y + 5);
        if (state === 'warn' && !tr.debris) g.fillStyle(0xffffff, 0.9).fillRect(x - 2, y - 32 + elapsed / WARNING * 21, 4, 7);
        if (state === 'up') { g.fillStyle(liveColor, 0.65).fillCircle(x, y, 9); hitArea(s, tr, (px, py, r) => dist2(px, py, x, y) < (9 + r * 0.4) ** 2, x, y - 4); }
      }
    } else {
      const length = Math.hypot(tr.bx - tr.ax, tr.by - tr.ay) || 1, dx = (tr.bx - tr.ax) / length, dy = (tr.by - tr.ay) / length;
      const end = trapRay(s, tr.ax, tr.ay, dx, dy, length), bx = tr.ax + dx * end, by = tr.ay + dy * end;
      if (state === 'warn') { dashed(tr, tr.ax, tr.ay, bx, by, warningColor); g.lineStyle(1, warningColor).strokeCircle(tr.ax, tr.ay, 5 + Math.floor(elapsed * 3)); }
      else if (state === 'up' && tr.kind !== 'arrows') {
        const width = tr.kind === 'vent' ? 9 : 3;
        g.lineStyle(width + 4, liveColor, 0.3).lineBetween(tr.ax, tr.ay, bx, by);
        g.lineStyle(width, liveColor, 0.9).lineBetween(tr.ax, tr.ay, bx, by);
        g.lineStyle(1, 0xffffff, 0.9).lineBetween(tr.ax, tr.ay, bx, by);
        if (end > 2) hitArea(s, tr, (x, y, r) => segCircle(tr.ax, tr.ay, bx, by, x, y, width / 2 + r * 0.4), tr.ax, tr.ay);
      }
      if (tr.kind === 'arrows') {
        if (state === 'up') while (tr.volley < 3 && elapsed >= WARNING + tr.volley * 0.16) { emitArrow(s, tr); tr.volley++; }
        updateArrows(s, tr, dt);
      }
    }
    for (const [enemy, until] of tr.hit) if (enemy.dead || until <= s.time0) tr.hit.delete(enemy);
  }
}
