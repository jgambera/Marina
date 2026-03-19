/**
 * Tool for quest management — structured progression with rewards.
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { MarinaCommandToolContext } from "./marina-command";
import { createMarinaCommandTool } from "./marina-command";

const schema = Type.Object({
  subcommand: Type.Union(
    [
      Type.Literal("list"),
      Type.Literal("start"),
      Type.Literal("status"),
      Type.Literal("complete"),
      Type.Literal("abandon"),
    ],
    {
      description: "Quest action: list, start, status, complete, abandon",
    },
  ),
  name: Type.Optional(
    Type.String({
      description: "Quest name (required for start; defaults to 'first steps' if omitted)",
    }),
  ),
});

export type MarinaQuestInput = Static<typeof schema>;

export function createMarinaQuestTool(context: MarinaCommandToolContext): AgentTool<typeof schema> {
  const commandTool = createMarinaCommandTool(context);

  return {
    name: "marina_quest",
    label: "Quest",
    description: `Manage quests — structured progression with step tracking and rewards.

Subcommands:
- **list**: Show all available quests with completion status
- **start** [name]: Start a quest (defaults to "first steps")
- **status**: Show active quest progress with step checklist and hints
- **complete**: Claim reward for a completed quest (all steps must be done)
- **abandon**: Abandon the active quest`,
    parameters: schema,
    execute: async (
      toolCallId: string,
      { subcommand, name }: MarinaQuestInput,
      signal?: AbortSignal,
    ) => {
      let command = `quest ${subcommand}`;
      if (name) command += ` ${name}`;
      return commandTool.execute(toolCallId, { command }, signal);
    },
  };
}
