import type { Group, Vector3 } from 'three';
import type { GreekWorldQuality } from './types';

/** Independently owned art layer; no input, discoveries, or persistence. */
export interface ArtLayer {
  root: Group;
  setQuality(quality: GreekWorldQuality): void;
  update(time: number, position: Vector3): void;
  dispose(): void;
}
export interface ArtLayerOptions {
  groundHeight(x: number, z: number): number;
  quality: GreekWorldQuality;
}
