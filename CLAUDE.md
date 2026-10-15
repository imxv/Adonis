# Adonis · 画中轮回

天目·黑马大赛（OPC 个人赛，创意项目赛道）的参赛作品：2D 像素射击肉鸽，每层一种随机画风。完整设计见 `docs/spec.md`，参赛者的关键决策见 `docs/decisions.md`。

## 比赛规则带来的硬约束

- 只能写 2026-10-15 10:30 开赛之后的新代码，不要从任何旧项目复制代码，`~/ReBloom`（一个无关的 iOS App，`~/Adonis` 以前是指向它的软链接）也不行。
- 勤提交（30–60 分钟一次），commit 作者必须是参赛者本人。
- 用到的外部库、字体、素材都要能写进披露表。只用开源许可的依赖，不引入未授权的素材。
- 截止时间是 2026-10-16 23:59，自定的提交时间是 22:00。

## 运行

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # 类型检查 + 打包到 dist/
```

调试参数（完整列表见 `docs/spec.md`）：
- `?styles=castle,forest,volcano&seed=42`：指定画风顺序和随机种子
- `?god=1`：无敌；`?room=boss`：直接进 Boss 房；`?weapon=rocket`：初始武器；`?light=0`：关光照

自动试玩：在开发服务器页面的控制台里执行 `const pt = await import('/tools/playtest.js'); await pt.start();`，之后 `pt.play(600)` 让机器人打 600 帧，`pt.inspect(x, y, 4)` 放大查看画面。它会暂停真实的游戏循环、手动步进帧，所以在后台标签页里也能用。

## 代码结构

- `src/pixel/`：像素美术。`palette.ts` 是 Endesga 32 调色板，`draw.ts` 是字符网格精灵渲染（自动明暗 + 描边）和像素字体栅格化，`sprites.ts` 是手绘精灵，`biomes.ts` 是 8 种画风的数据。
- `src/styles/textures.ts`：按画风数据现场生成所有贴图，包括整层地牢的底图 `buildLevel`。
- `src/data/`：内容表，包括武器、法术、加成、敌人、宠物。新内容尽量只改数据，不改系统。
- `src/game/`：玩法系统。`dungeon.ts` 生成元气骑士式地牢（异形房间 + 走廊 + 格子碰撞），`floor.ts` 是以撒式房间图，`GameScene.ts` 是主场景（镜头、锁门、波次、武器发射、伤害结算），`lighting.ts` 是光照层，另有 `boss.ts`、`enemyAI.ts`、`spells.ts`、`pets.ts`、`fx.ts`、`run.ts`。
- `src/ui/`：DOM 叠加层，与画布同为 480×270 并按同一倍率缩放；所有文字都栅格化成像素图片。`ui.ts` 是 HUD、主菜单、暂停页、结算页和三选一面板；`screens.ts` 是图鉴、游戏说明、设置、排行榜和确认框；`codex.ts` 从数据表和贴图生成图鉴内容；`pxhtml.ts` 是像素文字和图片的 HTML 工具。全屏界面走 `ui` 的图层栈，最上层独占键盘。
- `src/settings.ts`：玩家设置（本机保存，改动即时通知）；`src/save.ts`：本局存档和本机排行榜。
- `src/audio/`：Tone.js 合成的音效和音乐。
- `tools/playtest.js`：自动试玩脚本，只在开发时用，不进打包产物。

## 约定

- 所有武器共用 `src/core/stats.ts` 里的属性块。加成只改属性，由各发射方式自己解释，不为单个武器写特判加成。
- 不用方波，不用 8-bit 琶音。音色用正弦、三角、FM 和滤波噪声，总线上要有压缩器和限幅器。
- 每种画风只用 3–4 种底色。主角色和危险色必须在该画风的底色上足够醒目。
- 所有界面元素都要像素化：文字走 `pxText`（Fusion Pixel 12px / Press Start 2P 8px）再整数倍放大，不用浏览器的平滑字体。
- 代码里的标识符用英文，玩家能看到的文案用中文。
