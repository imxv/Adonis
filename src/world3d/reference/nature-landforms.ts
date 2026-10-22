import * as THREE from 'three';
import type { ReferenceGroveBankPatch } from './contracts';
import { createSanctuaryFrontLandform } from './nature-landform-sanctuary';
import { createGroveBankLandform } from './nature-landform-banks';
import type { NatureLandformContacts, NatureLandformContext } from './nature-landform-types';

export type { NatureLandformContacts, NatureLandformContext } from './nature-landform-types';
export interface ReferenceLandformOptions extends NatureLandformContext {
  readonly contacts: NatureLandformContacts;
  readonly groveBankPatch?: ReferenceGroveBankPatch;
}
export interface ReferenceLandformAsset {
  readonly root: THREE.Group;
  readonly geometries: ReadonlySet<THREE.BufferGeometry>;
  dispose(): void;
}

/** World-metre visible rock only. D supplies the sole contour/flight authority
 * and actual ground callback; it retains soil, walk support and placement.
 * All materials/maps are borrowed; the returned geometry belongs to this asset.
 * No automatic replacement of existing nature placements takes place here. */
export function createReferenceLandforms(options: ReferenceLandformOptions): ReferenceLandformAsset {
  const root = new THREE.Group(); root.name = 'reference/nature/r5-visible-landforms';
  const geometries = new Set<THREE.BufferGeometry>();
  let disposed = false;
  const adopt = (group: THREE.Group) => {
    group.traverse(object => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
    root.add(group);
  };
  const dispose = () => {
    if (disposed) return; disposed = true;
    root.removeFromParent(); root.clear();
    geometries.forEach(geometry => geometry.dispose()); geometries.clear();
  };
  try {
    options.signal?.throwIfAborted();
    const { contacts, groveBankPatch, ...context } = options;
    adopt(createSanctuaryFrontLandform({ ...context, contours: contacts.sanctuaryFrontContours, flights: contacts.flights, landing: contacts.landing, springBranch: contacts.springBranch }));
    options.signal?.throwIfAborted();
    adopt(createGroveBankLandform({ ...context, pool: contacts.grovePool, causeway: contacts.bridgeEastCauseway, flights: contacts.flights, groveBankPatch }));
    options.signal?.throwIfAborted();
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    root.userData.landforms = { scope: 'Visible C rock only, supplied D metric contacts; no soil/walk/water or automatic world replacement', quality: options.quality,
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, parts: root.children.map(child => ({ name: child.name, metadata: child.userData })),
      ownership: 'Unique geometries owned; all input materials/maps borrowed', transform: 'identity; vertices already world metres' };
    return { root, geometries, dispose };
  } catch (error) { dispose(); throw error; }
}
