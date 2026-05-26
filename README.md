# LLM Wiki Desktop

本仓库是 `open-llm-wiki` 的本地优先桌面端外壳。桌面端负责 vault 管理、导入入口、任务编排、状态展示和错误恢复；知识生成、QA、review queue、writeback approval 等核心边界仍由 `open-llm-wiki` runtime 执行。

## 界面预览

下面的截图来自本地 DeepSeek 论文语料验收流程，已裁掉菜单栏、Dock 和本机绝对路径，只保留软件窗口本身。

![仪表盘](docs/screenshots/dashboard.png)

| 页面 | 作用 |
| --- | --- |
| ![原始资料工作台](docs/screenshots/raw-sources.png) | 管理 `raw/inbox/`、source registry、解析 artifact、parser 信息和可追踪性状态。 |
| ![LLM provider 设置](docs/screenshots/settings-providers.png) | 配置本地 CLI 或远程 provider 的模型、上下文窗口和推理强度；API key 只通过环境变量或安全路径传入。 |
| ![问答与写回](docs/screenshots/chat-search.png) | 在 vault 内检索 sources、claims、concepts、reviews 和 writeback proposals，并生成 evidence-first answer draft。 |
| ![证据图谱](docs/screenshots/evidence-graph.png) | 查看 source、claim、concept、review、proposal 和 warning 之间的 evidence graph。 |

Agent / API 集成必须先通过只读 readiness gate；当前契约见 [`docs/agent-skill.md`](docs/agent-skill.md)。通过 gate 后可在 Settings -> Agent API 启动 `127.0.0.1` token-protected read API；在 gate 未通过前，不应启动 localhost API，也不应向 Codex/Claude Code 暴露写入、删除、apply 或后台 ingest 能力。

## 软件使用教程

### 1. 启动桌面端

开发环境中最直接的启动方式：

```bash
cd /path/to/llm-wiki-desktop
npm ci
npm run desktop:dev
```

已经完成本地打包时，也可以直接打开 macOS app：

```bash
open "src-tauri/target/release/bundle/macos/LLM Wiki.app"
```

### 2. 创建或打开知识库

首次进入 Welcome 页后，有两种入口：

- `新建项目`：选择项目名称、模板、输出语言和父目录，桌面端会创建一个新的 open-llm-wiki vault。
- `打开项目`：选择已有 vault。不要选择原始 PDF 文件夹，应该选择已经初始化过的 LLM Wiki vault。

创建或打开后会进入 `仪表盘`。仪表盘会显示 schema、runtime、Obsidian、资料数量、概念数量、审核压力和写回状态。

### 3. 导入论文或资料

进入 `原始资料` 页面：

1. 点击 `导入文件`，选择 PDF、Markdown、txt 或 zip 论文包。
2. 文件会进入 vault 的 `raw/inbox/`。
3. 点击 `规划 ingest` 检查哪些资料可解析、哪些已发布、哪些被阻塞。
4. 选中任一资料，可以在中间预览 artifact，并在右侧查看 path、hash、parser、claims、concepts 和 traceability。

桌面端会按 SHA-256 跳过重复资料。PDF 默认走本地 parser；除非用户显式启用，不会上传到 cloud OCR、外部 parser 或外部模型服务。

### 4. 运行处理流程

回到 `仪表盘` 或 `原始资料` 页面，点击 `运行 ingest pipeline`。桌面端会串行执行：

```text
PDF parse -> source discovery -> corpus ingest -> claims -> normalize
-> semantic QA -> contradictions -> science review -> concept revision
-> lint -> dashboard refresh
```

运行期间可以在 `活动` 页面查看任务历史。所有 runtime 日志会写入当前 vault 的：

```text
log-archive/desktop/
```

### 5. 浏览结果

处理完成后，常用入口如下：

- `仪表盘`：确认 vault 是否可用、审核压力是否过高、是否存在 P0/P1 阻塞项。
- `原始资料`：核对每篇论文的解析产物、parser、artifact contract 和证据链。
- `论断`：查看 claim ledger、QA verdict、needs_review、stale 或 contradicted 状态。
- `概念`：浏览生成后的知识页面。
- `审核`：处理 science review queue，但桌面端不会伪造人工批准。
- `可追踪性`：定位 evidence anchor、claim/source 断链和 schema 风险。
- `证据图谱`：查看 source -> claim -> concept / review / proposal / warning 的关系。
- `Obsidian`：从桌面端打开生成后的 vault，适合阅读和人工审查。

### 6. 提问与写回

进入 `问答 / 写回` 页面后：

1. 输入研究问题，例如“整理 DeepSeek 的研发思路和决策依据”。
2. 先查看 evidence map，确认回答引用的是 vault 内 sources、claims、concepts 或 reviews。
3. 生成 answer draft。没有调用 active provider 时，它只是 evidence draft，不应视为模型最终答案。
4. 生成 writeback proposal。proposal 会进入 `reviews/query-writeback/`。
5. 未批准前不会写入 `concepts/` 或 `sources/`。
6. 明确批准并 apply 后，再运行 lint / eval 或对应 runtime validation。

## MVP 能力

- 创建或打开 open-llm-wiki vault；新建 vault 时会拒绝带尾随空格的路径段，避免生成跨设备不稳定的目录名。
- 将 PDF / Markdown / txt / zip 导入到 `raw/inbox/`，并按 SHA-256 跳过重复文件；zip 会作为 corpus package 进入 plan，先提示解包再进入逐篇解析。
- 文件夹导入会保留目录上下文，但不会跟随 symlink，避免把未显式选择的外部文件复制进 raw evidence。
- 生成桌面端 ingest plan：递归扫描 `raw/` 下的显式 evidence 文件与嵌套 `*_markdown/combined.md`，按 SHA-256 标记 desktop-only 的 `ready`、`stageable`、`blocked`、`cached`、`published`，并写入 `_state/desktop-ingest-plan.json`。
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
- 提供 Chat / Search 入口：搜索 sources、claims、concepts、reviews、traceability warnings 和 query writeback proposals，并把带 evidence map 的研究问题转成 proposal。
- 提供基础 Graph 入口：展示 source -> claim -> concept / review / proposal / warning 的证据关系，并补充 Obsidian `[[wikilink]]`、frontmatter `sources:` / `source_path:` 共享来源关系、共享邻居推荐和同类型页面加权，帮助定位 traceability break、阅读路径和 insight 写回位置。

## 安全边界

- 桌面端不直接把 draft 移到 `sources/`。
- 桌面端不修改 QA verdict。
- 桌面端不重写历史 QA report。
- 桌面端不默认上传 raw documents。
- 桌面端不静默应用 query writeback；默认写入 `reviews/query-writeback/` proposal artifact，写入 `concepts/` 必须先审批。
- 桌面端只对 Markdown / txt 做可审计 staging；PDF 通过 runtime parser 生成 parsed Markdown artifact，默认 `auto/local-text` 不上传文档。
- 所有 source page、claim、QA、contradiction、concept 写入都通过 open-llm-wiki 脚本完成，桌面端只保存任务日志、ingest plan、staging manifest、桌面 ingest registry、桌面 action/queue/impact contract 和 `raw/inbox/` 导入结果。

## Ingest 编排

桌面端的 ingest 编排保持 open-llm-wiki 的 runtime-first 边界：

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

## 普通用户启动

本仓库当前以本地源码方式启动桌面端，适合内部试用、DeepSeek corpus 验证和 release candidate 检查。启动前需要 macOS、Node.js/npm、Rust/Cargo 和 Xcode Command Line Tools。

环境要求：

- Node.js 与 npm。
- Rust toolchain。
- Tauri v2 所需的系统依赖。

```bash
cd /path/to/llm-wiki-desktop
npm install
npm run start
```

等同的脚本入口：

```bash
./scripts/dev-start.sh
```

首次打开后，按这个顺序使用：

1. 选择或创建一个 `open-llm-wiki` vault。
2. 如果 vault 内还没有 runtime，在 UI 中选择本地 `open-llm-wiki` 仓库路径。
3. 导入 PDF、Markdown、txt 或 zip 论文包到 `raw/inbox/`。
4. 先查看 ingest plan 和 action panel，再运行 ingest pipeline。
5. 需要浏览知识库时，从桌面端打开 Obsidian vault，而不是直接打开原始论文目录。
6. 需要 query writeback 时，先生成 proposal 并检查 diff。没有人工批准时不要 apply 到 `concepts/`。

默认路径是本地优先。除非用户明确选择并批准，桌面端不应使用 cloud OCR、hosted parser 或外部 LLM/API 路径。

## 开发者启动

推荐使用 lockfile 安装依赖：

```bash
npm ci
npm run desktop:dev
```

常用开发命令：

```bash
npm run start
npm run desktop:dev
npm run dev:web
npm test
npm run build
npm run build:app
```

脚本约定：

| Command | Purpose |
| --- | --- |
| `npm run start` | 启动完整 Tauri 桌面端。 |
| `npm run desktop:dev` | 启动 Tauri dev shell，内部会按 `tauri.conf.json` 拉起 Vite。 |
| `npm run dev:web` | 只启动 Vite Web 视图，用于快速 UI 调试，不代表完整桌面能力。 |
| `npm test` | 运行 TypeScript typecheck 和 Rust tests。 |
| `npm run build` | 运行 typecheck 并生成前端 `dist/`。 |
| `npm run build:app` | 运行 Tauri 本地应用打包。 |
| `./scripts/test.sh` | shell 入口，等同于 `npm test`。 |
| `./scripts/build-app.sh` | shell 入口，等同于 `npm run build:app`。 |

Release readiness, local packaging, CI scope and formal distribution requirements are tracked in [`docs/release-readiness.md`](docs/release-readiness.md).

Rust 侧单独检查：

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

## macOS 本地打包

本地打包用于验证 `.app` 和 `.dmg` 是否能在当前 Mac 上启动，不等同于签名、notarization 或公开分发。

```bash
npm ci
npm run build:app
```

打包完成后检查产物：

```bash
open "src-tauri/target/release/bundle/macos/LLM Wiki.app"
open src-tauri/target/release/bundle/dmg
```

如果只是验证 release candidate，不要把 notarization 失败和本地启动失败混在一起。公开分发前还需要单独处理 Developer ID signing、hardened runtime、notarization、stapling 和完整图标资产。

Release mode boundary:

- Local web trial: `npm run dev:web` only starts Vite and does not prove native desktop behavior.
- Desktop dev mode: `npm run desktop:dev` / `npm run start` runs the full Tauri shell for development.
- Release candidate: `npm run build` plus `npm run build:app` creates local `.app` / `.dmg` artifacts for current-Mac validation.
- Formal distribution: requires signing, hardened runtime, notarization, stapling and final icon assets outside this basic local packaging path.

## Tauri 配置状态

当前 `src-tauri/tauri.conf.json` 的 release 相关配置：

- `productName`: `LLM Wiki`
- window title: `LLM Wiki`
- `identifier`: `com.aidenwu.llmwiki.desktop`
- `bundle.active`: `true`
- `bundle.targets`: `["app", "dmg"]`
- `bundle.icon`: `src-tauri/icons/icon.png`, `src-tauri/icons/icon.icns`, `src-tauri/icons/icon.ico`

这些字段与 package/Cargo 命名保持一致。当前图标资产包含 SVG master、1024/512/256/128/64/32 PNG、macOS `.icns` 和 Windows `.ico`。公开分发前仍需单独做签名和 notarization 检查。

## Release checklist

本 checklist 面向本地 release candidate，不包含 CI/CD。

```bash
npm ci
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run build:app
```

手动验收：

1. 打开 `src-tauri/target/release/bundle/macos/LLM Wiki.app`。
2. 在 Welcome 页验证 `New Project`、`Open Project`、recent projects 和 DeepSeek demo 入口。
3. 创建一个新 project，并确认 template、AI output language、parent directory 写入 desktop settings。
4. 打开一个已有 vault，并确认 runtime path、dashboard/status、review queue 能被识别。
5. 从桌面端打开 Obsidian，确认打开的是生成后的 vault，不是原始 PDF 文件夹。
6. 导入一个小样本文件，在 Raw Sources 页确认 Refresh / Import / Folder / details drawer 可用。
7. 打开 Chat / Search，搜索 source/claim，并生成 proposal-first query writeback。
8. 打开 Graph，确认 source / claim / concept / review / proposal / warning 关系可用于追踪 evidence。
9. 未获得明确人工批准时，确认 writeback 没有静默写入 `concepts/` 或 `sources/`。
10. 如批准并 apply 了 proposal，再运行 lint/eval 或对应 runtime validation。
11. 记录本地 app 路径、vault 路径、Obsidian entry file、writeback proposal 路径和验证命令结果。

## Known limitations

- 本仓库仍是源码级 release candidate；正式分发还需要 Developer ID signing、hardened runtime、notarization 和 clean-profile install smoke test。
- `Chat / Search` 当前以 vault-local evidence index 和 proposal handoff 为主，不是无证据通用 RAG。
- `Graph` 当前是 evidence navigation graph，优先可追踪性、断点定位、共享邻居阅读推荐和同类型页面加权，不追求复杂社区发现或布局算法。
- 外部模型 provider 只保存 provider/model/context/reasoning 配置，不在 UI 明文保存或展示 API key。

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

## 技术边界

- `open-llm-wiki`: runtime-first、安全边界、vault schema、dashboard/status 工作流。
