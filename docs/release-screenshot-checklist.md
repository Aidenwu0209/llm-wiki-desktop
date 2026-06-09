# Release 截图清单

本清单用于准备 `v0.1.0-rc1` release notes、PR 描述和评审材料。截图只证明界面路径和 smoke 状态，不代表 production-ready、signed 或 notarized。

## 截图来源分级

- Demo vault 截图：优先使用 `examples/demo-vault/` 或合成 vault，适合 README、release notes 和公开 PR。
- Live smoke 截图：仅用于说明真实 OCR / ERNIE smoke 的脱敏结果，必须链接对应 smoke 报告，并说明 raw document bytes 是否离开本机。
- 用户资料截图：默认不得公开；如必须使用，应删除或遮挡用户名、本机路径、私有 vault 名称、raw documents、API key、模型 key env value 和未公开数据。

## 必备页面

- Dashboard：展示 vault 状态、ingest 状态、review queue 和 artifact / parser 风险摘要。示例见 [`docs/screenshots/dashboard.png`](screenshots/dashboard.png)。
- Raw Sources：展示 `raw/inbox/`、artifact 状态、parser contract 和 source registry 结果。示例见 [`docs/screenshots/raw-sources.png`](screenshots/raw-sources.png)。
- Settings Providers：展示 ERNIE / PaddleOCR 配置入口时，只能显示 env var 名称，不得显示真实 key 值。示例见 [`docs/screenshots/settings-providers.png`](screenshots/settings-providers.png)。
- Chat / Search：展示 evidence-first answer、引用 coverage、no-evidence refusal 或 evidence map。示例见 [`docs/screenshots/chat-search.png`](screenshots/chat-search.png)。
- Graph：展示 source、claim、concept、review、proposal 和 warning 之间的证据关系。示例见 [`docs/screenshots/evidence-graph.png`](screenshots/evidence-graph.png)。
- Traceability：展示断链、stale artifact、unsupported claim、source registry warning 和可执行 action card。
- Reading workspace：展示 source / concept / review / proposal 阅读区、history、relation pane、backlinks 和 source refs。

## 截图前检查

- [ ] 截图中没有 API key、token、cookie、provider response id 或完整 env value。
- [ ] 截图中没有本机用户名、绝对私有路径、私有 vault 名称或未脱敏 raw document。
- [ ] 截图中没有未公开 PDF / 图片 / 用户资料的正文、表格或元数据。
- [ ] 截图标题、说明和 release 文案区分 demo、fixture、dry-run、template、live smoke 和真实用户资料。
- [ ] 若截图来自 live OCR / ERNIE，已链接脱敏报告，并记录 endpoint host、model、key env var 名称和 raw bytes 是否离开本机。
- [ ] 若截图来自 demo vault，已确认样本为合成内容或可公开材料。
- [ ] 若页面当前还没有示例截图，只在清单中标记为待补，不把缺失截图写成已完成。

## 文件命名建议

公开截图建议放入 `docs/screenshots/`，使用稳定英文短名：

- `dashboard.png`
- `raw-sources.png`
- `settings-providers.png`
- `chat-search.png`
- `evidence-graph.png`
- `traceability.png`
- `reading-workspace.png`

新增截图 PR 应说明截图来源、脱敏处理、对应页面和是否来自 live smoke。
