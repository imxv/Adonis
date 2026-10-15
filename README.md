# Adonis · 画中轮回

网页上的 2D 像素射击肉鸽。阿多尼斯一次次死去，又一次次重生：每一层地牢是随机抽到的一种画风，最后一层永远是那头撞死他的野猪。

- 元气骑士式地牢：异形房间加走廊，进门锁门，清完怪才开门；房间里有掩体、地刺和锯片
- 吸血鬼幸存者式成长：经验宝石、自动法术、法术进化、尸潮房
- 12 把武器、9 种发射方式，所有加成通用于任何武器；3 只宠物；2 个 Boss
- 8 种画风，美术全部由代码生成，音效运行时合成，不使用任何外部图片和音频素材
- 主菜单带存档继续、本机排行榜、游戏说明、图鉴（83 条，从游戏数据自动生成）和设置；游戏中按 Esc 查看本局完整状态

## 运行

```bash
npm install
npm run dev
```

打开 http://127.0.0.1:5173 即可。`npm run build` 会打包出可直接部署的静态网页 `dist/`。

## 操作

| 按键 | 作用 |
|---|---|
| WASD | 移动 |
| 鼠标 | 瞄准，按住左键射击 |
| 空格 | 冲刺（冲刺期间无敌） |
| Q / 滚轮 | 换枪 |
| E / 右键 | 双持，两把枪同时开火 |
| F | 自动射击 |
| Esc | 暂停；在三选一面板里是跳过 |

## 调试参数

| 参数 | 作用 |
|---|---|
| `?seed=42&styles=castle,forest,volcano` | 指定随机种子和画风顺序 |
| `?diff=easy` / `?diff=hard` | 难度 |
| `?god=1` | 无敌 |
| `?room=boss` | 直接从 Boss 房开始 |
| `?weapon=rocket` | 指定初始武器 |
| `?light=0` | 关闭光照 |

## 技术

Phaser 3.90、TypeScript、Vite，音频用 Tone.js。设计文档见 [docs/spec.md](docs/spec.md)。

`tools/playtest.js` 是开发用的自动试玩脚本：在开发服务器页面的控制台里执行 `const pt = await import('/tools/playtest.js'); await pt.start();`，之后 `pt.play(600)` 让机器人自动打 600 帧。

## 字体

- [Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font)（TakWolf，SIL OFL 1.1），许可证见 [src/assets/fonts/OFL-fusion-pixel.txt](src/assets/fonts/OFL-fusion-pixel.txt)
- Press Start 2P（CodeMan38，SIL OFL 1.1），通过 `@fontsource/press-start-2p` 引入
