import { useCallback, useEffect, useState } from "react";
import type { Node, NodeChange } from "@xyflow/react";
import { applyNodeChanges } from "@xyflow/react";
import { defaultSize, tilePosition } from "../lib/layout";
import type { CanvasData, CanvasNodeData } from "../lib/types";

const API_BASE = window.location.origin;

function toFlowNode(n: CanvasNodeData, index: number): Node {
  const ds = defaultSize(n.type);

  // Use stored dimensions if they differ from the old 300×200 default,
  // otherwise use the type-specific default
  const isGenericDefault = n.width === 300 && n.height === 200;
  const w = isGenericDefault ? ds.w : n.width;
  const h = isGenericDefault ? ds.h : n.height;

  // Auto-tile: if position is 0,0 and not the first node, use tiling
  const needsTile = n.x === 0 && n.y === 0 && index > 0;
  const pos = needsTile ? tilePosition(index) : { x: n.x, y: n.y };

  return {
    id: n.id,
    type: n.type,
    position: pos,
    data: {
      ...n.data,
      asset_id: n.asset_id,
      creator_name: n.creator_name,
      created_at: n.created_at,
      canvas_id: n.canvas_id,
    },
    style: { width: w, height: h },
  };
}

export function useCanvas(canvasId: string | null) {
  const [canvas, setCanvas] = useState<CanvasData | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch canvas data
  useEffect(() => {
    if (!canvasId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`${API_BASE}/api/canvases/${canvasId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: CanvasData) => {
        setCanvas(data);
        setNodes(data.nodes.map((n, i) => toFlowNode(n, i)));
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [canvasId]);

  // Handle node position/size changes (from drag or resize)
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  // Persist position change to backend
  const persistNodePosition = useCallback(
    async (nodeId: string, x: number, y: number) => {
      if (!canvasId) return;
      try {
        await fetch(`${API_BASE}/api/canvases/${canvasId}/nodes/${nodeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x, y }),
        });
      } catch {
        // Silent fail — position will be correct on next reload
      }
    },
    [canvasId],
  );

  // Persist size change to backend
  const persistNodeSize = useCallback(
    async (nodeId: string, width: number, height: number) => {
      if (!canvasId) return;
      try {
        await fetch(`${API_BASE}/api/canvases/${canvasId}/nodes/${nodeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ width: Math.round(width), height: Math.round(height) }),
        });
      } catch {
        // Silent fail
      }
    },
    [canvasId],
  );

  // Delete nodes from canvas
  const deleteNodes = useCallback(
    async (nodeIds: string[]) => {
      if (!canvasId || nodeIds.length === 0) return;
      // Snapshot for rollback on failure
      let snapshot: Node[] | null = null;
      setNodes((nds) => {
        snapshot = nds;
        return nds.filter((n) => !nodeIds.includes(n.id));
      });
      const failed: string[] = [];
      for (const nodeId of nodeIds) {
        try {
          const res = await fetch(`${API_BASE}/api/canvases/${canvasId}/nodes/${nodeId}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            console.error(`Canvas node delete failed: ${res.status}`);
            failed.push(nodeId);
          }
        } catch (err) {
          console.error("Canvas node delete error:", err);
          failed.push(nodeId);
        }
      }
      // Restore any nodes whose DELETE did not succeed
      if (failed.length > 0 && snapshot) {
        const restore = (snapshot as Node[]).filter((n) => failed.includes(n.id));
        setNodes((nds) => [...nds, ...restore]);
      }
    },
    [canvasId, setNodes],
  );

  return {
    canvas,
    nodes,
    setNodes,
    loading,
    error,
    onNodesChange,
    persistNodePosition,
    persistNodeSize,
    deleteNodes,
  };
}

/** Fetch list of all canvases */
export async function fetchCanvases(): Promise<CanvasData[]> {
  const r = await fetch(`${API_BASE}/api/canvases`);
  if (!r.ok) return [];
  return r.json();
}
