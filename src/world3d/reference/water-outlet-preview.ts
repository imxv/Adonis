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
import previewSource from './water-outlet-preview.ts?raw';
import previewHtml from './water-outlet-preview.html?raw';

declare const __OUTLET_CONTEXT_URL__: string;
declare const __OUTLET_BASELINE_URL__: string;
declare const __OUTLET_BOOT_META__: Record<string, unknown>;

if (!import.meta.env.DEV) throw new Error('Outlet optical preview is development only');
type Quality = 'low' | 'medium';
type Variant = 'baseline' | 'current';
type Diagnostic = 'normal' | 'hide-bed' | 'hide-water';
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
let variant: Variant = params.get('variant') === 'current' ? 'current' : 'baseline';
// Visibility isolation is an explicit diagnostic control. Every load starts normal.
let diagnostic: Diagnostic = 'normal';
let time = Number.isFinite(Number(params.get('time'))) && params.has('time') ? Math.max(0, Number(params.get('time'))) : 2.4;
let paused = !params.has('playing'), disposed = false, ready = false, generation = 0, raf = 0, frameNumber = 0;
let previous = performance.now(), lastStatus = 0;
const status = document.getElementById('status')!;
const sourceNode = document.getElementById('source-metadata')!;
const errorNode = document.getElementById('error-log')!;
const qualityInput = document.getElementById('quality') as HTMLSelectElement;
const variantInput = document.getElementById('variant') as HTMLSelectElement;
const diagnosticInput = document.getElementById('diagnostic') as HTMLSelectElement;
const timeInput = document.getElementById('time') as HTMLInputElement;
const pauseButton = document.getElementById('pause') as HTMLButtonElement;
const sampleButton = document.getElementById('run-sample') as HTMLButtonElement;
const videoButton = document.getElementById('download-video') as HTMLButtonElement;
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
let liveHelperSHA256 = '';
let lastRenderedDiagnostic: Record<string, unknown> | null = null;
const originalOutletVisibility = new WeakMap<THREE.Object3D, boolean>();
let sourceMetadata: Record<string, unknown> = { ...__OUTLET_BOOT_META__, scope: 'Independent optical scene; not the e671 integrated browser scene.' };
let latestStats: Record<string, unknown> = {};
let sample: { state: string; variant: Variant; quality: Quality; view: View; diagnostic: Diagnostic; startWall: number; startTime: number; frames: unknown[]; videoMime?: string } | undefined;
let recorder: MediaRecorder | undefined, recordingStream: MediaStream | undefined, video: Blob | undefined;
const frameHistory: unknown[] = [];
const savedEvidence: unknown[] = [];

function fail(kind: string, error: unknown) {
  const message = error instanceof Error ? error.stack ?? error.message : typeof error === 'string' ? error : JSON.stringify(error, null, 2);
  errors.push({ kind, message, time: new Date().toISOString() });
  errorNode.textContent = JSON.stringify(errors, null, 2);
  document.body.dataset.error = message;
}
const scene = new THREE.Scene(); scene.name = 'Outlet optical comparison / independent frozen D-A context';
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
  for (const name of ['water.outlet', 'water.outlet.channel-bed']) {
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
function diagnosticReadback() {
  const waterMesh = water?.root.getObjectByName('water.outlet');
  const bedMesh = water?.root.getObjectByName('water.outlet.channel-bed');
  return { mode: diagnostic, purpose: 'Visibility isolation only; diagnostic views are not acceptance evidence.',
    outletWater: { found: Boolean(waterMesh), visible: waterMesh?.visible ?? null, originalVisible: waterMesh ? originalOutletVisibility.get(waterMesh) ?? null : null },
    originalOutletBed: { found: Boolean(bedMesh), visible: bedMesh?.visible ?? null, originalVisible: bedMesh ? originalOutletVisibility.get(bedMesh) ?? null : null } };
}
function publishSourceProof() {
  sourceMetadata = { ...sourceMetadata, outletMaterial: outletMaterialProof, diagnostic: diagnosticReadback() };
  sourceNode.textContent = JSON.stringify(sourceMetadata, null, 2);
}
function applyDiagnostic() {
  for (const [name, hide] of [['water.outlet', diagnostic === 'hide-water'], ['water.outlet.channel-bed', diagnostic === 'hide-bed']] as const) {
    const object = water?.root.getObjectByName(name);
    if (!object) continue;
    if (!originalOutletVisibility.has(object)) originalOutletVisibility.set(object, object.visible);
    object.visible = hide ? false : originalOutletVisibility.get(object)!;
  }
  document.body.dataset.diagnostic = diagnostic;
  publishSourceProof();
}
function applyView() {
  const pose = VIEWS[view]; camera.position.fromArray([...pose.position]); camera.lookAt(new THREE.Vector3(...pose.target)); camera.fov = pose.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
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
  sample.state = state; paused = true; sampleButton.disabled = false;
  if (recorder?.state === 'recording') recorder.stop();
  else recordingStream?.getTracks().forEach(track => track.stop());
  syncControls();
}
function syncControls() {
  pauseButton.textContent = paused ? '播放动态' : '暂停动态'; pauseButton.setAttribute('aria-pressed', String(!paused));
  qualityInput.value = quality; variantInput.value = variant; diagnosticInput.value = diagnostic; timeInput.value = time.toFixed(3);
  sampleButton.textContent = sample?.state === 'recording' ? '正在记录4秒…' : '连续记录4秒';
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
    if (disposed || signal.aborted || ticket !== generation) throw new DOMException('Preview build superseded', 'AbortError');
    if (candidateGround) { releaseGround(ground); ground = candidateGround; candidateGround = undefined; scene.add(ground.mesh); }
    water?.dispose(); water = candidateWater; candidateWater = undefined; scene.add(water.root);
    geometrySignature = proof; if (requested === 'baseline') baselineGeometrySignature = proof;
    outletMaterialProof = activeMaterialProof; applyDiagnostic();
    ready = true; resize(); syncControls();
  } catch (error) {
    candidateWater?.dispose(); releaseGround(candidateGround);
    if (!signal.aborted && !disposed && ticket === generation) fail('scene/water resources', error);
  }
}
function cameraReadback() {
  const pose = VIEWS[view]; return { view, position: camera.position.toArray(), target: [...pose.target], quaternion: camera.quaternion.toArray(), rotationYXZ: [camera.rotation.x, camera.rotation.y, camera.rotation.z], fov: camera.fov, aspect: camera.aspect, projectionMatrix: camera.projectionMatrix.toArray(), provenance: pose.provenance };
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
function draw(now: number) {
  if (disposed) return;
  const delta = Math.max(0, Math.min((now - previous) / 1000, .05)); previous = now;
  if (ready) {
    if (sample?.state === 'recording') time = sample.startTime + Math.min(4, (now - sample.startWall) / 1000);
    else if (!paused) time += delta;
    try {
      water!.update(time, camera.position);
      const cost = renderHost!.render({ camera, time, delta, quality, viewport: { width: innerWidth, height: innerHeight, pixelRatio: renderer.getPixelRatio() }, beforeRender: frame => water?.beforeRender?.(frame) });
      frameNumber++;
      lastRenderedDiagnostic = diagnosticReadback();
      const data = { frame: frameNumber, time: +time.toFixed(5), variant, quality, view, diagnostic: lastRenderedDiagnostic, ...cost };
      frameHistory.push(data); if (frameHistory.length > 180) frameHistory.shift();
      if (sample?.state === 'recording') { sample.frames.push(data); if (now - sample.startWall >= 4000) stopSample(); }
      latestStats = { actualWebGL: true, sceneKind: 'independent frozen D soil/A bridge; not e671 integrated scene', ready, variant, quality, paused, time: +time.toFixed(5), frame: frameNumber,
        camera: cameraReadback(), canvas: { css: [innerWidth, innerHeight], pixels: [renderer.domElement.width, renderer.domElement.height], pixelRatio: renderer.getPixelRatio(), browserDPR: devicePixelRatio },
        lighting: { exposure: 1.05, toneMapping: 'ACESFilmic', sunDirection: sunDirection.toArray(), sunIntensity: 3.3, hemisphere: .45, environmentWeight: .2, PMREMface: 128, visibleSkyRadiance: .32 },
        frameCost: cost, captureBudget: quality === 'low' ? { maxPasses: 0, maxTargetSize: 0 } : { maxPasses: 1, maxTargetSize: 512 },
        water: water?.root.userData.waterDiagnostics, memory: { ...renderer.info.memory }, compileErrorCount: errors.length,
        outletMaterial: outletMaterialProof, outletBed: outletBedReadback(), diagnostic: lastRenderedDiagnostic,
        geometry: { streamAndBed: geometrySignature, identicalToLoadedBaseline: baselineGeometrySignature ? JSON.stringify(geometrySignature) === JSON.stringify(baselineGeometrySignature) : 'load baseline to compare' },
        savedEvidence,
        sample: sample ? { state: sample.state, frames: sample.frames.length, startTime: sample.startTime, endTime: time, videoAvailable: Boolean(video), videoBytes: video?.size ?? 0, mime: sample.videoMime } : null };
      if (now - lastStatus > 180 || paused) { status.textContent = JSON.stringify(latestStats, null, 1); if (document.activeElement !== timeInput) timeInput.value = time.toFixed(3); lastStatus = now; }
      document.body.dataset.ready = String(ready && !errors.length);
      document.body.dataset.variant = variant; document.body.dataset.quality = quality; document.body.dataset.view = view;
    } catch (error) { ready = false; fail('frame render', error); }
  }
  raf = requestAnimationFrame(draw);
}
function download(blob: Blob, suffix: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `outlet-${variant}-${quality}-${view}-t${time.toFixed(2)}.${suffix}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function evidencePayload() {
  return { capturedAt: new Date().toISOString(), diagnostic: lastRenderedDiagnostic, requestedDiagnostic: diagnosticReadback(), stats: latestStats, sources: sourceMetadata, sample, recentFrames: frameHistory,
    servedCurrentWaterSource: { 'water.ts': waterSource, 'water-streams.ts': streamSource, 'water-streams-optics.ts': opticsSource, 'water-surface.ts': surfaceSource, 'water-surface-shaders.ts': surfaceShaderSource, 'water-falls.ts': fallsSource, 'water-falls-shaders.ts': fallsShaderSource, 'water-shore.ts': shoreSource } };
}
async function saveEvidence(blob: Blob, extension: 'png' | 'webm' | 'json', stem?: string) {
  const stamp = new Date().toISOString().replace(/[-:.]/g, '');
  const filename = `${stem ?? `outlet-${variant}-${quality}-${view}-t${time.toFixed(2)}-${stamp}`}.${extension}`;
  try {
    const response = await fetch('/__water_outlet_evidence', { method: 'POST', headers: { 'content-type': blob.type, 'x-outlet-filename': filename }, body: blob });
    if (!response.ok) throw new Error(`Evidence save ${response.status}: ${await response.text()}`);
    savedEvidence.push(await response.json());
  } catch (error) { savedEvidence.push({ filename, fallback: 'browser download', error: String(error) }); download(blob, extension); }
}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.onclick = () => { stopSample('interrupted by camera change'); view = button.dataset.view as View; applyView(); });
qualityInput.onchange = () => { quality = qualityInput.value as Quality; void rebuildWaterAndGround(); };
variantInput.onchange = () => { variant = variantInput.value as Variant; void rebuildWaterAndGround(); };
diagnosticInput.onchange = () => {
  stopSample('interrupted by diagnostic visibility change');
  diagnostic = diagnosticInput.value as Diagnostic; applyDiagnostic(); syncControls();
};
pauseButton.onclick = () => { const recording = sample?.state === 'recording'; stopSample('paused manually'); if (!recording) paused = !paused; syncControls(); };
// Keep a paused edit authoritative even if a RAF runs between blur and click.
timeInput.oninput = () => { const next = Number(timeInput.value); if (paused && Number.isFinite(next)) time = Math.max(0, next); };
document.getElementById('freeze')!.onclick = () => { const next = Number(timeInput.value); stopSample('frozen manually'); time = Number.isFinite(next) ? Math.max(0, next) : 2.4; paused = true; syncControls(); };
sampleButton.onclick = () => {
  if (!ready) return;
  sample = { state: 'recording', variant, quality, view, diagnostic, startWall: performance.now(), startTime: 2.4, frames: [] };
  time = 2.4; paused = false; video = undefined; videoButton.disabled = true; sampleButton.disabled = true;
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
  syncControls();
};
document.getElementById('download-data')!.onclick = () => { void saveEvidence(new Blob([JSON.stringify(evidencePayload(), null, 2)], { type: 'application/json' }), 'json'); };
document.getElementById('download-frame')!.onclick = () => {
  const stamp = new Date().toISOString().replace(/[-:.]/g, ''), stem = `outlet-${variant}-${quality}-${view}-t${time.toFixed(2)}-${stamp}`;
  renderer.domElement.toBlob(blob => { if (blob) void saveEvidence(blob, 'png', stem); });
  void saveEvidence(new Blob([JSON.stringify(evidencePayload(), null, 2)], { type: 'application/json' }), 'json', stem);
};
videoButton.onclick = () => { if (video) { void saveEvidence(video, 'webm'); void saveEvidence(new Blob([JSON.stringify(evidencePayload(), null, 2)], { type: 'application/json' }), 'json'); } };
if (params.has('clean')) document.body.classList.add('clean');
window.addEventListener('resize', resize);

async function init() {
  const [frozen, baseline, response] = await Promise.all([
    import(/* @vite-ignore */ __OUTLET_CONTEXT_URL__) as Promise<FrozenContext>,
    import(/* @vite-ignore */ __OUTLET_BASELINE_URL__) as Promise<{ createReferenceWater: WaterFactory }>,
    fetch('/__water_outlet_sources', { cache: 'no-store' }),
  ]);
  if (disposed) return;
  context = frozen; baselineFactory = baseline.createReferenceWater;
  sceneLayout = { ...context.REFERENCE_LAYOUT, water: context.REFERENCE_LAYOUT.water.filter(w => ['water.sea', 'water.pool', 'water.outlet'].includes(w.id) || w.kind === 'waterfall') };
  const servedSources = { 'water.ts': waterSource, 'water-streams.ts': streamSource, 'water-streams-optics.ts': opticsSource, 'water-surface.ts': surfaceSource, 'water-surface-shaders.ts': surfaceShaderSource, 'water-falls.ts': fallsSource, 'water-falls-shaders.ts': fallsShaderSource, 'water-shore.ts': shoreSource };
  const hashes = Object.fromEntries(await Promise.all(Object.entries(servedSources).map(async ([name, source]) => [name, await digest(source)])));
  liveHelperSHA256 = hashes['water-streams-optics.ts'];
  sourceMetadata = { ...sourceMetadata, fetchedDiskReadback: response.ok ? await response.json() : { error: response.status }, servedCurrentWaterSHA256: hashes,
    ownPreviewSHA256: await digest(previewSource), ownHTMLSHA256: await digest(previewHtml), cameras: VIEWS, selectedLayout: sceneLayout,
    omittedFromIndependentScene: ['C scanned cliffs and pool-bed rocks', 'trees and other architecture', 'main/sacred waterfall mesh groups hidden; original tier inputs retained for pool impacts', 'D routes/support/carrier objects'],
    actualContext: 'Frozen referenceTerrainHeight + exact D base PlaneGeometry/PBR recipe, actual A outlet bridge and PBR; pool/sea/outlet use the selected formal water factory.' };
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
