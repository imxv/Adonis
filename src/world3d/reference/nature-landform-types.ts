import type * as THREE from 'three';
import type { ReferenceGroveBankPatch } from './contracts';
import type { NatureMaterials } from './nature-materials';

/** Input-only world-metre contacts. D owns the runtime values; C never stores
 * a second coordinate set in an asset module. XZ outlines are ordered rings. */
export type LandformXZ = readonly [number, number];
export type LandformPoint = readonly [number, number, number];
export interface LandformContour { readonly y: number; readonly outlineXZ: readonly LandformXZ[] }
export interface LandformFlight {
  readonly id: string;
  readonly position: LandformPoint;
  readonly end: LandformPoint;
  readonly size: LandformPoint;
  readonly levels: number;
  readonly yaw: number;
}
export interface LandformLanding {
  readonly from: LandformPoint;
  readonly to: LandformPoint;
  readonly width: number;
  readonly outlineXZ?: readonly LandformXZ[];
  readonly level?: number;
  readonly minimumBodyRadius?: number;
}
export interface LandformCauseway {
  readonly axis: readonly LandformPoint[];
  readonly groundCrestY: number;
  readonly crestWidth: number;
  readonly footWidthMax: number;
  readonly excludeBridgeSpan: {
    readonly center: LandformPoint;
    readonly localAbsXBelow: number;
    readonly halfWidth: number;
  };
}
export interface LandformPool {
  readonly level: number;
  readonly outlineXZ: readonly LandformXZ[];
  readonly bedYRange: readonly [number, number];
  readonly outerFootTargetXZ: { readonly x: readonly [number, number]; readonly z: readonly [number, number] };
  readonly downhillBlendWidthM: readonly [number, number];
}
export interface LandformSpringBranch {
  /** D-authoritative ordered foot-floor points; no asset-owned runtime route. */
  readonly points: readonly LandformPoint[];
  readonly bodyRadius: number;
  readonly supportClearance: number;
  /** D's allowed lateral player-centre range; absent means centreline only. */
  readonly centerHalfWidth?: number;
  /** D-declared allowance for actual foot floors below the canonical line. */
  readonly additionalSupportClearance?: number;
}
export interface NatureLandformContacts {
  readonly sanctuaryFrontContours: readonly LandformContour[];
  readonly flights: readonly LandformFlight[];
  readonly landing: LandformLanding;
  readonly grovePool: LandformPool;
  readonly bridgeEastCauseway: LandformCauseway;
  readonly springBranch?: LandformSpringBranch;
}
export interface NatureLandformContext {
  readonly quality: 'low' | 'high';
  /** Borrowed materials/maps. Asset geometry disposal must not dispose these. */
  readonly materials: Pick<NatureMaterials, 'limestone' | 'wetLimestone'>;
  /** D's actual soil/seabed at integration. A standalone sample may supply an
   * explicitly labelled provisional plane; no terrain function is authored here. */
  readonly terrainHeight: (x: number, z: number) => number;
  readonly signal?: AbortSignal;
}
export interface SanctuaryLandformOptions extends NatureLandformContext {
  readonly contours: readonly LandformContour[];
  readonly flights: readonly LandformFlight[];
  readonly landing: LandformLanding;
  readonly springBranch?: LandformSpringBranch;
}
export interface GroveBankLandformOptions extends NatureLandformContext {
  /** D-owned local target; all original construction reads its frozen baseline. */
  readonly groveBankPatch?: ReferenceGroveBankPatch;
  readonly pool: LandformPool;
  readonly causeway: LandformCauseway;
  readonly flights: readonly LandformFlight[];
}
export type NatureLandformGroup = THREE.Group;
