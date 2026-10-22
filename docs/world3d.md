# 希腊画中世界 · 首区

负责人 D；基线 `3240b7c`。当前实现与浏览器验收状态见 [交接记录](expansion-handoffs/world3d.md)。

2026-10-21：用户否定当前3D外观，旧候选视觉验收撤回、发布暂停；功能保留。后续按三张固定参考重建，见 [技术准备计划](expansion-handoffs/world3d-reference-plan.md)。

## 接入契约（2026-10-21）

只在玩家选择画作时执行 `const { mountGreekWorld } = await import('../world3d')`。不要在入口或大厅静态导入 Three.js。

```ts
type GreekWorldQuality = 'low' | 'medium' | 'high';
async function mountGreekWorld(options: {
  container: HTMLElement;
  onExit: () => void;
  onDiscover: (id: string) => void;
  discoveredIds?: readonly string[];
  quality?: GreekWorldQuality | 'auto';
  signal?: AbortSignal;
}): Promise<{
  dispose(): void;
  pause(paused: boolean): void;
  resize(): void;
}>;
```

`signal` 是向后兼容的可选取消通道。容器应独立挂在 `body` 或未缩放节点，不能置于使用 CSS zoom 的 `#ui-root`。本模块只管理自己创建的根节点，不更改容器原有内容。调用方暂停 Phaser、共享输入和音频，并在返回时恢复。退出按钮在加载中也可用；退出会先释放本模块资源，再调用 `onExit`。重复 `dispose()` 安全。初始化失败清理并 reject，调用方显示可返回大厅的错误提示。WebGL2 不支持时保留 2D 模式；本模块不会强制重试或全页刷新。

发现只调用 `onDiscover(stableId)`，每次挂载内去重，传入的 `discoveredIds` 视为已记录，不再触发该 ID 的回调。模块不读写主线或局外存档。回调返回只代表叙事中的“已发现”，库存到账和永久保存由 B 检查 `claimDiscovery` 结果；重进以 B 传入的权威 ID 为准。谜题状态只在本次探索保留；已记录发现可重读。

## 首区内容

路线：爱琴海岸（潮汐祠与残舟）→ 橄榄圣林（圣泉与水渠）→ 山巅神庙（内殿与海景露台）。目标自然探索 10–15 分钟，实际时长需游玩测量。

五个稳定发现 ID：`greek.coast.navigator`、`greek.coast.tide-mural`、`greek.grove.olive-oath`、`greek.grove.spring-restored`、`greek.temple.first-light`。

环境谜题：从潮汐壁画与圣林碑文读到水流图形线索，调整三座有不同图案的引水盘，使水流贯通圣泉；恢复水流后山门开启，内殿可抵达。每个盘有四个方向，世界中的水渠、金色流线和门扇反馈真实状态。神话叙事为原创改编，界面不将其作为真实古迹考据。

## 控制与预算

WASD / 方向键移动，Shift 快走，E 交互；点击“进入画中”或画面后才申请指针锁定，Esc 释放并暂停。无锁定可拖动画面观察。触控左摇杆移动、右半屏拖动视角、交互按钮；无镜头摇晃、跳跃和强制自动转向。设置提供灵敏度和低/中/高画质。

原创程序化网格、Canvas 绘制笔触纹理与绘画配色，无第三方图片/模型。Three.js `0.186.1`（MIT）、类型 `@types/three 0.186.0` 固定。第二轮新增独立海湾地貌/着色器海水、窄叶橄榄树/分层地被、带雕饰的古迹。地标细节按距离启用，建筑按材质合并，叶片/地被/铺石实例化；原创绘画纹理最大 512²（叶纹 256×512）。高/中/低像素比分别封顶 1.65/1.25/0.8，总渲染像素封顶 280万/180万/85万；中档 1024 阴影、高档 2048、低档关闭阴影、云带与细雕饰，使用分层抽样/少量宽叶/低面花草，将新增植被理论面降至中档20.1%；地表色块、冷接触色和路径软边保留。auto 按粗指针选低档，否则中档。完整几何与恢复快照仍驻留，当前桌面几何预算与手机尺寸实测见交接记录。帧率目标桌面 60 / 移动低档 30，未经实机测量不能作保证。

资源释放覆盖几何体、材质、纹理、WebGL renderer/context、影图、事件、ResizeObserver、RAF、指针锁定、触点和异步取消。

工程依据：[Three.js cleanup](https://threejs.org/manual/pages/cleanup.html)、[大量对象优化](https://threejs.org/manual/pages/optimize-lots-of-objects.html)、[WebGLRenderer / WebGL2 要求](https://threejs.org/docs/pages/WebGLRenderer.html)。

## 本地独立验收入口

Vite 开发服务打开 `/src/world3d/preview.html`，不依赖大厅和主线；该 HTML 未纳入生产构建入口。它支持同一页面重新挂载，并将发现 ID、挂载次数和运行指标写入自有 DOM 的 `data-*` 供浏览器验收。`?quality=low` 固定低档，`?cancel=1` 在初始化阶段取消，`?webgl=off` 仅在该开发页临时拒绝 WebGL2 context 以核对失败清理。后两者均已看到残留画布为 0；没有加入 UI 单元测试。

浏览器实玩及局限见交接记录。当前分区细节是可见性预算，并非下载远端 3D 模型；本轮所有几何体和小纹理均在进入画作后分阶段创建。未来大地图扩展需要真正卸载远区。
