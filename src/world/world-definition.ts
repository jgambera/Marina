import type { ArtilectDB } from "../persistence/database";
import type { Entity, RoomId, RoomModule } from "../types";

export interface QuestStep {
  id: string;
  description: string;
  hint: string;
  check: (entity: Entity) => boolean;
}

export interface QuestDef {
  id: string;
  name: string;
  description: string;
  reward: string;
  steps: QuestStep[];
  onComplete?: (entity: Entity, db?: ArtilectDB) => void;
}

export interface GuideNote {
  content: string;
  importance: number;
  type: string;
}

export interface WorldDefinition {
  name: string;
  startRoom: RoomId;
  rooms: Record<string, RoomModule>;
  roomsDir?: string;
  quests: QuestDef[];
  autoQuest?: string;
  guideNotes: GuideNote[];
  canvas?: { name: string; description: string; scope?: string };
  // Runs once on first boot (or world change), seeds DB with
  // room templates, projects, pools, tasks, etc. Must be idempotent.
  seed?: (db: ArtilectDB) => void;
}
