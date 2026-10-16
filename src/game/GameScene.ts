import Phaser from 'phaser';
import { TAU, angleDiff, clamp, dist, dist2, hexToNum, lerp, segCircle } from '../core/math';
import { Rng, rand } from '../core/rng';
import type { Element } from '../core/stats';
import { audio } from '../audio/audio';
import { ENEMIES, AFFIXES, PETS, type Affix, type EnemyKind } from '../data/enemies';
import { SPELLS, SPELL_ORDER } from '../data/spells';
import { UPGRADE_BY_ID } from '../data/upgrades';
import { WEAPON_ORDER, magSize, reloadTime, weaponLevelCount, weaponLevelDamage, type WeaponInstance } from '../data/weapons';
import { E } from '../pixel/palette';
import { K, buildCommonTextures, buildKitTextures, buildLevel, textTexture } from '../styles/textures';
import type { StyleKit } from '../styles/types';
import { decoArt } from '../pixel/decor';
import { ui } from '../ui/ui';
import { settings } from '../settings';
import { DIRS, DIR_VEC } from './dirs';
import { bossDeath, spawnBoss, updateBoss } from './boss';
import { T, collide, generateDungeon, openSpot, randomFloorIn, raycast, roomAt, roomCenter, solidAt, type DRoom, type Dungeon } from './dungeon';
import { updateEnemyAI } from './enemyAI';
import { FlowField } from './flow';
import {
  ELEMENT_COLOR,
  type Enemy,
  type Hazard,
  type Img,
  type Obstacle,
  type Pet,
  type Pickup,
  type Player,
  type Proj,
  type ProjKind,
  type Telegraph,
  type Visual,
} from './entities';
import { DEPTH, Fx } from './fx';
import { Lighting } from './lighting';
import { syncPets, updatePets } from './pets';
import { LEVELS, applyChoice, applyFusion, evolutionsReady, fusionsReady, newRun, restoreRun, rollChoices, snapshotRun, spellTaken, xpForLevel, type Choice, type RunState } from './run';
import type { FusionId } from '../data/spells';
import { addScore, clearRun, loadRun, saveRun, scoreOf, type SavedRun } from '../save';
import { buildCodex } from '../ui/codex';
import { clearSpellVisuals, updateSpells, zap } from './spells';

type Mode = 'title' | 'play' | 'choose' | 'pause' | 'transition' | 'dead' | 'end';

interface Pedestal {
  x: number;
  y: number;
  ped: Img;
  item: Img;
  glow: Img;
  label: Img;
  choice: Choice;
  room: DRoom;
}

interface SpikeTrap {
  kind: 'spikes';
  room: DRoom;
  tiles: [number, number][];
  cx: number;
  cy: number;
  period: number;
  phase: number;
  t: number;
  state: 'down' | 'warn' | 'up';
  sprites: Img[];
  hit: Map<Enemy, number>;
}

interface SawTrap {
  kind: 'saw';
  room: DRoom;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  u: number;
  dir: number;
  spin: number;
  x: number;
  y: number;
  sprite: Img;
  hit: Map<Enemy, number>;
}

export type Trap = SpikeTrap | SawTrap;

/** How strong each enemy's summon looks: weak ones rise from a rune, strong ones step out of a rift. */
const SPAWN_TIER: Record<EnemyKind, 1 | 2 | 3> = { wanderer: 1, bat: 1, charger: 2, shooter: 2, bomber: 2, shield: 3 };

/** How far the camera leans toward the cursor, in pixels. */
/** Seconds from the start of a spell fusion to the moment it lands; the sound is booked for the same moment. */
const FUSE_GATHER = 1.25;
/** The two colours each fusion's energy streams in with. */
const FUSION_GLOW: Record<FusionId, [string, string]> = {
  storm: [E.cyan, E.yellow],
  bladestorm: [E.blue, E.grey],
  plague: [E.green, E.magenta],
  starfall: [E.orange, E.yellow],
  seeker: [E.cyan, E.white],
  singularity: [E.magenta, E.blue],
};
const LEAN_X = 46;
const LEAN_Y = 28;

export class GameScene extends Phaser.Scene {
  run!: RunState;
  kit!: StyleKit;
  fx!: Fx;
  light!: Lighting;
  gfx!: Phaser.GameObjects.Graphics;
  floorGfx!: Phaser.GameObjects.Graphics;
  spellGfx!: Phaser.GameObjects.Graphics;
  cursorGfx!: Phaser.GameObjects.Graphics;
  bg?: Img;
  decals?: Phaser.GameObjects.RenderTexture;
  ambient?: Phaser.GameObjects.Particles.ParticleEmitter;
  player!: Player;
  enemies: Enemy[] = [];
  pproj: Proj[] = [];
  eproj: Proj[] = [];
  pickups: Pickup[] = [];
  obstacles: Obstacle[] = [];
  /** The biome's standing pieces (statues, trees, lanterns); their tiles are solid, these are the pictures. */
  decor: Img[] = [];
  hazards: Hazard[] = [];
  pets: Pet[] = [];
  telegraphs: Telegraph[] = [];
  visuals: Visual[] = [];
  pedestals: Pedestal[] = [];
  gates: Img[] = [];
  traps: Trap[] = [];
  worldLabels: Img[] = [];
  trapdoor?: { img: Img; label: Img; final: boolean };
  dungeon!: Dungeon;
  /** Walking distances to the player, for enemies finding their way around cover. */
  flow!: FlowField;
  /** The room the player is in (or last stood in, while in a corridor). */
  room?: DRoom;
  /** The room whose fight is running; its gates are shut. */
  active?: DRoom;
  mode: Mode = 'title';
  waves: { kind: EnemyKind; elite: boolean }[][] = [];
  waveIdx = 0;
  waveTimer = 0;
  hordeT = 0;
  hordeDur = 0;
  spawnT = 0;
  swarmT = 0;
  pendingSpawns = 0;
  combo = 0;
  comboT = 0;
  gemStreak = 0;
  gemT = 0;
  hitstop = 0;
  slowT = 0;
  slowScale = 1;
  pendingLevelUps = 0;
  /** A fusion is playing out: the knight cannot be hurt, and level-ups and the pause menu wait for it. */
  fusing = false;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  autoFire = false;
  god = false;
  nextId = 1;
  boss?: Enemy;
  hudT = 0;
  params = new URLSearchParams(location.search);
  /** The last room the player stood in that was safe (cleared): where a continued run resumes. */
  private safeRoom?: DRoom;
  /** Revolver cylinder over the knight's head while reloading. */
  private reloadIcon!: Img;
  private reloadShown = -1;
  private reloadPopping = false;
  /** Seconds left of the gun-swap flourish. */
  private swapT = 0;
  private camX = 0;
  private camY = 0;
  private kickX = 0;
  private kickY = 0;
  private pointerMoved = false;
  time0 = 0;
  aimX = 0;
  aimY = 0;

  constructor() {
    super('game');
  }

  create() {
    buildCommonTextures(this);
    this.fx = new Fx(this);
    this.light = new Lighting(this);
    this.floorGfx = this.add.graphics().setDepth(DEPTH.hazard);
    this.spellGfx = this.add.graphics().setDepth(DEPTH.pet - 0.5);
    this.gfx = this.add.graphics().setDepth(DEPTH.gfx);
    this.cursorGfx = this.add.graphics().setDepth(DEPTH.cursor);
    this.reloadIcon = this.add.image(0, 0, 'cyl-0').setDepth(DEPTH.numbers - 0.2).setVisible(false);
    this.input.mouse?.disableContextMenu();
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,ESC,F,SHIFT,Q,E') as Record<string, Phaser.Input.Keyboard.Key>;
    // Esc only opens the pause page; once it is up, the page handles Esc itself.
    kb.on('keydown-ESC', () => {
      if (this.mode === 'play' && performance.now() - ui.closedAt > 250) this.openPause();
    });
    kb.on('keydown-F', () => {
      if (this.mode !== 'play') return;
      this.autoFire = !this.autoFire;
      ui.toast(this.autoFire ? '自动射击 开' : '自动射击 关', 900);
    });
    kb.on('keydown-Q', () => this.switchGun());
    kb.on('keydown-R', () => {
      if (this.mode === 'play') this.startReload(this.run.weapons[this.run.held]);
    });
    kb.on('keydown-E', () => this.useSkill());
    this.input.on('pointermove', () => (this.pointerMoved = true));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.pointerMoved = true;
      if (p.rightButtonDown()) this.useSkill();
    });
    this.input.on('wheel', () => this.switchGun());
    this.god = this.params.has('god');
    ui.mount(this.game.canvas);
    const apply = (st: ReturnType<typeof settings.get>) => {
      audio.setVolumes(st.music, st.sfx);
      this.light.setEnabled(st.light);
    };
    apply(settings.get());
    settings.onChange(apply);
    this.showTitle();
  }

  showTitle() {
    this.mode = 'title';
    ui.showHud(false);
    ui.title({
      save: () => loadRun(),
      onContinue: () => {
        const saved = loadRun();
        if (!saved) return this.showTitle();
        void audio.init();
        this.startRun(saved);
      },
      onNew: () => {
        void audio.init();
        this.startRun();
      },
      codex: () => buildCodex(this),
    });
  }

  /** Leave the run for the main menu; progress is saved so it can be continued. */
  quitToTitle() {
    this.saveProgress();
    this.clearLevel();
    audio.setIntensity(0);
    this.showTitle();
  }

  saveProgress() {
    const run = this.run;
    const d = this.dungeon;
    if (!run || !d || this.mode === 'dead' || this.mode === 'end' || this.mode === 'title') return;
    saveRun({
      v: 1,
      savedAt: Date.now(),
      ...snapshotRun(run),
      rooms: d.rooms.map((r) => ({ id: r.id, cleared: r.cleared, visited: r.visited, seen: r.seen })),
      at: (this.safeRoom ?? d.start).id,
    });
  }

  /** A finished run goes on the local leaderboard and its save is removed. */
  recordRun(victory: boolean) {
    clearRun();
    const run = this.run;
    const date = Date.now();
    const base = { victory, floor: run.level + 1, kills: run.kills, lv: run.xpLevel, secs: Math.round(run.elapsed), diff: run.diff.id };
    const score = scoreOf(base);
    const rank = addScore({ ...base, score, date });
    return { score, rank, date };
  }

  openPause() {
    if (this.fusing) return;
    this.mode = 'pause';
    const fights = this.dungeon.rooms.filter((r) => r.type === 'combat' || r.type === 'horde' || r.type === 'boss');
    ui.pause(
      { run: this.run, floorName: this.kit.name, roomsCleared: fights.filter((r) => r.cleared).length, roomsTotal: fights.length },
      {
        onResume: () => {
          if (this.mode === 'pause') this.mode = 'play';
        },
        onQuit: () => this.quitToTitle(),
        codex: () => buildCodex(this),
      },
    );
  }

  // ---------------------------------------------------------------- run and floors

  startRun(saved?: SavedRun) {
    this.clearLevel();
    this.pets.forEach((p) => p.sprite.destroy());
    this.pets = [];
    this.run = saved ? restoreRun(saved) : newRun(this.params);
    this.combo = 0;
    this.pendingLevelUps = 0;
    this.fusing = false;
    this.autoFire = false;
    this.safeRoom = undefined;
    if (this.player) {
      this.player.sprite.setVisible(true);
      this.player.gun.setVisible(true);
      this.player.iframes = 1;
    }
    this.enterLevel(true, saved);
  }

  clearLevel() {
    for (const e of this.enemies) this.destroyEnemy(e);
    this.enemies = [];
    for (const p of [...this.pproj, ...this.eproj]) this.killProj(p, true);
    this.pproj = [];
    this.eproj = [];
    for (const p of this.pickups) {
      (p.sprite.getData('glow') as Img | undefined)?.destroy();
      p.sprite.destroy();
    }
    this.pickups = [];
    this.obstacles.forEach((o) => o.sprite.destroy());
    this.obstacles = [];
    this.decor.forEach((s) => s.destroy());
    this.decor = [];
    this.hazards = [];
    this.telegraphs = [];
    this.visuals = [];
    this.pedestals.forEach((p) => [p.ped, p.item, p.glow, p.label].forEach((o) => o.destroy()));
    this.pedestals = [];
    this.gates.forEach((g) => g.destroy());
    this.gates = [];
    for (const t of this.traps) (t.kind === 'spikes' ? t.sprites : [t.sprite]).forEach((o) => o.destroy());
    this.traps = [];
    this.worldLabels.forEach((l) => l.destroy());
    this.worldLabels = [];
    if (this.trapdoor) {
      this.trapdoor.img.destroy();
      this.trapdoor.label.destroy();
      this.trapdoor = undefined;
    }
    this.boss = undefined;
    this.active = undefined;
    this.room = undefined;
    this.pendingSpawns = 0;
    clearSpellVisuals(this);
    this.light?.clearStatic();
  }

  enterLevel(first = false, saved?: SavedRun) {
    this.clearLevel();
    const kit = this.run.styles[this.run.level];
    this.kit = kit;
    buildKitTextures(this, kit);
    this.fx.setKit(kit);
    ui.applyTheme(kit);
    audio.setStyle(kit);
    audio.setIntensity(0);
    const seed = this.run.seed + this.run.level * 7919;
    const d = generateDungeon(new Rng(seed), this.run.level, this.run.diff.traps);
    this.dungeon = d;
    this.flow = new FlowField(d);
    this.bg?.destroy();
    this.bg = this.add.image(0, 0, buildLevel(this, kit, d, seed)).setOrigin(0).setDepth(DEPTH.bg);
    this.decals?.destroy();
    this.decals = this.add.renderTexture(0, 0, d.w * T, d.h * T).setOrigin(0).setDepth(DEPTH.decal);
    this.cameras.main.setBounds(0, 0, d.w * T, d.h * T).setRoundPixels(true);
    if (!this.player) this.createPlayer();
    let startRoom = this.params.get('room') === 'boss' && first && !saved ? d.boss : d.start;
    // A continued run gets back this floor's cleared rooms and resumes in the last safe one.
    if (saved && saved.level === this.run.level) {
      for (const sr of saved.rooms) {
        const r = d.byId.get(sr.id);
        if (!r) continue;
        r.cleared = sr.cleared;
        r.visited = sr.visited;
        r.seen = sr.seen;
      }
      startRoom = d.byId.get(saved.at) ?? d.start;
    }
    this.safeRoom = startRoom.cleared ? startRoom : d.start;
    const [sx, sy] = openSpot(d, ...roomCenter(startRoom));
    const p = this.player;
    p.x = sx;
    p.y = sy + 10;
    p.vx = p.vy = 0;
    p.sprite.setVisible(true);
    p.gun.setVisible(true);
    this.camX = p.x;
    this.camY = p.y;
    this.cameras.main.centerOn(p.x, p.y);
    syncPets(this);
    this.pets.forEach((pet) => {
      pet.x = p.x + rand(-10, 10);
      pet.y = p.y + rand(-10, 10);
    });
    this.room = startRoom;
    startRoom.visited = true;
    this.markSeen(startRoom);
    this.light.setLevel(kit, d, seed);
    this.dressLevel(kit, d);
    this.populate(new Rng(seed + 1));
    this.ambient?.destroy();
    const cam = this.cameras.main;
    this.ambient = this.add
      .particles(0, 0, K('pt', kit), {
        x: { onEmit: () => cam.worldView.x + Math.random() * cam.worldView.width },
        y: { onEmit: () => cam.worldView.y + Math.random() * cam.worldView.height },
        lifespan: { min: 2500, max: 5000 },
        speedX: { min: -8, max: 8 },
        speedY: kit.id === 'volcano' || kit.id === 'factory' ? { min: -16, max: -4 } : { min: -3, max: 10 },
        alpha: { onUpdate: (_p: unknown, _k: string, t: number) => Math.sin(t * Math.PI) * 0.6 },
        frequency: 160,
        quantity: 1,
      } as any)
      .setDepth(DEPTH.particles + 0.5);
    this.mode = 'play';
    ui.showHud(true);
    ui.banner(`第${['一', '二', '三', '四'][this.run.level]}层`, kit.name, kit.en, kit.subtitle, first ? 2400 : 2200);
    if (!first) cam.fadeIn(420, 255, 255, 255);
    if (saved && d.boss.cleared) this.spawnTrapdoor(...roomCenter(d.boss));
    if (saved) this.time.delayedCall(800, () => this.checkFusions());
    if (this.pendingLevelUps > 0) this.time.delayedCall(700, () => this.openLevelUp());
    this.saveProgress();
  }

  createPlayer() {
    const shadow = this.add.image(0, 0, 'shadow').setDepth(DEPTH.shadow);
    const sprite = this.add.image(0, 0, 'knight-a').setDepth(DEPTH.player).setOrigin(0.5, 0.85);
    const gun = this.add.image(0, 0, 'gun-pistol').setDepth(DEPTH.gun);
    const gun2 = this.add.image(0, 0, 'gun-pistol').setDepth(DEPTH.gun - 0.2).setVisible(false);
    this.player = { x: 0, y: 0, vx: 0, vy: 0, r: 5, aim: 0, iframes: 0, dashT: 0, dashCd: 0, dashX: 0, dashY: 0, trailT: 0, walkT: 0, sinceHit: 9, armorT: 0, skillT: 0, skillCd: 0, punch: 0, sprite, gun, gun2, shadow };
  }

  /** Props and the tutorial hint are placed once per floor; treasure appears when you first walk in. */
  populate(rng: Rng) {
    const d = this.dungeon;
    for (const r of d.rooms) {
      const [cx, cy] = roomCenter(r);
      if (r.type === 'start') {
        if (this.run.level === 0) {
          this.worldText(cx, cy - 40, 'WASD 移动  鼠标射击', E.grey);
          this.worldText(cx, cy - 26, '空格冲刺  Q换枪  E双持', E.grey);
        }
        continue;
      }
      for (const p of r.props) this.addObstacle(p.kind, p.x, p.y);
      for (const t of r.traps) {
        if (t.kind === 'spikes') {
          const sprites = t.tiles.map(([tx, ty]) => this.add.image(tx * T + T / 2, ty * T + T / 2, 'spikes-up').setDepth(DEPTH.shadow + 0.5).setVisible(false));
          const cx2 = t.tiles.reduce((a, [tx]) => a + tx * T + T / 2, 0) / t.tiles.length;
          const cy2 = t.tiles.reduce((a, [, ty]) => a + ty * T + T / 2, 0) / t.tiles.length;
          this.traps.push({ kind: 'spikes', room: r, tiles: t.tiles, cx: cx2, cy: cy2, period: t.period, phase: t.phase, t: 0, state: 'down', sprites, hit: new Map() });
        } else {
          const [[ax, ay], [bx, by]] = t.tiles;
          const u = t.phase;
          const s = { kind: 'saw' as const, room: r, ax: ax * T + T / 2, ay: ay * T + T / 2, bx: bx * T + T / 2, by: by * T + T / 2, u, dir: 1, spin: 0, x: 0, y: 0, hit: new Map(), sprite: this.add.image(0, 0, 'saw').setDepth(DEPTH.obstacle) };
          s.x = s.ax + (s.bx - s.ax) * u;
          s.y = s.ay + (s.by - s.ay) * u;
          s.sprite.setPosition(Math.round(s.x), Math.round(s.y)).setAlpha(0.55);
          this.traps.push(s);
        }
      }
    }
    void rng;
  }

  /** Traps run only while their room's fight is on; once it is cleared they settle and are safe to walk past. */
  updateTraps(dt: number) {
    const p = this.player;
    const scale = 1 + this.run.level * 0.5;
    for (const tr of this.traps) {
      const armed = this.active === tr.room;
      if (tr.kind === 'spikes') {
        let state: SpikeTrap['state'] = 'down';
        if (armed) {
          tr.t += dt;
          const c = ((tr.t / tr.period + tr.phase) % 1) * tr.period;
          const upFrom = tr.period - 0.9;
          state = c >= upFrom ? 'up' : c >= upFrom - 0.6 ? 'warn' : 'down';
        }
        if (state !== tr.state) {
          tr.state = state;
          for (const sp of tr.sprites) sp.setVisible(state !== 'down').setTexture(state === 'up' ? 'spikes-up' : 'spikes-warn');
          if (state === 'up' && dist2(p.x, p.y, tr.cx, tr.cy) < 150 * 150) audio.block();
        }
        if (state !== 'up') continue;
        for (const [tx, ty] of tr.tiles) {
          const x = tx * T + T / 2;
          const y = ty * T + T / 2;
          if (this.mode === 'play' && Math.abs(p.x - x) < 8 + p.r * 0.4 && Math.abs(p.y - y) < 8 + p.r * 0.4) this.hurtPlayer(1, x, y - 6);
          for (const e of this.enemies) {
            if (e.dead || e.kind === 'bat' || e.kind === 'guardian' || (e.boss?.air ?? 0) > 0) continue;
            if (Math.abs(e.x - x) > 8 || Math.abs(e.y - y) > 8 || (tr.hit.get(e) ?? 0) > this.time0) continue;
            tr.hit.set(e, this.time0 + 0.6);
            this.damageEnemy(e, 8 * scale, { src: '地刺', kx: e.x - x, ky: e.y - y, knock: 40, noCrit: true });
          }
        }
      } else {
        if (armed) {
          const len = Math.max(1, dist(tr.ax, tr.ay, tr.bx, tr.by));
          tr.u += (tr.dir * 62 * dt) / len;
          if (tr.u > 1) {
            tr.u = 2 - tr.u;
            tr.dir = -1;
          } else if (tr.u < 0) {
            tr.u = -tr.u;
            tr.dir = 1;
          }
          tr.spin += dt;
        }
        tr.x = tr.ax + (tr.bx - tr.ax) * tr.u;
        tr.y = tr.ay + (tr.by - tr.ay) * tr.u;
        // Spinning by flips keeps the pixels crisp; free rotation would smear them.
        const f = Math.floor(tr.spin * 24) % 4;
        tr.sprite.setPosition(Math.round(tr.x), Math.round(tr.y)).setFlip(f === 1 || f === 2, f >= 2).setAlpha(armed ? 1 : 0.55);
        if (!armed) continue;
        if (Math.random() < dt * 8) this.fx.sparks(tr.x, tr.y + 5, 1, 'gold');
        if (this.mode === 'play' && dist2(p.x, p.y - 3, tr.x, tr.y) < (7 + p.r * 0.7) ** 2) this.hurtPlayer(1, tr.x, tr.y);
        for (const e of this.enemies) {
          if (e.dead || e.kind === 'guardian' || (e.boss?.air ?? 0) > 0) continue;
          if (dist2(e.x, e.y - 3, tr.x, tr.y) > (7 + e.r) ** 2 || (tr.hit.get(e) ?? 0) > this.time0) continue;
          tr.hit.set(e, this.time0 + 0.5);
          this.damageEnemy(e, 10 * scale, { src: '锯片', kx: e.x - tr.x, ky: e.y - tr.y, knock: 120, noCrit: true });
        }
      }
    }
  }

  worldText(x: number, y: number, text: string, color: string = E.white) {
    const img = this.add.image(Math.round(x), Math.round(y), textTexture(this, text, { color, outline: E.ink })).setDepth(DEPTH.decal + 0.5);
    this.worldLabels.push(img);
    return img;
  }

  /** Stand the biome's pieces on their tiles; the ones that glow get a light. */
  dressLevel(kit: StyleKit, d: Dungeon) {
    const arts = decoArt(kit.id);
    for (const r of d.rooms) {
      for (const p of r.decor) {
        const x = p.x * T + T / 2;
        const y = p.y * T + T + 1;
        this.decor.push(this.add.image(x, y, K(`deco-${p.v}`, kit)).setOrigin(0.5, 1).setDepth(DEPTH.obstacle));
        const l = arts[p.v].light;
        if (l) this.light.addStatic(x + l.dx, y + l.dy, l.r, l.color);
      }
    }
  }

  /** Tall pieces cover the knight when it walks behind them. */
  sortDecor() {
    const py = this.player.y;
    for (const s of this.decor) s.setDepth(py < s.y - 8 ? DEPTH.player + 0.2 : DEPTH.obstacle);
  }

  addObstacle(kind: Obstacle['kind'], x: number, y: number) {
    const key = kind === 'pillar' ? K('pillar', this.kit) : kind;
    const sprite = this.add.image(Math.round(x), Math.round(y), key).setDepth(DEPTH.obstacle).setOrigin(0.5, 0.75);
    this.obstacles.push({ kind, x, y, r: kind === 'pillar' ? 8 : 6, hp: kind === 'pillar' ? 1e9 : kind === 'barrel' ? 10 : 14, sprite, dead: false });
  }

  // ---------------------------------------------------------------- rooms: walk in, gates shut, clear, gates open

  markSeen(r: DRoom) {
    for (const dir of DIRS) {
      if (!r.doors[dir]) continue;
      const n = this.dungeon.byId.get(`${r.gx + DIR_VEC[dir][0]},${r.gy + DIR_VEC[dir][1]}`);
      if (n) n.seen = true;
    }
  }

  updateRoomState() {
    const p = this.player;
    const d = this.dungeon;
    const here = roomAt(d, p.x, p.y, 1);
    if (here && here !== this.room) {
      this.room = here;
      if (here.cleared || here.type === 'start' || here.type === 'treasure') this.safeRoom = here;
      if (!here.visited) {
        here.visited = true;
        this.markSeen(here);
        if (here.type === 'treasure') {
          this.spawnPedestals(here);
          ui.toast('宝物房 三选一', 1200);
        }
      }
    }
    // Two tiles past the doorway of an uncleared fighting room, the gates slam shut.
    if (!this.active && here && !here.cleared && (here.type === 'combat' || here.type === 'horde' || here.type === 'boss') && roomAt(d, p.x, p.y, 2) === here) {
      this.activate(here);
    }
  }

  activate(r: DRoom) {
    this.active = r;
    this.waveIdx = 0;
    this.waveTimer = 0;
    this.hordeT = 0;
    this.closeGates(r);
    if (r.type === 'boss') {
      audio.setIntensity(2);
      audio.roar();
      this.spawnT = 6;
      const R = this.roomRect();
      this.telegraphs.push({
        kind: 'spawn',
        x: R.cx,
        y: R.y0 + 92,
        r: 40,
        t: 0,
        dur: 1.1,
        tier: 5,
        onDone: () => {
          if (this.active === r) this.boss = spawnBoss(this, this.run.level === LEVELS - 1 ? 'boar' : 'guardian');
        },
      });
    } else if (r.type === 'horde') {
      this.hordeDur = 20 + this.run.level * 4;
      this.spawnT = 0.6;
      this.swarmT = 7;
      audio.setIntensity(2);
      ui.toast(`尸潮来袭 坚持${this.hordeDur}秒`, 1600);
    } else {
      this.planWaves(new Rng(r.seed));
      this.spawnWave(0);
      audio.setIntensity(1);
    }
    if (this.traps.some((t) => t.room === r)) ui.toast('机关启动', 1000);
  }

  closeGates(r: DRoom) {
    const d = this.dungeon;
    for (const g of r.gates) {
      for (const [tx, ty] of g.tiles) d.blocked.add(ty * d.w + tx);
      const [mx, my] = g.tiles[1];
      const horiz = g.dir === 'up' || g.dir === 'down';
      // The far wall's gate stands behind whoever is in the room; the others in front.
      const depth = g.dir === 'up' ? DEPTH.decal + 0.8 : DEPTH.doors;
      const img = this.add.image(mx * T + T / 2, my * T + T / 2, horiz ? 'gate-h' : 'gate-v').setDepth(depth);
      img.setScale(1, 0.2);
      this.tweens.add({ targets: img, scaleY: 1, duration: 140, ease: 'Back.easeOut' });
      this.gates.push(img);
      this.fx.dust(img.x, img.y, 4);
    }
    // Anyone caught in a doorway is pushed into the room.
    const [cx, cy] = roomCenter(r);
    const p = this.player;
    if (solidAt(d, p.x, p.y)) {
      const a = Math.atan2(cy - p.y, cx - p.x);
      p.x += Math.cos(a) * 20;
      p.y += Math.sin(a) * 20;
    }
    audio.block();
    this.fx.shake(0.1);
  }

  openGates() {
    this.dungeon.blocked.clear();
    for (const g of this.gates) {
      this.fx.dust(g.x, g.y, 5);
      this.tweens.add({ targets: g, scaleY: 0, alpha: 0, duration: 200, onComplete: () => g.destroy() });
    }
    this.gates = [];
    audio.door();
  }

  enemyKinds(): EnemyKind[] {
    const depth = this.active?.depth ?? 0;
    return (Object.keys(ENEMIES) as EnemyKind[]).filter((k) => ENEMIES[k].minLevel <= this.run.level || depth >= 3);
  }

  /** Fewer, meaner enemies: a closer camera needs breathing room. */
  planWaves(rng: Rng) {
    const level = this.run.level;
    const depth = Math.min(this.active!.depth, 5);
    const budget = (6 + level * 4 + depth) * this.run.diff.enemies;
    const waveCount = depth >= 4 ? 3 : 2;
    const kinds = this.enemyKinds();
    let elites = rng.chance(0.12 + level * 0.1 + depth * 0.03) ? 1 : 0;
    this.waves = [];
    for (let w = 0; w < waveCount; w++) {
      let left = Math.round((budget * (0.85 + w * 0.2)) / waveCount);
      const wave: { kind: EnemyKind; elite: boolean }[] = [];
      while (left > 0) {
        const kind = rng.weighted(kinds, (q) => ENEMIES[q].weight);
        const elite = elites > 0 && w === waveCount - 1;
        if (elite) elites--;
        wave.push({ kind, elite });
        left -= ENEMIES[kind].cost + (elite ? 4 : 0);
      }
      this.waves.push(wave);
    }
  }

  spawnPoint(minDist = 80): [number, number] {
    const r = this.active ?? this.room ?? this.dungeon.start;
    for (let i = 0; i < 8; i++) {
      const [x, y] = randomFloorIn(this.dungeon, r, this.run.rng, this.player.x, this.player.y, minDist);
      if (!this.obstacles.some((o) => !o.dead && dist2(o.x, o.y, x, y) < (o.r + 10) ** 2)) return [x, y];
    }
    return randomFloorIn(this.dungeon, r, this.run.rng, this.player.x, this.player.y, minDist);
  }

  spawnWave(i: number) {
    for (const s of this.waves[i]) {
      const [x, y] = this.spawnPoint();
      this.queueSpawn(s.kind, x, y, s.elite);
    }
  }

  /** Summon an enemy: a warning on the floor whose look (and length) depends on how strong it is. */
  queueSpawn(kind: EnemyKind, x: number, y: number, elite = false, mini = false, delay = 0.7) {
    if (solidAt(this.dungeon, x, y)) [x, y] = openSpot(this.dungeon, x, y);
    this.pendingSpawns++;
    const tier = elite ? 4 : SPAWN_TIER[kind];
    this.telegraphs.push({
      kind: 'spawn',
      x,
      y,
      r: tier >= 4 ? 14 : tier === 3 ? 11 : tier === 2 ? 10 : 8,
      t: 0,
      dur: delay * [0.9, 1.05, 1.3, 1.6][tier - 1],
      tier,
      onDone: () => {
        this.pendingSpawns--;
        if (this.mode === 'dead' || this.mode === 'end' || !this.active) return;
        const e = this.spawnEnemy(kind, x, y, elite, mini);
        this.arrive(e, tier);
      },
    });
  }

  /** The moment a summoned enemy appears. */
  arrive(e: Enemy, tier: number) {
    const danger = this.kit.palette.danger;
    if (tier === 1) {
      e.enter = { kind: 'rise', t: 0 };
      this.fx.dust(e.x, e.y, 3);
    } else if (tier === 2) {
      e.enter = { kind: 'drop', t: 0 };
    } else {
      e.enter = { kind: 'emerge', t: 0 };
      this.fx.ring(e.x, e.y - 4, tier >= 4 ? 46 : 30, danger, 360, 2);
      this.fx.burst(e.x, e.y - 4, tier >= 4 ? 14 : 8);
      this.fx.shake(tier >= 4 ? 0.2 : 0.08);
      this.light.flash(e.x, e.y - 4, tier >= 4 ? 90 : 60, danger, 0.3);
      if (tier >= 4) this.fx.flash(danger, 0.12, 200);
    }
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number, elite = false, mini = false): Enemy {
    const def = ENEMIES[kind];
    const { level, rng } = this.run;
    const depth = this.active?.depth ?? 0;
    const scaleHp = (1 + level * 0.65 + depth * 0.08) * (mini ? 0.5 : 1) * this.run.diff.hp;
    const affix: Affix | undefined = elite ? rng.pick(Object.keys(AFFIXES) as Affix[]) : undefined;
    const hp = def.hp * scaleHp * (elite ? 5 : 1) * (affix === 'tough' ? 1.4 : 1);
    const size = elite ? 1.6 : mini ? 0.8 : 1;
    const sprite = this.add.image(Math.round(x), Math.round(y), K(`en-${kind}-a`, this.kit)).setDepth(DEPTH.enemy).setOrigin(0.5, 0.8).setScale(size);
    const shadow = this.add.image(x, y, 'shadow').setDepth(DEPTH.shadow).setScale(size * 0.8);
    const e: Enemy = {
      id: this.nextId++,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      r: def.r * size,
      hp,
      maxHp: hp,
      speed: def.speed * (affix === 'swift' ? 1.4 : 1) * (mini ? 1.2 : 1) * (1 + level * 0.06),
      contact: def.contact,
      xp: def.xp * (elite ? 6 : 1),
      elite,
      affix,
      state: 'idle',
      t: rng.range(0, 1),
      t2: 0,
      anim: rng.range(0, 1),
      facing: Math.atan2(this.player.y - y, this.player.x - x),
      flash: 0,
      dead: false,
      scale: size,
      status: { burn: 0, burnDps: 0, burnTick: 0, chill: 0, chillStacks: 0, frozen: 0, shock: 0 },
      sprite,
      shadow,
      mini,
    };
    if (kind === 'shield') e.extra = this.add.image(x, y, K('shield', this.kit)).setDepth(DEPTH.enemy + 0.1);
    if (elite) {
      e.ring = this.add.image(x, y, 'glow').setDepth(DEPTH.shadow).setTint(hexToNum(this.kit.palette.danger)).setScale(e.r / 6).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
      this.fx.callout(x, y - 22, AFFIXES[affix!], this.kit.palette.danger);
    }
    this.enemies.push(e);
    return e;
  }

  destroyEnemy(e: Enemy) {
    e.sprite.destroy();
    e.shadow.destroy();
    e.extra?.destroy();
    e.ring?.destroy();
  }

  updateRoom(dt: number) {
    const r = this.active;
    if (!r || this.mode !== 'play') return;
    const alive = this.enemies.filter((e) => !e.dead && !e.boss).length;
    switch (r.type) {
      case 'combat': {
        this.waveTimer += dt;
        const waveSize = this.waves[this.waveIdx]?.length ?? 1;
        if (this.waveIdx < this.waves.length - 1 && (alive + this.pendingSpawns <= Math.floor(waveSize * 0.25) || this.waveTimer > 10)) {
          this.waveIdx++;
          this.waveTimer = 0;
          this.spawnWave(this.waveIdx);
        } else if (this.waveIdx === this.waves.length - 1 && alive === 0 && this.pendingSpawns === 0) this.onRoomCleared();
        break;
      }
      case 'horde': {
        this.hordeT += dt;
        const k = Math.min(1, this.hordeT / this.hordeDur);
        if (this.hordeT < this.hordeDur) {
          this.spawnT -= dt;
          if (this.spawnT <= 0 && alive + this.pendingSpawns < (14 + this.run.level * 5) * this.run.diff.enemies) {
            this.spawnT = lerp(1.5, 0.85, k) / (1 + this.run.level * 0.12) / this.run.diff.enemies;
            const [x, y] = this.spawnPoint(110);
            const n = 1 + Math.floor(k * 1.5);
            for (let i = 0; i < n; i++) {
              const kind = this.run.rng.weighted(this.enemyKinds(), (q) => ENEMIES[q].weight);
              this.queueSpawn(kind, x + rand(-12, 12), y + rand(-12, 12), false, false, 0.5);
            }
          }
          this.swarmT -= dt;
          if (this.swarmT <= 0) {
            this.swarmT = 10;
            this.swarm();
          }
        } else if (alive === 0 && this.pendingSpawns === 0) this.onRoomCleared();
        break;
      }
      case 'boss': {
        this.spawnT -= dt;
        if (this.boss && !this.boss.dead && this.spawnT <= 0 && alive < 5) {
          this.spawnT = 5;
          const [x, y] = this.spawnPoint(110);
          for (let i = 0; i < 2; i++) this.queueSpawn(this.run.rng.pick(['wanderer', 'bat'] as EnemyKind[]), x + rand(-10, 10), y + rand(-10, 10), false, false, 0.5);
        }
        break;
      }
    }
  }

  /** Vampire Survivors moments in the horde room: a bat stream from one side, or a ring of slimes closing in. */
  swarm() {
    const run = this.run;
    const r = this.active!;
    const p = this.player;
    if (run.rng.chance(0.5)) {
      const fromLeft = p.x > roomCenter(r)[0];
      const x = (fromLeft ? r.x0 + 1.5 : r.x1 - 1.5) * T;
      const n = 4 + run.level * 2;
      for (let i = 0; i < n; i++) {
        const y = clamp(p.y + rand(-50, 50), (r.y0 + 1.5) * T, (r.y1 - 1.5) * T);
        if (solidAt(this.dungeon, x, y)) continue;
        const e = this.spawnEnemy('bat', x, y);
        e.state = 'swarm';
        e.facing = fromLeft ? 0 : Math.PI;
      }
      ui.toast('蝙蝠群', 800);
    } else {
      const n = 6 + run.level * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const x = p.x + Math.cos(a) * 84;
        const y = p.y + Math.sin(a) * 64;
        if (!solidAt(this.dungeon, x, y) && roomAt(this.dungeon, x, y, 0) === r) this.queueSpawn('wanderer', x, y);
      }
      ui.toast('包围', 800);
    }
  }

  /** Gates open and a reward may drop. A boss leaves the trapdoor (or the final bloom). */
  onRoomCleared(bossDown = false) {
    const r = this.active;
    if (!r || r.cleared) return;
    r.cleared = true;
    this.active = undefined;
    this.pendingSpawns = 0;
    this.telegraphs = this.telegraphs.filter((t) => t.kind !== 'spawn');
    audio.setIntensity(0);
    this.pickups.forEach((p) => p.kind === 'gem' && (p.magnet = true));
    if (this.run.pets.includes('dove')) this.heal(1, this.player.x, this.player.y);
    this.openGates();
    this.safeRoom = r;
    this.saveProgress();
    const [cx, cy] = roomCenter(r);
    if (bossDown) {
      this.time.delayedCall(1600, () => this.spawnTrapdoor(cx, cy));
      return;
    }
    ui.toast('房间清空', 900);
    if (r.type === 'horde') {
      this.dropChest(cx - 14, cy);
      this.dropChest(cx + 14, cy, true);
    } else {
      // Weapon chests are common, so a run gets to try many of the twelve guns.
      const x = this.run.rng.next();
      if (x < 0.3) this.dropChest(cx, cy, true);
      else if (x < 0.45) this.dropChest(cx, cy);
      else if (x < 0.65) this.dropHeart(cx, cy);
    }
  }

  // ---------------------------------------------------------------- update

  update(_t: number, dms: number) {
    const realDt = Math.min(dms, 50) / 1000;
    this.fx.update(realDt);
    if (!this.kit || !this.player) return;
    const ptr = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
    this.aimX = wp.x;
    this.aimY = wp.y;
    this.drawCursor();
    if (this.mode === 'title' || this.mode === 'pause' || this.mode === 'choose' || this.mode === 'end') {
      this.light.update(this, 0);
      this.hudTick(realDt);
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      return;
    }
    if (this.slowT > 0) {
      this.slowT -= realDt;
      if (this.slowT <= 0) this.slowScale = 1;
    }
    const dt = realDt * this.slowScale;
    this.time0 += dt;
    if (this.mode === 'play') this.run.elapsed += realDt;
    if (this.mode === 'play') {
      this.updatePlayer(dt);
      this.updateWeapons(dt);
      updateSpells(this, dt);
      this.updateRoomState();
    }
    this.updateProjectiles(dt);
    this.flow.update(this.player.x, this.player.y);
    this.updateEnemies(dt);
    updatePets(this, dt);
    this.updatePickups(dt);
    this.updateHazards(dt);
    this.updateTraps(dt);
    this.updateTelegraphs(dt);
    if (this.mode === 'play') this.updateRoom(dt);
    this.comboT -= dt;
    if (this.comboT <= 0 && this.combo > 0) this.combo = 0;
    if (this.comboT < -2) this.run.frenzyStacks = Math.max(0, this.run.frenzyStacks - dt * 4);
    this.gemT -= dt;
    if (this.gemT <= 0) this.gemStreak = 0;
    this.updateCamera(realDt);
    this.drawWorld(dt);
    this.light.update(this, dt);
    this.hudTick(realDt);
  }

  /** Follow the player, lean toward the cursor, and take a small kick on every shot. */
  updateCamera(dt: number) {
    const cam = this.cameras.main;
    const p = this.player;
    const ptr = this.input.activePointer;
    let nx = 0;
    let ny = 0;
    if (this.pointerMoved && this.mode === 'play' && settings.get().lean) {
      nx = clamp((ptr.x - cam.width / 2) / (cam.width / 2), -1, 1);
      ny = clamp((ptr.y - cam.height / 2) / (cam.height / 2), -1, 1);
    }
    const f = 1 - Math.exp(-dt * 7);
    this.camX += (p.x + nx * LEAN_X - this.camX) * f;
    this.camY += (p.y - 6 + ny * LEAN_Y - this.camY) * f;
    const kd = Math.exp(-dt * 24);
    this.kickX *= kd;
    this.kickY *= kd;
    cam.centerOn(this.camX + this.kickX, this.camY + this.kickY);
  }

  /** Push the view against the shot direction, like recoil. */
  kick(a: number, amount: number) {
    if (!settings.get().shake) return;
    this.kickX -= Math.cos(a) * amount;
    this.kickY -= Math.sin(a) * amount;
  }

  hudTick(dt: number) {
    if (!this.run || !this.dungeon) return;
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 1 / 20;
    const run = this.run;
    const p = this.player;
    const b = this.boss && !this.boss.dead ? this.boss : undefined;
    const held = run.weapons[run.held];
    ui.updateHud({
      hp: run.hp,
      maxHp: run.mods.maxHp,
      armor: run.armor,
      maxArmor: run.mods.maxArmor,
      xp: run.xp,
      xpNext: run.xpNext,
      xpLevel: run.xpLevel,
      guns: run.weapons.map((w, i) => {
        const mag = magSize(w, run.mods.mag);
        const rt = reloadTime(w, run.mods.reload);
        return { id: w.def.id, name: w.def.name, level: w.level, held: i === run.held, kind: w.def.kind, mag: mag || undefined, ammo: w.ammo, reload: (w.reloadT ?? 0) > 0 && rt > 0 ? 1 - w.reloadT! / rt : undefined };
      }),
      skill: p.skillT > 0 ? 1 : 1 - clamp(p.skillCd / 14, 0, 1),
      skillActive: p.skillT > 0,
      spells: run.spells.map((s) => ({ id: s.id, level: s.level, evolved: s.evolved, fused: !!SPELLS[s.id].fusion })),
      pets: run.pets,
      level: run.level,
      styleName: this.kit.name,
      timer: this.active?.type === 'horde' ? Math.max(0, this.hordeDur - this.hordeT) : 0,
      kills: run.kills,
      combo: this.combo,
      map: this.dungeon.rooms.map((r) => ({ gx: r.gx, gy: r.gy, type: r.type, visited: r.visited, seen: r.seen, cleared: r.cleared, current: r === this.room, doors: r.doors })),
      boss: b ? { name: b.boss!.name, ratio: Math.max(0, b.hp / b.maxHp), phaseMark: b.kind === 'boar' ? 0.5 : 0.55 } : undefined,
    });
  }

  stop(sec: number) {
    this.hitstop = Math.max(this.hitstop, sec);
  }

  slow(scale: number, sec: number) {
    this.slowScale = scale;
    this.slowT = sec;
  }

  pointer() {
    return { x: this.aimX, y: this.aimY };
  }

  blocked(x: number, y: number) {
    return solidAt(this.dungeon, x, y);
  }

  /** The room the fight is in, in world pixels. */
  roomRect() {
    const r = this.active ?? this.room ?? this.dungeon.start;
    return { x0: r.x0 * T, y0: r.y0 * T, x1: r.x1 * T, y1: r.y1 * T, cx: ((r.x0 + r.x1) / 2) * T, cy: ((r.y0 + r.y1) / 2) * T };
  }

  // ---------------------------------------------------------------- player

  updatePlayer(dt: number) {
    const p = this.player;
    const k = this.keys;
    let ix = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let iy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    const il = Math.hypot(ix, iy);
    if (il > 0) {
      ix /= il;
      iy /= il;
    }
    p.aim = Math.atan2(this.aimY - (p.y - 4), this.aimX - p.x);
    p.dashCd -= dt;
    p.iframes -= dt;
    p.sinceHit += dt;
    p.skillCd -= dt;
    if (p.skillT > 0) p.skillT -= dt;
    if (p.sinceHit > 2.2 && this.run.armor < this.run.mods.maxArmor) {
      p.armorT -= dt;
      if (p.armorT <= 0) {
        p.armorT = 0.9;
        this.run.armor++;
      }
    }
    if ((Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(k.SHIFT)) && p.dashCd <= 0) {
      p.dashX = il > 0 ? ix : Math.cos(p.aim);
      p.dashY = il > 0 ? iy : Math.sin(p.aim);
      p.dashT = 0.16;
      p.iframes = Math.max(p.iframes, 0.22);
      p.dashCd = 0.9 * this.run.mods.dashCooldown;
      audio.dash();
      this.fx.dust(p.x, p.y, 6);
    }
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dashX * 300;
      p.vy = p.dashY * 300;
      p.trailT -= dt;
      if (p.trailT <= 0) {
        p.trailT = 0.025;
        const ghost = this.add.image(Math.round(p.x), Math.round(p.y), p.sprite.texture.key).setOrigin(0.5, 0.85).setFlipX(p.sprite.flipX).setDepth(DEPTH.player - 1).setAlpha(0.6);
        ghost.setTintFill(hexToNum(E.cyan));
        this.tweens.add({ targets: ghost, alpha: 0, duration: 200, onComplete: () => ghost.destroy() });
      }
    } else {
      const speed = 86 * this.run.mods.moveSpeed;
      const f = Math.min(1, dt * 18);
      p.vx += (ix * speed - p.vx) * f;
      p.vy += (iy * speed - p.vy) * f;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    for (const o of this.obstacles) {
      if (o.dead) continue;
      const d = dist(p.x, p.y, o.x, o.y);
      const min = o.r + p.r;
      if (d < min && d > 0.01) {
        p.x = o.x + ((p.x - o.x) / d) * min;
        p.y = o.y + ((p.y - o.y) / d) * min;
      }
    }
    [p.x, p.y] = collide(this.dungeon, p.x, p.y, p.r);
    const moving = Math.hypot(p.vx, p.vy) > 20;
    if (moving) p.walkT += dt;
    p.sprite.setTexture(moving && Math.floor(p.walkT * 8) % 2 ? 'knight-b' : 'knight-a');
  }

  switchGun() {
    const run = this.run;
    if (this.mode !== 'play' || !run || run.weapons.length < 2) return;
    run.held = (run.held + 1) % run.weapons.length;
    this.swapT = 0.2;
    audio.swap();
  }

  useSkill() {
    const p = this.player;
    if (this.mode !== 'play' || !p || p.skillCd > 0) return;
    p.skillT = 4;
    p.skillCd = 14;
    audio.levelUp();
    this.fx.ring(p.x, p.y - 4, 34, E.cyan, 300);
    this.fx.callout(p.x, p.y - 28, '双持！', E.cyan);
  }

  fireRateMult() {
    const m = this.run.mods;
    const skill = this.player.skillT > 0 ? (this.run.weapons.length > 1 ? 1.3 : 1.8) : 1;
    return Math.max(0.2, m.fireRate * skill * (1 + Math.min(0.4, this.run.frenzyStacks * m.frenzy)));
  }

  /**
   * Guns with a magazine reload when empty (or on R); energy and melee weapons never do.
   * A holstered gun keeps reloading in the background, so swapping is a way to skip the wait.
   */
  updateWeapons(dt: number) {
    const run = this.run;
    const firing = this.input.activePointer.leftButtonDown() || this.autoFire;
    const rate = this.fireRateMult();
    const dual = this.player.skillT > 0 && run.weapons.length > 1;
    run.weapons.forEach((w, i) => {
      const mag = magSize(w, run.mods.mag);
      if (mag && w.ammo === undefined) w.ammo = mag;
      if ((w.reloadT ?? 0) > 0) {
        w.reloadT! -= dt;
        if (w.reloadT! <= 0) {
          w.reloadT = 0;
          w.ammo = mag;
          if (i === run.held) {
            audio.reload(true);
            this.reloadDone();
          }
        }
      }
      const active = i === run.held || dual;
      w.cd -= dt * rate;
      if (active && firing && w.cd <= 0 && !(w.reloadT! > 0)) {
        if (mag && (w.ammo ?? 0) <= 0) this.startReload(w);
        else {
          this.fire(w, i !== run.held);
          w.cd += w.def.cooldown;
          if (w.cd < 0) w.cd = 0;
          if (mag) {
            w.ammo = (w.ammo ?? mag) - 1;
            if (w.ammo <= 0) this.startReload(w);
          }
        }
      } else if (w.cd < 0) w.cd = 0;
    });
  }

  startReload(w: WeaponInstance | undefined) {
    if (!w?.def.mag || (w.reloadT ?? 0) > 0) return;
    if ((w.ammo ?? 0) >= magSize(w, this.run.mods.mag)) return;
    w.reloadT = reloadTime(w, this.run.mods.reload);
    audio.reload(false);
  }

  damageMult() {
    const m = this.run.mods;
    let d = m.damage;
    if (this.run.hp <= this.run.mods.maxHp / 2) d *= 1 + m.desperate;
    return d;
  }

  muzzle(off = false): [number, number] {
    const p = this.player;
    const g = off ? p.gun2 : p.gun;
    const len = g.width * (1 - g.originX) - 1;
    return [g.x + Math.cos(p.aim) * len, g.y + Math.sin(p.aim) * len];
  }

  fire(w: WeaponInstance, offhand = false) {
    const p = this.player;
    const m = this.run.mods;
    const def = w.def;
    const extra = m.count + weaponLevelCount(w.level);
    const count = def.count + extra;
    const dmg = def.damage * weaponLevelDamage(w.level) * this.damageMult();
    const area = m.area;
    const pierce = def.pierce + m.pierce;
    const speed = def.speed * m.speed;
    const range = def.range * m.range;
    const knock = def.knockback * m.knockback;
    const a = p.aim + rand(-0.03, 0.03) + (def.jitter ? rand(-def.jitter, def.jitter) : 0);
    let [ox, oy] = this.muzzle(offhand);
    // A muzzle poking into a wall would fire from inside it.
    if (solidAt(this.dungeon, ox, oy)) [ox, oy] = [p.x, p.y - 4];
    switch (def.kind) {
      case 'bolt':
        for (let i = 0; i < count; i++) {
          const aa = a + (i - (count - 1) / 2) * 0.09;
          const pr = this.spawnProj('bolt', ox, oy, aa, speed, range / speed, def.size * area, dmg, pierce, knock, def.name, def.proj);
          if (def.element) pr.element = def.element;
          if (def.tracer) {
            const len = raycast(this.dungeon, ox, oy, Math.cos(aa), Math.sin(aa), range).len;
            this.visuals.push({ kind: 'beam', pts: [ox, oy, ox + Math.cos(aa) * len, oy + Math.sin(aa) * len], width: 1, t: 0, dur: 0.08, color: hexToNum(E.yellow) });
          }
        }
        this.recoil(a, def.id === 'sniper' ? 80 : 12);
        break;
      case 'spread': {
        const n = def.count + extra * 2;
        const cone = ((def.spreadDeg * Math.PI) / 180) * (1 + extra * 0.08);
        for (let i = 0; i < n; i++) {
          const sp = speed * rand(0.85, 1.12);
          this.spawnProj('pellet', ox, oy, a + rand(-cone / 2, cone / 2), sp, (range / sp) * rand(0.8, 1), def.size * area, dmg, pierce, knock, def.name);
        }
        this.recoil(a, 60);
        break;
      }
      case 'beam':
        for (let i = 0; i < count; i++) this.castBeam(ox, oy, a + (i - (count - 1) / 2) * 0.17, range, def.size * area, dmg, pierce, knock, def.name);
        this.recoil(a, 30);
        break;
      case 'mortar': {
        let tx = this.aimX;
        let ty = this.aimY;
        const d = dist(p.x, p.y, tx, ty);
        if (d > range) {
          tx = p.x + ((tx - p.x) / d) * range;
          ty = p.y + ((ty - p.y) / d) * range;
        }
        for (let i = 0; i < count; i++) {
          let [x, y] = [tx + (i ? rand(-24, 24) : 0), ty + (i ? rand(-24, 24) : 0)];
          if (solidAt(this.dungeon, x, y)) [x, y] = collide(this.dungeon, x, y, 6);
          this.spawnShell(ox, oy, x, y, Math.max(0.28, 0.5 / m.speed), def.size * area, dmg, pierce, knock);
        }
        this.recoil(a, 30);
        break;
      }
      case 'rocket':
        for (let i = 0; i < count; i++) {
          const pr = this.spawnProj('rocket', ox, oy, a + (i - (count - 1) / 2) * 0.14, speed, range / speed, 4, dmg, pierce, knock, def.name, def.proj);
          pr.blast = def.size * area;
        }
        this.recoil(a, 90);
        break;
      case 'boomerang':
        for (let i = 0; i < count; i++) {
          const sp = speed * (1 + 0.15 * pierce);
          const pr = this.spawnProj('blade', ox, oy, a + (i - (count - 1) / 2) * 0.38, sp, 99, def.size * area * (1 + 0.15 * pierce), dmg, 999, knock, def.name);
          pr.dist = 0;
          pr.maxDist = range;
        }
        break;
      case 'chain':
        this.castChain(ox, oy, a, range, def.size * area, dmg, count, pierce, def.name);
        break;
      case 'flame': {
        const cone = (def.spreadDeg * Math.PI) / 180;
        for (let i = 0; i < count + extra; i++) {
          const sp = speed * rand(0.8, 1.15);
          const pr = this.spawnProj('flame', ox, oy, a + rand(-cone / 2, cone / 2), sp, (range / sp) * rand(0.7, 1), def.size * area, dmg, 999, knock, def.name);
          pr.element = 'fire';
        }
        break;
      }
      case 'slash':
        this.slash(p.x, p.y - 4, a, def.range * area, ((def.spreadDeg * Math.PI) / 180) * 0.5, dmg, knock, count, pierce, def.name);
        break;
    }
    if (def.kind !== 'slash' && def.kind !== 'flame') {
      this.fx.muzzle(ox, oy, a);
      this.light.flash(ox, oy, 26 + (def.shake ?? 0) * 200, E.yellow, 0.07);
    } else if (def.kind === 'slash') this.light.flash(p.x + Math.cos(a) * 14, p.y - 4 + Math.sin(a) * 14, 40, E.cyan, 0.1);
    const shake = def.shake ?? 0.01;
    this.kick(a, 0.6 + shake * 30);
    if (shake >= 0.05) this.fx.shake(shake);
    audio.shoot(def.kind);
  }

  /** The knight's sword: an arc that hits everything in front and cuts enemy bullets out of the air. */
  slash(x: number, y: number, a: number, r: number, half: number, dmg: number, knock: number, count: number, waves: number, src: string) {
    this.player.punch = 1;
    const n = Math.min(3, count);
    for (let k = 0; k < n; k++) {
      const aa = a + (k - (n - 1) / 2) * 0.5;
      this.visuals.push({ kind: 'slash', pts: [x, y, aa, r, half], width: 3, t: 0, dur: 0.14, color: hexToNum(E.cyan) });
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (dist(x, y, e.x, e.y - 3) > r + e.r) continue;
        if (Math.abs(angleDiff(aa, Math.atan2(e.y - 3 - y, e.x - x))) > half + 0.25) continue;
        this.damageEnemy(e, dmg, { src, kx: e.x - x, ky: e.y - y, knock, ignoreShield: true });
      }
      for (const b of this.eproj) {
        if (b.dead || dist(x, y, b.x, b.y) > r + 6) continue;
        if (Math.abs(angleDiff(aa, Math.atan2(b.y - y, b.x - x))) > half + 0.25) continue;
        this.fx.sparks(b.x, b.y, 4, 'gold');
        this.killProj(b, true);
      }
      for (const o of this.obstacles) if (!o.dead && o.kind !== 'pillar' && dist(x, y, o.x, o.y) < r + o.r) this.damageObstacle(o, dmg);
      // Pierce upgrades turn the swing into a flying sword wave.
      if (waves > 0) {
        const pr = this.spawnProj('bolt', x + Math.cos(aa) * 10, y + Math.sin(aa) * 10, aa, 230, 0.55, 3, dmg * 0.6, waves + 2, knock * 0.4, src, 'b-wave');
        pr.r = 7;
      }
    }
  }

  recoil(a: number, amount: number) {
    this.player.vx -= Math.cos(a) * amount;
    this.player.vy -= Math.sin(a) * amount;
    this.player.punch = 1;
  }

  // ---------------------------------------------------------------- projectiles

  spawnProj(kind: ProjKind, x: number, y: number, a: number, speed: number, life: number, r: number, dmg: number, pierce: number, knock: number, src: string, tex?: string): Proj {
    const enemy = kind === 'ebullet' || kind === 'ebig';
    const tkey: Record<ProjKind, string> = { bolt: 'b-bolt', pellet: 'b-pellet', blade: 'b-blade', shell: 'b-shell', shard: 'b-shard', orb: 'b-orb', axe: 'b-axe', rocket: 'b-rocket', flame: 'b-flame', ebullet: K('ebullet', this.kit), ebig: K('ebullet-big', this.kit) };
    const sprite = this.add.image(x, y, tex ?? tkey[kind]).setDepth(enemy ? DEPTH.ebullet : DEPTH.proj).setRotation(kind === 'bolt' || kind === 'rocket' ? a : 0);
    const base: Record<ProjKind, number> = { bolt: 3, pellet: 2.5, blade: 5, shell: 3, shard: 2, orb: 3, axe: 4, rocket: 4, flame: 4, ebullet: 3, ebig: 5 };
    sprite.setScale(Math.max(0.6, r / base[kind]));
    if (kind === 'flame') sprite.setScale(0.6).setRotation(rand(0, TAU));
    // Player shots sweep from the body centre, so point-blank enemies still get hit.
    const [px, py] = enemy ? [x, y] : [this.player.x, this.player.y - 4];
    const p: Proj = { kind, x, y, px, py, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r, dmg, pierce, life, life0: life, knock, src, sprite, hit: new Set(), dead: false };
    (enemy ? this.eproj : this.pproj).push(p);
    return p;
  }

  spawnEnemyBullet(x: number, y: number, a: number, speed: number, big = false) {
    return this.spawnProj(big ? 'ebig' : 'ebullet', x, y, a, speed, 7, big ? 5 : 3, 1, 0, 0, 'enemy');
  }

  spawnShell(x: number, y: number, tx: number, ty: number, flight: number, blast: number, dmg: number, embers: number, knock: number) {
    const p = this.spawnProj('shell', x, y, 0, 0, 99, 3, dmg, 0, knock, '榴弹炮');
    Object.assign(p, { ox: x, oy: y, tx, ty, t: 0, flight, blast, embers });
    p.shadow = this.add.image(x, y, 'shadow').setDepth(DEPTH.shadow).setScale(0.5);
    this.telegraphs.push({ kind: 'circle', x: tx, y: ty, r: blast, t: 0, dur: flight });
  }

  killProj(p: Proj, silent = false) {
    if (p.dead) return;
    p.dead = true;
    p.sprite.destroy();
    p.shadow?.destroy();
    if (!silent && (p.kind === 'bolt' || p.kind === 'pellet' || p.kind === 'orb')) this.fx.sparks(p.x, p.y, 3, 'gold');
  }

  /** Rockets blow up on whatever stops them. */
  private detonate(p: Proj, x = p.x, y = p.y) {
    this.explode(x, y, p.blast ?? 24, p.dmg, { src: p.src, knock: p.knock });
    this.killProj(p, true);
  }

  updateProjectiles(dt: number) {
    const pl = this.player;
    const d = this.dungeon;
    for (const p of this.pproj) {
      if (p.dead) continue;
      if (p.kind === 'shell') {
        this.updateShell(p, dt);
        continue;
      }
      if (p.kind === 'blade') {
        const sp = Math.hypot(p.vx, p.vy);
        p.dist! += sp * dt;
        if (!p.returning && p.dist! >= p.maxDist!) {
          p.returning = true;
          p.hit.clear();
        }
        if (p.returning) {
          const a = Math.atan2(pl.y - p.y, pl.x - p.x);
          p.vx = Math.cos(a) * sp;
          p.vy = Math.sin(a) * sp;
          if (dist2(p.x, p.y, pl.x, pl.y) < 100) {
            this.killProj(p, true);
            continue;
          }
        }
        p.sprite.rotation += dt * 22;
      } else if (p.homing) {
        let best: Enemy | undefined;
        let bd = 200 * 200;
        for (const e of this.enemies) {
          if (e.dead || p.hit.has(e)) continue;
          const dd = dist2(p.x, p.y, e.x, e.y);
          if (dd < bd) {
            bd = dd;
            best = e;
          }
        }
        if (best) {
          const sp = Math.hypot(p.vx, p.vy);
          const cur = Math.atan2(p.vy, p.vx);
          const want = Math.atan2(best.y - p.y, best.x - p.x);
          const na = cur + clamp(angleDiff(cur, want), -p.homing * dt, p.homing * dt);
          p.vx = Math.cos(na) * sp;
          p.vy = Math.sin(na) * sp;
          if (p.kind === 'bolt') p.sprite.setRotation(na);
        }
      } else if (p.kind === 'axe') {
        p.vy += (p.gravity ?? 0) * dt;
        p.sprite.rotation += dt * (p.spin ?? 14);
      } else if (p.kind === 'flame') {
        // Hot and small at the nozzle, then a wider, redder lick that fades out.
        const k = 1 - p.life / (p.life0 || 1);
        p.sprite.setScale(0.6 + k * 1.5).setAlpha(k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.45));
        if (k > 0.6) p.sprite.setTint(0xf04020);
        else if (k > 0.3) p.sprite.setTint(0xff9a30);
      } else if (p.kind === 'rocket') {
        if (Math.random() < 0.7) this.fx.dust(p.x - p.vx * 0.03, p.y - p.vy * 0.03, 1);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        if (p.kind === 'rocket') this.detonate(p);
        else this.killProj(p, p.kind === 'flame' || p.kind === 'axe');
        continue;
      }
      // Walls stop shots. Blades bounce back; axes are lobbed over everything.
      if (p.kind !== 'axe' && solidAt(d, p.x, p.y)) {
        if (p.kind === 'blade') {
          p.x -= p.vx * dt;
          p.y -= p.vy * dt;
          if (!p.returning) {
            p.returning = true;
            p.hit.clear();
          }
        } else if (p.kind === 'rocket') {
          this.detonate(p, p.x - p.vx * dt, p.y - p.vy * dt);
          continue;
        } else {
          if (p.kind !== 'flame') this.fx.sparks(p.x - p.vx * dt, p.y - p.vy * dt, 2, 'gold');
          this.killProj(p, true);
          continue;
        }
      }
      if (p.kind === 'bolt' || p.kind === 'pellet' || p.kind === 'shard' || p.kind === 'orb' || p.kind === 'rocket') {
        const o = this.obstacles.find((q) => !q.dead && dist2(p.x, p.y, q.x, q.y) < (q.r + p.r) ** 2);
        if (o) {
          if (p.kind === 'rocket') {
            this.detonate(p);
            continue;
          }
          if (o.kind !== 'pillar') this.damageObstacle(o, p.dmg);
          this.killProj(p);
          continue;
        }
      }
      for (const e of this.enemies) {
        if (e.dead || p.hit.has(e)) continue;
        if (!segCircle(p.px ?? p.x, p.py ?? p.y, p.x, p.y, e.x, e.y - 3, e.r + p.r)) continue;
        const inA = Math.atan2(-p.vy, -p.vx);
        if (e.kind === 'shield' && Math.abs(angleDiff(e.facing, inA)) < 1.0 && e.status.frozen <= 0 && p.kind !== 'axe' && p.kind !== 'flame') {
          this.fx.sparks(p.x, p.y, 4, 'white');
          audio.block();
          if (p.kind === 'blade') {
            p.hit.add(e);
            continue;
          }
          if (p.kind === 'rocket') this.detonate(p);
          else this.killProj(p, true);
          break;
        }
        if (p.kind === 'rocket') {
          this.detonate(p);
          break;
        }
        const sp = Math.hypot(p.vx, p.vy) || 1;
        this.damageEnemy(e, p.dmg, { src: p.src, kx: p.vx / sp, ky: p.vy / sp, knock: p.knock, element: p.element, quiet: p.kind === 'flame' });
        p.hit.add(e);
        if (p.kind === 'blade' || p.kind === 'axe' || p.kind === 'flame') continue;
        if (p.pierce > 0) {
          p.pierce--;
          continue;
        }
        this.killProj(p);
        break;
      }
      p.px = p.x;
      p.py = p.y;
      if (!p.dead) p.sprite.setPosition(Math.round(p.x), Math.round(p.y));
    }
    this.pproj = this.pproj.filter((p) => !p.dead);

    for (const p of this.eproj) {
      if (p.dead) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || solidAt(d, p.x, p.y)) {
        if (p.life > 0) this.fx.sparks(p.x - p.vx * dt, p.y - p.vy * dt, 2, 'white');
        this.killProj(p, true);
        continue;
      }
      if (this.obstacles.some((o) => !o.dead && o.kind === 'pillar' && dist2(p.x, p.y, o.x, o.y) < (o.r + p.r) ** 2)) {
        this.fx.sparks(p.x, p.y, 3, 'white');
        this.killProj(p, true);
        continue;
      }
      if (this.mode === 'play' && dist2(p.x, p.y, pl.x, pl.y - 4) < (p.r + pl.r * 0.6) ** 2) {
        if (this.hurtPlayer(p.dmg, p.x, p.y)) this.killProj(p, true);
      }
      if (!p.dead) p.sprite.setPosition(Math.round(p.x), Math.round(p.y));
    }
    this.eproj = this.eproj.filter((p) => !p.dead);
  }

  updateShell(p: Proj, dt: number) {
    p.t! += dt / p.flight!;
    const t = Math.min(1, p.t!);
    p.x = p.ox! + (p.tx! - p.ox!) * t;
    p.y = p.oy! + (p.ty! - p.oy!) * t;
    const h = Math.sin(Math.PI * t) * (24 + dist(p.ox!, p.oy!, p.tx!, p.ty!) * 0.15);
    p.sprite.setPosition(Math.round(p.x), Math.round(p.y - h)).setScale(1 + h / 60);
    p.shadow?.setPosition(p.x, p.y);
    if (t >= 1) {
      this.killProj(p, true);
      this.explode(p.x, p.y, p.blast!, p.dmg, { src: '榴弹炮', knock: p.knock });
      if (p.embers! > 0) this.hazards.push({ kind: 'ember', x: p.x, y: p.y, r: p.blast! * 0.75, t: 1.2 + p.embers! * 0.7, tick: 0, dmg: p.dmg * 0.16 });
    }
  }

  castBeam(x: number, y: number, a: number, range: number, width: number, dmg: number, reflections: number, knock: number, src: string) {
    const pts: number[] = [x, y];
    let cx = x;
    let cy = y;
    let dx = Math.cos(a);
    let dy = Math.sin(a);
    let left = range;
    const hitSet = new Set<Enemy>();
    for (let seg = 0; seg <= reflections && left > 1; seg++) {
      const hit = raycast(this.dungeon, cx, cy, dx, dy, left);
      const ex = cx + dx * hit.len;
      const ey = cy + dy * hit.len;
      for (const e of this.enemies) {
        if (e.dead || hitSet.has(e)) continue;
        if (segCircle(cx, cy, ex, ey, e.x, e.y - 3, e.r + width / 2)) {
          hitSet.add(e);
          this.damageEnemy(e, dmg, { src, kx: dx, ky: dy, knock, ignoreShield: true });
        }
      }
      for (const o of this.obstacles) if (!o.dead && o.kind !== 'pillar' && segCircle(cx, cy, ex, ey, o.x, o.y, o.r)) this.damageObstacle(o, dmg);
      pts.push(ex, ey);
      left -= hit.len;
      if (!hit.axis) break;
      this.fx.sparks(ex, ey, 4, 'ice');
      if (hit.axis === 'x') dx = -dx;
      else dy = -dy;
      cx = ex;
      cy = ey;
    }
    this.visuals.push({ kind: 'beam', pts, width, t: 0, dur: 0.14, color: hexToNum(E.cyan) });
  }

  castChain(x: number, y: number, a: number, range: number, jump: number, dmg: number, jumps: number, forks: number, src: string) {
    let best: Enemy | undefined;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist(x, y, e.x, e.y);
      if (d > range) continue;
      const off = Math.abs(angleDiff(a, Math.atan2(e.y - y, e.x - x)));
      if (off > 0.7) continue;
      // No zapping through walls.
      if (raycast(this.dungeon, x, y, Math.cos(Math.atan2(e.y - y, e.x - x)), Math.sin(Math.atan2(e.y - y, e.x - x)), d).len < d - 4) continue;
      const score = d * (1 + off * 2);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (!best) {
      const len = raycast(this.dungeon, x, y, Math.cos(a), Math.sin(a), range * 0.45).len;
      this.visuals.push({ kind: 'chain', pts: this.jag(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len), width: 1, t: 0, dur: 0.08, color: hexToNum(E.yellow) });
      return;
    }
    const hit = new Set<Enemy>();
    const zap = (fx: number, fy: number, target: Enemy, left: number, power: number) => {
      hit.add(target);
      this.visuals.push({ kind: 'chain', pts: this.jag(fx, fy, target.x, target.y - 4), width: 2, t: 0, dur: 0.12, color: hexToNum(E.yellow) });
      this.damageEnemy(target, dmg * power, { src, knock: 14, kx: target.x - fx, ky: target.y - fy, ignoreShield: true });
      if (left <= 0) return;
      const next = this.enemies
        .filter((e) => !e.dead && !hit.has(e) && dist(target.x, target.y, e.x, e.y) < jump)
        .sort((p, q) => dist2(target.x, target.y, p.x, p.y) - dist2(target.x, target.y, q.x, q.y));
      if (next[0]) zap(target.x, target.y - 4, next[0], left - 1, power * 0.92);
      if (forks > 0 && next[1] && Math.random() < 0.3 * forks) zap(target.x, target.y - 4, next[1], left - 2, power * 0.8);
    };
    zap(x, y, best, jumps - 1, 1);
  }

  jag(x1: number, y1: number, x2: number, y2: number): number[] {
    const pts = [x1, y1];
    const n = 5;
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    const len = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const off = rand(-6, 6);
      pts.push(x1 + (x2 - x1) * t + (nx / len) * off, y1 + (y2 - y1) * t + (ny / len) * off);
    }
    pts.push(x2, y2);
    return pts;
  }

  // ---------------------------------------------------------------- damage

  damageEnemy(
    e: Enemy,
    amount: number,
    o: { src: string; kx?: number; ky?: number; knock?: number; crit?: boolean; noCrit?: boolean; dot?: boolean; ignoreShield?: boolean; arc?: boolean; noElement?: boolean; color?: string; element?: Element; quiet?: boolean },
  ) {
    if (e.dead) return;
    if (e.boss && e.boss.invuln > 0) {
      this.fx.sparks(e.x, e.y - 8, 2, 'white');
      return;
    }
    const m = this.run.mods;
    let dmg = amount;
    let crit = !!o.crit;
    if (!o.dot && !o.noCrit && !crit && Math.random() < m.critChance) crit = true;
    if (crit) dmg *= m.critMult;
    if (e.affix === 'tough') dmg *= 0.8;
    if (e.state === 'stunned') dmg *= 1.35;
    e.hp -= dmg;
    this.run.damage[o.src] = (this.run.damage[o.src] ?? 0) + dmg;
    if (!o.dot) {
      e.flash = 0.06;
      if (o.kx !== undefined && o.knock) {
        const l = Math.hypot(o.kx, o.ky ?? 0) || 1;
        const res = e.boss ? 0.05 : e.elite ? 0.4 : 1;
        e.kx += (o.kx / l) * o.knock * res;
        e.ky += ((o.ky ?? 0) / l) * o.knock * res;
      }
      if (!o.quiet || crit) {
        audio.hit(crit);
        this.fx.sparks(e.x, e.y - 4, crit ? 6 : 2, crit ? 'gold' : 'white');
      }
      if (crit) {
        this.stop(0.025);
        this.fx.shake(0.03);
      }
    }
    if (!o.quiet || crit) this.fx.number(e.x, e.y - e.r * 2 - 4, dmg, { crit, small: o.dot, color: o.color });
    if (o.element) this.applyElement(e, o.element, dmg);
    if (!o.dot && !o.noElement) {
      for (const el of ['fire', 'ice', 'shock'] as Element[]) {
        if (m.elements[el] > 0 && Math.random() < m.elements[el]) this.applyElement(e, el, dmg);
      }
      if (m.explodeOnHit > 0 && Math.random() < m.explodeOnHit) this.explode(e.x, e.y, 26, dmg * 0.6, { src: '余烬爆裂', small: true });
      if (crit && m.splitOnCrit > 0) {
        for (let i = 0; i < m.splitOnCrit; i++) this.spawnProj('shard', e.x, e.y, rand(0, TAU), 260, 0.4, 2, dmg * 0.35, 0, 20, '裂变').hit.add(e);
      }
      if (e.status.shock > 0 && !o.arc) {
        const near = this.enemies.find((q) => q !== e && !q.dead && dist2(q.x, q.y, e.x, e.y) < 60 * 60);
        if (near) {
          this.visuals.push({ kind: 'chain', pts: this.jag(e.x, e.y - 4, near.x, near.y - 4), width: 1, t: 0, dur: 0.1, color: hexToNum(ELEMENT_COLOR.shock) });
          this.damageEnemy(near, dmg * 0.3 * m.elementPower, { src: '感电', arc: true, noCrit: true, noElement: true, color: ELEMENT_COLOR.shock });
        }
      }
    }
    if (e.hp <= 0) this.killEnemy(e, o.src);
  }

  applyElement(e: Enemy, el: Element, hit: number) {
    if (e.dead) return;
    const s = e.status;
    const pow = this.run.mods.elementPower;
    const reaction = (name: string, color: string) => {
      this.fx.callout(e.x, e.y - e.r * 2 - 14, name, color);
      this.fx.sparks(e.x, e.y, 8, el);
    };
    if (el === 'fire') {
      if (s.chill > 0 || s.frozen > 0) {
        s.chill = s.frozen = 0;
        s.chillStacks = 0;
        reaction('蒸发', ELEMENT_COLOR.fire);
        this.damageEnemy(e, hit * pow, { src: '蒸发', noCrit: true, noElement: true, color: ELEMENT_COLOR.fire });
        return;
      }
      if (s.shock > 0) {
        s.shock = 0;
        reaction('过载', ELEMENT_COLOR.shock);
        this.explode(e.x, e.y, 36, hit * 0.9 * pow, { src: '过载', small: true });
        return;
      }
      s.burn = 3;
      s.burnDps = Math.max(s.burnDps, hit * 0.4 * pow);
    } else if (el === 'ice') {
      if (s.burn > 0) {
        s.burn = 0;
        reaction('蒸发', ELEMENT_COLOR.ice);
        this.damageEnemy(e, hit * pow, { src: '蒸发', noCrit: true, noElement: true, color: ELEMENT_COLOR.ice });
        return;
      }
      s.chill = 2.6;
      s.chillStacks++;
      if (s.chillStacks >= 3) {
        s.chillStacks = 0;
        s.frozen = e.boss ? 0.5 : 1.3;
      }
    } else {
      if (s.frozen > 0) {
        s.frozen = 0;
        reaction('碎裂', ELEMENT_COLOR.ice);
        for (let i = 0; i < 6; i++) this.spawnProj('shard', e.x, e.y, (i / 6) * TAU, 240, 0.45, 2, hit * 0.5, 1, 30, '碎裂').hit.add(e);
        this.damageEnemy(e, hit * 2 * pow, { src: '碎裂', noCrit: true, noElement: true, color: ELEMENT_COLOR.ice });
        return;
      }
      if (s.burn > 0) {
        s.burn = 0;
        reaction('过载', ELEMENT_COLOR.shock);
        this.explode(e.x, e.y, 36, hit * 0.9 * pow, { src: '过载', small: true });
        return;
      }
      s.shock = 2.2;
    }
  }

  killEnemy(e: Enemy, _src: string) {
    if (e.dead) return;
    e.dead = true;
    const run = this.run;
    run.kills++;
    this.combo++;
    this.comboT = 2.2;
    run.maxCombo = Math.max(run.maxCombo, this.combo);
    run.frenzyStacks = Math.min(10, run.frenzyStacks + 1);
    audio.kill(this.combo);
    this.fx.burst(e.x, e.y - 4, e.elite ? 16 : 6);
    this.fx.petals(e.x, e.y - 4, e.elite ? 8 : 2);
    this.bloom(e.x, e.y, e.boss || e.elite ? 2 : 1);
    this.light.flash(e.x, e.y - 4, e.elite ? 60 : 30, E.white);
    this.stop(e.elite ? 0.08 : 0.014);
    if (e.elite) this.fx.shake(0.22);
    if (this.combo > 0 && this.combo % 20 === 0) this.fx.callout(this.player.x, this.player.y - 32, `${this.combo}连杀！`, E.yellow);
    for (const s of run.spells) {
      if (s.id === 'aura' && s.evolved && dist2(e.x, e.y, this.player.x, this.player.y) < 60 * 60) {
        s.kills++;
        if (s.kills % 12 === 0) this.heal(1, this.player.x, this.player.y);
      }
    }
    this.dropGem(e.x, e.y, Math.max(1, Math.round(e.xp)));
    if (e.elite) {
      this.dropChest(e.x, e.y);
      this.dropHeart(e.x + 8, e.y);
    } else if (Math.random() < 0.015) this.dropHeart(e.x, e.y);
    if (run.mods.healOnKill > 0 && Math.random() < run.mods.healOnKill) this.heal(1, e.x, e.y);
    if (run.mods.explodeOnKill > 0) this.explode(e.x, e.y, 30, e.maxHp * run.mods.explodeOnKill, { src: '连锁殉爆', small: true });
    if (e.kind === 'bomber') this.explode(e.x, e.y, 36, 18, { src: '炸弹怪', hurtsPlayer: 1 });
    this.spreadPoison(e);
    if (e.affix === 'split' && !e.mini) for (let i = 0; i < 2; i++) this.spawnEnemy(e.kind as EnemyKind, e.x + rand(-8, 8), e.y + rand(-8, 8), false, true);
    if (e.affix === 'burst') for (let i = 0; i < 10; i++) this.spawnEnemyBullet(e.x, e.y, (i / 10) * TAU, 80);
    if (e.boss) {
      bossDeath(this, e);
      return;
    }
    const sprite = e.sprite;
    sprite.setTintFill(0xffffff);
    this.tweens.add({ targets: sprite, scaleX: sprite.scaleX * 1.4, scaleY: sprite.scaleY * 0.4, alpha: 0, duration: 120, onComplete: () => sprite.destroy() });
    e.shadow.destroy();
    e.extra?.destroy();
    e.ring?.destroy();
  }

  /** Each kill leaves an anemone on the floor; a cleared room is in bloom. */
  bloom(x: number, y: number, scale: number) {
    this.decals?.stamp('bloom', undefined, Math.round(x), Math.round(y), { angle: Math.floor(rand(0, 4)) * 90, scale, alpha: 0.85 });
  }

  explode(x: number, y: number, r: number, dmg: number, o: { src: string; hurtsPlayer?: number; knock?: number; small?: boolean }) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (dist2(x, y, e.x, e.y) < (r + e.r) ** 2) this.damageEnemy(e, dmg, { src: o.src, kx: e.x - x, ky: e.y - y, knock: o.knock ?? 100, ignoreShield: true, noElement: o.small });
    }
    for (const b of this.obstacles) {
      if (!b.dead && b.kind !== 'pillar' && dist2(x, y, b.x, b.y) < (r + b.r) ** 2) this.time.delayedCall(60, () => this.damageObstacle(b, 999));
    }
    if (o.hurtsPlayer && this.mode === 'play' && dist2(x, y, this.player.x, this.player.y) < (r + this.player.r) ** 2) this.hurtPlayer(o.hurtsPlayer, x, y);
    this.fx.boom(x, y, r * 1.2);
    this.fx.ring(x, y, r, o.hurtsPlayer ? this.kit.palette.danger : E.yellow, 260, 2);
    this.fx.burst(x, y, o.small ? 4 : 10);
    this.fx.dust(x, y, o.small ? 3 : 8);
    this.fx.shake(o.small ? 0.06 : 0.2);
    this.light.flash(x, y, r * 3, E.orange);
    audio.explode(!o.small && r > 30);
  }

  damageObstacle(o: Obstacle, dmg: number) {
    if (o.dead) return;
    o.hp -= dmg;
    o.sprite.setTintFill(0xffffff);
    this.time.delayedCall(50, () => o.sprite.active && o.sprite.clearTint());
    if (o.hp <= 0) {
      o.dead = true;
      o.sprite.destroy();
      if (o.kind === 'barrel') this.explode(o.x, o.y, 44, 30, { src: '爆炸桶', hurtsPlayer: 2, knock: 160 });
      else {
        this.fx.burst(o.x, o.y, 8);
        this.fx.dust(o.x, o.y, 6);
        if (Math.random() < 0.25) this.dropHeart(o.x, o.y);
        else this.dropGem(o.x, o.y, 2);
      }
    }
  }

  hurtPlayer(n: number, sx: number, sy: number): boolean {
    const p = this.player;
    if (this.mode !== 'play' || p.iframes > 0 || this.god || this.fusing) return false;
    const run = this.run;
    let left = n;
    const absorbed = Math.min(run.armor, left);
    run.armor -= absorbed;
    left -= absorbed;
    run.hp -= left;
    p.iframes = 0.8;
    p.sinceHit = 0;
    p.armorT = 0.9;
    const a = Math.atan2(p.y - sy, p.x - sx);
    p.vx += Math.cos(a) * 160;
    p.vy += Math.sin(a) * 160;
    audio.hurt();
    this.fx.shake(left > 0 ? 0.45 : 0.25);
    this.fx.flash(left > 0 ? E.red : E.grey, left > 0 ? 0.3 : 0.18, 220);
    this.stop(left > 0 ? 0.08 : 0.04);
    this.combo = 0;
    if (run.hp <= 0) this.die();
    return true;
  }

  heal(n: number, x: number, y: number) {
    const run = this.run;
    if (run.hp >= run.mods.maxHp) return;
    run.hp = Math.min(run.mods.maxHp, run.hp + n);
    this.fx.number(x, y - 16, n, { text: `+${n}`, color: E.red });
  }

  die() {
    this.mode = 'dead';
    this.slow(0.25, 1.2);
    this.fx.petals(this.player.x, this.player.y, 30);
    this.fx.flash(E.white, 0.5, 600);
    this.player.sprite.setVisible(false);
    this.player.gun.setVisible(false);
    this.player.gun2.setVisible(false);
    audio.setIntensity(0);
    const rec = this.recordRun(false);
    this.time.delayedCall(1400, () => {
      this.mode = 'end';
      ui.showHud(false);
      ui.end({ victory: false, run: this.run, ...rec }, () => this.restart(), () => this.endToTitle());
    });
  }

  restart() {
    this.startRun();
  }

  endToTitle() {
    this.clearLevel();
    this.showTitle();
  }

  // ---------------------------------------------------------------- enemies

  updateEnemies(dt: number) {
    const pl = this.player;
    const list = this.enemies;
    for (const e of list) {
      if (e.dead) continue;
      const s = e.status;
      if (s.burn > 0) {
        s.burn -= dt;
        s.burnTick -= dt;
        if (s.burnTick <= 0) {
          s.burnTick = 0.33;
          this.damageEnemy(e, s.burnDps * 0.33, { src: '燃烧', dot: true, color: ELEMENT_COLOR.fire });
          this.fx.sparks(e.x, e.y - 6, 1, 'fire');
          if (e.dead) continue;
        }
      } else s.burnDps = 0;
      if (s.chill > 0) s.chill -= dt;
      else s.chillStacks = 0;
      if (s.frozen > 0) s.frozen -= dt;
      if (s.shock > 0) s.shock -= dt;
      const slowMul = s.frozen > 0 ? 0 : 1 - Math.min(0.6, s.chillStacks * 0.2 + (s.chill > 0 ? 0.15 : 0));
      if (e.boss) updateBoss(this, e, dt, slowMul);
      else updateEnemyAI(this, e, dt, slowMul);
      if (e.dead) continue;
      const kd = Math.exp(-dt * 10);
      e.kx *= kd;
      e.ky *= kd;
      e.x += (e.vx * slowMul + e.kx) * dt;
      e.y += (e.vy * slowMul + e.ky) * dt;
    }
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead) continue;
        const min = a.r + b.r;
        const dx = a.x - b.x;
        if (dx > min || dx < -min) continue;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < min * min && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          const wa = a.boss ? 0.1 : 1;
          const wb = b.boss ? 0.1 : 1;
          a.x += (dx / d) * push * wa;
          a.y += (dy / d) * push * wa;
          b.x -= (dx / d) * push * wb;
          b.y -= (dy / d) * push * wb;
        }
      }
      if (!(a.kind === 'boar' && a.state === 'charge')) {
        for (const o of this.obstacles) {
          if (o.dead) continue;
          const d = dist(a.x, a.y, o.x, o.y);
          const min = a.r + o.r;
          if (d < min && d > 0.01) {
            a.x = o.x + ((a.x - o.x) / d) * min;
            a.y = o.y + ((a.y - o.y) / d) * min;
          }
        }
      }
      // The guardian hovers over pillars; everything else is held back by walls.
      if (a.kind !== 'guardian' && (!a.boss || a.boss.air < 20)) [a.x, a.y] = collide(this.dungeon, a.x, a.y, Math.max(3, a.r * 0.8));
      if (this.mode === 'play' && dist2(a.x, a.y, pl.x, pl.y) < (a.r + pl.r * 0.8) ** 2 && (a.boss?.air ?? 0) < 20) {
        this.hurtPlayer(a.state === 'charge' ? 2 : a.contact, a.x, a.y);
      }
      a.flash -= dt;
      a.anim += dt;
      const sp = a.sprite;
      if (!a.boss) {
        const moving = Math.hypot(a.vx, a.vy) > 4;
        const frame = moving && Math.floor(a.anim * (a.kind === 'bat' ? 10 : 5)) % 2 ? 'b' : 'a';
        sp.setTexture(K(`en-${a.kind}-${frame}`, this.kit));
        sp.setFlipX(pl.x < a.x);
      }
      sp.setPosition(Math.round(a.x), Math.round(a.y - (a.boss?.air ?? 0)));
      if (a.flash > 0) sp.setTintFill(0xffffff);
      else if (a.status.frozen > 0) sp.setTint(hexToNum(ELEMENT_COLOR.ice));
      else if (a.status.burn > 0 && Math.floor(this.time0 * 10) % 2 === 0) sp.setTint(0xffb080);
      else if (a.boss?.enraged) sp.setTint(0xff9a9a);
      else sp.clearTint();
      if (a.enter) this.entrance(a, sp, dt);
      a.shadow.setPosition(Math.round(a.x), Math.round(a.y + 1));
      a.ring?.setPosition(a.x, a.y - 4);
      if (a.extra) {
        const ex = a.x + Math.cos(a.facing) * 7;
        const ey = a.y - 5 + Math.sin(a.facing) * 5;
        a.extra.setPosition(Math.round(ex), Math.round(ey)).setRotation(a.facing).setDepth(Math.sin(a.facing) > 0 ? DEPTH.enemy + 0.1 : DEPTH.enemy - 0.1);
      }
    }
    this.enemies = list.filter((e) => !e.dead || e.boss);
  }

  // ---------------------------------------------------------------- pickups, treasure, trapdoor

  dropGem(x: number, y: number, value: number) {
    const tier = value >= 5 ? 3 : value >= 2 ? 2 : 1;
    const a = rand(0, TAU);
    const sp = rand(10, 40);
    const sprite = this.add.image(Math.round(x), Math.round(y), `gem-${tier}`).setDepth(DEPTH.pickup);
    this.pickups.push({ kind: 'gem', tier, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, value, t: 0, magnet: !this.active, sprite, dead: false });
  }

  dropHeart(x: number, y: number) {
    [x, y] = openSpot(this.dungeon, x, y, 3);
    const sprite = this.add.image(Math.round(x), Math.round(y), 'heart').setDepth(DEPTH.pickup);
    this.pickups.push({ kind: 'heart', tier: 0, x, y, vx: 0, vy: -20, value: 1, t: 0, magnet: false, sprite, dead: false });
  }

  /** A gold chest gives one reward on the spot; a steel weapon chest opens a pick of three guns. */
  dropChest(x: number, y: number, weapon = false) {
    [x, y] = openSpot(this.dungeon, x, y);
    const sprite = this.add.image(Math.round(x), Math.round(y), weapon ? 'chest-w' : 'chest').setDepth(DEPTH.pickup + 0.5).setOrigin(0.5, 0.8);
    const glow = this.add.image(x, y - 4, 'glow').setDepth(DEPTH.pickup).setTint(hexToNum(weapon ? E.cyan : E.yellow)).setScale(1.6).setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: 0.2, yoyo: true, repeat: -1, duration: 500 });
    sprite.setData('glow', glow);
    this.pickups.push({ kind: weapon ? 'wchest' : 'chest', tier: 0, x, y, vx: 0, vy: 0, value: 0, t: 0, magnet: false, sprite, dead: false });
  }

  updatePickups(dt: number) {
    const pl = this.player;
    const radius = 34 * this.run.mods.pickupRadius + (this.run.pets.includes('dove') ? 50 : 0);
    for (const p of this.pickups) {
      if (p.dead) continue;
      p.t += dt;
      if (p.kind === 'chest' || p.kind === 'wchest') {
        if (this.mode === 'play' && dist2(p.x, p.y, pl.x, pl.y) < 14 * 14) this.openChest(p);
        continue;
      }
      if (!p.magnet && p.t > 0.25 && (dist2(p.x, p.y, pl.x, pl.y) < radius * radius || (p.kind === 'heart' && dist2(p.x, p.y, pl.x, pl.y) < 20 * 20))) {
        p.magnet = true;
        p.t = 0;
      }
      if (p.magnet && this.mode !== 'dead') {
        // Straight at the player with a speed that ramps up. Steering by acceleration let gems keep their sideways
        // speed and swing into orbit around a moving player; heading straight in can never miss.
        const dx = pl.x - p.x;
        const dy = pl.y - 4 - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const step = Math.min(d, Math.min(540, 110 + p.t * 1000) * dt);
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      } else {
        const f = Math.exp(-dt * 5);
        p.vx *= f;
        p.vy *= f;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        [p.x, p.y] = collide(this.dungeon, p.x, p.y, 3);
      }
      p.sprite.setPosition(Math.round(p.x), Math.round(p.y + (p.magnet ? 0 : Math.round(Math.sin(p.t * 5) * 1.2))));
      if (dist2(p.x, p.y, pl.x, pl.y - 4) < (pl.r + 6) ** 2 && this.mode !== 'dead') {
        p.dead = true;
        p.sprite.destroy();
        if (p.kind === 'heart') {
          this.heal(1, pl.x, pl.y);
          audio.select();
        } else {
          this.gemStreak++;
          this.gemT = 0.4;
          audio.pickup(this.gemStreak);
          this.gainXp(p.value);
        }
      }
    }
    this.pickups = this.pickups.filter((p) => !p.dead);
    this.updatePedestals();
    this.updateTrapdoor();
  }

  openChest(p: Pickup) {
    p.dead = true;
    (p.sprite.getData('glow') as Img | undefined)?.destroy();
    if (p.kind === 'wchest') {
      p.sprite.setTexture('chest-w-open');
      this.tweens.add({ targets: p.sprite, alpha: 0, delay: 900, duration: 300, onComplete: () => p.sprite.destroy() });
      this.fx.ring(p.x, p.y - 6, 50, E.cyan, 400);
      this.fx.sparks(p.x, p.y - 8, 14, 'ice');
      this.light.flash(p.x, p.y - 8, 90, E.cyan);
      audio.levelUp();
      this.offerWeapons();
      return;
    }
    p.sprite.setTexture('chest-open');
    this.tweens.add({ targets: p.sprite, alpha: 0, delay: 900, duration: 300, onComplete: () => p.sprite.destroy() });
    this.fx.ring(p.x, p.y - 6, 50, E.yellow, 400);
    this.fx.glowPop(p.x, p.y - 8, 40, E.yellow, 400);
    this.fx.sparks(p.x, p.y - 8, 16, 'gold');
    this.light.flash(p.x, p.y - 8, 90, E.yellow);
    this.stop(0.08);
    audio.levelUp();
    const run = this.run;
    const evo = evolutionsReady(run);
    let c: Choice;
    if (evo.length) c = evo[0];
    else {
      const ups = run.spells.filter((s) => s.level < 5 && !SPELLS[s.id].fusion).map((s) => ({ type: 'spell-up', id: s.id }) as Choice);
      c = ups.length && run.rng.chance(0.6) ? run.rng.pick(ups) : rollChoices(run, 'rare')[0];
    }
    this.takeChoice(c);
    ui.chestReward(c, run);
  }

  /** Treasure room: three items on pedestals; take one and the others crumble. */
  spawnPedestals(room: DRoom) {
    const run = this.run;
    const rng = run.rng;
    const items: Choice[] = [];
    const guns = WEAPON_ORDER.filter((id) => !run.weapons.some((w) => w.def.id === id));
    if (guns.length) items.push({ type: 'weapon-new', id: rng.pick(guns) });
    const spellsNew = SPELL_ORDER.filter((id) => !spellTaken(run, id));
    if (spellsNew.length && run.spells.length < 4) items.push({ type: 'spell-new', id: rng.pick(spellsNew) });
    else {
      const up = run.spells.find((s) => s.level < 5 && !SPELLS[s.id].fusion);
      if (up) items.push({ type: 'spell-up', id: up.id });
    }
    const pets = (['hound', 'dove', 'swan'] as const).filter((k) => !run.pets.includes(k));
    if (pets.length) items.push({ type: 'pet', kind: rng.pick(pets) });
    while (items.length < 3) items.push(rollChoices(run, 'rare')[0]);
    const [cx, cy] = roomCenter(room);
    // Keep the row off the line you walk in on, so nothing is grabbed by accident.
    const y = room.doors.up ? cy + 26 : cy - 26;
    items.slice(0, 3).forEach((choice, i) => {
      const x = cx + (i - 1) * 64;
      const ped = this.add.image(x, y + 6, 'pedestal').setDepth(DEPTH.obstacle);
      let key: string;
      switch (choice.type) {
        case 'weapon-new':
          key = `gun-${choice.id}`;
          break;
        case 'spell-new':
        case 'spell-up':
        case 'evolve':
          key = `spell-${choice.id}`;
          break;
        case 'pet':
          key = `pet-${choice.kind}`;
          break;
        default:
          key = textTexture(this, choice.type === 'upgrade' ? choice.def.glyph : '愈', { color: E.yellow, outline: E.ink });
      }
      const item = this.add.image(x, y - 8, key).setDepth(DEPTH.obstacle + 0.5);
      const glow = this.add.image(x, y - 8, 'glow').setDepth(DEPTH.obstacle + 0.4).setTint(hexToNum(E.yellow)).setScale(1.2).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);
      const d = ui.describe(choice, run);
      const label = this.add.image(x, y + 22, textTexture(this, d.name, { color: E.white, outline: E.ink })).setDepth(DEPTH.obstacle + 0.6);
      this.pedestals.push({ x, y, ped, item, glow, label, choice, room });
      this.light.addStatic(x, y - 8, 40, E.yellow);
    });
  }

  updatePedestals() {
    if (!this.pedestals.length || this.mode !== 'play') return;
    const pl = this.player;
    for (const p of this.pedestals) {
      p.item.setY(Math.round(p.y - 9 + Math.sin(this.time0 * 3 + p.x) * 2));
      p.glow.setY(p.item.y);
      if (dist2(p.x, p.y, pl.x, pl.y) < 12 * 12) {
        this.takeChoice(p.choice);
        ui.chestReward(p.choice, this.run);
        this.fx.ring(p.x, p.y - 8, 40, E.yellow, 400);
        this.fx.sparks(p.x, p.y - 8, 16, 'gold');
        audio.levelUp();
        for (const q of this.pedestals) {
          if (q.room !== p.room) continue;
          [q.item, q.glow, q.label].forEach((o) => o.destroy());
          q.ped.setAlpha(0.5);
          if (q !== p) this.fx.dust(q.x, q.y - 8, 8);
        }
        this.pedestals = this.pedestals.filter((q) => q.room !== p.room);
        return;
      }
    }
  }

  spawnTrapdoor(x: number, y: number) {
    if (this.mode === 'dead' || this.mode === 'end') return;
    [x, y] = openSpot(this.dungeon, x, y);
    const final = this.run.level === LEVELS - 1;
    const img = this.add.image(x, y, final ? 'bloom' : 'trapdoor').setDepth(DEPTH.decal + 0.6).setScale(final ? 3 : 1);
    const label = this.add.image(x, y + 20, textTexture(this, final ? '走上银莲花 结束轮回' : '下一层', { color: E.yellow, outline: E.ink })).setDepth(DEPTH.decal + 0.7);
    this.trapdoor = { img, label, final };
    this.fx.dust(x, y, 10);
    this.light.addStatic(x, y, 70, final ? E.red : E.yellow);
  }

  updateTrapdoor() {
    const td = this.trapdoor;
    if (!td || this.mode !== 'play') return;
    const p = this.player;
    if (dist2(p.x, p.y, td.img.x, td.img.y) > 12 * 12) return;
    this.mode = 'transition';
    // Destroy it now: keeping the sprite around is what left a hole in the middle of later rooms.
    td.img.destroy();
    td.label.destroy();
    this.trapdoor = undefined;
    // Gems still on the floor are not lost.
    for (const g of this.pickups) if (g.kind === 'gem' && !g.dead) this.gainXp(g.value);
    audio.select();
    const cam = this.cameras.main;
    cam.fadeOut(500, 255, 255, 255);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (td.final) {
        this.victory();
        return;
      }
      this.run.level++;
      this.enterLevel();
    });
  }

  offerWeapons() {
    if (this.mode !== 'play') return;
    const choices = rollChoices(this.run, 'weapon');
    this.mode = 'choose';
    ui.choices(
      '武器箱',
      '挑一把带走',
      choices,
      this.run,
      (i) => {
        if (i >= 0) this.takeChoice(choices[i]);
        this.mode = 'play';
        if (this.pendingLevelUps > 0) this.time.delayedCall(120, () => this.openLevelUp());
      },
      { tag: 'WEAPON', skip: '都不要，跳过' },
    );
  }

  gainXp(v: number) {
    const run = this.run;
    run.xp += v;
    while (run.xp >= run.xpNext) {
      run.xp -= run.xpNext;
      run.xpLevel++;
      run.xpNext = xpForLevel(run.xpLevel);
      this.pendingLevelUps++;
    }
    if (this.pendingLevelUps > 0 && this.mode === 'play') this.openLevelUp();
  }

  openLevelUp() {
    if (this.pendingLevelUps <= 0 || this.mode !== 'play' || this.fusing) return;
    this.mode = 'choose';
    audio.levelUp();
    this.fx.ring(this.player.x, this.player.y - 4, 70, E.yellow, 400);
    this.fx.flash(E.white, 0.2, 240);
    const choices = rollChoices(this.run, 'level');
    ui.choices(
      '升级',
      `等级 ${this.run.xpLevel - this.pendingLevelUps + 1}`,
      choices,
      this.run,
      (i) => {
        if (i >= 0) this.takeChoice(choices[i]);
        this.pendingLevelUps--;
        this.mode = 'play';
        if (this.pendingLevelUps > 0) this.time.delayedCall(120, () => this.openLevelUp());
      },
      { skip: '跳过这次升级' },
    );
  }

  takeChoice(c: Choice) {
    applyChoice(this.run, c);
    this.time.delayedCall(0, () => this.saveProgress());
    if (c.type === 'spell-new' || c.type === 'spell-up') this.time.delayedCall(350, () => this.checkFusions());
    if (c.type === 'pet') {
      syncPets(this);
      ui.toast(`${PETS[c.kind].name}加入了队伍`);
    } else if (c.type === 'evolve') {
      this.fx.flash(E.yellow, 0.4, 500);
      this.fx.ring(this.player.x, this.player.y, 120, E.yellow, 600, 3);
      ui.toast(`进化：${SPELLS[c.id].evolved?.name ?? SPELLS[c.id].name}`, 1600);
    } else if (c.type === 'upgrade') ui.toast(UPGRADE_BY_ID[c.def.id].name, 800);
  }

  checkFusions() {
    if (this.mode === 'dead' || this.mode === 'end' || this.mode === 'title' || this.fusing) return;
    // One at a time: a second fusion that is ready plays after the first one lands.
    const f = fusionsReady(this.run)[0];
    if (f) this.fuse(f);
  }

  /**
   * Two spells merge. Time almost stops and the world darkens; energy streams in from all around onto the knight,
   * who glows brighter as it arrives, while the two spell icons spiral together over its head. The sound rises
   * with it, and everything lands on one beat: a flash, a shockwave that throws enemies back, and the new spell.
   */
  fuse(f: FusionId) {
    const usedUp = applyFusion(this.run, f);
    const p = this.player;
    const G = FUSE_GATHER;
    const [c1, c2] = FUSION_GLOW[f];
    this.fusing = true;
    this.slow(0.12, G + 0.3);
    audio.fusion(G);
    this.fx.dim(0.55, 350);
    this.fx.converge(() => ({ x: p.x, y: p.y - 8 }), G, [c1, c2, E.white], 72);
    // Rings closing in, each timed to shut on the landing.
    for (const [at, r, c] of [[0.1, 110, c1], [0.45, 90, c2], [0.8, 70, E.white]] as const) {
      this.time.delayedCall(at * 1000, () => this.fx.implode(p.x, p.y - 8, r, c, (G - at) * 1000, at > 0.7 ? 2 : 1));
    }
    [0.4, 0.75, 1.05].forEach((at, i) => this.time.delayedCall(at * 1000, () => this.fx.shake(0.02 + i * 0.025)));

    // The knight takes on the light: an additive copy of its sprite, brighter as the energy arrives.
    const glow = this.add.image(p.x, p.y, p.sprite.texture.key, p.sprite.frame.name).setDepth(DEPTH.particles - 0.5).setBlendMode(Phaser.BlendModes.ADD).setTintFill(hexToNum(c1)).setAlpha(0);
    const halo = this.add.image(p.x, p.y - 8, 'glow').setDepth(DEPTH.particles - 0.6).setBlendMode(Phaser.BlendModes.ADD).setTint(hexToNum(c1)).setAlpha(0).setScale(1);
    const icons = usedUp.map((sp) => this.add.image(p.x, p.y - 34, `spell-${sp.id}`).setDepth(DEPTH.numbers).setScale(2));
    const prog = { k: 0 };
    this.tweens.add({
      targets: prog,
      k: 1,
      duration: G * 1000,
      onUpdate: () => {
        const k = prog.k;
        const e = k * k;
        // Two and a half turns, closing in faster at the end.
        const r = 36 * (1 - e);
        const spin = e * Math.PI * 5;
        icons.forEach((img, i) => {
          const a = spin + i * Math.PI;
          img.setPosition(Math.round(p.x + Math.cos(a) * r), Math.round(p.y - 34 + Math.sin(a) * r * 0.45)).setScale(2 - e * 0.8);
        });
        const s = p.sprite;
        glow.setTexture(s.texture.key, s.frame.name).setPosition(s.x, s.y).setOrigin(s.originX, s.originY).setFlipX(s.flipX).setScale(s.scaleX, s.scaleY);
        glow.setAlpha(Math.min(0.9, k * 1.1) * (0.8 + 0.2 * Math.sin(k * 46)));
        halo.setPosition(p.x, p.y - 8).setAlpha(k * 0.7).setScale(0.6 + k * 2.6);
      },
      onComplete: () => icons.forEach((img) => img.destroy()),
    });
    this.time.delayedCall(G * 1000, () => this.fusionLands(f, glow, halo));
  }

  /** The landing beat of a fusion: flash, shockwave, and the new spell over the knight's head. */
  private fusionLands(f: FusionId, glow: Img, halo: Img) {
    const p = this.player;
    const [c1, c2] = FUSION_GLOW[f];
    const x = p.x;
    const y = p.y - 8;
    this.fx.dim(0, 500);
    this.fx.flash(E.white, 0.85, 170);
    this.time.delayedCall(110, () => this.fx.flash(c1, 0.35, 560));
    this.fx.ring(x, y, 180, E.white, 520, 4);
    this.fx.ring(x, y, 130, c1, 720, 3);
    this.fx.ring(x, y, 80, c2, 460, 2);
    this.fx.glowPop(x, y, 150, c1, 520);
    this.fx.sparks(x, y, 30, 'gold');
    this.fx.sparks(x, y, 24, 'white');
    this.fx.burst(x, y, 18);
    this.fx.shake(0.42);
    this.light.flash(x, y, 230, c1, 0.6);
    this.tweens.add({ targets: [glow, halo], alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: () => (glow.destroy(), halo.destroy()) });
    // The shockwave: enemies near the knight are hurt and thrown back, and their bullets are wiped away.
    const R = 130;
    for (const e of this.enemies) {
      if (e.dead || dist2(e.x, e.y, x, y) > R * R) continue;
      this.damageEnemy(e, 18 * this.damageMult(), { src: '融合冲击', kx: e.x - x, ky: e.y - y, knock: 340, ignoreShield: true });
    }
    for (const b of this.eproj) if (!b.dead && dist2(b.x, b.y, x, y) < R * R) this.killProj(b);
    // The new spell bursts out over the knight's head.
    const iy = p.y - 36;
    this.fx.burstRays(x, iy, 70, c1, 1600);
    const big = this.add.image(x, iy, `spell-${f}`).setDepth(DEPTH.numbers + 1).setScale(6);
    this.tweens.add({ targets: big, scale: 3, duration: 280, ease: 'Back.easeOut' });
    this.tweens.add({ targets: big, y: iy - 12, alpha: 0, delay: 1300, duration: 400, onComplete: () => big.destroy() });
    this.fx.callout(x, iy - 46, SPELLS[f].name, c1, true);
    ui.fusionReward(f);
    this.saveProgress();
    this.time.delayedCall(800, () => {
      this.fusing = false;
      this.checkFusions();
      this.openLevelUp();
    });
  }

  updateHazards(dt: number) {
    const COLOR = { ember: ELEMENT_COLOR.fire, poison: E.green, vortex: E.magenta };
    for (const h of this.hazards) {
      h.t -= dt;
      h.tick -= dt;
      if (h.kind === 'vortex') {
        // Pull everything but bosses toward the core.
        for (const e of this.enemies) {
          if (e.dead || e.boss) continue;
          const d = dist(e.x, e.y, h.x, h.y);
          if (d > h.r * 1.25 || d < 3) continue;
          const f = (h.pull ?? 40) * dt * (0.5 + (1 - d / (h.r * 1.25)));
          e.x += ((h.x - e.x) / d) * f;
          e.y += ((h.y - e.y) / d) * f;
        }
        if (h.arc) {
          h.arcT = (h.arcT ?? 0) - dt;
          if (h.arcT <= 0) {
            h.arcT = 0.35;
            const inside = this.enemies.filter((e) => !e.dead && dist2(e.x, e.y, h.x, h.y) < h.r * h.r).slice(0, 4);
            for (const e of inside) zap(this, h.x, h.y - 4, e, h.arc, h.src ?? '雷暴奇点');
          }
        }
      }
      if (h.tick <= 0) {
        h.tick = h.kind === 'poison' ? 0.4 : 0.3;
        for (const e of this.enemies) {
          if (e.dead || dist2(e.x, e.y, h.x, h.y) >= (h.r + e.r) ** 2) continue;
          this.damageEnemy(e, h.dmg, { src: h.src ?? '余烬', dot: true, color: COLOR[h.kind] });
          if (h.kind === 'poison' && !e.dead) e.status.chill = Math.max(e.status.chill, 0.5);
        }
      }
      if (h.t <= 0 && h.kind === 'vortex' && h.burst) {
        this.explode(h.x, h.y, h.r * 0.8, h.burst, { src: h.src ?? '黑洞', knock: 160 });
        this.fx.ring(h.x, h.y, h.r, E.magenta, 360, 3);
      }
    }
    this.hazards = this.hazards.filter((h) => h.t > 0);
  }

  /** Poison that spreads: kills inside an evolved cloud, or inside the plague aura, leave a new cloud. */
  spreadPoison(e: Enemy) {
    const run = this.run;
    const plague = run.spells.some((s) => s.id === 'plague') && dist2(e.x, e.y, this.player.x, this.player.y) < (62 * run.mods.area) ** 2;
    const host = this.hazards.find((h) => h.kind === 'poison' && h.spread && dist2(e.x, e.y, h.x, h.y) < h.r * h.r);
    if (!plague && !host) return;
    if (this.hazards.filter((h) => h.kind === 'poison').length >= 14) return;
    const dmg = 2.2 * this.damageMult();
    this.hazards.push({ kind: 'poison', x: e.x, y: e.y, r: 22 * run.mods.area, t: 2.5, dur: 2.5, tick: 0.2, dmg, src: plague ? '瘟疫领域' : '瘟疫爆发', spread: !!host });
  }

  updateTelegraphs(dt: number) {
    for (const t of this.telegraphs) {
      t.t += dt;
      if (t.t >= t.dur) t.onDone?.();
    }
    this.telegraphs = this.telegraphs.filter((t) => t.t < t.dur);
    for (const v of this.visuals) v.t += dt;
    this.visuals = this.visuals.filter((v) => v.t < v.dur);
  }

  victory() {
    this.mode = 'end';
    ui.showHud(false);
    this.cameras.main.fadeIn(600, 255, 255, 255);
    const rec = this.recordRun(true);
    ui.end({ victory: true, run: this.run, ...rec }, () => this.restart(), () => this.endToTitle());
  }

  // ---------------------------------------------------------------- drawing

  drawWorld(dt: number) {
    this.sortDecor();
    const p = this.player;
    const run = this.run;
    if (p && run) {
      const left = Math.cos(p.aim) < 0;
      p.sprite.setPosition(Math.round(p.x), Math.round(p.y)).setFlipX(left);
      p.sprite.setAlpha(p.iframes > 0 && p.dashT <= 0 && this.mode === 'play' ? (Math.floor(this.time0 * 20) % 2 ? 0.3 : 1) : 1);
      p.shadow.setPosition(Math.round(p.x), Math.round(p.y + 1));
      p.punch = Math.max(0, p.punch - dt * 10);
      const held = run.weapons[run.held];
      const handX = p.x + (left ? -2 : 2);
      const handY = p.y - 4;
      const kick = p.punch * 2;
      const gx = handX - Math.cos(p.aim) * kick;
      const gy = handY - Math.sin(p.aim) * kick;
      if (held) {
        // The sword sweeps through its arc; guns just kick back.
        const swing = held.def.kind === 'slash' ? (p.punch - 0.5) * 2.4 * (left ? -1 : 1) : 0;
        p.gun.setTexture(`gun-${held.def.id}`).setOrigin(held.def.grip[0], held.def.grip[1]);
        p.gun.setPosition(Math.round(held.def.kind === 'slash' ? handX : gx), Math.round(held.def.kind === 'slash' ? handY : gy));
        // Reloading tips the muzzle down; a fresh swap swings the gun up from the hip.
        const reloading = !!held.def.mag && (held.reloadT ?? 0) > 0;
        const tilt = reloading ? (left ? -0.75 : 0.75) : 0;
        this.swapT = Math.max(0, this.swapT - dt);
        const sw = this.swapT / 0.2;
        const flourish = sw * 2.4 * (left ? -1 : 1);
        p.gun.setRotation(p.aim + swing + tilt + flourish).setScale(1, 1 - sw * 0.7).setFlipY(left).setDepth(Math.sin(p.aim) < -0.3 ? DEPTH.player - 0.1 : DEPTH.gun);
      }
      const dual = p.skillT > 0 && run.weapons.length > 1;
      p.gun2.setVisible(dual && this.mode === 'play');
      if (dual) {
        const off = run.weapons[(run.held + 1) % run.weapons.length];
        p.gun2.setTexture(`gun-${off.def.id}`).setOrigin(off.def.grip[0], off.def.grip[1]);
        p.gun2.setPosition(Math.round(gx - (left ? -5 : 5)), Math.round(gy + 2)).setRotation(p.aim).setFlipY(left);
      }
    }
    const g = this.floorGfx;
    g.clear();
    // Summons draw their light pillars on the effects layer, so clear it before them.
    this.gfx.clear();
    const danger = hexToNum(this.kit.palette.danger);
    for (const t of this.telegraphs) {
      const k = t.t / t.dur;
      if (t.kind === 'spawn') {
        this.drawSummon(g, t, k, danger);
      } else if (t.kind === 'circle') {
        g.lineStyle(1, hexToNum(E.yellow), 0.6);
        g.strokeCircle(t.x, t.y, t.r!);
        g.fillStyle(hexToNum(E.yellow), 0.15 * k);
        g.fillCircle(t.x, t.y, t.r! * k);
      } else if (t.kind === 'line') {
        g.lineStyle(2 + 4 * k, danger, 0.25 + 0.35 * Math.abs(Math.sin(t.t * 20)));
        g.lineBetween(t.x, t.y, t.x2!, t.y2!);
      }
    }
    for (const h of this.hazards) {
      const life = h.dur ? Math.min(1, h.t / 0.3, (h.dur - h.t) / 0.2 + 0.2) : 1;
      if (h.kind === 'ember') {
        g.fillStyle(hexToNum(ELEMENT_COLOR.fire), (0.18 + 0.08 * Math.sin(this.time0 * 12)) * life);
        g.fillCircle(h.x, h.y, h.r);
      } else if (h.kind === 'poison') {
        g.fillStyle(hexToNum(E.greenD), 0.28 * life);
        g.fillCircle(h.x, h.y, h.r);
        g.fillStyle(hexToNum(E.green), 0.22 * life);
        g.fillCircle(h.x, h.y, h.r * 0.7);
        // Bubbles rise through the cloud.
        for (let i = 0; i < 4; i++) {
          const a = i * 1.7 + h.x * 0.1;
          const k = (this.time0 * 0.8 + i * 0.25) % 1;
          g.fillStyle(hexToNum(E.green), (1 - k) * 0.8 * life);
          g.fillCircle(h.x + Math.cos(a) * h.r * 0.5, h.y + Math.sin(a) * h.r * 0.35 - k * 8, 1.5);
        }
      } else {
        const spin = this.time0 * 5;
        g.fillStyle(hexToNum(E.ink), 0.55 * life);
        g.fillCircle(h.x, h.y, h.r * 0.45);
        g.lineStyle(1, hexToNum(E.magenta), 0.6 * life);
        g.strokeCircle(h.x, h.y, h.r);
        for (let arm = 0; arm < 3; arm++) {
          g.lineStyle(2, hexToNum(arm % 2 ? E.purple : E.magenta), 0.7 * life);
          g.beginPath();
          for (let k = 0; k <= 12; k++) {
            const t = k / 12;
            const a = spin + arm * (TAU / 3) + t * 3.2;
            const rr = h.r * (1 - t * 0.85);
            if (k === 0) g.moveTo(h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr * 0.7);
            else g.lineTo(h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr * 0.7);
          }
          g.strokePath();
        }
        g.fillStyle(hexToNum(E.white), 0.8 * life);
        g.fillCircle(h.x, h.y, 2);
      }
    }
    const b = this.boss;
    if (b && !b.dead && b.boss) {
      const bs = b.boss;
      if (bs.armWarn > 0 || bs.armLive > 0) {
        for (let i = 0; i < bs.arms; i++) {
          const a = bs.armA + (i / bs.arms) * TAU;
          const len = raycast(this.dungeon, b.x, b.y - 10, Math.cos(a), Math.sin(a), 600, true).len;
          const x2 = b.x + Math.cos(a) * len;
          const y2 = b.y - 10 + Math.sin(a) * len;
          if (bs.armLive > 0) {
            g.lineStyle(8, danger, 0.35);
            g.lineBetween(b.x, b.y - 10, x2, y2);
            g.lineStyle(3, 0xffffff, 0.9);
            g.lineBetween(b.x, b.y - 10, x2, y2);
          } else {
            g.lineStyle(1, danger, 0.4 + 0.4 * Math.abs(Math.sin(this.time0 * 16)));
            g.lineBetween(b.x, b.y - 10, x2, y2);
          }
        }
      }
    }
    const vg = this.gfx;
    this.drawReload(dt);
    for (const v of this.visuals) {
      const k = 1 - v.t / v.dur;
      if (v.kind === 'slash') {
        const [x, y, a, r, half] = v.pts;
        const sweep = 1 - k;
        vg.lineStyle(Math.max(1, Math.round(4 * k)), 0xffffff, 0.95 * k);
        vg.beginPath();
        vg.arc(x, y, r * (0.8 + 0.2 * sweep), a - half, a - half + half * 2 * Math.min(1, sweep * 2.5));
        vg.strokePath();
        vg.lineStyle(1, v.color, 0.8 * k);
        vg.beginPath();
        vg.arc(x, y, r * 0.62, a - half * 0.8, a + half * 0.8);
        vg.strokePath();
      } else if (v.kind === 'beam') {
        vg.lineStyle(Math.max(1, v.width * 2 * k), v.color, 0.4 * k);
        this.strokePts(vg, v.pts);
        vg.lineStyle(Math.max(1, v.width * k), 0xffffff, 1);
        this.strokePts(vg, v.pts);
      } else {
        vg.lineStyle(v.width + 2, v.color, 0.6 * k);
        this.strokePts(vg, v.pts);
        vg.lineStyle(Math.max(1, v.width - 1), 0xffffff, k);
        this.strokePts(vg, v.pts);
      }
    }
  }

  /**
   * Over the knight's head while reloading: a spinning revolver cylinder whose six chambers fill as the
   * reload runs, each with a little bump. When it is done the cylinder pops and fades.
   */
  drawReload(dt: number) {
    const run = this.run;
    const p = this.player;
    const icon = this.reloadIcon;
    const held = run?.weapons[run.held];
    const reloading = !!held?.def.mag && (held.reloadT ?? 0) > 0 && this.mode === 'play';
    if (!reloading) {
      if (icon.visible && !this.reloadPopping) icon.setVisible(false);
      if (icon.visible) icon.setPosition(Math.round(p.x), Math.round(p.y - 29));
      return;
    }
    const k = 1 - held!.reloadT! / Math.max(0.01, reloadTime(held!, run.mods.reload));
    const n = Math.min(6, Math.floor(k * 7));
    if (!icon.visible || this.reloadPopping) {
      this.tweens.killTweensOf(icon);
      this.reloadPopping = false;
      this.reloadShown = -1;
      icon.setVisible(true).setAlpha(1).setScale(0);
      this.tweens.add({ targets: icon, scale: 1, duration: 140, ease: 'Back.easeOut' });
    }
    if (n !== this.reloadShown) {
      // Each round in: the cylinder clicks round a chamber (60 degrees) with a little bump.
      if (this.reloadShown >= 0 && n > this.reloadShown) {
        icon.setScale(1.3).setRotation(-Math.PI / 3);
        this.tweens.add({ targets: icon, scale: 1, rotation: 0, duration: 110, ease: 'Back.easeOut' });
        audio.reload(true);
      }
      this.reloadShown = n;
      icon.setTexture(`cyl-${n}`);
    }
    icon.setPosition(Math.round(p.x), Math.round(p.y - 29));
    void dt;
  }

  reloadDone() {
    const icon = this.reloadIcon;
    if (!icon.visible) return;
    this.reloadPopping = true;
    this.tweens.killTweensOf(icon);
    icon.setTexture('cyl-6').setRotation(0);
    this.tweens.add({
      targets: icon,
      scale: 1.8,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => {
        icon.setVisible(false).setAlpha(1).setScale(1);
        this.reloadPopping = false;
      },
    });
    this.fx.ring(icon.x, icon.y, 12, E.yellow, 220, 1);
  }

  /** Entrance tweens, driven per frame since the enemy loop repositions sprites every frame. */
  entrance(a: Enemy, sp: Img, dt: number) {
    const en = a.enter!;
    en.t += dt;
    const DUR = { rise: 0.2, drop: 0.24, emerge: 0.4 };
    const k = Math.min(1, en.t / DUR[en.kind]);
    if (en.kind === 'rise') {
      // Grows up out of the circle, overshooting a little.
      const s = k < 0.7 ? (k / 0.7) * 1.15 : 1.15 - ((k - 0.7) / 0.3) * 0.15;
      sp.setScale(a.scale * (1 - (1 - k) * 0.3), a.scale * s);
    } else if (en.kind === 'drop') {
      // Falls from above and squashes on landing.
      sp.y -= Math.round((1 - k) * (1 - k) * 48);
      sp.setAlpha(Math.min(1, k * 4));
      if (k >= 1 && !en.landed) {
        en.landed = true;
        this.fx.dust(a.x, a.y, 6);
        this.fx.shake(0.04);
      }
      if (k >= 1) sp.setScale(a.scale * 1.25, a.scale * 0.75);
    } else {
      // Steps out of the rift as a black silhouette, then takes its colours.
      sp.setScale(a.scale * (0.6 + 0.4 * k));
      if (k < 0.65) sp.setTintFill(hexToNum(E.ink));
      sp.setAlpha(Math.min(1, 0.3 + k));
    }
    const settle = en.kind === 'drop' ? 0.12 : 0;
    if (en.t >= DUR[en.kind] + settle) {
      a.enter = undefined;
      sp.setScale(a.scale).setAlpha(1);
    }
  }

  /** Summoning circles: rune ring, light pillar, dark rift, elite lightning, boss sigil. */
  drawSummon(g: Phaser.GameObjects.Graphics, t: Telegraph, k: number, danger: number) {
    const tier = t.tier ?? 1;
    const r = t.r ?? 8;
    const spin = this.time0 * (tier >= 5 ? 1.2 : 3);
    const grow = Math.min(1, k * 2.2);
    const ring = (rr: number, alpha: number, w = 1) => {
      g.lineStyle(w, danger, alpha);
      g.strokeCircle(t.x, t.y, rr);
    };
    const ticks = (rr: number, n: number, len: number, alpha: number, offset = 0) => {
      g.lineStyle(1, danger, alpha);
      for (let i = 0; i < n; i++) {
        const a = spin + offset + (i / n) * TAU;
        g.lineBetween(t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr * 0.6, t.x + Math.cos(a) * (rr + len), t.y + Math.sin(a) * (rr + len) * 0.6);
      }
    };
    if (tier === 3) {
      // A rift tears open in the floor.
      const rx = r * 1.3 * grow;
      g.fillStyle(hexToNum(E.ink), 0.85);
      g.fillEllipse(t.x, t.y, rx * 2, rx * 0.8);
      g.lineStyle(1, danger, 0.5 + 0.5 * k);
      g.strokeEllipse(t.x, t.y, rx * 2 + 2, rx * 0.8 + 2);
      for (let arm = 0; arm < 3; arm++) {
        g.lineStyle(1, danger, 0.7);
        g.beginPath();
        for (let i = 0; i <= 8; i++) {
          const q = i / 8;
          const a = -spin * 1.5 + arm * (TAU / 3) + q * 2.6;
          const rr = rx * (1 - q * 0.8);
          if (i === 0) g.moveTo(t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr * 0.4);
          else g.lineTo(t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr * 0.4);
        }
        g.strokePath();
      }
      return;
    }
    // Rune circle (all other tiers), squashed for the 3/4 view.
    g.lineStyle(1, danger, 0.4 + 0.5 * k);
    g.strokeEllipse(t.x, t.y, r * 2 * grow, r * 1.2 * grow);
    if (tier >= 2) g.strokeEllipse(t.x, t.y, r * 1.3 * grow, r * 0.78 * grow);
    ticks(r * grow * 0.8, tier >= 4 ? 8 : 4, 3, 0.7);
    g.fillStyle(danger, 0.15 + 0.35 * k);
    g.fillEllipse(t.x, t.y, r * 1.2 * k, r * 0.7 * k);
    if (tier >= 5) {
      // Boss sigil: a slow hexagram inside double rings.
      ring(r * grow, 0.6, 2);
      ring(r * 0.8 * grow, 0.4);
      g.lineStyle(1, danger, 0.7);
      for (const off of [0, Math.PI / 3]) {
        g.beginPath();
        for (let i = 0; i <= 3; i++) {
          const a = spin + off + (i / 3) * TAU;
          const px = t.x + Math.cos(a) * r * 0.78 * grow;
          const py = t.y + Math.sin(a) * r * 0.78 * grow * 0.6;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.strokePath();
      }
      ticks(r * grow, 24, 4, 0.5);
    }
    // Medium and up: a pillar of light comes down, and motes swirl in.
    if (tier >= 2) {
      const vg = this.gfx;
      const w = (tier >= 4 ? 6 : 3) + 4 * k;
      vg.fillStyle(danger, 0.12 + 0.25 * k);
      vg.fillRect(t.x - w / 2, t.y - 90, w, 90);
      vg.fillStyle(0xffffff, 0.15 + 0.3 * k);
      vg.fillRect(t.x - w / 6, t.y - 90, Math.max(1, w / 3), 90);
      for (let i = 0; i < 6; i++) {
        const a = spin * 1.4 + (i / 6) * TAU;
        const rr = (1 - k) * r * 2.6;
        vg.fillStyle(danger, 0.8);
        vg.fillRect(Math.round(t.x + Math.cos(a) * rr), Math.round(t.y - 6 + Math.sin(a) * rr * 0.6), 2, 2);
      }
    }
    // Elites call down three red bolts.
    if (tier === 4) {
      const due = Math.floor(k * 3.2);
      while ((t.strikes ?? 0) < Math.min(3, due)) {
        t.strikes = (t.strikes ?? 0) + 1;
        const pts = [t.x + rand(-8, 8), t.y - 120];
        for (let i = 1; i < 6; i++) pts.push(t.x + rand(-8, 8), t.y - 120 + (i * 120) / 6);
        pts.push(t.x, t.y);
        this.visuals.push({ kind: 'bolt', pts, width: 2, t: 0, dur: 0.14, color: danger });
        this.light.flash(t.x, t.y, 50, this.kit.palette.danger, 0.15);
        audio.shoot('chain');
      }
    }
  }

  strokePts(g: Phaser.GameObjects.Graphics, pts: number[]) {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.strokePath();
  }

  drawCursor() {
    const g = this.cursorGfx;
    g.clear();
    if (this.mode === 'title' || this.mode === 'end') return;
    const x = Math.round(this.aimX);
    const y = Math.round(this.aimY);
    const ink = hexToNum(E.ink);
    const w = hexToNum(E.white);
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      g.fillStyle(ink, 1);
      g.fillRect(x + dx * 3 - (dx ? 0 : 1), y + dy * 3 - (dy ? 0 : 1), dx ? dx * 4 : 3, dy ? dy * 4 : 3);
      g.fillStyle(w, 1);
      g.fillRect(x + dx * 3 + (dx < 0 ? -3 : 0), y + dy * 3 + (dy < 0 ? -3 : 0), dx ? 3 : 1, dy ? 3 : 1);
    }
    g.fillStyle(hexToNum(E.red), 1);
    g.fillRect(x, y, 1, 1);
  }
}
