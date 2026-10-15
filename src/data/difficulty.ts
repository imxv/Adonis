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
