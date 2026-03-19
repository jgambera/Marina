/**
 * Tool for connecting to Marina server
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { GameStateManager } from "../game/state";
import type { MarinaClient } from "../net/marina-client";

const schema = Type.Object({
  name: Type.String({ description: "Character name to login with (2-20 alphanumeric characters)" }),
  token: Type.Optional(
    Type.String({ description: "Session token for reconnection (if available)" }),
  ),
});

export type MarinaConnectInput = Static<typeof schema>;

export interface MarinaConnectToolContext {
  client: MarinaClient;
  gameState: GameStateManager;
}

export function createMarinaConnectTool(
  context: MarinaConnectToolContext,
): AgentTool<typeof schema> {
  return {
    name: "marina_connect",
    label: "Connect to Marina",
    description:
      "Connect to the Marina world via WebSocket and login with a character name. Use a token to reconnect to an existing session.",
    parameters: schema,
    execute: async (
      _toolCallId: string,
      { name, token }: MarinaConnectInput,
      signal?: AbortSignal,
    ) => {
      if (context.client.isConnected() && context.client.getSession()) {
        const session = context.client.getSession()!;
        return {
          content: [
            {
              type: "text",
              text: `Already connected as ${session.name} (entity: ${session.entityId})`,
            },
          ],
          details: { connected: true, ...session },
        };
      }

      try {
        context.gameState.setConnectionStatus("connecting", context.client.getWsUrl());

        let session;
        if (token) {
          session = await context.client.reconnect(token);
        } else {
          session = await context.client.connect(name);
        }

        context.gameState.setSession(session.entityId, session.name, session.token);

        return {
          content: [
            {
              type: "text",
              text: `Connected as ${session.name} (entity: ${session.entityId})\nToken: ${session.token}\n\nYou are now in the Marina world. Use 'look' to see your surroundings.`,
            },
          ],
          details: { connected: true, ...session },
        };
      } catch (error) {
        context.gameState.setConnectionStatus("disconnected");
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to connect: ${msg}`);
      }
    },
  };
}
