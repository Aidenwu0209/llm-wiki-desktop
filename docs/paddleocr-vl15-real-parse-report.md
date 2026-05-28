# PaddleOCR-VL-1.5 Real Parse Run Report

## Purpose

Add a reproducible, optional live OCR smoke path for PaddleOCR-VL-1.5 so maintainers can prove that a public PDF or image sample produces real parser artifacts that satisfy the desktop artifact contract.

This report is intentionally not a dry-run success record. Live run not executed in this PR; script and report template added. Maintainer must run with the configured PaddleOCR API key environment variable, defaulting to `PADDLEOCR_API_KEY`.

## Repository State

- Commit before this change: `968315acee7ac5b6a649a33480d1e2d4c20c75b5`
- Branch during implementation: `benchmark/artifact-manifest-contract-summary`
- Report status: `template_added_not_live_executed`

## Run Environment

Fill after the live smoke:

| Field | Value |
| --- | --- |
| OS | `<macOS / Windows / Linux version>` |
| Node.js | `<node --version>` |
| npm | `<npm --version>` |
| Network | `<online / restricted>` |
| PaddleOCR endpoint host | `<host only, no path query or token>` |
| Model | `<OPEN_LLM_WIKI_LAYOUT_MODEL or paddleocr-vl-1.5>` |

## Input Sample

Use a public sample only. For the local DeepSeek validation workspace, one acceptable input is a PDF from:

```text
../deepseek_paper/
```

Example command path:

```bash
../deepseek_paper/DeepSeek-OCR_2510.18234.pdf
```

Do not move, rename, overwrite, or commit files from `deepseek_paper/`.

## Environment Variables

The live smoke script reads these names only:

```bash
PADDLEOCR_API_KEY
PADDLEOCR_API_KEY_ENV
OPEN_LLM_WIKI_LAYOUT_ENDPOINT
OPEN_LLM_WIKI_LAYOUT_MODEL
```

`PADDLEOCR_API_KEY_ENV` is optional. When unset, the script reads the key from `PADDLEOCR_API_KEY`. When set, it must contain an environment variable name such as `MY_PADDLEOCR_KEY`; the key value is then read from that variable. The same override can be passed with `--api-key-env-var`.

Do not paste values into this report, README files, issue comments, screenshots, logs, or PR descriptions.

## Live Run Command

```bash
export OPEN_LLM_WIKI_LAYOUT_ENDPOINT="<paddleocr job endpoint>"
export OPEN_LLM_WIKI_LAYOUT_MODEL="paddleocr-vl-1.5"
read -rsp "PADDLEOCR_API_KEY: " PADDLEOCR_API_KEY
export PADDLEOCR_API_KEY
npm run ocr:live-smoke -- \
  --input ../deepseek_paper/DeepSeek-OCR_2510.18234.pdf \
  --out artifacts/smoke/paddleocr-vl15/
```

Custom key env example:

```bash
export PADDLEOCR_API_KEY_ENV="MY_PADDLEOCR_KEY"
read -rsp "MY_PADDLEOCR_KEY: " MY_PADDLEOCR_KEY
export MY_PADDLEOCR_KEY
npm run ocr:live-smoke -- \
  --api-key-env-var MY_PADDLEOCR_KEY \
  --input ../deepseek_paper/DeepSeek-OCR_2510.18234.pdf \
  --out artifacts/smoke/paddleocr-vl15/
```

If the service requires a newer model label, set `OPEN_LLM_WIKI_LAYOUT_MODEL` to that value before running. The script records the selected model in `manifest.json`.

## Expected Output Files

The live smoke must produce all of these files only after a real service response:

```text
artifacts/smoke/paddleocr-vl15/combined.md
artifacts/smoke/paddleocr-vl15/ocr-output.json
artifacts/smoke/paddleocr-vl15/chunks.jsonl
artifacts/smoke/paddleocr-vl15/manifest.json
```

If the configured key environment variable or `OPEN_LLM_WIKI_LAYOUT_ENDPOINT` is missing, the script exits with `missing_key` or `missing_endpoint` and must not generate a fake success manifest.

## Manifest Summary

Fill after the live smoke:

| Field | Value |
| --- | --- |
| `source_id` | `<from manifest>` |
| `source_path` | `<redacted if needed>` |
| `source_sha256` | `<sha256>` |
| `artifact_sha256` | `<sha256>` |
| `parser` | `<parser>` |
| `parser_model` | `<model>` |
| `parser_version` | `<version or unreported>` |
| `api_key_env_var` | `<configured key env var name, not the key value>` |
| `page_count` | `<number>` |
| `chunk_count` | `<number>` |
| `latency_ms` | `<number>` |
| `limitations` | `<array>` |
| `external_upload` | `<true for hosted endpoint, false for localhost>` |
| `endpoint_host` | `<host only>` |

## Raw Document Upload

- Live run in this PR: `no`
- Raw document uploaded in this PR: `no`
- Expected behavior when running against hosted PaddleOCR: `external_upload: true`
- Expected behavior when running against localhost: `external_upload: false`

The script does not upload anything until the configured key environment variable, `OPEN_LLM_WIKI_LAYOUT_ENDPOINT`, `--input`, and `--out` are all present.

## Key Handling

- The API key is read from `PADDLEOCR_API_KEY` by default, or from the variable named by `PADDLEOCR_API_KEY_ENV` / `--api-key-env-var`.
- The key is passed only in request headers for the live smoke process.
- The script redacts bearer tokens, known secret values, and token-like URL query parameters from diagnostics and `ocr-output.json`.
- The manifest records only `endpoint_host`, not the full endpoint URL.

## Failure Items And Known Limits

- Live OCR was not executed by this PR because the key was not available as a process environment variable during implementation.
- The script supports a common multipart job API and polling contract; maintainers should update only this smoke adapter if the deployed PaddleOCR endpoint uses a different wire format.
- `parser_version` is recorded as `unreported` when the service response does not expose a version.
- Generated `artifacts/smoke/**` evidence is local smoke output and should not be committed unless reviewed for sensitive content.
