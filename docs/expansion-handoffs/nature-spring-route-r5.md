# C · r5 圣泉支路局部净空修复（工程检查完成）

2026-10-21。冻结 helper **`6f7f5fec2b7ecfbef19fcc7604151931e97b7979b586d228122f8186d82b681d`**，消费 D fix-02 最终 TS 输入 **`additionalSupportClearance=.16m`**，D landform `8112d6b9…` / composition `05f56a21…`。独立几何、真实 D 足底有限采样、缺省兼容、资源释放、失败回退与构建检查完成；[最终报告](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/after-independent-check.json) **PASS / failures=[]**，采集和运行期间源码稳定。

两档连续线性完整身体域最小净距约 **.300099m**；每档 **3423 个真实 D 允许中心**的完整身体圆盘检查，脚底至最高 C 岩面最小净距均 **.29122259m**，高于 D 要求 .14m。它们是 C 岩体的工程结论；主世界完整步行、A 身体几何/碰撞器、设备性能和美术仍未验收。同步构建约 **1.6–1.8 秒**的成本保留。

## 变更与冻结范围

仅改 C sanctuary helper、可选输入类型及透传、`nature.ts` 必要类型导出、独立预览和本交接。未改 D 轮廓/走面/脚底/土层/路线、A 阶梯/转台、水锚、桥岸、tree v10、主瀑或材质。未并行调整长斜台、尖细缝、宽圆岸坡；参考级美术未通过。没有 UI 单元测试，没有重跑旧大矩阵，没有提交、推送或部署。

| 冻结源码 | SHA-256 |
| --- | --- |
| `nature-landform-sanctuary.ts` | `6f7f5fec2b7ecfbef19fcc7604151931e97b7979b586d228122f8186d82b681d` |
| `nature-landform-types.ts` | `68d3d409a402f3b5e38677b451ea5d88563e27b8ef215de805d0f9798ac3ef12` |
| `nature-landforms.ts` | `222ed609c84293eaf011e757292f8e26482902b5f2083c537c4af8da0b5a8f3c` |
| `nature.ts` | `db72e1d2987a100b67beb0ebc2715cfa5d416dbeefc3d422dc7fca217e11ba4f` |
| `nature-landforms-preview.ts` | `60306dc568307d2a76ad768ee72e447c23387dc71d0e9691fdae06a7521f6b9b` |
| `nature-landforms-preview.html` | `639a2c558469224b8947219e977fdf2f987374a9dba05e82151c609149ea2964` |
| `landform-layout.ts` | `8112d6b922649e6460a45237315f5c9523f28af6b461334d5958060eb705325a` |
| `composition.ts` | `05f56a21d6ce46e538513306d7a96c4fec458c3dcdbf1741a1c9983d955192f5` |
| `layout.ts` | `97068a1529cbcf410392577a6dcf15553f9e6c9f72e7e63b8c8dcc0a66ec9b0a` |
| `src/world3d/index.ts` | `2b12824848fe80b71c37b4ca45dae5b879bff60d9c1fc9ecf51bf5dc37d28610` |

桥岸仍为 `325267b5db00b569dcb1384e514208f923974d008f66c8051a2cb5dea6ca8076`；tree v10 `281e0463…`、主瀑 `fc87710d…`、cascade `735bcbe4…`、materials `d878ccf1…`、rocks 与 61 个既有 C public 文件均保持本切片之前版本。完整 318 文件及 SHA 见[最终源码快照](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/final-source-snapshot.json)。它记录的是拍摄/检查版本，不代表之后共享工作区所有模块仍未变化。

## 输入与实现

运行输入直接来自 D 唯一权威 TS exports，不在 C 资产中另存坐标。D composition 已接线：

```ts
springBranch: {
  points: [...REFERENCE_SPRING_BRANCH.sameStepLocalSideExit,
           ...REFERENCE_SPRING_BRANCH.remaining],
  bodyRadius: REFERENCE_STAIR_LANDING.minimumBodyRadius,
  centerHalfWidth: REFERENCE_SPRING_BRANCH.centerHalfWidth,
  supportClearance: REFERENCE_STAIR_GROUND_CLEARANCE,
  additionalSupportClearance:
    REFERENCE_SPRING_BRANCH.additionalSupportClearance,
}
```

`NatureLandformContacts.springBranch?: LandformSpringBranch` 只传给 sanctuary。`centerHalfWidth` / `additionalSupportClearance` 缺省均为 0；不传整个 `springBranch` 时绕过新增构建，旧 e4ca 同 D 几何的 attributes/index/groups/drawRange/userData 对照一致。桥岸两档逐属性保持不变。

最终 D 铺面宽 .76m、允许中心半宽 .08m、身体半径 .28m，C 有效清障半径 **R=.36m**。`supportClearance=.14m` 加 D 声明额外保守量 `.16m`，对应线性 canonical 削顶余量 **.30m**；真实 D 脚底验收阈值仍为 **.14m**。真实脚底可低于 canonical，不能称 blended 脚底只会更高。额外量包含 D 后平台允许中心相对 canonical 的偏差，由 D 声明，C 不另调地形。

[直接 TS 导出](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/D-final-ts-input.json)包含四个 D hash、完整运行路径与 cPayload。最终派生 JSON SHA `d6d99034…` 已与其 cPayload 核对一致，但 JSON 不成为运行权威输入。

每段仅切有限身体胶囊域，端帽/转弯由相同世界相位的 256 边外切圆近似；逐段合并约束，不对整条折线取凸包或挖包围盒。下降段按所有能覆盖该点的身体中心的最低线性脚底构造保守上限，包含有限端点和转弯圆盘。裁切后保留真实侧壁/底封口；同平面墙带统一收口，Float32 同位/微边折叠后重新三角化。没有遮罩、隐藏穿体面或忽略坏边放行。

原有顶点移动数 0；被替换原位置 low 161 / high 150 个，距有限路线最大 .357757 / .358251m，均在 R 内。独立检查还允许约 .0001174 / .0001155m 的显式数值带（外切离散、pad、Float32 和局部微边修复）；域外缺失原位置为 0。此项证明原位置保留范围，不宣称域外每个三角连接、法线和 UV 全部逐字节不变。

## 已完成检查与边界

| 检查 | low | high |
| --- | ---: | ---: |
| 连续 canonical 完整有限身体域最小脚底净距 | .3000992758m | .3000992886m |
| 真实 D 允许中心 / 完整 .28m 身体圆盘 | 3423 / 3423 通过 | 3423 / 3423 通过 |
| 真实 D 最小脚底净距 | .2912225907m | .2912225907m |
| 腿起点（脚底 +.12m）最小净距 | .4112225907m | .4112225907m |
| 后平台 1680 中心最小脚底净距 | .8797289257m | .8156515602m |
| 旧 f4c 失败中心，完整身体圆盘净距 | .2925882657m | .2925882657m |
| 旧阶梯完整三角 + 两侧 .28m 最小净距 | .1399985745m | .1399986668m |
| 旧转台欧式扩张域最小净距 | .1399997711m | .1399997711m |

连续检查对实际三角形解析求有限 swept discs 的极值，包含竖直投影面；不是中心点探针。真实 D 检查以原 `springCentreAccess` 过滤允许中心，以原 `referenceWalkHeight` 取脚底，逐中心与所有 C 实际三角形求完整身体圆盘交集：支路及节点 1742、后平台矩形 1680、归档失败中心 1。后平台身体可能伸出 R=.36 裁切域，因此没有以裁切域过滤 C 面。真实 D 是有限中心覆盖，不能冒称该函数全连续域证明。旧阶梯/转台沿用 1e-5m Float32 容差。

两档最终 Buffer 的 nonfinite / degenerate / invalidIndices / boundaryEdges / nonManifoldEdges / inconsistentWinding 均为 0。闭合结论为位置焊接后的边关联检查，不等于全自交或 Boolean 实体流形认证。

独立正式 `createReferenceNature`（清空无关旧 placements、仅控制 TextureLoader 光学 I/O）与 raw opt-in 几何 hash 相同，low/high 每份 geometry 各释放一次，28 张本轮纹理请求/释放均 28、借用环境释放 0。另一次[失败回退检查](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/final-invalid-factory-check.json)：low 提交 → NaN 身体半径导致 high 失败并保留旧模型/registration → 恢复 D 半径后 high 重试成功 → 连续 dispose；4 份 geometry 各释放一次、42 张纹理均释放、环境释放 0。两组资源计数来自不同检查，不相加为一次加载预算。

[构建](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/final-build.log) `npm run build`（tsc + Vite）通过，既有大 chunk 警告保留。[独立复审](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/final-review.md)未发现确认的 P1/P2；没有新增 UI 单元测试。

## 几何与同步构建成本

| C 两部件合计（桥岸不变） | 未传支路 | 传入最终支路 |
| --- | ---: | ---: |
| low 三角形 | 25,500 | 39,308 |
| high 三角形 | 45,264 | 57,938 |
| low 属性/索引数组 bytes | 3,366,000 | 5,188,656 |
| high 属性/索引数组 bytes | 5,974,848 | 7,647,816 |
| 自有 geometry / 主渲染 draw | 2 / 3 | 2 / 3 |

其中 sanctuary low/high 为 34,156 / 40,334 三角形；没有新增贴图。单次本机 raw 工厂同步构建，未传支路约 259 / 288ms，传入支路约 **1554 / 1761ms**，不含独立几何审计耗时。这段计算仍阻塞调用线程；浏览器切档曾超过 3 秒等待窗口、随后读回 ready，不据此宣称流畅、实机性能或可中途取消。性能优化没有夹带进入本次冻结修复。

## 同版 D、同机位真实前后图

before 仅把 sanctuary helper 换回 `e4cae666…`；其余 317 文件与 after 一致，包含最终 D `.16` 输入与真实 A 神殿/桥/阶梯/转台。不是拿历史 D7c/0055 的截图充当前版对照。采用原 PBR、曝光 1.08、相同灯光及机位；截图 1280×720，WebGL 1920×1080。圆柱标记为实际 D 脚底上的有效清障域诊断，不是完整角色或步行证明；池面也是诊断示意，没有加载 B 动态水或全 D 场景/碰撞器。

| 机位 | 旧 e4ca | 最终 6f7f5fec |
| --- | --- | --- |
| 出口 high | [before](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/final-before-exit-high.jpg) | [after](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/final-after-exit-high.jpg) |
| 侧向 high | [before](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/final-before-side-high.jpg) | [after](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/final-after-side-high.jpg) |
| 出口 low | — | [after](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/final-after-exit-low.jpg) |

[6 条捕获记录](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/final-capture-metadata.json)含 5 张最终图和 high→low→high 最后读回；[before 日志](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/final-before-browser-logs.json) / [after 日志](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/final-after-browser-logs.json)均空。所有最终图已实际回看；本任务预览页与临时服务器已关闭，未动共享 5173。

[after 永久可重放快照](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/final-replay-source-snapshot.json) / [before 永久可重放快照](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/final-before-replay-source-snapshot.json)保留同版 318 文件副本；[证据清单](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/evidence-manifest.json)记录源码、图像、报告及文档 SHA。副本不包含 node_modules；可复用本地依赖运行，原截图捕获的临时路径保留在原快照中。冻结证据不等于后来共享场景的浏览器结果。

## 历史失败留存

旧 D7c 三点路线复现、0055 中间态、f4c 候选足底净距 .13250831m（不足 .14m）与其开边失败均保留，不再运行旧矩阵。f4c 归档失败中心已在最终实际 D/C 上重新计算，完整圆盘和原身体点均约 .29258827m。旧“进行中/等待 D”交接另存[历史工作记录](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-spring-route-r5/historical-handoff-progress.md)，不代表最终状态。原失败截图/JSON 仍按 historical / same-D-before 原名保留。
