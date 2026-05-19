import { useEffect, useMemo, useState, type DragEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
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

function compareDashboardActions(a: DashboardAction, b: DashboardAction) {
  const severityDelta = (actionSeverityRank[a.severity.toLowerCase()] ?? 9) - (actionSeverityRank[b.severity.toLowerCase()] ?? 9);
  if (severityDelta !== 0) return severityDelta;
  return a.title.localeCompare(b.title);
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
  { id: "dashboard", label: "Dashboard", icon: SquareStack },
  { id: "sources", label: "Sources", icon: FileInput },
  { id: "claims", label: "Claims", icon: ClipboardList },
  { id: "concepts", label: "Concepts", icon: Database },
  { id: "reviews", label: "Reviews", icon: AlertTriangle },
  { id: "traceability", label: "Traceability", icon: ShieldCheck },
  { id: "writeback", label: "Query / Writeback", icon: GitCompare },
  { id: "chat", label: "Evidence Draft", icon: MessageSquare },
  { id: "graph", label: "Evidence Graph", icon: Network },
  { id: "activity", label: "Activity", icon: TerminalSquare },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

type ShellPage = (typeof navigationItems)[number]["id"];
type NavBadge = {
  value: string | number;
  tone?: "neutral" | "warning" | "danger" | "live";
  title: string;
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
    title: "Evidence Search / Answer Draft",
    subtitle: "Search the vault, inspect evidence, draft local answers, and promote grounded questions into proposals.",
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
      dashboard: "仪表盘",
      sources: "原始资料",
      claims: "论断",
      concepts: "概念",
      reviews: "审核",
      traceability: "可追踪性",
      writeback: "问答 / 写回",
      chat: "证据草稿",
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
      chat: { title: "证据搜索 / 本地草稿", subtitle: "搜索知识库、检查证据、生成本地证据草稿，并把可信问题转成提案。" },
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
    importDropTitle: "导入 PDF / Markdown / TXT / 文件夹",
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
      rawInbox: "原始收件箱",
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
      importFiles: "导入 PDF / Markdown / txt 到 raw/inbox",
      importFolder: "导入文件夹到 raw/inbox",
    },
    errors: {
      createVaultPath: "请先填写要创建的知识库绝对路径。",
      createProject: "请填写 Project Name 并选择 Parent Directory。",
      dropNoPath: "拖拽事件没有提供本地文件路径，请使用导入文件或导入文件夹按钮。",
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
    importDropTitle: "Import PDF / Markdown / txt / folder",
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
      rawInbox: "Raw inbox",
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
      importFiles: "Import PDF / Markdown / txt to raw/inbox",
      importFolder: "Import folders to raw/inbox",
    },
    errors: {
      createVaultPath: "Enter an absolute path for the vault first.",
      createProject: "Enter a Project Name and choose a Parent Directory.",
      dropNoPath: "The drag event did not provide local file paths. Use Import files or Import folder.",
    },
  },
};

const terminalRuntimeStatuses: RuntimeJobStatus[] = ["completed", "succeeded", "failed", "timeout", "timed_out", "cancelled"];
const retryableRuntimeStatuses: RuntimeJobStatus[] = ["failed", "timeout", "timed_out", "cancelled"];

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
  defaultPdfParser: "auto",
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
  llmProviderCenter: {
    activeProviderId: null,
    providers: {},
  },
};

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function visiblePath(path: string) {
  return path.replace(/ +(?=\/|$)/g, (match) => "[space]".repeat(match.length));
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
  const ready = plan?.summary.ready ?? 0;
  const stageable = plan?.summary.stageable ?? 0;
  const blocked = plan?.summary.blocked ?? 0;
  const cached = plan?.summary.cached ?? 0;
  const published = plan?.summary.published ?? 0;
  const parseable = plan?.entries.filter((entry) => entry.action === "parse_required" && entry.fileName.toLowerCase().endsWith(".pdf")).length ?? 0;
  const runnable = ready + stageable + cached + parseable;
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
  const [activePage, setActivePage] = useState<ShellPage>("dashboard");
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [actionFocusIndex, setActionFocusIndex] = useState(0);
  const [actionListExpanded, setActionListExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copy = shellCopy[interfaceLanguage];

  const grouped = useMemo(() => {
    const groups: Record<string, VaultFile[]> = { source: [], draft: [], concept: [], report: [], inbox: [] };
    for (const file of status?.files ?? []) groups[file.kind]?.push(file);
    return groups;
  }, [status]);

  const rt = useMemo(() => runtimeSettings(desktopSettings), [desktopSettings]);
  const enqueueAfterImport = desktopSettings.defaultIngestMode === "enqueue_after_import";
  const tone = statusTone(status);
  const planned = ingestPlan?.summary;
  const runnableIngest = (planned?.ready ?? 0) + (planned?.stageable ?? 0) + (planned?.cached ?? 0);
  const parseablePdfs = ingestPlan?.entries.filter((entry) => entry.action === "parse_required" && entry.fileName.toLowerCase().endsWith(".pdf")).length ?? 0;
  const actions = ingestPlan?.actions ?? [];
  const jobs = ingestPlan?.jobs ?? [];
  const artifacts = ingestPlan?.artifacts ?? [];
  const registry = ingestPlan?.registry ?? [];
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

  useEffect(() => {
    if (detailSelection.kind !== "empty") {
      setDetailDrawerOpen(true);
    }
  }, [detailSelection]);

  useEffect(() => {
    if (activePage === "settings") {
      setDetailDrawerOpen(false);
    }
  }, [activePage]);

  useEffect(() => {
    setActionFocusIndex(0);
    setActionListExpanded(false);
  }, [actionFilter, vaultPath]);

  useEffect(() => {
    setActionFocusIndex((current) => Math.min(current, Math.max(prioritizedActions.length - 1, 0)));
  }, [prioritizedActions.length]);

  const vaultFilePath = (path?: string | null) => {
    if (!path) return vaultPath;
    if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) return path;
    return `${vaultPath}/${path}`;
  };
  const openVaultItem = async (path?: string | null) => {
    if (!vaultPath || !path) return;
    try {
      await openVaultPath(vaultPath, path);
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
  const selectFileForDetails = (file: VaultFile) => {
    setSelectedFile(file);
    setDetailSelection({ kind: "source", file });
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
  const revealEntryOrVault = async () => {
    const target = entryNote?.fallbackPath || entryNote?.entryPath || vaultPath;
    if (!target) return;
    try {
      await revealPath(target);
    } catch (err) {
      setRestoreError(`Reveal failed. Open or copy this path manually:\n${target}\n${String(err)}`);
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
    const picked = await open({ directory: true, multiple: false, title: copy.dialogs.chooseVault });
    if (typeof picked !== "string") return;
    await selectVault(picked);
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
      setImportResults([...result.imported, ...result.skippedDuplicates]);
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
      filters: [{ name: "Documents", extensions: ["pdf", "md", "markdown", "txt"] }],
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
      setDetailSelection({ kind: "proposal", proposal });
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
      const draft = await createQueryWritebackProposal(
        vaultPath,
        queryText,
        queryTarget.trim() || "reviews/query-writeback/deepseek-research-insights.md",
        interfaceLanguage === "zh" ? "DeepSeek 研究洞察提案" : "DeepSeek research insight query",
      );
      setQueryDraft(draft);
      setWritebacks((current) => [draft.proposal, ...current.filter((item) => item.proposalId !== draft.proposal.proposalId)]);
      setDetailSelection({ kind: "proposal", proposal: draft.proposal });
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
      setDetailSelection({ kind: "proposal", proposal });
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
      setDetailSelection({ kind: "proposal", proposal: result.proposal });
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
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

  const vaultDisplayName = vaultPath ? visiblePath(vaultPath).split("/").filter(Boolean).pop() || visiblePath(vaultPath) : "No vault";
  const contractP0P1 = lintFindings.filter((finding) => finding.severity === "p0" || finding.severity === "p1").length;
  const openReviewCount = reviewItems.filter((item) => !["approved", "resolved", "ignored", "rejected"].includes(item.status)).length;
  const navBadgeForPage = (page: ShellPage): NavBadge | null => {
    if (!vaultPath && page !== "settings") return null;
    const sourceWork = (status?.counts.inbox ?? 0) + (planned?.blocked ?? 0);
    if (page === "sources" && sourceWork > 0) {
      return { value: sourceWork, tone: "warning", title: `${sourceWork} source item${sourceWork === 1 ? "" : "s"} need import or unblock` };
    }
    const claimWork = status?.counts.claimsNeedingReview ?? 0;
    if (page === "claims" && claimWork > 0) {
      return { value: claimWork, tone: "warning", title: `${claimWork} claim${claimWork === 1 ? "" : "s"} need review` };
    }
    if (page === "reviews" && openReviewCount > 0) {
      return { value: openReviewCount > 99 ? "!" : openReviewCount, tone: "warning", title: `${openReviewCount} review item${openReviewCount === 1 ? "" : "s"} are open` };
    }
    const traceabilityWork = traceabilityWarnings.length + brokenEvidence + contractP0P1;
    if (page === "traceability" && traceabilityWork > 0) {
      return { value: traceabilityWork > 99 ? "!" : traceabilityWork, tone: "danger", title: `${traceabilityWork} traceability or contract issue${traceabilityWork === 1 ? "" : "s"}` };
    }
    const writebackWork = writebacks.filter((proposal) => proposal.status === "proposed" || proposal.status === "rejected").length;
    if (page === "writeback" && writebackWork > 0) {
      return { value: writebackWork, tone: "warning", title: `${writebackWork} writeback proposal${writebackWork === 1 ? "" : "s"} need attention` };
    }
    if (page === "activity" && runtimeRunning) return { value: "live", tone: "live", title: "Runtime job is running" };
    if (page === "settings" && status && !status.runtimeInstalled) return { value: "!", tone: "danger", title: "Runtime path needs setup" };
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
      { label: copy.actionStrip.pipeline, icon: <Play size={15} />, onClick: handleIngestPipeline, disabled: runtimeRunning || busy === "start:ingest_pipeline" || (runnableIngest + parseablePdfs) === 0, tone: "primary" },
      { label: copy.nav.writeback, icon: <GitCompare size={15} />, onClick: () => setActivePage("writeback") },
    ];
  })();

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
      className={classNames(
        "app-shell",
        `interface-${interfaceLanguage}`,
        activePage === "settings" && "settings-mode",
        activePage !== "settings" && detailDrawerOpen && "drawer-open",
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
                {badge !== null && <span className={classNames("nav-badge", badge.tone)}>{badge.value}</span>}
              </button>
            );
          })}
        </nav>
        <div className={classNames("rail-status", tone)} title={vaultPath || "No vault selected"} />
      </aside>

      {activePage !== "settings" && detailDrawerOpen && (
        <button
          type="button"
          className="drawer-scrim"
          aria-label={interfaceLanguage === "zh" ? "关闭侧栏" : "Close inspector"}
          onClick={() => setDetailDrawerOpen(false)}
        />
      )}

      {activePage !== "settings" && detailDrawerOpen && (
        <aside className="sidebar command-sidebar open">
          <div className="drawer-header">
            <span>{copy.drawerTitle}</span>
            <button type="button" onClick={() => setDetailDrawerOpen(false)} aria-label={interfaceLanguage === "zh" ? "关闭侧栏" : "Close inspector"}>
              <XCircle size={16} />
            </button>
          </div>
          <div className="brand">
          <div className="brand-mark">
            <BrandMark size={42} />
          </div>
          <div>
            <h1>LLM Wiki</h1>
            <p>{vaultPath ? copy.brandSubtitleWithVault : copy.brandSubtitleNoVault}</p>
          </div>
        </div>

        <section className="panel">
          <h2>{copy.vaultManagement}</h2>
          <div className="path-field" title={vaultPath || copy.noVault}>{vaultPath ? visiblePath(vaultPath) : copy.noVault}</div>
          <div className="path-field" title={entryNote?.entryPath || copy.entryPending}>
            {entryNote?.entryRelativePath ? visiblePath(entryNote.entryRelativePath) : copy.entryPending}
          </div>
          {entryNote?.obsidianUri && (
            <div className="path-field" title={entryNote.obsidianUri}>{entryNote.obsidianUri}</div>
          )}
          {vaultPath && hasWhitespacePathSegment(vaultPath) && (
            <p className="note warn-text">当前路径包含尾随空格目录段，桌面端会按真实路径保留；手动输入时请使用选择器或最近 vault。</p>
          )}
          {entryNote?.warning && <p className="note warn-text">{entryNote.warning}</p>}
          <div className="button-row">
            <button onClick={chooseVault}><FolderOpen size={16} />{copy.open}</button>
            <button onClick={() => refresh()} disabled={!vaultPath || busy === "inspect"}><RefreshCw size={16} />{copy.refresh}</button>
          </div>
          <input value={newVaultPath} onChange={(event) => setNewVaultPath(event.target.value)} placeholder="/absolute/path/to/new-vault" />
          <label className="check-row">
            <input type="checkbox" checked={enableObsidian} onChange={(event) => setEnableObsidian(event.target.checked)} />
            {copy.enableObsidianProfile}
          </label>
          <button className="wide" onClick={handleCreateVault} disabled={busy === "create"}><Archive size={16} />{copy.createVault}</button>
          <div className="button-row">
            <button onClick={() => vaultPath && openPath(vaultPath)} disabled={!vaultPath}><FolderOpen size={16} />{copy.folder}</button>
            <button onClick={revealEntryOrVault} disabled={!vaultPath}><FolderOpen size={16} />{copy.finder}</button>
            <button onClick={handleOpenObsidian} disabled={!vaultPath || busy === "obsidian_open"}><SquareStack size={16} />{copy.obsidian}</button>
          </div>
          <div className="button-row">
            <button onClick={() => copyText("entry path", entryNote?.fallbackPath || entryNote?.entryPath || vaultPath)} disabled={!vaultPath}><Copy size={16} />{copy.copyPath}</button>
            <button onClick={() => copyText("Obsidian URI", entryNote?.obsidianUri)} disabled={!entryNote?.obsidianUri}><Copy size={16} />{copy.copyUri}</button>
          </div>
        </section>

        <DetailsPanel
          language={interfaceLanguage}
          selection={detailSelection}
          vaultPath={vaultPath}
          obsidianUri={entryNote?.obsidianUri}
          resolveVaultPath={vaultFilePath}
          onOpenPath={openPath}
          onRevealPath={revealResolvedPath}
          onOpenVaultPath={openVaultItem}
          onCopy={copyText}
          onOpenObsidian={handleOpenObsidian}
        />

        <ActivityMiniPanel
          activeJob={activeJob}
          history={runtimeHistory}
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

        <section className="panel focus-panel">
          <h2>{copy.nextActionTitle}</h2>
          <p className="note">{vaultPath ? copy.nextActionHelp : copy.brandSubtitleNoVault}</p>
          <div className="focus-list">
            <button onClick={() => setActivePage("dashboard")}>
              <SquareStack size={15} />
              <span>{copy.nav.dashboard}</span>
              <em>{status?.dashboardAvailable ? copy.stateLabels.ready : copy.stateLabels.needsRefresh}</em>
            </button>
            <button onClick={() => setActivePage("activity")}>
              <TerminalSquare size={15} />
              <span>{copy.nav.activity}</span>
              <em>{runtimeRunning ? copy.stateLabels.running : `${runtimeHistory.length} ${copy.stateLabels.history}`}</em>
            </button>
            <button onClick={() => setActivePage("writeback")}>
              <GitCompare size={15} />
              <span>{copy.nav.writeback}</span>
              <em>{writebacks.length} ${copy.stateLabels.proposals}</em>
            </button>
            <button onClick={() => setActivePage("chat")}>
              <MessageSquare size={15} />
              <span>{copy.nav.chat}</span>
              <em>{claims.length + reviewItems.length + writebacks.length} ${copy.stateLabels.searchableRecords}</em>
            </button>
            <button onClick={() => setActivePage("graph")}>
              <Network size={15} />
              <span>{copy.nav.graph}</span>
              <em>{claims.length + traceabilityWarnings.length + impactEdges.length} ${copy.stateLabels.links}</em>
            </button>
            <button onClick={() => setActivePage("traceability")}>
              <GitCompare size={15} />
              <span>{copy.nav.traceability}</span>
              <em>{traceabilityWarnings.length + brokenEvidence} ${copy.stateLabels.warnings}</em>
            </button>
          </div>
        </section>
      </aside>
      )}

      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>{activePageCopy.title}</h2>
            <p>{activePageCopy.subtitle}</p>
          </div>
          <div className="topbar-status">
            <div className="status-pill" title={vaultPath || "No vault selected"}>
              <Database size={15} />
              <span>{vaultDisplayName}</span>
            </div>
            <div className={classNames("health", tone)}>
              {tone === "ok" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              {vaultPath ? (status ? (status.schemaValid ? copy.labels.schemaValid : copy.labels.schemaInvalid) : copy.labels.inspecting) : copy.brandSubtitleNoVault}
            </div>
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
            <button className="language-toggle" type="button" onClick={toggleInterfaceLanguage} title={`Switch to ${copy.languageToggle}`}>
              <Languages size={15} />
              <span>{copy.languageToggle}</span>
            </button>
            {activePage !== "settings" && (
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

        {activePage !== "settings" && (
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
          onRunObsidianSetup={() => handleRuntime("obsidian_setup")}
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
          importResults={importResults}
          preserveFolders={preserveFolders}
          busy={busy}
          onPreserveFoldersChange={setPreserveFolders}
          onRefresh={() => refresh()}
          onImportFiles={handleImportFiles}
          onImportFolder={handleImportFolder}
          onPlanIngest={handlePlanIngest}
          onOpenPath={openPath}
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
          <button onClick={handleIngestPipeline} disabled={!vaultPath || runtimeRunning || busy === "start:ingest_pipeline" || (runnableIngest + parseablePdfs) === 0}><Play size={16} />{copy.actionStrip.pipeline}</button>
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
            <span>{activeJob ? `${activeJob.status} · ${runtimeDurationSeconds(activeJob)}s` : copy.activity.idle}</span>
          </div>
          <div className="activity-meta">
            <span>{interfaceLanguage === "zh" ? "任务" : "Job"}: {activeJob?.jobId || (interfaceLanguage === "zh" ? "无" : "none")}</span>
            <span>{interfaceLanguage === "zh" ? "阶段" : "Stage"}: {activeJob?.stage || busy || copy.activity.idle}</span>
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
                <span className={classNames("status-chip", runtimeStatusTone(job.status))}>{job.status}</span>
                <strong>{job.kind}</strong>
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
                <button key={`${item.sourcePath}-${item.sha256}`} onClick={() => item.targetPath && openPath(item.targetPath)}>
                  <span className={classNames("status-chip", item.status)}>{item.status}</span>
                  <strong>{item.fileName}</strong>
                  <em>{item.mime} · {(item.sizeBytes / 1024).toFixed(1)} KB · {item.folderContext || (interfaceLanguage === "zh" ? "根目录" : "root")}</em>
                  <code>{item.sha256.slice(0, 16)} · {item.doi || item.arxivId || item.titleHint || (interfaceLanguage === "zh" ? "无元数据" : "no metadata")} · {item.duplicateOf || item.approximateDuplicateOf || item.targetPath}</code>
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
                  <span className={classNames("status-chip", job.status)}>{job.status}</span>
                  <strong>{job.sourceId || job.fileName}</strong>
                  <em>{job.currentStep} · {job.nextAction} · {interfaceLanguage === "zh" ? "尝试" : "attempt"} {job.attempt}/{job.maxAttempts}</em>
                  <code>{job.lastError || job.reason}</code>
                  <div className="inline-actions">
                    <button title={interfaceLanguage === "zh" ? "打开当前解析产物或原始资料" : "Open current artifact or raw source"} onClick={() => openPath(vaultFilePath(job.artifactPath || job.sourcePath))}><FolderOpen size={14} />{interfaceLanguage === "zh" ? "打开" : "Open"}</button>
                    <button title="重新排队" onClick={() => handleJobStatus(job.jobId, "queued")} disabled={job.status === "queued"}><RotateCcw size={14} />重试</button>
                    <button title={interfaceLanguage === "zh" ? "取消本资料的处理流程" : "Cancel this source pipeline"} onClick={() => handleJobStatus(job.jobId, "cancelled")} disabled={job.status === "cancelled"}><XCircle size={14} />{interfaceLanguage === "zh" ? "取消" : "Cancel"}</button>
                    <button title={interfaceLanguage === "zh" ? "打开任务日志" : "Open job log"} onClick={() => job.logPath && openPath(vaultFilePath(job.logPath))} disabled={!job.logPath}><TerminalSquare size={14} />{interfaceLanguage === "zh" ? "日志" : "Log"}</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className={classNames("main-grid view-section", pageVisible("traceability", "reviews") && "visible")}>
          <section className="panel large">
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

          <section className="panel large">
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
                    <button onClick={() => item.sourcePage && openPath(vaultFilePath(item.sourcePage))} disabled={!item.sourcePage}><FolderOpen size={14} />{interfaceLanguage === "zh" ? "资料" : "source"}</button>
                    <button onClick={() => item.artifactPath && openPath(vaultFilePath(item.artifactPath))} disabled={!item.artifactPath}><FileInput size={14} />{interfaceLanguage === "zh" ? "解析产物" : "artifact"}</button>
                    <button onClick={() => item.qaReportPath && openPath(vaultFilePath(item.qaReportPath))} disabled={!item.qaReportPath}><ShieldCheck size={14} />{interfaceLanguage === "zh" ? "质检" : "QA"}</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel large">
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
                    <button onClick={() => item.targetPath && openPath(vaultFilePath(item.targetPath))} disabled={!item.targetPath}><FolderOpen size={14} />{interfaceLanguage === "zh" ? "打开" : "open"}</button>
                    <button onClick={() => handleReviewStatus(item.itemId, "approved")} disabled={item.status === "approved"}><Check size={14} />{interfaceLanguage === "zh" ? "批准" : "approve"}</button>
                    <button onClick={() => handleReviewStatus(item.itemId, "rejected")} disabled={item.status === "rejected"}><XCircle size={14} />{interfaceLanguage === "zh" ? "拒绝" : "reject"}</button>
                    <button onClick={() => handleReviewStatus(item.itemId, "ignored")} disabled={item.status === "ignored"}><XCircle size={14} />{interfaceLanguage === "zh" ? "忽略" : "ignore"}</button>
                    <button onClick={() => handleFollowup(item)}><ClipboardList size={14} />{interfaceLanguage === "zh" ? "后续动作" : "follow-up"}</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

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
            onOpenPath={openPath}
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
          busy={busy}
          onOpenPath={openPath}
          resolveVaultPath={vaultFilePath}
          onCreateProposal={handleCreateQueryWritebackFromChat}
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
          onOpenPath={openPath}
          onRevealPath={revealPath}
          onCopyText={copyText}
          onOpenObsidian={handleOpenObsidian}
          resolveVaultPath={vaultFilePath}
        />

        <div className={classNames("main-grid view-section", pageVisible("dashboard", "claims") && "visible")}>
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
                    <button title={interfaceLanguage === "zh" ? "打开关联文件" : "Open linked file"} onClick={() => focusedAction.links[0] && openPath(vaultFilePath(focusedAction.links[0].path))} disabled={!focusedAction.links[0]}><FolderOpen size={14} />{interfaceLanguage === "zh" ? "打开" : "open"}</button>
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

          <section className="panel large">
            <div className="section-head">
              <h2>{interfaceLanguage === "zh" ? "论断台账" : "Claim Ledger"}</h2>
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
                    <button onClick={() => openPath(vaultFilePath("claims/claims.jsonl"))}><FolderOpen size={14} />{interfaceLanguage === "zh" ? "打开" : "open"}</button>
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
        </div>

        <div className={classNames("main-grid view-section", pageVisible("concepts") && "visible")}>
          <section className="panel large">
            <div className="section-head">
              <h2>{interfaceLanguage === "zh" ? "资料登记" : "Source Registry"}</h2>
              <span>{registry.length} {interfaceLanguage === "zh" ? "行" : "rows"}</span>
            </div>
            <div className="registry-list">
              {registry.length === 0 && <p className="empty">{interfaceLanguage === "zh" ? "暂无资料登记投影。" : "No registry projection yet."}</p>}
              {registry.map((entry) => (
                <button key={`${entry.sourceUuid}-${entry.sourcePath}`} onClick={() => openPath(vaultFilePath(entry.sourcePath))}>
                  <span className={classNames("status-chip", entry.status)}>{entry.status}</span>
                  <strong>{entry.sourceId || entry.sourceUuid}</strong>
                  <em>{entry.sourcePath}{entry.duplicateOf ? ` · ${interfaceLanguage === "zh" ? "重复于" : "duplicate of"} ${entry.duplicateOf}` : ""}</em>
                  <code>{entry.sourcePage || (interfaceLanguage === "zh" ? "资料页面待生成" : "source page pending")} · {entry.artifactSha256 || (interfaceLanguage === "zh" ? "无解析产物哈希" : "no artifact hash")} · {entry.parser || (interfaceLanguage === "zh" ? "解析器待定" : "parser pending")}</code>
                </button>
              ))}
            </div>
          </section>

          <section className="panel large">
            <div className="section-head">
              <h2>{interfaceLanguage === "zh" ? "资料 / 概念 / 报告" : "Sources / Concepts / Reports"}</h2>
              <span>{status?.files.length ?? 0} {interfaceLanguage === "zh" ? "项" : "items"}</span>
            </div>
            <div className="browser">
              <FileColumn title={interfaceLanguage === "zh" ? "收件箱" : "Inbox"} files={grouped.inbox} onSelect={selectFileForDetails} />
              <FileColumn title={interfaceLanguage === "zh" ? "资料" : "Sources"} files={[...grouped.source, ...grouped.draft]} onSelect={selectFileForDetails} />
              <FileColumn title={interfaceLanguage === "zh" ? "概念" : "Concepts"} files={grouped.concept} onSelect={selectFileForDetails} />
              <FileColumn title={interfaceLanguage === "zh" ? "报告" : "Reports"} files={grouped.report} onSelect={selectFileForDetails} />
            </div>
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
                <button key={`${entry.sourcePath}-${entry.sha256}`} onClick={() => openPath(entry.status === "blocked" ? entry.sourcePath : entry.artifactPath || entry.sourcePath)}>
                  <span className={classNames("status-chip", entry.status)}>{entry.status}</span>
                  <strong>{entry.fileName}</strong>
                  <em>{entry.reason}</em>
                  {entry.parserHint && <code>{entry.parserHint}</code>}
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
                <button key={artifact.artifactPath} onClick={() => openPath(vaultFilePath(artifact.manifestPath || artifact.artifactPath))}>
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
                <button key={finding.findingId} onClick={() => finding.path && openPath(vaultFilePath(finding.path))}>
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
                <button key={path} onClick={() => openPath(vaultFilePath(path))}>
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
              <button key={edge.edgeId}>
                <span className={classNames("status-chip", edge.status)}>{edge.status}</span>
                <strong>{edge.fromType}{" -> "}{edge.toType}</strong>
                <em>{edge.relationship}</em>
                <code>{edge.fromId}{" -> "}{edge.toId}</code>
              </button>
            ))}
          </div>
        </section>

        {selectedFile && (
          <section className="detail-bar">
            <div>
              <strong>{selectedFile.title || selectedFile.name}</strong>
              <span>{selectedFile.kind} · {selectedFile.status || "no status"} · {selectedFile.updated || "no updated date"} · QA {selectedFile.qaVerdict || "unknown"}</span>
              <code>{selectedFile.path}</code>
            </div>
            <button onClick={() => openPath(selectedFile.path)}><FolderOpen size={16} />{interfaceLanguage === "zh" ? "打开" : "open"}</button>
          </section>
        )}
          </>
        )}
      </section>
    </main>
  );
}

function FileColumn({ title, files, onSelect }: { title: string; files: VaultFile[]; onSelect: (file: VaultFile) => void }) {
  return (
    <div className="file-column">
      <h3>{title}</h3>
      {files.length === 0 && <p className="empty">None</p>}
      {files.map((file) => (
        <button key={file.path} onClick={() => onSelect(file)}>
          <strong>{file.title || file.name}</strong>
          <span>{file.status || file.updated || file.kind}</span>
        </button>
      ))}
    </div>
  );
}

export default App;
