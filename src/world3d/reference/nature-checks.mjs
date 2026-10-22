#!/usr/bin/env node
/** Non-UI geometry/resource checks. Run: node src/world3d/reference/nature-checks.mjs */
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as THREE from 'three';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = join(sourceDirectory, '../../..');
const scanDeliveryHook = '__adonisNatureScanCheckDelivery';
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'adonis-nature-checks-'));
const qualities = ['low', 'high'];
const seeds = [137, 381, 7331, 90421];
const integrationOnly = process.argv.includes('--integration-only');
const rows = [];
const failures = [];
let assertions = 0;
function check(condition, message) { assertions++; assert.ok(condition, message); }
function expect(condition, message) { assertions++; if (!condition && !failures.includes(message)) failures.push(message); }
function near(a, b, tolerance, message) { check(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`); }

async function importModels() {
  const result = await build({
    stdin: {
      contents: "export * from './nature-trees.ts'; export * from './nature-rocks.ts'; export * from './nature.ts';",
      resolveDir: sourceDirectory,
      sourcefile: 'nature-check-entry.ts',
    },
    bundle: true, platform: 'node', format: 'esm', write: false,
    define: { 'import.meta.env.BASE_URL': JSON.stringify('/') },
    plugins: [{
      name: 'external-project-three',
      setup(builder) {
        // Temporary modules live outside the repository. Absolute external paths also
        // ensure the factories and these checks use the same Three constructors.
        builder.onResolve({ filter: /^three(?:\/.*)?$/ }, args => ({
          path: fileURLToPath(import.meta.resolve(args.path)), external: true,
        }));
      },
    }, {
      name: 'test-only-late-scan-delivery',
      setup(builder) {
        builder.onLoad({ filter: /[/\\]nature-scan-formation\.ts$/ }, async args => {
          const source = await readFile(args.path, 'utf8');
          const renamed = source.replace('export async function createScannedLimestoneFormation(', 'async function createScannedLimestoneFormationActual(');
          assert.notEqual(renamed, source, 'Could not attach late scan delivery check');
          return { loader: 'ts', resolveDir: dirname(args.path), contents: `${renamed}\n
            export async function createScannedLimestoneFormation(options) {
              const model = await createScannedLimestoneFormationActual(options);
              const deliver = globalThis[${JSON.stringify(scanDeliveryHook)}];
              return deliver ? await deliver(model, options) : model;
            }` };
        });
      },
    }],
  });
  const target = join(temporaryDirectory, 'nature-models.mjs');
  await writeFile(target, result.outputFiles[0].text);
  return import(pathToFileURL(target).href);
}

function disposeGeometry(root) {
  const owned = new Set();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    owned.add(mesh.geometry);
    if (mesh.isInstancedMesh) mesh.dispose();
  });
  owned.forEach(geometry => geometry.dispose());
  root.removeFromParent();
  root.clear();
}

function finiteAttribute(attribute, label, expectedSize, vertexCount) {
  check(Boolean(attribute), `${label}: missing attribute`);
  check(attribute.itemSize === expectedSize, `${label}: unexpected itemSize`);
  if (vertexCount !== undefined) check(attribute.count === vertexCount, `${label}: mismatched vertex count`);
  check(Array.from(attribute.array).every(Number.isFinite), `${label}: non-finite attribute value`);
}

function boxArray(box) { return [...box.min.toArray(), ...box.max.toArray()]; }
function validBox(box, label) {
  check(!box.isEmpty() && boxArray(box).every(Number.isFinite), `${label}: invalid bounds`);
  const size = box.getSize(new THREE.Vector3());
  check(size.x > .001 && size.y > .001 && size.z > .001, `${label}: collapsed volume`);
  return size;
}

function worldPoints(mesh) {
  const points = [];
  const position = mesh.geometry.getAttribute('position');
  const instance = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const count = mesh.isInstancedMesh ? mesh.count : 1;
  const referenced = mesh.geometry.index ? new Set(mesh.geometry.index.array) : Array.from({ length: position.count }, (_, i) => i);
  for (let i = 0; i < count; i++) {
    if (mesh.isInstancedMesh) { mesh.getMatrixAt(i, instance); matrix.multiplyMatrices(mesh.matrixWorld, instance); }
    else matrix.copy(mesh.matrixWorld);
    for (const vertex of referenced) points.push(new THREE.Vector3().fromBufferAttribute(position, vertex).applyMatrix4(matrix));
  }
  return points;
}

function inspect(root, label, borrowedMaterials, kind) {
  check(root.isGroup && root.parent === null, `${label}: factory must return a detached Group`);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = validBox(box, label);
  const stats = { triangles: 0, draws: 0, degenerate: 0, reversed: 0, minNormalDot: 1, meshes: 0, signedVolume: 0 };
  const crownPoints = [], woodPoints = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const face = new THREE.Vector3(), edge = new THREE.Vector3(), averageNormal = new THREE.Vector3();
  const vertexNormal = new THREE.Vector3();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    stats.meshes++;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    finiteAttribute(position, `${label}/${mesh.name}/position`, 3);
    check(position.count > 2, `${label}/${mesh.name}: no triangle vertices`);
    finiteAttribute(normal, `${label}/${mesh.name}/normal`, 3, position.count);
    finiteAttribute(geometry.getAttribute('uv'), `${label}/${mesh.name}/uv`, 2, position.count);
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      check(Array.from(attribute.array).every(Number.isFinite), `${label}/${mesh.name}/${name}: non-finite values`);
    }
    const index = geometry.index;
    const vertexReferences = index?.count ?? position.count;
    check(vertexReferences % 3 === 0, `${label}/${mesh.name}: incomplete triangle`);
    if (index) check(Array.from(index.array).every(value => Number.isInteger(value) && value >= 0 && value < position.count), `${label}/${mesh.name}: out-of-range index`);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    check(materials.every(material => borrowedMaterials.has(material)), `${label}/${mesh.name}: unexpected unowned material`);
    check(mesh.matrixWorld.elements.every(Number.isFinite), `${label}/${mesh.name}: invalid transform`);
    const instanceCount = mesh.isInstancedMesh ? mesh.count : 1;
    if (mesh.isInstancedMesh) {
      check(Number.isInteger(mesh.count) && mesh.count > 0 && mesh.count <= mesh.instanceMatrix.count, `${label}/${mesh.name}: invalid instance count`);
      check(Array.from(mesh.instanceMatrix.array).every(Number.isFinite), `${label}/${mesh.name}: invalid instance matrix`);
      if (mesh.instanceColor) check(Array.from(mesh.instanceColor.array).every(Number.isFinite), `${label}/${mesh.name}: invalid instance color`);
    }
    const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: vertexReferences, materialIndex: 0 }];
    const drawStart = geometry.drawRange.start;
    const drawEnd = Math.min(vertexReferences, drawStart + geometry.drawRange.count);
    check(Number.isInteger(drawStart) && drawStart >= 0 && drawStart % 3 === 0, `${label}/${mesh.name}: invalid draw start`);
    for (const group of groups) {
      check(group.start >= 0 && group.count >= 0 && group.start + group.count <= vertexReferences && group.start % 3 === 0 && group.count % 3 === 0, `${label}/${mesh.name}: invalid geometry group`);
      check((group.materialIndex ?? 0) < materials.length, `${label}/${mesh.name}: missing group material`);
      const count = Math.max(0, Math.min(group.start + group.count, drawEnd) - Math.max(group.start, drawStart));
      stats.triangles += count / 3 * instanceCount;
      if (count > 0 && instanceCount > 0) stats.draws++;
    }
    let degenerate = 0;
    for (let offset = 0; offset < vertexReferences; offset += 3) {
      const ia = index ? index.getX(offset) : offset;
      const ib = index ? index.getX(offset + 1) : offset + 1;
      const ic = index ? index.getX(offset + 2) : offset + 2;
      a.fromBufferAttribute(position, ia); b.fromBufferAttribute(position, ib); c.fromBufferAttribute(position, ic);
      if (kind === 'rock') stats.signedVolume += a.dot(edge.crossVectors(b, c)) / 6;
      face.subVectors(b, a).cross(edge.subVectors(c, a));
      // Metre-space area below 5e-11 m² is numerically collapsed, rather than a small twig.
      if (face.lengthSq() < 1e-20) { degenerate++; continue; }
      averageNormal.set(0, 0, 0);
      for (const vertex of [ia, ib, ic]) averageNormal.add(vertexNormal.fromBufferAttribute(normal, vertex));
      check(averageNormal.lengthSq() > 1e-12, `${label}/${mesh.name}: triangle has no usable normal`);
      const dot = face.normalize().dot(averageNormal.normalize());
      stats.minNormalDot = Math.min(stats.minNormalDot, dot);
      if (dot < -.05) stats.reversed += instanceCount;
    }
    check(degenerate < vertexReferences / 3, `${label}/${mesh.name}: wholly degenerate mesh`);
    stats.degenerate += degenerate * instanceCount;
    if (kind === 'tree') {
      const points = worldPoints(mesh);
      const target = mesh.isInstancedMesh ? crownPoints : woodPoints;
      for (const point of points) target.push(point);
    }
  });
  check(stats.meshes > 0 && stats.triangles > 0, `${label}: empty asset`);
  // Keep a small aggregate tolerance for parametric poles and report every such face.
  // Deliberate trunk openings are not subjected to a watertightness/topology assertion.
  expect(stats.degenerate / stats.triangles <= (kind === 'tree' ? .002 : 0), `${label}: significant degenerate triangle fraction (${stats.degenerate}/${stats.triangles})`);
  expect(stats.reversed === 0, `${label}: significantly reversed vertex normals (${stats.reversed}; min dot ${stats.minNormalDot.toFixed(6)})`);
  if (kind === 'rock') check(stats.signedVolume > 1e-6, `${label}: rock surface winding has non-positive aggregate volume`);
  const result = { root, box, size, stats, crownPoints, woodPoints };
  if (kind === 'tree') {
    result.crownBox = new THREE.Box3().setFromPoints(crownPoints);
    result.woodBox = new THREE.Box3().setFromPoints(woodPoints);
    validBox(result.crownBox, `${label}/crown`);
    validBox(result.woodBox, `${label}/wood`);
  }
  rows.push({ asset: label, triangles: stats.triangles, draws: stats.draws, degenerate: stats.degenerate,
    reversed: stats.reversed, size: size.toArray().map(value => Number(value.toFixed(3))),
    minNormalDot: Number(stats.minNormalDot.toFixed(4)), ...(kind === 'rock' ? { signedVolume: Number(stats.signedVolume.toFixed(3)) } : {}) });
  return result;
}

function compareBounds(low, high, label, relativeTolerance, absoluteTolerance = .04) {
  for (const axis of ['x', 'y', 'z']) {
    const tolerance = absoluteTolerance + high.getSize(new THREE.Vector3())[axis] * relativeTolerance;
    near(low.min[axis], high.min[axis], tolerance, `${label}/min.${axis}`);
    near(low.max[axis], high.max[axis], tolerance, `${label}/max.${axis}`);
  }
}

function compareTreeLOD(low, high, label) {
  compareBounds(low.woodBox, high.woodBox, `${label}/wood`, .025, .07);
  compareBounds(low.crownBox, high.crownBox, `${label}/crown`, .12, .12);
  check(low.root.userData.crownMasses === high.root.userData.crownMasses, `${label}: crown masses removed in low`);
  check(low.root.userData.leafClusterCards >= high.root.userData.leafClusterCards * .5, `${label}: sparse low crown`);
  check(low.stats.triangles < high.stats.triangles * .6, `${label}: low did not reduce geometry`);
  // Compare the woody envelope in metre-height bands, not just the overall tree box.
  for (let floor = 0; floor < 7.5; floor += 1.5) {
    const lowPoints = low.woodPoints.filter(point => point.y >= floor && point.y < floor + 1.5);
    const highPoints = high.woodPoints.filter(point => point.y >= floor && point.y < floor + 1.5);
    if (!lowPoints.length && !highPoints.length) continue;
    check(lowPoints.length > 0 && highPoints.length > 0, `${label}: missing woody height band ${floor}`);
    const lowBox = new THREE.Box3().setFromPoints(lowPoints), highBox = new THREE.Box3().setFromPoints(highPoints);
    const highSize = highBox.getSize(new THREE.Vector3());
    for (const axis of ['x', 'z']) for (const edge of ['min', 'max']) {
      near(lowBox[edge][axis], highBox[edge][axis], .28 + highSize[axis] * .065, `${label}/wood band ${floor}/${edge}.${axis}`);
    }
  }
}

function checkBoulderUV(root, label) {
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const p = mesh.geometry.getAttribute('position');
    const uv = mesh.geometry.getAttribute('uv');
    for (let i = 0; i < p.count; i += 3) {
      const points = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, i + j).applyMatrix4(mesh.matrixWorld));
      // Test metre density from triangle edges without reproducing the author's
      // normal thresholds or prescribing which valid planar projection to choose.
      const validProjection = [['x', 'z'], ['z', 'y'], ['x', 'y']].some(([uAxis, vAxis]) =>
        [1, 2].every(j =>
          Math.abs((uv.getX(i + j) - uv.getX(i)) * 3 - (points[j][uAxis] - points[0][uAxis])) < 6e-6
          && Math.abs((uv.getY(i + j) - uv.getY(i)) * 3 - (points[j][vAxis] - points[0][vAxis])) < 6e-6));
      check(validProjection, `${label}: triangle ${i / 3} lost its 3 m texture cycle after scaling`);
    }
  });
}

async function checkFactoryLifecycle(models) {
  const { createReferenceNature } = models;
  const originalLoad = THREE.TextureLoader.prototype.load;
  const originalTextureDispose = THREE.Texture.prototype.dispose;
  const originalGeometryDispose = THREE.BufferGeometry.prototype.dispose;
  const originalInstanceDispose = THREE.InstancedMesh.prototype.dispose;
  const originalMaterialDispose = THREE.Material.prototype.dispose;
  const requests = [], textureDisposals = new Map(), geometryDisposals = new Map();
  const instanceDisposals = new Map(), materialDisposals = new Map();
  const increment = (map, value) => map.set(value, (map.get(value) ?? 0) + 1);
  const environment = new THREE.Texture();
  environment.name = 'checks/borrowed-environment';
  const controllers = [], liveLayers = [];
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const observe = promise => promise.then(value => ({ value }), error => ({ error }));
  const flush = (records, fail = false) => {
    records.forEach((record, index) => {
      if (record.state !== 'pending') return;
      record.state = fail && index === 0 ? 'failed' : 'loaded';
      if (record.state === 'failed') record.onError?.(new Error('Synthetic texture failure'));
      else record.onLoad?.(record.texture);
    });
  };
  const releasedTextures = (records, label) => check(records.every(record => textureDisposals.get(record.texture) > 0), `${label}: texture not released`);
  const snapshot = (root, requireInstances = true) => {
    const geometries = new Set(), instances = new Set(), materials = new Set();
    root.traverse(mesh => {
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      if (mesh.isInstancedMesh) instances.add(mesh);
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => materials.add(material));
    });
    check(geometries.size > 0 && (!requireInstances || instances.size > 0), 'Factory lifecycle sample is empty');
    return { geometries, instances, materials };
  };
  const releasedModel = (resources, label) => {
    check([...resources.geometries].every(geometry => geometryDisposals.get(geometry) === 1), `${label}: geometry ownership/dispose mismatch`);
    check([...resources.instances].every(instance => instanceDisposals.get(instance) === 1), `${label}: instance ownership/dispose mismatch`);
    check([...resources.materials].every(material => materialDisposals.get(material) === 1), `${label}: material ownership/dispose mismatch`);
  };
  const options = (quality = 'low') => {
    const controller = new AbortController(); controllers.push(controller);
    return { controller, value: {
      quality, signal: controller.signal,
      lighting: { environment, environmentKind: 'pmrem-cubeuv', sunDirection: [0, 1, 0], sunColor: '#ffffff', skyTop: '#77aaca', skyHorizon: '#c5dfe8' },
      terrainHeight: () => 0, walkHeight: () => 0,
      layout: { version: 'v3-reference-1', cameras: [], architecture: [], water: [], paths: [], discoveries: [], valves: [],
        gate: { position: [0, 0, -100], size: [4, 5, 1], yaw: 0 }, nature: [
          { id: 'checks.olive', kind: 'olive-hero', position: [0, 0, 0], yaw: .2, size: [16, 12, 12], variant: 0 },
          { id: 'checks.cliff', kind: 'cliff', position: [20, 0, -12], yaw: -.4, size: [16, 11, 8], variant: 0 },
          { id: 'checks.rocks', kind: 'rock-cluster', position: [-10, 0, 10], yaw: .6, size: [7, 3, 6], variant: 1 },
        ] },
    } };
  };
  THREE.TextureLoader.prototype.load = function (url, onLoad, _onProgress, onError) {
    const texture = new THREE.Texture();
    requests.push({ url, texture, onLoad, onError, state: 'pending' });
    return texture;
  };
  THREE.Texture.prototype.dispose = function () { increment(textureDisposals, this); return originalTextureDispose.call(this); };
  THREE.BufferGeometry.prototype.dispose = function () { increment(geometryDisposals, this); return originalGeometryDispose.call(this); };
  THREE.InstancedMesh.prototype.dispose = function () { increment(instanceDisposals, this); return originalInstanceDispose.call(this); };
  THREE.Material.prototype.dispose = function () { increment(materialDisposals, this); return originalMaterialDispose.call(this); };
  try {
    const preAborted = options(); preAborted.controller.abort();
    const preAbortedResult = await observe(createReferenceNature(preAborted.value));
    check(preAbortedResult.error?.name === 'AbortError' && requests.length === 0, 'Pre-aborted factory created resources');

    const ordinary = options();
    let start = requests.length;
    const initial = observe(createReferenceNature(ordinary.value));
    const initialRequests = requests.slice(start);
    check(initialRequests.length > 0, 'Factory did not request material textures');
    flush(initialRequests);
    const initialResult = await initial;
    check(!initialResult.error, `Factory failed with fake successful textures: ${initialResult.error}`);
    const layer = initialResult.value; liveLayers.push(layer);
    await layer.whenReady();
    check(layer.root.parent === null && layer.root.userData.quality === 'low', 'Factory root is not detached at requested quality');
    check(layer.colliders.length === 1 && Object.keys(layer.anchors).length === 4, 'Factory proxies/attachment points missing');
    const oldResources = snapshot(layer.root);

    start = requests.length; layer.setQuality('high');
    const staleRequests = requests.slice(start);
    start = requests.length; layer.setQuality('low');
    const latestRequests = requests.slice(start);
    check(staleRequests.length > 0 && latestRequests.length > 0, 'Quality race did not start both material sets');
    flush(staleRequests); await tick();
    check(layer.root.userData.quality === 'low', 'Stale quality result replaced the current model');
    releasedTextures(staleRequests, 'Stale quality');
    flush(latestRequests); await layer.whenReady();
    releasedModel(oldResources, 'Replaced model');
    check(layer.colliders.length === 1 && Object.keys(layer.anchors).length === 4, 'Quality rebuild duplicated proxies/anchors');
    const lastResources = snapshot(layer.root);

    start = requests.length; layer.setQuality('high');
    const lateRequests = requests.slice(start);
    const disposedPending = observe(layer.whenReady());
    layer.dispose(); layer.dispose();
    releasedModel(lastResources, 'Repeated dispose');
    releasedTextures(lateRequests, 'Disposed in-flight quality');
    check(layer.root.children.length === 0 && layer.root.parent === null, 'Disposed factory retained its scene graph');
    const disposedStatus = await Promise.race([disposedPending, tick().then(() => ({ pending: true }))]);
    expect(disposedStatus.error?.name === 'AbortError', 'Explicit dispose waited for texture callbacks instead of rejecting pending quality promptly');
    expect(getEventListeners(ordinary.controller.signal, 'abort').length === 0, 'Disposed factory retained abort listener after the event loop settled');
    flush(lateRequests);
    check((await disposedPending).error?.name === 'AbortError', 'Disposed pending quality did not reject with AbortError');
    releasedTextures(lateRequests, 'Late quality callbacks');

    const cancelled = options();
    start = requests.length;
    const cancelledCreation = observe(createReferenceNature(cancelled.value));
    const cancelledRequests = requests.slice(start);
    cancelled.controller.abort();
    // Cancellation must settle independently of a stalled image request. A later
    // successful load callback must still release its own returned texture.
    const cancellation = await Promise.race([cancelledCreation, tick().then(() => ({ pending: true }))]);
    expect(cancellation.error?.name === 'AbortError', 'Initial factory abort waited for texture callbacks instead of rejecting promptly');
    releasedTextures(cancelledRequests, 'Initial abort');
    flush(cancelledRequests);
    check((await cancelledCreation).error?.name === 'AbortError', 'Aborted creation did not ultimately reject with AbortError');
    releasedTextures(cancelledRequests, 'Late initial callbacks');
    check(getEventListeners(cancelled.controller.signal, 'abort').length === 0, 'Aborted creation retained abort listener');

    const failed = options();
    start = requests.length;
    const failedCreation = observe(createReferenceNature(failed.value));
    const failedRequests = requests.slice(start);
    flush(failedRequests.slice(0, 1), true);
    const failedResult = await failedCreation;
    check(/Natural material texture failed/.test(String(failedResult.error)), 'Texture failure was not observable to the factory caller');
    releasedTextures(failedRequests, 'Partial texture failure');
    flush(failedRequests);
    releasedTextures(failedRequests, 'Late callbacks after failure');
    check(getEventListeners(failed.controller.signal, 'abort').length === 0, 'Failed creation retained abort listener');

    const retry = options();
    start = requests.length;
    const retryCreation = observe(createReferenceNature(retry.value));
    flush(requests.slice(start));
    const retryCreated = await retryCreation;
    check(!retryCreated.error, `Retry sample failed to load its initial low assets: ${retryCreated.error}`);
    const retryLayer = retryCreated.value; liveLayers.push(retryLayer);
    const committedLowGroup = retryLayer.root.children[0];
    const committedLowResources = snapshot(retryLayer.root);
    check(retryLayer.root.userData.quality === 'low', 'Retry sample did not start with committed low quality');

    start = requests.length; retryLayer.setQuality('high');
    const failedQualityRequests = requests.slice(start);
    check(failedQualityRequests.length > 0, 'High quality did not start its texture requests');
    const pendingRequestCount = requests.length;
    retryLayer.setQuality('high');
    check(requests.length === pendingRequestCount, 'Repeated pending high quality duplicated texture requests');
    const failedQuality = observe(retryLayer.whenReady());
    flush(failedQualityRequests.slice(0, 1), true);
    check(/Natural material texture failed/.test(String((await failedQuality).error)), 'High texture failure was not observable');
    await tick();
    check(retryLayer.root.userData.quality === 'low' && retryLayer.root.children[0] === committedLowGroup,
      'Failed high quality replaced the committed low model');
    check(Boolean(retryLayer.root.userData.loadError), 'Failed high quality did not expose loadError');
    check([...committedLowResources.geometries].every(geometry => !geometryDisposals.has(geometry)), 'Failed high quality disposed the committed low geometry');
    releasedTextures(failedQualityRequests, 'Failed quality');
    flush(failedQualityRequests);

    const committedRequestCount = requests.length;
    retryLayer.setQuality('low');
    check(requests.length === committedRequestCount, 'Selecting committed low after failed high issued new texture requests');
    check(!(await observe(retryLayer.whenReady())).error, 'Selecting committed low retained the failed high readiness rejection');
    check(!retryLayer.root.userData.loadError, 'Selecting committed low retained the failed high loadError');

    start = requests.length; retryLayer.setQuality('high');
    const retriedQualityRequests = requests.slice(start);
    check(retriedQualityRequests.length > 0, 'Retrying failed high quality did not issue new texture requests');
    flush(retriedQualityRequests); await retryLayer.whenReady();
    check(retryLayer.root.userData.quality === 'high' && retryLayer.root.children[0] !== committedLowGroup,
      'Successful high retry did not replace the committed low model');
    check(retryLayer.root.getObjectByName('checks.olive')?.userData.quality === 'high', 'Successful high retry still contains low tree geometry');
    check(!retryLayer.root.userData.loadError, 'Successful high retry retained loadError');
    releasedModel(committedLowResources, 'Successful retry replaced low model');
    const retriedResources = snapshot(retryLayer.root);
    retryLayer.dispose();
    releasedModel(retriedResources, 'Retried model disposal');
    check(getEventListeners(retry.controller.signal, 'abort').length === 0, 'Retried layer retained abort listener after disposal');
    const scans = await checkScanIntegration(models, { requests, flush, snapshot, releasedModel, options, liveLayers,
      environment, tick, observe, geometryDisposals, materialDisposals, textureDisposals });
    releasedTextures(requests, 'All fake texture requests');
    check(!textureDisposals.has(environment), 'Factory disposed borrowed lighting.environment');
    return { cases: ['pre-abort', 'load-success', 'stale-quality', 'replacement-release', 'repeated-dispose', 'late-quality', 'initial-abort', 'texture-failure', 'late-failure', 'failed-quality-retry'], fakeTextureRequests: requests.length, scans };
  } finally {
    liveLayers.forEach(layer => layer.dispose());
    controllers.forEach(controller => controller.abort());
    flush(requests);
    await tick();
    THREE.TextureLoader.prototype.load = originalLoad;
    THREE.Texture.prototype.dispose = originalTextureDispose;
    THREE.BufferGeometry.prototype.dispose = originalGeometryDispose;
    THREE.InstancedMesh.prototype.dispose = originalInstanceDispose;
    THREE.Material.prototype.dispose = originalMaterialDispose;
    environment.dispose();
  }
}

async function checkScanIntegration(models, harness) {
  const { requests, flush, snapshot, releasedModel, options, liveLayers, environment, tick, observe,
    geometryDisposals, materialDisposals, textureDisposals } = harness;
  const originalFetch = globalThis.fetch;
  const originalDelivery = globalThis[scanDeliveryHook];
  const scanDirectory = join(projectDirectory, 'public/world3d/reference/nature/scans');
  const manifestBytes = await readFile(join(scanDirectory, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const payloads = new Map([['manifest.json', manifestBytes]]);
  for (const asset of manifest.assets) for (const file of Object.values(asset.quality)) payloads.set(file.url, await readFile(join(scanDirectory, file.url)));
  const fetches = [], scanLayers = [], sampleInfo = {};
  let policy = { hold: null, ignoreAbort: false };
  const abortError = () => new DOMException('Synthetic scan request aborted', 'AbortError');
  const waitUntil = async (condition, label) => {
    const deadline = performance.now() + 5000;
    while (!condition()) { check(performance.now() < deadline, `${label}: timed out`); await tick(); }
  };
  const settled = async (promise, label) => {
    let timer;
    try {
      const result = await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve({ timeout: true }), 5000); })]);
      check(!result.timeout, `${label}: promise did not settle`);
      return result;
    } finally { clearTimeout(timer); }
  };
  const promptlyAborted = async (promise, label) => {
    let timer;
    try {
      const result = await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve({ timeout: true }), 200); })]);
      check(!result.timeout && result.error?.name === 'AbortError', `${label}: cancellation did not promptly reject with AbortError`);
    } finally { clearTimeout(timer); }
  };
  const bufferCopy = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const prefix = '/world3d/reference/nature/scans/';
    check(url.startsWith(prefix), `Unexpected runtime scan request: ${url}`);
    const file = url.slice(prefix.length);
    check(payloads.has(file), `Scan fetched an unapproved/source/texture payload: ${file}`);
    if (init.signal?.aborted) throw abortError();
    const record = { file, signal: init.signal, state: 'requested', aborted: false, code: 200, policy: { ...policy } };
    fetches.push(record);
    const wait = stage => new Promise((resolve, reject) => {
      record.state = stage;
      const cleanup = () => record.signal?.removeEventListener('abort', cancel);
      const cancel = () => {
        record.aborted = true;
        if (record.policy.ignoreAbort) return;
        record.state = 'aborted'; cleanup(); reject(abortError());
      };
      record.release = (code = 200) => {
        if (record.state !== stage) return;
        record.code = code; record.state = 'released'; cleanup(); resolve();
      };
      record.signal?.addEventListener('abort', cancel, { once: true });
      if (record.signal?.aborted) cancel();
    });
    if (file.endsWith('.bin') && record.policy.hold === 'fetch') await wait('fetch-held');
    const response = {
      ok: record.code === 200, status: record.code,
      async json() {
        if (record.signal?.aborted && !record.policy.ignoreAbort) throw abortError();
        record.state = 'completed'; record.bytesRead = payloads.get(file).length;
        return JSON.parse(payloads.get(file));
      },
      async arrayBuffer() {
        if (file.endsWith('.bin') && record.policy.hold === 'body') await wait('body-held');
        if (record.signal?.aborted && !record.policy.ignoreAbort) throw abortError();
        record.state = 'completed'; record.bytesRead = payloads.get(file).length;
        return bufferCopy(payloads.get(file));
      },
    };
    return response;
  };
  const binsSince = start => fetches.slice(start).filter(record => record.file.endsWith('.bin'));
  const heldBins = async (start, label) => {
    await waitUntil(() => binsSince(start).length === 2 && binsSince(start).every(record => record.state.endsWith('-held')), label);
    const records = binsSince(start);
    check(records.every(record => record.signal), `${label}: scan fetch lacked a cancellation signal`);
    return records;
  };
  const release = records => records.forEach(record => record.release?.());
  const frozenAnchors = layer => ({ entries: new Map(Object.entries(layer.anchors)), registration: layer.root.userData.cascadeRegistration });
  const unchangedAnchors = (layer, previous, label) => {
    check(Object.keys(layer.anchors).length === previous.entries.size, `${label}: uncommitted anchor keys were published`);
    check([...previous.entries].every(([key, value]) => layer.anchors[key] === value), `${label}: uncommitted anchor values/arrays were published`);
    check(layer.root.userData.cascadeRegistration === previous.registration, `${label}: uncommitted cascade registration was published`);
  };
  const fixture = quality => {
    const result = options(quality);
    result.value.layout.nature = [
      { id: 'checks.scan-olive', kind: 'olive', position: [-22, 4, 3], yaw: .2, size: [12, 10, 11], variant: 1 },
      { id: 'cliff.fixture-before', kind: 'cliff', position: [-10, 2, -8], yaw: -.31, size: [14, 12, 9], variant: 0 },
      { id: 'cliff.cascade', kind: 'cliff', position: [51, 3.25, -27], yaw: .43, size: [19, 18, 12], variant: 1 },
      { id: 'cliff.cascade-secondary', kind: 'cliff', position: [18, 1, 14], yaw: .15, size: [17, 10, 11], variant: 2 },
    ];
    return result;
  };
  const beginCreation = quality => {
    const input = fixture(quality), textureStart = requests.length, fetchStart = fetches.length;
    const result = observe(models.createReferenceNature(input.value));
    flush(requests.slice(textureStart));
    return { input, result, fetchStart };
  };
  const createLayer = async quality => {
    const started = beginCreation(quality);
    const result = await settled(started.result, `Create scan ${quality}`);
    check(!result.error, `Create scan ${quality}: ${result.error}`);
    const layer = result.value;
    scanLayers.push(layer); liveLayers.push(layer);
    return { ...started, layer };
  };
  const beginQuality = (layer, next) => {
    const textureStart = requests.length, fetchStart = fetches.length;
    layer.setQuality(next);
    const result = observe(layer.whenReady());
    flush(requests.slice(textureStart));
    return { result, fetchStart };
  };
  const liveBorrowedMaps = (resources, label) => {
    for (const material of resources.materials) {
      check(!materialDisposals.has(material), `${label}: committed material was disposed before replacement`);
      for (const value of Object.values(material)) if (value?.isTexture && value !== environment) {
        check(!textureDisposals.has(value), `${label}: borrowed/current texture was prematurely disposed`);
      }
    }
  };
  const verifyCommitted = (layer, input, quality) => {
    const placements = input.value.layout.nature;
    const cascadePlacement = placements.find(p => p.id === 'cliff.cascade');
    const cascade = layer.root.getObjectByName('cliff.cascade');
    check(cascade?.userData.natureAsset?.kind === 'limestone-scan-experiment', `${quality}: cascade did not use the scanned assembly`);
    check(cascade.userData.natureAsset.quality === quality, `${quality}: cascade used the wrong scan payload quality`);
    for (const placement of placements.filter(p => p.kind === 'cliff' && p.id !== 'cliff.cascade')) {
      check(layer.root.getObjectByName(placement.id)?.userData.natureAsset?.kind === 'limestone-formation', `${placement.id}: non-cascade cliff was replaced by a scan`);
    }
    const metadata = cascade.userData.placement;
    check(Array.isArray(metadata?.referenceEnvelope) && metadata.referenceEnvelope.length === 3, `${quality}: scan placement did not disclose its common reference envelope`);
    const reference = metadata.referenceEnvelope;
    for (let axis = 0; axis < 3; axis++) {
      const common = Math.max(...qualities.map(q => sampleInfo[q].bounds.max[axis] - sampleInfo[q].bounds.min[axis]));
      expect(reference[axis] + 2e-5 >= common, `${quality}: reference envelope omitted one LOD on axis ${axis} (${reference[axis]} < ${common})`);
    }
    const expectedScale = Math.min(...cascadePlacement.size.map((value, axis) => value / reference[axis]));
    near(metadata.uniformScale, expectedScale, 1e-10, `${quality}: uniform scale does not follow disclosed reference envelope`);
    for (const axis of ['x', 'y', 'z']) near(cascade.scale[axis], expectedScale, 1e-10, `${quality}: nonuniform outer ${axis} scale`);
    const expectedMatrix = new THREE.Matrix4().compose(new THREE.Vector3(...cascadePlacement.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, cascadePlacement.yaw, 0)), new THREE.Vector3().setScalar(expectedScale));
    const registration = layer.root.userData.cascadeRegistration;
    check(registration?.layoutWaterMatches === false, `${quality}: an empty water fixture was incorrectly declared aligned`);
    near(registration.uniformScale, expectedScale, 1e-10, `${quality}: cascade registration used a different scale`);
    for (const [tier, points] of Object.entries(sampleInfo[quality].waterAnchors)) for (const end of ['start', 'end']) {
      const key = `cliff.cascade.${tier}.${end}`;
      const expected = new THREE.Vector3(...points[end]).applyMatrix4(expectedMatrix);
      check(Array.isArray(layer.anchors[key]), `${quality}: missing committed world anchor ${key}`);
      layer.anchors[key].forEach((value, axis) => near(value, expected.getComponent(axis), 1e-8, `${quality}: stale/Z-compressed anchor ${key}/${axis}`));
    }
    Object.values(sampleInfo[quality].waterAnchors).forEach((tier, index) => {
      const actual = registration.modelTiers[index];
      near(actual.width, tier.width * expectedScale, 1e-10, `${quality}: registered waterfall width changed`);
      for (const [local, registered] of [[tier.start, actual.top], [tier.end, actual.bottom]]) {
        const expected = new THREE.Vector3(...local).applyMatrix4(expectedMatrix);
        registered.forEach((value, axis) => near(value, expected.getComponent(axis), 1e-8, `${quality}: registered waterfall tier ${index}/${axis}`));
      }
    });
    sampleInfo[quality].ledgeFlow.forEach((point, index) => {
      const key = `cliff.cascade.ledge.${index}`;
      const expected = new THREE.Vector3(...point).applyMatrix4(expectedMatrix);
      check(Array.isArray(layer.anchors[key]), `${quality}: missing committed ledge anchor ${key}`);
      layer.anchors[key].forEach((value, axis) => near(value, expected.getComponent(axis), 1e-8, `${quality}: stale ledge anchor ${key}/${axis}`));
    });
    return { scale: expectedScale, anchors: Object.fromEntries(Object.entries(layer.anchors).filter(([key]) => key.startsWith('cliff.cascade.'))), resources: snapshot(layer.root) };
  };
  const rawMaps = [new THREE.Texture(), new THREE.Texture()];
  const rawMaterials = { limestone: new THREE.MeshStandardMaterial({ map: rawMaps[0] }),
    wetLimestone: new THREE.MeshStandardMaterial({ map: rawMaps[1] }), moss: new THREE.MeshStandardMaterial() };
  const generatedScans = [];
  let delayed = null, hookArmed = false;
  globalThis[scanDeliveryHook] = async (group, scanOptions) => {
    const resources = snapshot(group, false);
    const inputs = new Set(Object.values(scanOptions.materials).filter(value => value?.isMaterial));
    const ownedMaterials = [...resources.materials].filter(material => !inputs.has(material));
    check(ownedMaterials.length === (group.userData.natureAsset.materialOwnership?.ownedMaterials ?? 0), 'Scan-owned material clone lacks a matching ownership declaration');
    generatedScans.push({ resources, ownedMaterials });
    if (!hookArmed || scanOptions.quality !== 'high') return group;
    hookArmed = false;
    return new Promise(resolve => { delayed = { group, resources, release: () => resolve(group) }; });
  };
  try {
    // Real source/derived bytes and real scan authoring; only transport is controlled.
    for (const quality of qualities) {
      const sample = await models.createScannedLimestoneFormation({ quality, materials: rawMaterials });
      sampleInfo[quality] = sample.userData.natureAsset;
      const owned = snapshot(sample, false);
      disposeGeometry(sample);
      check([...owned.geometries].every(geometry => geometryDisposals.get(geometry) === 1), `${quality}: direct sample geometry was not released`);
      for (const material of owned.materials) if (!Object.values(rawMaterials).includes(material)) {
        check(materialDisposals.get(material) === 1, `${quality}: declared sample-owned material clone was not released with its geometry`);
      }
      check(Object.values(rawMaterials).every(material => !materialDisposals.has(material)), `${quality}: scan disposed borrowed input materials`);
      check(rawMaps.every(texture => !textureDisposals.has(texture)), `${quality}: scan disposed borrowed input maps`);
    }
    const normal = await createLayer('low');
    const { layer, input } = normal;
    check(binsSince(normal.fetchStart).length === 2, 'Non-cascade cliff placements triggered additional scan payload fetches');
    const committedLow = verifyCommitted(layer, input, 'low');
    const lowAnchors = frozenAnchors(layer);
    policy = { hold: 'fetch', ignoreAbort: false };
    const high = beginQuality(layer, 'high');
    const highFetches = await heldBins(high.fetchStart, 'High scan hold');
    unchangedAnchors(layer, lowAnchors, 'Pending high scan');
    liveBorrowedMaps(committedLow.resources, 'Pending high scan');
    release(highFetches);
    check(!(await settled(high.result, 'High scan commit')).error, 'High scan failed to commit');
    const committedHigh = verifyCommitted(layer, input, 'high');
    near(committedLow.scale, committedHigh.scale, 1e-12, 'Scan LOD changed outer uniform scale');
    check(JSON.stringify(committedLow.anchors) === JSON.stringify(committedHigh.anchors), 'Scan LOD moved world water anchors');
    releasedModel(committedLow.resources, 'Low scan replacement');

    const currentAnchors = frozenAnchors(layer);
    policy = { hold: 'fetch', ignoreAbort: true };
    const superseded = beginQuality(layer, 'low');
    const supersededFetches = await heldBins(superseded.fetchStart, 'Superseded scan hold');
    unchangedAnchors(layer, currentAnchors, 'Uncommitted superseded scan');
    policy = { hold: null, ignoreAbort: false };
    const replacement = beginQuality(layer, 'high');
    check(supersededFetches.every(record => record.signal.aborted && record.aborted), 'Supersede did not cancel held scan fetches');
    await promptlyAborted(superseded.result, 'Superseded scan');
    check(!(await settled(replacement.result, 'Replacement scan')).error, 'Replacement scan failed');
    verifyCommitted(layer, input, 'high');
    const afterLatePayload = frozenAnchors(layer);
    release(supersededFetches); await tick();
    unchangedAnchors(layer, afterLatePayload, 'Late payload after supersede');

    const beforeFailure = frozenAnchors(layer), failureResources = snapshot(layer.root);
    policy = { hold: 'fetch', ignoreAbort: false };
    const failed = beginQuality(layer, 'low');
    const failedFetches = await heldBins(failed.fetchStart, 'Failed scan hold');
    unchangedAnchors(layer, beforeFailure, 'Before scan failure');
    failedFetches[0].release(503); failedFetches[1].release();
    check((await settled(failed.result, 'Failed scan')).error instanceof Error, 'Failed scan request was silently accepted');
    unchangedAnchors(layer, beforeFailure, 'After scan failure');
    liveBorrowedMaps(failureResources, 'Failed scan preserved current model');
    check(layer.root.userData.quality === 'high', 'Failed scan changed committed quality');

    policy = { hold: null, ignoreAbort: false };
    const lowAgain = beginQuality(layer, 'low');
    check(!(await settled(lowAgain.result, 'Scan retry')).error, 'Scan payload failure prevented quality retry');
    verifyCommitted(layer, input, 'low');
    hookArmed = true;
    const beforeLate = frozenAnchors(layer);
    const late = beginQuality(layer, 'high');
    await waitUntil(() => delayed !== null, 'Late generated scan');
    unchangedAnchors(layer, beforeLate, 'Held generated scan');
    const afterLate = beginQuality(layer, 'low');
    check(!(await settled(afterLate.result, 'Replacement while generated scan is held')).error, 'New quality was blocked by a stale generated scan');
    const afterLateAnchors = frozenAnchors(layer);
    delayed.release();
    check((await settled(late.result, 'Late scan return')).error?.name === 'AbortError', 'Late generated scan was accepted after supersede');
    releasedModel(delayed.resources, 'Late generated scan ownership');
    unchangedAnchors(layer, afterLateAnchors, 'Late generated scan release');
    delayed = null;

    const disposingResources = snapshot(layer.root);
    policy = { hold: 'body', ignoreAbort: false };
    const disposing = beginQuality(layer, 'high');
    const disposingFetches = await heldBins(disposing.fetchStart, 'Dispose scan body hold');
    layer.dispose(); layer.dispose();
    check(disposingFetches.every(record => record.signal.aborted && record.aborted), 'Dispose did not cancel scan body reads');
    await promptlyAborted(disposing.result, 'Dispose during scan');
    releasedModel(disposingResources, 'Scan integration repeated dispose');
    check(getEventListeners(input.controller.signal, 'abort').length === 0, 'Disposed scan integration retained external abort listeners');

    policy = { hold: null, ignoreAbort: false };
    const external = await createLayer('low');
    const externalResources = snapshot(external.layer.root);
    policy = { hold: 'fetch', ignoreAbort: false };
    const aborting = beginQuality(external.layer, 'high');
    const abortingFetches = await heldBins(aborting.fetchStart, 'External abort scan hold');
    external.input.controller.abort();
    check(abortingFetches.every(record => record.signal.aborted && record.aborted), 'External abort did not cancel scan fetches');
    await promptlyAborted(aborting.result, 'External abort during scan');
    releasedModel(externalResources, 'External abort scan ownership');
    check(!textureDisposals.has(environment), 'Scan integration disposed borrowed environment');
    const returnedGeometries = new Set(generatedScans.flatMap(record => [...record.resources.geometries]));
    const ownedMaterials = new Set(generatedScans.flatMap(record => record.ownedMaterials));
    check([...returnedGeometries].every(geometry => geometryDisposals.get(geometry) === 1), 'One returned/late scan geometry was leaked or released twice');
    check([...ownedMaterials].every(material => materialDisposals.get(material) === 1), 'One sample-owned material clone was leaked or released twice');
    check(Object.values(rawMaterials).every(material => !materialDisposals.has(material)) && rawMaps.every(map => !textureDisposals.has(map)), 'Direct scan borrowing was not preserved');
    return { cases: ['real-local-payloads-and-borrowed-inputs', 'cascade-only-selection', 'shared-LOD-envelope-and-world-anchors',
      'atomic-anchor-publication', 'supersede-and-late-fetch', 'failed-scan-preserves-current', 'late-generated-geometry-release',
      'dispose-body-abort', 'external-fetch-abort'], fetches: fetches.length,
      resources: { returnedScanGroups: generatedScans.length, returnedGeometries: returnedGeometries.size,
        geometryDisposeCalls: [...returnedGeometries].reduce((sum, geometry) => sum + (geometryDisposals.get(geometry) ?? 0), 0),
        sampleOwnedMaterials: ownedMaterials.size,
        ownedMaterialDisposeCalls: [...ownedMaterials].reduce((sum, material) => sum + (materialDisposals.get(material) ?? 0), 0),
        cancelledHeldRequests: fetches.filter(record => record.aborted).length,
        deliveredLatePayloads: fetches.filter(record => record.aborted && record.state === 'completed').length,
        directBorrowedMaterialDisposals: 0, directBorrowedMapDisposals: 0, borrowedEnvironmentDisposals: 0 },
      sampleTriangles: Object.fromEntries(qualities.map(quality => [quality, sampleInfo[quality].triangles])), fixturePosition: input.value.layout.nature.find(p => p.id === 'cliff.cascade').position };
  } finally {
    delayed?.release();
    scanLayers.forEach(layer => layer.dispose());
    for (const record of fetches) record.release?.();
    await tick();
    globalThis.fetch = originalFetch;
    if (originalDelivery === undefined) delete globalThis[scanDeliveryHook]; else globalThis[scanDeliveryHook] = originalDelivery;
    Object.values(rawMaterials).forEach(material => material.dispose());
    rawMaps.forEach(texture => texture.dispose());
  }
}

const materials = Object.fromEntries(['bark', 'barkDark', 'foliage', 'limestone', 'wetLimestone', 'moss']
  .map(name => [name, new THREE.MeshStandardMaterial({ name: `checks/borrowed/${name}` })]));
const borrowedMaterials = new Set(Object.values(materials));
let borrowedDisposals = 0;
borrowedMaterials.forEach(material => material.addEventListener('dispose', () => borrowedDisposals++));
const ownedRoots = [];
try {
  const models = await importModels();
  if (!integrationOnly) {
  const variants = [];
  for (let variant = 0; variant < 3; variant++) {
    const pair = {};
    for (const quality of qualities) {
      const root = models.createAncientOlive({ quality, variant, seed: 7331, materials });
      ownedRoots.push(root);
      pair[quality] = inspect(root, `olive-${variant}/${quality}`, borrowedMaterials, 'tree');
      check(borrowedDisposals === 0, `olive-${variant}/${quality}: factory disposed a borrowed material`);
    }
    compareTreeLOD(pair.low, pair.high, `olive-${variant}`);
    variants.push(pair.high);
  }
  for (let a = 0; a < variants.length; a++) for (let b = a + 1; b < variants.length; b++) {
    const boundsDiffer = boxArray(variants[a].box).some((value, index) => Math.abs(value - boxArray(variants[b].box)[index]) > .1);
    const woodDiffer = boxArray(variants[a].woodBox).some((value, index) => Math.abs(value - boxArray(variants[b].woodBox)[index]) > .1);
    check(boundsDiffer || woodDiffer, `olive-${a}/olive-${b}: identical tree scaffold/envelope`);
  }
  for (const seed of seeds) {
    const pair = {};
    for (const quality of qualities) {
      const root = models.createLimestoneFormation({ quality, seed, materials });
      ownedRoots.push(root);
      pair[quality] = inspect(root, `cliff-${seed}/${quality}`, borrowedMaterials, 'rock');
    }
    compareBounds(pair.low.box, pair.high.box, `cliff-${seed}`, .002, .01);
    near(pair.low.stats.signedVolume / pair.high.stats.signedVolume, 1, .08, `cliff-${seed}: low changed macro volume`);
    check(pair.low.stats.triangles < pair.high.stats.triangles * .35, `cliff-${seed}: low did not reduce geometry`);
  }
  for (const scale of [1, 2, [1.4, .75, 2.1]]) {
    const label = `boulder/scale-${Array.isArray(scale) ? scale.join(',') : scale}`;
    const root = models.createLimestoneBoulder({ quality: 'low', seed: 137, materials, scale });
    ownedRoots.push(root);
    inspect(root, label, borrowedMaterials, 'rock');
    checkBoulderUV(root, label);
  }
  ownedRoots.splice(0).forEach(disposeGeometry);
  }
  check(borrowedDisposals === 0, 'Factory construction/owned geometry cleanup disposed borrowed materials');
  const lifecycle = await checkFactoryLifecycle(models);
  console.log(JSON.stringify({ status: failures.length ? 'failed' : 'passed', mode: integrationOnly ? 'integration-only' : 'complete', assertions, failures,
    treeCases: integrationOnly ? 0 : 6, cliffCases: integrationOnly ? 0 : 8, boulderScaleCases: integrationOnly ? 0 : 3,
    lifecycle, note: 'Non-UI checks; triangle counts include instances. No renderer, image quality, watertightness, layout alignment, or device performance claim.', assets: rows }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  ownedRoots.forEach(disposeGeometry);
  borrowedMaterials.forEach(material => material.dispose());
  await rm(temporaryDirectory, { recursive: true, force: true });
}
