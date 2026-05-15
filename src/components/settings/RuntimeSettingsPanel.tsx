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
      llm: "LLM 模型",
      embeddings: "Embeddings",
      captioning: "图像描述",
      "web-search": "网页搜索",
      network: "网络",
      "source-watch": "Source Watch",
      "scheduled-import": "定时导入",
      output: "输出",
      interface: "界面",
      maintenance: "维护",
      changelog: "更新记录",
      about: "关于",
    },
    llmTitle: "LLM 模型",
    llmSubtitle: "选择一个当前启用的模型 provider。本地 CLI provider 不会把密钥写入桌面设置文件。",
    save: "保存",
    detected: "已检测",
    notFound: "未找到",
    needsCheck: "待检查",
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
    apiNote: "API key 不在这个 UI 中保存或明文显示。请使用环境变量、系统钥匙串或本地 runtime 配置。",
    customModel: "自定义模型",
    optionalOverride: "可选覆盖",
    contextWindow: "上下文窗口",
    reasoning: "推理 / 思考强度",
    deepThinking: "深度思考",
    placeholder: "Coming soon / Reserved：该分区目前只是预留入口；未实现的 provider、网络或自动化能力不会在这里伪装成可用功能。",
    runtime: "Runtime",
    runtimePath: "Runtime 路径",
    preferLocalRuntime: "优先使用 vault-local runtime",
    chooseRuntime: "选择 runtime 路径",
    parserBoundary: "解析和网络边界",
    defaultPdfParser: "默认 PDF parser",
    token: "Token",
    configured: "已配置",
    notDetected: "未检测到",
    cloudParser: "云 parser",
    allowed: "已允许",
    blocked: "已阻止",
    allowCloudParser: "允许 layout-api 使用云 parser",
    aboutBoundary: "本地优先桌面外壳。Runtime-first 执行。Evidence-backed 研究。Proposal-first writeback 与 approval gate。",
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
  { id: "anthropic", name: "Anthropic (Claude)", subtitle: "Claude API models for remote research jobs.", kind: "api", models: ["claude-3-7-sonnet", "claude-3-5-haiku"] },
  { id: "claude-code", name: "Claude Code CLI (local)", subtitle: "Local Claude Code CLI handoff without storing API keys.", kind: "local", command: "claude" as const, models: ["sonnet", "opus", "default"] },
  { id: "codex-cli", name: "Codex CLI (local)", subtitle: "Local Codex runtime for repo-aware research and automation.", kind: "local", command: "codex" as const, models: ["gpt-5.5", "gpt-5.4", "gpt-5.3-codex"] },
  { id: "openai", name: "OpenAI (GPT)", subtitle: "Hosted GPT models when explicit API use is allowed.", kind: "api", models: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"] },
  { id: "google", name: "Google (Gemini)", subtitle: "Gemini API provider for external model runs.", kind: "api", models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  { id: "deepseek", name: "DeepSeek", subtitle: "DeepSeek hosted models for approved remote inference.", kind: "api", models: ["deepseek-reasoner", "deepseek-chat"] },
  { id: "groq", name: "Groq", subtitle: "Fast hosted inference for low-latency checks.", kind: "api", models: ["llama-3.3-70b", "mixtral"] },
  { id: "xai", name: "xAI (Grok)", subtitle: "Grok provider for approved hosted research tasks.", kind: "api", models: ["grok-3", "grok-3-mini"] },
  { id: "nvidia", name: "NVIDIA NIM", subtitle: "NIM endpoints for enterprise or local gateway use.", kind: "api", models: ["nemotron", "llama-nemotron"] },
  { id: "kimi", name: "Kimi (Moonshot)", subtitle: "Moonshot API models outside China region.", kind: "api", models: ["kimi-k2", "moonshot-v1"] },
  { id: "kimi-cn", name: "Kimi (Moonshot, 中国)", subtitle: "Moonshot China endpoint profile.", kind: "api", models: ["kimi-k2-cn", "moonshot-v1-cn"] },
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
    enabled: providerId === "codex-cli",
    expanded: providerId === "codex-cli",
    selectedModel: provider?.models[0] ?? "default",
    customModel: "",
    contextWindow: providerId.includes("cli") ? 128000 : 64000,
    reasoningMode: "balanced",
  };
}

function normalizeProviderSettings(settings: DesktopSettings) {
  const current = settings.llmProviderCenter || { activeProviderId: "codex-cli", providers: {} };
  const knownProviderIds: string[] = providers.map((item) => item.id);
  const activeProviderId = knownProviderIds.includes(current.activeProviderId) ? current.activeProviderId : "codex-cli";
  const normalized = { ...current.providers };
  for (const provider of providers) {
    normalized[provider.id] = {
      ...defaultProviderConfig(provider.id),
      ...normalized[provider.id],
      enabled: provider.id === activeProviderId,
    };
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
    const nextActiveProviderId = enabled
      ? providerId
      : center.activeProviderId === providerId
        ? "codex-cli"
        : center.activeProviderId || "codex-cli";
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
                const status = isLocal
                  ? cliCheck
                    ? cliCheck.available ? text.detected : text.notFound
                    : config.enabled ? text.needsCheck : text.local
                  : config.enabled ? text.activeKeyHidden : text.off;
                return (
                  <article key={provider.id} className={classNames("provider-card", config.enabled && "enabled")}>
                    <button className="provider-row" type="button" onClick={() => toggleExpanded(provider.id)}>
                      <span className="provider-chevron">{config.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                      <span>
                        <strong>{provider.name}</strong>
                        <em>{provider.subtitle}</em>
                      </span>
                      <span className={classNames("provider-status", config.enabled && "active", cliCheck && !cliCheck.available && "danger")}>{status}</span>
                      <label className="toggle" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={config.enabled}
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
                              <strong>{cliCheck?.version || "unknown"}</strong>
                            </div>
                            <div>
                              <span>{text.path}</span>
                              <code>{cliCheck?.path ? visiblePath(cliCheck.path) : text.pathPending}</code>
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
                            {text.apiNote}
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
                            {text.contextWindow}: {config.contextWindow.toLocaleString()} tokens
                            <input
                              type="range"
                              min={8192}
                              max={256000}
                              step={8192}
                              value={config.contextWindow}
                              onChange={(event) => updateProvider(provider.id, { contextWindow: Number(event.target.value) })}
                            />
                          </label>
                          <div className="reasoning-picker" aria-label="Reasoning and thinking level">
                            <span className="control-caption">{text.reasoning}</span>
                            {["fast", "balanced", "deep"].map((mode) => (
                              <button
                                key={mode}
                                type="button"
                                className={config.reasoningMode === mode ? "active" : ""}
                                onClick={() => updateProvider(provider.id, { reasoningMode: mode })}
                              >
                                {mode === "deep" ? text.deepThinking : mode}
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
