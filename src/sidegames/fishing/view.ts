import '../../ui/visualTheme.css';
import { createFishingPixelRenderer } from './pixel-renderer';
import './fishing.css';

export interface FishingCatalogItem {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly color?: string;
  readonly count?: number;
}

/** Presentation only. The controller owns mechanics, animation time and settlement. */
export interface FishingViewModel {
  readonly phase: string;
  readonly title?: string;
  readonly instruction?: string;
  readonly cue?: string;
  /** Stable spoken cue; the visible cue can contain a changing countdown. */
  readonly announcementCue?: string;
  readonly tension?: number;
  readonly progress?: number;
  readonly castPower?: number;
  readonly elapsed?: number;
  readonly animationTime?: number;
  readonly fishCue?: 'rest' | 'pull' | 'surge-warning' | 'surge';
  readonly reducedMotion?: boolean;
  readonly status?: string;
  readonly catalog?: readonly FishingCatalogItem[];
  readonly fishId?: string;
  readonly fishName?: string;
  readonly settlement?: string;
  readonly surging?: boolean;
  readonly primaryHeld?: boolean;
  readonly disabled?: boolean;
  readonly retryDisabled?: boolean;
  readonly primaryLabel?: string;
  readonly retryLabel?: string;
  readonly primaryHint?: string;
  readonly bobberCue?: 'quiet' | 'nibble' | 'bite';
  readonly tensionSafeMin?: number;
  readonly tensionSafeMax?: number;
}

export interface FishingViewCallbacks {
  onPrimaryDown(): void;
  onPrimaryUp(): void;
  onRetry(): void;
  onExit(): void;
  /** The controller clears held input; a panel never changes gameplay time. */
  onPanelChange?(open: boolean): void;
}

export interface FishingView {
  readonly element: HTMLElement;
  readonly primaryButton: HTMLButtonElement;
  render(model: FishingViewModel): void;
  /** Returns true when Escape only closed the fish basket. */
  handleEscape(): boolean;
  getFocusScope(): HTMLElement;
  dispose(): void;
}

let viewSequence = 0;
const fraction = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, Math.min(1, value!)) : 0;
const percentage = (value: number | undefined) => Math.round(fraction(value) * 100);
const finiteTime = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, value!) : 0;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const activePhase = (phase: string) => ['casting', 'waiting', 'bite', 'reeling'].includes(phase);

/** One scene, one render call. No animation loop, global input or persistence here. */
export function createFishingView(container: HTMLElement, callbacks: FishingViewCallbacks): FishingView {
  const id = `afish-${++viewSequence}`;
  const root = document.createElement('section');
  root.className = 'ag-theme afish';
  root.tabIndex = -1;
  root.setAttribute('aria-label', '苇影湖像素钓点');
  root.dataset.phase = 'idle';
  root.innerHTML = `<header class="afish-hud" data-ref="hud">
      <div class="afish-place"><h1>苇影湖</h1><span>芦苇浅湾 <span class="afish-clock" data-ref="clock" aria-hidden="true">00:00</span></span></div>
      <div class="afish-hud-actions"><button type="button" class="afish-basket-button" data-ref="basket" aria-haspopup="dialog" aria-controls="${id}-basket" aria-expanded="false"><i class="afish-basket-icon" aria-hidden="true"></i><span>鱼篓 <strong data-ref="basket-count">0</strong></span></button><button type="button" class="afish-back" data-ref="exit"><span aria-hidden="true">←</span> 返回<span class="afish-desktop-key" aria-hidden="true">Esc</span></button></div>
    </header>
    <div class="afish-stage" data-ref="stage"><canvas class="afish-canvas" data-ref="canvas" aria-hidden="true"></canvas><p class="afish-scene-cue" data-ref="scene-cue"><span class="afish-cue-mark" data-ref="cue-mark" aria-hidden="true">◆</span><span data-ref="cue-text">观察浮标，等鱼咬钩</span></p><span class="afish-scene-label" aria-hidden="true">ADONIS · 湖湾钓点</span></div>
    <section class="afish-command" data-ref="command" aria-labelledby="${id}-title">
      <div class="afish-information"><div class="afish-title-row"><span class="afish-step" data-ref="step">准备抛竿</span><h2 id="${id}-title" data-ref="title">把鱼饵送到水面</h2></div><p class="afish-instruction" id="${id}-instruction" data-ref="instruction">按住蓄力约一秒，松开抛竿。</p>
        <div class="afish-meters" data-ref="meters"><div class="afish-power-section" data-ref="power-section"><div class="afish-meter-label"><span>抛竿力度</span><strong data-ref="power-value">0%</strong><span class="afish-meter-note">约蓄力一秒后松开</span></div><div class="afish-power-track" data-ref="power" role="progressbar" aria-label="抛竿蓄力" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="afish-power-fill"></div><span class="afish-power-target"></span></div></div>
          <div class="afish-tension-section" data-ref="tension-section" hidden><div class="afish-meter-label"><span>鱼线张力</span><strong data-ref="tension-value">0%</strong><span class="afish-meter-note">守住亮色区</span></div><div class="afish-tension-track" data-ref="tension" role="meter" aria-label="鱼线张力" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="afish-safe-zone"></div><div class="afish-tension-needle"></div></div><div class="afish-progress-row"><span>收线</span><div class="afish-progress-track" data-ref="progress" role="progressbar" aria-label="收线进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="afish-progress-fill"></div></div><strong data-ref="progress-value">0%</strong></div></div>
        </div><p class="afish-settlement" data-ref="settlement" hidden></p>
      </div>
      <div class="afish-controls"><button type="button" class="afish-primary" data-ref="primary" aria-describedby="${id}-instruction ${id}-keyhint"><span data-ref="primary-label">按住蓄力</span></button><button type="button" class="afish-retry" data-ref="retry" hidden>再抛一竿</button><p class="afish-primary-hint" data-ref="primary-hint">松开抛竿</p><p class="afish-keyhint" id="${id}-keyhint">空格 / Enter 与按钮相同</p></div>
      <p class="afish-status" data-ref="status"></p>
    </section>
    <div class="afish-panels" data-ref="panels" hidden><section class="afish-panel" data-ref="dialog" id="${id}-basket" role="dialog" aria-modal="true" aria-labelledby="${id}-basket-title" tabindex="-1"><header><h2 id="${id}-basket-title">鱼篓</h2><button type="button" data-ref="close-panel" aria-label="关闭鱼篓">×</button></header><div class="afish-panel-body"><p class="afish-panel-lead">收好的鱼，带去下一段生活。</p><ul class="afish-fish-list" data-ref="catalog"></ul><p class="afish-panel-note">鱼可用于烹饪与居民委托。这里显示真实行囊库存；仅在收竿后查看鱼篓。</p></div><p class="afish-panel-status" data-ref="panel-status" hidden></p><footer><button type="button" data-ref="continue">合上鱼篓</button><span>Esc 关闭</span></footer></section></div>
    <p class="afish-sr-only" data-ref="announcer" role="status" aria-live="polite" aria-atomic="true"></p>`;
  container.append(root);
  const ref = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;
  const primary = ref<HTMLButtonElement>('primary');
  const retry = ref<HTMLButtonElement>('retry');
  const exit = ref<HTMLButtonElement>('exit');
  const basket = ref<HTMLButtonElement>('basket');
  const panels = ref('panels');
  const dialog = ref('dialog');
  const canvas = ref<HTMLCanvasElement>('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) { root.remove(); throw new Error('当前浏览器无法绘制像素钓点。'); }
  const renderer = createFishingPixelRenderer();
  ctx.imageSmoothingEnabled = false;
  const fields = Object.fromEntries(['title', 'instruction', 'step', 'clock', 'cue-text', 'cue-mark', 'power-value', 'tension-value', 'progress-value', 'settlement', 'primary-label', 'primary-hint', 'status', 'announcer', 'basket-count', 'panel-status'].map(name => [name, ref(name)]));
  const controller = new AbortController();
  const signal = controller.signal;
  let disposed = false;
  let pointerId: number | null = null;
  let panelOpen = false;
  let modelActive = false;
  let previousAnnouncement = '';
  let previousCatalog = '';
  let previousPhase = '';
  let previousFocus: HTMLElement | null = null;

  function resizeCanvas() {
    if (disposed) return;
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const width = Math.min(2400, Math.max(1, Math.round(bounds.width * dpr)));
    const height = Math.min(1800, Math.max(1, Math.round(bounds.height * dpr)));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
      ctx!.imageSmoothingEnabled = false;
    }
  }
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resizeCanvas);
  observer?.observe(canvas);
  resizeCanvas();

  const releasePointer = () => {
    if (pointerId === null) return;
    const captured = pointerId;
    pointerId = null;
    if (primary.hasPointerCapture(captured)) primary.releasePointerCapture(captured);
    root.dataset.pressed = 'false';
    if (!disposed) callbacks.onPrimaryUp();
  };

  function setPanelOpen(open: boolean) {
    if (disposed || panelOpen === open || open && modelActive) return;
    if (open) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : basket;
      releasePointer();
    }
    panelOpen = open;
    root.dataset.panelOpen = String(open);
    panels.hidden = !open;
    ref('hud').inert = open;
    ref('command').inert = open;
    ref('stage').inert = open;
    basket.setAttribute('aria-expanded', String(open));
    callbacks.onPanelChange?.(open);
    if (open) ref<HTMLButtonElement>('close-panel').focus({ preventScroll: true });
    else if (previousFocus?.isConnected && !previousFocus.hasAttribute('disabled')) previousFocus.focus({ preventScroll: true });
    else basket.focus({ preventScroll: true });
  }

  primary.addEventListener('pointerdown', event => {
    if (disposed || panelOpen || primary.disabled || pointerId !== null || event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    pointerId = event.pointerId;
    primary.setPointerCapture(event.pointerId);
    primary.focus({ preventScroll: true });
    root.dataset.pressed = 'true';
    callbacks.onPrimaryDown();
  }, { signal });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    primary.addEventListener(type, event => {
      if (event.pointerId !== pointerId) return;
      event.preventDefault(); event.stopPropagation(); releasePointer();
    }, { signal });
  }
  primary.addEventListener('contextmenu', event => event.preventDefault(), { signal });
  primary.addEventListener('click', event => {
    if (event.detail !== 0 || primary.disabled || panelOpen || disposed) return;
    callbacks.onPrimaryDown(); callbacks.onPrimaryUp();
  }, { signal });
  retry.addEventListener('click', () => { if (!disposed && !panelOpen && !retry.disabled) callbacks.onRetry(); }, { signal });
  exit.addEventListener('click', () => { if (!disposed && !panelOpen) callbacks.onExit(); }, { signal });
  basket.addEventListener('click', () => { if (!basket.disabled) setPanelOpen(true); }, { signal });
  ref('close-panel').addEventListener('click', () => setPanelOpen(false), { signal });
  ref('continue').addEventListener('click', () => setPanelOpen(false), { signal });
  panels.addEventListener('click', event => { if (event.target === panels) setPanelOpen(false); }, { signal });

  function render(model: FishingViewModel): void {
    if (disposed) return;
    const phase = model.phase;
    const finished = ['success', 'failure', 'cancelled', 'error'].includes(phase);
    const reeling = phase === 'reeling';
    const waiting = phase === 'waiting';
    const bite = phase === 'bite';
    const charging = phase === 'casting';
    modelActive = activePhase(phase);
    root.dataset.phase = phase;
    root.dataset.surging = String(Boolean(model.surging));
    root.dataset.bobberCue = model.bobberCue ?? (bite ? 'bite' : 'quiet');
    root.dataset.held = String(Boolean(model.primaryHeld));
    root.dataset.finished = String(finished);
    root.style.setProperty('--afish-power', `${percentage(model.castPower)}%`);
    root.style.setProperty('--afish-tension', `${percentage(model.tension)}%`);
    root.style.setProperty('--afish-progress', `${percentage(model.progress)}%`);
    const safeMin = fraction(model.tensionSafeMin ?? .22);
    const safeMax = Math.max(safeMin, fraction(model.tensionSafeMax ?? .72));
    root.style.setProperty('--afish-safe-left', `${safeMin * 100}%`);
    root.style.setProperty('--afish-safe-width', `${(safeMax - safeMin) * 100}%`);
    const tensionZone = fraction(model.tension) >= safeMax ? 'high' : fraction(model.tension) <= safeMin ? 'low' : 'safe';
    root.dataset.tensionZone = tensionZone;
    const title = model.title ?? (finished ? phase === 'success' ? '鱼获上岸！' : '这一尾，留给下次。' : reeling ? '稳住张力，把鱼带近。' : bite ? '现在扬竿！' : waiting ? '看着浮标，耐心一点。' : '选好落点，送出鱼钩。');
    const instruction = model.instruction ?? (reeling ? '按住收线，松开让线。太紧会断，太松会脱钩。' : bite ? '现在新按一下按钮或空格扬竿。' : waiting ? '轻触只是试探，等浮标明显下沉。' : '按住蓄力约一秒，松开抛竿。');
    const cue = model.cue ?? (model.surging ? '鱼儿发力，先松线缓一缓' : reeling ? '一收一放，守住亮色安全区' : bite ? '浮标沉下！现在扬竿' : waiting ? model.bobberCue === 'nibble' ? '轻轻试探，还没咬稳，先别扬竿' : '观察浮标，等鱼真正咬钩' : finished ? phase === 'success' ? '鱼已上岸，可以查看鱼篓' : '湖水还在，可以再试一竿' : '按住蓄力，松开抛竿');
    fields.title.textContent = title;
    fields.instruction.textContent = instruction;
    fields.step.textContent = ({ idle: '准备', casting: '01 抛竿', waiting: '02 观察', bite: '02 扬竿', reeling: '03 收线', success: '收获', failure: '脱钩', cancelled: '收竿', error: '保存提示' } as Record<string, string>)[phase] ?? '钓点';
    fields['cue-text'].textContent = cue;
    fields['cue-mark'].textContent = bite ? '!' : model.surging ? '↑' : phase === 'success' ? '✓' : '◆';
    const elapsed = Math.floor(finiteTime(model.elapsed));
    fields.clock.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
    fields['power-value'].textContent = `${percentage(model.castPower)}%`;
    fields['tension-value'].textContent = `${percentage(model.tension)}%`;
    fields['progress-value'].textContent = `${percentage(model.progress)}%`;
    ref('power').setAttribute('aria-valuenow', String(percentage(model.castPower)));
    ref('tension').setAttribute('aria-valuenow', String(percentage(model.tension)));
    ref('tension').setAttribute('aria-valuetext', `${percentage(model.tension)}%，${tensionZone === 'high' ? '张力偏高，请松开' : tensionZone === 'low' ? '张力偏低，请收线' : '处于安全区'}`);
    ref('progress').setAttribute('aria-valuenow', String(percentage(model.progress)));
    ref('power-section').hidden = reeling || finished || waiting || bite;
    ref('tension-section').hidden = !reeling;
    ref('meters').hidden = finished || waiting || bite;
    fields.settlement.hidden = !finished || !model.settlement;
    fields.settlement.textContent = model.settlement ?? '';
    primary.hidden = finished;
    primary.disabled = Boolean(model.disabled || panelOpen);
    primary.setAttribute('aria-pressed', String(Boolean(model.primaryHeld || pointerId !== null)));
    fields['primary-label'].textContent = model.primaryLabel ?? (reeling ? model.primaryHeld ? '松开缓线' : '按住收线' : bite ? '现在扬竿！' : waiting ? '等下沉再扬竿' : charging ? '松开抛竿' : '按住蓄力');
    fields['primary-hint'].textContent = model.primaryHint ?? (reeling ? '按住收线 · 松开让线' : waiting ? '提前扬竿会惊走鱼' : bite ? '新按一下，及时扬竿' : finished ? '收竿后可查看鱼篓' : '松开抛竿');
    retry.hidden = !finished;
    retry.disabled = Boolean(model.retryDisabled || panelOpen);
    retry.textContent = model.retryLabel ?? (phase === 'error' ? '重试保存' : phase === 'success' ? '再钓一条' : '再抛一竿');
    fields.status.textContent = model.status ?? '';
    fields.status.hidden = !model.status || model.status === model.settlement;
    fields['panel-status'].textContent = model.status ?? '';
    fields['panel-status'].hidden = !model.status;
    basket.disabled = modelActive;
    basket.title = modelActive ? '收竿后查看鱼篓' : '查看鱼篓库存';
    if (phase !== previousPhase && finished && !panelOpen) retry.focus({ preventScroll: true });
    previousPhase = phase;
    const catalog = model.catalog ?? [];
    const catalogKey = JSON.stringify([catalog, model.fishId]);
    if (catalogKey !== previousCatalog) {
      previousCatalog = catalogKey;
      const stock = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : 0;
      fields['basket-count'].textContent = String(catalog.reduce((total, fish) => total + stock(fish.count), 0));
      ref('catalog').innerHTML = catalog.length ? catalog.map(fish => {
        const color = /^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(fish.color ?? '') ? fish.color : '#b4cda0';
        return `<li ${model.fishId === fish.id ? 'data-caught="true"' : ''}><i class="afish-fish-pixel" style="--fish-color:${color}" aria-hidden="true"></i><strong>${escapeHtml(fish.name)}</strong><span class="afish-fish-count">× ${stock(fish.count)}</span>${fish.description ? `<small>${escapeHtml(fish.description)}</small>` : ''}</li>`;
      }).join('') : '<li class="afish-empty-basket">鱼篓还是空的，抛一竿试试。</li>';
    }
    const spokenCue = model.announcementCue ?? cue.replace(/剩余\s*\d+(?:\.\d+)?\s*秒/g, '请及时操作');
    const announcement = [phase, title, spokenCue, model.status, model.settlement].filter(Boolean).join('。');
    if (announcement !== previousAnnouncement) { previousAnnouncement = announcement; fields.announcer.textContent = announcement; }
    renderer.draw(ctx!, canvas.width, canvas.height, {
      phase, bobberCue: model.bobberCue ?? (bite ? 'bite' : 'quiet'),
      fishCue: model.fishCue ?? (model.surging ? 'surge' : 'rest'),
      castPower: fraction(model.castPower), tension: fraction(model.tension), progress: fraction(model.progress),
      elapsed: finiteTime(model.elapsed), animationTime: finiteTime(model.animationTime),
      held: Boolean(model.primaryHeld && !panelOpen), fishId: model.fishId, reducedMotion: Boolean(model.reducedMotion),
    });
  }

  render({ phase: 'idle' });
  return {
    element: root,
    primaryButton: primary,
    render,
    handleEscape() { if (!panelOpen) return false; setPanelOpen(false); return true; },
    getFocusScope() { return panelOpen ? dialog : root; },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort(); observer?.disconnect();
      if (pointerId !== null && primary.hasPointerCapture(pointerId)) primary.releasePointerCapture(pointerId);
      pointerId = null;
      renderer.dispose(); canvas.width = 0; canvas.height = 0;
      root.remove();
    },
  };
}
