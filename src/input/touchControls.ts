import { isTouchBrowser } from '../platform/mobile';
import './touchControls.css';

export type TouchAction = 'dash' | 'swap' | 'reload' | 'skill' | 'interact' | 'pause' | 'attack';

type Stick = {
  element: HTMLDivElement;
  thumb: HTMLSpanElement;
  pointerId: number | null;
  kind: 'move' | 'aim';
};

const DEAD_ZONE = 0.16;

/** One controller per game scene; poll its vectors and consume actions in update(). */
export class TouchControls {
  readonly move = { x: 0, y: 0 };
  readonly aim = { x: 1, y: 0 };
  firing = false;

  private available = isTouchBrowser();
  private playing = false;
  private destroyed = false;
  private readonly root = document.createElement('div');
  private readonly lifetime = new AbortController();
  private readonly pending = new Map<TouchAction, number[]>();
  private readonly buttonPointers = new Map<number, HTMLButtonElement>();
  private readonly sticks: Stick[] = [];

  get enabled(): boolean {
    return this.available;
  }

  constructor() {
    this.root.className = 'touch-controls';
    this.root.hidden = true;
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', '游戏触屏操作');

    const deck = document.createElement('div');
    deck.className = 'touch-controls-deck';
    const utilities = document.createElement('div');
    utilities.className = 'touch-controls-utilities';
    utilities.append(
      this.createButton('swap', '换枪', '切换武器'),
      this.createButton('reload', '换弹', '装填弹药'),
      this.createButton('skill', '双持', '双持攻击'),
      this.createButton('pause', '暂停', '暂停游戏'),
    );
    deck.append(
      this.createStick('move', '移动', '左摇杆：拖动移动'),
      this.createStick('aim', '瞄准 / 攻击', '右摇杆：按住攻击，拖动瞄准'),
      this.createButton('dash', '冲刺', '冲刺'),
      this.createButton('interact', '交互', '交互、拾取或进入'),
      utilities,
    );
    this.root.append(deck);
    document.body.append(this.root);

    // Controls live outside the scaled UI. Do not send their events to Phaser.
    const stop = (event: Event) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'contextmenu', 'dragstart']) {
      this.root.addEventListener(type, stop, { passive: false, signal: this.lifetime.signal });
    }
    window.addEventListener('blur', () => this.reset(), { signal: this.lifetime.signal });
    window.addEventListener('resize', () => this.reset(), { signal: this.lifetime.signal });
    window.addEventListener('orientationchange', () => this.reset(), { signal: this.lifetime.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    }, { signal: this.lifetime.signal });

    for (const query of ['(any-pointer: coarse)', '(pointer: coarse)', '(hover: none)']) {
      window.matchMedia(query).addEventListener('change', () => {
        this.available = isTouchBrowser();
        if (!this.available) this.reset();
        this.updateVisibility();
      }, { signal: this.lifetime.signal });
    }
  }

  consume(action: TouchAction): number | undefined {
    const queue = this.pending.get(action);
    const timestamp = queue?.shift();
    if (!queue?.length) this.pending.delete(action);
    return timestamp;
  }

  setPlaying(active: boolean): void {
    if (this.destroyed || this.playing === active) return;
    this.playing = active;
    if (!active) this.reset();
    this.updateVisibility();
  }

  reset(): void {
    this.move.x = 0;
    this.move.y = 0;
    this.firing = false;
    this.pending.clear();
    for (const stick of this.sticks) this.releaseStick(stick);
    const pressed = [...this.buttonPointers];
    this.buttonPointers.clear();
    for (const [pointerId, button] of pressed) {
      button.classList.remove('is-pressed');
      this.releaseCapture(button, pointerId);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.reset();
    this.lifetime.abort();
    this.root.remove();
  }

  private updateVisibility(): void {
    const visible = this.available && this.playing && !this.destroyed;
    this.root.hidden = !visible;
    this.root.classList.toggle('is-playing', visible);
  }

  private queue(action: TouchAction): void {
    if (!this.available || !this.playing || this.destroyed) return;
    const queue = this.pending.get(action) ?? [];
    // Bound queued taps if the browser pauses rendering while an input is held.
    if (queue.length < 8) queue.push(performance.now());
    this.pending.set(action, queue);
  }

  private createStick(kind: Stick['kind'], caption: string, label: string): HTMLDivElement {
    const element = document.createElement('div');
    element.className = `touch-stick touch-stick-${kind}`;
    element.setAttribute('role', 'group');
    element.setAttribute('aria-label', label);
    const thumb = document.createElement('span');
    thumb.className = 'touch-stick-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    const captionElement = document.createElement('span');
    captionElement.className = 'touch-stick-caption';
    captionElement.textContent = caption;
    element.append(thumb, captionElement);
    const stick: Stick = { element, thumb, pointerId: null, kind };
    this.sticks.push(stick);

    element.addEventListener('pointerdown', (event) => {
      if (!this.available || !this.playing || stick.pointerId !== null || event.button !== 0) return;
      stick.pointerId = event.pointerId;
      element.classList.add('is-pressed');
      this.capture(element, event.pointerId);
      this.updateStick(stick, event);
      if (kind === 'aim') {
        this.firing = true;
        // A melee beat is judged once on contact, not every frame while held.
        this.queue('attack');
      }
    }, { signal: this.lifetime.signal });
    element.addEventListener('pointermove', (event) => {
      if (stick.pointerId === event.pointerId) this.updateStick(stick, event);
    }, { signal: this.lifetime.signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      element.addEventListener(type, (event) => {
        if (stick.pointerId === (event as PointerEvent).pointerId) this.releaseStick(stick);
      }, { signal: this.lifetime.signal });
    }
    return element;
  }

  private updateStick(stick: Stick, event: PointerEvent): void {
    const rect = stick.element.getBoundingClientRect();
    const radius = Math.max(20, rect.width * 0.32);
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(x, y);
    const strength = Math.min(1, distance / radius);
    const magnitude = Math.max(0, (strength - DEAD_ZONE) / (1 - DEAD_ZONE));
    const nx = distance > 0 ? x / distance : 0;
    const ny = distance > 0 ? y / distance : 0;
    stick.thumb.style.transform = `translate(${nx * strength * radius}px, ${ny * strength * radius}px)`;
    if (stick.kind === 'move') {
      this.move.x = nx * magnitude;
      this.move.y = ny * magnitude;
    } else if (magnitude > 0) {
      this.aim.x = nx;
      this.aim.y = ny;
    }
  }

  private releaseStick(stick: Stick): void {
    const pointerId = stick.pointerId;
    stick.pointerId = null;
    stick.element.classList.remove('is-pressed');
    stick.thumb.style.transform = '';
    if (stick.kind === 'move') {
      this.move.x = 0;
      this.move.y = 0;
    } else {
      this.firing = false;
    }
    if (pointerId !== null) this.releaseCapture(stick.element, pointerId);
  }

  private createButton(action: Exclude<TouchAction, 'attack'>, caption: string, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `touch-action touch-action-${action}`;
    button.textContent = caption;
    button.setAttribute('aria-label', label);
    button.addEventListener('pointerdown', (event) => {
      if (!this.available || !this.playing || event.button !== 0) return;
      this.buttonPointers.set(event.pointerId, button);
      button.classList.add('is-pressed');
      this.capture(button, event.pointerId);
      this.queue(action);
    }, { signal: this.lifetime.signal });
    const release = (event: Event) => {
      const pointerId = (event as PointerEvent).pointerId;
      if (this.buttonPointers.get(pointerId) !== button) return;
      this.buttonPointers.delete(pointerId);
      if (![...this.buttonPointers.values()].includes(button)) button.classList.remove('is-pressed');
      this.releaseCapture(button, pointerId);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(type, release, { signal: this.lifetime.signal });
    }
    button.addEventListener('click', (event) => {
      // Keyboard and assistive-technology activation has no preceding pointerdown.
      if (event.detail === 0) this.queue(action);
      event.stopPropagation();
    }, { signal: this.lifetime.signal });
    return button;
  }

  private capture(element: HTMLElement, pointerId: number): void {
    try { element.setPointerCapture(pointerId); } catch { /* Pointer already cancelled by the browser. */ }
  }

  private releaseCapture(element: HTMLElement, pointerId: number): void {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  }
}
