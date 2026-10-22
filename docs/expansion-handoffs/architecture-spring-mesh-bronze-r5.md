# V10 泉龛 M：雕壳邻域驱动的单候选交接

2026-10-21，Asia/Shanghai。**一个 M 候选已完成，视觉复核偏好 M 胜过冻结 B；仅交主线程复审，未获最终美术或生产 factory 接线放行。** 雕壳跨凹凸的褐斑基本消失，左鬃毛长槽、口下 V 区等分区开始随雕刻组织；仍偏统一棕金、宽暖亮面，深青铜凹部不足，近看有柔蜡感。原形体、水口与相交未通过项全部保留。

[打开独立预览](http://127.0.0.1:5216/src/world3d/reference/architecture-spring-mesh-bronze-preview.html)，当前 D / M / 嘴近看，mask诊断关闭。选 B/M 对照；lab 可切 low/high 几何。mask诊断只显示属性，不是第二个新材质候选；正常比较必须关闭。隐藏界面后 Esc 恢复。

副本根目录 `/private/tmp/adonis-a-spring-mesh-bronze-v1-20261021-204455`；独立服务 127.0.0.1:5216，strictPort。恢复命令为在该目录运行 `./node_modules/.bin/vite --config vite.spring-mesh-bronze.config.mjs`。原 5215 铜材 B 预览、5214 装配及其他服务均未重启或修改。

[22 张采集与冻结总审计](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/final-audit.json) · [视觉复核](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/visual-review.md) · [实际两档 CPU mask 检查](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/mask-directed-check.json) · [源几何范围审查](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/geometry-source-audit.md) · [带控件的当前预览](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/final-preview-with-controls.jpg)。

## 这次真正改变的信号

M 只在独立预览的私有 bronze geometry clone 新增 `springSculptureMask`，Float32、itemSize=1。原 V10 的 position/index/normal/UV/uv1/color/architectureWear、矩阵和所有旧源保持逐字节不变；没有重新法线化、变形、扩孔、增补雕壳或改水。其他铜、金、石材、全局 shader、灯光及 D/B/C 不动。

1. 从冻结 high 雕壳重建仅供分析的位置邻接图、面积权重和分析法线；不写回渲染 normal。在真实索引边长图上取 60/90 mm 最短路邻域，计算有符号切平面位移，负为凸、正为凹。两尺度同号再以 `D=C60−(60/90)C90` 削弱宽曲面大形，避免整块脸颊磨亮。
2. 标量再作 32 mm 面积权重平滑，同位置的 UV/normal 分裂顶点得到相同值。没有按三角 barycentric 边缘或二面角描线；平滑后边能量下降约91.6%，这是数值连续性指标，不能代替截图。
3. high 为唯一来源场，low 按最近 high 三角面重心转移。距离、朝向、分析法向、支持点或近等距表面响应有歧义时退中性，不强行磨亮。原低档1795顶点不变；分析位置焊接为1793点，其中83点低可信退中性。high3067点中69点因支持/法向不足中性。
4. 这是离散索引边图的形状响应，**不是连续精确曲率，也没有真正的射线 AO**。长三角内部可能欠采样；最近面不合格时退中性，不继续猜次近面。不得称所有细薄表面都已正确识别。

low 的两对同位置但拓扑分开的原顶点，在临时位置合并时形成一条4面重叠边；仅分析歧义点中性处理，未修补或重写生产拓扑。high canonical 无此重合，闭合/方向门限通过。1710个可比 low 点独立同场投影误差 p95=1.93e−6、max=4.22e−5；这是标量转移精度，不是可见 LOD 一致性的证明。

## 精确范围、着色和铜喉

构建的真实顺序是 head 在 bronze index 前缀、旧铜喉在后。应用前逐三角逐角验证 `createLionHeadGeometry(quality)` 经原 mouth/basis 变换的位置；实际运行最大误差0，两部分没有共享顶点。不是用空间圆柱猜测范围。

| 档位 | head index 数 | head render vertices | 旧铜喉 render vertices |
| --- | ---: | ---: | ---: |
| low | 10770（3590三角） | 4372 | 1008 |
| high | 18414（6138三角） | 7110 | 1680 |

属性编码为 PIPE=0、HEAD=2+signed，signed∈[-1,1]，头部中性=2。因此中性雕壳也不再借 baseColor 亮度猜凸凹；铜喉全0，继续使用冻结 B 的完整着色和既有内壁 AO/wear/color。

| M 参数 | 数值 |
| --- | --- |
| 头部基底 / 凸部暖铜 / 凹部深青铜 | `#796044 / #ae8954 / #263f3a` |
| 最大凸部混合 / 凹部混合 | `.75 / .80`（受实际标量控制） |
| roughness 基底 / 凸 / 凹 | `.61 / .36 / .80` 混合端点 |
| metalness 基底 / 凸 / 凹 | `.90 / .94 / .50` 混合端点 |
| normalScale / 五图 UV 倍率 | `.52 / 1.6`，与 B 相同 |
| 原贴图在头部的影响 | 仅 `.99–1.01` 微变化，不作为凹凸信号 |

原 AO/wear hook 顺序保留；头部映射位于原 vertex color / wear 应用前，原管内沉积不受新 mask 重塑。M 材质调用冻结 B hook 后只覆盖私有同值 uniform，增加 HEAD guard 内的局部响应。去除受 guard 约束的新增片段后，PIPE 片元与 B 逐字相同；去除属性传递后，顶点位置/法线 shader 与 B 逐字相同。这是源码证据，不夸称已做管段 framebuffer 分割证明。

## 18 张同机位实拍与4张属性诊断

三组为 D-low、lab-low、lab-high，每组 B/M × 正常距离/嘴近看/侧面。D仍是原medium实装配，水固定t=2.4；lab两档仅换原V10 geometry，**maps/canvas/无AO/灯光与机位均固定low基线**，明确隔离几何LOD。D与lab侧构图各自继承原预览，不能跨模式像素对齐。所有图为浏览器原始JPG 1488×1037，未裁剪、改色或编辑。

| 环境 / 视角 | 冻结B | M |
| --- | --- | --- |
| D-low / 正常距离 | [B](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/D-low-B-front.jpg) | [M](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/D-low-M-front.jpg) |
| D-low / 嘴近看 | [B](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/D-low-B-mouth.jpg) | [M](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/D-low-M-mouth.jpg) |
| D-low / 侧面 | [B](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/D-low-B-side.jpg) | [M](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/D-low-M-side.jpg) |
| lab-low / 正常距离 | [B](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/lab-low-B-front.jpg) | [M](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/lab-low-M-front.jpg) |
| lab-low / 嘴近看 | [B](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/lab-low-B-mouth.jpg) | [M](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/lab-low-M-mouth.jpg) |
| lab-low / 侧面 | [B](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/lab-low-B-side.jpg) | [M](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/lab-low-M-side.jpg) |
| lab-high / 正常距离 | [B](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/lab-high-B-front.jpg) | [M](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/lab-high-M-front.jpg) |
| lab-high / 嘴近看 | [B](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/lab-high-B-mouth.jpg) | [M](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/lab-high-M-mouth.jpg) |
| lab-high / 侧面 | [B](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/lab-high-B-side.jpg) | [M](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/lab-high-M-side.jpg) |

| 属性诊断 | low | high |
| --- | --- | --- |
| 正常距离 | [low](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/mask-lab-low-front.jpg) | [high](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/mask-lab-high-front.jpg) |
| 嘴近看 | [low](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/mask-lab-low-mouth.jpg) | [high](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/mask-lab-high-mouth.jpg) |

诊断：淡红为凸响应、淡青蓝为凹响应、灰为中性、深灰为旧铜喉；是无光照属性显示，仍经过原输出流程，不能当作最终 PBR 色差。两档左鬃毛长槽、口下V区及顶部鬃毛大分区对应；high吻边、下颌、细鬃毛的响应更明确，low更弱或融合，不能称微特征和边界完全相同。灰也可表示正常中性，不等于83个低可信点。未见将全部三角边连续描线的新图案，原实体折面仍清楚可见。

## 成本与所有权

| 每个当前上下文的新增/持有成本 | low | high |
| --- | ---: | ---: |
| 一个新 Float32 scalar | 21520 B | 35160 B |
| 私有 geometry clone（含scalar） | 347796 B | 569988 B |
| helper精确冻结证明快照 | 326276 B | 534828 B |
| controller全A精确证明快照 | 712228 B | 1086812 B |
| 已知持久CPU数组下界（后三行之和） | 1386300 B | 2191628 B |
| 新纹理 / RT / render pass / draw calls | 0 | 0 |

下界包含预览验证快照，不是生产总成本、精确峰值或GPU profiler测量；借用的原工厂buffer、JS对象/字符串/材质开销、模板与临时分析/hash堆均未混入此下界。为切换B/M，私有几何及证明数据会在B显示时也暂留，退出/切上下文才释放。

同机位B/M的实际calls/triangles与报告的离屏成本全部相同。嘴部帧：D为27 calls / 310966 triangles；lab low为13 / 15055，high为13 / 25415。lab既有RenderPass→OutputPass按pass结构和画布面积估算为1离屏、848976物理像素，并非GPU时间实测；没有为M新增pass。A自身low7526/high12706三角，均5网格，新增scalar不会改变三角或bounds。

D-low→lab-low→lab-high→D-low实际模式循环验证：先恢复原 geometry/material 指针，再逐一释放M材质、私有geometry和B材质，各仅一次；五图/环境只借用，工厂继续持有并释放源资产。当前保留活预览持有自己的克隆，退出时释放。

22帧状态均在实际render、inspect和GL检查后采集；vertex/fragment compile及link全部通过，日志为空，window errors为空，浏览器warn/error查询返回0。专用tsc和两档实际CPU/hook/资源检查通过；未写UI单测。审查中还修正了仅新host的错误状态：失败时清ready并清旧材质报告，避免失败帧冒充就绪。

## 冻结版本和可复现源码

331份既有源、130份资产、旧B5份候选文件在新副本和旧B副本均逐文件SHA一致；当前工作区七份A几何/材质/生成源仍与V10快照一致。D/B/C冻结指本片从旧装配继承的副本，不代表并行主工作区B/C的当前状态。新6份文件仅在独立副本和证据source/中，生产工作区对应文件不存在，factory接线未改。

完整旧源hash在 [before manifest](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/before-source-and-assets.json)；最终6文件hash在 [final-audit](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/final-audit.json)。builder阶段元信息早于根对新host错误ready的两行修正，最终以实际截图sourceMetadata及final-audit为准；[修正记录](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/root-fail-state-fix.json)保留before/after SHA与重新tsc结果。

| 最终新增文件 | SHA-256 |
| --- | --- |
| [src/world3d/reference/spring-mesh-bronze-variants.ts](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/source/src/world3d/reference/spring-mesh-bronze-variants.ts) | `2fff3321fe83d570a6ce59d121cf60643e129251deba3e85f68f0652bb6170d1` |
| [src/world3d/reference/architecture-spring-mesh-bronze-preview.ts](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/source/src/world3d/reference/architecture-spring-mesh-bronze-preview.ts) | `34e2dac00d480ee3bab300ecf957d5c9f425b2eaeeb8b54538aeb11230d91263` |
| [src/world3d/reference/architecture-spring-mesh-bronze-preview.html](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/source/src/world3d/reference/architecture-spring-mesh-bronze-preview.html) | `73423616d0f36205ac15fabd7000b4a55ce7e569aad299dba5793aeffb9076a5` |
| [tsconfig.spring-mesh-bronze.json](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/source/tsconfig.spring-mesh-bronze.json) | `f39948aa1d052f104e991cc559ce860a7cda86a806bafd1c6a7eb7d33405669d` |
| [vite.spring-mesh-bronze.config.mjs](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/source/vite.spring-mesh-bronze.config.mjs) | `db703e042e8198e1154056caefc66d17b72b3996cfbf4eacaa4b1a17fb37fb75` |
| [src/world3d/reference/spring-sculpture-mask.ts](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-mesh-aware-v1/source/src/world3d/reference/spring-sculpture-mask.ts) | `c748ba8b9a120941f1bbb9da176368f2989797bb94f6b5916d538dade9e82a04` |

| 保留V10几何源 | SHA-256 |
| --- | --- |
| `architecture-spring-shrine.ts` | `27f35e959b95be5777245c886ed25127230824fd0210eb0cfa02d505557459d9` |
| `architecture-spring-lion.ts` | `d359ab65a78932f939f042a0225605b9a8ca7daeaed7a7f30a1b6bd1b56edee2` |
| `architecture-spring-lion-mesh.ts` | `dad3542b6c80c57421a282fcd3dc3740c38a5dd6983c4d9db8bd4f9777d061f1` |

## 仍未通过

M比B更有形状分区依据，但仍偏统一棕金、宽暖亮面；冷暗青铜在正常距离不够强，近看过净过滑有柔蜡/泥塑风险。算法没有识别每一条眉/鼻/鬃毛脊，也未达到参考图右下狮首的深暗与局部磨亮关系。参考狮首约80–100像素，只足以判断层次，不能反推精确PBR参数。

侧后凹口、厚平侧横纹、下颌折角和大圆管轮廓全部保留；没有借材质或诊断图将其记为几何改善。已有水口CPU静态相交、shader动态/GL净空、近口接续、落盆与墙面遮挡结论不因本片而通过。雕壳与旧水口继续冻结，不为静态点盲目扩孔。

没有提交、推送、部署，未新增依赖或外部资产；后续生产接线必须等主线程对本轮具体候选的视觉决定。
