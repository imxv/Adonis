import { SESSION_COOKIE, cookie, json, readCookie, sha256 } from '../../_lib/session.js';

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'origin' }, 403);
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    try {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    } catch (error) {
      console.error('Session delete failed', error);
    }
  }
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, SESSION_COOKIE, '', 0) });
}
