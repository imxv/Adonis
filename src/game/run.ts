import { HEROES, type HeroId } from '../data/heroes';
import { Rng } from '../core/rng';
import { baseMods, type Mods, type Tag } from '../core/stats';
import { RARITY_INFO, UPGRADES, UPGRADE_BY_ID, type Rarity, type UpgradeDef } from '../data/upgrades';
import { MAX_WEAPONS, WEAPONS, WEAPON_ORDER, type WeaponInstance } from '../data/weapons';
import { FUSE_LEVEL, FUSION_ORDER, MAX_SPELLS, MAX_SPELL_LEVEL, SPELLS, SPELL_ORDER, fusionOf, type FusionId, type SpellId, type SpellInstance } from '../data/spells';
import { PET_ORDER, type Pets } from '../data/enemies';
import { KITS, KIT_BY_ID } from '../styles/kits';
import { DIFFICULTIES, type Difficulty, type DifficultyId } from '../data/difficulty';
import type { StyleKit } from '../styles/types';
import { settings } from '../settings';
import { createRunId, ensureRunId, type RunSupply, type SavedRun } from '../save';
import type { PreparedRun } from '../meta/types';

export const LEVELS = 5;
export const COMBAT_ROOMS = 4;

export interface RunState {
  runId: string;
  supply?: RunSupply;
  prepared?: PreparedRun;
  hero: HeroId;
  seed: number;
  /** Old saves stay on the original generator for their full run. */
  dungeonVersion?: 2;
  diff: Difficulty;
  rng: Rng;
  styles: StyleKit[];
  level: number;
  room: number; // 0..COMBAT_ROOMS-1 combat, COMBAT_ROOMS = boss
  mods: Mods;
  stacks: Record<string, number>;
  tags: Partial<Record<Tag, number>>;
  weapons: WeaponInstance[];
  held: number;
  spells: SpellInstance[];
  pets: Pets[];
  /** The all-companion transformation has already granted its one-time bonuses. */
  ascended: boolean;
  hp: number;
  armor: number;
  xp: number;
  xpLevel: number;
  xpNext: number;
  kills: number;
  maxCombo: number;
  /** Points: kills and on-beat actions times the style rank, plus each fight's grade. */
  score: number;
  damage: Record<string, number>;
  start: number;
  /** Seconds of actual play, not counting pauses and menus. */
  elapsed: number;
  frenzyStacks: number;
  eliteNext: boolean;
}

/** Tuned for ~350 kills a run: a level-up roughly every 20-30 seconds. */
export function xpForLevel(level: number) {
  return Math.floor(5 + level * 2.8 + Math.pow(level, 1.5) * 0.7);
}

export function newRun(params: URLSearchParams, heroId: HeroId = 'adonis', difficultyId?: DifficultyId): RunState {
  const hero = HEROES[(params.get('hero') as HeroId) ?? heroId] ?? HEROES[heroId] ?? HEROES.adonis;
  const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e9);
  const rng = new Rng(seed);
  const forced = (params.get('styles') ?? '')
    .split(',')
    .map((s) => KIT_BY_ID[s.trim()])
    .filter(Boolean);
  const pool = rng.shuffle([...KITS]).filter((k) => !forced.includes(k));
  const styles = [...forced, ...pool].slice(0, LEVELS);
  const start = params.get('weapon') || hero.weapon;
  const mods = baseMods();
  hero.apply(mods);
  const spells: SpellInstance[] = [];
  const startSpell = params.get('spell') as SpellId | null;
  if (startSpell && SPELLS[startSpell]) spells.push(newSpell(startSpell));
  return {
    runId: createRunId(),
    hero: hero.id,
    seed,
    dungeonVersion: 2,
    diff: DIFFICULTIES[difficultyId ?? (params.get('diff') as DifficultyId)] ?? DIFFICULTIES[settings.get().diff] ?? DIFFICULTIES.normal,
    rng,
    styles,
    level: Number(params.get('level')) || 0,
    room: params.get('room') === 'boss' ? COMBAT_ROOMS : 0,
    mods,
    stacks: {},
    tags: {},
    weapons: [{ def: WEAPONS[WEAPONS[start] ? start : 'pistol'], cd: 0 }],
    held: 0,
    spells,
    pets: [],
    ascended: false,
    hp: mods.maxHp,
    armor: mods.maxArmor,
    xp: 0,
    xpLevel: 1,
    xpNext: xpForLevel(1),
    kills: 0,
    maxCombo: 0,
    score: 0,
    damage: {},
    start: performance.now(),
    elapsed: 0,
    frenzyStacks: 0,
    eliteNext: false,
  };
}

/** The run as plain data for a save; the floor progress is added by the scene. */
export function snapshotRun(run: RunState): Omit<SavedRun, 'v' | 'savedAt' | 'rooms' | 'at'> {
  return {
    runId: run.runId,
    supply: run.supply ? { ...run.supply } : undefined,
    prepared: run.prepared ? { ...run.prepared, effect: { ...run.prepared.effect } } : undefined,
    hero: run.hero,
    seed: run.seed,
    dungeonVersion: run.dungeonVersion,
    diff: run.diff.id,
    styles: run.styles.map((k) => k.id),
    level: run.level,
    mods: JSON.parse(JSON.stringify(run.mods)),
    stacks: { ...run.stacks },
    tags: { ...run.tags },
    weapons: run.weapons.map((w) => ({ id: w.def.id })),
    held: run.held,
    spells: run.spells.map((s) => ({ id: s.id, level: s.level, evolved: s.evolved, kills: s.kills })),
    pets: [...run.pets],
    ascended: run.ascended,
    hp: run.hp,
    armor: run.armor,
    xp: run.xp,
    xpLevel: run.xpLevel,
    xpNext: run.xpNext,
    kills: run.kills,
    maxCombo: run.maxCombo,
    score: run.score,
    damage: { ...run.damage },
    elapsed: run.elapsed,
  };
}

/** Rebuild a run from a save. Random draws continue from a fresh stream; the floors themselves are seeded. */
export function restoreRun(s: SavedRun): RunState {
  const styles = s.styles.map((id) => KIT_BY_ID[id]).filter(Boolean);
  return {
    runId: ensureRunId(s),
    supply: s.supply ? { ...s.supply } : undefined,
    prepared: s.prepared ? { ...s.prepared, effect: { ...s.prepared.effect } } : undefined,
    hero: HEROES[s.hero as HeroId] ? (s.hero as HeroId) : 'knight',
    seed: s.seed,
    dungeonVersion: s.dungeonVersion === 2 ? 2 : undefined,
    diff: DIFFICULTIES[s.diff] ?? DIFFICULTIES.normal,
    rng: new Rng((s.seed ^ (s.kills * 7919 + s.level * 104729)) >>> 0 || 1),
    styles: styles.length === LEVELS ? styles : KITS.slice(0, LEVELS),
    level: s.level,
    room: 0,
    mods: { ...baseMods(), ...s.mods, elements: { ...baseMods().elements, ...s.mods.elements } },
    stacks: { ...s.stacks },
    tags: { ...s.tags },
    weapons: s.weapons.filter((w) => WEAPONS[w.id]).map((w) => ({ def: WEAPONS[w.id], cd: 0 })),
    held: Math.min(s.held, Math.max(0, s.weapons.length - 1)),
    spells: s.spells.filter((x) => SPELLS[x.id]).map((x) => ({ ...newSpell(x.id), level: x.level, evolved: x.evolved, kills: x.kills })),
    pets: [...new Set(s.pets.filter((p) => PET_ORDER.includes(p)))],
    ascended: s.ascended === true,
    hp: s.hp,
    armor: s.armor,
    xp: s.xp,
    xpLevel: s.xpLevel,
    xpNext: s.xpNext,
    kills: s.kills,
    maxCombo: s.maxCombo,
    score: s.score ?? 0,
    damage: { ...s.damage },
    start: performance.now(),
    elapsed: s.elapsed,
    frenzyStacks: 0,
    eliteNext: false,
  };
}

export const newSpell = (id: SpellId): SpellInstance => ({ id, level: 1, evolved: false, cd: 0.5, angle: 0, hits: new Map(), kills: 0, t: 0 });

export type Choice =
  | { type: 'upgrade'; def: UpgradeDef }
  | { type: 'weapon-new'; id: string; instance?: WeaponInstance }
  | { type: 'spell-new'; id: SpellId }
  | { type: 'spell-up'; id: SpellId }
  | { type: 'evolve'; id: SpellId }
  | { type: 'pet'; kind: Pets }
  | { type: 'heal' };

export function applyUpgrade(run: RunState, def: UpgradeDef) {
  const hp = run.mods.maxHp;
  const ar = run.mods.maxArmor;
  def.apply(run.mods);
  run.stacks[def.id] = (run.stacks[def.id] ?? 0) + 1;
  for (const t of def.tags) run.tags[t] = (run.tags[t] ?? 0) + 1;
  run.hp = Math.min(run.mods.maxHp, run.hp + Math.max(0, run.mods.maxHp - hp));
  run.armor = Math.min(run.mods.maxArmor, run.armor + Math.max(0, run.mods.maxArmor - ar));
}

/**
 * Whether a choice can still be taken. Offers are rolled ahead of time (a treasure room lays out its pedestals when
 * you walk in), so by the time one is taken the spell may have hit its last level, the four slots may be full, or the
 * upgrade may be at its cap.
 */
export function choiceValid(run: RunState, c: Choice): boolean {
  switch (c.type) {
    case 'upgrade':
      return upgradeValid(run, c.def);
    case 'weapon-new':
      return WEAPON_ORDER.includes(c.id) && (!c.instance || c.instance.def.id === c.id) && !run.weapons.some((w) => w.def.id === c.id);
    case 'spell-new':
      return !spellTaken(run, c.id) && run.spells.length < MAX_SPELLS;
    case 'spell-up': {
      const s = run.spells.find((x) => x.id === c.id);
      return !!s && !SPELLS[s.id].fusion && s.level < MAX_SPELL_LEVEL;
    }
    case 'evolve': {
      const s = run.spells.find((x) => x.id === c.id);
      const key = s && SPELLS[s.id].evolveWith;
      return !!s && !s.evolved && !!key && s.level >= MAX_SPELL_LEVEL && (run.stacks[key] ?? 0) > 0;
    }
    case 'pet':
      return PET_ORDER.includes(c.kind) && !run.pets.includes(c.kind);
    case 'heal':
      return true;
  }
}

export function applyChoice(run: RunState, c: Choice, replaceIndex?: number): WeaponInstance | undefined {
  // Every level has a ceiling: nothing here may push past it, whatever offered it.
  if (!choiceValid(run, c)) return;
  switch (c.type) {
    case 'upgrade':
      applyUpgrade(run, c.def);
      break;
    case 'weapon-new': {
      const incoming = c.instance ? { ...c.instance, def: WEAPONS[c.id] } : { def: WEAPONS[c.id], cd: 0 };
      if (run.weapons.length < MAX_WEAPONS) {
        run.weapons.push(incoming);
        run.held = run.weapons.length - 1;
      } else {
        // A full inventory requires the player to choose which weapon leaves the slot.
        if (replaceIndex === undefined || !Number.isInteger(replaceIndex) || replaceIndex < 0 || replaceIndex >= run.weapons.length) return;
        const displaced = { ...run.weapons[replaceIndex] };
        run.weapons[replaceIndex] = incoming;
        run.held = replaceIndex;
        return displaced;
      }
      break;
    }
    case 'spell-new':
      run.spells.push(newSpell(c.id));
      break;
    case 'spell-up': {
      const s = run.spells.find((x) => x.id === c.id);
      if (s) s.level++;
      break;
    }
    case 'evolve': {
      const s = run.spells.find((x) => x.id === c.id);
      if (s) s.evolved = true;
      break;
    }
    case 'pet':
      run.pets.push(c.kind);
      break;
    case 'heal':
      run.hp = run.mods.maxHp;
      run.armor = run.mods.maxArmor;
      break;
  }
}

function upgradeValid(run: RunState, u: UpgradeDef) {
  if ((run.stacks[u.id] ?? 0) >= u.max) return false;
  if (u.tags.includes('pet') && new Set(run.pets).size < (u.minPets ?? 1)) return false;
  return true;
}

function availableUpgrades(run: RunState, minRarity?: Rarity) {
  const order: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  return UPGRADES.filter((u) => {
    if (!upgradeValid(run, u)) return false;
    if (minRarity && order.indexOf(u.rarity) < order.indexOf(minRarity)) return false;
    if (u.id === 'resonance' && Object.values(run.mods.elements).every((v) => v === 0)) return false;
    return true;
  });
}

function weaponChoices(run: RunState): Choice[] {
  const out: Choice[] = [];
  for (const id of WEAPON_ORDER) if (!run.weapons.some((w) => w.def.id === id)) out.push({ type: 'weapon-new', id });
  return out;
}

/** Whether a base spell is already spent: owned as-is, or inside a fusion you hold. */
export const spellTaken = (run: RunState, id: SpellId) => run.spells.some((s) => s.id === id || SPELLS[s.id].fusion?.includes(id as never));

function spellChoices(run: RunState): Choice[] {
  const out: Choice[] = [];
  for (const s of run.spells) {
    if (!SPELLS[s.id].fusion && s.level < MAX_SPELL_LEVEL) out.push({ type: 'spell-up', id: s.id });
  }
  if (run.spells.length < MAX_SPELLS) {
    for (const id of SPELL_ORDER) if (!spellTaken(run, id)) out.push({ type: 'spell-new', id });
  }
  return out;
}

/** Steps toward a fusion: picking up the partner of a spell you hold, or levelling either of a pair. */
function towardFusion(run: RunState, c: Choice) {
  if (c.type !== 'spell-new' && c.type !== 'spell-up') return false;
  const f = fusionOf(c.id);
  return !!f && run.spells.some((s) => s.id === f.partner || s.id === c.id);
}

export function evolutionsReady(run: RunState): Choice[] {
  return run.spells
    .filter((s) => {
      const key = SPELLS[s.id].evolveWith;
      return !s.evolved && key && s.level >= MAX_SPELL_LEVEL && (run.stacks[key] ?? 0) > 0;
    })
    .map((s) => ({ type: 'evolve', id: s.id }));
}

/** Pairs of spells that are both at the fusion level: they merge automatically. */
export function fusionsReady(run: RunState): FusionId[] {
  return FUSION_ORDER.filter((f) => {
    if (run.spells.some((s) => s.id === f)) return false;
    const [a, b] = SPELLS[f].fusion!;
    const sa = run.spells.find((s) => s.id === a);
    const sb = run.spells.find((s) => s.id === b);
    return !!sa && !!sb && sa.level >= FUSE_LEVEL && sb.level >= FUSE_LEVEL;
  });
}

/** Replace the two ingredients with the fused spell. Returns the instances that were consumed. */
export function applyFusion(run: RunState, f: FusionId): SpellInstance[] {
  const [a, b] = SPELLS[f].fusion!;
  const used = run.spells.filter((s) => s.id === a || s.id === b);
  run.spells = run.spells.filter((s) => s.id !== a && s.id !== b);
  run.spells.push({ ...newSpell(f), evolved: used.some((s) => s.evolved) });
  return used;
}

export function rollChoices(run: RunState, kind: 'level' | 'rare' | 'weapon' | 'pet', choiceLevel = run.xpLevel): Choice[] {
  const rng = run.rng;
  const pets = PET_ORDER.filter((p) => !run.pets.includes(p));
  if (kind === 'pet') {
    if (pets.length === 0) return rollChoices(run, 'rare');
    return rng.shuffle(pets).slice(0, 3).map((k) => ({ type: 'pet', kind: k }));
  }
  if (kind === 'weapon') {
    const ws = rng.shuffle(weaponChoices(run)).slice(0, 3);
    return ws.length ? ws : rollChoices(run, 'rare');
  }
  const out: Choice[] = [];
  // An evolution, when ready, always shows up first.
  const evo = evolutionsReady(run);
  if (evo.length) out.push(evo[0]);
  const target = 3;
  if (kind === 'level') {
    // The first crystal, then every third one, always offers a new companion. Other levels have a 25% chance.
    // Use the crystal's level so leaving it on the floor cannot skip the guaranteed recruitment.
    if (pets.length && ((choiceLevel >= 2 && (choiceLevel - 2) % 3 === 0) || rng.chance(0.25))) {
      out.push({ type: 'pet', kind: rng.pick(pets) });
    }
    // Steps toward a fusion float to the front half the time, so pairs actually come together.
    const sc = rng.shuffle(spellChoices(run));
    if (rng.chance(0.5)) sc.sort((x, y) => Number(towardFusion(run, y)) - Number(towardFusion(run, x)));
    const wantSpells = run.spells.length < 2 ? 2 : rng.chance(0.55) ? 1 : 0;
    // Keep an upgrade slot whenever possible, so a recruited companion can start a build immediately.
    out.push(...sc.slice(0, Math.min(wantSpells, Math.max(0, target - out.length - 1))));
  }
  const pool = availableUpgrades(run, kind === 'rare' ? 'rare' : undefined);
  const used = new Set<string>();
  let guard = 0;
  // Three cards, always.
  while (out.length < target && guard++ < 60) {
    const cand = pool.filter((u) => !used.has(u.id));
    if (!cand.length) break;
    const u = rng.weighted(cand, (c) => {
      // Recruiting and investing in pets gently favors that build without excluding other upgrade families.
      const petWeight = c.tags.includes('pet') ? 1 + Math.min(2, run.pets.length * 0.2 + (run.tags.pet ?? 0) * 0.2) : 1;
      return RARITY_INFO[c.rarity].weight * petWeight * (spellPairBonus(run, c.id) ? 2.2 : 1);
    });
    used.add(u.id);
    out.push({ type: 'upgrade', def: u });
  }
  // Extremely long runs can exhaust upgrades; offer remaining spells/weapons before healing.
  if (out.length < target) {
    for (const c of rng.shuffle([...spellChoices(run), ...weaponChoices(run)])) {
      if (out.some((x) => JSON.stringify(x) === JSON.stringify(c))) continue;
      out.push(c);
      if (out.length === target) break;
    }
  }
  if (out.length < target) out.push({ type: 'heal' });
  return out.slice(0, target);
}

/**
 * A gold chest deals three cards: an evolution when one is ready, then spell steps (ones that lead toward a fusion first),
 * and at least one rare upgrade. A run with no spell to grow simply gets rare upgrades.
 */
export function rollChestChoices(run: RunState): Choice[] {
  const rng = run.rng;
  const out: Choice[] = evolutionsReady(run).slice(0, 1);
  const sc = rng.shuffle(spellChoices(run));
  sc.sort((x, y) => Number(towardFusion(run, y)) - Number(towardFusion(run, x)));
  out.push(...sc.slice(0, 2 - out.length));
  for (const c of rollChoices(run, 'rare')) {
    if (out.length >= 3) break;
    if (!out.some((x) => JSON.stringify(x) === JSON.stringify(c))) out.push(c);
  }
  return out.slice(0, 3);
}

/** The fusion a spell card leads to, if its partner is already held; `now` when taking it completes the pair. */
export function fusionHint(run: RunState, c: Choice): { fusion: FusionId; partner: SpellId; now: boolean } | undefined {
  if (c.type !== 'spell-new' && c.type !== 'spell-up') return undefined;
  const f = fusionOf(c.id);
  const partner = f && run.spells.find((s) => s.id === f.partner);
  if (!f || !partner) return undefined;
  const lv = c.type === 'spell-up' ? (run.spells.find((s) => s.id === c.id)?.level ?? 1) + 1 : 1;
  return { fusion: f.fusion, partner: f.partner, now: lv >= FUSE_LEVEL && partner.level >= FUSE_LEVEL };
}

/** Upgrades that would unlock an evolution for a spell you hold get offered more often. */
function spellPairBonus(run: RunState, upgradeId: string) {
  return run.spells.some((s) => SPELLS[s.id].evolveWith === upgradeId && (run.stacks[upgradeId] ?? 0) === 0);
}

export { towardFusion };

export function topTags(run: RunState): string[] {
  return Object.entries(run.tags)
    .filter(([, n]) => (n ?? 0) >= 2)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 2)
    .map(([t]) => t);
}

export { UPGRADE_BY_ID };
