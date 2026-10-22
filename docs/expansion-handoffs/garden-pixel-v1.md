# 像素花园 v1 · C 交接（已冻结）

2026-10-22。只改 C 所有的 `index.ts`、`garden.css`，新增 `pixel-controls.ts` 与本交接。A 的绘景和根的公共契约只读取接入；没有改 meta、主游戏、大厅、依赖、历史 tools/playtest.js 或 output，也没有提交、推送或部署。

## 实现

- 主视图为真实 Canvas 庭院与紧凑 HUD/种子工具栏。WASD/方向键行走；点击地面行走，点物件自动接近；F/Enter 或 44px 交互按钮打开物件面板。地点菜单让窄屏和键盘也能到达全部地点。
- 单一公共960×640坐标与视口矩阵，stage已经扣除HUD/工具栏/safe-area。窄屏裁切跟随，世界缩放不小于0.85；绘制和指针逆变换使用同一矩阵。三桌阻挡与有界可见图绕行，出生到中床绕过行囊台。
- 三个固定花圃索引，面板内也能选种子。调制台、行囊及手记保留原功能。鱼获、厨房配方、居民委托、修复进度在手记只读展示。背景inert，焦点留在面板；低高度内容独立滚动。Esc先关面板，再退出。
- 所有交易仍走唯一 `plantSeed/harvestPlant/craftSupply/packSupply`；同步交易守卫屏蔽同步订阅重复渲染，异常仅读回一次且不重试。unsupported/busy只读、memory警告、recovered可用；交易结果与存储警告同时保留。
- 单RAF；blur/hidden/pointercancel清移动。销毁幂等并清RAF、ResizeObserver、监听、订阅和renderer缓存，退出回调只调用一次。步行和时间仅用于绘画，不推进成长。

## 有限验收

`npm run typecheck`、`git diff --check` 通过；独立冻结QA源的 Vite production build 通过（26模块）。未写UI单元测试，未重跑已完成的全life矩阵。独立静态复审发现的两项P2（面板选种焦点与警告覆盖交易结果）已经修复并复审通过，无剩余阻断。

- 独立origin `127.0.0.1:5331`，未打开或改用户5291 tab/存档。三床真实UI播种后growth仍为0；随后点击明确标注的“成熟夹具（公共API）”，调用三次settleRun（标注非真实冒险），再真实UI收获橄榄/鸢尾、调制橄榄露、装包、重载；重载前后完整profile相同。装入、移出、再次装入后橄榄露库存保持1。
- 390×844实际Canvas点中中床并绕行，沿中床→左床→右床→调制台→行囊→手记→出口可达。按住Enter 1400ms仅播种一次，橄榄种子2→1，新株plantedAt=3且growth保持3。
- 844×390低高度面板：按钮均44px，面板body clientHeight136/scrollHeight544，实际滚动可达最后配方；canvas touch-action:none、面板pan-y。是浏览器手机尺寸验证，未声称真机触摸验收。
- 最终冻结生产构建连续三次挂载/退出：mounts=3、exits=3、activeGardens=0，console warn/error为空。Esc关面板后花园仍在，再Esc才退出。
- 子任务纯几何检查：64条路径、14,492采样、4,826移动步及32组视口往返通过；根也独立做过路径验证，不必再扩展。
- readonly/memory/recovered在本轮静态保留，未另造真实用户存档测试。未执行自然冒险/钓鱼全链路，成熟证据只归因于标注的上游公共API夹具。

## 冻结源码与证据

- `src/sidegames/garden/index.ts` SHA256 `211e273759aa1bc63a0448199d4630d6d0913f2047dabe0fef35bf85b9df823e`
- `src/sidegames/garden/garden.css` SHA256 `21142467d398accf3fe692d45ecf4c08328ad6b05e527ea976469786e5b537e7`
- `src/sidegames/garden/pixel-controls.ts` SHA256 `3fdfeab51e6a301ddae510aee7cf091f6705a5ff67a64637a7451336a60c7fac`

证据目录：`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/garden-pixel-v1`。核心文件：`verification-summary.json`、`browser-readbacks.json`、`browser-warnings-errors.json`、`qa-source-snapshot-final.json`、`final-source-hashes.json`。实际截图：`desktop-planted.jpg`、`desktop-mature-after-public-api-fixture.jpg`、`desktop-crafted-after-fixture.jpg`、`desktop-packed-after-fixture.jpg`、`phone-final-canvas.jpg`、`phone-left-bed-after-fixture.jpg`、`phone-right-bed.jpg`、`phone-craft-panel.jpg`、`phone-landscape-scroll.jpg`、`phone-journal.jpg`。

C最终代码与QA拷贝哈希完全一致。最终QA拷贝已含A标签避让，绘景与交接时工作区同为SHA256 `f5b45aebcfce038af03deb85ebbe8ca6716b7579c079548c6683f1ca16f5cfed`；两类哈希在 `final-source-hashes.json` 分开记录。若A后续继续改动，由根对其最终绘景做生产快照复验；不把较早的过程截图冒充最终绘景。C代码已冻结，不再扩设计或矩阵。

独立5331服务已停止（进程exit130），验收tab已关闭，viewport override已reset。未动用户5291。根负责最终生产快照及部署决策。

最终截图 `phone-final-canvas.jpg` 来自冻结生产构建（浏览器DOM实际引用 `/assets/index-Dwu8NfZs.js`、`/assets/index-CnSc0gQe.css`），已含A出口标签避让。生产构建单独核验三次进出仍为3/3/0、warn/error为空，资源SHA记录在verification-summary.json的finalProductionBuild。过程交易截图保留为原始过程证据。生产preview服务也已停止，临时tab关闭，viewport已reset。
