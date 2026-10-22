// Non-UI acceptance checks. Run from any directory with:
// node /Users/sunmozong/Adonis/src/meta/profile.checks.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { build } from 'esbuild';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const temporaryDir = await mkdtemp(path.join(tmpdir(), 'adonis-meta-checks-'));
const bundlePath = path.join(temporaryDir, 'meta.mjs');
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

class FakeStorage {
  values = new Map();
  gets = 0;
  writes = [];
  failGet = false;
  failSet = false;
  constructor(raw) {
    if (raw !== undefined) this.values.set('adonis.meta.v1', raw);
  }
  getItem(key) {
    this.gets++;
    if (this.failGet) throw new Error('getItem unavailable');
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    if (this.failSet) throw new Error('setItem unavailable');
    this.writes.push([key, value]);
    this.values.set(key, value);
  }
}

// This controls the module's browser-service boundary, without rendering UI.
// The request promise settles after its callback releases the simulated lock.
class ControlledLocks {
  requests = [];
  request(name, options, callback) {
    assert.equal(name, 'adonis.meta.v1.writer');
    assert.equal(options.ifAvailable, true);
    assert.equal('signal' in options, false, 'ifAvailable and signal must not be combined');
    let resolveRequest;
    let rejectRequest;
    const pending = new Promise((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject; });
    const entry = {
      name, options, invoked: false, released: false,
      grant(lock = { name }) {
        assert.equal(entry.invoked, false, 'each lock callback may run only once');
        entry.invoked = true;
        entry.callbackDone = Promise.resolve(callback(lock));
        entry.callbackDone.then(
          () => { entry.released = true; resolveRequest(); },
          (error) => { entry.released = true; rejectRequest(error); },
        );
        return entry.callbackDone;
      },
      reject(error) { rejectRequest(error); },
    };
    this.requests.push(entry);
    return pending;
  }
}

const publicStorage = new FakeStorage();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: publicStorage });

try {
  await build({
    stdin: {
      contents: [
        'export * as rules from "./rules.ts";',
        'export * as schema from "./schema.ts";',
        'export * as storage from "./store.ts";',
        'export * as catalog from "./catalog.ts";',
        'export * as profile from "./profile.ts";',
      ].join('\n'),
      resolveDir: sourceDir,
      loader: 'ts',
    },
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
  });
  const { rules, schema, storage, catalog, profile: api } = await import(pathToFileURL(bundlePath).href);
  const { META_LIMITS: limits, PLANT_IDS: plants, SUPPLY_IDS: supplies, PLANTS, SUPPLIES, NO_SUPPLY_EFFECT } = catalog;
  const { createProfile, settle, discover, prepare, plant, harvest, craft, pack } = rules;
  const { createProfileStore, PROFILE_KEY, CORRUPT_PROFILE_KEY } = storage;
  const serviceBundlePath = path.join(temporaryDir, 'service.mjs');
  await build({ entryPoints: [path.join(sourceDir, 'service.ts')], outfile: serviceBundlePath, bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent' });
  let serviceCase = 0;
  const withBrowserService = async (run) => {
    const keys = ['window', 'navigator', 'localStorage'];
    const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const page = new EventTarget();
    const locks = new ControlledLocks();
    const initial = createProfile();
    initial.supplies['olive-draught'] = 2;
    initial.packedSupply = 'olive-draught';
    const backing = new FakeStorage(JSON.stringify(initial));
    const dispatch = (name) => page.dispatchEvent(new Event(name));
    for (const [key, value] of [['window', page], ['navigator', { locks }], ['localStorage', backing]]) {
      Object.defineProperty(globalThis, key, { configurable: true, value });
    }
    try {
      // A unique module URL gives every case a new service singleton.
      const service = await import(`${pathToFileURL(serviceBundlePath).href}?lifecycle=${++serviceCase}`);
      assert.equal(locks.requests.length, 1);
      await run({ service, locks, backing, initial, dispatch });
    } finally {
      dispatch('pagehide');
      const abort = new Error('Test page disposed');
      abort.name = 'AbortError';
      for (const request of locks.requests) if (!request.invoked) request.reject(abort);
      await nextTurn();
      for (const key of keys) {
        const original = originals.get(key);
        if (original) Object.defineProperty(globalThis, key, original);
        else delete globalThis[key];
      }
    }
  };
  const summary = (runId, overrides = {}) => ({ runId, victory: false, floor: 1, kills: 8, elapsedSeconds: 30, ...overrides });
  const unavailable = () => ({ applied: false, duplicate: false, reason: 'unavailable' });
  const harness = (backing, writeWarning) => {
    const store = createProfileStore(backing, writeWarning);
    return {
      read: () => store.read(),
      settle: (value) => store.update((p) => settle(p, value), () => ({ ...unavailable(), reward: rules.emptyReward() })),
      discover: (id) => store.update((p) => discover(p, id), unavailable),
      prepare: (id) => store.update((p) => prepare(p, id), () => ({ ...unavailable(), prepared: null })),
      plant: (bed, id) => store.update((p) => plant(p, bed, id), unavailable),
    };
  };
  const expectRejectedUnchanged = (p, operation, reason = 'invalid') => {
    const before = structuredClone(p);
    const result = operation();
    assert.equal(result.applied, false);
    assert.equal(result.duplicate, false);
    assert.equal(result.reason, reason);
    assert.deepEqual(p, before, 'rejected operation changed the profile');
    return result;
  };
  const checks = [];
  const check = (name, run) => checks.push({ name, run });

  check('public API: plant → real settlement → harvest → craft → pack → prepare once', () => {
    assert.equal(api.loadProfile().storage, 'saved');
    assert.deepEqual(api.loadProfile().profile.supplies, Object.fromEntries(supplies.map((id) => [id, 0])));
    let announcements = 0;
    const unsubscribe = api.subscribeProfile(() => announcements++);
    assert.equal(api.plantSeed(0, 'olive').applied, true);
    assert.equal(api.harvestPlant(0).reason, 'not-ready');
    const settlement = api.settleRun(summary('public/run-1'));
    assert.deepEqual(settlement.reward, { fragments: 1, growth: 1, seeds: 1 });
    assert.equal(api.harvestPlant(0).applied, true);
    assert.equal(api.craftSupply('olive-draught').applied, true);
    assert.equal(api.packSupply('olive-draught').applied, true);
    assert.equal(api.loadProfile().profile.supplies['olive-draught'], 1, 'packing must not consume stock');
    assert.equal(api.packSupply('olive-draught').duplicate, true);
    const preparation = api.prepareRun('public/run-2');
    assert.equal(preparation.applied, true);
    assert.deepEqual(preparation.prepared, { runId: 'public/run-2', supply: 'olive-draught', effect: SUPPLIES['olive-draught'].effect, assisted: true });
    assert.equal(preparation.profile.supplies['olive-draught'], 0);
    assert.equal(preparation.profile.packedSupply, null);
    assert.equal(api.prepareRun('public/run-2').duplicate, true);
    assert.equal(api.settleRun(summary('public/run-1', { victory: true, floor: 100 })).duplicate, true);
    assert.equal(announcements, 6, 'only successful mutations announce changes');
    preparation.prepared.effect.maxHpBonus = 999;
    preparation.profile.seeds.olive = 999;
    assert.equal(api.prepareRun('public/run-2').prepared.effect.maxHpBonus, 1);
    assert.ok(api.loadProfile().profile.seeds.olive <= limits.seeds);
    unsubscribe();
    api.claimDiscovery('public/discovery-1');
    assert.equal(announcements, 6, 'unsubscribe must remove the listener');
    assert.ok(publicStorage.values.has(PROFILE_KEY));
    assert.equal([...publicStorage.values.keys()].some((key) => key === 'adonis.run.v1' || key === 'adonis.board.v1'), false);
  });

  check('empty preparation stays empty after later inventory and never retroactively charges', () => {
    const p = createProfile();
    const first = prepare(p, 'empty/run');
    assert.equal(first.applied, true);
    assert.deepEqual(first.prepared, { runId: 'empty/run', supply: null, effect: NO_SUPPLY_EFFECT, assisted: false });
    p.produce.olive = 1;
    assert.equal(craft(p, 'olive-draught').applied, true);
    assert.equal(pack(p, 'olive-draught').applied, true);
    const before = structuredClone(p);
    const repeated = prepare(p, 'empty/run');
    assert.equal(repeated.duplicate, true);
    assert.deepEqual(repeated.prepared, first.prepared);
    assert.deepEqual(p, before);
    const backing = new FakeStorage(JSON.stringify(p));
    const reloaded = harness(backing);
    const reloadedReceipt = reloaded.prepare('empty/run');
    assert.equal(reloadedReceipt.duplicate, true);
    assert.deepEqual(reloadedReceipt.prepared, first.prepared);
    assert.deepEqual(reloaded.read().profile, p);
    assert.equal(backing.writes.length, 0);
    assert.equal(prepare(p, 'next/run').prepared.supply, 'olive-draught');
    assert.equal(p.supplies['olive-draught'], 0);
  });

  check('settled IDs without preparation cannot consume later stock, including after reload', () => {
    const p = createProfile();
    p.supplies['olive-draught'] = 2;
    p.packedSupply = 'olive-draught';
    for (const [index, overrides] of [{}, { elapsedSeconds: 0 }].entries()) {
      const id = `already-ended/${index}`;
      assert.equal(settle(p, summary(id, overrides)).applied, true);
      const result = expectRejectedUnchanged(p, () => prepare(p, id));
      assert.equal(result.prepared, null);
      const backing = new FakeStorage(JSON.stringify(p));
      const reloaded = harness(backing);
      assert.equal(reloaded.prepare(id).reason, 'invalid');
      assert.equal(reloaded.read().profile.supplies['olive-draught'], 2);
      assert.equal(backing.writes.length, 0);
    }
    const before = prepare(p, 'prepared-before-end');
    assert.equal(before.applied, true);
    assert.equal(settle(p, summary('prepared-before-end')).applied, true);
    assert.equal(expectRejectedUnchanged(p, () => prepare(p, 'prepared-before-end')).prepared, null);
    const reloaded = harness(new FakeStorage(JSON.stringify(p)));
    assert.equal(reloaded.prepare('prepared-before-end').reason, 'invalid');
    assert.equal(reloaded.prepare('prepared-before-end').prepared, null);
    assert.equal(p.supplies['olive-draught'], 1);
    assert.equal(prepare(p, 'empty-before-end').prepared.supply, null);
    assert.equal(settle(p, summary('empty-before-end')).applied, true);
    assert.equal(expectRejectedUnchanged(p, () => prepare(p, 'empty-before-end')).prepared, null);
    const emptyReload = harness(new FakeStorage(JSON.stringify(p)));
    assert.equal(emptyReload.prepare('empty-before-end').reason, 'invalid');
    assert.equal(emptyReload.prepare('empty-before-end').prepared, null);
  });

  check('all three crops and recipes mature through adventure progress with one bounded slot', () => {
    const p = createProfile();
    for (const [index, id] of plants.entries()) assert.equal(plant(p, index, id).applied, true);
    assert.deepEqual(settle(p, summary('garden/win', { victory: true, floor: 3 })).reward, { fragments: 5, growth: 3, seeds: 1 });
    for (const [index, id] of plants.entries()) {
      assert.equal(harvest(p, index).applied, true);
      assert.equal(p.produce[id], 1);
      assert.equal(craft(p, PLANTS[id].supply).applied, true);
      assert.equal(p.produce[id], 0);
    }
    for (const id of supplies) assert.equal(pack(p, id).applied, true);
    assert.equal(p.packedSupply, supplies.at(-1));
    assert.equal(pack(p, null).applied, true);
    assert.equal(pack(p, null).duplicate, true);
    for (const id of supplies) {
      assert.equal(pack(p, id).applied, true);
      const result = prepare(p, `supply/${id}`);
      assert.deepEqual(result.prepared.effect, SUPPLIES[id].effect);
      assert.equal(result.prepared.assisted, true);
      assert.equal(p.supplies[id], 0);
      assert.equal(p.packedSupply, null);
      assert.equal(prepare(p, `supply/${id}`).duplicate, true);
    }
  });

  check('short or insufficient adventures settle without rewards and cannot be replayed for rewards', () => {
    const p = createProfile();
    assert.equal(plant(p, 0, 'olive').applied, true);
    for (const [index, overrides] of [
      { elapsedSeconds: 29.999, victory: true, floor: 100, kills: 100 },
      { elapsedSeconds: 0, victory: true },
      { kills: 7, elapsedSeconds: 1e8 },
    ].entries()) {
      const before = structuredClone(p);
      const result = settle(p, summary(`short/${index}`, overrides));
      assert.equal(result.applied, true, 'an ineligible end still records a receipt');
      assert.deepEqual(result.reward, { fragments: 0, growth: 0, seeds: 0 });
      before.settledRuns.push(`short/${index}`);
      assert.deepEqual(p, before);
      assert.equal(settle(p, summary(`short/${index}`, { victory: true, floor: 3 })).duplicate, true);
    }
    assert.equal(harvest(p, 0).reason, 'not-ready');
    for (const [index, overrides] of [{ kills: 8 }, { kills: 0, floor: 2 }, { kills: 0, victory: true }].entries()) {
      assert.equal(settle(p, summary(`eligible/${index}`, overrides)).reward.growth > 0, true);
    }
  });

  check('discoveries are stable, bounded, idempotent and do not grow crops', () => {
    const p = createProfile();
    for (const [index, id] of plants.entries()) {
      const before = structuredClone(p);
      assert.equal(discover(p, `discovery/${index}`).applied, true);
      assert.equal(p.fragments, before.fragments + 1);
      assert.equal(p.seeds[id], before.seeds[id] + 1);
      assert.equal(p.growth, 0);
      const after = structuredClone(p);
      assert.equal(discover(p, `discovery/${index}`).duplicate, true);
      assert.deepEqual(p, after);
    }
    p.fragments = limits.fragments;
    for (const id of plants) p.seeds[id] = limits.seeds;
    assert.equal(discover(p, 'discovery/full-stock').applied, true);
    assert.equal(p.fragments, limits.fragments);
    for (const id of plants) assert.equal(p.seeds[id], limits.seeds);
  });

  check('all inventory capacities preserve inputs on failed harvest/craft and report actual rewards', () => {
    const p = createProfile();
    p.fragments = limits.fragments - 1;
    for (const id of plants) p.seeds[id] = limits.seeds;
    assert.deepEqual(settle(p, summary('caps/near-full', { floor: 100, victory: true })).reward, { fragments: 1, growth: 3, seeds: 0 });
    assert.deepEqual(settle(p, summary('caps/full', { floor: 100, victory: true })).reward, { fragments: 0, growth: 3, seeds: 0 });
    assert.equal(p.fragments, limits.fragments);
    for (const [index, id] of plants.entries()) {
      p.beds[index] = { plant: id, plantedAt: 0 };
      p.produce[id] = limits.produce;
      expectRejectedUnchanged(p, () => harvest(p, index), 'capacity');
      p.produce[id]--;
      assert.equal(harvest(p, index).applied, true);
      assert.equal(p.produce[id], limits.produce);
      const supply = PLANTS[id].supply;
      p.supplies[supply] = limits.supplies;
      expectRejectedUnchanged(p, () => craft(p, supply), 'capacity');
      p.supplies[supply]--;
      assert.equal(craft(p, supply).applied, true);
      assert.equal(p.supplies[supply], limits.supplies);
      assert.equal(p.produce[id], limits.produce - SUPPLIES[supply].cost);
      assert.equal(p.seeds[id], limits.seeds);
    }
  });

  check('receipt capacities reject new entries while preserving existing idempotent entries', () => {
    const p = createProfile();
    p.settledRuns = Array.from({ length: limits.runs }, (_, index) => `settled/${index}`);
    p.preparedRuns = Array.from({ length: limits.runs }, (_, index) => ({ runId: `prepared/${index}`, supply: null, effect: { ...NO_SUPPLY_EFFECT }, assisted: false }));
    p.discoveries = Array.from({ length: limits.discoveries }, (_, index) => `known/${index}`);
    p.supplies['olive-draught'] = 1;
    p.packedSupply = 'olive-draught';
    expectRejectedUnchanged(p, () => settle(p, summary('settled/new')), 'capacity');
    assert.equal(expectRejectedUnchanged(p, () => prepare(p, 'prepared/new'), 'capacity').prepared, null);
    expectRejectedUnchanged(p, () => discover(p, 'known/new'), 'capacity');
    const before = structuredClone(p);
    assert.equal(settle(p, summary('settled/0')).duplicate, true);
    assert.equal(prepare(p, 'prepared/0').duplicate, true);
    assert.equal(discover(p, 'known/0').duplicate, true);
    assert.deepEqual(p, before);
  });

  check('invalid IDs, summaries, beds and catalog entries never mutate state', () => {
    const p = createProfile();
    for (const id of ['', ' space', 'a b', '../', 'a\\b', 'a\nb', 'x'.repeat(129), null, undefined, 3, {}, []]) {
      expectRejectedUnchanged(p, () => settle(p, summary(id)));
      assert.equal(expectRejectedUnchanged(p, () => prepare(p, id)).prepared, null);
      expectRejectedUnchanged(p, () => discover(p, id));
    }
    for (const value of [null, undefined, {}, [], 'run']) expectRejectedUnchanged(p, () => settle(p, value));
    for (const overrides of [
      { victory: 1 }, { victory: 'true' }, { victory: null },
      ...[0, -1, 1.1, 101, NaN, Infinity, '2'].map((floor) => ({ floor })),
      ...[-1, 1.1, 1e7 + 1, NaN, Infinity, '8'].map((kills) => ({ kills })),
      ...[-1, 1e8 + 1, NaN, Infinity, '30'].map((elapsedSeconds) => ({ elapsedSeconds })),
    ]) expectRejectedUnchanged(p, () => settle(p, summary('invalid/summary', overrides)));
    for (const bed of [-1, limits.beds, 0.5, NaN, Infinity, '0', null, undefined]) {
      expectRejectedUnchanged(p, () => plant(p, bed, 'olive'));
      expectRejectedUnchanged(p, () => harvest(p, bed));
    }
    for (const id of ['unknown', '__proto__', null, undefined, {}, 1]) {
      expectRejectedUnchanged(p, () => plant(p, 0, id));
      expectRejectedUnchanged(p, () => craft(p, id));
      if (id !== null) expectRejectedUnchanged(p, () => pack(p, id));
    }
    for (const id of ['a', 'A-0_1.2/3:4', 'x'.repeat(128)]) {
      assert.equal(prepare(p, id).applied, true, 'documented valid ID was rejected');
    }
  });

  check('occupied, empty and insufficient states preserve seeds, crops and supplies', () => {
    const p = createProfile();
    expectRejectedUnchanged(p, () => harvest(p, 0), 'empty');
    for (const id of supplies) {
      expectRejectedUnchanged(p, () => craft(p, id), 'insufficient');
      expectRejectedUnchanged(p, () => pack(p, id), 'insufficient');
    }
    p.seeds.olive = 0;
    expectRejectedUnchanged(p, () => plant(p, 0, 'olive'), 'insufficient');
    assert.equal(plant(p, 0, 'iris').applied, true);
    expectRejectedUnchanged(p, () => plant(p, 0, 'laurel'), 'occupied');
    expectRejectedUnchanged(p, () => harvest(p, 0), 'not-ready');
    assert.equal(p.beds.length, limits.beds);
  });

  check('growth counter rebasing preserves crop progress at the numeric ceiling', () => {
    const p = createProfile();
    p.growth = limits.growth;
    p.beds = [{ plant: 'olive', plantedAt: p.growth - 1 }, { plant: 'laurel', plantedAt: p.growth - 1 }, { plant: 'iris', plantedAt: p.growth }];
    assert.equal(settle(p, summary('growth/rebase')).reward.growth, 1);
    assert.equal(p.growth, 1);
    assert.deepEqual(p.beds.map((bed) => p.growth - bed.plantedAt), [2, 2, 1]);
    assert.equal(harvest(p, 0).applied, true);
    assert.equal(harvest(p, 1).applied, true);
    expectRejectedUnchanged(p, () => harvest(p, 2), 'not-ready');
    const decoded = schema.decodeProfile(JSON.parse(JSON.stringify(p)));
    assert.equal(decoded.status, 'ok');
    assert.equal(decoded.profile.growth - decoded.profile.beds[2].plantedAt, 1);
  });

  check('version 0 migrates without resetting receipts and upgrades only on a mutation', () => {
    const old = { version: 0, fragments: 4, growth: 2, settledRuns: ['old/run'], discoveries: ['old/discovery'], preparedRuns: [{ runId: 'old/prepare', supply: 'olive-draught', effect: { maxHpBonus: 999 }, assisted: false }] };
    const raw = JSON.stringify(old);
    const backing = new FakeStorage(raw);
    const h = harness(backing);
    const read = h.read();
    assert.equal(read.storage, 'saved');
    assert.match(read.warning, /旧版/);
    assert.equal(read.profile.version, 2);
    assert.deepEqual(read.profile.seeds, createProfile().seeds);
    assert.equal(backing.values.get(PROFILE_KEY), raw, 'reading must not rewrite the old save');
    assert.equal(h.settle(summary('old/run')).duplicate, true);
    assert.equal(h.discover('old/discovery').duplicate, true);
    const oldReceipt = h.prepare('old/prepare');
    assert.equal(oldReceipt.duplicate, true);
    assert.deepEqual(oldReceipt.prepared.effect, SUPPLIES['olive-draught'].effect);
    assert.equal(oldReceipt.prepared.assisted, true);
    assert.equal(backing.writes.length, 0);
    assert.equal(h.discover('old/new').applied, true);
    const saved = JSON.parse(backing.values.get(PROFILE_KEY));
    assert.equal(saved.version, 2);
    assert.deepEqual(saved.settledRuns, ['old/run']);
    assert.equal(saved.fragments, 5);
  });

  check('only version 0 may migrate missing receipt collections as empty', () => {
    const old = { version: 0, fragments: 3 };
    const decoded = schema.decodeProfile(old);
    assert.equal(decoded.status, 'migrated');
    assert.deepEqual(decoded.profile.settledRuns, []);
    assert.deepEqual(decoded.profile.preparedRuns, []);
    assert.deepEqual(decoded.profile.discoveries, []);
    const backing = new FakeStorage(JSON.stringify(old));
    const h = harness(backing);
    assert.equal(h.discover('v0/first').applied, true);
    assert.equal(JSON.parse(backing.values.get(PROFILE_KEY)).version, 2);
    assert.equal(harness(backing).discover('v0/first').duplicate, true);
  });

  for (const missing of ['settledRuns', 'discoveries', 'preparedRuns']) {
    check(`version 1 missing ${missing} is protected instead of resetting its ledger`, () => {
      const damaged = createProfile();
      damaged.version = 1;
      delete damaged.life;
      damaged.settledRuns = ['v1/settled'];
      damaged.discoveries = ['v1/discovered'];
      damaged.preparedRuns = [{ runId: 'v1/prepared', supply: null, effect: { ...NO_SUPPLY_EFFECT }, assisted: false }];
      delete damaged[missing];
      assert.equal(schema.decodeProfile(damaged).status, 'unsupported');
      const raw = JSON.stringify(damaged);
      const backing = new FakeStorage(raw);
      const h = harness(backing);
      const read = h.read();
      assert.equal(read.storage, 'unsupported');
      assert.ok(read.warning);
      for (const result of [h.settle(summary('v1/settled')), h.discover('v1/discovered'), h.prepare('v1/prepared')]) {
        assert.equal(result.applied, false);
        assert.equal(result.reason, 'unavailable');
        assert.deepEqual(result.profile, read.profile);
      }
      assert.equal(backing.values.get(PROFILE_KEY), raw);
      assert.equal(backing.writes.length, 0);
    });
  }

  check('future versions and damaged receipt ledgers stay read-only without overwriting the source', () => {
    const invalidLedgers = [
      { version: 3, fragments: 90 },
      { ...createProfile(), settledRuns: ['bad id'] },
      { ...createProfile(), discoveries: 'known/0' },
      { ...createProfile(), preparedRuns: [{ runId: 'okay', supply: 'unknown' }] },
      { ...createProfile(), preparedRuns: [{ runId: 'bad id', supply: null }] },
      { ...createProfile(), preparedRuns: {} },
      { ...createProfile(), settledRuns: Array(limits.runs + 1).fill('same') },
      { ...createProfile(), preparedRuns: Array(limits.runs + 1).fill({ runId: 'same', supply: null }) },
      { ...createProfile(), discoveries: Array(limits.discoveries + 1).fill('same') },
    ];
    for (const value of invalidLedgers) {
      const raw = JSON.stringify(value);
      const backing = new FakeStorage(raw);
      const h = harness(backing);
      assert.equal(h.read().storage, 'unsupported');
      assert.ok(h.read().warning);
      for (const result of [h.settle(summary('readonly/run')), h.prepare('readonly/run'), h.discover('readonly/discovery'), h.plant(0, 'olive')]) {
        assert.equal(result.applied, false);
        assert.equal(result.reason, 'unavailable');
      }
      assert.equal(backing.values.get(PROFILE_KEY), raw);
      assert.equal(backing.writes.length, 0);
    }
  });

  check('decoded numbers, beds and preparation effects cannot exceed the actual catalog rules', () => {
    const dirty = {
      ...createProfile(), fragments: Infinity, growth: 1e99,
      seeds: { olive: -4, laurel: 99.8, iris: '8' },
      produce: { olive: 2.9, laurel: NaN, iris: Infinity },
      supplies: { 'olive-draught': 99, 'laurel-thread': -4, 'iris-vial': '3' },
      packedSupply: 'laurel-thread',
      beds: [{ plant: 'olive', plantedAt: -1e99 }, { plant: 'laurel', plantedAt: 1e99 }, { plant: 'iris', plantedAt: Infinity }, { plant: 'olive', plantedAt: 0 }],
      settledRuns: ['same', 'same'], discoveries: ['known', 'known'],
      preparedRuns: [{ runId: 'safe', supply: 'olive-draught', effect: { maxHpBonus: 1e99, pickupRadiusMultiplier: 999, dashCooldownMultiplier: 0 }, assisted: false }, { runId: 'safe', supply: 'iris-vial' }, { runId: 'plain', supply: null, effect: { maxHpBonus: 99 }, assisted: true }],
    };
    const result = schema.decodeProfile(dirty);
    assert.equal(result.status, 'ok');
    const p = result.profile;
    assert.equal(p.fragments, 0);
    assert.equal(p.growth, limits.growth);
    assert.deepEqual(p.seeds, { olive: 0, laurel: limits.seeds, iris: 0 });
    assert.deepEqual(p.produce, { olive: 2, laurel: 0, iris: 0 });
    assert.deepEqual(p.supplies, { 'olive-draught': limits.supplies, 'laurel-thread': 0, 'iris-vial': 0 });
    assert.equal(p.packedSupply, null);
    assert.deepEqual(p.beds, [{ plant: 'olive', plantedAt: -PLANTS.olive.growth }, { plant: 'laurel', plantedAt: limits.growth }, null]);
    assert.deepEqual(p.settledRuns, ['same']);
    assert.deepEqual(p.discoveries, ['known']);
    assert.deepEqual(p.preparedRuns, [{ runId: 'safe', supply: 'olive-draught', effect: SUPPLIES['olive-draught'].effect, assisted: true }, { runId: 'plain', supply: null, effect: NO_SUPPLY_EFFECT, assisted: false }]);
    const capped = schema.decodeProfile({ ...createProfile(), fragments: 999, growth: -20.5, seeds: Object.fromEntries(plants.map((id) => [id, 999])), produce: Object.fromEntries(plants.map((id) => [id, 999])), supplies: Object.fromEntries(supplies.map((id) => [id, 999])), beds: [{ plant: 'unknown', plantedAt: 0 }] }).profile;
    assert.equal(capped.fragments, limits.fragments);
    assert.equal(capped.growth, 0);
    assert.equal(capped.beds.length, limits.beds);
    for (const id of plants) { assert.equal(capped.seeds[id], limits.seeds); assert.equal(capped.produce[id], limits.produce); }
    for (const id of supplies) assert.equal(capped.supplies[id], limits.supplies);
    for (const input of [null, [], 'not-profile', { version: -1 }, { version: '1' }]) assert.equal(schema.decodeProfile(input).status, 'recovered');
  });

  check('malformed JSON is backed up exactly before first successful replacement', () => {
    for (const raw of ['{ broken json', 'null', JSON.stringify({ version: -1 })]) {
      const backing = new FakeStorage(raw);
      const h = harness(backing);
      assert.equal(h.read().storage, 'recovered');
      assert.ok(h.read().warning);
      assert.equal(backing.values.get(PROFILE_KEY), raw);
      assert.equal(backing.values.has(CORRUPT_PROFILE_KEY), false);
      assert.equal(h.settle(summary('corrupt/recovery')).applied, true);
      assert.deepEqual(backing.writes.map(([key]) => key), [CORRUPT_PROFILE_KEY, PROFILE_KEY]);
      assert.equal(backing.values.get(CORRUPT_PROFILE_KEY), raw);
      assert.equal(JSON.parse(backing.values.get(PROFILE_KEY)).version, 2);
      const reloaded = harness(backing);
      assert.equal(reloaded.settle(summary('corrupt/recovery')).duplicate, true);
      assert.equal(backing.values.get(CORRUPT_PROFILE_KEY), raw);
    }
  });

  check('getItem failure keeps an uninterrupted in-memory ledger, including after a saved read', () => {
    for (const preload of [false, true]) {
      const initial = createProfile();
      initial.fragments = 7;
      const backing = new FakeStorage(JSON.stringify(initial));
      const h = harness(backing);
      if (preload) assert.equal(h.read().profile.fragments, 7);
      backing.failGet = true;
      assert.equal(h.settle(summary('get-failure/run')).storage, 'memory');
      const after = h.read();
      assert.ok(after.warning);
      assert.equal(after.profile.fragments, preload ? 8 : 1);
      assert.equal(h.settle(summary('get-failure/run')).duplicate, true);
      assert.equal(h.discover('get-failure/discovery').applied, true);
      assert.equal(h.discover('get-failure/discovery').duplicate, true);
      assert.equal(h.prepare('get-failure/prepared').applied, true);
      assert.equal(h.prepare('get-failure/prepared').duplicate, true);
      const gets = backing.gets;
      backing.failGet = false;
      h.read();
      assert.equal(backing.gets, gets, 'memory fallback must not reload an older disk ledger');
      assert.equal(backing.writes.length, 0);
    }
  });

  check('setItem failure preserves live consumption and duplicate protection against stale disk', () => {
    const initial = createProfile();
    initial.supplies['olive-draught'] = 2;
    initial.packedSupply = 'olive-draught';
    const backing = new FakeStorage(JSON.stringify(initial));
    const h = harness(backing);
    backing.failSet = true;
    const first = h.prepare('set-failure/prepared');
    assert.equal(first.storage, 'memory');
    assert.equal(first.prepared.supply, 'olive-draught');
    assert.equal(first.profile.supplies['olive-draught'], 1);
    assert.ok(first.warning);
    assert.equal(h.prepare('set-failure/prepared').duplicate, true);
    assert.equal(h.settle(summary('set-failure/run')).applied, true);
    assert.equal(h.settle(summary('set-failure/run')).duplicate, true);
    assert.equal(h.discover('set-failure/discovery').applied, true);
    assert.equal(h.discover('set-failure/discovery').duplicate, true);
    const gets = backing.gets;
    backing.failSet = false;
    const final = h.read();
    assert.equal(backing.gets, gets);
    assert.equal(final.profile.supplies['olive-draught'], 1);
    assert.equal(final.profile.fragments, 2);
    assert.equal(final.profile.settledRuns.length, 1);
    assert.equal(final.profile.preparedRuns.length, 1);
    assert.equal(final.profile.discoveries.length, 1);
    assert.equal(JSON.parse(backing.values.get(PROFILE_KEY)).supplies['olive-draught'], 2, 'failed persistence must not be mistaken for reload durability');
  });

  check('missing storage and failed corrupt-backup writes still preserve this page’s ledger', () => {
    for (const backing of [null, new FakeStorage('{broken')]) {
      if (backing) backing.failSet = true;
      const h = harness(backing);
      const first = h.settle(summary('memory/run'));
      assert.equal(first.storage, 'memory');
      assert.ok(first.warning);
      assert.equal(h.settle(summary('memory/run')).duplicate, true);
      assert.equal(h.prepare('memory/prepare').applied, true);
      assert.equal(h.prepare('memory/prepare').duplicate, true);
      assert.equal(h.discover('memory/discovery').applied, true);
      assert.equal(h.discover('memory/discovery').duplicate, true);
      assert.equal(h.read().profile.fragments, 2);
      if (backing) assert.equal(backing.values.get(PROFILE_KEY), '{broken');
    }
  });

  check('busy writer guard blocks callbacks, inventory consumption and persistence', () => {
    const initial = createProfile();
    initial.supplies['olive-draught'] = 1;
    initial.packedSupply = 'olive-draught';
    const raw = JSON.stringify(initial);
    const backing = new FakeStorage(raw);
    const busyWarning = 'Another page owns this profile.';
    const h = harness(backing, () => busyWarning);
    assert.equal(h.read().storage, 'busy');
    assert.equal(h.read().warning, busyWarning);
    for (const result of [h.prepare('busy/prepared'), h.settle(summary('busy/settled')), h.discover('busy/discovered'), h.plant(0, 'olive')]) {
      assert.equal(result.applied, false);
      assert.equal(result.reason, 'unavailable');
      assert.equal(result.storage, 'busy');
      assert.equal(result.warning, busyWarning);
      assert.deepEqual(result.profile, initial);
    }
    assert.equal(h.prepare('busy/prepared').prepared, null);
    assert.deepEqual(h.settle(summary('busy/settled')).reward, rules.emptyReward());
    let called = 0;
    const direct = createProfileStore(backing, () => busyWarning);
    direct.update((p) => { called++; return prepare(p, 'busy/direct'); }, () => ({ ...unavailable(), prepared: null }));
    assert.equal(called, 0, 'the guarded transaction callback must never run');
    assert.equal(backing.values.get(PROFILE_KEY), raw);
    assert.equal(backing.writes.length, 0);
  });

  check('released writer guard refreshes disk and safely resumes previously denied operations', () => {
    const initial = createProfile();
    initial.supplies['olive-draught'] = 2;
    initial.packedSupply = 'olive-draught';
    const backing = new FakeStorage(JSON.stringify(initial));
    let busy = true;
    const h = harness(backing, () => busy ? 'busy writer' : null);
    assert.equal(h.prepare('guard/prepared').reason, 'unavailable');
    assert.equal(h.settle(summary('guard/settled')).reason, 'unavailable');
    assert.equal(h.discover('guard/discovered').reason, 'unavailable');
    const external = structuredClone(initial);
    external.fragments = 9;
    external.discoveries.push('guard/external');
    backing.values.set(PROFILE_KEY, JSON.stringify(external));
    busy = false;
    assert.equal(h.read().storage, 'saved');
    assert.equal(h.read().warning, null);
    assert.equal(h.read().profile.fragments, 9);
    const result = h.prepare('guard/prepared');
    assert.equal(result.applied, true);
    assert.equal(result.prepared.supply, 'olive-draught');
    assert.equal(result.profile.supplies['olive-draught'], 1);
    assert.equal(h.prepare('guard/prepared').duplicate, true);
    assert.equal(h.settle(summary('guard/settled')).applied, true);
    assert.equal(h.discover('guard/discovered').applied, true);
    assert.equal(h.discover('guard/external').duplicate, true);
    const reloaded = harness(backing);
    assert.equal(reloaded.read().profile.fragments, 11);
    assert.equal(reloaded.prepare('guard/prepared').duplicate, true);
    assert.equal(reloaded.settle(summary('guard/settled')).duplicate, true);
    assert.equal(reloaded.discover('guard/discovered').duplicate, true);
  });

  check('writer guard never blocks memory-only continuity after missing or failed storage', () => {
    for (const backing of [null, new FakeStorage()]) {
      if (backing) backing.failGet = true;
      let guardCalls = 0;
      const h = harness(backing, () => { guardCalls++; return 'busy writer'; });
      assert.equal(h.settle(summary('unguarded-memory/run')).applied, true);
      assert.equal(h.settle(summary('unguarded-memory/run')).duplicate, true);
      assert.equal(h.prepare('unguarded-memory/prepared').applied, true);
      assert.equal(h.prepare('unguarded-memory/prepared').duplicate, true);
      assert.equal(h.discover('unguarded-memory/discovered').applied, true);
      assert.equal(h.discover('unguarded-memory/discovered').duplicate, true);
      assert.equal(h.read().storage, 'memory');
      assert.equal(guardCalls, 0);
    }
    const backing = new FakeStorage();
    let busy = false;
    let guardCalls = 0;
    const h = harness(backing, () => { guardCalls++; return busy ? 'busy writer' : null; });
    backing.failSet = true;
    assert.equal(h.settle(summary('write-failed-memory/run')).storage, 'memory');
    const callsBeforeMemory = guardCalls;
    busy = true;
    assert.equal(h.settle(summary('write-failed-memory/run')).duplicate, true);
    assert.equal(h.prepare('write-failed-memory/prepared').applied, true);
    assert.equal(h.discover('write-failed-memory/discovered').applied, true);
    assert.equal(h.read().storage, 'memory');
    assert.equal(guardCalls, callsBeforeMemory);
  });

  check('successful reloads retain settlement, discovery and consumption receipts permanently', () => {
    const initial = createProfile();
    initial.supplies['iris-vial'] = 2;
    initial.packedSupply = 'iris-vial';
    const backing = new FakeStorage(JSON.stringify(initial));
    const first = harness(backing);
    assert.equal(first.settle(summary('reload/run')).applied, true);
    assert.equal(first.discover('reload/discovery').applied, true);
    const preparation = first.prepare('reload/prepared');
    const raw = backing.values.get(PROFILE_KEY);
    const writes = backing.writes.length;
    const reloaded = harness(backing);
    assert.equal(reloaded.settle(summary('reload/run', { victory: true, floor: 100 })).duplicate, true);
    assert.equal(reloaded.discover('reload/discovery').duplicate, true);
    assert.equal(reloaded.prepare('reload/prepared').duplicate, true);
    assert.deepEqual(reloaded.prepare('reload/prepared').prepared, preparation.prepared);
    assert.equal(reloaded.read().profile.supplies['iris-vial'], 1);
    assert.equal(reloaded.read().profile.fragments, 2);
    assert.equal(backing.values.get(PROFILE_KEY), raw);
    assert.equal(backing.writes.length, writes, 'duplicates must not rewrite persistence');
    const snapshot = reloaded.read();
    snapshot.profile.fragments = 999;
    snapshot.profile.preparedRuns[0].effect.dashCooldownMultiplier = 0;
    assert.equal(reloaded.read().profile.fragments, 2);
    assert.equal(reloaded.prepare('reload/prepared').prepared.effect.dashCooldownMultiplier, 0.92);
  });

  check('separate stores refresh sequential external writes instead of erasing another ledger', () => {
    const backing = new FakeStorage();
    const first = harness(backing);
    const second = harness(backing);
    first.read();
    second.read();
    assert.equal(first.discover('tabs/first').applied, true);
    assert.equal(second.settle(summary('tabs/second')).applied, true);
    assert.equal(first.discover('tabs/first').duplicate, true);
    assert.equal(first.settle(summary('tabs/second')).duplicate, true);
    assert.deepEqual(second.read().profile, first.read().profile);
    assert.equal(first.read().profile.fragments, 2);
  });

  check('service: generic profile rules share the writer, notifications and memory-only receipt ledger', () => withBrowserService(async ({ service, locks, backing }) => {
    let called = 0;
    let announcements = 0;
    const unsubscribe = service.subscribeProfile(() => announcements++);
    const apply = (id) => service.applyProfileRule((p) => { called++; return { ...discover(p, id), receipt: id }; }, () => ({ ...unavailable(), receipt: null }));
    const pending = apply('generic/first');
    assert.equal(pending.reason, 'unavailable'); assert.equal(pending.receipt, null);
    assert.equal(called, 0); assert.equal(announcements, 0); assert.equal(backing.writes.length, 0);
    void locks.requests[0].grant(); await nextTurn();
    const readyAnnouncements = announcements;
    const saved = apply('generic/first');
    assert.equal(saved.applied, true); assert.equal(saved.storage, 'saved'); assert.equal(saved.receipt, 'generic/first');
    assert.equal(announcements, readyAnnouncements + 1);
    assert.equal(apply('generic/first').duplicate, true);
    assert.equal(announcements, readyAnnouncements + 1);
    backing.failSet = true;
    const failedWrite = apply('generic/memory');
    assert.equal(failedWrite.applied, true); assert.equal(failedWrite.storage, 'memory'); assert.ok(failedWrite.warning);
    assert.equal(announcements, readyAnnouncements + 2);
    const fragments = failedWrite.profile.fragments;
    backing.failSet = false;
    const repeat = apply('generic/memory');
    assert.equal(repeat.duplicate, true); assert.equal(repeat.profile.fragments, fragments); assert.equal(repeat.storage, 'memory');
    assert.equal(announcements, readyAnnouncements + 2);
    unsubscribe();
  }));

  check('service: pending pagehide → AbortError → pageshow requests a fresh lock', () => withBrowserService(async ({ service, locks, backing, dispatch }) => {
    assert.equal(service.loadProfile().storage, 'busy');
    assert.equal(service.prepareRun('lifecycle/pending').reason, 'unavailable');
    const old = locks.requests[0];
    dispatch('pagehide');
    dispatch('focus');
    assert.equal(locks.requests.length, 1, 'a hidden page cannot acquire a new writer');
    const abort = new Error('Document is no longer active');
    abort.name = 'AbortError';
    old.reject(abort);
    await nextTurn();
    assert.equal(service.loadProfile().storage, 'busy');
    assert.doesNotMatch(service.loadProfile().warning, /不支持/);
    assert.equal(backing.writes.length, 0);
    dispatch('pageshow');
    assert.equal(locks.requests.length, 2);
    assert.equal(service.loadProfile().storage, 'busy');
    void locks.requests[1].grant();
    await nextTurn();
    assert.equal(service.loadProfile().storage, 'saved');
    assert.equal(service.prepareRun('lifecycle/pending').applied, true);
    assert.equal(service.prepareRun('lifecycle/pending').duplicate, true);
    assert.equal(service.loadProfile().profile.supplies['olive-draught'], 1);
  }));

  check('service: a late callback while hidden or from an old generation never grants write access', () => withBrowserService(async ({ service, locks, backing, initial, dispatch }) => {
    const hiddenRequest = locks.requests[0];
    dispatch('pagehide');
    await hiddenRequest.grant();
    await nextTurn();
    assert.equal(hiddenRequest.released, true, 'an obsolete callback must immediately release its lock');
    assert.equal(service.loadProfile().storage, 'busy');
    assert.equal(service.prepareRun('lifecycle/hidden').reason, 'unavailable');
    assert.deepEqual(service.loadProfile().profile, initial);
    dispatch('pageshow');
    const obsolete = locks.requests[1];
    dispatch('pagehide');
    dispatch('pageshow');
    assert.equal(locks.requests.length, 3);
    await obsolete.grant();
    await nextTurn();
    assert.equal(obsolete.released, true);
    assert.equal(service.loadProfile().storage, 'busy', 'an old callback cannot authorize the new pending request');
    assert.equal(service.prepareRun('lifecycle/obsolete').reason, 'unavailable');
    assert.equal(backing.writes.length, 0);
    void locks.requests[2].grant();
    await nextTurn();
    assert.equal(service.loadProfile().storage, 'saved');
    assert.equal(service.prepareRun('lifecycle/current').applied, true);
    assert.equal(service.loadProfile().profile.supplies['olive-draught'], 1);
  }));

  check('service: pagehide releases a held lock and immediate pageshow safely reacquires', () => withBrowserService(async ({ service, locks, dispatch }) => {
    const firstLock = locks.requests[0];
    void firstLock.grant();
    await nextTurn();
    assert.equal(service.loadProfile().storage, 'saved');
    assert.equal(firstLock.released, false, 'the lock stays held while the page is active');
    assert.equal(service.prepareRun('lifecycle/held-first').applied, true);
    dispatch('pagehide');
    assert.equal(service.loadProfile().storage, 'busy');
    assert.equal(service.packSupply('olive-draught').reason, 'unavailable');
    // Resume before the old callback continuation runs to exercise generation ownership.
    dispatch('pageshow');
    assert.equal(locks.requests.length, 2);
    void locks.requests[1].grant();
    await nextTurn();
    assert.equal(firstLock.released, true);
    assert.equal(locks.requests[1].released, false);
    assert.equal(service.loadProfile().storage, 'saved');
    assert.equal(service.prepareRun('lifecycle/held-first').duplicate, true);
    assert.equal(service.loadProfile().profile.supplies['olive-draught'], 1);
    assert.equal(service.packSupply('olive-draught').applied, true);
    assert.equal(service.prepareRun('lifecycle/held-second').applied, true);
    assert.equal(service.loadProfile().profile.supplies['olive-draught'], 0);
    dispatch('pagehide');
    await nextTurn();
    assert.equal(locks.requests[1].released, true);
    assert.equal(service.loadProfile().storage, 'busy');
  }));

  check('service: another writer returning null stays busy and never consumes or saves', () => withBrowserService(async ({ service, locks, backing, initial, dispatch }) => {
    await locks.requests[0].grant(null);
    await nextTurn();
    assert.equal(service.loadProfile().storage, 'busy');
    for (const result of [service.prepareRun('lifecycle/other-writer'), service.settleRun(summary('lifecycle/other-writer')), service.claimDiscovery('lifecycle/other-discovery'), service.plantSeed(0, 'olive')]) {
      assert.equal(result.applied, false);
      assert.equal(result.reason, 'unavailable');
      assert.deepEqual(result.profile, initial);
    }
    assert.equal(service.prepareRun('lifecycle/other-writer').prepared, null);
    assert.equal(backing.writes.length, 0);
    dispatch('focus');
    assert.equal(locks.requests.length, 2);
    await locks.requests[1].grant(null);
    assert.equal(service.loadProfile().storage, 'busy');
    dispatch('pageshow');
    assert.equal(locks.requests.length, 3);
    void locks.requests[2].grant();
    await nextTurn();
    assert.equal(service.prepareRun('lifecycle/other-writer').applied, true);
    assert.equal(service.prepareRun('lifecycle/other-writer').duplicate, true);
    assert.equal(service.loadProfile().profile.supplies['olive-draught'], 1);
  }));

  check('service: an active AbortError remains retryable on focus', () => withBrowserService(async ({ service, locks, dispatch }) => {
    const abort = new Error('Acquisition was interrupted');
    abort.name = 'AbortError';
    locks.requests[0].reject(abort);
    await nextTurn();
    assert.equal(service.loadProfile().storage, 'busy');
    assert.doesNotMatch(service.loadProfile().warning, /不支持/);
    dispatch('focus');
    assert.equal(locks.requests.length, 2);
    void locks.requests[1].grant();
    await nextTurn();
    assert.equal(service.loadProfile().storage, 'saved');
    assert.equal(service.prepareRun('lifecycle/abort-retry').applied, true);
  }));

  check('service: stale rejection cannot revoke a newer ready writer', () => withBrowserService(async ({ service, locks, dispatch }) => {
    const stale = locks.requests[0];
    dispatch('pagehide');
    dispatch('pageshow');
    void locks.requests[1].grant();
    await nextTurn();
    assert.equal(service.loadProfile().storage, 'saved');
    stale.reject(new Error('Old request failed after the replacement acquired'));
    await nextTurn();
    assert.equal(service.loadProfile().storage, 'saved');
    assert.equal(service.loadProfile().warning, null);
    assert.equal(service.prepareRun('lifecycle/stale-rejection').applied, true);
    assert.equal(locks.requests[1].released, false);
  }));

  let passed = 0;
  for (const { name, run } of checks) {
    try {
      await run();
      passed++;
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}`);
      console.error(error);
      process.exitCode = 1;
    }
  }
  console.log(`Meta rules: ${passed}/${checks.length} checks passed.`);
} finally {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
  await rm(temporaryDir, { recursive: true, force: true });
}
