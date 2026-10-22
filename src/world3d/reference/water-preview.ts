import * as THREE from 'three';
import type { WaterSurfaceQuality } from './water-surface';
import { createWaterSampleEnvironment } from './water-sample-environment';
import type { ReferenceLayout, ReferenceOffscreenPass, ReferenceRenderFrame, ReferenceWaterLayer } from './contracts';
import { REFERENCE_LAYOUT } from './layout';
import { createReferenceWater } from './water';

if (!import.meta.env.DEV) throw new Error('Water diagnostic preview is development only');
const query = new URLSearchParams(location.search);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#79b3d5');
scene.fog = new THREE.Fog('#a4c5ce', 55, 150);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.info.autoReset = false;
document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(49, 16 / 9, .1, 200);
const sunDirection = new THREE.Vector3(-.56, .75, .36).normalize();
const sun = new THREE.DirectionalLight('#fff0d0', 3.1); sun.position.copy(sunDirection).multiplyScalar(35); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 28, bottom: -28, near: 1, far: 100 });
sun.shadow.bias = -.0003; sun.shadow.normalBias = .035; sun.target.position.set(0, 0, -3); scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#c8e1ee', '#665a3c', 1.15));
const environment = createWaterSampleEnvironment(); scene.add(environment.root);
let quality: WaterSurfaceQuality = (['high', 'medium', 'low'] as const).includes(query.get('quality') as WaterSurfaceQuality) ? query.get('quality') as WaterSurfaceQuality : 'high';
renderer.shadowMap.enabled = quality !== 'low';
const sampleLayout: ReferenceLayout = { ...REFERENCE_LAYOUT, water: [
  { id: 'diagnostic-pool', kind: 'pool', controlledBySpring: false, outline: [[-24, 0, -14], [24, 0, -14], [24, 0, 30.5], [-24, 0, 30.5]] },
  { id: 'diagnostic-upper', kind: 'waterfall', controlledBySpring: false, tiers: [{ top: [-1.6, 12.9, -11], bottom: [-1, 8.55, -7], width: 5.7 }] },
  { id: 'diagnostic-main', kind: 'waterfall', controlledBySpring: false, tiers: [{ top: [2.8, 8.05, -4.7], bottom: [3.2, .04, -1.1], width: 6.2 }] },
  { id: 'diagnostic-left', kind: 'waterfall', controlledBySpring: false, tiers: [{ top: [-2.8, 7.8, -5.1], bottom: [-3.9, .03, -2.2], width: 1.65 }] },
  { id: 'diagnostic-right', kind: 'waterfall', controlledBySpring: false, tiers: [{ top: [8.8, 7.4, -4.9], bottom: [10, .03, -1.2], width: 1.8 }] },
  { id: 'diagnostic-terrace-flow', kind: 'stream', width: 5.7, controlledBySpring: false, points: [[-1, 8.55, -7], [1.2, 8.28, -5.8], [2.8, 8.05, -4.7]] },
] };
const layerAbort = new AbortController();
let water: ReferenceWaterLayer | undefined;
const makeWater = (signal = layerAbort.signal, layout = sampleLayout) => createReferenceWater({ layout, quality, signal, renderContext: { renderer, scene }, lighting: { environment: null, environmentKind: 'none', sunDirection: sunDirection.toArray() as [number, number, number], sunColor: '#fff0d0', skyTop: '#79b3d5', skyHorizon: '#c5d7d6' }, terrainHeight: environment.terrainHeight, walkHeight: environment.terrainHeight });
async function restoreWater() { const layer = await makeWater(); if (layerAbort.signal.aborted || disposed) { layer.dispose(); return; } water?.dispose(); water = layer; scene.add(layer.root); }
void restoreWater().catch(error => { document.getElementById('status')!.textContent = String(error); });
const views = {
  front: { position: [11, 3.6, 24], target: [0, 4.1, -4], fov: 52 },
  side: { position: [-17, 4.5, 15], target: [2, 3.8, -4], fov: 52 },
  near: { position: [6.5, 1.55, 19], target: [1, -.5, 7], fov: 59 },
  away: { position: [11, 3.6, 24], target: [11, -10, 48], fov: 55 },
} as const;
const requestedView = query.get('view') ?? 'front';
let view: keyof typeof views = requestedView in views ? requestedView as keyof typeof views : 'front';
let disposed = false, paused = query.has('paused'), time = Number(query.get('time')) || 2.4, previous = performance.now(), raf = 0, frame = 0;
let latestStats = {};
let stackedPoolCheck: { abort: AbortController; main: ReferenceWaterLayer | undefined } | undefined;
let renderingCapture = false, offscreenPasses = 0;
let rejectedKind = '', budgetOverride: { maxPasses: number; maxTargetSize: number } | undefined;
let captureKinds: string[] = [];
const captureHistory: Array<{ frame: number; accepted: string[] }> = [];
const captureBudget = () => budgetOverride ?? { maxPasses: quality === 'low' ? 0 : quality === 'medium' ? 1 : 2, maxTargetSize: quality === 'high' ? 1024 : quality === 'medium' ? 512 : 0 };
// Diagnostic host for D's exact contract. Production water never calls renderer.render.
function renderOffscreen(pass: ReferenceOffscreenPass) {
  const budget = captureBudget();
  if (renderingCapture || quality === 'low' || offscreenPasses >= budget.maxPasses || Math.max(pass.target.width, pass.target.height) > budget.maxTargetSize || pass.kind === rejectedKind) return false;
  const target = renderer.getRenderTarget(), cube = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
  const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4()), scissorTest = renderer.getScissorTest();
  const clipping = renderer.clippingPlanes, localClipping = renderer.localClippingEnabled, xr = renderer.xr.enabled, autoClear = renderer.autoClear;
  const shadowAuto = renderer.shadowMap.autoUpdate, shadowNeeds = renderer.shadowMap.needsUpdate, clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
  const hidden = [...new Set(pass.exclude)], visibility = hidden.map(o => o.visible), override = scene.overrideMaterial;
  renderingCapture = true;
  try { hidden.forEach(o => { o.visible = false; }); renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false; renderer.autoClear = true;
    if (pass.clippingPlane) { renderer.clippingPlanes = [...clipping, pass.clippingPlane.clone()]; renderer.localClippingEnabled = true; }
    // setRenderTarget applies target.viewport in physical pixels; setViewport here
    // would multiply by the main DPR again and crop/zoom the capture.
    renderer.setScissorTest(false); renderer.setRenderTarget(pass.target); renderer.clear(true, true, true); renderer.render(scene, pass.camera); offscreenPasses++; captureKinds.push(pass.kind); return true;
  } finally { hidden.forEach((o, i) => { o.visible = visibility[i]; }); scene.overrideMaterial = override; renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = shadowAuto; renderer.shadowMap.needsUpdate = shadowNeeds; renderer.autoClear = autoClear; renderer.clippingPlanes = clipping; renderer.localClippingEnabled = localClipping; renderer.setRenderTarget(target, cube, mip); renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest); renderer.setClearColor(clearColor, clearAlpha); renderingCapture = false; }
}
function applyView() { const v = views[view]; camera.position.fromArray([...v.position]); camera.lookAt(new THREE.Vector3(...v.target)); camera.fov = v.fov; camera.updateProjectionMatrix(); }
function resize() { const ratio = quality === 'low' ? .8 : quality === 'medium' ? 1.1 : 1.35; const cap = quality === 'low' ? 850000 : quality === 'medium' ? 1800000 : 2600000; renderer.setPixelRatio(Math.min(ratio, devicePixelRatio, Math.sqrt(cap / (innerWidth * innerHeight)))); renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); water?.resize?.(innerWidth, innerHeight); }
function draw(now: number) { if (disposed) return; const delta = Math.min((now - previous) / 1000, .05); previous = now; if (!paused) time += delta; water?.update(time, camera.position); camera.updateMatrixWorld(true); scene.updateMatrixWorld(true); renderer.info.reset(); offscreenPasses = 0; captureKinds = []; const renderFrame: ReferenceRenderFrame = { frameNumber: frame, time, delta, renderer, scene, camera, viewport: { width: innerWidth, height: innerHeight, pixelRatio: renderer.getPixelRatio() }, offscreenBudget: captureBudget(), renderOffscreen }; water?.beforeRender?.(renderFrame); renderer.render(scene, camera); captureHistory.push({ frame, accepted: captureKinds }); if (captureHistory.length > 20) captureHistory.shift(); frame++;
  latestStats = { actualWebGL: true, productionFactory: true, view, quality, time: Math.round(time * 1000) / 1000, frame, camera: camera.position.toArray(), target: views[view].target, fov: camera.fov, aspect: camera.aspect, buffer: [renderer.domElement.width, renderer.domElement.height], exposure: renderer.toneMappingExposure, toneMapping: 'ACESFilmic', sun: sunDirection.toArray(), allPasses: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, points: renderer.info.render.points }, budget: captureBudget(), accepted: captureKinds, water: water?.root.userData.waterDiagnostics, memory: { ...renderer.info.memory } };
  if (frame % 12 === 0) document.getElementById('status')!.textContent = JSON.stringify(latestStats, null, 1); document.body.dataset.ready = String(Boolean(water)); raf = requestAnimationFrame(draw);
}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.onclick = () => { view = button.dataset.view as keyof typeof views; applyView(); });
const qualitySelect = document.getElementById('quality') as HTMLSelectElement; qualitySelect.value = quality; qualitySelect.onchange = () => { quality = qualitySelect.value as WaterSurfaceQuality; water?.setQuality(quality); renderer.shadowMap.enabled = quality !== 'low'; resize(); };
document.getElementById('pause')!.onclick = () => { paused = !paused; document.getElementById('pause')!.textContent = paused ? '继续动态' : '暂停动态'; };
document.getElementById('clean')!.onclick = () => document.body.classList.add('clean');
if (query.has('clean')) document.body.classList.add('clean');
const key = (event: KeyboardEvent) => { if (event.key === 'Escape') document.body.classList.remove('clean'); };
window.addEventListener('keydown', key); window.addEventListener('resize', resize);
function dispose() { if (disposed) return; disposed = true; cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('keydown', key); layerAbort.abort(); stackedPoolCheck?.abort.abort(); stackedPoolCheck?.main?.dispose(); water?.dispose(); water = undefined; environment.dispose(); sun.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss(); }
// A developer-only real-GL check of r4's two water levels. It reuses the live
// host render hook; the diagnostic rocks are not the integrated C/D scene.
async function verifyStackedPoolCaptures() {
  if (disposed) throw new DOMException('Water preview disposed', 'AbortError');
  if (stackedPoolCheck) throw new Error('Stacked pool check already running');
  const main = water, abort = new AbortController();
  const active = { abort, main }; stackedPoolCheck = active;
  const check = () => { if (disposed || abort.signal.aborted) throw new DOMException('Water preview disposed', 'AbortError'); };
  const saved = { quality, budgetOverride, rejectedKind, position: camera.position.clone(),
    quaternion: camera.quaternion.clone(), fov: camera.fov, visible: main?.root.visible };
  let probe: ReferenceWaterLayer | undefined;
  try {
    quality = 'medium'; budgetOverride = { maxPasses: 1, maxTargetSize: 512 }; rejectedKind = '';
    probe = await makeWater(abort.signal, { ...REFERENCE_LAYOUT, water: REFERENCE_LAYOUT.water.filter(source => source.kind === 'pool') });
    check();
    if (main) main.root.visible = false;
    water = probe; scene.add(probe.root); resize();
    camera.fov = 60; camera.updateProjectionMatrix();
    const stages = [];
    for (const height of [3.16, 15]) {
      camera.position.set(24, height, 20); camera.rotation.set(-.09, -.27, 0, 'YXZ');
      const startFrame = frame;
      for (let i = 0; i < 7; i++) { await new Promise(requestAnimationFrame); check(); }
      stages.push({ height, camera: camera.position.toArray(),
        frames: captureHistory.filter(entry => entry.frame >= startFrame),
        diagnostics: structuredClone(probe.root.userData.waterDiagnostics) });
    }
    return { actualWebGL: true, scene: 'r4 pool layout with diagnostic environment; not integrated C/D art or performance acceptance',
      budget: captureBudget(), stages };
  } finally {
    abort.abort(); probe?.dispose();
    if (stackedPoolCheck === active) stackedPoolCheck = undefined;
    if (disposed) main?.dispose();
    else {
      water = main; if (main) main.root.visible = saved.visible!;
      quality = saved.quality; budgetOverride = saved.budgetOverride; rejectedKind = saved.rejectedKind;
      camera.position.copy(saved.position); camera.quaternion.copy(saved.quaternion); camera.fov = saved.fov;
      renderer.shadowMap.enabled = quality !== 'low'; resize();
    }
  }
}
Object.assign(window, { __waterSample: { getStats: () => latestStats, getCaptureHistory: () => captureHistory, setBudget: (maxPasses: number, maxTargetSize: number) => { budgetOverride = { maxPasses, maxTargetSize }; }, setRejectedKind: (kind: string) => { rejectedKind = kind; }, setTime: (value: number) => { time = value; paused = true; }, setPlaying: (value: boolean) => { paused = !value; }, setView: (value: keyof typeof views) => { view = value; applyView(); }, setQuality: (value: WaterSurfaceQuality) => { qualitySelect.value = value; qualitySelect.onchange?.(new Event('change')); }, disposeWater: () => { water?.dispose(); water?.dispose(); water = undefined; }, restoreWater,
  verifyStackedPoolCaptures,
  verifyAbort: async () => { const before = new AbortController(); before.abort(); let alreadyAborted = ''; try { await makeWater(before.signal); } catch (error) { alreadyAborted = (error as DOMException).name; } const late = new AbortController(); const pending = makeWater(late.signal); late.abort(); const result = await pending; const lateChildren = result.root.children.length; result.dispose(); result.dispose(); return { alreadyAborted, lateChildren, lateDetached: result.root.parent === null }; },
  verifyPoolFairness: async () => { const main = water, abort = new AbortController(); const pools: ReferenceLayout = { ...sampleLayout, water: [
    { id: 'probe-left-pool', kind: 'pool', controlledBySpring: false, outline: [[-10,0,0],[0,0,0],[0,0,12],[-10,0,12]] },
    { id: 'probe-right-pool', kind: 'pool', controlledBySpring: false, outline: [[1,0,0],[11,0,0],[11,0,12],[1,0,12]] },
  ] }; const probe = await makeWater(abort.signal, pools); try { if (main) main.root.visible = false; water = probe; scene.add(probe.root); for (let i=0;i<7;i++) await new Promise(requestAnimationFrame); return probe.root.userData.waterDiagnostics; } finally { abort.abort(); probe.dispose(); water = main; if (main) main.root.visible = true; } }, dispose } });
window.addEventListener('pagehide', dispose, { once: true }); if (import.meta.hot) import.meta.hot.dispose(dispose);
applyView(); resize(); raf = requestAnimationFrame(draw);
