/*
 * Shared by the auth and leaderboard Functions. A file without onRequest exports is not a route.
 *
 * A signed-in player carries one HttpOnly cookie with a random token; D1 keeps only its SHA-256 hash.
 * Guests have no session: they are known by the random id their browser keeps (see src/net/board.ts).
 */

export const SESSION_COOKIE = 'adonis_session';
export const SESSION_MS = 30 * 24 * 3600 * 1000;

export function json(payload, status = 200, headers = {}) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

export function readCookie(request, name) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return '';
}

/** Lax keeps the cookie on the redirect back from GitHub but off cross-site POSTs. */
export function cookie(request, name, value, maxAgeSeconds, path = '/') {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; Path=${path}; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`;
}

export function randomToken(bytes = 32) {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The signed-in player for this request, or null for a guest or an expired session. */
export async function currentPlayer(request, db) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  return db.prepare(`SELECT p.id, p.provider, p.login, p.name, p.avatar FROM sessions s
    JOIN players p ON p.id = s.player WHERE s.token_hash = ? AND s.expires_at > ?`)
    .bind(await sha256(token), Date.now()).first();
}

export const OAUTH_COOKIE = 'adonis_oauth';
export const OAUTH_PATH = '/api/auth/github';
export const callbackUrl = (request) => new URL(`${OAUTH_PATH}/callback`, request.url).toString();

/** A guest's browser id, as src/net/board.ts makes it; anything else is dropped. */
export const guestId = (value) => (/^[A-Za-z0-9_-]{1,40}$/.test(value || '') ? value : '');

export const githubConfigured = (env) => Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);

/** What the game is told about a signed-in player. */
export const publicPlayer = (player) => player && {
  id: player.id, provider: player.provider, login: player.login, name: player.name, avatar: player.avatar,
};
