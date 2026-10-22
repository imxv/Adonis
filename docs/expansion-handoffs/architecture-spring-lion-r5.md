# A · r5 狮首出口改形

2026-10-21，最终 `r5-v10-polyhaven`。**当前独立狮首资产可交接；整合场景与参考美术尚未验收。** 原工业式圆管前增加真实雕刻狮首，吻部和下颌包住原管沿，原鬃毛实体向后接到偏心拱肩。保留原石龛、蓝金饰带、台阶、桥、D支承与水路。

预览：[5207圣泉龛实验页](http://127.0.0.1:5207/src/world3d/reference/architecture-spring-preview.html)。证据目录：`/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cb9-dd74-73b0-8fd9-0f2b241ec2bd/architecture-reference/spring-lion-r5/`。

## 来源、许可与改形

有界比较两项来源：[Poly Haven / Lion Head](https://polyhaven.com/a/lion_head)，作者Tina，官方[CC0许可](https://polyhaven.com/license)允许修改、商用与再分发；[Cleveland Museum / Lion's Head](https://www.clevelandart.org/art/1927.27)虽有CC0图像，但未提供可核验的3D下载，因此排除。未使用付费、登录或许可不明的模型。旧自制V7保留作对照，不作为通过版。

采用Poly Haven的glTF/BIN几何；未下载或使用源贴图，也未复制网页预览渲染图。公开资产目录 `public/world3d/reference/architecture/lion-head/` 内有 `SOURCE.md`、`manifest.json`、两档处理后BIN。manifest记录作者、原页、具体许可、精确下载URL、时间、源文件SHA、glTF生成器、工具版本和所有改形参数；上游无语义版本，以2026-10-21下载字节的SHA标识。

原始47,214三角；移除底座后46,880。先按高6500/低3000三角做离线QEM简化，再将闭口的真实吻颌展开、加宽和前移，使其包住原铜沿；保留实际眉眼、鼻、脸颊与鬃毛雕刻。把真实雕刻体沿嘴轴向后扫掠到既有墙面，并将拥挤的右后体收在D支承内；没有新方框背板。最后做墙面裁切及真实布尔开孔，0.5mm容差简化后，各塌缩5条小于0.6mm的细边；检查边链接和面方向，两个实体均保持watertight。生成脚本 `build-cc0-lion.py`、原下载、处理前后PLY和参数报告均留在本次证据目录。

造型壳体的布尔保护孔径为0.305m，**原物理铜喉仍是0.300m**。沿用现有bronze材质与原铜管局部沉积；没有新贴图、脸眼假色、全局改色或光照调整。

## 不变的装配约束

- world源点 `[24.6,20.3,-22.8]`，world方向 `[0,0,1]`，净孔径0.30m，前0.15m直孔和上游偏移铜喉均保留。没有黑片、实心塞、暗盖或隐藏水轴的替身。
- D原点 `[23,18,-25]`、yaw `0.39922076957525304`，载体宽1.72m、长3.473110997362451m；后1.05m空域保持。生产工厂、adapter、D源点和共享契约没有由本切片改动。
- 私有网格以嘴心为零点，U横向/V向上/W朝前。桥接仅对独占geometry副本应用一次basis和嘴心平移；D世界frame仍只由原adapter应用一次。模板缓存、借材质和纹理不转移所有权。

最终铜体实际索引顶点逐点变换范围（不是旋转AABB的角点近似）：

| 档位/空间 | min | max |
| --- | --- | --- |
| high/local | `[0.260149,1.822841,2.187401]` | `[0.847167,2.780563,2.804962]` |
| high/world | `[24.089936,19.822841,-23.096901]` | `[24.805304,20.780563,-22.670159]` |
| low/local | `[0.260149,1.822841,2.187401]` | `[0.847932,2.780458,2.804962]` |
| low/world | `[24.089936,19.822841,-23.097198]` | `[24.806410,20.780458,-22.670103]` |

供D/B对接喷流：雕口外缘向+Z最远约0.13m，继续使用原固定源点；不要改用外壳AABB中心。孔截面向下游0.30m已检查净空，但实验页未渲染D的载体、水盆、水或实际喷流。

## 同版实拍与视觉结论

`final-high-{front,side,mouth,rear}.png` 为四个原固定机位；`final-low-side.png` 和 `final-restored-high-front.png` 为一次high→low→high。六条实际状态保存在 `final-browser-observations.json`。四组high的camera、target、FOV、canvas、曝光、太阳、IBL和AO与0e9逐项相等；全部截图1488×1037，原始字节实际为JPEG，沿用截图API的`.png`文件名，没有合成或二次编辑。high画布1607×1120，low1104×769；console error/warn为空。换档后geometry21/texture35恢复，low21/31；此数不是完整泄漏或VRAM实测。

独立图片复核与根实看确认：狮首辨识、吻颌包口和连续厚铸体接壁成立，高低档均未回退为薄片挂裸管。仍有侧后中部凹口的角状内面、大块平坦侧面与横纹、下颌的硬折面，低档更明显。**结论限于当前资产可交接，不宣称参考美术通过。**

迭代证据保留：V1/V2/V7自制脸的拒绝记录；V9首份真实网格虽像狮子，但圆管遮吻、裸喉与薄鬃仍被拒；V10首次扫掠又发现右侧越界约7.8cm及微面，失败报告另存 `iteration10-candidate-failed-builder-check.json`，最终已修复。`final-visual-review.json`为本版结论。

## 成本和有界验证

| 整龛成本 | 原0e9 | 最终V10 | 增量 |
| --- | ---: | ---: | ---: |
| high三角 / mesh | 6,648 / 5 | 12,706 / 5 | +6,058三角 |
| low三角 / mesh | 4,016 / 5 | 7,526 / 5 | +3,510三角 |
| high几何属性与索引字节 | 659,024 | 1,086,812 | +427,788 |
| low几何属性与索引字节 | 453,056 | 712,228 | +259,172 |

处理后狮首壳体本身high6,138三角/3,067索引顶点，low3,590/1,795；两档BIN共175,080B。同步工厂用234,478B的TS模块内嵌相同Base64字节，避免引入异步加载；CPU原始模板合计175,080B，每次构建复制所用档位再生成私有法线/批次属性。公共目录含BIN与许可记录共182,252B。JS字符串、构建峰值、GPU驱动内存和真机FPS未实测，不把这些数字当VRAM或整帧性能。

- `final-outlet-check.json`：40项定向断言全部通过且同版稳定。四种非铜材质的全部属性与索引和0e9逐字节一致；铜体finite/index/退化/面平均与单顶点法线、支承/可占域/高度/后通路、原脚部、真实嘴环/孔径/源点/轴向均通过。
- 每档73条前直孔射线、25条上游偏移通道射线、73条下游截面射线及1m下游轴线通过。原/新各5个返回geometry恰好释放一次，借材质释放0；私有副本、模板不变与basis变换另有定向报告。
- `final-readback-proof.json`：六条浏览器assembly等于最终定向检查中的D payload，且和0e9装配逐字段一致；canonical SHA `f00cf0aa080959442def153fd422034748039f02b9e4309c6fd3ce9198051391`。D模块虽有并行的其他修改，本payload未变。
- 17个其他建筑/接入/预览源文件与本切片开始前hash相等；最终截图期间三份私有源和所有消费源稳定。公共BIN与运行时内嵌字节逐字节一致，源下载与最终图片hash已记录。
- `npm run typecheck`通过，私有桥接/缓存/法线/释放只读代码复核无新增P1/P2。未写UI单元测试，未跑旧25工厂、48饰带射线或全世界矩阵；未改历史tools/playtest.js/output，未提交、推送或部署。

最终源SHA256：

| 文件 | SHA256 |
| --- | --- |
| `architecture-spring-shrine.ts` | `27f35e959b95be5777245c886ed25127230824fd0210eb0cfa02d505557459d9` |
| `architecture-spring-lion.ts` | `d359ab65a78932f939f042a0225605b9a8ca7daeaed7a7f30a1b6bd1b56edee2` |
| `architecture-spring-lion-mesh.ts` | `dad3542b6c80c57421a282fcd3dc3740c38a5dd6983c4d9db8bd4f9777d061f1` |

原0e9工程版helper SHA `0e9efe82d625ad5d4f59aed0f0786cc51340b8ac2046d178f83e03f8a1c8dcc7`、四张before图、原报告和 `spring-shrine-r5/` 目录均保留。旧V7的两份helper、实拍与报告仍在 `iteration7-*`，没有覆盖D工程快照。
