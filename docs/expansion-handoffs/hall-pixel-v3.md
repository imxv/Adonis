# 程序像素大厅 v3 交接

六个大厅源码文件已冻结，组合 SHA-256：`8454daeabbd123c0685db882344583b6493fdfbad32cd1f11df75dfea7ddba36`。根已查看最终桌面、竖屏实景，视觉首版收敛；后续独立干净预览由根验收。没有提交、推送或部署。

## 实现与文件

大厅以 `public/hub/hall-v2.png` 为构图参考，运行绘制不加载或依赖该整张图片，也没有降采样图片或像素滤镜。新增内容均为 Canvas 整数像素簇、扫描线多边形/椭圆、像素线与固定空间 hash。

| 文件 | 职责 | 冻结 SHA-256 |
| --- | --- | --- |
| [gallery.ts](/Users/sunmozong/Adonis/src/hub/gallery.ts) | 接入 renderer，保留角色、导航及生命周期 | `03fbb1bf8d5590397eb39457d492bd167b1a667bb579de2a67add7f1c5cafcbf` |
| [gallery.css](/Users/sunmozong/Adonis/src/hub/gallery.css) | 紧凑像素 HUD、横竖屏、44px 控件 | `1ed5205a54f9bc665df6affc0c4022d473789a3a0c2029c1a8594104658c8c5c` |
| [gallery-pixel-renderer.ts](/Users/sunmozong/Adonis/src/hub/gallery-pixel-renderer.ts) | 房间建筑、月窗/星盘、两层缓存、局部动画、修复展架 | `1f2da4bab1c57658342e29b05627631ecbf0db288121b8691ff5cf3901017c0d` |
| [gallery-pixel-paintings.ts](/Users/sunmozong/Adonis/src/hub/gallery-pixel-paintings.ts) | 红月废墟/蓝海神庙内景、多层雕花金框和冠饰 | `573cd6607b7bed736f25613529d44546b05f494236889f69590e6f123e693834` |
| [gallery-pixel-floor.ts](/Users/sunmozong/Adonis/src/hub/gallery-pixel-floor.ts) | 两级台阶、透视错缝地砖、回纹、月桂罗盘马赛克、离散反光 | `ab49f34131ad7442357c340734ed45e2bb09b441d4809ba75cf03669dc2b1bb9` |
| [gallery-pixel-decor.ts](/Users/sunmozong/Adonis/src/hub/gallery-pixel-decor.ts) | 左侧水池花园/陶罐、右侧古物书柜/天球仪、前景植栽 | `25ef3af8f990b64d7666f035feb223b7d0df62e8b773263f7c3fefafbf66d570` |

内部画布为 836×471，外部世界保持 1672×941。房间后景和透明前景各缓存一次，均关闭图像平滑；临时月窗绘制画布用后释放。结构不随帧重新生成，动态只叠绘灯焰、水纹、星盘小点及少量微光。静态两层像素 backing store 约 3 MiB，另有小型角色、标签、修复展架缓存；没有加载新位图资源。

绘制顺序为：静态后景及局部光点 → 修复展架 → 真实 `ADONIS_A` / `ADONIS_B` 像素精灵 → 前景柱脚/植栽 → 可读入口标签。角色没有烘焙进房间。中央圣所包含高拱月窗、远山海面、金色星盘、翼像及祭坛；柱体有明暗面、凹槽、柱头、接缝与厚底座。

有界光影修整已完成：火盆旁柱面与金框暖亮面、三档短段琥珀反光、中央冷蓝月光带、少量冷亮马赛克，以及柱础/台阶接触阴影。所有结构和光面在静态缓存内完成，没有平滑渐变或整图调色。

## 保留的合同和行为

`mountGallery(options): GalleryHandle` 的 Options、Handle、`GalleryState` 与全部 `GalleryAction` 保留。动作仍为 `adventure / continue / garden / world3d / collection / fishing / kitchen / commissions / repair`。

`GalleryProfile` 仍接受 `fragments / discoveries / supply / warning / fishCount`，以及 `repair { id, name, completed, costLabel, disabledReason }`。UI 使用 textContent 展示外部信息，renderer 不持有存档、action、事件或 RAF。

`DESTINATIONS`、世界尺寸、`floorPoint`、走到点、靠近范围、标签位置和指针相机换算均沿用原值。两幅画框分别位于源像素约 x188..324 / x512..650，和原世界入口命中区对应。没有只移动画面而遗留命中坐标。

现有单 RAF、暂停/恢复、inert、visibility/blur 清输入、ResizeObserver、AbortController 和 dispose 清理保留。dispose 会释放 renderer 两个缓存、两个修复图、角色图及可见 canvas backing store；重复 dispose 安全。

修复材料不足仍能打开详情；真正扣料由 B 的 controller 调用 C 的 `restoreGallery` 完成。大厅只根据真实 completed 标志选择布罩或蓝金帆船镶嵌画，不自行扣料。CSS 修复卡移到侧边，初始靠近提示移到左下，避免遮住角色、中央马赛克和右画皇冠。

生活快捷入口与继续旅程均保留，continue 仍按 hasSave 显示。桌面左右分组短栏；390px 竖屏两排、844px 横屏单排；可见按钮实测均至少 44×44px。保留键盘 focus、安全区、长状态滚动与减少动态效果支持。

## 浏览器、构建与验收证据

本轮使用完整本地主入口 [5273](http://127.0.0.1:5273/)；独立 origin 的存档与其他开发预览分开。修复材料夹具位于私有 `/private/tmp/adonis-life-ui-preview-20261021-213100/hall-qa.html`，复用真实 `HubController`、renderer 和 meta API，没有进入产品源码。

证据目录：[hall-pixel-v3](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/hall-pixel-v3)。[acceptance-audit.json](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/hall-pixel-v3/acceptance-audit.json) 回读现有记录通过 13 项一致性核对；[source-manifest.json](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/hall-pixel-v3/source-manifest.json) 和同目录 source-snapshot 保存冻结指纹及源码/私有 QA 副本。

| 验收 | 实际结果 | 记录 |
| --- | --- | --- |
| 最终桌面实景 | 两画门、星盘、房间、角色、前后景、修复结果与有界光影可见 | `final-desktop-lighting.jpg` |
| 390×844 竖屏 | 文档宽 390；按钮高 44、最窄 64；角色完整可见，靠近提示位于 x8..170 | `final-portrait-lighting.jpg`、`final-portrait-layout.json` |
| 844×390 横屏 | 文档宽 844；按钮高 44、最窄 64；HUD 没有覆盖中央角色/罗盘 | `final-landscape-lighting.jpg`、`final-landscape-layout.json` |
| 真实键盘走动 | W/A 走近左画门出现“画中轮回”；按 F 打开真实主线角色菜单 | `walk-to-left-door.jpg`、`left-door-adventure-menu.jpg` |
| 指针命中与自动走到 | 原生指针点击左画内景，自动走到并打开相同主线角色菜单 | `pointer-door-adventure-menu.jpg` |
| 主线返回路径（根复核） | 5291 生产快照中，选角“返回主页”显示完整 Phaser 标题菜单；Escape 正常回到像素大厅 | 根的 `getAXStateAndScreenshot` 与实际 Escape 复核 |
| 厨房/委托/花园/钓鱼/收藏 | 五个真实模块均打开，Esc 返回 gallery；厨房返回后仅 1 个大厅 canvas、无残留生活模块根 | `main-entry-flows.json`、各 `entry-*.ax.txt` / `*-entry.jpg` |
| 修复材料不足 | 原料 0 时仍可打开修复详情，真正执行按钮 disabled | `repair-insufficient.jpg`、`repair-insufficient.ax.txt` |
| 真实修复材料准备 | 真实播种、6 次有效结算、收获，共 8 次 applied 交易，得到碎片 6 / 橄榄原料 1 | `repair-before.json`、`repair-prepared-real-api.json` |
| 原子修复与实际陈列 | 点击真实“消耗材料并修复”：碎片 6→0，原料 1→0，restored 增加 harbor-mosaic；返回大厅布罩变蓝海帆船 | `repair-committed.json`、`repair-before.jpg`、`repair-after.jpg` |
| 重复修复 | 已完成按钮 disabled，完整 profile 不变 | `repair-repeat-disabled.json` |
| 三轮销毁重挂 | 每轮双 dispose 后重挂；均仅 1 root / 1 canvas，profile 不变，QA errors=[] | `three-remounts.json` |
| 暂停/恢复与重载 | 修复页观察 aria-hidden=true、inert；返回 false；回完整 main 后仍显示 completed 及修复图 | `main-repaired-reloaded.jpg`、实际浏览器记录 |

资源准备是调用权威规则构造的验收夹具，不代表玩家自然游玩全链路。实际触控事件与实体手机未验证；已完成 Chrome 视口、原生鼠标/键盘和尺寸验证，不将这些称为真机触控通过。本轮没有重新进入 3D 世界或构造 continue 存档；这两个动作及其主线合同按原代码保留。

### 已复核的主线返回路径

2026-10-22，根在 5291 生产快照中以 `getAXStateAndScreenshot` 复核：选角菜单点击“返回主页”后，可访问树仅显示根节点，但截图实际是完整原 Phaser 标题菜单，包含开始冒险、排行榜、设置、返回画廊等；按 Escape 能正常返回像素大厅。

这是 Canvas 标题页未向可访问树暴露其文字的正常路径。此前仅凭 AX 空树推断画面空白不成立，已撤销“空白页、需 B 修复”的报告。主线返回路径已由截图和实际 Escape 验证，无需修改 B 的 controller、UI 主线或音频代码。原始 AX 记录保留，但不能单独作为画面空白的证据。

### 构建和审查

以下最终检查均 exit 0，未写 UI 单元测试：

```sh
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vite build \
  --config /private/tmp/adonis-life-ui-preview-20261021-213100/vite.config.mjs \
  --outDir /private/tmp/adonis-life-ui-preview-20261021-213100/hall-pixel-build \
  --emptyOutDir
```

生产构建转换 1161 个模块、耗时 4.60s，提示部分已有分块超过 500kB。本轮没有调整依赖或拆包；输出位于私有临时目录，没有覆盖共享 dist。只读代码复核未发现明确 bug，确认合同、原坐标、单 RAF/生命周期、存储边界和层次顺序保留。

`first-desktop.jpg` 保留为空画框诊断图，不是最终效果：当时金框实心底色覆盖内景。已修为先金框、后裁剪内景，`first-desktop-v2.jpg` 起画内景正常；最终以 `final-*-lighting.jpg` 为准。参考 PNG、生活模块、controller、主线、音频、依赖、历史 tools/playtest.js/output 和既有 3D 候选均未由本阶段改写。
