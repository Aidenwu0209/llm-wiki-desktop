# v0.1.0-rc1 发布说明

`v0.1.0-rc1` 是 unsigned release candidate，仅用于维护者评审、候选发布材料检查和 smoke test。它不是 production-signed distribution；当前不应被描述为 production-ready、signed、notarized 或面向最终用户的 production installer。

## 核心能力

- 本地优先 desktop shell：桌面端负责 vault 管理、导入入口、任务编排、状态展示和错误恢复。
- PDF / 图片提交链路：资料进入 `raw/inbox/`，并在 ingest plan 中展示是否可解析、缓存、阻塞或已发布。
- PaddleOCR-VL-1.5 配置门禁与 artifact contract：未配置 endpoint 和 key env var 时不上传 raw document；有效 artifact 需要满足 manifest / chunks / hash / parser metadata 契约。
- ERNIE provider：provider catalog 和 Settings 中优先展示 ERNIE / 文心一言；默认 key env var 为 `AI_STUDIO_API_KEY`，支持配置自定义 env var。
- Evidence-first answer draft：Chat / Search 基于 vault evidence map 生成答案草稿，no-evidence 场景必须拒答或提示证据不足。
- Proposal-first writeback：query writeback 默认生成 `reviews/query-writeback/` proposal；未批准前不写入 `concepts/` 或 `sources/`。
- Wiki Chat：搜索 sources、claims、concepts、reviews、traceability warnings 和 proposals，并展示 evidence map。
- Graph：展示 source -> claim -> concept / review / proposal / warning 的证据关系，支持阅读路径联动。
- Traceability：定位 evidence anchor、claim/source 断链、artifact/schema 风险和 action cards。
- Reading workspace：支持 source、concept、review、proposal 的主阅读路径、history、back/forward、recent pages 和 relation pane。
- macOS / Windows CI 与 smoke：CI 覆盖 npm install、测试和前端构建；macOS / Windows smoke 脚本已存在。
- Benchmark：`benchmarks/submission-ocr-qa/` 和 benchmark scripts 支持本地 evidence / no-key 报告路径。
- PRD、scoring mapping、governance docs：`docs/PRD.md`、`docs/scoring-mapping.md`、README、CONTRIBUTING、SECURITY、CODE_OF_CONDUCT、ROADMAP、issue templates、PR template 已准备。
- Release 截图清单：`docs/release-screenshot-checklist.md` 覆盖 Dashboard、Raw Sources、Settings Providers、Chat / Search、Graph、Traceability 和 Reading workspace，并明确 demo、live smoke、用户资料截图的脱敏边界。

## 使用前提

- 真实 PaddleOCR live parse 已有脱敏运行报告：[`docs/paddleocr-vl15-real-parse-report.md`](paddleocr-vl15-real-parse-report.md)。发布文案必须按报告记录实际模型、external upload、local-only artifact 和 provider 限制；新的私有文档或新 endpoint 仍需要单独授权后运行。
- 真实 ERNIE evidence-first answer 需要 `AI_STUDIO_API_KEY` 或用户配置的 ERNIE key env var。
- 公共 CI 和本 release candidate 文档不要求真实 OCR / ERNIE key。

## 明确限制

- 未签名。
- 未 notarized。
- 未完成 Developer ID signing。
- 未提供 production installer。
- 不自动上传 raw documents。
- 不自动 apply writeback。
- 不把 fixture、dry-run、template、自测或配置门禁写成 live 成功。
- macOS clean-profile 手动 vault workflow 已在 2026-05-31 用 release DMG 复验；发布后的源码修复补齐独立 release App 误写 `/.cache/llm-wiki-desktop` 的非阻塞 state fallback：[#213](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/213)。
- Windows packaged smoke 仍需完成：[#217](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/217)。

## 发布候选验证范围

本候选版本应至少记录：

- `npm ci`
- `npm test`
- `npm run build`
- 可选：`npm run build:app`

若执行 `npm run build:app`，产物只能描述为本地 unsigned `.app` / `.dmg` 或本地候选 bundle，不得描述为 signed、notarized 或 production installer。

## 已知后续 issue

- [#210 [P0] 真实运行 PaddleOCR-VL-1.5 解析 smoke](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/210)：已提交脱敏 live report，不能提交 local artifact 或 API key。
- [#211 [P0] 真实运行 ERNIE evidence-first answer smoke](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/211)
- [#212 [P0] 发布 v0.1.0-rc1 unsigned release candidate](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/212)
- [#213 [P1] 完成 macOS clean-profile 手动 vault smoke](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/213)
- [#214 [P1] 收集第一轮真实用户反馈](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/214)
- [#216 [good first issue] 补充 ERNIE 配置 FAQ](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/216)
- [#217 [P1] 完成 Windows packaged smoke](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/217)
- [#218 [P2] 支持 query writeback new-file proposal](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/218)
- [#219 [P2] 补齐 Obsidian 式全 vault search-index](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/219)
- [#220 [P2] 增强 backlinks-plus 阅读关系](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/220)

## 安全说明

本 release candidate 不应包含 API key、私有 vault、真实用户资料、私有路径、未脱敏 raw documents、未审核 provider 输出或伪造的 live run 结果。任何真实 OCR / ERNIE 运行报告都应先脱敏，并明确说明 raw document 是否离开本机。
