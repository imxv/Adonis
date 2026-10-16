import type { Grade } from '../game/rhythm';
import { E } from '../pixel/palette';
import { icon, px } from './pxhtml';

const TICKS = 4;
/** Pixels between two beats on the bar. */
const GAP = 12;

function replay(el: HTMLElement, cls: string) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/**
 * The beat bar at the bottom of the screen: ticks slide in from both sides and meet the diamond on the beat,
 * the diamond pulses, and each judged press flashes a word above it. Driven every frame by the scene.
 */
export class BeatBar {
  private el: HTMLElement;
  private core: HTMLElement;
  private word: HTMLElement;
  private streakEl: HTMLElement;
  private ticks: HTMLElement[] = [];
  private lastBeat = -1;
  private streakShown = -1;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'beatbar';
    this.el.innerHTML = '<div class="rail"></div><div class="word"></div><div class="streak"></div>';
    for (let i = 0; i < TICKS * 2; i++) {
      const t = document.createElement('div');
      t.className = 'tick';
      t.innerHTML = icon('beat-tick');
      this.el.appendChild(t);
      this.ticks.push(t);
    }
    this.core = document.createElement('div');
    this.core.className = 'core';
    this.core.innerHTML = icon('beat-core');
    this.el.appendChild(this.core);
    this.word = this.el.querySelector('.word') as HTMLElement;
    this.streakEl = this.el.querySelector('.streak') as HTMLElement;
    root.appendChild(this.el);
  }

  frame(beat: number, phase: number, fight: boolean, streak: number) {
    this.el.classList.toggle('calm', !fight);
    for (let k = 0; k < TICKS; k++) {
      const steps = k + 1 - phase;
      const d = Math.round(steps * GAP);
      const alpha = (1 - steps / (TICKS + 0.5)).toFixed(2);
      const [l, r] = [this.ticks[k * 2], this.ticks[k * 2 + 1]];
      l.style.transform = `translateX(${-d}px)`;
      r.style.transform = `translateX(${d}px)`;
      l.style.opacity = r.style.opacity = alpha;
    }
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      replay(this.core, 'pulse');
    }
    const s = streak >= 2 ? streak : 0;
    if (s !== this.streakShown) {
      this.streakShown = s;
      this.streakEl.innerHTML = s ? `${px('连拍', E.cyan)}${px(`x${s}`, E.white, { small: true })}` : '';
      if (s) replay(this.streakEl, 'bump');
    }
  }

  judge(g: Grade) {
    this.word.innerHTML = g === 'perfect' ? px('完美', E.yellow) : g === 'good' ? px('不错', E.cyan) : px('错拍', E.greyM);
    replay(this.word, g === 'miss' ? 'miss' : 'pop');
    if (g !== 'miss') replay(this.core, g === 'perfect' ? 'hitp' : 'hitg');
  }

  private shown = true;

  /** The beat game belongs to melee weapons: the bar only shows with one in hand. */
  show(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    this.el.style.display = on ? '' : 'none';
  }
}
