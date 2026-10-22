import * as THREE from 'three';
import type { GreekWorldQuality } from '../types';
import type { ReferenceWaterLayerOptions, ReferenceRenderFrame, ReferenceVec3, ReferenceWaterLayer, ReferenceWaterSurface } from './contracts';
import { createWaterfalls, type Waterfalls, type WaterfallSegment } from './water-falls';
import { createWaterSurface, type WaterSurface } from './water-surface';
import { createWaterStreams } from './water-streams';
import { createWetShore } from './water-shore';

/** Detached, world-space visual layer. Gameplay/persistence and render passes remain D-owned. */
export async function createReferenceWater(options: ReferenceWaterLayerOptions): Promise<ReferenceWaterLayer> {
  const { signal, layout, lighting, terrainHeight, quality: initialQuality } = options;
  if (signal.aborted) throw new DOMException('Water creation aborted', 'AbortError');
  const root = new THREE.Group(); root.name = 'reference-water';
  const sunDirection = new THREE.Vector3(...lighting.sunDirection).normalize();
  const surfaces: Array<{ source: ReferenceWaterSurface; effect: WaterSurface; level: number }> = [];
  const waterfalls: Array<{ effect: Waterfalls; controlled: boolean }> = [];
  const controlledImpacts: Array<{ strength: number; restoredStrength: number }> = [];
  const anchors: Record<string, ReferenceVec3> = {};
  const captureExclusions: THREE.Object3D[] = [];
  const captureFrustum = new THREE.Frustum(), captureViewProjection = new THREE.Matrix4();
  let quality: GreekWorldQuality = initialQuality, disposed = false, restored = false, time = 0;
  let streams: ReturnType<typeof createWaterStreams> | undefined;
  let shore: ReturnType<typeof createWetShore> | undefined;

  const dispose = () => {
    if (disposed) return; disposed = true; signal.removeEventListener('abort', dispose);
    root.removeFromParent(); surfaces.forEach(({ effect }) => effect.dispose()); waterfalls.forEach(({ effect }) => effect.dispose()); streams?.dispose(); shore?.dispose(); root.clear();
  };
  try {
    const waterSurfaces = layout.water.filter((w): w is ReferenceWaterSurface => w.kind === 'sea' || w.kind === 'pool');
    for (const source of waterSurfaces) {
      if (source.outline.length < 3) continue;
      const bounds = new THREE.Box3().setFromPoints(source.outline.map(p => new THREE.Vector3(...p)));
      const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
      const impacts = layout.water.filter(w => w.kind === 'waterfall').flatMap(source => source.tiers.map(tier => ({ tier, controlled: source.controlledBySpring })))
        .filter(({ tier }) => Math.abs(tier.bottom[1] - center.y) < .3)
        .map(({ tier, controlled }) => {
          const restoredStrength = Math.min(1, (tier.top[1] - tier.bottom[1]) / 5);
          return { position: new THREE.Vector3(...tier.bottom), radius: tier.width * .78,
            strength: controlled ? 0 : restoredStrength, restoredStrength, controlled };
        })
        .sort((a, b) => a.position.distanceToSquared(center) - b.position.distanceToSquared(center)).slice(0, 4);
      const effect = createWaterSurface({ quality, center, size: new THREE.Vector2(size.x, size.z), outline: source.outline.map(p => new THREE.Vector3(...p)),
        capture: source.kind === 'pool', sunDirection, depthAt: (x, z) => center.y - terrainHeight(x, z),
        analyticSkyVisibility: source.kind === 'pool' ? .3 : 1, impacts,
        excludeFromCapture: captureExclusions, maxDepth: source.kind === 'sea' ? 35 : 8,
        deepColor: source.kind === 'sea' ? '#073746' : '#0b4448', shallowColor: '#4c9c8d',
        skyZenith: lighting.skyTop, skyHorizon: lighting.skyHorizon,
        waveAmplitude: source.kind === 'sea' ? .055 : .028, absorption: new THREE.Vector3(.36, .092, .068), causticStrength: .32 });
      controlledImpacts.push(...impacts.filter(impact => impact.controlled));
      effect.group.name = source.id; root.add(effect.group); surfaces.push({ source, effect, level: center.y }); captureExclusions.push(effect.group);
      anchors[`${source.id}.center`] = center.toArray() as [number, number, number];
    }
    const fallSegments = new Map<boolean, WaterfallSegment[]>();
    for (const source of layout.water) if (source.kind === 'waterfall') {
      const seed = [...source.id].reduce((value, letter) => (value * 31 + letter.charCodeAt(0)) % 997, 11);
      const segments: WaterfallSegment[] = source.tiers.map((tier, index) => {
        const segment: WaterfallSegment = { top: new THREE.Vector3(...tier.top), bottom: new THREE.Vector3(...tier.bottom), width: tier.width, flow: source.controlledBySpring ? .6 : tier.width < 2 ? .55 : 1, seed: seed + index * 7, impactScale: index === source.tiers.length - 1 ? .85 : .62 };
        if (source.controlledBySpring) {
          const forward = new THREE.Vector3(tier.bottom[0] - tier.top[0], 0, tier.bottom[2] - tier.top[2]);
          if (forward.lengthSq() > 1e-8) {
            segment.forward = forward.normalize();
            segment.widthDirection = new THREE.Vector3(forward.z, 0, -forward.x);
          }
          // The small D-owned basin cannot contain the drifting impact families.
          // Keep this branch's falling water/drops and its pool-surface impact.
          if (source.id === 'water.sacred-source-drop') segment.foam = false;
        }
        return segment;
      });
      const batch = fallSegments.get(source.controlledBySpring) ?? []; batch.push(...segments); fallSegments.set(source.controlledBySpring, batch);
      source.tiers.forEach((tier, index) => { anchors[`${source.id}.tier${index}.impact`] = tier.bottom; });
    }
    for (const [controlled, segments] of fallSegments) {
      const effect = createWaterfalls({ quality, sunDirection, segments }); effect.group.name = controlled ? 'spring-controlled-waterfalls' : 'natural-waterfalls'; root.add(effect.group); waterfalls.push({ effect, controlled });
    }
    streams = createWaterStreams(layout.water.filter(w => w.kind === 'stream'), quality, sunDirection, {
      skyZenith: lighting.skyTop, skyHorizon: lighting.skyHorizon,
      poolOutline: waterSurfaces.find(source => source.id === 'water.pool')?.outline,
      seaOutline: waterSurfaces.find(source => source.kind === 'sea')?.outline,
    }); root.add(streams.group);
    // The outlet is another water surface, not scenery to refract through the
    // pool a second time. Keep its actual mineral bed in both captures.
    captureExclusions.push(...streams.captureExclusions);
    shore = createWetShore(waterSurfaces, terrainHeight); root.add(shore.group);
    root.userData.waterDiagnostics = { surfaces: surfaces.map(({ source, effect }) => ({ id: source.id, ...effect.diagnostics })), note: 'Use per-frame captures below, not a main-pass-only renderer.info reset.' };
    signal.addEventListener('abort', dispose, { once: true });
    if (signal.aborted) { dispose(); throw new DOMException('Water creation aborted', 'AbortError'); }
    const setPuzzleState: ReferenceWaterLayer['setPuzzleState'] = state => {
      if (disposed) return; restored = state.springRestored; streams?.setSpringRestored(restored);
      controlledImpacts.forEach(impact => { impact.strength = restored ? impact.restoredStrength : 0; });
      surfaces.forEach(({ source, effect }) => { effect.group.visible = !source.controlledBySpring || restored; });
      waterfalls.forEach(({ controlled, effect }) => { effect.group.visible = !controlled || restored; });
      surfaces.forEach(({ effect }) => effect.update(time, 0));
    };
    setPuzzleState({ rotations: [0, 0, 0], springRestored: false });
    return {
      root, colliders: [], anchors, whenReady: () => Promise.resolve(), setPuzzleState,
      resize(width, height) { if (!disposed) surfaces.forEach(({ effect }) => effect.resize(width, height)); },
      setQuality(next) { if (disposed || next === quality) return; quality = next; surfaces.forEach(({ effect }) => effect.setQuality(next)); waterfalls.forEach(({ effect }) => effect.setQuality(next)); },
      update(nextTime) { if (disposed) return; const delta = Math.max(0, Math.min(.1, nextTime - time)); time = nextTime; surfaces.forEach(({ effect }) => effect.update(time, delta)); waterfalls.forEach(({ effect }) => effect.update(time, delta)); streams?.update(time); },
      beforeRender(frame: ReferenceRenderFrame) {
        if (disposed) return;
        // Borrow only D's live soil inputs. D atomically replaces this owner on
        // quality changes; refresh before captures and clear if it disappears.
        let soilMaterial: THREE.MeshStandardMaterial | undefined;
        frame.scene.traverse(object => {
          if (soilMaterial || !(object instanceof THREE.Mesh)) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          soilMaterial = materials.find((material): material is THREE.MeshStandardMaterial =>
            material instanceof THREE.MeshStandardMaterial && material.name === 'D / physical limestone soil');
        });
        streams?.syncBedMaterial(soilMaterial);
        shore?.syncSoilMaterial(soilMaterial);
        captureFrustum.setFromProjectionMatrix(captureViewProjection.multiplyMatrices(frame.camera.projectionMatrix, frame.camera.matrixWorldInverse));
        const eyeHeight = frame.camera.matrixWorld.elements[13];
        // A higher pool viewed from below is back-facing and cannot capture.
        // Exclude it before roundrobin so it cannot waste the one-pass slot.
        const pools = surfaces.filter(({ source, effect, level }) => source.kind === 'pool' && effect.group.visible && eyeHeight > level + .015
          && effect.group.children.some(child => child instanceof THREE.Mesh && captureFrustum.intersectsObject(child)));
        const selected = pools.length ? pools[frame.frameNumber % pools.length].effect : undefined;
        const cachedFrame: ReferenceRenderFrame = { ...frame, offscreenBudget: { ...frame.offscreenBudget, maxPasses: 0 }, renderOffscreen: () => false };
        surfaces.forEach(({ effect }) => { effect.resize(frame.viewport.width, frame.viewport.height); effect.beforeRender(effect === selected ? frame : cachedFrame); });
        root.userData.waterDiagnostics = { surfaces: surfaces.map(({ source, effect }) => ({ id: source.id, ...effect.diagnostics })), falls: waterfalls.map(({ effect }) => ({ ...effect.stats })) };
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
