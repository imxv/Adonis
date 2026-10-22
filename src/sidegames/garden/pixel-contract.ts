import type { PlantId, SupplyId } from '../../meta/types';

/** Shared scene coordinates. Renderer and interactions must use this one map. */
export const GARDEN_WORLD = { width: 960, height: 640 } as const;
export const GARDEN_BEDS = [
  { id: 'bed-0', index: 0, name: '向阳花圃', x: 190, y: 218, width: 156, height: 108, approach: { x: 268, y: 352 } },
  { id: 'bed-1', index: 1, name: '回廊花圃', x: 402, y: 218, width: 156, height: 108, approach: { x: 480, y: 352 } },
  { id: 'bed-2', index: 2, name: '望海花圃', x: 614, y: 218, width: 156, height: 108, approach: { x: 692, y: 352 } },
] as const;
export const GARDEN_STATIONS = [
  { id: 'journal', name: '园艺手记', x: 115, y: 422, width: 100, height: 70, approach: { x: 228, y: 468 } },
  { id: 'craft', name: '草木调制台', x: 745, y: 412, width: 108, height: 80, approach: { x: 718, y: 468 } },
  { id: 'bag', name: '出征行囊', x: 425, y: 424, width: 110, height: 58, approach: { x: 480, y: 506 } },
  { id: 'exit', name: '返回画廊', x: 410, y: 566, width: 140, height: 66, approach: { x: 480, y: 565 } },
] as const;
export const GARDEN_SPAWN = { x: 480, y: 548 } as const;
/** Objects sit outside the main walkways; plots are operated from their south edge. */
export const GARDEN_WALK_BOUNDS = { minX: 76, maxX: 884, minY: 334, maxY: 592 } as const;
export type GardenTargetId = typeof GARDEN_BEDS[number]['id'] | typeof GARDEN_STATIONS[number]['id'];
export interface GardenBedVisual { plant: PlantId | null; progress: number; required: number }
export interface GardenSceneState {
  beds: readonly GardenBedVisual[];
  player: { x: number; y: number; facing: 'left' | 'right'; walking: boolean };
  target: GardenTargetId | null;
  selectedPlant: PlantId;
  packedSupply: SupplyId | null;
  elapsed: number;
  reducedMotion: boolean;
}
export interface GardenPixelRenderer {
  /** Draw in 960x640 world coordinates; caller owns viewport/camera transforms. */
  draw(ctx: CanvasRenderingContext2D, state: GardenSceneState): void;
  dispose(): void;
}
