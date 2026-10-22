# C · r5 前基岩与桥岸首版样片

2026-10-21 后续：圣泉支路局部修复已冻结为 helper `6f7f5fec…`，直接消费 D fix-02 `.16m` 额外余量，独立检查 PASS。见[最终支路交接](/Users/sunmozong/Adonis/docs/expansion-handoffs/nature-spring-route-r5.md)。**下文 e4ca 与 25,500/45,264 面预算是未传入支路的首版历史基线**；新支路预算、同步构建成本及同版 D 前后图以上述最终交接为准。

2026-10-21。两组有界可见岩体已冻结，可交 D 选择接入；**工程样片完成，参考级美术未通过，主世界接地、土帽和完整步行路线未验收。** 当前仍有大平面、局部水平断层和宽圆岸坡；加上 D 地表后，大块岩体会被土层覆盖，不能据此声称整体硬墙问题解决。

仅修改 C `nature-landform-*` / `nature-landforms*`、`nature.ts` 必要可选入口与本交接。没有修改 A 建筑/桥/阶梯、D layout/composition/地表/走面、水层、旧 playtest 或 output；未新增 public 资源。主瀑形体、水锚、tree v10 与材质保持冻结。未扩新远崖、柏树、地被或 z18 海岸桥岸体，未提交、推送、部署，未编写 UI 单元测试。

## 冻结版本与后续共享变更

| 源码 | 本次截图与最终检查 SHA-256 |
| --- | --- |
| nature.ts 可选入口 | `19b06d576138644ceda04618605abfc780d8d20736de515d10847337dfffaff4` |
| nature-landforms.ts | `3abe5b46bc50e85d83a163b85abe6fc4ef799415fef22bfeae3d05251b50bf72` |
| nature-landform-sanctuary.ts | `e4cae666d35791a872cf9682d428a64cbc3951537217fdaedb6be7dcb86eb49d` |
| nature-landform-banks.ts | `325267b5db00b569dcb1384e514208f923974d008f66c8051a2cb5dea6ca8076` |
| D landform-layout.ts | `6ce738d058956ea65667539956a9b21b7dcdff8428c72fb549ea435cc63ff683` |
| D composition.ts / 实际 terrainHeight | `78403d34ca4c33523998bbafcc5ce7e7075f571350c74e20fec7a53ea7423916` |
| D layout.ts | `eba5136bbbb93274ec030dbc7bdb9f142c64c6a09aea9f6e34696e102ff2b3ab` |
| A architecture-stairs-layout.ts | `b3216f9c343ff59c7efb7966969c945d707ac2dbfd8e92edd6ea883439c69fe9` |

运行坐标仅来自 D `landform-layout.ts`，不消费提案 JSON；类型文件不存第二份坐标。完整 398 文件冻结副本与 SHA 见[源码快照](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-source-snapshot.json)及[可重放快照](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-replay-snapshot.json)。后者的 `snapshot` 指向永久证据目录中的逐字节副本，不依赖原临时目录。

回拍后，共享 D 已变为 landform `e6714720…`、composition `f7945964…`、layout `d2448e11…`。只读审阅确认当前实际消费的 contours / flight / landing / pool / causeway 和两个 stair 计算函数与本次冻结版一致；**不能把冻结截图或几何读回当作新 composition 的整合验证**。脚部取决于实际 D terrainHeight，换回调后应重新核对埋入与接缝。逐文件当前值见[回读](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-source-readback.json)。

冻结基线仍为 tree `281e04638ef77f184d8949ade4e1c11954ae70cd34677f818818518874755f07`、主瀑 `nature-scan-formation.ts` `fc87710da789be9ab127132e9f1c9a9242f5ac68c7a03321ee2124b197579029`、`nature-cascade.ts` `735bcbe4…`、`nature-materials.ts` `d878ccf1…`；61 个既有 C public 文件与快照一致。

## D 接口与资源所有权

正式组合优先使用既有异步工厂的可选参数，复用本轮 C 材质及14张 PBR 贴图：

```ts
import { createReferenceNature, type NatureLandformContacts } from './nature';
import {
  REFERENCE_TERRACE_CONTOURS, REFERENCE_GROVE_POOL,
  REFERENCE_STAIR_FLIGHTS, REFERENCE_STAIR_LANDING,
  REFERENCE_BRIDGE_EAST_CAUSEWAY,
} from './landform-layout';

const landforms: NatureLandformContacts = {
  sanctuaryFrontContours: REFERENCE_TERRACE_CONTOURS,
  grovePool: REFERENCE_GROVE_POOL,
  flights: REFERENCE_STAIR_FLIGHTS,
  landing: REFERENCE_STAIR_LANDING,
  bridgeEastCauseway: REFERENCE_BRIDGE_EAST_CAUSEWAY,
};
const layer = await createReferenceNature({ ...existingNatureOptions, landforms });
// D supplies existingNatureOptions.terrainHeight and owns layout changes.
// Read committed metadata: layer.root.userData.landformRegistration
```

未传 `landforms` 时维持既有路径。传入后，在本轮旧 placement 构建完毕后加入两组新岩体；不会自动删除或遮盖旧 cliff placement，D 需自己确定替换范围。几何先登记本轮 owner，registration 随成功模型一起提交；失败或取消保持旧已提交模型与 registration。切档由原 owner 统一释放几何、材质和贴图；调用方只用 `layer.dispose()`，不再单独销毁其内部 landform。

独立调用也保留：

```ts
import { createReferenceLandforms } from './nature';
const asset = createReferenceLandforms({
  quality: quality === 'low' ? 'low' : 'high',
  materials, terrainHeight, signal, contacts: landforms,
});
scene.add(asset.root); // identity transform; vertices already world metres
// teardown: asset.dispose(); do not also dispose asset.geometries
```

独立工厂拥有2份 geometry，借用 limestone / wetLimestone 及其 maps，不处置材质、环境或贴图。dispose 幂等，中止/第二部分失败释放已收养的第一部分。两个 helper 不创建 renderer / RAF / 输入，不生产 soil / walk / collision / water。

## 形体、真实包络与接点

前基岩由三层 D 轮廓形成闭合厚体，取消强制同心套大；使用数米尺度折面、三处局部斜凹口、有限坡脚延伸和局部悬挑。两段梯槽取 D 实测踏步中心/底面推导的连续保守下包络，加侧向削面；没有逐阶压出锯齿槽。当前较长平面与局部水平断层仍需美术判断。

池岸为厚连续盆岸与东西岸肩，共3个 macro solid；相交部分不是 Boolean union。桥孔按 D 实际矩形整段排空。外脚136个 D 地表采样点以内采用 mean-value interpolation，消除最近边采样在内域造成的跳变；没有另写生产地形方程。湿岩仅限制池沿，宽坡共享60° crease法线，保留硬折；未更换材质或贴图。最终表面修复前后三角位置多重集一致，见[表面回读](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-bank-surface-readback.json)。

以下均为冻结 D callback 下的世界米，根变换为 identity；high/low 包络相同。

| 部件 | min XYZ → max XYZ | low / high 三角形 | 主渲染 draw |
| --- | --- | ---: | ---: |
| sanctuary-front | `[-1.619728,8.802040,-37] → [29.429424,20.855000,-16.280018]` | 20,348 / 27,660 | 1 |
| grove banks | `[-2.236000,2.139613,-23.5] → [19,17.520000,3.5]` | 5,152 / 17,604 | 2 |
| 合计 | `[-2.236000,2.139613,-37] → [29.429424,20.855000,3.5]` | **25,500 / 45,264** | **3** |

属性数组合计 low 3,366,000 bytes / high 5,974,848 bytes；不是 GPU 总内存或设备性能数据。岩面 UV 维持3m/tile。

| 接点/区域 | 实际消费或生成结果 | 验证边界 |
| --- | --- | --- |
| D 顶/中/下轮廓 | y=20.9 / 17.7 /14，原始 ordered XZ rings 直传 | C 顶最大20.855，比 D 顶轮廓低.045；不等于土帽或 A 基座整面已贴合 |
| 下段阶梯 | `[10.9,14.2,-18.2] → [19.5,17.9,-20.3]`，21阶，宽3.2 | 实际三角裁切检查包含两侧各.28身体余量 |
| 上段阶梯 | `[20.5,17.9,-23.8] → [15,22,-28]`，23阶，宽3.2 | 消费 referenceFlightFloor，不把 TreadTop 的.018偏移重复减去 |
| 转台 | D 真实凸四边形，level17.9，身体圆半径.28 | 按精确欧式扩张域检查，不用尖角无限斜接多边形冒充身体域 |
| 桥及岸脊 | 桥标称端 x=.9 /8.1，z=-16，C脊y14.06；东端接 `[10.9,14.06,-18.2]` | 比 D 走面14.2低.14；实际 A 全桥端部嵌合仍待整合验收 |
| 桥孔 | x `[.9,8.1]`，z `[-17.2,-14.8]`，all-Y void | Float32空间容差5µm内无实际面积侵入 |
| 池边13个接点 | y范围约11.204625–11.419689，逐点 XYZ 在 metadata.contacts.poolOutlineRockEdge | 不是 B水面/池床/流体接点验收 |
| 外脚及岸肩脚 | metadata.contacts.buriedOuterFoot / shoulderFeet | 外边界跟随冻结 callback；D土层中间覆盖及闭合接地待验 |

完整接点与两档 metadata 见[实际几何报告](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-geometry-check.json)，不以包围盒代替真实接点。

## 实际回拍与检验

[独立预览源码](/Users/sunmozong/Adonis/src/world3d/reference/nature-landforms-preview.html)使用真实 A 神殿、grove桥、两段阶梯和转台，直接消费冻结 D exports 与真实 referenceTerrainHeight。池面仅是明确的诊断示意；未加载 B 动态水。D 地表开关按 .5m 网格采样原函数；没有新生产土帽。孤立图暴露的外底面本应埋入 D 地表。

固定曝光1.08、sun `[-18,44,15]`、hemi .85、IBL .38；6个固定机位，1280×720截图，WebGL画布1920×1080。high 开阴影、low 关阴影；切档后 floor/ground/water 材质均重新编译阴影路径。机位、目标、FOV和资源计数保存在[13条捕获记录](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-capture-metadata.json)。12张最终图包含6张high、5张low和1张带 D 地表图；另有high→low→high的最终metadata。浏览器warn/error记录为空，见[日志](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-browser-logs.json)。含 A 和阴影的 render.info 不能作为 C 单体预算。

| 部位 | high | low |
| --- | --- | --- |
| 组合 | [全景](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-overview-high.png) | [全景](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-overview-low.png) |
| 前基岩 | [正面](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-sanctuary-front-high.png)、[近看](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-sanctuary-near-high.png)、[侧背](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-sanctuary-side-high.png) | [近看](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-sanctuary-near-low.png)、[侧背](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-sanctuary-side-low.png) |
| 桥岸 | [近看](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-banks-front-high.png)、[侧面](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-banks-side-high.png) | [近看](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-banks-front-low.png)、[侧面](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-banks-side-low.png) |
| 实际 D 地表 | [组合上下文](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-overview-with-D-ground-high.png) | 未单独回拍 |

必要检查结果：

- [实际新几何检查 PASS](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-geometry-check.json)：两档 nonfinite / degenerate / bridgeCrossingFaces 均0；最低阶梯净空 low .139998574m、high .139998667m，Float32容差1e-5m；转台两档 .139999771m。中止与独立几何重复dispose通过，借用材质/maps释放0。
- [正式可选工厂 PASS](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-factory-check.json)：旧 placement 清空以隔离新路径；low成功→注入 terrain 回调失败保留旧模型和registration→high重试成功→重复dispose。4份已提交几何各释放1次，3轮共42张纹理请求/释放均42，借用环境释放0。此项控制纹理回调，不代替PBR回拍。
- [本轮 build PASS](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-build.log)：`tsc --noEmit && vite build`，保留既有大chunk警告；共享源码后续变化不受此日志覆盖。
- [独立审阅](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/final-review.md)未发现确认的P1/P2；未重跑旧304k规则矩阵，未写UI单元测试。节点耗时、浏览器资源计数不是实机FPS或全世界释放证明。

证据目录保留早期 sample-1 /sample-2 /sample-3 的源码与图像，均为历史否决/中间样片，不当作最终放行。两份可重放非UI脚本只校验新增几何与生命周期：

```sh
node /Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/geometry-check.mjs
node /Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/factory-check.mjs
```

脚本使用此机器项目 node_modules 和证据中的 final-sources；输出 `replayed-*` 报告，不修改主源码。最终证据索引及校验和见[manifest](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/nature-landforms-r5/manifest.json)。

## D 后续整合所需验收

D 可选择上述 opt-in 并决定旧岩体撤换、土帽和坡脚覆盖；需要在同版真实地表和 A 建筑中核对顶层接缝、桥端实际嵌入、两段阶梯/转台完整步行及镜头近远遮挡。B 池床、动态水和海线/出口由相应 owner 联调，本小片最大z=3.5，不扩到z18低岸桥。

美术需重新判断前基岩长平面/断层、桥岸宽圆坡和地表覆盖后的整体轮廓。当前工程检查与截图只支持“有界首版可审阅”，不支持“参考级完成”或“世界已走通”。
