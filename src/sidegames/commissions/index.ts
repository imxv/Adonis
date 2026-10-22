import {
  COMMISSION_IDS, COMMISSIONS, FISH, FISH_IDS, NPC_IDS, NPCS,
  deliverCommission, getCommissionFailure, loadProfile, subscribeProfile,
} from '../../meta/life';
import type { CommissionId, LifeCost, LifeReward, MetaFailure, MetaProfile } from '../../meta/life';
import { META_LIMITS, PLANTS, PLANT_IDS, SUPPLIES, SUPPLY_IDS } from '../../meta/profile';
import { mountCommissionScreen } from './screen';
import type { CommissionFeedback, CommissionScreenHandle, CommissionScreenOptions } from './screen';
import type { CommissionItemView, CommissionRewardView } from './view';

export interface CommissionsOptions extends CommissionScreenOptions {}
export interface CommissionsHandle extends CommissionScreenHandle {}

function costView(profile: MetaProfile, cost: LifeCost): CommissionItemView[] {
  const items: CommissionItemView[] = [];
  for (const id of FISH_IDS) {
    const quantity = cost.fish?.[id];
    if (quantity) items.push({ name: FISH[id].name, quantity, owned: profile.life.fish[id], source: '来源：钓鱼' });
  }
  for (const id of PLANT_IDS) {
    const quantity = cost.produce?.[id];
    if (quantity) items.push({ name: `${PLANTS[id].name}原料`, quantity, owned: profile.produce[id], source: '来源：花园收获' });
  }
  if (cost.fragments) items.push({ name: '修复碎片', quantity: cost.fragments, owned: profile.fragments, source: '来源：冒险与委托' });
  return items;
}

function rewardView(profile: MetaProfile, reward: LifeReward): CommissionRewardView[] {
  const rewards: CommissionRewardView[] = [];
  if (reward.fragments) rewards.push({ name: '修复碎片', quantity: reward.fragments, description: '用于画廊修复。', stock: `现有 ${profile.fragments} / ${META_LIMITS.fragments}` });
  for (const id of PLANT_IDS) {
    const quantity = reward.seeds?.[id];
    if (quantity) rewards.push({ name: `${PLANTS[id].name}种子`, quantity, description: `可在花园播种，积累 ${PLANTS[id].growth} 点生长后收获。`, stock: `现有 ${profile.seeds[id]} / ${META_LIMITS.seeds}` });
  }
  for (const id of SUPPLY_IDS) {
    const quantity = reward.supplies?.[id];
    if (quantity) rewards.push({ name: SUPPLIES[id].name, quantity, description: SUPPLIES[id].description, stock: `现有 ${profile.supplies[id]} / ${META_LIMITS.supplies}` });
  }
  if (reward.growth) rewards.push({ name: '花园生长', quantity: reward.growth, description: '让花园中已播种的植物一起成长。', stock: `累计 ${profile.growth} 点生长` });
  return rewards;
}

const FAILURE_MESSAGES: Record<MetaFailure, string> = {
  invalid: '这份委托暂无法识别，请返回画廊后重新进入。',
  capacity: '回礼库存空间不足。请查看回礼区的现有数量与上限，先腾出容量；交付材料未扣除。',
  occupied: '当前无法交付，请重新查看这封来信。',
  empty: '没有可交付的材料，请先去钓鱼或收获花园。',
  'not-ready': '这份委托暂时还不能交付。',
  insufficient: '材料尚未备齐，交付材料未扣除。',
  unavailable: '当前存储不可写，交付未发生。请查看上方存储提示。',
};

/**
 * Usage: const letters = mountCommissions({ container: host, onExit: showHub });
 * The caller owns pausing its game. dispose() never invokes onExit.
 * All inventory and one-time receipts are owned by the shared meta service.
 */
export function mountCommissions(options: CommissionsOptions): CommissionsHandle {
  let state = loadProfile();
  return mountCommissionScreen(options, {
    read: () => ({
      npcs: NPC_IDS.map(id => ({
        id, name: NPCS[id].name, role: NPCS[id].role, greeting: NPCS[id].greeting,
        cards: COMMISSION_IDS.filter(commissionId => COMMISSIONS[commissionId].npc === id).map(commissionId => {
          const commission = COMMISSIONS[commissionId];
          const completed = state.profile.life.completedCommissions.includes(commissionId);
          return {
            id: commissionId, title: commission.title, request: commission.request,
            completed,
            capacityBlocked: !completed && getCommissionFailure(state.profile, commissionId) === 'capacity',
            items: costView(state.profile, commission.cost), rewards: rewardView(state.profile, commission.reward),
          };
        }),
      })),
      readOnly: state.storage === 'busy' || state.storage === 'unsupported',
      warning: state.warning,
      sessionOnly: state.storage === 'memory',
    }),
    deliver: (value): CommissionFeedback => {
      if (!COMMISSION_IDS.includes(value as CommissionId)) return { message: FAILURE_MESSAGES.invalid, error: true, completed: null };
      const id = value as CommissionId;
      const commission = COMMISSIONS[id];
      // Stable catalogue ID is the receipt identity; no UI-owned reward or save.
      let result;
      try { result = deliverCommission(id); } catch (error) {
        // A write may have completed before an exception. Read back once, never retry.
        try { state = loadProfile(); } catch { /* Retain the last readable snapshot. */ }
        throw error;
      }
      state = result;
      if (result.applied) {
        const rewards = result.reward ? rewardView(result.profile, result.reward).map(reward => `${reward.name} ×${reward.quantity}`).join('、') : '请查看上方实际库存';
        const sessionOnly = result.storage === 'memory';
        return {
          message: `${NPCS[commission.npc].name}收到了「${commission.title}」的心意。回礼：${rewards}。${sessionOnly ? '本页已完成，但存储未成功，刷新可能丢失；请勿重复操作。' : '交付与回礼已保存。'}`,
          error: sessionOnly,
          completed: id,
        };
      }
      if (result.duplicate) return {
        message: `「${commission.title}」已交付，回礼已领取，不会再次扣料或发奖。${result.storage === 'memory' ? '当前仅保留在本页，刷新可能丢失。' : ''}`,
        error: result.storage === 'memory', completed: null,
      };
      const missing = result.reason === 'insufficient'
        ? costView(result.profile, commission.cost).filter(item => item.owned < item.quantity).map(item => `${item.name}还差 ${item.quantity - item.owned}`).join('；') : '';
      return {
        message: missing ? `${missing}。材料未扣除，可先去钓鱼或收获花园。` : FAILURE_MESSAGES[result.reason ?? 'invalid'],
        error: true, completed: null,
      };
    },
    subscribe: listener => subscribeProfile(() => { state = loadProfile(); listener(); }),
  });
}
