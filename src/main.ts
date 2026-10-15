import Phaser from 'phaser';
import { DISPLAY_FONTS } from './fonts';
import './ui/ui.css';
import { GameScene } from './game/GameScene';
import { KIT_BY_ID } from './styles/kits';

async function boot() {
  // Pixel text is rasterised from the webfont, so it must be loaded first.
  await Promise.race([Promise.allSettled(DISPLAY_FONTS.map((f) => document.fonts.load(`8px "${f}"`))), new Promise((r) => setTimeout(r, 2500))]);
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    width: 640,
    height: 360,
    backgroundColor: '#0b0a12',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: false, pixelArt: true, roundPixels: true, powerPreference: 'high-performance' },
    scene: [GameScene],
    fps: { target: 60 },
    banner: false,
  });
  (window as any).__game = game;
  (window as any).__kits = KIT_BY_ID;
}

boot();
