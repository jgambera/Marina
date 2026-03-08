import { join } from "node:path";
import type { Server, ServerWebSocket } from "bun";
import type { RateLimiter } from "../auth/rate-limiter";
import type { Engine } from "../engine/engine";
import type { ArtilectDB } from "../persistence/database";
import type { StorageProvider } from "../storage/provider";
import type { Connection, EntityId, Perception } from "../types";
import { handleAssetApi, handleAssetServing } from "./asset-api";
import { handleCanvasApi } from "./canvas-api";
import { CanvasBroadcaster } from "./canvas-ws";
import { buildConnectManifest, handleSkillRequest } from "./connect-api";
import { handleDashboardApi } from "./dashboard-api";
import type { DashboardBroadcaster, DashboardWSData } from "./dashboard-ws";
import { handleModelApi } from "./model-api";

const WEBCHAT_PATH = join(import.meta.dir, "webchat.html");
const DASHBOARD_DIST = join(import.meta.dir, "../../dist/dashboard");

interface WSData {
  connId: string;
  isDashboard?: boolean;
  isCanvas?: boolean;
  canvasId?: string;
}

let wsIdCounter = 0;

export class WebSocketServer {
  private server: Server<WSData> | null = null;
  private sockets = new Map<string, ServerWebSocket<WSData>>();
  private broadcaster: DashboardBroadcaster | null = null;
  readonly canvasBroadcaster = new CanvasBroadcaster();
  private db?: ArtilectDB;
  private storage?: StorageProvider;

  constructor(
    private engine: Engine,
    private port: number,
    private rateLimiter?: RateLimiter,
  ) {}

  setBroadcaster(broadcaster: DashboardBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  setDb(db: ArtilectDB): void {
    this.db = db;
  }

  setStorage(storage: StorageProvider): void {
    this.storage = storage;
  }

  start(): void {
    const engine = this.engine;
    const sockets = this.sockets;
    const rateLimiter = this.rateLimiter;
    const self = this;

    this.server = Bun.serve<WSData>({
      port: this.port,
      idleTimeout: 255,

      async fetch(req, server) {
        const url = new URL(req.url);

        // CORS preflight
        if (req.method === "OPTIONS") {
          return new Response(null, {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            },
          });
        }

        // Dashboard WebSocket upgrade
        if (url.pathname === "/dashboard-ws") {
          const connId = `dash_${++wsIdCounter}`;
          const upgraded = server.upgrade(req, {
            data: { connId, isDashboard: true },
          });
          if (!upgraded) {
            return new Response("WebSocket upgrade failed", { status: 400 });
          }
          return undefined;
        }

        // Game WebSocket upgrade
        if (url.pathname === "/ws") {
          const connId = `ws_${++wsIdCounter}`;
          const upgraded = server.upgrade(req, { data: { connId } });
          if (!upgraded) {
            return new Response("WebSocket upgrade failed", { status: 400 });
          }
          return undefined;
        }

        // Canvas WebSocket upgrade
        if (url.pathname === "/canvas-ws") {
          const canvasId = url.searchParams.get("canvas");
          if (!canvasId) {
            return new Response("Missing canvas query param", { status: 400 });
          }
          const connId = `canvas_${++wsIdCounter}`;
          const upgraded = server.upgrade(req, {
            data: { connId, isCanvas: true, canvasId },
          });
          if (!upgraded) {
            return new Response("WebSocket upgrade failed", { status: 400 });
          }
          return undefined;
        }

        // Asset binary serving: GET /assets/*
        if (url.pathname.startsWith("/assets/") && self.storage) {
          return handleAssetServing(url, self.storage);
        }

        // Asset API routes: /api/assets*
        if (url.pathname.startsWith("/api/assets") && self.db && self.storage) {
          return handleAssetApi(url, req.method, req, self.db, self.storage);
        }

        // Canvas API routes: /api/canvases*
        if (url.pathname.startsWith("/api/canvases") && self.db) {
          return handleCanvasApi(
            url,
            req.method,
            req,
            self.db,
            self.storage,
            self.canvasBroadcaster,
          );
        }

        // Connect manifest
        if (url.pathname === "/api/connect") {
          return buildConnectManifest(req, engine);
        }

        // Skill document
        if (url.pathname === "/api/skill") {
          return handleSkillRequest();
        }

        // Model API routes (OpenAI + Ollama compatible)
        if (url.pathname.startsWith("/v1/")) {
          const modelResp = await handleModelApi(url, req.method, req, engine);
          if (modelResp) return modelResp;
        }
        if (
          url.pathname === "/api/tags" ||
          url.pathname === "/api/chat" ||
          url.pathname === "/api/generate"
        ) {
          const modelResp = await handleModelApi(url, req.method, req, engine);
          if (modelResp) return modelResp;
        }

        // API routes
        if (url.pathname.startsWith("/api/")) {
          return handleDashboardApi(url, req.method, engine, self.db);
        }

        // Health check
        if (url.pathname === "/health") {
          return Response.json({
            status: "ok",
            uptime: engine.getUptime(),
            connections: sockets.size,
            rooms: engine.rooms.size,
            entities: engine.entities.size,
            agents: engine.getOnlineAgents().length,
          });
        }

        // Dashboard SPA — serve static files from dist/dashboard/
        if (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/")) {
          const subPath =
            url.pathname === "/dashboard" ? "index.html" : url.pathname.replace("/dashboard/", "");

          const filePath = join(DASHBOARD_DIST, subPath);
          const file = Bun.file(filePath);

          // SPA fallback: if file doesn't match a known extension, serve index.html
          return file
            .exists()
            .then((exists) => {
              if (exists) {
                return new Response(file);
              }
              // SPA fallback
              return new Response(Bun.file(join(DASHBOARD_DIST, "index.html")));
            })
            .catch(() => new Response(Bun.file(join(DASHBOARD_DIST, "index.html"))));
        }

        // Canvas SPA — serve from same dist/dashboard/ (same SPA, path-based routing)
        if (url.pathname === "/canvas" || url.pathname.startsWith("/canvas/")) {
          return new Response(Bun.file(join(DASHBOARD_DIST, "index.html")), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }

        // Serve web chat widget
        if (url.pathname === "/" || url.pathname === "/chat") {
          const file = Bun.file(WEBCHAT_PATH);
          return new Response(file, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }

        return new Response("Artilect — connect via WebSocket at /ws", {
          status: 200,
        });
      },

      websocket: {
        open(ws) {
          const connId = ws.data.connId;

          // Dashboard WebSocket
          if (ws.data.isDashboard) {
            if (self.broadcaster) {
              self.broadcaster.addClient(ws as ServerWebSocket<DashboardWSData>, engine);
            }
            return;
          }

          // Canvas WebSocket
          if (ws.data.isCanvas && ws.data.canvasId) {
            self.canvasBroadcaster.addClient(ws, ws.data.canvasId);
            return;
          }

          // Game WebSocket
          sockets.set(connId, ws);

          const conn: Connection = {
            id: connId,
            protocol: "websocket",
            entity: null,
            connectedAt: Date.now(),
            send(perception: Perception) {
              if (ws.readyState === 1) {
                ws.send(JSON.stringify(perception));
              }
            },
            close() {
              ws.close();
            },
          };

          engine.addConnection(conn);

          // Send welcome prompt
          ws.send(
            JSON.stringify({
              kind: "system",
              timestamp: Date.now(),
              data: {
                text: 'Welcome to Artilect. Send {"type":"login","name":"YourName"} to begin.',
                skill: "/api/skill",
                connect: "/api/connect",
              },
            }),
          );
        },

        message(ws, message) {
          // Dashboard WS clients don't send game commands
          if (ws.data.isDashboard) return;

          const connId = ws.data.connId;
          const raw = typeof message === "string" ? message : new TextDecoder().decode(message);

          let parsed: {
            type: string;
            name?: string;
            command?: string;
            token?: string;
          };
          try {
            parsed = JSON.parse(raw);
          } catch {
            // Treat plain text as a command
            parsed = { type: "command", command: raw };
          }

          if (parsed.type === "login" && parsed.name) {
            const result = engine.login(connId, parsed.name);
            if ("error" in result) {
              ws.send(
                JSON.stringify({
                  kind: "error",
                  timestamp: Date.now(),
                  data: { text: result.error },
                }),
              );
              return;
            }
            ws.send(
              JSON.stringify({
                kind: "system",
                timestamp: Date.now(),
                data: {
                  text: `Logged in as ${parsed.name}.`,
                  entityId: result.entityId,
                  token: result.token,
                },
              }),
            );
            engine.sendLook(result.entityId);
            engine.sendBrief(result.entityId);
            return;
          }

          if (parsed.type === "auth" && parsed.token) {
            const result = engine.reconnect(connId, parsed.token);
            if ("error" in result) {
              ws.send(
                JSON.stringify({
                  kind: "error",
                  timestamp: Date.now(),
                  data: { text: result.error },
                }),
              );
              return;
            }
            ws.send(
              JSON.stringify({
                kind: "system",
                timestamp: Date.now(),
                data: {
                  text: `Reconnected as ${result.name}.`,
                  entityId: result.entityId,
                  token: result.token,
                },
              }),
            );
            engine.sendLook(result.entityId);
            return;
          }

          if (parsed.type === "command" && parsed.command) {
            const entityId = engine.getConnectionEntity(connId);
            if (entityId) {
              // Rate limit check
              if (rateLimiter && !rateLimiter.consume(entityId)) {
                ws.send(
                  JSON.stringify({
                    kind: "error",
                    timestamp: Date.now(),
                    data: { text: "Rate limited. Please slow down." },
                  }),
                );
                return;
              }
              engine.processCommand(entityId, parsed.command);
            } else {
              ws.send(
                JSON.stringify({
                  kind: "error",
                  timestamp: Date.now(),
                  data: {
                    text: 'Not logged in. Send {"type":"login","name":"YourName"} first.',
                  },
                }),
              );
            }
          }
        },

        close(ws) {
          if (ws.data.isDashboard) {
            if (self.broadcaster) {
              self.broadcaster.removeClient(ws as ServerWebSocket<DashboardWSData>);
            }
            return;
          }

          // Canvas WebSocket
          if (ws.data.isCanvas) {
            self.canvasBroadcaster.removeClient(ws);
            return;
          }

          const connId = ws.data.connId;
          sockets.delete(connId);
          engine.removeConnection(connId);
        },
      },
    });

    console.log(`WebSocket server listening on ws://localhost:${this.port}/ws`);
    console.log(`Dashboard available at http://localhost:${this.port}/dashboard`);
    console.log(`Canvas available at http://localhost:${this.port}/canvas`);
  }

  stop(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }
}
