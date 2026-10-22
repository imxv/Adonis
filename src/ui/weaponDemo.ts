import type Phaser from 'phaser';
import type { WeaponInstance } from '../data/weapons';
import type { RunState } from '../game/run';
import type { WeaponMetrics } from '../game/weaponMetrics';
import type { WeaponTrainingScene } from '../game/WeaponTrainingScene';
import { pxText } from '../pixel/draw';
import { E } from '../pixel/palette';

let nextTrainingId = 0;

/** The HUD window looks through to a real, isolated combat scene on the main game canvas. */
export class WeaponDemo {
  private readonly key = `weapon-training-${++nextTrainingId}`;
  private training?: WeaponTrainingScene;
  private loading?: Promise<void>;
  private configured = '';
  private pending?: { weapon: WeaponInstance; run: RunState; signature: string };
  private viewport = { x: 0, y: 0, width: 112, height: 44 };
  private visible = false;
  private still = false;
  private ready = false;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly game: Phaser.Game) {
    canvas.width = 112;
    canvas.height = 44;
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = E.ink;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(pxText('准备试用…', { color: E.greyM }), 8, 16);
  }

  set(weapon: WeaponInstance, run: RunState, metrics: WeaponMetrics) {
    const signature = JSON.stringify([weapon.def.id, run.hero, run.ascended, run.styles[run.level].id, metrics]);
    this.pending = { weapon, run, signature };
    this.configure();
    if (!this.loading && !this.training) this.loading = this.load();
  }

  private async load() {
    try {
      // GameScene imports the HUD; loading the subclass only after boot avoids an import cycle.
      const { WeaponTrainingScene } = await import('../game/WeaponTrainingScene');
      if (this.disposed) return;
      const scene = new WeaponTrainingScene(() => {
        if (this.disposed) {
          scene.scene.setVisible(false);
          scene.scene.pause();
          this.game.scene.remove(this.key);
          return;
        }
        this.ready = true;
        this.configure();
        this.applyViewport();
        this.canvas.getContext('2d')!.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.syncVisibility();
      }, this.key);
      this.training = scene;
      this.game.scene.add(this.key, scene, true);
    } catch (error) {
      console.error('Weapon training scene could not start', error);
      const ctx = this.canvas.getContext('2d')!;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = E.ink;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.drawImage(pxText('演示暂不可用', { color: E.greyM }), 5, 16);
    }
  }

  private configure() {
    if (!this.ready || !this.training || !this.pending || this.configured === this.pending.signature) return;
    this.training.configure(this.pending.weapon, this.pending.run);
    this.configured = this.pending.signature;
  }

  setViewport(x: number, y: number, width: number, height: number) {
    if (x === this.viewport.x && y === this.viewport.y && width === this.viewport.width && height === this.viewport.height) return;
    this.viewport = { x, y, width, height };
    this.applyViewport();
  }

  private applyViewport() {
    if (!this.ready || !this.training) return;
    const v = this.viewport;
    this.training.setViewport(v.x, v.y, v.width, v.height);
  }

  draw(_time: number, still = false) {
    this.visible = true;
    this.still = still;
    this.syncVisibility();
  }

  hide() {
    this.visible = false;
    this.syncVisibility();
  }

  private syncVisibility() {
    const scene = this.training;
    if (!this.ready || !scene || this.disposed) return;
    scene.scene.setVisible(this.visible);
    if (!this.visible || this.still) {
      if (scene.sys.isActive()) scene.scene.pause();
    } else if (scene.sys.isPaused()) scene.scene.resume();
  }

  destroy() {
    this.hide();
    this.disposed = true;
    if (this.training && this.game.scene.keys[this.key] === this.training) this.game.scene.remove(this.key);
    this.training = undefined;
    this.pending = undefined;
  }
}
