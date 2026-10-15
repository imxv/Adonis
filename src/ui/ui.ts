import { RARITY_INFO, UPGRADE_BY_ID } from '../data/upgrades';
import { WEAPONS, STAT_MEANING, MAX_WEAPON_LEVEL } from '../data/weapons';
import { SPELLS } from '../data/spells';
import { PETS } from '../data/enemies';
import type { StyleKit } from '../styles/types';
import type { Choice, RunState } from '../game/run';
import type { Dir } from '../game/dirs';
import { ICONS, ICON_SIZE } from '../styles/textures';
import { E } from '../pixel/palette';
import { Grid, pxMeasure, pxText } from '../pixel/draw';
import { audio } from '../audio/audio';

/** The UI is laid out on the same 480x270 pixel grid as the game and zoomed with it. */
export const UI_W = 480;
export const UI_H = 270;

const GREY = E.grey;
const DIM = E.greyM;
const ACCENT = E.hot;

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

function el(tag: string, cls?: string, html?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// ---------------------------------------------------------------- pixel text and icons as <img>

interface PxOpts {
  small?: boolean;
  scale?: number;
  outline?: string | false;
  shadow?: string;
}

const pxCache = new Map<string, { src: string; w: number; h: number }>();

function pxImg(text: string, color: string, o: PxOpts) {
  const key = `${text}|${color}|${o.small ? 1 : 0}|${o.scale ?? 1}|${o.outline ?? ''}|${o.shadow ?? ''}`;
  let hit = pxCache.get(key);
  if (!hit) {
    const c = pxText(text, {
      color,
      small: o.small,
      size: (o.small ? 8 : 12) * (o.scale ?? 1),
      outline: o.outline === false ? undefined : (o.outline ?? E.ink),
      shadow: o.shadow,
    });
    hit = { src: c.toDataURL(), w: c.width, h: c.height };
    pxCache.set(key, hit);
  }
  return hit;
}

/** One line of pixel text as an image, sized in UI pixels. */
function px(text: string, color: string = E.white, o: PxOpts = {}, cls = ''): string {
  if (!text) return '';
  const h = pxImg(text, color, o);
  return `<img class="px ${cls}" src="${h.src}" style="width:${h.w}px;height:${h.h}px" alt="">`;
}

/** Break text into lines that fit `maxW`, keeping numbers and Latin words whole. */
function wrap(text: string, maxW: number): string[] {
  const tokens = text.match(/[A-Za-z0-9+\-%.:/→×~]+|\s+|./gu) ?? [];
  const lines: string[] = [];
  let cur = '';
  for (const tk of tokens) {
    const next = cur + tk;
    if (cur.trim() && pxMeasure(next) > maxW && !/^[，。、；：！？）,.;:!?)]/.test(tk)) {
      lines.push(cur.trimEnd());
      cur = tk.trimStart();
    } else cur = next;
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines;
}

function pxBlock(text: string, color: string, maxW: number): string {
  return `<div class="lines">${wrap(text, maxW - 2)
    .map((l) => px(l, color))
    .join('')}</div>`;
}

function icon(name: string, scale = 1, cls = ''): string {
  const src = ICONS[name];
  if (!src) return '';
  const [w, h] = ICON_SIZE[name];
  return `<img class="px ${cls}" src="${src}" style="width:${w * scale}px;height:${h * scale}px" alt="">`;
}

let diamondSrc = '';
/** ACHROMA-style red diamond cursor. */
function diamond(): string {
  if (!diamondSrc) diamondSrc = Grid.ascii(['..r..', '.rrr.', 'rrwrr', '.rRr.', '..R..']).render({ outline: false, margin: 0 }).toDataURL();
  return `<img class="px dia" src="${diamondSrc}" style="width:5px;height:5px" alt="">`;
}

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
  guns: { id: string; name: string; level: number; held: boolean }[];
  gunCd: number;
  skill: number;
  skillActive: boolean;
  spells: { id: string; level: number; evolved: boolean }[];
  pets: string[];
  level: number;
  styleName: string;
  timer: number;
  kills: number;
  combo: number;
  map: MapCell[];
  boss?: { name: string; ratio: number; phaseMark: number };
}

const BAR_W = 52;
const BOSS_W = 200;
const CELL_W = 9;
const CELL_H = 7;
const FLOOR_NAMES = ['一', '二', '三', '四'];

class UI {
  root!: HTMLElement;
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
        <div class="row">${icon('heart')}<div class="bar hp"><i></i></div><span class="n" data-n="hp"></span></div>
        <div class="row">${icon('armor')}<div class="bar ar"><i></i></div><span class="n" data-n="ar"></span></div>
        <div class="row">${icon('xp')}<div class="bar xp"><i></i></div><span class="n" data-n="xp"></span></div>
      </div>
      <div class="gear"></div>
      <div class="spells"></div>
      <div class="tr"><div class="mmwrap panel"><canvas class="mm" width="1" height="1"></canvas></div><div class="sname"></div><div class="kills"></div></div>
      <div class="timer"></div>
      <div class="bossbar"><div class="bname"></div><div class="bar"><i></i><b></b></div></div>
      <div class="combo"></div>
      <div class="toast"></div>`;
    this.hud.style.opacity = '0';
    this.root.appendChild(this.hud);
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
    bar('hp', d.hp, d.maxHp);
    bar('ar', d.armor, d.maxArmor);
    bar('xp', d.xp, d.xpNext);
    this.set('[data-n=hp]', px(`${Math.max(0, d.hp)}/${d.maxHp}`, E.white, { small: true }));
    this.set('[data-n=ar]', px(`${d.armor}/${d.maxArmor}`, E.white, { small: true }));
    this.set('[data-n=xp]', px(`LV${d.xpLevel}`, E.cyan, { small: true }));

    const held = d.guns.find((g) => g.held);
    const guns = d.guns
      .map((g) => `<div class="slot panel ${g.held ? 'held' : ''}">${icon(`gun-${g.id}`)}${g.held ? '<i class="cd"></i>' : ''}${g.level > 1 ? `<span class="lv">${px(String(g.level), E.yellow, { small: true })}</span>` : ''}</div>`)
      .join('');
    const skill = `<div class="slot panel skill ${d.skillActive ? 'on' : ''}">${px('双持', d.skillActive ? E.cyan : E.white)}<i class="cd" data-skill></i><span class="key">${px('E', DIM, { small: true })}</span></div>`;
    const name = held ? `<div class="gname">${px(held.name, GREY)}${d.guns.length > 1 ? px('Q换枪', DIM) : ''}</div>` : '';
    this.set('.gear', `<div class="slots">${guns}${skill}</div>${name}`);
    const cd = $('.slot.held .cd', this.hud) as HTMLElement | null;
    if (cd) cd.style.height = `${Math.round(d.gunCd * 16)}px`;
    const scd = $('[data-skill]', this.hud) as HTMLElement | null;
    if (scd) scd.style.height = `${Math.round((1 - d.skill) * 16)}px`;

    const spells = d.spells.map((s) => `<div class="sp panel ${s.evolved ? 'evo' : ''}">${icon(`spell-${s.id}`)}<span class="lv">${px(s.evolved ? '★' : String(s.level), E.yellow, { small: !s.evolved })}</span></div>`).join('');
    const pets = d.pets.map((p) => `<div class="sp panel pet">${icon(`pet-${p}`)}</div>`).join('');
    this.set('.spells', spells + pets);

    this.drawMap(d.map);
    this.set('.sname', px(`${FLOOR_NAMES[d.level]}层 ${d.styleName}`, GREY));
    this.set('.kills', px(`KILL ${d.kills}`, DIM, { small: true }));

    const tt = d.timer > 0 ? `${String(Math.floor(d.timer / 60)).padStart(2, '0')}:${String(Math.floor(d.timer % 60)).padStart(2, '0')}` : '';
    this.set('.timer', tt ? `${px('坚持住', E.yellow)}${px(tt, E.white, { small: true, scale: 2 })}` : '');

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

  describe(c: Choice, run: RunState): { icon: string; name: string; tag: string; tagColor: string; desc: string; rarity: string } {
    switch (c.type) {
      case 'upgrade': {
        const have = run.stacks[c.def.id] ?? 0;
        const r = RARITY_INFO[c.def.rarity];
        return { icon: `glyph:${c.def.glyph}:${r.color}`, name: c.def.name, tag: have ? `${r.name} ${have}/${c.def.max}` : `${r.name}`, tagColor: r.color, desc: c.def.desc, rarity: c.def.rarity };
      }
      case 'spell-new': {
        const s = SPELLS[c.id];
        return { icon: `spell-${c.id}`, name: s.name, tag: '新法术', tagColor: E.yellow, desc: s.desc, rarity: 'rare' };
      }
      case 'spell-up': {
        const s = SPELLS[c.id];
        const inst = run.spells.find((x) => x.id === c.id);
        const lv = inst?.level ?? 1;
        return { icon: `spell-${c.id}`, name: s.name, tag: `Lv${lv}→${lv + 1}`, tagColor: E.cyan, desc: s.levels[lv - 1] ?? '强化', rarity: 'common' };
      }
      case 'evolve': {
        const s = SPELLS[c.id];
        return { icon: `spell-${c.id}`, name: s.evolved.name, tag: '进化', tagColor: E.yellow, desc: s.evolved.desc, rarity: 'legendary' };
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
        <div class="ic ${d.rarity}">${this.iconFor(d, (ICON_SIZE[d.icon]?.[0] ?? 99) * 2 <= 28 ? 2 : 1)}</div>
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

  title(onStart: () => void) {
    const ov = el('div', 'overlay title');
    const logo = (col: string, cls: string) => px('ADONIS', col, { small: true, scale: 5, outline: false }, cls);
    ov.innerHTML = `
      <div class="logo">${logo(ACCENT, 'r')}${logo(E.cyan, 'c')}${logo(E.white, 'w')}</div>
      <div class="sub">${px('画 中 轮 回', ACCENT)}</div>
      <div class="scene">${icon('knight', 3)}<div class="vs">${px('VS', DIM, { small: true })}</div>${icon('boar', 2)}</div>
      ${px('他一次次死去，又一次次重生。', GREY)}
      ${px('这一次，穿过三层地牢，去见那头野猪。', GREY)}
      <div class="menu"><div class="item sel">${diamond()}${px('开始轮回', E.white)}</div></div>
      <div class="keys">${px('WASD 移动  鼠标 瞄准射击  空格 冲刺', DIM)}${px('Q 换枪  E/右键 双持  F 自动射击  Esc 暂停', DIM)}</div>
      <div class="ver">${px('v0.4', E.slate, { small: true, outline: false })}</div>`;
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      window.removeEventListener('keydown', onKey);
      audio.select();
      ov.classList.add('out');
      setTimeout(() => ov.remove(), 250);
      onStart();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') go();
    };
    window.addEventListener('keydown', onKey);
    ov.addEventListener('click', go);
    this.root.appendChild(ov);
  }

  pause(run: RunState, onResume: () => void) {
    const ov = el('div', 'overlay');
    const chips: string[] = [];
    run.weapons.forEach((w) => chips.push(`<div class="chip">${icon(`gun-${w.def.id}`)}${px(`${w.def.name} Lv${w.level}`, E.white)}</div>`));
    run.spells.forEach((s) => chips.push(`<div class="chip">${icon(`spell-${s.id}`)}${px(`${s.evolved ? SPELLS[s.id].evolved.name : SPELLS[s.id].name} Lv${s.level}`, E.white)}</div>`));
    run.pets.forEach((p) => chips.push(`<div class="chip">${icon(`pet-${p}`)}${px(PETS[p].name, E.white)}</div>`));
    for (const [id, n] of Object.entries(run.stacks)) chips.push(`<div class="chip">${px(`${UPGRADE_BY_ID[id]?.name ?? id} ×${n}`, GREY)}</div>`);
    ov.innerHTML = `<div class="box panel"><div class="head"><span class="tagred">${px('PAUSE', E.white, { small: true, outline: false })}</span>${px('暂停', E.yellow, { scale: 2 })}</div>
      <div class="build">${chips.join('')}</div>
      <div class="menu"><div class="item sel btn">${diamond()}${px('继续', E.white)}${px('Esc', DIM, { small: true })}</div></div></div>`;
    $('.btn', ov).addEventListener('click', () => {
      ov.remove();
      onResume();
    });
    this.root.appendChild(ov);
    return () => ov.remove();
  }

  end(victory: boolean, run: RunState, onRestart: () => void) {
    const ov = el('div', 'overlay');
    const secs = Math.round(run.elapsed);
    const total = Object.values(run.damage).reduce((a, b) => a + b, 0) || 1;
    const rows = Object.entries(run.damage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => `<div class="row"><div class="nm">${px(k, GREY)}</div><div class="b" style="width:${Math.max(2, Math.round((v / total) * 150))}px"></div>${px(`${Math.round((v / total) * 100)}%`, DIM, { small: true })}</div>`)
      .join('');
    const stat = (v: string, label: string) => `<div>${px(v, E.yellow, { small: true, scale: 2 })}${px(label, DIM)}</div>`;
    ov.innerHTML = `<div class="box panel endbox">
      <div class="head"><span class="tagred">${px(victory ? 'CLEAR' : 'DEAD', E.white, { small: true, outline: false })}</span>${px(victory ? '这一次，他活了下来' : '阿多尼斯倒下了', victory ? E.yellow : ACCENT, { scale: 2 })}</div>
      ${px(victory ? '野猪倒下了，银莲花开满了地牢。' : '血落处开出银莲花，他会再次重生。', GREY)}
      <div class="statgrid">${stat(`${run.level + 1}/3`, '层数')}${stat(String(run.kills), '击杀')}${stat(String(run.xpLevel), '等级')}${stat(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, '用时')}</div>
      <div class="dmg">${rows}</div>
      <div class="menu"><div class="item sel btn">${diamond()}${px('再次重生', E.white)}${px('R', DIM, { small: true })}</div></div></div>`;
    const go = () => {
      window.removeEventListener('keydown', onKey);
      ov.remove();
      audio.select();
      onRestart();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R' || e.key === 'Enter') go();
    };
    window.addEventListener('keydown', onKey);
    $('.btn', ov).addEventListener('click', go);
    this.root.appendChild(ov);
  }
}

export const ui = new UI();
