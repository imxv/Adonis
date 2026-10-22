export interface CommissionItemView {
  name: string;
  quantity: number;
  owned: number;
  source: string;
}

export interface CommissionRewardView {
  name: string;
  quantity: number;
  description: string;
  stock: string;
}

export interface CommissionCardView {
  id: string;
  title: string;
  request: string;
  completed: boolean;
  capacityBlocked: boolean;
  items: CommissionItemView[];
  rewards: CommissionRewardView[];
}

export interface CommissionNpcView {
  id: string;
  name: string;
  role: string;
  greeting: string;
  cards: CommissionCardView[];
}

export interface CommissionPageView {
  mountId: string;
  npcs: CommissionNpcView[];
  readOnly: boolean;
  warning: string | null;
  feedback: string;
  feedbackError: boolean;
  lastCompleted: string | null;
  lastAttempted: string | null;
  sessionOnly: boolean;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export interface CommissionDialogueView {
  mountId: string;
  npc: CommissionNpcView;
  selected: string;
  feedback: string;
  error: boolean;
  warning: string;
  readOnly: boolean;
  sessionOnly: boolean;
}

/** One conversation and one selected stable commission; never a page of contact cards. */
export function renderCommissionDialogue(view: CommissionDialogueView): string {
  const card = view.npc.cards.find(item => item.id === view.selected) ?? view.npc.cards[0];
  if (!card) return '';
  const sufficient = card.items.every(item => item.owned >= item.quantity);
  const blocked = view.readOnly || card.completed || card.capacityBlocked || !sufficient;
  const status = card.completed ? '已回应' : card.capacityBlocked ? '回礼空间不足' : sufficient ? '材料已备齐' : '还缺一点材料';
  return `<section class="acom-dialogue" role="dialog" aria-modal="true" aria-labelledby="${view.mountId}-speaker">
    <header><div><h2 id="${view.mountId}-speaker">${escapeHtml(view.npc.name)}</h2><span>${escapeHtml(view.npc.role)}</span></div><button type="button" data-action="close" data-focus="close" aria-label="结束交谈">×</button></header>
    <div class="acom-dialogue-body">
      <p class="acom-speech">${card.completed ? '这份心意我收到了，谢谢你。愿归来的路上，总有人为你留一盏灯。' : escapeHtml(view.npc.greeting)}</p>
      ${view.npc.cards.length > 1 ? `<div class="acom-topics" role="group" aria-label="选择交谈的委托">${view.npc.cards.map(item => `<button type="button" data-action="topic" data-id="${escapeHtml(item.id)}" data-focus="topic-${escapeHtml(item.id)}" aria-pressed="${item.id === card.id}">${escapeHtml(item.title)}${item.completed ? ' ✓' : ''}</button>`).join('')}</div>` : ''}
      <div class="acom-request-heading"><h3>${escapeHtml(card.title)}</h3><span>${status}</span></div>
      <p>${escapeHtml(card.request)}</p>
      <h4>带给居民</h4><ul class="acom-items">${card.items.map(item => `<li data-enough="${item.owned >= item.quantity}"><div>${escapeHtml(item.name)}<small>${escapeHtml(item.source)}</small></div><span>需 ${item.quantity} · 现有 ${item.owned}</span></li>`).join('')}</ul>
      <h4>这份心意的回礼</h4><ul class="acom-rewards">${card.rewards.map(reward => `<li><div>${escapeHtml(reward.name)} ×${reward.quantity}<small>${escapeHtml(reward.description)}</small></div><span>${escapeHtml(reward.stock)}</span></li>`).join('')}</ul>
      <button type="button" class="acom-deliver" data-action="deliver" data-id="${escapeHtml(card.id)}" data-focus="deliver-${escapeHtml(card.id)}" ${blocked ? 'disabled' : ''}>${card.completed ? '已交付 · 回礼已领取' : view.readOnly ? '当前存储只读' : card.capacityBlocked ? '先腾出回礼库存空间' : sufficient ? '交付材料，领取回礼' : '材料未齐，先去收集'}</button>
      <p class="acom-rules">${card.completed ? view.sessionOnly ? '本页已完成，尚未保存；请勿自动重试。' : '这份委托只交付一次，完成记录已保存。' : '完整材料一次交付；材料不足或回礼满仓时不扣料。'}</p>
    </div>
    <p class="acom-dialogue-feedback" role="status" aria-live="polite" data-error="${view.error || Boolean(view.warning)}">${escapeHtml([view.feedback, view.warning].filter(Boolean).join(' '))}</p>
  </section>`;
}
