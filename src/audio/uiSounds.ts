import { audio } from './audio';

const CONTROLS = 'button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], a[href], summary, select, input[type="checkbox"], input[type="radio"]';
/** Buttons that leave, close or cancel get the lower click. */
const BACK_WORDS = /返回|关闭|取消|离开|退出|收起/;
const BACK_ACTIONS = /^(back|close|exit|cancel)$/;

function control(target: EventTarget | null): HTMLElement | null {
  const el = target instanceof Element ? target.closest<HTMLElement>(CONTROLS) : null;
  if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return null;
  return el;
}

function isBack(el: HTMLElement) {
  if (BACK_ACTIONS.test(el.dataset.action ?? '') || el.classList.contains('back') || el.classList.contains('ws-cancel')) return true;
  return BACK_WORDS.test(`${el.getAttribute('aria-label') ?? ''} ${el.textContent ?? ''}`);
}

/**
 * Every button on every page clicks and every hover ticks, the hall and the side games included, which have no
 * sounds of their own. Listening in the capture phase sees presses that a page stops from bubbling; checking a tick
 * later lets a menu that already made its own sound for the same press (a card taken, a confirm) win.
 */
export function installUiSounds(): () => void {
  let hovered: HTMLElement | null = null;
  const click = (event: MouseEvent) => {
    const el = control(event.target);
    if (!el) return;
    const at = performance.now();
    window.setTimeout(() => {
      if (!audio.uiSince(at)) audio.uiClick(isBack(el));
    }, 0);
  };
  const over = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const el = control(event.target);
    if (el === hovered) return;
    hovered = el;
    if (!el) return;
    const at = performance.now();
    window.setTimeout(() => {
      if (!audio.uiSince(at)) audio.hover();
    }, 0);
  };
  window.addEventListener('click', click, true);
  window.addEventListener('pointerover', over, true);
  return () => {
    window.removeEventListener('click', click, true);
    window.removeEventListener('pointerover', over, true);
  };
}
