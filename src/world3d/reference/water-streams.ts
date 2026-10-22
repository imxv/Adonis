import * as THREE from 'three';
import type { ReferenceStream } from './contracts';
import type { WaterSurfaceQuality } from './water-surface';
import { createOutletBedMaterial, createOutletWaterMaterial, syncOutletBedMaterial, type OutletWaterOptics } from './water-streams-optics';

/** Thin flowing reaches: fixed small channel mesh, transparent/analytic optics, no capture passes.
 * All quality modes share the same .6m mesh; there is no retained high-quality LOD asset. */
export function createWaterStreams(streams: readonly ReferenceStream[], _quality: WaterSurfaceQuality, sunDirection: THREE.Vector3, outletOptics?: OutletWaterOptics) {
  const group = new THREE.Group(); group.name = 'reference-flowing-streams';
  const owned: Array<{ mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; controlled: boolean }> = [];
  let bedMaterial: THREE.MeshStandardMaterial | undefined;
  let outletBedMaterial: THREE.MeshStandardMaterial | undefined;
  const captureExclusions: THREE.Object3D[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const beds = new THREE.Group(); group.add(beds);
  for (const stream of streams) {
    if (stream.points.length < 2) continue;
    const points = stream.points.map(p => new THREE.Vector3(...p));
    const position: number[] = [], uv: number[] = [], index: number[] = [];
    let length = 0, row = 0;
    for (let segment = 0; segment < points.length - 1; segment++) {
      const start = points[segment], end = points[segment + 1];
      const distance = start.distanceTo(end), rows = Math.max(2, Math.ceil(distance / .6));
      const tangent = end.clone().sub(start).normalize(), side = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      for (let step = 0; step <= rows; step++) {
        if (segment && !step) continue;
        const t = step / rows, center = start.clone().lerp(end, t);
        const width = stream.width * (.96 + .05 * Math.sin(length * .73));
        for (let col = 0; col <= 4; col++) {
          const u = col / 4, p = center.clone().addScaledVector(side, (u - .5) * width);
          position.push(p.x, p.y + .025, p.z); uv.push(u, length + t * distance);
        }
        if (row) for (let col = 0; col < 4; col++) {
          const a = (row - 1) * 5 + col; index.push(a, a + 5, a + 1, a + 1, a + 5, a + 6);
        }
        row++;
      }
      length += distance;
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(index); geometry.computeVertexNormals(); geometries.push(geometry);
    const material = stream.id === 'water.outlet' && !stream.controlledBySpring
      ? createOutletWaterMaterial(sunDirection, length, stream.width, outletOptics)
      : new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uSun: { value: sunDirection.clone() }, uFlow: { value: stream.controlledBySpring ? .22 : 1 } },
      vertexShader: `varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal; void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;vNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `uniform float uTime; uniform float uFlow; uniform vec3 uSun; varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal;
      void main(){float t=uTime*(.5+uFlow*.8);float a=sin(vUv.y*5.7-t*4.1+sin(vUv.x*8.1+vUv.y*.4));float b=sin(vUv.x*19.3+vUv.y*2.1+t*1.7);vec3 n=normalize(vNormal+vec3(a*.065,b*.025,b*.06));vec3 eye=normalize(cameraPosition-vWorld);float f=.02+.98*pow(1.-max(dot(n,eye),0.),5.);float halfWidth=mix(.06,.50,uFlow);float edge=1.-smoothstep(max(halfWidth-.07,0.),halfWidth,abs(vUv.x-.5));float crest=pow(max(a*.5+.5,0.),14.)*.15*uFlow;vec3 c=mix(vec3(.035,.18,.145),vec3(.31,.56,.64),f);c+=vec3(.62,.72,.70)*crest;float light=pow(max(dot(reflect(-eye,n),uSun),0.),190.);c+=vec3(1.,.91,.72)*light;gl_FragColor=vec4(c,edge*(.30+f*.55)*mix(.18,1.,uFlow));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = stream.id;
    // The outlet fades over the existing optical pool/sea, whose order is 2.
    mesh.renderOrder = stream.id === 'water.outlet' && !stream.controlledBySpring ? 2.1 : 2;
    group.add(mesh); owned.push({ mesh, controlled: stream.controlledBySpring });
    if (stream.id === 'water.outlet' && !stream.controlledBySpring) captureExclusions.push(mesh);
    // Spring channels have D-owned solid carriers; only natural reaches add this bed.
    if (stream.controlledBySpring) continue;
    const naturalBedMaterial = stream.id === 'water.outlet'
      ? (outletBedMaterial ??= createOutletBedMaterial(length, stream.width))
      : (bedMaterial ??= new THREE.MeshStandardMaterial({ color: '#706f50', roughness: .55, metalness: 0 }));
    const bedGeometry = geometry.clone(); geometries.push(bedGeometry);
    const bedPositions = bedGeometry.attributes.position;
    for (let i = 0; i < bedPositions.count; i++) bedPositions.setY(i, bedPositions.getY(i) - .16 - Math.sin((i % 5) / 4 * Math.PI) * .12);
    bedGeometry.computeVertexNormals();
    const bed = new THREE.Mesh(bedGeometry, naturalBedMaterial); bed.name = `${stream.id}.channel-bed`; bed.receiveShadow = true; beds.add(bed);
  }
  let disposed = false;
  return { group, captureExclusions, syncBedMaterial(source?: THREE.MeshStandardMaterial) { if (!disposed && outletBedMaterial) syncOutletBedMaterial(outletBedMaterial, source); }, update(time: number) { if (!disposed) owned.forEach(({ mesh }) => { mesh.material.uniforms.uTime.value = time; }); }, setSpringRestored(restored: boolean) { if (!disposed) owned.forEach(({ mesh, controlled }) => { if (controlled) mesh.material.uniforms.uFlow.value = restored ? 1 : .22; }); }, dispose() { if (disposed) return; disposed = true; group.removeFromParent(); geometries.forEach(g => g.dispose()); owned.forEach(({ mesh }) => mesh.material.dispose()); bedMaterial?.dispose(); outletBedMaterial?.dispose(); group.clear(); } };
}
