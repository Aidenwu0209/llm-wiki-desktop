# Provider Adapter Contract

LLM Wiki Desktop keeps provider setup as a desktop orchestration concern. Core knowledge generation, QA, review queues, and writeback approval remain owned by the open-llm-wiki runtime or an explicit adapter contract.

## Adapter Shape

Provider adapters expose these fields:

- `id`: one of `ernie-ai-studio`, `openai-compatible`, `deepseek`, `local-codex`, `local-claude`, `custom`.
- `displayName`: user-facing label.
- `providerType`: `hosted`, `local`, or `custom`.
- `baseUrl`: endpoint base URL when applicable.
- `apiKeyEnv`: environment variable name, never the secret value.
- `defaultModel`: suggested first model.
- `fallbackModels`: ordered fallback list.
- `supportsStructuredOutput`: true only when the selected model supports it.
- `supportsStreaming`: optional capability flag.
- `status`: `configured`, `missing_key`, `connection_failed`, or `ready`.

## ERNIE / AI Studio

ERNIE is the first provider card in Settings / LLM Models:

- `id`: `ernie-ai-studio`
- `displayName`: `文心一言 / ERNIE`
- `providerType`: `hosted`
- `baseUrl`: `https://aistudio.baidu.com/llm/lmapi/v3`
- `apiKeyEnv`: `AI_STUDIO_API_KEY`
- `defaultModel`: `ernie-5.1`
- `fallbackModels`: `ernie-4.0-turbo-128k`, `ernie-3.5-8k`

The desktop test connection sends only a minimal provider health probe: model list plus a tiny chat completion asking for `ok`. It must not include vault raw documents, source text, concepts, or writeback proposal content.

## Safety Rules

- API keys are read from environment variables or secure storage, never saved in desktop settings.
- Logs, screenshots, docs, and UI errors must not reveal key values or authorization headers.
- Hosted providers remain `Not configured` when the key is unavailable and must not block local app usage.
- Provider-backed answers do not write into `concepts/` or `sources/`.
- Writeback remains proposal-first and requires human approval before apply.
