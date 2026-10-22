/** Deterministic fishing mechanics. No DOM, storage, catalog, or rewards. */
export type FishingPhase = 'casting' | 'waiting' | 'bite' | 'reeling' | 'success' | 'failed' | 'cancelled';
export type FishingBobberCue = 'quiet' | 'nibble' | 'bite';
export type FishingFishCue = 'rest' | 'pull' | 'surge-warning' | 'surge';
export type FishingFailureReason = 'short-cast' | 'overcast' | 'early-hook' | 'missed-bite' | 'line-broke' | 'fish-escaped' | 'time-limit';
export type FishingReason = FishingFailureReason | 'landed' | 'cancelled' | null;

export interface FishingRulesConfig {
  /** 1 is standard. Kept within 0.65–1.5 so the same readable rules remain playable. */
  readonly difficulty?: number;
}

export interface FishingInput {
  readonly held: boolean;
  readonly pressed: boolean;
  readonly released: boolean;
}

interface FishBeat {
  readonly cue: FishingFishCue;
  readonly duration: number;
}

export interface FishingRound {
  readonly seed: number;
  readonly difficulty: number;
  readonly phase: FishingPhase;
  readonly elapsed: number;
  readonly phaseElapsed: number;
  readonly fightElapsed: number;
  readonly castStarted: boolean;
  readonly castPower: number;
  readonly bobberCue: FishingBobberCue;
  readonly biteRemaining: number;
  readonly tension: number;
  readonly progress: number;
  readonly slackSeconds: number;
  readonly fishCue: FishingFishCue;
  readonly fishCueRemaining: number;
  readonly reason: FishingReason;
  /** Stable schedule data belongs to the round, so saving/replaying inputs needs no RNG singleton. */
  readonly biteDelay: number;
  readonly nibbleAt: number;
  readonly nibbleDuration: number;
  readonly biteWindow: number;
  readonly fishRhythm: readonly FishBeat[];
}

export const FISHING_RULES = Object.freeze({
  castPowerPerSecond: 0.55,
  castMinimum: 0.28,
  castMaximum: 0.94,
  castSweetMinimum: 0.5,
  castSweetMaximum: 0.82,
  slackThreshold: 0.12,
  slackGraceSeconds: 2,
  roundTimeLimitSeconds: 90,
  maximumFrameSeconds: 0.25,
});

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));
const terminal = (phase: FishingPhase): boolean => phase === 'success' || phase === 'failed' || phase === 'cancelled';

function seedNumber(seed: number | string): number {
  const text = typeof seed === 'number' ? String(Number.isFinite(seed) ? seed : 0) : seed;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function randomSequence(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createFishingRound(seed: number | string, config: FishingRulesConfig = {}): FishingRound {
  const numericSeed = seedNumber(seed);
  const random = randomSequence(numericSeed);
  const difficulty = clamp(Number.isFinite(config.difficulty) ? config.difficulty! : 1, 0.65, 1.5);
  const biteDelay = 6 + random() * 4;
  const nibbleAt = 1.8 + random() * (biteDelay - 4);
  const nibbleDuration = 0.65 + random() * 0.25;
  const fishRhythm: readonly FishBeat[] = [
    { cue: 'rest', duration: 3.6 + random() * 1.4 },
    { cue: 'pull', duration: 3.2 + random() * 1.2 },
    { cue: 'surge-warning', duration: 1.1 },
    { cue: 'surge', duration: 2.1 + random() * 0.7 },
    { cue: 'rest', duration: 3.2 + random() * 1.6 },
    { cue: 'pull', duration: 2.8 + random() * 1.3 },
  ];
  return {
    seed: numericSeed, difficulty, phase: 'casting', elapsed: 0, phaseElapsed: 0, fightElapsed: 0,
    castStarted: false, castPower: 0, bobberCue: 'quiet', biteRemaining: 0,
    tension: 0.38, progress: 0, slackSeconds: 0,
    fishCue: 'rest', fishCueRemaining: fishRhythm[0].duration, reason: null,
    biteDelay, nibbleAt, nibbleDuration, biteWindow: 1.8 / Math.sqrt(difficulty), fishRhythm,
  };
}

function finish(round: FishingRound, phase: 'success' | 'failed' | 'cancelled', reason: FishingReason): FishingRound {
  return { ...round, phase, phaseElapsed: 0, reason, bobberCue: 'quiet', biteRemaining: 0 };
}

function rhythmAt(round: FishingRound, time: number): { cue: FishingFishCue; remaining: number } {
  const total = round.fishRhythm.reduce((sum, beat) => sum + beat.duration, 0);
  let offset = time % total;
  for (const beat of round.fishRhythm) {
    if (offset < beat.duration) return { cue: beat.cue, remaining: beat.duration - offset };
    offset -= beat.duration;
  }
  return { cue: 'rest', remaining: round.fishRhythm[0].duration };
}

/**
 * New button edges are consumed once, then mechanics advance in <= 1/60 s slices.
 * Invalid/negative dt is ignored. A long background frame advances at most 0.25 s;
 * the host should cancel the attempt on pagehide/visibility loss rather than run it in the background.
 */
export function stepFishingRound(round: FishingRound, dtSeconds: number, input: FishingInput): FishingRound {
  if (terminal(round.phase) || !Number.isFinite(dtSeconds) || dtSeconds < 0) return round;
  let next = round;
  if (next.phase === 'casting') {
    if (!next.castStarted && (input.pressed || input.held)) next = { ...next, castStarted: true };
    if (next.castStarted && (input.released || !input.held)) {
      if (next.castPower < FISHING_RULES.castMinimum) return finish(next, 'failed', 'short-cast');
      if (next.castPower > FISHING_RULES.castMaximum) return finish(next, 'failed', 'overcast');
      next = { ...next, phase: 'waiting', phaseElapsed: 0, bobberCue: 'quiet' };
    }
  } else if (next.phase === 'waiting' && input.pressed) {
    return finish(next, 'failed', 'early-hook');
  } else if (next.phase === 'bite' && input.pressed) {
    next = {
      ...next, phase: 'reeling', phaseElapsed: 0, bobberCue: 'quiet', biteRemaining: 0,
      tension: 0.38, progress: 0, slackSeconds: 0,
      fishCue: 'rest', fishCueRemaining: next.fishRhythm[0].duration,
    };
  }
  let remaining = Math.min(dtSeconds, FISHING_RULES.maximumFrameSeconds);
  while (remaining > 1e-9 && !terminal(next.phase)) {
    const dt = Math.min(remaining, 1 / 60);
    remaining -= dt;
    next = advance(next, dt, input.held);
  }
  return next;
}

function advance(round: FishingRound, dt: number, held: boolean): FishingRound {
  const elapsed = round.elapsed + dt;
  const phaseElapsed = round.phaseElapsed + dt;
  let next: FishingRound = { ...round, elapsed, phaseElapsed };
  if (elapsed >= FISHING_RULES.roundTimeLimitSeconds) return finish(next, 'failed', 'time-limit');
  if (round.phase === 'casting') {
    if (round.castStarted && held) {
      next = { ...next, castPower: clamp(round.castPower + dt * FISHING_RULES.castPowerPerSecond, 0, 1) };
      if (next.castPower >= 1) return finish(next, 'failed', 'overcast');
    }
    return next;
  }
  if (round.phase === 'waiting') {
    if (phaseElapsed >= round.biteDelay) {
      const overshoot = phaseElapsed - round.biteDelay;
      return { ...next, phase: 'bite', phaseElapsed: overshoot, bobberCue: 'bite', biteRemaining: round.biteWindow - overshoot };
    }
    return { ...next, bobberCue: phaseElapsed >= round.nibbleAt && phaseElapsed < round.nibbleAt + round.nibbleDuration ? 'nibble' : 'quiet' };
  }
  if (round.phase === 'bite') {
    next = { ...next, biteRemaining: Math.max(0, round.biteWindow - phaseElapsed) };
    return phaseElapsed >= round.biteWindow ? finish(next, 'failed', 'missed-bite') : next;
  }
  if (round.phase === 'reeling') {
    const beat = rhythmAt(round, round.phaseElapsed);
    const tensionSpeed = held
      ? { rest: 0.11, pull: 0.17, 'surge-warning': 0.22, surge: 0.40 }[beat.cue] * round.difficulty
      : { rest: -0.22, pull: -0.16, 'surge-warning': -0.18, surge: -0.08 }[beat.cue];
    const progressSpeed = held
      ? { rest: 0.047, pull: 0.036, 'surge-warning': 0.026, surge: 0.012 }[beat.cue] / Math.sqrt(round.difficulty)
      : -0.0025;
    const tension = clamp(round.tension + tensionSpeed * dt, 0, 1);
    const progress = clamp(round.progress + progressSpeed * dt, 0, 1);
    const slackSeconds = tension < FISHING_RULES.slackThreshold ? round.slackSeconds + dt : 0;
    const nextBeat = rhythmAt(round, phaseElapsed);
    next = { ...next, fightElapsed: phaseElapsed, tension, progress, slackSeconds, fishCue: nextBeat.cue, fishCueRemaining: nextBeat.remaining };
    if (tension >= 1) return finish(next, 'failed', 'line-broke');
    if (slackSeconds >= FISHING_RULES.slackGraceSeconds) return finish(next, 'failed', 'fish-escaped');
    if (progress >= 1) return finish(next, 'success', 'landed');
  }
  return next;
}

export function cancelFishingRound(round: FishingRound): FishingRound {
  return terminal(round.phase) ? round : finish(round, 'cancelled', 'cancelled');
}
