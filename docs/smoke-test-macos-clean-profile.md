# macOS Clean Profile Smoke Test

## 1. Purpose

This smoke test verifies that LLM Wiki Desktop can complete dependency installation, tests, frontend build, Tauri build, and a minimal vault workflow check from a clean macOS profile or clean workspace without real provider keys.

The test must preserve the project runtime-first boundary: desktop manages vault selection, import entry points, task orchestration, status display, and recovery, while knowledge generation, QA, review queue, and writeback approval remain owned by the open-llm-wiki runtime. The smoke must not upload raw documents, bypass proposal-first writeback, auto-write `concepts/` or `sources/`, or invent user approval.

## 快速交付状态

- 自动 smoke：按现有记录，`npm run smoke:macos` 已完成依赖安装、测试、前端构建、Rust tests 和本地打包路径。
- `build:app`：按现有记录，已生成本地 unsigned `.app` / `.dmg`；这不等同于 signed、notarized 或 production-ready。
- 手动 vault workflow：仍需人工复验。临时 vault 创建、导入 sample、plan ingest 和 dashboard 检查在上一轮记录中是 partial / blocked，不能写成 full pass。
- 当前阻塞：Finder picker 自动化在 macOS picker / Accessibility 权限处受限；当前环境无法完成完整手动 UI workflow 证据采集。
- 跟踪 issue：[#213 [P1] 完成 macOS clean-profile 手动 vault smoke](https://github.com/Aidenwu0209/llm-wiki-desktop/issues/213)。

## 2. Environment

Record these values for every run. The scripted smoke logs the command-backed values automatically, including the commit hash.

| Field | How to record | Actual Value |
| --- | --- | --- |
| macOS version | `sw_vers` | macOS 26.4.1, build 25E253 |
| Machine architecture | `uname -m` or `uname -a` | `arm64`; Darwin 25.4.0 |
| Node.js version | `node --version` | `v24.14.0` |
| npm version | `npm --version` | `11.9.0` |
| Rust version | `rustc --version` | `rustc 1.95.0 (59807616e 2026-04-14)` |
| Cargo version | `cargo --version` | `cargo 1.95.0 (f2d3ce0bd 2026-03-21)` |
| Xcode Command Line Tools status | `xcode-select -p` | `/Library/Developer/CommandLineTools` |
| Commit hash | `git rev-parse HEAD` | `e3005080248ee7ad920a9ac4d874d42aeedcd511` |
| Test date | `date` | Automated smoke: 2026-05-28 23:42:53-23:47:05 CST; manual app check continued on 2026-05-29 CST |

## 3. Preconditions

- Node.js 20, or the version required by the current project scripts, is installed.
- Rust stable is installed.
- Xcode Command Line Tools are installed.
- No real API key is required.
- No real provider is required.
- No raw documents are uploaded.
- The test workspace is a disposable clone or a clean checkout, not a user's real vault.

## 4. Smoke Commands

Run the scripted entry point:

```bash
npm run smoke:macos
```

The script runs the current project commands from `package.json`:

```bash
npm ci
npm test
npm run build
cd src-tauri && cargo test
cd .. && npm run build:app
```

If `build:app` is missing or fails, the smoke is failed. Do not use `--if-present`, skip the command, or treat a partial frontend build as a packaged desktop pass.

## 5. Minimal Vault Workflow

Use a temporary directory and a disposable vault candidate for the manual vault smoke:

```bash
SMOKE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/llm-wiki-macos-smoke.XXXXXX")"
SMOKE_VAULT="$SMOKE_ROOT/demo-vault"
SMOKE_SAMPLE="$SMOKE_ROOT/sample.txt"
mkdir -p "$SMOKE_VAULT/raw/inbox"
printf 'Local smoke sample for LLM Wiki Desktop.\n' > "$SMOKE_SAMPLE"
```

Then launch the built app from:

```bash
open "src-tauri/target/release/bundle/macos/LLM Wiki.app"
```

Manual smoke required: this repository does not currently expose a supported npm or Tauri CLI that accepts a vault path and runs plan ingest, diagnostics, lint, or readiness checks non-interactively. Verify the minimal workflow through the desktop app:

1. Create or open a temporary vault under `$SMOKE_ROOT`; do not select a real user vault.
2. Import `sample.txt` through Raw Sources.
3. Run Refresh or Plan, if available in the current UI.
4. Confirm the sample appears in the plan state or action panel.
5. Confirm no provider key is requested for this minimal check.
6. Confirm no writeback is applied to `concepts/` or `sources/` without an explicit proposal and user approval.
7. Capture a failure screenshot only if the manual UI smoke fails.

If a future version adds a supported non-interactive vault diagnostic CLI, replace this manual section with that command and keep the no-provider, no-upload, proposal-first boundaries.

## 6. Expected Results

Fill in `Actual Result` and `Status` during the smoke run. Do not prefill or infer results.

| Step | Command | Expected Result | Actual Result | Status |
| --- | --- | --- | --- | --- |
| Dependency install | `npm ci` | Lockfile install completes without changing dependency definitions. | Completed during `npm run smoke:macos`; 306 packages installed, audit found 0 vulnerabilities. | Pass |
| Tests | `npm test` | TypeScript checks and Rust tests pass through the npm script. | Completed during `npm run smoke:macos`; welcome render checks, vault tree checks, TypeScript build, and Rust tests passed. | Pass |
| Frontend build | `npm run build` | TypeScript and Vite production build complete and write `dist/`. | Completed during `npm run smoke:macos`; Vite wrote `dist/`. The existing large chunk warning was emitted. | Pass |
| Rust tests | `cd src-tauri && cargo test` | Rust test suite passes from the Tauri crate directory. | Completed during `npm run smoke:macos`; 123 Rust tests passed, 0 failed. | Pass |
| Tauri package | `cd .. && npm run build:app` | Local `.app` and configured bundle artifacts are created. | Completed during `npm run smoke:macos`; unsigned local `.app` and `.dmg` bundles were produced. | Pass |
| Minimal vault workflow | Manual desktop smoke | Temporary sample import can be planned/refreshed without real provider keys, uploads, or unapproved writeback. | Partially completed. The built `.app` launched and showed the Welcome screen. A disposable vault and sample file were prepared under `<tmp>/llm-wiki-macos-clean-profile-smoke/`. Folder selection was attempted through the macOS picker, but UI automation lost Accessibility permission before the temporary vault could be opened and the sample import/plan/dashboard flow could be completed. No provider key was requested, no upload was performed, and no writeback was applied. | Partial / blocked |

## 6.1 Actual Run Notes

- Branch: `smoke/macos-clean-profile-results`, based on `origin/main`.
- Clean workspace baseline: `e3005080248ee7ad920a9ac4d874d42aeedcd511`.
- Scripted command: `npm run smoke:macos`.
- Scripted result: passed.
- Raw local log: `artifacts/smoke/macos/smoke-macos-clean-profile-20260528-234253.log`. This log is not submitted because it contains the local checkout path.
- Sanitized submitted summary: `artifacts/smoke/macos/smoke-macos-clean-profile-20260528-summary.md`.
- Built app bundle: `src-tauri/target/release/bundle/macos/LLM Wiki.app`.
- Built DMG bundle: `src-tauri/target/release/bundle/dmg/LLM Wiki_0.1.0_aarch64.dmg`.
- Manual app launch: passed; the built app opened and rendered the Welcome screen.
- Manual temporary vault workflow: not completed; see Known Limitations.

## 7. Artifacts

Keep these artifacts after each run:

- Log file: `artifacts/smoke/macos/smoke-macos-clean-profile-YYYYMMDD-HHMMSS.log`
- Frontend build output: `dist/`
- Tauri app bundle path: `src-tauri/target/release/bundle/macos/LLM Wiki.app`
- Tauri DMG path, when produced: `src-tauri/target/release/bundle/dmg/`
- Diagnostic bundle path, if a future supported diagnostic CLI produces one.
- Failure screenshot path, if the manual app smoke requires a screenshot.

## 8. Known Limitations

- App notarization: not covered.
- Apple Developer ID signing: not covered.
- Provider-backed QA: not covered when no provider key is available.
- Windows testing: not part of this macOS clean-profile smoke.
- Manual temporary vault import/plan/dashboard flow was attempted but not completed in this run because macOS denied further Accessibility control to `osascript` during Finder picker automation. This is an evidence limitation for this run, not a product pass claim. A follow-up run should complete the manual UI steps from a human-controlled clean profile or with Accessibility permission granted before starting the smoke.
