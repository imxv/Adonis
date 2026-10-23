import { currentPlayer, guestId, json, sha256 } from '../_lib/session.js';

const TOP = 50;
const COOLDOWN_MS = 8_000;
const MAX_BYTES = 4_096;
const STYLE_RANKS = new Set(['D', 'C', 'B', 'A', 'S', 'SS']);

// Preserve Python's scalar string conversion, including null and booleans.
function text(value) {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  return String(value);
}

function truncate(value, length) {
  return Array.from(text(value)).slice(0, length).join('');
}

function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid');
  const number = (key, low, high) => {
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('invalid');
    const integer = Math.trunc(value);
    if (integer < low || integer > high) throw new Error('invalid');
    return integer;
  };
  const score = number('score', 0, 5_000_000);
  const floor = number('floor', 1, 9);
  const kills = number('kills', 0, 50_000);
  const lv = number('lv', 1, 200);
  const secs = number('secs', 0, 21_600);
  if (!['easy', 'normal', 'hard'].includes(raw.diff)) throw new Error('invalid');
  if (score > 50_000 + kills * 900 + floor * 20_000) throw new Error('invalid');
  // Python str.isprintable excludes Unicode separators and control/format characters.
  const name = Array.from(text(raw.name === undefined ? '' : raw.name))
    .filter((character) => character === ' ' || !/[\p{C}\p{Z}]/u.test(character))
    .join('').trim();
  return {
    name: truncate(name, 12) || '无名骑士', score, floor, kills, lv, secs,
    diff: raw.diff, victory: raw.victory === true,
    rank: STYLE_RANKS.has(raw.rank) ? raw.rank : 'D',
    weapon: truncate(raw.weapon === undefined ? '' : raw.weapon, 16),
    pid: truncate(raw.pid === undefined ? '' : raw.pid, 40),
  };
}

async function readEntry(request) {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) < 1 || Number(declared) > MAX_BYTES)) {
    throw new Error('size');
  }
  if (!request.body) throw new Error('size');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error('size');
    }
    chunks.push(value);
  }
  if (!size) throw new Error('size');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return cleanEntry(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    throw new Error('invalid');
  }
}

/*
 * The board shows each player once, with their best run. `scores` keeps every run; `board` points at each
 * player's best, so reading the top 50 touches about 50 rows however many runs there are.
 * A player is 'github:<id>' when signed in, otherwise 'guest:<browser id>'.
 */

function publicBoard(rows, stats, best, me) {
  const top = rows.map(({ player, ...entry }) => ({
    ...entry, victory: entry.victory === 1, you: Boolean(me) && player === me,
  }));
  return { top, runs: stats.runs, players: stats.players, best: best?.position ?? 0 };
}

const SELECT_TOP = `SELECT b.player, b.provider, b.name, s.score, s.floor, s.kills, s.lv, s.secs, s.diff,
  s.victory, s.rank, s.weapon, s.date FROM board b JOIN scores s ON s.id = b.run
  ORDER BY b.score DESC, b.date ASC, b.run ASC LIMIT ${TOP}`;
const SELECT_STATS = `SELECT (SELECT runs FROM score_stats WHERE id = 1) AS runs, (SELECT COUNT(*) FROM board) AS players`;
// A player's place: everyone whose best beats theirs, plus one. No row when they have no run yet.
const SELECT_BEST = `SELECT (SELECT COUNT(*) FROM board o WHERE o.score > m.score OR (o.score = m.score
  AND (o.date < m.date OR (o.date = m.date AND o.run < m.run)))) + 1 AS position FROM board m WHERE m.player = ?`;

/** Who is asking: the signed-in player, else the guest id the browser sent. */
async function identify(request, db, pid) {
  const player = await currentPlayer(request, db);
  if (player) return { id: player.id, provider: player.provider, name: player.login };
  return guestId(pid) ? { id: `guest:${guestId(pid)}`, provider: 'guest' } : null;
}

async function getBoard(db, me) {
  const [entries, stats, best] = await db.batch([
    db.prepare(SELECT_TOP),
    db.prepare(SELECT_STATS),
    db.prepare(SELECT_BEST).bind(me),
  ]);
  return publicBoard(entries.results, stats.results[0], best.results[0], me);
}

async function submit(db, entry, who, client) {
  const clientHash = await sha256(client);
  const now = Date.now();
  const token = crypto.randomUUID();
  // Old clients may send no id; each of their runs then stands alone rather than merging strangers.
  const player = who?.id ?? `guest:${token}`;
  const provider = who?.provider ?? 'guest';
  const name = who?.name ?? entry.name;
  const claimed = `EXISTS (SELECT 1 FROM score_cooldowns WHERE client = ? AND token = ?)`;
  // D1 batch is a transaction. The unique token gates every mutation on a
  // successful cooldown claim, even when simultaneous requests hit different isolates.
  const result = await db.batch([
    db.prepare('DELETE FROM score_cooldowns WHERE next_at <= ?').bind(now),
    db.prepare(`INSERT INTO score_cooldowns (client, next_at, token) VALUES (?, ?, ?)
      ON CONFLICT(client) DO UPDATE SET next_at = excluded.next_at, token = excluded.token
      WHERE score_cooldowns.next_at <= ? RETURNING token`).bind(clientHash, now + COOLDOWN_MS, token, now),
    db.prepare(`INSERT INTO scores (request_id, name, score, floor, kills, lv, secs, diff, victory, rank, weapon, pid, date, player, provider)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${claimed}`).bind(
      token, name, entry.score, entry.floor, entry.kills, entry.lv, entry.secs, entry.diff,
      Number(entry.victory), entry.rank, entry.weapon, entry.pid, now, player, provider, clientHash, token,
    ),
    // This run's place among the other players' bests, read before it can replace the player's own.
    db.prepare('SELECT COUNT(*) + 1 AS position FROM board WHERE player != ? AND score >= ?').bind(player, entry.score),
    // The player's row takes the new name, and the new run only if it beats their best (ties keep the older run).
    db.prepare(`INSERT INTO board (player, provider, name, run, score, date)
      SELECT player, provider, name, id, score, date FROM scores WHERE request_id = ?
      ON CONFLICT(player) DO UPDATE SET provider = excluded.provider, name = excluded.name,
        run = CASE WHEN excluded.score > board.score THEN excluded.run ELSE board.run END,
        date = CASE WHEN excluded.score > board.score THEN excluded.date ELSE board.date END,
        score = MAX(board.score, excluded.score)`).bind(token),
    db.prepare(`UPDATE score_stats SET runs = runs + 1 WHERE id = 1 AND ${claimed}`).bind(clientHash, token),
    db.prepare(SELECT_TOP),
    db.prepare(SELECT_STATS),
    db.prepare(SELECT_BEST).bind(player),
  ]);
  if (!result[1].results.length) return json({ error: 'slow down' }, 429);
  return json({
    rank: result[3].results[0].position,
    ...publicBoard(result[6].results, result[7].results[0], result[8].results[0], player),
  });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, POST', 'Cache-Control': 'no-store' } });
  }
  let entry;
  if (request.method === 'POST') {
    try {
      entry = await readEntry(request);
    } catch (error) {
      return json({ error: error.message === 'size' ? 'size' : 'invalid' }, 400);
    }
  }
  try {
    if (request.method === 'GET') {
      const pid = truncate(new URL(request.url).searchParams.get('pid') || '', 40);
      const who = await identify(request, env.DB, pid);
      return json(await getBoard(env.DB, who?.id ?? ''));
    }
    const who = await identify(request, env.DB, entry.pid);
    // Cloudflare sets this header; do not trust caller-supplied X-Forwarded-For.
    return await submit(env.DB, entry, who, request.headers.get('CF-Connecting-IP') || 'local');
  } catch (error) {
    console.error('Leaderboard database request failed', error);
    return json({ error: 'unavailable' }, 503);
  }
}
