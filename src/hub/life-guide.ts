import type { MetaProfile } from '../meta/types';
import { LIFE_PLACES, LIFE_STEPS, lifeStepDestination, nextLifeStep, type LifeDestination } from '../meta/life-path';
import './life-guide.css';

export interface RunReturnReceipt {
  runId: string;
  reward: { fragments: number; growth: number; seeds: number };
}

export interface LifeGuideHandle {
  update(profile: MetaProfile, hidden: boolean): void;
  dispose(): void;
}

/** The hall's next-step strip. Only the current step is a button; progress comes from the save on each update. */
export function mountLifeGuide(host: HTMLElement, onGo: (action: LifeDestination) => void): LifeGuideHandle {
  const nav = document.createElement('nav');
  nav.className = 'ag-life-path';
  nav.setAttribute('aria-label', '下一步');
  const list = document.createElement('ol');
  const hint = document.createElement('p');
  hint.className = 'ag-life-path-hint';
  nav.append(list, hint);
  host.append(nav);

  function update(profile: MetaProfile, hidden: boolean) {
    const current = nextLifeStep(profile);
    const currentIndex = LIFE_STEPS.findIndex((step) => step.id === current);
    list.replaceChildren();
    for (const [index, step] of LIFE_STEPS.entries()) {
      const item = document.createElement('li');
      const state = index === currentIndex ? 'current' : index < currentIndex ? 'done' : 'later';
      item.className = `is-${state}`;
      if (state === 'current') {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = step.label;
        button.title = step.hint;
        button.setAttribute('aria-current', 'step');
        button.addEventListener('click', () => onGo(lifeStepDestination(profile, current)));
        item.append(button);
      } else {
        const label = document.createElement('span');
        label.textContent = step.label;
        item.append(label);
      }
      list.append(item);
    }
    const step = LIFE_STEPS[currentIndex];
    hint.textContent = step.hint;
    nav.hidden = hidden;
  }

  return {
    update,
    dispose() { nav.remove(); },
  };
}

/** One card for the settlement already stored on this page. Closing it does not settle again. */
export function mountReturnCard(
  host: HTMLElement,
  reward: RunReturnReceipt['reward'],
  profile: MetaProfile,
  onGo: (action: LifeDestination) => void,
  onClose: () => void,
): { close(): void } {
  const step = nextLifeStep(profile);
  const destination = lifeStepDestination(profile, step);
  const copy = LIFE_STEPS.find((item) => item.id === step)!;
  const veil = document.createElement('div');
  veil.className = 'ag-tour-veil ag-return-veil';
  const card = document.createElement('section');
  card.className = 'ag-mode-panel ag-return-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'ag-return-title');

  const eyebrow = document.createElement('p');
  eyebrow.className = 'ag-mode-eyebrow';
  eyebrow.textContent = 'THIS RUN';
  const title = document.createElement('h1');
  title.id = 'ag-return-title';
  title.textContent = '带回画廊';
  const lead = document.createElement('p');
  lead.textContent = '这一局结算已经入账。下面是当时记下的收获。';
  const lines = document.createElement('ul');
  lines.className = 'ag-return-lines';
  for (const text of [`修复碎片 ${reward.fragments}`, `花园生长 +${reward.growth}`, `种子 ${reward.seeds}`]) {
    const line = document.createElement('li');
    line.textContent = text;
    lines.append(line);
  }
  const next = document.createElement('p');
  next.className = 'ag-return-next';
  next.textContent = `下一步：${copy.label}。${copy.hint}`;
  const actions = document.createElement('div');
  actions.className = 'ag-mode-actions';
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'is-primary';
  go.textContent = `前往${LIFE_PLACES[destination]}`;
  const stay = document.createElement('button');
  stay.type = 'button';
  stay.textContent = '留在画廊';
  actions.append(go, stay);
  card.append(eyebrow, title, lead, lines, next, actions);
  veil.append(card);
  host.append(veil);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    veil.remove();
  };
  go.addEventListener('click', () => { if (!closed) onGo(destination); });
  stay.addEventListener('click', () => { if (!closed) onClose(); });
  veil.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!closed) onClose();
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  go.focus({ preventScroll: true });
  return { close };
}
