# PaddleOCR-VL Live Parse Run Report

## Purpose

Record a real PaddleOCR hosted OCR run against the local DeepSeek PDF corpus and prove that the desktop live smoke adapter produces the required artifact contract:

```text
combined.md
ocr-output.json
chunks.jsonl
manifest.json
```

This is a live run, not a fixture or dry run. It uses the maintainer-provided endpoint and API key through environment variables only; the key value is not written to this report or the generated artifacts.

Related issue: https://github.com/Aidenwu0209/llm-wiki-desktop/issues/210

## Repository State

- Commit before this change: `7b7986b875be91f439b7b27a32ca22ce2574ec05`
- Branch during implementation: `wu/paddleocr-vl16-live-run-20260530`
- Report status: `live_executed`

## Run Environment

| Field | Value |
| --- | --- |
| OS | macOS 26.4, build 25E246 |
| Node.js | `v22.22.2` |
| npm | `10.9.7` |
| Network | online |
| PaddleOCR endpoint host | `paddleocr.aistudio-app.com` |
| Model | `PaddleOCR-VL-1.6` |
| API key env var | `PADDLEOCR_API_KEY` |

## Input Corpus

The local DeepSeek corpus contained 22 PDFs. The final run processed all 22 PDFs from:

```text
deepseek_paper/
```

The first bug-reproducing smoke used `deepseek_paper/DeepSeek-OCR_2510.18234.pdf`; after the async polling fix, the full corpus was processed into a corpus-level aggregate artifact.

The raw PDFs were not modified, moved, renamed, or committed.

## Live Run Command

```bash
export OPEN_LLM_WIKI_LAYOUT_ENDPOINT="https://paddleocr.aistudio-app.com/api/v2/ocr/jobs"
export OPEN_LLM_WIKI_LAYOUT_MODEL="PaddleOCR-VL-1.6"
read -rs PADDLEOCR_API_KEY
npm run ocr:live-smoke -- \
  --input "<LLM_WIKI_WORKSPACE>/deepseek_paper/DeepSeek-OCR_2510.18234.pdf" \
  --out "<LLM_WIKI_WORKSPACE>/runs/20260530-150403-paddleocr-vl-artifacts/paddleocr-vl16/DeepSeek-OCR_2510.18234" \
  --timeout-ms 600000 \
  --poll-interval-ms 5000
```

Full corpus command shape:

```bash
export OPEN_LLM_WIKI_LAYOUT_ENDPOINT="https://paddleocr.aistudio-app.com/api/v2/ocr/jobs"
export OPEN_LLM_WIKI_LAYOUT_MODEL="PaddleOCR-VL-1.6"
read -rs PADDLEOCR_API_KEY
for pdf in "<LLM_WIKI_WORKSPACE>/deepseek_paper"/*.pdf; do
  npm run ocr:live-smoke -- \
    --input "$pdf" \
    --out "<RUN_DIR>/paddleocr-vl16/deepseek_paper_corpus/per-pdf/<slug>" \
    --timeout-ms 600000 \
    --poll-interval-ms 5000
done
```

## Artifact Output

Local-only artifact directory:

```text
<LLM_WIKI_WORKSPACE>/runs/20260530-150403-paddleocr-vl-artifacts/paddleocr-vl16/deepseek_paper_corpus/
```

Generated files:

```text
combined.md
ocr-output.json
chunks.jsonl
manifest.json
```

Corpus artifact sizes from the final run:

| File | Lines | Bytes |
| --- | ---: | ---: |
| `combined.md` | 20319 | 2942414 |
| `ocr-output.json` | 539930 | 23820043 |
| `chunks.jsonl` | 719 | 3129305 |
| `manifest.json` | 359 | 14683 |

## Manifest Summary

| Field | Value |
| --- | --- |
| `parser` | `paddleocr-vl15-live-smoke` |
| `parser_model` | `PaddleOCR-VL-1.6` |
| `parser_version` | `unreported` |
| `api_key_env_var` | `PADDLEOCR_API_KEY` |
| `source_path` | `../../deepseek_paper` |
| `source_count` | `22` |
| `source_sha256` | `cf2504b5d125fe87b45e7e591ade40336f84ae0033dbd2fe683be0f67007ece9` |
| `artifact_sha256` | `af4e49efe73c87ee02dd22291c3ea6c7fe8128670b58ecdb6543f7cf8d5b4911` |
| `page_count` | `720` |
| `chunk_count` | `719` |
| `latency_ms` | `1031660` |
| `external_upload` | `true` |
| `endpoint_host` | `paddleocr.aistudio-app.com` |
| `limitations` | `corpus_aggregate_from_per_pdf_artifacts`, `parser_version_unreported_by_service`, `markdown_url_unreported_by_service` |

The artifact hash was recomputed from `combined.md`, `ocr-output.json`, and `chunks.jsonl` and matched `manifest.json`.

## Adapter Fix Found During The Run

The first live attempt exposed a contract bug in the smoke adapter: the initial PaddleOCR API response returned only `data.jobId`. The adapter treated that as a completed response instead of polling `/jobs/{jobId}`, which produced placeholder Markdown and a false-looking success manifest.

The fix makes a job-id-only response pending, polls until the async job returns result URLs, downloads the JSON result, and then generates `combined.md`, `ocr-output.json`, `chunks.jsonl`, and `manifest.json` from the actual OCR output.

## Validation

```bash
npm run test:ocr-live-contract
npm run typecheck
npm run ocr:live-smoke -- --validate-manifest "<artifact-dir>/manifest.json"
```

Results:

```text
test:ocr-live-contract passed: 10 tests
typecheck passed after npm ci refreshed this worktree's dependencies
manifest_valid for the representative PDF artifact
manifest_valid for the full corpus aggregate artifact
```

Secret scan for the representative and corpus artifact directories found no raw API key, bearer token, unredacted signature query, `access_token=`, or `api_key=` strings.

## Raw Document Upload

- Live run in this PR: `yes`
- Raw document uploaded in this PR: `yes`, all 22 PDFs in the local corpus
- Upload target: `paddleocr.aistudio-app.com`
- Approval basis: maintainer supplied the PaddleOCR endpoint, token, and model for this run.
- Committed artifacts: `no`; generated OCR artifacts remain local-only under `runs/`.

## Known Limits

- The corpus-level artifact is aggregated from 22 per-PDF PaddleOCR artifacts.
- The provider did not report `parser_version`.
- The provider returned `jsonUrl` but not `markdownUrl`; `combined.md` was assembled from Markdown text inside the downloaded JSONL result.
