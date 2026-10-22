# D · v3 首轮实际合成

2026-10-21。状态：**工厂与受控渲染集成可继续迭代，美术未通过，暂停发布。** 本文不覆盖根的参考方向，不把三张独立机位当作完成连续步行验证。

## 已接入的内容

- 独立入口 `src/world3d/reference-preview.html?view=coast|grove|waterfall` 调用 `mountGreekReferenceWorld`；生产默认 `mountGreekWorld` 保持旧功能原型。五发现ID、三盘目标 `[0,2,3]` 与解谜开门语义保留，位置从统一layout重映射。v3完整实走链路尚未重新验收。
- A：当前只实际返回神庙、石桥、Ionic柱。pavilion/stairs/spring-shrine/urn/stele/mural-frame/valve-plinth仍在A的unimplementedPlacements；D的浮空线索面、盘指针和门叶只是功能骨架，不是这些资产已完成。
- C：当前树、分层岩体和水底石已接入。根已要求C继续制作主瀑崖，现有宽断块不作为最终岩体；地被/柏树仍未交付。
- B：真实中高档平面捕获与DepthTexture折射通过D唯一renderOffscreen执行。主海/瀑布/水潭常流水；圣泉支流由旧谜题状态控制。水体工程已接入，不代表水色/泡沫/瀑布美术通过。

## D此次修正

1. 中档全场共享1个额外pass/帧、长边≤512；高档2个/帧、≤1024；低档0。每完整帧统计包含额外捕获、主pass和阴影。渲染前更新scene与camera世界矩阵，防止移动后捕获仍用上一帧视角。canvas-only入口拒绝已有非null RT。
2. `try/finally`恢复RT/cube face/mip、viewport/scissor/test、clipping/localClipping、XR、autoClear/clearColor/alpha、shadow auto/needsUpdate、overrideMaterial和排除对象visibility。
3. A/C显式envMap不受Three的scene.environmentIntensity控制。D按材质WeakMap保存原权重，统一乘`.2`，A为`.2`、C为`.11`，重复就绪不累乘，切档新材质和其它层加载失败后也校准。
4. PMREM所有质量固定128面预算，捕获时关闭太阳圆盘；显示天空另以`.32`校准，不靠降低全场曝光压暗其它资产。太阳方向为normalize(-.68,.48,.40)，最终ACES曝光1.05，云量.12、turbidity1.8、rayleigh2.5、mie.002。借给A/C/B的PMREM二维cubeUV纹理不在切档时换地址。
5. D地面低档24,200面、中高档66,500面，三张本地PBR贴图随质量异步候选替换。generation防晚到覆盖；失败保留旧地面，同档可重试；取消关闭ImageBitmap并释放候选。`whenReady()`等待调用当时的资源快照，后续再次切档须等待最新一次调用。
6. 桥完整范围x=15±3.6、z=-8±1.35优先返回A曲线`12.6-.4*(abs(x-15)/3.6)^1.8`，不再让东半部掉到9.2米河床；两端路径按12.2米衔接，桥面独立于物理水底。
7. 海湾岸线已收窄到曲折主路左侧；前景橄榄树有真实突出岸石地面。连续地面仍是粗构图，宽平坡、边坡拉伸和路径缺乏铺装是明确待修项。

## 瀑布临时配准，供C接续

现C样件finished bounds宽14.653099m，高9.566522m；包络29/33/48经统一比例fit后实际高度约18.93m，不能按33m摆水。C旧几何另压缩局部Z为.8，旧metadata水锚点尚未带该压缩，D按完成几何修正Z。

`cliff.cascade`暂置于`[32, .18-.12*(29/14.653099), -12]`。水头/落点由原局部锚点乘同一比例并压缩Z，改成两个近竖直drop，之间有短台地水道；下级落点落在水潭北沿内。权威数值是 `reference/layout.ts` 的cascadePoint及tiers。D连续地面在该崖正前切开，避免填满瀑布/水潭；这只是旧样件的临时配准，**C换主岩体时必须按新真实崖唇、湿面、落点重新统一layout，不保留补偿旧粗块的切口。**

圣泉支流首点仍为`[30.6,14.3,-15.8]`，A未来实际出水口/anchor必须一致；当前没有spring-shrine模型，不能声称出水接缝已验收。

## 实际画面与成本

同版r3截图：[海岸](../../src/world3d/evidence/reference-v3/coast-integration-r3.png)、[圣林](../../src/world3d/evidence/reference-v3/grove-integration-r3.png)、[水潭](../../src/world3d/evidence/reference-v3/waterfall-integration-r3.png)。1280×720 CSS，同16:9，无图片背景替代3D。中档画布1600×900，DPR受像素预算约束。下表为某一完整帧快照，非长期性能或真机结论；桌面IAB约120Hz，FPS不是性能放行依据。

| 机位/版本 | 真实眼位 | draws | 全帧面数 | 水pass/像素 | GPU纹理/几何 |
| --- | --- | ---: | ---: | ---: | ---: |
| coast r2 medium | 11,3.22,43 | 273 | 1,633,125 | 1 / 147,456 | 42 / 77 |
| grove r2 medium | -5,13.72,-4 | 143 | 1,077,473 | 1 / 147,456 | 41 / 68 |
| coast r3 medium | 11,3.22,43 | 232 | 1,314,237 | 1 / 147,456 | 42 / 77 |
| grove r3 medium | -5,13.72,-4 | 145 | 1,078,161 | 1 / 147,456 | 41 / 68 |
| waterfall r3 medium | 24,3.16,20 | 185 | 1,322,651 | 1 / 147,456 | 41 / 74 |
| 同页切high | 24,3.16,20 | 217 | 1,924,629 | 2 / 1,179,648 | 41 / 74 |
| high→low | 24,3.16,20 | 65 | 279,990 | 0 / 0 | 36 / 51 |

高档画布2112×1188，低档1024×576。反射/折射跨帧交替，可见集合不同，因此同机位相邻帧面数会变动；coast曾实测163万面，不能只报131万低值。中/高档部分机位已经超过原120万整帧试作预算，需要后续按实际可见集/LOD/阴影与捕获优化；不以单个模型面数代替全帧。上述实际进入/切档未出现控制台warn/error。旧waterfall r2被前岸遮住，仅保留问题历史；r3南岸机位才可检查潭面/落点。layout记录预设眼高3.22，运行眼高由物理走面+1.72得3.16，实际截图以记录值为准。

本次预览服务为独立Vite 5182，缓存目录`/tmp/adonis-world3d-reference-vite-cache`，关闭HMR及watch，避免A/C独立样片共用默认缓存造成重复Three。源码或资产工厂变更后需重启该服务再载入；本组画面是本轮集成快照，不宣称已经消费随后A/C正在制作的新主岩体或桥改版。

### 差异仍然显著

- 海岸：神庙正对镜头，参考有侧向深度；当前大平坡与方整岩块占据中景，缺阶梯/亭廊/护岸；Ionic仍缺参考的蓝金装饰。天空已压回蓝色，浅深水和阳光石材仍需与参考逐区校色。
- 圣林：桥不在当前有效构图中，山坡遮住层次，神庙顶部裁切；须在固定机位、桥位/阶梯和连续地形之间重新校构图。缺失A资产不得用D重复粗块补齐后宣称完成。
- 水潭：r3真实潭面反射与两级流水可见；岩体仍方、瀑布与局部泡沫仍需复核；D左岸是陡直、UV拉伸的粗地面。缺前景树岸、亭与远景层次。
- 三机位只是固定验收入口，不能作为已从海岸走到圣林再解谜进庙的证据。重入/返回、取消、完整交互和物理手机仍待v3复核。

## 验证证据

- 当前全仓 `npm run typecheck` 与 `npm run build` 已通过；构建有既有大包warning。没有UI单元测试，没有提交/推送/发布。
- `render-context-review-results.json`：144状态组合+3预算控制，共147项通过；真实Three矩阵断言确认scene→camera→beforeRender，非nullRT拒绝在矩阵更新前。renderer是模拟器，**不冒充真实WebGL**；实际B捕获另以上述浏览器数据补证。
- `composition-bridge-review-results.json`：4,015点桥面高度误差0，隔离艺术collider后的D通行判断全过；WeakMap共享/数组材质、新材质、不累乘及不影响其它envMap通过。
- `composition-ground-review-results.json`：10项资源/失败/代际检查，加1项whenReady快照语义观察，11/11通过。使用真实Three几何/材质/纹理，受控fetch/bitmap/PMREM及工厂；不是UI或WebGL测试。
- 结果已从/tmp复制到同一evidence目录，JSON记录被测源码SHA与边界。后续A/C资产更换会改变实际成本和碰撞，须复核对应新状态。
