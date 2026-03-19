/**
 * Tool for navigation/movement
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { MarinaCommandToolContext } from "./marina-command";
import { createMarinaCommandTool } from "./marina-command";

const schema = Type.Object({
  direction: Type.String({
    description:
      "Direction to move (e.g., 'north', 'south', 'east', 'west', 'up', 'down', or any exit name)",
  }),
});

export type MarinaMoveInput = Static<typeof schema>;

export function createMarinaMoveTool(context: MarinaCommandToolContext): AgentTool<typeof schema> {
  const commandTool = createMarinaCommandTool(context);

  return {
    name: "marina_move",
    label: "Move",
    description: "Move in a direction. Use any direction shown in the room's exit list.",
    parameters: schema,
    execute: async (toolCallId: string, { direction }: MarinaMoveInput, signal?: AbortSignal) => {
      return commandTool.execute(toolCallId, { command: direction }, signal);
    },
  };
}
