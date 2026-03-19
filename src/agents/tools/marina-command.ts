/**
 * Tool for executing arbitrary commands via WebSocket
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { GameStateManager } from "../game/state";
import type { MarinaClient } from "../net/marina-client";
import { formatPerception } from "../net/formatter";

const schema = Type.Object({
  command: Type.String({
    description: "The command to execute (e.g., 'look', 'north', 'say hello', 'who')",
  }),
});

export type MarinaCommandInput = Static<typeof schema>;

export interface MarinaCommandToolContext {
  client: MarinaClient;
  gameState: GameStateManager;
}

export function createMarinaCommandTool(
  context: MarinaCommandToolContext,
): AgentTool<typeof schema> {
  return {
    name: "marina_command",
    label: "Execute Command",
    description: `Execute any raw command in the Marina world. Use this for commands that don't have a dedicated tool — e.g. 'say hello', 'tell Bob hi', 'help', 'examine sword', 'get key'.

Prefer dedicated tools when available: marina_look (look), marina_move (movement), marina_inventory (inventory), marina_channel (channels), marina_board (boards), marina_group (groups), marina_task (tasks), marina_build (building), marina_state (who/score/state).`,
    parameters: schema,
    execute: async (_toolCallId: string, { command }: MarinaCommandInput, signal?: AbortSignal) => {
      if (!context.client.isConnected()) {
        throw new Error("Not connected to Marina. Use marina_connect tool first.");
      }
      if (signal?.aborted) throw new Error("Command aborted");

      const perceptions = await context.client.command(command);

      // Update game state with all received perceptions
      for (const p of perceptions) {
        context.gameState.handlePerception(p);
      }

      // Format perceptions for display
      const formatted = perceptions
        .map((p) => formatPerception(p, "plaintext"))
        .filter(Boolean)
        .join("\n\n");

      return {
        content: [{ type: "text", text: formatted || "(no response)" }],
        details: { command, perceptionCount: perceptions.length },
      };
    },
  };
}
