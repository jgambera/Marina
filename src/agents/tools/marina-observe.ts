/**
 * Tool for agent observation and introspection.
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { MarinaCommandToolContext } from "./marina-command";
import { createMarinaCommandTool } from "./marina-command";

const schema = Type.Object({
  subcommand: Type.Union([Type.Literal("entity"), Type.Literal("stats"), Type.Literal("log")], {
    description:
      "Observe action: entity (inspect an entity), stats (server statistics), log (command log)",
  }),
  target: Type.Optional(
    Type.String({
      description: "Entity name to observe (required for entity and log subcommands)",
    }),
  ),
});

export type MarinaObserveInput = Static<typeof schema>;

export function createMarinaObserveTool(
  context: MarinaCommandToolContext,
): AgentTool<typeof schema> {
  const commandTool = createMarinaCommandTool(context);

  return {
    name: "marina_observe",
    label: "Observe",
    description: `Observe agents and server activity. Requires builder rank (rank 2+) for stats, architect (rank 3+) for entity inspection, admin (rank 4) for logs.

Subcommands:
- **stats**: Server statistics — online agents, total commands, commands/min, top rooms
- **entity** <name>: Observe an entity — room, rank, last command, session duration
- **log** <name>: View last 20 commands from an entity (admin only)`,
    parameters: schema,
    execute: async (
      toolCallId: string,
      { subcommand, target }: MarinaObserveInput,
      signal?: AbortSignal,
    ) => {
      let command: string;
      if (subcommand === "stats") {
        command = "observe stats";
      } else if (subcommand === "log") {
        command = `observe log ${target}`;
      } else {
        command = `observe ${target}`;
      }
      return commandTool.execute(toolCallId, { command }, signal);
    },
  };
}
