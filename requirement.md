# 需求待办：LLM Wiki Desktop 当前目标与剩余工作

最后更新：2026-05-28  
仓库：`Aidenwu0209/llm-wiki-desktop`  
文档基线：`42939ba docs: update product parity matrix (#167)`，已包含 `#169` 的 parser artifact 契约门禁
PR 队列：不在本文维护动态状态；以 GitHub 当前 PR 列表为准

本文用于在时间不足时拆分工作：先看已经完成什么，再决定剩余项里哪一项优先做。

## 一、当前目标

1. 外壳先对齐 `nashsu/llm_wiki` 的桌面端形态：打开后像一个真正的 vault/wiki 工作区，而不是展示型网页。
2. 内核继续保持自己的 evidence-first 方向：source registry、manifest、stable id、stale detection、traceability、proposal-first writeback。
3. PDF / 图片默认推荐 PaddleOCR-VL-1.5 解析，但必须便捷配置、明确缺 key 状态，不能默认偷偷走 cloud/layout API。
4. 演示时要让评委看到技术深度：OCR artifact、ERNIE evidence answer、引用覆盖率、unsupported claims、traceability break、writeback proposal。

## 二、已经完成

### 1. 已合并到主线

- `#159`：新增 OCR + ERNIE + Evidence Wiki benchmark，包含 20 个问题、JSON 结果和 Markdown summary。
- `#160`：实现 ERNIE evidence-first answer generation，无证据拒答，回答可生成 writeback proposal。
- `#161`：新增 Welcome onboarding 和 demo vault 的第一版。
- `#162`：新增产品 parity matrix，用于对齐 nashsu / Obsidian-like shell。
- `#163`：新增 PaddleOCR-VL-1.5 设置入口、endpoint/model/API key 环境变量配置和 dry-run 检查。
- `#164`：新增 Windows smoke 文档和脚本入口。
- `#165`：新增嵌套 vault file tree，外壳更接近 Obsidian 文件树。
- `#166`：收敛 Welcome 首页、增加项目切换器、压缩设置页状态展示，并把 PDF / 图片默认解析计划改为 PaddleOCR-VL-1.5 配置门禁。
- `#167`：更新 R1 产品对齐矩阵，拆出后续外壳优先 PR。
- `#169`：阻止 invalid parser artifact 进入 runtime ingest；`combined.md` 只有在 manifest/source hash/parser/artifact hash/chunks 契约有效时才会被标记为可 ingest。

### 2. 当前仍需提交的文档分支

- R4 runtime 策略说明已整理到 `docs/runtime-dependency-strategy.md`。
- 本文档只记录 fork-first / upstream-first 决策、当前 detection 事实和下一步 runtime identity reporting，不改变 runtime 代码。

### 3. 已验证过的能力

- Welcome 渲染测试通过。
- TypeScript typecheck 通过。
- `#166`、`#167`、`#169` 的 macOS / Windows CI 均通过。
- `#169` 本地已通过 `npm test`、`npm run build`、`cargo test --manifest-path src-tauri/Cargo.toml --lib` 和 `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`。

## 三、仍未完成的需求

### R1. 外壳继续对齐 nashsu / Obsidian 工作区

优先级：P0  
状态：部分完成

还缺：

- Markdown 阅读体验还不够像 Obsidian 的主编辑/阅读区。
- backlinks、graph、file tree、command palette、settings、project switcher 需要形成统一工作区体验。
- 当前图谱更像 evidence navigation，不是成熟知识图谱。
- 插件/大模型 provider 的使用路径还不够像 Obsidian 插件生态。

验收标准：

- 有明确 project switcher。
- 有稳定文件树、概念树、source/concept/review/proposal 入口。
- 图谱能按 source、claim、concept、review、proposal 切换/过滤。
- Markdown 页面阅读、跳转、打开 Obsidian、打开 source artifact 都顺畅。
- parity matrix 标记每项：same / better / worse / intentionally different。

### R2. PaddleOCR-VL-1.5 真实默认解析闭环

优先级：P0  
状态：配置入口和 plan 已有，真实服务闭环未完成

还缺：

- 用真实 PaddleOCR-VL-1.5 服务跑 PDF / 图片解析。
- Parser 输出必须稳定生成 Markdown 和 JSON artifact。
- artifact 必须包含 source id、source path、page/region anchors、chunk boundaries、parser metadata、limitations、latency。
- Settings 里需要更直接地显示：endpoint、model、`PADDLEOCR_API_KEY`、connection test、parser dry-run、ready / missing_key / connection_failed。
- Benchmark 需要跑真实 OCR artifact，而不是只跑 mock。

验收标准：

- 新导入 PDF / 图片默认进入 PaddleOCR-VL-1.5 plan。
- 未配置 key 或 endpoint 时，ingest plan 明确显示 `paddleocr_config_required`。
- 配置后可以一键 test connection / test parser。
- 不启用 cloud/layout API 时，不会上传 raw document。

### R3. DeepSeek 论文全流程复验

优先级：P0  
状态：未在最新主线完整重跑

还缺：

- 重新记录 `deepseek_paper/` 真实 PDF 数量。
- 跑完整流程：ingest、parse、source discovery、claims、normalize、semantic QA、science review queue、contradiction scan、concept revision、lint、eval。
- 用 Obsidian 打开生成 vault 并保存 first-screen screenshot。
- 运行 DeepSeek research-strategy query，验证 evidence / inference / hypothesis / forecast 区分。
- 验证 query writeback 只生成 proposal，不静默写回。

验收标准：

- 生成本地 run report。
- 记录 Obsidian first impression 评分。
- 所有输出保持在 `LLM-Wiki/` 工作区内。
- 不修改 `deepseek_paper/`。

### R4. open-llm-wiki 内核依赖策略

优先级：P0  
状态：策略已在 `docs/runtime-dependency-strategy.md` 记录；代码只做现状梳理，未实现新的 runtime identity 检测

还缺：

- 当前建议采用 fork-first：桌面端 demo / smoke / release-readiness 优先 pin 到 `Aidenwu0209/open-llm-wiki`。
- upstream-first 作为长期目标保留，但需要继续审查并合并剩余 core PR 后再作为默认 runtime。
- 现有桌面端 detection 已能发现 vault-local `.open-llm-wiki/scripts/wiki_lint.py`、外部 `runtimePath` 的 `scripts/wiki_lint.py` 或直接 scripts 目录，并能读取 `VERSION` / `pyproject.toml` version。
- 仍缺 runtime source / branch / commit / dirty state 检测；也缺外部 `runtimePath` readiness 与 vault-local runtime installed 的区分展示。

验收标准：

- 本 PR 验收：`npm test`、`npm run build`。
- runtime fork 验收命令仍保留：`uv sync --dev --locked`、`uv run python scripts/check_quality.py`、`uv run python scripts/wiki_eval.py`、`uv run python scripts/wiki_lint.py examples/minimal-vault --fail-on p1`。
- 下一 PR 验收：桌面端设置页或 Dashboard 显示 runtime source、commit 或版本，并区分 vault-local runtime 与 external runtime path。

### R5. ERNIE live answer 质量验证

优先级：P1  
状态：本地 evidence-first 逻辑已有，真实 key 未完整复验

还缺：

- 使用真实 `AI_STUDIO_API_KEY` 在小 vault 上跑 live answer。
- UI 显示 latency、selected evidence ids、citations、unsupported claims、warnings。
- network/auth/rate-limit/model-not-found 错误要可理解、可行动。
- 回答不能引用不存在的 evidence id。

验收标准：

- 有 live-key optional test plan。
- 公共 CI 不依赖真实 key。
- no-evidence refusal 仍然成立。
- writeback 仍然 proposal-first。

### R6. 中文 ZIP / 混合资料包导入

优先级：P1  
状态：部分完成

还缺：

- 导入前预览中文文件名解码结果。
- 拒绝 traversal、symlink escape。
- 忽略 `__MACOSX` 等无用 sidecar。
- 保留中文文件名和嵌套文件夹结构。
- 中文 zip 解包后进入现有 ingest plan。

验收标准：

- 使用 `deepseek_paper_中文.zip` 做 smoke。
- 记录每个文件的目标路径和 hash。
- 不写出 workspace 之外。

### R7. 发布与跨平台稳定性

优先级：内部演示 P2，公开分发 P1  
状态：未完成

还缺：

- Windows 自动化 smoke。
- macOS clean-profile 安装后 smoke。
- Developer ID signing、hardened runtime、notarization、stapling。
- 权限拒绝时的 reveal/copy/manual recovery。

验收标准：

- macOS `.app` 能在干净用户环境打开项目、导入资料、打开 Obsidian URI。
- Windows 文档和手动 smoke 可复现。

## 四、建议下一步优先顺序

1. 先合并本分支的外壳修复和 PaddleOCR plan 修复，因为这会直接改善你现在看到的产品效果。
2. 接着做 R2：真实 PaddleOCR-VL-1.5 service 闭环。
3. 再做 R3：DeepSeek 论文全流程复验，生成可展示报告。
4. 最后做 R1 的深层阅读体验和图谱交互，不要一次性把所有 Obsidian 功能塞进一个 PR。
