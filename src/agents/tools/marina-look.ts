/**
 * Tool for looking at room or target
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { MarinaCommandToolContext } from "./marina-command";
import { createMarinaCommandTool } from "./marina-command";

const schema = Type.Object({
  target: Type.Optional(
    Type.String({
      description: "Optional target to examine (e.g., 'fountain', 'sign', entity name)",
    }),
  ),
});

export type MarinaLookInput = Static<typeof schema>;

export function createMarinaLookTool(context: MarinaCommandToolContext): AgentTool<typeof schema> {
  const commandTool = createMarinaCommandTool(context);

  return {
    name: "marina_look",
    label: "Look",
    description:
      "Examine your surroundings or a specific item/entity. Without a target, shows the current room description with exits, items, and entities present.",
    parameters: schema,
    execute: async (toolCallId: string, { target }: MarinaLookInput, signal?: AbortSignal) => {
      const command = target ? `look ${target}` : "look";
      return commandTool.execute(toolCallId, { command }, signal);
    },
  };
}
