# LLM Wiki Desktop

本仓库是 `open-llm-wiki` 的本地优先桌面端外壳。桌面端负责 vault 管理、导入入口、任务编排、状态展示和错误恢复；知识生成、QA、review queue、writeback approval 等核心边界仍由 `open-llm-wiki` runtime 执行。

## MVP 能力

- 创建或打开 open-llm-wiki vault。
- 将 PDF / Markdown / txt 导入到 `raw/inbox/`，并按 SHA-256 跳过重复文件。
- 生成桌面端 ingest plan：扫描 `raw/inbox/` 与 `raw/*_markdown/combined.md`，按 SHA-256 标记 desktop-only 的 `ready`、`stageable`、`blocked`、`cached`、`published`，并写入 `_state/desktop-ingest-plan.json`。
- 对 Markdown / txt 输入执行本地 staging，生成 `raw/<source>_markdown/combined.md`、`manifest.json` 和 `chunks.jsonl`，再交给 open-llm-wiki runtime。
- 对 PDF 输入优先调用 runtime `pdf_to_markdown.py --parser auto` 本地解析；只有用户显式选择 `layout-api` 且允许云解析时，才允许外部 parser 路径。
- 一键运行串行 ingest pipeline：PDF parse -> source discovery -> corpus ingest -> claims -> normalize -> semantic QA -> contradictions -> science review -> concept revision -> lint -> dashboard refresh。
- 成功完成 pipeline 后写入 `_state/desktop-ingest-registry.jsonl`，避免未变化输入反复触发整条 ingest 链路。
- 规划时生成桌面侧核心 contract：`desktop-source-registry.jsonl`、`desktop-artifacts.jsonl`、`desktop-ingest-jobs.jsonl`、`desktop-actions.jsonl`、`desktop-impact-graph.jsonl`。
- 检测 vault schema、runtime 是否安装、Obsidian profile 是否启用。
- 调用白名单 runtime 命令：
  - `pdf_to_markdown.py`
  - `wiki_lint.py`
  - `wiki_obsidian_setup.py`
  - `wiki_status.py`
  - `wiki_discover_sources.py`
  - `wiki_ingest_corpus.py`
  - `wiki_claims.py`
  - `wiki_normalize_metrics.py`
  - `wiki_semantic_qa.py`
  - `wiki_contradictions.py`
  - `wiki_science_review.py`
  - `wiki_concept_revision.py`
  - `wiki_writeback.py` 的 proposal-first contract 在桌面端 writeback 流程中保持一致
- 浏览 `sources/`、`drafts/`、`concepts/`、`qa-reports/` 和 `raw/inbox/`。
- 为每个 runtime command 保存可查看的任务日志到 `log-archive/desktop/`。
- 显示 claims、science review queue、growth queue 等 review 状态。

## 安全边界

- 桌面端不直接把 draft 移到 `sources/`。
- 桌面端不修改 QA verdict。
- 桌面端不重写历史 QA report。
- 桌面端不默认上传 raw documents。
- 桌面端不静默应用 query writeback；默认写入 `reviews/query-writeback/` proposal artifact，写入 `concepts/` 必须先审批。
- 桌面端只对 Markdown / txt 做可审计 staging；PDF 通过 runtime parser 生成 parsed Markdown artifact，默认 `auto/local-text` 不上传文档。
- 所有 source page、claim、QA、contradiction、concept 写入都通过 open-llm-wiki 脚本完成，桌面端只保存任务日志、ingest plan、staging manifest、桌面 ingest registry、桌面 action/queue/impact contract 和 `raw/inbox/` 导入结果。

## Ingest 编排

桌面端借鉴 `nashsu/llm_wiki` 的几个工程化点，但保持 open-llm-wiki 的 runtime-first 边界：

- SHA-256 plan/cache：未变化且 artifact 仍匹配的输入会显示为 `cached`；如果 Markdown/txt 源文件变化，会重新标记为 `stageable`，避免旧 `combined.md` 被误 ingest；如果 PDF/parser manifest 的源 hash 与当前文件不同，会回到 `blocked` 要求重新解析。
- 显式状态：`ready` 表示已有 `combined.md`，`stageable` 表示可本地 staging，`blocked` 表示需要 PDF/parser 先产出 artifact，`published` 表示当前 source/artifact hash 已完成过桌面 pipeline。桌面端 pipeline 会对 `parse_required` PDF 先运行本地 parser，再继续 ingest。
- 串行执行：一键 pipeline 不并发调用 runtime，避免多个任务同时改 `index.md`、`claims/` 或 QA report。
- 非越权写入：desktop 不发布 source，不改 QA verdict，不直接修改 concept synthesis。
- 桌面锁：pipeline 运行时会写 `_state/desktop-ingest.lock`，防止两个桌面任务同时驱动 runtime。
- 行动面板：`desktop-actions.jsonl` 将 `parse_required`、`stage_artifact`、`ingest_ready` 等状态转成用户下一步动作。
- Claim actions：`claims/claims.jsonl` 中的 `needs_review`、`stale`、`contradicted` 会进入行动面板，避免 concept synthesis 静默吸收未验证内容。
- Per-source queue：`desktop-ingest-jobs.jsonl` 为每个输入提供 `queued`、`blocked`、`succeeded` 等任务视图。
- Artifact contract：`desktop-artifacts.jsonl` 汇总 manifest、chunks、parser、anchors 和 limitations；runtime `local-text` parser manifest 会显示为 parser-owned artifact。
- Runtime source registry compatibility：桌面端会把 desktop-only 状态保存在 `desktop_status`，写入 runtime-owned `_state/source-registry.jsonl` 时只使用 open-llm-wiki 允许的 `candidate`、`parsed`、`published` 等状态，避免 `ready` 进入 runtime lint schema。
- Impact graph：`desktop-impact-graph.jsonl` 记录 source -> artifact -> chunks 的基础影响边，后续 runtime 可扩展到 claims/concepts。
- Obsidian templates：最小 vault 会写入 `templates/source.md` 和 `templates/concept.md`，固定 source/concept 页面结构和 frontmatter。

## 开发

环境要求：

- Node.js 与 npm。
- Rust toolchain。
- Tauri v2 所需的系统依赖。

```bash
npm install
npm run build
npm run tauri dev
```

Rust 侧检查：

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## Runtime 设置

桌面端优先使用当前 vault 内的：

```text
<vault>/.open-llm-wiki/scripts/
```

如果 vault 还没有 runtime，可以在 UI 里选择 `open-llm-wiki` 仓库路径。创建 vault 时，桌面端会调用：

```bash
python scripts/wiki_init.py <vault> --repo-root <open-llm-wiki>
```

如启用 Obsidian，则追加：

```bash
--obsidian --obsidian-profile <minimal|research|full>
```

## 参考

- `open-llm-wiki`: runtime-first、安全边界、vault schema、dashboard/status 工作流。
- `nashsu/llm_wiki`: Tauri + React 桌面形态和本地文件/项目管理体验。
