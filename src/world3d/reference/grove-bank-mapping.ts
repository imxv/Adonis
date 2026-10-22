import * as THREE from 'three';

type Domain = { readonly x: readonly [number, number]; readonly z: readonly [number, number] };

export const REFERENCE_GROVE_BANK_MAPPING_REVISION = 'r5-grove-bank-side-triplanar-1';
const maskAttribute = 'groveBankMappingMask';
const mappedMaterials = new WeakSet<THREE.MeshStandardMaterial>();

function replaceOnce(source: string, token: string, replacement: string) {
  if (source.split(token).length !== 2) throw new Error(`Grove-bank shader requires one ${token}`);
  return source.replace(token, replacement);
}

const vertexPars = /* glsl */`
attribute float groveBankMappingMask;
varying float vGroveBankMappingMask;
varying vec3 vGroveBankMappingPosition;
varying vec3 vGroveBankMappingNormal;
`;
const fragmentPars = /* glsl */`
uniform float groveBankMappingTileM;
varying float vGroveBankMappingMask;
varying vec3 vGroveBankMappingPosition;
varying vec3 vGroveBankMappingNormal;

vec3 groveBankAxisWeights() {
  vec3 w = abs( vGroveBankMappingNormal );
  w *= w;
  w *= w;
  return w / max( dot( w, vec3( 1.0 ) ), 1e-8 );
}
vec2 groveBankUvX() { return vGroveBankMappingPosition.zy / groveBankMappingTileM; }
vec2 groveBankUvY() { return vGroveBankMappingPosition.xz / groveBankMappingTileM; }
vec2 groveBankUvZ() { return vGroveBankMappingPosition.xy / groveBankMappingTileM; }

vec4 groveBankTexture( sampler2D tex ) {
  vec3 w = groveBankAxisWeights();
  return texture2D( tex, groveBankUvX() ) * w.x
    + texture2D( tex, groveBankUvY() ) * w.y
    + texture2D( tex, groveBankUvZ() ) * w.z;
}
`;

/** Adapted from this installed Three normalmap_pars_fragment.getTangentFrame.
 * All frames use the SAME view-space geometric normal. Consequently neutral
 * map XY=(0,0) returns that normal for every projection, including a collapsed
 * projection whose axis weight is zero. No axis-normal averaging or unrelated
 * object-to-view rotation is applied to a decoded normal texture.
 */
const normalPars = /* glsl */`
#ifdef USE_NORMALMAP_TANGENTSPACE
mat3 groveBankTangentFrame( vec3 eyePosition, vec3 surfaceNormal, vec2 uv ) {
  vec3 q0 = dFdx( eyePosition );
  vec3 q1 = dFdy( eyePosition );
  vec2 st0 = dFdx( uv );
  vec2 st1 = dFdy( uv );
  vec3 q1perp = cross( q1, surfaceNormal );
  vec3 q0perp = cross( surfaceNormal, q0 );
  vec3 T = q1perp * st0.x + q0perp * st1.x;
  vec3 B = q1perp * st0.y + q0perp * st1.y;
  float det = max( dot( T, T ), dot( B, B ) );
  float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
  return mat3( T * scale, B * scale, surfaceNormal );
}
vec3 groveBankProjectionNormal( vec2 uv, vec3 geometricNormal, float faceSign ) {
  vec3 mapN = texture2D( normalMap, uv ).xyz * 2.0 - 1.0;
  #ifdef USE_PACKED_NORMALMAP
    mapN.z = sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) );
  #endif
  mapN.xy *= normalScale;
  mat3 frame = groveBankTangentFrame( -vViewPosition, geometricNormal, uv );
  #ifdef DOUBLE_SIDED
    frame[0] *= faceSign;
    frame[1] *= faceSign;
  #endif
  return normalize( frame * mapN );
}
vec3 groveBankMappedNormal( vec3 geometricNormal, float faceSign ) {
  vec3 w = groveBankAxisWeights();
  return normalize(
    groveBankProjectionNormal( groveBankUvX(), geometricNormal, faceSign ) * w.x
    + groveBankProjectionNormal( groveBankUvY(), geometricNormal, faceSign ) * w.y
    + groveBankProjectionNormal( groveBankUvZ(), geometricNormal, faceSign ) * w.z
  );
}
#endif
`;

/** Local D ground only. The caller supplies a dedicated material clone, owns
 * its disposal, and invokes this once after final geometry/normals exist.
 * Adds only the scalar mapping-mask attribute; position/normal/UV/colour/index
 * data and texture objects are untouched. Object coordinates are already world
 * metres on D's terrain. Route/support meshes must keep their original material.
 */
export function applyReferenceGroveBankMapping(
  geometry: THREE.BufferGeometry,
  material: THREE.MeshStandardMaterial,
  domain: Domain,
  sampleWeight: (x: number, z: number) => number,
) {
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  if (!position || !normal || position.itemSize !== 3 || normal.itemSize !== 3 || position.count !== normal.count) {
    throw new Error('Grove-bank mapping requires matching ground positions and normals');
  }
  if (![...domain.x, ...domain.z].every(Number.isFinite)
    || domain.x[0] >= domain.x[1] || domain.z[0] >= domain.z[1]) {
    throw new Error('Grove-bank mapping requires finite increasing domain bounds');
  }
  if (material.normalMap && material.normalMapType !== THREE.TangentSpaceNormalMap) {
    throw new Error('Grove-bank mapping requires tangent-space normal maps');
  }
  if (mappedMaterials.has(material)) throw new Error('Grove-bank mapping requires a fresh dedicated material clone');
  const masks = new Float32Array(position.count);
  let activeVertices = 0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    if (x <= domain.x[0] || x >= domain.x[1] || z <= domain.z[0] || z >= domain.z[1]) continue;
    const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i), length = Math.hypot(nx, ny, nz);
    if (!Number.isFinite(length)) throw new Error('Grove-bank mapping received a non-finite normal');
    if (length === 0) continue;
    const t = Math.max(0, Math.min(1, (.72 - Math.abs(ny) / length) / (.72 - .28)));
    const steep = t * t * (3 - 2 * t);
    if (steep === 0) continue;
    const weight = sampleWeight(x, z);
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error('Grove-bank mapping weight outside [0,1]');
    masks[i] = steep * weight;
    if (masks[i] > 0) activeVertices++;
  }

  // Patch the actual installed chunks, retaining their original macro branches
  // and mask-zero operations. No texture, normalScale or material colour changes.
  const mapFragment = replaceOnce(THREE.ShaderChunk.map_fragment, 'diffuseColor *= sampledDiffuseColor;', /* glsl */`
    vec4 groveDiffuse = groveBankTexture( map );
    #ifdef DECODE_VIDEO_TEXTURE
      groveDiffuse = sRGBTransferEOTF( groveDiffuse );
    #endif
    if ( vGroveBankMappingMask > 0.0 ) {
      sampledDiffuseColor = mix( sampledDiffuseColor, groveDiffuse, clamp( vGroveBankMappingMask, 0.0, 1.0 ) );
    }
    diffuseColor *= sampledDiffuseColor;
  `);
  const roughnessFragment = replaceOnce(THREE.ShaderChunk.roughnessmap_fragment, 'roughnessFactor *= texelRoughness.g;', /* glsl */`
    vec4 groveRoughness = groveBankTexture( roughnessMap );
    if ( vGroveBankMappingMask > 0.0 ) {
      texelRoughness = mix( texelRoughness, groveRoughness, clamp( vGroveBankMappingMask, 0.0, 1.0 ) );
    }
    roughnessFactor *= texelRoughness.g;
  `);
  const normalFragment = /* glsl */`
    vec3 groveGeometricNormal = normal;
    ${THREE.ShaderChunk.normal_fragment_maps}
    #ifdef USE_NORMALMAP_TANGENTSPACE
      // Derivatives/implicit texture LOD are evaluated before the non-uniform
      // mask branch. Mask-zero fragments still keep the original result.
      vec3 groveTriplanarNormal = groveBankMappedNormal( groveGeometricNormal, faceDirection );
      if ( vGroveBankMappingMask > 0.0 ) {
        normal = normalize( mix( normal, groveTriplanarNormal, clamp( vGroveBankMappingMask, 0.0, 1.0 ) ) );
      }
    #endif
  `;
  geometry.setAttribute(maskAttribute, new THREE.Float32BufferAttribute(masks, 1));
  // Entirely flat/guarded geometry retains the original native shader as well.
  if (activeVertices === 0) return geometry;
  const previousCompile = material.onBeforeCompile, previousCacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    shader.uniforms.groveBankMappingTileM = { value: 3 };
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', `#include <common>\n${vertexPars}`);
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <project_vertex>', /* glsl */`
      vGroveBankMappingMask = groveBankMappingMask;
      vGroveBankMappingPosition = transformed;
      vGroveBankMappingNormal = objectNormal;
      #include <project_vertex>
    `);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <common>', `#include <common>\n${fragmentPars}`);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <normalmap_pars_fragment>', `#include <normalmap_pars_fragment>\n${normalPars}`);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <map_fragment>', mapFragment);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <roughnessmap_fragment>', roughnessFragment);
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <normal_fragment_maps>', normalFragment);
  };
  material.customProgramCacheKey = () => `${previousCacheKey}|${REFERENCE_GROVE_BANK_MAPPING_REVISION}`;
  mappedMaterials.add(material); material.needsUpdate = true;
  return geometry;
}
