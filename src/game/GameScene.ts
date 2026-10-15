import Phaser from 'phaser';
import { TAU, angleDiff, clamp, dist, dist2, hexToNum, segCircle } from '../core/math';
import { rand } from '../core/rng';
import type { Element } from '../core/stats';
import { audio } from '../audio/audio';
import { ENEMIES, AFFIXES, PETS, type Affix, type EnemyKind } from '../data/enemies';
import { UPGRADE_BY_ID } from '../data/upgrades';
import { weaponLevelCount, weaponLevelDamage, type WeaponInstance } from '../data/weapons';
import { K, buildCommonTextures, buildKitTextures } from '../styles/textures';
import type { StyleKit } from '../styles/types';
import { ui } from '../ui/ui';
import { ARENA, clampToArena } from './arena';
import { bossDeath, updateBoss, spawnBoss } from './boss';
import { updateEnemyAI } from './enemyAI';
import {
  ELEMENT_COLOR,
  ELEMENT_NAME,
  type Door,
  type DoorReward,
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
import { syncPets, updatePets } from './pets';
import { COMBAT_ROOMS, LEVELS, applyChoice, newRun, rollChoices, xpForLevel, type RunState } from './run';

type Mode = 'title' | 'play' | 'choose' | 'pause' | 'transition' | 'dead' | 'end';

const luminance = (hex: string) => {
  const n = hexToNum(hex);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

const DOOR_INFO: Record<DoorReward, { glyph: string; label: string }> = {
  rare: { glyph: '升', label: '稀有加成' },
  weapon: { glyph: '器', label: '武器' },
  pet: { glyph: '宠', label: '宠物' },
  heal: { glyph: '愈', label: '回满生命' },
  elite: { glyph: '险', label: '精英 · 双倍奖励' },
  boss: { glyph: '王', label: '宿敌' },
  next: { glyph: '画', label: '下一幅画' },
  victory: { glyph: '花', label: '终章' },
};

export class GameScene extends Phaser.Scene {
  run!: RunState;
  kit!: StyleKit;
  dark = false;
  fx!: Fx;
  gfx!: Phaser.GameObjects.Graphics;
  floorGfx!: Phaser.GameObjects.Graphics;
  cursorGfx!: Phaser.GameObjects.Graphics;
  bg?: Img;
  vignette?: Img;
  grain?: Phaser.GameObjects.TileSprite;
  player!: Player;
  enemies: Enemy[] = [];
  pproj: Proj[] = [];
  eproj: Proj[] = [];
  pickups: Pickup[] = [];
  obstacles: Obstacle[] = [];
  hazards: Hazard[] = [];
  pets: Pet[] = [];
  doors: Door[] = [];
  telegraphs: Telegraph[] = [];
  visuals: Visual[] = [];
  mode: Mode = 'title';
  roomCleared = false;
  waves: { kind: EnemyKind; elite: boolean }[][] = [];
  waveIdx = 0;
  waveTimer = 0;
  pendingSpawns = 0;
  combo = 0;
  comboT = 0;
  petalStreak = 0;
  petalT = 0;
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
  private pool = new Map<string, Img[]>();
  private closePause?: () => void;
  time0 = 0;

  constructor() {
    super('game');
  }

  create() {
    buildCommonTextures(this);
    this.fx = new Fx(this);
    this.floorGfx = this.add.graphics().setDepth(DEPTH.hazard);
    this.gfx = this.add.graphics().setDepth(DEPTH.gfx);
    this.cursorGfx = this.add.graphics().setDepth(DEPTH.cursor);
    this.input.mouse?.disableContextMenu();
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,ESC,F,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-ESC', () => this.togglePause());
    kb.on('keydown-F', () => {
      if (this.mode !== 'play') return;
      this.autoFire = !this.autoFire;
      ui.toast(this.autoFire ? '自动射击：开' : '自动射击：关', 900);
    });
    this.god = this.params.has('god');
    ui.mount(this.game.canvas);
    ui.title(async () => {
      await audio.init();
      this.startRun();
    });
  }

  // ---------------------------------------------------------------- run flow

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
    this.dark = luminance(kit.palette.bg) < 0.4;
    buildKitTextures(this, kit);
    this.pool.forEach((list) => list.forEach((i) => i.destroy()));
    this.pool.clear();

    this.bg?.destroy();
    this.vignette?.destroy();
    this.grain?.destroy();
    this.bg = this.add.image(0, 0, K('bg', kit)).setOrigin(0).setDepth(DEPTH.bg);
    this.vignette = this.add.image(0, 0, K('vignette', kit)).setOrigin(0).setDepth(DEPTH.vignette);
    this.grain = this.add.tileSprite(0, 0, ARENA.w, ARENA.h, 'grain').setOrigin(0).setDepth(DEPTH.grain).setAlpha(kit.overlay.grain);

    this.fx.setKit(kit, this.dark);
    ui.applyTheme(kit, this.dark);
    audio.setStyle(kit);

    if (!this.player) this.createPlayer();
    this.player.sprite.setTexture(K('player', kit));
    this.player.glow.setTint(hexToNum(kit.palette.accent)).setBlendMode(this.dark ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL).setAlpha(this.dark ? 0.55 : 0.28);
    this.pets.forEach((p) => p.sprite.setTexture(K(`pet-${p.kind}`, kit)));
    syncPets(this);

    ui.showHud(true);
    ui.banner(`第 ${['一', '二', '三', '四'][this.run.level]} 幅画`, kit.name, kit.en, kit.subtitle, first ? 2400 : 2200);
    this.enterRoom();
    if (!first) this.cameras.main.fadeIn(420, 255, 255, 255);
  }

  createPlayer() {
    const shadow = this.add.image(640, 600, 'shadow').setDepth(DEPTH.shadow).setScale(0.7, 0.8);
    const glow = this.add.image(640, 600, 'glow').setDepth(DEPTH.player - 0.5).setScale(1.6);
    const sprite = this.add.image(640, 600, K('player', this.kit)).setDepth(DEPTH.player);
    this.player = { x: 640, y: 600, vx: 0, vy: 0, r: 14, aim: -Math.PI / 2, iframes: 0, dashT: 0, dashCd: 0, dashX: 0, dashY: 0, trailT: 0, sprite, glow, shadow };
  }

  clearRoom(all = false) {
    for (const e of this.enemies) this.destroyEnemy(e);
    this.enemies = [];
    for (const p of [...this.pproj, ...this.eproj]) this.killProj(p, true);
    this.pproj = [];
    this.eproj = [];
    for (const p of this.pickups) {
      if (!all && p.kind === 'petal' && !p.dead) this.gainXp(p.value);
      p.sprite.destroy();
    }
    this.pickups = [];
    this.obstacles.forEach((o) => o.sprite.destroy());
    this.obstacles = [];
    this.hazards.forEach((h) => h.sprite?.destroy());
    this.hazards = [];
    this.doors.forEach((d) => [d.sprite, d.badge, d.label, d.glow].forEach((o) => o.destroy()));
    this.doors = [];
    this.telegraphs = [];
    this.visuals = [];
    this.boss = undefined;
    this.pendingSpawns = 0;
  }

  enterRoom() {
    this.clearRoom();
    const p = this.player;
    p.x = 640;
    p.y = ARENA.bottom - 70;
    p.vx = p.vy = 0;
    this.pets.forEach((pet) => {
      pet.x = p.x + rand(-40, 40);
      pet.y = p.y + 30;
    });
    this.roomCleared = false;
    this.waveIdx = 0;
    this.waveTimer = 0;
    this.mode = 'play';
    if (this.run.room >= COMBAT_ROOMS) {
      this.layoutObstacles(true);
      audio.setIntensity(2);
      this.time.delayedCall(600, () => {
        this.boss = spawnBoss(this, this.run.level === LEVELS - 1 ? 'boar' : 'guardian');
      });
    } else {
      this.layoutObstacles(false);
      this.planWaves();
      this.spawnWave(0);
      audio.setIntensity(1);
    }
  }

  layoutObstacles(boss: boolean) {
    const rng = this.run.rng;
    const presets: [number, number][][] = boss
      ? [
          [
            [250, 210],
            [1030, 210],
            [250, 560],
            [1030, 560],
          ],
        ]
      : [
          [
            [380, 270],
            [900, 270],
            [380, 500],
            [900, 500],
          ],
          [
            [640, 360],
            [440, 360],
            [840, 360],
          ],
          [
            [430, 240],
            [640, 380],
            [850, 520],
          ],
          [
            [520, 230],
            [520, 520],
            [760, 230],
            [760, 520],
          ],
          [
            [640, 230],
            [400, 420],
            [880, 420],
            [640, 560],
          ],
          [],
        ];
    const layout = rng.pick(presets);
    const flip = rng.chance(0.5);
    for (const [x, y] of layout) this.addObstacle('pillar', flip ? ARENA.w - x : x, y);
    if (!boss) {
      const barrels = rng.int(1, 3);
      for (let i = 0; i < barrels; i++) {
        for (let tries = 0; tries < 20; tries++) {
          const x = rng.range(ARENA.left + 80, ARENA.right - 80);
          const y = rng.range(ARENA.top + 80, ARENA.bottom - 140);
          if (this.obstacles.every((o) => dist(o.x, o.y, x, y) > o.r + 70)) {
            this.addObstacle('barrel', x, y);
            break;
          }
        }
      }
    }
  }

  addObstacle(kind: 'pillar' | 'barrel', x: number, y: number) {
    const sprite = this.add.image(x, y, K(kind, this.kit)).setDepth(DEPTH.obstacle);
    sprite.setScale(0.2);
    this.tweens.add({ targets: sprite, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.obstacles.push({ kind, x, y, r: kind === 'pillar' ? 30 : 22, hp: kind === 'pillar' ? 1e9 : 24, sprite, dead: false });
  }

  planWaves() {
    const { level, room, rng } = this.run;
    const budget = 13 + level * 8 + room * 3;
    const waveCount = room < 1 ? 2 : 3;
    const kinds = (Object.keys(ENEMIES) as EnemyKind[]).filter((k) => ENEMIES[k].minLevel <= level || room >= 2);
    this.waves = [];
    let elites = this.run.eliteNext ? 2 : rng.chance(0.1 + level * 0.12) ? 1 : 0;
    for (let w = 0; w < waveCount; w++) {
      let left = Math.round((budget * (0.7 + w * 0.3)) / (waveCount * 0.85));
      const wave: { kind: EnemyKind; elite: boolean }[] = [];
      while (left > 0) {
        const kind = rng.weighted(kinds, (k) => (k === 'wanderer' ? 3 : 2));
        const elite = elites > 0 && w === waveCount - 1;
        if (elite) elites--;
        wave.push({ kind, elite });
        left -= ENEMIES[kind].cost + (elite ? 4 : 0);
      }
      this.waves.push(wave);
    }
  }

  spawnWave(i: number) {
    const rng = this.run.rng;
    for (const s of this.waves[i]) {
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 30; tries++) {
        x = rng.range(ARENA.left + 50, ARENA.right - 50);
        y = rng.range(ARENA.top + 50, ARENA.bottom - 50);
        if (dist(x, y, this.player.x, this.player.y) > 260 && this.obstacles.every((o) => dist(o.x, o.y, x, y) > o.r + 30)) break;
      }
      this.queueSpawn(s.kind, x, y, s.elite);
    }
  }

  queueSpawn(kind: EnemyKind, x: number, y: number, elite = false, mini = false) {
    this.pendingSpawns++;
    this.telegraphs.push({
      kind: 'spawn',
      x,
      y,
      r: elite ? 34 : 24,
      t: 0,
      dur: 0.75,
      onDone: () => {
        this.pendingSpawns--;
        if (this.mode === 'dead' || this.mode === 'end') return;
        this.spawnEnemy(kind, x, y, elite, mini);
      },
    });
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number, elite = false, mini = false): Enemy {
    const def = ENEMIES[kind];
    const { level, room, rng } = this.run;
    const scale = (1 + level * 0.55 + room * 0.1) * (mini ? 0.45 : 1);
    const affix: Affix | undefined = elite ? rng.pick(Object.keys(AFFIXES) as Affix[]) : undefined;
    let hp = def.hp * scale * (elite ? 3.6 : 1) * (affix === 'tough' ? 1.4 : 1);
    const size = (elite ? 1.35 : 1) * (mini ? 0.72 : 1);
    const sprite = this.add.image(x, y, K(`en-${kind}`, this.kit)).setDepth(DEPTH.enemy).setScale(0.1);
    const shadow = this.add.image(x, y + def.r * size * 0.9, 'shadow').setDepth(DEPTH.shadow).setScale(size * 0.7, size * 0.8);
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
      speed: def.speed * (affix === 'swift' ? 1.4 : 1) * (mini ? 1.25 : 1) * (1 + level * 0.06),
      contact: def.contact,
      xp: def.xp * (elite ? 5 : 1),
      elite,
      affix,
      state: 'idle',
      t: rng.range(0, 1),
      t2: 0,
      facing: Math.atan2(this.player.y - y, this.player.x - x),
      flash: 0,
      dead: false,
      scale: size,
      status: { burn: 0, burnDps: 0, burnTick: 0, chill: 0, chillStacks: 0, frozen: 0, shock: 0 },
      sprite,
      shadow,
      mini,
    };
    this.tweens.add({ targets: sprite, scale: size, duration: 220, ease: 'Back.easeOut' });
    if (elite) {
      e.ring = this.add.image(x, y, 'ring').setDepth(DEPTH.shadow).setTint(hexToNum(this.kit.palette.danger === this.kit.palette.ink ? this.kit.palette.accentDark : this.kit.palette.danger)).setScale((e.r * 1.6) / 58).setAlpha(0.8);
      this.fx.callout(x, y - 40, AFFIXES[affix!], undefined, 22);
    }
    this.fx.dust(x, y, 8);
    this.enemies.push(e);
    return e;
  }

  destroyEnemy(e: Enemy) {
    e.sprite.destroy();
    e.shadow.destroy();
    e.ring?.destroy();
  }

  // ---------------------------------------------------------------- update

  update(_t: number, dms: number) {
    const realDt = Math.min(dms, 50) / 1000;
    this.fx.update(realDt);
    this.grain?.setTilePosition(Math.random() * 256, Math.random() * 256);
    if (!this.kit) return;
    this.drawCursor();
    if (this.mode === 'title' || this.mode === 'pause' || this.mode === 'choose' || this.mode === 'end') {
      this.drawWorld(0);
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

    if (this.mode === 'play' || this.mode === 'dead' || this.mode === 'transition') {
      if (this.mode === 'play') {
        this.updatePlayer(dt);
        this.updateWeapons(dt);
      }
      this.updateProjectiles(dt);
      this.updateEnemies(dt);
      updatePets(this, dt);
      this.updatePickups(dt);
      this.updateHazards(dt);
      this.updateTelegraphs(dt);
      if (this.mode === 'play') {
        this.updateWaves(dt);
        this.updateDoors(dt);
      }
      this.comboT -= dt;
      if (this.comboT <= 0 && this.combo > 0) {
        this.combo = 0;
      }
      if (this.comboT < -2) this.run.frenzyStacks = Math.max(0, this.run.frenzyStacks - dt * 4);
      this.petalT -= dt;
      if (this.petalT <= 0) this.petalStreak = 0;
    }
    this.drawWorld(dt);
    this.hudTick(realDt);
  }

  hudTick(dt: number) {
    if (!this.run) return;
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 1 / 30;
    const run = this.run;
    const b = this.boss && !this.boss.dead ? this.boss : undefined;
    ui.updateHud({
      hp: run.hp,
      maxHp: run.mods.maxHp,
      xp: run.xp,
      xpNext: run.xpNext,
      xpLevel: run.xpLevel,
      weapons: run.weapons.map((w) => ({ glyph: w.def.glyph, level: w.level, cd: clamp(w.cd / w.def.cooldown, 0, 1) })),
      pets: run.pets.map((p) => PETS[p].glyph),
      level: run.level,
      room: run.room,
      rooms: COMBAT_ROOMS,
      styleName: this.kit?.name ?? '',
      combo: this.combo,
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
    const p = this.input.activePointer;
    return { x: p.worldX - this.cameras.main.scrollX + this.cameras.main.scrollX, y: p.worldY };
  }

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
    const ptr = this.pointer();
    p.aim = Math.atan2(ptr.y - p.y, ptr.x - p.x);

    p.dashCd -= dt;
    p.iframes -= dt;
    if ((Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(k.SHIFT)) && p.dashCd <= 0) {
      const dx = il > 0 ? ix : Math.cos(p.aim);
      const dy = il > 0 ? iy : Math.sin(p.aim);
      p.dashX = dx;
      p.dashY = dy;
      p.dashT = 0.17;
      p.iframes = Math.max(p.iframes, 0.26);
      p.dashCd = 0.85 * this.run.mods.dashCooldown;
      audio.dash();
      this.fx.dust(p.x, p.y + 8, 10);
    }
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dashX * 980;
      p.vy = p.dashY * 980;
      p.trailT -= dt;
      if (p.trailT <= 0) {
        p.trailT = 0.022;
        const ghost = this.add.image(p.x, p.y, K('player', this.kit)).setDepth(DEPTH.player - 1).setAlpha(0.55).setRotation(p.sprite.rotation);
        ghost.setTintFill(hexToNum(this.kit.palette.accent));
        this.tweens.add({ targets: ghost, alpha: 0, scale: 0.7, duration: 220, onComplete: () => ghost.destroy() });
      }
    } else {
      const speed = 255 * this.run.mods.moveSpeed;
      const f = Math.min(1, dt * 15);
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
  }

  fireRateMult() {
    const m = this.run.mods;
    return Math.max(0.2, m.fireRate * (1 + Math.min(0.4, this.run.frenzyStacks * m.frenzy)));
  }

  updateWeapons(dt: number) {
    const firing = this.input.activePointer.leftButtonDown() || this.autoFire;
    const rate = this.fireRateMult();
    for (const w of this.run.weapons) {
      w.cd -= dt * rate;
      if (firing && w.cd <= 0) {
        this.fire(w);
        w.cd += w.def.cooldown;
        if (w.cd < 0) w.cd = 0;
      } else if (w.cd < 0) w.cd = 0;
    }
  }

  damageMult() {
    const m = this.run.mods;
    let d = m.damage;
    if (this.run.hp <= this.run.mods.maxHp / 2) d *= 1 + m.desperate;
    return d;
  }

  fire(w: WeaponInstance) {
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
    const a = p.aim;
    const ox = p.x + Math.cos(a) * 20;
    const oy = p.y + Math.sin(a) * 20;
    const accent = this.kit.palette.accent;
    switch (def.id) {
      case 'bolt': {
        for (let i = 0; i < count; i++) {
          const off = (i - (count - 1) / 2) * 0.09;
          this.spawnProj('bolt', ox, oy, a + off, speed, range / speed, 6 * area, dmg, pierce, knock, def.name);
        }
        this.recoil(a, 18);
        this.fx.glowPop(ox, oy, 22, accent, 60);
        break;
      }
      case 'spread': {
        const n = def.count + extra * 2;
        const cone = (def.spreadDeg * Math.PI) / 180 * (1 + extra * 0.08);
        for (let i = 0; i < n; i++) {
          const sp = speed * rand(0.85, 1.12);
          this.spawnProj('pellet', ox, oy, a + rand(-cone / 2, cone / 2), sp, (range / sp) * rand(0.8, 1), 5 * area, dmg, pierce, knock, def.name);
        }
        this.recoil(a, 90);
        this.fx.shake(0.07);
        this.fx.glowPop(ox, oy, 40, accent, 90);
        break;
      }
      case 'beam': {
        for (let i = 0; i < count; i++) {
          const off = (i - (count - 1) / 2) * 0.17;
          this.castBeam(ox, oy, a + off, range, 10 * area, dmg, pierce, knock, def.name);
        }
        this.recoil(a, 50);
        this.fx.shake(0.05);
        break;
      }
      case 'mortar': {
        const ptr = this.pointer();
        let tx = ptr.x;
        let ty = ptr.y;
        const d = dist(p.x, p.y, tx, ty);
        if (d > range) {
          tx = p.x + ((tx - p.x) / d) * range;
          ty = p.y + ((ty - p.y) / d) * range;
        }
        for (let i = 0; i < count; i++) {
          const jx = i === 0 ? 0 : rand(-75, 75);
          const jy = i === 0 ? 0 : rand(-75, 75);
          const [cx, cy] = clampToArena(tx + jx, ty + jy, 10);
          this.spawnShell(ox, oy, cx, cy, Math.max(0.28, 0.55 / m.speed), 78 * area, dmg, pierce, knock);
        }
        this.recoil(a, 40);
        break;
      }
      case 'boomerang': {
        for (let i = 0; i < count; i++) {
          const off = (i - (count - 1) / 2) * 0.38;
          const sp = speed * (1 + 0.15 * pierce);
          const pr = this.spawnProj('blade', ox, oy, a + off, sp, 99, 15 * area * (1 + 0.15 * pierce), dmg, 999, knock, def.name);
          pr.dist = 0;
          pr.maxDist = range;
        }
        break;
      }
      case 'chain': {
        this.castChain(ox, oy, a, range, 170 * area, dmg, count, pierce, def.name);
        break;
      }
    }
    audio.shoot(def.id);
  }

  recoil(a: number, amount: number) {
    this.player.vx -= Math.cos(a) * amount;
    this.player.vy -= Math.sin(a) * amount;
    this.player.sprite.setScale(1.14);
  }

  // ---------------------------------------------------------------- projectiles

  img(key: string, depth: number): Img {
    const list = this.pool.get(key);
    const i = list?.pop();
    if (i) {
      i.setVisible(true).setActive(true).setAlpha(1).setScale(1).setRotation(0).clearTint().setDepth(depth).setBlendMode(Phaser.BlendModes.NORMAL);
      return i;
    }
    return this.add.image(0, 0, key).setDepth(depth);
  }

  release(i: Img) {
    i.setVisible(false).setActive(false);
    const key = i.texture.key;
    if (!this.pool.has(key)) this.pool.set(key, []);
    this.pool.get(key)!.push(i);
  }

  spawnProj(kind: ProjKind, x: number, y: number, a: number, speed: number, life: number, r: number, dmg: number, pierce: number, knock: number, src: string): Proj {
    const enemy = kind === 'ebullet' || kind === 'ebig';
    const tkey = { bolt: 'bolt', pellet: 'pellet', blade: 'blade', shell: 'shell', shard: 'shard', ebullet: 'ebullet', ebig: 'ebullet-big' }[kind];
    const sprite = this.img(K(tkey, this.kit), enemy ? DEPTH.ebullet : DEPTH.proj);
    sprite.setPosition(x, y).setRotation(a);
    const base = { bolt: 6, pellet: 5, blade: 15, shell: 8, shard: 4, ebullet: 7, ebig: 12 }[kind];
    sprite.setScale(r / base);
    let glow: Img | undefined;
    if (!enemy && kind !== 'shard') {
      glow = this.img('glow', DEPTH.proj - 0.5);
      glow.setTint(hexToNum(this.kit.palette.accent)).setScale((r * 2.6) / 32).setAlpha(this.dark ? 0.7 : 0.3);
      glow.setBlendMode(this.dark ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    }
    const p: Proj = { kind, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r, dmg, pierce, life, knock, src, sprite, glow, hit: new Set(), dead: false };
    (enemy ? this.eproj : this.pproj).push(p);
    return p;
  }

  spawnEnemyBullet(x: number, y: number, a: number, speed: number, big = false) {
    return this.spawnProj(big ? 'ebig' : 'ebullet', x, y, a, speed, 6, big ? 12 : 7, big ? 2 : 1, 0, 0, 'enemy');
  }

  spawnShell(x: number, y: number, tx: number, ty: number, flight: number, blast: number, dmg: number, embers: number, knock: number) {
    const p = this.spawnProj('shell', x, y, 0, 0, 99, 8, dmg, 0, knock, '迫击');
    p.ox = x;
    p.oy = y;
    p.tx = tx;
    p.ty = ty;
    p.t = 0;
    p.flight = flight;
    p.blast = blast;
    p.embers = embers;
    p.shadow = this.img('shadow', DEPTH.shadow);
    p.shadow.setScale(0.4);
    this.telegraphs.push({ kind: 'circle', x: tx, y: ty, r: blast, t: 0, dur: flight });
  }

  killProj(p: Proj, silent = false) {
    if (p.dead) return;
    p.dead = true;
    this.release(p.sprite);
    if (p.glow) this.release(p.glow);
    if (p.shadow) this.release(p.shadow);
    if (!silent && (p.kind === 'bolt' || p.kind === 'pellet')) this.fx.sparks(p.x, p.y, 3, 'accent');
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
          if (dist2(p.x, p.y, pl.x, pl.y) < 26 * 26) {
            this.killProj(p, true);
            continue;
          }
        }
        p.sprite.rotation += dt * 22;
      } else {
        p.sprite.rotation = Math.atan2(p.vy, p.vx);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.killProj(p);
        continue;
      }
      if (p.x < ARENA.left || p.x > ARENA.right || p.y < ARENA.top || p.y > ARENA.bottom) {
        if (p.kind === 'blade') {
          if (!p.returning) {
            p.returning = true;
            p.hit.clear();
          }
          [p.x, p.y] = clampToArena(p.x, p.y, 2);
        } else {
          this.killProj(p);
          continue;
        }
      }
      if (p.kind !== 'blade') {
        let blocked = false;
        for (const o of this.obstacles) {
          if (!o.dead && dist2(p.x, p.y, o.x, o.y) < (o.r + p.r) ** 2) {
            if (o.kind === 'barrel') this.damageBarrel(o, p.dmg);
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
        if (dist2(p.x, p.y, e.x, e.y) > (e.r + p.r) ** 2) continue;
        const inA = Math.atan2(-p.vy, -p.vx);
        if (e.kind === 'shield' && Math.abs(angleDiff(e.facing, inA)) < 1.05 && e.status.frozen <= 0) {
          this.fx.sparks(p.x, p.y, 6, 'white');
          audio.block();
          if (p.kind === 'blade') {
            p.hit.add(e);
            continue;
          }
          this.killProj(p, true);
          break;
        }
        const sp = Math.hypot(p.vx, p.vy) || 1;
        this.damageEnemy(e, p.dmg, { src: p.src, kx: p.vx / sp, ky: p.vy / sp, knock: p.knock });
        p.hit.add(e);
        if (p.kind === 'blade') continue;
        if (p.pierce > 0) {
          p.pierce--;
          continue;
        }
        this.killProj(p);
        break;
      }
      if (!p.dead) {
        p.sprite.setPosition(p.x, p.y);
        p.glow?.setPosition(p.x, p.y);
      }
    }
    this.pproj = this.pproj.filter((p) => !p.dead);

    for (const p of this.eproj) {
      if (p.dead) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || p.x < ARENA.left - 10 || p.x > ARENA.right + 10 || p.y < ARENA.top - 10 || p.y > ARENA.bottom + 10) {
        this.killProj(p, true);
        continue;
      }
      if (this.obstacles.some((o) => !o.dead && o.kind === 'pillar' && dist2(p.x, p.y, o.x, o.y) < (o.r + p.r) ** 2)) {
        this.fx.sparks(p.x, p.y, 3, 'white');
        this.killProj(p, true);
        continue;
      }
      if (this.mode === 'play' && dist2(p.x, p.y, pl.x, pl.y) < (p.r + pl.r * 0.7) ** 2) {
        if (this.hurtPlayer(p.dmg, p.x, p.y)) this.killProj(p, true);
      }
      p.sprite.setPosition(p.x, p.y);
    }
    this.eproj = this.eproj.filter((p) => !p.dead);
  }

  updateShell(p: Proj, dt: number) {
    p.t! += dt / p.flight!;
    const t = Math.min(1, p.t!);
    p.x = p.ox! + (p.tx! - p.ox!) * t;
    p.y = p.oy! + (p.ty! - p.oy!) * t;
    const h = Math.sin(Math.PI * t) * (70 + dist(p.ox!, p.oy!, p.tx!, p.ty!) * 0.18);
    p.sprite.setPosition(p.x, p.y - h).setScale(1 + h / 110);
    p.glow?.setPosition(p.x, p.y - h);
    p.shadow?.setPosition(p.x, p.y + 4).setScale(0.3 + (1 - h / 160) * 0.3);
    if (t >= 1) {
      this.killProj(p, true);
      this.explode(p.x, p.y, p.blast!, p.dmg, { src: '迫击', knock: p.knock });
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
      // Distance to the arena wall along the ray.
      const tx = dx > 0 ? (ARENA.right - cx) / dx : dx < 0 ? (ARENA.left - cx) / dx : Infinity;
      const ty = dy > 0 ? (ARENA.bottom - cy) / dy : dy < 0 ? (ARENA.top - cy) / dy : Infinity;
      const tWall = Math.min(tx, ty);
      const len = Math.min(left, tWall);
      const ex = cx + dx * len;
      const ey = cy + dy * len;
      for (const e of this.enemies) {
        if (e.dead || hitSet.has(e)) continue;
        if (segCircle(cx, cy, ex, ey, e.x, e.y, e.r + width / 2)) {
          hitSet.add(e);
          this.damageEnemy(e, dmg, { src, kx: dx, ky: dy, knock, ignoreShield: true });
        }
      }
      for (const o of this.obstacles) {
        if (!o.dead && o.kind === 'barrel' && segCircle(cx, cy, ex, ey, o.x, o.y, o.r)) this.damageBarrel(o, dmg);
      }
      pts.push(ex, ey);
      left -= len;
      if (len < tWall) break;
      if (tWall === tx) dx = -dx;
      else dy = -dy;
      cx = ex;
      cy = ey;
      this.fx.sparks(ex, ey, 6, 'accent');
    }
    this.visuals.push({ kind: 'beam', pts, width, t: 0, dur: 0.16, color: hexToNum(this.kit.palette.accent) });
  }

  castChain(x: number, y: number, a: number, range: number, jump: number, dmg: number, jumps: number, forks: number, src: string) {
    const alive = this.enemies.filter((e) => !e.dead);
    let best: Enemy | undefined;
    let bestScore = Infinity;
    for (const e of alive) {
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
      const ex = x + Math.cos(a) * range * 0.5;
      const ey = y + Math.sin(a) * range * 0.5;
      this.visuals.push({ kind: 'chain', pts: this.jag(x, y, ex, ey), width: 2, t: 0, dur: 0.1, color: hexToNum(ELEMENT_COLOR.shock) });
      return;
    }
    const hit = new Set<Enemy>();
    const zap = (fx: number, fy: number, target: Enemy, left: number, power: number) => {
      hit.add(target);
      this.visuals.push({ kind: 'chain', pts: this.jag(fx, fy, target.x, target.y), width: 3, t: 0, dur: 0.14, color: hexToNum(this.kit.palette.accent) });
      this.damageEnemy(target, dmg * power, { src, knock: 30, kx: target.x - fx, ky: target.y - fy, ignoreShield: true });
      if (left <= 0) return;
      const next = this.enemies
        .filter((e) => !e.dead && !hit.has(e) && dist(target.x, target.y, e.x, e.y) < jump)
        .sort((p, q) => dist2(target.x, target.y, p.x, p.y) - dist2(target.x, target.y, q.x, q.y));
      if (next[0]) zap(target.x, target.y, next[0], left - 1, power * 0.92);
      if (forks > 0 && next[1] && Math.random() < 0.3 * forks) zap(target.x, target.y, next[1], left - 2, power * 0.8);
    };
    zap(x, y, best, jumps - 1, 1);
  }

  jag(x1: number, y1: number, x2: number, y2: number): number[] {
    const pts = [x1, y1];
    const n = 6;
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    const len = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const off = rand(-14, 14);
      pts.push(x1 + (x2 - x1) * t + (nx / len) * off, y1 + (y2 - y1) * t + (ny / len) * off);
    }
    pts.push(x2, y2);
    return pts;
  }

  // ---------------------------------------------------------------- damage

  damageEnemy(e: Enemy, amount: number, o: { src: string; kx?: number; ky?: number; knock?: number; crit?: boolean; noCrit?: boolean; dot?: boolean; ignoreShield?: boolean; arc?: boolean; noElement?: boolean; color?: string }) {
    if (e.dead) return;
    if (e.boss && e.boss.invuln > 0) {
      this.fx.sparks(e.x, e.y, 2, 'white');
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
      e.flash = 0.07;
      if (o.kx !== undefined && o.knock) {
        const l = Math.hypot(o.kx, o.ky ?? 0) || 1;
        const res = e.boss ? 0.06 : e.elite ? 0.45 : 1;
        e.kx += (o.kx / l) * o.knock * res;
        e.ky += ((o.ky ?? 0) / l) * o.knock * res;
      }
      audio.hit(crit);
      this.fx.sparks(e.x, e.y, crit ? 8 : 3, crit ? 'accent' : 'white');
      if (crit) {
        this.stop(0.03);
        this.fx.shake(0.04);
      }
    }
    this.fx.number(e.x, e.y - e.r, dmg, { crit, small: o.dot, color: o.color });

    if (!o.dot && !o.noElement) {
      for (const el of ['fire', 'ice', 'shock'] as Element[]) {
        if (m.elements[el] > 0 && Math.random() < m.elements[el]) this.applyElement(e, el, dmg);
      }
      if (m.explodeOnHit > 0 && Math.random() < m.explodeOnHit) this.explode(e.x, e.y, 64, dmg * 0.6, { src: '余烬爆裂', small: true });
      if (crit && m.splitOnCrit > 0) {
        for (let i = 0; i < m.splitOnCrit; i++) {
          this.spawnProj('shard', e.x, e.y, rand(0, TAU), 640, 0.45, 4, dmg * 0.35, 0, 40, '裂变').hit.add(e);
        }
      }
      if (e.status.shock > 0 && !o.arc) {
        const near = this.enemies.find((q) => q !== e && !q.dead && dist2(q.x, q.y, e.x, e.y) < 150 * 150);
        if (near) {
          this.visuals.push({ kind: 'chain', pts: this.jag(e.x, e.y, near.x, near.y), width: 2, t: 0, dur: 0.12, color: hexToNum(ELEMENT_COLOR.shock) });
          this.damageEnemy(near, dmg * 0.3 * m.elementPower, { src: '感电', arc: true, noCrit: true, noElement: true, color: ELEMENT_COLOR.shock });
        }
      }
    }
    if (e.hp <= 0) this.killEnemy(e, o.src);
  }

  applyElement(e: Enemy, el: Element, hit: number) {
    const s = e.status;
    const pow = this.run.mods.elementPower;
    const reaction = (name: string, color: string) => {
      this.fx.callout(e.x, e.y - e.r - 18, name, color, 24);
      this.fx.sparks(e.x, e.y, 12, el);
    };
    if (el === 'fire') {
      if (s.chill > 0 || s.frozen > 0) {
        s.chill = s.frozen = 0;
        s.chillStacks = 0;
        reaction('蒸发', ELEMENT_COLOR.fire);
        this.damageEnemy(e, hit * 1.0 * pow, { src: '蒸发', noCrit: true, noElement: true, color: ELEMENT_COLOR.fire });
        return;
      }
      if (s.shock > 0) {
        s.shock = 0;
        reaction('过载', ELEMENT_COLOR.shock);
        this.explode(e.x, e.y, 90, hit * 0.9 * pow, { src: '过载', small: true });
        return;
      }
      s.burn = 3;
      s.burnDps = Math.max(s.burnDps, hit * 0.4 * pow);
    } else if (el === 'ice') {
      if (s.burn > 0) {
        s.burn = 0;
        reaction('蒸发', ELEMENT_COLOR.ice);
        this.damageEnemy(e, hit * 1.0 * pow, { src: '蒸发', noCrit: true, noElement: true, color: ELEMENT_COLOR.ice });
        return;
      }
      s.chill = 2.6;
      s.chillStacks++;
      if (s.chillStacks >= 3) {
        s.chillStacks = 0;
        s.frozen = e.boss ? 0.5 : 1.3;
        this.fx.callout(e.x, e.y - e.r - 18, '冻结', ELEMENT_COLOR.ice, 22);
      }
    } else {
      if (s.frozen > 0) {
        s.frozen = 0;
        reaction('碎裂', ELEMENT_COLOR.ice);
        for (let i = 0; i < 6; i++) this.spawnProj('shard', e.x, e.y, (i / 6) * TAU, 560, 0.5, 4, hit * 0.5, 1, 60, '碎裂').hit.add(e);
        this.damageEnemy(e, hit * 2 * pow, { src: '碎裂', noCrit: true, noElement: true, color: ELEMENT_COLOR.ice });
        return;
      }
      if (s.burn > 0) {
        s.burn = 0;
        reaction('过载', ELEMENT_COLOR.shock);
        this.explode(e.x, e.y, 90, hit * 0.9 * pow, { src: '过载', small: true });
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
    this.fx.burst(e.x, e.y, e.elite ? 26 : 12);
    this.fx.petals(e.x, e.y, e.elite ? 10 : 4);
    this.fx.ring(e.x, e.y, e.r * 2.2, this.kit.palette.accent, 260);
    this.stop(e.elite ? 0.09 : 0.018);
    if (e.elite) this.fx.shake(0.25);
    if (this.kit.callouts && (this.combo % 5 === 0 || e.elite)) this.fx.callout(e.x, e.y - 30, this.run.rng.pick(this.kit.callouts));
    if (this.combo > 0 && this.combo % 10 === 0) this.fx.callout(this.player.x, this.player.y - 50, `${this.combo} 连杀`, this.kit.palette.accent, 30);

    const petals = Math.max(1, Math.round(e.xp));
    for (let i = 0; i < petals; i++) this.dropPetal(e.x, e.y, 1);
    if (run.mods.healOnKill > 0 && Math.random() < run.mods.healOnKill) this.heal(1, e.x, e.y);
    if (run.mods.explodeOnKill > 0) this.explode(e.x, e.y, 80, e.maxHp * run.mods.explodeOnKill, { src: '连锁殉爆', small: true });
    if (e.kind === 'bomber') this.explode(e.x, e.y, 95, 40, { src: '自爆兵', hurtsPlayer: 1 });
    if (e.affix === 'split' && !e.mini) {
      for (let i = 0; i < 2; i++) this.spawnEnemy(e.kind as EnemyKind, e.x + rand(-20, 20), e.y + rand(-20, 20), false, true);
    }
    if (e.affix === 'burst') {
      for (let i = 0; i < 10; i++) this.spawnEnemyBullet(e.x, e.y, (i / 10) * TAU, 170);
    }
    if (e.boss) {
      bossDeath(this, e);
      return;
    }
    const sprite = e.sprite;
    this.tweens.add({ targets: sprite, scale: sprite.scale * 1.35, alpha: 0, duration: 140, onComplete: () => sprite.destroy() });
    e.shadow.destroy();
    e.ring?.destroy();
  }

  explode(x: number, y: number, r: number, dmg: number, o: { src: string; hurtsPlayer?: number; knock?: number; small?: boolean }) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (dist2(x, y, e.x, e.y) < (r + e.r) ** 2) this.damageEnemy(e, dmg, { src: o.src, kx: e.x - x, ky: e.y - y, knock: o.knock ?? 220, ignoreShield: true, noElement: o.small });
    }
    for (const b of this.obstacles) {
      if (!b.dead && b.kind === 'barrel' && dist2(x, y, b.x, b.y) < (r + b.r) ** 2) this.time.delayedCall(70, () => this.damageBarrel(b, 999));
    }
    if (o.hurtsPlayer && this.mode === 'play' && dist2(x, y, this.player.x, this.player.y) < (r + this.player.r) ** 2) this.hurtPlayer(o.hurtsPlayer, x, y);
    this.fx.ring(x, y, r, o.hurtsPlayer ? this.dangerColor() : this.kit.palette.accent, 300, 1);
    this.fx.glowPop(x, y, r * 1.2, o.hurtsPlayer ? this.dangerColor() : this.kit.palette.accent, 160);
    this.fx.burst(x, y, o.small ? 6 : 16);
    this.fx.dust(x, y, o.small ? 4 : 12);
    this.fx.shake(o.small ? 0.08 : 0.22);
    audio.explode(!o.small && r > 100);
  }

  dangerColor() {
    const p = this.kit.palette;
    return p.danger === p.ink ? p.accentDark : p.danger;
  }

  damageBarrel(o: Obstacle, dmg: number) {
    if (o.dead) return;
    o.hp -= dmg;
    this.tweens.add({ targets: o.sprite, scale: 1.15, yoyo: true, duration: 50 });
    if (o.hp <= 0) {
      o.dead = true;
      o.sprite.destroy();
      this.explode(o.x, o.y, 120, 55, { src: '爆炸桶', hurtsPlayer: 2, knock: 320 });
    }
  }

  hurtPlayer(n: number, sx: number, sy: number): boolean {
    const p = this.player;
    if (this.mode !== 'play' || p.iframes > 0 || this.god) return false;
    this.run.hp -= n;
    p.iframes = 1.0;
    const a = Math.atan2(p.y - sy, p.x - sx);
    p.vx += Math.cos(a) * 380;
    p.vy += Math.sin(a) * 380;
    audio.hurt();
    this.fx.shake(0.5);
    this.fx.flash(this.kit.palette.accent, 0.28, 260);
    this.stop(0.08);
    this.combo = 0;
    if (this.run.hp <= 0) this.die();
    return true;
  }

  heal(n: number, x: number, y: number) {
    const run = this.run;
    if (run.hp >= run.mods.maxHp) return;
    run.hp = Math.min(run.mods.maxHp, run.hp + n);
    this.fx.number(x, y - 20, n, { text: '+♥', color: this.kit.palette.accent });
  }

  die() {
    this.mode = 'dead';
    this.slow(0.25, 1.2);
    this.fx.petals(this.player.x, this.player.y, 40);
    this.fx.flash('#ffffff', 0.5, 600);
    this.player.sprite.setVisible(false);
    this.player.glow.setVisible(false);
    audio.setIntensity(0);
    this.time.delayedCall(1400, () => {
      this.mode = 'end';
      ui.showHud(false);
      ui.end(false, this.run, () => this.restart());
    });
  }

  restart() {
    this.player.sprite.setVisible(true);
    this.player.glow.setVisible(true);
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
          this.fx.sparks(e.x, e.y - 6, 2, 'fire');
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

      const kd = Math.exp(-dt * 9);
      e.kx *= kd;
      e.ky *= kd;
      e.x += (e.vx * slowMul + e.kx) * dt;
      e.y += (e.vy * slowMul + e.ky) * dt;
    }
    // Separation, obstacles and arena bounds.
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead) continue;
        const min = a.r + b.r;
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 < min * min && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          const nx = (a.x - b.x) / d;
          const ny = (a.y - b.y) / d;
          const wa = a.boss ? 0.1 : 1;
          const wb = b.boss ? 0.1 : 1;
          a.x += nx * push * wa;
          a.y += ny * push * wa;
          b.x -= nx * push * wb;
          b.y -= ny * push * wb;
        }
      }
      if (!a.boss || a.kind !== 'boar' || a.state !== 'charge') {
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
      // Sprite.
      a.flash -= dt;
      const sp = a.sprite;
      sp.setPosition(a.x, a.y - (a.boss?.air ?? 0));
      if (a.flash > 0) sp.setTintFill(0xffffff);
      else if (a.status.frozen > 0) sp.setTint(hexToNum(ELEMENT_COLOR.ice));
      else if (a.status.burn > 0 && Math.floor(this.time0 * 10) % 2 === 0) sp.setTint(0xffb080);
      else if (a.boss?.enraged) sp.setTint(0xff9a9a);
      else sp.clearTint();
      if (a.kind === 'charger' || a.kind === 'shooter' || a.kind === 'shield') sp.setRotation(a.facing);
      else if (a.kind === 'boar') sp.setFlipX(Math.cos(a.facing) < 0);
      a.shadow.setPosition(a.x, a.y + a.r * 0.85);
      a.ring?.setPosition(a.x, a.y).setRotation(this.time0);
    }
    this.enemies = list.filter((e) => !e.dead || e.boss);
  }

  // ---------------------------------------------------------------- pickups, hazards, waves, doors

  dropPetal(x: number, y: number, value: number) {
    const a = rand(0, TAU);
    const sp = rand(60, 200);
    const sprite = this.add.image(x, y, K('petal', this.kit)).setDepth(DEPTH.pickup).setRotation(a);
    this.pickups.push({ kind: 'petal', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, value, t: 0, magnet: this.roomCleared, sprite, dead: false });
  }

  updatePickups(dt: number) {
    const pl = this.player;
    const radius = 95 * this.run.mods.pickupRadius + (this.run.pets.includes('dove') ? 150 : 0);
    for (const p of this.pickups) {
      if (p.dead) continue;
      p.t += dt;
      if (!p.magnet && p.t > 0.3 && dist2(p.x, p.y, pl.x, pl.y) < radius * radius) p.magnet = true;
      if (p.magnet && this.mode !== 'dead') {
        const a = Math.atan2(pl.y - p.y, pl.x - p.x);
        p.vx += Math.cos(a) * 2400 * dt;
        p.vy += Math.sin(a) * 2400 * dt;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 950) {
          p.vx *= 950 / sp;
          p.vy *= 950 / sp;
        }
      } else {
        const f = Math.exp(-dt * 4);
        p.vx *= f;
        p.vy *= f;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      [p.x, p.y] = clampToArena(p.x, p.y, 6);
      p.sprite.setPosition(p.x, p.y + Math.sin(p.t * 6) * 2).setRotation(p.sprite.rotation + dt * 3);
      if (dist2(p.x, p.y, pl.x, pl.y) < (pl.r + 10) ** 2 && this.mode !== 'dead') {
        p.dead = true;
        p.sprite.destroy();
        this.petalStreak++;
        this.petalT = 0.45;
        audio.pickup(this.petalStreak);
        this.gainXp(p.value);
      }
    }
    this.pickups = this.pickups.filter((p) => !p.dead);
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
    if (this.pendingLevelUps <= 0) return;
    this.mode = 'choose';
    audio.levelUp();
    this.fx.ring(this.player.x, this.player.y, 220, this.kit.palette.accent, 420);
    this.fx.flash(this.kit.palette.light, 0.25, 260);
    const choices = rollChoices(this.run, 'level');
    ui.choices('升级', `Lv ${this.run.xpLevel - this.pendingLevelUps + 1} · 选择一项`, choices, this.run, (i) => {
      this.takeChoice(choices[i]);
      this.pendingLevelUps--;
      this.mode = 'play';
      if (this.pendingLevelUps > 0) this.time.delayedCall(120, () => this.openLevelUp());
    });
  }

  offer(kind: 'rare' | 'weapon' | 'pet', then?: () => void) {
    this.mode = 'choose';
    const choices = rollChoices(this.run, kind);
    const title = { rare: '稀有加成', weapon: '武器', pet: '宠物' }[kind];
    ui.choices(title, '选择一项', choices, this.run, (i) => {
      this.takeChoice(choices[i]);
      this.mode = 'play';
      then?.();
      if (this.pendingLevelUps > 0) this.time.delayedCall(120, () => this.openLevelUp());
    });
  }

  takeChoice(c: ReturnType<typeof rollChoices>[number]) {
    applyChoice(this.run, c);
    if (c.type === 'pet') {
      syncPets(this);
      ui.toast(`${PETS[c.kind].name} 加入了队伍`);
    }
    if (c.type === 'upgrade') ui.toast(`${UPGRADE_BY_ID[c.def.id].name}`, 900);
  }

  updateHazards(dt: number) {
    for (const h of this.hazards) {
      h.t -= dt;
      h.tick -= dt;
      if (h.tick <= 0) {
        h.tick = 0.3;
        for (const e of this.enemies) {
          if (!e.dead && dist2(e.x, e.y, h.x, h.y) < (h.r + e.r) ** 2) this.damageEnemy(e, h.dmg, { src: '余烬', dot: true, color: ELEMENT_COLOR.fire });
        }
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

  updateWaves(dt: number) {
    if (this.roomCleared || this.run.room >= COMBAT_ROOMS) return;
    this.waveTimer += dt;
    const alive = this.enemies.filter((e) => !e.dead).length + this.pendingSpawns;
    const waveSize = this.waves[this.waveIdx]?.length ?? 1;
    if (this.waveIdx < this.waves.length - 1 && (alive <= Math.floor(waveSize * 0.35) || this.waveTimer > 9)) {
      this.waveIdx++;
      this.waveTimer = 0;
      this.spawnWave(this.waveIdx);
      return;
    }
    if (this.waveIdx === this.waves.length - 1 && alive === 0) this.onRoomCleared();
  }

  onRoomCleared(bossDown = false) {
    if (this.roomCleared) return;
    this.roomCleared = true;
    audio.setIntensity(0);
    this.pickups.forEach((p) => (p.magnet = true));
    if (this.run.pets.includes('dove')) this.heal(1, this.player.x, this.player.y);
    const run = this.run;
    const after = () => {
      let rewards: DoorReward[];
      if (bossDown) rewards = [run.level === LEVELS - 1 ? 'victory' : 'next'];
      else if (run.room === COMBAT_ROOMS - 1) rewards = ['boss'];
      else rewards = this.rollDoorRewards();
      this.spawnDoors(rewards);
    };
    if (!bossDown) ui.toast('房间清空');
    if (run.eliteNext && !bossDown) {
      run.eliteNext = false;
      this.time.delayedCall(500, () => this.offer('rare', after));
    } else this.time.delayedCall(bossDown ? 1800 : 400, after);
  }

  rollDoorRewards(): DoorReward[] {
    const run = this.run;
    const pool: [DoorReward, number][] = [['rare', 30]];
    const wc = rollChoices(run, 'weapon');
    if (wc.some((c) => c.type !== 'upgrade')) pool.push(['weapon', 24]);
    if (run.pets.length < 3) pool.push(['pet', run.pets.length === 0 ? 34 : 18]);
    if (run.hp < run.mods.maxHp - 1) pool.push(['heal', 16]);
    if (run.room < COMBAT_ROOMS - 2) pool.push(['elite', 14]);
    const out: DoorReward[] = [];
    while (out.length < 2 && pool.length) {
      const pick = run.rng.weighted(pool, (p) => p[1]);
      out.push(pick[0]);
      pool.splice(pool.indexOf(pick), 1);
    }
    return out;
  }

  spawnDoors(rewards: DoorReward[]) {
    const xs = rewards.length === 1 ? [ARENA.doorSingleX] : ARENA.doorXs;
    rewards.forEach((r, i) => {
      const x = xs[i];
      const y = ARENA.doorY + 6;
      const sprite = this.add.image(x, y, K('door', this.kit)).setDepth(DEPTH.doors).setScale(0.2, 0.2);
      const glow = this.add.image(x, y + 10, 'glow').setDepth(DEPTH.doors - 0.1).setTint(hexToNum(this.kit.palette.accent)).setScale(3).setAlpha(0);
      glow.setBlendMode(this.dark ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
      const info = DOOR_INFO[r];
      const pal = this.kit.palette;
      const badge = this.add
        .text(x, y + 6, info.glyph, { fontFamily: "'Kaiti SC','STKaiti','KaiTi',serif", fontSize: '34px', color: '#ffffff', stroke: pal.accentDark, strokeThickness: 6 })
        .setOrigin(0.5)
        .setDepth(DEPTH.doors + 1)
        .setAlpha(0);
      const labelText = r === 'boss' ? this.kit.bossNames[run_isFinal(this) ? 'boar' : 'guardian'] : info.label;
      const label = this.add
        .text(x, y + 62, labelText, { fontFamily: this.kit.fonts.body, fontSize: '17px', color: this.dark ? pal.light : pal.ink, stroke: this.dark ? pal.ink : pal.bg, strokeThickness: 4 })
        .setOrigin(0.5)
        .setDepth(DEPTH.doors + 1)
        .setAlpha(0);
      this.tweens.add({ targets: sprite, scale: 1, duration: 380, ease: 'Back.easeOut', delay: i * 120 });
      this.tweens.add({ targets: [badge, label], alpha: 1, duration: 300, delay: 200 + i * 120 });
      this.tweens.add({ targets: glow, alpha: this.dark ? 0.5 : 0.25, duration: 500, delay: 200 + i * 120 });
      this.doors.push({ x, y, reward: r, sprite, badge, label, glow, open: 0 });
    });
    audio.door();
  }

  updateDoors(dt: number) {
    if (!this.doors.length) return;
    const pl = this.player;
    for (const d of this.doors) {
      d.open += dt;
      d.badge.setY(d.y + 6 + Math.sin(d.open * 3) * 3);
      if (d.open > 0.6 && Math.abs(pl.x - d.x) < 46 && pl.y < ARENA.top + pl.r + 14) {
        this.enterDoor(d);
        return;
      }
    }
  }

  enterDoor(d: Door) {
    this.mode = 'transition';
    audio.select();
    const run = this.run;
    const cam = this.cameras.main;
    const level = d.reward === 'next';
    const c = hexToNum(level ? '#ffffff' : this.kit.palette.ink);
    cam.fadeOut(level ? 520 : 260, (c >> 16) & 255, (c >> 8) & 255, c & 255);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      switch (d.reward) {
        case 'victory':
          this.victory();
          return;
        case 'next':
          run.level++;
          run.room = 0;
          this.enterLevel();
          return;
        case 'elite':
          run.eliteNext = true;
          break;
        case 'heal':
          run.hp = run.mods.maxHp;
          break;
      }
      run.room++;
      this.enterRoom();
      cam.fadeIn(260);
      if (d.reward === 'rare' || d.reward === 'weapon' || d.reward === 'pet') this.time.delayedCall(320, () => this.offer(d.reward as 'rare' | 'weapon' | 'pet'));
      if (d.reward === 'heal') ui.toast('生命已回满');
      if (d.reward === 'elite') ui.toast('精英来袭 · 清场后获得稀有加成');
      if (d.reward === 'boss') {
        audio.roar();
      }
    });
  }

  victory() {
    this.mode = 'end';
    ui.showHud(false);
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
    if (p) {
      p.sprite.setPosition(p.x, p.y);
      p.sprite.rotation += dt * (1.2 + Math.hypot(p.vx, p.vy) / 120);
      const sc = p.sprite.scaleX;
      if (sc !== 1) p.sprite.setScale(sc + (1 - sc) * Math.min(1, dt * 18));
      p.glow.setPosition(p.x, p.y);
      p.shadow.setPosition(p.x, p.y + 16);
      p.sprite.setAlpha(p.iframes > 0 && p.dashT <= 0 && this.mode === 'play' ? (Math.floor(this.time0 * 20) % 2 ? 0.35 : 1) : 1);
    }
    const g = this.floorGfx;
    g.clear();
    const danger = hexToNum(this.dangerColor());
    const accent = hexToNum(this.kit?.palette.accent ?? '#ff0000');
    for (const t of this.telegraphs) {
      const k = t.t / t.dur;
      if (t.kind === 'spawn') {
        g.lineStyle(3, danger, 0.4 + 0.5 * k);
        g.strokeCircle(t.x, t.y, t.r! * (1.8 - k));
        g.fillStyle(danger, 0.15 + 0.25 * k);
        g.fillCircle(t.x, t.y, t.r! * k);
      } else if (t.kind === 'circle') {
        g.lineStyle(2, accent, 0.5);
        g.strokeCircle(t.x, t.y, t.r!);
        g.fillStyle(accent, 0.12 * k);
        g.fillCircle(t.x, t.y, t.r! * k);
      } else if (t.kind === 'line') {
        g.lineStyle(4 + 10 * k, danger, 0.18 + 0.3 * Math.abs(Math.sin(t.t * 20)));
        g.lineBetween(t.x, t.y, t.x2!, t.y2!);
      }
    }
    for (const h of this.hazards) {
      g.fillStyle(hexToNum(ELEMENT_COLOR.fire), 0.12 + 0.06 * Math.sin(this.time0 * 12));
      g.fillCircle(h.x, h.y, h.r);
      g.lineStyle(2, hexToNum(ELEMENT_COLOR.fire), 0.5);
      g.strokeCircle(h.x, h.y, h.r);
    }
    const b = this.boss;
    if (b && !b.dead && b.boss) {
      const bs = b.boss;
      if (bs.armWarn > 0 || bs.armLive > 0) {
        for (let i = 0; i < bs.arms; i++) {
          const a = bs.armA + (i / bs.arms) * TAU;
          const x2 = b.x + Math.cos(a) * 1500;
          const y2 = b.y + Math.sin(a) * 1500;
          if (bs.armLive > 0) {
            g.lineStyle(22, danger, 0.35);
            g.lineBetween(b.x, b.y, x2, y2);
            g.lineStyle(8, danger, 0.9);
            g.lineBetween(b.x, b.y, x2, y2);
          } else {
            g.lineStyle(3, danger, 0.35 + 0.35 * Math.abs(Math.sin(this.time0 * 16)));
            g.lineBetween(b.x, b.y, x2, y2);
          }
        }
      }
    }

    const vg = this.gfx;
    vg.clear();
    for (const v of this.visuals) {
      const k = 1 - v.t / v.dur;
      if (v.kind === 'beam') {
        vg.lineStyle(v.width * 2.4 * k, v.color, 0.35 * k);
        this.strokePts(vg, v.pts);
        vg.lineStyle(v.width * k, v.color, 0.95);
        this.strokePts(vg, v.pts);
        vg.lineStyle(v.width * 0.35 * k, 0xffffff, 1);
        this.strokePts(vg, v.pts);
      } else {
        vg.lineStyle(v.width + 4, v.color, 0.35 * k);
        this.strokePts(vg, v.pts);
        vg.lineStyle(v.width, 0xffffff, k);
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
    if (!this.kit || this.mode === 'title' || this.mode === 'end') return;
    const ptr = this.input.activePointer;
    const x = ptr.worldX;
    const y = ptr.worldY;
    const pal = this.kit.palette;
    const ink = hexToNum(this.dark ? pal.light : pal.ink);
    const acc = hexToNum(pal.accent);
    g.lineStyle(4, ink, 0.5);
    g.strokeCircle(x, y, 12);
    g.lineStyle(2, acc, 1);
    g.strokeCircle(x, y, 12);
    const w = this.run?.weapons[0];
    if (w && w.cd > 0) {
      const k = 1 - clamp(w.cd / w.def.cooldown, 0, 1);
      g.lineStyle(3, ink, 0.9);
      g.beginPath();
      g.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * k);
      g.strokePath();
    }
    g.fillStyle(acc, 1);
    g.fillCircle(x, y, 2.5);
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      g.lineStyle(2, ink, 0.9);
      g.lineBetween(x + Math.cos(a) * 15, y + Math.sin(a) * 15, x + Math.cos(a) * 21, y + Math.sin(a) * 21);
    }
  }
}

function run_isFinal(s: GameScene) {
  return s.run.level === LEVELS - 1;
}
