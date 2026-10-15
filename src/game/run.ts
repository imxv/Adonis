import { Rng } from '../core/rng';
import { baseMods, type Mods, type Tag } from '../core/stats';
import { RARITY_INFO, UPGRADES, UPGRADE_BY_ID, type Rarity, type UpgradeDef } from '../data/upgrades';
import { MAX_WEAPONS, MAX_WEAPON_LEVEL, WEAPONS, WEAPON_ORDER, type WeaponInstance } from '../data/weapons';
import { MAX_SPELLS, MAX_SPELL_LEVEL, SPELLS, SPELL_ORDER, type SpellId, type SpellInstance } from '../data/spells';
import { PETS, type Pets } from '../data/enemies';
import { KITS, KIT_BY_ID } from '../styles/kits';
import type { StyleKit } from '../styles/types';

export const LEVELS = 3;
export const COMBAT_ROOMS = 4;

export interface RunState {
  seed: number;
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
  hp: number;
  armor: number;
  xp: number;
  xpLevel: number;
  xpNext: number;
  kills: number;
  maxCombo: number;
  damage: Record<string, number>;
  start: number;
  frenzyStacks: number;
  eliteNext: boolean;
}

export function xpForLevel(level: number) {
  return Math.floor(7 + level * 6 + Math.pow(level, 1.5) * 1.6);
}

export function newRun(params: URLSearchParams): RunState {
  const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e9);
  const rng = new Rng(seed);
  const forced = (params.get('styles') ?? '')
    .split(',')
    .map((s) => KIT_BY_ID[s.trim()])
    .filter(Boolean);
  const pool = rng.shuffle([...KITS]).filter((k) => !forced.includes(k));
  const styles = [...forced, ...pool].slice(0, LEVELS);
  const start = params.get('weapon') || 'pistol';
  const mods = baseMods();
  const spells: SpellInstance[] = [];
  const startSpell = params.get('spell') as SpellId | null;
  if (startSpell && SPELLS[startSpell]) spells.push(newSpell(startSpell));
  return {
    seed,
    rng,
    styles,
    level: Number(params.get('level')) || 0,
    room: params.get('room') === 'boss' ? COMBAT_ROOMS : 0,
    mods,
    stacks: {},
    tags: {},
    weapons: [{ def: WEAPONS[WEAPONS[start] ? start : 'pistol'], level: 1, cd: 0 }],
    held: 0,
    spells,
    pets: [],
    hp: mods.maxHp,
    armor: mods.maxArmor,
    xp: 0,
    xpLevel: 1,
    xpNext: xpForLevel(1),
    kills: 0,
    maxCombo: 0,
    damage: {},
    start: performance.now(),
    frenzyStacks: 0,
    eliteNext: false,
  };
}

export const newSpell = (id: SpellId): SpellInstance => ({ id, level: 1, evolved: false, cd: 0.5, angle: 0, hits: new Map(), kills: 0 });

export type Choice =
  | { type: 'upgrade'; def: UpgradeDef }
  | { type: 'weapon-new'; id: string }
  | { type: 'weapon-up'; index: number }
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

export function applyChoice(run: RunState, c: Choice) {
  switch (c.type) {
    case 'upgrade':
      applyUpgrade(run, c.def);
      break;
    case 'weapon-new':
      if (run.weapons.length < MAX_WEAPONS) {
        run.weapons.push({ def: WEAPONS[c.id], level: 1, cd: 0 });
        run.held = run.weapons.length - 1;
      } else {
        run.weapons[run.held] = { def: WEAPONS[c.id], level: run.weapons[run.held].level, cd: 0 };
      }
      break;
    case 'weapon-up':
      run.weapons[c.index].level++;
      break;
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

function availableUpgrades(run: RunState, minRarity?: Rarity) {
  const order: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  return UPGRADES.filter((u) => {
    if ((run.stacks[u.id] ?? 0) >= u.max) return false;
    if (minRarity && order.indexOf(u.rarity) < order.indexOf(minRarity)) return false;
    if (u.tags.includes('pet') && run.pets.length === 0) return false;
    if (u.id === 'resonance' && run.mods.elements.fire + run.mods.elements.ice + run.mods.elements.shock === 0) return false;
    return true;
  });
}

function weaponChoices(run: RunState): Choice[] {
  const out: Choice[] = [];
  for (const id of WEAPON_ORDER) if (!run.weapons.some((w) => w.def.id === id)) out.push({ type: 'weapon-new', id });
  run.weapons.forEach((w, index) => {
    if (w.level < MAX_WEAPON_LEVEL) out.push({ type: 'weapon-up', index });
  });
  return out;
}

function spellChoices(run: RunState): Choice[] {
  const out: Choice[] = [];
  for (const s of run.spells) {
    if (s.level < MAX_SPELL_LEVEL) out.push({ type: 'spell-up', id: s.id });
  }
  if (run.spells.length < MAX_SPELLS) {
    for (const id of SPELL_ORDER) if (!run.spells.some((s) => s.id === id)) out.push({ type: 'spell-new', id });
  }
  return out;
}

export function evolutionsReady(run: RunState): Choice[] {
  return run.spells
    .filter((s) => !s.evolved && s.level >= MAX_SPELL_LEVEL && (run.stacks[SPELLS[s.id].evolveWith] ?? 0) > 0)
    .map((s) => ({ type: 'evolve', id: s.id }));
}

export function rollChoices(run: RunState, kind: 'level' | 'rare' | 'weapon' | 'pet'): Choice[] {
  const rng = run.rng;
  if (kind === 'pet') {
    const pets = (Object.keys(PETS) as Pets[]).filter((p) => !run.pets.includes(p));
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
  // Early on, spells dominate so the screen fills up fast.
  if (kind === 'level') {
    const sc = rng.shuffle(spellChoices(run));
    const wantSpells = run.spells.length < 2 ? 2 : rng.chance(0.6) ? 1 : 0;
    out.push(...sc.slice(0, Math.max(0, wantSpells - (out.length ? 0 : 0))));
  }
  const pool = availableUpgrades(run, kind === 'rare' ? 'rare' : undefined);
  const used = new Set<string>();
  let guard = 0;
  const target = kind === 'level' ? 4 : 3;
  while (out.length < target && guard++ < 60) {
    const cand = pool.filter((u) => !used.has(u.id));
    if (!cand.length) break;
    const u = rng.weighted(cand, (c) => RARITY_INFO[c.rarity].weight * (spellPairBonus(run, c.id) ? 2.2 : 1));
    used.add(u.id);
    out.push({ type: 'upgrade', def: u });
  }
  if (out.length === 0) out.push({ type: 'heal' });
  return out.slice(0, target);
}

/** Upgrades that would unlock an evolution for a spell you hold get offered more often. */
function spellPairBonus(run: RunState, upgradeId: string) {
  return run.spells.some((s) => SPELLS[s.id].evolveWith === upgradeId && (run.stacks[upgradeId] ?? 0) === 0);
}

export function topTags(run: RunState): string[] {
  return Object.entries(run.tags)
    .filter(([, n]) => (n ?? 0) >= 2)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 2)
    .map(([t]) => t);
}

export { UPGRADE_BY_ID };
