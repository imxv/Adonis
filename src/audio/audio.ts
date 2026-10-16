import * as Tone from 'tone';
import type { StyleKit } from '../styles/types';
import type { Delivery } from '../data/weapons';
import type { SpawnStyle } from '../data/enemies';

/* Soft, modern synthesis only: sine / triangle / FM / filtered noise.
   No square waves, no 8-bit arpeggios. Everything goes through a compressor and limiter. */

type AnyInst = { dispose(): void };

class AudioEngine {
  ready = false;
  private initializing?: Promise<void>;
  muted = false;
  private silentDepth = 0;

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
  private fuseBell!: Tone.PolySynth;

  private kit?: StyleKit;
  /** Bus gains; the settings' 0-10 sliders map onto these (defaults 7 and 8 give the original mix). */
  private vol = { music: 0.42, sfx: 0.9 };
  private musicNodes: AnyInst[] = [];
  private loops: Tone.Loop[] = [];
  private intensity = 0;
  private scaleMidi: number[] = [];
  private bar = 0;

  /** Music and effect volume, each 0-10. Safe to call before the audio context exists. */
  setVolumes(music: number, sfx: number) {
    this.vol = { music: (music / 10) * 0.6, sfx: (sfx / 10) * 1.125 };
    if (!this.music || !this.sfx) return;
    this.safe(() => {
      this.music.gain.rampTo(this.vol.music, 0.08);
      this.sfx.gain.rampTo(this.vol.sfx, 0.08);
    });
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
    this.music = new Tone.Gain(this.vol.music).connect(this.musicLP);
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

    this.ready = true;
    if (this.kit) this.setStyle(this.kit);
  }

  private gate(key: string, ms: number): boolean {
    if (this.silentDepth) return false;
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
    Tone.getDestination().mute = m;
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
  private safe(fn: () => void) {
    if (!this.ready || this.silentDepth) return;
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

  pickup(streak: number) {
    if (!this.gate('pickup', 34)) return;
    this.safe(() => this.sparkle.triggerAttackRelease(this.note(streak % 12, 2), 0.08, Tone.now(), 0.7));
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
    this.safe(() => {
      const t = Tone.now();
      this.bell.triggerAttackRelease(this.note(4, 1), 0.3, t, 0.5);
      this.bell.triggerAttackRelease(this.note(7, 1), 0.4, t + 0.06, 0.45);
    });
  }

  hover() {
    if (!this.gate('hover', 60)) return;
    this.safe(() => this.pop.triggerAttackRelease(this.note(4, 2), 0.03, this.at(this.pop), 0.3));
  }

  dash() {
    if (!this.gate('dash', 80)) return;
    this.safe(() => {
      const t = this.at(this.whoosh);
      this.sweep(this.whooshFilter, 400, 2800, t, 0.16);
      this.whoosh.triggerAttackRelease(0.16, t, 0.9);
    });
  }

  hurt() {
    if (!this.gate('hurt', 120)) return;
    this.safe(() => {
      this.sub.triggerAttackRelease('E1', 0.3, this.at(this.sub), 0.9);
      const t = this.at(this.boomNoise);
      this.sweep(this.boomFilter, 700, 300, t, 0.2);
      this.boomNoise.triggerAttackRelease(0.18, t, 0.5);
      this.music.gain.cancelScheduledValues(t);
      this.music.gain.setValueAtTime(this.vol.music * 0.35, t);
      this.music.gain.linearRampToValueAtTime(this.vol.music, t + 0.8);
    });
  }

  door() {
    this.safe(() => {
      const t = Tone.now();
      [0, 4, 7, 11].forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(d, 1), 0.3, t + i * 0.09, 0.6));
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
    this.safe(() => {
      for (let i = 0; i < n; i++) {
        const t = this.at(this.whoosh, i * 0.09);
        this.sweep(this.whooshFilter, 1800, 4200, t, 0.06);
        this.whoosh.triggerAttackRelease(0.06, t, 0.45);
      }
    });
  }

  /** A card taken: a bright rising chime. */
  cardPick() {
    this.safe(() => {
      const t = Tone.now();
      [0, 4, 7, 12].forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(d, 2), 0.18, t + i * 0.05, 0.7));
    });
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
  setStyle(kit: StyleKit) {
    this.kit = kit;
    if (!this.ready) return;
    this.stopMusic();
    const root = Tone.Frequency(kit.audio.root).toMidi();
    this.scaleMidi = kit.audio.scale.map((s) => root + s);
    const transport = Tone.getTransport();
    transport.bpm.value = kit.audio.bpm;

    const cutoff = 600 + 2600 * kit.audio.brightness;
    const lp = new Tone.Filter(cutoff, 'lowpass').connect(this.music);
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

    const kick = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 5, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 } }).connect(this.music);
    kick.volume.value = -14;
    const hatFilter = new Tone.Filter(7000, 'highpass').connect(this.music);
    const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 } }).connect(hatFilter);
    hat.volume.value = -30;
    const clapFilter = new Tone.Filter({ frequency: 1500, type: 'bandpass', Q: 0.8 }).connect(this.music);
    const clap = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.05 } }).connect(clapFilter);
    clap.volume.value = -20;
    const clank = new Tone.FMSynth({ harmonicity: 1.41, modulationIndex: 8, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 } }).connect(lp);
    clank.volume.value = -26;
    const bass = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 } }).connect(lp);
    bass.volume.value = -14;
    this.musicNodes.push(kick, hatFilter, hat, clapFilter, clap, clank, bass);

    const chordOf = (degree: number) => [0, 2, 4].map((s) => this.scaleMidi[(degree + s) % n] + (degree + s >= n ? 12 : 0) - 12);
    let step = 0;
    const perc = kit.audio.perc;

    const loop = new Tone.Loop((time) => {
      try {
        const beat = step % 8;
        const degree = progression[this.bar % progression.length];
        if (beat === 0) {
          const chord = chordOf(degree).map((m) => Tone.Frequency(m, 'midi').toFrequency());
          pad.triggerAttackRelease(chord, '1m', time, 0.5);
        }
        if (Math.random() < (this.intensity > 0 ? 0.62 : 0.4)) {
          const chordTones = [0, 2, 4, 7, 9];
          const idx = degree + chordTones[Math.floor(Math.random() * chordTones.length)] + (Math.random() < 0.3 ? n : 0);
          lead(idx, time);
        }
        if (this.intensity > 0) {
          // The beat game needs a beat you can hear: a soft backbeat on 2 and 4 in every fight.
          if ((beat === 2 || beat === 6) && perc !== 'claps') clap.triggerAttackRelease('16n', time, perc === 'none' ? 0.4 : 0.55);
          if (perc === 'none' && (beat === 0 || beat === 4) && this.intensity === 1) kick.triggerAttackRelease('C2', '8n', time, 0.5);
          if (perc === 'taiko') {
            if (beat === 0 || beat === 3 || beat === 6) kick.triggerAttackRelease(beat === 0 ? 'C2' : 'G2', '8n', time, beat === 0 ? 1 : 0.6);
          } else if (perc !== 'none') {
            if (beat === 0 || beat === 4) kick.triggerAttackRelease('C2', '8n', time, 0.8);
            if (beat % 2 === 1) hat.triggerAttackRelease('32n', time, 0.6);
            if (perc === 'claps' && (beat === 2 || beat === 6)) clap.triggerAttackRelease('16n', time, 0.8);
            if (perc === 'clank' && (beat === 3 || beat === 7)) clank.triggerAttackRelease(this.note(0, -1), '16n', time, 0.6);
          }
        }
        if (this.intensity > 1) {
          const rootMidi = chordOf(degree)[0] - 12;
          bass.triggerAttackRelease(Tone.Frequency(rootMidi, 'midi').toFrequency(), '16n', time, beat % 2 ? 0.5 : 0.9);
          if (perc === 'none' && beat % 4 === 0) kick.triggerAttackRelease('C2', '8n', time, 0.7);
        }
      } catch {
        // After a stall the clock fires overdue steps all at "now", and a synth can't restart at its own start
        // time: that note is dropped.
      }
      step++;
      if (step % 8 === 0) this.bar++;
    }, '8n').start(0);
    this.loops.push(loop);
    transport.start();
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

  setIntensity(level: 0 | 1 | 2) {
    this.intensity = level;
  }

  stopMusic() {
    const transport = Tone.getTransport();
    this.loops.forEach((l) => l.dispose());
    this.loops = [];
    transport.stop();
    transport.cancel();
    this.musicNodes.forEach((n) => n.dispose());
    this.musicNodes = [];
    this.bar = 0;
  }
}

export const audio = new AudioEngine();
