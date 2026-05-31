# macOS Release Manual Vault Smoke Summary

Run date: 2026-05-31 CST, 09:14-09:35.

Release under test: `v0.1.0-rc1` pre-release.

Asset: `LLM.Wiki_0.1.0_universal-macos-universal.dmg`

Verified asset SHA-256: `f060482dcdf4623d4ae27f552807918b9a5128927c9ebb2dd42bd5dca65d9d1d`

Local checkout baseline for the smoke record: `3edd0fcc4e258d6fe71fa6b675795c13aabcae42`

Environment:

| Field | Value |
| --- | --- |
| macOS | 26.4.1, build 25E253 |
| Architecture | `arm64` |
| Node.js | `v24.14.0` |
| npm | `11.9.0` |
| rustc | `rustc 1.95.0 (59807616e 2026-04-14)` |
| cargo | `cargo 1.95.0 (f2d3ce0bd 2026-03-21)` |

Manual release DMG workflow:

| Step | Result |
| --- | --- |
| Download release DMG | Pass. Downloaded `LLM.Wiki_0.1.0_universal-macos-universal.dmg` from GitHub release `v0.1.0-rc1`. |
| Verify DMG | Pass. SHA-256 matched GitHub release metadata. |
| Mount DMG | Pass. Mounted read-only at `/Volumes/LLM Wiki`; detached after the smoke. |
| Open app | Pass. Opened `LLM Wiki.app` from the mounted release DMG. The bundle is unsigned as documented for the RC. |
| Create temporary vault | Pass with non-blocking UI error. Created disposable project `manual-vault-smoke` under a temporary smoke directory. The app showed `failed to create /.cache/llm-wiki-desktop: Read-only file system (os error 30)` after save/refresh, but the vault was created and remained usable. This PR fixes the standalone selected-vault state fallback that caused that error. |
| Import sample | Pass. Imported `manual-vault-smoke-sample.md` into `raw/inbox/manual-vault-smoke-sample.md`; source and target SHA-256 both matched `312729f9c2f5672b7e04a4e9340e01d31cfe6c19fd410b7a294fce50b285b614`. |
| Plan ingest | Pass. Manual Plan produced `total=1`, `stageable=1`, `blocked=0`; entry `manual-vault-smoke-sample.md` had `currentState=imported`, `action=stage_text_artifact`, `requiresHumanApproval=false`, and `usesNetwork=false`. |
| Open Dashboard | Pass. Dashboard opened for the temporary vault and surfaced 1 raw evidence input / 1 runnable ingest item. |
| Open Raw Sources | Pass. Raw Sources listed the imported sample with plan details, expected outputs, hash, and no network/API requirement. |
| Open Wiki Chat | Pass. Chat opened with no configured provider, `Use ERNIE` disabled, local search returned the imported inbox sample, and ordinary Send produced a local deterministic evidence draft stating no model provider was called. |
| Writeback boundary | Pass. No query writeback proposal was created and no `concepts/` or `sources/` page was modified by chat send. |

Boundary checks:

- No provider key was requested.
- No ERNIE or OCR API call was made.
- No raw document upload was performed.
- No writeback proposal was applied.
- Signing, notarization, stapling, and Developer ID distribution were not claimed.

Screenshot evidence:

Screenshots were captured during the manual smoke but are not committed. They are local run evidence and may contain desktop paths or other private context.
