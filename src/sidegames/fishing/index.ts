import {
  beginFishing, cancelFishing, finishFishing, FISH, FISH_IDS, LIFE_LIMITS,
  loadProfile, subscribeProfile,
} from '../../meta/life';
import { mountFishingController, type FishingEconomyPort, type FishingHandle, type FishingOptions } from './controller';

export type { FishingHandle, FishingOptions } from './controller';

/** Independent mount. Host owns routing and pauses its own game; dispose is
 * idempotent, ends any active attempt and never calls onExit a second time. */
export function mountFishing(options: FishingOptions): FishingHandle {
  const economy: FishingEconomyPort = {
    snapshot() {
      const state = loadProfile();
      return {
        canStart: state.storage !== 'unsupported' && state.storage !== 'busy',
        warning: state.warning,
        catalog: FISH_IDS.map(id => ({ ...FISH[id], count: state.profile.life.fish[id] })),
      };
    },
    begin() {
      const result = beginFishing();
      if (!result.attempt || !(result.applied || result.duplicate)) return {
        attempt: null,
        message: result.warning || (result.reason === 'capacity'
          ? '这份存档的钓鱼尝试记录已满，请先返回大厅。'
          : '暂时无法保存这次抛竿，请稍后重试。'),
      };
      return {
        attempt: { id: result.attempt.attemptId, seed: result.attempt.seed },
        message: result.storage === 'memory'
          ? '当前只能临时保存在本页，关闭或刷新可能丢失鱼获。'
          : result.duplicate ? '接着同一次尝试重新抛竿；本次收益只会结算一次。' : '抛竿已记下。看清真正的咬钩，再决定收放线。',
      };
    },
    finish(id, outcome) {
      const result = outcome === 'cancelled' ? cancelFishing(id) : finishFishing(id, outcome === 'escaped' ? 'missed' : 'caught');
      const receipt = result.receipt;
      if (!receipt || !(result.applied || result.duplicate)) return {
        committed: false,
        message: result.warning || '这次结果还没保存，请重试保存；离开将放弃未保存的尝试。',
      };
      const persistence = result.storage === 'memory' ? ' 仅临时保存在本页，刷新或关闭可能丢失。' : '';
      const fishName = receipt.fish ? FISH[receipt.fish].name : '';
      let message = receipt.outcome === 'cancelled' ? '已收竿，这次没有发放鱼获。'
        : receipt.outcome === 'missed' ? '这次没有鱼获，也没有扣除材料。'
          : receipt.awarded ? `${fishName} ×${receipt.awarded} 已放入鱼篓；花园生长 +${receipt.growth}。`
            : receipt.reason === 'capacity' ? `${fishName}已达 ${LIFE_LIMITS.fish} 尾上限，这一尾已放归，没有增加鱼获或生长。`
              : '这次尝试已结束，没有新增鱼获。';
      if (result.duplicate) message = receipt.awarded
        ? `这次结果已结算，不会重复发放。历史鱼获：${fishName} ×${receipt.awarded}。`
        : `这次结果已结算，不会重复发放。${receipt.reason === 'capacity' ? '这一尾此前已放归。' : '这次没有鱼获。'}`;
      return { committed: true, message: message + persistence, fishId: receipt.fish ?? undefined };
    },
    subscribe: subscribeProfile,
  };
  return mountFishingController(options, economy);
}
