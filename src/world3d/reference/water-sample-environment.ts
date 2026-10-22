import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Diagnostic rocks only. The production world borrows D/C's actual terrain. */
export function createWaterSampleEnvironment() {
  const root = new THREE.Group();
  root.name = 'water-diagnostic-rocks-and-bed';
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let seed = 9123;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const p = (y * 512 + x) * 4;
    const grain = random() * 19 - 9;
    const strata = Math.sin(y * .083 + Math.sin(x * .023) * .7) * 8 + Math.sin(y * .47) * 3;
    const pore = random() < .023 ? -23 : 0;
    pixels.data[p] = 165 + grain + strata + pore;
    pixels.data[p + 1] = 153 + grain + strata + pore;
    pixels.data[p + 2] = 126 + grain + strata + pore;
    pixels.data[p + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const colorMap = new THREE.CanvasTexture(canvas); colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = colorMap.wrapT = THREE.RepeatWrapping; colorMap.repeat.set(2, 2); textures.add(colorMap);
  const makeMaterial = (color: string, wet = false) => {
    const material = new THREE.MeshStandardMaterial({ color, map: colorMap, roughness: wet ? .36 : .91, metalness: 0 });
    materials.add(material); return material;
  };
  const limestone = makeMaterial('#e0d6b4');
  const submerged = makeMaterial('#bfb294', true);
  const wetRock = makeMaterial('#4a5a45', true);
  const darkRock = makeMaterial('#7c8068');

  function terrainHeight(x: number, z: number) {
    const deep = Math.exp(-((x - 2) ** 2 / 86 + (z + 1) ** 2 / 63));
    const frontRise = THREE.MathUtils.smoothstep(z, 8, 24) * 1.85;
    const sideRise = THREE.MathUtils.smoothstep(Math.abs(x), 10, 20) * 2.4;
    return -2.1 - deep * 1.6 + frontRise + sideRise + Math.sin(x * .43 + z * .29) * .11;
  }
  const bedGeometry = new THREE.PlaneGeometry(65, 65, 118, 118); bedGeometry.rotateX(-Math.PI / 2); bedGeometry.translate(0, 0, 8);
  const position = bedGeometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i), y = terrainHeight(x, z);
    position.setY(i, y);
    color.set(y < -1.5 ? '#8c9d7b' : '#d5c9a4'); color.multiplyScalar(.88 + .14 * Math.sin(x * .8 + z * .45));
    color.toArray(colors, i * 3);
  }
  bedGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); bedGeometry.computeVertexNormals(); geometries.add(bedGeometry);
  const bedMaterial = makeMaterial('#e1d6b8'); bedMaterial.vertexColors = true;
  const bed = new THREE.Mesh(bedGeometry, bedMaterial); bed.receiveShadow = true; root.add(bed);

  function rock(x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material, detail = 1) {
    const geometry = new THREE.IcosahedronGeometry(1, detail); geometries.add(geometry);
    const attr = geometry.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      const px = attr.getX(i), py = attr.getY(i), pz = attr.getZ(i);
      const variation = 1 + Math.sin(px * 8.1 + py * 4.7 + pz * 5.3 + x) * .10 + Math.sin(py * 19 + px * 3) * .035;
      attr.setXYZ(i, px * variation, py * variation, pz * variation);
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.rotation.set(random() * .16, random() * .4 - .2, random() * .12); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
  }
  // A two-level diagnostic ledge. Irregular overlap provides dark gaps behind the water.
  for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) {
    const x = -15 + col * 4.5 + (random() - .5) * 1.7;
    const y = 2.2 + row * 4.1;
    const z = -10.3 - row * 2.3 + random();
    rock(x, y, z, 3.6 + random(), 3.0, 3.4 + random(), row === 0 ? darkRock : limestone, 2);
  }
  for (let i = 0; i < 19; i++) {
    const x = -12 + i * 1.35, z = -5.6 + random() * 1.3;
    rock(x, 7.1 + random() * .8, z, 1.3, .8, 1.4, i > 5 && i < 14 ? wetRock : limestone, 1);
  }
  for (let i = 0; i < 5; i++) rock(-5 + i * 1.5, 12.0, -12.1, 1.6, .9, 1.6, wetRock, 1);
  for (let i = 0; i < 13; i++) {
    const x = -7 + i * 1.2, z = -3.1 + random() * .3;
    rock(x, -.08, z, 1.1, .6, .95, wetRock, 1);
  }
  for (let i = 0; i < 70; i++) {
    const x = (random() - .5) * 32, z = 6 + random() * 21;
    const y = terrainHeight(x, z), s = .15 + random() * .65;
    rock(x, y + s * .25, z, s, s * .5, s * .8, submerged, 1);
  }
  // Keep the diagnostic fixture from dominating water-pass draw statistics.
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const child of [...root.children]) {
    if (!(child instanceof THREE.Mesh) || child === bed || Array.isArray(child.material)) continue;
    child.updateMatrix();
    const transformed = child.geometry.clone().applyMatrix4(child.matrix);
    const batch = batches.get(child.material) ?? []; batch.push(transformed); batches.set(child.material, batch);
    root.remove(child); geometries.delete(child.geometry); child.geometry.dispose();
  }
  for (const [material, parts] of batches) {
    const merged = mergeGeometries(parts); parts.forEach(part => part.dispose());
    if (!merged) throw new Error('Diagnostic rock batch failed');
    geometries.add(merged); const mesh = new THREE.Mesh(merged, material); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
  }
  return { root, terrainHeight, dispose() { root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); root.clear(); } };
}
