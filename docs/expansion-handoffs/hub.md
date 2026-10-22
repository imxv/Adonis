# B · 可步行画廊与入口整合

更新时间：2026-10-21。状态：B 的入口调度、主线/花园/3D 回流与持久化接入已完成第一轮功能验收；美术交回根重做并独立验收。尚未提交、推送或部署。

**总指挥最新转达：旧大厅美术已被用户明确否定，待根重做，不能作为发布成品。B 已停止修改 `src/hub/gallery.ts` 和 `gallery.css`，这两文件的前端子代理已结束，全部修改已落盘，没有后台写入或待落盘内容。其视觉所有权现交回根。请重做继续保留 `mountGallery` 契约，B 仅继续 controller/主线/存档/音频与失败路径收尾。下文截图只证明旧版本功能入口，不代表获准美术。**

## 已落盘

- `src/hub/gallery.ts/.css`：独立 Canvas2D 大厅，可走动角色、原创主线/海岸画作、大理石列柱、旧金画框、希腊回纹、花园温室与收藏柜；键鼠/点击走动，保留真实快捷入口。
- `src/hub/controller.ts/.css`：模式调度，花园/3D 按需 import，独立未缩放容器 `.ag-theme`；代次及 AbortSignal 处理取消/迟到/失败，挂载中的返回按钮可用。外部模式不恢复 Phaser。
- `GameScene.ts`：`showTitle/quitToTitle/endToTitle` 回大厅；原选角/难度/mobileEntry 路径复用。离开主线同步清触控/键盘/pointer，禁用主线输入并 `sys.pause()`；恢复只针对本场景。启动时在 CREATE 后暂停，避免 Phaser 覆盖初始状态。主线 UI 全局键盘、武器预览与 Tone 有显式挂起。
- `save.ts/run.ts`：稳定 `runId`，旧局稳定迁移并写回；新局存完整 PreparedRun 和修改后的数值，继续不 prepare、不叠加。原本机榜保留，补给局独立 `adonis.board.supplied.v1`，同 ID 记分幂等，补给局不发旧全服榜。
- `ui.ts/audio.ts`：UI 代次取消选角/选卡迟到回调，清层与键盘所有权；音频租约不覆盖用户静音。结算与线上回包校验所属局与结算页。

## 契约消费

- C：按 `docs/meta-economy.md` 接入 `loadProfile/prepareRun/settleRun/claimDiscovery`。准备仅在新局确认后；效果、回执及 supply 标识随同一次完整主线快照保存。暂停/退出不结算。发现 warning/拒绝通过宿主提示展示，回调不等于成功持久化。
- D：按 `docs/world3d.md`，传发现 ID、画质及 AbortSignal，只有大厅能进入。挂载中退出和完成后退出均以代次验证，旧实例只释放自己的容器。Esc 交给世界自身处理，加载页与收藏页在 capture 处理后截断同次事件。
- A：宿主导入 `visualTheme.css` 并加 `.ag-theme`，大厅实际 CSS px，旧主线样式保留。

## 当前证据 / 待补

- `npm run typecheck` 与 `git diff --check` 已通过（共享目录当前接口闭合时）。save/run 底座另已通过临时 Node/esbuild 非 UI 数据校验：旧局 ID 稳定、快照隔离、补给分榜、同 ID 淘汰后重载仍幂等。
- 专属验收 origin `http://127.0.0.1:5181/`，避免与 C/D 同 origin 的局外写锁冲突。
- 实际浏览器 1280×720：大厅画面已读；Phaser `scenePaused=true/input=false/uiHidden=true`；点击画中冒险到原选角、难度确认后 `mode=play/paused=false`，主线快照包含同一零补给回执。暂停页实际已出现。
- 已实际完成旧 v1 存档继续（测试删去新增字段后走真实继续按钮），稳定迁移为 `legacy-18livwp-1k3icod`，准备数保持 1。
- 已走真实花园按钮播种、收获、调制、装入；死亡/胜利使用浏览器运行时测试末态（35 秒/8 杀死亡，45 秒/12 杀胜利），没有声称自然打通主线。结算后生长/碎片入独立局外 key，重复 recordRun 两次不增加奖励。
- 橄榄露新局 `9894cb6c-fa44-4a89-97cb-02fe82015e51`：同快照 hp/maxHp=6，库存 1→0；回大厅再继续仍为6，准备数保持2。胜利进补给榜1条，普通榜仍1条；网络记录无补给局 POST，结算页明确标注补给榜。
- 生产构建已通过：`npm run build -- --outDir /tmp/adonis-hub-build-20261021`；1085 modules，Three 世界独立 lazy chunk约599 KB（gzip160 KB），主包约2045 KB（gzip608 KB），现有主包大小警告保留。
- 截图绝对路径（根可直接读取，无需打开5181）：
  - `/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cba-2afb-7841-bff7-385c50f04529/gallery-desktop.png`
  - `/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cba-2afb-7841-bff7-385c50f04529/garden-packed.png`
  - `/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cba-2afb-7841-bff7-385c50f04529/supplied-victory.png`
  - 结构化证据：同目录 `verification-progress.json`。
- 已完成 3D 三次进入/返回（稳定生产预览5183，含双击入口），每次 `hub=gallery / scenePaused=true / world roots=0 / world canvas=0 / uiHidden=true`。W 实际移动，Esc 只进入3D休憩，不穿透大厅。
- 手机浏览器模拟：390×844 走原“转动手机→竖屏继续→选角→难度→主线”，6个原触控动作可见；暂停回大厅后触控隐藏、move=(0,0)、firing=false。844×390 继续同局不出现竖屏提示，3D自动低档，实际渲染675×312；旋转到竖屏仍能打开设置并返回。**没有实体手机、原生触摸手势或真实方向锁证据；IAB不支持触摸事件注入，也未取得原生指针锁，键鼠行走及无锁定路径已测。**
- 浏览器故障注入：暂令新 Canvas WebGL2 getContext 返回null，得到可返回失败页并已还原；延迟0ms初始化为5/10秒后，加载页按钮与Esc都能取消，旧异步完成不会重现旧世界，也不会释放重入的新实例。
- 实际从画中步行到(-12.8,27.18)，按E记录 `greek.coast.navigator`，局外收藏/碎片/种子真实写回；收藏入口显示“无名领航者的星盘”及补给榜记录。
- 最后回归发现并修复：加载容器的独立 stacking context 防D内部z30遮住宿主返回；加载内容inert，完成后只聚焦非inert的可见控件。Phaser ScenePlugin 排队 pause/resume 在同一帧新局→退出→继续会留下paused，改同步 Systems API后回归 `bootPaused=true / mode=play / paused=false / oldTimerFired=false / muzzle=0 / flashAlpha=0`。
- 清层取消 active + pending Clock 事件，并用层代次保护已经开始dispatch的回调；不killAll破坏特效Tween自清理。枪口/陨石及Boss ambient等原本依赖timer销毁的对象显式补偿清理。
- 音频实际模块实例：大厅持有1租约，另加测试租约后2，设0音量后两Gain=0，释放测试租约仍保留大厅1。未改用户设置。
- 两轮独立只读审查，所报焦点问题已修（过滤inert/aria-hidden祖先），真实焦点为`gw-primary gw-play-button`，Enter可直接进入。最终类型/差异检查通过。
- 最新构建已通过：`npm run build -- --outDir /tmp/adonis-hub-ready-20261021`，1085 modules；Three lazy chunk600.57KB/gzip160.35KB，主包2037.79KB/gzip604.28KB。这是一份根接管美术过程中取得的构建快照，不能替代根最终视觉/发布验收。
- 根替换gallery实现后，B未再修改gallery.ts/css；已复验新契约的“继续旅程”和三次花园进出。三次返回后 `elapsed=0.32065999999999467 / Phaser Clock=46047.6` 与进入前完全一致，`gardens=0 / paused=true / hub=gallery`。新美术本身仍归根验收。

新增证据均位于同一 visualization 目录：`world3d-entered.png`、`world3d-first-discovery.png`、`collection-discovery.png`、`world3d-failed-load.png`、`gallery-mobile-portrait.png`、`gallery-mobile-landscape.png`、`main-mobile-portrait-pause.png`、`world3d-mobile-landscape.png`、`world3d-mobile-portrait.png`。图库与截图只作旧版本功能证据，不代表获准美术。完整结果最终写 `verification.json`。

禁止 UI 单元测试；未修改历史 `tools/playtest.js` 或 `output/`，未修改 meta/world3d/package/lock。根会话统一提交、发布。

## 根追加授权：旧标题七行菜单布局（已完成）

仅修改 `src/ui/ui.css` 的 title/menu/caption/hint 规则，未再改移交的 gallery 文件。桌面为 logo/sub/menu/caption/hint 分配独立网格行，说明预留两行、提示独立一行；压缩仅桌面菜单行的垂直 padding/gap。手机规则由 `body:not(.touch-device)` 排除，44px触控目标未缩小。

复现路径：新版大厅“画中轮回”→原选角→“返回主页”→旧标题。固定构建 origin 为 `http://127.0.0.1:5192/`（5191原有A样板，预览自动使用5192；未操作A样板）。

- 1280×720：7行菜单全部可见，`scrollHeight=clientHeight=132`；修复前 caption594–618 / hint618–654 与回纹612–630重叠，修复后 caption490–526 / hint566–602，回纹仍612–630，提示与回纹相隔10px。
- 390×844：走真实“转动手机→竖屏继续→选角返回”流程；7行目标均高44px，caption477–491.625，hint792–824.5，回纹836.6875–844，无相互重叠。
- 844×390：7行均高44px，末行底375.84375<390；保持原横屏隐藏caption/hint策略。“返回画廊”点击成功。
- 桌面 Up/Enter 选到“返回画廊”成功，`hub=gallery / scenePaused=true / title=0`。
- 独立只读复核未发现此布局明确P1/P2。构建 `npm run build -- --outDir /tmp/adonis-hub-titlefix-20261021` 通过（1085 modules）；未写UI单元测试。

截图绝对路径：

- `/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cba-2afb-7841-bff7-385c50f04529/title-before-desktop.png`
- `/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cba-2afb-7841-bff7-385c50f04529/title-after-desktop.png`
- `/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cba-2afb-7841-bff7-385c50f04529/title-after-portrait.png`
- `/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cba-2afb-7841-bff7-385c50f04529/title-after-landscape.png`
- 结构化：同目录 `title-layout-verification.json`。
