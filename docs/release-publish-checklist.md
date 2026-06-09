# v0.1.0-rc1 发布检查清单

本清单用于发布 `v0.1.0-rc1` unsigned release candidate。它只覆盖候选发布材料和 smoke test，不代表 production-signed distribution。

## 发布前确认

- [ ] 确认 `LICENSE` 已提交，许可证为 Apache-2.0。
- [ ] 确认 `README.md`、`CONTRIBUTING.md`、`package.json` 和 `package-lock.json` 的许可证口径一致。
- [ ] 更新 `CHANGELOG.md`，包含 `v0.1.0-rc1` 条目。
- [ ] 确认 `docs/release-notes-v0.1.0-rc1.md` 说明 unsigned、pre-release、not production-ready、not signed、not notarized。
- [ ] 确认 release notes 没有 API key、私有 vault、私有路径、真实用户资料或未脱敏 raw document。
- [ ] 按 [`docs/release-screenshot-checklist.md`](release-screenshot-checklist.md) 准备公开截图，并区分 demo vault、live smoke 和用户资料截图。
- [ ] 确认真实 OCR / ERNIE 未运行时，不写成 live pass。

## 必跑命令

```bash
npm ci
npm test
npm run build
```

记录每条命令的结果。如果任何命令失败，不要发布 release candidate；在 PR 或 release draft 中说明失败原因和后续 issue。

## 可选打包命令

```bash
npm run build:app
```

如果运行成功，只能把产物描述为本地 unsigned candidate bundle。不得声称 production-ready、signed、notarized、stapled 或 production installer 已完成。

## Tag 与 GitHub Release

- [ ] 确认当前分支已合入 `main`，且 `main` 包含 release notes、checklist、CHANGELOG 和 LICENSE。
- [ ] 创建 tag：`v0.1.0-rc1`。
- [ ] 创建 GitHub Release，并选择 `v0.1.0-rc1` tag。
- [ ] 将 GitHub Release 标记为 pre-release。
- [ ] Release 标题使用中文，且明确包含 `v0.1.0-rc1` 和 `unsigned release candidate`。
- [ ] Release 描述链接 `docs/release-notes-v0.1.0-rc1.md`。
- [ ] Release 描述链接真实后续 issue：[#210](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/210)、[#211](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/211)、[#213](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/213)、[#217](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/217)。

## 不得标记为完成

- [ ] 不得标记 production-ready。
- [ ] 不得标记 signed。
- [ ] 不得标记 notarized。
- [ ] 不得标记 Developer ID signing 已完成。
- [ ] 不得声称已提供 production installer。
- [ ] 不得声称真实 PaddleOCR live parse 已完成，除非 [#210](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/210) 有脱敏 live report。
- [ ] 不得声称真实 ERNIE live answer 已完成，除非 [#211](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/211) 有脱敏 live report。
- [x] macOS manual vault smoke 需要真实人工复验记录；2026-05-31 release DMG run 已提交到 `docs/reports/smoke-macos-release-manual-vault-20260531-summary.md`，并记录非阻塞 standalone cache warning。
- [ ] 不得声称 Windows packaged smoke 已完成，除非 [#217](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/217) 有记录。

## 发布后跟踪

- [ ] 在 [#212](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/212) 中记录 tag、release 链接和测试结果。
- [ ] 若发布过程中发现未验证事项，创建中文 issue，不要在 release 文案中补成已完成。
- [ ] 若发现截图需要补充，更新 [`docs/release-screenshot-checklist.md`](release-screenshot-checklist.md) 并附带脱敏说明。
