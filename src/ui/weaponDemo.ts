import type Phaser from 'phaser';
import type { WeaponInstance } from '../data/weapons';
import type { RunState } from '../game/run';
import type { WeaponMetrics } from '../game/weaponMetrics';
import type { WeaponTrainingScene } from '../game/WeaponTrainingScene';
import { pxText } from '../pixel/draw';
import { E } from '../pixel/palette';

let nextTrainingId = 0;
type TrainingFactory = (onReady: () => void, key: string) => WeaponTrainingScene;
let createTraining: TrainingFactory | undefined;
/** Seconds before a demo that failed to start is tried again. */
const RETRY_AFTER = 2;

/**
 * main.ts hands the scene class over at startup. Importing it here would close a cycle
 * (GameScene → HUD → demo → GameScene), and a lazily loaded chunk can go missing when the
 * page outlives a redeploy or a dev-server restart, which left the demo stuck on its error.
 */
export function provideWeaponTraining(factory: TrainingFactory) {
  createTraining = factory;
}

/** The HUD window looks through to a real, isolated combat scene on the main game canvas. */
export class WeaponDemo {
  private key = '';
  private training?: WeaponTrainingScene;
  private failedAt = -Infinity;
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
    this.message('准备试用…', 8);
  }

  set(weapon: WeaponInstance, run: RunState, metrics: WeaponMetrics) {
    const signature = JSON.stringify([weapon.def.id, run.hero, run.ascended, run.styles[run.level].id, metrics]);
    this.pending = { weapon, run, signature };
    this.configure();
    if (!this.training && performance.now() - this.failedAt > RETRY_AFTER * 1000) this.load();
  }

  private load() {
    // Every attempt gets its own key, so a scene left behind by a failed start can never block the next one.
    const key = `weapon-training-${++nextTrainingId}`;
    try {
      if (!createTraining) throw new Error('The weapon training scene was not provided at startup');
      const scene = createTraining(() => {
        if (this.disposed) {
          scene.scene.setVisible(false);
          scene.scene.pause();
          this.game.scene.remove(key);
          return;
        }
        this.ready = true;
        this.configure();
        this.applyViewport();
        this.canvas.getContext('2d')!.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.syncVisibility();
      }, key);
      this.key = key;
      this.training = scene;
      // The scene starts synchronously here, so an error while it builds lands in the catch below.
      this.game.scene.add(key, scene, true);
    } catch (error) {
      console.error('Weapon training scene could not start', error);
      try {
        if (this.game.scene.keys[key]) this.game.scene.remove(key);
      } catch (cleanup) {
        console.error('Weapon training scene could not be removed', cleanup);
      }
      this.key = '';
      this.training = undefined;
      this.ready = false;
      this.configured = '';
      this.failedAt = performance.now();
      this.message('演示暂不可用', 5);
    }
  }

  private message(text: string, x: number) {
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = E.ink;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(pxText(text, { color: E.greyM }), x, 16);
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
    if (this.training && this.key && this.game.scene.keys[this.key] === this.training) this.game.scene.remove(this.key);
    this.training = undefined;
    this.pending = undefined;
  }
}
