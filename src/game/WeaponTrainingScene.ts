import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { clamp, hexToNum } from '../core/math';
import { Rng } from '../core/rng';
import { HEROES } from '../data/heroes';
import { magSize, reloadTime, type WeaponInstance } from '../data/weapons';
import { E } from '../pixel/palette';
import { buildCommonTextures, buildKitTextures, buildLevel, K } from '../styles/textures';
import { GameScene } from './GameScene';
import { FLOOR, WALL, type DRoom, type Dungeon } from './dungeon';
import { clearCores, markAura, updateCores } from './elements';
import { ELEMENT_COLOR, freshStatus, type Enemy, type Img } from './entities';
import { DEPTH, Fx } from './fx';
import { Lighting } from './lighting';
import type { RunState } from './run';

const SCROLL_X = 16;
const SCROLL_Y = 8;
const PLAYER_X = 42;
const KEY_NAMES = ['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'SHIFT'] as const;

/**
 * A separate scene in the existing WebGL game. Combat, textures, grip poses,
 * particles and lighting come from GameScene; only the training inputs and
 * immortal targets are different. Never call the live scene's create/update.
 */
export class WeaponTrainingScene extends GameScene {
  private trainingReady = false;
  private selection = '';
  private viewport = { x: 0, y: 0, w: 112, h: 44 };
  private targets = new Map<Enemy, { x: number; y: number }>();
  private floorTextures = new Set<string>();
  private cylinder?: Img;
  private cylinderStep = -1;
  private cylinderPopping = false;
  private scheduled = new Set<Phaser.Time.TimerEvent>();

  constructor(private readonly onReady: () => void = () => {}, key = 'weapon-training') {
    super(key);
  }

  create() {
    // PRE_UPDATE includes timer callbacks and UPDATE includes tweens. Silence
    // the complete isolated step, not only this scene's update() method.
    const originalStep = this.sys.step;
    this.sys.step = (time, delta) => audio.silently(() => originalStep.call(this.sys, time, delta));
    const originalAddEvent = this.time.addEvent;
    this.time.addEvent = (config) => {
      const event = originalAddEvent.call(this.time, config);
      this.scheduled.add(event);
      return event;
    };
    this.input.enabled = false;
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    this.keys = Object.fromEntries(KEY_NAMES.map((name) => [name,
      new Phaser.Input.Keyboard.Key(this.input.keyboard!, Phaser.Input.Keyboard.KeyCodes[name]),
    ]));
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      this.trainingReady = false;
      this.sys.step = originalStep;
      this.time.addEvent = originalAddEvent;
      this.scheduled.clear();
      Object.values(this.keys).forEach((key) => key.destroy());
      this.targets.clear();
      for (const key of this.floorTextures) this.textures.remove(key);
      this.floorTextures.clear();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    buildCommonTextures(this);
    this.trainingReady = true;
    this.setViewport(this.viewport.x, this.viewport.y, this.viewport.w, this.viewport.h);
    if (this.run) audio.silently(() => this.resetTraining());
    this.events.once(Phaser.Scenes.Events.CREATE, this.onReady);
  }

  /** Snapshot all writable state. Repeated HUD refreshes preserve ammo and animation progress. */
  configure(weapon: WeaponInstance, source: RunState) {
    const kit = source.styles[source.level] ?? source.styles[0];
    const next = `${source.hero}:${source.ascended}:${kit.id}:${weapon.def.id}:${weapon.level}`;
    const changed = next !== this.selection;
    const currentWeapon = !changed ? this.run?.weapons[0] : undefined;
    this.run = {
      ...source,
      rng: new Rng(source.seed),
      styles: [...source.styles],
      mods: { ...source.mods, elements: { ...source.mods.elements } },
      stacks: { ...source.stacks },
      tags: { ...source.tags },
      damage: {},
      spells: [],
      pets: [],
      held: 0,
      weapons: [currentWeapon ?? { def: weapon.def, level: weapon.level, cd: 0 }],
    };
    this.kit = kit;
    this.heroTex = source.ascended ? 'jesus' : HEROES[source.hero].tex;
    this.selection = next;
    if (this.trainingReady && (changed || !this.player)) audio.silently(() => this.resetTraining());
  }

  /** Coordinates are logical pixels in the shared game canvas, not CSS pixels. */
  setViewport(x: number, y: number, w: number, h: number) {
    const resized = this.viewport.w !== w || this.viewport.h !== h;
    this.viewport = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
    if (!this.trainingReady) return;
    this.cameras.main.setViewport(this.viewport.x, this.viewport.y, this.viewport.w, this.viewport.h)
      .setScroll(SCROLL_X, SCROLL_Y).setZoom(1).setBackgroundColor('#11121e');
    this.cameras.main.roundPixels = true;
    if (resized && this.run) audio.silently(() => this.resetTraining());
  }

  update(_time: number, dms: number) {
    if (!this.player || !this.run) return;
    for (const event of this.scheduled) {
      if (event.hasDispatched && !event.loop && event.repeatCount === 0) this.scheduled.delete(event);
    }
    const dt = Math.min(dms, 50) / 1000;
    this.fx.update(dt);
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    this.time0 += dt;
    const held = this.run.weapons[0];
    // The bot stays at its mark; real recoil and the spear's dash are allowed
    // to play before easing back into range for the next attack.
    const p = this.player;
    const baseline = this.baseline();
    if (p.dashT <= 0) {
      p.x += (PLAYER_X - p.x) * Math.min(1, dt * 4);
      p.y += (baseline - p.y) * Math.min(1, dt * 4);
    }
    const first = this.targets.values().next().value;
    this.aimX = first?.x ?? 104;
    this.aimY = (first?.y ?? baseline) - 4;
    // Deliberately aim just above the targets to let the star reach and rebound
    // from the actual solid right wall, then hit on its return path.
    if (held.def.id === 'shuriken') this.aimY -= 7;
    super.updatePlayer(dt);
    // Put the grip at the current actor position before computing the muzzle.
    super.drawWorld(0);
    super.updateWeapons(dt);
    super.updateProjectiles(dt);
    super.updateHazards(dt);
    updateCores(this, dt);
    super.updateTelegraphs(dt);
    this.updateTargets(dt);
    super.drawWorld(dt);
    this.light.update(this, dt);
    // Crystals created by elemental reactions belong only to this scene.
    // No pickup loop runs, and old drops are discarded to bound long previews.
    for (const pickup of this.pickups) {
      pickup.t += dt;
      if (pickup.t > 2) {
        pickup.sprite.destroy();
        pickup.dead = true;
      }
    }
    this.pickups = this.pickups.filter((pickup) => !pickup.dead);
  }

  damageEnemy(...args: Parameters<GameScene['damageEnemy']>) {
    const [enemy] = args;
    enemy.hp = Infinity;
    super.damageEnemy(...args);
    enemy.hp = Infinity;
    enemy.dead = false;
  }

  /** A target never enters the score, drops, room-clear, or save paths. */
  killEnemy(_enemy: Enemy, _source: string) {}
  hurtPlayer(_damage: number, _x: number, _y: number) { return false; }
  kick(_angle: number, _amount: number) {}

  /** Same cylinder art/timing as the game, owned by this scene rather than its private HUD icon. */
  drawReload(_dt: number) {
    const icon = this.cylinder;
    if (!icon || !this.run) return;
    const weapon = this.run.weapons[0];
    const reloading = !!weapon.def.mag && (weapon.reloadT ?? 0) > 0;
    if (!reloading) {
      if (!this.cylinderPopping) icon.setVisible(false);
      return;
    }
    const progress = 1 - weapon.reloadT! / Math.max(0.01, reloadTime(weapon, this.run.mods.reload));
    const step = Math.min(6, Math.floor(progress * 7));
    if (!icon.visible || this.cylinderPopping) {
      this.tweens.killTweensOf(icon);
      this.cylinderPopping = false;
      this.cylinderStep = -1;
      icon.setVisible(true).setAlpha(1).setScale(0);
      this.tweens.add({ targets: icon, scale: 1, duration: 140, ease: 'Back.easeOut' });
    }
    if (step !== this.cylinderStep) {
      if (this.cylinderStep >= 0 && step > this.cylinderStep) {
        icon.setScale(1.3).setRotation(-Math.PI / 3);
        this.tweens.add({ targets: icon, scale: 1, rotation: 0, duration: 110, ease: 'Back.easeOut' });
      }
      this.cylinderStep = step;
      icon.setTexture(`cyl-${step}`);
    }
    icon.setPosition(Math.round(this.player.x), Math.round(this.player.y - 21));
  }

  reloadDone() {
    const icon = this.cylinder;
    if (!icon?.visible) return;
    this.cylinderPopping = true;
    this.tweens.killTweensOf(icon);
    icon.setTexture('cyl-6').setRotation(0);
    this.tweens.add({ targets: icon, scale: 1.8, alpha: 0, duration: 220, ease: 'Quad.easeOut',
      onComplete: () => { icon.setVisible(false).setAlpha(1).setScale(1); this.cylinderPopping = false; },
    });
    this.fx.ring(icon.x, icon.y, 12, E.yellow, 220, 1);
  }

  private baseline() { return SCROLL_Y + this.viewport.h - 11; }

  private resetTraining() {
    // Also remove callbacks waiting for next frame, including delayed combo strikes.
    this.time.removeEvent([...this.scheduled]);
    for (const event of this.scheduled) event.destroy();
    this.scheduled.clear();
    this.tweens.killAll();
    clearCores(this);
    this.children.removeAll(true);
    this.resetWeaponRuntime();
    this.pproj = [];
    this.eproj = [];
    this.enemies = [];
    this.pickups = [];
    this.hazards = [];
    this.telegraphs = [];
    this.visuals = [];
    this.targets.clear();
    this.hitstop = 0;
    this.time0 = 0;
    this.cylinderStep = -1;
    this.cylinderPopping = false;
    this.rhythm.reset();
    this.mode = 'play';
    this.autoFire = true;
    this.god = true;
    buildKitTextures(this, this.kit);
    this.dungeon = trainingDungeon();
    this.room = this.dungeon.start;
    const floorKey = `${this.sys.settings.key}:floor@${this.kit.id}`;
    if (!this.textures.exists(floorKey)) buildLevel(this, this.kit, this.dungeon, 731, floorKey);
    this.floorTextures.add(floorKey);
    this.add.image(0, 0, floorKey).setOrigin(0).setDepth(DEPTH.bg);
    this.fx = new Fx(this);
    this.fx.setKit(this.kit);
    this.light = new Lighting(this);
    this.light.setLevel(this.kit, this.dungeon, 731);
    this.floorGfx = this.add.graphics().setDepth(DEPTH.hazard);
    this.spellGfx = this.add.graphics().setDepth(DEPTH.pet - 0.5);
    this.gfx = this.add.graphics().setDepth(DEPTH.gfx);
    this.cylinder = this.add.image(0, 0, 'cyl-0').setDepth(DEPTH.numbers - 0.2).setVisible(false);
    super.createPlayer();
    this.player.x = PLAYER_X;
    this.player.y = this.baseline();
    this.player.sprite.setTexture(`${this.heroTex}-a`);
    const weapon = this.run.weapons[0];
    weapon.cd = 0.25;
    weapon.ammo = magSize(weapon, this.run.mods.mag) || undefined;
    weapon.reloadT = 0;
    weapon.spin = 0;
    const melee = weapon.def.kind === 'slash';
    const firstX = melee ? PLAYER_X + Math.min(33, weapon.def.range * 0.8) : 82;
    this.addTarget(firstX, this.baseline());
    if (weapon.def.kind === 'chain') {
      this.addTarget(94, this.baseline() - 16);
      this.addTarget(98, this.baseline());
    } else if (melee) this.addTarget(PLAYER_X, this.baseline() - 16);
    else this.addTarget(100, this.baseline() - (weapon.def.kind === 'spread' ? 14 : 0));
    this.aimX = firstX;
    this.aimY = this.baseline() - 4;
    super.drawWorld(0);
    this.light.update(this, 0);
  }

  private addTarget(x: number, y: number) {
    const enemy: Enemy = {
      id: this.nextId++, kind: 'wanderer', x, y, vx: 0, vy: 0, kx: 0, ky: 0,
      r: 6, hp: Infinity, maxHp: Infinity, speed: 0, contact: 0, xp: 0,
      elite: false, state: 'idle', t: 0, t2: 0, anim: 0, facing: Math.PI,
      flash: 0, dead: false, scale: 1, status: freshStatus(),
      sprite: this.add.image(x, y, K('en-wanderer-a', this.kit)).setOrigin(0.5, 0.85).setDepth(DEPTH.enemy),
      shadow: this.add.image(x, y + 1, 'shadow').setDepth(DEPTH.shadow),
    };
    this.enemies.push(enemy);
    this.targets.set(enemy, { x, y });
  }

  private updateTargets(dt: number) {
    for (const [enemy, home] of this.targets) {
      const decay = Math.exp(-dt * 10);
      enemy.kx *= decay;
      enemy.ky *= decay;
      enemy.x = clamp(enemy.x + enemy.kx * dt, home.x - 7, home.x + 7);
      enemy.y = clamp(enemy.y + enemy.ky * dt, home.y - 5, home.y + 5);
      enemy.x += (home.x - enemy.x) * Math.min(1, dt * 5);
      enemy.y += (home.y - enemy.y) * Math.min(1, dt * 5);
      enemy.flash -= dt;
      enemy.status.auraT -= dt;
      enemy.status.frozen -= dt;
      enemy.status.stun -= dt;
      if (enemy.flash > 0) enemy.sprite.setTintFill(0xffffff);
      else if (enemy.status.frozen > 0) enemy.sprite.setTint(hexToNum(ELEMENT_COLOR.ice));
      else enemy.sprite.clearTint();
      enemy.sprite.setPosition(Math.round(enemy.x), Math.round(enemy.y));
      enemy.shadow.setPosition(Math.round(enemy.x), Math.round(enemy.y + 1));
      markAura(this, enemy);
    }
  }
}

function trainingDungeon(): Dungeon {
  const w = 8, h = 6;
  const tiles = new Uint8Array(w * h).fill(WALL);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) tiles[y * w + x] = FLOOR;
  const room: DRoom = {
    id: 'weapon-training', gx: 0, gy: 0, depth: 0, type: 'start',
    doors: { up: false, right: false, down: false, left: false },
    cleared: true, visited: true, seen: true, seed: 731,
    x0: 1, y0: 1, x1: w - 1, y1: h - 1, shape: 'rect', gates: [], props: [], traps: [], decor: [],
  };
  return { w, h, tiles, blocked: new Set(), rooms: [room], byId: new Map([[room.id, room]]), start: room, boss: room, torches: [] };
}
