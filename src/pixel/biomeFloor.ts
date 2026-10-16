import type { Dungeon } from '../game/dungeon';
import type { Paint } from './decor';
import { paintForestFloor } from './forestFloor';
import { paintNaturalFloor } from './naturalFloors';
import { paintBuiltFloor } from './builtFloors';
import { createTerrain } from './terrainPaint';

/** One independent random stream per theme, baked once when a level is entered. */
export function paintBiomeFloor(P: Paint, biome: string, d: Dungeon, seed: number): void {
  if (biome === 'forest') return paintForestFloor(P, d, seed);
  let salt = 0x29a4b17d;
  for (const c of biome) salt = Math.imul(salt ^ c.charCodeAt(0), 16777619);
  const context = createTerrain(P, d, seed, salt);
  if (!paintNaturalFloor(biome, context)) paintBuiltFloor(biome, context);
}
