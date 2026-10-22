# 可游玩的像素花园

2026-10-22 用户直接要求花园不再是网页形式，改成和游戏一致的像素花园。本轮替换场景与交互表达，保持已完成的局外经济、旧存档与生活循环。

## 场景和操作

全天景俯视像素庭院，960×640世界，约480×320逻辑像素绘制：暖石回廊、海景/柏树、三块真实花圃、石路、水池、藤架、陶盆与花丛、草木调制台、行囊台和回廊出口。植物空地/幼苗/成长/成熟有明确差异。固定种子细节、分层缓存、局部水纹/叶簇/收获反馈。复用真实Adonis像素角色，可WASD/方向键走动；点击/触摸地面走到，点花圃自动接近，F/Enter或触摸交互。种子用紧凑工具栏选择；配方/背包/手记只在交互时显示游戏小面板。主画面不铺网页卡片和长篇引导。

## 独占职责

- A：`src/sidegames/garden/pixel-renderer.ts`、必要的新`pixel-art-*.ts`，纯Canvas绘景，不持有事件/RAF/存档；读取根制定的`pixel-contract.ts`，导出`createGardenPixelRenderer(): GardenPixelRenderer`。不得改index/css/meta/大厅。
- C：`src/sidegames/garden/index.ts`、`garden.css`、必要的新`pixel-controls.ts`与`docs/expansion-handoffs/garden-pixel-v1.md`；接入A绘景，拥有移动/命中/操作小面板、所有原功能和生命周期。不得改A绘景、根契约、meta规则或大厅。
- 根：`pixel-contract.ts`公共布局、方向/看板、独立视觉/代码审查、生产快照和实际浏览器复验。B/D既有交付不改。

不覆盖他人的修改；需要改契约先交根协调。只有根暂存/提交/推送/部署；历史tools/playtest.js和output不得动。禁止UI单元测试。

## 必须保留与验收

`mountGarden({container,onExit}) -> {dispose()}`保持。全部真实plantSeed/harvestPlant/craftSupply/packSupply与subscribeProfile继续走唯一meta API；不新建存储、不改变成长速度，不给真实存档塞材料。只读/忙锁/内存未保存警告、库存上限、不可成熟收获、单槽装包/移出不扣料、新局才消耗均需保留。鱼获、委托和修复进度放入可打开的手记；不能丢失旧功能。

Escape先关闭交互面板再返回大厅；blur/hidden/pointercancel清移动，离开/销毁清RAF/监听/订阅/缓存。手机使用可见44px以上控件和可达的触控路径，窄屏相机跟随，不让工具栏盖住角色。截图必须来自实际Canvas场景；真正UI播种、成熟夹具标注后收获/调制/装入/重载、重复返回与横竖屏均要检查。无需重跑已完成全局玩法矩阵，不扩展3D或其他页面。
