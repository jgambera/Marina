// ─── Marina SDK ────────────────────────────────────────────────────────────

export { MarinaClient, MarinaAgent } from "./client";
export type { SessionInfo, RoomView, ClientOptions } from "./client";

// Re-export core types
export type {
  EntityId,
  RoomId,
  Perception,
  PerceptionKind,
  Entity,
  EntityKind,
  EntityRank,
  RoomPerception,
  MessagePerception,
  BroadcastPerception,
  MovementPerception,
  ErrorPerception,
  SystemPerception,
} from "../types";
