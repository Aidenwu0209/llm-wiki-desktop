# LLM Wiki Desktop PRD

## 1. 一句话定位

LLM Wiki Desktop turns submitted PDFs and images into an evidence-first, reviewable, agent-readable local wiki.

中文解释：
LLM Wiki Desktop 将用户提交的 PDF、图片和文档材料解析为可追踪、可审查、可问答、可写回的本地知识库。

## 2. 背景与问题

用户面对 PDF、图片型文档、科研论文、学校制度、申报材料时，常见问题不是“能不能看到文件”，而是这些材料很难沉淀成可信知识层：

- PDF / 图片难以结构化，章节、表格、图片、页码和来源关系容易丢失。
- 普通 OCR 通常只输出文本，不保留 source、page、region、chunk 等证据锚点。
- 普通 RAG 回答不可审计，用户很难判断答案是否真的来自本地材料。
- 大模型回答来源不透明，缺少 citation coverage、unsupported claim 和 traceability break 指标。
- 自动写回会污染知识库，尤其是未审查的总结、预测或模型幻觉被直接写入 concept/source 页面时。

LLM Wiki Desktop 的产品边界是 runtime-first：桌面端负责 vault 管理、文件导入、任务编排、状态展示和错误恢复；知识生成、QA、review queue、writeback approval 等核心边界仍由 `open-llm-wiki` runtime 或明确 adapter contract 执行。

## 3. 目标用户

- 科研人员 / 研究生 / 博士：把论文、实验报告、制度材料编译成可追踪、可复审的研究知识库。
- 学校 / 企业文档管理人员：把申报、制度、评审、培训等 PDF / 图片材料整理成本地 evidence wiki。
- AI Agent 使用者：让 Codex、Claude Code 或本地 agent 把 vault 当作长期记忆和可审计知识层，而不是直接读未结构化文件夹。

## 4. 核心场景

- 20 篇以上论文编译为可追踪知识库：用户导入论文 corpus，桌面端规划 ingest，runtime 生成 source、claim、QA、review、concept 和 traceability 状态。
- 项目申报 PDF / 图片转 evidence-first wiki：用户提交扫描件或图片材料，PaddleOCR-VL-1.5 计划门控解析，artifact manifest 通过后才进入 runtime ingest。
- Agent 把本地 vault 当作长期记忆和可审计知识层：只读 agent API 必须先通过 readiness gate，agent 查询需要返回 evidence reference，writeback 只能 proposal-first。

## 5. MVP 范围

- Vault 创建 / 打开：创建或打开 `open-llm-wiki` vault，并阻止用户把原始 PDF 文件夹误当成生成后的 vault。
- PDF / image / Markdown / txt / zip 导入：导入到 `raw/inbox/`，保留路径上下文、记录 SHA-256、过滤危险 ZIP 条目，不静默上传 raw documents。
- PaddleOCR-VL-1.5 plan gate：PDF / 图片默认进入 OCR plan；未启用 parser、endpoint 缺失或 `PADDLEOCR_API_KEY` 不可见时阻塞，不上传文档。
- Artifact manifest：parser output 必须有 source id/path/hash、parser metadata、chunk/page 信息、artifact hash、limitations 和 latency 等 contract 字段。
- Runtime ingest：通过 allowlisted `open-llm-wiki` runtime scripts 执行 parse、source discovery、claim extraction、QA、review、contradiction、concept revision、lint/eval 等流程。
- Evidence map：展示 source、claim、concept、review、proposal、warning 之间的证据关系，帮助用户定位 traceability break。
- ERNIE evidence-first answer：在 `AI_STUDIO_API_KEY` 可见且用户选择 provider 后生成带证据引用的 answer；无证据时应拒答或标记 unsupported。
- Query writeback proposal：把 grounded answer 转成 `reviews/query-writeback/` proposal，必须先展示 diff 或写入计划，未经审批不得写入 `concepts/` 或 `sources/`。
- Obsidian 打开：从桌面端打开生成后的 vault 或入口 note，并提供 Copy URI、Copy path、Reveal、Open folder fallback。
- macOS / Windows smoke：macOS 打包/clean-profile smoke 与 Windows dev/manual smoke 均需记录，CI 只能替代自动化可覆盖部分。
- Benchmark：用 OCR + ERNIE + Evidence Wiki benchmark 报告 parse、manifest、citation、unsupported claim、traceability、latency 和 no-evidence refusal 指标。

## 6. 非目标范围

- 不是普通聊天机器人：回答必须受 vault evidence 和 provider/writeback 边界约束。
- 不是纯 OCR 软件：OCR 只是 evidence artifact 入口，后续仍需 source、claim、QA、review 和 concept 流程。
- 不默认上传 raw documents：hosted parser / provider 必须显式配置、显式触发，并遵守 key 不落盘规则。
- 不绕过 proposal-first writeback：模型输出不能直接污染 concept/source 页面。
- 不替代人工学术判断：science review、manual approval、最终判断仍需要人类确认。
- 不伪造审批：桌面端不得把 pending review、fixture、dry run、mock 或 template 写成真实 live 成功。

## 7. 功能需求

| ID | Requirement | Acceptance Boundary |
| --- | --- | --- |
| F-001 | Vault management | 创建、打开、恢复 vault；识别 workspace root / raw folder / generated vault 的差异。 |
| F-002 | File import | 支持 PDF / image / Markdown / txt / zip 导入，记录 hash、target path、ignored reason，并阻止 traversal / symlink escape。 |
| F-003 | PaddleOCR-VL-1.5 parser plan | 默认 PDF / 图片进入 OCR plan；缺 endpoint/key/enablement 时显示 blocked 状态且不上传 raw document。 |
| F-004 | Artifact contract | parser artifact manifest 必须可校验；invalid artifact 不能进入 runtime ingest。 |
| F-005 | Runtime pipeline | 桌面端只编排 allowlisted runtime scripts，不接管核心知识生成或 review/writeback 边界。 |
| F-006 | Evidence map | 展示 source -> claim -> concept / review / proposal / warning 关系，并暴露 traceability break。 |
| F-007 | ERNIE provider | 从 `AI_STUDIO_API_KEY` 或安全进程环境读取 credential；不保存、不打印、不截图 key 值。 |
| F-008 | Evidence-first answer | 回答必须引用 vault 内 evidence id；证据不足时拒答或明确 unsupported。 |
| F-009 | Query writeback proposal | 生成 proposal-first artifact；未经明确 approval 不写入 `concepts/` / `sources/`。 |
| F-010 | Reading workspace | 在桌面工作区阅读 source、concept、review、proposal，并可跳转 Obsidian。 |
| F-011 | Benchmark | 生成 benchmark JSON/Markdown，区分 local fixture、optional live OCR、optional live ERNIE。 |
| F-012 | Smoke tests | 覆盖 npm/Rust build-test、macOS local packaging、Windows manual/dev smoke 和 provider/env visibility checks。 |

## 8. 成功指标

| Metric | Target Meaning |
| --- | --- |
| `parse_success_rate` | 解析样本中成功生成 evidence artifacts 的比例。 |
| `manifest_valid_rate` | artifact manifest 通过 contract 校验的比例。 |
| `citation_coverage` | evidence-first answer 命中并引用必需 evidence ids 的比例。 |
| `unsupported_claim_count` | 缺证据却输出为可信结论的数量，应持续下降并在 release evidence 中暴露。 |
| `traceability_break_count` | source / artifact / claim / concept 之间断链数量，应被 UI 和 benchmark 显示。 |
| `no_evidence_refusal_rate` | 对无证据问题正确拒答或阻塞写回的比例。 |
| macOS / Windows smoke pass | macOS clean-profile、本地 package、Windows dev/manual smoke 的通过情况与证据路径。 |
| release readiness | `npm ci`、`npm test`、`npm run build`、相关 Rust tests、`npm run build:app` 和手动 release checklist 状态。 |
| user feedback count | 明确记录的用户体验反馈、可复现问题和 one-PR scope 数量。 |
