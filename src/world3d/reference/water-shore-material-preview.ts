import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { createReferenceWater } from './water';
import type { ReferenceLayout, ReferenceWaterLayer, ReferenceWaterLayerOptions } from './contracts';
import type { ArchitectureMaterials } from './architecture-materials';
import type { ReferenceBridgeOptions } from './architecture-bridge';
import type { createReferenceRenderContext } from './render-context';
import waterSource from './water.ts?raw';
import streamSource from './water-streams.ts?raw';
import opticsSource from './water-streams-optics.ts?raw';
import surfaceSource from './water-surface.ts?raw';
import surfaceShaderSource from './water-surface-shaders.ts?raw';
import fallsSource from './water-falls.ts?raw';
import fallsShaderSource from './water-falls-shaders.ts?raw';
import shoreSource from './water-shore.ts?raw';
import previewSource from './water-shore-material-preview.ts?raw';
import previewHtml from './water-shore-material-preview.html?raw';

declare const __OUTLET_CONTEXT_URL__: string;
declare const __OUTLET_BASELINE_URL__: string;
declare const __OUTLET_BOOT_META__: Record<string, unknown>;

if (!import.meta.env.DEV) throw new Error('Outlet optical preview is development only');
type Quality = 'low' | 'medium';
type Variant = 'baseline' | 'current';
type DiagnosticLayer = 'outlet' | 'bed' | 'soil' | 'sea' | 'shore';
type VisibilitySelection = Record<DiagnosticLayer, boolean>;
type WaterFactory = (options: ReferenceWaterLayerOptions) => Promise<ReferenceWaterLayer>;
interface FrozenContext {
  REFERENCE_LAYOUT: ReferenceLayout;
  REFERENCE_LAYOUT_REVISION: string;
  referenceTerrainHeight(x: number, z: number): number;
  referenceWalkHeight(x: number, z: number): number;
  buildReferenceBridge(options: ReferenceBridgeOptions): THREE.Group;
  loadArchitectureMaterials(options: { quality: 'low'; signal: AbortSignal; baseUrl: string }): Promise<ArchitectureMaterials>;
  createReferenceRenderContext: typeof createReferenceRenderContext;
}
const VIEWS = {
  near: { position: [13.77, 4.32, 18.02], target: [20, .18, 16.4], fov: 60,
    provenance: 'Eye position rounded from D walk record. Target is newly specified; not exact replay of the e671 screenshot.' },
  bridge: { position: [9.4, 1.8, 22.7], target: [13, .7, 18], fov: 60, provenance: 'Independent fixed bridge-side pose.' },
  sea: { position: [6.6, 1.75, 23.4], target: [10, .05, 19.35], fov: 60, provenance: 'Independent fixed sea-mouth pose.' },
} as const;
type View = keyof typeof VIEWS;
const params = new URLSearchParams(location.search);
const requestedView = params.get('view') ?? 'near';
let view: View = requestedView in VIEWS ? requestedView as View : 'near';
let quality: Quality = params.get('quality') === 'low' ? 'low' : 'medium';
let variant: Variant = params.get('variant') === 'baseline' ? 'baseline' : 'current';
// Every load starts with the actual five production layers visible.
const visibilitySelection: VisibilitySelection = { outlet: true, bed: true, soil: true, sea: true, shore: true };
let yawDegrees = 0;
let time = Number.isFinite(Number(params.get('time'))) && params.has('time') ? Math.max(0, Number(params.get('time'))) : 2.4;
let paused = !params.has('playing'), disposed = false, ready = false, generation = 0, raf = 0, frameNumber = 0;
let previous = performance.now(), lastStatus = 0;
const status = document.getElementById('status')!;
const sourceNode = document.getElementById('source-metadata')!;
const errorNode = document.getElementById('error-log')!;
const qualityInput = document.getElementById('quality') as HTMLSelectElement;
const variantInput = document.getElementById('variant') as HTMLSelectElement;
const visibilityInputs = Object.fromEntries((['outlet', 'bed', 'soil', 'sea', 'shore'] as const).map(layer => [layer, document.getElementById(`show-${layer}`) as HTMLInputElement])) as Record<DiagnosticLayer, HTMLInputElement>;
const timeInput = document.getElementById('time') as HTMLInputElement;
const pauseButton = document.getElementById('pause') as HTMLButtonElement;
const sampleButton = document.getElementById('run-sample') as HTMLButtonElement;
const videoButton = document.getElementById('download-video') as HTMLButtonElement;
const probeXInput = document.getElementById('probe-x') as HTMLInputElement;
const probeYInput = document.getElementById('probe-y') as HTMLInputElement;
const probeNode = document.getElementById('probe-result')!;
const shoreMaterialNode = document.getElementById('shore-material-proof')!;
const errors: Array<{ kind: string; message: string; time: string }> = [];
const abort = new AbortController();
let buildAbort = new AbortController();
let context: FrozenContext;
let baselineFactory: WaterFactory;
let renderHost: ReturnType<typeof createReferenceRenderContext> | undefined;
let water: ReferenceWaterLayer | undefined;
let architecture: ArchitectureMaterials | undefined;
let bridge: THREE.Group | undefined;
let environment: THREE.WebGLRenderTarget | undefined;
let sky: Sky | undefined;
let sceneLayout: ReferenceLayout;
let geometrySignature: unknown = null, baselineGeometrySignature: unknown = null;
let outletMaterialProof: Record<string, unknown> | null = null;
let shoreMaterialStaticProof: unknown = null;
let liveHelperSHA256 = '';
let liveShoreSHA256 = '', liveWaterSHA256 = '';
let lastRenderedDiagnostic: Record<string, unknown> | null = null;
const originalLayerVisibility = new WeakMap<THREE.Object3D, boolean>();
let sourceMetadata: Record<string, unknown> = { ...__OUTLET_BOOT_META__, scope: 'Candidate2 versus local shore material; original r1 frozen D/A scene, not the e671 integrated browser scene.' };
let latestStats: Record<string, unknown> = {};
let sample: { state: string; mode: 'fixed-eye-yaw'; variant: Variant; quality: Quality; view: View; visibility: VisibilitySelection; startWall: number; startTime: number; elapsed: number; startYawDegrees: -4; endYawDegrees: 4; frames: unknown[]; videoMime?: string } | undefined;
let recorder: MediaRecorder | undefined, recordingStream: MediaStream | undefined, video: Blob | undefined;
let pendingCanvasRecording = false;
const frameHistory: unknown[] = [];
const savedEvidence: unknown[] = [];
const probes: Record<string, unknown>[] = [];

function fail(kind: string, error: unknown) {
  const message = error instanceof Error ? error.stack ?? error.message : typeof error === 'string' ? error : JSON.stringify(error, null, 2);
  errors.push({ kind, message, time: new Date().toISOString() });
  errorNode.textContent = JSON.stringify(errors, null, 2);
  document.body.dataset.error = message;
}
const scene = new THREE.Scene(); scene.name = 'Local shore material comparison / candidate2 / original r1 frozen D-A context';
scene.fog = new THREE.Fog('#a9c9de', 170, 480);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.enabled = quality !== 'low';
renderer.debug.checkShaderErrors = true;
renderer.debug.onShaderError = (gl, program, vertex, fragment) => fail('GL shader compile/link', {
  program: gl.getProgramInfoLog(program), vertex: gl.getShaderInfoLog(vertex), fragment: gl.getShaderInfoLog(fragment),
});
document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .1, 1000);
camera.rotation.order = 'YXZ';
const sunDirection = new THREE.Vector3(-.68, .48, .40).normalize();
const sun = new THREE.DirectionalLight('#fff0d8', 3.3);
sun.position.copy(sunDirection).multiplyScalar(100).add(new THREE.Vector3(15, 14, -20));
sun.target.position.set(15, 14, -20); sun.castShadow = quality !== 'low';
sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 100, bottom: -80, near: 1, far: 220 });
sun.shadow.normalBias = .11; sun.shadow.bias = -.00025;
scene.add(sun, sun.target, new THREE.HemisphereLight('#c5e0f3', '#554f3b', .45));

type Ground = { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>; textures: THREE.Texture[]; bitmaps: ImageBitmap[]; quality: Quality };
let ground: Ground | undefined;
function releaseGround(asset?: Ground) {
  if (!asset) return;
  asset.mesh.removeFromParent(); asset.mesh.geometry.dispose(); asset.mesh.material.dispose();
  asset.textures.forEach(texture => texture.dispose()); asset.bitmaps.forEach(bitmap => bitmap.close());
}
const smooth = (a: number, b: number, x: number) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function pathDistance(x: number, z: number) {
  let best = Infinity;
  for (const path of context.REFERENCE_LAYOUT.paths) for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i], dx = b[0] - a[0], dz = b[2] - a[2], length = dx * dx + dz * dz;
    const t = length ? THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[2]) * dz) / length, 0, 1) : 0;
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[2] - dz * t));
  }
  return best;
}
async function buildGround(next: Quality, signal: AbortSignal): Promise<Ground> {
  const textures: THREE.Texture[] = [], bitmaps: ImageBitmap[] = [];
  const geometry = new THREE.PlaneGeometry(190, 175, next === 'low' ? 110 : 190, next === 'low' ? 110 : 175);
  geometry.rotateX(-Math.PI / 2); geometry.translate(-25, 0, -25);
  const p = geometry.attributes.position, colors: number[] = [], uv: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i); p.setY(i, context.referenceTerrainHeight(x, z));
    const moss = smooth(2, 7, pathDistance(x, z)) * smooth(18, -18, z);
    const color = new THREE.Color('#dad1af').lerp(new THREE.Color('#7c8552'), moss * (.42 + Math.sin(x * .16 + z * .10) * .15));
    color.multiplyScalar(.96 + Math.sin(x * .32 - z * .19) * .035); colors.push(color.r, color.g, color.b); uv.push(x / 3, z / 3);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.computeVertexNormals();
  let material: THREE.MeshStandardMaterial | undefined;
  try {
    for (const [name, color] of [['limestone-color.webp', true], ['limestone-normal.webp', false], ['limestone-roughness.webp', false]] as const) {
      const response = await fetch(`/world3d/reference/nature/${next === 'low' ? 'low' : 'high'}/${name}`, { signal });
      if (!response.ok) throw new Error(`Ground PBR ${response.status}: ${name}`);
      const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      if (signal.aborted || disposed) { bitmap.close(); throw new DOMException('Ground superseded', 'AbortError'); }
      bitmaps.push(bitmap); const texture = new THREE.Texture(bitmap); textures.push(texture);
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = next === 'low' ? 2 : 4; texture.needsUpdate = true;
    }
    material = new THREE.MeshStandardMaterial({ name: 'D / physical limestone soil', map: textures[0], normalMap: textures[1], roughnessMap: textures[2], normalScale: new THREE.Vector2(.35, .35), roughness: 1, vertexColors: true });
    const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true;
    mesh.name = 'D continuous terrain and actual seabed / isolated';
    return { mesh, textures, bitmaps, quality: next };
  } catch (error) { geometry.dispose(); material?.dispose(); textures.forEach(t => t.dispose()); bitmaps.forEach(b => b.close()); throw error; }
}
async function digest(bytes: ArrayBufferView | string) {
  const buffer = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(v => v.toString(16).padStart(2, '0')).join('');
}
async function geometryProof(layer: ReferenceWaterLayer) {
  const result: Record<string, unknown> = {};
  for (const name of ['water.outlet', 'water.outlet.channel-bed', 'terrain-damp-contact-band']) {
    const object = layer.root.getObjectByName(name) as THREE.Mesh | undefined;
    if (!object?.geometry) { result[name] = 'missing'; continue; }
    const g = object.geometry, attributes: Record<string, unknown> = {};
    for (const [key, attribute] of Object.entries(g.attributes)) attributes[key] = { count: attribute.count, itemSize: attribute.itemSize, sha256: await digest(attribute.array) };
    result[name] = { attributes, index: g.index ? { count: g.index.count, sha256: await digest(g.index.array) } : null };
  }
  return result;
}
async function materialProof(layer: ReferenceWaterLayer, factoryVariant: Variant) {
  const mesh = layer.root.getObjectByName('water.outlet') as THREE.Mesh | undefined;
  if (!mesh?.material) return { factoryVariant, meshName: 'water.outlet', error: 'Outlet material is missing', liveHelperSHA256 };
  const materials = await Promise.all((Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(async material => ({
    name: material.name, type: material.type,
    fragmentShaderSHA256: material instanceof THREE.ShaderMaterial ? await digest(material.fragmentShader) : null,
  })));
  return { factoryVariant, meshName: mesh.name, materialName: materials.length === 1 ? materials[0].name : materials.map(material => material.name),
    renderOrder: mesh.renderOrder,
    fragmentShaderSHA256: materials.length === 1 ? materials[0].fragmentShaderSHA256 : materials.map(material => material.fragmentShaderSHA256),
    fragmentShaderSource: 'Actual factory material.fragmentShader; before driver preprocessing.', materials,
    liveHelperSHA256, liveHelperUsedBySelectedFactory: factoryVariant === 'current' };
}
function diagnosticLayers(): Record<DiagnosticLayer, THREE.Object3D | undefined> {
  return { outlet: water?.root.getObjectByName('water.outlet'), bed: water?.root.getObjectByName('water.outlet.channel-bed'),
    soil: ground?.mesh, sea: water?.root.getObjectByName('water.sea'), shore: water?.root.getObjectByName('reference-terrain-wet-shore') };
}
function effectivelyVisible(object: THREE.Object3D) {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}
function diagnosticReadback() {
  return { mode: Object.values(visibilitySelection).every(Boolean) ? 'normal-all-on' : 'diagnostic-isolation',
    purpose: 'Visibility attribution only; isolated views are not acceptance evidence.', requested: { ...visibilitySelection },
    layers: Object.fromEntries(Object.entries(diagnosticLayers()).map(([layer, object]) => [layer, {
      found: Boolean(object), name: object?.name ?? null, visible: object?.visible ?? null,
      ownerName: object?.parent?.name ?? null,
      children: object?.children.map(child => ({ name: child.name, visible: child.visible, effectiveVisible: effectivelyVisible(child) })) ?? [],
      effectiveVisible: object ? effectivelyVisible(object) : null,
      originalVisible: object ? originalLayerVisibility.get(object) ?? null : null,
    }])) };
}
function publishSourceProof() {
  sourceMetadata = { ...sourceMetadata, outletMaterial: outletMaterialProof, shoreMaterialStaticProof, diagnostic: diagnosticReadback() };
  sourceNode.textContent = JSON.stringify(sourceMetadata, null, 2);
}
function applyDiagnostic() {
  for (const [layer, object] of Object.entries(diagnosticLayers()) as Array<[DiagnosticLayer, THREE.Object3D | undefined]>) {
    if (!object) continue;
    if (!originalLayerVisibility.has(object)) originalLayerVisibility.set(object, object.visible);
    object.visible = visibilitySelection[layer] && originalLayerVisibility.get(object)!;
  }
  document.body.dataset.diagnostic = Object.values(visibilitySelection).every(Boolean) ? 'normal-all-on' : 'diagnostic-isolation';
  publishSourceProof();
}
function applyView() {
  const pose = VIEWS[view]; camera.position.fromArray([...pose.position]); camera.lookAt(new THREE.Vector3(...pose.target)); camera.fov = pose.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  // YXZ Euler Y is the world-up yaw; rebuilding the base pose avoids accumulation.
  camera.rotation.y += THREE.MathUtils.degToRad(yawDegrees); camera.updateMatrixWorld(true);
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
}
function resize() {
  const cap = quality === 'low' ? .8 : 1.25, pixels = quality === 'low' ? 850000 : 1800000;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap, Math.sqrt(pixels / (innerWidth * innerHeight)))); renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = quality !== 'low'; sun.castShadow = quality !== 'low'; renderer.shadowMap.needsUpdate = true;
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); water?.resize?.(innerWidth, innerHeight);
}
function stopSample(state = 'complete') {
  if (!sample || sample.state !== 'recording') return;
  sample.state = state; paused = true; pendingCanvasRecording = false; sampleButton.disabled = false;
  if (recorder?.state === 'recording') recorder.stop();
  else recordingStream?.getTracks().forEach(track => track.stop());
  syncControls();
}
function syncControls() {
  pauseButton.textContent = paused ? '播放动态' : '暂停动态'; pauseButton.setAttribute('aria-pressed', String(!paused));
  qualityInput.value = quality; variantInput.value = variant; timeInput.value = time.toFixed(3);
  for (const layer of Object.keys(visibilityInputs) as DiagnosticLayer[]) visibilityInputs[layer].checked = visibilitySelection[layer];
  sampleButton.textContent = sample?.state === 'recording' ? '正在转头记录4秒…' : '定时2.4秒 · 转头±4°录制4秒';
}
async function rebuildWaterAndGround() {
  stopSample('interrupted by variant/quality change');
  const ticket = ++generation, next = quality, requested = variant;
  buildAbort.abort(); buildAbort = new AbortController(); const signal = buildAbort.signal;
  ready = false; document.body.dataset.ready = 'false'; status.textContent = JSON.stringify({ state: 'loading', quality: next, variant: requested });
  let candidateGround: Ground | undefined, candidateWater: ReferenceWaterLayer | undefined;
  try {
    if (!ground || ground.quality !== next) candidateGround = await buildGround(next, signal);
    const factory = requested === 'baseline' ? baselineFactory : createReferenceWater;
    candidateWater = await factory({ layout: sceneLayout, quality: next, signal, renderContext: { renderer, scene },
      lighting: { environment: environment!.texture, environmentKind: 'pmrem-cubeuv', sunDirection: sunDirection.toArray() as [number, number, number], sunColor: '#fff0d8', skyTop: '#559bd5', skyHorizon: '#d9e4e4' },
      terrainHeight: context.referenceTerrainHeight, walkHeight: context.referenceWalkHeight });
    await candidateWater.whenReady();
    // Retain the authoritative tier inputs for the original pool impact uniforms,
    // while omitting distant waterfall geometry from this independent optical view.
    for (const name of ['natural-waterfalls', 'spring-controlled-waterfalls']) {
      const group = candidateWater.root.getObjectByName(name); if (group) group.visible = false;
    }
    const proof = await geometryProof(candidateWater);
    const activeMaterialProof = await materialProof(candidateWater, requested);
    const shoreProof = await shoreStaticProof(candidateWater, requested);
    if (disposed || signal.aborted || ticket !== generation) throw new DOMException('Preview build superseded', 'AbortError');
    if (candidateGround) { releaseGround(ground); ground = candidateGround; candidateGround = undefined; scene.add(ground.mesh); }
    water?.dispose(); water = candidateWater; candidateWater = undefined; scene.add(water.root);
    geometrySignature = proof; if (requested === 'baseline') baselineGeometrySignature = proof;
    outletMaterialProof = activeMaterialProof; shoreMaterialStaticProof = shoreProof; applyDiagnostic();
    ready = true; resize(); syncControls();
  } catch (error) {
    candidateWater?.dispose(); releaseGround(candidateGround);
    if (!signal.aborted && !disposed && ticket === generation) fail('scene/water resources', error);
  }
}
function cameraReadback() {
  const pose = VIEWS[view], distance = camera.position.distanceTo(new THREE.Vector3(...pose.target));
  const actualTarget = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(distance).add(camera.position);
  return { view, position: camera.position.toArray(), target: actualTarget.toArray(), fixedPoseTarget: [...pose.target], yawOffsetDegrees: yawDegrees,
    quaternion: camera.quaternion.toArray(), rotationYXZ: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
    fov: camera.fov, aspect: camera.aspect, matrixWorld: camera.matrixWorld.toArray(), projectionMatrix: camera.projectionMatrix.toArray(), provenance: pose.provenance };
}
async function runPointProbe() {
  if (!ready) return;
  const rect = renderer.domElement.getBoundingClientRect(), x = Number(probeXInput.value), y = Number(probeYInput.value);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
    probeNode.textContent = JSON.stringify({ error: 'Use finite CSS viewport x/y inside the canvas.', canvasCSS: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } }, null, 2); return;
  }
  // The native button explicitly resets the eye/target to the selected original pose.
  stopSample('interrupted by baseline-camera point probe'); yawDegrees = 0; paused = true; applyView(); syncControls();
  scene.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const roots: THREE.Object3D[] = [];
  if (water) roots.push(water.root); if (ground) roots.push(ground.mesh); if (bridge) roots.push(bridge);
  const hits = raycaster.intersectObjects(roots, true);
  const knownLayers = diagnosticLayers();
  const hitProof = hits.map(hit => {
    const object = hit.object as THREE.Mesh, geometry = object.geometry, face = hit.face;
    const path: string[] = [];
    let layer = 'other-water-or-bridge';
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      path.unshift(node.name || node.type);
      for (const [key, root] of Object.entries(knownLayers)) if (node === root) layer = key;
      if (node === water?.root.getObjectByName('water.pool')) layer = 'pool';
      if (node === bridge) layer = 'bridge';
    }
    const allMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const material = allMaterials[face?.materialIndex ?? 0];
    const indices = face ? [face.a, face.b, face.c] : [];
    const position = geometry?.getAttribute('position');
    const triangleMatrix = object.matrixWorld.clone();
    const instanceMatrixAppliedByRaycaster = object instanceof THREE.InstancedMesh && hit.instanceId !== undefined;
    if (object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
      const instanceMatrix = new THREE.Matrix4(); object.getMatrixAt(hit.instanceId, instanceMatrix); triangleMatrix.multiply(instanceMatrix);
    }
    const vertices = position ? indices.map(index => new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(triangleMatrix).toArray()) : [];
    return { layer, meshName: object.name, meshUUID: object.uuid, path, distance: hit.distance, world: hit.point.toArray(), uv: hit.uv?.toArray() ?? null,
      faceIndex: hit.faceIndex ?? null, triangleVertexIndices: indices, triangleWorld: vertices,
      faceNormalWorld: face ? face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(triangleMatrix)).toArray() : null,
      visible: object.visible, effectiveVisible: effectivelyVisible(object), renderOrder: object.renderOrder,
      materialIndex: face?.materialIndex ?? 0, material: material ? { name: material.name, type: material.type, transparent: material.transparent,
        opacity: material.opacity, depthWrite: material.depthWrite, depthTest: material.depthTest, alphaHash: material.alphaHash, side: material.side } : null,
      geometryType: geometry?.type, shaderDisplacementEvaluated: false,
      hasInstancedBufferAttributes: geometry instanceof THREE.InstancedBufferGeometry,
      customInstancedBufferAttributesEvaluated: false, raycastInstanceId: hit.instanceId ?? null, instanceMatrixAppliedByRaycaster };
  });
  const probe = { capturedAt: new Date().toISOString(), variant, quality, waterTime: time, camera: cameraReadback(),
    cssViewportPoint: [x, y], normalizedDevicePoint: ndc.toArray(), ray: { origin: raycaster.ray.origin.toArray(), direction: raycaster.ray.direction.toArray() },
    diagnostic: diagnosticReadback(), hitCount: hitProof.length, hits: hitProof,
    scope: 'Actual Raycaster against all water/soil/bridge base BufferGeometry triangles, including hidden layers. Original material.side/drawRange rules apply; native InstancedMesh instanceMatrix is applied when an instanceId exists. Sky is excluded. Custom shader instance attributes, GPU displacement, fragment alpha/alphaHash, depth compositing, and captured reflection/refraction are not evaluated; ray hits alone do not establish the visible pixel contributor.' };
  probes.push(probe); probeNode.textContent = JSON.stringify(probe, null, 2);
}
function outletBedReadback() {
  const bed = water?.root.getObjectByName('water.outlet.channel-bed') as THREE.Mesh | undefined;
  const material = bed?.material;
  if (!(material instanceof THREE.MeshStandardMaterial)) return null;
  const soil = ground?.mesh.material;
  return { materialName: material.name, vertexColors: material.vertexColors, alphaHash: material.alphaHash,
    borrowedCurrentSoilMaps: material.map === soil?.map && material.normalMap === soil?.normalMap && material.roughnessMap === soil?.roughnessMap,
    maps: [material.map, material.normalMap, material.roughnessMap].map(map => {
      if (!map) return null;
      const image = map.image as { width?: number; height?: number } | undefined;
      return { uuid: map.uuid, width: image?.width, height: image?.height };
    }),
    soilName: soil?.name, normalScale: material.normalScale.toArray() };
}
function textureReadback(texture: THREE.Texture | null | undefined) {
  if (!texture) return null;
  const image = texture.image as { width?: number; height?: number } | undefined;
  return { uuid: texture.uuid, name: texture.name, width: image?.width, height: image?.height, version: texture.version,
    colorSpace: texture.colorSpace, wrapS: texture.wrapS, wrapT: texture.wrapT, repeat: texture.repeat.toArray(), offset: texture.offset.toArray() };
}
function metadataReadback(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value ?? null;
  if (typeof value !== 'object') return String(value);
  if (value instanceof THREE.Texture) return textureReadback(value);
  if (value instanceof THREE.Color) return { hex: value.getHexString(), linearRGB: value.toArray() };
  if (value instanceof THREE.Vector2) return value.toArray();
  if (value instanceof THREE.Vector3) return value.toArray();
  if (value instanceof THREE.Vector4) return value.toArray();
  if (value instanceof THREE.Matrix3 || value instanceof THREE.Matrix4) return [...value.elements];
  if (value instanceof THREE.Object3D) return { name: value.name, uuid: value.uuid, type: value.type };
  if (value instanceof THREE.Material) return { name: value.name, uuid: value.uuid, type: value.type, version: value.version };
  if (depth > 9) return '[depth limit]';
  if (seen.has(value)) return '[shared/circular reference]';
  seen.add(value);
  const result = Array.isArray(value) ? value.map(item => metadataReadback(item, seen, depth + 1))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, metadataReadback(item, seen, depth + 1)]));
  seen.delete(value); return result;
}
async function shoreStaticProof(layer: ReferenceWaterLayer, factoryVariant: Variant) {
  const group = layer.root.getObjectByName('reference-terrain-wet-shore');
  const materials = new Set<THREE.Material>();
  group?.traverse(object => { if (object instanceof THREE.Mesh) (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material)); });
  const baseline = __OUTLET_BOOT_META__.baseline as { sourceHashes?: Record<string, string> } | undefined;
  return { factoryVariant, selectedSourceSHA256: { 'water-shore.ts': factoryVariant === 'baseline' ? baseline?.sourceHashes?.['water-shore.ts'] : liveShoreSHA256,
      'water.ts': factoryVariant === 'baseline' ? baseline?.sourceHashes?.['water.ts'] : liveWaterSHA256 },
    actualMaterialHooks: await Promise.all([...materials].map(async material => ({ uuid: material.uuid, name: material.name, type: material.type,
      customProgramCacheKey: material.customProgramCacheKey(), onBeforeCompileFunctionSHA256: await digest(material.onBeforeCompile.toString()),
      fragmentShaderSHA256: material instanceof THREE.ShaderMaterial ? await digest(material.fragmentShader) : null,
      vertexShaderSHA256: material instanceof THREE.ShaderMaterial ? await digest(material.vertexShader) : null }))),
    shaderProofScope: 'Raw selected source and actual material hook/ShaderMaterial source hashes. MeshStandardMaterial driver-expanded shader is not captured by this harness.' };
}
function shoreMaterialReadback() {
  const group = water?.root.getObjectByName('reference-terrain-wet-shore');
  const soil = ground?.mesh.material;
  const meshes: unknown[] = [];
  group?.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    const materials = (Array.isArray(object.material) ? object.material : [object.material]) as THREE.Material[];
    meshes.push({ name: object.name, ownerName: object.parent?.name, visible: object.visible, effectiveVisible: effectivelyVisible(object), renderOrder: object.renderOrder,
      meshMetadata: metadataReadback(object.userData), geometryMetadata: metadataReadback(geometry.userData),
      geometryGroups: geometry.groups.map((entry: { start: number; count: number; materialIndex?: number }) => ({ ...entry,
        firstTriangle: entry.start / 3, triangleCount: entry.count / 3, materialName: materials[entry.materialIndex ?? 0]?.name ?? null })),
      materialRouting: materials.map((material, index) => {
        const pbr = material instanceof THREE.MeshStandardMaterial ? material : undefined;
        return { materialIndex: index, name: material.name, type: material.type, uuid: material.uuid, version: material.version,
          customProgramCacheKey: material.customProgramCacheKey(), metadata: metadataReadback(material.userData),
          alpha: { opacity: material.opacity, transparent: material.transparent, alphaTest: material.alphaTest, alphaHash: material.alphaHash, alphaToCoverage: material.alphaToCoverage },
          depthWrite: material.depthWrite, depthTest: material.depthTest, side: material.side, vertexColors: material.vertexColors,
          polygonOffset: { enabled: material.polygonOffset, factor: material.polygonOffsetFactor, units: material.polygonOffsetUnits },
          uniforms: material instanceof THREE.ShaderMaterial ? metadataReadback(material.uniforms) : null,
          soilInputs: pbr ? { sourcePresent: Boolean(soil), sourceName: soil?.name, sourceVersion: soil?.version,
            sameCurrentSoilMaps: Boolean(soil) && pbr.map === soil?.map && pbr.normalMap === soil?.normalMap && pbr.roughnessMap === soil?.roughnessMap,
            sameMap: Boolean(soil) && pbr.map === soil?.map, sameNormalMap: Boolean(soil) && pbr.normalMap === soil?.normalMap,
            sameRoughnessMap: Boolean(soil) && pbr.roughnessMap === soil?.roughnessMap,
            map: textureReadback(pbr.map), normalMap: textureReadback(pbr.normalMap), roughnessMap: textureReadback(pbr.roughnessMap),
            normalScale: pbr.normalScale.toArray(), roughness: pbr.roughness, metalness: pbr.metalness, color: pbr.color.getHexString() } : null };
      }) });
  });
  return { staticProof: shoreMaterialStaticProof, groupName: group?.name, ownerName: group?.parent?.name, visible: group?.visible,
    groupMetadata: metadataReadback(group?.userData), meshes };
}
function draw(now: number) {
  if (disposed) return;
  const delta = Math.max(0, Math.min((now - previous) / 1000, .05)); previous = now;
  if (ready) {
    if (sample?.state === 'recording') {
      if (!sample.startWall) sample.startWall = now;
      sample.elapsed = Math.min(4, (now - sample.startWall) / 1000);
      time = 2.4; yawDegrees = -4 + 8 * sample.elapsed / 4; applyView();
    }
    else if (!paused) time += delta;
    try {
      water!.update(time, camera.position);
      const cost = renderHost!.render({ camera, time, delta, quality, viewport: { width: innerWidth, height: innerHeight, pixelRatio: renderer.getPixelRatio() }, beforeRender: frame => water?.beforeRender?.(frame) });
      frameNumber++;
      lastRenderedDiagnostic = diagnosticReadback();
      // Start the native stream after the first -4° canvas render, so its
      // initial frame cannot contain the previous fixed camera pose.
      if (pendingCanvasRecording) { pendingCanvasRecording = false; startCanvasRecording(); }
      const data = { frame: frameNumber, wallTimeMs: now, sampleElapsedSeconds: sample?.state === 'recording' ? sample.elapsed : null,
        time: +time.toFixed(5), variant, quality, view, camera: cameraReadback(), diagnostic: lastRenderedDiagnostic, ...cost };
      frameHistory.push(data); if (frameHistory.length > 180) frameHistory.shift();
      if (sample?.state === 'recording') { sample.frames.push(data); if (sample.elapsed >= 4) stopSample(); }
      latestStats = { actualWebGL: true, sceneKind: 'independent frozen D soil/A bridge; not e671 integrated scene', ready, variant, quality, paused, time: +time.toFixed(5), frame: frameNumber,
        camera: cameraReadback(), canvas: { css: [innerWidth, innerHeight], pixels: [renderer.domElement.width, renderer.domElement.height], pixelRatio: renderer.getPixelRatio(), browserDPR: devicePixelRatio },
        lighting: { exposure: 1.05, toneMapping: 'ACESFilmic', sunDirection: sunDirection.toArray(), sunIntensity: 3.3, hemisphere: .45, environmentWeight: .2, PMREMface: 128, visibleSkyRadiance: .32 },
        frameCost: cost, captureBudget: quality === 'low' ? { maxPasses: 0, maxTargetSize: 0 } : { maxPasses: 1, maxTargetSize: 512 },
        water: water?.root.userData.waterDiagnostics, memory: { ...renderer.info.memory }, compileErrorCount: errors.length,
        outletMaterial: outletMaterialProof, outletBed: outletBedReadback(), shore: shoreMaterialReadback(), diagnostic: lastRenderedDiagnostic,
        geometry: { streamAndBed: geometrySignature, identicalToLoadedBaseline: baselineGeometrySignature ? JSON.stringify(geometrySignature) === JSON.stringify(baselineGeometrySignature) : 'load baseline to compare' },
        savedEvidence, probeCount: probes.length,
        recordedSample: sample ? { state: sample.state, mode: sample.mode, variant: sample.variant, quality: sample.quality, view: sample.view, visibility: sample.visibility,
          frames: sample.frames.length, elapsed: sample.elapsed, startTime: sample.startTime, endTime: sample.startTime,
          yawRangeDegrees: [-4, 4], fixedEye: [...VIEWS[sample.view].position], videoAvailable: Boolean(video), videoBytes: video?.size ?? 0, mime: sample.videoMime } : null };
      if (now - lastStatus > 180 || paused) { status.textContent = JSON.stringify(latestStats, null, 1); shoreMaterialNode.textContent = JSON.stringify(latestStats.shore, null, 2); if (document.activeElement !== timeInput) timeInput.value = time.toFixed(3); lastStatus = now; }
      document.body.dataset.ready = String(ready && !errors.length);
      document.body.dataset.variant = variant; document.body.dataset.quality = quality; document.body.dataset.view = view;
    } catch (error) { ready = false; fail('frame render', error); }
  }
  raf = requestAnimationFrame(draw);
}
function download(blob: Blob, suffix: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `shore-material-${variant}-${quality}-${view}-t${time.toFixed(2)}.${suffix}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function evidencePayload() {
  return { capturedAt: new Date().toISOString(), currentFrame: { camera: latestStats.camera, time: latestStats.time, diagnostic: lastRenderedDiagnostic },
    diagnostic: lastRenderedDiagnostic, requestedDiagnostic: diagnosticReadback(), stats: latestStats, sources: sourceMetadata, recordedSample: sample, probes, recentFrames: frameHistory,
    servedCurrentWaterSource: { 'water.ts': waterSource, 'water-streams.ts': streamSource, 'water-streams-optics.ts': opticsSource, 'water-surface.ts': surfaceSource, 'water-surface-shaders.ts': surfaceShaderSource, 'water-falls.ts': fallsSource, 'water-falls-shaders.ts': fallsShaderSource, 'water-shore.ts': shoreSource } };
}
async function saveEvidence(blob: Blob, extension: 'png' | 'webm' | 'json', stem?: string) {
  const stamp = new Date().toISOString().replace(/[-:.]/g, '');
  const filename = `${stem ?? `shore-material-${variant}-${quality}-${view}-t${time.toFixed(2)}-${stamp}`}.${extension}`;
  try {
    const response = await fetch('/__water_shore_material_evidence', { method: 'POST', headers: { 'content-type': blob.type, 'x-outlet-filename': filename }, body: blob });
    if (!response.ok) throw new Error(`Evidence save ${response.status}: ${await response.text()}`);
    savedEvidence.push(await response.json());
  } catch (error) { savedEvidence.push({ filename, fallback: 'browser download', error: String(error) }); download(blob, extension); }
}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.onclick = () => { stopSample('interrupted by camera change'); view = button.dataset.view as View; yawDegrees = 0; applyView(); });
qualityInput.onchange = () => { quality = qualityInput.value as Quality; void rebuildWaterAndGround(); };
variantInput.onchange = () => { variant = variantInput.value as Variant; void rebuildWaterAndGround(); };
for (const layer of Object.keys(visibilityInputs) as DiagnosticLayer[]) visibilityInputs[layer].onchange = () => {
  stopSample('interrupted by diagnostic visibility change'); visibilitySelection[layer] = visibilityInputs[layer].checked; applyDiagnostic(); syncControls();
};
document.getElementById('reset-pose')!.onclick = () => { stopSample('reset to original fixed pose'); yawDegrees = 0; applyView(); };
document.getElementById('probe-point')!.onclick = () => { void runPointProbe().catch(error => fail('point probe', error)); };
pauseButton.onclick = () => { const recording = sample?.state === 'recording'; stopSample('paused manually'); if (!recording) paused = !paused; syncControls(); };
// Keep a paused edit authoritative even if a RAF runs between blur and click.
timeInput.oninput = () => { const next = Number(timeInput.value); if (paused && Number.isFinite(next)) time = Math.max(0, next); };
document.getElementById('freeze')!.onclick = () => { const next = Number(timeInput.value); stopSample('frozen manually'); time = Number.isFinite(next) ? Math.max(0, next) : 2.4; paused = true; syncControls(); };
sampleButton.onclick = () => {
  if (!ready) return;
  sample = { state: 'recording', mode: 'fixed-eye-yaw', variant, quality, view, visibility: { ...visibilitySelection }, startWall: 0,
    startTime: 2.4, elapsed: 0, startYawDegrees: -4, endYawDegrees: 4, frames: [] };
  time = 2.4; paused = true; yawDegrees = -4; applyView(); video = undefined; videoButton.disabled = true; sampleButton.disabled = true;
  pendingCanvasRecording = true; syncControls();
};
function startCanvasRecording() {
  if (sample?.state !== 'recording') return;
  if (typeof MediaRecorder !== 'undefined' && renderer.domElement.captureStream) {
    try {
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
      const stream = renderer.domElement.captureStream(30), chunks: BlobPart[] = [];
      const activeRecorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 6000000 });
      recordingStream = stream; recorder = activeRecorder; sample.videoMime = activeRecorder.mimeType;
      activeRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      activeRecorder.onstop = () => { stream.getTracks().forEach(track => track.stop()); if (!disposed && recorder === activeRecorder) { video = new Blob(chunks, { type: activeRecorder.mimeType }); videoButton.disabled = !video.size; } };
      activeRecorder.start();
    } catch (error) { fail('video recording (frame data still records)', error); }
  }
}
document.getElementById('download-data')!.onclick = () => { void saveEvidence(new Blob([JSON.stringify(evidencePayload(), null, 2)], { type: 'application/json' }), 'json'); };
document.getElementById('download-frame')!.onclick = () => {
  const stamp = new Date().toISOString().replace(/[-:.]/g, ''), stem = `shore-material-${variant}-${quality}-${view}-t${time.toFixed(2)}-${stamp}`;
  renderer.domElement.toBlob(blob => { if (blob) void saveEvidence(blob, 'png', stem); });
  void saveEvidence(new Blob([JSON.stringify(evidencePayload(), null, 2)], { type: 'application/json' }), 'json', stem);
};
videoButton.onclick = () => { if (video) {
  const stamp = new Date().toISOString().replace(/[-:.]/g, ''), stem = `shore-material-${variant}-${quality}-${view}-t${time.toFixed(2)}-${stamp}`;
  void saveEvidence(video, 'webm', stem); void saveEvidence(new Blob([JSON.stringify(evidencePayload(), null, 2)], { type: 'application/json' }), 'json', stem);
} };
if (params.has('clean')) document.body.classList.add('clean');
window.addEventListener('resize', resize);

async function init() {
  const [frozen, baseline, response] = await Promise.all([
    import(/* @vite-ignore */ __OUTLET_CONTEXT_URL__) as Promise<FrozenContext>,
    import(/* @vite-ignore */ __OUTLET_BASELINE_URL__) as Promise<{ createReferenceWater: WaterFactory }>,
    fetch('/__water_shore_material_sources', { cache: 'no-store' }),
  ]);
  if (disposed) return;
  context = frozen; baselineFactory = baseline.createReferenceWater;
  sceneLayout = { ...context.REFERENCE_LAYOUT, water: context.REFERENCE_LAYOUT.water.filter(w => ['water.sea', 'water.pool', 'water.outlet'].includes(w.id) || w.kind === 'waterfall') };
  const servedSources = { 'water.ts': waterSource, 'water-streams.ts': streamSource, 'water-streams-optics.ts': opticsSource, 'water-surface.ts': surfaceSource, 'water-surface-shaders.ts': surfaceShaderSource, 'water-falls.ts': fallsSource, 'water-falls-shaders.ts': fallsShaderSource, 'water-shore.ts': shoreSource };
  const hashes = Object.fromEntries(await Promise.all(Object.entries(servedSources).map(async ([name, source]) => [name, await digest(source)])));
  liveHelperSHA256 = hashes['water-streams-optics.ts'];
  liveShoreSHA256 = hashes['water-shore.ts']; liveWaterSHA256 = hashes['water.ts'];
  sourceMetadata = { ...sourceMetadata, fetchedDiskReadback: response.ok ? await response.json() : { error: response.status }, servedCurrentWaterSHA256: hashes,
    ownPreviewSHA256: await digest(previewSource), ownHTMLSHA256: await digest(previewHtml), cameras: VIEWS, selectedLayout: sceneLayout,
    omittedFromIndependentScene: ['C scanned cliffs and pool-bed rocks', 'trees and other architecture', 'main/sacred waterfall mesh groups hidden; original tier inputs retained for pool impacts', 'D routes/support/carrier objects'],
    diagnosticProtocol: { allFiveLayersOnByDefault: true, recordedYawDegrees: [-4, 4], durationSeconds: 4, recordedWaterTime: 2.4,
      translation: false, pointProbe: 'Native control explicitly resets to original selected pose; actual Raycaster base-geometry hits, including hidden layers.' },
    actualContext: 'Reuse original r1 frozen referenceTerrainHeight/D base PlaneGeometry/PBR recipe and actual A outlet bridge/PBR. No current D re-freeze. Pool/sea/outlet use the selected formal water factory.' };
  sourceNode.textContent = JSON.stringify(sourceMetadata, null, 2);
  sky = new Sky(); sky.scale.setScalar(450);
  sky.material.uniforms.referenceSkyExposure = { value: 1 };
  sky.material.fragmentShader = sky.material.fragmentShader.replace('uniform float showSunDisc;', 'uniform float showSunDisc;\nuniform float referenceSkyExposure;')
    .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * referenceSkyExposure, 1.0 );');
  sky.material.uniforms.turbidity.value = 1.8; sky.material.uniforms.rayleigh.value = 2.5;
  sky.material.uniforms.mieCoefficient.value = .002; sky.material.uniforms.mieDirectionalG.value = .8; sky.material.uniforms.sunPosition.value.copy(sunDirection);
  sky.material.uniforms.cloudCoverage.value = .12; sky.material.uniforms.showSunDisc.value = false;
  const skyScene = new THREE.Scene(); skyScene.add(sky); const pmrem = new THREE.PMREMGenerator(renderer);
  environment = pmrem.fromScene(skyScene, .04, .1, 1000, { size: 128 }); pmrem.dispose();
  sky.material.uniforms.showSunDisc.value = true; sky.material.uniforms.referenceSkyExposure.value = .32;
  skyScene.remove(sky); scene.add(sky); scene.environment = environment.texture; scene.environmentIntensity = .2;
  architecture = await context.loadArchitectureMaterials({ quality: 'low', signal: abort.signal, baseUrl: new URL('/world3d/reference/architecture/', location.origin).href });
  if (disposed) { architecture.dispose(); architecture = undefined; return; }
  for (const material of Object.values(architecture)) if (material instanceof THREE.MeshStandardMaterial) { material.envMap = environment.texture; material.envMapIntensity *= .2; material.needsUpdate = true; }
  const placement = context.REFERENCE_LAYOUT.architecture.find(p => p.id === 'shore.outlet-bridge');
  if (!placement) throw new Error('Frozen D outlet bridge is missing');
  const model = context.buildReferenceBridge({ quality: 'low', stone: architecture.bridgeStone, mortar: architecture.mortar, capstone: architecture.bridgeStone });
  model.position.y = -2; bridge = new THREE.Group(); bridge.add(model); bridge.position.fromArray([...placement.position]); bridge.rotation.y = placement.yaw; bridge.name = placement.id; scene.add(bridge);
  renderHost = context.createReferenceRenderContext(renderer, scene);
  await rebuildWaterAndGround();
  applyView(); resize(); syncControls(); previous = performance.now(); raf = requestAnimationFrame(draw);
}
function dispose() {
  if (disposed) return; disposed = true; stopSample('page disposed'); cancelAnimationFrame(raf); abort.abort(); buildAbort.abort();
  recordingStream?.getTracks().forEach(track => track.stop()); window.removeEventListener('resize', resize);
  water?.dispose(); renderHost?.dispose(); releaseGround(ground); ground = undefined;
  bridge?.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); }); bridge?.removeFromParent(); architecture?.dispose();
  environment?.dispose(); sky?.geometry.dispose(); sky?.material.dispose(); sun.shadow.dispose(); scene.clear(); renderer.dispose(); renderer.forceContextLoss();
}
window.addEventListener('pagehide', dispose, { once: true }); if (import.meta.hot) import.meta.hot.dispose(dispose);
applyView(); resize(); syncControls(); void init().catch(error => { if (!disposed) fail('initialization', error); });
