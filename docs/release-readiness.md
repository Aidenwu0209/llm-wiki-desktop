# Release Readiness

This document defines the local release-candidate path for LLM Wiki Desktop. It does not replace signing, notarization, or a full public distribution process.

Release readiness is evaluated against the current product goal: existing vault workflows must be reliable before adding new surface area. DFC vaults may be used as a local acceptance sample for Dashboard, Raw Sources, and Obsidian entry-note behavior, but passing a DFC smoke test does not mean the product is only for DFC content.

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

1. Launch `src-tauri/target/release/bundle/macos/LLM Wiki.app`.
2. Confirm startup restores the last selected vault or shows the centered Welcome page with New Project / Open Project / recent / demo actions.
3. Create a project and confirm project name, template, AI output language, and parent directory are persisted in desktop settings.
4. Open a generated DeepSeek vault, not the outer workspace or raw PDF folder.
5. Confirm Dashboard shows vault health, runtime, Obsidian, lint/review/writeback status, and next actions.
6. Open Raw Sources and confirm Refresh / Import / Folder, source list, preview, details drawer, and Obsidian actions work.
7. Run a small runtime action and confirm Activity shows status, duration, command, logs, cancel/timeout/retry controls, and persisted history.
8. Open Traceability and confirm warning cards can open claim/source/artifact targets or expose fallback paths.
9. Open Chat / Search and confirm vault search results include source/claim/concept/review/proposal relations and an evidence map.
10. Convert a grounded chat question into a Query Writeback proposal and confirm no concept/source page is modified before approval.
11. Approve and apply only a safe test proposal, then confirm post-apply dashboard refresh and lint behavior.
12. Open Graph and confirm source -> claim -> concept/review/proposal/warning relations are usable for evidence navigation.
13. Open Settings / LLM Models and About, confirm provider toggles, local CLI check, logo, version, repo link, and runtime boundary are visible.

## Clean macOS Profile Smoke

Run this after the automated checks on a fresh macOS user profile or a profile that has not previously opened LLM Wiki Desktop.

1. Copy the local `.app` bundle into the profile and launch it from Finder.
2. Record the first launch state: either the Welcome page appears or the last selected vault restore fails with a clear path-specific message.
3. Create or open a generated vault under `vaults/<generated-vault>`. Do not select the outer workspace root or a raw PDF folder such as `deepseek_paper/`.
4. If macOS prompts for Desktop, Documents, Downloads, or removable-volume access, allow the permission only when the selected generated vault actually lives there. If permission is denied, the app must still offer copy path / reveal / open folder recovery.
5. Verify selecting the workspace root warns that the user must choose a generated vault under `vaults/`.
6. Verify selecting a raw PDF/source folder warns that Dashboard state, source registry, and the Obsidian entry note live in the generated vault.
7. Open Dashboard and confirm vault health, ingest plan, registry/manifest state, traceability, and writeback status are visible without running a hidden ingest.
8. Open Raw Sources, import one small local file, refresh, and confirm the source appears in the plan state without auto-applying downstream writeback or review status.
9. For a DFC acceptance sample, use an existing generated DFC vault and verify Dashboard -> Raw Sources -> Obsidian entry note is understandable from a user perspective.
10. Open Obsidian from the app. If Obsidian is installed, the generated entry note should focus. If Obsidian is missing or does not focus, the app must expose Copy URI, Copy path, Reveal in Finder, and Open folder fallbacks.
11. Confirm screenshots or screen recordings used as local evidence are kept outside Git unless explicitly reviewed for private content and approved for commit.

Clean-profile pass criteria:

- The first-screen path is understandable without knowing the repo layout.
- Generated vault, workspace root, and raw PDF folder are not visually interchangeable.
- Permission denial does not strand the user.
- Obsidian failure has a recoverable manual path.
- DFC validates the current reading/evidence workflow; it is not treated as a product scope constraint.

## Windows Desktop Smoke

Windows is not covered by the current GitHub Actions runner, so the macOS CI must be paired with a targeted helper-contract check and a manual Windows smoke before calling a Windows build ready.

Required Windows behaviors:

1. Open file/folder uses Explorer.
2. Reveal file uses `explorer /select,<path>` so the selected artifact is visible instead of only opening the parent folder.
3. Obsidian entry-note launch uses a path-based `obsidian://open?path=...` URI, then falls back to Open folder / Copy URI / Copy path if Obsidian is missing.
4. Local Codex / Claude CLI checks use `where` instead of `/bin/sh`.
5. Generated vault, workspace root, and raw PDF folder warnings match the macOS clean-profile smoke.

Minimum manual Windows smoke:

1. Start the app from a Windows build or development run.
2. Open a generated vault under `vaults/<generated-vault>`.
3. Click Obsidian and confirm the generated entry note opens when Obsidian is installed.
4. Uninstall or disable Obsidian protocol handling, click Obsidian again, and confirm Copy URI / Copy path / Open folder recovery is visible.
5. Run local provider checks for Codex and Claude and confirm missing tools report as missing tools, not `/bin/sh` errors.

## macOS Packaging Notes

The local build currently targets macOS `.app` and `.dmg` bundles. Treat these modes separately:

| Stage | What it proves | What it does not prove |
| --- | --- | --- |
| Local RC `.app` | The current branch builds and can run a user-style smoke test on this Mac. | It is not signed, notarized, or safe to call public-release ready. |
| Local RC `.dmg` | The bundle can be packaged and opened locally. | It does not prove Gatekeeper, quarantine, or first-run permission behavior for outside users. |
| Formal distribution | The app is signed, hardened, notarized, stapled, and smoke-tested on a clean profile. | It still needs release notes, rollback guidance, and support paths. |

Public distribution still requires:

- Developer ID signing.
- Hardened runtime configuration.
- Notarization and stapling.
- A fresh install smoke test on a clean macOS user profile.

Do not treat a successful unsigned local bundle as a production-ready release.
