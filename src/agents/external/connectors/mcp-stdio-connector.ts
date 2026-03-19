/**
 * MCP Stdio Connector — Starts a lightweight MCP server on stdio that exposes
 * Marina commands as MCP tools to the child agent.
 *
 * The child agent (e.g. Claude Code with --mcp-server) discovers Marina tools
 * through MCP protocol and calls them. This connector translates tool calls
 * to Marina commands and returns results.
 *
 * Architecture:
 * - The CHILD AGENT is the MCP client (it calls tools)
 * - This connector provides the MCP server config that the child agent connects to
 * - The bridge owns the WebSocket to Marina and executes commands on behalf of the agent
 */

import type { MarinaClient } from "../net/marina-client";
import { formatPerception } from "../net/formatter";

/** Tools exposed to the child agent via MCP. */
export interface MCPToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Build the Marina MCP server URL for external agents.
 * Points at the Marina server's MCP endpoint (default :3301/mcp).
 */
export function buildMcpServerUrl(wsUrl: string): string {
  // Convert ws://host:3300/ws → http://host:3301/mcp
  try {
    const url = new URL(wsUrl);
    const host = url.hostname;
    const mcpPort = Number.parseInt(url.port || "3300") + 1;
    return `http://${host}:${mcpPort}/mcp`;
  } catch {
    return "http://localhost:3301/mcp";
  }
}

/**
 * Build the core set of Marina MCP tools that external agents should discover.
 * These match the server's built-in commands.
 */
export function getMarinaToolSpecs(): MCPToolSpec[] {
  return [
    {
      name: "marina_look",
      description: "Look around the current room or examine a specific target",
      inputSchema: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "What to look at (optional — omit to look at the room)",
          },
        },
      },
    },
    {
      name: "marina_move",
      description: "Move in a direction (north, south, east, west, up, down)",
      inputSchema: {
        type: "object",
        properties: {
          direction: { type: "string", description: "Direction to move" },
        },
        required: ["direction"],
      },
    },
    {
      name: "marina_say",
      description: "Say something to everyone in the room",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "What to say" },
        },
        required: ["message"],
      },
    },
    {
      name: "marina_command",
      description:
        "Execute any Marina command (e.g. 'who', 'help', 'brief', 'inventory', 'tell Bob hello')",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string", description: "The command to execute" },
        },
        required: ["command"],
      },
    },
    {
      name: "marina_note",
      description: "Create a memory note in Marina (persists across sessions)",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "The note content" },
          type: {
            type: "string",
            description: "Note type: observation, reflection, plan, skill, principle",
          },
          importance: { type: "number", description: "Importance score 1-10" },
        },
        required: ["content"],
      },
    },
    {
      name: "marina_recall",
      description: "Recall memories from Marina's memory system",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for memories" },
          type: { type: "string", description: "Filter by note type" },
          limit: { type: "number", description: "Max results (default 5)" },
        },
      },
    },
  ];
}

/**
 * Execute an MCP tool call against the Marina client.
 * Returns the text result.
 */
export async function executeMcpTool(
  client: MarinaClient,
  toolName: string,
  args: Record<string, any>,
): Promise<string> {
  switch (toolName) {
    case "marina_look": {
      const result = await client.command(args.target ? `look ${args.target}` : "look");
      return result.map((p) => formatPerception(p, "plaintext") || "").join("\n");
    }
    case "marina_move": {
      const result = await client.command(args.direction);
      return result.map((p) => formatPerception(p, "plaintext") || "").join("\n");
    }
    case "marina_say": {
      await client.say(args.message);
      return `You said: ${args.message}`;
    }
    case "marina_command": {
      const result = await client.command(args.command);
      return result.map((p) => formatPerception(p, "plaintext") || "").join("\n");
    }
    case "marina_note": {
      const parts = ["note", args.content];
      if (args.type) parts.push(`type ${args.type}`);
      if (args.importance) parts.push(`importance ${args.importance}`);
      const result = await client.command(parts.join(" "));
      return result.map((p) => formatPerception(p, "plaintext") || "").join("\n");
    }
    case "marina_recall": {
      const parts = ["recall"];
      if (args.query) parts.push(args.query);
      if (args.type) parts.push(`type ${args.type}`);
      if (args.limit) parts.push(`limit ${args.limit}`);
      const result = await client.command(parts.join(" "));
      return result.map((p) => formatPerception(p, "plaintext") || "").join("\n");
    }
    default:
      return `Unknown tool: ${toolName}`;
  }
}
