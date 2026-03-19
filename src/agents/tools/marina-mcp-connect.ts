/**
 * Tool for managing external MCP connectors within Marina.
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { MarinaCommandToolContext } from "./marina-command";
import { createMarinaCommandTool } from "./marina-command";

const schema = Type.Object({
  subcommand: Type.Union(
    [
      Type.Literal("add"),
      Type.Literal("remove"),
      Type.Literal("list"),
      Type.Literal("tools"),
      Type.Literal("call"),
      Type.Literal("auth"),
    ],
    {
      description: "Connect action: add, remove, list, tools, call, auth",
    },
  ),
  args: Type.Optional(
    Type.String({
      description:
        "Arguments. For add: '<name> <url>' or '<name> stdio <cmd> [args]'. For remove/tools: '<name>'. For call: '<server> <tool> [json-args]'. For auth: '<name> bearer <token>' or '<name> header <key> <value>'.",
    }),
  ),
});

export type MarinaMcpConnectInput = Static<typeof schema>;

export function createMarinaMcpConnectTool(
  context: MarinaCommandToolContext,
): AgentTool<typeof schema> {
  const commandTool = createMarinaCommandTool(context);

  return {
    name: "marina_mcp",
    label: "MCP Connect",
    description: `Manage external MCP connectors for integrating external tools. Requires builder rank (rank 2+).

Subcommands:
- **add** <name> <url>: Register an HTTP MCP connector
- **add** <name> stdio <command> [args]: Register a stdio MCP connector (admin only)
- **remove** <name>: Unregister a connector
- **list**: List all registered connectors
- **tools** <name>: List available tools on a connector
- **call** <server> <tool> [json-args]: Call an external tool with optional JSON arguments
- **auth** <name> bearer <token>: Set bearer token authentication
- **auth** <name> header <key> <value>: Set custom header authentication`,
    parameters: schema,
    execute: async (
      toolCallId: string,
      { subcommand, args }: MarinaMcpConnectInput,
      signal?: AbortSignal,
    ) => {
      let command = `connect ${subcommand}`;
      if (args) command += ` ${args}`;
      return commandTool.execute(toolCallId, { command }, signal);
    },
  };
}
