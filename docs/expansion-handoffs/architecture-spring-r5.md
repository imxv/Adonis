# A · r5 高处圣泉龛交接

2026-10-21。新增紧凑石灰岩泉龛，已接入建筑工厂；只制作 D 台面以上的龛体、蓝金雕饰、铜出水口与贯通铜喉。神庙、桥和 r5 石阶保持冻结。当前是实体资产样片与静态接入验证，尚未作参考美术或整合世界验收。

预览：[5207 圣泉龛实验页](http://127.0.0.1:5207/src/world3d/reference/architecture-spring-preview.html)。证据目录：`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-shrine-r5/`。

## 同源支承、变换与出口

`architecture-spring-layout.ts` 直接读取 `landform-layout.ts/REFERENCE_SPRING_SHRINE`，不另存台座或水路坐标。D 的 frame origin 是 `[23,18,-25]`，yaw `0.39922076957525304`，支承宽 1.72m、长 3.473110997m。四个 world 支承角反变换为 local X±0.86、Z 0…3.473110997；允许占用域另受 `access.facadeLocalZRange` 限制，后侧 Z 0…1.05m 保持留空。

龛体设计尺寸为宽 1.64m、高 2.8m、深 0.43m，脚部 local Z 1.998921963…2.428921963，直接落在 world Y18 的支承面。低墙槛属于龛墙，不新增台座、行走面或水盆。D 的 carrier、basin、rill、lip 和水体均由 D 保有，本切片未改动这些源文件。

出口中心严格使用 D 的 world `[24.6,20.3,-22.8]`，出流轴为 world `+Z`。其 local 中心为 `[0.619041546,2.3,2.648921963]`，local 轴为 `[-0.388700505,0,0.921364161]`，因此未使用载体 local +Z 代替出流方向。口内径 0.30m、铜壁 0.022m、前段直孔 0.15m；后段偏移空心铜喉穿过实际切开的右侧拱槽，以开孔安装座与龛体连接。

builder 只产 local 几何。adapter 对 root 施加一次 D origin/yaw，工厂分支直接挂接后 `continue`，跳过通用 placement 变换；`grove.spring.spout` 返回 `water.sacred-spring.points[0]` 的原 tuple。工厂同时拒绝旧 6×6×4 placement、异常 yaw 或水源不匹配，防止静默装错。

## 实拍与视觉边界

最终保存 `after-high-{front,side,mouth,rear}.png`，低档只补 `after-low-side.png`。五张均 1488×1037；浏览器截图实际编码为 JPEG，沿用 `.png` 证据文件名。`browser-observations.json` 记录四张 high、一次 low 及恢复 high 共六条实际 DOM 状态；high 画布 1607×1120，low 1104×769。曝光 1、太阳方向 `[-0.580116,0.740148,0.340068]`、强度 2.4、IBL 0.35；high 开 GTAO，low 关闭。控制台 error/warn 为空。

黄色线框是同版 D 支承域，青色线框是后侧留空域。实验页只有实际泉龛与诊断地面，未渲染 D 台座、水盆、水流或整合世界；线框不能当作真实台座实拍。

最终正侧面能辨认实心龛框、退入的拱腔、背板和铜口连接，后视图可见留空域。首次样片的拱顶/横带白闪片已修；最终又使横石前退18mm、后退12mm、左右各退6mm，背板顶低于蓝带底2mm，侧面细网格闪片在最终样片中已不可见。铜座只圆化外角，水口与空腔未移动。

**保留的美术差距：铜口仍偏粗重机械，近景分面与大片铜锈明显；石材磨损、沉积和雕饰层次仍较参考均匀简化。本次不认定参考美术通过。**

## 成本与有界验证

| 项目 | high | low |
| --- | ---: | ---: |
| 泉龛三角 / 合批网格 | 6,648 / 5 | 4,016 / 5 |
| 发出几何属性与索引字节 | 659,024B | 453,056B |
| 实验页全 pass 三角 | 26,601 | 8,035 |
| 实验页全 pass calls | 28–29 | 14 |
| 实验页恢复后 geometry / texture 计数 | 21 / 35 | 21 / 31 |

未新增生产贴图或材质，借用既有原创 PBR；5 个网格分别合批既有石灰岩、象牙石、蓝、金和铜。实验页全 pass 数字包含地面、影子与后处理，不是生产世界的增量或总预算。CPU 构建峰值、驱动 VRAM 与真机 FPS 未测。

`builder-geometry-check.json` 使用实际 adapter 尺寸：两档 finite、退化、平均与单顶点反法线、落脚越界均为0；每档73条出口射线验证前0.14m空孔，25条上游腔射线贯通，四方向48条横带分离射线最小间距约6mm。最终5个 geometry 各释放一次，借用材质释放0次。

`factory-check.json` 的25项检查通过：同源支承反变换、一次 world 变换、精确水源 anchor、出口坐标误差0、轴误差约5.55e-17、异常输入拒绝，以及 high→low 替换和最终释放。该检查使用真实几何与模拟 PBR loader，仅验证新泉龛，不运行渲染器、水模拟、旧完整生命周期套件或 UI 单元测试。实验页使用真实既有 PBR 加载器。`npm run typecheck` 通过；增量只读代码复核无 P1/P2。

`final-source-hashes.json` 保存最终 helper/adapter/factory/preview 哈希、12个冻结源对照、五张图片尺寸与哈希。helper SHA 为 `0e9efe82d625ad5d4f59aed0f0786cc51340b8ac2046d178f83e03f8a1c8dcc7`，与 builder/factory 报告相同。D 在截图期间继续编辑其 landform 模块，故整个模块 SHA 发生变化；`REFERENCE_SPRING_SHRINE` 的完整 payload 与全部六条浏览器状态逐项相等，canonical SHA 为 `f00cf0aa080959442def153fd422034748039f02b9e4309c6fd3ce9198051391`，原样另存 `authority-at-capture.json`。

## 文件与接入

- `architecture-spring-shrine.ts`：显式参数、纯 local 龛体/铜喉 builder，仅持有返回几何。
- `architecture-spring-layout.ts`：D authority 适配、支承域与水源校验、一次 world 变换。
- `architecture.ts`：新增 `spring-shrine` 分支与支持类型声明；其余工厂分支逐行保持，差异保存于 `factory-only-shrine.diff`。
- `architecture-spring-preview.ts/html`：DEV 实体实验页，完整释放模型、材质、诊断线、后处理和环境资源。

接下来由根整合页检查真实 D 台座、水路接缝、遮挡与主世界成本；本资产交接未代替这些验收，未提交或发布。
