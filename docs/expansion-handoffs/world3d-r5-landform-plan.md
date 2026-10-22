# D · r5 有界地形/路线与资产接点（r5-spring-additional-support-01）

状态：**r5-spring-additional-support-01只新增C局部降顶竖向余量.16m；四点fix-02、D走高/严格中心域/控制器均不变。旧D有限证据保留0055/62e原SHA，新增定向差异检查确认逻辑未变；C最终实际网格/身体承托及同版冷启动仍待验，没有路线或美术通过。** 唯一运行接点权威为 `src/world3d/reference/landform-layout.ts` SHA `8112d6b922649e6460a45237315f5c9523f28af6b461334d5958060eb705325a`，布局入口 `layout.ts` SHA `97068a1529cbcf410392577a6dcf15553f9e6c9f72e7e63b8c8dcc0a66ec9b0a`，集成 `composition.ts` SHA `05f56a21d6ce46e538513306d7a96c4fec458c3dcdbf1741a1c9983d955192f5`。`world3d-r5-landform-contacts.json`仅为当前运行导出的派生读回，A/C不得复制另存一套。布局修订为 `v3-reference-r5-grounded-terraces`，交接快照修订为 `r5-spring-additional-support-01`，圣泉支路几何修订仍为 `r5-spring-route-fix-02`；水路、两桥、三池、阶梯和完整泉龛frame/spout/access快照见 `world3d-water-layout-r5.json`。

共享导出：`REFERENCE_TERRACE_CONTOURS`、`REFERENCE_GROVE_POOL`、`REFERENCE_STAIR_FLIGHTS`、`REFERENCE_STAIR_PLACEMENTS`、`REFERENCE_STAIR_LANDING`、`REFERENCE_SPRING_BRANCH`、`REFERENCE_BRIDGE_EAST_CAUSEWAY`、`REFERENCE_SACRED_WATER`、`REFERENCE_SHORE_APPROACH`、`REFERENCE_SPRING_SHRINE`。`referenceFlightFloor/StepCenter`的Y是解析脚底走面；`REFERENCE_WALK_SURFACE_OFFSET=.018m`，`referenceFlightTreadTop`已含此偏移，A不得再加一次；`REFERENCE_STAIR_GROUND_CLEARANCE=.14m`是C承载面相对解析脚底走面的净距。D隐藏土壤在阶梯下再低8cm。

## 冻结与改造范围

保留三固定相机、A神殿位置/尺度/柱网/门洞、grove.bridge位置/跨度/2.4m宽度与.8m安全半宽、C主瀑岩体fc877、主瀑统一变换/两级端点/ledge与主潭。e671版冷启动已接A第三版及新参数化阶梯、C树木281e0463及新独立岸体、B已冻结主瀑及新支流，实际hash见`src/world3d/evidence/reference-v3/r5/cold-source-before.json`。A泉龛立面现已新增到磁盘，但当前浏览器旧缓存尚未采用；当前8112d6b9接口修订与四点支路也尚待冷启动，不把磁盘状态写成已加载状态。重排上层圣林池岸、神殿前下方连续台地、上山阶梯、圣泉支流和必要低岸接近路；五个发现/三盘ID和谜题目标不变。

取消用宽北坡+硬矩形台面+硬池床三次覆盖决定地貌。改为彼此连接的三个有限轮廓：低岸坡脚→约11.3m圣林凹盆→14.0m桥东岸堤→17.7m转折台地→20.9m神殿前基岩。每层有不规则外轮廓和实际过渡距离，D负责土壤帽/水底/通行面；可见独立岩壁由C制作完整三维体，不能以纹理裙边或重复方块覆盖旧墙。

低岸过渡需要约8–14m水平宽度消化上层池与低岸的高差，外缘延至Z约3.5；不再在一格内从11m垂到1.4m。池岸、路径和台地交接必须同一高度函数，池内不能再跳过全部干路承载。主瀑旁仍沿冻结岩体留空，不把新岸坡推入瀑布廊。

## 连续路线

保留桥西/桥面/桥东原锚。桥东→`[10.9,14.2,-18.2]`接下段阶梯，至`[19.5,17.9,-20.3]`；约3.64m的实体落脚平台转向，再从`[20.5,17.9,-23.8]`升至原门前`[15,22,-28]`。两段净宽3.2m，总44级（21+23），设计单级约.1762/.1783m。真实yaw与run由两端计算，不把现有直梯斜拉成曲线。

**原提案0.8m平台已撤回。** 全宽凸包会侵入两段台阶，原中心路线产生约.4405/.6239m跳差；权威修订后，14条阶梯侧线按1cm站距无空面，最大跃差.178261m；转折.28m身体圈未出声明支撑域。此为解析面有限检查，仍需对A/C实际网格和浏览器身体走廊确认。C/A已由根通知消费新端点，不按旧JSON/.8m轴距出模型。

圣泉支路修订`r5-spring-route-fix-02`采用四点：第8级中心`[18.706521739130434,19.23695652173913,-25.169565217391305]`→同级局部+X出口`[20.163114387199787,19.23695652173913,-27.07700797081546]`→外侧同级短转`[20.8,19.23695652173913,-27.07700797081546]`→泉龛后沿`[23,18,-25]`。可见宽度`.76m`，人物中心仅允许横向`±.08m`，身体半径`.28m`，C按合并`.36m`水平扫掠半径清空；本次另传`additionalSupportClearance=.16m`，仅在既有C裁切范围内按最低线性canonical脚底减`.14+.16=.30m`降顶，实际D脚底不变。实际C对D脚底至少`.14m`承托仍须网格复核。D严格中心域与真实index移动块的有限fixture已通过；1,240允许中心、516转弯采样、224向外运行零逃逸。独立数值复核同SHA通过，C新网格仍待验。旧`[20,18.81,-25]`路线转点删除，该位置west阀交互物仍保留。原因、当前合同与历史证据边界见[圣泉支路fix-02](world3d-r5-spring-route-fix.md)。旧三点fix-01的76站、.009885m净距、阀距及高度结果仅为历史，不能迁移为四点通过；当前没有路线验收。

## 低岸接近路与普通泄流

旧`[2,8,3]`与海线同XZ，`[-5,12,0]`离旧海线不足1m，正确负水底与窄路叠加会再次造8–12m高薄墙。现海线在`[10,0,18]`以后绕至`[-8,0,17]→[-22,0,8]→[-30,0,-1]`等真实宽坡脚外侧，全部outline在`REFERENCE_SHORE_APPROACH.seaOutline`；普通泄流最终接点为`[17.8,.18,16.5]→[13,.10,18]→[8.8,0,19.6]`、宽2.4m，起于冻结主潭内部，止于新海面内部。首版在池角只点接、海口仅半宽覆盖，已依据B实际全宽结果撤回；本次把完整口及至少.3m前后段放入水面，不抬水遮岸。它与旧outlet是明确的新水路，不能沿用r4完整水路等价结论。

新增 `shore.outlet-bridge` **复用A冻结桥builder**，中心`[13,2.6,18]`、yaw=π/2，桥面冠顶2.6，真实两端`[13,2.2,21.6]`和`[13,2.2,14.4]`。D逐桥计算旋转走面、沿用中央.8m安全半宽、局部河床-.4m；两端实际土面读回2.06，桥冠下实际床-.4，未只摆模型。主路经过两端/桥冠，普通池边支路从南岸接出；星盘/壁画位置不变。

低岸桥土岸由D组织（约X9.5..16.4、Z12..24的低坡接触区，顶随两端2.06m，主潭水域不抬），不要求A重做桥，也不要求C扩一个新远崖项目。C圣林池岸的原前坡脚范围仍到Z约3.5，和低岸桥之间由D真实低岸坡/现有接近路连接；C边缘脚必须采 `terrainHeight`，不能假设整个外圈统一Y1.4。`REFERENCE_SHORE_APPROACH`与r5快照同时给B/C同版坐标。

## 圣泉：两次落水与短贴岩渠

固定源点仍为`[24.6,20.3,-22.8]`。保留很短的spout reach，使`water.sacred-spring.points[0]`仍等于A锚；随后上落水落到`[24.6,17.02,-21.2]`的接水盆。0.4m窄渠沿C实际岩面绕行，最终从`[17.8,14.45,-15.9]`落到`[16.2,11.72,-15.2]`的圣林潭内。完整点列在JSON。

这组候选在冻结C两档真实体上，以每.1m沿线、半宽+.05m、Y±.05m探针检查，三段最小净空约.345/.147/.415m，距原步道胶囊至少1.61m；是静态候选净空，**不是B新几何/飞沫/GPU动态验收**。不能删去`[21.5,16.6,-20]`折点，也不能提前省掉最后约1.08m出水石嘴，原直连曾穿C。

D制作连接北侧18m干路与前侧约16.48m C岩顶的短泉龛台座（真实拱托）、有厚度接水盆/窄渠/石嘴；不向8m低地拉12m实墙。B采用两个controlled waterfall及窄rill，撤掉原20多米跨空薄渠床。A泉龛立面/出水口须位于这个真实台座上；新立面源码已落盘，但旧浏览器缓存尚未采用，不能当作当前画面已有承托。

D `spring-carrier.ts`已生成真实短跨拱托/盆/窄渠/石嘴；实际r5北侧脚读回17.86，接水盆内径1.05、控制池`water.sacred-basin`。恢复后共有3个pool面，全局中档捕获仍至多1pass；B可对小盆选择无捕获方式，不能扩大预算。实际C新岸体对支流的净空与B落水/泡沫仍在复核。

泉龛实际承载框架由 `REFERENCE_SPRING_SHRINE` 一处给出：后端/原点`[23,18,-25]`，前端`[24.35,18,-21.8]`，yaw=`0.39922076957525304`，宽1.72m、长`3.473110997362451`m，台面Y18；局部X范围±.86m、Z范围0..3.473110997362451。完整四角支撑多边形、placement和坐标精度保存在两份派生JSON中，A直接导入TS。出水锚世界`[24.6,20.3,-22.8]`对应局部`[.6190415456438776,2.3000000000000007,2.648921962755196]`，世界朝向+Z，对应局部`[-.3887005054042955,0,.9213641609583288]`；口宽.3m，局部宽度向量`[.9213641609583288,0,.3887005054042955]`。后端至少1.05m保持通行，立面仅使用局部Z=1.05..3.473110997362451。出水口离局部右缘约.24096m，A不得扩大/移动D台座或水路来迁就立面，并须发布世界米制`grove.spring.spout`供D以2mm阈值匹配。此合同与源点保持不动。A新立面虽已落盘，尚未在当前缓存画面确认，不能把Y18台面或磁盘模型当作已加载的Y20.3出水源实体承托。

## 给C/A的独立资产边界

| 负责人 / 部件 | 必须接点与造型边界 |
| --- | --- |
| C 神殿前基岩 | 顶接A最低基座约Y20.98，主体X约4.6..25.4、Z约-35.2..-27.7；下方按JSON 17.7/14.0轮廓分裂为非连续整圈的岩脊、坡脚/裂缝/凹口。旧base实际深度12.7m且前缘-34.85，不能仅平移/fitmax放大冒充新资产。 |
| C 阶梯两侧承载 | 沿新两段轴线，顶始终低于实际tread-.14m；留出3.2m阶梯加至少.28m身体余量；转折台地是实体，有侧背面，不能全XZ框挡路。 |
| C 圣林凹盆与桥岸 | 上缘顺新池轮廓，水下约Y10.5..11.3，桥东实体岸堤顶约14.06；向外下接低岸，避免9m整幅直墙。桥两端必须嵌入岸岩，arch内保持水与可见孔洞。 |
| C 远岸替换 | r5合成移除旧方块状distant-cape/back-ridge占位形；D保留低起伏远岸地形。若保留可见远崖，须单独做自然连续轮廓，不能留下r4方柱组。 |
| A 两段阶梯/低挡墙 | 严格消费新flight/landing参数，细化踏面、侧缘、局部低墙和损耗；不改A神殿/桥冻结主体，不做沿全部坡脚等高大墙。泉龛按已发布的`REFERENCE_SPRING_SHRINE`真实承载框架及固定出水口接形。 |

资产目标是实际米制轮廓/接点，不是将完成模型非均匀塞进bbox。C可先独立生产新前基岩/岸体，不改fc877主瀑岩体；A只在明确新阶梯输入上开独立文件。D统一集成/转型，不让两组改layout或旧共享地形函数。

## 最小验证与回拍

D先完成新地形/路线数据，检查实际坡脚连续、台阶连接、桥岸落地、圣泉入潭与冻结主瀑没有坐标变更。接收C/A新资产后，以原grove/waterfall机位及桥岸/北岸侧面回拍，再看coast整体；不得只用正面遮挡证明侧面承托。只做本切片需要的几何/构建和实际步行检查，禁止UI单元测试，不重跑旧完整规则矩阵。参考构图、实体、颜色仍分别验收，当前方案没有任何相似度或美术通过声明。

当前D通过`nature({ ...common, landforms })`传入canonical contours/flights/landing/grovePool/causeway，以及`springBranch.points=[...sameStepLocalSideExit,...remaining]`四点、`bodyRadius=.28`、`supportClearance=.14`、`centerHalfWidth=.08`、`additionalSupportClearance=.16`，C在`ReferenceNatureOptions.landforms`内部生成新自然体并加入自己的`OwnedSet`。C统一拥有这些几何及其`NatureMaterials`石材/湿润PBR和质量切换、取消、释放生命周期；D不再外部调用C landform factory，也不另建或持有C湿润材质。旧`cliff.sanctuary-base`占位已撤，新自然体不替换fc877。材质颜色仍须共同场景实看，生命周期接线正确不代表材料或美术通过。A两段真实flight的authority/revision及landing的revision匹配后，D隐藏合并的临时tread/landing批次；普通铺石已裁去landing，解析走面和通行支撑仍保留。

2026-10-21口接复核的历史有限证据：`outlet-mouth-after-fix.json`记录的是landform `d723478e…` / layout `eba5136b…` / composition `78403d34…`，不能改写为当前8112d6b9/97068a15/05f56a21的网格重跑。该次实际B出口网格每口6,231样本（全宽与0.3m重叠）均在对应水面内，流路地面最低净空0.24499999m。当前TS派生的普通outlet/sea坐标保持该修正值；当前冻结项仅对r4的cascade transform、主瀑两级、ledge、主潭和grove.bridge执行`deepEqual`，五项全等。新sea/outlet与r4明确不同，不沿用旧完整水路等价结论。旧首版潭口0%/海口50%的问题保留为历史失败；B后续口接复核须独立记录版本。

历史缓存可见证据：2026-10-21T09:47:15.377Z 的e671版r5 grove cold记录（`src/world3d/evidence/reference-v3/r5/cold-frames.json`）读回 `authoredStairs=true`、`visibleLandforms=created`、`cascadeRegistration=matched`、`cascadeSupport=created`、`springCarrier=created`，但 `springSpout=unimplemented`。该次缓存未实现A立面/泉嘴；当前磁盘已新增A立面，但浏览器尚未采用，也未加载当前8112d6b9的四点fix-02及额外承托字段。该证据仅覆盖旧冷启动集成状态。旧0055/62e的D有限fixture/数值复核已通过，原报告不改SHA；新增定向字节/30关键点检查证明本次D逻辑未变。后续须等C按.36m水平扫掠及最低线性foot-(.14+.16)m局部裁顶，再用actual D身体复核；后沿允许中心矩形及其身体圈超出裁切范围的岩面仍须单列检查。最终末段在后沿入口连续接Y18，相对最近线性foot有限差约[-.05013,+.01423]m。之后冷启动采用当前资产/四点支路并确认spout=matched，分别核对身体走廊与画面；当前没有路线或美术通过。

最终D/C交接payload见`world3d-r5-spring-branch-final.json`，包含canonical四点、C的`{points,bodyRadius:.28,centerHalfWidth:.08,supportClearance:.14,additionalSupportClearance:.16}`、source/evidence哈希和D有限指标。C几何及湿润PBR仍由内部OwnedSet管理，所有水/桥/神殿/两段阶梯/泉嘴frame未因本次支路收敛改变。

## C额外承托修订 r5-spring-additional-support-01

本次仅发布`REFERENCE_SPRING_BRANCH.additionalSupportClearance=.16`及composition同值透传，不改四点、`.76/.08/.28`、D走高/通行域/控制器、A阶梯、frame或任何水路。C有效线性削顶偏移为`.14+.16=.30m`，水平扫掠仍`.36m`。独立解析对当前分段仿射走高给出中心tube紧界约`.050147m`（较松界`.051639m`），后沿允许中心矩形界`.1255221037m`；`.16m`留约`.0344778963m`工程余量。旧有限`[-.05013,+.01423]m`不能作为全域界。后沿矩形连同身体圆盘伸出既有C cutter的部分，不由这一竖向量保证净空。

解析依据与定向不变检查分别归档在`src/world3d/evidence/reference-v3/r5/support-margin/independent-bound-review.json`、`src/world3d/evidence/reference-v3/r5/support-margin/targeted-check-results.json`，源及报告SHA见最终payload。定向报告覆盖仅新增字段/comment/透传的差异、30关键点D走高/地形/canWalk不变；typecheck由D所有者完成，本交接任务未重跑旧域/A/B矩阵或UI单测。旧域/高度报告保留0055/62e原freeze，新8112/05f仅通过独立差异证据继承未变逻辑范围；C最终拓扑、actual D身体/承托和浏览器/美术仍待验。

解析后沿矩形界仅描述允许后平台**人物中心**的 actual D 脚底 F 与 nearest canonical line G 的高度差；它不是所有 rear-body 点均被 C `.36m` 胶囊覆盖的证明，也不是 actual C 网格承托的严格全域界。`.16m` 是公式依据加工程 reserve 的输入，不能表述为已保证 `.30m` 实际净距。
