# PaddleOCR-VL-1.5 Provider Setup

LLM Wiki Desktop can store PaddleOCR-VL-1.5 parser configuration and run connection checks when you explicitly provide a service URL. The app reads the credential from `PADDLEOCR_API_KEY`; it does not save or display the key.

This is configuration scaffolding only. It does not implement real OCR parsing yet.

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

Test parser is a dry run. It validates the config and key visibility only; it does not upload raw documents, does not run OCR, and does not write to the vault.
