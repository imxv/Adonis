import './gallery.css';
import { Grid } from '../pixel/draw';
import { ADONIS_A, ADONIS_B } from '../pixel/sprites';
import { GALLERY_WORLD, createGalleryPixelRenderer, createPixelRepairDisplay } from './gallery-pixel-renderer';
import { createGalleryStations, drawStation } from './gallery-pixel-stations';
import { createCommissionNpcFrames } from '../sidegames/commissions/pixel-art-npcs';
import { createSign, drawSignChevron, type SignIcon, type SignStyle } from './gallery-signs';

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
  /** The tutorial lights one destination up and points the way to it; null clears it. */
  guide(action: GalleryAction | null): void;
  /** How far the visitor has walked since the hall opened, and what they stand beside. */
  progress(): { walked: number; near: GalleryAction | null };
}
export interface GalleryOptions extends GalleryState {
  container: HTMLElement;
  onAction(action: GalleryAction): void;
}

type Point = { x: number; y: number };
type Destination = {
  action: GalleryAction; title: string; subtitle: string; number: string;
  /** Where the visitor stands to use it. */
  point: Point; hit: { x: number; y: number; w: number; h: number };
  /** Its name plate. Free-standing signs and the repair plaque are depth-sorted with the visitor. */
  sign: { style: SignStyle; x: number; y: number; mark?: SignIcon; depth?: number };
};
const WORLD_W = GALLERY_WORLD.width;
const WORLD_H = GALLERY_WORLD.height;
const WORLD_CENTER = WORLD_W / 2;
/** The repair easel's top-left corner; it stands in the right wing, in front of the stair. */
const REPAIR_AT = { x: 1700, y: 582 } as const;
// The main painting owns the nave. Everyday activities gather in the left wing around the fountain,
// and the other journeys and the collection fill the right. Small stations come first so their
// click areas win over the large paintings and planters around them.
const DESTINATIONS: Destination[] = [
  { action: 'repair', title: '回廊修复', subtitle: '让旧陈列重新焕发光彩', number: 'V', point: { x: REPAIR_AT.x + 72, y: 752 }, hit: { x: REPAIR_AT.x, y: REPAIR_AT.y, w: 144, h: 152 }, sign: { style: 'brass', x: REPAIR_AT.x + 72, y: REPAIR_AT.y + 126, depth: REPAIR_AT.y + 152.5 } },
  { action: 'kitchen', title: '归途厨房', subtitle: '用鱼和草木烹出征补给', number: 'VII', point: { x: 716, y: 712 }, hit: { x: 660, y: 528, w: 112, h: 144 }, sign: { style: 'hanging', x: 818, y: 470, mark: 'pot' } },
  { action: 'commissions', title: '居民委托', subtitle: '去庭院帮涅柔斯和达芙妮的忙', number: 'VIII', point: { x: 760, y: 866 }, hit: { x: 770, y: 690, w: 170, h: 170 }, sign: { style: 'board', x: 845, y: 796, depth: 796 } },
  { action: 'fishing', title: '湖畔钓鱼', subtitle: '去苇影湖钓鱼，做菜和委托都用得上', number: 'VI', point: { x: 458, y: 705 }, hit: { x: 110, y: 470, w: 320, h: 232 }, sign: { style: 'post', x: 470, y: 650, mark: 'fish', depth: 650 } },
  { action: 'adventure', title: '画中轮回', subtitle: '开启新的五层冒险', number: 'I', point: { x: WORLD_CENTER, y: 630 }, hit: { x: WORLD_CENTER - 224, y: 60, w: 448, h: 550 }, sign: { style: 'ribbon', x: WORLD_CENTER, y: 522 } },
  { action: 'world3d', title: '爱琴海岸', subtitle: '走进立体的神话世界', number: 'II', point: { x: 1938, y: 640 }, hit: { x: 1790, y: 100, w: 300, h: 450 }, sign: { style: 'brass', x: 1938, y: 556 } },
  { action: 'garden', title: '月桂花园', subtitle: '种植、收获与出征补给', number: 'III', point: { x: 440, y: 830 }, hit: { x: 0, y: 712, w: 400, h: 229 }, sign: { style: 'post', x: 300, y: 806, mark: 'leaf', depth: 806 } },
  { action: 'collection', title: '珍藏陈列', subtitle: '收藏旅途中的发现', number: 'IV', point: { x: 2140, y: 800 }, hit: { x: 2236, y: 330, w: 272, h: 550 }, sign: { style: 'brass', x: 2366, y: 700 } },
];
/** Two residents wait beside their notice board, on the left of the mosaic. */
const RESIDENTS = [{ id: 'nereus', x: 800, y: 852 }, { id: 'daphne', x: 890, y: 846 }] as const;
const GOLD = '#e7bf76';
const IVORY = '#ead4aa';
const TAU = Math.PI * 2;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
/** Keep feet on the central paving, in front of the stairs and inside the foreground planting. */
const floorPoint = (point: Point): Point => {
  const y = clamp(point.y, 600, 870);
  return { x: clamp(point.x, 370 + (y - 600) * 0.2, WORLD_W - 302 - (y - 600) * 0.25), y };
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
  /** CSS pixels of the room hidden under the shortcut dock on small screens. */
  let bottomCover = 0;
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
  let guided: GalleryAction | null = null;
  let walked = 0;
  // Arrive in front of the mosaic, out of reach of every station, so no prompt greets the visitor.
  const character: Point = { x: WORLD_CENTER, y: 800 };
  const keys = new Set<string>();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.createElement('section');
  root.className = 'ag-hub ag-hub-ready';
  root.dataset.renderer = 'procedural-pixel-v3';
  root.setAttribute('aria-label', '万象画廊大厅');
  root.innerHTML = `
    <div class="ag-hub-stage"><canvas class="ag-hub-canvas" tabindex="0" aria-label="可步行的万象画廊。WASD 或方向键移动，靠近画作、钓竿、铜锅或居民后按 F 或 Enter 进入。点击它们会自动走过去。"></canvas></div>
    <header class="ag-hub-header">
      <div class="ag-hub-brand"><span class="ag-hub-emblem" aria-hidden="true">✦</span><div><p class="ag-hub-eyebrow">ADONIS</p><h1 class="ag-hub-title">万象画廊</h1></div></div>
      <div class="ag-hub-profile" aria-label="画廊收藏与补给"><div class="ag-hub-resources"></div><p class="ag-hub-supply"></p></div>
    </header>
    <div class="ag-hub-near" aria-live="polite" hidden><span class="ag-hub-near-number"></span><div><p class="ag-hub-near-title"></p><p class="ag-hub-near-copy"></p></div><button class="ag-hub-interact" type="button"><kbd>F</kbd> 进入</button></div>
    <footer class="ag-hub-footer"><p class="ag-hub-controls"><span class="ag-hub-controls-keys"><kbd>WASD</kbd> 走动 <span>·</span> 靠近按 <kbd>F</kbd> <span>·</span> 点击直接走过去</span><span class="ag-hub-controls-touch">点地面走过去 <span>·</span> 下方按钮直达</span></p><nav class="ag-hub-actions ag-hub-life-actions" aria-label="生活玩法快捷入口"><button type="button" class="ag-hub-action ag-hub-action-life" data-action="fishing">湖畔钓鱼</button><button type="button" class="ag-hub-action ag-hub-action-life" data-action="kitchen">归途厨房</button><button type="button" class="ag-hub-action ag-hub-action-life" data-action="commissions">居民委托</button><button type="button" class="ag-hub-action ag-hub-action-life" data-action="garden">月桂花园</button></nav><nav class="ag-hub-actions ag-hub-journey-actions" aria-label="旅程与收藏快捷入口"><button type="button" class="ag-hub-action ag-hub-action-primary" data-action="adventure"><span aria-hidden="true">Ⅰ</span> 画中轮回</button><button type="button" class="ag-hub-action ag-hub-action-continue" data-action="continue">继续旅程</button><button type="button" class="ag-hub-action" data-action="world3d">爱琴海岸</button><button type="button" class="ag-hub-action" data-action="collection">珍藏陈列</button></nav></footer>
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
    if (near) root.dataset.near = near.action;
    else delete root.dataset.near;
    if (near) {
      nearNumber.textContent = near.number;
      const repair = near.action === 'repair' ? state.profile?.repair : undefined;
      nearTitle.textContent = repair ? `${near.title} · ${repair.name}` : near.title;
      nearCopy.textContent = repair ? repair.completed ? '陈列已修复，欢迎驻足欣赏' : repair.disabledReason ? `${repair.costLabel}（${repair.disabledReason}）` : repair.costLabel : near.subtitle;
      interact.disabled = near.action === 'repair' && repairUnavailable();
      interact.innerHTML = near.action === 'repair' ? repair?.completed ? '<kbd>F</kbd> 欣赏修复' : '<kbd>F</kbd> 查看修复' : '<kbd>F</kbd> 进入';
    }
  }
  function updateState(next: GalleryState) {
    state = next;
    continueButton.hidden = !state.hasSave;
    root.toggleAttribute('data-has-save', state.hasSave);
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
    root.dataset.repairStatus = repair?.completed ? 'completed' : repair ? 'unrepaired' : 'unavailable';
    if (repair) root.dataset.repairId = repair.id;
    else delete root.dataset.repairId;
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
    const dock = root.querySelector<HTMLElement>('.ag-hub-footer')!;
    bottomCover = root.querySelector<HTMLElement>('.ag-hub-life-actions')!.offsetParent ? Math.max(0, rect.bottom - dock.getBoundingClientRect().top) : 0;
    context.imageSmoothingEnabled = false;
    moveCamera(true);
    draw();
  }
  function moveCamera(immediate = false) {
    const viewportW = width / scale;
    const viewportH = height / scale;
    const desiredX = viewportW >= WORLD_W ? (WORLD_W - viewportW) / 2 : clamp(character.x - viewportW / 2, 0, WORLD_W - viewportW);
    // Keep the paintings ahead of the visitor visible on portrait and short displays, and let the floor
    // scroll up past the shortcut dock so the visitor is never hidden beneath it.
    const coverH = bottomCover / scale;
    const maxY = WORLD_H - viewportH + coverH;
    const desiredY = maxY <= 0 ? maxY / 2 : clamp(character.y - (viewportH - coverH) * 0.79, 0, maxY);
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
    const dt = lastTime ? Math.max(0, Math.min((now - lastTime) / 1000, 0.05)) : 0;
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
      walked += distance(character, next);
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
  const signs = new Map(DESTINATIONS.map((destination) => [destination.action,
    createSign(destination.sign.style, destination.title, destination.sign.mark)]));
  const stations = createGalleryStations();
  const residentFrames = createCommissionNpcFrames();
  // One local display, rendered once per state. The saved repair flag is its only state source.
  // Its stand sits on the central paving; neither hall artwork nor walkable bounds are changed.
  const repairDisplays = [createPixelRepairDisplay(false), createPixelRepairDisplay(true)];
  const pixelRenderer = createGalleryPixelRenderer();
  canvas.dataset.sourceSize = pixelRenderer.sourceSize.join('x');

  function ellipse(x: number, y: number, rx: number, ry: number, fill: string) {
    context.beginPath(); context.ellipse(x, y, rx, ry, 0, 0, TAU); context.fillStyle = fill; context.fill();
  }
  function available(destination: Destination) {
    return destination.action !== 'repair' || !!state.profile?.repair;
  }
  function isSelected(destination: Destination) {
    return near === destination || hovered === destination || guided === destination.action;
  }
  function drawSign(destination: Destination) {
    const art = signs.get(destination.action)!;
    const lit = Number(isSelected(destination));
    const picture = art.frames[lit];
    const { x, y } = destination.sign;
    context.drawImage(picture, Math.round(x - (art.ax + lit) * 2), Math.round(y - (art.ay + lit) * 2), picture.width * 2, picture.height * 2);
  }
  /** A ring where the visitor will stand, painted on the floor under every figure. */
  function drawStandingRing(destination: Destination) {
    const p = destination.point;
    context.strokeStyle = '#e7bf76aa'; context.lineWidth = 2;
    context.beginPath(); context.ellipse(p.x, p.y + 4, 26, 8, 0, 0, TAU); context.stroke();
    for (const offset of [-1, 1]) {
      context.fillStyle = GOLD;
      context.fillRect(Math.round(p.x + offset * 31) - 2, Math.round(p.y), 4, 4);
    }
  }
  /** A bobbing chevron above the highlighted sign, drawn last so nothing in the room covers it. */
  function drawSignMarker(destination: Destination) {
    const art = signs.get(destination.action)!;
    const { x, y } = destination.sign;
    const bob = reducedMotion.matches ? 0 : Math.round((Math.sin(clock * 5) + 1) * 1.5) * 2;
    drawSignChevron(context, Math.round(x + (art.cx - art.ax) * 2), Math.round(y + (art.top - art.ay) * 2) - 6 - bob, 2);
  }
  function draw() {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#12121e'; context.fillRect(0, 0, width, height);
    context.save(); context.scale(scale, scale); context.translate(-camera.x, -camera.y);
    pixelRenderer.drawBackground(context, clock, reducedMotion.matches);
    const selected = DESTINATIONS.filter((destination) => available(destination) && isSelected(destination));
    // Plates fixed to walls, frames and the stair are part of the room behind every figure.
    for (const destination of DESTINATIONS) if (available(destination) && destination.sign.depth === undefined) drawSign(destination);
    selected.forEach(drawStandingRing);
    if (target) {
      const pulse = reducedMotion.matches ? 0.7 : 0.55 + Math.sin(clock * 6) * 0.15;
      context.globalAlpha = pulse;
      context.strokeStyle = GOLD; context.lineWidth = 2;
      context.beginPath(); context.ellipse(target.x, target.y, 13, 5, 0, 0, TAU); context.stroke();
      context.fillStyle = IVORY; context.fillRect(Math.round(target.x) - 2, Math.round(target.y) - 1, 4, 2);
      context.globalAlpha = 1;
    }
    const still = reducedMotion.matches;
    const frame = moving && !still ? Math.floor(clock * 9) % 2 : 0;
    const hero = heroFrames[frame];
    // Integer scaling in source pixels keeps the established sprite crisp and present at every viewport.
    const spriteScale = Math.max(2, Math.round(70 / (hero.height * scale)));
    const drawFigure = (sprite: HTMLCanvasElement, x: number, y: number, face: number, lift = 0) => {
      const spriteW = sprite.width * spriteScale, spriteH = sprite.height * spriteScale;
      const px = Math.round(x), py = Math.round(y);
      ellipse(px, py + 1, spriteW * 0.36, spriteH * 0.085 * 17 / sprite.height, '#090a167d');
      ellipse(px, py, spriteW * 0.25, spriteH * 0.045 * 17 / sprite.height, '#090a16a6');
      context.save(); context.translate(px, py - lift); context.scale(face, 1);
      context.drawImage(sprite, -Math.round(spriteW / 2), -spriteH, spriteW, spriteH);
      context.restore();
    };
    // Props and figures are painted back to front so the visitor can walk around them.
    const greeting = near?.action === 'commissions';
    const repair = state.profile?.repair;
    const layers: { y: number; paint(): void }[] = [
      ...(repair ? [{ y: REPAIR_AT.y + 152, paint: () => context.drawImage(repairDisplays[Number(repair.completed)], REPAIR_AT.x, REPAIR_AT.y) }] : []),
      ...DESTINATIONS.filter((destination) => available(destination) && destination.sign.depth !== undefined)
        .map((destination) => ({ y: destination.sign.depth!, paint: () => drawSign(destination) })),
      { y: stations.fishing.baseY, paint: () => drawStation(context, stations.fishing, still ? 0 : Math.floor(clock / 0.7)) },
      { y: stations.kitchen.baseY, paint: () => drawStation(context, stations.kitchen, still ? 0 : Math.floor(clock / 0.16)) },
      ...RESIDENTS.map((resident, index) => ({ y: resident.y, paint: () => {
        const frames = residentFrames[resident.id];
        const pose = still ? 0 : resident.id === 'nereus' ? greeting ? Math.floor(clock * 3) % 2 : 0 : Math.floor(clock / 0.9 + index) % 2;
        drawFigure(frames[pose], resident.x, resident.y, character.x < resident.x ? -1 : 1);
      } })),
      { y: character.y + 0.5, paint: () => drawFigure(hero, character.x, character.y, facing, moving && !still ? frame * spriteScale : 0) },
    ];
    layers.sort((a, b) => a.y - b.y).forEach((layer) => layer.paint());
    pixelRenderer.drawForeground(context);
    selected.forEach(drawSignMarker);
    context.restore();
    drawGuideArrow();
  }
  /** While the guided destination is out of view, a chevron on the screen edge points the way to it. */
  function drawGuideArrow() {
    const destination = DESTINATIONS.find((item) => item.action === guided && available(item));
    if (!destination) return;
    const viewH = height - bottomCover;
    const x = (destination.sign.x - camera.x) * scale;
    const y = (destination.sign.y - camera.y) * scale;
    const margin = 40;
    if (x > margin && x < width - margin && y > margin && y < viewH - margin) return;
    // Snapped to a side so the pixel chevron is never drawn at an odd angle.
    const side = Math.abs(x - width / 2) / width >= Math.abs(y - viewH / 2) / viewH ? (x < width / 2 ? Math.PI : 0) : (y < viewH / 2 ? -Math.PI / 2 : Math.PI / 2);
    const bob = reducedMotion.matches ? 0 : Math.round((Math.sin(clock * 5) + 1) * 1.5) * 3;
    const ax = side === 0 ? width - margin + bob : side === Math.PI ? margin - bob : clamp(x, margin, width - margin);
    const ay = side === Math.PI / 2 ? viewH - margin + bob : side === -Math.PI / 2 ? margin - bob : clamp(y, margin * 2, viewH - margin);
    context.save();
    context.translate(Math.round(ax), Math.round(ay));
    context.rotate(side - Math.PI / 2);
    drawSignChevron(context, 0, 9, 3);
    context.restore();
  }

  updateState(state);
  resize();
  updateNear();
  canvas.focus({ preventScroll: true });
  start();
  return {
    refresh(next) { if (!disposed) updateState(next); },
    guide(action) {
      guided = action;
      if (!animation && !disposed) draw();
    },
    progress: () => ({ walked, near: near?.action ?? null }),
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
      stations.dispose();
      Object.values(residentFrames).flat().forEach((frame) => { frame.width = frame.height = 1; });
      heroFrames.forEach((frame) => { frame.width = frame.height = 1; });
      repairDisplays.forEach((frame) => { frame.width = frame.height = 1; });
      signs.forEach((art) => art.frames.forEach((frame) => { frame.width = frame.height = 1; }));
      signs.clear();
      root.remove();
      // Resetting releases the canvas backing store on mobile browsers.
      canvas.width = canvas.height = 1;
    },
  };
}
