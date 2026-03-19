/**
 * Tool for macro management
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { MarinaCommandToolContext } from "./marina-command";
import { createMarinaCommandTool } from "./marina-command";

const schema = Type.Object({
  subcommand: Type.Union(
    [
      Type.Literal("list"),
      Type.Literal("info"),
      Type.Literal("create"),
      Type.Literal("edit"),
      Type.Literal("delete"),
      Type.Literal("run"),
      Type.Literal("share"),
      Type.Literal("trigger"),
    ],
    {
      description: "Macro action: list, info, create, edit, delete, run, share, trigger",
    },
  ),
  args: Type.Optional(
    Type.String({
      description:
        "Arguments. Examples: 'create patrol | north; look; south; look', 'run patrol', 'trigger patrol onTick'",
    }),
  ),
});

export type MarinaMacroInput = Static<typeof schema>;

export function createMarinaMacroTool(context: MarinaCommandToolContext): AgentTool<typeof schema> {
  const commandTool = createMarinaCommandTool(context);

  return {
    name: "marina_macro",
    label: "Macro",
    description:
      "Manage command macros for automating repetitive sequences. Macros can be triggered manually, on a timer, or by events.",
    parameters: schema,
    execute: async (
      toolCallId: string,
      { subcommand, args }: MarinaMacroInput,
      signal?: AbortSignal,
    ) => {
      let command = `macro ${subcommand}`;
      if (args) command += ` ${args}`;
      return commandTool.execute(toolCallId, { command }, signal);
    },
  };
}
