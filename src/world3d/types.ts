import type { Scene, Vector3 } from 'three';

export type GreekWorldQuality = 'low' | 'medium' | 'high';
export interface GreekWorldOptions {
  container: HTMLElement;
  onExit: () => void;
  onDiscover: (id: string) => void;
  discoveredIds?: readonly string[];
  quality?: GreekWorldQuality | 'auto';
  signal?: AbortSignal;
}
export interface GreekWorldHandle { dispose(): void; pause(paused: boolean): void; resize(): void }
export interface WorldPoint { x: number; z: number }
export interface Discovery extends WorldPoint {
  id: string; title: string; area: string; body: string; footnote: string; radius: number;
  requiresSpring?: boolean;
}
export interface WorldEnvironment {
  scene: Scene;
  spawn: WorldPoint & { yaw: number; pitch: number };
  groundHeight(x: number, z: number): number;
  canWalk(x: number, z: number, springRestored: boolean): boolean;
  update(time: number, delta: number, position: Vector3): void;
  setPuzzle(rotations: readonly number[], solved: boolean): void;
  setQuality(quality: GreekWorldQuality): void;
  dispose(): void;
}
