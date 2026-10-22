import { mountFishing, type FishingHandle } from './index';
import { loadProfile } from '../../meta/life';

// A developer entry using the actual life service through the public mount.
// This origin keeps its own browser profile; there are no demo rewards or hooks.
const host = document.querySelector<HTMLElement>('#fishing-host')!;
const entry = document.querySelector<HTMLElement>('#preview-entry')!;
const button = document.querySelector<HTMLButtonElement>('#preview-enter')!;
let handle: FishingHandle | null = null;
let exits = 0;
function enter() {
  handle?.dispose();
  entry.hidden = true;
  host.hidden = false;
  handle = mountFishing({ container: host, onExit() {
    handle?.dispose(); handle = null;
    exits++;
    host.hidden = true; entry.hidden = false;
    document.body.dataset.previewExits = String(exits);
    document.body.dataset.fishingChildren = String(host.childElementCount);
    const state = loadProfile();
    const fishing = state.profile.life.fishing;
    const readback = { storage: state.storage, active: fishing.active,
      lastReceipt: fishing.receipts.at(-1) ?? null, fish: state.profile.life.fish, growth: state.profile.growth };
    document.body.dataset.exitReadback = JSON.stringify(readback);
    document.querySelector('#preview-status')!.textContent = '钓鱼已退出，输入和动画已清理。';
    button.focus();
  } });
}
button.addEventListener('click', enter);
enter();
if (import.meta.hot) import.meta.hot.dispose(() => { handle?.dispose(); button.removeEventListener('click', enter); });
