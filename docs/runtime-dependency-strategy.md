# open-llm-wiki runtime dependency strategy

Baseline: `42939ba` (`docs: update product parity matrix (#167)`), including `#169` parser artifact contract gating.

Scope of this note: document the desktop runtime dependency strategy and the current detection facts. This PR does not change PaddleOCR parser behavior, UI shell layout, DeepSeek workflows, or `deepseek_paper/`.

## Decision

Use a **fork-first** runtime policy for desktop integration until the required desktop/runtime contracts are upstreamed and verified.

The desktop app should treat `Aidenwu0209/open-llm-wiki` as the pinned integration target for demo, smoke, and release-readiness work. Upstream `nashsu/llm_wiki` remains the long-term source to track, but it should not be the default runtime target for desktop validation until the remaining core PRs and contracts are audited into a compatible state.

## Why fork-first

The desktop app currently depends on a concrete runtime script contract:

- Vault initialization: `wiki_init.py`.
- Runtime lint/status/discovery/ingest/claim/review commands.
- Stable vault state files under `_state/`.
- Proposal-first writeback and review-owned state.
- Parser handoff through `pdf_to_markdown.py`.

Those contracts are app-facing and need a predictable checkout while the desktop shell, smoke tests, and release package are still changing. Fork-first keeps the product demo reproducible and lets us pin the exact runtime that desktop users are expected to select.

## Upstream-first alternative

Upstream-first would make the desktop app follow `nashsu/llm_wiki` directly. That reduces fork drift, but it is not the current recommended default because every desktop-visible runtime command and state file would need to be re-audited after upstream changes.

Use upstream-first only after:

- The remaining runtime core PRs are reviewed and merged upstream.
- The script names and required arguments listed below are stable upstream.
- Runtime output contracts for source registry, artifacts, review queue, traceability, and writeback proposals are stable.
- Desktop smoke and runtime acceptance commands pass against the upstream checkout without app-side shims.

## Current runtime detection facts

The current desktop code already has path and version detection, but it does not yet detect Git source or commit.

### User-configured runtime path

`DesktopSettings.runtimePath` is selected through the runtime directory picker and passed to runtime commands. It is used by:

- `create_vault(...)`
- `run_runtime_command(...)`
- `start_runtime_command_job(...)`
- `run_ingest_pipeline(...)`

The picker can point at an open-llm-wiki repository root. Some runtime command paths can also point directly at a `scripts/` directory.

### Vault-local runtime path

`inspect_vault(...)` reports a runtime as installed only when the selected vault contains:

```text
.open-llm-wiki/scripts/wiki_lint.py
```

When this exists, `runtimeInstalled` is true and `runtimeScriptsPath` is set to that vault-local scripts path.

Important gap: an external `runtimePath` in settings can be usable for command execution, but `inspect_vault(...)` does not currently mark `runtimeInstalled` true from that external path. The dashboard can show the configured path as detail, but runtime readiness is still based on the vault-local `.open-llm-wiki/scripts/wiki_lint.py` check.

### Runtime command resolution

`resolve_scripts_dir(vault, runtime_path)` resolves runtime scripts in this order:

1. Vault-local `.open-llm-wiki/scripts` if it contains `wiki_lint.py`.
2. Configured runtime root if `<runtimePath>/scripts/wiki_lint.py` exists.
3. Configured scripts directory if `<runtimePath>/wiki_lint.py` exists.
4. Otherwise it errors with `missing open-llm-wiki runtime scripts; select runtime path or initialize the vault`.

Runtime actions execute Python directly with `Command` args; they do not invoke shell strings for these script calls.

### Runtime version detection

When a vault-local runtime is detected, `runtime_version_for_scripts(...)` reports:

1. `<scripts parent>/VERSION` if present and non-empty.
2. The first `version = "..."` line found in `pyproject.toml` under the scripts parent or its parent.
3. Fallback: `desktop-adapter <desktop cargo package version>`.

Current gap: this is version-string detection only. It does not report the runtime Git remote, fork owner, branch, dirty state, or commit hash.

### Runtime commands currently expected by desktop

The desktop command adapter expects these script names:

| Desktop action | Runtime script |
| --- | --- |
| `lint` | `wiki_lint.py` |
| `obsidian_setup` | `wiki_obsidian_setup.py` |
| `status_dashboard` | `wiki_status.py` |
| `discover` | `wiki_discover_sources.py` |
| `ingest_corpus` | `wiki_ingest_corpus.py` |
| `claims` | `wiki_claims.py` |
| `normalize` | `wiki_normalize_metrics.py` |
| `semantic_qa` | `wiki_semantic_qa.py` |
| `contradictions` | `wiki_contradictions.py` |
| `science_review` | `wiki_science_review.py` |
| `concept_revision_preview` | `wiki_concept_revision.py` |
| `concept_revision_apply` | `wiki_concept_revision.py --apply` |
| PDF/image parse | `pdf_to_markdown.py` |

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Fork drift from upstream | Desktop may depend on behavior that does not exist upstream. | Track upstream regularly and document the pinned fork commit for demo/release branches. |
| Runtime mismatch | A user can select a checkout with matching script names but incompatible output contracts. | Add source/commit detection in a follow-up PR and surface it in Settings/Dashboard. |
| External runtime readiness ambiguity | Settings may contain a valid external runtime path while `runtimeInstalled` remains false because only vault-local runtime is counted. | Add lightweight external runtime readiness reporting in a follow-up PR. |
| Version string is not enough | `VERSION` or `pyproject.toml` can identify a release but not a fork or commit. | Detect Git remote/commit/dirty state when the runtime path is a Git checkout. |
| Over-enforcing too early | Hard failure on non-fork paths would block local development and upstream testing. | Start with reporting and warnings before enforcing pins. |

## Acceptance commands

For this documentation/detection PR:

```bash
npm test
npm run build
```

For a pinned fork runtime checkout before demo or release validation:

```bash
uv sync --dev --locked
uv run python scripts/check_quality.py
uv run python scripts/wiki_eval.py
uv run python scripts/wiki_lint.py examples/minimal-vault --fail-on p1
```

For a desktop/runtime integration smoke after choosing the pinned runtime path:

```bash
npm run smoke:windows
# or
bash scripts/smoke/macos-clean-profile.sh
```

Do not run a DeepSeek full flow as part of this R4 documentation PR.

## Recommended next PR

Add lightweight runtime identity reporting without changing parser behavior or shell layout:

- Detect runtime source when `runtimePath` or vault-local `.open-llm-wiki` is a Git checkout.
- Report remote URL, branch, commit, dirty state, version, and scripts path in the existing status model.
- Make external `runtimePath` readiness visible separately from vault-local runtime installation.
- Display runtime source/commit/version in Settings or Dashboard.
- Add tests for fork checkout, upstream checkout, missing scripts, and non-Git runtime directories.
