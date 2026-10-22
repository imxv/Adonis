import type { Mods, Tag } from './core/stats';
import type { DifficultyId } from './data/difficulty';
import type { Pets } from './data/enemies';
import type { SpellId } from './data/spells';
import type { PreparedRun } from './meta/types';

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

/** A supply is recorded even after its one-time effects have been applied. */
export interface RunSupply {
  id: string;
  name: string;
}

export interface SavedRun {
  v: 1;
  savedAt: number;
  /** Added on first load for older checkpoints, then preserved for the whole run. */
  runId?: string;
  supply?: RunSupply;
  /** Preparation receipt only: restoring a run never applies these effects again. */
  prepared?: PreparedRun;
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
  weapons: { id: string }[];
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
  runId?: string;
  supply?: RunSupply;
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
const SUPPLY_BOARD_KEY = 'adonis.board.supplied.v1';
const SCORED_RUNS_KEY = 'adonis.board.runs.v1';
const BOARD_SIZE = 20;
type ScoreBoard = 'standard' | 'supplied';
const scoredRuns = new Map<string, ScoreBoard>();
let runSequence = 0;

/** Run identity uses its own randomness, leaving the seeded dungeon stream untouched. */
export function createRunId(): string {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (globalThis.crypto?.getRandomValues) {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    // Some embedded browsers restrict crypto. Time, entropy and a page-local counter still identify new runs.
  }
  return `run-${Date.now().toString(36)}-${(++runSequence).toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Stable even if writing the migration is blocked, or a legacy checkpoint is restored directly. */
export function ensureRunId(run: SavedRun): string {
  if (typeof run.runId === 'string' && run.runId.trim()) return run.runId;
  const source = JSON.stringify({ ...run, runId: undefined });
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < source.length; i++) {
    a = Math.imul(a ^ source.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ source.charCodeAt(i), 0x85ebca6b);
  }
  run.runId = `legacy-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
  return run.runId;
}

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
  ensureRunId(run);
  write(RUN_KEY, run);
}

export function loadRun(): SavedRun | null {
  const r = read<SavedRun>(RUN_KEY);
  if (!r || r.v !== 1 || (r.ascended !== undefined && typeof r.ascended !== 'boolean')) return null;
  if (typeof r.runId !== 'string' || !r.runId.trim()) {
    ensureRunId(r);
    write(RUN_KEY, r);
  }
  return r;
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
  return readBoard(BOARD_KEY).filter((entry) => !entry.supply);
}

/** Supplied runs have their own local board and never enter the original board. */
export function topSupplyScores(): ScoreEntry[] {
  return readBoard(SUPPLY_BOARD_KEY).filter((entry) => !!entry.supply);
}

function readBoard(key: string): ScoreEntry[] {
  const board = read<ScoreEntry[]>(key);
  return Array.isArray(board) ? board : [];
}

/** Record once per run ID. Returns the rank in its board, or 0 outside the top twenty. */
export function addScore(e: ScoreEntry): number {
  const standard = topScores();
  const supplied = topSupplyScores();
  const receipts = read<Record<string, ScoreBoard>>(SCORED_RUNS_KEY);
  if (receipts && typeof receipts === 'object' && !Array.isArray(receipts)) {
    for (const [id, board] of Object.entries(receipts)) {
      if (board === 'standard' || board === 'supplied') scoredRuns.set(id, board);
    }
  }
  const runId = typeof e.runId === 'string' && e.runId.trim() ? e.runId : undefined;
  if (runId) {
    // Search the boards too, so an interrupted receipt write cannot duplicate a visible score.
    const existingStandard = standard.findIndex((entry) => entry.runId === runId);
    const existingSupplied = supplied.findIndex((entry) => entry.runId === runId);
    const previous = scoredRuns.get(runId) ?? (existingStandard >= 0 ? 'standard' : existingSupplied >= 0 ? 'supplied' : undefined);
    if (previous) {
      scoredRuns.set(runId, previous);
      write(SCORED_RUNS_KEY, Object.fromEntries(scoredRuns));
      return (previous === 'standard' ? standard : supplied).findIndex((entry) => entry.runId === runId) + 1;
    }
  }
  const target: ScoreBoard = e.supply ? 'supplied' : 'standard';
  const board = [...(target === 'supplied' ? supplied : standard), e]
    .sort((a, b) => b.score - a.score || a.date - b.date)
    .slice(0, BOARD_SIZE);
  write(target === 'supplied' ? SUPPLY_BOARD_KEY : BOARD_KEY, board);
  if (runId) {
    scoredRuns.set(runId, target);
    // Receipts outlive leaderboard eviction; retrying a completed run must not submit it again.
    write(SCORED_RUNS_KEY, Object.fromEntries(scoredRuns));
  }
  return board.indexOf(e) + 1;
}
