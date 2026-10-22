# C · hero elder v10 / 主瀑岩体 v9 冻结交接

## r5 前基岩与桥岸首版样片（待美术与整合验收）

最新圣泉支路修复 helper `6f7f5fec…` 已冻结，消费 D `.16m` 额外余量，独立工程检查通过；真实 D 每档 3423 个允许中心的完整身体圆盘最小足底净距 .291223m。详见[最终支路交接](/Users/sunmozong/Adonis/docs/expansion-handoffs/nature-spring-route-r5.md)。同步构建约 1.6–1.8 秒，主世界完整步行、实机性能与美术未验收。以下 e4ca / 原面数保留为未传支路的首版历史基线。

两组有界可见岩体已冻结：前基岩 `e4cae666…`、桥岸 `325267b5…`；low/high 合计25,500/45,264三角形、3 draw。真实A上下文及冻结D地表回拍、两档实际三角净空和可选工厂释放检查完成。`nature.ts` `19b06d57…` 新增可选 `landforms` 参数，复用本轮材质并原子提交registration；不会自动撤换旧placement。

图像仍有大平面/局部断层与宽圆岸坡，**未美术验收、未在主世界完成接地与路线步行**。截图/检查对应D `6ce738d0…` + composition `78403d34…` + layout `eba5136b…`，D后续共享更新需另验。主瀑、tree v10和61个C公共资源保持冻结；未扩海岸z18岸体。完整真实包络、接点、源快照、12张图和证据见 [r5交接](/Users/sunmozong/Adonis/docs/expansion-handoffs/nature-landforms-r5.md)。

2026-10-21。**仅树小切片已完成回拍与工程检查，参考级美术仍未通过。**当前树源码冻结为 `281e04638ef77f184d8949ade4e1c11954ae70cd34677f818818518874755f07`；before 是 v9 `8e9f1904d4786fed06b580be77855f48ce50e6e819fffb130f829df30489acf8`。岩体 `fc87710d` 的形体、材质、底 cap 和水锚保持冻结供 B/D 联调。

本小片只修改 [nature-trees.ts](../../src/world3d/reference/nature-trees.ts) 的 hero elder 分支与本文件；没有改共享工厂、材质、D placement、水坐标或其它物种。sentinel/spring 两档全部几何属性、index、实例矩阵与颜色逐字节保持 v9；没有扩柏树、地被或其它岩体，没有提交、推送、部署，未编写 UI 单元测试。共享工作区的 D layout 后来有其它任务更新，v10 独立样片不 import layout，不声称当前世界合成结果。

## v10 实际变化

- 保留现有12个冠组，重排高低、深浅、体积和间隔，打破一条水平帽檐。front 两处穿过前后冠团的物理空隙露出天空/主枝；侧后也保留连贯体积。减少叶卡，没有靠增卡堆密；没有根据旧接缝记录盲改叶片材质。
- 保留主干骨架和洞 SDF，只收窄 hero 根肩的全向扩张，调整原有三根为长短/粗细不等的曲线并渐细。外根使用单一所选根的 U/V 圆周/弧长 chart，向领口原 trunk chart 平滑过渡，避免多根相位相消。左外根的大沟槽由横向环带改为沿根走势。
- r2 回拍暴露右前细根尖的 MC 离散岛，不能由 finite/释放检查放行。r3 只调整该根末段曲率/半径，把最终细尖延后到模型埋根段，未删/过滤任何面。1e-5m 共位置连通检查确认目标根区 high/low 的可见及地下离岛均为0，实际固定 root 图不再见断片。该证明不等于全树流形认证或厚度已获美术接受。
- 上部 WOOD/洞定义未改；前两轮对照的 elder 2–4.8m 木质 position/normal 多重集与 before 一致，r3 只改根末段。冠层两档属性在 r1→r2→r3 逐字节一致。

## v10 包络与成本（请 D 据实际比例审树位）

| elder | v9 low → v10 low | v9 high → v10 high |
| --- | ---: | ---: |
| 叶卡 | 549 → **488** | 864 → **780** |
| 三角形（含叶实例） | 22,560 → **21,614** | 56,314 → **54,778** |
| 主渲染 draw | 5 → **5** | 5 → **5** |
| XYZ 尺寸 m | 16.016×11.490×11.504 → **15.687×11.822×11.122** | 15.544×11.018×11.377 → **15.414×11.475×11.009** |

high 尺寸变化为 `[-.130505,+.457363,-.368310]m`；low 为 `[-.329915,+.331736,-.382175]m`。high bounds=`[-7.606524,-.6,-5.324394]→[7.807360,10.875330,5.684383]`；low=`[-8.192759,-.6,-5.063254]→[7.493808,11.221805,6.059056]`。没有强塞旧包络或非均匀拉伸；D placement 未由本任务修改，入土深度/岩缝接触还需在最终地形中判断。固定裸地预览不能代替该接地验收。

六份 CPU-only 模板合计16,364,352→16,188,264 bytes（约15.44MiB），仍常驻到模块卸载、每个实例自有独立 clone。非 UI 对照确认先释放一棵不影响后续实例，借用材质处置数0。没有新增纹理，也没有把 Node 冷/热构建时间当设备 FPS。

## v10 固定机位前后图与验证

真实 WebGL，before/after 的 camera、target、yaw/pitch、FOV、眼高、1920×1080渲染、曝光/灯光/IBL逐项相同。high 开阴影、low 关闭阴影，两者都沿用各自 v9 基线设置。没有暖滤镜或注入场景/相机来掩盖问题。

| 机位 | v9 before | v10 after |
| --- | --- | --- |
| front high | [before](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/before-tree-front-high.png) | [after](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/after-tree-front-high.png) |
| root high | [before](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/before-tree-root-high.png) | [after](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/after-tree-root-high.png) |
| front low | [before](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/before-tree-front-low.png) | [after](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/after-tree-front-low.png) |
| root low | [before](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/before-tree-root-low.png) | [after](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/after-tree-root-low.png) |
| side high | v9历史索引见下 | [after](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/after-tree-side-high.png) |

- 最终 `node src/world3d/reference/nature-checks.mjs`：**304,092 assertions，failures=[]**，包含几何/LOD及正式工厂释放检查；`npm run build` 通过（tsc+Vite），既有 >2000kB chunk 警告保留，未处理无关分包。
- 独立静态复审未发现确认 P1/P2；实际回看过最终高低档 front/root，high 侧后。浏览器 warn/error 为空，预览页和本任务5184临时服务器已关闭，未动共享5173。
- [最终前后汇总、包络/固定相机证明](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/final-summary.json) · [最终检查](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/core-checks-final.json) · [构建](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/build-final.log) · [根尖连通/属性所有权](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/final-connectivity-comparison.json) · [独立复审](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/independent-review-final.md) · [逐帧参数](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/after-capture-metadata.json) · [源码与证据哈希](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-tree-v10/evidence-manifest.json)。

本片可确认扁伞轮廓被打破、真实冠隙出现，裙状根肩收窄，外根沟槽方向改善，断根碎片被修掉。**冠团仍有分组感，根肩/根端仍偏简化；未达到参考中的自然复杂度，也未获得父任务美术放行。**不报相似度、电影级或真机性能通过。

以下是已冻结的 v9 岩体/异步管线与当时世界实走证据；其中 v9 树数字/图保留为 before，不能再作为当前 elder 数字。

## v9 岩体/异步工厂冻结与证据边界

扫描源码 SHA256：`fc87710da789be9ab127132e9f1c9a9242f5ac68c7a03321ee2124b197579029`。v9 的独立样片与主世界截图均来自同一份临时冻结源码/资源副本，335 文件在复制前后哈希一致，HMR/文件监听关闭；浏览器画面使用实际 WebGL，没有注入场景位置或相机。

[源码快照与全部文件 SHA](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/world-source-snapshot-v9.json)记录该版 D layout/composition、B water 与 A architecture 的确切版本。[证据清单](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/evidence-manifest.json)另列截图后共享工作区的变化：B 瀑布和 A 神庙已有后续修改，不能把 v9 图称作这些后续文件的运行结果。C 模型、D layout 与固定变换在 v9 中对应。v7/v8 是历史，不再称当前最终版。

## 正式异步工厂

[nature.ts](../../src/world3d/reference/nature.ts) 导出 `createReferenceNature(options): Promise<ReferenceLayer>`，不创建 renderer、灯光、输入或 RAF。只有 `kind==='cliff' && id==='cliff.cascade'` 等待扫描，其余旧 cliff 保持原入口。

每轮 rebuild 有独立 AbortController、材质 owner 和 generation；扫描 await 覆盖实际 manifest/二进制读取。supersede、dispose、外部 abort 会立即取消该轮等待并释放待加载材质；晚到 group **先 own 再检查代际**，已关闭 owner 会立即释放晚到 geometry。扫描最终 geometry 释放其唯一自有材质 clone 一次；输入材质、借用 maps 和环境永不由扫描释放。

anchors/colliders 暂存在新 owner，只有新模型完整成功才与模型同步发布。失败不会改写当前锚点或其数组；支持失败后同档重试。`root.userData.cascadeRegistration` 记录 referenceEnvelope、uniformScale、modelTiers、三点 modelLedge、modelLedgeWidth、layoutWaterMatches。后者只证明传入 layout 的附件配准，不代表地形、动态水、路线或美术通过。

[nature-cascade.ts](../../src/world3d/reference/nature-cascade.ts) 为 C/D 共用的无 Three 依赖数据：固定 referenceEnvelope=`[13.956301212310791,8.75,7.761792540550232]`，high/low 用同一 uniformScale，不重新按各档 bbox fit，不重新居中，不再额外 Z×.8。

v9 冻结 D r4 匹配读回：scale=`2.0779144530371148`，translation=`[32,-.1524663124859384,-12]`，yaw=0；两档 `layoutWaterMatches=true`。实际工厂与实际 D layout、真实本地 scan 数据的非 UI 读回见[登记结果](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/live-layout-registration-final.json)，材质回调受控，不能当渲染证明。

| 接点 | 成品局部 XYZ（米） | 宽度/说明 |
| --- | --- | --- |
| upper.start | `[.35,8.72,-1.12]` | upper 宽 2.05m |
| upper.end | `[.7,4.9,.25]` | 中层落点 |
| ledge.mid | `[.88,4.88,.4]` | 中层三点路径不可跨空简化 |
| lower.start | `[1.15,4.85,.58]` | lower 宽 2.45m |
| lower.end | `[1.25,.16,1.69]` | 自由入潭，不声称下方有岩台 |

world=`translation+yawRotation(scale*local)`，宽度也乘 scale。底/水端点和包络未因唇口修复改变。世界高档 bounds 为 `[16.714235,-.152466,-24.075755] → [45.714235,18.029285,-7.947415]`；低档北/南缘约 `-24.074510/-7.974570`。深度约 16.1m，旧版 14.59m 深度数字失效。

## v9 树基线（当前 elder 见上方 v10 表）

三套 elder / sentinel / spring-arch 保留各自编排的骨架、根与冠团。主干、粗主叉及三条不等粗弯根改成一个 smooth-union 表面，凹洞直接切入该表面；细枝仍为 sweep。根颈底部改用连续主干 UV 和纵向外推，修掉右前根的端点 V 锁死及相位相消；洞内按真实凹面距离连续变暗并偏暖棕，保留皮理。叶簇方向、冠团深度和开口有调整，未增加叶卡数。

| 对象 | Low 三角形 / 主渲染 draw | High 三角形 / 主渲染 draw |
| --- | ---: | ---: |
| elder | 22,560 / 5 | 56,314 / 5 |
| sentinel | 18,188 / 5 | 41,996 / 5 |
| spring-arch | 17,866 / 5 | 41,702 / 5 |
| 主瀑扫描岩体 | 13,840 / 1 | 73,744 / 1 |

树面数含叶实例，不含地面/阴影/全世界。high 实际 XYZ bbox：elder 15.544×11.018×11.377m、sentinel 13.227×10.956×9.985m、spring-arch 15.618×9.565×10.526m。只能统一比例适配，不能拉细树干以强塞旧高宽包络。

最多六份木质模板常驻 CPU，共 16,364,352 bytes（15.61MiB），从不直接上传；每个实例有独立 geometry/attribute clone。实例 dispose 不清 CPU 模板，模板到模块卸载才释放。最终 Node cold 181–488ms、warm .88–3.78ms；浏览器一次 elder 首次 field 约 587ms，后续提取/表面约 94ms。这不是瞬时构建、不是同步构建中途可取消，也不是设备 FPS。详见[树预算与 UV 前后证明](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/tree-refine-final.json)。

## 岩体修复、底 cap 与水路证明

原料是 Poly Haven 官方 CC0 的 `rock_face_01` / `rock_face_02`，作者 Dario Barresi，后者另有 Rico Cilliers 处理。当前主岩体按真实三角位置投影/重采样 relief，形成连续闭体；保留扫描起伏，**没有保留原扫描三角连接、悬挑和所有背面细节**。宏观围形、深度与水槽为人工编排。下层小唇体与闭体有体积重叠，但不声称布尔焊成单一流形。不是贴图盒子，也不是原始扫描整体原尺寸搬入。

最终只有一个合并 geometry、一个自有 MeshStandardMaterial clone，在同一表面连续混合干湿色/粗糙度；无独立湿岩直条或新增背部承托平面。底部局部 y=0 的切口由 D 地形/真实轮廓承托埋入。

| LOD | 局部 bbox min | 局部 bbox max |
| --- | --- | --- |
| low | `[-7.356301308,0,-5.810879230]` | `[6.599999905,8.75,1.937245369]` |
| high | `[-7.356301308,0,-5.811478615]` | `[6.599999905,8.75,1.950313926]` |

D 发现旧版高档最低 cap 的两片翻面后，C 修掉非凸轮廓的中心 fan，改成真实 XZ 有序轮廓 Earcut。最终 low/high 为 94/254 面，全部几何法线朝 −Y；96/256 条边逐条对应侧壁最低环，单闭环、无自交/非流形边。成品 cap 三角面积分别 27.995692156 / 28.313553176m²，与真实轮廓面积一致。没有删除坏片后掩盖边界，也没有改底环/尺寸。完整主 body 仍闭合。工厂 parts.bottomCap 为 X 归一化前作者空间面积，最终成品以独立 bottomCapProof 为准。

旧 21 点漏掉两级起流短段的穿入。新增每档 1,746 个探针：两级全段弧长步距≤8cm、首 1m≤2.5cm、九条横向线包含 ±width/2。修复前每档 80 点不足净空，修复后阻塞 0；采样最小 .043525m。

另将**全部实际岩面三角形**裁入完整 XY 直线水带，在裁后多边形顶点求仿射 `waterZ(y)-rockZ` 最小值，覆盖站点/横线间空隙：upper low .047827 / high .042639m，lower 两档 .036868m，均大于 .035m。此证明严格限于固定直线水带，不能代替真实 B 水瓣。

[修前密采样/cap](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/dense-water-route-v8-before.json) · [最终连续水带/cap/附件](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/dense-water-route-final.json)。修前来源为 `7a794517…`，最终来源为 `fc87710d…`。

**贴唇仍有缺口**：upper 起点到下方实体的垂向间距 low .138473 / high .124046m；lower .161488m，当前世界约 .3356m。metadata 的 physicallySupported=true 只是现有 `<.17m` 邻近支撑阈值，绝不是水与岩接触的判定。固定斜率和 .035m 前向净距也约束了最低垂向间距，不能用放宽阈值或移水锚假装解决。

B r3 提供的三主股保守界在 135 个水平中心片采样/LOD 中，low 33、high 43 点仍有潜在界重叠，首 .5m 世界最差约 −.2750 / −.3222m。独立 X/Z 极值不保证同一环角或相位，因此**不证明实际穿透，也不证明实际通过**。报告冻结 falls=`f94c1a40…`、shader=`f4a9b05d…`、layout=`662e5173…`；复核时 shader 已为 `67215715…`，主股给定站点的径向上界未超过 r3 界，但 veils/碎片/所有相位未覆盖，截图后 B 又有更新。见[B 包络输入](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/b-r3-lip-envelope-input.json)和[比较范围/版本](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/b-r3-conservative-envelope-comparison.json)。C 未按保守 box 盲挖大洞，未动固定端点；待 B/C 同版实际水束和视觉贴唇共同复核。

随后总指挥转交 B 对冻结 C `fc87710d` 的实际 mesh+48 动态相位检查：下级 high 闭束存在真实穿入点 `[32.820461,9.474425,-11.238098]`，time=4.989179s，沿 tier 投影下降 .304152m，体内最近深度 .279038m；前 1m 仍有面交，veil/运动白片未发现面交。该结论来自 B 的同版检查转交，C 未独立重跑该动态脚本，B 的完整 hash 报告待其交接。**剩余闭束修复交 B：初始截面薄出流/前出弧线；C 本轮冻结 fc87710d，不追加削岩、不动锚点。**待 B 完成后再作同版联合核对，v9 截图并非其后续修复的证据。

## 实际主世界与绿色薄面归属

v9 由原入口进入 medium（实际 1600×900），从 grove 出生点 `[-5,13.72,0]` 用正常 WASD/拖动过桥，经西侧约 `[11.72,15.92,-17.9]`、阶梯抵北侧约 `[18.14,21.09,-24.48]`。DOM 读回 cascadeRegistration=matched、cascadeSupport=created。正常退出后 canvas=0、world root=0，warn/error 日志为空。仅证明这次实际路线/退出，不替代全身体走廊验证、全世界可达性或设备性能；debug FPS 不作为性能结果。

实际图仍可见前景绿色薄面。C 在临时冻结副本增加独立诊断入口和只读 ray picker，重新正常步行到北侧，点击真实绿色像素 `[570,495]`：先命中 `water.sacred-spring`（5.669m），再命中 `water.sacred-spring.channel-bed`（MeshStandardMaterial，#706f50，6.142m），C 的 `continuous-scanned-cliff-with-damp-surface` 在后方 9.983m。该帧薄面来自 v9 圣泉水层/渠床，不是 C 新岩体。未改 B/D 原文件；诊断入口/源码也归档在证据目录。截图后 B 的后续版本不可由此外推。

[实走位置](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/world-capture-metadata-v9.json) · [对象拾取](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/green-face-runtime-pick-v9.json) · [拾取实际截图](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/v9-world-green-face-picked.png) · [退出与日志](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/browser-world-final-v9.json)。

## v9 验证与图像索引

- `node src/world3d/reference/nature-checks.mjs`：306,116 assertions、failures=[]。覆盖六树、八旧崖原型、三缩放、十项旧生命周期和九项真实扫描生命周期（含晚到、失败保留、原子锚点、取消）。280 次受控纹理请求、39 次扫描 fetch；9 个返回 geometry/自有材质各释放一次，借用材质/maps/环境处置数 0。
- `node src/world3d/reference/nature-scan-check.mjs`：PASS，含来源/派生/source proof SHA、有限值/退化、两档包络、密水路、连续水带、真实底 cap 边界/面积、主闭体、材质所有权和失败/取消。
- `npm run build`：tsc 与 Vite 通过；仍有既有 >2000kB chunk 警告。本轮没处理无关分包。
- 独立静态复审未发现确认的 P1/P2；明确直线水带≠动态水束，邻近支撑≠贴唇。未新增 UI 单元测试。[完整检查](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/core-checks-final.json) · [扫描检查](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/scan-checks-final.json) · [构建日志](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/build-final.log) · [复审](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/independent-review-final.md)。

v9 图像目录：`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9`。`v9-{tree-front,tree-close,tree-root,tree-side,tree-far,rock-front,rock-close,rock-side,rock-far}-{high,low}.png` 共 18 张同机位对照；[逐帧参数](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/capture-metadata-v9.json)含相机/target/yaw/pitch/FOV、灯光、分辨率和统计。固定曝光1.08、ACESFilmic、太阳[-18,24,15]/#fff1d6、半球光.85、IBL.38、1920×1080 渲染；low 同分辨率但关闭阴影。wholeRenderIncludingShadow 包含地面/阴影，不等于单模型面数或 draw。

| 视角 | 树高档 | 岩体高档 |
| --- | --- | --- |
| 全貌 | [树全貌](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/v9-tree-front-high.png) | [岩全貌](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/v9-rock-front-high.png) |
| 近景 | [树干](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/v9-tree-close-high.png) / [根颈](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/v9-tree-root-high.png) | [岩近景](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/v9-rock-close-high.png) |
| 侧后 | [树侧后](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/v9-tree-side-high.png) | [岩侧后](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/v9-rock-side-high.png) |
| 远景 | [树远景](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/v9-tree-far-high.png) | [岩远景](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/v9-rock-far-high.png) |
| 主世界 | [西侧实走](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/v9-world-reachable-west-side.png) | [北侧实走](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/v9-world-reachable-north-side.png) / [瀑布主视角](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-reference-v9/v9-world-waterfall-start.png) |

纹理每档14张去重，高7,118,054 bytes/低2,486,260 bytes；RGBA8+mips 理论60.67/16.67MiB，不是 GPU 峰值，未含几何/阴影/IBL/解码重叠。扫描派生二进制高1,418,648 bytes/低332,256 bytes。normal 无损 WebP；原始/派生/贴图 SHA 见资源 manifest 与证据清单。[资源来源与限制](../../public/world3d/reference/nature/scans/README.md)。

v9 美术记录保留为历史：当时树根裙状、冠层偏伞的问题已进入上方 v10 小片，最新树结论见上；岩体侧后宽大平滑块面和近似平行层带仍待合成后复核。B 动态水束/贴唇与 D 地形路线的后续状态以各自新交接为准，本段 v9 证据不外推。不报相似度、电影级、真机帧率或整游戏验收通过。
