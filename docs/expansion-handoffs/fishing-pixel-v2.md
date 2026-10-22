# D：钓鱼像素场景 v2（冻结）

2026-10-22，按[生活玩法像素方向](../life-pixel-direction-v2.md)完成。本轮只写 `src/sidegames/fishing/**` 与本文。主入口最终组装、5291生产包与发布由根负责；本任务未访问或修改用户5291的tab/存档，未写meta、厨房、NPC、花园、大厅、3D或依赖，未提交/推送/部署，未写UI单元测试。历史tools/playtest.js、output与[v1交接及证据](fishing-v1.md)保留。

## 画面与接入

主视图为480×320逻辑像素的程序Canvas湖岸，带木栈桥、芦苇、水纹、鱼竿/线/浮标与实际ADONIS_A/B精灵。阶段动作对应蓄力、等待、真假咬钩、收线、冲刺、成功/失败；静态分层缓存由renderer持有，HUD采用现有FusionPixel字体。横竖屏摄像机保护角色和浮标；DOM只承担紧凑HUD、主操作与独立鱼篓面板。

`mountFishing({container,onExit}):{dispose():void}`不变。`index.ts`和`rules.ts`与v1冻结SHA一致，真实C的attempt/seed/receipt仍为唯一结算来源，没有外观驱动的额外奖励或规则变化。controller现有唯一rAF统一驱动画面；view/renderer无自建循环。dispose清理rAF、全局/本地监听、订阅、ResizeObserver、pointer capture、绘图缓存与根节点。

鱼篓仅在收竿后可打开，活动阶段禁用；打开不暂停、不取消或改变概率。面板让场景/HUD/操作区inert，Tab范围约束到面板，关闭恢复焦点。Escape先关面板再返回；repeat在close/exit之前拦截，避免长按连续退出。

## 真实画面

独立QA origin：[5310预览](http://127.0.0.1:5310/src/sidegames/fishing/preview.html)，Vite服务session87308。以下均由真实mount和C服务产生，不是fixture；源码未注入引擎或库存。

- [桌面待机](../../src/sidegames/fishing/evidence/pixel-v2/01-desktop-idle.png)、[等待](../../src/sidegames/fishing/evidence/pixel-v2/03-desktop-waiting.png)、[收线](../../src/sidegames/fishing/evidence/pixel-v2/04-desktop-reeling.png)、[成功](../../src/sidegames/fishing/evidence/pixel-v2/05-desktop-result.png)：1488×981，角色、鱼竿、提示可见。
- [390×844成功](../../src/sidegames/fishing/evidence/pixel-v2/07-portrait-success.png)、[真实鱼篓](../../src/sidegames/fishing/evidence/pixel-v2/08-portrait-basket.png)、[触摸失败](../../src/sidegames/fishing/evidence/pixel-v2/09-portrait-touch-failure.png)：无横向溢出，主按钮56px，顶部按钮44px。
- [844×390失败](../../src/sidegames/fishing/evidence/pixel-v2/11-landscape-failure.png)、[触摸抛竿等待](../../src/sidegames/fishing/evidence/pixel-v2/12-landscape-waiting.png)：主按钮46px、顶部按钮44px，角色、浮标和操作完整可见，root scrollWidth/Height=844/390。

以上是Chrome视口模拟，不代表物理手机验收；本任务未验证主入口全链路。根另行负责组合生产包的验证。

## 有界玩法和清理结果

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| 一次完整成功 | 实际键盘蓄力→等待→扬竿→按住/松开收线，52,431ms；fishing.1 success且settled=true，珊纹鲷×1入篓、花园生长+1 | [状态轨迹](../../src/sidegames/fishing/evidence/pixel-v2/06-real-success-log.json)，成功图与鱼篓图 |
| 一次失败 | 390×844实际touchStart/End按住120ms，fishing.2短抛failed，settled=true，提示无鱼获/不扣材料，库存仍1 | [读回](../../src/sidegames/fishing/evidence/pixel-v2/10-responsive-touch.json)，触摸失败图 |
| 鱼篓长按Escape | Tab到“合上鱼篓”，Escape物理按住1.5秒；仅关面板，仍留在钓点，退出次数0，焦点恢复鱼篓 | [读回](../../src/sidegames/fishing/evidence/pixel-v2/02-held-escape-panel.json) |
| 三次返回 | fishing.3等待中按返回；fishing.4触摸仍按住的蓄力中按Escape；fishing.5键盘抛竿等待中按Escape。每次active=null、cancelled、awarded/growth=0、fishingChildren=0、liveFishing=0、canvasCount=0，累计珊纹鲷仍1、生长仍1 | [三次读回](../../src/sidegames/fishing/evidence/pixel-v2/13-three-exits.json)，[第三次返回](../../src/sidegames/fishing/evidence/pixel-v2/14-third-exit.png) |

第三次退出后，焦点在可见的“重新进入钓点”按钮。额外Space会原生激活该按钮，重新mount为idle（attemptId为空、未启动尝试），属于预览入口行为，不能当作残留监听或“输入完全没反应”的证明。三次退出的移除和取消读回均在该重新进入前保存。QA专用tab已关闭，触摸/视口覆盖已恢复。

## 验证与冻结

`npm run typecheck`通过。`npm run build -- --outDir /tmp/adonis-fishing-pixel-v2-build-20261022`通过：1176 modules，4.94s；产物在独立临时目录，未覆盖根准备的dist。Vite保留既有大chunk提示。两位实现者与独立只读整合/生命周期复核无可操作P1/P2；不以静态复核代替上表浏览器结果。本轮未重跑v1全量规则/存储矩阵。

[源和证据清单](../../src/sidegames/fishing/evidence/pixel-v2/source-manifest.json)。9个源码文件组合SHA256：`dd1c4f26178abe78466ae7232b9042c651b4a082f641c141244dfce93914ec1f`。算法为按文件名排序，每行“文件SHA256、两个空格、仓库相对路径、换行”，再对UTF-8全文取SHA256。

| 源码 | SHA256 |
| --- | --- |
| `controller.ts` | `a595b739657ff9d1529488cd7e9a55b69edab7fc25b907335c84e8e34664811e` |
| `fishing.css` | `b025f4f9fb356fd3614ec529efe329db809b6e84892d98348f110a69115b0a6d` |
| `index.ts` | `d75805d5a5199c86ac173d0091b1a6eca30c919cfa91e3781f71181b852713fa` |
| `pixel-renderer.ts` | `5dd0ed4e876873521b84eefd1e236c95d65a5f25a803fe78bf2ea0a58d9dbdfb` |
| `preview.html` | `85f716ebec444ffa6b90db93c923990915a90647032757e66748dec46d9e50a1` |
| `preview.ts` | `fa9aff3b345f0aaff8c3bb8699c515ba8affeda8dc3ff251955811859e5b38c5` |
| `rules-check.mjs` | `db20979551f7940bf2551fa17e627bef4067e00f2fd747da3ab3058167aa321e` |
| `rules.ts` | `1345626ace6164cbee068d852fed1327db83b0df5a2ba77cf6f547ca5b4b995a` |
| `view.ts` | `2b64a7cb3183d5a0c18b9e4b741ed1f5747a25d9a575804d4506c19b3e0eb4d7` |
