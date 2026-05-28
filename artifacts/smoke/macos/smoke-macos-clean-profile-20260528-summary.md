# macOS Clean Profile Smoke Summary

Run date: 2026-05-28 CST automated smoke, with manual app check continuing on 2026-05-29 CST.

Commit: `e3005080248ee7ad920a9ac4d874d42aeedcd511`

Environment:

| Field | Value |
| --- | --- |
| macOS | 26.4.1, build 25E253 |
| Architecture | `arm64`; Darwin 25.4.0 |
| Node.js | `v24.14.0` |
| npm | `11.9.0` |
| rustc | `rustc 1.95.0 (59807616e 2026-04-14)` |
| cargo | `cargo 1.95.0 (f2d3ce0bd 2026-03-21)` |
| Xcode Command Line Tools | `/Library/Developer/CommandLineTools` |

Command results:

| Command | Result |
| --- | --- |
| `npm ci` | Pass |
| `npm test` | Pass |
| `npm run build` | Pass, with existing Vite large chunk warning |
| `cd src-tauri && cargo test` | Pass, 123 Rust tests passed |
| `npm run build:app` | Pass |

Build artifacts:

- App bundle: `src-tauri/target/release/bundle/macos/LLM Wiki.app`
- DMG bundle: `src-tauri/target/release/bundle/dmg/LLM Wiki_0.1.0_aarch64.dmg`

Manual app smoke:

| Step | Result |
| --- | --- |
| Open app | Pass; built `.app` launched and rendered the Welcome screen. |
| Create or open temporary vault | Attempted with a disposable `<tmp>/llm-wiki-macos-clean-profile-smoke/demo-vault`; not completed because macOS denied further Accessibility control during Finder picker automation. |
| Import sample file | Not completed after the picker automation was blocked. |
| Plan ingest | Not completed after the picker automation was blocked. |
| View dashboard | Not completed for the temporary vault. |
| Close app | Not recorded after the blocked picker step. |

Boundary checks:

- No ERNIE key was required.
- No PaddleOCR key was required.
- No raw document upload was performed.
- No proposal writeback was applied.
- Signing, notarization, and Developer ID distribution were not claimed.
