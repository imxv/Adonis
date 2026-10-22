import { ACESFilmicToneMapping, PCFShadowMap, PerspectiveCamera, Vector3, WebGLRenderer } from 'three';
import { createWorldControls } from './controls';
import { createEnvironment } from './environment';
import { createWorldInterface } from './interface';
import { AREAS, DIRECTIONS, DISCOVERIES as LEGACY_DISCOVERIES, VALVES as LEGACY_VALVES } from './content';
import { REFERENCE_LAYOUT } from './reference/layout';
import type { ReferenceCameraId } from './reference/contracts';
import type { ReferenceComposition } from './reference/composition';
import { createReferenceRenderContext } from './reference/render-context';
import type { GreekWorldHandle, GreekWorldOptions, GreekWorldQuality, WorldEnvironment } from './types';

export type { GreekWorldHandle, GreekWorldOptions, GreekWorldQuality } from './types';

/** Import this module only on entry. Its entire Three.js dependency remains in the lazy chunk. */
export function mountGreekWorld(options: GreekWorldOptions): Promise<GreekWorldHandle> {
  return mountWorld(options);
}
/** Development reference slice. Gallery stays on the previous runtime until visual acceptance. */
export function mountGreekReferenceWorld(options: GreekWorldOptions, view: ReferenceCameraId = 'coast'): Promise<GreekWorldHandle> {
  return mountWorld(options, view);
}
async function mountWorld(options: GreekWorldOptions, referenceView?: ReferenceCameraId): Promise<GreekWorldHandle> {
  const reference = referenceView !== undefined;
  const DISCOVERIES = reference ? LEGACY_DISCOVERIES.map(item => {
    const p = REFERENCE_LAYOUT.discoveries.find(p => p.id === item.id)!;
    return { ...item, x: p.position[0], z: p.position[2], radius: p.radius };
  }) : LEGACY_DISCOVERIES;
  const VALVES = reference ? LEGACY_VALVES.map((item, i) => ({ ...item, x: REFERENCE_LAYOUT.valves[i].position[0], z: REFERENCE_LAYOUT.valves[i].position[2] })) : LEGACY_VALVES;
  if (options.signal?.aborted) throw new DOMException('探索已取消', 'AbortError');
  const lifetime = new AbortController();
  let disposed = false, exited = false, ready = false, contextLost = false;
  let renderer: WebGLRenderer | undefined;
  let world: WorldEnvironment | undefined;
  let referenceWorld: ReferenceComposition | undefined;
  let renderContext: ReturnType<typeof createReferenceRenderContext> | undefined;
  let controls: ReturnType<typeof createWorldControls> | undefined;
  let observer: ResizeObserver | undefined;
  let raf = 0;
  let externalPause = false, userPause = true, modalPause = false;
  let quality: GreekWorldQuality = !options.quality || options.quality === 'auto' ? (matchMedia('(pointer: coarse)').matches ? 'low' : 'medium') : options.quality;
  const found = new Set(options.discoveredIds ?? []);
  const rotations = [1, 0, 1];
  let springRestored = false;
  let frameCount = 0, frameTime = 0, statusTime = 0;
  let renderDirty = true;
  let warmFrames = 0;
  let nearby: { kind: 'discovery' | 'valve'; index: number; label: string } | null = null;
  const position = new Vector3();
  const camera = new PerspectiveCamera(66, 1, 0.12, 380);
  camera.rotation.order = 'YXZ';
  const ui = createWorldInterface(options.container, {
    onExit: exit,
    onPlay() {
      if (!ready || disposed || contextLost) return;
      userPause = false; updateEnabled();
      renderer?.domElement.focus({ preventScroll: true });
      // This call stays in the actual user click stack, as required by pointer lock.
      void controls?.lock();
    },
    onInteract: interact,
    onQuality(next) { quality = next; ui.setQuality(next); world?.setQuality(next); resize(); warmFrames = reference ? 6 : 0; if (referenceWorld) void referenceWorld.whenReady().then(() => { if (!disposed) { renderDirty = true; warmFrames = 6; } }).catch(error => { if (!disposed) console.error('Reference quality assets failed', error); }); },
    onSensitivity(value) { controls?.setSensitivity(value); },
    onModal(open) { modalPause = open; if (open) controls?.unlock(); updateEnabled(); },
  });
  ui.setQuality(quality);
  ui.setLoading('正在铺开爱琴海的画卷', 0.08);
  function paused() { return externalPause || userPause || modalPause || document.hidden; }
  function updateEnabled() { controls?.setEnabled(ready && !disposed && !paused()); updateStatus(); }
  function exit() {
    if (exited) return;
    exited = true;
    dispose();
    options.onExit();
  }
  function dispose() {
    if (disposed) return;
    disposed = true; ready = false;
    lifetime.abort();
    cancelAnimationFrame(raf);
    observer?.disconnect();
    controls?.dispose();
    renderContext?.dispose();
    world?.dispose();
    if (renderer) {
      renderer.setAnimationLoop(null);
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
    options.signal?.removeEventListener('abort', dispose);
    ui.dispose();
  }
  function resize() {
    if (disposed || !renderer) return;
    const rect = ui.viewport.getBoundingClientRect();
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    const cap = quality === 'high' ? 1.65 : quality === 'medium' ? 1.25 : 0.8;
    // Limit both pixel density and total pixels; tablets do not inherit a desktop GPU budget.
    const pixelBudget = quality === 'high' ? 2_800_000 : quality === 'medium' ? 1_800_000 : 850_000;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap, Math.sqrt(pixelBudget / (width * height))));
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.shadowMap.needsUpdate = true;
    renderDirty = true;
    // Two pools need four alternating cached channels under the shared 1-pass
    // medium budget; paused resize/quality previews still get a finite warm-up.
    warmFrames = reference ? 6 : 0;
    referenceWorld?.resize(width, height);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    ui.root.dataset.quality = quality;
    ui.root.dataset.renderSize = `${renderer.domElement.width}×${renderer.domElement.height}`;
  }
  function area() { return reference ? position.y > 21 && position.z < -25 ? AREAS[2] : position.z < 1 ? AREAS[1] : AREAS[0] : position.z < -108 ? AREAS[2] : position.z < -25 ? AREAS[1] : AREAS[0]; }
  function objective() {
    if (found.has('greek.temple.first-light')) return '画册已记录第一束光 · 可返回画廊';
    if (springRestored) return '穿过已开启的山门，抵达神庙内殿';
    if (found.has('greek.coast.tide-mural') || found.has('greek.grove.olive-oath')) return '依照线索转动三座引水盘，唤醒圣泉';
    return '沿海岸寻找潮汐壁画，再前往橄榄圣林';
  }
  function updateStatus() {
    if (disposed) return;
    const heading = ((-(controls?.yaw ?? 0) * 180 / Math.PI) % 360 + 360) % 360;
    const compass = ['北 N', '东北 NE', '东 E', '东南 SE', '南 S', '西南 SW', '西 W', '西北 NW'][Math.round(heading / 45) % 8];
    ui.setStatus({ area: area().name, objective: objective(), discoveredCount: DISCOVERIES.filter(d => found.has(d.id)).length,
      foundIds: [...found], nearby: nearby?.label ?? null, compass, paused: userPause || externalPause, locked: controls?.locked ?? false });
    ui.root.dataset.position = `${position.x.toFixed(2)},${position.y.toFixed(2)},${position.z.toFixed(2)}`;
    ui.root.dataset.springRestored = String(springRestored);
    ui.root.dataset.valves = rotations.join(',');
    ui.root.dataset.paused = String(paused());
    if (referenceWorld) {
      const diagnostics = referenceWorld.scene.userData.referenceDiagnostics;
      if (diagnostics) {
        ui.root.dataset.layoutRevision = diagnostics.layoutRevision;
        ui.root.dataset.cascadeRegistration = diagnostics.cascadeRegistration;
        ui.root.dataset.cascadeSupport = diagnostics.cascadeSupport;
        ui.root.dataset.springCarrier = diagnostics.springCarrier ?? 'unverified';
        ui.root.dataset.authoredStairs = String(diagnostics.authoredStairs === true);
        ui.root.dataset.visibleLandforms = diagnostics.visibleLandforms ?? 'unverified';
        ui.root.dataset.springSpout = diagnostics.springSpout ?? 'unverified';
        ui.root.dataset.bridgeSafeHalfWidth = String(diagnostics.bridgeSafeHalfWidth);
      }
    }
  }
  function findNearby() {
    let nearestDistance = Infinity;
    nearby = null;
    DISCOVERIES.forEach((item, index) => {
      if (item.requiresSpring && !springRestored) return;
      const distance = Math.hypot(position.x - item.x, position.z - item.z);
      if (distance < item.radius && distance < nearestDistance) {
        nearestDistance = distance;
        nearby = { kind: 'discovery', index, label: `${found.has(item.id) ? '重读' : '记录'} · ${item.title}` };
      }
    });
    VALVES.forEach((valve, index) => {
      const distance = Math.hypot(position.x - valve.x, position.z - valve.z);
      if (distance < (reference ? REFERENCE_LAYOUT.valves[index].radius : 3.2) && distance < nearestDistance) {
        nearestDistance = distance;
        nearby = { kind: 'valve', index, label: springRestored ? `${valve.name}盘 · 水流已贯通` : `转动${valve.name}盘 · 当前朝${DIRECTIONS[rotations[index]]}` };
      }
    });
  }
  function interact() {
    if (!ready || disposed || paused() || !nearby) return;
    if (nearby.kind === 'valve') {
      if (springRestored) { ui.showToast('圣泉已经恢复，沿山路前往神庙吧。'); return; }
      const index = nearby.index;
      rotations[index] = (rotations[index] + 1) % 4;
      springRestored = rotations.every((value, i) => value === VALVES[i].target);
      world?.setPuzzle(rotations, springRestored);
      ui.showToast(springRestored ? '清泉涌出，通向神庙的山门开启了。' : `${VALVES[index].name}盘朝向${DIRECTIONS[rotations[index]]} · ${rotations.filter((value, i) => value === VALVES[i].target).length} / 3 条水渠连通`);
      findNearby(); updateStatus();
      return;
    }
    const item = DISCOVERIES[nearby.index];
    if (!found.has(item.id)) {
      try { options.onDiscover(item.id); found.add(item.id); }
      catch (error) { console.error('Greek world discovery could not be recorded', error); ui.showToast('画册暂时未能记录，请再试一次。'); return; }
    }
    ui.showEntry({ eyebrow: `${item.area} · 画中发现`, title: item.title, body: item.body, footnote: item.footnote });
    findNearby(); updateStatus();
  }
  options.signal?.addEventListener('abort', dispose, { once: true });
  try {
    // A background tab may suspend RAF entirely; cancellation must still settle the promise.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    if (disposed) throw new DOMException('探索已取消', 'AbortError');
    renderer = new WebGLRenderer({ antialias: quality !== 'low', alpha: false, powerPreference: 'high-performance' });
    renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = reference ? 1.05 : 1.15;
    renderer.shadowMap.type = PCFShadowMap;
    const canvas = renderer.domElement;
    canvas.className = 'gw-canvas'; canvas.tabIndex = 0; canvas.setAttribute('aria-label', '爱琴海岸第一人称探索画面');
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block', touchAction: 'none', imageRendering: 'auto', maxWidth: 'none' });
    ui.viewport.prepend(canvas);
    controls = createWorldControls(ui.viewport, canvas, () => {
      if (!disposed && !modalPause && !externalPause) { userPause = true; updateEnabled(); }
    });
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault(); contextLost = true; userPause = true; updateEnabled();
      ui.showEntry({ eyebrow: '画卷暂时合上', title: '画面连接已中断', body: '可以返回画廊，选择低画质重新进入。画册中已经记录的发现会由画廊保留。' });
    }, { signal: lifetime.signal });
    ui.setLoading('海风、橄榄树与白色神庙正在显现', 0.28);
    let environment: WorldEnvironment;
    if (reference) {
      const [{ createReferenceComposition }, { createReferenceArchitecture }, { createReferenceNature }, { createReferenceWater }] = await Promise.all([
        import('./reference/composition'), import('./reference/architecture'), import('./reference/nature'), import('./reference/water'),
      ]);
      if (disposed) throw new DOMException('探索已取消', 'AbortError');
      referenceWorld = await createReferenceComposition(quality, renderer, { architecture: createReferenceArchitecture, nature: createReferenceNature, water: createReferenceWater }, lifetime.signal, referenceView);
      environment = referenceWorld;
      camera.fov = referenceWorld.fov;
    } else environment = await createEnvironment(quality, lifetime.signal);
    world = environment;
    if (disposed || lifetime.signal.aborted) { environment.dispose(); throw new DOMException('探索已取消', 'AbortError'); }
    environment.setPuzzle(rotations, springRestored);
    position.set(environment.spawn.x, environment.groundHeight(environment.spawn.x, environment.spawn.z) + 1.72, environment.spawn.z);
    controls.setView(environment.spawn.yaw, environment.spawn.pitch);
    camera.position.copy(position); camera.rotation.set(controls.pitch, controls.yaw, 0);
    resize();
    ui.setLoading('正在为旅途点亮最后一束光', 0.86);
    await renderer.compileAsync(environment.scene, camera);
    if (reference) renderContext = createReferenceRenderContext(renderer, environment.scene);
    if (disposed) throw new DOMException('探索已取消', 'AbortError');
    observer = new ResizeObserver(resize); observer.observe(ui.viewport);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { userPause = true; controls?.unlock(); }
      updateEnabled();
    }, { signal: lifetime.signal });
    window.addEventListener('blur', () => { userPause = true; controls?.unlock(); updateEnabled(); }, { signal: lifetime.signal });
    window.addEventListener('keydown', event => {
      if (disposed || !ready || event.target instanceof HTMLElement && event.target.closest('input,select,textarea')) return;
      if (event.code === 'KeyE' && !event.repeat) { event.preventDefault(); interact(); }
      if (event.code === 'Escape' && !modalPause) { userPause = true; controls?.unlock(); updateEnabled(); }
    }, { signal: lifetime.signal });
    ready = true; ui.setReady(); updateEnabled();
    let previous = performance.now();
    function frame(now: number) {
      if (disposed || !renderer || !world || !controls) return;
      raf = requestAnimationFrame(frame);
      const elapsed = (now - previous) / 1000;
      const delta = Math.min(elapsed, 0.055); previous = now;
      if (!paused()) {
        const movement = controls.movement();
        const speed = movement.fast ? 5.2 : 3.2;
        const dx = (Math.cos(controls.yaw) * movement.x - Math.sin(controls.yaw) * movement.z) * speed * delta;
        const dz = (-Math.sin(controls.yaw) * movement.x - Math.cos(controls.yaw) * movement.z) * speed * delta;
        // Keep narrow reference walkways traversable at the capped frame delta:
        // axis-separated intermediate points must not jump across their centre domain.
        const movementSteps = reference ? Math.max(1, Math.ceil(Math.hypot(dx, dz) / .025)) : 1;
        for (let step = 0; step < movementSteps; step++) {
          if (world.canWalk(position.x + dx / movementSteps, position.z, springRestored)) position.x += dx / movementSteps;
          if (world.canWalk(position.x, position.z + dz / movementSteps, springRestored)) position.z += dz / movementSteps;
        }
        const floor = world.groundHeight(position.x, position.z) + 1.72;
        position.y += (floor - position.y) * Math.min(1, delta * 14);
        camera.position.copy(position); camera.rotation.set(controls.pitch, controls.yaw, 0);
        world.update(now / 1000, delta, position);
        findNearby();
      }
      // A paused world draws once on state changes only; a hidden tab has no active rendering loop.
      if (!document.hidden && (!paused() || renderDirty || warmFrames > 0)) {
        if (renderContext && referenceWorld) {
          const size = ui.viewport.getBoundingClientRect();
          const cost = renderContext.render({ camera, time: now / 1000, delta, quality,
            viewport: { width: size.width, height: size.height, pixelRatio: renderer.getPixelRatio() },
            beforeRender: frame => referenceWorld?.beforeRender(frame),
          });
          ui.root.dataset.waterPasses = String(cost.offscreenPasses);
          ui.root.dataset.waterPassPixels = String(cost.offscreenPixels);
        } else renderer.render(world.scene, camera);
        renderDirty = false; warmFrames = Math.max(0, warmFrames - 1);
      }
      frameCount++; frameTime += elapsed; statusTime += elapsed;
      if (statusTime > 0.14) { updateStatus(); statusTime = 0; }
      if (frameTime >= 1) {
        ui.root.dataset.fps = (frameCount / frameTime).toFixed(1);
        ui.root.dataset.drawCalls = String(renderer.info.render.calls);
        ui.root.dataset.triangles = String(renderer.info.render.triangles);
        ui.root.dataset.geometries = String(renderer.info.memory.geometries);
        ui.root.dataset.textures = String(renderer.info.memory.textures);
        frameCount = 0; frameTime = 0;
      }
    }
    raf = requestAnimationFrame(frame);
    return { dispose, pause(value) { if (disposed) return; externalPause = value; if (value) controls?.unlock(); updateEnabled(); }, resize };
  } catch (error) { dispose(); throw error; }
}
