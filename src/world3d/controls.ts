/** Owned input surface: never observes the main game's input or changes its handlers. */
export function createWorldControls(viewport: HTMLElement, canvas: HTMLCanvasElement, onUnlock: () => void) {
  const events = new AbortController();
  const signal = events.signal;
  const keys = new Set<string>();
  let enabled = false;
  let sensitivity = 1;
  let yaw = 0;
  let pitch = 0;
  let dragging: { id: number; x: number; y: number } | null = null;
  let stickId: number | null = null;
  let stickX = 0, stickY = 0;
  let disposed = false;
  let lockRequest = 0;
  let wantsLock = false;
  let heldLock = false;
  let intentionalUnlock = false;
  const stick = document.createElement('div');
  stick.className = 'gw-stick';
  stick.setAttribute('aria-label', '拖动摇杆移动');
  stick.innerHTML = '<span></span>';
  Object.assign(stick.style, {
    position: 'absolute', left: 'max(22px, env(safe-area-inset-left))', bottom: 'max(24px, env(safe-area-inset-bottom))',
    width: '104px', height: '104px', border: '1px solid #f0dfaa8c', borderRadius: '50%', zIndex: '5',
    background: '#203b4270', touchAction: 'none', display: 'none', pointerEvents: 'auto',
  });
  const nub = stick.firstElementChild as HTMLElement;
  Object.assign(nub.style, { position: 'absolute', width: '38px', height: '38px', borderRadius: '50%', background: '#ead9b39c', border: '1px solid #fff5d3', left: '32px', top: '32px', pointerEvents: 'none' });
  viewport.append(stick);
  function reset() {
    keys.clear(); dragging = null; stickId = null; stickX = stickY = 0;
    nub.style.transform = '';
  }
  function look(dx: number, dy: number, factor: number) {
    yaw -= dx * factor * sensitivity;
    pitch = Math.max(-1.22, Math.min(1.22, pitch - dy * factor * sensitivity));
  }
  function editable(target: EventTarget | null) {
    return target instanceof HTMLElement && !!target.closest('input,select,textarea,[contenteditable]');
  }
  window.addEventListener('keydown', event => {
    if (!enabled || editable(event.target)) return;
    if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(event.code)) {
      event.preventDefault(); keys.add(event.code);
    }
  }, { signal });
  window.addEventListener('keyup', e => keys.delete(e.code), { signal });
  window.addEventListener('blur', reset, { signal });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      heldLock = true;
      viewport.dataset.pointerLock = 'locked';
      if (!enabled || !wantsLock) { intentionalUnlock = true; document.exitPointerLock(); }
      return;
    }
    const shouldPause = heldLock && !intentionalUnlock;
    viewport.dataset.pointerLock = 'released';
    heldLock = false; intentionalUnlock = false; reset();
    if (shouldPause) onUnlock();
  }, { signal });
  document.addEventListener('mousemove', e => {
    if (enabled && document.pointerLockElement === canvas) look(e.movementX, e.movementY, 0.0022);
  }, { signal });
  canvas.addEventListener('pointerdown', e => {
    if (!enabled || e.button !== 0) return;
    if (e.pointerType === 'touch') stick.style.display = 'block';
    if (document.pointerLockElement !== canvas) {
      dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    }
  }, { signal });
  canvas.addEventListener('pointermove', e => {
    if (!enabled || dragging?.id !== e.pointerId || document.pointerLockElement === canvas) return;
    look(e.clientX - dragging.x, e.clientY - dragging.y, e.pointerType === 'touch' ? 0.004 : 0.003);
    dragging.x = e.clientX; dragging.y = e.clientY;
  }, { signal });
  const stopDrag = (e: PointerEvent) => { if (dragging?.id === e.pointerId) dragging = null; };
  canvas.addEventListener('pointerup', stopDrag, { signal });
  canvas.addEventListener('pointercancel', stopDrag, { signal });
  canvas.addEventListener('contextmenu', e => e.preventDefault(), { signal });
  stick.addEventListener('pointerdown', e => {
    if (!enabled || stickId !== null) return;
    e.preventDefault(); e.stopPropagation(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e);
  }, { signal });
  function moveStick(e: PointerEvent) {
    if (stickId !== e.pointerId) return;
    const rect = stick.getBoundingClientRect();
    let x = (e.clientX - rect.left - rect.width / 2) / 35;
    let y = (e.clientY - rect.top - rect.height / 2) / 35;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    stickX = x; stickY = y;
    nub.style.transform = `translate(${x * 30}px, ${y * 30}px)`;
  }
  stick.addEventListener('pointermove', moveStick, { signal });
  const releaseStick = (e: PointerEvent) => {
    if (stickId !== e.pointerId) return;
    stickId = null; stickX = stickY = 0; nub.style.transform = '';
  };
  stick.addEventListener('pointerup', releaseStick, { signal });
  stick.addEventListener('pointercancel', releaseStick, { signal });
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  if (touch) stick.style.display = 'block';
  return {
    get yaw() { return yaw; }, get pitch() { return pitch; },
    get locked() { return document.pointerLockElement === canvas; },
    setView(nextYaw: number, nextPitch: number) { yaw = nextYaw; pitch = nextPitch; },
    setSensitivity(value: number) { sensitivity = Math.max(0.4, Math.min(2.5, value)); },
    setEnabled(value: boolean) { enabled = value; stick.style.opacity = value ? '1' : '0'; if (!value) { wantsLock = false; lockRequest++; reset(); } },
    movement() {
      const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + stickX;
      const z = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - stickY;
      const length = Math.max(1, Math.hypot(x,z));
      return { x: x / length, z: z / length, fast: keys.has('ShiftLeft') || keys.has('ShiftRight') };
    },
    async lock() {
      if (disposed || matchMedia('(pointer: coarse)').matches || !canvas.requestPointerLock) {
        viewport.dataset.pointerLock = disposed ? 'disposed' : matchMedia('(pointer: coarse)').matches ? 'touch' : 'unsupported';
        return false;
      }
      if (enabled && document.pointerLockElement === canvas) return true;
      viewport.dataset.pointerLock = 'requesting';
      const request = ++lockRequest;
      wantsLock = true;
      let finish: (valid: boolean) => void = () => {};
      // Older browsers return void. Wait for their actual result as well, and retain this
      // one-request guard through dispose so a late grant cannot capture the gallery cursor.
      const resultEvent = new Promise<boolean>(resolve => {
        const changed = () => {
          if (document.pointerLockElement !== canvas) return;
          const valid = !disposed && enabled && wantsLock && request === lockRequest;
          if (!valid) { intentionalUnlock = true; document.exitPointerLock(); }
          finish(valid);
        };
        const failed = () => finish(false);
        finish = valid => {
          document.removeEventListener('pointerlockchange', changed, true);
          document.removeEventListener('pointerlockerror', failed);
          resolve(valid);
        };
        // Run before the general listener, which may itself release an invalid grant.
        document.addEventListener('pointerlockchange', changed, { capture: true });
        document.addEventListener('pointerlockerror', failed);
      });
      try {
        await canvas.requestPointerLock();
        if (disposed || !enabled || request !== lockRequest) {
          if (document.pointerLockElement === canvas) { intentionalUnlock = true; document.exitPointerLock(); }
        }
        return await resultEvent;
      }
      catch (error) { viewport.dataset.pointerLock = `denied: ${error instanceof Error ? error.message : String(error)}`; finish(false); return false; }
    },
    unlock() { wantsLock = false; lockRequest++; if (document.pointerLockElement === canvas) { intentionalUnlock = true; document.exitPointerLock(); } },
    dispose() { if (disposed) return; disposed = true; enabled = false; wantsLock = false; lockRequest++; events.abort(); reset(); if (document.pointerLockElement === canvas) document.exitPointerLock(); stick.remove(); },
  };
}
