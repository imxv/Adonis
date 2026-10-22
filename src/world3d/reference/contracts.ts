import type { Camera, Object3D, Plane, Scene, Texture, WebGLRenderer, WebGLRenderTarget } from 'three';
import type { ArtLayer } from '../artLayer';
import type { GreekWorldQuality } from '../types';

/** Metres, +Y up, north -Z. Yaw radians; a model's front faces local +Z. */
export type ReferenceVec3 = readonly [x: number, y: number, z: number];
export type ReferenceCameraId = 'coast' | 'grove' | 'waterfall';
export interface ReferenceCamera {
  readonly id: ReferenceCameraId;
  /** Absolute eye position, not the ground contact. */
  readonly position: ReferenceVec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly fov: number;
  readonly aspect: number;
}

export type ArchitectureKind = 'temple' | 'pavilion' | 'ionic-column' | 'stairs' | 'bridge' |
  'terrace-wall' | 'spring-shrine' | 'urn' | 'stele' | 'valve-plinth' | 'mural-frame';
export type NatureKind = 'olive-hero' | 'olive' | 'cypress' | 'cliff' | 'rock-cluster' | 'ground-cover';
export interface ReferencePlacement<K extends string> {
  readonly id: string;
  readonly kind: K;
  readonly position: ReferenceVec3;
  readonly yaw: number;
  /** Target metre envelope [width, height, depth], not an instruction to stretch a finished mesh. */
  readonly size: ReferenceVec3;
  readonly variant: number;
}
/** Origin: floor/footprint centre. Bridge: deck centre at y=0.
 * Stairs: bottom/front centre at y=0,z=0, ascend local -Z by size.y over size.z.
 * Temple: complete walkable floor at y=0, front threshold at local z=+depth/2.
 */
export type ArchitecturePlacement = ReferencePlacement<ArchitectureKind>;
/** Ground/footprint centre at y=0. Individual cliff silhouettes must differ. */
export type NaturePlacement = ReferencePlacement<NatureKind>;
export interface ReferencePath {
  readonly id: string;
  readonly width: number;
  /** World-space walk-floor points. Integrator owns groundHeight/collision interpolation. */
  readonly points: readonly ReferenceVec3[];
}
export interface ReferenceWaterSurface {
  readonly id: string;
  readonly kind: 'sea' | 'pool';
  readonly outline: readonly ReferenceVec3[];
  readonly controlledBySpring: boolean;
}
export interface ReferenceStream {
  readonly id: string;
  readonly kind: 'stream';
  readonly width: number;
  readonly points: readonly ReferenceVec3[];
  readonly controlledBySpring: boolean;
}
export interface ReferenceWaterfall {
  readonly id: string;
  readonly kind: 'waterfall';
  readonly tiers: readonly { readonly top: ReferenceVec3; readonly bottom: ReferenceVec3; readonly width: number }[];
  readonly controlledBySpring: boolean;
}
export type ReferenceWater = ReferenceWaterSurface | ReferenceStream | ReferenceWaterfall;
export interface ReferenceAnchor { readonly id: string; readonly position: ReferenceVec3; readonly radius: number }
export interface ReferenceLayout {
  readonly version: 'v3-reference-1';
  readonly cameras: readonly ReferenceCamera[];
  readonly architecture: readonly ArchitecturePlacement[];
  readonly nature: readonly NaturePlacement[];
  readonly water: readonly ReferenceWater[];
  readonly paths: readonly ReferencePath[];
  readonly discoveries: readonly ReferenceAnchor[];
  readonly valves: readonly ReferenceAnchor[];
  readonly gate: { readonly position: ReferenceVec3; readonly yaw: number; readonly size: ReferenceVec3 };
}
export interface ReferenceLighting {
  /** Borrowed from integrator. Never mutate or dispose this texture. Null is valid in an asset lab. */
  readonly environment: Texture | null;
  /** PMREM is a 2D CubeUVReflectionMapping atlas, NEVER a samplerCube input.
   * Standard/Physical materials use Three's env-map handling; custom shaders must branch
   * on this tag and use matching cubeUV sampling or a separately produced CubeTexture.
   */
  readonly environmentKind: 'none' | 'cube' | 'pmrem-cubeuv';
  /** Unit vector from a surface toward the sun. Integrator owns actual lights and exposure. */
  readonly sunDirection: ReferenceVec3;
  readonly sunColor: string;
  readonly skyTop: string;
  readonly skyHorizon: string;
}
/** D-owned optional local deformation, in world metres. C builds its original
 * MVC samples, outer feet and scalar foundation from baselineTerrainHeight,
 * then deforms only the local shared top/bottom/side columns. The identifiers
 * describe one matched candidate; they are not a request to rebuild the field.
 */
export interface ReferenceGroveBankPatch {
  readonly revision: string;
  readonly shapeRevision: string;
  readonly baselineRevision: string;
  /** Closed polygon (last-to-first edge implicit). Boundary and exterior have
   * zero sample weight; consumers must not add another domain fade.
   */
  readonly domainXZ: readonly (readonly [x: number, z: number])[];
  /** Metres below the final D target at full weight; current contract uses .18. */
  readonly rockInsetM: number;
  /** Frozen pre-patch FINAL analytic terrain, including the old overlays. */
  readonly baselineTerrainHeight: (x: number, z: number) => number;
  /** Final protected D terrain Y and the ONE rock displacement weight in [0,1].
   * Weight already includes feature, road/water guards and C boundary fade.
   * Partial weight interpolates from the original C top: terrainY-rockInsetM
   * is a full-weight target, not a hard upper bound throughout the transition.
   */
  readonly sample: (x: number, z: number) => { readonly terrainY: number; readonly weight: number };
}
export interface ReferenceLayerOptions {
  readonly layout: ReferenceLayout;
  readonly quality: GreekWorldQuality;
  readonly signal: AbortSignal;
  readonly lighting: ReferenceLighting;
  /** Physical ground/seabed; may be negative. Never includes a bridge deck. */
  readonly terrainHeight: (x: number, z: number) => number;
  /** Integrator's gameplay walk floor, including paths, stairs and bridges. */
  readonly walkHeight: (x: number, z: number) => number;
}
/** Only the water factory receives render services; A/C use ReferenceLayerOptions unchanged. */
export interface ReferenceWaterRenderContext {
  /** Borrowed. Never dispose, replace, or start a loop. Render only via frame.renderOffscreen. */
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
}
export interface ReferenceWaterLayerOptions extends ReferenceLayerOptions {
  readonly renderContext: ReferenceWaterRenderContext;
}
/** Box position is the VOLUME centre; size includes height, unlike asset origin. */
export type ReferenceCollider =
  | { readonly id: string; readonly kind: 'circle'; readonly x: number; readonly z: number; readonly radius: number }
  | { readonly id: string; readonly kind: 'box'; readonly position: ReferenceVec3; readonly size: ReferenceVec3; readonly yaw: number };
export interface ReferenceLayer extends ArtLayer {
  /** Proxies only: integrator decides walkability/gates. Do not attach input or scene listeners. */
  readonly colliders: readonly ReferenceCollider[];
  /** Named world-space attachment points. A MUST return grove.spring.spout exactly at
   * layout.water['water.sacred-spring'].points[0], matching the physical model outlet.
   */
  readonly anchors: Readonly<Record<string, ReferenceVec3>>;
  /** Await pending quality assets for deterministic capture. Resolves immediately when none. */
  whenReady(): Promise<void>;
}
export interface ReferencePuzzleState {
  readonly rotations: readonly [number, number, number];
  readonly springRestored: boolean;
}
export interface ReferenceOffscreenPass {
  readonly kind: 'water-reflection' | 'water-refraction';
  /** Owned by the water layer. Caller must respect frame.offscreenBudget.maxTargetSize. */
  readonly target: WebGLRenderTarget;
  /** Water-owned clone/mirror camera; never mutate frame.camera. */
  readonly camera: Camera;
  readonly exclude: readonly Object3D[];
  /** World-space plane, borrowed only for this call; integrator copies/restores renderer clipping. */
  readonly clippingPlane?: Plane;
}
export interface ReferenceRenderFrame extends ReferenceWaterRenderContext {
  readonly frameNumber: number;
  readonly time: number;
  readonly delta: number;
  readonly camera: Camera;
  /** CSS pixels; actual target pixels are bounded independently by offscreenBudget. */
  readonly viewport: { readonly width: number; readonly height: number; readonly pixelRatio: number };
  readonly offscreenBudget: { readonly maxPasses: number; readonly maxTargetSize: number };
  /** The ONLY permitted offscreen scene-render entry. False means budget/visibility/recursion skip.
   * Integrator owns a global recursion guard and try/finally restoration of render target
   * (cube face/mip), viewport/scissor/test, clipping/localClipping, XR, autoClear/clear colour,
   * shadow autoUpdate, scene overrides and excluded object visibility. Full-frame renderer.info
   * must include these passes (autoReset=false with one explicit reset per complete frame).
   */
  readonly renderOffscreen: (pass: ReferenceOffscreenPass) => boolean;
}
export interface ReferenceWaterLayer extends ReferenceLayer {
  /** Called by D once before the MAIN scene render, never from an offscreen pass.
   * No renderer.render/setRenderTarget calls or self-rendering onBeforeRender/RAF hooks.
   * All reflection/refraction draws go through frame.renderOffscreen, including exclusions.
   */
  beforeRender?(frame: ReferenceRenderFrame): void;
  /** CSS viewport size, same units as frame.viewport. No scene render from resize. */
  resize?(width: number, height: number): void;
  /** Visual state only; do not evaluate puzzle targets, emit discoveries or persist. */
  setPuzzleState(state: ReferencePuzzleState): void;
}

// Factories (async even for synchronous procedural authoring):
// architecture.ts: createReferenceArchitecture(options): Promise<ReferenceLayer>
// nature.ts:       createReferenceNature(options): Promise<ReferenceLayer>
// water.ts:        createReferenceWater(options: ReferenceWaterLayerOptions): Promise<ReferenceWaterLayer>
// root is already in WORLD coordinates, returned detached. No module-created scene/renderer/RAF.
// Each factory owns all resources it creates, disposes partial failures, supports repeated dispose,
// and releases late async results after abort/dispose. Only lighting.environment is borrowed.
