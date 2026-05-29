import { useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSetSettings, useSigma } from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import type { SigmaNodeEventPayload } from "sigma/types";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { ChevronDown, ChevronRight, EyeOff, Filter, Maximize, RotateCcw, Settings2, ZoomIn, ZoomOut } from "lucide-react";
import type { UiLanguage } from "../../i18n";

export type SigmaEvidenceGraphNode = {
  id: string;
  type: string;
  label: string;
  path?: string | null;
  color: string;
  degree: number;
  communityLabel?: string;
  communityColor?: string;
};

export type SigmaEvidenceGraphEdge = {
  id: string;
  from: string;
  to: string;
  type: string;
  label: string;
  status?: string | null;
  weight: number;
};

type SigmaEvidenceGraphProps = {
  language: UiLanguage;
  nodes: SigmaEvidenceGraphNode[];
  edges: SigmaEvidenceGraphEdge[];
  selectedNodeId: string | null;
  highlightedNodeIds?: Set<string>;
  colorMode: "type" | "community";
  typeLabels: Record<string, string>;
  activeType: string;
  hiddenNodeCount: number;
  onSelectNode: (nodeId: string) => void;
  onSelectType: (type: string) => void;
  onHoverNode: (nodeId: string | null) => void;
  onHideNode: (nodeId: string) => void;
  onResetHiddenNodes: () => void;
};

type HoverState = { node: string; neighbors: Set<string> } | null;

const BASE_NODE_SIZE = 7;
const MAX_NODE_SIZE = 25;
const DEFAULT_NODE_SCALE = 1;
const DEFAULT_GRAPH_SPACING = 1;

const copy = {
  zh: {
    display: "显示设置",
    nodeSize: "节点大小",
    spacing: "图谱间距",
    resetView: "重置视图",
    zoomIn: "放大",
    zoomOut: "缩小",
    hideNode: "隐藏这个节点",
    showHidden: "显示隐藏节点",
    typeLegend: "节点类型",
    communityLegend: "知识簇",
    hidden: "已隐藏",
    links: "条关系",
  },
  en: {
    display: "Display",
    nodeSize: "Node size",
    spacing: "Graph spacing",
    resetView: "Reset view",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    hideNode: "Hide this node",
    showHidden: "Show hidden nodes",
    typeLegend: "Node types",
    communityLegend: "Knowledge clusters",
    hidden: "hidden",
    links: "links",
  },
} as const;

const positionCache = new Map<string, { x: number; y: number }>();
let lastLayoutKey = "";

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seedPosition(id: string, index: number, count: number) {
  const angle = ((hashString(id) % 3600) / 3600) * Math.PI * 2;
  const radius = 8 + Math.sqrt((index + 1) / Math.max(count, 1)) * 80;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function graphKey(nodes: readonly SigmaEvidenceGraphNode[], edges: readonly SigmaEvidenceGraphEdge[], spacing: number) {
  const nodePart = nodes.map((node) => node.id).sort().join("|");
  const edgePart = edges.map((edge) => `${edge.from}->${edge.to}:${Math.round(edge.weight * 100)}`).sort().join("|");
  return `${hashString(nodePart).toString(36)}:${hashString(edgePart).toString(36)}:${nodes.length}:${edges.length}:${spacing.toFixed(2)}`;
}

function densityScale(nodeCount: number) {
  if (nodeCount <= 140) return 1;
  return Math.max(0.42, Math.sqrt(140 / nodeCount));
}

function nodeSize(degree: number, maxDegree: number, nodeCount: number, userScale: number) {
  if (maxDegree <= 0) return BASE_NODE_SIZE * userScale;
  const ratio = degree / maxDegree;
  return (BASE_NODE_SIZE + Math.sqrt(ratio) * (MAX_NODE_SIZE - BASE_NODE_SIZE)) * densityScale(nodeCount) * userScale;
}

function layoutIterations(nodeCount: number) {
  if (nodeCount > 900) return 42;
  if (nodeCount > 420) return 64;
  if (nodeCount > 180) return 90;
  return 132;
}

function labelThreshold(nodeCount: number) {
  if (nodeCount > 900) return 16;
  if (nodeCount > 420) return 12;
  if (nodeCount > 180) return 9;
  return 6;
}

function labelDensity(nodeCount: number) {
  if (nodeCount > 900) return 0.12;
  if (nodeCount > 420) return 0.2;
  if (nodeCount > 180) return 0.32;
  return 0.46;
}

function mixWithBackground(hex: string, ratio: number) {
  const color = hex.startsWith("#") ? hex : "#94a3b8";
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const mix = (channel: number) => Math.round(channel + (241 - channel) * ratio);
  return `#${mix(r).toString(16).padStart(2, "0")}${mix(g).toString(16).padStart(2, "0")}${mix(b).toString(16).padStart(2, "0")}`;
}

function GraphLoader({
  nodes,
  edges,
  colorMode,
  nodeScale,
  graphSpacing,
}: {
  nodes: SigmaEvidenceGraphNode[];
  edges: SigmaEvidenceGraphEdge[];
  colorMode: "type" | "community";
  nodeScale: number;
  graphSpacing: number;
}) {
  const loadGraph = useLoadGraph();
  const maxDegree = Math.max(...nodes.map((node) => node.degree), 1);

  useEffect(() => {
    const dataKey = graphKey(nodes, edges, graphSpacing);
    const graph = new Graph({ type: "undirected" });

    nodes.forEach((node, index) => {
      const cached = positionCache.get(node.id);
      const seeded = cached || seedPosition(node.id, index, nodes.length);
      graph.addNode(node.id, {
        type: "circle",
        x: seeded.x,
        y: seeded.y,
        size: nodeSize(node.degree, maxDegree, nodes.length, nodeScale),
        color: colorMode === "community" ? node.communityColor || node.color : node.color,
        label: node.label,
        nodeType: node.type,
        nodePath: node.path || "",
      });
    });

    const maxWeight = Math.max(...edges.map((edge) => edge.weight), 1);
    for (const edge of edges) {
      if (!graph.hasNode(edge.from) || !graph.hasNode(edge.to)) continue;
      const normalizedWeight = edge.weight / maxWeight;
      const key = `${edge.from}->${edge.to}`;
      if (graph.hasEdge(key) || graph.hasEdge(`${edge.to}->${edge.from}`)) continue;
      graph.addEdgeWithKey(key, edge.from, edge.to, {
        color: `rgba(100, 116, 139, ${0.18 + normalizedWeight * 0.55})`,
        size: 0.65 + normalizedWeight * 3,
        sourceNode: edge.from,
        targetNode: edge.to,
        edgeType: edge.type,
        edgeStatus: edge.status || "",
        lowPriority: nodes.length > 180 && normalizedWeight < 0.55,
      });
    }

    if (nodes.length > 1 && dataKey !== lastLayoutKey) {
      const settings = forceAtlas2.inferSettings(graph);
      forceAtlas2.assign(graph, {
        iterations: layoutIterations(nodes.length),
        settings: {
          ...settings,
          gravity: 1,
          scalingRatio: graphSpacing * (nodes.length > 280 ? 3 : 2),
          strongGravityMode: true,
          barnesHutOptimize: nodes.length > 50,
        },
      });
      graph.forEachNode((id, attrs) => {
        positionCache.set(id, { x: Number(attrs.x) || 0, y: Number(attrs.y) || 0 });
      });
      lastLayoutKey = dataKey;
    }

    loadGraph(graph);
  }, [colorMode, edges, graphSpacing, loadGraph, maxDegree, nodeScale, nodes]);

  return null;
}

function GraphRenderSettings({
  hoverState,
  selectedNodeId,
  highlightedNodeIds,
  nodeCount,
}: {
  hoverState: HoverState;
  selectedNodeId: string | null;
  highlightedNodeIds: Set<string>;
  nodeCount: number;
}) {
  const sigma = useSigma();
  const setSettings = useSetSettings();

  useEffect(() => {
    const graph = sigma.getGraph();
    const selectedNeighbors = selectedNodeId && graph.hasNode(selectedNodeId)
      ? new Set(graph.neighbors(selectedNodeId))
      : new Set<string>();
    const selectedFocus = selectedNodeId ? new Set([selectedNodeId, ...selectedNeighbors]) : new Set<string>();

    setSettings({
      hideEdgesOnMove: true,
      hideLabelsOnMove: true,
      labelDensity: labelDensity(nodeCount),
      labelRenderedSizeThreshold: labelThreshold(nodeCount),
      renderEdgeLabels: false,
      nodeReducer: (node, attrs) => {
        const result = { ...attrs };
        const isHoverNode = hoverState?.node === node;
        const isHoverNeighbor = hoverState?.neighbors.has(node) ?? false;
        const isSelected = selectedNodeId === node;
        const isSelectedNeighbor = selectedFocus.has(node);
        const isHighlighted = highlightedNodeIds.has(node);
        const hasHover = Boolean(hoverState);
        const hasSelected = Boolean(selectedNodeId);
        const hasHighlights = highlightedNodeIds.size > 0;

        if (isSelected || isHighlighted) {
          result.size = Number(attrs.size ?? BASE_NODE_SIZE) * 1.45;
          result.zIndex = 10;
          result.forceLabel = true;
        } else if (isHoverNode) {
          result.size = Number(attrs.size ?? BASE_NODE_SIZE) * 1.35;
          result.zIndex = 9;
          result.forceLabel = true;
        }

        if (
          (hasHover && !isHoverNode && !isHoverNeighbor) ||
          (!hasHover && hasSelected && !isSelected && !isSelectedNeighbor) ||
          (hasHighlights && !isHighlighted)
        ) {
          result.color = mixWithBackground(String(attrs.color || "#94a3b8"), 0.72);
          result.label = "";
          result.size = Number(attrs.size ?? BASE_NODE_SIZE) * 0.64;
        }

        return result;
      },
      edgeReducer: (_edge, attrs) => {
        const result = { ...attrs };
        const source = String(attrs.sourceNode || "");
        const target = String(attrs.targetNode || "");
        const hoverEdge = Boolean(hoverState && (source === hoverState.node || target === hoverState.node));
        const selectedEdge = Boolean(selectedNodeId && (source === selectedNodeId || target === selectedNodeId));
        const highlightedEdge = highlightedNodeIds.size > 0 && highlightedNodeIds.has(source) && highlightedNodeIds.has(target);

        if (attrs.lowPriority && !hoverEdge && !selectedEdge && !highlightedEdge) {
          result.hidden = true;
          return result;
        }
        if ((hoverState && !hoverEdge) || (selectedNodeId && !selectedEdge) || (highlightedNodeIds.size > 0 && !highlightedEdge)) {
          result.color = "rgba(203, 213, 225, 0.45)";
          result.size = 0.35;
        }
        if (hoverEdge || selectedEdge || highlightedEdge) {
          result.color = "#1e293b";
          result.size = Math.max(2, Number(attrs.size ?? 1) * 1.45);
        }
        return result;
      },
    });
    sigma.refresh();
  }, [highlightedNodeIds, hoverState, nodeCount, selectedNodeId, setSettings, sigma]);

  return null;
}

function EventHandler({
  onSelectNode,
  onHoverChange,
  onNodeMenu,
}: {
  onSelectNode: (nodeId: string) => void;
  onHoverChange: (state: HoverState) => void;
  onNodeMenu: (nodeId: string, point: { x: number; y: number }) => void;
}) {
  const registerEvents = useRegisterEvents();
  const sigma = useSigma();

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => onSelectNode(node),
      rightClickNode: (payload: SigmaNodeEventPayload) => {
        payload.preventSigmaDefault();
        payload.event.original.preventDefault();
        const event = payload.event.original;
        const point = "clientX" in event
          ? { x: event.clientX, y: event.clientY }
          : { x: 0, y: 0 };
        onNodeMenu(payload.node, point);
      },
      rightClickStage: () => onNodeMenu("", { x: 0, y: 0 }),
      enterNode: ({ node }) => {
        sigma.getContainer().style.cursor = "pointer";
        const graph = sigma.getGraph();
        onHoverChange({ node, neighbors: new Set(graph.neighbors(node)) });
      },
      leaveNode: () => {
        sigma.getContainer().style.cursor = "default";
        onHoverChange(null);
      },
    });
  }, [onHoverChange, onNodeMenu, onSelectNode, registerEvents, sigma]);

  return null;
}

function ZoomControls({ language }: { language: UiLanguage }) {
  const sigma = useSigma();
  const text = copy[language];

  return (
    <div className="sigma-graph-zoom">
      <button title={text.zoomIn} aria-label={text.zoomIn} onClick={() => sigma.getCamera().animatedZoom({ duration: 180 })}>
        <ZoomIn size={14} />
      </button>
      <button title={text.zoomOut} aria-label={text.zoomOut} onClick={() => sigma.getCamera().animatedUnzoom({ duration: 180 })}>
        <ZoomOut size={14} />
      </button>
      <button title={text.resetView} aria-label={text.resetView} onClick={() => sigma.getCamera().animatedReset({ duration: 260 })}>
        <Maximize size={14} />
      </button>
    </div>
  );
}

function typeCounts(nodes: SigmaEvidenceGraphNode[]) {
  return nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.type] = (acc[node.type] || 0) + 1;
    return acc;
  }, {});
}

export function SigmaEvidenceGraph({
  language,
  nodes,
  edges,
  selectedNodeId,
  highlightedNodeIds = new Set(),
  colorMode,
  typeLabels,
  activeType,
  hiddenNodeCount,
  onSelectNode,
  onSelectType,
  onHoverNode,
  onHideNode,
  onResetHiddenNodes,
}: SigmaEvidenceGraphProps) {
  const text = copy[language];
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverState, setHoverState] = useState<HoverState>(null);
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [showDisplayPanel, setShowDisplayPanel] = useState(false);
  const [nodeScale, setNodeScale] = useState(DEFAULT_NODE_SCALE);
  const [graphSpacing, setGraphSpacing] = useState(DEFAULT_GRAPH_SPACING);
  const [nodeMenu, setNodeMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const counts = useMemo(() => typeCounts(nodes), [nodes]);
  const communityItems = useMemo(() => {
    const seen = new Map<string, { label: string; color: string; count: number }>();
    for (const node of nodes) {
      const label = node.communityLabel || typeLabels[node.type] || node.type;
      const color = node.communityColor || node.color;
      const current = seen.get(label) || { label, color, count: 0 };
      current.count += 1;
      seen.set(label, current);
    }
    return [...seen.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 12);
  }, [nodes, typeLabels]);
  const handleHoverChange = (state: HoverState) => {
    setHoverState(state);
    onHoverNode(state?.node || null);
  };

  const openNodeMenu = (nodeId: string, point: { x: number; y: number }) => {
    if (!nodeId) {
      setNodeMenu(null);
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    setNodeMenu({
      nodeId,
      x: rect ? point.x - rect.left : point.x,
      y: rect ? point.y - rect.top : point.y,
    });
  };

  return (
    <div
      ref={containerRef}
      className="sigma-evidence-graph"
      onContextMenu={(event) => event.preventDefault()}
      onClick={() => setNodeMenu(null)}
    >
      <SigmaContainer
        style={{ width: "100%", height: "100%", background: "transparent" }}
        settings={{
          allowInvalidContainer: true,
          defaultNodeType: "circle",
          renderEdgeLabels: false,
          hideEdgesOnMove: true,
          hideLabelsOnMove: true,
          defaultEdgeColor: "#cbd5e1",
          defaultNodeColor: "#94a3b8",
          labelSize: 13,
          labelWeight: "bold",
          labelColor: { color: "#1e293b" },
          stagePadding: 36,
          zIndex: true,
        }}
      >
        <GraphLoader nodes={nodes} edges={edges} colorMode={colorMode} nodeScale={nodeScale} graphSpacing={graphSpacing} />
        <EventHandler onSelectNode={onSelectNode} onHoverChange={handleHoverChange} onNodeMenu={openNodeMenu} />
        <GraphRenderSettings
          hoverState={hoverState}
          selectedNodeId={selectedNodeId}
          highlightedNodeIds={highlightedNodeIds}
          nodeCount={nodes.length}
        />
        <ZoomControls language={language} />
      </SigmaContainer>

      <button
        className="sigma-graph-display-toggle"
        title={text.display}
        aria-label={text.display}
        onClick={(event) => {
          event.stopPropagation();
          setShowDisplayPanel((value) => !value);
        }}
      >
        <Settings2 size={15} />
      </button>

      {showDisplayPanel && (
        <div className="sigma-graph-display-panel" onClick={(event) => event.stopPropagation()}>
          <div className="sigma-panel-head">
            <span><Filter size={14} />{text.display}</span>
            <button
              title={text.resetView}
              aria-label={text.resetView}
              onClick={() => {
                setNodeScale(DEFAULT_NODE_SCALE);
                setGraphSpacing(DEFAULT_GRAPH_SPACING);
              }}
            >
              <RotateCcw size={13} />
            </button>
          </div>
          <label>
            <span>{text.nodeSize}</span>
            <em>{Math.round(nodeScale * 100)}%</em>
            <input min={0.55} max={1.6} step={0.05} type="range" value={nodeScale} onChange={(event) => setNodeScale(Number(event.target.value))} />
          </label>
          <label>
            <span>{text.spacing}</span>
            <em>{Math.round(graphSpacing * 100)}%</em>
            <input min={0.65} max={2.2} step={0.05} type="range" value={graphSpacing} onChange={(event) => setGraphSpacing(Number(event.target.value))} />
          </label>
        </div>
      )}

      {nodeMenu && (
        <div className="sigma-node-menu" style={{ left: nodeMenu.x, top: nodeMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button
            onClick={() => {
              onHideNode(nodeMenu.nodeId);
              setNodeMenu(null);
            }}
          >
            <EyeOff size={14} />
            {text.hideNode}
          </button>
        </div>
      )}

      <div className="sigma-graph-legend">
        <div className="sigma-legend-head">
          <strong>{colorMode === "type" ? text.typeLegend : text.communityLegend}</strong>
          <button onClick={() => setLegendCollapsed((value) => !value)}>
            {legendCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
        {!legendCollapsed && (
          <div className="sigma-legend-scroll">
            {colorMode === "type"
              ? Object.entries(counts).map(([type, count]) => {
                const firstNode = nodes.find((node) => node.type === type);
                return (
                  <button
                    key={type}
                    className={activeType === type ? "active" : ""}
                    onClick={() => onSelectType(activeType === type ? "all" : type)}
                    disabled={!firstNode}
                    title={`${typeLabels[type] || type}: ${count}`}
                  >
                    <i style={{ backgroundColor: firstNode?.color || "#94a3b8" }} />
                    <span>{typeLabels[type] || type}</span>
                    <em>{count}</em>
                  </button>
                );
              })
              : communityItems.map((item) => (
                <div key={item.label} className="sigma-community-row">
                  <i style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                  <em>{item.count}</em>
                </div>
              ))}
          </div>
        )}
        {hiddenNodeCount > 0 && (
          <button className="sigma-show-hidden" onClick={onResetHiddenNodes}>
            <RotateCcw size={13} />
            {text.showHidden} · {hiddenNodeCount}
          </button>
        )}
      </div>
    </div>
  );
}
