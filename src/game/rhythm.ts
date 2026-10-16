import { audio } from '../audio/audio';

/*
 * The beat game layered over the shooter, after Hi-Fi Rush: everything keeps time with the music.
 * Pressing fire, dash, reload or the skill on the beat is judged; on-beat actions build a streak that
 * adds damage, and a style meter (D to SS) that multiplies points and drains when nothing stylish happens.
 */

export type Grade = 'perfect' | 'good' | 'miss';
export type Rank = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS';

/** Timing windows, in milliseconds either side of the beat. */
export const PERFECT_MS = 70;
export const GOOD_MS = 140;

const RANKS: { id: Rank; at: number; mult: number; clear: number }[] = [
  { id: 'D', at: 0, mult: 1, clear: 50 },
  { id: 'C', at: 120, mult: 1.5, clear: 150 },
  { id: 'B', at: 300, mult: 2, clear: 300 },
  { id: 'A', at: 550, mult: 3, clear: 600 },
  { id: 'S', at: 850, mult: 4, clear: 1000 },
  { id: 'SS', at: 1200, mult: 5, clear: 1500 },
];
const STYLE_MAX = 1500;

interface Tally {
  judged: number;
  onBeat: number;
  hurt: number;
  maxStreak: number;
  maxRank: number;
}

const freshTally = (): Tally => ({ judged: 0, onBeat: 0, hurt: 0, maxStreak: 0, maxRank: 0 });

export class Rhythm {
  bpm = 90;
  /** Where the music is, in beats, as heard right now; the whole beat and how far into it (0-1). */
  pos = 0;
  beat = 0;
  phase = 0;
  /** True on the one frame a new beat starts. */
  onBeat = false;
  streak = 0;
  style = 0;
  /** The best style rank reached this run. */
  peak = 0;
  private sinceGain = 9;
  /** A stand-in clock for when no music is playing, counted in frames so it keeps the game's own time. */
  private quietPos = 0;
  private quietAt = performance.now();
  private tally = freshTally();

  /** Keep time with the music; call once a frame. */
  update(dt: number, bpm: number) {
    this.bpm = bpm;
    this.quietPos += (dt * bpm) / 60;
    this.quietAt = performance.now();
    const pos = this.posAt(performance.now());
    const b = Math.floor(pos);
    // A new level restarts the music: the count starts over without firing a beat.
    this.onBeat = b > this.beat && b - this.beat < 4;
    this.beat = b;
    this.pos = pos;
    this.phase = pos - b;
    this.sinceGain += dt;
    if (this.sinceGain > 1.5) this.style = Math.max(0, this.style - dt * (25 + this.rankIndex() * 18));
    this.tally.maxRank = Math.max(this.tally.maxRank, this.rankIndex());
    this.peak = Math.max(this.peak, this.rankIndex());
  }

  peakRank(): Rank {
    return RANKS[this.peak].id;
  }

  /** Beat position heard at a performance.now() time: the music's own clock, or the stand-in when it is silent. */
  posAt(perfMs: number): number {
    return audio.beatPos(perfMs) ?? this.quietPos + ((perfMs - this.quietAt) / 1000) * (this.bpm / 60);
  }

  judge(perfMs: number): { grade: Grade; ms: number } {
    const pos = this.posAt(perfMs);
    const ms = (pos - Math.round(pos)) * (60000 / this.bpm);
    const a = Math.abs(ms);
    return { grade: a <= PERFECT_MS ? 'perfect' : a <= GOOD_MS ? 'good' : 'miss', ms };
  }

  /** Book a judged action. Returns the points it scores. */
  act(grade: Grade): number {
    this.tally.judged++;
    if (grade === 'miss') {
      this.streak = 0;
      return 0;
    }
    this.tally.onBeat++;
    this.streak++;
    this.tally.maxStreak = Math.max(this.tally.maxStreak, this.streak);
    this.gain(grade === 'perfect' ? 45 : 25);
    return Math.round((grade === 'perfect' ? 30 : 15) * this.mult());
  }

  /** A kill feeds the meter (more on a long streak) and scores by the current rank. */
  kill(elite: boolean): number {
    const pts = Math.round((elite ? 60 : 10) * this.mult());
    this.gain(elite ? 60 : 14 + Math.min(this.streak, 10));
    return pts;
  }

  /** Getting hit breaks the streak and knocks the meter down by half. */
  hurt() {
    this.tally.hurt++;
    this.streak = 0;
    this.style *= 0.5;
  }

  private gain(n: number) {
    this.style = Math.min(STYLE_MAX, this.style + n);
    this.sinceGain = 0;
  }

  rankIndex(): number {
    let i = 0;
    for (let k = 0; k < RANKS.length; k++) if (this.style >= RANKS[k].at) i = k;
    return i;
  }

  rank(): Rank {
    return RANKS[this.rankIndex()].id;
  }

  mult(): number {
    return RANKS[this.rankIndex()].mult;
  }

  /** Progress from this rank to the next, 0-1. */
  gauge(): number {
    const i = this.rankIndex();
    const lo = RANKS[i].at;
    const hi = RANKS[i + 1]?.at ?? STYLE_MAX;
    return Math.min(1, (this.style - lo) / Math.max(1, hi - lo));
  }

  /** The streak's damage bonus: +2% a beat, up to +40%. */
  damageMult(): number {
    return 1 + Math.min(this.streak, 20) * 0.02;
  }

  startFight() {
    this.tally = freshTally();
    this.tally.maxRank = this.rankIndex();
  }

  /** Grade a won fight: the best rank reached, how much was on the beat, and how clean it was. */
  gradeFight(): { rank: Rank; points: number } {
    const t = this.tally;
    const acc = t.judged ? t.onBeat / t.judged : 0;
    const s = t.maxRank * 14 + acc * 20 + Math.min(t.maxStreak, 12) + (t.hurt === 0 ? 10 : -t.hurt * 8);
    const i = s >= 90 ? 5 : s >= 75 ? 4 : s >= 58 ? 3 : s >= 40 ? 2 : s >= 22 ? 1 : 0;
    return { rank: RANKS[i].id, points: RANKS[i].clear };
  }

  reset() {
    this.streak = 0;
    this.style = 0;
    this.peak = 0;
    this.tally = freshTally();
  }
}
