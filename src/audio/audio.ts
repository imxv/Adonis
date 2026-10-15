import * as Tone from 'tone';
import type { StyleKit } from '../styles/types';
import type { Delivery } from '../data/weapons';

/* Soft, modern synthesis only: sine / triangle / FM / filtered noise.
   No square waves, no 8-bit arpeggios. Everything goes through a compressor and limiter. */

type AnyInst = { dispose(): void };

class AudioEngine {
  ready = false;
  muted = false;
  private sfx!: Tone.Gain;
  private music!: Tone.Gain;
  private verb!: Tone.Reverb;
  private last: Record<string, number> = {};

  private pop!: Tone.MembraneSynth;
  private thump!: Tone.MembraneSynth;
  private hitNoise!: Tone.NoiseSynth;
  private hitFilter!: Tone.Filter;
  private bell!: Tone.PolySynth;
  private sparkle!: Tone.PolySynth;
  private boomNoise!: Tone.NoiseSynth;
  private boomFilter!: Tone.Filter;
  private sub!: Tone.MembraneSynth;
  private whoosh!: Tone.NoiseSynth;
  private whooshFilter!: Tone.Filter;
  private zap!: Tone.FMSynth;
  private growl!: Tone.FMSynth;

  private kit?: StyleKit;
  private musicNodes: AnyInst[] = [];
  private loops: Tone.Loop[] = [];
  private intensity = 0;
  private scaleMidi: number[] = [];
  private bar = 0;

  async init() {
    if (this.ready) return;
    await Tone.start();
    const limiter = new Tone.Limiter(-1.5).toDestination();
    const comp = new Tone.Compressor({ threshold: -20, ratio: 3.5, attack: 0.004, release: 0.18 }).connect(limiter);
    const master = new Tone.Gain(0.85).connect(comp);
    this.verb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 1 });
    await this.verb.generate();
    const verbSend = new Tone.Gain(0.22).connect(this.verb);
    this.verb.connect(master);
    this.sfx = new Tone.Gain(0.9).connect(master);
    this.sfx.connect(verbSend);
    this.music = new Tone.Gain(0.42).connect(master);
    this.music.connect(verbSend);

    this.pop = new Tone.MembraneSynth({ pitchDecay: 0.018, octaves: 2.5, envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.03 } }).connect(this.sfx);
    this.pop.volume.value = -20;
    this.thump = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 4, envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.05 } }).connect(this.sfx);
    this.thump.volume.value = -14;
    this.hitFilter = new Tone.Filter(2200, 'lowpass').connect(this.sfx);
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

    this.ready = true;
    if (this.kit) this.setStyle(this.kit);
  }

  private gate(key: string, ms: number): boolean {
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
    if (!this.ready) return;
    try {
      fn();
    } catch {
      // A dropped sound is fine; a thrown frame is not.
    }
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

  hit(crit: boolean) {
    if (!this.gate('hit', 28)) return;
    this.safe(() => {
      this.hitNoise.triggerAttackRelease(0.04, this.at(this.hitNoise), crit ? 0.9 : 0.5);
      this.thump.triggerAttackRelease(crit ? 'E2' : 'A2', 0.05, this.at(this.thump), crit ? 0.8 : 0.4);
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

  explode(big = false) {
    if (!this.gate('boom', 60)) return;
    this.safe(() => {
      const t = this.at(this.boomNoise);
      this.sweep(this.boomFilter, big ? 3200 : 2400, 160, t, big ? 0.7 : 0.4);
      this.boomNoise.triggerAttackRelease(big ? 0.7 : 0.38, t, big ? 1 : 0.75);
      this.sub.triggerAttackRelease(big ? 'C1' : 'G1', big ? 0.6 : 0.35, this.at(this.sub), big ? 1 : 0.8);
    });
  }

  pickup(streak: number) {
    if (!this.gate('pickup', 34)) return;
    this.safe(() => this.sparkle.triggerAttackRelease(this.note(streak % 12, 2), 0.08, Tone.now(), 0.7));
  }

  levelUp() {
    this.safe(() => {
      const t = Tone.now();
      [0, 2, 4, 7].forEach((d, i) => this.bell.triggerAttackRelease(this.note(d, 1), 0.5, t + i * 0.07, 0.6));
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
      this.music.gain.setValueAtTime(0.15, t);
      this.music.gain.linearRampToValueAtTime(0.42, t + 0.8);
    });
  }

  door() {
    this.safe(() => {
      const t = Tone.now();
      [0, 4, 7, 11].forEach((d, i) => this.sparkle.triggerAttackRelease(this.note(d, 1), 0.3, t + i * 0.09, 0.6));
    });
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
