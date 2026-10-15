import Phaser from 'phaser';
import { DISPLAY_FONTS } from './fonts';
import './ui/ui.css';
import { GameScene } from './game/GameScene';

async function boot() {
  // Canvas-painted textures and Phaser text need the display fonts loaded first.
  await Promise.race([
    Promise.allSettled(DISPLAY_FONTS.map((f) => document.fonts.load(`24px "${f}"`))),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    width: 1280,
    height: 720,
    backgroundColor: '#0d0c10',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, pixelArt: false, powerPreference: 'high-performance' },
    scene: [GameScene],
    fps: { target: 60 },
    banner: false,
  });
  (window as any).__game = game;
}

boot();
