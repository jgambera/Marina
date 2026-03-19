/**
 * RPC Shim — Injected into the dashboard webview via the Electroview entry.
 *
 * Monkey-patches window.fetch and WebSocket so the dashboard SPA
 * (which expects HTTP/WS to localhost) transparently routes through
 * Electrobun's RPC instead.
 *
 * The dashboard source code is completely unaware of this shim.
 */

import { Electroview } from "electrobun/view";
import type { DashboardRPCSchema } from "../../bun/rpc-schema";

// ─── Debug helpers ──────────────────────────────────────────────────────────

/** Persistent overlay for fatal init errors only (RPC setup failure, etc.) */
function showFatalError(msg: string): void {
  let el = document.getElementById("__err");
  if (!el) {
    el = document.createElement("pre");
    el.id = "__err";
    el.style.cssText =
      "position:fixed;top:0;left:0;right:0;padding:16px;background:#1a1a2e;color:#ff4444;font:13px/1.5 monospace;z-index:99999;white-space:pre-wrap;max-height:50vh;overflow:auto";
    document.body?.prepend(el);
  }
  el.textContent += msg + "\n";
}

/** Auto-dismissing toast for transient warnings (game WS errors, etc.) */
function showToast(msg: string, durationMs = 4000): void {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText =
    "position:fixed;bottom:16px;right:16px;padding:10px 16px;background:#1a1a2e;color:#ff8844;font:12px/1.4 'Share Tech Mono',monospace;z-index:99999;border:1px solid #ff884444;border-radius:6px;opacity:0;transition:opacity 0.3s ease;max-width:400px;pointer-events:none";
  document.body?.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, durationMs);
}

// ─── RPC Setup ──────────────────────────────────────────────────────────────

// Save original WebSocket before any patching
const OriginalWebSocket = window.WebSocket;

let rpc: ReturnType<typeof Electroview.defineRPC<DashboardRPCSchema>>;
let rpcConnected = false;

try {
  // Define RPC with bun→webview push message handlers
  rpc = Electroview.defineRPC<DashboardRPCSchema>({
    handlers: {
      requests: {},
      messages: {
        snapshot: (data) => {
          dispatchWsMessage({ type: "snapshot", data });
        },
        state: (data) => {
          dispatchWsMessage({ type: "state", data });
        },
        event: (data) => {
          dispatchWsMessage({ type: "event", data });
        },
        statusChange: (data) => {
          dispatchWsMessage({ type: "statusChange", data });
        },
        engineLog: (_entry) => {},
        gameMessage: (data) => {
          dispatchGameMessage(data);
        },
      },
    },
  });

  // Initialize Electroview to set up the WebSocket transport to the bun process.
  new Electroview({ rpc });
  rpcConnected = true;
} catch (err) {
  showFatalError(
    `[rpc-shim] Electroview init failed: ${err instanceof Error ? err.stack || err.message : String(err)}`,
  );
}

// ─── WebSocket Message Relay ────────────────────────────────────────────────

type WsMessageHandler = (ev: MessageEvent) => void;
const wsMessageHandlers: WsMessageHandler[] = [];

function dispatchWsMessage(data: unknown): void {
  const msgEvent = new MessageEvent("message", {
    data: JSON.stringify(data),
  });
  for (const handler of wsMessageHandlers) {
    handler(msgEvent);
  }
}

// ─── Fetch Interception ─────────────────────────────────────────────────────

const originalFetch = window.fetch.bind(window);

window.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  // Extract pathname — handle both relative (/api/...) and absolute URLs
  let pathname: string;
  try {
    const parsed = new URL(url, window.location.origin);
    pathname = parsed.pathname;
  } catch {
    pathname = url;
  }

  // Only intercept /api/* paths when RPC is connected
  if (!pathname.startsWith("/api/") || !rpcConnected) {
    return originalFetch(input, init);
  }

  const method = init?.method?.toUpperCase() ?? "GET";

  // Parse POST body if present
  let body: unknown = undefined;
  if (method === "POST" && init?.body) {
    try {
      body =
        typeof init.body === "string"
          ? JSON.parse(init.body)
          : JSON.parse(new TextDecoder().decode(init.body as ArrayBuffer));
    } catch {
      // ignore parse errors
    }
  }

  try {
    const data = await routeApiRequest(pathname, method, body);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Silently return 503 — React Query handles retries/error states.
    // RPC timeouts are expected when native dialogs block the event loop.
    console.warn(`[rpc-shim] RPC request failed: ${pathname}`, err);
    return new Response(JSON.stringify({ error: "RPC unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
};

async function routeApiRequest(
  pathname: string,
  method: string,
  body?: unknown,
): Promise<unknown> {
  // ── DELETE routes ──
  if (method === "DELETE") {
    const adapterDeleteMatch = pathname.match(/^\/api\/adapters\/(.+)$/);
    if (adapterDeleteMatch) {
      return rpc.request.deleteAdapter(
        decodeURIComponent(adapterDeleteMatch[1]!),
      );
    }
    const entityDeleteMatch = pathname.match(/^\/api\/entities\/(.+)$/);
    if (entityDeleteMatch) {
      return rpc.request.deleteEntity(
        decodeURIComponent(entityDeleteMatch[1]!),
      );
    }
    throw new Error(`Unknown DELETE route: ${pathname}`);
  }

  // ── POST routes ──
  if (method === "POST") {
    if (pathname === "/api/agents/spawn") {
      return rpc.request.spawnAgent(
        body as { name: string; model: string; role?: string },
      );
    }
    const agentStopMatch = pathname.match(/^\/api\/agents\/(.+)\/stop$/);
    if (agentStopMatch) {
      return rpc.request.stopAgent(decodeURIComponent(agentStopMatch[1]!));
    }
    if (pathname === "/api/adapters") {
      return rpc.request.createAdapter(
        body as { type: string; token: string; settings?: Record<string, unknown>; autoStart?: boolean },
      );
    }
    const adapterStartMatch = pathname.match(/^\/api\/adapters\/(.+)\/start$/);
    if (adapterStartMatch) {
      return rpc.request.startAdapter(decodeURIComponent(adapterStartMatch[1]!));
    }
    const adapterStopMatch = pathname.match(/^\/api\/adapters\/(.+)\/stop$/);
    if (adapterStopMatch) {
      return rpc.request.stopAdapter(decodeURIComponent(adapterStopMatch[1]!));
    }
    throw new Error(`Unknown POST route: ${pathname}`);
  }

  // ── GET: Exact matches ──
  if (pathname === "/api/adapters") return rpc.request.getAdapters();
  if (pathname === "/api/agents") return rpc.request.getAgents();
  if (pathname === "/api/agents/models") return rpc.request.getAgentModels();
  if (pathname === "/api/world") return rpc.request.getWorld();
  if (pathname === "/api/system") return rpc.request.getSystem();
  if (pathname === "/api/entities") return rpc.request.getEntities();
  if (pathname === "/api/events") return rpc.request.getEvents(100);
  if (pathname === "/api/coordination/boards") return rpc.request.getBoards();
  if (pathname === "/api/coordination/tasks") return rpc.request.getTasks();
  if (pathname === "/api/coordination/channels")
    return rpc.request.getChannels();
  if (pathname === "/api/coordination/groups") return rpc.request.getGroups();
  if (pathname === "/api/coordination/projects")
    return rpc.request.getProjects();
  if (pathname === "/api/connectors") return rpc.request.getConnectors();
  if (pathname === "/api/commands") return rpc.request.getCommands();
  if (pathname === "/api/memory/pools") return rpc.request.getMemoryPools();

  // ── GET: Parameterized detail routes ──
  const taskDetailMatch = pathname.match(
    /^\/api\/coordination\/tasks\/(\d+)$/,
  );
  if (taskDetailMatch) {
    return rpc.request.getTaskDetail(Number(taskDetailMatch[1]));
  }

  const boardDetailMatch = pathname.match(
    /^\/api\/coordination\/boards\/(.+)$/,
  );
  if (boardDetailMatch) {
    return rpc.request.getBoardDetail(
      decodeURIComponent(boardDetailMatch[1]!),
    );
  }

  const groupDetailMatch = pathname.match(
    /^\/api\/coordination\/groups\/(.+)$/,
  );
  if (groupDetailMatch) {
    return rpc.request.getGroupDetail(
      decodeURIComponent(groupDetailMatch[1]!),
    );
  }

  const channelDetailMatch = pathname.match(
    /^\/api\/coordination\/channels\/(.+)$/,
  );
  if (channelDetailMatch) {
    return rpc.request.getChannelDetail(
      decodeURIComponent(channelDetailMatch[1]!),
    );
  }

  const roomMatch = pathname.match(/^\/api\/rooms\/(.+)$/);
  if (roomMatch) {
    return rpc.request.getRoomDetail(decodeURIComponent(roomMatch[1]!));
  }

  const entityMatch = pathname.match(/^\/api\/entities\/(.+)$/);
  if (entityMatch) {
    return rpc.request.getEntityDetail(decodeURIComponent(entityMatch[1]!));
  }

  const memNotesMatch = pathname.match(/^\/api\/memory\/notes\/(.+)$/);
  if (memNotesMatch) {
    return rpc.request.getMemoryNotes(decodeURIComponent(memNotesMatch[1]!));
  }

  const memCoreMatch = pathname.match(/^\/api\/memory\/core\/(.+)$/);
  if (memCoreMatch) {
    return rpc.request.getMemoryCore(decodeURIComponent(memCoreMatch[1]!));
  }

  throw new Error(`Unknown API route: ${pathname}`);
}

// ─── Game WebSocket Message Relay ──────────────────────────────────────────

const gameMessageHandlers: WsMessageHandler[] = [];

function dispatchGameMessage(data: unknown): void {
  const msgEvent = new MessageEvent("message", {
    data: JSON.stringify(data),
  });
  for (const handler of gameMessageHandlers) {
    handler(msgEvent);
  }
}

// ─── WebSocket Interception ─────────────────────────────────────────────────

class RpcWebSocket extends EventTarget {
  readyState = OriginalWebSocket.OPEN;
  bufferedAmount = 0;
  extensions = "";
  protocol = "";
  binaryType: BinaryType = "blob";
  url: string;

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  constructor(url: string, _protocols?: string | string[]) {
    super();
    this.url = url;

    const handler: WsMessageHandler = (ev) => {
      this.onmessage?.(ev);
      this.dispatchEvent(new MessageEvent("message", { data: ev.data }));
    };
    wsMessageHandlers.push(handler);

    if (rpcConnected) {
      rpc.send.ready();
    }

    // Simulate async open
    queueMicrotask(() => {
      const openEvent = new Event("open");
      this.onopen?.(openEvent);
      this.dispatchEvent(openEvent);
    });
  }

  send(_data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    // Dashboard WS is read-only
  }

  close(_code?: number, _reason?: string): void {
    this.readyState = OriginalWebSocket.CLOSED;
    const closeEvent = new CloseEvent("close", {
      code: 1000,
      reason: "closed",
      wasClean: true,
    });
    this.onclose?.(closeEvent);
    this.dispatchEvent(closeEvent);
  }
}

/** Bidirectional game WebSocket — sends login/commands via RPC, receives perceptions */
class RpcGameWebSocket extends EventTarget {
  readyState = OriginalWebSocket.CONNECTING;
  bufferedAmount = 0;
  extensions = "";
  protocol = "";
  binaryType: BinaryType = "blob";
  url: string;

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  constructor(url: string, _protocols?: string | string[]) {
    super();
    this.url = url;

    // Register for game perception messages from the bun side
    const handler: WsMessageHandler = (ev) => {
      this.onmessage?.(ev);
      this.dispatchEvent(new MessageEvent("message", { data: ev.data }));
    };
    gameMessageHandlers.push(handler);

    // Establish the virtual game connection on the bun side
    if (rpcConnected) {
      rpc.request
        .gameConnect()
        .then(() => {
          this.readyState = OriginalWebSocket.OPEN;
          queueMicrotask(() => {
            const openEvent = new Event("open");
            this.onopen?.(openEvent);
            this.dispatchEvent(openEvent);
          });
        })
        .catch((err) => {
          showToast(`Game connection failed: ${err instanceof Error ? err.message : String(err)}`);
          const errorEvent = new Event("error");
          this.onerror?.(errorEvent);
          this.dispatchEvent(errorEvent);
        });
    }
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (!rpcConnected || this.readyState !== OriginalWebSocket.OPEN) return;
    const raw = typeof data === "string" ? data : new TextDecoder().decode(data as ArrayBuffer);
    rpc.request.gameSend(raw).catch((err) => {
      console.warn("[rpc-shim] gameSend failed:", err);
    });
  }

  close(_code?: number, _reason?: string): void {
    this.readyState = OriginalWebSocket.CLOSED;
    if (rpcConnected) {
      rpc.request.gameDisconnect().catch(() => {});
    }
    const closeEvent = new CloseEvent("close", {
      code: 1000,
      reason: "closed",
      wasClean: true,
    });
    this.onclose?.(closeEvent);
    this.dispatchEvent(closeEvent);
  }
}

// Patch WebSocket — intercept dashboard-ws and game /ws connections
const patchedWebSocket = function WebSocket(
  url: string | URL,
  protocols?: string | string[],
): WebSocket {
  const urlStr = url.toString();
  if (urlStr.includes("/dashboard-ws")) {
    return new RpcWebSocket(urlStr, protocols) as unknown as WebSocket;
  }
  if (rpcConnected && urlStr.endsWith("/ws")) {
    return new RpcGameWebSocket(urlStr, protocols) as unknown as WebSocket;
  }
  return new OriginalWebSocket(urlStr, protocols);
} as unknown as typeof WebSocket;

patchedWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
patchedWebSocket.OPEN = OriginalWebSocket.OPEN;
patchedWebSocket.CLOSING = OriginalWebSocket.CLOSING;
patchedWebSocket.CLOSED = OriginalWebSocket.CLOSED;
patchedWebSocket.prototype = OriginalWebSocket.prototype;

window.WebSocket = patchedWebSocket;
