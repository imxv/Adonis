# D · r5 圣泉支路 fix-02（r5-spring-additional-support-01）

状态：**r5-spring-additional-support-01 的 fix-02 局部工程整合已完成：固定 C `6f7f5fec…`、A `533997fd…`、B `ff5ba027…` 快照完成两档有限接触检查与 medium 原生键盘支路往返。** 四点 fix-02、D 走高/中心域/控制器不变；旧 D fixture/数值复核保留 0055/62e 原 SHA。A 泉龛及泉嘴已在本次固定快照加载，`springSpout=matched`。本结论仅适用于下述固定源码及已记录范围；A/B 仍为外观候选，**美术未通过，未发布**。

唯一坐标权威为 `src/world3d/reference/landform-layout.ts` SHA `8112d6b922649e6460a45237315f5c9523f28af6b461334d5958060eb705325a`，`REFERENCE_SPRING_BRANCH.revision = r5-spring-route-fix-02`。布局 `layout.ts` SHA `97068a1529cbcf410392577a6dcf15553f9e6c9f72e7e63b8c8dcc0a66ec9b0a`；集成 `composition.ts` SHA `05f56a21d6ce46e538513306d7a96c4fec458c3dcdbf1741a1c9983d955192f5`。旧 e671、7c166313 和三点 fix-01 都不能代表当前完整运行接点。

## 当前四点与通行参数

`sameStepLocalSideExit` 保留第 8 级中心及同级局部 +X 出口；`remaining` 先接外侧同级短转，再到泉龛后沿：

```text
[18.706521739130434,19.23695652173913,-25.169565217391305]
  → [20.163114387199787,19.23695652173913,-27.07700797081546]
  → [20.8,19.23695652173913,-27.07700797081546]
  → [23,18,-25]
```

`REFERENCE_SPRING_BRANCH.width=.76m` 是可见支路宽度，`centerHalfWidth=.08m` 是允许的人物中心横向范围。身体半径仍为 .28m，C 必须清空中心横移与身体合并后的 .36m 扫掠半径；不能只给中心线或旧三点路线开孔。本次额外传入 `additionalSupportClearance=.16m`，只将既有 C 裁切范围内的线性承托顶降到最低 canonical 脚底减 `.14+.16=.30m`；实际 D 脚底不变。最终固定快照的有限实际网格检查满足 `.14m`，范围见下节。

D 已把 `walk.spring` 宽度接到 .76m，并在 `composition.ts` 中接入严格支路中心域；邻近的普通平地 fallback 不能任意扩展支路，声明的阶梯和泉龛后沿通行域保留。最终D有限fixture已通过：1,240个允许中心采样、516个转弯圆盘采样，224组向外控制器运行零逃逸；6种正反向帧步长运行无停滞。此结论限定D允许中心域及真实index移动块，不代表A/C实体净空、浏览器或整条路线通过。

原 west 阀交互物 `[20,18.81,-25]` 与半径 2.3m 保留；删除的是旧路线转点。泉龛 frame、rear、出水源、两段阶梯、landing、桥、主瀑和全部水点与 fix-01 上版一致。

## C 的当前输入与生命周期

D 经 `nature({ ...common, landforms })` 传入 `springBranch`：

```text
points = [...REFERENCE_SPRING_BRANCH.sameStepLocalSideExit,
          ...REFERENCE_SPRING_BRANCH.remaining]  // 当前四点
bodyRadius = .28
supportClearance = .14
centerHalfWidth = .08
additionalSupportClearance = .16  // C-only vertical reserve; horizontal radius unchanged
```

C按 .36m 扫掠半径清空局部连续岩体。对每个岩体XZ，须取所有身体圆盘覆盖该点的允许人物中心之**最低线性canonical脚底**，再减 `.14+.16=.30m` 裁顶，不能只取岩点最近中心线的脚底。D最终末段按后沿入口平面连续接Y18；相对最近线性canonical脚底的有限差值为[-.05013069298310313,+.014232752854457686]m。因此仍须区分 canonical 削顶偏移与 actual D 身体承托；本次最终固定快照已完成下述两档有限整合检查，未重跑 C 所有者的大矩阵。几何及 NatureMaterials 石材/湿润 PBR 仍由 C 的内部 OwnedSet 统一拥有；D 只传 canonical contacts，不创建外部 C 湿润材质，不改变冻结主瀑岩体。

## 固定 C6f 快照的局部工程结果

证据目录为 `src/world3d/evidence/reference-v3/r5/fix-02/`。`cold-source-before.json` 记录固定服务副本 `/private/tmp/adonis-r5-fix02-preview-20261021-185542`：C sanctuary `6f7f5fec2b7ecfbef19fcc7604151931e97b7979b586d228122f8186d82b681d`、nature `db72e1d2…`、landforms `222ed609…`，桥岸保持 `325267b5…`；A shrine `533997fd…`、B water `ff5ba027…` / streams `ed22f463…` 是本次加载的外观候选。该 manifest 的 `browserStatus=not loaded yet` 是开始加载前的记录；后续同一固定副本实走见 `native-walk.json`。

`snapshot-contacts-archive-manifest.json` 关联原报告、执行脚本及精确 audit module；导入的 33 份源码稳定，32 份与冷启动 manifest 匹配，另 1 份 painterly 与最终 payload 匹配。low/high 各检查 15 个允许中心（支路 10、后沿 5）、真实 A/C factory 网格与 26 个 A collider / 0 个 C collider：均允许通行、身体样点零冲突；各 255 个 C 承托探针满足 `.14m`，最小约 `.292588265m`，泉嘴精确匹配 `[24.6,20.3,-22.8]`。这是定向有限检查，沿用原报告的踏步/转台/底座排除及 instanced-mesh 限制；它不构成连续全域身体证明，也不重复 C 的拓扑大矩阵。

`native-walk.json` 保存 medium 下原生 keyboard + drag、无 teleport 的实际往返。由圣林经桥及两段阶梯到第 8 级 `[18.70,20.96,-25.18]`，再经同级侧口 B `[20.16,20.96,-27.10]`、水平转台 M `[20.82,20.96,-27.10]` 到泉龛 rear `[23.03,19.72,-25.02]`；向前在 `[23.35,19.72,-24.31]` 止步，再原路回到第 8 级 `[18.74,20.96,-25.18]` 并下至转台 `[19.56,19.62,-20.31]`。以上 Y 为眼高，脚底减 1.72m；实际读回 `springRestored=true`、`springSpout=matched`、三盘 `0,2,3`，renderer 读回 `1280×720`。

`fix-02/loading-record.json` 与 `loading-page-trace-prefix.json.gz` 记录了当前页面 frame 对应主线程的实际长任务：已捕获单次 RunTask `2849.421ms`，另有 `1705.409ms` / `1609.883ms`。这是 50MiB 截断前缀中恢复的当前页事件，不是完整加载过程最大值，不能归因为 C 单独构造耗时。重载期间另有一次 3000ms DOM 等候超时，稍后 intro ready；69173ms 观察上界含工具和助手间隔，不是准确加载耗时。稳定 FPS 不能替代这些加载停顿记录。

该局部工程结论不表示参考图美术通过或发布验收。C 下一份 sanctuary-front 独立美术候选须按新 hash 复审，不能继承本次 C6f 通路证明。后续 D 左岸土层阶段已在固定 C6f/A533/Bff 副本完成 waterfall / 桥北近景 GL：集成 SHA `873c9899…`，仅 D 局部土体新增 profile/mesh guard，未变更本支路接点。结果仍未达到美术目标，详见 `world3d-r5-left-bank-shape-result.md`。

## 历史冲突与 fix-01 有限结果

以下均为旧路线/旧三点候选的历史证据，**不能迁移成 fix-02 的结果**：

- 原 e671 路线从同级出口回返 `[20,18.81,-25]`，穿回 A 上段 flight、landing 和低墙。历史腿部探针在 `t=.116279` 穿入约 .00694m；A 44 三角碎低墙包围为 `[20.155483,18.926696,-26.618457] → [20.345922,19.376696,-26.395204]`。
- 原回返后半段在 `[21.428571,17.9,-25] → [21.476190,18.284392,-25]` 产生约 .384392m 走面跳差；键盘可移动不代表实际网格身体通道通过。
- 旧 7c166313 fix-01 只有三级中心/侧出口/后沿三点，侧出口直接到后沿的 XZ 长约 3.515947m，旧阀距约 1.772218m。两档各 76 站、最小离 A 几何约 .009885m，均只属于该三点候选；当时 2.6m 铺石带并不代表全宽无交叠。四点 .76m/.08m fix-02 不继承这些数值。
- 原三点 C 高度包络 `t=0..0.386667`、XZ `[19.883114,-27.357008] → [21.286568,-26.469285]`、线性承托顶 Y `18.618667..19.096957`、最大需降约 1.12m，以及最差点 `[20.719191,-27.014867]` / 上限 `18.915536`，均是历史三点高度结果。它们不能作为当前四点 C 清空范围、实际支路脚底或净距证明。

## 证据版本

历史文件保留各自原始 hash 与候选标签：

- `src/world3d/evidence/reference-v3/r5/actual-route-mesh-before-branch-fix.json`：原实际 A/C factory、.28m 身体与原控制器语义；包含旧候选有限探针。
- `src/world3d/evidence/reference-v3/r5/spring-route-mesh-handoff.json`：旧最小冲突对象/坐标交接。
- `src/world3d/evidence/reference-v3/r5/spring-direct-candidate-check.json`：旧三点中心/±.28m、阀距与候选高度读回，不能当作 fix-02 复核。
- `src/world3d/evidence/reference-v3/r5/actual-walk-before-branch-fix.json` 及 `spring-branch-conflict*.png`：旧缓存键盘路线复现。三盘实际旋到 `0,2,3`、圣泉恢复，仍不消除网格冲突。

A 每档 132 个级心、7 个转台内部探针与 +.018m 顶面一致、最大误差约 7.4e-7m 是原有限阶梯证据；本次没有修改阶梯，也不扩展该证据为四点支路通过。

fix-02 原始D有限证据（冻结在 composition `62eba5d7…` / authority `0055de3c…` / layout `97068a15…` / index `2b128248…`，原报告及SHA保留，未在本任务重跑；与当前8112/05f的未变逻辑关系见下节独立定向报告）：

- `src/world3d/evidence/reference-v3/r5/spring-final-domain-check.json`：`pass=true`、`sourcesStable=true`、failures空；1,240允许中心/516转弯采样，最大相邻走高差约.01140873m；后沿入口1μm邻点最大差约4.60037e-7m。控制器帧高差最大约.12040621m是移动过程升降，不是零距离接缝。
- `src/world3d/evidence/reference-v3/r5/spring-final-domain-review.json`：同SHA独立有限数值复核，最近段等距线1,601对最大跳差约8.55010e-8m，后沿边界175对约4.60037e-8m，17,100个立面严格内部探针无允许通行。原review没有独立`pass`字段，本页依据其稳定源及上述结果记录复核通过。
- 新增`world3d-r5-spring-branch-final.json`收录完整canonical branch、C payload、source/evidence哈希与有限指标。

旧三点A净距、旧回返.384392m跳差、当前D数值通过分属不同版本/证据层。A工程泉龛helper磁盘SHA `0e9efe82…` 是先前工程归档，未在当时旧缓存冷加载；本次 C6f 固定副本加载的是 A `533997fd…` 候选。最终有限接触及实际支路往返见上节，不改写任何历史失败。实际场景主报告由D根汇总；本交接页不把局部工程完成写成美术通过。禁止UI单元测试，本次文档任务未新增或运行测试、未提交。


## 额外承托修订 r5-spring-additional-support-01

`REFERENCE_SPRING_BRANCH.additionalSupportClearance=.16` 与 composition 的 C 输入一致，支路 `revision` 仍为 `r5-spring-route-fix-02`。这是 C-only 竖向修订：基础 `.14m` 加额外 `.16m`，有效线性 cap 偏移 `.30m`；四点、`.76m`可见宽度、`.08m`中心半宽、`.28m`身体、`.36m`水平裁切半径、D真实走高/通行域/controller、A阶梯、frame及水路均不变，未抬D脚底。

独立解析报告按当前分段仿射 min/clamp 走高推导：`.08m`中心tube紧界约`.050147m`（松界`.051639m`）；泉龛后沿允许中心矩形 local X `[-.58,.58]`、Z `[-.08,.77]` 的最大最近canonical与actual D竖向差约`.1255221037m`。选`.16m`后保留约`.0344778963m`工程余量。旧有限样本`[-.05013069,+.01423275]m`仍仅是有限证据，不充当解析全域界。该推导依赖冻结走高公式及范围；不覆盖未来几何变化、Float32裁切拓扑缺陷或错误水平覆盖。

证据：[`independent-bound-review.json`](../../src/world3d/evidence/reference-v3/r5/support-margin/independent-bound-review.json) 和 [`targeted-check-results.json`](../../src/world3d/evidence/reference-v3/r5/support-margin/targeted-check-results.json)；路径/报告SHA及新旧freeze关联见最终payload。后者证明只新增字段/comment及C直接传参，D走高/地形/canWalk的30关键点读回相同；typecheck由D所有者完成，本交接任务未重跑旧矩阵或UI单测。0055/62e原fixture/review原封保留，未冒称在05f下重新执行。

水平裁切仍只有`.36m`；后沿允许中心矩形加`.28m`身体圆盘会超出该capsule，范围外未削顶的C面须单列实际身体/承托检查。`.30m`是canonical削顶偏移，不是已测actual C净距；不能将f4c中间态`.1325m`或“未穿体”写成`.14m`达成。本次 C6f 固定副本的有限 actual D 身体/承托及同版浏览器往返已完成，具体范围见上节；美术仍未通过。

解析后沿矩形界仅描述允许后平台**人物中心**的 actual D 脚底 F 与 nearest canonical line G 的高度差；它不是所有 rear-body 点均被 C `.36m` 胶囊覆盖的证明，也不是 actual C 网格承托的严格全域界。`.16m` 是公式依据加工程 reserve 的输入，不能表述为已保证 `.30m` 实际净距。
