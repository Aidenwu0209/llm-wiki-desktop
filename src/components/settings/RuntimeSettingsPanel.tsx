import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Cpu,
  Database,
  FileText,
  Globe,
  History,
  Image,
  Info,
  KeyRound,
  Network,
  Paintbrush,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import type { DesktopSettings, LlmApiKeyCheckResult, LlmCliCheckResult, LlmProviderConfig } from "../../types";
import { languageName, type UiLanguage } from "../../i18n";
import { checkLlmApiKey, checkLocalLlmCli } from "../../tauri";
import { BrandMark } from "../brand/BrandMark";

type RuntimeSettingsPanelProps = {
  className?: string;
  language?: UiLanguage;
  settings: DesktopSettings;
  setSettings: Dispatch<SetStateAction<DesktopSettings>>;
  vaultPath: string;
  busy: string | null;
  onChooseRuntime: () => void;
  onSaveSettings: () => void;
  onToggleLanguage?: () => void;
};

type SettingsSection =
  | "llm"
  | "embeddings"
  | "captioning"
  | "web-search"
  | "network"
  | "source-watch"
  | "scheduled-import"
  | "output"
  | "interface"
  | "maintenance"
  | "changelog"
  | "about";

const settingsNav: Array<{ id: SettingsSection; label: string; icon: typeof Settings }> = [
  { id: "llm", label: "LLM Models", icon: Bot },
  { id: "embeddings", label: "Embeddings", icon: Database },
  { id: "captioning", label: "Image Captioning", icon: Image },
  { id: "web-search", label: "Web Search", icon: Search },
  { id: "network", label: "Network", icon: Network },
  { id: "source-watch", label: "Source Watch", icon: ShieldCheck },
  { id: "scheduled-import", label: "Scheduled Import", icon: History },
  { id: "output", label: "Output", icon: FileText },
  { id: "interface", label: "Interface", icon: Paintbrush },
  { id: "maintenance", label: "Maintenance", icon: Settings },
  { id: "changelog", label: "Changelog", icon: Sparkles },
  { id: "about", label: "About", icon: Info },
];

const settingsCopy = {
  zh: {
    settings: "设置",
    nav: {
      llm: "大语言模型",
      embeddings: "向量模型",
      captioning: "图像描述",
      "web-search": "网页搜索",
      network: "网络",
      "source-watch": "资料监控",
      "scheduled-import": "定时导入",
      output: "输出",
      interface: "界面",
      maintenance: "维护",
      changelog: "更新记录",
      about: "关于",
    },
    llmTitle: "大语言模型",
    llmSubtitle: "选择一个当前启用的模型提供方。本地命令行提供方不会把密钥写入桌面设置文件。",
    save: "保存",
    detected: "检查通过",
    notFound: "检查失败",
    checking: "检查中",
    needsCheck: "待检查",
    needsConfig: "待配置",
    noProvider: "未选择提供方",
    selectAfterCheck: "本地 CLI 需要先检查可用后才能启用。",
    configurable: "可配置",
    enabled: "已启用",
    keyPresent: "密钥已检测",
    keyMissing: "未检测到密钥",
    localEndpointReady: "本地端点可用",
    apiPlaceholder: "托管 API 提供方可用。这里保存 Base URL 和 API key 环境变量名，不保存 API key 明文。",
    apiBaseUrl: "API Base URL",
    apiKeyEnvVar: "API Key 环境变量",
    apiProtocol: "API 协议",
    openaiCompatible: "OpenAI 兼容",
    anthropicCompatible: "Anthropic 兼容",
    nativeProtocol: "原生协议",
    protocolHint: "协议信息会保存到桌面设置，供后续 Chat/Search 调用模型时选择正确 wire format。",
    checkKeyAndEnable: "检查并启用",
    apiKeyHint: "请把密钥放在系统环境变量、本地运行时或启动脚本中；桌面设置只保存变量名。",
    local: "本地",
    activeKeyHidden: "已选择，未保存密钥",
    off: "关闭",
    cliStatus: "CLI 状态",
    available: "可用",
    missing: "缺失",
    notChecked: "未检查",
    detectedVersion: "检测版本",
    path: "路径",
    pathPending: "等待 PATH 检查",
    recheck: "重新检查",
    checkAndEnable: "检查并启用",
    temporarilyUnavailable: "未配置",
    apiNote: "API 密钥不在此界面中保存或明文显示。请使用环境变量、系统钥匙串或本地运行时配置。",
    customModel: "自定义模型",
    optionalOverride: "可选覆盖",
    contextWindow: "上下文窗口",
    reasoning: "推理 / 思考强度",
    deepThinking: "深度思考",
    placeholder: "Coming soon / Reserved：该分区目前只是预留入口；未实现的 provider、网络或自动化能力不会在这里伪装成可用功能。",
    runtime: "运行时",
    runtimePath: "运行时路径",
    preferLocalRuntime: "优先使用知识库内的本地运行时",
    chooseRuntime: "选择运行时路径",
    parserBoundary: "解析和网络边界",
    defaultPdfParser: "默认 PDF 解析器",
    token: "Token",
    configured: "已配置",
    notDetected: "未检测到",
    cloudParser: "云解析器",
    allowed: "已允许",
    blocked: "已阻止",
    allowCloudParser: "允许 layout-api 使用云解析器",
    aboutBoundary: "本地优先桌面外壳。运行时优先执行。证据支撑研究。先提案后写回，并保留审批门。",
    switchLanguage: "界面语言",
  },
  en: {
    settings: "Settings",
    nav: Object.fromEntries(settingsNav.map((item) => [item.id, item.label])) as Record<SettingsSection, string>,
    llmTitle: "LLM Models",
    llmSubtitle: "Choose one active model provider. Local CLI providers keep secrets outside the desktop settings file.",
    save: "Save",
    detected: "Check passed",
    notFound: "Check failed",
    checking: "Checking",
    needsCheck: "Needs check",
    needsConfig: "Needs config",
    noProvider: "No provider selected",
    selectAfterCheck: "Check the local CLI before enabling it.",
    configurable: "Configurable",
    enabled: "Enabled",
    keyPresent: "Key detected",
    keyMissing: "Key not detected",
    localEndpointReady: "Local endpoint ready",
    apiPlaceholder: "Hosted API providers are usable. This saves the Base URL and API key environment variable name, never the API key value.",
    apiBaseUrl: "API Base URL",
    apiKeyEnvVar: "API key environment variable",
    apiProtocol: "API protocol",
    openaiCompatible: "OpenAI-compatible",
    anthropicCompatible: "Anthropic-compatible",
    nativeProtocol: "Native",
    protocolHint: "The protocol is saved so later Chat/Search model calls can use the correct wire format.",
    checkKeyAndEnable: "Check and enable",
    apiKeyHint: "Put the secret in an environment variable, local runtime config, or launch script. Desktop settings only save the variable name.",
    local: "Local",
    activeKeyHidden: "Selected, key not stored",
    off: "Off",
    cliStatus: "CLI status",
    available: "available",
    missing: "missing",
    notChecked: "not checked",
    detectedVersion: "Detected version",
    path: "Path",
    pathPending: "PATH lookup pending",
    recheck: "Re-check",
    checkAndEnable: "Check and enable",
    temporarilyUnavailable: "Not configured",
    apiNote: "API keys are not saved or shown in this UI. Use environment variables, the system keychain, or local runtime config.",
    customModel: "Custom model",
    optionalOverride: "Optional override",
    contextWindow: "Context window",
    reasoning: "Reasoning / thinking",
    deepThinking: "deep thinking",
    placeholder: "Coming soon / Reserved: this section is a reserved entry point only; unavailable provider, network, or automation features are not presented as fully configured.",
    runtime: "Runtime",
    runtimePath: "Runtime path",
    preferLocalRuntime: "Prefer vault-local runtime",
    chooseRuntime: "Choose runtime path",
    parserBoundary: "Parsing and network boundary",
    defaultPdfParser: "Default PDF parser",
    token: "Token",
    configured: "configured",
    notDetected: "not detected",
    cloudParser: "Cloud parser",
    allowed: "allowed",
    blocked: "blocked",
    allowCloudParser: "Allow cloud parser for layout-api",
    aboutBoundary: "Local-first desktop shell. Runtime-first execution. Evidence-backed research. Proposal-first writeback with approval gate.",
    switchLanguage: "Interface language",
  },
} as const;

const providers = [
  { id: "anthropic", name: "Anthropic (Claude)", subtitle: "Claude API models for remote research jobs.", subtitleZh: "面向远程研究任务的 Claude API 模型。", kind: "api", defaultApiBaseUrl: "https://api.anthropic.com/v1", defaultApiKeyEnvVar: "ANTHROPIC_API_KEY", defaultApiProtocol: "native", defaultContextWindow: 200000, models: ["claude-sonnet-4-5", "claude-3-7-sonnet", "claude-3-5-haiku"] },
  { id: "claude-code", name: "Claude Code CLI (local)", subtitle: "Local Claude Code CLI handoff without storing API keys.", subtitleZh: "通过本地 Claude Code 命令行交接任务，不在桌面端保存 API key。", kind: "local", command: "claude" as const, models: ["sonnet", "opus", "default"] },
  { id: "codex-cli", name: "Codex CLI (local)", subtitle: "Local Codex runtime for repo-aware research and automation.", subtitleZh: "本地 Codex 运行时，用于仓库上下文研究和自动化。", kind: "local", command: "codex" as const, models: ["gpt-5.5", "gpt-5.4", "gpt-5.3-codex"] },
  { id: "openai", name: "OpenAI (GPT)", subtitle: "Hosted GPT models when explicit API use is allowed.", subtitleZh: "仅在明确允许 API 使用时启用的托管 GPT 模型。", kind: "api", defaultApiBaseUrl: "https://api.openai.com/v1", defaultApiKeyEnvVar: "OPENAI_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 128000, models: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"] },
  { id: "google", name: "Google (Gemini)", subtitle: "Gemini API provider for external model runs.", subtitleZh: "用于外部模型运行的 Gemini API 提供方。", kind: "api", defaultApiBaseUrl: "https://generativelanguage.googleapis.com/v1beta", defaultApiKeyEnvVar: "GEMINI_API_KEY", defaultApiProtocol: "native", defaultContextWindow: 1000000, models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  { id: "deepseek", name: "DeepSeek", subtitle: "OpenAI-compatible DeepSeek endpoint.", subtitleZh: "OpenAI 兼容的 DeepSeek 端点。", kind: "api", defaultApiBaseUrl: "https://api.deepseek.com/v1", defaultApiKeyEnvVar: "DEEPSEEK_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 64000, models: ["deepseek-reasoner", "deepseek-chat"] },
  { id: "kimi", name: "Kimi (Moonshot)", subtitle: "Moonshot international endpoint.", subtitleZh: "Moonshot 国际区端点。", kind: "api", defaultApiBaseUrl: "https://api.moonshot.ai/v1", defaultApiKeyEnvVar: "MOONSHOT_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 256000, models: ["kimi-k2.6", "kimi-k2.5", "kimi-k2-thinking", "kimi-for-coding"] },
  { id: "kimi-cn", name: "Kimi (Moonshot, 中国)", subtitle: "Moonshot China endpoint profile.", subtitleZh: "Moonshot 中国区端点配置。", kind: "api", defaultApiBaseUrl: "https://api.moonshot.cn/v1", defaultApiKeyEnvVar: "MOONSHOT_CN_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 256000, models: ["kimi-k2.6", "kimi-k2.5", "kimi-k2-thinking", "kimi-for-coding"] },
  { id: "qwen-dashscope", name: "通义千问 / DashScope", subtitle: "Alibaba Cloud DashScope OpenAI-compatible endpoint.", subtitleZh: "阿里云 DashScope OpenAI 兼容端点。", kind: "api", defaultApiBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", defaultApiKeyEnvVar: "DASHSCOPE_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 131072, models: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-long", "qwen3-coder-plus"] },
  { id: "bailian-coding", name: "阿里百炼 Coding Plan", subtitle: "Alibaba Bailian coding endpoint for Qwen/Kimi/GLM/MiniMax presets.", subtitleZh: "阿里百炼 Coding Plan，覆盖 Qwen/Kimi/GLM/MiniMax 等模型。", kind: "api", defaultApiBaseUrl: "https://coding.dashscope.aliyuncs.com/v1", defaultApiKeyEnvVar: "BAILIAN_CODING_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 131072, models: ["qwen3.6-plus", "qwen3-coder-plus", "kimi-k2.5", "glm-5", "MiniMax-M2.5"] },
  { id: "zhipu", name: "智谱 GLM (Zhipu)", subtitle: "BigModel GLM OpenAI-compatible endpoint.", subtitleZh: "智谱 BigModel GLM OpenAI 兼容端点。", kind: "api", defaultApiBaseUrl: "https://open.bigmodel.cn/api/paas/v4", defaultApiKeyEnvVar: "ZHIPU_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 128000, models: ["glm-4.6", "glm-4.5", "glm-4.5-air", "glm-4-plus", "glm-4-flash"] },
  { id: "minimax-global", name: "MiniMax (Global)", subtitle: "MiniMax Anthropic-compatible global endpoint.", subtitleZh: "MiniMax 国际区 Anthropic 兼容端点。", kind: "api", defaultApiBaseUrl: "https://api.minimax.io/anthropic", defaultApiKeyEnvVar: "MINIMAX_API_KEY", defaultApiProtocol: "anthropic-compatible", defaultContextWindow: 200000, models: ["MiniMax-M2.7", "MiniMax-M2.5"] },
  { id: "minimax-cn", name: "MiniMax (中国)", subtitle: "MiniMax China Anthropic-compatible endpoint.", subtitleZh: "MiniMax 中国区 Anthropic 兼容端点。", kind: "api", defaultApiBaseUrl: "https://api.minimaxi.com/anthropic", defaultApiKeyEnvVar: "MINIMAX_CN_API_KEY", defaultApiProtocol: "anthropic-compatible", defaultContextWindow: 200000, models: ["MiniMax-M2.7", "MiniMax-M2.5"] },
  { id: "volcengine-ark", name: "火山引擎 Ark / 豆包", subtitle: "Volcengine Ark OpenAI-compatible endpoint.", subtitleZh: "火山引擎 Ark / 豆包 OpenAI 兼容端点。", kind: "api", defaultApiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3", defaultApiKeyEnvVar: "VOLCENGINE_ARK_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 128000, models: ["doubao-seed-1-6", "doubao-1-5-pro-32k", "deepseek-v3", "Doubao-Seed-2.0-pro"] },
  { id: "baidu-qianfan", name: "百度千帆 / 文心", subtitle: "Baidu Qianfan OpenAI-compatible endpoint.", subtitleZh: "百度千帆 / 文心 OpenAI 兼容端点。", kind: "api", defaultApiBaseUrl: "https://qianfan.baidubce.com/v2", defaultApiKeyEnvVar: "QIANFAN_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 128000, models: ["ernie-4.5-turbo-128k", "ernie-4.5-8k", "ernie-x1-turbo-32k"] },
  { id: "tencent-hunyuan", name: "腾讯混元 (Hunyuan)", subtitle: "Tencent Hunyuan OpenAI-compatible endpoint.", subtitleZh: "腾讯混元 OpenAI 兼容端点。", kind: "api", defaultApiBaseUrl: "https://api.hunyuan.cloud.tencent.com/v1", defaultApiKeyEnvVar: "HUNYUAN_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 128000, models: ["hunyuan-t1-latest", "hunyuan-turbos-latest", "hunyuan-large"] },
  { id: "siliconflow", name: "硅基流动 (SiliconFlow)", subtitle: "OpenAI-compatible model gateway for Chinese and open-weight models.", subtitleZh: "硅基流动 OpenAI 兼容模型网关，覆盖国产和开源模型。", kind: "api", defaultApiBaseUrl: "https://api.siliconflow.cn/v1", defaultApiKeyEnvVar: "SILICONFLOW_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 128000, models: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen3-235B-A22B", "THUDM/GLM-4-32B-0414"] },
  { id: "baichuan", name: "百川智能 (Baichuan)", subtitle: "Baichuan OpenAI-compatible endpoint.", subtitleZh: "百川智能 OpenAI 兼容端点。", kind: "api", defaultApiBaseUrl: "https://api.baichuan-ai.com/v1", defaultApiKeyEnvVar: "BAICHUAN_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 128000, models: ["Baichuan4-Turbo", "Baichuan4-Air", "Baichuan3-Turbo"] },
  { id: "yi", name: "零一万物 Yi", subtitle: "01.AI Yi OpenAI-compatible endpoint.", subtitleZh: "零一万物 Yi OpenAI 兼容端点。", kind: "api", defaultApiBaseUrl: "https://api.lingyiwanwu.com/v1", defaultApiKeyEnvVar: "YI_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 128000, models: ["yi-large", "yi-medium", "yi-vision"] },
  { id: "iflytek-spark", name: "讯飞星火 (Spark)", subtitle: "iFlytek Spark OpenAI-compatible endpoint.", subtitleZh: "讯飞星火 OpenAI 兼容端点。", kind: "api", defaultApiBaseUrl: "https://spark-api-open.xf-yun.com/v1", defaultApiKeyEnvVar: "SPARK_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 128000, models: ["4.0Ultra", "generalv3.5", "generalv3"] },
  { id: "groq", name: "Groq", subtitle: "Fast hosted inference for low-latency checks.", subtitleZh: "用于低延迟检查的快速托管推理。", kind: "api", defaultApiBaseUrl: "https://api.groq.com/openai/v1", defaultApiKeyEnvVar: "GROQ_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 128000, models: ["llama-3.3-70b", "mixtral"] },
  { id: "xai", name: "xAI (Grok)", subtitle: "Grok provider for approved hosted research tasks.", subtitleZh: "用于已批准托管研究任务的 Grok 提供方。", kind: "api", defaultApiBaseUrl: "https://api.x.ai/v1", defaultApiKeyEnvVar: "XAI_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 131072, models: ["grok-4", "grok-3", "grok-3-mini"] },
  { id: "nvidia", name: "NVIDIA NIM", subtitle: "NIM endpoints for enterprise or local gateway use.", subtitleZh: "用于企业端点或本地网关的 NIM 配置。", kind: "api", defaultApiBaseUrl: "https://integrate.api.nvidia.com/v1", defaultApiKeyEnvVar: "NVIDIA_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 128000, models: ["meta/llama-3.3-70b-instruct", "nvidia/llama-3.3-nemotron-super-49b-v1.5", "deepseek-ai/deepseek-v3.2"] },
  { id: "ollama-local", name: "Ollama (Local)", subtitle: "Local OpenAI-compatible endpoint.", subtitleZh: "本地 OpenAI 兼容模型端点。", kind: "api", defaultApiBaseUrl: "http://localhost:11434/v1", defaultApiKeyEnvVar: "OLLAMA_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 32768, models: ["qwen3", "llama3.3", "deepseek-r1"] },
  { id: "custom-openai", name: "Custom OpenAI-Compatible", subtitle: "Any OpenAI-compatible gateway, relay, vLLM, LM Studio, or LocalAI endpoint.", subtitleZh: "任意 OpenAI 兼容网关、转发、vLLM、LM Studio 或 LocalAI 端点。", kind: "api", defaultApiBaseUrl: "https://your-gateway.example.com/v1", defaultApiKeyEnvVar: "CUSTOM_LLM_API_KEY", defaultApiProtocol: "openai-compatible", defaultContextWindow: 128000, models: ["custom-model"] },
] as const;

function visiblePath(path: string) {
  return path.replace(/ +(?=\/|$)/g, (match) => "[space]".repeat(match.length));
}

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function isLocalApiEndpoint(value?: string | null) {
  const url = (value || "").trim().toLowerCase();
  return url.startsWith("http://localhost")
    || url.startsWith("http://127.0.0.1")
    || url.startsWith("http://[::1]");
}

function apiProviderReady(config: LlmProviderConfig) {
  return Boolean(config.apiKeyConfigured || isLocalApiEndpoint(config.apiBaseUrl));
}

function defaultProviderConfig(providerId: string): LlmProviderConfig {
  const provider = providers.find((item) => item.id === providerId);
  return {
    enabled: false,
    expanded: false,
    selectedModel: provider?.models[0] ?? "default",
    customModel: "",
    contextWindow: provider && "defaultContextWindow" in provider ? provider.defaultContextWindow : providerId.includes("cli") ? 128000 : 64000,
    reasoningMode: "balanced",
    apiBaseUrl: provider && "defaultApiBaseUrl" in provider ? provider.defaultApiBaseUrl : "",
    apiKeyEnvVar: provider && "defaultApiKeyEnvVar" in provider ? provider.defaultApiKeyEnvVar : "",
    apiProtocol: provider && "defaultApiProtocol" in provider ? provider.defaultApiProtocol : "",
    apiKeyConfigured: false,
    apiKeyCheckedAt: null,
    cliAvailable: false,
    cliVersion: null,
    cliPath: null,
    cliCheckedAt: null,
  };
}

function normalizeProviderSettings(settings: DesktopSettings) {
  const current = settings.llmProviderCenter || { activeProviderId: null, providers: {} };
  const knownProviderIds: string[] = providers.map((item) => item.id);
  const activeProviderId = current.activeProviderId && knownProviderIds.includes(current.activeProviderId)
    ? current.activeProviderId
    : null;
  const normalized = { ...current.providers };
  for (const provider of providers) {
    const saved = normalized[provider.id];
    const defaults = defaultProviderConfig(provider.id);
    const merged = {
      ...defaults,
      ...saved,
    };
    if (provider.kind === "api") {
      merged.apiBaseUrl = merged.apiBaseUrl?.trim() || defaults.apiBaseUrl;
      merged.apiKeyEnvVar = merged.apiKeyEnvVar?.trim() || defaults.apiKeyEnvVar;
      merged.apiProtocol = merged.apiProtocol?.trim() || defaults.apiProtocol;
    }
    const savedEnabled = provider.kind === "local"
      ? Boolean(merged.enabled && merged.cliAvailable)
      : Boolean(merged.enabled && apiProviderReady(merged));
    normalized[provider.id] = {
      ...merged,
      enabled: provider.id === activeProviderId && savedEnabled,
    };
  }
  if (activeProviderId && !normalized[activeProviderId]?.enabled) {
    return { activeProviderId: null, providers: normalized };
  }
  return { activeProviderId, providers: normalized };
}

export function RuntimeSettingsPanel({
  className,
  language = "zh",
  settings,
  setSettings,
  vaultPath,
  busy,
  onChooseRuntime,
  onSaveSettings,
  onToggleLanguage,
}: RuntimeSettingsPanelProps) {
  const text = settingsCopy[language];
  const [section, setSection] = useState<SettingsSection>("llm");
  const [cliChecks, setCliChecks] = useState<Record<string, LlmCliCheckResult | null>>({});
  const [apiChecks, setApiChecks] = useState<Record<string, LlmApiKeyCheckResult | null>>({});
  const [checkingCli, setCheckingCli] = useState<string | null>(null);
  const [checkingApi, setCheckingApi] = useState<string | null>(null);
  const center = useMemo(() => normalizeProviderSettings(settings), [settings]);

  const updateCenter = (nextCenter: typeof center) => {
    setSettings((current) => ({ ...current, llmProviderCenter: nextCenter }));
  };

  const updateProvider = (providerId: string, patch: Partial<LlmProviderConfig>) => {
    updateCenter({
      ...center,
      providers: {
        ...center.providers,
        [providerId]: { ...center.providers[providerId], ...patch },
      },
    });
  };

  const toggleProvider = (providerId: string, enabled: boolean) => {
    const nextActiveProviderId = enabled ? providerId : center.activeProviderId === providerId ? null : center.activeProviderId || null;
    const nextProviders = Object.fromEntries(
      Object.entries(center.providers).map(([id, value]) => [id, { ...value, enabled: id === nextActiveProviderId }]),
    );
    updateCenter({
      activeProviderId: nextActiveProviderId,
      providers: nextProviders,
    });
  };

  const toggleExpanded = (providerId: string) => {
    const nextExpanded = !center.providers[providerId]?.expanded;
    updateCenter({
      ...center,
      providers: Object.fromEntries(
        Object.entries(center.providers).map(([id, value]) => [
          id,
          { ...value, expanded: id === providerId ? nextExpanded : false },
        ]),
      ),
    });
  };

  const runCliCheck = async (providerId: "codex-cli" | "claude-code", command: "codex" | "claude") => {
    setCheckingCli(providerId);
    try {
      const result = await checkLocalLlmCli(command);
      setCliChecks((current) => ({ ...current, [providerId]: result }));
      if (result.available) {
        const nextProviders = Object.fromEntries(
          Object.entries(center.providers).map(([id, value]) => [
            id,
            {
              ...value,
              enabled: id === providerId,
              ...(id === providerId
                ? {
                    cliAvailable: true,
                    cliVersion: result.version,
                    cliPath: result.path,
                    cliCheckedAt: new Date().toISOString(),
                  }
                : {}),
            },
          ]),
        );
        updateCenter({ activeProviderId: providerId, providers: nextProviders });
      } else {
        updateProvider(providerId, {
          enabled: false,
          cliAvailable: false,
          cliVersion: result.version,
          cliPath: result.path,
          cliCheckedAt: new Date().toISOString(),
          expanded: true,
        });
      }
    } catch (err) {
      setCliChecks((current) => ({
        ...current,
        [providerId]: { command, available: false, message: String(err), version: null, path: null },
      }));
      updateProvider(providerId, {
        enabled: false,
        cliAvailable: false,
        cliVersion: null,
        cliPath: null,
        cliCheckedAt: new Date().toISOString(),
        expanded: true,
      });
    } finally {
      setCheckingCli(null);
    }
  };

  const runApiKeyCheck = async (providerId: string) => {
    const config = center.providers[providerId] ?? defaultProviderConfig(providerId);
    if (isLocalApiEndpoint(config.apiBaseUrl)) {
      const result: LlmApiKeyCheckResult = {
        providerId,
        envVar: config.apiKeyEnvVar || "",
        available: true,
        message: language === "zh"
          ? "本地 endpoint 可无 API key 启用；如果服务要求 key，请在启动桌面端前设置环境变量。"
          : "Local endpoint can be enabled without an API key. If the server requires one, set the environment variable before launching the desktop app.",
      };
      setApiChecks((current) => ({ ...current, [providerId]: result }));
      const nextProviders = Object.fromEntries(
        Object.entries(center.providers).map(([id, value]) => [
          id,
          {
            ...value,
            enabled: id === providerId,
            ...(id === providerId
              ? {
                  apiKeyConfigured: true,
                  apiKeyCheckedAt: new Date().toISOString(),
                }
              : {}),
          },
        ]),
      );
      updateCenter({ activeProviderId: providerId, providers: nextProviders });
      return;
    }
    setCheckingApi(providerId);
    try {
      const result = await checkLlmApiKey(providerId, config.apiKeyEnvVar || "");
      setApiChecks((current) => ({ ...current, [providerId]: result }));
      const nextProviders = Object.fromEntries(
        Object.entries(center.providers).map(([id, value]) => [
          id,
          {
            ...value,
            enabled: result.available
              ? id === providerId
              : id !== providerId && id === center.activeProviderId,
            ...(id === providerId
              ? {
                  apiKeyEnvVar: result.envVar,
                  apiKeyConfigured: result.available,
                  apiKeyCheckedAt: new Date().toISOString(),
                }
              : {}),
          },
        ]),
      );
      updateCenter({
        activeProviderId: result.available
          ? providerId
          : center.activeProviderId === providerId ? null : center.activeProviderId,
        providers: nextProviders,
      });
    } catch (err) {
      setApiChecks((current) => ({
        ...current,
        [providerId]: { providerId, envVar: config.apiKeyEnvVar || "", available: false, message: String(err) },
      }));
      updateProvider(providerId, {
        enabled: false,
        apiKeyConfigured: false,
        apiKeyCheckedAt: new Date().toISOString(),
      });
    } finally {
      setCheckingApi(null);
    }
  };

  const cloudParserSelected = settings.defaultPdfParser === "layout-api";
  const cloudParserBlocked = cloudParserSelected && !settings.cloudParsingAllowed;
  const isZh = language === "zh";
  const saveDisabled = !vaultPath || busy === "save_settings";

  const updateSettings = (patch: Partial<DesktopSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const updateNumberSetting = (key: keyof DesktopSettings, value: string, fallback = 0) => {
    const parsed = Number(value);
    updateSettings({ [key]: Number.isFinite(parsed) ? parsed : fallback } as Partial<DesktopSettings>);
  };

  const sectionStatus = (label: string, tone: "available" | "reserved" | "disabled" = "reserved") => (
    <span className={classNames("settings-status-pill", tone)}>{label}</span>
  );

  const renderSectionHead = (
    title: string,
    subtitle: string,
    status: ReturnType<typeof sectionStatus>,
    withSave = true,
  ) => (
    <div className="settings-page-head">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="settings-head-actions">
        {status}
        {withSave && (
          <button onClick={onSaveSettings} disabled={saveDisabled}>
            <Check size={15} />
            {text.save}
          </button>
        )}
      </div>
    </div>
  );

  const renderReservedBlock = (title: string, description: string, Icon = Info) => (
    <div className="settings-block reserved">
      <div className="settings-block-title">
        <Icon size={15} />
        <span>{title}</span>
      </div>
      <p className="settings-block-copy">{description}</p>
    </div>
  );

  const renderRuntimeBlock = () => (
    <div className="settings-block">
      <div className="settings-block-title"><TerminalSquare size={15} /><span>{text.runtime}</span></div>
      <label className="field-label">
        {text.runtimePath}
        <div className="path-field" title={settings.runtimePath || "Prefer vault-local .open-llm-wiki/scripts"}>
          {settings.runtimePath ? visiblePath(settings.runtimePath) : text.preferLocalRuntime}
        </div>
      </label>
      <button className="wide" onClick={onChooseRuntime}>
        <Settings size={16} />
        {text.chooseRuntime}
      </button>
      <div className="settings-grid">
        <label>Python<input value={settings.pythonPath} onChange={(event) => updateSettings({ pythonPath: event.target.value })} /></label>
        <label>uv<input value={settings.uvPath} onChange={(event) => updateSettings({ uvPath: event.target.value })} /></label>
      </div>
    </div>
  );

  const renderParserBlock = () => (
    <div className="settings-block">
      <div className="settings-block-title"><Cloud size={15} /><span>{text.parserBoundary}</span></div>
      <label className="field-label">
        {text.defaultPdfParser}
        <select value={settings.defaultPdfParser} onChange={(event) => updateSettings({ defaultPdfParser: event.target.value })}>
          <option value="auto">auto / local-first</option>
          <option value="local-text">local-text</option>
          <option value="layout-api">layout-api</option>
        </select>
      </label>
      <div className={cloudParserBlocked ? "settings-notice danger" : "settings-notice"}>
        {text.token}: {settings.layoutParsingTokenPresent ? text.configured : text.notDetected} · {text.cloudParser}:
        {settings.cloudParsingAllowed ? ` ${text.allowed}` : ` ${text.blocked}`}
      </div>
      <label className="switch-row">
        <input type="checkbox" checked={settings.cloudParsingAllowed} onChange={(event) => updateSettings({ cloudParsingAllowed: event.target.checked })} />
        <span>{text.allowCloudParser}</span>
      </label>
    </div>
  );

  const renderSettingsSection = () => {
    switch (section) {
      case "embeddings":
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.nav.embeddings,
              isZh ? "配置语义检索用的 embedding endpoint、模型和切分参数。" : "Configure the embedding endpoint, model, and chunking parameters for semantic retrieval.",
              sectionStatus(isZh ? "可配置" : "Configurable", "available"),
            )}
            <div className="settings-block">
              <div className="settings-block-title"><Database size={15} /><span>{isZh ? "向量搜索" : "Vector search"}</span></div>
              <label className="switch-row">
                <input type="checkbox" checked={settings.embeddingEnabled} onChange={(event) => updateSettings({ embeddingEnabled: event.target.checked })} />
                <span>{isZh ? "启用向量搜索配置" : "Enable vector search config"}</span>
              </label>
              <div className="settings-grid">
                <label>{isZh ? "Endpoint" : "Endpoint"}<input value={settings.embeddingEndpoint} onChange={(event) => updateSettings({ embeddingEndpoint: event.target.value })} placeholder="http://127.0.0.1:1234/v1/embeddings" /></label>
                <label>{isZh ? "API Key 环境变量" : "API key environment variable"}<input value={settings.embeddingApiKeyEnvVar} onChange={(event) => updateSettings({ embeddingApiKeyEnvVar: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })} placeholder="EMBEDDING_API_KEY" /></label>
                <label>{isZh ? "模型" : "Model"}<input value={settings.embeddingModel} onChange={(event) => updateSettings({ embeddingModel: event.target.value })} placeholder="text-embedding-qwen3-embedding-0.6b" /></label>
                <label>{isZh ? "输出维度（可选）" : "Output dimensions"}<input type="number" min={0} value={settings.embeddingOutputDimensions} onChange={(event) => updateNumberSetting("embeddingOutputDimensions", event.target.value)} placeholder="0 = model default" /></label>
                <label>{isZh ? "每块最大字符数" : "Max chunk chars"}<input type="number" min={200} value={settings.embeddingMaxChunkChars} onChange={(event) => updateNumberSetting("embeddingMaxChunkChars", event.target.value, 1000)} /></label>
                <label>{isZh ? "重叠字符数" : "Overlap chars"}<input type="number" min={0} value={settings.embeddingOverlapChunkChars} onChange={(event) => updateNumberSetting("embeddingOverlapChunkChars", event.target.value, 200)} /></label>
              </div>
              <div className="settings-notice">
                {isZh ? "向量配置支持 OpenAI-compatible endpoint 和 Gemini native embedding；桌面端只保存 endpoint、模型和环境变量名，不保存密钥明文。" : "Embedding config supports OpenAI-compatible endpoints and Gemini-native embedding. The desktop app saves endpoint, model, and env var name, not the secret value."}
              </div>
            </div>
          </div>
        );
      case "captioning":
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.nav.captioning,
              isZh ? "配置导入时的图片/图表 caption 生成，用于后续 source preview 和语义检索。" : "Configure image and figure captions during ingest for source preview and semantic retrieval.",
              sectionStatus(isZh ? "可配置" : "Configurable", "available"),
            )}
            <div className="settings-block">
              <div className="settings-block-title"><Image size={15} /><span>{isZh ? "图片描述" : "Image captioning"}</span></div>
              <label className="switch-row">
                <input type="checkbox" checked={settings.captioningEnabled} onChange={(event) => updateSettings({ captioningEnabled: event.target.checked })} />
                <span>{isZh ? "导入时生成图片描述" : "Generate captions during ingest"}</span>
              </label>
              <label className="switch-row">
                <input type="checkbox" checked={settings.captioningUseMainProvider} onChange={(event) => updateSettings({ captioningUseMainProvider: event.target.checked })} />
                <span>{isZh ? "复用主 LLM provider（仅限支持视觉输入的模型）" : "Reuse main LLM provider when it supports vision"}</span>
              </label>
              <div className="settings-grid">
                <label>{isZh ? "专用视觉 provider" : "Dedicated vision provider"}<select value={settings.captioningProvider} onChange={(event) => updateSettings({ captioningProvider: event.target.value })}><option value="main-llm">{isZh ? "主 LLM" : "Main LLM"}</option><option value="ollama">Ollama / local</option><option value="openai-compatible">OpenAI compatible</option><option value="gemini-native">Gemini native</option></select></label>
                <label>{isZh ? "Endpoint" : "Endpoint"}<input value={settings.captioningEndpoint} onChange={(event) => updateSettings({ captioningEndpoint: event.target.value })} placeholder="http://127.0.0.1:11434/v1" /></label>
                <label>{isZh ? "API Key 环境变量" : "API key environment variable"}<input value={settings.captioningApiKeyEnvVar} onChange={(event) => updateSettings({ captioningApiKeyEnvVar: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })} placeholder="VISION_API_KEY" /></label>
                <label>{isZh ? "视觉模型" : "Vision model"}<input value={settings.captioningModel} onChange={(event) => updateSettings({ captioningModel: event.target.value })} placeholder="qwen2.5-vl / gpt-4o-mini / gemini-2.5-flash" /></label>
                <label>{isZh ? "并发请求数" : "Concurrency"}<input type="number" min={1} max={16} value={settings.captioningConcurrency} onChange={(event) => updateNumberSetting("captioningConcurrency", event.target.value, 2)} /></label>
                <label>{isZh ? "输出语言" : "Output language"}<input value={settings.aiOutputLanguage || (isZh ? "简体中文" : "English")} onChange={(event) => updateSettings({ aiOutputLanguage: event.target.value })} /></label>
              </div>
              <div className="settings-notice">
                {isZh ? "不会默认上传图片。只有你明确启用并配置本地/远程视觉端点后，后续导入流程才可以读取这些配置。" : "Images are not uploaded by default. Later ingest steps can use this only after you explicitly enable and configure a local or remote vision endpoint."}
              </div>
            </div>
          </div>
        );
      case "web-search":
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.nav["web-search"],
              isZh ? "配置 Deep Research 可使用的外部搜索 provider；默认关闭，避免静默联网。" : "Configure external search providers for Deep Research. It stays off by default to avoid silent networking.",
              sectionStatus(settings.webSearchEnabled ? (isZh ? "已启用" : "Enabled") : (isZh ? "关闭" : "Off"), settings.webSearchEnabled ? "available" : "disabled"),
            )}
            <div className="settings-block">
              <div className="settings-block-title"><Search size={15} /><span>{isZh ? "Deep Research 搜索" : "Deep Research search"}</span></div>
              <label className="switch-row">
                <input type="checkbox" checked={settings.webSearchEnabled} onChange={(event) => updateSettings({ webSearchEnabled: event.target.checked })} />
                <span>{isZh ? "允许使用外部网页搜索" : "Allow external web search"}</span>
              </label>
              <div className="settings-grid">
                <label>{isZh ? "Provider" : "Provider"}<select value={settings.webSearchProvider} onChange={(event) => updateSettings({ webSearchProvider: event.target.value })}><option value="none">{isZh ? "不使用" : "None"}</option><option value="tavily">Tavily</option><option value="serpapi">SerpApi</option><option value="searxng">SearXNG</option></select></label>
                <label>{isZh ? "API Key 环境变量" : "API key environment variable"}<input value={settings.webSearchApiKeyEnvVar} onChange={(event) => updateSettings({ webSearchApiKeyEnvVar: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })} placeholder="TAVILY_API_KEY" /></label>
                <label>{isZh ? "实例 / Endpoint URL" : "Instance / endpoint URL"}<input value={settings.webSearchEndpoint} onChange={(event) => updateSettings({ webSearchEndpoint: event.target.value })} placeholder="https://search.example.com" /></label>
                <label>{isZh ? "搜索分类" : "Search categories"}<input value={settings.webSearchCategories} onChange={(event) => updateSettings({ webSearchCategories: event.target.value })} placeholder="general, news, science" /></label>
              </div>
              <label className="switch-row">
                <input type="checkbox" checked={settings.webSearchAuditLog} onChange={(event) => updateSettings({ webSearchAuditLog: event.target.checked })} />
                <span>{isZh ? "记录来源和审计日志" : "Record sources and audit log"}</span>
              </label>
              <div className="settings-notice">
                {isZh ? "保存配置不等于自动联网；Chat/Search 仍优先使用 vault evidence，只有明确启用的 Deep Research 流程才应读取该设置。" : "Saving this does not silently go online. Chat/Search remains vault-evidence first; only explicitly enabled Deep Research flows should use it."}
              </div>
            </div>
          </div>
        );
      case "network":
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.nav.network,
              isZh ? "控制代理、解析 API、云解析开关和网络边界。默认仍然是 local-first。" : "Controls proxy, parser API, cloud parsing, and network boundaries. The default remains local-first.",
              sectionStatus(isZh ? "可配置" : "Configurable", "available"),
            )}
            <div className="settings-block">
              <div className="settings-block-title"><Network size={15} /><span>{isZh ? "全局代理" : "Global proxy"}</span></div>
              <label className="switch-row">
                <input type="checkbox" checked={settings.proxyEnabled} onChange={(event) => updateSettings({ proxyEnabled: event.target.checked })} />
                <span>{isZh ? "外部 HTTP 请求走代理" : "Route external HTTP requests through proxy"}</span>
              </label>
              <div className="settings-grid">
                <label>{isZh ? "代理 URL" : "Proxy URL"}<input value={settings.proxyUrl} onChange={(event) => updateSettings({ proxyUrl: event.target.value })} placeholder="http://127.0.0.1:7890" /></label>
                <label>{isZh ? "本地地址绕过" : "Bypass local"}<select value={settings.proxyBypassLocal ? "yes" : "no"} onChange={(event) => updateSettings({ proxyBypassLocal: event.target.value === "yes" })}><option value="yes">{isZh ? "是" : "Yes"}</option><option value="no">{isZh ? "否" : "No"}</option></select></label>
              </div>
            </div>
            <div className="settings-block">
              <div className="settings-block-title"><Network size={15} /><span>{isZh ? "Layout API" : "Layout API"}</span></div>
              <label className="field-label">
                {isZh ? "解析 API 地址" : "Parser API URL"}
                <input
                  value={settings.layoutParsingApiUrl}
                  onChange={(event) => updateSettings({ layoutParsingApiUrl: event.target.value })}
                  placeholder="http://127.0.0.1:8000"
                />
              </label>
            </div>
            {renderParserBlock()}
          </div>
        );
      case "source-watch":
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.nav["source-watch"],
              isZh ? "先稳定手动 Refresh / Plan；本地监控当前仅作为规则预览，不会后台 ingest。" : "Manual Refresh / Plan comes first; local watching is currently a rule preview and will not ingest in the background.",
              sectionStatus(isZh ? "Plan-only" : "Plan-only", "available"),
            )}
            <div className="settings-block">
              <div className="settings-block-title"><ShieldCheck size={15} /><span>{isZh ? "导入模式" : "Import mode"}</span></div>
              <label className="switch-row">
                <input type="checkbox" checked={settings.sourceWatchEnabled} onChange={(event) => updateSettings({ sourceWatchEnabled: event.target.checked })} />
                <span>{isZh ? "保存本地资料监控规则（不自动执行）" : "Save local source watch rules (no automatic execution)"}</span>
              </label>
              <label className="switch-row">
                <input type="checkbox" checked={false} disabled />
                <span>{isZh ? "自动 ingest 已延后：新增/修改/删除只应生成 plan event" : "Auto-ingest is deferred: new, changed, or deleted files should only create plan events"}</span>
              </label>
              <label className="field-label">
                {isZh ? "默认导入模式" : "Default ingest mode"}
                <select value={settings.defaultIngestMode} onChange={(event) => updateSettings({ defaultIngestMode: event.target.value })}>
                  <option value="inbox_only">{isZh ? "只进入 raw inbox，不自动排队" : "Raw inbox only, do not enqueue"}</option>
                  <option value="enqueue_after_import">{isZh ? "导入后加入待处理队列" : "Enqueue after import"}</option>
                </select>
              </label>
              <p className="settings-block-copy">
                {isZh ? "当前阶段不启动后台 watcher，不调用 parser/runtime，不联网，也不会清理 source/concept 页面；请用 Raw Sources 的 Refresh / Plan 验证状态。" : "This phase does not start a background watcher, call parser/runtime, use the network, or clean source/concept pages; use Raw Sources Refresh / Plan to verify state."}
              </p>
            </div>
            <div className="settings-block">
              <div className="settings-block-title"><History size={15} /><span>{isZh ? "类型和排除规则" : "Types and exclusions"}</span></div>
              <div className="settings-grid">
                <label>{isZh ? "允许扩展名" : "Allowed extensions"}<textarea rows={2} value={settings.sourceWatchAllowedExtensions} onChange={(event) => updateSettings({ sourceWatchAllowedExtensions: event.target.value })} /></label>
                <label>{isZh ? "最大文件大小 MB" : "Max file size MB"}<input type="number" min={1} value={settings.sourceWatchMaxFileSizeMb} onChange={(event) => updateNumberSetting("sourceWatchMaxFileSizeMb", event.target.value, 100)} /></label>
                <label>{isZh ? "排除文件夹" : "Excluded folders"}<textarea rows={2} value={settings.sourceWatchExcludeDirs} onChange={(event) => updateSettings({ sourceWatchExcludeDirs: event.target.value })} /></label>
                <label>{isZh ? "排除扩展名" : "Excluded extensions"}<textarea rows={2} value={settings.sourceWatchExcludeExtensions} onChange={(event) => updateSettings({ sourceWatchExcludeExtensions: event.target.value })} /></label>
                <label>{isZh ? "排除文件名模式" : "Excluded filename patterns"}<textarea rows={2} value={settings.sourceWatchExcludeGlobs} onChange={(event) => updateSettings({ sourceWatchExcludeGlobs: event.target.value })} /></label>
              </div>
              <div className="settings-notice">
                {isZh ? "当前桌面端保存这些规则，Raw Sources/Import 可按这些配置继续接入；不会扫描 vault 外路径或修改 raw evidence。" : "The desktop app saves these rules for Raw Sources/Import integration. It must not scan outside the vault or mutate raw evidence."}
              </div>
            </div>
          </div>
        );
      case "scheduled-import":
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.nav["scheduled-import"],
              isZh ? "配置周期扫描目录、导入间隔和手动扫描入口。" : "Configure periodic scan directory, interval, and manual scan entry.",
              sectionStatus(settings.scheduledImportEnabled ? (isZh ? "已启用配置" : "Config enabled") : (isZh ? "关闭" : "Off"), settings.scheduledImportEnabled ? "available" : "disabled"),
            )}
            <div className="settings-block">
              <div className="settings-block-title"><History size={15} /><span>{isZh ? "定时导入" : "Scheduled import"}</span></div>
              <label className="switch-row">
                <input type="checkbox" checked={settings.scheduledImportEnabled} onChange={(event) => updateSettings({ scheduledImportEnabled: event.target.checked })} />
                <span>{isZh ? "启用定时导入配置" : "Enable scheduled import config"}</span>
              </label>
              <div className="settings-grid">
                <label>{isZh ? "监控目录" : "Monitor directory"}<input value={settings.scheduledImportPath} onChange={(event) => updateSettings({ scheduledImportPath: event.target.value })} placeholder="raw/inbox" /></label>
                <label>{isZh ? "扫描间隔（分钟）" : "Scan interval minutes"}<input type="number" min={1} max={1440} value={settings.scheduledImportIntervalMinutes} onChange={(event) => updateNumberSetting("scheduledImportIntervalMinutes", event.target.value, 60)} /></label>
              </div>
              <button type="button" disabled>
                <RefreshCw size={14} />
                {isZh ? "立即扫描（后台执行器未接入）" : "Scan now (runner not wired)"}
              </button>
              <div className="settings-notice">
                {isZh ? "配置会被保存；自动后台调度仍需接入 vault-scoped 任务队列，因此这里不会假装已经创建系统级定时任务。" : "The config is saved. Automatic background scheduling still needs a vault-scoped job queue, so this does not pretend to create a system scheduler."}
              </div>
            </div>
          </div>
        );
      case "output":
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.nav.output,
              isZh ? "控制回答、报告和写回后的验证输出。" : "Controls answer, report, and post-writeback validation output.",
              sectionStatus(isZh ? "可配置" : "Configurable", "available"),
            )}
            <div className="settings-block">
              <div className="settings-block-title"><FileText size={15} /><span>{isZh ? "输出偏好" : "Output preferences"}</span></div>
              <label className="field-label">
                {isZh ? "AI 输出语言" : "AI output language"}
                <input
                  value={settings.aiOutputLanguage}
                  onChange={(event) => updateSettings({ aiOutputLanguage: event.target.value })}
                  placeholder={isZh ? "中文 / English" : "English / Chinese"}
                />
              </label>
              <label className="field-label">
                {isZh ? "对话历史长度" : "Conversation history length"}
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={settings.chatHistoryMessages}
                  onChange={(event) => updateNumberSetting("chatHistoryMessages", event.target.value, 8)}
                />
              </label>
              <label className="switch-row">
                <input type="checkbox" checked={settings.autoRunLintAfterWrites} onChange={(event) => updateSettings({ autoRunLintAfterWrites: event.target.checked })} />
                <span>{isZh ? "写回后自动运行 lint" : "Run lint automatically after writeback"}</span>
              </label>
              <label className="switch-row">
                <input type="checkbox" checked={settings.autoOpenReportsAfterFailures} onChange={(event) => updateSettings({ autoOpenReportsAfterFailures: event.target.checked })} />
                <span>{isZh ? "失败后自动打开报告" : "Open reports automatically after failures"}</span>
              </label>
            </div>
          </div>
        );
      case "interface":
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.nav.interface,
              isZh ? "控制桌面端语言和 Obsidian 集成体验。" : "Controls desktop language and Obsidian integration behavior.",
              sectionStatus(isZh ? "可配置" : "Configurable", "available"),
            )}
            <div className="settings-block">
              <div className="settings-block-title"><Paintbrush size={15} /><span>{isZh ? "界面语言" : "Interface language"}</span></div>
              <div className="settings-grid">
                <label>{isZh ? "当前语言" : "Current language"}<input value={languageName(language)} readOnly /></label>
                <label>{isZh ? "Obsidian Profile" : "Obsidian profile"}
                  <select value={settings.defaultObsidianProfile} onChange={(event) => updateSettings({ defaultObsidianProfile: event.target.value })}>
                    <option value="minimal">minimal</option>
                    <option value="research">research</option>
                    <option value="full">full</option>
                  </select>
                </label>
                <label>{isZh ? "界面密度" : "Interface density"}
                  <select value={settings.interfaceDensity} onChange={(event) => updateSettings({ interfaceDensity: event.target.value })}>
                    <option value="comfortable">{isZh ? "舒适" : "Comfortable"}</option>
                    <option value="compact">{isZh ? "紧凑" : "Compact"}</option>
                  </select>
                </label>
              </div>
              {onToggleLanguage && (
                <button onClick={onToggleLanguage}>
                  <Globe size={15} />
                  {text.switchLanguage}: {languageName(language)}
                </button>
              )}
              <label className="switch-row">
                <input type="checkbox" checked={settings.skipObsidianPluginDownloads} onChange={(event) => updateSettings({ skipObsidianPluginDownloads: event.target.checked })} />
                <span>{isZh ? "跳过 Obsidian 插件下载" : "Skip Obsidian plugin downloads"}</span>
              </label>
            </div>
          </div>
        );
      case "maintenance":
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.nav.maintenance,
              isZh ? "运行时路径、命令、重试和超时设置。" : "Runtime paths, commands, retry, and timeout settings.",
              sectionStatus(isZh ? "可配置" : "Configurable", "available"),
            )}
            {renderRuntimeBlock()}
            <div className="settings-block">
              <div className="settings-block-title"><Settings size={15} /><span>{isZh ? "任务控制" : "Job controls"}</span></div>
              <div className="settings-grid">
                <label>{isZh ? "重试次数" : "Retry count"}<input type="number" min={0} max={10} value={settings.retryCount} onChange={(event) => updateSettings({ retryCount: Number(event.target.value) })} /></label>
                <label>{isZh ? "超时秒数" : "Timeout seconds"}<input type="number" min={10} max={7200} value={settings.timeoutSeconds} onChange={(event) => updateSettings({ timeoutSeconds: Number(event.target.value) })} /></label>
              </div>
            </div>
            {renderParserBlock()}
          </div>
        );
      case "changelog":
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.nav.changelog,
              isZh ? "当前桌面端最近的产品化变更。" : "Recent productization changes in the desktop app.",
              sectionStatus("0.1.0", "available"),
              false,
            )}
            <div className="settings-block">
              <div className="settings-block-title"><Sparkles size={15} /><span>{isZh ? "最近更新" : "Recent changes"}</span></div>
              <ul className="settings-change-list">
                <li>{isZh ? "大语言模型默认保持关闭；本地 CLI 需要检查通过后才能启用。" : "LLM providers start disabled by default; local CLIs must pass a check before they can be enabled."}</li>
                <li>{isZh ? "托管 API provider 可配置和启用；只保存 Base URL 与环境变量名，不保存 API key 明文。" : "Hosted API providers can be configured and enabled; only Base URL and environment variable names are saved, never API key values."}</li>
                <li>{isZh ? "Provider 目录补齐国内主流厂商，并保存 OpenAI / Anthropic / Native 协议类型。" : "The provider catalog now covers major China-region vendors and saves OpenAI / Anthropic / Native protocol types."}</li>
                <li>{isZh ? "设置分区拆分为对应页面；未实现能力明确显示为预留。" : "Settings sections now show distinct pages; unavailable capabilities are clearly marked reserved."}</li>
              </ul>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <section className={classNames("settings-center panel", className)}>
      <aside className="settings-subnav" aria-label="Settings sections">
        <div className="settings-subnav-title">
          <Settings size={16} />
          {text.settings}
        </div>
        {settingsNav.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}>
              <Icon size={15} />
              <span>{text.nav[item.id]}</span>
            </button>
          );
        })}
      </aside>

      <main className="settings-content">
        {section === "llm" && (
          <div className="llm-models-page">
            <div className="settings-page-head">
              <div>
                <h2>{text.llmTitle}</h2>
                <p>{text.llmSubtitle}</p>
                <p className="settings-muted">{center.activeProviderId ? `${language === "zh" ? "当前提供方" : "Active provider"}: ${providers.find((item) => item.id === center.activeProviderId)?.name ?? center.activeProviderId}` : text.noProvider}</p>
              </div>
              <button onClick={onSaveSettings} disabled={saveDisabled}>
                <Check size={15} />
                {text.save}
              </button>
            </div>

            <div className="provider-list">
              {providers.map((provider) => {
                const config = center.providers[provider.id] ?? defaultProviderConfig(provider.id);
                const cliCheck = cliChecks[provider.id];
                const apiCheck = apiChecks[provider.id];
                const isLocal = provider.kind === "local";
                const persistedCliAvailable = Boolean(config.cliAvailable);
                const localApiReady = isLocalApiEndpoint(config.apiBaseUrl);
                const canEnable = isLocal ? Boolean(cliCheck?.available || persistedCliAvailable) : Boolean(apiCheck?.available || apiProviderReady(config));
                const status = isLocal
                  ? checkingCli === provider.id
                    ? text.checking
                    : cliCheck
                    ? cliCheck.available ? text.detected : text.notFound
                    : persistedCliAvailable ? text.detected : text.needsCheck
                  : checkingApi === provider.id
                    ? text.checking
                    : apiCheck
                      ? apiCheck.available ? (localApiReady ? text.localEndpointReady : text.keyPresent) : text.keyMissing
                      : config.enabled
                        ? text.enabled
                        : apiProviderReady(config) ? (localApiReady ? text.localEndpointReady : text.keyPresent) : text.configurable;
                return (
                  <article key={provider.id} className={classNames("provider-card", config.enabled && "enabled", config.expanded && "expanded")}>
                    <div className="provider-row">
                      <button className="provider-row-main-button" type="button" onClick={() => toggleExpanded(provider.id)} aria-expanded={config.expanded}>
                        <span className="provider-chevron">{config.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                        <span>
                          <strong>{provider.name}</strong>
                          <em>{language === "zh" ? provider.subtitleZh : provider.subtitle}</em>
                        </span>
                      </button>
                      <span className={classNames("provider-status", config.enabled && "active", ((cliCheck && !cliCheck.available) || (apiCheck && !apiCheck.available)) && "danger")}>{status}</span>
                      {isLocal && !canEnable ? (
                        <button
                          className="provider-inline-action"
                          type="button"
                          onClick={() => runCliCheck(provider.id as "codex-cli" | "claude-code", provider.command)}
                          disabled={checkingCli === provider.id}
                        >
                          <RefreshCw size={14} />
                          {text.checkAndEnable}
                        </button>
                      ) : (
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={config.enabled}
                            disabled={!canEnable}
                            onChange={(event) => toggleProvider(provider.id, event.target.checked)}
                          />
                          <span />
                        </label>
                      )}
                    </div>

                    {config.expanded && (
                      <div className="provider-expanded">
                        {isLocal ? (
                          <div className="cli-status-grid">
                            <div>
                              <span>{text.cliStatus}</span>
                              <strong>{cliCheck ? (cliCheck.available ? text.available : text.missing) : config.cliAvailable ? text.available : text.notChecked}</strong>
                            </div>
                            <div>
                              <span>{text.detectedVersion}</span>
                              <strong>{cliCheck?.version || config.cliVersion || "unknown"}</strong>
                            </div>
                            <div>
                              <span>{text.path}</span>
                              <code>{cliCheck?.path || config.cliPath ? visiblePath(cliCheck?.path || config.cliPath || "") : text.pathPending}</code>
                            </div>
                            <button
                              onClick={() => runCliCheck(provider.id as "codex-cli" | "claude-code", provider.command)}
                              disabled={checkingCli === provider.id}
                            >
                              <RefreshCw size={14} />
                              {canEnable ? text.recheck : text.checkAndEnable}
                            </button>
                          </div>
                        ) : (
                          <div className="api-config-panel">
                            <div className="api-provider-note">
                              <KeyRound size={15} />
                              {text.apiPlaceholder}
                            </div>
                            <div className="api-protocol-row">
                              <span>{text.apiProtocol}</span>
                              {[
                                ["openai-compatible", text.openaiCompatible],
                                ["anthropic-compatible", text.anthropicCompatible],
                                ["native", text.nativeProtocol],
                              ].map(([value, label]) => (
                                <button
                                  key={value}
                                  type="button"
                                  className={config.apiProtocol === value ? "active" : ""}
                                  onClick={() => updateProvider(provider.id, { apiProtocol: value })}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            <div className="api-config-grid">
                              <label className="field-label">
                                {text.apiBaseUrl}
                                <input
                                  value={config.apiBaseUrl || ""}
                                  onChange={(event) => updateProvider(provider.id, { apiBaseUrl: event.target.value })}
                                  placeholder={"defaultApiBaseUrl" in provider ? provider.defaultApiBaseUrl : "https://api.example.com/v1"}
                                />
                              </label>
                              <label className="field-label">
                                {text.apiKeyEnvVar}
                                <input
                                  value={config.apiKeyEnvVar || ""}
                                  onChange={(event) => updateProvider(provider.id, { apiKeyEnvVar: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })}
                                  placeholder={"defaultApiKeyEnvVar" in provider ? provider.defaultApiKeyEnvVar : "PROVIDER_API_KEY"}
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => runApiKeyCheck(provider.id)}
                                disabled={checkingApi === provider.id || (!config.apiKeyEnvVar?.trim() && !localApiReady)}
                              >
                                <RefreshCw size={14} />
                                {text.checkKeyAndEnable}
                              </button>
                            </div>
                            <div className={classNames("settings-notice", apiCheck && !apiCheck.available && "danger")}>
                              {apiCheck?.message || `${text.apiKeyHint} ${text.protocolHint}`}
                            </div>
                          </div>
                        )}
                        {isLocal && !canEnable && (
                          <div className="api-provider-note">
                            <Info size={15} />
                            {text.selectAfterCheck}
                          </div>
                        )}

                        <div className="model-chip-row">
                          {provider.models.map((model) => (
                            <button
                              type="button"
                              key={model}
                              className={config.selectedModel === model ? "active" : ""}
                              onClick={() => updateProvider(provider.id, { selectedModel: model })}
                            >
                              {model}
                            </button>
                          ))}
                        </div>

                        <div className="provider-controls">
                          <label className="field-label">
                            {text.customModel}
                            <input
                              value={config.customModel}
                              onChange={(event) => updateProvider(provider.id, { customModel: event.target.value })}
                              placeholder={text.optionalOverride}
                            />
                          </label>
                          <label className="field-label">
                            {text.contextWindow}: {config.contextWindow.toLocaleString()} {language === "zh" ? "令牌" : "tokens"}
                            <input
                              type="range"
                              min={8192}
                              max={256000}
                              step={8192}
                              value={config.contextWindow}
                              onChange={(event) => updateProvider(provider.id, { contextWindow: Number(event.target.value) })}
                            />
                          </label>
                          <div className="reasoning-picker" aria-label={text.reasoning}>
                            <span className="control-caption">{text.reasoning}</span>
                            {["fast", "balanced", "deep"].map((mode) => (
                              <button
                                key={mode}
                                type="button"
                                className={config.reasoningMode === mode ? "active" : ""}
                                onClick={() => updateProvider(provider.id, { reasoningMode: mode })}
                              >
                                {language === "zh"
                                  ? ({ fast: "快速", balanced: "平衡", deep: text.deepThinking } as Record<string, string>)[mode]
                                  : mode}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {section !== "llm" && section !== "about" && renderSettingsSection()}

        {section === "about" && (
          <div className="about-page">
            <BrandMark size={92} />
            <h2>LLM Wiki</h2>
            <p>Version 0.1.0</p>
            <a href="https://github.com/Aidenwu0209/llm-wiki-desktop">github.com/Aidenwu0209/llm-wiki-desktop</a>
            <div className="about-boundary">
              <Cpu size={18} />
            <span>{text.aboutBoundary}</span>
          </div>
          {onToggleLanguage && (
            <button onClick={onToggleLanguage}>
              <Globe size={15} />
              {text.switchLanguage}: {languageName(language)}
            </button>
          )}
          <button onClick={onSaveSettings} disabled={saveDisabled}>
            <Check size={15} />
            {text.save}
            </button>
          </div>
        )}
      </main>
    </section>
  );
}
