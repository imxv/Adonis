// Non-UI storage/schema acceptance checks. Run: node src/meta/storage-v2.checks.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const temporaryDir = await mkdtemp(path.join(tmpdir(), 'adonis-storage-v2-'));
const bundlePath = path.join(temporaryDir, 'storage-v2.mjs');
class FakeStorage {
  values = new Map();
  writes = [];
  failSet = false;
  constructor(raw) { if (raw !== undefined) this.values.set('adonis.meta.v1', raw); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (this.failSet) throw new Error('write unavailable');
    this.writes.push([key, value]);
    this.values.set(key, value);
  }
}

try {
  await build({
    stdin: { contents: 'export * as rules from "./rules.ts"; export * as schema from "./schema.ts"; export * as storage from "./store.ts"; export * as life from "./life-catalog.ts"; export * as catalog from "./catalog.ts";', resolveDir: sourceDir, loader: 'ts' },
    outfile: bundlePath, bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent',
  });
  const { rules, schema, storage, life, catalog } = await import(pathToFileURL(bundlePath).href);
  const { createProfile, advanceGardenGrowth, discover } = rules;
  const { createProfileStore, PROFILE_KEY, CORRUPT_PROFILE_KEY } = storage;
  const { FISH_IDS, RECIPE_IDS, COMMISSION_IDS, RESTORATION_IDS, LIFE_LIMITS, createFishingAttempt, fishForSeed } = life;
  const unavailable = () => ({ applied: false, duplicate: false, reason: 'unavailable' });
  const checks = [];
  const check = (name, run) => checks.push({ name, run });
  const clone = (value) => structuredClone(value);
  const receipt = (sequence, outcome = 'caught', full = false) => {
    const attempt = createFishingAttempt(sequence);
    return { ...attempt, outcome, fish: outcome === 'caught' ? fishForSeed(attempt.seed) : null, awarded: outcome === 'caught' && !full ? 1 : 0, growth: outcome === 'caught' && !full ? 1 : 0, ...(full ? { reason: 'capacity' } : {}) };
  };
  const knownProgress = () => {
    const p = createProfile();
    p.life.fish[FISH_IDS[0]] = 2;
    p.life.fishing.receipts = [receipt(1), receipt(2, 'caught', true), receipt(3, 'missed'), receipt(4, 'cancelled')];
    p.life.fishing.active = createFishingAttempt(5);
    p.life.fishing.nextSequence = 6;
    p.life.cooked = [{ actionId: 'cook/first', recipeId: RECIPE_IDS[0] }];
    p.life.completedCommissions = [COMMISSION_IDS[0]];
    p.life.restored = [RESTORATION_IDS[0]];
    return p;
  };

  check('new profile is v2; v2 life data and active attempt survive exact roundtrip', () => {
    assert.equal(createProfile().version, 2);
    const p = knownProgress();
    const decoded = schema.decodeProfile(JSON.parse(JSON.stringify(p)));
    assert.equal(decoded.status, 'ok');
    assert.deepEqual(decoded.profile, p);
    assert.equal(PROFILE_KEY, 'adonis.meta.v1', 'key must remain visible to old clients');
  });

  for (const version of [0, 1]) check(`v${version} migrates all existing state and writes v2 only after mutation`, () => {
    const old = createProfile();
    delete old.life;
    old.version = version;
    old.fragments = 7; old.growth = 3;
    old.seeds = { olive: 3, laurel: 2, iris: 1 };
    old.produce = { olive: 2, laurel: 1, iris: 3 };
    old.supplies['olive-draught'] = 2;
    old.packedSupply = 'olive-draught';
    old.beds = [{ plant: 'laurel', plantedAt: 2 }, null, { plant: 'iris', plantedAt: 0 }];
    old.discoveries = ['legacy/discovery']; old.settledRuns = ['legacy/settled'];
    old.preparedRuns = [{ runId: 'legacy/prepared', supply: 'olive-draught', assisted: true, effect: clone(catalog.SUPPLIES['olive-draught'].effect) }];
    const backing = new FakeStorage(JSON.stringify(old));
    const store = createProfileStore(backing);
    const read = store.read();
    assert.equal(read.storage, 'saved');
    assert.match(read.warning, /升级/);
    assert.deepEqual(read.profile, { ...old, version: 2, life: life.createLifeProgress() });
    assert.equal(backing.writes.length, 0);
    assert.equal(store.update((p) => discover(p, 'v2/first-write'), unavailable).applied, true);
    const saved = JSON.parse(backing.values.get(PROFILE_KEY));
    assert.equal(saved.version, 2);
    assert.deepEqual(saved.preparedRuns, old.preparedRuns);
    assert.deepEqual(saved.settledRuns, old.settledRuns);
    assert.equal(saved.packedSupply, old.packedSupply);
    assert.deepEqual(saved.life, life.createLifeProgress());
    // This is the old decoder's version boundary: every v2 save is future data to v1.
    assert.ok(saved.version > 1);
  });

  check('growth ceiling rebases partial and mature beds using the existing crop progression', () => {
    const p = createProfile(); p.growth = catalog.META_LIMITS.growth;
    p.beds = [{ plant: 'iris', plantedAt: p.growth - 1 }, { plant: 'olive', plantedAt: p.growth - 10 }, null];
    advanceGardenGrowth(p, 1);
    assert.equal(p.growth, 1);
    assert.deepEqual(p.beds, [{ plant: 'iris', plantedAt: -1 }, { plant: 'olive', plantedAt: -1 }, null]);
    assert.equal(p.growth - p.beds[0].plantedAt, 2);
    const before = clone(p);
    for (const invalid of [-1, 0, NaN, Infinity, 0.5, catalog.META_LIMITS.growth + 1]) advanceGardenGrowth(p, invalid);
    assert.deepEqual(p, before);
  });

  const corruptions = [
    ['missing life', (p) => { delete p.life; }],
    ['unknown life field', (p) => { p.life.temporary = true; }],
    ['negative fish', (p) => { p.life.fish[FISH_IDS[0]] = -1; }],
    ['fish overflow', (p) => { p.life.fish[FISH_IDS[0]] = LIFE_LIMITS.fish + 1; }],
    ['missing fish species', (p) => { delete p.life.fish[FISH_IDS[0]]; }],
    ['unknown fish species', (p) => { p.life.fish.unknown = 1; }],
    ['sequence rewind', (p) => { p.life.fishing.nextSequence--; }],
    ['sequence skip', (p) => { p.life.fishing.nextSequence++; }],
    ['receipt removal', (p) => { p.life.fishing.receipts.shift(); }],
    ['receipt duplicate', (p) => { p.life.fishing.receipts[1] = clone(p.life.fishing.receipts[0]); }],
    ['receipt identity substitution', (p) => { p.life.fishing.receipts[0].attemptId = 'fishing/other'; }],
    ['receipt seed substitution', (p) => { p.life.fishing.receipts[0].seed++; }],
    ['caught fish substitution', (p) => { const v = p.life.fishing.receipts[0]; v.fish = FISH_IDS.find((id) => id !== v.fish); }],
    ['capacity reward mismatch', (p) => { p.life.fishing.receipts[1].growth = 1; }],
    ['non-caught reward', (p) => { p.life.fishing.receipts[2].awarded = 1; }],
    ['unknown outcome', (p) => { p.life.fishing.receipts[3].outcome = 'pending'; }],
    ['active stale identity', (p) => { p.life.fishing.active = createFishingAttempt(4); }],
    ['active unknown state', (p) => { p.life.fishing.active.phase = 'reward'; }],
    ['active removed without terminal', (p) => { p.life.fishing.active = null; }],
    ['duplicate cook', (p) => { p.life.cooked.push(clone(p.life.cooked[0])); }],
    ['unknown recipe', (p) => { p.life.cooked[0].recipeId = 'unknown'; }],
    ['invalid cook id', (p) => { p.life.cooked[0].actionId = ''; }],
    ['unknown commission', (p) => { p.life.completedCommissions.push('unknown'); }],
    ['duplicate commission', (p) => { p.life.completedCommissions.push(p.life.completedCommissions[0]); }],
    ['unknown restoration', (p) => { p.life.restored.push('unknown'); }],
    ['duplicate restoration', (p) => { p.life.restored.push(p.life.restored[0]); }],
    ['future version', (p) => { p.version = 3; }],
    ['missing old settlement ledger', (p) => { delete p.settledRuns; }],
    ['missing old preparation ledger', (p) => { delete p.preparedRuns; }],
  ];
  for (const [name, corrupt] of corruptions) check(`${name}: protect entire original save and refuse mutations`, () => {
    const p = knownProgress(); corrupt(p);
    const raw = JSON.stringify(p);
    assert.equal(schema.decodeProfile(p).status, 'unsupported');
    const backing = new FakeStorage(raw);
    const store = createProfileStore(backing);
    assert.equal(store.read().storage, 'unsupported');
    let called = false;
    const result = store.update(() => { called = true; return { applied: true, duplicate: false }; }, unavailable);
    assert.equal(called, false);
    assert.equal(result.reason, 'unavailable');
    assert.equal(backing.values.get(PROFILE_KEY), raw);
    assert.equal(backing.writes.length, 0);
  });

  check('full receipt ledger remains readable and cannot lose the final terminal record', () => {
    const p = createProfile();
    p.life.fishing.receipts = Array.from({ length: LIFE_LIMITS.fishingAttempts }, (_, index) => receipt(index + 1, 'cancelled'));
    p.life.fishing.nextSequence = LIFE_LIMITS.fishingAttempts + 1;
    assert.equal(schema.decodeProfile(p).status, 'ok');
    p.life.fishing.active = { attemptId: `fishing.${LIFE_LIMITS.fishingAttempts + 1}`, sequence: LIFE_LIMITS.fishingAttempts + 1, seed: 1 };
    p.life.fishing.nextSequence++;
    assert.equal(schema.decodeProfile(p).status, 'unsupported');
  });

  check('cooking receipt cap is bounded without evicting old action IDs', () => {
    const p = createProfile();
    p.life.cooked = Array.from({ length: LIFE_LIMITS.cooks }, (_, index) => ({ actionId: `cook/${index}`, recipeId: RECIPE_IDS[index % RECIPE_IDS.length] }));
    assert.equal(schema.decodeProfile(p).status, 'ok');
    p.life.cooked.push({ actionId: 'cook/overflow', recipeId: RECIPE_IDS[0] });
    assert.equal(schema.decodeProfile(p).status, 'unsupported');
  });

  check('write failure keeps the applied in-memory ledger; replay does not issue another reward', () => {
    const initial = knownProgress();
    const backing = new FakeStorage(JSON.stringify(initial));
    const store = createProfileStore(backing); backing.failSet = true;
    const applied = store.update((p) => discover(p, 'memory/reward'), unavailable);
    assert.equal(applied.applied, true); assert.equal(applied.storage, 'memory');
    assert.match(applied.warning, /关闭页面后/);
    const fragments = applied.profile.fragments;
    backing.failSet = false;
    const repeated = store.update((p) => discover(p, 'memory/reward'), unavailable);
    assert.equal(repeated.duplicate, true);
    assert.equal(repeated.profile.fragments, fragments);
    assert.equal(repeated.storage, 'memory');
    assert.equal(backing.writes.length, 0, 'no automatic replay or persistence retry');
    assert.deepEqual(JSON.parse(backing.values.get(PROFILE_KEY)), initial);
  });

  check('damaged raw JSON is backed up before replacement; backup failure keeps only memory', () => {
    for (const fail of [false, true]) {
      const raw = '{broken-v2';
      const backing = new FakeStorage(raw);
      const store = createProfileStore(backing);
      assert.equal(store.read().storage, 'recovered');
      backing.failSet = fail;
      const result = store.update((p) => discover(p, 'recovered/write'), unavailable);
      assert.equal(result.applied, true);
      if (fail) { assert.equal(result.storage, 'memory'); assert.equal(backing.values.get(PROFILE_KEY), raw); }
      else {
        assert.equal(backing.values.get(CORRUPT_PROFILE_KEY), raw);
        assert.equal(backing.writes[0][0], CORRUPT_PROFILE_KEY);
        assert.equal(JSON.parse(backing.values.get(PROFILE_KEY)).version, 2);
      }
    }
  });

  check('pending or blocked single-writer guard prevents transaction callback execution', () => {
    const backing = new FakeStorage(JSON.stringify(knownProgress()));
    let warning = 'another writer';
    const store = createProfileStore(backing, () => warning);
    let called = 0;
    const mutate = () => store.update((p) => { called++; return discover(p, 'locked/write'); }, unavailable);
    assert.equal(mutate().storage, 'busy'); assert.equal(called, 0); assert.equal(backing.writes.length, 0);
    warning = null;
    assert.equal(mutate().applied, true); assert.equal(called, 1);
  });

  for (const { name, run } of checks) { await run(); console.log(`PASS ${name}`); }
  console.log(`PASS ${checks.length} v2 storage/schema checks`);
} finally { await rm(temporaryDir, { recursive: true, force: true }); }
