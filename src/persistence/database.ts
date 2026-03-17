import { Database } from "bun:sqlite";
import type { Session } from "../auth/session-manager";
import type { EngineEvent, Entity, EntityId, RoomId } from "../types";

// ─── Base Schema (migration 0 — applied via CREATE IF NOT EXISTS) ────────────

const BASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  short TEXT NOT NULL,
  long TEXT NOT NULL,
  room TEXT NOT NULL,
  properties TEXT NOT NULL DEFAULT '{}',
  inventory TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS room_store (
  room_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (room_id, key)
);

CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(type);
CREATE INDEX IF NOT EXISTS idx_event_log_timestamp ON event_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_entities_room ON entities(room);
CREATE INDEX IF NOT EXISTS idx_sessions_entity ON sessions(entity_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
`;

// ─── Migrations ──────────────────────────────────────────────────────────────

interface Migration {
  version: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  // Migration 1: Channels
  {
    version: 1,
    sql: `
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  owner_id TEXT,
  persistence TEXT NOT NULL DEFAULT 'permanent',
  retention_hours INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE channel_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE channel_members (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  can_read INTEGER NOT NULL DEFAULT 1,
  can_write INTEGER NOT NULL DEFAULT 1,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (channel_id, entity_id)
);

CREATE INDEX idx_channel_messages_channel ON channel_messages(channel_id);
CREATE INDEX idx_channel_messages_created ON channel_messages(created_at);
CREATE INDEX idx_channel_members_entity ON channel_members(entity_id);
`,
  },
  // Migration 2: Boards
  {
    version: 2,
    sql: `
CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'global',
  scope_id TEXT,
  read_rank INTEGER NOT NULL DEFAULT 0,
  write_rank INTEGER NOT NULL DEFAULT 0,
  pin_rank INTEGER NOT NULL DEFAULT 3,
  created_at INTEGER NOT NULL
);

CREATE TABLE board_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  parent_id INTEGER,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE board_votes (
  post_id INTEGER NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  value INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, entity_id)
);

CREATE INDEX idx_board_posts_board ON board_posts(board_id);
CREATE INDEX idx_board_posts_author ON board_posts(author_id);
CREATE INDEX idx_board_votes_post ON board_votes(post_id);
`,
  },
  // Migration 3: Groups
  {
    version: 3,
    sql: `
CREATE TABLE groups_ (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  leader_id TEXT NOT NULL,
  channel_id TEXT,
  board_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, entity_id)
);

CREATE INDEX idx_group_members_entity ON group_members(entity_id);
`,
  },
  // Migration 4: Tasks
  {
    version: 4,
    sql: `
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id TEXT,
  group_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  prerequisites TEXT NOT NULL DEFAULT '[]',
  deliverables TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  validation_mode TEXT NOT NULL DEFAULT 'creator',
  creator_id TEXT NOT NULL,
  creator_name TEXT NOT NULL,
  standing INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE task_claims (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'claimed',
  submission_text TEXT,
  claimed_at INTEGER NOT NULL,
  submitted_at INTEGER,
  resolved_at INTEGER,
  PRIMARY KEY (task_id, entity_id)
);

CREATE TABLE task_votes (
  task_id INTEGER NOT NULL,
  entity_id TEXT NOT NULL,
  claimant_id TEXT NOT NULL,
  approve INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, entity_id, claimant_id)
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_group ON tasks(group_id);
CREATE INDEX idx_task_claims_entity ON task_claims(entity_id);
`,
  },
  // Migration 5: Macros
  {
    version: 5,
    sql: `
CREATE TABLE macros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  commands TEXT NOT NULL DEFAULT '[]',
  variables TEXT NOT NULL DEFAULT '[]',
  trigger_type TEXT,
  trigger_config TEXT NOT NULL DEFAULT '{}',
  shared INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(name, author_id)
);

CREATE INDEX idx_macros_author ON macros(author_id);
CREATE INDEX idx_macros_shared ON macros(shared);
CREATE INDEX idx_macros_trigger ON macros(trigger_type);
`,
  },
  // Migration 6: Room Sources + Templates (building system)
  {
    version: 6,
    sql: `
CREATE TABLE room_sources (
  room_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  valid INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, version)
);

CREATE TABLE room_templates (
  name TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_room_sources_room ON room_sources(room_id);
`,
  },
  // Migration 7: Users (persistent identity across sessions)
  {
    version: 7,
    sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_login INTEGER NOT NULL,
  rank INTEGER NOT NULL DEFAULT 0,
  properties TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_users_name ON users(name);
`,
  },
  // Migration 8: Bans
  {
    version: 8,
    sql: `
CREATE TABLE bans (
  name TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT '',
  banned_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`,
  },
  // Migration 9: Adapter Links (Telegram, Discord, etc.)
  {
    version: 9,
    sql: `
CREATE TABLE adapter_links (
  adapter TEXT NOT NULL,
  external_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (adapter, external_id)
);

CREATE INDEX idx_adapter_links_user ON adapter_links(user_id);
`,
  },
  // Migration 10: FTS5 full-text search for board posts
  {
    version: 10,
    sql: `
CREATE VIRTUAL TABLE board_posts_fts USING fts5(title, body, tags, content=board_posts, content_rowid=id);

-- Populate FTS from existing data
INSERT INTO board_posts_fts(rowid, title, body, tags) SELECT id, title, body, tags FROM board_posts;

-- Triggers to keep FTS in sync
CREATE TRIGGER board_posts_ai AFTER INSERT ON board_posts BEGIN
  INSERT INTO board_posts_fts(rowid, title, body, tags) VALUES (new.id, new.title, new.body, new.tags);
END;

CREATE TRIGGER board_posts_ad AFTER DELETE ON board_posts BEGIN
  INSERT INTO board_posts_fts(board_posts_fts, rowid, title, body, tags) VALUES('delete', old.id, old.title, old.body, old.tags);
END;

CREATE TRIGGER board_posts_au AFTER UPDATE ON board_posts BEGIN
  INSERT INTO board_posts_fts(board_posts_fts, rowid, title, body, tags) VALUES('delete', old.id, old.title, old.body, old.tags);
  INSERT INTO board_posts_fts(rowid, title, body, tags) VALUES (new.id, new.title, new.body, new.tags);
END;
`,
  },
  // Migration 11: Notes + FTS
  {
    version: 11,
    sql: `
CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_name TEXT NOT NULL,
  room_id TEXT,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_notes_entity ON notes(entity_name);
CREATE INDEX idx_notes_room ON notes(room_id);

CREATE VIRTUAL TABLE notes_fts USING fts5(content, content=notes, content_rowid=id);

CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, content) VALUES('delete', old.id, old.content);
END;

CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, content) VALUES('delete', old.id, old.content);
  INSERT INTO notes_fts(rowid, content) VALUES (new.id, new.content);
END;
`,
  },
  // Migration 12: Experiments
  {
    version: 12,
    sql: `
CREATE TABLE experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  creator_name TEXT NOT NULL,
  required_agents INTEGER NOT NULL DEFAULT 2,
  time_limit INTEGER,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER
);

CREATE TABLE experiment_participants (
  experiment_id INTEGER NOT NULL,
  entity_name TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (experiment_id, entity_name)
);

CREATE TABLE experiment_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  experiment_id INTEGER NOT NULL,
  entity_name TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  recorded_at INTEGER NOT NULL
);

CREATE INDEX idx_exp_status ON experiments(status);
CREATE INDEX idx_expr_experiment ON experiment_results(experiment_id);
`,
  },
  // Migration 13: Task Bundles + Numeric Scoring
  {
    version: 13,
    sql: `
ALTER TABLE tasks ADD COLUMN parent_task_id INTEGER REFERENCES tasks(id);
ALTER TABLE board_votes ADD COLUMN score INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
`,
  },
  // Migration 14: Agent Memory Primitives
  {
    version: 14,
    sql: `
-- Core memory (mutable key-value per entity, MemGPT-style)
CREATE TABLE core_memory (
  entity_name TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (entity_name, key)
);
CREATE TABLE core_memory_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_name TEXT NOT NULL,
  key TEXT NOT NULL,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  changed_at INTEGER NOT NULL
);

-- Extend notes with importance, access tracking, type, pool, and supersession
ALTER TABLE notes ADD COLUMN importance INTEGER NOT NULL DEFAULT 5;
ALTER TABLE notes ADD COLUMN last_accessed INTEGER;
ALTER TABLE notes ADD COLUMN note_type TEXT NOT NULL DEFAULT 'observation';
ALTER TABLE notes ADD COLUMN pool_id TEXT;
ALTER TABLE notes ADD COLUMN supersedes_id INTEGER REFERENCES notes(id);

CREATE INDEX idx_notes_pool ON notes(pool_id);
CREATE INDEX idx_notes_type ON notes(note_type);
CREATE INDEX idx_notes_importance ON notes(importance);

-- Note relationships (knowledge graph edges)
CREATE TABLE note_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES notes(id),
  target_id INTEGER NOT NULL REFERENCES notes(id),
  relationship TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(source_id, target_id, relationship)
);
CREATE INDEX idx_note_links_source ON note_links(source_id);
CREATE INDEX idx_note_links_target ON note_links(target_id);

-- Memory pools (shared note spaces for groups)
CREATE TABLE memory_pools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  group_id TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`,
  },
  // Migration 15: Projects
  {
    version: 15,
    sql: `
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  bundle_id INTEGER REFERENCES tasks(id),
  pool_id TEXT REFERENCES memory_pools(id),
  group_id TEXT,
  orchestration TEXT NOT NULL DEFAULT 'custom',
  memory_arch TEXT NOT NULL DEFAULT 'custom',
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_projects_name ON projects(name);
CREATE INDEX idx_projects_status ON projects(status);
`,
  },
  // Migration 16: Dynamic Commands
  {
    version: 16,
    sql: `
CREATE TABLE dynamic_commands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  valid INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE dynamic_command_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command_id TEXT NOT NULL REFERENCES dynamic_commands(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  version INTEGER NOT NULL,
  edited_by TEXT NOT NULL,
  edited_at INTEGER NOT NULL
);

CREATE INDEX idx_dynamic_commands_name ON dynamic_commands(name);
CREATE INDEX idx_dynamic_command_history_cmd ON dynamic_command_history(command_id);
`,
  },
  // Migration 17: Connectors (outbound MCP servers)
  {
    version: 17,
    sql: `
CREATE TABLE connectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  transport TEXT NOT NULL DEFAULT 'http',
  url TEXT,
  command TEXT,
  args TEXT,
  auth_type TEXT,
  auth_data TEXT,
  lifecycle TEXT NOT NULL DEFAULT 'ephemeral',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE INDEX idx_connectors_name ON connectors(name);
CREATE INDEX idx_connectors_status ON connectors(status);
`,
  },
  // Migration 18: Simplify macros (name → single command string)
  {
    version: 18,
    sql: `
CREATE TABLE macros_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  author_id TEXT NOT NULL,
  command TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(name, author_id)
);

INSERT INTO macros_new (id, name, author_id, command, created_at, updated_at)
  SELECT id, name, author_id, commands, created_at, updated_at FROM macros;

DROP TABLE macros;
ALTER TABLE macros_new RENAME TO macros;
CREATE INDEX idx_macros_author ON macros(author_id);
`,
  },
  // Migration 19: A-Mem enhancements (recall_count, entity_activity)
  {
    version: 19,
    sql: `
ALTER TABLE notes ADD COLUMN recall_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE entity_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_name TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  activity_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  UNIQUE(entity_name, activity_type, activity_key)
);

CREATE INDEX idx_entity_activity_entity ON entity_activity(entity_name);
CREATE INDEX idx_entity_activity_type ON entity_activity(entity_name, activity_type);
`,
  },
  // Migration 20: Assets
  {
    version: 20,
    sql: `
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  entity_name TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_assets_entity ON assets(entity_name);
CREATE INDEX idx_assets_mime ON assets(mime_type);
CREATE INDEX idx_assets_created ON assets(created_at);
`,
  },
  // Migration 21: Canvases + Canvas Nodes
  {
    version: 21,
    sql: `
CREATE TABLE canvases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'global',
  scope_id TEXT,
  creator_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_canvases_scope ON canvases(scope, scope_id);

CREATE TABLE canvas_nodes (
  id TEXT PRIMARY KEY,
  canvas_id TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 300,
  height REAL NOT NULL DEFAULT 200,
  asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  data TEXT NOT NULL DEFAULT '{}',
  creator_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_canvas_nodes_canvas ON canvas_nodes(canvas_id);
CREATE INDEX idx_canvas_nodes_type ON canvas_nodes(type);
`,
  },
  // Migration 22: Meta key-value store (world tracking, etc.)
  {
    version: 22,
    sql: `
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
  },
  // Migration 23: Shell (allowlist + execution log)
  {
    version: 23,
    sql: `
CREATE TABLE shell_allowlist (
  binary TEXT PRIMARY KEY,
  added_by TEXT NOT NULL,
  added_at INTEGER NOT NULL
);

CREATE TABLE shell_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id TEXT NOT NULL,
  binary TEXT NOT NULL,
  args TEXT NOT NULL,
  exit_code INTEGER,
  output_length INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_shell_log_entity ON shell_log(entity_id);
CREATE INDEX idx_shell_log_created ON shell_log(created_at);

INSERT INTO shell_allowlist (binary, added_by, added_at) VALUES ('curl', 'system', strftime('%s','now') * 1000);
INSERT INTO shell_allowlist (binary, added_by, added_at) VALUES ('wget', 'system', strftime('%s','now') * 1000);
INSERT INTO shell_allowlist (binary, added_by, added_at) VALUES ('ls', 'system', strftime('%s','now') * 1000);
INSERT INTO shell_allowlist (binary, added_by, added_at) VALUES ('cat', 'system', strftime('%s','now') * 1000);
INSERT INTO shell_allowlist (binary, added_by, added_at) VALUES ('head', 'system', strftime('%s','now') * 1000);
INSERT INTO shell_allowlist (binary, added_by, added_at) VALUES ('tail', 'system', strftime('%s','now') * 1000);
INSERT INTO shell_allowlist (binary, added_by, added_at) VALUES ('wc', 'system', strftime('%s','now') * 1000);
INSERT INTO shell_allowlist (binary, added_by, added_at) VALUES ('grep', 'system', strftime('%s','now') * 1000);
INSERT INTO shell_allowlist (binary, added_by, added_at) VALUES ('find', 'system', strftime('%s','now') * 1000);
INSERT INTO shell_allowlist (binary, added_by, added_at) VALUES ('jq', 'system', strftime('%s','now') * 1000);
INSERT INTO shell_allowlist (binary, added_by, added_at) VALUES ('echo', 'system', strftime('%s','now') * 1000);
INSERT INTO shell_allowlist (binary, added_by, added_at) VALUES ('date', 'system', strftime('%s','now') * 1000);
`,
  },
  // Migration 24: Task FTS + entity standing ledger
  {
    version: 24,
    sql: `
CREATE VIRTUAL TABLE tasks_fts USING fts5(
  title, description, content=tasks, content_rowid=id
);

INSERT INTO tasks_fts(rowid, title, description)
  SELECT id, title, description FROM tasks;

CREATE TRIGGER tasks_fts_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;

CREATE TRIGGER tasks_fts_ad AFTER DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES('delete', old.id, old.title, old.description);
END;

CREATE TRIGGER tasks_fts_au AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, description) VALUES('delete', old.id, old.title, old.description);
  INSERT INTO tasks_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;

CREATE TABLE entity_standing (
  entity_id TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  amount INTEGER NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (entity_id, task_id)
);
`,
  },
];

// ─── Database Class ──────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

export class ArtilectDB {
  private db: Database;

  constructor(path = "artilect.db") {
    this.db = new Database(path);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA synchronous=NORMAL");
    this.db.exec("PRAGMA foreign_keys=ON");
    this.db.exec(BASE_SCHEMA);
    this.runMigrations();
  }

  private runMigrations(): void {
    const currentVersion = this.getSchemaVersion();
    const pending = MIGRATIONS.filter((m) => m.version > currentVersion);
    if (pending.length === 0) return;

    for (const migration of pending) {
      this.db.transaction(() => {
        this.db.exec(migration.sql);
        this.db.run("INSERT OR REPLACE INTO schema_version (version) VALUES (?)", [
          migration.version,
        ]);
      })();
    }
  }

  private getSchemaVersion(): number {
    const row = this.db.query("SELECT MAX(version) as version FROM schema_version").get() as {
      version: number | null;
    } | null;
    return row?.version ?? 0;
  }

  // ─── Entity Persistence ─────────────────────────────────────────────────

  saveEntity(entity: Entity): void {
    this.db.run(
      `INSERT OR REPLACE INTO entities (id, kind, name, short, long, room, properties, inventory, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entity.id,
        entity.kind,
        entity.name,
        entity.short,
        entity.long,
        entity.room,
        JSON.stringify(entity.properties),
        JSON.stringify(entity.inventory),
        entity.createdAt,
      ],
    );
  }

  loadEntity(id: EntityId): Entity | undefined {
    const row = this.db.query("SELECT * FROM entities WHERE id = ?").get(id) as EntityRow | null;
    if (!row) return undefined;
    return rowToEntity(row);
  }

  loadAllEntities(): Entity[] {
    const rows = this.db.query("SELECT * FROM entities").all() as EntityRow[];
    return rows.map(rowToEntity);
  }

  deleteEntity(id: EntityId): void {
    this.db.run("DELETE FROM entities WHERE id = ?", [id]);
  }

  // ─── Room Key-Value Store ───────────────────────────────────────────────

  getRoomStoreValue(roomId: RoomId, key: string): unknown | undefined {
    const row = this.db
      .query("SELECT value FROM room_store WHERE room_id = ? AND key = ?")
      .get(roomId, key) as { value: string } | null;
    if (!row) return undefined;
    return JSON.parse(row.value);
  }

  setRoomStoreValue(roomId: RoomId, key: string, value: unknown): void {
    this.db.run("INSERT OR REPLACE INTO room_store (room_id, key, value) VALUES (?, ?, ?)", [
      roomId,
      key,
      JSON.stringify(value),
    ]);
  }

  deleteRoomStoreValue(roomId: RoomId, key: string): void {
    this.db.run("DELETE FROM room_store WHERE room_id = ? AND key = ?", [roomId, key]);
  }

  getRoomStoreKeys(roomId: RoomId): string[] {
    const rows = this.db.query("SELECT key FROM room_store WHERE room_id = ?").all(roomId) as {
      key: string;
    }[];
    return rows.map((r) => r.key);
  }

  // ─── Event Log ──────────────────────────────────────────────────────────

  logEvent(event: EngineEvent): void {
    this.db.run("INSERT INTO event_log (type, data, timestamp) VALUES (?, ?, ?)", [
      event.type,
      JSON.stringify(event),
      event.timestamp,
    ]);
  }

  getRecentEvents(limit = 100): EngineEvent[] {
    const rows = this.db
      .query("SELECT data FROM event_log ORDER BY id DESC LIMIT ?")
      .all(limit) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data) as EngineEvent).reverse();
  }

  getEventCount(): number {
    const row = this.db.query("SELECT COUNT(*) as count FROM event_log").get() as {
      count: number;
    };
    return row.count;
  }

  pruneEvents(keepLast: number): void {
    this.db.run(
      "DELETE FROM event_log WHERE id NOT IN (SELECT id FROM event_log ORDER BY id DESC LIMIT ?)",
      [keepLast],
    );
  }

  // ─── Session Persistence ─────────────────────────────────────────────────

  saveSession(session: Session): void {
    this.db.run(
      `INSERT OR REPLACE INTO sessions (token, entity_id, name, created_at, last_seen, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        session.token,
        session.entityId,
        session.name,
        session.createdAt,
        session.lastSeen,
        session.expiresAt,
      ],
    );
  }

  loadSession(token: string): Session | undefined {
    const row = this.db
      .query("SELECT * FROM sessions WHERE token = ?")
      .get(token) as SessionRow | null;
    if (!row) return undefined;
    return rowToSession(row);
  }

  deleteSession(token: string): void {
    this.db.run("DELETE FROM sessions WHERE token = ?", [token]);
  }

  deleteSessionsByEntity(entityId: EntityId): void {
    this.db.run("DELETE FROM sessions WHERE entity_id = ?", [entityId]);
  }

  deleteExpiredSessions(now: number): number {
    const result = this.db.run("DELETE FROM sessions WHERE expires_at < ?", [now]);
    return result.changes;
  }

  loadSessionByEntity(entityId: EntityId): Session | undefined {
    const row = this.db
      .query("SELECT * FROM sessions WHERE entity_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(entityId) as SessionRow | null;
    if (!row) return undefined;
    return rowToSession(row);
  }

  // ─── Bulk Operations ────────────────────────────────────────────────────

  saveAllEntities(entities: Entity[]): void {
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO entities (id, kind, name, short, long, room, properties, inventory, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const saveAll = this.db.transaction(() => {
      for (const entity of entities) {
        insert.run(
          entity.id,
          entity.kind,
          entity.name,
          entity.short,
          entity.long,
          entity.room,
          JSON.stringify(entity.properties),
          JSON.stringify(entity.inventory),
          entity.createdAt,
        );
      }
    });

    saveAll();
  }

  // ─── Channel Persistence ──────────────────────────────────────────────────

  createChannel(channel: {
    id: string;
    type: string;
    name: string;
    ownerId?: string;
    persistence?: string;
    retentionHours?: number;
  }): void {
    this.db.run(
      `INSERT INTO channels (id, type, name, owner_id, persistence, retention_hours, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        channel.id,
        channel.type,
        channel.name,
        channel.ownerId ?? null,
        channel.persistence ?? "permanent",
        channel.retentionHours ?? null,
        Date.now(),
      ],
    );
  }

  getChannel(id: string): ChannelRow | undefined {
    return (
      (this.db.query("SELECT * FROM channels WHERE id = ?").get(id) as ChannelRow | null) ??
      undefined
    );
  }

  getChannelByName(name: string): ChannelRow | undefined {
    return (
      (this.db.query("SELECT * FROM channels WHERE name = ?").get(name) as ChannelRow | null) ??
      undefined
    );
  }

  getAllChannels(): ChannelRow[] {
    return this.db.query("SELECT * FROM channels ORDER BY name").all() as ChannelRow[];
  }

  deleteChannel(id: string): void {
    this.db.run("DELETE FROM channels WHERE id = ?", [id]);
  }

  addChannelMember(channelId: string, entityId: string, canRead = true, canWrite = true): void {
    this.db.run(
      `INSERT OR REPLACE INTO channel_members (channel_id, entity_id, can_read, can_write, joined_at)
       VALUES (?, ?, ?, ?, ?)`,
      [channelId, entityId, canRead ? 1 : 0, canWrite ? 1 : 0, Date.now()],
    );
  }

  removeChannelMember(channelId: string, entityId: string): void {
    this.db.run("DELETE FROM channel_members WHERE channel_id = ? AND entity_id = ?", [
      channelId,
      entityId,
    ]);
  }

  getChannelMembers(channelId: string): ChannelMemberRow[] {
    return this.db
      .query("SELECT * FROM channel_members WHERE channel_id = ?")
      .all(channelId) as ChannelMemberRow[];
  }

  getEntityChannels(entityId: string): ChannelRow[] {
    return this.db
      .query(
        `SELECT c.* FROM channels c
         JOIN channel_members cm ON c.id = cm.channel_id
         WHERE cm.entity_id = ?
         ORDER BY c.name`,
      )
      .all(entityId) as ChannelRow[];
  }

  isChannelMember(channelId: string, entityId: string): boolean {
    const row = this.db
      .query("SELECT 1 FROM channel_members WHERE channel_id = ? AND entity_id = ?")
      .get(channelId, entityId);
    return row !== null;
  }

  addChannelMessage(
    channelId: string,
    senderId: string,
    senderName: string,
    content: string,
  ): number {
    const result = this.db.run(
      `INSERT INTO channel_messages (channel_id, sender_id, sender_name, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [channelId, senderId, senderName, content, Date.now()],
    );
    return Number(result.lastInsertRowid);
  }

  getChannelHistory(channelId: string, limit = 20): ChannelMessageRow[] {
    return this.db
      .query("SELECT * FROM channel_messages WHERE channel_id = ? ORDER BY id DESC LIMIT ?")
      .all(channelId, limit) as ChannelMessageRow[];
  }

  pruneExpiredMessages(now: number): number {
    const result = this.db.run(
      `DELETE FROM channel_messages WHERE channel_id IN (
        SELECT id FROM channels WHERE retention_hours IS NOT NULL
      ) AND created_at < ?`,
      [now],
    );
    return result.changes;
  }

  // ─── Board Persistence ────────────────────────────────────────────────────

  createBoard(board: {
    id: string;
    name: string;
    scopeType?: string;
    scopeId?: string;
    readRank?: number;
    writeRank?: number;
    pinRank?: number;
  }): void {
    this.db.run(
      `INSERT INTO boards (id, name, scope_type, scope_id, read_rank, write_rank, pin_rank, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        board.id,
        board.name,
        board.scopeType ?? "global",
        board.scopeId ?? null,
        board.readRank ?? 0,
        board.writeRank ?? 0,
        board.pinRank ?? 3,
        Date.now(),
      ],
    );
  }

  getBoard(id: string): BoardRow | undefined {
    return (
      (this.db.query("SELECT * FROM boards WHERE id = ?").get(id) as BoardRow | null) ?? undefined
    );
  }

  getBoardByName(name: string): BoardRow | undefined {
    return (
      (this.db.query("SELECT * FROM boards WHERE name = ?").get(name) as BoardRow | null) ??
      undefined
    );
  }

  getBoardsForScope(scopeType: string, scopeId: string): BoardRow[] {
    return this.db
      .query("SELECT * FROM boards WHERE scope_type = ? AND scope_id = ?")
      .all(scopeType, scopeId) as BoardRow[];
  }

  getAllBoards(): BoardRow[] {
    return this.db.query("SELECT * FROM boards ORDER BY name").all() as BoardRow[];
  }

  deleteBoard(id: string): void {
    this.db.run("DELETE FROM boards WHERE id = ?", [id]);
  }

  createBoardPost(post: {
    boardId: string;
    parentId?: number;
    authorId: string;
    authorName: string;
    title?: string;
    body: string;
    tags?: string[];
  }): number {
    const now = Date.now();
    const result = this.db.run(
      `INSERT INTO board_posts (board_id, parent_id, author_id, author_name, title, body, tags, pinned, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [
        post.boardId,
        post.parentId ?? null,
        post.authorId,
        post.authorName,
        post.title ?? "",
        post.body,
        JSON.stringify(post.tags ?? []),
        now,
        now,
      ],
    );
    return Number(result.lastInsertRowid);
  }

  getBoardPost(id: number): BoardPostRow | undefined {
    return (
      (this.db.query("SELECT * FROM board_posts WHERE id = ?").get(id) as BoardPostRow | null) ??
      undefined
    );
  }

  listBoardPosts(
    boardId: string,
    opts?: { offset?: number; limit?: number; archived?: boolean },
  ): BoardPostRow[] {
    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? 20;
    const archived = opts?.archived ?? false;
    return this.db
      .query(
        `SELECT * FROM board_posts WHERE board_id = ? AND archived = ?
         ORDER BY pinned DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(boardId, archived ? 1 : 0, limit, offset) as BoardPostRow[];
  }

  searchBoardPosts(boardId: string, query: string): BoardPostRow[] {
    // Escape special FTS5 characters and add prefix matching
    const safeQuery = query.replace(/['"*()]/g, "").trim();
    if (!safeQuery) return [];
    const ftsQuery = safeQuery
      .split(/\s+/)
      .map((term) => `"${term}"`)
      .join(" ");
    return this.db
      .query(
        `SELECT bp.* FROM board_posts bp
         JOIN board_posts_fts fts ON bp.id = fts.rowid
         WHERE bp.board_id = ? AND board_posts_fts MATCH ?
         ORDER BY fts.rank
         LIMIT 20`,
      )
      .all(boardId, ftsQuery) as BoardPostRow[];
  }

  rebuildBoardSearchIndex(): void {
    this.db.run("INSERT INTO board_posts_fts(board_posts_fts) VALUES('rebuild')");
  }

  pinBoardPost(postId: number): void {
    this.db.run("UPDATE board_posts SET pinned = 1, updated_at = ? WHERE id = ?", [
      Date.now(),
      postId,
    ]);
  }

  unpinBoardPost(postId: number): void {
    this.db.run("UPDATE board_posts SET pinned = 0, updated_at = ? WHERE id = ?", [
      Date.now(),
      postId,
    ]);
  }

  archiveBoardPost(postId: number): void {
    this.db.run("UPDATE board_posts SET archived = 1, updated_at = ? WHERE id = ?", [
      Date.now(),
      postId,
    ]);
  }

  voteBoardPost(postId: number, entityId: string, value: number, score = 0): void {
    this.db.run(
      `INSERT OR REPLACE INTO board_votes (post_id, entity_id, value, score, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [postId, entityId, value, score, Date.now()],
    );
  }

  getBoardPostVoteCount(postId: number): number {
    const row = this.db
      .query("SELECT COALESCE(SUM(value), 0) as total FROM board_votes WHERE post_id = ?")
      .get(postId) as { total: number };
    return row.total;
  }

  autoArchiveBoardPosts(daysOld: number, minVotes: number): number {
    const cutoff = Date.now() - daysOld * DAY_MS;
    const result = this.db.run(
      `UPDATE board_posts SET archived = 1, updated_at = ?
       WHERE archived = 0 AND created_at < ? AND id NOT IN (
         SELECT post_id FROM board_votes GROUP BY post_id HAVING SUM(value) >= ?
       )`,
      [Date.now(), cutoff, minVotes],
    );
    return result.changes;
  }

  getBoardPostScores(postId: number): BoardVoteRow[] {
    return this.db
      .query("SELECT entity_id, value, score FROM board_votes WHERE post_id = ?")
      .all(postId) as BoardVoteRow[];
  }

  getScoreMatrix(boardId: string): BoardVoteRow[] {
    return this.db
      .query(
        `SELECT bv.post_id, bv.entity_id, bv.score FROM board_votes bv
         JOIN board_posts bp ON bv.post_id = bp.id
         WHERE bp.board_id = ? AND bv.score > 0`,
      )
      .all(boardId) as BoardVoteRow[];
  }

  // ─── Group Persistence ────────────────────────────────────────────────────

  createGroup(group: {
    id: string;
    name: string;
    description?: string;
    leaderId: string;
    channelId?: string;
    boardId?: string;
  }): void {
    this.db.run(
      `INSERT INTO groups_ (id, name, description, leader_id, channel_id, board_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        group.id,
        group.name,
        group.description ?? "",
        group.leaderId,
        group.channelId ?? null,
        group.boardId ?? null,
        Date.now(),
      ],
    );
  }

  getGroup(id: string): GroupRow | undefined {
    return (
      (this.db.query("SELECT * FROM groups_ WHERE id = ?").get(id) as GroupRow | null) ?? undefined
    );
  }

  getGroupByName(name: string): GroupRow | undefined {
    return (
      (this.db.query("SELECT * FROM groups_ WHERE name = ?").get(name) as GroupRow | null) ??
      undefined
    );
  }

  getAllGroups(): GroupRow[] {
    return this.db.query("SELECT * FROM groups_ ORDER BY name").all() as GroupRow[];
  }

  deleteGroup(id: string): void {
    this.db.run("DELETE FROM groups_ WHERE id = ?", [id]);
  }

  updateGroupChannelAndBoard(groupId: string, channelId: string, boardId: string): void {
    this.db.run("UPDATE groups_ SET channel_id = ?, board_id = ? WHERE id = ?", [
      channelId,
      boardId,
      groupId,
    ]);
  }

  addGroupMember(groupId: string, entityId: string, rank = 0): void {
    this.db.run(
      `INSERT OR REPLACE INTO group_members (group_id, entity_id, rank, joined_at)
       VALUES (?, ?, ?, ?)`,
      [groupId, entityId, rank, Date.now()],
    );
  }

  removeGroupMember(groupId: string, entityId: string): void {
    this.db.run("DELETE FROM group_members WHERE group_id = ? AND entity_id = ?", [
      groupId,
      entityId,
    ]);
  }

  getGroupMembers(groupId: string): GroupMemberRow[] {
    return this.db
      .query("SELECT * FROM group_members WHERE group_id = ?")
      .all(groupId) as GroupMemberRow[];
  }

  getGroupMember(groupId: string, entityId: string): GroupMemberRow | undefined {
    return (
      (this.db
        .query("SELECT * FROM group_members WHERE group_id = ? AND entity_id = ?")
        .get(groupId, entityId) as GroupMemberRow | null) ?? undefined
    );
  }

  getEntityGroups(entityId: string): GroupRow[] {
    return this.db
      .query(
        `SELECT g.* FROM groups_ g
         JOIN group_members gm ON g.id = gm.group_id
         WHERE gm.entity_id = ?
         ORDER BY g.name`,
      )
      .all(entityId) as GroupRow[];
  }

  updateGroupMemberRank(groupId: string, entityId: string, rank: number): void {
    this.db.run("UPDATE group_members SET rank = ? WHERE group_id = ? AND entity_id = ?", [
      rank,
      groupId,
      entityId,
    ]);
  }

  // ─── Task Persistence ─────────────────────────────────────────────────────

  createTask(task: {
    groupId?: string;
    title: string;
    description?: string;
    creatorId: string;
    creatorName: string;
    validationMode?: string;
    standing?: number;
    parentTaskId?: number;
  }): number {
    const now = Date.now();
    const result = this.db.run(
      `INSERT INTO tasks (group_id, title, description, creator_id, creator_name, validation_mode, status, standing, parent_task_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
      [
        task.groupId ?? null,
        task.title,
        task.description ?? "",
        task.creatorId,
        task.creatorName,
        task.validationMode ?? "creator",
        task.standing ?? 0,
        task.parentTaskId ?? null,
        now,
        now,
      ],
    );
    return Number(result.lastInsertRowid);
  }

  getTask(id: number): TaskRow | undefined {
    return (
      (this.db.query("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | null) ?? undefined
    );
  }

  listTasks(opts?: {
    status?: string;
    groupId?: string;
    parentId?: number;
    limit?: number;
    orderByStanding?: boolean;
  }): TaskRow[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (opts?.status) {
      conditions.push("status = ?");
      params.push(opts.status);
    }
    if (opts?.groupId) {
      conditions.push("group_id = ?");
      params.push(opts.groupId);
    }
    if (opts?.parentId !== undefined) {
      conditions.push("parent_task_id = ?");
      params.push(opts.parentId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const order = opts?.orderByStanding ? "ORDER BY standing DESC, id DESC" : "ORDER BY id DESC";
    const limit = opts?.limit ?? 20;
    params.push(limit);

    return this.db
      .query(`SELECT * FROM tasks ${where} ${order} LIMIT ?`)
      .all(...params) as TaskRow[];
  }

  updateTaskStatus(id: number, status: string): void {
    this.db.run("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?", [
      status,
      Date.now(),
      id,
    ]);
  }

  createTaskClaim(taskId: number, entityId: string, entityName: string): void {
    this.db.run(
      `INSERT INTO task_claims (task_id, entity_id, entity_name, status, claimed_at)
       VALUES (?, ?, ?, 'claimed', ?)`,
      [taskId, entityId, entityName, Date.now()],
    );
  }

  getTaskClaim(taskId: number, entityId: string): TaskClaimRow | undefined {
    return (
      (this.db
        .query("SELECT * FROM task_claims WHERE task_id = ? AND entity_id = ?")
        .get(taskId, entityId) as TaskClaimRow | null) ?? undefined
    );
  }

  getTaskClaims(taskId: number): TaskClaimRow[] {
    return this.db
      .query("SELECT * FROM task_claims WHERE task_id = ?")
      .all(taskId) as TaskClaimRow[];
  }

  updateTaskClaimStatus(
    taskId: number,
    entityId: string,
    status: string,
    submissionText?: string,
  ): void {
    const now = Date.now();
    if (status === "submitted") {
      this.db.run(
        "UPDATE task_claims SET status = ?, submission_text = ?, submitted_at = ? WHERE task_id = ? AND entity_id = ?",
        [status, submissionText ?? null, now, taskId, entityId],
      );
    } else {
      this.db.run(
        "UPDATE task_claims SET status = ?, resolved_at = ? WHERE task_id = ? AND entity_id = ?",
        [status, now, taskId, entityId],
      );
    }
  }

  getChildTaskCount(parentId: number): { total: number; completed: number } {
    const row = this.db
      .query(
        "SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed FROM tasks WHERE parent_task_id = ?",
      )
      .get(parentId) as { total: number; completed: number | null };
    return { total: row.total, completed: row.completed ?? 0 };
  }

  setTaskParent(taskId: number, parentTaskId: number): void {
    this.db.run("UPDATE tasks SET parent_task_id = ?, updated_at = ? WHERE id = ?", [
      parentTaskId,
      Date.now(),
      taskId,
    ]);
  }

  searchTasks(
    query: string,
    opts?: { status?: string; limit?: number },
  ): (TaskRow & { score: number })[] {
    const conditions = ["tasks_fts MATCH ?"];
    const params: (string | number)[] = [query];

    if (opts?.status) {
      conditions.push("t.status = ?");
      params.push(opts.status);
    }

    const limit = opts?.limit ?? 10;
    params.push(limit);

    const where = conditions.join(" AND ");
    return this.db
      .query(
        `SELECT t.*, rank * -1 AS score
         FROM tasks t
         JOIN tasks_fts fts ON t.id = fts.rowid
         WHERE ${where}
         ORDER BY score DESC
         LIMIT ?`,
      )
      .all(...params) as (TaskRow & { score: number })[];
  }

  recordStandingEarned(entityId: string, entityName: string, taskId: number, amount: number): void {
    this.db.run(
      `INSERT OR REPLACE INTO entity_standing (entity_id, entity_name, task_id, amount, earned_at)
       VALUES (?, ?, ?, ?, ?)`,
      [entityId, entityName, taskId, amount, Date.now()],
    );
  }

  getEntityStanding(entityId: string): number {
    const row = this.db
      .query("SELECT COALESCE(SUM(amount), 0) AS total FROM entity_standing WHERE entity_id = ?")
      .get(entityId) as { total: number };
    return row.total;
  }

  getStandingLeaderboard(limit = 10): { entityName: string; total: number; taskCount: number }[] {
    return this.db
      .query(
        `SELECT entity_name AS entityName, SUM(amount) AS total, COUNT(*) AS taskCount
         FROM entity_standing
         GROUP BY entity_id
         ORDER BY total DESC
         LIMIT ?`,
      )
      .all(limit) as { entityName: string; total: number; taskCount: number }[];
  }

  rejectAllOtherClaims(taskId: number, winnerEntityId: string): void {
    const now = Date.now();
    this.db.run(
      `UPDATE task_claims SET status = 'rejected', resolved_at = ?
       WHERE task_id = ? AND entity_id != ? AND status IN ('claimed', 'submitted')`,
      [now, taskId, winnerEntityId],
    );
  }

  // ─── Macro Persistence ────────────────────────────────────────────────────

  createMacro(name: string, authorId: string, command: string): number {
    const now = Date.now();
    const result = this.db.run(
      "INSERT INTO macros (name, author_id, command, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [name, authorId, command, now, now],
    );
    return Number(result.lastInsertRowid);
  }

  getMacro(id: number): MacroRow | undefined {
    return (
      (this.db.query("SELECT * FROM macros WHERE id = ?").get(id) as MacroRow | null) ?? undefined
    );
  }

  getMacroByName(name: string, authorId: string): MacroRow | undefined {
    return (
      (this.db
        .query("SELECT * FROM macros WHERE name = ? AND author_id = ?")
        .get(name, authorId) as MacroRow | null) ?? undefined
    );
  }

  listMacros(authorId?: string): MacroRow[] {
    if (authorId) {
      return this.db
        .query("SELECT * FROM macros WHERE author_id = ? ORDER BY name")
        .all(authorId) as MacroRow[];
    }
    return this.db.query("SELECT * FROM macros ORDER BY name").all() as MacroRow[];
  }

  updateMacro(id: number, command: string): void {
    this.db.run("UPDATE macros SET command = ?, updated_at = ? WHERE id = ?", [
      command,
      Date.now(),
      id,
    ]);
  }

  deleteMacro(id: number): void {
    this.db.run("DELETE FROM macros WHERE id = ?", [id]);
  }

  // ─── Room Source Persistence ─────────────────────────────────────────────

  saveRoomSource(opts: {
    roomId: string;
    source: string;
    authorId: string;
    authorName: string;
    valid?: boolean;
  }): number {
    const version = this.getLatestRoomSourceVersion(opts.roomId) + 1;
    this.db.run(
      `INSERT INTO room_sources (room_id, version, source, author_id, author_name, valid, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        opts.roomId,
        version,
        opts.source,
        opts.authorId,
        opts.authorName,
        opts.valid ? 1 : 0,
        Date.now(),
      ],
    );
    return version;
  }

  getRoomSource(roomId: string, version?: number): RoomSourceRow | undefined {
    if (version !== undefined) {
      return (
        (this.db
          .query("SELECT * FROM room_sources WHERE room_id = ? AND version = ?")
          .get(roomId, version) as RoomSourceRow | null) ?? undefined
      );
    }
    // Latest version
    return (
      (this.db
        .query("SELECT * FROM room_sources WHERE room_id = ? ORDER BY version DESC LIMIT 1")
        .get(roomId) as RoomSourceRow | null) ?? undefined
    );
  }

  getRoomSourceHistory(roomId: string, limit = 20): RoomSourceRow[] {
    return this.db
      .query("SELECT * FROM room_sources WHERE room_id = ? ORDER BY version DESC LIMIT ?")
      .all(roomId, limit) as RoomSourceRow[];
  }

  getLatestRoomSourceVersion(roomId: string): number {
    const row = this.db
      .query("SELECT MAX(version) as max_version FROM room_sources WHERE room_id = ?")
      .get(roomId) as { max_version: number | null } | null;
    return row?.max_version ?? 0;
  }

  getAllRoomSourceIds(): string[] {
    return (
      this.db.query("SELECT DISTINCT room_id FROM room_sources ORDER BY room_id").all() as {
        room_id: string;
      }[]
    ).map((r) => r.room_id);
  }

  markRoomSourceValid(roomId: string, version: number): void {
    this.db.run("UPDATE room_sources SET valid = 1 WHERE room_id = ? AND version = ?", [
      roomId,
      version,
    ]);
  }

  deleteRoomSources(roomId: string): void {
    this.db.run("DELETE FROM room_sources WHERE room_id = ?", [roomId]);
  }

  // ─── Room Template Persistence ──────────────────────────────────────────

  saveRoomTemplate(opts: {
    name: string;
    source: string;
    authorId: string;
    authorName: string;
    description?: string;
  }): void {
    this.db.run(
      `INSERT OR REPLACE INTO room_templates (name, source, author_id, author_name, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [opts.name, opts.source, opts.authorId, opts.authorName, opts.description ?? "", Date.now()],
    );
  }

  getRoomTemplate(name: string): RoomTemplateRow | undefined {
    return (
      (this.db
        .query("SELECT * FROM room_templates WHERE name = ?")
        .get(name) as RoomTemplateRow | null) ?? undefined
    );
  }

  getAllRoomTemplates(): RoomTemplateRow[] {
    return this.db.query("SELECT * FROM room_templates ORDER BY name").all() as RoomTemplateRow[];
  }

  deleteRoomTemplate(name: string): void {
    this.db.run("DELETE FROM room_templates WHERE name = ?", [name]);
  }

  // ─── User Persistence ───────────────────────────────────────────────────

  createUser(user: { id: string; name: string; rank?: number }): void {
    const now = Date.now();
    this.db.run(
      "INSERT INTO users (id, name, created_at, last_login, rank) VALUES (?, ?, ?, ?, ?)",
      [user.id, user.name, now, now, user.rank ?? 0],
    );
  }

  getUser(id: string): UserRow | undefined {
    return (
      (this.db.query("SELECT * FROM users WHERE id = ?").get(id) as UserRow | null) ?? undefined
    );
  }

  getUserByName(name: string): UserRow | undefined {
    return (
      (this.db.query("SELECT * FROM users WHERE name = ?").get(name) as UserRow | null) ?? undefined
    );
  }

  updateUserLastLogin(id: string): void {
    this.db.run("UPDATE users SET last_login = ? WHERE id = ?", [Date.now(), id]);
  }

  updateUserRank(id: string, rank: number): void {
    this.db.run("UPDATE users SET rank = ? WHERE id = ?", [rank, id]);
  }

  updateUserProperties(id: string, properties: Record<string, unknown>): void {
    this.db.run("UPDATE users SET properties = ? WHERE id = ?", [JSON.stringify(properties), id]);
  }

  deleteUser(id: string): void {
    this.db.run("DELETE FROM users WHERE id = ?", [id]);
  }

  // ─── Ban Persistence ──────────────────────────────────────────────────

  addBan(name: string, bannedBy: string, reason = ""): void {
    this.db.run(
      "INSERT OR REPLACE INTO bans (name, reason, banned_by, created_at) VALUES (?, ?, ?, ?)",
      [name.toLowerCase(), reason, bannedBy, Date.now()],
    );
  }

  removeBan(name: string): boolean {
    const result = this.db.run("DELETE FROM bans WHERE name = ?", [name.toLowerCase()]);
    return result.changes > 0;
  }

  isBanned(name: string): boolean {
    const row = this.db.query("SELECT 1 FROM bans WHERE name = ?").get(name.toLowerCase());
    return row !== null;
  }

  getBan(name: string): BanRow | undefined {
    return (
      (this.db
        .query("SELECT * FROM bans WHERE name = ?")
        .get(name.toLowerCase()) as BanRow | null) ?? undefined
    );
  }

  listBans(): BanRow[] {
    return this.db.query("SELECT * FROM bans ORDER BY created_at DESC").all() as BanRow[];
  }

  // ─── Adapter Link Persistence ──────────────────────────────────────────

  linkAdapter(adapter: string, externalId: string, userId: string): void {
    this.db.run(
      "INSERT OR REPLACE INTO adapter_links (adapter, external_id, user_id, created_at) VALUES (?, ?, ?, ?)",
      [adapter, externalId, userId, Date.now()],
    );
  }

  getLinkedUser(adapter: string, externalId: string): AdapterLinkRow | undefined {
    return (
      (this.db
        .query("SELECT * FROM adapter_links WHERE adapter = ? AND external_id = ?")
        .get(adapter, externalId) as AdapterLinkRow | null) ?? undefined
    );
  }

  getUserLinks(userId: string): AdapterLinkRow[] {
    return this.db
      .query("SELECT * FROM adapter_links WHERE user_id = ?")
      .all(userId) as AdapterLinkRow[];
  }

  unlinkAdapter(adapter: string, externalId: string): boolean {
    const result = this.db.run("DELETE FROM adapter_links WHERE adapter = ? AND external_id = ?", [
      adapter,
      externalId,
    ]);
    return result.changes > 0;
  }

  // ─── Notes Persistence ──────────────────────────────────────────────────

  createNote(
    entityName: string,
    content: string,
    roomId?: string,
    opts?: {
      importance?: number;
      noteType?: string;
      poolId?: string;
      supersedesId?: number;
    },
  ): number {
    const result = this.db.run(
      "INSERT INTO notes (entity_name, room_id, content, importance, note_type, pool_id, supersedes_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        entityName,
        roomId ?? null,
        content,
        opts?.importance ?? 5,
        opts?.noteType ?? "observation",
        opts?.poolId ?? null,
        opts?.supersedesId ?? null,
        Date.now(),
      ],
    );
    return Number(result.lastInsertRowid);
  }

  getNotesByEntity(entityName: string, limit = 50): NoteRow[] {
    return this.db
      .query("SELECT * FROM notes WHERE entity_name = ? ORDER BY id DESC LIMIT ?")
      .all(entityName, limit) as NoteRow[];
  }

  getNotesByRoom(roomId: string, limit = 50): NoteRow[] {
    return this.db
      .query("SELECT * FROM notes WHERE room_id = ? ORDER BY id DESC LIMIT ?")
      .all(roomId, limit) as NoteRow[];
  }

  searchNotes(entityName: string, query: string): NoteRow[] {
    const safeQuery = query.replace(/['"*()]/g, "").trim();
    if (!safeQuery) return [];
    const ftsQuery = safeQuery
      .split(/\s+/)
      .map((term) => `"${term}"`)
      .join(" ");
    return this.db
      .query(
        `SELECT n.* FROM notes n
         JOIN notes_fts fts ON n.id = fts.rowid
         WHERE n.entity_name = ? AND notes_fts MATCH ?
         ORDER BY fts.rank
         LIMIT 20`,
      )
      .all(entityName, ftsQuery) as NoteRow[];
  }

  deleteNote(id: number, entityName: string): boolean {
    const note = this.db
      .query("SELECT id FROM notes WHERE id = ? AND entity_name = ?")
      .get(id, entityName);
    if (!note) return false;
    // Clear FK references before deleting
    this.db.run("DELETE FROM note_links WHERE source_id = ? OR target_id = ?", [id, id]);
    this.db.run("UPDATE notes SET supersedes_id = NULL WHERE supersedes_id = ?", [id]);
    const result = this.db.run("DELETE FROM notes WHERE id = ? AND entity_name = ?", [
      id,
      entityName,
    ]);
    return result.changes > 0;
  }

  getNote(id: number): NoteRow | undefined {
    return (
      (this.db.query("SELECT * FROM notes WHERE id = ?").get(id) as NoteRow | null) ?? undefined
    );
  }

  touchNote(id: number): void {
    this.db.run(
      "UPDATE notes SET last_accessed = ?, recall_count = recall_count + 1 WHERE id = ?",
      [Date.now(), id],
    );
  }

  recallNotes(
    entityName: string,
    query: string,
    opts?: { weightImportance?: number; weightRecency?: number; weightRelevance?: number },
  ): ScoredNoteRow[] {
    const safeQuery = query.replace(/['"*()]/g, "").trim();
    if (!safeQuery) return [];
    const ftsQuery = safeQuery
      .split(/\s+/)
      .map((term) => `"${term}"`)
      .join(" ");
    const alpha = opts?.weightImportance ?? 0.33;
    const beta = opts?.weightRecency ?? 0.33;
    const gamma = opts?.weightRelevance ?? 0.34;
    const now = Date.now();
    return this.db
      .query(
        `SELECT n.*,
          (? * (n.importance / 10.0)) +
          (? * (1.0 / (1.0 + (? - COALESCE(n.last_accessed, n.created_at)) / 86400000.0))) +
          (? * (-fts.rank))
          AS score
        FROM notes n
        JOIN notes_fts fts ON n.id = fts.rowid
        WHERE n.entity_name = ? AND n.pool_id IS NULL AND notes_fts MATCH ?
        ORDER BY score DESC
        LIMIT 20`,
      )
      .all(alpha, beta, now, gamma, entityName, ftsQuery) as ScoredNoteRow[];
  }

  recallNotesWithType(
    entityName: string,
    query: string,
    noteType: string,
    opts?: { weightImportance?: number; weightRecency?: number; weightRelevance?: number },
  ): ScoredNoteRow[] {
    const safeQuery = query.replace(/['"*()]/g, "").trim();
    if (!safeQuery) return [];
    const ftsQuery = safeQuery
      .split(/\s+/)
      .map((term) => `"${term}"`)
      .join(" ");
    const alpha = opts?.weightImportance ?? 0.33;
    const beta = opts?.weightRecency ?? 0.33;
    const gamma = opts?.weightRelevance ?? 0.34;
    const now = Date.now();
    return this.db
      .query(
        `SELECT n.*,
          (? * (n.importance / 10.0)) +
          (? * (1.0 / (1.0 + (? - COALESCE(n.last_accessed, n.created_at)) / 86400000.0))) +
          (? * (-fts.rank))
          AS score
        FROM notes n
        JOIN notes_fts fts ON n.id = fts.rowid
        WHERE n.entity_name = ? AND n.pool_id IS NULL AND n.note_type = ? AND notes_fts MATCH ?
        ORDER BY score DESC
        LIMIT 20`,
      )
      .all(alpha, beta, now, gamma, entityName, noteType, ftsQuery) as ScoredNoteRow[];
  }

  /** Find existing notes similar to content (for auto-linking) */
  findSimilarNotes(entityName: string, content: string, excludeId?: number): NoteRow[] {
    const safeQuery = content.replace(/['"*()]/g, "").trim();
    if (!safeQuery) return [];
    // Take first few meaningful words for FTS search
    const words = safeQuery.split(/\s+/).slice(0, 5);
    if (words.length === 0) return [];
    const ftsQuery = words.map((term) => `"${term}"`).join(" OR ");
    try {
      const rows = this.db
        .query(
          `SELECT n.*, -fts.rank as relevance FROM notes n
           JOIN notes_fts fts ON n.id = fts.rowid
           WHERE n.entity_name = ? AND n.pool_id IS NULL AND notes_fts MATCH ?
           ORDER BY relevance DESC
           LIMIT 5`,
        )
        .all(entityName, ftsQuery) as (NoteRow & { relevance: number })[];
      return rows.filter((r) => r.id !== excludeId && r.relevance > 0.5);
    } catch {
      return [];
    }
  }

  /** Count total and fading matches for a query (beyond the top-20 recall returns) */
  countMatchingNotes(entityName: string, query: string): { total: number; fading: number } {
    const safeQuery = query.replace(/['"*()]/g, "").trim();
    if (!safeQuery) return { total: 0, fading: 0 };
    const ftsQuery = safeQuery
      .split(/\s+/)
      .map((term) => `"${term}"`)
      .join(" ");
    try {
      const row = this.db
        .query(
          `SELECT COUNT(*) as total,
            SUM(CASE WHEN n.importance <= 2 THEN 1 ELSE 0 END) as fading
           FROM notes n
           JOIN notes_fts fts ON n.id = fts.rowid
           WHERE n.entity_name = ? AND n.pool_id IS NULL AND notes_fts MATCH ?`,
        )
        .get(entityName, ftsQuery) as { total: number; fading: number } | null;
      return { total: row?.total ?? 0, fading: row?.fading ?? 0 };
    } catch {
      return { total: 0, fading: 0 };
    }
  }

  /** Boost importance for frequently-recalled notes, decay for stale ones.
   *  Structural awareness: well-linked notes (3+ links) decay slower,
   *  bridge notes (connecting different clusters) are protected. */
  adjustNoteImportance(): { boosted: number; decayed: number } {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * DAY_MS;
    const fourteenDaysAgo = now - 14 * DAY_MS;

    // Boost: notes recalled 3+ times, importance < 10
    const boosted = this.db.run(
      "UPDATE notes SET importance = MIN(importance + 1, 10) WHERE recall_count >= 3 AND importance < 10 AND pool_id IS NULL",
    );

    // Decay with structural protection:
    // - Well-linked notes (3+ links) only decay after 14 days instead of 7
    // - Unlinked notes decay normally after 7 days
    const decayed = this.db.run(
      `UPDATE notes SET importance = MAX(importance - 1, 1)
       WHERE recall_count = 0 AND importance > 1 AND pool_id IS NULL
       AND id NOT IN (
         SELECT n.id FROM notes n
         JOIN note_links nl ON n.id = nl.source_id OR n.id = nl.target_id
         WHERE n.recall_count = 0 AND n.pool_id IS NULL
         GROUP BY n.id
         HAVING COUNT(*) >= 3
       )
       AND created_at < ?`,
      [sevenDaysAgo],
    );

    // Decay well-linked notes on slower schedule (14 days)
    const decayedLinked = this.db.run(
      `UPDATE notes SET importance = MAX(importance - 1, 1)
       WHERE recall_count = 0 AND importance > 1 AND pool_id IS NULL
       AND id IN (
         SELECT n.id FROM notes n
         JOIN note_links nl ON n.id = nl.source_id OR n.id = nl.target_id
         WHERE n.recall_count = 0 AND n.pool_id IS NULL
         GROUP BY n.id
         HAVING COUNT(*) >= 3
       )
       AND created_at < ?`,
      [fourteenDaysAgo],
    );

    // Reset recall counts after adjustment
    this.db.run("UPDATE notes SET recall_count = 0 WHERE recall_count > 0");

    return { boosted: boosted.changes, decayed: decayed.changes + decayedLinked.changes };
  }

  // ─── Entity Activity Tracking ─────────────────────────────────────────

  trackActivity(entityName: string, activityType: string, activityKey: string): void {
    const now = Date.now();
    this.db.run(
      `INSERT INTO entity_activity (entity_name, activity_type, activity_key, count, first_seen, last_seen)
       VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT(entity_name, activity_type, activity_key)
       DO UPDATE SET count = count + 1, last_seen = ?`,
      [entityName, activityType, activityKey, now, now, now],
    );
  }

  getActivityStats(entityName: string): {
    roomsVisited: number;
    uniqueCommands: number;
    entitiesInteracted: number;
    totalActions: number;
  } {
    const rooms = this.db
      .query(
        "SELECT COUNT(*) as c FROM entity_activity WHERE entity_name = ? AND activity_type = 'room_visit'",
      )
      .get(entityName) as { c: number };
    const commands = this.db
      .query(
        "SELECT COUNT(*) as c FROM entity_activity WHERE entity_name = ? AND activity_type = 'command'",
      )
      .get(entityName) as { c: number };
    const entities = this.db
      .query(
        "SELECT COUNT(*) as c FROM entity_activity WHERE entity_name = ? AND activity_type = 'interaction'",
      )
      .get(entityName) as { c: number };
    const total = this.db
      .query("SELECT COALESCE(SUM(count), 0) as c FROM entity_activity WHERE entity_name = ?")
      .get(entityName) as { c: number };
    return {
      roomsVisited: rooms.c,
      uniqueCommands: commands.c,
      entitiesInteracted: entities.c,
      totalActions: total.c,
    };
  }

  getRoomVisitCount(entityName: string, roomId: string): number {
    const row = this.db
      .query(
        "SELECT count FROM entity_activity WHERE entity_name = ? AND activity_type = 'room_visit' AND activity_key = ?",
      )
      .get(entityName, roomId) as { count: number } | null;
    return row?.count ?? 0;
  }

  getActivityByType(
    entityName: string,
    activityType: string,
    limit = 20,
  ): { key: string; count: number; lastSeen: number }[] {
    return this.db
      .query(
        "SELECT activity_key, count, last_seen FROM entity_activity WHERE entity_name = ? AND activity_type = ? ORDER BY count DESC LIMIT ?",
      )
      .all(entityName, activityType, limit)
      .map((row: unknown) => {
        const r = row as { activity_key: string; count: number; last_seen: number };
        return { key: r.activity_key, count: r.count, lastSeen: r.last_seen };
      });
  }

  // ─── Core Memory Persistence ───────────────────────────────────────────

  setCoreMemory(entityName: string, key: string, value: string): void {
    const existing = this.getCoreMemory(entityName, key);
    if (existing) {
      this.db.run(
        "INSERT INTO core_memory_history (entity_name, key, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?)",
        [entityName, key, existing.value, value, Date.now()],
      );
      this.db.run(
        "UPDATE core_memory SET value = ?, version = version + 1, updated_at = ? WHERE entity_name = ? AND key = ?",
        [value, Date.now(), entityName, key],
      );
    } else {
      const now = Date.now();
      this.db.run(
        "INSERT INTO core_memory (entity_name, key, value, version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
        [entityName, key, value, now, now],
      );
    }
  }

  getCoreMemory(entityName: string, key: string): CoreMemoryRow | undefined {
    return (
      (this.db
        .query("SELECT * FROM core_memory WHERE entity_name = ? AND key = ?")
        .get(entityName, key) as CoreMemoryRow | null) ?? undefined
    );
  }

  listCoreMemory(entityName: string): CoreMemoryRow[] {
    return this.db
      .query("SELECT * FROM core_memory WHERE entity_name = ? ORDER BY key")
      .all(entityName) as CoreMemoryRow[];
  }

  deleteCoreMemory(entityName: string, key: string): boolean {
    const result = this.db.run("DELETE FROM core_memory WHERE entity_name = ? AND key = ?", [
      entityName,
      key,
    ]);
    return result.changes > 0;
  }

  getCoreMemoryHistory(entityName: string, key: string, limit = 10): CoreMemoryHistoryRow[] {
    return this.db
      .query(
        "SELECT * FROM core_memory_history WHERE entity_name = ? AND key = ? ORDER BY id DESC LIMIT ?",
      )
      .all(entityName, key, limit) as CoreMemoryHistoryRow[];
  }

  // ─── Note Links (Knowledge Graph) ─────────────────────────────────────

  createNoteLink(sourceId: number, targetId: number, relationship: string): number {
    const result = this.db.run(
      "INSERT INTO note_links (source_id, target_id, relationship, created_at) VALUES (?, ?, ?, ?)",
      [sourceId, targetId, relationship, Date.now()],
    );
    return Number(result.lastInsertRowid);
  }

  getNoteLinks(noteId: number): NoteLinkRow[] {
    return this.db
      .query("SELECT * FROM note_links WHERE source_id = ? OR target_id = ?")
      .all(noteId, noteId) as NoteLinkRow[];
  }

  traceNoteGraph(
    noteId: number,
    depth = 2,
  ): { note: NoteRow; links: NoteLinkRow[]; depth: number }[] {
    const visited = new Set<number>();
    const results: { note: NoteRow; links: NoteLinkRow[]; depth: number }[] = [];
    const queue: { id: number; depth: number }[] = [{ id: noteId, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);

      const note = this.getNote(current.id);
      if (!note) continue;

      const links = this.getNoteLinks(current.id);
      results.push({ note, links, depth: current.depth });

      if (current.depth < depth) {
        for (const link of links) {
          const nextId = link.source_id === current.id ? link.target_id : link.source_id;
          if (!visited.has(nextId)) {
            queue.push({ id: nextId, depth: current.depth + 1 });
          }
        }
      }
    }

    return results;
  }

  /** Count total note links for an entity's notes */
  countNoteLinks(entityName: string): number {
    const row = this.db
      .query(
        `SELECT COUNT(*) as c FROM note_links nl
         JOIN notes n ON nl.source_id = n.id OR nl.target_id = n.id
         WHERE n.entity_name = ?`,
      )
      .get(entityName) as { c: number };
    return row.c;
  }

  /** Count links for a specific note */
  countLinksForNote(noteId: number): number {
    const row = this.db
      .query("SELECT COUNT(*) as c FROM note_links WHERE source_id = ? OR target_id = ?")
      .get(noteId, noteId) as { c: number };
    return row.c;
  }

  // ─── Memory Pools ─────────────────────────────────────────────────────

  createMemoryPool(id: string, name: string, createdBy: string, groupId?: string): void {
    this.db.run(
      "INSERT INTO memory_pools (id, name, group_id, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
      [id, name, groupId ?? null, createdBy, Date.now()],
    );
  }

  getMemoryPool(name: string): MemoryPoolRow | undefined {
    return (
      (this.db
        .query("SELECT * FROM memory_pools WHERE name = ?")
        .get(name) as MemoryPoolRow | null) ?? undefined
    );
  }

  listMemoryPools(): MemoryPoolRow[] {
    return this.db.query("SELECT * FROM memory_pools ORDER BY name").all() as MemoryPoolRow[];
  }

  addPoolNote(
    poolId: string,
    entityName: string,
    content: string,
    importance?: number,
    noteType?: string,
  ): number {
    return this.createNote(entityName, content, undefined, {
      importance,
      noteType,
      poolId,
    });
  }

  getPoolNotes(poolId: string, limit = 100): NoteRow[] {
    return this.db
      .query("SELECT * FROM notes WHERE pool_id = ? ORDER BY id DESC LIMIT ?")
      .all(poolId, limit) as NoteRow[];
  }

  recallPoolNotes(
    poolId: string,
    query: string,
    opts?: { weightImportance?: number; weightRecency?: number; weightRelevance?: number },
  ): ScoredNoteRow[] {
    const safeQuery = query.replace(/['"*()]/g, "").trim();
    if (!safeQuery) return [];
    const ftsQuery = safeQuery
      .split(/\s+/)
      .map((term) => `"${term}"`)
      .join(" ");
    const alpha = opts?.weightImportance ?? 0.33;
    const beta = opts?.weightRecency ?? 0.33;
    const gamma = opts?.weightRelevance ?? 0.34;
    const now = Date.now();
    return this.db
      .query(
        `SELECT n.*,
          (? * (n.importance / 10.0)) +
          (? * (1.0 / (1.0 + (? - COALESCE(n.last_accessed, n.created_at)) / 86400000.0))) +
          (? * (-fts.rank))
          AS score
        FROM notes n
        JOIN notes_fts fts ON n.id = fts.rowid
        WHERE n.pool_id = ? AND notes_fts MATCH ?
        ORDER BY score DESC
        LIMIT 20`,
      )
      .all(alpha, beta, now, gamma, poolId, ftsQuery) as ScoredNoteRow[];
  }

  // ─── Project Persistence ──────────────────────────────────────────────

  createProject(project: {
    id: string;
    name: string;
    description?: string;
    bundleId?: number;
    poolId?: string;
    groupId?: string;
    orchestration?: string;
    memoryArch?: string;
    createdBy: string;
  }): void {
    this.db.run(
      `INSERT INTO projects (id, name, description, bundle_id, pool_id, group_id, orchestration, memory_arch, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [
        project.id,
        project.name,
        project.description ?? "",
        project.bundleId ?? null,
        project.poolId ?? null,
        project.groupId ?? null,
        project.orchestration ?? "custom",
        project.memoryArch ?? "custom",
        project.createdBy,
        Date.now(),
      ],
    );
  }

  getProject(id: string): ProjectRow | undefined {
    return (
      (this.db.query("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | null) ??
      undefined
    );
  }

  getProjectByName(name: string): ProjectRow | undefined {
    return (
      (this.db.query("SELECT * FROM projects WHERE name = ?").get(name) as ProjectRow | null) ??
      undefined
    );
  }

  listProjects(status?: string): ProjectRow[] {
    if (status) {
      return this.db
        .query("SELECT * FROM projects WHERE status = ? ORDER BY created_at DESC")
        .all(status) as ProjectRow[];
    }
    return this.db.query("SELECT * FROM projects ORDER BY created_at DESC").all() as ProjectRow[];
  }

  updateProjectStatus(id: string, status: string): void {
    this.db.run("UPDATE projects SET status = ? WHERE id = ?", [status, id]);
  }

  updateProjectOrchestration(id: string, orchestration: string): void {
    this.db.run("UPDATE projects SET orchestration = ? WHERE id = ?", [orchestration, id]);
  }

  updateProjectMemoryArch(id: string, memoryArch: string): void {
    this.db.run("UPDATE projects SET memory_arch = ? WHERE id = ?", [memoryArch, id]);
  }

  // ─── Dynamic Command Persistence ─────────────────────────────────────

  saveCommandSource(opts: {
    id: string;
    name: string;
    source: string;
    createdBy: string;
  }): void {
    const existing = this.getCommandByName(opts.name);
    if (existing) {
      // Save history before updating
      this.db.run(
        "INSERT INTO dynamic_command_history (command_id, source, version, edited_by, edited_at) VALUES (?, ?, ?, ?, ?)",
        [existing.id, existing.source, existing.version, opts.createdBy, Date.now()],
      );
      this.db.run(
        "UPDATE dynamic_commands SET source = ?, version = version + 1, valid = 0 WHERE id = ?",
        [opts.source, existing.id],
      );
    } else {
      this.db.run(
        "INSERT INTO dynamic_commands (id, name, source, version, valid, created_by, created_at) VALUES (?, ?, ?, 1, 0, ?, ?)",
        [opts.id, opts.name, opts.source, opts.createdBy, Date.now()],
      );
    }
  }

  getCommand(id: string): CommandSourceRow | undefined {
    return (
      (this.db
        .query("SELECT * FROM dynamic_commands WHERE id = ?")
        .get(id) as CommandSourceRow | null) ?? undefined
    );
  }

  getCommandByName(name: string): CommandSourceRow | undefined {
    return (
      (this.db
        .query("SELECT * FROM dynamic_commands WHERE name = ?")
        .get(name) as CommandSourceRow | null) ?? undefined
    );
  }

  listCommands(): CommandSourceRow[] {
    return this.db
      .query("SELECT * FROM dynamic_commands ORDER BY name")
      .all() as CommandSourceRow[];
  }

  markCommandValid(name: string): void {
    this.db.run("UPDATE dynamic_commands SET valid = 1 WHERE name = ?", [name]);
  }

  deleteCommand(name: string): void {
    const cmd = this.getCommandByName(name);
    if (cmd) {
      this.db.run("DELETE FROM dynamic_command_history WHERE command_id = ?", [cmd.id]);
      this.db.run("DELETE FROM dynamic_commands WHERE id = ?", [cmd.id]);
    }
  }

  getCommandHistory(name: string, limit = 20): CommandHistoryRow[] {
    const cmd = this.getCommandByName(name);
    if (!cmd) return [];
    return this.db
      .query(
        "SELECT * FROM dynamic_command_history WHERE command_id = ? ORDER BY version DESC LIMIT ?",
      )
      .all(cmd.id, limit) as CommandHistoryRow[];
  }

  getAllValidCommandNames(): string[] {
    return (
      this.db.query("SELECT name FROM dynamic_commands WHERE valid = 1").all() as { name: string }[]
    ).map((r) => r.name);
  }

  // ─── Connector Persistence ──────────────────────────────────────────────

  createConnector(conn: {
    id: string;
    name: string;
    transport: string;
    url?: string;
    command?: string;
    args?: string;
    createdBy: string;
  }): void {
    this.db.run(
      "INSERT INTO connectors (id, name, transport, url, command, args, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        conn.id,
        conn.name,
        conn.transport,
        conn.url ?? null,
        conn.command ?? null,
        conn.args ?? null,
        conn.createdBy,
        Date.now(),
      ],
    );
  }

  getConnector(id: string): ConnectorRow | undefined {
    return (
      (this.db.query("SELECT * FROM connectors WHERE id = ?").get(id) as ConnectorRow | null) ??
      undefined
    );
  }

  getConnectorByName(name: string): ConnectorRow | undefined {
    return (
      (this.db.query("SELECT * FROM connectors WHERE name = ?").get(name) as ConnectorRow | null) ??
      undefined
    );
  }

  listConnectors(status?: string): ConnectorRow[] {
    if (status) {
      return this.db
        .query("SELECT * FROM connectors WHERE status = ? ORDER BY name")
        .all(status) as ConnectorRow[];
    }
    return this.db.query("SELECT * FROM connectors ORDER BY name").all() as ConnectorRow[];
  }

  updateConnectorStatus(id: string, status: string): void {
    this.db.run("UPDATE connectors SET status = ? WHERE id = ?", [status, id]);
  }

  updateConnectorAuth(id: string, authType: string, authData: string): void {
    this.db.run("UPDATE connectors SET auth_type = ?, auth_data = ? WHERE id = ?", [
      authType,
      authData,
      id,
    ]);
  }

  deleteConnector(id: string): void {
    this.db.run("DELETE FROM connectors WHERE id = ?", [id]);
  }

  // ─── Experiment Persistence ────────────────────────────────────────────

  createExperiment(opts: {
    name: string;
    description?: string;
    config?: Record<string, unknown>;
    creatorName: string;
    requiredAgents?: number;
    timeLimit?: number;
  }): number {
    const result = this.db.run(
      `INSERT INTO experiments (name, description, config, creator_name, required_agents, time_limit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        opts.name,
        opts.description ?? "",
        JSON.stringify(opts.config ?? {}),
        opts.creatorName,
        opts.requiredAgents ?? 2,
        opts.timeLimit ?? null,
        Date.now(),
      ],
    );
    return Number(result.lastInsertRowid);
  }

  getExperiment(id: number): ExperimentRow | undefined {
    return (
      (this.db.query("SELECT * FROM experiments WHERE id = ?").get(id) as ExperimentRow | null) ??
      undefined
    );
  }

  getExperimentByName(name: string): ExperimentRow | undefined {
    return (
      (this.db
        .query("SELECT * FROM experiments WHERE name = ?")
        .get(name) as ExperimentRow | null) ?? undefined
    );
  }

  listExperiments(status?: string): ExperimentRow[] {
    if (status) {
      return this.db
        .query("SELECT * FROM experiments WHERE status = ? ORDER BY id DESC")
        .all(status) as ExperimentRow[];
    }
    return this.db.query("SELECT * FROM experiments ORDER BY id DESC").all() as ExperimentRow[];
  }

  updateExperimentStatus(id: number, status: string): void {
    this.db.run("UPDATE experiments SET status = ? WHERE id = ?", [status, id]);
  }

  startExperiment(id: number): void {
    this.db.run("UPDATE experiments SET status = 'active', started_at = ? WHERE id = ?", [
      Date.now(),
      id,
    ]);
  }

  completeExperiment(id: number): void {
    this.db.run("UPDATE experiments SET status = 'completed', completed_at = ? WHERE id = ?", [
      Date.now(),
      id,
    ]);
  }

  addParticipant(experimentId: number, entityName: string): void {
    this.db.run(
      "INSERT OR IGNORE INTO experiment_participants (experiment_id, entity_name, joined_at) VALUES (?, ?, ?)",
      [experimentId, entityName, Date.now()],
    );
  }

  getParticipants(experimentId: number): ExperimentParticipantRow[] {
    return this.db
      .query("SELECT * FROM experiment_participants WHERE experiment_id = ?")
      .all(experimentId) as ExperimentParticipantRow[];
  }

  isParticipant(experimentId: number, entityName: string): boolean {
    const row = this.db
      .query("SELECT 1 FROM experiment_participants WHERE experiment_id = ? AND entity_name = ?")
      .get(experimentId, entityName);
    return row !== null;
  }

  recordResult(
    experimentId: number,
    entityName: string,
    metricName: string,
    metricValue: number,
  ): void {
    this.db.run(
      `INSERT INTO experiment_results (experiment_id, entity_name, metric_name, metric_value, recorded_at)
       VALUES (?, ?, ?, ?, ?)`,
      [experimentId, entityName, metricName, metricValue, Date.now()],
    );
  }

  getResults(experimentId: number): ExperimentResultRow[] {
    return this.db
      .query("SELECT * FROM experiment_results WHERE experiment_id = ? ORDER BY id")
      .all(experimentId) as ExperimentResultRow[];
  }

  // ─── Event Queries (for observe) ──────────────────────────────────────

  getEventsByEntity(
    entityId: string,
    limit = 20,
  ): { type: string; input?: string; timestamp: number }[] {
    return this.db
      .query(
        "SELECT type, data, timestamp FROM event_log WHERE json_extract(data, '$.entity') = ? ORDER BY id DESC LIMIT ?",
      )
      .all(entityId, limit)
      .map((row: unknown) => {
        const r = row as { type: string; data: string; timestamp: number };
        const data = JSON.parse(r.data) as Record<string, unknown>;
        return {
          type: r.type,
          input: data.input as string | undefined,
          timestamp: r.timestamp,
        };
      });
  }

  getEntityCommandCount(entityId: string): number {
    const row = this.db
      .query(
        "SELECT COUNT(*) as count FROM event_log WHERE type = 'command' AND json_extract(data, '$.entity') = ?",
      )
      .get(entityId) as { count: number };
    return row.count;
  }

  getLastActivity(
    entityId: string,
  ): { type: string; timestamp: number; input?: string } | undefined {
    const row = this.db
      .query(
        "SELECT type, data, timestamp FROM event_log WHERE json_extract(data, '$.entity') = ? ORDER BY id DESC LIMIT 1",
      )
      .get(entityId) as { type: string; data: string; timestamp: number } | null;
    if (!row) return undefined;
    const data = JSON.parse(row.data) as Record<string, unknown>;
    return {
      type: row.type,
      timestamp: row.timestamp,
      input: data.input as string | undefined,
    };
  }

  getActiveEntities(
    sinceMs: number,
  ): { entityId: string; commandCount: number; lastActivity: number }[] {
    const cutoff = Date.now() - sinceMs;
    return this.db
      .query(
        `SELECT json_extract(data, '$.entity') as entity_id,
                COUNT(*) as command_count,
                MAX(timestamp) as last_activity
         FROM event_log
         WHERE type = 'command' AND timestamp > ? AND json_extract(data, '$.entity') IS NOT NULL
         GROUP BY json_extract(data, '$.entity')`,
      )
      .all(cutoff)
      .map((row: unknown) => {
        const r = row as { entity_id: string; command_count: number; last_activity: number };
        return {
          entityId: r.entity_id,
          commandCount: r.command_count,
          lastActivity: r.last_activity,
        };
      });
  }

  // ─── Global Search ────────────────────────────────────────────────────

  globalSearch(query: string): GlobalSearchResult[] {
    const results: GlobalSearchResult[] = [];
    const safeQuery = query.replace(/['"*()]/g, "").trim();
    if (!safeQuery) return results;

    // Search board posts via FTS5
    const ftsQuery = safeQuery
      .split(/\s+/)
      .map((term) => `"${term}"`)
      .join(" ");
    try {
      const boardResults = this.db
        .query(
          `SELECT bp.id, bp.board_id, bp.title, bp.body, bp.author_name
           FROM board_posts bp
           JOIN board_posts_fts fts ON bp.id = fts.rowid
           WHERE board_posts_fts MATCH ?
           ORDER BY fts.rank LIMIT 10`,
        )
        .all(ftsQuery) as {
        id: number;
        board_id: string;
        title: string;
        body: string;
        author_name: string;
      }[];
      for (const r of boardResults) {
        results.push({
          type: "board_post",
          id: String(r.id),
          title: r.title || r.body.slice(0, 60),
          context: r.board_id,
        });
      }
    } catch {
      // FTS may fail on certain queries
    }

    // Search channel messages via LIKE
    const likePattern = `%${safeQuery}%`;
    try {
      const msgResults = this.db
        .query(
          `SELECT id, channel_id, sender_name, content
           FROM channel_messages
           WHERE content LIKE ?
           ORDER BY id DESC LIMIT 10`,
        )
        .all(likePattern) as {
        id: number;
        channel_id: string;
        sender_name: string;
        content: string;
      }[];
      for (const r of msgResults) {
        results.push({
          type: "channel_message",
          id: String(r.id),
          title: `${r.sender_name}: ${r.content.slice(0, 60)}`,
          context: r.channel_id,
        });
      }
    } catch {
      // LIKE may fail
    }

    return results;
  }

  // ─── Assets ─────────────────────────────────────────────────────────────

  createAsset(asset: {
    id: string;
    entityName: string;
    filename: string;
    mimeType: string;
    size: number;
    storageKey: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.db.run(
      `INSERT INTO assets (id, entity_name, filename, mime_type, size, storage_key, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        asset.id,
        asset.entityName,
        asset.filename,
        asset.mimeType,
        asset.size,
        asset.storageKey,
        JSON.stringify(asset.metadata ?? {}),
        Date.now(),
      ],
    );
  }

  getAsset(id: string): AssetRow | undefined {
    return (
      (this.db.query("SELECT * FROM assets WHERE id = ?").get(id) as AssetRow | null) ?? undefined
    );
  }

  getAssetsByEntity(entityName: string, limit = 50): AssetRow[] {
    return this.db
      .query("SELECT * FROM assets WHERE entity_name = ? ORDER BY created_at DESC LIMIT ?")
      .all(entityName, limit) as AssetRow[];
  }

  listAssets(opts?: { limit?: number; mime?: string }): AssetRow[] {
    if (opts?.mime) {
      return this.db
        .query("SELECT * FROM assets WHERE mime_type LIKE ? ORDER BY created_at DESC LIMIT ?")
        .all(`${opts.mime}%`, opts?.limit ?? 50) as AssetRow[];
    }
    return this.db
      .query("SELECT * FROM assets ORDER BY created_at DESC LIMIT ?")
      .all(opts?.limit ?? 50) as AssetRow[];
  }

  deleteAsset(id: string): boolean {
    const result = this.db.run("DELETE FROM assets WHERE id = ?", [id]);
    return result.changes > 0;
  }

  // ─── Canvases ──────────────────────────────────────────────────────────

  createCanvas(canvas: {
    id: string;
    name: string;
    description?: string;
    scope?: string;
    scopeId?: string;
    creatorName: string;
  }): void {
    const now = Date.now();
    this.db.run(
      `INSERT INTO canvases (id, name, description, scope, scope_id, creator_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        canvas.id,
        canvas.name,
        canvas.description ?? "",
        canvas.scope ?? "global",
        canvas.scopeId ?? null,
        canvas.creatorName,
        now,
        now,
      ],
    );
  }

  getCanvas(id: string): CanvasRow | undefined {
    return (
      (this.db.query("SELECT * FROM canvases WHERE id = ?").get(id) as CanvasRow | null) ??
      undefined
    );
  }

  getCanvasByName(name: string): CanvasRow | undefined {
    return (
      (this.db.query("SELECT * FROM canvases WHERE name = ?").get(name) as CanvasRow | null) ??
      undefined
    );
  }

  listCanvases(opts?: { scope?: string; limit?: number }): CanvasRow[] {
    if (opts?.scope) {
      return this.db
        .query("SELECT * FROM canvases WHERE scope = ? ORDER BY updated_at DESC LIMIT ?")
        .all(opts.scope, opts?.limit ?? 50) as CanvasRow[];
    }
    return this.db
      .query("SELECT * FROM canvases ORDER BY updated_at DESC LIMIT ?")
      .all(opts?.limit ?? 50) as CanvasRow[];
  }

  deleteCanvas(id: string): boolean {
    const result = this.db.run("DELETE FROM canvases WHERE id = ?", [id]);
    return result.changes > 0;
  }

  // ─── Canvas Nodes ─────────────────────────────────────────────────────

  createNode(node: {
    id: string;
    canvasId: string;
    type: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    assetId?: string;
    data?: Record<string, unknown>;
    creatorName: string;
  }): void {
    const now = Date.now();
    this.db.run(
      `INSERT INTO canvas_nodes (id, canvas_id, type, x, y, width, height, asset_id, data, creator_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        node.id,
        node.canvasId,
        node.type,
        node.x ?? 0,
        node.y ?? 0,
        node.width ?? 300,
        node.height ?? 200,
        node.assetId ?? null,
        JSON.stringify(node.data ?? {}),
        node.creatorName,
        now,
        now,
      ],
    );
    // Touch canvas updated_at
    this.db.run("UPDATE canvases SET updated_at = ? WHERE id = ?", [now, node.canvasId]);
  }

  getNode(id: string): CanvasNodeRow | undefined {
    return (
      (this.db.query("SELECT * FROM canvas_nodes WHERE id = ?").get(id) as CanvasNodeRow | null) ??
      undefined
    );
  }

  getNodesByCanvas(canvasId: string): CanvasNodeRow[] {
    return this.db
      .query("SELECT * FROM canvas_nodes WHERE canvas_id = ? ORDER BY created_at ASC")
      .all(canvasId) as CanvasNodeRow[];
  }

  updateNode(
    id: string,
    updates: { x?: number; y?: number; width?: number; height?: number; data?: string },
  ): boolean {
    const node = this.getNode(id);
    if (!node) return false;
    const now = Date.now();
    this.db.run(
      `UPDATE canvas_nodes SET x = ?, y = ?, width = ?, height = ?, data = ?, updated_at = ?
       WHERE id = ?`,
      [
        updates.x ?? node.x,
        updates.y ?? node.y,
        updates.width ?? node.width,
        updates.height ?? node.height,
        updates.data ?? node.data,
        now,
        id,
      ],
    );
    this.db.run("UPDATE canvases SET updated_at = ? WHERE id = ?", [now, node.canvas_id]);
    return true;
  }

  deleteNode(id: string): boolean {
    const result = this.db.run("DELETE FROM canvas_nodes WHERE id = ?", [id]);
    return result.changes > 0;
  }

  // ─── Meta Key-Value ────────────────────────────────────────────────────

  getMetaValue(key: string): string | undefined {
    const row = this.db.query("SELECT value FROM meta WHERE key = ?").get(key) as {
      value: string;
    } | null;
    return row?.value ?? undefined;
  }

  setMetaValue(key: string, value: string): void {
    this.db.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [key, value]);
  }

  clearDynamicRooms(): void {
    this.db.run("DELETE FROM room_sources");
  }

  clearDynamicCommands(): void {
    this.db.run("DELETE FROM dynamic_command_history");
    this.db.run("DELETE FROM dynamic_commands");
  }

  // ─── Shell ─────────────────────────────────────────────────────────────

  getShellAllowlist(): string[] {
    const rows = this.db.query("SELECT binary FROM shell_allowlist ORDER BY binary").all() as {
      binary: string;
    }[];
    return rows.map((r) => r.binary);
  }

  isShellAllowed(binary: string): boolean {
    const row = this.db.query("SELECT 1 FROM shell_allowlist WHERE binary = ?").get(binary);
    return row !== null;
  }

  addToShellAllowlist(binary: string, addedBy: string): void {
    this.db.run(
      "INSERT OR IGNORE INTO shell_allowlist (binary, added_by, added_at) VALUES (?, ?, ?)",
      [binary, addedBy, Date.now()],
    );
  }

  removeFromShellAllowlist(binary: string): boolean {
    const result = this.db.run("DELETE FROM shell_allowlist WHERE binary = ?", [binary]);
    return result.changes > 0;
  }

  logShellExec(
    entityId: string,
    binary: string,
    args: string,
    exitCode: number | null,
    outputLength: number,
  ): void {
    this.db.run(
      "INSERT INTO shell_log (entity_id, binary, args, exit_code, output_length, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [entityId, binary, args, exitCode, outputLength, Date.now()],
    );
  }

  getShellHistory(entityId: string, limit = 10): ShellLogRow[] {
    return this.db
      .query("SELECT * FROM shell_log WHERE entity_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(entityId, limit) as ShellLogRow[];
  }

  getShellLog(entityId: string | null, limit = 10): ShellLogRow[] {
    if (entityId) {
      return this.db
        .query("SELECT * FROM shell_log WHERE entity_id = ? ORDER BY created_at DESC LIMIT ?")
        .all(entityId, limit) as ShellLogRow[];
    }
    return this.db
      .query("SELECT * FROM shell_log ORDER BY created_at DESC LIMIT ?")
      .all(limit) as ShellLogRow[];
  }

  // ─── Entity Migration ───────────────────────────────────────────────────

  /**
   * Migrate all EntityId-keyed state from an old entity to a new one.
   * Called on reconnection when the agent gets a fresh EntityId but
   * should retain channel memberships, group memberships, task claims, etc.
   */
  migrateEntityId(oldId: string, newId: string): void {
    this.db.transaction(() => {
      this.db.run("UPDATE OR REPLACE channel_members SET entity_id = ? WHERE entity_id = ?", [
        newId,
        oldId,
      ]);
      this.db.run("UPDATE OR REPLACE group_members SET entity_id = ? WHERE entity_id = ?", [
        newId,
        oldId,
      ]);
      this.db.run("UPDATE groups_ SET leader_id = ? WHERE leader_id = ?", [newId, oldId]);
      this.db.run("UPDATE task_claims SET entity_id = ? WHERE entity_id = ?", [newId, oldId]);
      this.db.run("UPDATE OR REPLACE board_votes SET entity_id = ? WHERE entity_id = ?", [
        newId,
        oldId,
      ]);
      this.db.run("UPDATE OR REPLACE entity_standing SET entity_id = ? WHERE entity_id = ?", [
        newId,
        oldId,
      ]);
      this.db.run("UPDATE board_posts SET author_id = ? WHERE author_id = ?", [newId, oldId]);
      this.db.run("UPDATE macros SET author_id = ? WHERE author_id = ?", [newId, oldId]);
    })();
  }

  /**
   * Migrate task claims by entity name (fallback when old EntityId is unknown,
   * e.g. after a server restart where in-memory entities were lost).
   */
  migrateTaskClaimsByName(entityName: string, newId: string): void {
    this.db.run(
      "UPDATE task_claims SET entity_id = ? WHERE entity_name = ? AND status IN ('claimed', 'submitted')",
      [newId, entityName],
    );
  }

  /** Get active task claims for an entity by name. */
  getActiveClaimsByName(
    entityName: string,
  ): { task_id: number; title: string; status: string; claimed_at: number }[] {
    return this.db
      .query(
        `SELECT tc.task_id, t.title, tc.status, tc.claimed_at
         FROM task_claims tc JOIN tasks t ON tc.task_id = t.id
         WHERE tc.entity_name = ? AND tc.status IN ('claimed', 'submitted')
         ORDER BY tc.claimed_at DESC`,
      )
      .all(entityName) as {
      task_id: number;
      title: string;
      status: string;
      claimed_at: number;
    }[];
  }

  /** Get recent activity entries for an entity. */
  getRecentActivity(
    entityName: string,
    limit = 5,
  ): { activity_type: string; activity_key: string; count: number; last_seen: number }[] {
    return this.db
      .query(
        `SELECT activity_type, activity_key, count, last_seen
         FROM entity_activity
         WHERE entity_name = ?
         ORDER BY last_seen DESC
         LIMIT ?`,
      )
      .all(entityName, limit) as {
      activity_type: string;
      activity_key: string;
      count: number;
      last_seen: number;
    }[];
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}

// ─── Row Types ───────────────────────────────────────────────────────────────

interface SessionRow {
  token: string;
  entity_id: string;
  name: string;
  created_at: number;
  last_seen: number;
  expires_at: number;
}

function rowToSession(row: SessionRow): Session {
  return {
    token: row.token,
    entityId: row.entity_id as EntityId,
    name: row.name,
    createdAt: row.created_at,
    lastSeen: row.last_seen,
    expiresAt: row.expires_at,
  };
}

interface EntityRow {
  id: string;
  kind: string;
  name: string;
  short: string;
  long: string;
  room: string;
  properties: string;
  inventory: string;
  created_at: number;
}

function rowToEntity(row: EntityRow): Entity {
  return {
    id: row.id as EntityId,
    kind: row.kind as Entity["kind"],
    name: row.name,
    short: row.short,
    long: row.long,
    room: row.room as RoomId,
    properties: JSON.parse(row.properties) as Record<string, unknown>,
    inventory: JSON.parse(row.inventory) as EntityId[],
    createdAt: row.created_at,
  };
}

export interface ChannelRow {
  id: string;
  type: string;
  name: string;
  owner_id: string | null;
  persistence: string;
  retention_hours: number | null;
  created_at: number;
}

interface ChannelMessageRow {
  id: number;
  channel_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: number;
}

interface ChannelMemberRow {
  channel_id: string;
  entity_id: string;
  can_read: number;
  can_write: number;
  joined_at: number;
}

export interface BoardRow {
  id: string;
  name: string;
  scope_type: string;
  scope_id: string | null;
  read_rank: number;
  write_rank: number;
  pin_rank: number;
  created_at: number;
}

export interface BoardPostRow {
  id: number;
  board_id: string;
  parent_id: number | null;
  author_id: string;
  author_name: string;
  title: string;
  body: string;
  tags: string;
  pinned: number;
  archived: number;
  created_at: number;
  updated_at: number;
}

export interface GroupRow {
  id: string;
  name: string;
  description: string;
  leader_id: string;
  channel_id: string | null;
  board_id: string | null;
  created_at: number;
}

interface GroupMemberRow {
  group_id: string;
  entity_id: string;
  rank: number;
  joined_at: number;
}

export interface TaskRow {
  id: number;
  board_id: string | null;
  group_id: string | null;
  title: string;
  description: string;
  prerequisites: string;
  deliverables: string;
  status: string;
  validation_mode: string;
  creator_id: string;
  creator_name: string;
  standing: number;
  parent_task_id: number | null;
  created_at: number;
  updated_at: number;
}

export interface TaskClaimRow {
  task_id: number;
  entity_id: string;
  entity_name: string;
  status: string;
  submission_text: string | null;
  claimed_at: number;
  submitted_at: number | null;
  resolved_at: number | null;
}

export interface MacroRow {
  id: number;
  name: string;
  author_id: string;
  command: string;
  created_at: number;
  updated_at: number;
}

interface RoomSourceRow {
  room_id: string;
  version: number;
  source: string;
  author_id: string;
  author_name: string;
  valid: number;
  created_at: number;
}

interface RoomTemplateRow {
  name: string;
  source: string;
  author_id: string;
  author_name: string;
  description: string;
  created_at: number;
}

interface UserRow {
  id: string;
  name: string;
  created_at: number;
  last_login: number;
  rank: number;
  properties: string;
}

interface BanRow {
  name: string;
  reason: string;
  banned_by: string;
  created_at: number;
}

interface AdapterLinkRow {
  adapter: string;
  external_id: string;
  user_id: string;
  created_at: number;
}

export interface NoteRow {
  id: number;
  entity_name: string;
  room_id: string | null;
  content: string;
  importance: number;
  last_accessed: number | null;
  note_type: string;
  pool_id: string | null;
  supersedes_id: number | null;
  created_at: number;
}

interface ScoredNoteRow extends NoteRow {
  score: number;
}

interface CoreMemoryRow {
  entity_name: string;
  key: string;
  value: string;
  version: number;
  created_at: number;
  updated_at: number;
}

interface CoreMemoryHistoryRow {
  id: number;
  entity_name: string;
  key: string;
  old_value: string;
  new_value: string;
  changed_at: number;
}

interface NoteLinkRow {
  id: number;
  source_id: number;
  target_id: number;
  relationship: string;
  created_at: number;
}

interface MemoryPoolRow {
  id: string;
  name: string;
  group_id: string | null;
  created_by: string;
  created_at: number;
}

interface ExperimentRow {
  id: number;
  name: string;
  description: string;
  config: string;
  status: string;
  creator_name: string;
  required_agents: number;
  time_limit: number | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
}

interface ExperimentParticipantRow {
  experiment_id: number;
  entity_name: string;
  joined_at: number;
}

interface ExperimentResultRow {
  id: number;
  experiment_id: number;
  entity_name: string;
  metric_name: string;
  metric_value: number;
  recorded_at: number;
}

interface BoardVoteRow {
  post_id?: number;
  entity_id: string;
  value?: number;
  score: number;
}

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  bundle_id: number | null;
  pool_id: string | null;
  group_id: string | null;
  orchestration: string;
  memory_arch: string;
  status: string;
  created_by: string;
  created_at: number;
}

interface CommandSourceRow {
  id: string;
  name: string;
  source: string;
  version: number;
  valid: number;
  created_by: string;
  created_at: number;
}

interface CommandHistoryRow {
  id: number;
  command_id: string;
  source: string;
  version: number;
  edited_by: string;
  edited_at: number;
}

interface ConnectorRow {
  id: string;
  name: string;
  transport: string;
  url: string | null;
  command: string | null;
  args: string | null;
  auth_type: string | null;
  auth_data: string | null;
  lifecycle: string;
  created_by: string;
  created_at: number;
  status: string;
}

interface AssetRow {
  id: string;
  entity_name: string;
  filename: string;
  mime_type: string;
  size: number;
  storage_key: string;
  metadata: string;
  created_at: number;
}

interface CanvasRow {
  id: string;
  name: string;
  description: string;
  scope: string;
  scope_id: string | null;
  creator_name: string;
  created_at: number;
  updated_at: number;
}

interface CanvasNodeRow {
  id: string;
  canvas_id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  asset_id: string | null;
  data: string;
  creator_name: string;
  created_at: number;
  updated_at: number;
}

interface ShellLogRow {
  id: number;
  entity_id: string;
  binary: string;
  args: string;
  exit_code: number | null;
  output_length: number;
  created_at: number;
}

interface GlobalSearchResult {
  type: "board_post" | "channel_message" | "room";
  id: string;
  title: string;
  context: string;
}
