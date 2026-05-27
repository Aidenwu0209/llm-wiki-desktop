# macOS Clean Profile Smoke Test

## 1. Purpose

This smoke test verifies that LLM Wiki Desktop can complete dependency installation, tests, frontend build, Tauri build, and a minimal vault workflow check from a clean macOS profile or clean workspace without real provider keys.

The test must preserve the project runtime-first boundary: desktop manages vault selection, import entry points, task orchestration, status display, and recovery, while knowledge generation, QA, review queue, and writeback approval remain owned by the open-llm-wiki runtime. The smoke must not upload raw documents, bypass proposal-first writeback, auto-write `concepts/` or `sources/`, or invent user approval.

## 2. Environment

Record these values for every run. The scripted smoke logs the command-backed values automatically, including the commit hash.

| Field | How to record | Actual Value |
| --- | --- | --- |
| macOS version | `sw_vers` |  |
| Machine architecture | `uname -m` or `uname -a` |  |
| Node.js version | `node --version` |  |
| npm version | `npm --version` |  |
| Rust version | `rustc --version` |  |
| Cargo version | `cargo --version` |  |
| Xcode Command Line Tools status | `xcode-select -p` |  |
| Commit hash | `git rev-parse HEAD` |  |
| Test date | `date` |  |

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
| Dependency install | `npm ci` | Lockfile install completes without changing dependency definitions. |  |  |
| Tests | `npm test` | TypeScript checks and Rust tests pass through the npm script. |  |  |
| Frontend build | `npm run build` | TypeScript and Vite production build complete and write `dist/`. |  |  |
| Rust tests | `cd src-tauri && cargo test` | Rust test suite passes from the Tauri crate directory. |  |  |
| Tauri package | `cd .. && npm run build:app` | Local `.app` and configured bundle artifacts are created. |  |  |
| Minimal vault workflow | Manual desktop smoke | Temporary sample import can be planned/refreshed without real provider keys, uploads, or unapproved writeback. |  |  |

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
