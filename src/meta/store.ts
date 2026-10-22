import { createProfile } from './rules';
import { decodeProfile } from './schema';
import type { MetaProfile, ProfileState } from './types';

// Keep this key across schema upgrades: older clients must see the future version.
export const PROFILE_KEY = 'adonis.meta.v1';
export const CORRUPT_PROFILE_KEY = 'adonis.meta.v1.corrupt';
export interface ProfileStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface ProfileStore {
  read(): ProfileState;
  update<T extends { applied: boolean; reason?: string }>(change: (profile: MetaProfile) => T, unavailable: () => T): T & ProfileState;
}
const clone = <T>(value: T): T => structuredClone(value);

/** A failed write keeps this page's ledger instead of rereading stale disk state. */
export function createProfileStore(storage: ProfileStorage | null, writeWarning: () => string | null = () => null): ProfileStore {
  let state: ProfileState = { profile: createProfile(), storage: storage ? 'saved' : 'memory', warning: storage ? null : '浏览器存储不可用；本页可继续游玩，关闭页面后成长不会保留。' };
  let memoryOnly = storage === null;
  let initialized = false;
  let corruptRaw: string | null = null;
  let lastRaw: string | null | undefined;
  const memory = () => { memoryOnly = true; state.storage = 'memory'; state.warning = '浏览器存储不可用；本页可继续游玩，关闭页面后成长不会保留。'; };
  const snapshot = (): ProfileState => {
    const warning = !memoryOnly && state.storage !== 'unsupported' ? writeWarning() : null;
    return clone(warning ? { ...state, storage: 'busy' as const, warning } : state);
  };
  function refresh() {
    if (memoryOnly) return;
    let raw: string | null;
    try { raw = storage!.getItem(PROFILE_KEY); } catch { memory(); return; }
    if (initialized && raw === lastRaw) return;
    initialized = true; lastRaw = raw;
    if (!raw) { state = { profile: createProfile(), storage: 'saved', warning: null }; return; }
    try {
      const decoded = decodeProfile(JSON.parse(raw));
      state = { profile: decoded.profile, storage: decoded.status === 'unsupported' ? 'unsupported' : decoded.status === 'recovered' ? 'recovered' : 'saved', warning: decoded.status === 'unsupported' ? '成长存档版本较新或回执损坏，已保护原档；生活玩法暂时只读。' : decoded.status === 'recovered' ? '成长存档损坏，已恢复新花园；原始数据会保留一份备份。' : decoded.status === 'migrated' ? '已读取旧版成长存档；下次操作时升级保存。' : null };
      if (decoded.status === 'recovered') corruptRaw = raw;
    } catch {
      corruptRaw = raw;
      state = { profile: createProfile(), storage: 'recovered', warning: '成长存档无法读取，已恢复新花园；原始数据会保留一份备份。' };
    }
  }
  return {
    read() { refresh(); return snapshot(); },
    update(change, unavailable) {
      refresh();
      if (state.storage === 'unsupported' || (!memoryOnly && writeWarning())) return clone({ ...unavailable(), ...snapshot() });
      const draft = clone(state.profile);
      // Detach every receipt before commit; a returned nested draft reference
      // must never become an out-of-transaction write to the live ledger.
      const result = clone(change(draft));
      if (result.applied) {
        state.profile = draft;
        if (!memoryOnly) {
          try {
            if (corruptRaw !== null) { storage!.setItem(CORRUPT_PROFILE_KEY, corruptRaw); corruptRaw = null; }
            const raw = JSON.stringify(draft);
            storage!.setItem(PROFILE_KEY, raw);
            lastRaw = raw; initialized = true;
            if (state.storage !== 'recovered') state.warning = null;
          } catch { memory(); }
        }
      }
      return { ...result, ...snapshot() };
    },
  };
}
