import type { BossLook } from './bossAnim';
import type Phaser from 'phaser';
import type { Element } from '../core/stats';
import type { Affix, BossKind, EnemyKind, Pets, SpawnStyle } from '../data/enemies';

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
  /** Wall bounces left (throwing stars). */
  bounce?: number;
  /** Props a piercing shot has already hit (flames, blades). */
  hitProps?: Set<Obstacle>;
  /** Shards it bursts into when it stops (ice lance). */
  split?: number;
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

/** Elemental state, after Genshin's rules. */
export interface Status {
  /** The element sitting on it and for how long; wind and rock never stay. */
  aura?: Element;
  auraT: number;
  /** Frozen (water + ice): cannot move; a heavy blow shatters it. */
  frozen: number;
  /** Electro-Charged (water + electro): zaps every second and jumps to wet neighbours. */
  ec: number;
  ecTick: number;
  ecDmg: number;
  /** Burning (grass + fire): burns, and scorches whatever stands close. */
  burnT: number;
  burnTick: number;
  burnDmg: number;
  /** Quicken (grass + electro): electro and grass hits on it land harder. */
  quicken: number;
  /** Superconduct (ice + electro): takes more damage for a while. */
  shred: number;
  /** Stunned after its elemental shield breaks. */
  stun: number;
  /** A plain slow from poison and some spells. */
  chill: number;
  /** An infused monster's own element comes back this long after a reaction used it up. */
  regrow: number;
}

export const freshStatus = (): Status => ({ auraT: 0, frozen: 0, ec: 0, ecTick: 0, ecDmg: 0, burnT: 0, burnTick: 0, burnDmg: 0, quicken: 0, shred: 0, stun: 0, chill: 0, regrow: 0 });

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
  /** A local monster carries its style's element: it shrugs off most of that element and keeps it as an aura. */
  infused?: Element;
  /** An elite's elemental shield (like Genshin's Abyss Mages): the right element breaks it fast. */
  eshield?: { el: Element; hp: number; max: number };
  /** The little element mark over its head. */
  auraImg?: Img;
  boss?: BossState;
  mini?: boolean;
  hurry?: boolean;
  /** Entrance after a summon: grows out of the circle, drops in, or steps out of a rift. */
  enter?: { kind: 'rise' | 'drop' | 'emerge' | SpawnStyle; t: number; landed?: boolean; ox?: number };
}

export interface BossState {
  /** Saw gears orbiting a steam colossus. */
  saws?: Proj[];
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
  /** Seconds left gathering the move in `pattern` before it is let go. */
  windup?: number;
  /** Body language: poses, stride, lean, afterimages (see bossAnim). */
  look?: BossLook;
}

export interface Pickup {
  kind: 'gem' | 'heart' | 'chest' | 'wchest' | 'crystal';
  /** Crystallize shards: the element they formed from. */
  element?: Element;
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
  /** Line strikes: how wide the strike is. */
  w?: number;
  /** Summons: how the monster will arrive, and its colour for the puddle it oozes out of. */
  style?: SpawnStyle;
  color?: number;
}

export interface Visual {
  kind: 'beam' | 'chain' | 'bolt' | 'slash' | 'thrust';
  pts: number[];
  width: number;
  t: number;
  dur: number;
  color: number;
}

/** Genshin's element colours: Pyro red-orange, Hydro blue, Electro violet, Cryo ice blue, Anemo teal, Geo gold, Dendro green. */
export const ELEMENT_COLOR: Record<Element, string> = { fire: '#f77622', water: '#3aa0ff', shock: '#b47cf0', ice: '#9fe6f5', wind: '#5fd6b8', rock: '#f4b830', grass: '#8fd14f' };
export const ELEMENT_NAME: Record<Element, string> = { fire: '火', water: '水', shock: '雷', ice: '冰', wind: '风', rock: '岩', grass: '草' };
