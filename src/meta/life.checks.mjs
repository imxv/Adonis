// Non-UI rule and store acceptance checks. Run: node src/meta/life.checks.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const temporaryDir = await mkdtemp(path.join(tmpdir(), 'adonis-life-rules-'));
const bundlePath = path.join(temporaryDir, 'life.mjs');
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
class FakeStorage {
  values = new Map();
  writes = [];
  failSet = false;
  constructor(raw) { if (raw !== undefined) this.values.set('adonis.meta.v1', raw); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (this.failSet) throw new Error('write unavailable');
    this.values.set(key, value); this.writes.push([key, value]);
  }
}
const publicBacking = new FakeStorage();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: publicBacking });

try {
  await build({
    stdin: { contents: [
      'export * as rules from "./rules.ts";', 'export * as lifeRules from "./life-rules.ts";',
      'export * as life from "./life-catalog.ts";', 'export * as catalog from "./catalog.ts";',
      'export * as storage from "./store.ts";', 'export * as schema from "./schema.ts";',
      'export * as publicLife from "./life.ts";',
    ].join('\n'), resolveDir: sourceDir, loader: 'ts' },
    outfile: bundlePath, bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent',
  });
  const { rules, lifeRules, life, catalog, storage, schema, publicLife } = await import(pathToFileURL(bundlePath).href);
  const { createProfile, plant, harvest, pack, prepare, settle } = rules;
  const { beginFishingRule: begin, finishFishingRule: finish, cookRule: cook, deliverRule: deliver, restoreRule: restore } = lifeRules;
  const { LIFE_LIMITS, createFishingAttempt, fishForSeed } = life;
  const { META_LIMITS } = catalog;
  const { createProfileStore, PROFILE_KEY } = storage;
  const checks = [];
  const check = (name, run) => checks.push({ name, run });
  const clone = value => structuredClone(value);
  const unavailable = () => ({ applied: false, duplicate: false, reason: 'unavailable' });
  const noChange = (profile, action, reason) => {
    const before = clone(profile); const value = action();
    assert.equal(value.applied, false);
    if (reason !== undefined) assert.equal(value.reason, reason);
    assert.deepEqual(profile, before, 'rejected or duplicate action must not mutate the profile');
    return value;
  };
  const stocked = () => {
    const p = createProfile(); p.fragments = 20;
    p.life.fish = { 'silver-sprat': 2, 'reef-bream': 2, 'golden-mullet': 2 };
    p.produce = { olive: 2, laurel: 2, iris: 2 }; return p;
  };
  const catchOne = p => {
    const value = begin(p); assert.equal(value.applied, true);
    const terminal = finish(p, value.attempt.attemptId, 'caught'); assert.equal(terminal.applied, true);
    return terminal.receipt;
  };
  const makeStore = p => {
    const backing = new FakeStorage(JSON.stringify(p ?? createProfile()));
    return { backing, store: createProfileStore(backing) };
  };
  const roundtrip = p => {
    const decoded = schema.decodeProfile(JSON.parse(JSON.stringify(p)));
    assert.equal(decoded.status, 'ok'); assert.deepEqual(decoded.profile, p); return decoded.profile;
  };

  check('stable attempt identity and seed have fixed fixtures independent of reload', () => {
    assert.deepEqual([1, 2, 3, 4096].map(createFishingAttempt), [
      { attemptId: 'fishing.1', sequence: 1, seed: 3075563350 },
      { attemptId: 'fishing.2', sequence: 2, seed: 4077152479 },
      { attemptId: 'fishing.3', sequence: 3, seed: 318964503 },
      { attemptId: 'fishing.4096', sequence: 4096, seed: 2483238964 },
    ]);
    for (const sequence of [0, -1, 1.5, NaN, Infinity, 4097]) assert.throws(() => createFishingAttempt(sequence), RangeError);
    assert.equal(fishForSeed(3075563350), 'reef-bream');
    assert.equal(fishForSeed(318964503), 'silver-sprat');
  });
  check('only one active attempt exists and returned attempts cannot mutate it', () => {
    const p = createProfile(); const first = begin(p); const expected = clone(first.attempt);
    assert.equal(first.applied, true); assert.equal(p.life.fishing.nextSequence, 2);
    first.attempt.seed = 0;
    const again = noChange(p, () => begin(p));
    assert.equal(again.duplicate, true); assert.deepEqual(again.attempt, expected);
    again.attempt.attemptId = 'forged'; assert.deepEqual(p.life.fishing.active, expected);
  });
  for (const outcome of ['caught', 'missed', 'cancelled']) check(`${outcome} is terminal; replay or changed outcome cannot pay twice`, () => {
    const p = createProfile(); const attempt = begin(p).attempt;
    const terminal = finish(p, attempt.attemptId, outcome); const expected = clone(terminal.receipt);
    assert.equal(terminal.applied, true); assert.equal(p.life.fishing.active, null);
    assert.equal(p.life.fishing.receipts.length, 1);
    assert.equal(p.growth, outcome === 'caught' ? 1 : 0);
    assert.equal(Object.values(p.life.fish).reduce((a, b) => a + b, 0), outcome === 'caught' ? 1 : 0);
    for (const replay of ['caught', 'missed', 'cancelled']) {
      const duplicate = noChange(p, () => finish(p, attempt.attemptId, replay));
      assert.equal(duplicate.duplicate, true); assert.deepEqual(duplicate.receipt, expected);
    }
    terminal.receipt.growth = 999; assert.deepEqual(p.life.fishing.receipts[0], expected);
    const next = begin(p); assert.equal(next.attempt.attemptId, 'fishing.2');
    noChange(p, () => finish(p, attempt.attemptId, 'caught'));
    assert.equal(p.life.fishing.active.attemptId, 'fishing.2');
    roundtrip(p);
  });
  check('forged fishing IDs and unknown outcomes leave the active attempt intact', () => {
    const p = createProfile(); const attempt = begin(p).attempt;
    for (const id of ['', 'fishing.0', 'fishing.2', 'fishing.999999', 'other/1', null]) noChange(p, () => finish(p, id, 'caught'), 'invalid');
    for (const outcome of ['pending', '', null]) noChange(p, () => finish(p, attempt.attemptId, outcome), 'invalid');
  });
  check('full fish capacity settles the attempt with zero fish and zero garden growth', () => {
    const p = createProfile(); const attempt = begin(p).attempt; const fish = fishForSeed(attempt.seed);
    p.life.fish[fish] = LIFE_LIMITS.fish; assert.equal(plant(p, 0, 'olive').applied, true);
    const stock = clone(p.life.fish); const growth = p.growth; const bed = clone(p.beds[0]);
    const value = finish(p, attempt.attemptId, 'caught');
    assert.equal(value.applied, true); assert.equal(value.reason, 'capacity');
    assert.deepEqual(value.receipt, { ...attempt, outcome: 'caught', fish, awarded: 0, growth: 0, reason: 'capacity' });
    assert.deepEqual(p.life.fish, stock); assert.equal(p.growth, growth); assert.deepEqual(p.beds[0], bed);
    assert.equal(p.life.fishing.active, null); roundtrip(p);
    p.life.fish[fish]--; noChange(p, () => finish(p, attempt.attemptId, 'caught'));
  });
  check('store reload resumes the same active attempt and preserves terminal outcome', () => {
    const { backing, store } = makeStore();
    const started = store.update(begin, unavailable); assert.equal(started.storage, 'saved');
    assert.equal(backing.writes.length, 1);
    const reopened = createProfileStore(backing); const repeat = reopened.update(begin, unavailable);
    assert.equal(repeat.duplicate, true); assert.deepEqual(repeat.attempt, started.attempt);
    assert.equal(backing.writes.length, 1, 'resuming must not persist a new sequence');
    const caught = reopened.update(p => finish(p, started.attempt.attemptId, 'caught'), unavailable);
    assert.equal(backing.writes.length, 2);
    const third = createProfileStore(backing);
    const changed = third.update(p => finish(p, started.attempt.attemptId, 'missed'), unavailable);
    assert.equal(changed.duplicate, true); assert.deepEqual(changed.receipt, caught.receipt);
    assert.deepEqual(changed.profile, caught.profile); assert.equal(backing.writes.length, 2);
  });
  check('all 4096 fishing terminals are retained; exhausted identity cannot be recycled', () => {
    const p = createProfile();
    for (let sequence = 1; sequence <= LIFE_LIMITS.fishingAttempts; sequence++) {
      const a = begin(p); assert.equal(a.applied, true); assert.equal(a.attempt.attemptId, `fishing.${sequence}`);
      assert.equal(finish(p, a.attempt.attemptId, sequence % 2 ? 'cancelled' : 'missed').applied, true);
    }
    assert.equal(p.life.fishing.receipts.length, 4096); assert.equal(p.life.fishing.nextSequence, 4097);
    const reopened = createProfileStore(new FakeStorage(JSON.stringify(roundtrip(p))));
    const denied = reopened.update(begin, unavailable); assert.equal(denied.reason, 'capacity'); assert.equal(denied.attempt, null);
    const replay = reopened.update(v => finish(v, 'fishing.1', 'caught'), unavailable);
    assert.equal(replay.duplicate, true); assert.equal(replay.receipt.outcome, 'cancelled');
    assert.equal(replay.profile.life.fishing.receipts.length, 4096); assert.equal(replay.profile.growth, 0);
    assert.equal(replay.profile.life.fish['silver-sprat'], 0);
  });

  // Fixed gameplay expectations, rather than deriving expected costs from the code under test.
  const recipes = [
    ['olive-skewer', 'silver-sprat', 'olive', 'olive-draught'],
    ['laurel-broth', 'reef-bream', 'laurel', 'laurel-thread'],
    ['iris-stew', 'golden-mullet', 'iris', 'iris-vial'],
  ];
  for (const [recipeId, fish, plantId, supply] of recipes) {
    check(`${recipeId} atomically consumes one fish and one produce, returns one seed and one supply`, () => {
      const p = stocked(); const before = clone(p); const value = cook(p, recipeId, `cook/${recipeId}`);
      assert.equal(value.applied, true);
      const expected = clone(before); expected.life.fish[fish]--; expected.produce[plantId]--;
      expected.seeds[plantId]++; expected.supplies[supply]++;
      expected.life.cooked.push({ actionId: `cook/${recipeId}`, recipeId });
      assert.deepEqual(p, expected); assert.deepEqual(value.reward, { supplies: { [supply]: 1 }, seeds: { [plantId]: 1 } });
      roundtrip(p);
    });
    check(`${recipeId} cannot consume partial ingredients or overflow either reward inventory`, () => {
      for (const blocker of ['fish', 'produce', 'supply-capacity', 'seed-capacity']) {
        const p = stocked();
        if (blocker === 'fish') p.life.fish[fish] = 0;
        if (blocker === 'produce') p.produce[plantId] = 0;
        if (blocker === 'supply-capacity') p.supplies[supply] = META_LIMITS.supplies;
        if (blocker === 'seed-capacity') p.seeds[plantId] = META_LIMITS.seeds;
        noChange(p, () => cook(p, recipeId, `blocked/${blocker}`), blocker.endsWith('capacity') ? 'capacity' : 'insufficient');
      }
    });
    check(`${recipeId} action ID is persistent, replay-safe and cannot be rebound to another recipe`, () => {
      const { backing, store } = makeStore(stocked()); const actionId = `one/${recipeId}`;
      const first = store.update(p => cook(p, recipeId, actionId), unavailable); assert.equal(first.applied, true);
      const reopened = createProfileStore(backing);
      const duplicate = reopened.update(p => cook(p, recipeId, actionId), unavailable);
      assert.equal(duplicate.duplicate, true); assert.deepEqual(duplicate.profile, first.profile);
      const other = recipes.find(r => r[0] !== recipeId)[0];
      const collision = reopened.update(p => cook(p, other, actionId), unavailable);
      assert.equal(collision.reason, 'invalid'); assert.equal(collision.applied, false);
      assert.deepEqual(collision.profile, first.profile); assert.equal(backing.writes.length, 1);
    });
  }
  check('cooking ledger capacity refuses new actions while preserving the oldest receipt', () => {
    const p = stocked();
    for (let i = 0; i < LIFE_LIMITS.cooks; i++) {
      p.life.fish['silver-sprat'] = 1; p.produce.olive = 1; p.seeds.olive = 0; p.supplies['olive-draught'] = 0;
      assert.equal(cook(p, 'olive-skewer', `limit/${i}`).applied, true);
    }
    p.life.fish['silver-sprat'] = 1; p.produce.olive = 1; p.seeds.olive = 0; p.supplies['olive-draught'] = 0;
    noChange(p, () => cook(p, 'olive-skewer', 'limit/overflow'), 'capacity');
    assert.equal(noChange(p, () => cook(p, 'olive-skewer', 'limit/0')).duplicate, true);
    assert.equal(p.life.cooked.length, 512); roundtrip(p);
  });

  const commissions = [
    ['first-catch', 'silver-sprat', null, 'olive', 3],
    ['garden-table', 'reef-bream', 'laurel', 'laurel', 4],
    ['blue-keepsake', 'golden-mullet', 'iris', 'iris', 5],
  ];
  for (const [id, fish, produce, seed, fragments] of commissions) {
    check(`${id} grants its fixed reward only once, including after store reload`, () => {
      const initial = stocked(); const { backing, store } = makeStore(initial);
      const first = store.update(p => deliver(p, id), unavailable); assert.equal(first.applied, true);
      const expected = clone(initial); expected.life.fish[fish]--; if (produce) expected.produce[produce]--;
      expected.fragments += fragments; expected.seeds[seed] += 2; expected.growth++;
      expected.life.completedCommissions.push(id); assert.deepEqual(first.profile, expected);
      const duplicate = createProfileStore(backing).update(p => deliver(p, id), unavailable);
      assert.equal(duplicate.duplicate, true); assert.deepEqual(duplicate.profile, expected);
      assert.equal(backing.writes.length, 1); roundtrip(expected);
    });
    check(`${id} missing cost or full reward inventory preserves every ingredient`, () => {
      for (const blocker of ['fish', ...(produce ? ['produce'] : []), 'seed-capacity', 'fragment-capacity']) {
        const p = stocked();
        if (blocker === 'fish') p.life.fish[fish] = 0;
        if (blocker === 'produce') p.produce[produce] = 0;
        if (blocker === 'seed-capacity') p.seeds[seed] = META_LIMITS.seeds - 1;
        if (blocker === 'fragment-capacity') p.fragments = META_LIMITS.fragments - fragments + 1;
        noChange(p, () => deliver(p, id), blocker.endsWith('capacity') ? 'capacity' : 'insufficient');
      }
    });
  }
  check('gallery repair consumes six fragments and one olive once; shortfalls are atomic', () => {
    for (const missing of ['fragments', 'produce']) {
      const p = stocked(); if (missing === 'fragments') p.fragments = 5; else p.produce.olive = 0;
      noChange(p, () => restore(p, 'harbor-mosaic'), 'insufficient');
    }
    const initial = stocked(); const { backing, store } = makeStore(initial);
    const first = store.update(p => restore(p, 'harbor-mosaic'), unavailable); assert.equal(first.applied, true);
    const expected = clone(initial); expected.fragments -= 6; expected.produce.olive--; expected.life.restored.push('harbor-mosaic');
    assert.deepEqual(first.profile, expected);
    const repeated = createProfileStore(backing).update(p => restore(p, 'harbor-mosaic'), unavailable);
    assert.equal(repeated.duplicate, true); assert.deepEqual(repeated.profile, expected); assert.equal(backing.writes.length, 1);
  });
  check('unknown catalog IDs and invalid cooking tokens cannot claim arbitrary rewards', () => {
    const p = stocked();
    noChange(p, () => cook(p, 'unknown', 'valid/action'), 'invalid');
    for (const id of ['', 'contains space', 'x'.repeat(129), null]) noChange(p, () => cook(p, 'olive-skewer', id), 'invalid');
    noChange(p, () => deliver(p, 'unknown/commission'), 'invalid'); noChange(p, () => restore(p, 'unknown/repair'), 'invalid');
  });

  check('fishing → crop → cooking → seed return → one packed run supply is a complete loop', () => {
    const p = createProfile(); assert.equal(plant(p, 0, 'olive').applied, true);
    assert.equal(harvest(p, 0).reason, 'not-ready');
    for (let i = 0; p.life.fish['silver-sprat'] === 0 && i < 6; i++) catchOne(p);
    assert.ok(p.life.fish['silver-sprat'] > 0, 'starter cycle must reach the first cooking fish without a clock refresh');
    assert.equal(harvest(p, 0).applied, true); const seeds = p.seeds.olive;
    assert.equal(cook(p, 'olive-skewer', 'loop/cook').applied, true); assert.equal(p.seeds.olive, seeds + 1);
    assert.equal(plant(p, 0, 'olive').applied, true); assert.equal(p.seeds.olive, seeds);
    assert.equal(pack(p, 'olive-draught').applied, true);
    const first = prepare(p, 'loop/run'); assert.equal(first.applied, true);
    assert.equal(first.prepared.assisted, true); assert.equal(first.prepared.effect.maxHpBonus, 1);
    assert.equal(p.supplies['olive-draught'], 0); assert.equal(p.packedSupply, null);
    const expected = clone(first.prepared); const reopened = roundtrip(p);
    const continued = noChange(reopened, () => prepare(reopened, 'loop/run'));
    assert.equal(continued.duplicate, true); assert.deepEqual(continued.prepared, expected);
    continued.prepared.effect.maxHpBonus = 99; assert.deepEqual(reopened.preparedRuns[0], expected);
    const next = prepare(reopened, 'loop/next-run'); assert.equal(next.prepared.assisted, false);
    assert.deepEqual(next.prepared.effect, { maxHpBonus: 0, pickupRadiusMultiplier: 1, dashCooldownMultiplier: 1 });
    assert.equal(settle(reopened, { runId: 'loop/run', victory: false, floor: 1, kills: 0, elapsedSeconds: 0 }).applied, true);
    noChange(reopened, () => prepare(reopened, 'loop/run'), 'invalid');
  });
  check('assisted grouping is frozen by preparation; later packing cannot change or stack it', () => {
    const p = createProfile(); const plain = prepare(p, 'group/plain'); assert.equal(plain.prepared.assisted, false);
    p.supplies['olive-draught'] = 1; p.supplies['laurel-thread'] = 1;
    assert.equal(pack(p, 'olive-draught').applied, true); assert.equal(pack(p, 'laurel-thread').applied, true);
    const assisted = prepare(p, 'group/assisted'); assert.equal(assisted.prepared.supply, 'laurel-thread');
    assert.equal(assisted.prepared.assisted, true); assert.equal(assisted.prepared.effect.maxHpBonus, 0);
    assert.equal(assisted.prepared.effect.pickupRadiusMultiplier, 1.12);
    assert.equal(p.supplies['olive-draught'], 1); assert.equal(p.supplies['laurel-thread'], 0);
    assert.equal(pack(p, 'olive-draught').applied, true);
    assert.equal(noChange(p, () => prepare(p, 'group/plain')).prepared.assisted, false);
    assert.deepEqual(noChange(p, () => prepare(p, 'group/assisted')).prepared, assisted.prepared);
    assert.equal(p.packedSupply, 'olive-draught', 'continuation must not consume the newly packed next-run supply');
    roundtrip(p);
  });
  check('a caught fish rebases the growth ceiling while preserving partial and ripe crop progress', () => {
    const p = createProfile(); p.growth = META_LIMITS.growth;
    p.beds = [{ plant: 'iris', plantedAt: p.growth - 1 }, { plant: 'olive', plantedAt: p.growth - 20 }, null];
    catchOne(p); assert.equal(p.growth, 1);
    assert.equal(p.growth - p.beds[0].plantedAt, 2); assert.equal(harvest(p, 0).reason, 'not-ready');
    assert.equal(harvest(p, 1).applied, true); roundtrip(p);
    catchOne(p); assert.equal(p.growth, 2); assert.equal(harvest(p, 0).applied, true);
    assert.equal(p.produce.iris, 1); assert.equal(p.produce.olive, 1);
  });
  check('one v2 store roundtrip retains fishing, cooking, commission, repair and run receipts together', () => {
    const { backing, store } = makeStore(stocked());
    const attempt = store.update(begin, unavailable).attempt;
    store.update(p => finish(p, attempt.attemptId, 'caught'), unavailable);
    store.update(p => cook(p, 'olive-skewer', 'roundtrip/cook'), unavailable);
    store.update(p => deliver(p, 'first-catch'), unavailable);
    store.update(p => restore(p, 'harbor-mosaic'), unavailable);
    store.update(p => pack(p, 'olive-draught'), unavailable); store.update(p => prepare(p, 'roundtrip/run'), unavailable);
    const expected = store.read().profile; const reopened = createProfileStore(backing);
    assert.deepEqual(reopened.read().profile, expected); assert.equal(expected.version, 2);
    assert.equal(expected.life.fishing.receipts.length, 1); assert.equal(expected.life.cooked.length, 1);
    assert.deepEqual(expected.life.completedCommissions, ['first-catch']); assert.deepEqual(expected.life.restored, ['harbor-mosaic']);
    assert.equal(expected.preparedRuns[0].assisted, true);
  });
  check('failed cooking persistence reports applied memory state and never auto-reissues its reward', () => {
    const initial = stocked(); const { backing, store } = makeStore(initial); backing.failSet = true;
    const first = store.update(p => cook(p, 'olive-skewer', 'memory/cook'), unavailable);
    assert.equal(first.applied, true); assert.equal(first.storage, 'memory'); assert.match(first.warning, /关闭页面后/);
    backing.failSet = false;
    const repeat = store.update(p => cook(p, 'olive-skewer', 'memory/cook'), unavailable);
    assert.equal(repeat.duplicate, true); assert.equal(repeat.storage, 'memory'); assert.deepEqual(repeat.profile, first.profile);
    assert.equal(backing.writes.length, 0); assert.deepEqual(JSON.parse(backing.values.get(PROFILE_KEY)), initial);
  });
  check('generic nested transaction results cannot mutate live receipts or recycle a rewarded fishing ID', () => {
    for (const persistent of [true, false]) {
      const backing = persistent ? new FakeStorage() : null;
      const store = createProfileStore(backing);
      const attempt = store.update(begin, unavailable).attempt;
      const first = store.update(p => ({ ...finish(p, attempt.attemptId, 'caught'), liveLife: p.life }), unavailable);
      assert.equal(first.applied, true); assert.equal(first.receipt.awarded, 1);
      const expected = clone(store.read().profile);
      // A generic operation may return draft references even when its receipt is cloned.
      first.liveLife.fishing.receipts.length = 0;
      first.liveLife.fishing.nextSequence = 1;
      first.liveLife.fish[first.receipt.fish] = 0;
      assert.deepEqual(store.read().profile, expected, 'transaction result must be detached from committed state');
      const next = store.update(begin, unavailable);
      assert.equal(next.attempt.attemptId, 'fishing.2', 'tampering cannot restart the rewarded identity');
      const beforeReplay = clone(next.profile);
      const replay = store.update(p => finish(p, attempt.attemptId, 'caught'), unavailable);
      assert.equal(replay.applied, false); assert.equal(replay.duplicate, true);
      assert.deepEqual(replay.profile, beforeReplay, 'historical attempt cannot issue fish or growth again');
      assert.equal(replay.profile.life.fishing.receipts.length, 1);
      assert.equal(replay.profile.growth, 1);
      if (persistent) assert.equal(backing.writes.length, 3, 'nested mutation and duplicate settlement perform no writes');
    }
  });
  check('public fishing API uses the shared store and cancellation settles the stable active ID', () => {
    const first = publicLife.beginFishing(); const second = publicLife.beginFishing();
    assert.equal(first.applied, true); assert.equal(second.duplicate, true); assert.deepEqual(first.attempt, second.attempt);
    const cancelled = publicLife.cancelFishing(first.attempt.attemptId); assert.equal(cancelled.receipt.outcome, 'cancelled');
    const replay = publicLife.finishFishing(first.attempt.attemptId, 'caught'); assert.equal(replay.duplicate, true);
    assert.equal(replay.receipt.awarded, 0); assert.equal(replay.profile.growth, 0);
    assert.equal(JSON.parse(publicBacking.values.get(PROFILE_KEY)).life.fishing.receipts[0].outcome, 'cancelled');
  });

  let failures = 0;
  for (const { name, run } of checks) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failures++; console.error(`FAIL ${name}`); console.error(error); }
  }
  console.log(`${failures ? 'FAIL' : 'PASS'} ${checks.length - failures}/${checks.length} life rule/store checks`);
  if (failures) process.exitCode = 1;
} finally {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
  await rm(temporaryDir, { recursive: true, force: true });
}
