import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, FolderOpen, GitCompare, Network, Search, ShieldAlert } from "lucide-react";
import type {
  ClaimLedgerItem,
  DesktopRegistryEntry,
  EvidencePathItem,
  ReviewQueueItem,
  TraceabilityWarning,
  VaultStatus,
  WritebackProposal,
} from "../../types";

type ResearchNodeType = "source" | "claim" | "concept" | "review" | "proposal" | "warning";

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
  type: string;
  label: string;
  status?: string | null;
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
  };
};

type ResearchGraphPageProps = {
  className?: string;
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

const nodeTypeLabels: Record<ResearchNodeType | "all", string> = {
  all: "All",
  source: "Sources",
  claim: "Claims",
  concept: "Concepts",
  review: "Reviews",
  proposal: "Proposals",
  warning: "Warnings",
};

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

function upsertNode(nodes: Map<string, ResearchGraphNode>, node: ResearchGraphNode) {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, node);
    return node;
  }
  nodes.set(node.id, {
    ...existing,
    ...node,
    label: existing.label || node.label,
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

function addEdge(edges: Map<string, ResearchGraphEdge>, edge: ResearchGraphEdge) {
  if (edge.from === edge.to) return;
  edges.set(edge.id, edge);
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
  }

  for (const file of input.status?.files ?? []) {
    if (file.kind === "source") {
      const id = sourceNodeId(file.path);
      upsertNode(nodes, {
        id,
        type: "source",
        label: file.title || file.name || labelFromPath(file.path),
        subtitle: file.path,
        path: file.path,
        status: file.status,
      });
      addAlias(sourceAliases, id, file.path, file.title, file.name);
    }
    if (file.kind === "concept") {
      const id = conceptNodeId(file.path);
      upsertNode(nodes, {
        id,
        type: "concept",
        label: file.title || file.name || labelFromPath(file.path),
        subtitle: file.path,
        path: file.path,
        status: file.status,
      });
      addAlias(conceptAliases, id, file.path, file.title, file.name, labelFromPath(file.path));
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
    return id;
  };

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
    },
  };
}

function nodeStatusClass(node: ResearchGraphNode) {
  if (node.type === "warning") return "broken";
  if (node.status === "approved" || node.status === "applied" || node.status === "supported") return "ok";
  if (node.status === "needs_review" || node.type === "review") return "blocked";
  return node.status || node.type;
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

export function ResearchGraphPage({
  className,
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
  resolveVaultPath,
}: ResearchGraphPageProps) {
  const [typeFilter, setTypeFilter] = useState<ResearchNodeType | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const graph = useMemo(
    () => buildResearchGraph({ status, registry, claims, evidencePaths, reviewItems, writebacks, traceabilityWarnings }),
    [claims, evidencePaths, registry, reviewItems, status, traceabilityWarnings, writebacks],
  );
  const filteredNodes = graph.nodes.filter((node) => typeFilter === "all" || node.type === typeFilter);
  const filteredIds = new Set(filteredNodes.map((node) => node.id));
  const visibleEdges = typeFilter === "all"
    ? graph.edges
    : graph.edges.filter((edge) => filteredIds.has(edge.from) || filteredIds.has(edge.to));
  const contextIds = new Set<string>();
  for (const edge of visibleEdges) {
    contextIds.add(edge.from);
    contextIds.add(edge.to);
  }
  for (const node of filteredNodes) contextIds.add(node.id);
  const visualNodes = graph.nodes.filter((node) => contextIds.has(node.id)).slice(0, 80);
  const visualNodeIds = new Set(visualNodes.map((node) => node.id));
  const visualEdges = visibleEdges.filter((edge) => visualNodeIds.has(edge.from) && visualNodeIds.has(edge.to)).slice(0, 120);
  const positions = graphPositions(visualNodes);
  const selected = graph.nodes.find((node) => node.id === selectedId) || filteredNodes[0] || graph.nodes[0] || null;
  const relatedEdges = selected ? graph.edges.filter((edge) => edge.from === selected.id || edge.to === selected.id) : [];

  useEffect(() => {
    if (!selectedId || !graph.nodes.some((node) => node.id === selectedId)) {
      setSelectedId(filteredNodes[0]?.id || graph.nodes[0]?.id || null);
    }
  }, [filteredNodes, graph.nodes, selectedId]);

  const openNodePath = (node: ResearchGraphNode) => {
    if (node.path) onOpenPath(resolveVaultPath(node.path));
  };
  const revealNodePath = (node: ResearchGraphNode) => {
    if (node.path) onRevealPath(resolveVaultPath(node.path));
  };

  return (
    <section className={["research-graph-page", className].filter(Boolean).join(" ")}>
      <div className="graph-summary-bar">
        <div>
          <span>Sources / papers</span>
          <strong>{graph.summary.sourcesPapers}</strong>
        </div>
        <div>
          <span>Source-backed claims</span>
          <strong>{graph.summary.sourceBackedClaims}</strong>
        </div>
        <div>
          <span>Key concepts</span>
          <strong>{graph.summary.keyConcepts.length}</strong>
        </div>
        <div>
          <span>Review nodes</span>
          <strong>{graph.summary.reviewNodes}</strong>
        </div>
        <div>
          <span>Traceability breaks</span>
          <strong>{graph.summary.traceabilityBreaks}</strong>
        </div>
        <div>
          <span>Writeback insights</span>
          <strong>{graph.summary.writebackInsights}</strong>
        </div>
      </div>

      <div className="graph-insight-strip">
        <div>
          <strong>DeepSeek research graph summary</strong>
          <p>
            {vaultPath ? "This graph links generated sources, claims, concepts, reviews, traceability warnings, and writeback proposals from the selected vault." : "Open a generated vault to build the research graph."}
          </p>
        </div>
        <div>
          <span>Key concepts</span>
          <em>{graph.summary.keyConcepts.map((node) => node.label).join(", ") || "none yet"}</em>
        </div>
        <div>
          <span>Evidence breaks</span>
          <em>{traceabilityWarnings.slice(0, 3).map((warning) => warning.claimId).join(", ") || "none surfaced"}</em>
        </div>
      </div>

      <div className="graph-filter-row">
        {nodeTypes.map((type) => (
          <button
            key={type}
            className={typeFilter === type ? "active" : ""}
            onClick={() => setTypeFilter(type)}
          >
            {nodeTypeLabels[type]}
          </button>
        ))}
      </div>

      <div className="graph-workspace">
        <section className="panel graph-panel">
          <div className="section-head">
            <h2>Relationship map</h2>
            <span>{visualNodes.length} nodes · {visualEdges.length} edges</span>
          </div>
          <svg className="research-graph-svg" viewBox="0 0 860 360" role="img" aria-label="Research relationship graph">
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
                  className={active ? "active" : ""}
                />
              );
            })}
            {visualNodes.map((node) => {
              const position = positions.get(node.id);
              if (!position) return null;
              const active = selected?.id === node.id;
              return (
                <g key={node.id} className={active ? "active" : ""} onClick={() => setSelectedId(node.id)}>
                  <circle cx={position.x} cy={position.y} r={active ? 13 : 10} fill={typeColors[node.type]} />
                  <text x={position.x + 15} y={position.y + 4}>{node.label.slice(0, 32)}</text>
                </g>
              );
            })}
          </svg>
          <div className="graph-legend">
            {(Object.keys(typeColors) as ResearchNodeType[]).map((type) => (
              <span key={type}><i style={{ backgroundColor: typeColors[type] }} />{type}</span>
            ))}
          </div>
        </section>

        <section className="panel graph-panel">
          <div className="section-head">
            <h2>Node details</h2>
            {selected && <span>{selected.type}</span>}
          </div>
          {selected ? (
            <div className="graph-node-detail">
              <span className={`status-chip ${nodeStatusClass(selected)}`}>{selected.type}</span>
              <strong>{selected.label}</strong>
              <em>{selected.subtitle || selected.status || selected.id}</em>
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
                <button onClick={() => openNodePath(selected)} disabled={!selected.path}><FolderOpen size={14} />open</button>
                <button onClick={() => revealNodePath(selected)} disabled={!selected.path}><ExternalLink size={14} />reveal</button>
                <button onClick={() => onCopyText("graph node path", selected.path || selected.id)}><Copy size={14} />copy</button>
              </div>
              <div className="graph-related">
                <strong>Related edges</strong>
                {relatedEdges.length === 0 && <p className="empty">No edges connected to this node.</p>}
                {relatedEdges.map((edge) => (
                  <button key={edge.id} onClick={() => setSelectedId(edge.from === selected.id ? edge.to : edge.from)}>
                    <span>{edge.label}</span>
                    <em>{edge.from === selected.id ? edge.to : edge.from}</em>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="empty">No graph nodes yet.</p>
          )}
        </section>
      </div>

      <div className="graph-list-grid">
        <section className="panel">
          <div className="section-head">
            <h2>Node list</h2>
            <span>{filteredNodes.length} nodes</span>
          </div>
          <div className="graph-list">
            {filteredNodes.length === 0 && <p className="empty">No nodes match this filter.</p>}
            {filteredNodes.map((node) => (
              <button key={node.id} onClick={() => setSelectedId(node.id)}>
                <span className={`status-chip ${nodeStatusClass(node)}`}>{node.type}</span>
                <strong>{node.label}</strong>
                <em>{node.subtitle || node.status || node.id}</em>
                <code>{node.path || node.id}</code>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>Edge list</h2>
            <span>{visibleEdges.length} edges</span>
          </div>
          <div className="graph-list">
            {visibleEdges.length === 0 && <p className="empty">No edges match this filter.</p>}
            {visibleEdges.map((edge) => (
              <button key={edge.id} onClick={() => setSelectedId(edge.to)}>
                <span className="status-chip stageable">{edge.type}</span>
                <strong>{edge.label}</strong>
                <em>{edge.from} {"->"} {edge.to}</em>
                <code>{edge.status || "linked"}</code>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>Evidence break locator</h2>
            <ShieldAlert size={18} />
          </div>
          <div className="graph-list">
            {traceabilityWarnings.length === 0 && <p className="empty">No traceability warnings surfaced.</p>}
            {traceabilityWarnings.map((warning) => (
              <button key={warning.warningId} onClick={() => setSelectedId(warningNodeId(warning.warningId))}>
                <span className={`status-chip ${warning.severity}`}>{warning.severity}</span>
                <strong>{warning.claimText || warning.claimId}</strong>
                <em>{warning.sourcePath || warning.sourceId || "source unknown"}</em>
                <code>{warning.missingAnchor || warning.summary}</code>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>Concept source locator</h2>
            <Search size={18} />
          </div>
          <div className="graph-list">
            {graph.summary.keyConcepts.length === 0 && <p className="empty">No concept relationships yet.</p>}
            {graph.summary.keyConcepts.map((concept) => (
              <button key={concept.id} onClick={() => setSelectedId(concept.id)}>
                <span className="status-chip concept">concept</span>
                <strong>{concept.label}</strong>
                <em>{concept.subtitle || concept.path || "concept tag"}</em>
                <code>{graph.edges.filter((edge) => edge.to === concept.id || edge.from === concept.id).length} relationships</code>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>Writeback insight targets</h2>
            <GitCompare size={18} />
          </div>
          <div className="graph-list">
            {writebacks.length === 0 && <p className="empty">No query writeback proposals yet.</p>}
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
            <h2>Graph contract</h2>
            <Network size={18} />
          </div>
          <div className="graph-contract">
            <p>source {"->"} claim: source registry, claim ledger, evidence paths</p>
            <p>claim {"->"} concept: claim concept tags and evidence concepts</p>
            <p>claim {"->"} review: review queue and needs-review claims</p>
            <p>proposal {"->"} target: query writeback target page</p>
            <p>warning {"->"} claim/source: traceability warnings</p>
          </div>
        </section>
      </div>
    </section>
  );
}
