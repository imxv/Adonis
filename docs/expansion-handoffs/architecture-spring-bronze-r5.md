# V10 泉龛铜材：A/B 独立预览交接

2026-10-21，Asia/Shanghai。**两候选已完成实拍，视觉复核偏好 B；均未达到参考美术关系，等待主线程复审，未接生产 factory。** B 比原版减黄、减鲜青绿，同时保留更多暖金属反射；A 更暗哑，泥塑或褐石感较重。两者仍有跨凹凸的褐斑和较宽亮面，没有建立参考中“深青铜凹部、局部温暖磨亮凸缘”的明确组织。

本片只改独立副本中泉龛的一个铜材网格（狮首和原铜喉合并网格）的局部材质克隆。V10 位置、全部属性、索引、法线、UV、顶点色、矩阵、assembly、水锚和原 D/B/C 冻结；全局 bronze/gold、寺庙、桥和石材没有修改。未新增纹理、购买资产、RT、依赖或几何，也没有通过改灯掩盖折面。

## 直接复审

[打开铜材独立预览](http://127.0.0.1:5215/src/world3d/reference/architecture-spring-bronze-preview.html)。当前停在 D / B / 嘴近看。可以选 D 真实局部装配或原资产 lab，再切原 V10、A、B；正常距离、嘴近看、侧面各有固定按钮。隐藏界面后按 Esc 恢复。

预览根目录：`/private/tmp/adonis-a-spring-bronze-v1-20261021-201943`。独立服务 127.0.0.1:5215（strictPort）；如需自行恢复：在该目录运行 `./node_modules/.bin/vite --config vite.spring-bronze.config.mjs`。本片未重启或修改已有 5214 装配预览、5207 资产预览。

[最终检查记录](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/final-audit.json) · [视觉复核](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/evidence/visual-review.md) · [精确贴图映射与粗糙度说明](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/material-mapping-review.md) · [当前带控件截图](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/final-preview-with-controls.jpg)。

参考为 `docs/art-references/world3d-v3/02-sacred-grove.png` 右下狮首。参考单狮首约 80–100 像素，只能支持色调、层次关系判断，不能反推精确色值或粗糙度。以下颜色均为试验参数，非参考取样。

## 两个候选

| 参数 | A 深褐旧铜 | B 暖旧铜 |
| --- | --- | --- |
| 基底 / 磨亮目标 / 暗锈目标 | `#65513a / #9b7949 / #293d36` | `#796044 / #ae8954 / #34423a` |
| roughness 基底 / 暗锈 / 磨亮目标 | `.68 / .82 / .44` | `.61 / .76 / .39` |
| 贴图重映射后、原 wear 前离散 texel roughness 范围 | `.6248–.722` | `.5594–.649` |
| normalScale（原 .8 的倍数 → 当前） | `.5 → .4` | `.65 → .52` |
| 五图局部 UV 倍率 | `2` | `1.6` |
| patina 最大混合权重 | `.30` | `.26` |
| polish 最大混合权重 | `.23` | `.23` |

polish 由原 baseColor 线性亮度和 metalness 覆盖派生，门限 `.12–.17`。它不是曲率、真实凹腔或凸缘 mask；不能保证眉、鼻梁、鬃毛脊一定磨亮。`.44/.39` 是混合端点，不是最终最低粗糙度；原管内 wear 和 Three 法线导数 roughness 后续照常叠加。

首轮诊断代码的 `.18–.44` 亮度门限高于实际贴图最大线性亮度 `.1783435`，polish 分支未生效；已在同一 A/B 中修正门限，全部最终 18 图均为修后重新实拍。首轮 9 图和状态保存在 `pre-fix-inactive-polish/`，仅供追溯，不作为最终候选。没有第三候选或灯光迭代。

## 全部 18 张对照

同一模式同一视角，原版/A/B 相机、灯光、曝光、分辨率、几何和水时间完全相同。D 和 lab 继承各自原照明、渲染分辨率与侧面构图，跨模式侧图不做像素对齐比较。所有截图均为浏览器原始 JPG，1488×1037，未裁剪、改色或编辑。

| 环境 / 视角 | 原 V10 | A | B |
| --- | --- | --- | --- |
| D 装配 / 正常距离 | [original](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/D-original-front.jpg) | [A](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/D-A-front.jpg) | [B](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/D-B-front.jpg) |
| D 装配 / 嘴近看 | [original](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/D-original-mouth.jpg) | [A](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/D-A-mouth.jpg) | [B](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/D-B-mouth.jpg) |
| D 装配 / 侧面 | [original](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/D-original-side.jpg) | [A](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/D-A-side.jpg) | [B](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/D-B-side.jpg) |
| 原 lab / 正常距离 | [original](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/lab-original-front.jpg) | [A](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/lab-A-front.jpg) | [B](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/lab-B-front.jpg) |
| 原 lab / 嘴近看 | [original](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/lab-original-mouth.jpg) | [A](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/lab-A-mouth.jpg) | [B](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/lab-B-mouth.jpg) |
| 原 lab / 侧面 | [original](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/lab-original-side.jpg) | [A](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/lab-A-side.jpg) | [B](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/lab-B-side.jpg) |

D 使用冻结的原 `createReferenceComposition` medium、原 `createReferenceRenderContext`、C cliff.cascade、D 实际 carrier 和受泉龛控制的 B 水；暂停 t=2.4。lab 继承原 A low 的 Room IBL、灯、地面、诊断线和 RenderPass→OutputPass，AO 原本关闭。两环境都为同一 V10 low：7526 三角形、5 网格、712228 字节。

D 实际太阳强度 3.3、曝光 1.05、环境权重 .2、hemi .45，含原装配 point light；lab 为 2.4、1、.35、.35。D 画布1607×1120；lab1104×769。它们是各自原路径的结果，不是为候选另设灯光。

## 冻结与所有权证据

- 独立候选副本和旧装配快照的 328 份既有源、130 份资产均逐文件 SHA 一致；当前工作区七份 A 几何/材质/生成源也与 V10 快照一致。D/B/C 的冻结是旧装配快照的冻结，不代表并行主工作区 B/C 的当前状态。
- 每张最终状态均在实际 render 和 inspect 完成后采集，所有 geometry attribute（包含 position、normal、UV、color）、index、本地/世界矩阵 SHA 不变；候选只替换 1 个铜材网格。非铜材指针、原材质参数、贴图参数/指针均不变。
- D 与 lab 全部属性/index 哈希和矩阵也相同；根对象名字分别是 `grove.spring` 与 `reference-spring-shrine`，运行时 UUID 不同，因此不使用带名字/UUID的总哈希误判几何差异。
- 原 onBeforeCompile AO/wear hook 保留且顺序通过定点检查，缺省 attribute 数组私有复制；五张贴图和环境只读借用。没有再次注册遮蔽 hook。UV 仅在局部 shader 的五个 varying 同步缩放，材质 clone 各自拥有 uniform。
- D→lab→D 实际模式切换记录中，两模式均先恢复原材质指针，再各释放 2 份 clone，均仅释放一次；源资产由原工厂释放。候选新增纹理、RT、几何、属性均为0，此为源码结构/指针证据。当前保留的活预览持有自己的候选 clone，退出时释放。
- 18 帧状态中 GL program vertex/fragment compile 和 link 均通过、日志为空，浏览器 warn/error 为0；专用 TypeScript 与实际 low shrine CPU shader/所有权定点检查通过。无 UI 单元测试；未提交、推送或部署。
- lab 既有 RenderPass→OutputPass 包含1趟离屏，记录为既有 pass 结构和画布面积估算，不冒充 GPU time；候选没有新增渲染 pass。

V10 三份几何源仍为：

| 文件 | SHA-256 |
| --- | --- |
| `architecture-spring-shrine.ts` | `27f35e959b95be5777245c886ed25127230824fd0210eb0cfa02d505557459d9` |
| `architecture-spring-lion.ts` | `d359ab65a78932f939f042a0225605b9a8ca7daeaed7a7f30a1b6bd1b56edee2` |
| `architecture-spring-lion-mesh.ts` | `dad3542b6c80c57421a282fcd3dc3740c38a5dd6983c4d9db8bd4f9777d061f1` |

五份候选新文件只在独立副本中；生产工作区对应文件均不存在，未修改 factory 接线。可持久追溯的完整副本在证据目录 `source/`：

| 新文件 | SHA-256 |
| --- | --- |
| [src/world3d/reference/spring-bronze-variants.ts](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/source/src/world3d/reference/spring-bronze-variants.ts) | `c26bd146546c6ab35d9fd738e6c6fa166aef30adaa7fb044875d306935820b02` |
| [src/world3d/reference/architecture-spring-bronze-preview.ts](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/source/src/world3d/reference/architecture-spring-bronze-preview.ts) | `eccf5e612880e762d0b9ba5435ab210472379b58b0afe72fe8b2ba9caa398655` |
| [src/world3d/reference/architecture-spring-bronze-preview.html](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/source/src/world3d/reference/architecture-spring-bronze-preview.html) | `429dbf5ce26bebb05ced0fafe4d0c589d923d5aaa84a975355119ca651d9a896` |
| [tsconfig.spring-bronze.json](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/source/tsconfig.spring-bronze.json) | `9a89023a368dce3322d19bb5723b655b31e40ccb589b535391a3b59264755486` |
| [vite.spring-bronze.config.mjs](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-bronze-candidates-v1/source/vite.spring-bronze.config.mjs) | `ec6952059d317a680a31c0cc7b8eb3dcc6ca4544e7e6510a2cd0107ba55999dc` |

## 未通过项

B 只是本轮更平衡的复审候选，未获主线程视觉认可，仍待主线程决定后才可做生产 factory 接线。两者都没有修好侧后凹口、厚平侧面横纹、下颌折面或大圆管轮廓；只是减弱了高光与色块对这些问题的强调。贴图斑块仍跨凹凸，深青铜凹部仍不充分。

此前 A/B 水口 CPU 相交、GPU 动态净空、喷流与雕壳交界等未通过项保持原结论。本次调色和静态截图不能用于关闭它们，也不代表全场景、美术、通行或发布验收通过。
