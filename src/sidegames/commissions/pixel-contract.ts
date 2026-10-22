import type { NpcId } from '../../meta/life';
export const COMMISSION_WORLD = { width: 960, height: 640 } as const;
export const COMMISSION_TARGETS = [
  { id: 'nereus', name: '涅柔斯', x: 244, y: 338, width: 68, height: 100, foot: { x: 278, y: 430 }, approach: { x: 330, y: 470 } },
  { id: 'daphne', name: '达芙妮', x: 650, y: 338, width: 68, height: 100, foot: { x: 684, y: 430 }, approach: { x: 632, y: 470 } },
  { id: 'exit', name: '回廊出口', x: 410, y: 572, width: 140, height: 60, foot: { x: 480, y: 608 }, approach: { x: 480, y: 570 } },
] as const;
export type CommissionTargetId = typeof COMMISSION_TARGETS[number]['id'];
export const COMMISSION_SPAWN = { x: 480, y: 536 } as const;
export const COMMISSION_WALK_BOUNDS = { minX: 76, maxX: 884, minY: 386, maxY: 592 } as const;
/** Foot collisions: two NPCs, the central fountain lip and their craft tables. */
export const COMMISSION_OBSTACLES = [
  { left: 254, top: 406, right: 302, bottom: 442 },
  { left: 660, top: 406, right: 708, bottom: 442 },
  { left: 420, top: 324, right: 540, bottom: 416 },
  { left: 116, top: 408, right: 224, bottom: 474 },
  { left: 748, top: 408, right: 844, bottom: 474 },
] as const;
export interface CommissionSceneState {
  player: { x: number; y: number; facing: 'left' | 'right'; walking: boolean };
  target: CommissionTargetId | null;
  conversation: NpcId | null;
  npcs: readonly { id: NpcId; completed: number; total: number; ready: boolean }[];
  feedbackNpc: NpcId | null;
  elapsed: number;
  reducedMotion: boolean;
}
export interface CommissionPixelRenderer {
  draw(ctx: CanvasRenderingContext2D, state: CommissionSceneState): void;
  dispose(): void;
}
