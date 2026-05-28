# 需求待办：LLM Wiki Desktop 当前 main 状态与剩余工作

最后更新：2026-05-29  
仓库：`Aidenwu0209/llm-wiki-desktop`  
最新远端主线：`fb515a1 docs(smoke): record macos clean profile results (#188)`  
当前 open PR（审查时）：`#180`、`#182`、`#183`、`#184`、`#187`  

本文基于当前 `origin/main`、README、docs、package scripts、Tauri manifest 和最近 merged PR `#173`-`#188` 重新同步。后续 Agent 应以本文为需求边界，不再按 `#168`、`#169`、`cc9ed40` 或更早基线拆任务。

原则不变：桌面端负责 vault 管理、文件导入、任务编排、状态展示和错误恢复；知识生成、QA、review queue、writeback approval 等核心边界仍由 `open-llm-wiki` runtime 或明确 adapter contract 执行。不要静默上传 raw documents，不要绕过 proposal-first writeback，不要自动写入 `concepts/` / `sources/`，不要伪造人工审批，不要把 dry-run、fixture、template 写成 live 成功。

## 1. 当前产品目标

1. 外壳继续对齐 `nashsu/llm_wiki` / Obsidian 的桌面工作区形态：打开后像真实 vault/wiki 工作区，而不是展示型网页。
2. 内核保持 evidence-first：source registry、manifest、stable id、stale detection、traceability、proposal-first writeback。
3. PDF / 图片默认推荐 PaddleOCR-VL-1.5 解析；未显式启用和配置时，不能默认走 cloud/layout API，也不能偷偷上传 raw document。
4. PaddleOCR / ERNIE API key 只能从用户配置的环境变量或安全存储读取，不能写入仓库、vault、日志、测试 fixture、截图或 PR 描述。
5. 演示时要展示运行态证据：OCR artifact、ERNIE evidence answer、引用覆盖率、unsupported claims、traceability break、writeback proposal、runtime identity、benchmark 输出、DeepSeek vault 复验。

## 2. 最近已完成

### 2.1 Shell / Obsidian-like 工作区

- `#173`：ZIP traversal / symlink escape 安全处理进入主线。
- `#174`：OCR readiness UI 更明确，parser artifact validity 可见。
- `#175`：workspace 内部阅读路径成为主体验的一部分。
- `#176`：recent history、back/forward、relation pane 进入阅读工作区。
- `#177`：runtime identity 基础展示、中文 ZIP / mixed-source package smoke 文档和安全链路进入主线。
- `#181`：project switcher 移到 rail，主界面更接近 Obsidian 的工作区入口，而不是顶部状态条堆按钮。

### 2.2 OCR / ERNIE / benchmark

- `#178`：OCR artifact contract / manifest validation 进入主线。
- `#179`：benchmark 输出 live artifact manifest count、contract valid/error count、missing fields，并保留 fixture 与 live artifact 的区别。
- `#186`：provider API key source 可配置，文档从固定 `PADDLEOCR_API_KEY` / `AI_STUDIO_API_KEY` 变成默认环境变量 + 用户可选 env var；真实 key 仍不落盘。

### 2.3 PRD / scoring / smoke

- `#185`：新增 `docs/PRD.md` 和 `docs/scoring-mapping.md`，把产品目标、评分指标、评委验收口径与 benchmark / evidence wiki 结果挂钩。
- `#188`：记录 macOS clean-profile smoke 结果。自动 build/test/package 通过，`.app` 可启动；Finder picker 自动化被 macOS Accessibility 权限阻断，因此临时 vault 创建、导入、plan ingest、dashboard 手动链路仍未完成。

## 3. 已验证命令记录

近期 PR 审查期间已记录通过或执行过：

```bash
npm ci
npm test
npm run build
cargo test runtime_identity --manifest-path src-tauri/Cargo.toml
cargo test archive_zip --manifest-path src-tauri/Cargo.toml
npm run benchmark:submission -- --vault examples/demo-vault --questions benchmarks/submission-ocr-qa/questions.jsonl --out benchmarks/results/local-r2-review.json --no-ernie
npm run benchmark:submission:summary -- --in benchmarks/results/local-r2-review.json --out benchmarks/results/local-r2-review.md
npm run build:app
```

这些记录说明本地 fixture / no-key benchmark、桌面测试链路和 macOS 本地打包链路可运行；它们不等同于真实 PaddleOCR-VL-1.5 live parse、真实 ERNIE live answer、真实 end-to-end PDF / image submission demo 已完成。

## 4. 当前已完成能力

### 4.1 外壳 / Obsidian-like 工作区

- Welcome onboarding 和 demo vault 已有，能展示 OCR + ERNIE + Evidence Wiki + writeback proposal 路径。
- Project switcher / recent vault / detected vault 入口已有，并已移到 rail。
- Nested vault file tree 已有，并支持 active path reveal。
- Source / concept / review / proposal 页面优先在桌面阅读工作区打开。
- 阅读工作区已有 workspace 内部阅读、recent history、back/forward、轻量 tab / recent pages 行为。
- 页面级 relation pane 已常驻展示 backlinks、outbound links、source refs、outline。
- 证据图谱已改为径向 / 圆形布局，并具备类型过滤、legend、节点点击打开阅读页和 pin 文件树路径的基础能力。
- `docs/product-parity-matrix.md` 记录了与 nashsu / Obsidian 的 same / better / worse / intentionally different 状态。

### 4.2 OCR / ERNIE / benchmark

- OCR + ERNIE + Evidence Wiki benchmark 已有：
  - `benchmarks/submission-ocr-qa/questions.jsonl`
  - `benchmarks/submission-ocr-qa/sample-manifest.json`
  - `scripts/benchmark/run-submission-benchmark.ts`
  - `scripts/benchmark/summarize-submission-benchmark.ts`
  - `docs/benchmark-plan.md`
  - `docs/benchmark-report-template.md`
- Benchmark 可生成 JSON 结果和 Markdown 报告。
- Benchmark 指标覆盖 parse success、markdown/json generated、manifest valid、chunk count、citation coverage、unsupported claims、traceability breaks、ERNIE latency、OCR latency、end-to-end latency、no-evidence refusal。
- Benchmark 已补充 PaddleOCR artifact metadata handoff / benchmark metadata path 的健康度输出：live artifact manifest count、contract valid/error count、missing fields。
- 无 `AI_STUDIO_API_KEY` 时会跳过 ERNIE live answer，但 local evidence benchmark 仍可跑。
- ERNIE evidence-first answer 本地逻辑已有：无证据拒答、只允许引用检索到的 evidence id、可生成 query writeback proposal。
- PaddleOCR-VL-1.5 设置入口已完成：endpoint / model / API key env var、key 不落盘、test connection / test parser、ready / missing / failed / artifact-valid 状态展示。
- PDF / 图片默认进入 PaddleOCR-VL-1.5 plan；未配置时显示 `paddleocr_config_required`，不上传 raw document。
- Runtime handoff 已明确：桌面端通过 `pdf_to_markdown.py --parser layout-api --api-url <PaddleOCR endpoint>` 交给 runtime，并通过子进程环境传递 layout token / model / endpoint。

### 4.3 Ingest / source registry / safety

- Invalid parser artifact 会被阻止进入 runtime ingest。
- `combined.md` 必须通过 manifest/source hash/parser/artifact hash/chunks 契约，才会被标记为可 ingest。
- Artifact contract 校验覆盖 source id、source path、parser、parser model、page count、chunk count、latency、limitations、source hash、artifact hash。
- 中文 ZIP / mixed-source package 基础安全链路已完成：中文嵌套路径、`.DS_Store`、`__MACOSX` / sidecar 过滤，以及 traversal、absolute path、symlink escape 风险处理。
- ZIP contract smoke 文档和只读检查脚本入口已有；原始 ZIP 不应被修改、移动、删除或提交解压内容。
- Proposal-first writeback、review gate、raw document 不静默上传的边界仍必须保持。

### 4.4 Runtime identity / fork-first

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

### 4.5 DeepSeek 全流程复验

- `deepseek_paper/` 真实 PDF 数量已记录为 22。
- 已跑过一轮独立 vault full-flow：local parse、ingest、source discovery、claims、metric normalize、semantic QA、science review queue、contradiction scan、concept revision、wiki grow、graph export、lint、eval。
- Run report：
  - `/Users/wu/Desktop/wu/AAaabaidu/LLM-Wiki /runs/20260528-130635-deepseek-fullflow/validation-summary.md`
- Query writeback 已验证：existing concept 可以生成 diff-only proposal；无明确 approval 时 `--apply` 被拒绝；未静默写回。
- Obsidian GUI first-screen screenshot 当时捕获为全黑，只能算 attempted but not observable，不能算完成真实 GUI 第一感受评分。

## 5. 仍未完成的需求

### R1. Shell reading workspace 继续增强

优先级：P1  
状态：主阅读路径、history、back/forward、relation pane、project switcher rail 已完成基础能力；剩余是可选增强和真实语料复验。

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

- 使用真实 `AI_STUDIO_API_KEY` 或用户配置的 ERNIE key env var 在小 demo vault 上跑 live answer。
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
状态：文档、脚本入口、macOS 自动 build/package 结果已有；真实手动 clean-profile 和 Windows smoke 仍未完成。

还缺：

- macOS clean-profile 手动 vault 创建、导入、plan ingest、dashboard 复验结果。
- Windows 手动或自动 smoke 的真实结果记录。
- v0.1.0-rc1 release 准备和 release notes。
- Developer ID signing、hardened runtime、notarization、stapling。
- 权限拒绝时的 reveal/copy/manual recovery 真实复验。
- 打包后环境变量可见性说明，尤其是 PaddleOCR / ERNIE 用户配置 key env var。

验收标准：

- macOS `.app` 能在干净用户环境打开项目、导入资料、打开 Obsidian URI。
- Windows 文档和手动 smoke 可复现。
- 不把私有路径、API key、真实论文截图提交到仓库。
- 不把 unsigned local bundle 写成 public release ready。

### R8. PRD、scoring mapping 与开源治理

优先级：P2  
状态：PRD 和 scoring mapping 已进入 main；治理文件仍在 open PR 中。

还缺：

- 审核 governance / roadmap 类 PR 是否与当前产品目标一致。
- 如果 governance 文件只是模板，不能写成已完成社区治理或稳定 release 承诺。
- PRD / scoring mapping 需要随着 R2/R3/R5 的真实 live reports 更新 evidence。

验收标准：

- PRD、scoring mapping、governance 文档不夸大 live OCR / live ERNIE / release readiness。
- 文档里的命令存在且可复制。
- 不把未来计划写成已完成能力。

## 6. 当前 PR 审查建议

当前 open PR 的初步处理顺序：

1. `#180 docs: refresh requirement after latest main`：本文档 PR。必须基于 `fb515a1 (#188)` 修正后才能合并。
2. `#182 ocr: add real PaddleOCR-VL-1.5 parse run report`：审查是否只是 runbook/report，不能伪造 live parse 成功。
3. `#184 provider: add ERNIE live evidence-answer smoke`：审查 no-key fallback、key redaction、proposal-first 边界。
4. `#183 oss: add governance files and roadmap drafts`：当前为 DIRTY，需重算/修冲突；重点审查不要把 roadmap 写成 release 承诺。
5. `#187 fix(settings): make provider key sources configurable`：当前为 DIRTY，且 `#186` 已合并相同方向；优先检查是否已被 #186 覆盖，避免重复或回退。

## 7. 不建议立刻做的事

- 不建议直接做 Obsidian 插件兼容层；先写 plugin boundary / extension RFC。
- 不建议加入直接编辑 source/concept；这会冲击 proposal-first 和 runtime-owned 边界。
- 不建议默认打开 cloud/layout API；PaddleOCR 也必须显式配置 endpoint/key 后才跑真实 parse。
- 不建议把 DeepSeek 私有运行截图提交到仓库；截图只作为本地验证证据。
- 不建议继续开大 PR；现在更适合一个 PR 一个演示缺口。
Need push? But after modifying, should run maybe npm test? Docs only but could run maybe not. Need check status/diff. Need perhaps run markdown no test. But #180 changes docs only, no need npm. But to merge need push. Need commit. But on local branch review/pr-180-current not tracking remote. Need commit and push to head branch. Could use git status/diff. Also maybe perhaps merge current origin/main into PR branch? Since branch based older main; but GitHub CLEAN with current main. However PR branch should maybe be rebased/merged? We can update branch with requirement only; But if commit on top of old base, merge still clean? Let's merge origin/main into review branch before commit? We have changed file relative to old branch, but main also has old requirement. Could merge origin/main now first; likely auto merge with conflict? We can do, then commit requirement changes? Or commit then push; GitHub merge relative to main will just apply commit? Since changed requirement from old to updated; but main has old, so clean. Additional files in main unaffected. okay. But branch still lacks base changes, PR diff only requirement; GitHub will merge. Need maybe change body. But no need maybe. However PR body stale; could update gh pr edit, but not required maybe good. Need commit and push. Run git status and maybe npm test? We can run markdown? But user asked optimize to merge; for docs only can run `npm test` maybe heavy but OK. Current worktree lacks node_modules maybe? It might have? Existing? We can run `npm test` maybe no npm ci? It might fail if node_modules absent. Need check. Since docs only and CI already green, after docs change no code test needed but no modified code. Yet to be rigorous, run `npm test` maybe uses existing? Could be absent. We'll run `npm test` (approved no escalation now). Then maybe `npm run build`? For docs only not necessary but standard. Let's run maybe. Could take time. But OK. Also no network. Need if no node_modules fail, run npm ci? It might need network, but network available. Use npm ci. But docs-only no package change. Let's run status/diff then test/build in parallel? Avoid tests if editing from old branch? ok. Need maybe `npm ci`? Worktree probably not have node_modules. Check `test -d node_modules`. Use command. 
