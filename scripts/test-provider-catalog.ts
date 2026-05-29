import assert from "node:assert/strict";
import {
  ERNIE_AI_STUDIO_API_KEY_ENV,
  ERNIE_AI_STUDIO_BASE_URL,
  ERNIE_AI_STUDIO_DEFAULT_MODEL,
  providerAdapters,
  providerIdAliases,
} from "../src/lib/providers/catalog";

const firstProvider = providerAdapters[0];

assert.equal(firstProvider.id, "ernie-ai-studio");
assert.equal(firstProvider.displayName, "文心一言 / ERNIE");
assert.equal(firstProvider.defaultModel, ERNIE_AI_STUDIO_DEFAULT_MODEL);
assert.equal(firstProvider.defaultApiBaseUrl, ERNIE_AI_STUDIO_BASE_URL);
assert.equal(firstProvider.defaultApiKeyEnvVar, ERNIE_AI_STUDIO_API_KEY_ENV);

const requiredAlignedProviders = [
  "anthropic",
  "local-claude",
  "local-codex",
  "openai",
  "google",
  "deepseek",
  "groq",
  "xai",
  "nvidia-nim",
  "kimi",
  "kimi-cn",
  "zhipu",
  "minimax-global",
  "minimax-cn",
  "bailian-coding",
  "xiaomi-mimo",
  "volcengine-ark",
  "ollama-local",
  "ollama-cloud",
  "custom",
] as const;

const byId = new Map(providerAdapters.map((provider) => [provider.id, provider]));

for (const id of requiredAlignedProviders) {
  const provider = byId.get(id);
  assert.ok(provider, `missing provider catalog entry: ${id}`);
  assert.ok(provider.models.includes(provider.defaultModel), `${id} default model must be selectable`);
}

for (const provider of providerAdapters) {
  if (provider.kind === "local") {
    assert.ok(provider.command, `${provider.id} must declare the CLI command`);
    continue;
  }
  assert.ok(provider.defaultApiBaseUrl !== undefined, `${provider.id} must declare a default API base URL`);
  assert.ok(provider.defaultApiProtocol, `${provider.id} must declare the API protocol`);
  if (provider.providerType !== "local") {
    assert.ok(
      provider.defaultApiKeyEnvVar !== undefined,
      `${provider.id} must declare its API key environment variable`,
    );
  }
}

assert.equal(byId.get("anthropic")?.defaultApiProtocol, "native");
assert.equal(byId.get("google")?.defaultApiProtocol, "native");
assert.equal(byId.get("minimax-global")?.defaultApiProtocol, "anthropic-compatible");
assert.equal(byId.get("ollama-local")?.defaultApiBaseUrl, "http://localhost:11434/v1");
assert.equal(providerIdAliases["openai-compatible"], "openai");
assert.equal(providerIdAliases["claude-code"], "local-claude");
assert.equal(providerIdAliases["codex-cli"], "local-codex");

console.log("provider catalog alignment checks passed.");
