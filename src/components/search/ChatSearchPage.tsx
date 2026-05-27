import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ClipboardCopy,
  FileSearch,
  FolderOpen,
  GitCompare,
  History,
  Lightbulb,
  Search,
  SquareStack,
} from "lucide-react";
import type {
  ClaimLedgerItem,
  EvidencePathItem,
  LlmAnswerEvidenceRef,
  LlmAnswerRequest,
  LlmAnswerResult,
  LlmProviderCenterSettings,
  LlmProviderConfig,
  ReviewQueueItem,
  TraceabilityWarning,
  VaultFile,
  VaultStatus,
  WritebackProposal,
} from "../../types";
import { runtimeLabel, runtimeText, type UiLanguage } from "../../i18n";
import { isLoopbackHttpEndpoint } from "../../lib/local-endpoints";
import { generateLlmAnswer } from "../../tauri";

const DEFAULT_DEEPSEEK_QUESTIONS = [
  "DeepSeek 的研发思路是什么？",
  "DeepSeek 如何做技术取舍？",
  "DeepSeek 可能如何演进？",
  "哪些洞察值得写回知识库？",
];

const DEFAULT_DEEPSEEK_QUESTIONS_EN = [
  "What is DeepSeek's research strategy?",
  "How does DeepSeek make technical tradeoffs?",
  "How might DeepSeek evolve next?",
  "Which insights are worth writing back to the wiki?",
];

const HISTORY_KEY_PREFIX = "llm-wiki-desktop.chat-search.history";
const CLAIM_LEDGER_PATH = "claims/claims.jsonl";
const REVIEW_QUEUE_PATH = "reviews/science-review-queue.md";
const WRITEBACK_QUEUE_PATH = "reviews/query-writeback/";

type SearchKind = VaultFile["kind"] | "claim" | "evidence" | "review" | "writeback" | "traceability";
type SearchFilter = SearchKind | "all";

type SearchResult = {
  id: string;
  type: SearchKind;
  title: string;
  path: string;
  snippet: string;
  evidence?: string | null;
  status?: string | null;
  severity?: string | null;
  relations: string[];
  searchText: string;
  priority: number;
};

type HistoryEvidenceRef = {
  id: string;
  type: SearchKind;
  title: string;
  path: string;
  evidence?: string | null;
  relation?: string | null;
  status?: string | null;
};

type QueryHistoryItem = {
  id: string;
  question: string;
  searchText: string;
  targetPath: string;
  evidence: HistoryEvidenceRef[];
  proposal?: {
    targetPath: string;
    status: string;
  };
  createdAt: string;
};

type ChatSearchPageProps = {
  className?: string;
  language?: UiLanguage;
  vaultPath: string;
  status: VaultStatus | null;
  claims: ClaimLedgerItem[];
  evidencePaths: EvidencePathItem[];
  reviewItems: ReviewQueueItem[];
  writebacks: WritebackProposal[];
  traceabilityWarnings: TraceabilityWarning[];
  providerCenter?: LlmProviderCenterSettings | null;
  handoffQuestion?: string;
  handoffTargetPath?: string;
  handoffKey?: number;
  busy: string | null;
  onCreateProposal: (question: string, targetPath: string) => void | Promise<void>;
  onOpenPath: (path: string) => void | Promise<void>;
  resolveVaultPath: (path?: string | null) => string;
  onOpenVaultItem?: (path?: string | null) => void | Promise<void>;
  onRevealPath?: (path: string) => void | Promise<void>;
  onCopyText?: (label: string, text?: string | null) => void | Promise<void>;
};

const chatCopy = {
  zh: {
    title: "Wiki 问答",
    loaded: (shown: number, total: number) => `${shown}/${total} 个已加载对象`,
    inputPlaceholder: "提问或搜索 DeepSeek 研究证据",
    target: "写回目标",
    searchEvidence: "搜索证据",
    draftAnswer: "生成证据回答",
    generatingAnswer: "正在调用模型",
    createProposal: "创建提案",
    boundaryTitle: "先提案后写回边界",
    boundaryBody: "本页面先检索知识库证据；启用可用 API 提供方后，会把证据图随问题一起发给模型生成回答。未配置可用提供方时只生成本地证据草稿。任何写回仍先进入提案审批门。",
    providerLabel: "当前提供方",
    providerDraftOnly: "回答仍保持 evidence-first；模型不会直接写入资料或概念页。",
    providerNotCallable: "当前提供方不能直接生成回答",
    providerGenerated: "模型已生成",
    providerFallback: "已回退为本地证据草稿",
    providerConsent: "允许本次调用当前 API 提供方（会发送当前 evidence map）",
    providerConsentRequired: "未允许本次 API 调用；已生成本地证据草稿。",
    history: "查询历史",
    emptyHistory: "生成证据草稿或创建提案后，会保存当前知识库专属的查询历史。",
    results: "结果",
    shown: "显示",
    searchPlaceholder: "搜索资料页、论断、概念、审核和写回提案",
    noVault: "打开或刷新已生成的知识库后即可搜索对象。",
    noMatch: "没有匹配的知识库对象。",
    answer: "证据回答",
    answerKinds: "证据图 · 模型回答 · 本地回退 · 提案写回",
    selected: "选中结果",
    none: "无",
    noSnippet: "没有摘要。",
    selectResult: "选择一个结果，检查路径、证据关系和动作。",
    copyDraft: "复制草稿",
    draftPlaceholder: "先选择问题或执行搜索，再生成证据回答。可用 API 提供方会被调用；否则输出清楚标记为本地草稿。",
    evidenceMap: "证据图",
    references: "条引用",
    currentEvidence: "当前回答证据",
    selectedCount: "已选择",
    evidenceEmpty: "搜索结果会填充证据图。",
    noEvidenceQuote: "没有加载证据摘录。",
    writebackProposals: "写回提案",
    noProposals: "没有加载问答写回提案。",
    evidenceCount: "条证据",
    loadedStatus: "已加载",
    proposalFallback: "提案",
    filters: {
      all: "全部类型",
      source: "资料",
      claim: "论断",
      concept: "概念",
      note: "知识库笔记",
      draft: "草稿",
      review: "审核",
      writeback: "写回提案",
      evidence: "证据路径",
      traceability: "可追踪性",
      report: "报告",
      inbox: "收件箱",
    },
    resultTypes: {
      source: "资料",
      claim: "论断",
      concept: "概念",
      note: "知识库笔记",
      draft: "草稿",
      review: "审核",
      writeback: "写回提案",
      evidence: "证据路径",
      traceability: "可追踪性",
      report: "报告",
      inbox: "收件箱",
    },
    actions: { open: "打开", reveal: "显示", path: "路径", evidence: "证据", copy: "复制", obsidian: "Obsidian" },
  },
  en: {
    title: "Wiki Chat",
    loaded: (shown: number, total: number) => `${shown}/${total} loaded objects`,
    inputPlaceholder: "Ask or search DeepSeek research evidence",
    target: "Writeback target",
    searchEvidence: "search evidence",
    draftAnswer: "generate evidence answer",
    generatingAnswer: "calling model",
    createProposal: "create proposal",
    boundaryTitle: "Proposal-first boundary",
    boundaryBody: "This page retrieves vault evidence first. When a usable API provider is enabled, the evidence map is sent with the question to generate an answer. Without a usable provider it creates a local evidence draft. Any writeback still goes through the proposal approval gate.",
    providerLabel: "Provider config",
    providerDraftOnly: "Answers remain evidence-first; the model never writes source or concept pages directly.",
    providerNotCallable: "Current provider cannot generate answers directly",
    providerGenerated: "generated by model",
    providerFallback: "using local evidence draft fallback",
    providerConsent: "Allow this answer to call the current API provider and send the current evidence map",
    providerConsentRequired: "API provider call was not allowed for this answer; generated a local evidence draft.",
    history: "Query history",
    emptyHistory: "Draft from evidence or create a proposal to save vault-scoped query history.",
    results: "Results",
    shown: "shown",
    searchPlaceholder: "Search source pages, claims, concepts, reviews, and writeback proposals",
    noVault: "Open or refresh a generated vault to search loaded wiki objects.",
    noMatch: "No matching vault objects.",
    answer: "Evidence Answer",
    answerKinds: "evidence map · model answer · local fallback · proposal writeback",
    selected: "Selected result",
    none: "none",
    noSnippet: "No snippet available.",
    selectResult: "Select a result to inspect its path, evidence relation, and actions.",
    copyDraft: "copy draft",
    draftPlaceholder: "Generate an evidence answer after choosing a question or running a search. A usable API provider will be called; otherwise the output is clearly marked as a local draft.",
    evidenceMap: "Evidence Map",
    references: "references",
    currentEvidence: "Current answer evidence",
    selectedCount: "selected",
    evidenceEmpty: "Search results will populate the evidence map.",
    noEvidenceQuote: "No evidence quote loaded.",
    writebackProposals: "Writeback proposals",
    noProposals: "No query writeback proposals loaded.",
    evidenceCount: "evidence",
    loadedStatus: "loaded",
    proposalFallback: "proposal",
    filters: {
      all: "all types",
      source: "sources",
      claim: "claims",
      concept: "concepts",
      note: "wiki notes",
      draft: "drafts",
      review: "reviews",
      writeback: "writebacks",
      evidence: "evidence paths",
      traceability: "traceability",
      report: "reports",
      inbox: "inbox",
    },
    resultTypes: {
      source: "source",
      claim: "claim",
      concept: "concept",
      note: "wiki note",
      draft: "draft",
      review: "review",
      writeback: "writeback",
      evidence: "evidence",
      traceability: "traceability",
      report: "report",
      inbox: "inbox",
    },
    actions: { open: "open", reveal: "reveal", path: "path", evidence: "evidence", copy: "copy", obsidian: "Obsidian" },
  },
} as const;

const providerNames: Record<string, string> = {
  "ernie-ai-studio": "文心一言 / ERNIE",
  "openai-compatible": "OpenAI-compatible",
  "local-claude": "Claude Code CLI",
  "local-codex": "Codex CLI",
  custom: "Custom",
  anthropic: "Anthropic Claude",
  "claude-code": "Claude Code CLI",
  "codex-cli": "Codex CLI",
  openai: "OpenAI GPT",
  google: "Google Gemini",
  deepseek: "DeepSeek",
  groq: "Groq",
  xai: "xAI Grok",
  nvidia: "NVIDIA NIM",
  kimi: "Kimi",
  "kimi-cn": "Kimi China",
  "qwen-dashscope": "通义千问 / DashScope",
  "bailian-coding": "阿里百炼 Coding Plan",
  zhipu: "智谱 GLM",
  "minimax-global": "MiniMax Global",
  "minimax-cn": "MiniMax China",
  "volcengine-ark": "火山引擎 Ark",
  "baidu-qianfan": "百度千帆",
  "tencent-hunyuan": "腾讯混元",
  siliconflow: "硅基流动",
  baichuan: "百川智能",
  yi: "零一万物 Yi",
  "iflytek-spark": "讯飞星火",
  "ollama-local": "Ollama Local",
  "custom-openai": "Custom OpenAI-Compatible",
};

const localProviderIds = new Set(["local-codex", "local-claude", "codex-cli", "claude-code"]);

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function compactText(value?: string | null, maxLength = 220) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

const relationCopy = {
  zh: {
    kind: "类型",
    status: "状态",
    qa: "QA",
    needsReview: "待审核",
    updated: "更新",
    claim: "论断",
    source: "资料",
    sourcePath: "资料路径",
    verdict: "结论",
    concepts: "概念",
    line: "行",
    concept: "概念",
    semantic: "语义",
    scienceReview: "科学审核",
    missing: "缺失",
    review: "审核",
    action: "动作",
    proposal: "提案",
    target: "目标",
    applied: "已应用",
    artifact: "解析产物",
    missingAnchor: "缺失锚点",
  },
  en: {
    kind: "kind",
    status: "status",
    qa: "QA",
    needsReview: "needs review",
    updated: "updated",
    claim: "claim",
    source: "source",
    sourcePath: "source path",
    verdict: "verdict",
    concepts: "concepts",
    line: "line",
    concept: "concept",
    semantic: "semantic",
    scienceReview: "science review",
    missing: "missing",
    review: "review",
    action: "action",
    proposal: "proposal",
    target: "target",
    applied: "applied",
    artifact: "artifact",
    missingAnchor: "missing anchor",
  },
} as const;

type RelationLabels = (typeof relationCopy)[UiLanguage];
type RelationKey = keyof RelationLabels;

function localizedSearchValue(value: string | number | boolean, language: UiLanguage) {
  if (language !== "zh") return String(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return String(value);
  const raw = value.trim();
  if (!raw) return "";
  const direct = runtimeLabel(raw, language);
  if (direct !== raw) return direct;
  if (raw.includes(",") && /^[\w\s,-]+$/.test(raw)) {
    return raw
      .split(",")
      .map((part) => {
        const token = part.trim();
        return runtimeLabel(token, language) || token;
      })
      .join("、");
  }
  return runtimeText(raw, language);
}

function relation(labels: RelationLabels, label: RelationKey, value?: string | number | boolean | null, language: UiLanguage = "en") {
  if (value === undefined || value === null || value === "" || value === false) return null;
  return `${labels[label]}: ${localizedSearchValue(value, language)}`;
}

function normalizeHistoryEvidence(value: unknown): HistoryEvidenceRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      id: String(item.id || item.path || item.title || ""),
      type: String(item.type || "evidence") as SearchKind,
      title: String(item.title || item.path || "Evidence"),
      path: String(item.path || ""),
      evidence: typeof item.evidence === "string" ? item.evidence : null,
      relation: typeof item.relation === "string" ? item.relation : null,
      status: typeof item.status === "string" ? item.status : null,
    }))
    .filter((item) => item.id && item.path)
    .slice(0, 8);
}

function historyStorageKey(vaultPath: string) {
  const scope = vaultPath || "no-vault";
  return `${HISTORY_KEY_PREFIX}:${encodeURIComponent(scope)}`;
}

function loadHistory(vaultPath: string): QueryHistoryItem[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const parsed = JSON.parse(localStorage.getItem(historyStorageKey(vaultPath)) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index): QueryHistoryItem | null => {
        if (typeof item === "string") {
          return {
            id: `legacy-${index}-${item}`,
            question: item,
            searchText: item,
            targetPath: "",
            evidence: [],
            createdAt: "",
          };
        }
        if (typeof item !== "object" || item === null) return null;
        const record = item as Record<string, unknown>;
        const question = typeof record.question === "string" ? record.question : "";
        if (!question.trim()) return null;
        const proposalRecord = typeof record.proposal === "object" && record.proposal !== null
          ? record.proposal as Record<string, unknown>
          : null;
        return {
          id: typeof record.id === "string" ? record.id : `history-${index}-${question}`,
          question,
          searchText: typeof record.searchText === "string" ? record.searchText : question,
          targetPath: typeof record.targetPath === "string" ? record.targetPath : "",
          evidence: normalizeHistoryEvidence(record.evidence),
          proposal: proposalRecord
            ? {
              targetPath: String(proposalRecord.targetPath || ""),
              status: String(proposalRecord.status || "proposal_requested"),
            }
            : undefined,
          createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
        };
      })
      .filter((item): item is QueryHistoryItem => Boolean(item))
      .slice(0, 8);
  } catch {
    return [];
  }
}

function saveHistory(vaultPath: string, history: QueryHistoryItem[]) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(historyStorageKey(vaultPath), JSON.stringify(history.slice(0, 8)));
  } catch {
    // History is convenience state only; ignore private mode or storage quota failures.
  }
}

type ActiveProviderSummary = {
  providerId: string;
  name: string;
  model: string;
  detail: string;
  canGenerate: boolean;
  unavailableReason: string;
  config: LlmProviderConfig | null;
};

function providerSummary(center?: LlmProviderCenterSettings | null, language: UiLanguage = "en"): ActiveProviderSummary {
  const activeProviderId = center?.activeProviderId || "";
  const activeConfig = activeProviderId ? center?.providers?.[activeProviderId] : null;
  const isLocalCli = localProviderIds.has(activeProviderId);
  const isLocalApi = isLoopbackHttpEndpoint(activeConfig?.apiBaseUrl);
  const hasApiEndpoint = Boolean(activeConfig?.apiBaseUrl?.trim());
  const hasApiCredential = Boolean(activeConfig?.apiKeyConfigured || isLocalApi);
  const enabled = Boolean(activeConfig?.enabled);
  const canGenerate = Boolean(enabled && !isLocalCli && hasApiEndpoint && hasApiCredential);
  if (!activeProviderId || !activeConfig || !enabled) {
    return {
      providerId: "",
      name: language === "zh" ? "未选择提供方" : "No provider selected",
      model: "",
      detail: language === "zh" ? "设置 / 大语言模型中尚未启用可用提供方" : "No usable provider is enabled in Settings / LLM Models",
      canGenerate: false,
      unavailableReason: language === "zh" ? "没有启用可用提供方" : "No usable provider is enabled",
      config: null,
    };
  }
  const model = activeConfig?.customModel?.trim() || activeConfig?.selectedModel || "default";
  const window = activeConfig?.contextWindow
    ? `${activeConfig.contextWindow.toLocaleString()} ${language === "zh" ? "令牌" : "tokens"}`
    : language === "zh" ? "上下文未设置" : "context unset";
  const reasoning = activeConfig?.reasoningMode || "balanced";
  const reasoningLabel = language === "zh"
    ? ({ fast: "快速", balanced: "平衡", deep: "深度思考" } as Record<string, string>)[reasoning] || reasoning
    : reasoning;
  const unavailableReason = isLocalCli
    ? language === "zh"
      ? "本地 CLI 已用于运行时交接；当前问答页只直接调用 API endpoint。"
      : "Local CLI is used for runtime handoff; this page directly calls API endpoints only."
    : !hasApiEndpoint
      ? language === "zh" ? "缺少 API Base URL。" : "Missing API Base URL."
      : !hasApiCredential
        ? language === "zh"
          ? `${activeConfig.apiKeyEnvVar || "API key 环境变量"} 未被桌面进程检测到。`
          : `${activeConfig.apiKeyEnvVar || "API key environment variable"} is not visible to the desktop process.`
        : "";
  return {
    providerId: activeProviderId,
    name: providerNames[activeProviderId] || activeProviderId,
    model,
    detail: `${model} · ${window} · ${reasoningLabel}${localProviderIds.has(activeProviderId) ? "" : ` · ${activeConfig?.apiProtocol || "api"} · ${activeConfig?.apiBaseUrl || activeConfig?.apiKeyEnvVar || "API"}`}`,
    canGenerate,
    unavailableReason,
    config: activeConfig,
  };
}

function tokenize(query: string) {
  const lower = query.toLocaleLowerCase();
  const asciiTerms = lower
    .split(/[\s,.;:!?，。；：！？、()[\]{}"'`]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  const cjkTerms = lower.match(/[\u3400-\u9fff]{2,}/g) ?? [];
  return Array.from(new Set([...asciiTerms, ...cjkTerms]));
}

function scoreResult(result: SearchResult, query: string) {
  const trimmed = query.trim().toLocaleLowerCase();
  if (!trimmed) return result.priority;
  const haystack = result.searchText.toLocaleLowerCase();
  const terms = tokenize(trimmed);
  let score = 0;
  if (haystack.includes(trimmed)) score += 12;
  for (const term of terms) {
    if (haystack.includes(term)) score += term.length > 8 ? 5 : 3;
  }
  if (result.type === "claim" || result.type === "evidence") score += 2;
  if (result.status === "needs_review" || result.status === "proposed") score += 1;
  return score;
}

function diversifySearchResults(ranked: SearchResult[], limit: number) {
  const primaryTypes: SearchKind[] = ["source", "claim", "concept", "review", "writeback", "traceability", "evidence"];
  const seen = new Set<string>();
  const diversified: SearchResult[] = [];

  for (const type of primaryTypes) {
    const match = ranked.find((item) => item.type === type && !seen.has(item.id));
    if (match) {
      diversified.push(match);
      seen.add(match.id);
    }
  }

  for (const item of ranked) {
    if (seen.has(item.id)) continue;
    diversified.push(item);
    seen.add(item.id);
    if (diversified.length >= limit) break;
  }

  return diversified.slice(0, limit);
}

function filterSearchResults(index: SearchResult[], typeFilter: SearchFilter, searchText: string) {
  const typed = typeFilter === "all" ? index : index.filter((item) => item.type === typeFilter);
  const ranked = typed
    .map((item) => ({ item, score: scoreResult(item, searchText) }))
    .filter(({ score }) => !searchText.trim() || score > 0)
    .sort((a, b) => b.score - a.score || b.item.priority - a.item.priority)
    .map(({ item }) => item);

  if (ranked.length || !searchText.trim()) {
    if (typeFilter === "all" && searchText.trim()) return diversifySearchResults(ranked, 40);
    return ranked.slice(0, 40);
  }
  return typed.sort((a, b) => b.priority - a.priority).slice(0, 16);
}

function isMarkdownPath(path: string) {
  return /\.(md|markdown)$/i.test(path);
}

function unique(items: Array<string | null>) {
  return Array.from(new Set(items.filter((item): item is string => Boolean(item))));
}

function markdownLinkLabel(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function vaultMarkdownLink(path?: string | null) {
  const cleanPath = (path || "").trim();
  if (!cleanPath) return "";
  return `[${markdownLinkLabel(cleanPath)}](#vault:${encodeURIComponent(cleanPath)})`;
}

function vaultPathFromMarkdownHref(href?: string | null) {
  if (!href?.startsWith("#vault:")) return null;
  try {
    return decodeURIComponent(href.slice("#vault:".length));
  } catch {
    return null;
  }
}

function isBlockedEvidenceResult(item: SearchResult) {
  const status = (item.status || "").toLowerCase();
  const severity = (item.severity || "").toLowerCase();
  const relations = item.relations.join(" ").toLowerCase();
  return (
    ["broken", "stale", "contradicted", "failed", "blocked"].includes(status) ||
    ["p0", "p1"].includes(severity) ||
    relations.includes("missing") ||
    relations.includes("artifact hash") ||
    relations.includes("unknown source")
  );
}

function blockedEvidenceReason(item: SearchResult, language: UiLanguage) {
  const status = item.status ? `${language === "zh" ? "状态" : "status"}=${localizedSearchValue(item.status, language)}` : null;
  const severity = item.severity ? `${language === "zh" ? "严重性" : "severity"}=${localizedSearchValue(item.severity, language)}` : null;
  const relation = item.relations.find((entry) => /missing|artifact hash|unknown source/i.test(entry));
  return [status, severity, relation].filter(Boolean).join(" · ") || (language === "zh" ? "证据需要人工确认" : "evidence requires human confirmation");
}

type AnswerCitationCoverage = {
  conclusions: number;
  cited: number;
  unsupported: number;
  staleOrRisky: number;
  needsEvidenceReview: boolean;
};

function answerCitationCoverage(evidence: SearchResult[]): AnswerCitationCoverage {
  const cited = evidence.filter((item) => !isBlockedEvidenceResult(item)).length;
  const staleOrRisky = evidence.filter(isBlockedEvidenceResult).length;
  const unsupported = cited === 0 ? 1 : 0;
  return {
    conclusions: cited + staleOrRisky + unsupported,
    cited,
    unsupported,
    staleOrRisky,
    needsEvidenceReview: unsupported > 0 || staleOrRisky > 0,
  };
}

function renderAnswerCitationCoverage(coverage: AnswerCitationCoverage, language: UiLanguage) {
  const summary = `${coverage.conclusions} conclusions / ${coverage.cited} cited / ${coverage.unsupported} unsupported / ${coverage.staleOrRisky} stale-or-risky`;
  if (language === "zh") {
    return [
      "## Citation coverage / 引用覆盖",
      `- summary: ${summary}`,
      `- status: ${coverage.needsEvidenceReview ? "needs evidence review / 需要证据复核" : "supported coverage ready / 引用覆盖可审"}`,
      "- rule: stale、contradicted、broken 或 unknown-source 证据只能作为 risky evidence，不计入 supported coverage。",
    ].join("\n");
  }
  return [
    "## Citation coverage",
    `- summary: ${summary}`,
    `- status: ${coverage.needsEvidenceReview ? "needs evidence review" : "supported coverage ready"}`,
    "- rule: stale, contradicted, broken, or unknown-source evidence is risky only and does not count as supported coverage.",
  ].join("\n");
}

function pickAnswerEvidence(results: SearchResult[], selected?: SearchResult | null) {
  const evidenceTypes: SearchKind[] = ["claim", "evidence", "source", "concept", "review", "writeback", "traceability"];
  const ordered = selected && evidenceTypes.includes(selected.type) ? [selected, ...results] : results;
  const seen = new Set<string>();
  return ordered
    .filter((item) => evidenceTypes.includes(item.type))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, 8);
}

function toHistoryEvidence(items: SearchResult[]): HistoryEvidenceRef[] {
  return items.slice(0, 8).map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    path: item.path,
    evidence: item.evidence,
    relation: item.relations.find((entry) => entry.startsWith("claim:") || entry.startsWith("source")) ?? null,
    status: item.status || item.severity || null,
  }));
}

function buildEvidenceIndex(evidencePaths: EvidencePathItem[]) {
  const byClaim = new Map<string, EvidencePathItem[]>();
  for (const item of evidencePaths) {
    const current = byClaim.get(item.claimId) ?? [];
    current.push(item);
    byClaim.set(item.claimId, current);
  }
  return byClaim;
}

function buildSearchIndex({
  status,
  claims,
  evidencePaths,
  reviewItems,
  writebacks,
  traceabilityWarnings,
  labels,
  language,
}: Pick<ChatSearchPageProps, "status" | "claims" | "evidencePaths" | "reviewItems" | "writebacks" | "traceabilityWarnings"> & { labels: RelationLabels; language: UiLanguage }) {
  const evidenceByClaim = buildEvidenceIndex(evidencePaths);
  const results: SearchResult[] = [];
  const files = status?.files ?? [];

  for (const file of files) {
    const title = file.title || file.name || file.path;
    const status = file.status || file.qaVerdict || (file.needsReview ? "needs_review" : null);
    const displayStatus = status ? localizedSearchValue(status, language) : null;
    const displayQaVerdict = file.qaVerdict ? localizedSearchValue(file.qaVerdict, language) : null;
    const excerpt = compactText(file.excerpt, 280);
    const relations = unique([
      relation(labels, "kind", file.kind, language),
      relation(labels, "status", file.status, language),
      relation(labels, "qa", file.qaVerdict, language),
      relation(labels, "needsReview", file.needsReview ? file.needsReview : null, language),
      relation(labels, "updated", file.updated, language),
    ]);
    const snippet = excerpt || compactText([displayStatus, file.updated, file.path].filter(Boolean).join(" · "));
    results.push({
      id: `file:${file.path}`,
      type: file.kind,
      title,
      path: file.path,
      snippet: snippet || file.path,
      status,
      evidence: displayQaVerdict || excerpt,
      relations,
      searchText: [title, file.name, file.path, file.kind, file.status, file.qaVerdict, file.updated, file.excerpt].join(" "),
      priority: file.kind === "concept" ? 6 : file.kind === "source" ? 5 : file.kind === "note" ? 4 : 3,
    });
  }

  for (const claim of claims) {
    const evidenceItems = evidenceByClaim.get(claim.claimId) ?? [];
    const evidence = evidenceItems[0];
    const sourcePath = claim.sourcePath || evidence?.sourcePage || evidence?.rawPath || "";
    const relations = unique([
      relation(labels, "claim", claim.claimId, language),
      relation(labels, "source", claim.sourceId || claim.sourceUuid || evidence?.sourceId, language),
      relation(labels, "sourcePath", sourcePath, language),
      relation(labels, "verdict", claim.verdict, language),
      relation(labels, "status", claim.status, language),
      relation(labels, "concepts", claim.concepts.join(", "), language),
      relation(labels, "line", claim.line, language),
    ]);
    results.push({
      id: `claim:${claim.claimId}:${claim.line}`,
      type: "claim",
      title: claim.claimId,
      path: CLAIM_LEDGER_PATH,
      snippet: compactText(claim.claimText),
      status: claim.needsReview ? "needs_review" : claim.verdict || claim.status,
      evidence: compactText(claim.evidenceQuote || evidence?.evidenceQuote || claim.evidenceHash || evidence?.evidenceAnchor),
      relations,
      searchText: [
        claim.claimId,
        claim.claimText,
        claim.sourceId,
        claim.sourceUuid,
        claim.sourcePath,
        claim.verdict,
        claim.status,
        claim.evidenceQuote,
        claim.evidenceHash,
        claim.concepts.join(" "),
      ].join(" "),
      priority: claim.needsReview ? 9 : 7,
    });
  }

  for (const item of evidencePaths) {
    const path = item.sourcePage || item.artifactPath || item.qaReportPath || item.rawPath || CLAIM_LEDGER_PATH;
    const relations = unique([
      relation(labels, "claim", item.claimId, language),
      relation(labels, "source", item.sourceId || item.sourceUuid, language),
      relation(labels, "concept", item.concept, language),
      relation(labels, "semantic", item.semanticStatus, language),
      relation(labels, "scienceReview", item.scienceReviewStatus, language),
      relation(labels, "missing", item.missing.join(", "), language),
    ]);
    results.push({
      id: `evidence:${item.claimId}:${path}`,
      type: "evidence",
      title: item.claimId,
      path,
      snippet: compactText(item.claimText),
      status: item.chainStatus,
      evidence: compactText(item.evidenceQuote || item.evidenceAnchor || item.chunksPath || item.artifactPath),
      relations,
      searchText: [
        item.claimId,
        item.claimText,
        item.chainStatus,
        item.sourceId,
        item.sourceUuid,
        item.sourcePage,
        item.evidenceAnchor,
        item.evidenceQuote,
        item.rawPath,
        item.artifactPath,
        item.qaReportPath,
        item.concept,
        item.missing.join(" "),
      ].join(" "),
      priority: item.chainStatus === "ok" ? 6 : 10,
    });
  }

  for (const item of reviewItems) {
    const path = item.targetPath || item.evidencePath || REVIEW_QUEUE_PATH;
    const relations = unique([
      relation(labels, "review", item.itemId, language),
      relation(labels, "kind", item.kind, language),
      relation(labels, "claim", item.claimId, language),
      relation(labels, "source", item.sourceId, language),
      relation(labels, "status", item.status, language),
      relation(labels, "action", item.recommendedAction, language),
    ]);
    results.push({
      id: `review:${item.itemId}`,
      type: "review",
      title: item.title,
      path,
      snippet: compactText(item.body),
      status: item.status,
      severity: item.severity,
      evidence: compactText(item.evidencePath || item.recommendedAction),
      relations,
      searchText: [
        item.itemId,
        item.kind,
        item.severity,
        item.title,
        item.body,
        item.status,
        item.targetPath,
        item.sourceId,
        item.claimId,
        item.evidencePath,
        item.recommendedAction,
      ].join(" "),
      priority: item.status === "open" || item.status === "needs_review" ? 9 : 5,
    });
  }

  for (const proposal of writebacks) {
    const path = proposal.targetPath || WRITEBACK_QUEUE_PATH;
    const relations = unique([
      relation(labels, "proposal", proposal.proposalId, language),
      relation(labels, "status", proposal.status, language),
      relation(labels, "target", proposal.targetPath, language),
      relation(labels, "updated", proposal.updatedAt, language),
      relation(labels, "applied", proposal.appliedAt, language),
    ]);
    results.push({
      id: `writeback:${proposal.proposalId}`,
      type: "writeback",
      title: proposal.title || proposal.proposalId,
      path,
      snippet: compactText(proposal.content || proposal.diff),
      status: proposal.status,
      evidence: compactText(proposal.diff),
      relations,
      searchText: [
        proposal.proposalId,
        proposal.targetPath,
        proposal.title,
        proposal.status,
        proposal.diff,
        proposal.content,
        proposal.updatedAt,
      ].join(" "),
      priority: proposal.status === "proposed" ? 8 : 4,
    });
  }

  for (const warning of traceabilityWarnings) {
    const path = warning.sourcePath || warning.artifactPath || warning.claimPath || CLAIM_LEDGER_PATH;
    const relations = unique([
      relation(labels, "claim", warning.claimId, language),
      relation(labels, "source", warning.sourceId, language),
      relation(labels, "sourcePath", warning.sourcePath, language),
      relation(labels, "artifact", warning.artifactPath, language),
      relation(labels, "missingAnchor", warning.missingAnchor, language),
      relation(labels, "action", warning.nextAction || warning.suggestedAction, language),
    ]);
    results.push({
      id: `traceability:${warning.warningId}`,
      type: "traceability",
      title: warning.summary || warning.warningId,
      path,
      snippet: compactText(warning.claimText || warning.summary),
      status: warning.severity,
      severity: warning.severity,
      evidence: compactText(warning.missingAnchor || warning.missingHeading || warning.suggestedAction),
      relations,
      searchText: [
        warning.warningId,
        warning.claimId,
        warning.claimText,
        warning.claimPath,
        warning.sourceId,
        warning.sourcePath,
        warning.artifactPath,
        warning.missingHeading,
        warning.missingAnchor,
        warning.severity,
        warning.summary,
        warning.suggestedAction,
        warning.nextAction,
      ].join(" "),
      priority: warning.severity === "p0" || warning.severity === "p1" ? 11 : 8,
    });
  }

  return results;
}

function answerTheme(question: string, language: UiLanguage) {
  if (language === "zh") {
    if (question.includes("取舍")) return "技术取舍";
    if (question.includes("演进")) return "演进预测";
    if (question.includes("写回")) return "写回候选";
    return "研发思路";
  }
  if (question.includes("tradeoff")) return "technical tradeoff";
  if (question.includes("evolve")) return "evolution forecast";
  if (question.includes("write")) return "writeback candidate";
  return "research strategy";
}

function buildAnswerDraft(question: string, targetPath: string, evidence: SearchResult[], language: UiLanguage, typeLabel: (type: SearchKind) => string) {
  const theme = answerTheme(question, language);
  const claimPrefix = language === "zh" ? "论断:" : "claim:";
  const sourcePrefix = language === "zh" ? "资料" : "source";
  const usableEvidence = evidence.filter((item) => !isBlockedEvidenceResult(item));
  const blockedEvidence = evidence.filter(isBlockedEvidenceResult);
  const coverageBlock = renderAnswerCitationCoverage(answerCitationCoverage(evidence), language);
  const usableEvidenceBullets = usableEvidence.length
    ? usableEvidence.map((item, index) => (
      `- E${index + 1} [${typeLabel(item.type)}] ${item.title} (${vaultMarkdownLink(item.path)}): ${item.snippet}${item.evidence ? ` ${language === "zh" ? "证据" : "Evidence"}: ${item.evidence}` : ""}`
    )).join("\n")
    : language === "zh"
      ? "- 没有 fresh/可用证据可作为确定性结论。"
      : "- No fresh usable evidence can support firm conclusions.";
  const blockedEvidenceBullets = blockedEvidence.length
    ? blockedEvidence.map((item, index) => (
      `- R${index + 1} [${typeLabel(item.type)}] ${item.title} (${vaultMarkdownLink(item.path)}): ${blockedEvidenceReason(item, language)}`
    )).join("\n")
    : language === "zh"
      ? "- 当前回答证据中没有 blocked evidence。"
      : "- No blocked evidence selected for this answer.";

  const claimRefs = unique(usableEvidence.map((item) => item.relations.find((entry) => entry.startsWith(claimPrefix)) ?? null)).slice(0, 5);
  const sourceRefs = unique(usableEvidence.map((item) => item.relations.find((entry) => entry.startsWith(sourcePrefix)) ?? null)).slice(0, 5);

  if (language === "zh") {
    return [
      coverageBlock,
      "",
      `问题：${question || "未输入问题"}`,
      "草稿方法：本地确定性证据提纲；未调用大模型提供方。",
      "",
      "## 可用证据",
      usableEvidenceBullets,
      "",
      "## 风险 / 需人工确认",
      blockedEvidenceBullets,
      "",
      "## 推断",
      `- 主题：${theme}。当前回答必须受上方已检索知识库对象约束，尤其是论断、资料页、概念、审核项和写回提案。`,
      `- 范围内论断引用：${claimRefs.length ? claimRefs.join("; ") : "已加载证据中暂无论断引用"}。`,
      `- 范围内资料引用：${sourceRefs.length ? sourceRefs.join("; ") : "已加载证据中暂无资料引用"}。`,
      "",
      "## 假设",
      "- 更强的回答需要等待未解决审核项和断裂证据锚点修复后再形成；不要把本节视为已批准的知识库内容。",
      "",
      "## 预测",
      "- 只有当证据图中可见支撑资料或论断链时，预测才应写成可能演进路径。",
      "",
      "## 先提案后写回",
      `- 目标提案路径：${vaultMarkdownLink(targetPath || "reviews/query-writeback/deepseek-research-insights.md")}。`,
      "- 下一步：创建问答写回提案供审核。本页面不会应用写入，也不会批准提案。",
    ].join("\n");
  }

  return [
    coverageBlock,
    "",
    `Question: ${question || "No question entered"}`,
    "Draft method: local deterministic evidence outline; no LLM provider was called.",
    "",
    "## Usable evidence",
    usableEvidenceBullets,
    "",
    "## Risk / Needs human confirmation",
    blockedEvidenceBullets,
    "",
    "## Inference",
    `- Theme: ${theme}. The current answer should be constrained to the retrieved vault objects above, especially claims, source pages, concepts, review items, and writeback proposals.`,
    `- Claim references in scope: ${claimRefs.length ? claimRefs.join("; ") : "none in loaded evidence"}.`,
    `- Source references in scope: ${sourceRefs.length ? sourceRefs.join("; ") : "none in loaded evidence"}.`,
    "",
    "## Hypothesis",
    "- A stronger answer may emerge after unresolved review items and broken evidence anchors are resolved; do not treat this section as approved wiki knowledge.",
    "",
    "## Forecast",
    "- Forecasts should be written as possible evolution paths only when the supporting source or claim chain is visible in the evidence map.",
    "",
    "## Proposal-first writeback",
    `- Target proposal path: ${vaultMarkdownLink(targetPath || "reviews/query-writeback/deepseek-research-insights.md")}.`,
    "- Next action: create a query writeback proposal for review. This page does not apply writes or approve proposals.",
  ].join("\n");
}

function toLlmAnswerEvidence(items: SearchResult[]): LlmAnswerEvidenceRef[] {
  return items.slice(0, 10).map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    path: item.path,
    snippet: item.snippet,
    evidence: item.evidence ?? null,
    status: item.status ?? null,
    severity: item.severity ?? null,
    relations: item.relations.slice(0, 10),
  }));
}

function buildLlmAnswerRequest(
  provider: ActiveProviderSummary,
  question: string,
  targetPath: string,
  evidence: SearchResult[],
  language: UiLanguage,
): LlmAnswerRequest | null {
  if (!provider.canGenerate || !provider.config) return null;
  return {
    providerId: provider.providerId,
    providerName: provider.name,
    apiProtocol: provider.config.apiProtocol || "openai-compatible",
    apiBaseUrl: provider.config.apiBaseUrl || "",
    apiKeyEnvVar: provider.config.apiKeyEnvVar || "",
    model: provider.model,
    contextWindow: provider.config.contextWindow,
    reasoningMode: provider.config.reasoningMode || "balanced",
    language,
    question,
    targetPath,
    evidence: toLlmAnswerEvidence(evidence.filter((item) => !isBlockedEvidenceResult(item))),
  };
}

function AnswerMarkdown({
  content,
  placeholder,
  onOpenVaultItem,
}: {
  content: string;
  placeholder: string;
  onOpenVaultItem?: (path?: string | null) => void | Promise<void>;
}) {
  if (!content.trim()) {
    return <p className="chat-answer-placeholder">{placeholder}</p>;
  }
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a({ href, children }) {
          const vaultTarget = vaultPathFromMarkdownHref(href);
          if (vaultTarget) {
            return (
              <a
                className="chat-answer-vault-link"
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  void onOpenVaultItem?.(vaultTarget);
                }}
              >
                {children}
              </a>
            );
          }
          return (
            <a href={href} rel="noreferrer" target="_blank">
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function ChatSearchPage({
  className,
  language = "zh",
  vaultPath,
  status,
  claims,
  evidencePaths,
  reviewItems,
  writebacks,
  traceabilityWarnings,
  providerCenter,
  handoffQuestion,
  handoffTargetPath,
  handoffKey,
  busy,
  onCreateProposal,
  onOpenPath,
  resolveVaultPath,
  onOpenVaultItem,
  onRevealPath,
  onCopyText,
}: ChatSearchPageProps) {
  const text = chatCopy[language];
  const typeLabel = (type: SearchKind) => (text.resultTypes as Record<SearchKind, string>)[type] || type;
  const resultStatusLabel = (result: SearchResult) =>
    localizedSearchValue(result.severity || result.status || result.type, language);
  const defaultQuestions = language === "zh" ? DEFAULT_DEEPSEEK_QUESTIONS : DEFAULT_DEEPSEEK_QUESTIONS_EN;
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState<SearchFilter>("all");
  const [question, setQuestion] = useState(defaultQuestions[0]);
  const [targetPath, setTargetPath] = useState("reviews/query-writeback/deepseek-research-insights.md");
  const [answerDraft, setAnswerDraft] = useState("");
  const [answerProviderResult, setAnswerProviderResult] = useState<LlmAnswerResult | null>(null);
  const [answerProviderError, setAnswerProviderError] = useState<string | null>(null);
  const [answerBusy, setAnswerBusy] = useState(false);
  const [allowProviderCall, setAllowProviderCall] = useState(false);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [history, setHistory] = useState<QueryHistoryItem[]>(() => loadHistory(vaultPath));
  const activeProvider = useMemo(() => providerSummary(providerCenter, language), [providerCenter, language]);
  const index = useMemo(
    () => buildSearchIndex({ status, claims, evidencePaths, reviewItems, writebacks, traceabilityWarnings, labels: relationCopy[language], language }),
    [claims, evidencePaths, language, reviewItems, status, traceabilityWarnings, writebacks],
  );

  useEffect(() => {
    setHistory(loadHistory(vaultPath));
  }, [vaultPath]);

  useEffect(() => {
    setAllowProviderCall(false);
  }, [activeProvider.providerId, activeProvider.model, activeProvider.config?.apiBaseUrl]);

  useEffect(() => {
    const nextQuestion = handoffQuestion?.trim();
    if (!nextQuestion) return;
    setQuestion(nextQuestion);
    setSearchText(nextQuestion);
    setTargetPath(handoffTargetPath?.trim() || "reviews/query-writeback/deepseek-research-insights.md");
    setSelectedResultId(null);
    setAnswerProviderResult(null);
    setAnswerProviderError(null);
    setAnswerDraft("");
  }, [handoffKey, handoffQuestion, handoffTargetPath]);

  const filteredResults = useMemo(() => filterSearchResults(index, typeFilter, searchText), [index, searchText, typeFilter]);
  const selectedResult = useMemo(
    () => filteredResults.find((item) => item.id === selectedResultId) ?? filteredResults[0] ?? null,
    [filteredResults, selectedResultId],
  );
  const answerEvidence = useMemo(() => pickAnswerEvidence(filteredResults, selectedResult), [filteredResults, selectedResult]);
  const writebackRefs = useMemo(() => index.filter((item) => item.type === "writeback").slice(0, 8), [index]);
  const hasVaultEvidence = index.length > 0;

  const rememberQuery = (
    value: string,
    options?: {
      searchText?: string;
      targetPath?: string;
      evidence?: SearchResult[];
      proposal?: QueryHistoryItem["proposal"];
    },
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const entry: QueryHistoryItem = {
      id: `${Date.now()}-${trimmed}`,
      question: trimmed,
      searchText: (options?.searchText || searchText || trimmed).trim(),
      targetPath: options?.targetPath ?? targetPath,
      evidence: toHistoryEvidence(options?.evidence ?? answerEvidence),
      proposal: options?.proposal,
      createdAt: new Date().toISOString(),
    };
    const next = [
      entry,
      ...history.filter((item) => item.question !== entry.question || item.targetPath !== entry.targetPath),
    ].slice(0, 8);
    setHistory(next);
    saveHistory(vaultPath, next);
    return entry;
  };

  const chooseQuestion = (nextQuestion: string) => {
    setQuestion(nextQuestion);
    setSearchText(nextQuestion);
    setSelectedResultId(null);
  };

  const chooseHistory = (item: QueryHistoryItem) => {
    setQuestion(item.question);
    setSearchText(item.searchText || item.question);
    setTargetPath(item.targetPath || "reviews/query-writeback/deepseek-research-insights.md");
    setSelectedResultId(item.evidence[0]?.id ?? null);
  };

  const generateDraft = async () => {
    const draftSearchText = searchText.trim() || question;
    const draftResults = filterSearchResults(index, typeFilter, draftSearchText);
    const draftSelected = draftResults.find((item) => item.id === selectedResultId) ?? draftResults[0] ?? null;
    const draftEvidence = pickAnswerEvidence(draftResults, draftSelected);
    const localDraft = buildAnswerDraft(question, targetPath, draftEvidence, language, typeLabel);
    setSearchText(draftSearchText);
    setSelectedResultId(draftSelected?.id ?? null);
    setAnswerProviderResult(null);
    setAnswerProviderError(null);
    setAnswerDraft(localDraft);
    rememberQuery(question, { searchText: draftSearchText, evidence: draftEvidence });

    if (activeProvider.canGenerate && !allowProviderCall) {
      setAnswerProviderError(text.providerConsentRequired);
      return;
    }

    const request = buildLlmAnswerRequest(activeProvider, question, targetPath, draftEvidence, language);
    if (!request) {
      if (activeProvider.unavailableReason) {
        setAnswerProviderError(activeProvider.unavailableReason);
      }
      return;
    }

    setAnswerBusy(true);
    try {
      const result = await generateLlmAnswer(vaultPath, request);
      const coverageBlock = renderAnswerCitationCoverage(answerCitationCoverage(draftEvidence), language);
      setAnswerProviderResult(result);
      setAnswerDraft(result.answer.includes("## Citation coverage")
        ? result.answer
        : `${coverageBlock}\n\n${result.answer}`);
    } catch (err) {
      setAnswerProviderError(String(err));
      setAnswerDraft(localDraft);
    } finally {
      setAnswerBusy(false);
    }
  };

  const createProposal = () => {
    const proposalTarget = targetPath.trim() || "reviews/query-writeback/deepseek-research-insights.md";
    const proposalSearchText = searchText.trim() || question;
    const proposalResults = filterSearchResults(index, typeFilter, proposalSearchText);
    const proposalSelected = proposalResults.find((item) => item.id === selectedResultId) ?? proposalResults[0] ?? null;
    const proposalEvidence = pickAnswerEvidence(proposalResults, proposalSelected);
    setSearchText(proposalSearchText);
    setTargetPath(proposalTarget);
    setSelectedResultId(proposalSelected?.id ?? null);
    setAnswerProviderResult(null);
    setAnswerProviderError(null);
    setAnswerDraft(buildAnswerDraft(question, proposalTarget, proposalEvidence, language, typeLabel));
    rememberQuery(question, {
      searchText: proposalSearchText,
      targetPath: proposalTarget,
      evidence: proposalEvidence,
      proposal: { targetPath: proposalTarget, status: "proposal_requested" },
    });
    onCreateProposal(question, proposalTarget);
  };

  const searchFromQuestion = () => {
    const query = question.trim();
    if (!query) return;
    setSearchText(query);
    setSelectedResultId(null);
  };

  const openResult = (result: SearchResult) => {
    onOpenPath(resolveVaultPath(result.path));
  };

  const copyResult = (result: SearchResult) => {
    onCopyText?.(
      "search result",
      [
        `${result.type}: ${result.title}`,
        `path: ${result.path}`,
        `snippet: ${result.snippet}`,
        result.evidence ? `evidence: ${result.evidence}` : "",
        result.relations.length ? `relations: ${result.relations.join(" | ")}` : "",
      ].filter(Boolean).join("\n"),
    );
  };

  return (
    <div className={classNames("chat-search-page chat-search-workbench", className)}>
      <section className="panel large chat-search-top">
        <div className="section-head">
          <h2>{text.title}</h2>
          <span>{text.loaded(filteredResults.length, index.length)}</span>
        </div>
        <div className="chat-search-top-grid">
          <label className="top-question-input">
            <Search size={16} />
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={text.inputPlaceholder}
            />
          </label>
          <label className="top-target-input">
            <span>{text.target}</span>
            <input
              value={targetPath}
              onChange={(event) => setTargetPath(event.target.value)}
              placeholder="reviews/query-writeback/deepseek-research-insights.md"
            />
          </label>
          <div className="top-action-grid">
            <button type="button" onClick={searchFromQuestion} disabled={!question.trim()}>
              <Search size={14} />{text.searchEvidence}
            </button>
            <button type="button" onClick={generateDraft} disabled={!vaultPath || !question.trim() || answerBusy}>
              <Lightbulb size={14} />{answerBusy ? text.generatingAnswer : text.draftAnswer}
            </button>
            <button type="button" onClick={createProposal} disabled={!vaultPath || !question.trim() || busy === "query_writeback"}>
              <GitCompare size={14} />{text.createProposal}
            </button>
          </div>
        </div>
        <div className="question-chips">
          {defaultQuestions.map((item) => (
            <button key={item} type="button" onClick={() => chooseQuestion(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="proposal-boundary chat-search-boundary">
          <strong>{text.boundaryTitle}</strong>
          <span>{text.boundaryBody}</span>
          <code>
            {text.providerLabel}: {activeProvider.name} · {activeProvider.detail}. {text.providerDraftOnly}
            {!activeProvider.canGenerate && activeProvider.unavailableReason ? ` ${text.providerNotCallable}: ${activeProvider.unavailableReason}` : ""}
          </code>
          {activeProvider.canGenerate && (
            <label className="switch-row">
              <input
                type="checkbox"
                checked={allowProviderCall}
                onChange={(event) => setAllowProviderCall(event.target.checked)}
              />
              <span>{text.providerConsent}</span>
            </label>
          )}
        </div>
      </section>

      <div className="chat-search-columns">
        <section className="panel large search-history-panel">
          <div className="section-head">
            <h2><History size={16} /> {text.history}</h2>
            <span>{history.length}</span>
          </div>
          <div className="history-list rich-history-list">
            {history.length === 0 && <p className="empty">{text.emptyHistory}</p>}
            {history.map((item) => (
              <button key={item.id} type="button" onClick={() => chooseHistory(item)}>
                <History size={14} />
                <span>{item.question}</span>
                <em>
                  {item.evidence.length} {text.evidenceCount}
                  {item.proposal ? ` · ${localizedSearchValue(item.proposal.status, language)}` : ""}
                </em>
                {item.targetPath && <code>{item.targetPath}</code>}
              </button>
            ))}
          </div>

        <div className="section-head">
          <h2>{text.results}</h2>
          <span>{filteredResults.length} {text.shown}</span>
        </div>
        <div className="search-toolbar">
          <label>
            <Search size={15} />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={text.searchPlaceholder}
            />
          </label>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as SearchFilter)}>
            <option value="all">{text.filters.all}</option>
            <option value="source">{text.filters.source}</option>
            <option value="claim">{text.filters.claim}</option>
            <option value="concept">{text.filters.concept}</option>
            <option value="note">{text.filters.note}</option>
            <option value="draft">{text.filters.draft}</option>
            <option value="review">{text.filters.review}</option>
            <option value="writeback">{text.filters.writeback}</option>
            <option value="evidence">{text.filters.evidence}</option>
            <option value="traceability">{text.filters.traceability}</option>
            <option value="report">{text.filters.report}</option>
            <option value="inbox">{text.filters.inbox}</option>
          </select>
        </div>
        <div className="search-results">
          {!hasVaultEvidence && <p className="empty">{text.noVault}</p>}
          {hasVaultEvidence && filteredResults.length === 0 && <p className="empty">{text.noMatch}</p>}
          {filteredResults.map((result) => (
            <article
              className={classNames("search-result-card", selectedResult?.id === result.id && "selected")}
              key={result.id}
              onClick={() => setSelectedResultId(result.id)}
            >
              <span className={classNames("status-chip", result.severity || result.status || result.type)}>
                {resultStatusLabel(result)}
              </span>
              <div className="search-result-body">
                <strong>{result.title}</strong>
                <em>{typeLabel(result.type)} · {result.path}</em>
                <p>{result.snippet || text.noSnippet}</p>
                {result.evidence && <code>{result.evidence}</code>}
                <div className="relation-list">
                  {result.relations.slice(0, 8).map((item) => (
                    <span key={`${result.id}-${item}`}>{item}</span>
                  ))}
                </div>
                <div className="inline-actions">
                  <button type="button" onClick={() => openResult(result)}><FolderOpen size={14} />{text.actions.open}</button>
                  <button type="button" onClick={() => onOpenVaultItem?.(result.path)} disabled={!onOpenVaultItem || !isMarkdownPath(result.path)}>
                    <SquareStack size={14} />{text.actions.obsidian}
                  </button>
                  <button type="button" onClick={() => onRevealPath?.(resolveVaultPath(result.path))} disabled={!onRevealPath}><FileSearch size={14} />{text.actions.reveal}</button>
                  <button type="button" onClick={() => onCopyText?.("path", result.path)} disabled={!onCopyText}><ClipboardCopy size={14} />{text.actions.path}</button>
                  <button type="button" onClick={() => copyResult(result)} disabled={!onCopyText}><ClipboardCopy size={14} />{text.actions.evidence}</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel large research-chat-panel answer-workspace-panel">
        <div className="section-head">
          <h2>{text.answer}</h2>
          <span>{text.answerKinds}</span>
        </div>

        <div className="selected-result-panel">
          <div className="section-head compact">
            <h3>{text.selected}</h3>
            <span>{selectedResult ? typeLabel(selectedResult.type) : text.none}</span>
          </div>
          {selectedResult ? (
            <div className="selected-result-detail">
              <strong>{selectedResult.title}</strong>
              <em>{selectedResult.path}</em>
              <p>{selectedResult.snippet || text.noSnippet}</p>
              {selectedResult.evidence && <code>{selectedResult.evidence}</code>}
              <div className="relation-list">
                {selectedResult.relations.slice(0, 10).map((item) => (
                  <span key={`selected-${selectedResult.id}-${item}`}>{item}</span>
                ))}
              </div>
              <div className="inline-actions">
                <button type="button" onClick={() => openResult(selectedResult)}><FolderOpen size={14} />{text.actions.open}</button>
                <button type="button" onClick={() => onRevealPath?.(resolveVaultPath(selectedResult.path))} disabled={!onRevealPath}><FileSearch size={14} />{text.actions.reveal}</button>
                <button type="button" onClick={() => onCopyText?.("path", selectedResult.path)} disabled={!onCopyText}><ClipboardCopy size={14} />{text.actions.path}</button>
                <button type="button" onClick={() => copyResult(selectedResult)} disabled={!onCopyText}><ClipboardCopy size={14} />{text.actions.evidence}</button>
              </div>
            </div>
          ) : (
            <p className="empty">{text.selectResult}</p>
          )}
        </div>

        <div className="answer-action-row">
          <button type="button" onClick={generateDraft} disabled={!vaultPath || !question.trim() || answerBusy}>
            <Lightbulb size={14} />{answerBusy ? text.generatingAnswer : text.draftAnswer}
          </button>
          <button type="button" onClick={createProposal} disabled={!vaultPath || !question.trim() || busy === "query_writeback"}>
            <GitCompare size={14} />{text.createProposal}
          </button>
          <button type="button" onClick={() => onCopyText?.("answer draft", answerDraft)} disabled={!answerDraft || !onCopyText}>
            <ClipboardCopy size={14} />{text.copyDraft}
          </button>
        </div>

        {(answerProviderResult || answerProviderError) && (
          <div className={classNames("model-answer-status", answerProviderError && "warning")}>
            {answerProviderResult ? (
              <span>
                {text.providerGenerated}: {answerProviderResult.providerName} · {answerProviderResult.model} · {answerProviderResult.evidenceCount} {text.references}
              </span>
            ) : (
              <span>{text.providerFallback}: {answerProviderError}</span>
            )}
          </div>
        )}

        <div className="chat-answer-draft">
          <AnswerMarkdown content={answerDraft} placeholder={text.draftPlaceholder} onOpenVaultItem={onOpenVaultItem} />
        </div>
      </section>

      <section className="panel large evidence-reference-panel">
        <div className="section-head">
          <h2>{text.evidenceMap}</h2>
          <span>{answerEvidence.length} {text.references}</span>
        </div>

        <div className="answer-evidence-map">
          <div className="section-head compact">
            <h3>{text.currentEvidence}</h3>
            <span>{answerEvidence.length} {text.selectedCount}</span>
          </div>
          <div className="evidence-pill-grid">
            {answerEvidence.length === 0 && <p className="empty">{text.evidenceEmpty}</p>}
            {answerEvidence.map((item, index) => (
              <button key={`evidence-map-${item.id}`} type="button" onClick={() => openResult(item)}>
                <span>E{index + 1}</span>
                <strong>{item.title}</strong>
                <em>{typeLabel(item.type)} · {localizedSearchValue(item.status || text.loadedStatus, language)}</em>
              </button>
            ))}
          </div>
        </div>

        <div className="reference-list">
          {answerEvidence.map((item, index) => (
            <article key={`reference-${item.id}`}>
              <span>E{index + 1}</span>
              <strong>{item.title}</strong>
              <em>{typeLabel(item.type)} · {item.path}</em>
              <p>{item.evidence || item.snippet || text.noEvidenceQuote}</p>
              <div className="inline-actions">
                <button type="button" onClick={() => openResult(item)}><FolderOpen size={14} />{text.actions.open}</button>
                <button type="button" onClick={() => onRevealPath?.(resolveVaultPath(item.path))} disabled={!onRevealPath}><FileSearch size={14} />{text.actions.reveal}</button>
                <button type="button" onClick={() => copyResult(item)} disabled={!onCopyText}><ClipboardCopy size={14} />{text.actions.copy}</button>
              </div>
            </article>
          ))}
        </div>

        <div className="recent-query-panel proposal-reference-panel">
          <div className="section-head compact">
            <h3><GitCompare size={15} /> {text.writebackProposals}</h3>
            <span>{writebackRefs.length}</span>
          </div>
          <div className="proposal-ref-list">
            {writebackRefs.length === 0 && <p className="empty">{text.noProposals}</p>}
            {writebackRefs.map((proposal) => (
              <button
                key={`proposal-ref-${proposal.id}`}
                type="button"
                onClick={() => {
                  setTypeFilter("all");
                  setSearchText("");
                  setSelectedResultId(proposal.id);
                }}
              >
                <GitCompare size={14} />
                <span>{proposal.title}</span>
                <em>{localizedSearchValue(proposal.status || text.proposalFallback, language)} · {proposal.path}</em>
              </button>
            ))}
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}
