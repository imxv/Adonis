import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VISUAL_THEME } from '../ui/visualTheme';
import { VALVES } from './content';
import { createPainterlyTextures } from './painterly';
import type { GreekWorldQuality, WorldEnvironment } from './types';
import type { ArtLayer } from './artLayer';
import { createCoastalLandscapeLayer } from './coastalLandscape';
import { createBotanicalLayer, TREE_TRUNKS } from './botanical';
import { createAntiquitiesLayer } from './antiquities';

/** All meshes and painted surfaces are original procedural artwork. World north is -Z. */
export async function createEnvironment(initialQuality: GreekWorldQuality, signal?: AbortSignal): Promise<WorldEnvironment> {
  const scene = new THREE.Scene();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const instances: THREE.InstancedMesh[] = [];
  const artLayers: ArtLayer[] = [];
  let textures: ReturnType<typeof createPainterlyTextures> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    artLayers.forEach(layer => layer.dispose()); artLayers.length = 0;
    instances.forEach(mesh => mesh.dispose());
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures?.dispose();
    sun.shadow.dispose();
    scene.clear();
    geometries.clear(); materials.clear(); instances.length = 0;
  };
  const abort = () => { if (signal?.aborted) throw new DOMException('World creation cancelled', 'AbortError'); };
  const checkpoint = async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); abort(); };
  const geometry = <T extends THREE.BufferGeometry>(value: T): T => { geometries.add(value); return value; };
  const material = <T extends THREE.Material>(value: T): T => { materials.add(value); return value; };
  const palette = VISUAL_THEME.world3d;
  const sun = new THREE.DirectionalLight('#fff0d5', 3.15);
  let quality = initialQuality;
  let restored = false;
  let gateAmount = 0;
  const seeded = (seed: number) => { let state = seed; return () => { state = (Math.imul(state, 1664525) + 1013904223) | 0; return (state >>> 0) / 4294967296; }; };
  const random = seeded(390571);
  const smooth = (a: number, b: number, value: number) => { const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const terrainHeight = (x: number, z: number) => {
    let h = 2.3 + 2.0 * smooth(14, -48, z) + 16.2 * smooth(-86, -143, z);
    const side = smooth(8, 34, Math.abs(x));
    h += side * (Math.sin(z * .071 + x * .09) * .65 + Math.sin(x * .19) * .3);
    // The bay opens to the left of the authored stone walk. Its edge is a real height change.
    const shore = -23 + Math.sin(z * .06) * 3;
    const bay = smooth(shore + 3.2, shore - 2.8, x) * smooth(-48, -18, z);
    h = THREE.MathUtils.lerp(h, -3.2, bay);
    if (z < -138 && Math.abs(x) < 13) h = 20.48;
    h = THREE.MathUtils.lerp(h, -2.6, smooth(48, 63, z));
    h = THREE.MathUtils.lerp(h, -3.4, smooth(48, 73, Math.abs(x)));
    return h;
  };
  const groundHeight = (x: number, z: number) => Math.abs(x) < 12.75 && z < -137.5 && z > -174.5 ? 20.57 : terrainHeight(x, z);
  const trailX = (z: number) => z > 16 ? -9 * smooth(16, 42, z) : z > 8 || z < -127 ? 0 : Math.sin((z + 21) / 25) * 3.6;
  const colliders: { x: number; z: number; radius: number }[] = [];
  const walls: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  const sector = (name: string) => { const group = new THREE.Group(); group.name = name; scene.add(group); return group; };
  const coast = sector('coast: boat, tide shrine, coastal ruins');
  const grove = sector('grove: spring, water channels, olive sanctuary');
  const temple = sector('temple: fluted colonnade, carved frieze, open inner chamber');
  const mountain = sector('mountain: pass and terraced cliffs');
  const horizon = sector('horizon: Aegean island silhouettes');
  const coastDetail = sector('coast details');
  const groveDetail = sector('grove details');
  const templeDetail = sector('temple details');
  const dynamic = sector('animated water, gates and puzzle discs');
  const foliageBatches: { mesh: THREE.InstancedMesh; count: number }[] = [];

  try {
    abort();
    textures = createPainterlyTextures();
    textures.stone.repeat.set(1.8, 1.8);
    textures.sand.repeat.set(22, 37);
    textures.water.repeat.set(18, 15);
    const stone = material(new THREE.MeshStandardMaterial({ color: '#f3e4c9', map: textures.stone, roughness: .96 }));
    const shadowStone = material(new THREE.MeshStandardMaterial({ color: palette.marbleShadow, map: textures.stone, roughness: 1 }));
    const ochre = material(new THREE.MeshStandardMaterial({ color: palette.stone, map: textures.stone, roughness: 1 }));
    const terracotta = material(new THREE.MeshStandardMaterial({ color: '#b47950', map: textures.stone, roughness: .96 }));
    const gold = material(new THREE.MeshStandardMaterial({ color: palette.oldGold, roughness: .65, metalness: .22 }));
    const blue = material(new THREE.MeshStandardMaterial({ color: '#527d92', roughness: .97 }));
    const wood = material(new THREE.MeshStandardMaterial({ color: '#725840', map: textures.stone, roughness: 1 }));
    const darkWood = material(new THREE.MeshStandardMaterial({ color: '#4c5142', roughness: 1 }));
    const foliageMat = material(new THREE.MeshStandardMaterial({ color: '#9dad7a', map: textures.foliage, roughness: 1, flatShading: true }));
    const grassMat = material(new THREE.MeshStandardMaterial({ color: '#88936a', side: THREE.DoubleSide, roughness: 1 }));
    const flowerMat = material(new THREE.MeshStandardMaterial({ color: '#ac98ba', roughness: 1, flatShading: true }));
    const waterMat = material(new THREE.MeshStandardMaterial({ color: '#c6e8e2', map: textures.water, transparent: true, opacity: .87, roughness: .36, metalness: .12 }));
    const flowMat = material(new THREE.MeshStandardMaterial({ color: '#a5e4d3', emissive: '#6daea4', emissiveIntensity: .65, transparent: true, opacity: .76, roughness: .4 }));
    const goldenFlowMat = material(new THREE.MeshBasicMaterial({ color: '#ecd285', transparent: true, opacity: .7, depthWrite: false }));
    const foamMat = material(new THREE.MeshBasicMaterial({ color: '#e7ebcf', transparent: true, opacity: .63, side: THREE.DoubleSide, depthWrite: false }));
    const unitBox = geometry(new THREE.BoxGeometry(1, 1, 1));
    const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 16));
    const rockGeo = geometry(new THREE.DodecahedronGeometry(1, 0));
    const leafGeo = geometry(new THREE.IcosahedronGeometry(1, 1));
    const mesh = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0) => {
      const value = new THREE.Mesh(geo, mat); value.position.set(x, y, z); value.scale.set(sx, sy, sz); value.rotation.y = ry;
      value.castShadow = true; value.receiveShadow = true; parent.add(value); return value;
    };
    const box = (parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) => mesh(parent, unitBox, mat, x, y, z, sx, sy, sz, ry);
    const tube = (parent: THREE.Object3D, points: THREE.Vector3[], radius: number, mat: THREE.Material, segments = 24) => {
      const curve = new THREE.CatmullRomCurve3(points); return mesh(parent, geometry(new THREE.TubeGeometry(curve, segments, radius, 6, false)), mat, 0, 0, 0);
    };
    const ring = (parent: THREE.Object3D, x: number, y: number, z: number, radius: number, thickness: number, mat: THREE.Material, vertical = false) => {
      const value = mesh(parent, geometry(new THREE.TorusGeometry(radius, thickness, 5, 40)), mat, x, y, z);
      if (!vertical) value.rotation.x = -Math.PI / 2;
      return value;
    };
    const branch = (parent: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, bottom: number, top: number, mat: THREE.Material) => {
      const direction = to.clone().sub(from); const center = from.clone().add(to).multiplyScalar(.5);
      const value = mesh(parent, geometry(new THREE.CylinderGeometry(top, bottom, direction.length(), 7)), mat, center.x, center.y, center.z);
      value.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); return value;
    };
    const batch = (group: THREE.Group) => {
      // Keep each landmark separately cullable while reducing a carved building to one draw per material.
      group.updateMatrixWorld(true);
      const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
      const sourceMeshes = new Map<THREE.Material, THREE.Mesh[]>();
      group.traverse(object => {
        if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || Array.isArray(object.material)) return;
        const transformed = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
        // Custom reliefs, paths and hulls have no UVs; normalize attribute layouts before merging.
        if (!transformed.getAttribute('normal')) transformed.computeVertexNormals();
        if (!transformed.getAttribute('uv')) {
          const positions = transformed.getAttribute('position'); const uvs: number[] = [];
          for (let i = 0; i < positions.count; i++) uvs.push(positions.getX(i) * .2, positions.getZ(i) * .2);
          transformed.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        }
        transformed.applyMatrix4(object.matrixWorld);
        const list = buckets.get(object.material) ?? []; list.push(transformed); buckets.set(object.material, list);
        const sources = sourceMeshes.get(object.material) ?? []; sources.push(object); sourceMeshes.set(object.material, sources);
      });
      for (const [mat, parts] of buckets) {
        const merged = mergeGeometries(parts, false);
        if (merged) {
          const sources = sourceMeshes.get(mat) ?? [];
          sources.forEach(value => value.removeFromParent());
          const combined = mesh(group, geometry(merged), mat, 0, 0, 0);
          combined.castShadow = sources.some(value => value.castShadow);
        }
        parts.forEach(part => part.dispose());
      }
    };
    const makeInstances = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, positions: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; color?: THREE.Color }[], foliage = false) => {
      const value = new THREE.InstancedMesh(geo, mat, positions.length);
      const object = new THREE.Object3D();
      positions.forEach((item, index) => {
        object.position.set(item.x, item.y, item.z); object.scale.set(item.sx, item.sy, item.sz); object.rotation.set(0, item.ry, 0); object.updateMatrix();
        value.setMatrixAt(index, object.matrix); if (item.color) value.setColorAt(index, item.color);
      });
      value.instanceMatrix.needsUpdate = true; value.castShadow = true; value.receiveShadow = true; value.computeBoundingSphere(); parent.add(value); instances.push(value);
      if (foliage) foliageBatches.push({ mesh: value, count: positions.length });
      return value;
    };

    scene.background = new THREE.Color('#78b6d4');
    scene.fog = new THREE.Fog('#b2cfda', 140, 390);
    scene.add(new THREE.HemisphereLight('#c8e1f3', '#4e6175', 1.02));
    const coolBounce = new THREE.DirectionalLight('#a8d1e6', .48); coolBounce.position.set(70, 32, -55); scene.add(coolBounce);
    sun.position.set(-58, 71, 33); sun.target.position.set(0, 3, -65); scene.add(sun, sun.target);
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -75; sun.shadow.camera.right = 75;
    sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -100; sun.shadow.camera.near = 1; sun.shadow.camera.far = 240;
    // The wide walking area needs a conservative bias at the 1024px medium budget.
    // This keeps the gently sloped painted terrain free of striped self-shadowing.
    sun.shadow.normalBias = .18; sun.shadow.bias = -.0005;
    const skyMat = material(new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { zenith: { value: new THREE.Color('#438fbe') }, horizon: { value: new THREE.Color('#c8dfe6') } }, vertexShader: 'varying vec3 p; void main(){ p=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'varying vec3 p; uniform vec3 zenith; uniform vec3 horizon; void main(){float t=smoothstep(-.08,.74,normalize(p).y);gl_FragColor=vec4(mix(horizon,zenith,t),1.);\n#include <colorspace_fragment>\n}' }));
    const sky = mesh(horizon, geometry(new THREE.SphereGeometry(330, 32, 16)), skyMat, 0, 0, 0); sky.castShadow = false;

    const terrainGeo = geometry(new THREE.PlaneGeometry(156, 264, 160, 264)); terrainGeo.rotateX(-Math.PI / 2); terrainGeo.translate(0, 0, -68);
    const ground = terrainGeo.getAttribute('position'); const colors: number[] = [];
    const drySand = new THREE.Color('#d5c197'), warmEarth = new THREE.Color('#ac966f');
    const oliveGrass = new THREE.Color('#76905d'), deepGrass = new THREE.Color('#527454');
    const dampShore = new THREE.Color('#87968b'), bareRock = new THREE.Color('#b8b8ac');
    const contactShade = new THREE.Color('#405763');
    const groundContacts = [
      { x: -13.6, z: 35.15, radius: 1.45, strength: .21 },
      { x: -12.1, z: 36.6, radius: 1.05, strength: .18 },
      { x: -14.65, z: 36.3, radius: 1.1, strength: .18 },
      { x: -12.15, z: 38.25, radius: .9, strength: .15 },
      { x: -15, z: -58, radius: 1.65, strength: .2 },
      ...TREE_TRUNKS.map(trunk => ({ ...trunk, radius: trunk.radius + 2.2, strength: .105 })),
    ];
    for (let i = 0; i < ground.count; i++) {
      const x = ground.getX(i), z = ground.getZ(i), y = terrainHeight(x, z); ground.setY(i, y);
      // Broad, overlapping washes avoid a latitude stripe between sand and the olive grove.
      const broad = (Math.sin(x * .055 + z * .027) + Math.sin(z * .071 - x * .024) + Math.sin(x * .091 + z * .043)) / 3;
      const flecks = Math.sin(x * .17 + Math.cos(z * .079) * 1.8) * Math.cos(z * .12 - x * .067);
      const meadow = smooth(27, -36, z);
      const trailDistance = Math.abs(x - trailX(z));
      const shoulder = 1 - smooth(1.7, 6.2 + broad * 1.3, trailDistance);
      const coastalScrub = smooth(.04, .62, broad + flecks * .16) * .28 * smooth(46, 14, z) * (1 - shoulder * .65);
      const grassAmount = THREE.MathUtils.clamp(meadow * (.78 + broad * .23 + flecks * .1) + coastalScrub - shoulder * .32, 0, 1);
      const color = drySand.clone().lerp(warmEarth, .13 + broad * .11).lerp(oliveGrass, grassAmount);
      color.lerp(deepGrass, grassAmount * smooth(-.15, .65, broad) * .3);
      // A narrow cool wash follows the actual inlet; the interior remains dry ochre sand.
      const shoreDistance = x - (-23 + Math.sin(z * .06) * 3);
      const wetAmount = (1 - smooth(1.6, 7.5 + broad, shoreDistance)) * smooth(-45, -15, z);
      color.lerp(dampShore, wetAmount * .5);
      const slope = Math.hypot(terrainHeight(x + .6, z) - terrainHeight(x - .6, z), terrainHeight(x, z + .6) - terrainHeight(x, z - .6)) / 1.2;
      const exposed = smooth(.18, .51, slope);
      const ascent = smooth(-88, -134, z);
      const rockAmount = ascent * THREE.MathUtils.clamp(.27 + exposed * .7 - broad * .17, 0, 1);
      color.lerp(bareRock, rockAmount);
      // Baked, soft contact colour remains present when low quality omits real-time shadows.
      let contact = 0;
      for (const patch of groundContacts) {
        const distance = Math.hypot(x - patch.x, z - patch.z) / patch.radius;
        contact = Math.max(contact, Math.exp(-distance * distance * 2.4) * patch.strength);
      }
      color.lerp(contactShade, contact);
      // Consume the original terrain random sequence so later authored debris placement is unchanged.
      color.multiplyScalar(.965 + broad * .028 + flecks * .018 + random() * .03);
      colors.push(color.r, color.g, color.b);
    }
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); terrainGeo.computeVertexNormals();
    const terrainMat = material(new THREE.MeshStandardMaterial({ map: textures.sand, vertexColors: true, roughness: 1 }));
    mesh(scene, terrainGeo, terrainMat, 0, 0, 0).castShadow = false;

    const pathMat = material(new THREE.MeshStandardMaterial({ color: '#c8b99c', map: textures.stone, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: .88, depthWrite: false }));
    pathMat.forceSinglePass = true;
    // Fade only the painted path's outer shoulder; its vertices and walkable shape stay intact.
    pathMat.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float pathEdge; varying float vPathEdge;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPathEdge = pathEdge;');
      shader.fragmentShader = 'varying float vPathEdge;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(0.56, 1.0, abs(vPathEdge));');
    };
    pathMat.customProgramCacheKey = () => 'greek-path-soft-shoulder-v1';
    const path = (points: THREE.Vector2[], width: number, parent: THREE.Object3D) => {
      const vertices: number[] = [], indices: number[] = [], edges: number[] = [];
      const curve = new THREE.SplineCurve(points); const sampled = curve.getPoints(Math.max(12, Math.ceil(curve.getLength() * 1.2)));
      sampled.forEach((point, i) => { const next = sampled[Math.min(i + 1, sampled.length - 1)], prev = sampled[Math.max(0, i - 1)]; const tangent = next.clone().sub(prev).normalize(); const normal = new THREE.Vector2(-tangent.y, tangent.x).multiplyScalar(width / 2 + Math.sin(i*1.7)*.16+Math.sin(i*.31)*.22); for (const side of [-1, 1]) { const x = point.x + normal.x * side, z = point.y + normal.y * side; vertices.push(x, groundHeight(x, z) + .035, z); edges.push(side); } if (i < sampled.length - 1) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); } });
      const uvs:number[]=[];for(let i=0;i<vertices.length;i+=3)uvs.push(vertices[i]*.3,vertices[i+2]*.3);
      const geo = geometry(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); geo.setAttribute('pathEdge', new THREE.Float32BufferAttribute(edges, 1)); geo.setIndex(indices); geo.computeVertexNormals(); mesh(parent, geo, pathMat, 0, 0, 0).castShadow = false;
    };
    const trail: THREE.Vector2[] = []; for (let z = 44; z >= -178; z -= 4) trail.push(new THREE.Vector2(trailX(z), z)); path(trail, 2.8, scene);
    path([new THREE.Vector2(0, 29), new THREE.Vector2(-8, 26), new THREE.Vector2(-14, 24)], 2.2, coast);
    path([new THREE.Vector2(0, 9), new THREE.Vector2(8, 5), new THREE.Vector2(14, 4)], 2.1, coast);
    path([new THREE.Vector2(-3, -49), new THREE.Vector2(-11, -54), new THREE.Vector2(-15, -58)], 2.2, grove);
    path([new THREE.Vector2(-7, -68), new THREE.Vector2(0, -62), new THREE.Vector2(7, -68), new THREE.Vector2(0, -75)], 2.1, grove);
    const paving: Parameters<typeof makeInstances>[3] = [];
    for (let z = 38; z > -176; z -= 1.7) {
      const centre = trailX(z);
      for (let side = -1; side <= 1; side++) {
        if (random() < .36) continue;
        const x = centre + side * 1.25 + (random() - .5) * .22;
        paving.push({ x, y: groundHeight(x, z) + .075, z, sx: .65 + random() * .4, sy: .065, sz: .65 + random() * .6, ry: (random() - .5) * .12, color: new THREE.Color('#d4c3a2').multiplyScalar(.85 + random() * .2) });
      }
    }
    makeInstances(scene, geometry(new THREE.CylinderGeometry(.5,.5,1,7)), stone, paving);
    await checkpoint();

    const landscape = createCoastalLandscapeLayer({ groundHeight, quality: initialQuality });
    artLayers.push(landscape); scene.add(landscape.root);
    for (const collider of landscape.root.userData.colliders ?? []) colliders.push({...collider});
    await checkpoint();
    const botanical = createBotanicalLayer({ groundHeight, quality: initialQuality });
    artLayers.push(botanical); scene.add(botanical.root);
    TREE_TRUNKS.forEach(trunk => colliders.push({...trunk}));
    await checkpoint();
    const antiques = createAntiquitiesLayer({ groundHeight, quality: initialQuality });
    artLayers.push(antiques); scene.add(antiques.root);
    for (const collider of antiques.root.userData.colliders ?? []) colliders.push({...collider});
    await checkpoint();

    // Coast: a broken boat, a navigational bronze and a half-buried tide shrine.
    const boat = new THREE.Group(); boat.position.set(-18, groundHeight(-18, 25) + .12, 25); boat.rotation.y = -.4; coast.add(boat);
    const hullVertices: number[] = [], hullIndices: number[] = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; const z = (t - .5) * 7; const width = Math.sin(t * Math.PI) * 1.65; hullVertices.push(-width, .75 + Math.pow(Math.abs(t - .5), 2) * 2, z, 0, -.05, z, width, .75 + Math.pow(Math.abs(t - .5), 2) * 2, z); if (i < 16) for (let k = 0; k < 2; k++) { const n = i * 3 + k; hullIndices.push(n, n + 3, n + 1, n + 1, n + 3, n + 4); } }
    const hull = geometry(new THREE.BufferGeometry()); hull.setAttribute('position', new THREE.Float32BufferAttribute(hullVertices, 3)); hull.setIndex(hullIndices); hull.computeVertexNormals();
    const hullMat = material(new THREE.MeshStandardMaterial({ color: '#8a6b49', roughness: 1, side: THREE.DoubleSide })); mesh(boat, hull, hullMat, 0, 0, 0);
    for (let i = -2; i <= 2; i++) box(boat, wood, 0, .58, i, 2.4, .14, .28, .04 * i);
    branch(boat, new THREE.Vector3(0, .1, .3), new THREE.Vector3(.5, 3.1, .8), .12, .065, darkWood);
    box(boat, blue, .25, 1.8, 1, .9, 1.4, .06, -.2);
    const bronzeY = groundHeight(-14, 24); box(coast, ochre, -14, bronzeY + .35, 24, 1.2, .7, 1.2);
    const astrolabe = new THREE.Group(); astrolabe.position.set(-14, bronzeY + 1.15, 24); astrolabe.rotation.x = -.55; coast.add(astrolabe);
    ring(astrolabe, 0, 0, 0, .62, .045, gold, true); ring(astrolabe, 0, 0, 0, .42, .025, gold, true);
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * .4; mesh(astrolabe, rockGeo, gold, Math.sin(a) * .47, Math.cos(a) * .47, .02, .07, .07, .04); }
    box(astrolabe, gold, 0, 0, 0, .04, 1.05, .04, .6);
    const muralY = groundHeight(16, 4); box(coast, ochre, 16.4, muralY + 2.05, 4, .8, 4.1, 6.6);
    const muralMat = material(new THREE.MeshStandardMaterial({ map: textures.mural, roughness: 1 }));
    const mural = mesh(coast, geometry(new THREE.PlaneGeometry(5.7, 3.4)), muralMat, 15.985, muralY + 2.15, 4); mural.rotation.y = -Math.PI / 2;
    for (const side of [-1, 1]) { box(coast, stone, 15.9, muralY + 2.1, 4 + side * 3.4, 1.1, 4.2, .55); box(coast, blue, 15.7, muralY + .28, 4 + side * 3.4, 1.5, .25, .9); }
    box(coast, stone, 16, muralY + 4.3, 4, 1.3, .4, 7.8);
    box(coastDetail, gold, 15.25, muralY + 4.15, 4, .03, .12, 6.3);
    walls.push({ minX: 15.5, maxX: 17.2, minZ: .1, maxZ: 7.9 });
    for (let i = 0; i < 11; i++) { const x = 11 + random() * 10, z = 10 + random() * 5; mesh(coastDetail, rockGeo, stone, x, groundHeight(x, z) + .25, z, .5 + random(), .2 + random() * .3, .5 + random(), random() * 4); }
    // Old olive oath: a tilted carved stela embedded amongst the roots.
    const oathY = groundHeight(-15, -58);
    const stela = box(grove, stone, -15, oathY + .9, -58, 1.5, 1.8, .42, .16); stela.rotation.z = -.12;
    const inscriptionMat = material(new THREE.MeshStandardMaterial({ map: textures.inscription, roughness: 1 }));
    const inscription = mesh(grove, geometry(new THREE.PlaneGeometry(1.18, 1.35)), inscriptionMat, -15, oathY + 1.02, -57.77); inscription.rotation.y = .16; inscription.rotation.z = -.12;
    colliders.push({ x: -15, z: -58, radius: .7 });
    const springY = groundHeight(0, -75);
    mesh(grove, cylinder, shadowStone, 0, springY + .04, -75, 4.7, .15, 4.7);
    ring(grove, 0, springY + .4, -75, 4.1, .3, stone);
    ring(grove, 0, springY + .52, -75, 4.1, .055, gold);
    mesh(grove, cylinder, blue, 0, springY + .1, -75, 3.85, .1, 3.85);
    const springWater = mesh(dynamic, geometry(new THREE.CircleGeometry(3.82, 48)), flowMat, 0, springY + .26, -75); springWater.rotation.x = -Math.PI / 2; springWater.visible = false;
    mesh(grove, cylinder, stone, 0, springY + .65, -76, .7, 1.3, .7);
    const bowlProfile = [new THREE.Vector2(.18,-.48),new THREE.Vector2(.48,-.42),new THREE.Vector2(.9,-.17),new THREE.Vector2(1.15,0),new THREE.Vector2(1.12,.08),new THREE.Vector2(.98,.07),new THREE.Vector2(.78,-.1),new THREE.Vector2(.38,-.27),new THREE.Vector2(.18,-.29)];
    const fountainBowl = mesh(grove, geometry(new THREE.LatheGeometry(bowlProfile, 48)), stone, 0, springY + 1.7, -76);
    ring(grove, 0, springY + 1.7, -76, 1.15, .12, gold);
    colliders.push({ x: 0, z: -76, radius: 1.35 });
    const fallingWater = tube(dynamic, [new THREE.Vector3(0, springY + 2.7, -76), new THREE.Vector3(.35, springY + 2.3, -76), new THREE.Vector3(.6, springY + 1.8, -76)], .1, flowMat, 12); fallingWater.visible = false;
    const spillWater = tube(dynamic, [new THREE.Vector3(.85, springY + 1.65, -76), new THREE.Vector3(1.4, springY + 1, -75.8), new THREE.Vector3(1.7, springY + .2, -75.6)], .13, flowMat, 16); spillWater.visible = false;
    const valvePointers: THREE.Group[] = [], valveFlows: THREE.Mesh[] = [];
    VALVES.forEach((valve, index) => {
      const h = groundHeight(valve.x, valve.z); colliders.push({ x: valve.x, z: valve.z, radius: .95 });
      mesh(grove, cylinder, shadowStone, valve.x, h + .15, valve.z, 1.15, .3, 1.15);
      mesh(grove, cylinder, stone, valve.x, h + .66, valve.z, .8, 1.08, .8);
      ring(grove, valve.x, h + 1.25, valve.z, .82, .09, gold);
      const pointer = new THREE.Group(); pointer.position.set(valve.x, h + 1.29, valve.z); dynamic.add(pointer); valvePointers.push(pointer);
      box(pointer, gold, 0, .04, -.25, .12, .08, .68);
      const arrow = mesh(pointer, geometry(new THREE.ConeGeometry(.22, .35, 3)), gold, 0, .045, -.68); arrow.rotation.x = -Math.PI / 2;
      if (index === 0) { for (let i = 0; i < 3; i++) ring(pointer, 0, .065, .22, .11 + i * .07, .018, gold); }
      if (index === 1) { mesh(pointer, leafGeo, gold, -.1, .065, .19, .12, .045, .29, -.6); mesh(pointer, leafGeo, gold, .1, .065, .22, .12, .045, .29, .6); }
      if (index === 2) { ring(pointer, 0, .065, .22, .16, .035, gold); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; box(pointer, gold, Math.sin(a) * .28, .065, .22 + Math.cos(a) * .28, .045, .04, .1, a); } }
      // Four fixed cardinal ticks surround the rotating relief.
      for (let tick = 0; tick < 4; tick++) { const a = tick * Math.PI / 2; box(groveDetail, blue, valve.x + Math.sin(a) * .94, h + 1.24, valve.z - Math.cos(a) * .94, .1, .08, .18, -a); }
      const start = new THREE.Vector3(valve.x, h + .1, valve.z), end = new THREE.Vector3(0, springY + .12, -75);
      const mid = start.clone().lerp(end, .5); mid.y = groundHeight(mid.x, mid.z) + .12;
      tube(grove, [start, mid, end], .24, shadowStone, 20);
      const flow = tube(dynamic, [start.clone().add(new THREE.Vector3(0, .13, 0)), mid.clone().add(new THREE.Vector3(0, .13, 0)), end.clone().add(new THREE.Vector3(0, .13, 0))], .095, goldenFlowMat, 20); flow.visible = false; valveFlows.push(flow);
    });
    const ascentPoints: THREE.Vector3[] = [];
    for (let z = -79; z >= -145; z -= 2) ascentPoints.push(new THREE.Vector3(trailX(z) + 4.5, groundHeight(trailX(z) + 4.5, z) + .16, z));
    tube(grove, ascentPoints, .3, shadowStone, 90);
    const ascentFlow = tube(dynamic, ascentPoints.map(point => point.clone().add(new THREE.Vector3(0, .14, 0))), .13, goldenFlowMat, 90); ascentFlow.visible = false;
    await checkpoint();

    // The mountain gate occupies the only walkable pass; both leaves really open on completion.
    const gateZ = -102, gateY = groundHeight(0, gateZ);
    for (const side of [-1, 1]) {
      box(mountain, stone, side * 10, gateY + 3.4, gateZ, 10, 6.8, 2.1);
      box(mountain, shadowStone, side * 5, gateY + 3.7, gateZ, 1.35, 7.4, 2.9);
      box(mountain, gold, side * 5, gateY + 7.05, gateZ, 1.5, .14, 3);
      box(mountain, blue, side * 10, gateY + 4.7, gateZ + 1.07, 8, .32, .05);
    }
    box(mountain, stone, 0, gateY + 7.8, gateZ, 12.8, 1.1, 3.2);
    box(mountain, gold, 0, gateY + 7.2, gateZ + 1.65, 11.2, .15, .1);
    const gates: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(side * 4.3, gateY, gateZ); dynamic.add(hinge); gates.push(hinge);
      box(hinge, blue, -side * 2.15, 3.45, 0, 4.3, 6.8, .42);
      box(hinge, gold, -side * 2.15, 3.45, .24, 3.7, 5.9, .1);
      box(hinge, darkWood, -side * 2.15, 3.45, .31, 3.35, 5.55, .12);
      for (let i = 0; i < 5; i++) box(hinge, gold, -side * 2.15, 1.2 + i * 1.1, .4, 2.7, .09, .08);
      ring(hinge, -side * 2.15, 3.45, .51, .74, .065, gold, true);
      mesh(hinge, leafGeo, gold, -side * 2.15, 3.45, .55, .28, .62, .08, side * .5);
    }
    // Stepped retaining courses describe the ascent without forcing camera bobbing or jumps.
    for (let z = -110; z > -139; z -= 4) for (const side of [-1, 1]) box(mountain, stone, side * 7.5, groundHeight(side * 7.5, z) + .18, z, 2.8, .36, 1.5, side * .1);

    // Temple: crepidoma, real fluting, metopes, pediment relief, open cella and sea-facing terrace.
    const templeY = 20.57;
    box(temple, stone, 0, templeY - .175, -156, 25.5, .35, 37);
    box(temple, shadowStone, 0, templeY - .45, -156, 27.1, .25, 38.4);
    for (const side of [-1, 1]) box(temple, gold, side * 12.35, templeY + .04, -156, .13, .08, 34.5);
    const flutedGeo = geometry(new THREE.CylinderGeometry(.56, .68, 8.7, 48, 1, false));
    const flutedPositions = flutedGeo.getAttribute('position');
    for (let i = 0; i < flutedPositions.count; i++) { const x = flutedPositions.getX(i), z = flutedPositions.getZ(i), angle = Math.atan2(z, x); const flute = 1 - .055 * (1 + Math.cos(angle * 12)); flutedPositions.setX(i, x * flute); flutedPositions.setZ(i, z * flute); }
    flutedGeo.computeVertexNormals();
    const column = (x: number, z: number) => {
      mesh(temple, cylinder, stone, x, templeY + .22, z, .95, .4, .95);
      mesh(temple, flutedGeo, stone, x, templeY + 4.8, z);
      ring(templeDetail, x, templeY + 1.02, z, .63, .04, gold);
      mesh(temple, cylinder, stone, x, templeY + 9.2, z, .9, .4, .9);
      box(temple, stone, x, templeY + 9.55, z, 1.95, .32, 1.95);
      colliders.push({ x, z, radius: .91 });
    };
    for (const side of [-1, 1]) for (let z = -142; z >= -170; z -= 7) column(side * 10, z);
    for (const z of [-142, -170]) for (const x of [-6, -2, 2, 6]) column(x, z);
    // Four perimeter lintels leave the central roof aperture genuinely open.
    for (const side of [-1, 1]) box(temple, stone, side * 10, templeY + 10.15, -156, 2.5, 1, 30.1);
    for (const z of [-142, -170]) box(temple, stone, 0, templeY + 10.15, z, 22.5, 1, 2.1);
    for (const side of [-1, 1]) box(temple, stone, side * 8.9, templeY + 10.8, -156, 4.6, .4, 30.8);
    for (const z of [-142, -170]) box(temple, stone, 0, templeY + 10.8, z, 22.5, .4, 3.6);
    const pedimentGeo = geometry(new THREE.BufferGeometry());
    pedimentGeo.setAttribute('position', new THREE.Float32BufferAttribute([-11.9, 0, 0, 11.9, 0, 0, 0, 4, 0, -11.9, 0, -.7, 0, 4, -.7, 11.9, 0, -.7], 3)); pedimentGeo.setIndex([0, 1, 2, 3, 4, 5, 0, 2, 4, 0, 4, 3, 2, 1, 5, 2, 5, 4, 0, 3, 5, 0, 5, 1]); pedimentGeo.computeVertexNormals();
    for (const z of [-140.65, -170.65]) {
      mesh(temple, pedimentGeo, stone, 0, templeY + 11, z);
      box(templeDetail, gold, 0, templeY + 11.15, z + .06, 21.5, .12, .05);
      ring(templeDetail, 0, templeY + 12.3, z + .12, .82, .11, gold, true);
      for (const side of [-1, 1]) for (let i = 0; i < 5; i++) mesh(templeDetail, leafGeo, gold, side * (1.7 + i * .74), templeY + 11.9 + (4 - i) * .09, z + .15, .53, .17, .06, side * -.3);
    }
    for (const z of [-140.6, -170.6]) for (let i = -10; i <= 10; i++) {
      box(templeDetail, blue, i, templeY + 10.08, z, .43, .55, .04);
      for (let flute = -1; flute <= 1; flute++) box(templeDetail, gold, i + flute * .1, templeY + 10.08, z + .03, .025, .45, .02);
    }
    for (const side of [-1, 1]) {
      box(temple, stone, side * 6.75, templeY + 3, -157, .65, 6, 18);
      walls.push({ minX: side > 0 ? 6.3 : -7.2, maxX: side > 0 ? 7.2 : -6.3, minZ: -166.5, maxZ: -147.5 });
      for (let i = 0; i < 4; i++) {
        box(templeDetail, blue, side * 6.39, templeY + 2.8, -150 - i * 4, .04, 2.7, 2.5);
        ring(templeDetail, side * 6.35, templeY + 2.9, -150 - i * 4, .5, .035, gold, true).rotation.y = Math.PI / 2;
      }
    }
    // A low altar leaves discovery centre accessible, with sunlight falling through the aperture.
    box(temple, stone, 0, templeY + .65, -163, 2.3, 1.3, 2.3);
    box(temple, gold, 0, templeY + 1.34, -163, 2.4, .12, 2.4);
    mesh(temple, leafGeo, gold, 0, templeY + 1.72, -163, .55, .12, 1, -.5);
    colliders.push({ x: 0, z: -163, radius: 1.4 });
    const lightRayMat = material(new THREE.MeshBasicMaterial({ color: '#fff1b7', transparent: true, opacity: .065, side: THREE.DoubleSide, depthWrite: false }));
    const lightRay = mesh(dynamic, geometry(new THREE.CylinderGeometry(1.8, .9, 9, 24, 1, true)), lightRayMat, 0, templeY + 6, -162); lightRay.rotation.z = -.18; lightRay.castShadow = false;
    for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
      const z = -174, x = side * (2.4 + i * 1.18); box(temple, stone, x, templeY + .75, z, .16, 1.5, .16); }
    for (const side of [-1, 1]) box(temple, stone, side * 7.2, templeY + 1.55, -174, 11, .22, .35);
    // Mediterranean cypresses at the terrace frame its distant silhouette.
    const cypressMat = material(new THREE.MeshStandardMaterial({ color: '#59735e', roughness: 1, flatShading: true }));
    for (const side of [-1, 1]) for (const z of [-140, -169]) { const x = side * 18; mesh(temple, geometry(new THREE.ConeGeometry(1.8, 10, 9)), cypressMat, x, groundHeight(x, z) + 5, z); mesh(temple, cylinder, wood, x, groundHeight(x, z) + 1, z, .25, 2, .25); }
    await checkpoint();

    // Smaller materials remain grouped by landmark; only animated objects keep individual meshes.
    for (const group of [coast, grove, temple, mountain, coastDetail, groveDetail, templeDetail]) batch(group);
    const setQuality = (value: GreekWorldQuality) => {
      quality = value;
      sun.castShadow = value !== 'low';
      const shadowSize = value === 'high' ? 2048 : 1024;
      sun.shadow.mapSize.set(shadowSize, shadowSize);
      foliageBatches.forEach(({ mesh: valueMesh, count }) => { valueMesh.count = Math.round(count * (value === 'low' ? .45 : value === 'medium' ? .78 : 1)); });
      artLayers.forEach(layer => layer.setQuality(value));
      lightRay.visible = value !== 'low';
    };
    setQuality(initialQuality);
    const setPuzzle = (rotations: readonly number[], solved: boolean) => {
      restored = solved;
      valvePointers.forEach((pointer, index) => { const direction = ((rotations[index] ?? 0) % 4 + 4) % 4; pointer.rotation.y = -direction * Math.PI / 2; valveFlows[index].visible = direction === VALVES[index].target; });
      springWater.visible = solved; fallingWater.visible = solved; spillWater.visible = solved; ascentFlow.visible = solved;
    };
    setPuzzle([1, 1, 0], false);
    const canWalk = (x: number, z: number, springRestored: boolean) => {
      if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 36 || z > 47 || z < -179) return false;
      if (z > -36 && x < -23 + Math.sin(z*.06)*3 + 3.5) return false;
      // A global pass boundary prevents bypassing closed gate through a cliff mesh.
      if (!springRestored && z < -100.1) return false;
      if (z < -99 && z > -105 && Math.abs(x) > 3.8) return false;
      if (colliders.some(collider => Math.hypot(x - collider.x, z - collider.z) < collider.radius + .26)) return false;
      if (walls.some(wall => x > wall.minX - .25 && x < wall.maxX + .25 && z > wall.minZ - .25 && z < wall.maxZ + .25)) return false;
      return true;
    };
    return {
      scene, spawn: { x: -9, z: 42, yaw: .15, pitch: -.045 }, groundHeight, canWalk, setQuality, setPuzzle, dispose,
      update(time, delta, position) {
        if (disposed) return;
        sky.position.copy(position);
        const target = restored ? 1 : 0; gateAmount += (target - gateAmount) * Math.min(1, delta * 1.3);
        gates[0].rotation.y = -gateAmount * Math.PI * .49; gates[1].rotation.y = gateAmount * Math.PI * .49;
        artLayers.forEach(layer => layer.update(time, position));
        coastDetail.visible = position.z > -70 && quality !== 'low';
        groveDetail.visible = position.z < 5 && position.z > -130 && quality !== 'low';
        templeDetail.visible = position.z < -83 && quality !== 'low';
        lightRayMat.opacity = .055 + Math.sin(time * .22) * .012;
        goldenFlowMat.opacity = .6 + Math.sin(time * 1.5) * .14;
      },
    };
  } catch (error) { dispose(); throw error; }
}
