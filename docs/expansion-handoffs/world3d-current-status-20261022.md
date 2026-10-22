# 3D故事首区当前可用状态 · 2026-10-22

用户询问“3D模型故事世界做得怎么样、能用吗”。本轮不重新展开3D美术；据当前入口代码与既有记录，明确以下边界，另由B对已接受生产快照做一次进入/移动/读故事/返回复核。

- 大厅爱琴海岸实际调用 `src/hub/controller.ts` 的 `mountGreekWorld`，内部调用 `createEnvironment`。新精细 `mountGreekReferenceWorld` 仅显式入口可用，没有默认接入大厅。
- 默认旧首区已有“海岸→橄榄圣林→山巅神庙”，5条原创发现、碑文/壁画线索、三个引水盘、圣泉恢复、山门开启与内殿终点。是一个可完成的探索首区，不是完整大型故事游戏。
- 发现通过 `claimDiscovery` 进入唯一meta存档并按ID一次奖励；重进可读已发现内容。引水盘与开门状态当前只在世界本次挂载内，重进会重置。
- 新reference神庙、桥、台阶、树岩、瀑布/泉龛/支流水路已有真实模型候选与独立实景；r5 C6f曾有固定组合路线证据。后来局部形体/材质组合不能继承该验收，新左岸shape05仍opt-in。未切换默认，不宣称精细模型已正式上线或达成参考相似度。
- 余项保留为后续模型细节/接地/水口边界/加载与组合路线确认；生活场景功能开发不以这些作为阻塞。现用户的钓鱼/厨房/NPC像素改造为本轮主任务。

当前主入口源码核对：hub/controller.ts `62f5b08e`；world3d/index.ts `2b128248`。对应首区内容在world3d/content.ts，历史功能证据在world3d交接，新模型边界在world3d-reference-r5及world3d-r5-left-bank-formal-local-result交接。本文件的源码核对不替代本次运行截图，实际生产冒烟证据另行记入总看板。

## 本次实际复测

B在已接受生产快照的独立5360 origin完成中档3D进入、W行走、拖拽转向、E阅读“无名领航者的星盘”，发现0/5→1/5；设置返回大厅后3D根和canvas归零，发现1与碎片1读回。warn/error为空，实际脚本与CSS均200。未重新通关全部谜题/5发现，也未测试新reference组合或实体手机。IAB拒绝pointer lock，拖拽转向可用；本次IAB故事面板文字呈低对比，computed style与源码颜色不一致，原因未归属，不能直接称为模型或源码缺陷。该表现仍作为当前体验限制保留。

证据目录：`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cba-2afb-7841-bff7-385c50f04529/world3d-production-smoke-20261022/`。包含result/evidence-manifest、进入/拖动/读故事/返回截图和computed style。B未改任何3D源；root最终生活像素包也未改此入口与世界实现。
