import { join } from "node:path";
import type { RateLimiter } from "../auth/rate-limiter";
import { SessionManager } from "../auth/session-manager";
import { connects, disconnects } from "../net/ansi";
import { cleanupStaleConversationChannels } from "../net/model-api";
import type { ArtilectDB } from "../persistence/database";
import type {
  CommandContext,
  CommandDef,
  CommandInput,
  Connection,
  EngineEvent,
  Entity,
  EntityId,
  EntityRank,
  Perception,
  RoomBoardAPI,
  RoomChannelAPI,
  RoomContext,
  RoomId,
  RoomModule,
} from "../types";
import { EntityManager } from "../world/entity-manager";
import { type LoadedRoom, RoomManager } from "../world/room-manager";
import { CommandRouter } from "./command-router";
import { ConnectorRuntime } from "./connector-runtime";
import { getRank, rankName, setRank } from "./permissions";
import { RoomSandbox } from "./room-sandbox";

import { BoardManager } from "../coordination/board-manager";
import { ChannelManager } from "../coordination/channel-manager";
import { GroupManager } from "../coordination/group-manager";
import { MacroManager } from "../coordination/macro-manager";
import { TaskManager } from "../coordination/task-manager";
import type { StorageProvider } from "../storage/provider";
import type { WorldDefinition } from "../world/world-definition";
import { adminCommand } from "./commands/admin";
import { boardCommand } from "./commands/board";
import { bookmarkCommand } from "./commands/bookmark";
import { briefCommand } from "./commands/brief";
import { buildCommand } from "./commands/build";
import { canvasCommand } from "./commands/canvas";
import { channelCommand } from "./commands/channel";
import { connectCommand } from "./commands/connect";
import { emoteCommand } from "./commands/emote";
import { examineCommand } from "./commands/examine";
import { experimentCommand } from "./commands/experiment";
import { exportCommand } from "./commands/export-cmd";
import { gotoCommand } from "./commands/goto";
import { groupCommand } from "./commands/group";
import { helpCommand } from "./commands/help";
import { ignoreCommand, isIgnoring } from "./commands/ignore";
import { inventoryCommand } from "./commands/inventory";
import { dropCommand, getCommand, giveCommand } from "./commands/items";
import { linkCommand } from "./commands/link";
import { lookCommand } from "./commands/look";
import { lsCommand } from "./commands/ls";
import { macroCommand } from "./commands/macro";
import { mapCommand } from "./commands/map";
import { memoryCommand } from "./commands/memory";
import { moveCommand } from "./commands/move";
import { noteCommand } from "./commands/note";
import { noveltyCommand } from "./commands/novelty";
import { observeCommand } from "./commands/observe";
import { orientCommand } from "./commands/orient";
import { poolCommand } from "./commands/pool";
import { projectCommand } from "./commands/project";
import { questCommand, trackQuestProgress } from "./commands/quest";
import { quitCommand } from "./commands/quit";
import { rankCommand } from "./commands/rank";
import { recallCommand } from "./commands/recall";
import { reflectCommand } from "./commands/reflect";
import { runCommand } from "./commands/run";
import { sayCommand } from "./commands/say";
import { scoreCommand } from "./commands/score";
import { searchCommand } from "./commands/search";
import { shellCommand } from "./commands/shell";
import { shoutCommand } from "./commands/shout";
import { skillCommand } from "./commands/skill";
import { sourceCommand } from "./commands/source";
import { talkCommand } from "./commands/talk";
import { taskCommand } from "./commands/task";
import { tellCommand } from "./commands/tell";
import { timeCommand, uptimeCommand } from "./commands/utility";
import { whoCommand } from "./commands/who";
import { compileCommandModule, compileRoomModule } from "./sandbox";
import { ShellRuntime } from "./shell-runtime";

export interface NpcBehavior {
  type: "patrol" | "greet" | "stationary";
  route?: string[]; // room IDs for patrol
  interval?: number; // ticks between patrol moves
  greeting?: string; // custom greeting for greet behavior
}

export interface EngineConfig {
  tickInterval: number; // ms between ticks (default 1000)
  startRoom: RoomId; // where new entities spawn
  db?: ArtilectDB; // optional persistence layer
  dbPath?: string; // path to the DB file (for export)
  rateLimiter?: RateLimiter; // optional rate limiter
  storage?: StorageProvider; // optional asset storage
  world?: WorldDefinition; // optional world definition
}

const DEFAULT_TICK_INTERVAL = 1000;

export class Engine {
  readonly entities: EntityManager;
  readonly rooms: RoomManager;
  readonly commands: CommandRouter;
  readonly config: EngineConfig;

  // Auth & rate limiting
  readonly sessionManager?: SessionManager;
  readonly rateLimiter?: RateLimiter;

  // Coordination managers (available when db is provided)
  readonly channelManager?: ChannelManager;
  readonly boardManager?: BoardManager;
  readonly groupManager?: GroupManager;
  readonly taskManager?: TaskManager;
  readonly macroManager?: MacroManager;

  readonly world?: WorldDefinition;
  readonly sandbox: RoomSandbox;
  readonly connectorRuntime?: ConnectorRuntime;
  readonly shellRuntime: ShellRuntime;
  readonly storage?: StorageProvider;
  private db?: ArtilectDB;
  private startedAt = Date.now();
  private fetchLastCall = new Map<string, number>(); // roomId -> timestamp
  private connections = new Map<string, Connection>();
  private entityToConnection = new Map<EntityId, string>();
  private commandQueue: { entity: EntityId; raw: string }[] = [];
  private eventLog: EngineEvent[] = [];
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private tickCount = 0;
  private eventListeners: Array<(event: EngineEvent) => void> = [];

  constructor(config?: Partial<EngineConfig>) {
    // Derive startRoom: explicit config > world definition > generic fallback
    const startRoom = config?.startRoom ?? config?.world?.startRoom ?? ("world/0-0" as RoomId);
    this.config = {
      tickInterval: DEFAULT_TICK_INTERVAL,
      ...config,
      startRoom,
    };
    this.world = this.config.world;
    this.entities = new EntityManager();
    this.rooms = new RoomManager();
    this.commands = new CommandRouter();
    this.sandbox = new RoomSandbox();
    this.db = this.config.db;
    this.rateLimiter = this.config.rateLimiter;
    this.storage = this.config.storage;

    // Initialize session manager if db is available
    if (this.db) {
      this.sessionManager = new SessionManager(this.db);
    }

    // Initialize connector runtime if db is available
    if (this.db) {
      this.connectorRuntime = new ConnectorRuntime(this.db);
    }

    // Initialize shell runtime
    this.shellRuntime = new ShellRuntime(this.db);
    this.shellRuntime.init();

    // Initialize coordination managers if db is available
    if (this.db) {
      this.channelManager = new ChannelManager(this.db, (target, msg) =>
        this.sendToEntity(target, msg),
      );
      // Ensure the default "model" channel exists so /v1/models always lists this instance
      if (!this.channelManager.getChannelByName("model")) {
        this.channelManager.createChannel({ type: "model", name: "model" });
      }
      this.boardManager = new BoardManager(this.db);
      this.groupManager = new GroupManager(this.db, this.channelManager, this.boardManager);
      this.taskManager = new TaskManager(this.db);
      this.macroManager = new MacroManager(this.db, (entityId, raw) =>
        this.processCommand(entityId, raw),
      );
    }

    this.registerBuiltinCommands();
  }

  // ─── Room Registration ──────────────────────────────────────────────────

  registerRoom(id: RoomId, module: RoomModule): void {
    const wrapped = this.sandbox.wrapModule(id, module, (_roomId, error) => {
      console.error(`[sandbox] ${error}`);
    });
    this.rooms.register(id, wrapped);
  }

  /** Register all rooms from a WorldDefinition.
   *  Shallow-copies each module so build mutations don't bleed between instances. */
  registerWorldRooms(world: WorldDefinition): void {
    for (const [id, module] of Object.entries(world.rooms)) {
      this.registerRoom(id as RoomId, {
        ...module,
        exits: module.exits ? { ...module.exits } : undefined,
        items: module.items ? { ...module.items } : undefined,
      });
    }
  }

  // ─── Connection Management ──────────────────────────────────────────────

  addConnection(conn: Connection): void {
    this.connections.set(conn.id, conn);
    this.logEvent({
      type: "connect",
      connectionId: conn.id,
      protocol: conn.protocol,
      timestamp: Date.now(),
    });
  }

  removeConnection(connId: string): void {
    const conn = this.connections.get(connId);
    if (!conn) return;

    if (conn.entity) {
      this.entityToConnection.delete(conn.entity);
      const entity = this.entities.get(conn.entity);
      if (entity) {
        // Broadcast departure
        const ctx = this.buildContext(entity.room);
        if (ctx) {
          ctx.broadcastExcept(conn.entity, disconnects(entity.name));
        }
        this.entities.remove(conn.entity);
      }
    }

    this.connections.delete(connId);
    this.logEvent({ type: "disconnect", connectionId: connId, timestamp: Date.now() });
  }

  /** Bind a connection to a new entity (login) */
  spawnEntity(connId: string, name: string): Entity | undefined {
    const conn = this.connections.get(connId);
    if (!conn) return undefined;

    // Sanitize name: alphanumeric + underscores only, 2-20 chars
    const cleanName = name.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
    if (cleanName.length < 2) return undefined;

    const entity = this.entities.create({
      kind: "agent",
      name: cleanName,
      short: `${cleanName} is here.`,
      long: `You see ${cleanName}, a connected agent.`,
      room: this.config.startRoom,
    });

    conn.entity = entity.id;
    this.entityToConnection.set(entity.id, connId);

    // Broadcast arrival
    const ctx = this.buildContext(entity.room);
    if (ctx) {
      ctx.broadcastExcept(entity.id, connects(cleanName));
    }

    this.logEvent({
      type: "entity_enter",
      entity: entity.id,
      room: entity.room,
      timestamp: Date.now(),
    });

    return entity;
  }

  // ─── Session-based Auth ─────────────────────────────────────────────────

  /** Login: create entity + session, returns token. Checks ban list. */
  login(connId: string, name: string): { entityId: EntityId; token: string } | { error: string } {
    // Check ban list
    if (this.db?.isBanned(name)) {
      return { error: "You are banned from this server." };
    }

    // Sanitize name once, then pass through to spawnEntity
    const cleanName = name.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
    if (this.entities.findAgentByName(cleanName)) {
      return { error: "That name is already in use." };
    }

    const entity = this.spawnEntity(connId, cleanName);
    if (!entity) {
      return { error: "Login failed. Name must be 2-20 alphanumeric characters." };
    }

    // Look up or create user record
    if (this.db) {
      const existingUser = this.db.getUserByName(entity.name);
      if (existingUser) {
        this.db.updateUserLastLogin(existingUser.id);
        // Apply stored rank to entity
        const rank = existingUser.rank as EntityRank;
        entity.properties.rank = rank;
      } else {
        // Use a stable UUID for user IDs (entity IDs are transient and reset on restart)
        const userId = crypto.randomUUID();
        this.db.createUser({ id: userId, name: entity.name });
      }
    }

    this.applyAdminBootstrap(entity);

    // Auto-start quest for new entities (rank 0)
    const rank = (entity.properties.rank as number) ?? 0;
    if (rank === 0 && this.world?.autoQuest) {
      entity.properties.active_quest = this.world.autoQuest;
    }

    if (this.sessionManager) {
      const session = this.sessionManager.create(entity.id, entity.name);
      return { entityId: entity.id, token: session.token };
    }

    return { entityId: entity.id, token: "" };
  }

  /** Reconnect with a session token. Returns entity ID or error. */
  reconnect(
    connId: string,
    token: string,
  ): { entityId: EntityId; name: string; token: string } | { error: string } {
    if (!this.sessionManager) {
      return { error: "Session management not available." };
    }

    const session = this.sessionManager.validate(token);
    if (!session) {
      return { error: "Invalid or expired session token." };
    }

    // Check ban list
    if (this.db?.isBanned(session.name)) {
      this.sessionManager.revoke(token);
      return { error: "You are banned from this server." };
    }

    this.sessionManager.refresh(token);

    // Clean up stale entity with same name (dead connection) or reject if active
    const existing = this.entities.findAgentByName(session.name);
    if (existing) {
      const existingConnId = this.entityToConnection.get(existing.id);
      if (existingConnId && this.connections.has(existingConnId)) {
        return { error: "That name is already in use." };
      }
      // Stale entity — remove it before spawning new one
      if (existingConnId) this.entityToConnection.delete(existing.id);
      this.entities.remove(existing.id);
    }

    // Create a new entity for this session
    const entity = this.spawnEntity(connId, session.name);
    if (!entity) {
      return { error: "Reconnection failed." };
    }

    // Update the session to point to the new entity
    this.sessionManager.revoke(token);
    const newSession = this.sessionManager.create(entity.id, entity.name);

    // Apply stored rank
    if (this.db) {
      const user = this.db.getUserByName(entity.name);
      if (user) {
        entity.properties.rank = user.rank as EntityRank;
        this.db.updateUserLastLogin(user.id);
      }
    }

    this.applyAdminBootstrap(entity);

    return { entityId: entity.id, name: entity.name, token: newSession.token };
  }

  /** Validate a session token. Returns entity ID if valid. */
  authenticate(token: string): EntityId | null {
    if (!this.sessionManager) return null;
    const session = this.sessionManager.validate(token);
    return session?.entityId ?? null;
  }

  /** Check rate limit for a key. Returns true if allowed. */
  checkRateLimit(key: string): boolean {
    if (!this.rateLimiter) return true;
    return this.rateLimiter.consume(key);
  }

  /** Register a listener for engine events */
  addEventListener(listener: (event: EngineEvent) => void): void {
    this.eventListeners.push(listener);
  }

  /** Remove a previously registered event listener */
  removeEventListener(listener: (event: EngineEvent) => void): void {
    const idx = this.eventListeners.indexOf(listener);
    if (idx !== -1) this.eventListeners.splice(idx, 1);
  }

  /** Get server uptime in ms */
  getUptime(): number {
    return Date.now() - this.startedAt;
  }

  /** Get all active connections */
  getConnections(): Map<string, Connection> {
    return this.connections;
  }

  // ─── Command Processing ─────────────────────────────────────────────────

  /** Queue a command from a connected entity */
  queueCommand(entity: EntityId, raw: string): void {
    this.commandQueue.push({ entity, raw });
  }

  /** Process a single command immediately */
  processCommand(entityId: EntityId, raw: string): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    const input = this.commands.parse(raw, entityId, entity.room);

    if (!input.verb) return;

    const room = this.rooms.get(entity.room);
    const handler = this.commands.resolve(input.verb, room?.module.commands);

    if (!handler) {
      this.sendToEntity(entityId, `Unknown command: ${input.verb}. Type "help" for commands.`);
      return;
    }

    // Enforce minRank on built-in commands
    const def = this.commands.getDef(input.verb);
    if (def?.minRank && def.minRank > 0) {
      const rank = getRank(entity);
      if (rank < def.minRank) {
        this.sendToEntity(
          entityId,
          `You must be at least ${rankName(def.minRank)} (rank ${def.minRank}) to use "${def.name}".`,
        );
        return;
      }
    }

    const ctx = this.buildCommandContext(entity.room, entityId) ?? this.buildContext(entity.room);
    if (!ctx) return;

    try {
      const result = handler(ctx, input);
      // Catch unhandled rejections from async handlers
      if (result instanceof Promise) {
        (result as Promise<unknown>).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[command] Async error in "${input.verb}": ${msg}`);
          this.sendToEntity(entityId, `Command error: ${msg}`);
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[command] Error in "${input.verb}": ${msg}`);
      this.sendToEntity(entityId, `Command error: ${msg}`);
      return;
    }

    // Track quest progress based on command type
    this.trackQuest(entityId, input.verb);

    // Track activity for novelty scoring
    if (this.db) {
      const entity = this.entities.get(entityId);
      if (entity) {
        try {
          this.db.trackActivity(entity.name, "command", input.verb);
          this.db.trackActivity(entity.name, "room_visit", entity.room);
        } catch (err) {
          console.warn(
            "[tick] Activity tracking failed:",
            err instanceof Error ? err.message : err,
          );
        }
      }
    }

    this.logEvent({ type: "command", entity: entityId, input: raw, timestamp: Date.now() });
  }

  private trackQuest(entityId: EntityId, verb: string): void {
    const entity = this.entities.get(entityId);
    if (!entity || !entity.properties.active_quest) return;

    if (verb === "look" || verb === "l") {
      trackQuestProgress(entity, "look");
    } else if (verb === "say" || verb === "'") {
      trackQuestProgress(entity, "say");
    } else if (verb === "examine" || verb === "ex" || verb === "x") {
      trackQuestProgress(entity, "examine");
    } else if (
      [
        "move",
        "go",
        "north",
        "south",
        "east",
        "west",
        "up",
        "down",
        "n",
        "s",
        "e",
        "w",
        "u",
        "d",
        "northeast",
        "northwest",
        "southeast",
        "southwest",
        "ne",
        "nw",
        "se",
        "sw",
      ].includes(verb)
    ) {
      trackQuestProgress(entity, "move", entity.room);
    }
  }

  // ─── Tick Loop ──────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log(
      `Artilect engine started (tick: ${this.config.tickInterval}ms, rooms: ${this.rooms.size})`,
    );

    this.tickTimer = setInterval(() => this.tick(), this.config.tickInterval);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    console.log("Artilect engine stopped.");
  }

  private tick(): void {
    this.tickCount++;
    this.sandbox.tick();

    // 1. Process queued commands
    const queue = this.commandQueue.splice(0);
    for (const cmd of queue) {
      this.processCommand(cmd.entity, cmd.raw);
    }

    // 2. Run room ticks (randomized order to prevent positional bias)
    // Budget: skip remaining rooms if total tick time exceeds limit
    const TICK_BUDGET_MS = 200;
    const tickStart = performance.now();
    const rooms = this.rooms.all();
    shuffleArray(rooms);
    let roomsSkipped = 0;
    for (const room of rooms) {
      if (room.module.onTick) {
        if (performance.now() - tickStart > TICK_BUDGET_MS) {
          roomsSkipped++;
          continue;
        }
        const ctx = this.buildContext(room.id);
        if (ctx) {
          try {
            room.module.onTick(ctx);
          } catch (err) {
            console.error(`Room tick error in ${room.id}:`, err);
          }
        }
      }
    }
    if (roomsSkipped > 0) {
      console.warn(`Tick budget exceeded: skipped ${roomsSkipped} room tick(s).`);
    }

    // 3. Periodic maintenance (boards auto-archive, channel pruning, note importance adjustment)
    if (this.tickCount % 3600 === 0 && this.boardManager) {
      try {
        this.boardManager.autoArchive(30, 0);
      } catch (err) {
        console.warn("[tick] Board auto-archive failed:", err instanceof Error ? err.message : err);
      }
    }
    if (this.tickCount % 1800 === 0 && this.channelManager) {
      try {
        this.channelManager.pruneExpiredMessages();
      } catch (err) {
        console.warn("[tick] Channel prune failed:", err instanceof Error ? err.message : err);
      }
    }
    // Hourly: clean up stale model conversation channels
    if (this.tickCount % 3600 === 0 && this.channelManager) {
      try {
        cleanupStaleConversationChannels(this.channelManager);
      } catch (err) {
        console.warn(
          "[tick] Conversation cleanup failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    // Hourly: adjust note importance based on recall patterns
    if (this.tickCount % 3600 === 0 && this.db) {
      try {
        this.db.adjustNoteImportance();
      } catch (err) {
        console.warn(
          "[tick] Note importance adjustment failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Every 60s: clean up orphaned agents (entities without active connections)
    if (this.tickCount % 60 === 0) {
      this.cleanupOrphanedAgents();
    }

    // 4. Process NPC behaviors
    this.processNpcBehaviors();

    this.logEvent({ type: "tick", timestamp: Date.now() });
  }

  private processNpcBehaviors(): void {
    const allEntities = this.entities.all();
    shuffleArray(allEntities);
    for (const entity of allEntities) {
      if (entity.kind !== "npc") continue;
      const behavior = entity.properties.behavior as NpcBehavior | undefined;
      if (!behavior) continue;

      try {
        if (behavior.type === "patrol" && behavior.route && behavior.interval) {
          if (this.tickCount % behavior.interval === 0) {
            const route = behavior.route;
            const idx = (entity.properties._patrol_idx as number) ?? 0;
            const nextIdx = (idx + 1) % route.length;
            const nextRoom = route[nextIdx] as RoomId;
            if (this.rooms.has(nextRoom)) {
              const oldRoom = entity.room;
              const name = entity.name;
              this.broadcastToRoom(oldRoom, `${name} wanders away.`);
              this.entities.move(entity.id, nextRoom);
              this.broadcastToRoom(nextRoom, `${name} arrives.`);
              entity.properties._patrol_idx = nextIdx;
            }
          }
        }

        if (behavior.type === "greet") {
          // Greeting is handled in onEnter hooks — this is for NPC-initiated greetings
          // NPCs greet new entities they haven't seen before
          const greeted = (entity.properties._greeted as string[]) ?? [];
          const inRoom = this.entities.inRoom(entity.room);
          for (const other of inRoom) {
            if (other.kind !== "agent") continue;
            if (greeted.includes(other.id)) continue;
            if (isIgnoring(other, entity.name)) continue;
            const greeting = behavior.greeting ?? `${entity.name} nods in your direction.`;
            this.sendToEntity(other.id, greeting);
            greeted.push(other.id);
          }
          entity.properties._greeted = greeted;
        }
      } catch (err) {
        console.error(`NPC behavior error for ${entity.name}:`, err);
      }
    }
  }

  // ─── Messaging ──────────────────────────────────────────────────────────

  sendToEntity(target: EntityId, message: string): void {
    const connId = this.entityToConnection.get(target);
    if (!connId) return;
    const conn = this.connections.get(connId);
    if (!conn) return;

    const perception: Perception = {
      kind: "message",
      timestamp: Date.now(),
      data: { text: message },
    };
    conn.send(perception);
  }

  broadcastToRoom(room: RoomId, message: string): void {
    const entities = this.entities.inRoom(room);
    for (const entity of entities) {
      this.sendToEntity(entity.id, message);
    }
  }

  broadcastToRoomExcept(room: RoomId, exclude: EntityId, message: string): void {
    const sender = this.entities.get(exclude);
    const senderName = sender?.name;
    const entities = this.entities.inRoom(room);
    for (const entity of entities) {
      if (entity.id !== exclude) {
        if (senderName && isIgnoring(entity, senderName)) continue;
        this.sendToEntity(entity.id, message);
      }
    }
  }

  // ─── Context Building ───────────────────────────────────────────────────

  buildContext(roomId: RoomId): RoomContext | undefined {
    return this.rooms.buildContext(roomId, {
      send: (target, msg) => this.sendToEntity(target, msg),
      broadcast: (room, msg) => this.broadcastToRoom(room, msg),
      broadcastExcept: (room, exclude, msg) => this.broadcastToRoomExcept(room, exclude, msg),
      entitiesInRoom: (room) => this.entities.inRoom(room),
      findEntity: (name, room) => this.entities.findByName(name, room),
      spawnNpc: (room, opts) => this.spawnNpc(room, opts),
      despawnNpc: (id) => this.despawnNpc(id),
      boards: this.buildBoardAPI(),
      channels: this.buildChannelAPI(),
      roomFetch: (room, url) => this.roomFetch(room, url),
    });
  }

  /** Send a "look" to an entity (used by move and login) */
  sendLook(entityId: EntityId): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;
    this.processCommand(entityId, "look");
  }

  /** Send a brief orientation to an entity (used on first login) */
  sendBrief(entityId: EntityId): void {
    const entity = this.entities.get(entityId);
    if (!entity) return;
    this.processCommand(entityId, "brief");
  }

  // ─── NPC Management ─────────────────────────────────────────────────────

  /** Spawn an NPC entity in a room (not tied to any connection) */
  spawnNpc(
    room: RoomId,
    opts: { name: string; short: string; long: string; properties?: Record<string, unknown> },
  ): EntityId {
    const entity = this.entities.create({
      kind: "npc",
      name: opts.name,
      short: opts.short,
      long: opts.long,
      room,
      properties: opts.properties,
    });
    return entity.id;
  }

  /** Remove an NPC entity. Returns false if not found or not an NPC. */
  despawnNpc(entityId: EntityId): boolean {
    const entity = this.entities.get(entityId);
    if (!entity || entity.kind !== "npc") return false;
    this.entities.remove(entityId);
    return true;
  }

  /** Remove an entity from the engine (kick if connected, despawn if NPC/orphan). */
  removeEntity(entityId: EntityId): { ok: true; name: string } | { error: string } {
    const entity = this.entities.get(entityId);
    if (!entity) {
      return { error: "Entity not found." };
    }
    const name = entity.name;

    // If the entity has an active connection, kick them
    const connId = this.entityToConnection.get(entityId);
    if (connId) {
      const conn = this.connections.get(connId);
      if (conn) {
        conn.send({
          kind: "system",
          timestamp: Date.now(),
          data: { text: "You have been removed by an admin." },
        });
        this.removeConnection(connId);
      }
    } else {
      // No connection — broadcast departure and remove directly
      const ctx = this.buildContext(entity.room);
      if (ctx) {
        ctx.broadcast(`${name} vanishes.`);
      }
      this.entities.remove(entityId);
    }

    // Clean up persisted data if db is available
    if (this.db) {
      try {
        this.db.deleteEntity(entityId);
      } catch (err) {
        console.warn("[entity] DB delete failed:", err instanceof Error ? err.message : err);
      }
    }

    return { ok: true, name };
  }

  /** Promote entity to admin if listed in ARTILECT_ADMINS env var */
  private applyAdminBootstrap(entity: Entity): void {
    const adminNames = new Set(
      (process.env.ARTILECT_ADMINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    if (adminNames.has(entity.name)) {
      setRank(entity, 4);
      if (this.db) {
        const user = this.db.getUserByName(entity.name);
        if (user) this.db.updateUserRank(user.id, 4);
      }
    }
  }

  /** Promote an entity to a rank if they are below it */
  private maybePromote(entityId: EntityId, toRank: EntityRank): void {
    const entity = this.entities.get(entityId);
    if (!entity || getRank(entity) >= toRank) return;
    setRank(entity, toRank);
    this.sendToEntity(entityId, `Your rank is now ${rankName(toRank)} (${toRank}).`);
    if (this.db) {
      const user = this.db.getUserByName(entity.name);
      if (user) this.db.updateUserRank(user.id, toRank);
    }
  }

  /** Hot-reload a room module from the filesystem. */
  async reloadRoom(roomIdStr: string): Promise<string> {
    const id = roomIdStr as RoomId;
    if (!this.rooms.has(id)) {
      return `Room "${roomIdStr}" not found.`;
    }
    const baseDir = this.world?.roomsDir ?? join(import.meta.dir, "../../rooms");
    const filePath = join(baseDir, `${roomIdStr}.ts`);
    try {
      // Bust the module cache by appending a timestamp query
      const mod = await import(`${filePath}?t=${Date.now()}`);
      const room: RoomModule = mod.default ?? mod;
      if (!room.short || !room.long) {
        return "Reload failed: room module missing short or long.";
      }
      this.rooms.replace(id, room);
      return `Room "${roomIdStr}" reloaded successfully.`;
    } catch (err) {
      return `Reload failed: ${err}`;
    }
  }

  /** Get all NPCs in a room */
  getNpcsInRoom(room: RoomId): Entity[] {
    return this.entities.inRoom(room).filter((e) => e.kind === "npc");
  }

  // ─── Room API Builders ─────────────────────────────────────────────────

  private buildBoardAPI(): RoomBoardAPI | undefined {
    if (!this.boardManager) return undefined;
    const bm = this.boardManager;
    return {
      getBoard(name: string) {
        const board = bm.getBoardByName(name);
        return board ? { id: board.id, name: board.name } : undefined;
      },
      listPosts(boardId: string, limit = 10) {
        return bm.listPosts(boardId, { limit }).map((p) => ({
          id: p.id,
          title: p.title,
          body: p.body,
          authorName: p.authorName,
          createdAt: p.createdAt,
        }));
      },
      post(boardId, authorId, authorName, title, body) {
        const p = bm.createPost({ boardId, authorId, authorName, title, body });
        return p.id;
      },
      search(boardId, query) {
        return bm.searchPosts(boardId, query).map((p) => ({
          id: p.id,
          title: p.title,
          body: p.body,
          authorName: p.authorName,
        }));
      },
    };
  }

  private buildChannelAPI(): RoomChannelAPI | undefined {
    if (!this.channelManager) return undefined;
    const cm = this.channelManager;
    return {
      send(channelName, senderId, senderName, content) {
        const ch = cm.getChannelByName(channelName);
        if (ch) {
          cm.send(ch.id, senderId, senderName, content);
        }
      },
      history(channelName, limit = 20) {
        const ch = cm.getChannelByName(channelName);
        if (!ch) return [];
        return cm.getHistory(ch.id, limit).map((m) => ({
          senderName: m.senderName,
          content: m.content,
          createdAt: m.createdAt,
        }));
      },
    };
  }

  // ─── Room Fetch (rate-limited HTTP) ─────────────────────────────────────

  private async roomFetch(
    room: RoomId,
    url: string,
  ): Promise<{ status: number; body: string } | { error: string }> {
    // Rate limit: 1 request per 10 seconds per room
    const now = Date.now();
    const lastCall = this.fetchLastCall.get(room) ?? 0;
    if (now - lastCall < 10_000) {
      return { error: "Rate limited. Wait before fetching again." };
    }
    this.fetchLastCall.set(room, now);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const body = await response.text();
      // Limit response size to 10KB
      return {
        status: response.status,
        body: body.length > 10240 ? body.slice(0, 10240) : body,
      };
    } catch (err) {
      return { error: `Fetch failed: ${err instanceof Error ? err.message : "Unknown error"}` };
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /** Get the entity ID bound to a connection */
  getConnectionEntity(connId: string): EntityId | null {
    const conn = this.connections.get(connId);
    return conn?.entity ?? null;
  }

  getEntityRoom(entityId: EntityId): LoadedRoom | undefined {
    const entity = this.entities.get(entityId);
    if (!entity) return undefined;
    return this.rooms.get(entity.room);
  }

  /** Find an entity by name across all rooms (for tell) */
  findEntityGlobal(name: string): Entity | undefined {
    const lower = name.toLowerCase();
    for (const entity of this.entities.all()) {
      if (entity.kind !== "agent") continue;
      if (entity.name.toLowerCase() === lower) return entity;
      if (entity.name.toLowerCase().startsWith(lower)) return entity;
    }
    return undefined;
  }

  getOnlineAgents(): Entity[] {
    return this.entities.all().filter((e) => {
      if (e.kind !== "agent") return false;
      // Only include agents that have an active connection
      const connId = this.entityToConnection.get(e.id);
      return connId !== undefined && this.connections.has(connId);
    });
  }

  /** Get connection for an entity (for quit command) */
  getConnectionForEntity(entityId: EntityId): Connection | undefined {
    const connId = this.entityToConnection.get(entityId);
    if (!connId) return undefined;
    return this.connections.get(connId);
  }

  getEventLog(): EngineEvent[] {
    return this.eventLog;
  }

  private logEvent(event: EngineEvent): void {
    this.eventLog.push(event);
    // Keep last 10K events in memory; persistence layer will handle durable storage
    if (this.eventLog.length > 10_000) {
      this.eventLog = this.eventLog.slice(-5_000);
    }
    if (this.db) {
      try {
        this.db.logEvent(event);
      } catch (err) {
        console.warn("[event] DB log failed:", err instanceof Error ? err.message : err);
      }
    }

    // Notify external listeners
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn("[event] Listener failed:", err instanceof Error ? err.message : err);
      }
    }
  }

  // ─── Persistence ────────────────────────────────────────────────────────

  /** Save all world state to the database */
  saveWorldState(): void {
    if (!this.db) return;
    this.db.saveAllEntities(this.entities.all());
    for (const room of this.rooms.all()) {
      for (const key of room.store.keys()) {
        this.db.setRoomStoreValue(room.id, key, room.store.get(key));
      }
    }
    console.log("World state saved to database.");
  }

  /** Load world state from the database */
  loadWorldState(): void {
    if (!this.db) return;
    const entities = this.db.loadAllEntities();
    let maxId = 0;
    let relocated = 0;
    for (const entity of entities) {
      // If the entity's saved room doesn't exist in the current world,
      // relocate them to the start room so they aren't stuck in limbo.
      if (!this.rooms.has(entity.room)) {
        entity.room = this.config.startRoom;
        relocated++;
      }
      this.entities.restore(entity);
      const match = entity.id.match(/^e_(\d+)$/);
      if (match) {
        const num = Number.parseInt(match[1]!, 10);
        if (num > maxId) maxId = num;
      }
    }
    if (maxId > 0) {
      this.entities.setNextId(maxId + 1);
    }
    for (const room of this.rooms.all()) {
      const keys = this.db.getRoomStoreKeys(room.id);
      for (const key of keys) {
        const value = this.db.getRoomStoreValue(room.id, key);
        if (value !== undefined) {
          this.rooms.restoreStoreData(room.id, key, value);
        }
      }
    }
    if (relocated > 0) {
      console.log(
        `Relocated ${relocated} entities to ${this.config.startRoom} (room no longer exists).`,
      );
    }
    console.log(`Restored ${entities.length} entities from database.`);
  }

  /** Load rooms stored in the DB (dynamic/built rooms) */
  async loadDynamicRooms(): Promise<number> {
    if (!this.db) return 0;
    const roomIds = this.db.getAllRoomSourceIds();
    let loaded = 0;
    for (const roomId of roomIds) {
      // Skip rooms already loaded from files
      if (this.rooms.has(roomId as RoomId)) continue;

      const source = this.db.getRoomSource(roomId);
      if (!source || !source.valid) continue;

      try {
        const module = await compileRoomModule(source.source);
        this.registerRoom(roomId as RoomId, module);
        loaded++;
      } catch (err) {
        console.error(`Failed to load dynamic room ${roomId}:`, err);
      }
    }
    if (loaded > 0) {
      console.log(`Loaded ${loaded} dynamic rooms from database.`);
    }
    return loaded;
  }

  /** Load dynamic commands stored in the DB */
  async loadDynamicCommands(): Promise<number> {
    if (!this.db) return 0;
    const names = this.db.getAllValidCommandNames();
    let loaded = 0;
    for (const name of names) {
      const cmd = this.db.getCommandByName(name);
      if (!cmd) continue;
      try {
        const compiled = await compileCommandModule(cmd.source);
        this.commands.registerBuiltin(compiled);
        loaded++;
      } catch (err) {
        console.error(`Failed to load dynamic command "${name}":`, err);
      }
    }
    if (loaded > 0) {
      console.log(`Loaded ${loaded} dynamic commands from database.`);
    }
    return loaded;
  }

  /** Initialize the connector runtime (call after construction) */
  async initConnectors(): Promise<void> {
    if (!this.connectorRuntime) return;
    const available = await this.connectorRuntime.init();
    if (available) {
      await this.connectorRuntime.loadFromDB();
    }
  }

  /** Build a CommandContext for dynamic commands (extends RoomContext) */
  buildCommandContext(roomId: RoomId, entityId: EntityId): CommandContext | undefined {
    const base = this.buildContext(roomId);
    if (!base) return undefined;

    const entity = this.entities.get(entityId);
    if (!entity) return undefined;

    const db = this.db;
    const runtime = this.connectorRuntime;
    const entityName = entity.name;
    const rank = (entity.properties.rank as number) ?? 0;

    return {
      ...base,
      mcp: {
        call: async (server, tool, args) => {
          if (!runtime?.isAvailable()) throw new Error("Connector runtime not available.");
          return runtime.callTool(server, tool, args, entityId);
        },
        listTools: async (server) => {
          if (!runtime?.isAvailable()) return [];
          return runtime.listTools(server);
        },
        listServers: () => runtime?.listServers() ?? [],
      },
      http: {
        get: async (url) => {
          if (!runtime) return { error: "HTTP not available." };
          return runtime.httpGet(url, entityId);
        },
        post: async (url, body) => {
          if (!runtime) return { error: "HTTP not available." };
          return runtime.httpPost(url, body, entityId);
        },
      },
      notes: {
        recall: (query) => {
          if (!db) return [];
          return db.recallNotes(entityName, query).map((n) => ({
            id: n.id,
            content: n.content,
            importance: n.importance,
            score: n.score,
          }));
        },
        search: (query) => {
          if (!db) return [];
          return db.searchNotes(entityName, query).map((n) => ({
            id: n.id,
            content: n.content,
            importance: n.importance,
          }));
        },
        add: (content, importance, noteType) => {
          if (!db) return -1;
          return db.createNote(entityName, content, roomId, { importance, noteType });
        },
      },
      memory: {
        get: (key) => db?.getCoreMemory(entityName, key)?.value,
        set: (key, value) => db?.setCoreMemory(entityName, key, value),
        list: () => {
          if (!db) return [];
          return db.listCoreMemory(entityName).map((m) => ({
            key: m.key,
            value: m.value,
          }));
        },
      },
      pool: {
        recall: (poolName, query) => {
          if (!db) return [];
          const pool = db.getMemoryPool(poolName);
          if (!pool) return [];
          return db.recallPoolNotes(pool.id, query).map((n) => ({
            id: n.id,
            content: n.content,
            score: n.score,
          }));
        },
        add: (poolName, content, importance) => {
          if (!db) return;
          const pool = db.getMemoryPool(poolName);
          if (!pool) return;
          db.addPoolNote(pool.id, entityName, content, importance);
        },
      },
      caller: { id: entityId, name: entityName, rank },
    };
  }

  /** Remove agents that have no active connection (ghost entities). */
  private cleanupOrphanedAgents(): void {
    const agents = this.entities.all().filter((e) => e.kind === "agent");
    for (const agent of agents) {
      const connId = this.entityToConnection.get(agent.id);
      if (!connId || !this.connections.has(connId)) {
        // Orphaned agent — clean up silently
        if (connId) this.entityToConnection.delete(agent.id);
        const ctx = this.buildContext(agent.room);
        if (ctx) {
          ctx.broadcastExcept(agent.id, `${agent.name} fades away.`);
        }
        this.entities.remove(agent.id);
      }
    }
  }

  /** Save world state and stop the engine */
  shutdown(): void {
    this.saveWorldState();
    this.stop();
    // Close connector runtime (fire and forget)
    this.connectorRuntime?.close().catch(() => {});
  }

  // ─── Built-in Command Registration ──────────────────────────────────────

  private registerBuiltinCommands(): void {
    // Look command (with optional board listing)
    this.commands.registerBuiltin(
      lookCommand(
        (entityId) => this.getEntityRoom(entityId),
        this.boardManager
          ? (roomId) => this.boardManager!.getBoardsForScope("room", roomId)
          : undefined,
      ),
    );

    this.commands.registerBuiltin(
      moveCommand({
        getEntity: (id) => this.entities.get(id),
        getRoom: (entityId) => this.getEntityRoom(entityId),
        getRoomById: (id) => this.rooms.get(id),
        moveEntity: (entityId, to) => this.entities.move(entityId, to),
        buildContext: (room) => this.buildContext(room),
        sendLook: (entityId) => this.sendLook(entityId),
      }),
    );

    this.commands.registerBuiltin(
      lsCommand({
        getEntityRoom: (entityId) => this.getEntityRoom(entityId),
        getAllRooms: () => this.rooms.all(),
        getAllEntities: () => this.entities.all(),
        getEntitiesInRoom: (room) => this.entities.inRoom(room),
        getRoomBoards: this.boardManager
          ? (roomId) => this.boardManager!.getBoardsForScope("room", roomId)
          : undefined,
      }),
    );

    this.commands.registerBuiltin(
      gotoCommand({
        getEntity: (id) => this.entities.get(id),
        getRoomById: (id) => this.rooms.get(id),
        hasRoom: (id) => this.rooms.has(id),
        moveEntity: (entityId, to) => this.entities.move(entityId, to),
        buildContext: (room) => this.buildContext(room),
        sendLook: (entityId) => this.sendLook(entityId),
        getAllEntities: () => this.entities.all(),
        getEntityRoom: (entityId) => this.getEntityRoom(entityId),
      }),
    );

    this.commands.registerBuiltin(sayCommand((id) => this.entities.get(id)));
    this.commands.registerPrefixAlias("'", "say");
    this.commands.registerBuiltin(
      shoutCommand({
        getEntity: (id) => this.entities.get(id),
        broadcastAll: (senderId, msg) => {
          const sender = this.entities.get(senderId);
          const senderName = sender?.name;
          for (const entity of this.entities.all()) {
            if (entity.kind === "agent" && entity.id !== senderId) {
              if (senderName && isIgnoring(entity, senderName)) continue;
              this.sendToEntity(entity.id, msg);
            }
          }
        },
      }),
    );
    this.commands.registerBuiltin(
      tellCommand({
        getEntity: (id) => this.entities.get(id),
        findEntityGlobal: (name) => {
          const e = this.findEntityGlobal(name);
          return e ? { id: e.id, name: e.name } : undefined;
        },
        sendGlobal: (target, msg, senderId) => {
          const targetEntity = this.entities.get(target);
          const sender = this.entities.get(senderId);
          if (targetEntity && sender && isIgnoring(targetEntity, sender.name)) return;
          this.sendToEntity(target, msg);
        },
      }),
    );
    this.commands.registerBuiltin(
      whoCommand(
        () => this.getOnlineAgents(),
        (roomId) => this.rooms.get(roomId as RoomId)?.module.short,
      ),
    );
    this.commands.registerBuiltin(examineCommand((entityId) => this.getEntityRoom(entityId)));
    this.commands.registerBuiltin(helpCommand(() => this.commands.allBuiltins()));
    this.commands.registerBuiltin(inventoryCommand((id) => this.entities.get(id)));
    this.commands.registerBuiltin(emoteCommand((id) => this.entities.get(id)));
    this.commands.registerBuiltin(timeCommand());
    this.commands.registerBuiltin(uptimeCommand(() => this.getUptime()));
    this.commands.registerBuiltin(
      ignoreCommand({
        getEntity: (id) => this.entities.get(id),
        findEntityGlobal: (name) => this.findEntityGlobal(name),
      }),
    );
    this.commands.registerBuiltin(talkCommand());
    this.commands.registerBuiltin(
      briefCommand({
        getEntity: (id) => this.entities.get(id),
        db: this.db,
        taskManager: this.taskManager,
        getOnlineAgents: () => this.getOnlineAgents(),
      }),
    );
    this.commands.registerBuiltin(
      scoreCommand({
        getEntity: (id) => this.entities.get(id),
        getRoomShort: (id) => this.rooms.get(id as RoomId)?.module.short,
      }),
    );
    this.commands.registerBuiltin(
      mapCommand({
        getEntityRoom: (id) => {
          const room = this.getEntityRoom(id);
          if (!room) return undefined;
          return { id: room.id, short: room.module.short, exits: room.module.exits ?? {} };
        },
        getRoomShort: (id) => this.rooms.get(id)?.module.short,
      }),
    );
    this.commands.registerBuiltin(
      getCommand({
        getEntity: (id) => this.entities.get(id),
        findObjectInRoom: (name, room) => {
          const inRoom = this.entities.inRoom(room);
          const lower = name.toLowerCase();
          return inRoom.find((e) => e.kind === "object" && e.name.toLowerCase().startsWith(lower));
        },
      }),
    );
    this.commands.registerBuiltin(
      dropCommand({
        getEntity: (id) => this.entities.get(id),
        getEntityById: (id) => this.entities.get(id),
      }),
    );
    this.commands.registerBuiltin(
      giveCommand({
        getEntity: (id) => this.entities.get(id),
        getEntityById: (id) => this.entities.get(id),
        findEntityInRoom: (name, room) => this.entities.findByName(name, room),
      }),
    );

    // Rank command
    this.commands.registerBuiltin(
      rankCommand({
        findEntity: (name) => this.findEntityGlobal(name),
        db: this.db,
      }),
    );

    // Quest command
    this.commands.registerBuiltin(
      questCommand({
        getEntity: (id) => this.entities.get(id),
        db: this.db,
        quests: this.world?.quests ?? [],
      }),
    );

    // Link command (account linking for external adapters)
    this.commands.registerBuiltin(
      linkCommand({
        getEntity: (id) => this.entities.get(id),
        db: this.db,
      }),
    );

    // Knowledge base commands
    this.commands.registerBuiltin(
      noteCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        db: this.db,
      }),
    );
    this.commands.registerBuiltin(
      searchCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        db: this.db,
        getAllRooms: () =>
          this.rooms.all().map((r) => ({
            id: r.id,
            short: r.module.short,
            long: typeof r.module.long === "string" ? r.module.long : "",
          })),
      }),
    );
    this.commands.registerBuiltin(
      bookmarkCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        getRoomShort: (id) => this.rooms.get(id)?.module.short,
      }),
    );

    // Memory commands
    this.commands.registerBuiltin(
      memoryCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        db: this.db,
      }),
    );
    this.commands.registerBuiltin(
      recallCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        db: this.db,
        taskManager: this.taskManager,
      }),
    );
    this.commands.registerBuiltin(
      reflectCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        db: this.db,
      }),
    );
    this.commands.registerBuiltin(
      poolCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        db: this.db,
      }),
    );
    this.commands.registerBuiltin(
      noveltyCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        db: this.db,
        getTotalRoomCount: () => this.rooms.all().length,
      }),
    );
    this.commands.registerBuiltin(
      skillCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        db: this.db,
      }),
    );
    this.commands.registerBuiltin(
      orientCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        db: this.db,
        taskManager: this.taskManager,
        getTotalRoomCount: () => this.rooms.all().length,
      }),
    );

    // Project command (requires task + group managers)
    if (this.taskManager && this.groupManager && this.db) {
      this.commands.registerBuiltin(
        projectCommand({
          getEntity: (id) => this.entities.get(id as EntityId),
          db: this.db,
          taskManager: this.taskManager,
          groupManager: this.groupManager,
          promote: (eid, rank) => this.maybePromote(eid, rank),
        }),
      );
    }

    // Export command (only if boards available)
    if (this.boardManager) {
      this.commands.registerBuiltin(
        exportCommand(this.boardManager, (id) => this.entities.get(id as EntityId)),
      );
    }

    // Agent playground commands
    this.commands.registerBuiltin(
      experimentCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        db: this.db,
      }),
    );
    this.commands.registerBuiltin(
      observeCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        findEntity: (name) => this.findEntityGlobal(name),
        db: this.db,
        getOnlineAgents: () => this.getOnlineAgents(),
        getRoomShort: (id) => this.rooms.get(id)?.module.short,
        getEventLog: () =>
          this.eventLog.map((e) => ({
            type: e.type,
            entity: "entity" in e ? e.entity : undefined,
            input: "input" in e ? e.input : undefined,
            timestamp: e.timestamp,
          })),
      }),
    );

    // Coordination commands (only if db-backed)
    if (this.channelManager) {
      this.commands.registerBuiltin(
        channelCommand(this.channelManager, (id) => this.entities.get(id as EntityId)),
      );
    }
    if (this.boardManager) {
      this.commands.registerBuiltin(
        boardCommand(this.boardManager, (id) => this.entities.get(id as EntityId)),
      );
    }
    if (this.groupManager) {
      this.commands.registerBuiltin(
        groupCommand(this.groupManager, (name) => this.findEntityGlobal(name)),
      );
    }
    if (this.taskManager) {
      this.commands.registerBuiltin(
        taskCommand(
          this.taskManager,
          (name) => this.findEntityGlobal(name),
          (event) => this.logEvent(event),
          (eid, rank) => this.maybePromote(eid, rank),
        ),
      );
    }
    if (this.macroManager) {
      this.commands.registerBuiltin(macroCommand(this.macroManager));
    }

    // Build command (only if db-backed)
    if (this.db) {
      this.commands.registerBuiltin(
        buildCommand({
          getEntity: (id) => this.entities.get(id as EntityId),
          db: this.db,
          getRoom: (id) => this.rooms.get(id),
          registerRoom: (id, module) => this.registerRoom(id, module),
          replaceRoom: (id, module) => {
            const wrapped = this.sandbox.wrapModule(id, module, (_roomId, error) => {
              console.error(`[sandbox] ${error}`);
            });
            this.rooms.replace(id, wrapped);
          },
          entitiesInRoom: (room) => this.entities.inRoom(room),
          registerCommand: (def) => this.commands.registerBuiltin(def),
          unregisterCommand: (name) => this.commands.unregisterBuiltin(name),
          isBuiltinCommand: (name) => this.commands.getDef(name) !== undefined,
          clearSandboxMetrics: (roomId) => this.sandbox.clearMetrics(roomId),
        }),
      );
    }

    // Connect command (only if db-backed)
    if (this.db) {
      this.commands.registerBuiltin(
        connectCommand({
          getEntity: (id) => this.entities.get(id as EntityId),
          db: this.db,
          connectorRuntime: this.connectorRuntime,
        }),
      );
    }

    // Source command (works with or without DB)
    this.commands.registerBuiltin(
      sourceCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        db: this.db,
        getRoom: (id) => this.rooms.get(id),
        getEntityRoom: (entityId) => this.getEntityRoom(entityId),
      }),
    );

    // Quit command (graceful disconnect)
    this.commands.registerBuiltin(
      quitCommand({
        getConnection: (id) => this.getConnectionForEntity(id),
      }),
    );

    // Canvas command (asset management + canvas)
    this.commands.registerBuiltin(
      canvasCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        db: this.db,
        storage: this.storage,
        logEvent: (event) => this.logEvent(event as import("../types").EngineEvent),
        scratchRoot: "data/scratch",
      }),
    );

    // Shell commands (run + shell management)
    this.commands.registerBuiltin(
      runCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        shellRuntime: this.shellRuntime,
      }),
    );
    this.commands.registerBuiltin(
      shellCommand({
        getEntity: (id) => this.entities.get(id as EntityId),
        db: this.db,
        shellRuntime: this.shellRuntime,
        storage: this.storage,
      }),
    );

    // Admin command (only if db-backed)
    if (this.db) {
      this.commands.registerBuiltin(
        adminCommand({
          db: this.db,
          dbPath: this.config.dbPath,
          worldName: this.world?.name,
          getEntity: (id) => this.entities.get(id as EntityId),
          findEntity: (name) => this.findEntityGlobal(name),
          getConnections: () => this.connections,
          removeConnection: (connId) => this.removeConnection(connId),
          broadcastAll: (msg) => {
            for (const entity of this.entities.all()) {
              if (entity.kind === "agent") {
                this.sendToEntity(entity.id, msg);
              }
            }
          },
          roomCount: () => this.rooms.size,
          entityCount: () => this.entities.size,
          getUptime: () => this.getUptime(),
          reloadRoom: (id) => this.reloadRoom(id),
        }),
      );
    }
  }
}

// ─── Utilities ─────────────────────────────────────────────────────────────

/** Fisher-Yates shuffle — mutates array in place. */
function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}
