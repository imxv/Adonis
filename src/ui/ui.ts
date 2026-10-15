import { mixHex } from '../core/math';
import { TAG_NAMES, type Tag } from '../core/stats';
import { RARITY_INFO, UPGRADE_BY_ID } from '../data/upgrades';
import { WEAPONS, STAT_MEANING, MAX_WEAPON_LEVEL } from '../data/weapons';
import { PETS } from '../data/enemies';
import type { StyleKit } from '../styles/types';
import type { Choice, RunState } from '../game/run';
import { topTags } from '../game/run';
import { audio } from '../audio/audio';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

function el(tag: string, cls?: string, html?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const HEART_PATH = 'M12 21C3 14 0 9 3 5c2.5-3.3 6.8-2.6 9 .8C14.2 2.4 18.5 1.7 21 5c3 4 0 9-9 16z';

export interface HudData {
  hp: number;
  maxHp: number;
  xp: number;
  xpNext: number;
  xpLevel: number;
  weapons: { glyph: string; level: number; cd: number }[];
  pets: string[];
  level: number;
  room: number;
  rooms: number;
  styleName: string;
  combo: number;
  boss?: { name: string; ratio: number; phaseMark: number };
}

class UI {
  root!: HTMLElement;
  private hud!: HTMLElement;
  private lastHp = -1;
  private choiceKeys?: (e: KeyboardEvent) => void;
  private toastTimer = 0;
  private canvas?: HTMLCanvasElement;

  mount(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.root = $('#ui-root');
    this.root.innerHTML = '';
    this.hud = el('div', 'hud');
    this.hud.innerHTML = `
      <div class="hud-tl"><div class="hearts"></div><div class="badges weapons"></div><div class="badges pets"></div></div>
      <div class="hud-tr"><div class="style-name"></div><div class="room-label"></div><div class="rooms"></div></div>
      <div class="bossbar" style="opacity:0"><div class="name"></div><div class="bar"><div class="ghost"></div><div class="fill"></div><div class="mark"></div></div></div>
      <div class="combo"><div class="n"></div><div class="t">连杀</div></div>
      <div class="toast"></div>
      <div class="xplv"></div>
      <div class="xpbar"><div class="fill"></div></div>`;
    this.hud.style.opacity = '0';
    this.root.appendChild(this.hud);
    const sync = () => this.sync();
    window.addEventListener('resize', sync);
    new ResizeObserver(sync).observe(canvas);
    sync();
  }

  sync() {
    if (!this.canvas) return;
    const r = this.canvas.getBoundingClientRect();
    const k = r.width / 1280;
    this.root.style.transform = `translate(${r.left}px, ${r.top}px) scale(${k})`;
  }

  applyTheme(kit: StyleKit, dark: boolean) {
    const p = kit.palette;
    const s = this.root.style;
    s.setProperty('--accent', p.accent);
    s.setProperty('--ink', p.ink);
    s.setProperty('--light', p.light);
    s.setProperty('--danger', p.danger === p.ink ? p.accentDark : p.danger);
    s.setProperty('--panel', dark ? mixHex(p.bg, '#000000', 0.25) : mixHex(p.bg, '#ffffff', 0.35));
    s.setProperty('--panel-ink', dark ? p.light : p.ink);
    s.setProperty('--frame', p.extra[0]);
    s.setProperty('--display-font', kit.fonts.display);
    s.setProperty('--body-font', kit.fonts.body);
    s.setProperty('--hud-ink', dark ? p.light : p.ink);
    this.root.className = `frame-${kit.frame}`;
  }

  showHud(show: boolean) {
    this.hud.style.opacity = show ? '1' : '0';
  }

  updateHud(d: HudData) {
    const hearts = $('.hearts', this.hud);
    const n = Math.ceil(d.maxHp / 2);
    if (hearts.childElementCount !== n || this.lastHp !== d.hp) {
      const hurt = this.lastHp > d.hp;
      hearts.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const v = Math.max(0, Math.min(2, d.hp - i * 2));
        const h = el('div', 'heart' + (hurt && v < 2 && d.hp - i * 2 > -2 ? ' hurt' : ''));
        const clip = v === 1 ? `<clipPath id="hc${i}"><rect x="0" y="0" width="12" height="24"/></clipPath>` : '';
        h.innerHTML = `<svg viewBox="0 0 24 24">${clip}<path d="${HEART_PATH}" fill="rgba(0,0,0,0.35)" stroke="var(--ink)" stroke-width="2"/>${
          v > 0 ? `<path d="${HEART_PATH}" fill="var(--accent)" ${v === 1 ? `clip-path="url(#hc${i})"` : ''}/>` : ''
        }<path d="${HEART_PATH}" fill="none" stroke="var(--ink)" stroke-width="2"/></svg>`;
        hearts.appendChild(h);
      }
      this.lastHp = d.hp;
    }
    const weapons = $('.weapons', this.hud);
    if (weapons.childElementCount !== d.weapons.length) {
      weapons.innerHTML = d.weapons.map(() => `<div class="badge"><div class="cd"></div><span class="glyph"></span><span class="lv"></span></div>`).join('');
    }
    d.weapons.forEach((w, i) => {
      const b = weapons.children[i] as HTMLElement;
      $('.glyph', b).textContent = w.glyph;
      $('.lv', b).textContent = w.level > 1 ? String(w.level) : '';
      ($('.cd', b) as HTMLElement).style.height = `${Math.round(w.cd * 100)}%`;
    });
    const pets = $('.pets', this.hud);
    const petsHtml = d.pets.map((p) => `<div class="badge pet">${p}</div>`).join('');
    if (pets.innerHTML !== petsHtml) pets.innerHTML = petsHtml;

    $('.style-name', this.hud).textContent = d.styleName;
    $('.room-label', this.hud).textContent = `第 ${d.level + 1} 幅画 · ${d.room >= d.rooms ? '宿敌' : `第 ${d.room + 1} 间`}`;
    const rooms = $('.rooms', this.hud);
    const dots = Array.from({ length: d.rooms + 1 }, (_, i) => {
      const cls = ['room-dot', i === d.rooms ? 'boss' : '', i < d.room ? 'done' : '', i === d.room ? 'now' : ''].join(' ');
      return `<div class="${cls}"></div>`;
    }).join('');
    if (rooms.innerHTML !== dots) rooms.innerHTML = dots;

    ($('.xpbar .fill', this.hud) as HTMLElement).style.width = `${Math.min(100, (d.xp / d.xpNext) * 100)}%`;
    $('.xplv', this.hud).textContent = `Lv ${d.xpLevel}`;

    const combo = $('.combo', this.hud);
    if (d.combo >= 3) {
      combo.style.opacity = '1';
      $('.n', combo).textContent = `×${d.combo}`;
      combo.style.transform = `scale(${1 + Math.min(0.5, d.combo / 60)})`;
    } else combo.style.opacity = '0';

    const bb = $('.bossbar', this.hud);
    if (d.boss) {
      bb.style.opacity = '1';
      $('.name', bb).textContent = d.boss.name;
      ($('.fill', bb) as HTMLElement).style.width = `${d.boss.ratio * 100}%`;
      ($('.ghost', bb) as HTMLElement).style.width = `${d.boss.ratio * 100}%`;
      ($('.mark', bb) as HTMLElement).style.left = `${d.boss.phaseMark * 100}%`;
    } else bb.style.opacity = '0';
  }

  toast(text: string, ms = 1400) {
    const t = $('.toast', this.hud);
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
  }

  banner(kicker: string, big: string, en: string, subtitle: string, ms = 2200) {
    const b = el('div', 'banner');
    b.innerHTML = `<div class="kicker">${kicker}</div><div class="big">${big}</div><div class="en">${en}</div><div class="line"></div><div class="subtitle">${subtitle}</div>`;
    this.root.appendChild(b);
    setTimeout(() => b.classList.add('out'), ms);
    setTimeout(() => b.remove(), ms + 600);
  }

  choices(title: string, sub: string, items: Choice[], run: RunState, onPick: (i: number) => void) {
    const ov = el('div', 'overlay');
    ov.innerHTML = `<h2>${title}</h2><div class="sub">${sub}</div><div class="cards"></div>`;
    const cards = $('.cards', ov);
    const tops = topTags(run);
    items.forEach((c, i) => {
      const card = el('div', 'card');
      card.innerHTML = this.cardHtml(c, run, tops, i);
      card.addEventListener('mouseenter', () => audio.hover());
      card.addEventListener('click', () => pick(i));
      cards.appendChild(card);
    });
    const pick = (i: number) => {
      if (this.choiceKeys) window.removeEventListener('keydown', this.choiceKeys);
      this.choiceKeys = undefined;
      ov.remove();
      audio.select();
      onPick(i);
    };
    this.choiceKeys = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (i >= 0 && i < items.length) pick(i);
    };
    window.addEventListener('keydown', this.choiceKeys);
    this.root.appendChild(ov);
  }

  private cardHtml(c: Choice, run: RunState, tops: string[], i: number): string {
    let glyph = '';
    let name = '';
    let rarity = 'common';
    let desc = '';
    let meta = '';
    let tags: string[] = [];
    let synergy = false;
    switch (c.type) {
      case 'upgrade': {
        glyph = c.def.glyph;
        name = c.def.name;
        rarity = c.def.rarity;
        desc = c.def.desc;
        const have = run.stacks[c.def.id] ?? 0;
        meta = have ? `已有 ${have} 层 · 上限 ${c.def.max}` : `上限 ${c.def.max} 层`;
        tags = c.def.tags.map((t) => TAG_NAMES[t as Tag]);
        synergy = c.def.tags.some((t) => tops.includes(t));
        break;
      }
      case 'weapon-new': {
        const w = WEAPONS[c.id];
        glyph = w.glyph;
        name = w.name;
        rarity = 'rare';
        const m = STAT_MEANING[c.id];
        desc = `${w.desc}<br><span style="opacity:.7;font-size:13px">数量＝${m.count} · 范围＝${m.area} · 穿透＝${m.pierce}</span>`;
        meta = '新武器';
        break;
      }
      case 'weapon-up': {
        const w = run.weapons[c.index];
        glyph = w.def.glyph;
        name = `${w.def.name} 强化`;
        rarity = 'common';
        const lv = w.level + 1;
        desc = `伤害 +28%${lv === 3 || lv === 5 ? '，数量 +1' : ''}`;
        meta = `Lv ${w.level} → ${lv}（上限 ${MAX_WEAPON_LEVEL}）`;
        break;
      }
      case 'pet': {
        const p = PETS[c.kind];
        glyph = p.glyph;
        name = p.name;
        rarity = 'epic';
        desc = `${p.desc}<br><span style="opacity:.7;font-size:13px">继承你 ${Math.round(run.mods.petInherit * 100)}% 的伤害加成与元素</span>`;
        meta = '宠物';
        break;
      }
      case 'heal':
        glyph = '愈';
        name = '回春';
        desc = '回满生命';
        meta = '';
        break;
    }
    const r = RARITY_INFO[rarity as keyof typeof RARITY_INFO];
    return `<div class="rar" style="background:${r.color}"></div>
      ${synergy ? '<div class="synergy">联动</div>' : ''}
      <div class="key">[${i + 1}]</div>
      <div class="seal cjk">${glyph}</div>
      <div class="name">${name}</div>
      <div class="rname" style="color:${r.color}">${r.name}</div>
      <div class="desc">${desc}</div>
      ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
      <div class="meta">${meta}</div>`;
  }

  title(onStart: () => void) {
    const ov = el('div', 'overlay title');
    ov.innerHTML = `
      <div class="logo">AD<span>O</span>NIS</div>
      <div class="cn">画中轮回</div>
      <div class="myth">爱神所爱的少年阿多尼斯死于野猪的獠牙，<br>血落处开出银莲花。他一次次死去，又在不同画家的笔下重生。<br>这一次，穿过三幅画，去见那头野猪。</div>
      <div class="start">点击开始</div>
      <div class="keys">WASD 移动 · 鼠标瞄准射击 · 空格 冲刺 · Esc 暂停 · F 自动射击</div>`;
    const go = () => {
      ov.remove();
      onStart();
    };
    ov.addEventListener('click', go, { once: true });
    this.root.appendChild(ov);
  }

  pause(run: RunState, onResume: () => void) {
    const ov = el('div', 'overlay pause');
    const items: string[] = [];
    run.weapons.forEach((w) => items.push(`<div class="item"><span class="g">${w.def.glyph}</span>${w.def.name} Lv${w.level}</div>`));
    run.pets.forEach((p) => items.push(`<div class="item"><span class="g">${PETS[p].glyph}</span>${PETS[p].name}</div>`));
    for (const [id, n] of Object.entries(run.stacks)) {
      items.push(`<div class="item" data-id="${id}"><span class="g">${this.upgradeGlyph(id)}</span>${this.upgradeName(id)} ×${n}</div>`);
    }
    ov.innerHTML = `<h2>暂停</h2><div class="sub">当前构筑 · 按 Esc 继续</div><div class="build">${items.join('')}</div><div class="btn">继续</div>`;
    $('.btn', ov).addEventListener('click', () => {
      ov.remove();
      onResume();
    });
    this.root.appendChild(ov);
    return () => ov.remove();
  }

  private upgradeGlyph = (id: string) => UPGRADE_BY_ID[id]?.glyph ?? '·';
  private upgradeName = (id: string) => UPGRADE_BY_ID[id]?.name ?? id;

  end(victory: boolean, run: RunState, onRestart: () => void) {
    const ov = el('div', 'overlay');
    const secs = Math.round((performance.now() - run.start) / 1000);
    const total = Object.values(run.damage).reduce((a, b) => a + b, 0) || 1;
    const rows = Object.entries(run.damage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => `<div class="row"><span>${k}</span><div class="bar" style="width:${Math.max(2, (v / total) * 100)}%"></div><span>${Math.round((v / total) * 100)}%</span></div>`)
      .join('');
    ov.innerHTML = `
      <h2>${victory ? '这一次，他活了下来' : '阿多尼斯倒下了'}</h2>
      <div class="sub">${victory ? '野猪倒在了画布上。银莲花开满了三幅画。' : '血落处开出银莲花。他会在另一幅画里重生。'}</div>
      <div class="stats">
        <div><div class="v">${run.level + 1}/3</div><div class="l">画作</div></div>
        <div><div class="v">${run.kills}</div><div class="l">击杀</div></div>
        <div><div class="v">${run.maxCombo}</div><div class="l">最高连杀</div></div>
        <div><div class="v">${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</div><div class="l">用时</div></div>
      </div>
      <div class="dmgbars">${rows}</div>
      <div class="btn">再次重生（R）</div>`;
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
