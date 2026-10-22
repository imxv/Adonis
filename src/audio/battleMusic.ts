import * as Tone from 'tone';
import type { StyleKit } from '../styles/types';

/*
 * The fight music: a second layer that runs on the same transport and tempo as a floor's calm music, so the beat
 * game keeps its clock when one fades into the other. Same rules as everything else: sine, triangle, FM and
 * filtered noise only. What makes it a fight is the drive: a kit on every sixteenth, a galloping FM bass, brass-like
 * stabs and a riff, all in the floor's own key. Bosses and hordes add a choir, toms, crashes and a lead on top.
 */

type AnyInst = { dispose(): void };

const pc = (n: number) => ((n % 12) + 12) % 12;
const hz = (m: number) => Tone.Frequency(m, 'midi').toFrequency();
const fit = (m: number, lo: number, hi: number) => {
  while (m > hi) m -= 12;
  while (m < lo) m += 12;
  return m;
};

/** Four bars of chord roots, in semitones over the floor's root, chosen so every root sits in the floor's scale. */
export function battleProgression(scale: number[]): number[] {
  const has = (s: number) => scale.includes(pc(s));
  if (has(1)) return has(10) ? [0, 1, 0, 10] : [0, 1, 8, 1];
  if (has(3) && has(11)) return [0, 8, 5, 7];
  if (has(3) && has(8)) return [0, 8, 3, 10];
  if (has(3)) return [0, 0, 10, 5];
  // Major floors fight in their relative minor.
  return [9, 9, 7, 2];
}

/** A ladder of notes over a chord root for riffs to climb: the scale step below, root, third, fifth and up an octave. */
function ladder(scale: number[], r: number): number[] {
  const has = (s: number) => scale.includes(pc(s));
  const third = has(r + 3) ? 3 : has(r + 4) ? 4 : 5;
  let below = -2;
  for (const s of [1, 2, 3]) if (has(r - s)) { below = -s; break; }
  return [below, 0, third, 7, 12, 12 + third, 19];
}

/** Chord voicing over a root; a bare fifth where the scale has no third for it. */
function voicing(scale: number[], r: number): number[] {
  const has = (s: number) => scale.includes(pc(s));
  const third = has(r + 3) ? 3 : has(r + 4) ? 4 : undefined;
  return third === undefined ? [0, 7, 12] : [0, third, 7, 12];
}

// [step in the two bars, rung of the ladder, length in sixteenths]
type Riff = [number, number, number][];
/** The call the floor's own instrument plays in the second half of every phrase. */
const CALL: Riff = [
  [0, 4, 2], [3, 3, 1], [4, 4, 2], [6, 5, 2], [8, 4, 3], [11, 3, 1], [12, 2, 4],
  [16, 3, 2], [18, 2, 1], [19, 3, 1], [20, 4, 4], [24, 6, 2], [26, 5, 2], [28, 4, 4],
];
/** The boss's theme: longer notes that climb, carried by the FM lead every bar. */
const THEME: Riff = [
  [0, 4, 3], [3, 4, 1], [4, 5, 2], [6, 4, 2], [8, 6, 4], [12, 5, 2], [14, 4, 2],
  [16, 3, 6], [22, 4, 2], [24, 3, 2], [26, 2, 2], [28, 1, 4],
];

type Groove = 'rock' | 'four' | 'taiko' | 'light';
const KICK: Record<Groove, number[]> = {
  rock: [0, 3, 8, 10],
  four: [0, 4, 8, 12],
  taiko: [0, 3, 6, 8, 11, 14],
  light: [0, 8, 10],
};
// [step, octave up, velocity]
const GALLOP: [number, number, number][] = [
  [0, 0, 1], [2, 0, 0.55], [3, 0, 0.6], [4, 0, 0.85], [6, 0, 0.55], [7, 0, 0.6],
  [8, 0, 0.95], [10, 0, 0.55], [11, 0, 0.6], [12, 0, 0.85], [14, 1, 0.6], [15, 0, 0.7],
];
const PUMP: [number, number, number][] = [
  [0, 0, 0.95], [2, 1, 0.7], [3, 0, 0.4], [4, 0, 0.8], [6, 1, 0.7], [7, 0, 0.4],
  [8, 0, 0.95], [10, 1, 0.7], [11, 0, 0.4], [12, 0, 0.8], [14, 1, 0.75], [15, 0, 0.45],
];

/**
 * Build the fight layer into `out`. `level()` is the fight's intensity (1 a room, 2 a horde or a boss) and `live()`
 * says whether anyone can hear it; a silent layer keeps counting but books no notes.
 */
export function createBattleMusic(kit: StyleKit, out: Tone.ToneAudioNode, level: () => number, live: () => boolean): { nodes: AnyInst[]; loop: Tone.Loop } {
  const a = kit.audio;
  const scale = a.scale;
  const root = Tone.Frequency(a.root).toMidi();
  const prog = battleProgression(scale);
  // Roots above a tritone are taken from below, so the bass walks instead of leaping.
  const near = (o: number) => (o > 6 ? o - 12 : o);
  const bassRoot = fit(root, 33, 44);
  const midRoot = fit(root, 50, 61);
  const leadRoot = fit(root, 62, 73);
  const groove: Groove = a.perc === 'claps' ? 'four' : a.perc === 'taiko' ? 'taiko' : a.perc === 'none' ? 'light' : 'rock';
  const nodes: AnyInst[] = [];
  const keep = <T extends AnyInst>(n: T) => (nodes.push(n), n);
  // Sits a few dB over the calm layer: louder and busier, but never on top of the guns.
  const bus = keep(new Tone.Gain(0.8).connect(out));

  // ---- drums
  const kick = keep(new Tone.MembraneSynth({ pitchDecay: 0.035, octaves: 6, envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.05 } }).connect(bus));
  kick.volume.value = groove === 'light' ? -15 : -12;
  const snareBand = keep(new Tone.Filter({ frequency: groove === 'taiko' ? 1300 : 2100, type: 'bandpass', Q: 0.7 }).connect(bus));
  const snare = keep(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.05 } }).connect(snareBand));
  snare.volume.value = groove === 'light' ? -17 : -10;
  const snareBody = keep(new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 2, envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.04 } }).connect(bus));
  snareBody.volume.value = -17;
  const hatFilter = keep(new Tone.Filter({ frequency: groove === 'light' ? 5200 : 8000, type: groove === 'light' ? 'bandpass' : 'highpass', Q: 1.2 }).connect(bus));
  const hat = keep(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: groove === 'light' ? 0.006 : 0.001, decay: 0.03, sustain: 0, release: 0.01 } }).connect(hatFilter));
  hat.volume.value = groove === 'light' ? -16 : -21;
  const openHat = keep(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.05 } }).connect(hatFilter));
  openHat.volume.value = -25;
  const toms = keep(new Tone.MembraneSynth({ pitchDecay: 0.06, octaves: 3, envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.1 } }).connect(bus));
  toms.volume.value = groove === 'taiko' ? -9 : -13;
  const crashFilter = keep(new Tone.Filter({ frequency: 3800, type: 'highpass' }).connect(bus));
  const crash = keep(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 1.4, sustain: 0, release: 0.4 } }).connect(crashFilter));
  crash.volume.value = -22;
  const riserFilter = keep(new Tone.Filter({ frequency: 400, type: 'bandpass', Q: 1.4 }).connect(bus));
  const riser = keep(new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 1, decay: 0.01, sustain: 1, release: 0.05 } }).connect(riserFilter));
  riser.volume.value = -21;
  const metal = keep(new Tone.FMSynth({ harmonicity: 1.41, modulationIndex: 10, envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 }, modulationEnvelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.03 } }).connect(bus));
  metal.volume.value = -23;

  // ---- bass, stabs, choir, leads
  const bass = keep(new Tone.MonoSynth({
    oscillator: { type: 'fmsine', harmonicity: 1, modulationIndex: 2.6 },
    filter: { type: 'lowpass', rolloff: -24, Q: 2.5 },
    envelope: { attack: 0.003, decay: 0.2, sustain: 0.5, release: 0.06 },
    filterEnvelope: { attack: 0.002, decay: 0.14, sustain: 0.25, release: 0.1, baseFrequency: 90, octaves: 3.4 },
  } as any).connect(bus));
  bass.volume.value = -14;
  const bright = 1500 + 2600 * a.brightness;
  const stabLP = keep(new Tone.Filter(bright, 'lowpass').connect(bus));
  const stab = keep(new Tone.PolySynth({
    voice: Tone.FMSynth,
    maxPolyphony: 8,
    options: {
      harmonicity: 1,
      modulationIndex: 3.5,
      oscillator: { type: 'sine' },
      modulation: { type: 'triangle' },
      envelope: { attack: 0.008, decay: 0.22, sustain: 0.25, release: 0.2 },
      modulationEnvelope: { attack: 0.01, decay: 0.18, sustain: 0.3, release: 0.15 },
    },
  } as any).connect(stabLP));
  stab.volume.value = -14;
  const choirLP = keep(new Tone.Filter(1900, 'lowpass').connect(bus));
  const choir = keep(new Tone.PolySynth({
    voice: Tone.Synth,
    maxPolyphony: 8,
    options: { oscillator: { type: 'fattriangle', count: 3, spread: 22 }, envelope: { attack: 0.35, decay: 0.3, sustain: 0.7, release: 1.1 } },
  } as any).connect(choirLP));
  choir.volume.value = -18;
  const lead = keep(new Tone.FMSynth({
    harmonicity: 2,
    modulationIndex: 4,
    oscillator: { type: 'sine' },
    modulation: { type: 'triangle' },
    envelope: { attack: 0.006, decay: 0.2, sustain: 0.55, release: 0.18 },
    modulationEnvelope: { attack: 0.01, decay: 0.25, sustain: 0.4, release: 0.2 },
  } as any).connect(bus));
  lead.volume.value = -12;
  lead.portamento = 0.015;
  const voice = floorVoice(a.lead, a.brightness, bus, keep);

  const sixteenth = Tone.Time('16n').toSeconds();
  const transport = Tone.getTransport();
  const play = (fn: () => void) => {
    try {
      fn();
    } catch {
      // After a stall the clock fires overdue steps all at "now", and a synth can't restart at its own start time.
    }
  };

  const loop = new Tone.Loop((time) => {
    if (!live()) return;
    // Counted from the transport, so the layer stays on the same bar as the calm one whatever happens to the clock.
    const step = Math.round(transport.getTicksAtTime(time) / (transport.PPQ / 4));
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const phrase = bar % 8;
    const big = level() > 1;
    const r = prog[bar % prog.length];
    const next = prog[(bar + 1) % prog.length];
    const fill = phrase === 7 && s >= 12;

    // Drums
    if (KICK[groove].includes(s) || (big && groove === 'rock' && (s === 14 || s === 7))) {
      play(() => kick.triggerAttackRelease(groove === 'taiko' ? 'A1' : 'C2', '8n', time, s === 0 || s === 8 ? 1 : 0.75));
    }
    if (fill) {
      if (groove === 'taiko' || big) play(() => toms.triggerAttackRelease(['G2', 'E2', 'C2', 'A1'][s - 12], '8n', time, 0.6 + (s - 12) * 0.12));
      else play(() => snare.triggerAttackRelease('16n', time, 0.45 + (s - 12) * 0.15));
    } else if (s === 4 || s === 12) {
      if (a.perc === 'claps') {
        play(() => {
          snare.triggerAttackRelease(0.02, time, 0.8);
          snare.triggerAttackRelease(0.02, time + 0.011, 0.7);
          snare.triggerAttackRelease('16n', time + 0.022, 0.9);
        });
      } else {
        play(() => snare.triggerAttackRelease('16n', time, 0.95));
        play(() => snareBody.triggerAttackRelease(groove === 'taiko' ? 'D3' : 'G3', '16n', time, 0.7));
      }
    } else if (phrase === 3 && (s === 14 || s === 15)) play(() => snare.triggerAttackRelease('32n', time, 0.4 + (s - 14) * 0.2));
    if (groove === 'four' && s % 4 === 2) play(() => openHat.triggerAttackRelease('8n', time, 0.8));
    else {
      play(() => hat.triggerAttackRelease('32n', time, s % 2 === 0 ? 0.6 : 0.32));
      if (big && s === 15 && phrase % 2 === 1) play(() => hat.triggerAttackRelease('64n', time + sixteenth / 2, 0.4));
    }
    if (a.perc === 'clank' && (s === 7 || s === 15)) play(() => metal.triggerAttackRelease(hz(midRoot + 12), '16n', time, 0.7));
    if (groove === 'taiko' && big && (s === 2 || s === 10)) play(() => toms.triggerAttackRelease('D2', '8n', time, 0.45));
    if (s === 0 && (phrase === 0 || (big && phrase === 4))) play(() => crash.triggerAttackRelease(1.2, time, 0.8));
    if (phrase === 7 && s === 8) {
      play(() => {
        const dur = sixteenth * 8;
        riser.envelope.attack = dur * 0.9;
        riserFilter.frequency.cancelScheduledValues(time);
        riserFilter.frequency.setValueAtTime(300, time);
        riserFilter.frequency.exponentialRampToValueAtTime(6500, time + dur);
        riser.triggerAttack(time, 0.8);
        riser.triggerRelease(time + dur);
      });
    }

    // Bass: the bar's root, walking up to the next chord on the last sixteenth.
    const pattern = groove === 'four' ? PUMP : GALLOP;
    const hit = pattern.find(([at]) => at === s);
    if (hit) {
      const lands = s === 15 && next !== r;
      const m = bassRoot + near(lands ? next : r) + hit[1] * 12;
      play(() => bass.triggerAttackRelease(hz(m), sixteenth * (hit[1] ? 0.8 : 0.9), time, hit[2]));
    }

    // Stabs: three hits at the top of every other bar, one on the off bars; a horde or boss pushes more.
    const chord = voicing(scale, r).map((x) => hz(midRoot + near(r) + x));
    const stabAt = bar % 2 === 0 ? [0, 3, 6] : big ? [0, 6, 10] : [0];
    if (stabAt.includes(s)) play(() => stab.triggerAttackRelease(chord, s === 0 && bar % 2 === 1 && !big ? sixteenth * 6 : sixteenth * 1.4, time, s === 0 ? 0.8 : 0.6));

    // The choir holds each bar's chord under a big fight.
    if (big && s === 0) play(() => choir.triggerAttackRelease(chord.slice(0, 3).map((f) => f * 2), sixteenth * 15, time, 0.55));

    // Riffs: the floor's instrument calls in the back half of the phrase; a big fight gets the theme all through.
    const pos = (bar % 2) * 16 + s;
    const rungs = ladder(scale, r);
    if (phrase >= 4) {
      for (const [at, rung, len] of CALL) if (at === pos) play(() => voice(hz(leadRoot + near(r) + rungs[rung] + (big ? 12 : 0)), sixteenth * len, time));
    }
    if (big) {
      for (const [at, rung, len] of THEME) if (at === pos) play(() => lead.triggerAttackRelease(hz(leadRoot + near(r) + rungs[rung]), sixteenth * len * 0.92, time, 0.8));
    }
  }, '16n').start(0);
  return { nodes, loop };
}

/** The floor's own lead instrument (pluck, bell, glass or marimba), tuned for short riff notes. */
function floorVoice(kind: StyleKit['audio']['lead'], brightness: number, out: Tone.ToneAudioNode, keep: <T extends AnyInst>(n: T) => T): (f: number, dur: number, time: number) => void {
  switch (kind) {
    case 'pluck': {
      const voices = [0, 1, 2].map(() => {
        const p = keep(new Tone.PluckSynth({ attackNoise: 1.4, dampening: 3000 + brightness * 2600, resonance: 0.9 }).connect(out));
        p.volume.value = -5;
        return p;
      });
      let i = 0;
      return (f, _dur, time) => voices[i++ % voices.length].triggerAttack(f, time);
    }
    case 'bell':
    case 'glass': {
      const glass = kind === 'glass';
      const b = keep(new Tone.PolySynth({
        voice: Tone.FMSynth,
        maxPolyphony: 6,
        options: {
          harmonicity: glass ? 7.01 : 3.01,
          modulationIndex: glass ? 2.5 : 5,
          envelope: { attack: 0.003, decay: 0.5, sustain: 0.1, release: 0.6 },
          modulationEnvelope: { attack: 0.003, decay: 0.25, sustain: 0, release: 0.3 },
        },
      } as any).connect(out));
      b.volume.value = -13;
      return (f, dur, time) => b.triggerAttackRelease(f, dur, time, 0.75);
    }
    case 'marimba':
    default: {
      const m = keep(new Tone.PolySynth({
        voice: Tone.Synth,
        maxPolyphony: 6,
        options: { oscillator: { type: 'sine' }, envelope: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.2 } },
      } as any).connect(out));
      m.volume.value = -9;
      return (f, dur, time) => m.triggerAttackRelease(f, dur, time, 0.8);
    }
  }
}
