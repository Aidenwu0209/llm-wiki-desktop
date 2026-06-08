import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  FileInput,
  FolderOpen,
  GitCompare,
  ListChecks,
  Languages,
  MessageSquare,
  Network,
  PanelRightOpen,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  SquareStack,
  TerminalSquare,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  applyWritebackProposal,
  createDiagnosticBundle,
  createQueryWritebackProposal,
  createFollowupAction,
  createVault,
  createWritebackProposal,
  cancelRuntimeJob,
  importSources,
  inspectVault,
  isTauriAvailable,
  listClaimLedger,
  listEvidencePaths,
  listReviewQueue,
  listRuntimeJobs,
  listTraceabilityWarnings,
  listVaultSuggestions,
  listWritebackProposals,
  loadDesktopSettings,
  openObsidianVault,
  openPath,
  openVaultPath,
  planIngest,
  repairObsidianTemplates,
  revealPath,
  resolveVaultEntryNote,
  runIngestLint,
  saveDesktopSettings,
  saveInterfaceLanguage,
  saveLastSelectedVault,
  setClaimVerdict,
  setDashboardActionStatus,
  setIngestJobStatus,
  setReviewItemStatus,
  setWritebackStatus,
  startIngestPipelineJob,
  startRuntimeCommandJob,
  restoreLastSelectedVault,
} from "./tauri";
import {
  DEFAULT_DEEPSEEK_RESEARCH_STRATEGY_QUERY,
  DEFAULT_DEEPSEEK_RESEARCH_STRATEGY_QUERY_EN,
  QueryWritebackComposer,
} from "./components/writeback/QueryWritebackComposer";
import { ChatSearchPage } from "./components/search/ChatSearchPage";
import { RawSourcesWorkspace } from "./components/sources/RawSourcesWorkspace";
import { ResearchGraphPage } from "./components/graph/ResearchGraphPage";
import { TraceabilityActionCards } from "./components/traceability/TraceabilityActionCards";
import { ActivityMiniPanel } from "./components/layout/ActivityMiniPanel";
import { DeepSeekVaultHome } from "./components/layout/DeepSeekVaultHome";
import { PageStatusHeader, type PagePrimaryAction, type PageStatusItem } from "./components/layout/PageStatusHeader";
import { DetailsPanel, type DetailSelection } from "./components/details/DetailsPanel";
import { DashboardOverview } from "./components/dashboard/DashboardOverview";
import { WelcomePanel, type NewWikiProjectDraft } from "./components/dashboard/WelcomePanel";
import { RuntimeSettingsPanel } from "./components/settings/RuntimeSettingsPanel";
import { BrandMark } from "./components/brand/BrandMark";
import { buildVaultFileTree, type VaultFileTreeNode } from "./lib/vaultTree";
import { canPreviewVaultPath, createPreviewVaultFile, findVaultFileForOpen, vaultRelativeOpenPath } from "./lib/vaultPath";
import type {
  ClaimLedgerItem,
  DashboardAction,
  DesktopAppState,
  DesktopSettings,
  EvidencePathItem,
  ImportPreview,
  IngestPlan,
  QueryWritebackDraft,
  ReviewQueueItem,
  RuntimeJobEvent,
  RuntimeSettings,
  RuntimeJobStatus,
  TaskLog,
  TraceabilityWarning,
  VaultEntryNote,
  VaultFile,
  VaultSuggestion,
  VaultStatus,
  WritebackApplyStatus,
  WritebackProposal,
} from "./types";
import {
  INTERFACE_LANGUAGE_STORAGE_KEY,
  languageName,
  normalizeUiLanguage,
  oppositeLanguage,
  runtimeLabel,
  runtimeText,
  type UiLanguage,
} from "./i18n";
import { isRunnableIngestEntry, runnableIngestCount } from "./lib/ingestPlan";

const runtimeActions = [
  { id: "lint", label: "Run lint", icon: ListChecks },
  { id: "parse_pdfs", label: "Parse PDFs locally", icon: FileInput },
  { id: "obsidian_setup", label: "Obsidian setup", icon: SquareStack },
  { id: "status_dashboard", label: "Refresh dashboard", icon: RefreshCw },
  { id: "discover", label: "Source discovery", icon: Search },
  { id: "claims", label: "Claim extraction", icon: ClipboardList },
  { id: "semantic_qa", label: "Semantic QA", icon: ShieldCheck },
  { id: "science_review", label: "Science review", icon: AlertTriangle },
  { id: "concept_revision_preview", label: "Concept preview", icon: Database },
  { id: "concept_revision_apply", label: "Concept apply", icon: Wrench },
  { id: "cancel_probe", label: "Cancel probe", icon: XCircle },
  { id: "timeout_probe", label: "Timeout probe 2s", icon: TerminalSquare },
];

const pipeline = [
  "Import",
  "Parse PDF / Markdown",
  "Draft source page",
  "Independent QA",
  "Publish stable source",
  "Extract claims",
  "Normalize metrics",
  "Semantic QA",
  "Contradiction scan",
  "Science review queue",
  "Concept revision",
  "Lint",
];

const actionSeverityRank: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
const NAV_RAIL_WIDTH = 64;
const WORKSPACE_MIN_WIDTH = 360;
const KNOWLEDGE_SIDEBAR_MIN_WIDTH = 180;
const KNOWLEDGE_SIDEBAR_MAX_WIDTH = 400;
const PREVIEW_SIDEBAR_MIN_WIDTH = 280;
const PREVIEW_SIDEBAR_MAX_WIDTH = 560;
const NAV_RAIL_EXPANDED_STORAGE_KEY = "llm-wiki.navRailExpanded";

const localizedBoolean = (value: boolean, language: UiLanguage) => {
  if (language === "zh") return value ? "是" : "否";
  return value ? "yes" : "no";
};

function defaultKnowledgeSidebarWidth() {
  if (typeof window !== "undefined" && window.innerWidth <= 1440) return 264;
  return 286;
}

function defaultPreviewSidebarWidth() {
  if (typeof window !== "undefined" && window.innerWidth <= 1440) return 340;
  return 382;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function compareDashboardActions(a: DashboardAction, b: DashboardAction) {
  const severityDelta = (actionSeverityRank[a.severity.toLowerCase()] ?? 9) - (actionSeverityRank[b.severity.toLowerCase()] ?? 9);
  if (severityDelta !== 0) return severityDelta;
  return a.title.localeCompare(b.title);
}

type WorkflowStep = {
  title: string;
  body: string;
};

type ShellResearchReadiness = {
  llmReady: boolean;
  llmLabel: string;
  llmDetail: string;
  searchReady: boolean;
  searchLabel: string;
  searchDetail: string;
};

type ShellResearchStageState = "ready" | "warning" | "running" | "done";

const shellLlmProviderNames: Record<string, string> = {
  anthropic: "Anthropic",
  "claude-code": "Claude Code CLI",
  "codex-cli": "Codex CLI",
  openai: "OpenAI",
  google: "Google Gemini",
  deepseek: "DeepSeek",
  kimi: "Kimi",
  "kimi-cn": "Kimi CN",
  "qwen-dashscope": "Qwen DashScope",
  "bailian-coding": "Bailian Coding",
  zhipu: "Zhipu GLM",
  "ollama-local": "Ollama Local",
  "custom-openai": "Custom OpenAI",
};

const shellSearchProviderNames: Record<string, string> = {
  none: "None",
  tavily: "Tavily",
  serpapi: "SerpApi",
  searxng: "SearXNG",
};

const shellLocalLlmProviderIds = new Set(["claude-code", "codex-cli"]);

function prettyProviderName(providerId: string, names: Record<string, string>) {
  if (!providerId) return "";
  return names[providerId] || providerId.split(/[-_]/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function isLoopbackEndpoint(endpoint?: string) {
  return Boolean(endpoint && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i.test(endpoint.trim()));
}

function shellResearchReadiness(settings: DesktopSettings, language: UiLanguage): ShellResearchReadiness {
  const isZh = language === "zh";
  const activeProviderId = settings.llmProviderCenter?.activeProviderId?.trim() || "";
  const activeProvider = activeProviderId ? settings.llmProviderCenter?.providers?.[activeProviderId] : null;
  const providerName = activeProviderId
    ? prettyProviderName(activeProviderId, shellLlmProviderNames)
    : isZh ? "未选择提供方" : "No provider selected";
  const providerEnabled = Boolean(activeProvider?.enabled);
  const model = activeProvider?.customModel?.trim() || activeProvider?.selectedModel || "default";
  const localProvider = shellLocalLlmProviderIds.has(activeProviderId);
  const apiEndpoint = activeProvider?.apiBaseUrl?.trim() || "";
  const apiReady = Boolean(apiEndpoint && (activeProvider?.apiKeyConfigured || isLoopbackEndpoint(apiEndpoint)));
  const localReady = Boolean(providerEnabled && (activeProvider?.cliAvailable ?? true));
  const llmReady = Boolean(activeProviderId && providerEnabled && (localProvider ? localReady : apiReady));
  let llmDetail = "";
  if (!activeProviderId || !activeProvider) {
    llmDetail = isZh ? "去 Settings / 大语言模型启用一个 provider" : "Enable a provider in Settings / LLM Models";
  } else if (!providerEnabled) {
    llmDetail = isZh ? "当前 provider 尚未启用或检测未通过" : "The selected provider is not enabled or not ready";
  } else if (localProvider && !localReady) {
    llmDetail = isZh ? "本地 CLI 未检测到；可在设置中重新检查" : "Local CLI was not detected; recheck it in Settings";
  } else if (!localProvider && !apiReady) {
    llmDetail = activeProvider.apiKeyEnvVar
      ? isZh
        ? `${activeProvider.apiKeyEnvVar} 未被桌面进程检测到`
        : `${activeProvider.apiKeyEnvVar} is not visible to the desktop process`
      : isZh ? "缺少 API endpoint 或凭证" : "Missing API endpoint or credential";
  } else {
    llmDetail = `${model} · ${localProvider ? "local CLI" : activeProvider.apiProtocol || "api"}`;
  }

  const searchProviderId = settings.webSearchProvider?.trim() || "none";
  const searchProvider = prettyProviderName(searchProviderId, shellSearchProviderNames) || "None";
  const searchReady = Boolean(settings.webSearchEnabled && searchProviderId !== "none");
  let searchDetail = "";
  if (!settings.webSearchEnabled) {
    searchDetail = isZh ? "外部搜索关闭；仍只使用 vault evidence" : "External search is off; vault evidence remains available";
  } else if (searchProviderId === "none") {
    searchDetail = isZh ? "选择 Tavily、SerpApi 或 SearXNG 后再运行深度研究" : "Choose Tavily, SerpApi, or SearXNG before running Deep Research";
  } else {
    searchDetail = settings.webSearchEndpoint?.trim()
      || settings.webSearchApiKeyEnvVar?.trim()
      || (isZh ? "需要 endpoint 或 API key 环境变量" : "Endpoint or API key environment variable required");
  }

  return {
    llmReady,
    llmLabel: providerName,
    llmDetail,
    searchReady,
    searchLabel: searchReady ? searchProvider : isZh ? "搜索未配置" : "Search not configured",
    searchDetail,
  };
}

function WorkflowGuide({ title, body, steps }: { title: string; body: string; steps: WorkflowStep[] }) {
  return (
    <section className="panel workflow-guide">
      <div>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      <ol className="workflow-steps">
        {steps.map((step, index) => (
          <li key={step.title}>
            <span>{index + 1}</span>
            <strong>{step.title}</strong>
            <em>{step.body}</em>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ShellResearchPanel({
  language,
  topic,
  targetPath,
  readiness,
  sourceCount,
  conceptCount,
  reviewCount,
  proposalCount,
  proposalBusy,
  proposals,
  onTopicChange,
  onSubmit,
  onCreateProposal,
  onSelectProposal,
  onOpenWriteback,
  onOpenSettings,
  onClose,
}: {
  language: UiLanguage;
  topic: string;
  targetPath: string;
  readiness: ShellResearchReadiness;
  sourceCount: number;
  conceptCount: number;
  reviewCount: number;
  proposalCount: number;
  proposalBusy: boolean;
  proposals: WritebackProposal[];
  onTopicChange: (value: string) => void;
  onSubmit: (topic: string) => void;
  onCreateProposal: (topic: string) => void | Promise<void>;
  onSelectProposal: (proposal: WritebackProposal) => void;
  onOpenWriteback: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  const isZh = language === "zh";
  const trimmedTopic = topic.trim();
  const visibleProposals = proposals.slice(0, 4);
  const evidenceReady = sourceCount + conceptCount > 0;
  const researchStages: Array<{ label: string; detail: string; state: ShellResearchStageState }> = [
    {
      label: isZh ? "证据" : "Evidence",
      detail: evidenceReady
        ? `${sourceCount} ${isZh ? "资料" : "sources"} / ${conceptCount} ${isZh ? "概念" : "concepts"}`
        : isZh ? "等待 vault 资料" : "Waiting for vault evidence",
      state: evidenceReady ? "ready" : "warning",
    },
    {
      label: isZh ? "模型" : "Model",
      detail: readiness.llmReady ? readiness.llmLabel : isZh ? "未就绪" : "not ready",
      state: readiness.llmReady ? "ready" : "warning",
    },
    {
      label: isZh ? "搜索" : "Search",
      detail: readiness.searchReady ? readiness.searchLabel : isZh ? "仅本地" : "local only",
      state: readiness.searchReady ? "ready" : "warning",
    },
    {
      label: isZh ? "提案" : "Proposal",
      detail: proposalBusy
        ? isZh ? "生成中" : "creating"
        : proposalCount > 0
          ? `${proposalCount} ${isZh ? "个待审" : "saved"}`
          : isZh ? "尚未生成" : "not created",
      state: proposalBusy ? "running" : proposalCount > 0 ? "done" : "warning",
    },
  ];
  const statusLabel = (status: WritebackProposal["status"]) => {
    if (!isZh) return status === "review_only" ? "review artifact" : status;
    const labels: Record<string, string> = {
      proposed: "待审核",
      approved: "已批准",
      rejected: "已拒绝",
      applied: "已应用",
      review_only: "仅审核",
    };
    return labels[status] ?? status;
  };
  const researchLabel = isZh ? "深度研究" : "Deep Research";
  return (
    <section className="shell-research-panel" aria-label={researchLabel}>
      <div className="shell-research-header">
        <div>
          <strong>{researchLabel}</strong>
          <span>{isZh ? "Wiki 证据优先" : "Vault evidence first"}</span>
        </div>
        <button type="button" onClick={onClose} title={isZh ? "关闭深度研究" : "Close Deep Research"}>
          <XCircle size={15} />
        </button>
      </div>

      <div className="shell-research-metrics">
        <span><strong>{sourceCount}</strong>{isZh ? "资料" : "sources"}</span>
        <span><strong>{conceptCount}</strong>{isZh ? "概念" : "concepts"}</span>
        <span><strong>{reviewCount}</strong>{isZh ? "审核" : "reviews"}</span>
        <span><strong>{proposalCount}</strong>{isZh ? "提案" : "proposals"}</span>
      </div>

      <div className="shell-research-boundary">
        <span>{isZh ? "本地证据" : "local evidence"}</span>
        <span>{isZh ? "外部检索需配置" : "search gated"}</span>
        <span>{isZh ? "先生成提案" : "proposal first"}</span>
      </div>

      <div className="shell-research-stage-rail" aria-label={isZh ? "研究任务状态" : "Research task status"}>
        {researchStages.map((stage, index) => (
          <div key={stage.label} className={classNames("shell-research-stage", stage.state)}>
            <span>{index + 1}</span>
            <strong>{stage.label}</strong>
            <em>{stage.detail}</em>
          </div>
        ))}
      </div>

      <div className="shell-research-readiness" aria-label={isZh ? "研究能力状态" : "Research capability status"}>
        <div className={classNames("shell-research-readiness-card", readiness.llmReady ? "ready" : "warning")}>
          <div><TerminalSquare size={14} /><span>{isZh ? "大模型" : "LLM provider"}</span></div>
          <strong>{readiness.llmLabel}</strong>
          <em>{readiness.llmDetail}</em>
        </div>
        <div className={classNames("shell-research-readiness-card", readiness.searchReady ? "ready" : "warning")}>
          <div><Search size={14} /><span>{isZh ? "搜索源" : "Search source"}</span></div>
          <strong>{readiness.searchLabel}</strong>
          <em>{readiness.searchDetail}</em>
        </div>
      </div>

      <textarea
        value={topic}
        onChange={(event) => onTopicChange(event.target.value)}
        placeholder={isZh ? "输入研究主题" : "Research topic"}
      />

      <div className="shell-research-target">
        <span>{isZh ? "提案目标" : "proposal target"}</span>
        <code>{targetPath || "reviews/query-writeback/deep-research-topic.md"}</code>
      </div>

      <div className="shell-research-tasks">
        <div className="shell-research-tasks-head">
          <strong>{isZh ? "研究任务" : "Research tasks"}</strong>
          <span>{visibleProposals.length}/{proposalCount}</span>
        </div>
        <div className="shell-research-task-card active">
          <span className="status-chip proposed">{proposalBusy ? (isZh ? "生成中" : "creating") : (isZh ? "待生成" : "ready")}</span>
          <strong>{trimmedTopic || (isZh ? "输入研究主题" : "Enter a research topic")}</strong>
          <em>{targetPath || "reviews/query-writeback/deep-research-topic.md"}</em>
        </div>
        {visibleProposals.length === 0 ? (
          <p className="shell-research-empty">{isZh ? "生成提案后，最近的研究结果会固定在这里。" : "Generated proposals appear here as saved research results."}</p>
        ) : (
          visibleProposals.map((proposal) => (
            <button
              key={proposal.proposalId}
              type="button"
              className="shell-research-task-card"
              onClick={() => onSelectProposal(proposal)}
            >
              <span className={classNames("status-chip", proposal.status)}>{statusLabel(proposal.status)}</span>
              <strong>{proposal.title}</strong>
              <em>{proposal.targetPath}</em>
            </button>
          ))
        )}
      </div>

      <div className="shell-research-actions">
        <button type="button" onClick={() => onSubmit(topic)} disabled={!trimmedTopic}>
          <Search size={14} />{isZh ? "开始研究" : "Start research"}
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => void onCreateProposal(topic)}
          disabled={!trimmedTopic || proposalBusy}
        >
          <GitCompare size={14} />{proposalBusy ? (isZh ? "生成中" : "Creating") : (isZh ? "生成提案" : "Create proposal")}
        </button>
        <button type="button" onClick={onOpenWriteback}>
          <GitCompare size={14} />{isZh ? "写回" : "Writeback"}
        </button>
        <button type="button" onClick={onOpenSettings}>
          <Settings size={14} />{isZh ? "设置" : "Settings"}
        </button>
      </div>
    </section>
  );
}

const copyLabelZh: Record<string, string> = {
  "entry path": "入口路径",
  "Obsidian URI": "Obsidian 链接",
  "source path": "资料路径",
  "claim id": "论断 ID",
  "graph node path": "图谱节点路径",
  "detail path": "详情路径",
  "claim text": "论断文本",
  "warning id": "警告 ID",
  "proposal diff": "提案差异",
};

const navigationItems = [
  { id: "chat", label: "Wiki Chat", icon: MessageSquare },
  { id: "dashboard", label: "Dashboard", icon: SquareStack },
  { id: "sources", label: "Sources", icon: FileInput },
  { id: "claims", label: "Claims", icon: ClipboardList },
  { id: "concepts", label: "Concepts", icon: Database },
  { id: "reviews", label: "Reviews", icon: AlertTriangle },
  { id: "traceability", label: "Traceability", icon: ShieldCheck },
  { id: "writeback", label: "Query / Writeback", icon: GitCompare },
  { id: "graph", label: "Evidence Graph", icon: Network },
  { id: "activity", label: "Activity", icon: TerminalSquare },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

type ShellPage = (typeof navigationItems)[number]["id"];
type SidebarTreeMode = "knowledge" | "files";
type NavBadge = {
  value: string | number;
  tone?: "neutral" | "warning" | "danger" | "live";
  title: string;
};
type CommandPaletteItem = {
  id: string;
  label: string;
  section: string;
  detail: string;
  keywords: string[];
  disabled?: boolean;
  run: () => void | Promise<void>;
};

const pageTitles: Record<ShellPage, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Vault health, next actions, and ingest path.",
  },
  sources: {
    title: "Raw Sources",
    subtitle: "Raw evidence, source registry links, parsed artifacts, and traceability status.",
  },
  claims: {
    title: "Claims",
    subtitle: "Evidence-backed claim ledger with review and verdict controls.",
  },
  concepts: {
    title: "Concepts",
    subtitle: "Generated concept pages and their supporting vault context.",
  },
  reviews: {
    title: "Reviews",
    subtitle: "Science review queue, follow-up actions, and approval boundaries.",
  },
  traceability: {
    title: "Traceability",
    subtitle: "Broken evidence chains, missing anchors, contract findings, and impact graph.",
  },
  writeback: {
    title: "Query / Writeback",
    subtitle: "Evidence-backed insight generation with proposal-first writeback.",
  },
  chat: {
    title: "Wiki Chat",
    subtitle: "Ask the vault first: search evidence, draft grounded answers, and promote useful insight into proposals.",
  },
  graph: {
    title: "Evidence Graph",
    subtitle: "Source, claim, concept, review, warning, and proposal relationships for trusted research.",
  },
  activity: {
    title: "Activity",
    subtitle: "Runtime jobs, persisted history, logs, cancel, timeout, and retry.",
  },
  settings: {
    title: "Settings",
    subtitle: "Runtime, parser, Obsidian, and release-oriented desktop settings.",
  },
};

const shellCopy: Record<UiLanguage, {
  nav: Record<ShellPage, string>;
  pages: Record<ShellPage, { title: string; subtitle: string }>;
  runtimeActions: Record<string, string>;
  pipeline: string[];
  languageToggle: string;
  brandSubtitleWithVault: string;
  brandSubtitleNoVault: string;
  drawerTitle: string;
  noVault: string;
  entryPending: string;
  vaultManagement: string;
  open: string;
  refresh: string;
  createVault: string;
  folder: string;
  finder: string;
  obsidian: string;
  copyPath: string;
  copyUri: string;
  enableObsidianProfile: string;
  nextActionTitle: string;
  nextActionHelp: string;
  selectEvidence: string;
  importDropTitle: string;
  importDropQueued: string;
  importDropInboxOnly: string;
  importFiles: string;
  importFolder: string;
  preserveFolderContext: string;
  actionStrip: {
    plan: string;
    lint: string;
    pipeline: string;
    repair: string;
    diagnostic: string;
  };
  stateLabels: {
    ready: string;
    needsRefresh: string;
    history: string;
    proposals: string;
    searchableRecords: string;
    links: string;
    warnings: string;
    running: string;
  };
  pageActions: {
    extractClaims: string;
    reviewQueue: string;
    scienceReview: string;
    traceability: string;
    contractLint: string;
    diagnosticBundle: string;
    generateProposal: string;
    openReviews: string;
    saveSettings: string;
    chooseRuntime: string;
  };
  activity: {
    title: string;
    idle: string;
    cancel: string;
    openLog: string;
    retry: string;
    emptyHistory: string;
  };
  labels: Record<string, string>;
  dialogs: Record<string, string>;
  errors: Record<string, string>;
}> = {
  zh: {
    nav: {
      chat: "Wiki 问答",
      dashboard: "仪表盘",
      sources: "原始资料",
      claims: "论断",
      concepts: "概念",
      reviews: "审核",
      traceability: "可追踪性",
      writeback: "问答 / 写回",
      graph: "证据图谱",
      activity: "活动",
      settings: "设置",
    },
    pages: {
      dashboard: { title: "仪表盘", subtitle: "查看知识库状态、下一步动作，以及用户应该继续的导入路径。" },
      sources: { title: "原始资料", subtitle: "管理原始证据、资料登记、解析产物和可追踪状态。" },
      claims: { title: "论断", subtitle: "带证据的论断台账、审核和结论控制。" },
      concepts: { title: "概念", subtitle: "生成的概念页，以及支撑它们的知识库上下文。" },
      reviews: { title: "审核", subtitle: "科学审核队列、后续动作和审批边界。" },
      traceability: { title: "可追踪性", subtitle: "断裂证据链、缺失锚点、合约发现和影响图。" },
      writeback: { title: "问答 / 写回", subtitle: "基于证据生成洞察，并先生成提案再写回。" },
      chat: { title: "Wiki 问答", subtitle: "先问知识库：搜索证据、生成可信回答，并把高价值洞察转成可审核提案。" },
      graph: { title: "证据图谱", subtitle: "展示资料、论断、概念、审核、警告和提案之间的可信证据关系。" },
      activity: { title: "活动", subtitle: "运行任务、持久历史、日志、取消、超时和重试。" },
      settings: { title: "设置", subtitle: "运行时、解析器、Obsidian 和发布相关桌面设置。" },
    },
    runtimeActions: {
      lint: "运行合约检查",
      parse_pdfs: "本地解析 PDF",
      obsidian_setup: "配置 Obsidian",
      status_dashboard: "刷新仪表盘",
      discover: "发现资料",
      claims: "抽取论断",
      semantic_qa: "语义 QA",
      science_review: "科学审核",
      concept_revision_preview: "概念预览",
      concept_revision_apply: "应用概念",
      cancel_probe: "取消测试",
      timeout_probe: "超时测试 2s",
    },
    pipeline: ["导入", "解析 PDF / Markdown", "生成资料草稿", "独立 QA", "发布稳定资料", "抽取论断", "指标归一化", "语义 QA", "冲突扫描", "科学审核队列", "概念修订", "合约检查"],
    languageToggle: "English",
    brandSubtitleWithVault: "知识库命令中心",
    brandSubtitleNoVault: "选择或创建知识库",
    drawerTitle: "知识库 / 检查器",
    noVault: "未选择知识库",
    entryPending: "入口笔记待生成",
    vaultManagement: "知识库管理",
    open: "打开",
    refresh: "刷新",
    createVault: "创建知识库",
    folder: "文件夹",
    finder: "Finder",
    obsidian: "Obsidian",
    copyPath: "复制路径",
    copyUri: "复制 URI",
    enableObsidianProfile: "创建时启用 Obsidian 配置",
    nextActionTitle: "下一步",
    nextActionHelp: "用左侧导航检查不同工作流，同时保留当前知识库上下文。",
    selectEvidence: "选择证据后查看路径、证据和可执行动作。",
    importDropTitle: "导入 PDF / Markdown / TXT / ZIP / 文件夹",
    importDropQueued: "导入后写入运行时管理的导入队列",
    importDropInboxOnly: "仅进入原始收件箱，等待手动规划",
    importFiles: "导入文件",
    importFolder: "导入文件夹",
    preserveFolderContext: "保留目录上下文",
    actionStrip: {
      plan: "规划导入",
      lint: "合约检查",
      pipeline: "运行处理流程",
      repair: "修复模板",
      diagnostic: "诊断包",
    },
    activity: {
      title: "活动面板",
      idle: "空闲",
      cancel: "取消当前任务",
      openLog: "打开运行日志",
      retry: "重试同类任务",
      emptyHistory: "暂无持久运行任务记录。",
    },
    labels: {
      vault: "知识库",
      recent: "最近",
      suggestions: "建议",
      rawInbox: "原始证据",
      publishedSources: "已发布资料",
      blocked: "阻塞",
      claims: "论断",
      needsReview: "待审核",
      contradicted: "冲突",
      conceptPages: "概念页",
      growthQueue: "增长队列",
      reports: "报告",
      openReviews: "未处理审核",
      scienceQueue: "科学审核队列",
      warnings: "警告",
      evidenceBreaks: "证据断点",
      contract: "P0/P1 合约",
      proposals: "提案",
      approved: "已批准",
      applied: "已应用",
      currentJob: "当前任务",
      history: "历史",
      failures: "失败",
      runtime: "运行时",
      parser: "解析器",
      cloudParsing: "云解析",
      sources: "资料",
      concepts: "概念",
      reviews: "审核",
      ready: "可用",
      missing: "缺失",
      off: "关闭",
      allowed: "已允许",
      notSelected: "未选择",
      inspecting: "检查中",
      schemaValid: "结构有效",
      schemaInvalid: "结构无效",
      runtimeReady: "运行时可用",
      runtimeMissing: "运行时缺失",
      obsidianEnabled: "Obsidian 已启用",
      obsidianOff: "Obsidian 未启用",
      dashboardReady: "仪表盘可用",
      dashboardMissing: "仪表盘缺失",
    },
    stateLabels: {
      ready: "就绪",
      needsRefresh: "需刷新",
      history: "条历史",
      proposals: "个提案",
      searchableRecords: "条可搜索记录",
      links: "条链接",
      warnings: "个警告",
      running: "运行中",
    },
    pageActions: {
      extractClaims: "抽取论断",
      reviewQueue: "审核队列",
      scienceReview: "科学审核",
      traceability: "可追踪性",
      contractLint: "合约检查",
      diagnosticBundle: "诊断包",
      generateProposal: "生成提案",
      openReviews: "打开审核",
      saveSettings: "保存设置",
      chooseRuntime: "选择运行时",
    },
    dialogs: {
      chooseVault: "选择 open-llm-wiki 知识库",
      chooseRuntime: "选择 open-llm-wiki 运行时仓库或已安装知识库",
      chooseParent: "选择新 Wiki Project 的父目录",
      importFiles: "导入 PDF / Markdown / txt / zip 到 raw/inbox",
      importFolder: "导入文件夹到 raw/inbox",
    },
    errors: {
      createVaultPath: "请先填写要创建的知识库绝对路径。",
      createProject: "请填写 Project Name 并选择 Parent Directory。",
      createProjectWebUnavailable: "当前浏览器预览无法创建本地目录。请使用 Tauri 桌面端创建项目。",
      dropNoPath: "拖拽事件没有提供本地文件路径，请使用导入文件或导入文件夹按钮。",
      openProjectWebUnavailable: "当前浏览器预览无法打开本地目录。请使用 Tauri 桌面端打开项目。",
    },
  },
  en: {
    nav: Object.fromEntries(navigationItems.map((item) => [item.id, item.label])) as Record<ShellPage, string>,
    pages: pageTitles,
    runtimeActions: Object.fromEntries(runtimeActions.map((item) => [item.id, item.label])) as Record<string, string>,
    pipeline,
    languageToggle: "中文",
    brandSubtitleWithVault: "Vault command center",
    brandSubtitleNoVault: "Choose or create a vault",
    drawerTitle: "Vault / Inspector",
    noVault: "No vault selected",
    entryPending: "Entry note pending",
    vaultManagement: "Vault management",
    open: "Open",
    refresh: "Refresh",
    createVault: "Create vault",
    folder: "Folder",
    finder: "Finder",
    obsidian: "Obsidian",
    copyPath: "Copy path",
    copyUri: "Copy URI",
    enableObsidianProfile: "Enable Obsidian profile when creating",
    nextActionTitle: "Next Action",
    nextActionHelp: "Use the navigation rail to inspect focused workflows without losing vault context.",
    selectEvidence: "Select evidence to inspect its path, provenance, and actions.",
    importDropTitle: "Import PDF / Markdown / txt / zip / folder",
    importDropQueued: "After import, enqueue into the runtime-owned ingest queue",
    importDropInboxOnly: "Import into raw/inbox only, then plan manually",
    importFiles: "Import files",
    importFolder: "Import folder",
    preserveFolderContext: "Preserve folder context",
    actionStrip: {
      plan: "Plan ingest",
      lint: "Contract lint",
      pipeline: "Run ingest pipeline",
      repair: "Repair templates",
      diagnostic: "Diagnostic bundle",
    },
    activity: {
      title: "Activity Panel",
      idle: "idle",
      cancel: "Cancel current job",
      openLog: "Open run log",
      retry: "Retry similar task",
      emptyHistory: "No persisted runtime job history yet.",
    },
    labels: {
      vault: "Vault",
      recent: "Recent",
      suggestions: "Suggestions",
      rawInbox: "Raw evidence",
      publishedSources: "Published sources",
      blocked: "Blocked",
      claims: "Claims",
      needsReview: "Needs review",
      contradicted: "Contradicted",
      conceptPages: "Concept pages",
      growthQueue: "Growth queue",
      reports: "Reports",
      openReviews: "Open reviews",
      scienceQueue: "Science queue",
      warnings: "Warnings",
      evidenceBreaks: "Evidence breaks",
      contract: "P0/P1 contract",
      proposals: "Proposals",
      approved: "Approved",
      applied: "Applied",
      currentJob: "Current job",
      history: "History",
      failures: "Failures",
      runtime: "Runtime",
      parser: "Parser",
      cloudParsing: "Cloud parsing",
      sources: "Sources",
      concepts: "Concepts",
      reviews: "Reviews",
      ready: "ready",
      missing: "missing",
      off: "off",
      allowed: "allowed",
      notSelected: "not selected",
      inspecting: "Inspecting vault",
      schemaValid: "Schema",
      schemaInvalid: "Schema issue",
      runtimeReady: "Runtime",
      runtimeMissing: "Runtime missing",
      obsidianEnabled: "Obsidian",
      obsidianOff: "Obsidian off",
      dashboardReady: "Dashboard",
      dashboardMissing: "Dashboard missing",
    },
    stateLabels: {
      ready: "ready",
      needsRefresh: "needs refresh",
      history: "history",
      proposals: "proposals",
      searchableRecords: "searchable records",
      links: "links",
      warnings: "warnings",
      running: "running",
    },
    pageActions: {
      extractClaims: "Extract claims",
      reviewQueue: "Review queue",
      scienceReview: "Science review",
      traceability: "Traceability",
      contractLint: "Contract lint",
      diagnosticBundle: "Diagnostic bundle",
      generateProposal: "Generate proposal",
      openReviews: "Open reviews",
      saveSettings: "Save settings",
      chooseRuntime: "Choose runtime",
    },
    dialogs: {
      chooseVault: "Choose open-llm-wiki vault",
      chooseRuntime: "Choose open-llm-wiki runtime repository or installed vault",
      chooseParent: "Choose parent directory for the new Wiki Project",
      importFiles: "Import PDF / Markdown / txt / zip to raw/inbox",
      importFolder: "Import folders to raw/inbox",
    },
    errors: {
      createVaultPath: "Enter an absolute path for the vault first.",
      createProject: "Enter a Project Name and choose a Parent Directory.",
      createProjectWebUnavailable: "This browser preview cannot create local folders. Use the Tauri desktop app to create a project.",
      dropNoPath: "The drag event did not provide local file paths. Use Import files or Import folder.",
      openProjectWebUnavailable: "This browser preview cannot open local folders. Use the Tauri desktop app to open a project.",
    },
  },
};

const terminalRuntimeStatuses: RuntimeJobStatus[] = ["completed", "succeeded", "failed", "timeout", "timed_out", "cancelled"];
const retryableRuntimeStatuses: RuntimeJobStatus[] = ["failed", "timeout", "timed_out", "cancelled"];
const DEFAULT_IMPORT_DIALOG_EXTENSIONS = ["pdf", "md", "markdown", "txt", "zip", "docx", "pptx", "xlsx", "csv"];

const initialDesktopSettings: DesktopSettings = {
  runtimePath: "",
  pythonPath: "python3",
  uvPath: "uv",
  projectName: "",
  projectTemplate: "research",
  projectPurpose: "",
  aiOutputLanguage: "简体中文",
  interfaceLanguage: "zh",
  parentDirectory: "",
  layoutParsingApiUrl: "",
  layoutParsingTokenPresent: false,
  cloudParsingAllowed: false,
  defaultPdfParser: "paddleocr-vl15",
  defaultIngestMode: "inbox_only",
  defaultObsidianProfile: "minimal",
  embeddingEnabled: false,
  embeddingEndpoint: "",
  embeddingApiKeyEnvVar: "EMBEDDING_API_KEY",
  embeddingModel: "",
  embeddingOutputDimensions: 0,
  embeddingMaxChunkChars: 1000,
  embeddingOverlapChunkChars: 200,
  captioningEnabled: false,
  captioningUseMainProvider: true,
  captioningProvider: "main-llm",
  captioningEndpoint: "",
  captioningApiKeyEnvVar: "VISION_API_KEY",
  captioningModel: "",
  captioningConcurrency: 2,
  webSearchEnabled: false,
  webSearchProvider: "none",
  webSearchApiKeyEnvVar: "TAVILY_API_KEY",
  webSearchEndpoint: "",
  webSearchCategories: "general",
  webSearchAuditLog: true,
  proxyEnabled: false,
  proxyUrl: "",
  proxyBypassLocal: true,
  sourceWatchEnabled: false,
  sourceWatchAutoIngest: false,
  sourceWatchAllowedExtensions: "pdf, md, txt, docx, pptx, xlsx, csv",
  sourceWatchExcludeDirs: ".git, node_modules, .obsidian",
  sourceWatchExcludeExtensions: "tmp, bak, exe, dll, dmg",
  sourceWatchExcludeGlobs: "*.draft.*, ~$*, .~lock.*#",
  sourceWatchMaxFileSizeMb: 100,
  scheduledImportEnabled: false,
  scheduledImportPath: "raw/inbox",
  scheduledImportIntervalMinutes: 60,
  chatHistoryMessages: 8,
  interfaceDensity: "comfortable",
  retryCount: 3,
  timeoutSeconds: 1800,
  autoRunLintAfterWrites: true,
  autoOpenReportsAfterFailures: false,
  skipObsidianPluginDownloads: true,
  ocrParser: {
    enabled: false,
    providerId: "paddleocr-vl15",
    endpoint: "",
    apiKeyEnvVar: "PADDLEOCR_API_KEY",
    model: "PaddleOCR-VL-1.6",
  },
  llmProviderCenter: {
    activeProviderId: null,
    providers: {},
  },
};

const shellDemoVaultPath = "/Users/demo/DeepSeek LLM Wiki";
const shellDemoGeneratedAt = "2026-05-27T12:00:00.000Z";

const shellDemoFiles: VaultFile[] = [
  {
    name: "Home.md",
    path: "Home.md",
    kind: "note",
    title: "DeepSeek Wiki Home",
    status: "entrypoint",
    updated: "2026-05-27",
    outboundLinks: [
      "concepts/deepseek-research-strategy.md",
      "concepts/deepseek-decision-logic.md",
      "reviews/query-writeback/deepseek-research-insights.md",
    ],
  },
  {
    name: "deepseek-research-strategy.md",
    path: "concepts/deepseek-research-strategy.md",
    kind: "concept",
    title: "DeepSeek Research Strategy",
    status: "synthesis",
    updated: "2026-05-27",
    inboundLinks: ["Home.md"],
    outboundLinks: ["sources/LLM-0001-deepseek-v3.md", "sources/LLM-0002-deepseek-r1.md"],
    sourceRefs: ["LLM-0001", "LLM-0002"],
  },
  {
    name: "deepseek-decision-logic.md",
    path: "concepts/deepseek-decision-logic.md",
    kind: "concept",
    title: "DeepSeek Decision Logic",
    status: "needs_review",
    updated: "2026-05-27",
    inboundLinks: ["Home.md"],
    outboundLinks: ["sources/LLM-0003-deepseek-moe.md"],
    sourceRefs: ["LLM-0003"],
  },
  {
    name: "deepseek-evolution-forecast.md",
    path: "concepts/deepseek-evolution-forecast.md",
    kind: "concept",
    title: "DeepSeek Evolution Forecast",
    status: "hypothesis",
    updated: "2026-05-27",
    sourceRefs: ["LLM-0001", "LLM-0002", "LLM-0004"],
  },
  {
    name: "LLM-0001-deepseek-v3.md",
    path: "sources/LLM-0001-deepseek-v3.md",
    kind: "source",
    sourceId: "LLM-0001",
    title: "DeepSeek-V3 Technical Report",
    status: "published",
    updated: "2026-05-27",
    outboundLinks: ["concepts/deepseek-research-strategy.md"],
  },
  {
    name: "LLM-0002-deepseek-r1.md",
    path: "sources/LLM-0002-deepseek-r1.md",
    kind: "source",
    sourceId: "LLM-0002",
    title: "DeepSeek-R1 Reasoning Report",
    status: "published",
    updated: "2026-05-27",
    outboundLinks: ["concepts/deepseek-research-strategy.md"],
  },
  {
    name: "LLM-0003-deepseek-moe.md",
    path: "drafts/LLM-0003-deepseek-moe.md",
    kind: "draft",
    sourceId: "LLM-0003",
    title: "DeepSeekMoE Source Draft",
    status: "qa_pending",
    updated: "2026-05-27",
    outboundLinks: ["concepts/deepseek-decision-logic.md"],
  },
  {
    name: "reading-quality.md",
    path: "reports/reading-quality.md",
    kind: "report",
    title: "Reading Quality Report",
    status: "2 warnings",
    updated: "2026-05-27",
  },
  {
    name: "deepseek-research-insights.md",
    path: "reviews/query-writeback/deepseek-research-insights.md",
    kind: "report",
    title: "DeepSeek Research Insight Proposal",
    status: "proposed",
    updated: "2026-05-27",
  },
];

const shellDemoStatus: VaultStatus = {
  path: shellDemoVaultPath,
  schemaValid: true,
  runtimeInstalled: true,
  vaultLocalRuntimeInstalled: true,
  externalRuntimeReady: false,
  obsidianEnabled: true,
  dashboardAvailable: true,
  runtimeScriptsPath: "open-llm-wiki/scripts",
  runtimeVersion: "shell-demo",
  runtimeIdentity: {
    source: "vault-local",
    path: "open-llm-wiki",
    scriptsPath: "open-llm-wiki/scripts",
    version: "shell-demo",
    ready: true,
    git: null,
    warnings: [],
  },
  vaultLocalRuntime: {
    source: "vault-local",
    path: "open-llm-wiki",
    scriptsPath: "open-llm-wiki/scripts",
    version: "shell-demo",
    ready: true,
    git: null,
    warnings: [],
  },
  externalRuntime: null,
  lastUpdated: shellDemoGeneratedAt,
  counts: {
    inbox: 2,
    notes: 1,
    sources: 2,
    drafts: 1,
    concepts: 3,
    reports: 2,
    claims: 12,
    claimsNeedingReview: 3,
    scienceReviewQueue: 3,
    growthQueue: 2,
    staleClaims: 1,
    contradictedClaims: 0,
    ingestJobs: 4,
    actions: 3,
  },
  readingQuality: {
    concepts: 3,
    sources: 2,
    findings: 2,
    trustIssues: 1,
    duplicateGroups: 0,
    orphanConcepts: 0,
    staleEvidenceReferences: 1,
    brokenEvidenceReferences: 1,
    sourceIdentityDrift: 0,
    lowSynthesisConcepts: 1,
    reportPath: "reports/reading-quality.md",
  },
  productScorecard: {
    passed: 9,
    failed: 1,
    manual: 2,
    notRun: 1,
    reportPath: "reports/product-scorecard.md",
  },
  files: shellDemoFiles,
  errors: [],
};

const shellDemoClaims: ClaimLedgerItem[] = [
  {
    claimId: "claim-demo-001",
    claimText: "DeepSeek repeatedly frames architecture choices around compute efficiency before scaling breadth.",
    sourceId: "LLM-0001",
    sourceUuid: "source-demo-0001",
    sourcePath: "sources/LLM-0001-deepseek-v3.md",
    verdict: "supported",
    status: "supported",
    needsReview: false,
    concepts: ["deepseek-research-strategy"],
    evidenceQuote: "Efficiency-first model design is treated as a primary constraint in the source evidence.",
    evidenceHash: "demo-evidence-001",
    updatedAt: shellDemoGeneratedAt,
    line: 42,
  },
  {
    claimId: "claim-demo-002",
    claimText: "The R1-style reasoning path should be separated from forecast claims until a human review accepts the synthesis.",
    sourceId: "LLM-0002",
    sourceUuid: "source-demo-0002",
    sourcePath: "sources/LLM-0002-deepseek-r1.md",
    verdict: "needs_review",
    status: "needs_review",
    needsReview: true,
    concepts: ["deepseek-evolution-forecast"],
    evidenceQuote: "The evidence supports reasoning training as a direction, not a guaranteed roadmap.",
    evidenceHash: "demo-evidence-002",
    updatedAt: shellDemoGeneratedAt,
    line: 88,
  },
];

const shellDemoEvidencePaths: EvidencePathItem[] = [
  {
    claimId: "claim-demo-001",
    concept: "deepseek-research-strategy",
    claimText: shellDemoClaims[0].claimText,
    chainStatus: "ok",
    missing: [],
    sourceId: "LLM-0001",
    sourceUuid: "source-demo-0001",
    sourcePage: "sources/LLM-0001-deepseek-v3.md",
    evidenceAnchor: "#efficiency",
    evidenceQuote: shellDemoClaims[0].evidenceQuote,
    rawPath: "raw/deepseek_paper/DeepSeek-V3.pdf",
    artifactPath: "artifacts/LLM-0001/markdown.md",
    chunksPath: "artifacts/LLM-0001/chunks.jsonl",
    semanticStatus: "supported",
    scienceReviewStatus: "not_required",
  },
  {
    claimId: "claim-demo-002",
    concept: "deepseek-evolution-forecast",
    claimText: shellDemoClaims[1].claimText,
    chainStatus: "needs_review",
    missing: ["science_review"],
    sourceId: "LLM-0002",
    sourceUuid: "source-demo-0002",
    sourcePage: "sources/LLM-0002-deepseek-r1.md",
    evidenceAnchor: "#reasoning",
    evidenceQuote: shellDemoClaims[1].evidenceQuote,
    rawPath: "raw/deepseek_paper/DeepSeek-R1.pdf",
    artifactPath: "artifacts/LLM-0002/markdown.md",
    chunksPath: "artifacts/LLM-0002/chunks.jsonl",
    semanticStatus: "needs_review",
    scienceReviewStatus: "queued",
  },
];

const shellDemoTraceabilityWarnings: TraceabilityWarning[] = [
  {
    warningId: "warning-demo-001",
    claimId: "claim-demo-002",
    claimText: shellDemoClaims[1].claimText,
    claimPath: "claims/deepseek-evolution-forecast.md",
    sourceId: "LLM-0002",
    sourcePath: "sources/LLM-0002-deepseek-r1.md",
    artifactPath: "artifacts/LLM-0002/markdown.md",
    missingHeading: "",
    missingAnchor: "#reasoning",
    severity: "p2",
    summary: "Forecast claim still needs explicit evidence review before writeback.",
    suggestedAction: "Open the review queue and keep the proposal in proposed status.",
    nextAction: "review",
    findingId: "finding-demo-001",
  },
];

const shellDemoReviewItems: ReviewQueueItem[] = [
  {
    itemId: "review-demo-001",
    kind: "science_review",
    severity: "p1",
    title: "Review DeepSeek evolution forecast claim",
    body: "The claim is useful for the insight page, but it must remain a hypothesis until a reviewer checks the cited source.",
    status: "open",
    targetPath: "concepts/deepseek-evolution-forecast.md",
    sourceId: "LLM-0002",
    claimId: "claim-demo-002",
    evidencePath: "artifacts/LLM-0002/chunks.jsonl",
    recommendedAction: "Keep proposal-first writeback and request human review.",
  },
];

const shellDemoWritebacks: WritebackProposal[] = [
  {
    proposalId: "proposal-demo-001",
    targetPath: "reviews/query-writeback/deepseek-research-insights.md",
    title: "DeepSeek research insight query",
    status: "proposed",
    diff: [
      "+ ## Evidence",
      "+ - Supported: efficiency-first architecture pressure from [[sources/LLM-0001-deepseek-v3.md]].",
      "+ ## Hypothesis",
      "+ - Reasoning evolution remains a forecast until science review accepts [[claims/deepseek-evolution-forecast.md]].",
    ].join("\n"),
    content: "Evidence, inference, hypothesis, and forecast are separated before writeback.",
    createdAt: shellDemoGeneratedAt,
    updatedAt: shellDemoGeneratedAt,
  },
];

const shellDemoIngestPlan: IngestPlan = {
  generatedAt: shellDemoGeneratedAt,
  vaultPath: shellDemoVaultPath,
  planPath: "reports/ingest-plan.json",
  summary: {
    total: 4,
    ready: 1,
    stageable: 1,
    blocked: 1,
    cached: 0,
    published: 1,
  },
  entries: [
    {
      sourcePath: "raw/deepseek_paper/DeepSeek-V3.pdf",
      fileName: "DeepSeek-V3.pdf",
      sha256: "demo-sha256-v3",
      artifactSha256: null,
      artifactPath: null,
      status: "ready",
      action: "parse_required",
      reason: "Local parser is ready; no cloud parser required.",
      parserHint: "local-text",
      currentState: "raw copied",
      nextActionLabel: "Parse locally",
      command: ["uv", "run", "python", "scripts/wiki_ingest.py"],
      inputs: ["raw/deepseek_paper/DeepSeek-V3.pdf"],
      outputs: ["artifacts/LLM-0001/markdown.md"],
      requiresHumanApproval: false,
      usesNetwork: false,
    },
    {
      sourcePath: "raw/deepseek_paper/DeepSeek-R1.pdf",
      fileName: "DeepSeek-R1.pdf",
      sha256: "demo-sha256-r1",
      artifactSha256: "demo-artifact-r1",
      artifactPath: "artifacts/LLM-0002/markdown.md",
      status: "published",
      action: "none",
      reason: "Source page is published and linked to claims.",
      parserHint: "local-text",
      currentState: "published",
      nextActionLabel: "Review claims",
      command: [],
      inputs: ["raw/deepseek_paper/DeepSeek-R1.pdf"],
      outputs: ["sources/LLM-0002-deepseek-r1.md"],
      requiresHumanApproval: false,
      usesNetwork: false,
    },
    {
      sourcePath: "raw/deepseek_paper/DeepSeekMoE.pdf",
      fileName: "DeepSeekMoE.pdf",
      sha256: "demo-sha256-moe",
      artifactSha256: null,
      artifactPath: "artifacts/LLM-0003/markdown.md",
      status: "stageable",
      action: "publish_required",
      reason: "Parsed draft exists, but publish gate has not run.",
      parserHint: "local-text",
      currentState: "draft",
      nextActionLabel: "Publish source",
      command: ["uv", "run", "python", "scripts/wiki_publish.py"],
      inputs: ["artifacts/LLM-0003/markdown.md"],
      outputs: ["sources/LLM-0003-deepseek-moe.md"],
      requiresHumanApproval: false,
      usesNetwork: false,
    },
    {
      sourcePath: "raw/deepseek_paper/DeepSeekMath.pdf",
      fileName: "DeepSeekMath.pdf",
      sha256: "demo-sha256-math",
      artifactSha256: null,
      artifactPath: null,
      status: "blocked",
      action: "manual_review",
      reason: "Formula-heavy sections need local parser confirmation before source publication.",
      parserHint: "local-text",
      currentState: "raw copied",
      nextActionLabel: "Review parser limits",
      command: [],
      inputs: ["raw/deepseek_paper/DeepSeekMath.pdf"],
      outputs: [],
      requiresHumanApproval: true,
      usesNetwork: false,
    },
  ],
  registry: [
    {
      sourceUuid: "source-demo-0001",
      sourceId: "LLM-0001",
      rawPath: "raw/deepseek_paper/DeepSeek-V3.pdf",
      canonicalPath: "raw/deepseek_paper/DeepSeek-V3.pdf",
      sourcePath: "sources/LLM-0001-deepseek-v3.md",
      sourceSha256: "demo-sha256-v3",
      mime: "application/pdf",
      status: "registered",
      createdAt: shellDemoGeneratedAt,
      updatedAt: shellDemoGeneratedAt,
    },
    {
      sourceUuid: "source-demo-0002",
      sourceId: "LLM-0002",
      rawPath: "raw/deepseek_paper/DeepSeek-R1.pdf",
      canonicalPath: "raw/deepseek_paper/DeepSeek-R1.pdf",
      sourcePath: "sources/LLM-0002-deepseek-r1.md",
      sourceSha256: "demo-sha256-r1",
      mime: "application/pdf",
      artifactPath: "artifacts/LLM-0002/markdown.md",
      artifactSha256: "demo-artifact-r1",
      parser: "local-text",
      parserVersion: "demo",
      status: "published",
      createdAt: shellDemoGeneratedAt,
      updatedAt: shellDemoGeneratedAt,
      publishedAt: shellDemoGeneratedAt,
    },
  ],
  sourceAliases: [],
  artifacts: [
    {
      sourcePath: "sources/LLM-0002-deepseek-r1.md",
      sourceId: "LLM-0002",
      sourceUuid: "source-demo-0002",
      artifactPath: "artifacts/LLM-0002/markdown.md",
      manifestPath: "artifacts/LLM-0002/manifest.json",
      chunksPath: "artifacts/LLM-0002/chunks.jsonl",
      parser: "local-text",
      parserVersion: "demo",
      sourceSha256: "demo-sha256-r1",
      artifactSha256: "demo-artifact-r1",
      status: "valid",
      contractValid: true,
      chunkCount: 18,
      anchorsLines: true,
      anchorsPages: true,
      anchorsTables: false,
      anchorsFigures: false,
      anchorsEquations: false,
      limitations: ["tables pending"],
      lintErrors: [],
    },
  ],
  jobs: [
    {
      jobId: "job-demo-001",
      sourceUuid: "source-demo-0001",
      sourceId: "LLM-0001",
      sourcePath: "raw/deepseek_paper/DeepSeek-V3.pdf",
      fileName: "DeepSeek-V3.pdf",
      kind: "parse",
      status: "queued",
      currentStep: "waiting",
      nextAction: "Parse locally",
      reason: "Ready for local parser.",
      attempt: 0,
      maxAttempts: 3,
      inputs: ["raw/deepseek_paper/DeepSeek-V3.pdf"],
      outputs: ["artifacts/LLM-0001/markdown.md"],
    },
  ],
  actions: [
    {
      actionId: "action-demo-001",
      kind: "science_review",
      severity: "p1",
      title: "Review forecast claim before writeback",
      body: "The insight page can cite this claim only after human review keeps forecast language separate from evidence.",
      reason: "Semantic QA marked the forecast as needs_review.",
      status: "open",
      recommendedAction: "Open Reviews",
      primaryObjectType: "claim",
      primaryObjectId: "claim-demo-002",
      affectedObjects: [{ objectType: "concept", objectId: "deepseek-evolution-forecast", status: "needs_review" }],
      links: [{ label: "review", path: "reviews/query-writeback/deepseek-research-insights.md" }],
    },
  ],
  impactEdges: [
    {
      edgeId: "edge-demo-001",
      fromType: "source",
      fromId: "LLM-0002",
      toType: "claim",
      toId: "claim-demo-002",
      relationship: "supports",
      status: "needs_review",
    },
  ],
  lintFindings: [
    {
      findingId: "finding-demo-001",
      severity: "p2",
      kind: "writeback_gate",
      objectType: "proposal",
      objectId: "proposal-demo-001",
      title: "Proposal is waiting for explicit approval",
      detail: "The shell must show that writeback is proposed, not silently applied.",
      status: "open",
      path: "reviews/query-writeback/deepseek-research-insights.md",
    },
  ],
};

const shellDemoRuntimeHistory: RuntimeJobEvent[] = [
  {
    jobId: "runtime-demo-001",
    kind: "lint",
    status: "succeeded",
    stage: "wiki_lint",
    attempt: 1,
    maxAttempts: 1,
    retryCount: 1,
    command: ["uv", "run", "python", "scripts/wiki_lint.py", "vault"],
    startedAt: shellDemoGeneratedAt,
    endedAt: shellDemoGeneratedAt,
    elapsedMs: 4200,
    durationMs: 4200,
    exitCode: 0,
    logPath: "runs/demo/wiki_lint.log",
  },
];

const shellDemoEntryNote: VaultEntryNote = {
  vaultPath: shellDemoVaultPath,
  entryPath: `${shellDemoVaultPath}/Home.md`,
  entryRelativePath: "Home.md",
  obsidianUri: "obsidian://open?path=%2FUsers%2Fdemo%2FDeepSeek%20LLM%20Wiki%2FHome.md",
  fallbackPath: shellDemoVaultPath,
  reason: "shell-demo",
  warning: null,
  isWorkspaceRoot: false,
  isRawSourceFolder: false,
};

function isShellDemoMode() {
  const viteEnv = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  return Boolean(viteEnv?.DEV)
    && !isTauriAvailable()
    && typeof window !== "undefined"
    && new URLSearchParams(window.location.search).has("shellDemo");
}

function createShellDemoQueryWritebackDraft(question: string, targetPath: string, language: UiLanguage): QueryWritebackDraft {
  const now = new Date().toISOString();
  const proposalId = `proposal-demo-${Date.now()}`;
  const summary = question.trim().split(/\n+/)[0]?.slice(0, 96) || (language === "zh" ? "Deep Research 提案" : "Deep Research proposal");
  const answer = language === "zh"
    ? [
      "Evidence: demo vault already links DeepSeek V3 efficiency claims to sources/LLM-0001-deepseek-v3.md.",
      "Inference: the research direction can be summarized only after the cited claims are reviewed.",
      "Hypothesis/forecast: R1-style reasoning evolution remains review-gated and cannot be written as fact.",
    ].join("\n")
    : [
      "Evidence: the demo vault links DeepSeek V3 efficiency claims to sources/LLM-0001-deepseek-v3.md.",
      "Inference: research direction can be summarized only after cited claims are reviewed.",
      "Hypothesis/forecast: R1-style reasoning evolution remains review-gated and cannot be written as fact.",
    ].join("\n");
  const writebackProposal = language === "zh"
    ? `目标页面：${targetPath}\n写入内容：围绕「${summary}」生成 evidence / inference / hypothesis / forecast 分层草稿。\n证据链接：sources/LLM-0001-deepseek-v3.md, claims/deepseek-evolution-forecast.md。\n风险：预测结论必须等待 science review，不可静默写入 source/concept 页面。`
    : `Target page: ${targetPath}\nWriteback content: create an evidence / inference / hypothesis / forecast draft for "${summary}".\nEvidence links: sources/LLM-0001-deepseek-v3.md, claims/deepseek-evolution-forecast.md.\nRisk: forecast conclusions require science review and must not be silently written to source/concept pages.`;
  const diffPreview = [
    `--- ${targetPath}`,
    `+++ ${targetPath}`,
    "+ ## Evidence",
    "+ - DeepSeek efficiency claims are linked to [[sources/LLM-0001-deepseek-v3.md]].",
    "+ ## Inference",
    "+ - Research strategy should remain grounded in reviewed claims.",
    "+ ## Hypothesis / Forecast",
    "+ - Reasoning evolution remains a review-gated forecast.",
  ].join("\n");
  const proposal: WritebackProposal = {
    proposalId,
    targetPath,
    title: language === "zh" ? "Deep Research 证据提案" : "Deep Research evidence proposal",
    status: "proposed",
    diff: diffPreview,
    content: writebackProposal,
    createdAt: now,
    updatedAt: now,
    appliedAt: null,
    logPath: null,
  };
  return {
    query: question,
    answer,
    citationCoverage: {
      conclusions: 3,
      cited: 2,
      unsupported: 1,
      staleOrRisky: 1,
      needsEvidenceReview: true,
      summary: language === "zh" ? "演示草稿保持 proposal-first；预测仍需人工复核。" : "Demo draft stays proposal-first; forecasts still need human review.",
    },
    evidenceMap: [
      {
        claimId: "claim-demo-001",
        claimPath: "claims/deepseek-research-strategy.md",
        claimText: shellDemoClaims[0].claimText,
        sourceId: shellDemoClaims[0].sourceId,
        sourcePath: shellDemoClaims[0].sourcePath,
        evidenceHash: shellDemoClaims[0].evidenceHash,
        quote: shellDemoClaims[0].evidenceQuote,
        verdict: shellDemoClaims[0].verdict,
        status: shellDemoClaims[0].status,
        concepts: shellDemoClaims[0].concepts,
        conclusionType: "evidence",
        confidence: "medium",
        freshnessStatus: "fresh",
      },
      {
        claimId: "claim-demo-002",
        claimPath: "claims/deepseek-evolution-forecast.md",
        claimText: shellDemoClaims[1].claimText,
        sourceId: shellDemoClaims[1].sourceId,
        sourcePath: shellDemoClaims[1].sourcePath,
        evidenceHash: shellDemoClaims[1].evidenceHash,
        quote: shellDemoClaims[1].evidenceQuote,
        verdict: shellDemoClaims[1].verdict,
        status: shellDemoClaims[1].status,
        concepts: shellDemoClaims[1].concepts,
        conclusionType: "forecast",
        confidence: "low",
        freshnessStatus: "needs_review",
        blockedReason: language === "zh" ? "需要 science review 后才能应用。" : "Requires science review before apply.",
      },
    ],
    insightCandidates: [
      language === "zh" ? "DeepSeek 研究策略应以已审核效率证据为主线。" : "DeepSeek strategy should be anchored in reviewed efficiency evidence.",
      language === "zh" ? "预测类内容必须保留 hypothesis/forecast 标签。" : "Forecast content must keep hypothesis/forecast labels.",
    ],
    uncertaintyConflicts: [
      language === "zh" ? "R1 演进方向仍是预测，不是已批准事实。" : "R1 evolution direction is still a forecast, not an approved fact.",
    ],
    writebackProposal,
    diffPreview,
    approvalStatus: "proposed",
    proposal,
  };
}

function importDialogExtensions(settings: DesktopSettings) {
  const raw = settings.sourceWatchEnabled
    ? settings.sourceWatchAllowedExtensions
    : DEFAULT_IMPORT_DIALOG_EXTENSIONS.join(",");
  const parsedExtensions = raw
    .split(/[,;\n]/)
    .map((item) => item.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
  const extensions = parsedExtensions.length ? parsedExtensions : DEFAULT_IMPORT_DIALOG_EXTENSIONS;
  const unique = new Set([...extensions, "zip"]);
  if (unique.has("md")) unique.add("markdown");
  if (unique.has("markdown")) unique.add("md");
  const excluded = settings.sourceWatchEnabled
    ? settings.sourceWatchExcludeExtensions
        .split(/[,;\n]/)
        .map((item) => item.trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean)
    : [];
  for (const extension of excluded) {
    unique.delete(extension);
    if (extension === "md") unique.delete("markdown");
    if (extension === "markdown") unique.delete("md");
  }
  unique.add("zip");
  return DEFAULT_IMPORT_DIALOG_EXTENSIONS.filter((extension) => unique.has(extension));
}

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function visiblePath(path: string) {
  return path.replace(/ +(?=\/|$)/g, (match) => "[space]".repeat(match.length));
}

function pathDisplayName(path: string) {
  const safePath = visiblePath(path);
  return safePath.split(/[\\/]+/).filter(Boolean).pop() || safePath;
}

function isTerminalRuntimeStatus(status?: string | null) {
  return terminalRuntimeStatuses.includes(status as RuntimeJobStatus);
}

function isRetryableRuntimeStatus(status?: string | null) {
  return retryableRuntimeStatuses.includes(status as RuntimeJobStatus);
}

function runtimeDurationSeconds(job: RuntimeJobEvent) {
  return Math.round(((job.durationMs || job.elapsedMs) ?? 0) / 1000);
}

function runtimeRetryCount(job: RuntimeJobEvent) {
  return job.retryCount || job.maxAttempts || 1;
}

function runtimeLogPath(job: RuntimeJobEvent) {
  return job.liveLogPath || job.logPath || "";
}

function runtimeCommandLabel(job: RuntimeJobEvent) {
  return job.command.length ? job.command.join(" ") : job.kind;
}

function fileStatusLabel(file: VaultFile, language: UiLanguage) {
  return runtimeLabel(file.status || file.updated || file.kind, language);
}

function runtimeStatusTone(status: string) {
  if (["completed", "succeeded"].includes(status)) return "succeeded";
  if (["queued", "running", "retrying"].includes(status)) return "queued";
  if (["timeout", "timed_out", "failed"].includes(status)) return "failed";
  return status;
}

function hasWhitespacePathSegment(path: string) {
  return / +(?=\/|$)/.test(path);
}

function projectSlug(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled-wiki";
}

function joinLocalPath(parent: string, child: string) {
  const base = parent.replace(/\/+$/g, "");
  return `${base || "/"}${base === "" || base === "/" ? "" : "/"}${child}`;
}

function statusTone(status: VaultStatus | null) {
  if (!status) return "idle";
  if (!status.schemaValid) return "danger";
  if (!status.runtimeInstalled) return "warn";
  return "ok";
}

function runtimeSettings(settings: DesktopSettings): RuntimeSettings {
  return {
    runtimePath: settings.runtimePath,
    pythonPath: settings.pythonPath || "python3",
    obsidianProfile: settings.defaultObsidianProfile as RuntimeSettings["obsidianProfile"],
    skipDownloads: settings.skipObsidianPluginDownloads,
    pdfParser: settings.defaultPdfParser as RuntimeSettings["pdfParser"],
    cloudParsingAllowed: settings.cloudParsingAllowed,
    layoutParsingApiUrl: settings.layoutParsingApiUrl,
    retryCount: settings.retryCount,
    timeoutSeconds: settings.timeoutSeconds,
  };
}

function pipelineState(index: number, status: VaultStatus | null, plan: IngestPlan | null) {
  const inbox = status?.counts.inbox ?? 0;
  const blocked = plan?.summary.blocked ?? 0;
  const published = plan?.summary.published ?? 0;
  const parseable = plan?.entries.filter((entry) => entry.action === "parse_required" && isRunnableIngestEntry(entry)).length ?? 0;
  const runnable = runnableIngestCount(plan);
  if (index === 0) return inbox > 0 ? "ready" : "waiting";
  if (index === 1) {
    if (blocked > 0 && parseable > 0) return "local parse ready";
    if (blocked > 0 && runnable === 0) return "parse blocked";
    if (runnable > 0) return "ready";
    if (published > 0) return "published";
    return "waiting";
  }
  if (index >= 2 && index <= 4) return runnable > 0 ? "queued" : "runtime gated";
  if (index >= 5 && index <= 10) return (status?.counts.sources ?? 0) > 0 ? "available" : "after publish";
  return status?.schemaValid ? "available" : "blocked";
}

function App() {
  const shellRef = useRef<HTMLElement | null>(null);
  const projectSwitcherTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [interfaceLanguage, setInterfaceLanguage] = useState<UiLanguage>(() =>
    normalizeUiLanguage(typeof localStorage === "undefined" ? null : localStorage.getItem(INTERFACE_LANGUAGE_STORAGE_KEY)),
  );
  const [vaultPath, setVaultPath] = useState("");
  const [appState, setAppState] = useState<DesktopAppState | null>(null);
  const [vaultSuggestions, setVaultSuggestions] = useState<VaultSuggestion[]>([]);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [entryNote, setEntryNote] = useState<VaultEntryNote | null>(null);
  const [newVaultPath, setNewVaultPath] = useState("");
  const [enableObsidian, setEnableObsidian] = useState(true);
  const [desktopSettings, setDesktopSettings] = useState<DesktopSettings>(initialDesktopSettings);
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [ingestPlan, setIngestPlan] = useState<IngestPlan | null>(null);
  const [claims, setClaims] = useState<ClaimLedgerItem[]>([]);
  const [evidencePaths, setEvidencePaths] = useState<EvidencePathItem[]>([]);
  const [traceabilityWarnings, setTraceabilityWarnings] = useState<TraceabilityWarning[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewQueueItem[]>([]);
  const [writebacks, setWritebacks] = useState<WritebackProposal[]>([]);
  const [importResults, setImportResults] = useState<ImportPreview[]>([]);
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);
  const [detailSelection, setDetailSelection] = useState<DetailSelection>({ kind: "empty" });
  const [readingHistory, setReadingHistory] = useState<VaultFile[]>([]);
  const [readingHistoryIndex, setReadingHistoryIndex] = useState(-1);
  const [actionFilter, setActionFilter] = useState("open");
  const [claimFilter, setClaimFilter] = useState("needs_review");
  const [reviewFilter, setReviewFilter] = useState("open");
  const [preserveFolders, setPreserveFolders] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [writebackTarget, setWritebackTarget] = useState("reviews/query-writeback/research-insight.md");
  const [writebackTitle, setWritebackTitle] = useState("");
  const [writebackContent, setWritebackContent] = useState("");
  const [queryText, setQueryText] = useState(DEFAULT_DEEPSEEK_RESEARCH_STRATEGY_QUERY);
  const [queryTarget, setQueryTarget] = useState("reviews/query-writeback/deepseek-research-insights.md");
  const [queryDraft, setQueryDraft] = useState<QueryWritebackDraft | null>(null);
  const [writebackApplyStatus, setWritebackApplyStatus] = useState<WritebackApplyStatus | null>(null);
  const [diagnosticPath, setDiagnosticPath] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<RuntimeJobEvent | null>(null);
  const [runtimeHistory, setRuntimeHistory] = useState<RuntimeJobEvent[]>([]);
  const [liveLogLines, setLiveLogLines] = useState<string[]>([]);
  const [activePage, setActivePage] = useState<ShellPage>("chat");
  const [navRailExpanded, setNavRailExpanded] = useState(() =>
    typeof localStorage !== "undefined" && localStorage.getItem(NAV_RAIL_EXPANDED_STORAGE_KEY) === "true",
  );
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(true);
  const [sidebarTreeMode, setSidebarTreeMode] = useState<SidebarTreeMode>("knowledge");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandActiveIndex, setCommandActiveIndex] = useState(0);
  const [researchPanelOpen, setResearchPanelOpen] = useState(false);
  const [researchTopic, setResearchTopic] = useState(DEFAULT_DEEPSEEK_RESEARCH_STRATEGY_QUERY_EN);
  const [chatHandoff, setChatHandoff] = useState<{ question: string; targetPath: string; key: number } | null>(null);
  const [knowledgeSidebarWidth, setKnowledgeSidebarWidth] = useState(defaultKnowledgeSidebarWidth);
  const [previewSidebarWidth, setPreviewSidebarWidth] = useState(defaultPreviewSidebarWidth);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [projectSwitcherMenuStyle, setProjectSwitcherMenuStyle] = useState<CSSProperties>({});
  const [actionFocusIndex, setActionFocusIndex] = useState(0);
  const [actionListExpanded, setActionListExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copy = shellCopy[interfaceLanguage];
  const researchPanelLabel = interfaceLanguage === "zh" ? "深度研究" : "Deep Research";
  const previewSidebarTitle = detailDrawerOpen
    ? (interfaceLanguage === "zh" ? "阅读工作区" : "Reading workspace")
    : researchPanelLabel;
  const readingHistoryRef = useRef<VaultFile[]>([]);
  const readingHistoryIndexRef = useRef(-1);
  const previousVaultPathRef = useRef(vaultPath);
  const researchReadiness = useMemo(
    () => shellResearchReadiness(desktopSettings, interfaceLanguage),
    [desktopSettings, interfaceLanguage],
  );

  const grouped = useMemo(() => {
    const groups: Record<string, VaultFile[]> = { note: [], source: [], draft: [], concept: [], report: [], inbox: [] };
    for (const file of status?.files ?? []) groups[file.kind]?.push(file);
    return groups;
  }, [status]);

  const rt = useMemo(() => runtimeSettings(desktopSettings), [desktopSettings]);
  const enqueueAfterImport = desktopSettings.defaultIngestMode === "enqueue_after_import";
  const tone = statusTone(status);
  const planned = ingestPlan?.summary;
  const runnableIngest = runnableIngestCount(ingestPlan);
  const actions = ingestPlan?.actions ?? [];
  const jobs = ingestPlan?.jobs ?? [];
  const artifacts = ingestPlan?.artifacts ?? [];
  const registry = ingestPlan?.registry ?? [];
  const sourceAliases = ingestPlan?.sourceAliases ?? [];
  const impactEdges = ingestPlan?.impactEdges ?? [];
  const lintFindings = ingestPlan?.lintFindings ?? [];
  const runtimeRunning = Boolean(activeJob && !activeJob.endedAt && !isTerminalRuntimeStatus(activeJob.status));
  const visibleActions = actions.filter((action) => actionFilter === "all" || action.status === actionFilter);
  const prioritizedActions = [...visibleActions].sort(compareDashboardActions);
  const focusedAction = prioritizedActions[actionFocusIndex] ?? prioritizedActions[0] ?? null;
  const actionQueueStart = actionListExpanded ? 0 : Math.max(0, Math.min(actionFocusIndex - 2, Math.max(prioritizedActions.length - 5, 0)));
  const actionQueuePreview = actionListExpanded ? prioritizedActions : prioritizedActions.slice(actionQueueStart, actionQueueStart + 5);
  const openActionCount = actions.filter((action) => action.status === "open").length;
  const criticalActionCount = actions.filter((action) => action.status === "open" && ["p0", "p1"].includes(action.severity.toLowerCase())).length;
  const visibleClaims = claims.filter((claim) => {
    if (claimFilter === "all") return true;
    if (claimFilter === "needs_review") return claim.needsReview || claim.status === "needs_review" || claim.verdict === "needs_review";
    return claim.status === claimFilter || claim.verdict === claimFilter;
  });
  const visibleReviewItems = reviewItems.filter((item) => {
    if (reviewFilter === "all") return true;
    if (reviewFilter === "open") return !["approved", "resolved", "ignored", "rejected"].includes(item.status);
    return item.status === reviewFilter;
  });
  const brokenEvidence = evidencePaths.filter((item) => item.chainStatus !== "ok").length;
  const progressDone = jobs.filter((job) => job.status === "succeeded").length;
  const activePageCopy = copy.pages[activePage];
  const pageVisible = (...pages: ShellPage[]) => pages.includes(activePage);
  const graphWorkspaceMode = activePage === "graph";
  const chatWorkspaceMode = activePage === "chat";
  const shellKnowledgeVisible = activePage !== "settings" && !chatWorkspaceMode;
  const shellInspectorVisible = activePage !== "settings" && !graphWorkspaceMode && !chatWorkspaceMode && (detailDrawerOpen || researchPanelOpen);
  const shellStatusHeaderVisible = activePage !== "settings" && !graphWorkspaceMode && !chatWorkspaceMode;
  const activeReadingPath = detailSelection.kind === "source" ? detailSelection.file.path : (readingHistory[readingHistoryIndex]?.path || "");
  const navRailToggleLabel = navRailExpanded
    ? (interfaceLanguage === "zh" ? "收起导航" : "Collapse nav")
    : (interfaceLanguage === "zh" ? "展开导航" : "Expand nav");
  const navRailToggleTitle = navRailExpanded
    ? (interfaceLanguage === "zh" ? "收起所有页面导航" : "Collapse navigation on all pages")
    : (interfaceLanguage === "zh" ? "展开所有页面导航" : "Expand navigation on all pages");
  const shellLayoutStyle = activePage !== "settings"
    ? ({
      "--knowledge-sidebar-width": `${knowledgeSidebarWidth}px`,
      "--preview-sidebar-width": `${previewSidebarWidth}px`,
    } as CSSProperties)
    : undefined;

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(NAV_RAIL_EXPANDED_STORAGE_KEY, navRailExpanded ? "true" : "false");
  }, [navRailExpanded]);

  const startShellResize = (side: "knowledge" | "preview") => (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    if (!shellRef.current) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.body.dataset.shellPanelResizing = "true";

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const shell = shellRef.current;
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      const shellWidth = rect.width;

      if (side === "knowledge") {
        const previewBudget = (detailDrawerOpen || researchPanelOpen) ? PREVIEW_SIDEBAR_MIN_WIDTH : 0;
        const dynamicMax = Math.max(
          KNOWLEDGE_SIDEBAR_MIN_WIDTH,
          Math.min(KNOWLEDGE_SIDEBAR_MAX_WIDTH, shellWidth - NAV_RAIL_WIDTH - previewBudget - WORKSPACE_MIN_WIDTH),
        );
        const nextWidth = moveEvent.clientX - rect.left - NAV_RAIL_WIDTH;
        setKnowledgeSidebarWidth(clampNumber(nextWidth, KNOWLEDGE_SIDEBAR_MIN_WIDTH, dynamicMax));
      } else {
        const dynamicMax = Math.max(
          PREVIEW_SIDEBAR_MIN_WIDTH,
          Math.min(PREVIEW_SIDEBAR_MAX_WIDTH, shellWidth - NAV_RAIL_WIDTH - knowledgeSidebarWidth - WORKSPACE_MIN_WIDTH),
        );
        const nextWidth = rect.right - moveEvent.clientX;
        setPreviewSidebarWidth(clampNumber(nextWidth, PREVIEW_SIDEBAR_MIN_WIDTH, dynamicMax));
      }
    };

    const handleMouseUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      delete document.body.dataset.shellPanelResizing;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  useEffect(() => {
    if (detailSelection.kind !== "empty") {
      setDetailDrawerOpen(true);
    }
  }, [detailSelection]);

  useEffect(() => {
    readingHistoryRef.current = readingHistory;
  }, [readingHistory]);

  useEffect(() => {
    readingHistoryIndexRef.current = readingHistoryIndex;
  }, [readingHistoryIndex]);

  useEffect(() => {
    if (activePage === "settings") {
      setDetailDrawerOpen(false);
      setResearchPanelOpen(false);
    }
    setProjectSwitcherOpen(false);
  }, [activePage]);

  useEffect(() => {
    setActionFocusIndex(0);
    setActionListExpanded(false);
  }, [actionFilter, vaultPath]);

  useEffect(() => {
    setActionFocusIndex((current) => Math.min(current, Math.max(prioritizedActions.length - 1, 0)));
  }, [prioritizedActions.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandQuery("");
        setCommandActiveIndex(0);
        setCommandPaletteOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (previousVaultPathRef.current === vaultPath) return;
    previousVaultPathRef.current = vaultPath;
    if (detailSelection.kind === "source") {
      setReadingHistory([detailSelection.file]);
      setReadingHistoryIndex(0);
      return;
    }
    setReadingHistory([]);
    setReadingHistoryIndex(-1);
  }, [detailSelection, vaultPath]);

  const vaultFilePath = (path?: string | null) => {
    if (!path) return vaultPath;
    if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) return path;
    return `${vaultPath}/${path}`;
  };
  const selectFileForDetails = (file: VaultFile, options?: { pushHistory?: boolean }) => {
    setSelectedFile(file);
    setDetailSelection({ kind: "source", file });
    if (options?.pushHistory === false) return;
    const currentHistory = readingHistoryRef.current;
    const currentIndex = readingHistoryIndexRef.current;
    const current = currentHistory[currentIndex];
    if (current?.path === file.path) return;
    const truncated = currentHistory.slice(0, currentIndex + 1).filter((item) => item.path !== file.path);
    const nextHistory = [...truncated, file].slice(-8);
    const nextIndex = nextHistory.length - 1;
    setReadingHistory(nextHistory);
    setReadingHistoryIndex(nextIndex);
  };
  const stepReadingHistory = (delta: -1 | 1) => {
    const nextIndex = readingHistoryIndexRef.current + delta;
    const next = readingHistoryRef.current[nextIndex];
    if (!next) return;
    setReadingHistoryIndex(nextIndex);
    selectFileForDetails(next, { pushHistory: false });
  };
  const openReadingHistoryItem = (index: number) => {
    const next = readingHistoryRef.current[index];
    if (!next) return;
    setReadingHistoryIndex(index);
    selectFileForDetails(next, { pushHistory: false });
  };
  const focusVaultItem = (path?: string | null) => {
    if (!vaultPath || !path) return false;
    const file = findVaultFileForOpen(vaultPath, status?.files, path);
    if (file) {
      selectFileForDetails(file);
      setDetailDrawerOpen(true);
      return true;
    }
    const relativePath = vaultRelativeOpenPath(vaultPath, path, { allowRootedRelative: true });
    if (!relativePath || !canPreviewVaultPath(relativePath)) return false;
    const previewFile = createPreviewVaultFile(vaultPath, relativePath);
    if (!previewFile) return false;
    selectFileForDetails(previewFile);
    setDetailDrawerOpen(true);
    return true;
  };
  const openVaultItem = async (path?: string | null) => {
    if (!vaultPath || !path) return;
    if (focusVaultItem(path)) return;
    try {
      await openVaultPath(vaultPath, path);
    } catch (err) {
      setError(String(err));
    }
  };
  const openVaultItemInObsidian = async (path?: string | null) => {
    if (!vaultPath || !path) return;
    try {
      await openVaultPath(vaultPath, path);
    } catch (err) {
      setError(String(err));
    }
  };
  const openWorkspacePath = async (path?: string | null) => {
    if (!path) return;
    if (focusVaultItem(path)) return;
    try {
      await openPath(vaultFilePath(path));
    } catch (err) {
      setError(String(err));
    }
  };
  const revealResolvedPath = async (path: string) => {
    if (!path) return;
    try {
      await revealPath(path);
    } catch (err) {
      setRestoreError(`Reveal failed. Open or copy this path manually:\n${path}\n${String(err)}`);
    }
  };
  const selectClaimForDetails = (claim: ClaimLedgerItem) => {
    setDetailSelection({
      kind: "claim",
      claim,
      evidence: evidencePaths.find((item) => item.claimId === claim.claimId) ?? null,
    });
  };
  const copyText = async (label: string, text?: string | null) => {
    const readableLabel = interfaceLanguage === "zh" ? copyLabelZh[label] ?? label : label;
    if (!text) {
      setRestoreError(interfaceLanguage === "zh"
        ? `${readableLabel}暂不可用。请刷新知识库，或选择已生成的知识库。`
        : `${readableLabel} is not available yet. Refresh the vault or choose a generated vault.`);
      return;
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      setRestoreError(interfaceLanguage === "zh" ? `${readableLabel}已复制到剪贴板。` : `${readableLabel} copied to clipboard.`);
    } catch {
      setRestoreError(interfaceLanguage === "zh"
        ? `剪贴板不可用。请手动复制${readableLabel}：\n${text}`
        : `Clipboard API unavailable. Copy ${readableLabel} manually:\n${text}`);
    }
  };
  const persistInterfaceLanguage = async (nextLanguage: UiLanguage) => {
    setInterfaceLanguage(nextLanguage);
    localStorage.setItem(INTERFACE_LANGUAGE_STORAGE_KEY, nextLanguage);
    const nextSettings = { ...desktopSettings, interfaceLanguage: nextLanguage };
    setDesktopSettings(nextSettings);
    if (isTauriAvailable()) {
      try {
        setAppState(await saveInterfaceLanguage(nextLanguage));
        if (vaultPath) {
          await saveDesktopSettings(vaultPath, nextSettings);
        }
      } catch (err) {
        setRestoreError(String(err));
      }
    }
  };
  const toggleInterfaceLanguage = () => {
    void persistInterfaceLanguage(oppositeLanguage(interfaceLanguage));
  };

  const loadDemoTour = () => {
    const demoSettings = {
      ...initialDesktopSettings,
      projectName: "DeepSeek Research Wiki",
      projectPurpose: "Evidence-backed DeepSeek paper reading and writeback review.",
      interfaceLanguage,
    };
    setVaultPath(shellDemoVaultPath);
    setStatus(shellDemoStatus);
    setIngestPlan(shellDemoIngestPlan);
    setClaims(shellDemoClaims);
    setEvidencePaths(shellDemoEvidencePaths);
    setTraceabilityWarnings(shellDemoTraceabilityWarnings);
    setRuntimeHistory(shellDemoRuntimeHistory);
    setReviewItems(shellDemoReviewItems);
    setWritebacks(shellDemoWritebacks);
    setEntryNote(shellDemoEntryNote);
    setDesktopSettings(demoSettings);
    setAppState({ lastSelectedVault: shellDemoVaultPath, recentVaults: [shellDemoVaultPath], interfaceLanguage });
    setVaultSuggestions([{ label: "DeepSeek Shell Demo", path: shellDemoVaultPath, kind: "deepseek", exists: true }]);
    setDetailSelection({ kind: "claim", claim: shellDemoClaims[0], evidence: shellDemoEvidencePaths[0] });
    setSelectedFile(shellDemoFiles[1]);
    setReadingHistory([shellDemoFiles[1]]);
    setReadingHistoryIndex(0);
    setActivePage("dashboard");
    setRestoreError(null);
    setError(null);
  };

  const isDemoTourActive = () => vaultPath === shellDemoVaultPath && status?.runtimeVersion === "shell-demo";

  useEffect(() => {
    setQueryText((current) => {
      if (interfaceLanguage === "en" && current === DEFAULT_DEEPSEEK_RESEARCH_STRATEGY_QUERY) {
        return DEFAULT_DEEPSEEK_RESEARCH_STRATEGY_QUERY_EN;
      }
      if (interfaceLanguage === "zh" && current === DEFAULT_DEEPSEEK_RESEARCH_STRATEGY_QUERY_EN) {
        return DEFAULT_DEEPSEEK_RESEARCH_STRATEGY_QUERY;
      }
      return current;
    });
  }, [interfaceLanguage]);

  useEffect(() => {
    let ignore = false;
    async function boot() {
      if (!isTauriAvailable()) {
        if (isShellDemoMode()) {
          loadDemoTour();
          return;
        }
        setAppState({ recentVaults: [] });
        setVaultSuggestions([]);
        setRestoreError(null);
        return;
      }
      try {
        const [restore, suggestions] = await Promise.all([
          restoreLastSelectedVault(),
          listVaultSuggestions(),
        ]);
        if (ignore) return;
        const restoredLanguage = normalizeUiLanguage(restore.state.interfaceLanguage || localStorage.getItem(INTERFACE_LANGUAGE_STORAGE_KEY));
        setInterfaceLanguage(restoredLanguage);
        localStorage.setItem(INTERFACE_LANGUAGE_STORAGE_KEY, restoredLanguage);
        setDesktopSettings((current) => ({ ...current, interfaceLanguage: restoredLanguage }));
        setAppState(restore.state);
        setVaultSuggestions(suggestions);
        if (restore.vaultPath && restore.status) {
          setVaultPath(restore.vaultPath);
          setStatus(restore.status);
          await refresh(restore.vaultPath);
        } else if (restore.error) {
          setRestoreError(restore.error);
        }
      } catch (err) {
        if (!ignore) setRestoreError(String(err));
      }
    }
    void boot();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!isTauriAvailable()) return;
    let unlisten: (() => void) | null = null;
    listen<RuntimeJobEvent>("runtime-job-event", (event) => {
      const next = event.payload;
      setActiveJob(next);
      if (next.line) {
        setLiveLogLines((current) =>
          [`${next.stream || "log"} | ${next.line}`, ...current].slice(0, 160),
        );
      } else if (next.message) {
        setLiveLogLines((current) =>
          [`${next.status} | ${next.message}`, ...current].slice(0, 160),
        );
      }
      if (next.endedAt) {
        setRuntimeHistory((current) => [next, ...current.filter((item) => item.jobId !== next.jobId)].slice(0, 40));
        if (isRetryableRuntimeStatus(next.status)) {
          setError(`${next.kind} ${next.status}: ${next.message || "see runtime history"}`);
        }
        if (vaultPath) {
          void listRuntimeJobs(vaultPath).then(setRuntimeHistory).catch((err) => setError(String(err)));
          void refresh(vaultPath);
        }
      }
    }).then((dispose) => {
      unlisten = dispose;
    }).catch((err) => setError(String(err)));
    return () => {
      unlisten?.();
    };
  }, [vaultPath]);

  async function refresh(path = vaultPath) {
    if (!path) return;
    setBusy("inspect");
    setError(null);
    try {
      const nextSettings = await loadDesktopSettings(path);
      const nextPlan = await planIngest(path);
      const nextClaims = await listClaimLedger(path);
      const nextEvidence = await listEvidencePaths(path);
      const nextWarnings = await listTraceabilityWarnings(path);
      const nextRuntimeHistory = await listRuntimeJobs(path);
      const nextReview = await listReviewQueue(path);
      const nextWritebacks = await listWritebackProposals(path);
      const nextStatus = await inspectVault(path);
      const nextEntry = await resolveVaultEntryNote(path);
      const settingsLanguage = normalizeUiLanguage(nextSettings.interfaceLanguage || interfaceLanguage);
      const normalizedSettings = { ...nextSettings, interfaceLanguage: settingsLanguage };
      setStatus(nextStatus);
      setIngestPlan(nextPlan);
      setClaims(nextClaims);
      setEvidencePaths(nextEvidence);
      setTraceabilityWarnings(nextWarnings);
      setRuntimeHistory(nextRuntimeHistory);
      setReviewItems(nextReview);
      setWritebacks(nextWritebacks);
      setDesktopSettings(normalizedSettings);
      setInterfaceLanguage(settingsLanguage);
      localStorage.setItem(INTERFACE_LANGUAGE_STORAGE_KEY, settingsLanguage);
      setEntryNote(nextEntry);
      setAppState(await saveLastSelectedVault(path));
      setVaultSuggestions(await listVaultSuggestions());
      setRestoreError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function chooseVault() {
    setError(null);
    setRestoreError(null);
    if (!isTauriAvailable()) {
      setError(copy.errors.openProjectWebUnavailable);
      return;
    }
    try {
      const picked = await open({ directory: true, multiple: false, title: copy.dialogs.chooseVault });
      if (typeof picked !== "string") return;
      await selectVault(picked);
    } catch (err) {
      setError(String(err));
    }
  }

  async function selectVault(path: string) {
    setRestoreError(null);
    setVaultPath(path);
    await refresh(path);
  }

  async function chooseRuntime() {
    const picked = await open({ directory: true, multiple: false, title: copy.dialogs.chooseRuntime });
    if (typeof picked !== "string") return;
    setDesktopSettings((current) => ({ ...current, runtimePath: picked }));
  }

  async function chooseParentDirectory() {
    if (!isTauriAvailable()) {
      setError(copy.errors.createProjectWebUnavailable);
      return null;
    }
    const picked = await open({ directory: true, multiple: false, title: copy.dialogs.chooseParent });
    return typeof picked === "string" ? picked : null;
  }

  async function handleCreateVault() {
    if (!newVaultPath.trim()) {
      setError(copy.errors.createVaultPath);
      return;
    }
    setBusy("create");
    setError(null);
    try {
      const next = await createVault(newVaultPath, rt, enableObsidian);
      await saveDesktopSettings(next.path, desktopSettings);
      setVaultPath(next.path);
      setNewVaultPath("");
      await refresh(next.path);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateProject(draft: NewWikiProjectDraft) {
    if (!draft.projectName.trim() || !draft.parentDirectory.trim()) {
      setError(copy.errors.createProject);
      return false;
    }
    if (!isTauriAvailable()) {
      setError(copy.errors.createProjectWebUnavailable);
      return false;
    }
    const targetPath = joinLocalPath(draft.parentDirectory, projectSlug(draft.projectName));
    const nextDesktopSettings = {
      ...desktopSettings,
      projectName: draft.projectName.trim(),
      projectTemplate: draft.template,
      projectPurpose: draft.purpose,
      aiOutputLanguage: draft.aiOutputLanguage,
      parentDirectory: draft.parentDirectory,
    };
    setBusy("create");
    setError(null);
    try {
      const next = await createVault(targetPath, runtimeSettings(nextDesktopSettings), enableObsidian);
      await saveDesktopSettings(next.path, nextDesktopSettings);
      setDesktopSettings(nextDesktopSettings);
      setVaultPath(next.path);
      setNewVaultPath("");
      setActivePage("dashboard");
      await refresh(next.path);
      return true;
    } catch (err) {
      setError(String(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveSettings() {
    if (!vaultPath) return;
    setBusy("save_settings");
    setError(null);
    try {
      setDesktopSettings(await saveDesktopSettings(vaultPath, desktopSettings));
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleImportPaths(paths: string[]) {
    if (!vaultPath || paths.length === 0) return;
    setBusy("import");
    setError(null);
    try {
      const result = await importSources(vaultPath, paths, enqueueAfterImport, preserveFolders);
      setImportResults([...result.imported, ...result.skippedDuplicates, ...result.skippedSourceWatch]);
      if (result.errors.length) setError(result.errors.join("\n"));
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleImportFiles() {
    const picked = await open({
      directory: false,
      multiple: true,
      title: copy.dialogs.importFiles,
      filters: [{ name: "Documents", extensions: importDialogExtensions(desktopSettings) }],
    });
    const paths = Array.isArray(picked) ? picked.filter((item): item is string => typeof item === "string") : [];
    await handleImportPaths(paths);
  }

  async function handleImportFolder() {
    const picked = await open({ directory: true, multiple: true, title: copy.dialogs.importFolder });
    const paths = Array.isArray(picked) ? picked.filter((item): item is string => typeof item === "string") : typeof picked === "string" ? [picked] : [];
    await handleImportPaths(paths);
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragActive(false);
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path));
    if (!paths.length) {
      setError(copy.errors.dropNoPath);
      return;
    }
    await handleImportPaths(paths);
  }

  async function handleRuntime(kind: string) {
    if (!vaultPath) return;
    setBusy(`start:${kind}`);
    setError(null);
    setLiveLogLines([]);
    try {
      const job = await startRuntimeCommandJob(vaultPath, rt, kind);
      setActiveJob(job);
      setRuntimeHistory((current) => [job, ...current.filter((item) => item.jobId !== job.jobId)].slice(0, 40));
      setLiveLogLines([`${job.status} | ${job.message || "queued"} | ${job.jobId}`]);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handlePlanIngest() {
    if (!vaultPath) return;
    setBusy("plan_ingest");
    setError(null);
    try {
      const nextPlan = await planIngest(vaultPath);
      setIngestPlan(nextPlan);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleRepairTemplates() {
    if (!vaultPath) return;
    setBusy("repair_templates");
    setError(null);
    try {
      setStatus(await repairObsidianTemplates(vaultPath));
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleObsidianSetup() {
    if (!vaultPath) return;
    if (status?.runtimeInstalled) {
      await handleRuntime("obsidian_setup");
      return;
    }
    await handleRepairTemplates();
  }

  async function handleIngestLint() {
    if (!vaultPath) return;
    setBusy("ingest_lint");
    setError(null);
    try {
      await runIngestLint(vaultPath);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleActionStatus(actionId: string, status: "open" | "resolved" | "ignored") {
    if (!vaultPath) return;
    setBusy(`action:${actionId}`);
    setError(null);
    try {
      setIngestPlan(await setDashboardActionStatus(vaultPath, actionId, status));
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleJobStatus(
    jobId: string,
    status: "queued" | "running" | "blocked" | "cancelled" | "succeeded" | "failed",
  ) {
    if (!vaultPath) return;
    setBusy(`job:${jobId}`);
    setError(null);
    try {
      setIngestPlan(await setIngestJobStatus(vaultPath, jobId, status));
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleClaimVerdict(
    claimId: string,
    verdict: "supported" | "needs_review" | "stale" | "contradicted" | "ignored" | "unknown",
  ) {
    if (!vaultPath) return;
    setBusy(`claim:${claimId}`);
    setError(null);
    try {
      setClaims(await setClaimVerdict(vaultPath, claimId, verdict));
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleReviewStatus(
    itemId: string,
    status: "open" | "approved" | "rejected" | "resolved" | "ignored" | "needs_review",
  ) {
    if (!vaultPath) return;
    setBusy(`review:${itemId}`);
    setError(null);
    try {
      setReviewItems(await setReviewItemStatus(vaultPath, itemId, status));
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleFollowup(item: ReviewQueueItem) {
    if (!vaultPath) return;
    setBusy(`followup:${item.itemId}`);
    setError(null);
    try {
      setReviewItems(await createFollowupAction(vaultPath, item.title, item.body, item.targetPath));
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleIngestPipeline() {
    if (!vaultPath) return;
    setBusy("start:ingest_pipeline");
    setError(null);
    setLiveLogLines([]);
    try {
      const job = await startIngestPipelineJob(vaultPath, rt);
      setActiveJob(job);
      setRuntimeHistory((current) => [job, ...current.filter((item) => item.jobId !== job.jobId)].slice(0, 40));
      setLiveLogLines([`${job.status} | ${job.message || "queued"} | ${job.jobId}`]);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateWriteback() {
    if (!vaultPath || !writebackTarget.trim()) return;
    setBusy("writeback_proposal");
    setError(null);
    try {
      const proposal = await createWritebackProposal(
        vaultPath,
        writebackTarget.trim(),
        writebackTitle.trim() || "Desktop writeback proposal",
        writebackContent,
      );
      setWritebacks((current) => [proposal, ...current.filter((item) => item.proposalId !== proposal.proposalId)]);
      setWritebackApplyStatus(null);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateQueryWriteback() {
    if (!vaultPath || !queryText.trim()) return;
    setBusy("query_writeback");
    setError(null);
    try {
      if (isDemoTourActive()) {
        const target = queryTarget.trim() || "reviews/query-writeback/deepseek-research-insights.md";
        const draft = createShellDemoQueryWritebackDraft(queryText, target, interfaceLanguage);
        setQueryTarget(target);
        setQueryDraft(draft);
        setWritebacks((current) => [draft.proposal, ...current.filter((item) => item.proposalId !== draft.proposal.proposalId)]);
        setWritebackApplyStatus(null);
        return;
      }
      const draft = await createQueryWritebackProposal(
        vaultPath,
        queryText,
        queryTarget.trim() || "reviews/query-writeback/deepseek-research-insights.md",
        interfaceLanguage === "zh" ? "DeepSeek 研究洞察提案" : "DeepSeek research insight query",
      );
      setQueryDraft(draft);
      setWritebacks((current) => [draft.proposal, ...current.filter((item) => item.proposalId !== draft.proposal.proposalId)]);
      setWritebackApplyStatus(null);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateQueryWritebackFromChat(question: string, targetPath: string) {
    if (!vaultPath || !question.trim()) return;
    const target = targetPath.trim() || "reviews/query-writeback/deepseek-research-insights.md";
    setActivePage("writeback");
    setQueryText(question);
    setQueryTarget(target);
    setBusy("query_writeback");
    setError(null);
    try {
      if (isDemoTourActive()) {
        const draft = createShellDemoQueryWritebackDraft(question, target, interfaceLanguage);
        setQueryDraft(draft);
        setWritebacks((current) => [draft.proposal, ...current.filter((item) => item.proposalId !== draft.proposal.proposalId)]);
        setWritebackApplyStatus(null);
        return;
      }
      const draft = await createQueryWritebackProposal(
        vaultPath,
        question,
        target,
        interfaceLanguage === "zh" ? "DeepSeek 研究洞察提案" : "DeepSeek research insight query",
      );
      setQueryDraft(draft);
      setWritebacks((current) => [draft.proposal, ...current.filter((item) => item.proposalId !== draft.proposal.proposalId)]);
      setWritebackApplyStatus(null);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateAnswerWritebackFromChat(question: string, targetPath: string, content: string) {
    if (!vaultPath || !question.trim() || !content.trim()) return;
    const cleanTarget = targetPath.trim().replace(/\\/g, "/");
    const target = cleanTarget.startsWith("reviews/query-writeback/")
      ? cleanTarget
      : "reviews/query-writeback/ernie-evidence-answer.md";
    setActivePage("writeback");
    setWritebackTarget(target);
    setWritebackTitle(interfaceLanguage === "zh" ? "ERNIE 证据回答提案" : "ERNIE evidence answer proposal");
    setWritebackContent(content);
    setBusy("writeback_proposal");
    setError(null);
    try {
      const proposal = await createWritebackProposal(
        vaultPath,
        target,
        interfaceLanguage === "zh" ? "ERNIE 证据回答提案" : "ERNIE evidence answer proposal",
        content,
      );
      setWritebacks((current) => [proposal, ...current.filter((item) => item.proposalId !== proposal.proposalId)]);
      setWritebackApplyStatus(null);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  function handleGraphResearchTopic(question: string, targetPath: string) {
    const target = targetPath.trim() || "reviews/query-writeback/graph-research-topic.md";
    setQueryText(question);
    setQueryTarget(target);
    setQueryDraft(null);
    setWritebackApplyStatus(null);
    setError(null);
    setActivePage("writeback");
  }

  function handleShellResearchTopic(topic: string) {
    const question = topic.trim() || DEFAULT_DEEPSEEK_RESEARCH_STRATEGY_QUERY_EN;
    const target = "reviews/query-writeback/deep-research-topic.md";
    setResearchTopic(question);
    setQueryText(question);
    setQueryTarget(target);
    setChatHandoff({ question, targetPath: target, key: Date.now() });
    setQueryDraft(null);
    setWritebackApplyStatus(null);
    setError(null);
    setActivePage("chat");
    setResearchPanelOpen(true);
  }

  async function handleCreateResearchProposal(topic: string) {
    const question = topic.trim();
    if (!question) return;
    const target = queryTarget.trim() || "reviews/query-writeback/deep-research-topic.md";
    setResearchTopic(question);
    setChatHandoff({ question, targetPath: target, key: Date.now() });
    await handleCreateQueryWritebackFromChat(question, target);
    setResearchPanelOpen(true);
  }

  function handleReviewResearchTopic(item: ReviewQueueItem) {
    const title = runtimeText(item.title, interfaceLanguage) || item.title;
    const body = runtimeText(item.body, interfaceLanguage) || item.body;
    const evidenceContext = [
      item.targetPath ? `${interfaceLanguage === "zh" ? "目标页面" : "Target page"}: ${item.targetPath}` : "",
      item.claimId ? `${interfaceLanguage === "zh" ? "论断" : "Claim"}: ${item.claimId}` : "",
      item.sourceId ? `${interfaceLanguage === "zh" ? "资料" : "Source"}: ${item.sourceId}` : "",
      item.evidencePath ? `${interfaceLanguage === "zh" ? "证据路径" : "Evidence path"}: ${item.evidencePath}` : "",
    ].filter(Boolean).join("\n");
    const question = interfaceLanguage === "zh"
      ? `基于当前 LLM Wiki，请围绕审核项「${title}」生成一个可审核的 Deep Research / query writeback 研究主题。\n\n审核正文：${body}\n${evidenceContext ? `\n当前证据上下文：\n${evidenceContext}\n` : ""}\n要求：\n1. 所有确定性结论必须引用当前 wiki 的 source / claim / concept 证据。\n2. 区分 evidence、inference、hypothesis、forecast。\n3. 说明这个审核项需要补充哪些证据或人工确认。\n4. 只生成写回提案，不要静默写入 source/concept 页面。`
      : `Using the current LLM Wiki, create a reviewable Deep Research / query writeback topic for the review item "${title}".\n\nReview body: ${body}\n${evidenceContext ? `\nCurrent evidence context:\n${evidenceContext}\n` : ""}\nRequirements:\n1. Cite current wiki source / claim / concept evidence for every firm conclusion.\n2. Distinguish evidence, inference, hypothesis, and forecast.\n3. Explain which evidence gaps or human confirmations this review item needs.\n4. Generate a writeback proposal only; do not silently write into source or concept pages.`;
    const target = `reviews/query-writeback/${item.itemId}-deep-research.md`;
    setResearchTopic(question);
    setQueryText(question);
    setQueryTarget(target);
    setChatHandoff({ question, targetPath: target, key: Date.now() });
    setQueryDraft(null);
    setWritebackApplyStatus(null);
    setError(null);
    setActivePage("chat");
    setResearchPanelOpen(true);
  }

  async function handleOpenObsidian() {
    if (!vaultPath) return;
    setBusy("obsidian_open");
    setError(null);
    try {
      const entry = await openObsidianVault(vaultPath);
      setEntryNote(entry);
      setRestoreError(entry.warning ?? null);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleCancelRuntimeJob() {
    if (!activeJob?.jobId) return;
    try {
      await cancelRuntimeJob(activeJob.jobId);
      setLiveLogLines((current) => [`cancel requested | ${activeJob.jobId}`, ...current].slice(0, 160));
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleRetryRuntimeJob(job: RuntimeJobEvent) {
    setLiveLogLines((current) =>
      [`retry requested | ${job.kind} | from ${job.jobId} (${job.status})`, ...current].slice(0, 160),
    );
    if (job.kind === "ingest_pipeline") {
      await handleIngestPipeline();
      return;
    }
    await handleRuntime(job.kind);
  }

  async function handleWritebackStatus(proposalId: string, status: "proposed" | "approved" | "rejected") {
    if (!vaultPath) return;
    setBusy(`writeback:${proposalId}`);
    setError(null);
    try {
      const proposal = await setWritebackStatus(vaultPath, proposalId, status);
      setWritebacks((current) => [proposal, ...current.filter((item) => item.proposalId !== proposalId)]);
      if (detailDrawerOpen) {
        setDetailSelection((current) => current.kind === "proposal" && current.proposal.proposalId === proposalId
          ? { kind: "proposal", proposal }
          : current);
      }
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleApplyWriteback(proposalId: string) {
    if (!vaultPath) return;
    setBusy(`apply:${proposalId}`);
    setError(null);
    try {
      const result = await applyWritebackProposal(vaultPath, proposalId);
      const nextStatus: WritebackApplyStatus = {
        proposalId: result.proposal.proposalId,
        targetPath: result.proposal.targetPath,
        appliedAt: result.proposal.appliedAt,
        dashboardRefreshed: result.dashboardRefreshed,
        dashboardError: result.dashboardError,
        lint: { ran: false },
      };
      if (desktopSettings.autoRunLintAfterWrites) {
        try {
          const findings = await runIngestLint(vaultPath);
          nextStatus.lint = {
            ran: true,
            findingCount: findings.length,
            blockingCount: findings.filter((finding) => finding.severity === "p0" || finding.severity === "p1").length,
          };
        } catch (lintErr) {
          nextStatus.lint = { ran: true, error: String(lintErr) };
        }
      }
      setWritebackApplyStatus(nextStatus);
      setWritebacks((current) => [result.proposal, ...current.filter((item) => item.proposalId !== proposalId)]);
      if (detailDrawerOpen) {
        setDetailSelection((current) => current.kind === "proposal" && current.proposal.proposalId === proposalId
          ? { kind: "proposal", proposal: result.proposal }
          : current);
      }
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleOpenReadingQualityReport() {
    const reportPath = status?.readingQuality?.reportPath;
    if (!reportPath) {
      await handleOpenObsidian();
      return;
    }
    setError(null);
    try {
      await openWorkspacePath(reportPath);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleDiagnostic() {
    if (!vaultPath) return;
    setBusy("diagnostic");
    setError(null);
    try {
      const path = await createDiagnosticBundle(vaultPath);
      setDiagnosticPath(path);
      await openPath(path);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  const vaultDisplayName = vaultPath ? pathDisplayName(vaultPath) : "No vault";
  const projectSwitchOptions = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{ path: string; label: string; meta: string }> = [];
    const addProject = (path: string, label: string, meta: string) => {
      if (!path || seen.has(path)) return;
      seen.add(path);
      items.push({ path, label, meta });
    };

    addProject(
      vaultPath,
      vaultDisplayName,
      interfaceLanguage === "zh" ? "当前项目" : "Current project",
    );
    for (const path of appState?.recentVaults ?? []) {
      addProject(
        path,
        pathDisplayName(path),
        interfaceLanguage === "zh" ? "最近项目" : "Recent project",
      );
    }
    for (const suggestion of vaultSuggestions.filter((item) => item.exists)) {
      addProject(
        suggestion.path,
        suggestion.label || pathDisplayName(suggestion.path),
        suggestion.kind,
      );
    }
    return items.slice(0, 9);
  }, [appState?.recentVaults, interfaceLanguage, vaultDisplayName, vaultPath, vaultSuggestions]);

  useEffect(() => {
    if (!projectSwitcherOpen) return;

    const updateProjectSwitcherPosition = () => {
      const trigger = projectSwitcherTriggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const safePadding = 12;
      const menuWidth = Math.min(420, Math.max(280, viewportWidth - safePadding * 2));
      const estimatedMenuHeight = Math.min(
        520,
        viewportHeight - safePadding * 2,
        Math.max(160, projectSwitchOptions.length * 66 + 58),
      );
      const maxLeft = Math.max(safePadding, viewportWidth - menuWidth - safePadding);
      const opensFromRail = rect.left < NAV_RAIL_WIDTH + safePadding;
      const left = clampNumber(opensFromRail ? Math.max(rect.right + 10, NAV_RAIL_WIDTH + 10) : rect.right - menuWidth, safePadding, maxLeft);
      const maxTop = Math.max(safePadding, viewportHeight - estimatedMenuHeight - safePadding);
      const top = clampNumber(opensFromRail ? rect.top - estimatedMenuHeight - 8 : rect.bottom + 8, safePadding, maxTop);

      setProjectSwitcherMenuStyle({
        position: "fixed",
        top: `${top}px`,
        left: `${left}px`,
        width: `${menuWidth}px`,
        maxHeight: `${Math.max(160, Math.min(estimatedMenuHeight, viewportHeight - top - safePadding))}px`,
      });
    };

    updateProjectSwitcherPosition();
    window.addEventListener("resize", updateProjectSwitcherPosition);
    window.addEventListener("scroll", updateProjectSwitcherPosition, true);
    return () => {
      window.removeEventListener("resize", updateProjectSwitcherPosition);
      window.removeEventListener("scroll", updateProjectSwitcherPosition, true);
    };
  }, [projectSwitcherOpen, projectSwitchOptions.length]);

  const contractP0P1 = lintFindings.filter((finding) => finding.severity === "p0" || finding.severity === "p1").length;
  const openReviewCount = reviewItems.filter((item) => !["approved", "resolved", "ignored", "rejected"].includes(item.status)).length;
  const navBadgeForPage = (page: ShellPage): NavBadge | null => {
    if (!vaultPath && page !== "settings") return null;
    const sourceWork = (status?.counts.inbox ?? 0) + (planned?.blocked ?? 0);
    if (page === "sources" && sourceWork > 0) {
      return {
        value: sourceWork,
        tone: "warning",
        title: interfaceLanguage === "zh"
          ? `${sourceWork} 个资料待导入或解除阻塞`
          : `${sourceWork} source item${sourceWork === 1 ? "" : "s"} need${sourceWork === 1 ? "s" : ""} import or unblock`,
      };
    }
    const claimWork = status?.counts.claimsNeedingReview ?? 0;
    if (page === "claims" && claimWork > 0) {
      return {
        value: claimWork,
        tone: "warning",
        title: interfaceLanguage === "zh"
          ? `${claimWork} 条论断待审核`
          : `${claimWork} claim${claimWork === 1 ? "" : "s"} need${claimWork === 1 ? "s" : ""} review`,
      };
    }
    if (page === "reviews" && openReviewCount > 0) {
      return {
        value: openReviewCount > 99 ? "!" : openReviewCount,
        tone: "warning",
        title: interfaceLanguage === "zh"
          ? `${openReviewCount} 个审核项未处理`
          : `${openReviewCount} review item${openReviewCount === 1 ? " is" : "s are"} open`,
      };
    }
    const traceabilityWork = traceabilityWarnings.length + brokenEvidence + contractP0P1;
    if (page === "traceability" && traceabilityWork > 0) {
      return {
        value: traceabilityWork > 99 ? "!" : traceabilityWork,
        tone: "danger",
        title: interfaceLanguage === "zh"
          ? `${traceabilityWork} 个证据链或合约问题`
          : `${traceabilityWork} traceability or contract issue${traceabilityWork === 1 ? "" : "s"}`,
      };
    }
    const writebackWork = writebacks.filter((proposal) => proposal.status === "proposed" || proposal.status === "rejected").length;
    if (page === "writeback" && writebackWork > 0) {
      return {
        value: writebackWork,
        tone: "warning",
        title: interfaceLanguage === "zh"
          ? `${writebackWork} 个写回提案待处理`
          : `${writebackWork} writeback proposal${writebackWork === 1 ? "" : "s"} need${writebackWork === 1 ? "s" : ""} attention`,
      };
    }
    if (page === "activity" && runtimeRunning) {
      return {
        value: "live",
        tone: "live",
        title: interfaceLanguage === "zh" ? "运行任务正在执行" : "Runtime job is running",
      };
    }
    if (page === "settings" && status && !status.runtimeInstalled) {
      return {
        value: "!",
        tone: "danger",
        title: interfaceLanguage === "zh" ? "运行时路径需要设置" : "Runtime path needs setup",
      };
    }
    return null;
  };
  const pageStatusItems: PageStatusItem[] = (() => {
    if (!vaultPath) {
      return [
        { label: copy.labels.vault, value: copy.labels.notSelected, tone: "warning" },
        { label: copy.labels.recent, value: appState?.recentVaults.length ?? 0 },
        { label: copy.labels.suggestions, value: vaultSuggestions.filter((item) => item.exists).length },
      ];
    }
    if (activePage === "sources") {
      return [
        { label: copy.labels.rawInbox, value: status?.counts.inbox ?? 0 },
        { label: copy.labels.publishedSources, value: status?.counts.sources ?? 0, tone: "success" },
        { label: copy.labels.blocked, value: planned?.blocked ?? 0, tone: (planned?.blocked ?? 0) > 0 ? "danger" : "neutral" },
      ];
    }
    if (activePage === "claims") {
      return [
        { label: copy.labels.claims, value: status?.counts.claims ?? claims.length },
        { label: copy.labels.needsReview, value: status?.counts.claimsNeedingReview ?? 0, tone: (status?.counts.claimsNeedingReview ?? 0) > 0 ? "warning" : "success" },
        { label: copy.labels.contradicted, value: status?.counts.contradictedClaims ?? 0, tone: (status?.counts.contradictedClaims ?? 0) > 0 ? "danger" : "neutral" },
      ];
    }
    if (activePage === "concepts") {
      return [
        { label: copy.labels.conceptPages, value: status?.counts.concepts ?? 0, tone: "success" },
        { label: copy.labels.growthQueue, value: status?.counts.growthQueue ?? 0 },
        { label: copy.labels.reports, value: status?.counts.reports ?? 0 },
      ];
    }
    if (activePage === "reviews") {
      return [
        { label: copy.labels.openReviews, value: openReviewCount, tone: openReviewCount > 0 ? "warning" : "success" },
        { label: copy.labels.scienceQueue, value: status?.counts.scienceReviewQueue ?? 0 },
        { label: copy.labels.warnings, value: traceabilityWarnings.length, tone: traceabilityWarnings.length > 0 ? "warning" : "neutral" },
      ];
    }
    if (activePage === "traceability") {
      return [
        { label: copy.labels.warnings, value: traceabilityWarnings.length, tone: traceabilityWarnings.length > 0 ? "warning" : "success" },
        { label: copy.labels.evidenceBreaks, value: brokenEvidence, tone: brokenEvidence > 0 ? "danger" : "success" },
        { label: copy.labels.contract, value: contractP0P1, tone: contractP0P1 > 0 ? "danger" : "success" },
      ];
    }
    if (activePage === "writeback") {
      return [
        { label: copy.labels.proposals, value: writebacks.length },
        { label: copy.labels.approved, value: writebacks.filter((item) => item.status === "approved").length, tone: "warning" },
        { label: copy.labels.applied, value: writebacks.filter((item) => item.status === "applied").length, tone: "success" },
      ];
    }
    if (activePage === "activity") {
      return [
        { label: copy.labels.currentJob, value: activeJob?.status || copy.activity.idle, tone: runtimeRunning ? "warning" : "neutral" },
        { label: copy.labels.history, value: runtimeHistory.length },
        { label: copy.labels.failures, value: runtimeHistory.filter((job) => isRetryableRuntimeStatus(job.status)).length, tone: runtimeHistory.some((job) => isRetryableRuntimeStatus(job.status)) ? "danger" : "neutral" },
      ];
    }
    if (activePage === "settings") {
      return [
        { label: copy.labels.runtime, value: status?.runtimeInstalled ? copy.labels.ready : copy.labels.missing, tone: status?.runtimeInstalled ? "success" : "warning" },
        { label: copy.labels.parser, value: desktopSettings.defaultPdfParser },
        { label: copy.labels.cloudParsing, value: desktopSettings.cloudParsingAllowed ? copy.labels.allowed : copy.labels.off, tone: desktopSettings.cloudParsingAllowed ? "warning" : "neutral" },
      ];
    }
    return [
      { label: copy.labels.sources, value: status?.counts.sources ?? 0 },
      { label: copy.labels.concepts, value: status?.counts.concepts ?? 0 },
      { label: copy.labels.reviews, value: openReviewCount, tone: openReviewCount > 0 ? "warning" : "success" },
    ];
  })();

  const commandPaletteItems = useMemo<CommandPaletteItem[]>(() => {
    const isZh = interfaceLanguage === "zh";
    const openFile = (file: VaultFile) => {
      selectFileForDetails(file);
      setDetailDrawerOpen(true);
      if (file.kind === "source" || file.kind === "draft" || file.kind === "inbox") {
        setActivePage("sources");
      } else if (file.kind === "concept") {
        setActivePage("concepts");
      } else if (file.kind === "report") {
        setActivePage("dashboard");
      }
    };
    const navItems: CommandPaletteItem[] = navigationItems.map((item) => ({
      id: `nav:${item.id}`,
      label: copy.nav[item.id],
      section: isZh ? "切换视图" : "Switch view",
      detail: copy.pages[item.id].subtitle,
      keywords: [item.id, item.label, copy.pages[item.id].title, copy.pages[item.id].subtitle],
      run: () => setActivePage(item.id),
    }));
    const fileItems: CommandPaletteItem[] = (status?.files ?? []).slice(0, 80).map((file) => ({
      id: `file:${file.path}`,
      label: file.title || file.name,
      section: isZh ? "打开页面" : "Open page",
      detail: `${file.kind} · ${file.path}`,
      keywords: [file.kind, file.path, file.name, file.title || "", file.status || "", file.sourceId || ""],
      run: () => openFile(file),
    }));
    const actionItems: CommandPaletteItem[] = [
      {
        id: "action:obsidian",
        label: copy.obsidian,
        section: isZh ? "常用动作" : "Common action",
        detail: isZh ? "在 Obsidian 中打开当前 vault 入口。" : "Open the current vault entry in Obsidian.",
        keywords: ["obsidian", "vault", "open"],
        disabled: !vaultPath || busy === "obsidian_open",
        run: handleOpenObsidian,
      },
      {
        id: "action:refresh",
        label: copy.refresh,
        section: isZh ? "常用动作" : "Common action",
        detail: isZh ? "重新检查 vault、ingest plan、审核队列和图谱状态。" : "Refresh vault, ingest plan, review queue, and graph state.",
        keywords: ["refresh", "inspect", "dashboard", "status"],
        disabled: !vaultPath || busy === "inspect",
        run: () => refresh(),
      },
      {
        id: "action:ingest",
        label: isZh ? "运行处理流程" : "Run ingest pipeline",
        section: isZh ? "常用动作" : "Common action",
        detail: isZh ? `${runnableIngest} 个资料可运行。` : `${runnableIngest} runnable source item${runnableIngest === 1 ? "" : "s"}.`,
        keywords: ["ingest", "pipeline", "parse", "runtime"],
        disabled: !vaultPath || runtimeRunning || busy === "start:ingest_pipeline" || runnableIngest === 0,
        run: handleIngestPipeline,
      },
      {
        id: "action:lint",
        label: copy.pageActions.contractLint,
        section: isZh ? "常用动作" : "Common action",
        detail: isZh ? "运行合约检查，确认 schema、证据链和写回边界。" : "Run contract lint for schema, evidence, and writeback boundaries.",
        keywords: ["lint", "contract", "schema", "traceability"],
        disabled: !vaultPath || runtimeRunning || busy === "ingest_lint",
        run: handleIngestLint,
      },
      {
        id: "action:import-files",
        label: copy.importFiles,
        section: isZh ? "导入" : "Import",
        detail: isZh ? "导入 PDF / Markdown / TXT / ZIP 到当前 vault。" : "Import PDF / Markdown / TXT / ZIP into the current vault.",
        keywords: ["import", "files", "pdf", "markdown", "zip"],
        disabled: !vaultPath || busy === "import",
        run: handleImportFiles,
      },
      {
        id: "action:deep-research",
        label: isZh ? "打开深度研究" : "Open Deep Research",
        section: isZh ? "研究" : "Research",
        detail: isZh ? "打开右侧研究面板，生成 evidence-first 写回提案。" : "Open the right research panel for evidence-first proposals.",
        keywords: ["deep research", "query", "writeback", "proposal"],
        disabled: !vaultPath,
        run: () => setResearchPanelOpen(true),
      },
    ];
    return [...actionItems, ...navItems, ...fileItems];
  }, [busy, copy, interfaceLanguage, runnableIngest, runtimeRunning, status?.files, vaultPath]);

  const commandPaletteResults = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    if (!query) return commandPaletteItems.slice(0, 18);
    const tokens = query.split(/\s+/).filter(Boolean);
    return commandPaletteItems
      .map((item) => {
        const haystack = [item.label, item.section, item.detail, ...item.keywords].join(" ").toLowerCase();
        if (!tokens.every((token) => haystack.includes(token))) return null;
        const label = item.label.toLowerCase();
        const section = item.section.toLowerCase();
        const score = label.startsWith(query) ? 0 : label.includes(query) ? 1 : section.includes(query) ? 2 : 3;
        return { item, score };
      })
      .filter((entry): entry is { item: CommandPaletteItem; score: number } => Boolean(entry))
      .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label))
      .map((entry) => entry.item)
      .slice(0, 24);
  }, [commandPaletteItems, commandQuery]);

  useEffect(() => {
    setCommandActiveIndex((current) => Math.min(current, Math.max(commandPaletteResults.length - 1, 0)));
  }, [commandPaletteResults.length]);

  const runCommandPaletteItem = (item: CommandPaletteItem) => {
    if (item.disabled) return;
    setCommandPaletteOpen(false);
    setCommandQuery("");
    setCommandActiveIndex(0);
    void item.run();
  };

  const pagePrimaryActions: PagePrimaryAction[] = (() => {
    if (!vaultPath) {
      return [
        { label: interfaceLanguage === "zh" ? "新建项目" : "New Project", icon: <Archive size={15} />, onClick: () => setCreateProjectOpen(true), tone: "primary" },
        { label: interfaceLanguage === "zh" ? "打开项目" : "Open Project", icon: <FolderOpen size={15} />, onClick: chooseVault },
      ];
    }
    if (activePage === "sources") {
      return [
        { label: copy.importFiles, icon: <FileInput size={15} />, onClick: handleImportFiles, disabled: busy === "import", tone: "primary" },
        { label: copy.actionStrip.plan, icon: <ListChecks size={15} />, onClick: handlePlanIngest, disabled: busy === "plan_ingest" },
      ];
    }
    if (activePage === "claims") {
      return [
        { label: copy.pageActions.extractClaims, icon: <ClipboardList size={15} />, onClick: () => handleRuntime("claims"), disabled: runtimeRunning || busy === "start:claims", tone: "primary" },
        { label: copy.pageActions.reviewQueue, icon: <AlertTriangle size={15} />, onClick: () => setActivePage("reviews") },
      ];
    }
    if (activePage === "concepts") {
      return [
        { label: interfaceLanguage === "zh" ? "生成概念预览" : "Preview concepts", icon: <Database size={15} />, onClick: () => handleRuntime("concept_revision_preview"), disabled: runtimeRunning || busy === "start:concept_revision_preview", tone: "primary" },
        { label: interfaceLanguage === "zh" ? "应用概念" : "Apply concepts", icon: <Wrench size={15} />, onClick: () => handleRuntime("concept_revision_apply"), disabled: runtimeRunning || busy === "start:concept_revision_apply" },
      ];
    }
    if (activePage === "reviews") {
      return [
        { label: copy.pageActions.scienceReview, icon: <ShieldCheck size={15} />, onClick: () => handleRuntime("science_review"), disabled: runtimeRunning || busy === "start:science_review", tone: "primary" },
        { label: copy.pageActions.traceability, icon: <GitCompare size={15} />, onClick: () => setActivePage("traceability") },
      ];
    }
    if (activePage === "traceability") {
      return [
        { label: copy.pageActions.contractLint, icon: <ShieldCheck size={15} />, onClick: handleIngestLint, disabled: busy === "ingest_lint", tone: "primary" },
        { label: copy.pageActions.diagnosticBundle, icon: <TerminalSquare size={15} />, onClick: handleDiagnostic, disabled: busy === "diagnostic" },
      ];
    }
    if (activePage === "writeback") {
      return [
        { label: copy.pageActions.generateProposal, icon: <GitCompare size={15} />, onClick: handleCreateQueryWriteback, disabled: busy === "query_writeback", tone: "primary" },
        { label: copy.pageActions.openReviews, icon: <ClipboardList size={15} />, onClick: () => setActivePage("reviews") },
      ];
    }
    if (activePage === "activity") {
      return [
        { label: copy.activity.cancel, icon: <XCircle size={15} />, onClick: handleCancelRuntimeJob, disabled: !activeJob || isTerminalRuntimeStatus(activeJob.status) },
        { label: copy.actionStrip.diagnostic, icon: <TerminalSquare size={15} />, onClick: handleDiagnostic, disabled: busy === "diagnostic" },
      ];
    }
    if (activePage === "settings") {
      return [
        { label: copy.pageActions.saveSettings, icon: <Check size={15} />, onClick: handleSaveSettings, disabled: busy === "save_settings", tone: "primary" },
        { label: copy.pageActions.chooseRuntime, icon: <Settings size={15} />, onClick: chooseRuntime },
      ];
    }
    return [
      { label: copy.actionStrip.pipeline, icon: <Play size={15} />, onClick: handleIngestPipeline, disabled: runtimeRunning || busy === "start:ingest_pipeline" || runnableIngest === 0, tone: "primary" },
      { label: copy.nav.writeback, icon: <GitCompare size={15} />, onClick: () => setActivePage("writeback") },
    ];
  })();
  const claimWorkflowStats = {
    visible: visibleClaims.length,
    needsReview: claims.filter((claim) => claim.needsReview || claim.status === "needs_review" || claim.verdict === "needs_review").length,
    supported: claims.filter((claim) => claim.verdict === "supported").length,
    conflicted: claims.filter((claim) => claim.verdict === "contradicted").length,
  };
  const reviewWorkflowStats = {
    open: openReviewCount,
    approved: reviewItems.filter((item) => item.status === "approved" || item.status === "resolved").length,
    rejected: reviewItems.filter((item) => item.status === "rejected").length,
  };
  const traceabilityWorkflowStats = {
    warnings: traceabilityWarnings.length,
    broken: brokenEvidence,
    contract: contractP0P1,
  };
  const conceptReviewFlags = grouped.concept.reduce((total, file) => total + (file.needsReview ?? 0), 0);
  const conceptWorkflowStats = {
    concepts: grouped.concept.length,
    reviewFlags: conceptReviewFlags,
    orphanConcepts: status?.readingQuality?.orphanConcepts ?? 0,
    lowSynthesis: status?.readingQuality?.lowSynthesisConcepts ?? 0,
  };
  const renderDashboardActionPanel = () => (
    <section className="panel large">
      <div className="section-head">
        <h2>{interfaceLanguage === "zh" ? "下一步行动" : "Next actions"}</h2>
        <select className="compact-select" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
          <option value="open">{interfaceLanguage === "zh" ? "未处理" : "open"}</option>
          <option value="resolved">{interfaceLanguage === "zh" ? "已解决" : "resolved"}</option>
          <option value="ignored">{interfaceLanguage === "zh" ? "已忽略" : "ignored"}</option>
          <option value="all">{interfaceLanguage === "zh" ? "全部" : "all"}</option>
        </select>
      </div>
      <div className="action-summary-strip">
        <span><strong>{openActionCount}</strong>{interfaceLanguage === "zh" ? "未处理" : "open"}</span>
        <span><strong>{criticalActionCount}</strong>{interfaceLanguage === "zh" ? "P0/P1" : "P0/P1"}</span>
        <span><strong>{prioritizedActions.length}</strong>{interfaceLanguage === "zh" ? "当前筛选" : "filtered"}</span>
      </div>
      {prioritizedActions.length === 0 && <p className="empty">{interfaceLanguage === "zh" ? "暂无待处理行动。" : "No pending actions."}</p>}
      {focusedAction && (
        <div className="action-focus-panel">
          <div className="work-item action-focus-card" key={focusedAction.actionId}>
            <span className={classNames("status-chip", focusedAction.severity)}>{focusedAction.severity}</span>
            <strong>{focusedAction.title}</strong>
            <em>{focusedAction.body}</em>
            <code>{focusedAction.status} · {focusedAction.recommendedAction} · {interfaceLanguage === "zh" ? "影响对象" : "affected"} {focusedAction.affectedObjects.length} · {focusedAction.reason}</code>
            <div className="inline-actions">
              <button title={interfaceLanguage === "zh" ? "打开关联文件" : "Open linked file"} onClick={() => focusedAction.links[0] && void openWorkspacePath(focusedAction.links[0].path)} disabled={!focusedAction.links[0]}><FolderOpen size={14} />{interfaceLanguage === "zh" ? "打开" : "open"}</button>
              <button title={interfaceLanguage === "zh" ? "标记已解决" : "Mark resolved"} onClick={() => handleActionStatus(focusedAction.actionId, "resolved")} disabled={focusedAction.status === "resolved"}><Check size={14} />{interfaceLanguage === "zh" ? "解决" : "resolve"}</button>
              <button title={interfaceLanguage === "zh" ? "忽略该行动" : "Ignore action"} onClick={() => handleActionStatus(focusedAction.actionId, "ignored")} disabled={focusedAction.status === "ignored"}><XCircle size={14} />{interfaceLanguage === "zh" ? "忽略" : "ignore"}</button>
              <button title={interfaceLanguage === "zh" ? "重新打开行动" : "Reopen action"} onClick={() => handleActionStatus(focusedAction.actionId, "open")} disabled={focusedAction.status === "open"}><RotateCcw size={14} />{interfaceLanguage === "zh" ? "重开" : "reopen"}</button>
            </div>
          </div>
          <div className="action-stepper">
            <button type="button" onClick={() => setActionFocusIndex((current) => Math.max(current - 1, 0))} disabled={actionFocusIndex <= 0}>
              <ChevronLeft size={14} />{interfaceLanguage === "zh" ? "上一条" : "Previous"}
            </button>
            <span>{Math.min(actionFocusIndex + 1, prioritizedActions.length)} / {prioritizedActions.length}</span>
            <button type="button" onClick={() => setActionFocusIndex((current) => Math.min(current + 1, prioritizedActions.length - 1))} disabled={actionFocusIndex >= prioritizedActions.length - 1}>
              {interfaceLanguage === "zh" ? "下一条" : "Next"}<ChevronRight size={14} />
            </button>
            <button type="button" onClick={() => setActionListExpanded((current) => !current)}>
              {actionListExpanded ? (interfaceLanguage === "zh" ? "收起队列" : "Collapse") : (interfaceLanguage === "zh" ? "展开队列" : "Show queue")}
            </button>
          </div>
          <div className={classNames("action-queue-list", actionListExpanded && "expanded")}>
            {actionQueuePreview.map((action, index) => {
              const actualIndex = actionQueueStart + index;
              return (
                <button
                  type="button"
                  className={classNames("action-queue-item", actualIndex === actionFocusIndex && "active")}
                  key={action.actionId}
                  onClick={() => setActionFocusIndex(actualIndex)}
                >
                  <span className={classNames("status-chip inline", action.severity)}>{action.severity}</span>
                  <strong>{action.title}</strong>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
  const renderClaimLedgerPanel = (className = "panel large") => (
    <section className={className}>
      <div className="section-head">
        <h2>{interfaceLanguage === "zh" ? "论断台账" : "Claim ledger"}</h2>
        <select className="compact-select" value={claimFilter} onChange={(event) => setClaimFilter(event.target.value)}>
          <option value="needs_review">{interfaceLanguage === "zh" ? "需审核" : "needs_review"}</option>
          <option value="stale">{interfaceLanguage === "zh" ? "已失效" : "stale"}</option>
          <option value="contradicted">{interfaceLanguage === "zh" ? "冲突" : "contradicted"}</option>
          <option value="supported">{interfaceLanguage === "zh" ? "已支撑" : "supported"}</option>
          <option value="ignored">{interfaceLanguage === "zh" ? "已忽略" : "ignored"}</option>
          <option value="all">{interfaceLanguage === "zh" ? "全部" : "all"}</option>
        </select>
      </div>
      <div className="claim-list">
        {visibleClaims.length === 0 && <p className="empty">{interfaceLanguage === "zh" ? "暂无匹配论断。" : "No matching claims."}</p>}
        {visibleClaims.map((claim) => (
          <div className="work-item" key={claim.claimId}>
            <span className={classNames("status-chip", claim.verdict)}>{runtimeLabel(claim.verdict, interfaceLanguage)}</span>
            <strong>{runtimeText(claim.claimText, interfaceLanguage)}</strong>
            <em>{claim.sourceId || claim.sourceUuid || claim.sourcePath || `${interfaceLanguage === "zh" ? "第" : "line "}${claim.line}${interfaceLanguage === "zh" ? "行" : ""}`}</em>
            <code>{claim.evidenceHash || (interfaceLanguage === "zh" ? "无证据哈希" : "no evidence hash")} · {runtimeText(claim.evidenceQuote, interfaceLanguage) || (interfaceLanguage === "zh" ? "无引文" : "no quote")}</code>
            <div className="inline-actions">
              <button onClick={() => selectClaimForDetails(claim)}><PanelRightOpen size={14} />{interfaceLanguage === "zh" ? "详情" : "details"}</button>
              <button onClick={() => void openWorkspacePath("claims/claims.jsonl")}><FolderOpen size={14} />{interfaceLanguage === "zh" ? "打开" : "open"}</button>
              <button onClick={() => handleClaimVerdict(claim.claimId, "supported")} disabled={claim.verdict === "supported"}><Check size={14} />{interfaceLanguage === "zh" ? "支持" : "support"}</button>
              <button onClick={() => handleClaimVerdict(claim.claimId, "needs_review")} disabled={claim.verdict === "needs_review"}><AlertTriangle size={14} />{interfaceLanguage === "zh" ? "待审" : "review"}</button>
              <button onClick={() => handleClaimVerdict(claim.claimId, "stale")} disabled={claim.verdict === "stale"}><RotateCcw size={14} />{interfaceLanguage === "zh" ? "失效" : "stale"}</button>
              <button onClick={() => handleClaimVerdict(claim.claimId, "contradicted")} disabled={claim.verdict === "contradicted"}><XCircle size={14} />{interfaceLanguage === "zh" ? "冲突" : "conflict"}</button>
              <button onClick={() => handleClaimVerdict(claim.claimId, "ignored")} disabled={claim.verdict === "ignored"}><XCircle size={14} />{interfaceLanguage === "zh" ? "忽略" : "ignore"}</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
  const renderReviewQueuePanel = (className = "panel large") => (
    <section className={className}>
      <div className="section-head">
        <h2>{interfaceLanguage === "zh" ? "质检 / 审核工作台" : "QA / Review workspace"}</h2>
        <select className="compact-select" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}>
          <option value="open">{interfaceLanguage === "zh" ? "未处理" : "open"}</option>
          <option value="approved">{interfaceLanguage === "zh" ? "已批准" : "approved"}</option>
          <option value="rejected">{interfaceLanguage === "zh" ? "已拒绝" : "rejected"}</option>
          <option value="ignored">{interfaceLanguage === "zh" ? "已忽略" : "ignored"}</option>
          <option value="all">{interfaceLanguage === "zh" ? "全部" : "all"}</option>
        </select>
      </div>
      <div className="action-list">
        {visibleReviewItems.length === 0 && <p className="empty">{interfaceLanguage === "zh" ? "暂无审核项。" : "No review items."}</p>}
        {visibleReviewItems.map((item) => (
          <div className="work-item" key={item.itemId}>
            <span className={classNames("status-chip", item.severity)}>{item.severity}</span>
            <strong>{runtimeText(item.title, interfaceLanguage)}</strong>
            <em>{runtimeLabel(item.kind, interfaceLanguage)} · {runtimeLabel(item.status, interfaceLanguage)} · {runtimeLabel(item.recommendedAction, interfaceLanguage)}</em>
            <code>{runtimeText(item.body, interfaceLanguage)}</code>
            <div className="inline-actions">
              <button onClick={() => item.targetPath && void openWorkspacePath(item.targetPath)} disabled={!item.targetPath}><FolderOpen size={14} />{interfaceLanguage === "zh" ? "打开" : "open"}</button>
              <button onClick={() => handleReviewStatus(item.itemId, "approved")} disabled={item.status === "approved"}><Check size={14} />{interfaceLanguage === "zh" ? "批准" : "approve"}</button>
              <button onClick={() => handleReviewStatus(item.itemId, "rejected")} disabled={item.status === "rejected"}><XCircle size={14} />{interfaceLanguage === "zh" ? "拒绝" : "reject"}</button>
              <button onClick={() => handleReviewStatus(item.itemId, "ignored")} disabled={item.status === "ignored"}><XCircle size={14} />{interfaceLanguage === "zh" ? "忽略" : "ignore"}</button>
              <button
                onClick={() => handleReviewResearchTopic(item)}
                disabled={["approved", "resolved", "ignored", "rejected"].includes(item.status)}
              >
                <Search size={14} />{researchPanelLabel}
              </button>
              <button onClick={() => handleFollowup(item)}><ClipboardList size={14} />{interfaceLanguage === "zh" ? "后续动作" : "follow-up"}</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
  const renderTraceabilityWarningsPanel = () => (
    <section className="panel large traceability-primary">
      <div className="section-head">
        <h2>{interfaceLanguage === "zh" ? "可追踪性警告" : "Traceability warnings"}</h2>
        <span>{traceabilityWarnings.length} {interfaceLanguage === "zh" ? "个证据锚点问题" : "evidence-anchor issues"}</span>
      </div>
      <div className="impact-list">
        <TraceabilityActionCards
          warnings={traceabilityWarnings}
          language={interfaceLanguage}
          onOpenClaim={(warning) => openVaultItem(warning.claimPath)}
          onOpenSource={(warning) => openVaultItem(warning.sourcePath)}
          onOpenArtifact={(warning) => openVaultItem(warning.artifactPath)}
          onSelectWarning={(warning) => setDetailSelection({ kind: "warning", warning })}
        />
      </div>
    </section>
  );
  const renderEvidencePathPanel = () => (
    <section className="panel large evidence-path-panel">
      <div className="section-head">
        <h2>{interfaceLanguage === "zh" ? "证据路径" : "Evidence path"}</h2>
        <span>{evidencePaths.length} {interfaceLanguage === "zh" ? "条论断" : "claims"}</span>
      </div>
      <div className="impact-list">
        {evidencePaths.length === 0 && <p className="empty">{interfaceLanguage === "zh" ? "暂无可追踪论断。" : "No traceable claims yet."}</p>}
        {evidencePaths.map((item) => (
          <div className="work-item" key={item.claimId}>
            <span className={classNames("status-chip", item.chainStatus)}>{runtimeLabel(item.chainStatus, interfaceLanguage)}</span>
            <strong>{runtimeText(item.claimText, interfaceLanguage)}</strong>
            <em>{item.concept || (interfaceLanguage === "zh" ? "无概念" : "no concept")} · {item.sourceId || item.sourceUuid || (interfaceLanguage === "zh" ? "无资料" : "no source")}</em>
            <code>{item.evidenceAnchor || (interfaceLanguage === "zh" ? "缺失锚点" : "missing anchor")} · {item.missing.map((entry) => runtimeLabel(entry, interfaceLanguage)).join(", ") || (interfaceLanguage === "zh" ? "证据链完整" : "chain complete")}</code>
            <div className="inline-actions">
              <button onClick={() => item.sourcePage && void openWorkspacePath(item.sourcePage)} disabled={!item.sourcePage}><FolderOpen size={14} />{interfaceLanguage === "zh" ? "资料" : "source"}</button>
              <button onClick={() => item.artifactPath && void openWorkspacePath(item.artifactPath)} disabled={!item.artifactPath}><FileInput size={14} />{interfaceLanguage === "zh" ? "解析产物" : "artifact"}</button>
              <button onClick={() => item.qaReportPath && void openWorkspacePath(item.qaReportPath)} disabled={!item.qaReportPath}><ShieldCheck size={14} />{interfaceLanguage === "zh" ? "质检" : "QA"}</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
  const renderKnowledgeSidebar = () => {
    const primaryConcepts = grouped.concept.slice(0, 12);
    const primarySources = [...grouped.source, ...grouped.draft].slice(0, 12);
    const primaryNotes = grouped.note.slice(0, 8);
    const primaryReports = grouped.report.slice(0, 8);
    const fileTree = buildVaultFileTree(status?.files ?? []);
    const runnableCount = runnableIngestCount(ingestPlan);
    const reviewCount = openReviewCount + (status?.counts.claimsNeedingReview ?? 0);
    const traceabilityCount = traceabilityWarnings.length + brokenEvidence + contractP0P1;
    const selectedPath = activeReadingPath;
    return (
      <aside className="knowledge-sidebar" aria-label={interfaceLanguage === "zh" ? "知识树和文件树" : "Knowledge and file tree"}>
        <div className="knowledge-project">
          <div>
            <strong>{vaultDisplayName}</strong>
            <span>{interfaceLanguage === "zh" ? "LLM Wiki 工作区" : "LLM Wiki workspace"}</span>
          </div>
          <button type="button" onClick={chooseVault} title={interfaceLanguage === "zh" ? "切换项目" : "Switch project"}>
            <FolderOpen size={15} />
          </button>
        </div>

        <div className="knowledge-tabs" role="tablist" aria-label={interfaceLanguage === "zh" ? "导航模式" : "Navigation modes"}>
          <button
            type="button"
            className={classNames(sidebarTreeMode === "knowledge" && "active")}
            role="tab"
            aria-selected={sidebarTreeMode === "knowledge"}
            onClick={() => setSidebarTreeMode("knowledge")}
          >
            <Database size={14} />{interfaceLanguage === "zh" ? "知识树" : "Knowledge"}
          </button>
          <button
            type="button"
            className={classNames(sidebarTreeMode === "files" && "active")}
            role="tab"
            aria-selected={sidebarTreeMode === "files"}
            onClick={() => setSidebarTreeMode("files")}
          >
            <FileInput size={14} />{interfaceLanguage === "zh" ? "文件树" : "Files"}
          </button>
        </div>

        <div className="knowledge-stat-strip">
          <button type="button" onClick={() => setActivePage("sources")}>
            <strong>{status?.counts.sources ?? 0}</strong>
            <span>{interfaceLanguage === "zh" ? "资料" : "Sources"}</span>
          </button>
          <button type="button" onClick={() => setActivePage("concepts")}>
            <strong>{status?.counts.concepts ?? 0}</strong>
            <span>{interfaceLanguage === "zh" ? "概念" : "Concepts"}</span>
          </button>
          <button type="button" onClick={() => setActivePage("reviews")}>
            <strong>{reviewCount}</strong>
            <span>{interfaceLanguage === "zh" ? "审核" : "Review"}</span>
          </button>
        </div>

        <div className="knowledge-tree-scroll">
          {sidebarTreeMode === "knowledge" ? (
            <>
              <ShellTreeSection
                title={interfaceLanguage === "zh" ? "概念" : "Concepts"}
                meta={`${primaryConcepts.length}/${grouped.concept.length}`}
                icon={<Database size={14} />}
                files={primaryConcepts}
                empty={interfaceLanguage === "zh" ? "暂无概念页" : "No concept pages"}
                language={interfaceLanguage}
                selectedPath={selectedPath}
                onSelect={selectFileForDetails}
              />
              <ShellTreeSection
                title={interfaceLanguage === "zh" ? "资料" : "Sources"}
                meta={`${primarySources.length}/${grouped.source.length + grouped.draft.length}`}
                icon={<FileInput size={14} />}
                files={primarySources}
                empty={interfaceLanguage === "zh" ? "暂无资料页" : "No source pages"}
                language={interfaceLanguage}
                selectedPath={selectedPath}
                onSelect={selectFileForDetails}
              />
              <ShellTreeSection
                title={interfaceLanguage === "zh" ? "知识库笔记" : "Wiki Notes"}
                meta={`${primaryNotes.length}/${grouped.note.length}`}
                icon={<SquareStack size={14} />}
                files={primaryNotes}
                empty={interfaceLanguage === "zh" ? "暂无笔记" : "No notes"}
                language={interfaceLanguage}
                selectedPath={selectedPath}
                onSelect={selectFileForDetails}
              />
              <ShellTreeSection
                title={interfaceLanguage === "zh" ? "报告" : "Reports"}
                meta={`${primaryReports.length}/${grouped.report.length}`}
                icon={<ShieldCheck size={14} />}
                files={primaryReports}
                empty={interfaceLanguage === "zh" ? "暂无报告" : "No reports"}
                language={interfaceLanguage}
                selectedPath={selectedPath}
                onSelect={selectFileForDetails}
              />
            </>
          ) : (
            <ShellFileTree
              nodes={fileTree}
              empty={interfaceLanguage === "zh" ? "暂无 vault 文件" : "No vault files"}
              language={interfaceLanguage}
              selectedPath={selectedPath}
              onSelect={selectFileForDetails}
            />
          )}
        </div>

        <div className="knowledge-bottom">
          <div className="knowledge-next-actions">
            <button type="button" onClick={() => setActivePage("sources")}>
              <Play size={14} />
              <span>{interfaceLanguage === "zh" ? "可运行导入" : "Runnable ingest"}</span>
              <strong>{runnableCount}</strong>
            </button>
            <button type="button" onClick={() => setActivePage("traceability")}>
              <GitCompare size={14} />
              <span>{interfaceLanguage === "zh" ? "证据问题" : "Traceability"}</span>
              <strong>{traceabilityCount}</strong>
            </button>
          </div>
          <ActivityMiniPanel
            activeJob={activeJob}
            history={runtimeHistory}
            language={interfaceLanguage}
            runtimeRunning={runtimeRunning}
            getDurationSeconds={runtimeDurationSeconds}
            getLogPath={runtimeLogPath}
            isRetryable={isRetryableRuntimeStatus}
            isTerminal={isTerminalRuntimeStatus}
            statusTone={runtimeStatusTone}
            onOpenLog={openPath}
            onRetry={handleRetryRuntimeJob}
            onCancel={handleCancelRuntimeJob}
            onOpenActivity={() => setActivePage("activity")}
          />
        </div>
        <button
          type="button"
          className="shell-resize-handle knowledge-resize-handle"
          aria-label={interfaceLanguage === "zh" ? "调整知识树宽度" : "Resize knowledge sidebar"}
          aria-orientation="vertical"
          title={interfaceLanguage === "zh" ? "拖动调整知识树宽度" : "Drag to resize knowledge sidebar"}
          onMouseDown={startShellResize("knowledge")}
        />
      </aside>
    );
  };

  if (!vaultPath) {
    return (
      <main className="welcome-only-shell">
        {(error || restoreError) && (
          <div className="welcome-error-stack">
            {error && <pre className="error-box">{error}</pre>}
            {restoreError && <pre className="error-box subtle">{restoreError}</pre>}
          </div>
        )}
        <WelcomePanel
          language={interfaceLanguage}
          appState={appState}
          suggestions={vaultSuggestions}
          onToggleLanguage={toggleInterfaceLanguage}
          onChooseVault={chooseVault}
          onSelectVault={selectVault}
          createOpen={createProjectOpen}
          onCreateOpenChange={setCreateProjectOpen}
          onCreateVault={handleCreateVault}
          onCreateProject={handleCreateProject}
          onChooseParentDirectory={chooseParentDirectory}
          defaultParentDirectory={desktopSettings.parentDirectory}
          defaultLanguage={desktopSettings.aiOutputLanguage}
          busy={busy}
        />
      </main>
    );
  }

  return (
    <main
      ref={shellRef}
      style={shellLayoutStyle}
      className={classNames(
        "app-shell",
        activePage !== "settings" && "nashsu-aligned-shell",
        activePage === "graph" && "graph-mode",
        navRailExpanded && "nav-rail-expanded",
        `interface-${interfaceLanguage}`,
        activePage === "settings" && "settings-mode",
        chatWorkspaceMode && "chat-workspace-mode",
        shellInspectorVisible && "inspector-open",
        dragActive && "drag-active",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      <aside className="icon-sidebar" aria-label="Primary navigation">
        <div className="icon-brand" title="LLM Wiki">
          <BrandMark size={42} />
        </div>
        <nav className="nav-rail">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const badge = navBadgeForPage(item.id);
            const title = badge ? `${copy.nav[item.id]} · ${badge.title}` : copy.nav[item.id];
            return (
              <button
                key={item.id}
                className={classNames("nav-button", activePage === item.id && "active")}
                title={title}
                aria-label={title}
                onClick={() => setActivePage(item.id)}
              >
                <Icon size={19} />
                <span className="nav-label">{copy.nav[item.id]}</span>
                {badge !== null && <span className={classNames("nav-badge", badge.tone)}>{badge.value}</span>}
              </button>
            );
          })}
          <button
            type="button"
            className={classNames("nav-button", researchPanelOpen && "active")}
            title={researchPanelLabel}
            aria-label={researchPanelLabel}
            onClick={() => {
              if (activePage === "settings") {
                setActivePage("chat");
                setResearchPanelOpen(true);
                return;
              }
              setResearchPanelOpen((open) => !open);
            }}
          >
            <Search size={19} />
            <span className="nav-label">{researchPanelLabel}</span>
            {busy === "query_writeback" && <span className="nav-badge live">1</span>}
          </button>
        </nav>
        <button
          type="button"
          className={classNames("nav-button", "nav-rail-toggle", navRailExpanded && "active")}
          title={navRailToggleTitle}
          aria-label={navRailToggleTitle}
          aria-pressed={navRailExpanded}
          onClick={() => setNavRailExpanded((expanded) => !expanded)}
        >
          {navRailExpanded ? <ChevronLeft size={19} /> : <ChevronRight size={19} />}
          <span className="nav-label">{navRailToggleLabel}</span>
        </button>
        <div
          className="rail-project-switcher"
          onBlur={(event) => {
            const nextTarget = event.relatedTarget;
            if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
              setProjectSwitcherOpen(false);
            }
          }}
        >
          <button
            ref={projectSwitcherTriggerRef}
            type="button"
            className={classNames("rail-project-switcher-trigger", tone)}
            onClick={() => setProjectSwitcherOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={projectSwitcherOpen}
            aria-label={interfaceLanguage === "zh" ? "切换项目" : "Switch project"}
            title={`${interfaceLanguage === "zh" ? "切换项目" : "Switch project"} · ${vaultPath || "No vault selected"}`}
          >
            <Database size={18} />
            <span aria-hidden="true" />
          </button>
          {projectSwitcherOpen && (
            <div className="project-switcher-menu rail-project-switcher-menu" role="menu" style={projectSwitcherMenuStyle}>
              {projectSwitchOptions.map((item) => (
                <button
                  type="button"
                  role="menuitem"
                  key={item.path}
                  disabled={item.path === vaultPath}
                  onClick={() => {
                    setProjectSwitcherOpen(false);
                    if (item.path !== vaultPath) void selectVault(item.path);
                  }}
                >
                  <strong>{item.label}</strong>
                  <span>{item.meta}</span>
                  <code>{visiblePath(item.path)}</code>
                </button>
              ))}
              <div className="project-switcher-actions">
                <button
                  type="button"
                  onClick={() => {
                    setProjectSwitcherOpen(false);
                    setCreateProjectOpen(true);
                  }}
                >
                  <Archive size={14} />
                  {interfaceLanguage === "zh" ? "新建项目" : "New Project"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProjectSwitcherOpen(false);
                    void chooseVault();
                  }}
                >
                  <FolderOpen size={14} />
                  {interfaceLanguage === "zh" ? "打开项目" : "Open Project"}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {vaultPath && createProjectOpen && (
        <WelcomePanel
          modalOnly
          language={interfaceLanguage}
          appState={appState}
          suggestions={vaultSuggestions}
          onToggleLanguage={toggleInterfaceLanguage}
          onChooseVault={chooseVault}
          onSelectVault={selectVault}
          createOpen={createProjectOpen}
          onCreateOpenChange={setCreateProjectOpen}
          onCreateVault={handleCreateVault}
          onCreateProject={handleCreateProject}
          onChooseParentDirectory={chooseParentDirectory}
          defaultParentDirectory={desktopSettings.parentDirectory}
          defaultLanguage={desktopSettings.aiOutputLanguage}
          busy={busy}
        />
      )}

      {shellKnowledgeVisible && renderKnowledgeSidebar()}

      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>{activePageCopy.title}</h2>
            <p>{activePageCopy.subtitle}</p>
          </div>
          <div className="topbar-status">
            <div className={classNames("health", tone)}>
              {tone === "ok" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              {vaultPath ? (status ? (status.schemaValid ? copy.labels.schemaValid : copy.labels.schemaInvalid) : copy.labels.inspecting) : copy.brandSubtitleNoVault}
            </div>
            {activePage !== "settings" && (
              <>
                <div className={classNames("status-pill", status?.runtimeInstalled && "ok")}>
                  <TerminalSquare size={15} />
                  <span>{status?.runtimeInstalled ? copy.labels.runtimeReady : copy.labels.runtimeMissing}</span>
                </div>
                <div className={classNames("status-pill", status?.obsidianEnabled && "ok")}>
                  <SquareStack size={15} />
                  <span>{status?.obsidianEnabled ? copy.labels.obsidianEnabled : copy.labels.obsidianOff}</span>
                </div>
                <div className={classNames("status-pill", status?.dashboardAvailable && "ok")}>
                  <BarChart3 size={15} />
                  <span>{status?.dashboardAvailable ? copy.labels.dashboardReady : copy.labels.dashboardMissing}</span>
                </div>
              </>
            )}
            <button
              className="command-palette-trigger"
              type="button"
              onClick={() => {
                setCommandQuery("");
                setCommandActiveIndex(0);
                setCommandPaletteOpen(true);
              }}
              title={interfaceLanguage === "zh" ? "快速切换页面和动作" : "Quickly switch pages and actions"}
            >
              <Search size={15} />
              <span>{interfaceLanguage === "zh" ? "快速切换" : "Quick Switch"}</span>
              <kbd>{typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}</kbd>
            </button>
            <button className="language-toggle" type="button" onClick={toggleInterfaceLanguage} title={`Switch to ${copy.languageToggle}`}>
              <Languages size={15} />
              <span>{copy.languageToggle}</span>
            </button>
            {shellStatusHeaderVisible && (
              <button
                className="sidebar-toggle"
                type="button"
                onClick={() => setDetailDrawerOpen((open) => !open)}
                aria-expanded={detailDrawerOpen}
                title={interfaceLanguage === "zh" ? "打开知识库检查侧栏" : "Open Vault / Inspector sidebar"}
              >
                <PanelRightOpen size={15} />
                <span>{interfaceLanguage === "zh" ? "侧栏" : "Inspector"}</span>
              </button>
            )}
          </div>
        </header>

        {error && <pre className="error-box">{error}</pre>}
        {restoreError && <pre className="error-box subtle">{restoreError}</pre>}

        {shellStatusHeaderVisible && (
          <PageStatusHeader
            title={activePageCopy.title}
            subtitle={activePageCopy.subtitle}
            statusItems={pageStatusItems}
            primaryActions={pagePrimaryActions}
          />
        )}

        {!vaultPath && (
          <WelcomePanel
            language={interfaceLanguage}
            appState={appState}
            suggestions={vaultSuggestions}
            onToggleLanguage={toggleInterfaceLanguage}
            onChooseVault={chooseVault}
            onSelectVault={selectVault}
            createOpen={createProjectOpen}
            onCreateOpenChange={setCreateProjectOpen}
            onCreateVault={handleCreateVault}
            onCreateProject={handleCreateProject}
            onChooseParentDirectory={chooseParentDirectory}
            defaultParentDirectory={desktopSettings.parentDirectory}
            defaultLanguage={desktopSettings.aiOutputLanguage}
            busy={busy}
          />
        )}

        {vaultPath && (
          <>
        {pageVisible("dashboard") && (
          <DeepSeekVaultHome
            language={interfaceLanguage}
            vaultName={vaultDisplayName}
            counts={status?.counts}
            reviewOpenCount={openReviewCount}
            traceabilityWarningCount={traceabilityWarnings.length + brokenEvidence}
            proposalCount={writebacks.length}
            onOpenSources={() => setActivePage("sources")}
            onOpenConcepts={() => setActivePage("concepts")}
            onOpenReviews={() => setActivePage("reviews")}
            onOpenTraceability={() => setActivePage("traceability")}
            onOpenWriteback={() => setActivePage("writeback")}
            onOpenGraph={() => setActivePage("graph")}
          />
        )}
        <DashboardOverview
          className={classNames("view-section", pageVisible("dashboard") && "visible")}
          language={interfaceLanguage}
          vaultPath={vaultPath}
          status={status}
          desktopSettings={desktopSettings}
          ingestPlan={ingestPlan}
          writebacks={writebacks}
          traceabilityWarnings={traceabilityWarnings}
          lintFindings={lintFindings}
          entryNote={entryNote}
          brokenEvidence={brokenEvidence}
          openReviewCount={openReviewCount}
          runtimeRunning={runtimeRunning}
          runtimeHistoryCount={runtimeHistory.length}
          busy={busy}
          onRefresh={() => refresh()}
          onOpenSettings={() => setActivePage("settings")}
          onOpenSources={() => setActivePage("sources")}
          onOpenReviews={() => setActivePage("reviews")}
          onOpenTraceability={() => setActivePage("traceability")}
          onOpenWriteback={() => setActivePage("writeback")}
          onOpenActivity={() => setActivePage("activity")}
          onChooseRuntime={chooseRuntime}
          onPlanIngest={handlePlanIngest}
          onRunLint={handleIngestLint}
          onRunPipeline={handleIngestPipeline}
          onOpenObsidian={handleOpenObsidian}
          onOpenReadingQualityReport={handleOpenReadingQualityReport}
          onRunObsidianSetup={handleObsidianSetup}
        />

        <RawSourcesWorkspace
          className={classNames("view-section", pageVisible("sources") && "visible")}
          language={interfaceLanguage}
          vaultPath={vaultPath}
          status={status}
          registry={registry}
          artifacts={artifacts}
          claims={claims}
          evidencePaths={evidencePaths}
          traceabilityWarnings={traceabilityWarnings}
          ingestPlan={ingestPlan}
          importResults={importResults}
          preserveFolders={preserveFolders}
          busy={busy}
          onPreserveFoldersChange={setPreserveFolders}
          onRefresh={() => refresh()}
          onImportFiles={handleImportFiles}
          onImportFolder={handleImportFolder}
          onPlanIngest={handlePlanIngest}
          onOpenPath={openWorkspacePath}
          onRevealPath={revealResolvedPath}
          onOpenVaultItem={openVaultItem}
          onCopyText={copyText}
          resolveVaultPath={vaultFilePath}
        />

        <RuntimeSettingsPanel
          className={classNames("view-section", pageVisible("settings") && "visible")}
          language={interfaceLanguage}
          settings={desktopSettings}
          setSettings={setDesktopSettings}
          vaultPath={vaultPath}
          busy={busy}
          onChooseRuntime={chooseRuntime}
          onSaveSettings={handleSaveSettings}
          onPlanIngest={handlePlanIngest}
          onToggleLanguage={toggleInterfaceLanguage}
        />

        <section className={classNames("drop-zone view-section", dragActive && "active", pageVisible("dashboard") && "visible")}>
          <div>
            <strong>{copy.importDropTitle}</strong>
            <span>{enqueueAfterImport ? copy.importDropQueued : copy.importDropInboxOnly}</span>
          </div>
          <div className="inline-actions">
            <button onClick={handleImportFiles} disabled={!vaultPath || busy === "import"}><FileInput size={16} />{copy.importFiles}</button>
            <button onClick={handleImportFolder} disabled={!vaultPath || busy === "import"}><FolderOpen size={16} />{copy.importFolder}</button>
            <label className="check-row">
              <input type="checkbox" checked={preserveFolders} onChange={(event) => setPreserveFolders(event.target.checked)} />
              {copy.preserveFolderContext}
            </label>
          </div>
        </section>

        <section className={classNames("action-strip view-section", pageVisible("dashboard") && "visible")}>
          <button onClick={handlePlanIngest} disabled={!vaultPath || busy === "plan_ingest"}><ListChecks size={16} />{copy.actionStrip.plan}</button>
          <button onClick={handleIngestLint} disabled={!vaultPath || busy === "ingest_lint"}><ShieldCheck size={16} />{copy.actionStrip.lint}</button>
          <button onClick={handleIngestPipeline} disabled={!vaultPath || runtimeRunning || busy === "start:ingest_pipeline" || runnableIngest === 0}><Play size={16} />{copy.actionStrip.pipeline}</button>
          <button onClick={handleRepairTemplates} disabled={!vaultPath || busy === "repair_templates"}><Wrench size={16} />{copy.actionStrip.repair}</button>
          <button onClick={handleDiagnostic} disabled={!vaultPath || busy === "diagnostic"}><TerminalSquare size={16} />{copy.actionStrip.diagnostic}</button>
          {runtimeActions.map((action) => {
            const Icon = action.icon;
            return (
              <button key={action.id} onClick={() => handleRuntime(action.id)} disabled={!vaultPath || runtimeRunning || busy === `start:${action.id}`}>
                <Icon size={16} />{copy.runtimeActions[action.id] || action.label}
              </button>
            );
          })}
        </section>

        <section className={classNames("panel activity-panel view-section", pageVisible("activity", "dashboard") && "visible")}>
          <div className="section-head">
            <h2>{copy.activity.title}</h2>
            <span>{activeJob ? `${runtimeLabel(activeJob.status, interfaceLanguage)} · ${runtimeDurationSeconds(activeJob)}s` : copy.activity.idle}</span>
          </div>
          <div className="activity-meta">
            <span>{interfaceLanguage === "zh" ? "任务" : "Job"}: {activeJob?.jobId || (interfaceLanguage === "zh" ? "无" : "none")}</span>
            <span>{interfaceLanguage === "zh" ? "阶段" : "Stage"}: {runtimeLabel(activeJob?.stage || busy || copy.activity.idle, interfaceLanguage)}</span>
            <span>{interfaceLanguage === "zh" ? "开始时间" : "Started"}: {activeJob?.startedAt || (interfaceLanguage === "zh" ? "无" : "none")}</span>
            <span>{interfaceLanguage === "zh" ? "耗时" : "Duration"}: {activeJob ? `${runtimeDurationSeconds(activeJob)}s` : "0s"}</span>
            <span>{interfaceLanguage === "zh" ? "尝试" : "Attempt"}: {activeJob ? `${activeJob.attempt}/${activeJob.maxAttempts}` : `${desktopSettings.retryCount} ${interfaceLanguage === "zh" ? "已配置" : "configured"}`}</span>
            <span>{interfaceLanguage === "zh" ? "重试次数" : "Retry count"}: {activeJob ? runtimeRetryCount(activeJob) : desktopSettings.retryCount}</span>
            <span>{interfaceLanguage === "zh" ? "超时" : "Timeout"}: {desktopSettings.timeoutSeconds}s</span>
            <span>{interfaceLanguage === "zh" ? "实时日志" : "Live log"}: {activeJob ? runtimeLogPath(activeJob) || (interfaceLanguage === "zh" ? "仅实时流" : "stream only") : (interfaceLanguage === "zh" ? "无" : "none")}</span>
            <span>{interfaceLanguage === "zh" ? "命令" : "Command"}: {activeJob ? runtimeCommandLabel(activeJob) : (interfaceLanguage === "zh" ? "无" : "none")}</span>
          </div>
          <div className="inline-actions">
            <button onClick={handleCancelRuntimeJob} disabled={!activeJob || isTerminalRuntimeStatus(activeJob.status)}><XCircle size={14} />{copy.activity.cancel}</button>
            <button onClick={() => activeJob && runtimeLogPath(activeJob) && openPath(runtimeLogPath(activeJob))} disabled={!activeJob || !runtimeLogPath(activeJob)}><TerminalSquare size={14} />{copy.activity.openLog}</button>
            <button onClick={() => activeJob && handleRetryRuntimeJob(activeJob)} disabled={!activeJob || runtimeRunning || !isRetryableRuntimeStatus(activeJob.status)}><RotateCcw size={14} />{copy.activity.retry}</button>
          </div>
          <pre className="live-log">
            {liveLogLines.length ? liveLogLines.join("\n") : interfaceLanguage === "zh" ? "命令运行时会在这里显示实时输出。" : "Runtime stdout/stderr will stream here while commands run."}
          </pre>
          <div className="runtime-history">
            {runtimeHistory.length === 0 && <p className="empty">{copy.activity.emptyHistory}</p>}
            {runtimeHistory.slice(0, 8).map((job) => (
              <div className="runtime-history-item" key={job.jobId}>
                <span className={classNames("status-chip", runtimeStatusTone(job.status))}>{runtimeLabel(job.status, interfaceLanguage)}</span>
                <strong>{runtimeLabel(job.kind, interfaceLanguage)}</strong>
                <em>
                  {job.startedAt} · {runtimeDurationSeconds(job)}s · {interfaceLanguage === "zh" ? "尝试" : "attempt"} {job.attempt}/{job.maxAttempts} · {interfaceLanguage === "zh" ? "重试" : "retry"} {runtimeRetryCount(job)} · {interfaceLanguage === "zh" ? "退出码" : "exit"} {job.exitCode ?? (interfaceLanguage === "zh" ? "运行中" : "running")}
                </em>
                <code>{runtimeLogPath(job) || job.message || runtimeCommandLabel(job)}</code>
                {job.stdoutTail && <code>stdout: {job.stdoutTail}</code>}
                {job.stderrTail && <code>stderr: {job.stderrTail}</code>}
                <div className="history-actions">
                  <button type="button" onClick={() => runtimeLogPath(job) && openPath(runtimeLogPath(job))} disabled={!runtimeLogPath(job)}><TerminalSquare size={12} />{interfaceLanguage === "zh" ? "日志" : "log"}</button>
                  <button type="button" onClick={() => handleRetryRuntimeJob(job)} disabled={runtimeRunning || !isRetryableRuntimeStatus(job.status)}><RotateCcw size={12} />{interfaceLanguage === "zh" ? "重试" : "retry"}</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className={classNames("main-grid view-section", pageVisible("activity") && "visible")}>
          <section className="panel large">
            <div className="section-head">
              <h2>导入结果</h2>
              <span>{importResults.length} {interfaceLanguage === "zh" ? "个文件" : "files"}</span>
            </div>
            <div className="ingest-list">
              {importResults.length === 0 && <p className="empty">暂无本轮导入结果。</p>}
              {importResults.map((item) => (
                <button key={`${item.sourcePath}-${item.sha256}`} onClick={() => item.targetPath && void openWorkspacePath(item.targetPath)}>
                  <span className={classNames("status-chip", item.status)}>{runtimeLabel(item.status, interfaceLanguage)}</span>
                  <strong>{item.fileName}</strong>
                  <em>{item.mime} · {(item.sizeBytes / 1024).toFixed(1)} KB · {item.folderContext || (interfaceLanguage === "zh" ? "根目录" : "root")}</em>
                  <code>{item.sha256.slice(0, 16)} · {item.reason || item.doi || item.arxivId || item.titleHint || (interfaceLanguage === "zh" ? "无元数据" : "no metadata")} · {item.duplicateOf || item.approximateDuplicateOf || item.targetPath || item.sourcePath}</code>
                </button>
              ))}
            </div>
          </section>

          <section className="panel large">
            <div className="section-head">
              <h2>{interfaceLanguage === "zh" ? "逐资料队列" : "Per-source queue"}</h2>
              <span>{jobs.length ? `${progressDone}/${jobs.length} ${interfaceLanguage === "zh" ? "已完成" : "done"}` : `0 ${interfaceLanguage === "zh" ? "个任务" : "jobs"}`}</span>
            </div>
            <div className="queue-list">
              {jobs.length === 0 && <p className="empty">{interfaceLanguage === "zh" ? "暂无资料任务。" : "No source jobs yet."}</p>}
              {jobs.map((job) => (
                <div className="work-item" key={job.jobId}>
                  <span className={classNames("status-chip", job.status)}>{runtimeLabel(job.status, interfaceLanguage)}</span>
                  <strong>{job.sourceId || job.fileName}</strong>
                  <em>{runtimeLabel(job.currentStep, interfaceLanguage)} · {runtimeLabel(job.nextAction, interfaceLanguage)} · {interfaceLanguage === "zh" ? "尝试" : "attempt"} {job.attempt}/{job.maxAttempts}</em>
                  <code>{runtimeText(job.lastError || job.reason, interfaceLanguage)}</code>
                  <div className="inline-actions">
                    <button title={interfaceLanguage === "zh" ? "打开当前解析产物或原始资料" : "Open current artifact or raw source"} onClick={() => void openWorkspacePath(job.artifactPath || job.sourcePath)}><FolderOpen size={14} />{interfaceLanguage === "zh" ? "打开" : "Open"}</button>
                    <button title="重新排队" onClick={() => handleJobStatus(job.jobId, "queued")} disabled={job.status === "queued"}><RotateCcw size={14} />重试</button>
                    <button title={interfaceLanguage === "zh" ? "取消本资料的处理流程" : "Cancel this source pipeline"} onClick={() => handleJobStatus(job.jobId, "cancelled")} disabled={job.status === "cancelled"}><XCircle size={14} />{interfaceLanguage === "zh" ? "取消" : "Cancel"}</button>
                    <button title={interfaceLanguage === "zh" ? "打开任务日志" : "Open job log"} onClick={() => job.logPath && openPath(vaultFilePath(job.logPath))} disabled={!job.logPath}><TerminalSquare size={14} />{interfaceLanguage === "zh" ? "日志" : "Log"}</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {pageVisible("traceability") && (
          <>
            <WorkflowGuide
              title={interfaceLanguage === "zh" ? "怎么处理可追踪性问题" : "How to use traceability"}
              body={interfaceLanguage === "zh"
                ? "这页只检查证据链和运行时合约。先看断裂原因，再打开论断、资料和解析产物，修复后重新运行可追踪性检查和 lint。"
                : "This page only inspects evidence chains and runtime contracts. Review the break reason, open the claim/source/artifact, then rerun traceability checks and lint after repair."}
              steps={interfaceLanguage === "zh" ? [
                { title: "定位断点", body: "先看警告中的缺失锚点、资料 UUID 或解析产物。" },
                { title: "打开证据", body: "用资料、解析产物和质检按钮核对实际文件。" },
                { title: "修复并复检", body: "修复缺口后运行合约检查，确认 P0/P1 清零。" },
                { title: "再进入审核", body: "证据链稳定后，再去审核页处理批准或拒绝。" },
              ] : [
                { title: "Find the break", body: "Start with missing anchors, source UUIDs, or artifacts." },
                { title: "Open evidence", body: "Use source, artifact, and QA actions to inspect files." },
                { title: "Fix and recheck", body: "Run contract lint again and clear P0/P1 issues." },
                { title: "Review later", body: "Approve or reject only after the evidence chain is stable." },
              ]}
            />
            <div className="workflow-metrics traceability-metrics">
              <span><strong>{traceabilityWorkflowStats.warnings}</strong>{interfaceLanguage === "zh" ? "警告" : "warnings"}</span>
              <span><strong>{traceabilityWorkflowStats.broken}</strong>{interfaceLanguage === "zh" ? "证据断点" : "broken chains"}</span>
              <span><strong>{traceabilityWorkflowStats.contract}</strong>{interfaceLanguage === "zh" ? "P0/P1 合约" : "P0/P1 contract"}</span>
            </div>
            <div className="main-grid traceability-workspace-grid view-section visible">
              {renderTraceabilityWarningsPanel()}
              {renderEvidencePathPanel()}
            </div>
          </>
        )}

        {pageVisible("reviews") && (
          <>
            <WorkflowGuide
              title={interfaceLanguage === "zh" ? "怎么处理审核" : "How to use reviews"}
              body={interfaceLanguage === "zh"
                ? "这页只处理人工审核边界。先打开目标证据，确认论断是否被支持，再批准、拒绝或忽略；需要修证据链时再跳到可追踪性。"
                : "This page only handles human review boundaries. Open the target evidence first, decide whether the claim is supported, then approve, reject, or ignore; use Traceability when the evidence chain must be repaired."}
              steps={interfaceLanguage === "zh" ? [
                { title: "筛选队列", body: "默认只看未处理审核，避免已完成项干扰。" },
                { title: "打开目标", body: "先打开目标文件和关联证据，不凭摘要批准。" },
                { title: "作出决定", body: "批准、拒绝或忽略只改变审核状态，不伪造科学结论。" },
                { title: "生成后续", body: "复杂问题生成后续动作，再回到论断或追踪页处理。" },
              ] : [
                { title: "Filter queue", body: "Start with open review items only." },
                { title: "Open target", body: "Inspect the target and evidence before any approval." },
                { title: "Decide", body: "Approve, reject, or ignore the review status only." },
                { title: "Follow up", body: "Create a follow-up and continue in Claims or Traceability." },
              ]}
            />
            <div className="main-grid reviews-workspace-grid view-section visible">
              {renderReviewQueuePanel("panel large review-queue-primary")}
              <section className="panel large review-context-panel">
                <div className="section-head">
                  <h2>{interfaceLanguage === "zh" ? "审核上下文" : "Review context"}</h2>
                  <ShieldCheck size={18} />
                </div>
                <div className="workflow-metrics compact">
                  <span><strong>{reviewWorkflowStats.open}</strong>{interfaceLanguage === "zh" ? "未处理" : "open"}</span>
                  <span><strong>{reviewWorkflowStats.approved}</strong>{interfaceLanguage === "zh" ? "已完成" : "done"}</span>
                  <span><strong>{reviewWorkflowStats.rejected}</strong>{interfaceLanguage === "zh" ? "已拒绝" : "rejected"}</span>
                </div>
                <p className="workflow-hint">
                  {interfaceLanguage === "zh"
                    ? "当审核项涉及缺失锚点、资料 UUID 或解析产物问题时，先去可追踪性页修复，再回到这里审批。"
                    : "When a review item involves missing anchors, source UUIDs, or artifacts, repair it in Traceability first and return here for approval."}
                </p>
                <div className="inline-actions">
                  <button onClick={() => setActivePage("claims")}><ClipboardList size={14} />{interfaceLanguage === "zh" ? "查看论断" : "Claims"}</button>
                  <button onClick={() => setActivePage("traceability")}><GitCompare size={14} />{interfaceLanguage === "zh" ? "检查证据链" : "Traceability"}</button>
                  <button onClick={() => handleRuntime("science_review")} disabled={runtimeRunning || busy === "start:science_review"}><ShieldCheck size={14} />{copy.pageActions.scienceReview}</button>
                </div>
              </section>
            </div>
          </>
        )}

        <QueryWritebackComposer
            className={classNames("view-section", pageVisible("writeback") && "visible")}
            language={interfaceLanguage}
            vaultPath={vaultPath}
            busy={busy}
            queryText={queryText}
            queryTarget={queryTarget}
            queryDraft={queryDraft}
            writebackTarget={writebackTarget}
            writebackTitle={writebackTitle}
            writebackContent={writebackContent}
            writebacks={writebacks}
            applyStatus={writebackApplyStatus}
            onQueryTextChange={setQueryText}
            onQueryTargetChange={setQueryTarget}
            onWritebackTargetChange={setWritebackTarget}
            onWritebackTitleChange={setWritebackTitle}
            onWritebackContentChange={setWritebackContent}
            onCreateQueryWriteback={handleCreateQueryWriteback}
            onCreateWriteback={handleCreateWriteback}
            onSetWritebackStatus={handleWritebackStatus}
            onApplyWriteback={handleApplyWriteback}
            onSelectProposal={(proposal) => setDetailSelection({ kind: "proposal", proposal })}
            onOpenPath={openWorkspacePath}
            resolveVaultPath={vaultFilePath}
        />

        <ChatSearchPage
          className={classNames("view-section", pageVisible("chat") && "visible")}
          language={interfaceLanguage}
          vaultPath={vaultPath}
          status={status}
          claims={claims}
          evidencePaths={evidencePaths}
          reviewItems={reviewItems}
          writebacks={writebacks}
          traceabilityWarnings={traceabilityWarnings}
          providerCenter={desktopSettings.llmProviderCenter}
          handoffQuestion={chatHandoff?.question}
          handoffTargetPath={chatHandoff?.targetPath}
          handoffKey={chatHandoff?.key}
          busy={busy}
          onOpenPath={openWorkspacePath}
          resolveVaultPath={vaultFilePath}
          onCreateProposal={handleCreateQueryWritebackFromChat}
          onCreateAnswerProposal={handleCreateAnswerWritebackFromChat}
          onOpenVaultItem={openVaultItem}
          onRevealPath={(path) => {
            void revealPath(path).catch((err) => setError(String(err)));
          }}
          onCopyText={copyText}
        />

        <ResearchGraphPage
          className={classNames("view-section", pageVisible("graph") && "visible")}
          language={interfaceLanguage}
          vaultPath={vaultPath}
          status={status}
          registry={registry}
          claims={claims}
          evidencePaths={evidencePaths}
          reviewItems={reviewItems}
          writebacks={writebacks}
          traceabilityWarnings={traceabilityWarnings}
          onOpenPath={openWorkspacePath}
          onOpenVaultItem={openVaultItem}
          onOpenVaultItemInObsidian={openVaultItemInObsidian}
          onRevealPath={revealPath}
          onCopyText={copyText}
          onOpenObsidian={handleOpenObsidian}
          onOpenSources={() => setActivePage("sources")}
          onPlanIngest={handlePlanIngest}
          onRunPipeline={handleIngestPipeline}
          onCreateResearchTopic={handleGraphResearchTopic}
          resolveVaultPath={vaultFilePath}
        />

        <div className={classNames("main-grid view-section", pageVisible("dashboard") && "visible")}>
          {renderDashboardActionPanel()}
          {renderClaimLedgerPanel()}
        </div>

        {pageVisible("claims") && (
          <>
            <WorkflowGuide
              title={interfaceLanguage === "zh" ? "怎么处理论断" : "How to use claims"}
              body={interfaceLanguage === "zh"
                ? "这页只处理论断台账。先筛选需要审核的论断，打开详情核对证据，再标记支持、待审、失效、冲突或忽略。"
                : "This page only handles the claim ledger. Filter claims needing review, inspect their evidence, then mark supported, review, stale, conflict, or ignored."}
              steps={interfaceLanguage === "zh" ? [
                { title: "筛选论断", body: "默认看需审核论断，可切换到冲突、失效或全部。" },
                { title: "查看详情", body: "详情侧栏会显示证据路径和关联资料。" },
                { title: "标记结论", body: "只更新论断状态，不自动批准科学审核。" },
                { title: "进入审核", body: "需要人工审批时跳到审核队列处理。" },
              ] : [
                { title: "Filter claims", body: "Start with claims needing review, then inspect conflicts or stale items." },
                { title: "Inspect details", body: "The inspector shows evidence paths and source context." },
                { title: "Set verdict", body: "Update the claim state without auto-approving review." },
                { title: "Move to review", body: "Use the review queue for human approval." },
              ]}
            />
            <div className="main-grid claims-workspace-grid view-section visible">
              {renderClaimLedgerPanel("panel large claim-ledger-primary")}
              <section className="panel large claim-context-panel">
                <div className="section-head">
                  <h2>{interfaceLanguage === "zh" ? "论断处理" : "Claim workflow"}</h2>
                  <ClipboardList size={18} />
                </div>
                <div className="workflow-metrics compact">
                  <span><strong>{claimWorkflowStats.visible}</strong>{interfaceLanguage === "zh" ? "当前列表" : "visible"}</span>
                  <span><strong>{claimWorkflowStats.needsReview}</strong>{interfaceLanguage === "zh" ? "需审核" : "review"}</span>
                  <span><strong>{claimWorkflowStats.conflicted}</strong>{interfaceLanguage === "zh" ? "冲突" : "conflict"}</span>
                  <span><strong>{claimWorkflowStats.supported}</strong>{interfaceLanguage === "zh" ? "已支撑" : "supported"}</span>
                </div>
                <p className="workflow-hint">
                  {interfaceLanguage === "zh"
                    ? "如需处理全局 P0/P1 合约或证据断点，使用下方按钮跳到对应页面。"
                    : "Use the buttons below when global P0/P1 contract findings or evidence-chain issues need attention."}
                </p>
                <div className="inline-actions">
                  <button onClick={() => setClaimFilter("needs_review")}><AlertTriangle size={14} />{interfaceLanguage === "zh" ? "只看需审核" : "Needs review"}</button>
                  <button onClick={() => setClaimFilter("contradicted")}><XCircle size={14} />{interfaceLanguage === "zh" ? "只看冲突" : "Conflicts"}</button>
                  <button onClick={() => setActivePage("reviews")}><ShieldCheck size={14} />{interfaceLanguage === "zh" ? "打开审核" : "Open reviews"}</button>
                  <button onClick={() => setActivePage("traceability")}><GitCompare size={14} />{interfaceLanguage === "zh" ? "检查证据链" : "Traceability"}</button>
                </div>
              </section>
            </div>
          </>
        )}

        <div className={classNames("main-grid concept-workspace-grid view-section", pageVisible("concepts") && "visible")}>
          <section className="panel large concept-library-panel">
            <div className="section-head">
              <h2>{interfaceLanguage === "zh" ? "概念阅读库" : "Concept library"}</h2>
              <span>{grouped.concept.length} {interfaceLanguage === "zh" ? "页" : "pages"}</span>
            </div>
            <div className="workflow-metrics compact concept-metrics">
              <span><strong>{conceptWorkflowStats.concepts}</strong>{interfaceLanguage === "zh" ? "概念页" : "concept pages"}</span>
              <span><strong>{conceptWorkflowStats.reviewFlags}</strong>{interfaceLanguage === "zh" ? "待核对标记" : "review flags"}</span>
              <span><strong>{conceptWorkflowStats.orphanConcepts}</strong>{interfaceLanguage === "zh" ? "孤立概念" : "orphan concepts"}</span>
              <span><strong>{conceptWorkflowStats.lowSynthesis}</strong>{interfaceLanguage === "zh" ? "低综合页" : "low synthesis"}</span>
            </div>
            <p className="workflow-hint">
              {interfaceLanguage === "zh"
                ? "先从概念页开始阅读，再用详情侧栏追踪来源、审核状态和证据路径。"
                : "Start with concept pages, then use the inspector to trace sources, review state, and evidence paths."}
            </p>
            <div className="concept-list">
              {grouped.concept.length === 0 && <p className="empty">{interfaceLanguage === "zh" ? "暂无概念页。先运行概念预览或应用概念修订。" : "No concept pages yet. Run concept preview or apply concept revisions first."}</p>}
              {grouped.concept.map((file) => {
                const reviewLabel = (file.needsReview ?? 0) > 0
                  ? `${file.needsReview} ${interfaceLanguage === "zh" ? "项待核对" : "review items"}`
                  : (interfaceLanguage === "zh" ? "暂无待核对标记" : "no review flags");
                return (
                  <button key={file.path} onClick={() => selectFileForDetails(file)}>
                    <span className={classNames("status-chip", file.status || "published")}>{file.status || (interfaceLanguage === "zh" ? "已生成" : "generated")}</span>
                    <strong>{file.title || file.name}</strong>
                    <em>{reviewLabel} · QA {file.qaVerdict || (interfaceLanguage === "zh" ? "未知" : "unknown")} · {file.updated || (interfaceLanguage === "zh" ? "未更新" : "not updated")}</em>
                    <code>{file.path}</code>
                  </button>
                );
              })}
            </div>
            <div className="inline-actions">
              <button onClick={() => setActivePage("writeback")}><GitCompare size={14} />{interfaceLanguage === "zh" ? "提炼研究洞察" : "Research insights"}</button>
              <button onClick={() => setActivePage("reviews")}><AlertTriangle size={14} />{interfaceLanguage === "zh" ? "查看审核队列" : "Review queue"}</button>
              <button onClick={() => setActivePage("traceability")}><ShieldCheck size={14} />{interfaceLanguage === "zh" ? "检查证据链" : "Traceability"}</button>
            </div>
          </section>

          <section className="panel large concept-support-panel">
            <div className="section-head">
              <h2>{interfaceLanguage === "zh" ? "支撑资料" : "Supporting evidence"}</h2>
              <span>{registry.length} {interfaceLanguage === "zh" ? "登记行" : "registry rows"}</span>
            </div>
            <div className="browser concept-browser">
              <FileColumn title={interfaceLanguage === "zh" ? "知识库笔记" : "Wiki Notes"} files={grouped.note} language={interfaceLanguage} onSelect={selectFileForDetails} />
              <FileColumn title={interfaceLanguage === "zh" ? "资料" : "Sources"} files={[...grouped.source, ...grouped.draft]} language={interfaceLanguage} onSelect={selectFileForDetails} />
              <FileColumn title={interfaceLanguage === "zh" ? "报告" : "Reports"} files={grouped.report} language={interfaceLanguage} onSelect={selectFileForDetails} />
              <FileColumn title={interfaceLanguage === "zh" ? "收件箱" : "Inbox"} files={grouped.inbox} language={interfaceLanguage} onSelect={selectFileForDetails} />
            </div>
            <div className="section-head compact">
              <h3>{interfaceLanguage === "zh" ? "资料登记" : "Source registry"}</h3>
              <span>{registry.length}</span>
            </div>
            <div className="registry-list compact">
              {registry.length === 0 && <p className="empty">{interfaceLanguage === "zh" ? "暂无资料登记投影。" : "No registry projection yet."}</p>}
              {registry.map((entry) => (
                <button key={`${entry.sourceUuid}-${entry.sourcePath}`} onClick={() => void openWorkspacePath(entry.sourcePath)}>
                  <span className={classNames("status-chip", entry.status)}>{entry.status}</span>
                  <strong>{entry.sourceId || entry.sourceUuid}</strong>
                  <em>{entry.sourcePath}{entry.duplicateOf ? ` · ${interfaceLanguage === "zh" ? "重复于" : "duplicate of"} ${entry.duplicateOf}` : ""}</em>
                  <code>{entry.sourcePage || (interfaceLanguage === "zh" ? "资料页面待生成" : "source page pending")} · {entry.artifactSha256 || (interfaceLanguage === "zh" ? "无解析产物哈希" : "no artifact hash")} · {entry.parser || (interfaceLanguage === "zh" ? "解析器待定" : "parser pending")}</code>
                </button>
              ))}
            </div>
            {sourceAliases.length > 0 && (
              <>
                <div className="section-head compact">
                  <h3>{interfaceLanguage === "zh" ? "ID 别名 / 迁移" : "ID aliases / migrations"}</h3>
                  <span>{sourceAliases.length}</span>
                </div>
                <div className="registry-list compact">
                  {sourceAliases.map((alias) => (
                    <button key={alias.aliasId} onClick={() => void openWorkspacePath(alias.newSourcePath)}>
                      <span className={classNames("status-chip", alias.needsReview ? "blocked" : "published")}>{alias.status}</span>
                      <strong>{alias.sourceId || alias.newSourceUuid}</strong>
                      <em>{alias.matchReason} · {alias.oldSourcePath || (interfaceLanguage === "zh" ? "旧路径未知" : "unknown old path")} → {alias.newSourcePath}</em>
                      <code>{alias.signals.join(" · ")}</code>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>

        <div className={classNames("main-grid view-section", pageVisible("dashboard") && "visible")}>
          <section className="panel large">
            <div className="section-head">
              <h2>{interfaceLanguage === "zh" ? "处理流程状态" : "Pipeline status"}</h2>
              <span>{busy ? `${interfaceLanguage === "zh" ? "运行中" : "running"}: ${busy}` : interfaceLanguage === "zh" ? "空闲" : "idle"}</span>
            </div>
            <ol className="pipeline">
              {pipeline.map((stage, index) => (
                <li key={stage}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{stage}</strong>
                  <em>{pipelineState(index, status, ingestPlan)}</em>
                </li>
              ))}
            </ol>
          </section>

          <section className="panel large">
            <div className="section-head">
              <h2>{interfaceLanguage === "zh" ? "导入计划" : "Ingest plan"}</h2>
              <ShieldCheck size={18} />
            </div>
            <div className="ingest-list">
              {!ingestPlan?.entries.length && <p className="empty">暂无可规划输入。</p>}
              {ingestPlan?.entries.map((entry) => (
                <button key={`${entry.sourcePath}-${entry.sha256}`} onClick={() => void openWorkspacePath(entry.status === "blocked" ? entry.sourcePath : entry.artifactPath || entry.sourcePath)}>
                  <span className={classNames("status-chip", entry.currentState || entry.status)}>{entry.currentState || entry.status}</span>
                  <strong>{entry.fileName}</strong>
                  <em>{entry.nextActionLabel || entry.reason}</em>
                  <code>{entry.command.length ? entry.command.join(" ") : entry.reason}</code>
                  <code>
                    {interfaceLanguage === "zh" ? "输入" : "inputs"} {entry.inputs.join(", ") || entry.sourcePath}
                    {" · "}
                    {interfaceLanguage === "zh" ? "输出" : "outputs"} {entry.outputs.join(", ") || entry.artifactPath || "-"}
                  </code>
                  <code>
                    {interfaceLanguage === "zh" ? "人工确认" : "human approval"}: {localizedBoolean(entry.requiresHumanApproval, interfaceLanguage)}
                    {" · "}
                    {interfaceLanguage === "zh" ? "网络/API" : "network/API"}: {localizedBoolean(entry.usesNetwork, interfaceLanguage)}
                    {entry.lastLogPath ? ` · ${entry.lastLogPath}` : ""}
                  </code>
                </button>
              ))}
            </div>
            {ingestPlan && <p className="note">{interfaceLanguage === "zh" ? "计划文件" : "Plan file"}: {ingestPlan.planPath}</p>}
          </section>
        </div>

        <div className={classNames("main-grid view-section", pageVisible("activity") && "visible")}>
          <section className="panel">
            <div className="section-head">
              <h2>任务日志</h2>
              <TerminalSquare size={18} />
            </div>
            <div className="log-list">
              {logs.length === 0 && <p className="empty">暂无命令日志。</p>}
              {logs.map((log) => (
                <button key={log.id} className="log-item" onClick={() => openPath(log.logPath)}>
                  <span>{log.kind}</span>
                  <strong className={log.exitCode === 0 ? "pass" : "fail"}>{interfaceLanguage === "zh" ? "退出码" : "exit"} {log.exitCode}</strong>
                  <em>{log.logPath}</em>
                </button>
              ))}
              {diagnosticPath && (
                <button className="log-item" onClick={() => openPath(diagnosticPath)}>
                  <span>{interfaceLanguage === "zh" ? "诊断包" : "diagnostic bundle"}</span>
                  <strong className="pass">{interfaceLanguage === "zh" ? "就绪" : "ready"}</strong>
                  <em>{diagnosticPath}</em>
                </button>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="section-head">
              <h2>{interfaceLanguage === "zh" ? "解析产物合约" : "Artifact contract"}</h2>
              <span>{artifacts.length} {interfaceLanguage === "zh" ? "个解析产物" : "artifacts"}</span>
            </div>
            <div className="contract-list">
              {artifacts.length === 0 && <p className="empty">{interfaceLanguage === "zh" ? "暂无解析产物合约。" : "No artifact contracts yet."}</p>}
              {artifacts.map((artifact) => (
                <button key={artifact.artifactPath} onClick={() => void openWorkspacePath(artifact.manifestPath || artifact.artifactPath)}>
                  <span className={classNames("status-chip", artifact.status)}>{artifact.status}</span>
                  <strong>{artifact.artifactPath}</strong>
                  <em>
                    {artifact.parser || (interfaceLanguage === "zh" ? "旧解析器" : "legacy parser")} · {interfaceLanguage === "zh" ? "结构" : "schema"} {artifact.schemaVersion || (interfaceLanguage === "zh" ? "缺失" : "missing")} · {interfaceLanguage === "zh" ? "有效" : "valid"} {artifact.contractValid ? (interfaceLanguage === "zh" ? "是" : "yes") : (interfaceLanguage === "zh" ? "否" : "no")} · {interfaceLanguage === "zh" ? "分块" : "chunks"} {artifact.chunkCount}
                  </em>
                  <code>
                    {interfaceLanguage === "zh" ? "页面" : "pages"} {artifact.anchorsPages ? (interfaceLanguage === "zh" ? "是" : "yes") : (interfaceLanguage === "zh" ? "否" : "no")} · {interfaceLanguage === "zh" ? "表格" : "tables"} {artifact.anchorsTables ? (interfaceLanguage === "zh" ? "是" : "yes") : (interfaceLanguage === "zh" ? "否" : "no")} · {interfaceLanguage === "zh" ? "图" : "figures"} {artifact.anchorsFigures ? (interfaceLanguage === "zh" ? "是" : "yes") : (interfaceLanguage === "zh" ? "否" : "no")} · {artifact.parseLogPath || artifact.limitations[0] || (interfaceLanguage === "zh" ? "合约完整" : "contract complete")}
                  </code>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className={classNames("main-grid view-section", pageVisible("traceability") && "visible")}>
          <section className="panel">
            <div className="section-head">
              <h2>{interfaceLanguage === "zh" ? "合约检查" : "Contract lint"}</h2>
              <span>{lintFindings.length} findings</span>
            </div>
            <div className="impact-list">
              {lintFindings.length === 0 && <p className="empty">暂无 contract finding。</p>}
              {lintFindings.map((finding) => (
                <button key={finding.findingId} onClick={() => finding.path && void openWorkspacePath(finding.path)}>
                  <span className={classNames("status-chip", finding.severity)}>{finding.severity}</span>
                  <strong>{finding.title}</strong>
                  <em>{finding.objectType} · {finding.kind}</em>
                  <code>{finding.detail}</code>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-head">
              <h2>Canonical state</h2>
              <span>runtime-owned</span>
            </div>
            <div className="impact-list">
              {[
                "_state/source-registry.jsonl",
                "_state/artifacts.jsonl",
                "_state/ingest-jobs.jsonl",
                "_state/actions.jsonl",
                "_state/impact-graph.jsonl",
                "_state/lint-findings.jsonl",
                "_state/review-decisions.jsonl",
                "_state/writeback-log.jsonl",
                "_state/import-report.jsonl",
              ].map((path) => (
                <button key={path} onClick={() => void openWorkspacePath(path)}>
                  <span className="status-chip published">state</span>
                  <strong>{path}</strong>
                  <em>canonical desktop/runtime contract</em>
                  <code>{vaultFilePath(path)}</code>
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className={classNames("panel view-section", pageVisible("traceability") && "visible")}>
          <div className="section-head">
            <h2>{interfaceLanguage === "zh" ? "影响图谱" : "Impact graph"}</h2>
            <span>{impactEdges.length} {interfaceLanguage === "zh" ? "条边" : "edges"}</span>
          </div>
          <div className="impact-list compact">
            {impactEdges.length === 0 && <p className="empty">{interfaceLanguage === "zh" ? "暂无影响边。" : "No impact edges."}</p>}
            {impactEdges.map((edge) => (
              <div className="impact-row" key={edge.edgeId}>
                <span className={classNames("status-chip", edge.status)}>{edge.status}</span>
                <strong>{edge.fromType}{" -> "}{edge.toType}</strong>
                <em>{edge.relationship}</em>
                <code>{edge.fromId}{" -> "}{edge.toId}</code>
              </div>
            ))}
          </div>
        </section>

        {selectedFile && pageVisible("dashboard", "sources", "concepts", "activity") && (
          <section className="detail-bar">
            <div>
              <strong>{selectedFile.title || selectedFile.name}</strong>
              <span>{selectedFile.kind} · {selectedFile.status || "no status"} · {selectedFile.updated || "no updated date"} · QA {selectedFile.qaVerdict || "unknown"}</span>
              <code>{selectedFile.path}</code>
            </div>
            <button onClick={() => void openWorkspacePath(selectedFile.path)}><FolderOpen size={16} />{interfaceLanguage === "zh" ? "打开" : "open"}</button>
          </section>
        )}
          </>
        )}
      </section>

      {shellInspectorVisible && (
        <aside
          className={classNames("preview-sidebar", researchPanelOpen && "research-open", detailDrawerOpen && researchPanelOpen && "split-panels")}
          aria-label={interfaceLanguage === "zh" ? "预览、检查器和深度研究" : "Preview, inspector, and Deep Research"}
        >
          <button
            type="button"
            className="shell-resize-handle preview-resize-handle"
            aria-label={interfaceLanguage === "zh" ? "调整预览栏宽度" : "Resize preview sidebar"}
            aria-orientation="vertical"
            title={interfaceLanguage === "zh" ? "拖动调整预览栏宽度" : "Drag to resize preview sidebar"}
            onMouseDown={startShellResize("preview")}
          />
          <div className="preview-sidebar-header">
            <div>
              <strong>{previewSidebarTitle}</strong>
              <span>{detailDrawerOpen
                ? (interfaceLanguage === "zh" ? "Vault 页面阅读 / 证据上下文" : "Vault page reading / evidence context")
                : (interfaceLanguage === "zh" ? "Wiki 证据优先 / 提案写回" : "Vault evidence / proposal writeback")}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (detailDrawerOpen) setDetailDrawerOpen(false);
                else setResearchPanelOpen(false);
              }}
              title={detailDrawerOpen
                ? (interfaceLanguage === "zh" ? "关闭预览栏" : "Close preview")
                : (interfaceLanguage === "zh" ? "关闭深度研究" : "Close Deep Research")}
            >
              <XCircle size={15} />
            </button>
          </div>
          {detailDrawerOpen && readingHistory.length > 0 && (
            <ReadingHistoryBar
              activeIndex={readingHistoryIndex}
              activePath={activeReadingPath}
              history={readingHistory}
              language={interfaceLanguage}
              onBack={() => stepReadingHistory(-1)}
              onForward={() => stepReadingHistory(1)}
              onSelect={openReadingHistoryItem}
            />
          )}
          {detailDrawerOpen && (
            <DetailsPanel
              language={interfaceLanguage}
              selection={detailSelection}
              vaultPath={vaultPath}
              obsidianUri={entryNote?.obsidianUri}
              resolveVaultPath={vaultFilePath}
              onOpenPath={openWorkspacePath}
              onRevealPath={revealResolvedPath}
              onOpenVaultPath={openVaultItem}
              onCopy={copyText}
              onOpenObsidian={handleOpenObsidian}
            />
          )}
          {researchPanelOpen && (
            <ShellResearchPanel
              language={interfaceLanguage}
              topic={researchTopic}
              targetPath={queryTarget}
              readiness={researchReadiness}
              sourceCount={status?.counts.sources ?? 0}
              conceptCount={status?.counts.concepts ?? 0}
              reviewCount={openReviewCount + (status?.counts.claimsNeedingReview ?? 0)}
              proposalCount={writebacks.length}
              proposalBusy={busy === "query_writeback"}
              proposals={writebacks}
              onTopicChange={setResearchTopic}
              onSubmit={handleShellResearchTopic}
              onCreateProposal={handleCreateResearchProposal}
              onSelectProposal={(proposal) => {
                setDetailDrawerOpen(true);
                setDetailSelection({ kind: "proposal", proposal });
              }}
              onOpenWriteback={() => setActivePage("writeback")}
              onOpenSettings={() => setActivePage("settings")}
              onClose={() => setResearchPanelOpen(false)}
            />
          )}
        </aside>
      )}
      <CommandPalette
        open={commandPaletteOpen}
        language={interfaceLanguage}
        query={commandQuery}
        items={commandPaletteResults}
        activeIndex={commandActiveIndex}
        onQueryChange={(value) => {
          setCommandQuery(value);
          setCommandActiveIndex(0);
        }}
        onActiveIndexChange={setCommandActiveIndex}
        onSelect={runCommandPaletteItem}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </main>
  );
}

function CommandPalette({
  open,
  language,
  query,
  items,
  activeIndex,
  onQueryChange,
  onActiveIndexChange,
  onSelect,
  onClose,
}: {
  open: boolean;
  language: UiLanguage;
  query: string;
  items: CommandPaletteItem[];
  activeIndex: number;
  onQueryChange: (value: string) => void;
  onActiveIndexChange: (value: number) => void;
  onSelect: (item: CommandPaletteItem) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const activeItem = items[activeIndex];

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  const isZh = language === "zh";
  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={isZh ? "快速切换" : "Quick switcher"}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            onActiveIndexChange(Math.min(activeIndex + 1, Math.max(items.length - 1, 0)));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            onActiveIndexChange(Math.max(activeIndex - 1, 0));
            return;
          }
          if (event.key === "Enter" && activeItem) {
            event.preventDefault();
            onSelect(activeItem);
          }
        }}
      >
        <div className="command-palette-search">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={isZh ? "搜索页面、视图或动作..." : "Search pages, views, or actions..."}
          />
          <kbd>{isZh ? "Esc 关闭" : "Esc closes"}</kbd>
        </div>
        <div className="command-palette-results" role="listbox" aria-label={isZh ? "快速切换结果" : "Quick switch results"}>
          {items.length === 0 && (
            <p className="command-palette-empty">{isZh ? "没有匹配结果。" : "No matching results."}</p>
          )}
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={classNames("command-palette-item", index === activeIndex && "active", item.disabled && "disabled")}
              disabled={item.disabled}
              onMouseEnter={() => onActiveIndexChange(index)}
              onClick={() => onSelect(item)}
            >
              <span className="command-palette-item-main">
                <strong>{item.label}</strong>
                <em>{item.detail}</em>
              </span>
              <span className="command-palette-section">{item.section}</span>
            </button>
          ))}
        </div>
        <footer className="command-palette-footer">
          <span>{isZh ? "↑↓ 选择" : "↑↓ select"}</span>
          <span>{isZh ? "Enter 执行" : "Enter run"}</span>
          <span>{isZh ? "⌘K / Ctrl K 再次打开" : "⌘K / Ctrl K opens again"}</span>
        </footer>
      </section>
    </div>
  );
}

function ReadingHistoryBar({
  history,
  activeIndex,
  activePath,
  language,
  onBack,
  onForward,
  onSelect,
}: {
  history: VaultFile[];
  activeIndex: number;
  activePath?: string;
  language: UiLanguage;
  onBack: () => void;
  onForward: () => void;
  onSelect: (index: number) => void;
}) {
  const canGoBack = activeIndex > 0;
  const canGoForward = activeIndex >= 0 && activeIndex < history.length - 1;
  const title = language === "zh" ? "最近页面" : "Recent pages";
  const back = language === "zh" ? "上一个页面" : "Previous page";
  const forward = language === "zh" ? "下一个页面" : "Next page";
  return (
    <div className="reading-history-bar" aria-label={title}>
      <div className="reading-history-controls">
        <button type="button" onClick={onBack} disabled={!canGoBack} title={back} aria-label={back}>
          <ChevronLeft size={14} />
        </button>
        <button type="button" onClick={onForward} disabled={!canGoForward} title={forward} aria-label={forward}>
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="reading-history-tabs" role="tablist" aria-label={title}>
        {history.map((file, index) => (
          <button
            key={`${file.path}-${index}`}
            type="button"
            role="tab"
            aria-selected={activeIndex === index}
            className={classNames("reading-history-tab", activePath === file.path && "active")}
            onClick={() => onSelect(index)}
            title={file.path}
          >
            <span>{file.title || file.name}</span>
            <em>{file.kind}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function ShellTreeSection({
  title,
  meta,
  icon,
  files,
  empty,
  language,
  selectedPath,
  onSelect,
}: {
  title: string;
  meta: string;
  icon: ReactNode;
  files: VaultFile[];
  empty: string;
  language: UiLanguage;
  selectedPath?: string;
  onSelect: (file: VaultFile) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const selectedInside = files.some((file) => file.path === selectedPath);

  useEffect(() => {
    if (selectedInside) setExpanded(true);
  }, [selectedInside]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedPath]);

  return (
    <section className="shell-tree-section">
      <button
        type="button"
        className="shell-tree-title shell-tree-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        <span>{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{icon}{title}</span>
        <em>{meta}</em>
      </button>
      {expanded && (
        <>
          {files.length === 0 && <p className="empty">{empty}</p>}
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              className={classNames("shell-tree-item", selectedPath === file.path && "selected")}
              onClick={() => onSelect(file)}
              title={file.path}
              ref={selectedPath === file.path ? selectedRef : undefined}
            >
              <strong>{file.title || file.name}</strong>
              <span>{fileStatusLabel(file, language)}</span>
            </button>
          ))}
        </>
      )}
    </section>
  );
}

function ShellFileTree({
  nodes,
  empty,
  language,
  selectedPath,
  onSelect,
}: {
  nodes: VaultFileTreeNode[];
  empty: string;
  language: UiLanguage;
  selectedPath?: string;
  onSelect: (file: VaultFile) => void;
}) {
  if (nodes.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div className="shell-file-tree" role="tree">
      {nodes.map((node) => (
        <ShellFileTreeNodeView
          key={node.id}
          node={node}
          language={language}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function nodeContainsSelected(node: VaultFileTreeNode, selectedPath?: string): boolean {
  if (!selectedPath) return false;
  if (node.path === selectedPath) return true;
  return node.children.some((child) => nodeContainsSelected(child, selectedPath));
}

function ShellFileTreeNodeView({
  node,
  language,
  selectedPath,
  onSelect,
}: {
  node: VaultFileTreeNode;
  language: UiLanguage;
  selectedPath?: string;
  onSelect: (file: VaultFile) => void;
}) {
  const selectedInside = nodeContainsSelected(node, selectedPath);
  const [expanded, setExpanded] = useState(true);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const depthStyle = { "--tree-depth": node.depth } as CSSProperties;

  useEffect(() => {
    if (selectedInside) setExpanded(true);
  }, [selectedInside]);

  useEffect(() => {
    if (selectedPath === node.path) {
      selectedRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [node.path, selectedPath]);

  if (node.kind === "file") {
    if (!node.file) return null;
    const file = node.file;
    return (
      <button
        type="button"
        role="treeitem"
        aria-selected={selectedPath === node.path}
        className={classNames("shell-tree-item", "file-tree-item", selectedPath === node.path && "selected")}
        onClick={() => onSelect(file)}
        title={node.path}
        style={depthStyle}
        ref={selectedPath === node.path ? selectedRef : undefined}
      >
        <strong>{file.title || node.name}</strong>
        <span>{fileStatusLabel(file, language)} · {node.path}</span>
      </button>
    );
  }

  return (
    <section className={classNames("shell-tree-section", "shell-folder-section", selectedInside && "contains-selected")}>
      <button
        type="button"
        role="treeitem"
        className="shell-tree-title shell-tree-toggle shell-folder-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        style={depthStyle}
      >
        <span>{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<FolderOpen size={14} />{node.name}</span>
        <em>{node.fileCount}</em>
      </button>
      {expanded && (
        <div className="shell-folder-children" role="group">
          {node.children.map((child) => (
            <ShellFileTreeNodeView
              key={child.id}
              node={child}
              language={language}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FileColumn({ title, files, language, onSelect }: { title: string; files: VaultFile[]; language?: UiLanguage; onSelect: (file: VaultFile) => void }) {
  const resolvedLanguage = language || "en";
  return (
    <div className="file-column">
      <h3>{title}</h3>
      {files.length === 0 && <p className="empty">{resolvedLanguage === "zh" ? "无" : "None"}</p>}
      {files.map((file) => {
        const label = file.title || file.name;
        const statusLabel = fileStatusLabel(file, resolvedLanguage);
        return (
          <button key={file.path} title={`${label}\n${statusLabel}\n${file.path}`} onClick={() => onSelect(file)}>
            <strong>{label}</strong>
            <span>{statusLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

export default App;
