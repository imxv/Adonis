import type Phaser from 'phaser';
import type { Biome } from './biomes';
import { Grid } from './draw';
import { E, mix, ramp } from './palette';

type TrapState = 'idle' | 'warn' | 'active';
type FlowKind = 'wind' | 'water' | 'conveyor';

/** All fixtures occupy one 16px tile and face right. Use quarter turns for other directions. */
function render(g: Grid, kit: Biome) {
  return g.render({
    margin: 0,
    roles: {
      '1': ramp(kit.px.wallFace, mix(kit.px.wallFace, E.white, 0.45), kit.px.wallDark),
      '2': ramp(kit.px.stone),
    },
    colors: { d: kit.palette.danger, h: E.white, a: kit.px.glow, m: kit.px.wallTop },
  });
}

function arrows(kit: Biome, state: TrapState) {
  const g = new Grid(16, 16);
  // A masonry block with three unmistakable arrow holes, rather than a coloured floor plate.
  g.rect(1, 2, 10, 12, '1').rect(2, 3, 8, 1, '2').rect(2, 11, 8, 2, 'm');
  for (const y of [5, 8, 11]) g.rect(6, y - 1, 5, 2, 'e').set(10, y - 1, state === 'idle' ? 'G' : 'h');
  if (kit.id === 'desert' || kit.id === 'palace') g.line(3, 5, 3, 10, 'y').set(2, 7, 'y').set(4, 7, 'y');
  else if (kit.id === 'castle') g.tri(2, 2, 10, 2, 6, 0, '1').set(3, 8, 'v');
  else if (kit.id === 'forest' || kit.id === 'garden') g.rect(1, 3, 1, 5, 'L').set(2, 5, 'l').set(2, 9, 'l');
  else g.set(3, 5, 'g').set(3, 10, 'g');
  if (state === 'warn') g.line(13, 4, 13, 9, 'h').set(13, 11, 'd');
  if (state === 'active') for (const y of [4, 8, 12]) g.line(10, y, 14, y, 'h').tri(13, y - 1, 15, y, 13, y + 1, 'd');
  return render(g, kit);
}

function vent(kit: Biome, state: TrapState) {
  const g = new Grid(16, 16);
  g.ellipse(6, 8, 5, 5, '1').ellipse(6, 8, 3, 3, 'e').rect(8, 5, 4, 7, '2');
  for (const y of [6, 8, 10]) g.line(3, y, 7, y, 'G');
  g.rect(11, 5, 2, 7, 'm').line(12, 6, 12, 10, state === 'idle' ? 'G' : 'h');
  if (kit.id === 'volcano') g.set(3, 5, 'r').line(4, 11, 7, 12, 'O');
  if (kit.id === 'factory') g.rect(3, 1, 5, 2, 'y').line(5, 2, 5, 4, 'b');
  if (state === 'warn') g.ellipse(12, 2, 1, 1, 'g').set(15, 4, 'h');
  if (state === 'active') {
    const steam = kit.id === 'factory' || kit.id === 'reef' || kit.id === 'glacier';
    g.tri(12, 6, 15, 3, 15, 12, steam ? 'g' : 'O').line(13, 7, 15, 6, 'h').line(13, 9, 15, 10, steam ? 'h' : 'Y');
  }
  return render(g, kit);
}

function falling(kit: Biome, state: TrapState) {
  const g = new Grid(16, 16);
  g.ellipse(7.5, 8, 6, 5, '1').ellipse(7.5, 8, 4, 3, 'm');
  // A dented landing plate remains visible even while the overhead rock is dormant.
  g.line(4, 5, 6, 7, 'e').line(6, 7, 5, 10, 'e').line(10, 7, 11, 10, 'e');
  if (kit.id === 'glacier') g.tri(3, 5, 5, 2, 6, 5, 'c').set(11, 11, 'w');
  if (state === 'warn') {
    for (const [x, y] of [[7, 1], [7, 13], [1, 7], [13, 7]]) g.rect(x, y, 2, 2, 'h');
    g.line(7, 4, 7, 8, 'h').set(7, 10, 'd');
  }
  if (state === 'active') g.tri(4, 10, 7, 4, 10, 10, '2').set(6, 6, 'h').set(2, 4, '2').set(13, 10, 'h');
  return render(g, kit);
}

function beam(kit: Biome, state: TrapState) {
  const g = new Grid(16, 16);
  g.rect(2, 2, 6, 12, '1').rect(3, 3, 3, 10, 'm').rect(7, 5, 4, 6, '2');
  g.rect(9, 6, 2, 4, state === 'idle' ? 'a' : 'h').set(4, 4, 'g').set(4, 11, 'g');
  if (kit.id === 'reef') g.tri(2, 4, 5, 0, 7, 4, 'c').set(2, 12, 'p');
  else if (kit.id === 'neon') g.line(2, 3, 2, 12, 'c').line(7, 3, 7, 4, 'P');
  else g.line(3, 2, 6, 2, 'y').line(3, 13, 6, 13, 'y');
  if (state === 'warn') g.set(12, 7, 'h').set(14, 7, 'h').set(12, 9, 'd').set(14, 9, 'd');
  if (state === 'active') g.rect(11, 6, 5, 4, 'd').rect(11, 7, 5, 2, 'h');
  return render(g, kit);
}

function flow(kit: Biome, kind: FlowKind, frame: number) {
  const g = new Grid(16, 16);
  if (kind === 'wind') {
    for (const [y, start, length] of [[3, 1, 8], [7, 3, 10], [11, 1, 8]]) {
      const x = start + frame;
      g.line(x, y, Math.min(14, x + length), y, 'g').line(x + length - 2, y - 1, x + length, y, 'h');
    }
  } else if (kind === 'water') {
    g.rect(1, 2, 14, 12, 'K');
    for (const y of [4, 8, 12]) for (const x of [2, 8]) {
      const offset = (x + frame * 2) % 10;
      g.line(offset + 1, y, offset + 3, y, 'k').line(offset + 3, y, offset + 4, y - 1, 'c');
    }
    g.line(6, 5, 10, 8, 'g').line(10, 8, 6, 11, 'g');
  } else {
    g.rect(1, 2, 14, 12, '1').rect(2, 4, 12, 8, 'e');
    g.rect(2, 2, 12, 2, 'G').rect(2, 12, 12, 2, 'G');
    for (let x = -3 + frame * 2; x < 13; x += 6) {
      g.line(x, 5, x + 3, 8, 'g').line(x + 3, 8, x, 11, 'g');
    }
    g.set(2, 2, 'w').set(13, 12, 'w');
  }
  return render(g, kit);
}

/**
 * Keys use the same `name@biome` convention as K(). Idle is the unsuffixed key;
 * traps also have -warn/-active, flows have -1/-2. No Phaser timers are installed.
 * Runtime draws the full warning/damage footprint separately from these fixtures.
 */
export function buildTrapTextures(scene: Phaser.Scene, kit: Biome) {
  const add = (name: string, canvas: HTMLCanvasElement) => {
    const key = `${name}@${kit.id}`;
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
  };
  for (const [name, draw] of Object.entries({ arrows, vent, falling, beam })) {
    for (const state of ['idle', 'warn', 'active'] as const) add(`trap-${name}${state === 'idle' ? '' : `-${state}`}`, draw(kit, state));
  }
  for (const kind of ['wind', 'water', 'conveyor'] as const) {
    for (let frame = 0; frame < 3; frame++) add(`flow-${kind}${frame ? `-${frame}` : ''}`, flow(kit, kind, frame));
  }
  const arrow = new Grid(16, 16).line(2, 8, 13, 8, 'h').tri(10, 5, 14, 8, 10, 11, 'd').line(2, 6, 4, 8, 'g').line(2, 10, 4, 8, 'g');
  add('trap-arrow', render(arrow, kit));
  const debris = new Grid(16, 16);
  if (kit.id === 'glacier') debris.tri(3, 2, 12, 2, 8, 14, 'c').tri(4, 3, 8, 3, 8, 12, 'w').line(10, 4, 9, 8, 'k');
  else debris.ellipse(7, 7, 5, 5, '2').line(4, 4, 8, 3, 'h').line(8, 6, 6, 9, 'm').line(6, 9, 8, 11, 'm');
  add('trap-debris', render(debris, kit));
}
