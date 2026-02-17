export interface CanvasData {
  id: string;
  name: string;
  description: string;
  scope: string;
  scope_id: string | null;
  creator_name: string;
  created_at: number;
  updated_at: number;
  nodes: CanvasNodeData[];
}

export interface CanvasNodeData {
  id: string;
  canvas_id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  asset_id: string | null;
  data: Record<string, unknown>;
  creator_name: string;
  created_at: number;
  updated_at: number;
}

export type NodeType =
  | "image"
  | "video"
  | "pdf"
  | "audio"
  | "document"
  | "text"
  | "embed"
  | "frame";
