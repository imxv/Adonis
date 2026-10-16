import type { SpriteDef } from './sprites';

/*
 * The newer monsters, two frames each. Like the first ones they store the left half and are mirrored;
 * fixed colours come from palette.FIXED, digit 1 is the biome's tint and 4 glows.
 */

const M = (rows: string[]): SpriteDef => ({ mirror: true, rows });

/** Castle: a sheet with hollow eyes that drifts through walls and fades out of reach. */
export const GHOST: [SpriteDef, SpriteDef] = [
  M(['...www', '.wwwww', 'wwwwww', 'wwgeew', 'wwweew', 'wwwwww', 'wwwwwg', 'wwwwww', 'gwwwww', 'wgwwgw', 'w.ww.w']),
  M(['......', '...www', '.wwwww', 'wwwwww', 'wwgeew', 'wwweew', 'wwwwww', 'wwwwwg', 'wwwwgw', 'gwwgww', '.ww.ww']),
];

/** Palace: a winged marble angel that only moves while you look away. */
export const ANGEL: [SpriteDef, SpriteDef] = [
  M(['G.....', 'GG..gg', 'GGG.gw', '.GGgge', 'G.Gggw', '..Gggg', '...ggw', '...ggw', '...gGg', '..gggw', '..gg.g', '.GGGGG']),
  M(['......', 'G...gg', 'GG..gw', 'GGGgge', '.GGggw', '..Gggg', '...ggw', '...ggw', '...gGg', '..gggw', '..gg.g', '.GGGGG']),
];

/** Steam works: a riveted gun turret with a glowing eye that sprays rings of bullets on the beat. */
export const TURRET: [SpriteDef, SpriteDef] = [
  M(['....GG', '..GGgg', '.GgggD', 'GggD44', 'GggD44', '.GgDDD', '..DDDD', '.DDyDD', 'DDDDDD', 'DnnnDD']),
  M(['....GG', '..GGgg', '.GgggD', 'GggDY4', 'GggD44', '.GgDDD', '..DDDD', '.DDyDD', 'DDDDDD', 'DnnnDD']),
];

/** Garden: a hooded ninja with a red scarf who blinks next to you and throws stars. */
export const NINJA: [SpriteDef, SpriteDef] = [
  M(['..nnn', '.nnnn', 'nnses', 'nnsss', '.nnnn', 'rrnnn', '.rnnn', '.nnnn', '.nnnn', '.nn.n', '.nn..']),
  M(['..nnn', '.nnnn', 'nnses', 'nnsss', '.nnnn', '.rnnn', 'rrnnn', '.nnnn', '.nnnn', '..n.n', '..nn.']),
];

/** Sunken ruins: a pink jellyfish that charges up and lets out an electric pulse. */
export const JELLY: [SpriteDef, SpriteDef] = [
  M(['...ppp', '.ppppp', 'ppwppp', 'pwpppp', 'pppppp', 'PPPPPP', '.p..p.', 'p..p..', '.p..p.', '..p..p']),
  M(['......', '...ppp', '.ppppp', 'ppwppp', 'pwpppp', 'PPPPPP', 'p..p..', '.p..p.', 'p..p..', 'p.p...']),
];

/** Neon city: a hovering drone with a cyan visor that fires two-shot bursts. */
export const DRONE: [SpriteDef, SpriteDef] = [
  M(['gggg..', '..G...', '..DDDD', '.DDccc', '.DDDDD', '..DnDD', '...D..']),
  M(['.GG...', '..G...', '..DDDD', '.DDccc', '.DDDDD', '..DnDD', '...D..']),
];

/** Glacier: a shaggy yeti that hurls big snowballs. */
export const YETI: [SpriteDef, SpriteDef] = [
  M(['...wwww', '..wwwww', '.wwkkkk', '.wwkeke', 'wwwkkkk', 'wwwkwwk', 'gwwwwww', 'wwgwwww', 'wwwwgww', '.wwwwww', '.wwwwww', '.www.ww', '.ggg.gg']),
  M(['.......', '...wwww', '..wwwww', '.wwkkkk', '.wwkeke', 'wwwkkkk', 'wwwkwwk', 'gwwwwww', 'wwgwwww', '.wwwgww', '.wwwwww', '.www.ww', '..gg.gg']),
];

/** Sand temple: a scorpion, tail curled over its back, pincers out front. */
export const SCORPION: [SpriteDef, SpriteDef] = [
  M(['......b', '.....bt', '.....b.', 'bb...b.', 'b.b..t.', '.bbtttt', '..ttetb', '.ttttte', 'b.t.b.t', '.b..b..']),
  M(['......b', '.....bt', '....b..', '.b...b.', 'bb...t.', '.bbtttt', '..ttetb', '.ttttte', '.bt.b.t', 'b...b..']),
];

/** Magma depths: a crusted lava slime with glowing cracks; it splits in two when killed. */
export const MAGMA: [SpriteDef, SpriteDef] = [
  M(['.......', '....OOO', '..OOOOO', '.OOYOOO', '.OOewOO', '.OOeeOY', 'BOOOOOO', 'OOOOOOB', 'OYOOOOO', 'BOOOOOO', '.BOOOOO', '..BBBBB']),
  M(['.......', '.......', '...OOOO', '.OOYOOO', 'OOOOOOO', 'OOewOOO', 'BOeeOOY', 'OOOOOOB', 'OYOOOOO', 'BOOOOOO', 'BOOOOOO', '.BBBBBB']),
];

/** Forest: a walking toadstool that bursts into spores when it dies. */
export const SPORELING: [SpriteDef, SpriteDef] = [
  M(['...rrr', '.rrwrr', 'rrrrrw', 'rwrrrr', 'RRRRRR', '..TTTT', '..TeTe', '..TTTT', '..TTTT', '..T..T']),
  M(['......', '...rrr', '.rrwrr', 'rrrrrw', 'rwrrrr', 'RRRRRR', '..TeTe', '..TTTT', '..TTTT', '.T...T']),
];

/** Anywhere from the third floor: a hulking brute with a club that slams the ground. */
export const BRUTE: [SpriteDef, SpriteDef] = [
  M(['....111', '...1111', '..11e1e', '..11111', '.1111ww', '11111ww', '1b11111', 'bb11111', 'bb11111', 'b.11111', '..11.11', '.111.11', '.BBB.BB']),
  M(['.......', '....111', '...1111', '..11e1e', '..11111', '.1111ww', '11111ww', '1b11111', 'bb11111', 'bb11111', 'b.11111', '.111.11', '.BBB.BB']),
];
