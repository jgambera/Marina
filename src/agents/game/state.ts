/**
 * Manages the current game state by processing structured Perceptions.
 * No more regex-based text parsing — everything is structured.
 */

import type { EntityId, Perception, RoomId, RoomPerception } from "../net/types";

/** Connection status */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "authenticated";

/** Entity info as seen in room perceptions */
export interface EntityInfo {
  id: EntityId;
  name: string;
  short: string;
}

/** Room information from RoomPerception */
export interface RoomInfo {
  id: RoomId;
  short: string;
  long: string;
  items: Record<string, string>;
  exits: string[];
  entities: EntityInfo[];
}

/** Complete game state */
export interface GameState {
  connection: {
    status: ConnectionStatus;
    wsUrl?: string;
    mcpUrl?: string;
    connectedAt?: number;
    entityId?: EntityId;
    characterName?: string;
    token?: string;
  };
  location: {
    currentRoom?: RoomInfo;
  };
  entities: {
    present: EntityInfo[];
    known: Map<string, EntityInfo>;
  };
  recentPerceptions: Perception[];
  lastUpdate: number;
}

const MAX_RECENT_PERCEPTIONS = 100;

export class GameStateManager {
  private state: GameState;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): GameState {
    return {
      connection: {
        status: "disconnected",
      },
      location: {},
      entities: {
        present: [],
        known: new Map(),
      },
      recentPerceptions: [],
      lastUpdate: Date.now(),
    };
  }

  /** Update connection status. */
  setConnectionStatus(status: ConnectionStatus, wsUrl?: string, mcpUrl?: string): void {
    this.state.connection.status = status;
    if (wsUrl) this.state.connection.wsUrl = wsUrl;
    if (mcpUrl) this.state.connection.mcpUrl = mcpUrl;
    if (status === "connected") {
      this.state.connection.connectedAt = Date.now();
    }
    this.markUpdated();
  }

  /** Set session info after login. */
  setSession(entityId: EntityId, name: string, token: string): void {
    this.state.connection.entityId = entityId;
    this.state.connection.characterName = name;
    this.state.connection.token = token;
    this.state.connection.status = "authenticated";
    this.markUpdated();
  }

  /** Process an incoming Perception and update state accordingly. */
  handlePerception(p: Perception): void {
    // Add to recent perceptions
    this.state.recentPerceptions.push(p);
    if (this.state.recentPerceptions.length > MAX_RECENT_PERCEPTIONS) {
      this.state.recentPerceptions.shift();
    }

    switch (p.kind) {
      case "room":
        this.handleRoomPerception(p as RoomPerception);
        break;
      case "message":
        // Messages are tracked in recentPerceptions, no special state update needed
        break;
      case "broadcast":
        // Broadcasts are tracked in recentPerceptions
        break;
      case "movement":
        this.handleMovementPerception(p);
        break;
      case "error":
        // Errors are tracked in recentPerceptions
        break;
      case "system":
        this.handleSystemPerception(p);
        break;
    }

    this.markUpdated();
  }

  private handleRoomPerception(p: RoomPerception): void {
    const data = p.data;
    const room: RoomInfo = {
      id: data.id,
      short: data.short,
      long: data.long,
      items: data.items || {},
      exits: data.exits || [],
      entities: (data.entities || []).map((e) => ({
        id: e.id,
        name: e.name,
        short: e.short,
      })),
    };

    this.state.location.currentRoom = room;

    // Update present entities
    this.state.entities.present = room.entities;

    // Track known entities
    for (const entity of room.entities) {
      this.state.entities.known.set(entity.name, entity);
    }
  }

  private handleMovementPerception(p: Perception): void {
    const data = p.data as {
      entity: EntityId;
      entityName: string;
      direction: "arrive" | "depart";
      exit?: string;
    };

    if (data.direction === "arrive") {
      // Entity arrived — add to present if not already there
      const existing = this.state.entities.present.find((e) => e.id === data.entity);
      if (!existing) {
        const info: EntityInfo = {
          id: data.entity,
          name: data.entityName,
          short: data.entityName,
        };
        this.state.entities.present.push(info);
        this.state.entities.known.set(data.entityName, info);
      }
    } else if (data.direction === "depart") {
      // Entity departed — remove from present
      this.state.entities.present = this.state.entities.present.filter((e) => e.id !== data.entity);
    }
  }

  private handleSystemPerception(p: Perception): void {
    const data = p.data as { entityId?: EntityId; token?: string; text?: string };
    if (data.entityId && data.token) {
      this.state.connection.entityId = data.entityId;
      this.state.connection.token = data.token;
    }
  }

  /** Get the current game state. */
  getState(): Readonly<GameState> {
    return this.state;
  }

  /** Get current room info. */
  getCurrentRoom(): RoomInfo | undefined {
    return this.state.location.currentRoom;
  }

  /** Get entities in current room. */
  getPresentEntities(): EntityInfo[] {
    return this.state.entities.present;
  }

  /** Get recent perceptions of a specific kind. */
  getRecentPerceptions(kind?: string, limit = 10): Perception[] {
    const perceptions = kind
      ? this.state.recentPerceptions.filter((p) => p.kind === kind)
      : this.state.recentPerceptions;
    return perceptions.slice(-limit);
  }

  /** Get a context summary for LLM prompts. */
  getContextSummary(): string {
    const parts: string[] = [];

    // Connection status
    parts.push(`Connection: ${this.state.connection.status}`);
    if (this.state.connection.characterName) {
      parts.push(`Character: ${this.state.connection.characterName}`);
    }

    // Current location
    const room = this.state.location.currentRoom;
    if (room) {
      parts.push(`Location: ${room.short} (${room.id})`);
      if (room.exits.length > 0) {
        parts.push(`Exits: ${room.exits.join(", ")}`);
      }
      if (Object.keys(room.items).length > 0) {
        parts.push(`Items: ${Object.keys(room.items).join(", ")}`);
      }
      if (room.entities.length > 0) {
        parts.push(`Present: ${room.entities.map((e) => e.name).join(", ")}`);
      }
    }

    // Recent events (last 5)
    const recent = this.state.recentPerceptions.slice(-5);
    if (recent.length > 0) {
      parts.push("\nRecent events:");
      for (const p of recent) {
        const text = (p.data?.text as string) || (p.data?.short as string) || p.kind;
        parts.push(`  - [${p.kind}] ${text.substring(0, 100)}`);
      }
    }

    return parts.join("\n");
  }

  /** Reset the game state. */
  reset(): void {
    this.state = this.createInitialState();
  }

  private markUpdated(): void {
    this.state.lastUpdate = Date.now();
  }
}
