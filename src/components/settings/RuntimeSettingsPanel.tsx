import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
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
import type {
  AgentReadApiReadiness,
  AgentReadApiServerInfo,
  DesktopSettings,
  LlmApiKeyCheckResult,
  LlmCliCheckResult,
  LlmProviderCenterSettings,
  LlmProviderConfig,
  LlmProviderTestResult,
  OcrParserSettings,
  OcrParserStatus,
  OcrParserTestResult,
} from "../../types";
import { languageName, type UiLanguage } from "../../i18n";
import { isLoopbackHttpEndpoint } from "../../lib/local-endpoints";
import {
  PADDLEOCR_VL15_API_KEY_ENV,
  PADDLEOCR_VL15_DEFAULT_ENDPOINT,
  PADDLEOCR_VL15_DEFAULT_MODEL,
  PADDLEOCR_VL15_PROVIDER_ID,
  paddleOcrVl15Provider,
  providerAdapters,
  providerIdAliases,
} from "../../lib/providers/catalog";
import {
  agentReadApiReadiness,
  checkLlmApiKey,
  checkLocalLlmCli,
  checkPaddleOcrVl15Config,
  isTauriAvailable,
  startAgentReadApi,
  stopAgentReadApi,
  testErnieChat,
  testPaddleOcrVl15Connection,
  testPaddleOcrVl15Parser,
} from "../../tauri";
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
  onPlanIngest: () => void;
  onToggleLanguage?: () => void;
};

type SettingsSection =
  | "llm"
  | "embeddings"
  | "captioning"
  | "ocr-parser"
  | "web-search"
  | "network"
  | "agent-api"
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
  { id: "ocr-parser", label: "OCR Parser", icon: FileText },
  { id: "web-search", label: "Web Search", icon: Search },
  { id: "network", label: "Network", icon: Network },
  { id: "agent-api", label: "Agent API", icon: TerminalSquare },
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
      "ocr-parser": "OCR 解析器",
      "web-search": "网页搜索",
      network: "网络",
      "agent-api": "Agent API",
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
    testConnection: "测试连接",
    notConfigured: "未配置",
    lastChecked: "上次检查",
    errorDetails: "错误详情",
    apiKeySource: "API key 来源",
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
    ocrProvider: "OCR Provider",
    ocrTitle: "OCR 解析器",
    ocrSubtitle: "配置 PaddleOCR-VL-1.5 的服务地址、模型和环境变量。PDF / 图片默认优先使用该 parser；未配置时 ingest plan 会明确阻塞，不会上传 raw document。",
    ocrEnable: "启用 PaddleOCR-VL-1.5 配置",
    ocrEndpoint: "Endpoint / Service URL",
    ocrEndpointPlaceholder: "https://your-paddleocr-service.example.com/v1",
    ocrModel: "模型",
    ocrStatus: "状态",
    testParser: "测试解析器",
    dryRun: "Dry run",
    noRawUpload: "Test parser 只验证配置和 key 可见性，不上传 raw document，也不会写回知识库。真实解析只会在启用 OCR Parser、配置 endpoint 且进程可见 PADDLEOCR_API_KEY 后运行。",
    statusMissingKey: "missing_key",
    statusMissingEndpoint: "missing_endpoint",
    statusReady: "ready",
    statusConnectionFailed: "connection_failed",
    statusParserFailed: "parser_failed",
    statusArtifactValid: "artifact_valid",
    statusArtifactInvalid: "artifact_invalid",
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
    testConnection: "Test connection",
    notConfigured: "Not configured",
    lastChecked: "Last checked",
    errorDetails: "Error details",
    apiKeySource: "API key source",
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
    ocrProvider: "OCR provider",
    ocrTitle: "OCR Parser",
    ocrSubtitle: "Configure the PaddleOCR-VL-1.5 service URL, model, and environment variable. PDF / image parsing defaults to this parser; the ingest plan blocks clearly until it is configured and never uploads raw documents while unconfigured.",
    ocrEnable: "Enable PaddleOCR-VL-1.5 config",
    ocrEndpoint: "Endpoint / Service URL",
    ocrEndpointPlaceholder: "https://your-paddleocr-service.example.com/v1",
    ocrModel: "Model",
    ocrStatus: "Status",
    testParser: "Test parser",
    dryRun: "Dry run",
    noRawUpload: "Test parser only validates config and key visibility. It does not upload raw documents or write back to the vault. Real parsing runs only after OCR Parser is enabled, an endpoint is configured, and PADDLEOCR_API_KEY is visible to the desktop process.",
    statusMissingKey: "missing_key",
    statusMissingEndpoint: "missing_endpoint",
    statusReady: "ready",
    statusConnectionFailed: "connection_failed",
    statusParserFailed: "parser_failed",
    statusArtifactValid: "artifact_valid",
    statusArtifactInvalid: "artifact_invalid",
    aboutBoundary: "Local-first desktop shell. Runtime-first execution. Evidence-backed research. Proposal-first writeback with approval gate.",
    switchLanguage: "Interface language",
  },
} as const;

const providers = providerAdapters;

function visiblePath(path: string) {
  return path.replace(/ +(?=\/|$)/g, (match) => "[space]".repeat(match.length));
}

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function apiProviderReady(config: LlmProviderConfig) {
  return Boolean(config.apiKeyConfigured || isLoopbackHttpEndpoint(config.apiBaseUrl));
}

function defaultProviderConfig(providerId: string): LlmProviderConfig {
  const provider = providers.find((item) => item.id === providerId);
  return {
    enabled: false,
    expanded: false,
    selectedModel: provider?.models[0] ?? "default",
    customModel: "",
    contextWindow: provider?.defaultContextWindow ?? (provider?.kind === "local" ? 128000 : 64000),
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

function defaultOcrParserSettings(): OcrParserSettings {
  return {
    enabled: false,
    providerId: PADDLEOCR_VL15_PROVIDER_ID,
    endpoint: PADDLEOCR_VL15_DEFAULT_ENDPOINT,
    apiKeyEnvVar: PADDLEOCR_VL15_API_KEY_ENV,
    model: PADDLEOCR_VL15_DEFAULT_MODEL,
  };
}

function normalizeOcrParserSettings(settings: DesktopSettings): OcrParserSettings {
  return {
    ...defaultOcrParserSettings(),
    ...(settings.ocrParser || {}),
    apiKeyEnvVar: PADDLEOCR_VL15_API_KEY_ENV,
    model: settings.ocrParser?.model?.trim() || PADDLEOCR_VL15_DEFAULT_MODEL,
  };
}

function desktopShellUnavailableOcrResult(ocrParser: OcrParserSettings, parserDryRun: boolean): OcrParserTestResult {
  return {
    provider: PADDLEOCR_VL15_PROVIDER_ID,
    model: ocrParser.model || PADDLEOCR_VL15_DEFAULT_MODEL,
    status: "missing_key",
    checkedAt: new Date().toISOString(),
    message: "Desktop shell unavailable; PADDLEOCR_API_KEY can only be checked inside the Tauri desktop process.",
    errorCode: "desktop_unavailable",
    apiKeyEnv: PADDLEOCR_VL15_API_KEY_ENV,
    endpoint: ocrParser.endpoint || "",
    latencyMs: null,
    parserDryRun,
  };
}

function normalizeProviderSettings(settings: DesktopSettings): LlmProviderCenterSettings {
  const current = settings.llmProviderCenter || { activeProviderId: null, providers: {} };
  const knownProviderIds: string[] = providers.map((item) => item.id);
  const mappedActiveProviderId = current.activeProviderId
    ? providerIdAliases[current.activeProviderId] || current.activeProviderId
    : null;
  const activeProviderId = mappedActiveProviderId && knownProviderIds.includes(mappedActiveProviderId)
    ? mappedActiveProviderId
    : null;
  const normalized = { ...current.providers };
  for (const provider of providers) {
    const aliasId = Object.entries(providerIdAliases).find(([, target]) => target === provider.id)?.[0];
    const saved = normalized[provider.id] || (aliasId ? normalized[aliasId] : undefined);
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
  onPlanIngest,
  onToggleLanguage,
}: RuntimeSettingsPanelProps) {
  const text = settingsCopy[language];
  const [section, setSection] = useState<SettingsSection>("llm");
  const [cliChecks, setCliChecks] = useState<Record<string, LlmCliCheckResult | null>>({});
  const [apiChecks, setApiChecks] = useState<Record<string, LlmApiKeyCheckResult | null>>({});
  const [providerTests, setProviderTests] = useState<Record<string, LlmProviderTestResult | null>>({});
  const [checkingCli, setCheckingCli] = useState<string | null>(null);
  const [checkingApi, setCheckingApi] = useState<string | null>(null);
  const [agentApiInfo, setAgentApiInfo] = useState<AgentReadApiServerInfo | null>(null);
  const [agentApiError, setAgentApiError] = useState<string | null>(null);
  const [agentApiBusy, setAgentApiBusy] = useState<"start" | "stop" | null>(null);
  const [agentReadiness, setAgentReadiness] = useState<AgentReadApiReadiness | null>(null);
  const [agentReadinessError, setAgentReadinessError] = useState<string | null>(null);
  const [checkingAgentReadiness, setCheckingAgentReadiness] = useState(false);
  const [ocrCheck, setOcrCheck] = useState<OcrParserTestResult | null>(null);
  const [ocrBusy, setOcrBusy] = useState<"config" | "connection" | "parser" | null>(null);
  const center = useMemo(() => normalizeProviderSettings(settings), [settings]);
  const ocrParser = useMemo(() => normalizeOcrParserSettings(settings), [settings]);

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

  const refreshAgentReadiness = async () => {
    if (!vaultPath) {
      setAgentReadiness(null);
      setAgentReadinessError(null);
      return;
    }
    setCheckingAgentReadiness(true);
    setAgentReadinessError(null);
    try {
      setAgentReadiness(await agentReadApiReadiness(vaultPath));
    } catch (err) {
      setAgentReadiness(null);
      setAgentReadinessError(String(err));
    } finally {
      setCheckingAgentReadiness(false);
    }
  };

  useEffect(() => {
    if (section !== "agent-api") return;
    let cancelled = false;
    if (!vaultPath) {
      setAgentReadiness(null);
      setAgentReadinessError(null);
      setCheckingAgentReadiness(false);
      return;
    }
    setCheckingAgentReadiness(true);
    setAgentReadinessError(null);
    agentReadApiReadiness(vaultPath)
      .then((result) => {
        if (!cancelled) setAgentReadiness(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setAgentReadiness(null);
          setAgentReadinessError(String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingAgentReadiness(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section, vaultPath]);

  useEffect(() => {
    if (section !== "ocr-parser") return;
    let cancelled = false;
    if (!isTauriAvailable()) {
      setOcrCheck(desktopShellUnavailableOcrResult(ocrParser, false));
      setOcrBusy(null);
      return;
    }
    setOcrBusy("config");
    checkPaddleOcrVl15Config(ocrParser)
      .then((result) => {
        if (!cancelled) setOcrCheck(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setOcrCheck({
            provider: PADDLEOCR_VL15_PROVIDER_ID,
            model: ocrParser.model || PADDLEOCR_VL15_DEFAULT_MODEL,
            status: "parser_failed",
            checkedAt: new Date().toISOString(),
            message: String(err),
            errorCode: "config_error",
            apiKeyEnv: PADDLEOCR_VL15_API_KEY_ENV,
            endpoint: ocrParser.endpoint || "",
            latencyMs: null,
            parserDryRun: false,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setOcrBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [section, ocrParser.endpoint, ocrParser.model, ocrParser.apiKeyEnvVar]);

  const handleStartAgentApi = async () => {
    if (!vaultPath) return;
    setAgentApiBusy("start");
    setAgentApiError(null);
    try {
      setAgentApiInfo(await startAgentReadApi(vaultPath));
      await refreshAgentReadiness();
    } catch (err) {
      setAgentApiError(String(err));
      await refreshAgentReadiness();
    } finally {
      setAgentApiBusy(null);
    }
  };

  const handleStopAgentApi = async () => {
    setAgentApiBusy("stop");
    setAgentApiError(null);
    try {
      setAgentApiInfo(await stopAgentReadApi());
      await refreshAgentReadiness();
    } catch (err) {
      setAgentApiError(String(err));
    } finally {
      setAgentApiBusy(null);
    }
  };

  const copyAgentApiValue = async (value?: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setAgentApiError(value);
    }
  };

  const runCliCheck = async (providerId: "local-codex" | "local-claude", command: "codex" | "claude") => {
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
    if (providerId === "ernie-ai-studio") {
      setCheckingApi(providerId);
      try {
        const model = config.customModel.trim() || config.selectedModel || "ernie-5.1";
        const result = await testErnieChat(model);
        setProviderTests((current) => ({ ...current, [providerId]: result }));
        const available = result.status === "ready";
        setApiChecks((current) => ({
          ...current,
          [providerId]: {
            providerId,
            envVar: result.apiKeyEnv,
            available,
            message: result.message,
          },
        }));
        const nextProviders = Object.fromEntries(
          Object.entries(center.providers).map(([id, value]) => [
            id,
            {
              ...value,
              enabled: available
                ? id === providerId
                : id !== providerId && id === center.activeProviderId,
              ...(id === providerId
                ? {
                    selectedModel: result.model || value.selectedModel,
                    apiKeyEnvVar: result.apiKeyEnv,
                    apiBaseUrl: result.baseUrl,
                    apiKeyConfigured: available,
                    apiKeyCheckedAt: result.checkedAt,
                  }
                : {}),
            },
          ]),
        );
        updateCenter({
          activeProviderId: available
            ? providerId
            : center.activeProviderId === providerId ? null : center.activeProviderId,
          providers: nextProviders,
        });
      } catch (err) {
        const message = String(err).replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
        setProviderTests((current) => ({
          ...current,
          [providerId]: {
            provider: "ernie-ai-studio",
            model: config.selectedModel,
            status: "unknown",
            latencyMs: null,
            usage: null,
            checkedAt: new Date().toISOString(),
            message,
            errorCode: "unknown",
            apiKeyEnv: "AI_STUDIO_API_KEY",
            baseUrl: config.apiBaseUrl || "https://aistudio.baidu.com/llm/lmapi/v3",
            models: [],
          },
        }));
        updateProvider(providerId, {
          enabled: false,
          apiKeyConfigured: false,
          apiKeyCheckedAt: new Date().toISOString(),
        });
      } finally {
        setCheckingApi(null);
      }
      return;
    }
    if (isLoopbackHttpEndpoint(config.apiBaseUrl)) {
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

  const updateOcrParser = (patch: Partial<OcrParserSettings>) => {
    updateSettings({
      ocrParser: {
        ...ocrParser,
        ...patch,
        apiKeyEnvVar: PADDLEOCR_VL15_API_KEY_ENV,
      },
    });
  };

  const updateNumberSetting = (key: keyof DesktopSettings, value: string, fallback = 0) => {
    const parsed = Number(value);
    updateSettings({ [key]: Number.isFinite(parsed) ? parsed : fallback } as Partial<DesktopSettings>);
  };

  const runOcrCheck = async (kind: "connection" | "parser") => {
    if (!isTauriAvailable()) {
      setOcrCheck(desktopShellUnavailableOcrResult(ocrParser, kind === "parser"));
      setOcrBusy(null);
      return;
    }
    setOcrBusy(kind);
      try {
        const result = kind === "connection"
          ? await testPaddleOcrVl15Connection(ocrParser)
          : await testPaddleOcrVl15Parser(ocrParser);
        setOcrCheck(result);
      } catch (err) {
        setOcrCheck({
          provider: PADDLEOCR_VL15_PROVIDER_ID,
          model: ocrParser.model || PADDLEOCR_VL15_DEFAULT_MODEL,
          status: kind === "parser" ? "parser_failed" : "connection_failed",
          checkedAt: new Date().toISOString(),
          message: String(err),
          errorCode: "test_error",
        apiKeyEnv: PADDLEOCR_VL15_API_KEY_ENV,
        endpoint: ocrParser.endpoint || "",
        latencyMs: null,
        parserDryRun: kind === "parser",
      });
    } finally {
      setOcrBusy(null);
    }
  };

  const sectionStatus = (label: string, tone: "available" | "reserved" | "disabled" = "reserved") => (
    <span className={classNames("settings-status-pill", tone)}>{label}</span>
  );

  const ocrStatusLabel = (status?: OcrParserStatus | null) => {
    switch (status) {
      case "ready":
        return text.statusReady;
      case "connection_failed":
        return text.statusConnectionFailed;
      case "missing_endpoint":
        return text.statusMissingEndpoint;
      case "parser_failed":
        return text.statusParserFailed;
      case "artifact_valid":
        return text.statusArtifactValid;
      case "artifact_invalid":
        return text.statusArtifactInvalid;
      case "missing_key":
      default:
        return text.statusMissingKey;
    }
  };

  const ocrStatusTone = (status?: OcrParserStatus | null) => (
    status === "ready" || status === "artifact_valid" ? "available" : "disabled"
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
          <option value={PADDLEOCR_VL15_PROVIDER_ID}>PaddleOCR-VL-1.5 / OCR-first</option>
          <option value="auto">auto / local-first</option>
          <option value="local-text">local-text</option>
          <option value="layout-api">layout-api</option>
        </select>
      </label>
      {settings.defaultPdfParser === PADDLEOCR_VL15_PROVIDER_ID && (
        <div className={ocrParser.enabled ? "settings-notice" : "settings-notice danger"}>
          {ocrParser.enabled
            ? (isZh
              ? "PaddleOCR 会使用 OCR Parser 分区的 endpoint 和 PADDLEOCR_API_KEY；未通过配置检查时 ingest plan 会保持阻塞。"
              : "PaddleOCR uses the endpoint and PADDLEOCR_API_KEY from the OCR Parser section; the ingest plan remains blocked until the config is checkable.")
            : (isZh
              ? "已选择 PaddleOCR 默认解析器，但 OCR Parser 还未启用。请到 OCR Parser 分区配置，或显式切回 auto/local-text。"
              : "PaddleOCR is selected as the default parser, but OCR Parser is not enabled. Configure OCR Parser or explicitly switch back to auto/local-text.")}
        </div>
      )}
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
      case "ocr-parser": {
        const status = ocrBusy ? null : ocrCheck?.status ?? "missing_key";
        const connectionNoticeDanger = ["missing_key", "missing_endpoint", "connection_failed", "parser_failed", "artifact_invalid"].includes(
          ocrCheck?.status ?? "missing_key",
        );
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.ocrTitle,
              text.ocrSubtitle,
              sectionStatus(ocrBusy ? text.checking : ocrStatusLabel(status), ocrStatusTone(status)),
            )}
            <div className="settings-block">
              <div className="settings-block-title"><FileText size={15} /><span>{paddleOcrVl15Provider.name}</span></div>
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={ocrParser.enabled}
                  onChange={(event) => updateOcrParser({ enabled: event.target.checked })}
                />
                <span>{text.ocrEnable}</span>
              </label>
              <div className="settings-grid">
                <label>
                  {text.ocrProvider}
                  <input value={paddleOcrVl15Provider.displayName} readOnly />
                </label>
                <label>
                  {text.apiKeySource}
                  <input value={ocrParser.apiKeyEnvVar} readOnly />
                </label>
                <label>
                  {text.ocrModel}
                  <input
                    value={ocrParser.model}
                    onChange={(event) => updateOcrParser({ model: event.target.value })}
                    placeholder={PADDLEOCR_VL15_DEFAULT_MODEL}
                  />
                </label>
                <label>
                  {text.ocrEndpoint}
                  <input
                    value={ocrParser.endpoint}
                    onChange={(event) => updateOcrParser({ endpoint: event.target.value })}
                    placeholder={text.ocrEndpointPlaceholder}
                  />
                </label>
              </div>
              <div className="inline-actions">
                <button type="button" onClick={() => runOcrCheck("connection")} disabled={ocrBusy !== null}>
                  <RefreshCw size={14} />
                  {ocrBusy === "connection" ? text.checking : text.testConnection}
                </button>
                <button type="button" onClick={() => runOcrCheck("parser")} disabled={ocrBusy !== null}>
                  <FileText size={14} />
                  {ocrBusy === "parser" ? text.checking : text.testParser}
                </button>
              </div>
              <div className={classNames("settings-notice", connectionNoticeDanger && "danger")}>
                <strong>{text.ocrStatus}: {ocrBusy ? text.checking : ocrStatusLabel(status)}</strong>
                {ocrCheck?.checkedAt ? ` · ${text.lastChecked}: ${new Date(ocrCheck.checkedAt).toLocaleString()}` : ""}
                {ocrCheck?.latencyMs ? ` · ${ocrCheck.latencyMs} ms` : ""}
                {ocrCheck?.message ? ` · ${ocrCheck.message}` : ""}
              </div>
              <div className="settings-notice">
                <strong>{text.dryRun}.</strong> {text.noRawUpload}
              </div>
            </div>
          </div>
        );
      }
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
      case "agent-api": {
        const agentContractEndpoints = agentReadiness?.endpoints ?? agentApiInfo?.endpoints ?? [];
        const blockedOperations = agentReadiness?.blockedOperations ?? agentApiInfo?.blockedOperations ?? [];
        const gateLabel = agentApiInfo?.enabled
          ? isZh ? "运行中" : "Running"
          : checkingAgentReadiness
            ? isZh ? "检查中" : "Checking"
            : agentReadiness?.enabled
              ? isZh ? "Ready" : "Ready"
              : agentReadiness
                ? isZh ? "未就绪" : "Deferred"
                : isZh ? "关闭" : "Off";
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.nav["agent-api"],
              isZh ? "给 Codex / Claude Code 暴露只读、本地、带 token 的 vault 查询接口。" : "Expose a read-only, local, token-protected vault API for Codex / Claude Code.",
              sectionStatus(gateLabel, agentApiInfo?.enabled || agentReadiness?.enabled ? "available" : "disabled"),
            )}
            <div className="settings-block">
              <div className="settings-block-title"><TerminalSquare size={15} /><span>{isZh ? "本地只读 API" : "Local read API"}</span></div>
              <div className="inline-actions">
                <button type="button" onClick={handleStartAgentApi} disabled={!vaultPath || agentApiBusy === "start" || agentApiInfo?.enabled}>
                  <Network size={14} />
                  {agentApiBusy === "start" ? (isZh ? "启动中" : "Starting") : (isZh ? "启动 API" : "Start API")}
                </button>
                <button type="button" onClick={handleStopAgentApi} disabled={agentApiBusy === "stop" || !agentApiInfo?.enabled}>
                  <ShieldCheck size={14} />
                  {agentApiBusy === "stop" ? (isZh ? "停止中" : "Stopping") : (isZh ? "停止 API" : "Stop API")}
                </button>
              </div>
              <p className="settings-block-copy">
                {isZh
                  ? "启动前会检查 product scorecard；未通过 ingest plan、registry、traceability、evidence search 或 query writeback gate 时不会开放端口。"
                  : "Before opening a port, the app checks the product scorecard. It refuses to start until ingest plan, registry, traceability, evidence search, and query writeback gates pass."}
              </p>
              {agentApiInfo && (
                <div className="settings-grid">
                  <label>{isZh ? "Base URL" : "Base URL"}<input value={agentApiInfo.baseUrl} readOnly /></label>
                  <label>{isZh ? "Bearer token" : "Bearer token"}<input value={agentApiInfo.token ?? ""} readOnly /></label>
                  <button type="button" onClick={() => copyAgentApiValue(agentApiInfo.baseUrl)}>{isZh ? "复制 URL" : "Copy URL"}</button>
                  <button type="button" onClick={() => copyAgentApiValue(agentApiInfo.token)}>{isZh ? "复制 token" : "Copy token"}</button>
                </div>
              )}
              {agentApiError && <div className="settings-notice">{agentApiError}</div>}
            </div>
            <div className="settings-block">
              <div className="settings-block-title"><ShieldCheck size={15} /><span>{isZh ? "Readiness gate" : "Readiness gate"}</span></div>
              {!vaultPath ? (
                <div className="settings-notice">{isZh ? "先打开或创建知识库，再检查 Agent API readiness。" : "Open or create a vault before checking Agent API readiness."}</div>
              ) : (
                <>
                  <div className="settings-grid">
                    <label>{isZh ? "Gate" : "Gate"}<input value={agentReadiness?.enabled ? (isZh ? "可启动" : "ready") : (isZh ? "未就绪" : "deferred")} readOnly /></label>
                    <label>{isZh ? "Bind host" : "Bind host"}<input value={agentReadiness?.bindHost ?? "127.0.0.1"} readOnly /></label>
                    <label>{isZh ? "Token" : "Token"}<input value={agentReadiness?.tokenRequired ? (isZh ? "必须" : "required") : (isZh ? "未要求" : "not required")} readOnly /></label>
                    <label>{isZh ? "Scorecard" : "Scorecard"}<input value={agentReadiness?.scorecard ? `${agentReadiness.scorecard.passed} pass / ${agentReadiness.scorecard.failed} fail / ${agentReadiness.scorecard.manual} manual / ${agentReadiness.scorecard.notRun} not run` : isZh ? "未加载" : "not loaded"} readOnly /></label>
                  </div>
                  <p className="settings-block-copy">
                    {agentReadiness?.reason || agentReadinessError || (isZh ? "点击刷新查看 gate 状态。" : "Refresh to inspect the gate state.")}
                  </p>
                  {agentReadinessError && <div className="settings-notice danger">{agentReadinessError}</div>}
                  <div className="inline-actions">
                    <button type="button" onClick={refreshAgentReadiness} disabled={checkingAgentReadiness}>
                      <RefreshCw size={14} />
                      {checkingAgentReadiness ? (isZh ? "检查中" : "Checking") : (isZh ? "刷新状态" : "Refresh status")}
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="settings-block">
              <div className="settings-block-title"><ShieldCheck size={15} /><span>{isZh ? "必要指标" : "Required metrics"}</span></div>
              <div className="settings-list">
                {(agentReadiness?.requiredMetrics ?? []).map((metric) => (
                  <code key={metric}>{metric}</code>
                ))}
                {!agentReadiness?.requiredMetrics.length && <code>{isZh ? "刷新后显示必要指标。" : "Refresh to show required metrics."}</code>}
              </div>
            </div>
            <div className="settings-block">
              <div className="settings-block-title"><Info size={15} /><span>{isZh ? "未满足要求" : "Unmet requirements"}</span></div>
              <ul className="settings-change-list">
                {(agentReadiness?.unmetRequirements ?? []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
                {agentReadiness && agentReadiness.unmetRequirements.length === 0 && <li>{isZh ? "没有未满足要求。" : "No unmet requirements."}</li>}
                {!agentReadiness && <li>{agentReadinessError || (isZh ? "未加载 readiness。" : "Readiness has not been loaded.")}</li>}
              </ul>
            </div>
            <div className="settings-block">
              <div className="settings-block-title"><KeyRound size={15} /><span>{isZh ? "开放范围" : "Exposed scope"}</span></div>
              <div className="settings-list">
                {agentContractEndpoints.map((endpoint) => (
                  <code key={`${endpoint.method}-${endpoint.path}`}>{endpoint.method} {endpoint.path} - {endpoint.capability}</code>
                ))}
                {!agentContractEndpoints.length && <code>{isZh ? "刷新 readiness 或启动后显示只读 endpoint。" : "Refresh readiness or start the API to show read-only endpoints."}</code>}
              </div>
              <div className="settings-notice">
                {isZh
                  ? "不会暴露 apply、delete、set-status、parser、ingest、cloud OCR、外部搜索或写回应用 endpoint。"
                  : "No apply, delete, set-status, parser, ingest, cloud OCR, external search, or writeback-apply endpoint is exposed."}
              </div>
              {blockedOperations.length > 0 && (
                <ul className="settings-change-list">
                  {blockedOperations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      }
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
              <button type="button" onClick={onPlanIngest} disabled={!vaultPath || busy === "plan_ingest"}>
                <RefreshCw size={14} />
                {isZh ? "立即扫描并刷新 ingest plan" : "Scan now and refresh ingest plan"}
              </button>
              <div className="settings-notice">
                {isZh ? "配置会被保存；立即扫描只刷新当前 vault 的 plan state。自动后台调度仍需接入 vault-scoped 任务队列，因此这里不会假装已经创建系统级定时任务。" : "The config is saved. Scan now only refreshes this vault's plan state. Automatic background scheduling still needs a vault-scoped job queue, so this does not pretend to create a system scheduler."}
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
                const providerTest = providerTests[provider.id];
                const isLocal = provider.kind === "local";
                const isErnie = provider.id === "ernie-ai-studio";
                const persistedCliAvailable = Boolean(config.cliAvailable);
                const localApiReady = isLoopbackHttpEndpoint(config.apiBaseUrl);
                const canEnable = isLocal ? Boolean(cliCheck?.available || persistedCliAvailable) : Boolean(apiCheck?.available || apiProviderReady(config));
                const status = isErnie
                  ? checkingApi === provider.id
                    ? text.checking
                    : providerTest
                      ? providerTest.status === "ready" ? text.detected : providerTest.status === "missing_key" ? text.notConfigured : text.notFound
                      : config.enabled
                        ? text.enabled
                        : text.notConfigured
                  : isLocal
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
                          onClick={() => runCliCheck(provider.id as "local-codex" | "local-claude", provider.command as "codex" | "claude")}
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
                              onClick={() => runCliCheck(provider.id as "local-codex" | "local-claude", provider.command as "codex" | "claude")}
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
                                  readOnly={isErnie}
                                />
                              </label>
                              <label className="field-label">
                                {isErnie ? text.apiKeySource : text.apiKeyEnvVar}
                                <input
                                  value={config.apiKeyEnvVar || ""}
                                  onChange={(event) => updateProvider(provider.id, { apiKeyEnvVar: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })}
                                  placeholder={"defaultApiKeyEnvVar" in provider ? provider.defaultApiKeyEnvVar : "PROVIDER_API_KEY"}
                                  readOnly={isErnie}
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => runApiKeyCheck(provider.id)}
                                disabled={checkingApi === provider.id || (!config.apiKeyEnvVar?.trim() && !localApiReady)}
                              >
                                <RefreshCw size={14} />
                                {isErnie ? text.testConnection : text.checkKeyAndEnable}
                              </button>
                            </div>
                            <div className={classNames("settings-notice", apiCheck && !apiCheck.available && "danger")}>
                              {apiCheck?.message || `${text.apiKeyHint} ${text.protocolHint}`}
                            </div>
                            {isErnie && (
                              <div className={classNames("settings-notice", providerTest && providerTest.status !== "ready" && "danger")}>
                                <strong>{status}</strong>
                                {providerTest?.checkedAt ? ` · ${text.lastChecked}: ${new Date(providerTest.checkedAt).toLocaleString()}` : ""}
                                {providerTest?.latencyMs ? ` · ${providerTest.latencyMs} ms` : ""}
                                {providerTest?.model ? ` · ${providerTest.model}` : ""}
                                {providerTest?.message ? ` · ${text.errorDetails}: ${providerTest.message}` : ""}
                              </div>
                            )}
                          </div>
                        )}
                        {isLocal && !canEnable && (
                          <div className="api-provider-note">
                            <Info size={15} />
                            {text.selectAfterCheck}
                          </div>
                        )}

                        {isErnie ? (
                          <label className="field-label">
                            Model
                            <select value={config.selectedModel} onChange={(event) => updateProvider(provider.id, { selectedModel: event.target.value })}>
                              {provider.models.map((model) => (
                                <option key={model} value={model}>{model}</option>
                              ))}
                            </select>
                          </label>
                        ) : (
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
                        )}

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
