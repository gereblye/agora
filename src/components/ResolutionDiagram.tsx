"use client";

import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ProofNode } from "@/lib/logic/resolution";

const COLORS: Record<ProofNode["source"], { bg: string; border: string }> = {
  premise: { bg: "#eef4ef", border: "#2f6f4f" },
  "negated-goal": { bg: "#f7e9e7", border: "#a23b32" },
  resolvent: { bg: "#ffffff", border: "#c9c5b6" },
};

export function ResolutionDiagram({ proof }: { proof: ProofNode[] }) {
  // Layered layout: inputs at top, □ at the bottom. Parents always have a lower
  // id than their resolvents, so a single forward pass computes depths.
  const depth = new Map<number, number>();
  for (const n of [...proof].sort((a, b) => a.id - b.id)) {
    depth.set(n.id, n.parents.length === 0 ? 0 : Math.max(...n.parents.map((p) => depth.get(p) ?? 0)) + 1);
  }
  const maxDepth = Math.max(...depth.values());
  const perLayer = new Map<number, number>();

  const rfNodes: Node[] = proof.map((n) => {
    const d = depth.get(n.id) ?? 0;
    const idx = perLayer.get(d) ?? 0;
    perLayer.set(d, idx + 1);
    const isEmpty = n.clause.length === 0;
    const c = COLORS[n.source];
    return {
      id: String(n.id),
      position: { x: 40 + idx * 190, y: 30 + d * 90 },
      data: { label: isEmpty ? "□  (contradiction)" : n.label },
      draggable: false,
      style: {
        background: isEmpty ? "#1a1a17" : c.bg,
        color: isEmpty ? "#fff" : "#1a1a17",
        border: `1.5px solid ${isEmpty ? "#1a1a17" : c.border}`,
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 12,
        fontFamily: "ui-monospace, monospace",
        width: 168,
        textAlign: "center" as const,
      },
    };
  });

  const rfEdges: Edge[] = proof.flatMap((n) =>
    n.parents.map((p) => ({
      id: `${p}-${n.id}`,
      source: String(p),
      target: String(n.id),
      animated: n.clause.length === 0,
      label: n.on,
      style: { stroke: "#b7b2a2" },
      labelStyle: { fontSize: 10, fill: "#6b6b63" },
    }))
  );

  return (
    <div className="h-[360px] w-full overflow-hidden rounded-lg border border-line bg-[var(--bg)]">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        nodesDraggable={false}
      >
        <Background color="#d8d4c6" gap={18} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
