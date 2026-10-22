# D · r4 结构整合与实际行走

2026-10-21。**构建与路线可用，美术仍未通过，不提交、不推送、不发布。** 本轮接收A第三切片、C冻结主瀑岩体及B当前水体；B闭合水瓣落唇动态修正仍是中间版本，不把它当最终包络验收。

## 同版三机位

本轮为重启隔离Vite后的冷启动，禁用HMR；1280×720 canvas，DPR1，medium，FOV60。完整源码逐文件SHA在 `src/world3d/evidence/reference-v3/r4/cold-source-before.json`，各帧实际全pass指标在同目录 `cold-integration-result.json`。**截图期间磁盘nature-trees/water-falls/water-falls-shaders有更新，故不声称磁盘稳定或已展示其最新版。** 已从同一Vite缓存的inline sourcemap.sourcesContent回读原始源码，34个有运行内容的模块全部与before清单匹配；另两份纯类型文件被擦除，磁盘未变。见 `served-source-version-check.json`，当时原文另存 `served-source-snapshot.json.gz`。这些图为可确认的旧载入候选，非后续C/B冻结新版、非参考图、非真机结果。

| 机位 | 眼位 / yaw / pitch | 图 |
| --- | --- | --- |
| 海岸 | `[11,3.22,43] / .04 / .09` | `coast-cold-medium.png` |
| 圣林 | `[-5,13.72,0] / -.16 / .16` | `grove-cold-medium.png` |
| 瀑布 | `[24,3.22,20] / -.27 / .09` | `waterfall-cold-medium.png` |

共同光照：ACESFilmic，曝光1.05；太阳方向normalize`[-.68,.48,.40]`、色`#fff0d8`、强度3.3；半球光0.45；PMREM128，environmentIntensity=.2，背景天空独立辐射系数.32；A/C显式材质环境权重由D统一应用。没有以加雾或整体去饱和掩盖差异。

核心源码：layout `d0de7852…`、composition `a63a7353…`、route-surfaces `f557de44…`、support `9f01cb08…`；C岩体 `fc87710d…`、cascade变换辅助 `735bcbe4…`；A/B/C全部模块完整hash以冷启动清单为准，避免只记工厂入口而漏其依赖。

本次实际C树木 `48e38a3b…`、B falls `364681c8…`/shader `f4c8e31d…`。随后根通知的新冻结C树木`281e0463…`、B falls`674856dc…`/shader`e11fdbc5…`不属于本组图，留到下一次明确冷启动接收。近景为 `porch-cold-medium.png`、`bridge-{west,east}-bank-cold.png`、`north-channel-cold-medium.png`，均与这份缓存载入版本相同。

## 本轮结构变化

- A桥实际总宽2.4m；D桥面/铺石排除由layout派生±1.2m。通行从A实际footprint读取中央半宽.8m，不再由2.8m旧路径放宽桥面。3,577个桥面样本及铺石排除有限检查通过，见 `bridge-width-freeze-check.json`。
- 路面改为真实厚度铺石/44级台阶；同一可走面采样用于生成和输入。路面只有2draw，medium约38,300三角；同步生成一次约1秒，非逐帧成本。未写UI单元测试。
- 主瀑岩体保持固定米制变换及水端点；D仅从实际最低向下cap提取轮廓，在其下埋托，不造bbox垫块、不把D承托当主崖。当前双档检查结果与历史cap问题分开，详见 [局部接缝记录](world3d-cascade-r4-seams.md)。
- 图层碰撞按当前LOD实时读取；承托随C模型/地面候选原子替换，借用材质统一归地面所有，失败/取消/退出保留已验证的资源回收边界。

## 真实输入路线与边界

`traversal-live-result.json` 记录了本次连续键盘+拖拽路线。浏览器拒绝pointer lock，因此仅声明实际拖拽观察与WASD/Shift/E输入通过。该连续路线在最终桥宽同步、支撑底再下压3cm之前完成；不能把它伪称后续源码的全量重测。后续变化分别由桥宽有限检查和承托几何检查覆盖。

从海岸依次到星盘、壁画、誓言碑、桥、阶梯、圣泉、神殿。三盘实际转为`[0,2,3]`；解谜前山门在`[14.74,23.10,-27.28]`挡住前进，解谜后走至内殿`[15.26,23.72,-38.52]`。桥中心向侧面移动在约Z=-16.78停止，重复输入不再推进。圣泉支路在同一台阶高度横出，没有原先的直接斜出高差。

五个发现均由真实E交互触发并从onDiscover读回：`greek.coast.navigator`、`greek.coast.tide-mural`、`greek.grove.olive-oath`、`greek.grove.spring-restored`、`greek.temple.first-light`。画册可逐项翻阅；退出画布数量0；同页重入entries=2且五项收藏保留，谜题状态按现有设计重置。相关PNG在 `r4/`，控制台无警告/错误。

## 明确未通过的视觉问题

1. 圣林机位已能同时看见完整屋顶/门廊、桥与水，但D裸露地形直壁、地表材质拉伸仍明显。瀑布机位左侧高墙来自抬高泉池的硬边：池床约10.5–11.3m，外侧原地约1.4m，当前collar只削低、不形成实体下接岸体。不能把这片墙误认为C主瀑岩体。
2. 神殿前矩形地台在Z=-28附近形成突升，阶梯侧也有硬边；当前C sanctuary-base实际范围不覆盖该前沿，不能直接删D壁后声称已藏在岩体内。桥东到阶梯的部分路径还需真实岸堤承载，检查“canWalk=true”不等于铺石下方已实体接地。
3. 北岸可达相机`[18.15,21.09,-24.67]`、yaw约-2.294/pitch约-.216仍看到悬空圣泉。`north-channel-before-solve.png`与`north-channel-after-solve.png`证实解谜前后均在。B的`water.sacred-spring.channel-bed`是单层条带，没有侧壁/底厚；前三段离D地面约1–15m，计入C真实岩体局部仍近12m。D现有主瀑底承托不承载圣泉；只改颜色或补整条高墙均不能作为自然水道验收。实际双档剖面见`sacred-spring-carrier-audit.json`。
4. C主体仍有圆钝大面/长水平层线；A人物/石材、天空/石材/水深的最终显示关系仍与固定参考有差距。当前图不标任何相似度百分比。

后续优先处理实际可见岸体与圣泉实体水路，再做共同光照下的局部颜色/材质校准。本轮不扩区域，不重复已清零的全套规则矩阵；`npm run build`通过，仅有现有大chunk警告。

北岸冷启动图实际相机`[18.14,21.09,-24.66]`。CPU几何拾取条带内部像素`(650,510)`：先B透明水6.033m，再B渠床6.497m、基色`#706f50`，最后C岩体9.846m；D support无命中且最高Y=-.142466。旧像素`(300,450)`在当前构图先命中C岩，不强行沿用旧像素归因。见`north-current-pick.json`；该检查以不变的stream几何为准，不评价后续B fall的GPU动态。

下一切片的有界改造/各组接点见 [r5地形与路线方案](world3d-r5-landform-plan.md)。它仍是提案数据，运行坐标权威暂为r4 layout d0de；尚未修改A/C生产源或混入本轮截图。
