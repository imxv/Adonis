import * as THREE from 'three';
import type { ArtLayer, ArtLayerOptions } from './artLayer';
import type { GreekWorldQuality } from './types';

/** Exact contacts for the independently authored trunks; crowns never block input. */
export const TREE_TRUNKS: readonly { x: number; z: number; radius: number }[] = [
  { x: 17, z: 27, radius: .7 }, { x: 27, z: 17, radius: .65 },
  { x: 18, z: 8, radius: .8 }, { x: 30, z: -3, radius: .62 },
  { x: 13, z: -12, radius: .7 }, { x: 24, z: -18, radius: .8 },
  { x: -13, z: -19, radius: .72 }, { x: -23, z: -28, radius: .65 },
  { x: 15, z: -31, radius: .8 }, { x: 27, z: -39, radius: .7 },
  { x: -11, z: -39, radius: .7 }, { x: -26, z: -46, radius: .72 },
  { x: 17, z: -49, radius: .8 }, { x: -19.2, z: -58, radius: 1.2 },
  { x: 28, z: -59, radius: .7 }, { x: 16, z: -63, radius: .7 },
  { x: -23, z: -69, radius: .8 }, { x: 25, z: -77, radius: .7 },
  { x: -14, z: -82, radius: .7 }, { x: 14, z: -87, radius: .68 },
  { x: -28, z: -84, radius: .64 }, { x: 30, z: -90, radius: .65 },
];

type Instance = { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; c: THREE.Color };
type ShapeBuffer = { vertices: number[]; indices: number[]; colors: number[]; uvs: number[] };
type GroundCluster = { x: number; z: number; radius: number; kind: 'coast' | 'grove' | 'flower'; shape?: readonly [number, number, number]; feature?: boolean };
type PlantZone = {
  root: THREE.Group; z: number; wood: ShapeBuffer; leaves: Instance[]; leafDetail: Instance[];
  shrubs: Instance[]; grasses: Instance[]; stems: Instance[]; red: Instance[]; cream: Instance[];
  lavender: Instance[]; gold: Instance[]; moss: Instance[]; pebbles: Instance[];
};
type LowLayout = {
  mesh: THREE.InstancedMesh; fullGeometry: THREE.BufferGeometry; lowGeometry: THREE.BufferGeometry;
  fullMatrices: Float32Array; fullColors: Float32Array; lowMatrices: Float32Array; lowColors: Float32Array;
  fullCount: number; lowCount: number; active: boolean;
};

/**
 * Original, hand-composed Mediterranean vegetation. No downloaded photography or models.
 * The API deliberately owns only art: contacts are exported for the environment to consume.
 */
export function createBotanicalLayer(options: ArtLayerOptions): ArtLayer {
  const root = new THREE.Group();
  root.name = 'botanical: authored coast and olive sanctuary';
  root.userData.trunks = TREE_TRUNKS;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const instances: THREE.InstancedMesh[] = [];
  const lowLayouts: LowLayout[] = [];
  const detailMeshes: { mesh: THREE.InstancedMesh; zone: PlantZone; kind: 'leaf' | 'ground' }[] = [];
  let quality = options.quality;
  let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true;
    instances.forEach(mesh => mesh.dispose()); geometries.forEach(g => g.dispose());
    materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    root.removeFromParent(); root.children.forEach(zone => zone.clear()); root.clear();
    instances.length = 0; detailMeshes.length = 0; lowLayouts.length = 0;
    geometries.clear(); materials.clear(); textures.clear();
  };
  try {
  const wind = { value: 0 };
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const geo = <T extends THREE.BufferGeometry>(g: T): T => { geometries.add(g); return g; };
  const mat = <T extends THREE.Material>(m: T): T => { materials.add(m); return m; };
  let seed = 3020149;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
  const range = (a: number, b: number) => a + rnd() * (b - a);
  const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const color = (hex: string, variance = .12) => new THREE.Color(hex).multiplyScalar(1 - variance / 2 + rnd() * variance);
  const rotation = (x = 0, y = rnd() * Math.PI * 2, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const shapeBuffer = (): ShapeBuffer => ({ vertices: [], indices: [], colors: [], uvs: [] });
  const zones: PlantZone[] = [
    { z: 30 }, { z: -3 }, { z: -32 }, { z: -59 }, { z: -84 },
  ].map(({ z }, index) => {
    const group = new THREE.Group(); group.name = `planting ${index}: ${index < 2 ? 'coast' : 'sanctuary'}`; root.add(group);
    return { root: group, z, wood: shapeBuffer(), leaves: [], leafDetail: [], shrubs: [], grasses: [], stems: [], red: [], cream: [], lavender: [], gold: [], moss: [], pebbles: [] };
  });
  const zoneAt = (z: number) => zones.reduce((a, b) => Math.abs(a.z - z) < Math.abs(b.z - z) ? a : b);
  const clearings = [
    { x: -14, z: 24, radius: 3.0 }, { x: 14, z: 4, radius: 3.05 },
    { x: -15, z: -58, radius: 2.85 }, { x: -7, z: -68, radius: 2.85 },
    { x: 0, z: -62, radius: 2.85 }, { x: 7, z: -68, radius: 2.85 },
    { x: 0, z: -75, radius: 5.1 },
  ];
  const trailX = (z: number) => {
    if (z > 16) { const t = THREE.MathUtils.clamp((z - 16) / 26, 0, 1); return -9 * t * t * (3 - 2 * t); }
    return z > 8 || z < -127 ? 0 : Math.sin((z + 21) / 25) * 3.6;
  };
  const spurs = [
    [[0, 29], [-8, 26], [-14, 24]], [[0, 9], [8, 5], [14, 4]],
    [[-3, -49], [-11, -54], [-15, -58]], [[-7, -68], [0, -62], [7, -68], [0, -75]],
  ];
  const distanceToSegment = (x: number, z: number, a: number[], b: number[]) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
    return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
  };
  const canPlant = (x: number, z: number, radius = .1) => {
    if (Math.abs(x - trailX(z)) < 2.15 + radius || z > 43 || z < -92 || (x < -20 && z > -20)) return false;
    if (spurs.some(spur => spur.some((a, i) => i < spur.length - 1 && distanceToSegment(x, z, a, spur[i + 1]) < 1.2 + radius))) return false;
    return clearings.every(c => Math.hypot(c.x - x, c.z - z) > c.radius + radius);
  };
  const add = (list: Instance[], p: THREE.Vector3, s: THREE.Vector3, c: THREE.Color, q = rotation()) => list.push({ p, s, c, q });

  // Tapered, fluted bark tubes. The trunk's longitudinal grooves are geometry, not a flat decal.
  const woodTube = (buffer: ShapeBuffer, points: THREE.Vector3[], bottom: number, top: number, bark: THREE.Color, fluting = .08, radial = 8, divisions = 9) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const frames = curve.computeFrenetFrames(divisions, false);
    const base = buffer.vertices.length / 3;
    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions, p = curve.getPointAt(t);
      const radius = THREE.MathUtils.lerp(bottom, top, Math.pow(t, .82));
      for (let j = 0; j <= radial; j++) {
        const angle = j / radial * Math.PI * 2;
        const groove = 1 + Math.sin(angle * 5 + t * 5) * fluting + Math.sin(angle * 3 - t * 8) * fluting * .65;
        const offset = frames.normals[i].clone().multiplyScalar(Math.cos(angle) * radius * groove)
          .addScaledVector(frames.binormals[i], Math.sin(angle) * radius * groove);
        buffer.vertices.push(p.x + offset.x, p.y + offset.y, p.z + offset.z);
        const shade = .86 + Math.sin(angle * 3 + t * 9) * .08 + Math.sin(angle * 7 - t * 3) * .07;
        buffer.colors.push(bark.r * shade, bark.g * shade, bark.b * shade);
        buffer.uvs.push(j / radial, t * 2);
        if (i < divisions && j < radial) {
          const a = base + i * (radial + 1) + j, b = a + radial + 1;
          buffer.indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    }
  };

  // A narrow, folded leaf: sixteen triangles with a raised midrib, never a canopy blob.
  const leafGeometry = geo(new THREE.BufferGeometry());
  const leafVertices: number[] = [], leafUvs: number[] = [], leafIndices: number[] = [];
  const widths = [.015, .31, .5, .35, 0];
  widths.forEach((width, i) => {
    const y = i / 4, bend = Math.sin(y * Math.PI) * .11;
    for (let j = -1; j <= 1; j++) {
      leafVertices.push(width * j, y, bend + (j === 0 ? .065 * Math.sin(y * Math.PI) : 0));
      leafUvs.push(.5 + width * j, y);
    }
    if (i < 4) for (let j = 0; j < 2; j++) {
      const a = i * 3 + j, b = a + 3; leafIndices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  });
  leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute(leafVertices, 3));
  leafGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(leafUvs, 2));
  leafGeometry.setIndex(leafIndices); leafGeometry.computeVertexNormals();

  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not paint botanical leaf texture');
  const gradient = context.createLinearGradient(20, 0, 226, 0);
  gradient.addColorStop(0, '#64775a'); gradient.addColorStop(.43, '#c4c9a5'); gradient.addColorStop(.52, '#d5dac0'); gradient.addColorStop(1, '#829672');
  context.fillStyle = gradient; context.fillRect(0, 0, 256, 512);
  // Broken dry-brush streaks and a fine pale midrib remain visible in close views.
  for (let i = 0; i < 280; i++) {
    context.strokeStyle = `rgba(${rnd() > .45 ? '238,239,201' : '49,73,41'},${range(.03, .12)})`;
    context.lineWidth = range(.5, 2.7); context.beginPath();
    const x = range(0, 256), y = range(0, 512); context.moveTo(x, y); context.lineTo(x + range(-4, 4), y + range(9, 57)); context.stroke();
  }
  context.strokeStyle = '#d7ddc2'; context.lineWidth = 2.2; context.beginPath(); context.moveTo(128, 0); context.quadraticCurveTo(125, 280, 128, 512); context.stroke();
  context.strokeStyle = 'rgba(224,231,199,.34)'; context.lineWidth = .9;
  for (let i = 20; i < 490; i += 32) { context.beginPath(); context.moveTo(128, i); context.lineTo(10, i + 62); context.moveTo(128, i); context.lineTo(242, i + 62); context.stroke(); }
  const leafTexture = new THREE.CanvasTexture(canvas); leafTexture.colorSpace = THREE.SRGBColorSpace; leafTexture.anisotropy = 4; textures.add(leafTexture);
  const barkMat = mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, color: '#c2b59c' }));
  const leafMat = mat(new THREE.MeshStandardMaterial({ map: leafTexture, side: THREE.DoubleSide, roughness: .94, color: '#dce2c9' }));
  const shrubMat = mat(new THREE.MeshStandardMaterial({ map: leafTexture, side: THREE.DoubleSide, roughness: 1, color: '#d2ddba' }));
  const grassMat = mat(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 1, color: '#b4b78a' }));
  const stemMat = mat(new THREE.MeshStandardMaterial({ color: '#657746', roughness: 1 }));
  const petalMat = mat(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .95, color: '#ffffff' }));
  const mossMat = mat(new THREE.MeshStandardMaterial({ color: '#788954', roughness: 1 }));
  const pebbleMat = mat(new THREE.MeshStandardMaterial({ color: '#cbc3a8', roughness: 1, flatShading: false }));
  const animate = (material: THREE.MeshStandardMaterial, amount: number) => {
    material.onBeforeCompile = shader => {
      shader.uniforms.botanicalTime = wind;
      shader.vertexShader = `uniform float botanicalTime;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat phase=botanicalTime*.55+instanceMatrix[3].x*.31+instanceMatrix[3].z*.19;\ntransformed.x+=sin(phase+position.y*2.)*${amount.toFixed(4)}*position.y*position.y;\n#endif`);
    };
    material.customProgramCacheKey = () => `botanical-wind-${amount}`;
  };
  animate(leafMat, .024); animate(shrubMat, .035); animate(grassMat, .085);

  // Every tree follows a different, broadly spreading branching skeleton. Leaf pairs follow twigs.
  TREE_TRUNKS.forEach((tree, index) => {
    const zone = zoneAt(tree.z), ancient = index === 13;
    const overhanging = index === 10 || index === 18;
    const broadCrown = ancient || overhanging;
    const scale = ancient ? 1.36 : range(.85, 1.13), yaw = range(0, Math.PI * 2);
    const baseY = options.groundHeight(tree.x, tree.z) - .04;
    const transform = (x: number, y: number, z: number) => {
      const crown = THREE.MathUtils.smoothstep(y, 1.5, 3.4);
      const spread = scale * (1 + crown * (broadCrown ? .5 : .16));
      return point(tree.x + (x * Math.cos(yaw) + z * Math.sin(yaw)) * spread,
        baseY + y * scale * (broadCrown ? 1.13 : 1.06),
        tree.z + (z * Math.cos(yaw) - x * Math.sin(yaw)) * spread);
    };
    const bark = color(ancient ? '#8e8774' : '#aba18a', .16);
    const trunk = [transform(0, 0, 0), transform(.22, .75, -.15), transform(-.18, 1.6, .18), transform(.25, 2.35, .05), transform(.17, 3.15, -.14)];
    woodTube(zone.wood, trunk, (ancient ? .7 : .43) * scale, .18 * scale, bark, .19, ancient ? 16 : 12, 16);
    // Several braided buttresses and long surface roots distinguish the oath tree.
    for (let r = 0; r < (ancient ? 8 : 5); r++) {
      const a = r * 2.4 + yaw, reach = (ancient ? 2.2 : 1.15) * range(.85, 1.2);
      const rootEnd = transform(Math.cos(a) * reach, .02, Math.sin(a) * reach);
      rootEnd.y = options.groundHeight(rootEnd.x, rootEnd.z) + .04;
      woodTube(zone.wood, [transform(Math.cos(a) * .17, 1.22, Math.sin(a) * .17), transform(Math.cos(a) * .4, .26, Math.sin(a) * .4), rootEnd], .2 * scale, .025, bark, .14, 7, 7);
    }
    for (let arm = 0; arm < 7; arm++) {
      const a = arm / 7 * Math.PI * 2 + range(-.24, .24), spread = range(1.9, 3.35), rise = range(3.0, 4.8);
      const start = transform(.08, 1.55 + arm % 3 * .36, 0);
      const elbow = transform(Math.cos(a) * spread * .48, rise * .72, Math.sin(a) * spread * .48);
      const end = transform(Math.cos(a) * spread, rise, Math.sin(a) * spread);
      woodTube(zone.wood, [start, elbow, end], .19 * scale, .045 * scale, bark, .12, 8, 9);
      for (let shoot = 0; shoot < (broadCrown ? 6 : 4); shoot++) {
        const t = .24 + shoot * (broadCrown ? .14 : .21), aa = a + range(-.95, .95);
        const origin = elbow.clone().lerp(end, Math.max(0, (t - .4) / .6));
        const shootEnd = origin.clone().add(point(Math.cos(aa) * range(.7, 1.55) * scale, range(.2, .95) * scale, Math.sin(aa) * range(.7, 1.55) * scale));
        woodTube(zone.wood, [origin, origin.clone().lerp(shootEnd, .55).add(point(0, .15, 0)), shootEnd], .055 * scale, .014 * scale, bark, .05, 5, 5);
        for (let twig = 0; twig < (broadCrown ? 6 : 4); twig++) {
          const tt = .16 + twig * (broadCrown ? .16 : .24), twigStart = origin.clone().lerp(shootEnd, tt);
          const ta = aa + (twig % 2 ? -1 : 1) * range(.45, 1.1);
          const twigEnd = twigStart.clone().add(point(Math.cos(ta) * range(.45, .8) * scale, range(.14, .5) * scale, Math.sin(ta) * range(.45, .8) * scale));
          woodTube(zone.wood, [twigStart, twigEnd], .014 * scale, .0035 * scale, bark, 0, 4, 2);
          const twigDirection = twigEnd.clone().sub(twigStart).normalize();
          for (let pair = 0; pair < (broadCrown ? 8 : 7); pair++) for (const side of [-1, 1]) {
            const fraction = .1 + pair * (broadCrown ? .12 : .135);
            const p = twigStart.clone().lerp(twigEnd, fraction).add(point(-Math.sin(ta) * side * .06, range(-.035, .04), Math.cos(ta) * side * .06));
            const baseLength = range(.26, .38) * scale;
            const length = baseLength * (broadCrown ? 1.22 : 1.15), width = baseLength * range(.25, .34) * (broadCrown ? 1.55 : 1.45);
            const direction = point(-Math.sin(ta) * side * .85 + twigDirection.x * .22, range(-.3, .55), Math.cos(ta) * side * .85 + twigDirection.z * .22).normalize();
            const q = new THREE.Quaternion().setFromUnitVectors(up, direction).multiply(rotation(0, range(0, Math.PI * 2), 0));
            const list = (pair + twig + arm) % 5 === 0 ? zone.leafDetail : zone.leaves;
            add(list, p, point(width, length, length * .5), color(rnd() > .79 ? '#cbd2b1' : '#b1bd94', .2), q);
          }
        }
      }
    }
    if (overhanging) {
      // Two generous, visibly supported boughs reach over the walk at head-clear height.
      // Their drooping sprays overlap in layers; no opaque sphere is used as a crown.
      const targetZ = tree.z + (index === 10 ? -3 : 4.5), targetX = trailX(targetZ) - .5;
      const start = point(tree.x, baseY + 2.3, tree.z);
      const elbow = point(THREE.MathUtils.lerp(tree.x, targetX, .47), baseY + 4.8, THREE.MathUtils.lerp(tree.z, targetZ, .47));
      const end = point(targetX, baseY + 4.7, targetZ);
      const arch = new THREE.CatmullRomCurve3([start, elbow, end]);
      woodTube(zone.wood, [start, elbow, end], .23 * scale, .06, bark, .11, 10, 16);
      for (let spray = 0; spray < 24; spray++) {
        const t = .38 + spray / 24 * .62, side = spray % 2 ? -1 : 1;
        const origin = arch.getPoint(t), angle = Math.atan2(end.z - start.z, end.x - start.x) + side * range(.6, 1.4);
        const tip = origin.clone().add(point(Math.cos(angle) * range(1.05, 2.0), range(-.35, .42), Math.sin(angle) * range(1.05, 2.0)));
        tip.y = Math.max(tip.y, options.groundHeight(tip.x, tip.z) + 3.5);
        woodTube(zone.wood, [origin, origin.clone().lerp(tip, .55).add(point(0, .16, 0)), tip], .045, .009, bark, .04, 5, 5);
        for (let twig = 0; twig < 6; twig++) {
          const from = origin.clone().lerp(tip, .14 + twig * .15), ta = angle + (twig % 2 ? -1 : 1) * range(.6, 1.25);
          const to = from.clone().add(point(Math.cos(ta) * range(.6, .95), range(-.28, .3), Math.sin(ta) * range(.6, .95)));
          to.y = Math.max(to.y, options.groundHeight(to.x, to.z) + 3.35);
          woodTube(zone.wood, [from, to], .011, .003, bark, 0, 4, 2);
          for (let pair = 0; pair < 9; pair++) for (const leafSide of [-1, 1]) {
            const p = from.clone().lerp(to, .08 + pair * .105);
            const length = range(.36, .49), direction = point(-Math.sin(ta) * leafSide, range(-.28, .5), Math.cos(ta) * leafSide).normalize();
            const q = new THREE.Quaternion().setFromUnitVectors(up, direction).multiply(rotation(0, rnd() * Math.PI * 2, 0));
            add(pair % 6 === 0 ? zone.leafDetail : zone.leaves, p, point(length * range(.34, .42), length, length * .5), color(rnd() > .74 ? '#d1d7b9' : '#b0bd92', .18), q);
          }
        }
      }
    }
    // Small dark olives read as punctuation among the silver leaves, never oversized fruit.
    for (let i = 0; i < 15; i++) {
      const a = rnd() * Math.PI * 2, radius = range(1.5, 2.5);
      add(zone.pebbles, transform(Math.cos(a) * radius, range(3.2, 4.1), Math.sin(a) * radius), point(.042, .065, .042), color('#444c38', .1));
    }
  });

  // Compose clusters asymmetrically: flowers accent the route while taller shrubs retreat from it.
  const clusters: GroundCluster[] = [
    { x: -7.2, z: 38, radius: 2.3, kind: 'coast' }, { x: 7.9, z: 36, radius: 2.3, kind: 'flower' },
    { x: -16, z: 34, radius: 2.5, kind: 'coast' }, { x: 12, z: 27, radius: 3.2, kind: 'coast' },
    { x: 23, z: 31, radius: 3.3, kind: 'coast' }, { x: -8.2, z: 21, radius: 2.3, kind: 'flower' },
    { x: 6.8, z: 19, radius: 2.2, kind: 'coast' }, { x: -17, z: 14, radius: 2.4, kind: 'coast' },
    { x: 24, z: 10, radius: 3.0, kind: 'coast' }, { x: -8, z: 4, radius: 2.4, kind: 'coast' },
    { x: 8, z: -4, radius: 2.6, kind: 'flower' }, { x: 20, z: -9, radius: 3.2, kind: 'coast' },
    { x: -10, z: -12, radius: 2.5, kind: 'flower' }, { x: -18, z: -20, radius: 3.0, kind: 'grove' },
    { x: 8, z: -22, radius: 2.4, kind: 'grove' }, { x: 28, z: -27, radius: 3.8, kind: 'grove' },
    { x: -7, z: -31, radius: 2.3, kind: 'flower' }, { x: 10, z: -35, radius: 2.7, kind: 'grove' },
    { x: -21, z: -37, radius: 3.4, kind: 'grove' }, { x: 22, z: -43, radius: 3.2, kind: 'grove' },
    { x: -7, z: -46, radius: 2.1, kind: 'grove' }, { x: 9, z: -50, radius: 2.8, kind: 'flower' },
    { x: -23, z: -55, radius: 2.8, kind: 'flower' }, { x: -12, z: -52, radius: 1.6, kind: 'grove' },
    { x: 22, z: -59, radius: 3.6, kind: 'grove' }, { x: -11, z: -64, radius: 1.2, kind: 'flower' },
    { x: 11, z: -69, radius: 1.1, kind: 'flower' }, { x: -16, z: -73, radius: 3.4, kind: 'grove' },
    { x: 14, z: -78, radius: 2.8, kind: 'grove' }, { x: -23, z: -84, radius: 3.8, kind: 'grove' },
    { x: 7, z: -87, radius: 2, kind: 'flower' },
    { x: -9, z: -54, radius: 3.6, kind: 'grove', shape: [3.7, 5.2, -.52], feature: true },
    { x: 10, z: -55, radius: 3.9, kind: 'grove', shape: [4.4, 3.4, .35], feature: true },
    { x: -11, z: -71, radius: 3.8, kind: 'grove', shape: [3.8, 4.7, -.62], feature: true },
    { x: 11, z: -77, radius: 3.7, kind: 'grove', shape: [4.4, 3.2, .42], feature: true },
  ];
  const plantStem = (zone: PlantZone, base: THREE.Vector3, height: number, lean: number, yaw: number) => {
    const top = base.clone().add(point(Math.cos(yaw) * lean, height, Math.sin(yaw) * lean));
    const q = new THREE.Quaternion().setFromUnitVectors(up, top.clone().sub(base).normalize());
    add(zone.stems, base.clone().lerp(top, .5), point(.008, base.distanceTo(top), .008), color('#718450'), q);
    return top;
  };
  clusters.forEach((cluster, clusterIndex) => {
    const zone = zoneAt(cluster.z), grove = cluster.kind === 'grove', flowerBed = cluster.kind === 'flower';
    const sample = (spread = 1) => {
      const angle = range(0, Math.PI * 2), r = Math.sqrt(rnd()) * spread;
      const [rx, rz, yaw] = cluster.shape ?? [cluster.radius, cluster.radius, 0];
      const edge = cluster.feature ? .88 + Math.sin(angle * 3 + clusterIndex) * .12 + Math.cos(angle * 2) * .07 : 1;
      const u = Math.cos(angle) * r * rx * edge, v = Math.sin(angle) * r * rz * edge;
      return { x: cluster.x + u * Math.cos(yaw) + v * Math.sin(yaw), z: cluster.z + v * Math.cos(yaw) - u * Math.sin(yaw),
        layer: THREE.MathUtils.clamp(.5 - v / (rz * 2), 0, 1), angle };
    };
    // Each patch has interior woody herb tufts, an irregular grass skirt and scattered flower stems.
    for (let bush = 0; bush < (cluster.feature ? 34 : grove ? 11 : 8); bush++) {
      const { x, z, layer } = sample(.78);
      if (!canPlant(x, z, cluster.feature ? .65 : .45)) continue;
      const y = options.groundHeight(x, z), bushHeight = range(.3, grove ? .85 : .68) * (cluster.feature ? .78 + layer * .85 : 1);
      const stems = cluster.feature ? 14 : 9, levels = cluster.feature ? 8 : 5;
      for (let stem = 0; stem < stems; stem++) {
        const a = stem / stems * Math.PI * 2 + range(-.3, .3), spread = range(.12, cluster.feature ? .5 : .37);
        const base = point(x + range(-.08, .08), y, z + range(-.08, .08));
        const top = plantStem(zone, base, bushHeight * range(.75, 1.05), spread, a);
        for (let level = 0; level < levels; level++) for (const side of [-1, 1]) {
          const p = base.clone().lerp(top, .16 + level * .78 / levels);
          const leafAngle = a + side * .8 + level * .37;
          const direction = point(Math.cos(leafAngle), range(.1, .65), Math.sin(leafAngle)).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(up, direction).multiply(rotation(0, rnd() * 3, 0));
          const length = grove ? range(.11, .19) : range(.1, .16);
          const leafWidth = cluster.feature ? bush % 3 ? .28 : .48 : grove ? .36 : .18;
          add(zone.shrubs, p, point(length * leafWidth, length, length * .7), color(grove ? '#93a97a' : '#9aac96', .22), q);
        }
        if ((!grove || cluster.feature) && stem % 3 === 0) for (let flower = 0; flower < 4; flower++) {
          const p = top.clone().add(point(range(-.02, .02), -flower * .038, range(-.02, .02)));
          add(zone.lavender, p, point(.03, .045, .03), color('#a68ba8', .17));
        }
      }
    }
    for (let grass = 0; grass < (cluster.feature ? 430 : grove ? 140 : 108); grass++) {
      const { x, z, angle: a } = sample(range(.8, 1.15));
      if (!canPlant(x, z)) continue;
      const height = range(.18, grove ? .62 : .49), y = options.groundHeight(x, z) + .018;
      for (let blade = 0; blade < 4; blade++) {
        const bladeHeight = height * range(.65, 1.16);
        add(zone.grasses, point(x + range(-.055, .055), y, z + range(-.055, .055)),
          point(range(.018, .042), bladeHeight, bladeHeight * range(.5, .82)),
          color(grove ? '#7f965c' : '#a3a46f', .3),
          rotation(range(-.2, .2), a + blade * 2.4, range(-.35, .35)));
      }
      if (grass % 9 === 0) {
        const top = plantStem(zone, point(x, y, z), height * 1.75, .1, a);
        for (let seedHead = 0; seedHead < 5; seedHead++) add(zone.gold, top.clone().add(point(0, seedHead * .025, 0)), point(.018, .045, .018), color('#c8bb80', .17));
      }
    }
    const flowerCount = cluster.feature ? 158 : flowerBed ? 52 : grove ? 19 : 25;
    for (let flower = 0; flower < flowerCount; flower++) {
      const { x, z, layer, angle: a } = sample(.86);
      if (!canPlant(x, z, .05)) continue;
      const top = plantStem(zone, point(x, options.groundHeight(x, z), z), range(.25, cluster.feature ? .42 + layer * .34 : flowerBed ? .65 : .46), range(.015, .12), a);
      const red = cluster.feature ? flower % 5 < 2 : (clusterIndex % 4 === 0 || clusterIndex % 5 === 0) && flower % 3 !== 0;
      const blossom = red ? zone.red : zone.cream, petalSize = red ? range(.045, .067) : range(.035, .052);
      const tilt = rotation(range(-.3, .3), a, range(-.3, .3));
      for (let petal = 0; petal < (red ? 5 : 7); petal++) {
        const pa = petal / (red ? 5 : 7) * Math.PI * 2;
        const offset = point(Math.cos(pa) * petalSize * .68, 0, Math.sin(pa) * petalSize * .68).applyQuaternion(tilt);
        const q = rotation(-Math.PI / 2 + range(-.24, .24), 0, pa).premultiply(tilt);
        add(blossom, top.clone().add(offset), point(petalSize * .9, petalSize * 1.3, petalSize), color(red ? '#ba3f43' : '#efe7cd', .12), q);
      }
      add(zone.gold, top.clone().add(point(0, .014, 0)), point(.027, .018, .027), color(red ? '#594e32' : '#d7b364', .08));
    }
    for (let piece = 0; piece < (cluster.feature ? 76 : grove ? 21 : 12); piece++) {
      const { x, z } = sample();
      if (!canPlant(x, z, .15)) continue;
      const size = range(.08, .26), y = options.groundHeight(x, z);
      add(grove ? zone.moss : zone.pebbles, point(x, y + size * .08, z), point(size * 1.7, size * .34, size), color(grove ? '#74894d' : '#c4b79a', .24));
    }
  });

  // Low moss pillows beside the old sacred steps: gaps remain open and no art becomes a collider.
  for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 18; i++) {
    const z = -42 - i * 1.6, x = trailX(z) + side * range(2.35, 2.9);
    if (!canPlant(x, z, .1)) continue;
    add(zoneAt(z).moss, point(x, options.groundHeight(x, z) + .018, z), point(range(.22, .48), .035, range(.16, .34)), color('#697e49', .2));
  }

  const grassGeometry = geo(new THREE.BufferGeometry());
  grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, -.3, .52, .13, .3, .52, .13, 0, 1, .39], 3));
  grassGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, .2, .52, .8, .52, .5, 1], 2));
  grassGeometry.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]); grassGeometry.computeVertexNormals();
  const stemGeometry = geo(new THREE.CylinderGeometry(1, 1, 1, 4, 1));
  const petalGeometry = geo(new THREE.CircleGeometry(1, 7));
  const budGeometry = geo(new THREE.SphereGeometry(1, 5, 4));
  const pebbleGeometry = geo(new THREE.SphereGeometry(1, 7, 4));
  // Low uses eight-triangle broad folded leaves. The full-quality geometry is never edited.
  const lowLeafGeometry = geo(new THREE.BufferGeometry());
  lowLeafGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.015, 0, 0, 0, 0, 0, .015, 0, 0,
    -.62, .5, .09, 0, .5, .155, .62, .5, .09,
    0, 1, 0, 0, 1, 0, 0, 1, 0,
  ], 3));
  lowLeafGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    .485, 0, .5, 0, .515, 0, 0, .5, .5, .5, 1, .5, .5, 1, .5, 1, .5, 1,
  ], 2));
  lowLeafGeometry.setIndex([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5, 3, 6, 4, 4, 6, 7, 4, 7, 5, 5, 7, 8]);
  lowLeafGeometry.computeVertexNormals();
  const lowStemGeometry = geo(new THREE.CylinderGeometry(1, 1, 1, 3, 1, true));
  const lowPetalGeometry = geo(new THREE.CircleGeometry(1, 4));
  const lowBudGeometry = geo(new THREE.OctahedronGeometry(1));
  const makeInstances = (zone: PlantZone, geometry: THREE.BufferGeometry, material: THREE.Material, list: Instance[], name: string, detail?: 'leaf' | 'ground') => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, list.length); mesh.name = name;
    list.forEach((item, index) => { dummy.position.copy(item.p); dummy.quaternion.copy(item.q); dummy.scale.copy(item.s); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); mesh.setColorAt(index, item.c); });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); mesh.castShadow = name.includes('olive'); mesh.receiveShadow = true;
    mesh.userData.instances = list.length; zone.root.add(mesh); instances.push(mesh);
    if (detail) detailMeshes.push({ mesh, zone, kind: detail });
    // Stratified sampling spans the entire original sequence, retaining every tree and planting
    // island instead of keeping a prefix of nearby branches. Larger leaves preserve crown area.
    const low = geometry === leafGeometry
      ? { geometry: lowLeafGeometry, fraction: material === leafMat ? .28 : .18, scale: material === leafMat ? [1.85, 1.65, 1.4] : [2, 1.6, 1.3] }
      : geometry === grassGeometry ? { geometry, fraction: .2, scale: [1.7, 1.05, 1.2] }
      : geometry === stemGeometry ? { geometry: lowStemGeometry, fraction: 1, scale: [1, 1, 1] }
      : geometry === petalGeometry ? { geometry: lowPetalGeometry, fraction: 1, scale: [1, 1, 1] }
      : geometry === budGeometry ? { geometry: lowBudGeometry, fraction: detail === 'ground' ? .3 : 1, scale: [1.15, 1, 1.15] }
      : { geometry: lowBudGeometry, fraction: .4, scale: [1.2, 1, 1.2] };
    const fullMatrices = new Float32Array(mesh.instanceMatrix.array);
    const fullColors = new Float32Array(mesh.instanceColor!.array);
    const lowCount = Math.max(1, Math.ceil(list.length * low.fraction));
    const lowMatrices = new Float32Array(lowCount * 16), lowColors = new Float32Array(lowCount * 3);
    for (let i = 0; i < lowCount; i++) {
      // This deterministic jitter is independent of the artwork RNG: medium/high stay identical.
      const jitter = ((Math.imul(i + 1, 1103515245) + 12345) >>> 0) / 4294967296;
      const source = Math.min(list.length - 1, Math.floor((i + .15 + jitter * .7) * list.length / lowCount));
      lowMatrices.set(fullMatrices.subarray(source * 16, source * 16 + 16), i * 16);
      lowColors.set(fullColors.subarray(source * 3, source * 3 + 3), i * 3);
      for (let axis = 0; axis < 3; axis++) for (let component = 0; component < 3; component++) lowMatrices[i * 16 + axis * 4 + component] *= low.scale[axis];
    }
    lowLayouts.push({ mesh, fullGeometry: geometry, lowGeometry: low.geometry, fullMatrices, fullColors, lowMatrices, lowColors, fullCount: list.length, lowCount, active: false });
  };
  zones.forEach(zone => {
    if (zone.wood.vertices.length) {
      const geometry = geo(new THREE.BufferGeometry());
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(zone.wood.vertices, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(zone.wood.colors, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(zone.wood.uvs, 2)); geometry.setIndex(zone.wood.indices); geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, barkMat); mesh.name = 'braided olive bark, roots and branches'; mesh.castShadow = true; mesh.receiveShadow = true; zone.root.add(mesh);
    }
    makeInstances(zone, leafGeometry, leafMat, zone.leaves, 'olive silver leaf pairs');
    makeInstances(zone, leafGeometry, leafMat, zone.leafDetail, 'olive twig tip leaves', 'leaf');
    makeInstances(zone, leafGeometry, shrubMat, zone.shrubs, 'rosemary and myrtle small leaves');
    makeInstances(zone, grassGeometry, grassMat, zone.grasses, 'irregular bent grass ribbons');
    makeInstances(zone, stemGeometry, stemMat, zone.stems, 'herb and wildflower stems');
    makeInstances(zone, petalGeometry, petalMat, zone.red, 'poppy crimson petals');
    makeInstances(zone, petalGeometry, petalMat, zone.cream, 'anemone ivory petals');
    makeInstances(zone, budGeometry, petalMat, zone.lavender, 'rosemary lavender buds', 'ground');
    makeInstances(zone, budGeometry, petalMat, zone.gold, 'flower hearts and straw seed heads');
    makeInstances(zone, pebbleGeometry, mossMat, zone.moss, 'moss in limestone joints');
    makeInstances(zone, pebbleGeometry, pebbleMat, zone.pebbles, 'root limestone and olive fruit');
  });
  root.userData.budget = {
    trees: TREE_TRUNKS.length,
    overhangingTrees: 2, authoredFlowerBeds: 4,
    oliveLeaves: zones.reduce((sum, z) => sum + z.leaves.length + z.leafDetail.length, 0),
    shrubLeaves: zones.reduce((sum, z) => sum + z.shrubs.length, 0),
    grassBlades: zones.reduce((sum, z) => sum + z.grasses.length, 0),
    instancedDraws: instances.length, textures: 1, texturePixels: canvas.width * canvas.height,
    trunkTriangles: zones.reduce((sum, z) => sum + z.wood.indices.length / 3, 0),
  };
  const triangleCount = (geometry: THREE.BufferGeometry) => (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
  root.userData.budget.lowTriangles = root.userData.budget.trunkTriangles + lowLayouts.reduce((sum, item) => sum + triangleCount(item.lowGeometry) * item.lowCount, 0);
  root.userData.budget.lowInstances = lowLayouts.reduce((sum, item) => sum + item.lowCount, 0);
  // Release constructor-only arrays; GPU buffers/instance attributes are the retained art data.
  zones.forEach(z => { z.wood = shapeBuffer(); z.leaves = []; z.leafDetail = []; z.shrubs = []; z.grasses = []; z.stems = []; z.red = []; z.cream = []; z.lavender = []; z.gold = []; z.moss = []; z.pebbles = []; });
  let lastPosition = point(0, 0, 40);
  const applyQuality = () => {
    for (const layout of lowLayouts) {
      const low = quality === 'low';
      if (layout.active === low) continue;
      // Reuse the same uploaded attributes. Swapping attributes would orphan GPU buffers on
      // repeated quality changes; retained CPU snapshots restore all original values exactly.
      layout.mesh.instanceMatrix.array.set(low ? layout.lowMatrices : layout.fullMatrices);
      layout.mesh.instanceColor!.array.set(low ? layout.lowColors : layout.fullColors);
      layout.mesh.instanceMatrix.needsUpdate = true; layout.mesh.instanceColor!.needsUpdate = true;
      layout.mesh.geometry = low ? layout.lowGeometry : layout.fullGeometry;
      layout.mesh.count = low ? layout.lowCount : layout.fullCount;
      layout.mesh.computeBoundingSphere(); layout.active = low;
    }
    detailMeshes.forEach(({ mesh, zone, kind }) => {
      const distance = Math.abs(lastPosition.z - zone.z);
      mesh.visible = quality === 'high' || distance < (kind === 'leaf' ? quality === 'low' ? 28 : 68 : quality === 'low' ? 24 : 52);
    });
    instances.forEach(mesh => { mesh.castShadow = quality !== 'low' && mesh.name.includes('olive'); });
  };
  applyQuality();
  return {
    root,
    setQuality(value: GreekWorldQuality) { if (disposed) return; quality = value; applyQuality(); },
    update(time: number, position: THREE.Vector3) {
      if (disposed) return; wind.value = time;
      if (lastPosition.distanceToSquared(position) > 16) { lastPosition.copy(position); applyQuality(); }
      // The five planting strips remain independent culling units. Main silhouettes stay visible.
      zones.forEach(zone => { zone.root.visible = Math.abs(position.z - zone.z) < (quality === 'low' ? 125 : 180); });
    },
    dispose,
  };
  } catch (error) { dispose(); throw error; }
}
