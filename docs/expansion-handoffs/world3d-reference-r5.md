# D · r5 当前组合实景与接线

当前状态：**fix-02 四点/.76m铺石/.08m允许中心域的局部工程整合已完成**：固定 C `6f7f5fec…` 快照的两档有限接触检查与 medium 原生键盘支路往返均已记录，A 泉龛/泉嘴同版读回 `matched`。A `533997fd…`、B `ff5ba027…` 仍是外观候选，**参考图美术未通过，未发布**。下文第一轮三固定机位及低岸桥原路线属于 e671 历史缓存，保留原结论。

fix-02 实走快照的额外承托修订冻结：authority `8112d6b9…`、layout `97068a15…`、composition `05f56a21…`、index `2b128248…`。完整 SHA、给 C 的四点/.28m身体/.08m中心/.14m基础承托 + `.16m additionalSupportClearance` payload 见 `world3d-r5-spring-branch-final.json`；不要把下文第一轮 e671 照片当作此版已加载。

此次仅新增 C 竖向余量并直接透传，有效线性削顶 `.30m`；路线fix-02仍不变。与0055/62e冻结源码比，D走高/通行函数、全部路线/frame/水布局及其余冻结源逐字节不变，30个针对性实际读回一致，typecheck与独立代码复核通过；没有重跑旧控制器/A/B水矩阵。原D域/高度报告保留各自0055/62e哈希，新增证据在 `support-margin/`，不重写历史报告。

`.16m`选择有公式依据：非阶梯分支中心窄带的保守比较界约`.051639m`；后平台允许中心矩形的nearest-canonical-minus-actual最大约`.125522m`，另留`.034478m`工程余量。后者是中心脚底基准比较，不是实际C承托全域证明；C清障胶囊水平仍`.36m`，无法由新增竖向余量扩大覆盖。阶梯优先域仍使用原阶梯承托契约；本次 actual C 身体/`.14m`承托定向检查及同版浏览器结果见下节，未重跑 C 所有者拓扑大矩阵。

## fix-02 固定快照的当前结果

`src/world3d/evidence/reference-v3/r5/fix-02/cold-source-before.json` 记录固定服务副本 `/private/tmp/adonis-r5-fix02-preview-20261021-185542`。本次加载 C sanctuary `6f7f5fec2b7ecfbef19fcc7604151931e97b7979b586d228122f8186d82b681d`、nature `db72e1d2…`、landforms `222ed609…`，桥岸保持 `325267b5…`；A shrine `533997fd…`、B water `ff5ba027…` / streams `ed22f463…`。manifest 的 `browserStatus=not loaded yet` 是加载前状态，后续同一固定副本输入记录在 `fix-02/native-walk.json`。medium renderer 本次实际读回 `1280×720`，不沿用第一轮的 `1600×900`。

`fix-02/snapshot-contacts-archive-manifest.json` 保存报告、原执行脚本与精确 audit module 的哈希关联。33 个导入源码保持稳定，32 个匹配冷启动 manifest，另 1 个 painterly 匹配最终 payload。low/high 各 15 个有限允许中心（支路 10、后沿 5）均可通行，真实 A/C factory 身体样点零冲突；各 255 个 C 承托探针最小约 `.292588265m`，满足 `.14m`，A spout 精确匹配 `[24.6,20.3,-22.8]`。原报告的踏步/转台/底座排除及 instanced-mesh 限制保留；此检查不是连续全域证明，不代表动态水、美术或加载性能通过。

原生 keyboard + drag、无 teleport 的实走从圣林经桥及阶梯到第 8 级 `[18.70,20.96,-25.18]`，经同级侧口 B `[20.16,20.96,-27.10]`、水平转台 M `[20.82,20.96,-27.10]` 到 rear `[23.03,19.72,-25.02]`，向前在 `[23.35,19.72,-24.31]` 止步；再原路回到第 8 级 `[18.74,20.96,-25.18]` 并下至转台 `[19.56,19.62,-20.31]`。Y 为眼高，脚底减 1.72m；实际读回 `springRestored=true`、`springSpout=matched`、三盘 `0,2,3`。该结果关闭本版支路的局部工程待办，不扩展为整世界完整路线矩阵或参考图美术验收。

`fix-02/loading-record.json` 与 `loading-page-trace-prefix.json.gz` 记录了当前页面 frame 对应主线程的实际长任务：已捕获单次 RunTask `2849.421ms`，另有 `1705.409ms` / `1609.883ms`。这是 50MiB 截断前缀中恢复的当前页事件，不是完整加载过程最大值，不能归因为 C 单独构造耗时。重载期间另有一次 3000ms DOM 等候超时，稍后 intro ready；69173ms 观察上界含工具和助手间隔，不是准确加载耗时。稳定 FPS 不能替代这些加载停顿记录。

C 后续 sanctuary-front 独立美术候选将使用新 hash，不能套用本次 C6f 通路证明。D 左岸候选已完成固定 waterfall / 桥北近景 GL：前缘约削低 .42m，但仅南窄台面、北台面未形成，连续大坡仍未解决；详见 `world3d-r5-left-bank-shape-result.md`。A/B 外观候选也不构成最终美术通过。

## 第一轮浏览器版本

现场为 `127.0.0.1:5182`，无 HMR，medium，截图/CSS `1280×720`；renderer 实际 `1600×900`，medium 自己采用 1.25 像素比例，不能把浏览器 DPR override 当作 canvas 分辨率。

`src/world3d/evidence/reference-v3/r5/cold-source-before.json` 与 `served-source-version-check.json` 证明 44 个实际 Vite 模块 sourcemap 内容匹配冷启动前源码；3 个纯类型文件无运行 sourcemap。拍摄后磁盘 A `architecture.ts` 已从 `93369d2c…` 更新为 `d81d4ad7…`，旧现场仍加载 933 版。源内容完整归档为 `served-source-snapshot.json.gz`。

本轮实景是 composition `f7945964…`、layout 入口 `d2448e11…`、接点 authority `e6714720…`、C nature `19b06d57…`、C banks `325267b5…`、C sanctuary `e4cae666…`、C hero tree `281e0463…`、主瀑岩体 `fc87710d…`、B main falls `674856dc…`。对应 A 新两段真实阶梯已经生效，泉龛 facade 尚未加载，DOM `springSpout=unimplemented`。

共同照明保持：ACES exposure 1.05；定向光 `#fff0d8` 3.3、方向 normalize[-.68,.48,.40]；半球光 .45；PMREM 128、共同 scene 环境权重 .2（C authored .55 的显式 envMap 乘后 .11）；Sky 只对可见背景 radiance 乘 .32。未为了单张截图改曝光或各资产反射强度。

## 三张同机位实景

- `src/world3d/evidence/reference-v3/r5/grove-cold-medium.png`：桥、水、完整门廊同框；前基岩仍有大片长斜整面，铺石形态/比例明显人工。
- `src/world3d/evidence/reference-v3/r5/waterfall-cold-medium.png`：冻结两级瀑布及主潭可见；左侧连续陡面与远岸水平终止线仍破坏参考里的低岸、层叠岩台关系。先查实际命中 owner，不把所有露岩都归给 C 或 D。
- `src/world3d/evidence/reference-v3/r5/coast-cold-medium.png`：新低岸桥和整条接近路可见；整体依然由大坡体主导，不能按技术接点匹配判为参考图达成。

初次 grove 运行读回 `authoredStairs=true`、`visibleLandforms=created`、`cascadeRegistration=matched`、`cascadeSupport=created`、`springCarrier=created`；medium 至多 1 次水捕获 / 147456 pixels。实际输入后镜头剔除与异步贴图就绪会改变 draw/geometry/texture 计数，详见 `cold-frames.json` 及行走记录，不将不同视角计数误当稳定资源基线。

## 本轮实际输入

使用浏览器原生 keyboard + drag；IAB pointer lock 被拒绝，未宣称锁鼠验证。连续由海岸 `[11,3.22,43]` 经新低岸桥南端 `[13,3.92,21.57]`、桥冠 `[12.99,4.32,18.02]`、北端 `[12.97,3.94,14.42]`，沿接近路抵达圣林、走过原 grove 拱桥、下段阶梯和真实转台，到上段第 8 级。以上 Y 为眼高，脚底少 1.72m。

低岸桥在冠顶横移至 X `13.77` 后重复按键不再前进，确认新旋转桥也执行 .8m 中央安全半宽。原 grove 桥两端实际读回 `[.96,15.93,-16.02]→[8.20,15.92,-16]`。

三盘实际按 E 旋到 `0,2,3`，DOM `springRestored=true`，随后可见恢复后的上落水和窄渠；这没有消除实际 C 岩体/A 低墙冲突。完整过程在 `actual-walk-before-branch-fix.json`，冲突坐标、最小实际 mesh 探针和已修订权威路径见 `world3d-r5-spring-route-fix.md`。本轮没有重跑 r4 五发现完整矩阵，不把旧五发现证据换标签为 r5。

## 普通出口与圣泉近景

`outlet-near-pool-medium.png` 是桥冠边缘向潭口下看的 medium 现场：口与潭之间未见单帧断水，但 stream 的绿色矩形边界/反光与主潭仍明显不一致。该单帧不能排除高档薄床毫米级嵌土的动态穿闪；也不为此移动整个出口或抬水。

`spring-carrier-restored-before-facade-medium.png` 保存了 A facade 未载入时的真实短承托、接水盆/渠床和恢复水流；高源点此时仍从空中出水，不能把底座18m当成20.3m泉嘴立面已经完成。本次 A 候选的固定快照加载结果另列于上文 fix-02 节，旧照片仍保持原版本归属。

## 资源与验证边界

`resource-single-owner-review.json`：C landforms 在 C nature 的 OwnedSet/PBR 生命周期内；D 不再另建 C 几何或湿石材 owner。三个有限失败/取消检查通过，无所审范围 P1/P2；旧 external C factory fixture 只作历史记录。D carrier 失败保持旧 ground/maps/carriers，C 候选失败保留旧 OwnedSet。

`npm run build` 在第一轮及 branch fix-01 + A facade 磁盘新增后均通过，仅现有大 chunk 提醒。未添加或运行 UI 单元测试，未暂存、提交、切分支或发布。

fix-02 的 D 域、控制器、转角/18m后平台连续性结果保存在 `spring-final-domain-check.json` / `spring-final-domain-review.json`；必要脚本、精确 audit bundle 和冻结源码输入归档于 `spring-domain-scripts/`，SHA 均读回匹配，不依赖临时目录长期存在。旧三点路径及其 A76站/.009885m净距结果仅属历史，未迁移为四点完整身体证明。A 新四点两档实际水平扫掠各6383允许中心的墙投影扣.36m后有.023m净距；其高度采样来自先前 a6a 版，当时未完成62e后平台插值的同版复核，报告保留原SHA。本次 C6f 固定快照的15点有限整合检查单列于上文，不改写该旧报告或扩大其适用范围。

A 泉龛工程磁盘版本 helper `0e9efe82…` 已以 `A-spring-engineering-source.json` 及 source archive 保存；这是先前磁盘工程快照，当时尚未冷加载。本次 fix-02 固定副本已加载 A `533997fd…` 外观候选，不改写旧照片的版本归属。

当前工程进度：C6f 同版局部出口承托、actual D 身体与 A facade/泉嘴的固定快照实走已完成，证据见本页 fix-02 节。后续 D 土体阶段集成 SHA 为 `873c9899…`，只新增局部 profile/mesh refinement；公共高度与可见位移统一 .25m 保护退让，法线泄漏已修复。最终水布局 26 个物理字段已从运行 TS 导出逐项读回匹配冻结 JSON；canonical `8112/9706` 与水/路线接点未变。固定 GL 已完成但美术未通过，详见左岸结果页；新 C 候选需独立整合。所有最终坐标以运行 TS 导出为准，JSON 仅派生记录。

历史中间候选诊断：C 准备期间曾从608更新到实际 bundle `f4c659f7…`，在该确切稳定候选上做了216许可中心的有限整合。low 的 A/C 身体样点零穿体、实际 A spout matched，但一处 actual D 承托距仅 `.132508m < .14m`；high 构造因 `open=4` 中止。详见 `fix02-candidate-f4c-body-check.json` 及 `fix02-candidate-f4c-scripts/` 的原报告/脚本/bundle归档。**该候选失败记录原样保留，不是最终 C 通过**；本次后续 C6f 固定快照结果单列在上节，不覆盖此历史结果。

下一片左岸数值原型已归档 `left-bank-proposal/`，136个实际 C outer callback 与既有路径/水/出口/域外的有限读回均不变；该原型尚不代表仓库地表已改。本次 fix-02 同版支路实走已完成，后续落地仍须固定 waterfall / 近侧面 GL 对照，不能把纯数值原型当形体或美术通过。
