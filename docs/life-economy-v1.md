# 生活规则 v1：可直接导入的合同

2026-10-21，功能优先。本合同对应真实 `src/meta/life.ts` 导出及 `life-catalog.ts` 目录，A/B/D只消费这一份规则，不另建库存或存储。同key v2存档迁移、规则和花园回流已完成；目录与下述导出为真实可消费API。禁止UI单元测试，不改依赖，不提交发布。

## 导入与读取

```ts
import {
  loadProfile, subscribeProfile,
  FISH, FISH_IDS, RECIPES, RECIPE_IDS, NPCS, NPC_IDS,
  COMMISSIONS, COMMISSION_IDS, RESTORATIONS, RESTORATION_IDS, LIFE_LIMITS,
  beginFishing, finishFishing, cancelFishing, fishForSeed,
  cookRecipe, createLifeActionId, deliverCommission, restoreGallery,
  getRecipeFailure, getCommissionFailure, getRestorationFailure,
} from '../../meta/life'; // 按实际模块深度调整
```

读取 `loadProfile(): ProfileState`，仍返回 `{profile,storage,warning}`，订阅 `subscribeProfile(listener):()=>void`。原种子/产物/补给/单槽/准备与结算回执都保留。新增 `profile.life`：

```ts
interface LifeProgress {
  fish: Record<FishId,number>;
  fishing: { nextSequence:number; active:FishingAttempt|null; receipts:FishingReceipt[] };
  cooked: {actionId:string; recipeId:RecipeId}[];
  completedCommissions: CommissionId[];
  restored: RestorationId[];
}
```

不要直接修改读出的profile。所有写入由下列同步操作经唯一store的draft事务完成；返回的新profile可直接渲染。`storage:'busy'|'unsupported'`只读；所有界面都显示warning。`applied:true,storage:'memory'`表示本页操作已发生但未持久化，**不得自动重试发奖或宣称重载保留**。

## D：钓鱼合同

```ts
interface FishingAttempt { attemptId:string; sequence:number; seed:number }
type FishingOutcome = 'caught'|'missed'|'cancelled';
interface FishingReceipt extends FishingAttempt {
  outcome: FishingOutcome; fish:FishId|null; awarded:0|1; growth:0|1; reason?:'capacity';
}
beginFishing(): MetaResult & {attempt:FishingAttempt|null};
finishFishing(attemptId:string,outcome:FishingOutcome): MetaResult & {receipt:FishingReceipt|null};
cancelFishing(attemptId:string): 同finishFishing返回;
fishForSeed(seed:number): FishId;
```

D负责抛竿/咬钩/张力与成功失败状态，C负责持久化身份及唯一奖励。每次真正开局调用begin；已有活跃尝试返回原ID/seed，`duplicate:true`也可继续玩，不能另生成奖励ID。重载后可重新用同seed开始该尝试；离开时cancel当前attempt。UI不得以mount、动画结束或订阅回调重复发奖。

finish只接受已发出的当前ID，或返回历史终态。成功、失败、取消全部终结该ID；重复/改结果不改旧终态、不增加库存。`caught`由C按seed确定鱼，入库1并推进1生长；失败/取消无奖励。鱼篓已满时仍写终态，`applied:true, reason:'capacity', receipt.awarded:0`，无鱼/无生长；不能腾仓后重放同ID。显示“捕获入库”应看 `receipt.awarded===1 && applied`，不能只看outcome或applied。

3种鱼各上限9、无免费初始鱼：`silver-sprat`银鳞沙丁、`reef-bream`珊纹鲷、`golden-mullet`金尾鲻。三种同等稳定分布，由seed决定；seed基于持久化序号，不依赖系统时间刷新。最多4096次尝试，不淘汰旧终态来重接历史ID。

## A：烹饪与委托合同

```ts
cookRecipe(recipeId:RecipeId, actionId:string): MetaResult & {
  recipeId:RecipeId|null; actionId:string|null; reward:LifeReward|null
};
createLifeActionId():string;
deliverCommission(id:CommissionId): MetaResult & {commissionId:CommissionId|null;reward:LifeReward|null};
getRecipeFailure(profile:MetaProfile,id:RecipeId):MetaFailure|undefined;
getCommissionFailure(profile:MetaProfile,id:CommissionId):MetaFailure|undefined;
```

烹饪每次明确点击生成一次actionId；同一操作重复调用必须复用ID。全部鱼/产物/补给及种子容量先检查，再一次扣料+发奖+记账。**不要先UI扣鱼再调用craftSupply**。同actionId同配方返回duplicate，无新reward；同ID换配方拒绝。最多512份料理，不滚动删除操作回执。读档或重绘不自动烹饪。

| 配方ID / 名称 | 消耗 | 一次产出 |
|---|---|---|
| olive-skewer / 海风橄榄串 | 银鳞沙丁1 + 银叶橄榄产物1 | 橄榄露1 + 橄榄种子1 |
| laurel-broth / 月桂归航汤 | 珊纹鲷1 + 月桂产物1 | 月桂结1 + 月桂种子1 |
| iris-stew / 星蓝花香煮 | 金尾鲻1 + 鸢尾产物1 | 鸢尾香1 + 鸢尾种子1 |

料理进入既有 `profile.supplies`，每种最多3。效果完全复用既有单局补给：生命+1、拾取范围+12%、冲刺冷却-8%；不增加永久战力、不叠加新效果。种子最多9，产物最多9；任一产出容量不足均保留所有原料。

2名NPC：`nereus`港边渔夫涅柔斯；`daphne`花园照料者达芙妮。3项委托一次性交付完整材料，不做日期刷新：

| 委托ID / NPC | 消耗 | 奖励 |
|---|---|---|
| first-catch / nereus | 银鳞沙丁1 | 碎片3、橄榄种子2、生长1 |
| garden-table / daphne | 珊纹鲷1 + 月桂产物1 | 碎片4、月桂种子2、生长1 |
| blue-keepsake / daphne | 金尾鲻1 + 鸢尾产物1 | 碎片5、鸢尾种子2、生长1 |

完成情况读 `life.completedCommissions.includes(id)`，再用failure helper展示缺料/满仓；已交付按钮显示“已完成”。稳定目录ID重复交付返回duplicate，无再次扣料/发奖，不借用claimDiscovery。目录的cost/reward可直接显示，UI不复制奖励常量。

## B：画廊与主线

```ts
restoreGallery(id:RestorationId): MetaResult & {restorationId:RestorationId|null};
getRestorationFailure(profile:MetaProfile,id:RestorationId):MetaFailure|undefined;
```

唯一修复 `harbor-mosaic`“归航镶嵌画”：消耗修复碎片6 + 银叶橄榄产物1。成功后 `profile.life.restored.includes('harbor-mosaic')` 为true；B据此显示真实修复后的画面，重载也保留。重复只读同完成状态，不扣料。C不把“发现”或文字计数当可见修复。

原 `profile.ts` 的 plantSeed/harvestPlant/craftSupply/packSupply/prepareRun/settleRun 保持。装配只选单槽；真正新局prepareRun消费一份并冻结assisted/effect，续局不再prepare/叠加。普通与补给成绩分组由主run固定prepared.assisted派生，不看当前库存。无生活副玩法仍能冒险。

## 最小循环与存档边界

新档播种橄榄 → 成功钓鱼推进生长 → 花园收获 → 配鱼做料理返种子 → 装配一份补给 → 新冒险仅消费一次 → 有效结算返种子/碎片/生长。也可把鱼/产物交给NPC，攒碎片修复画廊；所有副玩法自愿。

同一 `adonis.meta.v1` key的payload升version2，显式迁移v0/v1，旧客户端见v2只读；未知未来版本只读。保留旧库存、花圃、packedSupply、preparedRuns、settledRuns、discoveries与损坏备份/单写锁。v2生活账本损坏不清空后重发，按只读保护。主线与meta两个key不是跨key原子事务，沿用既有新局回执整合约束。

C侧迁移与规则检查、花园与限定真实UI验证已完成，见 `docs/expansion-handoffs/life-meta-v1.md`。自然钓鱼成功由D独立交证据；跨大厅自然全链路、主线补给公平组和可见画廊修复由B/根集中整体验收。本合同不代表已发布。
