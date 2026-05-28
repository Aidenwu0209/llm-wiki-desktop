# PaddleOCR-VL-1.5 Provider Setup

LLM Wiki Desktop uses PaddleOCR-VL-1.5 as the default PDF / image parser plan. The app reads the credential from `PADDLEOCR_API_KEY`; it does not save or display the key.

When OCR Parser is enabled, the service URL is configured, and `PADDLEOCR_API_KEY` is visible to the desktop process, the desktop parse command routes PDF / image inputs through the runtime `pdf_to_markdown.py --parser layout-api --api-url <PaddleOCR endpoint>` wire format. If any of those requirements are missing, ingest planning blocks with `paddleocr_config_required` and does not upload raw documents.

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

For packaged app testing, launch the app from a shell or OS-level secure environment where `PADDLEOCR_API_KEY` is visible to the desktop process.

## Configure The Service URL

Open Settings -> OCR Parser and set:

- Endpoint / Service URL: your PaddleOCR-VL-1.5 service endpoint
- API key source: `PADDLEOCR_API_KEY`
- Model: `PaddleOCR-VL-1.5`

The service URL must use HTTPS unless it is a localhost HTTP URL for a local test service.

## Status Values

- `missing_key`: `PADDLEOCR_API_KEY` is not visible to the desktop process.
- `configured`: the environment variable is visible and the local config is valid.
- `ready`: Test connection reached the configured service URL successfully.
- `connection_failed`: the endpoint is invalid or did not respond successfully.

## Test Connection And Parser

Test connection checks key visibility and, when a service URL is configured, sends a small authenticated connectivity request to that URL.

Test parser is still a dry run. It validates the config and key visibility only; it does not upload raw documents, does not run OCR, and does not write to the vault. Real OCR runs only from an explicit parse / ingest action after OCR Parser is enabled and the endpoint/key checks are satisfied.

## Ingest Plan Behavior

- `paddleocr_config_required`: PaddleOCR-VL-1.5 is selected but OCR Parser is disabled, endpoint is empty, or `PADDLEOCR_API_KEY` is not visible.
- `parse_required`: PaddleOCR-VL-1.5 config is ready and the next parse action will run the runtime parser against the configured endpoint.
- `cloud_parser_approval_required`: `layout-api` was selected directly, but cloud parsing approval is off.

The runtime task log records command arguments but never writes the API key value. The key is passed only as a child-process environment override for the parser process.
