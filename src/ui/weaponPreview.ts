import type { WeaponInstance } from '../data/weapons';
import type { RunState } from '../game/run';
import { weaponMetrics } from '../game/weaponMetrics';
import { E } from '../pixel/palette';
import { px } from './pxhtml';
import { WeaponDemo } from './weaponDemo';
import './weaponPreview.css';
import type Phaser from 'phaser';

const fmt = (value: number) => String(Math.round(value * 10) / 10);

/** Proximity-only HUD. The scene owns its eligibility; this view never changes inventory or input. */
export class WeaponPreview {
  private readonly root: HTMLElement;
  private readonly demo: WeaponDemo;
  private readonly media = window.matchMedia('(prefers-reduced-motion: reduce)');
  private weapon?: WeaponInstance;
  private hero?: string;
  private lastMetrics = 0;
  private signature = '';
  private frame = 0;
  private started = 0;
  private lastPaint = 0;
  private elapsed = 0;
  private destroyed = false;

  constructor(parent: HTMLElement, game: Phaser.Game) {
    this.root = document.createElement('aside');
    this.root.className = 'weapon-preview panel';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', '武器训练预览');
    this.root.innerHTML = '<div class="weapon-preview-heading"></div><canvas class="weapon-preview-demo"></canvas><div class="weapon-preview-metrics"></div>';
    parent.appendChild(this.root);
    this.demo = new WeaponDemo(this.root.querySelector('canvas')!, game);
    this.media.addEventListener('change', this.motionChanged);
  }

  show(weapon: WeaponInstance, run: RunState) {
    if (this.destroyed) return;
    const changed = this.weapon !== weapon || this.hero !== run.hero;
    const wasHidden = this.root.hidden;
    const now = performance.now();
    // Scene eligibility is checked every frame, but read-only numbers need only 5 Hz.
    // A different nearby weapon always updates immediately.
    if (!changed && !wasHidden && now - this.lastMetrics < 200) return;
    this.lastMetrics = now;
    const metrics = weaponMetrics(weapon, run);
    const signature = JSON.stringify([weapon.def.id, metrics]);
    if (signature !== this.signature) {
      this.signature = signature;
      const d = weapon.def;
      const rateValue = metrics.attackRate >= 10 ? String(Math.round(metrics.attackRate)) : fmt(metrics.attackRate);
      const rate = metrics.maxAttackRate > metrics.attackRate + 0.01 ? `${rateValue}+` : rateValue;
      const entries = [
        ['伤', fmt(metrics.damage)], ['速', `${rate}/s`],
        ['距', `${Math.round(metrics.range)}px`],
        ['弹', metrics.magazine ? String(metrics.magazine) : '无限'],
      ];
      this.slot('heading').innerHTML = px(d.name, E.white);
      this.slot('metrics').innerHTML = entries.map(([label, value]) => `<div class="weapon-preview-metric">${px(label, E.greyM)}${px(value, E.white)}</div>`).join('');
      this.root.setAttribute('aria-label', `${d.name}。${metrics.usage}。${metrics.traits.join('；')}。${metrics.damageLabel}${fmt(metrics.damage)}，攻速${fmt(metrics.attackRate)}次每秒${metrics.maxAttackRate > metrics.attackRate ? `，起转后最高${fmt(metrics.maxAttackRate)}次每秒` : ''}，${metrics.rangeLabel}${fmt(metrics.range)}，数量${metrics.projectileCount}，弹匣${metrics.magazine || '无限'}，换弹${fmt(metrics.reloadSeconds)}秒。训练动画仅示意使用方式，${metrics.note}`);
    }
    this.weapon = weapon;
    this.hero = run.hero;
    this.demo.set(weapon, run, metrics);
    this.root.hidden = false;
    if (changed || wasHidden) {
      this.started = now;
      this.elapsed = 0;
      this.lastPaint = 0;
      this.demo.draw(0, this.media.matches);
    }
    if (!this.media.matches && !this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  hide() {
    this.root.hidden = true;
    this.demo.hide();
    this.stop();
  }

  place(left: number, top: number) {
    if (this.root.style.left !== `${left}px` || this.root.style.top !== `${top}px`) {
      Object.assign(this.root.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
    }
    const canvas = this.root.querySelector('canvas')!;
    this.demo.setViewport(left + canvas.offsetLeft, top + canvas.offsetTop, canvas.offsetWidth, canvas.offsetHeight);
    this.root.style.setProperty('--training-top', `${canvas.offsetTop}px`);
    this.root.style.setProperty('--training-bottom', `${canvas.offsetTop + canvas.offsetHeight}px`);
  }

  destroy() {
    this.hide();
    this.destroyed = true;
    this.media.removeEventListener('change', this.motionChanged);
    this.demo.destroy();
    this.root.remove();
  }

  private slot(name: string) {
    return this.root.querySelector<HTMLElement>(`.weapon-preview-${name}`)!;
  }

  private stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private readonly motionChanged = () => {
    this.stop();
    if (this.root.hidden) return;
    this.demo.draw(this.elapsed, this.media.matches);
    if (!this.media.matches) {
      this.started = performance.now() - this.elapsed * 1000;
      this.frame = requestAnimationFrame(this.tick);
    }
  };

  private readonly tick = (now: number) => {
    this.frame = 0;
    if (this.root.hidden || this.destroyed || this.media.matches) return;
    // This is a small explanation, so 30 fps is enough even on high-refresh displays.
    if (now - this.lastPaint >= 1000 / 30) {
      this.lastPaint = now;
      this.elapsed = (now - this.started) / 1000;
      this.demo.draw(this.elapsed);
    }
    this.frame = requestAnimationFrame(this.tick);
  };
}
