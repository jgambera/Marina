import { useEffect, useRef } from "react";
import type { Node } from "@xyflow/react";
import { defaultSize, nextTilePosition } from "../lib/layout";
import type { CanvasNodeData } from "../lib/types";

type SetNodes = React.Dispatch<React.SetStateAction<Node[]>>;

function toFlowNode(n: CanvasNodeData, existing: Node[]): Node {
  const ds = defaultSize(n.type);
  const isGenericDefault = n.width === 300 && n.height === 200;
  const w = isGenericDefault ? ds.w : n.width;
  const h = isGenericDefault ? ds.h : n.height;

  // Auto-tile new nodes that arrive at 0,0
  const needsTile = n.x === 0 && n.y === 0 && existing.length > 0;
  const pos = needsTile ? nextTilePosition(existing) : { x: n.x, y: n.y };

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

interface CanvasEvent {
  type: "node_added" | "node_updated" | "node_deleted";
  canvasId: string;
  node?: CanvasNodeData;
  nodeId?: string;
  changes?: CanvasNodeData;
}

/**
 * Connects to the canvas WebSocket and merges real-time events into the
 * React Flow node state.
 */
export function useCanvasWs(canvasId: string | null, setNodes: SetNodes) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!canvasId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/canvas-ws?canvas=${canvasId}`);
    wsRef.current = ws;

    ws.onmessage = (msg) => {
      let event: CanvasEvent;
      try {
        event = JSON.parse(msg.data);
      } catch {
        return;
      }

      if (event.type === "node_added" && event.node) {
        const nodeData = event.node;
        setNodes((prev) => {
          if (prev.some((n) => n.id === nodeData.id)) return prev;
          const flowNode = toFlowNode(nodeData, prev);
          return [...prev, flowNode];
        });
      }

      if (event.type === "node_updated" && event.nodeId && event.changes) {
        const c = event.changes;
        const ds = defaultSize(c.type);
        const isGenericDefault = c.width === 300 && c.height === 200;
        const w = isGenericDefault ? ds.w : c.width;
        const h = isGenericDefault ? ds.h : c.height;

        setNodes((prev) =>
          prev.map((n) => {
            if (n.id !== event.nodeId) return n;
            return {
              ...n,
              position: { x: c.x, y: c.y },
              data: {
                ...c.data,
                asset_id: c.asset_id,
                creator_name: c.creator_name,
                created_at: c.created_at,
                canvas_id: c.canvas_id,
              },
              style: { width: w, height: h },
            };
          }),
        );
      }

      if (event.type === "node_deleted" && event.nodeId) {
        setNodes((prev) => prev.filter((n) => n.id !== event.nodeId));
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [canvasId, setNodes]);
}
