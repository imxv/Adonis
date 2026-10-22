# 像素居民庭院 v2 · C 交接（已冻结）

2026-10-22。按 `docs/life-pixel-direction-v2.md` 本轮分工，仅修改 `src/sidegames/commissions/**` 并写本交接。未改 garden/meta/hub/main、依赖、其他人的模块或历史 tools/playtest.js/output；未提交、推送或部署。原 `mountCommissions({container,onExit}) -> {dispose()}` 契约不变。

## 结果

主画面已从联系人网页卡片替换为可走动的Canvas居民庭院。960×640世界/480×320源像素，暖石、海景、树木、中央水池、左侧渔具角和右侧园艺角；Adonis使用原游戏精灵。涅柔斯有草帽/白胡/蓝白衣，达芙妮有栗发/围裙/花篮，两位NPC各两帧；姓名、可交付/完成状态、交谈朝向和感谢心意只有视觉效果。

WASD/方向键走动，点地面行走，点NPC或底部居民按钮自动接近后开对话；走近F/Enter/交互按钮也可交谈。共享viewport正逆矩阵，390px裁切跟随，不整体缩小人物；足部阻挡与有界路径绕过NPC、水池和桌台。交谈时上半视区跟随角色，下半为游戏对话。一次仅显示所选委托，达芙妮可切换两项；材料现有/所需、来源、回礼与库存容量、明确交付与感谢反馈均保留。

全部交易仍由 index适配器调用唯一 `deliverCommission(稳定委托ID)`，没有新存储或UI奖励。动画和接近只开对话不交付；完成后保持该委托并禁用。同步交易守卫防订阅重渲染，异常单次读回且不自动重试。busy/unsupported只读，memory明确未保存，recovered可用。单RAF，blur/hidden/pointercancel清输入；dispose幂等，清RAF/订阅/监听/observer/缓存，onExit一次。Esc先关对话，再返回。

## 有限验收与边界

- 模块 `npx tsc --noEmit -p src/sidegames/commissions/tsconfig.json`、整个workspace `npm run typecheck`、`git diff --check` 通过；独立冻结源生产构建通过（27模块）。没有UI单元测试，没有重跑已完成的全life矩阵。
- 独立只读复审：交易/稳定ID/held-key/订阅/退出未见P1/P2。发现的窄屏低高度工具栏横向裁切P2已修复并复审通过。几何17组路径、2,269采样、759移动步、8组视口往返通过。
- 首张真实 `desktop-courtyard-first.jpg` 已由根亲眼确认视觉方向通过。后续没有增加装饰，仅使用绘景方已经完成的NPC姓名避让。
- 独立origin5337，材料按钮明确标记公共API夹具、非真实垂钓。夹具通过3次公开beginFishing/finishFishing得到所需鱼；没有直接写库存。真实对话按住Enter1400ms交付first-catch，鱼1→0、碎片0→3、橄榄种子2→4、生长3→4；完成ID只出现一次。重新交谈/按住F1000ms不再扣料或发奖；reload前后完整profile一致。
- 手机尺寸390×844：点地面行走并镜头跟随，直接点涅柔斯交谈，再到达芙妮选择garden-table/blue-keepsake；缺材料交付按钮禁用。只切换话题，没有交付另外两项委托。844×390实际滚动到对话末尾；按钮均44px，body clientHeight136/scrollHeight615，canvas touch-action:none、对话pan-y，背景三元素inert均已读回。
- 最后三次挂载/退出：mounts=3、exits=3、activeCourtyards=0；Esc第一次只关对话、第二次退出，另有F/按钮退出。console warn/error为空。
- 未声称真机触摸或自然钓鱼全链路。容量、readonly/memory/recovered、异常分支在本轮保持并静态复核，未额外制造新的全量存档矩阵。

## 冻结源

- `src/sidegames/commissions/commissions.css` SHA256 `e9d59665b7edc12c4bbb8fdff8473f4f7c17fea6b4ddcb3229c53d6999650175`
- `src/sidegames/commissions/index.ts` SHA256 `a750a7dad49d073c2d2c05790b6fcf454f87e611928c576c6321fbe725545c60`
- `src/sidegames/commissions/pixel-art-landscape.ts` SHA256 `a8647e7fb96c4a132ccf6a17817c1f0d47f67bdbc2c16cce36f645838770dc70`
- `src/sidegames/commissions/pixel-art-npcs.ts` SHA256 `ea241512b77344f2749d138bf74d6b8195245e8144896de4de0c05a3c5a3d382`
- `src/sidegames/commissions/pixel-art-primitives.ts` SHA256 `0cdb7dfde5e1c9d43f7e6c7f1eb5ee97dcace09d2ce666dc6270f37d685fa25a`
- `src/sidegames/commissions/pixel-contract.ts` SHA256 `70bf37e5870e5d83f17f098b82ece77de4dedc09975db21df3e461b74eb60f8c`
- `src/sidegames/commissions/pixel-controls.ts` SHA256 `589659ff4c50e3d9cb4b2603a8074a0fc0b536cdfa1682d373eb7cb9f012daf8`
- `src/sidegames/commissions/pixel-renderer.ts` SHA256 `a090ec9f787f85785d54b441c35a8bc2495fbbaa6caa89dd98b34154cc03ad17`
- `src/sidegames/commissions/screen.ts` SHA256 `7d4f3189d88acc7e95ade09114e48247b0dd849d3450302173fb4f8a207a79a7`
- `src/sidegames/commissions/tsconfig.json` SHA256 `d1c8e0a84d1aa413aa4169ae6a4be56686b8d273f316f1959e0fa203e0adbb42`
- `src/sidegames/commissions/view.ts` SHA256 `0c33a6cc977aa40ed9dc8b78f8962d954cf587555183b282d7b8897bab871f15`

## 证据与清理

目录：`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-e1c4-7f13-a4eb-be4b72e89b2f/commissions-pixel-v2`。`verification-summary.json`、`browser-readbacks.json`、`browser-layout-and-assets.json`、`browser-warnings-errors.json`、`qa-source-snapshot-final.json`、`final-source-hashes.json`保留原始证据。浏览器实际引用最终生产资源 `/assets/index-Cw4N36Bb.js` 与 `/assets/index-3kHKy4ms.css`；所有委托模块冻结源与QA拷贝SHA完全一致。最初整景图是过程截图，交付和手机图来自最终资源。

实际截图：`desktop-courtyard-first.jpg`、`desktop-delivered-after-public-api-fixture.jpg`、`phone-nereus-dialogue.jpg`、`phone-daphne-selected-commission.jpg`、`phone-daphne-courtyard.jpg`、`landscape-dialogue-scrolled.jpg`。图片均实际Canvas/DOM截图，未重绘或改图。

5337服务已停（exit130），有效验收tab13已关闭、viewport已reset。首次端口未启动创建的临时错误tab12在读取data URL时被浏览器URL策略阻止，显式取句柄关闭同样被阻止，未绕过策略，留给应用在本回合结束时自动回收；这不涉及用户tab。用户5291始终未操作。根负责集成、最终生产包与用户预览更新，C不再扩设计或矩阵。
