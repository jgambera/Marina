import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandDef, RoomModule } from "../types";

// ─── Forbidden Patterns ──────────────────────────────────────────────────────

const FORBIDDEN_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bprocess\b/, reason: "Access to 'process' is forbidden" },
  { pattern: /\brequire\s*\(/, reason: "require() is forbidden" },
  { pattern: /\bimport\s*\(/, reason: "Dynamic import() is forbidden" },
  { pattern: /\bglobalThis\b/, reason: "Access to 'globalThis' is forbidden" },
  { pattern: /\bBun\b/, reason: "Access to 'Bun' is forbidden" },
  { pattern: /\bDeno\b/, reason: "Access to 'Deno' is forbidden" },
  { pattern: /\b__dirname\b/, reason: "Access to '__dirname' is forbidden" },
  { pattern: /\b__filename\b/, reason: "Access to '__filename' is forbidden" },
  { pattern: /\beval\s*\(/, reason: "eval() is forbidden" },
  { pattern: /\bnew\s+Function\b/, reason: "new Function() is forbidden" },
  { pattern: /\bchild_process\b/, reason: "child_process is forbidden" },
  { pattern: /\bexecSync\b/, reason: "execSync is forbidden" },
  { pattern: /\bspawnSync\b/, reason: "spawnSync is forbidden" },
  {
    pattern: /\bfs\b\.\b(writeFile|unlink|rmdir|rm|mkdir|rename)/,
    reason: "Filesystem writes are forbidden",
  },
  { pattern: /\bfetch\s*\(/, reason: "fetch() is forbidden (no network access)" },
  { pattern: /\bWebSocket\b/, reason: "WebSocket is forbidden (no network access)" },
  { pattern: /\bXMLHttpRequest\b/, reason: "XMLHttpRequest is forbidden" },
];

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Static analysis: scan source code for forbidden patterns.
 * This is a best-effort check, not a true sandbox.
 */
export function validateRoomSource(source: string): ValidationResult {
  const errors: string[] = [];

  // Strip string literals and comments to avoid false positives
  const stripped = source
    .replace(/\/\/[^\n]*/g, "") // line comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/"(?:[^"\\]|\\.)*"/g, '""') // double-quoted strings
    .replace(/'(?:[^'\\]|\\.)*'/g, "''") // single-quoted strings
    .replace(/`(?:[^`\\]|\\.)*`/g, "``"); // template literals

  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(stripped)) {
      errors.push(reason);
    }
  }

  // Must export a default object or use module.exports
  if (!source.includes("export default") && !source.includes("export =")) {
    errors.push("Room source must have a default export (export default { ... })");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Compilation ─────────────────────────────────────────────────────────────

/**
 * Compile a TypeScript room source string into a RoomModule.
 * Uses Bun's native TypeScript support by writing to a temp file and importing it.
 * The temp file is cleaned up after import.
 */
const COMPILE_TIMEOUT_MS = 10_000; // 10 seconds

export async function compileRoomModule(source: string): Promise<RoomModule> {
  // Validate first
  const validation = validateRoomSource(source);
  if (!validation.valid) {
    throw new SandboxError(`Validation failed:\n${validation.errors.join("\n")}`);
  }

  // Write to temp file and import with timeout
  const tempDir = await mkdtemp(join(tmpdir(), "marina-room-"));
  const tempFile = join(tempDir, `room_${Date.now()}.ts`);

  try {
    await Bun.write(tempFile, source);

    const importPromise = import(tempFile);
    const timeoutPromise = Bun.sleep(COMPILE_TIMEOUT_MS).then(() => {
      throw new SandboxError(`Compilation timed out after ${COMPILE_TIMEOUT_MS}ms`);
    });

    const mod = await Promise.race([importPromise, timeoutPromise]);
    const room: RoomModule = mod.default ?? mod;

    // Validate the shape of the module
    validateRoomShape(room);

    return room;
  } finally {
    // Clean up temp files
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Validate that a compiled module has the required RoomModule shape.
 */
function validateRoomShape(mod: unknown): asserts mod is RoomModule {
  if (!mod || typeof mod !== "object") {
    throw new SandboxError("Room module must export an object");
  }

  const obj = mod as Record<string, unknown>;

  if (typeof obj.short !== "string" || obj.short.length === 0) {
    throw new SandboxError("Room module must have a non-empty 'short' string property");
  }

  if (typeof obj.long !== "string" && typeof obj.long !== "function") {
    throw new SandboxError("Room module must have a 'long' property (string or function)");
  }

  if (obj.exits !== undefined && (typeof obj.exits !== "object" || obj.exits === null)) {
    throw new SandboxError("Room 'exits' must be an object if provided");
  }

  if (obj.items !== undefined && (typeof obj.items !== "object" || obj.items === null)) {
    throw new SandboxError("Room 'items' must be an object if provided");
  }

  if (obj.commands !== undefined && (typeof obj.commands !== "object" || obj.commands === null)) {
    throw new SandboxError("Room 'commands' must be an object if provided");
  }

  // Validate callback types
  for (const fn of ["onEnter", "onLeave", "onTick"] as const) {
    if (obj[fn] !== undefined && typeof obj[fn] !== "function") {
      throw new SandboxError(`Room '${fn}' must be a function if provided`);
    }
  }
}

// ─── Error ───────────────────────────────────────────────────────────────────

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxError";
  }
}

// ─── Command Validation & Compilation ────────────────────────────────────────

/**
 * Static analysis for command source code. Same forbidden patterns as rooms.
 */
export function validateCommandSource(source: string): ValidationResult {
  const errors: string[] = [];

  const stripped = source
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");

  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(stripped)) {
      errors.push(reason);
    }
  }

  if (!source.includes("export default") && !source.includes("export =")) {
    errors.push("Command source must have a default export (export default { ... })");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Compile a TypeScript command source string into a CommandDef.
 */
export async function compileCommandModule(source: string): Promise<CommandDef> {
  const validation = validateCommandSource(source);
  if (!validation.valid) {
    throw new SandboxError(`Validation failed:\n${validation.errors.join("\n")}`);
  }

  const tempDir = await mkdtemp(join(tmpdir(), "marina-cmd-"));
  const tempFile = join(tempDir, `cmd_${Date.now()}.ts`);

  try {
    await Bun.write(tempFile, source);

    const importPromise = import(tempFile);
    const timeoutPromise = Bun.sleep(COMPILE_TIMEOUT_MS).then(() => {
      throw new SandboxError(`Compilation timed out after ${COMPILE_TIMEOUT_MS}ms`);
    });

    const mod = await Promise.race([importPromise, timeoutPromise]);
    const cmd = mod.default ?? mod;

    validateCommandShape(cmd);

    return cmd as CommandDef;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Validate that a compiled module has the required CommandDef shape.
 */
function validateCommandShape(mod: unknown): asserts mod is CommandDef {
  if (!mod || typeof mod !== "object") {
    throw new SandboxError("Command module must export an object");
  }

  const obj = mod as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name.length === 0) {
    throw new SandboxError("Command module must have a non-empty 'name' string");
  }

  if (typeof obj.help !== "string") {
    throw new SandboxError("Command module must have a 'help' string");
  }

  if (typeof obj.handler !== "function") {
    throw new SandboxError("Command module must have a 'handler' function");
  }

  if (obj.aliases !== undefined) {
    if (!Array.isArray(obj.aliases)) {
      throw new SandboxError("Command 'aliases' must be an array if provided");
    }
  }
}

// ─── Default Command Template Source ─────────────────────────────────────────

export const DEFAULT_COMMAND_SOURCE = `/**
 * CommandContext API — available as 'ctx' in handler:
 *
 * ctx.send(entityId, message)    — send message to one entity
 * ctx.broadcast(message)         — send message to all in room
 * ctx.broadcastExcept(id, msg)   — send to all except one entity
 * ctx.getEntity(entityId)        — get entity by ID (or undefined)
 * ctx.findEntity(name)           — find entity by name (partial match)
 * ctx.entities                   — array of all entities in the room
 * ctx.roomId                     — current room ID (string property, not a function)
 * ctx.store.get(key)/set(key,v)  — room-scoped persistent key-value store
 * ctx.spawn({name,short,long})   — spawn NPC, returns EntityId
 * ctx.despawn(entityId)          — remove NPC from room
 * ctx.caller                     — { id, name, rank } of invoking entity
 * ctx.notes.recall(query)        — scored note retrieval
 * ctx.notes.add(content, importance?) — add a note
 * ctx.memory.get(key)/set(key,v) — core memory key-value
 * ctx.pool.recall(pool, query)   — recall from shared memory pool
 * ctx.pool.add(pool, content)    — add to shared memory pool
 * ctx.http.get(url)/post(url,b)  — rate-limited HTTP
 * ctx.mcp.call(server,tool,args) — call MCP tool
 *
 * input: { entity: EntityId, args: string, tokens: string[] }
 */
export default {
  name: "mycommand",
  help: "A custom command. Usage: mycommand [args]",
  handler(ctx, input) {
    ctx.send(input.entity, "Hello from mycommand! Args: " + input.args);
  },
};
`;

// ─── Default Room Template Source ────────────────────────────────────────────

export const DEFAULT_ROOM_SOURCE = `import type { RoomModule } from "../src/types";

const room: RoomModule = {
  short: "An empty room",
  long: "This room has not been described yet. A builder should use 'build modify' to set it up.",
  exits: {},
  items: {},
};

export default room;
`;
