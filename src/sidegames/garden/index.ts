import {
  craftSupply, harvestPlant, loadProfile, META_LIMITS, packSupply, PLANTS,
  PLANT_IDS, plantSeed, subscribeProfile, SUPPLIES, SUPPLY_IDS,
} from '../../meta/profile';
import type { MetaFailure, MetaResult, PlantId, ProfileState, SupplyId } from '../../meta/types';
import {
  COMMISSIONS, COMMISSION_IDS, FISH, FISH_IDS, LIFE_LIMITS, NPCS,
  RECIPES, RECIPE_IDS, RESTORATIONS, RESTORATION_IDS,
} from '../../meta/life';
import type { LifeCost } from '../../meta/life';
import { GARDEN_BEDS, GARDEN_SPAWN, GARDEN_STATIONS } from './pixel-contract';
import type { GardenSceneState, GardenTargetId } from './pixel-contract';
import {
  createGardenPath, createGardenViewport, getGardenTarget, hitGardenTarget,
  moveGardenPlayer, nearestGardenTarget, screenToGarden,
} from './pixel-controls';
import type { GardenPoint } from './pixel-controls';
import { createGardenPixelRenderer } from './pixel-renderer';
import { audio, type LifeSound } from '../../audio/audio';
import '../../ui/visualTheme.css';
import './garden.css';

export interface GardenOptions { container: HTMLElement; onExit: () => void }
export interface GardenHandle { dispose(): void }
type Panel = GardenTargetId | 'places' | null;
const TARGETS = [...GARDEN_BEDS, ...GARDEN_STATIONS];
const MOVE_KEYS: Record<string, [number, number]> = {
  arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1],
  arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
};
const FAILURE_MESSAGES: Record<MetaFailure, string> = {
  invalid: '这次操作无法识别，请重新选择。',
  capacity: '库存已满，先使用或交付一些。本次没有扣料或收走花株。',
  occupied: '这块花圃已有植物，收获后再播种。',
  empty: '这里没有可以收获或携带的物品。',
  'not-ready': '还需要生长。成功钓鱼、完成委托或有效冒险后再回来。',
  insufficient: '材料不足，可以从钓鱼、种植和冒险中获得。',
  unavailable: '当前存储无法操作，请查看存储提示。',
};
let gardenSequence = 0;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!);
const shortName = (id: PlantId) => ({ olive: '橄榄', laurel: '月桂', iris: '鸢尾' })[id];
const costLabel = (cost: LifeCost) => [
  ...FISH_IDS.flatMap(id => cost.fish?.[id] ? [`${FISH[id].name} ×${cost.fish[id]}`] : []),
  ...PLANT_IDS.flatMap(id => cost.produce?.[id] ? [`${shortName(id)}原料 ×${cost.produce[id]}`] : []),
  ...(cost.fragments ? [`碎片 ×${cost.fragments}`] : []),
].join(' + ');

/** The caller pauses the main game. All progression still goes through the singleton meta API. */
export function mountGarden({ container, onExit }: GardenOptions): GardenHandle {
  const mountId = `agarden-${++gardenSequence}`;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const root = document.createElement('section');
  root.className = 'ag-theme agarden';
  root.setAttribute('aria-label', '月桂花园');
  root.innerHTML = `
    <header class="agarden-hud"><h1>月桂花园</h1><span class="agarden-stock"></span><button type="button" data-action="exit" data-focus="exit" aria-label="返回画廊">返回 <span aria-hidden="true">Esc</span></button></header>
    <div class="agarden-stage"><canvas class="agarden-canvas" tabindex="0" role="application" aria-label="可走动的像素庭院" aria-describedby="${mountId}-controls"></canvas><div class="agarden-feedback" role="status" aria-live="polite" aria-atomic="true"></div><div class="agarden-panels"></div></div>
    <footer class="agarden-toolbar"><div class="agarden-seeds" role="group" aria-label="选择种子"></div><div class="agarden-tools"><button type="button" data-action="places" data-focus="places">地点</button><button type="button" class="agarden-interact" data-action="interact" data-focus="interact"></button></div></footer>
    <p class="ag-sr-only" id="${mountId}-controls">方向键或WASD行走；点击地面行走，点击物件接近。F或Enter与附近物件交互。地点菜单可选择全部花圃与桌台。Esc先合上面板，再返回画廊。</p>`;
  const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建花园画布');
  const stage = root.querySelector<HTMLElement>('.agarden-stage')!;
  const stock = root.querySelector<HTMLElement>('.agarden-stock')!;
  const seeds = root.querySelector<HTMLElement>('.agarden-seeds')!;
  const panels = root.querySelector<HTMLElement>('.agarden-panels')!;
  const feedback = root.querySelector<HTMLElement>('.agarden-feedback')!;
  const interactButton = root.querySelector<HTMLButtonElement>('[data-action="interact"]')!;
  const hud = root.querySelector<HTMLElement>('.agarden-hud')!;
  const toolbar = root.querySelector<HTMLElement>('.agarden-toolbar')!;
  const renderer = createGardenPixelRenderer();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state: ProfileState = loadProfile();
  let selectedPlant: PlantId = PLANT_IDS.find(id => state.profile.seeds[id] > 0) ?? 'olive';
  let panel: Panel = null;
  let target: GardenTargetId | null = null;
  let nearby: GardenTargetId | null = null;
  let path: GardenPoint[] = [];
  let player: GardenSceneState['player'] = { ...GARDEN_SPAWN, facing: 'right', walking: false };
  let viewport = createGardenViewport(1, 1, player);
  let pixelRatio = 1;
  let disposed = false;
  let exiting = false;
  let transacting = false;
  let raf: number | null = null;
  let lastTime = 0;
  let elapsed = 0;
  let message = '点地面行走 · 靠近物件后交互';
  let messageError = false;
  const keys = new Set<string>();
  let unsubscribe = () => {};

  const readOnly = () => state.storage === 'unsupported' || state.storage === 'busy';
  const clearMovement = () => { keys.clear(); path = []; player.walking = false; };
  const storageWarning = () => {
    const memory = state.storage === 'memory' ? '当前变更仅保留本页，尚未写入本机存档；请勿依赖重载或自动重试。' : '';
    const locked = readOnly() ? '存储只读，可以查看，暂时无法播种、收获、调制或装包。' : '';
    return [state.warning, memory, locked].filter(Boolean).join(' ');
  };
  const setMessage = (value: string, error = false) => {
    message = value; messageError = error;
    renderFeedback();
  };
  const renderFeedback = () => {
    const warning = storageWarning();
    feedback.textContent = [message, warning].filter(Boolean).join(' ');
    feedback.dataset.error = String(messageError || Boolean(warning));
    feedback.title = feedback.textContent;
  };
  const updateNearby = () => {
    nearby = target && Math.hypot(player.x - getGardenTarget(target)!.approach.x, player.y - getGardenTarget(target)!.approach.y) <= 74
      ? target : nearestGardenTarget(player, 74);
    const label = path.length ? `前往${getGardenTarget(target!)?.name ?? '目的地'}…` : nearby ? `${getGardenTarget(nearby)!.name} · 交互` : '靠近物件后交互';
    if (interactButton.textContent !== label) interactButton.textContent = label;
    interactButton.disabled = Boolean(panel) || !nearby || path.length > 0;
  };
  const closePanel = () => {
    panel = null; panels.innerHTML = ''; root.classList.remove('agarden-panel-open');
    hud.inert = false; toolbar.inert = false; canvas.inert = false;
    clearMovement(); updateNearby(); canvas.focus({ preventScroll: true });
  };
  const renderPanel = () => {
    if (!panel) { panels.innerHTML = ''; root.classList.remove('agarden-panel-open'); return; }
    root.classList.add('agarden-panel-open');
    hud.inert = true; toolbar.inert = true; canvas.inert = true;
    const focused = document.activeElement instanceof HTMLElement && panels.contains(document.activeElement)
      ? document.activeElement.dataset.focus : undefined;
    const scrollTop = panels.querySelector('.agarden-panel-body')?.scrollTop ?? 0;
    const p = state.profile;
    const locked = readOnly();
    let title = panel === 'places' ? '庭院地点' : getGardenTarget(panel)!.name;
    let body = '';
    if (panel === 'places') {
      body = `<p>选择目的地，沿石径走过去。</p><nav class="agarden-places" aria-label="庭院地点">${TARGETS.map(item => `<button type="button" data-action="travel" data-target="${item.id}" data-focus="travel-${item.id}">${item.name}</button>`).join('')}</nav><p class="agarden-muted">WASD / 方向键行走 · F / Enter交互</p>`;
    } else if (panel.startsWith('bed-')) {
      const bedIndex = GARDEN_BEDS.find(bed => bed.id === panel)!.index;
      const bed = p.beds[bedIndex];
      const plant = bed ? PLANTS[bed.plant] : null;
      const growth = plant && bed ? Math.min(plant.growth, Math.max(0, p.growth - bed.plantedAt)) : 0;
      const ready = plant && growth >= plant.growth;
      const full = bed && p.produce[bed.plant] >= META_LIMITS.produce;
      body = bed && plant
        ? `<p class="agarden-panel-lead">${plant.name} <span>${ready ? '已经成熟' : `${growth} / ${plant.growth} 生长`}</span></p><progress value="${growth}" max="${plant.growth}" aria-label="${plant.name}生长进度"></progress><p>${ready ? `收获一份原料，当前库存 ${p.produce[bed.plant]} / ${META_LIMITS.produce}。` : `还需 ${plant.growth - growth} 点生长。成功钓鱼、完成委托或有效冒险后再来；散步和等待不会推进生长。`}</p><button type="button" class="agarden-primary" data-action="harvest" data-bed="${bedIndex}" data-focus="harvest-${bedIndex}" ${locked || !ready || full ? 'disabled' : ''}>${locked ? '存储为只读' : full ? '原料已满' : ready ? `收获${plant.name} ×1` : '尚未成熟'}</button>`
        : `<p class="agarden-panel-lead">种下${PLANTS[selectedPlant].name}</p><div class="agarden-seeds agarden-panel-seeds" role="group" aria-label="花圃种子">${PLANT_IDS.map(id => `<button type="button" data-action="seed" data-plant="${id}" data-focus="panel-seed-${id}" aria-pressed="${selectedPlant === id}">${shortName(id)} ×${p.seeds[id]}</button>`).join('')}</div><p>种子 ${p.seeds[selectedPlant]} / ${META_LIMITS.seeds} · ${PLANTS[selectedPlant].growth} 点生长成熟</p><p class="agarden-muted">成功钓鱼、完成委托与有效冒险带来生长。</p><button type="button" class="agarden-primary" data-action="plant" data-bed="${bedIndex}" data-focus="plant-${bedIndex}" ${locked || p.seeds[selectedPlant] < 1 ? 'disabled' : ''}>${locked ? '存储为只读' : p.seeds[selectedPlant] ? `播种${PLANTS[selectedPlant].name}` : '种子不足'}</button>`;
    } else if (panel === 'craft') {
      body = `<p>一份草木原料，调制一份出征补给。</p><div class="agarden-list">${SUPPLY_IDS.map(id => {
        const s = SUPPLIES[id]; const full = p.supplies[id] >= META_LIMITS.supplies;
        return `<article><h3>${s.name}<span>成品 ${p.supplies[id]} / ${META_LIMITS.supplies}</span></h3><p>${s.description}</p><p class="agarden-muted">消耗${shortName(s.plant)}原料 ×${s.cost} · 库存 ${p.produce[s.plant]} / ${META_LIMITS.produce}</p><button type="button" data-action="craft" data-supply="${id}" data-focus="craft-${id}" ${locked || full || p.produce[s.plant] < s.cost ? 'disabled' : ''}>${full ? '成品已满' : `调制${s.name} ×1`}</button></article>`;
      }).join('')}</div><p class="agarden-muted">原料也可配鱼做料理、交付委托或用于修复，详情见园艺手记。</p>`;
    } else if (panel === 'bag') {
      body = `<p class="agarden-panel-lead">${p.packedSupply ? `已装入：${SUPPLIES[p.packedSupply].name}` : '行囊空着，也能出发'}</p><p>单槽携带一份；换装和移出不扣库存，确认新冒险时才消耗。</p><div class="agarden-list">${SUPPLY_IDS.map(id => `<article><h3>${SUPPLIES[id].name}<span>库存 ${p.supplies[id]} / ${META_LIMITS.supplies}</span></h3><p>${SUPPLIES[id].description}</p><button type="button" data-action="pack" data-supply="${id}" data-focus="pack-${id}" aria-pressed="${p.packedSupply === id}" ${locked || !p.supplies[id] || p.packedSupply === id ? 'disabled' : ''}>${p.packedSupply === id ? '已装入' : `装入${SUPPLIES[id].name}`}</button></article>`).join('')}</div>${p.packedSupply ? `<button type="button" data-action="unpack" data-focus="unpack" ${locked ? 'disabled' : ''}>移出行囊</button>` : ''}<p class="agarden-muted">补给仅在一次冒险内生效，无永久属性叠加。</p>`;
    } else if (panel === 'journal') {
      body = `<p>鱼获、草木与日常的记录。回画廊进入湖畔、厨房、委托与修复处。</p><h3>草木原料</h3><ul>${PLANT_IDS.map(id => `<li>${PLANTS[id].name}<span>${p.produce[id]} / ${META_LIMITS.produce}</span></li>`).join('')}</ul><h3>鱼篓</h3><ul>${FISH_IDS.map(id => `<li>${FISH[id].name}<span>${p.life.fish[id]} / ${LIFE_LIMITS.fish}</span></li>`).join('')}</ul><h3>厨房配方</h3>${RECIPE_IDS.map(id => `<p><strong>${RECIPES[id].name}</strong><br>${escapeHtml(costLabel(RECIPES[id].ingredients))}<br><span class="agarden-muted">${RECIPES[id].description}</span></p>`).join('')}<h3>居民委托</h3><div class="agarden-list">${COMMISSION_IDS.map(id => `<article><h3>${COMMISSIONS[id].title}<span>${p.life.completedCommissions.includes(id) ? '已完成' : '未交付'}</span></h3><p>${NPCS[COMMISSIONS[id].npc].name} · ${escapeHtml(costLabel(COMMISSIONS[id].cost))}</p></article>`).join('')}</div><h3>画廊修复</h3>${RESTORATION_IDS.map(id => `<p><strong>${RESTORATIONS[id].name} · ${p.life.restored.includes(id) ? '已修复' : '等待修复'}</strong><br>${escapeHtml(costLabel(RESTORATIONS[id].cost))}<br>${RESTORATIONS[id].description}</p>`).join('')}<h3>生长笔记</h3><p>成功钓鱼与完成委托各带来 1 点生长。有效冒险持续至少 30 秒，并击败 8 名敌人、抵达第 2 层或胜利，可获得 1–3 点生长。所有花圃一起成长，不依赖现实时间。</p>`;
    }
    panels.innerHTML = `<section class="agarden-panel" role="dialog" aria-modal="true" aria-labelledby="${mountId}-panel-title"><header><h2 id="${mountId}-panel-title">${title}</h2><button type="button" data-action="close" data-focus="close" aria-label="合上面板">×</button></header><div class="agarden-panel-body">${body}</div><p class="agarden-panel-message" data-error="${messageError || Boolean(storageWarning())}">${escapeHtml([message, storageWarning()].filter(Boolean).join(' '))}</p></section>`;
    panels.querySelector('.agarden-panel-body')!.scrollTop = scrollTop;
    if (focused) {
      const next = Array.from(panels.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).find(button => button.dataset.focus === focused);
      (next ?? panels.querySelector<HTMLButtonElement>('[data-action="close"]'))?.focus({ preventScroll: true });
    }
  };
  const render = () => {
    if (disposed) return;
    const focused = document.activeElement instanceof HTMLElement && seeds.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
    const p = state.profile;
    stock.textContent = `碎片 ${p.fragments} · 生长 ${p.growth}${p.packedSupply ? ` · ${SUPPLIES[p.packedSupply].name}` : ''}`;
    seeds.innerHTML = PLANT_IDS.map(id => `<button type="button" data-action="seed" data-plant="${id}" data-focus="seed-${id}" aria-pressed="${selectedPlant === id}" aria-label="选择${PLANTS[id].name}，种子${p.seeds[id]}枚"><i style="--seed-color:${PLANTS[id].color}" aria-hidden="true"></i>${shortName(id)} <span>×${p.seeds[id]}</span></button>`).join('');
    if (focused) seeds.querySelector<HTMLButtonElement>(`[data-focus="${focused}"]`)?.focus({ preventScroll: true });
    renderFeedback(); renderPanel(); updateNearby();
  };
  const openPanel = (next: Panel) => {
    clearMovement(); panel = next; renderPanel(); updateNearby();
    panels.querySelector<HTMLButtonElement>('[data-action="close"]')?.focus({ preventScroll: true });
  };
  const travel = (id: GardenTargetId) => {
    const item = getGardenTarget(id);
    if (!item) return;
    if (panel) closePanel();
    keys.clear(); target = id; path = createGardenPath(player, item.approach);
    setMessage(`前往${item.name}，靠近后按交互。`); updateNearby();
  };
  const perform = (action: () => MetaResult, successMessage: string, sound: LifeSound) => {
    if (disposed || transacting || readOnly()) return;
    transacting = true;
    try {
      const result = action(); state = result;
      if (result.applied) audio.life(sound);
      else if (!result.duplicate) audio.life('error');
      messageError = (!result.applied && !result.duplicate) || result.storage === 'memory';
      message = result.applied ? successMessage : result.duplicate ? '这份选择已完成，无需重复操作。' : FAILURE_MESSAGES[result.reason ?? 'invalid'];
    } catch {
      // A write may have completed before throwing. Read back once; never retry automatically.
      try { state = loadProfile(); } catch { /* Retain the last readable snapshot. */ }
      messageError = true; message = '未能确认操作结果，请核对库存和存储提示；不会自动重试。';
    } finally { transacting = false; }
    render();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true; clearMovement();
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null; observer.disconnect(); unsubscribe(); renderer.dispose();
    root.removeEventListener('click', handleClick);
    canvas.removeEventListener('pointerdown', handlePointer);
    root.removeEventListener('pointercancel', clearMovement);
    window.removeEventListener('keydown', handleKey, true);
    window.removeEventListener('keyup', handleKeyUp, true);
    window.removeEventListener('blur', clearMovement);
    document.removeEventListener('visibilitychange', handleVisibility);
    root.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  const exit = () => {
    if (disposed || exiting) return;
    exiting = true; dispose(); onExit();
  };
  const interact = () => {
    if (panel || !nearby || path.length) return;
    if (nearby === 'exit') { exit(); return; }
    target = nearby; openPanel(nearby);
  };
  const handleClick = (event: MouseEvent) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null;
    if (!button || !root.contains(button) || button.disabled || transacting) return;
    event.stopPropagation();
    const action = button.dataset.action;
    if (action === 'exit') { exit(); return; }
    if (action === 'close') { closePanel(); return; }
    if (action === 'places') { openPanel('places'); return; }
    if (action === 'interact') { interact(); return; }
    if (action === 'travel') { travel(button.dataset.target as GardenTargetId); return; }
    if (action === 'seed') {
      const id = button.dataset.plant as PlantId;
      if (!PLANT_IDS.includes(id)) return;
      selectedPlant = id; setMessage(`已选择${PLANTS[id].name} · 种子 ${state.profile.seeds[id]}枚`); render(); return;
    }
    // Panel identity pins the transaction to the visible, nearby object.
    const bed = Number(button.dataset.bed);
    if ((action === 'plant' || action === 'harvest') && panel === `bed-${bed}` && GARDEN_BEDS.some(item => item.index === bed)) {
      if (action === 'plant') perform(() => plantSeed(bed, selectedPlant), `${PLANTS[selectedPlant].name}已种下。`, 'plant');
      else {
        const plant = state.profile.beds[bed]?.plant;
        perform(() => harvestPlant(bed), `收获${plant ? PLANTS[plant].name : '植物'}原料 ×1。`, 'harvest');
      }
    }
    const supply = button.dataset.supply as SupplyId;
    if (action === 'craft' && panel === 'craft' && SUPPLY_IDS.includes(supply)) perform(() => craftSupply(supply), `${SUPPLIES[supply].name}已调制完成。`, 'craft');
    if (action === 'pack' && panel === 'bag' && SUPPLY_IDS.includes(supply)) perform(() => packSupply(supply), `${SUPPLIES[supply].name}已装入，出征才会消耗。`, 'pack');
    if (action === 'unpack' && panel === 'bag') perform(() => packSupply(null), '补给已移出，库存未减少。', 'pack');
  };
  const handlePointer = (event: PointerEvent) => {
    if (panel || disposed || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); event.stopPropagation(); canvas.focus({ preventScroll: true });
    const rect = canvas.getBoundingClientRect();
    const point = screenToGarden(viewport, event.clientX - rect.left, event.clientY - rect.top);
    const hit = hitGardenTarget(point);
    if (hit) { travel(hit); return; }
    keys.clear(); target = null; path = createGardenPath(player, point); updateNearby();
  };
  const handleKey = (event: KeyboardEvent) => {
    if (disposed || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat) { if (panel) closePanel(); else exit(); }
      return;
    }
    if (key === 'tab') {
      const scope = panel ? panels : root;
      const buttons = Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled), canvas[tabindex]'));
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      event.preventDefault(); event.stopImmediatePropagation();
      buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus(); return;
    }
    const buttonFocused = document.activeElement instanceof HTMLButtonElement && root.contains(document.activeElement);
    if ((key === 'enter' || key === ' ') && buttonFocused) {
      if (event.repeat) event.preventDefault();
      event.stopImmediatePropagation(); return;
    }
    if (MOVE_KEYS[key]) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!panel) { keys.add(key); path = []; target = null; }
      return;
    }
    if (key === 'f' || key === 'enter') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat) interact(); return;
    }
    event.stopPropagation();
  };
  const handleKeyUp = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (MOVE_KEYS[key]) { keys.delete(key); event.preventDefault(); event.stopImmediatePropagation(); }
  };
  const resize = () => {
    if (disposed) return;
    const rect = stage.getBoundingClientRect();
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * pixelRatio));
    canvas.height = Math.max(1, Math.round(rect.height * pixelRatio));
    viewport = createGardenViewport(Math.max(1, rect.width), Math.max(1, rect.height), player);
  };
  const frame = (time: number) => {
    raf = null;
    if (disposed || document.hidden) return;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
    lastTime = time; elapsed += dt;
    let dx = 0; let dy = 0;
    if (!panel) {
      for (const key of keys) { dx += MOVE_KEYS[key][0]; dy += MOVE_KEYS[key][1]; }
      if (dx || dy) {
        const length = Math.hypot(dx, dy); dx = dx / length * 180 * dt; dy = dy / length * 180 * dt;
      } else if (path.length) {
        const next = path[0]; const distance = Math.hypot(next.x - player.x, next.y - player.y);
        const step = Math.min(distance, 180 * dt);
        if (distance > 0.01) { dx = (next.x - player.x) / distance * step; dy = (next.y - player.y) / distance * step; }
        if (distance <= step + 0.1) path.shift();
      }
    }
    const moved = moveGardenPlayer(player, dx, dy);
    const walking = Math.hypot(moved.x - player.x, moved.y - player.y) > 0.01;
    if (dx) player.facing = dx < 0 ? 'left' : 'right';
    player = { ...player, ...moved, walking };
    viewport = createGardenViewport(viewport.width, viewport.height, player);
    updateNearby();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#172b29'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(pixelRatio * viewport.scale, 0, 0, pixelRatio * viewport.scale, pixelRatio * viewport.offsetX, pixelRatio * viewport.offsetY);
    renderer.draw(ctx, {
      beds: state.profile.beds.map(bed => ({ plant: bed?.plant ?? null, progress: bed ? Math.min(PLANTS[bed.plant].growth, Math.max(0, state.profile.growth - bed.plantedAt)) : 0, required: bed ? PLANTS[bed.plant].growth : 1 })),
      player, target: target ?? nearby, selectedPlant, packedSupply: state.profile.packedSupply,
      elapsed, reducedMotion: reducedMotion.matches,
    });
    raf = requestAnimationFrame(frame);
  };
  const handleVisibility = () => {
    clearMovement(); lastTime = 0;
    if (document.hidden) { if (raf !== null) cancelAnimationFrame(raf); raf = null; }
    else if (raf === null && !disposed) raf = requestAnimationFrame(frame);
  };
  const observer = new ResizeObserver(resize);
  container.append(root);
  render(); resize(); observer.observe(stage);
  root.addEventListener('click', handleClick);
  canvas.addEventListener('pointerdown', handlePointer);
  root.addEventListener('pointercancel', clearMovement);
  window.addEventListener('keydown', handleKey, true);
  window.addEventListener('keyup', handleKeyUp, true);
  window.addEventListener('blur', clearMovement);
  document.addEventListener('visibilitychange', handleVisibility);
  unsubscribe = subscribeProfile(() => {
    if (disposed || transacting) return;
    state = loadProfile(); render();
  });
  canvas.focus({ preventScroll: true });
  raf = requestAnimationFrame(frame);
  return { dispose };
}
