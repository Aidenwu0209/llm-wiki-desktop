# 需求待办：LLM Wiki Desktop 当前目标与剩余工作

最后更新：2026-05-28  
仓库：`Aidenwu0209/llm-wiki-desktop`  
当前主线基线：`789c0c9 ui(shell): render nested vault file tree (#165)`  
当前 Open PR：无  

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

### 2. 本工作分支已处理，仍需验证和提交

- Welcome 首页已去掉外露的 OCR / ERNIE 链路说明；这些流程应在进入项目后展示。
- 顶部增加明显的项目切换器，可看到当前项目、最近项目、已检测项目，并可新建或打开项目。
- 设置页展示已收敛：设置页不再铺开过多运行状态 pill，背景和内容宽度更接近桌面设置页。
- PDF / 图片 ingest plan 的默认解析方向已改为 PaddleOCR-VL-1.5，未配置 endpoint 或 `PADDLEOCR_API_KEY` 时会明确阻塞，不会假装可解析。
- PaddleOCR-VL-1.5 会映射到 runtime layout parser 的受控调用，并通过环境变量传 key，避免把 key 写入 vault 或日志。

### 3. 已验证过的能力

- Welcome 渲染测试通过。
- TypeScript typecheck 通过。
- 之前本地构建通过；完整 `npm test` 在本机曾卡在 Rust doctest SIGKILL，前端与 Rust lib 测试本身已分别通过，但仍需要在 CI 里确认。

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
状态：未最终确定

还缺：

- 决定桌面端 runtime 依赖走 fork-first 还是 upstream-first。
- 如果走 fork-first，需要文档明确 pin 到 `Aidenwu0209/open-llm-wiki`。
- 如果走 upstream-first，需要继续审查并合并剩余 core PR。
- 桌面端 runtime detection 需要清楚显示当前使用的是哪个 runtime。

验收标准：

- `uv sync --dev --locked`
- `uv run python scripts/check_quality.py`
- `uv run python scripts/wiki_eval.py`
- `uv run python scripts/wiki_lint.py examples/minimal-vault --fail-on p1`
- 桌面端设置页显示 runtime source、commit 或版本。

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
