import { audio } from '../audio/audio';
import { DIFFICULTIES, type DifficultyId } from '../data/difficulty';
import { E } from '../pixel/palette';
import { topScores } from '../save';
import { fetchGlobal, playerName, setPlayerName, type BoardReply } from '../net/board';
import { DEFAULT_SETTINGS, settings, type Settings } from '../settings';
import type { CodexEntry, CodexTab, Pic } from './codex';
import { diamond, el, icon, img, px, pxBlock } from './pxhtml';
import { isTouchBrowser } from '../platform/mobile';

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

  /** Called whenever the highlight moves (the title page uses it to change the caption under its painting). */
  onFocus?: (i: number) => void;

  select(i: number) {
    this.sel = i;
    this.rows.forEach((r, k) => r.classList.toggle('sel', k === i));
    this.onFocus?.(i);
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
  ov.innerHTML = `<div class="frame panel"><div class="fhead"><span class="tagred">${px(tag, E.white, { small: true, outline: false })}</span>${px(title, E.yellow, { scale: 2 })}<div class="fsub"></div><button type="button" class="back" aria-label="返回">${diamond()}${px('返回', E.white)}${isTouchBrowser() ? '' : px('Esc', DIM, { small: true })}</button></div><div class="fbody"></div></div>`;
  return ov;
}

function openFrame(host: LayerHost, ov: HTMLElement, onKey: (e: KeyboardEvent) => void, onClose?: () => void) {
  const layer = host.push(ov, (e) => {
    if (isBack(e) || (isOk(e) && document.activeElement === ov.querySelector('.back'))) {
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
  // pxBlock attaches trailing punctuation to its line; leave a glyph of headroom.
  const textWidth = Math.max(12, width - 12);
  parts.push(`<div class="cx-top"><div class="cx-art">${iconHtml(e, true)}</div><div class="cx-name">${px(e.name, E.white, { scale: 2 })}${e.tag ? px(e.tag, e.tagColor ?? GREY) : ''}</div></div>`);
  parts.push(`<div class="cx-desc">${pxBlock(e.desc, GREY, textWidth)}</div>`);
  if (e.stats?.length) parts.push(`<div class="cx-stats">${e.stats.map(([k, v]) => `<div class="st">${px(k, DIM)}${px(v, E.white)}</div>`).join('')}</div>`);
  for (const s of e.sections ?? []) parts.push(`<div class="cx-sec">${px(s.title, E.yellow)}${s.lines.map((l) => pxBlock(l, GREY, textWidth)).join('')}</div>`);
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
  const tabStrip = body.querySelector('.cx-tabs') as HTMLElement;
  const tabEls = [...body.querySelectorAll<HTMLElement>('.cx-tab')];
  const COLS = 6;
  let tab = 0;
  let sel = 0;
  let cells: HTMLElement[] = [];
  let layoutWidth = 0;
  let layoutHeight = 0;
  let scrollPosition = 0;
  let renderFrame = 0;
  let tabFrame = 0;
  let closed = false;

  const revealTab = () => {
    cancelAnimationFrame(tabFrame);
    tabFrame = requestAnimationFrame(() => {
      tabFrame = 0;
      if (closed || !tabStrip.isConnected || tabStrip.clientWidth <= 0) return;
      // Only the touch codex uses an overflowing single row. Scroll that row, never its ancestors.
      if (getComputedStyle(tabStrip).overflowX !== 'auto' || tabStrip.scrollWidth <= tabStrip.clientWidth) return;
      const selected = tabEls[tab];
      const left = selected.offsetLeft;
      const right = left + selected.offsetWidth;
      if (left < tabStrip.scrollLeft) tabStrip.scrollLeft = left;
      else if (right > tabStrip.scrollLeft + tabStrip.clientWidth) tabStrip.scrollLeft = right - tabStrip.clientWidth;
    });
  };

  // clientWidth is in layout pixels, before #ui-root's transform/zoom, and excludes borders.
  const contentWidth = () => {
    const style = getComputedStyle(detail);
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    return Math.max(0, Math.floor(detail.clientWidth - padding));
  };
  const renderDetail = (width: number) => {
    if (closed || width <= 0) return;
    layoutWidth = width;
    detail.innerHTML = detailHtml(tabs[tab].entries[sel], width);
  };
  const observer = new ResizeObserver(() => {
    if (closed || renderFrame) return;
    revealTab();
    if (contentWidth() === layoutWidth && detail.clientHeight === layoutHeight) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      if (closed) return;
      const previousScroll = scrollPosition;
      const width = contentWidth();
      if (width !== layoutWidth) renderDetail(width);
      detail.scrollTop = previousScroll;
      scrollPosition = detail.scrollTop;
      layoutHeight = detail.clientHeight;
    });
  });
  const rememberScroll = () => {
    // Rotation can clamp old content before the observer redraws it; keep the last stable position.
    if (!renderFrame && contentWidth() === layoutWidth && detail.clientHeight === layoutHeight) scrollPosition = detail.scrollTop;
  };
  detail.addEventListener('scroll', rememberScroll, { passive: true });

  const show = (i: number) => {
    sel = i;
    cells.forEach((c, k) => c.classList.toggle('sel', k === i));
    scrollPosition = 0;
    renderDetail(contentWidth());
    detail.scrollTop = 0;
    layoutHeight = detail.clientHeight;
  };
  const openTab = (t: number) => {
    tab = (t + tabs.length) % tabs.length;
    tabEls.forEach((el, k) => el.classList.toggle('sel', k === tab));
    revealTab();
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
  }, () => {
    closed = true;
    observer.disconnect();
    cancelAnimationFrame(renderFrame);
    cancelAnimationFrame(tabFrame);
    detail.removeEventListener('scroll', rememberScroll);
  });
  observer.observe(detail);
  observer.observe(tabStrip);
}

// ---------------------------------------------------------------- how to play

const GUIDE: { name: string; rows: [string, string][] }[] = [
  {
    name: '操作',
    rows: [
      ['WASD', '移动'],
      ['鼠标', '瞄准，按住左键射击；近战武器踩拍出招更强（见「节奏」）'],
      ['空格 / Shift', '冲刺，冲刺途中无敌'],
      ['Q / 滚轮', '换枪，最多带两把'],
      ['E / 右键', '双持：两把枪同时开火 4 秒，冷却 14 秒'],
      ['R', '换弹；弹匣打空也会自动换，收起的副武器会在后台换弹'],
      ['F', '打开附近箱子和升级水晶，拾取地面武器，领取台上宝物'],
      ['G', '自动射击开关'],
      ['Esc', '暂停；在三选一面板里是跳过'],
    ],
  },
  {
    name: '地牢',
    rows: [
      ['五层', '每层一种随机画风，第五层的 Boss 是那头野猪；越往下怪越多越凶'],
      ['战斗房', '走进去门会关上，清完两三波敌人才开门'],
      ['尸潮房', '坚持 20 到 28 秒，撑到最后有两个宝箱'],
      ['宝物房', '靠近台子按 F 领取，三件宝物只能拿一件'],
      ['Boss 房', '在最深处；打倒 Boss 后走进地洞去下一层'],
      ['小地图', '右上角：白色是你所在，红点 Boss，黄点宝物'],
    ],
  },
  {
    name: '成长',
    rows: [
      ['经验', '击杀掉宝石，攒满就升级：身边掉下一枚金色升级水晶，靠近按 F 打开，三张卡牌里选一张或跳过'],
      ['法术', '自动施放，最多四个；满 5 级加对应加成可进化'],
      ['融合', '特定的两个法术都到 3 级会自动融合成更强的法术，空出一个栏位'],
      ['加成', '强化属性；宠物标签的加成专门培养伙伴'],
      ['宝箱', '按 F 开箱；金箱翻出三张卡任选其一，能融合的卡下方有标注，武器箱只开一把，悬浮后按 F 拾取'],
      ['武器演示', '非战斗时靠近武器稍作停留，右下角显示攻击演示和指标；开火即收起'],
      ['换枪', '两把武器已满时可选任意一把替换，旧武器落地保留等级与弹药，靠近按 F 拾取'],
      ['拾取', '经验宝石和红心靠近自动吸取；元素水晶缺护甲时自动收取，每 2 秒最多回 1 格护甲，满甲保留到过期，详见图鉴'],
      ['宠物', '升级招募或宝物房获得，九种各一只，自动出招并继承部分加成'],
      ['招募', '等级 2、5、8……的升级水晶必有招募卡，其他等级也有机会'],
      ['兽群', '驯兽术、群猎、同心协力可组成宠物流派；三只伙伴后可遇到万兽之王'],
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
      ['元素', '七种元素照原神：火、水、雷、冰、风、岩、草，命中后附着在敌人身上（头顶有标记）'],
      ['反应', '蒸发 融化 超载 超导 感电 冻结 扩散 结晶 燃烧 绽放 原激化，详见图鉴「元素」'],
      ['克制', '各画风的怪带当地元素，同元素只受三成伤害；精英的元素护盾用克制元素打破'],
      ['掩体', '柱子和墙能挡子弹，也能挡守卫的光臂'],
      ['机关', '地刺、锯片、墙面箭阵、周期喷口、预警落物、交替光栅，共六种；也会伤怪物，可以把怪引过去'],
      ['预警', '四种新机关先给约 1 秒预警，再造成伤害；看轮廓和动态提示，清房后机关停止伤害'],
      ['环境', '风道、流水、传送带在战斗或挑战中轻轻推动，不直接扣血；结束后停止，手机沿用摇杆和冲刺'],
      ['挑战房', '可选支路，按 F 或手机交互开始；20 秒内按顺序踏过三个标记，受击或超时失败，每房一次'],
      ['挑战奖励', '成功加 150 分，并回复 1 点生命和 1 格护甲，不超过上限；不挑战也能继续主线'],
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
  page.tabIndex = 0;
  page.setAttribute('role', 'region');
  const cells = new Map<HTMLElement, { text: string; width: number }>();
  const pending = new Map<HTMLElement, number>();
  let renderFrame = 0;
  let closed = false;
  let scrollPosition = 0;
  let layoutHeight = 0;
  // ResizeObserver reports the text cell's own CSS pixels, before UI/mobile zoom.
  const observer = new ResizeObserver((entries) => {
    if (closed) return;
    let pageResized = false;
    for (const entry of entries) {
      if (entry.target === page) {
        pageResized = true;
        continue;
      }
      const cell = entry.target as HTMLElement;
      const width = Math.floor(entry.contentRect.width);
      if (width > 0 && cells.get(cell)?.width !== width) pending.set(cell, width);
    }
    if ((!pending.size && !pageResized) || renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      // Rotation can clamp the old DOM to zero before its new lines are drawn.
      const scrollTop = scrollPosition;
      for (const [cell, width] of pending) {
        const content = cells.get(cell);
        if (!content || content.width === width) continue;
        content.width = width;
        // pxBlock keeps trailing punctuation attached; reserve one 12px glyph for it.
        cell.innerHTML = pxBlock(content.text, GREY, width - 12);
      }
      pending.clear();
      page.scrollTop = scrollTop;
      scrollPosition = page.scrollTop;
      layoutHeight = page.clientHeight;
    });
  });
  const rememberScroll = () => {
    if (!renderFrame && page.clientHeight === layoutHeight) scrollPosition = page.scrollTop;
  };
  page.addEventListener('scroll', rememberScroll, { passive: true });
  const clearLayout = () => {
    observer.disconnect();
    cancelAnimationFrame(renderFrame);
    renderFrame = 0;
    pending.clear();
    cells.clear();
  };
  let cur = 0;
  const show = (i: number) => {
    clearLayout();
    scrollPosition = 0;
    layoutHeight = 0;
    cur = (i + GUIDE.length) % GUIDE.length;
    tabEls.forEach((el, k) => el.classList.toggle('sel', k === cur));
    page.setAttribute('aria-label', `${GUIDE[cur].name}说明`);
    const touch = isTouchBrowser();
    const rows: [string, string][] = touch && cur === 0 ? [
      ['左摇杆', '拖动移动；松开后停止'],
      ['右摇杆', '拖动瞄准并射击；轻触可出招，松开后停止射击'],
      ['冲刺', '轻触冲刺按钮，冲刺途中无敌'],
      ['换枪', '切换当前武器，最多带两把'],
      ['双持', '两把枪同时开火 4 秒，冷却 14 秒'],
      ['换弹', '手动换弹；弹匣打空也会自动换'],
      ['交互', '靠近箱子、升级水晶、地面武器或宝物，轻触交互按钮'],
      ['暂停', '轻触暂停打开菜单；奖励面板可直接轻触卡片或跳过'],
      ['横竖屏', '两种方向均可游玩；横屏视野更开阔'],
    ] : GUIDE[cur].rows;
    page.innerHTML = rows.map(([k]) => `<div class="gd-row"><div class="gk">${px(k, E.yellow)}</div><div class="gv"></div></div>`).join('');
    page.querySelectorAll<HTMLElement>('.gv').forEach((cell, index) => {
      const text = rows[index][1];
      cells.set(cell, { text: touch ? text.replaceAll('按 F', '轻触交互').replaceAll('按左键', '轻触右摇杆') : text, width: -1 });
      observer.observe(cell);
    });
    page.scrollTop = 0;
    observer.observe(page);
  };
  tabEls.forEach((el, i) => el.addEventListener('click', () => show(i)));
  ov.querySelector('.fsub')!.innerHTML = px(isTouchBrowser() ? '轻触分类 · 上下滑动' : '← → 翻页', DIM);
  openFrame(host, ov, (e) => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      if (e.key === 'Home') page.scrollTop = 0;
      else if (e.key === 'End') page.scrollTop = page.scrollHeight;
      else page.scrollTop += (e.key.endsWith('Up') ? -1 : 1) * (e.key.startsWith('Page') ? page.clientHeight : 24);
      scrollPosition = page.scrollTop;
      return;
    }
    const digit = Number(e.key);
    if (digit >= 1 && digit <= GUIDE.length) show(digit - 1);
    else if (isLeft(e) || e.key === 'q' || e.key === 'Q') show(cur - 1);
    else if (isRight(e) || e.key === 'e' || e.key === 'E' || e.key === 'Tab') show(cur + 1);
    else return;
    e.preventDefault();
    audio.hover();
  }, () => {
    closed = true;
    page.removeEventListener('scroll', rememberScroll);
    clearLayout();
  });
  // Mount first: the host sizes touch menus when the layer is pushed.
  show(0);
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
  ov.querySelector('.fsub')!.innerHTML = px(isTouchBrowser() ? '轻触左侧减少 · 右侧增加' : '↑↓ 选择　← → 调整', DIM);
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

const STYLE_COLOR: Record<string, string> = { D: E.greyM, C: E.green, B: E.cyan, A: E.yellow, S: E.orange, SS: E.hot };
const PODIUM = [
  { place: 1, medal: 'crown', color: E.yellow, height: 30 },
  { place: 2, medal: 'medal-2', color: E.grey, height: 22 },
  { place: 3, medal: 'medal-3', color: E.clay, height: 16 },
];

interface BoardRow {
  name: string;
  score: number;
  floor: number;
  kills: number;
  secs: number;
  diff: DifficultyId;
  victory: boolean;
  rank?: string;
  you: boolean;
}

const result = (r: BoardRow) => (r.victory ? px('通关', E.yellow) : px(`第${FLOOR_CN[r.floor - 1] ?? r.floor}层`, GREY));
const FLOOR_CN = ['一', '二', '三', '四', '五', '六'];

/** First, second and third on pedestals that rise up, first place crowned and glittering. */
function podium(rows: BoardRow[]): string {
  const order = [1, 0, 2];
  return `<div class="podium">${order
    .map((i) => {
      const r = rows[i];
      const p = PODIUM[i];
      const sparkles = i === 0 ? [0, 1, 2, 3].map((k) => `<i class="spk s${k}">${icon('sparkle')}</i>`).join('') : '';
      if (!r) return `<div class="pd pd${p.place} vacant" style="--d:${i * 120}ms"><div class="pd-name">${px('虚位以待', DIM)}</div><div class="pd-block" style="height:${p.height}px">${px(String(p.place), DIM, { small: true, scale: 2 })}</div></div>`;
      return `<div class="pd pd${p.place} ${r.you ? 'you' : ''}" style="--d:${i * 120}ms">
        <div class="pd-top">${sparkles}<div class="pd-medal">${icon(p.medal, 2)}</div><div class="pd-av">${icon('adonis', 2)}</div></div>
        <div class="pd-name">${px(r.name, r.you ? E.yellow : E.white)}</div>
        <div class="pd-score">${px(String(r.score), p.color, { small: true, scale: i === 0 ? 2 : 1 })}</div>
        <div class="pd-meta">${result(r)}${r.rank ? px(r.rank, STYLE_COLOR[r.rank] ?? GREY, { small: true }) : ''}</div>
        <div class="pd-block" style="height:${p.height}px;--c:${p.color}">${px(String(p.place), E.ink, { small: true, scale: 2, outline: false })}</div>
      </div>`;
    })
    .join('')}</div>`;
}

function listRows(rows: BoardRow[], from: number): string {
  return rows
    .map((r, k) => {
      const i = from + k;
      const cells = [
        px(String(i + 1), GREY, { small: true }),
        px(r.name, r.you ? E.yellow : E.white),
        px(String(r.score), E.yellow, { small: true }),
        result(r),
        r.rank ? px(r.rank, STYLE_COLOR[r.rank] ?? GREY, { small: true }) : '',
        px(String(r.kills), E.white, { small: true }),
        px(fmtTime(r.secs), E.white, { small: true }),
        px(DIFFICULTIES[r.diff]?.name ?? '', r.diff === 'hard' ? HOT : GREY),
      ];
      return `<div class="bd-row ${r.you ? 'me' : ''}" style="--d:${300 + k * 45}ms">${cells.map((c) => `<div>${c}</div>`).join('')}</div>`;
    })
    .join('');
}

/**
 * The leaderboard: everyone's runs from the server (falling back to this browser's when it is out of reach),
 * the top three on a podium, the rest below, your own runs picked out, and your name to sign them with.
 */
export function openBoard(host: LayerHost, highlight?: number) {
  const ov = frame('RANKING', '排行榜', 'board');
  const body = ov.querySelector('.fbody') as HTMLElement;
  const sub = ov.querySelector('.fsub') as HTMLElement;
  let tab = 0;
  let global: BoardReply | null | undefined;
  const local = (): BoardRow[] => topScores().map((e) => ({ ...e, name: playerName() || '我', you: e.date === highlight }));

  const render = () => {
    const online = tab === 0;
    const rows: BoardRow[] = online ? (global?.top ?? []) : local();
    const status = online
      ? global === undefined
        ? px('连接全服排行榜……', DIM)
        : global === null
          ? px('全服排行榜暂时连不上，先看看本机记录', HOT)
          : px(`全服共 ${global.runs} 局${global.best ? ` · 你的最佳第 ${global.best} 名` : ''}`, GREY)
      : px('这台电脑上的记录', GREY);
    sub.innerHTML = status;
    const tabs = `<div class="bd-tabs">${['全服', '本机'].map((t, i) => `<div class="cx-tab ${i === tab ? 'sel' : ''}" data-i="${i}">${px(t, E.white)}</div>`).join('')}<div class="bd-me">${px('署名', DIM)}<span class="nm">${px(playerName() || '未署名', playerName() ? E.yellow : DIM)}</span><span class="edit">${px('改名', E.white)}</span></div></div>`;
    const empty = online && global === undefined ? '' : `<div class="bd-empty">${px(online ? '还没有人上榜。打完一局，你就是第一个。' : '还没有记录。去冒险吧，结束一局就会上榜。', GREY)}</div>`;
    body.innerHTML = tabs + (rows.length ? podium(rows) + `<div class="bd-list">${listRows(rows.slice(3, 10), 3)}</div>` : empty);
    body.querySelectorAll<HTMLElement>('.bd-tabs .cx-tab').forEach((t) =>
      t.addEventListener('click', () => {
        tab = Number(t.dataset.i);
        audio.hover();
        render();
      }),
    );
    (body.querySelector('.bd-me .edit') as HTMLElement).addEventListener('click', () => rename());
  };

  // Typing a name: the field swallows its own keys, so the game and the menus never see them.
  const rename = () => {
    const slot = body.querySelector('.bd-me .nm') as HTMLElement;
    slot.innerHTML = '<input class="pxinput" maxlength="12" spellcheck="false">';
    const input = slot.querySelector('input') as HTMLInputElement;
    input.value = playerName();
    input.focus();
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        setPlayerName(input.value);
        audio.select();
        render();
      } else if (e.key === 'Escape') render();
    });
    input.addEventListener('blur', () => render());
  };

  render();
  fetchGlobal().then((reply) => {
    global = reply;
    if (reply === null && tab === 0 && topScores().length) tab = 1;
    render();
  });
  openFrame(host, ov, (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'd') {
      tab = 1 - tab;
      audio.hover();
      render();
    }
  });
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
