import '../hub/controller.css';
import './signIn.css';
import {
  NAME_MAX, account, loadAccount, onAccountChange, playAsGuest, playerName, signInWithGithub, signOut, suggestName,
  type AccountState, type LoginNotice,
} from '../net/account';

/*
 * Choosing who plays: on first entry the hall waits behind this panel until the visitor signs in with GitHub
 * or types a guest name. Later the name plate in the hall reopens it to rename, sign in or sign out.
 * It is plain DOM over the hall, in the hall's plates and pixel type, and keeps every key it receives.
 */

const NOTICES: Record<LoginNotice, string> = {
  github: '',
  failed: 'GitHub 登录没有完成，可以再试一次，或者先用游客身份。',
  cancelled: '已取消 GitHub 登录。',
  unavailable: '这个服务器还没开通 GitHub 登录，先用游客身份吧。',
};

const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'f', 'enter', 'escape', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']);

let open: HTMLElement | null = null;

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A short-lived line at the top of the screen, e.g. after coming back from GitHub. */
export function accountToast(text: string) {
  const toast = document.createElement('p');
  toast.className = 'acct-toast';
  toast.setAttribute('role', 'status');
  toast.textContent = text;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 4200);
}

/**
 * The panel. `first` is the entry gate: no way out but choosing. Otherwise it manages the current identity
 * and closes with Esc or 返回.
 */
export function openSignIn(o: { first?: boolean; notice?: LoginNotice } = {}) {
  open?.remove();
  const s = account();
  const signedIn = s.account?.kind === 'github';
  const guestName = s.account?.kind === 'guest' ? s.account.name : '';
  const root = document.createElement('div');
  root.className = 'acct-gate';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'acct-title');
  const githubBlock = s.github
    ? `<button type="button" class="acct-github is-primary" data-act="github">用 GitHub 登录</button>
       <p class="acct-hint">换电脑、换手机都是同一个你，名字别人冒用不了。${guestName ? '这台设备上的游客成绩会一起带过去。' : ''}</p>`
    : `<button type="button" class="acct-github" disabled>用 GitHub 登录</button>
       <p class="acct-hint">${s.online ? '这个服务器还没开通 GitHub 登录。' : '暂时连不上服务器，GitHub 登录不可用。'}</p>`;
  const current = s.account
    ? `<p class="acct-current">当前：<b>${signedIn ? 'GitHub' : '游客'}</b> · <span>${escapeHtml(playerName())}</span></p>`
    : '';
  root.innerHTML = `
    <div class="acct-panel ag-mode-panel">
      <p class="ag-mode-eyebrow">ADONIS</p>
      <h1 id="acct-title">${o.first ? '欢迎来到万象画廊' : '我的身份'}</h1>
      <p class="acct-lead">${o.first ? '先选一个身份。全服排行榜按这个身份记录你的成绩。' : '排行榜上的成绩都记在这个身份名下。'}</p>
      ${current}
      <p class="acct-notice" role="status" hidden></p>
      ${signedIn
        ? `<div class="acct-option"><button type="button" data-act="signout">退出 GitHub 登录</button>
             <p class="acct-hint">退出后以游客身份继续，GitHub 名下的成绩还在。</p></div>`
        : `<div class="acct-option">${githubBlock}</div>
           <div class="acct-or" aria-hidden="true"><span>或者</span></div>
           <form class="acct-option acct-guest" novalidate>
             <label for="acct-name">游客名字</label>
             <div class="acct-row">
               <input id="acct-name" class="acct-input" maxlength="${NAME_MAX}" spellcheck="false" autocomplete="nickname" enterkeyhint="go">
               <button type="submit" data-act="guest"${s.github ? '' : ' class="is-primary"'}>${guestName ? '保存名字' : '以游客身份进入'}</button>
             </div>
             <p class="acct-hint">游客成绩只认这个浏览器，换设备就是新的游客。</p>
           </form>`}
      ${o.first ? '' : '<div class="ag-mode-actions"><button type="button" data-act="close">返回</button></div>'}
    </div>`;

  const notice = root.querySelector('.acct-notice') as HTMLElement;
  if (o.notice && NOTICES[o.notice]) {
    notice.textContent = NOTICES[o.notice];
    notice.hidden = false;
  }
  const input = root.querySelector<HTMLInputElement>('#acct-name');
  if (input) {
    input.value = guestName;
    input.placeholder = suggestName();
  }

  // Keys typed here stay here; keys aimed at the hall behind are swallowed while the panel is up.
  const swallow = (e: KeyboardEvent) => {
    if (root.contains(e.target as Node)) return;
    if (MOVE_KEYS.has(e.key.toLowerCase())) e.preventDefault();
    e.stopImmediatePropagation();
    if (!o.first && e.key === 'Escape') close();
  };
  const close = () => {
    window.removeEventListener('keydown', swallow, true);
    window.removeEventListener('keyup', swallow, true);
    root.remove();
    if (open === root) open = null;
  };
  root.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape' && !o.first) close();
  });
  root.addEventListener('keyup', (e) => e.stopPropagation());
  window.addEventListener('keydown', swallow, true);
  window.addEventListener('keyup', swallow, true);

  root.querySelector('[data-act="github"]')?.addEventListener('click', () => {
    notice.textContent = '正在前往 GitHub……';
    notice.hidden = false;
    signInWithGithub();
  });
  root.querySelector('form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input!.value.trim() || input!.placeholder;
    playAsGuest(name);
    close();
    if (o.first) accountToast(`欢迎你，${playerName()}`);
  });
  root.querySelector('[data-act="signout"]')?.addEventListener('click', async (e) => {
    (e.currentTarget as HTMLButtonElement).disabled = true;
    await signOut();
    close();
    // Straight on to choosing a guest name, or keep the one this browser already had.
    if (!account().account) openSignIn({ first: true });
    else accountToast(`已退出 GitHub，以游客 ${playerName()} 继续`);
  });
  root.querySelector('[data-act="close"]')?.addEventListener('click', close);

  document.body.append(root);
  open = root;
  // A phone keyboard would cover half the panel, so only desktop starts in the name field.
  const touch = matchMedia('(pointer: coarse)').matches;
  (touch ? root.querySelector<HTMLElement>('button:not(:disabled)') : input ?? root.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
}

/** The name plate in the hall's top-right panel: who is playing, and the way to change it. */
export function mountAccountBadge(host: HTMLElement): () => void {
  const panel = host.querySelector('.ag-hub-profile');
  if (!panel) return () => {};
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'acct-badge';
  const render = (s: AccountState) => {
    const a = s.account;
    badge.hidden = !a;
    if (!a) return;
    const kind = a.kind === 'github' ? 'GitHub' : '游客';
    badge.innerHTML = `<span class="acct-badge-kind${a.kind === 'github' ? ' is-github' : ''}">${kind}</span><span class="acct-badge-name">${escapeHtml(playerName())}</span><span class="acct-badge-edit">切换</span>`;
    badge.setAttribute('aria-label', `当前身份：${kind} ${playerName()}，点击切换`);
  };
  badge.addEventListener('click', () => openSignIn());
  panel.prepend(badge);
  render(account());
  const off = onAccountChange(render);
  return () => {
    off();
    badge.remove();
  };
}

/** At boot: learn who is playing, then either greet them or ask. */
export async function startAccount() {
  const s = await loadAccount();
  if (!s.account) openSignIn({ first: true, notice: s.notice });
  else if (s.notice === 'github' && s.account.kind === 'github') accountToast(`已用 GitHub 登录 · ${s.account.login}`);
  else if (s.notice && s.notice !== 'github') openSignIn({ notice: s.notice });
}
