import { audio } from '../audio/audio';
import { DIFFICULTIES, type DifficultyId } from '../data/difficulty';
import { difficultyArt } from '../pixel/difficultyArt';
import { E } from '../pixel/palette';
import { el, img, px } from './pxhtml';
import type { LayerHost } from './screens';
import './difficultySelect.css';

interface DifficultySelectOptions {
  initial: DifficultyId;
  onConfirm: (id: DifficultyId) => void;
  onBack: () => void;
}

const REALMS = [
  { id: 'easy', name: '极乐原野', label: '轻松', number: 'I', subtitle: 'ELYSIUM', promise: '在神的庇护下启程', color: E.green, light: E.cream },
  { id: 'normal', name: '奥林匹斯', label: '标准', number: 'II', subtitle: 'OLYMPUS', promise: '让诸神见证你的勇气', color: E.yellow, light: E.cream },
  { id: 'hard', name: '塔尔塔罗斯', label: '挑战', number: 'III', subtitle: 'TARTARUS', promise: '向深渊立下不屈的誓约', color: E.orange, light: E.pink },
] as const;

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** A run starts only after confirmation; browsing and returning never change the saved difficulty. */
export function openDifficultySelect(host: LayerHost, options: DifficultySelectOptions): void {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = el('div', 'overlay difficulty-select');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '选择游戏难度。左右方向键或 A、D 切换，回车或空格确认，Esc 返回。');
  overlay.innerHTML = `<div class="ds-backdrop" aria-hidden="true"><div class="ds-sky ds-sky-easy"></div><div class="ds-sky ds-sky-normal"></div><div class="ds-sky ds-sky-hard"></div><div class="ds-horizon"></div>${Array.from({ length: 14 }, (_, i) => `<i class="ds-mote" style="--x:${(i * 37 + 13) % 100}%;--y:${(i * 23 + 11) % 100}%;--delay:${-i * 0.57}s;--duration:${4 + i % 4}s"></i>`).join('')}</div>
    <div class="ds-meander ds-meander-top" aria-hidden="true"></div>
    <header class="ds-header"><div>${px('CHOOSE YOUR FATE', E.greyM, { small: true })}</div><div>${px('选择你的试炼', E.cream, { scale: 2 })}</div></header>
    <button type="button" class="ds-back" aria-label="返回角色选择">${px('‹ 返回', E.grey)}</button>
    <div class="ds-counter" aria-hidden="true"></div>
    <div class="ds-viewport" role="group" aria-roledescription="轮播" aria-label="三种试炼难度"><div class="ds-track"></div></div>
    <div class="ds-dots" aria-hidden="true">${REALMS.map(() => '<i></i>').join('')}</div>
    <div class="ds-actions"><button type="button" class="ds-arrow ds-prev" aria-label="上一个难度">${px('◀', E.cream)}</button><button type="button" class="ds-confirm" data-action="confirm" aria-label="确认难度，开始冒险"><span class="ds-confirm-label">${px('踏入试炼', E.ink, { outline: false })}</span>${px('ENTER', E.brownD, { small: true, outline: false })}</button><button type="button" class="ds-arrow ds-next" aria-label="下一个难度">${px('▶', E.cream)}</button></div>
    <div class="ds-guide" aria-hidden="true">${px('← → / A D 选择', E.greyM)}<i></i>${px('滚轮 / 拖动切换', E.greyM)}</div>
    <div class="ds-status" role="status" aria-live="polite" aria-atomic="true"></div><div class="ds-confirm-flash" aria-hidden="true"></div>`;

  const viewport = overlay.querySelector<HTMLElement>('.ds-viewport')!;
  const track = overlay.querySelector<HTMLElement>('.ds-track')!;
  const counter = overlay.querySelector<HTMLElement>('.ds-counter')!;
  const status = overlay.querySelector<HTMLElement>('.ds-status')!;
  const back = overlay.querySelector<HTMLButtonElement>('.ds-back')!;
  const prev = overlay.querySelector<HTMLButtonElement>('.ds-prev')!;
  const next = overlay.querySelector<HTMLButtonElement>('.ds-next')!;
  const confirm = overlay.querySelector<HTMLButtonElement>('.ds-confirm')!;
  const dots = Array.from(overlay.querySelectorAll<HTMLElement>('.ds-dots i'));
  const events = new AbortController();
  const initialIndex = REALMS.findIndex((realm) => realm.id === options.initial);
  let selected = initialIndex < 0 ? 1 : initialIndex;
  let done = false;
  let wheelAt = -Infinity;
  let suppressClickUntil = 0;
  let drag: { id: number; x: number; y: number; card: number } | undefined;
  let finishTimer = 0;
  let disposed = false;

  const clearDrag = () => {
    const pointerId = drag?.id;
    drag = undefined;
    overlay.classList.remove('is-dragging');
    if (pointerId !== undefined && viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    done = true;
    events.abort();
    window.clearTimeout(finishTimer);
    finishTimer = 0;
    clearDrag();
  };

  const cards = REALMS.map((realm, index) => {
    const difficulty = DIFFICULTIES[realm.id];
    const art = difficultyArt(realm.id);
    const card = el('button', 'ds-card') as HTMLButtonElement;
    card.type = 'button';
    card.dataset.difficulty = realm.id;
    card.style.setProperty('--card-color', realm.color);
    card.style.setProperty('--card-light', realm.light);
    card.setAttribute('aria-label', `${realm.name}，${realm.label}难度。敌人数量 ${percent(difficulty.enemies)}，敌人和首领生命 ${percent(difficulty.hp)}，陷阱生成率 ${percent(difficulty.traps)}。`);
    card.innerHTML = `<div class="ds-card-head"><span class="ds-number">${px(realm.number, realm.color, { small: true })}</span>${px(realm.name, realm.light)}<span class="ds-badge">${px(realm.label, realm.color)}</span></div><div class="ds-art">${img(art.src, art.width, art.height, 1, 'ds-painting')}<span class="ds-scene-title">${px(realm.subtitle, realm.light, { small: true })}</span><i class="ds-scene-shine"></i></div><div class="ds-promise">${px(realm.promise, E.grey)}</div><div class="ds-metrics">${[['敌人数量', difficulty.enemies], ['敌方生命', difficulty.hp], ['陷阱频率', difficulty.traps]].map(([label, value]) => `<div>${px(String(label), E.greyM)}${px(percent(Number(value)), realm.light, { small: true })}</div>`).join('')}</div><i class="ds-card-corner ds-corner-tl"></i><i class="ds-card-corner ds-corner-tr"></i><i class="ds-card-corner ds-corner-bl"></i><i class="ds-card-corner ds-corner-br"></i>`;
    card.addEventListener('click', () => {
      if (performance.now() < suppressClickUntil) return;
      select(index);
    }, { signal: events.signal });
    track.appendChild(card);
    return card;
  });

  // Sizes are logical UI pixels, before the shared root zoom. Portrait cards are wider.
  const cardStep = () => cards[0].offsetWidth + (parseFloat(getComputedStyle(track).columnGap) || 0);
  const positionTrack = (offset = 0) => {
    track.style.left = `${(viewport.clientWidth - cards[0].offsetWidth) / 2}px`;
    track.style.transform = `translate3d(${-selected * cardStep() + offset}px, 0, 0)`;
  };

  function select(index: number) {
    if (done) return;
    const bounded = Math.max(0, Math.min(REALMS.length - 1, index));
    if (selected !== bounded) audio.hover();
    selected = bounded;
    const realm = REALMS[selected];
    const difficulty = DIFFICULTIES[realm.id];
    overlay.dataset.difficulty = realm.id;
    positionTrack();
    cards.forEach((card, i) => {
      card.classList.toggle('is-selected', i === selected);
      card.setAttribute('aria-pressed', String(i === selected));
      card.tabIndex = i === selected ? 0 : -1;
    });
    dots.forEach((dot, i) => dot.classList.toggle('is-selected', i === selected));
    prev.disabled = selected === 0;
    next.disabled = selected === REALMS.length - 1;
    counter.innerHTML = px(`0${selected + 1} / 03`, realm.color, { small: true });
    confirm.setAttribute('aria-label', `进入${realm.name}，${realm.label}难度，开始冒险`);
    status.textContent = `${realm.name}，${realm.label}难度。敌人数量 ${percent(difficulty.enemies)}，敌人和首领生命 ${percent(difficulty.hp)}，陷阱生成率 ${percent(difficulty.traps)}。`;
  }

  function finish(confirmed: boolean) {
    if (done) return;
    done = true;
    events.abort();
    clearDrag();
    overlay.classList.add(confirmed ? 'is-confirming' : 'is-leaving');
    host.escUsed();
    audio.select();
    const close = () => {
      // If a caller has already discarded this screen, do not start a stale run.
      if (disposed || !overlay.isConnected) return;
      host.close(layer);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      if (confirmed) options.onConfirm(REALMS[selected].id);
      else options.onBack();
    };
    const fast = (window as Window & { __fastUi?: boolean }).__fastUi;
    if (fast || window.matchMedia('(prefers-reduced-motion: reduce)').matches) close();
    else finishTimer = window.setTimeout(close, confirmed ? 260 : 140);
  }

  const layer = host.push(overlay, (event) => {
    const handled = ['Escape', 'Backspace', 'ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D', 'Enter', ' ', 'Tab'].includes(event.key);
    if (!handled) return;
    event.preventDefault();
    if (done || event.repeat) return;
    if (event.key === 'Escape' || event.key === 'Backspace') finish(false);
    else if (['ArrowLeft', 'a', 'A'].includes(event.key)) select(selected - 1);
    else if (['ArrowRight', 'd', 'D'].includes(event.key)) select(selected + 1);
    else if (event.key === 'Tab') {
      const controls = [back, prev, cards[selected], next, confirm].filter((control) => !control.disabled);
      const current = controls.indexOf(document.activeElement as HTMLButtonElement);
      controls[(current + controls.length + (event.shiftKey ? -1 : 1)) % controls.length].focus({ preventScroll: true });
    } else if (document.activeElement === back) finish(false);
    else if (document.activeElement === prev) select(selected - 1);
    else if (document.activeElement === next) select(selected + 1);
    else finish(true);
  });
  layer.dispose = dispose;

  back.addEventListener('click', () => finish(false), { signal: events.signal });
  prev.addEventListener('click', () => select(selected - 1), { signal: events.signal });
  next.addEventListener('click', () => select(selected + 1), { signal: events.signal });
  confirm.addEventListener('click', () => finish(true), { signal: events.signal });
  const reflow = () => {
    if (done || !overlay.isConnected) return;
    if (drag) {
      const pointerId = drag.id;
      drag = undefined;
      overlay.classList.remove('is-dragging');
      if (viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
    }
    positionTrack();
  };
  window.addEventListener('resize', reflow, { signal: events.signal });
  window.addEventListener('mobileviewportchange', reflow, { signal: events.signal });
  overlay.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (done || drag || performance.now() - wheelAt < 320) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(delta) < 4) return;
    wheelAt = performance.now();
    select(selected + Math.sign(delta));
  }, { passive: false, signal: events.signal });

  viewport.addEventListener('pointerdown', (event) => {
    if (done || drag || !event.isPrimary || event.button !== 0) return;
    // A partially visible side button must not scroll the clipped viewport when focused.
    event.preventDefault();
    const card = (event.target as HTMLElement).closest<HTMLButtonElement>('.ds-card');
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, card: card ? cards.indexOf(card) : -1 };
    viewport.setPointerCapture(event.pointerId);
  }, { signal: events.signal });
  viewport.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId || done) return;
    const dx = (event.clientX - drag.x) * 480 / overlay.getBoundingClientRect().width;
    if (Math.abs(dx) < 4) return;
    overlay.classList.add('is-dragging');
    const offset = Math.max(-100, Math.min(100, dx));
    positionTrack(offset);
  }, { signal: events.signal });
  const release = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    const held = drag;
    drag = undefined;
    overlay.classList.remove('is-dragging');
    const dx = (event.clientX - held.x) * 480 / overlay.getBoundingClientRect().width;
    const dy = (event.clientY - held.y) * 480 / overlay.getBoundingClientRect().width;
    suppressClickUntil = performance.now() + 100;
    if (event.type === 'pointerup' && Math.abs(dx) >= 24 && Math.abs(dx) > Math.abs(dy)) select(selected + (dx < 0 ? 1 : -1));
    else if (event.type === 'pointerup' && Math.abs(dx) < 8 && Math.abs(dy) < 8 && held.card >= 0) select(held.card);
    else select(selected);
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  };
  viewport.addEventListener('pointerup', release, { signal: events.signal });
  viewport.addEventListener('pointercancel', release, { signal: events.signal });
  viewport.addEventListener('lostpointercapture', release, { signal: events.signal });

  select(selected);
  confirm.focus({ preventScroll: true });
}
