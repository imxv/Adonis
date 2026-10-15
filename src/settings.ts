import type { DifficultyId } from './data/difficulty';

/** Player preferences, kept in this browser. Systems read them live; changes notify listeners. */
export interface Settings {
  diff: DifficultyId;
  /** 0-10 */
  music: number;
  /** 0-10 */
  sfx: number;
  light: boolean;
  shake: boolean;
  lean: boolean;
  numbers: boolean;
}

export const DEFAULT_SETTINGS: Settings = { diff: 'normal', music: 7, sfx: 8, light: true, shake: true, lean: true, numbers: true };

const KEY = 'adonis.settings.v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // Private mode or blocked storage: run on defaults.
  }
  return { ...DEFAULT_SETTINGS };
}

let current = load();
const listeners = new Set<(s: Settings) => void>();

export const settings = {
  get: (): Settings => current,
  set(patch: Partial<Settings>) {
    current = { ...current, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      // Not saved, still applied for this session.
    }
    listeners.forEach((f) => f(current));
  },
  reset() {
    this.set({ ...DEFAULT_SETTINGS });
  },
  onChange(f: (s: Settings) => void) {
    listeners.add(f);
    return () => listeners.delete(f);
  },
};
