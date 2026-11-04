"use client";

import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ProofNode } from "@/lib/logic/resolution";

// A logical-resolution graph: the refutation DAG that derives the empty clause □.
// Inputs (premises + negated goal) sit on the top row; each resolvent hangs below
// its two parents; □ lands at the bottom. Layers are barycenter-ordered so parents
// sit above their children and edge crossings stay low.

type ClauseKind = ProofNode["source"] | "empty";

type ClauseData = {
  label: string;
  kind: ClauseKind;
};

const NODE_W = 178;
const STEP_X = 210;
const STEP_Y = 132;

const KIND_META: Record<ClauseKind, { tag: string; bg: string; border: string; accent: string }> = {
  premise: { tag: "premise", bg: "var(--surface)", border: "var(--for)", accent: "var(--for)" },
  "negated-goal": { tag: "negated goal", bg: "var(--accent-soft)", border: "var(--against)", accent: "var(--against)" },
  resolvent: { tag: "resolvent", bg: "var(--surface)", border: "var(--line)", accent: "var(--muted)" },
  empty: { tag: "contradiction", bg: "var(--ink)", border: "var(--ink)", accent: "#ffffff" },
};

const HANDLE_STYLE = {
  width: 6,
  height: 6,
  background: "var(--line)",
  border: "none",
  opacity: 0.6,
};

function ClauseNode({ data }: NodeProps) {
  const d = data as unknown as ClauseData;
  const meta = KIND_META[d.kind];
  const isEmpty = d.kind === "empty";

  return (
    <div
      style={{
        width: NODE_W,
        borderRadius: 10,
        border: `1.5px solid ${meta.border}`,
        background: meta.bg,
        boxShadow: "0 1px 2px rgba(26,26,23,0.06)",
        padding: "8px 12px",
        textAlign: "center",
      }}
    >
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: 600,
          color: meta.accent,
          marginBottom: 3,
          opacity: isEmpty ? 0.85 : 1,
        }}
      >
        {meta.tag}
      </div>
      <div
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: isEmpty ? 18 : 13,
          lineHeight: 1.25,
          color: isEmpty ? "#ffffff" : "var(--ink)",
          wordBreak: "break-word",
        }}
      >
        {isEmpty ? "□" : d.label}
      </div>
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
    </div>
  );
}

const nodeTypes = { clause: ClauseNode };

function layout(proof: ProofNode[]) {
  const byId = new Map(proof.map((n) => [n.id, n]));
  const sorted = [...proof].sort((a, b) => a.id - b.id);

  // Depth: inputs at 0, each resolvent one below its deepest parent. Parents
  // always have a lower id, so a single forward pass suffices.
  const depth = new Map<number, number>();
  for (const n of sorted) {
    depth.set(n.id, n.parents.length === 0 ? 0 : Math.max(...n.parents.map((p) => depth.get(p) ?? 0)) + 1);
  }
  const maxDepth = Math.max(0, ...depth.values());

  const layers: number[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const n of sorted) layers[depth.get(n.id) ?? 0].push(n.id);

  const pos = new Map<number, { x: number; y: number }>();
  const maxCount = Math.max(1, ...layers.map((l) => l.length));
  const center = ((maxCount - 1) * STEP_X) / 2;

  layers.forEach((ids, d) => {
    if (d > 0) {
      // Order each layer by the mean x of its parents to reduce crossings.
      const bary = (id: number) => {
        const parents = byId.get(id)?.parents ?? [];
        if (!parents.length) return 0;
        return parents.reduce((sum, p) => sum + (pos.get(p)?.x ?? 0), 0) / parents.length;
      };
      ids.sort((a, b) => bary(a) - bary(b) || a - b);
    }
    const total = (ids.length - 1) * STEP_X;
    const start = center - total / 2;
    ids.forEach((id, i) => pos.set(id, { x: start + i * STEP_X, y: 30 + d * STEP_Y }));
  });

  return pos;
}

export function ResolutionDiagram({ proof }: { proof: ProofNode[] }) {
  const pos = layout(proof);

  const rfNodes: Node[] = proof.map((n) => {
    const kind: ClauseKind = n.clause.length === 0 ? "empty" : n.source;
    return {
      id: String(n.id),
      type: "clause",
      position: pos.get(n.id) ?? { x: 0, y: 0 },
      data: { label: n.label, kind } satisfies ClauseData,
      draggable: false,
      selectable: false,
    };
  });

  const rfEdges: Edge[] = proof.flatMap((n) =>
    n.parents.map((p) => {
      const toEmpty = n.clause.length === 0;
      return {
        id: `${p}-${n.id}`,
        source: String(p),
        target: String(n.id),
        animated: toEmpty,
        label: n.on,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "var(--muted)" },
        style: { stroke: toEmpty ? "var(--against)" : "var(--line)", strokeWidth: 1.5 },
        labelStyle: { fontSize: 10, fontFamily: "ui-monospace, monospace", fill: "var(--muted)" },
        labelBgStyle: { fill: "var(--bg)" },
        labelBgPadding: [3, 1] as [number, number],
        labelBgBorderRadius: 3,
      };
    })
  );

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="h-[400px] w-full">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          proOptions={{ hideAttribution: true }}
          nodesConnectable={false}
          nodesDraggable={false}
          minZoom={0.2}
        >
          <Background color="var(--line)" gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  const items: { kind: ClauseKind; label: string }[] = [
    { kind: "premise", label: "premise" },
    { kind: "negated-goal", label: "negated goal" },
    { kind: "resolvent", label: "resolvent" },
    { kind: "empty", label: "□ empty clause" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-4 py-2.5 text-xs text-muted">
      {items.map(({ kind, label }) => {
        const meta = KIND_META[kind];
        return (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-[3px]"
              style={{ background: meta.bg, border: `1.5px solid ${meta.border}` }}
            />
            {label}
          </span>
        );
      })}
      <span className="ml-auto text-[11px] italic">inputs on top · resolving downward to □</span>
    </div>
  );
}
