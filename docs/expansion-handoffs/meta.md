# C 花园与局外成长交接

2026-10-21，第一轮模块交付完成。已实现真实规则、独立持久化与可操作的“月桂花园”；没有导出壳、未实现按钮或计时占位。主线/大厅接入与线上发布仍由 B/总指挥验收，本文不把独立夹具数据等同为真实主线业务通过。

## 改动范围

- `src/meta/{types,catalog,profile,rules,schema,store,service}.ts`：同步接口、经济规则、独立版本化存储与浏览器单写者保护。
- `src/meta/profile.checks.mjs`：33 组有意义的非 UI 检查，使用已有 esbuild 临时打包，无新增依赖、不改测试脚本。
- `src/sidegames/garden/{index.ts,art.ts,garden.css}`：独立挂载花园、3 种原创 SVG 植物与补给、响应式真实操作、焦点/订阅/键盘释放。已消费 A 的 `visualTheme.css` / `.ag-theme`。
- `docs/meta-economy.md` 与本文件：正式合同、配方取舍、交接证据。

C 未修改 `save.ts`、`run.ts`、`GameScene.ts`、`main.ts`、`package.json` 或其他包文件；未操作历史 `tools/playtest.js`、`output/`，未暂存、提交、推送、部署。浏览器夹具 `__verify.html / __verify.ts` 验收后已删除。

## 可消费接口与接入要点

合同以 `docs/meta-economy.md` 为准，类型从 `src/meta/profile.ts` 可导出。`loadProfile/settleRun/claimDiscovery/prepareRun` 与播种/收获/调制/单槽装卸/订阅均完整可用。存储 key 为 `adonis.meta.v1`，坏数据备份 `adonis.meta.v1.corrupt`，不写旧主线或旧成绩 key。

新局在内存 run 挂载 `prepared` → 应用一次效果 → 把回执和修改后的属性作为同一主线快照保存；两个 key 不存在跨 key 原子性。继续读已应用数值，不重新应用。补给成绩标识/分组从 `prepared` 派生，不能混入无补给普通榜。

根预审 P2 已修正并覆盖：`prepareRun` **先查已结算 ID**，再查历史准备回执。已结束的有补给/无补给/重载 ID 一律 `reason: 'invalid', prepared: null`；未结束同 ID 仍返回同一回执且只扣一次。无补给回执冻结空选择，不被后续库存追扣。

花园 `mountGarden({container,onExit})` 需要有尺寸、定位的独立未缩放容器，例如 `position: relative; width: 100%; height: 100%`。调用方暂停后台游戏/音频/输入并在退出时 `dispose()`；花园自己不控制 Phaser。返回文案统一“返回画廊”，标题统一“月桂花园”。

`storage: 'busy'` 为写锁准备中/另一页持锁/浏览器不支持安全锁，花园操作只读但可返回，`warning` 需要展示。Web Locks 需要安全上下文（HTTPS/localhost）；不支持时保护原档，主线仍可正常游玩。内存降级只保证本页连续去重。锁持有期为页面生命周期，不因关闭花园而释放，防止后台主线结算和另一页花园互相覆盖。

## 已验证

- `node src/meta/profile.checks.mjs`：**33/33 通过**。完整种植→结算→收获→调制→单槽准备、重复结算/消费/发现、已结束 ID 拒绝、所有容量与非法输入、增长计数回绕、v0 迁移、v1 缺回执保护、未来版本保护、损坏原文备份、get/set/备份失败页内连续去重、成功重载、busy guard 与释放后恢复。
- 另含 6 组非 UI 的 service 锁生命周期模拟：待定请求离页→AbortError→恢复重请求、旧 generation/隐藏页迟到回调不授写权、已有锁释放与立即重取、其他写者只读、active AbortError 可重试、旧拒绝不撤销新锁。不使用 `ifAvailable + signal` 非法组合。
- `npm run build`：TypeScript 与 Vite 生产构建通过。构建仍提示现有最大 chunk 超 2000 kB；此检查不表示已经部署。
- Codex 内置浏览器真实操作，桌面 1280×720、竖屏 390×844、横屏 844×390。三种尺寸花园 `scrollWidth === clientWidth`；所有按钮最小高度 48 CSS px。横屏滚动到底后返回按钮仍在视口内（top 8 / bottom 56）。
- 实际点击播种扣种子、受控有效冒险回执推进橄榄成熟、收获清花圃且入原料、调制消耗原料、装入不预扣、准备只扣 1 份、重复结算零奖励、重复准备不再扣库存，刷新后原样保留。另实际播种月桂和鸢尾。
- 实际 Tab/Enter 播种后焦点保留；三轮 mount→Esc→dispose 返回计数恰好 3，卸载后追加 Esc 不再触发；同步订阅不会双渲染。
- 同源双页真实验证：一页可写、另一页警告并禁用操作，直接准备也返回 null；写者离页释放后返回可重新取得锁并恢复操作。未把离页返回直接宣称为所有浏览器 BFCache 真机覆盖。
- 独立只读代码复审已通过，无剩余已知 P1/P2；未写 UI 单元测试。

## 证据与边界

截图位于本会话 visualization 工作区（本地证据，未发布到站点）：

- [桌面三花圃](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/meta-garden-desktop.png)
- [390×844 竖屏](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/meta-garden-portrait.png)
- [844×390 横屏](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/meta-garden-landscape.png)
- [双窗口只读保护与 null 准备](/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/meta-garden-multitab-readonly.png)

尚未进行手机真机测试。独立浏览器回执为明确标记的受控验收数据；完整真实主线结算回流、实际修改主线属性、榜单分组与跨模式音频恢复属于 B/总指挥整体验收。数据本地保存，不能宣称服务端防篡改。碎片当前只作有上限库存与后续修复资源，没有未实现兑换按钮。4096 准备/4096 结算/1024 发现硬容量保护，不滚动删除旧去重回执。

本会话启动的 Vite `http://127.0.0.1:5173/` 可供整合继续使用；没有跨文件边界改动请求，没有自行扩展第二轮。
