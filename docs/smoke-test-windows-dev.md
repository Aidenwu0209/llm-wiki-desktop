# Windows development smoke test

This document records the Windows baseline for this PR and defines the repeatable local smoke path. It is intentionally limited to Windows development, build, path handling, local parser/OCR command shape, ERNIE key handling, Tauri packaging, and smoke test coverage.

## Baseline before changes

Captured from a clean worktree on `origin/main` before editing:

| Check | Result |
| --- | --- |
| Date | 2026-05-28 |
| Branch | `codex/windows-smoke-compat` from `origin/main` |
| Commit | `01e36e62b1077793005b58cdbb1523d8bfb006db` |
| `node --version` | `v24.14.0` |
| `npm --version` | `11.9.0` |
| `rustc --version` | `rustc 1.94.1 (e408947bf 2026-03-25)` |
| `cargo --version` | `cargo 1.94.1 (29ea6fb6a 2026-03-24)` |
| `npm ci` | Passed. Installed 306 packages; audit reported 0 vulnerabilities. |
| `npm test` | Failed in `npm run test:rust` while compiling `flate2 v1.1.9`: no zlib backend selected. |
| `npm run build` | Passed. Vite emitted the existing chunk-size warning. |
| `cd src-tauri; cargo test; cd ..` | Failed with the same `flate2 v1.1.9` backend selection error. |
| `npm run build:app` | Failed during the Rust app build with the same `flate2 v1.1.9` backend selection error. No signed release was produced. |

Baseline failure detail:

```text
compile_error!("You need to choose a zlib backend")
No compression backend selected; enable one of zlib, zlib-ng, zlib-rs, or default rust_backend feature
```

## Smoke command

Run the Windows smoke locally from the repository root:

```powershell
npm run smoke:windows
```

The script writes logs under:

```text
artifacts/smoke/windows/
```

The smoke script records:

- Windows version.
- `node --version`.
- `npm --version`.
- `rustc --version`.
- `cargo --version`.
- `git rev-parse HEAD`.
- `npm ci`.
- `npm test`.
- `npm run build`.
- `cargo test` from `src-tauri`.
- `npm run build:app`.

The script uses `Join-Path`, does not hardcode user profile paths, does not require administrator rights, and does not require or write a real API key.

## Windows compatibility notes

| Area | Baseline gap | This PR's expected behavior |
| --- | --- | --- |
| Paths with spaces | Desktop commands passed paths as args in most places, but tests did not cover spaces in Windows paths. | Windows open/reveal/parser tests include paths with spaces. |
| Chinese paths | Relative vault display and command tests did not cover non-ASCII Windows paths. | Relative path and command tests include Chinese path segments. |
| Backslash vs slash | `rel_path` returned platform separators, so Windows vault paths could surface as `raw\inbox\file.md`. | Vault-relative display normalizes backslashes to `/`. |
| `C:\` drive paths | Windows command coverage used a simple drive path only. | Coverage includes drive paths with spaces, Chinese characters, and `&`. |
| UNC paths | No reproducible coverage for UNC-style vault-relative display. | Relative path test covers `\\server\share\...`. |
| Illegal filename characters | Runtime log file names could inherit `: * ? " < > |` from caller-provided job ids. | Runtime log file names sanitize Windows-illegal characters and reserved device names. |
| Explorer open folder | Existing `explorer <path>` behavior remains arg-based. | Test keeps open-folder command shape. |
| Explorer reveal file | Existing `explorer /select,<path>` behavior remains arg-based. | Test covers reveal with spaces/Chinese/special characters without shell invocation. |
| Obsidian URI | Windows used `cmd /C start`, so URI launch was shell-mediated. | Windows uses `rundll32 url.dll,FileProtocolHandler <uri>` with argv args. |
| Local CLI lookup | Windows already used `where`; Unix paths used `/bin/sh`. | Windows test asserts `where` for local CLI lookup. |
| PaddleOCR/local parser command args | Parser execution already used `Command` args, but there was no regression test for shell concatenation. | Parser args are factored and tested with a PaddleOCR/local parser-style source path containing spaces, Chinese text, and `&`. |
| `AI_STUDIO_API_KEY` | ERNIE defaults read the key from the environment, and bearer errors were redacted; env assignment text was not explicitly covered. | ERNIE redaction covers fake `AI_STUDIO_API_KEY=<value>` markers and bearer tokens without logging real keys. |

## Post-change validation

Validated from the PR worktree on 2026-05-28:

| Command | Result |
| --- | --- |
| `npm run test` | Passed. Welcome onboarding render check passed, TypeScript check passed, Rust tests passed with 109 tests. |
| `npm run build` | Passed. Vite emitted the existing chunk-size warning. |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | Passed. |
| `npm run smoke:windows` | Passed. Log: `artifacts/smoke/windows/smoke-windows-dev-20260528-090937.log`. |

Smoke subcommands:

| Smoke step | Result |
| --- | --- |
| Windows environment capture | Passed. Windows 11, version `10.0.26200`, build `26200`, 64-bit. |
| `node --version` | Passed. |
| `npm --version` | Passed. |
| `rustc --version` | Passed. |
| `cargo --version` | Passed. |
| `git rev-parse HEAD` | Passed. |
| `npm ci` | Passed. |
| `npm test` | Passed. |
| `npm run build` | Passed. |
| `cd src-tauri; cargo test; cd ..` | Passed. |
| `npm run build:app` | Passed. This smoke run does not claim or fake a Windows signed release. |
