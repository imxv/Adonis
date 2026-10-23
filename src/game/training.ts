import { clamp } from '../core/math';
import { MAX_WEAPONS, WEAPONS, WEAPON_ORDER, magSize, type WeaponDef, type WeaponInstance } from '../data/weapons';
import { Grid, pxText } from '../pixel/draw';
import { E } from '../pixel/palette';
import { applyChoice } from './run';
import { FLOOR, PROP, T, VOID, WALL, type DRoom, type Dungeon } from './dungeon';
import { freshStatus, type Enemy, type Img, type Pickup } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';

/** The style the training ground is painted in: a castle yard reads as a drill hall. */
export const TRAINING_KIT = 'castle';
/** Seconds without a hit before a dummy group's meter freezes on its last reading. */
const IDLE = 3;
const DUMMY_HP = 1e6;

// Room bounds in tiles, [X0, X1) × [Y0, Y1); the dungeon adds a wall rim and a little void.
const X0 = 3;
const Y0 = 3;
const X1 = 37;
const Y1 = 20;
const MAP_W = X1 + 3;
const MAP_H = Y1 + 2;

/** The weapon racks, laid out from the data: every weapon lands on a row without listing it here. */
const RACK_X = 104;
const RACK_Y = 98;
const RACK_COL = 30;
const RACK_ROW = 40;
const RACK_ROWS: { label: string; has: (d: WeaponDef) => boolean }[] = [
  { label: '枪械', has: (d) => !d.element && (d.kind === 'bolt' || d.kind === 'spread') },
  { label: '特殊', has: (d) => !d.element && d.kind !== 'bolt' && d.kind !== 'spread' && d.kind !== 'slash' },
  { label: '元素', has: (d) => !!d.element && d.kind !== 'slash' },
  { label: '近战', has: (d) => d.kind === 'slash' },
];

interface DummyGroup {
  label: string;
  meter: Img;
  texture: Phaser.Textures.CanvasTexture;
  /** The current burst of hits: when it began, the last hit, and the damage dealt. */
  start: number;
  last: number;
  total: number;
  shown: string;
}

export interface DummyState {
  group: DummyGroup;
  homeX: number;
  homeY: number;
  baseY: number;
  /** Moving targets slide along y: amplitude in pixels and angular speed. */
  sway?: { range: number; speed: number };
}

export interface TrainingState {
  /** Where each weapon hangs, so a weapon put down goes back to its own place. */
  racks: Record<string, [number, number]>;
  groups: DummyGroup[];
}

/** One long hall: racks of weapons on the left, the dummies on the right. */
export function trainingDungeon(): Dungeon {
  const tiles = new Uint8Array(MAP_W * MAP_H).fill(VOID);
  const set = (x: number, y: number, v: number) => { tiles[y * MAP_W + x] = v; };
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) set(x, y, FLOOR);
  // The north face is two tiles tall; the other sides get a one-tile rim.
  for (let y = Y0 - 2; y <= Y1; y++) for (let x = X0 - 1; x <= X1; x++) if (tiles[y * MAP_W + x] === VOID) set(x, y, WALL);
  // A standing piece of the style in each lower corner, away from the racks and the targets.
  const decor = [{ x: X0, y: Y1 - 1, v: 0 }, { x: X1 - 1, y: Y1 - 1, v: 1 }];
  for (const p of decor) set(p.x, p.y, PROP);
  const room: DRoom = {
    id: 'training', gx: 0, gy: 0, depth: 0, type: 'start',
    doors: { up: false, right: false, down: false, left: false },
    cleared: true, visited: true, seen: true, seed: 2026,
    x0: X0, y0: Y0, x1: X1, y1: Y1, shape: 'rect', gates: [], props: [], traps: [], decor,
  };
  const torches: [number, number][] = [];
  for (let x = X0 + 2; x < X1 - 1; x += 6) torches.push([x * T + 8, (Y0 - 1) * T + 4]);
  return { w: MAP_W, h: MAP_H, tiles, blocked: new Set(), rooms: [room], byId: new Map([[room.id, room]]), start: room, boss: room, torches };
}

/** Where the hero stands when the training ground opens: below the racks, facing the dummies. */
export function trainingSpawn(): [number, number] {
  return [RACK_X + 3 * RACK_COL, (Y1 - 2) * T];
}

/** Hang every weapon the hero is not holding, set out the dummies, and write the house rules on the floor. */
export function setupTraining(s: GameScene): TrainingState {
  ensureTrainingTextures(s);
  const state: TrainingState = { racks: {}, groups: [] };
  const rows = RACK_ROWS.map((row) => ({ ...row, ids: WEAPON_ORDER.filter((id) => row.has(WEAPONS[id])) }));
  rows.forEach((row, r) => {
    const y = RACK_Y + r * RACK_ROW;
    s.worldLabels.push(s.add.image(RACK_X - RACK_COL / 2, y + 3, benchTexture(s, row.ids.length)).setOrigin(0, 0).setDepth(DEPTH.decal + 0.4));
    s.worldText(RACK_X - 34, y, row.label, E.greyM);
    row.ids.forEach((id, i) => {
      const x = RACK_X + i * RACK_COL;
      state.racks[id] = [x, y];
      if (!s.run.weapons.some((w) => w.def.id === id)) rackWeapon(s, { def: WEAPONS[id], cd: 0 }, x, y);
    });
  });
  const cx = ((X0 + X1) / 2) * T;
  s.worldText(cx, Y0 * T + 6, s.usesTouchControls() ? '走近武器看演示，点交互换上' : '走近武器停一下看演示，按 F 换上', E.grey);
  s.worldText(cx, Y0 * T + 20, s.usesTouchControls() ? '暂停后可返回画廊' : 'Esc 暂停，可返回画廊', E.greyM);
  const single = addGroup(s, state, '木桩', 412, 132);
  addDummy(s, single, 412, 132);
  const crowd = addGroup(s, state, '木桩群', 446, 268);
  for (const [x, y] of [[430, 238], [462, 238], [446, 258]] as const) addDummy(s, crowd, x, y);
  const moving = addGroup(s, state, '移动靶', 528, 214);
  addDummy(s, moving, 528, 150, { range: 44, speed: 1.6 });
  // The castle hall is dim away from its torches; lamps over the racks and targets keep everything readable.
  for (const [x, y, r] of [[170, 130, 120], [300, 170, 110], [412, 120, 70], [446, 245, 80], [528, 150, 80]] as const) s.light.addStatic(x, y, r, E.cream);
  return state;
}

/** A weapon on the rack is always loaded and ready, whatever state it was put down in. */
function freshWeapon(s: GameScene, def: WeaponDef): WeaponInstance {
  const weapon: WeaponInstance = { def, cd: 0 };
  const mag = magSize(weapon, s.run.mods.mag);
  if (mag) weapon.ammo = mag;
  return weapon;
}

function rackWeapon(s: GameScene, weapon: WeaponInstance, x: number, y: number) {
  return s.dropWeapon(freshWeapon(s, weapon.def), x, y, false, false);
}

/**
 * Take a weapon off the rack. A free hand just takes it; otherwise the one in hand goes back
 * to its own place on the rack, with no swap dialog, so the player can try them one after another.
 */
export function takeTrainingWeapon(s: GameScene, state: TrainingState, p: Pickup) {
  const run = s.run;
  const incoming = freshWeapon(s, p.weapon!.def);
  const full = run.weapons.length >= MAX_WEAPONS;
  const replaced = applyChoice(run, { type: 'weapon-new', id: incoming.def.id, instance: incoming }, full ? run.held : undefined);
  if (!run.weapons.some((w) => w.def.id === incoming.def.id)) return false;
  if (replaced) {
    const [x, y] = state.racks[replaced.def.id] ?? [p.x, p.y];
    rackWeapon(s, replaced, x, y);
  }
  return true;
}

function addGroup(s: GameScene, state: TrainingState, label: string, x: number, y: number): DummyGroup {
  s.worldText(x, y + 12, label, E.greyM);
  const key = `training-meter-${state.groups.length}`;
  const texture = (s.textures.exists(key) ? s.textures.get(key) : s.textures.createCanvas(key, 64, 10)) as Phaser.Textures.CanvasTexture;
  const meter = s.add.image(Math.round(x), Math.round(y + 24), key).setDepth(DEPTH.numbers - 0.6);
  s.worldLabels.push(meter);
  const group: DummyGroup = { label, meter, texture, start: 0, last: -Infinity, total: 0, shown: '' };
  state.groups.push(group);
  drawMeter(group, '', false);
  return group;
}

function addDummy(s: GameScene, group: DummyGroup, x: number, y: number, sway?: DummyState['sway']) {
  const e: Enemy = {
    id: s.nextId++, kind: 'wanderer', x, y, vx: 0, vy: 0, kx: 0, ky: 0,
    r: 7, hp: DUMMY_HP, maxHp: DUMMY_HP, speed: 0, contact: 0, xp: 0,
    elite: false, state: 'idle', t: 0, t2: 0, anim: 0, facing: Math.PI,
    flash: 0, dead: false, scale: 1, status: freshStatus(),
    sprite: s.add.image(x, y, 'training-dummy').setOrigin(0.5, 0.92).setDepth(DEPTH.enemy),
    shadow: s.add.image(x, y + 1, 'shadow').setDepth(DEPTH.shadow),
    dummy: { group, homeX: x, homeY: y, baseY: y, sway },
  };
  s.enemies.push(e);
}

/** A dummy stays on its post: a shove rocks it, and it springs back. Moving targets slide along their track. */
export function holdDummy(s: GameScene, e: Enemy) {
  const d = e.dummy!;
  if (d.sway) d.homeY = d.baseY + Math.sin(s.time0 * d.sway.speed) * d.sway.range;
  e.vx = (d.homeX - e.x) * 6;
  e.vy = (d.homeY - e.y) * 6;
  e.sprite.setFlipX(s.player.x < e.x);
  e.sprite.setAngle(clamp((e.x - d.homeX) * 3 + e.kx * 0.08, -24, 24));
}

/** Every hit lands on the meter; the dummy itself never falls. */
export function hitDummy(s: GameScene, e: Enemy, dmg: number) {
  const g = e.dummy!.group;
  const now = s.time0;
  if (now - g.last > IDLE) {
    g.start = now;
    g.total = 0;
  }
  g.total += dmg;
  g.last = now;
  e.hp = e.maxHp;
}

/** Damage per second over the current burst; it freezes on the last reading once the hits stop. */
export function updateTraining(s: GameScene, state: TrainingState) {
  const now = s.time0;
  for (const g of state.groups) {
    if (g.last === -Infinity) continue;
    const active = now - g.last <= IDLE;
    const span = Math.max(1, (active ? now : g.last) - g.start);
    drawMeter(g, String(Math.round(g.total / span)), active);
  }
}

/** The meter is one reusable canvas; digits are drawn one by one, so no texture is made per reading. */
function drawMeter(g: DummyGroup, value: string, active: boolean) {
  const shown = `${value}:${active}`;
  if (shown === g.shown) return;
  g.shown = shown;
  const canvas = g.texture.getSourceImage() as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!value) {
    g.texture.refresh();
    return;
  }
  const color = active ? E.yellow : E.greyM;
  const parts = [pxText('DPS', { color: E.greyM, outline: E.ink, small: true }), ...[...value].map((d) => pxText(d, { color, outline: E.ink, small: true }))];
  const width = parts.reduce((w, part, i) => w + part.width - 1 + (i === 1 ? 3 : 0), 0);
  let x = Math.floor((canvas.width - width) / 2);
  parts.forEach((part, i) => {
    if (i === 1) x += 3;
    ctx.drawImage(part, x, Math.floor((canvas.height - part.height) / 2));
    x += part.width - 1;
  });
  g.texture.refresh();
}

const DUMMY_ROWS = [
  '.....tttt.....',
  '....tTTTTt....',
  '....tBTTBt....',
  '....tTTTTt....',
  '....ttBBtt....',
  '.....tttt.....',
  '......BB......',
  '.yyttttttttyy.',
  'y.yytTTTTtyy.y',
  '....tTrrrTt...',
  '....tTrwrTt...',
  '....tTrrrTt...',
  '....tTTTTTt...',
  '.....ttttt....',
  '....y.BB.y....',
  '......bb......',
  '......bb......',
  '......bb......',
  '...BBBbbBBB...',
  '..BBBBBBBBBB..',
];

function ensureTrainingTextures(s: GameScene) {
  if (!s.textures.exists('training-dummy')) s.textures.addCanvas('training-dummy', Grid.ascii(DUMMY_ROWS).render());
}

/** A low wooden bench under a row of n weapons, with a pair of legs under each one. */
function benchTexture(s: GameScene, n: number) {
  const key = `training-bench-${n}`;
  if (s.textures.exists(key)) return key;
  const width = Math.max(1, n) * RACK_COL;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = 9;
  const ctx = c.getContext('2d')!;
  const fill = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  fill(E.ink, 0, 0, width, 5);
  fill(E.tan, 1, 1, width - 2, 1);
  fill(E.brownL, 1, 2, width - 2, 1);
  fill(E.brown, 1, 3, width - 2, 1);
  for (let x = 0; x < width; x += RACK_COL) {
    for (const leg of [x + 3, x + RACK_COL - 7]) {
      fill(E.ink, leg, 5, 4, 4);
      fill(E.brownD, leg + 1, 5, 2, 3);
    }
  }
  s.textures.addCanvas(key, c);
  return key;
}
