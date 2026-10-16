import type { DifficultyId } from '../data/difficulty';

/*
 * The global leaderboard, served next to the game by ops/deploy/serve.py at /api/scores.
 * Every call fails soft: offline, in local development or before the server is updated, it returns null
 * and the game falls back to the leaderboard kept in this browser.
 */

export interface GlobalEntry {
  name: string;
  score: number;
  floor: number;
  kills: number;
  lv: number;
  secs: number;
  diff: DifficultyId;
  victory: boolean;
  /** Best style rank reached in the run (D to SS). */
  rank: string;
  weapon: string;
  date: number;
  /** Submitted from this browser. */
  you: boolean;
}

export interface BoardReply {
  top: GlobalEntry[];
  /** Runs ever submitted. */
  runs: number;
  /** This browser's best place, 0 if none. */
  best: number;
  /** Place of the run just submitted. */
  rank?: number;
}

export type RunEntry = Omit<GlobalEntry, 'name' | 'date' | 'you'>;

const API = '/api/scores';
const PID_KEY = 'adonis.pid.v1';
const NAME_KEY = 'adonis.name.v1';

function load(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the name lasts for this visit only.
  }
}

/** A random id for this browser, so its own runs can be picked out on the board. */
export function playerId(): string {
  let id = load(PID_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    store(PID_KEY, id);
  }
  return id;
}

export const playerName = () => load(NAME_KEY);

export function setPlayerName(name: string) {
  store(NAME_KEY, name.trim().slice(0, 12));
}

async function call(method: 'GET' | 'POST', body?: unknown): Promise<BoardReply | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const url = method === 'GET' ? `${API}?pid=${encodeURIComponent(playerId())}` : API;
    const res = await fetch(url, {
      method,
      signal: ctl.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BoardReply;
    return Array.isArray(data?.top) ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const fetchGlobal = () => call('GET');

export const submitGlobal = (run: RunEntry) => call('POST', { ...run, name: playerName(), pid: playerId() });
