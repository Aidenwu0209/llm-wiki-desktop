# 需求待办：LLM Wiki Desktop 当前 main 状态与剩余工作

最后更新：2026-05-28  
仓库：`Aidenwu0209/llm-wiki-desktop`  
最新远端主线：`e300508 benchmark: report OCR artifact contract health (#179)`  
当前 GitHub open PR：0  

本文基于当前 `origin/main`、README、docs、package scripts、Tauri manifest 和最近 merged PR `#173`-`#179` 重新同步。后续 Agent 应以本文为需求边界，不再按 `#168`、`#169`、`cc9ed40` 或更早基线拆任务。

原则不变：桌面端负责 vault 管理、文件导入、任务编排、状态展示和错误恢复；知识生成、QA、review queue、writeback approval 等核心边界仍由 `open-llm-wiki` runtime 或明确 adapter contract 执行。不要静默上传 raw documents，不要绕过 proposal-first writeback，不要自动写入 `concepts/` / `sources/`，不要伪造人工审批，不要把 dry-run、fixture、template 写成 live 成功。

## 1. 当前产品目标

1. 外壳继续对齐 `nashsu/llm_wiki` / Obsidian 的桌面工作区形态：打开后像真实 vault/wiki 工作区，而不是展示型网页。
2. 内核保持 evidence-first：source registry、manifest、stable id、stale detection、traceability、proposal-first writeback。
3. PDF / 图片默认推荐 PaddleOCR-VL-1.5 解析；未显式启用和配置时，不能默认走 cloud/layout API，也不能偷偷上传 raw document。
4. PaddleOCR / ERNIE API key 只能从环境变量或安全存储读取，不能写入仓库、vault、日志、测试 fixture、截图或 PR 描述。
5. 演示时要展示运行态证据：OCR artifact、ERNIE evidence answer、引用覆盖率、unsupported claims、traceability break、writeback proposal、runtime identity、benchmark 输出、DeepSeek vault 复验。

## 2. 最新审查结论

### 2.1 最近已合并 PR

- `#173 import(zip): reject archive symlink entries` 已合并：ZIP traversal / symlink escape 安全处理进入主线。
- `#174 ui(ocr): surface parser readiness and artifact validity` 已合并：OCR readiness UI 更明确，parser artifact validity 可见。
- `#175 shell(reading): make vault page preview the primary workspace` 已合并：workspace 内部阅读路径成为主体验的一部分。
- `#176 shell(reading): add history and pinned relation pane` 已合并：recent history、back/forward、relation pane 进入阅读工作区。
- `#177 Runtime identity visibility and ZIP import smoke` 已合并：runtime identity 基础展示、中文 ZIP / mixed-source package smoke 文档和安全链路进入主线。
- `#178 parser(ocr): verify paddleocr artifact contracts` 已合并：OCR artifact contract / manifest validation 进入主线。
- `#179 benchmark: report OCR artifact contract health` 已合并：benchmark 输出 live artifact manifest count、contract valid/error count、missing fields，并保留 fixture 与 live artifact 的区别。

### 2.2 已验证命令记录

近期 PR 审查期间已记录通过或执行过：

```bash
npm ci
npm test
npm run build
cargo test runtime_identity --manifest-path src-tauri/Cargo.toml
cargo test archive_zip --manifest-path src-tauri/Cargo.toml
npm run benchmark:submission -- --vault examples/demo-vault --questions benchmarks/submission-ocr-qa/questions.jsonl --out benchmarks/results/local-r2-review.json --no-ernie
npm run benchmark:submission:summary -- --in benchmarks/results/local-r2-review.json --out benchmarks/results/local-r2-review.md
```

这些记录说明本地 fixture / no-key benchmark 和桌面测试链路可运行；它们不等同于真实 PaddleOCR-VL-1.5 live parse、真实 ERNIE live answer、真实 end-to-end PDF / image submission demo 已完成。

## 3. 已完成内容

### 3.1 外壳 / Obsidian-like 工作区

- Welcome onboarding 和 demo vault 已有，能展示 OCR + ERNIE + Evidence Wiki + writeback proposal 路径。
- Project switcher / recent vault / detected vault 入口已有。
- Nested vault file tree 已有，并支持 active path reveal。
- Source / concept / review / proposal 页面优先在桌面阅读工作区打开。
- 阅读工作区已有 workspace 内部阅读、recent history、back/forward、轻量 tab / recent pages 行为。
- 页面级 relation pane 已常驻展示 backlinks、outbound links、source refs、outline。
- 证据图谱已改为径向 / 圆形布局，并具备类型过滤、legend、节点点击打开阅读页和 pin 文件树路径的基础能力。
- `docs/product-parity-matrix.md` 记录了与 nashsu / Obsidian 的 same / better / worse / intentionally different 状态。

### 3.2 OCR / ERNIE / benchmark

- OCR + ERNIE + Evidence Wiki benchmark 已有：
  - `benchmarks/submission-ocr-qa/questions.jsonl`
  - `benchmarks/submission-ocr-qa/sample-manifest.json`
  - `scripts/benchmark/run-submission-benchmark.ts`
  - `scripts/benchmark/summarize-submission-benchmark.ts`
  - `docs/benchmark-plan.md`
  - `docs/benchmark-report-template.md`
- Benchmark 可生成 JSON 结果和 Markdown 报告。
- Benchmark 指标覆盖 parse success、markdown/json generated、manifest valid、chunk count、citation coverage、unsupported claims、traceability breaks、ERNIE latency、OCR latency、end-to-end latency、no-evidence refusal。
- `#179` 已补充 PaddleOCR artifact metadata handoff / benchmark metadata path 的健康度输出：live artifact manifest count、contract valid/error count、missing fields。
- 无 `AI_STUDIO_API_KEY` 时会跳过 ERNIE live answer，但 local evidence benchmark 仍可跑。
- ERNIE evidence-first answer 本地逻辑已有：无证据拒答、只允许引用检索到的 evidence id、可生成 query writeback proposal。
- PaddleOCR-VL-1.5 设置入口已完成：endpoint / model / API key env var、`PADDLEOCR_API_KEY` 不落盘、test connection / test parser、ready / missing / failed / artifact-valid 状态展示。
- PDF / 图片默认进入 PaddleOCR-VL-1.5 plan；未配置时显示 `paddleocr_config_required`，不上传 raw document。
- Runtime handoff 已明确：桌面端通过 `pdf_to_markdown.py --parser layout-api --api-url <PaddleOCR endpoint>` 交给 runtime，并通过子进程环境传递 layout token / model / endpoint。

### 3.3 Ingest / source registry / safety

- Invalid parser artifact 会被阻止进入 runtime ingest。
- `combined.md` 必须通过 manifest/source hash/parser/artifact hash/chunks 契约，才会被标记为可 ingest。
- Artifact contract 校验覆盖 source id、source path、parser、parser model、page count、chunk count、latency、limitations、source hash、artifact hash。
- 中文 ZIP / mixed-source package 基础安全链路已完成：中文嵌套路径、`.DS_Store`、`__MACOSX` / sidecar 过滤，以及 traversal、absolute path、symlink escape 风险处理。
- ZIP contract smoke 文档和只读检查脚本入口已有；原始 ZIP 不应被修改、移动、删除或提交解压内容。
- Proposal-first writeback、review gate、raw document 不静默上传的边界仍必须保持。

### 3.4 Runtime identity / fork-first

- `docs/runtime-dependency-strategy.md` 已明确短期 fork-first：demo / smoke / release-readiness 优先 pin 到 `Aidenwu0209/open-llm-wiki`，`nashsu/llm_wiki` 是长期 upstream 跟踪目标。
- Runtime identity 基础展示已完成：
  - vault-local `.open-llm-wiki`
  - Settings external runtime path
  - scripts path
  - version
  - Git remote、branch、commit、dirty state
  - repository kind：fork / upstream / unknown
- Dashboard / Settings 会把 upstream、unknown、dirty、missing scripts、non-Git runtime 作为 warning，而不是直接 hard fail。
- 剩余工作不是“实现 runtime identity”，而是 release report / smoke report 里的真实复验记录。

### 3.5 DeepSeek 全流程复验

- `deepseek_paper/` 真实 PDF 数量已记录为 22。
- 已跑过一轮独立 vault full-flow：local parse、ingest、source discovery、claims、metric normalize、semantic QA、science review queue、contradiction scan、concept revision、wiki grow、graph export、lint、eval。
- Run report：
  - `/Users/wu/Desktop/wu/AAaabaidu/LLM-Wiki /runs/20260528-130635-deepseek-fullflow/validation-summary.md`
- Query writeback 已验证：existing concept 可以生成 diff-only proposal；无明确 approval 时 `--apply` 被拒绝；未静默写回。
- Obsidian GUI first-screen screenshot 当时捕获为全黑，只能算 attempted but not observable，不能算完成真实 GUI 第一感受评分。

## 4. 仍未完成的需求

### R1. Shell reading workspace 继续增强

优先级：P1  
状态：主阅读路径、history、back/forward、relation pane 已完成基础能力；剩余是可选增强和真实语料复验。

还缺：

- 在真实 DeepSeek vault 上复验 center reader、history、relation pane、graph 点击联动是否改善阅读体验。
- Search 还没有做到 Obsidian 式全 vault 本地全文检索；当前更偏 evidence object search。
- Markdown reader 仍可继续增强 tabs、outline persistence、artifact/source link ergonomics。
- 插件生态不能简单照搬 Obsidian；需要先做 plugin boundary / extension RFC。

验收标准：

- DeepSeek vault 或 demo vault 上保存本地 smoke report 和截图路径。
- 阅读路径从 source / concept / review / proposal 进入主工作区时不别扭。
- Relation pane 展示的 backlinks、outbound links、source refs 对用户有解释价值。
- 不新增直接编辑 source/concept 的入口。

### R2. PaddleOCR-VL-1.5 真实默认解析闭环

优先级：P0  
状态：配置入口、plan gate、runtime handoff、artifact contract validation 已具备；真实 PaddleOCR-VL-1.5 live parse run report 未完成。

还缺：

- 用真实 PaddleOCR-VL-1.5 endpoint 跑 PDF / 图片解析，生成 Markdown 和 JSON artifact。
- Runtime `pdf_to_markdown.py` 的真实 PaddleOCR 输出需要稳定满足桌面 artifact contract。
- 真实 artifact 需要记录 page / region anchors、chunk boundaries、parser metadata、limitations、latency。
- 需要一份 live-key optional run report：如何设置 key、如何启动桌面端让 env 可见、如何 test connection、如何跑不含版权材料的小样本、真实输出是否通过 contract。
- Benchmark 在存在真实 OCR artifact 时应优先读取真实 manifest；无真实 artifact 时继续用 fixture metadata，但报告必须清楚标识 fixture / live。

验收标准：

- 新导入 PDF / 图片默认进入 PaddleOCR-VL-1.5 plan。
- 未配置 key 或 endpoint 时，ingest plan 明确显示 `paddleocr_config_required`，不上传 raw document。
- 配置后可以一键 test connection / test parser。
- 真实 parser output 通过 artifact contract gate 后才进入 ingest。
- 公共 CI 不依赖真实 key；live OCR 用本地可选 smoke。

### R3. DeepSeek 论文产品复验补齐

优先级：P0  
状态：runtime full-flow 已完成一轮；最新 desktop main + GUI 证据和 end-to-end PDF / image submission demo report 未完成。

还缺：

- 用当前最新 `origin/main` 重新打开 DeepSeek 生成 vault，在真实桌面 app 或 Obsidian 里截图。
- 记录 Obsidian 第一感受评分：Navigation clarity、Evidence traceability、Concept usefulness、Review transparency、Visual organization、Trust、Next-action clarity。
- 检查当前径向 graph、reading history、relation pane 在 DeepSeek vault 上是否真的改善体验。
- 补 end-to-end PDF / image submission demo report，明确是否使用真实 OCR / ERNIE；如果没有 live key，只能记录 no-key / fixture / local fallback 结果。
- Query writeback 只能对 existing concept 生成 proposal；还不能给 missing target 生成 new-file proposal。

验收标准：

- 保存本地 run report 和截图路径。
- 明确说明 GUI 是否实际可观察；如果不能观察，给出手动复验命令。
- 不修改 `deepseek_paper/`。
- 不伪造 review / approval / writeback。

### R4. Query writeback new-file proposal

优先级：P1  
归属：主要在 `open-llm-wiki` runtime；桌面端只做展示 / 调用兼容。  
状态：DeepSeek full-flow 暴露出的 runtime/product gap。

还缺：

- `wiki_writeback.py` proposal mode 支持 missing `concepts/*.md` target，生成 reviewable new-file diff。
- `--apply` 仍必须要求 explicit approval note。
- 新页面 proposal 必须继续要求 source citation，不能接受无证据 body。
- 桌面端需要能展示这种 new-file proposal，不把它误判为 broken target。

验收标准：

- 对 `concepts/deepseek-research-strategy.md` 这类新 target 可生成 proposal diff。
- 未加 `--apply` 时不写入 vault。
- `--apply` 无 approval note 时失败。
- `wiki_eval.py`、`wiki_lint.py --fail-on p1` 通过。
- 桌面端 list / preview / review proposal 不崩溃。

### R5. ERNIE live evidence-answer smoke

优先级：P1  
状态：本地 evidence-first 逻辑已有；真实 key 的质量、延迟和错误恢复未完整复验。

还缺：

- 使用真实 `AI_STUDIO_API_KEY` 在小 demo vault 上跑 live answer。
- UI 或 benchmark report 显示 latency、selected evidence ids、citations、unsupported claims、warnings。
- Network/auth/rate-limit/model-not-found 错误要可理解、可行动。
- 回答不能引用不存在的 evidence id。
- Live answer 结果生成 writeback proposal 后，仍必须 proposal-first。

验收标准：

- 有 live-key optional smoke report。
- 公共 CI 不依赖真实 key。
- No-evidence refusal 仍然成立。
- Writeback 仍然 proposal-first。
- 错误信息不泄露 API key。

### R6. 中文 ZIP / mixed-source package 手动 smoke

优先级：P1  
状态：基础安全链路已完成；剩余为真实中文混合资料包手动 smoke 记录。

还缺：

- 用 `deepseek_paper_中文.zip` 或不含私有内容的合成 mixed package 跑桌面端手动 smoke。
- 记录 UI 中每个文件的目标路径、hash、是否被忽略、忽略原因。
- 确认中文文件名和嵌套文件夹结构在用户可见位置保留。
- 确认 ignored 条目不会进入可 ingest 文件列表。
- 保存本地 smoke 证据路径；不要提交真实论文截图、解压内容或私有路径。

验收标准：

- Traversal / symlink escape 被拒绝或忽略且有明确原因。
- `__MACOSX`、`.DS_Store`、`._*` 不进入 ingest plan。
- 记录每个文件的 target path、hash、ignored reason。
- 输出不写到 `LLM-Wiki` 工作区之外。
- `npm test`、`npm run build` 通过。

### R7. Release readiness 与跨平台稳定性

优先级：内部演示 P2，公开分发 P1  
状态：文档和脚本入口已有；真实打包链路和 clean-profile 记录未完成。

还缺：

- macOS clean-profile 实测记录。
- Windows 手动或自动 smoke 的真实结果记录。
- `npm run build:app` 的 release artifact 检查。
- v0.1.0-rc1 release 准备和 release notes。
- Developer ID signing、hardened runtime、notarization、stapling。
- 权限拒绝时的 reveal/copy/manual recovery 真实复验。
- 打包后环境变量可见性说明，尤其是 `PADDLEOCR_API_KEY` 和 `AI_STUDIO_API_KEY`。

验收标准：

- macOS `.app` 能在干净用户环境打开项目、导入资料、打开 Obsidian URI。
- Windows 文档和手动 smoke 可复现。
- 不把私有路径、API key、真实论文截图提交到仓库。
- 不把 unsigned local bundle 写成 public release ready。

### R8. PRD、scoring mapping 与开源治理

优先级：P2  
状态：仍未完成。

还缺：

- 面向 v0.1.0-rc1 的 PRD / acceptance scorecard。
- Scoring mapping：把 README、release readiness、benchmark metrics、manual smoke、agent API readiness 映射成 reviewer 可判定的分数或 checklist。
- 开源治理文件：license、contributing、security policy、code of conduct、issue / PR templates、release checklist。
- Provider / parser / writeback 安全边界在 PRD 和 scoring 中必须显式体现。

验收标准：

- PRD 不把 fixture / dry-run / no-key benchmark 写成 live success。
- Scorecard 能区分 local fixture、optional live OCR、optional live ERNIE、manual GUI smoke。
- Governance 文件不包含 API key、私有路径、真实论文内容或截图。

## 5. 建议优先顺序

1. 先做 R2：PaddleOCR-VL-1.5 live parse run report 是当前最关键的技术证据缺口。
2. 做 R3：用最新 main 复验 DeepSeek vault，补真实 GUI 和 end-to-end submission demo 证据。
3. 做 R5：ERNIE live evidence-answer smoke，验证真实 key 下的质量和错误恢复。
4. 做 R7：macOS clean-profile、`build:app`、v0.1.0-rc1 release evidence。
5. 做 R6：中文 ZIP / mixed-source package 手动 smoke 记录。
6. 做 R1：Shell reading workspace 的可选增强和真实语料 UX polish。
7. 做 R8：PRD、scoring mapping、开源治理文件。
8. 做 R4：query writeback new-file proposal；这主要属于 runtime 侧，应单独拆 PR。

## 6. 给后续 PR 的统一验收要求

每个 PR body 至少包含：

```text
Summary:
本 PR 只解决什么问题。

Changed files:
列出核心文件和原因。

Validation:
npm ci
npm test
npm run build
其他相关命令

Safety:
- 未提交真实 API key
- 未修改 deepseek_paper/
- 未绕过 proposal-first writeback
- 未默认启用 cloud/layout API
- 未把 fixture / dry-run / template 伪装成 live OCR 或 live ERNIE
```

涉及 Tauri / Rust 的 PR 还要运行：

```bash
cd src-tauri && cargo test
npm run build:app
```

如果涉及 UI：

- 至少检查桌面宽度下无明显重叠。
- Settings 不能把未实现能力展示成已可用。
- Welcome / Dashboard 不能回到营销页或奇怪链路说明。

如果涉及 runtime / parser：

- 不允许 shell string 拼接执行用户路径。
- 路径必须保持 vault 内或显式允许的输入文件内。
- Raw evidence 不能被静默覆盖。
- Parser artifact contract 失败时必须阻塞 ingest，而不是降级成成功。

如果涉及 provider / OCR / ERNIE：

- API key 只能从环境变量或安全存储读取。
- 日志、截图、fixture、docs、PR body 不能包含真实 key。
- No-key / dry-run / fixture 只能写成 no-key / dry-run / fixture，不得写成 live success。

## 7. 当前不建议立刻做的事

- 不建议直接做 Obsidian 插件兼容层；先写 plugin boundary / extension RFC。
- 不建议加入直接编辑 source/concept；这会冲击 proposal-first 和 runtime-owned 边界。
- 不建议默认打开 cloud/layout API；PaddleOCR 也必须显式配置 endpoint/key 后才跑真实 parse。
- 不建议把 DeepSeek 私有运行截图提交到仓库；截图只作为本地验证证据。
- 不建议继续开大 PR；现在更适合一个 PR 一个演示缺口。
