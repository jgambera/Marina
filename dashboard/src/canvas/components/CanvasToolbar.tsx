import type { Node } from "@xyflow/react";
import { defaultSize } from "../lib/layout";

interface CanvasToolbarProps {
  canvasId: string | null;
  nodes: Node[];
  selectedCount?: number;
  onDelete?: () => void;
}

const API_BASE = window.location.origin;

export function CanvasToolbar({
  canvasId,
  nodes,
  selectedCount = 0,
  onDelete,
}: CanvasToolbarProps) {
  const exportCanvas = () => {
    if (!canvasId) return;
    const data = {
      canvasId,
      exportedAt: new Date().toISOString(),
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
        style: n.style,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canvas-${canvasId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const layoutGrid = async () => {
    if (!canvasId) return;
    const cols = 4;
    const gap = 20;
    const cellW = 420;
    const cellH = 500;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * (cellW + gap);
      const y = row * (cellH + gap);
      const size = defaultSize(node.type ?? "text");

      try {
        await fetch(`${API_BASE}/api/canvases/${canvasId}/nodes/${node.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x, y, width: size.w, height: size.h }),
        });
      } catch {
        // Continue with remaining nodes
      }
    }
    window.location.reload();
  };

  const layoutTimeline = async () => {
    if (!canvasId) return;
    const sorted = [...nodes].sort((a, b) => {
      const aTime = (a.data.created_at as number) ?? 0;
      const bTime = (b.data.created_at as number) ?? 0;
      return aTime - bTime;
    });

    const gap = 40;
    let x = 0;

    for (let i = 0; i < sorted.length; i++) {
      const node = sorted[i]!;
      const size = defaultSize(node.type ?? "text");
      try {
        await fetch(`${API_BASE}/api/canvases/${canvasId}/nodes/${node.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x, y: 0, width: size.w, height: size.h }),
        });
      } catch {
        // Continue
      }
      x += size.w + gap;
    }
    window.location.reload();
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={exportCanvas}
        disabled={!canvasId}
        className="text-xs text-gray-400 hover:text-gray-200 bg-gray-800 px-2 py-1 rounded border border-gray-700 disabled:opacity-30"
        title="Export canvas as JSON"
      >
        Export
      </button>
      <button
        onClick={layoutGrid}
        disabled={!canvasId || nodes.length === 0}
        className="text-xs text-gray-400 hover:text-gray-200 bg-gray-800 px-2 py-1 rounded border border-gray-700 disabled:opacity-30"
        title="Arrange nodes in a grid"
      >
        Grid
      </button>
      <button
        onClick={layoutTimeline}
        disabled={!canvasId || nodes.length === 0}
        className="text-xs text-gray-400 hover:text-gray-200 bg-gray-800 px-2 py-1 rounded border border-gray-700 disabled:opacity-30"
        title="Arrange nodes in a timeline"
      >
        Timeline
      </button>
      {selectedCount > 0 && onDelete && (
        <button
          onClick={onDelete}
          className="text-xs text-red-400 hover:text-red-200 bg-gray-800 px-2 py-1 rounded border border-red-900/50 hover:border-red-700"
          title={`Delete ${selectedCount} selected node${selectedCount > 1 ? "s" : ""}`}
        >
          Delete ({selectedCount})
        </button>
      )}
    </div>
  );
}
