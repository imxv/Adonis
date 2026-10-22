import Phaser from 'phaser';
import { TAU, angleDiff, clamp, dist, dist2, hexToNum, lerp, segCircle } from '../core/math';
import { Rng, rand } from '../core/rng';
import type { Element } from '../core/stats';
import { audio } from '../audio/audio';
import { ENEMIES, AFFIXES, PETS, PET_ORDER, SPAWN_STYLE, type Affix, type EnemyKind, type SpawnStyle } from '../data/enemies';
import { SPELLS, SPELL_ORDER } from '../data/spells';
import { UPGRADE_BY_ID } from '../data/upgrades';
import { MAX_WEAPONS, WEAPONS, WEAPON_ORDER, magSize, reloadTime, type MeleeMove, type MoveKind, type WeaponInstance } from '../data/weapons';
import { E } from '../pixel/palette';
import { K, buildCommonTextures, buildKitTextures, buildLevel, textTexture } from '../styles/textures';
import type { StyleKit } from '../styles/types';
import { decoArt } from '../pixel/decor';
import { ui } from '../ui/ui';
import { settings } from '../settings';
import { TouchControls } from '../input/touchControls';
import { DIRS, DIR_VEC } from './dirs';
import { bossDeath, spawnBoss, updateBoss } from './boss';
import { animateBoss } from './bossAnim';
import { dropLevelToken, packLevelTokens, updateLevelTokens, type LevelToken } from './levelTokens';
import { interactNearby, updateInteractionHints, updateNearbyWeaponPreview, resetWeaponPreview } from './interactions';
import { WEAPON_POWER } from './weaponMetrics';
import { HEROES, type HeroId } from '../data/heroes';
import { DIFFICULTIES, FLOOR_SCALING, HEART_DROPS, floorScale, type DifficultyId } from '../data/difficulty';
import { T, collide, generateDungeon, enhanceDungeon, openSpot, randomFloorIn, raycast, roomAt, roomCenter, solidAt, type DRoom, type Dungeon } from './dungeon';
import { updateEnemyAI } from './enemyAI';
import { FlowField } from './flow';
import { Rhythm, type Grade } from './rhythm';
import { playerName, setPlayerName, submitGlobal, type RunEntry } from '../net/board';
import {
  ELEMENT_COLOR,
  freshStatus,
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
import { ELEMENTS, SHIELD_COUNTER, STYLE_ELEMENT, clearCores, markAura, react, shatter, tintShield, updateCores, type Core } from './elements';
import { Lighting } from './lighting';
import { destroyPets, resetPets, syncPets, updatePets } from './pets';
import { tryAscend } from './ascension';
import { AscensionFx } from './ascensionFx';
import { LEVELS, applyChoice, applyFusion, choiceValid, fusionsReady, newRun, restoreRun, rollChestChoices, rollChoices, snapshotRun, spellTaken, xpForLevel, type Choice, type RunState } from './run';
import type { FusionId } from '../data/spells';
import { addScore, clearRun, loadRun, saveRun, scoreOf, type SavedRun } from '../save';
import { buildCodex } from '../ui/codex';
import { clearSpellVisuals, updateSpells, zap } from './spells';
import { destroyTraps, populateTraps, settleTraps, updateTraps, grounded, type Trap } from './traps';
import { currentPush, destroyCurrents, populateCurrents, updateCurrents, type Current } from './currents';
import { challengeProgress, destroyChallenges, finishChallenge, populateChallenges, updateChallenge, type Challenge } from './challenge';
export type { Trap } from './traps';

type Mode = 'title' | 'play' | 'choose' | 'pause' | 'ascend' | 'transition' | 'dead' | 'end';

const CRYSTAL_RULES = { dropCooldown: 3, maxOnGround: 3, lifetime: 12, collectCooldown: 2, fadeTime: 2, armor: 1 } as const;

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

/** How strong each enemy's summon looks: weak ones rise from a rune, strong ones step out of a rift. */
const SPAWN_TIER: Record<EnemyKind, 1 | 2 | 3> = { wanderer: 1, bat: 1, charger: 2, shooter: 2, bomber: 2, shield: 3, brute: 3, sporeling: 1, yeti: 3, scorpion: 2, magma: 2, turret: 2, ghost: 2, ninja: 2, angel: 3, jelly: 2, drone: 1 };

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
  currents: Current[] = [];
  challenges: Challenge[] = [];
  activeChallenge?: Challenge;
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
  /** The hero's sprite key prefix (adonis, knight). */
  heroTex = 'adonis';
  /** While a guardian is acting, the texture its small shots take (its style's own shape). */
  bossShot?: string;
  /** Bullet time: time sinks to `low` fast, holds, then eases back to full speed. */
  bt?: { t: number; low: number; hold: number; out: number };
  /** Somewhere the camera leans toward for a moment (a fallen boss). */
  camFocus?: { x: number; y: number; t: number };
  /** Level-up crystals waiting on the floor, and the ones carried down from the floor above. */
  levelTokens: LevelToken[] = [];
  carryTokens: number[] = [];
  /** Scene-owned world-time deadlines; training cannot spend the live run's allowance. */
  private nextCrystalDropAt = 0;
  private nextCrystalCollectAt = 0;
  /** Floor dangers left by bosses (lava pools): hurt the knight while it stands in them. */
  ehazards: { x: number; y: number; r: number; t: number; color: number }[] = [];
  /** Dendro Cores grown by Bloom, waiting to burst. */
  cores: Core[] = [];
  /** A horde room's altar, waiting for the player to step on it. */
  altar?: { room: DRoom; parts: Img[]; started: boolean };
  /** How the fight in the current room went, for the clear banner. */
  private fightStats = { t0: 0, kills: 0, combo: 0 };
  /** A fusion is playing out: the knight cannot be hurt, and level-ups and the pause menu wait for it. */
  fusing = false;
  private ascensionFx?: AscensionFx;
  private ascensionClock?: { timer: number; tween: number };
  /** The beat game: timing against the music, the on-beat streak, the style rank. */
  rhythm = new Rhythm();
  /** A judged melee press: the swing that follows within a few frames carries its grade. */
  private beatShot: { grade: Grade; until: number } = { grade: 'miss', until: 0 };
  /** Where the melee combo is: the next move, when the last swing was, and the move being animated. */
  private melee = { step: 0, last: -9, anim: undefined as undefined | { move: MoveKind; t: number; dur: number; dir: number; hand: number } };
  /** Extra damage for the swing being made right now, and its beat grade. */
  private shotBoost = 1;
  private swingGrade: Grade | undefined;
  /** The element the melee weapon in hand carries, if any. */
  private swingElement: Element | undefined;
  /** Casings in the air right now; a gatling would bury the floor otherwise. */
  private casings = 0;
  /** When the dash key went down, to judge it against the beat. */
  private dashPressAt = 0;
  private lastRank = 0;
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
  private touch?: TouchControls;
  time0 = 0;
  aimX = 0;
  aimY = 0;

  constructor(key = 'game') {
    super(key);
  }

  /** Reset presentation state when an isolated training scene changes the demonstrated weapon. */
  protected resetWeaponRuntime() {
    this.melee = { step: 0, last: -9, anim: undefined };
    this.casings = 0;
    this.shotBoost = 1;
    this.swingGrade = undefined;
    this.swingElement = undefined;
    this.beatShot = { grade: 'miss', until: 0 };
    this.reloadShown = -1;
    this.reloadPopping = false;
    this.swapT = 0;
  }

  create() {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.resetAscension();
      this.ascensionFx?.destroy();
      this.ascensionFx = undefined;
      destroyPets(this);
      resetWeaponPreview(this);
      this.touch?.destroy();
      this.touch = undefined;
    });
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
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,ESC,F,G,SHIFT,Q,E') as Record<string, Phaser.Input.Keyboard.Key>;
    // Esc only opens the pause page; once it is up, the page handles Esc itself.
    kb.on('keydown-ESC', () => {
      if (this.mode === 'play' && performance.now() - ui.closedAt > 250) this.openPause();
    });
    kb.on('keydown-F', (e: KeyboardEvent) => {
      if (!e.repeat) interactNearby(this);
    });
    kb.on('keydown-G', (e: KeyboardEvent) => {
      if (e.repeat || this.mode !== 'play') return;
      this.autoFire = !this.autoFire;
      if (this.autoFire) resetWeaponPreview(this);
      ui.toast(this.autoFire ? '自动射击 开' : '自动射击 关', 900);
    });
    kb.on('keydown-Q', () => this.switchGun());
    kb.on('keydown-R', () => {
      if (this.mode === 'play') this.startReload(this.run.weapons[this.run.held]);
    });
    kb.on('keydown-E', (e: KeyboardEvent) => this.useSkill(e.timeStamp));
    kb.on('keydown-SPACE', (e: KeyboardEvent) => (this.dashPressAt = e.timeStamp));
    kb.on('keydown-SHIFT', (e: KeyboardEvent) => (this.dashPressAt = e.timeStamp));
    this.input.on('pointermove', () => {
      if (!this.usesTouchControls()) this.pointerMoved = true;
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.usesTouchControls()) return;
      this.pointerMoved = true;
      if (this.mode === 'play') resetWeaponPreview(this);
      const at = p.event?.timeStamp ?? performance.now();
      if (p.rightButtonDown()) this.useSkill(at);
      else if (p.leftButtonDown()) this.attackPressed(at);
    });
    this.input.on('wheel', () => this.switchGun());
    this.god = this.params.has('god');
    ui.mount(this.game.canvas, this.game);
    this.touch = new TouchControls();
    const pauseTouch = () => {
      this.touch?.reset();
      if (this.usesTouchControls() && this.mode === 'play' && !this.fusing) this.openPause();
    };
    const hidden = () => { if (document.hidden) pauseTouch(); };
    window.addEventListener('blur', pauseTouch);
    document.addEventListener('visibilitychange', hidden);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('blur', pauseTouch);
      document.removeEventListener('visibilitychange', hidden);
    });
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
    audio.playHome();
    ui.title({
      save: () => loadRun(),
      initialDifficulty: () => DIFFICULTIES[this.params.get('diff') as DifficultyId]?.id ?? settings.get().diff,
      onContinue: () => {
        const saved = loadRun();
        if (!saved) return this.showTitle();
        void audio.init();
        this.startRun(saved);
      },
      onNew: (hero, difficulty) => {
        void audio.init();
        this.startRun(undefined, hero, difficulty);
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
    if (this.sys.settings.key !== 'game' || !run || !d || this.mode === 'dead' || this.mode === 'end' || this.mode === 'title') return;
    saveRun({
      v: 1,
      savedAt: Date.now(),
      ...snapshotRun(run),
      groundWeapons: this.pickups.filter((p) => p.kind === 'weapon' && !p.dead && p.weapon).map((p) => {
        const w = p.weapon!;
        return { x: p.x, y: p.y, id: w.def.id, cd: w.cd, ammo: w.ammo, reloadT: w.reloadT, spin: w.spin, onChest: !!p.chest };
      }),
      rooms: d.rooms.map((r) => ({ id: r.id, cleared: r.cleared, visited: r.visited, seen: r.seen, challenge: challengeProgress(this, r) })),
      at: (this.safeRoom ?? d.start).id,
    });
  }

  /** A finished run goes on the local leaderboard and its save is removed. */
  recordRun(victory: boolean) {
    clearRun();
    const run = this.run;
    const date = Date.now();
    const base = { victory, floor: run.level + 1, kills: run.kills, lv: run.xpLevel, secs: Math.round(run.elapsed), diff: run.diff.id };
    const score = scoreOf(base, run.score);
    const peak = this.rhythm.peakRank();
    const rank = addScore({ ...base, score, date, rank: peak });
    // The global board hears about it once the end screen is up.
    const entry: RunEntry = { ...base, score, rank: peak, weapon: run.weapons[run.held]?.def.id ?? '' };
    this.time.delayedCall(1700, () => this.submitOnline(entry));
    return { score, rank, date };
  }

  /** Send a finished run to the global board: at once if the player has signed a name, else once they type one. */
  submitOnline(entry: RunEntry) {
    const send = () => {
      ui.endOnline('sending');
      submitGlobal(entry).then((r) => ui.endOnline(r ? { rank: r.rank ?? 0, runs: r.runs } : 'offline'));
    };
    if (playerName()) send();
    else
      ui.askName((name) => {
        setPlayerName(name);
        send();
      });
  }

  openPause() {
    if (this.fusing || this.mode !== 'play') return;
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

  startRun(saved?: SavedRun, hero?: HeroId, difficulty?: DifficultyId) {
    this.touch?.reset();
    ui.resetDamageFeedback();
    this.clearLevel();
    destroyPets(this);
    if (!saved) this.resetCrystalRuntime();
    this.run = saved ? restoreRun(saved) : newRun(this.params, hero, difficulty);
    this.heroTex = this.run.ascended ? 'jesus' : HEROES[this.run.hero].tex;
    this.combo = 0;
    this.carryTokens = [];
    this.fusing = false;
    this.rhythm.reset();
    this.lastRank = 0;
    this.autoFire = false;
    this.safeRoom = undefined;
    if (this.player) {
      this.player.sprite.setVisible(true).setTexture(`${this.heroTex}-a`);
      this.player.gun.setVisible(true);
      this.player.iframes = 1;
    }
    this.enterLevel(true, saved);
  }

  clearLevel() {
    this.resetAscension();
    resetWeaponPreview(this);
    resetPets(this);
    this.carryTokens.push(...packLevelTokens(this));
    for (const e of this.enemies) this.destroyEnemy(e);
    this.enemies = [];
    for (const p of [...this.pproj, ...this.eproj]) this.killProj(p, true);
    this.pproj = [];
    this.eproj = [];
    for (const p of this.pickups) this.removePickup(p);
    this.pickups = [];
    this.obstacles.forEach((o) => o.sprite.destroy());
    this.obstacles = [];
    this.decor.forEach((s) => s.destroy());
    this.decor = [];
    this.altar?.parts.forEach((o) => o.destroy());
    this.altar = undefined;
    clearCores(this);
    this.ehazards = [];
    this.light.darkT = 0;
    this.hazards = [];
    this.telegraphs = [];
    this.visuals = [];
    this.pedestals.forEach((p) => [p.ped, p.item, p.glow, p.label].forEach((o) => o.destroy()));
    this.pedestals = [];
    this.gates.forEach((g) => g.destroy());
    this.gates = [];
    destroyTraps(this);
    destroyCurrents(this);
    destroyChallenges(this);
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
    if (this.run.dungeonVersion === 2) enhanceDungeon(d, seed, this.run.level, kit.id);
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
    resetPets(this, true);
    this.room = startRoom;
    startRoom.visited = true;
    this.markSeen(startRoom);
    this.light.setLevel(kit, d, seed);
    this.dressLevel(kit, d);
    this.populate(new Rng(seed + 1));
    populateChallenges(this, saved);
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
    this.player.sprite.setTexture(`${this.heroTex}-a`);
    if (this.run.ascended) (this.ascensionFx ??= new AscensionFx(this)).syncAura(true);
    ui.showHud(true);
    ui.banner(`第${['一', '二', '三', '四'][this.run.level]}层`, kit.name, kit.en, kit.subtitle, first ? 2400 : 2200);
    if (!first) cam.fadeIn(420, 255, 255, 255);
    if (saved && d.boss.cleared) this.spawnTrapdoor(...roomCenter(d.boss));
    if (saved) this.time.delayedCall(800, () => this.checkFusions());
    // Crystals carried down the trapdoor land beside the knight.
    const carried = this.carryTokens.splice(0);
    carried.forEach((lv, i) => this.time.delayedCall(700 + i * 150, () => dropLevelToken(this, lv, i, carried.length)));
    if (saved && saved.level === this.run.level) {
      for (const weapon of saved.groundWeapons ?? []) {
        const { x, y, id, onChest, ...state } = weapon;
        if (WEAPONS[id] && Number.isFinite(x) && Number.isFinite(y)) {
          this.dropWeapon({ ...state, def: WEAPONS[id] }, x, y, !!onChest, false);
        }
      }
    }
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
          this.worldText(cx, cy - 40, this.usesTouchControls() ? '左摇杆移动  右摇杆射击' : 'WASD 移动  鼠标射击', E.grey);
          this.worldText(cx, cy - 26, this.usesTouchControls() ? '点按钮冲刺、交互和换枪' : '空格/Shift冲刺  Q换枪  E双持', E.grey);
          this.worldText(cx, cy - 12, this.usesTouchControls() ? '双持、换弹也可点按钮' : 'F 交互  G 自动射击', E.grey);
        }
        continue;
      }
      for (const p of r.props) this.addObstacle(p.kind, p.x, p.y);
      populateTraps(this, r);
      populateCurrents(this, r);
    }
    void rng;
  }

  updateTraps(dt: number) {
    updateTraps(this, dt);
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
        // Two visual variants share each original solid tile without changing the route or RNG.
        const alternate = ((Math.imul(p.x, 73856093) ^ Math.imul(p.y, 19349663) ^ r.seed) >>> 8) % 2;
        const extra = kit.id === 'forest' ? [3, 5, 4][p.v] : p.v + 3;
        const variant = alternate && extra < arts.length ? extra : p.v;
        this.decor.push(this.add.image(x, y, K(`deco-${variant}`, kit)).setOrigin(0.5, 1).setDepth(DEPTH.obstacle));
        const l = arts[variant].light;
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
    const key = K(kind === 'pillar' ? 'pillar' : `prop-${kind}`, this.kit);
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
      if (here.cleared || here.type === 'start' || here.type === 'treasure' || here.type === 'challenge') this.safeRoom = here;
      if (!here.visited) {
        here.visited = true;
        this.markSeen(here);
        if (here.type === 'challenge' && !here.cleared) ui.toast('可选试炼：靠近祭台交互开始；受击失败，每房一次', 2300);
        if (here.type === 'treasure') {
          this.spawnPedestals(here);
          ui.toast('宝物房 三选一', 1200);
        }
      }
    }
    // Two tiles past the doorway of an uncleared fighting room, the gates slam shut.
    // A horde waits until the player steps on its altar: they choose when the survival run starts.
    if (!this.active && here && !here.cleared && (here.type === 'combat' || here.type === 'horde' || here.type === 'boss') && roomAt(d, p.x, p.y, 2) === here) {
      if (here.type === 'horde') this.hordeAltar(here);
      else this.activate(here);
    }
  }

  /** The horde room's altar: shown on entry, and a three-beat countdown once the knight stands on it. */
  hordeAltar(r: DRoom) {
    const [cx, cy] = roomCenter(r);
    if (!this.altar || this.altar.room !== r) {
      this.altar?.parts.forEach((o) => o.destroy());
      const img = this.add.image(cx, cy, 'altar').setDepth(DEPTH.decal + 0.7);
      const glow = this.add.image(cx, cy - 2, 'glow').setDepth(DEPTH.decal + 0.6).setTint(hexToNum(E.red)).setScale(2.4).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD);
      const label = this.add.image(cx, cy + 18, textTexture(this, '踏上祭坛 开始尸潮挑战', { color: E.yellow, outline: E.ink })).setDepth(DEPTH.numbers - 0.5);
      this.tweens.add({ targets: glow, alpha: 0.15, duration: 700, yoyo: true, repeat: -1 });
      this.tweens.add({ targets: label, y: cy + 16, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.light.addStatic(cx, cy, 50, E.red);
      this.altar = { room: r, parts: [img, glow, label], started: false };
      ui.toast('尸潮房：准备好了就踏上祭坛', 1600);
    }
    if (this.altar.started || dist2(this.player.x, this.player.y, cx, cy) > 12 * 12) return;
    this.altar.started = true;
    const parts = this.altar.parts;
    audio.roar();
    this.fx.ring(cx, cy, 60, E.red, 500, 2);
    this.fx.shake(0.1);
    ['3', '2', '1'].forEach((n, i) => this.time.delayedCall(i * 600, () => {
      this.fx.callout(cx, cy - 26, n, E.hot, true);
      audio.beatHit(i === 2);
    }));
    this.time.delayedCall(1800, () => {
      // Walked off before the count ended: the altar waits for another go.
      if (!this.altar || roomAt(this.dungeon, this.player.x, this.player.y, 1) !== r) {
        if (this.altar) this.altar.started = false;
        return;
      }
      parts.forEach((o) => o.destroy());
      this.altar = undefined;
      this.fx.callout(cx, cy - 26, '坚持住！', E.yellow, true);
      this.activate(r);
    });
  }

  activate(r: DRoom) {
    resetWeaponPreview(this);
    this.active = r;
    this.rhythm.startFight();
    this.fightStats = { t0: this.time0, kills: 0, combo: 0 };
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
    return (Object.keys(ENEMIES) as EnemyKind[]).filter((k) => {
      const d = ENEMIES[k];
      if (d.biome) return d.biome === this.kit.id;
      return d.minLevel <= this.run.level || (depth >= 3 && d.minLevel <= this.run.level + 1);
    });
  }

  /** Fewer, meaner enemies: a closer camera needs breathing room. */
  planWaves(rng: Rng) {
    const level = this.run.level;
    const depth = Math.min(this.active!.depth, 5);
    // Rooms fill up the deeper you go: about half again as many as the first cut, and a third wave sooner.
    const budget = (9 + level * 5 + depth * 1.5) * this.run.diff.enemies;
    const waveCount = depth >= 3 || level >= 2 ? 3 : 2;
    const kinds = this.enemyKinds();
    let elites = rng.chance(0.12 + level * (0.1 + FLOOR_SCALING.elites) + depth * 0.03) ? 1 : 0;
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

  blinkSpot(e: Enemy): [number, number] | undefined {
    const p = this.player;
    const r = this.active;
    if (!r) return undefined;
    for (let i = 0; i < 8; i++) {
      const a = rand(0, TAU);
      const d = rand(55, 80);
      const [x, y] = openSpot(this.dungeon, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 2);
      if (roomAt(this.dungeon, x, y, 0) === r && dist2(x, y, p.x, p.y) > 40 * 40 && dist2(x, y, e.x, e.y) > 20 * 20) return [x, y];
    }
    return undefined;
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
    const style = elite ? undefined : SPAWN_STYLE[kind];
    const color = hexToNum(kind === 'wanderer' ? this.kit.px.slime : kind === 'magma' ? E.orange : this.kit.palette.danger);
    this.telegraphs.push({
      kind: 'spawn',
      x,
      y,
      r: tier >= 4 ? 14 : tier === 3 ? 11 : tier === 2 ? 10 : 8,
      t: 0,
      dur: delay * [0.9, 1.05, 1.3, 1.6][tier - 1],
      tier,
      style,
      color,
      onDone: () => {
        this.pendingSpawns--;
        if (this.mode === 'dead' || this.mode === 'end' || !this.active) return;
        const e = this.spawnEnemy(kind, x, y, elite, mini);
        this.arrive(e, tier, style);
      },
    });
  }

  /** The moment a summoned enemy appears: each kind arrives its own way, with its own sound. */
  arrive(e: Enemy, tier: number, style?: SpawnStyle) {
    const danger = this.kit.palette.danger;
    if (style && style !== 'portal') {
      e.enter = { kind: style, t: 0 };
      audio.spawn(style);
      switch (style) {
        case 'ooze':
          this.fx.dust(e.x, e.y, 3);
          break;
        case 'burrow':
          this.fx.dust(e.x, e.y, 9);
          this.fx.ring(e.x, e.y, 12, E.tan, 200, 1);
          break;
        case 'smoke':
          this.fx.dust(e.x, e.y - 4, 14);
          this.fx.ring(e.x, e.y - 4, 16, E.white, 220, 1);
          break;
        case 'bones':
          this.fx.sparks(e.x, e.y - 6, 8, 'white');
          break;
        case 'beam':
          this.light.flash(e.x, e.y - 6, 70, E.yellow, 0.35);
          this.fx.sparks(e.x, e.y - 6, 10, 'gold');
          break;
        case 'roll':
          e.enter.ox = Math.random() < 0.5 ? -42 : 42;
          break;
      }
      return;
    }
    if (style === 'portal') audio.spawn('portal');
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
    // Monsters toughen with the floor and with the knight's own growth, so a stack of level-ups never turns a room
    // into something the spells clear on their own.
    const growth = 1 + 0.015 * Math.max(0, this.run.xpLevel - 5);
    const scaleHp = (1.65 + level * 1.05 + depth * 0.12) * growth * (mini ? 0.5 : 1) * this.run.diff.hp * floorScale(FLOOR_SCALING.hp, level);
    const affix: Affix | undefined = elite ? rng.pick(Object.keys(AFFIXES) as Affix[]) : undefined;
    // Elites take x4: with the sturdier base that is what they had before, so only the rank and file got tougher.
    const hp = def.hp * scaleHp * (elite ? 4 : 1) * (affix === 'tough' ? 1.4 : 1);
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
      speed: def.speed * (affix === 'swift' ? 1.4 : 1) * (mini ? 1.2 : 1) * (1 + level * 0.07),
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
      status: freshStatus(),
      sprite,
      shadow,
      mini,
    };
    if (kind === 'shield') e.extra = this.add.image(x, y, K('shield', this.kit)).setDepth(DEPTH.enemy + 0.1);
    // Monsters of an elemental style carry its element: always the local monster and elites, often the rest.
    const styleEl = STYLE_ELEMENT[this.kit.id];
    if (styleEl && (def.biome || elite || rng.chance(0.6))) {
      e.infused = styleEl;
      if (styleEl !== 'wind' && styleEl !== 'rock') {
        e.status.aura = styleEl;
        e.status.auraT = 99;
      }
    }
    if (elite) {
      e.ring = this.add.image(x, y, 'glow').setDepth(DEPTH.shadow).setTint(hexToNum(this.kit.palette.danger)).setScale(e.r / 6).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
      this.fx.callout(x, y - 22, AFFIXES[affix!], this.kit.palette.danger);
      // An elemental shield, like Genshin's Abyss Mages: the style's element, or any shieldable one in a plain style.
      const shieldable = Object.keys(SHIELD_COUNTER) as Element[];
      const sel = styleEl && SHIELD_COUNTER[styleEl] ? styleEl : rng.pick(shieldable);
      e.eshield = { el: sel, hp: hp * 0.35, max: hp * 0.35 };
      tintShield(e, this.kit.palette.danger);
    }
    this.enemies.push(e);
    return e;
  }

  destroyEnemy(e: Enemy) {
    e.auraImg?.destroy();
    e.sprite.destroy();
    e.shadow.destroy();
    e.extra?.destroy();
    e.ring?.destroy();
  }

  updateRoom(dt: number) {
    const r = this.active;
    if (!r || this.mode !== 'play') return;
    // Once nothing more is coming, a straggler outside the locked room (spawned in a corridor, pushed through a gap)
    // can never be reached and would keep the gates shut forever: it fades away instead.
    const lastWave = (r.type === 'combat' && this.waveIdx === this.waves.length - 1) || (r.type === 'horde' && this.hordeT >= this.hordeDur);
    if (lastWave && this.pendingSpawns === 0) {
      for (const e of this.enemies) {
        if (e.dead || e.boss || e.enter || roomAt(this.dungeon, e.x, e.y, 1) === r) continue;
        e.strayT = (e.strayT ?? 0) + dt;
        if (e.strayT > 2) {
          this.fx.dust(e.x, e.y, 6);
          this.killEnemy(e, '迷途');
        }
      }
    }
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
            this.spawnT = lerp(1.3, 0.7, k) / (1 + this.run.level * 0.15) / this.run.diff.enemies;
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
    settleTraps(this, r);
    this.active = undefined;
    this.pendingSpawns = 0;
    const grade = this.rhythm.gradeFight();
    this.run.score += grade.points;
    // The room falls quiet: a beat of slow motion, a flash, a ring of gold, a fanfare and the clear banner.
    const p = this.player;
    if (bossDown) this.bulletTime(0.1, 1.5, 1.0);
    else this.bulletTime(0.18, 0.6, 0.55);
    this.fx.implode(p.x, p.y - 6, 150, E.white, 380, 1);
    this.fx.flash(E.white, 0.22, 320);
    this.fx.ring(p.x, p.y - 6, 110, E.yellow, 650, 2);
    this.fx.ring(p.x, p.y - 6, 60, E.white, 420, 1);
    this.fx.sparks(p.x, p.y - 6, 22, 'gold');
    this.light.flash(p.x, p.y - 6, 160, E.yellow, 0.35);
    audio.clear();
    ui.roomClear({ rank: grade.rank, points: grade.points, secs: this.time0 - this.fightStats.t0, kills: this.fightStats.kills, combo: this.fightStats.combo, boss: bossDown });
    audio.stamp(['D', 'C', 'B', 'A', 'S', 'SS'].indexOf(grade.rank));
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
      // A horde always leaves a reward chest; a weapon chest only half the time.
      const weapon = this.run.rng.next() < 0.5;
      this.dropChest(weapon ? cx - 14 : cx, cy);
      if (weapon) this.dropChest(cx + 14, cy, true);
    } else {
      // Weapon chests stay occasional, so a run settles on a gun instead of swapping every room.
      const x = this.run.rng.next();
      if (x < 0.15) this.dropChest(cx, cy, true);
      else if (x < 0.3) this.dropChest(cx, cy);
      else if (x < 0.3 + HEART_DROPS.roomClear) this.dropHeart(cx, cy);
    }
  }

  // ---------------------------------------------------------------- update

  /** All species, once per run. Called after reward callbacks have returned to play. */
  private beginAscension() {
    this.mode = 'ascend';
    this.touch?.reset();
    resetWeaponPreview(this);
    this.player.vx = this.player.vy = 0;
    this.player.dashT = 0;
    this.player.sprite.setAlpha(1);
    this.player.gun.setVisible(false);
    this.player.gun2.setVisible(false);
    this.reloadIcon.setVisible(false);
    this.ascensionClock = { timer: this.time.timeScale, tween: this.tweens.timeScale };
    this.time.timeScale = this.tweens.timeScale = 0;
    (this.ascensionFx ??= new AscensionFx(this)).start();
    ui.ascension(true);
    audio.rankUp(5);
    this.saveProgress();
  }

  private resetAscension() {
    if (this.ascensionClock) {
      this.time.timeScale = this.ascensionClock.timer;
      this.tweens.timeScale = this.ascensionClock.tween;
      this.ascensionClock = undefined;
    }
    this.ascensionFx?.reset();
    ui.ascension(false);
  }

  private updateAscension(dt: number) {
    const effect = this.ascensionFx!;
    const finished = effect.update(dt);
    if (effect.revealed && this.heroTex !== 'jesus') {
      this.heroTex = 'jesus';
      this.player.sprite.setTexture('jesus-a');
      ui.ascension(true, true);
      audio.rankUp(6);
    }
    this.light.update(this, 0);
    this.hudTick(dt);
    if (!finished) return;
    this.resetAscension();
    effect.syncAura(true);
    this.mode = 'play';
    this.player.iframes = Math.max(this.player.iframes, 1.2);
    this.player.gun.setVisible(true);
    this.drawWorld(0);
    ui.toast('神迹觉醒：耶稣 · 众生皆在庇护之下', 2200);
    this.checkFusions();
  }

  update(_t: number, dms: number) {
    this.touch?.setPlaying(this.mode === 'play' && !this.fusing && !document.hidden);
    const realDt = Math.min(dms, 50) / 1000;
    this.fx.update(realDt * this.slowScale);
    if (!this.kit || !this.player) return;
    if (this.mode === 'play' && !this.fusing && tryAscend(this.run)) this.beginAscension();
    if (this.mode === 'ascend') {
      this.updateAscension(realDt);
      return;
    }
    this.ascensionFx?.syncAura(this.run.ascended && this.mode !== 'title' && this.mode !== 'end' && this.mode !== 'dead');
    this.ascensionFx?.updateAura(realDt);
    this.updateTouchActions();
    if (this.usesTouchControls()) {
      this.aimX = this.player.x + this.touch!.aim.x * 90;
      this.aimY = this.player.y - 4 + this.touch!.aim.y * 90;
    } else {
      const ptr = this.input.activePointer;
      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      this.aimX = wp.x;
      this.aimY = wp.y;
    }
    this.drawCursor();
    if (this.mode === 'title' || this.mode === 'pause' || this.mode === 'choose' || this.mode === 'end') {
      resetWeaponPreview(this);
      this.light.update(this, 0);
      this.hudTick(realDt);
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      return;
    }
    if (this.bt) {
      const b = this.bt;
      b.t += realDt;
      const IN = 0.1;
      if (b.t < IN) this.slowScale = 1 - (1 - b.low) * (b.t / IN);
      else if (b.t < IN + b.hold) this.slowScale = b.low;
      else {
        const u = Math.min(1, (b.t - IN - b.hold) / b.out);
        this.slowScale = b.low + (1 - b.low) * u * u * (3 - 2 * u);
      }
      if (b.t >= IN + b.hold + b.out) {
        this.bt = undefined;
        this.slowScale = 1;
      }
    } else if (this.slowT > 0) {
      this.slowT -= realDt;
      if (this.slowT <= 0) this.slowScale = 1;
    }
    // Everything in the world keeps the same clock: tweens, timers and particles slow down with it.
    this.tweens.timeScale = this.slowScale;
    this.time.timeScale = this.slowScale;
    this.fx.setTimeScale(this.slowScale);
    const dt = realDt * this.slowScale;
    this.time0 += dt;
    if (this.mode === 'play') this.run.elapsed += realDt;
    // The clock runs whenever enemies move, so their on-beat attacks never see a stale beat.
    this.rhythm.update(realDt, this.kit.audio.bpm);
    if (this.mode === 'play') {
      ui.beatFrame(this.rhythm.beat, this.rhythm.phase, !!this.active, this.rhythm.streak, this.meleeHeld());
      const rank = this.rhythm.rankIndex();
      if (rank > this.lastRank) {
        audio.rankUp(rank);
        ui.rankUp();
      }
      this.lastRank = rank;
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
    updateLevelTokens(this, dt);
    updateInteractionHints(this);
    this.updateHazards(dt);
    updateCores(this, dt);
    for (const h of this.ehazards) {
      h.t -= dt;
      if (this.mode === 'play' && dist2(this.player.x, this.player.y, h.x, h.y) < h.r * h.r) this.hurtPlayer(1, h.x, h.y);
    }
    this.ehazards = this.ehazards.filter((h) => h.t > 0);
    this.updateTraps(dt);
    updateCurrents(this);
    updateChallenge(this, dt);
    this.updateTelegraphs(dt);
    if (this.mode === 'play') this.updateRoom(dt);
    this.comboT -= dt;
    if (this.comboT <= 0 && this.combo > 0) this.combo = 0;
    if (this.comboT < -2) this.run.frenzyStacks = Math.max(0, this.run.frenzyStacks - dt * 4);
    this.gemT -= dt;
    if (this.gemT <= 0) this.gemStreak = 0;
    this.updateCamera(realDt);
    this.drawWorld(dt);
    updateNearbyWeaponPreview(this, realDt);
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
    if (!this.usesTouchControls() && this.pointerMoved && this.mode === 'play' && settings.get().lean) {
      nx = clamp((ptr.x - cam.width / 2) / (cam.width / 2), -1, 1);
      ny = clamp((ptr.y - cam.height / 2) / (cam.height / 2), -1, 1);
    }
    let fx = p.x + nx * LEAN_X;
    let fy = p.y - 6 + ny * LEAN_Y;
    const cf = this.camFocus;
    if (cf) {
      cf.t -= dt;
      if (cf.t <= 0) this.camFocus = undefined;
      else {
        const w = Math.min(1, cf.t * 2) * 0.65;
        fx += (cf.x - fx) * w;
        fy += (cf.y - fy) * w;
      }
    }
    const f = 1 - Math.exp(-dt * 7);
    this.camX += (fx - this.camX) * f;
    this.camY += (fy - this.camY) * f;
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
        return { id: w.def.id, name: w.def.name, held: i === run.held, kind: w.def.kind, mag: mag || undefined, ammo: w.ammo, reload: (w.reloadT ?? 0) > 0 && rt > 0 ? 1 - w.reloadT! / rt : undefined };
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
      rank: this.rhythm.rank(),
      gauge: this.rhythm.gauge(),
      score: run.score,
      map: this.dungeon.rooms.map((r) => ({ gx: r.gx, gy: r.gy, type: r.type, visited: r.visited, seen: r.seen, cleared: r.cleared, current: r === this.room, doors: r.doors })),
      boss: b ? { name: b.boss!.name, ratio: Math.max(0, b.hp / b.maxHp), phaseMark: b.kind === 'boar' ? 0.5 : 0.55 } : undefined,
    });
  }

  stop(sec: number) {
    this.hitstop = Math.max(this.hitstop, sec);
  }

  slow(scale: number, sec: number) {
    this.bt = undefined;
    this.slowScale = scale;
    this.slowT = sec;
  }

  /**
   * The settling moment after a won fight: time drops to `low` within a tenth of a second, hangs there for `hold`,
   * then eases back over `out`. Bars close in, the world drains of colour and the music sinks, while the clear
   * banner plays at full speed on top of it.
   */
  bulletTime(low: number, hold: number, out: number) {
    this.slowT = 0;
    this.bt = { t: 0, low, hold, out };
    audio.slowmo(hold, out);
    ui.cinema((0.1 + hold + out * 0.6) * 1000);
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

  usesTouchControls() {
    return !!this.touch?.enabled;
  }

  /** Shared by combat and the nearby-weapon preview; touch never masquerades as a mouse press. */
  isFiring() {
    return (!this.usesTouchControls() && this.input.activePointer.leftButtonDown()) || !!this.touch?.firing || this.autoFire;
  }

  private attackPressed(at: number) {
    if (this.mode !== 'play') return;
    resetWeaponPreview(this);
    if (this.meleeHeld()) {
      const g = this.beatAct(at);
      this.beatShot = { grade: g, until: performance.now() + 160 };
    }
  }

  private updateTouchActions() {
    const touch = this.touch;
    if (!touch?.enabled || this.mode !== 'play' || this.fusing) return;
    if (touch.consume('pause') !== undefined && performance.now() - ui.closedAt > 250) {
      this.openPause();
      touch.setPlaying(false);
      return;
    }
    if (touch.consume('swap') !== undefined) this.switchGun();
    if (touch.consume('reload') !== undefined) this.startReload(this.run.weapons[this.run.held]);
    const skillAt = touch.consume('skill');
    if (skillAt !== undefined) this.useSkill(skillAt);
    const attackAt = touch.consume('attack');
    if (attackAt !== undefined) this.attackPressed(attackAt);
    if (touch.consume('interact') !== undefined) interactNearby(this);
    if (this.mode !== 'play') touch.setPlaying(false);
  }

  updatePlayer(dt: number) {
    const p = this.player;
    const k = this.keys;
    let ix = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let iy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (this.usesTouchControls()) {
      ix += this.touch!.move.x;
      iy += this.touch!.move.y;
    }
    const il = Math.hypot(ix, iy);
    if (il > 1) {
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
    const touchDashAt = this.touch?.consume('dash');
    if (touchDashAt !== undefined) this.dashPressAt = touchDashAt;
    if ((Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(k.SHIFT) || touchDashAt !== undefined) && p.dashCd <= 0) {
      // Analog movement affects walking speed, but a dash always travels the full distance.
      const dashLength = Math.hypot(ix, iy);
      p.dashX = dashLength > 0 ? ix / dashLength : Math.cos(p.aim);
      p.dashY = dashLength > 0 ? iy / dashLength : Math.sin(p.aim);
      p.dashT = 0.16;
      p.iframes = Math.max(p.iframes, 0.22);
      p.dashCd = 0.9 * this.run.mods.dashCooldown;
      audio.dash();
      this.fx.dust(p.x, p.y, 6);
      if (this.meleeHeld()) {
        const g = this.beatAct(this.dashPressAt || performance.now());
        if (g !== 'miss') this.beatDash(p.x, p.y, g === 'perfect');
      }
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
    const [flowX, flowY] = currentPush(this, p.x, p.y);
    const flowResistance = p.dashT > 0 ? 0.1 : 1;
    p.x += (p.vx + flowX * flowResistance) * dt;
    p.y += (p.vy + flowY * flowResistance) * dt;
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
    p.sprite.setTexture(moving && Math.floor(p.walkT * 8) % 2 ? `${this.heroTex}-b` : `${this.heroTex}-a`);
  }

  switchGun() {
    const run = this.run;
    if (this.mode !== 'play' || !run || run.weapons.length < 2) return;
    run.held = (run.held + 1) % run.weapons.length;
    this.swapT = 0.2;
    audio.swap();
  }

  useSkill(at = performance.now()) {
    const p = this.player;
    if (this.mode !== 'play' || !p || p.skillCd > 0) return;
    // With a melee weapon in hand, on the beat it lasts longer.
    const g = this.meleeHeld() ? this.beatAct(at) : 'miss';
    p.skillT = g === 'perfect' ? 6 : g === 'good' ? 5 : 4;
    p.skillCd = 14;
    audio.levelUp();
    this.fx.ring(p.x, p.y - 4, 34, E.cyan, 300);
    this.fx.callout(p.x, p.y - 28, '双持！', E.cyan);
  }

  /** Judge an action against the beat: streak, points, a word on the beat bar and a note in the key. */
  beatAct(at: number): Grade {
    const { grade } = this.rhythm.judge(at);
    this.run.score += this.rhythm.act(grade);
    ui.judge(grade);
    if (grade !== 'miss') audio.beatHit(grade === 'perfect');
    return grade;
  }

  /** A dash on the beat bursts where it starts: enemies close by are thrown back and hurt, and it recharges faster. */
  beatDash(x: number, y: number, perfect: boolean) {
    const p = this.player;
    p.dashCd *= perfect ? 0.4 : 0.6;
    p.iframes = Math.max(p.iframes, 0.35);
    this.fx.ring(x, y - 4, 38, perfect ? E.yellow : E.cyan, 260, 2);
    this.fx.sparks(x, y - 4, 10, perfect ? 'gold' : 'white');
    for (const e of this.enemies) {
      if (!e.dead && dist2(e.x, e.y, x, y) < 40 * 40) this.damageEnemy(e, (perfect ? 8 : 5) * this.damageMult(), { src: '节拍冲刺', kx: e.x - x, ky: e.y - y, knock: 260 });
    }
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
    const firing = this.isFiring();
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
      if (w.def.spinTo) {
        const turning = active && firing && !(w.reloadT! > 0);
        w.spin = turning ? Math.min(1, (w.spin ?? 0) + dt / 1.4) : Math.max(0, (w.spin ?? 0) - dt * 1.2);
      }
      w.cd -= dt * rate;
      if (active && firing && w.cd <= 0 && !(w.reloadT! > 0)) {
        if (mag && (w.ammo ?? 0) <= 0) this.startReload(w);
        else {
          this.fire(w, i !== run.held);
          w.cd += w.def.spinTo ? lerp(w.def.cooldown, w.def.spinTo, w.spin ?? 0) : w.def.cooldown;
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
    let d = m.damage * this.shotBoost;
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
    if (w.def.kind !== 'slash') {
      this.fireShot(w, offhand);
      return;
    }
    // Melee keeps time: a swing pressed on the beat hits harder, and the on-beat streak adds to every swing.
    const grade: Grade | undefined = performance.now() <= this.beatShot.until ? this.beatShot.grade : undefined;
    this.beatShot.until = 0;
    this.swingGrade = grade;
    this.shotBoost = (grade === 'perfect' ? 1.5 : grade === 'good' ? 1.25 : 1) * this.rhythm.damageMult();
    this.fireShot(w, offhand);
    this.shotBoost = 1;
    this.swingGrade = undefined;
  }

  /** The gun in hand is a melee weapon: the beat game is on. */
  meleeHeld(): boolean {
    return this.run?.weapons[this.run.held]?.def.kind === 'slash';
  }

  private fireShot(w: WeaponInstance, offhand = false) {
    const p = this.player;
    const m = this.run.mods;
    const def = w.def;
    const extra = m.count;
    const count = def.count + extra;
    // Weapons carry the fight: they hit 15% above their listed damage, while monsters got sturdier than that, so
    // shooting clears a room about as fast as before and spells alone take twice as long.
    const dmg = def.damage * WEAPON_POWER * this.damageMult();
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
          if (def.bounce) pr.bounce = def.bounce;
          if (def.split) pr.split = def.split;
          if (def.id === 'shuriken') pr.spin = 26;
          if (def.tracer) {
            const len = raycast(this.dungeon, ox, oy, Math.cos(aa), Math.sin(aa), range).len;
            this.visuals.push({ kind: 'beam', pts: [ox, oy, ox + Math.cos(aa) * len, oy + Math.sin(aa) * len], width: 1, t: 0, dur: 0.08, color: hexToNum(E.yellow) });
          }
        }
        this.recoil(a, def.id === 'sniper' ? 80 : def.id === 'gatling' ? 6 : 12);
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
          const sh = this.spawnShell(ox, oy, x, y, Math.max(0.28, 0.5 / m.speed), def.size * area, dmg, pierce, knock);
          sh.element = def.element;
          sh.src = def.name;
          if (def.proj) sh.sprite.setTexture(def.proj);
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
          const pr = this.spawnProj('flame', ox, oy, a + rand(-cone / 2, cone / 2), sp, (range / sp) * rand(0.7, 1), def.size * area, dmg, 999, knock, def.name, def.proj);
          pr.element = def.element ?? 'fire';
        }
        break;
      }
      case 'slash':
        this.meleeAttack(w, a, dmg, area, knock, count, pierce);
        break;
    }
    if (def.casing) this.ejectCasing(ox, oy, a, def.casing);
    if (def.kind !== 'slash' && def.kind !== 'flame') {
      this.fx.muzzle(ox, oy, a);
      this.light.flash(ox, oy, 26 + (def.shake ?? 0) * 200, E.yellow, 0.07);
    } else if (def.kind === 'slash') this.light.flash(p.x + Math.cos(a) * 14, p.y - 4 + Math.sin(a) * 14, 40, E.cyan, 0.1);
    const shake = def.shake ?? 0.01;
    this.kick(a, 0.6 + shake * 30);
    if (shake >= 0.05) this.fx.shake(shake);
    audio.shoot(def.kind);
  }

  /**
   * One move of a melee weapon's combo. Swings that follow each other closely walk through the combo and the last
   * move is the finisher; a pause drops it. A finisher pressed on the beat goes off in full: wider, harder, louder.
   */
  meleeAttack(w: WeaponInstance, a: number, dmg: number, area: number, knock: number, count: number, waves: number) {
    const def = w.def;
    const p = this.player;
    const moves: MeleeMove[] = def.combo ?? [{ move: 'arc', arc: def.spreadDeg, reach: 1, dmg: 1, dir: 1 }];
    if (this.time0 - this.melee.last > Math.max(0.95, def.cooldown * 3)) this.melee.step = 0;
    const i = this.melee.step % moves.length;
    const mv = moves[i];
    const finisher = moves.length > 1 && i === moves.length - 1;
    this.melee.step = finisher ? 0 : i + 1;
    this.melee.last = this.time0;
    const grade = this.swingGrade;
    this.swingElement = def.element;
    const full = finisher && (grade === 'perfect' || grade === 'good');
    const x = p.x;
    const y = p.y - 4;
    const r = def.range * area * mv.reach * (full ? 1.3 : 1);
    const hit = dmg * mv.dmg * (full ? 1.5 : 1);
    const kb = knock * (finisher ? 1.4 : 1);
    const src = def.name;
    const tint = hexToNum(full ? E.yellow : finisher ? E.magenta : E.cyan);
    const anim = (move: MoveKind, dur: number, dir = 1) => (this.melee.anim = { move, t: 0, dur, dir, hand: i % 2 });
    p.punch = 1;
    switch (mv.move) {
      case 'arc': {
        const half = ((mv.arc ?? def.spreadDeg) * Math.PI) / 360;
        const n = Math.min(3, count);
        for (let k = 0; k < n; k++) {
          const aa = a + (k - (n - 1) / 2) * 0.5;
          this.visuals.push({ kind: 'slash', pts: [x, y, aa, r, half, mv.dir ?? 1], width: 3, t: 0, dur: 0.14, color: tint });
          this.meleeHit(x, y, aa, r, half, hit, kb, src);
          if (waves > 0) this.swordWave(x, y, aa, hit, waves, kb, src);
        }
        anim('arc', 0.16, mv.dir ?? 1);
        break;
      }
      case 'thrust':
        this.visuals.push({ kind: 'thrust', pts: [x, y, a, r, 3], width: 3, t: 0, dur: 0.1, color: tint });
        this.meleeHit(x, y, a, r, 0.26, hit, kb, src);
        if (waves > 0) this.swordWave(x, y, a, hit, waves, kb, src);
        anim('thrust', 0.12);
        break;
      case 'smash': {
        // Brought down from overhead: a short arc and a thud where it lands.
        const half = ((mv.arc ?? 90) * Math.PI) / 360;
        this.visuals.push({ kind: 'slash', pts: [x, y, a, r, half, 1], width: 4, t: 0, dur: 0.16, color: hexToNum(E.yellow) });
        this.meleeHit(x, y, a, r, half, hit, kb, src, true);
        const ix = x + Math.cos(a) * r * 0.8;
        const iy = y + Math.sin(a) * r * 0.8 + 4;
        this.fx.dust(ix, iy, 6);
        this.fx.sparks(ix, iy, 6, 'white');
        this.fx.ring(ix, iy, 16, E.white, 200, 1);
        this.fx.shake(0.08);
        anim('smash', 0.18);
        break;
      }
      case 'spin':
        this.visuals.push({ kind: 'slash', pts: [x, y, a, r, Math.PI, 1], width: 4, t: 0, dur: 0.2, color: tint });
        this.meleeHit(x, y, a, r, Math.PI, hit, kb, src);
        anim('spin', 0.22);
        break;
      case 'slam':
        // The head comes down and the ground shakes outward all around.
        this.fx.ring(x, y + 4, r, full ? E.yellow : E.white, 380, 3);
        this.fx.ring(x, y + 4, r * 0.55, E.white, 260, 2);
        this.fx.dust(x, y + 4, 14);
        this.meleeHit(x, y, a, r, Math.PI, hit, kb * 1.3, src, true);
        this.crack(x, y + 5, r * 0.7);
        this.fx.shake(full ? 0.35 : 0.2);
        anim('slam', 0.24);
        break;
      case 'lunge':
        // Charge forward and run the spear through everything on the way.
        p.dashX = Math.cos(a);
        p.dashY = Math.sin(a);
        p.dashT = 0.13;
        p.iframes = Math.max(p.iframes, 0.2);
        this.visuals.push({ kind: 'thrust', pts: [x, y, a, r + 30, 5], width: 5, t: 0, dur: 0.16, color: tint });
        this.meleeHit(x, y, a, r + 30, 0.3, hit, kb, src);
        this.fx.dust(p.x, p.y, 6);
        anim('thrust', 0.18);
        break;
      case 'cross':
        for (const s of [-1, 1]) {
          const aa = a + s * 0.45;
          this.visuals.push({ kind: 'slash', pts: [x, y, aa, r, 0.55, s], width: 3, t: 0, dur: 0.16, color: tint });
          this.meleeHit(x, y, aa, r, 0.55, hit * 0.6, kb, src);
        }
        anim('cross', 0.2);
        break;
      case 'whirl':
        // Two full turns: four sweeps all around, following the knight.
        for (let k = 0; k < 4; k++) {
          this.time.delayedCall(k * 90, () => {
            if (this.mode !== 'play') return;
            const px = this.player.x;
            const py = this.player.y - 4;
            this.visuals.push({ kind: 'slash', pts: [px, py, a + k * Math.PI, r, Math.PI, 1], width: 3, t: 0, dur: 0.12, color: tint });
            this.meleeHit(px, py, a, r, Math.PI, hit, kb * 0.6, src);
          });
        }
        anim('whirl', 0.38);
        break;
    }
    if (finisher) {
      this.fx.callout(p.x, p.y - 30, full ? `节拍·${mv.name ?? '终结'}` : (mv.name ?? '终结'), full ? E.yellow : E.white, full);
      if (full) {
        this.fx.flash(E.yellow, 0.18, 200);
        this.fx.ring(x, y, r + 10, E.yellow, 300, 2);
        this.fx.sparks(x, y, 14, 'gold');
        this.stop(0.06);
        audio.finisher();
      }
    }
    if (grade === 'perfect' || grade === 'good') this.fx.sparks(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, 6, 'gold');
  }

  /** Hit everything within `half` of angle `a` out to `r` (all around when half is pi), and cut enemy bullets down. */
  meleeHit(x: number, y: number, a: number, r: number, half: number, dmg: number, knock: number, src: string, heavy = false) {
    const all = half >= Math.PI - 0.01;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist(x, y, e.x, e.y - 3);
      if (d > r + e.r) continue;
      if (!all && Math.abs(angleDiff(a, Math.atan2(e.y - 3 - y, e.x - x))) > half + 0.12 + Math.min(0.5, e.r / Math.max(d, 1))) continue;
      this.damageEnemy(e, dmg, { src, kx: e.x - x, ky: e.y - y, knock, ignoreShield: true, heavy, element: this.swingElement });
    }
    for (const b of this.eproj) {
      if (b.dead || dist(x, y, b.x, b.y) > r + 6) continue;
      if (!all && Math.abs(angleDiff(a, Math.atan2(b.y - y, b.x - x))) > half + 0.25) continue;
      this.fx.sparks(b.x, b.y, 4, 'gold');
      this.killProj(b, true);
    }
    for (const o of this.obstacles) if (!o.dead && o.kind !== 'pillar' && dist(x, y, o.x, o.y) < r + o.r) this.damageObstacle(o, dmg);
  }

  /** Pierce upgrades send a flying blade wave out of each swing. */
  swordWave(x: number, y: number, a: number, dmg: number, waves: number, knock: number, src: string) {
    const pr = this.spawnProj('bolt', x + Math.cos(a) * 10, y + Math.sin(a) * 10, a, 230, 0.55, 3, dmg * 0.6, waves + 2, knock * 0.4, src, 'b-wave');
    pr.r = 7;
  }

  /** Cracks in the floor where a hammer came down. */
  crack(x: number, y: number, r: number) {
    const g = this.add.graphics();
    g.lineStyle(1, 0x181425, 0.7);
    for (let k = 0; k < 7; k++) {
      let a = rand(0, TAU);
      let px = x;
      let py = y;
      g.beginPath();
      g.moveTo(px, py);
      for (let s = 0; s < 4; s++) {
        a += rand(-0.5, 0.5);
        px += Math.cos(a) * r * 0.25;
        py += Math.sin(a) * r * 0.18;
        g.lineTo(Math.round(px), Math.round(py));
      }
      g.strokePath();
    }
    this.decals?.draw(g);
    g.destroy();
  }

  recoil(a: number, amount: number) {
    this.player.vx -= Math.cos(a) * amount;
    this.player.vy -= Math.sin(a) * amount;
    this.player.punch = 1;
  }

  // ---------------------------------------------------------------- projectiles

  spawnProj(kind: ProjKind, x: number, y: number, a: number, speed: number, life: number, r: number, dmg: number, pierce: number, knock: number, src: string, tex?: string): Proj {
    const enemy = kind === 'ebullet' || kind === 'ebig';
    const tkey: Record<ProjKind, string> = { bolt: 'b-bolt', pellet: 'b-pellet', blade: 'b-blade', shell: 'b-shell', shard: 'b-shard', orb: 'b-orb', axe: 'b-axe', rocket: 'b-rocket', flame: 'b-flame', ebullet: this.bossShot ?? K('ebullet', this.kit), ebig: K('ebullet-big', this.kit) };
    // A guardian's shots are drawn pointing the way they fly (leaves, feathers, fireballs).
    const turn = kind === 'bolt' || kind === 'rocket' || (kind === 'ebullet' && !!this.bossShot);
    // Leaves, fireballs and feathers are drawn heading up and to the right.
    const tilt = kind === 'ebullet' && this.bossShot && ['forest', 'volcano', 'palace'].includes(this.kit.id) ? Math.PI / 4 : 0;
    const sprite = this.add.image(x, y, tex ?? tkey[kind]).setDepth(enemy ? DEPTH.ebullet : DEPTH.proj).setRotation(turn ? a + tilt : 0);
    const base: Record<ProjKind, number> = { bolt: 3, pellet: 2.5, blade: 5, shell: 3, shard: 2, orb: 3, axe: 4, rocket: 4, flame: 4, ebullet: 3, ebig: 5 };
    sprite.setScale(Math.max(0.6, r / base[kind]));
    if (kind === 'flame') sprite.setScale(0.6).setRotation(rand(0, TAU));
    // Player shots sweep from the body centre, so point-blank enemies still get hit.
    const [px, py] = enemy ? [x, y] : [this.player.x, this.player.y - 4];
    const p: Proj = { kind, x, y, px, py, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r, dmg, pierce, life, life0: life, knock, src, sprite, hit: new Set(), dead: false };
    // A floating guardian can hang over a statue or pillar; its shots must get out of the stone before walls count.
    if (enemy && solidAt(this.dungeon, x, y)) p.noclip = 0.35;
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
    return p;
  }

  killProj(p: Proj, silent = false) {
    if (p.dead) return;
    p.dead = true;
    p.sprite.destroy();
    p.shadow?.destroy();
    if (!silent && (p.kind === 'bolt' || p.kind === 'pellet' || p.kind === 'orb')) this.fx.sparks(p.x, p.y, 3, 'gold');
  }

  /** An ice lance bursts into a ring of shards where it stops. */
  shatter(p: Proj, x: number, y: number) {
    const n = p.split ?? 0;
    p.split = 0;
    const a0 = Math.atan2(p.vy, p.vx);
    for (let i = 0; i < n; i++) {
      const a = a0 + Math.PI + ((i - (n - 1) / 2) / n) * 4.4;
      const s = this.spawnProj('shard', x - Math.cos(a0) * 3, y - Math.sin(a0) * 3, a, 210, 0.35, 2.5, p.dmg * 0.35, 0, 20, p.src);
      s.element = 'ice';
      s.sprite.setRotation(a);
    }
    this.fx.sparks(x, y, 8, 'ice');
    this.fx.ring(x, y, 14, E.cyan, 180, 1);
  }

  /** A spent casing kicks out of the gun, tumbles to the floor and fades. */
  ejectCasing(x: number, y: number, a: number, kind: 'brass' | 'shell') {
    if (this.casings >= 36) return;
    this.casings++;
    const img = this.add.image(Math.round(x), Math.round(y), kind === 'shell' ? 'casing-shell' : 'casing').setDepth(DEPTH.proj - 0.5);
    const tx = x - Math.cos(a) * rand(5, 10) + rand(-3, 3);
    const top = y - rand(6, 11);
    const floor = y + rand(5, 9);
    this.tweens.add({ targets: img, x: tx, duration: 420 });
    this.tweens.add({ targets: img, angle: rand(240, 540) * (Math.random() < 0.5 ? -1 : 1), duration: 420 });
    this.tweens.add({
      targets: img,
      y: top,
      duration: 150,
      ease: 'Quad.easeOut',
      onComplete: () => this.tweens.add({ targets: img, y: floor, duration: 270, ease: 'Bounce.easeOut' }),
    });
    this.tweens.add({
      targets: img,
      alpha: 0,
      delay: 900,
      duration: 300,
      onComplete: () => {
        img.destroy();
        this.casings--;
      },
    });
  }

  /** Rockets blow up on whatever stops them. */
  private detonate(p: Proj, x = p.x, y = p.y) {
    this.explode(x, y, p.blast ?? 24, p.dmg, { src: p.src, knock: p.knock, volume: 0.8 });
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
        // Hot and small at the nozzle, then a wider, redder lick that fades out (a gust just grows and fades).
        const k = 1 - p.life / (p.life0 || 1);
        p.sprite.setScale(0.6 + k * 1.5).setAlpha(k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.45));
        if (p.element === 'wind') p.sprite.rotation += dt * 8;
        else if (k > 0.6) p.sprite.setTint(0xf04020);
        else if (k > 0.3) p.sprite.setTint(0xff9a30);
      } else if (p.kind === 'rocket') {
        if (Math.random() < 0.7) this.fx.dust(p.x - p.vx * 0.03, p.y - p.vy * 0.03, 1);
      } else if (p.spin) p.sprite.rotation += dt * p.spin;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        if (p.kind === 'rocket') this.detonate(p);
        else {
          if (p.split) this.shatter(p, p.x, p.y);
          this.killProj(p, p.kind === 'flame' || p.kind === 'axe');
        }
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
        } else if ((p.bounce ?? 0) > 0) {
          // Throwing stars glance off walls: flip whichever way the wall was hit.
          const bx = p.x - p.vx * dt;
          const by = p.y - p.vy * dt;
          const hitX = solidAt(d, p.x, by);
          const hitY = solidAt(d, bx, p.y);
          if (hitX || !hitY) p.vx = -p.vx;
          if (hitY || !hitX) p.vy = -p.vy;
          p.x = bx;
          p.y = by;
          p.bounce!--;
          p.hit.clear();
          p.life = Math.max(p.life, 0.5);
          this.fx.sparks(p.x, p.y, 2, 'white');
        } else {
          if (p.kind !== 'flame') this.fx.sparks(p.x - p.vx * dt, p.y - p.vy * dt, 2, 'gold');
          if (p.split) this.shatter(p, p.x - p.vx * dt, p.y - p.vy * dt);
          this.killProj(p, true);
          continue;
        }
      }
      if (p.kind === 'flame' || p.kind === 'blade' || p.kind === 'axe') {
        for (const o of this.obstacles) {
          if (o.dead || o.kind === 'pillar' || p.hitProps?.has(o) || dist2(p.x, p.y, o.x, o.y) >= (o.r + p.r) ** 2) continue;
          (p.hitProps ??= new Set()).add(o);
          this.damageObstacle(o, p.dmg);
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
        if (p.split) this.shatter(p, p.x, p.y);
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
      if (p.homing) {
        const sp = Math.hypot(p.vx, p.vy);
        const cur = Math.atan2(p.vy, p.vx);
        const na = cur + clamp(angleDiff(cur, Math.atan2(pl.y - 4 - p.y, pl.x - p.x)), -p.homing * dt, p.homing * dt);
        p.vx = Math.cos(na) * sp;
        p.vy = Math.sin(na) * sp;
        p.sprite.setRotation(na);
      }
      if (p.split && p.life < 0.15) {
        for (let i = 0; i < p.split; i++) this.spawnEnemyBullet(p.x, p.y, (i / p.split) * TAU + p.x, 90);
        this.fx.ring(p.x, p.y, 14, E.white, 160, 1);
        this.killProj(p, true);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.noclip !== undefined) p.noclip -= dt;
      if (p.life <= 0 || ((p.noclip ?? 0) <= 0 && solidAt(d, p.x, p.y))) {
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
      this.explode(p.x, p.y, p.blast!, p.dmg, { src: p.src, knock: p.knock, element: p.element, volume: 0.8 });
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
      this.damageEnemy(target, dmg * power, { src, knock: 14, kx: target.x - fx, ky: target.y - fy, ignoreShield: true, element: 'shock' });
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
    o: { src: string; kx?: number; ky?: number; knock?: number; crit?: boolean; noCrit?: boolean; dot?: boolean; ignoreShield?: boolean; arc?: boolean; noElement?: boolean; color?: string; element?: Element; quiet?: boolean; heavy?: boolean; noReact?: boolean; environmental?: boolean },
  ) {
    if (e.dead) return;
    if ((e.boss && e.boss.invuln > 0) || (e.kind === 'ghost' && e.state === 'fade')) {
      this.fx.sparks(e.x, e.y - 8, 2, 'white');
      return;
    }
    if (e.kind === 'angel' && e.state === 'stone') amount *= 0.5;
    const m = this.run.mods;
    const st = e.status;
    // An element rides on the hit: the weapon's own, or one rolled from the element upgrades.
    let element = o.element;
    if (!element && !o.dot && !o.noElement) {
      for (const el of ELEMENTS) {
        if (m.elements[el] > 0 && Math.random() < m.elements[el]) {
          element = el;
          break;
        }
      }
    }
    let dmg = amount;
    let crit = !!o.crit;
    if (!o.dot && !o.noCrit && !crit && Math.random() < m.critChance) crit = true;
    if (crit) dmg *= m.critMult;
    if (e.affix === 'tough') dmg *= 0.8;
    if (e.state === 'stunned' || st.stun > 0) dmg *= 1.35;
    if (st.shred > 0) dmg *= 1.4;
    // A monster of this style shrugs off most of its own element.
    if (element && e.infused === element) {
      dmg *= e.boss ? 0.7 : 0.3;
      if (!o.dot && this.gateText(e, 'resist')) this.fx.callout(e.x, e.y - e.r * 2 - 14, '抵抗', E.greyM);
    }
    // An elemental shield takes the hit first: its counter element tears through it, its own barely scratches it.
    if (e.eshield && !o.dot) {
      const sh = e.eshield;
      const counter = SHIELD_COUNTER[sh.el];
      const k = element === counter || (sh.el === 'rock' && o.heavy) ? 2.5 : element === sh.el ? 0.1 : element ? 1 : 0.5;
      sh.hp -= dmg * k;
      this.fx.sparks(e.x, e.y - 6, 3, sh.el);
      if (!o.quiet) this.fx.number(e.x, e.y - e.r * 2 - 4, dmg * k, { small: true, color: ELEMENT_COLOR[sh.el] });
      if (sh.hp > 0) return;
      // Broken: a burst of the shield's colour, and the elite reels.
      e.eshield = undefined;
      st.stun = 2;
      tintShield(e, this.kit.palette.danger);
      this.fx.callout(e.x, e.y - e.r * 2 - 16, '护盾破碎', ELEMENT_COLOR[sh.el], true);
      this.fx.ring(e.x, e.y - 4, 36, ELEMENT_COLOR[sh.el], 320, 2);
      this.fx.sparks(e.x, e.y - 4, 14, sh.el);
      audio.explode(false);
      return;
    }
    if (st.frozen > 0 && (o.heavy || element === 'rock')) dmg += shatter(this, e, dmg);
    if (element && !o.noReact) dmg *= react(this, e, element, dmg);
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
        audio.hit(crit, !!o.heavy);
        this.fx.sparks(e.x, e.y - 4, crit ? 6 : 2, crit ? 'gold' : element ?? 'white');
      }
      if (crit) {
        this.stop(0.025);
        this.fx.shake(0.03);
      }
    }
    if (!o.quiet || crit) this.fx.number(e.x, e.y - e.r * 2 - 4, dmg, { crit, small: o.dot, color: o.color ?? (element ? ELEMENT_COLOR[element] : undefined) });
    if (!o.dot && !o.noElement) {
      if (m.explodeOnHit > 0 && Math.random() < m.explodeOnHit) this.explode(e.x, e.y, 26, dmg * 0.6, { src: '余烬爆裂', small: true, element: 'fire', volume: 0.35 });
      if (crit && m.splitOnCrit > 0) {
        for (let i = 0; i < m.splitOnCrit; i++) this.spawnProj('shard', e.x, e.y, rand(0, TAU), 260, 0.4, 2, dmg * 0.35, 0, 20, '裂变').hit.add(e);
      }
    }
    if (e.hp <= 0) this.killEnemy(e, o.src, o.environmental);
  }

  /** Throttle the small words over an enemy (resists), so a stream of hits doesn't bury it in text. */
  private textGate = new Map<number, number>();
  gateText(e: Enemy, _what: string): boolean {
    const now = this.time0;
    if ((this.textGate.get(e.id) ?? -9) + 0.8 > now) return false;
    this.textGate.set(e.id, now);
    return true;
  }

  protected resetCrystalRuntime() {
    this.nextCrystalDropAt = 0;
    this.nextCrystalCollectAt = 0;
  }

  /** Includes magnetized shards. Legacy drops get one deadline; excess and expired drops are removed first. */
  private pruneCrystals() {
    let count = 0;
    for (const p of this.pickups) {
      if (p.dead || p.kind !== 'crystal') continue;
      p.crystalExpiresAt ??= this.time0 + Math.max(0, CRYSTAL_RULES.lifetime - p.t);
      p.label?.destroy();
      p.label = undefined;
      if (this.time0 >= p.crystalExpiresAt || count >= CRYSTAL_RULES.maxOnGround) {
        this.removePickup(p);
        continue;
      }
      count++;
      p.sprite.setAlpha(Math.min(1, (p.crystalExpiresAt - this.time0) / CRYSTAL_RULES.fadeTime));
    }
    return count;
  }

  /** Throttle only the drop; the triggering elemental reaction keeps its damage and aura rules. */
  dropCrystal(x: number, y: number, el: Element) {
    if (this.mode !== 'play' || this.time0 < this.nextCrystalDropAt) return;
    if (this.pruneCrystals() >= CRYSTAL_RULES.maxOnGround) return;
    if (solidAt(this.dungeon, x, y)) [x, y] = openSpot(this.dungeon, x, y);
    const sprite = this.add.image(Math.round(x), Math.round(y), 'crystal').setDepth(DEPTH.pickup).setTint(hexToNum(ELEMENT_COLOR[el]));
    this.pickups.push({ kind: 'crystal', element: el, tier: 0, x, y, vx: 0, vy: -30, value: 0, t: 0, crystalExpiresAt: this.time0 + CRYSTAL_RULES.lifetime, magnet: false, sprite, dead: false });
    this.nextCrystalDropAt = this.time0 + CRYSTAL_RULES.dropCooldown;
  }

  killEnemy(e: Enemy, _src: string, environmental = false) {
    if (e.dead) return;
    e.dead = true;
    const run = this.run;
    run.kills++;
    run.score += this.rhythm.kill(!!e.elite || !!e.boss);
    if (this.active) {
      this.fightStats.kills++;
      this.fightStats.combo = Math.max(this.fightStats.combo, this.combo + 1);
    }
    if (e.kind === 'magma' && !e.mini) {
      for (const s of [-1, 1]) this.spawnEnemy('magma', e.x + s * 6, e.y, false, true);
    } else if (e.kind === 'sporeling') {
      for (let i = 0; i < 6; i++) this.spawnEnemyBullet(e.x, e.y - 4, (i / 6) * TAU + e.id, 55 + run.level * 6);
      this.fx.burst(e.x, e.y - 4, 8);
    }
    this.combo++;
    this.comboT = 2.2;
    run.maxCombo = Math.max(run.maxCombo, this.combo);
    run.frenzyStacks = Math.min(10, run.frenzyStacks + 1);
    audio.kill(this.combo);
    this.fx.burst(e.x, e.y - 4, e.elite ? 16 : 6);
    this.splat(e);
    this.light.flash(e.x, e.y - 4, e.elite ? 60 : 30, E.white);
    this.stop(e.elite ? 0.08 : 0.014);
    if (e.elite) this.fx.shake(0.22);
    if (this.combo > 0 && this.combo % 20 === 0) this.fx.callout(this.player.x, this.player.y - 32, `${this.combo}连杀！`, E.yellow);
    for (const s of environmental ? [] : run.spells) {
      if (s.id === 'aura' && s.evolved && dist2(e.x, e.y, this.player.x, this.player.y) < 60 * 60) {
        s.kills++;
        if (s.kills % 12 === 0) this.heal(1, this.player.x, this.player.y);
      }
    }
    this.dropGem(e.x, e.y, Math.max(1, Math.round(e.xp)));
    if (e.elite) {
      this.dropChest(e.x, e.y);
      if (Math.random() < HEART_DROPS.elite) this.dropHeart(e.x + 8, e.y);
    } else if (Math.random() < HEART_DROPS.kill) this.dropHeart(e.x, e.y);
    if (!environmental && run.mods.healOnKill > 0 && Math.random() < run.mods.healOnKill) this.heal(1, e.x, e.y);
    if (!environmental && run.mods.explodeOnKill > 0) this.explode(e.x, e.y, 30, e.maxHp * run.mods.explodeOnKill, { src: '连锁殉爆', small: true, volume: 0.35 });
    if (e.kind === 'bomber') this.explode(e.x, e.y, 36, 18, { src: '炸弹怪', hurtsPlayer: 1, volume: 0.6, environmental });
    if (!environmental) this.spreadPoison(e);
    if (e.affix === 'split' && !e.mini) for (let i = 0; i < 2; i++) this.spawnEnemy(e.kind as EnemyKind, e.x + rand(-8, 8), e.y + rand(-8, 8), false, true);
    if (e.affix === 'burst') for (let i = 0; i < 10; i++) this.spawnEnemyBullet(e.x, e.y, (i / 10) * TAU, 80);
    // The element mark over its head goes with it.
    e.auraImg?.destroy();
    e.auraImg = undefined;
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
  /**
   * What a kill leaves on the floor, on about a third of them (always for elites and bosses): blood for beasts,
   * goo for slimes and jellies, scorch for bombs and magma, dust for bones and stone, oil for machines.
   */
  splat(e: Enemy) {
    if (!e.boss && !e.elite && Math.random() > 0.35) return;
    const stuff: Partial<Record<string, string>> = { wanderer: this.kit.px.slime, magma: E.brownD, bomber: E.ink, shield: E.cream, angel: E.grey, ghost: E.cyan, jelly: E.pink, sporeling: E.greenD, turret: E.navy, drone: E.navy, guardian: E.slate };
    const col = stuff[e.kind] ?? E.redD;
    const alpha = e.kind === 'ghost' ? 0.3 : e.kind === 'shield' || e.kind === 'angel' ? 0.5 : 0.72;
    const scale = (e.boss ? 2.6 : e.elite ? 1.7 : 1) * rand(0.8, 1.15);
    this.decals?.stamp(`splat-${Math.floor(rand(0, 4))}`, undefined, Math.round(e.x), Math.round(e.y + 1), { angle: Math.floor(rand(0, 4)) * 90, scale, alpha, tint: hexToNum(col) });
  }

  explode(x: number, y: number, r: number, dmg: number, o: { src: string; hurtsPlayer?: number; knock?: number; small?: boolean; element?: Element; noReact?: boolean; volume?: number; environmental?: boolean }) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (dist2(x, y, e.x, e.y) < (r + e.r) ** 2) this.damageEnemy(e, dmg, { src: o.src, kx: e.x - x, ky: e.y - y, knock: o.knock ?? 100, ignoreShield: true, noElement: o.environmental || o.small, noCrit: o.environmental, element: o.environmental ? undefined : o.element, noReact: o.environmental || o.noReact, heavy: true, environmental: o.environmental });
    }
    const owner = this.active;
    const dungeon = this.dungeon;
    for (const b of this.obstacles) {
      if (!b.dead && b.kind !== 'pillar' && dist2(x, y, b.x, b.y) < (r + b.r) ** 2) this.time.delayedCall(60, () => {
        if (o.environmental && (this.mode !== 'play' || this.active !== owner || this.dungeon !== dungeon || owner?.cleared)) return;
        this.damageObstacle(b, 999, o.environmental);
      });
    }
    if (o.hurtsPlayer && this.mode === 'play' && dist2(x, y, this.player.x, this.player.y) < (r + this.player.r) ** 2) this.hurtPlayer(o.hurtsPlayer, x, y);
    this.fx.boom(x, y, r * 1.2);
    this.fx.ring(x, y, r, o.hurtsPlayer ? this.kit.palette.danger : E.yellow, 260, 2);
    this.fx.burst(x, y, o.small ? 4 : 10);
    this.fx.dust(x, y, o.small ? 3 : 8);
    this.fx.shake(o.small ? 0.06 : 0.2);
    this.light.flash(x, y, r * 3, E.orange);
    audio.explode(!o.small && r > 30 && (o.volume ?? 1) > 0.7, o.volume ?? 1);
  }

  /** Breakable props in a circle take a hit: crates splinter, kegs go up. */
  hurtProps(x: number, y: number, r: number, dmg: number) {
    for (const o of this.obstacles) if (!o.dead && o.kind !== 'pillar' && dist2(x, y, o.x, o.y) < (r + o.r) ** 2) this.damageObstacle(o, dmg);
  }

  damageObstacle(o: Obstacle, dmg: number, environmental = false) {
    if (o.dead) return;
    o.hp -= dmg;
    o.sprite.setTintFill(0xffffff);
    this.time.delayedCall(50, () => o.sprite.active && o.sprite.clearTint());
    if (o.hp <= 0) {
      o.dead = true;
      o.sprite.destroy();
      if (o.kind === 'barrel') this.explode(o.x, o.y, 44, 30, { src: '爆炸桶', hurtsPlayer: 2, knock: 160, volume: 0.5, environmental });
      else {
        this.fx.burst(o.x, o.y, 8);
        this.fx.dust(o.x, o.y, 6);
        if (Math.random() < HEART_DROPS.crate) this.dropHeart(o.x, o.y);
        else this.dropGem(o.x, o.y, 2);
      }
    }
  }

  hurtPlayer(n: number, sx: number, sy: number): boolean {
    const p = this.player;
    if (this.mode !== 'play' || p.iframes > 0 || this.god || this.fusing) return false;
    const run = this.run;
    // Deeper floors hit harder; the fractional part of the scaled damage is rolled.
    const scaled = n * floorScale(FLOOR_SCALING.damage, run.level);
    let left = Math.floor(scaled) + (Math.random() < scaled % 1 ? 1 : 0);
    const guard = Math.min(0.24, run.mods.petGuard * run.pets.length);
    if (guard > 0 && Math.random() < guard) {
      p.iframes = 0.4;
      this.fx.ring(p.x, p.y - 4, 24, E.cyan, 220);
      this.fx.callout(p.x, p.y - 24, '兽群守护', E.cyan);
      audio.block();
      return false;
    }
    const absorbed = Math.min(run.armor, left);
    run.armor -= absorbed;
    left -= absorbed;
    const hpLost = Math.min(Math.max(0, run.hp), left);
    run.hp -= left;
    ui.damageFeedback(hpLost, absorbed);
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
    this.rhythm.hurt();
    if (this.activeChallenge) finishChallenge(this, false);
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
    if (this.activeChallenge) finishChallenge(this, false);
    settleTraps(this);
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
    this.startRun(undefined, this.run.hero, this.run.diff.id);
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
      // Electro-Charged: a zap every second that jumps to wet neighbours.
      if (s.ec > 0) {
        s.ec -= dt;
        s.ecTick -= dt;
        if (s.ecTick <= 0) {
          s.ecTick = 1;
          this.damageEnemy(e, s.ecDmg, { src: '感电', dot: true, color: ELEMENT_COLOR.shock, noReact: true });
          this.fx.sparks(e.x, e.y - 6, 3, 'shock');
          for (const o of this.enemies) {
            if (o === e || o.dead || o.status.aura !== 'water' || o.status.auraT <= 0 || dist2(o.x, o.y, e.x, e.y) > 56 * 56) continue;
            this.visuals.push({ kind: 'chain', pts: this.jag(e.x, e.y - 4, o.x, o.y - 4), width: 1, t: 0, dur: 0.12, color: hexToNum(ELEMENT_COLOR.shock) });
            this.damageEnemy(o, s.ecDmg * 0.7, { src: '感电', dot: true, color: ELEMENT_COLOR.shock, noReact: true });
          }
          if (e.dead) continue;
        }
      }
      // Burning: fire on it and on whatever stands close.
      if (s.burnT > 0) {
        s.burnT -= dt;
        s.burnTick -= dt;
        if (s.burnTick <= 0) {
          s.burnTick = 0.5;
          s.aura = 'fire';
          s.auraT = Math.max(s.auraT, 1);
          this.fx.sparks(e.x, e.y - 6, 2, 'fire');
          for (const o of this.enemies) {
            if (o.dead || dist2(o.x, o.y, e.x, e.y) > 24 * 24) continue;
            this.damageEnemy(o, o === e ? s.burnDmg : s.burnDmg * 0.5, { src: '燃烧', dot: true, color: ELEMENT_COLOR.fire, noReact: true });
          }
          if (e.dead) continue;
        }
      }
      s.auraT -= dt;
      if (s.auraT <= 0) s.aura = undefined;
      // A monster of this style gets its element back a moment after a reaction used it up.
      if (e.infused && e.infused !== 'wind' && e.infused !== 'rock' && s.auraT <= 0) {
        s.regrow -= dt;
        if (s.regrow <= 0) {
          s.aura = e.infused;
          s.auraT = 99;
        }
      }
      s.quicken -= dt;
      s.shred -= dt;
      s.stun -= dt;
      s.chill -= dt;
      if (s.frozen > 0) s.frozen -= dt;
      const slowMul = s.frozen > 0 || s.stun > 0 ? 0 : s.chill > 0 ? 0.75 : 1;
      if (e.boss) {
        const shot = K('ebullet-boss', this.kit);
        this.bossShot = e.kind === 'guardian' && this.textures.exists(shot) ? shot : undefined;
        updateBoss(this, e, dt, slowMul);
        this.bossShot = undefined;
      }
      if (!e.boss) updateEnemyAI(this, e, dt, slowMul);
      if (e.dead) continue;
      const kd = Math.exp(-dt * 10);
      e.kx *= kd;
      e.ky *= kd;
      const [flowX, flowY] = grounded(e) && !e.boss ? currentPush(this, e.x, e.y) : [0, 0];
      e.x += (e.vx * slowMul + e.kx + flowX) * dt;
      e.y += (e.vy * slowMul + e.ky + flowY) * dt;
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
      const flies = a.kind === 'guardian' || a.kind === 'ghost' || a.kind === 'drone';
      if (!flies && (!a.boss || a.boss.air < 20)) [a.x, a.y] = collide(this.dungeon, a.x, a.y, Math.max(3, a.r * 0.8));
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
      // In a fight everything keeps time: a quick squash on every beat.
      if (!a.boss && !a.enter && a.state !== 'fuse' && this.active) {
        const k = Math.max(0, 1 - this.rhythm.phase * 5);
        sp.setScale(a.scale * (1 + k * 0.12), a.scale * (1 - k * 0.12));
      }
      if (a.kind === 'ghost') sp.setAlpha(a.state === 'fade' ? 0.25 : 0.9);
      if (a.flash > 0) sp.setTintFill(0xffffff);
      else if (a.kind === 'angel' && a.state === 'stone') sp.setTint(0x9aa4b8);
      else if (a.status.frozen > 0) sp.setTint(hexToNum(ELEMENT_COLOR.ice));
      else if (a.status.burnT > 0 && Math.floor(this.time0 * 10) % 2 === 0) sp.setTint(0xffb080);
      else if (a.status.stun > 0) sp.setTint(0x9aa4b8);
      else if (a.boss?.enraged) sp.setTint(0xff9a9a);
      else sp.clearTint();
      if (a.enter) this.entrance(a, sp, dt);
      markAura(this, a);
      a.shadow.setPosition(Math.round(a.x), Math.round(a.y + 1));
      if (a.boss) animateBoss(this, a, dt);
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

  /** A gold chest gives one reward; a steel chest reveals one weapon to inspect and pick up. */
  dropChest(x: number, y: number, weapon = false) {
    [x, y] = openSpot(this.dungeon, x, y);
    const sprite = this.add.image(Math.round(x), Math.round(y), weapon ? 'chest-w' : 'chest').setDepth(DEPTH.pickup + 0.5).setOrigin(0.5, 0.8);
    const glow = this.add.image(x, y - 4, 'glow').setDepth(DEPTH.pickup).setTint(hexToNum(weapon ? E.cyan : E.yellow)).setScale(1.6).setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: 0.2, yoyo: true, repeat: -1, duration: 500 });
    sprite.setData('glow', glow);
    this.pickups.push({ kind: weapon ? 'wchest' : 'chest', tier: 0, x, y, vx: 0, vy: 0, value: 0, t: 0, magnet: false, sprite, dead: false });
  }

  /** A replaced weapon keeps its own level, ammunition and reload progress on the floor. */
  dropWeapon(weapon: WeaponInstance, dropX?: number, dropY?: number, onChest = false, reveal = true) {
    const p = this.player;
    const [x, y] = openSpot(this.dungeon, dropX ?? p.x - Math.cos(p.aim) * 20, dropY ?? p.y - Math.sin(p.aim) * 20);
    const chest = onChest ? this.add.image(x, y, 'chest-w-open').setOrigin(0.5, 0.8).setDepth(DEPTH.pickup + 0.2) : undefined;
    const sprite = this.add.image(x, y - (onChest && !reveal ? 25 : 4), `gun-${weapon.def.id}`).setDepth(DEPTH.pickup + 0.5);
    const glow = this.add.image(x, y - 4, 'glow').setDepth(DEPTH.pickup).setTint(hexToNum(E.cyan)).setScale(onChest ? 1.3 : 0.8).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD);
    sprite.setData('glow', glow);
    const pickup: Pickup = { kind: 'weapon', weapon: { ...weapon }, chest, revealT: onChest && reveal ? 0.55 : 0, tier: 0, x, y, vx: 0, vy: 0, value: 0, t: 0, magnet: false, sprite, dead: false };
    if (chest && reveal) this.tweens.add({ targets: chest, scaleX: 1.12, scaleY: 0.88, duration: 100, yoyo: true });
    this.pickups.push(pickup);
    return pickup;
  }

  private removePickup(p: Pickup) {
    if (!p.sprite.scene) return;
    p.dead = true;
    p.label?.destroy();
    const glow = p.sprite.getData('glow') as Img | undefined;
    if (glow) {
      this.tweens.killTweensOf(glow);
      glow.destroy();
    }
    if (p.chest) {
      this.tweens.killTweensOf(p.chest);
      p.chest.destroy();
    }
    this.tweens.killTweensOf(p.sprite);
    p.sprite.destroy();
  }

  pickupWeapon(p: Pickup) {
    if (p.dead || p.kind !== 'weapon' || !p.weapon || (p.revealT ?? 0) > 0 || this.mode !== 'play') return;
    if (this.run.weapons.some((w) => w.def.id === p.weapon!.def.id)) {
      ui.toast('已携带这把武器，地上的武器会保留', 1300);
      return;
    }
    this.chooseReward({ type: 'weapon-new', id: p.weapon.def.id, instance: p.weapon }, () => {
      this.removePickup(p);
      audio.select();
      this.mode = 'play';
    }, () => { this.mode = 'play'; });
  }

  collectCrystal(p: Pickup) {
    if (p.dead || p.kind !== 'crystal' || this.mode !== 'play') return;
    this.pruneCrystals();
    if (p.dead || this.time0 < this.nextCrystalCollectAt || this.run.armor >= this.run.mods.maxArmor) return;
    this.removePickup(p);
    const pl = this.player;
    const armorBefore = this.run.armor;
    this.run.armor = Math.min(this.run.mods.maxArmor, this.run.armor + CRYSTAL_RULES.armor);
    const restored = this.run.armor - armorBefore;
    this.nextCrystalCollectAt = this.time0 + CRYSTAL_RULES.collectCooldown;
    const c = ELEMENT_COLOR[p.element ?? 'rock'];
    this.fx.ring(pl.x, pl.y - 6, 22, c, 280, 2);
    this.fx.callout(pl.x, pl.y - 26, `护甲 +${restored}`, c);
    audio.select();
  }

  updatePickups(dt: number) {
    this.pruneCrystals();
    const pl = this.player;
    const radius = 34 * this.run.mods.pickupRadius + (this.run.pets.includes('dove') ? 50 * this.run.mods.petArea : 0);
    for (const p of this.pickups) {
      if (p.dead) continue;
      p.t += dt;
      if (p.kind === 'chest' || p.kind === 'wchest' || p.kind === 'weapon') {
        if (p.kind === 'weapon') {
          p.revealT = Math.max(0, (p.revealT ?? 0) - dt);
          const rise = 1 - (p.revealT / 0.55) ** 3;
          const hover = p.chest ? 4 + 21 * rise : 4;
          p.sprite.setY(Math.round(p.y - hover + Math.sin(p.t * 3) * 2));
          p.sprite.setAngle(Math.sin(p.t * 1.8) * (p.chest ? 5 : 2));
          const glow = p.sprite.getData('glow') as Img | undefined;
          glow?.setPosition(p.x, p.sprite.y + 3).setAlpha(0.3 + Math.sin(p.t * 3) * 0.1);
        }
        continue;
      }
      const canCollect = p.kind !== 'crystal' || (this.run.armor < this.run.mods.maxArmor && this.time0 >= this.nextCrystalCollectAt);
      if (!canCollect) p.magnet = false;
      if (canCollect && !p.magnet && p.t > 0.25 && (dist2(p.x, p.y, pl.x, pl.y) < radius * radius || (p.kind === 'heart' && dist2(p.x, p.y, pl.x, pl.y) < 26 * 26))) {
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
      if (canCollect && dist2(p.x, p.y, pl.x, pl.y - 4) < (pl.r + 6) ** 2 && this.mode === 'play') {
        if (p.kind === 'crystal') {
          this.collectCrystal(p);
          continue;
        }
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
    if (p.dead || (p.kind !== 'chest' && p.kind !== 'wchest') || this.mode !== 'play') return;
    if (p.kind === 'wchest') {
      // Roll once, then retain that exact instance on the floor through cancel/save/continue.
      const pool = WEAPON_ORDER.filter((id) => !this.run.weapons.some((w) => w.def.id === id));
      const def = WEAPONS[this.run.rng.pick(pool.length ? pool : WEAPON_ORDER)];
      const weapon: WeaponInstance = { def, cd: 0 };
      if (def.mag) weapon.ammo = magSize(weapon, this.run.mods.mag);
      this.removePickup(p);
      this.dropWeapon(weapon, p.x, p.y, true);
      this.fx.ring(p.x, p.y - 6, 36, E.cyan, 400);
      this.fx.sparks(p.x, p.y - 8, 10, 'ice');
      this.light.flash(p.x, p.y - 8, 65, E.cyan);
      audio.select();
      this.saveProgress();
      return;
    }
    p.dead = true;
    p.label?.destroy();
    (p.sprite.getData('glow') as Img | undefined)?.destroy();
    p.sprite.setTexture('chest-open');
    this.tweens.add({ targets: p.sprite, alpha: 0, delay: 900, duration: 300, onComplete: () => p.sprite.destroy() });
    this.fx.ring(p.x, p.y - 6, 50, E.yellow, 400);
    this.fx.glowPop(p.x, p.y - 8, 40, E.yellow, 400);
    this.fx.sparks(p.x, p.y - 8, 16, 'gold');
    this.light.flash(p.x, p.y - 8, 90, E.yellow);
    this.stop(0.08);
    audio.levelUp();
    const run = this.run;
    const items = rollChestChoices(run);
    const show = () => {
      this.mode = 'choose';
      ui.choices('技能宝箱', '选择一项奖励', items, run, (i) => {
        this.chooseReward(items[i], (taken) => {
          ui.chestReward(taken, run);
          this.mode = 'play';
        }, show);
      }, { tag: 'CHEST' });
    };
    show();
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
    const pets = PET_ORDER.filter((k) => !run.pets.includes(k));
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
          key = choice.type === 'upgrade' ? `upg-${choice.def.id}` : textTexture(this, '愈', { color: E.yellow, outline: E.ink });
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
    for (const p of this.pedestals) {
      p.item.setY(Math.round(p.y - 9 + Math.sin(this.time0 * 3 + p.x) * 2));
      p.glow.setY(p.item.y);
    }
  }

  collectPedestal(p: Pedestal) {
    if (this.mode !== 'play' || !this.pedestals.includes(p)) return;
    this.chooseReward(p.choice, (taken) => {
      ui.chestReward(taken, this.run);
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
      this.mode = 'play';
    }, () => { this.mode = 'play'; });
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

  gainXp(v: number) {
    const run = this.run;
    run.xp += v;
    // Each level drops a crystal; F near it opens the cards when the player is ready.
    const levels: number[] = [];
    while (run.xp >= run.xpNext) {
      run.xp -= run.xpNext;
      run.xpLevel++;
      run.xpNext = xpForLevel(run.xpLevel);
      levels.push(run.xpLevel);
    }
    levels.forEach((lv, i) => dropLevelToken(this, lv, i, levels.length));
  }

  /** A level-up crystal was activated with F: deal the three cards for that level. */
  openLevelUp(level: number) {
    if (this.mode !== 'play' || this.fusing) return;
    this.fx.ring(this.player.x, this.player.y - 4, 70, E.yellow, 400);
    const choices = rollChoices(this.run, 'level', level);
    const show = () => {
      this.mode = 'choose';
      ui.choices(
        '升级',
        `等级 ${level}`,
        choices,
        this.run,
        (i) => {
          if (i < 0) this.mode = 'play';
          else this.chooseReward(choices[i], () => { this.mode = 'play'; }, show);
        },
        { skip: '跳过这次升级' },
      );
    };
    show();
  }

  /** Resolve the replacement slot before changing the inventory or consuming a ground reward. */
  chooseReward(c: Choice, onTaken: (taken: Choice) => void, onCancel: () => void) {
    if (!choiceValid(this.run, c)) {
      // A floor weapon must never turn into a random reward or disappear when it is already owned.
      if (c.type === 'weapon-new' && c.instance) {
        ui.toast('已携带这把武器，地上的武器会保留', 1300);
        onCancel();
        return;
      }
      c = rollChoices(this.run, 'rare')[0];
    }
    const choice = c;
    if (choice.type === 'weapon-new' && this.run.weapons.length >= MAX_WEAPONS) {
      const run = this.run;
      this.mode = 'choose';
      const incoming = choice.instance ?? { def: WEAPONS[choice.id], cd: 0 };
      ui.weaponSwap(incoming, run, (index) => {
        if (this.run !== run) return;
        if (index < 0) onCancel();
        else onTaken(this.takeChoice(choice, index));
      });
    } else onTaken(this.takeChoice(choice));
  }

  /** Apply a choice; one that has gone stale (see choiceValid) is swapped for a fresh rare pick. Returns what was given. */
  takeChoice(c: Choice, replaceIndex?: number): Choice {
    if (!choiceValid(this.run, c)) {
      if (c.type === 'weapon-new' && c.instance) return c;
      c = rollChoices(this.run, 'rare')[0];
    }
    const replaced = applyChoice(this.run, c, replaceIndex);
    if (replaced) this.dropWeapon(replaced);
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
    return c;
  }

  checkFusions() {
    if (this.mode === 'dead' || this.mode === 'end' || this.mode === 'title' || this.mode === 'ascend' || this.fusing) return;
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
    });
  }

  updateHazards(dt: number) {
    const HAZARD_ELEMENT = { ember: 'fire', poison: 'grass', vortex: 'wind' } as const;
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
          this.damageEnemy(e, h.dmg, { src: h.src ?? '余烬', dot: true, color: COLOR[h.kind], element: HAZARD_ELEMENT[h.kind] });
          if (h.kind === 'poison' && !e.dead) e.status.chill = Math.max(e.status.chill, 0.5);
        }
        this.hurtProps(h.x, h.y, h.r, h.dmg);
      }
      if (h.t <= 0 && h.kind === 'vortex' && h.burst) {
        this.explode(h.x, h.y, h.r * 0.8, h.burst, { src: h.src ?? '黑洞', knock: 160, volume: 0.45 });
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

  /** Rotation and forward push for the melee weapon in hand, from the move being played out. */
  meleePose(dt: number, left: boolean): [number, number] {
    const m = this.melee.anim;
    if (!m) return [0, 0];
    m.t += dt;
    const k = Math.min(1, m.t / m.dur);
    const e = 1 - (1 - k) * (1 - k);
    const flip = left ? -1 : 1;
    let swing = 0;
    let reach = 0;
    switch (m.move) {
      case 'arc':
        swing = (-1.3 + 2.6 * e) * m.dir * flip;
        break;
      case 'smash':
        swing = (-2.2 + 2.4 * e) * flip;
        break;
      case 'slam':
        swing = (k < 0.4 ? -2.6 * (k / 0.4) : -2.6 + 2.9 * ((k - 0.4) / 0.6)) * flip;
        break;
      case 'spin':
        swing = e * TAU * flip;
        break;
      case 'whirl':
        swing = k * TAU * 2 * flip;
        break;
      case 'cross':
        swing = (k < 0.5 ? -1 + 4 * k : 1 - 4 * (k - 0.5)) * flip;
        break;
      default:
        reach = Math.sin(k * Math.PI) * 9;
    }
    if (k >= 1) this.melee.anim = undefined;
    return [swing, reach];
  }

  /** The picture of a weapon in hand right now: a bow drawn between shots, a gatling's barrels turning. */
  gunKey(w: WeaponInstance): string {
    const id = w.def.id;
    if (id === 'bow') return this.player.punch > 0.35 ? 'gun-bow' : 'gun-bow-drawn';
    if (id === 'gatling' && (w.spin ?? 0) > 0.05) return Math.floor(this.time0 * (8 + 34 * (w.spin ?? 0))) % 2 ? 'gun-gatling-b' : 'gun-gatling';
    return `gun-${id}`;
  }

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
      // Melee weapons act out the combo move; guns just kick back.
      const melee = held?.def.kind === 'slash';
      const [swing, reach] = melee ? this.meleePose(dt, left) : [0, 0];
      const hand = this.melee.anim?.hand ?? 0;
      if (held) {
        const lead = held.def.id === 'daggers' && hand === 1 ? 0 : reach;
        p.gun.setTexture(this.gunKey(held)).setOrigin(held.def.grip[0], held.def.grip[1]);
        p.gun.setPosition(Math.round(melee ? handX + Math.cos(p.aim) * lead : gx), Math.round(melee ? handY + Math.sin(p.aim) * lead : gy));
        // Reloading tips the muzzle down; a fresh swap swings the gun up from the hip.
        const reloading = !!held.def.mag && (held.reloadT ?? 0) > 0;
        const tilt = reloading ? (left ? -0.75 : 0.75) : 0;
        this.swapT = Math.max(0, this.swapT - dt);
        const sw = this.swapT / 0.2;
        const flourish = sw * 2.4 * (left ? -1 : 1);
        p.gun.setRotation(p.aim + swing + tilt + flourish).setScale(1, 1 - sw * 0.7).setFlipY(left).setDepth(Math.sin(p.aim) < -0.3 ? DEPTH.player - 0.1 : DEPTH.gun);
      }
      const dual = p.skillT > 0 && run.weapons.length > 1;
      // The twin daggers: the second one rides in the off hand and takes every other stab.
      const offDagger = held?.def.id === 'daggers' && !dual;
      p.gun2.setVisible((dual || offDagger) && this.mode === 'play');
      if (offDagger) {
        const lead = hand === 1 ? reach : 0;
        p.gun2.setTexture('gun-daggers').setOrigin(held.def.grip[0], held.def.grip[1]);
        p.gun2.setPosition(Math.round(handX - (left ? -4 : 4) + Math.cos(p.aim) * lead), Math.round(handY + 2 + Math.sin(p.aim) * lead)).setRotation(p.aim - swing * 0.6).setFlipY(left);
      } else if (dual) {
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
        // A thin warning that fills out to the strike's width as it comes due.
        const w = t.w ?? 6;
        g.lineStyle(Math.max(1, (2 + 4 * k) * (w / 6)), danger, 0.2 + 0.35 * Math.abs(Math.sin(t.t * 20)));
        g.lineBetween(t.x, t.y, t.x2!, t.y2!);
        if (t.w) {
          g.lineStyle(1, danger, 0.8);
          g.lineBetween(t.x, t.y, t.x2!, t.y2!);
        }
      }
    }
    for (const h of this.ehazards) {
      g.fillStyle(h.color, 0.35 + 0.1 * Math.sin(this.time0 * 10));
      g.fillCircle(h.x, h.y, h.r);
      g.lineStyle(1, h.color, 0.9);
      g.strokeCircle(h.x, h.y, h.r);
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
      if (v.kind === 'thrust') {
        const [x, y, a, r, w] = v.pts;
        const ext = r * Math.min(1, (1 - k) * 3 + 0.3);
        const cx = Math.cos(a);
        const cy = Math.sin(a);
        vg.fillStyle(v.color, 0.55 * k);
        vg.fillTriangle(x - cy * w, y + cx * w, x + cy * w, y - cx * w, x + cx * ext, y + cy * ext);
        vg.fillStyle(0xffffff, 0.95 * k);
        vg.fillTriangle(x - cy * w * 0.4, y + cx * w * 0.4, x + cy * w * 0.4, y - cx * w * 0.4, x + cx * ext, y + cy * ext);
        continue;
      }
      if (v.kind === 'slash') {
        const [x, y, a, r, half, dir = 1] = v.pts;
        const sweep = 1 - k;
        const span = half * 2 * Math.min(1, sweep * 2.5);
        vg.lineStyle(Math.max(1, Math.round(4 * k)), 0xffffff, 0.95 * k);
        vg.beginPath();
        if (dir >= 0) vg.arc(x, y, r * (0.8 + 0.2 * sweep), a - half, a - half + span);
        else vg.arc(x, y, r * (0.8 + 0.2 * sweep), a + half - span, a + half);
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
    const DUR: Record<string, number> = { rise: 0.2, drop: 0.24, emerge: 0.4, ooze: 0.32, swoop: 0.3, burrow: 0.3, smoke: 0.14, bones: 0.22, mist: 0.55, slam: 0.22, beam: 0.36, bubble: 0.4, roll: 0.3 };
    const dur = DUR[en.kind] ?? 0.3;
    const k = Math.min(1, en.t / dur);
    const s = a.scale;
    switch (en.kind) {
      case 'rise': {
        // Grows up out of the circle, overshooting a little.
        const h = k < 0.7 ? (k / 0.7) * 1.15 : 1.15 - ((k - 0.7) / 0.3) * 0.15;
        sp.setScale(s * (1 - (1 - k) * 0.3), s * h);
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
          this.fx.dust(a.x, a.y, heavy ? 12 : 6);
          this.fx.shake(heavy ? 0.12 : 0.04);
          if (heavy) this.fx.ring(a.x, a.y, 26, E.white, 260, 2);
        }
        if (k >= 1) sp.setScale(s * 1.25, s * 0.75);
        break;
      }
      case 'ooze': {
        // Bubbles up out of its puddle and wobbles into shape.
        const w = Math.sin(k * Math.PI * 3) * (1 - k) * 0.25;
        sp.setScale(s * (1.4 - 0.4 * k + w), s * (0.2 + 0.8 * k - w));
        break;
      }
      case 'swoop': {
        // Dives in from high up and to the side.
        const q = 1 - (1 - k) * (1 - k);
        sp.x += Math.round((1 - q) * 30 * (a.id % 2 ? 1 : -1));
        sp.y -= Math.round((1 - q) * 70);
        sp.setAlpha(Math.min(1, k * 3));
        break;
      }
      case 'burrow': {
        // Bursts up out of the ground in a little hop.
        sp.y -= Math.round(Math.sin(k * Math.PI) * 10);
        sp.setScale(s * (0.8 + 0.2 * k), s * Math.min(1.15, 0.3 + k));
        break;
      }
      case 'smoke':
        sp.setAlpha(k).setScale(s * (1.3 - 0.3 * k));
        break;
      case 'bones':
        // The bones snap together: a white flash, then its colours.
        if (k < 0.5) sp.setTintFill(0xffffff);
        sp.setScale(s * (1.2 - 0.2 * k));
        break;
      case 'mist':
        sp.setAlpha(0.9 * k);
        sp.y -= Math.round((1 - k) * 8);
        break;
      case 'beam':
        if (k < 0.6) sp.setTintFill(0xffffff);
        sp.setAlpha(Math.min(1, k * 2)).setScale(s * (1.25 - 0.25 * k));
        break;
      case 'bubble': {
        // Floats up from below, bobbing.
        sp.y += Math.round((1 - k) * 12);
        sp.x += Math.round(Math.sin(k * 9) * 2 * (1 - k));
        sp.setScale(s * (0.6 + 0.4 * k)).setAlpha(Math.min(1, k * 2.5));
        break;
      }
      case 'roll': {
        // Rolls in from the side, fuse fizzing.
        const q = 1 - (1 - k) * (1 - k);
        sp.x += Math.round((en.ox ?? 0) * (1 - q));
        sp.setRotation((1 - q) * (en.ox ?? 0) * -0.3);
        if (Math.random() < 0.5) this.fx.sparks(sp.x, sp.y - 8, 1, 'gold');
        break;
      }
      default:
        // Steps out of the rift as a black silhouette, then takes its colours.
        sp.setScale(s * (0.6 + 0.4 * k));
        if (k < 0.65) sp.setTintFill(hexToNum(E.ink));
        sp.setAlpha(Math.min(1, 0.3 + k));
    }
    const settle = en.kind === 'drop' || en.kind === 'slam' ? 0.12 : 0;
    if (en.t >= dur + settle) {
      a.enter = undefined;
      sp.setScale(s).setAlpha(a.kind === 'ghost' ? 0.9 : 1).setRotation(0);
    }
  }

  /** What shows on the floor before a monster arrives: a puddle, cracks, a shadow, smoke, bones flying in... */
  drawSpawnOmen(g: Phaser.GameObjects.Graphics, t: Telegraph, k: number) {
    const vg = this.gfx;
    const { x, y } = t;
    const col = t.color ?? 0xffffff;
    switch (t.style) {
      case 'ooze':
        g.fillStyle(col, 0.55);
        g.fillEllipse(x, y, 4 + 18 * k, 2 + 7 * k);
        g.fillStyle(0xffffff, 0.3);
        g.fillEllipse(x - 3 * k, y - 1, 4 * k, 1.5 * k);
        for (let i = 0; i < 3; i++) {
          const q = (this.time0 * 2 + i * 0.37) % 1;
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
          g.lineStyle(1, hexToNum(this.kit.palette.danger), 0.8);
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
        if (Math.random() < 0.25) this.fx.dust(x + rand(-5, 5), y, 1);
        break;
      case 'smoke':
        for (let i = 0; i < 7; i++) {
          const a = this.time0 * 4 + i * 0.9;
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
          const q = (this.time0 * 0.8 + i * 0.17) % 1;
          vg.fillStyle(0xffffff, 0.22 * (1 - q) * (0.5 + k));
          vg.fillEllipse(x + Math.sin(i * 1.7 + this.time0 * 2) * 7, y - q * 24, 6, 2);
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
          const q = (this.time0 * 1.5 + i * 0.19) % 1;
          vg.lineStyle(1, 0xffffff, 0.7 * (1 - q));
          vg.strokeCircle(x + Math.sin(i * 2.3) * 7, y - q * 20, 1.5 + q);
        }
        break;
    }
  }

  /** Summoning circles: rune ring, light pillar, dark rift, elite lightning, boss sigil. */
  drawSummon(g: Phaser.GameObjects.Graphics, t: Telegraph, k: number, danger: number) {
    if (t.style) this.drawSpawnOmen(g, t, k);
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
    if (this.usesTouchControls() && !this.touch?.firing) return;
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
