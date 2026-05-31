# Changelog

本文件记录 LLM Wiki Desktop 的重要变更。

## Unreleased

- 新增 Apache-2.0 `LICENSE`，并同步 README、CONTRIBUTING、package metadata 的许可证口径。
- 新增 `docs/release-notes-v0.1.0-rc1.md` 和 `docs/release-publish-checklist.md`，准备 `v0.1.0-rc1` unsigned release candidate 材料。
- 刷新 `requirement.md`，删除旧 PR / 旧 commit 口径，改为当前 `main` 的已完成能力、未完成项和 P0 / P1 / P2 任务清单。
- 创建中文 roadmap issues：[#210](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/210) - [#220](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/220)。
- 记录 2026-05-28 macOS clean-profile 自动 smoke / `build:app` 结果，以及当时手动 vault workflow partial / blocked 边界。
- 记录 2026-05-31 macOS release DMG 手动 vault smoke，覆盖临时 vault 创建、sample 导入、manual plan、Dashboard、Raw Sources 和 Wiki Chat；同时修复独立 release App 误写 `/.cache/llm-wiki-desktop` 的 selected-vault state fallback。

## v0.1.0-rc1 (pre-release)

- 发布 `v0.1.0-rc1` unsigned release candidate，并在 GitHub Release 中标记 pre-release；macOS DMG 已用于 2026-05-31 手动 vault smoke。
- 真实 PaddleOCR-VL-1.5 parse smoke：[#210](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/210)。
- 真实 ERNIE evidence-first answer smoke：[#211](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/211)。
- macOS clean-profile 手动 vault smoke：[#213](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/213)。
- Windows packaged smoke：[#217](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/217)。
- 第一轮真实用户反馈：[#214](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/214)。
