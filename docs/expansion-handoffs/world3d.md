# D · 希腊神话 3D 交接

更新时间：2026-10-21。**当前状态：用户已直接否定现有3D外观；旧候选视觉验收全部撤回，暂停此版本发布。保留已验证功能，不回退。** 三张固定参考已实看，新工厂契约和初版布局已确定，准备计划见 [参考驱动重建计划](world3d-reference-plan.md)。未提交、未推送、未部署。

**第二轮历史过程（最新用户否定优先，以下接受记录已失效）**：仅重做出生海岸到圣林，海湾地形/石灰岩岬角/程序海水、独立窄叶橄榄树与成簇地被、近景爱奥尼门廊/陶器/石刻/瓷片星盘、山门石缝/蓝金浅龛和三盘庭院铺装均已接入；已真实行走出生海岸到圣林。根已接受近景古迹/圣泉/目的地构图；按反馈补做地表过渡、岩坡去横纹和统一调色后，已按原机位覆盖回拍，待最后复核。下文 `*-calibrated.png` 和旧性能是第一轮历史证据，不能代表第二轮已被接受。没有扩大地图或增加新系统。

## 第二轮旧候选（已否定，仅留历史）

- [出生海岸](../../src/world3d/evidence/coast-v2-review.png)：实际出生点 `(-9,42)`，中档，1280×720 浏览器截图。
- [橄榄圣林](../../src/world3d/evidence/grove-v2-review.png)：从出生点用 WASD/Shift 实走至 `(-10.62,-54.20)`，中档，同尺寸；没有瞬移或修改世界状态。
- 两图均为实际 WebGL 场景，未将大厅参考图贴入场景。地表已用低频砂/湿岸/草地/裸岩色区和路径软边过渡，暖石材与冷接触色已统一；远坡仍偏空旷、部分布局偏规则，仍待最后美术复核。
- `artLayer.ts` 统一新增层的质量切换/逐帧更新/资源释放接口；`coastalLandscape.ts`、`botanical.ts`、`antiquities.ts`、`antiqueTextures.ts` 各自拥有资源。`environment.ts` 负责地形与碰撞接入，保留五 ID、三盘目标与山门机制。
- 第二轮 `npm run typecheck` / `npm run build` 通过；世界独立动态块 `index-CwWf7hoe.js` **673.77 KB / gzip 186.82 KB**。现有 Phaser 大包仍有 >2000 KB 提醒。
- 非 UI 验证：5 工厂共 23 个第 N 张 Canvas 故障点均回收已创建资源；正常连续 dispose 两次，第二次新增释放为 0。113 份唯一几何无非有限值/索引越界。0.5 米通行图含新岬角碰撞，五发现和三盘均可达，神庙解锁前不可达、解锁后可达。这些不是 GPU 长时泄漏测量。
- 桌面中档最终同机位回拍：海岸 3,302,262 triangles / 302 draw calls / 119 FPS；圣林 2,726,914 / 238 / 120 FPS。均为 106 geometries / 14 textures，最终浏览器 CSS/渲染 1280×720（恢复设备模拟后 DPR 1）；此前中档 DPR 2 时渲染 1600×900，不能混为同一像素预算。几何量明显高于首轮，不能沿用首轮轻量预算。详细当前证据见 `src/world3d/evidence/visual-v2.json`。

## 手机尺寸 low / auto 实测与降级

Chromium IAB 模拟 **390×844 CSS / DPR 3 / 粗指针**，实际画布 **312×675**，像素比 **0.8**。`auto` 实际选中 `low`，不是仅根据源码推测。

| 选项 / 位置 | triangles | draw calls | FPS短样本 | geometries / textures |
| --- | ---: | ---: | ---: | ---: |
| 改前 low 海岸 | 2,103,958 | 135 | 118.0 | 76 / 10 |
| 最终 low 海岸 | 659,076 | 135 | 120.5 | 75 / 10 |
| 最终 low 圣林 | 514,909 | 82 | 115.8 | 84 / 10 |
| 最终 auto 海岸（实际 low） | 659,076 | 135 | 113.6 | 75 / 10 |
| 最终 auto 圣林（实际 low） | 514,845 | 81 | 118.3 | 84 / 10 |

圣林两次样本位置差约 0.02 米，读数相差 64 面 / 1 draw。以上均是同一台 Apple M5 Pro 的浏览器设备模拟，**不是物理手机性能或帧率保证**；FPS不是持续基准。

- 新植被理论总面从 **2,189,594 降到 439,952（20.1%）**，保留完整枝干 128,518，叶/地被 311,434；实例从 141,782 降到 47,783。低档用少量更宽叶与低面花草，按完整原序列分层抽样，避免只保留前几棵树。海岸实际总面比改前 low 减少 **68.7%**。
- 中高档数据保持原样；非 UI 核验 20 轮切档完整恢复，实际手机尺寸设置 low→medium→low 也恢复渲染尺寸和细节。实例 Attribute 对象复用，不在每次切档重新分配 GPU buffer。
- 古迹 low 隐藏柱头小叶饰/密齿饰/瓦缝细管/小刻度/细金线/池沿小浮雕/铜藤。全组自身理论面 212,408→176,228，批次 40→29；主要柱体、涡卷、器皿、壁画、庭院铺装和门墙识别形保留。低档关闭阴影与云带，保留地面冷接触色和路径软边。
- 降级减少绘制量；完整源几何和中高档 CPU 快照仍驻留以便恢复，未声称是远区卸载或全量内存优化。手机长时性能仍待真机。
- 最后 auto 同一页面退出后 `.gw-root` / canvas 均为 **0**；浏览器最终两机位与 low/auto 均无 shader warning/error。新增软边支路的合批保持原 `castShadow=false`，避免投射不透明硬边阴影。

手机证据：`coast-v2-low-phone.png`、`grove-v2-low-phone.png`、`grove-v2-auto-phone.png`。详细字段保存在 `visual-v2.json`。

## B / 总指挥现在可消费

- 接口与生命周期完整约定见 `docs/world3d.md`。异步 `mountGreekWorld`，发现只传稳定字符串 ID，支持可选 AbortSignal。入口只允许动态导入。
- 退出含初始化阶段取消；`onExit` 先释放再通知。调用方在进入前暂停 Phaser / 输入 / Tone，在退出/失败时恢复。
- 建议未缩放独立容器 `position:fixed;inset:0;z-index:...`，不要放进 `#ui-root`。
- 依赖由 D 统一修改；其他文件所有者无需加依赖。D 不修改大厅、main、GameScene 或存档。

## 文件责任

`src/world3d/**`、`public/world3d/**`、`package.json`、`package-lock.json`、`docs/world3d.md`、本文件。保留既有 `tools/playtest.js` 与 `output/`。

## 第一轮功能验收与边界（历史证据）

- `npm run build` / `npm run typecheck` 已通过；Three 与首区是约 600 KB / gzip 160 KB 的独立动态 JS 块，未被大厅静态引入。固定 `three 0.186.1` / `@types/three 0.186.0`，npm 安装审计无漏洞。现有 Phaser 主包仍有超过 2000 KB 的构建提醒，属于共享工程现状。
- 在 MacBook Pro / Apple M5 Pro / 48 GB、Codex IAB（Chromium）1280×720 实际 WASD 行走：出生海岸 → 星盘 → 潮汐壁画 → 老橄榄树碑文 → 三盘 → 圣泉 → 山门 → 神庙内殿 → 后侧露台。未使用瞬移或修改谜题状态。
- 五 ID 全触发：`greek.coast.navigator`、`greek.coast.tide-mural`、`greek.grove.olive-oath`、`greek.grove.spring-restored`、`greek.temple.first-light`。重复 E 阅读同一发现不重复报告，画册可重读。
- 按壁画把三盘旋到 `[0,2,3]`（北/南/西）后，圣泉水与金色流线出现，门扇动画开启，实际通过 `z=-102`。新挂载未解谜时一直快走被挡在 `z=-100.09`；已发现 ID 不会直接绕过谜题。
- 同一页面连续挂载、退出三次，最终 `.gw-root` / canvas 都为 0。加载中 AbortSignal 取消与 WebGL2 初始化故障注入均看到无残留画布 0；失败后恢复 context API 可重新进入。
- IAB 390×844 竖屏 / 844×390 横屏：低档摇杆、拖动、交互按钮、阅读与滚动可用。另以 Chrome CDP 原生 `touchStart/touchMove/touchEnd` 实测单指摇杆将 z 从 40 移到 33.52；双指同时移动和转视角后位置 `(1.96,29.88)`、罗盘从北变东北。属于浏览器设备模拟，**没有物理手机性能/手感验证**。
- 设置已检查低/中/高切换、灵敏度 0.4 / 2.5 边界、Esc 关闭、休憩卡进入画册、已发现条目重读。没有写 UI 单元测试。
- 桌面请求锁鼠只在开始/继续按钮的同步手势中发生；Esc、失焦、隐藏与外部 pause 都暂停/释放；Promise 与旧 void API 的晚到授权已做请求失效和收尾防护，并经过只读代码审查。**自动化 IAB / Chrome 文档的锁鼠请求实际返回 `The root document of this element is not valid for pointer lock`，未声称真实锁定成功。** 拖动回退已可玩，仍需总指挥在真正活动的桌面页面点一次开始并验证 Esc。[Chromium 官方测试](https://chromium.googlesource.com/chromium/src/+/e51867a9103bd7ece599c990d4d12072c23aee0e/content/browser/prerender/prerender_browsertest.cc) 也将该错误用于非聚焦文档，故目前推断为自动化页面上下文限制，未把推断当成实机结论。旧 void 实现兼容性依据 [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock)。

## 第一轮截图和性能（历史证据）

证据在 `src/world3d/evidence/`。`grove-before-puzzle.png`、`open-mountain-pass.png`、`temple-completed.png`、`portrait-low-interaction.png`、`landscape-low-sea.png`、`chrome-multitouch.png` 是最后材质校准前的真实游玩图；它们证明功能过程，不代表最终色彩。

校准前观测：中档圣林约 120 FPS / 73 draw calls / 110,998 triangles，神庙约 120 FPS / 19 calls / 81,786 triangles；高档神庙约 120 FPS / 102 calls / 188,300 triangles。低档竖屏渲染 312×675、约 119–120 FPS，在同一桌面 GPU 上模拟所得，不能当成手机 30 FPS 保证。最后校准为中档启用 1024 阴影，需以下新增测量为准。

**第一轮最后新增证据**：`coast-calibrated.png` / `grove-calibrated.png`；最后材质和光照下再次从海岸真实走到圣林，`(x=3.20,z=-59.51)` 中档实测约 **120 FPS / 148 draw calls / 186,674 triangles / 54 geometries / 9 textures，渲染 1600×900**（显示视口 1280×720）。已经消除最初中档 1024 阴影在斜地表出现的条纹自遮挡。详细机器/指标/范围见 `src/world3d/evidence/acceptance.json`。最终构建 `index-DAqlI_Me.js` 为 600.64 KB / gzip 160.39 KB。

第二轮稳定候选可复看 `http://127.0.0.1:5182/src/world3d/preview.html`（无 HMR；源码更新后须重启该服务）。常规开发服务 `http://127.0.0.1:5180/src/world3d/preview.html`；仅开发验收入口，没有手动部署。截图均为实际渲染，不是概念效果图。

## 已知边界与下一轮

- 首区是可完成的探索小循环，不是已完成的庞大开放世界。约 220 米主路径的纯行走可在数分钟内走完；自然阅读/探索的 10–15 分钟目标尚未用独立玩家计时验证，不冒充已达标。
- 第一轮美术已被总指挥退回。第二轮已重做海湾/植被/近景古迹；远坡体量和规则布局仍需视觉复核，不将本轮称为最终美术品质。
- 同次挂载谜题进度不存档，重进需要重新转盘；五个收藏是否已记录由 B 传入 `discoveredIds`。`onDiscover` 不承诺库存已永久写入。
- 尚无物理手机、内存长时曲线、慢网真实部署、大厅⇄3D⇄主线音频恢复的整体验收；这些需总指挥在集成版本完成。没有改主线存档、main、GameScene、hub 或既有 tools/playtest.js/output。
