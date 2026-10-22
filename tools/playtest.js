// Automated playtest harness. Dev only: load it in the browser console on the dev server with
//   const pt = await import('/tools/playtest.js'); await pt.start();
// It pauses the real game loop and steps frames by hand (so it also works in a hidden or throttled tab),
// drives a bot that pathfinds room to room, fights, opens chests and takes the trapdoor, and can snapshot
// the raw 480x270 canvas enlarged on screen for close inspection.

const T = 16;
let s;
let t = 0;

export function scene() {
  return window.__game.scene.keys.game;
}

/** Freeze the real loop and drive time ourselves. Tweens read Date.now, so it is shifted along. */
function takeClock() {
  if (!window.__origNow) {
    window.__origNow = Date.now;
    window.__dn = 0;
    Date.now = () => window.__origNow() + window.__dn;
  }
  t = performance.now();
  window.__game.loop.sleep();
}

export function run(frames) {
  for (let i = 0; i < frames; i++) {
    t += 16.67;
    window.__dn += 16.67;
    window.__game.step(t, 16.67);
  }
}

export const wait = (ms = 1300) => new Promise((r) => setTimeout(r, ms));

function solid(tx, ty) {
  const d = s.dungeon;
  if (tx < 0 || ty < 0 || tx >= d.w || ty >= d.h) return true;
  if (d.tiles[ty * d.w + tx] !== 1 || d.blocked.has(ty * d.w + tx)) return true;
  // Props are not in the tile map; treat the tiles they cover as walls.
  return s.obstacles.some((o) => !o.dead && Math.abs(o.x - (tx * T + 8)) < o.r + 8 && Math.abs(o.y - (ty * T + 8)) < o.r + 8);
}

function path(fx, fy, gx, gy) {
  const d = s.dungeon;
  const W = d.w;
  const st = fy * W + fx;
  const goal = gy * W + gx;
  const prev = new Map([[st, -1]]);
  const q = [st];
  while (q.length) {
    const c = q.shift();
    if (c === goal) break;
    const cx = c % W;
    const cy = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const n = ny * W + nx;
      if (prev.has(n) || solid(nx, ny)) continue;
      prev.set(n, c);
      q.push(n);
    }
  }
  if (!prev.has(goal)) return null;
  const out = [];
  for (let c = goal; c !== -1; c = prev.get(c)) out.push(c);
  return out.reverse();
}

/** Next thing to walk to: a level-up crystal, the trapdoor, a chest, a pedestal, then the nearest unfinished room (boss last). */
function goal() {
  const p = s.player;
  // Level-up crystals first: walking into one is what opens the cards.
  const tok = s.levelTokens?.find((k) => !k.dead && k.landed);
  if (tok) return [tok.x, tok.y];
  if (s.trapdoor) return [s.trapdoor.img.x, s.trapdoor.img.y];
  const chest = s.pickups.find((q) => (q.kind === 'chest' || q.kind === 'wchest') && !q.dead);
  if (chest) return [chest.x, chest.y];
  if (s.pedestals.length) return [s.pedestals[0].x, s.pedestals[0].y];
  const todo = s.dungeon.rooms.filter((r) => (r.type === 'treasure' ? !r.visited : !r.cleared));
  const pool = todo.some((r) => r.type !== 'boss') ? todo.filter((r) => r.type !== 'boss') : todo;
  let best = null;
  let bl = Infinity;
  for (const r of pool) {
    let tx = Math.floor((r.x0 + r.x1) / 2);
    let ty = Math.floor((r.y0 + r.y1) / 2);
    if (solid(tx, ty)) ty += 2;
    if (solid(tx, ty)) tx += 3;
    const pth = path(Math.floor(p.x / T), Math.floor(p.y / T), tx, ty);
    if (pth && pth.length < bl) {
      bl = pth.length;
      best = [tx * T + 8, ty * T + 8];
    }
  }
  return best;
}

function keys(dx, dy) {
  const k = s.keys;
  k.D.isDown = dx > 0.3;
  k.A.isDown = dx < -0.3;
  k.S.isDown = dy > 0.3;
  k.W.isDown = dy < -0.3;
}

export const bot = { on: true, move: true };

function think() {
  if (!bot.on) return;
  if (s.mode !== 'play') return keys(0, 0);
  const p = s.player;
  const cam = s.cameras.main;
  const ptr = s.input.activePointer;
  let near = null;
  let nd = Infinity;
  for (const e of s.enemies) {
    if (e.dead) continue;
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < nd) {
      nd = d;
      near = e;
    }
  }
  s.pointerMoved = true;
  s.autoFire = !!near;
  if (near) {
    ptr.x = near.x - cam.scrollX;
    ptr.y = near.y - 4 - cam.scrollY;
  }
  if (!bot.move) return keys(0, 0);
  if (s.active) {
    if (near && nd < 45 * 45) return keys(p.x - near.x, p.y - near.y);
    const R = s.roomRect();
    const dx = R.cx - p.x;
    const dy = R.cy + 20 - p.y;
    return keys(Math.abs(dx) > 30 ? dx : 0, Math.abs(dy) > 30 ? dy : 0);
  }
  const g = goal();
  if (!g) return keys(0, 0);
  if (!near) {
    ptr.x = g[0] - cam.scrollX;
    ptr.y = g[1] - cam.scrollY;
  }
  const pth = path(Math.floor(p.x / T), Math.floor(p.y / T), Math.floor(g[0] / T), Math.floor(g[1] / T));
  if (!pth || pth.length < 2) return keys(g[0] - p.x, g[1] - p.y);
  const W = s.dungeon.w;
  const n = pth[Math.min(2, pth.length - 1)];
  const dx = (n % W) * T + 8 - p.x;
  const dy = ((n / W) | 0) * T + 8 - p.y;
  const l = Math.hypot(dx, dy) || 1;
  keys(dx / l, dy / l);
}

export function info() {
  return {
    floor: s.run.level,
    room: `${s.room?.id}/${s.room?.type}`,
    active: s.active?.id ?? '-',
    kills: s.run.kills,
    lv: s.run.xpLevel,
    hp: s.run.hp,
    enemies: s.enemies.filter((e) => !e.dead).length,
    mode: s.mode,
    boss: s.boss && !s.boss.dead ? Math.round(s.boss.hp) : null,
  };
}

/** Play for a number of frames, picking the first card on every level-up. */
export function play(frames) {
  for (let i = 0; i < frames; i += 30) {
    if (s.mode === 'choose') window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    run(30);
    if (s.mode === 'end') break;
  }
  return info();
}

/** Show the raw canvas, centred on game coords (cx, cy), at k times size over the page. */
export async function inspect(cx = 240, cy = 135, k = 4) {
  const img = await new Promise((res) => {
    window.__game.renderer.snapshot(res);
    run(1);
  });
  let ov = document.getElementById('__insp');
  if (!ov) {
    ov = document.createElement('canvas');
    ov.id = '__insp';
    Object.assign(ov.style, { position: 'fixed', left: '0', top: '0', zIndex: 99999, imageRendering: 'pixelated', width: '100vw', height: '100vh' });
    document.body.appendChild(ov);
  }
  ov.width = Math.ceil(innerWidth / k);
  ov.height = Math.ceil(innerHeight / k);
  const c = ov.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.fillStyle = '#000';
  c.fillRect(0, 0, ov.width, ov.height);
  c.drawImage(img, Math.round(ov.width / 2 - cx), Math.round(ov.height / 2 - cy));
  ov.style.display = 'block';
  await wait();
}

export function uninspect() {
  const ov = document.getElementById('__insp');
  if (ov) ov.style.display = 'none';
}

/** Give the player a weapon and fire it at the nearest enemy for a few frames. */
export function fireWith(id, frames = 12) {
  s.takeChoice({ type: 'weapon-new', id });
  s.run.weapons.forEach((w) => (w.cd = 0));
  run(frames);
  return s.run.weapons[s.run.held].def.id;
}

export async function start({ click = true, hero = 0, difficulty } = {}) {
  // Pick panels close at once instead of playing their exit animation, so stepped frames never wait on a timer.
  window.__fastUi = true;
  await wait(800);
  if (click) {
    // Main menu: "开始冒险", then confirm if it asks to overwrite a saved run.
    document.querySelector('.overlay.title [data-k="new"]')?.click();
    await wait(100);
    document.querySelector('.overlay.confirm [data-k="yes"]')?.click();
    await wait(100);
    // Then the hero: 0 is Adonis, 1 the knight.
    document.querySelectorAll('.overlay.heroes .pk-card')[hero]?.click();
    await wait(100);
    // Keep the preselected trial unless the caller explicitly requests another difficulty.
    if (['easy', 'normal', 'hard'].includes(difficulty)) {
      document.querySelector(`.difficulty-select [data-difficulty="${difficulty}"]`)?.click();
    }
    document.querySelector('.difficulty-select [data-action="confirm"]')?.click();
  }
  await wait(300);
  s = scene();
  takeClock();
  if (!s.__playtest) {
    s.__playtest = true;
    s.events.on('preupdate', think);
  }
  run(2);
  return info();
}
