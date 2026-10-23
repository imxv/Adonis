import type { DifficultyId } from '../data/difficulty';
import { playerId, playerName } from './account';

export { playerId, playerName, setPlayerName } from './account';

/*
 * The global leaderboard at /api/scores, served by functions/api/scores.js on Cloudflare Pages
 * (or ops/deploy/serve.py on the old server). It shows each player once, with their best run.
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
  /** Submitted by this player. */
  you: boolean;
  /** 'github' for a signed-in player; guests and the old server send 'guest' or nothing. */
  provider?: 'guest' | 'github';
}

export interface BoardReply {
  top: GlobalEntry[];
  /** Runs ever submitted. */
  runs: number;
  /** Players on the board; missing from the old server. */
  players?: number;
  /** This player's place, 0 if none. */
  best: number;
  /** Place of the run just submitted, among the other players' bests. */
  rank?: number;
}

export type RunEntry = Omit<GlobalEntry, 'name' | 'date' | 'you' | 'provider'>;

const API = '/api/scores';

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
      // The sign-in cookie decides who a run belongs to; the name and id below are for guests.
      credentials: 'same-origin',
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
