# A · 美术与 UI 规范交接

更新时间：2026-10-21。基线 `3240b7c`。状态：第一轮交付完成，接口、规范、真实视觉样板与浏览器验收可消费；待总指挥整合。

## 已稳定的接口

- `src/ui/visualTheme.ts`：`VISUAL_THEME` 和类型 `VisualTheme`，纯数据，只依赖已有 `pixel/palette.ts`；不需要 Phaser/Three/DOM。
- `src/ui/visualTheme.css`：在新宿主添加 `.ag-theme`，其后使用 `ag-*` 类和 `--ag-*` 变量。字体本地加载；英文 Press Start 2P 由已有 `fonts.ts` 提供。
- 完整消费示例、类表、字体/缩放和 3D 材质意图见 `docs/visual-direction.md`。

## B / C / D 接入要点

新大厅/花园/3D 的 DOM 挂在旧 `#ui-root` 外，不继承旧游戏 UI 的 zoom。这套主题使用真实 CSS px；不直接把 48px 触控尺寸套入旧 480×270 坐标。`world3d` 是颜色意图，D 仍需按实际光照与颜色空间校准。

A 本轮不修改 `ui.ts / ui.css / screens.ts / mobile.css / main.ts / package.json`，也不会替 B/C/D 自动导入主题。需要由消费方在所属模块导入 CSS 并负责业务操作、焦点管理、滚动主机和释放。旧屏幕迁移暂留下一轮，见 `docs/art-review.md`。

## 文件责任与当前边界

仓库内仅新增本工作包五个独占文件：本文件、`docs/visual-direction.md`、`docs/art-review.md`、`src/ui/visualTheme.ts`、`src/ui/visualTheme.css`。不修改历史 `tools/playtest.js` 或 `output/`；不提交、推送或部署。独立视觉预览与证据放在本会话的 visualization 工作区，不占用其他团队端口。

## 可直接查看的结果

- 本地样板：[127.0.0.1:5191](http://127.0.0.1:5191/)，仅 loopback、strictPort；保留服务供复核。
- 源码与截图根目录：`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/adonis-art-preview/`。启动命令：`node <该目录>/server.mjs`。这些是本机审查产物，不在生产路由、不写入历史 output。
- 主要证据：`desktop.png`、`portrait-container.png`、`portrait-controls.png`、`landscape-container.png`；旧基线证据 `baseline-home.png / baseline-heroes.png / baseline-codex-offscreen.png`。
- 样板明确标注色稿“非 3D 实机”、容器“非手机真机”，按钮只操作样板状态，不假装进入游戏。

## 已验证与整合边界

- 纯主题严格类型检查（无 DOM lib）通过，打包模块可在 Node 无 document 环境导入；独立样板生产构建通过，26 个 TS/CSS hex token 对齐，关键小字配色对比均超过 4.5。
- Chrome 1488×981 中实际点击、Shift+Tab/Enter、选中反馈、2px 焦点、禁用跳过通过；390/844px 容器无横向溢出、按钮 48px、正文 12px、像素画 1×/2×。没有 UI 单元测试。
- 隔离的 `3240b7c` 主页/选角/图鉴真实打开并操作；图鉴“加成42”键盘移到视野外且列表不滚动已复现。结算和旧手机布局属静态审查，不宣称完成业务或真机验收。
- 已按总指挥提供的大厅/花园截图补充标题字体、金色强调、层级和密度观察。名称统一由 C 处理，A 不改对应文件。
- 全仓 build 在 B/D 模块尚未落齐的时点受跨包缺失/类型错误阻塞；未跨界修复，整合后须由总指挥重新执行。首次全仓 typecheck 与本包独立检查通过，不能替代最终整合构建。
- 减弱动效/强制色规则已提供，系统级模拟与手机真机未验收。旧页面未迁移；未做发布或线上验证。

## 下一轮请求

先由总指挥移交移动阅读与图鉴相关文件，再实施迁移；A 暂不接手 `ui.ts / screens.ts / ui.css / mobile.css`。下一轮优先字体/触控与图鉴可达性，不扩充未授权模式或装饰资产。

## 后续切片 1：图鉴键盘选中格可见性（2026-10-21）

总指挥在接收第一轮后，单独移交 `src/ui/screens.ts` 的 **openCodex 段**用于本切片；上文的旧共享文件禁改边界仅在此范围内解除。本切片已完成，待总指挥整合，不提交/推送。

### 代码范围

- 唯一运行时代码修改：`src/ui/screens.ts` 的 `openCodex`，新增 `revealCell()`、独立 grid rAF、网格 ResizeObserver 观察与关闭取消；选中变化与尺寸变化均触发。
- 只写 `.cx-grid.scrollTop / scrollLeft`，不使用会滚动祖先的 scrollIntoView；没有增加详情滚动赋值，也没有改变 `revealTab()`、旧详情 ResizeObserver/scroll 逻辑或已有清理。
- 使用 DOMRect 差值除以实际 CSS zoom，再用 computed border-box 浮点尺寸减边框计算可视区；避开整数 clientHeight 在手机横屏带来的约半个屏幕像素边缘裁切。
- 补查鼠标/键盘混用发现：自动滚动让新格子移到静止鼠标下，旧 mouseenter 会把键盘选中项从 24 抢回 6。格子的悬停监听改为 mousemove，只在实际鼠标移动时重选；click、触控与键盘保留。此关联调整仍仅在 openCodex 内。
- 本切片 **零 CSS 修改**；没有改 ui.ts、主线/大厅/花园/3D 业务或历史验收产物，没有 UI 单元测试。

### 独立浏览器验收

独立 origin：`http://127.0.0.1:5192/`，以 `3240b7c` 隔离快照 **只替换最终 screens.ts**。使用独立 Vite 缓存和标签页级 CDP 模拟，没有访问其他工作包 origin、写它们的存档或操作它们的视口。Chrome 桌面 1280×800；手机模拟 390×844 / 844×390（不是手机真机）。

| 项目 | 结果 |
| --- | --- |
| 加成 42 项，三种视口逐格首项 → 末项 → 首项 | 各 41 次向右、41 次向左；123 个前向和 123 个反向索引顺序全部匹配。 |
| 原问题路径：连续向下 6 次 | 第 37 项（索引 36）可见，网格自行滚动；不再只有详情变化。 |
| 269 个最终补丁观测点 | 网格选中格均位于网格内（测量容差 0.1 屏幕 px）；overlay/frame/fbody/cx-main 和页面滚动均为 0。 |
| Q/E 分类 | 三种视口切换正常；手机横屏额外跨越全部 14 个分类并返回，原分类条 reveal 逻辑保持。 |
| 尺寸变化 | 第 42 项从竖屏到横屏保持选中和可见；网格 scrollTop 随可视区重新调整。 |
| 鼠标 / 键盘混用 | 点击首格后鼠标留在网格内，41 次向右与 41 次反向均顺序到达；自动滚动不再抢回选中项。实际鼠标移动仍能切换到第 2 / 第 1 格。 |
| 详情独立滚动 | 最终版本手动滚动后随网格尺寸变化保持 13.5 → 13.5 逻辑 px，不归零；内容变短时仍按原逻辑钳制到合法范围。 |
| 关闭 / 重开 | Esc 后 codex DOM 为 0；重新打开与快速选中后关闭再打开均从首项开始，无控制台 error。 |
| 工程 / 复核 | 全仓 `npm run typecheck`、限定文件 `git diff --check` 通过；独立代码复核通过。没有重复全主线或全仓生产构建。 |

证据根目录：

`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/codex-navigation/`

- `browser-observations.json`：包含最终 mousemove 修复的 269 个状态的索引、几何、网格/详情/祖先滚动、视口与汇总，以及分类切换记录。
- `mixed-pointer-keyboard-before.json` 保留发现静止鼠标抢回选中的失败证据；`mixed-pointer-keyboard.json` 为最终版本从 1 到 41 的顺序、几何与滚动证据。
- 最终版本截图：`desktop-last.png`、`portrait-last.png`、`landscape-last.png`、`landscape-resize-last.png`、`landscape-category-last.png`、`landscape-final.png`。

![手机横屏：末项选中且可见](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/codex-navigation/landscape-final.png)

边界：算法遵循当前 LTR、border-box、隐藏滚动条且无旋转变换的图鉴布局。原分类条的 offsetLeft 整数取整在非整数 zoom 下仍可能裁掉不足 1 个屏幕像素的装饰边，分类名称可见；此逻辑按本次要求保留。未做手机真机或 B/C/D 整合页面验证。验收后清除本标签页设备覆盖并关闭，5192 快照服务停止；第一轮 5191 视觉样板不受影响。
