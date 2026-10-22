# C grove bank patch r7：参数化几何候选

2026-10-21。五份 C 源已冻结，独立定向几何、冻结构建及正式 D shape05 的真实组合两档实拍均已完成，可交根协调逐图评审。**完成的是可选参数、局部闭合后处理和有限读回，不是产品默认启用、整体接地、美术或原生路线验收。** `state:'ready'` 只确认同版局部后处理完成。

证据目录：[nature-grove-bank-patch-r7](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7)。来源与 SHA：[final-source-manifest.json](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/final-source-manifest.json)。原 C325、旧 type/factory/nature 和当前五源均独立保存；D 三依赖另存 `d-target-snapshot/`，冻结时与工作区无差异。

## 接口与几何

顶层 `ReferenceNatureOptions.groveBankPatch` 直接传给 `ReferenceLandformOptions.groveBankPatch`，再只给 `GroveBankLandformOptions`。`contacts` 无副本，sanctuary 的 options 不带此字段。`createReferenceNature.groveBankPatchContractRevision` 等于 D 正式 `REFERENCE_GROVE_BANK_PATCH_CONTRACT_REVISION`。成功的 `reference-grove-bank-landform.userData.groveBankPatch` 含 `state:'ready'`、`revision`、`shapeRevision`、`baselineRevision`；失败抛出，不会返回一份未完成的新 ready 岸体。

C type-import D 的 `ReferenceGroveBankPatch`，直接消费 D 正式 `groveBankColumnDelta`。有 patch 时，原岸体的 outer10、全部136个 MVC 输入、标量 foundation 与桥肩构造都继续查询 `patch.baselineTerrainHeight`，不调用外部新 `terrainHeight`。先完成原 `clearFlightFaces`，再处理原几何。

原渲染 Float32 面保持不可变，T0 是这些原三角面在 XZ 的最高交点，包含独立桥肩的原顶面，不是 D 值、减 .24 列、foundation 或已经移动的点。域相交父面经垂直平面分区，域外拆片仍回到原父平面；共边切点同步传播到必要邻面。原独立壳体各有独立节点/边键，相邻或相交壳体不会因坐标接近被合并。

局部初始细分最长 XZ 边 .28m、最多5轮；之后只对 D 局部采样识别为同一仿射面且最终权重为1的面片追插值误差，最多12轮。识别使用 .01m 邻域有限二阶差分与 `sample`，不导入任何04b/05平台、core、路水或保护多边形。每个原/新增同 XZ 柱通过缓存只消费一次正式 delta，顶、底、侧加同一个值；不增加 fade、guard、独立混合、硬 clamp 或垂向 padding。新增三角形硬顶20,000，超限或不收敛直接 throw。

不相交的完整原面仍保留原 position/normal/UV/color、材质身份及相对顺序。局部拆片的未动属性从原父面重心插值；发生位移的局部面用实际几何法线和3m/tile主轴 UV，避免直接拉长旧壁贴图。全局材质、树、主瀑和资源不改。

原构造接点保存在 `constructionBaselineContacts`。patch 分支的 `contacts` 另从最终 Float32 三角缓冲读回原查询 XZ 的最高/最低 C 命中，不把19点 D 目标或原 MVC 输入叫作最终脚点。未传 patch 完整保留原接口/元数据行为。

## 正式 shape05 有限验证

[shape05-finite-geometry-check.json](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/shape05-finite-geometry-check.json)，脚本为同目录 `check-shape05.mjs`。D 正式 target SHA `749ea9a42453f8756f416a7f788e483b043be07b6529c19c52c3be04e6b27d9f`；基场取独立冻结873c/a1e7/20ad的最终解析回调。检查没有安装产品组合。

| 项目 | low | high |
|---|---:|---:|
| 三角形 原→候选 | 5,152→18,700 | 17,604→29,204 |
| 新增三角形 | 13,548 | 11,600 |
| 与域相交原父面 | 354 | 1,184 |
| 完整原面全部属性原字节 | 4,786 | 16,412 |
| 原岸体基场调用数/顺序保持 | 216/一致 | 244/一致 |
| 外部新 terrainHeight 调用 | 0 | 0 |
| 每独立壳体 boundary/nonmanifold/winding/degenerate/nonfinite | 全0 | 全0 |
| T0独立38点原面读回误差 | 0 | 0 |
| 同柱位移代数最大误差 | 4.45e-16m以内 | 4.45e-16m以内 |
| 实际局部最长 XZ 边 | .279993m | .279690m |
| 仿射识别有限面探针最大超目标残差 | 9.45e-6m以内 | 9.56e-6m以内 |

未传 patch：两档 position、normal、UV、color 缓冲及 groups 与原325逐字节相同，原地场调用坐标及顺序相同。原 X/Z 包围范围仍为 X[-2.236000061,19]、Z[-23.5,3.5]，没有向南延伸。

18个既有核心检查坐标中，原 C 仅覆盖上台4点 `[16.7,-1.4]`、`[16.7,-.4]`、`[16.7,.6]`、`[17.7,-1.4]`；最终真实 Float32 面读回净退让分别在 `.1799999629…m` 至 `.1800000047m` 之间，按1e-5m容差通过这4个有限点。上台另5点和下台9点都没有 C 命中，不能计作18点通过，也不能为覆盖它们扩原体范围。

**非仿射与 partial 边界仍需根协调结合图像判定。** 同一有限面探针集，未识别成仿射面的满权重区，最高仍超 `terrainY-.18` 约 **.254144m**，即可能高于 D 面约.074144m；不能将4个平面核心点通过推广成整个满权重区的硬上限。partial 面探针最高可高于 D 面约 **3.03985/3.06907m**，保留了正式一次权重公式，不能宣称该带有.18m退让。参数化候选不会自行压平这些区域。若根协调要求这些区域也满足实际面硬接触，需要 D 提供权威细分约束或另立匹配候选。

同步完整 banks factory 的本轮一次观测为 low约2.68s、high约4.18s，包含原岸体/局部后处理/接点读回；不是帧率、浏览器、设备或性能验收。旧 springCut metadata 时间不代表此工作量。

## 顶层透传和失败资源

[top-level-forward-check.json](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/top-level-forward-check.json) 执行真实 `createReferenceNature` 和真实 C landform/banks 函数；为限制范围，只将材质/纹理加载器换成6份 owned fixture 材质、清空 placements，并使用独立冻结6f sanctuary。此证据只验证函数链和资源归属，不是当前 sanctuary、真实 PBR 或浏览器证明。

一次 low 成功表明顶层同一个 patch 对象到达 banks、sanctuary 参数无 patch、能力和三 revision ack 匹配。随后强制 high rebuild 的 sample 抛错，旧层及旧几何保持；清理后所有 owned 几何/材质均只 dispose 一次。直接 banks 的非法 weight、NaN target、自交域、sample中途 abort、预先 abort 也均抛错；创建出的中间原 geometry 释放一次，借用材质/map不释放。

## 保留的失败历史与后续

- `initial-028m-core-residual.json`：04b初版 .28m 面在 `[16.7,-1.4]` 仅.172004m退让，约差8mm。节点公式正确不能替代面内读回。
- `adaptive-budget-failure.json`、`adaptive-budget-failure-helper.ts`：追全部满权重曲面时超20k新增预算，真实throw、不返回几何；没有放宽阈值。
- `planar-prototype-*.json`：04b仿射识别的有限中间研究，不能作为正式05证明。

上述后续已由 root 与独立 checker 完成，最终证据见下节。未写UI单测，未重跑旧3423/全树/瀑/全场矩阵，未提交、推送或部署。旧6f路线记录和04b照片不自动迁移给此候选。

## Root最终同版读回

[完整339文件快照](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/complete-source-snapshot.json)固定了五份C、当前D/A/B、130份public资产和独立预览。composition为 `237b1f11d3c400785f139791ff7ba2a917dda6f6e254feb8570d94589c5d5391`，C helper为 `54a24374eff446ceb28ece4c6485d588493a77f084f0942f82e640187fb5ba89`。sanctuary保持C11 `b4804893…`，没有混用6f图片。原D873解析审计依赖已永久保存为[190文件快照](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/baseline-D873-source-snapshot.json)，不再仅依赖临时目录。当前工作区若有后续A/B/D编辑，不能算本快照的已验证运行结果。

[独立最终精简报告](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/independent-bank-summary.json) / [原始报告](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/independent-bank-check.json) 为PASS。除上表结果，还独立重核所有3746/3317缓存列T0，误差≤1.78e-15m；官方delta每XZ恰好消费1次；同壳同XZ节点的最终Float32厚度误差≤4.77e-7m。父面覆盖、方向边、完整原面属性与局部闭合均无失败；这只支持每个原壳的局部边界，不证明壳体Boolean并集或全局无自交。当前composition237与旧D873仅在实际构造查询的216/244点高度差0，**不是全局地场相等证明**。两档pure raw banks factory一次含trace观测约3.12/3.43s，排除随后analytic，保留同步CPU风险；不是设备或帧预算验收。

[最终静态复核](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/final-static-review.md)未确认新增P1/P2。owner真实函数+材质fixture的失败保留证据仍独立署名，不把它说成独立checker或真实PBR失败演练。最终快照 `npm run build` 退出0，[最终构建日志](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/frozen-build-readback-final.log)保留既有大chunk警告。中间只读取点工具的TS注解错误及修复日志也保留，未影响五C产品源。未写UI单元测试。

真实场景直接调用正式 `createReferenceComposition`、A/C/B工厂及正式target；before未传候选，状态 `legacy-default`，after显式传入同版target并读到 `active-matched`。这证明隔离预览的握手接通，**没有修改产品默认请求**。同一冻结源/材质/光照、时刻60、截图1280×720、buffer1600×900；图像为原生JPEG，未修图。

| 同固定机位 | before high | after high | before low | after low |
|---|---|---|---|---|
| D固定瀑布 | [实图](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/before-waterfall-high.jpg) | [实图](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/after-waterfall-high.jpg) | [实图](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/before-waterfall-low.jpg) | [实图](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/after-waterfall-low.jpg) |
| 旧桥近侧 | [实图](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/before-near-high.jpg) | [实图](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/after-near-high.jpg) | [实图](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/before-near-low.jpg) | [实图](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/after-near-low.jpg) |
| 两台诊断侧视 | [实图](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/before-side-high.jpg) | [实图](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/after-side-high.jpg) | [实图](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/before-side-low.jpg) | [实图](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/after-side-low.jpg) |

固定瀑布before：

![旧D/C固定瀑布](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/before-waterfall-high.jpg)

同版after：

![正式05与真实C参数化after](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/after-waterfall-high.jpg)

近侧after：

![两台近侧实际形体](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/after-side-high.jpg)

独立[高档](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/visual-review-high.md)与[低档](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/visual-review-low.md)视觉复审均认为“两台、长短错位、退让口、大转折可读，可带缺点交逐图review”；人工梯台感、纵向拉伸与局部尖齿仍在，**未美术通过**。根以真实画布取点：高档瀑布6点中5点、侧视6点全部命中D地表，说明这些纵向拉伸采样处属于D，不能全部归给C材质。报告见[瀑布可见面](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/after-waterfall-high-visible-pixel-rays.json)和[侧视可见面](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/after-side-high-visible-pixel-rays.json)；只比较Cbank与Dterrain最近交点，未纳入A/B遮挡，不推广整幅图。

低档side `(445,380)`、`(492,411)`小尖脊命中D；上缘 `(758,50)`尖面命中C，正式权重约.04354，可见面高于最终D约.951m。[实际取点与解析target读回](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/after-side-low-picked-target-readback.json)把partial允许的残留落实到了可见点；C没有为抹平该边界再加clamp/重复weight或擅改D目标。此项及非仿射/partial总体边界仍交根同版美术评审，不冒称全域接地。

高→低→高以独立预览重建方式加载，[高档返回实图](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/after-waterfall-high-return.jpg)仍为 `active-matched`；**这不是产品同实例动态LOD或原生通路验收**。当前两页[before日志](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/before-browser-warnings-errors.json) / [after日志](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/after-browser-warnings-errors.json)warn/error均为空。[13张相机/质量/握手元数据](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/capture-metadata-final.json)与[最终证据清单](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-grove-bank-patch-r7/final-evidence-manifest.json)保留完整来源。预览服务器结束时关闭；可用r6 `preview-server.mjs`指向本目录 `final-sources`，打开 `/src/world3d/prototype/bank-preview.html?mode=after&quality=high&view=waterfall&clean=1` 复现。
