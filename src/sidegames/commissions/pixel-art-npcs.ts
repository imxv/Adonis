import { Grid } from '../../pixel/draw';
import type { RenderOpts } from '../../pixel/draw';
import type { NpcId } from '../../meta/life';

// Original 17 × 20 source-pixel residents. Their silhouette and work clothes
// distinguish the harbour fisherman from the garden keeper before any label.
const NEREUS_ROWS = [
  '.....hhhhh.......',
  '....hHHHHHh......',
  '...hHHHYHHHh.....',
  '..hhyyyyyyyhh....',
  '....wwsssss......',
  '....wsssoSs......',
  '....wwsssss......',
  '.....wwwwww......',
  '.....wWwwWw......',
  '....ccbbbbb......',
  '...scccwwwwb.....',
  '...sccbbbbbb.....',
  '....ccwwwwwb.....',
  '.....bbbbbb......',
  '.....BbbbbB......',
  '.....bbbbbb......',
  '.....bb..bb......',
  '.....bb..bb......',
  '....kkk..kkk.....',
  '....kkk..kkk.....',
];

const DAPHNE_ROWS = [
  '......hhhh.......',
  '.....hHHHHhh.....',
  '....hHHHHHHh.....',
  '...lhHsssssHh....',
  '...LhHsssoSHh....',
  '....hHsssssHh....',
  '....hHHsSsHHh....',
  '....hHHhhhHHh....',
  '.....hgeeegh.....',
  '....sgeegeegs....',
  '....sgggggggs....',
  '...ssgrgggrgss...',
  '....tgggggggt....',
  '....TtgggggtT....',
  '....TttgggttT....',
  '....TTtttttTT....',
  '.....ttttttt.....',
  '......ss.ss......',
  '.....kkk.kkk.....',
  '.....kkk.kkk.....',
];

const FISHERMAN_PALETTE: RenderOpts = {
  outline: '#263e3a',
  roles: {
    h: ['#e6d096', '#b9a16a', '#887746'],
    b: ['#82a8b4', '#426f83', '#2e5068'],
    s: ['#e4bc96', '#c99a79', '#9c6e56'],
    k: ['#776951', '#514c40', '#343b34'],
  },
  colors: {
    H: '#e7d39a', Y: '#f7e3ac', y: '#846d42',
    w: '#e7e6d1', W: '#b5c5bd', c: '#e4dfc8',
    S: '#a3755d', o: '#253b3b', B: '#2a4e64',
  },
};

const GARDENER_PALETTE: RenderOpts = {
  outline: '#2b3f33',
  roles: {
    h: ['#82513b', '#54382d', '#3d2c27'],
    g: ['#a5b877', '#648859', '#416248'],
    t: ['#d5a378', '#b27758', '#855342'],
    s: ['#efcaa5', '#d7a57f', '#aa775e'],
    k: ['#886649', '#614832', '#403b2c'],
  },
  colors: {
    H: '#8c5d42', S: '#b78065', o: '#273d36',
    l: '#7b9e59', L: '#e9ca7b', e: '#eee0b5',
    T: '#885440', r: '#d1bd7b', n: '#bd9255', N: '#85653c',
    v: '#507a49', V: '#acc374', f: '#e8c584',
  },
};

function fisherman(waving: boolean): HTMLCanvasElement {
  const sprite = Grid.ascii(NEREUS_ROWS);
  // The right hand tips up in greeting; the body and foot anchor stay stable.
  if (waving) {
    sprite.set(12, 9, 'b').set(13, 9, 's').set(13, 8, 's');
    sprite.set(12, 10, 'b');
  } else {
    sprite.set(12, 11, 'b').set(13, 11, 's').set(13, 12, 's');
  }
  return sprite.render(FISHERMAN_PALETTE);
}

function gardener(breath: boolean): HTMLCanvasElement {
  const sprite = Grid.ascii(DAPHNE_ROWS);
  // A little wicker basket hangs from the near hand. Leaves move one source
  // pixel while the skirt, head and shoes keep an identical placement.
  sprite.set(13, 11, 's').set(14, 11, 'N');
  sprite.set(13, 12, 'N').set(15, 12, 'N');
  sprite.rect(13, 13, 3, 2, 'n').line(13, 15, 15, 15, 'N');
  sprite.set(14, 13, 'N').set(14, 14, 'N');
  sprite.set(14, 12, 'v').set(15, breath ? 10 : 11, 'V');
  sprite.set(13, breath ? 10 : 11, 'f');
  return sprite.render(GARDENER_PALETTE);
}

/** No retained cache, scheduling or state. The scene owns and releases every canvas. */
export function createCommissionNpcFrames(): Record<NpcId, HTMLCanvasElement[]> {
  return {
    nereus: [fisherman(false), fisherman(true)],
    daphne: [gardener(false), gardener(true)],
  };
}
