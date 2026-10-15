import Phaser from 'phaser';
import { TAU, angleDiff, clamp, dist, dist2, hexToNum, lerp, segCircle } from '../core/math';
import { Rng, rand } from '../core/rng';
import type { Element } from '../core/stats';
import { audio } from '../audio/audio';
import { ENEMIES, AFFIXES, PETS, type Affix, type EnemyKind } from '../data/enemies';
import { SPELLS, SPELL_ORDER } from '../data/spells';
import { UPGRADE_BY_ID } from '../data/upgrades';
import { WEAPON_ORDER, weaponLevelCount, weaponLevelDamage, type WeaponInstance } from '../data/weapons';
import { E } from '../pixel/palette';
import { K, buildCommonTextures, buildKitTextures, buildRoom, textTexture } from '../styles/textures';
import type { StyleKit } from '../styles/types';
import { ui } from '../ui/ui';
import { ARENA, DIRS, DOOR, OPPOSITE, clampToArena, type Dir } from './arena';
import { bossDeath, spawnBoss, updateBoss } from './boss';
import { updateEnemyAI } from './enemyAI';
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
import { generateFloor, neighbour, type Floor, type Room } from './floor';
import { DEPTH, Fx } from './fx';
import { syncPets, updatePets } from './pets';
import { LEVELS, applyChoice, evolutionsReady, newRun, rollChoices, xpForLevel, type Choice, type RunState } from './run';
import { clearSpellVisuals, updateSpells } from './spells';

type Mode = 'title' | 'play' | 'choose' | 'pause' | 'transition' | 'dead' | 'end';

interface Pedestal {
  x: number;
  y: number;
  ped: Img;
  item: Img;
  choice: Choice;
  id: string;
}

export class GameScene extends Phaser.Scene {
  run!: RunState;
  kit!: StyleKit;
  fx!: Fx;
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
  hazards: Hazard[] = [];
  pets: Pet[] = [];
  telegraphs: Telegraph[] = [];
  visuals: Visual[] = [];
  pedestals: Pedestal[] = [];
  bars: Partial<Record<Dir, Img>> = {};
  trapdoor?: Img;
  floor!: Floor;
  room!: Room;
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
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  autoFire = false;
  god = false;
  nextId = 1;
  boss?: Enemy;
  hudT = 0;
  params = new URLSearchParams(location.search);
  private closePause?: () => void;
  time0 = 0;
  aimX = 320;
  aimY = 120;

  constructor() {
    super('game');
  }

  create() {
    buildCommonTextures(this);
    this.fx = new Fx(this);
    this.floorGfx = this.add.graphics().setDepth(DEPTH.hazard);
    this.spellGfx = this.add.graphics().setDepth(DEPTH.pet - 0.5);
    this.gfx = this.add.graphics().setDepth(DEPTH.gfx);
    this.cursorGfx = this.add.graphics().setDepth(DEPTH.cursor);
    this.input.mouse?.disableContextMenu();
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,ESC,F,SHIFT,Q,E') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-ESC', () => this.togglePause());
    kb.on('keydown-F', () => {
      if (this.mode !== 'play') return;
      this.autoFire = !this.autoFire;
      ui.toast(this.autoFire ? '自动射击 开' : '自动射击 关', 900);
    });
    kb.on('keydown-Q', () => this.switchGun());
    kb.on('keydown-E', () => this.useSkill());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) this.useSkill();
    });
    this.input.on('wheel', () => this.switchGun());
    this.cameras.main.setBounds(0, 0, ARENA.w, ARENA.h).setRoundPixels(true);
    this.god = this.params.has('god');
    ui.mount(this.game.canvas);
    ui.title(async () => {
      await audio.init();
      this.startRun();
    });
  }

  // ---------------------------------------------------------------- run and floors

  startRun() {
    this.clearRoom(true);
    this.pets.forEach((p) => p.sprite.destroy());
    this.pets = [];
    this.run = newRun(this.params);
    this.combo = 0;
    this.pendingLevelUps = 0;
    this.autoFire = false;
    this.enterLevel(true);
  }

  enterLevel(first = false) {
    const kit = this.run.styles[this.run.level];
    this.kit = kit;
    buildKitTextures(this, kit);
    this.fx.setKit(kit);
    ui.applyTheme(kit);
    audio.setStyle(kit);
    if (!this.player) this.createPlayer();
    syncPets(this);
    this.ambient?.destroy();
    this.ambient = this.add
      .particles(0, 0, K('pt', kit), {
        x: { min: ARENA.left, max: ARENA.right },
        y: { min: ARENA.top, max: ARENA.bottom },
        lifespan: { min: 3000, max: 6000 },
        speedX: { min: -8, max: 8 },
        speedY: kit.id === 'volcano' || kit.id === 'factory' ? { min: -16, max: -4 } : { min: -3, max: 10 },
        alpha: { onUpdate: (_p: unknown, _k: string, t: number) => Math.sin(t * Math.PI) * 0.7 },
        frequency: 260,
        quantity: 1,
      } as any)
      .setDepth(DEPTH.particles + 0.5);
    this.floor = generateFloor(new Rng(this.run.seed + this.run.level * 7919), this.run.level);
    ui.showHud(true);
    ui.banner(`第 ${['一', '二', '三', '四'][this.run.level]} 层`, kit.name, kit.en, kit.subtitle, first ? 2400 : 2200);
    const startRoom = this.params.get('room') === 'boss' && first ? this.floor.boss : this.floor.start;
    this.enterRoom(startRoom);
    if (!first) this.cameras.main.fadeIn(420, 255, 255, 255);
  }

  createPlayer() {
    const shadow = this.add.image(0, 0, 'shadow').setDepth(DEPTH.shadow);
    const sprite = this.add.image(0, 0, 'knight-a').setDepth(DEPTH.player).setOrigin(0.5, 0.85);
    const gun = this.add.image(0, 0, 'gun-bolt').setDepth(DEPTH.gun);
    const gun2 = this.add.image(0, 0, 'gun-bolt').setDepth(DEPTH.gun - 0.2).setVisible(false);
    this.player = { x: ARENA.cx, y: ARENA.cy, vx: 0, vy: 0, r: 5, aim: -Math.PI / 2, iframes: 0, dashT: 0, dashCd: 0, dashX: 0, dashY: 0, trailT: 0, walkT: 0, sinceHit: 9, armorT: 0, skillT: 0, skillCd: 0, punch: 0, sprite, gun, gun2, shadow };
  }

  clearRoom(all = false) {
    for (const e of this.enemies) this.destroyEnemy(e);
    this.enemies = [];
    for (const p of [...this.pproj, ...this.eproj]) this.killProj(p, true);
    this.pproj = [];
    this.eproj = [];
    for (const p of this.pickups) {
      if (!all && p.kind === 'gem' && !p.dead) this.gainXp(p.value);
      (p.sprite.getData('glow') as Img | undefined)?.destroy();
      p.sprite.destroy();
    }
    this.pickups = [];
    this.obstacles.forEach((o) => o.sprite.destroy());
    this.obstacles = [];
    this.hazards = [];
    this.telegraphs = [];
    this.visuals = [];
    this.pedestals.forEach((p) => (p.ped.destroy(), p.item.destroy()));
    this.pedestals = [];
    Object.values(this.bars).forEach((b) => b?.destroy());
    this.bars = {};
    this.trapdoor?.destroy();
    this.trapdoor = undefined;
    this.boss = undefined;
    this.pendingSpawns = 0;
    clearSpellVisuals(this);
    ui.clearLabels();
  }

  /** Enter a room; `from` is the side of the previous room we walked out of. */
  enterRoom(room: Room, from?: Dir) {
    this.clearRoom();
    this.room = room;
    room.visited = true;
    for (const d of DIRS) {
      const n = neighbour(this.floor, room, d);
      if (n) n.seen = true;
    }
    const key = buildRoom(this, this.kit, room.seed, room.doors);
    this.bg?.destroy();
    this.bg = this.add.image(0, 0, key).setOrigin(0).setDepth(DEPTH.bg);
    this.decals?.destroy();
    this.decals = this.add.renderTexture(0, 0, ARENA.w, ARENA.h).setOrigin(0).setDepth(DEPTH.decal);
    const p = this.player;
    const [ex, ey] = from ? DOOR.entry[OPPOSITE[from]] : [ARENA.cx, ARENA.cy + 40];
    p.x = ex;
    p.y = ey;
    p.vx = p.vy = 0;
    p.iframes = Math.max(p.iframes, 0.6);
    this.pets.forEach((pet) => {
      pet.x = p.x + rand(-10, 10);
      pet.y = p.y + rand(-10, 10);
    });
    this.mode = 'play';
    this.waveIdx = 0;
    this.waveTimer = 0;
    this.hordeT = 0;
    const rng = new Rng(room.seed);
    const fresh = !room.cleared;
    switch (room.type) {
      case 'start':
        if (this.run.level === 0) {
          ui.label('hint1', ARENA.cx, ARENA.cy + 62, 'WASD 移动 · 鼠标瞄准射击', '#c0cbdc', 8);
          ui.label('hint2', ARENA.cx, ARENA.cy + 76, '空格 冲刺 · E 双持 · Q 换枪', '#c0cbdc', 8);
        }
        audio.setIntensity(0);
        break;
      case 'treasure':
        this.layoutObstacles(rng, 'open');
        if (!room.itemTaken) this.spawnPedestals(room);
        audio.setIntensity(0);
        break;
      case 'boss':
        this.layoutObstacles(rng, 'boss');
        if (fresh) {
          audio.setIntensity(2);
          this.time.delayedCall(700, () => {
            this.boss = spawnBoss(this, this.run.level === LEVELS - 1 ? 'boar' : 'guardian');
          });
        } else this.spawnTrapdoor();
        break;
      case 'horde':
        this.layoutObstacles(rng, 'open');
        if (fresh) {
          this.hordeDur = 22 + this.run.level * 5;
          this.spawnT = 0.6;
          this.swarmT = 6;
          audio.setIntensity(2);
          ui.toast(`尸潮来袭 · 坚持 ${this.hordeDur} 秒`, 1800);
        }
        break;
      default:
        this.layoutObstacles(rng, 'combat');
        if (fresh) {
          this.planWaves(rng);
          this.spawnWave(0);
          audio.setIntensity(1);
        } else audio.setIntensity(0);
    }
    this.setDoors(!fresh || room.type === 'start' || room.type === 'treasure', false);
  }

  setDoors(open: boolean, animate = true) {
    for (const d of DIRS) {
      if (!this.room.doors[d]) continue;
      const [x, y] = DOOR.pos[d];
      if (open) {
        const b = this.bars[d];
        if (b) {
          this.tweens.add({ targets: b, alpha: 0, duration: 200, onComplete: () => b.destroy() });
          this.fx.dust(x, y, 4);
        }
        delete this.bars[d];
      } else if (!this.bars[d]) {
        const img = this.add.image(x, y + (d === 'up' ? 4 : 0), d === 'up' || d === 'down' ? 'bars-h' : 'bars-v').setDepth(DEPTH.doors);
        if (animate) img.setAlpha(0);
        this.bars[d] = img;
        if (animate) this.tweens.add({ targets: img, alpha: 1, duration: 150 });
      }
    }
    if (animate) audio[open ? 'door' : 'block']();
  }

  get doorsOpen() {
    return Object.keys(this.bars).length === 0;
  }

  layoutObstacles(rng: Rng, kind: 'combat' | 'open' | 'boss') {
    const { cx, cy } = ARENA;
    const presets: [number, number][][] =
      kind === 'boss'
        ? [
            [
              [cx - 190, cy - 80],
              [cx + 190, cy - 80],
              [cx - 190, cy + 80],
              [cx + 190, cy + 80],
            ],
          ]
        : kind === 'open'
          ? [
              [
                [cx - 220, cy - 90],
                [cx + 220, cy - 90],
                [cx - 220, cy + 90],
                [cx + 220, cy + 90],
              ],
            ]
          : [
              [
                [cx - 150, cy - 70],
                [cx + 150, cy - 70],
                [cx - 150, cy + 70],
                [cx + 150, cy + 70],
              ],
              [
                [cx, cy],
                [cx - 110, cy],
                [cx + 110, cy],
              ],
              [
                [cx - 180, cy - 80],
                [cx - 60, cy - 26],
                [cx + 60, cy + 26],
                [cx + 180, cy + 80],
              ],
              [
                [cx - 100, cy - 75],
                [cx + 100, cy - 75],
                [cx - 100, cy + 75],
                [cx + 100, cy + 75],
                [cx - 230, cy],
                [cx + 230, cy],
              ],
              [],
            ];
    for (const [x, y] of rng.pick(presets)) this.addObstacle('pillar', x, y);
    if (kind !== 'combat') return;
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const x = rng.range(ARENA.left + 30, ARENA.right - 30);
        const y = rng.range(ARENA.top + 30, ARENA.bottom - 30);
        const nearDoor = DIRS.some((d) => dist(x, y, DOOR.entry[d][0], DOOR.entry[d][1]) < 50);
        if (!nearDoor && this.obstacles.every((o) => dist(o.x, o.y, x, y) > o.r + 30)) {
          this.addObstacle(rng.chance(0.55) ? 'barrel' : 'crate', x, y);
          break;
        }
      }
    }
  }

  addObstacle(kind: Obstacle['kind'], x: number, y: number) {
    const key = kind === 'pillar' ? K('pillar', this.kit) : kind;
    const sprite = this.add.image(Math.round(x), Math.round(y), key).setDepth(DEPTH.obstacle).setOrigin(0.5, 0.75);
    this.obstacles.push({ kind, x, y, r: kind === 'pillar' ? 9 : 6, hp: kind === 'pillar' ? 1e9 : kind === 'barrel' ? 10 : 14, sprite, dead: false });
  }

  // ---------------------------------------------------------------- spawning

  enemyKinds(): EnemyKind[] {
    const depth = this.room?.depth ?? 0;
    return (Object.keys(ENEMIES) as EnemyKind[]).filter((k) => ENEMIES[k].minLevel <= this.run.level || depth >= 3);
  }

  planWaves(rng: Rng) {
    const level = this.run.level;
    const depth = Math.min(this.room.depth, 5);
    const budget = 9 + level * 7 + depth * 1.6;
    const waveCount = depth >= 3 ? 3 : 2;
    const kinds = this.enemyKinds();
    let elites = rng.chance(0.15 + level * 0.12 + depth * 0.03) ? 1 : 0;
    this.waves = [];
    for (let w = 0; w < waveCount; w++) {
      let left = Math.round((budget * (0.8 + w * 0.25)) / waveCount);
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

  /** A point on the floor away from the player and the doors. */
  spawnPoint(minDist = 110): [number, number] {
    const rng = this.run.rng;
    const p = this.player;
    for (let i = 0; i < 40; i++) {
      const x = rng.range(ARENA.left + 14, ARENA.right - 14);
      const y = rng.range(ARENA.top + 14, ARENA.bottom - 14);
      if (dist2(x, y, p.x, p.y) < minDist * minDist) continue;
      if (this.obstacles.some((o) => !o.dead && dist2(o.x, o.y, x, y) < (o.r + 10) ** 2)) continue;
      return [x, y];
    }
    return [p.x < ARENA.cx ? ARENA.right - 30 : ARENA.left + 30, ARENA.cy];
  }

  spawnWave(i: number) {
    for (const s of this.waves[i]) {
      const [x, y] = this.spawnPoint();
      this.queueSpawn(s.kind, x, y, s.elite);
    }
  }

  queueSpawn(kind: EnemyKind, x: number, y: number, elite = false, mini = false, delay = 0.7) {
    this.pendingSpawns++;
    this.telegraphs.push({
      kind: 'spawn',
      x,
      y,
      r: elite ? 14 : 9,
      t: 0,
      dur: delay,
      onDone: () => {
        this.pendingSpawns--;
        if (this.mode === 'dead' || this.mode === 'end') return;
        this.spawnEnemy(kind, x, y, elite, mini);
      },
    });
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number, elite = false, mini = false): Enemy {
    const def = ENEMIES[kind];
    const { level, rng } = this.run;
    const depth = this.room?.depth ?? 0;
    const scaleHp = (1 + level * 0.65 + depth * 0.08) * (mini ? 0.5 : 1);
    const affix: Affix | undefined = elite ? rng.pick(Object.keys(AFFIXES) as Affix[]) : undefined;
    const hp = def.hp * scaleHp * (elite ? 5 : 1) * (affix === 'tough' ? 1.4 : 1);
    const size = elite ? 1.6 : mini ? 0.8 : 1;
    [x, y] = clampToArena(x, y, 8);
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
      this.fx.callout(x, y - 18, AFFIXES[affix!], this.kit.palette.danger, 10);
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
    const room = this.room;
    if (room.cleared || this.mode !== 'play') return;
    const alive = this.enemies.filter((e) => !e.dead && !e.boss).length;
    switch (room.type) {
      case 'combat': {
        this.waveTimer += dt;
        const waveSize = this.waves[this.waveIdx]?.length ?? 1;
        if (this.waveIdx < this.waves.length - 1 && (alive + this.pendingSpawns <= Math.floor(waveSize * 0.3) || this.waveTimer > 9)) {
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
          if (this.spawnT <= 0 && alive < 60 + this.run.level * 20) {
            this.spawnT = lerp(0.9, 0.38, k) / (1 + this.run.level * 0.2);
            const [x, y] = this.spawnPoint(140);
            const n = 2 + Math.floor(k * 3) + this.run.level;
            for (let i = 0; i < n; i++) {
              const kind = this.run.rng.weighted(this.enemyKinds(), (q) => ENEMIES[q].weight);
              this.queueSpawn(kind, x + rand(-14, 14), y + rand(-14, 14), false, false, 0.45);
            }
          }
          this.swarmT -= dt;
          if (this.swarmT <= 0) {
            this.swarmT = 8;
            this.swarm();
          }
        } else if (alive === 0 && this.pendingSpawns === 0) this.onRoomCleared();
        break;
      }
      case 'boss': {
        this.spawnT -= dt;
        if (this.boss && !this.boss.dead && this.spawnT <= 0 && alive < 10) {
          this.spawnT = 3.5;
          const [x, y] = this.spawnPoint(140);
          for (let i = 0; i < 3; i++) this.queueSpawn(this.run.rng.pick(['wanderer', 'bat'] as EnemyKind[]), x + rand(-12, 12), y + rand(-12, 12), false, false, 0.5);
        }
        break;
      }
    }
  }

  /** Vampire Survivors moments inside a room: a bat stream from one side, or a ring of slimes closing in. */
  swarm() {
    const run = this.run;
    const p = this.player;
    if (run.rng.chance(0.5)) {
      const fromLeft = p.x > ARENA.cx;
      const x = fromLeft ? ARENA.left + 8 : ARENA.right - 8;
      const n = 8 + run.level * 4;
      for (let i = 0; i < n; i++) {
        const e = this.spawnEnemy('bat', x, clamp(p.y + rand(-70, 70), ARENA.top + 8, ARENA.bottom - 8));
        e.state = 'swarm';
        e.facing = fromLeft ? 0 : Math.PI;
      }
      ui.toast('蝙蝠群', 800);
    } else {
      const n = 10 + run.level * 4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const [x, y] = clampToArena(p.x + Math.cos(a) * 110, p.y + Math.sin(a) * 80, 10);
        this.queueSpawn('wanderer', x, y);
      }
      ui.toast('包围', 800);
    }
  }

  // ---------------------------------------------------------------- update

  update(_t: number, dms: number) {
    const realDt = Math.min(dms, 50) / 1000;
    this.fx.update(realDt);
    if (!this.kit) return;
    const ptr = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
    this.aimX = wp.x;
    this.aimY = wp.y;
    this.drawCursor();
    if (this.mode === 'title' || this.mode === 'pause' || this.mode === 'choose' || this.mode === 'end') {
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
    if (this.mode === 'play') {
      this.updatePlayer(dt);
      this.updateWeapons(dt);
      updateSpells(this, dt);
    }
    this.updateProjectiles(dt);
    this.updateEnemies(dt);
    updatePets(this, dt);
    this.updatePickups(dt);
    this.updateHazards(dt);
    this.updateTelegraphs(dt);
    if (this.mode === 'play') {
      this.updateRoom(dt);
      this.updateExits();
    }
    this.comboT -= dt;
    if (this.comboT <= 0 && this.combo > 0) this.combo = 0;
    if (this.comboT < -2) this.run.frenzyStacks = Math.max(0, this.run.frenzyStacks - dt * 4);
    this.gemT -= dt;
    if (this.gemT <= 0) this.gemStreak = 0;
    this.drawWorld(dt);
    this.hudTick(realDt);
  }

  hudTick(dt: number) {
    if (!this.run || !this.floor) return;
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
      guns: run.weapons.map((w, i) => ({ id: w.def.id, level: w.level, held: i === run.held })),
      gunCd: held ? clamp(held.cd / held.def.cooldown, 0, 1) : 0,
      skill: p.skillT > 0 ? 1 : 1 - clamp(p.skillCd / 14, 0, 1),
      skillActive: p.skillT > 0,
      spells: run.spells.map((s) => ({ id: s.id, level: s.level, evolved: s.evolved })),
      pets: run.pets,
      level: run.level,
      styleName: this.kit.name,
      timer: this.room.type === 'horde' && !this.room.cleared ? Math.max(0, this.hordeDur - this.hordeT) : 0,
      kills: run.kills,
      combo: this.combo,
      map: [...this.floor.rooms.values()].map((r) => ({ gx: r.gx, gy: r.gy, type: r.type, visited: r.visited, seen: r.seen, current: r === this.room, cleared: r.cleared })),
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
      p.vx = p.dashX * 320;
      p.vy = p.dashY * 320;
      p.trailT -= dt;
      if (p.trailT <= 0) {
        p.trailT = 0.025;
        const ghost = this.add.image(Math.round(p.x), Math.round(p.y), p.sprite.texture.key).setOrigin(0.5, 0.85).setFlipX(p.sprite.flipX).setDepth(DEPTH.player - 1).setAlpha(0.6);
        ghost.setTintFill(hexToNum(E.cyan));
        this.tweens.add({ targets: ghost, alpha: 0, duration: 200, onComplete: () => ghost.destroy() });
      }
    } else {
      const speed = 92 * this.run.mods.moveSpeed;
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
    [p.x, p.y] = clampToArena(p.x, p.y, p.r);
    const moving = Math.hypot(p.vx, p.vy) > 20;
    if (moving) p.walkT += dt;
    p.sprite.setTexture(moving && Math.floor(p.walkT * 8) % 2 ? 'knight-b' : 'knight-a');
  }

  /** Walk into an open doorway to move to the next room. */
  updateExits() {
    if (!this.doorsOpen) return;
    const p = this.player;
    const h = DOOR.half - 3;
    for (const d of DIRS) {
      if (!this.room.doors[d]) continue;
      const hit =
        (d === 'up' && Math.abs(p.x - ARENA.cx) < h && p.y <= ARENA.top + p.r + 1) ||
        (d === 'down' && Math.abs(p.x - ARENA.cx) < h && p.y >= ARENA.bottom - p.r - 1) ||
        (d === 'left' && Math.abs(p.y - ARENA.cy) < h && p.x <= ARENA.left + p.r + 1) ||
        (d === 'right' && Math.abs(p.y - ARENA.cy) < h && p.x >= ARENA.right - p.r - 1);
      if (hit) {
        this.goThrough(d);
        return;
      }
    }
  }

  goThrough(d: Dir) {
    const next = neighbour(this.floor, this.room, d);
    if (!next) return;
    this.mode = 'transition';
    const cam = this.cameras.main;
    cam.fadeOut(110, 11, 10, 18);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.enterRoom(next, d);
      cam.fadeIn(150, 11, 10, 18);
      if (next.type === 'treasure' && !next.itemTaken) ui.toast('宝箱房 · 三选一', 1200);
      if (next.type === 'boss' && !next.cleared) audio.roar();
    });
  }

  switchGun() {
    const run = this.run;
    if (this.mode !== 'play' || !run || run.weapons.length < 2) return;
    run.held = (run.held + 1) % run.weapons.length;
    audio.select();
    ui.toast(run.weapons[run.held].def.name, 700);
  }

  useSkill() {
    const p = this.player;
    if (this.mode !== 'play' || !p || p.skillCd > 0) return;
    p.skillT = 4;
    p.skillCd = 14;
    audio.levelUp();
    this.fx.ring(p.x, p.y - 4, 40, E.cyan, 300);
    this.fx.callout(p.x, p.y - 26, '双持！', E.cyan, 12);
  }

  fireRateMult() {
    const m = this.run.mods;
    const skill = this.player.skillT > 0 ? (this.run.weapons.length > 1 ? 1.3 : 1.8) : 1;
    return Math.max(0.2, m.fireRate * skill * (1 + Math.min(0.4, this.run.frenzyStacks * m.frenzy)));
  }

  updateWeapons(dt: number) {
    const run = this.run;
    const firing = this.input.activePointer.leftButtonDown() || this.autoFire;
    const rate = this.fireRateMult();
    const dual = this.player.skillT > 0 && run.weapons.length > 1;
    run.weapons.forEach((w, i) => {
      const active = i === run.held || dual;
      w.cd -= dt * rate;
      if (active && firing && w.cd <= 0) {
        this.fire(w, i !== run.held);
        w.cd += w.def.cooldown;
        if (w.cd < 0) w.cd = 0;
      } else if (w.cd < 0) w.cd = 0;
    });
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
    const a = p.aim + rand(-0.03, 0.03);
    const [ox, oy] = this.muzzle(offhand);
    switch (def.id) {
      case 'bolt':
        for (let i = 0; i < count; i++) this.spawnProj('bolt', ox, oy, a + (i - (count - 1) / 2) * 0.09, speed, range / speed, def.size * area, dmg, pierce, knock, def.name);
        this.recoil(a, 14);
        break;
      case 'spread': {
        const n = def.count + extra * 2;
        const cone = ((def.spreadDeg * Math.PI) / 180) * (1 + extra * 0.08);
        for (let i = 0; i < n; i++) {
          const sp = speed * rand(0.85, 1.12);
          this.spawnProj('pellet', ox, oy, a + rand(-cone / 2, cone / 2), sp, (range / sp) * rand(0.8, 1), def.size * area, dmg, pierce, knock, def.name);
        }
        this.recoil(a, 60);
        this.fx.shake(0.06);
        break;
      }
      case 'beam':
        for (let i = 0; i < count; i++) this.castBeam(ox, oy, a + (i - (count - 1) / 2) * 0.17, range, def.size * area, dmg, pierce, knock, def.name);
        this.recoil(a, 30);
        this.fx.shake(0.04);
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
          const [cx, cy] = clampToArena(tx + (i ? rand(-30, 30) : 0), ty + (i ? rand(-30, 30) : 0), 6);
          this.spawnShell(ox, oy, cx, cy, Math.max(0.28, 0.5 / m.speed), def.size * area, dmg, pierce, knock);
        }
        this.recoil(a, 30);
        break;
      }
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
    }
    this.fx.muzzle(ox, oy, a);
    audio.shoot(def.id);
  }

  recoil(a: number, amount: number) {
    this.player.vx -= Math.cos(a) * amount;
    this.player.vy -= Math.sin(a) * amount;
    this.player.punch = 1;
  }

  // ---------------------------------------------------------------- projectiles

  spawnProj(kind: ProjKind, x: number, y: number, a: number, speed: number, life: number, r: number, dmg: number, pierce: number, knock: number, src: string): Proj {
    const enemy = kind === 'ebullet' || kind === 'ebig';
    const tkey: Record<ProjKind, string> = { bolt: 'b-bolt', pellet: 'b-pellet', blade: 'b-blade', shell: 'b-shell', shard: 'b-shard', orb: 'b-orb', axe: 'b-axe', ebullet: K('ebullet', this.kit), ebig: K('ebullet-big', this.kit) };
    const sprite = this.add.image(x, y, tkey[kind]).setDepth(enemy ? DEPTH.ebullet : DEPTH.proj).setRotation(kind === 'bolt' ? a : 0);
    const base: Record<ProjKind, number> = { bolt: 3, pellet: 2.5, blade: 5, shell: 3, shard: 2, orb: 3, axe: 4, ebullet: 3, ebig: 5 };
    sprite.setScale(Math.max(0.6, r / base[kind]));
    // Player shots sweep from the body centre, so point-blank enemies still get hit.
    const [px, py] = enemy ? [x, y] : [this.player.x, this.player.y - 4];
    const p: Proj = { kind, x, y, px, py, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r, dmg, pierce, life, knock, src, sprite, hit: new Set(), dead: false };
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

  updateProjectiles(dt: number) {
    const pl = this.player;
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
      } else if (p.kind === 'orb' && p.homing) {
        let best: Enemy | undefined;
        let bd = 200 * 200;
        for (const e of this.enemies) {
          if (e.dead || p.hit.has(e)) continue;
          const d = dist2(p.x, p.y, e.x, e.y);
          if (d < bd) {
            bd = d;
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
        }
      } else if (p.kind === 'axe') {
        p.vy += (p.gravity ?? 0) * dt;
        p.sprite.rotation += dt * (p.spin ?? 14);
      } else if (p.kind === 'bolt') {
        p.sprite.rotation = Math.atan2(p.vy, p.vx);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.killProj(p);
        continue;
      }
      if (p.x < ARENA.left || p.x > ARENA.right || p.y < ARENA.top - (p.kind === 'axe' ? 200 : 0) || p.y > ARENA.bottom) {
        if (p.kind === 'blade') {
          if (!p.returning) {
            p.returning = true;
            p.hit.clear();
          }
          [p.x, p.y] = clampToArena(p.x, p.y, 1);
        } else if (p.kind !== 'axe' || p.y > ARENA.bottom) {
          this.killProj(p);
          continue;
        }
      }
      if (p.kind === 'bolt' || p.kind === 'pellet' || p.kind === 'shard' || p.kind === 'orb') {
        let blocked = false;
        for (const o of this.obstacles) {
          if (!o.dead && dist2(p.x, p.y, o.x, o.y) < (o.r + p.r) ** 2) {
            if (o.kind !== 'pillar') this.damageObstacle(o, p.dmg);
            blocked = true;
            break;
          }
        }
        if (blocked) {
          this.killProj(p);
          continue;
        }
      }
      for (const e of this.enemies) {
        if (e.dead || p.hit.has(e)) continue;
        if (!segCircle(p.px ?? p.x, p.py ?? p.y, p.x, p.y, e.x, e.y - 3, e.r + p.r)) continue;
        const inA = Math.atan2(-p.vy, -p.vx);
        if (e.kind === 'shield' && Math.abs(angleDiff(e.facing, inA)) < 1.0 && e.status.frozen <= 0 && p.kind !== 'axe') {
          this.fx.sparks(p.x, p.y, 4, 'white');
          audio.block();
          if (p.kind === 'blade') {
            p.hit.add(e);
            continue;
          }
          this.killProj(p, true);
          break;
        }
        const sp = Math.hypot(p.vx, p.vy) || 1;
        this.damageEnemy(e, p.dmg, { src: p.src, kx: p.vx / sp, ky: p.vy / sp, knock: p.knock, element: p.element });
        p.hit.add(e);
        if (p.kind === 'blade' || p.kind === 'axe') continue;
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
      if (p.life <= 0 || p.x < ARENA.left - 6 || p.x > ARENA.right + 6 || p.y < ARENA.top - 6 || p.y > ARENA.bottom + 6) {
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
    const h = Math.sin(Math.PI * t) * (30 + dist(p.ox!, p.oy!, p.tx!, p.ty!) * 0.15);
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
    for (let seg = 0; seg <= reflections && left > 0; seg++) {
      const tx = dx > 0 ? (ARENA.right - cx) / dx : dx < 0 ? (ARENA.left - cx) / dx : Infinity;
      const ty = dy > 0 ? (ARENA.bottom - cy) / dy : dy < 0 ? (ARENA.top - cy) / dy : Infinity;
      const tWall = Math.min(tx, ty);
      const len = Math.min(left, tWall);
      const ex = cx + dx * len;
      const ey = cy + dy * len;
      for (const e of this.enemies) {
        if (e.dead || hitSet.has(e)) continue;
        if (segCircle(cx, cy, ex, ey, e.x, e.y - 3, e.r + width / 2)) {
          hitSet.add(e);
          this.damageEnemy(e, dmg, { src, kx: dx, ky: dy, knock, ignoreShield: true });
        }
      }
      for (const o of this.obstacles) {
        if (!o.dead && o.kind !== 'pillar' && segCircle(cx, cy, ex, ey, o.x, o.y, o.r)) this.damageObstacle(o, dmg);
      }
      pts.push(ex, ey);
      left -= len;
      if (len < tWall) break;
      if (tWall === tx) dx = -dx;
      else dy = -dy;
      cx = ex;
      cy = ey;
      this.fx.sparks(ex, ey, 5, 'ice');
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
      const score = d * (1 + off * 2);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (!best) {
      this.visuals.push({ kind: 'chain', pts: this.jag(x, y, x + Math.cos(a) * range * 0.45, y + Math.sin(a) * range * 0.45), width: 1, t: 0, dur: 0.08, color: hexToNum(E.yellow) });
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
    o: { src: string; kx?: number; ky?: number; knock?: number; crit?: boolean; noCrit?: boolean; dot?: boolean; ignoreShield?: boolean; arc?: boolean; noElement?: boolean; color?: string; element?: Element },
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
      audio.hit(crit);
      this.fx.sparks(e.x, e.y - 4, crit ? 6 : 2, crit ? 'gold' : 'white');
      if (crit) {
        this.stop(0.025);
        this.fx.shake(0.03);
      }
    }
    this.fx.number(e.x, e.y - e.r * 2 - 4, dmg, { crit, small: o.dot, color: o.color });
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
      this.fx.callout(e.x, e.y - e.r * 2 - 12, name, color, 11);
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

  killEnemy(e: Enemy, src: string) {
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
    this.bloom(e.x, e.y, e.boss ? 2 : e.elite ? 2 : 1);
    this.stop(e.elite ? 0.08 : 0.012);
    if (e.elite) this.fx.shake(0.22);
    if (this.combo > 0 && this.combo % 25 === 0) this.fx.callout(this.player.x, this.player.y - 30, `${this.combo} 连杀！`, E.yellow, 12);
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
    } else if (Math.random() < 0.012) this.dropHeart(e.x, e.y);
    if (run.mods.healOnKill > 0 && Math.random() < run.mods.healOnKill) this.heal(1, e.x, e.y);
    if (run.mods.explodeOnKill > 0) this.explode(e.x, e.y, 30, e.maxHp * run.mods.explodeOnKill, { src: '连锁殉爆', small: true });
    if (e.kind === 'bomber') this.explode(e.x, e.y, 38, 18, { src: '炸弹怪', hurtsPlayer: 1 });
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
    audio.explode(!o.small && r > 40);
  }

  damageObstacle(o: Obstacle, dmg: number) {
    if (o.dead) return;
    o.hp -= dmg;
    o.sprite.setTintFill(0xffffff);
    this.time.delayedCall(50, () => o.sprite.active && o.sprite.clearTint());
    if (o.hp <= 0) {
      o.dead = true;
      o.sprite.destroy();
      if (o.kind === 'barrel') this.explode(o.x, o.y, 48, 30, { src: '爆炸桶', hurtsPlayer: 2, knock: 160 });
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
    if (this.mode !== 'play' || p.iframes > 0 || this.god) return false;
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
    this.time.delayedCall(1400, () => {
      this.mode = 'end';
      ui.showHud(false);
      ui.end(false, this.run, () => this.restart());
    });
  }

  restart() {
    this.player.sprite.setVisible(true);
    this.player.gun.setVisible(true);
    this.startRun();
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
      if (!(a.kind === 'boar' && a.state === 'charge') && a.kind !== 'bat') {
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
      [a.x, a.y] = clampToArena(a.x, a.y, a.r * 0.8);
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
    this.pickups.push({ kind: 'gem', tier, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, value, t: 0, magnet: !!this.room?.cleared, sprite, dead: false });
  }

  dropHeart(x: number, y: number) {
    const sprite = this.add.image(Math.round(x), Math.round(y), 'heart').setDepth(DEPTH.pickup);
    this.pickups.push({ kind: 'heart', tier: 0, x, y, vx: 0, vy: -20, value: 1, t: 0, magnet: false, sprite, dead: false });
  }

  dropChest(x: number, y: number) {
    const [cx, cy] = clampToArena(x, y, 12);
    const sprite = this.add.image(Math.round(cx), Math.round(cy), 'chest').setDepth(DEPTH.pickup + 0.5).setOrigin(0.5, 0.8);
    const glow = this.add.image(cx, cy - 4, 'glow').setDepth(DEPTH.pickup).setTint(hexToNum(E.yellow)).setScale(1.6).setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: 0.2, yoyo: true, repeat: -1, duration: 500 });
    sprite.setData('glow', glow);
    this.pickups.push({ kind: 'chest', tier: 0, x: cx, y: cy, vx: 0, vy: 0, value: 0, t: 0, magnet: false, sprite, dead: false });
  }

  updatePickups(dt: number) {
    const pl = this.player;
    const radius = 34 * this.run.mods.pickupRadius + (this.run.pets.includes('dove') ? 50 : 0);
    for (const p of this.pickups) {
      if (p.dead) continue;
      p.t += dt;
      if (p.kind === 'chest') {
        if (this.mode === 'play' && dist2(p.x, p.y, pl.x, pl.y) < 14 * 14) this.openChest(p);
        continue;
      }
      if (!p.magnet && p.t > 0.25 && (dist2(p.x, p.y, pl.x, pl.y) < radius * radius || (p.kind === 'heart' && dist2(p.x, p.y, pl.x, pl.y) < 20 * 20))) p.magnet = true;
      if (p.magnet && this.mode !== 'dead') {
        const a = Math.atan2(pl.y - 4 - p.y, pl.x - p.x);
        p.vx += Math.cos(a) * 900 * dt;
        p.vy += Math.sin(a) * 900 * dt;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 360) {
          p.vx *= 360 / sp;
          p.vy *= 360 / sp;
        }
      } else {
        const f = Math.exp(-dt * 5);
        p.vx *= f;
        p.vy *= f;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      [p.x, p.y] = clampToArena(p.x, p.y, 3);
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
    p.sprite.setTexture('chest-open');
    this.tweens.add({ targets: p.sprite, alpha: 0, delay: 900, duration: 300, onComplete: () => p.sprite.destroy() });
    this.fx.ring(p.x, p.y - 6, 60, E.yellow, 400);
    this.fx.glowPop(p.x, p.y - 8, 40, E.yellow, 400);
    this.fx.sparks(p.x, p.y - 8, 16, 'gold');
    this.stop(0.08);
    audio.levelUp();
    const run = this.run;
    const evo = evolutionsReady(run);
    let c: Choice;
    if (evo.length) c = evo[0];
    else {
      const ups = run.spells.filter((s) => s.level < 5).map((s) => ({ type: 'spell-up', id: s.id }) as Choice);
      c = ups.length && run.rng.chance(0.6) ? run.rng.pick(ups) : rollChoices(run, 'rare')[0];
    }
    this.takeChoice(c);
    ui.chestReward(c, run);
  }

  /** Treasure room: three items on pedestals, take one and the others vanish. */
  spawnPedestals(room: Room) {
    const run = this.run;
    if (!room.items) {
      const items: Choice[] = [];
      const guns = WEAPON_ORDER.filter((id) => !run.weapons.some((w) => w.def.id === id));
      if (guns.length) items.push({ type: 'weapon-new', id: run.rng.pick(guns) });
      const spellsNew = SPELL_ORDER.filter((id) => !run.spells.some((s) => s.id === id));
      if (spellsNew.length && run.spells.length < 4) items.push({ type: 'spell-new', id: run.rng.pick(spellsNew) });
      else {
        const up = run.spells.find((s) => s.level < 5);
        if (up) items.push({ type: 'spell-up', id: up.id });
      }
      const pets = (['hound', 'dove', 'swan'] as const).filter((k) => !run.pets.includes(k));
      if (pets.length) items.push({ type: 'pet', kind: run.rng.pick(pets) });
      while (items.length < 3) items.push(rollChoices(run, 'rare')[0]);
      room.items = items.slice(0, 3);
    }
    room.items.forEach((choice, i) => {
      const x = ARENA.cx + (i - 1) * 96;
      const y = ARENA.cy + 6;
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
          key = textTexture(this, choice.type === 'upgrade' ? choice.def.glyph : '愈', { size: 12, color: E.yellow, outline: E.ink });
      }
      const item = this.add.image(x, y - 8, key).setDepth(DEPTH.obstacle + 0.5).setScale(choice.type === 'weapon-new' ? 1.5 : 2);
      const glow = this.add.image(x, y - 8, 'glow').setDepth(DEPTH.obstacle + 0.4).setTint(hexToNum(E.yellow)).setScale(1.4).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);
      item.setData('glow', glow);
      const d = ui.describe(choice, run);
      const id = `ped${i}`;
      ui.label(id, x, y + 24, d.name, E.white, 8);
      ui.label(`${id}t`, x, y + 34, d.tag, d.tagColor, 7);
      this.pedestals.push({ x, y, ped, item, choice, id });
    });
  }

  updatePedestals() {
    if (!this.pedestals.length || this.mode !== 'play') return;
    const pl = this.player;
    for (const p of this.pedestals) {
      p.item.setY(Math.round(p.y - 9 + Math.sin(this.time0 * 3 + p.x) * 2));
      (p.item.getData('glow') as Img).setY(p.item.y);
      if (dist2(p.x, p.y, pl.x, pl.y) < 14 * 14) {
        this.takeChoice(p.choice);
        ui.chestReward(p.choice, this.run);
        this.room.itemTaken = true;
        this.fx.ring(p.x, p.y - 8, 50, E.yellow, 400);
        this.fx.sparks(p.x, p.y - 8, 16, 'gold');
        audio.levelUp();
        for (const q of this.pedestals) {
          (q.item.getData('glow') as Img).destroy();
          q.item.destroy();
          ui.unlabel(q.id);
          ui.unlabel(`${q.id}t`);
          if (q !== p) this.fx.dust(q.x, q.y - 8, 8);
        }
        this.pedestals.forEach((q) => q.ped.setAlpha(0.6));
        this.pedestals = [];
        return;
      }
    }
  }

  spawnTrapdoor() {
    const final = this.run.level === LEVELS - 1;
    const x = ARENA.cx;
    const y = ARENA.cy + 30;
    this.trapdoor = this.add.image(x, y, final ? 'bloom' : 'trapdoor').setDepth(DEPTH.decal + 0.5).setScale(final ? 3 : 1);
    ui.label('trap', x, y + 20, final ? '走到花上 · 结束轮回' : '下一层', E.yellow, 9);
  }

  updateTrapdoor() {
    if (!this.trapdoor || this.mode !== 'play') return;
    const p = this.player;
    if (dist2(p.x, p.y, this.trapdoor.x, this.trapdoor.y) > 12 * 12) return;
    this.mode = 'transition';
    this.trapdoor = undefined;
    audio.select();
    const cam = this.cameras.main;
    cam.fadeOut(500, 255, 255, 255);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (this.run.level === LEVELS - 1) {
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
    while (run.xp >= run.xpNext) {
      run.xp -= run.xpNext;
      run.xpLevel++;
      run.xpNext = xpForLevel(run.xpLevel);
      this.pendingLevelUps++;
    }
    if (this.pendingLevelUps > 0 && this.mode === 'play') this.openLevelUp();
  }

  openLevelUp() {
    if (this.pendingLevelUps <= 0 || this.mode !== 'play') return;
    this.mode = 'choose';
    audio.levelUp();
    this.fx.ring(this.player.x, this.player.y - 4, 90, E.yellow, 400);
    this.fx.flash(E.white, 0.2, 240);
    const choices = rollChoices(this.run, 'level');
    ui.choices('升级！', `等级 ${this.run.xpLevel - this.pendingLevelUps + 1}`, choices, this.run, (i) => {
      this.takeChoice(choices[i]);
      this.pendingLevelUps--;
      this.mode = 'play';
      if (this.pendingLevelUps > 0) this.time.delayedCall(120, () => this.openLevelUp());
    });
  }

  takeChoice(c: Choice) {
    applyChoice(this.run, c);
    if (c.type === 'pet') {
      syncPets(this);
      ui.toast(`${PETS[c.kind].name} 加入了队伍`);
    } else if (c.type === 'evolve') {
      this.fx.flash(E.yellow, 0.4, 500);
      this.fx.ring(this.player.x, this.player.y, 160, E.yellow, 600, 3);
      ui.toast(`进化：${SPELLS[c.id].evolved.name}`, 1600);
    } else if (c.type === 'upgrade') ui.toast(UPGRADE_BY_ID[c.def.id].name, 800);
  }

  updateHazards(dt: number) {
    for (const h of this.hazards) {
      h.t -= dt;
      h.tick -= dt;
      if (h.tick <= 0) {
        h.tick = 0.3;
        for (const e of this.enemies) if (!e.dead && dist2(e.x, e.y, h.x, h.y) < (h.r + e.r) ** 2) this.damageEnemy(e, h.dmg, { src: '余烬', dot: true, color: ELEMENT_COLOR.fire });
      }
    }
    this.hazards = this.hazards.filter((h) => h.t > 0);
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

  /** Doors open, a reward may drop. Boss rooms leave a trapdoor (or the final bloom). */
  onRoomCleared(bossDown = false) {
    const room = this.room;
    if (room.cleared) return;
    room.cleared = true;
    audio.setIntensity(0);
    this.pickups.forEach((p) => p.kind === 'gem' && (p.magnet = true));
    if (this.run.pets.includes('dove')) this.heal(1, this.player.x, this.player.y);
    this.setDoors(true);
    const rng = this.run.rng;
    if (bossDown) {
      this.time.delayedCall(1600, () => this.spawnTrapdoor());
      return;
    }
    ui.toast('房间清空', 900);
    const { cx, cy } = ARENA;
    if (room.type === 'horde') this.dropChest(cx, cy);
    else {
      const r = rng.next();
      if (r < 0.18) this.dropChest(cx, cy);
      else if (r < 0.4) this.dropHeart(cx, cy);
      else if (r < 0.7) for (let i = 0; i < 4; i++) this.dropGem(cx + rand(-16, 16), cy + rand(-10, 10), 2);
    }
  }

  victory() {
    this.mode = 'end';
    ui.showHud(false);
    ui.clearLabels();
    this.cameras.main.fadeIn(600, 255, 255, 255);
    ui.end(true, this.run, () => this.restart());
  }

  togglePause() {
    if (this.mode === 'play') {
      this.mode = 'pause';
      this.closePause = ui.pause(this.run, () => {
        this.mode = 'play';
        this.closePause = undefined;
      });
    } else if (this.mode === 'pause') {
      this.closePause?.();
      this.closePause = undefined;
      this.mode = 'play';
    }
  }

  // ---------------------------------------------------------------- drawing

  drawWorld(dt: number) {
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
        p.gun.setTexture(`gun-${held.def.id}`).setOrigin(held.def.grip[0], held.def.grip[1]);
        p.gun.setPosition(Math.round(gx), Math.round(gy)).setRotation(p.aim).setFlipY(left).setDepth(Math.sin(p.aim) < -0.3 ? DEPTH.player - 0.1 : DEPTH.gun);
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
    const danger = hexToNum(this.kit.palette.danger);
    for (const t of this.telegraphs) {
      const k = t.t / t.dur;
      if (t.kind === 'spawn') {
        g.lineStyle(1, danger, 0.5 + 0.5 * k);
        g.strokeCircle(t.x, t.y, t.r! * (1.8 - k));
        g.fillStyle(danger, 0.25 + 0.3 * k);
        g.fillCircle(t.x, t.y, Math.max(1, t.r! * k * 0.6));
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
      g.fillStyle(hexToNum(ELEMENT_COLOR.fire), 0.18 + 0.08 * Math.sin(this.time0 * 12));
      g.fillCircle(h.x, h.y, h.r);
    }
    const b = this.boss;
    if (b && !b.dead && b.boss) {
      const bs = b.boss;
      if (bs.armWarn > 0 || bs.armLive > 0) {
        for (let i = 0; i < bs.arms; i++) {
          const a = bs.armA + (i / bs.arms) * TAU;
          const x2 = b.x + Math.cos(a) * 700;
          const y2 = b.y + Math.sin(a) * 700;
          if (bs.armLive > 0) {
            g.lineStyle(10, danger, 0.35);
            g.lineBetween(b.x, b.y - 10, x2, y2);
            g.lineStyle(4, 0xffffff, 0.9);
            g.lineBetween(b.x, b.y - 10, x2, y2);
          } else {
            g.lineStyle(1, danger, 0.4 + 0.4 * Math.abs(Math.sin(this.time0 * 16)));
            g.lineBetween(b.x, b.y - 10, x2, y2);
          }
        }
      }
    }
    const vg = this.gfx;
    vg.clear();
    for (const v of this.visuals) {
      const k = 1 - v.t / v.dur;
      if (v.kind === 'beam') {
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
