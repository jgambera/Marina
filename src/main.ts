import { resolve } from "node:path";
import { RateLimiter } from "./auth/rate-limiter";
import { Engine } from "./engine/engine";
import { Logger } from "./engine/logger";
import { DashboardBroadcaster } from "./net/dashboard-ws";
import { LogServer } from "./net/log-server";
import { McpServerAdapter } from "./net/mcp-server";
import { TelnetServer } from "./net/telnet-server";
import { WebSocketServer } from "./net/websocket-server";
import { MarinaDB } from "./persistence/database";
import { LocalStorageProvider } from "./storage/local-provider";
import type { RoomId } from "./types";
import { loadRooms } from "./world/room-loader";
import { seedGuidePool } from "./world/seed-guide";
import type { WorldDefinition } from "./world/world-definition";

const WS_PORT = Number(process.env.WS_PORT) || 3300;
const TELNET_PORT = Number(process.env.TELNET_PORT) || 4000;
const MCP_PORT = Number(process.env.MCP_PORT) || 3301;
const LOG_PORT = Number(process.env.LOG_PORT) || 3302;
const TICK_MS = Number(process.env.TICK_MS) || 1000;
const DB_PATH = process.env.DB_PATH || "marina.db";

// ─── Load World Definition ───────────────────────────────────────────────────

const WORLD_NAME = process.env.MARINA_WORLD ?? "default";
const worldModule = await import(`../worlds/${WORLD_NAME}`);
const world: WorldDefinition = worldModule.default;

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const logger = new Logger();
const db = new MarinaDB(DB_PATH);
const rateLimiter = new RateLimiter();
const assetsDir = process.env.ASSETS_DIR || "data/assets";
const storage = new LocalStorageProvider(assetsDir);
await storage.init();
logger.info("storage", `Asset storage initialized at ${assetsDir}`);

const engine = new Engine({
  tickInterval: TICK_MS,
  startRoom: world.startRoom,
  db,
  dbPath: DB_PATH,
  rateLimiter,
  storage,
  world,
  logger,
});

// Register inline rooms from world definition
engine.registerWorldRooms(world);

// Load file-based room overlays (if world specifies a roomsDir, or from /rooms)
const roomsDir = world.roomsDir ? resolve(world.roomsDir) : undefined;
await loadRooms(engine, roomsDir);
logger.info("engine", `Loaded ${engine.rooms.size} rooms (world: ${world.name}).`);

// Validate START_ROOM override now that rooms are loaded
if (process.env.START_ROOM) {
  const override = process.env.START_ROOM as RoomId;
  if (engine.rooms.has(override)) {
    engine.config.startRoom = override;
  } else {
    console.warn(`[warn] START_ROOM="${override}" not found, using ${world.startRoom}`);
  }
}

// Restore world state from DB (entities, room stores)
engine.loadWorldState();

// Detect world change and clear stale dynamic data
const storedWorld = db.getMetaValue("world_name");
if (storedWorld && storedWorld !== world.name) {
  logger.info(
    "engine",
    `World changed "${storedWorld}" \u2192 "${world.name}", clearing stale dynamic data`,
  );
  db.clearDynamicRooms();
  db.clearDynamicCommands();
}
db.setMetaValue("world_name", world.name);

// Load dynamic rooms from DB
await engine.loadDynamicRooms();

// Load dynamic commands from DB
await engine.loadDynamicCommands();

// Initialize MCP connector runtime
await engine.initConnectors();

// Seed the guide memory pool (idempotent)
seedGuidePool(db, world.guideNotes);

// Run world seed function (idempotent)
if (world.seed) {
  world.seed(db);
}

// Seed canvas from world definition (idempotent)
if (world.canvas && !db.getCanvasByName(world.canvas.name)) {
  const id = crypto.randomUUID();
  db.createCanvas({
    id,
    name: world.canvas.name,
    description: world.canvas.description,
    scope: world.canvas.scope ?? "global",
    creatorName: "system",
  });
  logger.info("canvas", `Created ${world.canvas.name} canvas`);
}

// ─── Dashboard Broadcaster ───────────────────────────────────────────────────

const dashboardBroadcaster = new DashboardBroadcaster();
engine.addEventListener((event) => dashboardBroadcaster.broadcastEvent(event));
const stateInterval = setInterval(() => dashboardBroadcaster.broadcastState(engine), 2000);

// ─── Live Log Server ────────────────────────────────────────────────────────

const logServer = new LogServer({
  port: LOG_PORT,
  resolveEntity: (id) => engine.entities.get(id)?.name,
});
engine.addEventListener((event) => logServer.handleEvent(event));
logServer.start();

// ─── Network Layer ────────────────────────────────────────────────────────────

const wsServer = new WebSocketServer(engine, WS_PORT, rateLimiter);
wsServer.setBroadcaster(dashboardBroadcaster);
wsServer.setDb(db);
wsServer.setStorage(storage);

const telnetServer = new TelnetServer(engine, TELNET_PORT, rateLimiter);
const mcpServer = new McpServerAdapter(engine, MCP_PORT, rateLimiter);
wsServer.start();
telnetServer.start();
mcpServer.start();

// Load DB-managed adapters and auto-start those with autoStart=true
await engine.adapterRegistry.loadFromDB();

// Backward compat: if env vars set and no matching adapter in DB, auto-create and start
if (process.env.TELEGRAM_TOKEN) {
  const existing = engine.adapterRegistry.findByTypeAndToken(
    "telegram",
    process.env.TELEGRAM_TOKEN,
  );
  if (!existing) {
    const managed = engine.adapterRegistry.create({
      type: "telegram",
      token: process.env.TELEGRAM_TOKEN,
      autoStart: true,
    });
    engine.adapterRegistry.start(managed.id).catch((err) => {
      logger.error("adapter", "Telegram start failed", { err });
    });
  }
}

if (process.env.DISCORD_TOKEN) {
  const existing = engine.adapterRegistry.findByTypeAndToken("discord", process.env.DISCORD_TOKEN);
  if (!existing) {
    const channelIds = process.env.DISCORD_CHANNEL_IDS?.split(",").filter(Boolean);
    const managed = engine.adapterRegistry.create({
      type: "discord",
      token: process.env.DISCORD_TOKEN,
      settings: channelIds ? { channelIds } : undefined,
      autoStart: true,
    });
    engine.adapterRegistry.start(managed.id).catch((err) => {
      logger.error("adapter", "Discord start failed", { err });
    });
  }
}

engine.start();

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

async function shutdown() {
  logger.info("engine", "Shutting down...");
  clearInterval(stateInterval);

  // Stop managed adapters
  await engine.adapterRegistry.shutdown();

  engine.shutdown(); // saves state + stops tick loop
  logServer.stop();
  wsServer.stop();
  telnetServer.stop();
  mcpServer.stop();
  db.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (err) => {
  logger.error("fatal", "Uncaught exception", { error: String(err) });
  console.error("[fatal] Uncaught exception:", err);
});
process.on("unhandledRejection", (reason) => {
  logger.error("fatal", "Unhandled rejection", { error: String(reason) });
  console.error("[fatal] Unhandled rejection:", reason);
});
