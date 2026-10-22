import * as Tone from 'tone';
import type { StyleKit } from '../styles/types';
import type { Delivery } from '../data/weapons';
import type { SpawnStyle } from '../data/enemies';
import { createBattleMusic } from './battleMusic';

/* Soft, modern synthesis only: sine / triangle / FM / filtered noise.
   No square waves, no 8-bit arpeggios. Everything goes through a compressor and limiter. */

type AnyInst = { dispose(): void };

/** A floor's music: the calm layer for walking about and the fight layer for locked rooms, crossfaded on one transport. */
interface LevelLayers {
  calm: Tone.Gain;
  battle: Tone.Gain;
  calmLive: boolean;
  battleLive: boolean;
  timer: number;
}

/** Moments in the side games and the hall, which have no game scene of their own. */
export type LifeSound = 'plant' | 'harvest' | 'craft' | 'cook' | 'pack' | 'deliver' | 'restore' | 'discover' | 'portal' | 'error';
/** The fishing round, cue by cue. */
export type FishSound = 'cast' | 'nibble' | 'bite' | 'hook' | 'reel' | 'surge' | 'catch' | 'escape';

class AudioEngine {
  ready = false;
  private initializing?: Promise<void>;
  muted = false;
  private silentDepth = 0;
  private readonly modeSuspensions = new Set<symbol>();

  /**
   * A mode owns its own lease. Releasing an old mode cannot unmute a newer one.
   * `keepMusic` only silences game sounds, so the hall can keep the home theme playing.
   */
  suspendForMode(keepMusic = false): () => void {
    const token = Symbol('audio-mode');
    this.modeSuspensions.add(token);
    if (!keepMusic) {
      Tone.getTransport().pause();
      Tone.getDestination().mute = true;
    }
    return () => {
      if (!this.modeSuspensions.delete(token) || this.modeSuspensions.size) return;
      Tone.getDestination().mute = this.muted;
      if (this.loops.length) Tone.getTransport().start();
    };
  }

  /** Run an isolated training scene without scheduling sounds or consuming sound throttles. */
  silently<T>(run: () => T): T {
    this.silentDepth++;
    try {
      return run();
    } finally {
      this.silentDepth--;
    }
  }
  private sfx!: Tone.Gain;
  private music!: Tone.Gain;
  private verb!: Tone.Reverb;
  private last: Record<string, number> = {};

  private pop!: Tone.MembraneSynth;
  private thump!: Tone.MembraneSynth;
  private hitNoise!: Tone.NoiseSynth;
  private hitFilter!: Tone.Filter;
  /** The crack at the front of a hit: a few milliseconds of bright noise. */
  private snap!: Tone.NoiseSynth;
  private snapFilter!: Tone.Filter;
  private bell!: Tone.PolySynth;
  private sparkle!: Tone.PolySynth;
  private boomNoise!: Tone.NoiseSynth;
  private boomFilter!: Tone.Filter;
  private sub!: Tone.MembraneSynth;
  private whoosh!: Tone.NoiseSynth;
  private whooshFilter!: Tone.Filter;
  private zap!: Tone.FMSynth;
  private growl!: Tone.FMSynth;
  // Spell fusion has voices of its own: its sounds are booked a second ahead and must not hold up the shared ones.
  private riseNoise!: Tone.NoiseSynth;
  private riseFilter!: Tone.Filter;
  private riseTone!: Tone.FMSynth;
  private fuseSub!: Tone.MembraneSynth;
  private fuseNoise!: Tone.NoiseSynth;
  private fuseFilter!: Tone.Filter;
  /** The music bus's low-pass: wide open, closed down while time slows. */
  private musicLP!: Tone.Filter;
  /** A second low-pass and gain on the music, for the pause page; kept apart so bullet time can't undo it. */
  private pauseLP!: Tone.Filter;
  private musicDuck!: Tone.Gain;
  private fuseBell!: Tone.PolySynth;
  /** Struck metal: gates, dropped guns, slides and latches. */
  private metal!: Tone.FMSynth;
  /** A soft falling blip for monster shots and a rising one for their wind-ups, kept off the player's own voices. */
  private chirp!: Tone.Synth;
  /** Glass and ice breaking. */
  private shard!: Tone.NoiseSynth;
  private shardFilter!: Tone.Filter;
  /** The XP gem's tick: short enough that a stream of gems never runs out of voices. */
  private tink!: Tone.PolySynth;
  /** Menu clicks: a tiny tick of noise and a note in the key. */
  private uiTick!: Tone.NoiseSynth;
  private uiTone!: Tone.PolySynth;
  /** When a menu last made a sound of its own, so the page-wide click doesn't double it. */
  private uiAt = -1;

  private kit?: StyleKit;
  /** Bus gains; the settings' 0-10 sliders map onto these (defaults 7 and 8 give the original mix). */
  private vol = { music: 0.42, sfx: 0.9 };
  private musicNodes: AnyInst[] = [];
  private loops: Tone.Loop[] = [];
  private intensity = 0;
  private scaleMidi: number[] = [];
  private bar = 0;
  private layers?: LevelLayers;
  /** Bumped whenever different music starts, so a delayed hand-over can tell it has been overtaken. */
  private musicGen = 0;
  /** The title screen wants its theme; it starts as soon as the first touch unlocks audio. */
  private homeWanted = false;
  private home?: { gain: Tone.Gain; nodes: AnyInst[] };

  /** Music and effect volume, each 0-10. Safe to call before the audio context exists. */
  setVolumes(music: number, sfx: number) {
    this.vol = { music: (music / 10) * 0.6, sfx: (sfx / 10) * 1.125 };
    if (!this.music || !this.sfx) return;
    // Settings must update the buses even while an external mode suppresses SFX.
    try {
      this.music.gain.rampTo(this.vol.music, 0.08);
      this.sfx.gain.rampTo(this.vol.sfx, 0.08);
    } catch { /* A closing audio context must not interrupt the settings page. */ }
  }

  init(): Promise<void> {
    if (this.ready) return Promise.resolve();
    // The first touch unlocks audio; a later menu confirmation shares the same setup.
    return this.initializing ??= this.initialize().catch((error) => {
      this.initializing = undefined;
      throw error;
    });
  }

  private async initialize() {
    await Tone.start();
    const limiter = new Tone.Limiter(-1.5).toDestination();
    const comp = new Tone.Compressor({ threshold: -20, ratio: 3.5, attack: 0.004, release: 0.18 }).connect(limiter);
    const master = new Tone.Gain(0.85).connect(comp);
    this.verb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 1 });
    await this.verb.generate();
    const verbSend = new Tone.Gain(0.22).connect(this.verb);
    this.verb.connect(master);
    this.sfx = new Tone.Gain(this.vol.sfx).connect(master);
    this.sfx.connect(verbSend);
    this.musicLP = new Tone.Filter({ frequency: 18000, type: 'lowpass', rolloff: -12 }).connect(master);
    this.pauseLP = new Tone.Filter({ frequency: 18000, type: 'lowpass', rolloff: -12 }).connect(this.musicLP);
    this.musicDuck = new Tone.Gain(1).connect(this.pauseLP);
    this.music = new Tone.Gain(this.vol.music).connect(this.musicDuck);
    this.music.connect(verbSend);

    this.pop = new Tone.MembraneSynth({ pitchDecay: 0.018, octaves: 2.5, envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.03 } }).connect(this.sfx);
    this.pop.volume.value = -20;
    this.thump = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 4, envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.05 } }).connect(this.sfx);
    this.thump.volume.value = -14;
    this.hitFilter = new Tone.Filter(3400, 'lowpass').connect(this.sfx);
    this.snapFilter = new Tone.Filter({ frequency: 3800, type: 'highpass', rolloff: -12 }).connect(this.sfx);
    this.snap = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.0005, decay: 0.022, sustain: 0, release: 0.008 } }).connect(this.snapFilter);
    this.snap.volume.value = -13;
    this.hitNoise = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 } }).connect(this.hitFilter);
    this.hitNoise.volume.value = -16;
    this.bell = new Tone.PolySynth({
      voice: Tone.FMSynth,
      maxPolyphony: 10,
      options: {
        harmonicity: 3.01,
        modulationIndex: 9,
        oscillator: { type: 'sine' },
        modulation: { type: 'sine' },
        envelope: { attack: 0.002, decay: 0.5, sustain: 0, release: 0.9 },
        modulationEnvelope: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.3 },
      },
    } as any).connect(this.sfx);
    this.bell.volume.value = -17;
    this.sparkle = new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: 8,
      options: { oscillator: { type: 'sine' }, envelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.15 } },
    } as any).connect(this.sfx);
    this.sparkle.volume.value = -19;
    this.boomFilter = new Tone.Filter(2600, 'lowpass').connect(this.sfx);
    this.boomNoise = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.002, decay: 0.45, sustain: 0, release: 0.2 } }).connect(this.boomFilter);
    this.boomNoise.volume.value = -6;
    this.sub = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 5, envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.2 } }).connect(this.sfx);
    this.sub.volume.value = -8;
    this.whooshFilter = new Tone.Filter({ frequency: 800, type: 'bandpass', Q: 1.2 }).connect(this.sfx);
    this.whoosh = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.02, decay: 0.16, sustain: 0, release: 0.08 } }).connect(this.whooshFilter);
    this.whoosh.volume.value = -12;
    this.zap = new Tone.FMSynth({ harmonicity: 5.5, modulationIndex: 18, envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.04 }, modulationEnvelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 } }).connect(this.hitFilter);
    this.zap.volume.value = -22;
    this.growl = new Tone.FMSynth({ harmonicity: 0.5, modulationIndex: 16, envelope: { attack: 0.12, decay: 1.2, sustain: 0, release: 0.4 }, modulationEnvelope: { attack: 0.2, decay: 1, sustain: 0, release: 0.3 } }).connect(this.sfx);
    this.growl.volume.value = -10;

    this.riseFilter = new Tone.Filter({ frequency: 300, type: 'bandpass', Q: 1.6 }).connect(this.sfx);
    this.riseNoise = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 1, decay: 0.01, sustain: 1, release: 0.03 } }).connect(this.riseFilter);
    this.riseNoise.volume.value = -13;
    this.riseTone = new Tone.FMSynth({
      harmonicity: 2,
      modulationIndex: 3,
      oscillator: { type: 'sine' },
      modulation: { type: 'triangle' },
      envelope: { attack: 1, decay: 0.01, sustain: 1, release: 0.04 },
      modulationEnvelope: { attack: 1, decay: 0.01, sustain: 1, release: 0.04 },
    } as any).connect(this.sfx);
    this.riseTone.volume.value = -19;
    this.fuseSub = new Tone.MembraneSynth({ pitchDecay: 0.12, octaves: 6, envelope: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.3 } }).connect(this.sfx);
    this.fuseSub.volume.value = -5;
    this.fuseFilter = new Tone.Filter(6000, 'lowpass').connect(this.sfx);
    this.fuseNoise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.3 } }).connect(this.fuseFilter);
    this.fuseNoise.volume.value = -12;
    this.fuseBell = new Tone.PolySynth({
      voice: Tone.FMSynth,
      maxPolyphony: 8,
      options: {
        harmonicity: 2.01,
        modulationIndex: 6,
        oscillator: { type: 'sine' },
        modulation: { type: 'sine' },
        envelope: { attack: 0.004, decay: 1.4, sustain: 0.08, release: 1.6 },
        modulationEnvelope: { attack: 0.004, decay: 0.6, sustain: 0, release: 0.5 },
      },
    } as any).connect(this.sfx);
    this.fuseBell.volume.value = -13;

    this.metal = new Tone.FMSynth({
      harmonicity: 3.7,
      modulationIndex: 18,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 },
      modulationEnvelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.1 },
    } as any).connect(this.sfx);
    this.metal.volume.value = -17;
    this.chirp = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.002, decay: 0.09, sustain: 0, release: 0.03 } }).connect(this.hitFilter);
    this.chirp.volume.value = -21;
    this.shardFilter = new Tone.Filter({ frequency: 5200, type: 'highpass', rolloff: -12 }).connect(this.sfx);
    this.shard = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.08 } }).connect(this.shardFilter);
    this.shard.volume.value = -15;
    this.tink = new Tone.PolySynth({
      voice: Tone.FMSynth,
      maxPolyphony: 6,
      options: {
        harmonicity: 4.01,
        modulationIndex: 3,
        oscillator: { type: 'sine' },
        modulation: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 },
        modulationEnvelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.04 },
      },
    } as any).connect(this.sfx);
    this.tink.volume.value = -15;
    const uiTickFilter = new Tone.Filter({ frequency: 3000, type: 'bandpass', Q: 1.5 }).connect(this.sfx);
    this.uiTick = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.0005, decay: 0.012, sustain: 0, release: 0.005 } }).connect(uiTickFilter);
    this.uiTick.volume.value = -17;
    this.uiTone = new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: 6,
      options: { oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.05 } },
    } as any).connect(this.sfx);
    this.uiTone.volume.value = -15;

    this.ready = true;
    if (this.kit) this.setStyle(this.kit);
    else if (this.homeWanted) this.playHome();
  }

  /** `ui` sounds belong to menus and pages, which keep working while a mode has silenced the game. */
  private gate(key: string, ms: number, ui = false): boolean {
    if (this.silentDepth || (!ui && this.modeSuspensions.size)) return false;
    const now = performance.now();
    if ((this.last[key] ?? 0) + ms > now) return false;
    this.last[key] = now;
    return true;
  }

  private note(i: number, octave = 0): number {
    const s = this.scaleMidi.length ? this.scaleMidi : [60, 62, 64, 67, 69];
    const n = s.length;
    const k = ((i % n) + n) % n;
    const o = Math.floor(i / n) + octave;
    return Tone.Frequency(s[k] + o * 12, 'midi').toFrequency();
  }

  setMuted(m: boolean) {
    this.muted = m;
    Tone.getDestination().mute = m || this.modeSuspensions.size > 0;
  }

  // ---------- SFX ----------
  private tm = new Map<object, number>();

  /** Monophonic Tone voices need strictly increasing start times, so two sounds in one frame must not share one. */
  private at(inst: object, offset = 0): number {
    const t = Math.max(Tone.now() + offset, (this.tm.get(inst) ?? 0) + 0.006);
    this.tm.set(inst, t);
    return t;
  }

  /** Audio must never break a game frame. */
  private safe(fn: () => void, ui = false) {
    if (!this.ready || this.silentDepth || (!ui && this.modeSuspensions.size)) return;
    try {
      fn();
    } catch {
      // A dropped sound is fine; a thrown frame is not.
    }
  }

  /** Bullet time: the music sinks as if under water, holds, and surfaces again, with one long soft breath of air. */
  slowmo(hold: number, out: number) {
    this.safe(() => {
      const f = this.musicLP.frequency;
      const t = Tone.now();
      f.cancelScheduledValues(t);
      f.setValueAtTime(Math.max(400, Number(f.value)), t);
      f.exponentialRampToValueAtTime(520, t + 0.14);
      f.setValueAtTime(520, t + 0.14 + hold);
      f.exponentialRampToValueAtTime(18000, t + 0.14 + hold + out);
      const w = this.at(this.whoosh);
      this.sweep(this.whooshFilter, 2600, 240, w, 0.55);
      this.whoosh.triggerAttackRelease(0.55, w, 0.5);
      this.thump.triggerAttackRelease('C1', 0.4, this.at(this.thump), 0.5);
    });
  }

  private sweep(filter: Tone.Filter, from: number, to: number, t: number, dur: number) {
    filter.frequency.cancelScheduledValues(t);
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  }

  shoot(kind: Delivery) {
    this.safe(() => {
      switch (kind) {
        case 'bolt':
          if (!this.gate('bolt', 60)) return;
          this.pop.triggerAttackRelease(this.note(Math.floor(Math.random() * 3), 2), 0.05, this.at(this.pop), 0.6);
          break;
        case 'spread':
          if (!this.gate('spread', 90)) return;
          this.thump.triggerAttackRelease('A1', 0.1, this.at(this.thump), 0.7);
          this.hitNoise.triggerAttackRelease(0.06, this.at(this.hitNoise), 0.8);
          break;
        case 'beam': {
          if (!this.gate('beam', 90)) return;
          this.bell.triggerAttackRelease(this.note(4, 2), 0.18, Tone.now(), 0.45);
          const t = this.at(this.whoosh);
          this.sweep(this.whooshFilter, 3200, 900, t, 0.15);
          this.whoosh.triggerAttackRelease(0.12, t, 0.6);
          break;
        }
        case 'mortar':
          if (!this.gate('mortar', 120)) return;
          this.thump.triggerAttackRelease('D2', 0.12, this.at(this.thump), 0.8);
          break;
        case 'boomerang': {
          if (!this.gate('boomerang', 120)) return;
          const t = this.at(this.whoosh);
          this.sweep(this.whooshFilter, 500, 2400, t, 0.2);
          this.whoosh.triggerAttackRelease(0.2, t, 0.7);
          break;
        }
        case 'chain':
          if (!this.gate('chain', 80)) return;
          this.zap.triggerAttackRelease(this.note(2, 2), 0.08, this.at(this.zap), 0.8);
          break;
        case 'rocket': {
          if (!this.gate('rocket', 150)) return;
          this.thump.triggerAttackRelease('F1', 0.16, this.at(this.thump), 0.9);
          const t = this.at(this.whoosh);
          this.sweep(this.whooshFilter, 300, 1800, t, 0.3);
          this.whoosh.triggerAttackRelease(0.3, t, 0.8);
          break;
        }
        case 'flame': {
          if (!this.gate('flame', 110)) return;
          const t = this.at(this.whoosh);
          this.sweep(this.whooshFilter, 900, 500, t, 0.12);
          this.whoosh.triggerAttackRelease(0.12, t, 0.35);
          break;
        }
        case 'slash': {
          if (!this.gate('slash', 90)) return;
          const t = this.at(this.whoosh);
          this.sweep(this.whooshFilter, 2600, 700, t, 0.12);
          this.whoosh.triggerAttackRelease(0.1, t, 0.9);
          break;
        }
      }
    });
  }

  /**
   * A hit lands: a bright crack up front (its pitch wanders a little so a burst of hits never sounds like a machine),
   * a short body under it, and a punch that drops in pitch. Heavy blows punch deeper; crits ring.
   */
  hit(crit: boolean, heavy = false) {
    if (!this.gate('hit', 28)) return;
    this.safe(() => {
      const t = this.at(this.snap);
      this.snapFilter.frequency.setValueAtTime(3000 + Math.random() * 2200, t);
      this.snap.triggerAttackRelease(0.02, t, crit ? 1 : 0.8);
      this.hitNoise.triggerAttackRelease(0.035, this.at(this.hitNoise), crit ? 0.9 : 0.6);
      this.thump.triggerAttackRelease(heavy ? 'G2' : crit ? 'E3' : 'C3', 0.06, this.at(this.thump), heavy ? 0.85 : crit ? 0.8 : 0.55);
      if (crit && this.gate('crit', 70)) this.bell.triggerAttackRelease(this.note(7 + Math.floor(Math.random() * 3), 1), 0.12, Tone.now(), 0.55);
    });
  }

  block() {
    if (!this.gate('block', 50)) return;
    this.safe(() => this.bell.triggerAttackRelease(this.note(9, 1), 0.06, Tone.now(), 0.4));
  }

  kill(combo: number) {
    if (!this.gate('kill', 35)) return;
    this.safe(() => this.pop.triggerAttackRelease(this.note(Math.min(combo, 14), 1), 0.08, this.at(this.pop), 0.9));
  }

  /** An explosion; `level` (0-1) turns down the ones that come often, like meteors, kegs and reactions. */
  explode(big = false, level = 1) {
    if (!this.gate('boom', 60)) return;
    this.safe(() => {
      const t = this.at(this.boomNoise);
      // Quieter ones are darker too, so they sit under the fight instead of on top of it.
      const bright = 0.45 + 0.55 * level;
      this.sweep(this.boomFilter, (big ? 3200 : 2400) * bright, 160, t, big ? 0.7 : 0.4);
      this.boomNoise.triggerAttackRelease(big ? 0.7 : 0.38, t, (big ? 1 : 0.75) * level);
      this.sub.triggerAttackRelease(big ? 'C1' : 'G1', big ? 0.6 : 0.35, this.at(this.sub), (big ? 1 : 0.8) * level);
    });
  }

  /** An XP gem soaked up: a glassy tick over a soft sparkle, climbing the scale while the gems keep coming. */
  pickup(streak: number) {
    if (!this.gate('pickup', 30)) return;
    this.safe(() => {
      const t = Tone.now();
      const f = this.note(2 + (streak % 10), 2);
      this.tink.triggerAttackRelease(f, 0.05, t, 0.8);
      this.sparkle.triggerAttackRelease(f, 0.08, t, 0.85);
    });
  }

  /** Swapping guns: a short swish and a catch. */
  swap() {
    this.safe(() => {
      if (!this.gate('swap', 100)) return;
      const t = this.at(this.whoosh);
      this.sweep(this.whooshFilter, 1400, 3200, t, 0.08);
      this.whoosh.triggerAttackRelease(0.07, t, 0.45);
      this.pop.triggerAttackRelease('E5', 0.025, this.at(this.pop), 0.3);
    });
  }

  /** A soft mechanical click: the magazine out, or the slide racked back when it is done. */
  reload(done: boolean) {
    this.safe(() => {
      if (!this.gate(done ? 'reload-done' : 'reload', 120)) return;
      if (done) {
        this.pop.triggerAttackRelease('A4', 0.03, this.at(this.pop), 0.35);
        this.hitNoise.triggerAttackRelease(0.03, this.at(this.hitNoise), 0.25);
      } else this.thump.triggerAttackRelease('E3', 0.05, this.at(this.thump), 0.3);
    });
  }

  levelUp() {
    this.safe(() => {
      const t = Tone.now();
      [0, 2, 4, 7].forEach((d, i) => this.bell.triggerAttackRelease(this.note(d, 1), 0.5, t + i * 0.07, 0.6));
    });
  }

  /**
   * Spell fusion: a riser that swells for `gather` seconds, with notes climbing closer and closer together,
   * then lands on a deep boom, a crash and a bright chord. Booked on the audio clock itself rather than
   * Tone's look-ahead clock, so the landing hits on the same frame as the flash the scene schedules.
   */
  fusion(gather: number) {
    this.safe(() => {
      const t0 = Tone.getContext().currentTime + 0.02;
      const t1 = t0 + gather;
      this.riseNoise.envelope.attack = gather * 0.9;
      this.sweep(this.riseFilter, 260, 7000, t0, gather);
      this.riseNoise.triggerAttack(t0, 0.9);
      this.riseNoise.triggerRelease(t1);
      this.riseTone.envelope.attack = gather * 0.8;
      this.riseTone.triggerAttack(this.note(0, -1), t0, 0.7);
      this.riseTone.frequency.exponentialRampToValueAtTime(this.note(0, 2), t1);
      this.riseTone.triggerRelease(t1);
      const n = 12;
      for (let i = 0; i < n; i++) {
        const q = i / n;
        this.sparkle.triggerAttackRelease(this.note(i, 1), 0.06, t0 + gather * (1 - (1 - q) ** 1.7), 0.3 + q * 0.5);
      }
      // Let the music step back while it builds, and come home after the landing.
      const g = this.music.gain;
      g.cancelScheduledValues(t0);
      g.setValueAtTime(this.vol.music, t0);
      g.linearRampToValueAtTime(this.vol.music * 0.3, t0 + 0.3);
      g.setValueAtTime(this.vol.music * 0.3, t1 + 0.3);
      g.linearRampToValueAtTime(this.vol.music, t1 + 1.3);

      this.fuseSub.triggerAttackRelease('C1', 0.8, t1, 1);
      this.sweep(this.fuseFilter, 7000, 180, t1, 1);
      this.fuseNoise.triggerAttackRelease(0.9, t1, 0.9);
      [0, 2, 4, 5, 7, 9].forEach((d, i) => this.fuseBell.triggerAttackRelease(this.note(d, 1), 1.6, t1 + i * 0.012, 0.75));
      [9, 7, 5, 4, 2].forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(d, 2), 0.1, t1 + 0.18 + i * 0.07, 0.5));
    });
  }

  select() {
    this.uiAt = performance.now();
    this.safe(() => {
      const t = Tone.now();
      this.bell.triggerAttackRelease(this.note(4, 1), 0.3, t, 0.5);
      this.bell.triggerAttackRelease(this.note(7, 1), 0.4, t + 0.06, 0.45);
    }, true);
  }

  hover() {
    this.uiAt = performance.now();
    if (!this.gate('hover', 60, true)) return;
    this.safe(() => this.pop.triggerAttackRelease(this.note(4, 2), 0.03, this.at(this.pop), 0.3), true);
  }

  /** True when a menu has made a sound of its own since `perfMs`. */
  uiSince(perfMs: number): boolean {
    return this.uiAt >= perfMs;
  }

  /** Any button pressed: a crisp tick and a note in the key, lower for the ones that go back or close. */
  uiClick(back = false) {
    this.uiAt = performance.now();
    if (!this.gate('ui-click', 45, true)) return;
    this.safe(() => {
      this.uiTick.triggerAttackRelease(0.01, this.at(this.uiTick), 0.9);
      this.uiTone.triggerAttackRelease(this.note(back ? 0 : 4, 1), 0.05, Tone.now(), 0.55);
      if (!back) this.uiTone.triggerAttackRelease(this.note(7, 1), 0.05, Tone.now() + 0.035, 0.35);
    }, true);
  }

  /** A press that can't go through (no materials, not ready): two low notes that fall. */
  uiError() {
    this.uiAt = performance.now();
    if (!this.gate('ui-error', 150, true)) return;
    this.safe(() => {
      const t = Tone.now();
      this.uiTone.triggerAttackRelease(this.note(1, 0), 0.08, t, 0.6);
      this.uiTone.triggerAttackRelease(this.note(0, -1), 0.12, t + 0.08, 0.6);
      this.thump.triggerAttackRelease('C2', 0.06, this.at(this.thump), 0.3);
    }, true);
  }

  dash() {
    if (!this.gate('dash', 80)) return;
    this.safe(() => {
      const t = this.at(this.whoosh);
      this.sweep(this.whooshFilter, 400, 2800, t, 0.16);
      this.whoosh.triggerAttackRelease(0.16, t, 0.9);
    });
  }

  /** The knight is hit. When the armor takes all of it, it cracks like glass instead of landing as a body blow. */
  hurt(armorOnly = false) {
    if (!this.gate('hurt', 120)) return;
    this.safe(() => {
      if (armorOnly) {
        this.shard.triggerAttackRelease(0.12, this.at(this.shard), 0.8);
        this.metal.triggerAttackRelease('E4', 0.08, this.at(this.metal), 0.35);
        this.thump.triggerAttackRelease('A2', 0.08, this.at(this.thump), 0.6);
        return;
      }
      this.sub.triggerAttackRelease('E1', 0.3, this.at(this.sub), 0.9);
      const t = this.at(this.boomNoise);
      this.sweep(this.boomFilter, 700, 300, t, 0.2);
      this.boomNoise.triggerAttackRelease(0.18, t, 0.5);
      this.music.gain.cancelScheduledValues(t);
      this.music.gain.setValueAtTime(this.vol.music * 0.35, t);
      this.music.gain.linearRampToValueAtTime(this.vol.music, t + 0.8);
    });
  }

  /** The gates sink back into the floor: stone grinding down under a rising run. */
  door() {
    this.safe(() => {
      const t = Tone.now();
      const w = this.at(this.whoosh);
      this.sweep(this.whooshFilter, 1400, 260, w, 0.4);
      this.whoosh.triggerAttackRelease(0.4, w, 0.5);
      this.thump.triggerAttackRelease('D2', 0.15, this.at(this.thump), 0.45);
      [0, 4, 7, 11].forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(d, 1), 0.3, t + i * 0.09, 0.6));
    });
  }

  /**
   * The gates slam shut on a fight: iron on stone, a deep hit and a spray of grit. It is also the downbeat the fight
   * music comes in on.
   */
  lockdown() {
    this.safe(() => {
      this.metal.triggerAttackRelease('A1', 0.35, this.at(this.metal), 0.9);
      this.metal.triggerAttackRelease('D2', 0.3, this.at(this.metal, 0.09), 0.55);
      this.sub.triggerAttackRelease('D1', 0.5, this.at(this.sub), 1);
      const t = this.at(this.boomNoise);
      this.sweep(this.boomFilter, 2200, 200, t, 0.35);
      this.boomNoise.triggerAttackRelease(0.3, t, 0.6);
    });
  }

  /** A guardian gathering a move: air drawn in, rising under it, then let go in one push. */
  bossGather(dur: number) {
    if (!this.gate('bossGather', 250)) return;
    this.safe(() => {
      const t0 = this.at(this.riseNoise, 0.02);
      this.riseNoise.envelope.attack = dur * 0.8;
      this.sweep(this.riseFilter, 220, 1900, t0, dur);
      this.riseNoise.triggerAttack(t0, 0.55);
      this.riseNoise.triggerRelease(t0 + dur);
      // Nothing may start this noise again before it has been let go.
      this.tm.set(this.riseNoise, t0 + dur);
      const t = this.at(this.whoosh, dur + 0.02);
      this.sweep(this.whooshFilter, 2600, 500, t, 0.22);
      this.whoosh.triggerAttackRelease(0.22, t, 0.7);
      this.thump.triggerAttackRelease('G1', 0.14, this.at(this.thump, dur + 0.02), 0.6);
    });
  }

  /** Cards dealt onto the table: a soft flick for each, a beat apart. */
  deal(n: number) {
    this.uiAt = performance.now();
    this.safe(() => {
      for (let i = 0; i < n; i++) {
        const t = this.at(this.whoosh, i * 0.09);
        this.sweep(this.whooshFilter, 1800, 4200, t, 0.06);
        this.whoosh.triggerAttackRelease(0.06, t, 0.45);
      }
    }, true);
  }

  /** A card taken: a bright rising chime. */
  cardPick() {
    this.uiAt = performance.now();
    this.safe(() => {
      const t = Tone.now();
      [0, 4, 7, 12].forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(d, 2), 0.18, t + i * 0.05, 0.7));
    }, true);
  }

  /** A heavy footfall. */
  step() {
    if (!this.gate('step', 150)) return;
    this.safe(() => this.thump.triggerAttackRelease('C1', 0.1, this.at(this.thump), 0.35));
  }

  roar() {
    this.safe(() => this.growl.triggerAttackRelease('A1', 1.1, this.at(this.growl), 1));
    this.explode(true);
  }

  // ---------- Music ----------
  /**
   * A floor's music, in two layers on one transport and tempo: the calm one (a pad and a sparse lead in the floor's
   * key) while the knight walks about, and the fight one (see battleMusic.ts) while a room is locked. setIntensity
   * crossfades between them; both keep the same bar, so the beat game never loses its clock.
   */
  setStyle(kit: StyleKit) {
    this.kit = kit;
    this.homeWanted = false;
    if (!this.ready) return;
    this.stopMusic();
    this.muffle(false, true);
    const root = Tone.Frequency(kit.audio.root).toMidi();
    this.scaleMidi = kit.audio.scale.map((s) => root + s);
    const transport = Tone.getTransport();
    transport.bpm.value = kit.audio.bpm;

    const fight = this.intensity > 0;
    const layers: LevelLayers = {
      calm: new Tone.Gain(fight ? 0 : 1).connect(this.music),
      battle: new Tone.Gain(fight ? 1 : 0).connect(this.music),
      calmLive: !fight,
      battleLive: fight,
      timer: 0,
    };
    this.layers = layers;
    this.musicNodes.push(layers.calm, layers.battle);

    const cutoff = 600 + 2600 * kit.audio.brightness;
    const lp = new Tone.Filter(cutoff, 'lowpass').connect(layers.calm);
    this.musicNodes.push(lp);

    const pad = new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: 6,
      options: { oscillator: { type: 'triangle' }, envelope: { attack: 0.9, decay: 0.5, sustain: 0.6, release: 2.2 } },
    } as any).connect(lp);
    pad.volume.value = -22;
    this.musicNodes.push(pad);

    const lead = this.makeLead(kit, lp);
    const n = kit.audio.scale.length;
    const progression = n >= 7 ? [0, 5, 3, 4] : [0, 3, 1, 4];
    const chordOf = (degree: number) => [0, 2, 4].map((s) => this.scaleMidi[(degree + s) % n] + (degree + s >= n ? 12 : 0) - 12);
    let step = 0;

    const loop = new Tone.Loop((time) => {
      try {
        if (!layers.calmLive) return;
        const beat = step % 8;
        const degree = progression[this.bar % progression.length];
        if (beat === 0) {
          const chord = chordOf(degree).map((m) => Tone.Frequency(m, 'midi').toFrequency());
          pad.triggerAttackRelease(chord, '1m', time, 0.5);
        }
        if (Math.random() < 0.4) {
          const chordTones = [0, 2, 4, 7, 9];
          const idx = degree + chordTones[Math.floor(Math.random() * chordTones.length)] + (Math.random() < 0.3 ? n : 0);
          lead(idx, time);
        }
      } catch {
        // After a stall the clock fires overdue steps all at "now", and a synth can't restart at its own start
        // time: that note is dropped.
      } finally {
        step++;
        if (step % 8 === 0) this.bar++;
      }
    }, '8n').start(0);
    this.loops.push(loop);

    const battle = createBattleMusic(kit, layers.battle, () => this.intensity, () => layers.battleLive);
    this.musicNodes.push(...battle.nodes);
    this.loops.push(battle.loop);
    if (!this.modeSuspensions.size) transport.start();
  }

  /**
   * The title screen's theme: a slow lyre and a glass melody over a warm pad in D minor, eight bars that loop.
   * It fades in, and fades out when a run's music takes over.
   */
  playHome() {
    this.homeWanted = true;
    this.kit = undefined;
    if (!this.ready) return;
    this.muffle(false, true);
    if (this.home) return;
    this.stopMusic();
    // Menu sounds borrow the theme's key, D minor.
    this.scaleMidi = [62, 64, 65, 67, 69, 70, 72];
    try {
      this.startHome();
    } catch {
      // No theme is better than a broken menu.
    }
  }

  private startHome() {
    const transport = Tone.getTransport();
    transport.bpm.value = 72;
    const gain = new Tone.Gain(0).connect(this.music);
    gain.gain.rampTo(1, 2.5);
    const nodes: AnyInst[] = [gain];
    this.home = { gain, nodes };

    const lp = new Tone.Filter(2600, 'lowpass').connect(gain);
    const pad = new Tone.PolySynth({
      voice: Tone.Synth,
      maxPolyphony: 8,
      options: { oscillator: { type: 'triangle' }, envelope: { attack: 1.2, decay: 0.8, sustain: 0.55, release: 2.6 } },
    } as any).connect(lp);
    pad.volume.value = -24;
    const lyre = [0, 1, 2].map(() => {
      const p = new Tone.PluckSynth({ attackNoise: 0.8, dampening: 3200, resonance: 0.95 }).connect(lp);
      p.volume.value = -12;
      return p;
    });
    const glass = new Tone.PolySynth({
      voice: Tone.FMSynth,
      maxPolyphony: 4,
      options: {
        harmonicity: 3.01,
        modulationIndex: 2.2,
        oscillator: { type: 'sine' },
        modulation: { type: 'sine' },
        envelope: { attack: 0.02, decay: 1.6, sustain: 0.25, release: 1.8 },
        modulationEnvelope: { attack: 0.01, decay: 0.5, sustain: 0.1, release: 0.6 },
      },
    } as any).connect(gain);
    glass.volume.value = -19;
    const bass = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.08, decay: 0.6, sustain: 0.5, release: 1.4 } }).connect(gain);
    bass.volume.value = -17;
    nodes.push(lp, pad, ...lyre, glass, bass);

    const midi = (n: string) => Tone.Frequency(n).toMidi();
    const hz = (m: number) => Tone.Frequency(m, 'midi').toFrequency();
    // Dm  Bb  F  C  Dm  Gm  Bb  A: each bar's chord, from its bass note up.
    const bars = [
      ['D2', 'D3', 'F3', 'A3'],
      ['A#1', 'D3', 'F3', 'A#3'],
      ['F2', 'C3', 'F3', 'A3'],
      ['C2', 'C3', 'E3', 'G3'],
      ['D2', 'D3', 'F3', 'A3'],
      ['G1', 'D3', 'G3', 'A#3'],
      ['A#1', 'D3', 'F3', 'A#3'],
      ['A1', 'C#3', 'E3', 'A3'],
    ].map((b) => b.map(midi));
    // [eighth in the bar, note, length in eighths]
    const melody: [number, string, number][][] = [
      [[0, 'A4', 3], [3, 'D5', 1], [4, 'F5', 4]],
      [[0, 'D5', 2], [2, 'C5', 2], [4, 'A#4', 4]],
      [[0, 'A4', 3], [3, 'C5', 1], [4, 'F5', 2], [6, 'E5', 2]],
      [[0, 'E5', 4], [4, 'C5', 2], [6, 'G4', 2]],
      [[0, 'A4', 3], [3, 'D5', 1], [4, 'F5', 2], [6, 'A5', 2]],
      [[0, 'G5', 3], [3, 'F5', 1], [4, 'D5', 4]],
      [[0, 'F5', 2], [2, 'E5', 2], [4, 'D5', 2], [6, 'C5', 2]],
      [[0, 'E5', 3], [3, 'D5', 1], [4, 'C#5', 4]],
    ];
    // The lyre walks the chord once per beat: low, middle, high, middle.
    const walk = [1, 2, 3, 2];
    const eighth = Tone.Time('8n').toSeconds();
    let step = 0;
    let pluck = 0;
    const loop = new Tone.Loop((time) => {
      try {
        const bar = Math.floor(step / 8) % bars.length;
        const beat = step % 8;
        const chord = bars[bar];
        // The first pass is the lyre and pad alone, so the melody enters on the second.
        const sing = step >= 64;
        if (beat === 0) {
          pad.triggerAttackRelease(chord.slice(1).map((m) => hz(m + 12)), '1m', time, 0.5);
          bass.triggerAttackRelease(hz(chord[0]), eighth * 7, time, 0.6);
        }
        if (beat % 2 === 0) {
          const m = chord[walk[beat / 2]] + (beat === 4 ? 12 : 0);
          lyre[pluck++ % lyre.length].triggerAttack(hz(m), time);
        } else if (!sing && beat === 7) {
          lyre[pluck++ % lyre.length].triggerAttack(hz(chord[1] + 12), time);
        }
        if (sing) {
          for (const [at, n, len] of melody[bar]) if (at === beat) glass.triggerAttackRelease(n, eighth * len, time, 0.55);
        }
      } catch {
        // An overdue step after a stall is dropped, as in the level music.
      }
      step++;
    }, '8n').start(0);
    this.loops.push(loop);
    transport.start();
  }

  /** Let the title theme ring out under a fade; its loop has already stopped with the transport. */
  private fadeHome() {
    const home = this.home;
    if (!home) return;
    this.home = undefined;
    try {
      home.gain.gain.cancelScheduledValues(Tone.now());
      home.gain.gain.rampTo(0, 0.8);
    } catch {
      // Disposed below either way.
    }
    setTimeout(() => home.nodes.forEach((n) => n.dispose()), 1500);
  }

  private makeLead(kit: StyleKit, out: Tone.ToneAudioNode): (idx: number, time: number) => void {
    switch (kit.audio.lead) {
      case 'pluck': {
        const voices = [0, 1, 2].map(() => {
          const p = new Tone.PluckSynth({ attackNoise: 1.2, dampening: 2600 + kit.audio.brightness * 2400, resonance: 0.92 }).connect(out);
          p.volume.value = -9;
          this.musicNodes.push(p);
          return p;
        });
        let i = 0;
        return (idx, time) => voices[i++ % voices.length].triggerAttack(this.note(idx, 1), time);
      }
      case 'bell':
      case 'glass': {
        const glass = kit.audio.lead === 'glass';
        const b = new Tone.PolySynth({
          voice: Tone.FMSynth,
          maxPolyphony: 6,
          options: {
            harmonicity: glass ? 7.01 : 3.01,
            modulationIndex: glass ? 2.5 : 5,
            envelope: { attack: 0.003, decay: 0.7, sustain: 0, release: 1 },
            modulationEnvelope: { attack: 0.003, decay: 0.3, sustain: 0, release: 0.4 },
          },
        } as any).connect(out);
        b.volume.value = -20;
        this.musicNodes.push(b);
        return (idx, time) => b.triggerAttackRelease(this.note(idx, 1), '8n', time, 0.6);
      }
      case 'marimba':
      default: {
        const m = new Tone.PolySynth({
          voice: Tone.Synth,
          maxPolyphony: 6,
          options: { oscillator: { type: 'sine' }, envelope: { attack: 0.002, decay: 0.28, sustain: 0, release: 0.2 } },
        } as any).connect(out);
        m.volume.value = -15;
        this.musicNodes.push(m);
        return (idx, time) => m.triggerAttackRelease(this.note(idx, 1), '16n', time, 0.7);
      }
    }
  }

  /**
   * Where the music is, in beats, as heard at a performance.now() time: the transport's position at the moment
   * that sound leaves the speakers. Undefined while the music is not playing.
   */
  beatPos(perfMs: number): number | undefined {
    if (!this.ready || !this.kit) return undefined;
    const transport = Tone.getTransport();
    if (transport.state !== 'started') return undefined;
    const raw = Tone.getContext().rawContext as AudioContext;
    if (raw.state !== 'running') return undefined;
    let t: number;
    const ts = raw.getOutputTimestamp?.();
    if (ts && ts.contextTime && ts.performanceTime) t = ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    else t = raw.currentTime - (raw.outputLatency || raw.baseLatency || 0) + (perfMs - performance.now()) / 1000;
    return (transport.getSecondsAtTime(t) * transport.bpm.value) / 60;
  }

  /** An action landed on the beat: a note in the key, brighter for a perfect one. */
  beatHit(perfect: boolean) {
    this.safe(() => {
      if (!this.gate('beat', 60)) return;
      const t = Tone.now();
      this.sparkle.triggerAttackRelease(this.note(perfect ? 7 : 4, 2), 0.09, t, perfect ? 0.75 : 0.45);
      if (perfect) this.bell.triggerAttackRelease(this.note(9, 1), 0.2, t + 0.01, 0.35);
    });
  }

  /**
   * A monster arrives; each way of arriving has its own sound. Many arrive at once in a wave, so each sound
   * is gated: the first of a kind plays and the rest of that instant ride on it.
   */
  spawn(style: SpawnStyle) {
    if (!this.gate(`spawn-${style}`, 110)) return;
    this.safe(() => {
      const t = Tone.now();
      switch (style) {
        case 'ooze': {
          this.pop.triggerAttackRelease(this.note(0, 0), 0.12, this.at(this.pop), 0.5);
          const n = this.at(this.hitNoise);
          this.hitNoise.triggerAttackRelease(0.08, n, 0.35);
          break;
        }
        case 'swoop': {
          const n = this.at(this.whoosh);
          this.sweep(this.whooshFilter, 2600, 500, n, 0.22);
          this.whoosh.triggerAttackRelease(0.22, n, 0.55);
          break;
        }
        case 'burrow':
          this.thump.triggerAttackRelease('C2', 0.16, this.at(this.thump), 0.6);
          this.hitNoise.triggerAttackRelease(0.12, this.at(this.hitNoise), 0.45);
          break;
        case 'smoke': {
          const n = this.at(this.whoosh);
          this.sweep(this.whooshFilter, 600, 3800, n, 0.14);
          this.whoosh.triggerAttackRelease(0.14, n, 0.6);
          break;
        }
        case 'bones':
          [0, 0.06, 0.11].forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(9 - i, 2), 0.03, t + d, 0.4));
          break;
        case 'mist':
          this.bell.triggerAttackRelease(this.note(2, 0), 0.6, t, 0.25);
          this.bell.triggerAttackRelease(this.note(1, 0) * 1.01, 0.6, t + 0.08, 0.2);
          break;
        case 'slam':
          this.sub.triggerAttackRelease('A1', 0.25, this.at(this.sub), 0.7);
          this.bell.triggerAttackRelease(this.note(0, 0) * 1.41, 0.12, t, 0.3);
          break;
        case 'beam':
          [0, 4, 7].forEach((d, i) => this.bell.triggerAttackRelease(this.note(d, 1), 0.5, t + i * 0.03, 0.3));
          break;
        case 'bubble':
          [0, 0.05, 0.1].forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(4 + i * 2, 1), 0.04, t + d, 0.35));
          break;
        case 'roll': {
          const n = this.at(this.whoosh);
          this.sweep(this.whooshFilter, 5000, 3000, n, 0.25);
          this.whoosh.triggerAttackRelease(0.25, n, 0.3);
          break;
        }
        default:
          this.sparkle.triggerAttackRelease(this.note(7, 1), 0.1, t, 0.35);
          this.sparkle.triggerAttackRelease(this.note(9, 1), 0.1, t + 0.05, 0.3);
      }
    });
  }

  /** A room is cleared: a quick rising run of bells into a warm chord. */
  clear() {
    this.safe(() => {
      const t = Tone.now();
      [0, 2, 4, 7].forEach((d, i) => this.bell.triggerAttackRelease(this.note(d, 1), 0.25, t + i * 0.07, 0.5));
      [0, 4, 7, 12].forEach((d, i) => this.fuseBell.triggerAttackRelease(this.note(d, 1), 1.2, t + 0.3 + i * 0.012, 0.55));
      [9, 7, 9, 12].forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(d, 2), 0.08, t + 0.45 + i * 0.06, 0.35));
    });
  }

  /** Every gem left on the floor lifts and streams to the knight: one long breath drawn in. */
  magnet() {
    this.safe(() => {
      const t = this.at(this.whoosh, 0.05);
      this.sweep(this.whooshFilter, 500, 4200, t, 0.45);
      this.whoosh.triggerAttackRelease(0.45, t, 0.6);
    });
  }

  /** A heart restored: a warm rising step and a shimmer over it. */
  heal() {
    if (!this.gate('heal', 150)) return;
    this.safe(() => {
      const t = Tone.now();
      this.fuseBell.triggerAttackRelease(this.note(0, 1), 0.5, t, 0.45);
      this.fuseBell.triggerAttackRelease(this.note(4, 1), 0.6, t + 0.08, 0.5);
      [7, 9, 11].forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(d, 1), 0.08, t + 0.14 + i * 0.05, 0.45));
    });
  }

  /** Armor back: a crystal picked up rings out; the slow regeneration only ticks. */
  armor(regen = false) {
    if (!this.gate(regen ? 'armor-regen' : 'armor', regen ? 300 : 120)) return;
    this.safe(() => {
      const t = Tone.now();
      this.tink.triggerAttackRelease(this.note(regen ? 7 : 9, 2), 0.06, t, regen ? 0.35 : 0.8);
      if (regen) return;
      this.metal.triggerAttackRelease('E5', 0.05, this.at(this.metal), 0.2);
      this.tink.triggerAttackRelease(this.note(12, 2), 0.08, t + 0.07, 0.6);
    });
  }

  /** Down to the last heart: a heartbeat under the fight. */
  heartbeat() {
    if (!this.gate('heartbeat', 900)) return;
    this.safe(() => {
      this.thump.triggerAttackRelease('A1', 0.12, this.at(this.thump), 0.75);
      this.thump.triggerAttackRelease('G1', 0.1, this.at(this.thump, 0.2), 0.5);
    });
  }

  /** The knight falls: a deep blow, the music sinks away, and a slow fall of notes. Then the calm theme returns. */
  defeat() {
    this.safe(() => {
      const t = Tone.now();
      this.sub.triggerAttackRelease('D1', 1.2, this.at(this.sub), 1);
      this.slowmo(0.6, 1.5);
      [7, 4, 2, 0].forEach((d, i) => this.fuseBell.triggerAttackRelease(this.note(d, 0), 1.4, t + 0.4 + i * 0.3, 0.5));
    });
    this.fadeOutLevel(1.4, 3.4);
  }

  /** The run is won: a deep hit under a climbing run and a big held chord, then the calm theme. */
  victory() {
    this.safe(() => {
      const t = Tone.now();
      this.sub.triggerAttackRelease('C1', 0.8, this.at(this.sub), 0.9);
      [0, 2, 4, 7].forEach((d, i) => this.bell.triggerAttackRelease(this.note(d, 1), 0.4, t + i * 0.12, 0.6));
      [0, 4, 7, 12].forEach((d, i) => this.fuseBell.triggerAttackRelease(this.note(d, 1), 2.4, t + 0.5 + i * 0.015, 0.6));
      [7, 9, 12, 14].forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(d, 2), 0.1, t + 0.65 + i * 0.07, 0.5));
    });
    this.fadeOutLevel(1, 3.6);
  }

  /** A gun hits the floor (one swapped out, or dropped for good): two knocks of metal and a dull thud. */
  weaponDrop() {
    this.safe(() => {
      this.metal.triggerAttackRelease('E4', 0.08, this.at(this.metal), 0.45);
      this.thump.triggerAttackRelease('A2', 0.08, this.at(this.thump), 0.55);
      this.metal.triggerAttackRelease('B3', 0.1, this.at(this.metal, 0.11), 0.35);
      this.metal.triggerAttackRelease('G3', 0.06, this.at(this.metal, 0.19), 0.2);
    });
  }

  /** A gun taken up: a swish, then the slide racked back and home. */
  weaponPickup() {
    this.safe(() => {
      const t = this.at(this.whoosh);
      this.sweep(this.whooshFilter, 900, 3000, t, 0.1);
      this.whoosh.triggerAttackRelease(0.09, t, 0.5);
      this.metal.triggerAttackRelease('D5', 0.03, this.at(this.metal, 0.1), 0.3);
      this.hitNoise.triggerAttackRelease(0.03, this.at(this.hitNoise, 0.1), 0.45);
      this.metal.triggerAttackRelease('A4', 0.04, this.at(this.metal, 0.2), 0.4);
      this.hitNoise.triggerAttackRelease(0.03, this.at(this.hitNoise, 0.2), 0.55);
    });
  }

  /** A chest opens: the latch, the lid swinging up, and light spilling out (cooler and brighter for a weapon chest). */
  chest(weapon = false) {
    this.safe(() => {
      const t = Tone.now();
      this.metal.triggerAttackRelease(weapon ? 'C4' : 'G3', 0.05, this.at(this.metal), 0.4);
      this.thump.triggerAttackRelease('G2', 0.1, this.at(this.thump), 0.5);
      const w = this.at(this.whoosh, 0.05);
      this.sweep(this.whooshFilter, 400, 1800, w, 0.25);
      this.whoosh.triggerAttackRelease(0.25, w, 0.5);
      (weapon ? [0, 4, 7, 11, 14] : [0, 2, 4, 7, 9]).forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(d, 2), 0.12, t + 0.15 + i * 0.05, 0.6));
      [0, 4, 7].forEach((d, i) => this.fuseBell.triggerAttackRelease(this.note(d, 1), 1, t + 0.18 + i * 0.012, 0.45));
    });
  }

  /** Dual wield kicks in: a fast rise that lands on a bright hit. */
  skill() {
    this.safe(() => {
      const t = this.at(this.whoosh);
      this.sweep(this.whooshFilter, 300, 4800, t, 0.2);
      this.whoosh.triggerAttackRelease(0.2, t, 0.8);
      this.zap.triggerAttackRelease(this.note(0, 1), 0.18, this.at(this.zap, 0.18), 0.7);
      this.thump.triggerAttackRelease('C2', 0.12, this.at(this.thump, 0.18), 0.7);
      const t2 = Tone.now() + 0.18;
      [0, 4, 7].forEach((d, i) => this.bell.triggerAttackRelease(this.note(d, 2), 0.3, t2 + i * 0.02, 0.5));
    });
  }

  /** A crate splinters: a dry crack and wood tumbling. */
  crate() {
    if (!this.gate('crate', 60)) return;
    this.safe(() => {
      this.snap.triggerAttackRelease(0.02, this.at(this.snap), 0.9);
      this.hitNoise.triggerAttackRelease(0.09, this.at(this.hitNoise), 0.9);
      this.thump.triggerAttackRelease('D3', 0.06, this.at(this.thump), 0.6);
      this.thump.triggerAttackRelease('A2', 0.05, this.at(this.thump, 0.07), 0.35);
    });
  }

  /** A blow that does nothing (a guardian between forms, a shield shrugging it off): a thin metal ping. */
  deflect() {
    if (!this.gate('deflect', 110)) return;
    this.safe(() => {
      this.bell.triggerAttackRelease(this.note(11, 2), 0.05, Tone.now(), 0.3);
      this.snap.triggerAttackRelease(0.015, this.at(this.snap), 0.5);
    });
  }

  /** Something brittle breaks: an elite's elemental shield (big) or a frozen monster: a bright spray and falling chimes. */
  glass(big = false) {
    if (!this.gate('glass', 80)) return;
    this.safe(() => {
      const t = Tone.now();
      this.shard.triggerAttackRelease(big ? 0.3 : 0.15, this.at(this.shard), big ? 1 : 0.6);
      (big ? [12, 11, 9, 7, 4] : [11, 9, 7]).forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(d, 2), 0.05, t + 0.02 + i * 0.035, 0.5));
      if (big) this.thump.triggerAttackRelease('E2', 0.1, this.at(this.thump), 0.7);
    });
  }

  /** A monster fires: a soft falling blip, well under the player's own guns, so a room tells you what's coming. */
  enemyShot(big = false) {
    if (!this.gate('enemy-shot', 90)) return;
    this.safe(() => {
      const t = this.at(this.chirp);
      const f = big ? 330 : 620;
      const d = big ? 0.13 : 0.07;
      this.chirp.triggerAttackRelease(f, d, t, big ? 0.85 : 0.6);
      this.chirp.frequency.exponentialRampToValueAtTime(f * 0.45, t + d);
    });
  }

  /** A monster winds up a charge or takes aim: a short rising zip. */
  windup() {
    if (!this.gate('windup', 200)) return;
    this.safe(() => {
      const t = this.at(this.chirp);
      this.chirp.triggerAttackRelease(380, 0.12, t, 0.5);
      this.chirp.frequency.exponentialRampToValueAtTime(900, t + 0.12);
    });
  }

  /** A trap arms (two dry ticks) and then goes off (a sharp swish and a clack). */
  trap(live: boolean) {
    if (!this.gate(live ? 'trap-live' : 'trap-warn', 150)) return;
    this.safe(() => {
      if (!live) {
        this.metal.triggerAttackRelease('A5', 0.02, this.at(this.metal), 0.15);
        this.metal.triggerAttackRelease('A5', 0.02, this.at(this.metal, 0.12), 0.12);
        return;
      }
      const t = this.at(this.whoosh);
      this.sweep(this.whooshFilter, 3000, 900, t, 0.12);
      this.whoosh.triggerAttackRelease(0.12, t, 0.6);
      this.metal.triggerAttackRelease('D3', 0.05, this.at(this.metal), 0.35);
    });
  }

  /** Down the trapdoor: a long falling breath and a low chord. The last bloom rises and rings bright instead. */
  descend(final = false) {
    this.safe(() => {
      const t = this.at(this.whoosh);
      this.sweep(this.whooshFilter, final ? 600 : 3200, final ? 4800 : 260, t, 0.6);
      this.whoosh.triggerAttackRelease(0.6, t, 0.8);
      const t0 = Tone.now();
      (final ? [0, 4, 7, 12] : [7, 4, 0]).forEach((d, i) => this.fuseBell.triggerAttackRelease(this.note(d, final ? 1 : 0), 1.2, t0 + i * 0.09, 0.5));
    });
  }

  /** A new floor's title card: a low gong and a wash of air. */
  floorIntro() {
    this.safe(() => {
      const t = Tone.now();
      this.sub.triggerAttackRelease('C1', 0.9, this.at(this.sub), 0.6);
      [0, 2, 4].forEach((d, i) => this.fuseBell.triggerAttackRelease(this.note(d, 0), 2, t + i * 0.02, 0.4));
      const w = this.at(this.whoosh, 0.05);
      this.sweep(this.whooshFilter, 4000, 500, w, 0.9);
      this.whoosh.triggerAttackRelease(0.9, w, 0.4);
    });
  }

  /** The hall and the side games: each finished action has a small sound of its own. */
  life(kind: LifeSound) {
    if (kind === 'error') {
      this.uiError();
      return;
    }
    this.uiAt = performance.now();
    this.safe(() => {
      const t = Tone.now();
      switch (kind) {
        case 'plant':
          this.thump.triggerAttackRelease('E2', 0.08, this.at(this.thump), 0.5);
          this.hitNoise.triggerAttackRelease(0.06, this.at(this.hitNoise), 0.35);
          [2, 4].forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(d, 2), 0.08, t + 0.08 + i * 0.06, 0.5));
          break;
        case 'harvest':
          this.pop.triggerAttackRelease(this.note(0, 1), 0.06, this.at(this.pop), 0.7);
          [0, 2, 4, 7].forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(d, 2), 0.1, t + 0.06 + i * 0.05, 0.55));
          break;
        case 'craft':
        case 'pack': {
          const w = this.at(this.whoosh);
          this.sweep(this.whooshFilter, 700, 2600, w, 0.14);
          this.whoosh.triggerAttackRelease(0.14, w, 0.45);
          this.metal.triggerAttackRelease('C5', 0.03, this.at(this.metal, 0.14), 0.2);
          if (kind === 'craft') [0, 4, 7].forEach((d, i) => this.bell.triggerAttackRelease(this.note(d, 1), 0.4, t + 0.16 + i * 0.05, 0.45));
          break;
        }
        case 'cook': {
          // A sizzle, then the dish is up.
          const w = this.at(this.whoosh);
          this.sweep(this.whooshFilter, 5200, 3600, w, 0.5);
          this.whoosh.triggerAttackRelease(0.5, w, 0.35);
          [0, 4, 7, 12].forEach((d, i) => this.bell.triggerAttackRelease(this.note(d, 1), 0.45, t + 0.45 + i * 0.06, 0.5));
          break;
        }
        case 'deliver':
          this.cardPick();
          this.thump.triggerAttackRelease('C2', 0.12, this.at(this.thump), 0.5);
          break;
        case 'restore':
          this.sub.triggerAttackRelease('C1', 0.8, this.at(this.sub), 0.6);
          [0, 2, 4, 7, 9, 12].forEach((d, i) => this.fuseBell.triggerAttackRelease(this.note(d, 1), 1.6, t + i * 0.1, 0.5));
          break;
        case 'discover':
          [4, 7, 9, 12].forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(d, 2), 0.14, t + i * 0.07, 0.6));
          this.fuseBell.triggerAttackRelease(this.note(0, 1), 1.2, t + 0.28, 0.45);
          break;
        case 'portal': {
          // Stepping into a painting: air rushing past and a chord opening up.
          const w = this.at(this.whoosh);
          this.sweep(this.whooshFilter, 300, 3600, w, 0.5);
          this.whoosh.triggerAttackRelease(0.5, w, 0.6);
          [0, 4, 7].forEach((d, i) => this.fuseBell.triggerAttackRelease(this.note(d, 1), 1, t + 0.25 + i * 0.03, 0.45));
          break;
        }
      }
    }, true);
  }

  /** The fishing round's cues: the cast, nibbles and the bite, the reel and the fish's runs, and how it ends. */
  fish(kind: FishSound) {
    if (!this.gate(`fish-${kind}`, kind === 'reel' ? 110 : 80, true)) return;
    this.uiAt = performance.now();
    this.safe(() => {
      const t = Tone.now();
      switch (kind) {
        case 'cast': {
          const w = this.at(this.whoosh);
          this.sweep(this.whooshFilter, 2400, 700, w, 0.35);
          this.whoosh.triggerAttackRelease(0.35, w, 0.6);
          this.pop.triggerAttackRelease(this.note(0, 0), 0.1, this.at(this.pop, 0.45), 0.6);
          this.hitNoise.triggerAttackRelease(0.08, this.at(this.hitNoise, 0.45), 0.4);
          break;
        }
        case 'nibble':
          this.pop.triggerAttackRelease(this.note(2, 1), 0.04, this.at(this.pop), 0.45);
          break;
        case 'bite': {
          const b = this.at(this.boomNoise);
          this.sweep(this.boomFilter, 1600, 300, b, 0.2);
          this.boomNoise.triggerAttackRelease(0.16, b, 0.35);
          this.bell.triggerAttackRelease(this.note(7, 1), 0.2, t, 0.6);
          this.bell.triggerAttackRelease(this.note(9, 1), 0.25, t + 0.08, 0.6);
          break;
        }
        case 'hook': {
          const w = this.at(this.whoosh);
          this.sweep(this.whooshFilter, 600, 3200, w, 0.12);
          this.whoosh.triggerAttackRelease(0.12, w, 0.7);
          this.thump.triggerAttackRelease('E2', 0.1, this.at(this.thump), 0.6);
          break;
        }
        case 'reel':
          this.uiTick.triggerAttackRelease(0.01, this.at(this.uiTick), 0.5);
          break;
        case 'surge':
          this.chirp.triggerAttackRelease(300, 0.18, this.at(this.chirp), 0.6);
          this.chirp.frequency.exponentialRampToValueAtTime(700, Tone.now() + 0.18);
          break;
        case 'catch': {
          const b = this.at(this.boomNoise);
          this.sweep(this.boomFilter, 2400, 400, b, 0.3);
          this.boomNoise.triggerAttackRelease(0.25, b, 0.4);
          [0, 4, 7, 12].forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(d, 2), 0.16, t + 0.12 + i * 0.06, 0.65));
          [0, 4, 7].forEach((d, i) => this.fuseBell.triggerAttackRelease(this.note(d, 1), 1, t + 0.36 + i * 0.012, 0.45));
          break;
        }
        case 'escape':
          this.pop.triggerAttackRelease(this.note(1, 0), 0.06, this.at(this.pop), 0.4);
          this.uiTone.triggerAttackRelease(this.note(2, 0), 0.12, t + 0.05, 0.5);
          this.uiTone.triggerAttackRelease(this.note(0, 0), 0.2, t + 0.17, 0.5);
          break;
      }
    }, true);
  }

  /** A melee finisher landed on the beat: a heavy hit and a bright chord on top. */
  finisher() {
    this.safe(() => {
      if (!this.gate('finisher', 120)) return;
      const t = Tone.now();
      this.sub.triggerAttackRelease('D1', 0.3, this.at(this.sub), 1);
      const n = this.at(this.boomNoise);
      this.sweep(this.boomFilter, 4200, 300, n, 0.3);
      this.boomNoise.triggerAttackRelease(0.25, n, 0.8);
      [0, 4, 7].forEach((d, i) => this.fuseBell.triggerAttackRelease(this.note(d, 1), 0.5, t + 0.02 + i * 0.015, 0.6));
    });
  }

  /** The style meter went up a rank. */
  rankUp(rank: number) {
    this.safe(() => {
      const t = Tone.now();
      this.bell.triggerAttackRelease(this.note(rank + 2, 1), 0.3, t, 0.55);
      this.bell.triggerAttackRelease(this.note(rank + 5, 1), 0.45, t + 0.08, 0.6);
    });
  }

  /** A fight's grade is stamped: a thump, then a chord that grows with the grade. */
  stamp(rank: number) {
    this.safe(() => {
      const t = Tone.now();
      this.thump.triggerAttackRelease('C2', 0.2, this.at(this.thump), 1);
      const notes = [0, 2, 4, 7, 9, 12].slice(0, 2 + Math.ceil(rank * 0.8));
      notes.forEach((d, i) => this.fuseBell.triggerAttackRelease(this.note(d, 1), 0.9, t + 0.06 + i * 0.03, 0.5 + rank * 0.06));
    });
  }

  /**
   * 0 is walking about, 1 a fight, 2 a horde or a boss. Starting a fight cuts straight to the fight music; ending
   * one lets it ring under the clear fanfare and brings the calm layer back over a few seconds.
   */
  setIntensity(level: 0 | 1 | 2) {
    const was = this.intensity > 0;
    this.intensity = level;
    const l = this.layers;
    if (!this.ready || !l || was === level > 0) return;
    try {
      const t = Tone.now();
      clearTimeout(l.timer);
      if (level > 0) {
        l.battleLive = true;
        this.fade(l.battle.gain, 1, t, 0.06);
        this.fade(l.calm.gain, 0, t, 0.5);
        l.timer = window.setTimeout(() => (l.calmLive = false), 800);
      } else {
        l.calmLive = true;
        this.fade(l.battle.gain, 0, t + 0.5, 2.2);
        this.fade(l.calm.gain, 1, t + 1.4, 2.6);
        l.timer = window.setTimeout(() => (l.battleLive = false), 3000);
      }
    } catch {
      // A missed crossfade must not break the room.
    }
  }

  /** Hold a gain where it is now, then ramp it to `to` from `at` over `dur` seconds. */
  private fade(p: Tone.Param<'gain'> | Tone.Param<'number'>, to: number, at: number, dur: number) {
    const t = Tone.now();
    const from = p.value;
    p.cancelScheduledValues(t);
    p.setValueAtTime(from, t);
    if (at > t) p.setValueAtTime(from, at);
    p.linearRampToValueAtTime(to, Math.max(at, t) + dur);
  }

  /** The pause page: the music sinks behind a closed door, and comes back out when play resumes. */
  muffle(on: boolean, instant = false) {
    if (!this.ready) return;
    try {
      const t = Tone.now();
      const f = this.pauseLP.frequency;
      f.cancelScheduledValues(t);
      if (instant) {
        f.setValueAtTime(on ? 700 : 18000, t);
        this.musicDuck.gain.cancelScheduledValues(t);
        this.musicDuck.gain.setValueAtTime(on ? 0.6 : 1, t);
        return;
      }
      f.setValueAtTime(Math.max(200, Number(f.value)), t);
      f.exponentialRampToValueAtTime(on ? 700 : 18000, t + (on ? 0.25 : 0.45));
      this.fade(this.musicDuck.gain, on ? 0.6 : 1, t, on ? 0.25 : 0.45);
    } catch {
      // The menu works without it.
    }
  }

  /** The run is over: the floor's music fades away, and a while later the calm theme takes over. */
  private fadeOutLevel(sec: number, homeAfter: number) {
    const l = this.layers;
    const gen = this.musicGen;
    if (this.ready && l) {
      try {
        const t = Tone.now();
        clearTimeout(l.timer);
        this.fade(l.calm.gain, 0, t, sec);
        this.fade(l.battle.gain, 0, t, sec);
      } catch {
        // stopMusic below gets rid of it either way.
      }
    }
    window.setTimeout(() => {
      if (this.musicGen === gen) this.playHome();
    }, homeAfter * 1000);
  }

  /** Final scene teardown also revokes a style waiting for asynchronous audio initialization. */
  stopMusic(clearStyle = false) {
    if (clearStyle) this.kit = undefined;
    const transport = Tone.getTransport();
    this.loops.forEach((l) => l.dispose());
    this.loops = [];
    transport.stop();
    transport.cancel();
    this.musicNodes.forEach((n) => n.dispose());
    this.musicNodes = [];
    if (this.layers) clearTimeout(this.layers.timer);
    this.layers = undefined;
    this.musicGen++;
    this.bar = 0;
    this.fadeHome();
  }
}

export const audio = new AudioEngine();
