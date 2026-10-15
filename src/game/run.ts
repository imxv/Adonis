import { Rng } from '../core/rng';
import { baseMods, type Mods, type Tag } from '../core/stats';
import { RARITY_INFO, UPGRADES, type Rarity, type UpgradeDef } from '../data/upgrades';
import { MAX_WEAPONS, MAX_WEAPON_LEVEL, WEAPONS, WEAPON_ORDER, type Delivery, type WeaponInstance } from '../data/weapons';
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
  pets: Pets[];
  hp: number;
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
  return Math.floor(6 + level * 3.4 + level * level * 0.45);
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
  const start = (params.get('weapon') as Delivery) || 'bolt';
  const mods = baseMods();
  return {
    seed,
    rng,
    styles,
    level: Number(params.get('level')) || 0,
    room: params.get('room') === 'boss' ? COMBAT_ROOMS : 0,
    mods,
    stacks: {},
    tags: {},
    weapons: [{ def: WEAPONS[WEAPONS[start] ? start : 'bolt'], level: 1, cd: 0 }],
    pets: [],
    hp: mods.maxHp,
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

export type Choice =
  | { type: 'upgrade'; def: UpgradeDef }
  | { type: 'weapon-new'; id: Delivery }
  | { type: 'weapon-up'; index: number }
  | { type: 'pet'; kind: Pets }
  | { type: 'heal' };

export function applyUpgrade(run: RunState, def: UpgradeDef) {
  const before = run.mods.maxHp;
  def.apply(run.mods);
  run.stacks[def.id] = (run.stacks[def.id] ?? 0) + 1;
  for (const t of def.tags) run.tags[t] = (run.tags[t] ?? 0) + 1;
  if (run.mods.maxHp > before) run.hp = Math.min(run.mods.maxHp, run.hp + (run.mods.maxHp - before));
}

export function applyChoice(run: RunState, c: Choice) {
  switch (c.type) {
    case 'upgrade':
      applyUpgrade(run, c.def);
      break;
    case 'weapon-new':
      run.weapons.push({ def: WEAPONS[c.id], level: 1, cd: 0 });
      break;
    case 'weapon-up':
      run.weapons[c.index].level++;
      break;
    case 'pet':
      run.pets.push(c.kind);
      break;
    case 'heal':
      run.hp = run.mods.maxHp;
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
  if (run.weapons.length < MAX_WEAPONS) {
    for (const id of WEAPON_ORDER) if (!run.weapons.some((w) => w.def.id === id)) out.push({ type: 'weapon-new', id });
  }
  run.weapons.forEach((w, index) => {
    if (w.level < MAX_WEAPON_LEVEL) out.push({ type: 'weapon-up', index });
  });
  return out;
}

export function rollChoices(run: RunState, kind: 'level' | 'rare' | 'weapon' | 'pet'): Choice[] {
  const rng = run.rng;
  if (kind === 'pet') {
    const pets = (Object.keys(PETS) as Pets[]).filter((p) => !run.pets.includes(p));
    if (pets.length === 0) return rollChoices(run, 'rare');
    return rng.shuffle(pets).slice(0, 3).map((k) => ({ type: 'pet', kind: k }));
  }
  if (kind === 'weapon') {
    const ws = rng.shuffle(weaponChoices(run));
    if (ws.length === 0) return rollChoices(run, 'rare');
    const picked = ws.slice(0, 3);
    while (picked.length < 3) {
      const extra = rollChoices(run, 'rare').find((c) => c.type === 'upgrade' && !picked.some((p) => p.type === 'upgrade' && p.def.id === c.def.id));
      if (!extra) break;
      picked.push(extra);
    }
    return picked;
  }
  const pool = availableUpgrades(run, kind === 'rare' ? 'rare' : undefined);
  const out: Choice[] = [];
  const used = new Set<string>();
  const wantWeapon = kind === 'level' && rng.chance(0.28);
  if (wantWeapon) {
    const ws = weaponChoices(run);
    if (ws.length) out.push(rng.pick(ws));
  }
  let guard = 0;
  while (out.length < 3 && guard++ < 60) {
    const cand = pool.filter((u) => !used.has(u.id));
    if (!cand.length) break;
    const topTags = Object.entries(run.tags)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 2)
      .map(([t]) => t);
    const u = rng.weighted(cand, (c) => RARITY_INFO[c.rarity].weight * (c.tags.some((t) => topTags.includes(t)) ? 1.6 : 1));
    used.add(u.id);
    out.push({ type: 'upgrade', def: u });
  }
  if (out.length === 0) out.push({ type: 'heal' });
  return out;
}

export function topTags(run: RunState): string[] {
  return Object.entries(run.tags)
    .filter(([, n]) => (n ?? 0) >= 2)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 2)
    .map(([t]) => t);
}
