/** Integration test for the real local Pages Function + D1 runtime.
 * Resets ONLY local D1 data. Start `wrangler pages dev dist --port 8788` first.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const base = new URL(process.argv[2] || 'http://localhost:8788');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Only a local test server is allowed');
const sql = (command) => execFileSync('wrangler', [
  'd1', 'execute', 'adonis-scores', '--local', '--json', '--command', command,
], { stdio: 'pipe' });
const reset = () => sql('DELETE FROM scores; DELETE FROM score_cooldowns; UPDATE score_stats SET runs = 0 WHERE id = 1;');
const entry = (changes = {}) => ({
  name: '测试骑士', score: 100, floor: 1, kills: 0, lv: 1, secs: 20,
  diff: 'normal', victory: false, rank: 'S', weapon: 'sword', pid: 'qa-player', ...changes,
});
async function call(path, options) {
  const response = await fetch(new URL(path, base), options);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  return { response, data };
}
const post = (body, ip = '198.51.100.1') => call('/api/scores', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
try {
  reset();
  let result = await call('/api/scores');
  assert.deepEqual(result.data, { top: [], runs: 0, best: 0 });
  assert.equal(result.response.headers.get('x-content-type-options'), 'nosniff');

  for (const body of ['{', entry({ score: true }), entry({ diff: 'unknown' }), entry({ score: 100000 }), entry({ floor: 10 })]) {
    result = await post(body);
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.data, { error: 'invalid' });
  }
  for (const body of ['', 'x'.repeat(4097)]) {
    result = await post(body);
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.data, { error: 'size' });
  }
  result = await call('/api/scores', {
    method: 'POST', body: new Uint8Array([0xff]), headers: { 'CF-Connecting-IP': '198.51.100.1' },
  });
  assert.equal(result.response.status, 400);
  assert.deepEqual(result.data, { error: 'invalid' });
  result = await call('/api/scores', {
    method: 'POST', duplex: 'half', body: new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(3000));
      controller.enqueue(new Uint8Array(2000));
      controller.close();
    } }),
  });
  assert.equal(result.response.status, 400);
  assert.deepEqual(result.data, { error: 'size' });

  result = await post(entry({ name: '  测试\n骑士\u00a0\u200b😀  ', score: 100.9 }));
  assert.equal(result.response.status, 200);
  assert.equal(result.data.rank, 1);
  assert.equal(result.data.runs, 1);
  assert.equal(result.data.best, 1);
  assert.equal(result.data.top[0].name, '测试骑士😀');
  assert.equal(result.data.top[0].score, 100);
  assert.equal(result.data.top[0].you, true);
  for (const key of ['id', 'pid', 'request_id']) assert.ok(!(key in result.data.top[0]));
  result = await post(entry());
  assert.equal(result.response.status, 429);
  assert.deepEqual(result.data, { error: 'slow down' });
  result = await call('/api/scores?pid=qa-player');
  assert.equal(result.data.runs, 1);
  assert.equal(result.data.best, 1);
  assert.equal(result.data.top[0].you, true);

  const simultaneous = await Promise.all(Array.from({ length: 6 }, () => post(entry({ score: 200 }), '198.51.100.2')));
  assert.equal(simultaneous.filter((item) => item.response.status === 200).length, 1);
  assert.equal(simultaneous.filter((item) => item.response.status === 429).length, 5);
  result = await call('/api/scores');
  assert.equal(result.data.runs, 2);
  assert.equal(result.data.top.length, 2);
  assert.ok(result.data.top.every((row) => row.you === false));

  const earlier = await post(entry({ name: 'Earlier', score: 8000, pid: 'tie-first' }), '198.51.100.3');
  const later = await post(entry({ name: 'Later', score: 8000, pid: 'tie-last' }), '198.51.100.4');
  assert.equal(earlier.data.rank, 1);
  assert.equal(later.data.rank, 2);
  assert.deepEqual(later.data.top.slice(0, 2).map((row) => row.name), ['Earlier', 'Later']);

  reset();
  sql(`WITH RECURSIVE sequence(n) AS (VALUES(1) UNION ALL SELECT n + 1 FROM sequence WHERE n < 500)
    INSERT INTO scores(request_id, name, score, floor, kills, lv, secs, diff, victory, rank, weapon, pid, date)
    SELECT 'seed-' || n, 'Seed', 1500 - n, 1, 0, 1, 20, 'normal', 0, 'D', '', 'seed-' || n, n FROM sequence;
    UPDATE score_stats SET runs = 500 WHERE id = 1;`);
  result = await post(entry({ score: 0, pid: 'below-top500' }), '198.51.100.5');
  assert.equal(result.response.status, 200);
  assert.equal(result.data.rank, 501);
  assert.equal(result.data.runs, 501);
  assert.equal(result.data.best, 0);
  assert.equal(result.data.top.length, 50);
  assert.equal(result.data.top[0].score, 1499);
  result = await call('/api/scores?pid=seed-200');
  assert.equal(result.data.best, 200);
  assert.equal(result.data.top.length, 50);
  assert.equal(result.data.runs, 501);
  const count = JSON.parse(sql('SELECT COUNT(*) AS count FROM scores;').toString());
  assert.equal(count[0].results[0].count, 500);
  console.log('PASS: local Pages + D1 validation, stream limits, privacy, cooldown concurrency, ties, top50/keep500 and rank501');
} finally {
  reset();
}