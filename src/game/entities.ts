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
  sprite: Img;
  glow: Img;
  shadow: Img;
}

export type ProjKind = 'bolt' | 'pellet' | 'blade' | 'shell' | 'shard' | 'ebullet' | 'ebig';

export interface Proj {
  kind: ProjKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  pierce: number;
  life: number;
  knock: number;
  src: string;
  sprite: Img;
  glow?: Img;
  hit: Set<Enemy>;
  dead: boolean;
  // boomerang
  dist?: number;
  maxDist?: number;
  returning?: boolean;
  // mortar
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
  facing: number;
  flash: number;
  dead: boolean;
  scale: number;
  status: Status;
  sprite: Img;
  shadow: Img;
  ring?: Img;
  boss?: BossState;
  mini?: boolean;
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
  kind: 'petal' | 'heart';
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
  kind: 'pillar' | 'barrel';
  x: number;
  y: number;
  r: number;
  hp: number;
  sprite: Img;
  dead: boolean;
}

export interface Hazard {
  kind: 'ember' | 'shock';
  x: number;
  y: number;
  r: number;
  t: number;
  tick: number;
  dmg: number;
  sprite?: Img;
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

export type DoorReward = 'rare' | 'weapon' | 'pet' | 'heal' | 'elite' | 'boss' | 'next' | 'victory';

export interface Door {
  x: number;
  y: number;
  reward: DoorReward;
  sprite: Img;
  badge: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  glow: Img;
  open: number;
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
}

export interface Visual {
  kind: 'beam' | 'chain';
  pts: number[];
  width: number;
  t: number;
  dur: number;
  color: number;
}

export type ElementColor = Record<Element, string>;
export const ELEMENT_COLOR: ElementColor = { fire: '#FF7A1A', ice: '#7FD8FF', shock: '#F7E94B' };
export const ELEMENT_NAME: Record<Element, string> = { fire: '燃烧', ice: '冰寒', shock: '感电' };
