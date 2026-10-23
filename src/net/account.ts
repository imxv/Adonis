/*
 * Who is playing. A guest is this browser's random id plus a name they typed, both kept in localStorage.
 * A GitHub player is signed in through /api/auth (Cloudflare Pages Functions): the session is an HttpOnly
 * cookie the game never sees, and /api/auth/me says whose it is. Every call fails soft, so local development
 * and the old Python server simply offer the guest choice alone.
 */

export interface GithubPlayer {
  id: string;
  login: string;
  name: string;
  avatar: string;
}

export type Account = { kind: 'guest'; name: string } | ({ kind: 'github' } & GithubPlayer);

/** The outcome of a trip to GitHub, read once from `?login=` when the page comes back. */
export type LoginNotice = 'github' | 'failed' | 'cancelled' | 'unavailable';

export interface AccountState {
  /** Null until the player has chosen how to play. */
  account: Account | null;
  /** This server can sign players in with GitHub. */
  github: boolean;
  /** The account server answered. */
  online: boolean;
  notice?: LoginNotice;
}

const PID_KEY = 'adonis.pid.v1';
const NAME_KEY = 'adonis.name.v1';
/** The last GitHub player seen here, so a dropped connection doesn't turn them back into a stranger. */
const GITHUB_KEY = 'adonis.github.v1';
export const NAME_MAX = 12;

function load(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function store(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Private mode: it lasts for this visit only.
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

let state: AccountState = { account: null, github: false, online: false };
const listeners = new Set<(s: AccountState) => void>();

function cachedGithub(): GithubPlayer | null {
  try {
    const p = JSON.parse(load(GITHUB_KEY) || 'null') as GithubPlayer | null;
    return p && typeof p.login === 'string' ? p : null;
  } catch {
    return null;
  }
}

function guest(): Account | null {
  const name = load(NAME_KEY);
  return name ? { kind: 'guest', name } : null;
}

function set(next: Partial<AccountState>) {
  state = { ...state, ...next };
  listeners.forEach((f) => f(state));
}

export const account = () => state;

export function onAccountChange(f: (s: AccountState) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** The name the board shows for this player: their GitHub login, or the guest name they typed. */
export function playerName(): string {
  const a = state.account ?? guest();
  return !a ? '' : a.kind === 'github' ? a.login : a.name;
}

export function setPlayerName(name: string) {
  store(NAME_KEY, name.trim().slice(0, NAME_MAX));
  if (state.account?.kind !== 'github') set({ account: guest() });
}

export const isSignedIn = () => state.account?.kind === 'github';

/** A suggestion for the name field, so a guest can enter with one tap. */
export const suggestName = () => `旅人${String(Math.floor(1000 + Math.random() * 9000))}`;

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(path, { ...init, signal: ctl.signal, cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok || !(res.headers.get('Content-Type') ?? '').includes('json')) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Find out who is playing: read and clear `?login=`, then ask the server. A GitHub session wins;
 * otherwise a saved guest name; otherwise no account yet, and the game asks.
 */
export async function loadAccount(): Promise<AccountState> {
  const url = new URL(location.href);
  const raw = url.searchParams.get('login');
  const notice = (['github', 'failed', 'cancelled', 'unavailable'] as const).find((n) => n === raw);
  if (raw !== null) {
    url.searchParams.delete('login');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  const me = await call<{ player: (GithubPlayer & { provider: string }) | null; github: boolean }>('/api/auth/me');
  if (!me) {
    // Unreachable: keep whoever played here last.
    const gh = cachedGithub();
    set({ account: gh ? { kind: 'github', ...gh } : guest(), github: false, online: false, notice });
    return state;
  }
  const p = me.player;
  if (p?.provider === 'github') {
    const gh: GithubPlayer = { id: p.id, login: p.login, name: p.name, avatar: p.avatar };
    store(GITHUB_KEY, JSON.stringify(gh));
    set({ account: { kind: 'github', ...gh }, github: !!me.github, online: true, notice });
  } else {
    store(GITHUB_KEY, '');
    // Back from GitHub without a session: the cookie did not stick.
    set({ account: guest(), github: !!me.github, online: true, notice: notice === 'github' ? 'failed' : notice });
  }
  return state;
}

/** Leave for GitHub's consent page. This browser's guest runs join the account on return. */
export function signInWithGithub() {
  location.assign(`/api/auth/github/login?pid=${encodeURIComponent(playerId())}`);
}

export function playAsGuest(name: string) {
  setPlayerName(name);
}

/** Sign out of GitHub. The guest name, if any, is kept for playing as a guest again. */
export async function signOut() {
  await call('/api/auth/logout', { method: 'POST' });
  store(GITHUB_KEY, '');
  set({ account: guest(), notice: undefined });
}
