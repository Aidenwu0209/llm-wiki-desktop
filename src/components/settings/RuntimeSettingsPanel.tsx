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
import type { DesktopSettings, LlmCliCheckResult, LlmProviderConfig } from "../../types";
import { languageName, type UiLanguage } from "../../i18n";
import { checkLocalLlmCli } from "../../tauri";
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
    noProvider: "未选择提供方",
    selectAfterCheck: "本地 CLI 需要先检查可用后才能启用。",
    configurationPlaceholder: "配置占位",
    apiPlaceholder: "托管 API 提供方当前只是配置占位。桌面端还没有安全密钥存储，因此这里不会启用或保存 API key。",
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
    noProvider: "No provider selected",
    selectAfterCheck: "Check the local CLI before enabling it.",
    configurationPlaceholder: "Configuration placeholder",
    apiPlaceholder: "Hosted API providers are configuration placeholders. The desktop app does not have secure key storage yet, so API keys are not enabled or saved here.",
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
  { id: "anthropic", name: "Anthropic (Claude)", subtitle: "Claude API models for remote research jobs.", subtitleZh: "面向远程研究任务的 Claude API 模型。", kind: "api", models: ["claude-3-7-sonnet", "claude-3-5-haiku"] },
  { id: "claude-code", name: "Claude Code CLI (local)", subtitle: "Local Claude Code CLI handoff without storing API keys.", subtitleZh: "通过本地 Claude Code 命令行交接任务，不在桌面端保存 API key。", kind: "local", command: "claude" as const, models: ["sonnet", "opus", "default"] },
  { id: "codex-cli", name: "Codex CLI (local)", subtitle: "Local Codex runtime for repo-aware research and automation.", subtitleZh: "本地 Codex 运行时，用于仓库上下文研究和自动化。", kind: "local", command: "codex" as const, models: ["gpt-5.5", "gpt-5.4", "gpt-5.3-codex"] },
  { id: "openai", name: "OpenAI (GPT)", subtitle: "Hosted GPT models when explicit API use is allowed.", subtitleZh: "仅在明确允许 API 使用时启用的托管 GPT 模型。", kind: "api", models: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"] },
  { id: "google", name: "Google (Gemini)", subtitle: "Gemini API provider for external model runs.", subtitleZh: "用于外部模型运行的 Gemini API 提供方。", kind: "api", models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  { id: "deepseek", name: "DeepSeek", subtitle: "DeepSeek hosted models for approved remote inference.", subtitleZh: "用于已批准远程推理的 DeepSeek 托管模型。", kind: "api", models: ["deepseek-reasoner", "deepseek-chat"] },
  { id: "groq", name: "Groq", subtitle: "Fast hosted inference for low-latency checks.", subtitleZh: "用于低延迟检查的快速托管推理。", kind: "api", models: ["llama-3.3-70b", "mixtral"] },
  { id: "xai", name: "xAI (Grok)", subtitle: "Grok provider for approved hosted research tasks.", subtitleZh: "用于已批准托管研究任务的 Grok 提供方。", kind: "api", models: ["grok-3", "grok-3-mini"] },
  { id: "nvidia", name: "NVIDIA NIM", subtitle: "NIM endpoints for enterprise or local gateway use.", subtitleZh: "用于企业端点或本地网关的 NIM 配置。", kind: "api", models: ["nemotron", "llama-nemotron"] },
  { id: "kimi", name: "Kimi (Moonshot)", subtitle: "Moonshot API models outside China region.", subtitleZh: "中国区外 Moonshot API 模型配置。", kind: "api", models: ["kimi-k2", "moonshot-v1"] },
  { id: "kimi-cn", name: "Kimi (Moonshot, 中国)", subtitle: "Moonshot China endpoint profile.", subtitleZh: "Moonshot 中国区端点配置。", kind: "api", models: ["kimi-k2-cn", "moonshot-v1-cn"] },
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
    const savedEnabled = provider.kind === "local"
      ? Boolean(saved?.enabled && saved?.cliAvailable)
      : false;
    normalized[provider.id] = {
      ...defaultProviderConfig(provider.id),
      ...saved,
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
  const [checkingCli, setCheckingCli] = useState<string | null>(null);
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
    updateProvider(providerId, { expanded: !center.providers[providerId]?.expanded });
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
        });
      }
    } catch (err) {
      setCliChecks((current) => ({
        ...current,
        [providerId]: { command, available: false, message: String(err), version: null, path: null },
      }));
    } finally {
      setCheckingCli(null);
    }
  };

  const cloudParserSelected = settings.defaultPdfParser === "layout-api";
  const cloudParserBlocked = cloudParserSelected && !settings.cloudParsingAllowed;

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
              <button onClick={onSaveSettings} disabled={!vaultPath || busy === "save_settings"}>
                <Check size={15} />
                {text.save}
              </button>
            </div>

            <div className="provider-list">
              {providers.map((provider) => {
                const config = center.providers[provider.id] ?? defaultProviderConfig(provider.id);
                const cliCheck = cliChecks[provider.id];
                const isLocal = provider.kind === "local";
                const persistedCliAvailable = Boolean(config.cliAvailable);
                const canEnable = isLocal ? Boolean(cliCheck?.available || persistedCliAvailable) : false;
                const status = isLocal
                  ? cliCheck
                    ? cliCheck.available ? text.detected : text.notFound
                    : persistedCliAvailable ? text.detected : text.needsCheck
                  : text.configurationPlaceholder;
                return (
                  <article key={provider.id} className={classNames("provider-card", config.enabled && "enabled")}>
                    <button className="provider-row" type="button" onClick={() => toggleExpanded(provider.id)}>
                      <span className="provider-chevron">{config.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                      <span>
                        <strong>{provider.name}</strong>
                        <em>{language === "zh" ? provider.subtitleZh : provider.subtitle}</em>
                      </span>
                      <span className={classNames("provider-status", config.enabled && "active", cliCheck && !cliCheck.available && "danger")}>{status}</span>
                      <label className="toggle" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          disabled={!canEnable}
                          onChange={(event) => toggleProvider(provider.id, event.target.checked)}
                        />
                        <span />
                      </label>
                    </button>

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
                              {text.recheck}
                            </button>
                          </div>
                        ) : (
                          <div className="api-provider-note">
                            <KeyRound size={15} />
                            {text.apiPlaceholder}
                          </div>
                        )}
                        {isLocal && !canEnable && (
                          <div className="api-provider-note">
                            <Info size={15} />
                            {text.selectAfterCheck}
                          </div>
                        )}

                        {isLocal && (
                          <>
                            <div className="model-chip-row">
                              {provider.models.map((model) => (
                                <button
                                  type="button"
                                  key={model}
                                  className={config.selectedModel === model ? "active" : ""}
                                  disabled={!canEnable}
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
                                  disabled={!canEnable}
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
                                  disabled={!canEnable}
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
                                    disabled={!canEnable}
                                    onClick={() => updateProvider(provider.id, { reasoningMode: mode })}
                                  >
                                    {language === "zh"
                                      ? ({ fast: "快速", balanced: "平衡", deep: text.deepThinking } as Record<string, string>)[mode]
                                      : mode}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {section !== "llm" && section !== "about" && (
          <div className="settings-placeholder-page">
            <div className="settings-page-head">
              <div>
                <h2>{text.nav[section]}</h2>
                <p>{text.placeholder}</p>
              </div>
            </div>
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
                <label>Python<input value={settings.pythonPath} onChange={(event) => setSettings((current) => ({ ...current, pythonPath: event.target.value }))} /></label>
                <label>uv<input value={settings.uvPath} onChange={(event) => setSettings((current) => ({ ...current, uvPath: event.target.value }))} /></label>
              </div>
            </div>

            <div className="settings-block">
              <div className="settings-block-title"><Cloud size={15} /><span>{text.parserBoundary}</span></div>
              <label className="field-label">
                {text.defaultPdfParser}
                <select value={settings.defaultPdfParser} onChange={(event) => setSettings((current) => ({ ...current, defaultPdfParser: event.target.value }))}>
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
                <input type="checkbox" checked={settings.cloudParsingAllowed} onChange={(event) => setSettings((current) => ({ ...current, cloudParsingAllowed: event.target.checked }))} />
                <span>{text.allowCloudParser}</span>
              </label>
            </div>
          </div>
        )}

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
          <button onClick={onSaveSettings} disabled={!vaultPath || busy === "save_settings"}>
            <Check size={15} />
            {text.save}
            </button>
          </div>
        )}
      </main>
    </section>
  );
}
