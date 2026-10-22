# A · V10圣泉真实局部装配观察

2026-10-21。**真实组合已运行，采样画面中的水可从狮口落入D盆内；出口静态CPU交界仍未清除。** 同500条实际水边，旧0e9有8个原铜喉交点，V10继承这8个并新增9个狮壳交点。当前不认定水口净空、完整场景、通路或参考美术通过；没有继续调狮首或改水锚。

预览：[独立5214局部装配](http://127.0.0.1:5214/src/world3d/reference/architecture-spring-assembly-preview.html)。保持medium、侧面、t=2.4暂停，可切换出口近看/正常距离，也可播放水流。

新副本：`/private/tmp/adonis-a-spring-assembly-v10-20261021-194711`。证据：`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-assembly-v10/`。原V10三源、交接与全部旧证据保留。

## 实际组合和来源

从 `/private/tmp/adonis-r5-fix02-preview-20261021-185542` 复制源码，只替换A的V10 shrine/lion/mesh三源。组合明确为 **fix02 D / C sanctuary6f7f5fec、banks325267b5 / 旧冻结B waterff5ba027、streams ed22f463 / A V10**，没有取D正在进行的leftbank方案或B后续实现。

直接使用冻结D `createReferenceComposition`。A工厂仅筛选原`grove.spring`条目；C仅筛选真实`cliff.cascade`且不构建其他C landforms；B仅筛选原`controlledBySpring`水条目。均保留原条目引用与坐标，没有第二次world变换。D仍生成真实地形、路线、承载、盆、槽和原地面PBR，也保留远处控制器物件；镜头是局部观察，没有把这些局部筛选称为完整世界。没有伪造台座、水面或替代岩体。

D carrier实际`status=created`，对C真实三角面334次求交。盆岩接触 `[24.6,16.47574441579598,-21.2]`，前拱脚 `[24.35,15.434781654672928,-21.8]`，后干脚 `[23,17.627152753888698,-25]`；输出1,124三角/2 draws。A anchor、D source、B源条目均为 `[24.6,20.3,-22.8]`，world +Z，物理Ø0.30m。A在medium按原工厂使用low几何，共7,526三角/5 meshes。

使用原D ACES曝光1.05、sun normalize[-.68,.48,.40]/3.3、Sky PMREM128、环境权重.2、hemi.45与PCF。石材由D工厂真实加载，未替换或重调A/C/B材质。B通过原`setPuzzle([0,0,0],true)`恢复泉水，经原D render-context执行`beforeRender`；侧面读回盆面反射/折射均valid。此光照与旧A中性lab不同，不能称同光对照。

原副本public为共享软链，本次在19:47解引用复制并hash冻结130个文件；node_modules只读共享，未安装或修改依赖，Vite缓存写入自己的`.vite-assembly-cache`。323份未替换原源码、130个复制资产及共享工作区A V10三源在结束时均hash一致；完整记录在`assembly-copy-provenance.json`和`final-assembly-readback.json`。

## 三视角和短片

| 证据 | 实际相机 → target | FOV |
| --- | --- | ---: |
| `assembly-medium-mouth.png` | `[24.42,20.36,-21.35]` → `[24.6,20.3,-22.8]` | 38 |
| `assembly-medium-side.png` | `[29.2,19.2444,-18.668]` → `[24.6,18.5944,-21.968]` | 42 |
| `assembly-medium-front.png` | `[24.35,19.65,-17.6]` → `[23.874157103537765,19.4,-22.9279239027253]` | 40 |

三图固定medium、t2.4暂停、画布1607×1120。出口与正常距离沿用A原相机的D authority派生；侧面目标由固定源与D真实盆水接触点插值得到，一经确定不为改善结果移动。正常距离为deck+1.65m的观察眼高，不是已验证的玩家站位。另有同侧面`t2.4`的无遮挡`assembly-medium-side-clean.png`。

- `spring-assembly-flow.webm`：实际主canvas录制约6秒，原VP9字节未改，1,522,940B/179编码帧；墙钟6.0021s，水动画time2.4→8.3995，相机起终点完全相同。UI记录的687次render不是编码帧数或真机FPS。
- `spring-assembly-flow.mp4`：供播放兼容，6.000s/180帧，1608×1120；仅右侧补一列黑像素满足H264偶数宽度，并以30fps转码，未改场景内容。原WebM保留为原始证据。
- 从原WebM解码的`video-frame-0.2.png / 3.0.png / 5.7.png`由根与独立图片复核查看。`media-probe.json`保存容器、时间戳、帧数和SHA；`recording.json`和`browser-after-recording.json`分别保存落盘记录及UI saved状态。

可见结论：三张动画采样帧均能追踪主水流从口部至圆盆中央偏后、石块附近，未见明显空气断口、越盆或龛墙截断主流。口部水片与唇沿/下颌投影叠盖，透明叠加遮住局部，所以不能排除穿模或认证GPU净空。狮首—龛—盆比例可读；水偏宽、偏白，有直边片带感，A侧面和下颌粗折面仍在。此为局部装配观察，不将三个采样帧外推为全时序、物理模拟或参考美术验收。

## CPU交界归属：原铜喉与新增壳均有

完整坐标、faceIndex、最近面、原边和冻结SHA见[定向审计说明](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-assembly-v10/assembly-intersection-audit.md)及同名JSON。

检测仅覆盖源点中心半径0.5m球内：308候选三角，实际500条唯一有限边，cap2000、未截断；DoubleSide，near1e-7m，far为各裁剪边真实长度。原B运行时CPU边通过可见status导出，再对同一D fixture下两个真实A helper做同边射线。没有重构B坐标或把直线出水轴检查替代实际上落水。

| 实际B水mesh / 水段 | 检测边 | 旧0e9 | V10 |
| --- | ---: | ---: | ---: |
| `falling-water-sheets-and-runnels` / `water.sacred-source-drop`源头上落水 | 470 | 5边/8交点，均原铜喉 | 9边/17交点：原喉8、新壳9 |
| `water.sacred-spring` / 0.08m水平源水片 | 30 | 0 | 0 |

上落水原top `[24.6,20.3,-22.8]` → bottom `[24.6,17.02,-21.2]`、width.3；不能从合并mesh无属性的边进一步猜测水瓣/veil/脱离片子类。原喉8点按实际面为内壁3、外壁/卷边3、端环2，旧框未命中；新增壳9点。旧8点在新模型中世界坐标逐点相同，17个新点与浏览器结果亦逐点复现。交点是水三角边穿铜三角面的次数，不等于可见堵水点数。

| 归属 | 代表世界交点 |
| --- | --- |
| 继承原铜喉内壁 | `[24.72449406990927,20.38205009255758,-22.824416110565753]` |
| 继承原端环 | `[24.750685215664717,20.321814903646978,-22.800000075328796]` |
| V10新壳，上游侧 | `[24.75922566491697,20.40625762939453,-22.823131320797096]` |
| V10新壳，下游+0.05437m处 | `[24.752629595117643,20.282931350373516,-22.745630268549874]` |

新旧按完全相同Float32三角顶点分类：旧铜656三角=原喉576+旧框80；V10铜4,166=同原喉576+新壳3,590。因此不能把全部交界归为新A问题，也不能说V10仅继承旧问题。后续B应复核继承的原喉交界，新增9点需要A/B结合真实喷流包络协调；本切片不改任何一方实现。

V10雕口前突约0.13m，而原源水片仅0.08m、另有+.025Y；B上落水又从同一固定源点起始。因此不能仅按长度相减推定有0.05m空缝，实际图像有水覆盖连接，但已经确认的静态相交也不能被“看起来连续”抹掉。

CPU结论只针对静态基形，不执行fallVertex时间位移、脱离片搬运或fragment透明裁切。GL结论只来自上述实拍/短片采样：没有明显整流中断，仍无法认证口部最终动态净空。旧0e9对照仅为同一组500边的快速重建，不是旧完整场景或旧视频复验。

## 冻结源与复现

| 源 | SHA256 |
| --- | --- |
| D composition | `05f56a21d6ce46e538513306d7a96c4fec458c3dcdbf1741a1c9983d955192f5` |
| D spring-carrier | `33144d03e9d3d32f97716aa1a25d8f61e21436809b80d9bb1fa7bbe78c8586da` |
| D landform-layout | `8112d6b922649e6460a45237315f5c9523f28af6b461334d5958060eb705325a` |
| B water | `ff5ba027ea68787f2a8d28f1004edef12b75ad92ff84f41bb4b7b648ff6efe33` |
| B falls | `674856dc7b18d3da1dec7b0af47b9b6ef592199cd6722753810fd652789bd490` |
| B falls shader | `e11fdbc56049e7f697d1bbf2b39c77173ff5437e60be087c4e284e0a0a53a8dd` |
| A V10 shrine | `27f35e959b95be5777245c886ed25127230824fd0210eb0cfa02d505557459d9` |
| A V10 lion | `d359ab65a78932f939f042a0225605b9a8ca7daeaed7a7f30a1b6bd1b56edee2` |
| A V10 mesh | `dad3542b6c80c57421a282fcd3dc3740c38a5dd6983c4d9db8bd4f9777d061f1` |
| 旧0e9 helper | `0e9efe82d625ad5d4f59aed0f0786cc51340b8ac2046d178f83e03f8a1c8dcc7` |

新预览文件只在独立副本内，最终四文件另存证据`preview-source/`。三图/录像对应初始host TS `b1dada07…`；随后仅增加CPU原边输出、修正来源文件名单，补充审计host TS `fa46b42b…`。旧host完整快照与两个阶段的SHA在`edge-export-metadata.json`，它验证去掉三处诊断输出即可恢复初始TS；渲染、模型、材质、相机、水和录制逻辑均未变。

复现服务：在新副本运行 `./node_modules/.bin/vite --config architecture-spring-assembly-preview.vite.config.ts`，固定127.0.0.1:5214、独占cache。定向审计：在证据目录运行 `node run-assembly-intersection-audit.mjs`。专用typecheck通过，独立只读代码复核无可证P1/P2，最终浏览器error/warn为空。没有重跑旧40/25/48或全世界矩阵，没有UI单元测试、生产实现修改、提交、推送或部署；未触碰D/B/C服务、浏览器或其当前左岸工作。
