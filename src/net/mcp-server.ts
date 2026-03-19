import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { RateLimiter } from "../auth/rate-limiter";
import type { Engine } from "../engine/engine";
import type { Connection, EntityId, Perception } from "../types";
import { buildConnectManifest, handleSkillRequest } from "./connect-api";

// ─── Session State ────────────────────────────────────────────────────────────

interface McpSession {
  connId: string;
  entityId: EntityId | null;
  perceptionBuffer: Perception[];
  transport: WebStandardStreamableHTTPServerTransport;
  mcp: McpServer;
}

let mcpIdCounter = 0;

import { formatPerception } from "./formatter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function drainPerceptions(session: McpSession): string {
  const perceptions = session.perceptionBuffer.splice(0);
  if (perceptions.length === 0) return "(no output)";
  return perceptions.map((p) => formatPerception(p, "markdown")).join("\n\n");
}

function requireEntity(session: McpSession): { entityId: EntityId } | { error: string } {
  if (!session.entityId) {
    return { error: "Not logged in. Use the 'login' tool first." };
  }
  return { entityId: session.entityId };
}

// ─── McpServerAdapter ─────────────────────────────────────────────────────────

export class McpServerAdapter {
  // biome-ignore lint: Bun.serve return type
  private server: any = null;
  private sessions = new Map<string, McpSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private engine: Engine,
    private port: number,
    private rateLimiter?: RateLimiter,
  ) {}

  start(): void {
    const engine = this.engine;
    const sessions = this.sessions;
    const self = this;

    this.server = Bun.serve({
      port: this.port,
      idleTimeout: 255,

      async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/health") {
          return Response.json({
            status: "ok",
            protocol: "mcp",
            sessions: sessions.size,
            rooms: engine.rooms.size,
            entities: engine.entities.size,
          });
        }

        // Connect manifest
        if (url.pathname === "/api/connect") {
          return buildConnectManifest(req, engine);
        }

        // Skill document
        if (url.pathname === "/api/skill") {
          return handleSkillRequest();
        }

        if (url.pathname === "/mcp") {
          const sessionId = req.headers.get("mcp-session-id");
          const session = sessionId ? sessions.get(sessionId) : undefined;

          if (session) {
            return session.transport.handleRequest(req);
          }

          // New session
          const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized(newSessionId: string) {
              const connId = `mcp_${++mcpIdCounter}`;
              const newSession: McpSession = {
                connId,
                entityId: null,
                perceptionBuffer: [],
                transport,
                mcp,
              };

              const conn: Connection = {
                id: connId,
                protocol: "mcp",
                entity: null,
                connectedAt: Date.now(),
                send(perception: Perception) {
                  newSession.perceptionBuffer.push(perception);
                },
                close() {
                  sessions.delete(newSessionId);
                  engine.removeConnection(connId);
                },
              };

              engine.addConnection(conn);
              sessions.set(newSessionId, newSession);
            },
            onsessionclosed(closedSessionId: string) {
              const s = sessions.get(closedSessionId);
              if (s) {
                engine.removeConnection(s.connId);
                sessions.delete(closedSessionId);
              }
            },
          });

          const mcp = self.createMcpServer();
          await mcp.connect(transport);

          return transport.handleRequest(req);
        }

        return new Response("Marina MCP Server — connect via MCP protocol at /mcp", {
          status: 200,
        });
      },
    });

    // Periodic cleanup of stale MCP sessions (every 5 minutes)
    this.cleanupTimer = setInterval(() => this.cleanupStaleSessions(), 300_000);

    console.log(`MCP server listening on http://localhost:${this.port}/mcp`);
  }

  /** Remove MCP sessions whose connections are no longer in the engine. */
  private cleanupStaleSessions(): void {
    for (const [sessionId, session] of this.sessions) {
      // Check if the engine still knows about this connection
      const connections = this.engine.getConnections();
      if (!connections.has(session.connId)) {
        this.sessions.delete(sessionId);
        session.mcp.close().catch(() => {});
      }
    }
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    for (const [, session] of this.sessions) {
      this.engine.removeConnection(session.connId);
      session.mcp.close().catch(() => {});
    }
    this.sessions.clear();

    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  // ─── MCP Server & Tool Registration ──────────────────────────────────────

  private createMcpServer(): McpServer {
    const engine = this.engine;
    const sessions = this.sessions;
    const rateLimiter = this.rateLimiter;

    const mcp = new McpServer(
      { name: "marina", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );

    function getSession(extra: { sessionId?: string }): McpSession | undefined {
      if (!extra.sessionId) return undefined;
      return sessions.get(extra.sessionId);
    }

    // ── login ──────────────────────────────────────────────────────────────

    mcp.tool(
      "login",
      "Log into Marina with a character name. Must be called before other commands.",
      { name: z.string().describe("Character name (2-20 alphanumeric characters)") },
      async ({ name }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        if (session.entityId) {
          return {
            content: [
              { type: "text" as const, text: `Already logged in. Entity: ${session.entityId}` },
            ],
          };
        }
        const result = engine.login(session.connId, name);
        if ("error" in result) {
          return { content: [{ type: "text" as const, text: result.error }] };
        }
        session.entityId = result.entityId;
        engine.sendLook(result.entityId);
        engine.sendBrief(result.entityId);
        const output = drainPerceptions(session);
        const tokenNote = result.token ? `\nSession token: \`${result.token}\`` : "";
        const onboardHint =
          "\n\nNext steps: `help` lists all commands. `pool guide recall getting started` for orientation. `brief full` for world state.";
        return {
          content: [
            {
              type: "text" as const,
              text: `Logged in as **${name}** (${result.entityId}).${tokenNote}${onboardHint}\n\n${output}`,
            },
          ],
        };
      },
    );

    // ── auth (reconnect with token) ──────────────────────────────────────

    mcp.tool(
      "auth",
      "Reconnect using a previously issued session token.",
      { token: z.string().describe("Session token from a previous login") },
      async ({ token }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        if (session.entityId) {
          return {
            content: [
              { type: "text" as const, text: `Already logged in. Entity: ${session.entityId}` },
            ],
          };
        }
        const result = engine.reconnect(session.connId, token);
        if ("error" in result) {
          return { content: [{ type: "text" as const, text: result.error }] };
        }
        session.entityId = result.entityId;
        engine.sendLook(result.entityId);
        engine.sendBrief(result.entityId);
        const output = drainPerceptions(session);
        return {
          content: [
            {
              type: "text" as const,
              text: `Reconnected as **${result.name}** (${result.entityId}).\n\n${output}`,
            },
          ],
        };
      },
    );

    // ── look ───────────────────────────────────────────────────────────────

    mcp.tool(
      "look",
      "Look at the current room or examine a specific target.",
      { target: z.string().optional().describe("Optional target to look at") },
      async ({ target }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        const check = requireEntity(session);
        if ("error" in check) {
          return { content: [{ type: "text" as const, text: check.error }] };
        }
        const cmd = target ? `look ${target}` : "look";
        engine.processCommand(check.entityId, cmd);
        return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
      },
    );

    // ── move ───────────────────────────────────────────────────────────────

    mcp.tool(
      "move",
      "Move in a direction (north, south, east, west, up, down, etc.).",
      { direction: z.string().describe("Direction to move") },
      async ({ direction }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        const check = requireEntity(session);
        if ("error" in check) {
          return { content: [{ type: "text" as const, text: check.error }] };
        }
        engine.processCommand(check.entityId, direction);
        return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
      },
    );

    // ── say ────────────────────────────────────────────────────────────────

    mcp.tool(
      "say",
      "Say something to everyone in the current room.",
      { message: z.string().describe("Message to say") },
      async ({ message }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        const check = requireEntity(session);
        if ("error" in check) {
          return { content: [{ type: "text" as const, text: check.error }] };
        }
        engine.processCommand(check.entityId, `say ${message}`);
        return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
      },
    );

    // ── tell ───────────────────────────────────────────────────────────────

    mcp.tool(
      "tell",
      "Send a private message to another entity.",
      {
        target: z.string().describe("Name of the entity to message"),
        message: z.string().describe("Private message to send"),
      },
      async ({ target, message }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        const check = requireEntity(session);
        if ("error" in check) {
          return { content: [{ type: "text" as const, text: check.error }] };
        }
        engine.processCommand(check.entityId, `tell ${target} ${message}`);
        return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
      },
    );

    // ── who ────────────────────────────────────────────────────────────────

    mcp.tool("who", "List all currently online entities.", {}, async (_args, extra) => {
      const session = getSession(extra);
      if (!session) {
        return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
      }
      const check = requireEntity(session);
      if ("error" in check) {
        return { content: [{ type: "text" as const, text: check.error }] };
      }
      engine.processCommand(check.entityId, "who");
      return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
    });

    // ── examine ────────────────────────────────────────────────────────────

    mcp.tool(
      "examine",
      "Examine an entity or item in detail.",
      { target: z.string().describe("Name of the entity or item to examine") },
      async ({ target }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        const check = requireEntity(session);
        if ("error" in check) {
          return { content: [{ type: "text" as const, text: check.error }] };
        }
        engine.processCommand(check.entityId, `examine ${target}`);
        return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
      },
    );

    // ── inventory ──────────────────────────────────────────────────────────

    mcp.tool("inventory", "Check your inventory.", {}, async (_args, extra) => {
      const session = getSession(extra);
      if (!session) {
        return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
      }
      const check = requireEntity(session);
      if ("error" in check) {
        return { content: [{ type: "text" as const, text: check.error }] };
      }
      engine.processCommand(check.entityId, "inventory");
      return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
    });

    // ── help ───────────────────────────────────────────────────────────────

    mcp.tool(
      "help",
      "Get help about available commands.",
      { command: z.string().optional().describe("Specific command to get help for") },
      async ({ command }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        const check = requireEntity(session);
        if ("error" in check) {
          return { content: [{ type: "text" as const, text: check.error }] };
        }
        const cmd = command ? `help ${command}` : "help";
        engine.processCommand(check.entityId, cmd);
        return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
      },
    );

    // ── quit ───────────────────────────────────────────────────────────────

    mcp.tool("quit", "Disconnect from Marina and end your session.", {}, async (_args, extra) => {
      const session = getSession(extra);
      if (!session) {
        return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
      }
      if (!session.entityId) {
        return { content: [{ type: "text" as const, text: "Not logged in." }] };
      }
      const entityId = session.entityId;
      session.entityId = null;
      engine.removeConnection(session.connId);
      return {
        content: [
          {
            type: "text" as const,
            text: `Disconnected entity ${entityId}. Session ended.`,
          },
        ],
      };
    });

    // ── command (escape hatch) ─────────────────────────────────────────────

    mcp.tool(
      "command",
      "Send any raw command to the game engine.",
      { input: z.string().describe("Raw command string to send") },
      async ({ input }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        const check = requireEntity(session);
        if ("error" in check) {
          return { content: [{ type: "text" as const, text: check.error }] };
        }
        if (rateLimiter && !rateLimiter.consume(check.entityId)) {
          return {
            content: [{ type: "text" as const, text: "Rate limited. Please slow down." }],
          };
        }
        engine.processCommand(check.entityId, input);
        return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
      },
    );

    // ── Phase 2 coordination tools ─────────────────────────────────────────

    mcp.tool(
      "channel",
      "Manage channels: list, join, leave, send messages, view history. Usage: channel <subcommand> [args]",
      {
        input: z.string().describe("Channel subcommand and arguments, e.g. 'send general Hello!'"),
      },
      async ({ input }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        const check = requireEntity(session);
        if ("error" in check) {
          return { content: [{ type: "text" as const, text: check.error }] };
        }
        engine.processCommand(check.entityId, `channel ${input}`);
        return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
      },
    );

    mcp.tool(
      "board",
      "Manage boards: list, read, post, reply, search, vote, pin, archive. Usage: board <subcommand> [args]",
      {
        input: z
          .string()
          .describe("Board subcommand and arguments, e.g. 'post general My Title | Body text'"),
      },
      async ({ input }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        const check = requireEntity(session);
        if ("error" in check) {
          return { content: [{ type: "text" as const, text: check.error }] };
        }
        engine.processCommand(check.entityId, `board ${input}`);
        return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
      },
    );

    mcp.tool(
      "group",
      "Manage groups/guilds: list, info, create, join, leave, invite, kick, promote, demote, disband. Usage: group <subcommand> [args]",
      {
        input: z
          .string()
          .describe("Group subcommand and arguments, e.g. 'create mygroup My Group Name'"),
      },
      async ({ input }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        const check = requireEntity(session);
        if ("error" in check) {
          return { content: [{ type: "text" as const, text: check.error }] };
        }
        engine.processCommand(check.entityId, `group ${input}`);
        return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
      },
    );

    mcp.tool(
      "task",
      "Manage tasks: list, info, create, claim, submit, approve, reject, cancel. Usage: task <subcommand> [args]",
      {
        input: z
          .string()
          .describe(
            "Task subcommand and arguments, e.g. 'create Fix the bug | Detailed description'",
          ),
      },
      async ({ input }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        const check = requireEntity(session);
        if ("error" in check) {
          return { content: [{ type: "text" as const, text: check.error }] };
        }
        engine.processCommand(check.entityId, `task ${input}`);
        return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
      },
    );

    mcp.tool(
      "macro",
      "Manage macros: list, info, create, edit, delete, run, share, trigger. Usage: macro <subcommand> [args]",
      {
        input: z
          .string()
          .describe(
            "Macro subcommand and arguments, e.g. 'create patrol look ; north ; look ; south'",
          ),
      },
      async ({ input }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        const check = requireEntity(session);
        if ("error" in check) {
          return { content: [{ type: "text" as const, text: check.error }] };
        }
        engine.processCommand(check.entityId, `macro ${input}`);
        return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
      },
    );

    mcp.tool(
      "build",
      "In-game building: room, modify, link, unlink, code, validate, reload, audit, revert, destroy, template. Usage: build <subcommand> [args]",
      {
        input: z
          .string()
          .describe("Build subcommand and arguments, e.g. 'room my/new/room A Custom Room'"),
      },
      async ({ input }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        const check = requireEntity(session);
        if ("error" in check) {
          return { content: [{ type: "text" as const, text: check.error }] };
        }
        engine.processCommand(check.entityId, `build ${input}`);
        return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
      },
    );

    // ── batch (multi-command execution) ───────────────────────────────────

    mcp.tool(
      "batch",
      "Execute multiple commands in sequence, separated by semicolons. Returns combined output. Example: look ; north ; look ; note Found something",
      {
        input: z.string().describe("Commands separated by semicolons, e.g. 'look ; north ; look'"),
      },
      async ({ input }, extra) => {
        const session = getSession(extra);
        if (!session) {
          return { content: [{ type: "text" as const, text: "Error: no active MCP session." }] };
        }
        const check = requireEntity(session);
        if ("error" in check) {
          return { content: [{ type: "text" as const, text: check.error }] };
        }
        engine.processCommand(check.entityId, `batch ${input}`);
        return { content: [{ type: "text" as const, text: drainPerceptions(session) }] };
      },
    );

    return mcp;
  }
}
