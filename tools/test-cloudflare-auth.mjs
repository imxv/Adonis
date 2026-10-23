/** Unit test for GitHub sign-in, sessions and per-player scores, run in plain Node:
 * the Pages Functions are called directly, D1 is an in-memory node:sqlite database built from
 * migrations/, and GitHub is a stubbed fetch. Nothing leaves the machine.
 *   node tools/test-cloudflare-auth.mjs
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as callback from '../functions/api/auth/github/callback.js';
import * as login from '../functions/api/auth/github/login.js';
import * as logout from '../functions/api/auth/logout.js';
import * as me from '../functions/api/auth/me.js';
import * as scores from '../functions/api/scores.js';

/** Enough of the D1 binding for these Functions: prepare/bind/first/run/all and transactional batch. */
function fakeD1() {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    rows: () => sqlite.prepare(sql).all(...params).map((row) => ({ ...row })),
    first: async () => statement(sql, params).rows()[0] ?? null,
    run: async () => ({ results: statement(sql, params).rows(), success: true }),
    all: async () => ({ results: statement(sql, params).rows(), success: true }),
  });
  return {
    sqlite,
    prepare: (sql) => statement(sql),
    async batch(list) {
      sqlite.exec('BEGIN');
      try {
        const results = list.map((item) => ({ results: item.rows(), success: true }));
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

const ORIGIN = 'https://adonis-game.pages.dev';
const db = fakeD1();
const env = { DB: db, GITHUB_CLIENT_ID: 'client-id', GITHUB_CLIENT_SECRET: 'client-secret' };
const rows = (sql, ...params) => db.sqlite.prepare(sql).all(...params).map((row) => ({ ...row }));
const request = (path, init = {}) => new Request(new URL(path, ORIGIN), init);
const setCookies = (response) => response.headers.getSetCookie();
const cookieValue = (response, name) => setCookies(response).find((line) => line.startsWith(`${name}=`))?.split(';')[0].slice(name.length + 1);
let ip = 0;
const run = (changes = {}) => ({
  name: '游客', score: 100, floor: 1, kills: 3, lv: 1, secs: 30, diff: 'normal', victory: false, rank: 'B', weapon: 'pistol', pid: 'guest-a', ...changes,
});
const post = async (body, cookie = '') => {
  const response = await scores.onRequest({ env, request: request('/api/scores', {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `203.0.113.${++ip}`, ...(cookie && { Cookie: cookie }) },
  }) });
  return { status: response.status, data: await response.json() };
};
const board = async (query = '', cookie = '') => (await scores.onRequest({ env, request: request(`/api/scores${query}`, cookie ? { headers: { Cookie: cookie } } : {}) })).json();

// Stub GitHub: the code exchange and the profile read.
const github = { calls: [], user: { id: 4242, login: 'octo-player', name: 'Octo', avatar_url: 'https://avatars.githubusercontent.com/u/4242' } };
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  github.calls.push({ url, init });
  if (url === 'https://github.com/login/oauth/access_token') {
    const body = JSON.parse(init.body);
    return Response.json(body.code === 'good-code' ? { access_token: 'gho_secret_token', token_type: 'bearer', scope: '' } : { error: 'bad_verification_code' });
  }
  if (url === 'https://api.github.com/user') {
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer gho_secret_token');
    return Response.json(github.user);
  }
  throw new Error(`unexpected fetch ${url}`);
};

// Not configured: GitHub sign-in is reported off and its routes send the player home.
let response = await me.onRequestGet({ env: { DB: db }, request: request('/api/auth/me') });
assert.deepEqual(await response.json(), { player: null, github: false });
response = await login.onRequestGet({ env: { DB: db }, request: request('/api/auth/github/login') });
assert.equal(response.headers.get('Location'), `${ORIGIN}/?login=unavailable`);
response = await me.onRequestGet({ env, request: request('/api/auth/me') });
assert.deepEqual(await response.json(), { player: null, github: true });

// A guest plays twice; the board keeps their best run under their newest name.
let result = await post(run({ score: 300 }));
assert.equal(result.status, 200);
assert.equal(result.data.rank, 1);
result = await post(run({ name: '改了名', score: 200 }));
assert.equal(result.data.top.length, 1);
assert.equal(result.data.top[0].score, 300);
assert.equal(result.data.top[0].name, '改了名');
assert.equal(result.data.top[0].provider, 'guest');
assert.equal(result.data.top[0].you, true);
assert.equal(result.data.runs, 2);
assert.equal(result.data.players, 1);
result = await post(run({ name: '别人', score: 250, pid: 'guest-b' }));
assert.equal(result.data.rank, 2);
assert.equal(result.data.best, 2);
assert.equal(result.data.players, 2);

// Starting sign-in: a state cookie scoped to the OAuth routes, carrying the guest id to claim.
response = await login.onRequestGet({ env, request: request('/api/auth/github/login?pid=guest-a') });
assert.equal(response.status, 302);
const authorize = new URL(response.headers.get('Location'));
assert.equal(authorize.origin + authorize.pathname, 'https://github.com/login/oauth/authorize');
assert.equal(authorize.searchParams.get('client_id'), 'client-id');
assert.equal(authorize.searchParams.get('redirect_uri'), `${ORIGIN}/api/auth/github/callback`);
assert.equal(authorize.searchParams.get('scope'), null);
const state = authorize.searchParams.get('state');
const oauthCookie = setCookies(response)[0];
assert.match(oauthCookie, new RegExp(`^adonis_oauth=${state}\\.guest-a; Path=/api/auth/github; Max-Age=600; HttpOnly; SameSite=Lax; Secure$`));
const oauth = `adonis_oauth=${state}.guest-a`;
response = await login.onRequestGet({ env, request: request('/api/auth/github/login?pid=../../x') });
assert.match(setCookies(response)[0], /^adonis_oauth=[\w-]+\.; /);

// Refusals: declined on GitHub, a forged state, a rejected code. None signs anyone in.
const back = async (query, cookie = oauth) => {
  const reply = await callback.onRequestGet({ env, request: request(`/api/auth/github/callback${query}`, { headers: { Cookie: cookie } }) });
  assert.equal(reply.status, 302);
  assert.ok(setCookies(reply).some((line) => line.startsWith('adonis_oauth=; Path=/api/auth/github; Max-Age=0')));
  return reply;
};
assert.equal((await back('?error=access_denied&state=x')).headers.get('Location'), `${ORIGIN}/?login=cancelled`);
assert.equal((await back(`?code=good-code&state=forged`)).headers.get('Location'), `${ORIGIN}/?login=failed`);
assert.equal((await back(`?code=good-code&state=${state}`, '')).headers.get('Location'), `${ORIGIN}/?login=failed`);
assert.equal((await back(`?code=bad-code&state=${state}`)).headers.get('Location'), `${ORIGIN}/?login=failed`);
assert.equal(rows('SELECT * FROM sessions').length, 0);

// Success: the session cookie is set, only its hash is stored, and the guest's runs join the account.
github.calls.length = 0;
response = await back(`?code=good-code&state=${state}`);
assert.equal(response.headers.get('Location'), `${ORIGIN}/?login=github`);
const exchange = JSON.parse(github.calls[0].init.body);
assert.deepEqual(exchange, { client_id: 'client-id', client_secret: 'client-secret', code: 'good-code', redirect_uri: `${ORIGIN}/api/auth/github/callback` });
const token = cookieValue(response, 'adonis_session');
assert.match(token, /^[\w-]{43}$/);
assert.match(setCookies(response).find((line) => line.startsWith('adonis_session=')), /; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure$/);
const session = `adonis_session=${token}`;
assert.equal(rows('SELECT * FROM sessions').length, 1);
assert.notEqual(rows('SELECT token_hash FROM sessions')[0].token_hash, token);
const everything = JSON.stringify(['players', 'sessions', 'scores', 'board'].map((table) => rows(`SELECT * FROM ${table}`)));
assert.ok(!everything.includes('gho_secret_token'), 'the GitHub access token is never stored');
assert.ok(!everything.includes(token), 'the raw session token is never stored');
assert.deepEqual(rows('SELECT id, provider, login, name FROM players'), [{ id: 'github:4242', provider: 'github', login: 'octo-player', name: 'Octo' }]);
assert.deepEqual(rows("SELECT player, provider, name FROM scores WHERE pid = 'guest-a' GROUP BY player"), [{ player: 'github:4242', provider: 'github', name: 'octo-player' }]);
assert.deepEqual(rows('SELECT player, name, score FROM board ORDER BY score DESC'), [
  { player: 'github:4242', name: 'octo-player', score: 300 },
  { player: 'guest:guest-b', name: '别人', score: 250 },
]);

response = await me.onRequestGet({ env, request: request('/api/auth/me', { headers: { Cookie: `other=1; ${session}` } }) });
assert.deepEqual(await response.json(), {
  player: { id: 'github:4242', provider: 'github', login: 'octo-player', name: 'Octo', avatar: 'https://avatars.githubusercontent.com/u/4242' },
  github: true,
});

// Signed in, the account decides who played: the name and guest id in the body cannot change it.
result = await post(run({ name: '冒充', score: 900, pid: 'guest-b' }), session);
assert.equal(result.status, 200);
assert.equal(result.data.rank, 1);
assert.deepEqual(result.data.top.map(({ name, score, provider, you }) => ({ name, score, provider, you })), [
  { name: 'octo-player', score: 900, provider: 'github', you: true },
  { name: '别人', score: 250, provider: 'guest', you: false },
]);
assert.ok(result.data.top.every((row) => !('player' in row) && !('pid' in row)));
let reply = await board('?pid=guest-b', session);
assert.equal(reply.best, 1);
reply = await board('?pid=guest-b');
assert.equal(reply.best, 2);
assert.equal(reply.top[1].you, true);

// Signing in again on a second device keeps one account, and a renamed GitHub login follows on the board.
github.user = { ...github.user, login: 'octo-renamed' };
response = await login.onRequestGet({ env, request: request('/api/auth/github/login') });
const second = new URL(response.headers.get('Location')).searchParams.get('state');
response = await back(`?code=good-code&state=${second}`, `adonis_oauth=${second}.`);
assert.equal(response.headers.get('Location'), `${ORIGIN}/?login=github`);
assert.equal(rows('SELECT * FROM players').length, 1);
assert.equal(rows('SELECT * FROM sessions').length, 2);
assert.equal((await board()).top[0].name, 'octo-renamed');

// Sign-out: refused from another site, otherwise the session row and cookie are gone.
response = await logout.onRequestPost({ env, request: request('/api/auth/logout', { method: 'POST', headers: { Cookie: session, Origin: 'https://evil.example' } }) });
assert.equal(response.status, 403);
response = await logout.onRequestPost({ env, request: request('/api/auth/logout', { method: 'POST', headers: { Cookie: session, Origin: ORIGIN } }) });
assert.equal(response.status, 200);
assert.match(setCookies(response)[0], /^adonis_session=; Path=\/; Max-Age=0; HttpOnly; SameSite=Lax; Secure$/);
assert.equal(rows('SELECT * FROM sessions').length, 1);
response = await me.onRequestGet({ env, request: request('/api/auth/me', { headers: { Cookie: session } }) });
assert.equal((await response.json()).player, null);

// An expired session counts as a guest.
response = await back(`?code=good-code&state=${second}`, `adonis_oauth=${second}.`);
const fresh = `adonis_session=${cookieValue(response, 'adonis_session')}`;
const whoIs = async (cookie) => (await (await me.onRequestGet({ env, request: request('/api/auth/me', { headers: { Cookie: cookie } }) })).json()).player;
assert.equal((await whoIs(fresh)).login, 'octo-renamed');
db.sqlite.exec('UPDATE sessions SET expires_at = 1');
assert.equal(await whoIs(fresh), null);

console.log('PASS: GitHub sign-in (config, state, refusals, token never stored), sessions, sign-out, guest claim, per-player board');
