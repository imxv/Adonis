# 生活玩法 UI v1：厨房与委托

更新时间：2026-10-21，Asia/Shanghai。A 负责的两个页面已实现真实交易，可供 B 接入主入口；本记录的浏览器验收来自独立本地预览，未代表主入口整体验收或部署。

## 文件与挂载接口

- 厨房：[index.ts](/Users/sunmozong/Adonis/src/sidegames/kitchen/index.ts)、[view.ts](/Users/sunmozong/Adonis/src/sidegames/kitchen/view.ts)、[art.ts](/Users/sunmozong/Adonis/src/sidegames/kitchen/art.ts)、[kitchen.css](/Users/sunmozong/Adonis/src/sidegames/kitchen/kitchen.css)。
- 委托：[index.ts](/Users/sunmozong/Adonis/src/sidegames/commissions/index.ts)、[screen.ts](/Users/sunmozong/Adonis/src/sidegames/commissions/screen.ts)、[view.ts](/Users/sunmozong/Adonis/src/sidegames/commissions/view.ts)、[commissions.css](/Users/sunmozong/Adonis/src/sidegames/commissions/commissions.css)。
- 两个模块各有独立类型检查配置；没有新增 UI 单元测试。

```ts
import { mountKitchen } from './sidegames/kitchen';
import { mountCommissions } from './sidegames/commissions';

const handle = mountKitchen({ container: host, onExit: showGallery });
// 或 mountCommissions({ container: host, onExit: showGallery })
// 返回值均为 { dispose(): void }
handle.dispose();
```

调用方提供有尺寸、未被游戏画布缩放的 HTML 容器，并负责暂停游戏及恢复主入口。模块导入现有 `visualTheme.css`，根节点分别为 `.ag-theme.akitchen`、`.ag-theme.acom`，样式按页面命名空间限制。

返回按钮或 Esc 会先 dispose 再调用 onExit；直接调用 dispose 不触发 onExit，重复调用安全。dispose 移除根 DOM、事件监听和存档订阅，并在可行时恢复进入前焦点。页面没有定时器、RAF、独立游戏循环或自建存储。模块退出不释放共享存档 writer lock；该锁属于页面级 meta 服务。

键盘使用原生按钮、Tab 焦点及 Esc 返回。Enter/Space 的 repeat keydown 在动作前被阻止，避免成功后焦点移到下一份委托而连续交付。父级游戏的输入暂停仍由调用方负责。

## 真实数据和交易边界

来源为 C 的 [life.ts](/Users/sunmozong/Adonis/src/meta/life.ts)、[life-catalog.ts](/Users/sunmozong/Adonis/src/meta/life-catalog.ts)、[profile.ts](/Users/sunmozong/Adonis/src/meta/profile.ts)，规则和数值说明见 [life-economy-v1.md](/Users/sunmozong/Adonis/docs/life-economy-v1.md)。页面从导出目录构造材料、产出、奖励、效果和容量展示，没有复制交易规则、直接改写 profile 或直接写 localStorage。

| 页面 | 读取/订阅 | 提交 |
| --- | --- | --- |
| 厨房 | `loadProfile`、`subscribeProfile`、`RECIPES`、`FISH`、`PLANTS`、`SUPPLIES`、容量目录、`getRecipeFailure` | `cookRecipe(recipeId, createLifeActionId())`、`packSupply(id/null)` |
| 委托 | `loadProfile`、`subscribeProfile`、`NPCS`、`COMMISSIONS`、材料/奖励目录、`getCommissionFailure` | `deliverCommission(stableCommissionId)` |

厨房每次明确点击生成一个 actionId，无挂载、订阅或定时自动提交。委托完成状态以 `profile.life.completedCommissions` 的稳定 ID 为准；已完成按钮禁用，不以 failure helper 返回 undefined 推断未完成。

### 三份食谱

下表记录验收时的权威目录值；运行时直接读取目录。

| 配方 ID / 名称 | 材料 | 产出与返种 | 下一次冒险效果 |
| --- | --- | --- | --- |
| `olive-skewer` 海风橄榄串 | 银鳞沙丁 1、银叶橄榄原料 1 | 橄榄露 1、橄榄种子 1 | 生命上限 +1，并补足该点生命 |
| `laurel-broth` 月桂归航汤 | 珊纹鲷 1、金缘月桂原料 1 | 月桂结 1、月桂种子 1 | 拾取范围 +12% |
| `iris-stew` 星蓝花香煮 | 金尾鲻 1、星蓝鸢尾原料 1 | 鸢尾香 1、鸢尾种子 1 | 冲刺冷却缩短 8% |

成品每种上限 3，种子上限 9，料理记录上限 512。UI 展示已有/所需、来源、成品容量、返种容量与效果。装入行囊只选择一个补给槽，不扣成品；确认新冒险时消耗及实际战斗效果由已有 meta/run 流程负责，本阶段没有修改或验证其战斗执行。

### 两位 NPC、三份一次性委托

| NPC | 稳定委托 ID / 名称 | 材料 | 回礼 |
| --- | --- | --- | --- |
| 涅柔斯 / 港边渔夫 | `first-catch` 第一份海味 | 银鳞沙丁 1 | 修复碎片 3、橄榄种子 2、花园生长 1 |
| 达芙妮 / 花园照料者 | `garden-table` 花园午餐 | 珊纹鲷 1、月桂原料 1 | 修复碎片 4、月桂种子 2、花园生长 1 |
| 达芙妮 / 花园照料者 | `blue-keepsake` 蓝色的纪念 | 金尾鲻 1、鸢尾原料 1 | 修复碎片 5、鸢尾种子 2、花园生长 1 |

委托无现实时间刷新，交付与回礼由权威 API 一次处理。页面展示请求、需/现有、回礼库存上限、成功和失败原因。容量不足时可查看回礼容量，材料不足时明确缺多少；不会因 UI 预判而自行扣料。

### 存储反馈

`applied`、`duplicate`、`reason`、`storage`、`warning` 均消费真实 API 结果。`busy`/`unsupported` 禁用交易，允许查看和返回；厨房卡片统一显示“当前只读 · 可查看材料”。`memory` 下操作可以在本页成功，但顶栏及成功消息明确提示未保存、刷新/关闭可能丢失，不自动重试或声称持久化成功。`recovered` 等存储 warning 直接展示。

## 实际浏览器证据

验收使用独立 Chrome 页面及 `127.0.0.1:5271` origin，加载本工作区的真实模块。预览入口：[厨房/委托菜单](http://127.0.0.1:5271/@fs/private/tmp/adonis-life-ui-preview-20261021-213100/preview.html)。这是本地服务，存档独立于 B 的主入口 origin。

证据目录：[life-ui-v1](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/life-ui-v1)。[验收回读汇总](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/life-ui-v1/acceptance-audit.json) 对已记录证据完成 29 项一致性核对，没有重新执行交易。

资源准备通过真实 `plantSeed` / `settleRun` / `harvestPlant`、`beginFishing` / `finishFishing` / `cancelFishing` API 构造库存。没有直写 profile、存储 API mock 或假发奖；这些准备属于验收夹具，不等于玩家自然完成冒险/花园/钓鱼全链路。

| 检查 | 实际读回结果 | 原始记录 |
| --- | --- | --- |
| 初始材料不足 | 厨房及第一份委托尝试前后完整 profile 相同，无扣料/发奖 | `initial-state.json`、`kitchen-insufficient.json`、`commissions-insufficient.json` |
| 三配方实际烹饪 | 成品 `0/0/0 → 3/1/1`；鱼 `5/3/3 → 2/2/2`；植物原料 `4/2/2 → 1/1/1`；种子 `3/4/4 → 6/5/5`；5 个唯一料理 actionId | `kitchen-transactions.json` |
| 补给容量与行囊 | 橄榄露 3/3 再烹饪时完整 profile 不变；装入橄榄露仅改变 packedSupply，库存仍为 3 | 同上 |
| 委托回礼容量 | 橄榄种子 9/9 时 first-catch 失败，完整 profile 不变；通过真实播种腾出两格后才成功 | `commission-capacity-prepared.json`、`commissions-capacity.json` |
| 三份实际交付 | 完成 ID 依次增加；碎片 `22 → 25 → 29 → 34`，生长 `26 → 27 → 28 → 29`；鱼 `2/2/2 → 1/1/1`，种子 `7/7/7 → 9/9/9` | `commissions-transactions.json` |
| 长按 Enter | 厨房仅增加一份；委托 garden-table、blue-keepsake 各仅交付自身，仍停在委托页，没有连交或误返回 | 上述两个 transactions 文件 |
| 重复进入与销毁 | 三轮厨房+委托，共 6 次进入/退出；每次返回 moduleRoots=0，完整 profile 不变；销毁后额外 Esc 不增加退出计数 | `reentry-three-cycles.json` |
| 刷新持久化 | 5 份料理、三份委托完成 ID、成品 `3/1/1`、行囊及完整 profile 均保留 | `persisted-after-reload.json` |
| 真实 writer lock | 主页面持有锁，同 origin 第二页实际返回 busy；厨房烹饪与三份交付均 disabled；两页内模块返回正常，无 profile 变化 | `kitchen-readonly.json`、`commissions-readonly.json`、`readonly-return.json` |
| 真实存储额度失败 | 独立 5272 origin 填充 29 个自有 QA 键、5,237,824 字节，实际出现 QuotaExceededError；真实烹饪/交付各成功一次并返回 memory，UI 明确未保存 | `kitchen-memory-success.json`、`commissions-memory-success.json` |
| QA 清理 | 5272 的 29 个 quota 填充键全部移除，剩余自有键 0；该页关闭；5271 已保存 profile 不变 | `quota-cleanup.json`、`final-ui-status.json` |

`readonly-before-label-fix.json` 仅保留修正前诊断；最终只读证据为 `kitchen-readonly.json`。最终恢复的 Chrome 页 warning/error 日志为空，见 `browser-warnings-errors.json`；不将此观测扩大为所有页面历史日志均为空。

### 桌面与窄屏

- 桌面截图：[厨房成功](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/life-ui-v1/kitchen-success-desktop.jpg)、[三份委托完成](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/life-ui-v1/commissions-daphne-success.jpg)。
- Chrome 视口 390×844：两页 documentWidth=390，无横向溢出；原生按钮高度至少 48px，宽度至少 92px；`touch-action: pan-y`。厨房内容高 1738、委托 2884，原生滚轮可滚动。Tab 聚焦厨房烹饪按钮时自动滚至可见，按钮 top≈397、bottom≈447。
- Chrome 视口 844×390：两页 root/documentWidth 均 844。结束时已恢复桌面视口，最终记录 1488×981。
- 窄屏截图：[厨房详情及焦点](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/life-ui-v1/kitchen-portrait-details.jpg)、[委托滚动](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/life-ui-v1/commissions-portrait-scroll.jpg)。测量原文为 `kitchen-mobile.json`、`commissions-mobile.json`、`landscape-layout.json`。
- 已完成鼠标/原生键盘/滚轮操作、视口尺寸及滚动检查。浏览器 raw touch dispatch 被工具阻止，未形成成功触控事件证据，实体手机也未测试；因此不宣称真机触控通过。

### 类型检查及静态复核

以下命令最终执行均 exit 0：

```sh
./node_modules/.bin/tsc -p src/sidegames/kitchen/tsconfig.check.json --noEmit
./node_modules/.bin/tsc -p src/sidegames/commissions/tsconfig.json --noEmit
```

静态复核覆盖真实 API 接入、稳定完成 ID、动态文本转义、订阅与输入清理、局部样式、原生按钮及减少动态效果。复核提出的委托重复 Enter/Space 问题已修正；厨房 busy/unsupported 卡片文案与禁用状态已统一。512 份料理上限、unsupported/recovered 状态依赖代码与权威服务处理，本轮没有逐一构造运行时案例。

## 快照和接入边界

[source-manifest.json](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/life-ui-v1/source-manifest.json) 记录 10 个模块文件、只读 meta/theme 依赖及私有预览文件的 SHA-256。[source-snapshot](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/life-ui-v1/source-snapshot) 保留验收时模块与私有 harness 副本；预览配置/准备入口不进入产品源码。

最终复核文件指纹：

- `kitchen/index.ts`：`bbba8c2028b116f329f9b3ff11a1512ea60c04cc8b7da7a5e566e2a097b462c4`
- `kitchen/view.ts`：`5ead30b07d5c67a1038e86379aa7b2e2d70ac4e5e45238eb5619a0b30fd95637`
- `commissions/screen.ts`：`5a345dd89c5562c01e2d4bd58586693c0293144d18d6f07ce3a2848121391417`

A 本阶段写入范围为 `src/sidegames/kitchen/**`、`src/sidegames/commissions/**` 和本文档。B 负责主入口导航、暂停/恢复和重复进出整体验收；C 负责存档/经济/花园；D 负责真实钓鱼体验。自然玩家从主入口获取材料、烹饪/交付、进入新冒险消耗补给的全流程，以及实体触屏操作，仍需在合并入口上验收。本阶段未操作其他工作者文件、依赖、历史 playtest/output、3D 候选，没有 commit、push 或部署。
