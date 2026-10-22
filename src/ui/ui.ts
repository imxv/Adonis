import { RARITY_INFO, UPGRADE_BY_ID } from '../data/upgrades';
import { WEAPONS, STAT_MEANING, type WeaponInstance } from '../data/weapons';
import { HEROES, HERO_ORDER, type HeroId } from '../data/heroes';
import { FUSE_LEVEL, SPELLS, fusionOf, spellName, type FusionId } from '../data/spells';
import { PETS, PET_ORDER } from '../data/enemies';
import type { StyleKit } from '../styles/types';
import { LEVELS, fusionHint, type Choice, type RunState } from '../game/run';
import type { Dir } from '../game/dirs';
import { ICONS, ICON_SIZE } from '../styles/textures';
import { E } from '../pixel/palette';
import { audio } from '../audio/audio';
import { DIFFICULTIES, type DifficultyId } from '../data/difficulty';
import { settings } from '../settings';
import { RARITY_INFO as RARITY } from '../data/upgrades';
import type { SavedRun } from '../save';
import type { CodexTab } from './codex';
import { $, diamond, el, icon, px, pxBlock, wrap } from './pxhtml';
import { MenuNav, confirmBox, menuRow, openBoard, openCodex, openHelp, openSettings, type Layer, type LayerHost } from './screens';
import { WeaponCards, type GunView } from './weaponCards';
import { openWeaponSwap } from './weaponSwap';
import { WeaponPreview } from './weaponPreview';
import { BeatBar } from './beatBar';
import { TitlePainting } from './titleArt';
import { openDifficultySelect } from './difficultySelect';
import { beginMobileEntry, cancelMobileEntry } from './mobileEntry';
import { ASCENSION_NAME, ASCENSION_BONUS_LINES } from '../game/ascension';
import './ascension.css';
import { isTouchBrowser, safeViewport } from '../platform/mobile';
import type { Grade, Rank } from '../game/rhythm';
import type Phaser from 'phaser';

/** The UI shares the game's 480px-wide grid; portrait gameplay can extend its height. */
export const UI_W = 480;
export const UI_H = 270;
/** Space below the game frame for the compact companion and spell icons. */
export const HUD_FOOTER_H = 24;

/** A world sprite projected onto the HUD's logical pixel grid. */
export interface PreviewKeepClear {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const GREY = E.grey;
const DIM = E.greyM;
const ACCENT = E.hot;

// ---------------------------------------------------------------- HUD data

export interface MapCell {
  gx: number;
  gy: number;
  type: string;
  visited: boolean;
  seen: boolean;
  current: boolean;
  cleared: boolean;
  doors: Record<Dir, boolean>;
}

export interface HudData {
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  xp: number;
  xpNext: number;
  xpLevel: number;
  guns: GunView[];
  skill: number;
  skillActive: boolean;
  spells: { id: string; level: number; evolved: boolean; fused: boolean }[];
  pets: string[];
  level: number;
  styleName: string;
  timer: number;
  /** In a combat room: the wave being fought (or loading in) and how many there are. */
  wave?: [number, number];
  kills: number;
  combo: number;
  /** The style rank, how far it is toward the next one (0-1), and the run's points. */
  rank: Rank;
  gauge: number;
  score: number;
  map: MapCell[];
  boss?: { name: string; ratio: number; phaseMark: number };
}

const DAMAGE_FEEDBACK_MS = 1800;
const BOSS_W = 200;
const CELL_W = 9;
const CELL_H = 7;
const FLOOR_NAMES = ['一', '二', '三', '四', '五', '六'];
const RANK_COLOR: Record<Rank, string> = { D: E.greyM, C: E.green, B: E.cyan, A: E.yellow, S: E.orange, SS: E.hot };


export interface TitleActions {
  save: () => SavedRun | null;
  onContinue: () => void;
  initialDifficulty: () => DifficultyId;
  onNew: (hero: HeroId, difficulty: DifficultyId) => void;
  codex: () => CodexTab[];
  onBack?: () => void;
  initialAction?: 'new' | 'continue';
}

export interface PauseInfo {
  run: RunState;
  floorName: string;
  roomsCleared: number;
  roomsTotal: number;
}

export interface PauseActions {
  onResume: () => void;
  onQuit: () => void;
  codex: () => CodexTab[];
}

export interface EndInfo {
  victory: boolean;
  run: RunState;
  score: number;
  rank: number;
  date: number;
  settlement?: string;
  warning?: string | null;
}

const fmtTime = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

/** A card's description: at most four lines, the last cut short with an ellipsis if the text runs on. */
function cardLines(text: string): string {
  const lines = wrap(text, 110);
  if (lines.length > 4) {
    lines.length = 4;
    lines[3] = `${lines[3].slice(0, -1)}…`;
  }
  return `<div class="lines">${lines.map((l) => px(l, DIM)).join('')}</div>`;
}

class UI implements LayerHost {
  root!: HTMLElement;
  /** Full-screen pages, top one owns the keyboard. */
  private layers: Layer[] = [];
  private wrap!: HTMLElement;
  private hud!: HTMLElement;
  private canvas?: HTMLCanvasElement;
  private toastTimer = 0;
  private damageTimer = 0;
  private damageStreak?: { hpLoss: number; armorLoss: number; count: number; at: number };
  private choiceKeys?: (e: KeyboardEvent) => void;
  private last: Record<string, string> = {};
  private mapSig = '';
  private preview?: WeaponPreview;
  private previewPosition?: { left: number; top: number };
  private unmountListeners?: () => void;
  private suspended = false;
  private generation = 0;
  private mounted = false;
  private timers = new Set<number>();

  mount(canvas: HTMLCanvasElement, game: Phaser.Game) {
    this.dispose();
    this.mounted = true;
    this.suspended = false;
    this.canvas = canvas;
    this.root = $('#ui-root');
    this.wrap = $('#ui-wrap') ?? el('div');
    this.wrap.id = 'ui-wrap';
    this.wrap.hidden = false;
    if (!this.wrap.parentElement) {
      document.body.appendChild(this.wrap);
      this.wrap.appendChild(this.root);
    }
    this.root.innerHTML = '';
    this.hud = el('div', 'hud');
    this.hud.innerHTML = `
      <div class="stats">
        <div class="icons hearts"></div>
        <div class="icons shields"></div>
        <div class="damage-feedback" role="status" aria-live="polite" aria-atomic="true"></div>
      </div>
      <div class="spells"></div>
      <div class="wbar"></div>
      <div class="tr"><div class="mmwrap panel"><canvas class="mm" width="1" height="1"></canvas></div><div class="sname"></div><div class="kills"></div></div>
      <div class="timer"></div>
      <div class="bossbar"><div class="bname"></div><div class="bar"><i></i><b></b></div></div>
      <div class="style"><div class="rk"></div><div class="gauge"><i></i></div><div class="score"></div></div>
      <div class="combo"></div>
      <div class="toast"></div>`;
    this.hud.style.opacity = '0';
    this.root.appendChild(this.hud);
    this.preview = new WeaponPreview(this.hud, game);
    this.cards = new WeaponCards($('.wbar', this.hud));
    this.beats = new BeatBar(this.hud);
    const events = new AbortController();
    window.addEventListener('keydown', (e) => {
      if (this.suspended || this.choiceKeys) return;
      const top = this.layers[this.layers.length - 1];
      // Phaser handles keys before this listener: the Esc that just opened the pause page must not also close it.
      if (!top || e.timeStamp < top.openedAt) return;
      top.onKey?.(e);
    }, { signal: events.signal });
    const sync = () => this.sync();
    window.addEventListener('resize', sync, { signal: events.signal });
    window.addEventListener('mobileviewportchange', sync, { signal: events.signal });
    const observer = new ResizeObserver(sync);
    observer.observe(canvas);
    this.unmountListeners = () => { events.abort(); observer.disconnect(); };
    sync();
  }

  /** End this mount completely; the singleton can be mounted again for another scene. */
  dispose() {
    this.mounted = false;
    this.suspended = true;
    this.unmountListeners?.();
    this.unmountListeners = undefined;
    this.resetLayers();
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    this.toastTimer = this.damageTimer = this.cineTimer = 0;
    this.preview?.destroy();
    this.preview = undefined;
    this.cards = undefined;
    this.beats = undefined;
    this.iconRows = { hearts: [], shields: [] };
    this.last = {};
    this.mapSig = '';
    this.hud?.replaceChildren();
    this.root?.replaceChildren();
    if (this.wrap) this.wrap.hidden = true;
    this.canvas = undefined;
    document.body.classList.remove('touch-menu');
  }

  private defer(callback: () => void, ms: number) {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      if (this.mounted) callback();
    }, ms);
    this.timers.add(timer);
    return timer;
  }

  private clearTimer(timer: number | undefined) {
    window.clearTimeout(timer);
    if (timer !== undefined) this.timers.delete(timer);
  }

  /** Lay the UI over the canvas and zoom it by the same factor as the game pixels. */
  sync() {
    if (!this.mounted || !this.canvas) return;
    const touchMenu = isTouchBrowser() && !!this.root.querySelector('.overlay');
    document.body.classList.toggle('touch-menu', touchMenu);
    if (touchMenu) {
      const viewport = safeViewport();
      const zoom = Math.min(viewport.width / UI_W, viewport.height / UI_H);
      const width = UI_W * zoom;
      Object.assign(this.wrap.style, { left: `${viewport.left + (viewport.width - width) / 2}px`, top: `${viewport.top}px`, width: `${width}px`, height: `${viewport.height}px` });
      this.root.style.height = `${viewport.height / zoom}px`;
      this.root.style.setProperty('--touch-target', `${44 / zoom}px`);
      (this.root.style as any).zoom = String(zoom);
      return;
    }
    const r = this.canvas.getBoundingClientRect();
    const zoom = r.width / UI_W;
    const height = `${zoom > 0 ? r.height / zoom : UI_H}px`;
    if (this.root.style.height !== height) this.previewPosition = undefined;
    this.root.style.height = height;
    Object.assign(this.wrap.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height + HUD_FOOTER_H * r.width / UI_W}px` });
    (this.root.style as any).zoom = String(r.width / UI_W);
  }

  applyTheme(kit: StyleKit) {
    this.root.style.setProperty('--biome', kit.palette.danger);
  }

  showHud(show: boolean) {
    if (!show) {
      this.hideWeaponPreview();
      this.resetDamageFeedback();
      this.ascension(false);
    }
    this.hud.style.opacity = show ? '1' : '0';
  }

  /** External modes own the keyboard and viewport until the combat UI is explicitly released. */
  suspend(suspended: boolean) {
    if (!this.mounted) return;
    this.suspended = suspended;
    if (this.wrap) this.wrap.hidden = suspended;
    if (suspended) this.resetLayers();
    else this.sync();
  }

  resetLayers() {
    this.generation++;
    cancelMobileEntry(this);
    if (this.choiceKeys) window.removeEventListener('keydown', this.choiceKeys);
    this.choiceKeys = undefined;
    for (const layer of this.layers) this.disposeLayer(layer);
    this.layers = [];
    this.root?.querySelectorAll(':scope > :not(.hud)').forEach((node) => node.remove());
    this.hideWeaponPreview();
    this.resetDamageFeedback();
    this.canvas?.classList.remove('bt');
    this.clearTimer(this.cineTimer);
    this.cineTimer = 0;
    this.cine = undefined;
    this.closedAt = performance.now();
    this.sync();
  }

  /** Only accepted hits call this; HUD refreshes and armor recovery never count as damage. */
  damageFeedback(hpLoss: number, armorLoss: number) {
    hpLoss = Math.max(0, hpLoss);
    armorLoss = Math.max(0, armorLoss);
    if (!Number.isFinite(hpLoss) || !Number.isFinite(armorLoss) || (!hpLoss && !armorLoss)) return;
    const notice = this.hud?.querySelector<HTMLElement>('.damage-feedback');
    if (!notice) return;
    const now = performance.now();
    const previous = this.damageStreak;
    const count = previous && now - previous.at < DAMAGE_FEEDBACK_MS
      && previous.hpLoss === hpLoss && previous.armorLoss === armorLoss ? previous.count + 1 : 1;
    this.damageStreak = { hpLoss, armorLoss, count, at: now };
    const parts: { text: string; color: string }[] = [];
    if (hpLoss) parts.push({ text: `生命 -${hpLoss}`, color: E.pink });
    if (armorLoss) parts.push({ text: `护甲 -${armorLoss}`, color: E.grey });
    if (count > 1) parts.push({ text: `×${count}`, color: E.greyM });
    notice.setAttribute('aria-label', parts.map(({ text }) => text).join(' '));
    notice.innerHTML = parts.map(({ text, color }) => px(text, color).replace('alt=""', `alt="${text}"`)).join('');
    notice.classList.remove('visible');
    void notice.offsetWidth;
    notice.classList.add('visible');
    this.clearTimer(this.damageTimer);
    this.damageTimer = this.defer(() => this.resetDamageFeedback(), DAMAGE_FEEDBACK_MS);
  }

  /** Called when leaving the HUD or starting another run, including immediate restarts. */
  resetDamageFeedback() {
    this.clearTimer(this.damageTimer);
    this.damageTimer = 0;
    this.damageStreak = undefined;
    const notice = this.hud?.querySelector<HTMLElement>('.damage-feedback');
    notice?.classList.remove('visible');
    notice?.removeAttribute('aria-label');
    notice?.replaceChildren();
  }

  previewWeapon(weapon: WeaponInstance, run: RunState, keepClear: PreviewKeepClear[] = []) {
    if (this.layers.length || this.choiceKeys) return this.hideWeaponPreview();
    this.preview?.show(weapon, run);
    const panel = this.hud.querySelector<HTMLElement>('.weapon-preview');
    if (!panel || panel.hidden) return;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const uiHeight = this.root.offsetHeight || UI_H;
    const touchRects: PreviewKeepClear[] = [];
    const hudRects: PreviewKeepClear[] = [];
    if (isTouchBrowser()) {
      const rootRect = this.root.getBoundingClientRect();
      const zoom = rootRect.width / UI_W;
      if (zoom > 0) {
        document.querySelectorAll<HTMLElement>('.touch-controls:not([hidden]) .touch-action, .touch-controls:not([hidden]) .touch-stick').forEach((control) => {
          const rect = control.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          touchRects.push({
            left: (rect.left - rootRect.left) / zoom - 4,
            right: (rect.right - rootRect.left) / zoom + 4,
            top: (rect.top - rootRect.top) / zoom - 4,
            bottom: (rect.bottom - rootRect.top) / zoom + 4,
          });
        });
        this.hud.querySelectorAll<HTMLElement>('.wbar, .stats').forEach((item) => {
          const rect = item.getBoundingClientRect();
          hudRects.push({ left: (rect.left - rootRect.left) / zoom - 4, right: (rect.right - rootRect.left) / zoom + 4,
            top: (rect.top - rootRect.top) / zoom - 4, bottom: (rect.bottom - rootRect.top) / zoom + 4 });
        });
      }
    }
    const occupied = [...keepClear, ...touchRects, ...hudRects];
    const clear = ({ left, top }: { left: number; top: number }) => top >= 0 && top + height <= uiHeight
      && occupied.every((r) => left + width <= r.left || left >= r.right || top + height <= r.top || top >= r.bottom);
    const touchBandTop = Math.min(uiHeight, ...touchRects
      .filter((r) => r.right > 0 && r.left < UI_W && r.bottom > 0 && r.top < uiHeight)
      .map((r) => r.top));
    // Keep a chosen position stable while browsing. If the player reaches the lower-right
    // edge, the left side between the health and weapon HUDs leaves their surroundings clear.
    const candidates = [
      { left: UI_W - width - 8, top: uiHeight - height - 8 },
      ...(touchRects.length ? [{ left: UI_W - width - 8, top: touchBandTop - height - 4 }] : []),
      { left: 8, top: 68 },
    ];
    const position = this.previewPosition && clear(this.previewPosition)
      ? this.previewPosition : candidates.find(clear);
    if (!position) return this.hideWeaponPreview();
    this.preview?.place(position.left, position.top);
    this.previewPosition = position;
  }

  hideWeaponPreview() {
    this.preview?.hide();
    this.previewPosition = undefined;
  }

  private set(sel: string, html: string) {
    if (this.last[sel] === html) return;
    this.last[sel] = html;
    $(sel, this.hud).innerHTML = html;
  }

  updateHud(d: HudData) {
    this.syncIcons('hearts', Math.max(0, d.hp), d.maxHp, 'heart', 'heart-empty', 'heart-flash');
    this.syncIcons('shields', d.armor, d.maxArmor, 'armor', 'armor-empty', 'armor-flash');

    this.cards?.update(d.guns, d.skill, d.skillActive);

    const spells = d.spells
      .map((s) => `<div class="sp" title="${SPELLS[s.id as keyof typeof SPELLS]?.name ?? s.id} · ${s.fused ? '融合' : s.evolved ? '进化' : `Lv${s.level}`}">${icon(`spell-${s.id}`, 2)}</div>`)
      .join('');
    const pets = d.pets.map((p) => `<div class="sp pet" title="${PETS[p as keyof typeof PETS]?.name ?? ''}">${icon(`pet-${p}`)}</div>`).join('');
    this.set('.spells', spells + (pets ? `<div class="pet-roster">${pets}</div>` : ''));

    this.drawMap(d.map);
    this.set('.sname', px(`${FLOOR_NAMES[d.level]}层 ${d.styleName}`, GREY));
    this.set('.kills', px(`KILL ${d.kills}`, DIM, { small: true }));

    const tt = d.timer > 0 ? `${String(Math.floor(d.timer / 60)).padStart(2, '0')}:${String(Math.floor(d.timer % 60)).padStart(2, '0')}` : '';
    const wave = d.wave ? `${px('波次', E.yellow)}${px(`${d.wave[0]}/${d.wave[1]}`, E.white, { small: true, scale: 2 })}` : '';
    this.set('.timer', tt ? `${px('坚持住', E.yellow)}${px(tt, E.white, { small: true, scale: 2 })}` : wave);

    // The style rank: a big letter, a gauge toward the next rank, and the points.
    this.set('.style .rk', px(d.rank, RANK_COLOR[d.rank], { small: true, scale: d.rank === 'SS' ? 2 : 3 }));
    ($('.style .gauge i', this.hud) as HTMLElement).style.width = `${Math.round(d.gauge * 30)}px`;
    ($('.style .gauge i', this.hud) as HTMLElement).style.background = RANK_COLOR[d.rank];
    this.set('.style .score', px(String(d.score), E.white, { small: true }));
    $('.style', this.hud).classList.toggle('idle', d.rank === 'D' && d.gauge < 0.05);

    const combo = $('.combo', this.hud);
    combo.style.opacity = d.combo >= 5 ? '1' : '0';
    if (d.combo >= 5) this.set('.combo', `${px(`x${d.combo}`, E.yellow, { small: true, scale: 2 })}${px('连击', E.yellow)}`);

    const bb = $('.bossbar', this.hud);
    if (d.boss) {
      bb.style.opacity = '1';
      this.set('.bname', px(d.boss.name, E.white));
      ($('.bossbar .bar i', this.hud) as HTMLElement).style.width = `${Math.round(d.boss.ratio * BOSS_W)}px`;
      ($('.bossbar .bar b', this.hud) as HTMLElement).style.left = `${Math.round(d.boss.phaseMark * BOSS_W)}px`;
    } else bb.style.opacity = '0';
  }

  /** Isaac-style minimap on a tiny canvas: rooms you have seen, the corridors between them, where you are. */
  private drawMap(map: MapCell[]) {
    const sig = map.map((c) => `${+c.visited}${+c.seen}${+c.current}${+c.cleared}`).join('');
    if (sig === this.mapSig) return;
    this.mapSig = sig;
    const shown = map.filter((c) => c.visited || c.seen);
    if (!shown.length) return;
    const minX = Math.min(...map.map((c) => c.gx));
    const minY = Math.min(...map.map((c) => c.gy));
    const maxX = Math.max(...map.map((c) => c.gx));
    const maxY = Math.max(...map.map((c) => c.gy));
    const cv = $('.mm', this.hud) as HTMLCanvasElement;
    const W = (maxX - minX + 1) * CELL_W;
    const H = (maxY - minY + 1) * CELL_H;
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
    }
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const at = (gx: number, gy: number) => map.find((c) => c.gx === gx && c.gy === gy);
    const P = (x: number, y: number, w: number, h: number, col: string) => {
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w, h);
    };
    for (const c of shown) {
      const x = (c.gx - minX) * CELL_W;
      const y = (c.gy - minY) * CELL_H;
      if (c.doors.right && (c.visited || at(c.gx + 1, c.gy)?.visited)) P(x + CELL_W - 2, y + 2, 2, 1, E.slate);
      if (c.doors.down && (c.visited || at(c.gx, c.gy + 1)?.visited)) P(x + 3, y + CELL_H - 2, 1, 2, E.slate);
    }
    for (const c of shown) {
      const x = (c.gx - minX) * CELL_W;
      const y = (c.gy - minY) * CELL_H;
      const w = CELL_W - 2;
      const h = CELL_H - 2;
      if (c.current) P(x, y, w, h, E.white);
      else if (c.visited) P(x, y, w, h, c.cleared ? E.slate : E.greyM);
      else {
        P(x, y, w, h, E.slateD);
        P(x + 1, y + 1, w - 2, h - 2, E.navy);
      }
      const mark = c.type === 'boss' ? ACCENT : c.type === 'treasure' ? E.yellow : c.type === 'horde' && !c.cleared ? E.magenta : c.type === 'challenge' && !c.cleared ? E.cyan : '';
      if (mark && c.type === 'challenge') {
        P(x + 3, y + 1, 1, 3, mark);
        P(x + 2, y + 2, 3, 1, mark);
      } else if (mark) P(x + 2, y + 1, 3, 3, mark);
    }
  }

  private iconRows: Record<string, { el: HTMLImageElement; full: boolean; timer?: number }[]> = { hearts: [], shields: [] };
  private cards?: WeaponCards;
  private beats?: BeatBar;

  /**
   * Hearts and shields as icons, no numbers. Lost icons flash before going dark;
   * shields only blink or gleam, while hearts keep their small pop animation.
   */
  private syncIcons(sel: 'hearts' | 'shields', n: number, max: number, full: string, empty: string, flash: string) {
    const box = $(`.${sel}`, this.hud);
    const list = this.iconRows[sel];
    const [w, h] = ICON_SIZE[full];
    while (list.length < max) {
      const el = document.createElement('img');
      el.className = 'px ico';
      el.src = ICONS[empty];
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      box.appendChild(el);
      list.push({ el, full: false });
    }
    while (list.length > max) {
      const removed = list.pop()!;
      this.clearTimer(removed.timer);
      removed.el.remove();
    }
    let gains = 0;
    list.forEach((it, i) => {
      const want = i < n;
      if (want === it.full) return;
      it.full = want;
      this.clearTimer(it.timer);
      it.el.classList.remove('gain', 'lose');
      void it.el.offsetWidth;
      if (want) {
        it.el.src = ICONS[full];
        it.el.style.animationDelay = `${gains++ * 60}ms`;
        it.el.classList.add('gain');
      } else {
        it.el.src = ICONS[flash];
        it.el.style.animationDelay = '0ms';
        it.el.classList.add('lose');
        it.timer = this.defer(() => { it.el.src = ICONS[empty]; it.timer = undefined; }, 140);
      }
    });
  }

  /** The global leaderboard's answer on the end screen: sending, a place, or out of reach. */
  endOnline(state: 'sending' | 'offline' | { rank: number; runs: number }) {
    const slot = this.root.querySelector('.endbox .netrank') as HTMLElement | null;
    if (!slot) return;
    if (state === 'sending') slot.innerHTML = px('正在登上全服排行榜……', DIM);
    else if (state === 'offline') slot.innerHTML = px('全服排行榜暂时连不上，成绩已记在本机', DIM);
    else {
      const top = state.rank > 0 && state.rank <= 10;
      slot.innerHTML = `${icon(state.rank === 1 ? 'crown' : top ? 'medal-2' : 'sparkle')}${px(state.rank === 1 ? '全服第 1 名！' : `全服第 ${state.rank} 名`, state.rank <= 3 ? E.yellow : E.white, { scale: top ? 2 : 1 })}${px(`共 ${state.runs} 局`, GREY)}`;
      slot.classList.remove('pop');
      void slot.offsetWidth;
      slot.classList.add('pop');
      if (top) audio.rankUp(state.rank === 1 ? 5 : 3);
    }
  }

  /** First run on the global board: ask for a name to sign it with. Keys typed here never reach the game. */
  askName(onName: (name: string) => void) {
    const slot = this.root.querySelector('.endbox .netrank') as HTMLElement | null;
    if (!slot) return;
    slot.innerHTML = `${px('署名上全服榜', E.yellow)}<input class="pxinput" maxlength="12" spellcheck="false" placeholder="你的名字">${px('Enter', DIM, { small: true })}`;
    const input = slot.querySelector('input') as HTMLInputElement;
    input.focus();
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') onName(input.value.trim() || '无名骑士');
      else if (e.key === 'Escape') input.blur();
    });
  }

  /** Every frame of play: move the beat bar with the music. */
  beatFrame(beat: number, phase: number, fight: boolean, streak: number, melee: boolean) {
    this.beats?.show(melee);
    if (melee) this.beats?.frame(beat, phase, fight, streak);
  }

  /** A press was judged against the beat. */
  judge(g: Grade) {
    this.beats?.judge(g);
  }

  /** The style rank went up. */
  rankUp() {
    const rk = this.hud && ($('.style .rk', this.hud) as HTMLElement | null);
    if (!rk) return;
    rk.classList.remove('up');
    void rk.offsetWidth;
    rk.classList.add('up');
  }

  /** A room is cleared: a banner sweeps open with the grade stamped on it, the points, and how the fight went. */
  private cine?: HTMLElement;
  private cineTimer = 0;

  /**
   * Bullet time: black bars close in from above and below and the world drains of colour; the UI stays bright.
   * A boss's entrance keeps its colours (`drain` false).
   */
  cinema(ms: number, drain = true) {
    if (!this.cine?.isConnected) {
      this.cine = el('div', 'cinema');
      this.hud.after(this.cine);
    }
    const c = this.cine;
    c.classList.add('on');
    this.canvas?.classList.toggle('bt', drain);
    this.clearTimer(this.cineTimer);
    this.cineTimer = this.defer(() => {
      c.classList.remove('on');
      this.canvas?.classList.remove('bt');
    }, ms);
  }

  roomClear(o: { rank: Rank; points: number; secs: number; kills: number; combo: number; boss: boolean }) {
    this.root.querySelectorAll('.clearbanner, .stamp').forEach((x) => x.remove());
    const node = el('div', 'clearbanner');
    const time = `${Math.floor(o.secs / 60)}:${String(Math.floor(o.secs % 60)).padStart(2, '0')}`;
    node.innerHTML = `<div class="cb-band">
        <div class="cb-text">${px(o.boss ? '击破守卫' : '房间清空', E.yellow, { scale: 2 })}${px('CLEAR!', E.white, { small: true })}</div>
        <div class="cb-rank">${px(o.rank, RANK_COLOR[o.rank], { small: true, scale: 3 })}<div class="cb-pts">${px('RANK', E.white, { small: true })}${px(`+${o.points}`, E.yellow, { small: true })}</div></div>
        <i class="cb-sweep"></i>
      </div>
      <div class="cb-stats">${px(`用时 ${time}`, GREY)}${px(`击杀 ${o.kills}`, GREY)}${px(`最高连击 ${o.combo}`, GREY)}</div>`;
    this.root.appendChild(node);
    this.defer(() => node.remove(), 2600);
  }

  /** A fight was won: its grade is stamped across the top of the screen with the points it earned. */
  stamp(rank: Rank, points: number) {
    this.root.querySelectorAll('.stamp').forEach((x) => x.remove());
    const node = el('div', 'stamp');
    node.innerHTML = `<div class="big">${px(rank, RANK_COLOR[rank], { small: true, scale: 4 })}</div><div class="col">${px('RANK', E.white, { small: true })}${px(`+${points}`, E.yellow, { small: true })}</div>`;
    this.root.appendChild(node);
    this.defer(() => node.remove(), 2300);
  }

  /** A wave starts loading in: its number across the screen, the last one in red. */
  waveBanner(i: number, n: number) {
    this.root.querySelectorAll('.wavebanner').forEach((x) => x.remove());
    const last = i === n - 1;
    const node = el('div', `wavebanner${last ? ' last' : ''}`);
    const big = last ? '最后一波' : `第${['一', '二', '三', '四', '五'][i] ?? i + 1}波`;
    node.innerHTML = `<div class="wb-band">${px(big, last ? E.hot : E.white, { scale: 2 })}${px(last ? 'FINAL WAVE' : `WAVE ${i + 1}/${n}`, last ? E.hot : GREY, { small: true })}<i class="cb-sweep"></i></div>`;
    this.root.appendChild(node);
    this.defer(() => node.remove(), 1600);
  }

  toast(text: string, ms = 1300) {
    const node = $('.toast', this.hud);
    node.innerHTML = `<div class="panel">${px(text, E.white)}</div>`;
    node.classList.add('show');
    this.clearTimer(this.toastTimer);
    this.toastTimer = this.defer(() => node.classList.remove('show'), ms);
  }

  /** The scene owns its lifetime, so changing floors or restarting cannot leave a stale title. */
  ascension(show: boolean, revealed = false) {
    const existing = this.root?.querySelector<HTMLElement>('.ascension-cinematic');
    if (!show) {
      existing?.remove();
      return;
    }
    const node = existing ?? el('div', 'ascension-cinematic');
    if (!existing) {
      this.root.querySelectorAll('.banner, .chest').forEach((item) => item.remove());
      $('.toast', this.hud).classList.remove('show');
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      node.innerHTML = `<div class="ascension-heading">${px('隐藏神迹 · 众生归一', E.cream)}${px(`${ASCENSION_NAME}降临`, E.yellow, { scale: 2 })}</div><div class="ascension-blessing">${px(`${PET_ORDER.length}位伙伴，皆在庇护之下`, E.cream)}${px('伤害 ×1.6  攻速 ×1.25  移速 ×1.2', E.grey)}${px('生命与护甲 +3 · 全部回复', E.yellow)}</div>`;
      this.root.appendChild(node);
    }
    node.classList.toggle('revealed', revealed);
    node.setAttribute('aria-label', revealed ? `隐藏神迹：${ASCENSION_NAME}降临，各项能力提升` : '集齐全部伙伴，神迹正在降临');
  }

  banner(kicker: string, big: string, en: string, subtitle: string, ms = 2200) {
    const b = el('div', 'banner');
    b.innerHTML = `${px(kicker, GREY)}${px(big, E.white, { scale: 2 })}${px(en, ACCENT, { small: true })}<div class="rule"></div>${px(subtitle, GREY)}`;
    this.root.appendChild(b);
    this.defer(() => b.classList.add('out'), ms);
    this.defer(() => b.remove(), ms + 600);
  }

  chestReward(c: Choice, run: RunState) {
    const info = this.describe(c, run);
    this.root.querySelectorAll('.chest').forEach((x) => x.remove());
    const b = el('div', 'chest panel');
    b.innerHTML = `<div class="ic">${this.iconFor(info, 2)}</div><div class="col">${px('获得', E.yellow)}${px(info.name, E.white)}${px(info.tag, info.tagColor)}</div>`;
    this.root.appendChild(b);
    this.defer(() => b.remove(), 1900);
  }

  /** The fusion popup: both ingredients, an arrow, the fused spell and what it does. */
  fusionReward(f: FusionId) {
    const s = SPELLS[f];
    const [a, b] = s.fusion!;
    this.root.querySelectorAll('.chest').forEach((x) => x.remove());
    const node = el('div', 'chest panel fusion');
    node.style.top = '26px';
    node.innerHTML = `<div class="ic">${icon(`spell-${a}`, 2)}${px('+', E.white)}${icon(`spell-${b}`, 2)}${px('→', E.magenta)}${icon(`spell-${f}`, 3)}</div><div class="col">${px('法术融合', E.magenta)}${px(s.name, E.white, { scale: 2 })}${pxBlock(s.desc, GREY, 170)}</div>`;
    this.root.appendChild(node);
    this.defer(() => node.remove(), 2200);
  }

  describe(c: Choice, run: RunState): { icon: string; name: string; tag: string; tagColor: string; desc: string; rarity: string } {
    switch (c.type) {
      case 'upgrade': {
        const have = run.stacks[c.def.id] ?? 0;
        const r = RARITY_INFO[c.def.rarity];
        return { icon: `upg-${c.def.id}`, name: c.def.name, tag: have ? `${r.name} ${have}/${c.def.max}` : `${r.name}`, tagColor: r.color, desc: c.def.desc, rarity: c.def.rarity };
      }
      case 'spell-new': {
        const s = SPELLS[c.id];
        const f = fusionOf(c.id);
        const partner = f && run.spells.find((x) => x.id === f.partner);
        const hint = partner ? `。和「${SPELLS[f.partner].name}」都升到 ${FUSE_LEVEL} 级会融合成「${SPELLS[f.fusion].name}」` : '';
        return { icon: `spell-${c.id}`, name: s.name, tag: partner ? '新法术 · 可融合' : '新法术', tagColor: partner ? E.magenta : E.yellow, desc: s.desc + hint, rarity: partner ? 'epic' : 'rare' };
      }
      case 'spell-up': {
        const s = SPELLS[c.id];
        const inst = run.spells.find((x) => x.id === c.id);
        const lv = inst?.level ?? 1;
        const f = fusionOf(c.id);
        const partner = f && run.spells.find((x) => x.id === f.partner);
        const fuses = !!partner && lv + 1 >= FUSE_LEVEL && partner.level >= FUSE_LEVEL;
        const desc = (s.levels[lv - 1] ?? '强化') + (fuses ? `。升级后与「${SPELLS[f!.partner].name}」融合成「${SPELLS[f!.fusion].name}」` : partner ? `。两者都到 ${FUSE_LEVEL} 级会融合成「${SPELLS[f!.fusion].name}」` : '');
        return { icon: `spell-${c.id}`, name: spellName(inst ?? { id: c.id, evolved: false }), tag: fuses ? `Lv${lv}→${lv + 1} · 将融合` : `Lv${lv}→${lv + 1}`, tagColor: fuses ? E.magenta : E.cyan, desc, rarity: fuses ? 'epic' : 'common' };
      }
      case 'evolve': {
        const s = SPELLS[c.id];
        return { icon: `spell-${c.id}`, name: s.evolved?.name ?? s.name, tag: '进化', tagColor: E.yellow, desc: s.evolved?.desc ?? s.desc, rarity: 'legendary' };
      }
      case 'weapon-new': {
        const w = WEAPONS[c.id];
        const m = STAT_MEANING[w.kind];
        return { icon: `gun-${c.id}`, name: w.name, tag: run.weapons.length >= 2 ? '选择替换武器' : '新武器', tagColor: E.yellow, desc: `${w.desc}。数量+1：${m.count}，穿透：${m.pierce}`, rarity: 'rare' };
      }
      case 'pet': {
        const p = PETS[c.kind];
        return { icon: `pet-${c.kind}`, name: p.name, tag: `伙伴 · ${p.role}`, tagColor: E.pink, desc: p.desc, rarity: 'epic' };
      }
      case 'heal':
        return { icon: 'heart', name: '回春', tag: '', tagColor: E.white, desc: '回满生命和护甲', rarity: 'common' };
    }
  }

  private iconFor(d: { icon: string }, scale = 2) {
    if (d.icon.startsWith('glyph:')) {
      const [, g, col] = d.icon.split(':');
      return px(g, col, { scale: 2 });
    }
    return icon(d.icon, scale);
  }

  /**
   * A pick-one panel of tall cards. The cards are dealt face down and flip over one after another; the one under the
   * mouse or the arrow keys rises and glows; 1-3, Enter or a click takes it, and it flares while the others fall away.
   * With `skip`, a line under the cards lets you take nothing (also Esc); onPick then gets -1.
   */
  choices(title: string, sub: string, items: Choice[], run: RunState, onPick: (i: number) => void, o: { tag?: string; skip?: string } = {}) {
    const generation = this.generation;
    this.hideWeaponPreview();
    if (this.choiceKeys) window.removeEventListener('keydown', this.choiceKeys);
    this.root.querySelectorAll('.overlay.picker').forEach((x) => x.remove());
    const ov = el('div', 'overlay picker');
    ov.innerHTML = `<div class="pk-head"><span class="tagred">${px(o.tag ?? 'LEVEL UP', E.white, { small: true, outline: false })}</span>${px(title, E.yellow, { scale: 2 })}${px(sub, GREY)}</div>`;
    const table = el('div', 'pk-cards');
    ov.appendChild(table);
    const cards: HTMLElement[] = [];
    items.forEach((c, i) => {
      const d = this.describe(c, run);
      // On a card a new gun is described by its own line; the stat glossary is for the pause page.
      if (c.type === 'weapon-new') d.desc = WEAPONS[c.id].desc;
      const [w, h] = ICON_SIZE[d.icon] ?? [16, 16];
      const scale = Math.max(1, Math.min(3, Math.floor(46 / Math.max(w, h, 1))));
      const card = el('div', `pk-card ${d.rarity}`);
      card.style.setProperty('--i', String(i));
      card.style.setProperty('--tilt', `${(i - (items.length - 1) / 2) * 7}deg`);
      card.innerHTML = `<div class="pk-tilt">
          <div class="pk-back"><i></i></div>
          <div class="pk-face">
            <div class="pk-ribbon">${d.tag ? px(d.tag, d.tagColor) : ''}</div>
            <div class="pk-art"><div class="pk-halo"></div>${d.icon.startsWith('glyph:') ? this.iconFor(d) : icon(d.icon, scale)}</div>
            <div class="pk-name">${pxBlock(d.name, E.white, 112)}</div>
            <div class="pk-rule"></div>
            <div class="pk-desc">${cardLines(d.desc)}</div>
            <div class="pk-key">${px(String(i + 1), E.white, { small: true })}</div>
            <i class="pk-shine"></i>
          </div>
        </div>`;
      // A spell whose partner you already hold says what it will fuse into, on a tab under the card.
      const fuse = fusionHint(run, c);
      if (fuse) {
        const tab = el('div', `pk-fuse${fuse.now ? ' now' : ''}`);
        tab.innerHTML = `${icon(`spell-${fuse.fusion}`, 1)}${px(fuse.now ? '将融合' : '可融合', E.magenta)}${px(SPELLS[fuse.fusion].name, E.white)}`;
        card.appendChild(tab);
        ov.classList.add('has-fuse');
      }
      table.appendChild(card);
      cards.push(card);
    });
    let skipEl: HTMLElement | undefined;
    if (o.skip) {
      skipEl = el('div', 'pk-skip');
      skipEl.innerHTML = `${px(o.skip, GREY)}${px('Esc', DIM, { small: true })}`;
      ov.appendChild(skipEl);
    }
    const count = cards.length + (skipEl ? 1 : 0);
    let sel = 0;
    let done = false;
    const select = (i: number) => {
      sel = i;
      cards.forEach((c, k) => c.classList.toggle('sel', k === i));
      skipEl?.classList.toggle('sel', i === cards.length);
    };
    const pick = (i: number) => {
      if (done) return;
      done = true;
      this.closedAt = performance.now();
      window.removeEventListener('keydown', onKey);
      if (this.choiceKeys === onKey) this.choiceKeys = undefined;
      ov.classList.add('closing');
      cards.forEach((c, k) => c.classList.add(k === i ? 'chosen' : 'away'));
      if (i >= 0) audio.cardPick();
      else audio.select();
      const finish = () => {
        if (generation !== this.generation || this.suspended || !ov.isConnected) return;
        ov.remove();
        onPick(i);
        this.sync();
      };
      // The chosen card flares and lifts away before play resumes (the playtest bot skips the wait).
      if ((window as unknown as { __fastUi?: boolean }).__fastUi) finish();
      else this.defer(finish, i >= 0 ? 560 : 280);
    };
    cards.forEach((card, k) => {
      card.addEventListener('mouseenter', () => {
        if (done) return;
        if (sel !== k) audio.hover();
        select(k);
      });
      card.addEventListener('click', () => pick(k));
    });
    skipEl?.addEventListener('mouseenter', () => !done && select(cards.length));
    skipEl?.addEventListener('click', () => pick(-1));
    const onKey = (e: KeyboardEvent) => {
      if (this.suspended || generation !== this.generation) return;
      const n = Number(e.key) - 1;
      if (n >= 0 && n < cards.length) pick(n);
      else if (e.key === 'Escape' && skipEl) pick(-1);
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        select((sel + 1) % count);
        audio.hover();
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        select((sel + count - 1) % count);
        audio.hover();
      } else if (e.key === 'Enter' || e.key === ' ') pick(sel === cards.length ? -1 : sel);
    };
    select(0);
    this.choiceKeys = onKey;
    window.addEventListener('keydown', onKey);
    this.root.appendChild(ov);
    this.sync();
    audio.deal(cards.length);
  }

  /**
   * Choosing the hero of a new run: a tall card each, dealt and flipped like the pick cards, with the hero, a line about
   * them, their first weapon and their perk. Number keys, arrows and Enter or a click choose; Esc goes back to the menu.
   */
  heroSelect(onPick: (hero: HeroId) => void, initialHero: HeroId = 'adonis') {
    const generation = this.generation;
    const ov = el('div', 'overlay picker heroes');
    ov.innerHTML = `<div class="pk-head"><span class="tagred">${px('HERO', E.white, { small: true, outline: false })}</span>${px('选择角色', E.yellow, { scale: 2 })}${px(isTouchBrowser() ? '轻触卡片选择角色' : '谁走进这幅画', GREY)}<button type="button" class="hero-back" aria-label="返回主页">${px(isTouchBrowser() ? '‹ 返回' : 'Esc 返回', DIM)}</button></div>`;
    const table = el('div', 'pk-cards');
    ov.appendChild(table);
    const cards = HERO_ORDER.map((id, i) => {
      const h = HEROES[id];
      const w = WEAPONS[h.weapon];
      const artScale = Math.max(1, Math.min(3, Math.floor(54 / (ICON_SIZE[h.tex]?.[1] ?? 16))));
      const card = el('div', `pk-card hero ${i === 0 ? 'legendary' : 'rare'}`);
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${h.name}，${h.title}，初始武器${w.name}，${h.perk}`);
      card.tabIndex = 0;
      card.style.setProperty('--i', String(i));
      card.style.setProperty('--tilt', `${(i - (HERO_ORDER.length - 1) / 2) * 7}deg`);
      card.innerHTML = `<div class="pk-tilt">
          <div class="pk-back"><i></i></div>
          <div class="pk-face">
            <div class="pk-ribbon">${px(h.title, i === 0 ? E.yellow : E.cyan)}</div>
            <div class="pk-art hero-art"><div class="pk-halo"></div>${icon(h.tex, artScale)}</div>
            <div class="pk-name">${px(h.name, E.white)}</div>
            <div class="pk-rule"></div>
            <div class="pk-desc">${pxBlock(h.desc, DIM, 136)}</div>
            <div class="hero-row">${icon(`gun-${h.weapon}`)}${px(`初始武器 ${w?.name ?? ''}`, GREY)}</div>
            <div class="hero-perk">${h.perk.split('，').map((perk) => pxBlock(perk.trim(), E.green, 136)).join('')}</div>
            <div class="pk-key">${px(String(i + 1), E.white, { small: true })}</div>
            <i class="pk-shine"></i>
          </div>
        </div>`;
      table.appendChild(card);
      return card;
    });
    let sel = 0;
    let done = false;
    const select = (i: number) => {
      sel = i;
      cards.forEach((c, k) => {
        c.classList.toggle('sel', k === i);
        c.setAttribute('aria-pressed', String(k === i));
      });
    };
    const pick = (i: number) => {
      if (done) return;
      done = true;
      cards.forEach((c, k) => c.classList.add(k === i ? 'chosen' : 'away'));
      ov.classList.add('closing');
      audio.cardPick();
      const go = () => {
        if (generation !== this.generation || this.suspended || !ov.isConnected) return;
        this.close(layer);
        onPick(HERO_ORDER[i]);
      };
      if ((window as unknown as { __fastUi?: boolean }).__fastUi) go();
      else this.defer(go, 560);
    };
    const back = () => {
      if (done) return;
      done = true;
      audio.select();
      this.close(layer, 150);
    };
    ov.querySelector('.hero-back')!.addEventListener('click', back);
    cards.forEach((card, k) => {
      card.addEventListener('focus', () => { if (!done) select(k); });
      card.addEventListener('mouseenter', () => {
        if (done || sel === k) return;
        audio.hover();
        select(k);
      });
      card.addEventListener('click', () => pick(k));
    });
    select(Math.max(0, HERO_ORDER.indexOf(initialHero)));
    const layer = this.push(ov, (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === ov.querySelector('.hero-back')) {
        e.preventDefault();
        back();
        return;
      }
      const n = Number(e.key) - 1;
      if (n >= 0 && n < cards.length) pick(n);
      else if (e.key === 'Escape') back();
      else if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S'].includes(e.key)) {
        e.preventDefault();
        const previous = ['ArrowLeft', 'ArrowUp', 'a', 'A', 'w', 'W'].includes(e.key);
        select((sel + (previous ? -1 : 1) + cards.length) % cards.length);
        cards[sel].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        audio.hover();
      } else if (e.key === 'Enter' || e.key === ' ') pick(sel);
    });
    cards[sel].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    audio.deal(cards.length);
  }

  weaponSwap(incoming: WeaponInstance, run: RunState, onPick: (index: number) => void) {
    openWeaponSwap(this, incoming, run, onPick);
  }

  /** When a pick panel last closed, so the same Esc press doesn't also open the pause menu. */
  closedAt = 0;

  push(node: HTMLElement, onKey?: (e: KeyboardEvent) => void): Layer {
    this.hideWeaponPreview();
    this.root.appendChild(node);
    const layer = { el: node, onKey, openedAt: performance.now() };
    this.layers.push(layer);
    this.sync();
    return layer;
  }

  close(layer: Layer, fadeMs = 0) {
    this.disposeLayer(layer);
    this.layers = this.layers.filter((l) => l !== layer);
    const remove = () => { layer.el.remove(); this.sync(); };
    if (!fadeMs) return remove();
    layer.el.classList.add('out');
    this.defer(remove, fadeMs);
  }

  private disposeLayer(layer: Layer) {
    const dispose = layer.dispose;
    layer.dispose = undefined;
    dispose?.();
  }

  escUsed() {
    this.closedAt = performance.now();
  }

  /** Main menu: the logo and menu on the left, the knight facing the boar on the right. */
  title(a: TitleActions) {
    const save = a.save();
    const ov = el('div', 'overlay title');
    const logo = (col: string, cls: string) => px('ADONIS', col, { small: true, scale: 4, outline: false }, cls);
    ov.innerHTML = `
      <div class="tl-left">
        <div class="logo">${logo(ACCENT, 'r')}${logo(E.cyan, 'c')}${logo(E.white, 'w')}</div>
        <div class="sub">${px('画 中 轮 回', ACCENT)}</div>
        <div class="menu"></div>
        <div class="hint">${px(isTouchBrowser() ? '轻触选择 · 横屏视野更开阔' : '↑↓ 选择　Enter 确认', DIM)}</div>
      </div>
      <div class="tl-right">
        <div class="tl-story">${px('他一次次死去，又一次次重生。', DIM)}${px('这一次，穿过五层地牢，去见那头野猪。', DIM)}</div>
      </div>
      <div class="ver">${px('v0.5', E.slate, { small: true, outline: false })}</div>`;
    // The painting fills the screen behind the menu; it answers the mouse and the menu.
    const painting = new TitlePainting();
    ov.prepend(painting.el);
    ov.addEventListener('mousemove', (e) => painting.look(e.clientX, e.clientY));
    const note = save ? `第${FLOOR_NAMES[save.level] ?? save.level + 1}层 Lv${save.xpLevel}` : '没有存档';
    const rows = [menuRow('继续游戏', { note }), menuRow('开始冒险'), menuRow('排行榜'), menuRow('游戏说明'), menuRow('图鉴'), menuRow('设置'), ...(a.onBack ? [menuRow('返回画廊', { key: 'Esc' })] : [])];
    ['continue', 'new', 'board', 'guide', 'codex', 'settings'].forEach((k, i) => (rows[i].dataset.k = k));
    ov.querySelector('.menu')!.append(...rows);
    ov.querySelector('.menu')!.after(painting.caption);
    let tabs: CodexTab[] | undefined;
    let leaving = false;
    const leave = (go: () => void) => {
      if (leaving) return;
      leaving = true;
      this.close(layer, 250);
      go();
    };
    const pick = (i: number) => {
        if (leaving || this.layers.at(-1) !== layer) return;
        audio.select();
        if (i === 0) beginMobileEntry(this, () => leave(a.onContinue));
        else if (i === 1) beginMobileEntry(this, () => {
          // Choose a hero, then their trial. Backtracking keeps the hero selected.
          const choose = (initialHero: HeroId = 'adonis') => this.heroSelect((hero) => {
            openDifficultySelect(this, {
              initial: a.initialDifficulty(),
              onBack: () => choose(hero),
              onConfirm: (difficulty) => {
                settings.set({ diff: difficulty });
                leave(() => a.onNew(hero, difficulty));
              },
            });
          }, initialHero);
          if (a.save()) confirmBox(this, '已有一局存档。开始新的冒险会覆盖它，确定吗？', choose);
          else choose();
        });
        else if (i === 2) openBoard(this);
        else if (i === 3) openHelp(this);
        else if (i === 4) openCodex(this, (tabs ??= a.codex()));
        else if (i === 5) openSettings(this);
        else if (a.onBack) leave(a.onBack);
      };
    const nav = new MenuNav(rows, pick, [!save]);
    nav.onFocus = (i) => painting.setCaption(i);
    nav.select(save ? 0 : 1);
    const layer = this.push(ov, (e) => {
      if ((e.key === 'Escape' || e.key === 'Backspace') && a.onBack) {
        e.preventDefault();
        this.escUsed();
        leave(a.onBack);
        return;
      }
      const activate = e.key === 'Enter' || e.key === ' ';
      if (activate) e.preventDefault();
      if (!activate || !e.repeat) nav.key(e);
    });
    if (a.initialAction) pick(a.initialAction === 'continue' ? 0 : 1);
  }

  /** Pause: the menu on the left, the run on the right (hero, progress, guns, spells, pets, upgrades). */
  pause(info: PauseInfo, a: PauseActions) {
    const { run } = info;
    const m = run.mods;
    const ov = el('div', 'overlay pausescr');
    const sec = (title: string, body: string, cls = '') => `<div class="ps-sec ${cls}">${px(title, E.yellow)}${body}</div>`;
    const bar = (cls: string, v: number, max: number, label: string) =>
      `<div class="ps-bar"><div class="bar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, v / max)) * 52)}px"></i></div>${px(label, E.white, { small: true })}</div>`;
    const mult = (v: number) => `×${(Math.round(v * 100) / 100).toFixed(2).replace(/0$/, '')}`;
    const stats: [string, string][] = [
      ['伤害', mult(m.damage)],
      ['攻速', mult(m.fireRate)],
      ['暴击', `${Math.round(m.critChance * 100)}%`],
      ['暴伤', mult(m.critMult)],
      ['范围', mult(m.area)],
      ['数量', `+${m.count}`],
      ['穿透', `+${m.pierce}`],
      ['移速', mult(m.moveSpeed)],
    ];
    const elems = (['fire', 'ice', 'shock'] as const).filter((k) => m.elements[k] > 0).map((k) => `${{ fire: '火', ice: '冰', shock: '电' }[k]} ${Math.round(m.elements[k] * 100)}%`);
    const row = (n: number, max: number, full: string, empty: string) => `<div class="icons">${Array.from({ length: max }, (_, i) => icon(i < n ? full : empty)).join('')}</div>`;
    const hero = `<div class="ps-hero">${icon(run.ascended ? 'jesus' : HEROES[run.hero]?.tex ?? 'adonis', 2)}<div class="ps-bars">${row(Math.max(0, run.hp), m.maxHp, 'heart', 'heart-empty')}${row(run.armor, m.maxArmor, 'armor', 'armor-empty')}${bar('xp', run.xp, run.xpNext, `LV${run.xpLevel}`)}</div></div>${run.ascended ? `<div class="ps-ascended">${px(`隐藏神迹 · ${ASCENSION_NAME}`, E.yellow)}${px('本局永久觉醒', E.cream)}</div>` : ''}`;
    const statGrid = `<div class="ps-stats">${stats.map(([k, v]) => `<div class="st">${px(k, DIM)}${px(v, E.white, { small: true })}</div>`).join('')}</div>${elems.length ? `<div class="ps-line">${px('元素', DIM)}${px(elems.join('  '), E.white)}</div>` : ''}`;
    const guns = run.weapons
      .map((w, i) => `<div class="ps-item">${icon(`gun-${w.def.id}`)}${px(w.def.name, E.white)}${px(i === run.held ? '主' : '副', i === run.held ? E.cyan : DIM)}${w.def.mag ? px(`弹匣${Math.round(w.def.mag * m.mag)}`, DIM) : ''}</div>`)
      .join('');
    const spells = run.spells.length
      ? run.spells
          .map((s) => {
            const fused = !!SPELLS[s.id].fusion;
            const mark = fused ? px('融合', E.magenta) : s.evolved ? px('★', E.yellow) : px(`Lv${s.level}`, E.yellow, { small: true });
            return `<div class="ps-item">${icon(`spell-${s.id}`)}${px(spellName(s), fused ? E.magenta : s.evolved ? E.yellow : E.white)}${mark}</div>`;
          })
          .join('')
      : px('还没有法术', DIM);
    const pets = run.pets.length ? run.pets.map((p) => `<div class="ps-item">${icon(`pet-${p}`)}${px(PETS[p].name, E.white)}</div>`).join('') : px('升级招募或宝物房结识伙伴', DIM);
    const petValues = [
      ['伤害', `×${(m.petDamage * (1 + m.petTeamwork * run.pets.length)).toFixed(2)}`],
      ['频率', `×${m.petRate.toFixed(2)}`],
      ['继承', `${Math.round(m.petInherit * 100)}%`],
      ['范围', `×${m.petArea.toFixed(2)}`],
      ['追击', `${Math.round(m.petEcho * 100)}%`],
      ['格挡', `${Math.round(Math.min(0.24, m.petGuard * run.pets.length) * 100)}%`],
    ];
    const petStats = run.pets.length ? `<div class="ps-pet-stats">${px(`伙伴 ${run.pets.length}/${PET_ORDER.length}`, E.pink)}<div class="ps-stats">${petValues.map(([label, value]) => `<div class="st">${px(label, DIM)}${px(value, E.white, { small: true })}</div>`).join('')}</div>${px(`额外暴击 ${Math.round(m.petCrit * 100)}%`, DIM)}</div>` : '';
    const ups = Object.entries(run.stacks);
    const upgrades = ups.length
      ? ups.map(([id, n]) => {
          const u = UPGRADE_BY_ID[id];
          return `<div class="chip">${icon(`upg-${id}`) || px(u?.glyph ?? '?', RARITY[u?.rarity ?? 'common'].color)}${px(u?.name ?? id, E.white)}${n > 1 ? px(`×${n}`, E.yellow, { small: true }) : ''}</div>`;
        }).join('')
      : px('还没有加成', DIM);
    const floorNo = ['一', '二', '三'][run.level] ?? run.level + 1;
    ov.innerHTML = `
      <div class="ps-left">
        <div class="head"><span class="tagred">${px('PAUSE', E.white, { small: true, outline: false })}</span>${px('暂停', E.yellow, { scale: 2 })}</div>
        <div class="menu"></div>
        <div class="ps-diff">${px('难度', DIM)}${px(run.diff.name, run.diff.id === 'hard' ? ACCENT : E.white)}${px('种子', DIM)}${px(String(run.seed), DIM, { small: true })}</div>
      </div>
      <div class="ps-right panel" tabindex="0" role="region" aria-label="本局状态与宠物加成">
        <div class="ps-top">${px(`第${floorNo}层 · ${info.floorName}`, E.yellow)}${px(`房间 ${info.roomsCleared}/${info.roomsTotal}`, GREY)}${px(`击杀 ${run.kills}`, GREY)}${px(`用时 ${fmtTime(run.elapsed)}`, GREY)}</div>
        <div class="ps-cols">
          <div class="ps-col">${sec('角色', hero)}${sec('属性', statGrid)}</div>
          <div class="ps-col">${sec('武器', guns)}${sec('法术', `<div class="ps-two">${spells}</div>`)}${sec('宠物', `<div class="ps-row">${pets}</div>${petStats}`)}</div>
        </div>
        ${run.ascended ? sec('神迹加成', `<div class="ps-ascended">${ASCENSION_BONUS_LINES.map((line) => pxBlock(line, E.cream, 290)).join('')}</div>`, 'wide') : ''}
        ${sec('加成', `<div class="build">${upgrades}</div>`, 'wide')}
      </div>`;
    ov.querySelector('.ps-right')!.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes((e as KeyboardEvent).key)) e.stopPropagation();
    });
    const rows = [menuRow('继续游戏', { key: 'Esc' }), menuRow('游戏说明'), menuRow('图鉴'), menuRow('设置'), menuRow('返回画廊', { note: '自动存档' })];
    ov.querySelector('.menu')!.append(...rows);
    let tabs: CodexTab[] | undefined;
    const resume = () => {
      this.close(layer);
      a.onResume();
    };
    const nav = new MenuNav(rows, (i) => {
      audio.select();
      if (i === 0) resume();
      else if (i === 1) openHelp(this);
      else if (i === 2) openCodex(this, (tabs ??= a.codex()));
      else if (i === 3) openSettings(this);
      else confirmBox(this, '返回画廊？进度会自动存档，之后可继续这次冒险。', () => {
        this.close(layer);
        a.onQuit();
      });
    });
    const layer = this.push(ov, (e) => {
      if (e.key === 'Escape') {
        this.escUsed();
        resume();
      } else nav.key(e);
    });
  }

  end(info: EndInfo, onRestart: () => void, onTitle: () => void) {
    const { run, victory } = info;
    const ov = el('div', 'overlay');
    const total = Object.values(run.damage).reduce((x, y) => x + y, 0) || 1;
    const rows = Object.entries(run.damage)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5)
      .map(([k, v]) => `<div class="row"><div class="nm">${px(k, GREY)}</div><div class="b" style="width:${Math.max(2, Math.round((v / total) * 150))}px"></div>${px(`${Math.round((v / total) * 100)}%`, DIM, { small: true })}</div>`)
      .join('');
    const stat = (v: string, label: string) => `<div>${px(v, E.yellow, { small: true, scale: 2 })}${px(label, DIM)}</div>`;
    const board = run.supply ? '补给榜' : '排行榜';
    const rank = info.rank === 1 ? px(`新纪录！${board}第 1 名`, E.yellow) : info.rank > 0 && info.rank <= 10 ? px(`${board}第 ${info.rank} 名`, E.white) : '';
    ov.innerHTML = `<div class="box panel endbox">
      <div class="head"><span class="tagred">${px(victory ? 'CLEAR' : 'DEAD', E.white, { small: true, outline: false })}</span>${px(victory ? '这一次，他活了下来' : '阿多尼斯倒下了', victory ? E.yellow : ACCENT, { scale: 2 })}</div>
      <div class="end-details" tabindex="0" role="region" aria-label="本局结算详情">
        ${px(victory ? '野猪倒下了，银莲花开满了地牢。' : '血落处开出银莲花，他会再次重生。', GREY)}
        <div class="statgrid">${stat(`${run.level + 1}/${LEVELS}`, '层数')}${stat(String(run.kills), '击杀')}${stat(String(run.xpLevel), '等级')}${stat(fmtTime(run.elapsed), '用时')}</div>
        <div class="score">${px(`得分 ${info.score}`, E.yellow)}${px(DIFFICULTIES[run.diff.id].name, GREY)}${rank}</div>
        ${run.supply ? px(`携带 ${run.supply.name} · 计入本机补给榜`, E.cyan) : ''}
        ${info.settlement ? pxBlock(info.settlement, E.cream, 300) : ''}
        ${info.warning ? pxBlock(info.warning, E.orange, 300) : ''}
        <div class="netrank"></div>
        <div class="dmg">${rows}</div>
      </div>
      <div class="menu row2"></div></div>`;
    ov.querySelector('.end-details')!.addEventListener('keydown', (e) => {
      // Let the focused details scroll without also moving the action-menu selection.
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes((e as KeyboardEvent).key)) e.stopPropagation();
    });
    const items = [menuRow('再次重生', { key: 'R' }), menuRow('返回画廊')];
    ov.querySelector('.menu')!.append(...items);
    const nav = new MenuNav(items, (i) => {
      audio.select();
      this.close(layer);
      (i === 0 ? onRestart : onTitle)();
    });
    const layer = this.push(ov, (e) => {
      if (e.key === 'r' || e.key === 'R') {
        audio.select();
        this.close(layer);
        onRestart();
      } else nav.key(e);
    });
  }
}

export const ui = new UI();
