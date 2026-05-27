# ERNIE / 文心一言 Provider Setup

LLM Wiki Desktop supports ERNIE through Baidu AI Studio when local setup provides an API key. Without a key, the provider shows `Not configured` and the app continues to work locally.

## Get An API Key

1. Open Baidu AI Studio and create or select an application/API key for the LLM API.
2. Copy the generated token once and store it in your shell, launch agent, password manager, or OS secure storage.
3. Do not paste the key into LLM Wiki Desktop settings, docs, screenshots, issue reports, or logs.

## Set The Environment Variable

Set the key before launching the desktop app:

```bash
read -rsp "AI Studio API key: " AI_STUDIO_API_KEY
export AI_STUDIO_API_KEY
npm run desktop:dev
```

For packaged app usage, set `AI_STUDIO_API_KEY` in the launch environment or a local secure startup wrapper. The app reads only the environment variable value at runtime.

## Defaults

- Base URL: `https://aistudio.baidu.com/llm/lmapi/v3`
- Recommended model: `ernie-5.1`
- Fallback models: `ernie-4.0-turbo-128k`, `ernie-3.5-8k`

## Test Connection

Open Settings -> LLM Models. The first provider card is `文心一言 / ERNIE`.

The Test connection button performs a real provider check:

- Reads `AI_STUDIO_API_KEY` from the environment.
- Calls the model list endpoint when available.
- Verifies the selected model or tries the fallback models.
- Sends a minimal chat completion with only `You are a concise assistant.` and `Reply with "ok".`

No raw documents, source pages, concepts, claims, or writeback proposal content are sent during this test.

## Common Errors

- `missing_key`: `AI_STUDIO_API_KEY` is not visible to the desktop process.
- `auth_error`: the token is missing permissions, expired, malformed, or not accepted by AI Studio.
- `model_not_found`: the selected model is not in the model list and fallback models were unavailable.
- `rate_limited`: the service rejected the request due to quota or rate limits.
- `network_error`: DNS, TLS, proxy, or connectivity failed.
- `unknown`: the provider returned an unexpected response.

Error details are redacted before display. Authorization headers and API key values must not appear in UI or logs.

## Why Keys Are Not Stored In Config

Desktop settings are project files and may be synced, zipped, copied into diagnostics, or reviewed in Git. API keys are secrets, so the app stores only the environment variable name and reads the key from the process environment or secure local setup.

## Why Raw Documents Are Not Uploaded By Default

LLM Wiki Desktop is local-first. Raw evidence can include private PDFs, notes, and unpublished research. Provider checks use synthetic text only. Any future hosted model flow must be explicit, evidence-scoped, and must preserve proposal-first writeback approval.
