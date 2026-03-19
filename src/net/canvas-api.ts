import type { MarinaDB } from "../persistence/database";
import type { StorageProvider } from "../storage/provider";
import type { CanvasBroadcaster } from "./canvas-ws";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

function resolveNodeUrl(
  node: { asset_id: string | null; data: string },
  db: MarinaDB,
  storage?: StorageProvider,
): string | undefined {
  if (!node.asset_id || !storage) return undefined;
  const asset = db.getAsset(node.asset_id);
  return asset ? storage.resolve(asset.storage_key) : undefined;
}

/** Handle REST API requests for /api/canvases. */
export async function handleCanvasApi(
  url: URL,
  method: string,
  req: Request,
  db: MarinaDB,
  storage?: StorageProvider,
  broadcaster?: CanvasBroadcaster,
): Promise<Response> {
  // DELETE /api/canvases/:id/nodes/:nodeId
  const nodeMatch = url.pathname.match(/^\/api\/canvases\/([^/]+)\/nodes\/([^/]+)$/);
  if (nodeMatch) {
    const canvasId = decodeURIComponent(nodeMatch[1]!);
    const nodeId = decodeURIComponent(nodeMatch[2]!);

    if (method === "DELETE") {
      // Fetch the node first so we can clean up its asset
      const node = db.getNode(nodeId);
      if (!node) return json({ error: "Node not found" }, 404);
      const deleted = db.deleteNode(nodeId);
      if (!deleted) return json({ error: "Node not found" }, 404);
      // Clean up associated asset file and DB row
      if (node.asset_id && storage) {
        const asset = db.getAsset(node.asset_id);
        if (asset) {
          await storage.delete(asset.storage_key);
          db.deleteAsset(node.asset_id);
        }
      }
      broadcaster?.broadcast({ type: "node_deleted", canvasId, nodeId });
      return json({ ok: true, id: nodeId });
    }

    if (method === "PATCH") {
      const body = (await req.json()) as Record<string, unknown>;
      const updated = db.updateNode(nodeId, {
        x: body.x as number | undefined,
        y: body.y as number | undefined,
        width: body.width as number | undefined,
        height: body.height as number | undefined,
        data: body.data ? JSON.stringify(body.data) : undefined,
      });
      if (!updated) return json({ error: "Node not found" }, 404);
      const node = db.getNode(nodeId)!;
      const parsed = JSON.parse(node.data);
      const nodeUrl = resolveNodeUrl(node, db, storage);
      const asset = node.asset_id ? db.getAsset(node.asset_id) : undefined;
      const enriched = {
        ...node,
        data: {
          ...parsed,
          url: nodeUrl,
          filename: asset?.filename ?? parsed.filename,
          mime: asset?.mime_type ?? parsed.mime,
        },
      };
      broadcaster?.broadcast({
        type: "node_updated",
        canvasId,
        nodeId,
        changes: enriched,
      });
      return json(enriched);
    }

    // GET single node
    if (method === "GET") {
      const node = db.getNode(nodeId);
      if (!node || node.canvas_id !== canvasId) return json({ error: "Node not found" }, 404);
      const parsed = JSON.parse(node.data);
      const nodeUrl = resolveNodeUrl(node, db, storage);
      const asset = node.asset_id ? db.getAsset(node.asset_id) : undefined;
      return json({
        ...node,
        data: {
          ...parsed,
          url: nodeUrl,
          filename: asset?.filename ?? parsed.filename,
          mime: asset?.mime_type ?? parsed.mime,
        },
      });
    }
  }

  // POST /api/canvases/:id/nodes — add node
  const nodesMatch = url.pathname.match(/^\/api\/canvases\/([^/]+)\/nodes$/);
  if (nodesMatch && method === "POST") {
    const canvasId = decodeURIComponent(nodesMatch[1]!);
    const canvas = db.getCanvas(canvasId);
    if (!canvas) return json({ error: "Canvas not found" }, 404);

    const body = (await req.json()) as Record<string, unknown>;
    const id = crypto.randomUUID();
    db.createNode({
      id,
      canvasId,
      type: (body.type as string) ?? "text",
      x: body.x as number | undefined,
      y: body.y as number | undefined,
      width: body.width as number | undefined,
      height: body.height as number | undefined,
      assetId: body.asset_id as string | undefined,
      data: body.data as Record<string, unknown> | undefined,
      creatorName: (body.creator_name as string) ?? "api",
    });

    const node = db.getNode(id)!;
    const parsed = JSON.parse(node.data);
    const url = resolveNodeUrl(node, db, storage);
    const asset = node.asset_id ? db.getAsset(node.asset_id) : undefined;
    const enriched = {
      ...node,
      data: {
        ...parsed,
        url,
        filename: asset?.filename ?? parsed.filename,
        mime: asset?.mime_type ?? parsed.mime,
      },
    };
    broadcaster?.broadcast({ type: "node_added", canvasId, node: enriched });
    return json(enriched, 201);
  }

  // Canvas detail + delete
  const canvasMatch = url.pathname.match(/^\/api\/canvases\/([^/]+)$/);
  if (canvasMatch) {
    const id = decodeURIComponent(canvasMatch[1]!);

    if (method === "DELETE") {
      const deleted = db.deleteCanvas(id);
      if (!deleted) return json({ error: "Canvas not found" }, 404);
      return json({ ok: true, id });
    }

    // GET canvas detail with nodes
    if (method === "GET") {
      const canvas = db.getCanvas(id);
      if (!canvas) return json({ error: "Canvas not found" }, 404);
      const nodes = db.getNodesByCanvas(id).map((n) => {
        const parsed = JSON.parse(n.data);
        const url = resolveNodeUrl(n, db, storage);
        const asset = n.asset_id ? db.getAsset(n.asset_id) : undefined;
        return {
          ...n,
          data: {
            ...parsed,
            url,
            filename: asset?.filename ?? parsed.filename,
            mime: asset?.mime_type ?? parsed.mime,
          },
        };
      });
      return json({ ...canvas, nodes });
    }
  }

  // POST /api/canvases — create canvas
  if (url.pathname === "/api/canvases" && method === "POST") {
    const body = (await req.json()) as Record<string, unknown>;
    const name = body.name as string;
    if (!name) return json({ error: "Name is required" }, 400);

    const existing = db.getCanvasByName(name);
    if (existing) return json({ error: "Canvas name already exists" }, 409);

    const id = crypto.randomUUID();
    db.createCanvas({
      id,
      name,
      description: (body.description as string) ?? "",
      scope: (body.scope as string) ?? "global",
      scopeId: body.scope_id as string | undefined,
      creatorName: (body.creator_name as string) ?? "api",
    });

    return json(db.getCanvas(id), 201);
  }

  // GET /api/canvases — list canvases
  if (url.pathname === "/api/canvases" && method === "GET") {
    const scope = url.searchParams.get("scope") ?? undefined;
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
    const canvases = db.listCanvases({ scope, limit });
    return json(canvases);
  }

  return json({ error: "Not found" }, 404);
}
