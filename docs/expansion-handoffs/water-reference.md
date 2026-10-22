# B 水体参考重做

当前阶段：r4主瀑形态/出唇修正及证明归档已冻结；r5圣泉支流实现、规则和有限C采样已收口，等待D同版实体/实景回拍；自然出口修后两口覆盖和水面对土面定向复核通过，高档自然床仍有极小嵌土，待D冷启动实看（见末节）。旧失败证据完整保留。保留不等厚闭束/分叉、连片白水、总径向clamp与薄出唇局部弧线；未改善的impact造型实验已回退。分层双池轮换通过实际GL验证，默认r4闭束前1m通过同版C几何的保守全相位界。**工程收口，不等于03写实参考美术通过。** 不补偿旧灰岩的全局水色，不改D布局/锚点/构图/光照；D继续正式世界同版回拍。

已逐张查看 `03-waterfall-pool.png`（主参考）、01/02，并读 `docs/world3d-reference-direction.md`。重点为错位台阶、深潭暗青、前景透底浅水、局部灰白泡沫。概念图不作为场景背景。

## 所有权与入口

B 仅写 `src/world3d/reference/water*.{ts,html}`、`public/world3d/reference/water/**` 与本文。没有修改 hub/main、world3d/index/environment、共享 contracts/layout 或其他资产组文件。

`water.ts`：`createReferenceWater(options: ReferenceWaterLayerOptions): Promise<ReferenceWaterLayer>`，正式 detached 工厂，消费共享 layout 的 sea/pool/stream/waterfall；返回 root、空 colliders、落点 anchors、whenReady、setQuality/update/resize/beforeRender/setPuzzleState/dispose。新增 renderContext 已在样片传入；模块本身不需要保留 renderer/scene，真正捕获仍只走 frame.renderOffscreen。

`water-surface.ts`：`createWaterSurface({quality,center,size,outline,sunDirection,depthAt,...})` 返回 `group/update(time,delta)/beforeRender(frame)/resize(width,height)/setQuality/dispose/diagnostics`。group detached，无 renderer/scene 注入或保留。捕获唯一入口是 D 的 `frame.renderOffscreen`。

`water-falls.ts`：`createWaterfalls({quality,sunDirection,segments})` 返回 `group/impacts/stats/update/setQuality/dispose`。所有水片、水束、泡沫、飞沫为真实三维网格/粒子，无画面贴图替代。

共享 `ReferenceRenderFrame` / `ReferenceOffscreenPass` / `environmentKind` 已读并接入，入口缺口已关闭。D 必须先更新 scene/camera 世界矩阵，再调用 beforeRender。水没有读取 PMREM 为 samplerCube；环境贴图借用且不释放。

样片 `src/world3d/reference/water-preview.html` 仅 DEV 允许启动，拥有自己的诊断 renderer/RAF；`water-sample-environment.ts` 为临时诊断石台与真实水底，不是 C/D 最终岩壁。生产模块不依赖该样片。

## 光学实现与边界

- 中/高档：镜像相机+斜裁剪平面捕获真实场景反射；水下场景颜色+DepthTexture 捕获，按实际斜裁剪 VP 逆矩阵重建底部，用距离 Beer-Lambert 吸收、Fresnel 与扰动投影合成。属于平面反射+屏幕投影扰动折射，不是光线追踪或流体模拟。
- 低档：零额外 RT/场景 pass；真实水底主通道透明混合、地形深度采样、Fresnel 和解析天空近似反射。没有真实场景反射与折射捕获，必须明确此边界。
- 焦散为动态解析近似，不是光子模拟。岸边湿色需要真实岩岸/地形配合，样片已提供湿岩，最终由 C/D 材质承接。
- 预算以 D 的 frame 为准。medium 最多1额外pass/帧，目标长边≤512，反射/折射须交替；high 允许最多2通道和≤1024（仍受frame cap）。按画幅缩短短边，low 0目标。目标所有权与释放在水面内部。
- 全场只给视锥可能可见的 pool 申请捕获，开放 sea 保持天空近似。多池由 water.ts roundrobin 分配本帧资格，其他池保留最后成功捕获。成功矩阵与各自纹理绑定，首帧/被拒绝捕获不读取未初始化 target；该路径已实际及非UI验证。
- 两张目标都有效才启用完整光学合成；片元还统一检查最后成功捕获的 w/UV，缓存落在身后或投影越界时退透明解析路径，避免不透明色片与边缘拖影。长期停止捕获后的缓存只是一份旧视角近似，大幅移动不会等同于实时光学。
- D 拥有全局递归阻挡与全部渲染状态恢复。B 不调用 renderer.render/setRenderTarget、不注册 self-render onBeforeRender，不添加灯光/曝光/场景。借用灯光/环境资源不释放。

**已实测的 DPR 接入陷阱：** `renderer.setRenderTarget(target)` 已应用 target.viewport 的物理像素。之后再 `renderer.setViewport(0,0,target.width,target.height)` 会再次乘主 DPR，造成捕获裁放。样片删除了该次 setViewport，早期图片不作为最终光学对齐证明。D 的 host hook 请避免同类写法。

`water-streams.ts` 的窄渠道是固定 .6m 分段小网格，各档相同，无高档 LOD 缓存；近似透明光学，不申请离屏捕获。圣泉恢复前保留窄弱细流，恢复后扩宽/增流；海、大瀑布与主潭一直自然常流。它不判断谜题目标、不写存档。`water-shore.ts` 提供基于真实terrainHeight的窄湿地带；竖直岩壁湿度应由C岩材质配合。

## 首轮布局问题（历史，已由r4两级布局替换）

首轮共享 layout 主瀑三段 XZ 位移约11/13/13米，而落差约9/9/7.82米，几何会形成明显前倾水道。03近景主瀑更接近竖直落差、上段更短且向一侧错位。B严格遵循tier锚点没有擅改layout；最终应由D/C一起对齐崖唇、台阶、落点及中间连通水道，不能用岩体把水路填实。独立诊断样片不是共享世界构图验收。

## 首轮工程验证与证据（历史）

证据目录（本机绝对路径）：`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cba-2afb-7841-bff7-385c50f04529/water-reference/`。

- `06-final-front-high.png`、`07-final-side-high.png`、`08-final-near-high.png`：最终实际3D固定机位；`02-front-medium-single-pass.png`、`03-front-low.png`：同正面中低档。
- `09-final-water-motion.mp4` / `.webm`：最终实际canvas连续录制，约4.5秒、30FPS、1728×972；源运行time约2.4→6.908秒，无概念图合成。不是物理手机性能录像。
- `04-mobile-portrait-low.png` / `05-mobile-landscape-low.png`：390×844 / 844×390浏览器模拟，实际buffer312×675 / 675×312，0水RT。不是物理手机验证。
- `verification.json`：真实运行预算、逐帧捕获种类、首帧/拒绝/预算0恢复、双池公平、三次重建/取消、各机位数据。`optics-validation.json`：14项非UI逻辑验证及shaderErrors=[]。
- `10-cache-turn-away-medium.png`：同眼位转向+Z向下看、预算0，超出旧capture覆盖的水面走透明退化；仅边界测试，不是美术机位。

冻结的比较条件：正面 camera `[11,3.6,24]` target `[0,4.1,-4]` FOV52；侧面 `[-17,4.5,15]`→`[2,3.8,-4]` FOV52；近景 `[6.5,1.55,19]`→`[1,-.5,7]` FOV59。16:9，time2.4s，ACESFilmic、exposure.95、太阳方向约`[-.5584,.7479,.3590]`。这些是局部诊断机位，不替代D共享世界三机位。

所有pass计数：`renderer.info.autoReset=false`，每完整帧只reset一次，计入主通道、阴影、反射/折射和粒子四边形，诊断石台已按材质静态合批。

| 最终正面 | 绘制次数 | 三角形 | 水捕获pass/帧 | 水RT估算 |
| --- | ---: | ---: | ---: | ---: |
| low | 13 | 49,738 | 0 | 0 |
| medium 反射刷新帧 | 29 | 147,548 | 1 | 3.375MiB，双512×288 |
| high | 39 | 315,730 | 2 | 13.5MiB，双1024×576 |

表格是**局部样片含诊断石台**，不是完整世界预算。RT估算按HDR颜色+深度保守12字节/像素，不包含D阴影、驱动额外内存或其他组贴图。medium反射/折射帧几何量不同，表中记录较高的反射刷新帧。

正式工厂 low、高档各3轮重复dispose/restore：几何计数稳定13→5→13；high纹理7→4→7，low4→4→4（剩余是诊断场景资源）。先取消报AbortError，创建后立刻取消的root子项0且detached；重复dispose安全。借用environment不释放。

中档真实验证：首帧仅reflectionValid=true、refractionValid=false，保持analytic透明；第二帧两者有效才合成。拒绝折射并移动镜头时refractionFrame保持旧值，reflectionFrame可独立更新；预算0时两者成功帧和矩阵不动。双池单pass共7帧后两池各自两种目标均有效，无后池饥饿。512→256预算收缩会安全重建，异常只使对应尝试目标失效。

最终全仓 `npm run build -- --outDir /tmp/adonis-water-reference-20261021` 通过（含tsc，1109 modules，并产出water独立chunk）；B独立定向typecheck通过，实际样片运行无console/shader错误。中途A预览的TS18046已由并行组修复，B没有跨改。D已把模块接入构建，但B未代替D验证完整合成场景。没有新增UI单元测试、依赖或付费服务，没有写入output或tools/playtest.js，没有commit/push/deploy。

## 首轮视觉未通过项（后续切片见下文）

独立review对03与最终06/08的结论：主瀑仍有片状帘幕感，侧边与细线方向偏一致，聚束/翻折/局部厚重白水不足；泡沫已经从细线改成起伏局部网格，仍偏椭圆和平，喷溅高度和向外破碎度不够；浅水虽透底并有反射，仍偏平滑灰绿，水底焦散亮暗与细碎反光不足。需要结合C真实岩缝、D台阶/光照/深度再迭代，不宣称参考还原比例。

瀑布是可侧看的三维曲面/细管+透明度/Fresnel/解析太阳高光，**瀑布本体没有真正场景折射捕获**；真实平面反折射来自潭面。白沫为带约5–19cm起伏的局部程序网格；飞沫/局部雾为世界尺度GPU billboard。没有流体碰撞、真实体积散射、光线追踪折射或水下视角。

## 第二轮形态切片：r3实景后继续

依据：已读D的 `world3d-reference-integration.md`，查看 `waterfall-integration-r3.png` 并对照03主参考。旧C岩体、D坡面/台阶、锚点和整体光照不在B本轮修改范围；不访问或重启D的5182服务/标签。

目标：主瀑正面有2–3股不同厚度主束、中段分叉暗隙、侧面可见折叠厚度；落点白水有局部离面翻卷与上抛回落；3–5秒动态能追踪泡沫团从撞击区出生、向下游位移、破碎消散，不只是椭圆内噪声闪动。

本轮证据目录：`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cba-2afb-7841-bff7-385c50f04529/water-form-r2/`。已保留同一诊断样片的 `before-front/side/near.png`、`before-motion.webm` 与修改前falls两文件副本；后续固定相同相机、time2.4、曝光.95、太阳、质量/画幅比较。诊断石台只承载水体局部形态，不作为D/C最终合成或全局水色验证。

### r4上下文与分层双池调度修正

根随后提供 `world3d-water-layout-r4.json`（revision `v3-reference-r4-grove-terraces-scan`，导出source SHA `ac7186a91e8908b1d3318de1187a3087674fd3704e97f25378a151d372fed8ed`）。B已读回，两级新drop与三点台地水道由 `layout.ts` 唯一管理；圣泉新源 `[24.6,20.3,-22.8]` 直接消费，不私移锚点。当前形态对照图依旧是旧坐标诊断石台，**不是r4世界实景**；D的5182服务与标签未触碰。

新增 `water.grove-pool` 在y11.7，触发了一个定向复现：低处眼位 `[24,3.16,20]` 的视锥仍与高池包围球相交，高池虽然被水面内部的above-water判断拒绝，却先占了roundrobin资格，使低池接受通道序列为`1,0,1,0,1,0`。`water.ts`现在在挑选pool前加入与水面一致的眼位高度资格（eyeY>level+.015），不是移动或隐藏锚点。

修后低机位接受通道`1,1,1,1,1,1`；抬到y15后两池仍在6帧内分别反射/折射有效，保留全局中档1pass/512限制。`r4-scheduling-before.json` / `r4-scheduling-after.json`记录使用实际r4 layout的**纯调度probe，renderOffscreen为模拟成功回调，不是WebGL或性能证明**。工厂/光学API与光学两源码均未改。全仓typecheck通过。

随后通过开发样片的`verifyStackedPoolCaptures`真实复核：r4两池layout，仍借用旧诊断环境与host捕获钩子。低眼位连续7帧都恰1次真实捕获，反射/折射交替，低池两目标有效、高池未捕获；抬眼至15m后再7帧，两池各自两种目标均有效。成功捕获尺寸均512×288，console警告/错误为空。完整`r4-stacked-pool-real-webgl.json`保留实际逐帧序列；这升级了GL捕获分配证据，不代表C/D完整合成、画面自然度或设备性能通过。未尝试过的高池目标仍可能显示初始预设尺寸，它在首次eligible捕获前按frame cap重建，不能把未捕获目标诊断当一次超预算成功渲染。

只读审查发现开发验证入口的销毁竞态，已补active controller与隐藏main清理、每await后取消检查，以及disposed后不恢复场景/resize的保护。实际启动probe后下一RAF销毁，结果为AbortError，记录到的16个geometry与17个material均只dispose一次，见`stacked-probe-dispose-race.json`。该调试入口不进入正式世界UI。

### 三轮形态对照与当前视觉边界

`round1-front/side/near.png` 将细帘改为不等宽闭合主束、中股分叉和真正离面的白水壳。第二轮扩大径向形变后出现串珠状玻璃囊，已否决，`round2-*`仅保留返工证据。第三轮按局部半径限制主束形变，使用整周谐波避免闭束接缝张裂，恢复连续水核；`round3-front/side/near.png`和`round3-motion.mp4/.webm`保留同机位实际帧与约4.5秒连续canvas运动，不是r4世界合成。

独立静帧复核确认第二轮明显大玻璃囊基本消退、分叉/侧向厚度仍在，但仍不通过03参考：主束仍偏透明绸带，零散白片未形成疏密不一的连片卷气水；落点白水虽离面，仍读成横向薄卷边，缺撞击核前后厚度。不能把工程或这次局部改善写成写实美术验收。动画采样和下一次有限材质调整仍在复核。

定向非UI数据检查 `structural-round3.json`：low/medium/high/low切换，有限值、索引、uniform时间均通过，输入锚点最大误差0，4次生成的32个自有geometry/material各释放一次，重复dispose安全、传入父组的无关子项保留。它是数据/资源验证，不是UI单元测试。

### r4岩唇与真实水束包络复核

D的同版线性探针和源hash见 `world3d-cascade-r4-seams.md`；layout当前SHA为`662e5173f90750d72131a80a4de3596ba797f25342caedfb060d31817600971d`。下级tier在线性t=.05处中心`[34.399991,9.438148,-10.679485]`，实际C前岩面Z约`-10.363936`，前向净空`-.31555m`；该结果只证明线性水廊冲突，不能直接当作所有相位的实际水束结论。

B在同版falls `f94c1a40…`、shader `f4a9b05d…`解析实际三股初始曲线及截面：下落.5m时中心只比直线前出`.105–.154m`，截面半深约`.365–.555m`，加入当时swell+flutter总动态保守界后，后缘Z仍可到约`-11.157/-11.036/-11.036`。因此不能以弯曲中心线或正确端点证明已清除岩唇。解析报告按中心对应的ring取界，不是同Y平面的精确交线，也不含C碰撞，明确保留此边界。

独立实现另对实际high发出顶点复现shader、采360个相位覆盖0–19.7s，前1m闭束相对直线的front范围约`[-.544,+.958]m`，还须把舌片、运动白片与真实C网格一起检查。两个报告为本目录 `adonis-water-lip-envelope-r3.json`、`adonis-falls-envelope-audit.json`。B端点、预算与layout均未改变；根已安排C局部岩唇/水槽修正，B等C同版几何后定向复核，避免双方移动端点相互抵消。不增加泡沫遮挡穿模。

C首轮修唇后，B已对冻结快照进行实际mesh与48个动态相位的CPU vertex-shader复现。C为`fc87710d…`，B几何`f94c1a40…`；冻结shader`c36893ee…`与随后fragment微调`67215715…`顶点段相同。C的原直线lower t=.05已变为前向正净空约`.234m`，但真实厚水瓣仍不清：lower high闭束实发vertex`[32.820461,9.474425,-11.238098]`、time4.989179、沿tier投影descent .304152m，实际Y下降`.450994m`，在C体内最近深度约`.279038m`；该组合前1m有2832次“水三角面×采样相位”与实际C三角面相交。它是实际发出网格的离散时间几何交叉，不是像素测量，也不是穷尽连续时间的认证。

同版lower舌片与运动白片均未发现内埋/面交，最小净距约`.152/.0817m`；upper顶部闭束也因截面倾斜存在约`.087m`内埋。该问题是左股闭束后侧局部内埋，不表示整束被吞没。问题集中在闭束初始厚截面，B正保持端点压薄出唇并做局部前出弧线，不能把C的线性正净空升级为整个水体通过。根已协调C先保留同版作对照。详细`r4-water-rock-before.json`、`r4-collision-before-snapshot/`含源/manifest/bin快照，后续只作同版定向复核。

### 局部出唇修正与修后采样结果

近竖直（horizontalLength/height≤.5）才应用修正：保持top/bottom和lane，采用归一化重力travel构造局部forward lead，额外前出绝不超过`.5m`，在离唇`.75–1.8m`平滑退回原曲线；closed半深由lip处≤`.045m`按`.05–1.35m`平滑恢复原值，之后原有侧向折叠与分叉保留。F径向振幅根据实际变薄后的半径重算，总swell+flutter被clamp至±F。没有移动layout、岩体或用白沫遮挡。

舌片共享lobeCenter的新lead。运动白片按每个实际下降位置计算lead差分，`aLip`存topY/forwardTravel/frontXZ：出生时加对应actualV的lead，GPU在cycle²下落后再按当前p.y求差分，避免只在出生点弯一次、随后又沿原直线穿回岩体。

冻结修正版B `793b4367…` / shader `f4c8e31d…`复用同一个fc877 C BVH：low/medium/high、两级、前1m的四个世界Y分段中，closed/veil/white packet在48个不等间隔相位均为0内部顶点、0连续三角面相交。high闭束已采顶点最小净距：上级`.203933m`、下级`.222466m`。`r4-water-rock-after-sampled.json`与`r4-collision-after-B/`保留版本与CPU/GPU公式对应；这是离散时间几何采样，仍不冒充全相位或D真实合成像素验收。

### 本轮视觉选择与未通过项

`round4-front/side/near.png`与`round4-motion.mp4`为连片卷气白水材质与总径向clamp后的诊断样片，独立复核建议保留小幅改善：水核连续、白片更连贯，仍偏透明绸带。

另一次impact-only尝试将三片重排为前高/后低翻卷脊与低接触核，`round5-*`保留实际静帧/连续录像。实际front/near却更像贴水白斑，side未读出前后体量，独立复核不建议保留；因此**该impact-only实验回退**，不因已投入实现便把差异写成改善。出唇修正、白片actualV lead、F clamp与连片白水材质保留。最终诊断帧将单列，round5不是最终造型。

代码末尾另补显式`segment.depth`兼容：成熟lobe深度相对`.16`缩放，near-vertical lip仍有独立完整厚度≤`.09m` cap。undefined/显式.16默认路径三档geometry attributes/index与已验证793版逐字相同，见`depth-default-equivalence.json`；D当前未传depth。显式.08/.32确实改变几何，不再忽略此参数。自定义depth不在本次r4默认水路净空认证范围。

### 最终冻结与验证边界

最终源码：`water-falls.ts` SHA `674856dc7b18d3da1dec7b0af47b9b6ef592199cd6722753810fd652789bd490`；`water-falls-shaders.ts` SHA `e11fdbc56049e7f697d1bbf2b39c77173ff5437e60be087c4e284e0a0a53a8dd`；`water.ts` SHA `ef039b45027a6e4d8fcc4329db82d289f87f88f441df45a187ea82525080b238`。相对本轮baseline只改这三份生产模块及开发样片`water-preview.ts`，光学两源码、stream、shore与诊断环境均未改。

`r4-closed-allphase-bound.json`给闭束更强的充分界：每顶点总位移≤`FE*sqrt(dot(n,n)+.34²+.68*abs(n.y))`，含径向与额外Y的交叉项；实际静态三角形到C真三角面的最小距离，必须严格大于该面三个顶点的最大位移界+1e-6，且静态在实体外。按正式档位映射（B low→C low，B medium/high→C high），可能进入世界Y前1m的2330个真实闭束三角形全部通过，最大位移界≤`.102558m`，最小保守净余量`.176374m`。该结论覆盖closed任意相位；**不延伸为水舌/白片全时间认证**，后两类仍只报告48相位零交。

最终674/e11与已验证793/f4c的falling-water mesh全部属性、索引和两段shader，在三档、默认depth与显式.16共6组均逐字一致；`final-falling-equivalence.json`保留映射。`final-compatibility.json`另22/22通过，确认depth兼容与impact精确回退。当前layout全文件已变为`d0de7852…`，但两级tier、cascade placement/transform与证明版662逐项相同，见`layout-geometry-equivalence.json`；C两份代码和四个bin与冻结版逐字相同，manifest仅sampleExperiment说明变更，运行时消费的version/assets相同，见`c-geometry-inputs-readback.json`。这允许沿用同版几何结论，不需为无关桥/说明改动重跑整套。

最终实际证据为`final-front/side/near.png`和`final-motion.mp4/.webm`（time2.4→6.901，约4.5秒）。**这些仍是旧坐标诊断样片，不是r4整合画面。** round2为已否决玻璃囊，round5为已回退impact白斑实验，不能当最终版本。

实际完整帧预算：high 39draw / 301234tri / 2捕获；medium反射29draw /144956tri，折射27draw /144812tri，每帧1捕获；low13draw /50010tri /0捕获。含旧诊断石台/地面/阴影，非完整世界或真机性能。`structural-final.json`再次确认三档循环有限值/索引/时间/锚点不变，32个自有资源各释放一次，父组无关子项保留。实际console warn/error为空。最终`build-final.log`为全仓tsc+Vite1122模块通过，保留既有>2000kB chunk警告；未新增UI单元测试、依赖、提交、推送或部署。

交接状态：本轮实现与定向工程验证已冻结，D需用上述最终水源码与同版C接回5182真实合成，重新查看源头、首1m、落点和整景。主束透明绸带感、落点翻卷厚度及清晰外散追踪仍未通过03参考；不以几何净空/构建通过代替美术验收。完整索引为本目录`final-evidence-manifest.json`。


### 2026-10-21 证明重放留存补齐

根独立审查后，仅补冻结证据归档，没有修改水模块、重跑采相位或原完整矩阵。原证明脚本引用的自包含bundle与两个辅助脚本，连同原证明脚本四份原件，已逐字存入本证据目录`proof-replay/originals/`。

[重放说明](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cba-2afb-7841-bff7-385c50f04529/water-form-r2/proof-replay/README.md)给出确切命令、四原件SHA与Node/Three/TypeScript版本。`closed-bound.mjs`以归档相对路径读取既有layout/B源码/C BVH，重放输出单独写入`proof-replay/replay-output/`；数值距离函数、充分界定义及数值循环与原件的逐块SHA完全相同。辅助脚本只作为文本提取函数，不执行其原矩阵。

本次31个归档文件SHA校验通过，入口与检查脚本语法通过；在显式拒绝读取/tmp与/private/tmp的预检查中，布局、C/B源码哈希及两份BVH都匹配。仅做依赖/完整性检查，未重新执行数值循环，详见`archive-preflight.log`与`archive-checksums.log`。三份外部运行库文件SHA另被固定；九份水源码对最终冻结清单均未变。`final-evidence-manifest.json`追加proofReplayArchive索引。

原结论仍为默认两级闭束前1m的浮点几何全相位充分界，非形式化精确证明；不扩大到自定义depth、舌片/白片全相位、其他岩体或实际GL视觉。水模块继续冻结，等D同版场景图后再决定下一视觉切片。


## r5 圣泉支流独立切片（工程冻结，等待同版回拍）

已读`world3d-r5-landform-plan.md`和`world3d-r5-landform-contacts.json`的sacredWaterProposal。随后D已让`layout.ts`消费`landform-layout.ts`中的REFERENCE_SACRED_WATER/REFERENCE_GROVE_POOL；B运行时仍只消费传入layout，没有复制JSON为另一运行数据源，也不改共享layout或创建台座、盆、渠槽、石嘴/地形。

证据根目录单列为`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cba-2afb-7841-bff7-385c50f04529/water-spring-r5/`。其中authority-layout-snapshot.mjs/authority-water-snapshot.json只是对D权威来源的冻结证据，用于有限检查，非runtime输入替代物。首次稳定快照revision为v3-reference-r5-grounded-terraces，layout SHA be724760…、landform SHA 0c2d117f…；正式ID为water.sacred-source-drop、water.sacred-pool-drop、water.sacred-spring、water.sacred-rill，另有D定义的controlled water.sacred-basin。

随后D调整阶梯接点，landform全文件SHA已变为`57055d172650de58ea77e3ad342691c19b3374bac3e7e1a04fecd62bb0b33725`，layout仍为be724760…。`authority-current-readback.json`逐项核对5个controlled water、grove-pool、主瀑、cascadeTransform与revision，9/9消费值与首次冻结快照完全一致，读取前后源码hash稳定；不因无关阶梯改动重跑水路矩阵。

此9项等价只对应该次回读的指定消费范围。根随后通知D将绕开旧海岸接近路坡脚调整海线、增加低岸普通泄流接点；端点尚未发布，本包不猜坐标，也不把既有圣泉/主瀑结果扩到这些新增水段。待D权威发布后再单列其受影响输入、调度与有限贴合范围；固定C主瀑和主潭不动。

B最小改动：

- 两个新受控fall按各自tier水平top→bottom取forward，widthDirection取与它正交的水平向量；只作用controlled，天然主瀑仍使用原默认方向与参数。
- 上落水`water.sacred-source-drop`使用既有`foam:false`，只关闭该段impact-froth、落点spray和mist，保留closed/veil/white、falling drops及盆面impact扰动；下落水仍保留原落点效果。原因是独立CPU复现发现上盆外可见强度很高的漂流泡沫样本，详见后续有限检查记录；不是用此参数遮盖主落水穿岩。
- controlled sourceReach/rill不再创建B的下沉薄渠床，消费D实际承载；natural stream原水面/床保持。纯controlled流不分配闲置床材质，已保留原弱流.22→恢复1→弱流.22语义。
- 两个controlled fall及接水盆初始隐藏、恢复显示；池面controlled落点扰动的strength同步0→恢复值→0，避免瀑布关闭后圣林池仍显示它的落水扰动。天然impact值不变，水面shader/光学公式与全帧捕获预算路径未改。

主瀑water-falls.ts 674856dc与shader e11fdbc保持逐字冻结。新受控流依旧使用现有参数化水束/泡沫/飞沫实现，其最小泡沫与飞沫尺度未因水宽.3而自动缩小；不能沿用主瀑fc877认证，也不能把D候选静态±.05m净空升级为新B动态通过。

受控溪流独立非UI规则31/31通过，自然几何/shader/材质字节保持、零controlled床资源、弱流/恢复/重复dispose通过。新三份水模块独立类型检查通过；首次全仓typecheck读到D正拆分阶梯ID时的composition.ts旧sanctuary.steps引用7错，B未跨改。D后续接线更新后，全仓`npm run typecheck`已通过。

最终工厂规则与资源检查128/128通过（包含原113项），见证据目录`factory-rule-report.json`和`README-factory-rules.md`：两受控瀑布与小盆在未恢复→恢复→未恢复之间隐藏/显示/隐藏，溪流保留弱流/恢复；圣林池受控impact同步0→恢复强度→0，天然impact保持原值，切档保留开关状态。upper明确foam:false、lower仍默认foam；含切档重建的220个当前工厂资源均只释放一次，借用environment未释放；high天然主瀑四个mesh的属性、索引、instance数据和shader与冻结baseline逐字一致。采用D实际capture guard的mock检查确认，即使请求frame cap999，low/medium/high仍最多0/1/2次捕获；它不是GL渲染、shader编译、性能或视觉验收。脚本、bundle、源码快照和SHA在同目录归档，无/tmp依赖；最终依赖SHA闭包56项，旧8a报告/manifest/完整重放包另存`factory-before-upper-foam-off/`。新增接水盆参与原池面轮换，无独立预算。

初次工厂113项对应上盆仍开启foam的water.ts `8a4ef7cf…`。上盆参数修正后当前water.ts SHA为`d4002e17405135624d1504ef9533b91f0a7925e62f8fa4b6c98669c812d9c235`；water-surface.ts为`2b7d127c518fe540428a05ade81609750cab841f2d0afe70a54f6b4d48fd4466`、water-streams.ts为`82b1650538470f2e4a5448317dae52811190a94a5e6b2d888bcca1b4ce554837`。新支流有限动态记录分别保留修前候选与修后产物等价证据，不用主瀑旧认证替代。

`sacred-branch-postcheck-results.json`在low/medium/high确认：上段foam/mist不再发出，保留粒子均为falling，字节与修前对应prefix相同；上段及两段合批的完整fall mesh所有属性/索引和VS/FS逐字一致，下段foam/mist全部实例及spray后缀逐字相同。因此只移除上盆落点家族，不改变主落水体或下段随机产物；没有因此重跑C/相位矩阵。

修前候选的上落点foam在low/medium存在内部顶点/三角面交；另有实际三角面重心样本在盆外`2.02745m`、水面上`.05504m`，CPU alpha约`.41809`，time`2.209972035`。这不是只在快消散边缘外逸；JS double的噪声/alpha复现仍不等于GPU可见像素一致。三档近水位CPU-alpha外逸样本下界约`2.565/3.101/2.931m`，且候选medium/high雾的相机无关球壳存在潜在C重叠。这些上盆落点产物已被foam:false移除；候选high零面交不能覆盖low/medium的交叉问题。

新支流有限检查现已完成，见`sacred-branch-audit-results.json`、`README-sacred-branch-audit.md`。low对C low、medium/high对C high，两落水共6组，0–10.610041s的48个确定时刻，closed/veil/white实际发出网格的连续三角面均0交、内部顶点0；最差面净距`.367657m`（upper白片）。保留下落滴水的相机无关quad球壳最小净余量`.238187m`。lower保留foam在三档均0面交，最小面距`1.675452m`，其spray/mist球壳净余量均为正。无床sourceReach/rill的完整静态网格在C两档也零交，rill最小面距`.362839m`；+.025Y和全部折点均保留。

这些是浮点CPU复现的有限相位、实际面距离和保守粒子球壳结果，不是全时间证明、GPU像素一致或视觉通过；没有覆盖D新台座、盆壁、渠槽、地形和其他C岩体。报告的整段fallBounds以impact为原点，不能将其中整段落差误读为偏离沿线静态±.05m管廊的局部动态量。候选/最终wrapper分别冻结8a/d400，依靠三档产物逐字等价转移保留主水体的有限几何结果，没有重跑旧主瀑矩阵。审计依赖已存本目录，无/tmp输入；重放仍依赖原workspace的Three/esbuild安装，版本与入口SHA见`sacred-branch-runtime.json`，不声称完全脱离workspace重放。

D的`spring-carrier.ts`已接入composition的当前C model承载重建路径；仍需真实运行读取`springCarrier: created`与该工厂contact/details，再作同版回拍。该模块明确不实现Y20.3高源头的泉龛立面/出水口，不能因Y18台座源码存在便声称高源头已有承托。当前源码接线与冻结数据不是浏览器r5或贴合验收；新盆壁/渠槽/台座/地形与B实际动态包络仍待D同版检查。source首点、[21.5,16.6,-20]折点和末端约1.08m石嘴完整消费，B不移锚、不加厚床遮悬空。

最终upper foam关闭后的源码已通过全仓`npm run build -- --outDir /tmp/adonis-water-spring-r5-build`（含tsc，1130 modules），仅既有>2000kB chunk警告，日志`build-final.log`/版本`build-result.json`。没有新增UI单元测试、依赖，未写tools/playtest.js或output，未提交、推送或部署。

## r5 海线与自然出口增量（旧冻结版失败，修后见下节）

D已发布`world3d-water-layout-r5.json`，layout SHA`0bb9a4c61a762a014e13c9c736224d5fc8bab4e7957fcd66bb329e7f146cf4ae`、landform SHA`6ce738d058956ea65667539956a9b21b7dcdff8428c72fb549ea435cc63ff683`。运行来源仍为layout导入的REFERENCE_SHORE_APPROACH；该JSON和B保存的bundle只作证据，不复制为另一运行权威。

新海面outline绕开海岸路的宽坡脚。自然`water.outlet`由旧宽3m斜向水段改为宽2.4m、`[16,.18,18]→[13,.1,18]→[10,0,18]`，并在`[13,2.6,18]`、yawπ/2复用冻结桥跨。它保持controlledBySpring=false：保留B自然床和uFlow=1，不随圣泉谜题隐藏或弱流；B不能把圣泉受控无床策略套到这里。D另有物理channelBedY=-.4，与B的薄床网格不是同一层。

独立证据目录为`water-shore-outlet-r5/`（与water-spring-r5同级）。定向回读全部water差异、实际sea三角剖分、自然出口开关/床体/资源、潭口/海口实际宽横断面与D terrain/桥下承载。旧主瀑/圣泉只在实际消费值相等时保留原证据，不重跑旧完整规则或相位矩阵。当前没有新出口GL、实体贴合、视觉或真机通过声明。

定向工厂报告`shore-outlet-report.json`保留104/105：104项消费值/自然流状态/资源/预算检查通过，1项为发布SHA与当前源码不一致。初读后layout已变为`eba5136bbbb93274ec030dbc7bdb9f142c64c6a09aea9f6e34696e102ff2b3ab`，正式冻结前后稳定；landform仍为6ce738d0。B没有修改共享layout，也不推测漂移原因。实际bundle对D发布JSON的water/transform/bridge/spring/shoreApproach消费数值全部精确相等；不能据此把当前源称作0bb的同一文件版本。

与已完成圣泉包逐water ID回读，只有water.sea和water.outlet消费值改变，其余9个水体及主瀑transform不变；旧圣泉/固定C主瀑的原限定范围证据可保留，新海面/出口不继承它们的几何或GL结果。新出口在三档false→true→false均保持uFlow=1和自然channel-bed，床体/水面没有被controlled策略误删或停流；本次88个当前资源各释放一次、借用environment未释放。海面capture=false，stream不创建捕获目标，仍使用D原0/1/2 guard。24项SHA依赖清单、源码、bundle和脚本已同目录归档；本轮未改B生产源码、未重跑旧128完整规则或主瀑/圣泉相位矩阵。

实际生成网格的有限CPU几何结果见`geo-results.json`：

[两口俯视几何示意](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cba-2afb-7841-bff7-385c50f04529/water-shore-outlet-r5/mouth-topview.svg)使用冻结outline与实际工厂BufferGeometry，标出端截面及近端30cm片区；只是CPU投影图，不是GL回拍。

| 接点 | 实际横断面 | 水面投影覆盖 | 近端30cm投影重叠 |
| --- | --- | --- | --- |
| 潭口 | X16、Y.205、Z16.8479996..19.1520004，宽2.304m | 仅Z18单点，覆盖0% | 0 |
| 海口 | X10、Y.025、Z16.7991657..19.2008343，宽2.401669m | 仅Z18..19.2008343，覆盖50% | .05546168/.72050056m²，约7.697659% |

潭口中心落在主潭outline角点`[16,.18,18]`；海口中心落在海outline角点`[10,0,18]`。中心点相接不能证明整个2.4m渠口连通，两个端点水面还各比对应静水面高.025m。B不擅改主潭冻结轮廓或D权威端点；D需让出口两端的实际全宽与潭/海有足够重叠，再回读新输入。不抬水或增加水片遮盖土体。

本次冻结composition `508f26fb…`版本的高档D地面实际三角面在潭口正Z侧`[16,.205,19.1520004]`的高度为`.2354085`，局部埋水`.0304085m`；埋水投影面积仅`.0014483m²`、约占出口面`.010277%`，不是整段河流被埋。low同点仍有`.0277926m`净空。自然床在high最深埋入地面约`.1904085m`；床体嵌入与水面遮挡分别记录，不据此删除自然床。这是该冻结版网格LOD/接头范围内的实际面问题，不能用解析terrain中心线净空代替。检查后composition文件已继续变化为`78403d34…`；即便terrain函数前缀与PlaneGeometry配方回读相同，也不将该埋水结果自动称作后续D版本或GL画面结论。完整hash/readback在`geo-results.json`。B保留自然床，未套用圣泉controlled无床策略。

复用桥的真实实体三角面与实际出口水/床网格检查：low/high每档各检查96个水三角面和96个床三角面，均零面交；两档水的最小面距均约`1.110557m`、床均约`1.136007m`。这里是无符号面距与零面交，不扩大为闭合solid内部认证；也不是GL画面、其他岩体或全场景验收。新海面剖分/有限值和完整几何方法、冻结输入/工具依赖另见本目录`geo-README.md`。结论仍为冻结版出口两端接缝及高档土体未通过，不能因自然流规则/桥下零交声称新出口完成。

新海面实际非索引三角网格在low/medium/high分别为3763/8109/11799面，全部有限值、非零面积、+Y绕序；投影面积约30914.5m²，与轮廓面积的相对误差均低于3e-9。出口水/床各65顶点、288个有效索引、96面，无坐标/索引退化。这些数据完整性检查没有升级为海岸颜色、浪面或GL通过。

根已读本次几何报告并转交D修正。后续等D发布明确修后权威接点，只定向复查两口完整横断面、近口重叠段与局部实际地形；不改D坐标，不抬水遮盖，不重跑已经通过的自然流/资源/预算或主瀑旧矩阵。

### 修后点定向复核（有限CPU检查完成，待D实看）

D修后JSON将自然出口改为`[17.8,.18,16.5]→[13,.10,18]→[8.8,0,19.6]`，宽2.4、controlledBySpring=false；水位不抬。其声明版本为layout eba5136b/landform d723478e。B首读实际源已为layout `d2448e11463af742773d7691d52fa123133d719ccb413ca4d82987605c90a24a`、landform `e6714720f5c68e6e9ea34b66ac6120d696063fe4e72fcafe23b703e25f827cf3`、composition `f7945964dc9f316c6673f889eedf37af97a7ed9f95b0fb2438adb398913cfab5`，不能冒称同一文件版本。

新证据单列`water-shore-outlet-r5/fix-01/`，旧失败不覆盖。只查实际工厂两口完整断面与沿当前tangent的近口.3m片区，不能把旧world-X的.3m切片当作新斜水道沿流长度；再对局部low/high实际地形网格及斜向桥孔作有限几何检查。圣泉/主瀑相位、旧完整工厂/资源/预算不重跑。运行输入前后稳定性及对发布JSON的消费值等价另列，保留任何额外资产变化。B生产代码不改。

`fix-01/authority-readback.json`确认sourceStable=true。实际全部water、主瀑transform、两桥、shoreApproach与修后JSON逐值精确相等；相对旧失败输入，只有water.outlet改变，其余10个water（含海面、主潭、主瀑及圣泉）稳定。B四份被比对源码与D guard hash未变，不再重跑其开关/资源/预算矩阵。

来源差异继续保留：layout与landform实际hash均不同JSON声明；另外当前layout消费REFERENCE_SPRING_SHRINE.placement，使grove.spring变为position`[23,18,-25]`、yaw`.39922076957525304`、size`[1.72,2.8,3.473110997362451]`，JSON仍是旧placement。本轮不检查新泉龛实体，不声称JSON所有字段等价；这项额外资产改动不混入出口修后通过结论。authority脚本、bundle、三份源快照与SHA清单单独归档。

修后结果来自该目录`geo-results.json`，两口完整实际断面与近口带在low/medium/high均100%投影覆盖：

| 接点 | 旧完整断面 / 近口带覆盖 | 修后完整断面 | 修后沿水平tangent .3m片区重叠面积 |
| --- | --- | --- | --- |
| 潭口 | 0% / 0% | 100% | .6912000648 / .6912000648m²，100% |
| 海口 | 50% / 约7.697659% | 100% | .6730006557 / .6730006557m²，100% |

每口用实际水平单位tangent建立正交(S,Q)坐标；完整断面取surface真实三角面与S=0的区间并集，限制在实际首/末row宽度内，片区面积分母/分子都按同一局部基裁剪实际网格。另将3D中心线.3m换算为水平带长`.29996205/.29992577m`，两口也100%。没有把旧world-X切片错误沿用于斜水路，没有按中心线/稀疏点采样替代面积覆盖。

修后实际low/high地面三角网格与水面的136个三角面均0交、埋水面积0；最小垂直净空分别`.33053286/.23911859m`。地形极值由水/床面与地面面在XZ裁交后的多边形上计算线性高度差，并裁出负值面积，不是仅测顶点/中心线。low自然床也0交/0埋；high自然床保留8对三角面相交（涉及2个床三角面），最大嵌入`.00223895m`、投影面积`.00256314m²`，约占出口面`.0118199%`。该床体残余与水面零交分别记录，未删除自然床、抬水或改生产代码。

角度变化后的桥下重查只跑新出口：low/high的水/床实际三角面均零面交，跨两档最小无符号面距分别`.62895157/.67943324m`；不扩为实体内部认证或GL画面通过。

土面使用冻结d244/e671/f794闭包，14项输入立即读回稳定。f794的PlaneGeometry分辨率、旋转/平移及Float32 XZ→referenceTerrainHeight→Float32 Y生成配方另作源对照；配方与旧版本相同，实际高度消费新闭包，并非沿用旧Y数据。独立route/support/carrier对象、其他岩体及新泉龛不在本次土面清空范围，仍待D冷启动看完整合成。

独立只读算法复核未发现must-fix，见`authority-review-note.md`；没有重新执行数值矩阵。修后保留新源快照、脚本、bundle、数值报告和依赖说明，旧0/50%及508f26fb埋水报告不覆盖。交D的结论为这份冻结版的两口投影连接/水面对土面有限几何检查通过，高档自然床极小嵌土单列；不是GL、浪面/透明合成、完整场景或真机验收。

## natural water.outlet 光学切片（首轮与独立诊断，后续候选见下节）

根实看r5 `outlet-near-pool-medium.png`后指出：溪道下部读成不透明绿色玻璃板，矩形口边与透明蓝绿主潭的反光/波纹明显分离。本轮已重看该原图及03主参考；只处理普通出口材质/光学与已有重叠区淡出，不改变D布局、端点、水位、宽度、任何发出几何或原自然实体床，不改A/C资产、圣泉支流、falls674/e11或主潭两份光学源码。不新增离屏捕获、贴图、依赖或付费素材，不提交推送，不写UI单元测试。

证据独立为`water-outlet-optics-r1/`，旧fix-01几何证据不覆盖。`baseline-water-source/`保存原7份水源码及SHA。首轮仅新增`water-streams-optics.ts`，`water-streams.ts`在`id==='water.outlet' && !controlledBySpring`时选择它；`water.ts`仅传共同sky颜色和实际pool/sea outline。

方案为capture-free analytic材质：world-space三带noise及导数使用与潭面相同频率/时间尺度，光色、Fresnel、吸收参数按线性光空间与潭面analytic分支对齐；按实际潭/海轮廓的有符号距离，在既有重叠区渐隐出口水面，显露原水面，保留全水道geometry和自然床。未借用主潭RT，未改captureExclusions，避免引入反馈或用.18m主潭反射平面覆盖整条下降溪道。它不提供真实岩壁倒影或场景深度折射；正式主潭原捕获光学保持原样。

首轮定向tsc通过。`check-report.json`为96/96 CPU检查：4溪流的6个水/床mesh全部attributes/index与baseline逐字相同，2自然床材质不变，其他3条水流shader/全部uniform状态相同；自然outlet false→true→false仍uFlow1、时间更新有效，controlled同名流不会误用该分支。isolated streams无RT；baseline/current受测low→medium片段各37个累计资源均dispose1，借用environment不释放，mock捕获/排除列表保持原路径。未实例化falls，不重复主瀑/圣泉矩阵。surface两源及674/e11哈希仍冻结；该CPU报告不声称新GLSL已真实编译。

首轮源码SHA：helper `6886cd8f43aa63f175fcbb2cd24aa8eeabd310e03a48715e691050c9133461da`、streams `bd2e7f27f6691ca9eae0e19767ecdfe295955ba3d97f58a31fa6e6922b290e62`、water `a27791677ed8d44c9c939c1fb099cbf97c48b623ae56a0b6b5a73a01243de74f`。检查脚本/bundle/快照与29项SHA单独归档，若视觉继续调参会另记最终版本。

独立预览入口为`water-outlet-preview.html/ts`，另用5211无HMR/watch独立缓存，不访问或重启D5182。使用冻结当前D实际土面/PBR与A实际桥/PBR、原water factory及render-context，baseline/current只换water层。池/海材质与原参数不为样片调色；远处fall tier保留供原pool impacts计算，但fall mesh隐藏。缺少C崖壁/岩床/树木/其他整景资产，不能冒充D e671正式现场。照明固定ACES1.05、sun normalize[-.68,.48,.40]、原sky与环境权重。

原近口照片没有完整yaw/pitch读回；独立near固定eye`[13.77,4.32,18.02]`→target`[20,.18,16.4]`、FOV60（只眼位来自历史，target为新定义，不能称精确重放）；bridge`[9.4,1.8,22.7]`→`[13,.7,18]`；sea`[6.6,1.75,23.4]`→`[10,.05,19.35]`。before/after同源、同pose、time2.4，low/medium实际GL三机位与短动态仍待保存/复核，不是手机真机验证。当前未宣称视觉通过。


### 出口光学候选2：共享当前水底 PBR（工程交付，待根美术复核）

本轮先完成真实GL分层：`104541173Z`为688解析材质/排序2.1的正常帧，`104547039Z`只隐藏出口水面仍有绿色平板与大弧线，`104555647Z`只隐藏床后板状区域消失。DOM读回真实material为ReferenceNaturalOutletWater、fragment SHA `053120d76500ea7602f69f92e0e6bf32a5db059215a2d4575db9ece7bb4d0950`，不是只确认磁盘文件存在。大弧线来自主潭焦散照在光滑床上；未关闭或重调主潭焦散。

根随后明确授权仅outlet床外观调整、实体/深度/边界仍冻结。中间7bbb矿物噪声/alphaHash候选去掉旧绿板，却产生近口蓝灰补丁和明显散点边带，静态复核判为尚未衔接完成；该候选的26项CPU、源码与8段录像仍保留在`final-check/`及evidence，不能冒充最终候选。最终已完全去掉这些噪声、bump和alphaHash。

当前生产冻结为helper `19736e45a0c85f411a8f0548f4b91d75b26719176eb8c6fff00671d78fb1c1a2`、streams `3dda12d1b1717511699b2bd690f6958339bfe063ed9576088554848e7787b4ed`、water wrapper `6ca69e11e2f20b7b7b4b621ed8921e039d4deffda9cbbe2abd092cb3ebda75bb`。主潭surface两源、falls674/e11、shore及原自然床网格继续冻结，其他流/床默认材质不改。

最终策略：outlet水面仍是首轮capture-free world-noise解析材质，淡出既有潭/海重叠区，显式renderOrder2.1；只将outlet水面加入已有captureExclusions，实际床仍参与捕获，防止主潭再次捕获一层溪流水色。outlet床自有独立MeshStandardMaterial，复用当前frame.scene中精确材质名`D / physical limestone soil`的map/normalMap/roughnessMap；vertex shader以worldXZ/3和各贴图原Transform覆盖采样UV，不改原geometry任何attribute/index。保持vertexColors=false，局部底色#dad1af及world tint与该段D石灰岩水底一致。没有新贴图加载、RT、相机、pass、依赖或素材。

借用同步发生于water.beforeRender开头、pool筛选/预算/捕获之前，low0预算也运行。每帧读取实际已提交的D场景实体；失败的未提交候选不被借用，原子替换后转新图，donor卸载则清空旧引用。B不修改/clone/dispose借用map、material或bitmap，只拥有并释放自己的床材质；只在map presence/normal类型定义变化时needsUpdate。当前以精确材质名形成局部集成约定，若D后续改名会显式回退，不能继续保留失效图。本轮没有改D文件/正式contracts；可选最小正式取材接口及约束已写README-delivery，交根决定后续接线。

最终新增路径定向CPU `shared-soil-check/report.json` 24/24：low预算0同步A；未提交F失败并dispose/close后仍绑定实际A；提交B并释放A后，renderOffscreen回调先读到B同一三图；B卸载并关闭bitmap后low也清空；donor返回可恢复；wrong-name/wrong-type/构造scene干扰不被借用；所有借用图配置不变、clone0且只由D cleanup释放1次，B receiver释放1次；原几何与其他水/床保持。封存32文件，SHA清单`cabdb8b638377155217da542c6c2a96e5134cc34da20c48ec4a6cf7fe894ec36`。未重跑旧96、主瀑/圣泉完整矩阵或UI单元测试。

真实GL最终证据汇总在`delivery-report.json`、`README-delivery.md`与`comparison.html`：六组low/medium×near/bridge/sea的before/after均time2.4，camera/canvas/lighting及全部stream/bed实际attribute/index哈希精确相等；low1024×576、medium1600×900，编译错误均0。当前六段canvas WebM及baseline桥侧两段各记录4秒、水时间2.4→6.4，经ffprobe解码帧数核验；逐render采样数不是视频帧数或手机FPS。完整录制每帧low0捕获、medium≤1/147456px，无新增预算。只录固定视角水动态，未做连续转向/全时间透明排序证明。

最终补充DOM读回：low与medium均`borrowedCurrentSoilMaps=true`、alphaHash=false、vertexColors=false，三图UUID在质量切换后全部改变；low三图512²，中档color/normal1024²、roughness512²。low仍0捕获，medium1次512×288。独立样片renderer texture数保持14，不将其当作D完整整景或手机资源统计。

实看及独立静态复核结论：平滑绿色板和旧大弧高光读感已改善；第二版真实水底PBR消除了中间版蓝灰补丁和散点边带，桥下水底细节尺度与周围一致。**潭口床端的小台阶、矩形上缘仍可辨认**，这是保留实体形状的剩余限制，不能声称边界完全消失或参考03美术通过。独立场景缺C崖壁/岩床/树木等及D路线/承托/完整建筑，near target新定义，不能冒充D e671现场精确重放。正式D同版整景、根逐图美术复核及真机仍待；D本轮只读快照与新床版分开。

候选2`npm run build -- --outDir /tmp/adonis-water-outlet-shared-soil-build`（含全仓tsc）通过，日志/来源为shared-soil-build.log和shared-soil-build-result.json，仅既有大chunk提醒；最后新增只读bed诊断字段后preview定向tsc也通过。现有D六张低/高水底PBR磁盘输入另存shared-soil-assets，未将磁盘SHA冒充浏览器网络响应摘要。所有原有失败/尝试保留。B未写tools/playtest.js/output，未暂存、提交、推送、部署或重启D5182；B5211及独立Tab7保留供复核。


### 候选2根复核后的下一切片：桥下—海口单硬边归属（归因完成，修正范围交根协调）

根已确认19736/3dda/6ca三源和材质改善，但未美术放行。补记bridge/sea三种未闭合表现：贯穿溪道的长青绿硬直边、斜切三角明暗区、海口横向矩形带；不能只归结为近口床端台阶，也不能以单帧预设全部属于床/水面几何。

本切片只选择其中一条最明显硬边，使用候选2原冻结D/A上下文独立隔离outlet surface/bed、D soil及必要sea，并补小角度连续转向。诊断隐藏不进入生产；不改D通路/全场参数，不重跑旧资源或相位矩阵。若确需改几何，先交根局部范围和接点影响，不自行挪端点/水位。旧候选2源码、图片、录像保持，README已追加上述局限；原README/235项清单另存water-outlet-hardedge-r2/prior-delivery并读回匹配，旧manifest只属于追加前版本。


本次选定海口机位近左侧长暗条的ROI，原生1600×900图`[280,515]→[320,535]`（CSS`[224,412]→[256,428]`，800像素）。新5212只复用r1原冻结D/A上下文，不重新冻结当前D；normal-all-on完整画布像素与候选2原medium sea图精确相同。生产三源仍19736/3dda/6ca，shore仍4c5ee7f5，surface/falls冻结。本轮没有生产材质/几何修改。

实际GL五层隔离给出：只隐藏outlet surface或outlet bed，本ROI均0/800像素变化；只隐藏sea，宽水面显色消失而暗条本体仍在；只隐藏reference-terrain-wet-shore，暗条本体消失、宽海面显色仍在，本ROI800/800变化。隐藏土层仍见独立条带只是背景被拿掉，不证明大幅悬空。所有隐藏只在实验页，最后已恢复五层全开、yaw0与time2.4，不能当生产修复。

最初CSS(240,388)外侧只hitsoil、(240,408)hitsea+soil，确实指向海线显色边，却落在暗条本体上方，归因不足；该假设及修正均保留。细化CSS(240,420)后，实际Raycaster依序hitsea face4557 → shore face685 → soil face49654，无outlet水/床。中心湿岸世界点约`[7.116784,-.267528,17.722589]`；同XZ比实际medium土面高5.25mm，该面顶点局部高低交错约+19..-34mm。Raycaster不评估GPU波浪/透明/深度偏移，最终贡献由GL隔离共同确认。整组shore隔离只确证ROI的湿岸贡献，只有中心射线直接定位face685，不能把整条长边和其他矩形带都说成同一quad。

两段真实canvas转向对照（normal与仅实验hide-shore）各4秒，水时钟固定2.4、eye固定`[6.6,1.75,23.4]`，实际yaw逐render单调-4°→+4°，480/482条逐render矩阵与visibility记录，ffprobe各120可解码视频帧；这些数不能当作录像FPS/手机FPS。GL错误0、每帧medium≤1捕获/147456px。原始视频、JSON及0/60/119号有损解码帧分开保存，未冒充raw PNG或全时间视觉放行。

交根的下一最小范围建议为B water-shore的局部**材质**实验，而非继续改outlet：sea第4边`[10,0,18]→[-8,0,17]`的step3（23段中约.784m），中心`[7.652174,0,17.869565]→[6.869565,0,17.826087]`，quad342/face684–685。当前该湿岸是无贴图、固定opacity.58、roughness.35且无横向渐变的深色片；建议在该局部保留实体/位置/index，复用实际D土底PBR，以平滑湿度驱动的反照率/粗糙度及横向过渡保留湿岸功能，先验证小段再由根决定是否扩展同边。该范围超出初始outlet材质切片，交根协调后再实现；不把实验组隐藏写入生产、不全局调色、不关主潭焦散。尚无证据要求改自然床或海面几何；如材质修正后仍需对真实土面贴合，再另交根确认只此quad的几何方案，不先改D通路/地形、sea outline、outlet端点宽度水位或两口覆盖。

完整结果为water-outlet-hardedge-r2/README.md、comparison.html、attribution-report.json及roi-layer-difference.json；只读独立复核支持上述ROI贡献和有限中心面定位。桥侧斜切三角明暗、海口其他横向带仍未逐项归因，美术未放行。本轮仅新增独立实验TS/HTML/Vite config，类型检查及实际GL通过；不重跑旧资源/相位矩阵、无UI单元测试/依赖/提交/推送/部署，不动原5211或D5182。

### 湿岸 r3：批准 .784m 小段材质原型（未扩段，待根实看）

根已授权上述sea edge4 step3局部材质实验。B只改`water-shore.ts`与`water.ts`接线，冻结为shore `2373a57aeffedf76b03250d29fd33915eeeaed4da18225308c02a37c5a2ffcf0`、water `8b1d468a81b816d6f5bf6af33220af4c66c75c58201713d50dfb2eb6641f3b2a`；streams3dda/helper19736、surface两源、falls674/e11全部保持。按surfaceId/edge/step及原两锚点语义选择，不用全局quad号。岸带全部position/color/normal/index字节与候选2相同，只将当前start2052/count6路由到自有材质，prefix/suffix原材质不改。完整shore每个可见pass多2次draw submission，没有新RT/贴图/捕获。

局部复用既有outlet bed helper，借当前已提交D土底map/normal/roughness三图，以worldXZ/3采样；保留核心opacity.58，用横向湿度驱动颜色/粗糙度，两端各.16m平滑退回原RGB/normal/roughness.35/alpha.58。`beforeRender`在预算/捕获之前同步，low0也更新；donor卸载清空，任意缺图则influence0回原材质。B不clone/修改/dispose借图，自有局部材质dispose1；不改实体、D地形/轮廓、outlet接点/水位/覆盖、主潭主瀑或圣泉。

新证据`water-shore-material-r3/`保留候选2八源baseline，沿用r1原冻结D/A上下文，未重冻当前D。25/25新路径CPU检查通过，包括字节相等、语义prepend/防误选、low0/medium-before-capture、提交/失败/缺图/释放。全仓build含tsc通过，仅既有chunk提醒。无UI单测，不重跑旧矩阵。

实际GL保存low/medium×sea/bridge四组before/after，time2.4/yaw0/五层全开，相机/画布/照明/几何摘要相同，累计编译错误0。sea差异只在批准段投影附近，中档3098px、低档2882px。八段±4°真实canvas录像有3791条逐render记录、每段120实际解码帧，水2.4/eye固定/五层有效可见，low0捕获、medium≤1/147456px。逻辑4s与编码3.967372–3.988091s分列；5段平均fps元数据缺失不伪称固定30fps。

bridge固定图两档均0px变化，但覆盖计算确认该quad在原机位及yaw−4/0/+4°都位于左clip平面外，故只能证明画外可见区未变，不能当本段材质验收。中、低档sea原图及有限视频中间原帧独立复核支持局部纯青胶带感减弱、石灰岩纹理更可读、未见新增强色结；邻接旧带及低档既有斜折线仍在，核心湿感/自然接地/全程转向美术未闭合。保留.7838155m原型，不扩大同边；尚不提出无证据的几何调整。详见r3 `README-delivery.md`、`comparison.html`、`delivery-report.json`及两份独立检查/画面说明。不是正式D全场或真机通过。旧证据不覆盖，B不暂存/提交/推送/部署、不改tools/playtest.js/output；5213独立入口保留，D5182及原5211/5212未重启。

### 圣泉上落水近口：动态归因与有界方案（未实现）

根接收湿岸r3后限定转查A V10装配中的source-drop。B读取A交接/静态审计，复制其只读副本至`/private/tmp/adonis-b-spring-mouth-r1-20261021-203317`，独立5224；328源码/130实体public共458项在结束时全部hash不变，只新增五份B diagnostic入口/helper/config。组合A27f35e95/d359ab65/dad3542b、D8112，falls674/e11与当前相同；wrapperff5ba027/streamsed22f463仍A旧冻结版，不假称当前8b1/3dda。未触A5214/新铜材preview、D或其他B服务。

旧470fall截段经真实工厂重放，逐序端点0误差。旧17点全部属于source-drop第30片（零基fragment29），V[1876,1888)、T[3036,3048)，aData.z=2；原铜喉8/新壳9仍保留，不是主水瓣/veil。水平源片30边只引用原A零命中，不重跑/外推。真实same-source WebGL2 TF捕获原Float32属性的vWorld/vLifeOpacity，三个time的mouth/side输出逐字相同；CPUdouble位置误差最大5.6µm，只用于精度核对，不替代TF。

在t2.4，片29已搬到下游、life1，其旧9边均离开源点.5m球且0铜交点；不是生命周期透明。源点同球内全部上落水实际GPU顶点再作CPU有限铜面射线，t2.4/3.611768/3.666965分别27/29/18交点，继承/新壳9/18、15/14、8/10；均life>0搬运片，片号分别6/22/23、13/14/29、29。所采lobe/veil边零命中，不认证闭体、片内包含或全时序净空。该结果是GPU顶点+CPU有限边，未伪称fragment/depth遮挡查询。

六张正常GL原画布（两原观察机位×三目标相位）可追踪主流弯落盆内，未见明显全断或越盆，近口宽直白片、横向细白边及下颌投影叠盖仍在，不能从照片认证穿铜。另仅诊断隐藏：t2.4 hide-fragment29与正常图逐像素0差；hide全部source-drop搬运片改137034px，口内白片减少而横向细白边仍在；t3.611768 hide-fragment29改9197px，证明该出生相位有近口画面贡献，但不等同19个铜交点被看见。正常已恢复mouth/t2.4，恢复PNG与初始正常PNG SHA相同；主browser error/warn为空、保存状态errors=[]、TF GLerror0。

只交下一局部方案，不改生产：按`water.sacred-source-drop && controlledBySpring`语义给fragment可选标记，默认关闭；用片元实际插值vWorld相对原source、沿单位forward求downstream，d≤.14m仅该类白片alpha0，.14→.26m smoothstep渐现，之后恢复原alpha。mask放原fragment专用alpha覆盖后、.022 discard前，不按中心/vertex mask提前透出。依据当前V10铜面在源点.5m球内前界+.129896992m，.14起点有10.1mm余量。保留全部位置/index/运动/连续瓣/veil/spray及其他圣泉段和主瀑；不动Ø.30孔、A几何、D盆或源锚。该alpha方案保留运输几何相交，不能宣传为物理净空；横向细白边不在本轮修正承诺内。先由根确认边界再实施。

完整新证据为`water-spring-mouth-dynamics-r1/README.md`、`PROPOSAL.md`、`comparison.html`、`delivery-report.json`；CPU映射/实际TF/动态边/正常GL/仅诊断像素分列，脚本、数组、源码、源副本tar及SHA保留。独立定向复核无must-fix；新preview定向tsc通过。不写UI单测、不重跑旧大矩阵/无关全仓构建，无生产代码变更、暂存、提交、推送、部署，不改tools/playtest.js/output。
