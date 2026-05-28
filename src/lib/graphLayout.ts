export type RadialGraphViewBox = {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export type RadialGraphNode = {
  id: string;
  type: string;
  label: string;
};

export type RadialGraphEdge = {
  from: string;
  to: string;
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function radialGraphRadii(viewBox: RadialGraphViewBox) {
  const outer = Math.max(170, Math.min(viewBox.width, viewBox.height) / 2 - 58);
  return {
    inner: Math.max(46, outer * 0.22),
    middle: Math.max(112, outer * 0.62),
    outer,
  };
}

export function radialGraphPositions(
  nodes: RadialGraphNode[],
  edges: RadialGraphEdge[],
  viewBox: RadialGraphViewBox,
  typeRank: Record<string, number> = {},
) {
  const positions = new Map<string, { x: number; y: number }>();
  if (!nodes.length) return positions;

  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  }

  const sorted = [...nodes].sort((a, b) =>
    (degree.get(b.id) || 0) - (degree.get(a.id) || 0)
    || (typeRank[a.type] ?? 99) - (typeRank[b.type] ?? 99)
    || a.label.localeCompare(b.label)
  );
  if (sorted.length === 1) {
    positions.set(sorted[0].id, { x: viewBox.centerX, y: viewBox.centerY });
    return positions;
  }

  const radii = radialGraphRadii(viewBox);
  const hubCount = Math.min(
    sorted.length,
    Math.max(1, Math.min(3, sorted.filter((node) => (degree.get(node.id) || 0) >= 3).length)),
  );
  const hubNodes = sorted.slice(0, hubCount);
  const hubIds = new Set(hubNodes.map((node) => node.id));
  hubNodes.forEach((node, index) => {
    if (hubNodes.length === 1) {
      positions.set(node.id, { x: viewBox.centerX, y: viewBox.centerY });
      return;
    }
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / hubNodes.length;
    positions.set(node.id, {
      x: viewBox.centerX + Math.cos(angle) * radii.inner,
      y: viewBox.centerY + Math.sin(angle) * radii.inner,
    });
  });

  const middleRing: RadialGraphNode[] = [];
  const outerRing: RadialGraphNode[] = [];
  for (const node of sorted) {
    if (hubIds.has(node.id)) continue;
    const nodeDegree = degree.get(node.id) || 0;
    if (nodeDegree <= 1 || node.type === "review" || node.type === "proposal" || node.type === "warning") {
      outerRing.push(node);
    } else {
      middleRing.push(node);
    }
  }

  const placeRing = (ringNodes: RadialGraphNode[], radius: number, offset: number) => {
    ringNodes.forEach((node, index) => {
      const angle = -Math.PI / 2 + offset + index * GOLDEN_ANGLE;
      positions.set(node.id, {
        x: viewBox.centerX + Math.cos(angle) * radius,
        y: viewBox.centerY + Math.sin(angle) * radius,
      });
    });
  };

  placeRing(middleRing, outerRing.length ? radii.middle : radii.outer * 0.78, 0.38);
  placeRing(outerRing, radii.outer, 0);

  return positions;
}
