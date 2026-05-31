# PaddleOCR-VL Document Parsing Skill Setup

LLM Wiki Desktop uses PaddleOCR-VL Document Parsing Skill as the default PDF / image parser plan. The default model is `PaddleOCR-VL-1.6`. The app reads the credential from the API key environment variable configured in Settings -> PaddleOCR-VL Document Parsing Skill; the default is `PADDLEOCR_API_KEY`. It does not save or display the key value.

When PaddleOCR-VL Document Parsing Skill is enabled, the service URL is configured, and the selected API key environment variable is visible to the desktop process, the desktop parse action routes PDF / image inputs through the runtime `pdf_to_markdown.py --parser layout-api --api-url <PaddleOCR endpoint>` wire format. The desktop process passes the secret only as a child-process environment override and never writes the key value into logs, settings, or vault state.

If any of those requirements are missing, ingest planning blocks with `paddleocr_config_required` and does not upload raw documents.

## Set The Environment Variable

macOS or Linux:

```bash
read -rsp "PADDLEOCR_API_KEY: " PADDLEOCR_API_KEY
export PADDLEOCR_API_KEY
npm run desktop:dev
```

Windows PowerShell:

```powershell
$env:PADDLEOCR_API_KEY = Read-Host "PADDLEOCR_API_KEY"
npm run desktop:dev
```

For packaged app testing, launch the app from a shell or OS-level secure environment where the configured API key environment variable is visible to the desktop process.

## Configure The Service URL

Open Settings -> PaddleOCR-VL Document Parsing Skill and set:

- Endpoint / Service URL: your PaddleOCR-VL service endpoint
- API key environment variable: `PADDLEOCR_API_KEY` by default, or a custom uppercase env var name
- Model: `PaddleOCR-VL-1.6`

The service URL must use HTTPS unless it is a localhost HTTP URL for a local test service.

## Real Parse Runtime Handoff

For a real parse action, the desktop process sends configuration to the runtime in two ways:

- command argument: `--api-url <PaddleOCR endpoint>`
- child-process environment overrides:
  - `OPEN_LLM_WIKI_LAYOUT_TOKEN=<value from the configured API key env var>`
  - `OPEN_LLM_WIKI_LAYOUT_MODEL=<configured OCR model>`
  - `OPEN_LLM_WIKI_LAYOUT_ENDPOINT=<configured OCR endpoint>`

The desktop settings file stores the endpoint, model, and API-key environment-variable name only. It never stores the key value itself.

## Status Values

- `missing_key`: the configured API key environment variable is not visible to the desktop process.
- `missing_endpoint`: endpoint / service URL is empty or invalid.
- `ready`: Test connection reached the configured service URL successfully.
- `connection_failed`: the endpoint is invalid or did not respond successfully.
- `parser_failed`: parser dry-run/config validation failed before any real OCR call could start.
- `artifact_valid`: parser dry-run/config validation passed. No raw document was uploaded yet, but the parser path is configured well enough for a real run.
- `artifact_invalid`: a produced parser artifact contract is missing required metadata or fails validation.

## Test Connection And Parser

Test connection checks key visibility and, when a service URL is configured, sends a small authenticated connectivity request to that URL.

Test parser is still a dry run. It validates the config and key visibility only; it does not upload raw documents, does not run OCR, and does not write to the vault. Real OCR runs only from an explicit parse / ingest action after PaddleOCR-VL Document Parsing Skill is enabled and the endpoint/key checks are satisfied.

## Artifact Contract Fields

Real parser artifacts are expected to expose at least:

- `source_id`
- `source_path`
- `parser`
- `parser_model` or `model`
- `parser_version`
- `page_count`
- `chunk_count`
- `source_sha256`
- `artifact_sha256`
- `latency_ms`
- `limitations`

The desktop shell treats missing or mismatched contract metadata as `artifact_invalid`.

## Ingest Plan Behavior

- `paddleocr_config_required`: PaddleOCR-VL Document Parsing Skill is selected but disabled, endpoint is empty, or the configured API key environment variable is not visible.
- `parse_required`: PaddleOCR-VL Document Parsing Skill config is ready and the next parse action will run the runtime parser against the configured endpoint.
- `cloud_parser_approval_required`: `layout-api` was selected directly, but cloud parsing approval is off.

The runtime task log records command arguments but never writes the API key value. The key is passed only as a child-process environment override for the parser process.
