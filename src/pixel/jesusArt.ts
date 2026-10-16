import type Phaser from 'phaser';
import { Grid } from './draw';
import { E } from './palette';

/** Same fourteen-pixel body width as Adonis; only the suspended halo adds height. */
const JESUS_A = [
  '....yYYYYy....',
  '...Y......Y...',
  '....yyyyyy....',
  '..............',
  '....BbbB......',
  '...BbtbbB.....',
  '...Bbsssb.....',
  '...Bbssos.....',
  '...BbsSss.....',
  '...BBbbSb.....',
  '..wRwTbbww....',
  '..wRrwwTwwg...',
  '.swRwrywTwgs..',
  '...wwRrwwg....',
  '...wwwRrwg....',
  '...wgwwRrg....',
  '..wggwwwRg....',
  '..TTTTTTTT....',
  '...bb...bb....',
];
const JESUS_B = [
  ...JESUS_A.slice(0, 14),
  '...wwwRrwg....',
  '..wwgwwRrg....',
  '..wggwwwRwg...',
  '..TTTTTTTTT...',
  '..bb.....bb...',
];

/** Called by the common texture registry; the returned canvas can also become a DOM icon. */
export function registerJesusTextures(scene: Phaser.Scene): { icon: HTMLCanvasElement } {
  let icon: HTMLCanvasElement | undefined;
  for (const [frame, rows] of [['a', JESUS_A], ['b', JESUS_B]] as const) {
    const key = `jesus-${frame}`;
    if (!scene.textures.exists(key)) {
      const canvas = Grid.ascii([...rows]).render({ colors: { w: '#fff4dc', T: E.cream, g: '#9c9eac' } });
      scene.textures.addCanvas(key, canvas);
    }
    if (frame === 'a') icon = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
  }
  return { icon: icon! };
}
