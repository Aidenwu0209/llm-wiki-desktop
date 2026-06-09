# 第一轮维护者代表试用反馈

## 范围

本报告关闭 [#214](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/214) 的第一轮反馈记录要求。反馈来源不是匿名生产用户，也不是市场背书；它来自维护者代表在 2026-06-08 到 2026-06-09 对桌面端、浏览器预览和 demo/合成 vault 路径的真实试用问题，并已拆分为公开 GitHub issue 和 PR。

## 隐私和同意边界

- 只记录公开 GitHub issue、PR 和已脱敏的产品观察。
- 不记录 API key、私有 vault、本地绝对路径、raw document、未脱敏截图或未审核 provider 输出。
- 维护者反馈只代表当前产品评审视角，不代表外部用户背书或 production readiness。
- 真实观察、维护者表达和工程解释分开记录，避免把解释写成用户原话。

## 场景覆盖

| 场景 | 覆盖路径 | 反馈结论 |
| --- | --- | --- |
| Vault 创建 / 打开 | 浏览器预览、桌面项目切换、新建项目弹窗 | Web preview 必须有 Tauri guard，项目切换器要能可靠关闭，移动/窄屏下创建流程不能裁切按钮。 |
| 资料导入 / OCR | PaddleOCR 配置、live smoke 报告、artifact contract | 真实 OCR 运行必须区分 live / fixture / dry-run；报告只能记录 endpoint host 和 env var 名，不能记录 key 值。 |
| Evidence-first answer | Wiki 问答、搜索、证据图谱、ERNIE smoke | 搜索必须覆盖 vault 对象和解析产物；无证据时不能伪造回答，provider 输出必须受 evidence map 约束。 |
| Graph / 阅读空间 | Obsidian-style graph、reading workspace、backlinks-plus | 图和阅读关系要符合 Obsidian 预期，能解释 backlinks、outbound、source refs、共享来源和 traceability warning。 |
| Traceability | warnings、artifact contract、stale evidence | 用户不应手工判断哪些 artifact 过期或证据断裂；UI 必须把 warning 和 stale/invalid 状态显式展示。 |
| Proposal-first writeback | query writeback、新文件 proposal、审批门禁 | 允许生成 proposal，但不能跳过审核直接改写 `sources/` 或 `concepts/`。 |

## 反馈明细

| 真实观察 | 维护者表达 | 工程解释 | 后续 issue / PR |
| --- | --- | --- | --- |
| 最小桌面窗口高度下左侧导航底部按钮被裁切。 | 底部按钮不可点击会阻塞导航展开和项目切换。 | 导航高度和滚动区域需要给底部动作留固定可达空间。 | [#236](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/236) 已关闭。 |
| Wiki 问答或设置页点击深度研究后按钮 active，但研究面板不显示。 | 入口看起来可点，但实际没有进入功能。 | 页面状态和右侧面板打开状态没有同步。 | [#241](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/241) 已关闭。 |
| 浏览器预览点击新建项目会暴露原始 Tauri invoke TypeError。 | 评委在 web preview 中会看到底层错误。 | 桌面动作必须先经过浏览器 guard，不能直接调用 Tauri invoke。 | [#237](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/237)、[#238](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/238) 已关闭。 |
| 移动宽度下新建项目弹窗、Wiki 问答主体和多个操作按钮溢出或被裁切。 | 窄屏下核心流程不可完整点击。 | 主体 grid、弹窗和按钮行需要改为响应式布局。 | [#239](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/239)、[#240](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/240) 已关闭。 |
| 项目切换器菜单打开后 Escape 和外部点击无法关闭。 | 项目切换必须像桌面软件一样可撤销、可关闭。 | 弹层缺少统一 dismiss 行为。 | [#242](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/242) 已关闭。 |
| 移动 / 窄屏下 Inspector 按钮显示 expanded，但侧栏被 CSS 隐藏。 | 状态和实际 UI 不一致，用户会误判。 | 响应式断点隐藏了详情面板，但没有同步按钮状态。 | [#243](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/243) 已关闭。 |
| 全 vault 搜索最初没有把 OCR / parser artifact 当作一等对象。 | 用户无法判断哪些 PDF 已解析、哪些 artifact 过期。 | Evidence search 需要索引 manifest、chunks、parser model、contract 和 lint metadata。 | [#219](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/219)、[#256](https://github.com/Aidenwu0209/llm-wiki-desktop/pull/256) 已关闭。 |
| 阅读关系面板只展示基础 link/ref，缺少共享来源和 warning 解释。 | Obsidian 式阅读不只是文件列表，需要能理解关系。 | backlinks-plus 需要把共享来源和 traceability warning 放进阅读上下文，并保持只读导航。 | [#220](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/220)、[#257](https://github.com/Aidenwu0209/llm-wiki-desktop/pull/257) 已关闭。 |
| OCR live run 需要真实 endpoint 和 key，但不能让 CI 依赖真实 key。 | 技术难度需要用 live smoke 证明，但不能提交私有材料。 | live 报告记录 endpoint host、env var 名和 artifact contract；CI 只跑无 key 的 contract/self-test。 | [#210](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/210)、[`docs/paddleocr-vl15-real-parse-report.md`](../paddleocr-vl15-real-parse-report.md)。 |

## 后续产品决策

1. 已修复的问题继续保持 one-issue-one-PR 合并纪律，避免把反馈修复混入大重构。
2. 后续外部用户试用仍需单独记录来源、场景、同意边界和可复现证据；不能复用本报告冒充外部用户反馈。
3. 下一轮反馈优先覆盖真实 PDF / 图片提交、PaddleOCR live parse、ERNIE evidence answer、Obsidian graph、proposal writeback 端到端路径。
4. 如果截图或录屏用于 release 材料，必须先按 [`docs/release-screenshot-checklist.md`](../release-screenshot-checklist.md) 脱敏并标注 demo、fixture、dry-run 或 live。

## 状态

- 反馈来源：维护者代表真实试用反馈。
- 私有数据：未记录。
- 可执行问题：已拆分为公开 issue / PR。
- 结论边界：本报告证明第一轮维护者反馈已收集和处理，不证明 production-ready。
