/**
 * Shared types mirroring Marina's type system.
 * These are the client-side versions of the types defined in the Marina server.
 */

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

// ─── Ranks ───────────────────────────────────────────────────────────────────

export type EntityRank = 0 | 1 | 2 | 3 | 4;

export const RANK_NAMES: Record<EntityRank, string> = {
  0: "guest",
  1: "citizen",
  2: "builder",
  3: "architect",
  4: "admin",
};

// ─── Perceptions ─────────────────────────────────────────────────────────────

export type PerceptionKind = "room" | "message" | "broadcast" | "movement" | "error" | "system";

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

// ─── Room Module (for building) ──────────────────────────────────────────────

export interface RoomModule {
  short: string;
  long: string | ((ctx: RoomContext, viewer: EntityId) => string);
  items?: Record<string, string | ((ctx: RoomContext, viewer: EntityId) => string)>;
  exits?: Record<string, RoomId>;
  commands?: Record<string, CommandHandler>;
  onEnter?: (ctx: RoomContext, entity: EntityId) => void;
  onLeave?: (ctx: RoomContext, entity: EntityId) => void;
  onTick?: (ctx: RoomContext) => void;
}

export interface CommandInput {
  raw: string;
  verb: string;
  args: string;
  tokens: string[];
  entity: EntityId;
  room: RoomId;
}

export type CommandHandler = (ctx: RoomContext, input: CommandInput) => void;

export interface RoomContext {
  entities: Entity[];
  send(target: EntityId, message: string): void;
  broadcast(message: string): void;
  broadcastExcept(exclude: EntityId, message: string): void;
  getEntity(id: EntityId): Entity | undefined;
  findEntity(name: string): Entity | undefined;
  store: KeyValueStore;
  spawn(opts: {
    name: string;
    short: string;
    long: string;
    properties?: Record<string, unknown>;
  }): EntityId;
  despawn(entityId: EntityId): boolean;
  boards?: RoomBoardAPI;
  channels?: RoomChannelAPI;
  fetch?(url: string): Promise<{ status: number; body: string } | { error: string }>;
  roomId: RoomId;
}

export interface KeyValueStore {
  get<T = unknown>(key: string): T | undefined;
  set<T = unknown>(key: string, value: T): void;
  delete(key: string): boolean;
  keys(): string[];
}

export interface RoomBoardAPI {
  getBoard(name: string): { id: string; name: string } | undefined;
  listPosts(
    boardId: string,
    limit?: number,
  ): { id: number; title: string; body: string; authorName: string; createdAt: number }[];
  post(boardId: string, authorId: string, authorName: string, title: string, body: string): number;
  search(
    boardId: string,
    query: string,
  ): { id: number; title: string; body: string; authorName: string }[];
}

export interface RoomChannelAPI {
  send(channelName: string, senderId: string, senderName: string, content: string): void;
  history(
    channelName: string,
    limit?: number,
  ): { senderName: string; content: string; createdAt: number }[];
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface SessionInfo {
  entityId: EntityId;
  token: string;
  name: string;
}

export interface RoomView {
  id: RoomId;
  short: string;
  long: string;
  items: Record<string, string>;
  exits: string[];
  entities: { id: EntityId; name: string; short: string }[];
}

// ─── Client Events ───────────────────────────────────────────────────────────

export interface MarinaClientEvents {
  perception: (p: Perception) => void;
  connect: () => void;
  disconnect: () => void;
  error: (error: Error) => void;
  command_sent: (command: string) => void;
  /** Emitted after all reconnection attempts are exhausted. */
  reconnect_failed: () => void;
}
