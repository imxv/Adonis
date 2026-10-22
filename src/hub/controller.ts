import { loadProfile, claimDiscovery, PLANTS, SUPPLIES, subscribeProfile } from '../meta/profile';
import { FISH, FISH_IDS, RESTORATIONS, RESTORATION_IDS, getRestorationFailure, restoreGallery } from '../meta/life';
import type { LifeCost, MetaProfile, ProfileState } from '../meta/life';
import type { PlantId } from '../meta/profile';
import { loadRun, topSupplyScores } from '../save';
import { mountGallery, type GalleryAction, type GalleryHandle } from './gallery';
import { createPixelRepairDisplay } from './gallery-pixel-renderer';
import './controller.css';
import '../ui/visualTheme.css';

type Disposable = { dispose(): void; pause?(paused: boolean): void; resize?(): void };
type ExternalMode = 'garden' | 'fishing' | 'kitchen' | 'commissions' | 'world3d';
type HubMode = 'gallery' | 'adventure-menu' | 'run' | 'loading' | ExternalMode | 'collection' | 'repair' | 'disposed';
const EXTERNAL_NAMES: Record<ExternalMode, string> = {
  garden: '月桂花园', fishing: '苇影湖', kitchen: '归途厨房', commissions: '居民庭院', world3d: '爱琴海岸',
};
const restorationId = RESTORATION_IDS[0];

function costItems(profile: MetaProfile, cost: LifeCost) {
  const items: { name: string; need: number; owned: number }[] = [];
  if (cost.fragments) items.push({ name: '修复碎片', need: cost.fragments, owned: profile.fragments });
  for (const id of FISH_IDS) {
    const need = cost.fish?.[id];
    if (need) items.push({ name: FISH[id].name, need, owned: profile.life.fish[id] });
  }
  for (const [id, need] of Object.entries(cost.produce ?? {})) {
    const plant = id as PlantId;
    items.push({ name: `${PLANTS[plant].name}原料`, need, owned: profile.produce[plant] });
  }
  return items;
}
const readOnly = (state: ProfileState) => state.storage === 'busy' || state.storage === 'unsupported';

interface HubOptions {
  suspendGame(): void;
  resumeGame(): void;
  showAdventure(action?: 'new' | 'continue'): void;
  releaseUI(): void;
}

/** Owns mode transitions; the combat scene never updates the gallery or an external world. */
export class HubController {
  private readonly root = document.createElement('div');
  private readonly galleryHost = document.createElement('div');
  private readonly externalHost = document.createElement('div');
  private readonly events = new AbortController();
  private readonly gallery: GalleryHandle;
  private external?: Disposable;
  private pendingMount?: AbortController;
  private noticeTimer = 0;
  private generation = 0;
  private unsubscribe: () => void;
  private refreshPage?: () => void;
  mode: HubMode = 'gallery';

  constructor(private readonly options: HubOptions) {
    this.root.id = 'gallery-root';
    this.root.className = 'ag-mode-root ag-theme';
    this.galleryHost.className = 'ag-gallery-host';
    this.externalHost.className = 'ag-external-host';
    this.externalHost.hidden = true;
    this.root.append(this.galleryHost, this.externalHost);
    document.body.append(this.root);
    this.gallery = mountGallery({ container: this.galleryHost, onAction: (action) => this.act(action), hasSave: !!loadRun(), profile: this.profile() });
    this.unsubscribe = subscribeProfile(() => this.refresh());
    window.addEventListener('mobileviewportchange', () => this.external?.resize?.(), { signal: this.events.signal });
    document.addEventListener('visibilitychange', () => {
      this.gallery.pause(document.hidden || this.mode !== 'gallery');
      this.external?.pause?.(document.hidden);
    }, { signal: this.events.signal });
    // Capture only this mode's Escape. A world owns its own Escape/pointer-lock gesture.
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.repeat || !['loading', 'collection', 'repair'].includes(this.mode)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.show();
    }, { capture: true, signal: this.events.signal });
    this.show();
  }

  private profile() {
    const state = loadProfile();
    const repair = RESTORATIONS[restorationId];
    const completed = state.profile.life.restored.includes(restorationId);
    const failure = getRestorationFailure(state.profile, restorationId);
    return { fragments: state.profile.fragments, discoveries: state.profile.discoveries.length,
      supply: state.profile.packedSupply ? SUPPLIES[state.profile.packedSupply]?.name ?? null : null, warning: state.warning,
      fishCount: FISH_IDS.reduce((sum, id) => sum + state.profile.life.fish[id], 0),
      repair: { id: repair.id, name: repair.name, completed,
        costLabel: costItems(state.profile, repair.cost).map(item => `${item.name} ×${item.need}`).join(' + '),
        disabledReason: readOnly(state) ? state.warning ?? '生活存档暂时只读'
          : failure === 'insufficient' ? '备齐材料后可修复' : failure ? '暂时无法修复' : undefined } };
  }

  private refresh() {
    this.gallery.refresh({ hasSave: !!loadRun(), profile: this.profile() });
    this.refreshPage?.();
  }

  private setMode(mode: HubMode) {
    this.mode = mode;
    this.root.dataset.mode = mode;
  }

  private releaseExternal() {
    this.pendingMount?.abort();
    this.pendingMount = undefined;
    this.external?.dispose();
    this.external = undefined;
    this.refreshPage = undefined;
    this.externalHost.replaceChildren();
  }

  show() {
    if (this.mode === 'disposed') return;
    this.generation++;
    this.releaseExternal();
    this.clearNotice();
    this.externalHost.hidden = true;
    this.galleryHost.hidden = false;
    this.root.hidden = false;
    this.setMode('gallery');
    this.options.suspendGame();
    this.refresh();
    this.gallery.pause(document.hidden);
  }

  enterRun() {
    if (this.mode === 'disposed') return;
    this.generation++;
    this.releaseExternal();
    this.clearNotice();
    this.gallery.pause(true);
    this.root.hidden = true;
    this.setMode('run');
    this.options.resumeGame();
  }

  private act(action: GalleryAction) {
    if (this.mode !== 'gallery') return;
    if (action === 'adventure' || action === 'continue') {
      this.setMode('adventure-menu');
      this.gallery.pause(true);
      this.root.hidden = true;
      this.options.releaseUI();
      this.options.showAdventure(action === 'continue' ? 'continue' : 'new');
    } else if (action === 'collection') this.collection();
    else if (action === 'repair') this.restoration();
    else void this.openExternal(action);
  }

  /** `overHall` keeps the paused hall visible, dimmed, behind the hub's own pages. */
  private externalPage(mode: HubMode, overHall = false) {
    this.releaseExternal();
    this.clearNotice();
    this.options.suspendGame();
    this.gallery.pause(true);
    this.galleryHost.hidden = !overHall;
    this.externalHost.hidden = false;
    this.externalHost.replaceChildren();
    this.setMode(mode);
    return ++this.generation;
  }

  private async openExternal(kind: ExternalMode) {
    const token = this.externalPage('loading');
    const mount = new AbortController();
    this.pendingMount = mount;
    const current = () => this.generation === token && this.mode !== 'disposed';
    const loading = document.createElement('div');
    loading.className = 'ag-mode-message';
    const plate = document.createElement('div');
    plate.className = 'ag-mode-panel';
    const heading = document.createElement('h2');
    heading.textContent = `走进${EXTERNAL_NAMES[kind]}`;
    const detail = document.createElement('p');
    detail.textContent = '正在准备旅途…';
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = '返回画廊';
    back.addEventListener('click', () => { if (current()) this.show(); });
    plate.append(heading, detail, back);
    loading.append(plate);
    this.externalHost.append(loading);
    back.focus({ preventScroll: true });
    const container = document.createElement('div');
    container.className = 'ag-mode-content';
    container.inert = true;
    this.externalHost.prepend(container);
    // Each async mount receives its own host. A cancelled late completion can only dispose itself.
    try {
      const onExit = () => { if (current()) this.show(); };
      let handle: Disposable;
      if (kind === 'garden') {
        const { mountGarden } = await import('../sidegames/garden/index');
        if (!current()) return;
        container.inert = false;
        handle = mountGarden({ container, onExit });
      } else if (kind === 'fishing') {
        const { mountFishing } = await import('../sidegames/fishing/index');
        if (!current()) return;
        container.inert = false;
        handle = mountFishing({ container, onExit });
      } else if (kind === 'kitchen') {
        const { mountKitchen } = await import('../sidegames/kitchen/index');
        if (!current()) return;
        container.inert = false;
        handle = mountKitchen({ container, onExit });
      } else if (kind === 'commissions') {
        const { mountCommissions } = await import('../sidegames/commissions/index');
        if (!current()) return;
        container.inert = false;
        handle = mountCommissions({ container, onExit });
      } else {
        const { mountGreekWorld } = await import('../world3d/index');
        if (!current()) return;
        handle = await mountGreekWorld({ container, onExit, signal: mount.signal, discoveredIds: [...loadProfile().profile.discoveries],
          quality: matchMedia('(pointer: coarse)').matches ? 'low' : 'auto',
          onDiscover: (id) => {
            if (!current()) return;
            const result = claimDiscovery(id);
            if (result.warning) this.notice(result.warning);
            else if (!result.applied && !result.duplicate) this.notice(result.reason === 'capacity'
              ? '收藏记录已达上限，这次发现未领取奖励。' : '这次发现暂未收入收藏，请稍后重试。');
          } });
      }
      if (!current()) { handle.dispose(); container.remove(); return; }
      this.external = handle;
      this.setMode(kind);
      container.inert = false;
      loading.remove();
      handle.pause?.(document.hidden);
      handle.resize?.();
      const firstControl = [...container.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].find((button) =>
        !button.closest('[inert], [aria-hidden="true"]') && button.getClientRects().length > 0);
      if (!container.contains(document.activeElement)) firstControl?.focus({ preventScroll: true });
    } catch (error) {
      if (!current()) return;
      container.remove();
      heading.textContent = `${EXTERNAL_NAMES[kind]}暂时无法打开`;
      detail.textContent = '请返回画廊后重试。你的冒险存档仍可继续。';
      console.warn(`[gallery] ${kind} failed to mount`, error);
    }
  }

  private restoration() {
    const token = this.externalPage('repair', true);
    const current = () => this.generation === token && this.mode === 'repair';
    const events = new AbortController();
    const definition = RESTORATIONS[restorationId];
    const page = document.createElement('section');
    page.className = 'ag-mode-panel ag-restoration';
    page.setAttribute('aria-label', '画廊修复');
    const eyebrow = document.createElement('p'); eyebrow.className = 'ag-mode-eyebrow'; eyebrow.textContent = 'RESTORATION';
    const heading = document.createElement('h1'); heading.textContent = definition.name;
    const description = document.createElement('p'); description.textContent = definition.description;
    // The same pixel display that stands in the hall, so the page shows exactly what the repair changes.
    const artwork = document.createElement('div'); artwork.className = 'ag-restoration-art';
    artwork.setAttribute('role', 'img');
    let artworkRestored: boolean | undefined;
    const body = document.createElement('div'); body.className = 'ag-restoration-body';
    const info = document.createElement('div'); info.className = 'ag-restoration-info';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const list = document.createElement('ul'); list.className = 'ag-restoration-materials';
    const warning = document.createElement('p'); warning.className = 'ag-restoration-warning'; warning.setAttribute('role', 'status');
    const feedback = document.createElement('p'); feedback.className = 'ag-restoration-feedback'; feedback.setAttribute('role', 'status');
    const actions = document.createElement('div'); actions.className = 'ag-mode-actions';
    const repair = document.createElement('button'); repair.type = 'button'; repair.className = 'is-primary';
    const garden = document.createElement('button'); garden.type = 'button'; garden.textContent = '去花园备料';
    const commissions = document.createElement('button'); commissions.type = 'button'; commissions.textContent = '去看看委托';
    const back = document.createElement('button'); back.type = 'button'; back.textContent = '返回画廊';
    let transacting = false;
    const render = () => {
      if (!current()) return;
      const state = loadProfile(), profile = state.profile;
      const completed = profile.life.restored.includes(restorationId);
      const failure = getRestorationFailure(profile, restorationId);
      if (artworkRestored !== completed) {
        artworkRestored = completed;
        artwork.replaceChildren(createPixelRepairDisplay(completed));
      }
      artwork.classList.toggle('is-restored', completed);
      artwork.setAttribute('aria-label', completed ? '已修复：金色日光、帆船与蓝色海港镶嵌画' : '待修复：布罩下缺损的海港镶嵌画');
      status.textContent = completed ? '海港的画面已经回到大厅，修复不会重复扣料。' : '备齐材料，拼回这幅归航的画面。修复不会增加永久战力。';
      list.replaceChildren();
      for (const item of costItems(profile, definition.cost)) {
        const row = document.createElement('li');
        row.textContent = `${item.name}：现有 ${item.owned} · 修复需要 ${item.need}${!completed && item.owned < item.need ? ` · 还缺 ${item.need - item.owned}` : ''}`;
        row.classList.toggle('is-missing', !completed && item.owned < item.need);
        list.append(row);
      }
      repair.textContent = completed ? '已经修复' : failure === 'insufficient' ? '材料还未备齐' : '消耗材料并修复';
      repair.disabled = completed || !!failure || readOnly(state) || transacting;
      warning.hidden = !state.warning; warning.textContent = state.warning ?? '';
    };
    repair.addEventListener('click', () => {
      if (!current() || transacting || repair.disabled) return;
      transacting = true;
      try {
        const result = restoreGallery(restorationId);
        feedback.textContent = result.applied
          ? result.storage === 'memory' ? '本页已修复；存储不可用，刷新或关闭可能丢失。' : '修复完成。回到大厅看看归航的画面吧。'
          : result.duplicate ? '这幅画已修复，不会再次扣料。'
            : result.warning ?? (result.reason === 'insufficient' ? '材料不足，没有扣除材料。' : '这次没有修复成功，请稍后重试。');
      } finally { transacting = false; render(); }
    }, { signal: events.signal });
    garden.addEventListener('click', () => { if (current()) void this.openExternal('garden'); }, { signal: events.signal });
    commissions.addEventListener('click', () => { if (current()) void this.openExternal('commissions'); }, { signal: events.signal });
    back.addEventListener('click', () => { if (current()) this.show(); }, { signal: events.signal });
    actions.append(repair, garden, commissions, back);
    info.append(status, list, warning, feedback);
    body.append(artwork, info);
    page.append(eyebrow, heading, description, body, actions);
    this.externalHost.append(page);
    this.refreshPage = render;
    this.external = { dispose: () => { events.abort(); page.remove(); } };
    render();
    back.focus({ preventScroll: true });
  }

  private collection() {
    this.externalPage('collection', true);
    const state = loadProfile();
    const page = document.createElement('section');
    page.className = 'ag-mode-panel ag-collection';
    page.setAttribute('aria-label', '画廊收藏');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'ag-mode-eyebrow';
    eyebrow.textContent = 'COLLECTION';
    const heading = document.createElement('h1');
    heading.textContent = '旅人的收藏室';
    const intro = document.createElement('p');
    intro.textContent = `修复碎片 ${state.profile.fragments} · 已发现 ${state.profile.discoveries.length} 处遗迹`;
    const list = document.createElement('div');
    list.className = 'ag-collection-list';
    const names: Record<string, string> = {
      'greek.coast.navigator': '无名领航者的星盘', 'greek.coast.tide-mural': '潮汐与月桂的壁画',
      'greek.grove.olive-oath': '老橄榄树下的誓言', 'greek.grove.spring-restored': '重新流动的圣泉',
      'greek.temple.first-light': '第一束光的回廊',
    };
    state.profile.discoveries.forEach((id, index) => {
      const card = document.createElement('article');
      const name = document.createElement('h2');
      name.textContent = names[id] ?? `爱琴见闻 · ${String(index + 1).padStart(2, '0')}`;
      const caption = document.createElement('p');
      caption.textContent = '从画中世界带回的记忆';
      card.append(name, caption);
      list.append(card);
    });
    if (!state.profile.discoveries.length) {
      const empty = document.createElement('p');
      empty.className = 'ag-collection-empty';
      empty.textContent = '走进爱琴海岸的画作，发现将成为这里的第一件收藏。';
      list.append(empty);
    }
    const scores = topSupplyScores();
    if (scores.length) {
      const heading = document.createElement('h2');
      heading.className = 'ag-collection-section';
      heading.textContent = '携补给冒险 · 本机记录';
      list.append(heading);
      scores.slice(0, 5).forEach((score, index) => {
        const row = document.createElement('p');
        row.className = 'ag-collection-score';
        row.textContent = `${index + 1}. ${score.score} 分 · 第 ${score.floor} 层 · ${score.supply?.name ?? '花园补给'}`;
        list.append(row);
      });
    }
    if (state.warning) {
      const warning = document.createElement('p');
      warning.setAttribute('role', 'status');
      warning.textContent = state.warning;
      list.append(warning);
    }
    const back = document.createElement('button');
    back.textContent = '返回画廊';
    back.type = 'button';
    back.addEventListener('click', () => this.show());
    const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'is-primary';
    restore.textContent = `查看${RESTORATIONS[restorationId].name}`;
    restore.addEventListener('click', () => this.restoration());
    const actions = document.createElement('div'); actions.className = 'ag-mode-actions';
    actions.append(restore, back);
    page.append(eyebrow, heading, intro, list, actions);
    this.externalHost.append(page);
    back.focus({ preventScroll: true });
  }

  private clearNotice() {
    clearTimeout(this.noticeTimer);
    this.root.querySelector('.ag-mode-notice')?.remove();
  }

  private notice(message: string) {
    this.clearNotice();
    const notice = document.createElement('p');
    notice.className = 'ag-mode-notice';
    notice.setAttribute('role', 'status');
    notice.textContent = message;
    this.root.append(notice);
    this.noticeTimer = window.setTimeout(() => notice.remove(), 7000);
  }

  dispose() {
    if (this.mode === 'disposed') return;
    this.setMode('disposed');
    this.generation++;
    this.releaseExternal();
    this.events.abort();
    this.clearNotice();
    this.unsubscribe();
    this.gallery.dispose();
    this.root.remove();
  }
}
