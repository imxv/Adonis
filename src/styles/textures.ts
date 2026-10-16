import Phaser from 'phaser';
import { Rng } from '../core/rng';
import { Grid, flipCanvas, outlineCanvas, pxText, ramp, type Ramp } from '../pixel/draw';
import { E, mix } from '../pixel/palette';
import * as S from '../pixel/sprites';
import * as P from '../pixel/props';
import * as MS from '../pixel/monsters';
import { UPGRADE_ICONS } from '../pixel/upgradeIcons';
import { themeProps } from '../pixel/themeProps';
import { guardianArt } from '../pixel/bossArt';
import type { Biome } from '../pixel/biomes';
import { FLOOR, PROP, T, VOID, WALL, tileAt, type Dungeon } from '../game/dungeon';
import { decoArt, paintFloor, paintWall } from '../pixel/decor';

export const K = (name: string, kit: Biome) => `${name}@${kit.id}`;

function add(scene: Phaser.Scene, key: string, c: HTMLCanvasElement) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, c);
}

const sprite = (d: S.SpriteDef) => Grid.ascii(d.rows, d.mirror);

/** Data-URL icons for the DOM HUD and cards, with their pixel sizes. */
export const ICONS: Record<string, string> = {};
export const ICON_SIZE: Record<string, [number, number]> = {};

function icon(name: string, c: HTMLCanvasElement) {
  ICONS[name] = c.toDataURL();
  ICON_SIZE[name] = [c.width, c.height];
}

// ---------------------------------------------------------------- shared art

export function buildCommonTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('knight-a')) return;

  add(scene, 'knight-a', sprite(S.KNIGHT_A).render());
  add(scene, 'knight-b', sprite(S.KNIGHT_B).render());
  icon('knight', scene.textures.get('knight-a').getSourceImage() as HTMLCanvasElement);
  const shieldRows = ['GgggggG', 'GgwgggG', 'GgggggG', 'GgggggG', '.GgggG.', '..GgG..', '...G...'];
  icon('armor', Grid.ascii(shieldRows).render());
  // Empty and flash versions for the HUD: a lost shield or heart flashes white, then goes dark.
  icon('armor-empty', Grid.ascii(shieldRows).render({ colors: { G: '#2c2a3c', g: '#211f2e', w: '#2c2a3c' } }));
  icon('armor-flash', Grid.ascii(shieldRows).render({ colors: { G: '#ffffff', g: '#ffffff', w: '#ffffff' } }));
  icon('xp', sprite(S.GEM).render({ roles: { 1: ramp(E.cyan, E.white, E.blue) } }));

  // Weapons, drawn facing right with the grip on the left.
  const guns: Record<string, string[]> = {
    pistol: ['ggggggggg.', 'GGGGGGGGGw', 'DDBBD.....', '.BBB......', '.BB.......'],
    smg: ['gggggggggg..', 'GGGGGGGGGGGw', 'DDBB..DD....', '.BB...DD....', '......DD....'],
    crossbow: ['.........bb.', '..........b.', 'bbbbbbbbbbgw', '..........b.', '.........bb.'],
    sniper: ['....kk..........', '...kkkk.........', 'GGGGGGGGGGGGGGGw', 'DDDBBD..........', '..BB............'],
    shotgun: ['bb....gggggggggg', 'bbbbGGGGGGGGGGGw', 'bbbbbDDDDDDDDDD.', '.bb...B.........'],
    laser: ['....kkkkkkkkk..', 'DDDDccccccccccw', 'DDDDkkkkkkkkk..', '..DD...........', '..DD...........'],
    grenade: ['...LLLLLLLLL.', '..LlllllllLLy', '..LLLLLLLLLLy', '.DDDDLLLLLLL.', '..BB.........', '..BB.........'],
    rocket: ['..LLLLLLLLLL..', 'LLllllllllllRR', 'LLllllllllllRR', '..LLDDLLLLLL..', '....BB........'],
    chakram: ['..ggg..', '.gwwwg.', 'gw...wg', 'gw...wg', 'gw...wg', '.gwwwg.', '..ggg..'],
    tesla: ['..yyyy........', '.DDDDDDDDDDy..', 'DDcDcDcDcDDDyw', '.DDDDDDDDDDy..', '..BB..........', '..BB..........'],
    flamer: ['..OO..........', '.DDDDDDDDDDy..', 'OODDDDDDDDDDYO', '.DDDDDDDDDDy..', '..BB..........'],
    sword: ['....y............', 'bbbbyggggggggggw.', 'bbbbyGGGGGGGGGGGw', '....y............'],
    spear: ['..............r.gw...', 'bbbbbbbbbbbbbbyGGGwww', '..............r.gw...'],
    hammer: ['...........GGGG.', '..........GgwggG', 'rrbbbbbbbbGgggGD', '..........GgggGD', '...........DDD..'],
    daggers: ['..y.....', 'bbyggggw', '..y.....'],
    scythe: ['....wgggggggggg....', '......GGGGGGGGGgg..', '..............GGgG.', '................GG.', 'bbbbbbbbbbbbbbbbbbD'],
    bow: ['....bb.....', '....w.b....', '....w..b...', '....w...b..', '....w...b..', '....w....b.', '....w....b.', '....w....b.', '....w...b..', '....w...b..', '....w..b...', '....w.b....', '....bb.....'],
    'bow-drawn': ['..bb.......', '..w.b......', '.w...b.....', '.w....b....', 'w.....b....', 'w......b...', 'GGGGGGGbGGw', 'w......b...', 'w.....b....', '.w....b....', '.w...b.....', '..w.b......', '..bb.......'],
    shuriken: ['..g..', '.gDg.', 'gDwDg', '.gDg.', '..g..'],
    gatling: ['....gggggggggg.', 'DDDDGGGGGGGGGGw', 'DDDDggggggggggg', 'DDDDGGGGGGGGGGw', '.yy.DD.........', '.yy............'],
    'gatling-b': ['....GGGGGGGGGG.', 'DDDDggggggggggw', 'DDDDGGGGGGGGGGG', 'DDDDggggggggggw', '.yy.DD.........', '.yy............'],
    frostlance: ['..........cc..', 'DDDDkkkkkkkcwc', 'DDDDDDkkkkkcc.', '..BB..........', '..BB..........'],
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
  add(scene, 'b-blade', Grid.ascii(guns.chakram).render());
  add(scene, 'b-arrow', Grid.ascii(['bbbbbgw', 'G....g.']).render({ outline: E.ink }));
  add(scene, 'b-shuriken', Grid.ascii(['...g...', '...G...', '..GwG..', 'gGwDwGg', '..GwG..', '...G...', '...g...']).render());
  add(scene, 'b-icicle', Grid.ascii(['.ccw...', 'kcccwww', '.ccw...']).render({ outline: E.blueD }));
  // Spent brass and shotgun shells.
  add(scene, 'casing', Grid.ascii(['Yy']).render({ outline: false, margin: 0 }));
  add(scene, 'casing-shell', Grid.ascii(['rrY', 'RRy']).render({ outline: false, margin: 0 }));
  add(scene, 'b-snipe', Grid.ascii(['wwwwwwwY']).render({ outline: E.orange }));
  add(scene, 'b-rocket', Grid.ascii(['r.....', 'rLLLlw', 'rLLLlw', 'r.....']).render());
  add(scene, 'b-flame', Grid.ascii(['..YY..', '.YwwY.', 'YwwwwY', 'YwwwwY', '.YwwY.', '..YY..']).render({ outline: E.orange }));
  add(scene, 'b-wave', Grid.ascii(['ww...', 'ccw..', '..cw.', '..cw.', '..cw.', '..cw.', 'ccw..', 'ww...']).render({ outline: E.blueD }));
  add(scene, 'b-shard', Grid.ascii(['wcc', 'ccc']).render({ outline: false }));
  add(scene, 'b-orb', Grid.ascii(['.cc.', 'cwwc', 'cwwc', '.cc.']).render({ outline: E.blueD }));
  add(scene, 'b-axe', Grid.ascii(['.ggg..', 'gwwgb.', 'gwggbb', '.gg.bb', '....bb', '.....b']).render());
  add(scene, 'b-book', Grid.ascii(['PPPPPT', 'PyyyPT', 'PyPyPT', 'PyyyPT', 'PPPPPT']).render());
  add(scene, 'b-knife', Grid.ascii(['bbgggw', 'bbGGG.']).render());
  add(scene, 'b-sword', Grid.ascii(['.y.......', 'byggggggw', '.y.GGGGG.']).render());
  add(scene, 'b-meteor', Grid.ascii(['......rr.', '.....rOOr', '....rOYYO', '...rOYwYO', '..rOYYYO.', '.rOOOOr..', 'rrr.r....']).render());

  // Spell icons for cards and HUD.
  const spellIcons: Record<string, string[]> = {
    orbit: ['PPPPPPT', 'PyyyyPT', 'PyPPyPT', 'PyyyyPT', 'PyPPyPT', 'PPPPPPT'],
    aura: ['..y.y..', '.yYYYy.', 'yYwwwYy', '.YwwwY.', 'yYwwwYy', '.yYYYy.', '..y.y..'],
    lightning: ['...YY', '..YY.', '.YYYY', '...YY', '..YY.', '.YY..', 'YY...'],
    missile: ['..cc..', '.cwwc.', 'cwwwwc', 'cwwwwc', '.cwwc.', '..cc..'],
    axe: ['.ggg...', 'gwwgb..', 'gwggbb.', '.gg.bb.', '....bb.', '.....bb'],
    nova: ['...c...', '.c.c.c.', '..ccc..', 'cccwccc', '..ccc..', '.c.c.c.', '...c...'],
    knife: ['.....w.', '....wg.', '...gg..', '..gg...', '.bG....', 'bb.....', 'b......'],
    meteor: ['....OO.', '...OYYO', '..OYwYO', '.rOYYO.', 'rrOOO..', 'r.r....', '.r.....'],
    poison: ['..lll..', '.lLLLl.', 'lLlLLLl', 'lLLLlLl', '.lLLLl.', '..lll..', '.l.l.l.'],
    arc: ['Y..Y..Y', '.Y.Y.Y.', '..YwY..', 'YYwcwYY', '..YwY..', '.Y.Y.Y.', 'Y..Y..Y'],
    swords: ['w.....w', '.g...g.', '..g.g..', '...g...', '..g.g..', 'yy...yy', 'b.....b'],
    vortex: ['..PPP..', '.P...P.', 'P..v..P', 'P.vev.P', 'P..v...', '.P...P.', '..PPP..'],
    storm: ['c..Y..c', '.c.Y.c.', '..cYc..', 'cccYccc', '..YYY..', '.c.Y.c.', 'c..Y..c'],
    bladestorm: ['.w.w.w.', 'wg.g.gw', '.ggYgg.', 'wgYwYgw', '.ggYgg.', 'wg.g.gw', '.w.w.w.'],
    plague: ['.lllll.', 'lL...Ll', 'l.www.l', 'l.wew.l', 'l..w..l', 'lL...Ll', '.lllll.'],
    starfall: ['O..O..O', 'YO.YO.Y', '.r..r..', 'O..O...', 'YO.YO..', '.r..r..', 'r..r...'],
    seeker: ['w......', '.g..w..', '..g..g.', '...g..g', '..g..g.', '.g..g..', 'w..w...'],
    singularity: ['Y.PPP.Y', '.P.Y.P.', 'P.YvY.P', 'PYvevYP', 'P.YvY.P', '.P.Y.P.', 'Y.PPP.Y'],
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
  const gateH = new Grid(46, 12);
  for (let x = 1; x < 46; x += 5) gateH.rect(x, 0, 2, 12, '1');
  gateH.rect(0, 2, 46, 2, '2').rect(0, 8, 46, 2, '2');
  add(scene, 'gate-h', gateH.render({ roles: { 1: ramp(E.greyM, E.grey, E.slateD), 2: ramp(E.red, E.pink, E.redD) } }));
  const gateV = new Grid(10, 46);
  for (let y = 1; y < 46; y += 5) gateV.rect(0, y, 10, 2, '1');
  gateV.rect(2, 0, 2, 46, '2').rect(6, 0, 2, 46, '2');
  add(scene, 'gate-v', gateV.render({ roles: { 1: ramp(E.greyM, E.grey, E.slateD), 2: ramp(E.red, E.pink, E.redD) } }));

  // Traps: spikes that pop out of floor plates, and a saw blade that runs along a slot.
  const spikeAt = [
    [4, 7],
    [11, 7],
    [4, 15],
    [11, 15],
  ];
  const spikesUp = new Grid(16, 16);
  for (const [x, y] of spikeAt) spikesUp.tri(x - 2, y, x + 2, y, x, y - 6, 'g').line(x + 1, y, x, y - 5, 'G').set(x, y - 6, 'w').set(x, y - 5, 'w');
  add(scene, 'spikes-up', spikesUp.render({ outline: E.ink, margin: 0 }));
  const spikesWarn = new Grid(16, 16);
  for (const [x, y] of spikeAt) spikesWarn.rect(x - 1, y - 2, 3, 2, 'G').set(x, y - 3, 'w');
  add(scene, 'spikes-warn', spikesWarn.render({ outline: false, margin: 0 }));
  const saw = new Grid(15, 15);
  saw.ellipse(7, 7, 7, 7, 'g').ellipse(7, 7, 5, 5, 'G');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    saw.set(7 + Math.cos(a) * 7.4, 7 + Math.sin(a) * 7.4, '.').set(7 + Math.cos(a + 0.2) * 6.6, 7 + Math.sin(a + 0.2) * 6.6, 'w');
  }
  saw.ellipse(7, 7, 2, 2, 'r').set(7, 7, 'R').set(4, 4, 'w');
  add(scene, 'saw', saw.render());

  // Revolver cylinder shown over the knight's head while reloading: chambers fill one by one.
  for (let n = 0; n <= 6; n++) {
    const cyl = new Grid(13, 13);
    cyl.ellipse(6, 6, 6, 6, 'D').ellipse(6, 6, 5, 5, 'G').ellipse(6, 6, 1.2, 1.2, 'D').set(6, 6, 'n');
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k / 6) * Math.PI * 2;
      const cx = Math.round(6 + Math.cos(a) * 3.4);
      const cy = Math.round(6 + Math.sin(a) * 3.4);
      if (k < n) cyl.rect(cx - 1, cy - 1, 2, 2, 'y').set(cx - 1, cy - 1, 'Y');
      else cyl.rect(cx - 1, cy - 1, 2, 2, 'e');
    }
    cyl.set(3, 2, 'w');
    add(scene, `cyl-${n}`, cyl.render());
  }

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
  icon('heart-empty', sprite(S.HEART).render({ roles: { 1: ['#3a2a38', '#2a1f2b', '#211824'] } }));
  icon('heart-flash', sprite(S.HEART).render({ roles: { 1: ['#ffffff', '#ffffff', '#ffffff'] } }));

  // Upgrades: a picture each, for the level-up cards, the pause page, the codex and the pedestals.
  for (const [id, art] of Object.entries(UPGRADE_ICONS)) {
    const [g, colors] = art();
    const c = g.render({ colors });
    add(scene, `upg-${id}`, c);
    icon(`upg-${id}`, c);
  }

  // Elements: a small mark for each (shown over an enemy carrying it), the Crystallize shard and the Dendro Core.
  const marks: Record<string, string[]> = {
    fire: ['..f..', '.fYf.', 'fYwYf', 'fYYYf', '.fff.'],
    water: ['..b..', '.bbb.', 'bbwbb', 'bbbbb', '.bbb.'],
    shock: ['...v.', '..vv.', '.vwv.', '.vv..', '.v...'],
    ice: ['c.c.c', '.ccc.', 'ccwcc', '.ccc.', 'c.c.c'],
    wind: ['.mmm.', 'm...m', 'm.mm.', 'm....', '.mmmm'],
    rock: ['..y..', '.yYy.', 'yYwYy', '.yYy.', '..y..'],
    grass: ['...g.', '..gg.', '.ggw.', 'gg...', 'g....'],
  };
  for (const [el, rows] of Object.entries(marks)) {
    const c = Grid.ascii(rows).render({ colors: { f: '#f77622', Y: E.yellow, w: E.white, b: '#3aa0ff', v: '#b47cf0', c: '#9fe6f5', m: '#5fd6b8', y: '#f4b830', g: '#8fd14f' } });
    add(scene, `el-${el}`, c);
    icon(`el-${el}`, c);
  }
  add(scene, 'crystal', Grid.ascii(['..w..', '.www.', 'wwwww', 'wwwgw', '.wgg.', '..g..']).render({ colors: { w: E.white, g: E.grey } }));
  const seed = new Grid(9, 9);
  seed.ellipse(4, 4, 3.5, 3.5, 'g').ellipse(3, 3, 1.5, 1.5, 'l').set(3, 2, 'w').line(4, 0, 6, -1, 'L');
  add(scene, 'dendro-core', seed.render({ colors: { g: '#8fd14f', l: '#c4f07a', w: E.white, L: E.greenD } }));
  add(scene, 'b-water', Grid.ascii(['.kk..', 'kwkkk', 'kkkkk', '.kk..']).render({ colors: { k: '#3aa0ff', w: E.white }, outline: E.blueD }));
  add(scene, 'b-wind', Grid.ascii(['.mmm.', 'm...m', '..m.m', 'mm..m', '.mmm.']).render({ colors: { m: '#5fd6b8' }, outline: false }));
  add(scene, 'b-seed', Grid.ascii(['.gg.', 'gwlg', 'gllg', '.gg.']).render({ colors: { g: E.greenD, l: '#8fd14f', w: E.white }, outline: E.greenDD }));
  add(scene, 'b-rock', Grid.ascii(['.yy.', 'yYwy', 'yyYy', '.yy.']).render({ colors: { y: '#c28a2c', Y: '#f4b830', w: E.white } }));

  // The horde altar: a round stone dais with a red rune ring and a bell-shaped crystal; stepping on it starts the horde.
  const altar = new Grid(26, 18);
  altar.ellipse(13, 12, 12, 5, 'D').ellipse(13, 11, 11, 4, 'G').ellipse(13, 11, 8, 2.6, 'n');
  altar.ellipse(13, 11, 7, 2, 'r').ellipse(13, 11, 5.5, 1.3, 'n');
  for (const [x, y] of [[4, 11], [22, 11], [13, 8], [13, 14], [7, 9], [19, 9], [7, 13], [19, 13]]) altar.set(x, y, 'R');
  altar.tri(13, 0, 9, 9, 17, 9, 'r').tri(13, 0, 9, 9, 12, 9, 'p').set(13, 3, 'w');
  altar.rect(10, 9, 7, 1, 'R');
  add(scene, 'altar', altar.render({ colors: { D: E.slateD, G: E.slate, n: E.ink, r: E.red, R: E.redD, p: E.pink, w: E.white } }));

  // Title painting: the anemone moon, a ruined keep on the skyline, the cliff in front, a petal.
  const emblem = new Grid(39, 39);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    emblem.ellipse(19 + Math.cos(a) * 10, 19 + Math.sin(a) * 10, 8, 8, 'r');
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    emblem.ellipse(19 + Math.cos(a) * 14, 19 + Math.sin(a) * 14, 3.5, 3.5, 'p');
    emblem.ellipse(19 + Math.cos(a) * 12.5, 19 + Math.sin(a) * 12.5 - 1, 1.5, 1.5, 'P');
    const b = a + Math.PI / 6;
    emblem.line(19 + Math.cos(b) * 6, 19 + Math.sin(b) * 6, 19 + Math.cos(b) * 16, 19 + Math.sin(b) * 16, 'R');
  }
  emblem.ellipse(19, 19, 7, 7, 'w').ellipse(19, 19, 5, 5, 'n');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    emblem.set(Math.round(19 + Math.cos(a) * 6), Math.round(19 + Math.sin(a) * 6), 'v');
  }
  emblem.set(17, 17, 'v').set(18, 17, 'P');
  icon('emblem', emblem.render({ colors: { r: E.red, p: E.pink, P: '#ffb0a8', R: E.redD, w: E.white, n: E.ink, v: E.purple } }));

  const sky = new Rng(11);
  const ruins = new Grid(240, 44);
  // Rolling hills, then the broken keep: towers, a gate, crenellations, some lit windows.
  for (let x = 0; x < 240; x++) {
    const h = 30 + Math.round(Math.sin(x * 0.045) * 4 + Math.sin(x * 0.13) * 2);
    ruins.rect(x, h, 1, 44 - h, 'h');
  }
  for (const [x, w, top] of [[22, 10, 8], [36, 26, 18], [66, 8, 4], [78, 22, 16], [104, 12, 10], [150, 9, 12], [162, 30, 20], [196, 10, 6]] as [number, number, number][]) {
    ruins.rect(x, top, w, 44 - top, 'k');
    for (let c = x; c < x + w; c += 3) ruins.rect(c, top - 2, 2, 2, 'k');
    for (let n = 0; n < 2; n++) if (sky.chance(0.7)) ruins.set(x + sky.int(1, w - 2), top + sky.int(4, 14), 'y');
  }
  ruins.rect(178, 24, 6, 20, '.').ellipse(181, 24, 3, 3, '.');
  icon('ruins', ruins.render({ outline: false, margin: 0, colors: { h: '#2b2238', k: '#1d1a2b', y: E.amber } }));

  const cliff = new Grid(240, 26);
  for (let x = 0; x < 240; x++) {
    const top = 6 + Math.round(Math.sin(x * 0.07) * 2 + Math.sin(x * 0.21));
    cliff.rect(x, top, 1, 26 - top, 'k');
    cliff.set(x, top, 'h');
    if (sky.chance(0.12)) cliff.set(x, top - 1, 'g');
    if (sky.chance(0.05)) cliff.set(x, top - 2, 'g');
  }
  icon('cliff', cliff.render({ outline: false, margin: 0, colors: { k: E.ink, h: '#3a2a38', g: E.greenDD } }));
  icon('knight-b', scene.textures.get('knight-b').getSourceImage() as HTMLCanvasElement);
  icon('petal', Grid.ascii(['.rr', 'rRr', 'rr.']).render({ outline: false }));

  // Leaderboard: a crown for first place, medals for second and third, a sparkle.
  const crown = ['Y....Y....Y', 'YY..YYY..YY', 'YYYYYYYYYYY', 'YrYYYcYYYrY', 'YYYYYYYYYYY', 'yyyyyyyyyyy'];
  icon('crown', Grid.ascii(crown).render({ colors: { Y: E.yellow, y: E.amber, r: E.red, c: E.cyan } }));
  const medal = ['.rr.kk.', '..r.k..', '..ggg..', '.gwggg.', '.ggggg.', '.ggggG.', '..GGG..'];
  icon('medal-2', Grid.ascii(medal).render({ colors: { r: E.red, k: E.blue, g: E.grey, w: E.white, G: E.greyM } }));
  icon('medal-3', Grid.ascii(medal).render({ colors: { r: E.red, k: E.blue, g: E.clay, w: E.tan, G: E.rust } }));
  icon('sparkle', Grid.ascii(['..w..', '..Y..', 'wY.Yw', '..Y..', '..w..']).render({ outline: false, colors: { w: E.white, Y: E.yellow } }));

  // Beat bar: the diamond the ticks meet on the beat, and a tick.
  const core = new Grid(11, 11);
  for (let y = 0; y < 11; y++) core.rect(5 - (5 - Math.abs(y - 5)), y, (5 - Math.abs(y - 5)) * 2 + 1, 1, 'y');
  for (let y = 3; y < 8; y++) core.rect(5 - (2 - Math.abs(y - 5)), y, (2 - Math.abs(y - 5)) * 2 + 1, 1, 'Y');
  core.set(4, 3, 'W').set(3, 4, 'W');
  icon('beat-core', core.render({ colors: { y: E.amber, Y: E.yellow, W: E.white } }));
  const tick = new Grid(2, 8);
  tick.rect(0, 0, 2, 8, 'w').rect(1, 0, 1, 8, 'c');
  icon('beat-tick', tick.render({ colors: { w: E.white, c: E.cyan } }));

  // Chests: oak and brass for loot, steel and cyan for weapons.
  add(scene, 'chest', P.chestClosed().render({ colors: P.chestLegend(P.WOOD_CHEST) }));
  add(scene, 'chest-open', P.chestOpen().render({ colors: P.chestLegend(P.WOOD_CHEST) }));
  add(scene, 'chest-w', P.chestClosed().render({ colors: P.chestLegend(P.STEEL_CHEST) }));
  add(scene, 'chest-w-open', P.chestOpen().render({ colors: P.chestLegend(P.STEEL_CHEST) }));

  // Pets.
  add(scene, 'pet-hound', sprite(S.HOUND).render());
  add(scene, 'pet-dove', sprite(S.DOVE_A).render());
  add(scene, 'pet-dove-b', sprite(S.DOVE_B).render());
  add(scene, 'pet-swan', Grid.ascii(S.SWAN.rows).render());
  for (const p of ['hound', 'dove', 'swan']) icon(`pet-${p}`, (scene.textures.get(`pet-${p}`).getSourceImage() as HTMLCanvasElement));

  // Props.
  add(scene, 'barrel', P.powderKeg().render({ colors: P.KEG_LEGEND }));
  add(scene, 'crate', P.crate().render({ colors: P.CRATE_LEGEND }));

  // The anemone that grew from Adonis' blood: six red petals, a white ring and a dark heart, on a few leaves.
  const bloom = new Grid(23, 21);
  for (const [x, y, a] of [[3, 15, -0.5], [19, 15, 0.5], [11, 19, 0]] as [number, number, number][]) {
    bloom.ellipse(x, y, 3.5, 1.6, 'l').set(Math.round(x + Math.cos(a) * 2), y, 'L');
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    bloom.ellipse(11 + Math.cos(a) * 5, 9 + Math.sin(a) * 5, 3.6, 3.6, 'r');
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    // A lighter rim on the outer edge of each petal, and a dark crease between petals.
    bloom.ellipse(11 + Math.cos(a) * 6.6, 9 + Math.sin(a) * 6.6, 1.6, 1.6, 'p');
    const b = a + Math.PI / 6;
    bloom.line(11 + Math.cos(b) * 3, 9 + Math.sin(b) * 3, 11 + Math.cos(b) * 7, 9 + Math.sin(b) * 7, 'R');
  }
  bloom.ellipse(11, 9, 3.4, 3.4, 'w');
  bloom.ellipse(11, 9, 2.4, 2.4, 'n');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    bloom.set(Math.round(11 + Math.cos(a) * 3), Math.round(9 + Math.sin(a) * 3), 'v');
  }
  bloom.set(10, 8, 'P');
  add(scene, 'bloom', bloom.render({ colors: { r: E.red, p: E.pink, R: E.redD, w: E.white, n: E.ink, v: E.purple, P: E.magenta, l: E.greenD, L: E.green } }));

  // What a kill leaves on the floor: a few splat shapes, tinted per monster when stamped.
  for (let i = 0; i < 4; i++) {
    const rng = new Rng(97 + i * 13);
    const g = new Grid(16, 12);
    g.ellipse(8, 6, rng.range(3, 4.5), rng.range(2, 3), 'w');
    for (let k = 0; k < 5; k++) g.ellipse(8 + rng.range(-5, 5), 6 + rng.range(-3.5, 3.5), rng.range(0.8, 2), rng.range(0.6, 1.4), 'w');
    for (let k = 0; k < 4; k++) g.set(Math.round(8 + rng.range(-7, 7)), Math.round(6 + rng.range(-5, 5)), 'w');
    add(scene, `splat-${i}`, g.render({ outline: false, margin: 0 }));
  }
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
  const iron = { 3: ramp(E.slateD, E.slate, E.navy) };
  add(scene, K('en-bomber-a', kit), P.bombBody(0).render({ roles: iron, colors: P.BOMB_LEGEND }));
  add(scene, K('en-bomber-b', kit), P.bombBody(1).render({ roles: iron, colors: P.BOMB_LEGEND }));
  enemy('shield', S.SKELETON_A, S.SKELETON_B, { 1: ramp(E.grey, E.white, E.greyM) });
  enemy('brute', ...MS.BRUTE, { 1: ramp(px.goblin) });
  for (const [name, pair] of Object.entries({ sporeling: MS.SPORELING, yeti: MS.YETI, scorpion: MS.SCORPION, magma: MS.MAGMA, turret: MS.TURRET, ghost: MS.GHOST, ninja: MS.NINJA, angel: MS.ANGEL, jelly: MS.JELLY, drone: MS.DRONE })) enemy(name, ...pair, {});

  const shield = new Grid(5, 13);
  shield.rect(0, 0, 5, 13, '1').rect(1, 1, 3, 11, '2').rect(2, 3, 1, 7, 'y');
  add(scene, K('shield', kit), shield.render({ roles: { 1: ramp(E.slate, E.greyM, E.slateD), 2: ramp(px.robe) } }));

  // Enemy bullets in the biome's danger colour, with a white core so they read on any floor.
  const eb = Grid.ascii(['..dd..', '.dwwd.', 'dwwwwd', 'dwwwwd', '.dwwd.', '..dd..']).render({ colors: { d: kit.palette.danger } });
  add(scene, K('ebullet', kit), eb);
  const ebb = new Grid(10, 10);
  ebb.ellipse(4.5, 4.5, 4.5, 4.5, 'd').ellipse(4.5, 4.5, 2.6, 2.6, 'w');
  add(scene, K('ebullet-big', kit), ebb.render({ colors: { d: kit.palette.danger } }));

  decoArt(kit.id).forEach((d, i) => add(scene, K(`deco-${i}`, kit), d.g.render({ colors: d.colors })));
  // The breakable prop and the explosive one, in this style's dress.
  const tp = themeProps(kit.id);
  add(scene, K('prop-crate', kit), tp.crate[0].render({ colors: tp.crate[1] }));
  add(scene, K('prop-barrel', kit), tp.keg[0].render({ colors: tp.keg[1] }));
  add(scene, K('pillar', kit), decoArt(kit.id)[0].g.render({ colors: decoArt(kit.id)[0].colors }));
  const [boss, bossColors] = guardianArt(kit.id);
  add(scene, K('boss-guardian', kit), boss.render({ colors: bossColors }));
  add(scene, K('pt', kit), particle(kit));
  add(scene, K('door', kit), door(kit));
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
    reef: [['.w.', 'w.w', '.w.'], E.white],
    neon: [['c', 'c'], E.cyan],
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

/** Paint the whole floor: biome tiles, 3/4 walls (face + top), corridors and the void around them. */
export function buildLevel(scene: Phaser.Scene, kit: Biome, d: Dungeon, seed: number, key = `level@${kit.id}`): string {
  const W = d.w * T;
  const H = d.h * T;
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
  const at = (tx: number, ty: number) => tileAt(d, tx, ty);
  const floorish = (t: number) => t === FLOOR || t === PROP;

  P(0, 0, '#0b0a12', W, H);
  for (let i = 0; i < (W * H) / 900; i++) P(rng.int(0, W), rng.int(0, H), rng.chance(0.5) ? '#14121e' : '#100e18');

  for (let ty = 0; ty < d.h; ty++) {
    for (let tx = 0; tx < d.w; tx++) {
      const t = at(tx, ty);
      const x = tx * T;
      const y = ty * T;
      if (floorish(t)) {
        const odd = (tx + ty) % 2 === 1;
        switch (px.floor) {
          case 'checker':
          case 'marble':
            P(x, y, odd ? alt : base, T, T);
            if (px.floor === 'marble' && rng.chance(0.3)) {
              let vx = x + rng.int(0, 15);
              for (let k = 0; k < 9; k++) {
                P(vx, y + k + rng.int(0, 5), odd ? d2 : d1);
                vx += rng.int(-1, 1);
              }
            }
            break;
          case 'metal':
            P(x, y, rng.chance(0.12) ? alt : base, T, T);
            P(x, y, d2, T, 1);
            P(x, y, d2, 1, T);
            P(x + 1, y + 1, mix(base, '#ffffff', 0.15), 14, 1);
            for (const [rx, ry] of [[2, 2], [13, 2], [2, 13], [13, 13]]) P(x + rx, y + ry, d1);
            break;
          default:
            P(x, y, base, T, T);
            for (let k = 0; k < 4; k++) P(x + rng.int(0, 15), y + rng.int(0, 15), alt);
            const r = rng.next();
            if (px.floor === 'grass' && r < 0.3) {
              const gx = x + rng.int(2, 12);
              const gy = y + rng.int(4, 12);
              P(gx, gy, d1);
              P(gx + 2, gy, d1);
              P(gx + 1, gy - 1, d1);
            } else if (px.floor === 'grass' && r < 0.34) P(x + rng.int(2, 13), y + rng.int(2, 13), rng.pick([E.yellow, E.white, E.pink]));
            else if (px.floor === 'sand' && r < 0.3) for (let k = 0; k < 9; k++) P(x + 3 + k, y + 7 + (k % 4 < 2 ? 0 : 1), d2);
            else if (px.floor === 'ice' && r < 0.15) P(x + rng.int(2, 11), y + rng.int(2, 13), d1, 3, 1);
            else if (px.floor === 'lava' && r < 0.2) {
              let lx = x + rng.int(2, 13);
              let ly = y + rng.int(2, 8);
              for (let k = 0; k < 7; k++) {
                P(lx, ly, k % 3 === 0 ? E.amber : d1);
                lx += rng.int(-1, 1);
                ly += 1;
              }
            } else if (px.floor === 'paper' && r < 0.12) P(x + 2, y + 2, d2, 12, 12);
        }
      } else if (t === WALL) {
        const below = at(tx, ty + 1);
        if (floorish(below)) {
          // Wall face, seen from the front.
          P(x, y, px.wallFace, T, T);
          for (let row = 0; row < 2; row++) {
            const by = y + row * 8;
            P(x, by, px.wallDark, T, 1);
            const off = (ty + row) % 2 ? 8 : 0;
            for (let bx = x - off; bx < x + T; bx += 16) {
              if (px.wall === 'wood') {
                P(Math.max(x, bx), y, px.wallDark, 1, T);
                continue;
              }
              if (bx >= x) P(bx, by, px.wallDark, 1, 8);
              P(Math.max(x, bx + 1), by + 1, mix(px.wallFace, '#ffffff', 0.16), Math.min(14, x + T - Math.max(x, bx + 1)), 1);
            }
          }
          if (px.wall === 'brass') {
            P(x + 3, y + 4, E.amber);
            P(x + 12, y + 12, E.amber);
          }
          if (px.wall === 'ice') P(x + 3, y + 3, '#ffffff', 3, 1);
          P(x, y + T - 1, mix(px.wallFace, E.ink, 0.35), T, 1);

        } else {
          P(x, y, px.wallTop, T, T);
          // Inner rim where the top meets floor or a face.
          const rim = mix(px.wallTop, '#ffffff', 0.18);
          if (floorish(at(tx, ty - 1))) P(x, y, rim, T, 2);
          if (floorish(at(tx - 1, ty))) P(x, y, rim, 2, T);
          if (floorish(at(tx + 1, ty))) P(x + T - 2, y, rim, 2, T);
          if (at(tx, ty + 1) === WALL && floorish(at(tx, ty + 2))) P(x, y + T - 1, rim, T, 1);
          if (at(tx, ty - 1) === VOID) P(x, y, mix(px.wallTop, E.ink, 0.3), T, 1);
        }
      }
    }
  }
  // Floor clutter for the biome.
  for (let ty = 0; ty < d.h; ty++) for (let tx = 0; tx < d.w; tx++) if (at(tx, ty) === FLOOR) paintFloor(P, kit.id, tx * T, ty * T, rng);

  // The palace lays a red runner down the middle of each room.
  if (kit.id === 'palace') {
    for (const r of d.rooms) {
      const cx = Math.floor((r.x0 + r.x1) / 2) * T + 8;
      const x0 = cx - 13;
      for (let ty = r.y0; ty < r.y1; ty++) {
        for (let tx = Math.floor(x0 / T); tx <= Math.floor((x0 + 25) / T); tx++) {
          if (at(tx, ty) !== FLOOR) continue;
          const lo = Math.max(tx * T, x0);
          const hi = Math.min(tx * T + T, x0 + 26);
          P(lo, ty * T, E.redD, hi - lo, T);
        }
        if (at(Math.floor(cx / T), ty) !== FLOOR) continue;
        P(x0, ty * T, E.amber, 1, T);
        P(x0 + 25, ty * T, E.amber, 1, T);
        P(x0 + 2, ty * T, E.red, 1, T);
        P(x0 + 23, ty * T, E.red, 1, T);
        // Gold lozenges down the centre.
        P(cx - 1, ty * T + 6, E.amber, 2, 4);
        P(cx - 2, ty * T + 7, E.amber, 4, 2);
        P(cx - 1, ty * T + 7, E.yellow, 1, 1);
      }
    }
  }

  // Trap fixtures are part of the floor: spike plates and saw slots, visible before the traps arm.
  for (const r of d.rooms) {
    for (const t of r.traps) {
      if (t.kind === 'spikes') {
        for (const [tx, ty] of t.tiles) {
          const x = tx * T;
          const y = ty * T;
          P(x + 1, y + 1, E.slateD, 14, 14);
          P(x + 1, y + 1, E.slate, 14, 1);
          P(x + 1, y + 14, E.navy, 14, 1);
          for (const [hx, hy] of [[3, 5], [10, 5], [3, 13], [10, 13]]) P(x + hx, y + hy, E.ink, 3, 2);
        }
      } else {
        const [[ax, ay], [bx, by]] = t.tiles;
        const x0 = Math.min(ax, bx) * T + 8;
        const y0 = Math.min(ay, by) * T + 8;
        const len = (Math.abs(bx - ax) + Math.abs(by - ay)) * T;
        const lip = mix(px.floorCols[0], '#ffffff', 0.25);
        if (ay === by) {
          P(x0 - 3, y0 - 1, E.ink, len + 6, 3);
          P(x0 - 3, y0 + 2, lip, len + 6, 1);
        } else {
          P(x0 - 1, y0 - 3, E.ink, 3, len + 6);
          P(x0 + 2, y0 - 3, lip, 1, len + 6);
        }
        for (const [ex, ey] of [[ax, ay], [bx, by]]) P(ex * T + 5, ey * T + 5, E.navy, 6, 6);
      }
    }
  }

  // Wall decorations on the faces, spaced out and clear of the torches.
  let lastDecor = -9;
  for (let ty = 1; ty < d.h; ty++) {
    for (let tx = 0; tx < d.w; tx++) {
      if (at(tx, ty) !== WALL || !floorish(at(tx, ty + 1))) continue;
      const x = tx * T;
      const y = ty * T;
      if (d.torches.some(([lx, ly]) => Math.abs(lx - (x + 8)) < 14 && Math.abs(ly - (y + 4)) < 12)) continue;
      if (ty * d.w + tx - lastDecor < 2 || !rng.chance(0.45)) continue;
      if (paintWall(P, kit.id, x, y, rng.int(0, 5), rng, px.wallFace)) lastDecor = ty * d.w + tx;
    }
  }

  // Wall torches (their light comes from the lighting layer).
  for (const [tx, ty] of d.torches) {
    const x = Math.round(tx) - 8;
    const y = Math.round(ty) - 4;
    P(x + 6, y + 7, E.brownD, 4, 1);
    P(x + 7, y + 6, E.brown, 2, 7);
    P(x + 6, y + 2, E.orange, 4, 4);
    P(x + 7, y + 1, E.amber, 2, 4);
    P(x + 7, y + 3, E.yellow, 2, 2);
    P(x + 7, y, E.yellow, 1, 1);
  }
  // Soft shadow on the floor under each wall face.
  for (let ty = 1; ty < d.h; ty++) {
    for (let tx = 0; tx < d.w; tx++) {
      if (floorish(at(tx, ty)) && at(tx, ty - 1) === WALL) {
        ctx.fillStyle = 'rgba(24,20,37,0.32)';
        ctx.fillRect(tx * T, ty * T, T, 4);
        ctx.fillStyle = 'rgba(24,20,37,0.15)';
        ctx.fillRect(tx * T, ty * T + 4, T, 3);
      }
    }
  }
  for (let ty = 0; ty < d.h; ty++) {
    for (let tx = 0; tx < d.w; tx++) {
      if (at(tx, ty) !== PROP) continue;
      ctx.fillStyle = 'rgba(24,20,37,0.35)';
      ctx.fillRect(tx * T + 2, ty * T + 11, 12, 4);
      ctx.fillRect(tx * T + 4, ty * T + 10, 8, 6);
    }
  }
  add(scene, key, c);
  return key;
}

/** Pixel text as a Phaser texture, cached by content. */
export function textTexture(scene: Phaser.Scene, text: string, o: Parameters<typeof pxText>[1]): string {
  const key = `txt:${text}:${o.size ?? ''}:${o.color}:${o.outline ?? ''}:${o.small ? 's' : ''}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, pxText(text, o));
  return key;
}

export { flipCanvas, outlineCanvas };
