import type Phaser from 'phaser';
import { TAU, clamp, dist2, hexToNum } from '../core/math';
import { rand } from '../core/rng';
import { audio } from '../audio/audio';
import { WAVE_RULES } from '../data/difficulty';
import { SPAWN_STYLE, type EnemyKind } from '../data/enemies';
import { E } from '../pixel/palette';
import { K } from '../styles/textures';
import { ui } from '../ui/ui';
import { spawnBoss } from './boss';
import { bossAccent, bossDrop } from './bossAnim';
import { openSpot, solidAt, type DRoom } from './dungeon';
import type { Enemy, Img, SummonGroup, Telegraph } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';

/*
 * How monsters arrive. A summon has three beats: a sigil is drawn on the floor, the monster loads in (a ring fills
 * round like a loading bar while its silhouette is scanned in line by line inside a column of light), and it all
 * gathers and flickers before the monster breaks out. A wave is summoned as one group on one clock, so every
 * monster in it breaks out on the same frame; then each kind finishes arriving its own way (oozing up, dropping
 * in, rolling in from the side) and holds still for a breath before it moves.
 *
 * A boss gets the long version: a great sigil with a hexagram and a ring of runes, energy pulled in from the whole
 * room, lightning, and its silhouette in a pillar of light, before it breaks out, lands and roars.
 */

/** How strong each enemy's summon looks: weak ones rise from a rune, strong ones step out of a rift. */
const SPAWN_TIER: Record<EnemyKind, 1 | 2 | 3> = { wanderer: 1, bat: 1, charger: 2, shooter: 2, bomber: 2, shield: 3, brute: 3, sporeling: 1, yeti: 3, scorpion: 2, magma: 2, turret: 2, ghost: 2, ninja: 2, angel: 3, jelly: 2, drone: 1 };
/** Sigil radius by tier (weak, medium, strong, elite). */
const SIGIL_R = [12, 13, 14, 18];
/** Height of the column of light by tier. */
const COLUMN_H = [56, 68, 80, 110];
/** Seconds a boss takes to be summoned. */
export const BOSS_SUMMON = 2.6;

export interface SummonOrder {
  kind: EnemyKind;
  elite?: boolean;
  mini?: boolean;
  /** A fixed spot; without one the group picks spots spread around the room. */
  at?: [number, number];
}

/** Spots for a group: away from the knight and apart from each other, so a wave surrounds rather than piles up. */
export function spreadSpots(s: GameScene, n: number, minDist: number, apart = 30): [number, number][] {
  const out: [number, number][] = [];
  const nearest = (p: [number, number]) => out.reduce((m, q) => Math.min(m, dist2(p[0], p[1], q[0], q[1])), Infinity);
  for (let i = 0; i < n; i++) {
    let best = s.spawnPoint(minDist);
    let bestD = nearest(best);
    for (let j = 0; j < 8 && bestD < apart * apart; j++) {
      const p = s.spawnPoint(minDist);
      const d = nearest(p);
      if (d > bestD) {
        best = p;
        bestD = d;
      }
    }
    out.push(best);
  }
  return out;
}

/** Summon a set of monsters on one clock: every sigil starts together and they all break out on the same frame. */
export function summonGroup(s: GameScene, orders: SummonOrder[], o: { dur: number; minDist?: number; onLand?: (enemies: Enemy[]) => void }) {
  const group: SummonGroup = { left: orders.length, enemies: [], onLand: o.onLand };
  const spots = spreadSpots(s, orders.filter((q) => !q.at).length, o.minDist ?? 80);
  let i = 0;
  for (const q of orders) {
    const [x, y] = q.at ?? spots[i++];
    queueSpawn(s, q.kind, x, y, { elite: q.elite, mini: q.mini, dur: o.dur, group });
  }
  return group;
}

/** Summon one monster: its sigil, its silhouette loading in, and the monster itself when the summon is done. */
export function queueSpawn(s: GameScene, kind: EnemyKind, x: number, y: number, o: { elite?: boolean; mini?: boolean; dur?: number; group?: SummonGroup } = {}) {
  if (solidAt(s.dungeon, x, y)) [x, y] = openSpot(s.dungeon, x, y);
  const elite = !!o.elite;
  const mini = !!o.mini;
  const tier = elite ? 4 : SPAWN_TIER[kind];
  const style = elite ? undefined : SPAWN_STYLE[kind];
  const color = hexToNum(kind === 'wanderer' ? s.kit.px.slime : kind === 'magma' ? E.orange : s.kit.palette.danger);
  const group = o.group ?? { left: 1, enemies: [] };
  // Its silhouette loads in where its entrance starts: up in the air for what drops or dives in, off to one side
  // for what rolls in.
  const side = Math.random() < 0.5 ? -1 : 1;
  const [ox, oy] = style === 'slam' ? [0, -90] : style === 'swoop' ? [14 * side, -64] : style === 'roll' ? [42 * side, 0] : [0, 0];
  const ghost = makeGhost(s, K(`en-${kind}-a`, s.kit), x + ox, y + oy, 0.8, elite ? 1.6 : mini ? 0.8 : 1, s.player.x < x, color);
  s.pendingSpawns++;
  const t: Telegraph = {
    kind: 'spawn',
    x,
    y,
    r: SIGIL_R[tier - 1],
    t: 0,
    dur: o.dur ?? WAVE_RULES.quick,
    tier,
    style,
    color,
    ghost,
    ox,
    oy,
    group,
    onDone: () => {
      ghost.forEach((o) => o.destroy());
      s.pendingSpawns--;
      group.left--;
      if (s.mode === 'dead' || s.mode === 'end' || !s.active) return;
      const e = s.spawnEnemy(kind, x, y, elite, mini);
      arrive(s, e, t);
      group.enemies.push(e);
      if (group.left <= 0) group.onLand?.(group.enemies);
    },
  };
  s.telegraphs.push(t);
  return t;
}

/** Drop every summon still loading (a room cleared, a floor left) along with its silhouette. */
export function clearSummons(s: GameScene) {
  let boss = false;
  for (const t of s.telegraphs) {
    t.ghost?.forEach((o) => o.destroy());
    if (t.tier === 5) boss = true;
  }
  s.telegraphs = s.telegraphs.filter((t) => t.kind !== 'spawn');
  if (boss) s.fx.dim(0, 200);
}

/** The moment a summoned monster appears: its column of light bursts, and each kind arrives its own way. */
function arrive(s: GameScene, e: Enemy, t: Telegraph) {
  const tier = t.tier ?? 1;
  const style = t.style;
  const danger = s.kit.palette.danger;
  const [sx, sy] = [e.x + (t.ox ?? 0), e.y + (t.oy ?? 0)];
  s.visuals.push({ kind: 'beam', pts: [sx, e.y + 2, sx, e.y - columnHeight(t)], width: tier + 1, t: 0, dur: 0.22, color: t.color ?? hexToNum(danger) });
  s.fx.ring(sx, sy - 4, 12 + tier * 4, danger, 260, 1);
  s.fx.sparks(sx, sy - 6, 3 + tier * 2, 'white');
  s.light.flash(sx, sy - 6, 44 + tier * 10, danger, 0.28);
  e.flash = 0.06;
  const hold = WAVE_RULES.wake;
  if (style && style !== 'portal') {
    e.enter = { kind: style, t: 0, ox: t.ox, hold };
    audio.spawn(style);
    switch (style) {
      case 'ooze':
        s.fx.dust(e.x, e.y, 3);
        break;
      case 'burrow':
        s.fx.dust(e.x, e.y, 9);
        s.fx.ring(e.x, e.y, 12, E.tan, 200, 1);
        break;
      case 'smoke':
        s.fx.dust(e.x, e.y - 4, 14);
        s.fx.ring(e.x, e.y - 4, 16, E.white, 220, 1);
        break;
      case 'bones':
        s.fx.sparks(e.x, e.y - 6, 8, 'white');
        break;
      case 'beam':
        s.light.flash(e.x, e.y - 6, 70, E.yellow, 0.35);
        s.fx.sparks(e.x, e.y - 6, 10, 'gold');
        break;
    }
    return;
  }
  // Out of a rift: shooters, and elites with a bigger burst.
  e.enter = { kind: 'emerge', t: 0, hold };
  audio.spawn('portal');
  if (tier >= 3) {
    s.fx.ring(e.x, e.y - 4, tier >= 4 ? 46 : 30, danger, 360, 2);
    s.fx.burst(e.x, e.y - 4, tier >= 4 ? 14 : 8);
    s.fx.shake(tier >= 4 ? 0.2 : 0.08);
    if (tier >= 4) s.fx.flash(danger, 0.12, 200);
  }
}

/** Entrance tweens, driven per frame since the enemy loop repositions sprites every frame. */
export function entrance(s: GameScene, a: Enemy, sp: Img, dt: number) {
  const en = a.enter!;
  en.t += dt;
  const DUR: Record<string, number> = { rise: 0.2, drop: 0.24, emerge: 0.4, ooze: 0.32, swoop: 0.3, burrow: 0.3, smoke: 0.14, bones: 0.22, mist: 0.55, slam: 0.22, beam: 0.36, bubble: 0.4, roll: 0.3 };
  const dur = DUR[en.kind] ?? 0.3;
  const settle = en.kind === 'drop' || en.kind === 'slam' ? 0.12 : 0;
  const scale = a.scale;
  if (en.t >= dur + settle) {
    // Arrived: it crouches for a breath, then springs up and moves.
    const k = clamp((en.t - dur - settle) / Math.max(0.01, en.hold ?? 0), 0, 1);
    sp.setScale(scale * (1 + 0.12 * k), scale * (1 - 0.12 * k)).setAlpha(a.kind === 'ghost' ? 0.9 : 1).setRotation(0);
    if (k >= 1) {
      a.enter = undefined;
      sp.setScale(scale);
    }
    return;
  }
  const k = Math.min(1, en.t / dur);
  switch (en.kind) {
    case 'rise': {
      // Grows up out of the circle, overshooting a little.
      const h = k < 0.7 ? (k / 0.7) * 1.15 : 1.15 - ((k - 0.7) / 0.3) * 0.15;
      sp.setScale(scale * (1 - (1 - k) * 0.3), scale * h);
      break;
    }
    case 'drop':
    case 'slam': {
      // Falls from above and squashes on landing; heavy ones shake the floor.
      const heavy = en.kind === 'slam';
      sp.y -= Math.round((1 - k) * (1 - k) * (heavy ? 90 : 48));
      sp.setAlpha(Math.min(1, k * 4));
      if (k >= 1 && !en.landed) {
        en.landed = true;
        s.fx.dust(a.x, a.y, heavy ? 12 : 6);
        s.fx.shake(heavy ? 0.12 : 0.04);
        if (heavy) s.fx.ring(a.x, a.y, 26, E.white, 260, 2);
      }
      if (k >= 1) sp.setScale(scale * 1.25, scale * 0.75);
      break;
    }
    case 'ooze': {
      // Bubbles up out of its puddle and wobbles into shape.
      const w = Math.sin(k * Math.PI * 3) * (1 - k) * 0.25;
      sp.setScale(scale * (1.4 - 0.4 * k + w), scale * (0.2 + 0.8 * k - w));
      break;
    }
    case 'swoop': {
      // Dives in from high up and to the side its silhouette waited on.
      const q = 1 - (1 - k) * (1 - k);
      sp.x += Math.round((1 - q) * (en.ox ?? 14));
      sp.y -= Math.round((1 - q) * 64);
      break;
    }
    case 'burrow': {
      // Bursts up out of the ground in a little hop.
      sp.y -= Math.round(Math.sin(k * Math.PI) * 10);
      sp.setScale(scale * (0.8 + 0.2 * k), scale * Math.min(1.15, 0.3 + k));
      break;
    }
    case 'smoke':
      sp.setAlpha(k).setScale(scale * (1.3 - 0.3 * k));
      break;
    case 'bones':
      // The bones snap together: a white flash, then its colours.
      if (k < 0.5) sp.setTintFill(0xffffff);
      sp.setScale(scale * (1.2 - 0.2 * k));
      break;
    case 'mist':
      sp.setAlpha(0.9 * k);
      sp.y -= Math.round((1 - k) * 8);
      break;
    case 'beam':
      if (k < 0.6) sp.setTintFill(0xffffff);
      sp.setAlpha(Math.min(1, k * 2)).setScale(scale * (1.25 - 0.25 * k));
      break;
    case 'bubble': {
      // Floats up from below, bobbing.
      sp.y += Math.round((1 - k) * 12);
      sp.x += Math.round(Math.sin(k * 9) * 2 * (1 - k));
      sp.setScale(scale * (0.6 + 0.4 * k)).setAlpha(Math.min(1, k * 2.5));
      break;
    }
    case 'roll': {
      // Rolls in from the side its silhouette waited on, fuse fizzing.
      const q = 1 - (1 - k) * (1 - k);
      sp.x += Math.round((en.ox ?? 0) * (1 - q));
      sp.setRotation((1 - q) * (en.ox ?? 0) * -0.3);
      if (Math.random() < 0.5) s.fx.sparks(sp.x, sp.y - 8, 1, 'gold');
      break;
    }
    default:
      // Steps out of the rift as a black silhouette, then takes its colours.
      sp.setScale(scale * (0.6 + 0.4 * k));
      if (k < 0.65) sp.setTintFill(hexToNum(E.ink));
      sp.setAlpha(Math.min(1, 0.3 + k));
  }
}

/** The column of light reaches up past the silhouette, even one waiting in the air. */
const columnHeight = (t: Telegraph) => Math.max(COLUMN_H[(t.tier ?? 1) - 1], 24 - (t.oy ?? 0));

/** A stretch of the floor's squashed (3/4 view) ellipse, from angle a0 to a1. */
function arc(g: Phaser.GameObjects.Graphics, x: number, y: number, rx: number, ry: number, a0: number, a1: number) {
  if (Math.abs(a1 - a0) < 0.01) return;
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) / TAU) * Math.max(14, rx * 1.6)));
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const px = x + Math.cos(a) * rx;
    const py = y + Math.sin(a) * ry;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.strokePath();
}

/** A jagged bolt from somewhere above down to (x, y). */
function bolt(s: GameScene, x: number, y: number, width: number, color: number, spread = 8) {
  const top = s.cameras.main.worldView.y - 10;
  const pts = [x + rand(-spread, spread), top];
  for (let i = 1; i < 6; i++) pts.push(x + rand(-spread, spread), top + ((y - top) * i) / 6);
  pts.push(x, y);
  s.visuals.push({ kind: 'bolt', pts, width, t: 0, dur: 0.16, color });
}

/** The pieces of a silhouette: a pale fill, then four copies in the summon's colour a pixel off each way. */
const GHOST_OFFSETS = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/** A silhouette to load in: a pale fill inside a one-pixel outline in the summon's colour. */
function makeGhost(s: GameScene, key: string, x: number, y: number, originY: number, scale: number, flip: boolean, color: number): Img[] {
  return GHOST_OFFSETS.map(([dx, dy], i) =>
    s.add
      .image(Math.round(x) + dx, Math.round(y) + dy, key)
      .setOrigin(0.5, originY)
      .setScale(scale)
      .setFlipX(flip)
      .setDepth(DEPTH.gfx + (i ? 0.1 : 0.11))
      .setTintFill(i ? color : 0xffffff)
      .setAlpha(0),
  );
}

/**
 * The silhouette loading in: scanned line by line from the bottom (out of the floor), from the top (down a beam,
 * or for what waits in the air), or fading in and out (smoke, mist). A bright line runs along the loading edge,
 * and the whole silhouette flashes white as the summon gathers.
 */
function drawGhost(s: GameScene, t: Telegraph, load: number, blink: boolean) {
  const parts = t.ghost;
  if (!parts?.length) return;
  const gh = parts[0];
  const fw = gh.frame.width;
  const fh = gh.frame.height;
  const sc = gh.scaleX;
  const mode = t.style === 'smoke' || t.style === 'mist' ? 'fade' : t.style === 'beam' || (t.oy ?? 0) < 0 ? 'down' : 'up';
  // A little interference now and then: the silhouette slips a pixel sideways.
  const slip = Math.random() < 0.07 ? (Math.random() < 0.5 ? -1 : 1) : 0;
  const bx = Math.round(t.x + (t.ox ?? 0)) + slip;
  const by = Math.round(t.y + (t.oy ?? 0));
  const rows = mode === 'fade' ? fh : Math.round(fh * load);
  const flicker = mode === 'fade' ? load * (0.5 + 0.4 * Math.random()) : rows > 0 ? 1 : 0;
  parts.forEach((o, i) => {
    const [dx, dy] = GHOST_OFFSETS[i];
    o.setPosition(bx + dx, by + dy);
    o.setTintFill(blink || !i ? 0xffffff : (t.color ?? 0xffffff));
    o.setAlpha(flicker * (i ? 0.95 : blink ? 1 : 0.5 + 0.12 * Math.sin(s.time0 * 20)));
    if (mode !== 'fade') o.setCrop(0, mode === 'up' ? fh - rows : 0, fw, rows);
  });
  if (mode === 'fade' || rows <= 0 || rows >= fh) return;
  const top = by - gh.originY * fh * sc;
  const edge = top + (mode === 'up' ? fh - rows : rows) * sc;
  const w = Math.round(fw * sc);
  s.gfx.fillStyle(0xffffff, 0.95);
  s.gfx.fillRect(bx - Math.round(w / 2) - 2, Math.round(edge), w + 4, 1);
}

/** A summon off the screen gets a pulsing arrow at the screen's edge, pointing at it. */
function drawOffscreen(s: GameScene, x: number, y: number, color: number) {
  const view = s.cameras.main.worldView;
  if (x > view.x && x < view.right && y > view.y && y < view.bottom) return;
  const m = 12;
  const cx = clamp(x, view.x + m, view.right - m);
  const cy = clamp(y, view.y + m, view.bottom - m);
  const a = Math.atan2(y - cy, x - cx);
  const g = s.gfx;
  const pulse = 0.55 + 0.45 * Math.abs(Math.sin(s.time0 * 8));
  const [ux, uy] = [Math.cos(a), Math.sin(a)];
  const tip = [cx + ux * 4, cy + uy * 4];
  g.fillStyle(hexToNum(E.ink), 0.8);
  g.fillTriangle(tip[0] + ux, tip[1] + uy, cx - uy * 5 - ux * 2, cy + ux * 5 - uy * 2, cx + uy * 5 - ux * 2, cy - ux * 5 - uy * 2);
  g.fillStyle(color, pulse);
  g.fillTriangle(tip[0], tip[1], cx - uy * 3.5 - ux, cy + ux * 3.5 - uy, cx + uy * 3.5 - ux, cy - ux * 3.5 - uy);
}

/** Each summon, every frame: the sigil and its loading ring on the floor, the column of light, the silhouette. */
export function drawSummon(s: GameScene, g: Phaser.GameObjects.Graphics, t: Telegraph, k: number) {
  if (t.tier === 5) {
    drawBossSummon(s, g, t, k);
    return;
  }
  if (t.style) drawSpawnOmen(s, g, t, k);
  const vg = s.gfx;
  const tier = t.tier ?? 1;
  const danger = hexToNum(s.kit.palette.danger);
  const col = t.color ?? danger;
  const time = s.time0;
  // The three beats: the sigil is drawn, the monster loads in, and it all gathers before the break.
  const drawn = clamp(k / 0.2, 0, 1);
  const load = clamp((k - 0.12) / 0.73, 0, 1);
  const charge = clamp((k - 0.85) / 0.15, 0, 1);
  const blink = charge > 0 && Math.floor(time * 30) % 2 === 0;
  const ring = blink ? 0xffffff : danger;
  // The sigil tightens as it gathers.
  const rx = (t.r ?? 10) * (1 - 0.18 * charge);
  const ry = rx * 0.55;
  const spin = time * (tier >= 4 ? 2.2 : 1.6);
  // A dark pool, with the glow filling it as the monster loads.
  g.fillStyle(hexToNum(E.ink), 0.4 * drawn);
  g.fillEllipse(t.x, t.y, rx * 2, ry * 2);
  g.fillStyle(col, 0.12 + 0.3 * load + 0.25 * charge);
  g.fillEllipse(t.x, t.y, rx * 1.7 * load, ry * 1.7 * load);
  // Out of a rift: shooters and strong monsters get a dark swirl in the middle.
  if (tier === 3 || t.style === 'portal') {
    g.lineStyle(1, danger, 0.75);
    for (let arm = 0; arm < 3; arm++) {
      g.beginPath();
      for (let i = 0; i <= 6; i++) {
        const q = i / 6;
        const a = -time * 4 + arm * (TAU / 3) + q * 2.4;
        const rr = rx * 0.7 * load * (1 - q * 0.8);
        const px = t.x + Math.cos(a) * rr;
        const py = t.y + Math.sin(a) * rr * 0.55;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
    }
  }
  // The rim is traced round first, and its runes tick on after it.
  g.lineStyle(1, ring, 0.55);
  arc(g, t.x, t.y, rx, ry, -Math.PI / 2, -Math.PI / 2 + TAU * drawn);
  const runes = tier >= 3 ? 8 : 6;
  g.fillStyle(ring, 0.9);
  for (let i = 0; i < runes && i / runes < drawn; i++) {
    const a = spin * 0.25 + (i / runes) * TAU;
    g.fillRect(Math.round(t.x + Math.cos(a) * (rx + 3)), Math.round(t.y + Math.sin(a) * (ry + 2)) - 1, 1, 2);
  }
  // The loading ring: a bright arc filling round the rim, with a spark at its head.
  if (load > 0) {
    const a0 = -Math.PI / 2;
    const a1 = a0 + TAU * load;
    g.lineStyle(2, blink ? 0xffffff : col, 1);
    arc(g, t.x, t.y, rx, ry, a0, a1);
    g.fillStyle(0xffffff, 1);
    g.fillRect(Math.round(t.x + Math.cos(a1) * rx) - 1, Math.round(t.y + Math.sin(a1) * ry) - 1, 2, 2);
  }
  // The column of light: thin at first, filling out, brightest as it gathers; a soft glow round it, fainter toward
  // the top, and a pool of light where it meets the floor. An angel comes down its own beam instead.
  const H = columnHeight(t);
  const cx = Math.round(t.x);
  const w = Math.max(2, Math.round((tier >= 4 ? 12 : 4 + tier * 1.5) * (0.3 + 0.7 * load) * (1 + 0.4 * charge)));
  if (t.style !== 'beam') {
    const seg = Math.ceil(H / 4);
    for (let i = 0; i < 4; i++) {
      const fade = drawn * (1 - i * 0.24);
      vg.fillStyle(col, (0.05 + 0.1 * load + 0.1 * charge) * fade);
      vg.fillRect(cx - Math.floor(w / 2) - 2, t.y - seg * (i + 1), w + 4, seg);
      vg.fillStyle(col, (0.12 + 0.22 * load + 0.3 * charge) * fade);
      vg.fillRect(cx - Math.floor(w / 2), t.y - seg * (i + 1), w, seg);
    }
    vg.fillStyle(0xffffff, (0.2 + 0.35 * load + 0.45 * charge) * drawn);
    vg.fillRect(cx - 1, t.y - seg * 4, 2, seg * 4);
    vg.fillStyle(col, (0.2 + 0.4 * load) * drawn);
    vg.fillEllipse(cx, t.y, w + 8, 5);
  }
  // Motes rising up through it.
  for (let i = 0; i < 3 + tier; i++) {
    const q = (time * (0.8 + 0.25 * (i % 3)) + i * 0.37) % 1;
    vg.fillStyle(i % 2 ? 0xffffff : col, (1 - q) * (0.3 + 0.7 * load) * drawn);
    vg.fillRect(Math.round(cx + Math.sin(i * 2.4 + time * 2) * (w / 2 + 3)), Math.round(t.y - 3 - q * H * 0.8), 1, 1 + (i % 2));
  }
  // The silhouette, and (for what waits in the air or off to the side) a dotted line down to where it will land.
  drawGhost(s, t, load, blink);
  if ((t.ox || t.oy) && load > 0) {
    const n = 6;
    vg.fillStyle(col, 0.6 * load);
    for (let i = 1; i < n; i++) {
      const q = i / n;
      vg.fillRect(Math.round(t.x + (t.ox ?? 0) * (1 - q)), Math.round(t.y - 6 + ((t.oy ?? 0) + 6) * (1 - q)), 1, 1);
    }
  }
  // Elites call down three red bolts.
  if (tier === 4) {
    const due = Math.floor(k * 3.2);
    while ((t.strikes ?? 0) < Math.min(3, due)) {
      t.strikes = (t.strikes ?? 0) + 1;
      bolt(s, t.x, t.y, 2, danger);
      s.light.flash(t.x, t.y, 50, s.kit.palette.danger, 0.15);
      audio.shoot('chain');
    }
  }
  drawOffscreen(s, t.x, t.y - 8, danger);
}

/** What shows on the floor before a monster arrives: a puddle, cracks, a shadow, smoke, bones flying in... */
function drawSpawnOmen(s: GameScene, g: Phaser.GameObjects.Graphics, t: Telegraph, k: number) {
  const vg = s.gfx;
  const { x, y } = t;
  const col = t.color ?? 0xffffff;
  const time = s.time0;
  switch (t.style) {
    case 'ooze':
      g.fillStyle(col, 0.55);
      g.fillEllipse(x, y, 4 + 18 * k, 2 + 7 * k);
      g.fillStyle(0xffffff, 0.3);
      g.fillEllipse(x - 3 * k, y - 1, 4 * k, 1.5 * k);
      for (let i = 0; i < 3; i++) {
        const q = (time * 2 + i * 0.37) % 1;
        g.fillStyle(col, 0.8 * (1 - q));
        g.fillCircle(x + Math.sin(i * 2.1) * 6 * k, y - q * 6, 1 + (1 - q));
      }
      break;
    case 'swoop':
    case 'slam':
      // Its shadow grows as it comes down; something heavy gets a target ring too.
      g.fillStyle(0x181425, 0.2 + 0.45 * k);
      g.fillEllipse(x, y + 1, 6 + 14 * k, 3 + 5 * k);
      if (t.style === 'slam') {
        const r = 20 * (1 - k) + 7;
        g.lineStyle(1, hexToNum(s.kit.palette.danger), 0.8);
        g.strokeEllipse(x, y, r * 2, r * 1.2);
        for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) g.lineBetween(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6, x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4) * 0.6);
      }
      break;
    case 'burrow':
      // The ground cracks and heaves.
      g.fillStyle(0x3e2731, 0.55);
      g.fillEllipse(x, y, 6 + 8 * k, 3 + 3 * k);
      g.lineStyle(1, 0x181425, 0.75);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + 0.4;
        const len = 3 + 10 * k;
        g.lineBetween(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len * 0.5);
      }
      if (Math.random() < 0.25) s.fx.dust(x + rand(-5, 5), y, 1);
      break;
    case 'smoke':
      for (let i = 0; i < 7; i++) {
        const a = time * 4 + i * 0.9;
        const rr = 12 * (1 - k) + 3;
        vg.fillStyle(0xc0cbdc, 0.3 + 0.3 * k);
        vg.fillCircle(x + Math.cos(a) * rr, y - 6 + Math.sin(a) * rr * 0.5, 2 + k * 2);
      }
      break;
    case 'bones':
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + 0.3;
        const rr = 28 * (1 - k);
        vg.fillStyle(0xead4aa, 0.9);
        vg.fillRect(Math.round(x + Math.cos(a) * rr) - 1, Math.round(y - 6 + Math.sin(a) * rr * 0.6), 3, 1);
        vg.fillRect(Math.round(x + Math.cos(a) * rr) - 2, Math.round(y - 7 + Math.sin(a) * rr * 0.6), 1, 3);
      }
      break;
    case 'mist':
      for (let i = 0; i < 6; i++) {
        const q = (time * 0.8 + i * 0.17) % 1;
        vg.fillStyle(0xffffff, 0.22 * (1 - q) * (0.5 + k));
        vg.fillEllipse(x + Math.sin(i * 1.7 + time * 2) * 7, y - q * 24, 6, 2);
      }
      break;
    case 'beam': {
      const h = 130 * Math.min(1, k * 1.4);
      vg.fillStyle(0xfee761, 0.16 + 0.3 * k);
      vg.fillRect(x - 5, y - 130, 10, h);
      vg.fillStyle(0xffffff, 0.35 + 0.45 * k);
      vg.fillRect(x - 1, y - 130, 2, h);
      break;
    }
    case 'bubble':
      for (let i = 0; i < 6; i++) {
        const q = (time * 1.5 + i * 0.19) % 1;
        vg.lineStyle(1, 0xffffff, 0.7 * (1 - q));
        vg.strokeCircle(x + Math.sin(i * 2.3) * 7, y - q * 20, 1.5 + q);
      }
      break;
  }
}

// ---------------------------------------------------------------- the boss

/**
 * A boss is summoned: the camera turns to its spot and bars close in, the room dims, and over a couple of seconds
 * a great sigil is drawn while energy streams in from all around and lightning strikes. Its silhouette loads in
 * a pillar of light just above the floor; then it breaks out, drops, lands and roars (see bossAnim).
 */
export function summonBoss(s: GameScene, r: DRoom, kind: 'guardian' | 'boar') {
  const R = s.roomRect();
  const x = R.cx;
  const y = R.y0 + 92;
  const accent = bossAccent(s.kit.id, kind);
  const lift = bossDrop(s.kit.id, kind);
  const dur = BOSS_SUMMON;
  const ghost = makeGhost(s, kind === 'boar' ? 'boss-boar' : K('boss-guardian', s.kit), x, y - lift, 0.85, 2, s.player.x < x, hexToNum(accent));
  s.camFocus = { x, y: y - 30, t: dur + 2.2 };
  s.fx.dim(0.5, 700);
  ui.cinema((dur + 2) * 1000, false);
  s.fx.converge(() => ({ x, y: y - lift - 24 }), dur * 0.95, [accent, E.white], 56);
  audio.bossIntro(dur);
  s.telegraphs.push({
    kind: 'spawn',
    x,
    y,
    r: 46,
    t: 0,
    dur,
    tier: 5,
    color: hexToNum(accent),
    ghost,
    ox: 0,
    oy: -lift,
    onDone: () => {
      ghost.forEach((o) => o.destroy());
      s.fx.dim(0, 500);
      if (s.active !== r || s.mode === 'dead' || s.mode === 'end') return;
      s.boss = spawnBoss(s, kind);
    },
  });
}

/** The boss's sigil, every frame of its summon. */
function drawBossSummon(s: GameScene, g: Phaser.GameObjects.Graphics, t: Telegraph, k: number) {
  const vg = s.gfx;
  const col = t.color ?? 0xffffff;
  const time = s.time0;
  const drawn = clamp(k / 0.22, 0, 1);
  const star = clamp((k - 0.14) / 0.3, 0, 1);
  const lit = clamp((k - 0.3) / 0.5, 0, 1);
  const load = clamp((k - 0.08) / 0.82, 0, 1);
  const charge = clamp((k - 0.88) / 0.12, 0, 1);
  const blink = charge > 0 && Math.floor(time * 24) % 2 === 0;
  const c = blink ? 0xffffff : col;
  const rx = (t.r ?? 46) * (1 - 0.1 * charge);
  const ry = rx * 0.42;
  const spin = time * 0.5;
  const { x, y } = t;

  // The ground opens dark, and the style's glow pools in it.
  g.fillStyle(hexToNum(E.ink), 0.5 * drawn);
  g.fillEllipse(x, y, rx * 2.15, ry * 2.15);
  g.fillStyle(col, 0.08 + 0.22 * load + 0.2 * charge);
  g.fillEllipse(x, y, rx * 2 * load, ry * 2 * load);
  // Two rings, traced in opposite directions.
  g.lineStyle(2, c, 0.95);
  arc(g, x, y, rx, ry, -Math.PI / 2, -Math.PI / 2 + TAU * drawn);
  g.lineStyle(1, c, 0.75);
  arc(g, x, y, rx * 0.8, ry * 0.8, -Math.PI / 2, -Math.PI / 2 - TAU * drawn);
  // A hexagram, its six edges drawn one after another.
  const vx = (i: number) => x + Math.cos(spin + (i * TAU) / 6) * rx * 0.78;
  const vy = (i: number) => y + Math.sin(spin + (i * TAU) / 6) * ry * 0.78;
  g.lineStyle(1, c, 0.85);
  for (let j = 0; j < 6; j++) {
    const e = clamp(star * 6 - j, 0, 1);
    if (e <= 0) break;
    // Triangle edges: 0->2->4->0 and 1->3->5->1.
    const a = (j % 3) * 2 + (j >= 3 ? 1 : 0);
    const b = (a + 2) % 6;
    g.lineBetween(vx(a), vy(a), vx(a) + (vx(b) - vx(a)) * e, vy(a) + (vy(b) - vy(a)) * e);
  }
  // Twelve runes round the rim light up in turn.
  for (let i = 0; i < 12; i++) {
    const a = -spin * 0.6 + (i / 12) * TAU;
    const px = Math.round(x + Math.cos(a) * (rx + 6));
    const py = Math.round(y + Math.sin(a) * (ry + 3));
    const on = i / 12 < lit;
    if (!on && drawn < 1) continue;
    g.fillStyle(on ? c : col, on ? 1 : 0.3);
    // A little three-stroke glyph, a different one for each rune.
    g.fillRect(px - 1, py - 2, 3, 1);
    g.fillRect(px + ((i % 3) - 1), py - 1, 1, 2);
    if (i % 2) g.fillRect(px - 1, py + 1, 3, 1);
  }
  // The loading ring between the two rims.
  if (load > 0) {
    const a0 = -Math.PI / 2;
    const a1 = a0 + TAU * load;
    g.lineStyle(3, blink ? 0xffffff : col, 1);
    arc(g, x, y, rx * 0.9, ry * 0.9, a0, a1);
    g.fillStyle(0xffffff, 1);
    g.fillRect(Math.round(x + Math.cos(a1) * rx * 0.9) - 1, Math.round(y + Math.sin(a1) * ry * 0.9) - 1, 3, 3);
  }
  // The pillar of light, widening as it fills.
  const H = 180;
  const w = Math.round(6 + 22 * load + 10 * charge);
  for (let i = 0; i < 4; i++) {
    const seg = H / 4;
    vg.fillStyle(col, (0.06 + 0.18 * load + 0.25 * charge) * drawn * (1 - i * 0.2));
    vg.fillRect(Math.round(x - w / 2), y - seg * (i + 1), w, seg);
  }
  vg.fillStyle(0xffffff, (0.15 + 0.3 * load + 0.5 * charge) * drawn);
  vg.fillRect(Math.round(x - w / 6), y - H, Math.max(2, Math.round(w / 3)), H);
  for (let i = 0; i < 14; i++) {
    const q = (time * (0.6 + 0.15 * (i % 4)) + i * 0.29) % 1;
    vg.fillStyle(i % 3 ? col : 0xffffff, (1 - q) * (0.4 + 0.6 * load) * drawn);
    vg.fillRect(Math.round(x + Math.sin(i * 1.9 + time * 1.5) * (w / 2 + 6)), Math.round(y - 4 - q * H * 0.9), 2, 2);
  }
  drawGhost(s, t, load, blink);
  // The floor rumbles harder and harder, and lightning strikes the rim.
  const rumble = Math.floor(k * 10);
  if ((t.beats ?? -1) < rumble) {
    t.beats = rumble;
    s.fx.shake(0.04 + 0.12 * k);
    s.fx.dust(x + rand(-rx, rx), y + rand(-ry, ry), 2);
  }
  const strikes = [0.5, 0.66, 0.8, 0.9].filter((q) => k >= q).length;
  while ((t.strikes ?? 0) < strikes) {
    t.strikes = (t.strikes ?? 0) + 1;
    const a = rand(0, TAU);
    const bx = x + Math.cos(a) * rx;
    const by = y + Math.sin(a) * ry;
    bolt(s, bx, by, 3, col, 14);
    s.light.flash(bx, by, 90, '#ffffff', 0.2);
    s.fx.ring(bx, by, 22, E.white, 220, 1);
    s.fx.sparks(bx, by, 8, 'white');
    s.fx.shake(0.22);
    audio.bossStrike();
  }
}
