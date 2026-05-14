# Release Readiness

This document defines the local release-candidate path for LLM Wiki Desktop. It does not replace signing, notarization, or a full public distribution process.

## Modes

| Mode | Command | Use |
| --- | --- | --- |
| Local trial | `npm run start` | Starts the Tauri desktop app for a user-style smoke test. |
| Desktop development | `npm run desktop:dev` | Runs Tauri with the Vite dev server and desktop APIs. |
| Web UI development | `npm run dev:web` | Runs the React surface only; useful for layout checks, not full desktop validation. |
| Release candidate | `npm ci && npm run build && npm test && npm run build:app` | Builds the frontend, runs Rust tests, and creates local app bundles. |

## Required Checks

```bash
npm ci
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run build:app
```

## Manual Acceptance

1. Launch `src-tauri/target/release/bundle/macos/LLM Wiki Desktop.app`.
2. Confirm startup restores the last selected vault or shows the welcome state with recent/open/create/demo actions.
3. Open a generated DeepSeek vault, not the outer workspace or raw PDF folder.
4. Confirm Dashboard shows vault health, runtime, Obsidian, lint/review/writeback status, and next actions.
5. Run a small runtime action and confirm Activity shows status, duration, command, logs, cancel/timeout/retry controls, and persisted history.
6. Open Traceability and confirm warning cards can open claim/source/artifact targets or expose fallback paths.
7. Open Chat / Search and confirm vault search results include source/claim/concept/review/proposal relations and an evidence map.
8. Convert a grounded chat question into a Query Writeback proposal and confirm no concept/source page is modified before approval.
9. Approve and apply only a safe test proposal, then confirm post-apply dashboard refresh and lint behavior.
10. Open Graph and confirm source -> claim -> concept/review/proposal/warning relations are usable for evidence navigation.

## macOS Packaging Notes

The local build currently targets macOS `.app` and `.dmg` bundles. Public distribution still requires:

- Developer ID signing.
- Hardened runtime configuration.
- Notarization and stapling.
- A complete production icon set.
- A fresh install smoke test on a clean macOS user profile.

Do not treat a successful unsigned local bundle as a production-ready release.
