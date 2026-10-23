export type DifficultyId = 'easy' | 'normal' | 'hard';

/** One knob per difficulty. Systems read these multipliers; nothing else branches on difficulty. */
export interface Difficulty {
  id: DifficultyId;
  name: string;
  /** Enemies per wave and horde density. */
  enemies: number;
  /** Enemy and boss health. */
  hp: number;
  /** How often rooms get traps. */
  traps: number;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy: { id: 'easy', name: '简单', enemies: 0.75, hp: 0.8, traps: 0.5 },
  normal: { id: 'normal', name: '普通', enemies: 1, hp: 1, traps: 1 },
  hard: { id: 'hard', name: '困难', enemies: 1.3, hp: 1.3, traps: 1.6 },
};

/**
 * Extra pressure per floor below the first, on top of the base curves (enemy hp, speed, bullet speed, wave size).
 * Each value is the added fraction per floor: hp 0.15 means floor 5 enemies have 1.6x the health they would otherwise.
 */
export const FLOOR_SCALING = {
  /** Enemy health (bosses keep their own curve). */
  hp: 0.15,
  /** Damage the player takes from every source. Fractions roll: x1.2 means a 1-point hit deals 2 one time in five. */
  damage: 0.2,
  /** Added chance per floor that a wave brings an elite. */
  elites: 0.04,
};

export function floorScale(per: number, level: number) {
  return 1 + per * level;
}

/**
 * How a combat room's waves come in. Each wave is summoned all at once and the next waits until it is dead, so
 * waves no longer overlap; `budget` makes each one bigger to keep the pressure the overlap used to give.
 * Wave size still grows with the floor and the room's depth (see planWaves) and with the difficulty's `enemies`.
 */
export const WAVE_RULES = {
  /** Seconds after the gates shut before the first wave starts loading in. */
  first: 0.45,
  /** Seconds between the last monster of a wave falling and the next wave starting to load. */
  gap: 1.1,
  /** Seconds a wave takes to load in; every monster in it arrives at the end, on the same frame. */
  summon: 1.35,
  /** Seconds a monster summoned in the middle of a fight (horde, boss) takes to load in. */
  quick: 0.85,
  /** Seconds monsters hold still once they have arrived, before they move or hurt anyone. */
  wake: 0.3,
  /** Multiplier on each wave's enemy budget. */
  budget: 1.25,
  /** Every wave brings at least this many and at most this many monsters. */
  minSize: 3,
  maxSize: 12,
};

/** Heart drop chances. Hearts are the only way to recover health, so they stay scarce. */
export const HEART_DROPS = {
  /** A cleared combat room, after the chest rolls. */
  roomClear: 0.1,
  /** A broken crate. */
  crate: 0.12,
  /** Any ordinary kill. */
  kill: 0.0075,
  /** An elite kill. */
  elite: 0.5,
};
