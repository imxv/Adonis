import { audio } from '../audio/audio';
import { DIFFICULTIES, type DifficultyId } from '../data/difficulty';
import { E } from '../pixel/palette';
import { topScores, type ScoreEntry } from '../save';
import { DEFAULT_SETTINGS, settings, type Settings } from '../settings';
import type { CodexEntry, CodexTab, Pic } from './codex';
import { diamond, el, img, px, pxBlock } from './pxhtml';

const GREY = E.grey;
const DIM = E.greyM;
const HOT = E.hot;

/** What a screen needs from the UI: a layer stack that owns the keyboard. */
export interface Layer {
  el: HTMLElement;
  onKey?: (e: KeyboardEvent) => void;
  /** performance.now() when it opened: a layer only hears keys pressed after that. */
  openedAt: number;
}

export interface LayerHost {
  push(el: HTMLElement, onKey?: (e: KeyboardEvent) => void): Layer;
  close(layer: Layer): void;
  /** Note that an Esc was used here, so the game doesn't also act on it. */
  escUsed(): void;
}

const isBack = (e: KeyboardEvent) => e.key === 'Escape' || e.key === 'Backspace';
const isUp = (e: KeyboardEvent) => e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
const isDown = (e: KeyboardEvent) => e.key === 'ArrowDown' || e.key === 's' || e.key === 'S';
const isLeft = (e: KeyboardEvent) => e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A';
const isRight = (e: KeyboardEvent) => e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D';
const isOk = (e: KeyboardEvent) => e.key === 'Enter' || e.key === ' ';

/**
 * A vertical menu with the red diamond cursor: arrow keys or W/S move, Enter or Space picks,
 * the mouse hovers and clicks. Disabled rows are skipped.
 */
export class MenuNav {
  sel = 0;

  constructor(
    private rows: HTMLElement[],
    private pick: (i: number) => void,
    private disabled: boolean[] = [],
  ) {
    rows.forEach((row, i) => {
      row.classList.toggle('off', !!disabled[i]);
      row.addEventListener('mouseenter', () => {
        if (disabled[i] || this.sel === i) return;
        audio.hover();
        this.select(i);
      });
      row.addEventListener('click', () => {
        if (disabled[i]) return;
        this.select(i);
        pick(i);
      });
    });
    this.select(this.disabled[0] ? this.next(0, 1) : 0);
  }

  private next(from: number, step: number) {
    let i = from;
    for (let n = 0; n < this.rows.length; n++) {
      i = (i + step + this.rows.length) % this.rows.length;
      if (!this.disabled[i]) return i;
    }
    return from;
  }

  select(i: number) {
    this.sel = i;
    this.rows.forEach((r, k) => r.classList.toggle('sel', k === i));
  }

  /** Returns true if the key was a menu key. */
  key(e: KeyboardEvent): boolean {
    if (isUp(e)) this.select(this.next(this.sel, -1));
    else if (isDown(e)) this.select(this.next(this.sel, 1));
    else if (isOk(e)) {
      if (!this.disabled[this.sel]) this.pick(this.sel);
      return true;
    } else return false;
    audio.hover();
    return true;
  }
}

/** A menu row: diamond, label, optional grey note and key hint. */
export function menuRow(label: string, opts: { note?: string; key?: string; color?: string } = {}) {
  return el('div', 'item', `${diamond()}${px(label, opts.color ?? E.white)}${opts.note ? px(opts.note, DIM) : ''}${opts.key ? `<span class="kh">${px(opts.key, DIM, { small: true })}</span>` : ''}`);
}

/** The shared frame of full-screen pages: tag, title, and a back button. */
function frame(tag: string, title: string, cls: string) {
  const ov = el('div', `overlay screen ${cls}`);
  ov.innerHTML = `<div class="frame panel"><div class="fhead"><span class="tagred">${px(tag, E.white, { small: true, outline: false })}</span>${px(title, E.yellow, { scale: 2 })}<div class="fsub"></div><div class="back">${diamond()}${px('返回', E.white)}${px('Esc', DIM, { small: true })}</div></div><div class="fbody"></div></div>`;
  return ov;
}

function openFrame(host: LayerHost, ov: HTMLElement, onKey: (e: KeyboardEvent) => void, onClose?: () => void) {
  const layer = host.push(ov, (e) => {
    if (isBack(e)) {
      e.preventDefault();
      close();
      host.escUsed();
      return;
    }
    onKey(e);
  });
  const close = () => {
    audio.select();
    host.close(layer);
    onClose?.();
  };
  ov.querySelector('.back')!.addEventListener('click', close);
  return close;
}

// ---------------------------------------------------------------- codex

const CELL = 22;

function picHtml(p: Pic, maxW: number, maxH: number, maxScale: number) {
  const s = Math.max(1, Math.min(maxScale, Math.floor(Math.min(maxW / p.w, maxH / p.h))));
  return img(p.src, p.w, p.h, s);
}

function iconHtml(entry: CodexEntry, big: boolean) {
  const ic = entry.icon;
  if ('glyph' in ic) return px(ic.glyph, ic.color, { scale: big ? 3 : 1 });
  const art = big ? (entry.art ?? ic) : ic;
  return big ? picHtml(art, 144, 96, 3) : picHtml(art, CELL, CELL, 2);
}

function detailHtml(e: CodexEntry, width: number) {
  const parts: string[] = [];
  parts.push(`<div class="cx-top"><div class="cx-art">${iconHtml(e, true)}</div><div class="cx-name">${px(e.name, E.white, { scale: 2 })}${e.tag ? px(e.tag, e.tagColor ?? GREY) : ''}</div></div>`);
  parts.push(`<div class="cx-desc">${pxBlock(e.desc, GREY, width)}</div>`);
  if (e.stats?.length) parts.push(`<div class="cx-stats">${e.stats.map(([k, v]) => `<div class="st">${px(k, DIM)}${px(v, E.white)}</div>`).join('')}</div>`);
  for (const s of e.sections ?? []) parts.push(`<div class="cx-sec">${px(s.title, E.yellow)}${s.lines.map((l) => pxBlock(l, GREY, width)).join('')}</div>`);
  if (e.gallery) parts.push(`<div class="cx-sec">${px(e.gallery.title, E.yellow)}<div class="cx-gal">${e.gallery.pics.map((p) => `<div class="g">${picHtml(p, 40, 40, 1)}</div>`).join('')}</div></div>`);
  return parts.join('');
}

export function openCodex(host: LayerHost, tabs: CodexTab[]) {
  const ov = frame('CODEX', '图鉴', 'codex');
  const total = tabs.reduce((n, t) => n + t.entries.length, 0);
  ov.querySelector('.fsub')!.innerHTML = px(`共 ${total} 条`, DIM);
  const body = ov.querySelector('.fbody') as HTMLElement;
  body.innerHTML = `<div class="cx-tabs">${tabs.map((t, i) => `<div class="cx-tab" data-i="${i}">${px(t.name, E.white)}${px(String(t.entries.length), DIM, { small: true })}</div>`).join('')}</div><div class="cx-main"><div class="cx-grid"></div><div class="cx-detail"></div></div>`;
  const grid = body.querySelector('.cx-grid') as HTMLElement;
  const detail = body.querySelector('.cx-detail') as HTMLElement;
  const tabEls = [...body.querySelectorAll<HTMLElement>('.cx-tab')];
  const COLS = 6;
  let tab = 0;
  let sel = 0;
  let cells: HTMLElement[] = [];

  const show = (i: number) => {
    sel = i;
    cells.forEach((c, k) => c.classList.toggle('sel', k === i));
    detail.innerHTML = detailHtml(tabs[tab].entries[i], 246);
    detail.scrollTop = 0;
  };
  const openTab = (t: number) => {
    tab = (t + tabs.length) % tabs.length;
    tabEls.forEach((el, k) => el.classList.toggle('sel', k === tab));
    grid.innerHTML = tabs[tab].entries.map((e) => `<div class="cx-cell">${iconHtml(e, false)}</div>`).join('');
    cells = [...grid.querySelectorAll<HTMLElement>('.cx-cell')];
    cells.forEach((c, i) => {
      c.addEventListener('mouseenter', () => {
        if (sel !== i) {
          audio.hover();
          show(i);
        }
      });
      c.addEventListener('click', () => show(i));
    });
    show(0);
  };
  tabEls.forEach((el, i) =>
    el.addEventListener('click', () => {
      audio.hover();
      openTab(i);
    }),
  );
  openTab(0);
  openFrame(host, ov, (e) => {
    const n = tabs[tab].entries.length;
    const digit = Number(e.key);
    if (digit >= 1 && digit <= tabs.length) openTab(digit - 1);
    else if (e.key === 'q' || e.key === 'Q' || e.key === 'PageUp' || (e.key === 'Tab' && e.shiftKey)) openTab(tab - 1);
    else if (e.key === 'e' || e.key === 'E' || e.key === 'PageDown' || e.key === 'Tab') openTab(tab + 1);
    else if (isLeft(e)) show((sel - 1 + n) % n);
    else if (isRight(e)) show((sel + 1) % n);
    else if (isUp(e)) show(sel - COLS >= 0 ? sel - COLS : sel);
    else if (isDown(e)) show(sel + COLS < n ? sel + COLS : sel);
    else return;
    e.preventDefault();
    audio.hover();
  });
}

// ---------------------------------------------------------------- how to play

const GUIDE: { name: string; rows: [string, string][] }[] = [
  {
    name: '操作',
    rows: [
      ['WASD', '移动'],
      ['鼠标', '瞄准，按住左键射击；近战武器踩拍出招更强（见「节奏」）'],
      ['空格', '冲刺，冲刺途中无敌'],
      ['Q / 滚轮', '换枪，最多带两把'],
      ['E / 右键', '双持：两把枪同时开火 4 秒，冷却 14 秒'],
      ['R', '换弹；弹匣打空也会自动换，收起的副武器会在后台换弹'],
      ['F', '自动射击开关'],
      ['Esc', '暂停；在三选一面板里是跳过'],
    ],
  },
  {
    name: '地牢',
    rows: [
      ['五层', '每层一种随机画风，第五层的 Boss 是那头野猪；越往下怪越多越凶'],
      ['战斗房', '走进去门会关上，清完两三波敌人才开门'],
      ['尸潮房', '坚持 20 到 28 秒，撑到最后有两个宝箱'],
      ['宝物房', '三件宝物只能拿一件'],
      ['Boss 房', '在最深处；打倒 Boss 后走进地洞去下一层'],
      ['小地图', '右上角：白色是你所在，红点 Boss，黄点宝物'],
    ],
  },
  {
    name: '成长',
    rows: [
      ['经验', '击杀掉宝石，攒满就升级，四选一或跳过'],
      ['法术', '自动施放，最多四个；满 5 级加对应加成可进化'],
      ['融合', '特定的两个法术都到 3 级会自动融合成更强的法术，空出一个栏位'],
      ['加成', '只改属性，对所有武器和法术都生效'],
      ['宝箱', '金色直接给奖励；钢制武器箱三选一换枪'],
      ['宠物', '宝物房里获得，最多三只，继承你的部分加成'],
      ['护甲', '2 秒没受伤就会一格一格恢复'],
    ],
  },
  {
    name: '节奏',
    rows: [
      ['近战专属', '手持近战武器时底部出现节拍条，刻度和菱形重合就是拍点'],
      ['踩拍出招', '在拍点上按左键，这一下伤害更高（完美 1.5 倍，不错 1.25 倍）'],
      ['连段', '每把近战武器有三四段连招，连续出手会打到最后一段终结技'],
      ['节拍终结', '终结技踩在拍点上，范围更大、伤害再乘 1.5 倍'],
      ['连拍', '连续踩拍每拍近战伤害 +2%，最多 +40%，错拍就断'],
      ['冲刺', '拿着近战武器踩拍冲刺，会在起点炸开冲击波'],
      ['评级', '击杀推高 D→SS 评级，评级越高得分越多；清房盖章计分'],
      ['敌人', '射手亮出预警线后下一拍开枪：踩着拍子闪开'],
    ],
  },
  {
    name: '战斗',
    rows: [
      ['元素', '火点燃，冰减速并叠三层冻结，电会传给附近敌人'],
      ['蒸发', '火遇冰：立刻追加一次同等伤害'],
      ['碎裂', '电遇冻结：双倍伤害，并溅出冰晶'],
      ['过载', '火遇电：小范围爆炸'],
      ['掩体', '柱子和墙能挡子弹，也能挡守卫的光臂'],
      ['机关', '地刺和锯片也伤怪物，可以把怪引过去'],
      ['盾兵', '正面挡子弹，绕到侧面或用光束、电磁枪、爆炸'],
    ],
  },
];

export function openHelp(host: LayerHost) {
  const ov = frame('GUIDE', '游戏说明', 'guide');
  const body = ov.querySelector('.fbody') as HTMLElement;
  body.innerHTML = `<div class="cx-tabs">${GUIDE.map((p, i) => `<div class="cx-tab" data-i="${i}">${px(p.name, E.white)}</div>`).join('')}</div><div class="gd-page"></div>`;
  const tabEls = [...body.querySelectorAll<HTMLElement>('.cx-tab')];
  const page = body.querySelector('.gd-page') as HTMLElement;
  let cur = 0;
  const show = (i: number) => {
    cur = (i + GUIDE.length) % GUIDE.length;
    tabEls.forEach((el, k) => el.classList.toggle('sel', k === cur));
    page.innerHTML = GUIDE[cur].rows.map(([k, v]) => `<div class="gd-row"><div class="gk">${px(k, E.yellow)}</div><div class="gv">${pxBlock(v, GREY, 300)}</div></div>`).join('');
  };
  tabEls.forEach((el, i) => el.addEventListener('click', () => show(i)));
  show(0);
  ov.querySelector('.fsub')!.innerHTML = px('← → 翻页', DIM);
  openFrame(host, ov, (e) => {
    const digit = Number(e.key);
    if (digit >= 1 && digit <= GUIDE.length) show(digit - 1);
    else if (isLeft(e) || e.key === 'q' || e.key === 'Q') show(cur - 1);
    else if (isRight(e) || e.key === 'e' || e.key === 'E' || e.key === 'Tab') show(cur + 1);
    else return;
    e.preventDefault();
    audio.hover();
  });
}

// ---------------------------------------------------------------- settings

type Row = { key: keyof Settings | 'reset'; label: string; note?: string };
const SETTING_ROWS: Row[] = [
  { key: 'diff', label: '难度', note: '下一局生效' },
  { key: 'music', label: '音乐音量' },
  { key: 'sfx', label: '音效音量' },
  { key: 'light', label: '光照' },
  { key: 'shake', label: '屏幕震动' },
  { key: 'lean', label: '镜头前探' },
  { key: 'numbers', label: '伤害数字' },
  { key: 'reset', label: '恢复默认' },
];
const DIFF_ORDER: DifficultyId[] = ['easy', 'normal', 'hard'];

function valueHtml(key: Row['key'], s: Settings) {
  if (key === 'reset') return '';
  const v = s[key];
  if (key === 'music' || key === 'sfx') {
    const n = v as number;
    return `<div class="vol">${Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>${px(String(n), E.white, { small: true })}`;
  }
  const text = key === 'diff' ? DIFFICULTIES[v as DifficultyId].name : v ? '开' : '关';
  return `${px('◀', DIM)}${px(text, v === false ? DIM : E.white)}${px('▶', DIM)}`;
}

export function openSettings(host: LayerHost) {
  const ov = frame('SETTINGS', '设置', 'settings');
  const body = ov.querySelector('.fbody') as HTMLElement;
  ov.querySelector('.fsub')!.innerHTML = px('↑↓ 选择　← → 调整', DIM);
  body.innerHTML = `<div class="st-list">${SETTING_ROWS.map((r) => `<div class="st-row" data-k="${r.key}">${diamond()}<div class="sl">${px(r.label, E.white)}</div><div class="sv"></div>${r.note ? px(r.note, DIM) : ''}</div>`).join('')}</div>`;
  const rows = [...body.querySelectorAll<HTMLElement>('.st-row')];
  let sel = 0;
  const paint = () => {
    const s = settings.get();
    rows.forEach((row, i) => {
      row.classList.toggle('sel', i === sel);
      (row.querySelector('.sv') as HTMLElement).innerHTML = valueHtml(SETTING_ROWS[i].key, s);
    });
  };
  const change = (i: number, dir: number) => {
    const key = SETTING_ROWS[i].key;
    const s = settings.get();
    if (key === 'reset') settings.set({ ...DEFAULT_SETTINGS });
    else if (key === 'diff') settings.set({ diff: DIFF_ORDER[(DIFF_ORDER.indexOf(s.diff) + dir + 3) % 3] });
    else if (key === 'music' || key === 'sfx') settings.set({ [key]: Math.max(0, Math.min(10, s[key] + dir)) });
    else settings.set({ [key]: !s[key] });
    audio.select();
    paint();
  };
  rows.forEach((row, i) => {
    row.addEventListener('mouseenter', () => {
      sel = i;
      paint();
    });
    row.addEventListener('click', (ev) => {
      sel = i;
      // Clicking the left half of a slider turns it down, the right half up.
      const r = row.getBoundingClientRect();
      change(i, ev.clientX < r.left + r.width * 0.62 ? -1 : 1);
    });
  });
  paint();
  openFrame(host, ov, (e) => {
    if (isUp(e)) sel = (sel - 1 + rows.length) % rows.length;
    else if (isDown(e)) sel = (sel + 1) % rows.length;
    else if (isLeft(e)) return void change(sel, -1);
    else if (isRight(e) || isOk(e)) return void change(sel, 1);
    else return;
    e.preventDefault();
    audio.hover();
    paint();
  });
}

// ---------------------------------------------------------------- leaderboard

const fmtTime = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
const fmtDate = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function openBoard(host: LayerHost, highlight?: number) {
  const ov = frame('RANKING', '排行榜', 'board');
  const body = ov.querySelector('.fbody') as HTMLElement;
  ov.querySelector('.fsub')!.innerHTML = px('本机记录 · 前十名', DIM);
  const list: ScoreEntry[] = topScores().slice(0, 10);
  const head = ['名次', '得分', '结果', '击杀', '等级', '用时', '难度', '日期'];
  if (!list.length) body.innerHTML = `<div class="bd-empty">${px('还没有记录。去冒险吧，结束一局就会上榜。', GREY)}</div>`;
  else
    body.innerHTML = `<div class="bd-table"><div class="bd-row head">${head.map((h) => `<div>${px(h, DIM)}</div>`).join('')}</div>${list
      .map((e, i) => {
        const cells = [
          px(String(i + 1), i === 0 ? E.yellow : i < 3 ? E.white : GREY, { small: true }),
          px(String(e.score), E.yellow, { small: true }),
          px(e.victory ? '通关' : `第${['一', '二', '三'][e.floor - 1] ?? e.floor}层`, e.victory ? E.yellow : GREY),
          px(String(e.kills), E.white, { small: true }),
          px(`Lv${e.lv}`, E.white, { small: true }),
          px(fmtTime(e.secs), E.white, { small: true }),
          px(DIFFICULTIES[e.diff]?.name ?? '', e.diff === 'hard' ? HOT : GREY),
          px(fmtDate(e.date), DIM, { small: true }),
        ];
        return `<div class="bd-row ${e.date === highlight ? 'me' : ''}">${cells.map((c) => `<div>${c}</div>`).join('')}</div>`;
      })
      .join('')}</div><div class="bd-note">${pxBlock('得分 = 击杀×10 + 深入层数×1000 + 等级×50；通关再加 3000，越快加得越多；困难 ×1.3，简单 ×0.8。', DIM, 430)}</div>`;
  openFrame(host, ov, () => {});
}

// ---------------------------------------------------------------- confirm

export function confirmBox(host: LayerHost, text: string, onYes: () => void) {
  const ov = el('div', 'overlay confirm');
  const box = el('div', 'box panel');
  box.innerHTML = `${pxBlock(text, E.white, 220)}<div class="menu"></div>`;
  const menu = box.querySelector('.menu') as HTMLElement;
  const yes = menuRow('确定');
  const no = menuRow('取消');
  yes.dataset.k = 'yes';
  no.dataset.k = 'no';
  menu.append(yes, no);
  ov.appendChild(box);
  const done = (ok: boolean) => {
    host.close(layer);
    audio.select();
    if (ok) onYes();
  };
  const nav = new MenuNav([yes, no], (i) => done(i === 0));
  nav.select(1);
  const layer = host.push(ov, (e) => {
    if (isBack(e)) {
      host.escUsed();
      done(false);
    } else nav.key(e);
  });
}
