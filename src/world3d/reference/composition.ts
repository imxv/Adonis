import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { GreekWorldQuality, WorldEnvironment } from '../types';
import { createPainterlyTextures } from '../painterly';
import { REFERENCE_LAYOUT, REFERENCE_LAYOUT_REVISION } from './layout';
import { createReferenceRouteSurfaces } from './route-surfaces';
import { createCascadeGroundSupport } from './cascade-support';
import { REFERENCE_BRIDGE_EAST_CAUSEWAY, REFERENCE_GROVE_POOL, REFERENCE_SHORE_APPROACH, REFERENCE_SPRING_BRANCH, REFERENCE_SPRING_SHRINE, REFERENCE_STAIR_FLIGHTS, REFERENCE_STAIR_LANDING, REFERENCE_STAIR_GROUND_CLEARANCE, REFERENCE_TERRACE_CONTOURS, referenceFlightFloor } from './landform-layout';
import { createReferenceLandformProfile } from './landform-profile';
import { createReferenceLeftBankProfile, REFERENCE_LEFT_BANK_DOMAIN } from './left-bank-profile';
import { refineReferenceLeftBankGeometry, refineReferenceGroveBankGeometry, REFERENCE_LEFT_BANK_MESH_GUARD } from './left-bank-geometry';
import { applyReferenceGroveBankMapping } from './grove-bank-mapping';
import type { ReferenceGroveBankTarget } from './grove-bank-target';
import { referenceGroveBankFactorySupports, referenceGroveBankReady, type ReferenceGroveBankFactoryCapability } from './grove-bank-integration';
import { createReferenceSpringCarrier } from './spring-carrier';
import type { ReferenceNatureOptions } from './nature';
import type { ReferenceCameraId, ReferenceCollider, ReferenceGroveBankPatch, ReferenceLayer, ReferenceLayerOptions, ReferenceRenderFrame, ReferenceVec3, ReferenceWaterLayer, ReferenceWaterLayerOptions } from './contracts';

export interface ReferenceNatureFactory extends ReferenceGroveBankFactoryCapability {
  (options: ReferenceNatureOptions & { readonly groveBankPatch?: ReferenceGroveBankPatch }): Promise<ReferenceLayer>;
}

export interface ReferenceFactories {
  architecture(options: ReferenceLayerOptions): Promise<ReferenceLayer>;
  nature: ReferenceNatureFactory;
  water(options: ReferenceWaterLayerOptions): Promise<ReferenceWaterLayer>;
}
export interface ReferenceCompositionOptions {
  /** Explicit candidate request only. Default remains the old pair. D changes
   * ground/instance callbacks only after a same-version detached C is ready.
   */
  readonly groveBankTarget?: ReferenceGroveBankTarget;
}
export interface ReferenceComposition extends WorldEnvironment {
  beforeRender(frame: ReferenceRenderFrame): void;
  resize(width: number, height: number): void;
  whenReady(): Promise<void>;
  readonly fov: number;
}
const smooth = (a: number, b: number, x: number) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const distanceToSegment = (x: number, z: number, a: ReferenceVec3, b: ReferenceVec3) => {
  const dx = b[0] - a[0], dz = b[2] - a[2], length = dx * dx + dz * dz;
  const t = length ? THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[2]) * dz) / length, 0, 1) : 0;
  return { distance: Math.hypot(x - a[0] - dx * t, z - a[2] - dz * t), y: THREE.MathUtils.lerp(a[1], b[1], t) };
};
function pathSample(x: number, z: number) {
  let best = { distance: Infinity, y: 0, width: 0, margin: Infinity };
  let weight = 0, weightedY = 0;
  for (const path of REFERENCE_LAYOUT.paths) for (let i = 1; i < path.points.length; i++) {
    const sample = distanceToSegment(x, z, path.points[i - 1], path.points[i]);
    const margin = Math.min(best.margin, sample.distance - path.width / 2);
    if (sample.distance < best.distance) best = { ...sample, width: path.width, margin };
    else best.margin = margin;
    const influence = (1 - smooth(path.width / 2 - .15, path.width / 2 + .6, sample.distance)) ** 2;
    weightedY += sample.y * influence; weight += influence;
  }
  if (weight > 0) best.y = weightedY / weight;
  return best;
}
function inPolygon(x: number, z: number, points: readonly ReferenceVec3[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[2] > z) !== (b[2] > z) && x < (b[0] - a[0]) * (z - a[2]) / (b[2] - a[2]) + a[0]) inside = !inside;
  }
  return inside;
}
const sea = REFERENCE_LAYOUT.water.find(w => w.id === 'water.sea')!;
const pool = REFERENCE_LAYOUT.water.find(w => w.id === 'water.pool')!;
const seaOutline = 'outline' in sea ? sea.outline : [];
const poolOutline = 'outline' in pool ? pool.outline : [];
const poolSurfaces = REFERENCE_LAYOUT.water.filter(w => w.kind === 'pool');
const landformProfile = createReferenceLandformProfile(REFERENCE_LAYOUT);
const leftBankProfile = createReferenceLeftBankProfile(REFERENCE_LAYOUT);
const bridgePlacement = REFERENCE_LAYOUT.architecture.find(p => p.id === 'grove.bridge')!;
const bridgePlacements = REFERENCE_LAYOUT.architecture.filter(p => p.kind === 'bridge');
const stairLandingOutline: readonly ReferenceVec3[] = REFERENCE_STAIR_LANDING.outlineXZ.map(([x, z]) => [x, REFERENCE_STAIR_LANDING.level, z] as const);
function localPoint(x: number, z: number, p: { readonly position: ReferenceVec3; readonly yaw: number }) {
  const dx = x - p.position[0], dz = z - p.position[2], c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}
function bridgeLocal(x: number, z: number, placement: { readonly position: ReferenceVec3; readonly yaw: number } = bridgePlacement) { return localPoint(x, z, placement); }
function onBridge(x: number, z: number) { return bridgePlacements.some(placement => { const p = bridgeLocal(x, z, placement); return Math.abs(p.x) <= 3.6 && Math.abs(p.z) <= placement.size[2] / 2; }); }
function stairFloor(x: number, z: number): number | undefined {
  if (inPolygon(x, z, stairLandingOutline)) return REFERENCE_STAIR_LANDING.level;
  let floor: number | undefined;
  for (const flight of REFERENCE_STAIR_FLIGHTS) {
    const y = referenceFlightFloor(flight, x, z);
    if (y !== undefined) floor = floor === undefined ? y : Math.max(floor, y);
  }
  return floor;
}
const springBranchPoints: readonly ReferenceVec3[] = [...REFERENCE_SPRING_BRANCH.sameStepLocalSideExit, ...REFERENCE_SPRING_BRANCH.remaining];
const springBodyRadius = REFERENCE_STAIR_LANDING.minimumBodyRadius;
const springGuardRadius = REFERENCE_SPRING_BRANCH.width / 2 + springBodyRadius + .6;
const springFrame = { position: REFERENCE_SPRING_SHRINE.frame.origin, yaw: REFERENCE_SPRING_SHRINE.frame.yaw };
const springRearEntryZ = -.08;
function springBranchSample(x: number, z: number) {
  let best = { distance: Infinity, y: 0 };
  for (let i = 1; i < springBranchPoints.length; i++) {
    const sample = distanceToSegment(x, z, springBranchPoints[i - 1], springBranchPoints[i]);
    if (sample.distance < best.distance) best = sample;
  }
  // The four navigation contacts stay authoritative. The last descent meets
  // the actual 18m rear deck at its entry plane, across the complete walkway,
  // rather than retaining a 5cm drop where the rear access rectangle begins.
  const start = springBranchPoints[springBranchPoints.length - 2], end = springBranchPoints[springBranchPoints.length - 1];
  const dx = end[0] - start[0], dz = end[2] - start[2], length = Math.hypot(dx, dz);
  const axialProgress = ((x - start[0]) * dx + (z - start[2]) * dz) / length;
  const startZ = localPoint(start[0], start[2], springFrame).z;
  const planeProgress = localPoint(x, z, springFrame).z - startZ;
  // The axial bound leaves the earlier level route level and joins the outer
  // turn continuously, including either side of the nearest-segment bisector.
  const t = THREE.MathUtils.clamp(Math.min(planeProgress, axialProgress) / (springRearEntryZ - startZ), 0, 1);
  best.y = THREE.MathUtils.lerp(start[1], REFERENCE_SPRING_SHRINE.frame.deckY, t);
  return best;
}
function inSpringRearAccess(x: number, z: number) {
  const local = localPoint(x, z, springFrame);
  return Math.abs(local.x) <= REFERENCE_SPRING_SHRINE.frame.width / 2 - springBodyRadius + 1e-8
    && local.z >= springRearEntryZ - 1e-8 && local.z <= REFERENCE_SPRING_SHRINE.access.rearClearLength - springBodyRadius + 1e-8;
}
/** A finite closed rejection band keeps ordinary flat-ground fallback outside
 * the declared centre corridor. This does not bypass live art colliders. */
function springCentreAccess(x: number, z: number): boolean | undefined {
  const branch = springBranchSample(x, z), local = localPoint(x, z, springFrame);
  const atShrine = Math.abs(local.x) <= REFERENCE_SPRING_SHRINE.frame.width / 2 + springBodyRadius + 1e-8
    && local.z >= springRearEntryZ - springBodyRadius - 1e-8 && local.z <= REFERENCE_SPRING_SHRINE.frame.length + springBodyRadius + 1e-8;
  if (branch.distance > springGuardRadius && !atShrine) return undefined;
  if (stairFloor(x, z) !== undefined) return true;
  return branch.distance <= REFERENCE_SPRING_BRANCH.centerHalfWidth + 1e-8 || inSpringRearAccess(x, z);
}
function edgeDistance(x: number, z: number, outline: readonly ReferenceVec3[]) {
  let best = Infinity;
  for (let i = 0; i < outline.length; i++) best = Math.min(best, distanceToSegment(x, z, outline[i], outline[(i + 1) % outline.length]).distance);
  return best;
}

/** Analytic physical bed and path floors are independent of visual quality and texture LOD. */
function terrainHeight(x: number, z: number, leftBankMargin: number | undefined): number {
  const sample = pathSample(x, z);
  let y = landformProfile.height(x, z);
  if (leftBankMargin !== undefined) y = leftBankProfile.apply(x, z, y, leftBankMargin);
  // The coastal frame tree retains a real low projecting root island.
  const oliveIslet = Math.hypot((x - 3) / 4.8, (z - 35) / 5.6);
  if (oliveIslet < 1.4) y = THREE.MathUtils.lerp(y, 1.45, 1 - smooth(.75, 1.4, oliveIslet));
  // Frozen r4 main-cascade exposure: never lift soil into the proven water lane.
  const cascadeCut = smooth(19, 25, x) * (1 - smooth(45, 51, x))
    * smooth(-24, -18, z) * (1 - smooth(-5, 1, z));
  y = THREE.MathUtils.lerp(y, Math.min(y, -.6), cascadeCut);
  for (const placement of bridgePlacements) {
    const p = bridgeLocal(x, z, placement);
    if (Math.abs(p.x) < 3.2 && Math.abs(p.z) < 2.2) return placement.id === 'grove.bridge' ? 11 + Math.sin(x * .6) * .06 : REFERENCE_SHORE_APPROACH.channelBedY;
  }
  // C owns the visible bearing at footFloor-.14. Soil is another 8cm below it.
  const stairs = stairFloor(x, z);
  if (stairs !== undefined) return stairs - REFERENCE_STAIR_GROUND_CLEARANCE - .08;
  // The revised pool has an actual dry bank notch at the bridge east end.
  // The broad profile carries the slope; this last narrow cap seats the stones.
  const inPool = poolSurfaces.some(surface => inPolygon(x, z, surface.outline));
  if (!inPool && sample.margin < .55) y = THREE.MathUtils.lerp(sample.y - .14, y, smooth(-.1, .55, sample.margin));
  return y;
}
export function referenceTerrainHeight(x: number, z: number): number { return terrainHeight(x, z, REFERENCE_LEFT_BANK_MESH_GUARD); }
function walkHeight(x: number, z: number, physicalTerrainHeight: (x: number, z: number) => number): number {
  const sample = pathSample(x, z);
  // A's bridge spans local X, including the east half outside the old paths.
  // The model is translated down 2m and has a .4m rise from end to crown.
  for (const placement of bridgePlacements) {
    const p = bridgeLocal(x, z, placement), bx = Math.abs(p.x), bz = Math.abs(p.z), halfWidth = placement.size[2] / 2;
    if (bx <= 3.6 && bz <= halfWidth) return placement.position[1] - .4 * Math.pow(bx / 3.6, 1.8);
    if (bx <= 4.5 && bz <= halfWidth && sample.distance <= sample.width / 2 + .25) {
      return THREE.MathUtils.lerp(placement.position[1] - .4, sample.y, smooth(3.6, 4.5, bx));
    }
  }
  const stairs = stairFloor(x, z); if (stairs !== undefined) return stairs;
  if (inSpringRearAccess(x, z)) return REFERENCE_SPRING_SHRINE.frame.deckY;
  const spring = springBranchSample(x, z);
  if (spring.distance <= REFERENCE_SPRING_BRANCH.width / 2) return spring.y;
  if (Math.abs(x - 15) < 10 && z < -28 && z > -52) return 22;
  if (sample.margin <= .1) return sample.y;
  if (sample.margin < .65) return THREE.MathUtils.lerp(sample.y, physicalTerrainHeight(x, z), smooth(.1, .65, sample.margin));
  return physicalTerrainHeight(x, z);
}
export function referenceWalkHeight(x: number, z: number): number { return walkHeight(x, z, referenceTerrainHeight); }

/** D assembles only. A/C/B factories are injected, keeping ownership and prototype iteration separate. */
export async function createReferenceComposition(quality: GreekWorldQuality, renderer: THREE.WebGLRenderer, factories: ReferenceFactories, externalSignal?: AbortSignal, view: ReferenceCameraId = 'coast', options: ReferenceCompositionOptions = {}): Promise<ReferenceComposition> {
  const lifetime = new AbortController(), signal = lifetime.signal;
  const scene = new THREE.Scene(); scene.name = 'Reference v3 / continuous coastal sanctuary';
  scene.userData.landformContacts = landformProfile.contacts;
  const layers: ReferenceLayer[] = [];
  let architectureLayer: ReferenceLayer | undefined, natureLayer: ReferenceLayer | undefined;
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>(), bitmaps = new Set<ImageBitmap>();
  let environment: THREE.WebGLRenderTarget | undefined, pmrem: THREE.PMREMGenerator | undefined;
  let clues: ReturnType<typeof createPainterlyTextures> | undefined, water: ReferenceWaterLayer | undefined;
  let disposed = false, solved = false, gateAmount = 0, currentQuality = quality;
  const requestedGroveBank = options.groveBankTarget;
  let activeGroveBank: ReferenceGroveBankTarget | undefined;
  const sceneTerrainHeight = (x: number, z: number) => activeGroveBank?.sampleTerrain(x, z).terrainY ?? referenceTerrainHeight(x, z);
  const sceneWalkHeight = (x: number, z: number) => walkHeight(x, z, sceneTerrainHeight);
  let jointGeneration = 0;
  let jointPendingQuality: GreekWorldQuality | undefined;
  const pendingNature = new Set<ReferenceLayer>();
  const natureControllers = new Set<AbortController>();
  const natureLifetimes = new WeakMap<ReferenceLayer, { controller: AbortController; stop: () => void }>();
  function groveBankStatus(state: string, reason?: string) {
    scene.userData.groveBankIntegration = { state, reason, requested: requestedGroveBank?.patch.shapeRevision ?? null,
      active: activeGroveBank?.patch.shapeRevision ?? null, productDefault: requestedGroveBank === undefined };
  }
  groveBankStatus(requestedGroveBank ? 'requested' : 'legacy-default');
  interface GroundAssets { quality: GreekWorldQuality; geometry: THREE.BufferGeometry; extraGeometries: Set<THREE.BufferGeometry>; textures: Set<THREE.Texture>; bitmaps: Set<ImageBitmap>; material?: THREE.MeshStandardMaterial; patchMaterial?: THREE.MeshStandardMaterial; mesh?: THREE.Mesh; route?: THREE.Group; support?: ReturnType<typeof createCascadeGroundSupport>; spring?: ReturnType<typeof createReferenceSpringCarrier>; supportModel?: THREE.Object3D; released: boolean }
  let ground: GroundAssets | undefined, groundQuality: GreekWorldQuality | undefined, groundGeneration = 0, groundController: AbortController | undefined;
  let groundPending: Promise<void> = Promise.resolve();
  const groundCandidates = new Set<GroundAssets>();
  const environmentWeights = new WeakMap<THREE.MeshStandardMaterial, number>();
  const environmentIntensity = .2;
  function syncArchitectureSurfaces() {
    const fallback = ground?.route?.getObjectByName('D / merged temporary stone treads');
    if (!fallback) return;
    const ready = REFERENCE_STAIR_FLIGHTS.every(flight => {
      const model = architectureLayer?.root.getObjectByName(flight.id);
      return model?.userData.authority === 'landform-layout.ts' && model.userData.revision === REFERENCE_LAYOUT_REVISION;
    }) && architectureLayer?.root.getObjectByName('sanctuary.steps.landing')?.userData.revision === REFERENCE_LAYOUT_REVISION;
    fallback.visible = !ready;
    const spout = architectureLayer?.anchors['grove.spring.spout'];
    const expected = REFERENCE_LAYOUT.water.find(w => w.id === 'water.sacred-spring')!.points[0];
    const springSpout = spout ? Math.hypot(spout[0] - expected[0], spout[1] - expected[1], spout[2] - expected[2]) < .002 ? 'matched' : 'mismatch' : 'unimplemented';
    if (springSpout === 'mismatch') throw new Error('A sacred spring outlet does not match the authoritative water source');
    if (architectureLayer?.root.getObjectByName('grove.spring') && !spout) throw new Error('A sacred spring model is missing grove.spring.spout');
    scene.userData.referenceDiagnostics = { ...scene.userData.referenceDiagnostics, authoredStairs: ready, springSpout };
  }
  function bridgeSafeWidth(id = 'grove.bridge') {
    // Consume A's actual published deck metadata after each committed LOD.
    // Its wrapper placement remains the bridge origin, while the child carries
    // the authoring footprint. Never let an obsolete path width extend the deck.
    let safe = .8;
    architectureLayer?.root.getObjectByName(id)?.traverse(object => {
      const footprint = object.userData.footprint;
      if (Number.isFinite(footprint?.centralWalkHalfWidth)) safe = footprint.centralWalkHalfWidth;
      else if (Number.isFinite(footprint?.halfWidth)) safe = Math.max(.3, footprint.halfWidth - .28);
    });
    return safe;
  }
  function syncGroundSupport(target: GroundAssets | undefined = ground) {
    if (!target?.material || target.released || !natureLayer) return;
    const model = natureLayer.root.getObjectByName('cliff.cascade');
    if (!model || target.supportModel === model) return;
    const candidate = createCascadeGroundSupport(model, referenceTerrainHeight, target.material);
    let spring: ReturnType<typeof createReferenceSpringCarrier> | undefined;
    try {
      spring = createReferenceSpringCarrier(REFERENCE_LAYOUT, model, referenceTerrainHeight, target.material);
      scene.add(candidate.root, spring.root);
    } catch (error) {
      candidate.geometries.forEach(g => g.dispose()); candidate.root.removeFromParent();
      spring?.geometries.forEach(g => g.dispose()); spring?.root.removeFromParent();
      throw error;
    }
    const old = target.support, oldSpring = target.spring;
    target.support = candidate; target.spring = spring; target.supportModel = model;
    for (const next of [candidate, spring]) next.geometries.forEach(g => { geometries.add(g); target!.extraGeometries.add(g); });
    for (const previous of [old, oldSpring]) {
      previous?.root.removeFromParent(); previous?.geometries.forEach(g => { g.dispose(); geometries.delete(g); target!.extraGeometries.delete(g); });
    }
    scene.userData.referenceDiagnostics = {
      ...scene.userData.referenceDiagnostics,
      layoutRevision: REFERENCE_LAYOUT_REVISION,
      cascadeRegistration: natureLayer.root.userData.cascadeRegistration?.layoutWaterMatches === true ? 'matched' : 'unverified',
      cascadeSupport: candidate.details.status,
      springCarrier: spring.details.status,
      visibleLandforms: natureLayer.root.userData.landformRegistration ? 'created' : 'not-provided',
      bridgeSafeHalfWidth: bridgeSafeWidth(),
    };
  }
  function calibrateEnvironment() {
    // A/C borrow the PMREM explicitly. Three ignores scene.environmentIntensity
    // for those materials, so apply the same scene weight without compounding.
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial) || material.envMap !== environment?.texture) continue;
        if (!environmentWeights.has(material)) environmentWeights.set(material, material.envMapIntensity);
        material.envMapIntensity = environmentWeights.get(material)! * environmentIntensity;
      }
    });
  }
  function releaseGround(assets: GroundAssets) {
    if (assets.released) return; assets.released = true;
    assets.mesh?.removeFromParent(); assets.geometry.dispose(); geometries.delete(assets.geometry);
    assets.route?.removeFromParent(); assets.extraGeometries.forEach(g => { g.dispose(); geometries.delete(g); }); assets.extraGeometries.clear();
    assets.support?.root.removeFromParent(); assets.spring?.root.removeFromParent();
    if (assets.patchMaterial) { assets.patchMaterial.dispose(); materials.delete(assets.patchMaterial); }
    if (assets.material) { assets.material.dispose(); materials.delete(assets.material); }
    assets.textures.forEach(t => { t.dispose(); textures.delete(t); });
    assets.bitmaps.forEach(b => { b.close(); bitmaps.delete(b); });
    groundCandidates.delete(assets);
  }
  const keepGeometry = <T extends THREE.BufferGeometry>(g: T) => { geometries.add(g); return g; };
  const keepMaterial = <T extends THREE.Material>(m: T) => { materials.add(m); return m; };
  const check = () => { if (disposed || signal.aborted) throw new DOMException('Reference creation cancelled', 'AbortError'); };
  const dispose = () => {
    if (disposed) return; disposed = true; lifetime.abort(); externalSignal?.removeEventListener('abort', dispose);
    jointGeneration++; natureControllers.forEach(controller => controller.abort()); natureControllers.clear();
    pendingNature.forEach(layer => layer.dispose()); pendingNature.clear();
    groundController?.abort(); groundGeneration++; groundCandidates.forEach(releaseGround);
    layers.forEach(layer => layer.dispose()); layers.length = 0;
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); bitmaps.forEach(b => b.close());
    clues?.dispose(); environment?.dispose(); pmrem?.dispose(); sun.shadow.dispose(); scene.clear();
    geometries.clear(); materials.clear(); textures.clear(); bitmaps.clear();
  };
  const sun = new THREE.DirectionalLight('#fff0d8', 3.3);
  externalSignal?.addEventListener('abort', dispose, { once: true });
  try {
    if (externalSignal?.aborted) dispose(); check();
    const sky = new Sky(); keepGeometry(sky.geometry); keepMaterial(sky.material); sky.scale.setScalar(450);
    // Keep the sky's visible radiance independently calibrated from the light
    // sampled by PMREM; changing final world exposure would also dim every asset.
    sky.material.uniforms.referenceSkyExposure = { value: 1 };
    sky.material.fragmentShader = sky.material.fragmentShader.replace('uniform float showSunDisc;', 'uniform float showSunDisc;\nuniform float referenceSkyExposure;')
      .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * referenceSkyExposure, 1.0 );');
    const sunDirection = new THREE.Vector3(-.68, .48, .40).normalize();
    Object.assign(sky.material.uniforms.turbidity, { value: 1.8 }); sky.material.uniforms.rayleigh.value = 2.5;
    sky.material.uniforms.mieCoefficient.value = .002; sky.material.uniforms.mieDirectionalG.value = .8; sky.material.uniforms.sunPosition.value.copy(sunDirection);
    sky.material.uniforms.cloudCoverage.value = .12;
    sky.material.uniforms.showSunDisc.value = false;
    const skyScene = new THREE.Scene(); skyScene.add(sky);
    pmrem = new THREE.PMREMGenerator(renderer);
    // One fixed 128-face IBL budget across tiers; quality changes never retain a
    // larger high-tier atlas or invalidate the texture borrowed by A/C/B.
    environment = pmrem.fromScene(skyScene, .04, .1, 1000, { size: 128 });
    pmrem.dispose(); pmrem = undefined;
    sky.material.uniforms.showSunDisc.value = true;
    sky.material.uniforms.referenceSkyExposure.value = .32;
    skyScene.remove(sky); scene.add(sky); scene.environment = environment.texture; scene.environmentIntensity = environmentIntensity;
    scene.fog = new THREE.Fog('#a9c9de', 170, 480);
    scene.add(new THREE.HemisphereLight('#c5e0f3', '#554f3b', .45));
    sun.position.copy(sunDirection).multiplyScalar(100).add(new THREE.Vector3(15, 14, -20)); sun.target.position.set(15, 14, -20); scene.add(sun, sun.target);
    sun.castShadow = quality !== 'low'; sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 100, bottom: -80, near: 1, far: 220 });
    sun.shadow.normalBias = .11; sun.shadow.bias = -.00025;

    async function groundTexture(assets: GroundAssets, name: string, color: boolean, next: GreekWorldQuality, ticket: number, loadSignal: AbortSignal) {
      const tier = next === 'low' ? 'low' : 'high';
      const response = await fetch(`${import.meta.env.BASE_URL}world3d/reference/nature/${tier}/${name}`, { signal: loadSignal });
      if (!response.ok) throw new Error(`Ground PBR texture ${name}: ${response.status}`);
      const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      if (disposed || signal.aborted || loadSignal.aborted || ticket !== groundGeneration || assets.released) { bitmap.close(); throw new DOMException('Ground load superseded', 'AbortError'); }
      bitmaps.add(bitmap); assets.bitmaps.add(bitmap);
      const texture = new THREE.Texture(bitmap); textures.add(texture); assets.textures.add(texture); texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = next === 'low' ? 2 : 4; texture.needsUpdate = true;
      return texture;
    }
    async function rebuildGround(next: GreekWorldQuality, mayCommit: () => boolean = () => true, commitPair?: () => (() => void)) {
    const ticket = ++groundGeneration; groundController?.abort(); const controller = groundController = new AbortController();
    const terrain = keepGeometry(new THREE.PlaneGeometry(190, 175, next === 'low' ? 110 : 190, next === 'low' ? 110 : 175)); terrain.rotateX(-Math.PI / 2); terrain.translate(-25, 0, -25);
    const candidate: GroundAssets = { quality: next, geometry: terrain, extraGeometries: new Set(), textures: new Set(), bitmaps: new Set(), released: false }; groundCandidates.add(candidate);
    let committed = false;
    try {
    const loads = await Promise.allSettled([groundTexture(candidate, 'limestone-color.webp', true, next, ticket, controller.signal), groundTexture(candidate, 'limestone-normal.webp', false, next, ticket, controller.signal), groundTexture(candidate, 'limestone-roughness.webp', false, next, ticket, controller.signal)]);
    const failed = loads.find(load => load.status === 'rejected'); if (failed?.status === 'rejected') throw failed.reason;
    check(); if (ticket !== groundGeneration) throw new DOMException('Ground load superseded', 'AbortError');
    const [colorMap, normalMap, roughnessMap] = loads.map(load => (load as PromiseFulfilledResult<THREE.Texture>).value);
    const groundMat = candidate.material = keepMaterial(new THREE.MeshStandardMaterial({ name: 'D / physical limestone soil', map: colorMap, normalMap, roughnessMap, normalScale: new THREE.Vector2(.35, .35), roughness: 1, vertexColors: true }));
    let terrainMaterial = groundMat;
    const positions = terrain.getAttribute('position'), colors: number[] = [], uv: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i), y = terrainHeight(x, z, undefined); positions.setY(i, y);
      const sample = pathSample(x, z), moss = smooth(2, 7, sample.distance) * smooth(18, -18, z);
      const color = new THREE.Color('#dad1af').lerp(new THREE.Color('#7c8552'), moss * (.42 + Math.sin(x * .16 + z * .10) * .15));
      color.multiplyScalar(.96 + Math.sin(x * .32 - z * .19) * .035); colors.push(color.r, color.g, color.b); uv.push(x / 3, z / 3);
    }
    terrain.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); terrain.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); terrain.computeVertexNormals();
    // Preserve the old coarse triangle surface under every frozen contact.
    // Fine vertices add only an inset analytic delta to that original plane.
    refineReferenceLeftBankGeometry(terrain, REFERENCE_LEFT_BANK_DOMAIN,
      (x, z) => terrainHeight(x, z, REFERENCE_LEFT_BANK_MESH_GUARD) - terrainHeight(x, z, undefined));
    if (activeGroveBank) {
      const target = activeGroveBank;
      refineReferenceGroveBankGeometry(terrain, target.domain, (x, z, originalSurfaceY) => {
        const sample = target.sampleTerrain(x, z);
        // The old indexed triangle is the physical baseline. Fade its small
        // analytic-vs-mesh bias to zero with the D support weight: protected
        // nodes stay exact, full-weight cores hit the final plane, and tiny
        // partial weights cannot jump directly onto the analytic old field.
        return sample.weight === 0 ? originalSurfaceY : sample.terrainY
          + (1 - sample.weight) * (originalSurfaceY - target.patch.baselineTerrainHeight(x, z));
      });
      const mappedMaterial = candidate.patchMaterial = keepMaterial(groundMat.clone());
      mappedMaterial.name = 'D / local grove-bank side mapping';
      applyReferenceGroveBankMapping(terrain, mappedMaterial, target.domain, (x, z) => target.sampleTerrain(x, z).weight);
      terrainMaterial = mappedMaterial;
      terrain.userData.groveBankPatch = { revision: target.patch.revision, shapeRevision: target.patch.shapeRevision,
        baselineRevision: target.patch.baselineRevision };
    }
    const groundMesh = candidate.mesh = new THREE.Mesh(terrain, terrainMaterial); groundMesh.receiveShadow = true; groundMesh.name = 'D / continuous terrain and actual seabed'; scene.add(groundMesh);
    const route = createReferenceRouteSurfaces(REFERENCE_LAYOUT, groundMat, sceneWalkHeight, next);
    candidate.route = route.root; route.geometries.forEach(g => { geometries.add(g); candidate.extraGeometries.add(g); }); scene.add(route.root);
    // Build the full bearing bundle while the previous ground/maps still live.
    // Failed carrier construction leaves the previous ground/maps intact; C owns its own atomic visible-landform rebuild.
    syncGroundSupport(candidate);
    if (!mayCommit()) throw new DOMException('Joint ground candidate superseded', 'AbortError');
    const old = ground, oldQuality = groundQuality;
    ground = candidate; groundQuality = next;
    let rollbackPair: (() => void) | undefined;
    try { rollbackPair = commitPair?.(); syncArchitectureSurfaces(); }
    catch (error) { rollbackPair?.(); ground = old; groundQuality = oldQuality; throw error; }
    // No await separates the D pointer exchange from the optional C exchange.
    // Release old D only after that synchronous paired commit has succeeded.
    committed = true; if (old) releaseGround(old);
    } catch (error) { controller.abort(); if (!committed) releaseGround(candidate); if (ticket === groundGeneration && !disposed) throw error; }
    }
    groundPending = rebuildGround(quality); await groundPending; check();

    const common: ReferenceLayerOptions = { layout: REFERENCE_LAYOUT, quality, signal, terrainHeight: referenceTerrainHeight, walkHeight: referenceWalkHeight,
      lighting: { environment: environment.texture, environmentKind: 'pmrem-cubeuv', sunDirection: sunDirection.toArray(), sunColor: '#fff0d8', skyTop: '#559bd5', skyHorizon: '#d9e4e4' } };
    async function attach<T extends ReferenceLayer>(pending: Promise<T>): Promise<T> { const layer = await pending; if (disposed || signal.aborted) { layer.dispose(); check(); } layers.push(layer); scene.add(layer.root); return layer; }
    architectureLayer = await attach(factories.architecture(common)); check(); syncArchitectureSurfaces();
    const natureOptions: ReferenceNatureOptions = { ...common,
      landforms: { sanctuaryFrontContours: REFERENCE_TERRACE_CONTOURS, flights: REFERENCE_STAIR_FLIGHTS, landing: REFERENCE_STAIR_LANDING,
        grovePool: REFERENCE_GROVE_POOL, bridgeEastCauseway: REFERENCE_BRIDGE_EAST_CAUSEWAY,
        springBranch: { points: springBranchPoints, bodyRadius: springBodyRadius, supportClearance: REFERENCE_STAIR_GROUND_CLEARANCE, centerHalfWidth: REFERENCE_SPRING_BRANCH.centerHalfWidth, additionalSupportClearance: REFERENCE_SPRING_BRANCH.additionalSupportClearance } },
    };
    function releaseNatureCandidate(layer: ReferenceLayer) {
      pendingNature.delete(layer);
      const owner = natureLifetimes.get(layer);
      if (owner) { owner.controller.abort(); natureControllers.delete(owner.controller); signal.removeEventListener('abort', owner.stop); }
      layer.dispose();
    }
    async function matchingNature(next: GreekWorldQuality, patch: ReferenceGroveBankPatch): Promise<ReferenceLayer> {
      const controller = new AbortController(), stop = () => controller.abort(); natureControllers.add(controller);
      signal.addEventListener('abort', stop, { once: true });
      let layer: ReferenceLayer | undefined;
      try {
        // Even an enabled candidate never sends its final D target to the
        // original C MVC/outerFoot/foundation constructor.
        layer = await factories.nature({ ...natureOptions, quality: next, signal: controller.signal,
          terrainHeight: patch.baselineTerrainHeight, groveBankPatch: patch });
        pendingNature.add(layer); natureLifetimes.set(layer, { controller, stop });
        await layer.whenReady(); check();
        if (controller.signal.aborted) throw new DOMException('Joint bank candidate superseded', 'AbortError');
        if (!referenceGroveBankReady(layer.root, patch)) throw new Error('C grove bank is missing the matching patch ready acknowledgement');
        return layer;
      } catch (error) {
        if (layer) releaseNatureCandidate(layer);
        else { controller.abort(); natureControllers.delete(controller); signal.removeEventListener('abort', stop); }
        throw error;
      }
    }
    const matchingBaseline = requestedGroveBank?.patch.baselineTerrainHeight === referenceTerrainHeight;
    if (requestedGroveBank && matchingBaseline && referenceGroveBankFactorySupports(factories.nature, requestedGroveBank.patch)) {
      let candidate: ReferenceLayer | undefined;
      try {
        candidate = await matchingNature(quality, requestedGroveBank.patch);
        activeGroveBank = requestedGroveBank;
        groundPending = rebuildGround(quality); await groundPending; check();
        natureLayer = await attach(Promise.resolve(candidate)); pendingNature.delete(candidate);
        groveBankStatus('active-matched');
      } catch (error) {
        if (candidate && natureLayer !== candidate) releaseNatureCandidate(candidate);
        activeGroveBank = undefined; check();
        groundPending = Promise.resolve();
        groveBankStatus('legacy-fallback', error instanceof Error ? error.message : String(error));
      }
    } else if (requestedGroveBank) groveBankStatus('legacy-fallback', matchingBaseline
      ? 'C factory has no compatible groveBankPatch capability' : 'Patch baseline callback does not match this composition');
    if (!natureLayer) natureLayer = await attach(factories.nature(natureOptions));
    check();
    const cascade = natureLayer.root.getObjectByName('cliff.cascade');
    if (cascade && cascade.userData.natureAsset?.kind !== 'limestone-scan-experiment') throw new Error('Layout r4 requires the C scanned cascade factory; old cliff cannot use the new water anchors');
    syncGroundSupport();
    water = await attach(factories.water({ ...common, renderContext: { renderer, scene } })); check();
    calibrateEnvironment();

    function shadowQuality(next: GreekWorldQuality) {
      sun.castShadow = next !== 'low'; sun.shadow.mapSize.set(next === 'high' ? 2048 : 1024, next === 'high' ? 2048 : 1024);
      sun.shadow.dispose(); sun.shadow.map = null; sun.shadow.mapPass = null; sun.shadow.needsUpdate = true;
    }
    async function rebuildMatchedQuality(next: GreekWorldQuality, generation: number) {
      const target = activeGroveBank!;
      let candidate: ReferenceLayer | undefined, previous: ReferenceLayer | undefined;
      let pairCommitted = false;
      try {
        candidate = await matchingNature(next, target.patch);
        if (generation !== jointGeneration) throw new DOMException('Joint nature candidate superseded', 'AbortError');
        // C is prepared first. D and C pointers exchange in the SAME sync
        // commit hook, not in separate continuations around an await.
        await rebuildGround(next, () => generation === jointGeneration, () => {
          previous = natureLayer!;
          const ordinal = layers.indexOf(previous), nextNature = candidate!, oldQuality = currentQuality;
          try {
            scene.add(nextNature.root); layers[ordinal] = nextNature; natureLayer = nextNature;
            previous.root.removeFromParent();
          } catch (error) {
            layers[ordinal] = previous; natureLayer = previous;
            nextNature.root.removeFromParent(); scene.add(previous.root); throw error;
          }
          pendingNature.delete(nextNature); currentQuality = next; jointPendingQuality = undefined; pairCommitted = true;
          return () => {
            layers[ordinal] = previous!; natureLayer = previous;
            nextNature.root.removeFromParent(); scene.add(previous!.root);
            currentQuality = oldQuality; jointPendingQuality = next; pairCommitted = false; pendingNature.add(nextNature);
          };
        });
      } catch (error) {
        if (candidate && !pairCommitted) releaseNatureCandidate(candidate);
        if (pairCommitted && previous) releaseNatureCandidate(previous);
        if (generation === jointGeneration && !disposed) {
          jointPendingQuality = undefined;
          groveBankStatus(pairCommitted ? 'active-matched-postcommit-error' : 'active-kept-previous-pair', error instanceof Error ? error.message : String(error));
        }
        throw error;
      }
      // A newer queued request may now exist; that does not undo this already
      // matched pair or dispose its new C. Retire only the detached previous C.
      if (previous) releaseNatureCandidate(previous);
      if (generation === jointGeneration && !disposed) {
        for (const layer of layers) if (layer !== candidate) layer.setQuality(next);
        shadowQuality(next); syncGroundSupport(); calibrateEnvironment(); groveBankStatus('active-matched');
      }
    }

    // Gameplay visuals are owned here; imported art never evaluates puzzle state or persists.
    const bronze = keepMaterial(new THREE.MeshStandardMaterial({ color: '#857451', metalness: .75, roughness: .42 }));
    const dark = keepMaterial(new THREE.MeshStandardMaterial({ color: '#283b36', metalness: .12, roughness: .76 }));
    const gateRoot = new THREE.Group(); gateRoot.position.fromArray(REFERENCE_LAYOUT.gate.position); scene.add(gateRoot);
    const gateLeaves: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.x = side * 1.6; gateRoot.add(hinge); gateLeaves.push(hinge);
      const leaf = new THREE.Mesh(keepGeometry(new THREE.BoxGeometry(1.6, 5.8, .16)), dark); leaf.position.set(-side * .8, 2.9, 0); leaf.castShadow = leaf.receiveShadow = true; hinge.add(leaf);
      for (const x of [-1.45, -.15]) { const trim = new THREE.Mesh(keepGeometry(new THREE.BoxGeometry(.055, 5.3, .035)), bronze); trim.position.set(-side * Math.abs(x), 2.9, .10); hinge.add(trim); }
    }
    const pointers: THREE.Group[] = [];
    for (const anchor of REFERENCE_LAYOUT.valves) {
      const pointer = new THREE.Group(); pointer.position.set(anchor.position[0], anchor.position[1] + 1.04, anchor.position[2]); scene.add(pointer); pointers.push(pointer);
      const disk = new THREE.Mesh(keepGeometry(new THREE.CylinderGeometry(.43, .43, .055, 40)), bronze); pointer.add(disk);
      const arrow = new THREE.Mesh(keepGeometry(new THREE.ConeGeometry(.075, .25, 3)), dark); arrow.rotation.x = -Math.PI / 2; arrow.position.set(0, .045, -.24); pointer.add(arrow);
    }
    clues = createPainterlyTextures();
    for (const [id, map, width, height, offsetY, offsetZ] of [['shore.mural', clues.mural, 2.8, 1.9, 1.45, .38], ['grove.oath', clues.inscription, .86, 1.1, .85, .2]] as const) {
      const p = REFERENCE_LAYOUT.architecture.find(p => p.id === id)!;
      const plaque = new THREE.Mesh(keepGeometry(new THREE.PlaneGeometry(width, height)), keepMaterial(new THREE.MeshStandardMaterial({ map, roughness: .92 })));
      plaque.rotation.y = p.yaw; plaque.position.set(p.position[0] + Math.sin(p.yaw) * offsetZ, p.position[1] + offsetY, p.position[2] + Math.cos(p.yaw) * offsetZ); scene.add(plaque);
    }
    const lightMarker = new THREE.Mesh(keepGeometry(new THREE.TorusGeometry(.4, .025, 8, 64)), bronze); lightMarker.rotation.x = -.35; lightMarker.position.set(16, 2.8, 29); scene.add(lightMarker);
    const interior = new THREE.PointLight('#ffbd67', 8, 12, 2); interior.position.set(15, 25, -38); scene.add(interior);
    const camera = REFERENCE_LAYOUT.cameras.find(c => c.id === view)!;
    return {
      scene, fov: camera.fov, spawn: { x: camera.position[0], z: camera.position[2], yaw: camera.yaw, pitch: camera.pitch }, groundHeight: sceneWalkHeight,
      canWalk(x, z, springRestored) {
        if (x < -100 || x > 62 || z < -88 || z > 56) return false;
        if (!springRestored && x > 5.8 && x < 24.2 && z < -27.3 && z > -52.2) return false;
        const floor = sceneWalkHeight(x, z), path = pathSample(x, z);
        for (const placement of bridgePlacements) {
          const bridge = bridgeLocal(x, z, placement);
          if (Math.abs(bridge.x) < 3.6 && Math.abs(bridge.z) < 2.2 && Math.abs(bridge.z) > bridgeSafeWidth(placement.id)) return false;
        }
        const springAccess = springCentreAccess(x, z);
        if (springAccess === false) return false;
        const onPath = onBridge(x, z) || stairFloor(x, z) !== undefined || springAccess === true || path.margin < -.2;
        if (!onPath && (floor < .25 || poolSurfaces.some(surface => inPolygon(x, z, surface.outline)) || inPolygon(x, z, seaOutline))) return false;
        if (!onPath && Math.hypot(sceneTerrainHeight(x + .25, z) - sceneTerrainHeight(x - .25, z), sceneTerrainHeight(x, z + .25) - sceneTerrainHeight(x, z - .25)) > .6) return false;
        for (const layer of layers) for (const c of layer.colliders) {
          if (c.kind === 'circle') { if (Math.hypot(x - c.x, z - c.z) < c.radius + .28) return false; }
          else {
            if (floor + .12 >= c.position[1] + c.size[1] / 2 || floor + 1.65 <= c.position[1] - c.size[1] / 2) continue;
            const dx = x - c.position[0], dz = z - c.position[2], cx = Math.cos(c.yaw) * dx - Math.sin(c.yaw) * dz, cz = Math.sin(c.yaw) * dx + Math.cos(c.yaw) * dz;
            if (Math.abs(cx) < c.size[0] / 2 + .28 && Math.abs(cz) < c.size[2] / 2 + .28) return false;
          }
        }
        return true;
      },
      update(time, delta, position) { if (disposed) return; layers.forEach(layer => layer.update(time, position)); gateAmount += ((solved ? 1 : 0) - gateAmount) * Math.min(1, delta * 2.1); gateLeaves.forEach((leaf, i) => { leaf.rotation.y = (i ? -1 : 1) * gateAmount * 1.4; }); },
      setPuzzle(rotations, restored) { if (disposed) return; solved = restored; pointers.forEach((p, i) => { p.rotation.y = -rotations[i] * Math.PI / 2; }); water?.setPuzzleState({ rotations: [rotations[0], rotations[1], rotations[2]], springRestored: restored }); },
      setQuality(next) {
        if (disposed) return;
        if (activeGroveBank) {
          if (next === jointPendingQuality) return;
          if (next === currentQuality && next === groundQuality && jointPendingQuality === undefined) return;
          const generation = ++jointGeneration;
          groundController?.abort(); groundGeneration++;
          if (next === currentQuality && next === groundQuality) {
            jointPendingQuality = undefined; groundPending = Promise.resolve(); groveBankStatus('active-matched', 'Pending quality request cancelled'); return;
          }
          jointPendingQuality = next; groveBankStatus('active-pair-pending-quality');
          groundPending = rebuildMatchedQuality(next, generation); void groundPending.catch(() => {}); return;
        }
        if (next === currentQuality && next === groundQuality) return;
        currentQuality = next; groundPending = rebuildGround(next); void groundPending.catch(() => {});
        layers.forEach(layer => layer.setQuality(next)); shadowQuality(next);
      },
      beforeRender(frame) { if (!disposed) water?.beforeRender?.(frame); },
      resize(width, height) { if (!disposed) water?.resize?.(width, height); },
      async whenReady() {
        const ready = await Promise.allSettled([groundPending, ...layers.map(layer => layer.whenReady())]);
        check(); syncArchitectureSurfaces(); calibrateEnvironment(); syncGroundSupport();
        const failed = ready.find(result => result.status === 'rejected'); if (failed?.status === 'rejected') throw failed.reason;
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
