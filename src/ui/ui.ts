import { RARITY_INFO, UPGRADE_BY_ID } from '../data/upgrades';
import { WEAPONS, STAT_MEANING, MAX_WEAPON_LEVEL } from '../data/weapons';
import { SPELLS } from '../data/spells';
import { PETS } from '../data/enemies';
import type { StyleKit } from '../styles/types';
import type { Choice, RunState } from '../game/run';
import { ICONS } from '../styles/textures';
import { E } from '../pixel/palette';
import { audio } from '../audio/audio';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

function el(tag: string, cls?: string, html?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Text is real DOM text drawn at the screen's full resolution, so Chinese stays sharp at any window size.
 * A hard 1px outline keeps it in step with the pixel art.
 */
function t(text: string, size = 10, color: string = E.white, cls = ''): string {
  return `<span class="t ${cls}" style="font-size:${size}px;color:${color}">${esc(text)}</span>`;
}

function icon(name: string, scale = 1): string {
  const src = ICONS[name];
  if (!src) return '';
  return `<img src="${src}" class="sc" data-scale="${scale}" alt="">`;
}

function sizeIcons(root: ParentNode) {
  root.querySelectorAll<HTMLImageElement>('img.sc').forEach((img) => {
    const apply = () => {
      const k = Number(img.dataset.scale);
      img.style.width = `${img.naturalWidth * k}px`;
      img.style.height = `${img.naturalHeight * k}px`;
    };
    if (img.complete && img.naturalWidth) apply();
    else img.onload = apply;
  });
}

export interface MapCell {
  gx: number;
  gy: number;
  type: string;
  visited: boolean;
  seen: boolean;
  current: boolean;
  cleared: boolean;
}

export interface HudData {
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  xp: number;
  xpNext: number;
  xpLevel: number;
  guns: { id: string; level: number; held: boolean }[];
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

class UI {
  root!: HTMLElement;
  private wrap!: HTMLElement;
  private hud!: HTMLElement;
  private world!: HTMLElement;
  private canvas?: HTMLCanvasElement;
  private toastTimer = 0;
  private choiceKeys?: (e: KeyboardEvent) => void;
  private last: Record<string, string> = {};
  private labels = new Map<string, HTMLElement>();

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
    this.world = el('div', 'world');
    this.root.appendChild(this.world);
    this.hud = el('div', 'hud');
    this.hud.innerHTML = `
      <div class="stats panel">
        <div class="bar-row">${icon('heart')}<div class="bar hp"><div class="fill"></div><div class="num"></div></div></div>
        <div class="bar-row">${icon('armor')}<div class="bar ar"><div class="fill"></div><div class="num"></div></div></div>
        <div class="bar-row">${icon('xp')}<div class="bar xp"><div class="fill"></div><div class="num"></div></div></div>
      </div>
      <div class="slots"></div>
      <div class="spells"></div>
      <div class="pets"></div>
      <div class="topright"><div class="minimap panel"></div><div class="sname"></div><div class="kills"></div></div>
      <div class="timer"></div>
      <div class="bossbar" style="opacity:0"><div class="bname"></div><div class="bar"><div class="fill"></div><div class="mark"></div></div></div>
      <div class="combo"></div>
      <div class="toast"></div>`;
    this.hud.style.opacity = '0';
    this.root.appendChild(this.hud);
    sizeIcons(this.hud);
    const sync = () => this.sync();
    window.addEventListener('resize', sync);
    new ResizeObserver(sync).observe(canvas);
    sync();
  }

  /** Lay the UI over the canvas and zoom it, so text is re-laid out (sharp) instead of stretched. */
  sync() {
    if (!this.canvas) return;
    const r = this.canvas.getBoundingClientRect();
    Object.assign(this.wrap.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    (this.root.style as any).zoom = String(r.width / 640);
  }

  applyTheme(kit: StyleKit) {
    this.root.style.setProperty('--accent', kit.palette.danger);
  }

  showHud(show: boolean) {
    this.hud.style.opacity = show ? '1' : '0';
  }

  private set(sel: string, html: string) {
    if (this.last[sel] === html) return;
    this.last[sel] = html;
    const node = $(sel, this.hud);
    node.innerHTML = html;
    sizeIcons(node);
  }

  updateHud(d: HudData) {
    const bar = (cls: string, v: number, max: number, label: string) => {
      ($(`.${cls} .fill`, this.hud) as HTMLElement).style.width = `${Math.max(0, Math.min(1, v / max)) * 100}%`;
      const num = $(`.${cls} .num`, this.hud);
      if (num.textContent !== label) num.textContent = label;
    };
    bar('hp', d.hp, d.maxHp, `${Math.max(0, d.hp)}/${d.maxHp}`);
    bar('ar', d.armor, d.maxArmor, `${d.armor}/${d.maxArmor}`);
    bar('xp', d.xp, d.xpNext, `LV ${d.xpLevel}`);

    const guns = d.guns.map((g) => `<div class="slot panel ${g.held ? 'held' : ''}">${icon(`gun-${g.id}`)}${g.held ? '<div class="cd"></div>' : ''}<span class="lv">${g.level > 1 ? g.level : ''}</span></div>`).join('');
    const skill = `<div class="slot panel skill ${d.skillActive ? 'on' : ''}">${t('双持', 9, d.skillActive ? E.cyan : E.white)}<div class="cd" data-skill></div><span class="key">E</span></div>`;
    this.set('.slots', guns + skill + (d.guns.length > 1 ? `<div class="hint">${t('Q 换枪', 7, '#8b9bb4')}</div>` : ''));
    const cd = $('.slot.held .cd', this.hud) as HTMLElement | null;
    if (cd) cd.style.height = `${Math.round(d.gunCd * 100)}%`;
    const scd = $('[data-skill]', this.hud) as HTMLElement | null;
    if (scd) scd.style.height = `${Math.round((1 - d.skill) * 100)}%`;

    this.set('.spells', d.spells.map((s) => `<div class="spell panel ${s.evolved ? 'evo' : ''}">${icon(`spell-${s.id}`)}<span class="lv">${s.evolved ? '★' : s.level}</span></div>`).join(''));
    this.set('.pets', d.pets.map((p) => `<div class="spell panel">${icon(`pet-${p}`)}</div>`).join(''));

    // Isaac-style minimap.
    const xs = d.map.map((c) => c.gx);
    const ys = d.map.map((c) => c.gy);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const cells = d.map
      .filter((c) => c.visited || c.seen)
      .map((c) => {
        const cls = ['cell', c.current ? 'cur' : c.visited ? 'vis' : 'seen', c.type].join(' ');
        const mark = c.type === 'boss' ? '<i class="m boss"></i>' : c.type === 'treasure' ? '<i class="m tre"></i>' : c.type === 'horde' && !c.cleared ? '<i class="m horde"></i>' : '';
        return `<div class="${cls}" style="left:${(c.gx - minX) * 11}px;top:${(c.gy - minY) * 7}px">${mark}</div>`;
      })
      .join('');
    const w = (Math.max(...xs) - minX + 1) * 11;
    const h = (Math.max(...ys) - minY + 1) * 7;
    this.set('.minimap', `<div class="grid" style="width:${w}px;height:${h}px">${cells}</div>`);
    this.set('.sname', t(`${['一', '二', '三', '四'][d.level]}层 · ${d.styleName}`, 9, '#c0cbdc'));
    const k = `KILLS ${d.kills}`;
    const kills = $('.kills', this.hud);
    if (kills.textContent !== k) kills.textContent = k;

    const timer = $('.timer', this.hud);
    const tt = d.timer > 0 ? `${String(Math.floor(d.timer / 60)).padStart(2, '0')}:${String(Math.floor(d.timer % 60)).padStart(2, '0')}` : '';
    if (timer.dataset.v !== tt) {
      timer.dataset.v = tt;
      timer.innerHTML = tt ? `${t('坚持住', 9, E.yellow)}<span class="num">${tt}</span>` : '';
    }

    const combo = $('.combo', this.hud);
    if (d.combo >= 5) {
      combo.style.opacity = '1';
      const c = `x${d.combo}`;
      if (combo.textContent !== c) combo.textContent = c;
    } else combo.style.opacity = '0';

    const bb = $('.bossbar', this.hud);
    if (d.boss) {
      bb.style.opacity = '1';
      this.set('.bname', t(d.boss.name, 10, E.white));
      ($('.bossbar .fill', this.hud) as HTMLElement).style.width = `${d.boss.ratio * 100}%`;
      ($('.bossbar .mark', this.hud) as HTMLElement).style.left = `${d.boss.phaseMark * 100}%`;
    } else bb.style.opacity = '0';
  }

  toast(text: string, ms = 1300) {
    const node = $('.toast', this.hud);
    node.innerHTML = t(text, 11, E.white);
    node.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => node.classList.remove('show'), ms);
  }

  banner(kicker: string, big: string, en: string, subtitle: string, ms = 2200) {
    const b = el('div', 'banner');
    b.innerHTML = `${t(kicker, 9, '#c0cbdc')}${t(big, 22, E.white, 'big')}<div class="en">${esc(en)}</div><div class="rule"></div>${t(subtitle, 9, '#c0cbdc')}`;
    this.root.appendChild(b);
    setTimeout(() => b.classList.add('out'), ms);
    setTimeout(() => b.remove(), ms + 600);
  }

  /** Short-lived text at a world position (the room fills the screen, so world = UI coordinates). */
  float(x: number, y: number, text: string, color: string = E.white, size = 9) {
    const f = el('div', 'float', t(text, size, color));
    f.style.left = `${Math.round(x)}px`;
    f.style.top = `${Math.round(y)}px`;
    this.world.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  label(id: string, x: number, y: number, text: string, color: string = E.white, size = 8) {
    this.labels.get(id)?.remove();
    const l = el('div', 'label', t(text, size, color));
    l.style.left = `${Math.round(x)}px`;
    l.style.top = `${Math.round(y)}px`;
    this.world.appendChild(l);
    this.labels.set(id, l);
  }

  unlabel(id: string) {
    this.labels.get(id)?.remove();
    this.labels.delete(id);
  }

  clearLabels() {
    this.labels.forEach((l) => l.remove());
    this.labels.clear();
    this.world.querySelectorAll('.float').forEach((f) => f.remove());
  }

  chestReward(c: Choice, run: RunState) {
    const info = this.describe(c, run);
    const b = el('div', 'chest panel');
    b.innerHTML = `${icon('chest', 2)}<div class="col">${t('宝箱！', 9, E.yellow)}${t(info.name, 12, E.white)}${t(info.tag, 8, info.tagColor)}</div>`;
    this.root.appendChild(b);
    sizeIcons(b);
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
        return { icon: `spell-${c.id}`, name: s.name, tag: `Lv${lv} → ${lv + 1}`, tagColor: E.cyan, desc: s.levels[lv - 1] ?? '强化', rarity: 'common' };
      }
      case 'evolve': {
        const s = SPELLS[c.id];
        return { icon: `spell-${c.id}`, name: s.evolved.name, tag: '进化', tagColor: E.yellow, desc: s.evolved.desc, rarity: 'legendary' };
      }
      case 'weapon-new': {
        const w = WEAPONS[c.id];
        const m = STAT_MEANING[c.id];
        return { icon: `gun-${c.id}`, name: w.name, tag: run.weapons.length >= 2 ? '替换手中的枪' : '新枪械', tagColor: E.yellow, desc: `${w.desc}。数量+1 = ${m.count}，穿透 = ${m.pierce}`, rarity: 'rare' };
      }
      case 'weapon-up': {
        const w = run.weapons[c.index];
        return { icon: `gun-${w.def.id}`, name: `${w.def.name} 强化`, tag: `Lv${w.level} → ${w.level + 1}`, tagColor: E.cyan, desc: `伤害 +30%${w.level + 1 === 3 || w.level + 1 === 5 ? '，数量 +1' : ''}（上限 ${MAX_WEAPON_LEVEL} 级）`, rarity: 'common' };
      }
      case 'pet': {
        const p = PETS[c.kind];
        return { icon: `pet-${c.kind}`, name: p.name, tag: '宠物', tagColor: E.pink, desc: `${p.desc}，继承你 ${Math.round(run.mods.petInherit * 100)}% 的加成`, rarity: 'epic' };
      }
      case 'heal':
        return { icon: 'heart', name: '回春', tag: '', tagColor: E.white, desc: '回满生命和护甲', rarity: 'common' };
    }
  }

  private iconFor(d: { icon: string }) {
    if (d.icon.startsWith('glyph:')) {
      const [, g, col] = d.icon.split(':');
      return t(g, 18, col, 'glyph');
    }
    return icon(d.icon, d.icon.startsWith('spell') ? 3 : 2);
  }

  choices(title: string, sub: string, items: Choice[], run: RunState, onPick: (i: number) => void) {
    if (this.choiceKeys) window.removeEventListener('keydown', this.choiceKeys);
    this.root.querySelectorAll('.overlay.picker').forEach((o) => o.remove());
    const ov = el('div', 'overlay picker');
    const box = el('div', 'lvlup panel');
    box.innerHTML = `<div class="head">${t(title, 16, E.yellow)}${t(sub, 9, '#c0cbdc')}</div>`;
    items.forEach((c, i) => {
      const d = this.describe(c, run);
      const opt = el('div', 'opt');
      opt.innerHTML = `<div class="icon ${d.rarity}">${this.iconFor(d)}</div>
        <div class="txt"><div class="line1">${t(d.name, 12, E.white)}${d.tag ? t(d.tag, 8, d.tagColor, 'tag') : ''}</div>
        ${t(d.desc, 9, '#c0cbdc', 'desc')}</div>
        <div class="k">${i + 1}</div>`;
      opt.addEventListener('mouseenter', () => audio.hover());
      opt.addEventListener('click', () => pick(i));
      box.appendChild(opt);
    });
    ov.appendChild(box);
    sizeIcons(ov);
    let done = false;
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (i >= 0 && i < items.length) pick(i);
    };
    const pick = (i: number) => {
      if (done) return;
      done = true;
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

  title(onStart: () => void) {
    const ov = el('div', 'overlay title');
    ov.innerHTML = `
      <div class="logo">AD<span>O</span>NIS</div>
      ${t('画 中 轮 回', 13, E.red)}
      <div class="scene">${icon('knight', 3)}${icon('boar', 3)}</div>
      ${t('他一次次死去，又一次次重生。', 10, '#c0cbdc')}
      ${t('这一次，穿过三层地牢，去见那头野猪。', 10, '#c0cbdc')}
      <div class="start panel">${t('点击开始', 12, E.white)}</div>
      <div class="keys">${t('WASD 移动 · 鼠标瞄准射击 · 空格 冲刺 · Q 换枪 · E / 右键 双持 · F 自动射击', 8, '#8b9bb4')}</div>`;
    sizeIcons(ov);
    ov.addEventListener(
      'click',
      () => {
        ov.remove();
        onStart();
      },
      { once: true },
    );
    this.root.appendChild(ov);
  }

  pause(run: RunState, onResume: () => void) {
    const ov = el('div', 'overlay');
    const chips: string[] = [];
    run.weapons.forEach((w) => chips.push(`<div class="chip">${icon(`gun-${w.def.id}`)}${t(`${w.def.name} Lv${w.level}`, 8)}</div>`));
    run.spells.forEach((s) => chips.push(`<div class="chip">${icon(`spell-${s.id}`)}${t(`${s.evolved ? SPELLS[s.id].evolved.name : SPELLS[s.id].name} Lv${s.level}`, 8)}</div>`));
    run.pets.forEach((p) => chips.push(`<div class="chip">${icon(`pet-${p}`)}${t(PETS[p].name, 8)}</div>`));
    for (const [id, n] of Object.entries(run.stacks)) chips.push(`<div class="chip">${t(`${UPGRADE_BY_ID[id]?.name ?? id} ×${n}`, 8)}</div>`);
    ov.innerHTML = `${t('暂停', 16, E.yellow)}${t('按 Esc 继续', 8, '#8b9bb4')}<div class="build">${chips.join('')}</div><div class="btn">${t('继续', 10)}</div>`;
    sizeIcons(ov);
    $('.btn', ov).addEventListener('click', () => {
      ov.remove();
      onResume();
    });
    this.root.appendChild(ov);
    return () => ov.remove();
  }

  end(victory: boolean, run: RunState, onRestart: () => void) {
    const ov = el('div', 'overlay');
    const secs = Math.round((performance.now() - run.start) / 1000);
    const total = Object.values(run.damage).reduce((a, b) => a + b, 0) || 1;
    const rows = Object.entries(run.damage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => `<div class="row">${t(k, 8)}<div class="b" style="width:${Math.max(2, (v / total) * 100)}%"></div><span class="pct">${Math.round((v / total) * 100)}%</span></div>`)
      .join('');
    ov.innerHTML = `
      ${t(victory ? '这一次，他活了下来' : '阿多尼斯倒下了', 16, victory ? E.yellow : E.red)}
      ${t(victory ? '野猪倒下了，银莲花开满了地牢。' : '血落处开出银莲花，他会再次重生。', 9, '#c0cbdc')}
      <div class="statgrid">
        <div><div class="v">${run.level + 1}/3</div>${t('层数', 8, '#8b9bb4')}</div>
        <div><div class="v">${run.kills}</div>${t('击杀', 8, '#8b9bb4')}</div>
        <div><div class="v">${run.xpLevel}</div>${t('等级', 8, '#8b9bb4')}</div>
        <div><div class="v">${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</div>${t('用时', 8, '#8b9bb4')}</div>
      </div>
      <div class="dmg">${rows}</div>
      <div class="btn">${t('再次重生（R）', 10)}</div>`;
    const go = () => {
      window.removeEventListener('keydown', onKey);
      ov.remove();
      onRestart();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') go();
    };
    window.addEventListener('keydown', onKey);
    $('.btn', ov).addEventListener('click', go);
    this.root.appendChild(ov);
  }
}

export const ui = new UI();
