import { RARITY_INFO, UPGRADE_BY_ID } from '../data/upgrades';
import { WEAPONS, STAT_MEANING, MAX_WEAPON_LEVEL } from '../data/weapons';
import { FUSE_LEVEL, SPELLS, fusionOf, spellName, type FusionId } from '../data/spells';
import { PETS } from '../data/enemies';
import type { StyleKit } from '../styles/types';
import { LEVELS, type Choice, type RunState } from '../game/run';
import type { Dir } from '../game/dirs';
import { ICONS, ICON_SIZE } from '../styles/textures';
import { E } from '../pixel/palette';
import { audio } from '../audio/audio';
import { DIFFICULTIES } from '../data/difficulty';
import { RARITY_INFO as RARITY } from '../data/upgrades';
import type { SavedRun } from '../save';
import type { CodexTab } from './codex';
import { $, diamond, el, icon, px, pxBlock } from './pxhtml';
import { MenuNav, confirmBox, menuRow, openBoard, openCodex, openHelp, openSettings, type Layer, type LayerHost } from './screens';
import { WeaponCards, type GunView } from './weaponCards';
import { BeatBar } from './beatBar';
import { TitlePainting } from './titleArt';
import type { Grade, Rank } from '../game/rhythm';

/** The UI is laid out on the same 480x270 pixel grid as the game and zoomed with it. */
export const UI_W = 480;
export const UI_H = 270;

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
  kills: number;
  combo: number;
  /** The style rank, how far it is toward the next one (0-1), and the run's points. */
  rank: Rank;
  gauge: number;
  score: number;
  map: MapCell[];
  boss?: { name: string; ratio: number; phaseMark: number };
}

const BAR_W = 52;
const BOSS_W = 200;
const CELL_W = 9;
const CELL_H = 7;
const FLOOR_NAMES = ['一', '二', '三', '四', '五', '六'];
const RANK_COLOR: Record<Rank, string> = { D: E.greyM, C: E.green, B: E.cyan, A: E.yellow, S: E.orange, SS: E.hot };


export interface TitleActions {
  save: () => SavedRun | null;
  onContinue: () => void;
  onNew: () => void;
  codex: () => CodexTab[];
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
}

const fmtTime = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

class UI implements LayerHost {
  root!: HTMLElement;
  /** Full-screen pages, top one owns the keyboard. */
  private layers: Layer[] = [];
  private wrap!: HTMLElement;
  private hud!: HTMLElement;
  private canvas?: HTMLCanvasElement;
  private toastTimer = 0;
  private choiceKeys?: (e: KeyboardEvent) => void;
  private last: Record<string, string> = {};
  private mapSig = '';

  mount(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.root = $('#ui-root');
    this.wrap = $('#ui-wrap') ?? el('div');
    this.wrap.id = 'ui-wrap';
    if (!this.wrap.parentElement) {
      document.body.appendChild(this.wrap);
      this.wrap.appendChild(this.root);
    }
    this.root.innerHTML = '';
    this.hud = el('div', 'hud');
    this.hud.innerHTML = `
      <div class="stats panel">
        <div class="icons hearts"></div>
        <div class="icons shields"></div>
        <div class="row">${icon('xp')}<div class="bar xp"><i></i></div><span class="n" data-n="xp"></span></div>
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
    this.cards = new WeaponCards($('.wbar', this.hud));
    this.beats = new BeatBar(this.hud);
    window.addEventListener('keydown', (e) => {
      if (this.choiceKeys) return;
      const top = this.layers[this.layers.length - 1];
      // Phaser handles keys before this listener: the Esc that just opened the pause page must not also close it.
      if (!top || e.timeStamp < top.openedAt) return;
      top.onKey?.(e);
    });
    const sync = () => this.sync();
    window.addEventListener('resize', sync);
    new ResizeObserver(sync).observe(canvas);
    sync();
  }

  /** Lay the UI over the canvas and zoom it by the same factor as the game pixels. */
  sync() {
    if (!this.canvas) return;
    const r = this.canvas.getBoundingClientRect();
    Object.assign(this.wrap.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    (this.root.style as any).zoom = String(r.width / UI_W);
  }

  applyTheme(kit: StyleKit) {
    this.root.style.setProperty('--biome', kit.palette.danger);
  }

  showHud(show: boolean) {
    this.hud.style.opacity = show ? '1' : '0';
  }

  private set(sel: string, html: string) {
    if (this.last[sel] === html) return;
    this.last[sel] = html;
    $(sel, this.hud).innerHTML = html;
  }

  updateHud(d: HudData) {
    const bar = (cls: string, v: number, max: number) => {
      ($(`.bar.${cls} i`, this.hud) as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, v / max)) * BAR_W)}px`;
    };
    this.syncIcons('hearts', Math.max(0, d.hp), d.maxHp, 'heart', 'heart-empty', 'heart-flash');
    this.syncIcons('shields', d.armor, d.maxArmor, 'armor', 'armor-empty', 'armor-flash');
    bar('xp', d.xp, d.xpNext);
    this.set('[data-n=xp]', px(`LV${d.xpLevel}`, E.cyan, { small: true }));

    this.cards.update(d.guns, d.skill, d.skillActive);

    const spells = d.spells
      .map((s) => `<div class="sp panel ${s.fused ? 'fused' : s.evolved ? 'evo' : ''}">${icon(`spell-${s.id}`)}<span class="lv">${s.fused ? px('融', E.magenta) : px(s.evolved ? '★' : String(s.level), E.yellow, { small: !s.evolved })}</span></div>`)
      .join('');
    const pets = d.pets.map((p) => `<div class="sp panel pet">${icon(`pet-${p}`)}</div>`).join('');
    this.set('.spells', spells + pets);

    this.drawMap(d.map);
    this.set('.sname', px(`${FLOOR_NAMES[d.level]}层 ${d.styleName}`, GREY));
    this.set('.kills', px(`KILL ${d.kills}`, DIM, { small: true }));

    const tt = d.timer > 0 ? `${String(Math.floor(d.timer / 60)).padStart(2, '0')}:${String(Math.floor(d.timer % 60)).padStart(2, '0')}` : '';
    this.set('.timer', tt ? `${px('坚持住', E.yellow)}${px(tt, E.white, { small: true, scale: 2 })}` : '');

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
      const mark = c.type === 'boss' ? ACCENT : c.type === 'treasure' ? E.yellow : c.type === 'horde' && !c.cleared ? E.magenta : '';
      if (mark) P(x + 2, y + 1, 3, 3, mark);
    }
  }

  private iconRows: Record<string, { el: HTMLImageElement; full: boolean; timer?: number }[]> = { hearts: [], shields: [] };
  private cards!: WeaponCards;
  private beats!: BeatBar;

  /**
   * Hearts and shields as icons, no numbers. A lost one flashes white and shakes as it goes dark;
   * a regained one pops back in, several in a row with a little stagger.
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
    while (list.length > max) list.pop()!.el.remove();
    let gains = 0;
    list.forEach((it, i) => {
      const want = i < n;
      if (want === it.full) return;
      it.full = want;
      clearTimeout(it.timer);
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
        it.timer = window.setTimeout(() => (it.el.src = ICONS[empty]), 140);
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

  /** Bullet time: black bars close in from above and below and the world drains of colour; the UI stays bright. */
  cinema(ms: number) {
    if (!this.cine?.isConnected) {
      this.cine = el('div', 'cinema');
      this.hud.after(this.cine);
    }
    const c = this.cine;
    c.classList.add('on');
    this.canvas?.classList.add('bt');
    clearTimeout(this.cineTimer);
    this.cineTimer = window.setTimeout(() => {
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
    setTimeout(() => node.remove(), 2600);
  }

  /** A fight was won: its grade is stamped across the top of the screen with the points it earned. */
  stamp(rank: Rank, points: number) {
    this.root.querySelectorAll('.stamp').forEach((x) => x.remove());
    const node = el('div', 'stamp');
    node.innerHTML = `<div class="big">${px(rank, RANK_COLOR[rank], { small: true, scale: 4 })}</div><div class="col">${px('RANK', E.white, { small: true })}${px(`+${points}`, E.yellow, { small: true })}</div>`;
    this.root.appendChild(node);
    setTimeout(() => node.remove(), 2300);
  }

  toast(text: string, ms = 1300) {
    const node = $('.toast', this.hud);
    node.innerHTML = `<div class="panel">${px(text, E.white)}</div>`;
    node.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => node.classList.remove('show'), ms);
  }

  banner(kicker: string, big: string, en: string, subtitle: string, ms = 2200) {
    const b = el('div', 'banner');
    b.innerHTML = `${px(kicker, GREY)}${px(big, E.white, { scale: 2 })}${px(en, ACCENT, { small: true })}<div class="rule"></div>${px(subtitle, GREY)}`;
    this.root.appendChild(b);
    setTimeout(() => b.classList.add('out'), ms);
    setTimeout(() => b.remove(), ms + 600);
  }

  chestReward(c: Choice, run: RunState) {
    const info = this.describe(c, run);
    this.root.querySelectorAll('.chest').forEach((x) => x.remove());
    const b = el('div', 'chest panel');
    b.innerHTML = `<div class="ic">${this.iconFor(info, 2)}</div><div class="col">${px('获得', E.yellow)}${px(info.name, E.white)}${px(info.tag, info.tagColor)}</div>`;
    this.root.appendChild(b);
    setTimeout(() => b.remove(), 1900);
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
    setTimeout(() => node.remove(), 2200);
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
        return { icon: `gun-${c.id}`, name: w.name, tag: run.weapons.length >= 2 ? '替换手中武器' : '新武器', tagColor: E.yellow, desc: `${w.desc}。数量+1：${m.count}，穿透：${m.pierce}`, rarity: 'rare' };
      }
      case 'weapon-up': {
        const w = run.weapons[c.index];
        return { icon: `gun-${w.def.id}`, name: `${w.def.name}强化`, tag: `Lv${w.level}→${w.level + 1}`, tagColor: E.cyan, desc: `伤害+30%${w.level + 1 === 3 || w.level + 1 === 5 ? '，数量+1' : ''}（上限${MAX_WEAPON_LEVEL}级）`, rarity: 'common' };
      }
      case 'pet': {
        const p = PETS[c.kind];
        return { icon: `pet-${c.kind}`, name: p.name, tag: '宠物', tagColor: E.pink, desc: `${p.desc}，继承你${Math.round(run.mods.petInherit * 100)}%的加成`, rarity: 'epic' };
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

  /** Level-up picker: arrow keys or mouse move the red diamond, 1-4 / Enter / click choose. */
  /**
   * A pick-one panel. Arrow keys or the mouse move the red diamond; 1-4, Enter or a click choose.
   * With `skip`, a last row lets you take nothing (also Esc); onPick then gets -1.
   */
  choices(title: string, sub: string, items: Choice[], run: RunState, onPick: (i: number) => void, o: { tag?: string; skip?: string } = {}) {
    if (this.choiceKeys) window.removeEventListener('keydown', this.choiceKeys);
    this.root.querySelectorAll('.overlay.picker').forEach((x) => x.remove());
    const ov = el('div', 'overlay picker');
    const box = el('div', 'lvlup panel');
    box.innerHTML = `<div class="head"><span class="tagred">${px(o.tag ?? 'LEVEL UP', E.white, { small: true, outline: false })}</span>${px(title, E.yellow, { scale: 2 })}${px(sub, GREY)}</div>`;
    const rows: HTMLElement[] = [];
    const values: number[] = [];
    let sel = 0;
    const select = (i: number) => {
      sel = i;
      rows.forEach((r, k) => r.classList.toggle('sel', k === i));
    };
    const addRow = (row: HTMLElement, value: number) => {
      const k = rows.length;
      row.addEventListener('mouseenter', () => {
        if (sel !== k) audio.hover();
        select(k);
      });
      row.addEventListener('click', () => pick(value));
      box.appendChild(row);
      rows.push(row);
      values.push(value);
    };
    items.forEach((c, i) => {
      const d = this.describe(c, run);
      const opt = el('div', 'opt');
      opt.innerHTML = `<div class="cur">${diamond()}</div>
        <div class="ic ${d.rarity}">${this.iconFor(d, (ICON_SIZE[d.icon]?.[0] ?? 99) * 2 <= 32 ? 2 : 1)}</div>
        <div class="txt"><div class="l1">${px(d.name, E.white)}${d.tag ? px(d.tag, d.tagColor, {}, 'tag') : ''}</div>${pxBlock(d.desc, DIM, 286)}</div>
        <div class="k">${px(String(i + 1), DIM, { small: true })}</div>`;
      addRow(opt, i);
    });
    if (o.skip) {
      const row = el('div', 'opt skip');
      row.innerHTML = `<div class="cur">${diamond()}</div><div class="txt">${px(o.skip, GREY)}</div><div class="k">${px('Esc', DIM, { small: true })}</div>`;
      addRow(row, -1);
    }
    select(0);
    ov.appendChild(box);
    let done = false;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key) - 1;
      if (n >= 0 && n < items.length) pick(n);
      else if (e.key === 'Escape' && o.skip) pick(-1);
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        select((sel + 1) % rows.length);
        audio.hover();
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        select((sel + rows.length - 1) % rows.length);
        audio.hover();
      } else if (e.key === 'Enter' || e.key === ' ') pick(values[sel]);
    };
    const pick = (i: number) => {
      if (done) return;
      done = true;
      this.closedAt = performance.now();
      window.removeEventListener('keydown', onKey);
      if (this.choiceKeys === onKey) this.choiceKeys = undefined;
      ov.remove();
      audio.select();
      onPick(i);
    };
    this.choiceKeys = onKey;
    window.addEventListener('keydown', onKey);
    this.root.appendChild(ov);
  }

  /** When a pick panel last closed, so the same Esc press doesn't also open the pause menu. */
  closedAt = 0;

  push(node: HTMLElement, onKey?: (e: KeyboardEvent) => void): Layer {
    this.root.appendChild(node);
    const layer = { el: node, onKey, openedAt: performance.now() };
    this.layers.push(layer);
    return layer;
  }

  close(layer: Layer, fadeMs = 0) {
    this.layers = this.layers.filter((l) => l !== layer);
    if (!fadeMs) return layer.el.remove();
    layer.el.classList.add('out');
    setTimeout(() => layer.el.remove(), fadeMs);
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
        <div class="hint">${px('↑↓ 选择　Enter 确认', DIM)}</div>
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
    const rows = [menuRow('继续游戏', { note }), menuRow('开始冒险'), menuRow('排行榜'), menuRow('游戏说明'), menuRow('图鉴'), menuRow('设置')];
    ['continue', 'new', 'board', 'guide', 'codex', 'settings'].forEach((k, i) => (rows[i].dataset.k = k));
    ov.querySelector('.menu')!.append(...rows);
    ov.querySelector('.menu')!.after(painting.caption);
    let tabs: CodexTab[] | undefined;
    const leave = (go: () => void) => {
      this.close(layer, 250);
      go();
    };
    const nav = new MenuNav(
      rows,
      (i) => {
        audio.select();
        if (i === 0) leave(a.onContinue);
        else if (i === 1) {
          if (a.save()) confirmBox(this, '已有一局存档。开始新的冒险会覆盖它，确定吗？', () => leave(a.onNew));
          else leave(a.onNew);
        } else if (i === 2) openBoard(this);
        else if (i === 3) openHelp(this);
        else if (i === 4) openCodex(this, (tabs ??= a.codex()));
        else openSettings(this);
      },
      [!save],
    );
    nav.onFocus = (i) => painting.setCaption(i);
    nav.select(save ? 0 : 1);
    const layer = this.push(ov, (e) => nav.key(e));
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
    const hero = `<div class="ps-hero">${icon('knight', 2)}<div class="ps-bars">${row(Math.max(0, run.hp), m.maxHp, 'heart', 'heart-empty')}${row(run.armor, m.maxArmor, 'armor', 'armor-empty')}${bar('xp', run.xp, run.xpNext, `LV${run.xpLevel}`)}</div></div>`;
    const statGrid = `<div class="ps-stats">${stats.map(([k, v]) => `<div class="st">${px(k, DIM)}${px(v, E.white, { small: true })}</div>`).join('')}</div>${elems.length ? `<div class="ps-line">${px('元素', DIM)}${px(elems.join('  '), E.white)}</div>` : ''}`;
    const guns = run.weapons
      .map((w, i) => `<div class="ps-item">${icon(`gun-${w.def.id}`)}${px(w.def.name, E.white)}${px(`Lv${w.level}`, E.yellow, { small: true })}${px(i === run.held ? '主' : '副', i === run.held ? E.cyan : DIM)}${w.def.mag ? px(`弹匣${Math.round(w.def.mag * m.mag)}`, DIM) : ''}</div>`)
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
    const pets = run.pets.length ? run.pets.map((p) => `<div class="ps-item">${icon(`pet-${p}`)}${px(PETS[p].name, E.white)}</div>`).join('') : px('还没有宠物', DIM);
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
      <div class="ps-right panel">
        <div class="ps-top">${px(`第${floorNo}层 · ${info.floorName}`, E.yellow)}${px(`房间 ${info.roomsCleared}/${info.roomsTotal}`, GREY)}${px(`击杀 ${run.kills}`, GREY)}${px(`用时 ${fmtTime(run.elapsed)}`, GREY)}</div>
        <div class="ps-cols">
          <div class="ps-col">${sec('角色', hero)}${sec('属性', statGrid)}</div>
          <div class="ps-col">${sec('武器', guns)}${sec('法术', `<div class="ps-two">${spells}</div>`)}${sec('宠物', `<div class="ps-row">${pets}</div>`)}</div>
        </div>
        ${sec('加成', `<div class="build">${upgrades}</div>`, 'wide')}
      </div>`;
    const rows = [menuRow('继续游戏', { key: 'Esc' }), menuRow('游戏说明'), menuRow('图鉴'), menuRow('设置'), menuRow('返回主页', { note: '自动存档' })];
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
      else confirmBox(this, '返回主页？进度会自动存档，之后可以在主页继续游戏。', () => {
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
    const rank = info.rank === 1 ? px('新纪录！排行榜第 1 名', E.yellow) : info.rank > 0 && info.rank <= 10 ? px(`排行榜第 ${info.rank} 名`, E.white) : '';
    ov.innerHTML = `<div class="box panel endbox">
      <div class="head"><span class="tagred">${px(victory ? 'CLEAR' : 'DEAD', E.white, { small: true, outline: false })}</span>${px(victory ? '这一次，他活了下来' : '阿多尼斯倒下了', victory ? E.yellow : ACCENT, { scale: 2 })}</div>
      ${px(victory ? '野猪倒下了，银莲花开满了地牢。' : '血落处开出银莲花，他会再次重生。', GREY)}
      <div class="statgrid">${stat(`${run.level + 1}/${LEVELS}`, '层数')}${stat(String(run.kills), '击杀')}${stat(String(run.xpLevel), '等级')}${stat(fmtTime(run.elapsed), '用时')}</div>
      <div class="score">${px(`得分 ${info.score}`, E.yellow)}${px(DIFFICULTIES[run.diff.id].name, GREY)}${rank}</div>
      <div class="netrank"></div>
      <div class="dmg">${rows}</div>
      <div class="menu row2"></div></div>`;
    const items = [menuRow('再次重生', { key: 'R' }), menuRow('返回主页')];
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
