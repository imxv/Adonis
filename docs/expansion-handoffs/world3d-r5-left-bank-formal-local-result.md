# R5 左岸正式局部接线与形体05

本轮把D共享类型、目标场、局部网格及能力门禁落入正式源码；产品入口继续使用旧组合。`groveBankTarget` 为显式可选项，C缺能力、错版、失败或没有同版ready确认均保留旧D/C。新的05外围与04b不是同一个形体版本，历史三源和04b仍保留。D本轮未修改A/B/C源文件、未提交、推送或部署。

**停止点：用户已明确3D只是补充，现有模型够用，当前优先转玩法。至此停止3D美术/UV迭代，不等待美术达标、不追加截图矩阵。以下保留当前可用版本与后续backlog；产品opt-in继续关闭。**

## 正式接口与C接入位置

- [contracts.ts](../../src/world3d/reference/contracts.ts)：`ReferenceGroveBankPatch`，字段为revision/shapeRevision/baselineRevision/domainXZ/rockInsetM/baselineTerrainHeight/sample→{terrainY,weight}。
- [grove-bank-patch.ts](../../src/world3d/reference/grove-bank-patch.ts)：无C运行时依赖的`groveBankColumnDelta`与通用contract revision。
- [grove-bank-target.ts](../../src/world3d/reference/grove-bank-target.ts)：`createReferenceGroveBankTarget(layout,baselineTerrainHeight)`，返回`patch/domain/sampleTerrain`。
- [grove-bank-integration.ts](../../src/world3d/reference/grove-bank-integration.ts)：factory能力与bank回执的只读验证。
- [grove-bank-mapping.ts](../../src/world3d/reference/grove-bank-mapping.ts)：仅D新地面的局部陡面三轴贴图投影。
- [left-bank-geometry.ts](../../src/world3d/reference/left-bank-geometry.ts)：新增`.10m`自适应共享边refiner；旧函数正文保留。旧left-bank-profile保持a1e7原字节。
- [composition.ts](../../src/world3d/reference/composition.ts)：第6参数可选`{groveBankTarget}`、实例内高度、D/C同栈提交和质量切换回滚。

```ts
const target = createReferenceGroveBankTarget(REFERENCE_LAYOUT, referenceTerrainHeight);
createReferenceComposition(quality, renderer, factories, signal, view, { groveBankTarget: target });
```

上面是明确opt-in用法，当前产品入口没有增加该参数。`patch.baselineTerrainHeight`必须保留本composition导出的旧`referenceTerrainHeight`函数引用；不是新target、不包一层新函数，也不是网格射线。模块级旧terrain/walk接口保留旧行为；新高度只在匹配组合实例内部启用。

C owner已在[r7](nature-grove-bank-patch-r7.md)中type-import共享Patch并接收独立可选`groveBankPatch`，原体构造始终使用`patch.baselineTerrainHeight`查询全部136点、十个outerFoot和scalar foundation。新patch不进入原MVC/foot/foundation。C的addMass原scalar bottomY仍沿旧值；局部共享顶/底/侧在建好原体后按原顶包络T0执行一次位移，缺省patch走原路径。D本轮没有修改这些C源。

```ts
// D-owned single formula; C calls the importable helper once per original column.
const deltaY = groveBankColumnDelta(patch, x, z, T0(x,z));
newY = originalY + deltaY; // 同XZ原顶/底/侧共享节点只应用一次
```

`terrainY`已经是D所有形体和路水保护后的最终解析目标；C不得再lerp旧D。`weight`已经含D支撑/端点/路水guard及C域内.35m fade，C不得再乘一次任何权重。`.18m`只在满权重处保证顶面上限，partial区允许高于目标乃至高于D。19点表的减.24列仅为D派生参考，不是实际C脚点或新的MVC输入。完整权重语义继承[contract-1](world3d-r5-left-bank-joint-plan.md#单一权重接口04b-contract-1)。

C r7发布两个明确标识：

```ts
// Capability is advertised by the nature factory, not guessed from geometry.
createReferenceNature.groveBankPatchContractRevision = 'r5-grove-bank-patch-contract-1';
// On the committed reference-grove-bank-landform group after its local processing:
bank.userData.groveBankPatch = {
  state: 'ready',
  revision: patch.revision,
  shapeRevision: patch.shapeRevision,
  baselineRevision: patch.baselineRevision,
};
```

当前shapeRevision=`r5-joint-bank-shape-05`，baselineRevision=`r5-leftbank-final-873c-a1e7-20ad-C325`。该回执仅确认处理和同版身份，不能替代封口/接地、通路或美术验收。真实C的capability/ack由C owner实现；D没有启用产品opt-in。

## 旧组合与原子门禁

默认先构造旧D。只有显式target、旧基场函数引用一致、C工厂contract兼容，才把patch单独交给detached C候选；await C.whenReady并校验bank三ID/state。初始缺能力或失败会处置候选并无patch重建旧C，D保持旧值，`scene.userData.groveBankIntegration`明确记录fallback原因。

active组合质量切换不调用旧C内部单独setQuality，而准备新的detached C；同版ready后准备新D，在一次同步提交段交换D/C，再释放上一组。同步提交失败回滚；异步失败继续保留上一组。独立审查发现并修复了原来两个await之间的提交窗口，旧C不能在D已提交后因后续微任务被丢弃。当前已有三个有限控制流夹具覆盖取消、同步回滚、旧资源释放异常；实际浏览器门禁读回另列。

## 05外围与保护域

总作用域不扩：X[13.55,20.75]、Z[-5.6,13.15]；C域仍`[[14.5,-5.6],[19.7,-5.6],[20.75,-1.2],[19.8,3.5],[16,5.65],[13.95,3]]`。

两块2×2核心与平面保留：上台X[16.7,18.7]/Z[-1.4,.6]，Y=`2.1+.005*(X-17.7)-.01*(Z+.4)`；下台X[16,18]/Z[3.5,5.5]，Y=`1.05-.015*(X-17)+.012*(Z-4.5)`。

上台原东缘插入退让口`[18.86,-3.05]→[18.15,-2.35]→[19.11,-1.65]`，入口宽1.422146m、向内退.821997m。下台原2.418677m长前沿改为`[18.3,5.75]→[17.55,6.45]→[16.1,6.15]`两段，长度约1.025914/1.480709m，朝向与上台错开。

路壁脚外侧新增一块斜向大面：轮廓`[[14.7,1.3],[15.25,.95],[16.2,1.65],[16.1,2.5],[15.1,3.4],[14.55,2.6]]`，Y=`2.65-.70*(X-15.2)-.45*(Z-2)`，水平法线朝向约32.735°。这是一处大转折，不增加细噪声；路面硬域覆盖它时以旧路保护优先。

为保证真实三角面不越过路水硬域，05最终解析guard多保留.12m mesh collar：mural半径1.50→1.62m，闭合水域外collar.28→.40m，fade end .58→.70m，stream extra .40→.52m。不是扩大作用域，也没有改实际路/玩家/水域边界。core的有限点guard仍为1。

D新refiner在原已细化地面上自适应拆共享长边≤.10m，邻三角一起拆边避免T junction；属性和原Y先插值，再一次变形。网格用`analyticTarget+(1-Dweight)*(oldTriangleY-oldAnalyticY)`保留过渡中的旧网格偏差：w0原三角面完全保留，w1精确命中台面；C继续只消费唯一解析terrainY，不把D的mesh偏差混入C权重。旧refiner和旧默认构造逻辑保留。

## D陡面贴图映射

原XZ投影在近竖直D墙面上会沿高度拉伸。当前候选采用固定物体坐标三轴投影，3m一张纹理；以法线轴权重混合颜色、粗糙度和切线空间法线。仅当D支持权重非零且面倾斜时启用，平坦台面、guard和域外仍保留原映射。原位置、UV、法线、顶点色和索引保持原值，只新增`groveBankMappingMask`属性。

材质从该次D地面材质单独clone，路线与承托继续使用原材质；共享纹理由原candidate拥有，clone单独销毁。失败候选、质量替换和总销毁均清理clone。此前连续切向UV方案实看出现流纹，已撤回，不列为最终方案。有限shader/mask检查及独立代码审查通过，实际WebGL与照片见下节。

## 新目标表

仅刷新原136个C采样坐标上的D解析值。old→05仍改变61–79共19点；对04b D target变化8点[63,66,74,75,76,77,78,79]，最终rock weight变化3点[75,78,79]。C原136点/MVC/outerFoot/foundation全部旧值，下面不是C脚点目标。

| 编号 | X,Z | D旧Y | D05目标Y | C最终位移weight |
|---|---|---|---|---|
| 61 | 18.623929, -5.332857 | 5.638824 | 5.459112 | 0.115224 |
| 62 | 18.582143, -4.754286 | 5.083400 | 4.329873 | 0.961867 |
| 63 | 18.540357, -4.175714 | 4.548367 | 3.284976 | 1.000000 |
| 64 | 18.498571, -3.597143 | 4.042224 | 2.135964 | 1.000000 |
| 65 | 18.456786, -3.018571 | 3.569255 | 2.129970 | 1.000000 |
| 66 | 18.415000, -2.440000 | 3.129613 | 2.095915 | 1.000000 |
| 67 | 18.138750, -1.945000 | 2.962455 | 2.117644 | 1.000000 |
| 68 | 17.862500, -1.450000 | 2.782662 | 2.111312 | 1.000000 |
| 69 | 17.586250, -0.955000 | 2.551426 | 2.104981 | 1.000000 |
| 70 | 17.310000, -0.460000 | 2.319897 | 2.098650 | 1.000000 |
| 71 | 17.033750, 0.035000 | 2.408511 | 2.092319 | 1.000000 |
| 72 | 16.757500, 0.530000 | 2.696604 | 2.085987 | 1.000000 |
| 73 | 16.481250, 1.025000 | 2.987781 | 2.043094 | 1.000000 |
| 74 | 16.205000, 1.520000 | 3.270318 | 1.988011 | 1.000000 |
| 75 | 15.928750, 2.015000 | 3.532500 | 2.133125 | 1.000000 |
| 76 | 15.652500, 2.510000 | 3.762633 | 2.103750 | 1.000000 |
| 77 | 15.376250, 3.005000 | 3.949062 | 2.074375 | 1.000000 |
| 78 | 15.100000, 3.500000 | 4.080240 | 2.145278 | 0.896344 |
| 79 | 14.542857, 3.461429 | 4.115775 | 4.108520 | 0.001311 |

完整精度与136点：[contacts-05.json](../../src/world3d/evidence/reference-v3/r5/joint-bank-formal/contacts-05.json)。主潭水位/边界、自然出口、主瀑、实际路线/身体域均保持。全局foundation仍2.1396128513；直接回调swap会变成1.1059153567的数值只是已拒绝假设，不是实施值。

## 当前验证与预览边界

全仓TypeScript通过；正式port96个有限点D高度/权重与冻结05差0，C位移差≤2.22e−16m。720保护样点、30闭合总域样点、106有限epsilon检查通过。refiner小片检查绕序/面积守恒、共享边一致、远处拓扑/未移动法线保留，异常前不替换buffer。旧解析高度13点差0，能力/回执9个有限身份检查通过。没有UI单测或旧大矩阵。

最终隔离预览为[5204真实C组合](http://127.0.0.1:5204/src/world3d/prototype/real-preview.html?view=waterfall&mode=proposed&quality=high)，目录`/private/tmp/adonis-r5-joint-bank-real-r7-preview`。从C r7完整339文件快照出发，覆写当前D正式模块；sanctuary固定C11 `b4804893…`，A固定`27f35e95…`、B固定`8b1d468a…`。130份public为独立实体副本，HTTP24模块/130资源逐项hash匹配，新预览独立构建和typecheck通过；[来源](../../src/world3d/evidence/reference-v3/r5/joint-bank-formal/real-source-manifest.json)、[HTTP](../../src/world3d/evidence/reference-v3/r5/joint-bank-formal/real-http-transform-audit.json)、[构建](../../src/world3d/evidence/reference-v3/r5/joint-bank-formal/real-preview-build.log)均归档。私有main冻结`756a4dd8…`，无fake wrapper。

high、time60、viewport1280×720、renderbuffer1600×900，实际直接调用真实C factory，回执`active-matched`、`productDefault:false`。D为151286三角形，C为29204三角形；18个台面核心射线均命中D，最大偏差约5.72e−8m。只证明该有限点集，不外推到整个接触域。

| 同一D05＋真实C r7几何 | 原XZ映射 | 新三轴映射 |
|---|---|---|
| 固定瀑布 | [原图](../../src/world3d/evidence/reference-v3/r5/joint-bank-formal/waterfall-high-native.png) | [新图](../../src/world3d/evidence/reference-v3/r5/joint-bank-formal/waterfall-high-triplanar.png) |
| 桥近侧 | [原图](../../src/world3d/evidence/reference-v3/r5/joint-bank-formal/near-high-native.png) | [新图](../../src/world3d/evidence/reference-v3/r5/joint-bank-formal/near-high-triplanar.png) |
| 两台侧视 | [原图](../../src/world3d/evidence/reference-v3/r5/joint-bank-formal/side-high-native.png) | [新图](../../src/world3d/evidence/reference-v3/r5/joint-bank-formal/side-high-triplanar.png) |

六张仅切换同一proposed地面材质的shader hooks/key；几何、纹理、相机与时间均未切换。[实际元数据](../../src/world3d/evidence/reference-v3/r5/joint-bank-formal/real-browser-captures.json)保留UUID。主检查与独立六图复审均看到台后陡面/台前脸的竖向拖丝减轻，未见原UV旋涡、明显新增接缝或法线翻转。侧视左高路壁上半部、右大坡柱与部分台缘仍有拉伸；长直墙、台缘和切槽的人工感仍明显，**美术不通过，转后续backlog**。

同实例high→low已实际完成并[保存低档图](../../src/world3d/evidence/reference-v3/r5/joint-bank-formal/waterfall-low-triplanar.png)，两world均effective low且无error。low→high在用户要求停止时已完成；仅作一次[停止状态读回](../../src/world3d/evidence/reference-v3/r5/joint-bank-formal/real-browser-stop-state.json)，两world均effective high、pending false、组合仍active-matched，warn/error为空，没有再补返回高档截图。这是本独立桌面预览的正常动态切换，不是原生设备或路线验收。旧替身失败演练不冒充真实C失败演练；三个取消/回滚/释放错误有限控制流夹具为审查者现场检查、未落盘，只保留审查结论。

历史[04b方案](world3d-r5-left-bank-joint-plan.md)和照片保留，只用于旧版本。5201/5202的替身门禁与已拒绝UV图片归入[historical-surrogate](../../src/world3d/evidence/reference-v3/r5/joint-bank-formal/historical-surrogate/README.md)，不继承为真实C r7效果。05的新照片、实际源hash、D/C门禁及台面读回以本结果的新证据为准。

C r7已交付可选局部后处理；其有限面探针中，非仿射满权重面最高可超`terrainY-.18`约.254144m，即高于D约.074144m；partial区最高高于D约3.03985/3.06907m。ready不能推广成全域.18m退让、封口或接地通过。当前产品仍默认无patch旧路径；正式局部接线与隔离组合验证均不等于原生路线或最终美术放行。
