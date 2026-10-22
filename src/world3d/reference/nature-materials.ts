import * as THREE from 'three';

export type NatureMaterialQuality = 'low' | 'high';

export interface NatureMaterials {
  bark: THREE.MeshStandardMaterial;
  barkDark: THREE.MeshStandardMaterial;
  limestone: THREE.MeshStandardMaterial;
  wetLimestone: THREE.MeshStandardMaterial;
  moss: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  /** Rejects if a required texture failed. Await before taking visual evidence. */
  ready: Promise<void>;
  dispose(): void;
}

/**
 * Locally stored CC0-derived bark/rock PBR plus original botanical textures.
 * See the asset directory's README for exact sources and transformations.
 * Bark grows in +V (the tree owner maps 2.8 m per V tile). Rock tiles cover 3 m.
 * Foliage has four horizontal atlas cells: U=[0,.25],[.25,.5],[.5,.75],[.75,1].
 * Assign each card a single cell, using the entire V range; never repeat it.
 * All branches/rocks/large fissures remain the geometry owner's responsibility.
 */
export function createNatureMaterials(quality: NatureMaterialQuality): NatureMaterials {
  const base = `${import.meta.env.BASE_URL}world3d/reference/nature/`;
  const resolution = quality === 'high' ? 'high' : 'low';
  const loader = new THREE.TextureLoader();
  const textures: THREE.Texture[] = [];
  const pending: Promise<void>[] = [];
  let disposed = false;
  const texture = (name: string, color = false, atlas = false): THREE.Texture => {
    let resolve!: () => void;
    let reject!: (reason: Error) => void;
    pending.push(new Promise<void>((yes, no) => { resolve = yes; reject = no; }));
    const map = loader.load(`${base}${resolution}/${name}`, loaded => {
      if (disposed) loaded.dispose();
      resolve();
    }, undefined, () => reject(new Error(`Natural material texture failed: ${name}`)));
    map.name = `reference-nature/${resolution}/${name}`;
    map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.wrapS = map.wrapT = atlas ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    map.anisotropy = quality === 'high' ? 8 : 2;
    textures.push(map);
    return map;
  };
  const barkMap = texture('olive-bark-color.webp', true);
  const barkNormal = texture('olive-bark-normal.webp');
  const barkRough = texture('olive-bark-roughness.webp');
  const stoneMap = texture('limestone-color.webp', true);
  const stoneNormal = texture('limestone-normal.webp');
  const stoneRough = texture('limestone-roughness.webp');
  const wetMap = texture('limestone-wet-color.webp', true);
  const wetRough = texture('limestone-wet-roughness.webp');
  const mossMap = texture('moss-color.webp', true);
  const mossNormal = texture('moss-normal.webp');
  const mossRough = texture('moss-roughness.webp');
  const foliageMap = texture('olive-sprays-color.png', true, true);
  const foliageNormal = texture('olive-sprays-normal.webp', false, true);
  const foliageRough = texture('olive-sprays-roughness.webp', false, true);

  const bark = new THREE.MeshStandardMaterial({
    name: 'Reference olive / weathered bark', map: barkMap, normalMap: barkNormal,
    roughnessMap: barkRough, normalScale: new THREE.Vector2(.62, .82), roughness: 1, vertexColors: true,
  });
  const barkDark = bark.clone();
  barkDark.name = 'Reference olive / shaded furrows';
  barkDark.color.set('#aca394');
  const limestone = new THREE.MeshStandardMaterial({
    name: 'Reference limestone / dry chalk', map: stoneMap, normalMap: stoneNormal,
    roughnessMap: stoneRough, normalScale: new THREE.Vector2(.38, .38), roughness: 1, vertexColors: true,
  });
  const wetLimestone = new THREE.MeshStandardMaterial({
    name: 'Reference limestone / damp mineral runs', map: wetMap, normalMap: stoneNormal,
    roughnessMap: wetRough, normalScale: new THREE.Vector2(.33, .33), roughness: 1,
    // Water darkens the diffuse surface and lowers roughness, not metalness.
    metalness: 0, vertexColors: true,
  });
  const moss = new THREE.MeshStandardMaterial({
    name: 'Reference moss / uneven shaded cushions', map: mossMap, normalMap: mossNormal,
    roughnessMap: mossRough, normalScale: new THREE.Vector2(.45, .45), roughness: 1, vertexColors: true,
  });
  const foliage = new THREE.MeshStandardMaterial({
    name: 'Reference olive / four spray atlas', map: foliageMap,
    normalMap: foliageNormal, roughnessMap: foliageRough,
    normalScale: new THREE.Vector2(.18, .18), roughness: 1,
    side: THREE.DoubleSide, alphaTest: .46, alphaToCoverage: true,
    // Alpha testing retains normal depth and shadow writes. No transparent sort.
    transparent: false, depthWrite: true,
  });
  // WebGLBindingStates reads this for missing attributes on every material.
  // Explicit zero is essential: generic attribute values can be left over from
  // another program's colour input at the same GL attribute location.
  Object.assign(foliage, { defaultAttributeValues: {
    color: [1, 1, 1], uv: [0, 0], uv1: [0, 0], instanceCrownNormal: [0, 0, 0],
    instanceCrownCenter: [0, 0, 0], instanceCrownInvRadius2: [0, 0, 0],
  } });
  // A physical olive leaf has a pale, silver underside. This stays lit by the
  // scene and does not fake illumination with emissive/glowing foliage.
  foliage.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      attribute vec3 instanceCrownNormal;
      attribute vec3 instanceCrownCenter;
      attribute vec3 instanceCrownInvRadius2;
      varying vec3 vNatureCrownNormal;
    `).replace('#include <beginnormal_vertex>', `
      #include <beginnormal_vertex>
      float natureCrownLength = length(instanceCrownNormal);
      if (natureCrownLength > 0.001) {
        objectNormal = normalize(mix(objectNormal, normalize(instanceCrownNormal), 0.80));
      }
    `).replace('#include <defaultnormal_vertex>', `
      #include <defaultnormal_vertex>
      vNatureCrownNormal = natureCrownLength > 0.001 ? normalize(transformedNormal) : vec3(0.0);
      #ifdef USE_INSTANCING
        if (length(instanceCrownInvRadius2) > 0.001) {
          // Both attributes describe the crown in tree-local space. Evaluate
          // its ellipsoid normal field at each vertex, so neighbouring cards
          // in the same crown share a continuous representative blade normal.
          vec3 natureLeafPos = (instanceMatrix * vec4(position, 1.0)).xyz;
          vec3 natureCrownField = (natureLeafPos - instanceCrownCenter) * instanceCrownInvRadius2;
          natureCrownField.y += 0.35;
          if (length(natureCrownField) > 0.001) {
            vNatureCrownNormal = normalize(normalMatrix * normalize(natureCrownField));
          }
        }
      #endif
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying vec3 vNatureCrownNormal;
    `).replace('#include <normal_fragment_begin>', `
      #include <normal_fragment_begin>
      if (length(vNatureCrownNormal) > 0.001) {
        // The card represents many differently oriented blades. Its averaged
        // crown normal should not flip wholesale when the card is back-facing.
        normal = normalize(mix(normal, normalize(vNatureCrownNormal), 0.88));
        nonPerturbedNormal = normal;
        #if defined(USE_NORMALMAP_TANGENTSPACE)
          tbn[2] = normal;
        #endif
      }
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      if (!gl_FrontFacing) {
        float leafValue = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.055, 0.067, 0.038) * (0.80 + leafValue * 0.6), 0.44);
      }
    `);
  };
  foliage.customProgramCacheKey = () => 'reference-olive-crown-normal-silver-backs-v4';
  foliage.userData.atlas = { columns: 4, rows: 1, paddingPixels: quality === 'high' ? 12 : 6, leafShape: 'lanceolate' };
  foliage.userData.volumeLighting = 'Optional tree-local instanceCrownCenter/instanceCrownInvRadius2 provide a continuous crown field per vertex; instanceCrownNormal is the fallback. This approximates blade orientations, not individually modelled leaves.';
  bark.userData.metersPerTile = 2.8;
  limestone.userData.metersPerTile = 3;
  wetLimestone.userData.metersPerTile = 3;
  const materials = [bark, barkDark, limestone, wetLimestone, moss, foliage];
  const ready = Promise.all(pending).then(() => undefined);
  // Consumers may mount synchronously and await later. Keep failure observable
  // through the original promise without an unhandled rejection before mount.
  void ready.catch(() => undefined);
  return {
    bark, barkDark, limestone, wetLimestone, moss, foliage, ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      materials.forEach(material => material.dispose());
      textures.forEach(map => map.dispose());
    },
  };
}
