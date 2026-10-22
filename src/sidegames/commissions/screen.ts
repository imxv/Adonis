import { renderCommissionDialogue } from './view';
import type { CommissionPageView } from './view';
import type { NpcId } from '../../meta/life';
import { COMMISSION_SPAWN, COMMISSION_TARGETS } from './pixel-contract';
import type { CommissionSceneState, CommissionTargetId } from './pixel-contract';
import {
  createCommissionViewport, createCommissionPath, screenToCommission, hitCommissionTarget,
  nearestCommissionTarget, getCommissionTarget, moveCommissionPlayer,
} from './pixel-controls';
import type { CommissionPoint } from './pixel-controls';
import { createCommissionPixelRenderer } from './pixel-renderer';
import '../../ui/visualTheme.css';
import './commissions.css';

export interface CommissionScreenOptions { container: HTMLElement; onExit: () => void }
export interface CommissionScreenHandle { dispose(): void }
export interface CommissionFeedback { message: string; error: boolean; completed: string | null }
export interface CommissionController {
  read(): Pick<CommissionPageView, 'npcs' | 'readOnly' | 'warning' | 'sessionOnly'>;
  deliver(id: string): CommissionFeedback;
  subscribe(listener: () => void): () => void;
}
const MOVE_KEYS: Record<string, [number, number]> = {
  arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
  arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
};
let sequence = 0;

/** Screen owns input/scene lifetime; the controller alone performs real meta transactions. */
export function mountCommissionScreen(
  { container, onExit }: CommissionScreenOptions,
  controller: CommissionController,
): CommissionScreenHandle {
  const mountId = `acom-${++sequence}`;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const root = document.createElement('section');
  root.className = 'ag-theme acom'; root.setAttribute('aria-label', '画廊居民庭院');
  root.innerHTML = `<header class="acom-hud"><h1>回廊里的居民</h1><span class="acom-progress"></span><button type="button" data-action="exit" aria-label="返回画廊">返回 <span aria-hidden="true">Esc</span></button></header><div class="acom-stage"><canvas class="acom-canvas" tabindex="0" role="application" aria-label="可走动的居民庭院" aria-describedby="${mountId}-controls"></canvas><p class="acom-notice" role="status" aria-live="polite"></p><div class="acom-conversation"></div></div><footer class="acom-toolbar"><div class="acom-locations" role="group" aria-label="前往居民身边"><button type="button" data-action="travel" data-target="nereus">涅柔斯</button><button type="button" data-action="travel" data-target="daphne">达芙妮</button></div><button type="button" class="acom-interact" data-action="interact"></button></footer><p class="ag-sr-only" id="${mountId}-controls">WASD或方向键行走。点击地面行走，点击居民接近并交谈；F或Enter与附近居民交谈。Esc先结束交谈，再返回画廊。交付只由明确按钮触发，每份委托一次。</p>`;
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法绘制居民庭院');
  const stage = root.querySelector<HTMLElement>('.acom-stage')!;
  const hud = root.querySelector<HTMLElement>('.acom-hud')!;
  const toolbar = root.querySelector<HTMLElement>('.acom-toolbar')!;
  const notice = root.querySelector<HTMLElement>('.acom-notice')!;
  const progress = root.querySelector<HTMLElement>('.acom-progress')!;
  const conversation = root.querySelector<HTMLElement>('.acom-conversation')!;
  const interactButton = root.querySelector<HTMLButtonElement>('.acom-interact')!;
  const renderer = createCommissionPixelRenderer();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let view = controller.read();
  let player: CommissionSceneState['player'] = { ...COMMISSION_SPAWN, facing: 'left', walking: false };
  let viewport = createCommissionViewport(1, 1, player);
  let ratio = 1;
  let selectedNpc: NpcId | null = null;
  let selectedCommission: string | null = null;
  let target: CommissionTargetId | null = null;
  let pendingTalk: NpcId | null = null;
  let nearby: CommissionTargetId | null = null;
  let path: CommissionPoint[] = [];
  let feedback = '点地面行走 · 走近居民聊一聊';
  let feedbackError = false;
  let feedbackNpc: NpcId | null = null;
  let celebrationUntil = 0;
  let elapsed = 0;
  let lastTime = 0;
  let raf: number | null = null;
  let disposed = false;
  let exiting = false;
  let transacting = false;
  let unsubscribe = () => {};
  const keys = new Set<string>();
  const warning = () => [view.warning, view.readOnly ? '当前存储只读，可交谈查看，暂时无法交付。' : '', view.sessionOnly ? '变更仅保留本页，尚未保存；重载可能丢失，请勿自动重试。' : ''].filter(Boolean).join(' ');
  const clearMovement = () => { keys.clear(); path = []; pendingTalk = null; player.walking = false; };
  const updateNearby = () => {
    const wanted = target ? getCommissionTarget(target) : null;
    nearby = wanted && Math.hypot(wanted.approach.x - player.x, wanted.approach.y - player.y) <= 74 ? wanted.id : nearestCommissionTarget(player, 74);
    const label = path.length ? `正在前往${wanted?.name ?? '目的地'}…` : nearby ? nearby === 'exit' ? '返回画廊' : `与${getCommissionTarget(nearby)!.name}交谈` : '靠近居民后交谈';
    if (interactButton.textContent !== label) interactButton.textContent = label;
    interactButton.disabled = Boolean(selectedNpc) || !nearby || path.length > 0;
  };
  const renderConversation = () => {
    if (!selectedNpc) { conversation.innerHTML = ''; root.classList.remove('acom-talking'); return; }
    const npc = view.npcs.find(item => item.id === selectedNpc);
    if (!npc) return;
    if (!npc.cards.some(card => card.id === selectedCommission)) selectedCommission = npc.cards.find(card => !card.completed)?.id ?? npc.cards[0]?.id ?? null;
    if (!selectedCommission) return;
    const focus = document.activeElement instanceof HTMLElement && conversation.contains(document.activeElement) ? document.activeElement.dataset.focus : undefined;
    const scroll = conversation.querySelector('.acom-dialogue-body')?.scrollTop ?? 0;
    conversation.innerHTML = renderCommissionDialogue({ mountId, npc, selected: selectedCommission, feedback, error: feedbackError, warning: warning(), readOnly: view.readOnly, sessionOnly: view.sessionOnly });
    conversation.querySelector('.acom-dialogue-body')!.scrollTop = scroll;
    if (focus) {
      const next = Array.from(conversation.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).find(button => button.dataset.focus === focus);
      (next ?? conversation.querySelector<HTMLButtonElement>('[data-action="close"]'))?.focus({ preventScroll: true });
    }
  };
  const render = () => {
    if (disposed) return;
    view = controller.read();
    const cards = view.npcs.flatMap(npc => npc.cards);
    progress.textContent = `心意 ${cards.filter(card => card.completed).length} / ${cards.length}`;
    const text = [feedback, warning()].filter(Boolean).join(' ');
    if (notice.textContent !== text) notice.textContent = text;
    notice.dataset.error = String(feedbackError || Boolean(warning()));
    renderConversation(); updateNearby();
  };
  const closeConversation = () => {
    selectedNpc = null; selectedCommission = null; clearMovement();
    root.classList.remove('acom-talking'); conversation.innerHTML = '';
    hud.inert = false; toolbar.inert = false; canvas.inert = false;
    updateNearby(); canvas.focus({ preventScroll: true });
  };
  const openConversation = (id: NpcId) => {
    if (!view.npcs.some(npc => npc.id === id)) return;
    clearMovement(); selectedNpc = id;
    selectedCommission = view.npcs.find(npc => npc.id === id)!.cards.find(card => !card.completed)?.id ?? view.npcs.find(npc => npc.id === id)!.cards[0]?.id ?? null;
    feedback = view.npcs.find(npc => npc.id === id)!.greeting; feedbackError = false;
    root.classList.add('acom-talking'); hud.inert = true; toolbar.inert = true; canvas.inert = true;
    render(); conversation.querySelector<HTMLButtonElement>('[data-action="close"]')?.focus({ preventScroll: true });
  };
  const travel = (id: CommissionTargetId, talkOnArrival = false) => {
    const item = getCommissionTarget(id); if (!item) return;
    if (selectedNpc) closeConversation();
    clearMovement(); target = id; path = createCommissionPath(player, item.approach);
    pendingTalk = talkOnArrival && id !== 'exit' ? id : null;
    feedback = `前往${item.name}${pendingTalk ? '交谈' : '，靠近后按交互'}。`; feedbackError = false;
    canvas.focus({ preventScroll: true }); render();
    if (!path.length && pendingTalk && Math.hypot(item.approach.x - player.x, item.approach.y - player.y) <= 74) openConversation(pendingTalk);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true; clearMovement();
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null; observer.disconnect(); unsubscribe(); renderer.dispose();
    root.removeEventListener('click', handleClick); canvas.removeEventListener('pointerdown', handlePointer);
    root.removeEventListener('pointercancel', clearMovement);
    window.removeEventListener('keydown', handleKey, true); window.removeEventListener('keyup', handleKeyUp, true);
    window.removeEventListener('blur', clearMovement); document.removeEventListener('visibilitychange', handleVisibility);
    root.remove(); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  const exit = () => { if (disposed || exiting) return; exiting = true; dispose(); onExit(); };
  const interact = () => {
    if (selectedNpc || path.length || !nearby) return;
    if (nearby === 'exit') exit(); else { target = nearby; openConversation(nearby); }
  };
  const deliver = (id: string) => {
    const card = view.npcs.find(npc => npc.id === selectedNpc)?.cards.find(item => item.id === id);
    if (disposed || transacting || !card || id !== selectedCommission || view.readOnly || card.completed) return;
    transacting = true;
    try {
      const result = controller.deliver(id);
      feedback = result.message; feedbackError = result.error;
      if (result.completed) { feedbackNpc = selectedNpc; celebrationUntil = elapsed + 3; }
    } catch {
      feedback = '这次交付结果未能确认。请核对库存与存储提示；不会自动重试。'; feedbackError = true;
    } finally { transacting = false; }
    render();
  };
  const handleClick = (event: MouseEvent) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null;
    if (disposed || transacting || !button || !root.contains(button) || button.disabled) return;
    event.stopPropagation();
    switch (button.dataset.action) {
      case 'exit': exit(); break;
      case 'close': closeConversation(); break;
      case 'travel': travel(button.dataset.target as CommissionTargetId, true); break;
      case 'interact': interact(); break;
      case 'topic': {
        const card = view.npcs.find(npc => npc.id === selectedNpc)?.cards.find(item => item.id === button.dataset.id);
        if (card) { selectedCommission = card.id; feedback = card.request; feedbackError = false; render(); }
        break;
      }
      case 'deliver': if (button.dataset.id) deliver(button.dataset.id); break;
    }
  };
  const handlePointer = (event: PointerEvent) => {
    if (selectedNpc || disposed || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); event.stopPropagation(); canvas.focus({ preventScroll: true });
    const rect = canvas.getBoundingClientRect();
    const point = screenToCommission(viewport, event.clientX - rect.left, event.clientY - rect.top);
    const hit = hitCommissionTarget(point);
    if (hit) { travel(hit, hit !== 'exit'); return; }
    clearMovement(); target = null; path = createCommissionPath(player, point); updateNearby();
  };
  const handleKey = (event: KeyboardEvent) => {
    if (disposed || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat) { if (selectedNpc) closeConversation(); else exit(); } return;
    }
    if (key === 'tab') {
      const scope = selectedNpc ? conversation : root;
      const focusable = Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled), canvas[tabindex]'));
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      event.preventDefault(); event.stopImmediatePropagation();
      focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus(); return;
    }
    const onButton = document.activeElement instanceof HTMLButtonElement && root.contains(document.activeElement);
    if ((key === 'enter' || key === ' ') && onButton) {
      if (event.repeat) event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    if (MOVE_KEYS[key]) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!selectedNpc) { pendingTalk = null; path = []; target = null; keys.add(key); } return;
    }
    if (key === 'f' || key === 'enter') {
      event.preventDefault(); event.stopImmediatePropagation(); if (!event.repeat) interact(); return;
    }
    event.stopPropagation();
  };
  const handleKeyUp = (event: KeyboardEvent) => {
    if (MOVE_KEYS[event.key.toLowerCase()]) { keys.delete(event.key.toLowerCase()); event.preventDefault(); event.stopImmediatePropagation(); }
  };
  const resize = () => {
    if (disposed) return;
    const rect = stage.getBoundingClientRect(); ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio)); canvas.height = Math.max(1, Math.round(rect.height * ratio));
    viewport = createCommissionViewport(Math.max(1, rect.width), Math.max(1, rect.height), player);
  };
  const frame = (time: number) => {
    raf = null; if (disposed || document.hidden) return;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, .05) : 0; lastTime = time; elapsed += dt;
    let dx = 0; let dy = 0;
    if (!selectedNpc) {
      for (const key of keys) { dx += MOVE_KEYS[key][0]; dy += MOVE_KEYS[key][1]; }
      if (dx || dy) { const length = Math.hypot(dx, dy); dx = dx / length * 180 * dt; dy = dy / length * 180 * dt; }
      else if (path.length) {
        const next = path[0]; const distance = Math.hypot(next.x - player.x, next.y - player.y); const step = Math.min(distance, 180 * dt);
        if (distance > .01) { dx = (next.x - player.x) / distance * step; dy = (next.y - player.y) / distance * step; }
        if (distance <= step + .1) path.shift();
      }
    }
    const next = moveCommissionPlayer(player, dx, dy);
    const walking = Math.hypot(next.x - player.x, next.y - player.y) > .01;
    if (dx) player.facing = dx < 0 ? 'left' : 'right'; player = { ...player, ...next, walking };
    if (!path.length && pendingTalk) {
      const item = getCommissionTarget(pendingTalk)!;
      if (Math.hypot(item.approach.x - player.x, item.approach.y - player.y) <= 74) openConversation(pendingTalk);
      else pendingTalk = null;
    }
    if (feedbackNpc && elapsed >= celebrationUntil) feedbackNpc = null;
    // During conversation the upper scene follows the speakers; the lower half is the dialogue box.
    viewport = createCommissionViewport(canvas.width / ratio, canvas.height / ratio * (selectedNpc ? .54 : 1), player); updateNearby();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#172b29'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.imageSmoothingEnabled = false;
    ctx.setTransform(ratio * viewport.scale, 0, 0, ratio * viewport.scale, ratio * viewport.offsetX, ratio * viewport.offsetY);
    renderer.draw(ctx, { player, target: target ?? nearby, conversation: selectedNpc, npcs: view.npcs.map(npc => ({ id: npc.id as NpcId, completed: npc.cards.filter(card => card.completed).length, total: npc.cards.length, ready: npc.cards.some(card => !card.completed && !card.capacityBlocked && card.items.every(item => item.owned >= item.quantity)) })), feedbackNpc, elapsed, reducedMotion: reducedMotion.matches });
    raf = requestAnimationFrame(frame);
  };
  const handleVisibility = () => {
    clearMovement(); lastTime = 0;
    if (document.hidden) { if (raf !== null) cancelAnimationFrame(raf); raf = null; }
    else if (raf === null && !disposed) raf = requestAnimationFrame(frame);
  };
  const observer = new ResizeObserver(resize);
  container.append(root); render(); resize(); observer.observe(stage);
  root.addEventListener('click', handleClick); canvas.addEventListener('pointerdown', handlePointer); root.addEventListener('pointercancel', clearMovement);
  window.addEventListener('keydown', handleKey, true); window.addEventListener('keyup', handleKeyUp, true);
  window.addEventListener('blur', clearMovement); document.addEventListener('visibilitychange', handleVisibility);
  unsubscribe = controller.subscribe(() => { if (!disposed && !transacting) render(); });
  canvas.focus({ preventScroll: true }); raf = requestAnimationFrame(frame);
  return { dispose };
}
