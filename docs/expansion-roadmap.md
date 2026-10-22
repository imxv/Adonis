# 万象画廊：扩展与协作计划

更新时间：2026-10-21（北京时间）。当前已发布基线：`3240b7c`。

## 最新生活场景修正（2026-10-22，已交付本地体验）

用户要求钓鱼、烹饪、NPC委托全部改成与大厅/花园一致的像素游戏形式，替换常驻网页卡片。以[生活像素场景v2](life-pixel-direction-v2.md)为准：A独占kitchen，C独占commissions（覆盖历史A所有），D独占fishing；已完成gallery/garden/meta保持。根另只读核查并说明3D当前默认旧场景可玩、新reference候选未默认启用，不因状态询问展开3D重做。

2026-10-22 17:44：三处均冻结并完成有界浏览器验收，root将最终组合生产包更新至同源5291。源码、构建、真实资源与当前入口已对齐；尚未提交/推送/上线。具体结果见状态看板及三份pixel-v2交接，后续以用户反馈推进，自动化保持暂停。

## 花园修正（2026-10-22，已交付本地体验）

用户要求花园不再采用网页形式，改成和游戏一致的像素花园。按[像素花园方向](garden-pixel-direction-v1.md)改为可走动庭院与近距离播种/收获/调制交互。A独占新garden/pixel-renderer.ts及pixel-art-*，C独占garden/index.ts、garden.css及pixel-controls.ts；根拥有pixel-contract.ts统一坐标及整合。已完成像素大厅保持，meta规则/存档和3D不扩大。本次直接任务推进，自动化暂停状态保持。

## 大厅修正（2026-10-21，已交付本地体验）

用户要求参照已生成大厅图，改成程序生成/绘制的精细像素大厅，不接受现有简陋呈现。A已获得B明确释放的gallery.ts/css和新增gallery-pixel-*.ts独占写入；B保留controller/主线/音频，继续冻结旧renderer功能链路。以[像素大厅v3方向](hall-pixel-direction-v3.md)为当前实现/视觉验收标准，覆盖下文B持有gallery和hall-v2图片背景的历史分工。生活玩法交付保留，3D仍延后。新大厅验收前不按旧图片背景候选发布。

## 最新用户修正（2026-10-21，覆盖下文历史3D派工）

用户明确：**3D只是补充，现有模型基本具备即可，后续再打磨；现在先做其他功能与玩法。** 保留现有3D模型、源码、证据和未决项，停止持续美术、材质、逐面净空与参考图迭代，不再以3D达到参考图作为其他玩法开发或独立功能发布的前置条件。未验收实验组合不因此默认启用，也不宣称3D美术已通过。

当前进入第二阶段生活循环，执行范围与最新文件责任见 [生活玩法第一版](life-loop-v1.md)。四个原会话复用：A烹饪/NPC界面，B大厅和主线接入，C局外规则/存档/花园回流，D独立2D钓鱼。`src/hub/gallery.ts`、`gallery.css` 重新交B负责，根此前大厅美术修改已结束。下文第一轮和3D分工是历史记录，不再触发继续美术派工。

先做能实际游玩的“钓鱼→烹饪/委托→花园与单份出征补给→主线回流”，再做原创桌游与地区扩展。3D仅处理阻断启动、退出、存档或核心通行的必要问题。总指挥仍是唯一提交、推送和部署负责人。

## 已确认的方向

用户授权总指挥持续组织美术、UI 与玩法迭代，可创建专门会话协作。主线继续是画中肉鸽冒险；大厅以画作为不同冒险世界的入口，不局限于阿多尼斯。用户已明确选择 **风格化绘画 3D**，用于第一人称希腊神话探索世界。

统一风格不要求两种技术呈现完全相同：2D 保留精致像素轮廓，3D 使用绘画质感的材质与光照；共用大理石白、旧金、陶土红、海蓝、柏树绿、回纹、星象和画框的视觉语言。新界面优先可读性、留白、触控和稳定布局。

## 主循环

画廊选择画作 → 主线冒险 → 带回修复材料与种子 → 修复画廊、种植或参与副玩法 → 选择一份出征补给 → 再次进入主线。

3D 探索 → 发现遗迹、解读壁画、完成短谜题 → 带回收藏、画廊陈设与配方 → 扩展大厅和主线选择。

副玩法始终自愿参加；收益侧重选择与收藏，不做无限永久叠加的战力、不让经营变成开局必做的劳动。旧存档继续能玩，未参与副玩法的玩家仍可正常通关。

## 分阶段交付

| 阶段 | 内容 | 可验收的结果 |
| --- | --- | --- |
| 第一轮：完整的小循环 | 统一视觉规范；可步行画廊；主线画作；花园与局外存储；3D 首区 | 从大厅进入主线和 3D 世界并可靠返回；一次冒险结算、一次种植收获、一次出征使用真实连通 |
| 第二轮：生活与角色 | 画廊修复、园艺配方、NPC 委托、钓鱼与烹饪 | 冒险获得材料，生活玩法产生有上限的出征选择；NPC 随画廊成长发生变化 |
| 第三轮：原创桌游 | “命运骰”短局原型，再做“诸神牌局” | 先证明规则好玩，再增加收藏与 NPC 对手；先不一次性铺满两套系统 |
| 第四轮：世界扩展 | 更多画作、神话地区与独立主线章节 | 以数据与模块扩展入口；已有角色、装备和收藏可形成跨画作联系 |

第一轮 3D 首区为“爱琴海岸 → 橄榄圣林 → 山巅神庙”：目标约 10–15 分钟探索、至少 3 个可进入/抵达的地标、5 个独特发现和 1 个完整环境谜题。远景可展示后续地区，但必须区别于当前可达区域。庞大世界是分区扩建目标，首区不能只是空旷平面、重复柱阵或不可交互的模型展示。

## 第一轮历史工作包与文件责任

所有会话共享当前本地仓库；不得切分支、重置、批量暂存、回退别人改动。每个工作包只改自己所有的文件，需要跨边界时先写交接说明，根会话协调。**总指挥是唯一提交、推送、上线负责人。**

| 工作包 | 独占修改范围 | 第一轮交付 |
| --- | --- | --- |
| A 美术与 UI 规范 | `docs/visual-direction.md`、`src/ui/visualTheme.ts`、`src/ui/visualTheme.css`、`docs/art-review.md` | 可复用语义色、画框与文字规范、动效/触控原则；现有屏幕问题清单与下一轮改造顺序。暂不改共享 UI 老文件 |
| B 画廊大厅与主线接入 | `src/hub/**`、`src/main.ts`、`src/game/GameScene.ts`、`src/game/run.ts`、`src/ui/ui.ts`、`src/save.ts`，以及必要的既有输入/音频生命周期接点 | 真正可走动、有交互的大厅；主线画作/继续存档/花园/3D 画作；生命周期与退出返回；消费局外补给和结算回流 |
| C 花园与局外成长 | `src/meta/**`、`src/sidegames/garden/**`、`docs/meta-economy.md` | 独立版本化局外存档、幂等结算、有限材料、种植/收获/单槽补给；独立挂载的花园界面 |
| D 希腊神话 3D 探索 | `src/world3d/**`、`public/world3d/**`、`package.json`、`package-lock.json`、`docs/world3d.md` | 按需加载的 Three.js 第一人称首区、真实探索/谜题/发现、质量档位与完整释放；仅此工作包改依赖 |
| 总指挥 | 本文、`docs/expansion-status.md`、跨包接口协调、整合和发布 | 审查、生产构建、实机/模拟边界说明、浏览器验收、部署证据、下一轮派工 |

旧的 `tools/playtest.js` 和 `output/` 属于历史未提交验收产物，所有会话禁止顺手提交、删除或覆盖。禁止给 UI 写单元测试；可用浏览器验收和有意义的非 UI 规则校验。

2026-10-21 12:45 追加的小切片：A 第一轮主题与规范已接收，现授权 A 独占修复 `src/ui/screens.ts` 中 `openCodex` 的选中格离屏问题；必要时仅调整 `ui.css/mobile.css` 的图鉴专属规则。只滚动图鉴列表本身，不动详情/外层和 B 所有的 `ui.ts`；本切片不包含全屏字体迁移。B 已获知边界，总指挥统一整合。

用户随后明确否定旧大厅美术。`src/hub/gallery.ts` 与 `gallery.css` 已由 B 确认释放，现由根协调的前端代理重做，资产和方向见 [大厅美术第二版](hall-art-direction-v2.md)。旧大厅截图不满足发布视觉标准；其余工作包继续，优先完成这次用户反馈。

## 历史3D参考重做分工（现已转为后续backlog）

根已将生成参考保存到 `docs/art-references/world3d-v3/`。旧功能和2D/UI模块不再并行修改；先交一个实际模型/材质样片证明新方法，再展开完整区域。

| 会话 | 新职责 | 独占写入范围 |
| --- | --- | --- |
| A 美术与UI会话 | 神庙/古迹/桥/泉池建筑模型与PBR材质 | `src/world3d/reference/architecture.ts`、`architecture-*`、`public/world3d/reference/architecture/**`、`docs/expansion-handoffs/architecture-reference.md` |
| B 大厅集成会话 | 水体/分级瀑布/反射折射与动态效果 | `src/world3d/reference/water.ts`、`water-*`、`public/world3d/reference/water/**`、`docs/expansion-handoffs/water-reference.md` |
| C 花园会话 | 橄榄树/岩体/自然材质/成组植被 | `src/world3d/reference/nature.ts`、`nature-*`、`public/world3d/reference/nature/**`、`docs/expansion-handoffs/nature-reference.md` |
| D 世界会话 | 参考机位、总体空间/地形/光照/PBR管线、玩法重映射与整体集成 | `src/world3d/reference/contracts.ts`、`layout.ts`、`composition.ts`及其余原世界文件；独占共享入口和依赖 |
| 根 | 参考/标准/对照评审/协调/发布 | `docs/world3d-reference-direction.md`、`docs/world3d-reference-prompts.md`、参考图目录及本计划/状态 |

D在 `docs/expansion-handoffs/world3d-reference-plan.md` 给出工厂契约。三组先查看参考、分解结构和做局部原型；契约未定不猜入口。任何共享文件只能由D修改，其他组不覆盖；D自己的代理也不得写A/B/C范围。五个发现与谜题可以映射到新空间，不能让旧平地坐标决定新构图。接口生命周期保持明确，必要渲染钩子通过契约交接。此分工由根明确授权，先前D独占整个world3d的规则在这些子目录让位。

## 初始接口约定

这些约定应先由各负责人落实为最小可导入的模块，再继续实现内部逻辑；接口变化写入交接说明，由总指挥协调，禁止互相猜测或改写对方文件。

- A：`src/ui/visualTheme.ts` 导出无 Phaser/Three 依赖的 `VISUAL_THEME`；`visualTheme.css` 的类与变量使用 `ag-` 前缀，不重写全局 `.overlay`/`.frame` 等旧选择器。B/C/D 可以导入复用。
- C：`src/meta/profile.ts` 提供 `loadProfile()`、`settleRun(summary)`、`claimDiscovery(id)`、`prepareRun(runId)`。`summary` 至少包含稳定的 `runId`、`victory`、`floor`、`kills`、`elapsedSeconds`。同一 `runId` 结算和准备必须幂等，发现按稳定 ID 去重。先写 `docs/meta-economy.md` 明确返回类型、资源上限和补给效果；B 从此文件接入。
- C：`src/sidegames/garden/index.ts` 导出 `mountGarden({ container, onExit }): { dispose(): void }`。花园界面自行读写局外存档，但不得写主线存档或操作 Phaser 场景。
- D：`src/world3d/index.ts` 导出异步 `mountGreekWorld({ container, onExit, onDiscover, discoveredIds?, quality? }): Promise<{ dispose(): void; pause(paused: boolean): void; resize(): void }>`。发现回调仅传稳定字符串 ID；不直接写局外/主线存档。初始化失败需回收已有资源并抛出可处理错误。B 负责进出、状态和存储。
- B：主线仍走现有选角、难度和继续存档路径，保留移动端全屏/横屏尝试与竖屏继续。新局取得唯一 `runId` 并存入可选字段；继续游戏保留该 ID，不能再次消费补给、发放奖励或应用加成。
- B：新大厅是安全区域；进入花园或 3D 前，暂停主线与大厅输入、时间、音频和触控，退出后只恢复应恢复的状态。3D 只从大厅进入，不能让战斗在后台继续。
- B：用独立大厅/入口调度模块承载新模式，不把大厅更新逻辑塞进既有 `GameScene.update()`。Three 容器独立于使用 CSS zoom 的 `#ui-root`，不能只隐藏 Phaser 画布当作暂停。保留常驻主线场景，处理旧结算延迟回调、全局 UI 键盘监听与 Tone Transport 的归属。

## 第一轮内容与平衡边界

- 花园先做少量可辨识的植物与 2–3 种有上限的出征补给，单局最多携带一份；进度以冒险推进，避免靠修改系统时间或无限开关页面收获。
- 3D 先做探索、考据式环境叙事和谜题；神话改编与真实史料区别标注，不先塞入另一套大型战斗系统。
- 成长收益不能直接无上限提高伤害、暴击或护甲。涉及现有排行榜公平性时，先明确补给状态记录或分榜方案，不能把增强后的成绩无标识混进旧分数。
- 只使用原创、项目已有或许可明确的资源；有外部资源需记录出处与许可证，不复制参考游戏素材、角色或整套规则。
- 先提供一段有密度、能探索、能返回、能带回发现的世界，再逐区增加面积与细节。不要把粗模、占位按钮或 TODO 通路当作完成。

## 验收与发布

每个负责人提交：改动文件清单、已验证事项、截图/录屏、已知边界、交接接口，不自行 push。总指挥按依赖完整的版本发布。

必须覆盖：旧存档继续、新局/继续只触发一次、结算去重、补给仅一次、跨模式进出三次、键鼠/手机横竖屏、控制与音频恢复、慢速/失败加载和返回。3D 的鼠标锁定必须由手势触发，Esc 释放，手机提供触控与低档；不支持 3D 时仍可正常玩 2D。

3D 桌面 60fps、移动低档 30fps 是性能目标，不是未测前的保证。记录测试设备/浏览器/分辨率、帧率、资源体积和重复进出情况；应用分区加载、实例化/合并、纹理预算与渲染分辨率上限。资源释放须覆盖纹理、几何体、材质、渲染器、事件和循环。

工程参考：[Three.js 资源清理](https://threejs.org/manual/pages/cleanup.html)、[大量对象优化](https://threejs.org/manual/pages/optimize-lots-of-objects.html)。

发布需确认提交 SHA、开发机 `deployment.json`、实际资源及外网页面一致。构建通过、已推送、已上线、浏览器模拟、真机测试分别报告。

## 2026-10-21 16:43 · r5 连续地形与资产接点分工

根已读取并采纳 `docs/expansion-handoffs/world3d-r5-landform-plan.md` 和 `world3d-r5-landform-contacts.json` 作为有界实现起点；它们目前是提案，不是运行权威或美术验收。四个原会话已收到续做消息，不再重复派工。

- D：独占r5 layout、类型与运行接点数据（可新增 `reference/landform-layout.ts`）、土壤帽/实际水底/走面、圣泉台座/接盆/窄渠槽/石嘴、总集成与共同光照。先固化接点供各组只读消费；不复制A/C/B的可见资产实现。移除旧方块远岸占位，先用连续低起伏远岸组织构图。
- C：独占 `nature-landforms.ts` 等nature helper及必要工厂接线，新建神殿前基岩和圣林凹盆/桥东岸自然承载。真实侧背面、裂隙/坡脚/凹口，不用旧基座非均匀拉伸或均匀横带挤出。先前基岩/池岸两处，不并行扩远崖/植被种类。共享数据、主瀑fc877、nature-cascade、水锚、树v10不动。
- A：独占 `architecture-stairs.ts` 等architecture helper及必要工厂接线，消费D的21+23级两段flight、3.2m宽和转折landing，细化实际踏面/边缘/有限低墙。D保留走面权威，C保留旁侧岩体；不能再复制一套路径数据。主神庙/桥和footprint冻结，泉龛待D实测台座后再开。
- B：完成当前证明依赖归档后，消费D的新短sourceReach、两个controlled落水、0.4m rill。D做真实承载，B只做水，不用加厚旧悬空渠床遮问题。主瀑默认几何/公式及既有证据不变；圣泉新段单独标明动态/几何验证范围，不沿用主瀑认证。

D可将提案固化为唯一运行数据，其他组可先做参数化独立样件，运行接线必须等权威数据应用，不能将提案JSON或独立样片称已整合。必要接点调整由D更新并交根协调。既有文件归属和唯一发布者不变，禁止UI单元测试，保留历史 `tools/playtest.js` 与 `output/`。

16:57 接点修订：D运行权威 `landform-layout.ts` SHA57055d17取代原提案的0.8m转台，lower.end改为[19.5,17.9,-20.3]、upper.position改为[20.5,17.9,-23.8]，实际landing约3.64m并有新outlineXZ。A/C已获通知直接消费当前导出，禁止按本注释另写一份数据。可见石顶为walk+.018，C承载为walk-.14；referenceFlightTreadTop已含可见偏移，避免重复叠加。后续D运行权威若再修订，以其新版本及交接为准。

17:31 泉龛切片：只读探查确认D当前carrier Y18顶面宽1.72m、长约3.473m，旧grove.spring 6×6×4占位不代表可用支承。根已派A仅Y18以上紧凑泉龛/高出水口的参数化模型（architecture-spring-shrine等自己文件），原神庙/桥/石阶冻结，不重复D台座/接盆/渠。D先正式导出唯一装配frame、支承polygon、后侧通行保留区、固定world spout与方向/宽度，再正式接线。建议采用实际台座frame；旧placement不得与新frame叠加。源点[24.6,20.3,-22.8]、world+Z、宽.30m保持，不为模型居中移动水锚。A可先建只接收输入的独立builder，不从方案另存运行坐标权威。仍须同版实体接触、支路通行与水体净空/实景验收。

17:57 圣泉支路局部修复：D权威 `REFERENCE_SPRING_BRANCH.revision=r5-spring-route-fix-01`（landform SHA7c166313）删除原回穿A阶梯/低墙的转点，出口直连泉龛后沿，frame/水口/水路不变。C仅修 `sanctuary-front` 对该身体走廊的侵入，桥岸/主瀑/树/材料保持冻结，不并行大改形。由C新增可选输入 `NatureLandformContacts.springBranch={points,bodyRadius,supportClearance}` 并在自身工厂透传；D待类型落盘后传唯一导出的 sameStepLocalSideExit+remaining、landing.minimumBodyRadius及REFERENCE_STAIR_GROUND_CLEARANCE。坐标不得复制到C资产。局部承托低于线性走面.14m，覆盖.28m身体边界并保持连续厚体；真实两档网格验证后交D同版回拍。A无需因旧回转穿墙改冻结石阶。完整证据及限制见 `docs/expansion-handoffs/world3d-r5-spring-route-fix.md`，不是全路线或视觉放行。

18:00 支路输入补充：D正在收窄原2.6m路带，C新增可选 `springBranch.centerHalfWidth`（缺省0仅表示中心线输入）；运行值由D权威声明，清障半径=centerHalfWidth+bodyRadius，不把玩家中心可横移范围混同于身体半径。D同步真实canWalk、可见铺石和支承域，离开onPath的地形回退也不得重新放行旧冲突处。最终宽度未发布前，不把±.28m采样或C中心走廊称为完整可行走域通过。

18:03 D权威宽度正在收口：width=.76m、centerHalfWidth=.08m，sameStepLocalSideExit后增加一个同级外转点再下接固定rear；C直接消费运行导出，清障总半径=.36m。原fix-01三点采样属于旧证据，最终新revision/hash与控制器域闭合后再验收。

18:05 下一美术切片顺序：D先完成fix-02/C走廊接入及必要通路复拍，随后仅处理固定waterfall镜头左侧自身土层的连续陡坡形体。有限射线归属和旧冷启动图在r5证据目录；先确认当前画面，再调整主岸肩/局部陡壁/下层岩台，保持主瀑fc877、主潭水位与边界、自然出口、刚收口通路接点，区域外不变。暂不联动灯光、水shader、C全体岩体或新副玩法；影响C接地时先明确最小接口范围。

18:08 A出口美术返工：泉龛0e9efe82工程交付保留；A仅把外露矩形安装框/铜筒改成与偏心拱肩连为一体的青铜狮首吐泉真实几何。固定world源点/方向/.30通孔及贯通铜喉、原石龛主体/支承域/后通路，不改D台座水路或全局铜材。新版本独立hash与正侧嘴同机位对照；旧工程整合和新美术验证分开，所有者/发布权限不变。

18:18 B有界光学切片：仅natural water.outlet的绿色玻璃状端口/主潭硬接与波纹尺度。保留全部水道几何、两端/水位/宽度/自然实体床，主潭自身光学、圣泉、主瀑冻结；B可改自身water-streams/helper及必要传参，不改共享布局/地形或A/C，不增加离屏捕获/依赖/贴图。独立固定近口/桥侧/海端low-medium真实GL前后与动态观察，几何证据和新光学版本分开，再由根复审。

18:33 C实际脚底补充：可选springBranch.additionalSupportClearance由D唯一权威给出并传入C，C有效局部承托裁切为supportClearance+additionalSupportClearance；缺省0。D以实际floor函数和必要定向证据说明额外量，不能把有限最低值当严格全域证明；原四点路线/走高/通行/水路保持，改动仅为了C真实脚底.14承托，不扩大整个地形重做。

18:43 B光学边界补充：在分层实际GL确认后，可仅修改water.outlet.channel-bed外观材质（颜色/粗糙度/衔接），几何/水位/实体存在和其他水体/床默认行为保持。不能以整体不透明遮矩形或关闭主潭焦散代替修复；涉及床几何仍先给根最小方案协调。

18:59 C下一单体美术：6f7f5fec工程冻结后，仅重塑sanctuary-front可见长斜整面，以少数米级、不对称主岩面/连通凹槽改善参考01/02与固定grove画面。保护轮廓/落座/脚部/阶梯转台/spring通行验收域，裁切算法保持，桥岸325267b5/主瀑/树/材质/水锚/共享文件不变。C自己nature helper与独立预览/交接归其所有，新候选单列hash/同机位对照及必要保护域检查；D当前6f快照继续实走，新版不自动继承旧证据。

19:24 左岸下一片改为先交最小联合形体方案：两轮D-only候选未形成两层宽台，D先给局部坡肩退让轮廓/高度、准确受影响C bank外环点与old→new回调、内传范围和收口。可提出调整此前冻结的接地带或mural非行走土翼，根协调C后才落共享变更；此条不批准D改C文件或静默改callback。C当前sanctuary单体继续独占。真实路面及身体域、主潭水位/边界、自然出口、主瀑、水路/材料/照明保持，先用小型形体预览验证横向进深，再做必要实际接地验收。

19:35 B湿岸局部范围：真实GL隔离后，根批准B只处理sea outline edge4 [10,0,18]→[-8,0,17]之step3（原quad342/face684–685）湿岸材质。B可改water-shore及必要自身helper/factory接线，沿用实际已提交D土底PBR借用生命周期、连续湿度过渡；几何位置/index和存在不动，不改D地形/水位/outline/outlet接点及其他水体。该段通过后才决定扩同边；若需真实土面贴合几何，先交单段方案协调。当前批准实施，不是美术放行。

19:38 A后续只读装配切片：V10独立狮首资产冻结，A可新增自己的architecture-spring-assembly-preview.*并用独立冻结副本读取真实D carrier、B圣泉factory与C6f做局部装配实景，查喷流/落盆/遮挡/整体比例；不得改D/B/C实现、另存一套坐标或替换伪造承托。A预览范围不代替D整体集成权限；缺接口交根协调。当前未参考美术放行。

20:09 A泉龛局部铜材候选：原铜材冻结仅在独立预览的泉龛variant范围让位，V10几何positions/index/法线、源点/孔/装配及D/B/C不变。最多两候选，沿用已有纹理只读、局部材质自有释放，不改全局bronze/金饰/其他资产，不新贴图/RT/依赖。固定原lab和D两种已有光照分别对照参考02，根视觉复审后再确定生产factory接线。水口交界依旧等待B专项，此颜色任务不构成净空或美术放行。

20:24 B下一片转圣泉近口专项：湿岸r3小段保留未扩，B读取A V10冻结真实装配和原500边交界报告，追真实fall子类/aData/UV及shader动态/透明贡献，有限相位加同机位GL，再交仅water.sacred-source-drop近口的最小修正方案。A几何/D源点方向/.30m物理孔/台座盆/主瀑默认及其他水段均保持，先明确责任与边界再实施；不得把无属性基形交点直接当动态堵水或擅改A/D。

20:30 联合岸体正式实现分工：D独占contracts.ts的ReferenceGroveBankPatch、正式grove-bank-patch/columnDelta、目标profile/geometry/composition能力接线，先提供共享类型与无C运行时依赖helper；在04b原域内完成台沿错开/退让口/墙脚斜转折并更换shape revision。C独占nature-landform-types可选字段、landforms仅向banks透传、banks及新局部helper，允许局部分区共享边切分/顶底侧同柱变形封口，保留旧136点MVC/foundation/域外和缺省行为；先前banks冻结在该最小范围解除。C sanctuary当前任务保持，可内部独立分工，不扩主池/桥堤/树/主瀑或C体Z3.5以南。D权威给最终terrainY和唯一weight，.18只满权重硬约束，T0从原C三角顶包络；禁止复制方案多边形或双重混合。仅新增局部侧面UV映射可修，不全局调材/光。C同版ready前不启用新D产品callback，先独立整合且失败保留旧组合；正式模型仍需封口/接地/保护域与固定机位/原生通路验收，根唯一提交发布。

20:37 A铜材下一候选边界：仅独立私有geometry副本可新增mesh-derived标量attribute（或等价不增纹理方法）驱动真实凹凸关联磨亮/积锈；V10所有既有position/index/normal/UV/color与装配保持，不动铜喉实体/AO-wear、他人文件或生产factory。沿B做一个候选，验证D/lab两既有照明及高低大特征，不用压暗/三角网线/隐藏角度掩盖形体，不新增纹理/RT/依赖。该允许新增属性不是解除水口几何冻结。

20:43 接线位置明确：D正式composition传顶层natureOptions.groveBankPatch及旧基场terrainHeight；C拥有的nature.ts允许最小新增该可选类型和透传，nature-landforms仅交banks，contacts本身不另加第二份patch。消费D共享协议常量及grove-bank-integration的能力/ready结构，默认无patch保持旧分支，ready只承诺同版处理完成。
