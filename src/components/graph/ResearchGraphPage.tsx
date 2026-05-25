import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, FolderOpen, GitCompare, Maximize, Network, RotateCcw, Search, ShieldAlert, SquareStack, ZoomIn, ZoomOut } from "lucide-react";
import type { UiLanguage } from "../../i18n";
import type {
  ClaimLedgerItem,
  DesktopRegistryEntry,
  EvidencePathItem,
  ReviewQueueItem,
  TraceabilityWarning,
  VaultFile,
  VaultStatus,
  WritebackProposal,
} from "../../types";

type ResearchNodeType = "source" | "claim" | "concept" | "review" | "proposal" | "warning";
type ResearchEdgeType =
  | "source_claim"
  | "claim_concept"
  | "claim_review"
  | "wikilink"
  | "proposal_target"
  | "warning_claim"
  | "warning_source";

type ResearchGraphNode = {
  id: string;
  type: ResearchNodeType;
  label: string;
  subtitle?: string;
  body?: string;
  path?: string | null;
  status?: string | null;
  severity?: string | null;
  metrics?: Record<string, string | number>;
};

type ResearchGraphEdge = {
  id: string;
  from: string;
  to: string;
  type: ResearchEdgeType;
  label: string;
  status?: string | null;
};

type ResearchGraphCommunity = {
  id: string;
  size: number;
  edgeCount: number;
  density: number;
  types: Partial<Record<ResearchNodeType, number>>;
  labels: string[];
};

type ResearchGraph = {
  nodes: ResearchGraphNode[];
  edges: ResearchGraphEdge[];
  summary: {
    sourcesPapers: number;
    keyConcepts: ResearchGraphNode[];
    reviewNodes: number;
    traceabilityBreaks: number;
    writebackInsights: number;
    sourceBackedClaims: number;
    communities: ResearchGraphCommunity[];
    largestCommunity?: ResearchGraphCommunity;
    lowConnectionNodes: number;
    sparseCommunities: number;
  };
};

type ResearchGraphPageProps = {
  className?: string;
  language?: UiLanguage;
  vaultPath: string;
  status: VaultStatus | null;
  registry: DesktopRegistryEntry[];
  claims: ClaimLedgerItem[];
  evidencePaths: EvidencePathItem[];
  reviewItems: ReviewQueueItem[];
  writebacks: WritebackProposal[];
  traceabilityWarnings: TraceabilityWarning[];
  onOpenPath: (path: string) => void;
  onRevealPath: (path: string) => void;
  onCopyText: (label: string, text?: string | null) => void;
  onOpenObsidian: () => void;
  onOpenSources: () => void;
  onPlanIngest: () => void;
  onRunPipeline: () => void;
  resolveVaultPath: (path?: string | null) => string;
};

const nodeTypes: Array<ResearchNodeType | "all"> = [
  "all",
  "source",
  "claim",
  "concept",
  "review",
  "proposal",
  "warning",
];

const edgeTypes: Array<ResearchEdgeType | "all"> = [
  "all",
  "source_claim",
  "claim_concept",
  "claim_review",
  "wikilink",
  "proposal_target",
  "warning_claim",
  "warning_source",
];

const VISUAL_NODE_LIMIT = 96;
const VISUAL_EDGE_LIMIT = 120;
const GRAPH_VIEWBOX = { width: 860, height: 360, centerX: 430, centerY: 180 };
const GRAPH_ZOOM_MIN = 1;
const GRAPH_ZOOM_MAX = 2.2;
const GRAPH_ZOOM_STEP = 0.25;

const graphCopy = {
  zh: {
    summaryStats: {
      sources: "资料 / 论文",
      sourceBackedClaims: "有资料支撑的论断",
      keyConcepts: "关键概念",
      reviewNodes: "审核节点",
      traceabilityBreaks: "证据断点",
      writebackInsights: "写回提案",
    },
    researchSummary: "证据图谱摘要",
    vaultSummary: "该证据图谱连接当前知识库中的资料、论断、概念、审核、可追踪性警告和写回提案。",
    noVaultSummary: "打开已生成的知识库后即可构建证据图谱。",
    keyConcepts: "关键概念",
    knowledgeClusters: "知识簇",
    largestCluster: "最大簇",
    noCluster: "暂无知识簇",
    clusterHealth: (lowConnectionNodes: number, sparseCommunities: number) =>
      `${lowConnectionNodes} 个低连接节点 · ${sparseCommunities} 个低密度簇`,
    noneYet: "暂未生成",
    evidenceBreaks: "证据断点",
    noneSurfaced: "暂无",
    knowledgeGaps: "知识缺口",
    knowledgeGapDetail: (orphanConcepts: number, lowSynthesisConcepts: number) =>
      `${orphanConcepts} 个孤立概念，${lowSynthesisConcepts} 个低综合概念`,
    knowledgeGapClear: "暂无孤立或低综合概念",
    noReadingQuality: "尚未生成阅读质量报告",
    readingQualityReport: "打开阅读质量报告",
    searchPlaceholder: "搜索节点、路径、论断、概念、提案目标和警告文本",
    nodeType: "节点类型",
    edgeType: "边类型",
    relationshipMap: "证据图谱",
    nodeDetails: "节点详情",
    noGraphNodes: "当前筛选下没有图谱节点。",
    noGraphDataTitle: "图谱还没有可连接的节点",
    noGraphDataBody: "先让资料、论断或概念进入当前知识库，再回到图谱检查关系。",
    noGraphDataSources: "查看资料",
    noGraphDataPlan: "刷新计划",
    noGraphDataPipeline: "运行流程",
    resetGraphFilters: "清除筛选",
    zoomIn: "放大图谱",
    zoomOut: "缩小图谱",
    resetZoom: "重置图谱缩放",
    limitHint: (visibleNodes: number, totalNodes: number, visibleEdges: number, totalEdges: number) =>
      `画布为性能只显示前 ${visibleNodes}/${totalNodes} 个节点和 ${visibleEdges}/${totalEdges} 条边；请用搜索或筛选缩小证据图谱。`,
    open: "打开",
    reveal: "显示",
    copy: "复制",
    relatedEdges: "关联边",
    noRelatedEdges: "该节点暂无关联边。",
    nodeList: "节点列表",
    edgeList: "边列表",
    noNodesMatch: "没有节点匹配当前筛选。",
    noEdgesMatch: "没有边匹配当前筛选。",
    evidenceBreakLocator: "证据断点定位",
    noTraceabilityWarnings: "暂无可追踪性警告。",
    conceptSourceLocator: "概念来源定位",
    noConceptRelationships: "暂无概念关系。",
    relationships: "条关系",
    writebackInsightTargets: "写回提案目标",
    noWritebacks: "暂无问答写回提案。",
    graphContract: "证据图谱契约",
    sourceToClaim: "资料 -> 论断：资料登记、论断台账、证据路径",
    claimToConcept: "论断 -> 概念：论断概念标签和证据概念",
    claimToReview: "论断 -> 审核：审核队列和待审核论断",
    proposalToTarget: "提案 -> 目标：问答写回目标页面",
    wikiLink: "Wiki 链接：Obsidian [[wikilink]] 页面关系",
    warningToClaim: "警告 -> 论断/资料：可追踪性警告",
    nodes: "个节点",
    edges: "条边",
    linked: "已连接",
    sourceUnknown: "资料未知",
    conceptTag: "概念标签",
    nodeTypes: {
      all: "全部",
      source: "资料",
      claim: "论断",
      concept: "概念",
      review: "审核",
      proposal: "提案",
      warning: "警告",
    } satisfies Record<ResearchNodeType | "all", string>,
    edgeTypes: {
      all: "全部边",
      source_claim: "资料 -> 论断",
      claim_concept: "论断 -> 概念",
      claim_review: "论断 -> 审核",
      wikilink: "Wiki 链接",
      proposal_target: "提案 -> 目标",
      warning_claim: "警告 -> 论断",
      warning_source: "警告 -> 资料",
    } satisfies Record<ResearchEdgeType | "all", string>,
  },
  en: {
    summaryStats: {
      sources: "Sources / papers",
      sourceBackedClaims: "Source-backed claims",
      keyConcepts: "Key concepts",
      reviewNodes: "Review nodes",
      traceabilityBreaks: "Traceability breaks",
      writebackInsights: "Writeback proposals",
    },
    researchSummary: "Evidence Graph summary",
    vaultSummary: "This graph links generated sources, claims, concepts, reviews, traceability warnings, and writeback proposals from the selected vault.",
    noVaultSummary: "Open a generated vault to build the Evidence Graph.",
    keyConcepts: "Key concepts",
    knowledgeClusters: "Knowledge clusters",
    largestCluster: "Largest cluster",
    noCluster: "No clusters yet",
    clusterHealth: (lowConnectionNodes: number, sparseCommunities: number) =>
      `${lowConnectionNodes} low-link nodes · ${sparseCommunities} sparse clusters`,
    noneYet: "none yet",
    evidenceBreaks: "Evidence breaks",
    noneSurfaced: "none surfaced",
    knowledgeGaps: "Knowledge gaps",
    knowledgeGapDetail: (orphanConcepts: number, lowSynthesisConcepts: number) =>
      `${orphanConcepts} orphan concepts, ${lowSynthesisConcepts} low-synthesis concepts`,
    knowledgeGapClear: "No orphan or low-synthesis concepts",
    noReadingQuality: "Reading quality report has not been generated",
    readingQualityReport: "Open reading quality report",
    searchPlaceholder: "Search nodes, paths, claims, concepts, proposal targets, and warning text",
    nodeType: "Node type",
    edgeType: "Edge type",
    relationshipMap: "Evidence Graph",
    nodeDetails: "Node details",
    noGraphNodes: "No graph node matches the current filter.",
    noGraphDataTitle: "No connected graph nodes yet",
    noGraphDataBody: "Bring sources, claims, or concepts into the selected vault, then return here to inspect relationships.",
    noGraphDataSources: "View sources",
    noGraphDataPlan: "Refresh plan",
    noGraphDataPipeline: "Run pipeline",
    resetGraphFilters: "Clear filters",
    zoomIn: "Zoom graph in",
    zoomOut: "Zoom graph out",
    resetZoom: "Reset graph zoom",
    limitHint: (visibleNodes: number, totalNodes: number, visibleEdges: number, totalEdges: number) =>
      `Canvas is performance-limited to the first ${visibleNodes}/${totalNodes} nodes and ${visibleEdges}/${totalEdges} edges; use search or filters to narrow the Evidence Graph.`,
    open: "open",
    reveal: "reveal",
    copy: "copy",
    relatedEdges: "Related edges",
    noRelatedEdges: "No edges connected to this node.",
    nodeList: "Node list",
    edgeList: "Edge list",
    noNodesMatch: "No nodes match this filter.",
    noEdgesMatch: "No edges match this filter.",
    evidenceBreakLocator: "Evidence break locator",
    noTraceabilityWarnings: "No traceability warnings surfaced.",
    conceptSourceLocator: "Concept source locator",
    noConceptRelationships: "No concept relationships yet.",
    relationships: "relationships",
    writebackInsightTargets: "Writeback proposal targets",
    noWritebacks: "No query writeback proposals yet.",
    graphContract: "Evidence Graph contract",
    sourceToClaim: "source -> claim: source registry, claim ledger, evidence paths",
    claimToConcept: "claim -> concept: claim concept tags and evidence concepts",
    claimToReview: "claim -> review: review queue and needs-review claims",
    proposalToTarget: "proposal -> target: query writeback target page",
    wikiLink: "wiki link: Obsidian [[wikilink]] page relationships",
    warningToClaim: "warning -> claim/source: traceability warnings",
    nodes: "nodes",
    edges: "edges",
    linked: "linked",
    sourceUnknown: "source unknown",
    conceptTag: "concept tag",
    nodeTypes: {
      all: "All",
      source: "Sources",
      claim: "Claims",
      concept: "Concepts",
      review: "Reviews",
      proposal: "Proposals",
      warning: "Warnings",
    } satisfies Record<ResearchNodeType | "all", string>,
    edgeTypes: {
      all: "All edges",
      source_claim: "Source -> Claim",
      claim_concept: "Claim -> Concept",
      claim_review: "Claim -> Review",
      wikilink: "Wiki link",
      proposal_target: "Proposal -> Target",
      warning_claim: "Warning -> Claim",
      warning_source: "Warning -> Source",
    } satisfies Record<ResearchEdgeType | "all", string>,
  },
} as const;

const typeOrder: Record<ResearchNodeType, number> = {
  warning: 0,
  source: 0,
  claim: 1,
  concept: 2,
  review: 3,
  proposal: 3,
};

const typeColors: Record<ResearchNodeType, string> = {
  source: "#245b93",
  claim: "#6d4fb0",
  concept: "#1f6f45",
  review: "#a04d1d",
  proposal: "#6d5f2a",
  warning: "#a43131",
};

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function compact(value?: string | null, max = 96) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}...`;
}

function key(value?: string | null) {
  return encodeURIComponent((value || "unknown").trim().toLowerCase());
}

function basename(path?: string | null) {
  if (!path) return "";
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function labelFromPath(path?: string | null) {
  return basename(path).replace(/\.(md|markdown|txt|pdf|jsonl)$/i, "") || "untitled";
}

function sourceIdFromPath(path?: string | null) {
  const match = labelFromPath(path).match(/^LLM-\d{4}$/i);
  return match ? match[0].toUpperCase() : null;
}

function relativeVaultPath(vaultPath?: string | null, path?: string | null) {
  if (!vaultPath || !path) return null;
  const normalizedVault = vaultPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedPath = path.replace(/\\/g, "/");
  if (normalizedPath === normalizedVault) return "";
  const prefix = `${normalizedVault}/`;
  return normalizedPath.startsWith(prefix) ? normalizedPath.slice(prefix.length) : null;
}

function sourceNodeLabel(existing: string | undefined, next: string) {
  if (!existing) return next;
  if (/^LLM-\d{4}$/i.test(existing) && next && next !== existing) return next;
  return existing;
}

function stripMarkdownExtension(value?: string | null) {
  return (value || "").replace(/\\/g, "/").replace(/\.(md|markdown)$/i, "");
}

function normalizedPageAlias(value?: string | null) {
  return stripMarkdownExtension(value)
    .replace(/^\.?\//, "")
    .trim()
    .toLowerCase();
}

function pageAliasValues(path?: string | null, title?: string | null, name?: string | null) {
  const cleanedPath = stripMarkdownExtension(path);
  const base = labelFromPath(path);
  return [path, cleanedPath, base, title, name]
    .map(normalizedPageAlias)
    .filter((item): item is string => Boolean(item));
}

function wikilinkTargetAliases(value?: string | null) {
  const target = stripMarkdownExtension((value || "").split("|")[0]?.split("#")[0]);
  const withConcept = target && !target.includes("/") ? `concepts/${target}` : target;
  const withSource = target && !target.includes("/") ? `sources/${target}` : target;
  return [target, withConcept, withSource, labelFromPath(target)]
    .map(normalizedPageAlias)
    .filter((item): item is string => Boolean(item));
}

function upsertNode(nodes: Map<string, ResearchGraphNode>, node: ResearchGraphNode) {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, node);
    return node;
  }
  nodes.set(node.id, {
    ...existing,
    ...node,
    label: existing.type === "source" || node.type === "source"
      ? sourceNodeLabel(existing.label, node.label)
      : existing.label || node.label,
    subtitle: existing.subtitle || node.subtitle,
    body: existing.body || node.body,
    path: existing.path || node.path,
    status: existing.status || node.status,
    severity: existing.severity || node.severity,
    metrics: { ...node.metrics, ...existing.metrics },
  });
  return nodes.get(node.id)!;
}

function addAlias(aliases: Map<string, string>, nodeId: string, ...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (value) aliases.set(value, nodeId);
  }
}

function addPageAliases(aliases: Map<string, string>, nodeId: string, ...values: Array<string | null | undefined>) {
  for (const value of values) {
    for (const alias of pageAliasValues(value)) {
      aliases.set(alias, nodeId);
    }
  }
}

function addEdge(edges: Map<string, ResearchGraphEdge>, edge: ResearchGraphEdge) {
  if (edge.from === edge.to) return;
  edges.set(edge.id, edge);
}

function graphCommunities(nodes: ResearchGraphNode[], edges: ResearchGraphEdge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  const edgePairs = new Set<string>();

  for (const edge of edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) continue;
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
    edgePairs.add([edge.from, edge.to].sort().join("\u0000"));
  }

  const visited = new Set<string>();
  const components: Array<Omit<ResearchGraphCommunity, "id">> = [];

  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const queue = [node.id];
    const ids: string[] = [];
    visited.add(node.id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      ids.push(current);
      for (const next of adjacency.get(current) || []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }

    const componentNodes = ids
      .map((id) => nodeById.get(id))
      .filter((item): item is ResearchGraphNode => Boolean(item))
      .sort((a, b) => typeOrder[a.type] - typeOrder[b.type] || a.label.localeCompare(b.label));
    const componentIds = new Set(componentNodes.map((item) => item.id));
    const edgeCount = Array.from(edgePairs).filter((pair) => {
      const [from, to] = pair.split("\u0000");
      return componentIds.has(from) && componentIds.has(to);
    }).length;
    const possibleEdges = componentNodes.length > 1 ? (componentNodes.length * (componentNodes.length - 1)) / 2 : 0;
    const density = possibleEdges > 0 ? edgeCount / possibleEdges : 0;
    const types = componentNodes.reduce<Partial<Record<ResearchNodeType, number>>>((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {});

    components.push({
      size: componentNodes.length,
      edgeCount,
      density,
      types,
      labels: componentNodes.slice(0, 4).map((item) => item.label),
    });
  }

  return components
    .sort((a, b) => b.size - a.size || b.edgeCount - a.edgeCount || a.labels.join(" ").localeCompare(b.labels.join(" ")))
    .map((component, index) => ({ ...component, id: `cluster-${index + 1}` }));
}

function claimNodeId(claimId: string) {
  return `claim:${key(claimId)}`;
}

function conceptNodeId(value: string) {
  return `concept:${key(value)}`;
}

function reviewNodeId(value: string) {
  return `review:${key(value)}`;
}

function sourceNodeId(value: string) {
  return `source:${key(value)}`;
}

function warningNodeId(value: string) {
  return `warning:${key(value)}`;
}

function proposalNodeId(value: string) {
  return `proposal:${key(value)}`;
}

export function buildResearchGraph(input: {
  status: VaultStatus | null;
  registry: DesktopRegistryEntry[];
  claims: ClaimLedgerItem[];
  evidencePaths: EvidencePathItem[];
  reviewItems: ReviewQueueItem[];
  writebacks: WritebackProposal[];
  traceabilityWarnings: TraceabilityWarning[];
}): ResearchGraph {
  const nodes = new Map<string, ResearchGraphNode>();
  const edges = new Map<string, ResearchGraphEdge>();
  const sourceAliases = new Map<string, string>();
  const conceptAliases = new Map<string, string>();
  const pageAliases = new Map<string, string>();
  const fileNodeIds = new Map<string, string>();

  const ensureFileNode = (file: VaultFile) => {
    if (file.kind === "source") {
      const fileSourceId = file.sourceId || sourceIdFromPath(file.name) || sourceIdFromPath(file.path);
      const fileRelPath = relativeVaultPath(input.status?.path, file.path);
      const alias = [fileSourceId, fileRelPath, file.path, file.title, file.name].find((item) => item && sourceAliases.has(item));
      const id = alias ? sourceAliases.get(alias!)! : sourceNodeId(fileSourceId || fileRelPath || file.path);
      upsertNode(nodes, {
        id,
        type: "source",
        label: file.title || fileSourceId || file.name || labelFromPath(file.path),
        subtitle: file.path,
        path: file.path,
        status: file.status,
      });
      fileNodeIds.set(file.path, id);
      addAlias(sourceAliases, id, fileSourceId, fileRelPath, file.path, file.title, file.name, labelFromPath(file.path));
      addPageAliases(pageAliases, id, file.path, file.title, file.name, labelFromPath(file.path));
      return id;
    }

    const isConcept = file.kind === "concept";
    const isReport = file.kind === "report";
    const id = isConcept ? conceptNodeId(file.path) : isReport ? reviewNodeId(file.path) : sourceNodeId(file.path);
    upsertNode(nodes, {
      id,
      type: isConcept ? "concept" : isReport ? "review" : "source",
      label: file.title || file.name || labelFromPath(file.path),
      subtitle: file.path,
      path: file.path,
      status: file.status,
    });
    fileNodeIds.set(file.path, id);
    addPageAliases(pageAliases, id, file.path, file.title, file.name, labelFromPath(file.path));
    if (isConcept) {
      addAlias(conceptAliases, id, file.path, file.title, file.name, labelFromPath(file.path));
    } else if (!isReport) {
      addAlias(sourceAliases, id, file.path, file.title, file.name);
    }
    return id;
  };

  for (const entry of input.registry) {
    const stableKey = entry.sourceId || entry.sourceUuid || entry.sourcePage || entry.sourcePath || entry.rawPath;
    const id = sourceNodeId(stableKey);
    upsertNode(nodes, {
      id,
      type: "source",
      label: entry.sourceId || labelFromPath(entry.sourcePage || entry.sourcePath),
      subtitle: entry.sourcePage || entry.sourcePath,
      path: entry.sourcePage || entry.artifactPath || entry.sourcePath || entry.rawPath,
      status: entry.status,
      metrics: { parser: entry.parser || "unknown" },
    });
    addAlias(sourceAliases, id, entry.sourceId, entry.sourceUuid, entry.sourcePage, entry.sourcePath, entry.rawPath, entry.canonicalPath);
    addPageAliases(pageAliases, id, entry.sourcePage, entry.sourceId, entry.sourcePath, entry.rawPath);
  }

  for (const file of input.status?.files ?? []) {
    if (file.kind === "source" || file.kind === "concept" || file.kind === "report") {
      ensureFileNode(file);
    }
  }

  const ensureSource = (value?: string | null, fallbackPath?: string | null) => {
    const alias = [value, fallbackPath].find((item) => item && sourceAliases.has(item));
    if (alias) return sourceAliases.get(alias!)!;
    const sourceValue = value || fallbackPath;
    if (!sourceValue) return null;
    const id = sourceNodeId(sourceValue);
    upsertNode(nodes, {
      id,
      type: "source",
      label: value || labelFromPath(fallbackPath),
      subtitle: fallbackPath || value || undefined,
      path: fallbackPath || null,
      status: "referenced",
    });
    addAlias(sourceAliases, id, value, fallbackPath);
    return id;
  };

  const ensureConcept = (value?: string | null) => {
    if (!value) return null;
    if (conceptAliases.has(value)) return conceptAliases.get(value)!;
    const id = conceptNodeId(value);
    upsertNode(nodes, {
      id,
      type: "concept",
      label: labelFromPath(value) || value,
      subtitle: value.startsWith("concepts/") ? value : "claim concept tag",
      path: value.startsWith("concepts/") ? value : null,
      status: "referenced",
    });
    addAlias(conceptAliases, id, value, labelFromPath(value));
    addPageAliases(pageAliases, id, value, labelFromPath(value));
    return id;
  };

  const resolveWikilinkTarget = (value: string) => {
    for (const alias of wikilinkTargetAliases(value)) {
      const nodeId = pageAliases.get(alias);
      if (nodeId) return { nodeId, resolved: true };
    }
    const conceptId = ensureConcept(value);
    return conceptId ? { nodeId: conceptId, resolved: false } : null;
  };

  for (const file of input.status?.files ?? []) {
    if (file.kind === "inbox" || !file.outboundLinks?.length) continue;
    const fromId = fileNodeIds.get(file.path) || ensureFileNode(file);
    for (const link of file.outboundLinks) {
      const target = resolveWikilinkTarget(link);
      if (!target) continue;
      addEdge(edges, {
        id: `wikilink:${fromId}:${target.nodeId}:${key(link)}`,
        from: fromId,
        to: target.nodeId,
        type: "wikilink",
        label: "wikilink",
        status: target.resolved ? "linked" : "unresolved",
      });
    }
  }

  for (const claim of input.claims) {
    const claimId = claimNodeId(claim.claimId);
    upsertNode(nodes, {
      id: claimId,
      type: "claim",
      label: claim.claimText || claim.claimId,
      subtitle: claim.sourceId || claim.sourceUuid || claim.sourcePath || `line ${claim.line}`,
      path: "claims/claims.jsonl",
      status: claim.verdict || claim.status,
      metrics: {
        needsReview: claim.needsReview ? "yes" : "no",
        evidence: claim.evidenceHash || claim.evidenceQuote ? "present" : "missing",
      },
    });

    const sourceId = ensureSource(claim.sourceId || claim.sourceUuid, claim.sourcePath);
    if (sourceId) {
      addEdge(edges, {
        id: `source-claim:${sourceId}:${claimId}`,
        from: sourceId,
        to: claimId,
        type: "source_claim",
        label: "supports claim",
        status: claim.verdict || claim.status,
      });
    }

    for (const concept of claim.concepts ?? []) {
      const conceptId = ensureConcept(concept);
      if (conceptId) {
        addEdge(edges, {
          id: `claim-concept:${claimId}:${conceptId}`,
          from: claimId,
          to: conceptId,
          type: "claim_concept",
          label: "feeds concept",
          status: claim.verdict || claim.status,
        });
      }
    }

    if (claim.needsReview || claim.status === "needs_review" || claim.verdict === "needs_review") {
      const reviewId = reviewNodeId(`claim:${claim.claimId}`);
      upsertNode(nodes, {
        id: reviewId,
        type: "review",
        label: `Review ${claim.claimId}`,
        subtitle: "claim needs review",
        path: "claims/claims.jsonl",
        status: "needs_review",
      });
      addEdge(edges, {
        id: `claim-review:${claimId}:${reviewId}`,
        from: claimId,
        to: reviewId,
        type: "claim_review",
        label: "requires review",
        status: "needs_review",
      });
    }
  }

  for (const item of input.evidencePaths) {
    const claimId = claimNodeId(item.claimId);
    upsertNode(nodes, {
      id: claimId,
      type: "claim",
      label: item.claimText || item.claimId,
      subtitle: item.sourceId || item.sourceUuid || item.sourcePage || "evidence path",
      path: "claims/claims.jsonl",
      status: item.chainStatus,
      metrics: { missing: item.missing.join(", ") || "none" },
    });
    const sourceId = ensureSource(item.sourceId || item.sourceUuid, item.sourcePage || item.rawPath);
    if (sourceId) {
      addEdge(edges, {
        id: `evidence-source-claim:${sourceId}:${claimId}`,
        from: sourceId,
        to: claimId,
        type: "source_claim",
        label: "evidence path",
        status: item.chainStatus,
      });
    }
    const conceptId = ensureConcept(item.concept);
    if (conceptId) {
      addEdge(edges, {
        id: `evidence-claim-concept:${claimId}:${conceptId}`,
        from: claimId,
        to: conceptId,
        type: "claim_concept",
        label: "evidence concept",
        status: item.chainStatus,
      });
    }
  }

  for (const review of input.reviewItems) {
    const reviewId = reviewNodeId(review.itemId);
    upsertNode(nodes, {
      id: reviewId,
      type: "review",
      label: review.title || review.itemId,
      subtitle: `${review.kind} · ${review.status}`,
      body: review.body,
      path: review.targetPath || review.evidencePath || null,
      status: review.status,
      severity: review.severity,
    });
    if (review.claimId) {
      const claimId = claimNodeId(review.claimId);
      addEdge(edges, {
        id: `claim-review:${claimId}:${reviewId}`,
        from: claimId,
        to: reviewId,
        type: "claim_review",
        label: "review item",
        status: review.status,
      });
    }
  }

  for (const proposal of input.writebacks) {
    const proposalId = proposalNodeId(proposal.proposalId);
    upsertNode(nodes, {
      id: proposalId,
      type: "proposal",
      label: proposal.title || proposal.proposalId,
      subtitle: `${proposal.status} · ${proposal.targetPath}`,
      path: proposal.targetPath,
      status: proposal.status,
      metrics: { updated: proposal.updatedAt },
    });

    const targetId = proposal.targetPath.startsWith("concepts/")
      ? ensureConcept(proposal.targetPath)
      : reviewNodeId(`target:${proposal.targetPath}`);
    if (targetId && proposal.targetPath.startsWith("reviews/")) {
      upsertNode(nodes, {
        id: targetId,
        type: "review",
        label: labelFromPath(proposal.targetPath),
        subtitle: "query writeback target",
        path: proposal.targetPath,
        status: proposal.status,
      });
    }
    if (targetId) {
      addEdge(edges, {
        id: `proposal-target:${proposalId}:${targetId}`,
        from: proposalId,
        to: targetId,
        type: "proposal_target",
        label: proposal.targetPath.startsWith("concepts/") ? "targets concept" : "targets review artifact",
        status: proposal.status,
      });
    }
  }

  for (const warning of input.traceabilityWarnings) {
    const warningId = warningNodeId(warning.warningId);
    upsertNode(nodes, {
      id: warningId,
      type: "warning",
      label: warning.summary || warning.missingAnchor || warning.warningId,
      subtitle: `${warning.severity} · ${warning.claimId}`,
      body: warning.nextAction || warning.suggestedAction,
      path: warning.claimPath,
      status: warning.severity,
      severity: warning.severity,
    });
    const claimId = claimNodeId(warning.claimId);
    upsertNode(nodes, {
      id: claimId,
      type: "claim",
      label: warning.claimText || warning.claimId,
      subtitle: warning.sourceId || warning.sourcePath || "traceability warning",
      path: warning.claimPath,
      status: "broken",
      severity: warning.severity,
    });
    addEdge(edges, {
      id: `warning-claim:${warningId}:${claimId}`,
      from: warningId,
      to: claimId,
      type: "warning_claim",
      label: "flags claim",
      status: warning.severity,
    });
    const sourceId = ensureSource(warning.sourceId, warning.sourcePath);
    if (sourceId) {
      addEdge(edges, {
        id: `warning-source:${warningId}:${sourceId}`,
        from: warningId,
        to: sourceId,
        type: "warning_source",
        label: "breaks source trace",
        status: warning.severity,
      });
    }
  }

  const graphNodes = Array.from(nodes.values()).sort((a, b) =>
    typeOrder[a.type] - typeOrder[b.type] || a.label.localeCompare(b.label),
  );
  const graphEdges = Array.from(edges.values()).filter((edge) => nodes.has(edge.from) && nodes.has(edge.to));
  const degree = new Map<string, number>();
  for (const edge of graphEdges) {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  }
  const keyConcepts = graphNodes
    .filter((node) => node.type === "concept")
    .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || a.label.localeCompare(b.label))
    .slice(0, 5);
  const communities = graphCommunities(graphNodes, graphEdges);

  return {
    nodes: graphNodes,
    edges: graphEdges,
    summary: {
      sourcesPapers: graphNodes.filter((node) => node.type === "source").length,
      keyConcepts,
      reviewNodes: graphNodes.filter((node) => node.type === "review").length,
      traceabilityBreaks: graphNodes.filter((node) => node.type === "warning").length,
      writebackInsights: graphNodes.filter((node) => node.type === "proposal").length,
      sourceBackedClaims: graphEdges.filter((edge) => edge.type === "source_claim").length,
      communities,
      largestCommunity: communities[0],
      lowConnectionNodes: graphNodes.filter((node) => (degree.get(node.id) || 0) <= 1).length,
      sparseCommunities: communities.filter((community) => community.size >= 3 && community.density < 0.15).length,
    },
  };
}

function nodeStatusClass(node: ResearchGraphNode) {
  if (node.type === "warning") return "broken";
  if (node.status === "approved" || node.status === "applied" || node.status === "supported") return "ok";
  if (node.status === "needs_review" || node.type === "review") return "blocked";
  return node.status || node.type;
}

function edgeStatusClass(edge: ResearchGraphEdge) {
  if (edge.type.startsWith("warning_")) return "warning";
  if (edge.type === "wikilink" && edge.status === "unresolved") return "broken";
  if (edge.type === "wikilink") return "ok";
  if (edge.status === "broken" || edge.status === "p0" || edge.status === "p1") return "broken";
  if (edge.status === "needs_review" || edge.type === "claim_review") return "review";
  if (edge.status === "approved" || edge.status === "applied" || edge.status === "supported") return "ok";
  return edge.type;
}

function nodeSearchText(node: ResearchGraphNode) {
  return [
    node.id,
    node.type,
    node.label,
    node.subtitle,
    node.body,
    node.path,
    node.status,
    node.severity,
    ...Object.entries(node.metrics || {}).flatMap(([key, value]) => [key, String(value)]),
  ].join("\n").toLowerCase();
}

function edgeSearchText(
  edge: ResearchGraphEdge,
  nodeById: Map<string, ResearchGraphNode>,
) {
  const from = nodeById.get(edge.from);
  const to = nodeById.get(edge.to);
  return [
    edge.id,
    edge.type,
    edge.label,
    edge.status,
    from?.label,
    from?.subtitle,
    from?.path,
    to?.label,
    to?.subtitle,
    to?.path,
  ].join("\n").toLowerCase();
}

function graphPositions(nodes: ResearchGraphNode[]) {
  const grouped = nodes.reduce<Record<number, ResearchGraphNode[]>>((acc, node) => {
    const column = typeOrder[node.type];
    acc[column] = [...(acc[column] || []), node];
    return acc;
  }, {});
  const positions = new Map<string, { x: number; y: number }>();
  const columns = [0, 1, 2, 3];
  for (const column of columns) {
    const columnNodes = grouped[column] || [];
    const x = 70 + column * 245;
    columnNodes.forEach((node, index) => {
      const y = 48 + ((index + 1) * 300) / (columnNodes.length + 1);
      positions.set(node.id, { x, y });
    });
  }
  return positions;
}

function graphSummaryText(graph: ResearchGraph, language: UiLanguage) {
  const concepts = graph.summary.keyConcepts.map((node) => node.label).join(", ") || (language === "zh" ? "暂无概念连接" : "no concept links yet");
  const reviewPressure = graph.summary.reviewNodes + graph.summary.traceabilityBreaks;
  const largestCluster = graph.summary.largestCommunity?.labels.join(", ") || (language === "zh" ? "暂无知识簇" : "no clusters yet");
  if (language === "zh") {
    return [
      `${graph.summary.sourcesPapers} 个资料节点支撑 ${graph.summary.sourceBackedClaims} 条资料到论断证据链。`,
      `连接最多的概念：${concepts}。`,
      `${graph.summary.communities.length} 个知识簇；最大簇从 ${largestCluster} 开始，${graph.summary.lowConnectionNodes} 个节点仍然低连接。`,
      `${reviewPressure} 个审核或可追踪性节点需要处理后，才能把生成洞察视为稳定内容。`,
      `${graph.summary.writebackInsights} 个写回提案在批准前保持先提案后写回。`,
    ];
  }
  return [
    `${graph.summary.sourcesPapers} source nodes feed ${graph.summary.sourceBackedClaims} source-to-claim evidence links.`,
    `Most connected concepts: ${concepts}.`,
    `${graph.summary.communities.length} knowledge clusters are connected; the largest starts with ${largestCluster}, and ${graph.summary.lowConnectionNodes} nodes remain low-link.`,
    `${reviewPressure} review or traceability nodes require attention before treating generated proposal content as stable.`,
    `${graph.summary.writebackInsights} writeback proposal nodes remain proposal-first until approved.`,
  ];
}

export function ResearchGraphPage({
  className,
  language = "zh",
  vaultPath,
  status,
  registry,
  claims,
  evidencePaths,
  reviewItems,
  writebacks,
  traceabilityWarnings,
  onOpenPath,
  onRevealPath,
  onCopyText,
  onOpenObsidian,
  onOpenSources,
  onPlanIngest,
  onRunPipeline,
  resolveVaultPath,
}: ResearchGraphPageProps) {
  const text = graphCopy[language];
  const [typeFilter, setTypeFilter] = useState<ResearchNodeType | "all">("all");
  const [edgeFilter, setEdgeFilter] = useState<ResearchEdgeType | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const graph = useMemo(
    () => buildResearchGraph({ status, registry, claims, evidencePaths, reviewItems, writebacks, traceabilityWarnings }),
    [claims, evidencePaths, registry, reviewItems, status, traceabilityWarnings, writebacks],
  );
  const nodeSubtitle = (value?: string | null) => {
    if (!value || language !== "zh") return value;
    return value
      .replace("claim concept tag", "论断概念标签")
      .replace("claim needs review", "论断待审核")
      .replace("evidence path", "证据路径")
      .replace("query writeback target", "问答写回目标")
      .replace("traceability warning", "可追踪性警告")
      .replace(/^line (.+)$/, "第 $1 行")
      .replace(" · ", " · ");
  };
  const edgeLabel = (edge: ResearchGraphEdge) => {
    if (language !== "zh") return edge.label;
    const labels: Record<string, string> = {
      "supports claim": "支撑论断",
      "feeds concept": "沉淀概念",
      "requires review": "需要审核",
      "wikilink": "Wiki 链接",
      "evidence path": "证据路径",
      "evidence concept": "证据概念",
      "review item": "审核项",
      "targets concept": "指向概念",
      "targets review artifact": "指向审核产物",
      "flags claim": "标记论断",
      "breaks source trace": "断开资料追踪",
    };
    return labels[edge.label] || edge.label;
  };
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const normalizedQuery = query.trim().toLowerCase();
  const nodeMatchedIds = new Set<string>();
  const typeMatchedNodes = graph.nodes.filter((node) => typeFilter === "all" || node.type === typeFilter);

  for (const node of typeMatchedNodes) {
    if (!normalizedQuery || nodeSearchText(node).includes(normalizedQuery)) {
      nodeMatchedIds.add(node.id);
    }
  }

  const visibleEdges = graph.edges.filter((edge) => {
    if (edgeFilter !== "all" && edge.type !== edgeFilter) return false;
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    const typeMatch = typeFilter === "all" || fromNode?.type === typeFilter || toNode?.type === typeFilter;
    if (!typeMatch) return false;
    if (!normalizedQuery) return true;
    return (
      nodeMatchedIds.has(edge.from)
      || nodeMatchedIds.has(edge.to)
      || edgeSearchText(edge, nodeById).includes(normalizedQuery)
    );
  });

  const filteredNodeIds = edgeFilter === "all" ? new Set(nodeMatchedIds) : new Set<string>();
  for (const edge of visibleEdges) {
    filteredNodeIds.add(edge.from);
    filteredNodeIds.add(edge.to);
  }

  const filteredNodes = graph.nodes.filter((node) => filteredNodeIds.has(node.id));
  const visualNodes = filteredNodes.slice(0, VISUAL_NODE_LIMIT);
  const visualNodeIds = new Set(visualNodes.map((node) => node.id));
  const visualEdges = visibleEdges.filter((edge) => visualNodeIds.has(edge.from) && visualNodeIds.has(edge.to)).slice(0, VISUAL_EDGE_LIMIT);
  const graphIsTruncated = visualNodes.length < filteredNodes.length || visualEdges.length < visibleEdges.length;
  const positions = graphPositions(visualNodes);
  const selected = (selectedId ? filteredNodes.find((node) => node.id === selectedId) : null) || filteredNodes[0] || null;
  const relatedEdges = selected ? visibleEdges.filter((edge) => edge.from === selected.id || edge.to === selected.id) : [];
  const summary = graphSummaryText(graph, language);
  const hasGraphData = graph.nodes.length > 0;
  const graphFilterActive = Boolean(normalizedQuery) || typeFilter !== "all" || edgeFilter !== "all";
  const graphViewBox = useMemo(() => {
    const width = GRAPH_VIEWBOX.width / zoom;
    const height = GRAPH_VIEWBOX.height / zoom;
    return `${GRAPH_VIEWBOX.centerX - width / 2} ${GRAPH_VIEWBOX.centerY - height / 2} ${width} ${height}`;
  }, [zoom]);
  const readingQuality = status?.readingQuality ?? null;
  const orphanConcepts = readingQuality?.orphanConcepts ?? 0;
  const lowSynthesisConcepts = readingQuality?.lowSynthesisConcepts ?? 0;
  const knowledgeGaps = orphanConcepts + lowSynthesisConcepts;
  const readingQualityReportPath = readingQuality?.reportPath || null;
  const knowledgeGapSummary = readingQuality
    ? (knowledgeGaps > 0 ? text.knowledgeGapDetail(orphanConcepts, lowSynthesisConcepts) : text.knowledgeGapClear)
    : text.noReadingQuality;

  useEffect(() => {
    if (!selectedId || !filteredNodes.some((node) => node.id === selectedId)) {
      setSelectedId(filteredNodes[0]?.id || null);
    }
  }, [filteredNodes, selectedId]);

  const openNodePath = (node: ResearchGraphNode) => {
    if (node.path) onOpenPath(resolveVaultPath(node.path));
  };
  const revealNodePath = (node: ResearchGraphNode) => {
    if (node.path) onRevealPath(resolveVaultPath(node.path));
  };
  const endpointLabel = (id: string) => nodeById.get(id)?.label || id;
  const resetGraphFilters = () => {
    setQuery("");
    setTypeFilter("all");
    setEdgeFilter("all");
  };
  const zoomInGraph = () => setZoom((value) => Math.min(GRAPH_ZOOM_MAX, Number((value + GRAPH_ZOOM_STEP).toFixed(2))));
  const zoomOutGraph = () => setZoom((value) => Math.max(GRAPH_ZOOM_MIN, Number((value - GRAPH_ZOOM_STEP).toFixed(2))));
  const resetGraphZoom = () => setZoom(1);

  return (
    <section className={["research-graph-page", className].filter(Boolean).join(" ")}>
      <div className="graph-summary-bar">
        <div>
          <span>{text.summaryStats.sources}</span>
          <strong>{graph.summary.sourcesPapers}</strong>
        </div>
        <div>
          <span>{text.summaryStats.sourceBackedClaims}</span>
          <strong>{graph.summary.sourceBackedClaims}</strong>
        </div>
        <div>
          <span>{text.summaryStats.keyConcepts}</span>
          <strong>{graph.summary.keyConcepts.length}</strong>
        </div>
        <div>
          <span>{text.summaryStats.reviewNodes}</span>
          <strong>{graph.summary.reviewNodes}</strong>
        </div>
        <div>
          <span>{text.summaryStats.traceabilityBreaks}</span>
          <strong>{graph.summary.traceabilityBreaks}</strong>
        </div>
        <div>
          <span>{text.summaryStats.writebackInsights}</span>
          <strong>{graph.summary.writebackInsights}</strong>
        </div>
      </div>

      <div className="graph-insight-strip">
        <div>
          <strong>{text.researchSummary}</strong>
          <p>
            {vaultPath ? text.vaultSummary : text.noVaultSummary}
          </p>
          <ul>
            {summary.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <span>{text.keyConcepts}</span>
          <em>{graph.summary.keyConcepts.map((node) => node.label).join(", ") || text.noneYet}</em>
        </div>
        <div>
          <span>{text.knowledgeClusters}</span>
          <strong>{graph.summary.communities.length}</strong>
          <em>
            {graph.summary.largestCommunity
              ? `${text.largestCluster}: ${graph.summary.largestCommunity.labels.join(", ")}`
              : text.noCluster}
          </em>
          <code>{text.clusterHealth(graph.summary.lowConnectionNodes, graph.summary.sparseCommunities)}</code>
        </div>
        <div>
          <span>{text.evidenceBreaks}</span>
          <em>{traceabilityWarnings.slice(0, 3).map((warning) => warning.claimId).join(", ") || text.noneSurfaced}</em>
        </div>
        <div>
          <span>{text.knowledgeGaps}</span>
          <em>{knowledgeGapSummary}</em>
          {readingQualityReportPath && (
            <button className="graph-insight-link" onClick={() => onOpenPath(resolveVaultPath(readingQualityReportPath))}>
              <FolderOpen size={14} />
              {text.readingQualityReport}
            </button>
          )}
        </div>
      </div>

      <div className="graph-control-panel">
        <label className="graph-search-box">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text.searchPlaceholder}
          />
        </label>
        <div className="graph-filter-group">
          <span>{text.nodeType}</span>
          <div className="graph-filter-row">
            {nodeTypes.map((type) => (
              <button
                key={type}
                className={typeFilter === type ? "active" : ""}
                onClick={() => setTypeFilter(type)}
              >
                {text.nodeTypes[type]}
              </button>
            ))}
          </div>
        </div>
        <div className="graph-filter-group">
          <span>{text.edgeType}</span>
          <div className="graph-filter-row">
            {edgeTypes.map((type) => (
              <button
                key={type}
                className={edgeFilter === type ? "active" : ""}
                onClick={() => setEdgeFilter(type)}
              >
                {text.edgeTypes[type]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="graph-workspace">
        <section className="panel graph-panel">
          <div className="section-head">
            <h2>{text.relationshipMap}</h2>
            <span>{visualNodes.length}/{filteredNodes.length} {text.nodes} · {visualEdges.length}/{visibleEdges.length} {text.edges}</span>
          </div>
          {!hasGraphData ? (
            <div className="graph-empty-state">
              <Network size={30} />
              <strong>{text.noGraphDataTitle}</strong>
              <p>{text.noGraphDataBody}</p>
              <div className="inline-actions">
                <button onClick={onOpenSources}><FolderOpen size={14} />{text.noGraphDataSources}</button>
                <button onClick={onPlanIngest}><Search size={14} />{text.noGraphDataPlan}</button>
                <button onClick={onRunPipeline}><GitCompare size={14} />{text.noGraphDataPipeline}</button>
              </div>
            </div>
          ) : visualNodes.length === 0 ? (
            <div className="graph-empty-state">
              <Search size={30} />
              <strong>{text.noGraphNodes}</strong>
              {graphFilterActive && (
                <div className="inline-actions">
                  <button onClick={resetGraphFilters}><RotateCcw size={14} />{text.resetGraphFilters}</button>
                </div>
              )}
            </div>
          ) : (
            <div className="graph-canvas-wrap">
              <div className="graph-zoom-controls" aria-label={text.relationshipMap}>
                <button onClick={zoomInGraph} disabled={zoom >= GRAPH_ZOOM_MAX} title={text.zoomIn} aria-label={text.zoomIn}>
                  <ZoomIn size={14} />
                </button>
                <button onClick={zoomOutGraph} disabled={zoom <= GRAPH_ZOOM_MIN} title={text.zoomOut} aria-label={text.zoomOut}>
                  <ZoomOut size={14} />
                </button>
                <button onClick={resetGraphZoom} disabled={zoom === 1} title={text.resetZoom} aria-label={text.resetZoom}>
                  <Maximize size={14} />
                </button>
              </div>
              <svg className="research-graph-svg" viewBox={graphViewBox} role="img" aria-label="Research relationship graph">
                <defs>
                  <marker id="graph-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" />
                  </marker>
                </defs>
                {visualEdges.map((edge) => {
                  const from = positions.get(edge.from);
                  const to = positions.get(edge.to);
                  if (!from || !to) return null;
                  const active = selected && (edge.from === selected.id || edge.to === selected.id);
                  return (
                    <line
                      key={edge.id}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      markerEnd="url(#graph-arrow)"
                      className={classNames(edgeStatusClass(edge), active && "active")}
                    />
                  );
                })}
                {visualNodes.map((node) => {
                  const position = positions.get(node.id);
                  if (!position) return null;
                  const active = selected?.id === node.id;
                  return (
                    <g
                      key={node.id}
                      className={classNames(node.type, active && "active")}
                      onClick={() => setSelectedId(node.id)}
                    >
                      <circle cx={position.x} cy={position.y} r={active ? 13 : 10} fill={typeColors[node.type]} />
                      <text x={position.x + 15} y={position.y + 4}>{node.label.slice(0, 32)}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
          {graphIsTruncated && (
            <p className="empty">{text.limitHint(visualNodes.length, filteredNodes.length, visualEdges.length, visibleEdges.length)}</p>
          )}
          <div className="graph-legend">
            {(Object.keys(typeColors) as ResearchNodeType[]).map((type) => (
              <span key={type}><i style={{ backgroundColor: typeColors[type] }} />{text.nodeTypes[type]}</span>
            ))}
          </div>
        </section>

        <section className="panel graph-panel">
          <div className="section-head">
            <h2>{text.nodeDetails}</h2>
            {selected && <span>{text.nodeTypes[selected.type]}</span>}
          </div>
          {selected ? (
            <div className="graph-node-detail">
              <span className={`status-chip ${nodeStatusClass(selected)}`}>{text.nodeTypes[selected.type]}</span>
              <strong>{selected.label}</strong>
              <em>{nodeSubtitle(selected.subtitle) || selected.status || selected.id}</em>
              {selected.body && <p>{selected.body}</p>}
              {selected.path && <code>{selected.path}</code>}
              {selected.metrics && (
                <div className="graph-node-metrics">
                  {Object.entries(selected.metrics).map(([metric, value]) => (
                    <span key={metric}>{metric}: {String(value)}</span>
                  ))}
                </div>
              )}
              <div className="inline-actions">
                <button onClick={() => openNodePath(selected)} disabled={!selected.path}><FolderOpen size={14} />{text.open}</button>
                <button onClick={() => revealNodePath(selected)} disabled={!selected.path}><ExternalLink size={14} />{text.reveal}</button>
                <button onClick={() => onCopyText("graph node path", selected.path || selected.id)}><Copy size={14} />{text.copy}</button>
                <button onClick={onOpenObsidian} disabled={!vaultPath}><SquareStack size={14} />Obsidian</button>
              </div>
              <div className="graph-related">
                <strong>{text.relatedEdges}</strong>
                {relatedEdges.length === 0 && <p className="empty">{text.noRelatedEdges}</p>}
                {relatedEdges.map((edge) => (
                  <button key={edge.id} onClick={() => setSelectedId(edge.from === selected.id ? edge.to : edge.from)}>
                    <span>{text.edgeTypes[edge.type]} · {edgeLabel(edge)}</span>
                    <em>{endpointLabel(edge.from)} {"->"} {endpointLabel(edge.to)}</em>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="empty">{text.noGraphNodes}</p>
          )}
        </section>
      </div>

      <div className="graph-list-grid">
        <section className="panel">
          <div className="section-head">
            <h2>{text.nodeList}</h2>
            <span>{filteredNodes.length}/{graph.nodes.length} {text.nodes}</span>
          </div>
          <div className="graph-list">
            {filteredNodes.length === 0 && <p className="empty">{text.noNodesMatch}</p>}
            {filteredNodes.map((node) => (
              <button key={node.id} onClick={() => setSelectedId(node.id)}>
                <span className={`status-chip ${nodeStatusClass(node)}`}>{text.nodeTypes[node.type]}</span>
                <strong>{compact(node.label, 120)}</strong>
                <em>{nodeSubtitle(node.subtitle) || node.status || node.id}</em>
                <code>{node.path || node.id}</code>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>{text.edgeList}</h2>
            <span>{visibleEdges.length}/{graph.edges.length} {text.edges}</span>
          </div>
          <div className="graph-list">
            {visibleEdges.length === 0 && <p className="empty">{text.noEdgesMatch}</p>}
            {visibleEdges.map((edge) => (
              <button key={edge.id} onClick={() => setSelectedId(edge.to)}>
                <span className={classNames("status-chip", edgeStatusClass(edge))}>{text.edgeTypes[edge.type]}</span>
                <strong>{edgeLabel(edge)}</strong>
                <em>{endpointLabel(edge.from)} {"->"} {endpointLabel(edge.to)}</em>
                <code>{edge.status || text.linked}</code>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>{text.evidenceBreakLocator}</h2>
            <ShieldAlert size={18} />
          </div>
          <div className="graph-list">
            {traceabilityWarnings.length === 0 && <p className="empty">{text.noTraceabilityWarnings}</p>}
            {traceabilityWarnings.map((warning) => (
              <button key={warning.warningId} onClick={() => setSelectedId(warningNodeId(warning.warningId))}>
                <span className={`status-chip ${warning.severity}`}>{warning.severity}</span>
                <strong>{warning.claimText || warning.claimId}</strong>
                <em>{warning.sourcePath || warning.sourceId || text.sourceUnknown}</em>
                <code>{warning.missingAnchor || warning.summary}</code>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>{text.conceptSourceLocator}</h2>
            <Search size={18} />
          </div>
          <div className="graph-list">
            {graph.summary.keyConcepts.length === 0 && <p className="empty">{text.noConceptRelationships}</p>}
            {graph.summary.keyConcepts.map((concept) => (
              <button key={concept.id} onClick={() => setSelectedId(concept.id)}>
                <span className="status-chip concept">{text.nodeTypes.concept}</span>
                <strong>{concept.label}</strong>
                <em>{nodeSubtitle(concept.subtitle) || concept.path || text.conceptTag}</em>
                <code>{graph.edges.filter((edge) => edge.to === concept.id || edge.from === concept.id).length} {text.relationships}</code>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>{text.writebackInsightTargets}</h2>
            <GitCompare size={18} />
          </div>
          <div className="graph-list">
            {writebacks.length === 0 && <p className="empty">{text.noWritebacks}</p>}
            {writebacks.map((proposal) => (
              <button key={proposal.proposalId} onClick={() => setSelectedId(proposalNodeId(proposal.proposalId))}>
                <span className={`status-chip ${proposal.status}`}>{proposal.status}</span>
                <strong>{proposal.title}</strong>
                <em>{proposal.targetPath}</em>
                <code>{proposal.updatedAt}</code>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>{text.graphContract}</h2>
            <Network size={18} />
          </div>
          <div className="graph-contract">
            <p>{text.sourceToClaim}</p>
            <p>{text.claimToConcept}</p>
            <p>{text.claimToReview}</p>
            <p>{text.wikiLink}</p>
            <p>{text.proposalToTarget}</p>
            <p>{text.warningToClaim}</p>
          </div>
        </section>
      </div>
    </section>
  );
}
