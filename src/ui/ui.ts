import { RARITY_INFO, UPGRADE_BY_ID } from '../data/upgrades';
import { WEAPONS, STAT_MEANING, MAX_WEAPON_LEVEL } from '../data/weapons';
import { SPELLS } from '../data/spells';
import { PETS } from '../data/enemies';
import type { StyleKit } from '../styles/types';
import type { Choice, RunState } from '../game/run';
import { ICONS } from '../styles/textures';
import { pxText } from '../pixel/draw';
import { E } from '../pixel/palette';
import { audio } from '../audio/audio';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

function el(tag: string, cls?: string, html?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const urlCache = new Map<string, { url: string; w: number; h: number }>();

/** Pixel text as an <img>; the UI root is scaled with nearest-neighbour, so this stays crisp. */
function px(text: string, size = 10, color: string = E.white, outline: string | undefined = E.ink): string {
  const key = `${text}|${size}|${color}|${outline}`;
  let hit = urlCache.get(key);
  if (!hit) {
    const c = pxText(text, { size, color, outline });
    hit = { url: c.toDataURL(), w: c.width, h: c.height };
    urlCache.set(key, hit);
  }
  return `<img src="${hit.url}" style="width:${hit.w}px;height:${hit.h}px" alt="">`;
}

function icon(name: string, scale = 1): string {
  const src = ICONS[name];
  if (!src) return '';
  return `<img src="${src}" style="transform:scale(${scale});transform-origin:center" alt="">`;
}

function iconImg(name: string, scale: number): string {
  const src = ICONS[name];
  if (!src) return '';
  return `<img src="${src}" data-scale="${scale}" class="sc" alt="">`;
}

/** Fix up scaled icons once their natural size is known. */
function sizeIcons(root: ParentNode) {
  root.querySelectorAll<HTMLImageElement>('img.sc').forEach((img) => {
    const apply = () => {
      const k = Number(img.dataset.scale);
      img.style.width = `${img.naturalWidth * k}px`;
      img.style.height = `${img.naturalHeight * k}px`;
    };
    if (img.complete) apply();
    else img.onload = apply;
  });
}

function wrap(text: string, max = 22): string[] {
  const out: string[] = [];
  let line = '';
  for (const ch of text) {
    line += ch;
    const w = [...line].reduce((s, c) => s + (/[\x00-\x7f]/.test(c) ? 0.55 : 1), 0);
    if (w >= max) {
      out.push(line);
      line = '';
    }
  }
  if (line) out.push(line);
  return out;
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
  room: number;
  rooms: number;
  styleName: string;
  timer: number;
  kills: number;
  combo: number;
  boss?: { name: string; ratio: number; phaseMark: number };
}

class UI {
  root!: HTMLElement;
  private hud!: HTMLElement;
  private canvas?: HTMLCanvasElement;
  private toastTimer = 0;
  private choiceKeys?: (e: KeyboardEvent) => void;
  private last: Record<string, string> = {};

  mount(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.root = $('#ui-root');
    this.root.innerHTML = '';
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
      <div class="topright panel"><div class="sname"></div><div class="rooms"></div><div class="timer"></div><div class="kills"></div></div>
      <div class="bossbar" style="opacity:0"><div class="bname"></div><div class="bar"><div class="fill"></div><div class="mark"></div></div></div>
      <div class="combo"></div>
      <div class="toast"></div>`;
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
    this.root.style.transform = `translate(${r.left}px, ${r.top}px) scale(${r.width / 640})`;
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
    $(sel, this.hud).innerHTML = html;
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

    const guns = d.guns
      .map((g) => `<div class="slot panel ${g.held ? 'held' : ''}">${icon(`gun-${g.id}`)}${g.held ? '<div class="cd"></div>' : ''}<span class="lv">${g.level > 1 ? g.level : ''}</span></div>`)
      .join('');
    const skill = `<div class="slot panel skill ${d.skillActive ? 'on' : ''}"><span class="key">E</span>${px('双持', 10, d.skillActive ? E.cyan : E.white)}<div class="cd" data-skill></div></div>`;
    this.set('.slots', guns + (d.guns.length > 1 ? `<div style="align-self:center">${px('Q换枪', 8, '#8b9bb4', undefined)}</div>` : '') + skill);
    const cd = $('.slot.held .cd', this.hud) as HTMLElement | null;
    if (cd) cd.style.height = `${Math.round(d.gunCd * 100)}%`;
    const scd = $('[data-skill]', this.hud) as HTMLElement | null;
    if (scd) scd.style.height = `${Math.round((1 - d.skill) * 100)}%`;

    this.set('.spells', d.spells.map((s) => `<div class="spell panel ${s.evolved ? 'evo' : ''}">${icon(`spell-${s.id}`)}<span class="lv">${s.evolved ? '★' : s.level}</span></div>`).join(''));
    this.set('.pets', d.pets.map((p) => `<div class="slot panel">${icon(`pet-${p}`)}</div>`).join(''));

    this.set('.sname', px(d.styleName, 10, E.white));
    const dots = Array.from({ length: d.rooms + 1 }, (_, i) => `<div class="room-dot ${i === d.rooms ? 'boss' : ''} ${i < d.room ? 'done' : ''} ${i === d.room ? 'now' : ''}"></div>`).join('');
    this.set('.rooms', dots);
    const t = d.timer < 0 ? 'BOSS' : d.timer === 0 ? 'CLEAR!' : `${String(Math.floor(d.timer / 60)).padStart(2, '0')}:${String(Math.floor(d.timer % 60)).padStart(2, '0')}`;
    const timer = $('.timer', this.hud);
    if (timer.textContent !== t) timer.textContent = t;
    const k = `KILLS ${d.kills}`;
    const kills = $('.kills', this.hud);
    if (kills.textContent !== k) kills.textContent = k;

    const combo = $('.combo', this.hud);
    if (d.combo >= 5) {
      combo.style.opacity = '1';
      const c = `x${d.combo}`;
      if (combo.textContent !== c) combo.textContent = c;
    } else combo.style.opacity = '0';

    const bb = $('.bossbar', this.hud);
    if (d.boss) {
      bb.style.opacity = '1';
      this.set('.bname', px(d.boss.name, 10, E.white));
      ($('.bossbar .fill', this.hud) as HTMLElement).style.width = `${d.boss.ratio * 100}%`;
      ($('.bossbar .mark', this.hud) as HTMLElement).style.left = `${d.boss.phaseMark * 100}%`;
    } else bb.style.opacity = '0';
  }

  toast(text: string, ms = 1300) {
    const t = $('.toast', this.hud);
    t.innerHTML = px(text, 12, E.white);
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
  }

  banner(kicker: string, big: string, en: string, subtitle: string, ms = 2200) {
    const b = el('div', 'banner');
    b.innerHTML = `${px(kicker, 10, '#c0cbdc')}${px(big, 22, E.white)}<div style="font-size:8px;color:var(--accent);letter-spacing:2px">${en}</div><div class="rule"></div>${px(subtitle, 10, '#c0cbdc')}`;
    this.root.appendChild(b);
    setTimeout(() => b.classList.add('out'), ms);
    setTimeout(() => b.remove(), ms + 600);
  }

  chestReward(c: Choice, run: RunState) {
    const info = this.describe(c, run);
    const b = el('div', 'chest panel');
    b.innerHTML = `${iconImg('chest', 2)}<div style="display:flex;flex-direction:column;gap:3px">${px('宝箱！', 10, E.yellow)}${px(info.name, 12, E.white)}${px(info.tag, 8, '#c0cbdc')}</div>`;
    this.root.appendChild(b);
    sizeIcons(b);
    setTimeout(() => b.remove(), 1800);
  }

  private describe(c: Choice, run: RunState): { icon: string; name: string; tag: string; tagColor: string; desc: string; rarity: string } {
    switch (c.type) {
      case 'upgrade': {
        const have = run.stacks[c.def.id] ?? 0;
        const r = RARITY_INFO[c.def.rarity];
        return { icon: `glyph:${c.def.glyph}:${r.color}`, name: c.def.name, tag: have ? `${r.name} ${have}/${c.def.max}` : `${r.name} 新`, tagColor: r.color, desc: c.def.desc, rarity: c.def.rarity };
      }
      case 'spell-new': {
        const s = SPELLS[c.id];
        return { icon: `spell-${c.id}`, name: s.name, tag: '新法术！', tagColor: E.yellow, desc: s.desc, rarity: 'rare' };
      }
      case 'spell-up': {
        const s = SPELLS[c.id];
        const inst = run.spells.find((x) => x.id === c.id)!;
        return { icon: `spell-${c.id}`, name: s.name, tag: `LV${inst.level}>${inst.level + 1}`, tagColor: E.cyan, desc: s.levels[inst.level - 1] ?? '强化', rarity: 'common' };
      }
      case 'evolve': {
        const s = SPELLS[c.id];
        return { icon: `spell-${c.id}`, name: s.evolved.name, tag: '进化！', tagColor: E.yellow, desc: s.evolved.desc, rarity: 'legendary' };
      }
      case 'weapon-new': {
        const w = WEAPONS[c.id];
        const m = STAT_MEANING[c.id];
        return { icon: `gun-${c.id}`, name: w.name, tag: run.weapons.length >= 2 ? '替换当前枪' : '新枪械', tagColor: E.yellow, desc: `${w.desc}。数量=${m.count}，穿透=${m.pierce}`, rarity: 'rare' };
      }
      case 'weapon-up': {
        const w = run.weapons[c.index];
        return { icon: `gun-${w.def.id}`, name: `${w.def.name} 强化`, tag: `LV${w.level}>${w.level + 1}`, tagColor: E.cyan, desc: `伤害 +30%${w.level + 1 === 3 || w.level + 1 === 5 ? '，数量 +1' : ''}（上限 ${MAX_WEAPON_LEVEL}）`, rarity: 'common' };
      }
      case 'pet': {
        const p = PETS[c.kind];
        return { icon: `pet-${c.kind}`, name: p.name, tag: '宠物', tagColor: E.pink, desc: `${p.desc}，继承 ${Math.round(run.mods.petInherit * 100)}% 加成`, rarity: 'epic' };
      }
      case 'heal':
        return { icon: 'heart', name: '回春', tag: '', tagColor: E.white, desc: '回满生命和护甲', rarity: 'common' };
    }
  }

  choices(title: string, sub: string, items: Choice[], run: RunState, onPick: (i: number) => void) {
    if (this.choiceKeys) window.removeEventListener('keydown', this.choiceKeys);
    this.root.querySelectorAll('.overlay.picker').forEach((o) => o.remove());
    const ov = el('div', 'overlay picker');
    const box = el('div', 'lvlup panel');
    box.innerHTML = `<div class="head">${px(title, 16, E.yellow)}${px(sub, 10, '#c0cbdc')}</div>`;
    items.forEach((c, i) => {
      const d = this.describe(c, run);
      const opt = el('div', 'opt');
      const iconHtml = d.icon.startsWith('glyph:')
        ? px(d.icon.split(':')[1], 16, d.icon.split(':')[2])
        : iconImg(d.icon, d.icon.startsWith('gun') ? 2 : d.icon.startsWith('spell') ? 3 : 2);
      opt.innerHTML = `<div class="icon ${d.rarity}">${iconHtml}</div>
        <div><div class="line1">${px(d.name, 12, E.white)}${d.tag ? px(d.tag, 8, d.tagColor) : ''}</div>
        <div class="desc">${wrap(d.desc, 24).slice(0, 2).map((l) => px(l, 10, '#c0cbdc')).join('')}</div></div>
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
      ${px('画 中 轮 回', 14, E.red)}
      <div class="scene">${iconImg('knight', 3)}${iconImg('boar', 3)}</div>
      ${px('他一次次死去，又一次次重生。', 10, '#c0cbdc', undefined)}
      ${px('这一次，穿过三层地牢，去见那头野猪。', 10, '#c0cbdc', undefined)}
      <div class="start panel">${px('点击开始', 12, E.white)}</div>
      <div style="margin-top:6px">${px('WASD移动  鼠标瞄准射击  空格冲刺  Q换枪  E/右键双持  F自动射击', 8, '#5a6988', undefined)}</div>`;
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
    run.weapons.forEach((w) => chips.push(`<div class="chip">${icon(`gun-${w.def.id}`)}${px(`${w.def.name} LV${w.level}`, 8)}</div>`));
    run.spells.forEach((s) => chips.push(`<div class="chip">${icon(`spell-${s.id}`)}${px(`${s.evolved ? SPELLS[s.id].evolved.name : SPELLS[s.id].name} LV${s.level}`, 8)}</div>`));
    run.pets.forEach((p) => chips.push(`<div class="chip">${icon(`pet-${p}`)}${px(PETS[p].name, 8)}</div>`));
    for (const [id, n] of Object.entries(run.stacks)) chips.push(`<div class="chip">${px(`${UPGRADE_BY_ID[id]?.name ?? id} x${n}`, 8)}</div>`);
    ov.innerHTML = `${px('暂停', 16, E.yellow)}${px('ESC 继续', 8, '#8b9bb4')}<div class="build">${chips.join('')}</div><div class="btn">${px('继续', 10)}</div>`;
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
      .map(([k, v]) => `<div class="row">${px(k, 8)}<div class="b" style="width:${Math.max(2, (v / total) * 100)}%"></div><span class="pct">${Math.round((v / total) * 100)}%</span></div>`)
      .join('');
    ov.innerHTML = `
      ${px(victory ? '这一次，他活了下来' : '阿多尼斯倒下了', 16, victory ? E.yellow : E.red)}
      ${px(victory ? '野猪倒下了，银莲花开满了地牢。' : '血落处开出银莲花，他会再次重生。', 10, '#c0cbdc')}
      <div class="statgrid">
        <div><div class="v">${run.level + 1}/3</div>${px('层数', 8, '#8b9bb4')}</div>
        <div><div class="v">${run.kills}</div>${px('击杀', 8, '#8b9bb4')}</div>
        <div><div class="v">${run.xpLevel}</div>${px('等级', 8, '#8b9bb4')}</div>
        <div><div class="v">${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</div>${px('用时', 8, '#8b9bb4')}</div>
      </div>
      <div class="dmg">${rows}</div>
      <div class="btn">${px('再次重生 (R)', 10)}</div>`;
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
