# ERNIE / 文心一言 Provider Setup

LLM Wiki Desktop can test Baidu AI Studio ERNIE connectivity when the provider is available in your local environment. The app reads the credential from the API key environment variable configured in Settings -> LLM Models; the default is `AI_STUDIO_API_KEY`. It does not save or display the key value.

## Get An Access Token

1. Open Baidu AI Studio and create or select a model API credential for ERNIE.
2. Copy the issued access token or API key value.
3. Do not paste the token into README files, screenshots, issue comments, logs, or desktop settings.

## Set The Environment Variable

macOS or Linux:

```bash
read -rsp "AI_STUDIO_API_KEY: " AI_STUDIO_API_KEY
export AI_STUDIO_API_KEY
npm run desktop:dev
```

Windows PowerShell:

```powershell
$secureKey = Read-Host "AI_STUDIO_API_KEY" -AsSecureString
$env:AI_STUDIO_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
)
npm run desktop:dev
```

For packaged app testing, launch the app from a shell or OS-level secure environment where the configured API key environment variable is visible to the desktop process.

If you use a custom key environment variable, configure the variable name in Settings -> LLM Models and export that variable in the same shell before launching the app:

```bash
export ERNIE_API_KEY_ENV="CUSTOM_AI_STUDIO_API_KEY"
read -rsp "CUSTOM_AI_STUDIO_API_KEY: " CUSTOM_AI_STUDIO_API_KEY
export CUSTOM_AI_STUDIO_API_KEY
npm run desktop:dev
```

## Defaults

- Base URL: `https://aistudio.baidu.com/llm/lmapi/v3`
- API key environment variable: `AI_STUDIO_API_KEY`
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

## FAQ

### Where should I put the key?

Put the key value only in a local shell, OS-level secure environment, or another local secret manager that can expose the configured environment variable to the desktop process. The desktop settings should store only the environment variable name, such as `AI_STUDIO_API_KEY` or a custom uppercase variable name.

### What should never be committed or pasted?

Do not paste an API key value into README files, issues, PR descriptions, screenshots, logs, shell history, smoke reports, benchmark outputs, or demo vault fixtures. Public documentation should mention only the environment variable name.

### Can I use a custom key variable?

Yes. Set the custom variable locally, then configure that variable name in Settings -> LLM Models. The live answer smoke also supports a custom variable through `ERNIE_API_KEY_ENV` or `--api-key-env-var`; see [`docs/ernie-live-answer-smoke.md`](ernie-live-answer-smoke.md).

### Does Test Connection prove evidence-first answers work?

No. Test Connection only checks local key visibility, model discovery, and a minimal provider response. Evidence-first behavior, citation coverage, unsupported claims, and no-evidence refusal belong to the live answer smoke in [`docs/ernie-live-answer-smoke.md`](ernie-live-answer-smoke.md).

### Can a PR claim the live ERNIE check passed?

Only if the contributor actually ran the live smoke with a configured key and attached a reviewed, redacted report. If no key is configured, keep the result as missing-key or skipped; do not turn a no-key, fixture, or mock run into a live success claim.
