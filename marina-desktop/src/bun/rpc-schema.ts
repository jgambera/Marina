/**
 * Typed RPC contract between the Bun main process and the dashboard webview.
 *
 * Uses Electrobun's ElectrobunRPCSchema format:
 * - bun.requests: handlers implemented on the bun side, called by the webview
 * - bun.messages: messages the bun side listens for (sent by webview)
 * - webview.requests: handlers on webview side, called by bun
 * - webview.messages: messages the webview listens for (sent by bun)
 */
import type { ElectrobunRPCSchema } from "electrobun/bun";

// ─── Data shapes ────────────────────────────────────────────────────────────

export interface WorldData {
  rooms: {
    id: string;
    short: string;
    district: string;
    exits: Record<string, string>;
    entityCount: number;
  }[];
  entities: {
    id: string;
    name: string;
    kind: string;
    room: string;
    rank: number;
  }[];
}

export interface SystemData {
  status: string;
  uptime: number;
  connections: number;
  rooms: number;
  entities: { total: number; agents: number; npcs: number };
  roomPopulations: Record<string, number>;
  memory: { heapUsed: number; rss: number };
  tasks?: {
    open: number;
    claimed: number;
    submitted: number;
    completed: number;
  };
  projectCount?: number;
  connectorCount?: number;
  commandCount?: number;
}

export interface EngineStatusData {
  running: boolean;
  uptime: number;
  entityCount: number;
  agentCount: number;
  roomCount: number;
  connectionCount: number;
  memory: { heapUsed: number; rss: number };
}

export interface PreferencesData {
  mode: "local" | "remote";
  remoteUrl: string;
  dbPath: string;
  wsPort: number;
  telnetPort: number;
  mcpPort: number;
  tickMs: number;
  startRoom: string;
}

// ─── Electrobun RPC Schema ──────────────────────────────────────────────────

export interface DashboardRPCSchema extends ElectrobunRPCSchema {
  /** Bun-side: handles incoming requests from webview, listens for webview messages */
  bun: {
    requests: {
      getWorld: { params: undefined; response: WorldData };
      getSystem: { params: undefined; response: SystemData };
      getEntities: { params: undefined; response: unknown[] };
      getRoomDetail: { params: string; response: unknown };
      getEntityDetail: { params: string; response: unknown };
      deleteEntity: { params: string; response: unknown };
      getBoards: { params: undefined; response: unknown[] };
      getBoardDetail: { params: string; response: unknown };
      getTasks: { params: undefined; response: unknown[] };
      getTaskDetail: { params: number; response: unknown };
      getChannels: { params: undefined; response: unknown[] };
      getChannelDetail: { params: string; response: unknown };
      getGroups: { params: undefined; response: unknown[] };
      getGroupDetail: { params: string; response: unknown };
      getProjects: { params: undefined; response: unknown[] };
      getConnectors: { params: undefined; response: unknown[] };
      getCommands: { params: undefined; response: unknown[] };
      getMemoryPools: { params: undefined; response: unknown[] };
      getMemoryNotes: { params: string; response: unknown[] };
      getMemoryCore: { params: string; response: unknown[] };
      getEvents: { params: number; response: unknown[] };
      getEngineStatus: { params: undefined; response: EngineStatusData };
      getPreferences: { params: undefined; response: PreferencesData };
      setPreferences: {
        params: Partial<PreferencesData>;
        response: { ok: boolean };
      };
      connectRemote: {
        params: string;
        response: { ok: boolean; error?: string };
      };
      switchToLocal: { params: undefined; response: { ok: boolean } };
      /** List managed agents + configured providers */
      getAgents: {
        params: undefined;
        response: { agents: unknown[]; configuredProviders: string[] };
      };
      /** Get available models grouped by provider */
      getAgentModels: {
        params: undefined;
        response: { providers: Record<string, unknown[]>; configured: string[] };
      };
      /** Spawn a new managed agent */
      spawnAgent: {
        params: { name: string; model: string; role?: string };
        response: unknown;
      };
      /** Stop a managed agent by name */
      stopAgent: { params: string; response: { ok: boolean } };
      /** Create a game connection (virtual WebSocket) for the web chat */
      gameConnect: { params: undefined; response: { connId: string } };
      /** Send a raw JSON message on the game connection (login/auth/command) */
      gameSend: { params: string; response: void };
      /** Disconnect the game connection */
      gameDisconnect: { params: undefined; response: void };
    };
    messages: {
      /** Webview signals it's ready to receive data */
      ready: void;
    };
  };

  /** Webview-side: no request handlers, listens for bun push messages */
  webview: {
    requests: Record<string, never>;
    messages: {
      /** Full world snapshot pushed periodically */
      snapshot: unknown;
      /** Periodic state update */
      state: unknown;
      /** Individual engine event */
      event: unknown;
      /** Engine status changed */
      statusChange: EngineStatusData;
      /** Log entry from engine */
      engineLog: { level: string; category: string; message: string };
      /** Game perception pushed to the web chat */
      gameMessage: unknown;
    };
  };
}
