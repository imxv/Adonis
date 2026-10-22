import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAntiqueTextures } from './antiqueTextures';
import type { ArtLayer, ArtLayerOptions } from './artLayer';
import type { GreekWorldQuality } from './types';

/** Original sculpted coastal ruins and sanctuary details. Owns every resource it creates. */
export function createAntiquitiesLayer(options: ArtLayerOptions): ArtLayer {
  const root = new THREE.Group();
  root.name = 'antiquities: coastal portico, tide frame, olive sanctuary';
  const colliders: { x: number; z: number; radius: number }[] = [];
  root.userData.colliders = colliders;
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  let paintingAssets: ReturnType<typeof createAntiqueTextures> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true; root.removeFromParent(); root.clear();
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); paintingAssets?.dispose();
    geometries.clear(); materials.clear(); colliders.length = 0;
  };
  // Construction of textures, materials and even shared primitive geometries can
  // fail. The same owner covers the full constructor and the mounted lifecycle.
  try {
    const paintings = createAntiqueTextures();
    paintingAssets = paintings;
    const geo = <T extends THREE.BufferGeometry>(g: T): T => { geometries.add(g); return g; };
    const mat = (color: string, map?: THREE.Texture, metalness = 0) => {
      const m = new THREE.MeshStandardMaterial({ color, ...(map ? { map } : {}), metalness, roughness: metalness ? .64 : .92 }); materials.add(m); return m;
    };
    const stone = mat('#d4cfb6', paintings.stone), pale = mat('#e1d9ba', paintings.stone);
    const shadow = mat('#7c8b83', paintings.stone), dark = mat('#4a5e58'), blue = mat('#376d79');
    const gold = mat('#b9a064', undefined, .48), bronze = mat('#657b70', undefined, .48);
    const red = mat('#ead1ac', paintings.redPottery), glaze = mat('#cad6c4', paintings.bluePottery);
    const clay = mat('#b16e4b', paintings.stone), black = mat('#302f2a');
    const zone = (name: string) => { const g = new THREE.Group(); g.name = name; root.add(g); return g; };
    const coast = zone('portico and coastal offerings'), coastFine = zone('coast small carvings');
    const mural = zone('tide mural frame'), grove = zone('sanctuary masonry'), groveFine = zone('sanctuary small carvings');
    let quality = options.quality;
    let seed = 93319;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
    const unitBox = geo(new THREE.BoxGeometry(1, 1, 1));
    const sphere = geo(new THREE.SphereGeometry(1, 14, 10));
    const unitCylinder = geo(new THREE.CylinderGeometry(1, 1, 1, 40));
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, -.5); leafShape.bezierCurveTo(-.36, -.18, -.36, .18, 0, .5); leafShape.bezierCurveTo(.36, .18, .36, -.18, 0, -.5);
    const leafGeo = geo(new THREE.ExtrudeGeometry(leafShape, { depth: .035, steps: 1, bevelEnabled: true, bevelThickness: .012, bevelSize: .016, bevelSegments: 1, curveSegments: 5 }));
    const mesh = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
      const item = new THREE.Mesh(g, m); item.position.set(x, y, z); item.scale.set(sx, sy, sz); item.castShadow = item.receiveShadow = true; parent.add(item); return item;
    };
    const box = (p: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0) => {
      const value = mesh(p, unitBox, m, x, y, z, w, h, d); value.rotation.y = yaw; return value;
    };
    const cylinder = (p: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, r: number, h: number) => mesh(p, unitCylinder, m, x, y, z, r, h, r);
    const bead = (p: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => mesh(p, sphere, m, x, y, z, sx, sy, sz);
    const tube = (p: THREE.Object3D, points: THREE.Vector3[], radius: number, m: THREE.Material, segments = 22) => mesh(p, geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 5, false)), m, 0, 0, 0);
    const ring = (p: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, r: number, thickness: number, vertical = false) => {
      const value = mesh(p, geo(new THREE.TorusGeometry(r, thickness, 6, 48)), m, x, y, z); if (!vertical) value.rotation.x = -Math.PI / 2; return value;
    };
    // Deliberate broken corners and bevel catches are actual silhouette geometry.
    const cutStone = (p: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0, wear = .08) => {
      const c = Math.min(w, h) * wear, s = new THREE.Shape();
      s.moveTo(-w / 2 + c * .7, -h / 2); s.lineTo(w / 2 - c, -h / 2); s.lineTo(w / 2, -h / 2 + c * .5);
      s.lineTo(w / 2, h / 2 - c); s.lineTo(w / 2 - c * 1.3, h / 2); s.lineTo(-w / 2 + c * .5, h / 2);
      s.lineTo(-w / 2, h / 2 - c * .7); s.lineTo(-w / 2, -h / 2 + c); s.closePath();
      const g = geo(new THREE.ExtrudeGeometry(s, { depth: d - .04, bevelEnabled: true, bevelThickness: .02, bevelSize: .025, bevelSegments: 1, curveSegments: 1 }));
      g.translate(0, 0, -d / 2 + .02); const value = mesh(p, g, m, x, y, z); value.rotation.y = yaw; return value;
    };
    const lathe = (p: THREE.Object3D, m: THREE.Material, profile: number[][], x: number, y: number, z: number, segments = 40) => mesh(p, geo(new THREE.LatheGeometry(profile.map(v => new THREE.Vector2(v[0], v[1])), segments)), m, x, y, z);
    const carvedLeaf = (p: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, size: number, angle: number, yaw = 0) => {
      const value = mesh(p, leafGeo, m, x, y, z, size * .6, size, size); value.rotation.set(0, yaw, angle); return value;
    };
    const wreath = (p: THREE.Object3D, x: number, y: number, z: number, r: number, m: THREE.Material, yaw = 0) => {
      const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = yaw; p.add(group);
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) { const a = -.8 + i / 24 * 4.75; points.push(new THREE.Vector3(Math.sin(a) * r, -Math.cos(a) * r, 0)); }
      tube(group, points, .018, m, 28);
      for (let i = 0; i < 20; i++) { const a = -.7 + i / 19 * 4.55; carvedLeaf(group, m, Math.sin(a) * r, -Math.cos(a) * r, .025, r * .44, -a + (i % 2 ? .75 : -.75)); }
    };
    const greekKey = (p: THREE.Object3D, x: number, y: number, z: number, width: number, count: number, m: THREE.Material, yaw = 0) => {
      const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = yaw; p.add(group);
      const size = width / count, thickness = size * .065;
      for (let i = 0; i < count; i++) {
        const a = -width / 2 + i * size;
        // The short inner return creates a recognisable, continuous Greek meander.
        const segments = [[a, 0, a + size * .86, 0], [a + size * .86, 0, a + size * .86, size * .7], [a + size * .86, size * .7, a + size * .23, size * .7], [a + size * .23, size * .7, a + size * .23, size * .25], [a + size * .23, size * .25, a + size * .59, size * .25], [a + size * .59, size * .25, a + size * .59, size * .48]];
        for (const [x1, y1, x2, y2] of segments) box(group, m, (x1 + x2) / 2, (y1 + y2) / 2, 0, Math.max(Math.abs(x2 - x1), thickness), Math.max(Math.abs(y2 - y1), thickness), .035);
      }
    };
    const flutedShaft = (p: THREE.Object3D, x: number, y: number, z: number, h: number, bottom: number, top: number, m: THREE.Material, grooves = 20) => {
      const g = geo(new THREE.CylinderGeometry(top, bottom, h, 120, 8));
      const a = g.getAttribute('position');
      for (let i = 0; i < a.count; i++) {
        const vx = a.getX(i), vz = a.getZ(i), angle = Math.atan2(vz, vx), t = (a.getY(i) + h / 2) / h;
        const f = 1 - .065 * Math.pow(.5 + .5 * Math.cos(angle * grooves), 2) + Math.sin(t * Math.PI) * .012;
        a.setX(i, vx * f); a.setZ(i, vz * f);
      }
      g.computeVertexNormals(); return mesh(p, g, m, x, y, z);
    };
    const ionicColumn = (p: THREE.Object3D, x: number, z: number, h: number, broken = false) => {
      const y = options.groundHeight(x, z) + .26, shaftH = h - .95;
      cutStone(p, shadow, x, y + .1, z, 1.75, .2, 1.75);
      lathe(p, stone, [[.77, .17], [.77, .25], [.64, .3], [.6, .36], [.66, .4], [.66, .47], [.55, .52]], x, y, z);
      flutedShaft(p, x, y + .52 + shaftH / 2, z, shaftH, .54, .45, stone);
      const drums = Math.max(1, Math.floor(shaftH / .9));
      for (let i = 1; i <= drums; i++) ring(p, shadow, x, y + .52 + i * shaftH / (drums + 1), z, .49 - i * .007, .009);
      colliders.push({ x, z, radius: .76 });
      if (broken) {
        const shards = [[.1, .18, -.1], [-.3, .13, .16], [.28, .09, .2]];
        for (const [dx, dy, dz] of shards) cutStone(p, pale, x + dx, y + h - .35 + dy, z + dz, .35, .13, .3, dx, .27);
        return;
      }
      const capY = y + h - .48;
      cylinder(p, stone, x, capY - .14, z, .52, .17);
      ring(p, gold, x, capY - .19, z, .49, .022);
      cutStone(p, pale, x, capY + .25, z, 1.66, .18, 1.25);
      cutStone(p, stone, x, capY + .05, z, 1.36, .3, .92);
      // Four true spiral volutes: two faces, visibly open against the shaft.
      for (const face of [-1, 1]) for (const side of [-1, 1]) {
        const points: THREE.Vector3[] = [];
        for (let i = 0; i <= 44; i++) { const a = i / 44 * Math.PI * 3.45, r = .31 * (1 - i / 52); points.push(new THREE.Vector3(x + side * (.53 + Math.cos(a) * r), capY + Math.sin(a) * r, z + face * .53)); }
        tube(p, points, .054, pale, 46);
        bead(p, gold, x + side * .51, capY + .01, z + face * .55, .075, .075, .035);
      }
      for (let i = -3; i <= 3; i++) {
        bead(coastFine, pale, x + i * .12, capY - .12, z + .5, .035, .09, .036);
        carvedLeaf(coastFine, stone, x + i * .14, capY - .3, z + .41, .2, 0);
      }
    };
    const amphora = (p: THREE.Object3D, x: number, z: number, size: number, azure: boolean, yaw = 0) => {
      const group = new THREE.Group(); group.position.set(x, options.groundHeight(x, z) + .04, z); group.rotation.y = yaw; group.scale.setScalar(size); p.add(group);
      const m = azure ? glaze : red;
      lathe(group, m, [[.17, 0], [.23, .07], [.19, .14], [.25, .22], [.47, .47], [.54, .83], [.49, 1.11], [.3, 1.31], [.21, 1.4], [.2, 1.64], [.28, 1.7], [.28, 1.77], [.17, 1.77], [.16, 1.66]], 0, 0, 0, 44);
      cylinder(group, black, 0, 1.66, 0, .16, .015);
      for (const side of [-1, 1]) tube(group, [new THREE.Vector3(side * .24, 1.59, 0), new THREE.Vector3(side * .58, 1.55, 0), new THREE.Vector3(side * .7, 1.23, 0), new THREE.Vector3(side * .49, .96, 0)], .066, m, 22);
      for (const yy of [.14, 1.38, 1.7]) ring(group, gold, 0, yy, 0, yy === .14 ? .21 : yy === 1.38 ? .23 : .275, .018);
      return group;
    };
    const brazier = (x: number, z: number, scale = 1) => {
      const p = new THREE.Group(); p.position.set(x, options.groundHeight(x, z), z); p.scale.setScalar(scale); coast.add(p);
      cylinder(p, shadow, 0, .08, 0, .55, .16);
      for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; const sx = Math.sin(a), sz = Math.cos(a); tube(p, [new THREE.Vector3(sx * .5, .12, sz * .5), new THREE.Vector3(sx * .3, .45, sz * .3), new THREE.Vector3(sx * .26, 1.1, sz * .26)], .045, bronze, 16); bead(p, gold, sx * .46, .17, sz * .46, .11, .05, .12); }
      lathe(p, bronze, [[.15, .98], [.3, 1.02], [.58, 1.17], [.65, 1.36], [.63, 1.41], [.58, 1.39], [.51, 1.22], [.2, 1.09]], 0, 0, 0);
      ring(p, gold, 0, 1.39, 0, .63, .025); cylinder(p, black, 0, 1.27, 0, .5, .025);
      // Glowing coals are static; no point light, particle loop or new mechanic.
      const ember = mat('#c57a38');
      for (let i = 0; i < 9; i++) { const a = i * 2.4; bead(p, i % 3 ? black : ember, Math.sin(a) * .31, 1.3 + rnd() * .03, Math.cos(a) * .3, .12, .06, .09); }
    };

    // Asymmetric half portico: one intact façade, a broken rear corner and open sky.
    const floorY = options.groundHeight(9.5, 32);
    for (let step = 0; step < 3; step++) {
      const w = 9.2 - step * .48, d = 8.3 - step * .48;
      for (let i = 0; i < 5; i++) cutStone(coast, step % 2 ? stone : shadow, 9.7 + (i - 2) * w / 5, floorY + .055 + step * .075, 32, w / 5 - .035, .14, d, 0, .05);
    }
    for (const [x, z, h, broken] of [[6.5, 29.5, 4.7, false], [12.7, 29.5, 4.7, false], [6.5, 35, 4.7, false], [12.7, 35, 1.62, true]] as const) ionicColumn(coast, x, z, h, broken);
    for (let course = 0; course < 4; course++) {
      const yy = floorY + 5.15 + course * .15;
      cutStone(coast, course === 1 ? shadow : pale, 9.6, yy, 29.5, 8 + course * .17, .15, 1.35 + course * .15);
      cutStone(coast, course === 1 ? shadow : stone, 6.5, yy, 32.35, 1.35 + course * .15, .15, 6.75 + course * .12);
    }
    box(coast, blue, 9.6, floorY + 5.03, 30.2, 7.8, .35, .05);
    greekKey(coastFine, 9.6, floorY + 4.88, 30.25, 7.5, 15, gold);
    for (let i = 0; i < 26; i++) cutStone(coastFine, pale, 5.7 + i * .3, floorY + 5.65, 30.32, .15, .19, .17);
    // A chipped triangular pediment, with a bronze sun and olive relief.
    const pediment = new THREE.Shape(); pediment.moveTo(-4.1, 0); pediment.lineTo(4.1, 0); pediment.lineTo(2.05, .7); pediment.lineTo(1.82, .61); pediment.lineTo(1.54, .87); pediment.lineTo(0, 1.42); pediment.closePath();
    const pedGeo = geo(new THREE.ExtrudeGeometry(pediment, { depth: .42, bevelThickness: .035, bevelSize: .035, bevelSegments: 1, curveSegments: 1 }));
    mesh(coast, pedGeo, stone, 9.6, floorY + 5.72, 29.45);
    ring(coast, gold, 9.6, floorY + 6.2, 29.91, .32, .042, true);
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) carvedLeaf(coastFine, gold, 9.6 + side * (.7 + i * .4), floorY + 6.05 - i * .055, 29.94, .38, side * -.75);
    for (let row = 0; row < 3; row++) for (let tile = 0; tile < 7 - row; tile++) {
      const value = cutStone(coast, clay, 6.6 + tile * .63 + row * .1, floorY + 5.86 + row * .05, 30.6 + row * .67, .59, .1, .82, -.03, .17); value.rotation.x = -.06;
      tube(coastFine, [new THREE.Vector3(6.3 + tile * .63, floorY + 5.95 + row * .05, 30.2 + row * .67), new THREE.Vector3(6.3 + tile * .63, floorY + 5.99 + row * .05, 31 + row * .67)], .045, clay, 2);
    }
    // Broken drums, fractures and offerings give the ruin a useful foreground scale.
    const fallen = new THREE.Group(); fallen.position.set(12.8, options.groundHeight(12.8, 37.1) + .55, 37.1); fallen.rotation.set(.08, -.48, Math.PI / 2 - .12); coast.add(fallen);
    flutedShaft(fallen, 0, 0, 0, 2.4, .53, .49, stone); cylinder(fallen, shadow, 0, 1.2, 0, .43, .012);
    colliders.push({ x: 12.8, z: 37.1, radius: 1.25 });
    for (let i = 0; i < 14; i++) { const x = 11.5 + rnd() * 4.4, z = 32.5 + rnd() * 5.1; cutStone(coast, i % 3 ? stone : shadow, x, options.groundHeight(x, z) + .11 + rnd() * .15, z, .25 + rnd() * .85, .15 + rnd() * .28, .3 + rnd() * .65, rnd() * 3, .24); }
    amphora(coast, 5.4, 34.6, .93, true, -.3); amphora(coast, 5.6, 36.3, .67, false, .35);
    amphora(coast, 14.1, 30.2, .85, false, -.4); brazier(5.3, 31.3, .9);
    wreath(coast, 6.5, floorY + 2.35, 35.58, .3, gold);
    // A deliberately low, carved roadside block connects the portico to the route.
    const roadsideY = options.groundHeight(4.6, 26.4);
    cutStone(coast, stone, 4.6, roadsideY + .43, 26.4, 1.4, .86, .85, -.12, .16);
    wreath(coastFine, 4.6, roadsideY + .48, 26.85, .23, bronze, -.12);

    // The mural remains readable from the west. All relief is outside its image.
    const muralY = options.groundHeight(16, 4);
    for (const z of [.23, 7.77]) {
      cutStone(mural, shadow, 15.1, muralY + .17, z, .8, .32, 1.1);
      cutStone(mural, stone, 15.25, muralY + 2.22, z, .45, 4.1, .58);
      for (let i = 0; i < 12; i++) { const yy = muralY + .55 + i * .28; const value = bead(mural, pale, 14.99, yy, z, .055, .095, .14); value.rotation.x = i % 2 ? .4 : -.4; }
      cutStone(mural, pale, 15.16, muralY + 4.37, z, .7, .25, .92);
    }
    cutStone(mural, blue, 15.18, muralY + 4.43, 4, .29, .4, 7.8);
    greekKey(mural, 14.98, muralY + 4.25, 4, 7.25, 17, gold, -Math.PI / 2);
    cutStone(mural, pale, 15.15, muralY + 4.73, 4, .73, .16, 8.25);
    cutStone(mural, shadow, 15.2, muralY + .16, 4, 1.15, .26, 7.7);
    greekKey(mural, 14.6, muralY + .12, 4, 6.9, 19, blue, -Math.PI / 2);
    for (const zz of [-.58, 8.58]) {
      const yy = options.groundHeight(14, zz); cylinder(mural, shadow, 14.4, yy + .11, zz, .75, .22);
      flutedShaft(mural, 14.4, yy + .58, zz, .72, .42, .39, stone, 16);
      ring(mural, gold, 14.4, yy + .95, zz, .43, .025);
    }
    amphora(mural, 12.9, 8.6, .75, true, -.55); amphora(mural, 15.1, -1.6, .65, false, .3);
    const fragment = cutStone(mural, stone, 12.5, options.groundHeight(12.5, -1.1) + .2, -1.1, 1.7, .3, 1.1, .3, .3); fragment.rotation.z = -.11;
    for (let i = 0; i < 8; i++) { const x = 16 + rnd() * 2.5, z = -.9 + rnd() * 10; cutStone(mural, shadow, x, options.groundHeight(x, z) + .14, z, .5 + rnd() * .7, .2 + rnd() * .35, .5, rnd() * 4, .24); }

    // The old oath's letters stay exposed: offerings and carved fragments flank it.
    const oathY = options.groundHeight(-15, -58);
    cutStone(grove, shadow, -15, oathY + .11, -58.06, 2.1, .18, 1.12, .13, .16);
    cutStone(grove, stone, -17.5, options.groundHeight(-17.5, -55.6) + .24, -55.6, 1.8, .42, 1.15, -.3, .2);
    amphora(grove, -12.9, -59.6, .48, true, -.2);
    wreath(groveFine, -16.2, oathY + .45, -57.5, .24, gold, -.18);
    for (let i = 0; i < 7; i++) cutStone(grove, i % 2 ? pale : shadow, -16.9 + rnd() * 3.2, oathY + .09 + rnd() * .1, -60.4 - rnd() * 1.2, .35 + rnd() * .5, .16, .32 + rnd() * .55, rnd() * 5, .25);

    // Static outer sleeves enrich the valves, leaving rotating tops untouched.
    for (const [index, x, z] of [[0, -7, -68], [1, 0, -62], [2, 7, -68]]) {
      const y = options.groundHeight(x, z);
      flutedShaft(grove, x, y + .7, z, .86, .865, .82, stone, 24);
      ring(grove, bronze, x, y + .32, z, .89, .04); ring(grove, gold, x, y + 1.12, z, .83, .027);
      ring(grove, blue, x, y + .13, z, 1.27, .035);
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; box(groveFine, i % 4 ? bronze : gold, x + Math.sin(a) * 1.28, y + .13, z + Math.cos(a) * 1.28, .045, .06, i % 4 ? .12 : .24, a); }
      for (let side = 0; side < 4; side++) {
        const a = side * Math.PI / 2, px = x + Math.sin(a) * 1.61, pz = z + Math.cos(a) * 1.61;
        const value = cutStone(grove, shadow, px, options.groundHeight(px, pz) + .025, pz, .49, .035, .48, a, .12); value.castShadow = false;
        const tick = box(grove, blue, px, options.groundHeight(px, pz) + .052, pz, .06, .025, .22, a); tick.castShadow = false;
        // Four small metal palmettes wrap the shaft below the moving pointer.
        const relief = new THREE.Group(); relief.position.set(x + Math.sin(a) * .852, y + .72, z + Math.cos(a) * .852); relief.rotation.y = a; groveFine.add(relief);
        for (let l = -2; l <= 2; l++) carvedLeaf(relief, l === 0 ? gold : bronze, l * .035, Math.abs(l) * -.035, 0, .31, l * .34);
      }
      // Individual seal colours distinguish the three altars without adding rules.
      bead(groveFine, index === 1 ? bronze : gold, x, y + .27, z + 1.12, .12, .07, .035);
    }

    // Stone voussoirs and hand-laid tesserae follow the existing circular basin.
    const springY = options.groundHeight(0, -75), palette = [stone, pale, shadow, blue, glaze, gold];
    const wedge = (inner: number, outer: number, height: number, start: number, span: number) => {
      const shape = new THREE.Shape(); shape.absarc(0, 0, outer, start, start + span, false); shape.lineTo(Math.cos(start + span) * inner, Math.sin(start + span) * inner); shape.absarc(0, 0, inner, start + span, start, true); shape.closePath();
      const g = geo(new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelThickness: .017, bevelSize: .017, bevelSegments: 1, curveSegments: 5 })); g.rotateX(-Math.PI / 2); return g;
    };
    for (let i = 0; i < 28; i++) {
      const a = i * Math.PI / 14, span = Math.PI / 14 - .013;
      mesh(grove, wedge(4.27, 4.64, .36, a, span), i % 5 ? stone : pale, 0, springY + .07, -75);
      const x = Math.cos(a + span / 2) * 4.645, z = -75 + Math.sin(a + span / 2) * 4.645;
      const relief = new THREE.Group(); relief.position.set(x, springY + .26, z); relief.rotation.y = Math.PI / 2 - a - span / 2; groveFine.add(relief);
      for (let q = -1; q <= 1; q++) carvedLeaf(relief, q ? shadow : pale, q * .15, 0, 0, .19, q * .7);
      box(relief, gold, 0, .16, .016, .55, .023, .025);
    }
    // A flat, irregular tessera ring never changes the interaction floor height.
    for (let ix = -19; ix <= 19; ix++) for (let iz = -19; iz <= 19; iz++) {
      const x = ix * .31, dz = iz * .31, distance = Math.hypot(x, dz); if (distance < 4.72 || distance > 6.02) continue;
      const angle = Math.atan2(dz, x), ray = Math.floor((angle + Math.PI) * 12 / Math.PI);
      const m = distance > 5.8 ? blue : distance < 4.98 ? gold : (ray + Math.floor(distance * 13)) % 5 === 0 ? glaze : (ix + iz) % 3 === 0 ? shadow : pale;
      const value = box(grove, m, x + (rnd() - .5) * .025, options.groundHeight(x, -75 + dz) + .021, -75 + dz + (rnd() - .5) * .025, .275 + rnd() * .015, .025, .275, (rnd() - .5) * .06); value.castShadow = false;
    }
    // Blue glazed tile inserts and bronze leaves on the fountain's central stem.
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      box(grove, i % 2 ? glaze : blue, Math.sin(a) * .707, springY + .57, -76 + Math.cos(a) * .707, .18, .75, .045, a);
      const p = new THREE.Group(); p.position.set(Math.sin(a) * .739, springY + .9, -76 + Math.cos(a) * .739); p.rotation.y = a; groveFine.add(p);
      carvedLeaf(p, gold, 0, 0, 0, .22, 0);
    }
    ring(grove, bronze, 0, springY + .23, -76, .75, .037);
    // Lion-head spout surrounds the existing first water point; no animation changes.
    flutedShaft(grove, -.42, springY + 2.06, -76, .75, .24, .21, stone, 12);
    const lion = new THREE.Group(); lion.position.set(-.44, springY + 2.63, -76); lion.rotation.y = Math.PI / 2; grove.add(lion);
    bead(lion, bronze, 0, 0, 0, .29, .31, .2);
    for (let i = 0; i < 14; i++) { const a = i * Math.PI / 7; const l = bead(lion, gold, Math.sin(a) * .28, Math.cos(a) * .29, .02, .075, .17, .08); l.rotation.z = -a; }
    for (const side of [-1, 1]) { bead(lion, gold, side * .23, .23, .03, .09, .11, .06); bead(lion, dark, side * .115, .06, .18, .05, .035, .025); bead(lion, bronze, side * .08, -.1, .23, .12, .09, .12); }
    bead(lion, black, 0, -.03, .29, .065, .04, .045);
    const mouth = ring(lion, gold, 0, -.09, .4, .085, .035, true); mouth.scale.set(1.1, .76, 1);
    bead(lion, black, 0, -.09, .41, .07, .055, .012);
    // Two stone seats and paired votive urns frame the shrine, clear of the puzzle.
    for (const side of [-1, 1]) {
      const x = side * 7.7, z = -77.6, y = options.groundHeight(x, z);
      for (const dz of [-.8, .8]) cutStone(grove, shadow, x, y + .25, z + dz, .65, .5, .65, 0, .17);
      cutStone(grove, stone, x, y + .59, z, 1.2, .22, 2.65, 0, .1);
      greekKey(groveFine, x - .62, y + .49, z, 2.3, 7, blue, -Math.PI / 2);
      amphora(grove, side * 6.9, -81.4, .81, side < 0, side * .5);
    }

    // Arrival foreground: a low, incomplete shore shrine, clear of the new path.
    // Its narrow upright frames the bay rather than forming another masonry wall.
    ionicColumn(coast, -13.6, 35.15, 2.68, true);
    const shoreY = options.groundHeight(-13.6, 35.15);
    ring(coast, bronze, -13.6, shoreY + .82, 35.15, .535, .022);
    for (const [x, z, width, depth] of [[-13.5, 36.65, 2.4, .6], [-13.5, 37.15, 2.7, .56], [-13.4, 37.65, 2.95, .52]]) {
      cutStone(coast, stone, x, options.groundHeight(x, z) + .08, z, width, .14, depth, -.06, .18);
    }
    // The fallen capital has actual volute curls and a weathered fracture face.
    const cap = new THREE.Group(); cap.position.set(-14.2, options.groundHeight(-14.2, 33.2) + .34, 33.2); cap.rotation.set(.15, -.38, -.1); coast.add(cap);
    cutStone(cap, shadow, 0, -.19, 0, 1.28, .22, .85, 0, .24);
    cutStone(cap, pale, 0, .02, 0, 1.49, .21, 1.05, 0, .21);
    for (const side of [-1, 1]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 35; i++) { const a = i / 35 * Math.PI * 3.3, r = .24 * (1 - i / 43); points.push(new THREE.Vector3(side * (.44 + Math.cos(a) * r), .02 + Math.sin(a) * r, .49)); }
      tube(cap, points, .045, stone, 36);
    }
    for (let i = -2; i <= 2; i++) carvedLeaf(coastFine, bronze, -13.6 + i * .07, shoreY + 1.35 - Math.abs(i) * .06, 35.635, .27, i * .36);
    amphora(coast, -12.1, 36.6, .56, true, -.23);
    amphora(coast, -14.65, 36.3, .41, false, .35);
    const lampX = -12.15, lampZ = 38.25, lampY = options.groundHeight(lampX, lampZ);
    cutStone(coast, shadow, lampX, lampY + .13, lampZ, .76, .24, .68, -.14, .2);
    const lamp = lathe(coast, bronze, [[.12, 0], [.29, .06], [.31, .15], [.19, .22], [.09, .23], [.075, .15]], lampX, lampY + .26, lampZ, 28);
    lamp.scale.y = .65;
    ring(coast, gold, lampX, lampY + .41, lampZ, .088, .02);
    const lampHandle = ring(coast, bronze, lampX - .28, lampY + .41, lampZ, .14, .027, true); lampHandle.rotation.y = Math.PI / 2;
    const spout = bead(coast, bronze, lampX + .29, lampY + .34, lampZ, .24, .055, .087); spout.rotation.z = .08;
    bead(coast, black, lampX + .45, lampY + .36, lampZ, .045, .018, .037);
    for (let i = 0; i < 7; i++) {
      const x = -14.8 + rnd() * 3.2, z = 32.3 + rnd() * 1.65;
      cutStone(coast, i % 2 ? stone : shadow, x, options.groundHeight(x, z) + .09, z, .27 + rnd() * .41, .14 + rnd() * .08, .25 + rnd() * .35, rnd() * 3, .26);
    }

    // Flat original tesserae, not a decal: a broken eight-point navigational star
    // and surviving meander edges span 5.5m by 5m around (-9,38.5).
    // Every top stays below ground +0.1m; the route needs no collision or step rule.
    const mosaicX = -9, mosaicZ = 38.5;
    for (let ix = -2; ix <= 2; ix++) for (let iz = -2; iz <= 2; iz++) {
      if (ix === 2 && iz < -.5 || ix === -2 && iz === 2) continue;
      const x = mosaicX + ix * 1.06, z = mosaicZ + iz * .96;
      const slab = box(coast, (ix + iz) % 3 ? shadow : stone, x, options.groundHeight(x, z) + .019, z, 1.025, .035, .925, (rnd() - .5) * .02); slab.castShadow = false;
    }
    const tilePitch = .195;
    for (let ix = -14; ix <= 14; ix++) for (let iz = -12; iz <= 12; iz++) {
      const dx = ix * tilePitch, dz = iz * tilePitch;
      // Missing corners, a long eroded seam and scattered lacunae reveal sand.
      if (ix > 10 && iz < -5 || ix < -10 && iz > 7 || rnd() < .12 || Math.abs(dz + dx * .28 - .58) < .075) continue;
      const x = mosaicX + dx, z = mosaicZ + dz, r = Math.hypot(dx + .12, dz + .15), a = Math.atan2(dz + .15, dx + .12);
      const starRadius = .48 + 1.1 * Math.pow(1 - Math.abs(Math.sin(a * 4)), 1.35);
      let m = (ix + iz) % 5 ? pale : stone;
      if (r < .25) m = blue;
      else if (r < starRadius) m = Math.sin(a * 4) > 0 ? gold : glaze;
      else if (r < starRadius + .14) m = blue;
      else if (r > 1.64 && r < 1.83) m = ix % 3 ? blue : gold;
      const edgeX = 14 - Math.abs(ix), edgeZ = 12 - Math.abs(iz);
      if (edgeX < 3 || edgeZ < 3) {
        const along = edgeZ < edgeX ? ix + 14 : iz + 12, inward = Math.min(edgeX, edgeZ), phase = ((along % 6) + 6) % 6;
        if (inward === 0 || phase === 0 || inward === 2 && phase < 5 || inward === 1 && phase === 4) m = blue;
        else m = pale;
      }
      const tessera = box(coast, m, x + (rnd() - .5) * .012, options.groundHeight(x, z) + .059 + rnd() * .008, z + (rnd() - .5) * .012, .164 + rnd() * .009, .027, .165 + rnd() * .008, (rnd() - .5) * .045); tessera.castShadow = false;
    }

    // The gate stays the original animated structure. This shallow, real masonry
    // skin sits in front of its two fixed wings, never inside the opening.
    const gateY = options.groundHeight(0, -102), gateFace = -100.8;
    for (const side of [-1, 1]) {
      const centreX = side * 10;
      box(grove, shadow, centreX, gateY + 3.31, gateFace - .07, 9.94, 6.62, .06);
      for (let course = 0; course < 8; course++) {
        const start = -4.9, stagger = course % 2 ? .82 : 0;
        for (let block = 0; block < 5; block++) {
          const left = Math.max(start, start + block * 2.05 - stagger), right = Math.min(4.9, start + (block + 1) * 2.05 - stagger);
          if (right - left < .25) continue;
          // The original blue line at h+4.7 remains an uninterrupted course.
          if (course === 5) continue;
          cutStone(grove, (block + course + side) % 5 ? stone : pale, centreX + (left + right) / 2, gateY + .42 + course * .82, gateFace + .015 + rnd() * .025, right - left - .045, .765, .14, 0, .045 + rnd() * .025);
        }
        // Fill the shorter running-bond end with an independent cut stone.
        if (stagger && course !== 5) cutStone(grove, stone, centreX + 4.715, gateY + .42 + course * .82, gateFace + .02, .325, .765, .14, 0, .06);
      }
      box(grove, blue, centreX, gateY + 4.52, gateFace + .06, 9.72, .72, .045);
      for (const y of [4.17, 4.87]) box(grove, gold, centreX, gateY + y, gateFace + .092, 9.72, .025, .025);
      // Blue-gold relief panel, arched molding, fluted shallow pilasters.
      cutStone(grove, shadow, centreX, gateY + 1.36, -100.57, 2.75, .18, .42, 0, .09);
      box(grove, blue, centreX, gateY + 2.4, -100.54, 2.04, 2.05, .055);
      const halfRound = geo(new THREE.CircleGeometry(1.02, 28, 0, Math.PI));
      mesh(grove, halfRound, blue, centreX, gateY + 3.425, -100.5);
      for (const panelSide of [-1, 1]) {
        const x = centreX + panelSide * 1.18;
        cutStone(grove, pale, x, gateY + 2.4, -100.43, .18, 2.05, .25, 0, .07);
        box(groveFine, gold, x, gateY + 2.43, -100.282, .03, 1.88, .022);
      }
      const arch: THREE.Vector3[] = [];
      for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI; arch.push(new THREE.Vector3(centreX + Math.cos(a) * 1.18, gateY + 3.425 + Math.sin(a) * 1.18, -100.405)); }
      tube(grove, arch, .085, pale, 32);
      const innerArch = arch.map(p => new THREE.Vector3(centreX + (p.x - centreX) * .89, gateY + 3.425 + (p.y - gateY - 3.425) * .89, -100.3));
      tube(groveFine, innerArch, .023, gold, 32);
      for (const x of [centreX - 3.55, centreX + 3.55]) {
        cutStone(grove, shadow, x, gateY + .5, -100.6, .88, .3, .51);
        flutedShaft(grove, x, gateY + 2.82, -100.65, 4.32, .315, .27, stone, 14);
        cutStone(grove, pale, x, gateY + 5.08, -100.6, .79, .25, .5);
        ring(groveFine, gold, x, gateY + .78, -100.65, .314, .022);
      }
      if (side < 0) {
        // A branching olive relief: low projection, each leaf modeled separately.
        tube(grove, [new THREE.Vector3(centreX, gateY + 1.67, -100.25), new THREE.Vector3(centreX - .07, gateY + 2.55, -100.25), new THREE.Vector3(centreX + .03, gateY + 3.68, -100.25)], .043, gold, 20);
        for (let branch = 0; branch < 7; branch++) {
          const sign = branch % 2 ? 1 : -1, y = gateY + 2.03 + branch * .2, reach = .67 - Math.abs(branch - 3) * .065;
          tube(grove, [new THREE.Vector3(centreX, y, -100.25), new THREE.Vector3(centreX + sign * reach * .55, y + .16, -100.24), new THREE.Vector3(centreX + sign * reach, y + .28, -100.24)], .022, bronze, 10);
          for (let l = 0; l < 3; l++) carvedLeaf(grove, l % 2 ? bronze : gold, centreX + sign * (.18 + l * reach / 3), y + .07 + l * .095, -100.21, .28, sign * -.85);
        }
        ring(grove, gold, centreX, gateY + 3.89, -100.23, .17, .026, true);
      } else {
        const spiral: THREE.Vector3[] = [];
        for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 5.25, r = .065 + i / 72 * .64; spiral.push(new THREE.Vector3(centreX + Math.cos(a) * r, gateY + 2.85 + Math.sin(a) * r, -100.25)); }
        tube(grove, spiral, .042, gold, 76);
        for (let i = 0; i < 9; i++) {
          const a = -.3 + i * .29, r = .7;
          tube(groveFine, [new THREE.Vector3(centreX + Math.cos(a) * r, gateY + 2.85 + Math.sin(a) * r, -100.24), new THREE.Vector3(centreX + Math.cos(a) * (r + .15), gateY + 2.85 + Math.sin(a) * (r + .15), -100.23)], .023, bronze, 2);
        }
        for (let line = 0; line < 2; line++) {
          const wave: THREE.Vector3[] = [];
          for (let i = 0; i <= 28; i++) wave.push(new THREE.Vector3(centreX - .82 + i / 28 * 1.64, gateY + 1.78 + line * .18 + Math.sin(i * .45) * .06, -100.23));
          tube(grove, wave, .02, gold, 32);
        }
      }
      // A deep cornice and a modeled meander break the former white rectangle.
      box(grove, blue, centreX, gateY + 6.11, -100.61, 9.65, .49, .11);
      greekKey(grove, centreX, gateY + 5.94, -100.51, 9.35, 19, gold);
      cutStone(grove, shadow, centreX, gateY + 6.55, -100.71, 10.13, .16, .54);
      cutStone(grove, pale, centreX, gateY + 6.77, -100.67, 10.37, .2, .72);
      for (let i = 0; i < 23; i++) box(groveFine, stone, centreX - 4.85 + i * .44, gateY + 6.41, -100.31, .18, .18, .19);
      // Sculpted vine traces use the same weathered bronze as the votive relief.
      const vineX = side * 14.65, vine: THREE.Vector3[] = [];
      for (let i = 0; i <= 22; i++) vine.push(new THREE.Vector3(vineX + Math.sin(i * .46) * .16, gateY + .7 + i * .19, -100.38));
      tube(groveFine, vine, .022, bronze, 28);
      for (let i = 0; i < 15; i++) carvedLeaf(groveFine, bronze, vineX + (i % 2 ? .13 : -.13), gateY + .88 + i * .25, -100.32, .27, i % 2 ? -.65 : .65);
      for (let i = 0; i < 9; i++) {
        const x = side * (7.4 + rnd() * 6.9), z = -99.55 + rnd() * 1.65;
        cutStone(grove, i % 4 ? stone : shadow, x, options.groundHeight(x, z) + .1 + rnd() * .13, z, .25 + rnd() * .8, .17 + rnd() * .28, .27 + rnd() * .55, rnd() * 5, .25);
      }
    }
    // High above the opening; no new part enters the traversable gate aperture.
    greekKey(grove, 0, gateY + 7.49, -100.34, 11.75, 25, gold);
    for (const side of [-1, 1]) wreath(grove, side * 5, gateY + 5.75, -100.45, .38, bronze);

    // A broken processional border gives the three altars a shared forecourt.
    // Shallow tesserae follow the terrain and exclude both valve and spring halos.
    const valvePoints = [[-7, -68], [0, -62], [7, -68]];
    const floorClear = (x: number, z: number) => valvePoints.every(([vx, vz]) => Math.hypot(x - vx, z - vz) > 2.08) && Math.hypot(x, z + 75) > 6.18;
    const courtPath = [[-8.9, -65.3], [-2.7, -59.35], [2.7, -59.35], [8.9, -65.3], [7.5, -70.5], [0, -69.1], [-7.5, -70.5], [-8.9, -65.3]];
    for (let segment = 0; segment < courtPath.length - 1; segment++) {
      const start = new THREE.Vector2(...courtPath[segment] as [number, number]), end = new THREE.Vector2(...courtPath[segment + 1] as [number, number]);
      const direction = end.clone().sub(start).normalize(), normal = new THREE.Vector2(-direction.y, direction.x), steps = Math.ceil(start.distanceTo(end) / .25), yaw = -Math.atan2(direction.y, direction.x);
      for (let i = 0; i <= steps; i++) {
        const centre = start.clone().lerp(end, i / steps);
        for (let row = -1; row <= 1; row++) {
          const p = centre.clone().addScaledVector(normal, row * .24);
          if (!floorClear(p.x, p.y) || rnd() < .22 || segment === 3 && i < 4) continue;
          const tile = box(grove, row === 0 ? (i % 5 ? pale : gold) : blue, p.x, options.groundHeight(p.x, p.y) + .038, p.y, .216, .035, .205, yaw + (rnd() - .5) * .045); tile.castShadow = false;
        }
      }
    }
    for (const [centreX, centreZ] of [[-4.25, -64.65], [4.25, -64.65], [-7.5, -60.8], [7.5, -60.8]]) {
      for (let ix = -5; ix <= 5; ix++) for (let iz = -3; iz <= 3; iz++) {
        const x = centreX + ix * .22, z = centreZ + iz * .22;
        if (!floorClear(x, z) || rnd() < .29 || ix + iz > 5) continue;
        const tile = box(grove, (ix + iz + 12) % 5 === 0 ? gold : iz % 3 ? pale : blue, x, options.groundHeight(x, z) + .042, z, .192, .033, .189, (rnd() - .5) * .07); tile.castShadow = false;
      }
    }

    // Merge within cullable regions, keeping low quality silhouettes and ornaments.
    const mergeGroup = (group: THREE.Group) => {
      root.updateMatrixWorld(true);
      const inverse = group.matrixWorld.clone().invert(), buckets = new Map<THREE.Material, THREE.BufferGeometry[]>(), sources: THREE.Mesh[] = [];
      group.traverse(o => {
        if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
        const g = geo(o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
        for (const attribute of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(attribute)) g.deleteAttribute(attribute);
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
        const values = buckets.get(o.material) ?? []; values.push(g); buckets.set(o.material, values); sources.push(o);
      });
      for (const [m, values] of buckets) { const combined = mergeGeometries(values, false); if (!combined) throw new Error('Antiquity geometry could not be batched'); mesh(group, geo(combined), m, 0, 0, 0); values.forEach(g => { g.dispose(); geometries.delete(g); }); }
      sources.forEach(o => o.removeFromParent());
      // Remove empty construction nodes after the transformed parts have been packed.
      [...group.children].forEach(o => { if (!(o instanceof THREE.Mesh)) o.removeFromParent(); });
    };
    for (const group of [coast, coastFine, mural, grove, groveFine]) mergeGroup(group);
    const used = new Set<THREE.BufferGeometry>(); root.traverse(o => { if (o instanceof THREE.Mesh) used.add(o.geometry); });
    for (const g of geometries) if (!used.has(g)) { g.dispose(); geometries.delete(g); }
    root.userData.artStats = { meshes: used.size, triangles: [...used].reduce((n, g) => n + (g.index?.count ?? g.getAttribute('position').count) / 3, 0), textures: 3 };
    const setQuality = (value: GreekWorldQuality) => { quality = value; coastFine.visible = groveFine.visible = value !== 'low'; };
    setQuality(options.quality);
    return {
      root, setQuality,
      update(_time, position) {
        if (disposed) return;
        coast.visible = position.z > -57; mural.visible = position.z > -62 && position.z < 67;
        coastFine.visible = quality !== 'low' && position.z > -16;
        grove.visible = position.z < 7 && position.z > -138;
        groveFine.visible = quality !== 'low' && position.z < -20 && position.z > -112;
      },
      dispose,
    };
  } catch (error) {
    dispose(); throw error;
  }
}
