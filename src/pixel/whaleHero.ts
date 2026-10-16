import { Grid } from './draw';

// The body stays centred on x = 10; the fins and curling tail extend its silhouette.
// Feet sit at y = 18 after the rendering margin, matching the shared 0.85 origin.
const WHALE_A = [
  '.........hh.........',
  '........h..k........',
  '........kkk.........',
  '.......whwhwhw......',
  '......khHhhhhhK.....',
  '...KwkKhHhhhhKkwK...',
  '....KkKhHhHsssKkK...',
  '.......khKssses.....',
  '.h...k.khKsspSs.....',
  '.hk.kk.khKsssSk.....',
  '..hkk..khKwswKk.....',
  '..hk...khDwDwwDw....',
  '..hk..khKDWwwDss....',
  '...hk.khKDwwwDD.....',
  '....hkkkKDwwwDDD....',
  '.....hhkwwwwwwww....',
  '.........ww..ww.....',
  '........nnn..nnn....',
  '....................',
];

const WHALE_B = [
  '.........hh.........',
  '........h..k........',
  '........kkk.........',
  '.......whwhwhw......',
  '......khHhhhhhK.....',
  '...KwkKhHhhhhKkwK...',
  '....KkKhHhHsssKkK...',
  '.......khKssses.....',
  '..h...kkhKsspSs.....',
  '..hk.kkkhKsssSk.....',
  '...hkk.khKwswKk.....',
  '...hk..khDwDwwDw....',
  '...hk..hKDWwwDss....',
  '...hk..hKDwwwDD.....',
  '....hkkhKDwwwDD.....',
  '.....hhKwwwwwwww....',
  '........ww....ww....',
  '.......nnn....nnn...',
  '....................',
];

const WHALE_COLORS = {
  h: '#76b3ef', // Soft blue highlights and the lit edge of the whale tail.
  H: '#b8e6ff',
  k: '#4380cf',
  K: '#285398',
  D: '#244775',
  n: '#202e50',
  w: '#f2f6ff',
  W: '#bbd8ef',
  s: '#ffe1d0',
  S: '#e6b8aa',
  p: '#efa6ac',
  e: '#356bcb',
};

/** Native-scale, right-facing frames; weapons remain separate shared game sprites. */
export function whaleHeroFrames(): { a: HTMLCanvasElement; b: HTMLCanvasElement } {
  return {
    a: Grid.ascii(WHALE_A).render({ colors: WHALE_COLORS }),
    b: Grid.ascii(WHALE_B).render({ colors: WHALE_COLORS }),
  };
}
