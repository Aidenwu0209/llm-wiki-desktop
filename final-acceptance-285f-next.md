Summary:
- This round focused on product-loop acceptance and small fixes on top of target commit `285f88230787229d945c114865b2251350488935`.
- Welcome/Create Project now has verified vault creation metadata on disk: project name, `research` template, AI output language, parent directory, and purpose are saved in `_state/desktop-settings.json`.
- Settings now avoids pretending hosted API providers are fully configured: local CLI providers are explicit, API keys are not stored or displayed, and reserved sections say `Coming soon / Reserved`.
- Raw Sources now matches registry/source/artifact paths after vault-relative normalization and shows selected source details in collapsible sections.
- Evidence Search is deliberately named as a local evidence draft surface, shows active provider context, diversifies results across source/claim/concept/review/proposal/warning/evidence, and scopes query history by vault path.
- Evidence Graph is positioned as an Evidence Graph, not graph analytics; it includes source, claim, concept, review, warning, proposal nodes and filtered edge views with limits.
- Release app state now saves selected vaults through the actual LLM-Wiki workspace cache and mirrors launch-scope state, preventing the packaged app from trying to write `/.cache/llm-wiki-desktop`.

Screenshots:
- Local-only screenshot evidence was kept out of Git because it is about 60 MB and includes desktop/path details.
- Screenshot root: `/Users/wu/Desktop/wu/AAaabaidu/LLM-Wiki /runs/desktop-acceptance-285f-next/acceptance-285f-next/screenshots`
- `welcome.png`
- `create-project-modal.png`
- `create-project-filled.png`
- `after-create-dashboard.png`
- `settings-llm-models.png`
- `settings-codex-expanded.png`
- `settings-about.png`
- `raw-sources.png`
- `chat-search.png`
- `evidence-map.png`
- `graph-overview.png`
- `graph-node-details.png`
- `app-icon-finder.png`
- `app-icon-dock.png`
- `about-logo.png`

Scores:
- General desktop maturity: 84/100
- UI completeness: 86/100
- Release experience: 82/100
- Chat/Search: 80/100
- Graph: 78/100
- Branding: 90/100
- Safety: 88/100
- Maintainability: 76/100

Validation:
- npm ci: passed, 76 packages installed, 0 vulnerabilities.
- npm run build: passed, TypeScript and Vite production build completed.
- npm test: passed, includes 30 Rust tests through `npm run test:rust`.
- cargo test: passed, 30 tests.
- npm run build:app: passed, generated `src-tauri/target/release/bundle/macos/LLM Wiki.app` and `src-tauri/target/release/bundle/dmg/LLM Wiki_0.1.0_aarch64.dmg`.
- npm run desktop:dev: smoke passed through Vite ready on `http://localhost:1420/`, Cargo dev build finished, and `target/debug/llm-wiki-desktop` launched; process was intentionally terminated after the startup proof.
- git diff --check: passed.

Functional acceptance:
- Welcome/Create Project: passed by UI screenshots plus filesystem verification. Test vault created at `/Users/wu/Desktop/wu/AAaabaidu/LLM-Wiki /tmp/acceptance-test-285f`; metadata saved in `_state/desktop-settings.json`. Visual after-create capture was recovered through the packaged-app dashboard path rather than the original create transition because the first create run lost its accessible window.
- Settings/Provider: passed. LLM Models shows local Codex CLI as active, hosted API providers no longer imply full key-backed configuration, and reserved sections are marked `Coming soon / Reserved`.
- Raw Sources: passed. DeepSeek vault shows 22 published sources, selected source preview/artifact/details, path/hash/parser/artifact/claim/concept/traceability fields, and open/reveal/copy/Obsidian actions.
- Chat/Search: passed with scoped caveat. The page is now `Evidence Search / Answer Draft`, not full model chat. It reads active provider context, shows local evidence results and evidence map, and keeps proposal-first writeback language.
- Graph: passed with scoped caveat. Evidence Graph shows real counts and graph controls for sources, claims, concepts, reviews, warnings, proposals, and edge filters. It does not claim Louvain or graph insight analysis.
- Logo/Release: passed. Icon assets exist, packaged app is named `LLM Wiki.app`, Finder and app/About logo screenshots were captured.
- Writeback safety: passed by existing tests and UI contract. Query writeback remains proposal-first; unapproved drafts are not written directly to source/concept pages.
- Obsidian: packaged app restored the DeepSeek generated vault, requested macOS Desktop permission, then reported Obsidian enabled and dashboard available. It opens the generated vault path, not the workspace root.
- Lint: app dashboard reports schema valid; `git diff --check` passed. Full runtime lint on the DeepSeek vault still has known non-P0 artifact-contract findings from prior validation and was not broadened in this product-polish pass.

Comparison with nashsu/llm_wiki:
- Already close: first-run Welcome, vault dashboard, local-first positioning, settings/provider center, source workspace, search/draft/writeback surface, evidence graph, icon/release polish.
- Still behind: deeper guided onboarding, richer graph interaction, polished create/open/recent-project visual continuity, and end-to-end LLM answer generation with provider execution.
- This project is stronger: open-llm-wiki runtime-first boundary, evidence-first surfaces, proposal-first query writeback, approval gate, DeepSeek research validation workflow, and local vault safety semantics.

Remaining gaps:
- Replace the current local evidence draft with a real optional provider-backed answer generation path only after active-provider execution, streaming, timeout, and evidence retention are designed.
- Add a small create-project transition regression test so UI automation can assert Dashboard + Recent Projects immediately after create without relying on screenshot/manual observation.
- Continue trimming large components in a later behavior-neutral refactor; current files are manageable but still near the point where hooks/subcomponents would reduce review load.
- Add explicit release-readiness documentation for macOS Desktop folder permission prompts when vaults live under Desktop.
