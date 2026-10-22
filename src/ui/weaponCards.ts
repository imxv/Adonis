import { E } from '../pixel/palette';
import { ICON_SIZE } from '../styles/textures';
import { icon, px } from './pxhtml';

/** One gun as the HUD sees it. */
export interface GunView {
  id: string;
  name: string;
  held: boolean;
  kind: string;
  ammo?: number;
  mag?: number;
  /** Reload progress 0-1 while reloading. */
  reload?: number;
}

const NO_MAG: Record<string, string> = { beam: '能量', chain: '能量', slash: '近战', boomerang: '回收' };
/** Bullets drawn in the clip; bigger magazines put several rounds behind each one. */
const CLIP_MAX = 12;

interface Card {
  el: HTMLElement;
  clip: HTMLElement;
  gun: HTMLElement;
  count: HTMLElement;
  label: HTMLElement;
  bullets: HTMLElement[];
  id?: string;
  ammo?: number;
  reloading?: boolean;
  countKey?: string;
}

function card(cls: string): Card {
  const el = document.createElement('div');
  el.className = `wcard ${cls}`;
  el.innerHTML = '<div class="clip"></div><div class="gun"></div><div class="cnt"></div><div class="lab"></div>';
  const q = (s: string) => el.querySelector(s) as HTMLElement;
  return { el, clip: q('.clip'), gun: q('.gun'), count: q('.cnt'), label: q('.lab'), bullets: [] };
}

/** Restart a CSS animation class on an element. */
function replay(el: HTMLElement, cls: string) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/**
 * Bottom-left gun cards: the gun in hand in front, the holstered one tucked behind it.
 * The front card carries a clip of bullets and a big round count; shots pop casings out of the clip,
 * a reload tips the gun and feeds the rounds back in, and Q swaps the two cards and flashes the new name.
 */
export class WeaponCards {
  private front = card('front');
  private back = card('back');
  private heldId?: string;
  private skillCd: HTMLElement;
  private skillEl: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = '';
    const stack = document.createElement('div');
    stack.className = 'wstack';
    stack.append(this.back.el, this.front.el);
    this.skillEl = document.createElement('div');
    this.skillEl.className = 'slot panel skill';
    this.skillEl.innerHTML = `${px('双持', E.white)}<i class="cd"></i><span class="key">${px('E', E.greyM, { small: true })}</span>`;
    this.skillCd = this.skillEl.querySelector('.cd') as HTMLElement;
    root.append(stack, this.skillEl);
  }

  update(guns: GunView[], skill: number, skillActive: boolean) {
    const held = guns.find((g) => g.held);
    const off = guns.find((g) => !g.held);
    if (held && this.heldId && held.id !== this.heldId) {
      // Q: the cards trade places, so start both fresh.
      this.front.ammo = this.back.ammo = undefined;
      replay(this.front.el, 'swap');
      replay(this.back.el, 'swap');
    }
    this.heldId = held?.id;
    this.fill(this.front, held, true);
    this.fill(this.back, off, false);
    this.skillEl.classList.toggle('on', skillActive);
    this.skillCd.style.height = `${Math.round((1 - skill) * 16)}px`;
  }

  private fill(c: Card, g: GunView | undefined, front: boolean) {
    c.el.classList.toggle('empty', !g);
    if (!g) {
      if (c.id !== '') {
        c.id = '';
        c.gun.innerHTML = c.count.innerHTML = c.clip.innerHTML = '';
        c.bullets = [];
        c.label.innerHTML = px('Q', E.slate, { small: true });
        c.el.title = '副武器';
      }
      return;
    }
    if (g.id !== c.id) {
      const w = ICON_SIZE[`gun-${g.id}`]?.[0] ?? 99;
      c.gun.innerHTML = icon(`gun-${g.id}`, front && w * 2 <= 40 ? 2 : 1);
      c.label.innerHTML = front ? px(g.name, E.white) : px('Q', E.greyM, { small: true });
      c.el.title = g.name;
      // The front card has no room for the name, so it rises above the stack whenever the gun in hand changes.
      if (front) replay(c.label, 'flash');
      c.id = g.id;
      c.ammo = undefined;
    }
    const reloading = g.reload !== undefined;
    c.el.classList.toggle('reloading', reloading);
    c.el.classList.toggle('nomag', !g.mag);
    if (c.reloading && !reloading) replay(c.el, 'loaded');
    c.reloading = reloading;

    if (!g.mag) {
      this.setCount(c, `nomag:${g.kind}`, px(NO_MAG[g.kind] ?? '', E.greyM));
      return;
    }
    const ammo = g.ammo ?? g.mag;
    // The clip: one icon per round up to twelve, filled from the bottom; reloading feeds them back in.
    const n = Math.min(CLIP_MAX, g.mag);
    if (c.bullets.length !== n) {
      c.clip.innerHTML = Array.from({ length: n }, () => '<i></i>').join('');
      c.bullets = [...c.clip.querySelectorAll<HTMLElement>('i')];
    }
    const per = g.mag / n;
    const filled = reloading ? Math.floor(g.reload! * (n + 0.999)) : Math.ceil(ammo / per - 1e-6);
    c.bullets.forEach((b, i) => {
      const on = i >= n - filled;
      if (b.classList.contains('on') && !on && !reloading && front) this.eject(c, b);
      b.classList.toggle('on', on);
    });
    const shot = c.ammo !== undefined && ammo < c.ammo;
    c.ammo = ammo;
    if (reloading) this.setCount(c, 'reload', px('换弹', E.hot));
    else {
      const color = ammo === 0 ? E.hot : ammo <= g.mag * 0.25 ? E.yellow : E.white;
      // Separate rows keep even a 120-round magazine inside the narrow receiver.
      this.setCount(c, `${ammo}/${g.mag}/${color}`, front ? `${px(String(ammo), color)}${px(`/${g.mag}`, E.greyM, { small: true })}` : px(String(ammo), color, { small: true }));
      if (shot && front) replay(c.count, 'bump');
    }
    c.el.classList.toggle('dry', ammo === 0 && !reloading);
  }

  private setCount(c: Card, key: string, html: string) {
    if (c.countKey === key) return;
    c.countKey = key;
    c.count.innerHTML = html;
  }

  /** A spent casing flips out of the clip. */
  private eject(c: Card, bullet: HTMLElement) {
    const casing = document.createElement('i');
    casing.className = 'casing';
    casing.style.left = `${bullet.offsetLeft + c.clip.offsetLeft}px`;
    casing.style.top = `${bullet.offsetTop + c.clip.offsetTop}px`;
    c.el.appendChild(casing);
    setTimeout(() => casing.remove(), 420);
  }
}
