# ERNIE Live Evidence Answer Smoke

## Purpose

This smoke verifies that ERNIE / 文心一言 can do more than Test Connection: it must answer from a generated LLM Wiki vault evidence map, return citations, surface unsupported claims and warnings, and refuse questions that lack vault evidence.

The smoke keeps the desktop runtime-first boundary:

- It sends evidence snippets and evidence ids only.
- It does not upload raw documents.
- It does not create or apply `concepts/` or `sources/`.
- It does not approve human review.
- It does not apply query writeback. If a future smoke creates a proposal, it must remain under `reviews/query-writeback/`.

## Environment

- Required for live run: configured ERNIE API key environment variable, defaulting to `AI_STUDIO_API_KEY`.
- Optional: `ERNIE_API_KEY_ENV`; names the key environment variable when it is not `AI_STUDIO_API_KEY`.
- Optional: `ERNIE_BASE_URL`; defaults to the provider catalog base URL, `https://aistudio.baidu.com/llm/lmapi/v3`.
- Optional: `ERNIE_MODEL`; defaults to `ernie-5.1`.
- Public CI must not require a real key; it should run only the no-key and mock-provider contract test through `npm test`.

Do not paste the key into docs, logs, screenshots, command history, or PR descriptions. Prefer an interactive shell assignment:

```bash
read -rsp "AI_STUDIO_API_KEY: " AI_STUDIO_API_KEY
export AI_STUDIO_API_KEY
```

Custom key env example:

```bash
export ERNIE_API_KEY_ENV="CUSTOM_AI_STUDIO_API_KEY"
read -rsp "CUSTOM_AI_STUDIO_API_KEY: " CUSTOM_AI_STUDIO_API_KEY
export CUSTOM_AI_STUDIO_API_KEY
npm run ernie:live-smoke -- \
  --api-key-env-var CUSTOM_AI_STUDIO_API_KEY \
  --vault examples/demo-vault \
  --out artifacts/smoke/ernie/
```

## Command

From the repository root:

```bash
npm run ernie:live-smoke -- --vault examples/demo-vault --out artifacts/smoke/ernie/
```

Generated local evidence:

```text
artifacts/smoke/ernie/ernie-live-answer-result.json
artifacts/smoke/ernie/ernie-live-answer-report.md
```

These files are local smoke artifacts. Do not commit them if they contain private paths or provider output that has not been reviewed.

## Key Handling

The script reads the key from `AI_STUDIO_API_KEY` by default, or from the variable named by `ERNIE_API_KEY_ENV` / `--api-key-env-var`. It writes only the environment variable name into reports. It redacts bearer tokens and key-like markers from provider errors.

If the configured key environment variable is missing, the script prints `missing_key`, exits non-zero, does not call ERNIE, and does not generate a success report.

## Questions

The smoke asks exactly three demo-vault questions:

| ID | Goal | Expected behavior |
| --- | --- | --- |
| `q1-sufficient-evidence` | Vault contains enough evidence. | Answer cites `demo:p2:evidence-map`. |
| `q2-incomplete-evidence` | Vault supports OCR artifact facts but not a production latency SLA. | Answer cites supported evidence and reports unsupported claims or warnings. |
| `q3-no-evidence` | Vault has no evidence for the topic. | Answer refuses or states `当前 vault 证据不足`. |

Each question result includes:

- `question`
- `answer`
- `model`
- `latency_ms`
- `selected_evidence_ids`
- `citations`
- `unsupported_claims`
- `warnings`
- `raw_document_sent: false`

## Result Summary Template

Fill this section from `artifacts/smoke/ernie/ernie-live-answer-report.md` after a local live run:

| Field | Value |
| --- | --- |
| Commit hash | `<captured by script>` |
| Vault | `examples/demo-vault` or `<vault path>` |
| Command | `npm run ernie:live-smoke -- --vault <vault> --out artifacts/smoke/ernie/` |
| Citation coverage | `<percent>` |
| Unsupported claim count | `<count>` |
| No-evidence refusal behavior | `<passed/failed>` |
| Provider error count | `<count>` |

Per-question live summary:

| Question | Status | Citations | Unsupported claims | Warnings |
| --- | --- | --- | ---: | --- |
| `q1-sufficient-evidence` | `<answered/refused/provider_error>` | `<ids>` | `<count>` | `<warnings>` |
| `q2-incomplete-evidence` | `<answered/refused/provider_error>` | `<ids>` | `<count>` | `<warnings>` |
| `q3-no-evidence` | `<answered/refused/provider_error>` | `<ids>` | `<count>` | `<warnings>` |

## No-Key And Mock Validation

`npm test` runs:

```bash
tsx scripts/smoke/ernie-live-answer.ts --self-test
```

The self-test covers:

- Missing configured key environment variable fails safely and does not call the provider.
- Custom key environment variable names are honored and reported by name only.
- Mock provider output surfaces citations and unsupported claims.
- The prompt sent to the provider does not contain raw document body text.
- API key values are redacted from error/log text.
- The no-evidence question is refused.

## Known Limitations

- This smoke does not measure final answer quality on private or large corpus vaults.
- This smoke does not validate query writeback apply behavior.
- This smoke does not run in CI with a real provider key.
- Citation extraction accepts bracketed evidence ids and structured `citations`; malformed model output may need manual review.
