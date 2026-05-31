# 需求同步：LLM Wiki Desktop RC 快速交付状态

最后更新：2026-05-31
仓库：`Aidenwu0209/llm-wiki-desktop`
范围：基于当前 `main` 的快速交付整理；本轮不做新功能开发、不做真实 OCR / ERNIE live run、不做端到端 demo report。

本文只记录当前可交付状态和剩余工作。不要把 fixture、dry-run、template、配置门禁或脚本自测写成真实 live 成功；不要声称 unsigned bundle 已 production-ready、signed 或 notarized。

## 1. 交付边界

桌面端负责 vault 管理、文件导入入口、任务编排、状态展示和错误恢复。知识生成、QA、review queue、writeback approval 等核心边界仍由 `open-llm-wiki` runtime 或明确 adapter contract 执行。

必须保持的边界：

- 不提交 API key、bearer token、私有 vault、私有路径、真实用户资料或未脱敏 raw document。
- 不默认上传 raw documents；PaddleOCR hosted endpoint 必须由用户显式配置 endpoint 和 key env var 后才可调用。
- 不绕过 proposal-first writeback；未批准前不得自动写入 `concepts/` 或 `sources/`。
- 不伪造人工审批、provider live answer、PaddleOCR live parse、Windows packaged smoke 或 macOS manual vault smoke。
- 不修改 OCR / ERNIE / runtime / writeback 核心逻辑来完成本次交付。

## 2. 当前已完成能力

### 2.1 产品与治理文档

- PRD：`docs/PRD.md` 已覆盖产品目标、evidence-first 边界、评审口径和不伪造审批原则。
- Scoring mapping：`docs/scoring-mapping.md` 已把评分项映射到 benchmark、traceability、evidence answer、governance 和 release readiness。
- Governance docs：`README.md`、`CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`、`ROADMAP.md`、issue templates、PR template 已进入仓库。
- Release readiness：`docs/release-readiness.md` 已区分 local trial、desktop dev、release candidate 和 formal distribution。
- Benchmark docs：`docs/benchmark-plan.md`、`docs/benchmark-report-template.md` 和 `benchmarks/submission-ocr-qa/` 已提供本地 benchmark 输入与报告模板。

### 2.2 桌面工作区

- Welcome onboarding 和 demo vault 可展示 OCR -> Evidence Wiki -> ERNIE answer draft -> writeback proposal 的评审路径。
- Project switcher / recent vault / detected vault 已在 rail 中展示，减少顶部状态条堆叠。
- Reading workspace 已支持 source、concept、review、proposal 的主阅读路径，以及 history、back/forward、recent pages 和 relation pane。
- Wiki Chat / Search 已能搜索 sources、claims、concepts、reviews、traceability warnings 和 query writeback proposals，并生成 evidence-first answer draft 与 proposal-first handoff。
- Graph 已展示 source -> claim -> concept / review / proposal / warning 关系，支持过滤、legend、节点打开阅读页和路径联动。
- Traceability 页面已展示 evidence anchor、claim/source 断链、artifact/schema 风险和 action cards。
- Raw Sources / Reading workspace 已支持 PDF、图片、Markdown、txt、zip 的提交链路和导入状态展示。

### 2.3 OCR / ERNIE / artifact contract

- PDF / 图片默认进入 PaddleOCR-VL-1.5 计划路径；未配置时显示 `paddleocr_config_required`，不上传 raw document。
- PaddleOCR-VL-1.5 设置入口已覆盖 endpoint、model、API key env var、test connection、test parser、ready / missing / failed / artifact-valid 状态。
- Parser artifact contract 已覆盖 manifest、chunks、source hash、artifact hash、parser metadata、page count、chunk count、latency 和 limitations。
- Invalid parser artifact 会阻止 runtime ingest；只有 contract 通过的 artifact 才能进入后续流程。
- ERNIE provider 已在 provider catalog / settings 中优先展示；默认 key env var 为 `AI_STUDIO_API_KEY`，可配置自定义 env var，key 值不落盘。
- ERNIE evidence-first answer 自测覆盖 missing key、mock citations、unsupported claims、no-evidence refusal 和 key redaction。
- 公共 CI 不依赖真实 OCR / ERNIE key；live smoke 仅作为本地可选验证。

### 2.4 CI、smoke 与跨平台准备

- macOS / Windows CI 已覆盖 npm install、测试和前端构建路径。
- `npm test` 已串联 welcome、vault tree、ingest plan、provider catalog、ERNIE self-test、OCR contract self-test、TypeScript typecheck 和 Rust tests。
- `npm run build` 已执行 TypeScript build 和 Vite production build。
- `npm run build:app` 可生成本地 unsigned `.app` / `.dmg`，但不代表 signed、notarized 或 production installer。
- `scripts/smoke/macos-clean-profile.sh` 和 `scripts/smoke/windows-dev.ps1` 已提供 smoke 入口。
- macOS clean-profile 自动 smoke 已有记录；2026-05-31 release DMG 手动 vault workflow 已完成人工记录，覆盖临时 vault 创建、sample 导入、manual plan、Dashboard、Raw Sources 和 Wiki Chat。该 run 发现一个非阻塞 standalone cache state 错误，本 PR 修复。

## 3. 当前未完成项

必须继续保留为未完成或待验证：

- 真实 PaddleOCR-VL-1.5 live parse：需要 `PADDLEOCR_API_KEY` 和真实 endpoint；跟踪 issue：[#210](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/210)。
- 真实 ERNIE evidence-first answer：需要 `AI_STUDIO_API_KEY` 或自定义 ERNIE key env var；跟踪 issue：[#211](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/211)。
- `v0.1.0-rc1` unsigned release candidate：GitHub pre-release 和 macOS DMG 已存在；仍不得描述为 production-ready、signed、notarized 或正式 installer。
- macOS manual vault smoke：2026-05-31 已用 `v0.1.0-rc1` release DMG 完成临时 vault 创建、导入 sample、manual plan、Dashboard、Raw Sources 和 Wiki Chat 复验；跟踪 issue：[#213](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/213)。
- 用户反馈 round 1：不能伪造真实用户反馈；跟踪 issue：[#214](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/214)。
- Windows packaged smoke：CI / dev smoke 不等同 packaged desktop smoke；跟踪 issue：[#217](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/217)。
- Query writeback new-file proposal：missing target 的 new-file proposal 仍需 runtime / desktop 兼容工作；跟踪 issue：[#218](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/218)。

## 4. 剩余任务优先级

### P0：RC 交付阻塞

- Apache-2.0 LICENSE：本快速交付 PR 补齐标准许可证文本、README / CONTRIBUTING / package metadata 和 changelog 记录。
- `v0.1.0-rc1` unsigned release candidate：GitHub pre-release / DMG 已存在；本轮补齐 release DMG manual vault smoke 证据和 standalone cache state 修复。
- 中文 roadmap issues：本快速交付 PR 已创建 [#210](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/210) - [#220](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/220)。
- 真实 OCR / ERNIE issue 跟踪：PaddleOCR live parse 由 [#210](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/210) 跟踪；ERNIE live answer 由 [#211](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/211) 跟踪。

### P1：发布候选后的人工验证

- macOS clean-profile 手动 vault smoke 后续：确认本 PR 的 standalone cache state 修复进入下一版 packaged build；[#213](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/213) 可随本 PR 合并关闭。
- Windows packaged smoke：[#217](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/217)。
- 用户反馈 round 1：[#214](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/214)。

### P2：体验增强与后续产品化

- Query writeback new-file proposal：[#218](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/218)。
- Obsidian 式全 vault search-index：[#219](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/219)。
- Backlinks-plus 阅读关系增强：[#220](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/220)。

## 5. v0.1.0-rc1 本轮准备内容

当前目标是把仓库整理到可评审的 unsigned release candidate 后续验证状态：

- 补齐 `LICENSE` 和 Apache-2.0 元数据。
- 新增 `docs/release-notes-v0.1.0-rc1.md` 和 `docs/release-publish-checklist.md`。
- 更新 `CHANGELOG.md`，记录许可证、RC 文档和中文路线 issue。
- 更新 macOS smoke 文档，明确自动 smoke 通过记录、`build:app` 记录、2026-05-31 release DMG manual vault workflow 结果和 standalone cache state 修复。
- 创建中文 roadmap issues，并把真实 OCR / ERNIE / release / manual smoke / Windows / feedback / docs 增强纳入跟踪。

本轮不做：

- 不重新创建 `v0.1.0-rc1` tag。
- 不重新发布 GitHub Release。
- 不运行真实 PaddleOCR 或 ERNIE live call。
- 不做 Developer ID signing、hardened runtime、notarization 或 stapling。
- 不提供 production installer。
- 不自动上传 raw documents。
- 不自动 apply writeback。
