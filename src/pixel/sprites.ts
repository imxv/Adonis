// Hand-drawn pixel sprites. Mirrored sprites store only the left half.
// Fixed colours come from palette.FIXED; digits 1-4 are biome roles (auto-shaded, except 4 = glow).

export interface SpriteDef {
  rows: string[];
  mirror?: boolean;
}

export const KNIGHT_A: SpriteDef = {
  rows: [
    '.....rr.......',
    '....rRr.......',
    '...gggggggg...',
    '..gwgggggggG..',
    '..gwggggnnnG..',
    '..gggggnnwnG..',
    '..GgggggnnnG..',
    '..GGggggggGG..',
    '...GGGGGGGG...',
    '.Rrrrrrrrrr...',
    'R..DggggggD...',
    '...DgwggggD...',
    '...DGGGGGGD...',
    '....DD..DD....',
    '...BBB..BBB...',
  ],
};

export const KNIGHT_B: SpriteDef = {
  rows: [...KNIGHT_A.rows.slice(0, 13), '....DD...DD...', '...BBB...BB...'],
};

export const SLIME_A: SpriteDef = {
  mirror: true,
  rows: ['.......', '....111', '..11111', '.111111', '.11ew11', '.11ee11', '1111111', '111111o', '1111111', '1111111', '.111111', '..11111'],
};

export const SLIME_B: SpriteDef = {
  mirror: true,
  rows: ['.......', '.......', '...1111', '.111111', '1111111', '11ew111', '11ee111', '111111o', '1111111', '1111111', '1111111', '.111111'],
};

export const BAT_A: SpriteDef = {
  mirror: true,
  rows: ['1.......', '11......', '111...1.', '.111.111', '..111111', '...111e1', '....1111', '......1w'],
};

export const BAT_B: SpriteDef = {
  mirror: true,
  rows: ['........', '......1.', '.....111', '...111e1', '.1111111', '11111111', '111.1111', '11....1w', '1.......'],
};

export const PIGLET_A: SpriteDef = {
  mirror: true,
  rows: ['.......', '.1.....', '.11....', '.111111', '1111111', '11e1111', '1111222', '1w112e2', '1111222', '.111111', '.11..11', '.BB..BB'],
};

export const PIGLET_B: SpriteDef = {
  mirror: true,
  rows: [...PIGLET_A.rows.slice(0, 10), '..11.11', '..BB.BB'],
};

export const GOBLIN_A: SpriteDef = {
  mirror: true,
  rows: ['......1', '.....11', '....111', '...1111', '2.11222', '2212242', '.112222', '.1112w2', '..11111', '.111111', '1111111', '1111111', '.111111', '..BB...'],
};

export const GOBLIN_B: SpriteDef = {
  mirror: true,
  rows: [...GOBLIN_A.rows.slice(0, 12), '..11111', '...BB..'],
};

export const SKELETON_A: SpriteDef = {
  mirror: true,
  rows: ['...1111', '..11111', '..1e411', '..11111', '...1e1e', '....111', '..1e1e1', '..11111', '...1e1e', '....111', '....111', '....1.1', '....1..', '...11..'],
};

export const SKELETON_B: SpriteDef = {
  mirror: true,
  rows: [...SKELETON_A.rows.slice(0, 12), '...1...', '..11...'],
};

export const HOUND: SpriteDef = {
  mirror: true,
  rows: ['.B....', '.BB...', '.Btttt', 'tttttt', 'ttettt', 'tttTTT', 'ttTTTe', '.tTTTT', '.ttrrr', '.ttttt', '.tt.tt', '.BB.BB'],
};

export const DOVE_A: SpriteDef = {
  mirror: true,
  rows: ['w.....', 'ww....', 'www.gg', '.wwggg', '..wgeg', '...ggy', '...ggg', '....gg', '....y.'],
};

export const DOVE_B: SpriteDef = {
  mirror: true,
  rows: ['......', '......', '....gg', '..wggg', '.wwgeg', 'wwwggy', 'ww.ggg', 'w...gg', '....y.'],
};

export const SWAN: SpriteDef = {
  rows: [
    '........ww..',
    '.......wweO.',
    '.......ww...',
    '........w...',
    '........w...',
    '.......ww...',
    '..wwwwwww...',
    '.wwwwwwwwg..',
    'wwwwwwwwwg..',
    '.gwwwwwwgg..',
    '..gggggg....',
  ],
};

export const GEM: SpriteDef = { rows: ['..1..', '.111.', '11111', '11111', '.111.', '..1..'] };

export const HEART: SpriteDef = { rows: ['.11.11.', '1111111', '1111111', '.11111.', '..111..', '...1...'] };

export const SKULL_MARK: SpriteDef = {
  mirror: true,
  rows: ['..4444', '.44444', '444..4', '444..4', '.44444', '..4.4.'],
};
