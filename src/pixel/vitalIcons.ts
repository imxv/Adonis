import { Grid } from './draw';
import { E } from './palette';

/**
 * Adonis' anemone colours stay inside the familiar heart silhouette. The smaller
 * bronze round shield has a recessed patina face and raised boss, like an aspis.
 * Every state retains its native canvas size so flashes never move the HUD.
 */
export function vitalIcons() {
  const heart = Grid.ascii([
    '.pp.pp.',
    'pcprrrp',
    'prrRrrR',
    '.rrRrR.',
    '..rRR..',
    '...R...',
  ]);
  const heartEmpty = Grid.ascii([
    '.dd.dd.',
    'diidiid',
    'diiiiid',
    '.diiid.',
    '..did..',
    '...d...',
  ]);
  const armor = Grid.ascii([
    '.lll.',
    'lpppb',
    'lpOpb',
    'bpppb',
    '.bbb.',
  ]);
  const armorEmpty = Grid.ascii([
    '.ddd.',
    'diiid',
    'didid',
    'diiid',
    '.ddd.',
  ]);

  return {
    heart: heart.render({ colors: { p: E.pink, c: E.cream, r: E.red, R: E.redD } }),
    heartEmpty: heartEmpty.render({ colors: { d: '#51333f', i: '#271d2a' } }),
    heartFlash: heart.render({ colors: { p: E.cream, c: E.cream, r: E.cream, R: E.cream } }),
    armor: armor.render({ colors: { l: '#d9b57a', p: '#466362', O: E.cream, b: '#96714d' } }),
    armorEmpty: armorEmpty.render({ colors: { d: '#51483e', i: '#232329' } }),
    armorFlash: armor.render({ colors: { l: E.cream, p: E.cream, O: E.cream, b: E.cream } }),
  };
}
