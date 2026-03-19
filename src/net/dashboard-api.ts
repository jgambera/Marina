import { join } from "node:path";
import { getConfiguredProviderNames, getModelsByProvider } from "../agents/agent/model-registry";
import type { ManagedAgent } from "../engine/agent-runtime";
import type { Engine } from "../engine/engine";
import type { MarinaDB } from "../persistence/database";
import type { RoomId } from "../types";

const ROOMS_DIR = join(import.meta.dir, "../../rooms");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

function sanitizeAgent(m: ManagedAgent) {
  const { agent: _agent, ...rest } = m;
  return { ...rest, uptimeMs: Date.now() - m.startedAt };
}

export async function handleDashboardApi(
  url: URL,
  req: Request,
  engine: Engine,
  db?: MarinaDB,
): Promise<Response | undefined> {
  const method = req.method;
  if (url.pathname === "/api/world") {
    return getWorld(engine);
  }
  if (url.pathname === "/api/entities") {
    return getEntities(engine);
  }
  if (url.pathname === "/api/events") {
    return getEvents(engine, url);
  }
  if (url.pathname === "/api/system") {
    return getSystem(engine, db);
  }

  // Parameterized detail routes (check before list routes)
  const taskDetailMatch = url.pathname.match(/^\/api\/coordination\/tasks\/(\d+)$/);
  if (taskDetailMatch && db) {
    return getTaskDetail(db, Number(taskDetailMatch[1]));
  }

  const boardDetailMatch = url.pathname.match(/^\/api\/coordination\/boards\/(.+)$/);
  if (boardDetailMatch && db) {
    return getBoardDetail(db, decodeURIComponent(boardDetailMatch[1]!));
  }

  const groupDetailMatch = url.pathname.match(/^\/api\/coordination\/groups\/(.+)$/);
  if (groupDetailMatch && db) {
    return getGroupDetail(db, decodeURIComponent(groupDetailMatch[1]!));
  }

  const channelDetailMatch = url.pathname.match(/^\/api\/coordination\/channels\/(.+)$/);
  if (channelDetailMatch && db) {
    return getChannelDetail(db, decodeURIComponent(channelDetailMatch[1]!));
  }

  const roomMatch = url.pathname.match(/^\/api\/rooms\/(.+)$/);
  if (roomMatch) {
    return await getRoomDetail(engine, db, decodeURIComponent(roomMatch[1]!));
  }

  const entityMatch = url.pathname.match(/^\/api\/entities\/(.+)$/);
  if (entityMatch) {
    const entityName = decodeURIComponent(entityMatch[1]!);
    if (method === "DELETE") {
      return deleteEntity(engine, entityName);
    }
    return getEntityDetail(engine, db, entityName);
  }

  const memNotesMatch = url.pathname.match(/^\/api\/memory\/notes\/(.+)$/);
  if (memNotesMatch && db) {
    return getMemoryNotes(db, decodeURIComponent(memNotesMatch[1]!));
  }

  const memCoreMatch = url.pathname.match(/^\/api\/memory\/core\/(.+)$/);
  if (memCoreMatch && db) {
    return getMemoryCore(db, decodeURIComponent(memCoreMatch[1]!));
  }

  if (url.pathname === "/api/memory/pools" && db) {
    return json(db.listMemoryPools());
  }
  if (url.pathname === "/api/coordination/boards" && db) {
    return getBoards(db);
  }
  if (url.pathname === "/api/coordination/tasks" && db) {
    return json(db.listTasks({ limit: 50 }));
  }
  if (url.pathname === "/api/coordination/channels" && db) {
    return getChannels(db);
  }
  if (url.pathname === "/api/coordination/groups" && db) {
    return getGroups(db);
  }
  if (url.pathname === "/api/coordination/projects" && db) {
    return getProjects(db);
  }
  if (url.pathname === "/api/connectors" && db) {
    return getConnectors(db);
  }
  if (url.pathname === "/api/commands" && db) {
    return getCommands(db);
  }

  // ─── Agent management endpoints ──────────────────────────────────────────
  if (url.pathname === "/api/agents" && method === "GET") {
    const agents = engine.agentRuntime.list().map(sanitizeAgent);
    return json({ agents, configuredProviders: getConfiguredProviderNames() });
  }

  if (url.pathname === "/api/agents/models" && method === "GET") {
    const providers = await getModelsByProvider();
    const configured = getConfiguredProviderNames();
    return json({ providers, configured });
  }

  if (url.pathname === "/api/agents/spawn" && method === "POST") {
    try {
      const body = await req.json();
      const { name, model, role } = body as { name?: string; model?: string; role?: string };
      if (!name || !model) {
        return json({ error: "name and model are required" }, 400);
      }
      const managed = await engine.agentRuntime.spawn({
        name,
        model,
        role: role as "general" | "architect" | "scholar" | "diplomat" | "mentor" | "merchant",
      });
      return json(sanitizeAgent(managed));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already running")) {
        return json({ error: msg }, 409);
      }
      return json({ error: msg }, 500);
    }
  }

  const agentStopMatch = url.pathname.match(/^\/api\/agents\/(.+)\/stop$/);
  if (agentStopMatch && method === "POST") {
    const agentName = decodeURIComponent(agentStopMatch[1]!);
    const stopped = await engine.agentRuntime.stop(agentName);
    if (!stopped) return json({ error: "Agent not found" }, 404);
    return json({ ok: true });
  }

  if (url.pathname.startsWith("/api/")) {
    return json({ error: "Not found" }, 404);
  }

  return undefined;
}

function getWorld(engine: Engine): Response {
  const rooms = engine.rooms.all().map((r) => {
    const district = r.id.split("/")[0] ?? "";
    const entities = engine.entities.inRoom(r.id);
    return {
      id: r.id,
      short: r.module.short,
      district,
      exits: r.module.exits ?? {},
      entityCount: entities.length,
    };
  });

  const entities = engine.entities.all().map((e) => ({
    id: e.id,
    name: e.name,
    kind: e.kind,
    room: e.room,
    rank: (e.properties.rank as number) ?? 0,
  }));

  return json({
    worldName: engine.world?.name ?? "Unknown",
    startRoom: engine.config.startRoom,
    rooms,
    entities,
  });
}

async function getRoomDetail(
  engine: Engine,
  db: MarinaDB | undefined,
  roomIdStr: string,
): Promise<Response> {
  const room = engine.rooms.get(roomIdStr as RoomId);
  if (!room) return json({ error: "Room not found" }, 404);

  const entities = engine.entities.inRoom(room.id).map((e) => ({
    id: e.id,
    name: e.name,
    kind: e.kind,
  }));

  const longText = typeof room.module.long === "string" ? room.module.long : "[dynamic]";

  const items: Record<string, string> = {};
  if (room.module.items) {
    for (const [key, val] of Object.entries(room.module.items)) {
      items[key] = typeof val === "string" ? val : "[dynamic]";
    }
  }

  // Resolve source: DB first, then file-based fallback
  let source: string | undefined;
  if (db) {
    const src = db.getRoomSource(roomIdStr);
    if (src) source = src.source;
  }
  if (!source) {
    try {
      const file = Bun.file(join(ROOMS_DIR, `${roomIdStr}.ts`));
      if (await file.exists()) {
        source = await file.text();
      }
    } catch {
      // ignore — source stays undefined
    }
  }

  return json({
    id: room.id,
    short: room.module.short,
    long: longText,
    exits: room.module.exits ?? {},
    items,
    entities,
    source,
  });
}

function getEntities(engine: Engine): Response {
  const entities = engine.entities.all().map((e) => ({
    id: e.id,
    name: e.name,
    kind: e.kind,
    room: e.room,
    rank: (e.properties.rank as number) ?? 0,
  }));
  return json(entities);
}

function getEntityDetail(engine: Engine, db: MarinaDB | undefined, name: string): Response {
  const entity = engine.findEntityGlobal(name);
  if (!entity) return json({ error: "Entity not found" }, 404);

  const result: Record<string, unknown> = {
    id: entity.id,
    name: entity.name,
    kind: entity.kind,
    room: entity.room,
    rank: (entity.properties.rank as number) ?? 0,
    properties: entity.properties,
    inventory: entity.inventory,
  };

  if (db) {
    result.coreMemory = db.listCoreMemory(entity.name);
    result.notes = db.getNotesByEntity(entity.name, 10);
    result.recentActivity = db.getEventsByEntity(entity.id, 20);
  }

  return json(result);
}

function getSystem(engine: Engine, db?: MarinaDB): Response {
  const entities = engine.entities.all();
  const agents = entities.filter((e) => e.kind === "agent");
  const npcs = entities.filter((e) => e.kind === "npc");
  const roomPops: Record<string, number> = {};
  for (const e of agents) {
    roomPops[e.room] = (roomPops[e.room] ?? 0) + 1;
  }

  const result: Record<string, unknown> = {
    status: "ok",
    uptime: engine.getUptime(),
    connections: engine.getConnections().size,
    rooms: engine.rooms.size,
    entities: {
      total: entities.length,
      agents: agents.length,
      npcs: npcs.length,
    },
    roomPopulations: roomPops,
    memory: {
      heapUsed: process.memoryUsage().heapUsed,
      rss: process.memoryUsage().rss,
    },
  };

  if (db) {
    const allTasks = db.listTasks({ limit: 1000 });
    const taskCounts = { open: 0, claimed: 0, submitted: 0, completed: 0 };
    for (const t of allTasks) {
      if (t.status in taskCounts) {
        taskCounts[t.status as keyof typeof taskCounts]++;
      }
    }
    result.tasks = taskCounts;
    result.projectCount = db.listProjects().length;
    result.connectorCount = db.listConnectors().length;
    result.commandCount = db.listCommands().length;
  }

  return json(result);
}

function getEvents(engine: Engine, url: URL): Response {
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
  const events = engine
    .getEventLog()
    .filter((e) => e.type !== "tick")
    .slice(-limit);
  return json(events);
}

function getMemoryNotes(db: MarinaDB, entityName: string): Response {
  return json(db.getNotesByEntity(entityName, 50));
}

function getMemoryCore(db: MarinaDB, entityName: string): Response {
  return json(db.listCoreMemory(entityName));
}

function getBoards(db: MarinaDB): Response {
  const boards = db.getAllBoards().map((b) => {
    const posts = db.listBoardPosts(b.id, { limit: 1000 });
    return { ...b, postCount: posts.length };
  });
  return json(boards);
}

function getChannels(db: MarinaDB): Response {
  const channels = db.getAllChannels().map((c) => {
    const history = db.getChannelHistory(c.id, 1);
    return { ...c, messageCount: history.length > 0 ? "1+" : "0" };
  });
  return json(channels);
}

function getGroups(db: MarinaDB): Response {
  const groups = db.getAllGroups().map((g) => {
    const members = db.getGroupMembers(g.id);
    return { ...g, memberCount: members.length };
  });
  return json(groups);
}

function deleteEntity(engine: Engine, name: string): Response {
  const entity = engine.findEntityGlobal(name);
  if (!entity) {
    return json({ error: "Entity not found" }, 404);
  }
  const result = engine.removeEntity(entity.id);
  if ("error" in result) {
    return json({ error: result.error }, 500);
  }
  return json({ ok: true, name: result.name });
}

// --- New drill-down endpoints ---

function getProjects(db: MarinaDB): Response {
  const projects = db.listProjects().map((p) => {
    let bundleProgress: { total: number; done: number } | undefined;
    if (p.bundle_id) {
      const children = db.listTasks({ parentId: p.bundle_id, limit: 200 });
      const done = children.filter((t) => t.status === "completed").length;
      bundleProgress = { total: children.length, done };
    }
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      orchestration: p.orchestration,
      memory_arch: p.memory_arch,
      status: p.status,
      bundle_id: p.bundle_id,
      pool_id: p.pool_id,
      group_id: p.group_id,
      created_by: p.created_by,
      bundleProgress,
    };
  });
  return json(projects);
}

function getConnectors(db: MarinaDB): Response {
  const connectors = db.listConnectors().map((c) => ({
    id: c.id,
    name: c.name,
    transport: c.transport,
    url: c.url,
    status: c.status,
    auth_type: c.auth_type,
    created_by: c.created_by,
  }));
  return json(connectors);
}

function getCommands(db: MarinaDB): Response {
  const commands = db.listCommands().map((c) => ({
    id: c.id,
    name: c.name,
    version: c.version,
    valid: c.valid,
    created_by: c.created_by,
    created_at: c.created_at,
  }));
  return json(commands);
}

function getTaskDetail(db: MarinaDB, taskId: number): Response {
  const task = db.getTask(taskId);
  if (!task) return json({ error: "Task not found" }, 404);

  const children = db.listTasks({ parentId: taskId, limit: 50 }).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    creator_name: t.creator_name,
    created_at: t.created_at,
  }));

  return json({
    id: task.id,
    title: task.title,
    status: task.status,
    description: task.description,
    creator_name: task.creator_name,
    parent_task_id: task.parent_task_id,
    created_at: task.created_at,
    children: children.length > 0 ? children : undefined,
  });
}

function getBoardDetail(db: MarinaDB, boardName: string): Response {
  const boards = db.getAllBoards();
  const board = boards.find((b) => b.name === boardName);
  if (!board) return json({ error: "Board not found" }, 404);

  const allPosts = db.listBoardPosts(board.id, { limit: 1000 });
  const posts = db.listBoardPosts(board.id, { limit: 5 }).map((p) => ({
    id: p.id,
    title: p.title,
    body: p.body,
    author_name: p.author_name,
    created_at: p.created_at,
  }));

  return json({
    id: board.id,
    name: board.name,
    scope_type: board.scope_type,
    postCount: allPosts.length,
    created_at: board.created_at,
    posts,
  });
}

function getGroupDetail(db: MarinaDB, groupName: string): Response {
  const groups = db.getAllGroups();
  const group = groups.find((g) => g.name === groupName);
  if (!group) return json({ error: "Group not found" }, 404);

  const members = db.getGroupMembers(group.id);

  return json({
    id: group.id,
    name: group.name,
    description: group.description,
    leader_id: group.leader_id,
    memberCount: members.length,
    members: members.map((m) => ({
      entity_id: m.entity_id,
      rank: m.rank,
      joined_at: m.joined_at,
    })),
  });
}

function getChannelDetail(db: MarinaDB, channelName: string): Response {
  const channels = db.getAllChannels();
  const channel = channels.find((c) => c.name === channelName);
  if (!channel) return json({ error: "Channel not found" }, 404);

  const allHistory = db.getChannelHistory(channel.id, 1);
  const messages = db.getChannelHistory(channel.id, 5).map((m) => ({
    sender_name: m.sender_name,
    content: m.content,
    created_at: m.created_at,
  }));

  return json({
    id: channel.id,
    name: channel.name,
    type: channel.type,
    messageCount: allHistory.length > 0 ? "1+" : "0",
    messages,
  });
}
