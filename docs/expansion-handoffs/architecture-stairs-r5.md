# A · r5 两段石阶与转折平台

2026-10-21。交付21+23级真石阶、实体转折平台、三处有限低墙片段，以及同源参数的独立实际样件。**工厂接线已落盘、独立页已加载，不等于r5主世界冷启动、实际行走或参考美术验收。** 神庙/桥及其比例、footprint、本轮石材修订保持冻结，泉龛未制作。

## 权威接点与文件

运行参数只消费D的 `src/world3d/reference/landform-layout.ts`，最终证据SHA `6ce738d058956ea65667539956a9b21b7dcdff8428c72fb549ea435cc63ff683`。未从旧JSON复制另一组轮廓；旧0.8m转台/轴线未使用。

| 接点 | 本次消费的D值 |
| --- | --- |
| lower | `[10.9,14.2,-18.2]` → `[19.5,17.9,-20.3]`；21级，run8.852683m、yaw-1.331297 |
| upper | `[20.5,17.9,-23.8]` → `[15,22,-28]`；23级，run6.920260m、yaw0.918625 |
| 转台 | `REFERENCE_STAIR_LANDING.outlineXZ` 原样消费；analytic Y17.9，可见石顶Y17.918；18cm实体厚度 |
| 级面 | `referenceFlightStepCenter(flight,i).Y - flight.position.Y` 作为local `treadTopY`；只再加一次共享 `REFERENCE_WALK_SURFACE_OFFSET=.018` |
| 承托 | D的analytic floor减 `REFERENCE_STAIR_GROUND_CLEARANCE=.14`；A石底插入约lower18.19mm、upper20.26mm、landing22mm |
| 支路 | 从D同级中心识别upper index7，沿local+X；同侧低墙开口0.76m，即身体半径0.28m另加每侧0.10m余量 |

`architecture-stairs.ts` 是纯参数化几何builder，不创建材质、贴图、灯光、scene、RAF、输入或存档。`size/treadTopY/surfaceOffset/landing polygon` 均由外部显式传入；不在builder另藏半级高度公式。`architecture-stairs-layout.ts` 负责消费D权威、拒绝id/位置/尺寸/yaw漂移（含NaN yaw），并给局部短墙样式；`architecture.ts` 仅新增这两个r5 stairs id及一次landing装配。未知stairs继续列为unimplemented。

每段返回 `first-tread / last-tread` 两个**可见级面**锚和独立 `design-end` 锚。首末与整层平台之间存在权威半级高度过渡，不能把design-end当最后一级石顶：lower可见首末14.306095→17.829905；upper18.007130→21.928870。

## 实际造型与修正

- 44级均有独立水平踏面和真实riser，底边/后缘保留方口实接，只有上前鼻口磨圆。不是长坡贴纹理。每级三块石，缝仅5mm且少量错开；中央安全带 `abs(localX)≤1.26m` 不做随机位移。
- 16/132块外侧踏石有退损：X退27mm、Y下凹不超过34mm、Z退38mm；只退入原包络，不添加凸起。磨损、擦亮与边缝沉积使用原顶点color/roughness字段，沿用温润石灰岩PBR；未新增纹理或改全局光照。
- 转台按权威polygon裁切错缝铺石，含封闭底/侧面及退入砂浆芯。两档形状相同，未非均匀拉伸模型或以薄单面片假冒实体。
- 低墙仅lower左侧3..6、upper右侧5..10（切开第8级出口）、upper左侧16..19三短段。内缘在踏面半宽外0.28m，顶高约踏面上0.30–0.34m；未做环山挡墙或高基础裙边。模型未新增低墙collider，D可按其玩法碰撞策略处理。
- 第一版回拍发现踏鼻黑色点划线，数值复现为砂浆芯穿出圆弧石面。前芯退22mm、侧芯退350mm后，两档各8096探针的穿出从2146/2160降到0；修正未改阴影、材质或光照。初版图片与检查保留，不能当最终效果。

## 固定相机证据

[实际石阶样件页](http://127.0.0.1:5207/src/world3d/reference/architecture-stairs-preview.html)。证据目录：`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/stairs-r5/`。

`plain-high-{overview,lower,turn,upper,branch}.png` 与 `after-high-{overview,lower,turn,upper,branch}.png` 是五组同源参数的实际WebGL素模/细化对照，**素模专为本页制作，不是r4历史运行截图**。每组相机、target、FOV、画布、曝光、太阳、IBL、AO、flights/landing与surfaceOffset逐项相等；截图1488×1037、high画布1607×1120。另有一次 `after-low-upper.png`。没有重复旧UI/移动端/完整功能矩阵。

实验页省略D/C地形承托，因此可见悬空底面；它用于检查真实体积与接点，不能作为整合接地成功或失败的结论。`browser-observations.json`保存12条状态与空console error/warn；high→low→high后lab资源计数恢复geometry23/texture21，low23/17，只是观察而非完整泄漏证明。

## 几何预算与有界验证

| 部件 | high三角 / 字节 | low三角 / 字节 |
| --- | ---: | ---: |
| lower | 2,220 / 247,288 | 1,516 / 174,744 |
| upper | 2,632 / 296,128 | 1,856 / 216,432 |
| landing | 344 / 38,016 | 324 / 34,984 |
| 合计（6材质网格） | **5,196 / 581,432** | **3,696 / 426,160** |

借用现有limestone/mortar，无新增材质/贴图；正式世界可共用既有A资源。独立页high全pass20,793三角/31calls，low7,395/14；不是主世界总帧成本或真机FPS。冻结神庙的既有全pass预算与贴图成本没有被这些数值替代。

- `stair-geometry-check.json`：当前权威+共享偏移，两档均0非有限/退化/反法线/索引异常；每档660踏面、126立面接缝、9出口、295权威平台射线通过，另有凸/凹polygon参数样件。670份临时与最终geometry各释放一次，借用材料dispose0、新贴图0。
- `nosing-overlap-check.json`：真实旧/新源码对照及穿出例，最终穿出0；每档5632个中央安全带定点平面探针通过。只是静态几何，不等于角色身体走通。
- `factory-check.json`：仅本次stairs工厂的25项针对性断言，真实新几何、mock PBR loader；两段/一次landing、未知及漂移参数拒绝、NaN yaw修复、高低档替换与6份最终几何释放、18份两批material各释放一次、借用environment不释放。未重跑旧226项suite。
- 根全仓 `npm run typecheck` 已通过，解决了此前预览Object.values属性的unknown错误。只读接口/代码复核的NaN yaw问题已修并实测拒绝；无剩余所审P1/P2。未新增UI单元测试、提交、推送或部署，历史tools/playtest.js/output未触碰。

## D合成前必须交接的可见面所有权

A工厂已经生成两个flight与一次landing，root.userData发布 `authoredStairIds` 和 `authoredLanding`。本次最终读到的D `route-surfaces.ts` 仍生成 `D / merged temporary stone treads` 及同level临时landing；**合成时D应跳过这两段和该landing的临时可见石面，避免同面重叠**。保留flight矩形、landing polygon对普通path slabs的排除，不能通过删除layout里的stairs来禁用，否则普通路径石会重新铺进阶面。A没有越界修改D文件。

D继续负责走面优先级、土壤帽/基础承托、支路外部落脚与铺路、接地和实际身体行走；C负责侧边可见基岩。静态出口开口可见且射线无阻，不证明外部支路已接上。独立实看仍认为石块/磨损/短墙偏规整，和参考的自然侵蚀层次有差距；先在D/C真实承托与共同光照下合成复核，不自称参考美术通过。
