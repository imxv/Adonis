import { E } from '../pixel/palette';

/**
 * Gallery art contract v1. Plain data, CSS colours and CSS-pixel measurements:
 * safe to import without a DOM, Phaser or Three. CSS twins live in visualTheme.css.
 * Do not apply these CSS-pixel sizes inside the legacy zoomed #ui-root.
 */
export const VISUAL_THEME = {
  version: 1,
  colors: {
    night: E.ink,
    nightDeep: '#0e111b',
    ivory: E.cream,
    marble: '#f3e9d2',
    oldGold: '#c5a461',
    terracotta: E.rust,
    seaBlue: E.blueD,
    cypressGreen: E.greenDD,
  },
  surface: {
    canvas: '#0e111b',
    panel: '#1b202b',
    raised: '#252b36',
    inset: '#141923',
    border: '#776748',
    borderStrong: '#c5a461',
    scrim: 'rgba(14, 17, 27, 0.88)',
  },
  text: {
    primary: '#f3e9d2',
    secondary: '#c4bcaa',
    muted: '#a69d8b',
    inverse: '#181425',
    accent: '#e4bc71',
  },
  state: {
    focus: '#a9d6e5',
    selected: '#e4bc71',
    success: '#b4cda0',
    warning: '#e4bc71',
    danger: '#f0ad98',
    dangerFill: '#9c3b2a',
    disabled: '#8f918e',
  },
  typography: {
    // Keep local FusionPixel and existing Press Start 2P; no remote font request.
    body: "'ag-fusion-pixel', 'FusionPixel', monospace",
    latin: "'Press Start 2P', 'ag-fusion-pixel', monospace",
    bodyPx: 12,
    titlePx: 24,
    latinPx: 8,
    lineHeight: 2,
    maxLineCharacters: 32,
  },
  layout: {
    unitPx: 4,
    gapPx: 12,
    panelPaddingPx: 24,
    touchTargetPx: 48,
    contentMaxPx: 1200,
    compactBreakpointPx: 640,
  },
  motion: { feedbackMs: 120, enterMs: 180, reducedMs: 0 },
  pixel: { imageRendering: 'pixelated', allowedScales: [1, 2, 3, 4] },
  world3d: {
    // Colour intent only. Exposure / tone mapping belongs to the renderer owner.
    sky: '#749aa9',
    haze: '#bdc7b5',
    sea: E.blueD,
    marbleLight: '#f3e9d2',
    marbleShadow: '#a1a9ae',
    stone: '#b4a485',
    soil: E.rust,
    foliage: E.greenDD,
    foliageLight: '#78956b',
    oldGold: '#c5a461',
    warmLight: '#f2d5a1',
    coolShadow: '#3a4466',
  },
} as const;

export type VisualTheme = typeof VISUAL_THEME;
