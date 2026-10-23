import { E } from '../pixel/palette';
import { isLandscapeViewport, isTouchBrowser, requestMobileDisplay } from '../platform/mobile';
import { el, px } from './pxhtml';
import type { LayerHost } from './screens';
import './mobileEntry.css';

const entries = new WeakMap<LayerHost, { el: HTMLElement; cancel: () => void; focus: () => void }>();
let entryId = 0;
let activeDisplay: ReturnType<typeof requestMobileDisplay> | undefined;
let pendingEntry: { cancel: () => void } | undefined;

/** Discard only this host's unfinished rotation dialog, including its display request. */
export function cancelMobileEntry(host: LayerHost): void {
  entries.get(host)?.cancel();
}

/** Release the main-line entry's display lease when returning to another mode. */
export function releaseMobileEntryDisplay(): void {
  const display = activeDisplay;
  activeDisplay = undefined;
  pendingEntry?.cancel();
  pendingEntry = undefined;
  display?.cancel();
}

/** Call directly from the title's user gesture, before selection or loading delays. `onCancel` hears only the player's own cancel. */
export function beginMobileEntry(host: LayerHost, onReady: () => void, onCancel?: () => void): void {
  const existing = entries.get(host);
  if (existing?.el.isConnected) {
    existing.focus();
    return;
  }
  existing?.cancel();
  pendingEntry?.cancel();
  if (!isTouchBrowser()) {
    onReady();
    return;
  }

  // Fullscreen needs this synchronous user-gesture chain; its promise never gates entry.
  const display = requestMobileDisplay();
  activeDisplay = display;
  if (isLandscapeViewport()) {
    onReady();
    return;
  }

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const descriptionId = `mobile-entry-description-${++entryId}`;
  const ov = el('div', 'overlay mobile-entry');
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', '转动手机');
  ov.setAttribute('aria-describedby', descriptionId);
  ov.innerHTML = `<div class="me-card panel">
    <div class="me-eyebrow">${px('旅途即将开始', E.greyM)}</div>
    <div class="me-art" aria-hidden="true"><i class="me-orbit"></i><i class="me-phone"><b></b></i><i class="me-spark"></i></div>
    <h2 class="me-title" aria-label="转动手机">${px('转动手机', E.yellow, { scale: 3 })}</h2>
    <div class="me-description" id="${descriptionId}"><span class="me-sr">横屏视野更开阔，转动手机即可继续。</span>${px('横屏视野更开阔', E.white, { scale: 2 })}${px('转动手机即可继续', E.grey, { scale: 2 })}</div>
    <div class="me-actions">
      <button type="button" class="me-portrait" aria-label="竖屏继续">${px('竖屏继续', E.white, { scale: 2 })}</button>
      <button type="button" class="me-cancel" aria-label="返回主页">${px('返回主页', E.grey, { scale: 2 })}</button>
    </div>
  </div>`;
  const portrait = ov.querySelector<HTMLButtonElement>('.me-portrait')!;
  const cancel = ov.querySelector<HTMLButtonElement>('.me-cancel')!;
  const buttons = [portrait, cancel];
  const events = new AbortController();
  let done = false;
  let focusFrame = 0;
  const focus = () => {
    if (!done && ov.isConnected) portrait.focus({ preventScroll: true });
  };

  const cleanupObserver = new MutationObserver(() => {
    if (!ov.isConnected) finish('cancel');
  });
  const cancelled = () => {
    const open = !done;
    finish('cancel');
    if (open) onCancel?.();
  };
  const finish = (action: 'landscape' | 'portrait' | 'cancel') => {
    if (done) return;
    const detached = !ov.isConnected;
    if (detached) action = 'cancel';
    done = true;
    cancelAnimationFrame(focusFrame);
    events.abort();
    cleanupObserver.disconnect();
    entries.delete(host);
    if (pendingEntry === entry) pendingEntry = undefined;
    if (action === 'portrait') display.portrait();
    else if (action === 'cancel') {
      display.cancel();
      if (activeDisplay === display) activeDisplay = undefined;
    }
    host.close(layer);
    if (!detached && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    if (action !== 'cancel') onReady();
  };
  const layer = host.push(ov, (event) => {
    if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      host.escUsed();
      cancelled();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = index < 0 ? (event.shiftKey ? buttons.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next].focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      (document.activeElement === portrait ? cancel : portrait).focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      // Native button activation would otherwise produce a second click after closing.
      if (!event.repeat) (document.activeElement === cancel ? cancel : portrait).click();
    }
  });
  const entry = { el: ov, cancel: () => finish('cancel'), focus };
  entries.set(host, entry);
  pendingEntry = entry;
  portrait.addEventListener('click', () => finish('portrait'), { signal: events.signal });
  cancel.addEventListener('click', cancelled, { signal: events.signal });
  window.addEventListener('mobileviewportchange', () => {
    if (isLandscapeViewport()) finish('landscape');
  }, { signal: events.signal });
  document.addEventListener('focusin', (event) => {
    if (!done && ov.isConnected && !ov.contains(event.target as Node)) focus();
  }, { signal: events.signal });
  cleanupObserver.observe(document.documentElement, { childList: true, subtree: true });
  // The key that opened the dialog must finish before a native button gains focus.
  focusFrame = requestAnimationFrame(focus);
}
