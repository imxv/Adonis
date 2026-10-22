import { DISCOVERIES } from './content';
import type { GreekWorldQuality } from './types';
import '../ui/visualTheme.css';
import './world3d.css';

export interface WorldInterfaceCallbacks {
  onExit(): void;
  onPlay(): void;
  onInteract(): void;
  onQuality(quality: GreekWorldQuality): void;
  onSensitivity(value: number): void;
  onModal(open: boolean): void;
}

export interface WorldInterfaceStatus {
  area: string;
  objective: string;
  discoveredCount: number;
  foundIds: readonly string[];
  nearby: string | null;
  compass: string;
  paused: boolean;
  locked: boolean;
}

export interface WorldEntry {
  eyebrow: string;
  title: string;
  body: string;
  footnote?: string;
}

export interface WorldInterface {
  viewport: HTMLElement;
  root: HTMLElement;
  setLoading(label: string, progress: number): void;
  setReady(): void;
  setStatus(state: WorldInterfaceStatus): void;
  showEntry(entry: WorldEntry): void;
  showToast(message: string): void;
  setQuality(quality: GreekWorldQuality): void;
  dispose(): void;
}

type Modal = 'settings' | 'book' | 'entry' | null;
const ICONS = {
  book: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1V5Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-5-5 5 5-5 5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  leaf: '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M12 39C31 30 36 17 36 8M17 36C5 33 5 26 8 24c6-1 9 4 9 12Zm7-8c-11-2-11-9-8-12 6 0 8 6 8 12Zm6-9c-8-3-7-10-3-12 5 2 5 7 3 12Zm-7 11c11 5 16 0 16-4-5-4-11-1-16 4Zm6-9c10 3 15-3 14-7-6-2-10 2-14 7Z"/></svg>',
};

/** An owned, unscaled DOM surface. Only the returned root is removed on dispose. */
export function createWorldInterface(container: HTMLElement, callbacks: WorldInterfaceCallbacks): WorldInterface {
  const events = new AbortController();
  const root = document.createElement('section');
  root.className = 'ag-theme gw-root';
  root.setAttribute('aria-label', '爱琴的回声 · 画中世界');
  root.innerHTML = `
    <div class="gw-viewport"></div>
    <div class="gw-vignette" aria-hidden="true"></div>
    <header class="gw-hud" hidden>
      <div class="gw-place"><p class="gw-eyebrow">爱琴的回声 <span>· 第一幅</span></p><h1 class="gw-area"></h1><p class="gw-objective"></p></div>
      <div class="gw-compass" aria-label="面朝方向"><span class="gw-compass-mark" aria-hidden="true">◇</span><span class="gw-compass-label">北 · 山巅</span></div>
      <nav class="gw-tools" aria-label="探索菜单">
        <button class="gw-tool gw-book-button" type="button">${ICONS.book}<span>画册 <b class="gw-count">0 / 5</b></span></button>
        <button class="gw-tool gw-menu-button" type="button" aria-label="暂停与设置">${ICONS.pause}<span>休憩</span></button>
      </nav>
    </header>
    <div class="gw-crosshair" aria-hidden="true" hidden></div>
    <div class="gw-interaction" hidden><button class="gw-interact-button" type="button"><kbd class="gw-key">E</kbd><span class="gw-nearby"></span><span class="gw-touch-verb">触碰</span></button></div>
    <p class="gw-controls-note" hidden>WASD 移动 <i>·</i> 拖动或点击画面观察 <i>·</i> Esc 休憩</p>
    <div class="gw-cover gw-loading-cover">
      <div class="gw-loading-art" aria-hidden="true">${ICONS.leaf}<span></span></div>
      <div class="gw-loading-content"><p class="gw-eyebrow">一段可以亲自走过的神话</p><h2 class="gw-loading-title">爱琴的回声</h2><p class="gw-loading-label" role="status">正在铺展海岸…</p><div class="gw-progress" role="progressbar" aria-label="画中世界加载进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div><p class="gw-small gw-loading-note">海岸、圣林，与一束等待你的光。</p><button class="gw-text-button gw-loading-exit" type="button">返回画廊</button></div>
    </div>
    <div class="gw-cover gw-pause-cover" hidden>
      <div class="gw-welcome gw-panel">
        <div class="gw-welcome-heading"><span class="gw-leaf">${ICONS.leaf}</span><p class="gw-eyebrow gw-welcome-eyebrow">步入第一幅画</p><h2 class="gw-welcome-title">让脚步，追随海风。</h2><p class="gw-welcome-description">从爱琴海岸出发，穿过橄榄圣林，<br>让沉睡的圣泉再次流动。</p></div>
        <div class="gw-journey"><span>爱琴海岸</span><i></i><span>橄榄圣林</span><i></i><span>山巅神庙</span></div>
        <div class="gw-welcome-controls"><p><b>慢慢行走</b><span class="gw-desktop-instruction">WASD / 方向键移动，Shift 快走</span><span class="gw-mobile-instruction">左下摇杆移动，右侧拖动观察</span></p><p><b>留心身边</b><span class="gw-desktop-instruction">E 阅读或转动引水盘，Esc 休憩</span><span class="gw-mobile-instruction">靠近物件后，点按屏幕交互按钮</span></p></div>
        <button class="gw-primary gw-play-button" type="button"><span>进入画中</span>${ICONS.arrow}</button>
        <div class="gw-welcome-actions"><button class="gw-text-button gw-cover-book" type="button">翻阅画册</button><span aria-hidden="true">·</span><button class="gw-text-button gw-cover-settings" type="button">探索设置</button><span aria-hidden="true">·</span><button class="gw-text-button gw-cover-exit" type="button">返回画廊</button></div>
        <p class="gw-myth-note">神话原创改编 <span>·</span> 自由探索 <span>·</span> 无需战斗</p>
      </div>
    </div>
    <div class="gw-modal-backdrop" hidden><section class="gw-dialog gw-panel" role="dialog" aria-modal="true" aria-labelledby="gw-dialog-title"><button class="gw-icon-button gw-dialog-close" type="button" aria-label="关闭">${ICONS.close}</button><div class="gw-dialog-content"></div></section></div>
    <div class="gw-toast" role="status" aria-live="polite" hidden></div>
  `;
  container.append(root);
  const get = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const viewport = get('.gw-viewport');
  const hud = get('.gw-hud');
  const loading = get('.gw-loading-cover');
  const pauseCover = get('.gw-pause-cover');
  const modalBackdrop = get('.gw-modal-backdrop');
  const modalContent = get('.gw-dialog-content');
  const dialog = get('.gw-dialog');
  const closeButton = get<HTMLButtonElement>('.gw-dialog-close');
  const playButton = get<HTMLButtonElement>('.gw-play-button');
  const interaction = get('.gw-interaction');
  const toast = get('.gw-toast');
  let ready = false;
  let played = false;
  let disposed = false;
  let modal: Modal = null;
  let entryReturn: Modal = null;
  let quality: GreekWorldQuality = 'medium';
  let sensitivity = 1;
  let toastTimer: number | undefined;
  let previousFocus: HTMLElement | null = null;
  let state: WorldInterfaceStatus = { area: '爱琴海岸', objective: '循着海岸的小径，寻找旅人留下的记忆。', discoveredCount: 0, foundIds: [], nearby: null, compass: '北 · 山巅', paused: true, locked: false };

  const listen = (target: EventTarget, type: string, listener: EventListener) => target.addEventListener(type, listener, { signal: events.signal });
  const button = (selector: string, action: () => void) => listen(get(selector), 'click', (event) => { event.stopPropagation(); action(); });
  const stop = (event: Event) => event.stopPropagation();
  for (const panel of root.querySelectorAll('.gw-panel, .gw-tools, .gw-interaction, .gw-loading-content')) {
    listen(panel, 'pointerdown', stop);
    listen(panel, 'touchstart', stop);
    listen(panel, 'wheel', stop);
  }

  function updateCover() {
    loading.hidden = ready;
    hud.hidden = !ready;
    pauseCover.hidden = !ready || modal !== null || (played && !state.paused);
    interaction.hidden = !ready || !played || state.paused || modal !== null || !state.nearby;
    get('.gw-crosshair').hidden = !ready || !played || state.paused || modal !== null;
    get('.gw-controls-note').hidden = !ready || !played || state.paused || modal !== null;
    root.classList.toggle('gw-is-playing', ready && played && !state.paused && modal === null);
    root.classList.toggle('gw-is-locked', state.locked);
    hud.inert = !ready || !played || state.paused || modal !== null;
    viewport.inert = !ready || !played || state.paused || modal !== null;
    pauseCover.inert = pauseCover.hidden;
    if (played) {
      get('.gw-welcome-eyebrow').textContent = '画中的时光，愿为你停留';
      get('.gw-welcome-title').textContent = '在海风里，歇一会儿。';
      get('.gw-welcome-description').textContent = `${state.area} · 已记下 ${Math.min(5, Math.max(0, state.discoveredCount))} 处风景`;
      get('.gw-play-button span').textContent = '继续漫游';
    }
  }

  function openModal(next: Exclude<Modal, null>) {
    if (disposed) return;
    if (!modal) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      callbacks.onModal(true);
    }
    modal = next;
    modalBackdrop.hidden = false;
    dialog.classList.toggle('gw-dialog-entry', next === 'entry');
    updateCover();
    closeButton.focus({ preventScroll: true });
  }

  function closeModal() {
    if (!modal) return;
    if (modal === 'entry' && entryReturn === 'book') {
      entryReturn = null;
      showBook();
      return;
    }
    modal = null;
    entryReturn = null;
    modalBackdrop.hidden = true;
    callbacks.onModal(false);
    updateCover();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  function showEntry(entry: WorldEntry, fromBook = false) {
    entryReturn = fromBook ? 'book' : null;
    modalContent.replaceChildren();
    const eyebrow = document.createElement('p');
    eyebrow.className = 'gw-eyebrow';
    eyebrow.textContent = entry.eyebrow;
    const heading = document.createElement('h2');
    heading.id = 'gw-dialog-title';
    heading.className = 'gw-dialog-title';
    heading.textContent = entry.title;
    const body = document.createElement('div');
    body.className = 'gw-entry-body';
    for (const paragraph of entry.body.split(/\n\s*\n/)) {
      const p = document.createElement('p');
      p.textContent = paragraph;
      body.append(p);
    }
    modalContent.append(eyebrow, heading, body);
    if (entry.footnote) {
      const footnote = document.createElement('p');
      footnote.className = 'gw-entry-footnote';
      footnote.textContent = entry.footnote;
      modalContent.append(footnote);
    }
    const done = document.createElement('button');
    done.className = 'gw-primary gw-entry-done';
    done.type = 'button';
    done.textContent = fromBook ? '回到画册' : '收起这一页';
    listen(done, 'click', (event) => { event.stopPropagation(); closeModal(); });
    modalContent.append(done);
    openModal('entry');
  }

  function showBook() {
    modalContent.innerHTML = '<p class="gw-eyebrow">旅人的画册 · 五处风景</p><h2 class="gw-dialog-title" id="gw-dialog-title">把看见的，留在心里。</h2><p class="gw-dialog-intro">已经记下的风景，可以在这里再次翻阅。</p><div class="gw-book-list"></div><p class="gw-book-note">神话原创改编 · 画中故事并非真实古迹考据</p>';
    const list = get('.gw-book-list');
    const found = new Set(state.foundIds);
    DISCOVERIES.forEach((discovery, index) => {
      const item = document.createElement('button');
      const seen = found.has(discovery.id);
      item.type = 'button';
      item.className = `gw-book-item${seen ? ' gw-book-found' : ''}`;
      item.disabled = !seen;
      const number = document.createElement('span');
      number.className = 'gw-book-number';
      number.textContent = String(index + 1).padStart(2, '0');
      const text = document.createElement('span');
      text.className = 'gw-book-text';
      const area = document.createElement('small');
      area.textContent = discovery.area;
      const title = document.createElement('strong');
      title.textContent = seen ? discovery.title : '等待你写下的风景';
      text.append(area, title);
      const mark = document.createElement('span');
      mark.className = 'gw-book-mark';
      mark.textContent = seen ? '翻阅 ↗' : '未发现';
      item.append(number, text, mark);
      listen(item, 'click', (event) => {
        event.stopPropagation();
        showEntry({ eyebrow: `${discovery.area} · 画册 ${index + 1} / 5`, title: discovery.title, body: discovery.body, footnote: discovery.footnote }, true);
      });
      list.append(item);
    });
    openModal('book');
  }

  function updateQualityButtons() {
    for (const element of root.querySelectorAll<HTMLButtonElement>('.gw-quality-option')) {
      element.setAttribute('aria-pressed', String(element.dataset.quality === quality));
    }
  }

  function showSettings() {
    modalContent.innerHTML = `<p class="gw-eyebrow">随你的步调</p><h2 class="gw-dialog-title" id="gw-dialog-title">探索设置</h2><p class="gw-dialog-intro">选一个让你自在的观看方式。</p><fieldset class="gw-setting"><legend>画面细节</legend><div class="gw-quality-options"><button type="button" class="gw-quality-option" data-quality="low"><b>轻盈</b><span>低画质</span></button><button type="button" class="gw-quality-option" data-quality="medium"><b>均衡</b><span>中画质</span></button><button type="button" class="gw-quality-option" data-quality="high"><b>细腻</b><span>高画质</span></button></div><p class="gw-setting-note">画面不流畅时，可以选择「轻盈」。</p></fieldset><div class="gw-setting"><label class="gw-range-label" for="gw-sensitivity">视角灵敏度 <output class="gw-sensitivity-value" for="gw-sensitivity"></output></label><input class="gw-sensitivity" id="gw-sensitivity" type="range" min="0.4" max="2.5" step="0.1" aria-label="视角灵敏度"><div class="gw-range-ends"><span>舒缓</span><span>敏捷</span></div></div><p class="gw-setting-note gw-comfort-note">镜头随你转动，没有自动摇晃。按 Esc 可随时休憩。</p><button class="gw-primary gw-settings-done" type="button">回到风景中</button><button class="gw-text-button gw-settings-exit" type="button">返回画廊</button>`;
    for (const option of root.querySelectorAll<HTMLButtonElement>('.gw-quality-option')) {
      listen(option, 'click', (event) => {
        event.stopPropagation();
        quality = option.dataset.quality as GreekWorldQuality;
        updateQualityButtons();
        callbacks.onQuality(quality);
      });
    }
    updateQualityButtons();
    const range = get<HTMLInputElement>('.gw-sensitivity');
    const value = get<HTMLOutputElement>('.gw-sensitivity-value');
    range.value = String(sensitivity);
    value.value = `${sensitivity.toFixed(1)}×`;
    listen(range, 'input', (event) => {
      event.stopPropagation();
      sensitivity = Number(range.value);
      value.value = `${sensitivity.toFixed(1)}×`;
      callbacks.onSensitivity(sensitivity);
    });
    button('.gw-settings-done', closeModal);
    button('.gw-settings-exit', () => callbacks.onExit());
    openModal('settings');
  }

  button('.gw-loading-exit', () => callbacks.onExit());
  button('.gw-cover-exit', () => callbacks.onExit());
  button('.gw-book-button', showBook);
  button('.gw-cover-book', showBook);
  button('.gw-menu-button', showSettings);
  button('.gw-cover-settings', showSettings);
  button('.gw-dialog-close', closeModal);
  button('.gw-interact-button', () => callbacks.onInteract());
  button('.gw-play-button', () => {
    if (!ready || disposed) return;
    played = true;
    callbacks.onPlay();
    updateCover();
  });
  listen(modalBackdrop, 'click', (event) => { event.stopPropagation(); if (event.target === modalBackdrop) closeModal(); });
  listen(dialog, 'click', stop);
  document.addEventListener('keydown', (event) => {
    if (disposed || !modal) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeModal();
    } else if (event.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter((node) => !node.hidden);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
  }, { capture: true, signal: events.signal });

  return {
    viewport,
    root,
    setLoading(label, progress) {
      if (disposed) return;
      const percent = Math.round(Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0)) * 100);
      get('.gw-loading-label').textContent = label;
      get('.gw-progress').setAttribute('aria-valuenow', String(percent));
      get('.gw-progress span').style.width = `${percent}%`;
    },
    setReady() {
      if (disposed) return;
      ready = true;
      updateCover();
      if (document.activeElement === document.body || root.contains(document.activeElement)) playButton.focus({ preventScroll: true });
    },
    setStatus(next) {
      if (disposed) return;
      const foundChanged = state.foundIds.join('|') !== next.foundIds.join('|');
      state = { ...next, foundIds: [...next.foundIds] };
      get('.gw-area').textContent = state.area;
      get('.gw-objective').textContent = state.objective;
      get('.gw-count').textContent = `${Math.min(5, Math.max(0, state.discoveredCount))} / 5`;
      get('.gw-compass-label').textContent = state.compass;
      get('.gw-nearby').textContent = state.nearby ?? '';
      updateCover();
      if (foundChanged && modal === 'book') showBook();
    },
    showEntry,
    showToast(message) {
      if (disposed) return;
      window.clearTimeout(toastTimer);
      toast.textContent = message;
      toast.hidden = false;
      toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4800);
    },
    setQuality(next) { quality = next; updateQualityButtons(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      events.abort();
      window.clearTimeout(toastTimer);
      root.remove();
    },
  };
}
