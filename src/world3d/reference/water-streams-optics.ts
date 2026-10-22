import * as THREE from 'three';
import type { ReferenceVec3 } from './contracts';

export interface OutletWaterOptics {
  skyZenith?: THREE.ColorRepresentation;
  skyHorizon?: THREE.ColorRepresentation;
  poolOutline?: readonly ReferenceVec3[];
  seaOutline?: readonly ReferenceVec3[];
}

/** A local material borrowing D's current soil maps, never their ownership.
 * World UVs match that bottom without changing the frozen bed attributes. */
export function createOutletBedMaterial(_length: number, _width: number) {
  const material = new THREE.MeshStandardMaterial({
    name: 'ReferenceOutletLimestoneBed', color: '#dad1af', roughness: 1, metalness: 0,
  });
  material.customProgramCacheKey = () => 'reference-outlet-limestone-bed-v2';
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vBedWorld;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBedWorld=(modelMatrix*vec4(position,1.0)).xyz;')
      .replace('#include <uv_vertex>', /* glsl */ `
        #include <uv_vertex>
        vec2 bedUv=(modelMatrix*vec4(position,1.0)).xz/3.0;
        #ifdef USE_MAP
          vMapUv=(mapTransform*vec3(bedUv,1.0)).xy;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv=(normalMapTransform*vec3(bedUv,1.0)).xy;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv=(roughnessMapTransform*vec3(bedUv,1.0)).xy;
        #endif
      `);
    shader.fragmentShader = `varying vec3 vBedWorld;\n${shader.fragmentShader}`
      .replace('#include <map_fragment>', /* glsl */ `
        #include <map_fragment>
        // The outlet lies at z16..21, where D's soil is almost entirely limestone.
        // Keep the same world tint modulation rather than an independent olive slab.
        diffuseColor.rgb*=.96+sin(vBedWorld.x*.32-vBedWorld.z*.19)*.035;
      `);
  };
  return material;
}

export function syncOutletBedMaterial(material: THREE.MeshStandardMaterial, source?: THREE.MeshStandardMaterial) {
  const map=source?.map ?? null, normalMap=source?.normalMap ?? null, roughnessMap=source?.roughnessMap ?? null;
  const normalType=source?.normalMapType ?? THREE.TangentSpaceNormalMap;
  const definesChanged=Boolean(material.map)!==Boolean(map) || Boolean(material.normalMap)!==Boolean(normalMap)
    || Boolean(material.roughnessMap)!==Boolean(roughnessMap) || material.normalMapType!==normalType;
  material.map=map; material.normalMap=normalMap; material.roughnessMap=roughnessMap; material.normalMapType=normalType;
  material.roughness=source?.roughness ?? 1;
  if(source) material.normalScale.copy(source.normalScale); else material.normalScale.set(.35,.35);
  if(definesChanged) material.needsUpdate=true;
}

/** Only the ordinary outlet uses this transparent, capture-free material.
 * Its world-space noise bands and linear optical colours follow the pool's
 * analytic fallback. Existing pool/sea overlap supplies the mouth transition;
 * no vertices, bed, capture resources, or neighbouring water are changed. */
export function createOutletWaterMaterial(sun: THREE.Vector3, length: number, width: number, options: OutletWaterOptics = {}) {
  const outline = (points: readonly ReferenceVec3[] = []) => Array.from({ length: 16 }, (_, i) => {
    const p = points[i]; return new THREE.Vector2(p?.[0] ?? 0, p?.[2] ?? 0);
  });
  return new THREE.ShaderMaterial({
    name: 'ReferenceNaturalOutletWater', transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uFlow: { value: 1 }, uSun: { value: sun.clone() },
      uLength: { value: length }, uWidth: { value: width },
      uDeep: { value: new THREE.Color('#0b4448') }, uShallow: { value: new THREE.Color('#4c9c8d') },
      uAbsorption: { value: new THREE.Vector3(.36, .092, .068) }, uSunColor: { value: new THREE.Color('#fff0d5') },
      uSkyTop: { value: new THREE.Color(options.skyZenith ?? '#4e91c3') },
      uSkyHorizon: { value: new THREE.Color(options.skyHorizon ?? '#bed8e4') },
      uPool: { value: outline(options.poolOutline) }, uPoolCount: { value: Math.min(16, options.poolOutline?.length ?? 0) },
      uSea: { value: outline(options.seaOutline) }, uSeaCount: { value: Math.min(16, options.seaOutline?.length ?? 0) },
    }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal;
      void main() {
        vUv=uv; vec4 world=modelMatrix*vec4(position,1.0);
        vWorld=world.xyz; vNormal=normalize(mat3(modelMatrix)*normal);
        vec4 mvPosition=viewMatrix*world; gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime,uFlow,uLength,uWidth;
      uniform vec3 uSun,uSunColor,uDeep,uShallow,uAbsorption,uSkyTop,uSkyHorizon;
      uniform vec2 uPool[16],uSea[16]; uniform int uPoolCount,uSeaCount;
      varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal;
      float waterHash(vec2 p) {
        vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33);
        return fract((p3.x+p3.y)*p3.z);
      }
      vec3 waterNoise(vec2 p) {
        vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f),du=6.0*f*(1.0-f);
        float a=waterHash(i),b=waterHash(i+vec2(1,0)),c=waterHash(i+vec2(0,1)),d=waterHash(i+vec2(1));
        float k=a-b-c+d;
        return vec3(a+(b-a)*u.x+(c-a)*u.y+k*u.x*u.y,du*vec2(b-a+k*u.y,c-a+k*u.x));
      }
      vec3 waterWave(vec2 p,float t,float fineDetail) {
        mat2 r0=mat2(.838,.545,-.545,.838),r1=mat2(.374,-.927,.927,.374),r2=mat2(-.731,.682,-.682,-.731);
        vec3 n0=waterNoise(r0*p*1.65+vec2(t*.11,-t*.06));
        vec3 n1=waterNoise(r1*p*4.05+vec2(-t*.23,t*.09));
        vec3 n2=waterNoise(r2*p*10.8+vec2(t*.18,t*.21));
        vec2 g0=vec2(dot(r0[0],n0.yz),dot(r0[1],n0.yz))*1.65;
        vec2 g1=vec2(dot(r1[0],n1.yz),dot(r1[1],n1.yz))*4.05;
        vec2 g2=vec2(dot(r2[0],n2.yz),dot(r2[1],n2.yz))*10.8;
        return vec3(n0.x*.62+n1.x*.27+n2.x*.11-.5,g0*.62+g1*.27+g2*.11*fineDetail);
      }
      // Signed distance to the actual supplied world outline, negative inside.
      float poolDistance(vec2 p) {
        float d=1e6; bool inside=false; vec2 a=uPool[max(uPoolCount-1,0)];
        for(int i=0;i<16;i++) { if(i>=uPoolCount) break; vec2 b=uPool[i],e=b-a;
          d=min(d,length(p-a-e*clamp(dot(p-a,e)/max(dot(e,e),1e-8),0.0,1.0)));
          if((a.y>p.y)!=(b.y>p.y)) { if(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside; } a=b;
        } return inside?-d:d;
      }
      float seaDistance(vec2 p) {
        float d=1e6; bool inside=false; vec2 a=uSea[max(uSeaCount-1,0)];
        for(int i=0;i<16;i++) { if(i>=uSeaCount) break; vec2 b=uSea[i],e=b-a;
          d=min(d,length(p-a-e*clamp(dot(p-a,e)/max(dot(e,e),1e-8),0.0,1.0)));
          if((a.y>p.y)!=(b.y>p.y)) { if(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside; } a=b;
        } return inside?-d:d;
      }
      void main() {
        float footprint=max(length(dFdx(vWorld.xz)),length(dFdy(vWorld.xz)));
        float fine=1.0-smoothstep(.035,.20,footprint);
        vec3 wave=waterWave(vWorld.xz,uTime,fine);
        vec3 normal=normalize(vNormal+vec3(-wave.y*.028*1.6,0.0,-wave.z*.028*1.6));
        vec3 eye=normalize(cameraPosition-vWorld);
        float cosine=max(dot(normal,eye),.001),fresnel=.0204+.9796*pow(1.0-cosine,5.0);
        vec3 reflected=reflect(-eye,normal);
        float along=clamp(vUv.y/max(uLength,.01),0.0,1.0);
        float skyVisibility=mix(.3,1.0,smoothstep(.55,1.0,along));
        vec3 sky=mix(uSkyHorizon,uSkyTop,pow(clamp(reflected.y,0.0,1.0),.48));
        sky=mix(uDeep*.75,sky,skyVisibility);
        float thickness=.16+sin(clamp(vUv.x,0.0,1.0)*PI)*.12;
        float path=thickness/max(cosine,.25);
        vec3 transmission=exp(-uAbsorption*path);
        vec3 below=mix(uDeep,uShallow,.75)*transmission+uDeep*(1.0-transmission);
        vec3 color=mix(below,sky,fresnel);
        float specular=pow(max(dot(reflected,uSun),0.0),620.0);
        color+=uSunColor*specular*2.4;
        float alpha=clamp(.10+(1.0-exp(-path*.11))*.42+fresnel*.72,.08,.88);
        float bank=smoothstep(0.0,.11,min(vUv.x,1.0-vUv.x)*uWidth);
        float cover=0.0;
        if(uPoolCount>=3) cover=max(cover,smoothstep(0.0,.85,-poolDistance(vWorld.xz)));
        if(uSeaCount>=3) cover=max(cover,smoothstep(0.0,.85,-seaDistance(vWorld.xz)));
        float mouth=1.0-cover;
        if(uPoolCount<3) mouth*=smoothstep(0.0,.65,vUv.y);
        if(uSeaCount<3) mouth*=smoothstep(0.0,.65,uLength-vUv.y);
        gl_FragColor=vec4(color,alpha*bank*mouth);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}
