/**
 * Whether this browser has been offered the beginner tutorial, and how it went. Kept apart from the
 * settings and the saved run: answering the question or replaying the tutorial never touches either.
 */
export type TutorialStatus = 'unseen' | 'started' | 'skipped' | 'done';

const KEY = 'adonis.tutorial.v1';
/** Blocked storage still remembers the answer for this page, so the question is not asked twice. */
let memory: TutorialStatus | undefined;

export function tutorialStatus(): TutorialStatus {
  if (memory) return memory;
  try {
    const status = JSON.parse(localStorage.getItem(KEY) ?? 'null')?.status;
    if (status === 'started' || status === 'skipped' || status === 'done') return status;
  } catch {
    // Unreadable record: ask again.
  }
  return 'unseen';
}

export function setTutorialStatus(status: TutorialStatus) {
  memory = status;
  try {
    localStorage.setItem(KEY, JSON.stringify({ status, at: Date.now() }));
  } catch {
    // Private mode: remembered for this page only.
  }
}

/**
 * Asked once: before the first answer, and again only if a tutorial was left by closing the page.
 * `?tutorial=0` never asks (automated playtests), `?tutorial=1` always does.
 */
export function shouldOfferTutorial() {
  const forced = new URLSearchParams(location.search).get('tutorial');
  if (forced === '0' || forced === '1') return forced === '1';
  const status = tutorialStatus();
  return status === 'unseen' || status === 'started';
}
