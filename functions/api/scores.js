const KEEP = 500;
const TOP = 50;
const COOLDOWN_MS = 8_000;
const MAX_BYTES = 4_096;
const STYLE_RANKS = new Set(['D', 'C', 'B', 'A', 'S', 'SS']);

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

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

function publicBoard(rows, runs, pid) {
  const best = pid ? rows.findIndex((entry) => entry.pid === pid) + 1 : 0;
  const top = rows.slice(0, TOP).map(({ pid: entryPid, ...entry }) => ({
    ...entry, victory: entry.victory === 1, you: Boolean(pid) && entryPid === pid,
  }));
  return { top, runs, best };
}

const SELECT_ENTRIES = `SELECT name, score, floor, kills, lv, secs, diff,
  victory, rank, weapon, pid, date FROM scores ORDER BY score DESC, date ASC, id ASC LIMIT ${KEEP}`;

async function getBoard(db, pid) {
  const [entries, stats] = await db.batch([
    db.prepare(SELECT_ENTRIES),
    db.prepare('SELECT runs FROM score_stats WHERE id = 1'),
  ]);
  return publicBoard(entries.results, stats.results[0].runs, pid);
}

async function submit(db, entry, client) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(client));
  const clientHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  const token = crypto.randomUUID();
  // D1 batch is a transaction. The unique token gates every mutation on a
  // successful cooldown claim, even when simultaneous requests hit different isolates.
  const result = await db.batch([
    db.prepare('DELETE FROM score_cooldowns WHERE next_at <= ?').bind(now),
    db.prepare(`INSERT INTO score_cooldowns (client, next_at, token) VALUES (?, ?, ?)
      ON CONFLICT(client) DO UPDATE SET next_at = excluded.next_at, token = excluded.token
      WHERE score_cooldowns.next_at <= ? RETURNING token`).bind(clientHash, now + COOLDOWN_MS, token, now),
    db.prepare(`INSERT INTO scores (request_id, name, score, floor, kills, lv, secs, diff, victory, rank, weapon, pid, date)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM score_cooldowns WHERE client = ? AND token = ?)`).bind(
      token, entry.name, entry.score, entry.floor, entry.kills, entry.lv, entry.secs,
      entry.diff, Number(entry.victory), entry.rank, entry.weapon, entry.pid, now, clientHash, token,
    ),
    // Read the submitted rank before pruning so a new last place can return 501.
    db.prepare(`SELECT position FROM (
      SELECT request_id, ROW_NUMBER() OVER (ORDER BY score DESC, date ASC, id ASC) AS position FROM scores
    ) WHERE request_id = ?`).bind(token),
    db.prepare(`UPDATE score_stats SET runs = runs + 1 WHERE id = 1
      AND EXISTS (SELECT 1 FROM score_cooldowns WHERE client = ? AND token = ?)`).bind(clientHash, token),
    db.prepare(`DELETE FROM scores WHERE id IN (
      SELECT id FROM scores ORDER BY score DESC, date ASC, id ASC LIMIT -1 OFFSET ${KEEP}
    )`),
    db.prepare(SELECT_ENTRIES),
    db.prepare('SELECT runs FROM score_stats WHERE id = 1'),
  ]);
  if (!result[1].results.length) return json({ error: 'slow down' }, 429);
  return json({
    rank: result[3].results[0].position,
    ...publicBoard(result[6].results, result[7].results[0].runs, entry.pid),
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
      return json(await getBoard(env.DB, pid));
    }
    // Cloudflare sets this header; do not trust caller-supplied X-Forwarded-For.
    return await submit(env.DB, entry, request.headers.get('CF-Connecting-IP') || 'local');
  } catch (error) {
    console.error('Leaderboard database request failed', error);
    return json({ error: 'unavailable' }, 503);
  }
}
