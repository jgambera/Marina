/**
 * Tool for checking inventory
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { MarinaCommandToolContext } from "./marina-command";
import { createMarinaCommandTool } from "./marina-command";

const schema = Type.Object({});

export type MarinaInventoryInput = Static<typeof schema>;

export function createMarinaInventoryTool(
  context: MarinaCommandToolContext,
): AgentTool<typeof schema> {
  const commandTool = createMarinaCommandTool(context);

  return {
    name: "marina_inventory",
    label: "Inventory",
    description: "Check your current inventory to see what items you're carrying.",
    parameters: schema,
    execute: async (toolCallId: string, _params: MarinaInventoryInput, signal?: AbortSignal) => {
      return commandTool.execute(toolCallId, { command: "inventory" }, signal);
    },
  };
}
