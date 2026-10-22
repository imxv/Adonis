import { craft, discover, emptyReward, harvest, pack, plant, prepare, settle, type RuleResult } from './rules';
import { createProfileStore, PROFILE_KEY, type ProfileStorage } from './store';
import type { MetaProfile, MetaResult, PreparationResult, ProfileState, RunSummary, SettlementResult, PlantId, SupplyId } from './types';

function browserStorage(): ProfileStorage | null { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } }
const listeners = new Set<() => void>();
const storage = browserStorage();
let writer: 'ready' | 'pending' | 'blocked' | 'unsupported' = typeof window === 'undefined' || !storage ? 'ready' : 'pending';
let releaseWriter: (() => void) | null = null;
let disposed = false;
let pageActive = true;
let requestGeneration = 0;
const writerWarning = () => writer === 'ready' ? null : writer === 'pending' ? '正在准备安全的成长存储，请稍候。' : writer === 'unsupported' ? '此浏览器不支持安全的跨窗口存储锁，生活玩法已保护为只读；主线仍可正常游玩。' : '另一窗口正在使用生活存档；此处只读。关闭那一页后，返回本页即可继续。';
const store = createProfileStore(storage, writerWarning);
function notify() { for (const listener of listeners) { try { listener(); } catch { /* Observers do not own saved transactions. */ } } }
function acquireWriter() {
  if (disposed || !pageActive || !storage || typeof window === 'undefined' || releaseWriter || writer === 'pending') return;
  if (!navigator.locks?.request) { writer = 'unsupported'; notify(); return; }
  writer = 'pending';
  const generation = ++requestGeneration;
  void navigator.locks.request(`${PROFILE_KEY}.writer`, { ifAvailable: true }, async (lock) => {
    if (disposed || !pageActive || generation !== requestGeneration) return;
    if (!lock) { writer = 'blocked'; notify(); return; }
    writer = 'ready';
    await new Promise<void>((resolve) => { releaseWriter = resolve; notify(); });
    if (generation === requestGeneration) { releaseWriter = null; writer = 'blocked'; }
  }).catch((error: unknown) => {
    if (!disposed && pageActive && generation === requestGeneration) {
      writer = error instanceof Error && error.name === 'AbortError' ? 'blocked' : 'unsupported';
      notify();
    }
  });
}
if (typeof window !== 'undefined' && storage) {
  writer = 'blocked';
  acquireWriter();
  const recoverWriter = () => { if (writer === 'blocked') acquireWriter(); };
  const showPage = () => { pageActive = true; recoverWriter(); };
  const leavePage = () => {
    pageActive = false;
    requestGeneration++;
    writer = 'blocked';
    const release = releaseWriter;
    releaseWriter = null;
    release?.();
  };
  window.addEventListener('focus', recoverWriter);
  window.addEventListener('pageshow', showPage);
  window.addEventListener('pagehide', leavePage);
  if (import.meta.hot) import.meta.hot.dispose(() => {
    disposed = true;
    leavePage();
    window.removeEventListener('focus', recoverWriter);
    window.removeEventListener('pageshow', showPage);
    window.removeEventListener('pagehide', leavePage);
    window.removeEventListener('storage', storageChanged);
    listeners.clear();
  });
}
const unavailable = () => ({ applied: false, duplicate: false, reason: 'unavailable' as const });
function announce<T extends { applied: boolean }>(value: T): T {
  if (value.applied) notify();
  return value;
}
export const loadProfile = (): ProfileState => store.read();
/** All life actions share the profile's transaction, writer lock and notification. */
export function applyProfileRule<T extends RuleResult>(operation: (profile: MetaProfile) => T, unavailable: () => T): T & ProfileState {
  return announce(store.update(operation, unavailable));
}
export const settleRun = (summary: RunSummary): SettlementResult => announce(store.update((p) => settle(p, summary), () => ({ ...unavailable(), reward: emptyReward() })));
export const claimDiscovery = (id: string): MetaResult => announce(store.update((p) => discover(p, id), unavailable));
export const prepareRun = (id: string): PreparationResult => announce(store.update((p) => prepare(p, id), () => ({ ...unavailable(), prepared: null })));
export const plantSeed = (bed: number, id: PlantId): MetaResult => announce(store.update((p) => plant(p, bed, id), unavailable));
export const harvestPlant = (bed: number): MetaResult => announce(store.update((p) => harvest(p, bed), unavailable));
export const craftSupply = (id: SupplyId): MetaResult => announce(store.update((p) => craft(p, id), unavailable));
export const packSupply = (id: SupplyId | null): MetaResult => announce(store.update((p) => pack(p, id), unavailable));
function storageChanged(event: StorageEvent) { if (event.key === PROFILE_KEY || event.key === null) for (const listener of listeners) listener(); }
export function subscribeProfile(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== 'undefined') window.addEventListener('storage', storageChanged);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', storageChanged);
  };
}
