# PaddleOCR-VL Live Parse Run Report

## Purpose

Record a real PaddleOCR hosted OCR run against a DeepSeek PDF sample and prove that the desktop live smoke adapter produces the required artifact contract:

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

## Input Sample

The local DeepSeek corpus contained 22 PDFs. This live smoke used one representative PDF from that corpus:

```text
deepseek_paper/DeepSeek-OCR_2510.18234.pdf
```

The raw PDF was not modified, moved, renamed, or committed.

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

## Artifact Output

Local-only artifact directory:

```text
<LLM_WIKI_WORKSPACE>/runs/20260530-150403-paddleocr-vl-artifacts/paddleocr-vl16/DeepSeek-OCR_2510.18234/
```

Generated files:

```text
combined.md
ocr-output.json
chunks.jsonl
manifest.json
```

Artifact sizes from the final run:

| File | Lines | Bytes |
| --- | ---: | ---: |
| `combined.md` | 581 | 83068 |
| `ocr-output.json` | 16030 | 603433 |
| `chunks.jsonl` | 22 | 86236 |
| `manifest.json` | 25 | 847 |

## Manifest Summary

| Field | Value |
| --- | --- |
| `parser` | `paddleocr-vl15-live-smoke` |
| `parser_model` | `PaddleOCR-VL-1.6` |
| `parser_version` | `unreported` |
| `api_key_env_var` | `PADDLEOCR_API_KEY` |
| `source_path` | `../../deepseek_paper/DeepSeek-OCR_2510.18234.pdf` |
| `source_sha256` | `a7297788968f8ad9ed21bcd273110814e4889efbbc99bfea86dca12205797a90` |
| `artifact_sha256` | `c8fe949b9551d0010a703532373342fcf6aa75cd37dd85f0b17774af10405917` |
| `page_count` | `22` |
| `chunk_count` | `22` |
| `latency_ms` | `13706` |
| `external_upload` | `true` |
| `endpoint_host` | `paddleocr.aistudio-app.com` |
| `limitations` | `parser_version_unreported_by_service`, `markdown_url_unreported_by_service` |

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
manifest_valid
```

Secret scan for the final artifact directory found no raw API key, bearer token, unredacted signature query, `access_token=`, or `api_key=` strings.

## Raw Document Upload

- Live run in this PR: `yes`
- Raw document uploaded in this PR: `yes`
- Upload target: `paddleocr.aistudio-app.com`
- Approval basis: maintainer supplied the PaddleOCR endpoint, token, and model for this run.
- Committed artifacts: `no`; generated OCR artifacts remain local-only under `runs/`.

## Known Limits

- This live smoke validates one DeepSeek PDF sample, not the full 22-PDF corpus.
- The provider did not report `parser_version`.
- The provider returned `jsonUrl` but not `markdownUrl`; `combined.md` was assembled from Markdown text inside the downloaded JSONL result.
