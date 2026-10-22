import './gallery.css';
import { Grid, pxText } from '../pixel/draw';
import { ADONIS_A, ADONIS_B } from '../pixel/sprites';
import { createGalleryPixelRenderer, createPixelRepairDisplay } from './gallery-pixel-renderer';

export type GalleryAction = 'adventure' | 'continue' | 'garden' | 'world3d' | 'collection' | 'fishing' | 'kitchen' | 'commissions' | 'repair';
export interface GalleryRepair {
  id: string;
  name: string;
  completed: boolean;
  costLabel: string;
  disabledReason?: string;
}
export interface GalleryProfile {
  fragments: number;
  discoveries: number;
  supply: string | null;
  warning: string | null;
  fishCount?: number;
  repair?: GalleryRepair;
}
export interface GalleryState { hasSave: boolean; profile?: GalleryProfile }
export interface GalleryHandle {
  dispose(): void;
  pause(paused: boolean): void;
  refresh(state: GalleryState): void;
}
export interface GalleryOptions extends GalleryState {
  container: HTMLElement;
  onAction(action: GalleryAction): void;
}

type Point = { x: number; y: number };
type Destination = {
  action: GalleryAction; title: string; subtitle: string; number: string;
  point: Point; hit: { x: number; y: number; w: number; h: number };
};
const DESTINATIONS: Destination[] = [
  { action: 'adventure', title: '画中轮回', subtitle: '开启新的五层冒险', number: 'I', point: { x: 500, y: 610 }, hit: { x: 375, y: 125, w: 270, h: 440 } },
  { action: 'world3d', title: '爱琴海岸', subtitle: '走进立体的神话世界', number: 'II', point: { x: 1150, y: 610 }, hit: { x: 1025, y: 115, w: 275, h: 450 } },
  { action: 'garden', title: '月桂花园', subtitle: '种植、收获与出征补给', number: 'III', point: { x: 420, y: 760 }, hit: { x: 28, y: 500, w: 360, h: 360 } },
  { action: 'collection', title: '珍藏陈列', subtitle: '收藏旅途中的发现', number: 'IV', point: { x: 1310, y: 760 }, hit: { x: 1400, y: 330, w: 272, h: 550 } },
  { action: 'repair', title: '回廊修复', subtitle: '让旧陈列重新焕发光彩', number: 'V', point: { x: 835, y: 748 }, hit: { x: 763, y: 582, w: 144, h: 152 } },
];
const WORLD_W = 1672;
const WORLD_H = 941;
const GOLD = '#e7bf76';
const IVORY = '#ead4aa';
const TAU = Math.PI * 2;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
/** Keep feet on the central paving, in front of the stairs and inside the foreground planting. */
const floorPoint = (point: Point): Point => {
  const y = clamp(point.y, 600, 870);
  return { x: clamp(point.x, 370 + (y - 600) * 0.2, 1370 - (y - 600) * 0.25), y };
};

/** A self-contained, walkable safe area. It owns no Phaser, audio or saved-run state. */
export function mountGallery(options: GalleryOptions): GalleryHandle {
  let state: GalleryState = { hasSave: options.hasSave, profile: options.profile };
  let disposed = false;
  let paused = false;
  let visible = !document.hidden;
  let animation = 0;
  let lastTime = 0;
  let clock = 0;
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let scale = 1;
  let camera = { x: 0, y: 0 };
  let target: Point | null = null;
  let pending: Destination | null = null;
  let near: Destination | null = null;
  let lastNearAction: GalleryAction | null = null;
  let moving = false;
  let facing = 1;
  let pointerId: number | null = null;
  let pointerStart: Point | null = null;
  let hovered: Destination | null = null;
  let triggerTime = -1000;
  const character: Point = { x: 835, y: 785 };
  const keys = new Set<string>();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.createElement('section');
  root.className = 'ag-hub ag-hub-ready';
  root.dataset.renderer = 'procedural-pixel-v3';
  root.setAttribute('aria-label', '万象画廊大厅');
  root.innerHTML = `
    <div class="ag-hub-stage"><canvas class="ag-hub-canvas" tabindex="0" aria-label="可步行的万象画廊。WASD 或方向键移动，靠近画作按 F 或 Enter 进入。点击画作会自动走到入口。下方可直接前往钓鱼、厨房、居民委托和花园。"></canvas></div>
    <header class="ag-hub-header">
      <div class="ag-hub-brand"><span class="ag-hub-emblem" aria-hidden="true">✦</span><div><p class="ag-hub-eyebrow">ADONIS</p><h1 class="ag-hub-title">万象画廊</h1></div></div>
      <div class="ag-hub-profile" aria-label="画廊收藏与补给"><div class="ag-hub-resources"></div><p class="ag-hub-supply"></p></div>
    </header>
    <aside class="ag-hub-repair" aria-label="回廊修复" hidden><div><p class="ag-hub-repair-eyebrow">回廊修复</p><p class="ag-hub-repair-name"></p><p class="ag-hub-repair-status" aria-live="polite"></p></div><button type="button" class="ag-hub-repair-button" data-action="repair">修复陈列</button></aside>
    <div class="ag-hub-near" hidden><span class="ag-hub-near-number"></span><div><p class="ag-hub-near-title"></p><p class="ag-hub-near-copy"></p></div><button class="ag-hub-interact" type="button"><kbd>F</kbd> 进入</button></div>
    <footer class="ag-hub-footer"><p class="ag-hub-controls"><kbd>WASD</kbd> 走动 <span>·</span> 点击画作探索</p><nav class="ag-hub-actions ag-hub-life-actions" aria-label="生活玩法快捷入口"><button type="button" class="ag-hub-action ag-hub-action-life" data-action="fishing">湖畔钓鱼</button><button type="button" class="ag-hub-action ag-hub-action-life" data-action="kitchen">回廊厨房</button><button type="button" class="ag-hub-action ag-hub-action-life" data-action="commissions">居民委托</button><button type="button" class="ag-hub-action ag-hub-action-life" data-action="garden">月桂花园</button></nav><nav class="ag-hub-actions ag-hub-journey-actions" aria-label="旅程与收藏快捷入口"><button type="button" class="ag-hub-action ag-hub-action-primary" data-action="adventure"><span aria-hidden="true">Ⅰ</span> 画中轮回</button><button type="button" class="ag-hub-action ag-hub-action-continue" data-action="continue">继续旅程</button><button type="button" class="ag-hub-action" data-action="world3d">爱琴海岸</button><button type="button" class="ag-hub-action" data-action="collection">珍藏陈列</button></nav></footer>
    <p class="ag-hub-warning" role="status" hidden></p>`;
  options.container.append(root);
  const canvas = root.querySelector<HTMLCanvasElement>('.ag-hub-canvas')!;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    root.remove();
    throw new Error('当前浏览器无法绘制画廊。请刷新页面后重试。');
  }
  const context = ctx;
  const stage = root.querySelector<HTMLElement>('.ag-hub-stage')!;
  const nearPanel = root.querySelector<HTMLElement>('.ag-hub-near')!;
  const nearNumber = root.querySelector<HTMLElement>('.ag-hub-near-number')!;
  const nearTitle = root.querySelector<HTMLElement>('.ag-hub-near-title')!;
  const nearCopy = root.querySelector<HTMLElement>('.ag-hub-near-copy')!;
  const interact = root.querySelector<HTMLButtonElement>('.ag-hub-interact')!;
  const resources = root.querySelector<HTMLElement>('.ag-hub-resources')!;
  const supply = root.querySelector<HTMLElement>('.ag-hub-supply')!;
  const warning = root.querySelector<HTMLElement>('.ag-hub-warning')!;
  const continueButton = root.querySelector<HTMLButtonElement>('[data-action="continue"]')!;
  const repairPanel = root.querySelector<HTMLElement>('.ag-hub-repair')!;
  const repairName = root.querySelector<HTMLElement>('.ag-hub-repair-name')!;
  const repairStatus = root.querySelector<HTMLElement>('.ag-hub-repair-status')!;
  const repairButton = root.querySelector<HTMLButtonElement>('[data-action="repair"]')!;
  const abort = new AbortController();
  const listenerOptions = { signal: abort.signal };

  function clearInput() {
    keys.clear();
    target = null;
    pending = null;
    moving = false;
    hovered = null;
    if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    pointerId = null;
    pointerStart = null;
  }
  function isActive() { return !disposed && !paused && visible; }
  function repairUnavailable() {
    return !state.profile?.repair;
  }
  function fire(action: GalleryAction) {
    if (!isActive() || (action === 'continue' && !state.hasSave)) return;
    if (action === 'repair' && repairUnavailable()) return;
    const now = performance.now();
    if (now - triggerTime < 650) return;
    triggerTime = now;
    clearInput();
    options.onAction(action);
  }
  function updateNear(force = false) {
    near = DESTINATIONS.reduce<Destination | null>((best, item) => (item.action !== 'repair' || !!state.profile?.repair) && distance(character, item.point) < 105 && (!best || distance(character, item.point) < distance(character, best.point)) ? item : best, null);
    const nextAction = near?.action ?? null;
    if (nextAction === lastNearAction && !force) return;
    lastNearAction = nextAction;
    nearPanel.hidden = !near;
    if (near) {
      nearNumber.textContent = near.number;
      const repair = near.action === 'repair' ? state.profile?.repair : undefined;
      nearTitle.textContent = repair?.name ?? near.title;
      nearCopy.textContent = repair ? repair.completed ? '陈列已修复，欢迎驻足欣赏' : repair.disabledReason ?? repair.costLabel : near.subtitle;
      interact.disabled = near.action === 'repair' && repairUnavailable();
      interact.innerHTML = near.action === 'repair' ? repair?.completed ? '<kbd>F</kbd> 欣赏修复' : '<kbd>F</kbd> 查看修复' : '<kbd>F</kbd> 进入';
    }
  }
  function updateState(next: GalleryState) {
    state = next;
    continueButton.hidden = !state.hasSave;
    const profile = state.profile;
    resources.replaceChildren();
    const amounts: [string, number][] = [['碎片', profile?.fragments ?? 0], ['发现', profile?.discoveries ?? 0]];
    if (profile?.fishCount !== undefined) amounts.push(['鱼', profile.fishCount]);
    for (const [label, value] of amounts) {
      const item = document.createElement('span');
      const number = document.createElement('strong');
      number.textContent = String(value);
      item.append(document.createTextNode(label + ' '), number);
      resources.append(item);
    }
    supply.textContent = profile?.supply ? `补给 · ${profile.supply}` : '';
    supply.hidden = !profile?.supply;
    warning.hidden = !profile?.warning;
    warning.textContent = profile?.warning ?? '';
    const repair = profile?.repair;
    repairPanel.hidden = !repair;
    repairButton.disabled = repairUnavailable();
    root.dataset.repairStatus = repair?.completed ? 'completed' : repair ? 'unrepaired' : 'unavailable';
    if (repair) {
      root.dataset.repairId = repair.id;
      repairName.textContent = repair.name;
      repairStatus.textContent = repair.completed ? '已修复 · 展架重新亮起' : repair.disabledReason ? `${repair.costLabel} · ${repair.disabledReason}` : repair.costLabel;
      repairButton.textContent = repair.completed ? '欣赏修复' : '查看修复';
      repairButton.setAttribute('aria-label', repair.completed ? `欣赏${repair.name}修复结果` : `查看${repair.name}修复详情，${repair.costLabel}${repair.disabledReason ? `，${repair.disabledReason}` : ''}`);
    } else delete root.dataset.repairId;
    updateNear(true);
    if (!animation && !disposed) draw();
  }
  function resize() {
    if (disposed) return;
    const rect = stage.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    // Small screens explore the room with a camera instead of shrinking its contents.
    scale = Math.max(width / WORLD_W, height / WORLD_H, 0.58);
    context.imageSmoothingEnabled = false;
    moveCamera(true);
    draw();
  }
  function moveCamera(immediate = false) {
    const viewportW = width / scale;
    const viewportH = height / scale;
    const desiredX = viewportW >= WORLD_W ? (WORLD_W - viewportW) / 2 : clamp(character.x - viewportW / 2, 0, WORLD_W - viewportW);
    // Keep the paintings ahead of the visitor visible on portrait and short displays.
    const desiredY = viewportH >= WORLD_H ? (WORLD_H - viewportH) / 2 : clamp(character.y - viewportH * 0.79, 0, WORLD_H - viewportH);
    const ease = immediate || reducedMotion.matches ? 1 : 0.1;
    camera.x += (desiredX - camera.x) * ease;
    camera.y += (desiredY - camera.y) * ease;
  }
  function fromPointer(event: PointerEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / scale + camera.x, y: (event.clientY - rect.top) / scale + camera.y };
  }
  function hitDestination(point: Point) {
    return DESTINATIONS.find(({ action, hit }) => (action !== 'repair' || !!state.profile?.repair) && point.x >= hit.x && point.x <= hit.x + hit.w && point.y >= hit.y && point.y <= hit.y + hit.h) ?? null;
  }
  function walkTo(point: Point) {
    target = floorPoint(point);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (!isActive() || event.altKey || event.ctrlKey || event.metaKey) return;
    const element = event.target as HTMLElement | null;
    if (element?.matches('input, textarea, select, [contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      event.preventDefault();
      keys.add(key);
      target = null;
      pending = null;
    } else if ((key === 'f' || key === 'enter') && !event.repeat && !element?.closest('button')) {
      event.preventDefault();
      if (near) fire(near.action);
    }
  }
  window.addEventListener('keydown', onKeyDown, listenerOptions);
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()), listenerOptions);
  window.addEventListener('blur', clearInput, listenerOptions);
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    clearInput();
    if (!visible) stop();
    else if (!paused) start();
  }, listenerOptions);
  canvas.addEventListener('pointerdown', (event) => {
    if (!isActive() || event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    pointerId = event.pointerId;
    pointerStart = fromPointer(event);
    canvas.setPointerCapture(event.pointerId);
    pending = hitDestination(pointerStart);
    walkTo(pending?.point ?? pointerStart);
  }, listenerOptions);
  canvas.addEventListener('pointermove', (event) => {
    if (!isActive()) return;
    const point = fromPointer(event);
    if (pointerId === event.pointerId && pointerStart && distance(pointerStart, point) > 16) {
      pending = null;
      walkTo(point);
    }
    hovered = event.pointerType === 'mouse' ? hitDestination(point) : null;
    canvas.style.cursor = hovered ? 'pointer' : 'crosshair';
  }, listenerOptions);
  const releasePointer = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    pointerId = null;
    pointerStart = null;
  };
  canvas.addEventListener('pointerup', releasePointer, listenerOptions);
  canvas.addEventListener('pointercancel', (event) => { releasePointer(event); clearInput(); }, listenerOptions);
  canvas.addEventListener('pointerleave', () => { hovered = null; }, listenerOptions);
  root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => button.addEventListener('click', () => fire(button.dataset.action as GalleryAction), listenerOptions));
  interact.addEventListener('click', () => { if (near) fire(near.action); }, listenerOptions);
  const observer = new ResizeObserver(resize);
  observer.observe(stage);

  function step(now: number) {
    animation = 0;
    if (!isActive()) return;
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
    lastTime = now;
    clock += dt;
    let dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    let dy = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
    if (target && !dx && !dy) {
      const gap = distance(character, target);
      if (gap < 5) target = null;
      else { dx = (target.x - character.x) / gap; dy = (target.y - character.y) / gap; }
    }
    moving = Math.abs(dx) + Math.abs(dy) > 0.01;
    if (moving) {
      const normal = Math.hypot(dx, dy);
      const speed = 245 * dt;
      const next = floorPoint({ x: character.x + dx / normal * speed, y: character.y + dy / normal * speed });
      character.x = next.x;
      character.y = next.y;
      if (dx) facing = Math.sign(dx);
    }
    updateNear();
    if (pending && distance(character, pending.point) < 12) {
      const action = pending.action;
      pending = null;
      fire(action);
      if (!isActive()) return;
    }
    moveCamera();
    draw();
    if (isActive()) animation = requestAnimationFrame(step);
  }
  function stop() {
    if (animation) cancelAnimationFrame(animation);
    animation = 0;
    lastTime = 0;
  }
  function start() {
    if (animation || !isActive()) return;
    lastTime = 0;
    animation = requestAnimationFrame(step);
  }

  // Reuse the game's actual two-frame hero artwork. The gallery owns only these small canvases.
  const heroFrames = [ADONIS_A, ADONIS_B].map((frame) => Grid.ascii(frame.rows, frame.mirror).render());
  const labels = new Map(DESTINATIONS.map((destination) => [destination.action,
    pxText(destination.title, { color: IVORY, outline: '#181425' })]));
  // One local display, rendered once per state. The saved repair flag is its only state source.
  // Its stand sits on the central paving; neither hall artwork nor walkable bounds are changed.
  const repairDisplays = [createPixelRepairDisplay(false), createPixelRepairDisplay(true)];
  const pixelRenderer = createGalleryPixelRenderer();
  canvas.dataset.sourceSize = pixelRenderer.sourceSize.join('x');

  function ellipse(x: number, y: number, rx: number, ry: number, fill: string) {
    context.beginPath(); context.ellipse(x, y, rx, ry, 0, 0, TAU); context.fillStyle = fill; context.fill();
  }
  function drawLabel(destination: Destination) {
    if (destination.action === 'repair' && !state.profile?.repair) return;
    const selected = near === destination || hovered === destination;
    const picture = labels.get(destination.action)!;
    const labelScale = Math.max(1, Math.ceil(1 / scale));
    const labelX = destination.action === 'garden' ? 290 : destination.action === 'collection' ? 1405 : destination.point.x;
    const labelY = destination.action === 'garden' || destination.action === 'collection' ? 718 : 565;
    const w = picture.width * labelScale;
    const h = picture.height * labelScale;
    const x = Math.round(labelX - w / 2), y = Math.round(labelY - h / 2);
    context.fillStyle = selected ? '#181425ee' : '#181425c9';
    context.fillRect(x - 10, y - 5, w + 20, h + 10);
    context.fillStyle = selected ? GOLD : '#856b46';
    context.fillRect(x - 10, y - 5, w + 20, 1);
    context.fillRect(x - 10, y + h + 4, w + 20, 1);
    context.fillRect(x - 10, y - 5, 1, h + 10);
    context.fillRect(x + w + 9, y - 5, 1, h + 10);
    context.drawImage(picture, x, y, w, h);
    if (selected) {
      const p = destination.point;
      context.strokeStyle = '#e7bf76aa'; context.lineWidth = 2;
      context.beginPath(); context.ellipse(p.x, p.y + 4, 26, 8, 0, 0, TAU); context.stroke();
      for (const offset of [-1, 1]) {
        context.fillStyle = GOLD;
        context.fillRect(Math.round(p.x + offset * 31) - 2, Math.round(p.y), 4, 4);
      }
    }
  }
  function draw() {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#12121e'; context.fillRect(0, 0, width, height);
    context.save(); context.scale(scale, scale); context.translate(-camera.x, -camera.y);
    pixelRenderer.drawBackground(context, clock, reducedMotion.matches);
    if (state.profile?.repair) context.drawImage(repairDisplays[Number(state.profile.repair.completed)], 763, 582);
    if (target) {
      const pulse = reducedMotion.matches ? 0.7 : 0.55 + Math.sin(clock * 6) * 0.15;
      context.globalAlpha = pulse;
      context.strokeStyle = GOLD; context.lineWidth = 2;
      context.beginPath(); context.ellipse(target.x, target.y, 13, 5, 0, 0, TAU); context.stroke();
      context.fillStyle = IVORY; context.fillRect(Math.round(target.x) - 2, Math.round(target.y) - 1, 4, 2);
      context.globalAlpha = 1;
    }
    const frame = moving && !reducedMotion.matches ? Math.floor(clock * 9) % 2 : 0;
    const hero = heroFrames[frame];
    // Integer scaling in source pixels keeps the established sprite crisp and present at every viewport.
    const spriteScale = Math.max(2, Math.round(70 / (hero.height * scale)));
    const spriteW = hero.width * spriteScale, spriteH = hero.height * spriteScale;
    const px = Math.round(character.x), py = Math.round(character.y);
    ellipse(px, py + 1, spriteW * 0.36, spriteH * 0.085, '#090a167d');
    ellipse(px, py, spriteW * 0.25, spriteH * 0.045, '#090a16a6');
    const bounce = moving && !reducedMotion.matches ? frame * spriteScale : 0;
    context.save(); context.translate(px, py - bounce); context.scale(facing, 1);
    context.drawImage(hero, -Math.round(spriteW / 2), -spriteH, spriteW, spriteH);
    context.restore();
    pixelRenderer.drawForeground(context);
    for (const destination of DESTINATIONS) drawLabel(destination);
    context.restore();
  }

  updateState(state);
  resize();
  updateNear();
  canvas.focus({ preventScroll: true });
  start();
  return {
    refresh(next) { if (!disposed) updateState(next); },
    pause(next) {
      if (disposed || paused === next) return;
      paused = next;
      root.inert = next;
      root.setAttribute('aria-hidden', String(next));
      clearInput();
      if (next) stop();
      else { resize(); canvas.focus({ preventScroll: true }); start(); }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInput();
      stop();
      abort.abort();
      observer.disconnect();
      pixelRenderer.dispose();
      heroFrames.forEach((frame) => { frame.width = frame.height = 1; });
      repairDisplays.forEach((frame) => { frame.width = frame.height = 1; });
      labels.clear();
      root.remove();
      // Resetting releases the canvas backing store on mobile browsers.
      canvas.width = canvas.height = 1;
    },
  };
}
