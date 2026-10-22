import * as THREE from 'three';
import { applyArchitectureOcclusion } from './architecture-occlusion';

export type ArchitectureMaterialQuality = 'low' | 'high';

export interface ArchitectureMaterials {
  marble: THREE.MeshStandardMaterial;
  limestone: THREE.MeshStandardMaterial;
  bridgeStone: THREE.MeshStandardMaterial;
  mortar: THREE.MeshStandardMaterial;
  blue: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  bronze: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  darkStone: THREE.MeshStandardMaterial;
  dispose(): void;
}

export interface ArchitectureMaterialOptions {
  quality: ArchitectureMaterialQuality;
  signal?: AbortSignal;
  baseUrl?: string;
}

interface SurfaceMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  aoMap: THREE.Texture;
  metalnessMap?: THREE.Texture;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Architecture material loading aborted.', 'AbortError');
}

/**
 * Loads the complete local PBR set before handing ownership to the caller.
 * Geometry supplies metre UVs divided by each material's metersPerTile metadata,
 * and neutral vertex colors. Texture repeat is deliberately left at one.
 * The signal cancels pending loading. After resolution, call dispose() to release
 * both GPU textures/materials and the CPU-side ImageBitmaps.
 */
export async function loadArchitectureMaterials({
  quality, signal, baseUrl = `${import.meta.env.BASE_URL}world3d/reference/architecture/`,
}: ArchitectureMaterialOptions): Promise<ArchitectureMaterials> {
  if (signal?.aborted) throw abortReason(signal);
  if (typeof createImageBitmap !== 'function') {
    throw new Error('Architecture materials require createImageBitmap support.');
  }

  const root = `${baseUrl.replace(/\/+$/, '')}/${quality}/`;
  const controller = new AbortController();
  const textures = new Set<THREE.Texture>();
  const bitmaps = new Set<ImageBitmap>();
  const materials = new Set<THREE.MeshStandardMaterial>();
  let disposed = false;
  let cancellationReason: unknown;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    // Also stops sibling fetches on a failed map. Bitmap decoding cannot be
    // aborted; each decoder below closes its own result if it finishes late.
    controller.abort(cancellationReason);
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    bitmaps.forEach(bitmap => bitmap.close());
    materials.clear();
    textures.clear();
    bitmaps.clear();
  };

  const ensureActive = (): void => {
    if (disposed) {
      throw cancellationReason ?? new DOMException('Architecture material loading stopped.', 'AbortError');
    }
  };

  const loadTexture = async (surface: string, suffix: string, color: boolean): Promise<THREE.Texture> => {
    const url = `${root}${surface}-${suffix}.png`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Architecture texture failed (${response.status}): ${url}`);
    }
    const blob = await response.blob();
    ensureActive();
    // ImageBitmap ignores Texture.flipY/premultiplyAlpha at GPU upload. Flip
    // here to match Three's standard bottom-up UV convention (OpenGL +Y normal
    // maps), then disable the texture flag so the orientation is explicit.
    // Keep decoded bytes unconverted: baseColor is tagged sRGB on the texture,
    // while normal/roughness/AO are linear data. No alpha premultiplication may
    // alter RGB values, including normal-vector and scalar-map components.
    const bitmap = await createImageBitmap(blob, {
      imageOrientation: 'flipY',
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    if (disposed) {
      bitmap.close();
      ensureActive();
    }
    bitmaps.add(bitmap);
    const texture = new THREE.Texture(bitmap);
    textures.add(texture);
    texture.name = `reference-architecture/${quality}/${surface}-${suffix}`;
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.flipY = false;
    texture.premultiplyAlpha = false;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = quality === 'high' ? 8 : 2;
    texture.needsUpdate = true;
    return texture;
  };

  const loadSurface = async (name: string, metal = false): Promise<SurfaceMaps> => {
    const [map, normalMap, roughnessMap, aoMap, metalnessMap] = await Promise.all([
      loadTexture(name, 'baseColor', true),
      loadTexture(name, 'normal', false),
      loadTexture(name, 'roughness', false),
      loadTexture(name, 'ao', false),
      ...(metal ? [loadTexture(name, 'metalness', false)] : []),
    ]);
    return { map, normalMap, roughnessMap, aoMap, ...(metalnessMap ? { metalnessMap } : {}) };
  };

  let rejectAbort!: (reason: unknown) => void;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const onAbort = (): void => {
    cancellationReason = abortReason(signal!);
    dispose();
    // Reject promptly even when all fetches have entered uncancellable decode.
    rejectAbort(cancellationReason);
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const [marbleMaps, limestoneMaps, bridgeMaps, blueMaps, roofMaps, goldMaps, bronzeMaps] = await Promise.race([
      Promise.all([
        loadSurface('marble'), loadSurface('limestone'), loadSurface('bridge-stone'),
        loadSurface('blue-painted-stone'), loadSurface('roof'), loadSurface('gold', true), loadSurface('bronze', true),
      ]),
      aborted,
    ]);
    ensureActive();

    const make = (parameters: THREE.MeshStandardMaterialParameters, metersPerTile: number): THREE.MeshStandardMaterial => {
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, ...parameters });
      applyArchitectureOcclusion(material);
      material.userData.metersPerTile = metersPerTile;
      material.userData.pbrRevision = 'adonis-architecture-pbr-v3-mineral';
      materials.add(material);
      return material;
    };
    const marble = make({
      name: 'Reference architecture / warm veined marble', ...marbleMaps,
      normalScale: new THREE.Vector2(.9, .9), roughness: 1, aoMapIntensity: .55,
    }, 4);
    const limestone = make({
      name: 'Reference architecture / pale warm limestone', ...limestoneMaps,
      normalScale: new THREE.Vector2(.85, .85), roughness: 1, aoMapIntensity: .65,
    }, 3);
    const bridgeStone = make({
      name: 'Reference architecture / cool grey bridge stone', ...bridgeMaps,
      normalScale: new THREE.Vector2(1, 1), roughness: 1, aoMapIntensity: .7,
    }, 3);
    const mortar = make({
      name: 'Reference architecture / recessed lime mortar', ...bridgeMaps,
      color: '#c8c9c5', normalScale: new THREE.Vector2(.3, .3),
      roughness: 1, aoMapIntensity: 0.45,
    }, 3);
    const blue = make({
      name: 'Reference architecture / worn blue painted stone', ...blueMaps,
      normalScale: new THREE.Vector2(.8, .8), roughness: 1, aoMapIntensity: .6,
    }, 2);
    // Independent metallic maps include nonmetal patina coverage. No stone map
    // is shared with metal; no directional illumination is baked into albedo.
    const gold = make({
      name: 'Reference architecture / aged gold trim', ...goldMaps,
      metalness: 1, roughness: 1, normalScale: new THREE.Vector2(.8, .8), aoMapIntensity: .3,
    }, 1);
    const bronze = make({
      name: 'Reference architecture / aged bronze trim', ...bronzeMaps,
      metalness: 1, roughness: 1, normalScale: new THREE.Vector2(.8, .8), aoMapIntensity: .3,
    }, 1);
    const roof = make({
      name: 'Reference architecture / fired terracotta roof', ...roofMaps,
      normalScale: new THREE.Vector2(.9, .9), roughness: 1, aoMapIntensity: .6,
    }, 2);
    const darkStone = make({
      name: 'Reference architecture / dark limestone base', ...limestoneMaps,
      color: '#626964', normalScale: new THREE.Vector2(.8, .8),
      roughness: 1, aoMapIntensity: 0.6,
    }, 3);
    return { marble, limestone, bridgeStone, mortar, blue, gold, bronze, roof, darkStone, dispose };
  } catch (error) {
    cancellationReason ??= error;
    dispose();
    throw error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
