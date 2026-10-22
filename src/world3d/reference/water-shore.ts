import * as THREE from 'three';
import type { ReferenceWaterSurface } from './contracts';
import { createOutletBedMaterial, syncOutletBedMaterial } from './water-streams-optics';

interface LocalWetSegment {
  surfaceId: string; edge: number; step: number; start: number; count: number;
  p: THREE.Vector3; q: THREE.Vector3; normal: THREE.Vector3; halfWidths: [number, number];
}

/** The approved small wetness sample. Everything outside this draw group keeps
 * its original material. Soil maps are borrowed by the same path as the outlet. */
function createLocalWetMaterial(segment: LocalWetSegment) {
  const material = createOutletBedMaterial(0, 0);
  material.name = 'ReferenceSeaEdge4Step3WetShore';
  material.vertexColors = true; material.transparent = true; material.opacity = .58;
  material.depthWrite = false; material.polygonOffset = true;
  material.polygonOffsetFactor = -1; material.polygonOffsetUnits = -1;
  const direction = segment.q.clone().sub(segment.p), length = direction.length(); direction.normalize();
  const wetUniforms = {
    uWetStart: { value: new THREE.Vector2(segment.p.x, segment.p.z) },
    uWetDirection: { value: new THREE.Vector2(direction.x, direction.z) },
    uWetNormal: { value: new THREE.Vector2(segment.normal.x, segment.normal.z) },
    uWetLength: { value: length }, uWetHalfWidths: { value: new THREE.Vector2(...segment.halfWidths) },
    uWetEndBlend: { value: .16 }, uWetHasSoil: { value: 0 },
  };
  material.userData.wetShoreUniforms = wetUniforms;
  const soilHook = material.onBeforeCompile;
  material.customProgramCacheKey = () => 'reference-local-wet-soil-v1';
  material.onBeforeCompile = (shader, renderer) => {
    soilHook.call(material, shader, renderer);
    Object.assign(shader.uniforms, wetUniforms);
    shader.fragmentShader = /* glsl */ `
      uniform vec2 uWetStart,uWetDirection,uWetNormal,uWetHalfWidths;
      uniform float uWetLength,uWetEndBlend,uWetHasSoil;
      ${shader.fragmentShader}`
      // Keep the old vertex colours available as the exact end/fallback colour,
      // without multiplying them into the borrowed limestone texture.
      .replace('#include <color_fragment>', '')
      .replace('#include <alphamap_fragment>', /* glsl */ `
        #include <alphamap_fragment>
        vec2 wetDelta=vBedWorld.xz-uWetStart;
        float wetAlong=dot(wetDelta,uWetDirection);
        float wetFraction=clamp(wetAlong/uWetLength,0.0,1.0);
        float wetHalfWidth=mix(uWetHalfWidths.x,uWetHalfWidths.y,wetFraction);
        float wetAcross=clamp(1.0-abs(dot(wetDelta,uWetNormal))/wetHalfWidth,0.0,1.0);
        float shoreWetness=smoothstep(0.0,.75,wetAcross);
        float shoreInfluence=smoothstep(0.0,uWetEndBlend,wetAlong)
          *smoothstep(0.0,uWetEndBlend,uWetLength-wetAlong)*uWetHasSoil;
        diffuseColor.rgb=mix(vColor.rgb,diffuseColor.rgb*(1.0-.16*shoreWetness),shoreInfluence);
        diffuseColor.a*=mix(1.0,shoreWetness,shoreInfluence);
      `)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `
        #include <roughnessmap_fragment>
        roughnessFactor=mix(.35,mix(roughnessFactor,.32,shoreWetness),shoreInfluence);
      `)
      .replace('#include <normal_fragment_maps>', /* glsl */ `
        vec3 shoreBaseNormal=normal;
        #include <normal_fragment_maps>
        normal=normalize(mix(shoreBaseNormal,normal,shoreInfluence));
      `);
  };
  return { material, sync(source?: THREE.MeshStandardMaterial) {
    syncOutletBedMaterial(material, source);
    wetUniforms.uWetHasSoil.value = source?.map && source.normalMap && source.roughnessMap ? 1 : 0;
  } };
}

/** A narrow, terrain-following damp band; vertical rock wetness belongs to C's rock material. */
export function createWetShore(surfaces: readonly ReferenceWaterSurface[], terrainHeight: (x: number, z: number) => number) {
  const group = new THREE.Group(); group.name = 'reference-terrain-wet-shore';
  const position: number[] = [], colors: number[] = [], indices: number[] = [];
  const color = new THREE.Color();
  let localSegment: LocalWetSegment | undefined;
  for (const surface of surfaces) {
    const outline = surface.outline, level = outline[0]?.[1] ?? 0;
    for (let edge = 0; edge < outline.length; edge++) {
      const a = new THREE.Vector3(...outline[edge]), b = new THREE.Vector3(...outline[(edge + 1) % outline.length]);
      const tangent = b.clone().sub(a), steps = Math.ceil(tangent.length() / .8);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      for (let step = 0; step < steps; step++) {
        const p = a.clone().lerp(b, step / steps), q = a.clone().lerp(b, (step + 1) / steps);
        const h = terrainHeight(p.x, p.z);
        if (!Number.isFinite(h) || Math.abs(h - level) > .5) continue;
        const base = position.length / 3;
        // Semantic scope plus the approved outline anchors: never select by the
        // global quad number, which changes when another shore is prepended.
        if (surface.id === 'water.sea' && edge === 4 && step === 3
          && a.x === 10 && a.y === 0 && a.z === 18 && b.x === -8 && b.y === 0 && b.z === 17) {
          localSegment = { surfaceId: surface.id, edge, step, start: indices.length, count: 6, p: p.clone(), q: q.clone(), normal: normal.clone(),
            halfWidths: [.18 + .06 * Math.sin(p.x * 2.3 + p.z), .18 + .06 * Math.sin(q.x * 2.3 + q.z)] };
        }
        for (const [center, side] of [[p, -1], [p, 1], [q, -1], [q, 1]] as const) {
          const point = center.clone().addScaledVector(normal, side * (.18 + .06 * Math.sin(center.x * 2.3 + center.z)));
          const y = terrainHeight(point.x, point.z);
          position.push(point.x, y + .018, point.z);
          color.set('#4d5b45').multiplyScalar(.82 + .16 * Math.sin(point.x * 3.1 + point.z * .7)); color.toArray(colors, colors.length);
        }
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .35, transparent: true, opacity: .58, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const local = localSegment ? createLocalWetMaterial(localSegment) : undefined;
  if (localSegment) {
    if (localSegment.start) geometry.addGroup(0, localSegment.start, 0);
    geometry.addGroup(localSegment.start, localSegment.count, 1);
    const end = localSegment.start + localSegment.count;
    if (end < indices.length) geometry.addGroup(end, indices.length - end, 0);
    group.userData.localWetSelection = { surfaceId: localSegment.surfaceId, edge: localSegment.edge, step: localSegment.step,
      indexStart: localSegment.start, indexCount: localSegment.count, centerStart: localSegment.p.toArray(), centerEnd: localSegment.q.toArray(),
      halfWidths: localSegment.halfWidths, endBlendMetres: .16, appearanceOnly: true };
  }
  const mesh = new THREE.Mesh(geometry, local ? [material, local.material] : material); mesh.name = 'terrain-damp-contact-band'; mesh.receiveShadow = true; group.add(mesh);
  let disposed = false;
  return { group, syncSoilMaterial(source?: THREE.MeshStandardMaterial) { if (!disposed) local?.sync(source); },
    dispose() { if (disposed) return; disposed = true; group.removeFromParent(); geometry.dispose(); material.dispose(); local?.material.dispose(); group.clear(); } };
}
