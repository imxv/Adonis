import Phaser from 'phaser';
import { Rng } from '../core/rng';
import { ARENA } from '../game/arena';
import { Grid, flipCanvas, outlineCanvas, pxText, ramp, type Ramp } from '../pixel/draw';
import { E, mix } from '../pixel/palette';
import * as S from '../pixel/sprites';
import type { Biome } from '../pixel/biomes';

export const K = (name: string, kit: Biome) => `${name}@${kit.id}`;

function add(scene: Phaser.Scene, key: string, c: HTMLCanvasElement) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, c);
}

const sprite = (d: S.SpriteDef) => Grid.ascii(d.rows, d.mirror);

/** Data-URL icons for the DOM HUD and cards. */
export const ICONS: Record<string, string> = {};

function icon(name: string, c: HTMLCanvasElement) {
  ICONS[name] = c.toDataURL();
}

// ---------------------------------------------------------------- shared art

export function buildCommonTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('knight-a')) return;

  add(scene, 'knight-a', sprite(S.KNIGHT_A).render());
  add(scene, 'knight-b', sprite(S.KNIGHT_B).render());
  icon('knight', scene.textures.get('knight-a').getSourceImage() as HTMLCanvasElement);
  icon('armor', Grid.ascii(['GgggggG', 'GgwgggG', 'GgggggG', 'GgggggG', '.GgggG.', '..GgG..', '...G...']).render());
  icon('xp', sprite(S.GEM).render({ roles: { 1: ramp(E.cyan, E.white, E.blue) } }));

  // Guns, drawn facing right with the grip on the left.
  const guns: Record<string, string[]> = {
    bolt: ['ggggggggg.', 'GGGGGGGGGw', 'DDBBD.....', '.BBB......', '.BB.......'],
    spread: ['bb....gggggggggg', 'bbbbGGGGGGGGGGGw', 'bbbbbDDDDDDDDDD.', '.bb...B.........'],
    beam: ['....kkkkkkkkk..', 'DDDDccccccccccw', 'DDDDkkkkkkkkk..', '..DD...........', '..DD...........'],
    mortar: ['...LLLLLLLLL.', '..LlllllllLLy', '..LLLLLLLLLLy', '.DDDDLLLLLLL.', '..BB.........', '..BB.........'],
    boomerang: ['..ggg..', '.gwwwg.', 'gw...wg', 'gw...wg', 'gw...wg', '.gwwwg.', '..ggg..'],
    chain: ['..yyyy........', '.DDDDDDDDDDy..', 'DDcDcDcDcDDDyw', '.DDDDDDDDDDy..', '..BB..........', '..BB..........'],
  };
  for (const [id, rows] of Object.entries(guns)) {
    const c = Grid.ascii(rows).render();
    add(scene, `gun-${id}`, c);
    icon(`gun-${id}`, c);
  }

  // Player projectiles.
  add(scene, 'b-bolt', Grid.ascii(['.YYYY.', 'YwwwwY', '.YYYY.']).render({ outline: E.orange }));
  add(scene, 'b-pellet', Grid.ascii(['.OO.', 'OYYO', 'OYYO', '.OO.']).render({ outline: E.redD }));
  add(scene, 'b-shell', Grid.ascii(['.LL.', 'LllL', 'LllL', '.LL.']).render());
  add(scene, 'b-blade', Grid.ascii(guns.boomerang).render());
  add(scene, 'b-shard', Grid.ascii(['wcc', 'ccc']).render({ outline: false }));
  add(scene, 'b-orb', Grid.ascii(['.cc.', 'cwwc', 'cwwc', '.cc.']).render({ outline: E.blueD }));
  add(scene, 'b-axe', Grid.ascii(['.ggg..', 'gwwgb.', 'gwggbb', '.gg.bb', '....bb', '.....b']).render());
  add(scene, 'b-book', Grid.ascii(['PPPPPT', 'PyyyPT', 'PyPyPT', 'PyyyPT', 'PPPPPT']).render());

  // Spell icons for cards and HUD.
  const spellIcons: Record<string, string[]> = {
    orbit: ['PPPPPPT', 'PyyyyPT', 'PyPPyPT', 'PyyyyPT', 'PyPPyPT', 'PPPPPPT'],
    aura: ['..y.y..', '.yYYYy.', 'yYwwwYy', '.YwwwY.', 'yYwwwYy', '.yYYYy.', '..y.y..'],
    lightning: ['...YY', '..YY.', '.YYYY', '...YY', '..YY.', '.YY..', 'YY...'],
    missile: ['..cc..', '.cwwc.', 'cwwwwc', 'cwwwwc', '.cwwc.', '..cc..'],
    axe: ['.ggg...', 'gwwgb..', 'gwggbb.', '.gg.bb.', '....bb.', '.....bb'],
    nova: ['...c...', '.c.c.c.', '..ccc..', 'cccwccc', '..ccc..', '.c.c.c.', '...c...'],
  };
  for (const [id, rows] of Object.entries(spellIcons)) {
    const c = Grid.ascii(rows).render();
    icon(`spell-${id}`, c);
    add(scene, `spell-${id}`, c);
  }

  // Treasure-room pedestal and the trapdoor to the next floor.
  const ped = new Grid(18, 10);
  ped.rect(0, 0, 18, 3, '1').rect(2, 3, 14, 7, '2').rect(4, 4, 1, 5, '1').rect(13, 4, 1, 5, '1');
  add(scene, 'pedestal', ped.render({ roles: { 1: ramp(E.grey, E.white, E.greyM), 2: ramp(E.greyM, E.grey, E.slate) } }));
  const trap = new Grid(28, 18);
  trap.ellipse(13.5, 9, 13.5, 8.5, '1').ellipse(13.5, 9.5, 11, 6.5, 'e').rect(8, 6, 1, 7, 'b').rect(18, 6, 1, 7, 'b');
  for (let y = 7; y < 14; y += 2) trap.rect(8, y, 11, 1, 'b');
  add(scene, 'trapdoor', trap.render({ roles: { 1: ramp(E.slate, E.greyM, E.slateD) } }));
  const barsH = new Grid(30, 8);
  for (let x = 1; x < 30; x += 5) barsH.rect(x, 0, 2, 8, '1');
  barsH.rect(0, 1, 30, 2, '1').rect(0, 5, 30, 2, '1');
  add(scene, 'bars-h', barsH.render({ roles: { 1: ramp(E.greyM, E.grey, E.slateD) } }));
  const barsV = new Grid(8, 30);
  for (let y = 1; y < 30; y += 5) barsV.rect(0, y, 8, 2, '1');
  barsV.rect(1, 0, 2, 30, '1').rect(5, 0, 2, 30, '1');
  add(scene, 'bars-v', barsV.render({ roles: { 1: ramp(E.greyM, E.grey, E.slateD) } }));

  // Pickups.
  const gemCols: Record<string, Ramp> = { 1: ramp(E.blue, E.cyan, E.blueD), 2: ramp(E.green, '#a8f07a', E.greenD), 3: ramp(E.red, E.pink, E.redD) };
  for (const [tier, r] of Object.entries(gemCols)) {
    const c = sprite(S.GEM).render({ roles: { 1: r } });
    c.getContext('2d')!.fillStyle = '#ffffff';
    c.getContext('2d')!.fillRect(3, 2, 1, 1);
    add(scene, `gem-${tier}`, c);
  }
  add(scene, 'heart', sprite(S.HEART).render({ roles: { 1: ramp(E.red, E.pink, E.redD) } }));
  icon('heart', sprite(S.HEART).render({ roles: { 1: ramp(E.red, E.pink, E.redD) } }));

  const chest = new Grid(16, 13);
  chest.rect(1, 1, 14, 5, '1').rect(1, 6, 14, 7, '1').rect(1, 5, 14, 1, 'y').rect(3, 1, 1, 12, 'y').rect(12, 1, 1, 12, 'y').rect(7, 4, 2, 4, 'Y').set(7, 6, 'e');
  add(scene, 'chest', chest.render({ roles: { 1: ramp(E.brownL, E.tan, E.brown) } }));
  const open = new Grid(16, 14);
  open.rect(1, 0, 14, 3, '1').rect(1, 3, 14, 2, 'Y').rect(2, 4, 12, 2, 'w').rect(1, 6, 14, 8, '1').rect(3, 6, 1, 8, 'y').rect(12, 6, 1, 8, 'y');
  add(scene, 'chest-open', open.render({ roles: { 1: ramp(E.brownL, E.tan, E.brown) } }));

  // Pets.
  add(scene, 'pet-hound', sprite(S.HOUND).render());
  add(scene, 'pet-dove', sprite(S.DOVE_A).render());
  add(scene, 'pet-dove-b', sprite(S.DOVE_B).render());
  add(scene, 'pet-swan', Grid.ascii(S.SWAN.rows).render());
  for (const p of ['hound', 'dove', 'swan']) icon(`pet-${p}`, (scene.textures.get(`pet-${p}`).getSourceImage() as HTMLCanvasElement));

  // Props.
  const barrel = new Grid(10, 12);
  barrel.rect(1, 0, 8, 12, '1').rect(0, 2, 10, 8, '1').rect(0, 3, 10, 1, 'n').rect(0, 8, 10, 1, 'n').rect(4, 4, 2, 3, 'Y').set(4, 7, 'Y').set(5, 7, 'Y');
  add(scene, 'barrel', barrel.render({ roles: { 1: ramp(E.red, E.pink, E.redD) } }));
  const crate = new Grid(12, 12);
  crate.rect(0, 0, 12, 12, '1').line(1, 1, 10, 10, '2').line(10, 1, 1, 10, '2').rect(0, 0, 12, 1, '2').rect(0, 11, 12, 1, '2').rect(0, 0, 1, 12, '2').rect(11, 0, 1, 12, '2');
  add(scene, 'crate', crate.render({ roles: { 1: ramp(E.tan, E.cream, E.brownL), 2: ramp(E.brownL, E.tan, E.brown) } }));

  // Anemone floor decal and petal.
  const bloom = new Grid(11, 11);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    bloom.ellipse(5 + Math.cos(a) * 3, 5 + Math.sin(a) * 3, 1.6, 1.6, '1');
  }
  bloom.ellipse(5, 5, 1, 1, 'e');
  add(scene, 'bloom', bloom.render({ roles: { 1: ramp(E.red, E.pink, E.redD) }, outline: false }));
  add(scene, 'petal', Grid.ascii(['.rr', 'rRr', 'rr.']).render({ outline: false }));

  // Effects.
  for (let i = 0; i < 5; i++) {
    const g = new Grid(26, 26);
    const r = 4 + i * 2.6;
    if (i < 3) g.ellipse(13, 13, r, r, i === 0 ? 'w' : 'O').ellipse(13, 13, r * 0.65, r * 0.65, i === 0 ? 'w' : 'Y').ellipse(13, 13, r * 0.3, r * 0.3, 'w');
    else {
      const rng = new Rng(i * 31);
      for (let k = 0; k < 9; k++) g.ellipse(13 + rng.range(-r, r) * 0.7, 13 + rng.range(-r, r) * 0.7, rng.range(1.5, 3.2), rng.range(1.5, 3.2), i === 3 ? 'G' : 'D');
    }
    add(scene, `boom-${i}`, g.render({ outline: i < 3 ? E.redD : false }));
  }
  add(scene, 'spark', Grid.ascii(['.w.', 'www', '.w.']).render({ outline: false }));
  add(scene, 'muzzle', Grid.ascii(['..Y..', '.YwY.', 'YwwwY', '.YwY.', '..Y..']).render({ outline: false }));
  add(scene, 'dot', Grid.ascii(['ww', 'ww']).render({ outline: false }));
  add(scene, 'smoke', Grid.ascii(['.GG.', 'GGGG', 'GGGG', '.GG.']).render({ outline: false }));
  const shadow = document.createElement('canvas');
  shadow.width = 14;
  shadow.height = 5;
  const sctx = shadow.getContext('2d')!;
  sctx.fillStyle = 'rgba(24,20,37,0.45)';
  sctx.fillRect(2, 0, 10, 5);
  sctx.fillRect(0, 1, 14, 3);
  add(scene, 'shadow', shadow);

  const glow = document.createElement('canvas');
  glow.width = glow.height = 32;
  const gctx = glow.getContext('2d')!;
  const grad = gctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  gctx.fillStyle = grad;
  gctx.fillRect(0, 0, 32, 32);
  add(scene, 'glow', glow);

  // Boss: the boar that killed Adonis, side view facing right.
  add(scene, 'boss-boar', boar().render({ roles: { 1: ramp('#4a2e2a', '#7a4a3c', E.brownD), 2: ramp(E.pink, '#ffb0a8', E.skinD), 3: ramp(E.brownD, E.brown, E.ink) } }));
  icon('boar', scene.textures.get('boss-boar').getSourceImage() as HTMLCanvasElement);
  icon('chest', scene.textures.get('chest-open').getSourceImage() as HTMLCanvasElement);
}

function boar(): Grid {
  const g = new Grid(40, 28);
  g.ellipse(17, 15, 14, 8, '1');
  for (let x = 5; x <= 25; x += 3) g.tri(x, 9, x + 3, 9, x + 1, 2 + ((x * 7) % 3), '3');
  g.ellipse(29, 15, 7, 6, '1');
  g.tri(25, 9, 28, 3, 30, 9, '3');
  g.rect(34, 12, 4, 5, '2').set(36, 13, 'e').set(36, 15, 'e');
  for (const [x, y] of [[33, 18], [34, 18], [35, 17], [36, 16], [36, 15], [37, 14]] as [number, number][]) g.set(x, y, 'w');
  g.set(30, 12, 'r').set(31, 12, 'r').set(30, 11, 'w');
  for (const x of [7, 12, 21, 26]) g.rect(x, 20, 3, 6, '3').rect(x, 26, 3, 1, 'B');
  g.set(2, 12, '3').set(1, 11, '3').set(2, 10, '3');
  return g;
}

function golem(): Grid {
  const g = new Grid(30, 30);
  g.ellipse(15, 18, 9, 8, '1');
  g.rect(10, 3, 10, 9, '1');
  g.ellipse(5, 12, 4, 4, '2').ellipse(24, 12, 4, 4, '2');
  g.rect(2, 14, 5, 10, '2').rect(23, 14, 5, 10, '2');
  g.ellipse(4, 25, 3, 3, '1').ellipse(25, 25, 3, 3, '1');
  g.rect(9, 24, 4, 6, '2').rect(17, 24, 4, 6, '2');
  g.rect(12, 7, 2, 2, '4').rect(16, 7, 2, 2, '4');
  g.ellipse(15, 18, 2, 2, '4');
  g.line(13, 13, 11, 16, 'o').line(19, 20, 21, 23, 'o').line(8, 18, 10, 20, 'o');
  return g;
}

// ---------------------------------------------------------------- per-biome art

export function buildKitTextures(scene: Phaser.Scene, kit: Biome) {
  if (scene.textures.exists(K('en-wanderer-a', kit))) return;
  const px = kit.px;
  const glow = { 4: [px.glow, px.glow, px.glow] as Ramp };

  const enemy = (name: string, a: S.SpriteDef, b: S.SpriteDef, roles: Record<string, Ramp>) => {
    add(scene, K(`en-${name}-a`, kit), sprite(a).render({ roles: { ...glow, ...roles } }));
    add(scene, K(`en-${name}-b`, kit), sprite(b).render({ roles: { ...glow, ...roles } }));
  };
  enemy('wanderer', S.SLIME_A, S.SLIME_B, { 1: ramp(px.slime) });
  enemy('bat', S.BAT_A, S.BAT_B, { 1: ramp(px.bat) });
  enemy('charger', S.PIGLET_A, S.PIGLET_B, { 1: ramp(px.piglet), 2: ramp(E.pink, '#ffc2b8', E.skinD) });
  enemy('shooter', S.GOBLIN_A, S.GOBLIN_B, { 1: ramp(px.robe), 2: ramp(px.goblin) });
  enemy('bomber', S.BOMB_A, S.BOMB_B, { 3: ramp(E.slateD, E.slate, E.navy) });
  enemy('shield', S.SKELETON_A, S.SKELETON_B, { 1: ramp(E.grey, E.white, E.greyM) });

  const shield = new Grid(5, 13);
  shield.rect(0, 0, 5, 13, '1').rect(1, 1, 3, 11, '2').rect(2, 3, 1, 7, 'y');
  add(scene, K('shield', kit), shield.render({ roles: { 1: ramp(E.slate, E.greyM, E.slateD), 2: ramp(px.robe) } }));

  // Enemy bullets in the biome's danger colour, with a white core so they read on any floor.
  const eb = Grid.ascii(['..dd..', '.dwwd.', 'dwwwwd', 'dwwwwd', '.dwwd.', '..dd..']).render({ colors: { d: kit.palette.danger } });
  add(scene, K('ebullet', kit), eb);
  const ebb = new Grid(10, 10);
  ebb.ellipse(4.5, 4.5, 4.5, 4.5, 'd').ellipse(4.5, 4.5, 2.6, 2.6, 'w');
  add(scene, K('ebullet-big', kit), ebb.render({ colors: { d: kit.palette.danger } }));

  add(scene, K('pillar', kit), prop(kit).render({ roles: { 1: ramp(px.propCols[0]), 2: ramp(px.propCols[1]) } }));
  add(scene, K('boss-guardian', kit), golem().render({ roles: { 1: ramp(px.stone), 2: ramp(mix(px.stone, E.ink, 0.25)), 4: [px.glow, px.glow, px.glow] } }));
  add(scene, K('pt', kit), particle(kit));
  add(scene, K('door', kit), door(kit));
}

function prop(kit: Biome): Grid {
  const g = new Grid(16, 18);
  switch (kit.px.prop) {
    case 'bush':
      g.ellipse(8, 9, 7, 6, '1').ellipse(5, 7, 3, 3, '2').ellipse(10, 6, 3, 2, '2').set(4, 11, 'r').set(11, 10, 'r');
      break;
    case 'crystal':
      g.tri(8, 0, 4, 12, 12, 12, '2').tri(3, 5, 1, 14, 7, 14, '1').tri(13, 4, 9, 15, 15, 15, '1').rect(2, 14, 13, 3, '1');
      break;
    case 'cactus':
      g.rect(6, 1, 4, 16, '1').rect(2, 6, 3, 6, '1').rect(2, 10, 5, 2, '1').rect(11, 4, 3, 6, '1').rect(9, 8, 4, 2, '1').set(7, 3, '2').set(8, 7, '2').set(7, 11, '2');
      break;
    case 'lavarock':
      g.ellipse(8, 10, 7, 6, '1').line(4, 8, 8, 12, '2').line(8, 12, 12, 9, '2').set(9, 6, '2');
      break;
    case 'boiler':
      g.ellipse(8, 9, 7, 7, '1').rect(6, 0, 4, 3, '2').rect(1, 8, 14, 2, '2').set(8, 9, 'e').set(4, 4, 'y').set(12, 4, 'y');
      break;
    case 'tomb':
      g.rect(3, 4, 10, 13, '1').ellipse(8, 4, 5, 3, '1').rect(7, 5, 2, 7, '2').rect(5, 7, 6, 2, '2');
      break;
    case 'lantern':
      g.rect(5, 12, 6, 5, '1').rect(6, 7, 4, 5, '2').tri(2, 7, 8, 2, 14, 7, '1').set(7, 9, 'Y').set(8, 9, 'Y').set(7, 10, 'y').set(8, 10, 'y');
      break;
    case 'column':
      g.rect(2, 14, 12, 3, '2').rect(4, 2, 8, 12, '1').rect(2, 0, 12, 3, '2').set(6, 4, '2').set(6, 8, '2').set(9, 6, '2').set(9, 10, '2');
      break;
  }
  return g;
}

function particle(kit: Biome): HTMLCanvasElement {
  const shapes: Record<string, [string[], string]> = {
    forest: [['.l', 'lL'], E.green],
    glacier: [['.w.', 'www', '.w.'], E.white],
    desert: [['tt'], E.tan],
    volcano: [['O'], E.orange],
    factory: [['GG', 'G.'], E.greyM],
    castle: [['.P', 'P.'], E.magenta],
    garden: [['pp', '.p'], E.pink],
    palace: [['y'], E.amber],
  };
  const [rows] = shapes[kit.id] ?? shapes.forest;
  return Grid.ascii(rows).render({ outline: false, margin: 0 });
}

function door(kit: Biome): HTMLCanvasElement {
  const px = kit.px;
  const g = new Grid(30, 38);
  g.rect(0, 0, 30, 38, 'f').rect(3, 4, 24, 34, 'e');
  g.ellipse(15, 8, 12, 6, 'f').ellipse(15, 9, 9, 5, 'e').rect(6, 9, 18, 29, 'e');
  for (let y = 2; y < 38; y += 6) {
    g.set(1, y, 'h');
    g.set(28, y + 3, 'h');
  }
  return g.render({ colors: { f: px.wallTop, h: mix(px.wallFace, E.white, 0.3) } });
}

// ---------------------------------------------------------------- rooms

/** Paint one screen-sized room: floor, 3/4 walls, and door openings on the sides that connect. */
export function buildRoom(scene: Phaser.Scene, kit: Biome, seed: number, doors: Record<'up' | 'down' | 'left' | 'right', boolean>): string {
  const key = `room@${kit.id}`;
  const W = ARENA.w;
  const H = ARENA.h;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const rng = new Rng(seed);
  const px = kit.px;
  const [base, alt, d1, d2] = px.floorCols;
  const P = (x: number, y: number, col: string, w = 1, h = 1) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };

  // Floor tiles.
  for (let ty = 0; ty < Math.ceil(H / 16); ty++) {
    for (let tx = 0; tx < W / 16; tx++) {
      const x = tx * 16;
      const y = ty * 16;
      const odd = (tx + ty) % 2 === 1;
      switch (px.floor) {
        case 'checker':
        case 'marble':
          P(x, y, odd ? alt : base, 16, 16);
          if (px.floor === 'marble' && rng.chance(0.35)) {
            let vx = x + rng.int(0, 15);
            for (let k = 0; k < 10; k++) {
              P(vx, y + k + rng.int(0, 5), odd ? d2 : d1);
              vx += rng.int(-1, 1);
            }
          }
          if (px.floor === 'checker' && rng.chance(0.12)) P(x + rng.int(2, 12), y + rng.int(2, 12), d2, 3, 1);
          break;
        case 'metal':
          P(x, y, rng.chance(0.12) ? alt : base, 16, 16);
          P(x, y, d2, 16, 1);
          P(x, y, d2, 1, 16);
          P(x + 1, y + 1, mix(base, '#ffffff', 0.15), 14, 1);
          P(x + 2, y + 2, d1);
          P(x + 13, y + 2, d1);
          P(x + 2, y + 13, d1);
          P(x + 13, y + 13, d1);
          break;
        default:
          P(x, y, base, 16, 16);
          for (let k = 0; k < 4; k++) P(x + rng.int(0, 15), y + rng.int(0, 15), alt);
          if (px.floor === 'paper' && ty % 5 === 3 && tx % 2 === 0) P(x + 2, y + 2, d2, 12, 12);
      }
    }
  }
  if (px.floor !== 'metal' && px.floor !== 'checker' && px.floor !== 'marble') {
    const patchCol = px.floor === 'ice' || px.floor === 'paper' ? mix(base, '#ffffff', 0.18) : alt;
    const shadeCol = mix(base, E.ink, 0.12);
    for (let i = 0; i < 12; i++) {
      const cx = rng.range(0, W);
      const cy = rng.range(ARENA.top, H);
      const r = rng.range(16, 46);
      const col = i % 3 === 0 ? patchCol : shadeCol;
      for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(H, cy + r); y++) {
        for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(W, cx + r); x++) {
          const d = Math.hypot((x - cx) / r, (y - cy) / (r * 0.7));
          if (d < 0.78 || (d < 1 && (x + y) % 2 === 0 && d < 0.78 + rng.next() * 0.3)) P(x, y, col);
        }
      }
    }
    for (let i = 0; i < 420; i++) {
      const x = rng.int(0, W - 4);
      const y = rng.int(ARENA.top, H - 4);
      switch (px.floor) {
        case 'grass':
          if (i % 3 === 0) {
            P(x, y, d1);
            P(x + 2, y, d1);
            P(x + 1, y - 1, d1);
          } else if (i % 31 === 0) P(x, y, rng.pick([E.yellow, E.white, E.pink]));
          else P(x, y, d2);
          break;
        case 'sand':
          if (i % 3 === 0) P(x, y, d2, 3, 1);
          else if (i % 23 === 0) P(x, y, d1, 2, 2);
          break;
        case 'ice':
          if (i % 7 === 0) P(x, y, d1, 2, 1);
          break;
        case 'lava':
          if (i % 19 === 0) {
            let lx = x;
            let ly = y;
            for (let k = 0; k < 8; k++) {
              P(lx, ly, k % 3 === 0 ? E.amber : d1);
              lx += rng.int(-1, 1);
              ly += rng.int(0, 1);
            }
          } else if (i % 3 === 0) P(x, y, d2);
          break;
        case 'paper':
          if (i % 9 === 0) P(x, y, d1);
          break;
      }
    }
  }

  // Walls: a tall 3/4 face on top, thin walls elsewhere.
  const faceTop = 16;
  const faceBottom = ARENA.top;
  P(0, 0, px.wallTop, W, faceTop);
  P(0, faceTop, px.wallFace, W, faceBottom - faceTop);
  for (let y = faceTop; y < faceBottom; y += 9) {
    const off = Math.floor((y - faceTop) / 9) % 2 ? 8 : 0;
    P(0, y, px.wallDark, W, 1);
    for (let x = -off; x < W; x += 16) {
      switch (px.wall) {
        case 'wood':
          P(x, faceTop, px.wallDark, 2, faceBottom - faceTop);
          break;
        case 'brass':
          P(x + 1, y + 1, mix(px.wallFace, '#ffffff', 0.2), 14, 1);
          P(x + 3, y + 4, E.amber);
          P(x + 12, y + 4, E.amber);
          break;
        case 'ice':
          P(x + 2, y + 2, '#ffffff', 3, 1);
          P(x, y, px.wallDark, 1, 9);
          break;
        default:
          P(x, y, px.wallDark, 1, 9);
          P(x + 1, y + 1, mix(px.wallFace, '#ffffff', 0.18), 14, 1);
      }
    }
  }
  if (px.wall === 'gothic' || px.wall === 'marble') {
    for (const x of [80, 192, 432, 544]) {
      P(x, faceTop + 5, px.wallDark, 12, 28);
      P(x + 2, faceTop + 7, px.wall === 'gothic' ? E.purple : E.amber, 8, 24);
      P(x + 4, faceTop + 9, px.wall === 'gothic' ? E.cyan : E.yellow, 4, 4);
    }
  }
  P(0, faceBottom - 2, px.wallDark, W, 2);
  P(0, faceTop - 1, mix(px.wallTop, '#ffffff', 0.15), W, 1);
  ctx.fillStyle = 'rgba(24,20,37,0.35)';
  ctx.fillRect(0, faceBottom, W, 5);
  ctx.fillStyle = 'rgba(24,20,37,0.18)';
  ctx.fillRect(0, faceBottom + 5, W, 4);
  const edge = mix(px.wallTop, '#ffffff', 0.15);
  P(0, faceTop, px.wallTop, ARENA.left, H - faceTop);
  P(ARENA.right, faceTop, px.wallTop, W - ARENA.right, H - faceTop);
  P(0, ARENA.bottom, px.wallTop, W, H - ARENA.bottom);
  P(ARENA.left - 1, faceBottom, edge, 1, ARENA.bottom - faceBottom);
  P(ARENA.right, faceBottom, edge, 1, ARENA.bottom - faceBottom);
  P(ARENA.left, ARENA.bottom, edge, ARENA.right - ARENA.left, 1);

  // Door openings: dark passages with a frame in the wall colours.
  const frame = mix(px.wallFace, '#ffffff', 0.25);
  const hole = E.ink;
  if (doors.up) {
    P(ARENA.cx - 19, faceTop - 2, frame, 38, faceBottom - faceTop + 2);
    P(ARENA.cx - 15, faceTop + 2, hole, 30, faceBottom - faceTop - 2);
    P(ARENA.cx - 15, 0, hole, 30, faceTop + 2);
  }
  if (doors.down) {
    P(ARENA.cx - 19, ARENA.bottom, frame, 38, H - ARENA.bottom);
    P(ARENA.cx - 15, ARENA.bottom + 1, hole, 30, H - ARENA.bottom);
  }
  if (doors.left) {
    P(0, ARENA.cy - 19, frame, ARENA.left + 1, 38);
    P(0, ARENA.cy - 15, hole, ARENA.left, 30);
  }
  if (doors.right) {
    P(ARENA.right - 1, ARENA.cy - 19, frame, W - ARENA.right + 1, 38);
    P(ARENA.right, ARENA.cy - 15, hole, W - ARENA.right, 30);
  }

  add(scene, key, c);
  return key;
}

/** Pixel text as a Phaser texture, cached by content. */
export function textTexture(scene: Phaser.Scene, text: string, o: Parameters<typeof pxText>[1]): string {
  const key = `txt:${text}:${o.size}:${o.color}:${o.outline ?? ''}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, pxText(text, o));
  return key;
}

export { flipCanvas, outlineCanvas };
