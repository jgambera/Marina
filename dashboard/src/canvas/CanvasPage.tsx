import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeDimensionChange,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasToolbar } from "./components/CanvasToolbar";
import { SearchBar } from "./components/SearchBar";
import { fetchCanvases, useCanvas } from "./hooks/use-canvas";
import { useCanvasWs } from "./hooks/use-canvas-ws";
import { defaultSize } from "./lib/layout";
import type { CanvasData } from "./lib/types";
import { nodeTypes } from "./nodes";

const API_BASE = window.location.origin;

const MIME_TO_NODE_TYPE: Record<string, string> = {
  "image/": "image",
  "video/": "video",
  "audio/": "audio",
  "application/pdf": "pdf",
  "text/": "document",
};

function guessNodeType(mime: string): string {
  for (const [prefix, type] of Object.entries(MIME_TO_NODE_TYPE)) {
    if (mime.startsWith(prefix)) return type;
  }
  return "document";
}

function CanvasInner() {
  const [canvasList, setCanvasList] = useState<CanvasData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filteredIds, setFilteredIds] = useState<Set<string> | null>(null);
  const [dropping, setDropping] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Load canvas list on mount — default to "global" canvas
  useEffect(() => {
    fetchCanvases().then((list) => {
      setCanvasList(list);
      if (list.length > 0 && !selectedId) {
        const global = list.find((c) => c.name === "global");
        setSelectedId(global?.id ?? list[0]!.id);
      }
    });
  }, []);

  const {
    canvas,
    nodes,
    setNodes,
    loading,
    error,
    onNodesChange,
    persistNodePosition,
    persistNodeSize,
    deleteNodes,
  } = useCanvas(selectedId);

  // Real-time updates via WebSocket
  useCanvasWs(selectedId, setNodes);

  // Track selected nodes for toolbar delete button
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  const onSelectionChange = useCallback(({ nodes: sel }: OnSelectionChangeParams) => {
    setSelectedNodeIds(sel.map((n) => n.id));
  }, []);

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      deleteNodes(deleted.map((n) => n.id));
    },
    [deleteNodes],
  );

  const handleToolbarDelete = useCallback(() => {
    if (selectedNodeIds.length > 0) {
      deleteNodes(selectedNodeIds);
      setSelectedNodeIds([]);
    }
  }, [selectedNodeIds, deleteNodes]);

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      persistNodePosition(node.id, node.position.x, node.position.y);
    },
    [persistNodePosition],
  );

  // Persist resize when a dimension change is completed
  const resizeTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);

      // Debounce resize persistence — dimension changes fire continuously
      for (const change of changes) {
        if (change.type === "dimensions" && change.resizing === false) {
          const dc = change as NodeDimensionChange;
          const nodeId = dc.id;
          clearTimeout(resizeTimerRef.current[nodeId]);
          resizeTimerRef.current[nodeId] = setTimeout(() => {
            // Read the final dimensions from the current nodes
            setNodes((cur) => {
              const n = cur.find((nd) => nd.id === nodeId);
              if (n?.measured?.width && n?.measured?.height) {
                persistNodeSize(nodeId, n.measured.width, n.measured.height);
              }
              return cur;
            });
          }, 200);
        }
      }
    },
    [onNodesChange, persistNodeSize, setNodes],
  );

  const displayNodes = useMemo(() => {
    if (!filteredIds) return nodes;
    return nodes.map((n) => ({
      ...n,
      hidden: !filteredIds.has(n.id),
    }));
  }, [nodes, filteredIds]);

  const onFilterChange = useCallback((filtered: Node[] | null) => {
    if (!filtered) {
      setFilteredIds(null);
      return;
    }
    setFilteredIds(new Set(filtered.map((n) => n.id)));
  }, []);

  // ── Drag & Drop Upload ───────────────────────────────────────────────

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropping(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the wrapper (not entering a child)
    if (e.currentTarget.contains(e.relatedTarget as HTMLElement)) return;
    setDropping(false);
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDropping(false);

      if (!selectedId) return;
      const files = e.dataTransfer.files;
      if (!files.length) return;

      // Convert screen position to flow coordinates
      const position = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        const nodeType = guessNodeType(file.type);
        const size = defaultSize(nodeType);
        const dropX = position.x + i * (size.w + 20);
        const dropY = position.y;

        try {
          // 1. Upload file as asset
          const form = new FormData();
          form.append("file", file);
          form.append("entity", "canvas-drop");

          const uploadRes = await fetch(`${API_BASE}/api/assets`, {
            method: "POST",
            body: form,
          });
          if (!uploadRes.ok) continue;
          const asset = await uploadRes.json();

          // 2. Create node on canvas at drop position with type-aware size
          await fetch(`${API_BASE}/api/canvases/${selectedId}/nodes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: nodeType,
              asset_id: asset.id,
              x: dropX,
              y: dropY,
              width: size.w,
              height: size.h,
              creator_name: "canvas-drop",
              data: {
                url: asset.url,
                filename: file.name,
                mime: file.type,
              },
            }),
          });
          // Node will appear via WebSocket broadcast
        } catch {
          // Continue with remaining files
        }
      }
    },
    [selectedId, screenToFlowPosition],
  );

  return (
    <div className="w-screen h-screen bg-gray-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-800">
        <h1 className="text-cyan-400 font-bold text-sm tracking-wider">ARTILECT CANVAS</h1>
        <div className="w-px h-5 bg-gray-700" />
        <select
          className="bg-gray-800 text-gray-300 text-sm rounded px-2 py-1 border border-gray-700 focus:outline-none focus:border-cyan-600"
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value || null)}
        >
          {canvasList.length === 0 && <option value="">No canvases</option>}
          {canvasList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {canvas && (
          <span className="text-xs text-gray-500">
            {canvas.description} &middot; {nodes.length} nodes &middot; by {canvas.creator_name}
          </span>
        )}
        <div className="flex-1" />
        <SearchBar nodes={nodes} onFilterChange={onFilterChange} />
        <div className="w-px h-5 bg-gray-700" />
        <CanvasToolbar
          canvasId={selectedId}
          nodes={nodes}
          selectedCount={selectedNodeIds.length}
          onDelete={handleToolbarDelete}
        />
        <div className="w-px h-5 bg-gray-700" />
        <a
          href="/dashboard"
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Dashboard
        </a>
      </div>

      {/* Canvas area */}
      <div
        ref={reactFlowWrapper}
        className="flex-1 relative"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {/* Drop overlay */}
        {dropping && (
          <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center bg-cyan-900/20 border-2 border-dashed border-cyan-500/50 rounded-lg m-2">
            <div className="text-cyan-400 text-lg font-medium">Drop files to add to canvas</div>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-cyan-400 text-sm animate-pulse">Loading canvas...</div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-red-400 text-sm">Error: {error}</div>
          </div>
        )}
        {!loading && !selectedId && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center text-gray-500">
              <div className="text-4xl mb-4">🖼️</div>
              <div className="text-lg mb-2">No Canvas Selected</div>
              <div className="text-sm">
                Create one in-game: <code className="text-cyan-400">canvas create mycanvas</code>
              </div>
            </div>
          </div>
        )}
        <ReactFlow
          nodes={displayNodes}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodesDelete={onNodesDelete}
          onSelectionChange={onSelectionChange}
          fitView
          minZoom={0.1}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
          className="bg-gray-950"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1a2332" />
          <Controls className="!bg-gray-800 !border-gray-700 !shadow-lg [&>button]:!bg-gray-800 [&>button]:!border-gray-700 [&>button]:!text-gray-400 [&>button:hover]:!bg-gray-700" />
          <MiniMap
            className="!bg-gray-900 !border-gray-700"
            nodeColor="#06b6d4"
            maskColor="rgba(0,0,0,0.7)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

export function CanvasPage() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
