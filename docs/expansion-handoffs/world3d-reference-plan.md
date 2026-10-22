# D · 固定参考驱动的 3D 重建准备

最新交付： [r4结构整合、真实路线与剩余问题](world3d-reference-r4.md)；下一切片 [r5有界地形/路线与资产接点](world3d-r5-landform-plan.md)。本页早期坐标保留为规划历史，当前runtime只认layout.ts，不能用早期表格反推最新位置。

日期：2026-10-21（Asia/Shanghai）。状态：**旧候选视觉验收已撤回，暂停此版本发布。三张固定参考已逐张实看；工厂契约与第一版米制布局已落盘并通过 typecheck，A/B/C/D四组已开工。** 本文不代表新美术已实现。旧功能、存档接入和证据保留，不回退、不提交、不推送。

目标：电影感、可信写实的希腊神话艺术化场景；自然饱和、清晰有色彩，不灰、不褪色。构图、比例、材质尤其最终显示颜色以固定参考为准。建筑、树木、岩石和水要经得起玩家移动观看。**不能把整张概念图贴成背景、立板或地面来代替 3D。**

## 1. 当前质量瓶颈：需要换资产方法，不能继续同类微调

| 范围 | 当前事实与源码位置 | 新方向下的缺口 |
| --- | --- | --- |
| 地貌 | `coastalLandscape.ts:41–75`：六座岬角共用 64 段/6 层环体与中心扇形封口；`:77–92` 是五行连续岸沿 | 同类收口轮廓、环带和坡顶重复；缺少独立岩壁切面、断裂、侵蚀、悬挑、浅滩与堆积关系 |
| 地表 | `environment.ts:45–58,172–220`：单高度场，砂/草/湿岸/裸岩主要为顶点色乘同一砂色图 | 换色不能产生不同表面结构；单高度场不能承担可绕行悬岩、洞口、独立岩块 |
| 路面 | `environment.ts:222–253`：软边覆盖带，铺石为同一七边圆柱实例 | 缺少参考尺度下的嵌土、磨损、破损种类与空间组织 |
| 植被 | `botanical.ts:180–268`：22 株树共用七主臂等分枝语法；树皮主要靠顶点色，叶片使用同一折叶/叶纹 | 种子变化不能代替不同树势；枝干衔接、根盘、冠层体积和叶片尺度缺乏可信感。中档约 219 万植物面仍没有换来目标质量 |
| 建筑/道具 | `antiquities.ts:42–181,237–281,347–429`：box/lathe/tube/挤出件拼装；同类柱、罐、磨边与装饰复用 | 需要先解决结构比例、厚度、完整侧背面、英雄雕塑主形和风化位置；再做细饰，不能仅往基础形体上贴零件 |
| 神庙/远树 | `environment.ts:358–414`：规则柱列、梁盒、三角山花；柏树为低边圆锥 | 近、中、远各层级的主轮廓仍直接暴露基础几何，缺少按参考整体设计 |
| 材质 | `environment.ts:80–94,219`、`antiquities.ts:29–37`：大多为 Canvas 色图 + 常量 roughness；`coastalLandscape.ts:39–40` 把同一颜色图当 bump | 没有接入独立 normal/roughness/AO/metalness 贴图；木材还复用石材色图。`MeshStandardMaterial` 的名称不等于已完成 PBR 资产 |
| 光照/颜色 | `environment.ts:159–170`：渐变天空、雾、半球光/两方向光；`index.ts:152`：ACES/曝光1.15 | 无 `scene.environment` / HDR / PMREM；天空和海水自定义片元未统一 tone mapping。当前明暗靠调色补偿，缺少稳定的材质校准基准 |
| 海水 | `coastalLandscape.ts:103–120`：740×700、52×52 网格，两条正弦位移；按数学岸线/噪声生成不透明颜色 | 无水深、海底、Fresnel、表面法线照明、环境反射/透射；白线不是响应实际岸岩/船体的泡沫 |
| 泉水/瀑布 | `environment.ts:302–309,324–332`：圆水面、两根固定 Tube、发光流线，主要随谜题显隐 | 当前**没有自然瀑布系统**；缺水舌、破碎水帘、落点白水、飞沫和湿岩，不能把固定水管放大冒充瀑布 |
| LOD/内存 | `botanical.ts:389–497` 的 low 实际减实例/换几何；`antiquities.ts:456–487` 主要隐藏 Fine 组；地貌只切云 | 有降级但不是统一资产级 LOD。高精骨架与恢复快照仍驻留；按 Z 显隐/整区合批的裁剪粒度偏大 |

现有真实截图与性能数据只作被否定版本的历史基线，见 `src/world3d/evidence/visual-v2.json`；构建通过、帧率高均不能代替新的视觉验收。

## 2. 本地工具核查与能力边界

本次为只读核查，**没有安装软件、付费、下载模型或新增依赖**。

| 工具/资产 | 当前核查结果 | 能否直接作为已打通生产线 |
| --- | --- | --- |
| Blender / bpy | PATH、`/Applications`、`~/Applications`、`/opt/homebrew/bin`、`/usr/local/bin` 及常见 Blender.app 路径未找到；当前 Python 3.10 无 bpy | 未找到已配置 Blender；不声称整台机器任何位置绝对不存在 |
| glTF 转换/纹理编码 CLI | PATH 无 gltf-transform、gltfpack、toktx、basisu、assimp；仓库 `.bin` 也无对应生产工具 | 未配置 glTF 批处理/纹理压缩生产流程 |
| Node / Three | Node `v20.20.2`；Three `0.186.1`；GLTFLoader / GLTFExporter 可真实 import | 有可用模块，尚未实际导出/加载新的参考资产 |
| Node 离线贴图导出环境 | 当前 Node 的 FileReader、OffscreenCanvas、document 均 undefined；Exporter 源码会使用这些能力 | 不能把“模块可 import”当成带贴图 GLB 导出已打通；需浏览器导出或明确、验证过的适配 |
| Meshoptimizer | 本地 `1.1.1`，Encoder/Decoder/Simplifier 等导出存在并可 import | 可作为后续脚本原料；尚未验证本项目模型简化/编码产物 |
| Three 附带解码器 | Draco decoder、Basis transcoder、Meshopt decoder 文件存在 | **运行时解码器不是模型/纹理生产编码工具**，且当前世界尚未接入 |
| Python 几何辅助 | 当前 `python3` 无 trimesh、pygltflib、numpy、Pillow | 仅指该解释器；本轮不为准备工作另建/安装环境 |
| 世界资源（准备开始时快照） | 开始审计时 `public/world3d/` 不存在；四组开工后，A/C正在各自reference目录生产本地PBR与模型原型 | 不能再将开始快照当作当前“没有任何资产”；各组新交付另行实看/验证 |
| 图生 3D | 本地代码未发现管线；当前会话工具检索未发现已验证的 image-to-3D 转换工具 | **不具备可声称已验证的图生 3D 能力**。imagegen 生成的是二维参考，不是有背面、UV、LOD 的模型 |

可执行路径：先用已装 Three.js 做逐资产人工建模/自定义网格与资产实验页，在浏览器内验证 GLTFExporter→GLTFLoader 往返；不把旧 primitives 原样转 GLB 当成品质升级。复杂树干/雕塑/侵蚀岩壁若超出可控网格作者流程，应明确提出使用官方 Blender 的具体版本/来源/产物方案，或接入已授权的成熟资产；本轮不安装，也不承诺仅凭程序建模即可达到参考品质。未经确认不接付费服务或未知软件。

## 3. 已查看的固定参考与布局契约

来源要求见 `docs/world3d-reference-direction.md`；根拥有参考图、提示词和 provenance，本包不改。三图于本轮使用 `view_image` 全部查看，01 控制总体构图，02/03 细化对应区域，不能把三个概念视角当成严格摄影测量数据。

| 参考 | 固定文件 | 实看后锁定的关系 |
| --- | --- | --- |
| R1 / coast | `docs/art-references/world3d-v3/01-coastal-sanctuary.png` | 左海湾约占半幅，前景树从左侧/顶部框景；右侧近柱/陶器/石阶，神庙在中上部抬高台地，瀑布沿右侧多级落入海湾；拒绝旧平地中轴大道 |
| R2 / grove | `docs/art-references/world3d-v3/02-sacred-grove.png` | 左前景巨大扭干与成片冠层，右上深门廊/金蓝雕饰，中央曲折石阶与拱桥，右下泉池/溪水与湿岩；建筑需要真实厚度和内部深度 |
| R3 / waterfall | `docs/art-references/world3d-v3/03-waterfall-pool.png` | 左侧可走石路和树，上方/右侧圣所；主瀑布先小落差再宽水帘，前景清浅岩底、中景深青水、局部落点白沫，左远海仍可见 |

人工读图的初始定位：R1 神庙屋顶约 `(0.54,0.08)`、主体基座约`(0.55,0.30)`；R2 神庙主要占右上、桥约`(0.66,0.55)`；R3 上级瀑布约`(0.56,0.15)`、落点约`(0.70,0.65)`。这是构图读数的初估，不是像素拟合或相似度测量。用户99.9%为期望，不虚报达成率。

第一版统一布局见 **`src/world3d/reference/layout.ts` / `REFERENCE_LAYOUT`**：世界米制、Y向上、北=-Z、正面=局部+Z，非已验收成图。先在同一连续空间核对三机位，再由D单点修订此文件：

| 机位 | 相机XYZ（眼位） | yaw / pitch / FOV | 画幅 |
| --- | --- | --- | --- |
| coast | `(11,3.22,43)` | `.04 / .09 / 60°` | 16:9 |
| grove | `(-5,13.72,-4)` | `-.46 / .10 / 60°` | 16:9 |
| waterfall | `(13,3.42,17)` | `-.45 / .09 / 60°` | 16:9 |

主要空间锚：神庙 `(15,22,-40)`、前台阶从`(15,13,-12)`升至门前`(15,22,-28)`；石桥桥面`(15,12.6,-8)`；圣泉`(31,12,-18)`；主瀑布在东侧`x≈35`，由`y26→17→8→.18`三段落入水潭；海湾位于西侧。三机位的地面眼高均为1.72米。路径、各类别placements、五发现/三盘/门的新位置在同一layout内，只由D修改。

**旧平面坐标不再是约束。** 五发现ID、解谜目标/回调、输入和返回语义保留，视觉与交互统一重映射到新地形。`layout.ts` 尚未被现有 runtime 导入，本轮不会改变旧可玩版本。

后续每轮记录：地平线/焦点、镜头高度和视角估计、主建筑与树冠的屏幕边界、柱径/柱高/开间等比例、近中远遮挡、可走路线、水/陆面积和 6–8 个主要显示色区。当前运行相机 FOV 66、眼高1.72米是出发基准，不把单张图反推的尺寸或镜头估计称为真实标定。

颜色取样用于**最终渲染对照**；参考中带阳光、阴影的像素不能直接当作无光照 albedo。先锁参考的天空蓝、水色、叶绿、暖石/冷影关系，避免泛黄滤镜、全局去饱和或强雾把差异抹掉。无法从图中看到的背面/侧面需明确人工设计，保持结构可信，至少三个额外角度检查。

推进顺序：

1. 每区先做构图灰模及一个有完整材质的代表资产，核对透视、尺度、遮挡、路线和主色。禁止三组同时凭各自审美铺满地图。
2. 首区截取一个含水、岩、植物、建筑的可走样段，建立统一光照/颜色基准；同机位提交参考与实际渲染的并排对照，以及侧后方画面。
3. 参考匹配获确认后才扩至其余固定区域；每个资产类别先做一个达标样件，再制作有限的独立变体与 LOD。
4. 所有区域完成后复走旧功能路线，最后才恢复发布评审。四组按本契约开工，不做旧版本的无依据微调；先完成参考一致的局部样片，方法验证后再铺开。

## 4. 模型、材质和空间的生产方式

**几何和空间。** 建筑先按参考建立柱列比例、檐部、承重厚度、洞口和内部空间，近景倒角/缺口必须影响真实轮廓；细缝、非轮廓浮雕主要烘入材质。近岸岩体分独立断面、侵蚀块、堆积块；高度场仅承担连续地面，悬挑/独立岩块用封闭网格。主树分别设计根盘、主干扭曲、分叉和不对称冠层，普通树用少量不同骨架，不把同一冠层缩放复制一圈。可近看对象必须有侧面、背面和合理底部，碰撞代理与可走空间匹配。

**PBR。** 石材、干湿岩、砂土、树皮、叶簇、陶釉、铜器分别提供 baseColor、normal、roughness/AO；金属有单独 metalness，不能让所有表面同样哑光或油亮。采用 glTF 2.0 的金属/粗糙度工作流，ORM 可按 R=AO/G=roughness/B=metalness 打包；颜色图为 sRGB，normal/roughness 等数据图不作 sRGB 转换。[glTF 规范](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#materials)、[Three 颜色管理](https://threejs.org/manual/pages/color-management.html)

统一 UV/材质的实际尺度，近景先试 1K–2K、low 512–1K，按可见距离选图；不默认全部4K。纹理不得带强烈固定方向阳光；AO与直接光分开。没有 KTX2 编码链时先验证 PNG/WebP 正确性，不把附带 transcoder 称为已具备纹理压缩。生成的局部纹理也要检验接缝、尺度和数据贴图来源，不能简单将颜色图灰度化冒充完整 PBR。

**光照与颜色。** 将 IBL/环境反射、主光方向、接触阴影、雾和曝光集中管理。环境可先用受控程序天空生成并预滤波，或后续使用已授权的环境资产；不把整张概念图当环境贴图。天空、海水与标准材质只经过一致的一次 tone mapping/输出转换；先用材质样片查色，再按参考校准。用近景材质对比和距离衰减建立空间，不靠全场灰雾。IBL、PMREM、反射能力目前均为待实现项。

**植被。** 英雄树用真实木质结构与叶簇组成冠层；树皮法线、叶片背光与正反色差提供体积，不再把预算主要花在大量孤立大叶上。叶簇 atlas 的 alpha 边缘、mipmap、深度写入和过绘要一并检查。近树/中树/远树按整树轮廓和屏幕占比切 LOD，低档降低枝梢、叶簇和地被密度但保持冠幅；玩家可接近的树不以单张立板替代。

资产交付每项包含：米制尺寸、朝向/原点、包围盒、LOD0/1/2、简化碰撞、UV/材质清单、triangles/draws/贴图像素、来源与许可、参考ID。GLB 作为运行交付格式，模型生产源和可复现脚本独立保留；合批限定在小空间单元与共享材质，不把整区做成一个无法细裁剪的大包。

## 5. 海水与瀑布的分层实现

| 层 | 实现方向 | low 保留/降级 |
| --- | --- | --- |
| 海面形体 | 近岸网格有足够波形轮廓，远海更低频；两组流动法线提供小浪 | 保留法线和低频波形，缩减几何/采样 |
| 反射/深浅 | 视角相关 Fresnel、环境反射、实际水深或离线水深场、浅滩海底与吸收色 | 保留环境反射和深浅色；不启用额外反射/折射 render pass |
| 岸边交界 | 泡沫/湿砂/湿岩遮罩随真实岸线与岩块接触区域，避规则平行白线 | 保留近岸泡沫与湿边，减采样/更新频率 |
| 瀑布起点/主体 | 顶部水舌、多个厚薄不同且有流向的曲面水帘、破碎支流 | 保留主水帘/流向/法线，减细流 |
| 落点 | 局部白水、扩散波纹、受控飞沫、湿岩过渡 | 保留白水和湿岩，减飞沫/雾 |
| 可选中高档 | 水面确实占画面主体且样段成本允许时，加入低分辨率平面反射/受控折射 | 按可见性和画质关闭；不预先承诺每帧全分辨率反射 |

这些是可验证的视觉近似，不宣称流体模拟。泉/瀑布的“是否流动”仍由旧谜题状态驱动，不能用装饰绕过解谜。参考若有瀑布，先核对水源、落差、落点与可走区域，不能只放一层透明动画片。

现有 `ArtLayer.update(time,position)` 没有 renderer/camera；若选平面反射，由集成人给受控 render-pass 接口及预算，美术层不得私建 renderer/RAF。全 pass 的 draws、triangles、render-target 像素都要计入，不能只展示最后主 pass 读数。

## 6. 近中远景与试作预算

按参考确定的可见尺度设置切换距离，不沿用固定 Z 隐藏作为唯一 LOD。近景保留主体轮廓/倒角，中景保留结构与主材料，远景保留独立山脊/建筑剪影和正确颜色；过渡使用滞回或短距离淡变，检查行走时跳变、穿帮和突然空树冠。

初始样段预算，属于试作约束而非已达标数据：

| 范围 | low/手机默认 | medium/桌面 |
| --- | ---: | ---: |
| 可见全 pass triangles | ≤35万 | ≤120万（含阴影/可选水 pass） |
| 可见全 pass draws | ≤90 | ≤160 |
| 估算驻留贴图（含 mip） | ≤32 MiB | ≤96 MiB |
| 首区资产传输 | 目标≤8 MB | 目标≤20 MB |
| 像素预算 | 沿用 .8 / 85万封顶 | 沿用1.25 / 180万封顶 |

预算须以样段实测修订；shader采样、叶片/水雾过绘、解码峰值、CPU/GPU buffer、反射目标也要记录。当前 low 65.9万面/135 draws 的海岸仍超出这个新试作目标，不能直接继承为写实新版本的手机预算。手机30FPS需物理设备验证，浏览器尺寸/DPR模拟只证明该模拟下的成本与行为。

加载按区域和质量档选择资产；low 初次进入只加载/解码所需 LOD，显式升档再加载高档，离开区域按单一所有权释放，不再为了恢复而默认保留所有中高档 CPU 快照。异步切档有 generation token，旧请求晚到即释放，禁止晚到结果覆盖新档。

## 7. A/B/C正式边界与已落盘工厂契约

根已预留边界。D可以用代理只读审查，**不再让自己的代理实现A/B/C模块**。所有现有世界源文件与共享入口只由D修改，A/B/C不碰旧 `environment/index/botanical/antiquities/coastalLandscape`。

| 负责人 | 独占文件 | 独占运行资产目录 |
| --- | --- | --- |
| A / 建筑古迹 | `src/world3d/reference/architecture.ts`、同目录 `architecture-*` | `public/world3d/reference/architecture/**` |
| C / 树岩自然材质 | `src/world3d/reference/nature.ts`、同目录 `nature-*` | `public/world3d/reference/nature/**` |
| B / 水与瀑布 | `src/world3d/reference/water.ts`、同目录 `water-*` | `public/world3d/reference/water/**` |
| D / 构图地形/光照/PBR与玩法集成 | `src/world3d/reference/contracts.ts`、`layout.ts`、可新增 `composition.ts`；所有现有世界文件、公共加载/光照/渲染pass适配 | 其余共用资源/清单由D单点管理，不跨写A/B/C目录 |

资产生产脚本/源数据也放进各自 `architecture-*` / `nature-*` / `water-*` 前缀的辅助目录，避免同名公共工具碰撞。模型不必先打包GLB才能交局部样片，但最终应能验证导出/再载入，不把旧primitive直接打包作为品质升级。

### 7.1 三个工厂：签名已冻结，可据此派工

权威类型：**`src/world3d/reference/contracts.ts`**，只允许D修改。三组均使用 `ReferenceLayerOptions`，异步工厂即使目前只做程序几何也返回Promise：

```ts
// A: src/world3d/reference/architecture.ts
export async function createReferenceArchitecture(options: ReferenceLayerOptions): Promise<ReferenceLayer>;
// C: src/world3d/reference/nature.ts
export async function createReferenceNature(options: ReferenceLayerOptions): Promise<ReferenceLayer>;
// B: src/world3d/reference/water.ts
export async function createReferenceWater(options: ReferenceWaterLayerOptions): Promise<ReferenceWaterLayer>;
```

A/C公共输入只有：`layout`、`quality`、`signal`、`lighting`、`terrainHeight(x,z)`、`walkHeight(x,z)`。B专用 `ReferenceWaterLayerOptions` 在此基础上增加 `renderContext:{renderer,scene}`（借用，仅水体拥有该依赖，不释放），相机由每帧上下文借入。layout是readonly世界布局，每组只生成自己的类别；允许D在独立原型页传入缩减后的placements，不要求第一份样片同时完成所有资产。

- 单位米、Y向上、北=-Z；所有yaw是弧度；模型正面为局部+Z。`position`为世界锚点，`size=[宽,高,深]`是需要建模满足的米制包络，不是让完成网格任意非均匀拉伸。
- 建筑原点通常是底部/平面中心；神庙原点在可走地板中心，门槛为局部`z=depth/2`。桥原点是桥面中心`y=0`；台阶原点是下端前缘中心，从局部`z=0`沿-Z上升`size.y`、水平延伸`size.z`。自然物原点为底部平面中心。
- 神庙留出中央门洞净宽≥3.2米、净高≥5.8米和真实可走内殿；D在新门槛处驱动门叶/阻挡。台阶、桥面、地板不以实心XZ框挡住路线，碰撞只提交结构阻挡代理。
- `terrainHeight`是实际地表/水底，可为负数、不含桥面；`walkHeight`是D管理的可走面。C据前者落根/种草；地被及新增阻挡避开paths、发现/三盘半径和入口，layout明确放置的英雄树不由C擅移。誓言碑/交互点已移到`(-3,12,-9)`，与古树根分离；B据前者做水深，不能拿桥面当海底。
- `lighting.environment`为D持有的借用纹理（asset lab可传null），`environmentKind`必须同时说明`none/cube/pmrem-cubeuv`；不得修改/释放。PMREM产物是`CubeUVReflectionMapping`的二维atlas，**不能传给samplerCube**；标准材质交给Three的env-map流程，自定义水shader按tag使用cubeUV采样，若不支持则请求单独CubeTexture或使用受控平面反射，禁止误采样。`sunDirection/sunColor/skyTop/skyHorizon`为只读基准。各组自建材质/贴图自行登记所有权，不添加太阳、雾、曝光、场景或全屏后处理。

返回对象兼容 `ArtLayer`：`root / setQuality / update / dispose`，增加 `colliders / anchors / whenReady`：

- `root`已经按layout放在世界坐标中，返回时**不挂scene**，D唯一负责挂载。不得另建renderer、RAF、输入监听或存档逻辑。
- `colliders`是只读圆/三维盒代理，盒position表示体积中心，D按高度与玩法选择消费；不要用一整个悬崖大框吞掉台阶/桥面路线。`anchors`为补充的具名世界点，不改变layout。A必须返回`grove.spring.spout`，且圣泉实际出水口与此anchor都等于layout中`water.sacred-spring.points[0]`，当前为`(30.6,14.3,-15.8)`；B直接使用同一水路首点，D核验接缝，避免A/B各猜位置。
- `setQuality(q)`同步保留当前可显示LOD，并在内部管理必要的异步升档；`whenReady()`供D等待当前质量资源稳定后截图，无待加载则立即resolve。低档首载不先下载所有高精贴图；切档不影响布局、碰撞或谜题。不同质量下参考主色、轮廓不能丢失。
- `update(time,position)`只更新时间/LOD/有限动画；每组只释放自己创建的几何、材质、贴图、实例和临时资源。资源创建立即登记，部分初始化失败、signal取消、晚到解码、重复dispose均要正确清理；dispose后停止所有异步挂载。

B额外实现 `setPuzzleState({rotations, springRestored})`，只表现状态，不判断解谜成功、发发现ID或写存档。layout的 `controlledBySpring`明确：**海/主瀑布/水潭是自然常流水；圣泉支流受旧谜题恢复状态控制**。这样初入三主视角仍有参考中的可信水景，恢复的是祭祀圣泉，不是把整个海岸瀑布抽干。具体叙事由D统一接入。

### 7.2 水体受控渲染钩子（已补入类型，运行适配由D实现）

`ReferenceWaterLayer.beforeRender?(frame: ReferenceRenderFrame): void`、`resize?(width,height):void` 为ArtLayer之外的水体扩展；生产光学水模块应返回二者，低档可跳过捕获。resize参数是CSS尺寸，不得在resize内render。D只在每个**主场景**渲染前调用一次，借出renderer/scene/main camera、帧号/时间/delta、显示尺寸/像素比、offscreenBudget与唯一的`renderOffscreen(pass)`入口。B不保留/修改主相机，不直接调用`renderer.render/setRenderTarget`，不另起RAF。

`renderOffscreen`请求给出`kind=water-reflection/water-refraction`、B拥有的render target、B创建的镜像/折射camera、需要临时排除的Object3D列表与可选世界clippingPlane，返回boolean表示本帧是否真正绘制。B owns render targets/克隆camera等资源；D owns临时渲染状态。B在预算拒绝时保留上一有效结果或使用环境反射基线，不采未初始化target。

D已开始实现 `src/world3d/reference/render-context.ts`。当前主边界仅用于直接到canvas的世界：入口非null RT会明确拒绝，不把它当嵌套后处理器；未来若接compositor需另做物理viewport/scissor适配。执行器必须：

1. 全局递归防护，offscreen render不再调用layer.beforeRender；拒绝嵌套renderOffscreen和超出pass/尺寸预算的请求。反射面在该pass暂时不可见，结束恢复。low预算0个额外pass；按根最新要求，中档**全场共享1个pass/帧、target长边≤512**，不是每个水面各一份。B应将反射/折射轮换并缓存各自的有效纹理与捕获矩阵，跨sea/pool避免饥饿；首次/resize/切档未完成有效捕获时使用明确回退，不能因只拿到1个pass便永久放弃光学模式。高档全场至多2个/帧、target≤1024，D按全pass实测再收紧。旧样片512/768配对预算不得直接搬入集成。
2. `try/finally`保存/恢复render target及cube face/mip、viewport、scissor/test、全局clippingPlanes/localClippingEnabled、XR enabled、autoClear/clearColor/alpha、shadow.autoUpdate、scene.overrideMaterial和临时隐藏对象的原visibility。不能将半透明水的临时裁剪/隐藏留给主pass；也不能修改共享灯光/曝光。
3. root统一设置完整帧统计边界：`renderer.info.autoReset=false`，每完整帧只显式reset一次，反射/折射/阴影/主pass全部计入draws/triangles，同时记录额外target像素和pass数量。B不得自行清统计或仅报主pass。
4. `Object3D.onBeforeRender`只允许设置本对象uniform等无额外渲染行为。Three官方Water/Reflector里会自行递归render的钩子**不能原样直接挂入主场景**；若复用须适配为此受控入口，服从同一guard、状态恢复与计数。

B已在独立样片实际跑通平面反射+DepthTexture投影折射，边界见 `docs/expansion-handoffs/water-reference.md`；这不等于D主世界已接入或视觉通过。D现在实现主render前调度/状态恢复适配，B按本协议适配water.ts和resize，继续核验水面侧看与全pass成本，不退回仅解析天空作为中档最终方案。

### 7.3 首个局部样片的明确产物

- A先交 `sanctuary.main` 与 `shore.ionic/shore.urn` 的局部模型：深门廊、完整可绕行侧背面、金蓝/暖石PBR；再交桥/泉。先不要用满地图的同类模块掩盖主形。
- C先交 `olive.grove-frame`、`cliff.cascade` 与少量湿岩/地被样片，分别验证曲折根干、可信叶簇和宏观岩缝；C与B共享layout瀑布tier空间，留出流水/落点，禁止填实水道。
- B先交 `water.pool`、`water.cascade` 及湿边/白水小样，验证清浅底石、深水、反射、分级水帘/落点；不把静态发光白条作为最终瀑布。
- D先做与上述坐标一致的构图地形/路径及统一灯光，组合局部样片对照R1/R2/R3。每组附几何/贴图/资源清单及失败回收说明；共享契约需改先交D统一变更。

## 8. 保留功能与新增资源的验证边界

- `mountGreekWorld`、`onExit/onDiscover`、`discoveredIds`、AbortSignal、pause/resize/dispose 契约保持。模块继续不读写主线/局外存档。
- 五稳定 ID 不改：`greek.coast.navigator`、`greek.coast.tide-mural`、`greek.grove.olive-oath`、`greek.grove.spring-restored`、`greek.temple.first-light`。三盘目标 `[0,2,3]` 和门的前后可达语义不改。
- 发现/三盘/门按新layout统一重映射，不以旧平地坐标牺牲参考构图。D同时迁移视觉、交互半径、地形、碰撞和线索，不允许美术各自移动玩法点。保留真实可达性与水流/门动画反馈。
- 新 loader 使用本地可追踪资源，fetch 接 AbortSignal；parse/解码不保证可中断时，晚到结果也必须由 owner 回收，不再加入 scene。共享贴图/材质用注册表引用计数，避免重复 dispose。[GLTFLoader 官方说明](https://threejs.org/docs/pages/GLTFLoader.html) 特别提示 ImageBitmap 需要额外清理。
- PMREM/HDR源、环境目标、水反射/折射目标、解码器worker、ImageBitmap、Object URL 均有明确 owner；初始化异常、退出、取消、升降档和区域卸载都覆盖。任何美术层不新增输入监听、存档写入或第二条 RAF。
- 按参考主机位对照颜色/构图，并实际绕行侧后面、走入建筑、看水边/瀑布落点；独立记录视觉、功能、加载/释放、桌面性能、浏览器手机模拟和物理手机结果。旧自动化文档锁鼠仍未证明真实锁定，不能借新美术将旧边界改写成已通过。
- 功能复核：五发现去重/重读，三盘→水→门→神庙，未解谜阻挡；加载取消、失败退出、连续进出和质量切换。可做资源/几何/可达性的非UI检查；**禁止 UI 单元测试**。

D当前实际改动：本计划、旧候选状态文档/证据元数据，以及新 `reference/contracts.ts` / `layout.ts` / `render-context.ts` / `composition.ts` 和独立 `reference-preview.html`。构图层已接入A/C/B真实工厂；旧 `mountGreekWorld` 默认入口保持隔离，新 `mountGreekReferenceWorld` 仅供参考样段集成。真实合成截图、渲染预算、桥面/切档检查与明确缺口见 [D首轮集成交接](world3d-reference-integration.md)。仍未作为已验收画面或切换发布入口，没有UI单元测试、提交、推送或发布。
