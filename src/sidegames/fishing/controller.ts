import { audio, type FishSound } from '../../audio/audio';
import { cancelFishingRound, createFishingRound, stepFishingRound, type FishingPhase, type FishingRound, type FishingReason } from './rules';
import { createFishingView, type FishingViewModel } from './view';

/** A UI adapter to the shared life service. It contains no catalog, RNG for
 * rewards, inventory, or persistence; index.ts supplies the real C service. */
export interface FishingEconomyPort {
  snapshot(): { canStart: boolean; warning: string | null; catalog: FishingViewModel['catalog'] };
  begin(): { attempt: { id: string; seed: number | string } | null; message: string };
  finish(id: string, outcome: 'caught' | 'escaped' | 'cancelled'): {
    committed: boolean; message: string; fishId?: string;
  };
  subscribe(listener: () => void): () => void;
}

export interface FishingOptions { container: HTMLElement; onExit: () => void }
export interface FishingHandle { dispose(): void }

const PHASE_SOUND: Partial<Record<FishingPhase, FishSound>> = { waiting: 'cast', bite: 'bite', reeling: 'hook', success: 'catch', failed: 'escape' };

/** One sound for each change the round goes through: the cast, a nibble, the bite, the hook, a run, and the end. */
function cueSound(before: FishingRound, after: FishingRound, reeling: boolean) {
  const phase = after.phase !== before.phase ? PHASE_SOUND[after.phase] : undefined;
  if (phase) audio.fish(phase);
  else if (after.bobberCue === 'nibble' && before.bobberCue !== 'nibble') audio.fish('nibble');
  if (after.fishCue === 'surge-warning' && before.fishCue !== 'surge-warning') audio.fish('surge');
  if (after.phase === 'reeling' && reeling) audio.fish('reel');
}

const FAILURE_COPY: Record<Exclude<FishingReason, 'landed' | 'cancelled' | null>, string> = {
  'short-cast': '抛得太近，鱼没有靠过来。下次多蓄一点力。',
  overcast: '用力过猛，钩子越过了鱼群。蓄力约一秒就松开。',
  'early-hook': '鱼只是轻轻试探。等浮标沉下、出现“现在扬竿”再按。',
  'missed-bite': '鱼松口了。看到浮标沉下时，要及时按下扬竿。',
  'line-broke': '鱼线绷断了。张力升高或鱼冲刺时，先松开让线。',
  'fish-escaped': '鱼线松得太久，鱼脱钩了。低张力时记得轻轻收线。',
  'time-limit': '这次拉锯太久，鱼游回了深处。下一竿再试试。',
};

const isTerminal = (round: FishingRound) => ['success', 'failed', 'cancelled'].includes(round.phase);

export function mountFishingController({ container, onExit }: FishingOptions, economy: FishingEconomyPort): FishingHandle {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let disposed = false;
  let exiting = false;
  let transacting = false;
  let economyState = economy.snapshot();
  let round: FishingRound | null = null;
  let attempt: { id: string; seed: number | string } | null = null;
  let settled = false;
  let settlement = '';
  let settlementError = false;
  let fishId: string | undefined;
  let message = '按住蓄力，松开抛竿。今天的鱼获可以带回厨房，或交给需要它的人。';
  let pointerHeld = false;
  const heldKeys = new Set<string>();
  let pressed = false;
  let released = false;
  let panelOpen = false;
  let animationTime = 0;
  let frame = 0;
  let previousTime = performance.now();
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const held = () => pointerHeld || heldKeys.size > 0;

  function transact<T>(action: () => T): T {
    transacting = true;
    try { return action(); } finally { transacting = false; economyState = economy.snapshot(); }
  }

  function clearInput() {
    pointerHeld = false; heldKeys.clear(); pressed = false; released = false;
  }

  function finish(outcome: 'caught' | 'escaped' | 'cancelled') {
    if (!attempt || settled) return;
    try {
      const result = transact(() => economy.finish(attempt!.id, outcome));
      settled = result.committed;
      settlementError = !result.committed;
      settlement = result.message;
      fishId = result.fishId;
    } catch {
      settlementError = true;
      settlement = '结果还没有保存。可以重试保存；离开将放弃这次未保存的尝试。';
    }
  }

  function begin() {
    if (disposed || exiting || round || !economyState.canStart) return;
    try {
      const result = transact(() => economy.begin());
      message = result.message;
      if (!result.attempt) { settlementError = true; render(); return; }
      attempt = result.attempt;
      round = createFishingRound(attempt.seed);
      settled = false; settlementError = false; settlement = ''; fishId = undefined;
      previousTime = performance.now();
    } catch {
      message = '暂时无法开始这次钓鱼。请检查存储提示，再试一次。';
      settlementError = true;
    }
    render();
  }

  function input(source: 'pointer' | 'keyboard', down: boolean, key = 'Space') {
    if (disposed || exiting || panelOpen) return;
    if (down && !round) begin();
    if (!round || isTerminal(round)) return;
    const wasHeld = held();
    if (source === 'pointer') pointerHeld = down;
    else if (down) heldKeys.add(key); else heldKeys.delete(key);
    if (!wasHeld && held()) pressed = true;
    if (wasHeld && !held()) released = true;
  }

  function retry() {
    if (disposed || exiting || panelOpen) return;
    clearInput();
    if (round && isTerminal(round) && !settled) {
      finish(round.phase === 'success' ? 'caught' : round.phase === 'failed' ? 'escaped' : 'cancelled');
      render();
      return;
    }
    round = null; attempt = null; settled = false; settlement = ''; settlementError = false; fishId = undefined;
    message = '再选一个好时机。按住蓄力约一秒，松开抛竿。';
    render(); view.primaryButton.focus({ preventScroll: true });
  }

  function cancel(messageText: string) {
    clearInput();
    if (round && !isTerminal(round)) round = cancelFishingRound(round);
    else if (round && !settled) round = { ...round, phase: 'cancelled', reason: 'cancelled', bobberCue: 'quiet', biteRemaining: 0 };
    if (attempt && !settled) finish('cancelled');
    message = messageText;
    render();
  }

  function exit() {
    if (disposed || exiting) return;
    exiting = true;
    cancel('这次钓鱼已结束，没有后台收线或额外奖励。');
    dispose();
    onExit();
  }

  const view = createFishingView(container, {
    onPrimaryDown: () => input('pointer', true),
    onPrimaryUp: () => input('pointer', false),
    onRetry: retry,
    onExit: exit,
    onPanelChange: open => {
      panelOpen = open;
      clearInput();
      previousTime = performance.now();
    },
  });

  function render() {
    if (disposed) return;
    const snapshot = economyState;
    let title = '在苇影湖，等一尾鱼。';
    let instruction = '按住蓄力约一秒，松开抛竿。';
    let cue = '空格 / Enter，或按住下方按钮';
    if (round) {
      if (round.phase === 'casting') {
        title = '选好落点，送出鱼钩。';
        instruction = '按住蓄力，松开抛竿。不要冲过上限。';
        cue = round.castStarted ? '松开就会抛竿' : '按住开始蓄力';
      } else if (round.phase === 'waiting') {
        title = '看着浮标，耐心一点。';
        instruction = '轻触只是试探；等浮标沉下再扬竿。';
        cue = round.bobberCue === 'nibble' ? '轻轻碰了一下……先别扬竿' : '浮标还在水面，等鱼真正咬钩';
      } else if (round.phase === 'bite') {
        title = '现在扬竿！';
        instruction = '立刻新按一下按钮或空格，钩住它。';
        cue = `浮标沉下了 · 剩余 ${Math.max(0, round.biteRemaining).toFixed(1)} 秒`;
      } else if (round.phase === 'reeling') {
        title = '稳住张力，把鱼带近。';
        instruction = '按住收线，松开让线。太紧会断，太松会脱钩。';
        cue = round.fishCue === 'surge-warning' ? '它要冲刺了！先松开让线'
          : round.fishCue === 'surge' ? '正在冲刺 · 放线减压，别完全松垮'
            : round.tension < .25 ? '鱼线偏松，轻轻收线'
              : round.tension > .72 ? '张力偏高，松开缓一缓'
                : round.fishCue === 'rest' ? '鱼暂时平静，可以收线' : '鱼在拉扯，留意张力';
      } else if (round.phase === 'success') {
        title = '鱼获上岸！'; instruction = '这次判断和收线都有了回报。'; cue = '看看鱼篓，或再钓一条。';
      } else if (round.phase === 'failed') {
        title = '这一尾，留给下次。'; instruction = FAILURE_COPY[round.reason as keyof typeof FAILURE_COPY] ?? '再试一次，跟着浮标和张力的提示。'; cue = '失败不扣材料，也不会发放鱼获。';
      } else {
        title = '收好鱼竿，休息一下。'; instruction = message; cue = '这次尝试已取消，可以重新抛竿。';
      }
    }
    const phase = settlementError ? 'error' : round?.phase === 'failed' ? 'failure' : round?.phase ?? 'idle';
    const model: FishingViewModel = {
      phase, title, instruction, cue, tension: round?.tension ?? 0, progress: round?.progress ?? 0,
      castPower: round?.castPower ?? 0, elapsed: round?.elapsed ?? 0,
      status: snapshot.warning || message, catalog: snapshot.catalog, fishId, settlement,
      surging: round?.fishCue === 'surge' || round?.fishCue === 'surge-warning',
      primaryHeld: held(), disabled: !snapshot.canStart && !round || settlementError,
      bobberCue: round?.bobberCue ?? 'quiet',
      retryLabel: settlementError && round ? '重试保存' : round?.phase === 'success' ? '再钓一条' : '再抛一竿',
      announcementCue: round?.phase === 'bite' ? '浮标沉下了，现在按下扬竿。' : cue,
      animationTime, fishCue: round?.fishCue ?? 'rest', reducedMotion: motionPreference.matches,
    };
    view.render(model);
    // Readable diagnostics mirror visible controls; no reward/engine globals.
    view.element.dataset.phase = phase;
    view.element.dataset.mechanicPhase = round?.phase ?? 'idle';
    view.element.dataset.tension = String(round?.tension ?? 0);
    view.element.dataset.progress = String(round?.progress ?? 0);
    view.element.dataset.fishCue = round?.fishCue ?? '';
    view.element.dataset.bobberCue = round?.bobberCue ?? '';
    view.element.dataset.attemptId = attempt?.id ?? '';
    view.element.dataset.settled = String(settled);
  }

  function tick(now: number) {
    if (disposed) return;
    const elapsed = (now - previousTime) / 1000;
    previousTime = now;
    animationTime += Math.max(0, Math.min(elapsed, .1));
    if (round && !isTerminal(round)) {
      if (elapsed > 2) cancel('离开画面太久，这次尝试已取消。回来后可以重新抛竿。');
      else {
        const before = round;
        round = stepFishingRound(round, elapsed, { held: held(), pressed, released });
        cueSound(before, round, held());
        pressed = false; released = false;
        if (isTerminal(round)) {
          clearInput();
          finish(round.phase === 'success' ? 'caught' : round.phase === 'failed' ? 'escaped' : 'cancelled');
        }
      }
    }
    render();
    frame = requestAnimationFrame(tick);
  }

  function keyDown(event: KeyboardEvent) {
    if (disposed || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.repeat) return;
      if (!view.handleEscape()) exit();
      return;
    }
    if (event.key === 'Tab') {
      const scope = view.getFocusScope();
      const buttons = [...scope.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        .filter(button => button.getClientRects().length > 0);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      event.stopImmediatePropagation(); return;
    }
    if ((event.code === 'Space' || event.key === 'Enter') && event.repeat) {
      // The result focuses Retry. A held Enter must not auto-click through it.
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    const active = document.activeElement;
    const otherButton = active instanceof HTMLButtonElement && active !== view.primaryButton;
    if ((event.code === 'Space' || event.key === 'Enter') && !otherButton) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat) input('keyboard', true, event.code === 'Space' ? 'Space' : 'Enter');
    } else {
      // Preserve native button activation/scrolling while isolating game input.
      event.stopImmediatePropagation();
    }
  }
  function keyUp(event: KeyboardEvent) {
    if (event.code !== 'Space' && event.key !== 'Enter') return;
    const key = event.code === 'Space' ? 'Space' : 'Enter';
    if (!heldKeys.has(key)) return;
    event.preventDefault(); event.stopImmediatePropagation(); input('keyboard', false, key);
  }
  const blur = () => {
    if (round && !isTerminal(round)) cancel('钓点失去焦点，这次尝试已取消。回来后可以重新抛竿。');
    else clearInput();
  };
  const hidden = () => { if (document.hidden) cancel('画面切到后台，这次钓鱼已取消。重新抛竿后再开始。'); };
  const pageHide = () => { cancel('离开钓点，这次尝试已取消。'); };
  const unsubscribe = economy.subscribe(() => {
    if (!disposed && !transacting) { economyState = economy.snapshot(); render(); }
  });

  function dispose() {
    if (disposed) return;
    // Even direct host disposal ends the persisted attempt before losing UI.
    clearInput();
    if (attempt && !settled) {
      if (round && !isTerminal(round)) round = cancelFishingRound(round);
      finish('cancelled');
    }
    disposed = true;
    cancelAnimationFrame(frame);
    unsubscribe();
    window.removeEventListener('keydown', keyDown, true);
    window.removeEventListener('keyup', keyUp, true);
    window.removeEventListener('blur', blur);
    window.removeEventListener('pagehide', pageHide, true);
    document.removeEventListener('visibilitychange', hidden);
    view.dispose();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }

  window.addEventListener('keydown', keyDown, true);
  window.addEventListener('keyup', keyUp, true);
  window.addEventListener('blur', blur);
  // End this attempt before the shared store's bubble listener releases its
  // single-writer lock on pagehide. Otherwise cancellation would be read-only.
  window.addEventListener('pagehide', pageHide, true);
  document.addEventListener('visibilitychange', hidden);
  render(); view.primaryButton.focus({ preventScroll: true });
  frame = requestAnimationFrame(tick);
  return { dispose };
}
