# B · 生活主线整合 v1（功能验收完成）

## 大厅 renderer 已释放给新像素大厅任务

用户新指令优先。B 已停止并释放 `src/hub/gallery.ts` / `gallery.css` 的写入，不再做大厅美术；旧背景与本轮已写内容均保留，没有回退或删除。A/前端可接续改程序绘制的精细像素大厅。

现有契约必须保留，B 的 controller/主线/音频继续独占：

- `mountGallery({container,onAction,hasSave,profile})` 返回 `{dispose(),pause(paused),refresh({hasSave,profile})}`；`GalleryAction/GalleryHandle` 继续导出供controller使用。
- action集合：`adventure`、`continue`、`garden`、`world3d`、`collection`、`fishing`、`kitchen`、`commissions`、`repair`。生活四入口常显可触控，旧3D入口只保留原开关。
- `GalleryProfile`：`fragments:number; discoveries:number; supply:string|null; warning:string|null; fishCount?:number; repair?:{id:string;name:string;completed:boolean;costLabel:string;disabledReason?:string}`。这些是只读展示数据，来自C唯一存档，renderer不建存储/不猜奖励/不扣料。
- repair action只打开B已实现的修复详情页；有repair数据就允许进入（包括材料不足、只读、已完成），展示“查看修复/欣赏修复”。真正扣料由详情页调用C `restoreGallery`，`completed`从`profile.life.restored`读。
- `pause(true)`需取消输入/清按键、停止RAF并让旧renderer不接管焦点；`pause(false)`恢复；dispose需幂等释放监听/观察器/RAF/资产。controller在同步模块挂载前解除宿主inert，保留子模块自己设置的焦点。

冻结功能浏览器使用 `/tmp/adonis-life-hub-integration-build`，origin `http://127.0.0.1:5231/`，不是新renderer验收或发布候选。构建输入674项源码/资源前后hash稳定，输出157项，包含A最终厨房bbba8c2028b1/view5ead30b07d5c、commissions screen5a345dd89c55；完整摘要在B证据 `life-hub-v1/integration-input-before.json` 与 `integration-build-manifest.json`。

## 已实现

B controller已接真实 mountFishing/mountKitchen/mountCommissions（各 `{container,onExit}→{dispose}`），沿用独立宿主/generation token/迟到完成自释放/安全返回/原3D分支。新增修复详情，按C catalog显示现有/所需，调用 `restoreGallery('harbor-mosaic')`，内存成功/只读/不足/防重入和已完成状态分列；修复详情有布罩→海港镶嵌画的真实视觉变化，不依赖新图。

UI/mobile必要生命周期已补幂等dispose和Layer teardown；返回大厅释放本次自有移动展示租约，终态SHUTDOWN清理UI/音频/旧暂停租约。`audio.stopMusic(true)`只用于最终销毁清旧kit，避免延迟init复响；普通大厅stopMusic不改变原语义。根已独立复核此非UI延迟探针，无需重跑旧矩阵。

## 真实浏览器闭环

以下均在独立5231 origin原生操作，不注入profile、不伪造结算、不加debug/god参数。浏览器持续使用冻结构建，期间A的新大厅源码变化不影响本轮。

1. 花园播种两橄榄一月桂。钓鱼经过错过咬钩/过松失败后重试，三次真实成功，得到银鳞沙丁2、珊纹鲷1、生长3；真实收获橄榄2、月桂1。
2. 厨房真实烹饪海风橄榄串：银鳞沙丁1+橄榄原料1→橄榄露1+橄榄种子1。装包未扣成品。
3. 委托真实交付第一份海味、花园午餐，消耗余下鱼获及月桂，碎片7、生长5，剩橄榄原料1。两项完成态在重复进入后保留。
4. 修复前材料不足仅展示；备齐后修复归航镶嵌画，碎片7→1、橄榄原料1→0，真实布罩→海港镶嵌画，大厅完成态同步，重载后保留且不能再扣料。
5. 从画廊开始原生阿多尼斯/极乐原野简单新局，消费已装包橄榄露一次；生命上限6格（原5+1）。安全保存回画廊，厨房成品0、行囊空；实际“继续旅程”后仍6格，没有再次消费或叠加。
6. 原生WASD/G战斗达到9击杀，进入下一战斗房自然死亡，1层、4级、8:13、352分；结算明确“携带橄榄露 · 计入本机补给榜”，补给榜第1名，带回碎片1、种子1、生长+1。未提交线上榜。
7. 返回花园核对碎片2、生长6、橄榄种子4/月桂2/鸢尾1，鱼获0、成品0、两委托完成、镶嵌画已修复；再重载无重复奖励，已结束主线不再显示续局。

## 生命周期与横竖屏

- fishing/kitchen/commissions/garden各3轮完整进入→退出；每次宿主data-mode正确，挂载焦点为钓鱼主按钮或子页返回按钮，退出后回到gallery且子页DOM计数0。钓鱼每轮先实际蓄力抛竿，再在waiting退出取消，重进可再抛；鱼0、碎片2、生长6未因取消变化。
- 390×844竖屏、844×390横屏，启用浏览器CDP触控模拟；两种尺寸原生长按1050ms抛竿均成功，厨房/委托/花园底部操作区可滚动到达、返回有效，修复页操作区可达，页面无横向溢出。测试后触控模拟关闭、viewport已reset。
- 浏览器warn/error日志为空。实际手机、系统横竖屏锁定/全屏、扬声器播放、五层通关未在本轮验收；移动展示租约/音频延迟边界有源码审查与独立非UI探针，不等同实机通过。

## 构建与证据

`npm run typecheck`、完整 `npm run build -- --outDir /tmp/adonis-life-hub-integration-build`（含tsc）通过，仅既有chunk大小提示。674项构建输入前后hash稳定，157项输出。浏览器实际主脚本为`./assets/index-8ZXDGBBJ.js`，与冻结manifest一致。B交付12项源码与该构建输入hash均一致，副本在`source-snapshot/`；run/save/main包含在核对范围，不意味着本轮重写。

证据根：`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cba-2afb-7841-bff7-385c50f04529/life-hub-v1/`。

- `gameplay-observations.json`：闭环步骤、数字和证据映射。
- `screenshots/main-settlement-supplied.jpg`、`garden-after-main-settlement.jpg`：原生主线结算与真实回流。
- `screenshots/repair-before.jpg`、`repair-after.jpg`：修复前后；`main-new-supply.jpg`、`main-continued.jpg`：新局与续局6格生命。
- `mode-cycles.json`、`cycles-*-ax.txt`：四模式各三轮，活动钓鱼取消。
- `mobile-layout-results.json`、`mobile-*-ax.txt`、`screenshots/mobile-*`：横竖屏、滚动操作区、触控长按。
- `runtime-warn-error.json`、`browser-final-dom.json`：运行日志与实际脚本/最终mode。
- `integration-input-before.json`、`integration-build-manifest.json`、`integration-build.log`、`b-source-drift.json`、`source-snapshot/`：冻结输入、输出与B源码一致性。
- `legacy-run-probe/{probe.mjs,result.json,README.md}`：7项非UI检查通过，实际save/run/profile/store/catalog bundle及GameScene.startRun 501–522行AST原文数据段；旧v1缺runId/prepared/supply仅迁移1次，3轮模块重载ID稳定，迁移写受阻原文保留；橄榄露/月桂结/鸢尾香各准备1次后3轮续局，完整snapshot精确相等、prepareRun调用0、meta原文相等、下一局重新装包的余量1不消费；仅prepared receipt缺supply时只补分榜标记。导入源码前后SHA稳定。此探针仅用进程内MapStorage，不执行Phaser/enterLevel，不覆盖任意损坏JSON或新局准备到首次主线存档之间的跨key崩溃窗口。
- 相邻`life-audio-lifecycle/{probe.cjs,result.json}`：真实AudioEngine延迟init复响修复探针，根已独立复核。

无UI单元测试、提交、推送、部署，未改tools/playtest.js/output。大厅renderer已释放给A；本轮仅是旧renderer下功能验收，不是新像素大厅美术验收或发布候选。近口alpha方案停留backlog，未实施。
