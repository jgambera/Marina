import { header, separator } from "../../net/ansi";
import type { ArtilectDB } from "../../persistence/database";
import type { StorageProvider } from "../../storage/provider";
import type { CommandDef, Entity, EntityId, RoomContext } from "../../types";

const HELP =
  "Canvas management. Subcommands: canvas create <name> [desc] | canvas list | canvas info <name> | canvas publish <type> <asset_id> [canvas] | canvas nodes <name> | canvas layout <grid|timeline> <name> | canvas delete <name> | canvas asset upload|list|info|delete";

export function canvasCommand(opts: {
  getEntity: (id: string) => Entity | undefined;
  db?: ArtilectDB;
  storage?: StorageProvider;
  logEvent?: (event: { type: string; entity: EntityId; [k: string]: unknown }) => void;
}): CommandDef {
  return {
    name: "canvas",
    aliases: ["cv"],
    help: HELP,
    minRank: 1,
    handler: async (ctx: RoomContext, input) => {
      const entity = opts.getEntity(input.entity);
      if (!entity) return;
      if (!opts.db) {
        ctx.send(input.entity, "Canvas requires database support.");
        return;
      }
      const db = opts.db;
      const eid = input.entity;
      const tokens = input.tokens;
      const sub = tokens[0]?.toLowerCase();

      if (!sub) {
        ctx.send(eid, HELP);
        return;
      }

      switch (sub) {
        case "asset":
          await handleAsset(ctx, eid, entity, db, opts.storage, tokens.slice(1));
          return;
        case "create":
          handleCreate(ctx, eid, entity, db, tokens.slice(1));
          return;
        case "list":
          handleList(ctx, eid, db);
          return;
        case "info":
          handleInfo(ctx, eid, db, tokens.slice(1));
          return;
        case "publish":
          handlePublish(ctx, eid, entity, db, opts.storage, opts.logEvent, tokens.slice(1));
          return;
        case "nodes":
          handleNodes(ctx, eid, db, tokens.slice(1));
          return;
        case "layout":
          handleLayout(ctx, eid, db, tokens.slice(1));
          return;
        case "delete":
          handleDelete(ctx, eid, db, tokens.slice(1));
          return;
        default:
          ctx.send(eid, HELP);
      }
    },
  };
}

// ─── Canvas CRUD ─────────────────────────────────────────────────────────

function handleCreate(
  ctx: RoomContext,
  eid: EntityId,
  entity: Entity,
  db: ArtilectDB,
  tokens: string[],
): void {
  const name = tokens[0];
  if (!name) {
    ctx.send(eid, "Usage: canvas create <name> [description]");
    return;
  }
  const existing = db.getCanvasByName(name);
  if (existing) {
    ctx.send(eid, `Canvas "${name}" already exists.`);
    return;
  }
  const desc = tokens.slice(1).join(" ");
  const id = crypto.randomUUID();
  db.createCanvas({ id, name, description: desc, creatorName: entity.name });
  ctx.send(eid, `Canvas "${name}" created (${id.slice(0, 8)}..)`);
}

function handleList(ctx: RoomContext, eid: EntityId, db: ArtilectDB): void {
  const canvases = db.listCanvases({ limit: 20 });
  if (canvases.length === 0) {
    ctx.send(eid, "No canvases found. Use 'canvas create <name>' to make one.");
    return;
  }
  const lines = [
    header("Canvases"),
    separator(),
    ...canvases.map((c) => {
      const nodes = db.getNodesByCanvas(c.id);
      const date = new Date(c.updated_at).toISOString().slice(0, 10);
      return `  ${c.name} (${nodes.length} nodes, ${date}) by ${c.creator_name}`;
    }),
  ];
  ctx.send(eid, lines.join("\n"));
}

function handleInfo(ctx: RoomContext, eid: EntityId, db: ArtilectDB, tokens: string[]): void {
  const name = tokens[0];
  if (!name) {
    ctx.send(eid, "Usage: canvas info <name>");
    return;
  }
  const canvas = db.getCanvasByName(name);
  if (!canvas) {
    ctx.send(eid, `Canvas "${name}" not found.`);
    return;
  }
  const nodes = db.getNodesByCanvas(canvas.id);
  const created = new Date(canvas.created_at).toISOString().slice(0, 16).replace("T", " ");
  const updated = new Date(canvas.updated_at).toISOString().slice(0, 16).replace("T", " ");
  const lines = [
    header(`Canvas: ${canvas.name}`),
    separator(),
    `  ID:          ${canvas.id}`,
    `  Description: ${canvas.description || "(none)"}`,
    `  Scope:       ${canvas.scope}${canvas.scope_id ? ` (${canvas.scope_id})` : ""}`,
    `  Creator:     ${canvas.creator_name}`,
    `  Created:     ${created}`,
    `  Updated:     ${updated}`,
    `  Nodes:       ${nodes.length}`,
  ];
  ctx.send(eid, lines.join("\n"));
}

function handlePublish(
  ctx: RoomContext,
  eid: EntityId,
  entity: Entity,
  db: ArtilectDB,
  storage: StorageProvider | undefined,
  logEvent: ((event: { type: string; entity: EntityId; [k: string]: unknown }) => void) | undefined,
  tokens: string[],
): void {
  const type = tokens[0]?.toLowerCase();
  const assetId = tokens[1];
  const canvasName = tokens[2];

  if (!type || !assetId) {
    ctx.send(eid, "Usage: canvas publish <type> <asset_id> [canvas_name]");
    return;
  }

  const validTypes = ["image", "video", "pdf", "audio", "document", "text", "embed", "frame"];
  if (!validTypes.includes(type)) {
    ctx.send(eid, `Invalid node type. Valid: ${validTypes.join(", ")}`);
    return;
  }

  // Verify asset exists
  const asset =
    db.getAsset(assetId) ?? db.listAssets({ limit: 200 }).find((a) => a.id.startsWith(assetId));
  if (!asset) {
    ctx.send(eid, `Asset "${assetId}" not found.`);
    return;
  }

  // Find or use default canvas — prefer "global"
  let canvas = canvasName
    ? db.getCanvasByName(canvasName)
    : (db.getCanvasByName("global") ?? db.listCanvases({ limit: 1 })[0]);
  if (!canvas) {
    // Auto-create the global canvas
    const id = crypto.randomUUID();
    db.createCanvas({
      id,
      name: "global",
      description: "Shared canvas for all entities",
      creatorName: entity.name,
    });
    canvas = db.getCanvas(id)!;
  }

  // Auto-position: place new node below existing ones
  const existingNodes = db.getNodesByCanvas(canvas.id);
  const maxY = existingNodes.reduce((max, n) => Math.max(max, n.y + n.height), 0);

  const nodeId = crypto.randomUUID();
  db.createNode({
    id: nodeId,
    canvasId: canvas.id,
    type,
    x: 0,
    y: maxY + 20,
    assetId: asset.id,
    data: {
      filename: asset.filename,
      mime: asset.mime_type,
      url: storage?.resolve(asset.storage_key),
    },
    creatorName: entity.name,
  });

  if (logEvent) {
    logEvent({
      type: "canvas_publish",
      entity: eid,
      canvasId: canvas.id,
      nodeId,
      timestamp: Date.now(),
    });
  }

  ctx.send(eid, `Published ${type} node to canvas "${canvas.name}" (asset: ${asset.filename})`);
}

function handleNodes(ctx: RoomContext, eid: EntityId, db: ArtilectDB, tokens: string[]): void {
  const name = tokens[0];
  if (!name) {
    ctx.send(eid, "Usage: canvas nodes <name>");
    return;
  }
  const canvas = db.getCanvasByName(name);
  if (!canvas) {
    ctx.send(eid, `Canvas "${name}" not found.`);
    return;
  }
  const nodes = db.getNodesByCanvas(canvas.id);
  if (nodes.length === 0) {
    ctx.send(eid, `Canvas "${name}" has no nodes.`);
    return;
  }
  const lines = [
    header(`Canvas "${name}" Nodes`),
    separator(),
    ...nodes.map((n) => {
      const date = new Date(n.created_at).toISOString().slice(0, 10);
      return `  ${n.id.slice(0, 8)}.. [${n.type}] ${n.width}x${n.height} at (${n.x},${n.y}) by ${n.creator_name} ${date}`;
    }),
  ];
  ctx.send(eid, lines.join("\n"));
}

function handleDelete(ctx: RoomContext, eid: EntityId, db: ArtilectDB, tokens: string[]): void {
  const name = tokens[0];
  if (!name) {
    ctx.send(eid, "Usage: canvas delete <name>");
    return;
  }
  const canvas = db.getCanvasByName(name);
  if (!canvas) {
    ctx.send(eid, `Canvas "${name}" not found.`);
    return;
  }
  db.deleteCanvas(canvas.id);
  ctx.send(eid, `Canvas "${name}" deleted.`);
}

// ─── Layout ─────────────────────────────────────────────────────────────

function handleLayout(ctx: RoomContext, eid: EntityId, db: ArtilectDB, tokens: string[]): void {
  const algo = tokens[0]?.toLowerCase();
  const name = tokens[1];
  if (!algo || !name) {
    ctx.send(eid, "Usage: canvas layout <grid|timeline> <canvas_name>");
    return;
  }
  const canvas = db.getCanvasByName(name);
  if (!canvas) {
    ctx.send(eid, `Canvas "${name}" not found.`);
    return;
  }
  const nodes = db.getNodesByCanvas(canvas.id);
  if (nodes.length === 0) {
    ctx.send(eid, `Canvas "${name}" has no nodes to layout.`);
    return;
  }

  if (algo === "grid") {
    const cols = 3;
    const padX = 20;
    const padY = 20;
    const nodeW = 320;
    const nodeH = 240;
    for (let i = 0; i < nodes.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      db.updateNode(nodes[i]!.id, {
        x: col * (nodeW + padX),
        y: row * (nodeH + padY),
      });
    }
    ctx.send(eid, `Arranged ${nodes.length} nodes in a ${cols}-column grid.`);
    return;
  }

  if (algo === "timeline") {
    const sorted = [...nodes].sort((a, b) => a.created_at - b.created_at);
    const padX = 40;
    const nodeW = 320;
    for (let i = 0; i < sorted.length; i++) {
      db.updateNode(sorted[i]!.id, {
        x: i * (nodeW + padX),
        y: 0,
      });
    }
    ctx.send(eid, `Arranged ${sorted.length} nodes in chronological timeline.`);
    return;
  }

  ctx.send(eid, "Unknown layout algorithm. Use 'grid' or 'timeline'.");
}

// ─── Asset Handling ──────────────────────────────────────────────────────

async function handleAsset(
  ctx: RoomContext,
  eid: EntityId,
  entity: Entity,
  db: ArtilectDB,
  storage: StorageProvider | undefined,
  tokens: string[],
): Promise<void> {
  const action = tokens[0]?.toLowerCase();

  if (!action) {
    ctx.send(
      eid,
      "Usage: canvas asset upload <url> | canvas asset list | canvas asset info <id> | canvas asset delete <id>",
    );
    return;
  }

  switch (action) {
    case "upload": {
      const url = tokens[1];
      if (!url) {
        ctx.send(eid, "Usage: canvas asset upload <url>");
        return;
      }
      if (!storage) {
        ctx.send(eid, "Asset storage not configured.");
        return;
      }
      if (!ctx.fetch) {
        ctx.send(eid, "HTTP fetch not available in this context.");
        return;
      }
      try {
        const response = await ctx.fetch(url);
        if ("error" in response) {
          ctx.send(eid, `Failed to fetch URL: ${response.error}`);
          return;
        }
        if (response.status >= 400) {
          ctx.send(eid, `Failed to fetch URL: HTTP ${response.status}`);
          return;
        }
        const bodyBytes = new TextEncoder().encode(response.body);
        if (bodyBytes.byteLength === 0) {
          ctx.send(eid, "Downloaded file is empty.");
          return;
        }
        if (bodyBytes.byteLength > 50 * 1024 * 1024) {
          ctx.send(eid, "File too large (max 50MB).");
          return;
        }
        const filename = url.split("/").pop()?.split("?")[0] ?? "download";
        const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
        const mime = guessMime(ext);
        const id = crypto.randomUUID();
        const storageKey = `${id}${ext}`;

        await storage.put(storageKey, bodyBytes, mime);
        db.createAsset({
          id,
          entityName: entity.name,
          filename,
          mimeType: mime,
          size: bodyBytes.byteLength,
          storageKey,
        });

        const sizeKb = Math.round(bodyBytes.byteLength / 1024);
        ctx.send(eid, `Asset uploaded: ${id} (${filename}, ${sizeKb}KB, ${mime})`);
      } catch (err) {
        ctx.send(eid, `Upload failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    case "list": {
      const mine = tokens[1]?.toLowerCase() === "mine";
      const assets = mine ? db.getAssetsByEntity(entity.name, 20) : db.listAssets({ limit: 20 });
      if (assets.length === 0) {
        ctx.send(eid, "No assets found.");
        return;
      }
      const lines = [
        header("Assets"),
        separator(),
        ...assets.map((a) => {
          const sizeKb = Math.round(a.size / 1024);
          const date = new Date(a.created_at).toISOString().slice(0, 10);
          return `  ${a.id.slice(0, 8)}.. ${date} ${a.filename} (${sizeKb}KB, ${a.mime_type}) by ${a.entity_name}`;
        }),
      ];
      ctx.send(eid, lines.join("\n"));
      return;
    }

    case "info": {
      const id = tokens[1];
      if (!id) {
        ctx.send(eid, "Usage: canvas asset info <id>");
        return;
      }
      const asset =
        db.getAsset(id) ?? db.listAssets({ limit: 100 }).find((a) => a.id.startsWith(id));
      if (!asset) {
        ctx.send(eid, `Asset "${id}" not found.`);
        return;
      }
      const sizeKb = Math.round(asset.size / 1024);
      const date = new Date(asset.created_at).toISOString().slice(0, 16).replace("T", " ");
      const lines = [
        header("Asset Info"),
        separator(),
        `  ID:       ${asset.id}`,
        `  File:     ${asset.filename}`,
        `  Type:     ${asset.mime_type}`,
        `  Size:     ${sizeKb}KB`,
        `  Owner:    ${asset.entity_name}`,
        `  Created:  ${date}`,
        `  Key:      ${asset.storage_key}`,
      ];
      ctx.send(eid, lines.join("\n"));
      return;
    }

    case "delete": {
      const id = tokens[1];
      if (!id) {
        ctx.send(eid, "Usage: canvas asset delete <id>");
        return;
      }
      const asset =
        db.getAsset(id) ?? db.listAssets({ limit: 100 }).find((a) => a.id.startsWith(id));
      if (!asset) {
        ctx.send(eid, `Asset "${id}" not found.`);
        return;
      }
      if (storage) {
        await storage.delete(asset.storage_key);
      }
      db.deleteAsset(asset.id);
      ctx.send(eid, `Asset ${asset.id.slice(0, 8)}.. deleted.`);
      return;
    }

    default:
      ctx.send(
        eid,
        "Usage: canvas asset upload <url> | canvas asset list | canvas asset info <id> | canvas asset delete <id>",
      );
  }
}

function guessMime(ext: string): string {
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
    ".json": "application/json",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}
