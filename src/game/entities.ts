import type Phaser from 'phaser';
import type { Element } from '../core/stats';
import type { Affix, BossKind, EnemyKind, Pets } from '../data/enemies';

export type Img = Phaser.GameObjects.Image;

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  aim: number;
  iframes: number;
  dashT: number;
  dashCd: number;
  dashX: number;
  dashY: number;
  trailT: number;
  walkT: number;
  sinceHit: number;
  armorT: number;
  skillT: number;
  skillCd: number;
  punch: number;
  sprite: Img;
  gun: Img;
  gun2: Img;
  shadow: Img;
}

export type ProjKind = 'bolt' | 'pellet' | 'blade' | 'shell' | 'shard' | 'orb' | 'axe' | 'rocket' | 'flame' | 'ebullet' | 'ebig';

export interface Proj {
  kind: ProjKind;
  x: number;
  y: number;
  px?: number;
  py?: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  pierce: number;
  life: number;
  life0?: number;
  knock: number;
  src: string;
  sprite: Img;
  hit: Set<Enemy>;
  dead: boolean;
  element?: Element;
  homing?: number;
  gravity?: number;
  spin?: number;
  dist?: number;
  maxDist?: number;
  returning?: boolean;
  ox?: number;
  oy?: number;
  tx?: number;
  ty?: number;
  t?: number;
  flight?: number;
  blast?: number;
  embers?: number;
  shadow?: Img;
}

export interface Status {
  burn: number;
  burnDps: number;
  burnTick: number;
  chill: number;
  chillStacks: number;
  frozen: number;
  shock: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind | BossKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kx: number;
  ky: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  contact: number;
  xp: number;
  elite: boolean;
  affix?: Affix;
  state: string;
  t: number;
  t2: number;
  anim: number;
  facing: number;
  flash: number;
  dead: boolean;
  scale: number;
  status: Status;
  sprite: Img;
  shadow: Img;
  extra?: Img;
  ring?: Img;
  boss?: BossState;
  mini?: boolean;
  hurry?: boolean;
  /** Entrance after a summon: grows out of the circle, drops in, or steps out of a rift. */
  enter?: { kind: 'rise' | 'drop' | 'emerge'; t: number; landed?: boolean };
}

export interface BossState {
  phase: 1 | 2;
  queue: string[];
  cooldown: number;
  pattern: string;
  pt: number;
  step: number;
  angle: number;
  arms: number;
  armA: number;
  armWarn: number;
  armLive: number;
  dirX: number;
  dirY: number;
  bounces: number;
  tx: number;
  ty: number;
  air: number;
  enraged: boolean;
  invuln: number;
  name: string;
}

export interface Pickup {
  kind: 'gem' | 'heart' | 'chest' | 'wchest';
  tier: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  t: number;
  magnet: boolean;
  sprite: Img;
  dead: boolean;
}

export interface Obstacle {
  kind: 'pillar' | 'barrel' | 'crate';
  x: number;
  y: number;
  r: number;
  hp: number;
  sprite: Img;
  dead: boolean;
}

/** Ground effects: burning embers, poison clouds, and vortices that pull enemies in. */
export interface Hazard {
  kind: 'ember' | 'poison' | 'vortex';
  x: number;
  y: number;
  r: number;
  /** Seconds left. */
  t: number;
  /** Total seconds, for drawing. */
  dur?: number;
  tick: number;
  dmg: number;
  src?: string;
  /** Vortex: pull speed toward the centre. */
  pull?: number;
  /** Vortex: lightning arcs from the core to enemies inside (damage per arc). */
  arc?: number;
  arcT?: number;
  /** Vortex: damage of the burst when it closes. */
  burst?: number;
  /** Poison: enemies that die inside leave a new cloud. */
  spread?: boolean;
}

export interface Pet {
  kind: Pets;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  cd: number;
  state: 'follow' | 'dash' | 'return';
  target?: Enemy;
  angle: number;
  sprite: Img;
  hitCd: Map<Enemy, number>;
}

export interface Telegraph {
  kind: 'spawn' | 'line' | 'circle';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  r?: number;
  t: number;
  dur: number;
  onDone?: () => void;
  /** Summons: 1 weak, 2 medium, 3 strong, 4 elite, 5 boss. */
  tier?: number;
  /** Lightning strikes already thrown down by an elite summon. */
  strikes?: number;
}

export interface Visual {
  kind: 'beam' | 'chain' | 'bolt' | 'slash';
  pts: number[];
  width: number;
  t: number;
  dur: number;
  color: number;
}

export const ELEMENT_COLOR: Record<Element, string> = { fire: '#f77622', ice: '#2ce8f5', shock: '#fee761' };
export const ELEMENT_NAME: Record<Element, string> = { fire: '燃烧', ice: '冰寒', shock: '感电' };
