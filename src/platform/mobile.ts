/** Shared browser capabilities and viewport geometry for canvas, menus and touch controls. */
export const TOUCH_CONTROLS_HEIGHT = 220;

export function isTouchBrowser(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
    || (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches);
}

export function isLandscapeViewport(): boolean {
  return window.innerWidth > window.innerHeight;
}

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
};

let displayRequest: { cancel: (exitFullscreen?: boolean) => void; acceptsFullscreen: () => boolean } | undefined;
let ownsFullscreen = false;
let exitingFullscreen: Promise<void> | undefined;
let orientationOwner: object | undefined;

/** Called synchronously by the title's user gesture. UI progress never waits on browser promises. */
export function requestMobileDisplay() {
  displayRequest?.cancel(false);
  const token = {};
  const target = document.documentElement;
  const orientation = screen.orientation as LockableOrientation | undefined;
  // An existing browser/user fullscreen has no lease here; do not replace its orientation.
  const borrowsFullscreen = !!document.fullscreenElement
    && (!ownsFullscreen || document.fullscreenElement !== target);
  let cancelled = false;
  let wantsLandscape = true;
  let awaitingFullscreen = false;
  let ignoreLateFullscreen = false;
  let lockStarted = false;
  const releaseOrientation = (stop = true) => {
    if (stop) wantsLandscape = false;
    if (orientationOwner !== token) return;
    orientationOwner = undefined;
    try { orientation?.unlock?.(); } catch { /* Unsupported or already released. */ }
  };
  const exitOwnedFullscreen = () => {
    if (exitingFullscreen || !ownsFullscreen || document.fullscreenElement !== target) return;
    try {
      const pending = document.exitFullscreen();
      exitingFullscreen = pending;
      let released = false;
      void pending.then(() => {
        released = true;
        if (document.fullscreenElement !== target) ownsFullscreen = false;
      }, () => {}).finally(() => {
        if (exitingFullscreen === pending) exitingFullscreen = undefined;
        // A cancelled request may have entered while the previous exit was finishing.
        if (released && !displayRequest?.acceptsFullscreen()) exitOwnedFullscreen();
      });
    } catch { /* Browser owns fullscreen. */ }
  };
  const lockLandscape = () => {
    if (cancelled || !wantsLandscape || borrowsFullscreen || lockStarted || typeof orientation?.lock !== 'function') return;
    lockStarted = true;
    orientationOwner = token;
    try {
      Promise.resolve(orientation.lock('landscape')).then(() => {
        // A late completion must not override portrait/cancel, or unlock a newer request.
        if ((cancelled || !wantsLandscape) && (!orientationOwner || orientationOwner === token)) {
          orientationOwner = undefined;
          try { orientation.unlock?.(); } catch { /* Already released. */ }
        }
      }, () => { if (orientationOwner === token) orientationOwner = undefined; });
    } catch {
      if (orientationOwner === token) orientationOwner = undefined;
    }
  };
  const fullscreenChanged = () => {
    if (document.fullscreenElement === target && ignoreLateFullscreen) exitOwnedFullscreen();
    else if (document.fullscreenElement === target) lockLandscape();
    else {
      ownsFullscreen = false;
      // An earlier cancelled attempt may still be exiting while this gesture requests fullscreen anew.
      releaseOrientation(!awaitingFullscreen);
    }
  };
  const cancel = (exitFullscreen = true) => {
    if (cancelled) return;
    cancelled = true;
    releaseOrientation();
    document.removeEventListener('fullscreenchange', fullscreenChanged);
    window.removeEventListener('pagehide', onPageHide);
    if (exitFullscreen) exitOwnedFullscreen();
  };
  const onPageHide = () => cancel();
  displayRequest = { cancel, acceptsFullscreen: () => !cancelled && !ignoreLateFullscreen };
  document.addEventListener('fullscreenchange', fullscreenChanged);
  window.addEventListener('pagehide', onPageHide);

  if (document.fullscreenElement === target && !exitingFullscreen) lockLandscape();
  else if (!borrowsFullscreen && typeof target.requestFullscreen === 'function' && document.fullscreenEnabled !== false) {
    awaitingFullscreen = true;
    try {
      // Keep this before any await, timer, animation, or choice panel.
      Promise.resolve(target.requestFullscreen()).then(() => {
        awaitingFullscreen = false;
        if (document.fullscreenElement === target) ownsFullscreen = true;
        if (cancelled || ignoreLateFullscreen) {
          if (!displayRequest?.acceptsFullscreen()) exitOwnedFullscreen();
        } else lockLandscape();
      }, () => { awaitingFullscreen = false; if (!cancelled) lockLandscape(); });
    } catch { awaitingFullscreen = false; lockLandscape(); }
  } else lockLandscape();

  return {
    portrait: () => {
      // Keep an already entered fullscreen, but discard a request still arriving after this choice.
      ignoreLateFullscreen = document.fullscreenElement !== target;
      releaseOrientation();
    },
    cancel: () => cancel(),
  };
}

let safeAreaProbe: HTMLDivElement | undefined;

export function safeViewport() {
  if (!safeAreaProbe) {
    safeAreaProbe = document.createElement('div');
    safeAreaProbe.setAttribute('aria-hidden', 'true');
    safeAreaProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(safeAreaProbe);
  }
  const style = getComputedStyle(safeAreaProbe);
  const top = parseFloat(style.paddingTop) || 0;
  const right = parseFloat(style.paddingRight) || 0;
  const bottom = parseFloat(style.paddingBottom) || 0;
  const left = parseFloat(style.paddingLeft) || 0;
  const viewport = window.visualViewport;
  return {
    left: (viewport?.offsetLeft ?? 0) + left,
    top: (viewport?.offsetTop ?? 0) + top,
    width: Math.max(1, (viewport?.width ?? window.innerWidth) - left - right),
    height: Math.max(1, (viewport?.height ?? window.innerHeight) - top - bottom),
  };
}

/** Address-bar movement and rotation share one update; no user-agent sniffing. */
export function installMobileViewport(): () => void {
  let frame = 0;
  const pointer = window.matchMedia('(pointer: coarse)');
  const update = () => {
    frame = 0;
    const touch = isTouchBrowser();
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    document.body.classList.toggle('touch-device', touch);
    document.body.classList.toggle('touch-portrait', touch && height > width);
    const style = document.documentElement.style;
    style.setProperty('--viewport-width', `${width}px`);
    style.setProperty('--viewport-height', `${height}px`);
    style.setProperty('--viewport-left', `${viewport?.offsetLeft ?? 0}px`);
    style.setProperty('--viewport-top', `${viewport?.offsetTop ?? 0}px`);
    style.setProperty('--touch-controls-height', `${TOUCH_CONTROLS_HEIGHT}px`);
    window.dispatchEvent(new Event('mobileviewportchange'));
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  document.addEventListener('fullscreenchange', schedule);
  screen.orientation?.addEventListener('change', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  pointer.addEventListener('change', schedule);
  update();
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    document.removeEventListener('fullscreenchange', schedule);
    screen.orientation?.removeEventListener('change', schedule);
    displayRequest?.cancel(false);
    window.visualViewport?.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('scroll', schedule);
    pointer.removeEventListener('change', schedule);
  };
}
