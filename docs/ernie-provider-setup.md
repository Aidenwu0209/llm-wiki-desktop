# ERNIE / 文心一言 Provider Setup

LLM Wiki Desktop can test Baidu AI Studio ERNIE connectivity when the provider is available in your local environment. The app reads the credential from the API key environment variable configured in Settings, defaulting to `AI_STUDIO_API_KEY`; it does not save or display the key.

## Get An Access Token

1. Open Baidu AI Studio and create or select a model API credential for ERNIE.
2. Copy the issued access token or API key value.
3. Do not paste the token into README files, screenshots, issue comments, logs, or desktop settings.

## Set The Environment Variable

macOS or Linux:

```bash
export AI_STUDIO_API_KEY="your-token-from-ai-studio"
npm run desktop:dev
```

Windows PowerShell:

```powershell
$env:AI_STUDIO_API_KEY="your-token-from-ai-studio"
npm run desktop:dev
```

For packaged app testing, launch the app from a shell or OS-level secure environment where the configured API key environment variable is visible to the desktop process.

## Defaults

- Base URL: `https://aistudio.baidu.com/llm/lmapi/v3`
- Recommended model: `ernie-5.1`
- Fallback models: `ernie-4.0-turbo-128k`, `ernie-3.5-8k`

## Test Connection

In Settings -> LLM Models, the first provider card is `文心一言 / ERNIE`.

The test performs:

1. Check that the configured API key environment variable is visible to the desktop process.
2. Call the provider model list endpoint.
3. Confirm the selected model exists, or choose a fallback model from the configured fallback list.
4. Send a minimal chat completion with only:
   - system: `You are a concise assistant.`
   - user: `Reply with "ok".`

If the configured API key environment variable is missing, the card shows `Not configured` and the app remains usable. This check does not upload raw documents and does not write to `concepts/` or `sources/`.
