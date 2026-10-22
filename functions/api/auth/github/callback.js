import {
  OAUTH_COOKIE, OAUTH_PATH, SESSION_COOKIE, SESSION_MS, callbackUrl, cookie, githubConfigured, guestId, randomToken, readCookie, sha256,
} from '../../../_lib/session.js';

const GITHUB_HEADERS = { Accept: 'application/json', 'User-Agent': 'adonis-game' };

/** GitHub sends the player back here. The access token is used once for the profile and never stored. */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', cookie(request, OAUTH_COOKIE, '', 0, OAUTH_PATH));
  const back = (result) => {
    headers.set('Location', new URL(`/?login=${result}`, request.url).toString());
    return new Response(null, { status: 302, headers });
  };
  if (!githubConfigured(env)) return back('unavailable');
  if (url.searchParams.get('error')) return back('cancelled');
  const [state, pid] = readCookie(request, OAUTH_COOKIE).split('.');
  const code = url.searchParams.get('code');
  if (!state || !code || url.searchParams.get('state') !== state) return back('failed');

  let user;
  try {
    const exchange = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { ...GITHUB_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: callbackUrl(request),
      }),
    });
    const grant = await exchange.json();
    if (typeof grant.access_token !== 'string') return back('failed');
    const profile = await fetch('https://api.github.com/user', {
      headers: { ...GITHUB_HEADERS, Accept: 'application/vnd.github+json', Authorization: `Bearer ${grant.access_token}` },
    });
    user = await profile.json();
    if (!profile.ok || !Number.isSafeInteger(user?.id) || typeof user.login !== 'string') return back('failed');
  } catch (error) {
    console.error('GitHub sign-in failed', error);
    return back('failed');
  }

  const id = `github:${user.id}`;
  const login = user.login.slice(0, 39);
  const name = typeof user.name === 'string' && user.name.trim() ? user.name.trim().slice(0, 64) : login;
  const avatar = typeof user.avatar_url === 'string' ? user.avatar_url.slice(0, 300) : '';
  const guest = guestId(pid) && `guest:${guestId(pid)}`;
  const token = randomToken();
  const now = Date.now();
  const db = env.DB;
  try {
    await db.batch([
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
      db.prepare(`INSERT INTO players (id, provider, login, name, avatar, created_at, seen_at) VALUES (?, 'github', ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET login = excluded.login, name = excluded.name, avatar = excluded.avatar, seen_at = excluded.seen_at`)
        .bind(id, login, name, avatar, now, now),
      db.prepare('INSERT INTO sessions (token_hash, player, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .bind(await sha256(token), id, now, now + SESSION_MS),
      // The runs this browser played as a guest join the account; its board row becomes the better of the two.
      ...(guest ? [
        db.prepare(`UPDATE scores SET player = ?, provider = 'github', name = ? WHERE player = ?`).bind(id, login, guest),
        db.prepare('DELETE FROM board WHERE player IN (?, ?)').bind(id, guest),
        db.prepare(`INSERT INTO board (player, provider, name, run, score, date)
          SELECT player, provider, ?, id, score, date FROM scores WHERE player = ? ORDER BY score DESC, date ASC, id ASC LIMIT 1`)
          .bind(login, id),
      ] : []),
      // A renamed GitHub account shows its new name on the board.
      db.prepare('UPDATE board SET name = ? WHERE player = ?').bind(login, id),
    ]);
  } catch (error) {
    console.error('Saving the GitHub session failed', error);
    return back('failed');
  }
  headers.append('Set-Cookie', cookie(request, SESSION_COOKIE, token, SESSION_MS / 1000));
  return back('github');
}
