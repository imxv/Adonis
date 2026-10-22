# 像素厨房 v2 交接

2026-10-22。厨房已改成可走动的程序像素房间，保留三配方、真实材料、返种、容量与单槽行囊。源码目录已冻结，组合 SHA-256：`cd9eb36c7e2273eb6d8e99b1f8841b2644c95de95b2356f42d46d627ff93f201`。

## 接入与文件

原入口不变：

```ts
import { mountKitchen } from './sidegames/kitchen';
const kitchen = mountKitchen({ container, onExit });
kitchen.dispose();
```

调用方仍负责暂停主游戏，并提供有尺寸、未被游戏画布缩放的 HTML 容器。返回会先 dispose 再 onExit；直接 dispose 不调用 onExit，重复调用安全。无需改 hub/controller/main/meta。

| 文件 | 职责 |
| --- | --- |
| [index.ts](/Users/sunmozong/Adonis/src/sidegames/kitchen/index.ts) | 唯一交易接入、输入/相机/单 RAF、面板焦点、存档订阅和销毁 |
| [pixel-contract.ts](/Users/sunmozong/Adonis/src/sidegames/kitchen/pixel-contract.ts) | 厨房唯一世界布局、工作台命中/走到点、绘景及视图数据合同 |
| [pixel-controls.ts](/Users/sunmozong/Adonis/src/sidegames/kitchen/pixel-controls.ts) | 20world 格 A*、可见直线路径简化、碰撞/滑动与一次到站通知 |
| [pixel-renderer.ts](/Users/sunmozong/Adonis/src/sidegames/kitchen/pixel-renderer.ts) | 480×320 逻辑像素绘制到 960×640 世界；静态缓存、真实角色、局部动画 |
| [view.ts](/Users/sunmozong/Adonis/src/sidegames/kitchen/view.ts)、[kitchen.css](/Users/sunmozong/Adonis/src/sidegames/kitchen/kitchen.css) | 紧凑 HUD 与交互时才打开的游戏小面板，局部样式及响应式布局 |

旧 `art.ts`、`tsconfig.check.json` 保留；新场景与视图不引用旧整页插图组件。全部八个目录文件的指纹见 [source-manifest.json](/Users/sunmozong/.codex/visualizations/2026/10/22/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/kitchen-pixel-v2/source-manifest.json)。主要入口 SHA-256：`2d0fca09d4bed285b077cc6f3ec40554615a9a5e2dc66fe7f6f856ce42aa0e40`；renderer：`a292fb579ea76ec548873389b13f7f44b6f7c7d07c1db43db54e11c63dfffc8c`。

## 场景与操作

主画面是真实 Canvas 房间：拱窗海景与藤叶、左侧食材架、后方铜烟罩/锅/暖火灶台、菜谱台、装包台、石地面及出口。没有整张背景图片或网页卡片铺满主画面；静态结构缓存一次，角色直接复用 `ADONIS_A / ADONIS_B` 与 `Grid`，物件按共享 y+height 在角色前后排序。

WASD/方向键走动；点击地面走到，点击工作台或四个 HUD 快捷入口会自动寻路并接近对应台面。靠近可用 F/Enter 或可见交互按钮。手动移动会取消自动路线。菜谱台选择配方，选择不扣料，“去灶台”走到灶台；只有灶台面板的明确下锅按钮提交料理。食材架只查看库存；行囊台装入/移出单份补给。

`Escape` 每次都 preventDefault/stopImmediatePropagation，但仅 `!event.repeat` 执行：先关闭面板，再按一次才退出厨房。Enter/Space/F repeat 也被阻止，避免成功关闭面板后长按继续触发操作。面板有焦点限制，canvas/stage inert；面板关闭恢复 canvas 焦点。

成功下锅后面板收起，灶台出现约 2.4 秒蒸汽、闪光和成品盘，HUD 显示真实所得。动画只是读取 API 成功后的视觉状态，没有交易回调、二次领取或隐藏计时门槛。减少动态模式保留静态成功反馈，停止循环变化。

renderer 不拥有 RAF、事件、存档或动作。index 只有一个调度循环；blur/hidden/pointercancel 清按键/移动/指针，hidden 停止 RAF，恢复后重新启动。dispose 取消 RAF、AbortController 监听、ResizeObserver、订阅和所有自有像素缓存，移除根 DOM 并释放可见 canvas backing store。本模块没有新音频资源。

## 真实经济与存储

三配方仍读取 `RECIPES / RECIPE_IDS / FISH / PLANTS / SUPPLIES` 与权威容量，使用 `getRecipeFailure`。需求/已有、材料来源、成品效果、成品容量和返种容量在面板明确展示。

- `olive-skewer`：银鳞沙丁 1 + 橄榄原料 1 → 橄榄露 1 + 橄榄种子 1。
- `laurel-broth`：珊纹鲷 1 + 月桂原料 1 → 月桂结 1 + 月桂种子 1。
- `iris-stew`：金尾鲻 1 + 鸢尾原料 1 → 鸢尾香 1 + 鸢尾种子 1。

每次明确下锅仅生成一次 `createLifeActionId()`，同步调用 `cookRecipe(recipeId, actionId)`。只有 `applied` 才显示出锅动画；duplicate 不再次扣料/发奖。异常不自动重试。材料不足、成品/返种/料理记录容量不足均消费权威 API 的失败结果，不新增失败扣料。

行囊继续使用 `packSupply(id/null)`，一个槽位，装入/移出不消耗成品，确认新冒险时才消耗一份。战斗中的实际补给生效仍由已有 run/meta 流程负责，本轮未改动。

`busy/unsupported` 禁用下锅和装包，仍能查看/返回；`memory` 顶栏及成功消息明确本页未保存、重载/关闭可能丢失，不声称已持久化。warning 由真实 API 直接展示。动态文本统一转义，没有页面自建存储或直接写 profile。

## 有界实际验收

交易验收使用独立 [5314 预览](http://127.0.0.1:5314/@fs/private/tmp/adonis-kitchen-pixel-v2-20261022/preview.html?kitchen=1)。响应式 UI 检查另用 5315，已关闭该页及服务。没有打开、改写或操作用户的 5291 tab/origin。

证据目录：[kitchen-pixel-v2](/Users/sunmozong/.codex/visualizations/2026/10/22/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/kitchen-pixel-v2)。[acceptance-audit.json](/Users/sunmozong/.codex/visualizations/2026/10/22/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/kitchen-pixel-v2/acceptance-audit.json) 对已录证据回读通过 19 项一致性检查；同目录 source-snapshot 保存冻结厨房源码、私有 QA 入口及配置副本。

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| 桌面实际场景 | 房间/真实角色/火/锅/五站/紧凑 HUD 可见，初始没有配方网页卡片 | `first-desktop.jpg`、`final-desktop.jpg` |
| 灶台走近 | 快捷入口让角色从出生点走到灶台并打开交互面板 | `ready-to-cook.jpg`、实际浏览器记录 |
| 材料不足 | 明确下锅失败，完整 profile 与初始一致 | `initial-state.json`、`insufficient.json`、`insufficient-panel.jpg` |
| 长按 Escape | 原生按住 1000ms 后 panel=0、roots=1、exits=0，只关闭一层；再按一次才退出 | `held-escape.json` |
| 真实材料夹具 | 9 次 applied 权威交易：播种/有效结算/收获、已签发钓鱼尝试及终结，得到银鳞沙丁 1、橄榄原料 1 | `prepared-real-api.json` |
| 原生长按下锅 | 按住 Return 1000ms，仅新增 1 条唯一料理记录；鱼 1→0、原料 1→0、橄榄露 0→1、橄榄种子 2→3，storage=saved | `cooked-held-enter.json` |
| 场景成功反馈 | 面板收起，真实交易后出现蒸汽和成品盘 | `cooked-steam-scene.jpg` |
| 指针命中与装包 | 点击装包台，自动走到并打开单槽面板；装入橄榄露仅改变 packedSupply，成品仍为 1 | `packed.json`、`packed-panel.jpg` |
| 重载持久化 | 完整 profile 与装包后相同，料理记录 1、橄榄露 1、packedSupply=olive-draught | `reloaded.json` |
| 三次返回清理 | 每次退出 roots/canvases=0；重入均为 1；销毁后额外 Escape 不增加退出计数；profile 不变、errors=[] | `return-cycles.json` |
| 390×844 | 文档宽 390，首屏角色完整；面板 372×609.8、在屏内；所有可见按钮至少 44px | `ui-portrait-scene.jpg/.json`、`ui-portrait-modal.jpg/.json` |
| 844×390 | 文档宽 844，面板 640×374、y=8；body clientHeight=207/scrollHeight=378，原生滚动 scrollTop=171，下锅按钮仍可见 | `ui-landscape-modal-scroll.jpg`、`ui-landscape-modal.json` |
| 触控区域分离 | Canvas touch-action=none；打开面板时 stage inert，面板 body touch-action=pan-y | `ui-portrait-modal.json` |
| 浏览器日志 | 交易页最终 warning/error=[]；所有 QA 记录无页面错误 | `browser-warnings-errors.json` |

材料夹具调用真实公开 API，没有直写存档或 mock 发奖；它不是玩家自然完成冒险/花园/钓鱼的全链路。没有重跑先前全部容量/锁/存储额度矩阵；这些边界本轮静态核对真实服务和 UI 处理。也没有重新实际烹饪另外两配方，三份仍消费同一目录/API 分支。

手机证据为 Chrome 390×844 / 844×390 视口、原生指针/键盘/滚轮及尺寸检查；实体手机和成功的浏览器 touch-event dispatch 未验证，不将它们称为真机触控通过。

根另在 5292 整合生产快照亲眼确认场景方向、灶台命中/走近、材料不足展示，以及原生长按 Escape 1200ms 只收面板、再次按下回大厅。此处记录根的复核报告，不代替根最后对 5291 的同源更新验收。

## 检查与范围

最终 `./node_modules/.bin/tsc -p src/sidegames/kitchen/tsconfig.check.json --noEmit` exit 0。独立只读审查未发现剩余阻断；提出的 Escape repeat P2 已修正并实际验证。view 的动态文本转义、modal inert/滚动、renderer 缓存/前后排序、路径碰撞和交易触发已核对。没有 UI 单元测试。

本轮仅编辑厨房目录及本文档；委托由 C、钓鱼由 D 负责。未修改已冻结 garden/gallery、meta、controller、主线、依赖、历史 tools/playtest.js/output 或 3D 文件；没有提交、推送或部署。
