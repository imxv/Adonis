# r5 D 左岸土体候选

状态：局部工程修复与固定视角 GL 对照已完成，**美术目标未完成、未发布**。左岸旧连续大坡仍明显；南段只有窄台面，北段未成台。本页不把名义轮廓或数值合法当成两层宽台面已实现。

最终源码为 `composition.ts=873c98997a9cf47addafdb951939b8c93641d8d3e7fc93f4fe61216120669143`、`left-bank-profile.ts=a1e71bd9d2d178034f5b1100923a7981c6fa8c3759dee43ab14b8f86b26ada92`、`left-bank-geometry.ts=20ad7b5fa8a8c2baf87241fba15599c58a11d0b57008bd484fdf72340d2a0e9c`。authority `8112d6b9…` / layout `97068a15…` 未变。只在 XZ `[13,23]×[-6,10]` 外侧干土塑形，不改既定 C 接地回调、路线、水面/水路/主瀑、灯光、材质或 A/B/C 源码。

预览固定到 C sanctuary `6f7f5fec…`、banks `325267b5…`、A shrine `533997fd…`、B water `ff5ba027…` / streams `ed22f463…`。服务副本 `/private/tmp/adonis-r5-leftbank-final-preview-20261021` 相比 fix02 实走副本只有上述三份 D 源码不同；下一份 C sanctuary 美术候选和 A/B 后续修改不在本结果内。

## 实际效果与限制

固定 waterfall 同机位、medium、1280×720 的改前图为 `r5/fix-02/waterfall-cold-medium.png`，最终图为 `r5/left-bank-shape/waterfall-after-final.png`。桥北近景分别为 `fix-02/left-bank-bridge-before.png` 和 `left-bank-shape/left-bank-bridge-after-final.png`；原生输入机位从 `[13.00,3.92,14.40]` 到 `[13.05,3.92,14.38]`，仅近似同位，不称逐像素对照。

第一问题点 XZ `[16.48009712,3.32018364]` 的实际 medium 网格由 `3.360472m` 降至 `2.943178m`，削低约 `.417294m`；low 约 `.418432m`。第二点 `[20.24935411,-1.56340408]` 仅下降约 `.037300m`。近景可见前缘凹口，但完整连续鼓坡未解决。

南台面在 `.25m` 退让后的解析核心约长 `2.375m`、最大横宽 `1.125m`，不是 2m 宽完整平台；北台面未形成。当前保护范围压缩了有效塑形空间：核心约 X `15.875..17.5`、Z `6.25..8.625`。这些数值只描述当前候选，不证明冻结范围内所有其他剖面都无法成形。后续可继续在 D 可改域内调整有效核心；若方案涉及相邻 C 桥岸轮廓/外环接地点或壁画路线土翼保护范围，须先协调该最小修改范围。本切片未越过冻结范围，也未修改 C callback。

## 工程保护与验证

原型的窄羽化曾制造新薄墙，首轮宽羽化又几乎抹掉大形，均作为历史候选保留。最终采用局部原三角细分，新增点使用旧粗网格三角面重心高度，再叠加带 `.25m` 退让的局部位移；公共 terrain 回调使用同一退让。法线只允许在实际位移顶点变化，避免通过相邻未移动顶点越过保护边。

两档有限实际 BufferGeometry 复核：136 个 C outer callback 的新增可见面偏差 low ≤`7.67e-7m`、medium ≤`3.86e-7m`；湿域、路线、闭域外及边界样点均在 `5e-6m` 容差内，最大约 `1.9e-6m`。内部开边、非流形、退化面与绕序错误均为 0。D 地面三角数 low `24200→57530`、medium `66500→92726`；没有据此宣称性能改善。

为保持原保护面，保留了旧粗网格与解析高度的差异：有效核心有限采样中 medium 最大约 `.083611m`、low `.220958m`，不称视觉面与走高完全相等。两处已知法线外溢点相对零位移细分基面均为 `0°`；相对原粗网格仍有约 `.0012°–.0019°` 插值残差，不称逐像素光照不变。

最终冻结副本类型检查与 reference-preview 生产构建通过；共享工作区类型检查也曾通过。14 个 Vite HTTP 模块 sourcemap 源内容与最终服务副本 SHA 匹配，结合相同端口的 DOM/原生路线记录定位版本；此项不是浏览器缓存的独立导出。最终水布局 26 个物理字段与冻结 JSON 精确匹配。独立审查未发现新的 P1/P2。禁止 UI 单元测试，本次未新增或运行。

完整证据在 `src/world3d/evidence/reference-v3/r5/left-bank-shape/`：`final-source-manifest.json`、source archive、`final-served-source-readback.json`、`final-runtime.json`、`final-coordinate-readback.json`、两档实际网格报告、法线定点报告与可复现脚本。当前结果是可继续审阅的 D 土体候选，不能代表美术通过或后续 C 版整合通过。
