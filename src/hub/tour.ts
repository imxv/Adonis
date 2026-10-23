import type { GalleryAction, GalleryHandle } from './gallery';
import './tour.css';

/*
 * The hall half of the beginner tutorial: the first-visit question, then a short walk that shows
 * where things are. It ends at the main painting, where the combat half takes over.
 */

interface Step {
  title: string;
  text: string;
  touch?: string;
  /** The destination that glows and is pointed to while this step is up. */
  target: GalleryAction | null;
  /** Standing beside any of these, or using its shortcut, completes the step. */
  area?: GalleryAction[];
  done?(walked: number): boolean;
}

const STEPS: Step[] = [
  {
    title: '走动',
    text: '用 WASD 或方向键走动；也可以直接点击地面，阿多尼斯会自己走过去。',
    touch: '点一下地面，阿多尼斯会自己走过去。',
    target: null,
    done: (walked) => walked > 160,
  },
  {
    title: '生活区',
    text: '画廊左翼是生活区：湖畔钓鱼、归途厨房、居民委托和月桂花园。钓到的鱼、种出的作物能做成出征补给。走过去看看。',
    target: 'fishing',
    area: ['fishing', 'kitchen', 'commissions', 'garden'],
  },
  {
    title: '旅程与收藏',
    text: '右翼是另外几段旅程：爱琴海岸是一幅能走进去的立体画，珍藏陈列收着你带回的发现，回廊修复用材料修好旧画。走过去看看。',
    target: 'world3d',
    area: ['world3d', 'collection', 'repair'],
  },
  {
    title: '画中轮回',
    text: '正中的大画是主线冒险：五层地牢，每层一种画风。走到画前按 F 进入，在画里实战一次。',
    touch: '正中的大画是主线冒险：五层地牢，每层一种画风。走到画前点「进入」，在画里实战一次。',
    target: 'adventure',
  },
];

/** What the hall should do with an action while the tour runs. */
export type TourVerdict = 'pass' | 'block' | 'enter';

export interface TourOptions {
  host: HTMLElement;
  gallery: GalleryHandle;
  onSkip(): void;
}

export class HallTour {
  private readonly card = document.createElement('section');
  private step = -1;
  private walkedAt = 0;
  private shownAt = 0;
  private timer = 0;
  private advancing = 0;
  private nudgeTimer = 0;
  /** The step's place was reached through its shortcut button rather than on foot. */
  private reached = false;

  constructor(private readonly options: TourOptions) {
    this.card.className = 'ag-mode-panel ag-tour';
    this.card.setAttribute('role', 'status');
    this.card.setAttribute('aria-live', 'polite');
    this.card.innerHTML = `
      <div class="ag-tour-head"><p class="ag-mode-eyebrow ag-tour-count"></p><button type="button" class="ag-tour-skip">跳过教程</button></div>
      <h2 class="ag-tour-title"></h2>
      <p class="ag-tour-text"></p>
      <p class="ag-tour-nudge" hidden>教程里先不进去，走完导览后随时可以回来。</p>`;
    this.card.querySelector('.ag-tour-skip')!.addEventListener('click', () => options.onSkip());
    options.host.append(this.card);
    this.show(0);
    this.timer = window.setInterval(() => this.tick(), 100);
  }

  private show(index: number) {
    this.step = index;
    const step = STEPS[index];
    const touch = matchMedia('(pointer: coarse)').matches;
    this.card.classList.remove('is-done');
    this.card.querySelector('.ag-tour-count')!.textContent = `TUTORIAL ${index + 1}/${STEPS.length}`;
    this.card.querySelector('.ag-tour-title')!.textContent = step.title;
    this.card.querySelector('.ag-tour-text')!.textContent = touch && step.touch ? step.touch : step.text;
    this.walkedAt = this.options.gallery.progress().walked;
    this.reached = false;
    this.shownAt = performance.now();
    this.options.gallery.guide(step.target);
  }

  private tick() {
    if (this.advancing || this.step < 0) return;
    const { walked, near } = this.options.gallery.progress();
    const step = STEPS[this.step];
    const done = this.reached || (!!near && !!step.area?.includes(near)) || !!step.done?.(walked - this.walkedAt);
    // Each card stays up long enough to read, even when its goal is already met.
    if (performance.now() - this.shownAt < 1500 || !done) return;
    this.card.classList.add('is-done');
    this.advancing = window.setTimeout(() => {
      this.advancing = 0;
      if (this.step < STEPS.length - 1) this.show(this.step + 1);
    }, 700);
  }

  /** Only the main painting opens during the tour; it starts the combat half from any step. */
  handle(action: GalleryAction): TourVerdict {
    if (action === 'adventure') return 'enter';
    // Finding the place is the lesson, on foot or by its shortcut; only other doors get the reminder.
    if (STEPS[this.step]?.area?.includes(action)) {
      this.reached = true;
      return 'block';
    }
    const nudge = this.card.querySelector<HTMLElement>('.ag-tour-nudge')!;
    nudge.hidden = false;
    this.card.classList.remove('is-nudged');
    void this.card.offsetWidth;
    this.card.classList.add('is-nudged');
    clearTimeout(this.nudgeTimer);
    this.nudgeTimer = window.setTimeout(() => { nudge.hidden = true; }, 3200);
    return 'block';
  }

  dispose() {
    clearInterval(this.timer);
    clearTimeout(this.advancing);
    clearTimeout(this.nudgeTimer);
    this.options.gallery.guide(null);
    this.card.remove();
  }
}

/** The first-visit question over the paused hall. Resolves once, with the visitor's answer. */
export function askTutorial(host: HTMLElement, returning: boolean, onAnswer: (start: boolean) => void) {
  const veil = document.createElement('div');
  veil.className = 'ag-tour-veil';
  veil.innerHTML = `
    <section class="ag-mode-panel ag-tour-ask" role="dialog" aria-modal="true" aria-labelledby="ag-tour-ask-title">
      <p class="ag-mode-eyebrow">WELCOME</p>
      <h1 id="ag-tour-ask-title">第一次来万象画廊？</h1>
      <p>新手教程会先带你认识画廊，再进画里实战一次：移动、射击、冲刺、升级、宝箱和换枪。大约三分钟，中途随时可以跳过。</p>
      <p class="ag-tour-ask-note">之后想再看一遍，在「画中轮回 → 设置 → 新手教程」里重新开始。</p>
      <div class="ag-mode-actions"><button type="button" class="is-primary" data-start>开始新手教程</button><button type="button" data-skip>跳过，直接游玩</button></div>
    </section>`;
  host.append(veil);
  const start = veil.querySelector<HTMLButtonElement>('[data-start]')!;
  const skip = veil.querySelector<HTMLButtonElement>('[data-skip]')!;
  const events = new AbortController();
  let answered = false;
  const answer = (value: boolean) => {
    if (answered) return;
    answered = true;
    events.abort();
    veil.remove();
    onAnswer(value);
  };
  start.addEventListener('click', () => answer(true), { signal: events.signal });
  skip.addEventListener('click', () => answer(false), { signal: events.signal });
  // The hall is paused behind the question, so these keys are the dialog's alone.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') answer(false);
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's'].includes(event.key)) {
      (document.activeElement === start ? skip : start).focus({ preventScroll: true });
    } else return;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true, signal: events.signal });
  // Someone who already has a run or a score on this browser is offered the way out first.
  (returning ? skip : start).focus({ preventScroll: true });
  return { cancel: () => { if (!answered) { answered = true; events.abort(); veil.remove(); } } };
}
