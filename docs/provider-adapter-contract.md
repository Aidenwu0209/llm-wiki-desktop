# Provider Adapter Contract

LLM Wiki Desktop keeps provider configuration as a desktop orchestration concern. The desktop app may store provider id, base URL, model choice, protocol, and the name of the environment variable that contains a credential. It must not store or print raw API keys.

Core knowledge generation, QA, review queue handling, and writeback approval remain owned by the `open-llm-wiki` runtime or an explicit adapter contract. Provider calls from the desktop UI are limited to user-approved answer generation or connection tests and must not silently upload raw documents.

## Adapter Fields

Each provider adapter uses these fields:

- `id`: one of `ernie-ai-studio`, `openai-compatible`, `deepseek`, `local-codex`, `local-claude`, or `custom`.
- `displayName`: user-facing provider label.
- `providerType`: `hosted`, `local`, or `custom`.
- `baseUrl`: HTTPS endpoint for hosted providers, or localhost HTTP only for local endpoints.
- `apiKeyEnv`: environment variable name for the credential.
- `defaultModel`: preferred model for first use.
- `fallbackModels`: ordered fallback model ids for connection tests.
- `supportsStructuredOutput`: `true` only when the selected model supports it, otherwise `model-dependent`.
- `supportsStreaming`: optional provider capability.
- `status`: `configured`, `missing_key`, `connection_failed`, or `ready`.

## ERNIE / AI Studio Defaults

- `id`: `ernie-ai-studio`
- `displayName`: `文心一言 / ERNIE`
- `providerType`: `hosted`
- `baseUrl`: `https://aistudio.baidu.com/llm/lmapi/v3`
- `apiKeyEnv`: `AI_STUDIO_API_KEY`
- `defaultModel`: `ernie-5.1`
- `fallbackModels`: `ernie-4.0-turbo-128k`, `ernie-3.5-8k`
- `supportsStructuredOutput`: model-dependent
- `supportsStreaming`: optional

## Safety Rules

- API keys are read from environment variables or secure local process setup only.
- Logs, screenshots, README examples, and error messages must not include API key values or Authorization headers.
- Provider connection tests send only minimal health-check text.
- Raw documents are never silently uploaded by provider tests.
- Writeback remains proposal-first; desktop provider configuration must not bypass approval or write directly into `concepts/` or `sources/`.
