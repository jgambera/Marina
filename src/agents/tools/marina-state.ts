/**
 * Tool for querying current game state
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { GameStateManager } from "../game/state";
import type { MarinaClient } from "../net/marina-client";
import { formatPerception } from "../net/formatter";

const schema = Type.Object({
  query: Type.Optional(
    Type.Union([Type.Literal("state"), Type.Literal("who"), Type.Literal("score")], {
      description:
        "What to query: 'state' (game state summary), 'who' (online players), 'score' (character stats). Default: state",
    }),
  ),
});

export type MarinaStateInput = Static<typeof schema>;

export interface MarinaStateToolContext {
  client: MarinaClient;
  gameState: GameStateManager;
}

export function createMarinaStateTool(context: MarinaStateToolContext): AgentTool<typeof schema> {
  return {
    name: "marina_state",
    label: "Game State",
    description: `Query game information.

- **state** (default): Returns locally cached data — your location, entities present, recent events. Fast, no server round-trip.
- **who**: Sends 'who' to the server — returns the list of currently online players and agents.
- **score**: Sends 'score' to the server — returns your character stats and attributes.`,
    parameters: schema,
    execute: async (
      _toolCallId: string,
      { query = "state" }: MarinaStateInput,
      signal?: AbortSignal,
    ) => {
      if (query === "state") {
        const summary = context.gameState.getContextSummary();
        return {
          content: [{ type: "text", text: summary || "No game state available" }],
          details: { query },
        };
      }

      if (query === "who" || query === "score") {
        if (!context.client.isConnected()) {
          throw new Error("Not connected to Marina");
        }
        const perceptions = await context.client.command(query);
        for (const p of perceptions) {
          context.gameState.handlePerception(p);
        }
        const formatted = perceptions
          .map((p) => formatPerception(p, "plaintext"))
          .filter(Boolean)
          .join("\n\n");
        return {
          content: [{ type: "text", text: formatted || `(no response from ${query})` }],
          details: { query },
        };
      }

      return {
        content: [{ type: "text", text: `Unknown query type: ${query}` }],
        details: { query },
      };
    },
  };
}
