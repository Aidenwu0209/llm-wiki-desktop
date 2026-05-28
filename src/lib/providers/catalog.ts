import type { ProviderAdapter } from "../../types";

export const ERNIE_AI_STUDIO_BASE_URL = "https://aistudio.baidu.com/llm/lmapi/v3";
export const ERNIE_AI_STUDIO_API_KEY_ENV = "AI_STUDIO_API_KEY";
export const ERNIE_AI_STUDIO_DEFAULT_MODEL = "ernie-5.1";
export const ERNIE_AI_STUDIO_FALLBACK_MODELS = ["ernie-4.0-turbo-128k", "ernie-3.5-8k"];

export const PADDLEOCR_VL15_PROVIDER_ID = "paddleocr-vl15";
export const PADDLEOCR_VL15_DISPLAY_NAME = "PaddleOCR-VL-1.5";
export const PADDLEOCR_VL15_API_KEY_ENV = "PADDLEOCR_API_KEY";
export const PADDLEOCR_VL15_DEFAULT_MODEL = "PaddleOCR-VL-1.5";
export const PADDLEOCR_VL15_DEFAULT_ENDPOINT = "";

export const paddleOcrVl15Provider = {
  id: PADDLEOCR_VL15_PROVIDER_ID,
  displayName: PADDLEOCR_VL15_DISPLAY_NAME,
  name: PADDLEOCR_VL15_DISPLAY_NAME,
  subtitle: "Optional PaddleOCR-VL-1.5 service configuration for OCR parser experiments.",
  subtitleZh: "可选的 PaddleOCR-VL-1.5 服务配置，用于 OCR parser 实验。",
  providerType: "hosted",
  apiKeyEnv: PADDLEOCR_VL15_API_KEY_ENV,
  defaultModel: PADDLEOCR_VL15_DEFAULT_MODEL,
  defaultEndpoint: PADDLEOCR_VL15_DEFAULT_ENDPOINT,
  status: "missing_key",
} as const;

export const providerAdapters: ProviderAdapter[] = [
  {
    id: "ernie-ai-studio",
    displayName: "文心一言 / ERNIE",
    name: "文心一言 / ERNIE",
    subtitle: "Baidu AI Studio OpenAI-compatible ERNIE endpoint.",
    subtitleZh: "百度 AI Studio OpenAI 兼容文心一言端点。",
    kind: "api",
    providerType: "hosted",
    baseUrl: ERNIE_AI_STUDIO_BASE_URL,
    apiKeyEnv: ERNIE_AI_STUDIO_API_KEY_ENV,
    defaultModel: ERNIE_AI_STUDIO_DEFAULT_MODEL,
    fallbackModels: ERNIE_AI_STUDIO_FALLBACK_MODELS,
    models: [ERNIE_AI_STUDIO_DEFAULT_MODEL, ...ERNIE_AI_STUDIO_FALLBACK_MODELS],
    supportsStructuredOutput: "model-dependent",
    supportsStreaming: "optional",
    status: "missing_key",
    defaultApiBaseUrl: ERNIE_AI_STUDIO_BASE_URL,
    defaultApiKeyEnvVar: ERNIE_AI_STUDIO_API_KEY_ENV,
    defaultApiProtocol: "openai-compatible",
    defaultContextWindow: 128000,
  },
  {
    id: "openai-compatible",
    displayName: "OpenAI-compatible",
    name: "OpenAI-compatible",
    subtitle: "Hosted OpenAI-compatible endpoint configured when available.",
    subtitleZh: "可用时配置的 OpenAI 兼容托管端点。",
    kind: "api",
    providerType: "hosted",
    defaultModel: "gpt-5.5",
    fallbackModels: ["gpt-5.4", "gpt-5.4-mini"],
    models: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"],
    supportsStructuredOutput: "model-dependent",
    supportsStreaming: "optional",
    defaultApiBaseUrl: "https://api.openai.com/v1",
    defaultApiKeyEnvVar: "OPENAI_API_KEY",
    defaultApiProtocol: "openai-compatible",
    defaultContextWindow: 128000,
  },
  {
    id: "deepseek",
    displayName: "DeepSeek",
    name: "DeepSeek",
    subtitle: "OpenAI-compatible DeepSeek endpoint configured when available.",
    subtitleZh: "可用时配置的 DeepSeek OpenAI 兼容端点。",
    kind: "api",
    providerType: "hosted",
    defaultModel: "deepseek-reasoner",
    fallbackModels: ["deepseek-chat"],
    models: ["deepseek-reasoner", "deepseek-chat"],
    supportsStructuredOutput: "model-dependent",
    supportsStreaming: "optional",
    defaultApiBaseUrl: "https://api.deepseek.com/v1",
    defaultApiKeyEnvVar: "DEEPSEEK_API_KEY",
    defaultApiProtocol: "openai-compatible",
    defaultContextWindow: 64000,
  },
  {
    id: "local-codex",
    displayName: "Local Codex",
    name: "Local Codex",
    subtitle: "Local Codex CLI handoff without storing API keys.",
    subtitleZh: "通过本地 Codex CLI 交接任务，不在桌面端保存 API key。",
    kind: "local",
    providerType: "local",
    command: "codex",
    defaultModel: "default",
    fallbackModels: [],
    models: ["default"],
    defaultContextWindow: 128000,
  },
  {
    id: "local-claude",
    displayName: "Local Claude",
    name: "Local Claude",
    subtitle: "Local Claude Code CLI handoff without storing API keys.",
    subtitleZh: "通过本地 Claude Code CLI 交接任务，不在桌面端保存 API key。",
    kind: "local",
    providerType: "local",
    command: "claude",
    defaultModel: "default",
    fallbackModels: ["sonnet", "opus"],
    models: ["default", "sonnet", "opus"],
    defaultContextWindow: 128000,
  },
  {
    id: "custom",
    displayName: "Custom",
    name: "Custom",
    subtitle: "Custom OpenAI-compatible gateway; requires local setup.",
    subtitleZh: "自定义 OpenAI 兼容网关；需要本地配置。",
    kind: "api",
    providerType: "custom",
    defaultModel: "custom-model",
    fallbackModels: [],
    models: ["custom-model"],
    supportsStructuredOutput: "model-dependent",
    supportsStreaming: "optional",
    defaultApiBaseUrl: "https://your-gateway.example.com/v1",
    defaultApiKeyEnvVar: "CUSTOM_LLM_API_KEY",
    defaultApiProtocol: "openai-compatible",
    defaultContextWindow: 128000,
  },
];

export const providerIdAliases: Record<string, ProviderAdapter["id"]> = {
  openai: "openai-compatible",
  "custom-openai": "custom",
  "codex-cli": "local-codex",
  "claude-code": "local-claude",
  "baidu-qianfan": "ernie-ai-studio",
};
