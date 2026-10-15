import Phaser from 'phaser';
import { DISPLAY_FONTS } from './fonts';
import './ui/ui.css';
import { GameScene } from './game/GameScene';
import { KIT_BY_ID } from './styles/kits';

const W = 480;
const H = 270;

/** Whole device pixels per game pixel, so every pixel on screen is the same size. */
function fitZoom() {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H) * dpr);
  return Math.max(1, k) / dpr;
}

async function boot() {
  // Pixel text is rasterised from the webfonts, so they must be loaded first.
  await Promise.race([Promise.allSettled(DISPLAY_FONTS.map(([f, size]) => document.fonts.load(`${size} "${f}"`, '像素ABC123'))), new Promise((r) => setTimeout(r, 4000))]);
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: '#07060b',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.NONE, zoom: fitZoom(), autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: false, pixelArt: true, roundPixels: true, powerPreference: 'high-performance' },
    scene: [GameScene],
    fps: { target: 60 },
    banner: false,
  });
  window.addEventListener('resize', () => game.scale.setZoom(fitZoom()));
  (window as any).__game = game;
  (window as any).__kits = KIT_BY_ID;
}

boot();
