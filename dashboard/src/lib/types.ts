// API response types

export interface RoomSummary {
  id: string;
  short: string;
  district: string;
  exits: Record<string, string>;
  entityCount: number;
}

export interface EntitySummary {
  id: string;
  name: string;
  kind: "agent" | "npc" | "object";
  room: string;
  rank: number;
}

export interface WorldData {
  worldName?: string;
  startRoom?: string;
  rooms: RoomSummary[];
  entities: EntitySummary[];
}

export interface RoomDetail {
  id: string;
  short: string;
  long: string;
  exits: Record<string, string>;
  items: Record<string, string>;
  entities: { id: string; name: string; kind: string }[];
  source?: string;
}

export interface EntityDetail {
  id: string;
  name: string;
  kind: string;
  room: string;
  rank: number;
  properties: Record<string, unknown>;
  inventory: string[];
  coreMemory?: CoreMemoryEntry[];
  notes?: NoteEntry[];
  recentActivity?: ActivityEntry[];
}

export interface CoreMemoryEntry {
  entity_name: string;
  key: string;
  value: string;
  version: number;
  updated_at: number;
}

export interface NoteEntry {
  id: number;
  entity_name: string;
  content: string;
  importance: number;
  note_type: string;
  created_at: number;
}

export interface ActivityEntry {
  type: string;
  input?: string;
  timestamp: number;
}

export interface BoardEntry {
  id: string;
  name: string;
  scope_type: string;
  postCount: number;
  created_at: number;
}

export interface TaskEntry {
  id: number;
  title: string;
  status: string;
  creator_name: string;
  created_at: number;
}

export interface ChannelEntry {
  id: string;
  name: string;
  type: string;
  messageCount: string;
}

export interface GroupEntry {
  id: string;
  name: string;
  description: string;
  leader_id: string;
  memberCount: number;
}

export interface MemoryPool {
  id: string;
  name: string;
  group_id: string | null;
  created_by: string;
}

// --- Drill-down detail types ---

export interface ProjectEntry {
  id: string;
  name: string;
  description: string;
  orchestration: string;
  memory_arch: string;
  status: string;
  bundle_id: number | null;
  pool_id: string | null;
  group_id: string | null;
  created_by: string;
  bundleProgress?: { total: number; done: number };
}

export interface ConnectorEntry {
  id: string;
  name: string;
  transport: string;
  url: string | null;
  status: string;
  auth_type: string | null;
  created_by: string;
}

export interface DynamicCommandEntry {
  id: string;
  name: string;
  version: number;
  valid: number;
  created_by: string;
  created_at: number;
}

export interface TaskDetail extends TaskEntry {
  description: string;
  parent_task_id: number | null;
  assignee_name?: string;
  children?: TaskEntry[];
}

export interface BoardPostEntry {
  id: number;
  title: string;
  body: string;
  author_name: string;
  score?: number;
  created_at: number;
}

export interface BoardDetail extends BoardEntry {
  posts: BoardPostEntry[];
}

export interface GroupDetail extends GroupEntry {
  members: { entity_id: string; rank: number; joined_at: number }[];
}

export interface ChannelMessage {
  sender_name: string;
  content: string;
  created_at: number;
}

export interface ChannelDetail extends ChannelEntry {
  messages: ChannelMessage[];
}

export interface SystemData {
  status: string;
  uptime: number;
  connections: number;
  rooms: number;
  entities: { total: number; agents: number; npcs: number };
  memory: { heapUsed: number; rss: number };
  tasks?: { open: number; claimed: number; submitted: number; completed: number };
  projectCount?: number;
  connectorCount?: number;
  commandCount?: number;
}

// WebSocket message types

export interface DashboardEvent {
  type: string;
  entity?: string;
  input?: string;
  connectionId?: string;
  protocol?: string;
  room?: string;
  taskId?: number;
  timestamp: number;
}

export interface WorldSnapshot {
  timestamp: number;
  worldName?: string;
  startRoom?: string;
  entities: { id: string; name: string; kind: string; room: string }[];
  roomPopulations: Record<string, number>;
  rooms: {
    id: string;
    short: string;
    district: string;
    exits: Record<string, string>;
  }[];
  connections: number;
  memory: { heapUsed: number; rss: number };
}

export type WSMessage =
  | { type: "snapshot"; data: WorldSnapshot }
  | { type: "state"; data: WorldSnapshot }
  | { type: "event"; data: DashboardEvent };

// ─── Agent management types ─────────────────────────────────────────────────

export interface ManagedAgentInfo {
  id: string;
  name: string;
  model: string;
  role: string;
  entityId?: string;
  status: "starting" | "running" | "stopping" | "stopped" | "error";
  startedAt: number;
  uptimeMs: number;
  error?: string;
}

export interface AgentsResponse {
  agents: ManagedAgentInfo[];
  configuredProviders: string[];
}

export interface ProviderModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  reasoning?: boolean;
}

export interface AgentModelsResponse {
  providers: Record<string, ProviderModelInfo[]>;
  configured: string[];
}
