// Endesga 32 — one fixed palette keeps every biome and sprite coherent.
export const E = {
  rust: '#be4a2f',
  clay: '#d77643',
  cream: '#ead4aa',
  tan: '#e4a672',
  brownL: '#b86f50',
  brown: '#733e39',
  brownD: '#3e2731',
  redD: '#a22633',
  red: '#e43b44',
  orange: '#f77622',
  amber: '#feae34',
  yellow: '#fee761',
  green: '#63c74d',
  greenD: '#3e8948',
  greenDD: '#265c42',
  tealD: '#193c3e',
  blueD: '#124e89',
  blue: '#0099db',
  cyan: '#2ce8f5',
  white: '#ffffff',
  grey: '#c0cbdc',
  greyM: '#8b9bb4',
  slate: '#5a6988',
  slateD: '#3a4466',
  navy: '#262b44',
  ink: '#181425',
  hot: '#ff0044',
  purple: '#68386c',
  magenta: '#b55088',
  pink: '#f6757a',
  skin: '#e8b796',
  skinD: '#c28569',
} as const;

/** Fixed colours used by hand-drawn sprites. Role digits 1-3 are tinted per biome and auto-shaded. */
export const FIXED: Record<string, string> = {
  o: E.ink,
  e: E.ink,
  w: E.white,
  g: E.grey,
  G: E.greyM,
  D: E.slate,
  n: E.navy,
  r: E.red,
  R: E.redD,
  y: E.amber,
  Y: E.yellow,
  O: E.orange,
  b: E.brown,
  B: E.brownD,
  t: E.tan,
  T: E.cream,
  s: E.skin,
  S: E.skinD,
  p: E.pink,
  P: E.magenta,
  c: E.cyan,
  k: E.blue,
  K: E.blueD,
  l: E.green,
  L: E.greenD,
  v: E.purple,
};

export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + ((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1);
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexRgb(a);
  const [r2, g2, b2] = hexRgb(b);
  return rgbHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** A three-step ramp (light, base, dark) for auto-shading a role colour. */
export function ramp(base: string, light?: string, dark?: string): [string, string, string] {
  return [light ?? mix(base, '#fff3d6', 0.32), base, dark ?? mix(base, E.ink, 0.42)];
}

export function lum(hex: string): number {
  const [r, g, b] = hexRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
