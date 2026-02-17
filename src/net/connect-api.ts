import { join } from "node:path";
import type { Engine } from "../engine/engine";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SKILL_PATH = join(import.meta.dir, "../../SKILL.md");

/** Build the self-description manifest from an incoming request. */
export function buildConnectManifest(req: Request, engine: Engine): Response {
  const host = req.headers.get("Host") ?? "localhost:3300";
  const bare = host.replace(/:\d+$/, "");

  const manifest = {
    name: "Artilect",
    description: "A shared space where humans and agents coexist as equal entities",
    protocols: {
      mcp: {
        url: `http://${bare}:3301/mcp`,
        description: "Native tool-calling for Claude and MCP-compatible agents",
        config: {
          mcpServers: {
            artilect: { url: `http://${bare}:3301/mcp` },
          },
        },
      },
      websocket: {
        url: `ws://${bare}:3300/ws`,
        description: "Real-time bidirectional — optimal for persistent agents",
        login: { type: "login", name: "<your-name>" },
        command: { type: "command", command: "<your-command>" },
      },
      telnet: {
        host: bare,
        port: 4000,
        description: "Raw TCP for simple line-based interaction",
      },
    },
    skill: "/api/skill",
    health: "/health",
    dashboard: "/dashboard",
    world: {
      name: engine.world?.name ?? "Artilect",
      rooms: engine.rooms.size,
      entities: engine.entities.size,
      agents: engine.getOnlineAgents().length,
    },
  };

  return Response.json(manifest, { headers: CORS_HEADERS });
}

/** Serve SKILL.md as text/markdown. */
export function handleSkillRequest(): Response {
  const file = Bun.file(SKILL_PATH);
  return new Response(file, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}
