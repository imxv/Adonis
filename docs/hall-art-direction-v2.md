# 大厅美术第二版

> 历史v2方案。用户最新要求程序绘制的精细像素大厅：hall-v2.png仅保留为构图参考，不再作为新大厅整张运行背景。当前分工与验收见hall-pixel-direction-v3.md。

2026-10-21。用户直接评价旧大厅“太丑了”，因此旧大厅视觉验收不通过。功能联通证据继续保留，不能作为视觉质量或可发布成品的依据。

## 修改方向

- 场景占满视口，替换浅色平面矢量柱廊与大面积网页式卡片。
- 精细的像素绘景：深夜蓝紫暗部、暖金烛火、石材与雕饰、红月画门与爱琴海画门。保留可走地面及花园/收藏的空间位置。
- 大厅人物复用实际主角精灵，保持可辨识尺寸、脚影与走动反馈。
- 界面只保留紧凑角落标题/资源、场景内入口标签、靠近交互提示和可用的快捷入口。
- 主线继续、花园、3D、收藏、暂停/释放等既有契约保留。视觉接入后重新核验热区、四个入口及手机相机。

## 资产

- 项目文件：`public/hub/hall-v2.png`，1672 × 941，非透明场景背景。
- 使用内置 `image_gen` 生成；未调用 API/CLI 备用通道。
- 原始生成文件保留在 `/Users/sunmozong/.codex/generated_images/01a14565-129b-7eb1-b72f-8afcd11da05c/exec-2c60b8f3-8c79-4e22-9871-5e0f56bc2a0a.png`。
- 本资产没有角色、界面文字和按钮；这些由游戏代码实际渲染与交互。生成背景本身不代表功能验收完成。

## 最终生成提示词

```text
Use case: stylized-concept. Asset type: production background artwork for a walkable 2D pixel-art roguelite game hub, landscape 16:9. Create a lavish, beautifully art-directed ancient Greek mythological gallery called the Gallery Between Worlds. It is a real inhabited-feeling fantasy game location, not a website mockup or a flat vector illustration. Premium meticulously crafted high-detail PIXEL ART: visible crisp deliberate pixel clusters, controlled stepped highlights, rich but disciplined texture, no smooth vector edges or photographic realism. A slightly elevated three-quarter frontal orthographic game camera looks into a monumental moonlit marble sanctuary with a broad continuous walkable floor occupying the lower 45% of the composition. Strong clear depth with dark foreground column edges framing the view, intricately carved pillars and a coffered arched ceiling, mosaic stone floor with subtle golden meander borders, hand-worked ancient bronze, ivy, small red anemones and warm braziers. The atmosphere is hushed, magical and inviting; vivid pools of warm amber light oppose deep blue-violet shadows, and a little cool moonlight spills in through the central high arch. Near the rear wall stand TWO large ornate gilded PAINTING PORTALS, left center and right center, clearly distinct and tall enough to read as destinations: left painting at about 28 percent image width contains a crimson moon over dark forest ruins, gold hunting bow and mysterious temple path; right painting at about 72 percent image width contains luminous Aegean turquoise water, cliffs, olive groves and a sunlit Greek temple. Frames have beautiful carved laurels and restrained magical pixel sparks. Between them a recessed shrine with an ancient astrolabe and a small red-flowered altar is set BACK against the wall, not blocking the walkable foreground. At lower left edge, an intimate verdant garden alcove with elegant terracotta pots and leafy olive and laurel plants. At lower right edge, an antique wooden and bronze display cabinet with a few carefully detailed relics, amphorae and a small celestial globe. The lower center floor stays spacious and visually calm so an animated player sprite can stand and walk there. Lush visual detail belongs around the perimeter and destinations, not noisy scattered clutter on the walking area. Build a believable Greek sanctuary rather than generic medieval European castle. Readable architectural silhouettes, exquisite local details and dramatic composed lighting. Color family: deep midnight indigo, aged gold, warm ivory marble, restrained wine-red accents, luminous teal-blue, dark cypress green. Full bleed panoramic background, no surrounding UI borders. Absolutely NO text, letters, interface cards, labels, HUD, logos, watermark, player characters or people: interactive text and character sprites will be added in code. Avoid bland beige wash, flat corporate infographic geometry, flat frontal exhibition poster, huge empty walls, cheap low-detail triangles, excessive bloom, overexposure, blurry pixels and perspective fisheye.
```

## 当前文件所有权

B 已确认 `gallery.ts/gallery.css` 和其子代理全部停止写入、无待落盘修改。这两个文件交由根会话的 `/root/trap_art_docs` 前端代理实现第二版；根负责背景资产与最终视觉验收。B 继续 controller、主线/存档/音频与失败路径。A 继续已派发的图鉴导航小修复，C/D 保持原工作包。
