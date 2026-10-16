import { audio } from '../audio/audio';
import { magSize, type WeaponInstance } from '../data/weapons';
import type { RunState } from '../game/run';
import { E } from '../pixel/palette';
import { ICON_SIZE } from '../styles/textures';
import { el, icon, px } from './pxhtml';
import type { LayerHost } from './screens';
import './weaponSwap.css';
import { isTouchBrowser } from '../platform/mobile';

function weaponArt(w: WeaponInstance, maxW: number, maxH: number) {
  const id = `gun-${w.def.id}`;
  const [width, height] = ICON_SIZE[id] ?? [16, 16];
  return icon(id, Math.max(1, Math.min(2, Math.floor(Math.min(maxW / width, maxH / height)))));
}

function ammoLabel(w: WeaponInstance, run: RunState) {
  const mag = magSize(w, run.mods.mag);
  if (!mag) return w.def.kind === 'slash' ? '近战 · 无需弹药' : '无需装填';
  return `弹药 ${w.ammo ?? mag}/${mag}${w.reloadT ? ' · 装填中' : ''}`;
}

/** Only chooses a slot: the caller owns the actual exchange and the dropped weapon. */
export function openWeaponSwap(host: LayerHost, incoming: WeaponInstance, run: RunState, onPick: (index: number) => void) {
  const touch = isTouchBrowser();
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = el('div', 'overlay weapon-swap');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `获得${incoming.def.name}，选择要替换的武器。换下的武器将掉到地上。`);
  overlay.innerHTML = `<div class="ws-panel panel">
    <div class="ws-heading">${px('替换哪把武器？', E.yellow, { scale: 2 })}</div>
    <div class="ws-incoming"><div class="ws-art">${weaponArt(incoming, 56, 30)}</div><div class="ws-new-name">${px('准备拿取', E.greyM)}<div class="ws-name-line">${px(incoming.def.name, E.white)}${px(`Lv${incoming.level}`, E.yellow, { small: true })}</div></div></div>
    <div class="ws-slots"></div>
    <div class="ws-footer">${px(touch ? '换下的武器留在地上，点交互可捡回' : '换下的武器会掉到地上，可按 F 捡回', E.yellow)}<div class="ws-actions">${px(touch ? '点击卡片替换这把武器' : '1/2 替换　方向键/Q 选择　Enter 确认', E.greyM)}<button type="button" class="ws-cancel" aria-label="取消替换">${px(touch ? '取消' : '取消 Esc', E.white)}</button></div></div>
  </div>`;
  const slots = overlay.querySelector('.ws-slots')!;
  let selected = Math.min(run.held, run.weapons.length - 1);
  let done = false;
  const cards = run.weapons.map((weapon, index) => {
    const held = index === run.held;
    const role = held ? '当前手持' : '备用武器';
    const ammo = ammoLabel(weapon, run);
    const card = el('button', 'ws-slot');
    card.setAttribute('type', 'button');
    card.setAttribute('aria-label', `替换${role}：${weapon.def.name}，${weapon.level}级，${ammo}`);
    card.innerHTML = `<div class="ws-slot-top">${px(`${index + 1}`, E.white, { small: true })}${px(role, held ? E.cyan : E.greyM)}</div><div class="ws-art">${weaponArt(weapon, 100, 28)}</div><div class="ws-name-line">${px(weapon.def.name, E.white)}${px(`Lv${weapon.level}`, E.yellow, { small: true })}</div><div class="ws-ammo">${px(ammo, E.grey)}</div>`;
    slots.appendChild(card);
    card.addEventListener('mouseenter', () => select(index));
    card.addEventListener('focus', () => select(index));
    card.addEventListener('click', () => finish(index));
    return card;
  });
  const cancel = overlay.querySelector<HTMLButtonElement>('.ws-cancel')!;
  const select = (index: number) => {
    if (done) return;
    if (selected !== index) audio.hover();
    selected = index;
    cards.forEach((card, i) => card.classList.toggle('sel', i === selected));
  };
  const finish = (index: number) => {
    if (done) return;
    done = true;
    host.escUsed();
    host.close(layer);
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    audio.select();
    onPick(index);
  };
  const layer = host.push(overlay, (event) => {
    if (event.repeat) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(-1);
    } else if (event.key === '1' || event.key === '2') {
      event.preventDefault();
      const index = Number(event.key) - 1;
      if (cards[index]) finish(index);
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'q', 'Q'].includes(event.key)) {
      event.preventDefault();
      const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const index = (selected + cards.length + step) % cards.length;
      select(index);
      cards[index].focus({ preventScroll: true });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      finish(document.activeElement === cancel ? -1 : selected);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const controls = [...cards, cancel];
      const current = controls.indexOf(document.activeElement as HTMLElement);
      controls[(current + controls.length + (event.shiftKey ? -1 : 1)) % controls.length].focus({ preventScroll: true });
    }
  });
  cancel.addEventListener('click', () => finish(-1));
  select(selected);
  cards[selected]?.focus({ preventScroll: true });
}
