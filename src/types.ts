// ─── Identity ────────────────────────────────────────────────────────────────

/** Opaque branded string for entity IDs */
export type EntityId = string & { readonly __brand: "EntityId" };

/** Opaque branded string for room IDs (path-based, e.g. "hub/plaza") */
export type RoomId = string & { readonly __brand: "RoomId" };

export function entityId(id: string): EntityId {
  return id as EntityId;
}

export function roomId(id: string): RoomId {
  return id as RoomId;
}

// ─── Entities ────────────────────────────────────────────────────────────────

export type EntityKind = "agent" | "npc" | "object";

export interface Entity {
  id: EntityId;
  kind: EntityKind;
  name: string;
  short: string;
  long: string;
  room: RoomId;
  properties: Record<string, unknown>;
  inventory: EntityId[];
  createdAt: number;
}

// ─── Rooms ───────────────────────────────────────────────────────────────────

export interface RoomModule {
  short: string;
  long: string | ((ctx: RoomContext, viewer: EntityId) => string);
  items?: Record<string, string | ((ctx: RoomContext, viewer: EntityId) => string)>;
  exits?: Record<string, RoomId>;
  commands?: Record<string, CommandHandler>;
  onEnter?: (ctx: RoomContext, entity: EntityId) => void;
  onLeave?: (ctx: RoomContext, entity: EntityId) => void;
  onTick?: (ctx: RoomContext) => void;
  canEnter?: (ctx: RoomContext, entity: EntityId) => true | string;
}

// ─── Commands ────────────────────────────────────────────────────────────────

export interface CommandInput {
  raw: string;
  verb: string;
  args: string;
  tokens: string[];
  entity: EntityId;
  room: RoomId;
}

export type CommandHandler = (ctx: RoomContext, input: CommandInput) => void | Promise<void>;

export interface CommandDef {
  name: string;
  aliases?: string[];
  help: string;
  handler: CommandHandler;
  minRank?: EntityRank;
}

// ─── Room Context (injected into room modules) ──────────────────────────────

export interface RoomContext {
  /** All entities currently in this room */
  entities: Entity[];

  /** Send a message to a specific entity */
  send(target: EntityId, message: string): void;

  /** Broadcast a message to all entities in the room */
  broadcast(message: string): void;

  /** Broadcast to all except one entity */
  broadcastExcept(exclude: EntityId, message: string): void;

  /** Get an entity by ID (if in this room) */
  getEntity(id: EntityId): Entity | undefined;

  /** Find entity by name (partial match, in this room) */
  findEntity(name: string): Entity | undefined;

  /** Room-scoped persistent key-value store */
  store: KeyValueStore;

  /** Spawn an NPC in this room */
  spawn(opts: {
    name: string;
    short: string;
    long: string;
    properties?: Record<string, unknown>;
  }): EntityId;

  /** Remove an NPC from this room */
  despawn(entityId: EntityId): boolean;

  /** Board API (available when db-backed) */
  boards?: RoomBoardAPI;

  /** Channel API (available when db-backed) */
  channels?: RoomChannelAPI;

  /** Rate-limited HTTP GET (max 1 req/10s per room, 5s timeout, GET only) */
  fetch?(url: string): Promise<{ status: number; body: string } | { error: string }>;

  /** The current room's ID */
  roomId: RoomId;

  /** Send a brief orientation to an entity */
  brief?: (entityId: EntityId) => void;
}

// ─── Command Context (extended context for dynamic commands) ─────────────────

export interface McpAPI {
  /** Call a tool on an MCP server */
  call(server: string, tool: string, args: Record<string, unknown>): Promise<unknown>;
  /** List tools available on a server */
  listTools(server: string): Promise<{ name: string; description?: string }[]>;
  /** List registered MCP servers */
  listServers(): string[];
}

export interface HttpAPI {
  /** HTTP GET (rate-limited, 10s timeout) */
  get(url: string): Promise<{ status: number; body: string } | { error: string }>;
  /** HTTP POST (rate-limited, 10s timeout) */
  post(url: string, body: string): Promise<{ status: number; body: string } | { error: string }>;
}

export interface NotesAPI {
  /** Scored retrieval of notes */
  recall(query: string): { id: number; content: string; importance: number; score: number }[];
  /** Full-text search of notes */
  search(query: string): { id: number; content: string; importance: number }[];
  /** Add a note */
  add(content: string, importance?: number, noteType?: string): number;
}

export interface MemoryAPI {
  /** Get a core memory value */
  get(key: string): string | undefined;
  /** Set a core memory value */
  set(key: string, value: string): void;
  /** List all core memory entries */
  list(): { key: string; value: string }[];
}

export interface PoolAPI {
  /** Recall notes from a pool */
  recall(poolName: string, query: string): { id: number; content: string; score: number }[];
  /** Add a note to a pool */
  add(poolName: string, content: string, importance?: number): void;
}

export interface CommandContext extends RoomContext {
  /** MCP connector API (call external MCP servers) */
  mcp: McpAPI;
  /** HTTP API (rate-limited GET/POST) */
  http: HttpAPI;
  /** Notes API (scoped to calling entity) */
  notes: NotesAPI;
  /** Core memory API (scoped to calling entity) */
  memory: MemoryAPI;
  /** Pool API (shared memory pools) */
  pool: PoolAPI;
  /** Information about the calling entity */
  caller: { id: EntityId; name: string; rank: number };
}

// ─── Room Board API (subset exposed to room modules) ────────────────────────

export interface RoomBoardAPI {
  /** Get a board by name */
  getBoard(name: string): { id: string; name: string } | undefined;

  /** List posts on a board */
  listPosts(
    boardId: string,
    limit?: number,
  ): {
    id: number;
    title: string;
    body: string;
    authorName: string;
    createdAt: number;
  }[];

  /** Create a post on a board */
  post(boardId: string, authorId: string, authorName: string, title: string, body: string): number;

  /** Search posts on a board */
  search(
    boardId: string,
    query: string,
  ): {
    id: number;
    title: string;
    body: string;
    authorName: string;
  }[];
}

// ─── Room Channel API (subset exposed to room modules) ──────────────────────

export interface RoomChannelAPI {
  /** Send a message to a named channel */
  send(channelName: string, senderId: string, senderName: string, content: string): void;

  /** Get recent history from a channel */
  history(
    channelName: string,
    limit?: number,
  ): {
    senderName: string;
    content: string;
    createdAt: number;
  }[];
}

// ─── Key-Value Store ─────────────────────────────────────────────────────────

export interface KeyValueStore {
  get<T = unknown>(key: string): T | undefined;
  set<T = unknown>(key: string, value: T): void;
  delete(key: string): boolean;
  keys(): string[];
}

// ─── Perceptions (what gets delivered to connections) ────────────────────────

export type PerceptionKind =
  | "room" // full room description (from look)
  | "message" // directed message
  | "broadcast" // room-wide message
  | "movement" // someone entered/left
  | "error" // error feedback
  | "system"; // system notification

export interface Perception {
  kind: PerceptionKind;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface RoomPerception extends Perception {
  kind: "room";
  data: {
    id: RoomId;
    short: string;
    long: string;
    items: Record<string, string>;
    exits: string[];
    entities: { id: EntityId; name: string; short: string }[];
  };
}

export interface MessagePerception extends Perception {
  kind: "message";
  data: {
    from: EntityId;
    fromName: string;
    text: string;
  };
}

export interface BroadcastPerception extends Perception {
  kind: "broadcast";
  data: {
    text: string;
  };
}

export interface MovementPerception extends Perception {
  kind: "movement";
  data: {
    entity: EntityId;
    entityName: string;
    direction: "arrive" | "depart";
    exit?: string;
  };
}

export interface ErrorPerception extends Perception {
  kind: "error";
  data: {
    text: string;
  };
}

export interface SystemPerception extends Perception {
  kind: "system";
  data: {
    text: string;
  };
}

// ─── Connection ──────────────────────────────────────────────────────────────

export type ConnectionProtocol = "websocket" | "telnet" | "mcp";

export interface Connection {
  id: string;
  protocol: ConnectionProtocol;
  entity: EntityId | null;
  connectedAt: number;
  send(perception: Perception): void;
  close(): void;
}

// ─── Ranks ──────────────────────────────────────────────────────────────────

export type EntityRank = 0 | 1 | 2 | 3 | 4;

export const RANK_NAMES: Record<EntityRank, string> = {
  0: "guest",
  1: "citizen",
  2: "builder",
  3: "architect",
  4: "admin",
};

// ─── Events (internal engine events) ─────────────────────────────────────────

export type EngineEvent =
  | { type: "command"; entity: EntityId; input: string; timestamp: number }
  | { type: "tick"; timestamp: number }
  | { type: "connect"; connectionId: string; protocol: ConnectionProtocol; timestamp: number }
  | { type: "disconnect"; connectionId: string; timestamp: number }
  | { type: "entity_enter"; entity: EntityId; room: RoomId; timestamp: number }
  | { type: "entity_leave"; entity: EntityId; room: RoomId; timestamp: number }
  | { type: "task_claimed"; entity: EntityId; taskId: number; timestamp: number }
  | { type: "task_submitted"; entity: EntityId; taskId: number; timestamp: number }
  | { type: "task_approved"; entity: EntityId; taskId: number; timestamp: number }
  | { type: "task_rejected"; entity: EntityId; taskId: number; timestamp: number }
  | {
      type: "canvas_publish";
      entity: EntityId;
      canvasId: string;
      nodeId: string;
      timestamp: number;
    };
