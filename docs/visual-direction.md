# 万象画廊 · 视觉规范 v1

工作包 A，2026-10-21。消费接口已落盘；旧 UI 迁移须由总指挥协调。本轮方向：**2D 精致像素 / 3D 风格化绘画，同一座美术馆**。

## 可直接消费的接口

```ts
import { VISUAL_THEME } from '../ui/visualTheme';
import '../ui/visualTheme.css';

// CSS 主机必须在旧 #ui-root 外，以真实 CSS 像素布局。
container.classList.add('ag-theme');
const marbleMaterialColor = VISUAL_THEME.world3d.marbleLight;
```

`VISUAL_THEME` 是只读数据：`colors`、`surface`、`text`、`state`、`typography`、`layout`、`motion`、`pixel`、`world3d`。只依赖无渲染器的 `pixel/palette.ts`，不加载 Phaser、Three、DOM、音频或网络。颜色是 `#RRGGBB` 字符串；布局是 **CSS px**；动效是 ms；不要把这些数值当作旧 480×270 游戏坐标。Three 的颜色空间、曝光和光照由 D 负责。

CSS 的所有类、变量、动画和新增字体名均使用 `ag-` 前缀。只在 `.ag-theme` 下声明主题值，不修改 `:root`、`.overlay`、`.frame`、旧按钮或 `#ui-root`。

| 语义 | TS / CSS | 用途 |
| --- | --- | --- |
| 夜色 | `colors.night` / `--ag-night` | 像素描边、夜景；`nightDeep` 作页面底 |
| 象牙白 | `colors.ivory` / `--ag-ivory` | 纸张、石材；正文使用更亮的 `text.primary` |
| 旧金 | `colors.oldGold` / `--ag-old-gold` | 画框、主要操作填充；不滥用发光 |
| 陶土红 | `colors.terracotta` / `--ag-terracotta` | 银莲花、陶器、危险操作填充 |
| 海蓝 | `colors.seaBlue` / `--ag-sea-blue` | 爱琴海、选中项底色 |
| 柏树绿 | `colors.cypressGreen` / `--ag-cypress-green` | 圣林与花园，不直接作小字 |

陶土环境色为 `E.rust`；危险按钮为确保小字可读，使用更深的 `state.dangerFill` / `--ag-danger-fill`。不要直接用深绿或陶土色画暗底上的 12px 状态字；使用 `state.success / warning / danger` 的亮色版本。图案、正文和按钮样板及核验结果见 [art-review.md](art-review.md)。

## 原有资产与字体

`src/pixel/palette.ts` 的 Endesga 32 保持不变。夜色、象牙白、陶土、海蓝、柏树绿直接取 `E.ink / E.cream / E.rust / E.blueD / E.greenDD`。旧金、石白与次级文字是扩展的界面/绘画色，不反向重绘现有精灵。

中文沿用本地 FusionPixel 12px；标题可用 24px。英文眉题沿用 `src/fonts.ts` 的 Press Start 2P 8px（由宿主加载），缺省回退本地像素字体。不要用 8px 英文字体画中文。正文 12px、24px 行高、每行约 24–32 个汉字；标签与按钮也保持 12px，不用缩放把文字挤进框内。旧 `pxhtml.ts` 用 canvas 文字图，继续等待字体就绪并保留原有 raster 管线；新主机优先真实文字与原生按钮，便于选择、读屏和换行。`ag-title / ag-heading / ag-copy / ag-caption / ag-notice / ag-input` 显式允许文字选择，覆盖既有 body 的禁止选择继承。

像素图仅按 1/2/3/4 整数倍显示，设置 `image-rendering: pixelated`，宽高同时指定为原图尺寸乘整数。不得 `width: 100%` 任意拉伸、平滑过滤或对图像做旋转/比例过渡；空间不足时缩到下一个整数倍、重排或裁取场景。3D 绘画材质和普通相片不加该样式。

## 布局与组件样板

```html
<section class="ag-theme" aria-label="画廊">
  <div class="ag-shell ag-stack">
    <p class="ag-eyebrow">THE GALLERY · I</p>
    <h1 class="ag-title">万象画廊</h1>
    <div class="ag-meander" aria-hidden="true"></div>
    <article class="ag-frame ag-stack">
      <span class="ag-badge">主线画作 · 像素冒险</span>
      <h2 class="ag-heading">血落处，银莲花再开</h2>
      <p class="ag-copy">从画廊启程，带回新的故事。</p>
      <button class="ag-button ag-button--primary">进入画作</button>
    </article>
  </div>
</section>
```

可用类：`ag-shell / ag-stack / ag-row / ag-grid` 排版，`ag-frame` 双层硬边画框、`ag-frame--inset` 内嵌底，`ag-eyebrow / ag-title / ag-heading / ag-copy / ag-caption` 文字层级，`ag-button` 及 `--primary / --danger`，`ag-badge` 及 `--success / --warning / --danger`，`ag-notice / ag-input / ag-link / ag-rule`，`ag-pixel-art / ag-art-window`，`ag-meander / ag-enter / ag-sr-only`。变体类同时保留基础类。

原生 `disabled` 由浏览器阻止动作；`aria-disabled` 只提供样式与语义，宿主仍需拦截激活。选择项应设置 `aria-pressed` 或规范的 tab/listbox 语义，并提供“已选择”等文字，不能只变颜色。`ag-art-window` 只裁切装饰画，不包住可操作按钮或正文。组件没有脚本和生命周期，不会替代消费方的业务行为。

## 构图、交互与触控

- 大厅每屏一处主画作焦点，说明与行动放在安静暗底。画框承载画作，不能把每段文字都做一层复杂金框。四角、回纹、星象是节制的边缘装饰。
- 外边距桌面 24px、窄屏 16px；间距以 4px 为步长。正文与操作不与动态画面重叠。屏幕变窄时重排并允许主机滚动，不能缩小整页。
- 所有主要可点击区域至少 48×48 CSS px，邻近操作间距至少 8px。手机横屏尊重安全区；竖屏仍可浏览并返回，不能强制等待旋转。
- 键盘焦点用 2px 海色浅边，保留 4px 外距，不能被裁切。每个入口具有真实名称与返回动作；颜色之外再用文案、位置或轮廓传达状态。
- 反馈 120ms、进入淡显 180ms，不以缩放/旋转破坏像素边界；`prefers-reduced-motion` 下即时呈现。避免无限闪烁、白色扫光和整屏粒子干扰阅读。

## 3D 绘画翻译

海岸的冷蓝与云雾先建立深度，陶土、石白与深绿组成可辨识的近景轮廓；同一材质用大色块的明暗变化。石材有暖亮面、冷阴影和少量风化笔触，避免纯白塑料、均匀噪点或满屏粗糙度闪点。柏树用成团的轮廓与受光面，海面控制高光面积，地标比重复柱阵更突出。

物件交互的强调色是旧金/象牙白，并配准星提示和名称；不要让每个可收集物常驻霓虹外发光。远景饱和度降低，当前可达路径保持明度分离。叙事与谜题线索用真实图形和文字，不能靠颜色单独编码。原型画面必须标注实际渲染与样板的区别；本规范不代表首区已经完成。

## 素材来源

现有精灵由项目的 `pixel/**` 与 `styles/textures.ts` 生成；沿用原有资源与字体许可证。新增回纹为本项目原创 24×12 SVG tile，内嵌在 `visualTheme.css`；无需外网、无第三方图。未引入图片生成、外部游戏素材或新依赖。
