# A · 参考驱动建筑资产交接

2026-10-21，r5圣泉出口改为真实雕刻狮首，见 [狮首出口交接](architecture-spring-lion-r5.md)。采用Tina / Poly Haven的CC0几何，裁底座、开孔并接回拱肩；原0e9工程版与自制V7快照保留。当前独立资产可交接，固定D源点/0.30m孔/支承与后通路检查通过，整合水路和参考美术仍未放行。

2026-10-21，r5新增紧凑高处圣泉龛，见 [圣泉龛交接](architecture-spring-r5.md)。直接消费D的支承域、frame与固定源点，返回 `grove.spring.spout`；独立实拍和有界检查已保存，参考美术及整合水路仍待根验收。

2026-10-21，r5新增两段石阶与平台，见 [独立石阶交接](architecture-stairs-r5.md)。工厂仅新增D同源的两个stairs id与一次landing；以下神庙/桥的主体与表面修订保持冻结，历史性能数字不代表新整合世界总帧。

2026-10-21，第三个有界切片：只细化现有神庙的雕饰与石材。柱网、门洞、通路、桥拱和2.4m桥footprint沿用第二轮冻结结果；没有扩其他建筑，也未改D的光照、共享接口或生产世界。

## 本次两机位对照与实际结论

仍用 [5207实际建筑实验页](http://127.0.0.1:5207/src/world3d/reference/architecture-preview.html)。本次证据目录：`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/round3/`。

| 机位 | 第二轮冻结图 | 本次最终图 |
| --- | --- | --- |
| 正面 | round3/before-high-front.png | round3/after-high-front.png |
| 深门廊 | round3/before-high-portico.png | round3/after-high-portico.png |

两组camera、target、FOV、canvas、exposure、sun、sunIntensity、IBL逐项相等；截图均1488×1037、high画布1607×1120。`browser-observations.json`只记两张high、一次low门廊和恢复high共4条；没有重跑旧UI、移动端或完整功能矩阵。console error/warn为空。

独立实看确认：金叶在门廊近景已有可辨的凸面、厚度与亮暗，檐带从孤立徽章变成连续卷草；人物头肩/手臂与衣褶的变化存在，但正面尺度下仍简化。外墙/柱脚局部深浅对比仅略增强，**石材位置性风化仍偏弱，较参考均匀洁净；本次不认定参考美术通过。**

## 本次源码与成本

- 新 `architecture-ornament.ts`：用封闭六边截面金带、带中脊的六边叶片制作连续卷草/扇叶；原横带与竖板范围内重排密度和层级，保留实际蓝底。金纹不是贴花，竖板以连接茎、卷须、宽金叶和细回纹代替三个孤立图标。首版密集Extrude成本过高，最终换成低面封闭几何；未增加贴图或材质。
- `architecture-sculpture.ts`：保持7人、位置/主体尺度和原采样数，收窄颅形/下颌、转头与锁骨肩线，手臂按骨段/短肘弯/腕掌拇指重分配原采样；加宽依肩髋膝牵引的衣褶，补承重腿体块。每面high33,440 /low16,804三角，与第二轮相比三角及发出几何字节增量均0。
- 新 `architecture-temple-surface.ts`：只在temple.finish后、AO前处理marble/limestone，按位置组织逐石变化、少量接缝沉积、两处外墙短滴水、墙脚/前右柱础灰赭斑、门洞接触与中央踏面磨亮；外墙滴水由外表面与法线共同限定，内墙滴水为0。两条局部裂隙仅是albedo/roughness瘢痕，不是结构裂口。大部分石面沿用原象牙石底色，无全局暖滤镜或全接缝黑线。
- 为让位置字段能在大块面内表达，只对重点面作线性细分，保持原三角平面、原position/normal与包络；实际新增high6,254/low1,926三角，小于8,000/2,500上限。替换的2个旧geometry立即释放；没有改变桥或独立柱的builder。

| 神庙 | 第二轮冻结 | 本次最终 | 净变化 |
| --- | ---: | ---: | ---: |
| high三角 / 网格 | 324,712 / 7 | 329,334 / 7 | +4,622三角，约1.42% |
| low三角 / 网格 | 209,292 / 7 | 215,922 / 7 | +6,630三角，约3.17% |
| high几何字节 | 26,935,236 | 24,935,916 | -1,999,320B |
| low几何字节 | 19,576,140 | 18,456,720 | -1,119,420B |
| high实际全pass三角 / calls | 1,298,857 / 35 | 1,317,345 / 35 | 仍超过旧120万整帧预算 |
| low实际全pass三角 / calls | 418,587 / 16 | 431,847 / 16 | 本次low门廊实读 |

纹理/材质策略未改：9材质、60张两档PNG；已有high62MiB /low15.5MiB的RGBA8+mip估算继续适用，仍不等于驱动VRAM。表面helper构建期复制两批CPU属性数组，峰值内存未测，不能由最终几何字节减少推断总峰值内存减少。实际lab恢复high后geometry24/texture38，low24/34；没有测新真机FPS。

## 本次有界验证与冻结范围

`temple-round3-check.json`用真实Three builder，仅检查本次模型的finite/index/退化/平均面法线/字段与预算；两档均0异常，8源hash稳定，没有重复旧通路/工厂suite。`sculpture-round3-check.json`覆盖两尺寸/两档/正背，0超坡、开边、同向边、非流形边、退化与反法线，连续腰环保留。`temple-surface-check.json`验证原位置/法线/平面不变、幂等、旧/最终几何各释放一次；最终局部对比参数另见`temple-surface-contrast-check.json`，只作字段/预算/哈希增量复核。

类型检查通过，新增helper与接入路径经只读代码复核无P1/P2。`final-source-hashes.json`保存最终源文件和冻结对照：architecture.ts、proportions、portal、bridge、materials、geometry、occlusion、preview及贴图生成脚本均与本轮before-source相同。未改bridge实际2.4m/中央±.8m通行带与端角参数；D继续按已发布footprint合成嵌岸与导航，不等待本次美术放行。没有新增UI单元测试、提交、推送或部署。

# 第二轮原始交接（历史记录，以下模型数字已由上文更新）

2026-10-21，第二轮。第一轮结构已由根接收供 D 合成，参考视觉未通过。本轮只修改现有神庙和桥的三项反馈，未扩其他建筑；当前是第二轮待根实看样片，不作电影级品质或相似度放行。

## 同机位对照

预览：[实际建筑实验页](http://127.0.0.1:5207/src/world3d/reference/architecture-preview.html)。本轮证据目录：`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/round2/`。

神庙正面、深门廊、桥侧前三张高档回拍，逐项确认与第一轮 camera、target、FOV、canvas、exposure、sun、sunIntensity、IBL 完全相等；截图文件也都是1488×1037。渲染画布1607×1120。未改变实验页的全局光照、曝光或增加暖滤镜。

| 指定机位 | 改前文件 | 改后文件 |
| --- | --- | --- |
| 神庙正面 | round2/before-final-high-front.png | round2/after-high-front.png |
| 深门廊 | round2/before-final-high-portico.png | round2/after-high-portico.png |
| 桥侧前 | round2/before-final-high-bridge.png | round2/after-high-bridge.png |

另保存 `after-high-portal.png` 的门框实体近看、`after-high-side.png` 的侧廊、`after-high-bridge-arch.png` 的桥拱；低档只回拍本轮变化的同三机位 `after-low-{front,portico,bridge}.png`，没有重跑第一轮完整光学/功能矩阵。`browser-observations.json` 记录10条渲染状态及一次 high→low→high，新页 console error/warn 为空。第一轮的真机边界、既有功能证据继续保留，不借本轮照片宣称整合场景或真机 FPS 验收。

## 本轮实际修改

1. **四柱、门框和浮雕体块。**正面/背面6柱改4柱，总柱数24→20。柱高仍9.348m，柱径1.174m（约7.96D高）、正面轴距5.290m（约4.51D）；中央门洞不再被两根前柱夹住。门廊内退4.348m；门洞净宽3.739m、高6.304m、墙厚0.707m。新增 `architecture-proportions.ts` 作为模型/collider 共用来源，实际柱轴偏差为0。
   `architecture-portal.ts` 用闭合 U 形实体截面连续转角：宽面、退阶、凸圆线脚、窄蓝金嵌槽，含穿墙 reveal、真实门楣/冠檐及卷托。框每侧约0.663m，冠檐最前出外墙面0.380m；不是独立薄条贴边。预览增加门框近看机位，原三个机位不变。
   `architecture-sculpture.ts` 重做七人群像：统一成人设计尺度、中央持盾站姿、两侧坐/跪、两端撑肘斜卧；连续剖面塑胸廓/腰盆/头颈、依肩/髋/膝支点牵引的衣褶和披布。没有 Sphere/Cylinder/Capsule 人体拼件或人物贴花。修复了首次回拍的腰部接合感，以及数值检查定位的重叠腰环；薄边/急弯使用60°硬折边平滑，未反转面绕序掩盖拓扑。最终收拢坐/跪位置，左坐像与中央人物伸手呼应，右侧落手至大腿；肩袖、肘腕和厚披布形成不对称体块。每面 high33,440 / low16,804三角，正背均制作。脸手和衣褶自然度仍较参考简化。

2. **真实尺度的材质分区与局部表面变化。**原创贴图升级v3，原8材质加 `bridgeStone` 第9字段：暖象牙柱石4m、暖墙石3m、独立冷灰桥石3m；蓝漆/陶瓦2m、金/铜1m。纹理repeat保持1，由几何按 `metersPerTile` 换算；逐石稳定旋转/偏移打散连续重复。墙体改用墙石，柱/门框保持柱石，桥铺面与护边用冷灰桥石，不再全同米白。
   柱石去掉原周期细线，采用稀疏分叉裂脉、低频矿物云；墙/桥的孔隙、矿物和粗糙度相关。蓝漆保留连续底色，金铜独立baseColor/normal/roughness/AO/metalness图，不借用石纹充当金属。金色花饰改有厚度的花瓣/花蕊，饰带交替 rosette/palmette 并补连续上下细金边；蓝板加厚后修正被埋的装饰位置。表面保留适量逐块色差；石脚沉积和中央踏面摩擦是局部物理颜色/粗糙度字段，不是方向光烘焙。`architectureWear` 在roughnessMap后只调整粗糙度，缺属性默认0。

3. **薄拱桥、不规则铺装和局部破损。**桥宽3→2.4m（最终实测2.39935m），四端角真实削切约14.7–17.5cm并封口；桥冠实体厚度约55→31cm（高档中心射线约30.3cm），铺砖约9.5cm、低护边约4.5–9cm。楔石/深度砌层/铺砖/护边均有尺寸与错缝变化，边缘多层磨圆，端头以石块回包，保留拱腹贯通。
   只约四分之一外露护边/楔石做局部破损，前侧三处护边有约6.5–6.8cm真实缺口、外缘Z退让小于3.8cm；碎口浅坑、露底/摩擦与角缝沉积局部变化，非零粗糙字段仅占约2–3%顶点，没有全接缝黑线或整面加脏。桥面中心和端点高度、冠部结构保持；未制作岸坡、湿边、植被或改变D的太阳/曝光/冷影。

## 新资源成本与验证

| 模型 | 第二轮 high 三角 / 网格 | 第二轮 low 三角 / 网格 | high / low 几何字节 |
| --- | ---: | ---: | ---: |
| 神庙 | 324,712 / 7 | 209,292 / 7 | 26,935,236 / 19,576,140 |
| 石桥 | 35,333 / 3 | 16,458 / 3 | 5,935,944 / 2,764,944 |

第一轮神庙326,576→324,712（约-0.6%，交替纹饰减少了原重复花蕊几何）；桥15,968→35,333（磨圆、封口和真实碎口增加几何）。实际同画布 high 神庙全pass1,298,857 triangles /35 calls、桥141,341 /19；low 神庙418,587 /16、桥32,919 /8。**高档仍超过旧整帧120万三角预算，不能按旧性能门槛放行；没有测新真机FPS。**

- 贴图32→60张，原创PNG总3,078,241→7,084,788B；high5,370,595B / low1,714,193B。按全部RGBA8+完整mip估算 high62MiB / low15.5MiB（未含几何/阴影/后处理，不等于驱动VRAM实测）。这比第一轮37.33/9.33MiB增加，未隐瞒品质成本。金铜high用256²以控制预算。
- `materials-change-report.json`：60张尺寸/哈希/法线检查通过；新增30张运行时纹理、9材质的针对性释放校验，各bitmap/texture/material恰好释放一次。loader未无故重写。
- `temple-round2-check.json`：最终6源hash稳定，两档最终mesh均0非有限值/退化/整面平均法线反向/越界索引；每档65条入口至内殿z[-4,12]地坪射线、9条门洞射线通过。后方原有祭台z约[-7,-6]是实体，不作为地坪通路。初次诊断的重叠腰环记录另保留，不能把旧失败当最终结果。
- `portal-check.json`、`pediment-readability-check.json`、`bridge-width-check.json`：最终门框截面/雕塑拓扑/2.4m薄桥与局部碎口的独立数值证据；桥中央±0.8m通行带603条桥面射线无缺口，拱腹15条与拱洞24条通过。它们不等于角色导航实测。
- `review-numeric.json`：新20根柱轴与collider一致；半径0.35m角色门中心两侧各余约1.520m，侧廊扣除角色直径后余约0.401m，门框身体范围射线无阻。共享工厂API/入口锚点不变，桥中心-2m装配偏移与端点约-.4m保留。最终增量只读代码复核未发现P1/P2，未触碰共享文件。
- 实际一次high→low→high后renderer.info恢复 geometry24 /texture38；low为24/34。这包含两模型及实验页后处理，不能当完整泄漏证明。已有算法级工厂生命周期报告是第一轮历史证据；本轮没有重跑旧226项suite。
- 新源码 `npm run build -- --outDir <round2>/build-check`（含tsc）通过，只生成外部产物；保留原大包warning。`final-source-hashes.json`保存最终12源哈希；贴图manifest的60张PNG哈希已核对，之后未改贴图。没有UI单元测试、git提交/推送或部署，也未触碰历史 tools/playtest.js/output。

## 交给根与D的边界

共享工厂支持范围仍为 temple / bridge / ionic-column；其他建筑没有新增。未改contracts/layout、主世界index/environment。D继续负责共同太阳/曝光/冷影、嵌岸高程、湿边、脚底高度和桥护边碰撞。桥工厂外层 `userData.actualWidth=2.4`、`footprint.halfWidth=1.2`、`footprint.centralWalkHalfWidth=.8` 已透传；导航/护边请据实际窄桥尺寸处理，placement的4m仍只是目标包络。四端角不是矩形，削切腿长保存在 `footprint.bankCornerChamfers`。

四柱/连续门框/成人群像、材质分区和薄桥局部破损已能从真实照片复核；独立实看仍指出：雕饰/蓝金纹样密度少于参考，肩颈/手臂/头部和人物重量简化；石材风化分布与桥台轮廓仍较规整，整体偏新。区域中景与共同灯光也仍需根实看判断。中性实验页背景不作为未达最终场景的理由，也不冒充参考构图。**第二轮仍不自称参考视觉通过或99.9%相似。**

# 第一轮原始交接（历史记录，以下数字不代表当前模型）


2026-10-21。本轮交付**第一批可复核的实际资产样片**，不是整合世界或新美术目标放行。先完成主神庙 / 石桥近景样件，再扩其余建筑。

## 文件与接入

独占 `src/world3d/reference/architecture.ts`、`architecture-*` 辅助文件、`public/world3d/reference/architecture/**` 与本文件。未修改共享 contracts/layout、主世界 index/environment 或其他工作包。

- `architecture.ts` 导出实际 `createReferenceArchitecture(options): Promise<ReferenceLayer>`，按当前 `contracts.ts / layout.ts` 放置世界坐标，返回 detached root。
- 当前支持 `temple / bridge / ionic-column`；其余 placement 的 id/kind 写入 `root.userData.unimplementedPlacements`，不生成占位模型。尚未实现 pavilion、stairs、spring-shrine、urn、stele、mural-frame、valve-plinth。
- `architecture-temple.ts`：24 根 24 槽 Ionic 柱、完整双卷涡柱头/柱础、真实台阶和铺装、厚墙和可穿门洞、退进三层门框、蓝金饰带和檐口、门廊彩色顶板、内殿顶、完整两坡屋面及正背山花。含可复用独立柱 builder。
- `architecture-bridge.ts`：实体楔石拱、贯通拱腹、错缝承台和桥面、薄低护边，3 个合并材质网格。
- `architecture-geometry.ts`：倒角石块、凹槽/微收分柱身、米制 UV、材质合批、索引焊接、退化面清理。
- `architecture-materials.ts`：原创 PBR 加载、正确颜色空间、取消/失败/晚到 bitmap 回收、幂等释放。
- `architecture-occlusion.ts`：针对实际墙顶实体 AABB 的 32 次半球环境遮蔽采样，局部平滑；只衰减间接 diffuse/specular，不改 albedo 或烘太阳方向。WebGLRenderer shader hook；若后续导出 glTF，必须另行烘 AO 或采用兼容扩展，不能宣称标准 glTF 已携带该效果。
- `architecture-preview.html / .ts`：DEV-only 独立资产实验页；只有此实验页创建 renderer/灯光/OrbitControls。生产工厂不创建 scene、灯光、输入、RAF 或存档。

`high` 使用高档几何/纹理，`medium / low` 使用低档资产。`setQuality()` 异步替换，`whenReady()` 可观察当前结果；失败保留旧模型且允许同档重试。取消、晚到结果和重复 dispose 已校验；借用的 `lighting.environment` 不释放。

## 坐标与碰撞边界

米制、+Y，建筑前朝 local +Z。神庙名义地板 y=0，入口锚点 z=depth/2 已补真实齐平门槛石；石块倒角/接缝不作为角色脚底高度函数。主神庙实际包络约 x±10.114、y[-1.033,15.210]、z[-12.506,12.662]，相对目标 20×15×24 的小幅外挑来自台基/雕饰，不整体拉伸模型凑数。

桥 helper 内部冠顶约 y=2，工厂整体 -2 使桥面中心归零；最终局部范围 x±3.593、z±1.500、y[-2.393,0.177]（最高为低护边）。端点锚点 x±3.6,y=-0.4，主世界需连接实际桥面高度和岸坡，不能以常量 y=0 代替弧形桥面。实际模型宽约 3m，placement 4m 是目标包络。

工厂返回神庙柱/墙与独立柱的 collider；当前不返回桥护边 collider。桥面脚底与护边碰撞、主楼梯到神庙入口、未制作建筑均需 D 在整合时明确处理，本包不宣称世界已可完整行走。

## 参考分解与迭代

已实际查看 `docs/art-references/world3d-v3/01/02/03`，02 主导建筑近景；01 主导承重台地/路线关系，03 主导水边石材接触。柱高约 8–9D、柱距约 3–3.5D 是人工视觉转译，非摄影测量。

本轮按实际截图修正了：第一版过曝、屋脊朝向、屋瓦反面绕序、规则柱鼓黑环、过粗墙缝、门洞砌块越界、蓝漆大面积剥落、浮雕头颈/站坐节奏、弯管手臂自交；补真实门槛、门廊彩顶、内殿天花和结构环境遮蔽。未用概念图作背景、门洞黑片或模型替身。前后图保留在下列证据目录。

原创纹理版本 `adonis-architecture-pbr-v2`：四组 marble / limestone / blue-painted-stone / roof，各 baseColor、normal、roughness、AO；共 32 张两档 PNG。无下载素材或概念图像素。生成脚本、README、manifest 记录来源、尺寸、哈希和统计；最终 32 个 SHA256 全匹配。

| 资源 | high | low |
| --- | ---: | ---: |
| PNG 下载字节 | 2,302,050 | 776,191 |
| 分辨率 | marble 1024²，其余 512² | marble 512²，其余 256² |
| RGBA8+完整 mip 的估算纹理内存 | 37.33 MiB | 9.33 MiB |

内存估算不包含几何、后处理、阴影和环境纹理，不等于驱动实测 VRAM。

## 实际运行与固定机位

预览：[实际资产实验页](http://127.0.0.1:5207/src/world3d/reference/architecture-preview.html)。可点全貌、正面、门廊、柱头、侧面、背面、石桥、桥拱；左键环绕、右键平移、滚轮近看；质量选择高/低。实验页保留，私有 Vite 端口 5207，不是部署。

所有证据目录：`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/`。

- `final-high-*.png / final-low-*.png`：各 8 个固定机位的真实 WebGL 截图。
- `final-temple-clean.png`：同模型/同机位隐藏实验页控件，未合成背景。
- `final-mobile-portrait.png / final-mobile-landscape.png`：Chrome CDP 390×844 / 844×390 模拟；非真机、非真实 GPU 性能结论。竖屏使用适配 FOV 84.342° 保留完整模型，桌面 FOV 40°。
- `browser-observations.json`：19 条实际渲染记录，含相机、target、FOV、画布、曝光、太阳、模型/全 pass 几何、调用和资源计数；console error/warn 为空。
- `v1-overexposed.png / v2-overall.png / v3-overall.png / v4-portico.png`：真实迭代过程，不作为最终结果。

实验页为资产中性校准环境：ACESFilmic，exposure=1，太阳 direction[-0.580116,0.740148,0.340068]、强度2.4，RoomEnvironment IBL=0.35，hemi=0.35；high 启用 GTAO。它不等于 D 主世界天空、地形和区域相机。详细机位在源码与观测 JSON：全貌 camera[27,15,35] target[0,6,0] FOV40；正面[0,8,37]→[0,7,2] FOV46；门廊[4,3.1,17]→[0,4.3,5] FOV50；柱头[9.2,9.3,13.6]→[8.37,8.9,10.8] FOV44；侧面[36,11,0]→[0,6,0]；背面[-26,13,-33]→[0,6,-2]；桥[6,3.8,7.5]→[0,-.8,0]；拱[0,-.9,6.5]→[0,-.95,0]。

## 数值和资源验证

| 模型 | high 三角 / 网格 | low 三角 / 网格 | high / low 几何字节 |
| --- | ---: | ---: | ---: |
| 主神庙 | 326,576 / 7 | 202,384 / 7 | 23,595,200 / 17,028,496 |
| 石桥 | 15,968 / 3 | 9,868 / 3 | 2,491,008 / 1,539,408 |
| 独立柱（D=1,H=9 的核验件） | 7,644 / 1 | 4,484 / 1 | 377,936 / 243,952 |

实际实验页 high 画布1607×1120：神庙全 pass 1,306,313 triangles / 35 calls，桥63,881 /19；low 画布1104×769：神庙404,771 /16，桥19,739 /8。包含该页主绘制、阴影、GTAO 等实际 pass，不能将模型三角当总帧预算。**神庙 high 已超过旧整帧120万三角预算；整合需要重新分配后处理/阴影/可见集或进一步优化，不能按旧性能门槛放行。**

反复 high→low→high 后计数恢复到 geometry24、texture29；low 为24/25。这是实验页包含两资产与后处理的 renderer.info 计数，不是完整泄漏证明或 VRAM 字节。未测真机 FPS，静态实验页也不能代替主世界持续帧耗时。

`geometry-audit.json / geometry-audit-summary.json`：5个源文件稳定 hash；所有最终网格两档均 0 非有限值、0 退化、0 整面平均法线反向。屋面朝上和柱身朝外检查通过。每档35条门廊通路射线、125条前铺装射线、603条桥面射线、15条拱腹射线、19条贯通拱洞射线全部通过。少量单个平滑顶点法线跨面切线已单列，不夸称每顶点完全一致。

`factory-lifecycle-audit.mjs / .json`：真实工厂/Three 对象，mock 材料加载器及几何 builder，DEV/PROD 共226项断言通过；覆盖失败同档重试、逆序晚到换档、加载中 abort、dispose 幂等、借用 env、medium→low、旋转后的30 collider/5 anchor。该隔离校验不替代浏览器真实贴图检查。

最终 `npm run typecheck` 与整仓 `npm run build -- --outDir <外部证据目录>/final-build-check` 通过；只生成外部构建产物。保留现有大包 warning，未增加 UI 单元测试、未修改历史 tools/playtest.js/output，未提交/推送/部署。

## 尚存差异与下一道边界

当前可核验的是完整可绕看的模型及材质方法；尚未达到参考的电影感与可信写实目标，不能声称99.9%相似或新美术通过。

1. 山花已有站/坐和肢段变化，但人体重量、衣褶/脸部和群像叙事仍明显简化；卷涡、金纹与屋瓦近看仍有程序化节奏。
2. 石材有真实独立 PBR 细节和结构遮蔽，但石纹一米重复、墙面色差/污迹的尺度与蓝漆风化仍需更精细的非重复设计；低档柱槽有细线闪烁/混叠风险。
3. 建筑明暗较首版清楚，主世界仍需按共同太阳、天空和相机复核暖亮面/冷影/深内殿；实验页中性背景不证明区域构图或颜色匹配。
4. 未制作的建筑、真实地形接触/楼梯/桥端和玩法碰撞尚未完成。第一批样片应先由根按参考实看评审，再扩大资产；不以构建或射线通过替代视觉验收。
