import Phaser from 'phaser';
import { DISPLAY_FONTS } from './fonts';
import './ui/ui.css';
import { GameScene } from './game/GameScene';
import { WeaponTrainingScene } from './game/WeaponTrainingScene';
import { KIT_BY_ID } from './styles/kits';
import { HUD_FOOTER_H } from './ui/ui';
import { installMobileViewport, isTouchBrowser, safeViewport, TOUCH_CONTROLS_HEIGHT } from './platform/mobile';
import './ui/mobile.css';
import { audio } from './audio/audio';
import { installUiSounds } from './audio/uiSounds';
import { provideWeaponTraining } from './ui/weaponDemo';
import { startAccount } from './ui/signIn';

// The nearby-weapon demo runs this subclass of GameScene; handing it over here keeps it in the main bundle.
provideWeaponTraining((onReady, key) => new WeaponTrainingScene(onReady, key));

const W = 480;
const H = 270;

/** Portrait gains vertical camera space; desktop keeps whole device pixels per game pixel. */
function fitViewport() {
  if (isTouchBrowser()) {
    const viewport = safeViewport();
    const parent = document.getElementById('game')!;
    if (viewport.height > viewport.width) {
      const available = Math.max(1, viewport.height - TOUCH_CONTROLS_HEIGHT);
      const zoom = Math.min(viewport.width / W, available / (H + HUD_FOOTER_H));
      const height = Math.max(H, Math.floor(available / zoom - HUD_FOOTER_H));
      // The outside HUD footer occupies the rest of the reserve above the touch deck.
      Object.assign(parent.style, { inset: 'auto', left: `${viewport.left}px`, top: `${viewport.top}px`, width: `${viewport.width}px`, height: `${height * zoom}px` });
      return { zoom, height };
    }
    const height = viewport.height;
    Object.assign(parent.style, { inset: 'auto', left: `${viewport.left}px`, top: `${viewport.top}px`, width: `${viewport.width}px`, height: `${height}px` });
    return { zoom: Math.min(viewport.width / W, height / (H + HUD_FOOTER_H * 2)), height: H };
  }
  document.getElementById('game')!.removeAttribute('style');
  const dpr = window.devicePixelRatio || 1;
  // The canvas is centered vertically, so reserve matching margins for its outside footer.
  const fit = Math.min(window.innerWidth / W, window.innerHeight / (H + HUD_FOOTER_H * 2));
  const k = Math.floor(fit * dpr);
  return { zoom: k >= 1 ? k / dpr : fit, height: H };
}

async function boot() {
  const removeViewport = installMobileViewport();
  // Safari must begin audio activation within the gesture, before card-transition timers.
  const unlockAudio = (event: Event) => {
    if (!event.isTrusted) return;
    window.removeEventListener('pointerdown', unlockAudio, true);
    window.removeEventListener('keydown', unlockAudio);
    void audio.init().catch(() => {});
  };
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
  window.addEventListener('keydown', unlockAudio);
  const removeUiSounds = installUiSounds();
  // Pixel text is rasterised from the webfonts, so they must be loaded first.
  await Promise.race([Promise.allSettled(DISPLAY_FONTS.map(([f, size]) => document.fonts.load(`${size} "${f}"`, '像素ABC123'))), new Promise((r) => setTimeout(r, 4000))]);
  const initialViewport = fitViewport();
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    width: W,
    height: initialViewport.height,
    backgroundColor: '#07060b',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.NONE, zoom: initialViewport.zoom, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: false, pixelArt: true, roundPixels: true, powerPreference: 'high-performance' },
    scene: [GameScene],
    fps: { target: 60 },
    banner: false,
  });
  const resize = () => {
    const viewport = fitViewport();
    if (game.scale.gameSize.height !== viewport.height) game.scale.setGameSize(W, viewport.height);
    game.scale.setZoom(viewport.zoom);
    game.scale.refresh();
  };
  window.addEventListener('mobileviewportchange', resize);
  game.events.once('destroy', () => {
    removeViewport();
    removeUiSounds();
    window.removeEventListener('mobileviewportchange', resize);
    window.removeEventListener('pointerdown', unlockAudio, true);
    window.removeEventListener('keydown', unlockAudio);
  });
  // Who is playing: a GitHub sign-in or a guest name, asked once over the hall.
  void startAccount();
  (window as any).__game = game;
  (window as any).__kits = KIT_BY_ID;
}

boot();
