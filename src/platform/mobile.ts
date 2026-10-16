/** Shared browser capabilities and viewport geometry for canvas, menus and touch controls. */
export const TOUCH_CONTROLS_HEIGHT = 220;

export function isTouchBrowser(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
    || (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches);
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
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  pointer.addEventListener('change', schedule);
  update();
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('scroll', schedule);
    pointer.removeEventListener('change', schedule);
  };
}
