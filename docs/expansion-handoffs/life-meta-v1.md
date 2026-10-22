# C生活规则 v1交接

2026-10-21。**API、同key v2存档、实际规则和花园回流已完成。** 所有nature/banks/地形工作停止，保留此前源码/证据/未决项；本轮没有继续3D迭代。没有提交、推送、部署或改依赖。

先发布的真实入口是[src/meta/life.ts](/Users/sunmozong/Adonis/src/meta/life.ts)，完整导出签名和目录见[生活合同](../life-economy-v1.md)。A/B/D消费同一份目录与存储，没有新建第二套库存。

## 交付目录与调用

- 三鱼：silver-sprat银鳞沙丁、reef-bream珊纹鲷、golden-mullet金尾鲻，每种9尾上限。beginFishing给持久化attemptId/seed；finishFishing/cancelFishing只结束已发出的当前ID，旧终态重复只返回原回执。caught入库1并生长1；满仓caught仍终态但0鱼/0生长；失败/取消0奖励。
- 三料理：olive-skewer、laurel-broth、iris-stew，各消耗对应鱼1+橄榄/月桂/鸢尾产物1，产出既有对应补给1+种子1。cookRecipe(recipeId,actionId)一次事务检查所有材料与产出容量，稳定actionId去重；512条回执不淘汰。
- 两NPC/三一次委托：nereus/first-catch，daphne/garden-table、blue-keepsake；奖励碎片3/4/5、对应种子2、生长1。deliverCommission目录稳定ID一次交付，重复不扣不发，不借claimDiscovery。
- 一修复：restoreGallery('harbor-mosaic')消耗碎片6+橄榄产物1，以life.restored给B真实画廊展示。C只保证规则/存档，不把标记当可见修复已验收。
- 原profile.ts接口保留：plant/harvest/craft/pack/prepare/settle。装配不扣成品，新局prepare仅消费一份并固定assisted/effect；续局不得重新应用，普通/补给成绩仍按主run固定回执分组，无永久战力。

所有返回值保留profile/storage/warning/applied/duplicate/reason。storage为busy/unsupported时不执行rule；applied+memory表示本页已执行但未持久化，UI提示且不自动重试。结果receipt和profile均与活账本隔离。

## 存档与安全

同一adonis.meta.v1 key的payload升v2，显式迁移v0/v1，保留种子/产物/补给/花圃/packed/prepared/settled/discoveries。旧客户端见未来v2只读；本客户端未知未来v3或v2生活账本损坏也只读，不清空账本重发。钓鱼连续序号/唯一active/seed/终态组合严格解码，4096条终态不淘汰。损坏JSON仍在第一次成功覆盖前备份；单写Web Lock、pagehide/focus代次、内存降级与两key非原子边界保留。

独立审阅发现并修复一个P2：generic transaction若返回draft嵌套对象，调用者原可改活账本后重奖。store现于commit前clone完整返回，unavailable结果也隔离；不可clone返回的异常发生在commit前，状态/磁盘不变。独立memory/saved与根额外三路径反例重放已关闭，无剩余确认P1/P2。[独立审阅](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/life-meta-review-v1/life-meta-review-v1.md) / [修复证据](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/life-meta-review-v1/generic-return-alias-fixed.json)。

## 验证及边界

禁止UI单元测试，本轮未写UI单测。有意义非UI检查：

| 命令 | 结果 | 范围 |
|---|---|---|
| node src/meta/profile.checks.mjs | 34/34 | 原冒险/花园/补给/单写锁与generic入口 |
| node src/meta/storage-v2.checks.mjs | 38/38 | v0/v1迁移、严格v2/未来只读、损坏备份、写失败 |
| node src/meta/life.checks.mjs | 34/34 | fishing终态/4096上限、3配方、容量/幂等、委托/修复、补给循环与返回引用回归 |

共106项通过；根已对返回值隔离额外独立复核，没有再扩同类矩阵。全工作区npm run typecheck最终退出0。独立冻结真实模块构建日志见[模块构建](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/life-meta-v1/isolated-module-build-final.log)；首轮隔离拷贝漏palette依赖的日志保留为历史，非产品源缺陷。主产品整体build/发布由根完成。

Garden手工验证：真实播种2→1，320/390宽无横向溢出，按钮≥48px，Tab/Shift+Tab/Esc及dispose；当前3鱼库存/用途、三委托与修复只读卡、三来源生长和存储提示均可见。[Garden验证](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/life-garden-v1/garden-validation.json)。

根的独立实际模块host使用真实C/A/D挂载和唯一service，源与资产快照见[快照](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/life-meta-v1/qa-source-snapshot.json)。**上游鱼获/生长由页面明确标注的公共API夹具准备，未直接改库存，不是自然钓鱼或跨大厅完整通关。** D另交桌面/触摸自然成功证据；这里不重复冒领。保留根此前短抛/错过/脱钩的0奖励实图，未将接近成功或工具空隙失败说成钓获。

夹具后真实UI完成：三株收获→海风橄榄串扣银鳞沙丁1+橄榄1→橄榄露1及橄榄种子1入库→单槽装入橄榄露→重新播种橄榄→三项NPC实际交付→生长回流使新橄榄成熟→再次收获。最终碎片12、生长14、橄榄产物1，补给库存1且packed为olive-draught；三委托完成、料理回执1条。三轮四模块切换后完整profile不变，页面重载完整profile仍相同，storage=saved/version2，当前warn/error0。[完整只读DOM读回](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/life-meta-v1/browser-readbacks-final.json)。

![公共API上游夹具后的真实厨房扣料与装配](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/life-meta-v1/kitchen-cooked-packed-after-api-fixture.jpg)

![三项委托后生长回流的真实花园](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/life-meta-v1/garden-return-after-commissions-fixture.jpg)

未覆盖：C独立host不含真实B大厅/Phaser新局、主线成绩列表、B可见画廊修复、自然跨大厅全链路及真机。旧档/写失败/容量等安全边界由规则与store检查覆盖，未称本轮浏览器注入了真实存储故障。手机截图是视口模拟，非真机。最终整体整合由B/根集中验收一次。

## 改动范围

src/meta：life.ts/life-catalog.ts/life-rules.ts新增规则；types/schema/store/service/rules/catalog做v2接入与说明；profile.checks.mjs更新版本断言与入口回归，storage-v2.checks.mjs/life.checks.mjs新增非UI检查。原profile.ts对外接口不破坏。src/sidegames/garden只index.ts/garden.css，art未改。文档仅meta-economy、life-economy及本交接。

未修改A厨房/委托、D钓鱼、B大厅/主线/存档源码；独立host与临时产物均在Codex证据目录，未碰历史tools/playtest.js或output/。C产品源最终SHA与原生图片清单见[最终清单](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/life-meta-v1/final-evidence-manifest.json)。临时host结束时关闭，复现用本目录serve.mjs；其中夹具按钮明确标注且只调用公共规则API。
