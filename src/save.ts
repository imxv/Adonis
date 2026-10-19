import type { Mods, Tag } from './core/stats';
import type { DifficultyId } from './data/difficulty';
import type { Pets } from './data/enemies';
import type { SpellId } from './data/spells';

/**
 * Local persistence: one checkpoint of the run in progress, and a local leaderboard.
 * Both live in this browser only; every access is guarded, so blocked storage just means no saves.
 */

export interface SavedGroundWeapon {
  /** Preserve the opened chest under an uncollected weapon when continuing. */
  onChest?: boolean;
  x: number;
  y: number;
  id: string;
  level: number;
  cd: number;
  ammo?: number;
  reloadT?: number;
  spin?: number;
}

export interface SavedChallenge {
  attempted: boolean;
  completed: boolean;
  rewarded: boolean;
}

export interface SavedRun {
  v: 1;
  savedAt: number;
  /** The hero of this run; saves from before heroes existed were the knight's. */
  hero?: string;
  seed: number;
  /** Missing means the original seeded dungeon layout for the rest of this run. */
  dungeonVersion?: 2;
  diff: DifficultyId;
  styles: string[];
  level: number;
  mods: Mods;
  stacks: Record<string, number>;
  tags: Partial<Record<Tag, number>>;
  weapons: { id: string; level: number }[];
  /** Weapons left on the current floor; absent in older v1 saves. */
  groundWeapons?: SavedGroundWeapon[];
  held: number;
  spells: { id: SpellId; level: number; evolved: boolean; kills: number }[];
  pets: Pets[];
  /** Missing in older saves; true means the saved modifiers already include the transformation bonuses. */
  ascended?: boolean;
  hp: number;
  armor: number;
  xp: number;
  xpLevel: number;
  xpNext: number;
  kills: number;
  maxCombo: number;
  /** Missing in saves from before the beat game. */
  score?: number;
  damage: Record<string, number>;
  elapsed: number;
  /** Progress on the current floor. */
  rooms: { id: string; cleared: boolean; visited: boolean; seen: boolean; challenge?: SavedChallenge }[];
  /** Room to resume in: the last safe room the player stood in. */
  at: string;
}

export interface ScoreEntry {
  score: number;
  victory: boolean;
  /** 1-based floor reached. */
  floor: number;
  kills: number;
  lv: number;
  secs: number;
  diff: DifficultyId;
  date: number;
  /** Best style rank reached (D to SS); missing on runs from before the beat game. */
  rank?: string;
}

const RUN_KEY = 'adonis.run.v1';
const BOARD_KEY = 'adonis.board.v1';
const BOARD_SIZE = 20;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the game goes on without it.
  }
}

export function saveRun(run: SavedRun) {
  write(RUN_KEY, run);
}

export function loadRun(): SavedRun | null {
  const r = read<SavedRun>(RUN_KEY);
  return r && r.v === 1 && (r.ascended === undefined || typeof r.ascended === 'boolean') ? r : null;
}

export function clearRun() {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    // Nothing to clear.
  }
}

const DIFF_MULT: Record<DifficultyId, number> = { easy: 0.8, normal: 1, hard: 1.3 };

/**
 * The points earned in play (kills and on-beat actions times the style rank, and each fight's grade),
 * plus floors reached and level; a clear adds a bonus, more for a fast one. Harder runs score more.
 */
export function scoreOf(e: Omit<ScoreEntry, 'score' | 'date'>, points: number): number {
  const base = points + (e.floor - 1) * 1000 + e.lv * 50 + (e.victory ? 3000 + Math.max(0, 900 - e.secs) * 3 : 0);
  return Math.round(base * DIFF_MULT[e.diff]);
}

export function topScores(): ScoreEntry[] {
  return read<ScoreEntry[]>(BOARD_KEY) ?? [];
}

/** Record a finished run. Returns its 1-based rank, or 0 if it did not make the board. */
export function addScore(e: ScoreEntry): number {
  const board = [...topScores(), e].sort((a, b) => b.score - a.score || a.date - b.date).slice(0, BOARD_SIZE);
  write(BOARD_KEY, board);
  return board.indexOf(e) + 1;
}
