/**
 * Core type definitions for Marina game state
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

/** Channel info */
export interface ChannelInfo {
  name: string;
  joined: boolean;
}

/** Board info */
export interface BoardInfo {
  name: string;
  postCount?: number;
}

/** Group info */
export interface GroupInfo {
  name: string;
  role?: string;
}

/** Task info */
export interface TaskInfo {
  id: string;
  title: string;
  status: string;
  claimedBy?: string;
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
    /** Entities currently in the same room */
    present: EntityInfo[];
    /** Recently seen entities across rooms */
    known: Map<string, EntityInfo>;
  };
  recentPerceptions: Perception[];
  lastUpdate: number;
}

/** Perception event for UI consumption */
export interface PerceptionEvent {
  perception: Perception;
  formatted: string;
  timestamp: number;
}

export type { EntityId, Perception, RoomId, RoomPerception } from "../net/types";
