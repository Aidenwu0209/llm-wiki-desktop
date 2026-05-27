import type { LlmProviderConfig, ProviderAdapter } from "../../types";

export const ERNIE_PROVIDER_ID = "ernie-ai-studio";
export const ERNIE_BASE_URL = "https://aistudio.baidu.com/llm/lmapi/v3";
export const ERNIE_API_KEY_ENV = "AI_STUDIO_API_KEY";
export const ERNIE_DEFAULT_MODEL = "ernie-5.1";
export const ERNIE_FALLBACK_MODELS = ["ernie-4.0-turbo-128k", "ernie-3.5-8k"] as const;

export type ProviderCatalogItem = ProviderAdapter & {
  name: string;
  subtitle: string;
  subtitleZh: string;
  kind: "api" | "local";
  command?: "codex" | "claude";
  defaultApiProtocol: "openai-compatible" | "anthropic-compatible" | "native";
  defaultContextWindow: number;
  models: readonly string[];
};

export const providerCatalog = [
  {
    id: ERNIE_PROVIDER_ID,
    displayName: "文心一言 / ERNIE",
    name: "文心一言 / ERNIE",
    subtitle: "Baidu AI Studio hosted ERNIE provider, configured when AI_STUDIO_API_KEY is available.",
    subtitleZh: "百度 AI Studio 托管文心一言；检测到 AI_STUDIO_API_KEY 后可用。",
    providerType: "hosted",
    kind: "api",
    baseUrl: ERNIE_BASE_URL,
    apiKeyEnv: ERNIE_API_KEY_ENV,
    defaultModel: ERNIE_DEFAULT_MODEL,
    fallbackModels: [...ERNIE_FALLBACK_MODELS],
    supportsStructuredOutput: true,
    supportsStreaming: true,
    status: "missing_key",
    defaultApiProtocol: "openai-compatible",
    defaultContextWindow: 128000,
    models: [ERNIE_DEFAULT_MODEL, ...ERNIE_FALLBACK_MODELS],
  },
  {
    id: "openai-compatible",
    displayName: "OpenAI-compatible",
    name: "OpenAI-compatible",
    subtitle: "Generic hosted OpenAI-compatible endpoint, configured when a local setup provides the key.",
    subtitleZh: "通用 OpenAI 兼容端点；需要本地环境提供 API key。",
    providerType: "hosted",
    kind: "api",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    fallbackModels: [],
    supportsStructuredOutput: false,
    supportsStreaming: true,
    status: "missing_key",
    defaultApiProtocol: "openai-compatible",
    defaultContextWindow: 128000,
    models: ["gpt-4o-mini", "gpt-4o", "custom-model"],
  },
  {
    id: "deepseek",
    displayName: "DeepSeek",
    name: "DeepSeek",
    subtitle: "OpenAI-compatible DeepSeek endpoint, configured when DEEPSEEK_API_KEY is available.",
    subtitleZh: "OpenAI 兼容的 DeepSeek 端点；检测到 DEEPSEEK_API_KEY 后可用。",
    providerType: "hosted",
    kind: "api",
    baseUrl: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
    fallbackModels: ["deepseek-reasoner"],
    supportsStructuredOutput: false,
    supportsStreaming: true,
    status: "missing_key",
    defaultApiProtocol: "openai-compatible",
    defaultContextWindow: 64000,
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "local-codex",
    displayName: "Local Codex",
    name: "Local Codex",
    subtitle: "Local Codex CLI handoff without storing API keys.",
    subtitleZh: "通过本地 Codex CLI 交接任务，不在桌面端保存 API key。",
    providerType: "local",
    kind: "local",
    command: "codex",
    baseUrl: "",
    apiKeyEnv: "",
    defaultModel: "default",
    fallbackModels: [],
    supportsStructuredOutput: false,
    supportsStreaming: false,
    status: "missing_key",
    defaultApiProtocol: "native",
    defaultContextWindow: 128000,
    models: ["default", "gpt-5.5", "gpt-5.4"],
  },
  {
    id: "local-claude",
    displayName: "Local Claude",
    name: "Local Claude",
    subtitle: "Local Claude Code CLI handoff without storing API keys.",
    subtitleZh: "通过本地 Claude Code CLI 交接任务，不在桌面端保存 API key。",
    providerType: "local",
    kind: "local",
    command: "claude",
    baseUrl: "",
    apiKeyEnv: "",
    defaultModel: "default",
    fallbackModels: [],
    supportsStructuredOutput: false,
    supportsStreaming: false,
    status: "missing_key",
    defaultApiProtocol: "native",
    defaultContextWindow: 128000,
    models: ["default", "sonnet", "opus"],
  },
  {
    id: "custom",
    displayName: "Custom",
    name: "Custom",
    subtitle: "Custom OpenAI-compatible gateway, relay, vLLM, LM Studio, or LocalAI endpoint.",
    subtitleZh: "自定义 OpenAI 兼容网关、转发、vLLM、LM Studio 或 LocalAI 端点。",
    providerType: "hosted",
    kind: "api",
    baseUrl: "https://your-gateway.example.com/v1",
    apiKeyEnv: "CUSTOM_LLM_API_KEY",
    defaultModel: "custom-model",
    fallbackModels: [],
    supportsStructuredOutput: false,
    supportsStreaming: true,
    status: "missing_key",
    defaultApiProtocol: "openai-compatible",
    defaultContextWindow: 128000,
    models: ["custom-model"],
  },
] as const satisfies readonly ProviderCatalogItem[];

export const providerNames: Record<string, string> = Object.fromEntries(
  providerCatalog.map((provider) => [provider.id, provider.name]),
);

export const localProviderIds: ReadonlySet<string> = new Set(
  providerCatalog.filter((provider) => provider.kind === "local").map((provider) => provider.id),
);

export function findProvider(providerId: string) {
  return providerCatalog.find((item) => item.id === providerId);
}

export function defaultProviderConfig(providerId: string): LlmProviderConfig {
  const provider = findProvider(providerId);
  return {
    enabled: false,
    expanded: false,
    selectedModel: provider?.defaultModel ?? "default",
    customModel: "",
    contextWindow: provider?.defaultContextWindow ?? 64000,
    reasoningMode: "balanced",
    apiBaseUrl: provider?.baseUrl ?? "",
    apiKeyEnvVar: provider?.apiKeyEnv ?? "",
    apiProtocol: provider?.defaultApiProtocol ?? "",
    apiKeyConfigured: false,
    apiKeyCheckedAt: null,
    providerStatus: provider?.status ?? "missing_key",
    lastCheckedAt: null,
    lastError: null,
    lastLatencyMs: null,
    lastTestedModel: null,
    cliAvailable: false,
    cliVersion: null,
    cliPath: null,
    cliCheckedAt: null,
  };
}
