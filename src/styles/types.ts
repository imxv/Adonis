export type Pattern =
  | 'marble'
  | 'halftone'
  | 'gears'
  | 'ink'
  | 'seigaiha'
  | 'meander'
  | 'bauhaus'
  | 'stainedglass'
  | 'blueprint'
  | 'impression'
  | 'popdots'
  | 'nouveau';

export type Shading = 'flat' | 'gradient' | 'halftone' | 'hatching' | 'wash' | 'bokashi' | 'facets';
export type OutlineMode = 'none' | 'thin' | 'thick' | 'ink' | 'double' | 'incised';
export type ShapeLang = 'round' | 'angular' | 'mechanical' | 'organic' | 'geometric';
export type ParticleKind = 'flakes' | 'stars' | 'gears' | 'ink' | 'foam' | 'shards' | 'dots' | 'glass';
export type Frame = 'gilded' | 'comic' | 'brass' | 'scroll' | 'woodblock' | 'pottery' | 'bauhaus' | 'lead' | 'blueprint' | 'soft';
export type BossOrnament = 'vitruvian' | 'mecha' | 'clock' | 'dragon' | 'oni' | 'horns' | 'shapes' | 'rose';
export type Lead = 'pluck' | 'bell' | 'marimba' | 'softsaw' | 'glass';
export type Perc = 'soft' | 'claps' | 'clank' | 'taiko' | 'none';

export interface StyleKit {
  id: string;
  name: string; // 中文画风名
  en: string; // English display name
  subtitle: string; // 时间地点，用于关卡开场
  palette: {
    bg: string; // 地面主色
    bg2: string; // 地面辅色
    ink: string; // 描边与暗部
    mid: string; // 敌人主色
    light: string; // 高光
    wall: string; // 墙体
    accent: string; // 主角与主角子弹
    accentDark: string; // 主角的暗部
    danger: string; // 敌方子弹与预警
    dangerRim: string; // 敌方子弹描边，保证可读
    ally: string; // 宠物主色
    extra: string[]; // 装饰色
  };
  outline: { mode: OutlineMode; width: number };
  shading: Shading;
  pattern: Pattern;
  overlay: { grain: number; vignette: number };
  shape: ShapeLang;
  particle: ParticleKind;
  fonts: { display: string; body: string };
  frame: Frame;
  bossOrnament: BossOrnament;
  bossNames: { guardian: string; boar: string };
  callouts?: string[]; // 漫画拟声字之类的击杀弹字
  audio: {
    root: string; // e.g. 'D3'
    scale: number[]; // semitone offsets
    bpm: number;
    lead: Lead;
    perc: Perc;
    brightness: number; // 0..1, low-pass cutoff scaling
  };
}

export const SCALES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  majorPenta: [0, 2, 4, 7, 9],
  minorPenta: [0, 3, 5, 7, 10],
  gong: [0, 2, 4, 7, 9],
  yu: [0, 3, 5, 7, 10],
  miyakobushi: [0, 1, 5, 7, 8],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
};
