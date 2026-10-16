import { E } from './palette';
import { CJK_FONT } from './draw';

export const SCALES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  majorPenta: [0, 2, 4, 7, 9],
  minorPenta: [0, 3, 5, 7, 10],
  gong: [0, 2, 4, 7, 9],
  miyakobushi: [0, 1, 5, 7, 8],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
};

export type FloorStyle = 'grass' | 'ice' | 'sand' | 'lava' | 'metal' | 'checker' | 'paper' | 'marble';
export type WallStyle = 'brick' | 'ice' | 'sandstone' | 'rock' | 'brass' | 'gothic' | 'wood' | 'marble';
export type Lead = 'pluck' | 'bell' | 'marimba' | 'glass';
export type Perc = 'soft' | 'claps' | 'clank' | 'taiko' | 'none';

export interface Biome {
  id: string;
  name: string;
  en: string;
  subtitle: string;
  palette: {
    bg: string;
    bg2: string;
    ink: string;
    mid: string;
    light: string;
    wall: string;
    accent: string;
    accentDark: string;
    danger: string;
    dangerRim: string;
    ally: string;
    extra: string[];
  };
  px: {
    floor: FloorStyle;
    floorCols: [string, string, string, string]; // base, alt, detail, detail2
    wall: WallStyle;
    wallTop: string;
    wallFace: string;
    wallDark: string;
    slime: string;
    bat: string;
    piglet: string;
    robe: string;
    goblin: string;
    stone: string;
    glow: string;
  };
  overlay: { grain: number; vignette: number };
  fonts: { display: string; body: string };
  frame: string;
  bossNames: { guardian: string; boar: string };
  callouts?: string[];
  audio: { root: string; scale: number[]; bpm: number; lead: Lead; perc: Perc; brightness: number };
}

const fonts = { display: `'Press Start 2P', ${CJK_FONT}`, body: CJK_FONT };
const common = { ink: E.ink, light: E.white, accent: E.red, accentDark: E.redD, dangerRim: E.white, ally: E.white };

export const BIOMES: Biome[] = [
  {
    id: 'forest',
    name: '森林遗迹',
    en: 'FOREST RUINS',
    subtitle: '藤蔓吞没了旧王的回廊',
    palette: { ...common, bg: '#3e8948', bg2: '#265c42', mid: E.green, wall: E.slate, danger: E.hot, extra: [E.amber, E.green, E.greenDD] },
    px: { floor: 'grass', floorCols: ['#3e8948', '#367a40', '#63c74d', '#265c42'], wall: 'brick', wallTop: '#3a4466', wallFace: '#5a6988', wallDark: '#262b44', slime: E.green, bat: E.purple, piglet: E.brownL, robe: E.brown, goblin: E.green, stone: E.greyM, glow: E.yellow },
    overlay: { grain: 0, vignette: 0.35 },
    fonts,
    frame: 'pixel',
    bossNames: { guardian: '苔石巨像', boar: '林中野猪' },
    audio: { root: 'D3', scale: SCALES.dorian, bpm: 92, lead: 'pluck', perc: 'soft', brightness: 0.6 },
  },
  {
    id: 'glacier',
    name: '冰封雪原',
    en: 'FROZEN WASTE',
    subtitle: '风雪里藏着不会融化的骨',
    palette: { ...common, bg: '#c0cbdc', bg2: '#8b9bb4', mid: E.cyan, wall: E.blueD, danger: E.orange, extra: [E.cyan, E.blue, E.white] },
    px: { floor: 'ice', floorCols: ['#c0cbdc', '#b3bfd2', '#ffffff', '#8b9bb4'], wall: 'ice', wallTop: '#262b44', wallFace: '#124e89', wallDark: '#193c3e', slime: E.cyan, bat: E.blue, piglet: E.greyM, robe: E.blueD, goblin: E.cyan, stone: E.grey, glow: E.cyan },
    overlay: { grain: 0, vignette: 0.3 },
    fonts,
    frame: 'pixel',
    bossNames: { guardian: '冰霜傀儡', boar: '雪原野猪' },
    audio: { root: 'E4', scale: SCALES.majorPenta, bpm: 100, lead: 'glass', perc: 'none', brightness: 0.85 },
  },
  {
    id: 'desert',
    name: '黄沙神殿',
    en: 'SAND TEMPLE',
    subtitle: '法老的狗还在守着空墓',
    palette: { ...common, bg: '#e4a672', bg2: '#d77643', mid: E.amber, wall: E.brownL, danger: E.magenta, extra: [E.amber, E.rust, E.cream] },
    px: { floor: 'sand', floorCols: ['#e4a672', '#d99b66', '#ead4aa', '#b86f50'], wall: 'sandstone', wallTop: '#733e39', wallFace: '#b86f50', wallDark: '#3e2731', slime: E.amber, bat: E.brown, piglet: E.clay, robe: E.rust, goblin: E.greenD, stone: E.tan, glow: E.cyan },
    overlay: { grain: 0, vignette: 0.3 },
    fonts,
    frame: 'pixel',
    bossNames: { guardian: '狮身守卫', boar: '沙暴野猪' },
    audio: { root: 'E3', scale: SCALES.phrygian, bpm: 96, lead: 'pluck', perc: 'taiko', brightness: 0.55 },
  },
  {
    id: 'volcano',
    name: '熔岩深渊',
    en: 'MAGMA DEPTHS',
    subtitle: '地底的火从未熄灭',
    palette: { ...common, bg: '#3e2731', bg2: '#262b44', mid: E.orange, wall: E.brown, danger: E.cyan, accent: E.hot, extra: [E.orange, E.amber, E.redD] },
    px: { floor: 'lava', floorCols: ['#3e2731', '#352230', '#f77622', '#262b44'], wall: 'rock', wallTop: '#3e2731', wallFace: '#733e39', wallDark: '#3e2731', slime: E.orange, bat: E.redD, piglet: E.rust, robe: E.brownD, goblin: E.clay, stone: E.slate, glow: E.amber },
    overlay: { grain: 0, vignette: 0.5 },
    fonts,
    frame: 'pixel',
    bossNames: { guardian: '熔核魔像', boar: '烈焰野猪' },
    audio: { root: 'A2', scale: SCALES.harmonicMinor, bpm: 104, lead: 'marimba', perc: 'taiko', brightness: 0.45 },
  },
  {
    id: 'factory',
    name: '蒸汽工坊',
    en: 'STEAM WORKS',
    subtitle: '齿轮咬合，炉火不歇',
    palette: { ...common, bg: '#5a6988', bg2: '#3a4466', mid: E.amber, wall: E.brownL, danger: E.yellow, extra: [E.amber, E.brownL, E.grey] },
    px: { floor: 'metal', floorCols: ['#5a6988', '#4f5d7c', '#8b9bb4', '#3a4466'], wall: 'brass', wallTop: '#3e2731', wallFace: '#b86f50', wallDark: '#733e39', slime: E.greyM, bat: E.slateD, piglet: E.brownL, robe: E.slateD, goblin: E.green, stone: E.brownL, glow: E.yellow },
    overlay: { grain: 0, vignette: 0.4 },
    fonts,
    frame: 'pixel',
    bossNames: { guardian: '蒸汽巨像', boar: '机械野猪' },
    audio: { root: 'A2', scale: SCALES.harmonicMinor, bpm: 100, lead: 'marimba', perc: 'clank', brightness: 0.5 },
  },
  {
    id: 'castle',
    name: '幽魂古堡',
    en: 'HAUNTED KEEP',
    subtitle: '烛火熄灭后，画像会眨眼',
    palette: { ...common, bg: '#3a4466', bg2: '#262b44', mid: E.magenta, wall: E.purple, danger: E.cyan, extra: [E.magenta, E.purple, E.cyan] },
    px: { floor: 'checker', floorCols: ['#3a4466', '#262b44', '#5a6988', '#181425'], wall: 'gothic', wallTop: '#262b44', wallFace: '#68386c', wallDark: '#3e2731', slime: E.magenta, bat: E.purple, piglet: E.greyM, robe: E.purple, goblin: E.greenD, stone: E.slate, glow: E.cyan },
    overlay: { grain: 0, vignette: 0.55 },
    fonts,
    frame: 'pixel',
    bossNames: { guardian: '石像鬼', boar: '亡灵野猪' },
    audio: { root: 'D3', scale: SCALES.aeolian, bpm: 88, lead: 'glass', perc: 'soft', brightness: 0.55 },
  },
  {
    id: 'garden',
    name: '东方庭院',
    en: 'EASTERN GARDEN',
    subtitle: '落花无声，剑气有痕',
    palette: { ...common, bg: '#ead4aa', bg2: '#e4a672', mid: E.redD, wall: E.redD, danger: E.blueD, extra: [E.red, E.greenD, E.cream] },
    px: { floor: 'paper', floorCols: ['#ead4aa', '#e2c99c', '#c28569', '#e4a672'], wall: 'wood', wallTop: '#3e2731', wallFace: '#a22633', wallDark: '#733e39', slime: E.greenD, bat: E.slateD, piglet: E.pink, robe: E.redD, goblin: E.green, stone: E.greyM, glow: E.amber },
    overlay: { grain: 0, vignette: 0.25 },
    fonts,
    frame: 'pixel',
    bossNames: { guardian: '石狮守护', boar: '山神野猪' },
    audio: { root: 'D4', scale: SCALES.gong, bpm: 84, lead: 'pluck', perc: 'none', brightness: 0.55 },
  },
  {
    id: 'palace',
    name: '文艺复兴宫殿',
    en: 'MARBLE PALACE',
    subtitle: '壁画里的天使拔出了剑',
    palette: { ...common, bg: '#ead4aa', bg2: '#c0cbdc', mid: E.blue, wall: E.cream, danger: E.purple, extra: [E.amber, E.blue, E.cream] },
    px: { floor: 'marble', floorCols: ['#ead4aa', '#c0cbdc', '#ffffff', '#8b9bb4'], wall: 'marble', wallTop: '#733e39', wallFace: '#c28569', wallDark: '#b86f50', slime: E.blue, bat: E.slate, piglet: E.skinD, robe: E.blueD, goblin: E.green, stone: E.cream, glow: E.amber },
    overlay: { grain: 0, vignette: 0.3 },
    fonts,
    frame: 'pixel',
    bossNames: { guardian: '大理石天使', boar: '金鬃野猪' },
    audio: { root: 'F3', scale: SCALES.lydian, bpm: 90, lead: 'bell', perc: 'soft', brightness: 0.7 },
  },
];

export const BIOME_BY_ID: Record<string, Biome> = Object.fromEntries(BIOMES.map((b) => [b.id, b]));
