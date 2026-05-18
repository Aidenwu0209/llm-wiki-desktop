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
    detected: "已检测",
    notFound: "未找到",
    needsCheck: "待检查",
    needsConfig: "待配置",
    noProvider: "未选择提供方",
    selectAfterCheck: "本地 CLI 需要先检查可用后才能启用。",
    configurable: "可配置",
    enabled: "已启用",
    keyPresent: "密钥已检测",
    keyMissing: "未检测到密钥",
    apiPlaceholder: "托管 API 提供方可用。这里保存 Base URL 和 API key 环境变量名，不保存 API key 明文。",
    apiBaseUrl: "API Base URL",
    apiKeyEnvVar: "API Key 环境变量",
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
    detected: "Detected",
    notFound: "Not found",
    needsCheck: "Needs check",
    needsConfig: "Needs config",
    noProvider: "No provider selected",
    selectAfterCheck: "Check the local CLI before enabling it.",
    configurable: "Configurable",
    enabled: "Enabled",
    keyPresent: "Key detected",
    keyMissing: "Key not detected",
    apiPlaceholder: "Hosted API providers are usable. This saves the Base URL and API key environment variable name, never the API key value.",
    apiBaseUrl: "API Base URL",
    apiKeyEnvVar: "API key environment variable",
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
  { id: "anthropic", name: "Anthropic (Claude)", subtitle: "Claude API models for remote research jobs.", subtitleZh: "面向远程研究任务的 Claude API 模型。", kind: "api", defaultApiBaseUrl: "https://api.anthropic.com/v1", defaultApiKeyEnvVar: "ANTHROPIC_API_KEY", models: ["claude-3-7-sonnet", "claude-3-5-haiku"] },
  { id: "claude-code", name: "Claude Code CLI (local)", subtitle: "Local Claude Code CLI handoff without storing API keys.", subtitleZh: "通过本地 Claude Code 命令行交接任务，不在桌面端保存 API key。", kind: "local", command: "claude" as const, models: ["sonnet", "opus", "default"] },
  { id: "codex-cli", name: "Codex CLI (local)", subtitle: "Local Codex runtime for repo-aware research and automation.", subtitleZh: "本地 Codex 运行时，用于仓库上下文研究和自动化。", kind: "local", command: "codex" as const, models: ["gpt-5.5", "gpt-5.4", "gpt-5.3-codex"] },
  { id: "openai", name: "OpenAI (GPT)", subtitle: "Hosted GPT models when explicit API use is allowed.", subtitleZh: "仅在明确允许 API 使用时启用的托管 GPT 模型。", kind: "api", defaultApiBaseUrl: "https://api.openai.com/v1", defaultApiKeyEnvVar: "OPENAI_API_KEY", models: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"] },
  { id: "google", name: "Google (Gemini)", subtitle: "Gemini API provider for external model runs.", subtitleZh: "用于外部模型运行的 Gemini API 提供方。", kind: "api", defaultApiBaseUrl: "https://generativelanguage.googleapis.com/v1beta", defaultApiKeyEnvVar: "GEMINI_API_KEY", models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  { id: "deepseek", name: "DeepSeek", subtitle: "DeepSeek hosted models for approved remote inference.", subtitleZh: "用于已批准远程推理的 DeepSeek 托管模型。", kind: "api", defaultApiBaseUrl: "https://api.deepseek.com/v1", defaultApiKeyEnvVar: "DEEPSEEK_API_KEY", models: ["deepseek-reasoner", "deepseek-chat"] },
  { id: "groq", name: "Groq", subtitle: "Fast hosted inference for low-latency checks.", subtitleZh: "用于低延迟检查的快速托管推理。", kind: "api", defaultApiBaseUrl: "https://api.groq.com/openai/v1", defaultApiKeyEnvVar: "GROQ_API_KEY", models: ["llama-3.3-70b", "mixtral"] },
  { id: "xai", name: "xAI (Grok)", subtitle: "Grok provider for approved hosted research tasks.", subtitleZh: "用于已批准托管研究任务的 Grok 提供方。", kind: "api", defaultApiBaseUrl: "https://api.x.ai/v1", defaultApiKeyEnvVar: "XAI_API_KEY", models: ["grok-3", "grok-3-mini"] },
  { id: "nvidia", name: "NVIDIA NIM", subtitle: "NIM endpoints for enterprise or local gateway use.", subtitleZh: "用于企业端点或本地网关的 NIM 配置。", kind: "api", defaultApiBaseUrl: "https://integrate.api.nvidia.com/v1", defaultApiKeyEnvVar: "NVIDIA_API_KEY", models: ["nemotron", "llama-nemotron"] },
  { id: "kimi", name: "Kimi (Moonshot)", subtitle: "Moonshot API models outside China region.", subtitleZh: "中国区外 Moonshot API 模型配置。", kind: "api", defaultApiBaseUrl: "https://api.moonshot.ai/v1", defaultApiKeyEnvVar: "MOONSHOT_API_KEY", models: ["kimi-k2", "moonshot-v1"] },
  { id: "kimi-cn", name: "Kimi (Moonshot, 中国)", subtitle: "Moonshot China endpoint profile.", subtitleZh: "Moonshot 中国区端点配置。", kind: "api", defaultApiBaseUrl: "https://api.moonshot.cn/v1", defaultApiKeyEnvVar: "MOONSHOT_CN_API_KEY", models: ["kimi-k2-cn", "moonshot-v1-cn"] },
] as const;

function visiblePath(path: string) {
  return path.replace(/ +(?=\/|$)/g, (match) => "[space]".repeat(match.length));
}

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function defaultProviderConfig(providerId: string): LlmProviderConfig {
  const provider = providers.find((item) => item.id === providerId);
  return {
    enabled: false,
    expanded: false,
    selectedModel: provider?.models[0] ?? "default",
    customModel: "",
    contextWindow: providerId.includes("cli") ? 128000 : 64000,
    reasoningMode: "balanced",
    apiBaseUrl: provider && "defaultApiBaseUrl" in provider ? provider.defaultApiBaseUrl : "",
    apiKeyEnvVar: provider && "defaultApiKeyEnvVar" in provider ? provider.defaultApiKeyEnvVar : "",
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
    }
    const savedEnabled = provider.kind === "local"
      ? Boolean(merged.enabled && merged.cliAvailable)
      : Boolean(merged.enabled && (merged.apiKeyEnvVar || merged.apiBaseUrl));
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
    setCheckingApi(providerId);
    try {
      const result = await checkLlmApiKey(providerId, config.apiKeyEnvVar || "");
      setApiChecks((current) => ({ ...current, [providerId]: result }));
      const nextProviders = Object.fromEntries(
        Object.entries(center.providers).map(([id, value]) => [
          id,
          {
            ...value,
            enabled: result.available ? id === providerId : id === center.activeProviderId,
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
        activeProviderId: result.available ? providerId : center.activeProviderId,
        providers: nextProviders,
      });
    } catch (err) {
      setApiChecks((current) => ({
        ...current,
        [providerId]: { providerId, envVar: config.apiKeyEnvVar || "", available: false, message: String(err) },
      }));
      updateProvider(providerId, {
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
              isZh ? "向量检索入口已保留；当前桌面端还没有接入可启用的 embedding 运行链路。" : "Embedding retrieval is reserved; the desktop app has not wired an enableable embedding pipeline yet.",
              sectionStatus(isZh ? "预留" : "Reserved"),
            )}
            {renderReservedBlock(
              isZh ? "当前状态" : "Current state",
              isZh ? "这里不会让你开启一个假向量模型。等本地 embedding runtime 和索引路径接好后，才会开放启用开关。" : "This page does not expose a fake embedding switch. Enabling will be added only after a local embedding runtime and index path are wired.",
              Database,
            )}
            <div className="settings-block">
              <div className="settings-block-title"><Database size={15} /><span>{isZh ? "预留配置项" : "Reserved fields"}</span></div>
              <div className="settings-grid">
                <label>{isZh ? "默认向量模型" : "Default embedding model"}<input value="local-embedding (reserved)" readOnly disabled /></label>
                <label>{isZh ? "索引位置" : "Index location"}<input value={isZh ? "知识库内 _state/vector-index（未启用）" : "vault _state/vector-index (inactive)"} readOnly disabled /></label>
              </div>
            </div>
          </div>
        );
      case "captioning":
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.nav.captioning,
              isZh ? "图片描述会作为 source 辅助证据；当前尚未接入本地 caption runtime。" : "Image captioning will support source evidence, but no local caption runtime is connected yet.",
              sectionStatus(isZh ? "预留" : "Reserved"),
            )}
            {renderReservedBlock(
              isZh ? "本地优先边界" : "Local-first boundary",
              isZh ? "不会默认上传图片到外部 API。后续只在明确配置本地模型或用户允许远程服务后才会启用。" : "Images are not uploaded to external APIs by default. This will activate only with an explicit local model or user-approved remote service.",
              Image,
            )}
            <div className="settings-block">
              <div className="settings-block-title"><Image size={15} /><span>{isZh ? "预留配置项" : "Reserved fields"}</span></div>
              <div className="settings-grid">
                <label>{isZh ? "Caption 引擎" : "Caption engine"}<input value={isZh ? "未接入" : "Not connected"} readOnly disabled /></label>
                <label>{isZh ? "输出语言" : "Output language"}<input value={settings.aiOutputLanguage || (isZh ? "中文" : "English")} readOnly disabled /></label>
              </div>
            </div>
          </div>
        );
      case "web-search":
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.nav["web-search"],
              isZh ? "网页搜索默认关闭，避免把本地研究流程变成外部联网流程。" : "Web search stays off by default so local research does not silently become an online workflow.",
              sectionStatus(isZh ? "未启用" : "Disabled", "disabled"),
            )}
            {renderReservedBlock(
              isZh ? "联网能力未接入" : "Online search is not wired",
              isZh ? "Chat/Search 当前应优先使用 vault evidence。网页搜索会在有明确网络授权、来源标注和审计记录后再开放。" : "Chat/Search should currently use vault evidence first. Web search will open only with explicit network permission, source labeling, and audit records.",
              Search,
            )}
            <div className="settings-notice">
              {isZh ? "当前策略：不调用外部搜索 API；不把论文或查询内容上传到第三方搜索服务。" : "Current policy: no external search API calls and no paper/query upload to third-party search services."}
            </div>
          </div>
        );
      case "network":
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.nav.network,
              isZh ? "控制解析 API、云解析开关和网络边界。默认仍然是 local-first。" : "Controls parser API and network boundaries. The default remains local-first.",
              sectionStatus(isZh ? "可配置" : "Configurable", "available"),
            )}
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
              <div className={cloudParserBlocked ? "settings-notice danger" : "settings-notice"}>
                {text.token}: {settings.layoutParsingTokenPresent ? text.configured : text.notDetected} · {text.cloudParser}:
                {settings.cloudParsingAllowed ? ` ${text.allowed}` : ` ${text.blocked}`}
              </div>
              <label className="switch-row">
                <input type="checkbox" checked={settings.cloudParsingAllowed} onChange={(event) => updateSettings({ cloudParsingAllowed: event.target.checked })} />
                <span>{text.allowCloudParser}</span>
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
              isZh ? "控制导入后的默认资料处理方式；后台文件监听尚未接入。" : "Controls default source handling after import; background folder watching is not wired yet.",
              sectionStatus(isZh ? "部分可配置" : "Partly configurable", "available"),
            )}
            <div className="settings-block">
              <div className="settings-block-title"><ShieldCheck size={15} /><span>{isZh ? "导入模式" : "Import mode"}</span></div>
              <label className="field-label">
                {isZh ? "默认导入模式" : "Default ingest mode"}
                <select value={settings.defaultIngestMode} onChange={(event) => updateSettings({ defaultIngestMode: event.target.value })}>
                  <option value="inbox_only">{isZh ? "只进入 raw inbox，不自动排队" : "Raw inbox only, do not enqueue"}</option>
                  <option value="enqueue_after_import">{isZh ? "导入后加入待处理队列" : "Enqueue after import"}</option>
                </select>
              </label>
              <p className="settings-block-copy">
                {isZh ? "该设置影响后续 Import/Raw Sources 流程；不会修改已经进入 vault 的 raw evidence。" : "This affects future Import/Raw Sources flows and does not mutate raw evidence already in the vault."}
              </p>
            </div>
            {renderReservedBlock(
              isZh ? "文件夹监听" : "Folder watching",
              isZh ? "自动监控目录、去重和计划 ingest 还没有接入后台任务。当前只能通过 Raw Sources / Import 手动触发。" : "Automatic folder watching, dedupe, and planned ingest jobs are not connected yet. Use Raw Sources / Import manually for now.",
              History,
            )}
          </div>
        );
      case "scheduled-import":
        return (
          <div className="settings-section-page">
            {renderSectionHead(
              text.nav["scheduled-import"],
              isZh ? "定时导入需要后台调度和 vault-scoped 任务队列；当前只保留入口。" : "Scheduled import requires background scheduling and a vault-scoped job queue; this is currently an entry point only.",
              sectionStatus(isZh ? "预留" : "Reserved"),
            )}
            {renderReservedBlock(
              isZh ? "未启用后台调度" : "Background scheduling is inactive",
              isZh ? "这里不会创建假定时任务。后续启用时会显示计划、上次运行、下次运行和失败重试记录。" : "This page does not create fake scheduled jobs. When enabled it will show schedule, last run, next run, and retry history.",
              History,
            )}
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
                <li>{isZh ? "大语言模型不再默认启用 Codex；本地 CLI 需要检查后才能启用。" : "LLM provider no longer defaults to Codex; local CLIs must be checked before enabling."}</li>
                <li>{isZh ? "托管 API provider 可配置和启用；只保存 Base URL 与环境变量名，不保存 API key 明文。" : "Hosted API providers can be configured and enabled; only Base URL and environment variable names are saved, never API key values."}</li>
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
                const canEnable = isLocal ? Boolean(cliCheck?.available || persistedCliAvailable) : Boolean(config.apiKeyEnvVar?.trim() || config.apiBaseUrl?.trim());
                const status = isLocal
                  ? cliCheck
                    ? cliCheck.available ? text.detected : text.notFound
                    : persistedCliAvailable ? text.detected : text.needsCheck
                  : config.enabled
                    ? text.enabled
                    : apiCheck
                      ? apiCheck.available ? text.keyPresent : text.keyMissing
                      : config.apiKeyConfigured ? text.keyPresent : text.configurable;
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
                              <strong>{cliCheck ? (cliCheck.available ? text.available : text.missing) : text.notChecked}</strong>
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
                                disabled={checkingApi === provider.id || !config.apiKeyEnvVar?.trim()}
                              >
                                <RefreshCw size={14} />
                                {text.checkKeyAndEnable}
                              </button>
                            </div>
                            <div className={classNames("settings-notice", apiCheck && !apiCheck.available && "danger")}>
                              {apiCheck?.message || text.apiKeyHint}
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
