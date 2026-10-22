# 花园与局外成长：生活规则接入合同

状态：现已扩展为同key v2生活存档，新增3鱼、3料理、2NPC/3一次性委托及1修复规则。106项有意义非UI检查通过，花园与限定实际UI验证完成。新API/目录以[生活合同](./life-economy-v1.md)为准，[C交接](./expansion-handoffs/life-meta-v1.md)明确上游夹具与整体验收边界。旧补给API保持；主线、画廊可见修复和最终发布由B/根统一处理。

## 可消费接口

从 `src/meta/profile.ts` 导入：

- `loadProfile(): ProfileState`，返回 `{ profile, storage, warning }`，不接触旧 `adonis.run.v1` / `adonis.board.v1`。
- `settleRun({ runId, victory, floor, kills, elapsedSeconds }): SettlementResult`，`floor` 为从 1 开始的已抵达楼层；返回 `{ ...ProfileState, applied, duplicate, reason?, reward: { fragments, growth, seeds } }`。同一稳定 ID 只结算一次，包括未达奖励门槛的结束。
- `claimDiscovery(id): MetaResult`，稳定发现 ID 去重，首次获得 1 碎片与 1 枚轮转种子，不推进植物生长。
- `prepareRun(runId): PreparationResult`，返回 `{ ...MetaResult, prepared: { runId, supply, effect, assisted } | null }`；未结算的同一 ID 返回原有准备回执，不再扣库存。已结算 ID 优先拒绝，即使留有历史准备回执也不再返回效果。`prepared === null` 表示无效/已结束 ID、只读或容量保护，不能把它当成成功消费。
- 花园规则：`plantSeed(bedIndex, plant)`、`harvestPlant(bedIndex)`、`craftSupply(supply)`、`packSupply(supply | null)`；`subscribeProfile(listener)` 返回取消订阅函数。

花园从 `src/sidegames/garden/index.ts` 导入 `mountGarden({ container, onExit }): { dispose(): void }`，不操作 Phaser、不写主线存档。调用方应暂停后台模式并在退出时调用 `dispose()`。

## B 接入必须遵守

1. 新局生成并保存稳定 `runId`；继续旧存档补一个 ID 并保存，但不重新准备/应用补给。新局仅在实际确认开始时 `prepareRun`，避免在预览、选角取消时扣除库存。
2. 新局先在内存 run 挂载 `prepared`，应用一次效果，再把回执与修改后的属性作为同一主线快照保存。继续游戏读已修改的数值，不能再次应用回执。幂等返回不等于允许再次叠加效果。局外与主线是两个存储 key，不存在跨 key 原子性；不能先落盘“已有 prepared、属性未应用”的中间快照。
3. `olive-draught`：`mods.maxHp += effect.maxHpBonus; hp += effect.maxHpBonus`；`laurel-thread`：`mods.pickupRadius *= effect.pickupRadiusMultiplier`；`iris-vial`：`mods.dashCooldown *= effect.dashCooldownMultiplier`。各项仅一局有效，不改永久基础属性。
4. 从 `prepared` 派生补给成绩标识/分组（可保存 `supply: { id, name }`），不能默默混入旧普通榜。无补给仍返回零效果回执以冻结本局准备状态。
5. 胜利/死亡最终结果调用 `settleRun`；暂停、返回花园、重载均不能触发结算。旧局继续与真实死亡/通关仍可结算，ID 必须固定。
6. 展示 `warning`：存储受限时本页内存仍可玩，但关闭页面后不能承诺去重或保留成长；未知新版本只读，不能覆盖。
7. `storage: 'busy'` 表示安全写锁准备中、另一窗口持有写锁或浏览器不支持安全锁。此时花园只读、返回可用；不能把 `prepared: null` 当成功消费。Web Locks 限制同源只有一个写者，防止两个页面互相覆盖去重回执；第二页关闭/回到前台后重试获取。

## 配方与容量

三块花圃；银叶橄榄需 1 生长、金缘月桂需 2、星蓝鸢尾需 3。新档只有橄榄种子 2、月桂/鸢尾种子各 1；无免费成品。播种消耗 1 种子，成熟收获 1 对应原料，配方消耗 1 原料换 1 补给。每种种子/原料最多 9、每种补给最多 3、修复碎片最多 99。已满时收获/调制失败，保留花株/原料；奖励超容量只截断，返回实际入库数量。

冒险结算奖励仅在 `elapsedSeconds >= 30`，并满足 `kills >= 8` 或 `floor >= 2` 或胜利，才产生奖励。有效冒险生长 `1 + (floor >= 3 ? 1 : 0) + (victory ? 1 : 0)`，最多 3；碎片 `1 + min(4, floor - 1) + (victory ? 2 : 0)`；轮转种子 1。不使用现实时间、系统日期或页面打开次数。首种橄榄在一次有效冒险后即可收获；多花圃共同受冒险推进，无需反复劳动。

单槽只选择一份，出征才扣库存。重复装入不会扣库存；换装也不收费。没有永久伤害、暴击、护甲成长；生命 +1 是有界的单局容错，另两种提供便利/机动选择。花园自愿，无副玩法仍能通关。修复碎片现可用于归航镶嵌画：碎片6 + 橄榄产物1，一次性调用restoreGallery；实际修复前后画面由B画廊消费完成标记。

稳定回执不滚动删旧记录：最多 4096 个结算、4096 个准备、1024 个发现，达到上限拒绝新增并提示；已有结算/发现仍幂等，未结束的准备仍返回原回执，已结束准备仍拒绝。此取舍避免截断历史后重放刷取奖励；后续需设计明确归档协议再扩大容量。


## v2生活回流补充

新档种子仍为2/1/1，鱼/产物/成品均为0。成功鱼获入库推进1生长；鱼满仓只记终态不发鱼/生长。每项一次委托再推进1生长。钓鱼与委托不借用冒险结算或发现API，不触发旧奖励副作用。料理的鱼+产物一次扣除，既有补给+对应种子一次入库，任一产出满仓均不扣料；仍单槽、新局消费一次。

同一adonis.meta.v1 key的payload升version2，v0/v1迁移保留全部旧库存与回执；未来版与v2损坏账本只读。新增钓鱼最多4096次终态、料理最多512操作回执，均不滚动淘汰以重接历史ID。通用事务在commit前detach完整返回结果，调用者修改返回引用不能改活账本。存储写失败保留本页内存但必须显示未持久化，不自动重试发奖。
