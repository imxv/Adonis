// Non-UI finite rules verification. Run: node src/sidegames/fishing/rules-check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

const source = await fs.readFile(new URL('./rules.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { createFishingRound, stepFishingRound, cancelFishingRound, FISHING_RULES } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const noInput = { held: false, pressed: false, released: false };
const dt = 1 / 60;
const tick = (round, held, previousHeld = held) => stepFishingRound(round, dt, { held, pressed: held && !previousHeld, released: !held && previousHeld });
const advance = (round, seconds, held = false) => {
  let result = round;
  for (let frame = 0; frame < seconds * 60; frame += 1) result = tick(result, held);
  return result;
};
const cast = seed => {
  let round = stepFishingRound(createFishingRound(seed), 0, { held: true, pressed: true, released: false });
  round = advance(round, 1.2, true);
  return stepFishingRound(round, 0, { held: false, pressed: false, released: true });
};
const hook = seed => {
  let round = cast(seed);
  while (round.phase === 'waiting') round = tick(round, false);
  assert.equal(round.phase, 'bite');
  return stepFishingRound(round, 0, { held: true, pressed: true, released: false });
};
const play = seed => {
  let round = hook(seed);
  let held = true;
  const trace = [];
  while (round.phase === 'reeling') {
    const previousHeld = held;
    if (round.fishCue === 'surge' || round.fishCue === 'surge-warning') held = round.tension < 0.28;
    else if (round.tension > 0.69) held = false;
    else if (round.tension < 0.35) held = true;
    round = tick(round, held, previousHeld);
    trace.push([round.phase, round.elapsed, round.tension, round.progress]);
  }
  return { round, trace };
};

const initial = createFishingRound('stable-seed');
assert.deepEqual(initial, createFishingRound('stable-seed'));
assert.notEqual(initial.biteDelay, createFishingRound('other-seed').biteDelay);
const oldSnapshot = JSON.stringify(initial);
stepFishingRound(initial, dt, { held: true, pressed: true, released: false });
assert.equal(JSON.stringify(initial), oldSnapshot, 'step must not mutate its input');
assert.equal(stepFishingRound(initial, -1, noInput), initial);
assert.equal(stepFishingRound(initial, NaN, noInput), initial);
assert.ok(stepFishingRound(initial, 1000, noInput).elapsed <= FISHING_RULES.maximumFrameSeconds + 1e-9);

let short = stepFishingRound(initial, 0, { held: true, pressed: true, released: false });
short = advance(short, 0.1, true);
short = stepFishingRound(short, 0, { held: false, pressed: false, released: true });
assert.equal(short.reason, 'short-cast');
let overcast = stepFishingRound(initial, 0, { held: true, pressed: true, released: false });
overcast = advance(overcast, 2, true);
assert.equal(overcast.reason, 'overcast');

const waiting = cast('bite-seed');
assert.equal(waiting.phase, 'waiting');
const nibble = advance(waiting, waiting.nibbleAt + 0.1);
assert.equal(nibble.bobberCue, 'nibble');
assert.equal(stepFishingRound(nibble, dt, { held: true, pressed: true, released: false }).reason, 'early-hook');
assert.equal(advance(waiting, 13).reason, 'missed-bite');

const hooked = hook('line-seed');
assert.equal(advance(hooked, 10, true).reason, 'line-broke');
assert.equal(advance(hooked, 8, false).reason, 'fish-escaped');
const cancelled = cancelFishingRound(hooked);
assert.equal(cancelled.phase, 'cancelled');
assert.equal(stepFishingRound(cancelled, 10, noInput), cancelled);
assert.equal(cancelFishingRound(cancelled), cancelled);
assert.equal(advance(initial, 91).reason, 'time-limit');

const successes = ['fishing-first', 'life-attempt-2', 'lake-3'].map(seed => play(seed));
for (const { round } of successes) {
  assert.equal(round.phase, 'success', `${round.seed}: ${round.reason} at ${round.elapsed}s / ${round.progress}`);
  assert.ok(round.elapsed >= 30 && round.elapsed <= 90, `round duration ${round.elapsed}`);
  assert.equal(round.progress, 1);
  assert.equal(stepFishingRound(round, 1, noInput), round);
}
assert.deepEqual(play('fishing-first'), successes[0], 'same seed and input policy must reproduce the full trace');
console.log(JSON.stringify({ checks: 'passed', scope: 'pure fishing rules, no UI or storage', successDurationsSeconds: successes.map(({ round }) => Number(round.elapsed.toFixed(3))), failureReasons: ['short-cast', 'overcast', 'early-hook', 'missed-bite', 'line-broke', 'fish-escaped', 'time-limit'], cancelledTerminal: true, replayExact: true }, null, 2));
