/**
 * Tool for channel management
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { MarinaCommandToolContext } from "./marina-command";
import { createMarinaCommandTool } from "./marina-command";

const schema = Type.Object({
  subcommand: Type.Union(
    [
      Type.Literal("list"),
      Type.Literal("listall"),
      Type.Literal("join"),
      Type.Literal("leave"),
      Type.Literal("send"),
      Type.Literal("history"),
      Type.Literal("create"),
    ],
    {
      description: "Channel action: list, listall, join, leave, send, history, create",
    },
  ),
  channel: Type.Optional(
    Type.String({ description: "Channel name (required for join, leave, send, history, create)" }),
  ),
  message: Type.Optional(Type.String({ description: "Message to send (required for send)" })),
});

export type MarinaChannelInput = Static<typeof schema>;

export function createMarinaChannelTool(
  context: MarinaCommandToolContext,
): AgentTool<typeof schema> {
  const commandTool = createMarinaCommandTool(context);

  return {
    name: "marina_channel",
    label: "Channel",
    description: `Manage communication channels for inter-room messaging with other players and bots.

Subcommands:
- **list**: Show channels you've joined
- **listall**: Show all available channels
- **join** <channel>: Join a channel to send/receive messages
- **leave** <channel>: Leave a channel
- **send** <channel> <message>: Send a message to a channel
- **history** <channel> [count]: View recent messages in a channel
- **create** <channel>: Create a new channel`,
    parameters: schema,
    execute: async (
      toolCallId: string,
      { subcommand, channel, message }: MarinaChannelInput,
      signal?: AbortSignal,
    ) => {
      let command = `channel ${subcommand}`;
      if (channel) command += ` ${channel}`;
      if (message) command += ` ${message}`;
      return commandTool.execute(toolCallId, { command }, signal);
    },
  };
}
