# D：独立2D钓鱼第一版

2026-10-21，独立钓鱼第一版已完成：真实桌面/触控成功局、失败重试、重载、横屏修复及连续三次退出重入均已验证，可交B/根整合。按[生活玩法范围](../life-loop-v1.md)实施；本包只写`src/sidegames/fishing/**`和本文，不改world3d、公共依赖、主入口、历史tools/playtest.js/output，不提交、推送或部署。

## 接口与可玩内容

```ts
import { mountFishing } from './sidegames/fishing';
const handle = mountFishing({ container, onExit: () => { /* B切回大厅 */ } });
handle.dispose();
```

同步返回`{dispose():void}`；dispose幂等且不重复调用onExit，点击返回会先取消未结尝试、清理模块，再调用onExit。父级负责暂停/恢复自己的Phaser或Three，钓鱼没有控制它们。独立开发入口：[预览](http://127.0.0.1:5210/src/sidegames/fishing/preview.html)，Vite服务session62785；入口源码在本目录preview.html/preview.ts，调用同一个真实mount，无mock。

一处苇影湖浅湾，三种鱼直接读C的FISH/FISH_IDS，不复制鱼目录或奖励。按住约1秒蓄力、松开抛竿；轻触只是试探，浮标明显下沉后约1.8秒内新按扬竿；按住收线会增加进度与张力，松开会降张力并略损进度。鱼有拉扯、冲刺预警和冲刺，太紧断线、过松脱钩，90秒上限，可失败重试。键盘Space/Enter、主按钮鼠标与pointer触摸共用同一机制，不是等时间领奖。此版无独立音频资源；浮标动画、文字和符号同时给提示，reduced-motion保留文字。

## 文件与真实合同

- [index.ts](/Users/sunmozong/Adonis/src/sidegames/fishing/index.ts)：真实C adapter，消费`meta/life.ts`。
- [controller.ts](/Users/sunmozong/Adonis/src/sidegames/fishing/controller.ts)：一次尝试、输入集合、rAF与生命周期。
- [rules.ts](/Users/sunmozong/Adonis/src/sidegames/fishing/rules.ts)：纯规则、稳定seed与有限步进，无DOM/存储/奖励。
- [view.ts](/Users/sunmozong/Adonis/src/sidegames/fishing/view.ts) / [fishing.css](/Users/sunmozong/Adonis/src/sidegames/fishing/fishing.css)：原创SVG湖岸、浮标、阶段提示、张力/进度与响应式控件。
- [规则检查](/Users/sunmozong/Adonis/src/sidegames/fishing/rules-check.mjs)：`node src/sidegames/fishing/rules-check.mjs`。

合同已读取[life-economy-v1](../life-economy-v1.md)：真正开始时`beginFishing()`取得持久化attemptId/seed，已有active使用同ID/seed。仅引擎成功调用`finishFishing(id,'caught')`，失败映射`missed`，退出/隐藏/失焦/直接dispose调用cancel。收益只显示真实receipt的fish/awarded/growth；满仓终结并放归，不重新发奖；duplicate显示历史结果；storage memory明确提示本页临时保存，busy/unsupported按C只读及warning处理。未自建localStorage或重roll奖励。

退出清理rAF、全局键盘/blur/pagehide/visibility监听、profile订阅、局部pointer监听与capture，清空容器。pagehide用capture=true，先于C store的bubble释放写锁；Set聚合Space/Enter避免组合键误释放，终局Enter repeat被拦截，保存重试不随主按钮disabled一起禁用。静态复审已报P2均闭合，当前范围无新增可操作P1/P2。

## 已完成真实证据

证据根目录：`/Users/sunmozong/Adonis/src/sidegames/fishing/evidence`。桌面IAB与Chrome是不同浏览器存档，数量不能相加。

| 检查 | 实际结果 | 证据 |
|---|---|---|
| 桌面完整成功 | IAB键盘，fishing.5，约52.38秒；珊纹鲷0→1、生长+1，settled=true | [成功图](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/desktop-success.png)、[全流程DOM读回](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/desktop-full-round-trace.json) |
| 重载 | 返回idle，珊纹鲷仍1，未因重载重复发奖 | [库存读回](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/desktop-reload-inventory.txt) |
| 完整失败 | 收线中松线过久脱钩，settled=true，三种鱼均0，无扣料/奖励；可点击再抛 | [失败图](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/desktop-result.png)、[过程](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/desktop-play-trace.json) |
| 竖屏触控成功 | Chrome 390×844，真实CDP touchStart/touchEnd，fishing.1，约52.71秒；珊纹鲷+1、生长+1 | [结果](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/portrait-result.png)、[收线](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/portrait-reeling.png)、[触控过程](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/portrait-touch-trace.json) |
| 横屏鼠标路径 | 844×390实际鼠标抛竿/扬竿进入reeling；短横屏隐藏装饰标题后，主按钮y321.59、高49、底370.59，完整可见，张力/进度可见 | [最终图](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/landscape-fixed.png)、[最终尺寸](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/landscape-fixed.json)；修复前图/json保留 |
| 鼠标失败与重试 | fishing.4短抛失败，settled=true；点击再抛后能重新蓄力进入waiting，没有增加鱼获 | [失败图](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/mouse-short-cast-failure.png)、[读回](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/mouse-failure-readback.json) |
| 连续三次退出重入 | 三次连续退出readback的最近尝试为fishing.3/5/6，均saved、active:null、cancelled/awarded0/growth0、host children=0；鱼和生长始终1 | [四次退出原始读回](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/exit-readbacks.json)、[空容器图](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/exit-empty.png) |
| 再进入 | 只有1个钓鱼root，idle、无attemptId、held=false，珊纹鲷仍1；进入本身不新建尝试或发奖 | [干净重入](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/reentry-idle.json) |

[结果索引JSON](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/browser-results.json)保留汇总和原始证据位置；[当前两页console warn/error](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/browser-warnings-errors.json)均为空。内置浏览器不支持发送touch事件，触控成功证据实际来自Chrome；都是桌面浏览器模拟，不冒称手机真机。桌面/竖屏成功后仅追加了短横屏CSS修复和开发入口的只读退出数据，未更改玩法/奖励；最终横屏已实测，不重打无关矩阵。

## 规则和构建边界

纯规则检查已通过：3固定seed合理收放策略57.45/59.017/59.633秒成功、精确复播、提前扬竿/漏咬/短抛/过抛/断线/松脱/超时/取消终态；未写UI单元测试。钓鱼index/preview及真实meta依赖的严格独立TypeScript检查通过。最终`npm run build`（含全仓tsc与Vite）退出0，1157 modules、4.38秒，仅保留既有大chunk警告，见[构建日志](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/build.log)。[源与证据SHA清单](/Users/sunmozong/Adonis/src/sidegames/fishing/evidence/source-manifest.json)供后续整合对齐。

本包范围已收口。B负责大厅调度；本包不冒称主线/厨房/委托全循环、跨模式集成、发布或真机验收。容量满、忙锁、storage failure和v2迁移的权威规则/存储检查由C的`life.checks.mjs`、`storage-v2.checks.mjs`及其交接负责；D未复制或重跑该大矩阵，也没有把普通成功路径说成故障注入验收。
